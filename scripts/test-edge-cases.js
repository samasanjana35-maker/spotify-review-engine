require('dotenv').config();

const supabase = require('../src/config/supabase');
const { getCutoffDate } = require('../src/utils/dateUtils');
const { runScrapeOrchestrator } = require('../src/services/scraperOrchestrator');
const { insertReviews } = require('../src/db/queries');

const SCRAPE_RUN_ID = '68d0e80b-6188-42cf-b2b1-c82dbef0496c';

const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`✅ PASS: ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.log(`❌ FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
}

async function test1UserAgent() {
  console.log('\n=== Test 1 — Reddit User-Agent ===\n');

  const expected = process.env.REDDIT_USER_AGENT;
  console.log(`REDDIT_USER_AGENT from .env: "${expected}"`);

  let capturedHeader = null;
  const axios = require('axios');
  const originalGet = axios.get;

  axios.get = function patchedGet(url, config = {}) {
    if (typeof url === 'string' && url.includes('reddit.com')) {
      capturedHeader = config.headers?.['User-Agent'] || config.headers?.['user-agent'];
      console.log(`Captured User-Agent header sent to Reddit: "${capturedHeader}"`);
      return Promise.reject(new Error('TEST_ABORT: intercepted Reddit request'));
    }
    return originalGet.apply(this, arguments);
  };

  try {
    const { scrapeReddit } = require('../src/scrapers/reddit');
    await scrapeReddit();
  } catch {
    // expected abort or normal completion
  } finally {
    axios.get = originalGet;
  }

  if (!capturedHeader) {
    fail('Test 1 — Reddit User-Agent', 'No Reddit request intercepted');
    return;
  }

  if (capturedHeader === expected) {
    pass('Test 1 — Reddit User-Agent', `matches .env value exactly`);
  } else {
    fail('Test 1 — Reddit User-Agent', `sent "${capturedHeader}" !== .env "${expected}"`);
  }
}

async function test2NinetyDayFilter() {
  console.log('\n=== Test 2 — 90-day filter ===\n');

  const cutoff = getCutoffDate();
  console.log(`90-day cutoff date: ${cutoff.toISOString()}`);
  console.log(`Today: 2026-06-23`);

  const { data, error } = await supabase
    .from('reviews')
    .select('review_date')
    .eq('scrape_run_id', SCRAPE_RUN_ID)
    .order('review_date', { ascending: true })
    .limit(1);

  if (error) {
    fail('Test 2 — 90-day filter', error.message);
    return;
  }

  if (!data || data.length === 0) {
    fail('Test 2 — 90-day filter', 'No reviews found for scrape run');
    return;
  }

  const oldest = new Date(data[0].review_date);
  console.log(`MIN(review_date) for scrape run: ${oldest.toISOString()}`);

  if (oldest >= cutoff) {
    pass('Test 2 — 90-day filter', `oldest ${oldest.toISOString()} is within 90 days`);
  } else {
    fail('Test 2 — 90-day filter', `oldest ${oldest.toISOString()} is before cutoff ${cutoff.toISOString()}`);
  }
}

async function test3OneSourceDisabled() {
  console.log('\n=== Test 3 — One source disabled (App Store throws) ===\n');

  const appStoreModule = require('../src/scrapers/appStore');
  const originalScrape = appStoreModule.scrapeAppStore;

  appStoreModule.scrapeAppStore = async function scrapeAppStoreThrows() {
    throw new Error('TEST: App Store scraper intentionally disabled');
  };

  delete require.cache[require.resolve('../src/services/scraperOrchestrator')];
  const { runScrapeOrchestrator: runOrchestratorFresh } = require('../src/services/scraperOrchestrator');

  try {
    const result = await runOrchestratorFresh('test-edge-case-disabled-source');

    const { data: scrapeRun } = await supabase
      .from('scrape_runs')
      .select('status, error_summary')
      .eq('id', result.scrapeRunId)
      .single();

    const otherSourcesOk = ['playStore', 'reddit', 'forums', 'bluesky'].every(
      (key) => result.stats[key]?.status === 'success'
    );
    const appStoreFailed = result.stats.appStore?.status === 'failed';

    console.log(`scrape_run status: ${scrapeRun?.status}`);
    console.log(`error_summary: ${scrapeRun?.error_summary}`);
    console.log(`appStore status: ${result.stats.appStore?.status}`);
    console.log(`Other 4 sources success: ${otherSourcesOk}`);

    if (appStoreFailed && otherSourcesOk && scrapeRun?.status === 'completed') {
      pass('Test 3 — One source disabled', `scrape_run=completed, app_store failed, 4 others succeeded`);
    } else {
      fail(
        'Test 3 — One source disabled',
        `status=${scrapeRun?.status}, appStore=${result.stats.appStore?.status}, othersOk=${otherSourcesOk}`
      );
    }
  } catch (err) {
    fail('Test 3 — One source disabled', err.message);
  } finally {
    appStoreModule.scrapeAppStore = originalScrape;
    delete require.cache[require.resolve('../src/services/scraperOrchestrator')];
  }
}

async function test4DuplicateBlock() {
  console.log('\n=== Test 4 — Duplicate block on second run ===\n');

  const { data: existingReviews, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('scrape_run_id', SCRAPE_RUN_ID)
    .eq('is_relevant', true);

  if (error || !existingReviews?.length) {
    fail('Test 4 — Duplicate block', 'Could not load existing reviews for re-insert test');
    return;
  }

  console.log(`Re-inserting ${existingReviews.length} existing reviews (same external_ids)...`);

  const countBefore = existingReviews.length;
  const insertedCount = await insertReviews(existingReviews);

  const { count: totalCount, error: countError } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true });

  const { data: dupes, error: dupeError } = await supabase.rpc('check_duplicate_external_ids');

  let duplicateExternalIds = 0;
  if (dupeError) {
    const { data: allReviews } = await supabase.from('reviews').select('external_id');
    const seen = new Set();
    for (const row of allReviews || []) {
      if (seen.has(row.external_id)) duplicateExternalIds += 1;
      seen.add(row.external_id);
    }
  }

  console.log(`insertReviews returned: ${insertedCount} new rows`);
  console.log(`Total reviews in table: ${totalCount}`);

  if (dupeError) {
    console.log(`Duplicate external_ids in table (client check): ${duplicateExternalIds}`);
  }

  const insertOk = insertedCount === 0;
  const noDupes = duplicateExternalIds === 0;

  if (insertOk && noDupes) {
    pass('Test 4 — Duplicate block', `0 new rows inserted, no duplicate external_ids`);
  } else if (insertOk && !noDupes) {
    fail('Test 4 — Duplicate block', `insert returned 0 but found ${duplicateExternalIds} duplicate external_ids`);
  } else if (!insertOk && noDupes) {
    fail('Test 4 — Duplicate block', `insertReviews returned ${insertedCount}, expected 0`);
  } else {
    fail('Test 4 — Duplicate block', `inserted=${insertedCount}, duplicates=${duplicateExternalIds}`);
  }

  void countBefore;
  void countError;
}

async function main() {
  console.log('=== Edge Case Tests ===');

  await test1UserAgent();
  await test2NinetyDayFilter();
  await test3OneSourceDisabled();
  await test4DuplicateBlock();

  console.log('\n=== Edge Case Summary ===');
  results.forEach((r) => {
    console.log(`${r.ok ? '✅ PASS' : '❌ FAIL'}: ${r.name}`);
  });

  const allPassed = results.every((r) => r.ok);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
