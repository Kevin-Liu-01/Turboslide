#!/usr/bin/env node
// Probes a deployed (or locally served) studio for the pages the hosting and the Google Slides
// parity rounds must answer and prints one table (docs/hosting.md section 7):
//
//   node scripts/hosted-smoke.mjs https://turboslide.vercel.app
//   node scripts/hosted-smoke.mjs http://localhost:4321 --deck gt-brand
//   node scripts/hosted-smoke.mjs --base <preview origin>
//
// Checks, in order: `/` is a 307 to /new carrying X-Robots-Tag: noindex (gslides-parity SPEC 6.1);
// /new is a 200 SSR shell (the route is ssr: false, so the document, the theme boot script and a
// script tag) with the noindex meta; /deck/<deck> is a 200 page whose payload carries no `notes`
// key (SPEC 6.6, R10 C3 item 1); /edit/<deck> is a 200 SSR shell; /decks is a 200 list naming the
// deck; /decks/trash is a 200 page; /print/<deck> and /present/<deck> are 200 pages (SPEC 6.8,
// 9.3); one asset twin of the deck (the first twin in decks/<deck>/deck.json of this checkout, or
// --asset <file>) is a 200 image or a 302 to one; /api/agent answers 401 or 200 (401 is the bearer
// rule off localhost without a token, SPEC 11). Exit code 1 when any row fails. Redirects are not
// followed, so the table shows what the server said. Nothing here needs the repository except the
// deck manifest for the twin.
//
// Round two (gslides-parity SPEC-2 8.1, 8.2): with `--token-env <VAR>` naming the environment
// variable that holds the deployment's bearer (TURBOSLIDE_TOKEN; the value is never printed) two
// rows join: `deck.info` over /api/actions carries `counts.snapshots` on the Blob store, and, with
// `--export-batch`, the batched Perfect export of the deck runs to its end (the plan, every batch
// in turn, the merge) and the row records the batch count, each batch's time, the merge's time
// and its peak memory. The GT deck's 85 slides are two batches at the size of 60; pass
// `--slides <n>` to export the first n slides of the play list instead. The export row can take
// several minutes; the timeout of its requests is 15 minutes.
//
// Round three (gslides-parity SPEC-3 8.8, 16.4; report 10 P23): the security rows. Every page
// route carries the headers of 8.8 (`x-content-type-options`, `x-frame-options` except /embed,
// `referrer-policy`, `permissions-policy`, `x-request-id`, HSTS on https) and the nonce based
// `content-security-policy-report-only` with `worker-src 'self' blob:`; `/embed/<deck>` names the
// Prototemplate ancestors instead of `frame-ancestors 'none'`; a `.json` asset of the deck is an
// attachment with `nosniff` and a sandboxing policy (the svg row is the same rule; the seed decks
// carry no svg twin, pass `--asset <file>.svg` when one exists); a restricted deck id answers 404
// on `/deck` and the JSON routes without saying whether it exists (`--restricted <id>` names one
// the verifier prepared, else the row is skipped by name); a cross site `text/plain` POST to
// `/api/actions/slide.remove` is refused; a thumbnail request without its grant is 403 in enforce
// mode and 200 in shadow mode (the row records which); the CSP report endpoint answers 204 to a
// report and 400 to garbage. The `/s/` exchange, the 410 after unpublish, the private document
// 403 and the twin URL derivability rows need B2's and B3's routes and the private store; they run
// when `--share-token <token>` and `--publish-token <token>` are given and are otherwise listed
// as skipped, never as passed.
//
// Round four (gslides-parity SPEC-4 2.6, 4.1, 0.31, 0.38; MILESTONES-4 "Integrator"; build-4/b1.md
// R12, b2.md R4, b4.md R11): `/home` is a 200 product page (the `main.ts-product` root, the hero
// sentence, the Speculation Rules script, no noindex); the icon set, the card, the eight twins
// under `/brand/` and `/home` are requested twice and the second answer must be a 200 of the right
// type, at the byte count `apps/studio/public/brand-manifest.json` records when the checkout is
// beside the script, and `x-vercel-cache: HIT` on an https deployment (the static layer answers
// before the function); the thumbnail cache: a render without `r` carries
// `cache-control: public, s-maxage=60, stale-while-revalidate=86400` and `x-turboslide-stamp`, and
// the same request with `r=<stamp>` twice is a CDN hit, a 302 to a Blob object
// (`x-turboslide-source: blob`) or a 200 body on a private store. With the bearer, `/api/agent`'s
// `instance` block is read (`effectsBackend`, `glibcVersionRuntime`) and reported (the row fails
// only when the block is missing; it asserts `native` once the Linux addon is committed, SPEC-4
// 0.38), and with `--template-copy` one deck is created from the GT template through
// `deck.create`, moved to the trash and deleted forever, so the row leaves the store as it found
// it (the row writes; pass it against a preview or a store you own).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = {
    url: null,
    deck: 'gt-brand',
    asset: null,
    timeoutMs: 30_000,
    tokenEnv: null,
    exportBatch: false,
    slides: null,
    restricted: null,
    shareToken: null,
    publishToken: null,
    templateCopy: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--deck') out.deck = argv[++i] ?? out.deck;
    else if (arg === '--template-copy') out.templateCopy = true;
    else if (arg === '--asset') out.asset = argv[++i] ?? null;
    else if (arg === '--base' || arg === '--url') out.url = argv[++i] ?? null;
    else if (arg === '--timeout') out.timeoutMs = Number(argv[++i] ?? out.timeoutMs);
    else if (arg === '--token-env') out.tokenEnv = argv[++i] ?? null;
    else if (arg === '--export-batch') out.exportBatch = true;
    else if (arg === '--slides') out.slides = Number(argv[++i] ?? 0) || null;
    else if (arg === '--restricted') out.restricted = argv[++i] ?? null;
    else if (arg === '--share-token') out.shareToken = argv[++i] ?? null;
    else if (arg === '--publish-token') out.publishToken = argv[++i] ?? null;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (out.url === null) out.url = arg;
  }
  return out;
}

