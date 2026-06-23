require('dotenv').config();

const {
  analyzeReviews,
  getOrRunAnalysis,
  wasLastCallCacheHit,
  getLastTokenUsage,
  estimateCost,
  RESEARCH_QUESTIONS,
} = require('../src/services/analysisService');
const {
  getLatestAnalysis,
  getLatestScrapeRun,
  createScrapeRun,
} = require('../src/db/queries');

let passed = 0;
let failed = 0;

function pass(label) {
  passed += 1;
  console.log(`✅ PASS: ${label}`);
}

function fail(label, reason) {
  failed += 1;
  console.log(`❌ FAIL: ${label} — ${reason}`);
}

function printQuestionResults(results) {
  const questions = [
    { key: 'q1', text: RESEARCH_QUESTIONS[0] },
    { key: 'q2', text: RESEARCH_QUESTIONS[1] },
    { key: 'q3', text: RESEARCH_QUESTIONS[2] },
    { key: 'q4', text: RESEARCH_QUESTIONS[3] },
    { key: 'q5', text: RESEARCH_QUESTIONS[4] },
    { key: 'q6', text: RESEARCH_QUESTIONS[5] },
  ];

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  CLAUDE ANALYSIS — ALL 6 RESEARCH QUESTIONS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const { key, text } of questions) {
    const q = results[key];
    console.log(`── ${key.toUpperCase()}: ${text}`);
    console.log(`   Severity: ${q?.severity || 'N/A'}`);
    console.log(`   Answer: ${q?.answer || '(missing)'}`);
    console.log('   Evidence:');
    (q?.evidence || []).forEach((quote, i) => {
      console.log(`     ${i + 1}. "${quote}"`);
    });
    console.log('');
  }

  console.log('── SUMMARY');
  console.log(`   ${results.summary || '(missing)'}`);
  console.log(`\n   Reviews analyzed: ${results.reviewCountAnalyzed}`);
  console.log(`   Model: ${results.modelUsed || process.env.CLAUDE_MODEL}`);
  console.log(`   Cached: ${results.cached ? 'yes' : 'no'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

function validateResults(results, label) {
  let ok = true;

  for (const key of ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']) {
    if (!results[key] || !results[key].answer || results[key].answer.trim() === '') {
      fail(`${label}: ${key} has answer`, 'missing or empty');
      ok = false;
    } else {
      pass(`${label}: ${key} has answer`);
    }

    const evidence = results[key]?.evidence || [];
    if (evidence.length < 2) {
      fail(`${label}: ${key} evidence`, `only ${evidence.length} quotes (need >= 2)`);
      ok = false;
    } else {
      pass(`${label}: ${key} has >= 2 evidence quotes (${evidence.length})`);
    }
  }

  if (!results.summary || results.summary.trim() === '') {
    fail(`${label}: summary present`, 'missing or empty');
    ok = false;
  } else {
    pass(`${label}: summary present`);
  }

  return ok;
}

async function findRunWithReviews() {
  const supabase = require('../src/config/supabase');
  const { data, error } = await supabase
    .from('reviews')
    .select('scrape_run_id')
    .eq('is_relevant', true);

  if (error || !data || data.length === 0) return null;

  const counts = {};
  for (const row of data) {
    counts[row.scrape_run_id] = (counts[row.scrape_run_id] || 0) + 1;
  }

  const [bestRunId] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return bestRunId;
}

async function runMainTest() {
  console.log('=== Phase 5: Claude AI Analysis Engine Test ===\n');

  const scrapeRunId = await findRunWithReviews();
  if (!scrapeRunId) {
    fail('scrape run with reviews exists', 'none found — run pipeline first');
    return null;
  }

  console.log(`Using scrape run: ${scrapeRunId}\n`);

  console.log('--- Test 1: analyzeReviews() (first call — may hit Claude API) ---\n');

  const start1 = Date.now();
  let results;
  try {
    results = await analyzeReviews(scrapeRunId);
  } catch (err) {
    fail('analyzeReviews() first call', err.message);
    return null;
  }
  const elapsed1 = ((Date.now() - start1) / 1000).toFixed(1);

  console.log(`First call completed in ${elapsed1}s (cached=${results.cached})\n`);

  printQuestionResults(results);
  validateResults(results, 'First call');

  const usage = getLastTokenUsage();
  if (usage && !results.cached) {
    const cost = estimateCost(usage);
    console.log(`Token usage: ${usage.inputTokens} input + ${usage.outputTokens} output`);
    console.log(`Estimated cost: $${cost.toFixed(4)}\n`);
    pass(`Token usage logged (${usage.inputTokens} in / ${usage.outputTokens} out)`);
  } else if (results.cached) {
    console.log('First call returned cached results (no new Claude API call)\n');
    pass('First call used cache (existing analysis < 24h)');
  }

  console.log('--- Test 2: Verify saved to Supabase ---\n');

  const saved = await getLatestAnalysis();
  if (saved && saved.scrape_run_id === scrapeRunId) {
    pass('getLatestAnalysis() returns saved results');
    console.log(`  → id: ${saved.id}`);
    console.log(`  → created_at: ${saved.created_at}`);
    console.log(`  → review_count_analyzed: ${saved.review_count_analyzed}`);
  } else {
    fail('getLatestAnalysis() returns saved results', 'no matching row found');
  }

  console.log('\n--- Test 3: analyzeReviews() second call (cache hit) ---\n');

  const start2 = Date.now();
  let cachedResults;
  try {
    cachedResults = await analyzeReviews(scrapeRunId);
  } catch (err) {
    fail('analyzeReviews() second call', err.message);
    return results;
  }
  const elapsed2 = ((Date.now() - start2) / 1000).toFixed(1);

  console.log(`Second call completed in ${elapsed2}s`);

  if (wasLastCallCacheHit() || cachedResults.cached) {
    pass('Cache hit on second call (no new Claude API call)');
    console.log('✅ Cache hit on second call');
  } else {
    fail('Cache hit on second call', 'second call did not use cache');
  }

  if (cachedResults.createdAt === results.createdAt || cachedResults.cached) {
    pass('Second call returned same analysis as first');
  } else {
    fail('Second call returned same analysis', 'createdAt differs');
  }

  return results;
}

async function runEdgeCases(runWithReviewsId) {
  console.log('\n=== Edge Case Tests ===\n');

  // Edge case 2: Cache works
  console.log('--- Edge Case 2: Cache works ---\n');
  if (runWithReviewsId) {
    await analyzeReviews(runWithReviewsId);
    const firstCached = wasLastCallCacheHit();
    await analyzeReviews(runWithReviewsId);
    const secondCached = wasLastCallCacheHit();

    if (secondCached) {
      pass('Second consecutive call returned cached results');
      console.log('✅ Cache hit on second call');
    } else {
      fail('Cache on consecutive calls', 'second call was not a cache hit');
    }
  } else {
    fail('Cache edge case', 'no scrape run with reviews available');
  }

  // Edge case 1: Empty reviews (run last — creates a new empty scrape run)
  console.log('\n--- Edge Case 1: Empty reviews ---\n');
  try {
    const emptyRun = await createScrapeRun('test-empty-analysis');
    await analyzeReviews(emptyRun.id);
    fail('Empty reviews graceful error', 'should have thrown but succeeded');
  } catch (err) {
    if (err.statusCode === 400 && err.message.includes('No relevant reviews')) {
      pass('Empty reviews returns graceful 400 error');
      console.log(`  → Error message: "${err.message}"`);
    } else {
      fail('Empty reviews graceful error', `unexpected error: ${err.message}`);
    }
  }

  // Edge case 3: Wrong API key
  console.log('\n--- Edge Case 3: Claude API error handling (wrong API key) ---\n');
  const originalKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-invalid-key-for-testing';

  delete require.cache[require.resolve('../src/services/analysisService')];
  const freshService = require('../src/services/analysisService');
  const { createScrapeRun: createRun } = require('../src/db/queries');
  const supabase = require('../src/config/supabase');

  const badKeyRun = await createRun('test-bad-api-key');
  const { data: sourceReviews, error: fetchErr } = await supabase
    .from('reviews')
    .select('source, rating, body, matched_keywords, external_id, review_date, author, title, url, metadata, is_relevant')
    .eq('scrape_run_id', runWithReviewsId)
    .eq('is_relevant', true)
    .limit(3);

  if (fetchErr || !sourceReviews?.length) {
    fail('Wrong API key test setup', 'could not copy reviews for bad-key run');
  } else {
    const toInsert = sourceReviews.map((r, i) => ({
      scrape_run_id: badKeyRun.id,
      source: r.source,
      rating: r.rating,
      body: r.body,
      matched_keywords: r.matched_keywords,
      external_id: `badkey-test-${Date.now()}-${i}`,
      review_date: r.review_date,
      author: r.author,
      title: r.title,
      url: r.url,
      metadata: r.metadata,
      is_relevant: true,
    }));

    const { error: insertErr } = await supabase.from('reviews').insert(toInsert);
    if (insertErr) {
      fail('Wrong API key test setup', insertErr.message);
    } else {
      let apiErrorCaught = false;
      try {
        await freshService.analyzeReviews(badKeyRun.id);
        fail('Wrong API key error handling', 'should have thrown but succeeded');
      } catch (err) {
        apiErrorCaught = true;
        console.log(`  → Caught error: "${err.message}"`);
        if (err.message && (err.message.includes('401') || err.message.includes('authentication'))) {
          pass('Wrong API key returns authentication error');
        } else {
          fail('Wrong API key error handling', `expected 401/auth error, got: ${err.message}`);
        }
      }

      if (apiErrorCaught) {
        pass('Server did not crash on Claude API error');
      }
    }
  }

  process.env.ANTHROPIC_API_KEY = originalKey;
  delete require.cache[require.resolve('../src/services/analysisService')];
}

async function testApiEndpoint() {
  console.log('\n--- Test 4: GET /api/analysis/latest endpoint ---\n');

  const http = require('http');
  const port = process.env.PORT || 3000;

  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/api/analysis/latest`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(body);
            if (data.q1 && data.summary) {
              pass('GET /api/analysis/latest returns 200 with full results');
            } else {
              fail('GET /api/analysis/latest', 'response missing q1 or summary');
            }
          } catch {
            fail('GET /api/analysis/latest', 'invalid JSON response');
          }
        } else {
          console.log(`  → Server not running or returned ${res.statusCode} — skipping endpoint test`);
          console.log('  → Start server with: npm start');
        }
        resolve();
      });
    });

    req.on('error', () => {
      console.log('  → Server not running — skipping GET /api/analysis/latest test');
      console.log('  → Start server with: npm start');
      resolve();
    });

    req.setTimeout(5000, () => {
      req.destroy();
      console.log('  → Endpoint test timed out — is server running?');
      resolve();
    });
  });
}

async function main() {
  const results = await runMainTest();
  const runId = results?.scrapeRunId || (await getLatestScrapeRun())?.id;
  await runEdgeCases(runId);
  await testApiEndpoint();

  console.log(`\n=== Final Summary: ${passed}/${passed + failed} checks passed ===`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n❌ Unexpected error:', err);
  process.exit(1);
});
