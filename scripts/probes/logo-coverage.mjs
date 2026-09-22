#!/usr/bin/env node
// The logo coverage list of a ship (docs/FEATURES.md 4.1; the ship note's `logo-coverage-list.txt`):
// the brand names a General Translation seller or marketer types into the logo search, run through
// `logo.search` against a deployment's index on the day of the ship, with the matched slug beside
// each name and the number missing at the foot. The coverage is a number the ship measures and
// never types: judge-seller's 146 names (docs/gslides-parity/features/judge-seller/
// thesvg-seller-coverage.py, read on 2026-09-20 against thesvg.org's registry: 122 present, 24
// missing) are the first list, and the deployment's marketer replaces it with the CRM's top
// customers, prospects and competitors through `--names <file>` (one name a line, `#` comments).
// A name matches a row when it equals the row's title, slug or an alias, case folded, the judge's
// rule; a name the search answers with another brand is missing, never a near match.
//
//   node scripts/probes/logo-coverage.mjs --base <origin> [--names <file>] [--out <file>] [--limit 5]
//
// The search is `GET <origin>/api/logo/search?q=<name>&limit=<limit>` (the dialog's own route,
// docs/FEATURES.md 4.2), one name at a time; on a preview behind Vercel Authentication the request
// carries VERCEL_OIDC_TOKEN as x-vercel-trusted-oidc-idp-token and, where the surface needs it, the
// bearer from TURBOSLIDE_TOKEN or the origin's row of ~/.config/turboslide/hosts.json (read into
// memory, never printed). The file goes to `--out` (default
// docs/gslides-parity/features/build/logo-coverage-list.txt) and the counts to stdout; the exit
// code is 0 on a complete run whatever the count (the number is the ship note's, not a gate) and
// 1 when the route did not answer. Node only, no dependency. The pure parts are exported for
// scripts/probes/logo-coverage.test.mjs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Judge-seller's 146 names (thesvg-seller-coverage.py, 2026-09-20): customers and prospects of a
 * localisation company, its competitors, and the enterprise marks a sales deck names.
 */
export const SELLER_NAMES = Object.freeze([
  'salesforce',
  'hubspot',
  'shopify',
  'zendesk',
  'atlassian',
  'notion',
  'slack',
  'figma',
  'stripe',
  'servicenow',
  'workday',
  'sap',
  'oracle',
  'adobe',
  'airbnb',
  'uber',
  'spotify',
  'netflix',
  'duolingo',
  'canva',
  'miro',
  'lokalise',
  'phrase',
  'smartling',
  'crowdin',
  'transifex',
  'weglot',
  'deepl',
  'lilt',
  'outreach',
  'gong',
  'zoominfo',
  'apollo',
  'pandadoc',
  'docusign',
  'klaviyo',
  'mailchimp',
  'intercom',
  'twilio',
  'segment',
  'amplitude',
  'mixpanel',
  'datadog',
  'snowflake',
  'databricks',
  'mongodb',
  'cloudflare',
  'vercel',
  'supabase',
  'linear',
  'loom',
  'calendly',
  'asana',
  'monday',
  'clickup',
  'airtable',
  'webflow',
  'framer',
  'wix',
  'squarespace',
  'coinbase',
  'robinhood',
  'revolut',
  'wise',
  'klarna',
  'brex',
  'ramp',
  'rippling',
  'gusto',
  'deel',
  'remote',
  'microsoft',
  'google',
  'amazon',
  'apple',
  'meta',
  'openai',
  'anthropic',
  'nvidia',
  'ibm',
  'accenture',
  'deloitte',
  'mckinsey',
  'nike',
  'coca-cola',
  'toyota',
  'siemens',
  'unilever',
  'pfizer',
  'jpmorgan',
  'goldman sachs',
  'visa',
  'mastercard',
  'walmart',
  'target',
  'ikea',
  'zara',
  'h&m',
  'lego',
  'sony',
  'samsung',
  'lg',
  'philips',
  'bosch',
  'volkswagen',
  'bmw',
  'mercedes-benz',
  'tesla',
  'ford',
  'general motors',
  'boeing',
  'airbus',
  'fedex',
  'ups',
  'dhl',
  'marriott',
  'hilton',
  'expedia',
  'booking.com',
  'zoom',
  'dropbox',
  'box',
  'okta',
  'crowdstrike',
  'palo alto networks',
  'zscaler',
  'splunk',
  'servicetitan',
  'toast',
  'square',
  'paypal',
  'adyen',
  'shopify plus',
  'bigcommerce',
  'magento',
  'contentful',
  'sanity',
  'storyblok',
  'wordpress',
  'hygraph',
  'strapi',
  'prismic',
  'builder.io',
  'gtm',
  'general translation',
  'locadex',
]);

export const DEFAULT_OUT = fileURLToPath(
  new URL('../../docs/gslides-parity/features/build/logo-coverage-list.txt', import.meta.url),
);

/** A names file: one name a line, blank lines and `#` comments skipped, case folded and trimmed. */
export function parseNames(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim().toLowerCase())
    .filter((line) => line.length > 0);
}

const fold = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

/**
 * The row of a `logo.search` answer that a name matches: the title, the slug or an alias equal to
 * the name, case folded (the judge's rule); null when no row does. A hyphen and a space are the
 * same character for the match, since a seller types either ("coca cola", "coca-cola").
 */
