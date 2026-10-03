import { createRequire } from 'module';
const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
const { chromium } = require('playwright-core');
const URL = 'file:///Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/direction-a/index.html';
const OUT = process.env.OUT || '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/dira';
const jobs = (process.argv[2] || '1440x900:light').split(',');
const browser = await chromium.launch();
for (const job of jobs) {
  const [size, scheme] = job.split(':');
  const [w, h] = size.split('x').map(Number);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await page.goto(URL);
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__dirA && window.__dirA.finishIntro());
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/first-${w}-${scheme}.png` });
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += Math.round(h * 0.6)) { await page.evaluate(y => window.scrollTo(0, y), y); await page.waitForTimeout(250); }
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const name = `${OUT}/full-${w}-${scheme}.png`;
  await page.screenshot({ path: name, fullPage: true });
  console.log(job, 'height', H, JSON.stringify(logs));
  await ctx.close();
}
await browser.close();
