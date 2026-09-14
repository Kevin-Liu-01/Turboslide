import { chromium } from 'playwright-core';
const base = process.argv[2] ?? 'http://localhost:4331';
const browser = await chromium.launch();
const A = await (await browser.newContext()).newPage();
await A.goto(base + '/edit/gt-brand', { waitUntil: 'domcontentloaded' });
await A.waitForFunction(
  () => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  },
  null,
  { timeout: 90_000 },
);
await A.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
const s = await A.evaluate(() => window.turboslide.studio.describe().state);
console.log(
  'capabilities',
  JSON.stringify(s.access.capabilities),
  'role',
  s.access.role,
  'sync',
  JSON.stringify(s.sync),
);
for (const input of [{ state: 'all', includeDeleted: true, limit: 200 }, { state: 'all' }]) {
  const r = await A.evaluate(
    (i) =>
      window.turboslide.studio.invoke('comment.list', i).then(
        (v) => ({ ok: true, n: v.threads.length }),
        (e) => ({ ok: false, e: String(e).slice(0, 220) }),
      ),
    input,
  );
  console.log(JSON.stringify(input), '->', JSON.stringify(r));
}
await browser.close();
