const puppeteer = require('puppeteer');

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

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const consoleErrors = [];

  console.log('=== Phase 7: Browser Tests ===\n');

  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await page.setViewport({ width: 1400, height: 900 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('#dashboard-content:not(.hidden)', { timeout: 10000 });

  const qCards = await page.$$('.question-card');
  if (qCards.length === 6) pass('All 6 question cards rendered');
  else fail('Question cards', `found ${qCards.length}, expected 6`);

  const scraped = await page.$eval('#stat-scraped', (el) => el.textContent);
  if (scraped && scraped !== '—') pass(`Stats bar shows data (${scraped} scraped)`);
  else fail('Stats bar', 'empty');

  const sources = await page.$$('.source-row');
  if (sources.length === 5) pass('Source breakdown shows all 5 sources');
  else fail('Source breakdown', `found ${sources.length}`);

  if (await page.$('.evidence-quote')) pass('Evidence quotes displayed');
  else fail('Evidence quotes', 'not found');

  if (await page.$('.severity-badge')) pass('Severity badges displayed');
  else fail('Severity badges', 'not found');

  const errorPage = await browser.newPage();
  await errorPage.setRequestInterception(true);
  errorPage.on('request', (req) => {
    if (req.url().includes('/api/')) req.abort('failed');
    else req.continue();
  });
  await errorPage.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await errorPage.waitForSelector('#error-banner:not(.hidden)', { timeout: 8000 });
  const errText = await errorPage.$eval('#error-banner', (el) => el.textContent);
  if (errText.includes('Unable to load')) pass('API failure shows graceful error');
  else fail('API failure error', errText);
  await errorPage.close();

  await page.waitForSelector('#scrape-btn:not(:disabled)');
  await page.click('#scrape-btn');
  await page.click('#scrape-btn');
  await new Promise((r) => setTimeout(r, 200));
  const btnDisabled = await page.$eval('#scrape-btn', (el) => el.disabled);
  if (btnDisabled) pass('Double-click ignored while scraping');
  else fail('Double-click guard', 'button not disabled');

  await page.setViewport({ width: 375, height: 812 });
  await new Promise((r) => setTimeout(r, 500));
  const titleVisible = await page.$eval('.navbar-title', (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (titleVisible) pass('Mobile layout readable');
  else fail('Mobile layout', 'title not visible');

  if (consoleErrors.length === 0) pass('No console errors');
  else fail('Console errors', consoleErrors.join('; '));

  await browser.close();

  console.log(`\n=== Summary: ${passed}/${passed + failed} checks passed ===`);
  process.exit(failed > 0 ? 1 : 0);
})();
