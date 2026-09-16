#!/usr/bin/env node
// Fetches the font catalog's files once (gslides-parity SPEC-5-amendments A5 item 2; B7). For
// every FONT_SOURCES row of packages/fonts/src/catalog.ts that is not already present, the
// script reads the family's METADATA.pb and licence text from the Google Fonts repository at
// GOOGLE_FONTS_COMMIT, picks the files the row names (the variable file and its italic twin, or
// the static weights), downloads the TrueType files, converts each to woff2 with fontTools in the
// fonts venv (`.turboslide/venv`; a format conversion alone, nothing subset, renamed or
// instanced, so a Reserved Font Name is kept under the OFL), writes the woff2 files and the
// licence as LICENSE under packages/fonts/assets/<id>/, and regenerates
// packages/fonts/src/catalog-files.ts with the name table facts, the bytes and the sha256 of
// every file (the present Inter files are read from the repository and recorded the same way).
// The check chain never runs this: the assets and the generated table are committed, and
// catalog.test.ts compares the files with the table.
//
//   node packages/fonts/scripts/fetch-fonts.mjs [--only roboto,lato] [--python <bin>]
//                                               [--commit <sha>] [--dry-run] [--keep-ttf <dir>]
//
// Exit 1 when a family could not be fetched or converted; the families that succeeded are
// written and listed, so a refused network ships what it could (the orchestrator's ruling 3).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = resolve(HERE, '..');
const ROOT = resolve(PACKAGE, '..', '..');
const ASSETS = join(PACKAGE, 'assets');
const GENERATED = join(PACKAGE, 'src', 'catalog-files.ts');

const { FONT_SOURCES, GOOGLE_FONTS_COMMIT, GOOGLE_FONTS_REPOSITORY } =
  await import('../src/catalog.ts');
