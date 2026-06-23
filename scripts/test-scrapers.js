require('dotenv').config();

const { runAllScrapers } = require('../src/services/scraperOrchestrator');

const TARGETS = {
  appStore: 300,
  playStore: 1500,
  reddit: 150,
  forums: 0,
  bluesky: 200,
};
const TOTAL_TARGET = 2000;

function evaluatePass(name, count, minCount) {
  if (minCount === 0) return true;
  return count >= minCount;
}

async function main() {
  console.log('=== Spotify Review Engine — Boosted Scraper Test ===\n');

  const start = Date.now();
  const { reviews, stats } = await runAllScrapers();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\nCombined reviews: ${reviews.length} (${elapsed}s)\n`);
  console.log('Per-source results:');

  let passed = 0;
  const keys = Object.keys(TARGETS);

  keys.forEach((key) => {
    const count = stats[key]?.count || 0;
    const target = TARGETS[key];
    const ok = evaluatePass(key, count, target);
    const status = ok ? '✅ PASS' : '❌ FAIL';
    const targetLabel = target > 0 ? ` (target: ${target}+)` : ' (graceful empty OK)';
    console.log(`  ${status}: ${key} — ${count} reviews${targetLabel}`);
    if (ok) passed += 1;
  });

  const totalOk = reviews.length >= TOTAL_TARGET;
  console.log(`\n${totalOk ? '✅ PASS' : '❌ FAIL'}: Total — ${reviews.length} reviews (target: ${TOTAL_TARGET}+)`);

  console.log('\n=== Summary ===');
  console.log(`Sources passed: ${passed}/${keys.length}`);
  console.log(`Total reviews: ${reviews.length}`);
  console.log(`Total target met: ${totalOk ? 'YES' : 'NO'}`);

  process.exit(totalOk ? 0 : 1);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
