/**
 * UPGRADE 5 + 6: Upgraded AI analysis service
 *
 * Prompt v2.0 changes:
 * - System role: "find what is UNEXPECTED, COUNTERINTUITIVE, or UNDERREPORTED"
 * - Each question now returns 5 structured fields instead of 1 answer blob:
 *     mainFinding, quantification, unexpectedSignal, segment, productIntervention
 * - New top-level sections:
 *     pmSurprises    — 2-3 findings that would surprise a Spotify PM
 *     segmentMatrix  — 6×6 matrix of user segment × pain point counts (Upgrade 6)
 * - LOW CONFIDENCE: each question includes reviewsCount (integer) so the
 *   frontend can badge findings backed by < 5 reviews
 * - Backward compat: `answer` and `opportunity` are still populated so existing
 *   cached UI cards continue to work
 */

const Anthropic = require('@anthropic-ai/sdk');
const {
  getLatestAnalysis,
  getAnalysisForScrapeRun,
  getRelevantReviewsForRun,
  getLatestScrapeRunWithReviews,
  saveAnalysisResults,
} = require('../db/queries');
const { env } = require('../config/env');
const logger = require('../utils/logger');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PROMPT_VERSION = '2.0';

const RESEARCH_QUESTIONS = [
  'Why do users struggle to discover new music?',
  'What are the most common frustrations with Spotify\'s recommendations?',
  'What listening behaviors are users trying to achieve that the product currently blocks?',
  'What causes users to repeatedly listen to the same content against their will?',
  'Which user segments experience meaningfully different discovery challenges?',
  'What unmet needs appear consistently that Spotify has NOT addressed in any recent update?',
];

let lastCallWasCacheHit = false;
let lastTokenUsage = null;

// ---------------------------------------------------------------------------
// Review preparation
// ---------------------------------------------------------------------------

function prepareReviewsForAnalysis(reviews) {
  const maxReviews = env.maxReviewsForAnalysis;

  const sorted = [...reviews].sort(
    (a, b) => (b.matched_keywords?.length || 0) - (a.matched_keywords?.length || 0)
  );

  const top = sorted.slice(0, maxReviews);

  return top.map((review) => ({
    source: review.source,
    rating: review.rating,
    body: review.body,
    review_date: review.review_date || null,
    matched_keywords: review.matched_keywords || [],
  }));
}

// ---------------------------------------------------------------------------
// Cache validation
// ---------------------------------------------------------------------------

function isCacheValid(analysis, scrapeRunId) {
  if (!analysis) return false;
  if (analysis.scrape_run_id !== scrapeRunId) return false;

  // Force regeneration if cached analysis is on old prompt version
  if (analysis.prompt_version !== PROMPT_VERSION) return false;
  if (analysis.q1 && !analysis.q1.mainFinding) return false;

  const createdAt = new Date(analysis.created_at).getTime();
  return (Date.now() - createdAt) < CACHE_TTL_MS;
}

function formatCachedResult(analysis) {
  return {
    scrapeRunId: analysis.scrape_run_id,
    q1: analysis.q1, q2: analysis.q2, q3: analysis.q3,
    q4: analysis.q4, q5: analysis.q5, q6: analysis.q6,
    summary: analysis.summary,
    pmSurprises: analysis.pm_surprises || [],
    segmentMatrix: analysis.segment_matrix || null,
    competitiveIntel: analysis.q6?.competitiveIntel || null,
    reviewCountAnalyzed: analysis.review_count_analyzed,
    modelUsed: analysis.model_used,
    promptVersion: analysis.prompt_version,
    cached: true,
    createdAt: analysis.created_at,
  };
}

// ---------------------------------------------------------------------------
// UPGRADE 5: New prompt — surfaces unexpected, counterintuitive findings
// ---------------------------------------------------------------------------

