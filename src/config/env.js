require('dotenv').config();

const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'REDDIT_USER_AGENT',
];

function validateEnv() {
  for (const key of REQUIRED_VARS) {
    if (!process.env[key] || process.env[key].trim() === '') {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

const env = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
  redditUserAgent: process.env.REDDIT_USER_AGENT,
  cronSchedule: process.env.CRON_SCHEDULE || '0 0 * * 0',
  cronTimezone: process.env.CRON_TIMEZONE || 'UTC',
  scrapeTimeoutMs: parseInt(process.env.SCRAPE_TIMEOUT_MS, 10) || 30000,
  maxReviewsForAnalysis: parseInt(process.env.MAX_REVIEWS_FOR_ANALYSIS, 10) || 150,
  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = { validateEnv, env };
