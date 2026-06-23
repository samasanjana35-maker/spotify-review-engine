const Anthropic = require('@anthropic-ai/sdk');
const {
  getLatestAnalysis,
  getAnalysisForScrapeRun,
  getRelevantReviewsForRun,
  getLatestScrapeRun,
  getLatestScrapeRunWithReviews,
  saveAnalysisResults,
} = require('../db/queries');
const { env } = require('../config/env');
const logger = require('../utils/logger');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const RESEARCH_QUESTIONS = [
  'Why do users struggle to discover new music?',
  'What are the most common frustrations with recommendations?',
  'What listening behaviors are users trying to achieve?',
  'What causes users to repeatedly listen to the same content?',
  'Which user segments experience different discovery challenges?',
  'What unmet needs emerge consistently across reviews?',
];

let lastCallWasCacheHit = false;
let lastTokenUsage = null;

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
    matched_keywords: review.matched_keywords || [],
  }));
}

function isCacheValid(analysis, scrapeRunId) {
  if (!analysis) return false;
  if (analysis.scrape_run_id !== scrapeRunId) return false;

  const createdAt = new Date(analysis.created_at).getTime();
  const age = Date.now() - createdAt;
  return age < CACHE_TTL_MS;
}

function formatCachedResult(analysis) {
  return {
    scrapeRunId: analysis.scrape_run_id,
    q1: analysis.q1,
    q2: analysis.q2,
    q3: analysis.q3,
    q4: analysis.q4,
    q5: analysis.q5,
    q6: analysis.q6,
    summary: analysis.summary,
    reviewCountAnalyzed: analysis.review_count_analyzed,
    modelUsed: analysis.model_used,
    cached: true,
    createdAt: analysis.created_at,
  };
}

function buildAnalysisPrompt(formattedReviews) {
  const reviewsJson = JSON.stringify(formattedReviews, null, 2);

  return `You are a music discovery research analyst. Analyze the following ${formattedReviews.length} user reviews about Spotify and answer 6 research questions.

REVIEWS:
${reviewsJson}

RESEARCH QUESTIONS:
1. ${RESEARCH_QUESTIONS[0]}
2. ${RESEARCH_QUESTIONS[1]}
3. ${RESEARCH_QUESTIONS[2]}
4. ${RESEARCH_QUESTIONS[3]}
5. ${RESEARCH_QUESTIONS[4]}
6. ${RESEARCH_QUESTIONS[5]}

INSTRUCTIONS:
- Base every answer strictly on evidence from the reviews provided.
- For each question, include at least 3 direct quotes from the reviews as evidence.
- Assign a severity rating (high, medium, or low) based on how frequently and intensely the issue appears.
- Return ONLY valid JSON with no markdown fences or extra text.

Return this exact JSON structure:
{
  "q1": { "answer": "...", "evidence": ["quote1", "quote2", "quote3"], "severity": "high/medium/low" },
  "q2": { "answer": "...", "evidence": ["quote1", "quote2", "quote3"], "severity": "high/medium/low" },
  "q3": { "answer": "...", "evidence": ["quote1", "quote2", "quote3"], "severity": "high/medium/low" },
  "q4": { "answer": "...", "evidence": ["quote1", "quote2", "quote3"], "severity": "high/medium/low" },
  "q5": { "answer": "...", "evidence": ["quote1", "quote2", "quote3"], "severity": "high/medium/low" },
  "q6": { "answer": "...", "evidence": ["quote1", "quote2", "quote3"], "severity": "high/medium/low" },
  "summary": "2-3 sentence overall summary of the main discovery problem",
  "reviewCountAnalyzed": ${formattedReviews.length}
}`;
}

function parseClaudeResponse(text) {
  let cleaned = text.trim();

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  const parsed = JSON.parse(cleaned);

  for (const key of ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']) {
    if (!parsed[key] || !parsed[key].answer) {
      throw new Error(`Claude response missing required field: ${key}`);
    }
  }

  if (!parsed.summary) {
    throw new Error('Claude response missing required field: summary');
  }

  return parsed;
}

async function callClaude(prompt) {
  const model = process.env.CLAUDE_MODEL || env.claudeModel;

  logger.info(`Calling Claude API (model=${model}, reviews in prompt)`);

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || !textBlock.text) {
    throw new Error('Claude returned an empty response');
  }

  lastTokenUsage = {
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  };

  return parseClaudeResponse(textBlock.text);
}

async function analyzeReviews(scrapeRunId) {
  lastCallWasCacheHit = false;

  const latestAnalysis = await getLatestAnalysis();
  if (isCacheValid(latestAnalysis, scrapeRunId)) {
    logger.info(`Returning cached analysis for scrape run ${scrapeRunId} (< 24h old)`);
    lastCallWasCacheHit = true;
    return formatCachedResult(latestAnalysis);
  }

  const runAnalysis = await getAnalysisForScrapeRun(scrapeRunId);
  if (isCacheValid(runAnalysis, scrapeRunId)) {
    logger.info(`Returning cached analysis for scrape run ${scrapeRunId} (< 24h old)`);
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
  const prompt = buildAnalysisPrompt(formattedReviews);

  let results;
  try {
    results = await callClaude(prompt);
  } catch (err) {
    logger.error(`Claude API error: ${err.message}`);
    throw err;
  }

  results.reviewCountAnalyzed = formattedReviews.length;

  const model = process.env.CLAUDE_MODEL || env.claudeModel;
  const saved = await saveAnalysisResults(scrapeRunId, {
    q1: results.q1,
    q2: results.q2,
    q3: results.q3,
    q4: results.q4,
    q5: results.q5,
    q6: results.q6,
    summary: results.summary,
    reviewCountAnalyzed: results.reviewCountAnalyzed,
    modelUsed: model,
  });

  logger.info(`Analysis saved for scrape run ${scrapeRunId} (${results.reviewCountAnalyzed} reviews)`);

  return {
    scrapeRunId,
    q1: saved.q1,
    q2: saved.q2,
    q3: saved.q3,
    q4: saved.q4,
    q5: saved.q5,
    q6: saved.q6,
    summary: saved.summary,
    reviewCountAnalyzed: saved.review_count_analyzed,
    modelUsed: saved.model_used,
    cached: false,
    createdAt: saved.created_at,
  };
}

async function getOrRunAnalysis(scrapeRunId) {
  if (scrapeRunId) {
    return analyzeReviews(scrapeRunId);
  }

  const latestRun = await getLatestScrapeRunWithReviews();
  if (!latestRun) {
    const err = new Error('No scrape runs with relevant reviews found. Run a scrape first.');
    err.statusCode = 404;
    throw err;
  }

  return analyzeReviews(latestRun.id);
}

function wasLastCallCacheHit() {
  return lastCallWasCacheHit;
}

function getLastTokenUsage() {
  return lastTokenUsage;
}

function estimateCost(usage) {
  if (!usage) return 0;
  const inputCostPer1M = 3.0;
  const outputCostPer1M = 15.0;
  const inputCost = (usage.inputTokens / 1_000_000) * inputCostPer1M;
  const outputCost = (usage.outputTokens / 1_000_000) * outputCostPer1M;
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
};
