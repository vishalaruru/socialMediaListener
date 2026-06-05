'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, AtSign, FileDown, ExternalLink, Play } from 'lucide-react';

type MediaItem = {
  type: 'image' | 'video' | 'gif' | 'file' | 'embed' | 'sticker';
  url: string;
  name?: string;
  size?: string;
  poster?: string | null;
  title?: string;
  description?: string;
  thumbnail?: string | null;
  provider?: string;
};

type Message = {
  id: string;
  source: string;
  sourceId: string;
  author: string;
  authorId: string | null;
  channel: string | null;
  content: string;
  mediaUrls: string | null;
  timestamp: string;
};

type SummaryData = {
  totalMessages: number;
  uniqueAuthors: number;
  topAuthors: { name: string; count: number }[];
  keywords: { word: string; count: number }[];
  timeRange: { start: string | null; end: string | null };
  aiSummary?: string | null;
  lastUpdated?: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<'all' | 'discord' | 'twitter'>('all');
  const [activeTab, setActiveTab] = useState<'messages' | 'summary'>('messages');
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchMessages = async () => {
    try {
      const res = await fetch('/api/messages');
      const data = await res.json();
      setMessages(data);
    } catch (error) {
      console.error('Failed to fetch messages', error);
    }
  };

  const fetchSummary = async () => {
    setIsLoadingSummary(true);
    try {
      const res = await fetch('/api/summary');
      const data = await res.json();
      setSummaryData(data);
    } catch (error) {
      console.error('Failed to fetch summary', error);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  useEffect(() => {
    if (filter === 'discord' && activeTab === 'summary') {
      fetchSummary();
    }
  }, [filter, activeTab]);

  const filteredMessages = messages.filter(m => filter === 'all' || m.source === filter);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 font-sans selection:bg-indigo-500/30">
      {/* Premium Header */}
      <header className="sticky top-0 z-50 bg-neutral-950/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Social Listener</h1>
          </div>
          
          <div className="flex bg-neutral-900/50 p-1.5 rounded-xl border border-white/5 backdrop-blur-md">
            {['all', 'discord', 'twitter'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f as 'all' | 'discord' | 'twitter')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                  filter === f 
                  ? 'bg-neutral-800 text-white shadow-sm' 
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Discord Sub-navigation */}
        {filter === 'discord' && (
          <div className="max-w-5xl mx-auto px-6 h-12 flex items-center gap-6 border-t border-white/5">
            {[
              { id: 'messages', label: 'Messages', icon: MessageSquare },
              { id: 'summary', label: 'Summary', icon: FileDown }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'messages' | 'summary')}
                className={`flex items-center gap-2 h-full border-b-2 transition-all text-sm font-medium ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-neutral-500 hover:text-neutral-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Feed */}
      <div className="max-w-5xl mx-auto px-6 py-12">
        {filter === 'discord' && activeTab === 'summary' ? (
          <SummaryView data={summaryData} isLoading={isLoadingSummary} />
        ) : (
          <div className="grid gap-6">
            {filteredMessages.length === 0 ? (
              <div className="text-center py-20 text-neutral-500">
                <p>No messages found. Ensure the listener is running.</p>
              </div>
            ) : (
              filteredMessages.map((msg) => (
                <MessageCard key={msg.id} msg={msg} />
              ))
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function SummaryView({ data, isLoading }: { data: SummaryData | null, isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
        <p className="text-neutral-400 animate-pulse">Analyzing scraped data...</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* AI Executive Summary */}
      {data.aiSummary && (
        <div className="p-8 rounded-3xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-20 transform translate-x-4 -translate-y-4 group-hover:translate-x-2 group-hover:-translate-y-2 transition-transform duration-500">
            <MessageSquare className="w-24 h-24 text-indigo-400" />
          </div>
          <div className="relative">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-indigo-300">
              <Play className="w-5 h-5 fill-current" />
              Executive AI Summary
            </h3>
            <div className="prose prose-invert max-w-none">
              <div className="text-neutral-300 leading-relaxed whitespace-pre-wrap text-[15px]">
                {data.aiSummary}
              </div>
            </div>
            {data.lastUpdated && (
              <div className="mt-6 text-[10px] text-neutral-500 uppercase tracking-widest font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                Last analyzed: {new Date(data.lastUpdated).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats Hero */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Scraped Messages', value: data.totalMessages, color: 'from-indigo-500 to-indigo-600' },
          { label: 'Active Authors', value: data.uniqueAuthors, color: 'from-purple-500 to-purple-600' },
          { label: 'Extraction Window', value: data.timeRange.start ? formatDistanceToNow(new Date(data.timeRange.start)) : 'N/A', color: 'from-blue-500 to-blue-600' },
        ].map((stat, i) => (
          <div key={i} className="p-8 rounded-3xl bg-neutral-900/40 border border-white/5 relative overflow-hidden group">
            <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${stat.color} opacity-5 blur-3xl group-hover:opacity-10 transition-opacity`} />
            <div className="relative">
              <p className="text-sm font-medium text-neutral-500 mb-2">{stat.label}</p>
              <p className="text-4xl font-bold text-white tracking-tight">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Top Authors */}
        <div className="p-8 rounded-3xl bg-neutral-900/40 border border-white/5">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-400" />
            Top Contributors
          </h3>
          <div className="space-y-4">
            {data.topAuthors.map((author, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-400">
                    {i + 1}
                  </div>
                  <span className="font-medium text-neutral-200">{author.name}</span>
                </div>
                <span className="text-sm font-semibold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full">
                  {author.count} msgs
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Keywords */}
        <div className="p-8 rounded-3xl bg-neutral-900/40 border border-white/5">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <AtSign className="w-5 h-5 text-purple-400" />
            Key Topics
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.keywords.map((kw, i) => (
              <div key={i} 
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-sm font-medium text-neutral-300 hover:bg-neutral-800 transition-colors"
                title={`${kw.count} occurrences`}
              >
                #{kw.word}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Resolves a media URL, proxying local paths through our API */
function resolveMediaUrl(url: string | undefined): string {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  // Local paths like 'live_media/...' or '2026-03-30/media/...'
  return `/api/media/${url}`;
}

/** Parse mediaUrls — handles both old format (string[]) and new format (MediaItem[]) */
function parseMedia(mediaUrls: string | null): MediaItem[] {
  if (!mediaUrls) return [];
  try {
    const parsed = JSON.parse(mediaUrls);
    if (!Array.isArray(parsed)) return [];
    // Old format: plain URL strings → convert to image type
    if (typeof parsed[0] === 'string') {
      return parsed.map((url: string) => ({ type: 'image' as const, url: resolveMediaUrl(url) }));
    }
    // New format: resolve paths for all items
    return (parsed as MediaItem[]).map(item => ({
      ...item,
      url: resolveMediaUrl(item.url),
      thumbnail: item.thumbnail ? resolveMediaUrl(item.thumbnail) : null,
      poster: item.poster ? resolveMediaUrl(item.poster) : null,
    }));
  } catch {
    return [];
  }
}

function MessageCard({ msg }: { msg: Message }) {
  const isDiscord = msg.source === 'discord';
  const media = parseMedia(msg.mediaUrls);

  const images = media.filter(m => m.type === 'image');
  const videos = media.filter(m => m.type === 'video');
  const gifs = media.filter(m => m.type === 'gif');
  const files = media.filter(m => m.type === 'file');
  const embeds = media.filter(m => m.type === 'embed');
  const stickers = media.filter(m => m.type === 'sticker');

  return (
    <div className="group relative p-6 rounded-3xl bg-neutral-900/40 border border-white/5 hover:bg-neutral-900/60 transition-all duration-500 hover:border-white/10">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl pointer-events-none" />
      
      <div className="relative flex gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-neutral-800 to-neutral-700 flex items-center justify-center text-lg font-medium text-neutral-300 shadow-inner">
          {msg.author.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4 mb-1">
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-neutral-100 truncate">{msg.author}</span>
              {msg.channel && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/5 text-neutral-400 border border-white/5">
                  #{msg.channel}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-neutral-500 whitespace-nowrap">
              <span>{formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })}</span>
              {isDiscord ? (
                <MessageSquare className="w-4 h-4 text-[#5865F2]" />
              ) : (
                <AtSign className="w-4 h-4 text-[#1DA1F2]" />
              )}
            </div>
          </div>

          {/* Text content */}
          {msg.content && (
            <p className="text-neutral-300 leading-relaxed whitespace-pre-wrap break-words mt-2 text-[15px]">
              {msg.content}
            </p>
          )}

          {/* Images */}
          {images.length > 0 && (
            <div className={`mt-4 grid gap-3 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {images.map((img, i) => (
                <a key={i} href={img.url} target="_blank" rel="noopener noreferrer"
                   className="relative rounded-2xl overflow-hidden bg-neutral-800 ring-1 ring-white/10 group/img block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="Attachment" loading="lazy"
                    className="object-cover w-full h-auto max-h-[500px] transition-transform duration-700 group-hover/img:scale-105" />
                </a>
              ))}
            </div>
          )}

          {/* Videos */}
          {videos.length > 0 && (
            <div className="mt-4 grid gap-3">
              {videos.map((vid, i) => (
                <div key={i} className="relative rounded-2xl overflow-hidden bg-neutral-800 ring-1 ring-white/10">
                  <video 
                    src={vid.url}
                    poster={vid.poster || undefined}
                    controls
                    preload="metadata"
                    className="w-full max-h-[500px] rounded-2xl"
                  >
                    <source src={vid.url} />
                  </video>
                </div>
              ))}
            </div>
          )}

          {/* GIFs */}
          {gifs.length > 0 && (
            <div className={`mt-4 grid gap-3 ${gifs.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {gifs.map((gif, i) => (
                <div key={i} className="relative rounded-2xl overflow-hidden bg-neutral-800 ring-1 ring-white/10">
                  {gif.url.includes('.mp4') || gif.url.includes('.webm') ? (
                    <video src={gif.url} autoPlay loop muted playsInline
                      className="w-full h-auto max-h-[400px] object-contain" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={gif.url} alt="GIF" loading="lazy"
                      className="w-full h-auto max-h-[400px] object-contain" />
                  )}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-[10px] font-bold text-white tracking-wider">
                    GIF
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* File Attachments */}
          {files.length > 0 && (
            <div className="mt-4 grid gap-2">
              {files.map((file, i) => (
                <a key={i} href={file.url} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-3 p-3 rounded-xl bg-neutral-800/60 border border-white/5 hover:bg-neutral-800 hover:border-white/10 transition-all group/file">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                    <FileDown className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-neutral-200 truncate group-hover/file:text-indigo-300 transition-colors">
                      {file.name || 'Download file'}
                    </div>
                    {file.size && (
                      <div className="text-xs text-neutral-500">{file.size}</div>
                    )}
                  </div>
                  <ExternalLink className="w-4 h-4 text-neutral-500 group-hover/file:text-neutral-300 transition-colors flex-shrink-0" />
                </a>
              ))}
            </div>
          )}

          {/* Embeds (link previews) */}
          {embeds.length > 0 && (
            <div className="mt-4 grid gap-3">
              {embeds.map((embed, i) => (
                <a key={i} href={embed.url || '#'} target="_blank" rel="noopener noreferrer"
                   className="block rounded-xl overflow-hidden bg-neutral-800/60 border-l-4 border-l-indigo-500/50 border border-white/5 hover:border-white/10 transition-all">
                  <div className="flex">
                    <div className="flex-1 p-4 min-w-0">
                      {embed.provider && (
                        <div className="text-[11px] text-neutral-500 uppercase tracking-wider mb-1">{embed.provider}</div>
                      )}
                      {embed.title && (
                        <div className="text-sm font-semibold text-indigo-300 truncate">{embed.title}</div>
                      )}
                      {embed.description && (
                        <div className="text-xs text-neutral-400 mt-1 line-clamp-3 leading-relaxed">{embed.description}</div>
                      )}
                    </div>
                    {embed.thumbnail && (
                      <div className="flex-shrink-0 w-20 h-20 m-3 rounded-lg overflow-hidden bg-neutral-700">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={embed.thumbnail} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                </a>
              ))}
            </div>
          )}

          {/* Stickers */}
          {stickers.length > 0 && (
            <div className="mt-4 flex gap-3">
              {stickers.map((sticker, i) => (
                <div key={i} className="w-32 h-32 rounded-xl overflow-hidden" title={sticker.name || 'Sticker'}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sticker.url} alt={sticker.name || 'Sticker'} 
                    className="w-full h-full object-contain" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
