// The verifier's probe for the audit's one rows miss: after the draft's first write creates the
// deck, does Edit > Undo (and the toolbar's Undo) read enabled, and can the first write be undone?
import { launchBrowser } from '/Users/kevinliu/repos/Turboslide/packages/headless/src/launch.ts';
import { spawnSync } from 'node:child_process';
const BASE = 'http://localhost:4321';
const launched = await launchBrowser();
const context = await launched.browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const out = (o) => console.log(JSON.stringify(o));
await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.turboslide?.studio?.describe, null, { timeout: 60_000 });
const st = await page.evaluate(() => window.turboslide.studio.describe().state);
const t0 = Date.now();
await page.evaluate(
  (s) =>
    window.turboslide.studio.invoke('slide.update', {
      slideId: s.slideId,
      baseRevision: s.revision,
      mutations: [{ op: 'slide.set', slideId: s.slideId, path: '/heading', value: 'Undo probe' }],
    }),
  st,
);
const sample = async (label) =>
  out({
    t: Date.now() - t0,
    label,
    url: page.url().replace(BASE, ''),
    ...(await page.evaluate(() => {
      const d = window.turboslide?.studio?.describe?.();
      return {
        revision: d?.state?.revision,
        pending: d?.state?.pending,
        serverRevision: d?.state?.serverRevision,
        save: document.querySelector('[data-control="deck.saveState"]')?.textContent?.trim(),
        toolbarUndo: document
          .querySelector('[data-control="toolbar.undo"]')
          ?.getAttribute('aria-disabled'),
        menuUndo:
          document.querySelector('[data-menu-item="edit.undo"]')?.getAttribute('aria-disabled') ??
          'menu closed',
      };
    })),
  });
for (let i = 0; i < 24; i++) {
  await sample('poll');
  await page.waitForTimeout(500);
}
// open the Edit menu and read the row
await page.click('[data-control="menubar.edit"]');
await page.waitForSelector('[data-menu-item="edit.undo"]', { timeout: 5000 }).catch(() => null);
await sample('edit menu open');
await page.keyboard.press('Escape');
// try to undo the first write
const before = (await page.evaluate(() => window.turboslide.studio.describe().state)).revision;
await page.keyboard.press('Meta+z');
await page.waitForTimeout(2000);
const after = await page.evaluate(() => window.turboslide.studio.describe().state);
const heading = await page.evaluate(async () => {
  const s = window.turboslide.studio.describe().state;
  const r = await window.turboslide.studio.invoke('slide.get', { slideId: s.slideId });
  return r.slide.heading;
});
out({
  label: 'Cmd+Z on the first write',
  revisionBefore: before,
  revisionAfter: after.revision,
  heading,
});
const deckId = new URL(page.url()).pathname.split('/')[2];
await launched.close();
// remove the probe's deck through the CLI (file store)
for (const args of [
  ['deck', 'trash', deckId],
  ['deck', 'remove', deckId, '--confirm'],
]) {
  const r = spawnSync(process.execPath, ['apps/cli/bin/turboslide.mjs', ...args, '--json'], {
    cwd: '/Users/kevinliu/repos/Turboslide',
    encoding: 'utf8',
  });
  out({
    cleanup: args.join(' '),
    status: r.status,
    out: (r.stdout || r.stderr).slice(0, 120).replace(/\n/g, ' '),
  });
}
