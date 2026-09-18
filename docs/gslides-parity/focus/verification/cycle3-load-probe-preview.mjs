// the integrator, cycle 3: load a page of a deployment in a fresh browser with the OIDC header and report the boot,
// every response at or over 400, every failed request and the slow requests (over 5 s)
import { createRequire } from 'node:module';
const require = createRequire(
  '/Users/kevinliu/repos/Turboslide/scripts/probes/editor-walk-probe.mjs',
);
const { chromium } = require('playwright-core');
const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : fallback;
};
const BASE = arg('base', '').replace(/\/$/, '');
const PATH = arg('path', '/edit/gt-brand');
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ...(OIDC ? { extraHTTPHeaders: { 'x-vercel-trusted-oidc-idp-token': OIDC } } : {}),
});
const page = await context.newPage();
const t0 = Date.now();
const started = new Map();
page.on('request', (r) => started.set(r, Date.now()));
page.on('response', (r) => {
  const ms = Date.now() - (started.get(r.request()) ?? Date.now());
  const url = r.url().replace(BASE, '');
  if (r.status() >= 400 || ms > 5000 || /\/api\/|_serverFn|\/_server/.test(url))
    console.log(
      `  ${String(Date.now() - t0).padStart(6)} ms  ${r.status()} ${ms} ms ${url.slice(0, 120)}`,
    );
});
page.on('requestfailed', (r) =>
  console.log(
    `  ${String(Date.now() - t0).padStart(6)} ms  FAILED ${r.url().replace(BASE, '').slice(0, 120)} ${r.failure()?.errorText}`,
  ),
);
page.on('pageerror', (e) => console.log(`  pageerror ${String(e).slice(0, 200)}`));
page.on('framenavigated', (f) => {
  if (f === page.mainFrame())
    console.log(
      `  ${String(Date.now() - t0).padStart(6)} ms  navigated ${f.url().replace(BASE, '').slice(0, 120)}`,
    );
});
await page.goto(`${BASE}${PATH}`, { waitUntil: 'domcontentloaded' });
let studio = false,
  connected = false;
const until = Date.now() + 95_000;
while (Date.now() < until) {
  studio = await page.evaluate(() => Boolean(window.turboslide?.studio)).catch(() => false);
  if (studio) {
    connected = await page
      .evaluate(() => window.turboslide.studio.describe().state.sync?.connected === true)
      .catch(() => false);
    if (connected) break;
  }
  await new Promise((r) => setTimeout(r, 500));
}
console.log(
  `studio ${studio} connected ${connected} at ${Date.now() - t0} ms; title "${await page.title()}"`,
);
await browser.close();
