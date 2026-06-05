# 🪐 Social Media Listener & Analytics Dashboard

Welcome to the **Social Media Listener** repository. This project is a production-ready system designed to ingest, archive, and analyze social media feeds (currently supporting Discord, with a Twitter stub). It combines real-time streaming listeners, automated browser scrapers, a SQLite persistent storage engine, and a premium Next.js dashboard equipped with Gemini AI analytics.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | **Next.js 16 (React 19)** | Server-side rendering, client routing, and API routes. |
| **Styling** | **Tailwind CSS v4 + Vanilla CSS** | Clean glassmorphic design system and micro-animations. |
| **Database ORM** | **Prisma 7** | Schema definition and database migration client. |
| **Database Engine** | **SQLite (`dev.db`)** | Local relational database for persistent storage. |
| **Ingestion (Real-time)** | **Discord.js v14** | Webhook and WebSocket listener for live Discord events. |
| **Ingestion (Scraping)** | **Puppeteer v24** | Automated browser scraper to extract channel history. |
| **AI Processing** | **Google Generative AI SDK** | Gemini 2.0 Flash for automated executive summarization. |
| **Runtime Utilities** | **TypeScript + tsx** | Type safety and execution of server scripts. |

---

## 🏗️ System Architecture & Data Flow

The codebase is structured into two main logical parts: **Ingestion Engines (Backend/Scripts)** and the **Web Dashboard (Next.js)**.

```mermaid
graph TD
    %% Styling
    classDef engine fill:#312e81,stroke:#6366f1,stroke-width:2px,color:#fff;
    classDef store fill:#1e1b4b,stroke:#8b5cf6,stroke-width:2px,color:#fff;
    classDef web fill:#0f172a,stroke:#3b82f6,stroke-width:2px,color:#fff;
    
    subgraph Ingestion_Layer [Ingestion Layer]
        L_Idx[listener/index.ts] -->|Spawns| L_Disc[listener/discord.ts]:::engine
        L_Idx -.->|Future stub| L_Twit[listener/twitter.ts]:::engine
        S_Scrape[listener/scraper.ts]:::engine -->|Puppeteer Session| DiscordWeb[Discord Web Interface]
    end

    subgraph Data_Storage [Data Storage & Caches]
        DB_Json[(data.json)]:::store
        DB_SQLite[(dev.db SQLite)]:::store
        Dir_Hist[scraped_data/YYYY-MM-DD/]:::store
        Dir_Live[scraped_data/live_media/]:::store
        File_Sum[scraped_data/summary.json]:::store
    end

    subgraph UI_Layer [API & Frontend Dashboard]
        API_Msg[src/app/api/messages/route.ts]:::web
        API_Sum[src/app/api/summary/route.ts]:::web
        API_Med[src/app/api/media/[...path]/route.ts]:::web
        UI_Dash[src/app/page.tsx]:::web
    end

    %% Ingestion flows
    L_Disc -->|Event: messageCreate| DB_Json
    L_Disc -->|Sync History on Startup| DB_Json
    L_Twit -.->|Write message| DB_SQLite
    S_Scrape -->|Scrape messages & download media| DB_Json
    S_Scrape -->|Write JSON & local attachments| Dir_Hist
    S_Scrape -->|Download live dashboard assets| Dir_Live
    S_Scrape -->|Generate Gemini Summary & statistics| File_Sum

    %% API flows
    API_Msg -->|Reads messages| DB_Json
    API_Sum -->|Reads summaries| File_Sum
    API_Med -->|Serves local media| Dir_Live
    API_Med -->|Serves historical media| Dir_Hist

    %% Client flows
    UI_Dash -->|Polls updates| API_Msg
    UI_Dash -->|Fetches Analytics| API_Sum
    UI_Dash -->|Displays media from| API_Med
```

### Ingestion Flows:
1. **Real-time Listener (`npm run listener`)**: 
   * Active Discord Bot connects to the Discord gateway via WebSocket.
   * On startup, it triggers `fetchChannelHistory()` to pull the last `1000` messages from each channel specified in `DISCORD_CHANNEL_IDS`.
   * Listens to the `messageCreate` event to append new live messages to `data.json`.
2. **Browser Scraper (`npm run scrape`)**:
   * Uses Puppeteer to launch a headed/headless browser, navigates to Discord login, logs in via email/password, and traverses channels in `DISCORD_SCRAPE_CHANNELS`.
   * Automatically scrolls back through history, downloads files, images, attachments, and sticker URLs to the local system, and updates the dashboard feed.
   * Hits the Gemini API to analyze the textual content and generate a structural markdown Executive Summary.

---

## ⚡ Capabilities & Features

