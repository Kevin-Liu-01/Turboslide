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
// key (SPEC 6.6, R10 C3 item 1); /edit/<deck> is a 200 SSR shell; /decks is a 200 page that
// lists no deck to a cookieless stranger (H2); /decks/trash is a 200 page; /print/<deck> and
// /present/<deck> are 200 pages (SPEC 6.8, 9.3); one asset twin of the deck (the first twin in decks/<deck>/deck.json of this checkout, or
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
// `content-security-policy-report-only` with `worker-src 'self' blob:` (enforced as
// `content-security-policy` on the document routes since HR-W#2, the row `csp enforced /deck/<deck>`
// of docs/hardening/HARDENING.md 8.3); `/embed/<deck>` names the
// Prototemplate ancestors instead of `frame-ancestors 'none'`; a `.json` asset of the deck is an
// attachment with `nosniff` and a sandboxing policy (the svg row is the same rule; the seed decks
// carry no svg twin, pass `--asset <file>.svg` when one exists); a restricted deck id answers 404
// on `/deck` and the JSON routes without saying whether it exists (`--restricted <id>` names one
// the verifier prepared, else the row is skipped by name); a cross site `text/plain` POST to
// `/api/actions/slide.remove` is refused; a thumbnail request without its grant is 403 (401 with
// no identity), and since security hotfix H3 the shadow answers (200, a 302 to the stored object)
// fail the row, because no deployment serves a denied request any more; the CSP report endpoint
// answers 204 to a report and 400 to garbage. The `/s/` exchange and the 410 after unpublish need
// B2's and B3's routes; they run when `--share-token <token>` and `--publish-token <token>` are
// given and are otherwise listed as skipped, never as passed.
//
// Round four (gslides-parity SPEC-4 2.6, 4.1, 0.31, 0.38; MILESTONES-4 "Integrator"; build-4/b1.md
// R12, b2.md R4, b4.md R11): `/home` is a 200 product page (the `.ts-site` root, the hero's
// second button, the Speculation Rules script, no noindex); the icon set, the card, the eight twins
// under `/brand/` and `/home` are requested twice and the second answer must be a 200 of the right
// type, at the byte count `apps/studio/public/brand-manifest.json` records when the checkout is
// beside the script, and `x-vercel-cache: HIT` on an https deployment (the static layer answers
// before the function); the thumbnail cache, asked with the smoke's identity cookie on the open
// deck: a render without `r` carries `x-turboslide-stamp` and, as a body,
// `cache-control: public, s-maxage=60, stale-while-revalidate=86400`, and the same request with
// `r=<stamp>` twice is an immutable body (a CDN hit on https) or a 302 to the Blob object, which
// is `private, no-store` since HR-SD#5. With the bearer, `/api/agent`'s
// `instance` block is read (`effectsBackend`, `glibcVersionRuntime`) and reported (the row fails
// only when the block is missing; it asserts `native` once the Linux addon is committed, SPEC-4
// 0.38), and with `--template-copy` one deck is created from the GT template through
// `deck.create`, moved to the trash and deleted forever, so the row leaves the store as it found
// it (the row writes; pass it against a preview or a store you own).
//
// The polish round (docs/archive/rounds/POLISH.md section 0 item 2, 3.7; polish/build/b7.md request 2): two rows
// that read the build a domain serves, so the table stops reading green on a stale deployment
// (audit-chrome section 0 and item 1: www.turboslide.com served a bundle from ship one with every
// other row passing). `build commit` reads `/api/agent`'s `instance.commit` (B5's stamp, section 0
// item 1) and fails when the field is missing or, with `--sha <commit>`, when it differs from the
// commit named (a prefix of either matches the other); off localhost the field needs the bearer,
// so without `--token-env` the row is listed as skipped. `Tools > Preferences > Play shaders` reads
// the client the shell loads: on a built deployment it walks the module graph from the shell's
// scripts (`assets/*.js`, the static imports and the `import()` chunks, bounded) until one module
// carries the row id `tools.preferences.playShaders` and the label "Play animated patterns" (the row
// left the View menu for Tools > Preferences in Round 1, docs/NEXT.md 4.1.3 items 20 and 21, and took
// the seller's noun of question 10); on a Vite dev server (the shell's
// entry under `/@id/`) it reads the menu model through `/@fs/<checkout>/packages/chrome/src/menus/model.ts`.
// The `/home` row's marks are the site build's page (docs/SITE.md): the root `class="ts-site"`
// (the element carries `id="top"` first), the hero's second button, and the Speculation Rules script.
//
// The hardening round (docs/hardening/HARDENING.md 8.3; HR-SD#5, CRIT-M2): `access answer reads
// enforce` reads `/api/access/<deck>` (`authorize: 'enforce'`) and keeps the identity cookie the
// answer mints, which the thumbnail rows send. With the bearer, the smoke makes one scratch deck
// with `deck.create` (restricted to its creator, as every new deck is), requires `private,
// no-store` on its thumbnail (`restricted thumbnail private`), and removes it forever at the end
// of the run (`scratch deck removed`). HR-K1#6 (DATA-2, DATA-V2; required since production's
// cutover and its `delete`): on the public store, whose host the deployment names in its policy's
// `img-src` (TURBOSLIDE_PUBLIC_STORE_HOST), `private document 403` requires 403 or 404 for the
// scratch deck's `deck.json` and `access.json`, `twin URL not derivable` requires an asset key not
// derived from the deck id and the scratch deck's picture under that key alone, and `principal
// index private` requires 403 or 404 for a `users/<id>/decks.json` that `account.decks` proved to
// exist (the bearer's, or the account key's `--index-token-env <VAR>` names; skipped by name
// otherwise). The row `document cache 60 s` (HR-K1#1) left with them (CRIT-M15): no document is on
// the public store to carry a max age. HR-SD#6
// (CRIT-M3): `asset by name 404` adds a picture to the scratch deck and requires 404 for it by its
// file name with no identity, and the picture by its asset key (a deployment alone: a local tmp
// store keeps names). HR-K1#5a (CRIT-M4, DATA-3): `export URL signed` exports the scratch deck as
// a one theme PDF through the sync export's JSON variant and requires every file's link to name
// `/api/download/` and no store host, and the first stored link to read back with the bearer as a
// PDF with bytes (HR-K1#6). HR-W#3a (SPEC-1, WEB-4): `static headers /home`, `/home/`
// and `/docs` read the answers the CDN gives before the function runs, whose headers come from the
// route rules of apps/studio/vite.deploy.config.ts: nosniff, `x-frame-options: DENY`, COOP, the
// referrer and permissions policies, and on https the long HSTS value. HR-W#3b (SPEC-1, CRIT-W5):
// `static csp /home` and `static csp /docs` require an enforced policy with `frame-ancestors
// 'none'` whose nonce is the one value of every nonce attribute on the page (on Vercel the build's
// one nonce, which the route header names; on a node server the request's).
//
// The Glyphfield port (GF-2.1): `deck card first slide` reads `/deck/<deck>` with no cookie, as a
// link preview does, and requires `og:image` to name the open deck's first slide at 1200 by 675 on
// the render route and that picture to answer with no cookie.
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
    indexTokenEnv: null,
    exportBatch: false,
    slides: null,
    restricted: null,
    shareToken: null,
    publishToken: null,
    templateCopy: false,
    sha: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--deck') out.deck = argv[++i] ?? out.deck;
    else if (arg === '--template-copy') out.templateCopy = true;
    else if (arg === '--asset') out.asset = argv[++i] ?? null;
    else if (arg === '--base' || arg === '--url') out.url = argv[++i] ?? null;
    else if (arg === '--timeout') out.timeoutMs = Number(argv[++i] ?? out.timeoutMs);
    else if (arg === '--token-env') out.tokenEnv = argv[++i] ?? null;
    else if (arg === '--index-token-env') out.indexTokenEnv = argv[++i] ?? null;
    else if (arg === '--export-batch') out.exportBatch = true;
    else if (arg === '--slides') out.slides = Number(argv[++i] ?? 0) || null;
    else if (arg === '--restricted') out.restricted = argv[++i] ?? null;
    else if (arg === '--share-token') out.shareToken = argv[++i] ?? null;
    else if (arg === '--publish-token') out.publishToken = argv[++i] ?? null;
    else if (arg === '--sha') out.sha = argv[++i] ?? null;
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
    // the identity cookie the answer minted, as a Cookie header value (hardening HR-SD#5)
    const cookie = response.headers
      .getSetCookie()
      .map((line) => line.split(';')[0] ?? '')
      .filter((pair) => /^(__Host-)?ts_id=/.test(pair))
      .join('; ');
    return {
      url,
      status: response.status,
      type,
      location: response.headers.get('location') ?? '',
      robots: response.headers.get('x-robots-tag') ?? '',
      headers,
      cookie,
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
      cookie: '',
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

/**
 * What the served /home carries (SPEC-4 2.6; the site build, docs/SITE.md): the root's class
 * (`<div id="top" class="ts-site"`), the label of the hero's second button, which only the page's
 * body writes (the hero caption left the page on 2026-10-22), and the Speculation Rules script.
 */
const HOME_MARKS = ['class="ts-site"', 'Open the Example Deck', '<script type="speculationrules"'];

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
    // the focus round (docs/FOCUS.md 2.1, 6.4 `decks.access.*` and `decks.notfound.page`): the
    // HTTP half of the access and Not found rows the core gate drives, as a smoke before a gate run
    {
      // the edit route is `ssr: 'data-only'` (SPEC-4 0.34): the server answers 404 with the shell
      // and the You need access page is drawn in the browser, so the HTTP half asserts the status
      // alone and the page itself is the core gate's row (`decks.access.page`, roles.spec.ts)
      name: '/edit/<unknown> access',
      path: '/edit/no-such-deck-hosted-smoke',
      expect: 'a 404 (the You need access page is client rendered on this data only route)',
      pass: (r) => r.status === 404,
      detail: (r) =>
        `${r.bytes} chars; access page in the HTML ${r.text.includes('data-control="access.page"')} (drawn in the browser)`,
    },
    {
      name: '/deck/<unknown> access',
      path: '/deck/no-such-deck-hosted-smoke',
      expect: 'a 404 carrying the You need access page',
      pass: (r) => r.status === 404 && r.text.includes('data-control="access.page"'),
      detail: (r) =>
        `${r.bytes} chars; access page ${r.text.includes('data-control="access.page"')}`,
    },
    {
      name: '/<no route> not found',
      path: '/no-such-page-hosted-smoke',
      expect: 'a 404 carrying the Not found page and its three links',
      pass: (r) =>
        r.status === 404 &&
        ['notfound', 'notfound.new', 'notfound.decks', 'notfound.about'].every((c) =>
          r.text.includes(`data-control="${c}"`),
        ),
      detail: (r) =>
        `${r.bytes} chars; ${['notfound', 'notfound.new', 'notfound.decks', 'notfound.about'].filter((c) => r.text.includes(`data-control="${c}"`)).length} of 4 controls`,
    },
    {
      name: `/edit/${deck}`,
      path: `/edit/${deck}`,
      expect: 'a 200 SSR shell',
      pass: isShell,
      detail: shellDetail,
    },
    {
      // since H2 (docs/NEXT.md 3.2) /decks lists a visitor's own and shared decks: a request with
      // no cookie is a stranger, whose page lists no deck of the store and draws no caption
      // claiming every presentation (the row decks.list.own-and-shared reads the browser's half)
      name: '/decks',
      path: '/decks',
      expect: 'a 200 page that lists no deck to a stranger',
      pass: (r) =>
        r.status === 200 &&
        r.text.includes('data-control="home.') &&
        !r.text.includes('data-deck="') &&
        !/Every presentation on this Turboslide/.test(r.text),
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
      // gslides-parity SPEC-4 2.6 (build-4/b2.md R4), the site build (docs/SITE.md): the page's
      // root, the hero's second button, the Speculation Rules script, indexable
      name: '/home',
      path: '/home',
      expect:
        'a 200 product page: the .ts-site root, the hero button, a speculationrules script, no noindex',
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

/**
 * The security headers a static answer lacks (hardening HR-W#3a): the values of
 * apps/studio/src/server/headers.ts STATIC_HEADERS, HSTS on https only.
 */
function missingStaticHeaders(r, https) {
  const expected = {
    'x-content-type-options': /^nosniff$/,
    'x-frame-options': /^DENY$/,
    'cross-origin-opener-policy': /^same-origin$/,
    'referrer-policy': /^strict-origin-when-cross-origin$/,
    'permissions-policy': /geolocation=\(\)/,
    ...(https
      ? { 'strict-transport-security': /max-age=63072000; includeSubDomains; preload/ }
      : {}),
  };
  return Object.entries(expected)
    .filter(([name, value]) => !value.test(r.headers[name] ?? ''))
    .map(([name]) => name);
}

/**
 * Why a prerendered page's policy does not hold (hardening HR-W#3b), or null: an enforced policy
 * with `frame-ancestors 'none'` and no report only twin, whose nonce is the page's one value.
 */
function staticCspProblem(r) {
  const csp = r.headers['content-security-policy'];
  if (typeof csp !== 'string') return 'no enforced policy';
  if ('content-security-policy-report-only' in r.headers) return 'a report only policy beside it';
  if (!/(?:^|;)\s*frame-ancestors 'none'(?:;|$)/.test(csp)) return "no frame-ancestors 'none'";
  const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(csp)?.[1];
  if (nonce === undefined) return 'no nonce in the policy';
  const values = new Set([...r.text.matchAll(/\snonce="([^"]*)"/g)].map((m) => m[1]));
  if (values.size === 0) return 'no nonce on the page';
  if (values.size > 1 || !values.has(nonce)) {
    return `the page's ${values.size} nonce value(s) are not the policy's`;
  }
  return null;
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
      expect: `the headers of 8.8${https ? ' with HSTS' : ''}, X-Frame-Options DENY, a CSP with worker-src blob:`,
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
  /* HR-W#2 (WEB-3): the document routes enforce the policy. A report only policy there is the way
     back (TURBOSLIDE_CSP=report) and reads red here, so the switch back is never silent */
  rows.push({
    name: `csp enforced /deck/${deck}`,
    path: `/deck/${deck}`,
    expect: 'content-security-policy with a nonce, and no content-security-policy-report-only',
    pass: (r) =>
      /'nonce-[A-Za-z0-9+/=]+'/.test(r.headers['content-security-policy'] ?? '') &&
      !('content-security-policy-report-only' in r.headers),
    detail: (r) =>
      `${'content-security-policy' in r.headers ? 'enforced' : 'no enforced policy'}; ${'content-security-policy-report-only' in r.headers ? 'report only present' : 'no report only policy'}`,
  });
  /* the router matches a route without regard to case, so /Deck/<deck> renders the viewer too:
     the same enforced policy, or a link with changed letters skips it (HR-W#2, verifier F1) */
  rows.push({
    name: `csp enforced /Deck/${deck}`,
    path: `/Deck/${deck}`,
    expect: 'the policy of /deck/<deck> on the path with changed case: enforced with a nonce',
    pass: (r) =>
      /'nonce-[A-Za-z0-9+/=]+'/.test(r.headers['content-security-policy'] ?? '') &&
      !('content-security-policy-report-only' in r.headers),
    detail: (r) =>
      `${r.status}; ${'content-security-policy' in r.headers ? 'enforced' : 'no enforced policy'}; ${'content-security-policy-report-only' in r.headers ? 'report only present' : 'no report only policy'}`,
  });
  /* the Kelvin sign U+212A lower cases to k, so /dec<U+212A>/<deck> renders the viewer as well; the
     middleware receives it percent encoded and decodes it before the case (verifier pass 2, N1) */
  rows.push({
    name: `csp enforced /dec%E2%84%AA/${deck}`,
    path: `/dec%E2%84%AA/${deck}`,
    expect: 'the policy of /deck/<deck> on the path with the Kelvin sign: enforced with a nonce',
    pass: (r) =>
      /'nonce-[A-Za-z0-9+/=]+'/.test(r.headers['content-security-policy'] ?? '') &&
      !('content-security-policy-report-only' in r.headers),
    detail: (r) =>
      `${r.status}; ${'content-security-policy' in r.headers ? 'enforced' : 'no enforced policy'}; ${'content-security-policy-report-only' in r.headers ? 'report only present' : 'no report only policy'}`,
  });
  /* HR-W#3a (SPEC-1, WEB-4): the CDN answers the prerendered pages before the function runs, so
     their headers are the route rules'; /home/ is the same file under the screenshots' folder on
     Vercel, and a node server answers it with the app's redirect to /home, which carries them too */
  for (const path of ['/home', '/home/', '/docs']) {
    const answered = (r) =>
      r.status === 200 ||
      (path.endsWith('/') &&
        [301, 302, 307, 308].includes(r.status) &&
        r.headers.location === path.slice(0, -1));
    rows.push({
      name: `static headers ${path}`,
      path,
      expect: `a 200 page${path.endsWith('/') ? ' (or a redirect to the path without the slash)' : ''} with nosniff, X-Frame-Options DENY, COOP, the referrer and permissions policies${https ? ' and the long HSTS' : ''}`,
      pass: (r) => answered(r) && missingStaticHeaders(r, https).length === 0,
      detail: (r) => {
        const missing = missingStaticHeaders(r, https);
        return `${r.status}; ${missing.length === 0 ? 'every header' : `missing ${missing.join(', ')}`}; x-frame-options ${r.headers['x-frame-options'] ?? 'none'}; ${r.headers['x-vercel-cache'] ? `x-vercel-cache ${r.headers['x-vercel-cache']}` : 'no cache header'}`;
      },
    });
  }
  /* HR-W#3b (SPEC-1, CRIT-W5): the prerendered pages enforce the policy, framed by no site, and
     every tag the page trusts carries the nonce the policy names */
  for (const path of ['/home', '/docs']) {
    rows.push({
      name: `static csp ${path}`,
      path,
      expect:
        "a 200 page with an enforced policy, frame-ancestors 'none', and the policy's nonce on every nonced tag",
      pass: (r) => r.status === 200 && staticCspProblem(r) === null,
      detail: (r) => {
        const nonces = new Set([...r.text.matchAll(/\snonce="([^"]*)"/g)].map((m) => m[1]));
        return `${r.status}; ${staticCspProblem(r) ?? "enforced, the page's nonce"}; ${nonces.size} nonce value(s) on the page`;
      },
    });
  }
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
  /* security hotfix H3 (DATA-1): every deployment enforces, so the shadow answers this row once
     accepted (a 200, or a 302 to the stored object, served and logged) are failures now: the
     probe's request carries no cookie and no grant */
  rows.push({
    name: 'unsigned thumbnail',
    path: `/api/render/title?deck=${encodeURIComponent(deck)}&theme=light&w=160`,
    expect:
      '403 (or 401 for a caller with no identity) without the grant (SPEC-3 8.13; enforced on every deployment since H3), or 404 for a deck without that slide',
    pass: (r) => r.status === 403 || r.status === 401 || r.status === 404,
    detail: (r) =>
      r.status === 403 || r.status === 401
        ? `refused without the grant (${r.status})`
        : r.status === 404
          ? 'no such slide'
          : r.status === 302
            ? `served without the grant: the stored object (${r.location.replace(/\?.*$/, '').slice(0, 72)})`
            : `served without the grant (${r.status})`,
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
  /* hardening PS#9 (PERF-14): the contracts are static files and a request that is not a document
     load or a server function mints no identity cookie, so the CDN keeps the answer */
  for (const path of ['/llms.txt', '/llms-full.txt', '/openapi.json']) {
    rows.push({
      name: `no cookie on contracts ${path}`,
      path,
      expect: '200 with no identity cookie',
      pass: (r) => r.status === 200 && r.cookie === '',
      detail: (r) => `${r.status}${r.cookie === '' ? '' : ', a cookie minted'}`,
    });
  }
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
 * The smoke's own identity and the `access answer reads enforce` row (hardening HR-SD#5, PS#9):
 * the deck's page, loaded as a browser loads a document, mints the anonymous principal cookie the
 * thumbnail rows then send, so they ask as a person, the way a page's `<img>` does, and not as a
 * caller with no identity, whom every deployment refuses. Since PS#9 only a document load or a
 * server function mints that cookie (server/auth/middleware.ts `mintsIdentityCookie`), so the
 * access route answers with no cookie, and its answer names the deployment's authorization mode,
 * always `enforce` since H3.
 */
async function accessRow(base, deck, timeoutMs) {
  const path = `/api/access/${encodeURIComponent(deck)}`;
  // the document load a browser visit starts with: the one request that mints the identity cookie
  const page = await probe(base, `/deck/${encodeURIComponent(deck)}`, timeoutMs, {
    headers: { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate', accept: 'text/html' },
  });
  // the page's own fetch: the CSRF rule of the access route reads Sec-Fetch-Site and Origin
  const r = await probe(base, path, timeoutMs, {
    headers: {
      'sec-fetch-site': 'same-origin',
      origin: new URL(base).origin,
      ...(page.cookie === '' ? {} : { cookie: page.cookie }),
    },
  });
  let mode = null;
  try {
    mode = JSON.parse(r.text)?.authorize ?? null;
  } catch {
    // not JSON: the status says what happened
  }
  return {
    cookie: page.cookie,
    result: {
      row: {
        name: 'access answer reads enforce',
        expect: `/deck/${deck} as a document mints an identity cookie, and /api/access/${deck} answers 200 with authorize: 'enforce' and no cookie`,
        detail: () =>
          `page ${page.status}, ${page.cookie === '' ? 'no identity cookie' : 'identity cookie minted'}; access ${r.status}; authorize ${mode ?? 'absent'}; ${r.cookie === '' ? 'no cookie' : 'a cookie minted'}`,
      },
      r,
      ok:
        r.error === undefined &&
        r.status === 200 &&
        mode === 'enforce' &&
        page.cookie !== '' &&
        r.cookie === '',
    },
  };
}

/** True for a `cache-control` value no shared cache may keep. */
const isPrivateNoStore = (value) =>
  /\bprivate\b/.test(value ?? '') && /\bno-store\b/.test(value ?? '');

/**
 * True for a value only the reader's own browser may keep: `private` and no shared cache rule. A
 * stamped answer of the current pixels is kept that way since the HR-SD#5 fix (a body a year, a
 * 302 to the stored object an hour).
 */
const isPrivateOnly = (value) =>
  /\bprivate\b/.test(value ?? '') && !/\bpublic\b|s-maxage/.test(value ?? '');

/**
 * The thumbnail cache (SPEC-4 0.31; b4.md R11; hardening HR-SD#5, CRIT-M2), asked with the
 * smoke's own identity cookie on the open seed deck: who may keep an answer follows the reader's
 * standing, and a stranger reaches the open deck through its general access (`via: 'open'`), so
 * the public rules hold. Without `r`, the newest stored thumbnail with the stamp: a 200 body with
 * `public, s-maxage=60, stale-while-revalidate=86400` (a local server; the CDN rewrites it on
 * https), or a 302 to the stored object on a public store, which is `private, no-store` for
 * every reader since HR-SD#5. With `r=<stamp>` twice: the second answer a 200 body immutable for
 * a year (a CDN hit on https), or a private 302 (an hour in the reader's browser since the HR-SD#5
 * fix).
 */
async function thumbnailRows(base, deck, timeoutMs, cookie) {
  const https = base.startsWith('https:');
  const slide = firstSlideId(deck);
  const path = `/api/render/${encodeURIComponent(slide)}?deck=${encodeURIComponent(deck)}&theme=dark&w=320`;
  const init = cookie === '' ? {} : { headers: { cookie } };
  const plain = await probe(base, path, timeoutMs, init);
  const stamp = plain.headers['x-turboslide-stamp'] ?? null;
  const rows = [];
  const storedRedirect = (r, rule = isPrivateNoStore) =>
    r.status === 302 &&
    /\.blob\.vercel-storage\.com\//.test(r.location) &&
    rule(r.headers['cache-control']);
  const where = (r) =>
    `${r.status}${r.status === 302 ? ` -> ${r.location.replace(/\?.*$/, '').slice(0, 60)}` : ''}; ${r.headers['cache-control'] ?? 'no cache-control'}; ${r.headers['x-vercel-cache'] ?? 'no CDN'}${r.headers['set-cookie'] ? '; set-cookie present (the CDN does not cache it)' : ''}`;
  rows.push({
    row: {
      name: 'thumbnail without r',
      expect:
        'with the identity cookie: a 200 body with x-turboslide-stamp and, on a local server, public, s-maxage=60, stale-while-revalidate=86400, or a 302 to the stored object with private, no-store',
      detail: () =>
        cookie === ''
          ? `no identity cookie from the deck page: ${plain.status}`
          : `${where(plain)}; stamp ${stamp ?? 'none'}; source ${plain.headers['x-turboslide-source'] ?? '-'}; fresh ${plain.headers['x-turboslide-fresh'] ?? '-'}`,
    },
    r: plain,
    ok:
      plain.error === undefined &&
      cookie !== '' &&
      stamp !== null &&
      (storedRedirect(plain) ||
        (plain.status === 200 &&
          // the exact header on a local server; a Vercel deployment's CDN rewrites cache-control
          // on the way out (s-maxage and stale-while-revalidate are the CDN's, the client sees
          // `public` or `public, max-age=0, must-revalidate`), so on https the row asserts the
          // stamp and records the header and x-vercel-cache as the CDN returned them
          (https ||
            /public, s-maxage=60, stale-while-revalidate=86400/.test(
              plain.headers['cache-control'] ?? '',
            )))),
  });
  if (stamp === null) {
    rows.push({
      row: {
        name: 'thumbnail with r twice',
        expect: 'a stamp from the row above',
        detail: () => 'no stamp to request',
      },
      r: plain,
      ok: false,
    });
    return rows;
  }
  const stamped = `${path}&r=${encodeURIComponent(stamp)}`;
  const first = await probe(base, stamped, timeoutMs, init);
  const second = await probe(base, stamped, timeoutMs, init);
  const cache = second.headers['x-vercel-cache'] ?? null;
  const body = second.status === 200 && second.type.startsWith('image/');
  const immutable = /max-age=31536000, immutable/.test(second.headers['cache-control'] ?? '');
  rows.push({
    row: {
      name: 'thumbnail with r twice',
      expect:
        'with the identity cookie on the open deck: the second answer a 200 body immutable for a year (x-vercel-cache HIT on https), or a 302 to the stored object that is private',
      detail: () =>
        `first ${first.status} ${first.headers['x-vercel-cache'] ?? '-'} ${first.headers['x-turboslide-source'] ?? ''}; second ${where(second)} ${second.headers['x-turboslide-source'] ?? ''}`,
    },
    r: second,
    ok:
      second.error === undefined &&
      (storedRedirect(second, isPrivateOnly) || (body && immutable && (!https || cache === 'HIT'))),
  });
  return rows;
}

/**
 * The link card (GF-2.1, apps/studio/src/routes/-deck-card.ts): the open seed deck's page, read
 * with no cookie as an unfurler reads it, names its first slide at 1200 by 675 on the render route
 * in `og:image`, and that picture answers a request with no cookie: a 200 PNG whose
 * `x-turboslide-thumb` says 1200x675, or a 302 to the stored object carrying the same header.
 */
async function deckCardRow(base, deck, timeoutMs) {
  const page = await probe(base, `/deck/${encodeURIComponent(deck)}`, timeoutMs);
  const tag = /<meta\b[^>]*\sproperty="og:image"[^>]*>/.exec(page.text)?.[0] ?? '';
  const image = (/\scontent="([^"]*)"/.exec(tag)?.[1] ?? '').replace(/&amp;/g, '&');
  let path = null;
  try {
    const at = new URL(image);
    if (
      at.pathname.startsWith('/api/render/') &&
      at.searchParams.get('deck') === deck &&
      at.searchParams.get('w') === '1200'
    )
      path = `${at.pathname}${at.search}`;
  } catch {
    // no URL in the tag: the row fails below with what the page named
  }
  const picture = path === null ? null : await probe(base, path, timeoutMs);
  const sized = picture?.headers['x-turboslide-thumb'] === '1200x675';
  const served =
    picture !== null &&
    sized &&
    ((picture.status === 200 && picture.type.startsWith('image/png')) ||
      (picture.status === 302 && /\.blob\.vercel-storage\.com\//.test(picture.location)));
  return {
    row: {
      name: 'deck card first slide',
      expect: `/deck/${deck} without a cookie names /api/render/<first slide>?deck=${deck}&w=1200 in og:image, and the picture answers without a cookie: a 200 image/png or a 302 to the stored object, x-turboslide-thumb 1200x675`,
      detail: () =>
        picture === null
          ? `page ${page.status}; og:image ${image === '' ? 'absent' : image.slice(0, 120)}`
          : `og:image ${path}; picture ${picture.status} ${picture.type || picture.location.replace(/\?.*$/, '').slice(0, 60)}; ${picture.headers['x-turboslide-thumb'] ?? 'no size'}; ${picture.headers['cache-control'] ?? 'no cache-control'}`,
    },
    r: picture ?? page,
    ok: page.error === undefined && picture !== null && picture.error === undefined && served,
  };
}

/**
 * The smoke's scratch deck (hardening HR-SD#5; the rows of K1 and SD#6 use the same deck): one
 * blank deck made with the bearer through `deck.create`, restricted to its creator as every new
 * deck is, and removed forever at the end of the run (`removeScratchDeck`), so the store is as it
 * was. Its id and first slide come from `deck.info`.
 */
async function createScratchDeck(base, headers) {
  const created = await postJson(
    base,
    '/api/actions/deck.create',
    { name: 'Smoke scratch deck', from: 'blank' },
    headers,
    120_000,
  );
  const id = created.json?.deckId ?? created.json?.output?.deckId ?? null;
  if (created.status !== 200 || typeof id !== 'string') {
    return {
      id: null,
      slide: null,
      detail: `deck.create ${created.status}: ${created.text.slice(0, 160)}`,
    };
  }
  const info = await postJson(
    base,
    `/api/actions/deck.info?deck=${encodeURIComponent(id)}`,
    {},
    headers,
    60_000,
  );
  const slide = info.json?.sections?.[0]?.slides?.[0]?.id ?? null;
  return {
    id,
    slide: typeof slide === 'string' ? slide : null,
    detail: `made ${id} in ${created.ms} ms`,
  };
}

/** `deck.trash`, then `deck.remove`, each with the revision `deck.info` names; then `deck.info` answers 404. */
async function removeScratchDeck(base, scratch, headers) {
  const t = performance.now();
  const info = (deck) =>
    postJson(base, `/api/actions/deck.info?deck=${encodeURIComponent(deck)}`, {}, headers, 60_000);
  const revisionOf = (json) => json?.revision ?? json?.output?.revision ?? null;
  const before = await info(scratch.id);
  const trashed = await postJson(
    base,
    `/api/actions/deck.trash?deck=${encodeURIComponent(scratch.id)}`,
    { id: scratch.id, baseRevision: revisionOf(before.json) },
    headers,
    60_000,
  );
  const after = await info(scratch.id);
  const removed = await postJson(
    base,
    `/api/actions/deck.remove?deck=${encodeURIComponent(scratch.id)}`,
    {
      id: scratch.id,
      confirm: true,
      baseRevision: revisionOf(after.json) ?? revisionOf(before.json),
    },
    headers,
    60_000,
  );
  const gone = await info(scratch.id);
  return {
    row: {
      name: 'scratch deck removed',
      expect: 'deck.trash and deck.remove 200, then deck.info 404',
      detail: () =>
        `${scratch.id}: trash ${trashed.status}, remove ${removed.status}, deck.info after ${gone.status}${gone.status === 404 ? '' : ' (left in place for a hand cleanup)'}`,
    },
    r: { status: gone.status, ms: Math.round(performance.now() - t) },
    ok: trashed.status === 200 && removed.status === 200 && gone.status === 404,
  };
}

/** The public store's host the deployment names in its policy's `img-src`, or null (a tmp store). */
async function publicStoreHostOf(base, timeoutMs) {
  const r = await probe(base, '/decks', timeoutMs);
  return (
    /img-src[^;]*https:\/\/([a-z0-9.-]+\.public\.blob\.vercel-storage\.com)/.exec(cspOf(r))?.[1] ??
    null
  );
}

/**
 * One object on the public store's host, read with none of the deployment's headers, so the
 * protection token never goes to the store. The status, the type and the time; the body is left
 * unread.
 */
async function storeProbe(host, pathname, timeoutMs) {
  const started = performance.now();
  try {
    const response = await fetch(`https://${host}/${pathname}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.body?.cancel();
    return {
      status: response.status,
      type: response.headers.get('content-type') ?? '',
      ms: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      status: 0,
      type: '',
      ms: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** No object at the path: 404, Vercel Blob's answer for a missing object, or 403. */
const noPublicCopy = (r) => r.error === undefined && (r.status === 403 || r.status === 404);

/** The store folder of a principal id (`principalFolder`, packages/store/src/access-store.ts). */
const principalFolder = (id) => id.replace(/[^A-Za-z0-9_-]/g, '_');

/** The key derived from a deck id (`legacyAssetKey`, packages/schema/src/access.ts). */
function legacyAssetKey(deckId) {
  const base = deckId.replace(/[^A-Za-z0-9_-]/g, '-');
  return `${base}${'0'.repeat(22)}`.slice(0, 22);
}

const PRIVATE_STORE_ROWS = [
  'private document 403',
  'twin URL not derivable',
  'principal index private',
];

/**
 * The private store rows (hardening HR-K1#6; DATA-2, DATA-V2, CRIT-M15), required since
 * production's cutover and its `delete` (docs/hosting.md 10.4). Each reads the public store's host,
 * which the deployment names in its policy's `img-src`, through `storeProbe`:
 *
 * - `private document 403`: the smoke's own scratch deck, restricted to its creator, has its
 *   `deck.json` and its `access.json` (which holds the asset key) on the deployment's store and
 *   neither on the public host. The open seed deck is not read: a stray client that shares the
 *   public store could put it back, and it leaks nothing.
 * - `twin URL not derivable`: the scratch deck's asset key is not the one its id derives
 *   (`legacyAssetKey`), and the picture `asset by name 404` added answers 200 at
 *   `d/<id>/<assetKey>/assets/<file>` and 403 or 404 both at `decks/<id>/assets/<file>` and under
 *   the derived key, the two addresses its deck id and file name make.
 * - `principal index private`: a principal whose `users/<id>/decks.json` exists answers 403 or 404
 *   there. The row first proves the index exists through the deployment: `account.decks` with
 *   `view: 'shared'` reads that index alone, so a row in its answer is an index. The principal is
 *   the bearer's, or the account key's `--index-token-env` names; the static bearer
 *   (`agent:bootstrap`) has no index, and with no index proven the row is skipped by name.
 *
 * Neither the asset key nor the principal id is printed. A local server's tmp store has no public
 * store, so off https the rows are skipped by name; on https a deployment that names no public
 * store fails them.
 */
async function privateStoreRows(base, scratch, picture, index, timeoutMs) {
  if (!base.startsWith('https:')) {
    return {
      skip: PRIVATE_STORE_ROWS.map(
        (name) => `${name}: the public store is the blob store's; a local tmp store has none`,
      ),
    };
  }
  const failed = (name, expect, detail) => ({
    row: { name, expect, detail: () => detail },
    r: { status: '-', ms: 0 },
    ok: false,
  });
  // the two rows that read the scratch deck fail without it or the store; the index row proves
  // nothing then, so it is skipped by name, never failed or passed
  const [documentsRow, twinRow, indexRow] = PRIVATE_STORE_ROWS;
  const host = await publicStoreHostOf(base, timeoutMs);
  if (host === null) {
    return {
      rows: [documentsRow, twinRow].map((name) =>
        failed(name, "a public store in the policy's img-src", 'no public store named'),
      ),
      skip: [`${indexRow}: the deployment names no public store in its policy's img-src`],
    };
  }
  if (scratch.id === null) {
    return {
      rows: [documentsRow, twinRow].map((name) => failed(name, 'a scratch deck', scratch.detail)),
      skip: [`${indexRow}: no scratch deck, so the private store rows did not run`],
    };
  }
  const id = encodeURIComponent(scratch.id);
  const [manifest, record] = await Promise.all([
    storeProbe(host, `decks/${id}/deck.json`, timeoutMs),
    storeProbe(host, `decks/${id}/access.json`, timeoutMs),
  ]);
  const documents = {
    row: {
      name: 'private document 403',
      expect: "the scratch deck's deck.json and access.json on the public store 403 or 404",
      detail: () =>
        `scratch deck.json ${manifest.error ?? manifest.status}; access.json ${record.error ?? record.status}`,
    },
    r: noPublicCopy(manifest) ? record : manifest,
    ok: noPublicCopy(manifest) && noPublicCopy(record),
  };

  let twin;
  if (picture === null) {
    twin = failed(
      'twin URL not derivable',
      "the scratch deck's picture",
      'no picture: asset by name 404 added none',
    );
  } else {
    const file = picture.file.split('/').map(encodeURIComponent).join('/');
    const derived = legacyAssetKey(scratch.id);
    const ownKey = picture.key !== derived;
    const [byKey, byName, byDerived] = await Promise.all([
      storeProbe(host, `d/${id}/${encodeURIComponent(picture.key)}/assets/${file}`, timeoutMs),
      storeProbe(host, `decks/${id}/assets/${file}`, timeoutMs),
      storeProbe(host, `d/${id}/${encodeURIComponent(derived)}/assets/${file}`, timeoutMs),
    ]);
    twin = {
      row: {
        name: 'twin URL not derivable',
        expect:
          "the scratch deck's asset key not the one its id derives; its picture on the public store under the key a 200 image, at decks/<id>/assets/<file> and under the derived key 403 or 404",
        // pass or fail for the key comparison, never the key
        detail: () =>
          `own key ${ownKey ? 'pass' : 'FAIL'}; by key ${byKey.error ?? `${byKey.status} ${byKey.type}`}; by name ${byName.error ?? byName.status}; by derived key ${byDerived.error ?? byDerived.status}`,
      },
      r: noPublicCopy(byName) ? byDerived : byName,
      ok:
        ownKey &&
        byKey.error === undefined &&
        byKey.status === 200 &&
        byKey.type.startsWith('image/') &&
        noPublicCopy(byName) &&
        noPublicCopy(byDerived),
    };
  }

  const own = await principalIndexRow(base, host, index, timeoutMs);
  return {
    rows: [documents, twin, ...(own.skip === undefined ? [own] : [])],
    skip: own.skip === undefined ? [] : [own.skip],
  };
}

/**
 * `principal index private` (see `privateStoreRows`): skipped by name unless `account.decks`
 * proves the caller's index exists; then its public address answers 403 or 404. Never passes on an
 * index nobody wrote.
 */
async function principalIndexRow(base, host, index, timeoutMs) {
  const name = 'principal index private';
  if (index.headers === undefined) return { skip: `${name}: ${index.unset} is not set` };
  const indexHeaders = index.headers;
  const me = await postJson(base, '/api/actions/account.me', {}, indexHeaders, 60_000);
  const principal = me.json?.principal ?? me.json?.output?.principal ?? null;
  if (me.status !== 200 || typeof principal?.id !== 'string') {
    return {
      row: {
        name,
        expect: 'account.me names a principal',
        detail: () => `account.me ${me.status}`,
      },
      r: { status: me.status, ms: me.ms },
      ok: false,
    };
  }
  // `account.decks` reads the index of the request's principal id, which a static agent lacks
  if (principal.id.startsWith('agent:'))
    return {
      skip: `${name}: the bearer is a static agent with no principal index; pass --index-token-env <VAR> with an account key whose index holds a link grant`,
    };
  const shared = await postJson(
    base,
    '/api/actions/account.decks',
    { view: 'shared' },
    indexHeaders,
    60_000,
  );
  const heads = Array.isArray(shared.json)
    ? shared.json
    : Array.isArray(shared.json?.output)
      ? shared.json.output
      : null;
  if (shared.status !== 200 || heads === null) {
    return {
      row: {
        name,
        expect: 'account.decks answers the shared view',
        detail: () => `account.decks ${shared.status}`,
      },
      r: { status: shared.status, ms: shared.ms },
      ok: false,
    };
  }
  if (heads.length === 0)
    return {
      skip: `${name}: no principal index proven (account.decks shared answered 0 rows for the ${principal.kind ?? 'principal'}); pass --index-token-env <VAR> with an account key whose index holds a link grant`,
    };
  const probed = await storeProbe(
    host,
    `users/${principalFolder(principal.id)}/decks.json`,
    timeoutMs,
  );
  return {
    row: {
      name,
      expect:
        'a principal index the deployment reads (account.decks shared answers a row); its users/<id>/decks.json on the public store 403 or 404',
      detail: () =>
        `${principal.kind ?? 'principal'} index with ${heads.length} shared decks; users/<id>/decks.json ${probed.error ?? probed.status}`,
    },
    r: probed,
    ok: noPublicCopy(probed),
  };
}

/**
 * `export URL signed` (hardening HR-K1#5a; CRIT-M4, DATA-3): the scratch deck exported as a one
 * theme PDF through `/api/export/<deck>?sync=1&format=json` with the bearer. On a deployment the
 * file is stored and its link is the download route's, `/api/download/s.<token>`, never the
 * store's address; on a server without stored copies the link is the instance's own export route.
 * Either way no answer names a store host. The first stored link (else the instance's) is read
 * back with the bearer and answers 200 `application/pdf` with bytes (HR-K1#6, the review's
 * finding 7): on layout v2 that read comes from the private store, so a deployment that cannot
 * read its own store fails here. (The web page build's link is a server function's answer, which
 * the smoke does not call; stored-files.test.ts pins it.)
 */
async function exportLinkRow(base, scratch, headers) {
  const name = 'export URL signed';
  if (scratch.id === null) {
    return {
      row: { name, expect: 'a scratch deck', detail: () => scratch.detail },
      r: { status: '-', ms: 0 },
      ok: false,
    };
  }
  const answer = await postJson(
    base,
    `/api/export/${encodeURIComponent(scratch.id)}?sync=1&format=json`,
    { format: 'pdf', theme: ['light'] },
    headers,
    EXPORT_TIMEOUT_MS,
  );
  const files = Array.isArray(answer.json?.files) ? answer.json.files : [];
  const links = files.map((file) => ({ url: file?.url, stored: file?.stored === true }));
  const routed = (link) =>
    typeof link.url === 'string' &&
    !/blob\.vercel-storage\.com|^https?:/i.test(link.url) &&
    (link.stored
      ? link.url.startsWith('/api/download/')
      : /^\/api\/(download|export)\//.test(link.url));
  // the first stored file read back through its link with the bearer (the token is minted for the
  // same principal), so the row reads a stored file from the deployment's store, the private one
  // on layout v2; a server without stored copies serves the instance's link. The link's token is
  // never printed
  const first =
    links.find((link) => link.stored && routed(link)) ?? links.find((link) => routed(link)) ?? null;
  const fetched =
    first === null ? null : await probe(base, first.url, EXPORT_TIMEOUT_MS, { headers });
  const readBack =
    fetched !== null &&
    fetched.error === undefined &&
    fetched.status === 200 &&
    fetched.type.startsWith('application/pdf') &&
    fetched.bytes > 0;
  const redact = (url) =>
    String(url)
      .replace(/s\.[A-Za-z0-9_-]+\.[0-9a-f]+$/, 's.<token>')
      .slice(0, 80);
  return {
    row: {
      name,
      expect:
        "the scratch deck's export answer: every file's link names /api/download/ (a stored copy) or the instance's export route, and no store host; the first stored link read with the bearer 200 application/pdf with bytes",
      detail: () =>
        answer.status !== 200
          ? `${answer.status}: ${answer.text.slice(0, 160)}`
          : `${
              links
                .map((link) => `${link.stored ? 'stored' : 'instance'} ${redact(link.url)}`)
                .join('; ') || 'no files'
            }; ${
              fetched === null
                ? 'no link to read'
                : `read ${first?.stored ? 'stored' : 'instance'} ${fetched.error ?? `${fetched.status} ${fetched.type} ${fetched.bytes} bytes`}`
            }`,
    },
    r: fetched ?? { status: answer.status, ms: answer.ms },
    ok: answer.status === 200 && links.length > 0 && links.every(routed) && readBack,
  };
}

/**
 * `restricted thumbnail private` (hardening HR-SD#5, CRIT-M2): the scratch deck is restricted, so
 * its thumbnail, asked with the bearer and no grant in the URL, answers `private, no-store`, and
 * no shared cache keeps it for the next requester of the URL. The request names no stamp, so the
 * route renders the slide now; an answer still rendering (204) is asked again, at most four times.
 * The same URL with that answer's stamp (`r`, as a card on /decks asks) may be kept by the
 * reader's browser alone: `private` and no shared cache rule, never `public`.
 */
async function restrictedThumbnailRow(base, scratch, headers, timeoutMs) {
  const name = 'restricted thumbnail private';
  if (scratch.id === null || scratch.slide === null) {
    return {
      row: { name, expect: 'a scratch deck', detail: () => scratch.detail },
      r: { status: '-', ms: 0 },
      ok: false,
    };
  }
  const path = `/api/render/${encodeURIComponent(scratch.slide)}?deck=${encodeURIComponent(scratch.id)}&theme=light&w=160`;
  const answers = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 5_000));
    const r = await probe(base, path, Math.max(timeoutMs, 90_000), { headers });
    answers.push(r);
    if (r.status !== 204) break;
  }
  const last = answers[answers.length - 1];
  const picture = last.status === 200 || last.status === 302;
  const stamp = last.headers['x-turboslide-stamp'] ?? null;
  const stamped =
    picture && stamp !== null
      ? await probe(base, `${path}&r=${encodeURIComponent(stamp)}`, Math.max(timeoutMs, 90_000), {
          headers,
        })
      : null;
  return {
    row: {
      name,
      expect:
        "the restricted scratch deck's thumbnail, with the bearer and no grant: a 200 body or a 302 with private, no-store, and with its stamp a private answer; no answer public",
      detail: () =>
        `${answers.map((r) => `${r.status} ${r.headers['cache-control'] ?? 'no cache-control'}`).join('; ')}; with r ${stamped === null ? 'not asked (no stamp)' : `${stamped.status} ${stamped.headers['cache-control'] ?? 'no cache-control'}`}`,
    },
    r: last,
    ok:
      last.error === undefined &&
      picture &&
      answers.every(
        (r) => ![200, 204, 302].includes(r.status) || isPrivateNoStore(r.headers['cache-control']),
      ) &&
      (stamped === null ||
        (stamped.error === undefined &&
          (![200, 204, 302].includes(stamped.status) ||
            isPrivateOnly(stamped.headers['cache-control'])))),
  };
}

/** A 16 px square PNG, the picture the smoke adds to its scratch deck. */
const SMOKE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVQokWPQqDhBEmIY1VAxGkoawzVpAADDSmgQUucKQgAAAABJRU5ErkJggg==';

/**
 * `asset by name 404` (hardening HR-SD#6, CRIT-M3): a picture added to the scratch deck lives
 * under the deck's own asset key on the blob store, so the assets route answers 404 to a request
 * by its file name with no identity, and the picture, or a 302 to the keyed store path, to a
 * request by `/decks/<id>/assets/<assetKey>/<file>`. A local server's tmp store keeps names, so
 * the row runs against a deployment alone. The key is never printed. The answer carries the
 * picture's file name and key for `twin URL not derivable`.
 */
async function assetByNameRow(base, scratch, headers, timeoutMs) {
  const name = 'asset by name 404';
  if (!base.startsWith('https:'))
    return { skip: `${name}: the keyed twins are the blob store's; a local tmp store keeps names` };
  const failed = (detail) => ({
    row: { name, expect: 'a picture on the scratch deck', detail: () => detail },
    r: { status: '-', ms: 0 },
    ok: false,
  });
  if (scratch.id === null) return failed(scratch.detail);
  const deck = encodeURIComponent(scratch.id);
  const info = await postJson(base, `/api/actions/deck.info?deck=${deck}`, {}, headers, 60_000);
  const added = await postJson(
    base,
    `/api/actions/asset.add?deck=${deck}`,
    {
      id: 'smoke-square',
      file: SMOKE_PNG,
      role: 'mood',
      alt: 'A blue square the smoke adds',
      baseRevision: info.json?.revision ?? info.json?.output?.revision,
    },
    headers,
    120_000,
  );
  const twins = added.json?.twins ?? added.json?.output?.twins ?? {};
  const twin = twins.neutral ?? twins.light ?? null;
  if (added.status !== 200 || typeof twin !== 'string')
    return failed(`asset.add ${added.status}: ${added.text.slice(0, 160)}`);
  const shared = await postJson(
    base,
    `/api/actions/share.get?deck=${deck}`,
    { id: scratch.id },
    headers,
    60_000,
  );
  const key = shared.json?.record?.assetKey ?? shared.json?.output?.record?.assetKey ?? null;
  if (typeof key !== 'string') return failed(`share.get ${shared.status}: no asset key`);
  const file = twin.replace(/^assets\//, '');
  const byName = await probe(base, `/decks/${deck}/assets/${file}`, timeoutMs);
  const byKey = await probe(base, `/decks/${deck}/assets/${key}/${file}`, timeoutMs);
  const keyed = byKey.location.includes(`/d/${scratch.id}/${key}/`);
  const served =
    (byKey.status === 200 && byKey.type.startsWith('image/')) || (byKey.status === 302 && keyed);
  return {
    row: {
      name,
      expect:
        "the scratch deck's picture by its file name with no identity 404, by its key a 200 image or a 302 to the keyed store path",
      detail: () =>
        `by name ${byName.status}${byName.location === '' ? '' : ' with a location'}; by key ${byKey.status}${byKey.status === 302 ? (keyed ? ' to the keyed store path' : ' to another place') : ` ${byKey.type}`}`,
    },
    r: byName,
    ok: byName.error === undefined && byName.status === 404 && byName.location === '' && served,
    // the picture `twin URL not derivable` reads on the public store (HR-K1#6); never printed
    picture: { file, key },
  };
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
 * The build's commit as `/api/agent` reports it (docs/archive/rounds/POLISH.md section 0 items 1 and 2; row
 * `surface.domain.build-commit`): the row fails when the instance block names no commit (a build
 * before the stamp, the stale domain's) and, with `--sha`, when the commit named is not the one
 * served. Off localhost the block needs the bearer; a 401 without one is a skip, never a pass.
 */
async function commitRow(base, headers, timeoutMs, sha) {
  const r = await probe(base, '/api/agent', timeoutMs, { headers });
  let commit = null;
  try {
    const instance = JSON.parse(r.text)?.instance ?? null;
    commit =
      typeof instance?.commit === 'string' && instance.commit !== '' ? instance.commit : null;
  } catch {
    // not JSON
  }
  if (r.status === 401 && headers.authorization === undefined)
    return {
      skip: 'build commit: pass --token-env <VAR> (the row reads /api/agent with the bearer)',
    };
  const wanted = sha === null ? null : sha.trim().toLowerCase();
  const served = commit === null ? null : commit.toLowerCase();
  const same =
    wanted === null || served === null
      ? false
      : served.startsWith(wanted) || wanted.startsWith(served);
  const ok = r.status === 200 && commit !== null && (wanted === null || same);
  return {
    row: {
      name: 'build commit',
      expect:
        wanted === null
          ? 'instance.commit on /api/agent (the stamp of docs/archive/rounds/POLISH.md section 0 item 1)'
          : `instance.commit on /api/agent equal to ${wanted}`,
      detail: () =>
        commit === null
          ? `${r.status}: no instance.commit (${r.text.slice(0, 120).replace(/\s+/g, ' ')})`
          : `serves ${commit}${wanted === null ? '' : same ? ' (the commit named)' : `, not ${wanted}`}`,
    },
    r,
    ok,
  };
}

/** The marks of the one row only the current build draws: Tools > Preferences > Play shaders (docs/archive/rounds/FEATURES.md 5.6; docs/NEXT.md 4.1.3 item 20). */
const PLAY_SHADERS_MARKS = ['tools.preferences.playShaders', 'Play animated patterns'];
/** The module graph walk's bounds: modules fetched and bytes read before the row gives up. */
const GRAPH_MODULES = 400;
const GRAPH_BYTES = 40 * 1024 * 1024;

/** A text body from the origin whatever its content type (the JS modules the shell loads). */
async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: protectionHeaders(),
    });
    return { status: response.status, text: response.status === 200 ? await response.text() : '' };
  } catch (error) {
    return { status: 0, text: '', error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/** The module specifiers a JS module imports, static and dynamic, as written. */
function importsOf(source) {
  const out = new Set();
  const patterns = [
    /\bfrom\s*["']([^"'\n]+)["']/g,
    /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
    /\bimport\s*["']([^"'\n]+)["']/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) out.add(match[1]);
  }
  return [...out];
}

/**
 * Whether the client the shell loads carries the marks: the shell's scripts and module preloads,
 * then the graph they import, breadth first, until a module carries every mark or the bounds are
 * met. A Vite dev server serves no bundle (the shell's entry is `/@id/…`), so there the menu model
 * is read through `/@fs/` from the checkout beside this script.
 */
async function playShadersRow(base, timeoutMs) {
  const shell = await probe(base, '/new', timeoutMs);
  const roots = [];
  for (const match of shell.text.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) roots.push(match[1]);
  for (const match of shell.text.matchAll(/<link[^>]*rel="modulepreload"[^>]*\shref="([^"]+)"/g))
    roots.push(match[1]);
  const origin = new URL(base).origin;
  const devServer = roots.some((src) => src.startsWith('/@id/') || src.startsWith('/@vite/'));
  let found = null;
  let visited = 0;
  let bytes = 0;
  let note = '';
  const carries = (text) => PLAY_SHADERS_MARKS.every((m) => text.includes(m));
  if (devServer) {
    const model = `${origin}/@fs${join(ROOT, 'packages', 'chrome', 'src', 'menus', 'model.ts')}`;
    const r = await fetchText(model, timeoutMs);
    visited = 1;
    bytes = r.text.length;
    if (r.status === 200 && carries(r.text)) found = 'packages/chrome/src/menus/model.ts';
    note = `dev server: the menu model read through /@fs (${r.status})`;
  } else {
    const queue = roots
      .map((src) => new URL(src, `${origin}/`).toString())
      .filter((url) => url.startsWith(origin));
    const seen = new Set(queue);
    while (queue.length > 0 && found === null && visited < GRAPH_MODULES && bytes < GRAPH_BYTES) {
      const url = queue.shift();
      const r = await fetchText(url, timeoutMs);
      visited += 1;
      bytes += r.text.length;
      if (r.status !== 200) continue;
      if (carries(r.text)) {
        found = new URL(url).pathname;
        break;
      }
      for (const spec of importsOf(r.text)) {
        if (!/^(\.|\/)/.test(spec)) continue;
        const next = new URL(spec, url).toString();
        if (!next.startsWith(origin) || seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    note = `${visited} module${visited === 1 ? '' : 's'} read from ${roots.length} shell script${roots.length === 1 ? '' : 's'}, ${Math.round(bytes / 1024)} KB`;
  }
  return {
    row: {
      name: 'Tools > Preferences > Play animated patterns',
      expect:
        'the served client carries tools.preferences.playShaders and "Play animated patterns" (the current build)',
      detail: () => (found === null ? `not found; ${note}` : `in ${found}; ${note}`),
    },
    r: { status: shell.status, ms: shell.ms },
    ok: shell.status === 200 && found !== null,
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

/** The rows that need a flag: listed as skipped with the flag that turns them on. */
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
      'usage: node scripts/hosted-smoke.mjs <url> [--deck gt-brand] [--asset <file>] [--timeout <ms>] [--sha <commit>] [--token-env <VAR>] [--index-token-env <VAR>]',
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
  // the round four rows without a bearer: the static layer twice, the thumbnail cache, asked with
  // the identity cookie the deck page mints (hardening HR-SD#5, PS#9)
  results.push(...(await cdnRows(base, args.timeoutMs)));
  const access = await accessRow(base, args.deck, args.timeoutMs);
  results.push(access.result);
  results.push(...(await thumbnailRows(base, args.deck, args.timeoutMs, access.cookie)));
  // the link card (GF-2.1): the open deck's first slide, read with no cookie
  results.push(await deckCardRow(base, args.deck, args.timeoutMs));
  // the round two rows, with the bearer (SPEC-2 8.1, 8.2)
  const headers = bearerHeaders(args.tokenEnv);
  // the polish round's build rows (docs/archive/rounds/POLISH.md section 0 item 2): the client's Play shaders row
  // without a bearer, the build's commit with it (or on localhost without one)
  results.push(await playShadersRow(base, args.timeoutMs));
  const commit = await commitRow(base, headers, args.timeoutMs, args.sha);
  if (commit.skip !== undefined) console.log(`skip  ${commit.skip}`);
  else results.push(commit);
  if (args.tokenEnv === null) {
    console.log(
      'skip  effects backend: pass --token-env <VAR> (the row reads /api/agent with the bearer)',
    );
    console.log(
      'skip  template copy: pass --token-env <VAR> and --template-copy (the row writes one deck and removes it)',
    );
    console.log(
      'skip  restricted thumbnail private: pass --token-env <VAR> (the row makes a scratch deck and removes it)',
    );
    for (const name of PRIVATE_STORE_ROWS)
      console.log(`skip  ${name}: pass --token-env <VAR> (the row reads the scratch deck)`);
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
      // the scratch deck's rows (hardening HR-SD#5), the deck removed before the table prints
      const scratch = await createScratchDeck(base, headers);
      results.push(await restrictedThumbnailRow(base, scratch, headers, args.timeoutMs));
      const byName = await assetByNameRow(base, scratch, headers, args.timeoutMs);
      if (byName.skip !== undefined) console.log(`skip  ${byName.skip}`);
      else results.push(byName);
      // the private store rows (HR-K1#6), before the scratch deck leaves
      // `principal index private` reads as the account key --index-token-env names, else the bearer
      const indexHeaders =
        args.indexTokenEnv === null ? headers : bearerHeaders(args.indexTokenEnv);
      const privateStore = await privateStoreRows(
        base,
        scratch,
        byName.picture ?? null,
        indexHeaders.authorization === undefined
          ? { unset: args.indexTokenEnv }
          : { headers: indexHeaders },
        args.timeoutMs,
      );
      for (const line of privateStore.skip ?? []) console.log(`skip  ${line}`);
      results.push(...(privateStore.rows ?? []));
      results.push(await exportLinkRow(base, scratch, headers));
      if (scratch.id !== null) results.push(await removeScratchDeck(base, scratch, headers));
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
