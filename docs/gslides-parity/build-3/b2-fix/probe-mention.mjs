// Fixer probe: the comments.spec mention step, with A's roster count read at each moment.
import { chromium } from 'playwright-core';
const base = process.argv[2] ?? 'http://localhost:4331';
const browser = await chromium.launch();
const ready = async (p) => {
  await p.waitForFunction(
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
  await p.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const inv = (p, id, input) =>
  p.evaluate(([i, v]) => window.turboslide.studio.invoke(i, v), [id, input]);
const st = (p) => p.evaluate(() => window.turboslide.studio.describe().state);
const goTo = async (p, id) => {
  await inv(p, 'view.goto', { slideId: id });
  await p.waitForSelector(`.pt-viewer[data-active="${id}"]`);
};
const S = await (await browser.newContext()).newPage();
await S.goto(`${base}/edit/gt-brand`, { waitUntil: 'domcontentloaded' });
await ready(S);
const copy = `fix-mention-${Date.now().toString(36)}`;
await inv(S, 'deck.copy', {
  id: 'gt-brand',
  name: 'Mention probe',
  newId: copy,
  baseRevision: (await inv(S, 'deck.info')).revision,
});
await S.context().close();
const t0 = Date.now();
const A = await (await browser.newContext()).newPage();
const B = await (await browser.newContext()).newPage();
await A.goto(`${base}/edit/${copy}`, { waitUntil: 'domcontentloaded' });
await ready(A);
await B.goto(`${base}/edit/${copy}`, { waitUntil: 'domcontentloaded' });
await ready(B);
await goTo(A, 'thesis');
await goTo(B, 'thesis');
const me = (await st(B)).account;
let sa = await st(A);
console.log(
  `+${Date.now() - t0}ms both ready; A sees ${sa.presence.others.length} others, connected ${sa.sync.connected}; B label "${me.label}"`,
);
await A.locator('.ts-stagewrap.ts-editor [data-block="big"]').click({ position: { x: 4, y: 4 } });
await A.keyboard.press('ControlOrMeta+Alt+m');
const card = A.locator('[data-control="comment.card"]');
await card.waitFor({ state: 'visible', timeout: 5000 });
console.log(
  `+${Date.now() - t0}ms card open; placeholder "${await card.locator('[data-control="comment.card.new.field"]').getAttribute('placeholder')}"`,
);
await card.locator('[data-control="comment.card.new.field"]').fill('Check this @');
await card.locator('[data-control="comment.card.new.field"]').type(me.label.slice(0, 3));
const until = Date.now() + 25_000;
let shownAt = null;
while (Date.now() < until) {
  const n = await card.locator('[data-control^="comment.card.new.mention."]').count();
  if (n > 0) {
    shownAt = Date.now() - t0;
    break;
  }
  await A.waitForTimeout(250);
}
sa = await st(A);
console.log(
  `mention suggestions shown at +${shownAt}ms; A sees ${sa.presence.others.length} others now; field value "${await card.locator('[data-control="comment.card.new.field"]').inputValue()}"`,
);
if (shownAt === null) {
  // retype to re-trigger the query with the roster present
  await card.locator('[data-control="comment.card.new.field"]').fill('Check this @');
  await card.locator('[data-control="comment.card.new.field"]').type(me.label.slice(0, 3));
  await A.waitForTimeout(500);
  console.log(
    'after retyping: suggestions',
    await card.locator('[data-control^="comment.card.new.mention."]').count(),
    'controls in card:',
    (
      await card
        .locator('[data-control]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-control')))
    )
      .slice(0, 12)
      .join(', '),
  );
}
const fin = await inv(A, 'deck.info');
await inv(A, 'deck.trash', { id: copy, baseRevision: fin.revision }).catch(() => undefined);
await browser.close();
