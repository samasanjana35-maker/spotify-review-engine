require('dotenv').config();

const http = require('http');

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

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: process.env.PORT || 3000,
      path,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, body: json, elapsed: res.elapsed });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testHealth() {
  const res = await request('GET', '/health');
  if (res.status === 200 && res.body?.status === 'ok') {
    pass('GET /health returns 200');
  } else {
    fail('GET /health', `status=${res.status}`);
  }
}

async function testDashboard() {
  const res = await request('GET', '/api/dashboard');
  if (res.status !== 200) {
    fail('GET /api/dashboard', `status=${res.status}`);
    return;
  }

  const d = res.body;
  const checks = [
    ['lastScrapeRun', d.lastScrapeRun?.scrapeRunId],
    ['stats.totalScraped', typeof d.stats?.totalScraped === 'number'],
    ['stats.totalFiltered', typeof d.stats?.totalFiltered === 'number'],
    ['stats.sources.app_store', d.stats?.sources?.app_store],
    ['stats.sources.play_store', d.stats?.sources?.play_store],
    ['stats.sources.reddit', d.stats?.sources?.reddit],
    ['stats.sources.forums', d.stats?.sources?.forums],
    ['stats.sources.bluesky', d.stats?.sources?.bluesky],
    ['analysis.q1', d.analysis?.q1?.answer],
    ['analysis.q6', d.analysis?.q6?.answer],
    ['analysis.summary', d.analysis?.summary],
    ['lastUpdated', d.lastUpdated],
  ];

  let allOk = true;
  for (const [label, ok] of checks) {
    if (!ok) { allOk = false; fail(`dashboard.${label}`, 'missing'); }
  }

  if (allOk) {
    pass('GET /api/dashboard returns complete data structure');
    console.log(`  → scraped=${d.stats.totalScraped}, filtered=${d.stats.totalFiltered}`);
    console.log(`  → analysis reviews=${d.analysis?.reviewCountAnalyzed}`);
  }
}

async function testScrapePost() {
  const start = Date.now();
  const res = await request('POST', '/api/scrape', { triggeredBy: 'api-test' });
  const elapsed = Date.now() - start;

  if (res.status === 202 && res.body?.scrapeRunId && res.body?.message === 'Scrape started') {
    pass(`POST /api/scrape returns 202 (${elapsed}ms)`);
    if (elapsed < 1000) {
      pass(`POST /api/scrape responds in under 1 second (${elapsed}ms)`);
    } else {
      fail('POST /api/scrape speed', `took ${elapsed}ms (expected < 1000ms)`);
    }
    return res.body.scrapeRunId;
  }

  fail('POST /api/scrape', `status=${res.status}, body=${JSON.stringify(res.body)}`);
  return null;
}

async function testScrapeStatus(runId) {
  if (!runId) return;

  const res = await request('GET', `/api/scrape/status/${runId}`);
  if (res.status === 200 && res.body?.scrapeRunId === runId) {
    pass('GET /api/scrape/status/:runId returns 200');
    console.log(`  → status=${res.body.status}, scraped=${res.body.totalScraped}`);
  } else {
    fail('GET /api/scrape/status/:runId', `status=${res.status}`);
  }
}

async function testScrapeLatest() {
  const res = await request('GET', '/api/scrape/latest');
  if (res.status === 200 && res.body?.scrapeRunId) {
    pass('GET /api/scrape/latest returns 200');
    console.log(`  → runId=${res.body.scrapeRunId}, status=${res.body.status}`);
  } else {
    fail('GET /api/scrape/latest', `status=${res.status}`);
  }
}

async function testAnalysisLatest() {
  const res = await request('GET', '/api/analysis/latest');
  if (res.status === 200 && res.body?.q1) {
    pass('GET /api/analysis/latest returns 200 with analysis');
  } else {
    fail('GET /api/analysis/latest', `status=${res.status}`);
  }
}

async function main() {
  console.log('=== Phase 6: API Endpoint Tests ===\n');

  try {
    await testHealth();
    await testDashboard();
    const runId = await testScrapePost();
    await testScrapeStatus(runId);
    await testScrapeLatest();
    await testAnalysisLatest();

    console.log(`\n=== Summary: ${passed}/${passed + failed} checks passed ===`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error(`\n❌ Test runner error: ${err.message}`);
    console.error('Is the server running? Start with: npm start');
    process.exit(1);
  }
}

main();
