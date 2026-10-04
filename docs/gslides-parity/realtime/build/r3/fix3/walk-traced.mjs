// R3 fix round 3: the core walk with the controller, the room client and the snackbar traced, for
// the rows that are red in a long walk and green in their area alone (VERIFICATION.md "Realtime
// round, pass 3" P3-1 and P3-3). The walk itself is scripts/probes/editor-walk-probe.mjs, run as
// it is; this wrapper only patches playwright-core's `chromium.launch` so every context the walk
// opens serves the three modules with trace calls added (nothing in the tree is edited) and
// streams the trace to `--trace <file>` as JSON lines.
//   node walk-traced.mjs --trace <file> -- --core --base http://localhost:4473 --only decks,...
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('/Users/kevinliu/repos/Turboslide-realtime/package.json');
const pw = require('playwright-core');
const argv = process.argv.slice(2);
const split = argv.indexOf('--');
const own = split >= 0 ? argv.slice(0, split) : argv;
const walkArgs = split >= 0 ? argv.slice(split + 1) : [];
const TRACE = own[own.indexOf('--trace') + 1];
const BASELINE_UNDO = own.includes('--baseline-undo');
/* the tmp store of the server under test: the store's own slides, which the restore diffs from */
const OVERLAY_AT = own.indexOf('--overlay');
const OVERLAY =
  OVERLAY_AT >= 0
    ? own[OVERLAY_AT + 1]
    : '/Users/kevinliu/repos/Turboslide-realtime/.turboslide/r3fix3/overlay';