function buildAnalysisPrompt(formattedReviews) {
  const reviewsJson = JSON.stringify(formattedReviews, null, 2);

  const systemPrompt = `You are a senior product researcher analyzing user reviews for Spotify.
Your job is NOT to confirm known problems. Your job is to find what is UNEXPECTED,
COUNTERINTUITIVE, or UNDERREPORTED in this data. Prioritize minority signals that contradict
the mainstream narrative. Flag anything that would surprise a PM who has been working on
Spotify for 3 years.`;

  const userPrompt = `Here are ${formattedReviews.length} user reviews about Spotify's music
discovery and recommendation experience.

REVIEWS:
${reviewsJson}

Answer each of the following 6 questions. For EACH answer provide ALL of these fields:

1. mainFinding — the main finding in 2 sentences max
2. quantification — exact count: "X of ${formattedReviews.length} reviews (Z%) mention this"
   (count carefully by reading each review individually)
3. reviewsCount — the integer X from quantification (used for confidence badges)
4. unexpectedSignal — ONE finding that contradicts assumptions or is small but growing
5. segment — which user type feels this most acutely (free vs paid, new vs long-term,
   genre preference, mobile vs desktop if detectable)
6. productIntervention — ONE specific product feature tied directly to evidence. NOT a
   generic UX fix. Name the feature and describe its exact mechanism in 1-2 sentences.
   Example level of specificity: "Add a Taste Reset button that wipes listening history so
   the algorithm starts fresh" or "Launch an AI Music Filter toggle in settings that removes
   all AI-generated tracks from every playlist and radio station."
7. evidence — 3 direct quotes from reviews (strings)
8. severity — "high", "medium", or "low" based on frequency and intensity
9. opportunity — same as productIntervention (kept for backward compatibility)
10. answer — combine mainFinding + quantification into a 3-4 sentence summary paragraph

THE 6 QUESTIONS:
Q1: ${RESEARCH_QUESTIONS[0]}
Q2: ${RESEARCH_QUESTIONS[1]}
Q3: ${RESEARCH_QUESTIONS[2]}
Q4: ${RESEARCH_QUESTIONS[3]}
Q5: ${RESEARCH_QUESTIONS[4]}
Q6: ${RESEARCH_QUESTIONS[5]}

COMPETITIVE INTEL: Count how many reviews explicitly name each competitor:
Apple Music, Tidal, Qobuz, Deezer, YouTube Music, Last.fm. Set counts to 0 if none.

UPGRADE 6 — SEGMENT MATRIX: Tag each theme intersection. Estimate the number of reviews
that represent each cell. Use these exact row/column keys:

Rows (user segments):
  free_user, premium_user, power_user, nostalgia_listener, genre_diverse, new_user

Columns (pain points):
  repetitive_recs, no_playback_control, ai_content_intrusion, shuffle_dysfunction,
  filter_bubble, lack_of_transparency

Return the matrix as nested JSON: segmentMatrix[segment][painPoint] = count (integer).
Omit cells where count is 0.

PM SURPRISES: After answering all 6 questions, add a "pmSurprises" array with 2-3 findings
from this data that are counterintuitive or that a PM would NOT expect. Each surprise is a
1-2 sentence string. Be specific — reference actual patterns you saw in the reviews.

Return ONLY valid JSON with NO markdown fences. Use this exact structure:

{
  "q1": {
    "mainFinding": "...",
    "quantification": "X of ${formattedReviews.length} reviews (Z%)",
    "reviewsCount": 0,
    "unexpectedSignal": "...",
    "segment": "...",
    "productIntervention": "...",
    "evidence": ["quote1", "quote2", "quote3"],
    "severity": "high",
    "opportunity": "...",
    "answer": "..."
  },
  "q2": { /* same structure */ },
  "q3": { /* same structure */ },
  "q4": { /* same structure */ },
  "q5": { /* same structure */ },
  "q6": { /* same structure */ },
  "competitiveIntel": {
    "apple_music": 0, "tidal": 0, "qobuz": 0,
    "deezer": 0, "youtube_music": 0, "lastfm": 0
  },
  "segmentMatrix": {
    "free_user": { "repetitive_recs": 0 },
    "premium_user": {}
  },
  "pmSurprises": ["surprise 1", "surprise 2", "surprise 3"],
  "summary": "2-3 sentence overall summary of the main discovery problem",
  "reviewCountAnalyzed": ${formattedReviews.length}
}`;

  return { systemPrompt, userPrompt };
}

// ---------------------------------------------------------------------------
// Parse & validate Claude's JSON response
// ---------------------------------------------------------------------------

function parseClaudeResponse(text) {
  let cleaned = text.trim();

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  const parsed = JSON.parse(cleaned);

  for (const key of ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']) {
    if (!parsed[key] || !parsed[key].answer) {
      throw new Error(`Claude response missing required field: ${key}.answer`);
    }
    // Back-fill opportunity from productIntervention if only one is present
    if (parsed[key].productIntervention && !parsed[key].opportunity) {
      parsed[key].opportunity = parsed[key].productIntervention;
    }
    if (parsed[key].opportunity && !parsed[key].productIntervention) {
      parsed[key].productIntervention = parsed[key].opportunity;
    }
    // Ensure reviewsCount is an integer
    if (typeof parsed[key].reviewsCount !== 'number') {
      // Try to parse from quantification string e.g. "23 of 150 reviews"
      const m = (parsed[key].quantification || '').match(/^(\d+)\s+of/);
      parsed[key].reviewsCount = m ? parseInt(m[1], 10) : 0;
    }
  }

  if (!parsed.summary) throw new Error('Claude response missing required field: summary');

  return parsed;
}

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------

