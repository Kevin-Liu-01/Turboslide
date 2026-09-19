// Focused third run for the "Present, share and collaborate" audit: version history on an
// owner-only history, the comment flow with every network answer and the snackbar captured right
// after submit, three timed slide propagations from a second browser, and a restore after that
// browser's edit. Same rules as audit-present.mjs; one scratch deck, trashed and deleted forever.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('file:///Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const BASE = 'https://turboslide.vercel.app';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SHOTS = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/focus/audit-present';
const JSON_OUT = path.join(HERE, 'audit-present-focus.json');
mkdirSync(SHOTS, { recursive: true });

const rows = [];
const startedAt = Date.now();
const record = (feature, interaction, result, evidence, extra = {}) => {
  const row = {
    n: rows.length + 1,
    feature,
    interaction,
    result,
    evidence: String(evidence),
    ...extra,
  };
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
      if (r.skip) return record(feature, interaction, 'not driven', r.skip, { tries: t });
      seen.push(`try ${t}: ${r.evidence}`);
      if (r.ok)
        return record(
          feature,
          interaction,
          t === 1 ? 'works' : 'flaky',
          t === 1 ? r.evidence : seen.join(' | '),
          { tries: t },
        );
    } catch (error) {
      seen.push(
        `try ${t}: error ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      );
    }
  }
  return record(feature, interaction, 'broken', seen.join(' | '), { tries });
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
const clickLocator = async (page, loc) => {
  await loc.scrollIntoViewIfNeeded().catch(() => undefined);
  const r = await loc.boundingBox({ timeout: 8000 });
  if (!r) throw new Error('no box');
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const clickControl = (page, control) => clickLocator(page, ctl(page, control).first());
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
const hoverRow = async (page, rowId, waitFor) => {
  const r = await ctl(page, `menu.${rowId}`).boundingBox();
  if (!r) throw new Error(`no menu row ${rowId}`);
  await moveHuman(
    page,
    { x: r.x - 20, y: r.y + r.height / 2 },
    { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    6,
  );
  await sleep(rand(250, 400));
  if (waitFor) await page.locator(waitFor).first().waitFor({ timeout: 6000 });
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
    const clone = el.cloneNode(true);
    clone.querySelectorAll('[data-prompt]').forEach((p) => p.remove());
    const rect = el.getBoundingClientRect();
    return {
      text: clone.textContent ?? '',
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    };
  }, run);
const editing = (page) =>
  page.evaluate(() => Boolean(document.querySelector('.ts-stagewrap.ts-editor[data-editing]')));
const slideOrder = async (page) => {
  const list = await invoke(page, 'slide.list', {});
  const arr = list.slides ?? list.items ?? list;
  return (Array.isArray(arr) ? arr : []).map((s) => s.id ?? s);
};
const headRunOf = async (page) => {
  const all = await runs(page);
  return all.find((r) => /heading/.test(r)) ?? all[0] ?? null;
};
const headingText = async (page) => {
  const head = await headRunOf(page);
  return head ? ((await runInfo(page, head))?.text ?? null) : null;
};
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

const browser = await chromium.launch({ headless: true });
const consoleErrors = { A: [], C: [] };
const responses = [];
const watch = (page, tag) => {
  page.on('pageerror', (e) => consoleErrors[tag].push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors[tag].push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.startsWith(BASE)) return;
    const status = res.status();
    let body = null;
    if (status >= 400 || /comment|version|_server|actions|ops/.test(url)) {
      try {
        const text = await res.text();
        body = text.slice(0, 300);
      } catch {
        body = null;
      }
    }
    responses.push({ tag, at: Date.now(), url: url.replace(BASE, '').slice(0, 160), status, body });
  });
};
const newContext = async (tag) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  watch(page, tag);
  return { context, page };
};
const A = await newContext('A');
const page = A.page;
const shot = async (p, name) =>
  p.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => undefined);
const since = (n, test) =>
  responses
    .slice(n)
    .filter(test)
    .map(
      (r) =>
        `${r.tag} ${r.url} ${r.status}${r.body ? ` ${JSON.stringify(r.body).slice(0, 200)}` : ''}`,
    );
const others = [];

let deckId = '';
let headRun = null;
const TITLE = 'Pipeline review: Acme, Q3 2026';

try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  deckId = (await invoke(page, 'deck.info')).id;
  headRun = await headRunOf(page);
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
    for (let i = 0; i < 2; i += 1) {
      const before = (await slideOrder(page)).length;
      await clearAll(page);
      await press(page, 'Control+M');
      await pollUntil(
        async () => (await slideOrder(page)).length,
        (n) => n > before,
        6000,
      );
      await settled(page);
    }
    await clearAll(page);
    record(
      'Scratch deck',
      'Open /new, type a title, add two slides',
      'works',
      `${deckId}; title "${await headingText(page)}"; slides ${(await slideOrder(page)).length}; revision ${(await state(page)).revision}`,
    );
  }
  const order = await slideOrder(page);

  // ---- version history on an owner only history
  const versionsOpen = async () => {
    await clearAll(page);
    if (await has(page, '[data-control="panel.versionHistory"]')) return 'already open';
    await clickControl(page, 'deck.lastEdit');
    await page.locator('[data-control="panel.versionHistory"]').waitFor({ timeout: 8000 });
    await sleep(600);
    return 'Last edit';
  };
  const versionFacts = () =>
    page.evaluate(() => ({
      windows: [...document.querySelectorAll('[data-control^="versionHistory.window."]')].map(
        (el) => `${el.getAttribute('data-control')}[${el.getAttribute('aria-expanded') ?? '?'}]`,
      ),
      picks: [
        ...document.querySelectorAll('[data-control^="versionHistory."][data-control$=".pick"]'),
      ].map((el) => el.getAttribute('data-control')),
      restores: [
        ...document.querySelectorAll('[data-control^="versionHistory."][data-control$=".restore"]'),
      ].map((el) => el.getAttribute('data-control')),
      selected: [
        ...document.querySelectorAll(
          '[data-control="panel.versionHistory"] [aria-selected="true"], [data-control="panel.versionHistory"] .is-picked, [data-control="panel.versionHistory"] .is-selected',
        ),
      ].map((el) => el.getAttribute('data-control') ?? el.className),
      changes: document.querySelectorAll(
        '[data-control="versions.change"], [data-control="versions.changeRun"]',
      ).length,
      text:
        document
          .querySelector('[data-control="panel.versionHistory"]')
          ?.textContent?.trim()
          .slice(0, 300) ?? '',
    }));
  const expandAll = async () => {
    for (let round = 0; round < 3; round += 1) {
      const f = await versionFacts();
      if (f.picks.length > 0) return;
      const windows = page.locator('[data-control^="versionHistory.window."]');
      const n = await windows.count();
      for (let i = 0; i < n; i += 1)
        await clickLocator(page, windows.nth(i)).catch(() => undefined);
      await sleep(500);
    }
  };
  const snapshot = async () => ({
    title: await headingText(page),
    slides: (await slideOrder(page)).length,
    rev: (await state(page)).revision,
  });
  await attempt('Version history', 'Open Version history and expand the day window', async () => {
    const via = await versionsOpen();
    await expandAll();
    const f = await versionFacts();
    await shot(page, '22-versions-owner-only');
    return {
      ok: f.picks.length >= 1 && f.restores.length >= 1,
      evidence: `opened via ${via}; windows ${f.windows.join(', ')}; picks ${f.picks.length}; restores ${f.restores.length}; text "${f.text.slice(0, 160)}"`,
    };
  });
  await attempt('Version history', 'Pick a version and read Show changes', async () => {
    await versionsOpen();
    await expandAll();
    const f0 = await versionFacts();
    const pick = ctl(page, f0.picks[f0.picks.length - 1]).first();
    await clickLocator(page, pick);
    await sleep(1500);
    const f1 = await versionFacts();
    const showChanges = await page.evaluate(
      () => document.querySelector('[data-control="versionHistory.showChanges"]')?.checked ?? null,
    );
    let marks = f1.changes;
    if (showChanges === false && (await has(page, '[data-control="versionHistory.showChanges"]'))) {
      await clickControl(page, 'versionHistory.showChanges.row').catch(() =>
        clickControl(page, 'versionHistory.showChanges'),
      );
      await sleep(1200);
      marks = (await versionFacts()).changes;
    }
    await shot(page, '23-version-picked');
    return {
      ok: f1.selected.length >= 1,
      evidence: `picked ${f0.picks[f0.picks.length - 1]}; selected ${JSON.stringify(f1.selected)}; Show changes was ${showChanges}; change marks after turning it on ${marks}`,
    };
  });
  await attempt('Version history', 'Name current version', async () => {
    await versionsOpen();
    await clickControl(page, 'versionHistory.nameCurrent');
    await page
      .locator('[data-control="versionHistory.nameCurrent.field"]')
      .waitFor({ timeout: 5000 });
    await typeHuman(page, 'Before the call');
    await press(page, 'Enter');
    const toast = await pollUntil(
      () => snackbar(page),
      (x) => Boolean(x),
      6000,
    );
    await sleep(800);
    const f = await pollUntil(versionFacts, (x) => /Before the call/.test(x.text), 10_000);
    await shot(page, '24-version-named');
    return {
      ok: /Before the call/.test(f.text),
      evidence: `snackbar ${JSON.stringify(toast)}; panel text has "Before the call" ${/Before the call/.test(f.text)}; windows ${f.windows.join(', ')}`,
    };
  });
  const restoreRow = (interaction, which, shotName) =>
    attempt('Version history', interaction, async () => {
      await versionsOpen();
      await expandAll();
      const f = await versionFacts();
      if (f.restores.length === 0)
        return { ok: false, evidence: `no Restore control; windows ${f.windows.join(', ')}` };
      const control =
        which === 'oldest'
          ? f.restores[f.restores.length - 1]
          : f.restores[Math.min(1, f.restores.length - 1)];
      const before = await snapshot();
      const n0 = responses.length;
      await clickLocator(page, ctl(page, control).first());
      const toast = await pollUntil(
        () => snackbar(page),
        (x) => Boolean(x),
        6000,
      );
      const after = await pollUntil(snapshot, (x) => x.rev > before.rev, 12_000);
      await shot(page, shotName);
      const changed = after.title !== before.title || after.slides !== before.slides;
      return {
        ok: after.rev > before.rev && changed,
        evidence: `restore control ${control} of ${f.restores.length}; title "${before.title}" -> "${after.title}"; slides ${before.slides} -> ${after.slides}; revision ${before.rev} -> ${after.rev}; snackbar ${JSON.stringify(toast)}; answers ${JSON.stringify(since(n0, (r) => r.status >= 400))}`,
      };
    });
  const restored = await restoreRow(
    'Restore the previous version (owner only history)',
    'previous',
    '25-restore-owner-only',
  );
  if (restored.result === 'works' || restored.result === 'flaky') {
    await attempt('Version history', 'Cmd+Z undoes the restore', async () => {
      const before = await snapshot();
      await clearAll(page);
      const bar = await rectOf(page, '[data-control="menubar"]');
      if (bar) await clickAt(page, bar.x + bar.w - 30, bar.y + bar.h / 2);
      await press(page, 'Escape');
      await press(page, 'Meta+z');
      const after = await pollUntil(snapshot, (x) => x.rev > before.rev, 10_000);
      return {
        ok:
          after.rev > before.rev &&
          (after.title !== before.title || after.slides !== before.slides),
        evidence: `title "${before.title}" -> "${after.title}"; slides ${before.slides} -> ${after.slides}; revision ${before.rev} -> ${after.rev}`,
      };
    });
  } else
    record(
      'Version history',
      'Cmd+Z undoes the restore',
      'not driven',
      'the restore did not succeed, so there was nothing to undo',
    );
  if (await has(page, '[data-control="panel.versionHistory"]')) {
    await clickControl(page, 'panel.versionHistory.close').catch(() => press(page, 'Escape'));
    await sleep(300);
  }

  // ---- comments, with every answer captured
  const cardFacts = (p) =>
    p.evaluate(() => ({
      card: Boolean(document.querySelector('[data-control="comment.card"]')),
      newField: Boolean(document.querySelector('[data-control="comment.card.new.field"]')),
      fieldValue: document.querySelector('[data-control="comment.card.new.field"]')?.value ?? null,
      submitDisabled:
        document.querySelector('[data-control="comment.card.new.submit"]')?.disabled ?? null,
      first:
        document
          .querySelector('[data-control="comment.card.first"]')
          ?.textContent?.trim()
          .slice(0, 80) ?? '',
      replies: document.querySelectorAll('[data-control^="comment.card.reply."]').length,
      resolveLabel:
        document
          .querySelector('[data-control="comment.card.resolve"]')
          ?.getAttribute('aria-label') ?? null,
      markers: document.querySelectorAll('[data-control="comment.marker"]').length,
      filmstripMarks: document.querySelectorAll('[data-control^="filmstrip.comments."]').length,
    }));
  const panelFacts = () =>
    page.evaluate(() => ({
      threads: document.querySelectorAll('[data-control^="panel.comments.thread."]').length,
      text:
        document
          .querySelector('[data-control="panel.comments.list"]')
          ?.textContent?.trim()
          .slice(0, 200) ?? '',
    }));
  const openCommentsPanel = async () => {
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
  const addComment = async (open) => {
    await clearAll(page);
    await invoke(page, 'view.goto', { slideId: order[0] });
    await sleep(400);
    const r = (await runInfo(page, headRun))?.rect;
    await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
    if (await editing(page)) await press(page, 'Escape');
    await sleep(200);
    const chip = await textOf(page, '.ts-overlay .ts-select-chip');
    await open();
    let f = await pollUntil(
      () => cardFacts(page),
      (x) => x.newField,
      5000,
    );
    if (!f.newField)
      return {
        ok: false,
        evidence: `chip "${chip}"; no comment card; snackbar ${JSON.stringify(await snackbar(page))}`,
      };
    await clickControl(page, 'comment.card.new.field');
    await typeHuman(page, 'Swap the logo before the call');
    await sleep(300);
    const typed = await cardFacts(page);
    const n0 = responses.length;
    await clickControl(page, 'comment.card.new.submit');
    const toast = await pollUntil(
      () => snackbar(page),
      (x) => Boolean(x),
      6000,
    );
    const after = await pollUntil(
      () => cardFacts(page),
      (x) => x.markers >= 1,
      30_000,
    );
    await settled(page);
    await openCommentsPanel();
    const panel = await panelFacts();
    await shot(page, '26-comment-after-submit');
    await closePanel();
    commented = after.markers >= 1 || panel.threads >= 1;
    const answers = since(
      n0,
      (r) => r.status >= 400 || /comment/.test(r.url) || /_server|actions|ops/.test(r.url),
    );
    return {
      ok: after.markers >= 1 && panel.threads >= 1,
      evidence: `chip "${chip}"; field value "${typed.fieldValue}", submit disabled ${typed.submitDisabled}; snackbar within 6 s ${JSON.stringify(toast)}; markers after 30 s ${after.markers}; panel threads ${panel.threads}, list "${panel.text.slice(0, 100)}"; answers since submit ${JSON.stringify(answers.slice(0, 8))}`,
    };
  };
  await attempt('Comments', 'Select the title block, Cmd+Option+M, type, Comment', () =>
    addComment(() => press(page, 'Meta+Alt+m')),
  );
  if (!commented)
    await attempt('Comments', 'Select the title block, toolbar Insert comment, type, Comment', () =>
      addComment(() => clickControl(page, 'toolbar.insertComment')),
    );
  if (!commented)
    await attempt('Comments', 'Select the title block, Insert > Comment, type, Comment', () =>
      addComment(async () => {
        await openMenu(page, 'insert');
        await clickRow(page, 'insert.comment');
      }),
    );
  await attempt('Comments', 'Open the thread from its marker and reply', async () => {
    if (!commented) return { skip: 'no comment was created' };
    await clearAll(page);
    const m = await rectOf(page, '[data-control="comment.marker"]');
    if (!m) return { ok: false, evidence: 'no marker' };
    await clickAt(page, m.x + m.w / 2, m.y + m.h / 2);
    let f = await pollUntil(
      () => cardFacts(page),
      (x) => x.card && x.first !== '',
      6000,
    );
    if (!(await has(page, '[data-control="comment.card.reply"]')))
      return { ok: false, evidence: `card ${f.card}; first "${f.first}"; no Reply control` };
    await clickControl(page, 'comment.card.reply');
    await page.locator('[data-control="comment.card.replyBox.field"]').waitFor({ timeout: 5000 });
    await typeHuman(page, 'Done, the new logo is on slide 2');
    await clickControl(page, 'comment.card.replyBox.submit');
    f = await pollUntil(
      () => cardFacts(page),
      (x) => x.replies >= 1,
      15_000,
    );
    await shot(page, '27-comment-reply');
    return { ok: f.replies >= 1, evidence: `first "${f.first}"; replies ${f.replies}` };
  });
  await attempt('Comments', 'Resolve the thread', async () => {
    if (!commented) return { skip: 'no comment was created' };
    let f = await cardFacts(page);
    if (!f.card) {
      const m = await rectOf(page, '[data-control="comment.marker"]');
      if (!m) return { ok: false, evidence: 'no marker and no card' };
      await clickAt(page, m.x + m.w / 2, m.y + m.h / 2);
      f = await pollUntil(
        () => cardFacts(page),
        (x) => x.card,
        6000,
      );
    }
    const label = f.resolveLabel;
    await clickControl(page, 'comment.card.resolve');
    await sleep(1500);
    const after = await cardFacts(page);
    await clearAll(page);
    await openCommentsPanel();
    const panel = await panelFacts();
    await shot(page, '28-comment-resolved');
    await closePanel();
    return {
      ok: label !== null && after.markers === 0,
      evidence: `resolve button "${label}"; markers after ${after.markers}; panel threads ${panel.threads}, list "${panel.text.slice(0, 120)}"`,
    };
  });

  // ---- a second browser on the Edit link: three timed slide propagations, then a restore
  const C = await newContext('C');
  others.push(C);
  await C.page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  await editorReady(C.page);
  {
    const lat = [];
    for (let i = 1; i <= 3; i += 1) {
      const before = (await slideOrder(page)).length;
      const beforeC = (await slideOrder(C.page)).length;
      await clearAll(C.page);
      await press(C.page, 'Control+M');
      const t0 = Date.now();
      const ownC = await pollUntil(
        async () => (await slideOrder(C.page)).length,
        (n) => n > beforeC,
        6000,
      );
      await answerNamePrompt(C.page, 'Editor tab');
      const after = await pollUntil(
        async () => (await slideOrder(page)).length,
        (n) => n > before,
        45_000,
      );
      const ms = Date.now() - t0;
      lat.push({
        i,
        ownC: `${beforeC} -> ${ownC}`,
        owner: `${before} -> ${after}`,
        ms: after > before ? ms : `not within ${ms}`,
      });
      await sleep(1500);
    }
    const okAll = lat.every((l) => typeof l.ms === 'number' && l.ms <= 10_000);
    const anyLate = lat.some((l) => typeof l.ms !== 'number' || l.ms > 10_000);
    record(
      'Collaboration',
      'Three slides added in the second browser (Ctrl+M), each timed until the owner filmstrip shows it',
      okAll ? 'works' : anyLate && lat.some((l) => typeof l.ms === 'number') ? 'flaky' : 'broken',
      JSON.stringify(lat),
    );
  }
  await attempt(
    'Collaboration',
    'The second browser types into the title; timed until the owner sees it',
    async (t) => {
      const head = await headRunOf(C.page);
      const r = head ? (await runInfo(C.page, head))?.rect : null;
      if (!r) return { ok: false, evidence: 'no heading run in C' };
      await dblclickAt(C.page, r.x + r.w / 2, r.y + r.h / 2);
      await C.page.keyboard.press('End');
      await typeHuman(C.page, ` +C${t}`);
      await press(C.page, 'Escape');
      const t0 = Date.now();
      const seen = await pollUntil(
        () => headingText(page),
        (x) => (x ?? '').includes(`+C${t}`),
        45_000,
      );
      return {
        ok: (seen ?? '').includes(`+C${t}`),
        evidence: `owner title "${seen}" after ${Date.now() - t0} ms`,
      };
    },
  );
  await restoreRow(
    'Restore the oldest version after the second browser edited',
    'oldest',
    '29-restore-after-collab',
  );
  await restoreRow(
    'Restore the previous version after the second browser edited',
    'previous',
    '29b-restore-previous-after-collab',
  );
} catch (error) {
  record(
    'The focused run ran to completion',
    'no exception outside a step',
    'broken',
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
} finally {
  for (const o of others.splice(0)) await o.context.close().catch(() => undefined);
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
  const summary = {
    base: BASE,
    deckId,
    startedAt: new Date(startedAt).toISOString(),
    ms: Date.now() - startedAt,
    rows,
    consoleErrors,
    responses: responses
      .filter((r) => r.status >= 400 || /comment|version/.test(r.url))
      .slice(0, 80),
  };
  writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.result]: (acc[r.result] ?? 0) + 1 }), {});
  console.log(
    `\naudit-present-focus: ${rows.length} rows ${JSON.stringify(counts)}, ${Math.round(summary.ms / 1000)} s, deck ${deckId}; table ${JSON_OUT}`,
  );
}
