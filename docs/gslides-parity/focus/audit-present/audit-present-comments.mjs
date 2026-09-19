// Last short probe: a comment with nothing selected (the slide as the anchor) and a comment on a
// canvas text box, then reply and resolve when a thread exists. Same rules; one scratch deck,
// trashed and deleted forever in the finally block.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('file:///Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const BASE = 'https://turboslide.vercel.app';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SHOTS = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/focus/audit-present';
const JSON_OUT = path.join(HERE, 'audit-present-comments.json');
mkdirSync(SHOTS, { recursive: true });

const rows = [];
const record = (feature, interaction, result, evidence) => {
  const row = { n: rows.length + 1, feature, interaction, result, evidence: String(evidence) };
  rows.push(row);
  const tag =
    { works: 'ok  ', broken: 'FAIL', flaky: 'FLKY', 'not driven': 'n/d ' }[result] ?? '????';
  console.log(
    `${tag} ${String(row.n).padStart(2)} ${feature} :: ${interaction}\n       ${row.evidence}`,
  );
  return row;
};
const attempt = async (feature, interaction, fn, { tries = 3 } = {}) => {
  const seen = [];
  for (let t = 1; t <= tries; t += 1) {
    try {
      const r = await fn(t);
      if (r.skip) return record(feature, interaction, 'not driven', r.skip);
      seen.push(`try ${t}: ${r.evidence}`);
      if (r.ok)
        return record(
          feature,
          interaction,
          t === 1 ? 'works' : 'flaky',
          t === 1 ? r.evidence : seen.join(' | '),
        );
    } catch (error) {
      seen.push(
        `try ${t}: error ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      );
    }
  }
  return record(feature, interaction, 'broken', seen.join(' | '));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const typeHuman = async (page, text) => {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(rand(40, 90));
  }
};
const press = async (page, key, times = 1) => {
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press(key);
    await sleep(rand(50, 90));
  }
};
const moveHuman = async (page, from, to, steps = 12) => {
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    await sleep(rand(14, 26));
  }
};
const clickAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.click(x, y);
  await sleep(rand(120, 220));
};
const dblclickAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.dblclick(x, y);
  await sleep(rand(160, 260));
};
const invoke = (page, action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const editorReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const settled = async (page, timeout = 20_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state(page).catch(() => ({}));
    if ((s.sync?.pending ?? s.pending ?? 0) === 0) return s;
    if (Date.now() > until) return s;
    await sleep(150);
  }
};
const pollUntil = async (read, test, timeout = 15_000, every = 150) => {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await read();
    if (test(v)) return v;
    if (Date.now() > until) return v;
    await sleep(every);
  }
};
const has = (page, selector) =>
  page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);
const ctl = (page, control) => page.locator(`[data-control="${control}"]`);
const clickControl = async (page, control) => {
  const loc = ctl(page, control).first();
  await loc.scrollIntoViewIfNeeded().catch(() => undefined);
  const r = await loc.boundingBox({ timeout: 8000 });
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const rectOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, selector);
const textOf = (page, selector) =>
  page.evaluate((sel) => document.querySelector(sel)?.textContent?.trim() ?? null, selector);
const openMenu = async (page, id) => {
  const r = await ctl(page, `menubar.${id}`).boundingBox();
  if (!r) throw new Error(`no menubar button ${id}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
  await page.locator(`#ts-menu-${id}`).waitFor({ timeout: 8000 });
  await sleep(rand(150, 300));
};
const clickRow = (page, rowId) => clickControl(page, `menu.${rowId}`);
const clearAll = async (page) => {
  await press(page, 'Escape', 3);
  await sleep(200);
};
const runs = (page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]'),
    ].map((el) => el.getAttribute('data-run')),
  );
const runInfo = (page, run) =>
  page.evaluate((r) => {
    const el = document.querySelector(
      `.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${r}"]`,
    );
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      text: el.textContent ?? '',
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    };
  }, run);