async function callClaude(systemPrompt, userPrompt) {
  const model = process.env.CLAUDE_MODEL || env.claudeModel;
  logger.info(`Calling Claude API (model=${model}, prompt_version=${PROMPT_VERSION})`);

  const response = await anthropic.messages.create({
    model,
    max_tokens: 6000,  // increased to handle larger structured response
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || !textBlock.text) throw new Error('Claude returned an empty response');

  lastTokenUsage = {
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  };

  return parseClaudeResponse(textBlock.text);
}

// ---------------------------------------------------------------------------
// Main analysis orchestration
// ---------------------------------------------------------------------------

async function analyzeReviews(scrapeRunId) {
  lastCallWasCacheHit = false;

  const latestAnalysis = await getLatestAnalysis();
  if (isCacheValid(latestAnalysis, scrapeRunId)) {
    logger.info(`Returning cached analysis for scrape run ${scrapeRunId} (prompt_version=${PROMPT_VERSION})`);
    lastCallWasCacheHit = true;
    return formatCachedResult(latestAnalysis);
  }

  const runAnalysis = await getAnalysisForScrapeRun(scrapeRunId);
  if (isCacheValid(runAnalysis, scrapeRunId)) {
    logger.info(`Returning cached run analysis for ${scrapeRunId}`);
    lastCallWasCacheHit = true;
    return formatCachedResult(runAnalysis);
  }

  const reviews = await getRelevantReviewsForRun(scrapeRunId);
  if (!reviews || reviews.length === 0) {
    const err = new Error('No relevant reviews found for this scrape run. Run a scrape first.');
    err.statusCode = 400;
    throw err;
  }

  const formattedReviews = prepareReviewsForAnalysis(reviews);
  const { systemPrompt, userPrompt } = buildAnalysisPrompt(formattedReviews);

  let results;
  try {
    results = await callClaude(systemPrompt, userPrompt);
  } catch (err) {
    logger.error(`Claude API error: ${err.message}`);
    throw err;
  }

  results.reviewCountAnalyzed = formattedReviews.length;

  const model = process.env.CLAUDE_MODEL || env.claudeModel;
  const q6WithIntel = {
    ...results.q6,
    competitiveIntel: results.competitiveIntel || null,
  };

  const saved = await saveAnalysisResults(scrapeRunId, {
    q1: results.q1,
    q2: results.q2,
    q3: results.q3,
    q4: results.q4,
    q5: results.q5,
    q6: q6WithIntel,
    summary: results.summary,
    reviewCountAnalyzed: results.reviewCountAnalyzed,
    modelUsed: model,
    pmSurprises: results.pmSurprises || [],
    segmentMatrix: results.segmentMatrix || null,
    promptVersion: PROMPT_VERSION,
  });

  logger.info(
    `Analysis saved for scrape run ${scrapeRunId} ` +
    `(${results.reviewCountAnalyzed} reviews, prompt_version=${PROMPT_VERSION})`
  );

  return {
    scrapeRunId,
    q1: saved.q1, q2: saved.q2, q3: saved.q3,
    q4: saved.q4, q5: saved.q5, q6: saved.q6,
    summary: saved.summary,
    pmSurprises: saved.pm_surprises || results.pmSurprises || [],
    segmentMatrix: saved.segment_matrix || results.segmentMatrix || null,
    competitiveIntel: results.competitiveIntel || saved.q6?.competitiveIntel || null,
    reviewCountAnalyzed: saved.review_count_analyzed,
    modelUsed: saved.model_used,
    promptVersion: saved.prompt_version || PROMPT_VERSION,
    cached: false,
    createdAt: saved.created_at,
  };
}

async function getOrRunAnalysis(scrapeRunId) {
  if (scrapeRunId) return analyzeReviews(scrapeRunId);

  const latestRun = await getLatestScrapeRunWithReviews();
  if (!latestRun) {
    const err = new Error('No scrape runs with relevant reviews found. Run a scrape first.');
    err.statusCode = 404;
    throw err;
  }

  return analyzeReviews(latestRun.id);
}

function wasLastCallCacheHit() { return lastCallWasCacheHit; }
function getLastTokenUsage() { return lastTokenUsage; }

function estimateCost(usage) {
  if (!usage) return 0;
  const inputCost = (usage.inputTokens / 1_000_000) * 3.0;
  const outputCost = (usage.outputTokens / 1_000_000) * 15.0;
  return inputCost + outputCost;
}

module.exports = {
  prepareReviewsForAnalysis,
  analyzeReviews,
  getOrRunAnalysis,
  wasLastCallCacheHit,
  getLastTokenUsage,
  estimateCost,
  RESEARCH_QUESTIONS,
  PROMPT_VERSION,
};
