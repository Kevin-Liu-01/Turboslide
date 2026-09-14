#!/usr/bin/env node
// Merges the day 0 runs into docs/gslides-parity/verification-4/baseline-2026-09-14.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const S =
  '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/verify4';
const V = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/verification-4';
const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const r = (x) =>
  typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 10) / 10 : (x ?? null);

const strip = (routesJson) =>
  routesJson
    ? routesJson.routes.map(({ samples, ...row }) => ({
        ...Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k, typeof v === 'number' ? r(v) : v]),
        ),
        samples: samples.map((s) => ({
          ttfb: r(s.ttfb),
          fcp: r(s.fcp),
          lcp: r(s.lcp),
          lcpEl: s.lcpEl,
          routeDom: r(s.routeDom),
          studioAt: r(s.studioAt),
          settledAt: r(s.settledAt),
          hydratedAt: r(s.hydratedAt),
          ready: r(s.ready),
          readyWall: s.readyWall,
          jsFiles: s.jsFiles,
          jsDecoded: s.jsDecoded,
          jsWire: s.jsWire,
          imgWire: s.imgWire,
          requestsUntilReady: s.requestsUntilReady,
          requestsTotal: s.requestsTotal,
          serverFnCalls: s.serverFnCalls,
          renderRequests: s.renderRequests,
          renderHits: s.renderHits,
          nodes: s.nodes,
          heapUsedMb: s.heapUsedMb,
          loafMax: r(s.loafMax),
          cls: r(s.cls),
          doc: s.doc,
          protocol: s.protocol,
          error: s.error,
        })),
      }))
    : null;

const budget = (file) => {
  const j = read(file);
  if (!j) return null;
  return {
    file: file.split('/').pop(),
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
    base: j.base,
    profile: j.profile,
    budgetsMet: j.rows.filter((x) => x.limit !== null && x.ok).length,
    budgetsAsserted: j.rows.filter((x) => x.limit !== null).length,
    failures: j.failures,
    routes: j.routes.map((x) =>
      x.absent
        ? { route: x.route, absent: true }
        : {
            route: x.route,
            kind: x.kind,
            n: x.n,
            ttfb: r(x.ttfb),
            fcp: r(x.fcp),
            lcp: r(x.lcp),
            lcpEl: x.lcpEl,
            ready: r(x.ready),
            jsDecoded: x.jsDecoded,
            jsTransfer: x.jsTransfer,
            jsCount: x.jsCount,
            largestJs: x.largestJs,
            largestJsName: x.largestJsName,
            loafMax: r(x.loafMax),
            cls: r(x.cls),
            nodes: x.nodes,
            ttfbSamples: x.samples.map((s) => r(s.ttfb)),
            lcpSamples: x.samples.map((s) => r(s.lcp)),
            readySamples: x.samples.map((s) => r(s.ready)),
            errors: x.errors,
          },
    ),
    transitions: j.transitions.map((t) => ({ ...t, ms: r(t.ms) })),
    filmstrip: j.filmstrip
      ? {
          ...j.filmstrip,
          passes: j.filmstrip.passes.map((p) =>
            Object.fromEntries(Object.entries(p).map(([k, v]) => [k, r(v)])),
          ),
        }
      : null,
    idle: j.idle,
    twins: j.twins,
    write: j.write
      ? {
          ...j.write,
          text: Object.fromEntries(Object.entries(j.write.text).map(([k, v]) => [k, r(v)])),
          slide: Object.fromEntries(Object.entries(j.write.slide).map(([k, v]) => [k, r(v)])),
          homeCard: r(j.write.homeCard),
        }
      : null,
    rows: j.rows.map((x) => ({
      check: x.check,
      name: x.name,
      value: r(x.value),
      limit: x.limit,
      ok: x.ok,
      unit: x.unit,
    })),
  };
};

const editor = (j) => {
  if (!j || !j.editor) return j;
  const e = j.editor;
  const round = (o) =>
    o
      ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? r(v) : v]))
      : o;
  return {
    ...j,
    editor: {
      ...e,
      textEdits: e.textEdits.map(round),
      drags: e.drags.map(round),
      newSlide: round(e.newSlide),
      duplicate: round(e.duplicate),
      editToDecks: round(e.editToDecks),
      decksToEdit: round(e.decksToEdit),
    },
  };
};