const canonical = (value) =>
  JSON.stringify(value, (_key, v) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
/**
 * The tab's document against the store's slide files and manifest, keys sorted: the slides that
 * differ, with the first differing characters of each, and the slides one side has alone.
 */
const compareWithStore = (deckId, doc) => {
  const dir = `${OVERLAY}/decks/${deckId}`;
  const apart = [];
  for (const [id, slide] of Object.entries(doc.slides ?? {})) {
    const file = `${dir}/slides/${id}.json`;
    if (!existsSync(file)) {
      apart.push({ id, store: 'no file' });
      continue;
    }
    const x = canonical(slide);
    const y = canonical(JSON.parse(readFileSync(file, 'utf8')));
    if (x === y) continue;
    let i = 0;
    while (i < x.length && x[i] === y[i]) i += 1;
    apart.push({
      id,
      at: i,
      tab: x.slice(Math.max(0, i - 100), i + 160),
      store: y.slice(Math.max(0, i - 100), i + 160),
    });
  }
  const manifest = existsSync(`${dir}/deck.json`)
    ? JSON.parse(readFileSync(`${dir}/deck.json`, 'utf8'))
    : null;
  const deck = {};
  if (manifest !== null)
    for (const k of new Set([...Object.keys(doc.deck ?? {}), ...Object.keys(manifest)]))
      if (k !== 'updatedAt' && canonical(doc.deck?.[k] ?? null) !== canonical(manifest[k] ?? null))
        deck[k] = {
          tab: canonical(doc.deck?.[k] ?? null).slice(0, 200),
          store: canonical(manifest[k] ?? null).slice(0, 200),
        };
  return { slidesApart: apart.length, slides: apart.slice(0, 8), deck };
};
if (!TRACE) throw new Error('--trace <file> is required');
writeFileSync(TRACE, '');

const hook = (body, pattern, replacement, name) => {
  const next = body.replace(pattern, replacement);
  if (next === body) appendFileSync(TRACE, `${JSON.stringify({ kind: 'hook-missing', name })}\n`);
  return next;
};
const ops = (list) =>
  `(${list} ?? []).map((m) => m.op + ":" + (m.slideId ?? m.path ?? m.assetId ?? "")).slice(0, 6)`;
const DIFF = `(a, b) => {
  const deck = {};
  for (const k of new Set([...Object.keys(a.deck), ...Object.keys(b.deck)]))
    if (k !== "revision" && k !== "updatedAt" && JSON.stringify(a.deck[k]) !== JSON.stringify(b.deck[k]))
      deck[k] = { before: JSON.stringify(a.deck[k] ?? null).slice(0, 300), after: JSON.stringify(b.deck[k] ?? null).slice(0, 300) };
  const slides = [];
  for (const id of new Set([...Object.keys(a.slides), ...Object.keys(b.slides)])) {
    const x = JSON.stringify(a.slides[id] ?? null);
    const y = JSON.stringify(b.slides[id] ?? null);
    if (x !== y) {
      let i = 0;
      while (i < x.length && x[i] === y[i]) i += 1;
      slides.push({ id, at: i, before: x.slice(Math.max(0, i - 80), i + 160), after: y.slice(Math.max(0, i - 80), i + 160) });
    }
  }
  return { deck, slides: slides.slice(0, 8), slideCount: slides.length };
}`;

const instrument = async (ctx) => {
  await ctx.exposeBinding('__TT', (_source, line) => {
    /* a restore's start and its undo's end carry the tab's document: it is compared with the
       store's files here and left out of the trace */
    const row = JSON.parse(line);
    if (row.data?.doc !== undefined) {
      const deckId = /\/edit\/([^/?#]+)/.exec(row.url ?? '')?.[1] ?? '';
      const doc = row.data.doc;
      delete row.data.doc;
      appendFileSync(TRACE, `${JSON.stringify(row)}\n`);
      appendFileSync(
        TRACE,
        `${JSON.stringify({ t: row.t, kind: 'store.compare', at: row.kind, deckId, data: compareWithStore(deckId, doc) })}\n`,
      );
      return;
    }
    appendFileSync(TRACE, `${line}\n`);
  });
  await ctx.addInitScript(() => {
    window.__T = (kind, data) => {
      try {
        window.__TT(JSON.stringify({ t: Date.now(), url: location.pathname, kind, data }));
      } catch {
        // a value that does not serialize is dropped
      }
    };
    document.addEventListener(
      'keydown',
      (e) => {
        if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z'))
          window.__T('key', {
            key: e.key,
            shift: e.shiftKey,
            target: `${e.target?.tagName ?? ''}${e.target?.getAttribute?.('data-control') ? `[${e.target.getAttribute('data-control')}]` : ''}`,
          });
      },
      true,
    );
  });
  await ctx.route(/\/src\/editor\/controller\.tsx/, async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    /* --baseline-undo: an undo step goes through the room as before R3 fix round 3, so the walk
       reads the mechanism the fix answers (undo-route.ts) */
    if (BASELINE_UNDO)
      body = hook(
        body,
        /const undoStep = \(entry, inverse\) => stepTravelsServerFirst\(entry\.mutations, inverse\) \?/,
        'const undoStep = (entry, inverse) => false ?',
        'baseline-undo',
      );
    body = hook(
      body,
      /shell\?\.say\(message\);/,
      'window.__T?.("say", message); shell?.say(message);',
      'say',
    );
    body = hook(
      body,
      /(const history = createEditHistory\(\);)/,
      '$1 { const f = history.clear; history.clear = () => { window.__T?.("history.clear", { depth: history.entries().length }); return f(); }; }',
      'history.clear',
    );
    body = hook(
      body,
      /(const inverse = stepMutations\(entry, entry\.inverse, "inverse"\);)/,
      `$1 window.__T?.("undo.step", { id: entry.id, label: entry.label, count: inverse.length, bytes: JSON.stringify(inverse).length, ops: ${ops('inverse')} });`,
      'undo.step',
    );
    body = hook(
      body,
      /(await undoStep\(entry, inverse\);)/,
      `$1 window.__T?.("undo.answered", { id: entry.id, label: entry.label, serverRevision: latest().serverRevision }); if (/^restore /.test(entry.label) && window.__beforeRestore) { const before = window.__beforeRestore; setTimeout(() => window.__T?.("restore.undo.diff", { label: entry.label, serverRevision: latest().serverRevision, pending: latest().pending, diff: (${DIFF})(before, latest().document), doc: latest().document }), 3000); }`,
      'undo.answered',
    );
    body = hook(
      body,
      /const restoreVersion = async \(n\) => \{/,
      'const restoreVersion = async (n) => { window.__T?.("restore.start", { n, serverRevision: latest().serverRevision, pending: latest().pending, doc: latest().document }); window.__beforeRestore = JSON.parse(JSON.stringify(latest().document));',
      'restoreVersion',
    );
    await route.fulfill({ response, body });
  });
  await ctx.route(/\/realtime\/client\/room-client\.ts/, async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    body = hook(
      body,
      /(response = await transport\.postOps\(body\);)/,
      `$1 window.__T?.("ops.answer", { sent: body.entries.length, bytes: JSON.stringify(body).length, kinds: body.entries.flatMap((e) => ${ops('e.mutations')}).slice(0, 6), ok: response.ok, status: response.status, code: response.code, message: response.message, rejected: response.rejected ?? null, revision: response.revision });`,
      'ops.answer',
    );
    body = hook(
      body,
      /const resync = async \(at\) => \{/,
      'const resync = async (at) => { window.__T?.("resync", { at, seq, revision, pending: pending.length });',
      'resync',
    );
    body = hook(
      body,
      /case "reject": \{/,
      'case "reject": { window.__T?.("reject", { opId: event.opId, reason: event.reason, message: event.message });',
      'reject',
    );
    body = hook(
      body,
      /case "checkpoint": \{/,
      'case "checkpoint": { if (event.external === true) window.__T?.("checkpoint.external", { toSeq: event.toSeq, revision: event.revision });',
      'checkpoint',
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
};

const launch = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = async (options) => {
  const browser = await launch(options);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (contextOptions) => {
    const ctx = await newContext(contextOptions);
    await instrument(ctx);
    return ctx;
  };
  return browser;
};
process.argv = [
  process.argv[0],
  '/Users/kevinliu/repos/Turboslide-realtime/scripts/probes/editor-walk-probe.mjs',
  ...walkArgs,
];
await import('/Users/kevinliu/repos/Turboslide-realtime/scripts/probes/editor-walk-probe.mjs');