const editing = (page) =>
  page.evaluate(() => Boolean(document.querySelector('.ts-stagewrap.ts-editor[data-editing]')));
const snackbar = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('.ts-snackbar, .pt-toast, [role="status"]')]
        .map((el) => el.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' | ') || null,
  );
const answerNamePrompt = async (page, name) => {
  if (!(await has(page, '[data-control="dialog.namePrompt"]'))) return false;
  await clickControl(page, 'dialog.namePrompt.name');
  await typeHuman(page, name);
  await press(page, 'Enter');
  await sleep(500);
  if (await has(page, '[data-control="dialog.namePrompt"]'))
    await clickControl(page, 'dialog.namePrompt.continue').catch(() => undefined);
  await sleep(300);
  return true;
};
const objectsOf = async (page, slideId) => {
  const slide = await invoke(page, 'slide.get', { slideId }).then((g) => g.slide ?? g);
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      if (
        typeof node.id === 'string' &&
        typeof node.type === 'string' &&
        node.pos &&
        typeof node.pos === 'object'
      )
        out.push({ id: node.id, type: node.type });
      for (const v of Object.values(node)) walk(v);
    }
  };
  walk(slide);
  return out;
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
});
const shot = (name) =>
  page.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => undefined);

let deckId = '';
const TITLE = 'Pipeline review: Acme, Q3 2026';
const cardFacts = () =>
  page.evaluate(() => ({
    card: Boolean(document.querySelector('[data-control="comment.card"]')),
    newField: Boolean(document.querySelector('[data-control="comment.card.new.field"]')),
    first:
      document
        .querySelector('[data-control="comment.card.first"]')
        ?.textContent?.trim()
        .slice(0, 80) ?? '',
    replies: document.querySelectorAll('[data-control^="comment.card.reply."]').length,
    resolveLabel:
      document.querySelector('[data-control="comment.card.resolve"]')?.getAttribute('aria-label') ??
      null,
    markers: document.querySelectorAll('[data-control="comment.marker"]').length,
  }));
const panelFacts = () =>
  page.evaluate(() => ({
    threads: document.querySelectorAll('[data-control^="panel.comments.thread."]').length,
    reopen: document.querySelectorAll('[data-control^="panel.comments.reopen."]').length,
    text:
      document
        .querySelector('[data-control="panel.comments.list"]')
        ?.textContent?.trim()
        .slice(0, 200) ?? '',
  }));
const openPanel = async () => {
  if (await has(page, '[data-control="panel.comments"]')) return;
  await clickControl(page, 'title.comments');
  await page.locator('[data-control="panel.comments"]').waitFor({ timeout: 8000 });
  await sleep(500);
};
const closePanel = async () => {
  if (await has(page, '[data-control="panel.comments"]')) {
    await clickControl(page, 'panel.comments.close').catch(() => press(page, 'Escape'));
    await sleep(300);
  }
};
let commented = false;
const submitComment = async (label) => {
  const f = await pollUntil(cardFacts, (x) => x.newField, 5000);
  if (!f.newField)
    return {
      ok: false,
      evidence: `${label}; no comment card; snackbar ${JSON.stringify(await snackbar(page))}`,
    };
  await clickControl(page, 'comment.card.new.field');
  await typeHuman(page, 'Swap the logo before the call');
  await sleep(300);
  await clickControl(page, 'comment.card.new.submit');
  const toast = await pollUntil(
    () => snackbar(page),
    (x) => Boolean(x),
    6000,
  );
  const after = await pollUntil(cardFacts, (x) => x.markers >= 1, 20_000);
  await settled(page);
  await openPanel();
  const panel = await panelFacts();
  await closePanel();
  commented = commented || after.markers >= 1 || panel.threads >= 1;
  return {
    ok: after.markers >= 1 && panel.threads >= 1,
    evidence: `${label}; snackbar within 6 s ${JSON.stringify(toast)}; markers after 20 s ${after.markers}; panel threads ${panel.threads}, list "${panel.text.slice(0, 100)}"`,
  };
};