const { INTER, INTER_ITALIC } = await import('../src/inter.ts');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);
const ONLY = arg('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const PYTHON = arg('python', join(ROOT, '.turboslide', 'venv', 'bin', 'python'));
const COMMIT = arg('commit', GOOGLE_FONTS_COMMIT);
const DRY = flag('dry-run');
const KEEP_TTF = arg('keep-ttf', null);
const RAW = `https://raw.githubusercontent.com/google/fonts/${COMMIT}`;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fetchBytes(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'turboslide-fetch-fonts' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/** METADATA.pb is a text protobuf; the fields this script reads are flat or one level deep. */
function parseMetadata(text) {
  const top = (key) => {
    const m = new RegExp(`^${key}: "([^"]*)"`, 'm').exec(text);
    return m ? m[1] : undefined;
  };
  const blocks = (key) => {
    const out = [];
    const re = new RegExp(`^${key} \\{([\\s\\S]*?)^\\}`, 'gm');
    let m;
    while ((m = re.exec(text)) !== null) {
      const body = m[1];
      const row = {};
      for (const line of body.split('\n')) {
        const kv = /^\s*(\w+): (?:"((?:[^"\\]|\\.)*)"|([-\d.]+))\s*$/.exec(line);
        if (!kv) continue;
        row[kv[1]] = kv[2] !== undefined ? kv[2].replace(/\\"/g, '"') : Number(kv[3]);
      }
      out.push(row);
    }
    return out;
  };
  return {
    name: top('name'),
    license: top('license'),
    category: top('category'),
    fonts: blocks('fonts'),
    axes: blocks('axes'),
  };
}

const CATEGORY = { SANS_SERIF: 'sans', SERIF: 'serif', DISPLAY: 'display', MONOSPACE: 'mono' };
const LICENCE = { OFL: 'OFL 1.1', APACHE2: 'Apache 2.0' };
const LICENCE_FILE = { OFL: 'OFL.txt', APACHE2: 'LICENSE.txt' };

/** The Reserved Font Name(s) an OFL text declares in its copyright line, or null. */
function reservedFontName(licenceText) {
  const head = licenceText.split('\n').slice(0, 6).join('\n');
  const at = head.search(/Reserved Font Names?/);
  if (at < 0) return null;
  // every quoted name of the sentence: `"Lato"`, `'Source'`, or `"PT Sans", "PT Serif" and "ParaType"`
  const sentence = head.slice(at).split(/\.\s|\n\n/)[0];
  const names = [...sentence.matchAll(/["“']([^"”']+)["”']/g)].map((m) => m[1]);
  if (names.length > 0) return names.join(', ');
  // an unquoted name (Libre Baskerville: `with Reserved Font Name Libre Baskerville.`)
  const bare = /Reserved Font Names?\s+([^.\n]+)/.exec(sentence);
  return bare ? bare[1].trim() : null;
}

/** Converts TrueType files to woff2 and reads their facts in one python run. */
function convert(jobs) {
  const script = `
import json, sys
from fontTools.ttLib import TTFont
out = []
for job in json.load(sys.stdin):
    font = TTFont(job["src"])
    facts = {"src": job["src"], "dst": job["dst"]}
    if job.get("convert", True):
        font.flavor = "woff2"
        font.save(job["dst"])
    name = font["name"]
    facts["family"] = name.getBestFamilyName()
    facts["full"] = name.getBestFullName()
    os2 = font["OS/2"]
    facts["italic"] = bool(os2.fsSelection & 1) or bool(font["head"].macStyle & 2)
    facts["weightClass"] = os2.usWeightClass
    facts["fsType"] = os2.fsType
    facts["axes"] = None
    if "fvar" in font:
        facts["axes"] = {a.axisTag: [a.minValue, a.maxValue] for a in font["fvar"].axes}
    facts["upm"] = font["head"].unitsPerEm
    out.append(facts)
json.dump(out, sys.stdout)
`;
  const run = spawnSync(PYTHON, ['-c', script], {
    input: JSON.stringify(jobs),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) throw new Error(`fontTools failed: ${run.stderr.trim()}`);
  return JSON.parse(run.stdout);
}

/** The woff2 name of a fetched file: `<id>[-<weight>][-italic].woff2`. */
function targetName(id, take, style, weight) {
  const parts = [id];
  if (take.kind === 'static') parts.push(String(weight));
  if (style === 'italic') parts.push('italic');
  return `${parts.join('-')}.woff2`;
}

const python = spawnSync(PYTHON, ['-c', 'import fontTools, brotli'], { encoding: 'utf8' });
if (python.status !== 0) {
  console.error(
    `fetch-fonts: ${PYTHON} lacks fontTools with brotli (${python.stderr.trim()}); create the venv with \`turboslide fonts build\` or pass --python`,
  );
  process.exit(2);
}

const work = KEEP_TTF ? resolve(KEEP_TTF) : join(tmpdir(), `turboslide-fonts-${process.pid}`);
mkdirSync(work, { recursive: true });

const rows = [];
const failures = [];
const sizes = [];

for (const source of FONT_SOURCES) {
  if (ONLY.length > 0 && !ONLY.includes(source.id)) continue;
  const { id, take } = source;
  try {
    if (take.kind === 'present') {
      // Inter: the files inter.ts names, read from the repository and recorded like the rest
      const present = [
        { facts: INTER, style: 'normal' },
        { facts: INTER_ITALIC, style: 'italic' },
      ];
      const jobs = present.map((p) => ({
        src: join(ASSETS, p.facts.file),
        dst: '',
        convert: false,
      }));
      const facts = convert(jobs);
      const files = present.map((p, i) => {
        const bytes = readFileSync(join(ASSETS, p.facts.file));
        const wght = facts[i].axes?.wght ?? [p.facts.weight[0], p.facts.weight[1]];
        return {
          file: p.facts.file,
          style: p.style,
          weight: [wght[0], wght[1]],
          bytes: bytes.byteLength,
          sha256: sha256(bytes),
          source: `${INTER_ITALIC.release} ${p.style === 'italic' ? INTER_ITALIC.path : 'web/InterVariable.woff2'}`,
          sourceBytes: bytes.byteLength,
          sourceSha256: sha256(bytes),
        };
      });
      rows.push({
        id,
        // the family PowerPoint and Google Slides name; the variable file's own name table reads
        // "Inter Variable"
        name: INTER.family,
        category: 'sans',
        licence: 'OFL 1.1',
        reservedFontName: null,
        copyright: 'Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter)',
        axes: facts[0].axes,
        files,
      });
      for (const f of files) sizes.push([id, f.file, f.sourceBytes, f.bytes]);
      console.log(`${id}: present, ${files.length} file(s) recorded`);
      continue;
    }

    const base = `${RAW}/${source.directory}`;
    const metadata = parseMetadata((await fetchBytes(`${base}/METADATA.pb`)).toString('utf8'));
    if (!metadata.name || !metadata.license || !metadata.category)
      throw new Error(`METADATA.pb of ${source.directory} lacks name, license or category`);
    const licence = LICENCE[metadata.license];
    if (licence === undefined)
      throw new Error(
        `${metadata.name} is under ${metadata.license}, not OFL or Apache (A5 item 2)`,
      );
    const licenceText = (await fetchBytes(`${base}/${LICENCE_FILE[metadata.license]}`)).toString(
      'utf8',
    );
    const category = CATEGORY[metadata.category];
    if (category === undefined) throw new Error(`${metadata.name}: category ${metadata.category}`);

    let picked;
    if (take.kind === 'variable') {
      picked = metadata.fonts.filter((f) => /\[.*\]\.ttf$/.test(f.filename));
      if (picked.length === 0) throw new Error(`${metadata.name} ships no variable file`);
      // one file per style
      const byStyle = new Map();
      for (const f of picked) if (!byStyle.has(f.style)) byStyle.set(f.style, f);
      picked = [...byStyle.values()];
    } else {
      picked = metadata.fonts.filter(
        (f) => take.weights.includes(f.weight) && !/\[.*\]\.ttf$/.test(f.filename),
      );
      const found = new Set(picked.map((f) => f.weight));
      const missing = take.weights.filter((w) => !found.has(w));
      if (missing.length > 0)
        throw new Error(`${metadata.name} ships no static cut at weight ${missing.join(', ')}`);
    }
    picked.sort((a, b) => a.weight - b.weight || (a.style === 'italic' ? 1 : -1));

    const dir = join(ASSETS, id);
    const jobs = [];
    const downloads = [];
    for (const f of picked) {
      const url = `${base}/${encodeURIComponent(f.filename)}`;
      const ttf = await fetchBytes(url);
      const src = join(work, `${id}-${f.filename}`);
      writeFileSync(src, ttf);
      const dst = join(dir, targetName(id, take, f.style, f.weight));
      downloads.push({ f, ttf, src, dst });
      jobs.push({ src, dst, convert: !DRY });
    }
    if (!DRY) mkdirSync(dir, { recursive: true });
    const facts = convert(jobs);
    const files = downloads.map((d, i) => {
      const fact = facts[i];
      if (fact.fsType !== 0 && (fact.fsType & 0x0002) !== 0)
        throw new Error(`${d.f.filename}: fsType ${fact.fsType} forbids embedding`);
      const out = DRY ? Buffer.alloc(0) : readFileSync(d.dst);
      const style = fact.italic ? 'italic' : 'normal';
      const weight =
        fact.axes && fact.axes.wght ? [fact.axes.wght[0], fact.axes.wght[1]] : d.f.weight;
      sizes.push([id, d.dst.slice(dir.length + 1), d.ttf.byteLength, out.byteLength]);
      return {
        file: d.dst.slice(dir.length + 1),
        style,
        weight,
        bytes: out.byteLength,
        sha256: sha256(out),
        source: `${source.directory}/${d.f.filename}`,
        sourceBytes: d.ttf.byteLength,
        sourceSha256: sha256(d.ttf),
      };
    });
    if (!DRY) {
      writeFileSync(join(dir, 'LICENSE'), licenceText);
      // a file from an earlier membership that this run did not write leaves the folder
      const wanted = new Set([...files.map((f) => f.file), 'LICENSE']);
      for (const name of readdirSync(dir)) if (!wanted.has(name)) rmSync(join(dir, name));
    }
    rows.push({
      id,
      name: metadata.name,
      category,
      licence,
      reservedFontName: reservedFontName(licenceText),
      copyright: picked[0].copyright ?? '',
      axes: facts.find((x) => !x.italic)?.axes ?? facts[0].axes ?? null,
      files,
    });
    console.log(
      `${id}: ${metadata.name} (${category}, ${licence}${rows.at(-1).reservedFontName ? `, RFN ${rows.at(-1).reservedFontName}` : ''}), ${files.length} file(s), ${files.reduce((n, f) => n + f.bytes, 0)} B woff2`,
    );
  } catch (error) {
    failures.push({ id, error: error instanceof Error ? error.message : String(error) });
    console.error(`${id}: FAILED ${failures.at(-1).error}`);
  }
}

if (!KEEP_TTF) rmSync(work, { recursive: true, force: true });

// The generated table: a full run rewrites it; a --only run keeps the other families' rows.
if (!DRY) {
  let previous = [];
  if (ONLY.length > 0 && existsSync(GENERATED)) {
    try {
      previous = (await import(`${GENERATED}?t=${Date.now()}`)).CATALOG_FILES;
    } catch {
      previous = [];
    }
  }
  const ids = new Set(rows.map((r) => r.id));
  const merged = [...previous.filter((r) => !ids.has(r.id)), ...rows];
  const order = FONT_SOURCES.map((s) => s.id);
  merged.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const header = `// Generated by packages/fonts/scripts/fetch-fonts.mjs from ${GOOGLE_FONTS_REPOSITORY} at
// ${COMMIT} on ${new Date().toISOString().slice(0, 10)}; do not edit by hand. Every woff2 is a fontTools
// format conversion of the TrueType file named in \`source\` (nothing subset, renamed or
// instanced), so the family keeps its name table and any Reserved Font Name under the OFL. The
// catalog (catalog.ts) composes FONT_IDS over this table; catalog.test.ts compares the committed
// files with the bytes and sha256 recorded here.
import type { FontCategory, FontId, FontLicence } from '@turboslide/schema/fonts';

/** One woff2 file under packages/fonts/assets (catalog.ts fontAssetPath). */
export type CatalogFile = {
  file: string;
  style: 'normal' | 'italic';
  /** one weight for a static cut, the wght axis range for a variable file */
  weight: number | [number, number];
  bytes: number;
  sha256: string;
  /** the source file in the repository at GOOGLE_FONTS_COMMIT, or the release asset for Inter */
  source: string;
  sourceBytes: number;
  sourceSha256: string;
};

/** The facts the fetch script read from a family's METADATA.pb, licence text and name tables. */
export type CatalogFamilyFacts = {
  id: FontId;
  name: string;
  category: FontCategory;
  licence: FontLicence;
  reservedFontName: string | null;
  copyright: string;
  /** the variable axes of the upright file, tag to [min, max]; null for a static family */
  axes: Record<string, [number, number]> | null;
  files: CatalogFile[];
};

export const CATALOG_FILES: readonly CatalogFamilyFacts[] = ${JSON.stringify(merged, null, 2)};
`;
  writeFileSync(GENERATED, header);
  // the repository's formatter over the generated module, so check step 19 reads it as written
  const prettier = spawnSync(
    join(ROOT, 'node_modules', '.bin', 'prettier'),
    ['--write', GENERATED],
    {
      encoding: 'utf8',
    },
  );
  if (prettier.status !== 0) console.error(`prettier: ${prettier.stderr.trim()}`);
  console.log(`wrote ${GENERATED} with ${merged.length} famil${merged.length === 1 ? 'y' : 'ies'}`);
}

const totalTtf = sizes.reduce((n, s) => n + s[2], 0);
const totalWoff2 = sizes.reduce((n, s) => n + s[3], 0);
console.log(`\n${sizes.length} file(s): ${totalTtf} B TrueType, ${totalWoff2} B woff2`);
for (const [id, file, ttf, woff2] of sizes)
  console.log(
    `  ${id.padEnd(18)} ${file.padEnd(34)} ${String(ttf).padStart(9)} -> ${String(woff2).padStart(9)}`,
  );
if (failures.length > 0) {
  console.error(`\n${failures.length} famil${failures.length === 1 ? 'y' : 'ies'} failed:`);
  for (const f of failures) console.error(`  ${f.id}: ${f.error}`);
  process.exit(1);
}
