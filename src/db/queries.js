const supabase = require('../config/supabase');

// ---------------------------------------------------------------------------
// Scrape runs
// ---------------------------------------------------------------------------

async function createScrapeRun(triggeredBy) {
  const { data, error } = await supabase
    .from('scrape_runs')
    .insert({ triggered_by: triggeredBy, status: 'running' })
    .select()
    .single();

  if (error) throw new Error(`createScrapeRun failed: ${error.message}`);
  return data;
}

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

  if (error) throw new Error(`updateScrapeRun failed: ${error.message}`);
  return data;
}

async function getLatestScrapeRun() {
  const { data, error } = await supabase
    .from('scrape_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getLatestScrapeRun failed: ${error.message}`);
  return data;
}

async function getLatestCompletedScrapeRun() {
  const { data, error } = await supabase
    .from('scrape_runs')
    .select('*')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getLatestCompletedScrapeRun failed: ${error.message}`);
  return data;
}

async function getLatestScrapeRunWithReviews() {
  const { data: reviews, error: reviewsError } = await supabase
    .from('reviews')
    .select('scrape_run_id')
    .eq('is_relevant', true);

  if (reviewsError) throw new Error(`getLatestScrapeRunWithReviews failed: ${reviewsError.message}`);
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

  if (runError) throw new Error(`getLatestScrapeRunWithReviews failed: ${runError.message}`);
  return scrapeRun;
}

// ---------------------------------------------------------------------------
// Source stats
// ---------------------------------------------------------------------------

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

  if (error) throw new Error(`createSourceStat failed: ${error.message}`);
  return data;
}

async function updateSourceStat(id, { rawCount, filteredCount, status, errorMessage = null }) {
  const { data, error } = await supabase
    .from('source_stats')
    .update({ raw_count: rawCount, filtered_count: filteredCount, status, error_message: errorMessage })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`updateSourceStat failed: ${error.message}`);
  return data;
}

async function getScrapeRunWithStats(scrapeRunId) {
  const { data: scrapeRun, error: runError } = await supabase
    .from('scrape_runs')
    .select('*')
    .eq('id', scrapeRunId)
    .single();

  if (runError) throw new Error(`getScrapeRunWithStats failed: ${runError.message}`);

  const { data: sourceStats, error: statsError } = await supabase
    .from('source_stats')
    .select('*')
    .eq('scrape_run_id', scrapeRunId)
    .order('source', { ascending: true });

  if (statsError) throw new Error(`getScrapeRunWithStats failed: ${statsError.message}`);
  return { scrapeRun, sourceStats };
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

async function insertReviews(reviewsArray) {
  if (!reviewsArray || reviewsArray.length === 0) return 0;

  const { data, error } = await supabase
    .from('reviews')
    .upsert(reviewsArray, { onConflict: 'external_id' })
    .select();

  if (error) throw new Error(`insertReviews failed: ${error.message}`);
  return data ? data.length : 0;
}

async function getRelevantReviewsForRun(scrapeRunId) {
  const { data, error } = await supabase
    .from('reviews')
    .select('source, rating, body, matched_keywords, review_date')
    .eq('scrape_run_id', scrapeRunId)
    .eq('is_relevant', true);

  if (error) throw new Error(`getRelevantReviewsForRun failed: ${error.message}`);
  return data || [];
}

/**
 * UPGRADE 4: Get review counts grouped by month and source for the trend chart.
 * Returns an array of { month: 'YYYY-MM', source: string, count: number }.
 *
 * @param {string} scrapeRunId  - optional; if null, uses all reviews
 * @param {number} monthsBack   - how many months of history to include (default 12)
 */
async function getReviewTrendData(scrapeRunId = null, monthsBack = 12) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsBack);

  let query = supabase
    .from('reviews')
    .select('source, review_date')
    .eq('is_relevant', true)
    .gte('review_date', cutoff.toISOString());

  if (scrapeRunId) {
    query = query.eq('scrape_run_id', scrapeRunId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`getReviewTrendData failed: ${error.message}`);

  // Aggregate by YYYY-MM + source in JS (no Supabase RPC needed)
  const counts = {};
  for (const row of data || []) {
    const d = new Date(row.review_date);
    if (Number.isNaN(d.getTime())) continue;
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const key = `${month}|${row.source}`;
    counts[key] = (counts[key] || 0) + 1;
  }

  return Object.entries(counts).map(([key, count]) => {
    const [month, source] = key.split('|');
    return { month, source, count };
  });
}

/**
 * UPGRADE 4: Get relevant reviews filtered by date range.
 * Used when the user picks "Last 30 days / 6 months / 12 months" in the UI.
 */
async function getRelevantReviewsFiltered(scrapeRunId, dateRangeDays) {
  let query = supabase
    .from('reviews')
    .select('source, rating, body, matched_keywords, review_date')
    .eq('is_relevant', true);

  if (scrapeRunId) {
    query = query.eq('scrape_run_id', scrapeRunId);
  }

  if (dateRangeDays) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - dateRangeDays);
    query = query.gte('review_date', cutoff.toISOString());
  }

  const { data, error } = await query;
  if (error) throw new Error(`getRelevantReviewsFiltered failed: ${error.message}`);
  return data || [];
}

// ---------------------------------------------------------------------------
// Analysis results
// ---------------------------------------------------------------------------

async function saveAnalysisResults(scrapeRunId, {
  q1, q2, q3, q4, q5, q6,
  summary,
  reviewCountAnalyzed,
  modelUsed,
  pmSurprises,    // UPGRADE 5: array of surprising PM findings
  segmentMatrix,  // UPGRADE 6: 2D segment × need matrix
  promptVersion,  // track which prompt version generated this
}) {
  const { data, error } = await supabase
    .from('analysis_results')
    .insert({
      scrape_run_id: scrapeRunId,
      q1, q2, q3, q4, q5, q6,
      summary,
      review_count_analyzed: reviewCountAnalyzed,
      model_used: modelUsed,
      pm_surprises: pmSurprises || null,
      segment_matrix: segmentMatrix || null,
      prompt_version: promptVersion || '2.0',
    })
    .select()
    .single();

  if (error) throw new Error(`saveAnalysisResults failed: ${error.message}`);
  return data;
}

async function getLatestAnalysis() {
  const { data, error } = await supabase
    .from('analysis_results')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getLatestAnalysis failed: ${error.message}`);
  return data;
}

async function getAnalysisForScrapeRun(scrapeRunId) {
  const { data, error } = await supabase
    .from('analysis_results')
    .select('*')
    .eq('scrape_run_id', scrapeRunId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getAnalysisForScrapeRun failed: ${error.message}`);
  return data;
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
  getRelevantReviewsFiltered,
  getReviewTrendData,
  getLatestScrapeRun,
  getLatestCompletedScrapeRun,
  getLatestScrapeRunWithReviews,
  getScrapeRunWithStats,
};
