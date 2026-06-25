const {
  getLatestCompletedScrapeRun,
  getLatestScrapeRunWithReviews,
  getScrapeRunWithStats,
  getAnalysisForScrapeRun,
  getRelevantReviewsForRun,
  getReviewTrendData,      // UPGRADE 4
} = require('../db/queries');
const { KEYWORDS, KEYWORD_COUNT } = require('../config/constants');
const { PROMPT_VERSION } = require('./analysisService');

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

// ---------------------------------------------------------------------------
// UPGRADE 4: Build the trend chart payload
// Returns { labels: ['2024-01', ...], datasets: [{ source, data: [n, ...] }] }
// ---------------------------------------------------------------------------

function buildTrendChartData(rawTrend, monthsBack = 12) {
  // Generate the last N months as labels
  const labels = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  // Build a lookup: month → source → count
  const lookup = {};
  for (const row of rawTrend || []) {
    if (!lookup[row.month]) lookup[row.month] = {};
    lookup[row.month][row.source] = (lookup[row.month][row.source] || 0) + row.count;
  }

  // Produce one dataset per source
  const datasets = ALL_SOURCES.map((source) => ({
    source,
    label: SOURCE_LABELS[source] || source,
    data: labels.map((month) => lookup[month]?.[source] || 0),
  }));

  // Only include sources with at least one non-zero month
  const activeSources = datasets.filter((ds) => ds.data.some((n) => n > 0));

  return { labels, datasets: activeSources };
}

// ---------------------------------------------------------------------------
// UPGRADE 7: Methodology metadata for the transparency panel
// ---------------------------------------------------------------------------

function buildMethodologyMeta(analysis, scrapeRun, dateRangeLabel) {
  return {
    keywords: KEYWORDS,
    keywordCount: KEYWORD_COUNT,
    filterLogic: 'A review is marked relevant if ANY keyword appears in its title or body (case-insensitive substring match).',
    aiModel: analysis?.modelUsed || process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
    promptVersion: analysis?.promptVersion || PROMPT_VERSION,
    dateRange: dateRangeLabel || 'Last 90 days',
    scrapeStarted: scrapeRun?.started_at || null,
    scrapeCompleted: scrapeRun?.completed_at || null,
    reviewCountAnalyzed: analysis?.reviewCountAnalyzed || 0,
    confidenceNote:
      `Analysis based on ${analysis?.reviewCountAnalyzed || 0} relevant reviews. ` +
      `Findings backed by fewer than 5 reviews are marked [LOW CONFIDENCE]. Segment tags (free user, premium user, etc.) are inferred from review language by the AI and have not been human-validated.`,
    lowConfidenceThreshold: 5,
  };
}

// ---------------------------------------------------------------------------
// Main dashboard data builder
// ---------------------------------------------------------------------------

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
      trendChart: { labels: [], datasets: [] },
      methodology: buildMethodologyMeta(null, null, null),
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

  // UPGRADE 4: trend data (all sources, last 12 months)
  const rawTrend = await getReviewTrendData(null, 12);
  const trendChart = buildTrendChartData(rawTrend, 12);

  let analysis = null;
  if (analysisRow) {
    analysis = {
      q1: { ...analysisRow.q1, evidence: enrichEvidence(analysisRow.q1?.evidence, reviews) },
      q2: { ...analysisRow.q2, evidence: enrichEvidence(analysisRow.q2?.evidence, reviews) },
      q3: { ...analysisRow.q3, evidence: enrichEvidence(analysisRow.q3?.evidence, reviews) },
      q4: { ...analysisRow.q4, evidence: enrichEvidence(analysisRow.q4?.evidence, reviews) },
      q5: { ...analysisRow.q5, evidence: enrichEvidence(analysisRow.q5?.evidence, reviews) },
      q6: { ...analysisRow.q6, evidence: enrichEvidence(analysisRow.q6?.evidence, reviews) },
      summary: analysisRow.summary,
      reviewCountAnalyzed: analysisRow.review_count_analyzed,
      modelUsed: analysisRow.model_used,
      promptVersion: analysisRow.prompt_version || '1.0',
      // UPGRADE 5
      pmSurprises: analysisRow.pm_surprises || [],
      // UPGRADE 6
      segmentMatrix: analysisRow.segment_matrix || null,
    };
  }

  const reviewCount = analysisRow?.review_count_analyzed || totalFiltered;
  const lastUpdated =
    analysisRow?.created_at ||
    scrapeRun.completed_at ||
    scrapeRun.started_at ||
    new Date().toISOString();

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
    trendChart,  // UPGRADE 4
    methodology: buildMethodologyMeta(analysis, scrapeRun, 'Last 90 days'),  // UPGRADE 7
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
