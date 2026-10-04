// R3 fix round 3: the snackbar Undo after deleting two selected slides, driven many times on one
// scratch deck with the controller and the room client traced (VERIFICATION.md "Realtime round,
// pass 3" P3-1, `slides.delete.two-selected-key-undo`). vite dev serves the source, so the routes
// below add trace calls to the served modules (nothing in the tree is edited): the history's
// push, undo, redo and clear, every snackbar sentence, each undo step's inverse, the room client's
// entries, resyncs, checkpoint frames and ops answers. A row that does not come back to its count
// prints the trace from the Delete on.
//   node snack-undo.mjs --base http://localhost:4473 [--iters 20] [--throttle 4] [--prelude]
//     [--settle-ms 0] [--no-trace]
import { createRequire } from 'node:module';

const require = createRequire('/Users/kevinliu/repos/Turboslide-realtime/package.json');
const { chromium } = require('playwright-core');
const argv = process.argv.slice(2);
const arg = (n, f) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : f;
};
const flag = (n) => argv.includes(`--${n}`);
const BASE = arg('base', 'http://localhost:4473');
const ITERS = Number(arg('iters', '20'));
const THROTTLE = Number(arg('throttle', '1'));
const SETTLE_MS = Number(arg('settle-ms', '0'));
/* how long the trace is read past the row's end, so a sentence said seconds late is placed too */
const TAIL_MS = Number(arg('tail-ms', '0'));
const PRELUDE = flag('prelude');
const TRACE = !flag('no-trace');
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
const hook = (body, pattern, replacement, name) => {
  const next = body.replace(pattern, replacement);
  if (next === body) console.log(`hook NOT installed: ${name}`);
  return next;
};
if (TRACE) {
  await ctx.route(/\/src\/editor\/controller\.tsx/, async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    body = hook(
      body,
      /(const history = createEditHistory\(\);)/,
      '$1 window.__h = history; for (const k of ["push","undo","redo","clear"]) { const f = history[k]; history[k] = (...a) => { const r = f(...a); window.__T?.("history." + k, { id: r?.id ?? null, label: r?.label ?? a[0]?.label ?? null, depth: history.entries().length, inv: (r?.inverse ?? a[0]?.inverse ?? []).map((m) => m.op + ":" + (m.slideId ?? "") + ":" + (m.after ?? "")).slice(0, 4) }); return r; }; }',
      'history',
    );
    body = hook(
      body,
      /shell\?\.say\(message\);/,
      'window.__T?.("say", message); shell?.say(message);',
      'say',
    );
    body = hook(
      body,
      /(const inverse = stepMutations\(entry, entry\.inverse, "inverse"\);)/,
      '$1 window.__T?.("undo.step", { id: entry.id, label: entry.label, inverse: inverse.map((m) => m.op + ":" + (m.slideId ?? "") + ":" + (m.after ?? "")).slice(0, 4), serverRevision: latest().serverRevision });',
      'undo.step',
    );
    body = hook(
      body,
      /(await undoStep\(entry, inverse\);)/,
      '$1 window.__T?.("undo.answered", { id: entry.id, serverRevision: latest().serverRevision });',
      'undo.answered',
    );
    await route.fulfill({ response, body });
  });
  await ctx.route(/\/realtime\/client\/room-client\.ts/, async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    body = hook(
      body,
      /const applyEntry = \(entry\) => \{/,
      'const applyEntry = (entry) => { window.__T?.("entry", { seq: entry.seq, rev: entry.rev, opId: entry.opId, client: entry.clientId, mine: myClientIds.has(entry.clientId), ops: (entry.mutations ?? []).map((m) => m.op + ":" + (m.slideId ?? "")).slice(0, 4), pending: pending.map((op) => op.opId + (op.inflight ? "*" : "")) });',
      'applyEntry',
    );
    body = hook(
      body,
      /const scheduleResync = \(at\) => \{/,
      'const scheduleResync = (at) => { window.__T?.("scheduleResync", { at });',
      'scheduleResync',
    );
    body = hook(
      body,
      /const resync = async \(at\) => \{/,
      'const resync = async (at) => { window.__T?.("resync", { at, seq, revision });',
      'resync',
    );
    body = hook(
      body,
      /case "checkpoint": \{/,
      'case "checkpoint": { window.__T?.("checkpoint", { toSeq: event.toSeq, revision: event.revision, external: event.external ?? false });',
      'checkpoint',
    );
    body = hook(
      body,
      /(response = await transport\.postOps\(body\);)/,
      '$1 window.__T?.("ops.answer", { base: body.base, sent: body.entries.map((e) => e.opId), ok: response.ok, status: response.status, code: response.code, entries: (response.entries ?? []).map((e) => e.seq + ":" + e.opId), between: (response.between ?? []).length, rejected: response.rejected ?? null, revision: response.revision });',
      'ops.answer',
    );
    await route.fulfill({ response, body });
  });
  await ctx.route(/\/chrome\/src\/Snackbar\.tsx/, async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    body = hook(
      body,
      /const show = useCallback\(\(text, action\) => \{/,
      'const show = useCallback((text, action) => { window.__T?.("snackbar.show", { text, action: action?.label ?? null });',
      'snackbar.show',
    );
    await route.fulfill({ response, body });
  });
}
/* --baseline serves the controller's answer rule as it stood before R3 fix round 3 (every write
   answered at its acknowledgement), so the same probe reads both builds on one server */
if (flag('baseline')) {
  await ctx.route(/\/src\/editor\/commit-answer\.ts/, async (route) => {
    const response = await route.fetch();
    const body = hook(
      await response.text(),
      /answer: \(\) => depth > 0 \? "admitted" : "acknowledged"/,
      'answer: () => "acknowledged"',
      'baseline',
    );
    await route.fulfill({ response, body });
  });
}
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('[Server]'))
    console.log('console', m.type(), m.text().slice(0, 300));
});
page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)));
await page.addInitScript(() => {
  window.__trace = [];
  window.__T = (kind, data) => {
    window.__trace.push({ t: Math.round(performance.now()), kind, data });
    if (window.__trace.length > 6000) window.__trace.splice(0, 1000);
  };
});
if (THROTTLE > 1) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
}
const invoke = (a, i) =>
  page.evaluate(([x, y]) => window.turboslide.studio.invoke(x, y ?? {}), [a, i]);
