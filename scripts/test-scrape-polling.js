const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (msg) => logs.push(msg.text()));

  await page.setViewport({ width: 1400, height: 900 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await page.waitForSelector('#dashboard-content:not(.hidden)', { timeout: 15000 });

  const before = await page.$eval('#last-updated', (el) => el.textContent);
  const beforeScraped = await page.$eval('#stat-scraped', (el) => el.textContent);
  console.log('BEFORE:', before, '| scraped:', beforeScraped);

  await page.evaluate(() => document.getElementById('scrape-btn').click());

  const start = Date.now();
  let finalBtn = '';
  while (Date.now() - start < 300000) {
    finalBtn = await page.$eval('#scrape-btn', (el) => el.textContent.trim());
    const elapsed = Math.round((Date.now() - start) / 1000);
    if (elapsed % 15 === 0 || finalBtn === 'Scrape Now') {
      console.log(`[${elapsed}s] button: ${finalBtn.substring(0, 60)}`);
    }
    if (finalBtn === 'Scrape Now' && elapsed > 10) break;
    await new Promise((r) => setTimeout(r, 3000));
  }

  const after = await page.$eval('#last-updated', (el) => el.textContent);
  const afterScraped = await page.$eval('#stat-scraped', (el) => el.textContent);
  console.log('AFTER:', after, '| scraped:', afterScraped);
  console.log('FINAL BUTTON:', finalBtn);
  console.log('DURATION:', Math.round((Date.now() - start) / 1000) + 's');
  console.log('SUCCESS:', finalBtn === 'Scrape Now' && after !== before);

  console.log('\n--- Poll console logs ---');
  logs.filter((l) => l.includes('[poll]') || l.includes('[scrape]')).forEach((l) => console.log(l));

  await page.screenshot({ path: 'public/dashboard-after-scrape.png', fullPage: true });
  console.log('\nScreenshot saved: public/dashboard-after-scrape.png');

  await browser.close();
  process.exit(finalBtn === 'Scrape Now' ? 0 : 1);
})();