*   **Deduplicated Media Downloader**: Downloads and caches files (images, videos, PDFs, GIFs, stickers) locally under `scraped_data/` to avoid hotlinking expired Discord CDNs.
*   **Keyword Extraction & Frequency Tables**: Automatically counts and filters out common English stop-words to display the most trending topics in your dashboard.
*   **AI Executive Summaries**: Summarizes the conversation sentiment, main themes, and key announcements using `gemini-2.0-flash`.
*   **Next-gen Dashboard UI**: A fully-responsive, glassmorphic dark-mode web application featuring:
    *   **Real-time polling** (refreshes messages feed every 5 seconds).
    *   **Filtering** (All feeds vs. Discord-only vs. Twitter-only).
    *   **Visual inspector** (custom components for playing video attachments, expanding high-res images, downloading files, and rendering inline GIFs and stickers).
    *   **Analytics view** (top active authors leaderboard, hashtag clouds, AI summary panel).

---

## 📁 Repository Structure

```markdown
├── listener/
│   ├── index.ts               # Listener entry point
│   ├── discord.ts             # Discord gateway bot logic
│   ├── scraper.ts             # Discord Puppeteer automated scraper
│   └── twitter.ts             # Twitter polling/stream listener stub
├── prisma/
│   ├── schema.prisma          # Prisma schema definition
│   └── dev.db                 # SQLite local database file
├── scraped_data/              # Local media files and structured daily data
│   ├── live_media/            # Attachments used by the active feed dashboard
│   ├── summary.json           # Aggregated statistics and Gemini AI summary
│   └── YYYY-MM-DD/            # Historical folder structure containing JSON files and media/
├── src/app/
│   ├── page.tsx               # Interactive React Feed Dashboard
│   ├── globals.css            # Base Tailwind definitions and custom CSS overrides
│   └── api/
│       ├── messages/          # API endpoint to fetch data.json messages
│       ├── summary/           # API endpoint to fetch summary.json stats
│       └── media/             # Dynamic route serving downloaded files/images
├── data.json                  # Flat file JSON database representing the dashboard cache
```

---

## 🚀 Getting Started (How to Run Locally)

### 1. Prerequisites
Ensure you have **Node.js** (v18+) and **npm** or **yarn** installed on your system.

### 2. Configure Environment Variables
Create a `.env` file in the root of the project with the following properties:
```env
# Database Path
DATABASE_URL="file:./dev.db"

# Discord Bot Listener Configuration (npm run listener)
DISCORD_BOT_TOKEN="your_discord_bot_token"
DISCORD_CHANNEL_IDS="channel_id_1,channel_id_2"

# Discord Scraper Configuration (npm run scrape)
DISCORD_EMAIL="your_discord_account_email"
DISCORD_PASSWORD="your_discord_account_password"
DISCORD_SCRAPE_CHANNELS="guild_id/channel_id_1,guild_id/channel_id_2"

# Gemini AI Key
GEMINI_API_KEY="your_google_gemini_api_key"
```

### 3. Run Ingestion Engines

#### Start the Real-time Gateway Listener
Saves new messages and pulls active channel histories in the background:
```bash
npm run listener
```

#### Run the Puppeteer Scraper & AI Summarizer
Spins up the browser session, downloads all assets, and recalculates the statistics / Gemini AI summary:
```bash
npm run scrape
```

### 4. Launch the Dashboard
Run the Next.js development server:
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser to view the active feed and analytics dashboard.

---

## ☁️ Deployment Guide

This repository contains components that require different hosting environments:

### A. Dashboard Frontend (Next.js)
The frontend and API routes are stateless and can be easily deployed to modern serverless environments:
*   **Vercel / Firebase App Hosting / Netlify**: Simply link your GitHub repo. Next.js will build output routes and compile React components out-of-the-box.
*   *Note*: If deploying serverless, the `data.json` flat-file DB will reset on serverless function restarts. For a production deployment, ensure you modify `src/app/api/messages/route.ts` to query the SQLite/Postgres DB through Prisma rather than reading the local JSON file.

### B. Listener & Scraper Backend (Long-Running Processes)
The ingestion engines **cannot** be run serverless, as they rely on persistent WebSocket connections (Discord gateway bot) or automated browser environments (Puppeteer):
1. **Host on Virtual Machines (VPS)**: Deploy on services like **DigitalOcean Droplets**, **AWS EC2**, or **Google Compute Engine**.
2. **Container Host (Docker)**: Build a Docker container containing the Node runtime and the system libraries needed for Chromium (Puppeteer) to run headlessly.
3. **Execution Schedule**:
   * Run the **Listener** as a system daemon (e.g. using `pm2` or `systemd`) to keep it active 24/7.
   * Run the **Scraper** as a cron job (e.g. once every hour/day) to pull bulk history and generate updated AI summaries.