const state = () => page.evaluate(() => window.turboslide.studio.describe().state);
const order = async () => {
  const list = await invoke('slide.list', {});
  const arr = list.slides ?? list.items ?? list;
  return (Array.isArray(arr) ? arr : []).map((s) => s.id ?? s);
};
const pollUntil = async (read, test, timeout = 15_000, every = 120) => {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await read();
    if (test(v)) return v;
    if (Date.now() > until) return v;
    await sleep(every);
  }
};
const settled = async (timeout = 20_000) =>
  pollUntil(state, (s) => (s.sync?.pending ?? s.pending ?? 0) === 0, timeout, 150);
const ctl = (c) => page.locator(`[data-control="${c}"]`).first();
const clickAt = async (x, y) => {
  await page.mouse.move(x - 20, y - 12);
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.click(x, y);
};
const centerOf = async (c) => {
  const el = ctl(c);
  await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
  const r = await el.boundingBox();
  if (!r) throw new Error(`no control ${c}`);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
const clickControl = async (c) => {
  const p = await centerOf(c);
  await clickAt(p.x, p.y);
};
const menu = async (bar, row) => {
  await clickControl(`menubar.${bar}`);
  await ctl(`menu.${row}`).waitFor({ timeout: 8000 });
  await sleep(rand(150, 300));
  await clickControl(`menu.${row}`);
};
let deckId = null;
const results = [];
try {
  await page.goto('/new');
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 120_000 });
  await page
    .locator('.pt-viewer:not(.ts-skeleton)[data-settled]')
    .first()
    .waitFor({ timeout: 90_000 });
  const run = await page.evaluate(() =>
    document
      .querySelector('.ts-stagewrap.ts-editor .pt-slide [data-run]')
      ?.getAttribute('data-run'),
  );
  await page.locator(`.ts-stagewrap.ts-editor [data-run="${run}"]`).first().dblclick();
  await sleep(150);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('Snackbar undo probe', { delay: 40 });
  await page.keyboard.press('Escape');
  await page.waitForURL(/\/edit\//, { timeout: 60_000 });
  deckId = (await invoke('deck.info')).id;
  console.log(
    'deck',
    deckId,
    'throttle',
    THROTTLE,
    'prelude',
    PRELUDE,
    'baseline',
    flag('baseline'),
  );
  await settled();
  for (let i = 0; i < 12; i += 1) {
    const ids = await order();
    const st = await settled();
    await invoke('slide.duplicate', { slideIds: [ids[0]], baseRevision: st.revision });
    await pollUntil(order, (o) => o.length === ids.length + 1, 15_000);
  }
  await settled();
  console.log('slides', (await order()).length);
  const COUNT = (await order()).length;
  const topUp = async () => {
    for (let guard = 0; guard < 6; guard += 1) {
      const now = await order();
      if (now.length >= COUNT) return;
      const st = await settled();
      await invoke('slide.duplicate', { slideIds: [now[0]], baseRevision: st.revision }).catch(
        () => undefined,
      );
      await pollUntil(order, (o) => o.length === now.length + 1, 15_000);
    }
  };
  const snackText = () =>
    page.evaluate(
      () =>
        document.querySelector('[data-control="snackbar"] .ts-snackbar-text')?.textContent ?? null,
    );
  for (let n = 1; n <= ITERS; n += 1) {
    await topUp();
    await settled();
    const mark = await page.evaluate(() => window.__trace.length);
    let preMs = null;
    if (PRELUDE) {
      /* the walk's row before (slides.delete.menu-undo-redo) as the walk drives it: Slide >
         Delete slide on the last card, the toolbar Undo, Edit > Redo, and the next row at once */
      const t0 = Date.now();
      const pre = await order();
      await clickControl(`filmstrip.slide.${pre[pre.length - 1]}`);
      await sleep(300);
      await page.evaluate(() => window.__T?.('probe', 'menu delete'));
      await menu('slide', 'slide.deleteSlide');
      await pollUntil(order, (o) => o.length === pre.length - 1, 20_000);
      await settled();
      await page.evaluate(() => window.__T?.('probe', 'toolbar undo'));
      await clickControl('toolbar.undo');
      await pollUntil(order, (o) => o.length === pre.length, 20_000);
      await settled();
      await page.evaluate(() => window.__T?.('probe', 'edit redo'));
      await menu('edit', 'edit.redo');
      await pollUntil(order, (o) => o.length === pre.length - 1, 20_000);
      preMs = Date.now() - t0;
    }
    if (SETTLE_MS > 0) await sleep(SETTLE_MS);
    const before = await order();
    await page.keyboard.press('Escape');
    await clickControl(`filmstrip.slide.${before[1]}`);
    await sleep(rand(200, 320));
    const b = await centerOf(`filmstrip.slide.${before[2]}`);
    await page.mouse.move(b.x - 40, b.y - 25);
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.keyboard.down('Shift');
    await page.mouse.click(b.x, b.y);
    await page.keyboard.up('Shift');
    await sleep(rand(200, 320));
    await page.evaluate(() => window.__T?.('probe', 'Delete key'));
    await page.keyboard.press('Delete');
    const gone = await pollUntil(order, (o) => o.length === before.length - 2, 20_000);
    await ctl('snackbar.action').waitFor({ timeout: 5000 });
    const clicked = await snackText();
    await page.evaluate((c) => window.__T?.('probe', `click snackbar action: ${c}`), clicked);
    await clickControl('snackbar.action');
    const back = await pollUntil(order, (o) => o.length === before.length, 12_000);
    await settled();
    const ok = gone.length === before.length - 2 && back.length === before.length;
    /* the snackbar sentences said from the Delete on, and where the prelude's "Slide deleted"
       landed: after the prelude's Undo (late) or before it (at its admission) */
    if (TAIL_MS > 0) await sleep(TAIL_MS);
    const said = await page.evaluate((m) => window.__trace.slice(m), mark);
    const at = (label) => said.find((e) => e.kind === 'probe' && e.data === label)?.t ?? null;
    const deleteAt = at('Delete key');
    const undoAt = at('toolbar undo');
    const slideDeleted = said.filter(
      (e) => e.kind === 'snackbar.show' && e.data?.text === 'Slide deleted',
    );
    const row = {
      n,
      ok,
      counts: `${before.length} -> ${gone.length} -> ${back.length}`,
      clicked,
      preMs,
      slideDeletedSaid: slideDeleted.map((e) =>
        deleteAt !== null && e.t > deleteAt
          ? `after the Delete key +${e.t - deleteAt} ms`
          : undoAt !== null && e.t > undoAt
            ? 'after the prelude Undo'
            : 'before the prelude Undo',
      ),
    };
    results.push(row);
    console.log(JSON.stringify(row));
    if (!ok || flag('dump')) {
      const trace = await page.evaluate((m) => window.__trace.slice(m), mark);
      for (const t of trace) console.log('  ', JSON.stringify(t).slice(0, 600));
    }
  }
} catch (error) {
  console.log('error', String(error?.stack ?? error).slice(0, 1500));
} finally {
  const failed = results.filter((r) => !r.ok).length;
  console.log(
    'summary',
    JSON.stringify({
      iterations: results.length,
      failed,
      throttle: THROTTLE,
      prelude: PRELUDE,
      baseline: flag('baseline'),
      slideDeletedAfterTheDeleteKey: results.filter((r) =>
        (r.slideDeletedSaid ?? []).some((w) => w.startsWith('after the Delete key')),
      ).length,
      slideDeletedAfterThePreludeUndo: results.filter((r) =>
        (r.slideDeletedSaid ?? []).some((w) => w !== 'before the prelude Undo'),
      ).length,
    }),
  );
  if (deckId) {
    /* trashed and removed by id; a base the checkpoint moved meanwhile is read again (the run of
       22:35Z left its deck behind on "baseRevision 42 is stale") */
    const removeById = async (action, extra) => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const info = await invoke('deck.info');
        try {
          return await invoke(action, { id: deckId, ...extra, baseRevision: info.revision });
        } catch (error) {
          if (!/stale/.test(String(error)) || attempt === 5) throw error;
          await sleep(1000);
        }
      }
      return null;
    };
    try {
      await removeById('deck.trash', {});
      await removeById('deck.remove', { confirm: true });
      console.log(
        'teardown',
        (await fetch(`${BASE}/edit/${deckId}`, { redirect: 'manual' })).status,
      );
    } catch (error) {
      console.log('teardownError', deckId, String(error).slice(0, 200));
    }
  }
  await browser.close();
}
