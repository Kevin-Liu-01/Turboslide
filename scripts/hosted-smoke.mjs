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
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--deck') out.deck = argv[++i] ?? out.deck;
    else if (arg === '--asset') out.asset = argv[++i] ?? null;
    else if (arg === '--base' || arg === '--url') out.url = argv[++i] ?? null;
    else if (arg === '--timeout') out.timeoutMs = Number(argv[++i] ?? out.timeoutMs);
    else if (arg === '--token-env') out.tokenEnv = argv[++i] ?? null;
    else if (arg === '--export-batch') out.exportBatch = true;
    else if (arg === '--slides') out.slides = Number(argv[++i] ?? 0) || null;
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

async function probe(base, path, timeoutMs) {
  const url = new URL(path, base).toString();
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: protectionHeaders(),
    });
    const type = response.headers.get('content-type') ?? '';
    const text = type.startsWith('text/') || type.includes('json') ? await response.text() : '';
    const bytes = text === '' ? Number(response.headers.get('content-length') ?? 0) : text.length;
    return {
      url,
      status: response.status,
      type,
      location: response.headers.get('location') ?? '',
      robots: response.headers.get('x-robots-tag') ?? '',
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
const NOINDEX_META = /<meta\s+name="robots"\s+content="noindex"\s*\/?>/;

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
  const rows = checks(args.deck, asset);
  const results = [];
  for (const row of rows) {
    const r = await probe(base, row.path, args.timeoutMs);
    const ok = r.error === undefined && row.pass(r);
    results.push({ row, r, ok });
  }
  // the round two rows, with the bearer (SPEC-2 8.1, 8.2)
  const headers = bearerHeaders(args.tokenEnv);
  if (args.tokenEnv !== null) {
    if (headers.authorization === undefined) {
      results.push({
        row: { name: 'deck.info snapshots', expect: `${args.tokenEnv} set`, detail: () => '' },
        r: { status: 0, ms: 0, error: `${args.tokenEnv} is not set in the environment` },
        ok: false,
      });
    } else {
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