try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  deckId = (await invoke(page, 'deck.info')).id;
  const all = await runs(page);
  const headRun = all.find((r) => /heading/.test(r)) ?? all[0];
  const slideId = (await state(page)).slideId;
  {
    const r = (await runInfo(page, headRun)).rect;
    await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
    await typeHuman(page, TITLE);
    await press(page, 'Escape');
    await pollUntil(
      () => state(page),
      (s) => s.revision >= 1,
      30_000,
    );
    await settled(page);
    await answerNamePrompt(page, 'Owner tab');
    record(
      'Scratch deck',
      'Open /new, type a title',
      'works',
      `${deckId}; revision ${(await state(page)).revision}`,
    );
  }
  await attempt(
    'Comments',
    'Nothing selected, Cmd+Option+M, type, Comment (the slide as the anchor)',
    async () => {
      await clearAll(page);
      const chip = await textOf(page, '.ts-overlay .ts-select-chip');
      await press(page, 'Meta+Alt+m');
      const r = await submitComment(`chip ${JSON.stringify(chip)}`);
      await shot('30-comment-on-slide');
      return r;
    },
  );
  await attempt(
    'Comments',
    'Insert a text box, select it, Cmd+Option+M, type, Comment',
    async () => {
      await clearAll(page);
      const before = (await objectsOf(page, slideId)).map((o) => o.id);
      await openMenu(page, 'insert');
      await clickRow(page, 'insert.textBox');
      await sleep(400);
      const sheet = await rectOf(page, '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
      const k = sheet.w / 1600;
      await clickAt(page, sheet.x + 1000 * k, sheet.y + 700 * k);
      const obj = await pollUntil(
        async () => (await objectsOf(page, slideId)).find((o) => !before.includes(o.id)) ?? null,
        (o) => o !== null,
        15_000,
      );
      if (!obj) return { ok: false, evidence: 'no text box object within 15 s' };
      if (await editing(page)) {
        await typeHuman(page, 'Logo goes here');
        await sleep(300);
      }
      await press(page, 'Escape');
      await settled(page);
      await sleep(400);
      // select the box with one click
      const box = await rectOf(
        page,
        `.ts-stagewrap.ts-editor .pt-slide [data-block="${obj.id}"], .ts-stagewrap.ts-editor .pt-slide [data-run^="${obj.id}"]`,
      );
      if (box) await clickAt(page, box.x + box.w / 2, box.y + box.h / 2);
      if (await editing(page)) await press(page, 'Escape');
      await sleep(200);
      const chip = await textOf(page, '.ts-overlay .ts-select-chip');
      await press(page, 'Meta+Alt+m');
      const r = await submitComment(
        `text box ${obj.id} (${obj.type}); chip ${JSON.stringify(chip)}`,
      );
      await shot('31-comment-on-text-box');
      return r;
    },
  );
  await attempt('Comments', 'Open the thread from its marker and reply', async () => {
    if (!commented) return { skip: 'no comment was created in the rows above' };
    await clearAll(page);
    const m = await rectOf(page, '[data-control="comment.marker"]');
    if (!m) return { ok: false, evidence: 'no marker' };
    await clickAt(page, m.x + m.w / 2, m.y + m.h / 2);
    let f = await pollUntil(cardFacts, (x) => x.card && x.first !== '', 6000);
    if (!(await has(page, '[data-control="comment.card.reply"]')))
      return { ok: false, evidence: `card ${f.card}; first "${f.first}"; no Reply control` };
    await clickControl(page, 'comment.card.reply');
    await page.locator('[data-control="comment.card.replyBox.field"]').waitFor({ timeout: 5000 });
    await typeHuman(page, 'Done, the new logo is on slide 2');
    await clickControl(page, 'comment.card.replyBox.submit');
    f = await pollUntil(cardFacts, (x) => x.replies >= 1, 15_000);
    await shot('32-comment-reply');
    return {
      ok: f.replies >= 1,
      evidence: `first "${f.first}"; replies ${f.replies}; snackbar ${JSON.stringify(await snackbar(page))}`,
    };
  });
  await attempt('Comments', 'Resolve the thread', async () => {
    if (!commented) return { skip: 'no comment was created in the rows above' };
    let f = await cardFacts();
    if (!f.card) {
      const m = await rectOf(page, '[data-control="comment.marker"]');
      if (!m) return { ok: false, evidence: 'no marker and no card' };
      await clickAt(page, m.x + m.w / 2, m.y + m.h / 2);
      f = await pollUntil(cardFacts, (x) => x.card, 6000);
    }
    const label = f.resolveLabel;
    const markersBefore = f.markers;
    await clickControl(page, 'comment.card.resolve');
    await sleep(1500);
    const after = await cardFacts();
    await clearAll(page);
    await openPanel();
    const panel = await panelFacts();
    await shot('33-comment-resolved');
    await closePanel();
    return {
      ok: label !== null && after.markers < markersBefore,
      evidence: `resolve button "${label}"; markers ${markersBefore} -> ${after.markers}; panel threads ${panel.threads}, reopen buttons ${panel.reopen}, list "${panel.text.slice(0, 120)}"`,
    };
  });
} catch (error) {
  record(
    'The comments probe ran to completion',
    'no exception outside a step',
    'broken',
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
} finally {
  if (deckId) {
    let trashed = false;
    try {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady(page);
      await pollUntil(
        () => state(page),
        (s) => s.sync?.connected === true,
        30_000,
      );
      await settled(page);
      await clearAll(page);
      await openMenu(page, 'file');
      await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
      await clickRow(page, 'file.moveToTrash');
      await page.waitForURL(/\/decks$/, { timeout: 20_000 });
      record('Teardown', 'File > Move to trash', 'works', page.url().replace(BASE, ''));
      await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
      const card = page.locator(`[data-control="trash.card.${deckId}"]`);
      await card.waitFor({ timeout: 30_000 });
      await clickControl(page, `trash.delete.${deckId}`);
      await clickControl(page, 'trash.confirm.ok');
      await card.waitFor({ state: 'detached', timeout: 30_000 });
      record('Teardown', 'Delete forever on /decks/trash', 'works', `${deckId} left the trash`);
      trashed = true;
    } catch (error) {
      record(
        'Teardown',
        'File > Move to trash, Delete forever',
        'broken',
        `failed: ${error instanceof Error ? error.message : String(error)}; falling back to the actions API`,
      );
    }
    if (!trashed) {
      try {
        await page
          .goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' })
          .catch(() => undefined);
        await editorReady(page).catch(() => undefined);
        const info = await invoke(page, 'deck.info').catch(() => null);
        if (info) {
          await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(
            () => undefined,
          );
          const t = await invoke(page, 'deck.info').catch(() => null);
          await invoke(page, 'deck.remove', {
            id: deckId,
            baseRevision: t?.revision ?? info.revision,
            confirm: true,
          }).catch(() => undefined);
        }
      } catch {
        // the 404 probe below tells the truth
      }
    }
    let status = 0;
    const until = Date.now() + 20_000;
    for (;;) {
      const res = await page.request
        .get(`${BASE}/edit/${deckId}`, { maxRedirects: 0 })
        .catch(() => null);
      status = res?.status() ?? 0;
      if (status === 404 || Date.now() > until) break;
      await sleep(2000);
    }
    record(
      'Teardown',
      `GET /edit/${deckId} after the delete`,
      status === 404 ? 'works' : 'broken',
      `status ${status}`,
    );
  }
  await browser.close().catch(() => undefined);
  writeFileSync(JSON_OUT, JSON.stringify({ deckId, rows, consoleErrors }, null, 2));
  console.log(`\naudit-present-comments: ${rows.length} rows, deck ${deckId}`);
}
