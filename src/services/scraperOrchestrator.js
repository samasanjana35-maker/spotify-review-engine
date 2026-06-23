const { scrapeAppStore } = require('../scrapers/appStore');
const { scrapePlayStore } = require('../scrapers/playStore');
const { scrapeReddit } = require('../scrapers/reddit');
const { scrapeForums } = require('../scrapers/forums');
const { scrapeBluesky } = require('../scrapers/bluesky');
const { filterReviews, getFilterStats } = require('./keywordFilter');
const {
  createScrapeRun,
  updateScrapeRun,
  createSourceStat,
  updateSourceStat,
  insertReviews,
} = require('../db/queries');
const logger = require('../utils/logger');

const SCRAPERS = [
  { key: 'appStore', source: 'app_store', fn: scrapeAppStore },
  { key: 'playStore', source: 'play_store', fn: scrapePlayStore },
  { key: 'reddit', source: 'reddit', fn: scrapeReddit },
  { key: 'forums', source: 'forums', fn: scrapeForums },
  { key: 'bluesky', source: 'bluesky', fn: scrapeBluesky },
];

async function runSingleScraper(scraper, scrapeRunId) {
  const { key, source, fn } = scraper;
  const sourceStat = await createSourceStat(scrapeRunId, source);

  try {
    const reviews = await fn();
    return {
      key,
      source,
      reviews,
      sourceStatId: sourceStat.id,
      status: 'success',
      error: null,
    };
  } catch (err) {
    return {
      key,
      source,
      reviews: [],
      sourceStatId: sourceStat.id,
      status: 'failed',
      error: err.message,
    };
  }
}

async function runAllScrapers() {
  const settled = await Promise.allSettled(SCRAPERS.map(({ fn }) => fn()));

  const stats = {};
  const reviews = [];

  settled.forEach((result, index) => {
    const { key, source } = SCRAPERS[index];

    if (result.status === 'fulfilled') {
      const count = result.value.length;
      reviews.push(...result.value);
      stats[key] = { count, status: 'success', error: null };
      logger.info(`✅ ${source}: ${count} reviews scraped`);
    } else {
      const errorMessage = result.reason?.message || String(result.reason);
      stats[key] = { count: 0, status: 'failed', error: errorMessage };
      logger.error(`❌ ${source}: ${errorMessage}`);
    }
  });

  return { reviews, stats };
}

async function runScrapeOrchestrator(triggeredBy = 'manual', existingScrapeRunId = null) {
  let scrapeRunId = existingScrapeRunId;

  if (!scrapeRunId) {
    const scrapeRun = await createScrapeRun(triggeredBy);
    scrapeRunId = scrapeRun.id;
  }

  logger.info(`Scrape run ${existingScrapeRunId ? 'continuing' : 'created'}: ${scrapeRunId} (triggered_by=${triggeredBy})`);

  try {
    const settled = await Promise.allSettled(
      SCRAPERS.map((scraper) => runSingleScraper(scraper, scrapeRunId))
    );

    const scraperResults = [];
    const allRawReviews = [];
    const stats = {};

    settled.forEach((result, index) => {
      const { key, source } = SCRAPERS[index];

      if (result.status === 'fulfilled') {
        scraperResults.push(result.value);
        allRawReviews.push(...result.value.reviews);
        stats[key] = {
          count: result.value.reviews.length,
          status: result.value.status,
          error: result.value.error,
        };
        logger.info(`✅ ${source}: ${result.value.reviews.length} reviews scraped`);
      } else {
        const errorMessage = result.reason?.message || String(result.reason);
        stats[key] = { count: 0, status: 'failed', error: errorMessage };
        logger.error(`❌ ${source}: ${errorMessage}`);
      }
    });

    const filteredReviews = filterReviews(allRawReviews);
    const filterStats = getFilterStats(filteredReviews);

    logger.info(
      `Keyword filter stats: ${filterStats.relevant}/${filterStats.total} relevant (${filterStats.relevanceRate}%)`
    );

    for (const result of scraperResults) {
      const sourceReviews = filteredReviews.filter((r) => r.source === result.source);
      const rawCount = result.reviews.length;
      const filteredCount = sourceReviews.filter((r) => r.is_relevant).length;

      await updateSourceStat(result.sourceStatId, {
        rawCount,
        filteredCount,
        status: result.status === 'success' ? 'completed' : 'failed',
        errorMessage: result.error,
      });

      logger.info(
        `${result.source}: raw=${rawCount}, filtered=${filteredCount}, status=${result.status}`
      );
    }

    const relevantReviews = filteredReviews
      .filter((r) => r.is_relevant)
      .map((r) => ({
        scrape_run_id: scrapeRunId,
        source: r.source,
        external_id: r.external_id,
        author: r.author,
        rating: r.rating,
        title: r.title,
        body: r.body,
        url: r.url,
        review_date: r.review_date,
        metadata: r.metadata || {},
        matched_keywords: r.matched_keywords,
        is_relevant: r.is_relevant,
      }));

    const totalStored = await insertReviews(relevantReviews);
    logger.info(`Inserted ${totalStored} relevant reviews into Supabase`);

    const failedSources = Object.entries(stats)
      .filter(([, s]) => s.status === 'failed')
      .map(([k]) => k);

    const runStatus = failedSources.length === SCRAPERS.length ? 'failed' : 'completed';
    const errorSummary = failedSources.length > 0
      ? `Failed sources: ${failedSources.join(', ')}`
      : null;

    await updateScrapeRun(scrapeRunId, runStatus, errorSummary);
    logger.info(`[orchestrator] updateScrapeRun(${scrapeRunId}, '${runStatus}') called`);

    return {
      scrapeRunId,
      totalScraped: allRawReviews.length,
      totalFiltered: filterStats.relevant,
      totalStored,
      stats,
      filterStats,
    };
  } catch (err) {
    logger.error(`Pipeline failed: ${err.message}`);
    await updateScrapeRun(scrapeRunId, 'failed', err.message);
    throw err;
  }
}

module.exports = { runAllScrapers, runScrapeOrchestrator };
