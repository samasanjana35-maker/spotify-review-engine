const express = require('express');
const { getScrapeRunWithStats } = require('../db/queries');
const {
  activeScrapes,
  pipelinePhases,
  startPipeline,
} = require('../services/pipelineService');
const { formatScrapeRunStatus, getLatestScrapeStatus } = require('../services/dashboardService');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const triggeredBy = req.body?.triggeredBy || 'manual';
    const scrapeRunId = await startPipeline(triggeredBy);

    res.status(202).json({
      message: 'Scrape started',
      scrapeRunId,
    });
  } catch (err) {
    logger.error(`POST /api/scrape failed: ${err.message}`);
    next(err);
  }
});

router.get('/status/:runId', async (req, res, next) => {
  try {
    const { runId } = req.params;
    const { scrapeRun, sourceStats } = await getScrapeRunWithStats(runId);
    const status = formatScrapeRunStatus(scrapeRun, sourceStats);
    const isRunning = activeScrapes.has(runId);
    const phase = pipelinePhases.get(runId) || (scrapeRun.status === 'completed' ? 'done' : 'scraping');

    res.json({
      ...status,
      isRunning,
      phase,
      pipelineComplete: !isRunning && (scrapeRun.status === 'completed' || scrapeRun.status === 'failed'),
    });
  } catch (err) {
    logger.error(`GET /api/scrape/status/${req.params.runId} failed: ${err.message}`);
    err.statusCode = err.statusCode || 404;
    next(err);
  }
});

router.get('/latest', async (req, res, next) => {
  try {
    const status = await getLatestScrapeStatus();
    if (!status) {
      return res.status(404).json({ message: 'No scrape runs found' });
    }
    res.json(status);
  } catch (err) {
    logger.error(`GET /api/scrape/latest failed: ${err.message}`);
    next(err);
  }
});

module.exports = router;
