import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { GoogleGenerativeAI } from '@google/generative-ai';

const DB_PATH = path.join(process.cwd(), 'data.json');
const SUMMARY_PATH = path.join(process.cwd(), 'scraped_data', 'summary.json');

/**
 * Downloads a file from a URL to a local path
 */
async function downloadMediaFile(url: string, targetPath: string): Promise<boolean> {
  if (url.startsWith('data:')) return false;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://discord.com/'
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ Failed to download ${url}: ${response.status} ${response.statusText}`);
      return false;
    }

    const body = response.body;
    if (!body) return false;

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const fileStream = createWriteStream(targetPath);
    await finished(Readable.fromWeb(body as any).pipe(fileStream));
    
    return true;
  } catch (error) {
    console.error(`❌ Error downloading ${url}:`, error);
    return false;
  }
}

/**
 * Discord Puppeteer Scraper
 * 
 * Logs into Discord using email + password via the login form,
 * navigates to the specified channels, and scrapes messages from the DOM.
 * 
 * Usage:
 *   npm run scrape
 * 
 * Required .env vars:
 *   DISCORD_EMAIL     - Your Discord account email
 *   DISCORD_PASSWORD  - Your Discord account password
 *   DISCORD_SCRAPE_CHANNELS - Comma-separated list of "guildId/channelId" pairs
 *                             e.g. "123456789/987654321,123456789/111222333"
 */

interface ScrapedMessage {
  id: string;
  source: string;
  sourceId: string;
  author: string;
  authorId: string | null;
  channel: string | null;
  content: string;
  mediaUrls: string | null;
  timestamp: string;
}

async function scrape() {
  const email = process.env.DISCORD_EMAIL;
  const password = process.env.DISCORD_PASSWORD;
  const channelPairs = process.env.DISCORD_SCRAPE_CHANNELS
    ?.split(',')
    .map(s => s.trim())
    .filter(Boolean) || [];

  if (!email || !password) {
    console.error('❌ DISCORD_EMAIL or DISCORD_PASSWORD is missing in .env');
    console.error('   Add these to your .env file:');
    console.error('   DISCORD_EMAIL="your-discord-email@example.com"');
    console.error('   DISCORD_PASSWORD="your-discord-password"');
    process.exit(1);
  }

  if (channelPairs.length === 0) {
    console.error('❌ DISCORD_SCRAPE_CHANNELS is missing in .env');
    console.error('   Format: DISCORD_SCRAPE_CHANNELS="guildId/channelId,guildId/channelId"');
    console.error('   Tip: Open the channel in a browser, the URL will be:');
    console.error('   https://discord.com/channels/{guildId}/{channelId}');
    process.exit(1);
  }

  console.log('🚀 Launching Puppeteer Scraper...');
  console.log(`📡 Target channels: ${channelPairs.join(', ')}`);

  const browser = await puppeteer.launch({
    headless: false, // Use headed mode so you can solve captchas if needed
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Mask automation signals
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Remove webdriver flag to avoid detection
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  try {
    // Step 1: Navigate to Discord login page
    console.log('🔑 Navigating to Discord login...');
    await page.goto('https://discord.com/login', { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(2000);

    // Step 2: Fill in login form
    console.log('📝 Filling in credentials...');

    // Wait for the email input field
    const emailSelector = 'input[name="email"]';
    await page.waitForSelector(emailSelector, { timeout: 15000 });
    await delay(500);

    // Type email with realistic delays
    await page.click(emailSelector);
    await page.type(emailSelector, email, { delay: 50 + Math.random() * 50 });

    await delay(300);

    // Type password
    const passwordSelector = 'input[name="password"]';
    await page.waitForSelector(passwordSelector, { timeout: 5000 });
    await page.click(passwordSelector);
    await page.type(passwordSelector, password, { delay: 50 + Math.random() * 50 });

    await delay(500);

    // Click the login button
    const loginButtonSelector = 'button[type="submit"]';
    await page.waitForSelector(loginButtonSelector, { timeout: 5000 });
    await page.click(loginButtonSelector);

    console.log('⏳ Waiting for login to complete...');

    // Step 3: Wait for successful login (URL changes to /channels)
    // This may take a while if there's a captcha or 2FA prompt
    try {
      await page.waitForFunction(
        () => window.location.pathname.startsWith('/channels'),
        { timeout: 120000 } // 2 minute timeout to allow for captcha/2FA
      );
    } catch {
      const currentUrl = page.url();
      if (currentUrl.includes('/login')) {
        // Check for common error states
        const errorText = await page.evaluate(() => {
          const errorEl = document.querySelector('[class*="error"]') || 
                          document.querySelector('[class*="Error"]');
          return (errorEl as HTMLElement)?.innerText || '';
        });
        
        if (errorText) {
          console.error(`❌ Login failed: ${errorText}`);
        } else {
          console.error('❌ Login timed out. Possible causes:');
          console.error('   - Captcha was not solved (the browser window should be visible)');
          console.error('   - 2FA is required (enter the code in the browser window)');
          console.error('   - Invalid credentials');
        }
        await browser.close();
        process.exit(1);
      }
    }

    // Additional wait to ensure Discord fully loads
    await delay(4000);

    // Verify we're logged in
    const currentUrl = page.url();
    if (!currentUrl.includes('/channels')) {
      console.error('❌ Login failed. Current URL:', currentUrl);
      await browser.close();
      process.exit(1);
    }
    console.log('✅ Logged in successfully!');

    // Step 4: Scrape each channel
    let totalScraped = 0;
    for (const pair of channelPairs) {
      const [guildId, channelId] = pair.split('/');
      if (!guildId || !channelId) {
        console.log(`⚠️ Invalid format: "${pair}". Expected "guildId/channelId". Skipping.`);
        continue;
      }

      const channelUrl = `https://discord.com/channels/${guildId}/${channelId}`;
      console.log(`\n📡 Navigating to ${channelUrl}...`);

      await page.goto(channelUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await delay(3000);

      // Aggressively scroll up from latest to accumulate TARGET_MESSAGES
      const TARGET_MESSAGES = 200;
      const MAX_STALE_ROUNDS = 4;
      let staleRounds = 0;
      let scrollIteration = 0;
      
      // Since Discord virtualizes its DOM (removes off-screen messages),
      // we must extract messages on every scroll step and accumulate them.
      const accumulatedMessages = new Map<string, ScrapedMessage>();

      console.log(`📜 Scrolling up from latest to accumulate ${TARGET_MESSAGES}+ messages...`);

      while (staleRounds < MAX_STALE_ROUNDS) {
        // Extract whatever is currently in the DOM
        const currentBatch = await page.evaluate((chId: string) => {
          const results: ScrapedMessage[] = [];
          const messageGroups = document.querySelectorAll('[id^="chat-messages-"]');

          messageGroups.forEach((group) => {
            const messageId = group.id.replace('chat-messages-', '');
            const usernameEl = group.querySelector('[class*="username_"]');
            const contentEl = group.querySelector('[id^="message-content-"]');
            const timestampEl = group.querySelector('time');
            
            const media: { type: string; url: string; poster?: string | null; name?: string; size?: string; title?: string; description?: string; thumbnail?: string | null; provider?: string }[] = [];

            // Images (High-res URLs and fallbacks)
            const imageContainers = group.querySelectorAll('[class*="imageWrapper_"], [class*="mediaAttachmentsContainer"]');
            imageContainers.forEach(container => {
              // Priority 1: High-res "Original Link" anchor
              const originalLink = container.querySelector('a[class*="originalLink_"]');
              if (originalLink && (originalLink as HTMLAnchorElement).href) {
                const href = (originalLink as HTMLAnchorElement).href;
                if (!media.some(m => m.url === href)) {
                  media.push({ type: 'image', url: href });
                }
              }

              // Priority 2: Real img element (filter out blurred placeholders)
              const imgs = container.querySelectorAll('img');
              imgs.forEach(img => {
                const src = (img as HTMLImageElement).src;
                const isPlaceholder = img.className.includes('placeholder') || src.startsWith('data:');
                if (src && !isPlaceholder && !src.includes('emoji') && !src.includes('avatar')) {
                  if (!media.some(m => m.url === src)) {
                    media.push({ type: 'image', url: src });
                  }
                }
              });
            });

            // Videos (Attachments and embeds)
            const videoEls = group.querySelectorAll('video');
            videoEls.forEach(video => {
              const src = (video as HTMLVideoElement).src || video.querySelector('source')?.getAttribute('src');
              if (src && !src.startsWith('data:')) {
                if (!media.some(m => m.url === src)) {
                  media.push({ type: 'video', url: src, poster: (video as HTMLVideoElement).poster || null });
                }
              }
            });

            // GIFs
            const gifEls = group.querySelectorAll('[class*="imageWrapper_"] video[class*="gif"]');
            gifEls.forEach(gif => {
              const src = (gif as HTMLVideoElement).src;
              if (src) media.push({ type: 'gif', url: src });
            });
            const gifImgs = group.querySelectorAll('img[src*=".gif"]');
            gifImgs.forEach(img => {
              const src = (img as HTMLImageElement).src;
              if (src && !media.some(m => m.url === src)) media.push({ type: 'gif', url: src });
            });

            // File attachments
            const attachmentEls = group.querySelectorAll('[class*="attachment_"], [class*="attachmentInner_"]');
            attachmentEls.forEach(att => {
              const link = att.querySelector('a');
              const nameEl = att.querySelector('[class*="fileNameLink_"], [class*="fileName_"]');
              const sizeEl = att.querySelector('[class*="metadata_"]');
              if (link) {
                const href = link.href;
                const name = nameEl?.textContent?.trim() || link.textContent?.trim() || 'file';
                const size = sizeEl?.textContent?.trim() || '';
                if (!href.match(/\.(png|jpg|jpeg|webp|gif|mp4|webm|mov)(\?|$)/i)) {
                  media.push({ type: 'file', url: href, name, size });
                }
              }
            });

            // Embeds
            const embedEls = group.querySelectorAll('[class*="embed_"]');
            embedEls.forEach(embed => {
              const titleEl = embed.querySelector('[class*="embedTitle_"]');
              const descEl = embed.querySelector('[class*="embedDescription_"]');
              const thumbEl = embed.querySelector('[class*="embedThumbnail_"] img, [class*="embedImage_"] img');
              const linkEl = embed.querySelector('a[class*="embedTitleLink_"]');
              const providerEl = embed.querySelector('[class*="embedProvider_"]');
              
              const title = titleEl?.textContent?.trim() || '';
              const description = descEl?.textContent?.trim() || '';
              const thumbnail = thumbEl ? (thumbEl as HTMLImageElement).src : null;
              const url = linkEl?.getAttribute('href') || '';
              const provider = providerEl?.textContent?.trim() || '';

              if (title || description || thumbnail) {
                media.push({ type: 'embed', url, title, description, thumbnail, provider });
              }
            });

            // Stickers
            const stickerEls = group.querySelectorAll('[class*="stickerAsset_"] img, [data-type="sticker"] img');
            stickerEls.forEach(sticker => {
              const src = (sticker as HTMLImageElement).src;
              const alt = (sticker as HTMLImageElement).alt || 'Sticker';
              if (src) media.push({ type: 'sticker', url: src, name: alt });
            });

            if (contentEl || media.length > 0) {
              results.push({
                id: `scrape-${messageId}`,
                source: 'discord',
                sourceId: messageId,
                author: usernameEl?.textContent?.trim() || 'Unknown',
                authorId: null,
                channel: chId,
                content: contentEl?.textContent?.trim() || '',
                mediaUrls: media.length > 0 ? JSON.stringify(media) : null,
                timestamp: timestampEl?.getAttribute('datetime') || new Date().toISOString(),
              });
            }
          });

          return results;
        }, channelId);

        // Add to global Map to deduplicate
        const prevSize = accumulatedMessages.size;
        currentBatch.forEach(msg => accumulatedMessages.set(msg.sourceId, msg));
        const currentCount = accumulatedMessages.size;
        
        scrollIteration++;
        if (currentCount > prevSize) {
          staleRounds = 0;
          console.log(`   📜 Scroll #${scrollIteration}: ${currentCount} total messages accumulated...`);
        } else {
          staleRounds++;
        }

        if (currentCount >= TARGET_MESSAGES) {
          console.log(`   ✅ Reached ${currentCount} messages (target: ${TARGET_MESSAGES})`);
          break;
        }

        // Scroll up
        if (staleRounds < MAX_STALE_ROUNDS) {
          await page.evaluate(() => {
            const firstMsg = document.querySelector('[id^="chat-messages-"]');
            if (firstMsg) {
              let el: HTMLElement | null = firstMsg as HTMLElement;
              while (el && el !== document.body) {
                const overflowY = window.getComputedStyle(el).overflowY;
                const isScrollable = overflowY !== 'visible' && overflowY !== 'hidden' && el.scrollHeight > el.clientHeight;
                if (isScrollable) {
                  // Scroll up a large chunk instead of 0
                  // Scroll UP to find older messages
                  el.scrollBy(0, -800);
                  break;
                }
                el = el.parentElement;
              }
            }
          });
          await delay(2000);
        } else {
          console.log(`   ℹ️ No new messages after ${MAX_STALE_ROUNDS} scrolls. Target hit top. Total: ${currentCount}`);
        }
      }

      // Convert accumulated messages Map to Array
      const messages = Array.from(accumulatedMessages.values());

      console.log(`🕵️ Extracted ${messages.length} messages from channel ${channelId}`);
      const saved = await saveMessages(messages);
      
      // Save data to date-wise channel folder structure for future use
      await saveHistoricalData(channelId, messages);

      totalScraped += saved;
    }

    console.log(`\n🏁 Scraping complete! Total new messages saved: ${totalScraped}`);

  } catch (error: Error | any) {
    console.error('❌ Scraper error:', error?.message || String(error));
  } finally {
    await browser.close();
  }
}

