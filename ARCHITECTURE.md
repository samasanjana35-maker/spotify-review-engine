# Spotify Review Discovery Engine — Architecture Plan

Production-ready AI-powered Review Discovery Engine for Spotify. Analyzes user feedback from multiple sources to answer 6 discovery-related research questions.

## System Overview

```
Frontend (Vanilla JS) → Express API (Railway) → Scrapers → Keyword Filter → Supabase
                                                    ↓
                                              Claude Analysis
```

**Data flow:** User clicks "Scrape Now" → orchestrator runs all 5 scrapers in parallel (failures isolated) → raw reviews stored → keyword filter applied → filtered reviews stored → Claude analyzes filtered corpus → 6 answers + source stats written to DB → dashboard reads latest run.

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** Supabase (PostgreSQL)
- **AI:** Anthropic Claude API (`claude-3-5-sonnet-20241022`)
- **Scrapers:** app-store-scraper, google-play-scraper, axios, cheerio
- **Social:** Bluesky public API (bsky.social)
- **Frontend:** HTML, CSS, vanilla JavaScript — Spotify branded (`#1DB954`, `#191414`)
- **Deployment:** Railway (Procfile)
- **Cron:** node-cron (weekly refresh every Sunday midnight)

## Context

- **Product:** Spotify
- **App Store ID:** 324684580
- **Play Store ID:** com.spotify.music
- **Data range:** Last 90 days of reviews
- **Target:** Global reviews
- **Keywords:** discovery, recommend, repeat, same songs, bored, algorithm, suggest, Discover Weekly, find new, explore, tired, stuck, refresh, new music

## The 6 Questions

1. Why do users struggle to discover new music?
2. What are the most common frustrations with recommendations?
3. What listening behaviors are users trying to achieve?
4. What causes users to repeatedly listen to the same content?
5. Which user segments experience different discovery challenges?
6. What unmet needs emerge consistently across reviews?

---

## Phase 1: Project Setup & Folder Structure

**Goal:** Bootstrap deployable Node.js project with clear separation of concerns.

**Files:** Procfile, package.json, .gitignore, .env.example, src/index.js, config/, scrapers/, services/, routes/, middleware/, utils/, public/, db/schema.sql (placeholder)

**Packages:** express, dotenv, cors, node-cron

**Testable:** `npm start`, `GET /health` returns `{ status: "ok" }`, static files served

**Complexity:** Low

---

## Phase 2: Database Schema & Supabase Connection

**Goal:** PostgreSQL schema in Supabase and working connection layer.

**Tables:** scrape_runs, source_stats, reviews, analysis_results

**Packages:** @supabase/supabase-js

**Testable:** schema.sql applied, DB ping works, test row insert/read

**Complexity:** Medium

---

## Phase 3: Data Scrapers

**Goal:** Five independent scraper modules returning normalized review objects (90-day window).

**Sources:** App Store, Play Store, Reddit, Spotify Community Forums, Bluesky

**Packages:** app-store-scraper, google-play-scraper, axios, cheerio

**Normalized output:** `{ success, source, reviews[], error }`

**Complexity:** High

---

## Phase 4: Keyword Filtering & Data Storage

**Goal:** Orchestrate scrapers, apply keyword filter, persist reviews and source stats.

**Key file:** scraperOrchestrator.js — Promise.allSettled, per-source error isolation

**Complexity:** Medium

---

## Phase 5: Claude AI Analysis Engine

**Goal:** Send filtered reviews to Claude, produce structured answers to all 6 questions.

**Packages:** @anthropic-ai/sdk

**Strategy:** Stratified sample if >150 reviews, JSON-only response, retry on parse failure

**Complexity:** High

---

## Phase 6: Backend API & Express Server

**Endpoints:**
- `POST /api/scrape` — trigger full pipeline
- `GET /api/dashboard` — latest run data + 6 answers
- `GET /api/health` — health check
- `GET /api/analysis/latest` — latest analysis

**Complexity:** Medium

---

## Phase 7: Frontend Dashboard

**Goal:** Spotify-branded dashboard with scrape button, source stats, 6 question cards.

**Theme:** #1DB954 green, #191414 black

**Complexity:** Medium

---

## Phase 8: Cron Job & Railway Deployment

**Goal:** Weekly cron (`0 0 * * 0` UTC) + live Railway URL.

**Complexity:** Medium

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| PORT | Yes (auto on Railway) | HTTP port |
| NODE_ENV | Yes | development \| production |
| SUPABASE_URL | Yes | Supabase project URL |
| SUPABASE_SERVICE_ROLE_KEY | Yes | Backend DB access |
| ANTHROPIC_API_KEY | Yes | Claude API key |
| CLAUDE_MODEL | No | Default: claude-3-5-sonnet-20241022 |
| REDDIT_USER_AGENT | Yes | Reddit API user agent |
| CRON_SCHEDULE | No | Default: 0 0 * * 0 |
| CRON_TIMEZONE | No | Default: UTC |
| SCRAPE_TIMEOUT_MS | No | Default: 30000 |
| MAX_REVIEWS_FOR_ANALYSIS | No | Default: 150 |
| LOG_LEVEL | No | info \| debug |
