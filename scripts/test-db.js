require('dotenv').config();

const {
  createScrapeRun,
  getLatestScrapeRun,
  updateScrapeRun,
  createSourceStat,
  insertReviews,
  getScrapeRunWithStats,
} = require('../src/db/queries');

const supabase = require('../src/config/supabase');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let passed = 0;
let failed = 0;
const failures = [];

let scrapeRunId = null;
let sourceStatId = null;

function pass(label) {
  passed += 1;
  console.log(`✅ PASS: ${label}`);
}

function fail(label, error) {
  failed += 1;
  const message = error instanceof Error ? error.message : String(error);
  failures.push({ label, message });
  console.log(`❌ FAIL: ${label} — ${message}`);
}

function buildTestReviews(runId) {
  return [
    {
      scrape_run_id: runId,
      source: 'app_store',
      external_id: 'test-review-001',
      author: 'TestUser1',
      rating: 3,
      title: 'Test Review 1',
      body: 'Spotify keeps playing the same songs over and over. Discovery is broken.',
      url: 'https://example.com/1',
      review_date: new Date().toISOString(),
      metadata: {},
      matched_keywords: ['same songs', 'discovery'],
      is_relevant: true,
    },
    {
      scrape_run_id: runId,
      source: 'play_store',
      external_id: 'test-review-002',
      author: 'TestUser2',
      rating: 2,
      title: 'Test Review 2',
      body: 'The recommendation algorithm never suggests anything new.',
      url: 'https://example.com/2',
      review_date: new Date().toISOString(),
      metadata: {},
      matched_keywords: ['recommend', 'algorithm'],
      is_relevant: true,
    },
  ];
}

async function verifyInDatabase() {
  console.log('\n--- Supabase Table Editor verification (via API) ---\n');

  const { data: scrapeRun, error: runError } = await supabase
    .from('scrape_runs')
    .select('*')
    .eq('id', scrapeRunId)
    .single();

  if (runError) {
    console.log(`scrape_runs: ERROR — ${runError.message}`);
  } else {
    console.log('scrape_runs row:');
    console.log(JSON.stringify(scrapeRun, null, 2));
    console.log(
      scrapeRun.status === 'completed'
        ? '  → status=completed confirmed'
        : `  → WARNING: expected status=completed, got ${scrapeRun.status}`
    );
  }

  const { data: reviews, error: reviewsError } = await supabase
    .from('reviews')
    .select('external_id, source, author, title')
    .in('external_id', ['test-review-001', 'test-review-002'])
    .order('external_id', { ascending: true });

  if (reviewsError) {
    console.log(`\nreviews: ERROR — ${reviewsError.message}`);
  } else {
    console.log(`\nreviews: ${reviews.length} row(s) with test external_ids`);
    reviews.forEach((row) => {
      console.log(`  → ${row.external_id} (${row.source}) — ${row.author}: ${row.title}`);
    });
    if (reviews.length === 2) {
      console.log('  → exactly 2 test review rows confirmed');
    } else {
      console.log(`  → WARNING: expected 2 rows, found ${reviews.length}`);
    }
  }
}

async function runTests() {
  console.log('=== Spotify Review Engine — Database Integration Tests ===\n');

  // Test 1 — createScrapeRun
  try {
    const row = await createScrapeRun('test-manual');
    console.log('Test 1 — createScrapeRun returned:');
    console.log(JSON.stringify(row, null, 2));

    if (
      row &&
      UUID_REGEX.test(row.id) &&
      row.status === 'running' &&
      row.triggered_by === 'test-manual'
    ) {
      scrapeRunId = row.id;
      pass('createScrapeRun');
    } else {
      fail('createScrapeRun', 'Returned row missing expected id, status, or triggered_by');
    }
  } catch (err) {
    fail('createScrapeRun', err);
  }

  // Test 2 — getLatestScrapeRun
  try {
    const row = await getLatestScrapeRun();
    console.log('\nTest 2 — getLatestScrapeRun returned:');
    console.log(JSON.stringify(row, null, 2));

    if (row && scrapeRunId && row.id === scrapeRunId) {
      pass('getLatestScrapeRun');
    } else {
      fail(
        'getLatestScrapeRun',
        `Expected id ${scrapeRunId}, got ${row ? row.id : 'null'}`
      );
    }
  } catch (err) {
    fail('getLatestScrapeRun', err);
  }

  // Test 3 — updateScrapeRun
  try {
    const row = await updateScrapeRun(scrapeRunId, 'completed');
    console.log('\nTest 3 — updateScrapeRun returned:');
    console.log(JSON.stringify(row, null, 2));

    if (row && row.status === 'completed' && row.completed_at !== null) {
      pass('updateScrapeRun');
    } else {
      fail('updateScrapeRun', 'Returned row missing status=completed or completed_at');
    }
  } catch (err) {
    fail('updateScrapeRun', err);
  }

  // Test 4 — createSourceStat
  try {
    const row = await createSourceStat(scrapeRunId, 'app_store');
    console.log('\nTest 4 — createSourceStat returned:');
    console.log(JSON.stringify(row, null, 2));

    if (
      row &&
      row.scrape_run_id === scrapeRunId &&
      row.source === 'app_store'
    ) {
      sourceStatId = row.id;
      pass('createSourceStat');
    } else {
      fail('createSourceStat', 'Returned row missing expected scrape_run_id or source');
    }
  } catch (err) {
    fail('createSourceStat', err);
  }

  // Test 5 — insertReviews (first insert)
  try {
    const reviews = buildTestReviews(scrapeRunId);
    const count = await insertReviews(reviews);
    console.log(`\nTest 5 — insertReviews (first insert) returned count: ${count}`);

    if (count === 2) {
      pass('insertReviews (first insert)');
    } else {
      fail('insertReviews (first insert)', `Expected 2 inserted rows, got ${count}`);
    }
  } catch (err) {
    fail('insertReviews (first insert)', err);
  }

  // Test 6 — insertReviews (duplicate check)
  try {
    const reviews = buildTestReviews(scrapeRunId);
    const count = await insertReviews(reviews);
    console.log(`\nTest 6 — insertReviews (duplicate check) returned count: ${count}`);

    if (count === 0) {
      pass('insertReviews (duplicates skipped)');
    } else {
      fail('insertReviews (duplicates skipped)', `Expected 0 new rows, got ${count}`);
    }
  } catch (err) {
    fail('insertReviews (duplicates skipped)', err);
  }

  // Test 7 — getScrapeRunWithStats
  try {
    const result = await getScrapeRunWithStats(scrapeRunId);
    console.log('\nTest 7 — getScrapeRunWithStats returned:');
    console.log(JSON.stringify(result, null, 2));

    const hasRun = result.scrapeRun && result.scrapeRun.id === scrapeRunId;
    const hasStat = result.sourceStats &&
      result.sourceStats.some((s) => s.id === sourceStatId && s.source === 'app_store');

    if (hasRun && hasStat) {
      pass('getScrapeRunWithStats');
    } else {
      fail(
        'getScrapeRunWithStats',
        'Missing expected scrape_run or source_stats row from Test 4'
      );
    }
  } catch (err) {
    fail('getScrapeRunWithStats', err);
  }

  console.log(`\n=== Summary: ${passed}/7 tests passed ===`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(({ label, message }) => {
      console.log(`  - ${label}: ${message}`);
    });
  }

  if (scrapeRunId) {
    await verifyInDatabase();
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
