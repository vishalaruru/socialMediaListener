import { Client, GatewayIntentBits, Message as DiscordMessage, TextChannel, Collection } from 'discord.js';
import fs from 'fs/promises';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data.json');
const HISTORY_LIMIT = 1000;

export async function startDiscordListener() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.error('❌ DISCORD_BOT_TOKEN is missing in .env');
    process.exit(1);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once('ready', async () => {
    console.log(`🤖 Discord Listener is active as ${client.user?.tag}`);
    const guilds = client.guilds.cache.map(g => `${g.name} (${g.id})`).join(', ');
    console.log(`🏠 Joined Servers: ${guilds || 'None'}`);
    
    // DEBUG: List all visible channels
    const visibleChannels = client.channels.cache
      .filter(c => c.isTextBased())
      .map(c => `${(c as any).name || 'unknown'} (${c.id})`)
      .join(', ');
    console.log(`📺 Visible Channels: ${visibleChannels || 'None'}`);
    
    const watchedChannels = process.env.DISCORD_CHANNEL_IDS?.split(',').map(id => id.trim()).filter(Boolean) ?? [];
    if (watchedChannels.length > 0) {
      console.log(`📡 Watching channel IDs: ${watchedChannels.join(', ')}`);
      
      // Fetch history for each watched channel on startup
      for (const channelId of watchedChannels) {
        await fetchChannelHistory(client, channelId);
      }
    } else {
      console.log('📡 Watching ALL channels (no DISCORD_CHANNEL_IDS filter set)');
    }
  });

  client.on('messageCreate', async (message: DiscordMessage) => {
    // DEBUG: Log all messages seen by the bot
    console.log(`🔍 DEBUG: Message seen from ${message.author.tag} in channel ${message.channelId}`);
    
    if (message.author.bot) return;

    // Filter by allowed channels if DISCORD_CHANNEL_IDS is set in .env
    const allowedChannels = process.env.DISCORD_CHANNEL_IDS
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    if (
      allowedChannels &&
      allowedChannels.length > 0 &&
      !allowedChannels.includes(message.channelId)
    ) {
      console.log(`⏭️ DEBUG: Skipping message (channel ${message.channelId} not in watched list)`);
      return;
    }

    await saveMessage(message);
    console.log(`✅ Saved new message from ${message.author.username} in #${(message.channel as any).name || message.channelId}`);
  });

  try {
    await client.login(token);
  } catch (err: any) {
    if (err.message.includes('Used disallowed intents')) {
      console.error('\n❌ CRITICAL ERROR: Disallowed Intents');
      console.error('=======================================');
      console.error('You MUST enable "Message Content Intent" in the Discord Developer Portal.');
      console.error('1. Go to https://discord.com/developers/applications');
      console.error('2. Select your application -> Bot');
      console.error('3. Enable "Message Content Intent" under Privileged Gateway Intents.');
      console.error('4. Save Changes and restart this listener.\n');
    } else {
      console.error('❌ Failed to login to Discord:', err);
    }
    process.exit(1);
  }
}

async function fetchChannelHistory(client: Client, channelId: string) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      console.log(`⚠️ Skip history: Channel ${channelId} not found or not text-based.`);
      return;
    }

    const channelName = (channel as any).name || channelId;
    console.log(`📚 Starting history sync for #${channelName} (Limit: ${HISTORY_LIMIT})...`);
    
    let totalSynced = 0;
    let lastId: string | undefined = undefined;
    let keepFetching = true;

    while (totalSynced < HISTORY_LIMIT && keepFetching) {
      const messages: Collection<string, DiscordMessage> = await (channel as TextChannel).messages.fetch({ 
        limit: 100, 
        before: lastId 
      });

      if (messages.size === 0) {
        keepFetching = false;
        break;
      }

      console.log(`   ..fetching batch of ${messages.size} (Current total: ${totalSynced})`);

      let batchSynced = 0;
      let existingFound = false;

      for (const message of messages.values()) {
        lastId = message.id; // Update for next batch
        if (message.author.bot) continue;

        const saved = await saveMessage(message);
        if (saved) {
          batchSynced++;
        } else {
          // If we find a message that's already saved, we might have hit our existing history
          // Optimization: If it's a very old message we already have, we can stop
          // (Only if we assume messages come in strictly chronological order)
          existingFound = true;
        }
      }

      totalSynced += batchSynced;

      // If we've started hitting messages we already have, and we've synced a decent chunk, we can stop
      // This preserves performance on restarts
      if (existingFound && batchSynced === 0) {
        console.log(`   ..reached existing history in #${channelName}.`);
        keepFetching = false;
      }

      if (messages.size < 100) {
        keepFetching = false;
      }
    }

    if (totalSynced > 0) {
      console.log(`✅ Finished: Synced ${totalSynced} new historical messages for #${channelName}`);
    } else {
      console.log(`✅ Finished: #${channelName} is already up to date.`);
    }
  } catch (error) {
    console.error(`❌ Failed to fetch history for channel ${channelId}:`, error);
  }
}

async function saveMessage(message: DiscordMessage): Promise<boolean> {
  try {
    const mediaUrls = message.attachments.map((att) => att.proxyURL || att.url);

    const channelName =
      message.channel && 'name' in message.channel
        ? (message.channel as any).name
        : message.channelId;

    const newMessage = {
      id: message.id,
      source: 'discord',
      sourceId: message.id,
      author: message.author.username,
      authorId: message.author.id,
      channel: channelName,
      content: message.content,
      mediaUrls: mediaUrls.length > 0 ? JSON.stringify(mediaUrls) : null,
      timestamp: message.createdAt.toISOString(),
    };

    let data: any[] = [];
    try {
      const fileContent = await fs.readFile(DB_PATH, 'utf-8');
      data = JSON.parse(fileContent);
    } catch (e) {
      // Start fresh
    }

    // Deduplicate
    const exists = data.some((m: any) => m.id === newMessage.id);
    if (!exists) {
      data.push(newMessage);
      // Sort by timestamp before saving (descending order for dashboard)
      data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      // Limit total stored messages to prevent JSON file from exploding
      if (data.length > 5000) {
        data = data.slice(0, 5000);
      }
      
      await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Failed to save message:', error);
    return false;
  }
}
