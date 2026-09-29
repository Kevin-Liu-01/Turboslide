// The copy of the rendered /home page read against the rules of docs/POLISH.md 3.1 (B7, the
// polish round): sentence case headings with no trailing period, no comma in a section heading
// (the h1 keeps the list comma of its three verbs), one thought per sentence under 20 words, no
// semicolon, no colon list, no em dash, no exclamation mark, none of the report words, no file
// path and no date outside the agents section's command box, the page under 350 words, plus every
// href on the page fetched once and recorded with its status. Reads the page as a visitor's
// browser renders it (innerText), never the source. The caller holds .turboslide/e2e.lock.
//
//   BASE=http://localhost:4447 OUT=docs/gslides-parity/polish/build/b7/after node docs/gslides-parity/polish/build/b7/scripts/copy-rules.mjs
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(new URL('../../../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');

const BASE = (process.env.BASE ?? 'http://localhost:4447').replace(/\/$/, '');
const OUT = resolve(process.env.OUT ?? 'docs/gslides-parity/polish/build/b7/after');

const REPORT_WORDS = [
  'Advanced tools',
  'default view',
  'acceptance',
  'audit',
  'verification',
  'revision',
];
const SMALL = new Set([
  'the',
  'a',
  'an',
  'of',
  'to',
  'and',
  'or',
  'for',
  'in',
  'on',
  'from',
  'at',
  'with',
  'it',
  'is',
  'are',
  'same',
]);
/** The capitalised names a heading may carry after its first word. */
const PROPER = [
  'Google',
  'PowerPoint',
  'PDF',
  'Vercel',
  'GitHub',
  'MIT',
  'Turboslide',
  'General Translation',
  'LLC',
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/home`, { waitUntil: 'load' });
await page.waitForSelector('main.ts-product[data-hydrated]');
const read = await page.evaluate(() => {
  const main = document.querySelector('main.ts-product');
  const headings = [...main.querySelectorAll('h1, h2')].map((h) => ({
    tag: h.tagName,
    text: h.textContent.trim(),
  }));
  const code = [...main.querySelectorAll('pre code')].map((c) => c.textContent);
  const clone = main.cloneNode(true);
  for (const el of clone.querySelectorAll('pre, script')) el.remove();
  document.body.append(clone);
  const prose = clone.innerText;
  clone.remove();
  const blocks = [...main.querySelectorAll('[data-band]')].map((el) => ({
    band: el.getAttribute('data-band'),
    text: el.innerText.trim(),
  }));
  const links = [...document.querySelectorAll('a[href]')].map((a) => ({
    control: a.getAttribute('data-control'),
    text: a.textContent.trim().slice(0, 60),
    href: a.href,
    target: a.getAttribute('target'),
  }));
  return {
    headings,
    code,
    prose,
    all: main.innerText,
    blocks,
    links,
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
  };
});
await browser.close();

const findings = [];
const note = (rule, detail) => findings.push({ rule, detail });
const words = (t) => t.trim().split(/\s+/).filter(Boolean);

const total = words(read.all).length;
if (total >= 350) note('under 350 words', `${total} words`);
for (const { tag, text } of read.headings) {
  if (/[.:;]$/.test(text)) note('no trailing period on a heading', text);
  if (tag === 'H2' && text.includes(',')) note('no comma in a section heading', text);
  if (tag === 'H1' && /,\s+(in|on|at|with|from|which|that)\b/.test(text))
    note('no clause after a comma in the h1', text);
  const rest = text.split(' ').slice(1);
  for (const w of rest) {
    /* a capitalised word after the first is a proper noun of the list, read without its possessive or punctuation */
    const bare = w.replace(/'s$/, '').replace(/[^A-Za-z]/g, '');
    if (/^[A-Z]/.test(w) && !PROPER.some((p) => p.split(' ').includes(bare)))
      note('sentence case heading', `${text} (${w})`);
  }
}
if (read.prose.includes(';'))
  note(
    'no semicolon',
    read.prose.split('\n').find((l) => l.includes(';')),
  );
if (read.prose.includes('—'))
  note(
    'no em dash',
    read.prose.split('\n').find((l) => l.includes('—')),
  );
if (read.prose.includes('!'))
  note(
    'no exclamation mark',
    read.prose.split('\n').find((l) => l.includes('!')),
  );
for (const line of read.prose.split('\n')) {
  if (/:\s/.test(line)) note('no colon list', line);
  if (/\b[\w-]+\/[\w./-]+/.test(line)) note('no file path outside the command box', line);
  if (/\b20\d\d-\d\d-\d\d\b/.test(line)) note('no date', line);
  for (const word of REPORT_WORDS)
    if (new RegExp(`\\b${word}\\b`, 'i').test(line)) note(`no "${word}"`, line);
  for (const sentence of line.split(/(?<=[.?!])\s+/)) {
    const n = words(sentence).length;
    if (n >= 20) note('one thought under 20 words', `${n} words: ${sentence}`);
  }
}
if (read.code.length !== 1) note('one command box', `${read.code.length} code blocks`);
for (const c of read.code)
  if (!/^pnpm exec turboslide /.test(c)) note('the command box is the CLI command', c);

/* every href once, GET, its status recorded; an external address answers from the network */
const seen = new Map();
for (const link of read.links) {
  if (seen.has(link.href)) continue;
  let status = 'n/a';
  try {
    if (link.href.includes('#')) status = 'anchor';
    else {
      const res = await fetch(link.href, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) turboslide-home-b7' },
      });
      status = res.status;
      await res.arrayBuffer();
    }
  } catch (error) {
    status = `error ${error.message}`;
  }
  seen.set(link.href, { ...link, status });
  if (status !== 200 && status !== 'anchor')
    note('every href answers 200', `${status} ${link.control} ${link.href}`);
}

const record = {
  base: BASE,
  readAt: new Date().toISOString(),
  title: read.title,
  description: read.description,
  words: total,
  wordsByBand: read.blocks.map((b) => ({ band: b.band, words: words(b.text).length })),
  headings: read.headings,
  links: [...seen.values()],
  findings,
};
writeFileSync(join(OUT, 'copy-rules.json'), JSON.stringify(record, null, 2));
writeFileSync(
  join(OUT, 'copy-as-rendered.txt'),
  read.blocks.map((b) => `## ${b.band}\n\n${b.text}`).join('\n\n'),
);
console.log(
  `${total} words; ${read.headings.length} headings; ${seen.size} distinct hrefs; ${findings.length} findings`,
);
for (const f of findings) console.log(`  ${f.rule}: ${f.detail}`);
for (const l of seen.values()) console.log(`  ${l.status}\t${l.control}\t${l.href}`);
process.exit(findings.length === 0 ? 0 : 1);
