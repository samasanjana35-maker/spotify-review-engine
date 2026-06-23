const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const consoleErrors = [];

  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await page.setViewport({ width: 1400, height: 900 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('#dashboard-content:not(.hidden)', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 2000));

  const title = await page.title();
  const navTitle = await page.$eval('.navbar-title', (el) => el.textContent);
  const sectionTitle = await page.$eval('.questions-section .section-title', (el) => el.textContent);
  const cards = await page.$$('.question-card');
  const hasRadarPulse = await page.$eval('.radar-pulse', (el) => {
    const style = window.getComputedStyle(el);
    return style.animationName !== 'none';
  });
  const hasGlass = await page.$eval('.stat-card', (el) => {
    const style = window.getComputedStyle(el);
    return style.backdropFilter !== 'none' || style.webkitBackdropFilter !== 'none';
  });

  console.log('Page title:', title);
  console.log('Navbar:', navTitle);
  console.log('Section:', sectionTitle);
  console.log('Question cards:', cards.length);
  console.log('Radar pulse animation:', hasRadarPulse ? '✅' : '❌');
  console.log('Glassmorphism:', hasGlass ? '✅' : '❌');
  console.log('Console errors:', consoleErrors.length === 0 ? '✅ none' : consoleErrors);

  await page.screenshot({ path: 'public/spotify-radar-dashboard.png', fullPage: true });
  console.log('Screenshot: public/spotify-radar-dashboard.png');

  await page.setViewport({ width: 375, height: 812 });
  await new Promise((r) => setTimeout(r, 500));
  const mobileOk = await page.$eval('.navbar-title', (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0;
  });
  console.log('Mobile layout:', mobileOk ? '✅' : '❌');

  await browser.close();
  process.exit(consoleErrors.length > 0 ? 1 : 0);
})();