const production = {
  base: 'https://turboslide.vercel.app',
  deployment: {
    id: 'dpl_C7gyjio633CawQxtdxDfYkGV9T55',
    url: 'https://turboslide-k38hov0ve-kl01s-projects.vercel.app',
    createdAt: '2026-09-14T14:14:40Z',
    commit: 'd5d7f07fa8a2b370cb784442d12d1d2e4c29771a',
    region: 'iad1',
    chunks: [
      'index-D6IA9RCO.js',
      'render-DV1uNm6o.js',
      'dither-key-3-G63s7k.js',
      'Frame-B_4Pg7lW.js',
    ],
  },
  perfBudget: budget(`${V}/perf-budget-baseline-2026-09-14.json`),
  routes: strip(read(`${S}/prod-routes.json`)),
  extras: read(`${S}/prod-extras.json`)?.extras ?? null,
  editor: editor(read(`${S}/prod-editor.json`))?.editor ?? null,
  material: read(`${S}/prod-material.json`)?.material ?? null,
  idle: read(`${S}/prod-idle.json`)?.idle ?? null,
  cleanup: read(`${S}/prod-cleanup.json`)?.cleanup ?? null,
};

const local = {
  base: 'http://localhost:4346',
  how: 'node_modules/.bin/vite preview --port 4346 --strictPort from apps/studio over apps/studio/dist (client chunks identical to production), TURBOSLIDE_STORE=tmp, TURBOSLIDE_REALTIME=memory, placeholder session and download secrets',
  perfBudget: budget(`${V}/perf-budget-local-2026-09-14.json`),
  routes: strip(read(`${S}/local-routes.json`)),
  extras: read(`${S}/local-extras.json`)?.extras ?? null,
  editor: editor(read(`${S}/local-editor.json`))?.editor ?? null,
  material: read(`${S}/local-material.json`)?.material ?? null,
  idle: read(`${S}/local-idle.json`)?.idle ?? null,
  cleanup: [
    ...(read(`${S}/local-cleanup.json`)?.cleanup ?? []),
    ...(read(`${S}/local-cleanup-2.json`)?.cleanup ?? []),
  ],
  transitionsFromFirstRun: {
    source: 'perf-budget-local-2026-09-14.log (the run that died at the Layout grid)',
    'decks->edit': 1712,
    back: 20,
    'edit->decks': 157,
    'trash->decks': 4,
    slideChange: 12,
    slideshow: 17,
  },
};

const out = {
  title: 'Turboslide round four day 0 baseline',
  date: '2026-09-14',
  commit: 'd5d7f07',
  verifier: 'round four verifier, day 0 (MILESTONES-4 Verifier item 1; SPEC-4 0.1, 6.3)',
  machine: {
    chip: 'Apple M5 Max',
    os: 'macOS 26.4 (25E246)',
    node: 'v24.13.0',
    playwrightCore: '1.62.1',
    chrome: 'Chrome for Testing 147.0.7727.15 (chromium-1217)',
    flags: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
    viewport: '1440x900',
    headless: true,
  },
  network: {
    downlinkMbps: 857.6,
    uplinkMbps: 808.2,
    idleLatencyMs: 13.6,
    tool: 'networkQuality -s',
  },
  definitions: 'research-4/04-performance-baseline.md section 1.2; design-4/perf-budget.mjs header',
  pp95: {
    'perf-budget-prod.json': 'c510519472f1d870fa5a7bdd1371e7532702b0af80a1c7e8ac104a19fcc0adca',
    'perf-budget-prod-2.json': '047fbf25fc714a3f843e2929d73a1bfa83f4fd6dbbab938c23d9300f2f4c6091',
    verified: true,
  },
  production,
  local,
};
writeFileSync(`${V}/baseline-2026-09-14.json`, JSON.stringify(out, null, 2));
console.log('wrote', `${V}/baseline-2026-09-14.json`, JSON.stringify(out).length, 'bytes');
