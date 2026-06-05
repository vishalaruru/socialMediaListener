import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data.json');
const SUMMARY_PATH = path.join(process.cwd(), 'scraped_data', 'summary.json');

// Helper to clean and tokenize text for keyword extraction (Fallback only)
function extractKeywords(messages: any[]) {
  const commonWords = new Set(['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'is', 'are', 'was', 'were', 'been', 'has', 'had', 'am', 'me', 'im', 'i\'m', 'don\'t', 'cant', 'can\'t', 'its', 'it\'s', 'really', 'much', 'still', 'even', 'got', 'did', 'well', 'more', 'very', 'here', 'there', 'where', 'when', 'why', 'how']);

  const counts: Record<string, number> = {};
  messages.forEach(m => {
    if (!m.content) return;
    const words = m.content.toLowerCase().match(/\b(\w+)\b/g);
    if (!words) return;
    words.forEach((w: string) => {
      if (w.length > 2 && !commonWords.has(w)) {
        counts[w] = (counts[w] || 0) + 1;
      }
    });
  });

  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([word, count]) => ({ word, count }));
}

export async function GET() {
  try {
    // Try to read pre-calculated summary first
    try {
      const summaryData = await fs.readFile(SUMMARY_PATH, 'utf-8');
      return NextResponse.json(JSON.parse(summaryData));
    } catch (e) {
      console.warn('⚠️ Pre-calculated summary not found, falling back to live calculation.');
    }

    // Fallback: Calculate on the fly
    let data = '[]';
    try {
      data = await fs.readFile(DB_PATH, 'utf-8');
    } catch (e) {
      /* file doesn't exist yet */
    }

    const allMessages = JSON.parse(data);
    const discordMessages = allMessages.filter((m: any) => m.source === 'discord');

    const authorCounts: Record<string, number> = {};
    discordMessages.forEach((m: any) => {
      authorCounts[m.author] = (authorCounts[m.author] || 0) + 1;
    });

    const topAuthors = Object.entries(authorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const timestamps = discordMessages.map((m: any) => new Date(m.timestamp).getTime());
    const start = timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : null;
    const end = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;

    const summary = {
      totalMessages: discordMessages.length,
      uniqueAuthors: Object.keys(authorCounts).length,
      topAuthors,
      keywords: extractKeywords(discordMessages),
      timeRange: { start, end },
      lastUpdated: new Date().toISOString(),
      isLiveCalculated: true
    };

    return NextResponse.json(summary);
  } catch (error: any) {
    console.error('Failed to provide summary:', error);
    return NextResponse.json(
      { error: 'Failed to provide summary', details: error.message },
      { status: 500 }
    );
  }
}