/**
 * Calculates and saves a summary of Discord messages to summary.json
 */
async function updateDiscordSummary(allMessages: ScrapedMessage[]) {
  try {
    const discordMessages = allMessages.filter((m) => m.source === 'discord');

    const commonWords = new Set(['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'is', 'are', 'was', 'were', 'been', 'has', 'had', 'am', 'me', 'im', 'i\'m', 'don\'t', 'cant', 'can\'t', 'its', 'it\'s', 'really', 'much', 'still', 'even', 'got', 'did', 'well', 'more', 'very', 'here', 'there', 'where', 'when', 'why', 'how']);

    const wordCounts: Record<string, number> = {};
    const authorCounts: Record<string, number> = {};

    discordMessages.forEach(m => {
      // Author counts
      authorCounts[m.author] = (authorCounts[m.author] || 0) + 1;

      // Word counts
      if (m.content) {
        const words = m.content.toLowerCase().match(/\b(\w+)\b/g);
        if (words) {
          words.forEach((w: string) => {
            if (w.length > 2 && !commonWords.has(w)) {
              wordCounts[w] = (wordCounts[w] || 0) + 1;
            }
          });
        }
      }
    });

    const topAuthors = Object.entries(authorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const keywords = Object.entries(wordCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([word, count]) => ({ word, count }));

    const timestamps = discordMessages.map((m) => new Date(m.timestamp).getTime());
    const timeRange = {
      start: timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : null,
      end: timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null
    };

    const summary = {
      totalMessages: discordMessages.length,
      uniqueAuthors: Object.keys(authorCounts).length,
      topAuthors,
      keywords,
      timeRange,
      aiSummary: await generateAiExecutiveSummary(discordMessages),
      lastUpdated: new Date().toISOString()
    };

    await fs.mkdir(path.dirname(SUMMARY_PATH), { recursive: true });
    await fs.writeFile(SUMMARY_PATH, JSON.stringify(summary, null, 2));
    console.log(`📊 Updated pre-calculated summary at ${SUMMARY_PATH}`);
  } catch (error) {
    console.error('❌ Failed to update summary:', error);
  }
}

/**
 * Uses Gemini to generate an Executive Summary of all messages.
 */
async function generateAiExecutiveSummary(messages: ScrapedMessage[]): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    console.log(`🧠 Generating AI Executive Summary for ${messages.length} messages...`);
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use gemini-2.0-flash - ensure standard model name
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // Focus on most recent 1000 messages for relevance and prompt size
    const transcript = messages
      .slice(0, 1000)
      .map(m => `[${m.author}]: ${m.content}`)
      .join('\n');

    const prompt = `
      You are an expert community manager and data analyst.
      Analyze the following Discord message transcript and provide a professional, structured Executive Summary.
      
      Focus on:
      1. Main Themes and Topics of Discussion
      2. Major Announcements, News, or Decisions
      3. General Sentiment and Community Vibe
      
      Structure your response with clear headings (##) and concise bullet points.
      Make it useful for stakeholders to understand what happened recently in the community.
      
      Transcript:
      ${transcript}
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    if (!text) throw new Error("Empty response from Gemini");
    
    console.log("✅ AI Executive Summary generated successfully.");
    return text;
  } catch (error: any) {
    console.error('❌ Failed to generate AI summary:', {
      message: error.message,
      status: error.status,
      details: error.errorDetails
    });
    return "AI Summary is currently unavailable due to a processing error. Please check your API key and quota.";
  }
}

async function saveMessages(newMessages: ScrapedMessage[]): Promise<number> {
  try {
    let data: ScrapedMessage[] = [];
    try {
      const fileContent = await fs.readFile(DB_PATH, 'utf-8');
      data = JSON.parse(fileContent);
    } catch (e) {
      // data.json doesn't exist yet
    }

    let addedCount = 0;
    const liveMediaPath = path.join(process.cwd(), 'scraped_data', 'live_media');
    await fs.mkdir(liveMediaPath, { recursive: true });

    for (const msg of newMessages) {
      // Deduplicate by sourceId or by content+author+timestamp combo
      const exists = data.some(
        (m: ScrapedMessage) => m.sourceId === msg.sourceId
      );

      if (!exists && (msg.content || msg.mediaUrls)) {
        // --- LIVE MEDIA DOWNLOADING START ---
        if (msg.mediaUrls) {
          try {
            const mediaItems = JSON.parse(msg.mediaUrls);
            const updatedMedia = [];
            
            for (let i = 0; i < mediaItems.length; i++) {
              const item = mediaItems[i];
              const ext = path.extname(new URL(item.url || '').pathname) || '.png';
              const localFileName = `${msg.sourceId}_${i}${ext}`;
              const localDestPath = path.join(liveMediaPath, localFileName);
              
              const success = await downloadMediaFile(item.url, localDestPath);
              if (success) {
                // Point to live_media for the dashboard
                updatedMedia.push({ ...item, url: `live_media/${localFileName}` });
              } else {
                updatedMedia.push(item);
              }
            }
            msg.mediaUrls = JSON.stringify(updatedMedia);
          } catch (err) {
            console.warn(`⚠️ Failed to archive live media for message ${msg.sourceId}:`, err);
          }
        }
        // --- LIVE MEDIA DOWNLOADING END ---

        data.push(msg);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      // Sort newest first
      data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      // Cap at 5000 messages
      if (data.length > 5000) data = data.slice(0, 5000 * -1); // slice the newest ones if too many
      // But wait, sort order is newest, so slice the first 5000
      const trimmed = data.slice(0, 5000);
      await fs.writeFile(DB_PATH, JSON.stringify(trimmed, null, 2));
      console.log(`✅ Saved ${addedCount} new messages to data.json`);
      // Update summary whenever messages are saved
      await updateDiscordSummary(trimmed);
    } else {
      console.log(`ℹ️ No new messages to save (all duplicates).`);
    }

    return addedCount;
  } catch (error) {
    console.error('❌ Failed to save scraped messages:', error);
    return 0;
  }
}

async function saveHistoricalData(channelId: string, messages: ScrapedMessage[]) {
  if (messages.length === 0) return;
  
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const dirPath = path.join(process.cwd(), 'scraped_data', today);
    const mediaPath = path.join(dirPath, 'media');
    const filePath = path.join(dirPath, `${channelId}.json`);
    
    // Create directories if they don't exist
    await fs.mkdir(dirPath, { recursive: true });
    await fs.mkdir(mediaPath, { recursive: true });
    
    let existingMessages: ScrapedMessage[] = [];
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      existingMessages = JSON.parse(fileContent);
    } catch (e) {
      // File doesn't exist yet, which is fine
    }

    // Merge logic (deduplicate)
    const newDocs: ScrapedMessage[] = [];
    for (const msg of messages) {
      const exists = existingMessages.some(
        (m: ScrapedMessage) => m.sourceId === msg.sourceId
      );
      
      if (!exists && (msg.content || msg.mediaUrls)) {
        // --- MEDIA DOWNLOADING START ---
        if (msg.mediaUrls) {
          try {
            const mediaItems = JSON.parse(msg.mediaUrls);
            const updatedMedia = [];
            
            for (let i = 0; i < mediaItems.length; i++) {
              const item = mediaItems[i];
              
              // Handle already downloaded live_media paths
              if (item.url.startsWith('live_media/')) {
                  const localFileName = item.url.replace('live_media/', '');
                  const localSourcePath = path.join(process.cwd(), 'scraped_data', item.url);
                  const localDestPath = path.join(mediaPath, localFileName);
                  
                  try {
                      await fs.copyFile(localSourcePath, localDestPath);
                      updatedMedia.push({ ...item, url: `media/${localFileName}` });
                  } catch (e) {
                      updatedMedia.push(item);
                  }
                  continue;
              }

              let ext = '.png';
              try { ext = path.extname(new URL(item.url).pathname) || '.png'; } catch (e) {}
              // filename like: media/123456789_0.png
              const localFileName = `${msg.sourceId}_${i}${ext}`;
              const localDestPath = path.join(mediaPath, localFileName);
              
              const success = await downloadMediaFile(item.url, localDestPath);
              if (success) {
                // Update URL to be relative to the JSON file
                updatedMedia.push({ ...item, url: `media/${localFileName}` });
              } else {
                updatedMedia.push(item); // Keep original URL as fallback
              }
            }
            msg.mediaUrls = JSON.stringify(updatedMedia);
          } catch (err) {
            console.warn(`⚠️ Failed to archive media for message ${msg.sourceId}:`, err);
          }
        }
        // --- MEDIA DOWNLOADING END ---

        newDocs.push(msg);
      }
    }

    if (newDocs.length > 0) {
      const merged = [...existingMessages, ...newDocs];
      merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      await fs.writeFile(filePath, JSON.stringify(merged, null, 2));
      console.log(`📁 Saved ${newDocs.length} messages with local media to scraped_data/${today}/${channelId}.json`);
    }
  } catch (error) {
    console.error(`❌ Failed to save historical data for channel ${channelId}:`, error);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the scraper
scrape().catch(console.error);