export function matchName(name, rows) {
  const want = fold(name).replace(/-/g, ' ');
  for (const row of rows ?? []) {
    const candidates = [row.title, row.slug, ...(Array.isArray(row.aliases) ? row.aliases : [])];
    if (candidates.some((c) => fold(c).replace(/-/g, ' ') === want)) return row;
  }
  return null;
}

/** The counts of a results list: `{ names, present, missing }`. */
export function coverageCounts(results) {
  const present = results.filter((r) => r.slug !== null).length;
  return { names: results.length, present, missing: results.length - present };
}

/**
 * The file's text: the head with the origin, the date, the index's date and the counts; one line a
 * name with its slug or a dash; the missing names at the foot.
 */
export function renderCoverage({ base, date, updatedAt, results, source }) {
  const counts = coverageCounts(results);
  const lines = [
    `# logo coverage: ${counts.present} of ${counts.names} names matched on ${base} on ${date}; ${counts.missing} missing`,
    `# the index of thesvg.org ${updatedAt ? `updated ${updatedAt}` : 'with no updatedAt'}; names from ${source}; a name matches a row's title, slug or alias, case folded (docs/FEATURES.md 4.1)`,
    '',
    ...results.map((r) => `${r.name}\t${r.slug ?? '-'}`),
    '',
    `# missing (${counts.missing}): ${
      results
        .filter((r) => r.slug === null)
        .map((r) => r.name)
        .join(', ') || 'none'
    }`,
  ];
  return `${lines.join('\n')}\n`;
}

/** The headers a coverage run sends: the preview header and the bearer, where each exists. */
export function coverageHeaders(base, env = process.env) {
  const headers = { accept: 'application/json' };
  if (env.VERCEL_OIDC_TOKEN) headers['x-vercel-trusted-oidc-idp-token'] = env.VERCEL_OIDC_TOKEN;
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base);
  if (local) return headers;
  let token = env.TURBOSLIDE_TOKEN ?? '';
  if (token === '') {
    const file = `${homedir()}/.config/turboslide/hosts.json`;
    if (existsSync(file)) {
      try {
        const hosts = JSON.parse(readFileSync(file, 'utf8')).hosts ?? {};
        const row = hosts[base] ?? hosts[base.replace(/\/$/, '')] ?? null;
        if (row && typeof row.token === 'string') token = row.token;
      } catch {
        token = '';
      }
    }
  }
  if (token !== '') headers.authorization = `Bearer ${token}`;
  return headers;
}

/**
 * Runs the list against an origin: one search a name, the match and the index's date. `fetchImpl`
 * is the test's seam. Answers `{ results, updatedAt, failures }`; a failure is a name whose search
 * did not answer 200 (its line reads a dash and the failure is counted apart).
 */
export async function runCoverage({
  base,
  names,
  limit = 5,
  fetchImpl = fetch,
  env = process.env,
}) {
  const headers = coverageHeaders(base, env);
  const results = [];
  const failures = [];
  let updatedAt = null;
  for (const name of names) {
    const url = `${base.replace(/\/$/, '')}/api/logo/search?q=${encodeURIComponent(name)}&limit=${limit}`;
    let rows = [];
    try {
      const res = await fetchImpl(url, { headers });
      if (res.status !== 200) {
        failures.push({ name, status: res.status });
        results.push({ name, slug: null, status: res.status });
        continue;
      }
      const body = await res.json();
      rows = Array.isArray(body?.logos) ? body.logos : [];
      if (updatedAt === null && typeof body?.updatedAt === 'string') updatedAt = body.updatedAt;
    } catch (error) {
      failures.push({
        name,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push({ name, slug: null, status: 0 });
      continue;
    }
    const row = matchName(name, rows);
    results.push({ name, slug: row?.slug ?? null, title: row?.title ?? null, status: 200 });
  }
  return { results, updatedAt, failures };
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const arg = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const base = (arg('base', process.env.PLAYWRIGHT_BASE_URL) ?? '').replace(/\/$/, '');
  if (!base) {
    console.error(
      'usage: node scripts/probes/logo-coverage.mjs --base <origin> [--names <file>] [--out <file>] [--limit <n>]',
    );
    process.exit(2);
  }
  const namesFile = arg('names', null);
  const names = namesFile
    ? parseNames(readFileSync(resolve(namesFile), 'utf8'))
    : [...SELLER_NAMES];
  const out = resolve(arg('out', DEFAULT_OUT));
  const limit = Number(arg('limit', '5')) || 5;
  const { results, updatedAt, failures } = await runCoverage({ base, names, limit });
  const date = new Date().toISOString().slice(0, 10);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    renderCoverage({
      base,
      date,
      updatedAt,
      results,
      source: namesFile ? namesFile : "judge-seller's 146 names (thesvg-seller-coverage.py)",
    }),
  );
  const counts = coverageCounts(results);
  console.log(
    `logo coverage: ${counts.present} of ${counts.names} names matched on ${base} (${counts.missing} missing; ${failures.length} search(es) did not answer 200; index updatedAt ${updatedAt ?? 'none'}); wrote ${out}`,
  );
  if (failures.length === results.length) {
    console.error(
      `logo coverage: no search answered 200 (${failures[0]?.status ?? 0} ${failures[0]?.error ?? ''}); the route is not on this origin or the request was refused`,
    );
    process.exit(1);
  }
}
