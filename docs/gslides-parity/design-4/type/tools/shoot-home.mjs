import { createRequire } from 'node:module';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const EXE =
  '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const TYPE = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/design-4/type';
const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--allow-file-access-from-files'],
});
async function shoot(out, { width = 1440, height = 900, theme = 'dark', dpr = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('gt-theme', t);
    } catch {}
  }, theme);
  await page.goto(`file://${TYPE}/home.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => {
      i.loading = 'eager';
    });
  });
  // scroll through the page so every deferred picture starts, then wait for each to decode
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += 700) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  const pending = await page.evaluate(async () => {
    const imgs = [...document.images];
    const results = await Promise.all(
      imgs.map((i) =>
        Promise.race([
          i
            .decode()
            .then(() => 'ok')
            .catch(() => 'fail'),
          new Promise((r) => setTimeout(() => r('timeout'), 20000)),
        ]),
      ),
    );
    return results
      .map((r, k) => [imgs[k].getAttribute('src').split('/').pop(), r, imgs[k].naturalWidth])
      .filter(([, r, w]) => r !== 'ok' || w === 0);
  });
  if (pending.length) console.log('not decoded', JSON.stringify(pending));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${TYPE}/previews/${out}`, fullPage: true });
  const size = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.scrollHeight,
    document.fonts.check('500 20px "Inter Local"'),
  ]);
  await ctx.close();
  console.log(out, size.join(' x '));
}
await shoot('home.png', { theme: 'dark' });
await shoot('home-light.png', { theme: 'light' });
await shoot('home-390.png', { width: 390, height: 844, theme: 'dark' });
await browser.close();
