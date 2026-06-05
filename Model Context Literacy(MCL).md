# Model Context Literacy (MCL)

## 1. Repository Identity

Social media message aggregator and analytics dashboard. Ingests Discord messages via two methods (WebSocket bot and Puppeteer scraper), archives attachments locally, generates AI-powered executive summaries via Gemini, and serves everything through a Next.js feed UI. Twitter support is stubbed but non-functional. Current state: **working MVP** — the Discord pipeline and dashboard are operational; the Prisma/SQLite layer is configured but unused by the main app.

## 2. Technology Stack

| Layer | Technology | Role in This Repo |
| :--- | :--- | :--- |
| Frontend | Next.js 16 (React 19) | App Router, SSR, API routes under `src/app/api/` |
| Styling | Tailwind CSS v4 | Utility classes, dark-mode glassmorphic UI |
| Icons | Lucide React 1.7 | `MessageSquare`, `AtSign`, `FileDown`, `ExternalLink`, `Play` |
| Date formatting | date-fns 4.1 | `formatDistanceToNow` for relative timestamps |
| Discord (real-time) | discord.js 14.25 | WebSocket gateway bot for live message capture |
| Discord (scraping) | Puppeteer 24.40 | Headless browser login + DOM scraping of channel history |
| AI summarization | @google/generative-ai 0.24 | Gemini 2.0 Flash for executive summary generation |
| ORM | Prisma 7.6 + @prisma/client | Schema definition for SQLite — **configured but not used by dashboard** |
| Twitter (stub) | twitter-api-v2 1.29 | Imported in `listener/twitter.ts` but no functional code |
| Script runner | tsx 4.21 | Executes TypeScript listener/scraper scripts directly |

## 3. File Map & Ownership

### Ingestion Layer

| File | Domain | Key Exports / Responsibilities |
| :--- | :--- | :--- |
| [listener/index.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/listener/index.ts) | Entry point | `main()` → spawns `startDiscordListener()` |
| [listener/discord.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/listener/discord.ts) | WebSocket bot | `startDiscordListener()`, `fetchChannelHistory(client, channelId)`, `saveMessage(message): boolean` |
| [listener/scraper.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/listener/scraper.ts) | Browser scraper | `scrape()`, `saveMessages(msgs): number`, `saveHistoricalData(channelId, msgs)`, `updateDiscordSummary(msgs)`, `generateAiExecutiveSummary(msgs): string|null`, `downloadMediaFile(url, path): boolean` |
| [listener/twitter.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/listener/twitter.ts) | Twitter stub | `startTwitterListener()` — logs a warning and returns. Dead code. |

### API Layer

| File | Domain | Key Exports / Responsibilities |
| :--- | :--- | :--- |
| [src/app/api/messages/route.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/src/app/api/messages/route.ts) | Messages endpoint | `GET()` → reads `data.json`, optional `?source=` filter, returns newest 100 messages |
| [src/app/api/summary/route.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/src/app/api/summary/route.ts) | Analytics endpoint | `GET()` → reads `scraped_data/summary.json` (pre-computed), falls back to live calculation from `data.json`. Exports `extractKeywords()` |
| [src/app/api/media/[...path]/route.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/src/app/api/media/[...path]/route.ts) | Media proxy | `GET()` → streams files from `scraped_data/` with path-traversal protection and content-type detection |

### Frontend

