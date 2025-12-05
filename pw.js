const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (msg) => console.log('BROWSER', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.error('BROWSER PAGE ERROR', err));
  await page.goto('http://localhost:4173/index.html');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/workspace/debug.png' });
  await browser.close();
})();
