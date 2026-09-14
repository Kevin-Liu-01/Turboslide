// Does an agent HTTP write reach the open editor, and when? Mirrors agent-http.spec.ts row 5 on a
// scratch copy of decks/fixture under decks/e2e-agent-diag, polling the page's revision for 15 s.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const ROOT = '/Users/kevinliu/repos/Turboslide';
const BASE = 'http://localhost:4332';
const argAt = (n) => {
  const i = process.argv.indexOf(n);
  return i === -1 ? null : process.argv[i + 1];
};
const DECK = argAt('--deck') ?? `e2e-agent-diag-${Date.now().toString(36)}`;
const AUTHOR = argAt('--author');
const SETTLED = process.argv.includes('--settled');
const DIR = join(ROOT, 'decks', DECK);
const { chromium } = createRequire(join(ROOT, 'package.json'))('@playwright/test');

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
cpSync(join(ROOT, 'decks', 'fixture', 'slides'), join(DIR, 'slides'), { recursive: true });
const manifest = JSON.parse(readFileSync(join(ROOT, 'decks', 'fixture', 'deck.json'), 'utf8'));
manifest.id = DECK;
writeFileSync(join(DIR, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const diskRevision = () => JSON.parse(readFileSync(join(DIR, 'deck.json'), 'utf8')).revision;

const browser = await chromium.launch();
process.on('unhandledRejection', (e) => {
  console.log('failed:', e instanceof Error ? e.message.split('\n')[0] : String(e));
});
try {
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      console.log('  console', m.type(), m.text().slice(0, 160));
  });
  await page.goto(`${BASE}/edit/${DECK}${AUTHOR ? `?author=${AUTHOR}` : ''}`);
  console.log(`deck ${DECK}; author query ${AUTHOR ?? 'none'}; settled wait ${SETTLED}`);
  await page.waitForFunction(() => window.turboslide?.studio !== undefined, null, {
    timeout: 30_000,
  });
  if (SETTLED) await page.locator('.pt-viewer[data-settled]').waitFor({ timeout: 30_000 });
  const settle = Number(argAt('--settle') ?? 0);
  if (settle > 0) await page.waitForTimeout(settle);
  console.log(
    `settle ${settle} ms; sync at write time: ${JSON.stringify(await page.evaluate(() => window.turboslide.studio.describe().state.sync ?? null)).slice(0, 140)}`,
  );
  const rev = () => page.evaluate(() => window.turboslide.studio.describe().state.revision);
  const before = await rev();
  console.log(`page revision ${before}; disk ${diskRevision()}`);
  const started = performance.now();
  const r = await fetch(`${BASE}/api/actions/slide.update?deck=${DECK}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-turboslide-author': 'agent:e2e-diag' },
    body: JSON.stringify({
      slideId: 'content-rule',
      baseRevision: before,
      mutations: [
        {
          op: 'block.set',
          slideId: 'content-rule',
          blockId: 'h',
          path: '/text',
          value: 'Written by the agent',
        },
      ],
    }),
  });
  const body = await r.json().catch(() => null);
  console.log(
    `slide.update ${r.status} revision ${body?.revision ?? '-'} in ${Math.round(performance.now() - started)} ms; disk now ${diskRevision()}`,
  );
  let arrived = null;
  while (arrived === null && performance.now() - started < 20_000) {
    await page.waitForTimeout(100);
    const now = await rev();
    if (now !== before) arrived = { ms: Math.round(performance.now() - started), revision: now };
  }
  console.log(
    arrived === null
      ? 'the page revision never changed within 15 s'
      : `the page revision became ${arrived.revision} after ${arrived.ms} ms`,
  );
  const heading = await page.evaluate(async () => {
    const result = await window.turboslide.studio.invoke('slide.get', { slideId: 'content-rule' });
    return result.slide.slots.left.find((b) => b.id === 'h')?.text;
  });
  console.log(`heading read through the window API: ${JSON.stringify(heading)}`);
  const state = await page.evaluate(() => {
    const s = window.turboslide.studio.describe().state;
    return Object.keys(s)
      .filter((k) => /room|realtime|conn|presence|sync/i.test(k))
      .map((k) => `${k}=${JSON.stringify(s[k]).slice(0, 80)}`);
  });
  console.log('room keys:', state.join(' | ') || 'none');
} catch (error) {
  console.log(
    'failed:',
    error instanceof Error ? error.message.split('\n').slice(0, 3).join(' | ') : String(error),
  );
} finally {
  await browser.close();
  rmSync(DIR, { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', DECK), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'thumbs', DECK), { recursive: true, force: true });
}
