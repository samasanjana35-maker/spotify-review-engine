require('dotenv').config();

const supabase = require('../src/config/supabase');
const { runScrapeOrchestrator } = require('../src/services/scraperOrchestrator');

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

async function verifyDatabase(scrapeRunId) {
  console.log('\n--- Supabase verification ---\n');

  const { data: scrapeRun, error: runError } = await supabase
    .from('scrape_runs')
    .select('*')
    .eq('id', scrapeRunId)
    .single();

  if (runError) {
    fail('scrape_runs row exists', runError.message);
  } else if (scrapeRun && scrapeRun.status === 'completed') {
    pass(`scrape_runs row exists (status=${scrapeRun.status})`);
  } else {
    fail('scrape_runs row exists', `status=${scrapeRun?.status}`);
  }

  const { data: sourceStats, error: statsError } = await supabase
    .from('source_stats')
    .select('*')
    .eq('scrape_run_id', scrapeRunId);

  if (statsError) {
    fail('source_stats rows exist', statsError.message);
  } else if (sourceStats && sourceStats.length === 5) {
    pass(`source_stats has 5 rows (${sourceStats.map((s) => s.source).join(', ')})`);
    sourceStats.forEach((s) => {
      console.log(`  → ${s.source}: raw=${s.raw_count}, filtered=${s.filtered_count}, status=${s.status}`);
    });
  } else {
    fail('source_stats rows exist', `found ${sourceStats?.length || 0}, expected 5`);
  }

  const { data: reviews, error: reviewsError } = await supabase
    .from('reviews')
    .select('external_id, source, matched_keywords, is_relevant')
    .eq('scrape_run_id', scrapeRunId);

  if (reviewsError) {
    fail('reviews rows exist', reviewsError.message);
  } else if (reviews && reviews.length > 0) {
    const withKeywords = reviews.filter((r) => r.matched_keywords && r.matched_keywords.length > 0);
    pass(`reviews table has ${reviews.length} rows (${withKeywords.length} with matched_keywords)`);
    reviews.slice(0, 3).forEach((r) => {
      console.log(`  → [${r.source}] ${r.external_id}: keywords=[${r.matched_keywords.join(', ')}]`);
    });
  } else {
    fail('reviews rows exist', 'no rows found for this scrape run');
  }
}

async function main() {
  console.log('=== Spotify Review Engine — Full Pipeline Test ===\n');

  const start = Date.now();

  try {
    const result = await runScrapeOrchestrator('test-pipeline');
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log('\n--- Pipeline results ---\n');
    console.log(`scrapeRunId:    ${result.scrapeRunId}`);
    console.log(`totalScraped:   ${result.totalScraped}`);
    console.log(`totalFiltered:  ${result.totalFiltered}`);
    console.log(`totalStored:    ${result.totalStored}`);
    console.log(`relevanceRate:  ${result.filterStats.relevanceRate}%`);
    console.log(`elapsed:        ${elapsed}s`);

    console.log('\nPer-source stats:');
    Object.entries(result.stats).forEach(([key, s]) => {
      console.log(`  ${key}: count=${s.count}, status=${s.status}`);
    });

    if (result.totalScraped > 0) {
      pass(`totalScraped > 0 (${result.totalScraped})`);
    } else {
      fail('totalScraped > 0', 'got 0');
    }

    if (result.totalFiltered > 0) {
      pass(`totalFiltered > 0 (${result.totalFiltered})`);
    } else {
      fail('totalFiltered > 0', 'got 0');
    }

    if (result.totalStored > 0) {
      pass(`totalStored > 0 (${result.totalStored})`);
    } else {
      fail('totalStored > 0', 'got 0');
    }

    await verifyDatabase(result.scrapeRunId);

    console.log(`\n=== Summary: ${passed}/${passed + failed} checks passed ===`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error(`\n❌ Pipeline failed: ${err.message}`);
    process.exit(1);
  }
}

main();
