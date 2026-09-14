// Fixer probe: does a second context reach the first's roster on the open deck and on a copy a third context made?
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
const roster = async (a, label) => {
  const until = Date.now() + 12_000;
  let n = 0;
  while (Date.now() < until) {
    n = (await inv(a, 'presence.list', {})).others.length;
    if (n > 0) break;
    await a.waitForTimeout(250);
  }
  const s = await st(a);
  console.log(
    `${label}: A sees ${n} others after ${12_000 - Math.max(0, until - Date.now())} ms; A role=${s.access.role} via=${s.access.via} connected=${s.sync.connected}`,
  );
};
const open = async (deckId) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${base}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  await ready(p);
  return [ctx, p];
};
// 1. the open deck
let [ca, A] = await open('gt-brand');
let [cb, B] = await open('gt-brand');
await roster(A, 'gt-brand (legacy open)');
await ca.close();
await cb.close();
// 2. a copy made by a third context
const [cc, C] = await open('gt-brand');
const info = await inv(C, 'deck.info');
const copy = `fix-roster-${Date.now().toString(36)}`;
await inv(C, 'deck.copy', {
  id: 'gt-brand',
  name: 'Roster probe',
  newId: copy,
  baseRevision: info.revision,
});
[ca, A] = await open(copy);
[cb, B] = await open(copy);
await roster(A, 'copy by a third context (restricted, shadow)');
const sb = await st(B);
console.log(
  'B role',
  sb.access.role,
  'via',
  sb.access.via,
  'capabilities',
  sb.access.capabilities.length,
);
await ca.close();
await cb.close();
// 3. the same copy after the creator opens it to editors by link
await C.goto(`${base}/edit/${copy}`, { waitUntil: 'domcontentloaded' });
await ready(C);
const rec = await st(C);
const link = await inv(C, 'share.setGeneralAccess', {
  id: copy,
  mode: 'link',
  role: 'editor',
  baseRevision: rec.access.revision,
});
const viaLink = async () => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(link.url, { waitUntil: 'domcontentloaded' });
  await p.waitForURL(/\/(deck|edit)\//, { timeout: 30_000 });
  await p.goto(`${base}/edit/${copy}`, { waitUntil: 'domcontentloaded' });
  await ready(p);
  return [ctx, p];
};
[ca, A] = await viaLink();
[cb, B] = await viaLink();
await roster(A, 'copy through an editor link');
const fin = await inv(C, 'deck.info');
await inv(C, 'deck.trash', { id: copy, baseRevision: fin.revision }).catch(() => undefined);
await browser.close();
