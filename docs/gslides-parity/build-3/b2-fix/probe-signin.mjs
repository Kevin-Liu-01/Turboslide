// Fixer probe for VERIFICATION-3 finding 9: the Sign in row of the own chip's menu with an auth database.
import { chromium } from 'playwright-core';
const base = process.argv[2] ?? 'http://localhost:4331';
const browser = await chromium.launch();
const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const A = await c.newPage();
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
console.log('state.account', JSON.stringify(s.account));
const ok = await fetch(base + '/api/auth/ok')
  .then((r) => r.status)
  .catch((e) => String(e));
console.log('/api/auth/ok status', ok);
await A.click('[data-control="title.account"]');
await A.waitForTimeout(400);
const rows = await A.$$eval('[role="menu"] [data-menu-item]', (els) =>
  els.map((e) => e.getAttribute('data-menu-item')),
);
console.log('own chip menu rows:', rows.join(', '));
const row = await A.$('[data-menu-item="title.account.signIn"]');
console.log('Sign in row present:', row !== null);
if (row) {
  await row.click();
  await A.waitForTimeout(500);
  const dialog = await A.$('[data-control="dialog.signIn"]');
  console.log(
    'sign in dialog open:',
    dialog !== null,
    'email field:',
    (await A.$('[data-control="dialog.signIn.email"]')) !== null,
    'passkey row:',
    (await A.$('[data-control="dialog.signIn.passkey"]')) !== null,
    'github row:',
    (await A.$('[data-control="dialog.signIn.github"]')) !== null,
  );
  if (dialog) {
    await A.fill('[data-control="dialog.signIn.email"]', 'fixer-probe@example.test');
    await A.click('[data-control="dialog.signIn.continue"]');
    await A.waitForTimeout(1500);
    const error = await A.$eval(
      '[data-control="dialog.signIn.error"]',
      (el) => el.textContent,
    ).catch(() => 'no error row');
    const code = await A.$('[data-control="dialog.signIn.code"]');
    console.log(
      'after Continue: code field present:',
      code !== null,
      'error row:',
      JSON.stringify(error),
    );
  }
}
await browser.close();
