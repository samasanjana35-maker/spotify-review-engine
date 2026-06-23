const { createScrapeRun } = require('../db/queries');
const { runScrapeOrchestrator } = require('./scraperOrchestrator');
const { analyzeReviews } = require('./analysisService');
const logger = require('../utils/logger');

const activeScrapes = new Set();
const pipelinePhases = new Map();

async function runFullPipeline(scrapeRunId, triggeredBy) {
  pipelinePhases.set(scrapeRunId, 'scraping');
  logger.info(`[pipeline] START scrapeRunId=${scrapeRunId}`);

  try {
    const orchestratorResult = await runScrapeOrchestrator(triggeredBy, scrapeRunId);
    logger.info(`[pipeline] Scrapers finished — scrapeRunId=${scrapeRunId} marked completed in DB`);

    pipelinePhases.set(scrapeRunId, 'analyzing');
    logger.info(`[pipeline] Starting Claude analysis for scrapeRunId=${scrapeRunId}`);
    await analyzeReviews(scrapeRunId);

    pipelinePhases.set(scrapeRunId, 'done');
    logger.info(`[pipeline] COMPLETE scrapeRunId=${scrapeRunId}`);

    return { storedCount: orchestratorResult.totalStored };
  } catch (err) {
    pipelinePhases.set(scrapeRunId, 'failed');
    logger.error(`[pipeline] FAILED scrapeRunId=${scrapeRunId}: ${err.message}`);
    throw err;
  } finally {
    activeScrapes.delete(scrapeRunId);
    logger.info(`[pipeline] Removed from activeScrapes: ${scrapeRunId}`);
  }
}

async function startPipeline(triggeredBy = 'manual') {
  const scrapeRun = await createScrapeRun(triggeredBy);
  const scrapeRunId = scrapeRun.id;

  activeScrapes.add(scrapeRunId);
  pipelinePhases.set(scrapeRunId, 'scraping');

  runFullPipeline(scrapeRunId, triggeredBy).catch((err) => {
    logger.error(`Unhandled pipeline error for ${scrapeRunId}: ${err.message}`);
    activeScrapes.delete(scrapeRunId);
    pipelinePhases.set(scrapeRunId, 'failed');
  });

  return scrapeRunId;
}

function isPipelineRunning() {
  return activeScrapes.size > 0;
}

module.exports = {
  activeScrapes,
  pipelinePhases,
  runFullPipeline,
  startPipeline,
  isPipelineRunning,
};