| File | Domain | Key Exports / Responsibilities |
| :--- | :--- | :--- |
| [src/app/page.tsx](file:///Users/VishalKumar.Aruru/socialMediaListener/src/app/page.tsx) | Dashboard UI | `Home()` (client component), `SummaryView()`, `MessageCard()`, `resolveMediaUrl()`, `parseMedia()`. Polls `/api/messages` every 5s. |
| [src/app/layout.tsx](file:///Users/VishalKumar.Aruru/socialMediaListener/src/app/layout.tsx) | Root layout | Geist font loading, `referrer: 'no-referrer'` metadata (required for Discord CDN images) |

### Database

| File | Domain | Key Exports / Responsibilities |
| :--- | :--- | :--- |
| [prisma/schema.prisma](file:///Users/VishalKumar.Aruru/socialMediaListener/prisma/schema.prisma) | Schema definition | `Message` model (id, source, sourceId, author, authorId, channel, content, mediaUrls, timestamp, createdAt). **Not queried by any API route.** |

## 4. Data Architecture

### Store: `data.json` (project root)
- **Format**: JSON array of message objects
- **Shape**: `{ id, source, sourceId, author, authorId, channel, content, mediaUrls: string|null, timestamp }`
- **Writers**: `listener/discord.ts` → `saveMessage()` (line 161), `listener/scraper.ts` → `saveMessages()` (line 531)
- **Readers**: `src/app/api/messages/route.ts` → `GET()` (line 14), `src/app/api/summary/route.ts` → fallback path (line 42)
- **Capacity**: Capped at 5000 messages. Sorted newest-first. Deduplication by `sourceId`.

### Store: `scraped_data/summary.json`
- **Format**: JSON object with pre-computed analytics
- **Shape**: `{ totalMessages, uniqueAuthors, topAuthors[], keywords[], timeRange: {start, end}, aiSummary: string|null, lastUpdated }`
- **Writers**: `listener/scraper.ts` → `updateDiscordSummary()` (line 419), called after every `saveMessages()` batch
- **Readers**: `src/app/api/summary/route.ts` → `GET()` (line 34)
- **Capacity**: Single file, overwritten on each scrape run

### Store: `scraped_data/live_media/` and `scraped_data/YYYY-MM-DD/media/`
- **Format**: Binary files (PNG, JPG, GIF, MP4, WebM, PDF)
- **Naming**: `<sourceId>_<index>.<ext>`
- **Writers**: `listener/scraper.ts` → `downloadMediaFile()` (line 15), called from `saveMessages()` and `saveHistoricalData()`
- **Readers**: `src/app/api/media/[...path]/route.ts` → streams via `createReadStream` (line 52)
- **Capacity**: No rotation. Grows indefinitely.

### Store: `dev.db` (SQLite via Prisma)
- **Format**: SQLite database with `Message` table
- **Writers**: Only `listener/twitter.ts` references Prisma client (line 9). **No active writers.**
- **Readers**: **None.** No API route queries this database.
- **Status**: Schema exists, database file exists, but it's an orphaned artifact.

## 5. Request Traces

### Trace 1: Dashboard loads message feed
```
[Browser] → GET /api/messages
  → [messages/route.ts] fs.readFile("data.json")
  → parse JSON → optional filter by ?source= → sort by timestamp desc
  → return first 100 messages as JSON
  → [page.tsx Home()] setMessages() → renders MessageCard[] with resolveMediaUrl()
```
Polls every 5 seconds via `setInterval`.

### Trace 2: Dashboard loads analytics summary
```
[Browser] → GET /api/summary (triggered when filter="discord" + tab="summary")
  → [summary/route.ts] try fs.readFile("scraped_data/summary.json")
  → if found: return pre-computed summary (includes aiSummary from Gemini)
  → if not found: fallback to fs.readFile("data.json") → live-compute stats (no AI summary)
  → [page.tsx SummaryView()] renders stats cards, top authors, keyword tags, AI summary box
```

### Trace 3: Scraper ingests Discord history
```
[npm run scrape] → scrape()
  → Puppeteer launches browser → navigates to discord.com/login
  → fills credentials from DISCORD_EMAIL/DISCORD_PASSWORD env vars
  → waits for login (up to 2 min for captcha/2FA) → navigates to each channel URL
  → scrolls up accumulating messages (target: 200, max stale rounds: 4)
  → page.evaluate() extracts DOM elements [id^="chat-messages-"] → builds ScrapedMessage[]
  → saveMessages() deduplicates, downloads media to live_media/, writes data.json
  → saveHistoricalData() copies media to scraped_data/YYYY-MM-DD/media/, writes channel JSON
  → updateDiscordSummary() computes word frequencies, author counts, calls generateAiExecutiveSummary()
  → generateAiExecutiveSummary() sends transcript to Gemini 2.0 Flash → writes summary.json
```

## 6. Environment & Secrets

| Variable | Required? | Purpose | Where Read |
| :--- | :--- | :--- | :--- |
| `DISCORD_BOT_TOKEN` | Yes (for listener) | Discord gateway bot authentication | [listener/discord.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/listener/discord.ts) line 9 |
| `DISCORD_CHANNEL_IDS` | No | Comma-separated channel IDs to watch. If unset, watches all. | [listener/discord.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/listener/discord.ts) line 35 |
| `DISCORD_EMAIL` | Yes (for scraper) | Discord account email for Puppeteer login | [listener/scraper.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/listener/scraper.ts) line 74 |
| `DISCORD_PASSWORD` | Yes (for scraper) | Discord account password for Puppeteer login | [listener/scraper.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/listener/scraper.ts) line 75 |
| `DISCORD_SCRAPE_CHANNELS` | Yes (for scraper) | Format: `"guildId/channelId,guildId/channelId"` | [listener/scraper.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/listener/scraper.ts) line 76 |
| `GEMINI_API_KEY` | No | Enables AI executive summaries. Without it, `aiSummary` is `null`. | [listener/scraper.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/listener/scraper.ts) line 483 |
| `DATABASE_URL` | No | Prisma connection string. Set to `"file:./dev.db"`. Unused by main app. | [prisma/schema.prisma](file:///Users/VishalKumar.Aruru/socialMediaListener/prisma/schema.prisma) |
| `TWITTER_BEARER_TOKEN` | No | Would enable Twitter listener. Currently logs warning if missing. | [listener/twitter.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/listener/twitter.ts) line 12 |

## 7. Traps & Gotchas

> **🪤 The dashboard ignores the database entirely.**
> Despite Prisma being installed and `schema.prisma` defining a `Message` model, every API route reads from `data.json` (flat file) and `scraped_data/summary.json`. If you refactor an API route to use `prisma.message.findMany()`, it will return zero results because no ingestion script writes to SQLite.
> **Impact**: Dashboard shows empty feed after "successful" migration to Prisma.
> **Evidence**: [messages/route.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/src/app/api/messages/route.ts) line 5 reads `data.json`; [schema.prisma](file:///Users/VishalKumar.Aruru/socialMediaListener/prisma/schema.prisma) defines tables no one queries.

> **🪤 Two different `saveMessage` functions exist.**
> `listener/discord.ts` has `saveMessage()` (singular, line 161) for live bot events. `listener/scraper.ts` has `saveMessages()` (plural, line 531) for scraped batches. They both write to `data.json` but use different deduplication keys and media download paths. Modifying one without the other causes inconsistent data shapes.
> **Impact**: Mixed media URL formats in `data.json` — some relative (`live_media/...`), some absolute (`https://cdn.discordapp.com/...`).
> **Evidence**: [discord.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/listener/discord.ts) line 161 vs. [scraper.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/listener/scraper.ts) line 531

> **🪤 Discord scraper requires a HEADED browser for captcha/2FA.**
> `puppeteer.launch({ headless: false })` is hardcoded at line 101 of `scraper.ts`. This means the scraper **cannot run on a headless CI server or serverless function** without modification. The 2-minute login timeout exists specifically for manual captcha solving.
> **Impact**: Scraper silently fails or times out in headless/containerized environments.
> **Evidence**: [scraper.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/listener/scraper.ts) line 101

> **🪤 The `referrer: 'no-referrer'` metadata in layout.tsx is load-bearing.**
> Discord CDN URLs reject requests with a `Referer` header from non-Discord origins. The `no-referrer` metadata at [layout.tsx](file:///Users/VishalKumar.Aruru/socialMediaListener/src/app/layout.tsx) line 18 strips this header. Removing it causes all inline Discord images to return 403.
> **Impact**: Every image in the feed breaks.
> **Evidence**: [layout.tsx](file:///Users/VishalKumar.Aruru/socialMediaListener/src/app/layout.tsx) line 18

> **🪤 `listener/twitter.ts` imports packages that may not be installed.**
> It imports `better-sqlite3` and `@prisma/adapter-sqlite` (lines 3-4), which are not listed in `package.json` dependencies. The file only works because `startTwitterListener()` returns early when `TWITTER_BEARER_TOKEN` is missing, so the imports are never fully exercised at runtime.
> **Impact**: If you try to enable the Twitter listener, it will crash with `MODULE_NOT_FOUND`.
> **Evidence**: [twitter.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/listener/twitter.ts) lines 3-4 vs. [package.json](file:///Users/VishalKumar.Aruru/socialMediaListener/package.json) dependencies

> **🪤 The messages API silently caps at 100 results.**
> [messages/route.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/src/app/api/messages/route.ts) line 28 does `.slice(0, 100)` with no pagination support. If the feed has 5000 messages, the client only ever sees the newest 100. There is no `?page=` or `?cursor=` parameter.
> **Impact**: Users cannot scroll back through history in the dashboard.
> **Evidence**: [messages/route.ts](file:///Users/VishalKumar.Aruru/socialMediaListener/src/app/api/messages/route.ts) line 28

## 8. Testing & Verification

**There are no tests.** No test framework is installed. No `test` script exists in `package.json`. The only verification path is:
1. Run `npm run dev` and manually inspect the dashboard at `http://localhost:3000`.
2. Run `npm run lint` for ESLint checks.

Agents cannot rely on a test suite to verify changes. Manual browser inspection is the only validation method.

## 9. Scripts & Commands

| Command | What It Does | When to Use |
| :--- | :--- | :--- |
| `npm run dev` | Starts Next.js dev server on port 3000 | Dashboard development |
| `npm run build` | Production build of Next.js app | Pre-deployment verification |
| `npm run start` | Serves production build | After `npm run build` |
| `npm run lint` | Runs ESLint on the codebase | Before committing changes |
| `npm run listener` | Starts Discord WebSocket bot via `tsx` | Real-time message capture (long-running) |
| `npm run scrape` | Runs Puppeteer scraper + AI summarizer via `tsx` | Bulk history download + analytics refresh |
| `graphify update .` | Updates code knowledge graph (AST-only, free) | After modifying source files |

## 10. Dependency Graph (Inter-file)

```
listener/index.ts       → listener/discord.ts
listener/discord.ts     → (no local imports)
listener/scraper.ts     → (no local imports)
listener/twitter.ts     → (no local imports)

src/app/layout.tsx      → src/app/globals.css
src/app/page.tsx        → (no local imports, uses date-fns + lucide-react)

src/app/api/messages/route.ts        → (no local imports)
src/app/api/summary/route.ts         → (no local imports)
src/app/api/media/[...path]/route.ts → (no local imports)
```

All source files are leaf nodes or single-hop imports. The codebase has **zero shared utility modules** — each file is self-contained. Blast radius for any single file change is limited to that file only, except for `data.json` and `summary.json` which are shared data contracts between ingestion and API layers.
