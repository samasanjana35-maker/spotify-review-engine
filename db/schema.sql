-- Spotify Review Discovery Engine — Phase 2 Schema
-- Run in Supabase Dashboard → SQL Editor → New Query → Run

-- =============================================================================
-- scrape_runs: one row per scrape session (manual or cron)
-- =============================================================================
CREATE TABLE IF NOT EXISTS scrape_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by  TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  error_summary TEXT
);

-- =============================================================================
-- source_stats: per-source counts and status for each scrape run
-- =============================================================================
CREATE TABLE IF NOT EXISTS source_stats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_run_id   UUID NOT NULL REFERENCES scrape_runs(id) ON DELETE CASCADE,
  source          TEXT NOT NULL CHECK (source IN ('app_store', 'play_store', 'reddit', 'forums', 'bluesky')),
  raw_count       INTEGER NOT NULL DEFAULT 0,
  filtered_count  INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL,
  error_message   TEXT
);

-- =============================================================================
-- reviews: scraped review content with keyword filtering metadata
-- =============================================================================
CREATE TABLE IF NOT EXISTS reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_run_id     UUID NOT NULL REFERENCES scrape_runs(id) ON DELETE CASCADE,
  source            TEXT NOT NULL,
  external_id       TEXT NOT NULL UNIQUE,
  author            TEXT,
  rating            INTEGER,
  title             TEXT,
  body              TEXT NOT NULL,
  url               TEXT,
  review_date       TIMESTAMPTZ NOT NULL,
  metadata          JSONB NOT NULL DEFAULT '{}',
  matched_keywords  TEXT[] NOT NULL DEFAULT '{}',
  is_relevant       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_reviews_scrape_run_id ON reviews(scrape_run_id);
CREATE INDEX IF NOT EXISTS idx_reviews_source ON reviews(source);
CREATE INDEX IF NOT EXISTS idx_reviews_review_date ON reviews(review_date);
CREATE INDEX IF NOT EXISTS idx_reviews_external_id ON reviews(external_id);

-- =============================================================================
-- analysis_results: Claude AI output for the 6 research questions
-- =============================================================================
CREATE TABLE IF NOT EXISTS analysis_results (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_run_id         UUID NOT NULL REFERENCES scrape_runs(id) ON DELETE CASCADE,
  q1                    JSONB,
  q2                    JSONB,
  q3                    JSONB,
  q4                    JSONB,
  q5                    JSONB,
  q6                    JSONB,
  summary               TEXT,
  review_count_analyzed INTEGER,
  model_used            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
