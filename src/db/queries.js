const supabase = require('../config/supabase');

// Start a new scrape session when the user clicks "Scrape" or cron fires.
async function createScrapeRun(triggeredBy) {
  const { data, error } = await supabase
    .from('scrape_runs')
    .insert({ triggered_by: triggeredBy, status: 'running' })
    .select()
    .single();

  if (error) {
    throw new Error(`createScrapeRun failed: ${error.message}`);
  }

  return data;
}

// Mark a scrape run as completed or failed after all sources finish.
async function updateScrapeRun(id, status, errorSummary = null) {
  const { data, error } = await supabase
    .from('scrape_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      error_summary: errorSummary,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`updateScrapeRun failed: ${error.message}`);
  }

  return data;
}

// Record a source_stats row before scraping begins for a given source.
async function createSourceStat(scrapeRunId, source) {
  const { data, error } = await supabase
    .from('source_stats')
    .insert({
      scrape_run_id: scrapeRunId,
      source,
      raw_count: 0,
      filtered_count: 0,
      status: 'running',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`createSourceStat failed: ${error.message}`);
  }

  return data;
}

// Update per-source counts and status after a source finishes scraping.
async function updateSourceStat(id, { rawCount, filteredCount, status, errorMessage = null }) {
  const { data, error } = await supabase
    .from('source_stats')
    .update({
      raw_count: rawCount,
      filtered_count: filteredCount,
      status,
      error_message: errorMessage,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`updateSourceStat failed: ${error.message}`);
  }

  return data;
}

// Bulk upsert scraped reviews, updating scrape_run_id on duplicate external_id.
async function insertReviews(reviewsArray) {
  if (!reviewsArray || reviewsArray.length === 0) {
    return 0;
  }

  const { data, error } = await supabase
    .from('reviews')
    .upsert(reviewsArray, { onConflict: 'external_id' })
    .select();

  if (error) {
    throw new Error(`insertReviews failed: ${error.message}`);
  }

  return data ? data.length : 0;
}

// Persist Claude analysis results for a completed scrape run.
async function saveAnalysisResults(scrapeRunId, {
  q1,
  q2,
  q3,
  q4,
  q5,
  q6,
  summary,
  reviewCountAnalyzed,
  modelUsed,
}) {
  const { data, error } = await supabase
    .from('analysis_results')
    .insert({
      scrape_run_id: scrapeRunId,
      q1,
      q2,
      q3,
      q4,
      q5,
      q6,
      summary,
      review_count_analyzed: reviewCountAnalyzed,
      model_used: modelUsed,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`saveAnalysisResults failed: ${error.message}`);
  }

  return data;
}

// Fetch the most recent analysis for the dashboard.
async function getLatestAnalysis() {
  const { data, error } = await supabase
    .from('analysis_results')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`getLatestAnalysis failed: ${error.message}`);
  }

  return data;
}

// Fetch analysis results for a specific scrape run (most recent if multiple).
async function getAnalysisForScrapeRun(scrapeRunId) {
  const { data, error } = await supabase
    .from('analysis_results')
    .select('*')
    .eq('scrape_run_id', scrapeRunId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`getAnalysisForScrapeRun failed: ${error.message}`);
  }

  return data;
}

// Fetch relevant reviews for a scrape run, ordered by keyword match count.
async function getRelevantReviewsForRun(scrapeRunId) {
  const { data, error } = await supabase
    .from('reviews')
    .select('source, rating, body, matched_keywords')
    .eq('scrape_run_id', scrapeRunId)
    .eq('is_relevant', true);

  if (error) {
    throw new Error(`getRelevantReviewsForRun failed: ${error.message}`);
  }

  return data || [];
}

// Fetch the most recent scrape run for the dashboard and startup health check.
async function getLatestScrapeRun() {
  const { data, error } = await supabase
    .from('scrape_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`getLatestScrapeRun failed: ${error.message}`);
  }

  return data;
}

// Fetch the most recently completed scrape run for the dashboard.
async function getLatestCompletedScrapeRun() {
  const { data, error } = await supabase
    .from('scrape_runs')
    .select('*')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`getLatestCompletedScrapeRun failed: ${error.message}`);
  }

  return data;
}

// Fetch the scrape run with the most relevant reviews (primary analysis target).
async function getLatestScrapeRunWithReviews() {
  const { data: reviews, error: reviewsError } = await supabase
    .from('reviews')
    .select('scrape_run_id')
    .eq('is_relevant', true);

  if (reviewsError) {
    throw new Error(`getLatestScrapeRunWithReviews failed: ${reviewsError.message}`);
  }

  if (!reviews || reviews.length === 0) return null;

  const counts = {};
  for (const row of reviews) {
    counts[row.scrape_run_id] = (counts[row.scrape_run_id] || 0) + 1;
  }

  const [bestRunId] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  const { data: scrapeRun, error: runError } = await supabase
    .from('scrape_runs')
    .select('*')
    .eq('id', bestRunId)
    .single();

  if (runError) {
    throw new Error(`getLatestScrapeRunWithReviews failed: ${runError.message}`);
  }

  return scrapeRun;
}

// Fetch a scrape run and all its source_stats rows for the dashboard.
async function getScrapeRunWithStats(scrapeRunId) {
  const { data: scrapeRun, error: runError } = await supabase
    .from('scrape_runs')
    .select('*')
    .eq('id', scrapeRunId)
    .single();

  if (runError) {
    throw new Error(`getScrapeRunWithStats failed: ${runError.message}`);
  }

  const { data: sourceStats, error: statsError } = await supabase
    .from('source_stats')
    .select('*')
    .eq('scrape_run_id', scrapeRunId)
    .order('source', { ascending: true });

  if (statsError) {
    throw new Error(`getScrapeRunWithStats failed: ${statsError.message}`);
  }

  return { scrapeRun, sourceStats };
}

module.exports = {
  createScrapeRun,
  updateScrapeRun,
  createSourceStat,
  updateSourceStat,
  insertReviews,
  saveAnalysisResults,
  getLatestAnalysis,
  getAnalysisForScrapeRun,
  getRelevantReviewsForRun,
  getLatestScrapeRun,
  getLatestCompletedScrapeRun,
  getLatestScrapeRunWithReviews,
  getScrapeRunWithStats,
};
