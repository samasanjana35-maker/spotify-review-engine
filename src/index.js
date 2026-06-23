const path = require('path');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { validateEnv, env } = require('./config/env');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { getLatestScrapeRun, createScrapeRun } = require('./db/queries');
const {
  runFullPipeline,
  isPipelineRunning,
  activeScrapes,
} = require('./services/pipelineService');

const scrapeRoutes = require('./routes/scrape');
const analysisRoutes = require('./routes/analysis');
const dashboardRoutes = require('./routes/dashboard');

validateEnv();

const app = express();
const PORT = env.port;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

app.use('/api/scrape', scrapeRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use(errorHandler);

async function runCronScrape() {
  if (isPipelineRunning()) {
    logger.warn('[CRON] Weekly scrape skipped — pipeline already running');
    return;
  }

  logger.info('[CRON] Weekly scrape started');

  try {
    const scrapeRun = await createScrapeRun('cron');
    activeScrapes.add(scrapeRun.id);
    const { storedCount } = await runFullPipeline(scrapeRun.id, 'cron');
    logger.info(`[CRON] Weekly scrape completed — ${storedCount} reviews stored`);
  } catch (err) {
    logger.error(`[CRON] Weekly scrape failed: ${err.message}`);
  }
}

function startCronJob() {
  const schedule = env.cronSchedule;
  const timezone = env.cronTimezone;

  if (!cron.validate(schedule)) {
    logger.error(`[CRON] Invalid schedule "${schedule}" — cron job not started`);
    return;
  }

  cron.schedule(schedule, () => {
    runCronScrape().catch((err) => {
      logger.error(`[CRON] Weekly scrape failed: ${err.message}`);
    });
  }, { timezone });

  logger.info(`[CRON] Scheduled weekly scrape: "${schedule}" (${timezone})`);
}

app.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);

  try {
    await getLatestScrapeRun();
    logger.info('✅ Supabase connected — database ready');
  } catch (err) {
    logger.error(`❌ Supabase connection failed: ${err.message}`);
    process.exit(1);
  }

  startCronJob();
});

module.exports = app;