/** The bearer the two round two rows send, from the named variable; never printed. */
function bearerHeaders(tokenEnv) {
  const token = tokenEnv ? process.env[tokenEnv] : undefined;
  return token ? { authorization: `Bearer ${token}` } : {};
}

const EXPORT_TIMEOUT_MS = 15 * 60_000;

async function postJson(base, path, body, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(new URL(path, base).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...protectionHeaders(), ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON: the status and the text say what happened
    }
    return { status: response.status, json, text, ms: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The batched export end to end (SPEC-2 8.1): the plan, the batches in turn, the merge; the
 * result carries every time so the table records them (docs/hosting.md section 7).
 */
async function exportBatchRow(base, deck, headers, slides) {
  const t = performance.now();
  const lines = [];
  const body = { mode: 'flatten', theme: ['light'] };
  const start = await postJson(
    base,
    `/api/export/${deck}?start=1`,
    body,
    headers,
    EXPORT_TIMEOUT_MS,
  );
  if (start.status !== 200 || !start.json?.jobId) {
    return {
      ok: false,
      detail: `start ${start.status}: ${start.text.slice(0, 200)}`,
      ms: start.ms,
    };
  }
  let plan = start.json;
  if (slides !== null && slides < plan.total) {
    // a shorter run: a plan over the first n slides of the play list
    await postJson(base, `/api/export/${deck}?cancel=${plan.jobId}`, {}, headers, 60_000);
    const subset = await postJson(
      base,
      `/api/export/${deck}?start=1`,
      { ...body, slideIds: plan.batches.flat().slice(0, slides) },
      headers,
      EXPORT_TIMEOUT_MS,
    );
    if (subset.status !== 200 || !subset.json?.jobId) {
      return {
        ok: false,
        detail: `start ${subset.status}: ${subset.text.slice(0, 200)}`,
        ms: subset.ms,
      };
    }
    plan = subset.json;
  }
  lines.push(
    `plan r${plan.revision}: ${plan.total} slide(s) in ${plan.batches.length} batch(es) of ${plan.batchSize} (${start.ms} ms)`,
  );
  for (let index = 0; index < plan.batches.length; index += 1) {
    const batch = await postJson(
      base,
      `/api/export/${deck}?batch=${index}&job=${plan.jobId}`,
      {},
      headers,
      EXPORT_TIMEOUT_MS,
    );
    if (batch.status !== 200 || batch.json === null || 'stale' in batch.json) {
      return {
        ok: false,
        detail: `${lines.join('; ')}; batch ${index} ${batch.status}: ${batch.text.slice(0, 200)}`,
        ms: Math.round(performance.now() - t),
      };
    }
    lines.push(
      `batch ${index}: ${batch.json.slides} slide(s) in ${batch.json.ms} ms (${batch.ms} ms on the wire)`,
    );
  }
  const merge = await postJson(
    base,
    `/api/export/${deck}?merge=${plan.jobId}`,
    {},
    headers,
    EXPORT_TIMEOUT_MS,
  );
  if (merge.status !== 200 || merge.json === null || merge.json.sync !== true) {
    return {
      ok: false,
      detail: `${lines.join('; ')}; merge ${merge.status}: ${merge.text.slice(0, 200)}`,
      ms: Math.round(performance.now() - t),
    };
  }
  const file = merge.json.files?.[0];
  lines.push(
    `merge: ${merge.json.summary?.pages} page(s) in ${merge.json.summary?.ms} ms (${merge.ms} ms on the wire), peak ${merge.json.peakMb} MiB, perfect ${merge.json.report?.perfect}, ${file ? `${file.name} ${file.bytes} B ${file.stored ? 'stored' : 'on the instance'}` : 'no file'}`,
  );
  return {
    ok: merge.json.report?.perfect === true && merge.json.summary?.pages === plan.total,
    detail: lines.join('; '),
    ms: Math.round(performance.now() - t),
  };
}

/** deck.info over the agent route: the Blob store reports its snapshots (SPEC-2 8.2). */
async function snapshotsRow(base, deck, headers) {
  const info = await postJson(
    base,
    `/api/actions/deck.info?deck=${encodeURIComponent(deck)}`,
    {},
    headers,
    60_000,
  );
  const counts = info.json?.counts ?? info.json?.output?.counts ?? null;
  const snapshots = counts?.snapshots;
  return {
    ok: info.status === 200 && typeof snapshots === 'number',
    detail:
      info.status !== 200
        ? `${info.status}: ${info.text.slice(0, 200)}`
        : typeof snapshots === 'number'
          ? `${snapshots} snapshot(s), revision ${info.json?.revision ?? info.json?.output?.revision}`
          : `deck.info answered without counts.snapshots (${Object.keys(counts ?? {}).join(', ')})`,
    ms: info.ms,
  };
}

/** The first twin path of the deck's manifest in this checkout, so the probe names a real file. */
function firstTwin(deck) {
  const manifest = join(ROOT, 'decks', deck, 'deck.json');
  if (!existsSync(manifest)) return null;
  const raw = JSON.parse(readFileSync(manifest, 'utf8'));
  for (const asset of Object.values(raw.assets ?? {})) {
    for (const twin of Object.values(asset.twins ?? {})) {
      if (typeof twin === 'string' && twin.startsWith('assets/'))
        return twin.slice('assets/'.length);
    }
  }
  return null;
}

/**
 * A preview deployment sits behind Vercel Authentication; with VERCEL_OIDC_TOKEN in the
 * environment (`vercel env pull`, the linked project's development token) every probe carries
 * the Trusted Sources header the platform accepts for the same project's previews.
 */
function protectionHeaders() {
  const token = process.env.VERCEL_OIDC_TOKEN;
  return token ? { 'x-vercel-trusted-oidc-idp-token': token } : {};
}

async function probe(base, path, timeoutMs, init = {}) {
  const url = new URL(path, base).toString();
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      ...init,
      headers: { ...protectionHeaders(), ...(init.headers ?? {}) },
    });
    const type = response.headers.get('content-type') ?? '';
    const textual = type.startsWith('text/') || type.includes('json');
    const text = textual ? await response.text() : '';
    // a binary answer's bytes are read from the body (the CDN rows compare them with the brand
    // manifest); a redirect or an empty answer is 0
    const bytes = textual
      ? text.length
      : response.status === 200
        ? (await response.arrayBuffer()).byteLength
        : Number(response.headers.get('content-length') ?? 0);
    const headers = {};
    for (const [name, value] of response.headers) headers[name] = value;
    return {
      url,
      status: response.status,
      type,
      location: response.headers.get('location') ?? '',
      robots: response.headers.get('x-robots-tag') ?? '',
      headers,
      text,
      bytes,
      ms: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      url,
      status: 0,
      type: '',
      location: '',
      robots: '',
      headers: {},
      text: '',
      bytes: 0,
      ms: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

const SHELL_MARKS = ['<!DOCTYPE html>', 'gt-theme', '<script'];
// the router stamps its nonce on head tags as well once `ssr.nonce` is wired (round three), so the
// meta may carry further attributes after `content`
const NOINDEX_META = /<meta\s+name="robots"\s+content="noindex"[^>]*\/?>/;

/** SPEC-4 2.6: what the served /home carries (the hero sentence's fragment as React escapes it). */
const HOME_MARKS = [
  '<main class="ts-product"',
  'Google Slides&#x27; menus, toolbar and shortcuts',
  '<script type="speculationrules"',
];

/** A Vercel preview deployment (never the production alias): `<project>-<hash>-<team>.vercel.app`. */
const isPreview = (url) => /^https:\/\/[^/]+-[a-z0-9]{9}-[^/.]+\.vercel\.app\//.test(url);

const isPage = (r) => r.status === 200 && r.type.includes('text/html');
const isShell = (r) => isPage(r) && SHELL_MARKS.every((m) => r.text.includes(m));
const shellDetail = (r) =>
  `${r.bytes} chars; ${SHELL_MARKS.filter((m) => r.text.includes(m)).length}/${SHELL_MARKS.length} shell marks`;

function checks(deck, asset) {
  const rows = [
    {
      name: '/',
      path: '/',
      expect: 'a 307 to /new with X-Robots-Tag: noindex',
      pass: (r) =>
        (r.status === 307 || r.status === 302) &&
        /^(?:https?:\/\/[^/]+)?\/new$/.test(r.location) &&
        /noindex/i.test(r.robots),
      detail: (r) =>
        `${r.location ? `location ${r.location}` : 'no location'}${r.robots ? `; x-robots-tag ${r.robots}` : '; no x-robots-tag'}`,
    },
    {
      name: '/new',
      path: '/new',
      expect: 'a 200 SSR shell with a noindex meta',
      pass: (r) => isShell(r) && NOINDEX_META.test(r.text),
      detail: (r) =>
        `${shellDetail(r)}; ${NOINDEX_META.test(r.text) ? 'noindex' : 'no noindex meta'}`,
    },
    {
      name: `/deck/${deck}`,
      path: `/deck/${deck}`,
      expect: 'a 200 page without a notes key',
      pass: (r) => isPage(r) && !r.text.includes('"notes"'),
      detail: (r) => `${r.bytes} chars; ${r.text.split('"notes"').length - 1} notes key(s)`,
    },
    {
      name: `/edit/${deck}`,
      path: `/edit/${deck}`,
      expect: 'a 200 SSR shell',
      pass: isShell,
      detail: shellDetail,
    },
    {
      name: '/decks',
      path: '/decks',
      expect: 'a 200 list naming the deck',
      pass: (r) => r.status === 200 && r.text.includes(`data-deck="${deck}"`),
      detail: (r) => `${r.text.split('data-deck="').length - 1} card(s)`,
    },
    {
      name: '/decks/trash',
      path: '/decks/trash',
      expect: 'a 200 page',
      pass: (r) => isPage(r) && r.text.includes('data-control="trash.'),
      detail: (r) => `${r.bytes} chars`,
    },
    {
      name: `/print/${deck}`,
      path: `/print/${deck}`,
      expect: 'a 200 page with the print bar',
      pass: (r) => isPage(r) && r.text.includes('data-control="print.bar"'),
      detail: (r) => {
        const count = /data-count="(\d+)"/.exec(r.text);
        return count ? `${count[1]} page(s)` : `${r.bytes} chars`;
      },
    },
    {
      name: `/present/${deck}`,
      path: `/present/${deck}`,
      expect: 'a 200 page',
      pass: isPage,
      detail: (r) => `${r.bytes} chars`,
    },
    {
      // gslides-parity SPEC-4 2.6 (build-4/b2.md R4): the product page's root, the hero sentence
      // as React serialises it (the apostrophe is &#x27;), the Speculation Rules script, indexable
      name: '/home',
      path: '/home',
      expect:
        'a 200 product page: main.ts-product, the hero sentence, a speculationrules script, no noindex',
      // the noindex meta is the app's and is always asserted; the x-robots-tag header is asserted on
      // production and on a local server, and reported on a preview: Vercel stamps
      // `x-robots-tag: noindex` on every answer of a non production deployment (measured on the
      // merge 2 preview: static files and pages alike; production carries it on `/` alone)
      pass: (r) =>
        isPage(r) &&
        HOME_MARKS.every((m) => r.text.includes(m)) &&
        !NOINDEX_META.test(r.text) &&
        (isPreview(r.url) || !/noindex/i.test(r.robots)),
      detail: (r) =>
        `${r.bytes} chars; ${HOME_MARKS.filter((m) => r.text.includes(m)).length}/${HOME_MARKS.length} marks; ${NOINDEX_META.test(r.text) ? 'noindex meta' : 'no noindex meta'}; x-robots-tag ${r.robots || 'none'}${isPreview(r.url) && /noindex/i.test(r.robots) ? ' (the platform stamps it on every preview answer; reported)' : ''}`,
    },
  ];
  if (asset !== null) {
    rows.push({
      name: `/decks/${deck}/assets/${asset}`,
      path: `/decks/${deck}/assets/${asset}`,
      expect: 'a 200 image or a 302 to one',
      pass: (r) =>
        (r.status === 200 && r.type.startsWith('image/')) ||
        (r.status === 302 && r.location !== ''),
      detail: (r) => (r.status === 302 ? `location ${r.location}` : `${r.type} ${r.bytes} B`),
    });
  }
  rows.push({
    name: '/api/agent',
    path: '/api/agent',
    expect: '401 off localhost without a token, else 200',
    pass: (r) => r.status === 401 || r.status === 200,
    detail: (r) => (r.status === 401 ? 'bearer rule' : ''),
  });
  return rows;
}

/** The headers every page answer carries (SPEC-3 8.8); HSTS only over https. */
const PAGE_HEADERS = [
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'x-request-id',
];

function missingHeaders(r, names) {
  return names.filter((name) => !(name in r.headers));
}

function cspOf(r) {
  return (
    r.headers['content-security-policy-report-only'] ?? r.headers['content-security-policy'] ?? ''
  );
}

/** The round three security rows (SPEC-3 16.4; report 10 P23), after the page rows. */
function securityChecks(base, deck, args) {
  const https = base.startsWith('https:');
  const rows = [];
  // `/` left the loop at round four's merge 2: the root redirect is compiled into the Build Output's
  // config.json (SPEC-4 0.43) and the CDN answers it without waking the function, so the headers
  // of 8.8 are not on it by design; the `/` row above asserts the 307 and its x-robots-tag
  for (const path of [`/edit/${deck}`, `/deck/${deck}`]) {
    rows.push({
      name: `headers ${path}`,
      path,
      expect: `the headers of 8.8${https ? ' with HSTS' : ''}, X-Frame-Options DENY, a report only CSP with worker-src blob:`,
      pass: (r) =>
        missingHeaders(r, PAGE_HEADERS).length === 0 &&
        (!https || 'strict-transport-security' in r.headers) &&
        r.headers['x-frame-options'] === 'DENY' &&
        (path === '/' || /worker-src 'self' blob:/.test(cspOf(r))) &&
        (path === '/' || /frame-ancestors 'none'/.test(cspOf(r))),
      detail: (r) => {
        const missing = missingHeaders(r, PAGE_HEADERS);
        return `${missing.length === 0 ? 'every header' : `missing ${missing.join(', ')}`}; csp ${cspOf(r) === '' ? 'none' : /worker-src 'self' blob:/.test(cspOf(r)) ? 'worker-src blob ok' : 'without worker-src blob'}; x-frame-options ${r.headers['x-frame-options'] ?? 'none'}`;
      },
    });
  }
  rows.push({
    name: `headers /embed/${deck}`,
    path: `/embed/${deck}`,
    expect: 'no X-Frame-Options, frame-ancestors naming the Prototemplate hosts',
    pass: (r) =>
      !('x-frame-options' in r.headers) &&
      /frame-ancestors https:\/\/prototemplate\.com/.test(cspOf(r)),
    detail: (r) =>
      `x-frame-options ${r.headers['x-frame-options'] ?? 'none'}; ${/frame-ancestors ([^;]+)/.exec(cspOf(r))?.[1] ?? 'no frame-ancestors'}`,
  });
  rows.push({
    name: 'json asset attachment',
    path: `/decks/${deck}/assets/${args.jsonAsset ?? 'liquid-metal-diamond.recipe.json'}`,
    expect:
      'a 200 attachment with nosniff and a sandboxing policy, or 404 when the deck has no such file',
    pass: (r) =>
      r.status === 404 ||
      (r.status === 200 &&
        /^attachment/.test(r.headers['content-disposition'] ?? '') &&
        r.headers['x-content-type-options'] === 'nosniff' &&
        /sandbox/.test(r.headers['content-security-policy'] ?? '')),
    detail: (r) =>
      r.status === 404
        ? 'no such file (pass --asset)'
        : `${r.headers['content-disposition'] ?? 'inline'}; ${r.headers['content-security-policy'] ?? 'no policy'}`,
  });
  rows.push({
    name: 'cross site text/plain POST',
    path: `/api/actions/slide.remove?deck=${encodeURIComponent(deck)}`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: 'https://evil.example' },
      body: '{"id":"title"}',
    },
    expect: '401, 403 or 415, never a write',
    pass: (r) => r.status === 401 || r.status === 403 || r.status === 415,
    detail: (r) => `${r.status}`,
  });
  rows.push({
    name: 'unsigned thumbnail',
    path: `/api/render/title?deck=${encodeURIComponent(deck)}&theme=light&w=160`,
    expect:
      '403 in enforce mode (SPEC-3 8.13), 200 or a 302 to the stored object in shadow mode (SPEC-4 0.31), or 404 for a deck without that slide',
    pass: (r) =>
      r.status === 403 ||
      r.status === 200 ||
      r.status === 404 ||
      (r.status === 302 && /\.blob\.vercel-storage\.com\//.test(r.location)),
    detail: (r) =>
      r.status === 403
        ? 'enforce: refused without the grant'
        : r.status === 200
          ? 'shadow: served and logged'
          : r.status === 302
            ? `shadow: the stored object (${r.location.replace(/\?.*$/, '').slice(0, 72)})`
            : 'no such slide',
  });
  rows.push({
    name: 'csp report endpoint',
    path: '/api/x/csp/report',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: JSON.stringify({
        'csp-report': {
          'document-uri': `${base}new`,
          'violated-directive': 'script-src',
          'blocked-uri': 'inline',
        },
      }),
    },
    expect: '204',
    pass: (r) => r.status === 204,
    detail: (r) => `${r.status}`,
  });
  if (args.restricted) {
    for (const path of [
      `/deck/${args.restricted}`,
      `/api/actions/deck.info?deck=${encodeURIComponent(args.restricted)}`,
    ]) {
      rows.push({
        name: `restricted ${path.split('?')[0]}`,
        path,
        expect: '404 or 401 without a right, no detail',
        pass: (r) =>
          (r.status === 404 || r.status === 401) && !/owner|grant|restricted/i.test(r.text),
        detail: (r) => `${r.status}`,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Round four rows (SPEC-4 4.1's last row, 0.31, 0.38; MILESTONES-4 "Integrator")

/** The icon set, the card and /home (SPEC-4 4.1) plus the eight twins under /brand/ (b1.md R12). */
const CDN_PATHS = [
  '/favicon.ico',
  '/icon.svg',
  '/apple-touch-icon.png',
  '/manifest.webmanifest',
  '/icons/icon-512.png',
  '/og/turboslide.png',
  '/brand/hero-dark.png',
  '/brand/hero-light.png',
  '/brand/figure-dark.png',
  '/brand/figure-light.png',
  '/brand/notfound-dark.png',
  '/brand/notfound-light.png',
  '/brand/og-screen-dark.png',
  '/brand/og-screen-light.png',
  '/home',
];

/** The content type a static path must answer with (the prefix that matters). */
function expectedType(path) {
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.ico')) return 'image/';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.webmanifest')) return 'manifest';
  return 'text/html';
}

/** The byte count brand-manifest.json records for a public path, when the checkout is here. */
function manifestBytes(path) {
  const file = join(ROOT, 'apps/studio/public/brand-manifest.json');
  if (!existsSync(file)) return null;
  try {
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    const record = manifest.files?.[`apps/studio/public${path}`];
    return typeof record?.bytes === 'number' ? record.bytes : null;
  } catch {
    return null;
  }
}

/**
 * Each static path twice: the second answer is a 200 of the right type, at the manifest's bytes
 * where it records the file, and a CDN hit on an https deployment (`x-vercel-cache: HIT`, the
 * static layer before the function; R02 section 1 measured function 404s on the round three
 * deploy). On http (a local server) the cache header is reported, not asserted.
 */
async function cdnRows(base, timeoutMs) {
  const https = base.startsWith('https:');
  const rows = [];
  for (const path of CDN_PATHS) {
    const first = await probe(base, path, timeoutMs);
    const second = await probe(base, path, timeoutMs);
    const type = expectedType(path);
    const bytes = path.endsWith('.png') || path.endsWith('.ico') ? manifestBytes(path) : null;
    const cache = second.headers['x-vercel-cache'] ?? null;
    const ok =
      second.error === undefined &&
      second.status === 200 &&
      (type === 'manifest' ? /manifest|json/.test(second.type) : second.type.startsWith(type)) &&
      (bytes === null || second.bytes === bytes) &&
      (!https || cache === 'HIT');
    rows.push({
      row: {
        name: `cdn ${path}`,
        expect: `200 ${type}${bytes === null ? '' : ` of ${bytes} B`}${https ? ', x-vercel-cache HIT on the second request' : ''}`,
        detail: () =>
          `${second.type || 'no type'} ${second.bytes} B; first ${first.status} ${first.headers['x-vercel-cache'] ?? '-'}, second ${second.status} ${cache ?? '-'}; ${second.headers['cache-control'] ?? 'no cache-control'}`,
      },
      r: second,
      ok,
    });
  }
  return rows;
}

/** The first slide id of the deck in this checkout, else `title` (the GT deck's opener). */
function firstSlideId(deck) {
  const manifest = join(ROOT, 'decks', deck, 'deck.json');
  if (!existsSync(manifest)) return 'title';
  try {
    const raw = JSON.parse(readFileSync(manifest, 'utf8'));
    // the manifest orders slides by section (sections[].slideIds); round one's flat list is read too
    const first = raw.sections?.[0]?.slideIds?.[0] ?? raw.slides?.[0];
    const id = typeof first === 'string' ? first : first?.id;
    return typeof id === 'string' && id !== '' ? id : 'title';
  } catch {
    return 'title';
  }
}

/**
 * The thumbnail cache (SPEC-4 0.31; b4.md R11): without `r` the newest stored thumbnail with the
 * stale while revalidate header and the stamp; with `r=<stamp>` twice, the second answer a CDN
 * hit, a 302 to the Blob object, or a 200 body on a private store. In enforce mode (SPEC-3 8.13)
 * the route answers 403 without a grant, and both rows record that instead of failing.
 */
async function thumbnailRows(base, deck, timeoutMs) {
  const https = base.startsWith('https:');
  const slide = firstSlideId(deck);
  const path = `/api/render/${encodeURIComponent(slide)}?deck=${encodeURIComponent(deck)}&theme=dark&w=320`;
  const plain = await probe(base, path, timeoutMs);
  const stamp = plain.headers['x-turboslide-stamp'] ?? null;
  const rows = [];
  const enforce = plain.status === 403;
  rows.push({
    row: {
      name: 'thumbnail without r',
      expect:
        'a 200 body or a 302 to the stored object on a public store, with x-turboslide-stamp and, on a local server, cache-control public, s-maxage=60, stale-while-revalidate=86400 (the CDN rewrites it on https; 403 recorded in enforce mode)',
      detail: () =>
        enforce
          ? 'enforce mode: refused without the grant'
          : `${plain.status}${plain.status === 302 ? ` -> ${plain.location.replace(/\?.*$/, '').slice(0, 60)}` : ''}; ${plain.headers['cache-control'] ?? 'no cache-control'}; ${plain.headers['x-vercel-cache'] ?? 'no CDN'}${plain.headers['set-cookie'] ? '; set-cookie present (the CDN does not cache it)' : ''}; stamp ${stamp ?? 'none'}; source ${plain.headers['x-turboslide-source'] ?? '-'}; fresh ${plain.headers['x-turboslide-fresh'] ?? '-'}`,
    },
    r: plain,
    ok:
      plain.error === undefined &&
      (enforce ||
        ((plain.status === 200 ||
          (plain.status === 302 && /\.blob\.vercel-storage\.com\//.test(plain.location))) &&
          stamp !== null &&
          // the exact header on a local server; a Vercel deployment's CDN rewrites cache-control on
          // the way out (s-maxage and stale-while-revalidate are the CDN's, the client sees `public`
          // or `public, max-age=0, must-revalidate`), so on https the row asserts the stamp and
          // records the header and x-vercel-cache as the CDN returned them
          (https ||
            /public, s-maxage=60, stale-while-revalidate=86400/.test(
              plain.headers['cache-control'] ?? '',
            )))),
  });
  if (enforce || stamp === null) {
    rows.push({
      row: {
        name: 'thumbnail with r twice',
        expect: 'a stamp from the row above',
        detail: () => (enforce ? 'enforce mode: not requested' : 'no stamp to request'),
      },
      r: plain,
      ok: enforce,
    });
    return rows;
  }
  const stamped = `${path}&r=${encodeURIComponent(stamp)}`;
  const first = await probe(base, stamped, timeoutMs);
  const second = await probe(base, stamped, timeoutMs);
  const cache = second.headers['x-vercel-cache'] ?? null;
  const blobRedirect =
    second.status === 302 &&
    second.location !== '' &&
    (second.headers['x-turboslide-source'] === 'blob' ||
      /blob\.vercel-storage\.com/.test(second.location));
  const body = second.status === 200 && second.type.startsWith('image/');
  const immutable = /max-age=31536000, immutable/.test(second.headers['cache-control'] ?? '');
  rows.push({
    row: {
      name: 'thumbnail with r twice',
      expect:
        'the second answer a CDN hit (x-vercel-cache HIT), a 302 to the Blob object (x-turboslide-source blob) or a 200 body, immutable for a year',
      detail: () =>
        `first ${first.status} ${first.headers['x-vercel-cache'] ?? '-'} ${first.headers['x-turboslide-source'] ?? ''}; second ${second.status} ${cache ?? '-'} ${second.headers['x-turboslide-source'] ?? ''}${second.location ? ` -> ${second.location.replace(/\?.*$/, '').slice(0, 80)}` : ''}; ${second.headers['cache-control'] ?? 'no cache-control'}`,
    },
    r: second,
    ok: second.error === undefined && (cache === 'HIT' || blobRedirect || body) && immutable,
  });
  return rows;
}

/**
 * The instance facts of /api/agent with the bearer (SPEC-4 0.38, 3.9; b4.md R11): the effects
 * backend the function selected and the runtime's glibc. Reported until the Linux addon is
 * committed; the row fails only when the block is missing.
 */
async function backendRow(base, headers, timeoutMs) {
  const r = await probe(base, '/api/agent', timeoutMs, { headers });
  let instance = null;
  try {
    instance = JSON.parse(r.text)?.instance ?? null;
  } catch {
    // not JSON
  }
  return {
    row: {
      name: 'effects backend',
      expect:
        'instance.effectsBackend and instance.glibcVersionRuntime on /api/agent (native once the addon is committed)',
      detail: () =>
        instance === null
          ? `${r.status}: no instance block (${r.text.slice(0, 120)})`
          : `${instance.effectsBackend}; glibc ${instance.glibcVersionRuntime ?? 'none reported'}; node ${instance.node} ${instance.platform}${instance.effectsBackend === 'native' ? '' : ' (the TypeScript or wasm stages: the Linux addon is not committed, SPEC-4 0.38)'}`,
    },
    r,
    ok: r.status === 200 && instance !== null && typeof instance.effectsBackend === 'string',
  };
}

/**
 * One template copy (MILESTONES-4 "Integrator": "one render and one template copy"): deck.create
 * from the GT template, then deck.trash and deck.remove with the revisions the answers name, so
 * the store is as it was. A failure leaves the deck id in the row for a hand cleanup.
 */
async function templateCopyRow(base, headers) {
  const id = `smoke-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6)}`;
  const t = performance.now();
  const lines = [];
  const created = await postJson(
    base,
    '/api/actions/deck.create',
    { name: `Smoke ${id}`, id, from: 'gt-brand' },
    headers,
    EXPORT_TIMEOUT_MS,
  );
  if (created.status !== 200) {
    return {
      ok: false,
      detail: `deck.create ${created.status}: ${created.text.slice(0, 200)}`,
      ms: Math.round(performance.now() - t),
    };
  }
  const revisionOf = (json) =>
    typeof json?.revision === 'number'
      ? json.revision
      : typeof json?.output?.revision === 'number'
        ? json.output.revision
        : typeof json?.deck?.revision === 'number'
          ? json.deck.revision
          : null;
  let revision = revisionOf(created.json);
  if (revision === null) {
    const info = await postJson(base, `/api/actions/deck.info?deck=${id}`, {}, headers, 60_000);
    revision = revisionOf(info.json);
  }
  lines.push(`created ${id} at r${revision ?? '?'} in ${created.ms} ms`);
  if (revision === null) {
    return {
      ok: false,
      detail: `${lines.join('; ')}; no revision in the answer, the deck is left in place`,
      ms: Math.round(performance.now() - t),
    };
  }
  const trashed = await postJson(
    base,
    `/api/actions/deck.trash?deck=${id}`,
    { id, baseRevision: revision },
    headers,
    60_000,
  );
  if (trashed.status !== 200) {
    return {
      ok: false,
      detail: `${lines.join('; ')}; deck.trash ${trashed.status}: ${trashed.text.slice(0, 160)}; ${id} is left in place`,
      ms: Math.round(performance.now() - t),
    };
  }
  const afterTrash = revisionOf(trashed.json) ?? revision;
  lines.push(`trashed at r${afterTrash} in ${trashed.ms} ms`);
  const removed = await postJson(
    base,
    `/api/actions/deck.remove?deck=${id}`,
    { id, confirm: true, baseRevision: afterTrash },
    headers,
    60_000,
  );
  if (removed.status !== 200) {
    return {
      ok: false,
      detail: `${lines.join('; ')}; deck.remove ${removed.status}: ${removed.text.slice(0, 160)}; ${id} is in the trash`,
      ms: Math.round(performance.now() - t),
    };
  }
  lines.push(`removed in ${removed.ms} ms`);
  const gone = await probe(base, `/deck/${id}`, 30_000);
  lines.push(`/deck/${id} answers ${gone.status}`);
  return {
    ok: gone.status === 404,
    detail: lines.join('; '),
    ms: Math.round(performance.now() - t),
  };
}

/** The rows that need B2's and B3's routes: listed as skipped with the flag that turns them on. */
function skippedSecurityRows(args) {
  const out = [];
  if (!args.shareToken)
    out.push({
      name: '/s/<token> exchange',
      why: 'pass --share-token <token> (SPEC-3 6.4; B3 route)',
    });
  if (!args.publishToken)
    out.push({
      name: '410 after unpublish',
      why: 'pass --publish-token <token> (SPEC-3 6.4; B2 route)',
    });
  out.push({
    name: 'private document 403',
    why: 'the private store of SPEC-3 11.5 R2 is not connected this round',
  });
  out.push({
    name: 'twin URL not derivable',
    why: 'the storage layout v2 (d/<id>/<assetKey>/) lands with the migration',
  });
  if (!args.restricted)
    out.push({ name: 'restricted 404', why: 'pass --restricted <deck id> with an access record' });
  return out;
}

function pad(value, width) {
  const s = String(value);
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.url === null) {
    console.log(
      'usage: node scripts/hosted-smoke.mjs <url> [--deck gt-brand] [--asset <file>] [--timeout <ms>]',
    );
    process.exit(args.help ? 0 : 2);
  }
  const base = args.url.endsWith('/') ? args.url : `${args.url}/`;
  const asset = args.asset ?? firstTwin(args.deck);
  const rows = [...checks(args.deck, asset), ...securityChecks(base, args.deck, args)];
  const results = [];
  for (const row of rows) {
    const r = await probe(base, row.path, args.timeoutMs, row.init ?? {});
    const ok = r.error === undefined && row.pass(r);
    results.push({ row, r, ok });
  }
  for (const skipped of skippedSecurityRows(args)) {
    console.log(`skip  ${skipped.name}: ${skipped.why}`);
  }
  // the round four rows without a bearer: the static layer twice, the thumbnail cache
  results.push(...(await cdnRows(base, args.timeoutMs)));
  results.push(...(await thumbnailRows(base, args.deck, args.timeoutMs)));
  // the round two rows, with the bearer (SPEC-2 8.1, 8.2)
  const headers = bearerHeaders(args.tokenEnv);
  if (args.tokenEnv === null) {
    console.log(
      'skip  effects backend: pass --token-env <VAR> (the row reads /api/agent with the bearer)',
    );
    console.log(
      'skip  template copy: pass --token-env <VAR> and --template-copy (the row writes one deck and removes it)',
    );
  }
  if (args.tokenEnv !== null) {
    if (headers.authorization === undefined) {
      results.push({
        row: { name: 'deck.info snapshots', expect: `${args.tokenEnv} set`, detail: () => '' },
        r: { status: 0, ms: 0, error: `${args.tokenEnv} is not set in the environment` },
        ok: false,
      });
    } else {
      results.push(await backendRow(base, headers, args.timeoutMs));
      if (args.templateCopy) {
        const copied = await templateCopyRow(base, headers);
        results.push({
          row: {
            name: 'template copy',
            expect: 'deck.create from the GT template, then trashed and deleted forever',
            detail: () => copied.detail,
          },
          r: { status: copied.ok ? 200 : '-', ms: copied.ms },
          ok: copied.ok,
        });
      } else {
        console.log(
          'skip  template copy: pass --template-copy (the row writes one deck and removes it)',
        );
      }
      const snap = await snapshotsRow(base, args.deck, headers);
      results.push({
        row: {
          name: 'deck.info snapshots',
          expect: 'counts.snapshots on the Blob store',
          detail: () => snap.detail,
        },
        r: { status: snap.ok ? 200 : '-', ms: snap.ms },
        ok: snap.ok,
      });
      if (args.exportBatch) {
        const exported = await exportBatchRow(base, args.deck, headers, args.slides);
        results.push({
          row: {
            name: 'export batched',
            expect: 'a perfect file from every batch and one merge',
            detail: () => exported.detail,
          },
          r: { status: exported.ok ? 200 : '-', ms: exported.ms },
          ok: exported.ok,
        });
      }
    }
  }
  const width = Math.max(...results.map(({ row }) => row.name.length), 4);
  console.log(`${pad('path', width)}  status  ms     result  detail`);
  for (const { row, r, ok } of results) {
    const detail = r.error ?? (ok ? row.detail(r) : `expected ${row.expect}; ${row.detail(r)}`);
    console.log(
      `${pad(row.name, width)}  ${pad(r.status || '-', 6)}  ${pad(r.ms, 5)}  ${ok ? 'pass' : 'FAIL'}    ${detail}`,
    );
  }
  const failed = results.filter(({ ok }) => !ok).length;
  console.log(
    `${results.length - failed}/${results.length} passed against ${base}${asset === null ? ' (no twin named: pass --asset <file> or run from the checkout)' : ''}`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

await main();
