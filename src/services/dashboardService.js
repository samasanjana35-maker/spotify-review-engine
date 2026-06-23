const {
  getLatestCompletedScrapeRun,
  getLatestScrapeRunWithReviews,
  getScrapeRunWithStats,
  getAnalysisForScrapeRun,
  getRelevantReviewsForRun,
} = require('../db/queries');

const SOURCE_LABELS = {
  app_store: 'App Store',
  play_store: 'Play Store',
  reddit: 'Reddit',
  forums: 'Community Forums',
  bluesky: 'Bluesky',
};

const ALL_SOURCES = ['app_store', 'play_store', 'reddit', 'forums', 'bluesky'];

function estimateAnalysisCost(reviewCount) {
  if (!reviewCount) return 0;
  return (reviewCount / 139) * 0.089;
}

function inferSourceForQuote(quote, reviews) {
  if (!quote || !reviews?.length) return 'Review';

  const normalized = quote.toLowerCase().slice(0, 80);
  for (const review of reviews) {
    if (review.body && review.body.toLowerCase().includes(normalized.slice(0, 40))) {
      return SOURCE_LABELS[review.source] || review.source;
    }
  }

  for (const review of reviews) {
    const words = quote.split(/\s+/).slice(0, 6).join(' ').toLowerCase();
    if (words.length > 10 && review.body?.toLowerCase().includes(words)) {
      return SOURCE_LABELS[review.source] || review.source;
    }
  }

  return 'Review';
}

function enrichEvidence(evidence, reviews) {
  return (evidence || []).slice(0, 3).map((quote) => ({
    text: quote,
    source: inferSourceForQuote(quote, reviews),
  }));
}

function buildSourcesMap(sourceStats) {
  const sources = {};
  for (const key of ALL_SOURCES) {
    sources[key] = { raw: 0, filtered: 0 };
  }

  for (const stat of sourceStats || []) {
    sources[stat.source] = {
      raw: stat.raw_count || 0,
      filtered: stat.filtered_count || 0,
    };
  }

  return sources;
}

function formatScrapeRunStatus(scrapeRun, sourceStats) {
  const sources = {};
  let totalScraped = 0;
  let totalFiltered = 0;

  for (const stat of sourceStats || []) {
    sources[stat.source] = {
      raw: stat.raw_count || 0,
      filtered: stat.filtered_count || 0,
      status: stat.status,
    };
    totalScraped += stat.raw_count || 0;
    totalFiltered += stat.filtered_count || 0;
  }

  return {
    scrapeRunId: scrapeRun.id,
    status: scrapeRun.status,
    totalScraped,
    totalFiltered,
    totalStored: totalFiltered,
    startedAt: scrapeRun.started_at,
    completedAt: scrapeRun.completed_at,
    sources,
  };
}

async function getDashboardData() {
  const scrapeRun = await getLatestCompletedScrapeRun();
  if (!scrapeRun) {
    return {
      lastScrapeRun: null,
      stats: {
        totalScraped: 0,
        totalFiltered: 0,
        totalStored: 0,
        sources: buildSourcesMap([]),
      },
      analysis: null,
      analysisCost: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  const { sourceStats } = await getScrapeRunWithStats(scrapeRun.id);
  const sources = buildSourcesMap(sourceStats);

  let totalScraped = 0;
  let totalFiltered = 0;
  for (const stat of sourceStats || []) {
    totalScraped += stat.raw_count || 0;
    totalFiltered += stat.filtered_count || 0;
  }

  const analysisRow = await getAnalysisForScrapeRun(scrapeRun.id);
  const reviews = await getRelevantReviewsForRun(scrapeRun.id);

  let analysis = null;
  if (analysisRow) {
    analysis = {
      q1: {
        ...analysisRow.q1,
        evidence: enrichEvidence(analysisRow.q1?.evidence, reviews),
      },
      q2: {
        ...analysisRow.q2,
        evidence: enrichEvidence(analysisRow.q2?.evidence, reviews),
      },
      q3: {
        ...analysisRow.q3,
        evidence: enrichEvidence(analysisRow.q3?.evidence, reviews),
      },
      q4: {
        ...analysisRow.q4,
        evidence: enrichEvidence(analysisRow.q4?.evidence, reviews),
      },
      q5: {
        ...analysisRow.q5,
        evidence: enrichEvidence(analysisRow.q5?.evidence, reviews),
      },
      q6: {
        ...analysisRow.q6,
        evidence: enrichEvidence(analysisRow.q6?.evidence, reviews),
      },
      summary: analysisRow.summary,
      reviewCountAnalyzed: analysisRow.review_count_analyzed,
      modelUsed: analysisRow.model_used,
    };
  }

  const reviewCount = analysisRow?.review_count_analyzed || totalFiltered;

  const lastUpdated = analysisRow?.created_at
    || scrapeRun.completed_at
    || scrapeRun.started_at
    || new Date().toISOString();

  return {
    lastScrapeRun: {
      scrapeRunId: scrapeRun.id,
      status: scrapeRun.status,
      startedAt: scrapeRun.started_at,
      completedAt: scrapeRun.completed_at,
    },
    stats: {
      totalScraped,
      totalFiltered,
      totalStored: totalFiltered,
      sources,
    },
    analysis,
    analysisCost: estimateAnalysisCost(reviewCount),
    lastUpdated,
  };
}

async function getLatestScrapeStatus() {
  const scrapeRun = await getLatestCompletedScrapeRun();
  if (!scrapeRun) return null;

  const { sourceStats } = await getScrapeRunWithStats(scrapeRun.id);
  return formatScrapeRunStatus(scrapeRun, sourceStats);
}

module.exports = {
  getDashboardData,
  getLatestScrapeStatus,
  formatScrapeRunStatus,
  SOURCE_LABELS,
  ALL_SOURCES,
};
