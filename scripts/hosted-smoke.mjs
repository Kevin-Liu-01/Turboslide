#!/usr/bin/env node
// Probes a deployed (or locally served) studio for the pages the hosting round must answer and
// prints one table (docs/hosting.md):
//
//   node scripts/hosted-smoke.mjs https://studio-delta-six-40.vercel.app
//   node scripts/hosted-smoke.mjs http://localhost:4321 --deck gt-brand
//
// Checks, in order: `/` is a 307 to /edit/<deck>; /deck/<deck> is a 200 page; /edit/<deck> is a
// 200 with the SSR shell (the document, the theme boot script and a script tag, since the route is
// ssr: false and the client does the rest); /decks is a 200 list; one asset twin of the deck
// (the first twin in decks/<deck>/deck.json of this checkout, or --asset <file>) is a 200 image or
// a 302 to one; /api/agent answers 401 or 200 (401 is the bearer rule off localhost without a
// token, SPEC 11). Exit code 1 when any row fails. Redirects are not followed, so the table shows
// what the server said. Nothing here needs the repository except the deck manifest for the twin.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = { url: null, deck: 'gt-brand', asset: null, timeoutMs: 30_000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--deck') out.deck = argv[++i] ?? out.deck;
    else if (arg === '--asset') out.asset = argv[++i] ?? null;
    else if (arg === '--timeout') out.timeoutMs = Number(argv[++i] ?? out.timeoutMs);
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (out.url === null) out.url = arg;
  }
  return out;
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

function checks(deck, asset) {
  const rows = [
    {
      name: '/',
      path: '/',
      expect: 'a 307 to /edit/<deck>',
      pass: (r) => (r.status === 307 || r.status === 302) && /\/edit\/[a-z0-9-]+/.test(r.location),
      detail: (r) => (r.location ? `location ${r.location}` : ''),
    },
    {
      name: `/deck/${deck}`,
      path: `/deck/${deck}`,
      expect: 'a 200 page',
      pass: (r) => r.status === 200 && r.type.includes('text/html'),
      detail: (r) => `${r.bytes} chars`,
    },
    {
      name: `/edit/${deck}`,
      path: `/edit/${deck}`,
      expect: 'a 200 SSR shell',
      pass: (r) =>
        r.status === 200 &&
        r.type.includes('text/html') &&
        SHELL_MARKS.every((m) => r.text.includes(m)),
      detail: (r) =>
        `${r.bytes} chars; ${SHELL_MARKS.filter((m) => r.text.includes(m)).length}/${SHELL_MARKS.length} shell marks`,
    },
    {
      name: '/decks',
      path: '/decks',
      expect: 'a 200 list naming the deck',
      pass: (r) => r.status === 200 && r.text.includes(`data-deck="${deck}"`),
      detail: (r) => {
        const store = /Store:\s*(?:<!-- -->)?\s*([a-z]+)/.exec(r.text);
        return store ? `store ${store[1]}` : `${r.bytes} chars`;
      },
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
    console.log('usage: node scripts/hosted-smoke.mjs <url> [--deck gt-brand] [--asset <file>]');
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
