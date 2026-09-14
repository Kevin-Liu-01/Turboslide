#!/usr/bin/env node
// Read only: the preview's editor on gt-brand (the legacy open deck) and on /new: the room's sync facts,
// the save words, and every response of 400 or more with its path (the stream route among them).
import { launchBrowser } from '../../../../packages/headless/src/launch.ts';
const BASE = process.argv[2] ?? 'https://turboslide-igavfcg2x-kl01s-projects.vercel.app';
const P = { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN ?? '' };
const launched = await launchBrowser({ probeRenderer: false });
for (const path of ['/edit/gt-brand', '/new']) {
  const context = await launched.browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: P,
  });
  const page = await context.newPage();
  const bad = [];
  page.on('response', (r) => {
    if (r.status() >= 400)
      bad.push(
        `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}${new URL(r.url()).search.slice(0, 40)}`,
      );
  });
  const t0 = Date.now();
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => {
      try {
        return Boolean(window.turboslide?.studio);
      } catch {
        return false;
      }
    },
    null,
    { timeout: 120_000 },
  );
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 90_000 });
  await page.waitForTimeout(8000);
  const st = await page.evaluate(() => window.turboslide.studio.describe().state);
  const words = await page
    .$eval('[data-control="deck.saveState"]', (e) => e.textContent.trim())
    .catch(() => null);
  console.log(
    path,
    'settled in',
    Date.now() - t0,
    'ms; sync',
    JSON.stringify(st.sync),
    '; access',
    JSON.stringify(st.access),
    '; save words',
    JSON.stringify(words),
  );
  console.log('  responses >= 400:', bad.length ? bad.join(' | ') : 'none');
  await context.close();
}
await launched.close();
