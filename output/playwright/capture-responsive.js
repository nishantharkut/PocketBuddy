const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const base = 'http://127.0.0.1:5173';
const pages = ['/dashboard', '/runway', '/travel'];
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    for (const route of pages) {
      const url = base + route;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => {
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
      });
      await page.waitForTimeout(1200);
      const finalUrl = page.url();
      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        const width = Math.max(doc.scrollWidth, body?.scrollWidth || 0);
        const client = doc.clientWidth;
        const overflowers = Array.from(document.querySelectorAll('body *'))
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { tag: el.tagName, id: el.id, cls: String(el.className || '').slice(0, 120), left: r.left, right: r.right, width: r.width, text: (el.textContent || '').trim().slice(0, 80) };
          })
          .filter((x) => x.width > 0 && (x.right > client + 1 || x.left < -1))
          .slice(0, 12);
        return { scrollWidth: width, clientWidth: client, hasHorizontalOverflow: width > client + 1, overflowers };
      });
      const file = path.join('output', 'playwright', `${route.replace('/', '')}-${viewport.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      results.push({ route, viewport: viewport.name, finalUrl, screenshot: file, ...metrics });
    }
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join('output', 'playwright', 'responsive-ui-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})();
