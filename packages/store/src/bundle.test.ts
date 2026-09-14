// The deck bundle (docs/deck-transfer.md): the zip writer and reader round trip byte for byte and
// agree with the system archive tools; pack and unpack round trip a deck with every slide, asset,
// version and sidecar byte identical; unpack refuses a bundle with a bad slide, a digest that does
// not match, an entry outside the deck, an asset that is not the image its name claims, and writes
// nothing in those cases; a taken id gets a free sibling unless replace is set; `as` renames the
// deck and rewrites deck.json.
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Thread } from '@turboslide/schema/comments';
import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';

import {
  BUNDLE_MANIFEST,
  assetProblem,
  bundleEntryPrefix,
  listDeckFiles,
  parseBundleManifest,
  sha256Hex,
  sniffImage,
} from './bundle.ts';
import { applyCommentOps } from './comments-store.ts';
import { openFileStore } from './file-store.ts';
import { packDeckDir, writeDeckBundle } from './pack.ts';
import { freeDeckId, inspectBundle, unpackBundle } from './unpack.ts';
import { isEntryName, readZip, writeZip } from './zip.ts';
import type { ZipEntry } from './zip.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function which(binary: string): boolean {
  try {
    execFileSync('which', [binary], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Fake image bytes carrying the signature the file name claims. */
function twinBytes(path: string, salt: number): Uint8Array {
  const base = path.endsWith('.jpg') || path.endsWith('.jpeg') ? JPEG : PNG;
  const out = new Uint8Array(base.byteLength + 4);
  out.set(base);
  out.set([salt, salt + 1, salt + 2, salt + 3], base.byteLength);
  return out;
}

/** The worked deck as a deck directory with twins, a version record, a sidecar and state to skip. */
async function writeDeck(decksDir: string, deckId = 'gt-brand'): Promise<string> {
  const dir = join(decksDir, deckId);
  mkdirSync(join(dir, 'slides'), { recursive: true });
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'deck.json'), canonicalJson({ ...WORKED_DECK, id: deckId }));
  for (const slide of WORKED_SLIDES) {
    writeFileSync(join(dir, 'slides', `${slide.id}.json`), canonicalJson(slide));
  }
  let salt = 0;
  for (const asset of Object.values(WORKED_DECK.assets)) {
    for (const twin of Object.values(asset.twins)) {
      salt += 7;
      writeFileSync(join(dir, twin), twinBytes(twin, salt));
    }
  }
  writeFileSync(
    join(dir, 'assets', 'liquid.recipe.json'),
    '{ "material": "paper:liquid-metal" }\n',
  );
  writeFileSync(join(dir, 'known-findings.json'), '[]\n');
  // one write, so versions/1.json exists and the revision moves
  const store = openFileStore({ dir });
  const outcome = await store.write({
    baseRevision: WORKED_DECK.revision,
    author: { kind: 'human', name: 'tester' },
    mutations: [{ op: 'deck.set', path: '/title', value: 'Bundled deck' }],
  });
  if (!outcome.ok) throw new Error(outcome.message);
  // state that never travels
  mkdirSync(join(dir, '.turboslide'), { recursive: true });
  writeFileSync(join(dir, '.turboslide', 'leases.json'), '{"leases":[]}\n');
  writeFileSync(join(dir, 'leases.json'), '{"leases":[]}\n');
  return dir;
}

/** Every file under a directory as relative posix path to bytes, dotfiles skipped. */
function snapshot(dir: string, relative = ''): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = relative === '' ? entry.name : posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      for (const [key, value] of snapshot(join(dir, entry.name), rel)) out.set(key, value);
    } else {
      out.set(rel, new Uint8Array(readFileSync(join(dir, entry.name))));
    }
  }
  return out;
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'turboslide-bundle-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the zip module', () => {
  const entries: ZipEntry[] = [
    { name: 'manifest.json', data: encoder.encode('{"a":1}\n') },
    { name: 'decks/x/deck.json', data: encoder.encode(canonicalJson(WORKED_DECK)) },
    { name: 'decks/x/assets/mark.png', data: PNG },
    { name: 'decks/x/assets/empty.json', data: new Uint8Array(0) },
    { name: 'decks/x/slides/ünïcode.json', data: encoder.encode('{}\n') },
  ];

  it('round trips every entry byte for byte and writes the same bytes twice', () => {
    const zip = writeZip(entries, { date: new Date('2026-09-11T12:00:00Z') });
    const again = writeZip(entries, { date: new Date('2026-09-11T12:00:00Z') });
    expect(Buffer.from(zip).equals(Buffer.from(again))).toBe(true);
    const read = readZip(zip);
    expect(read.map((entry) => entry.name)).toEqual(entries.map((entry) => entry.name));
    for (const [index, entry] of read.entries()) {
      expect(Buffer.from(entry.data).equals(Buffer.from(entries[index]!.data)), entry.name).toBe(
        true,
      );
    }
  });

  it('refuses malformed archives, bad names and a CRC that does not match', () => {
    expect(() => readZip(new Uint8Array(10))).toThrow(/too short/);
    expect(() => readZip(encoder.encode('x'.repeat(64)))).toThrow(/end of central directory/);
    expect(() => writeZip([{ name: '../evil.json', data: PNG }])).toThrow(/not a zip entry name/);
    expect(() => writeZip([{ name: '/abs.json', data: PNG }])).toThrow(/not a zip entry name/);
    expect(() => writeZip([entries[0]!, entries[0]!])).toThrow(/appears twice/);
    const zip = writeZip(entries);
    // flip one byte of the first entry's payload (the stored manifest text)
    const corrupt = new Uint8Array(zip);
    const at = 30 + 'manifest.json'.length + 2;
    corrupt[at] = (corrupt[at]! + 1) & 0xff;
    expect(() => readZip(corrupt)).toThrow(/CRC/);
    expect(isEntryName('a/b.json')).toBe(true);
    expect(isEntryName('a//b.json')).toBe(false);
    expect(isEntryName('a\\b.json')).toBe(false);
  });

  it('caps the inflated size', () => {
    const zip = writeZip([{ name: 'big.txt', data: new Uint8Array(4096) }]);
    expect(() => readZip(zip, { maxTotalBytes: 1024 })).toThrow(/inflates past/);
  });

  it.skipIf(!which('unzip'))('is accepted by the system unzip', () => {
    const file = join(root, 'entries.zip');
    writeFileSync(file, writeZip(entries));
    const listing = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
    expect(listing).toMatch(/No errors detected/);
    const out = join(root, 'out');
    execFileSync('unzip', ['-q', file, '-d', out]);
    expect(
      Buffer.from(readFileSync(join(out, 'decks', 'x', 'assets', 'mark.png'))).equals(PNG),
    ).toBe(true);
  });

  it.skipIf(!which('zip'))(
    'reads an archive the system zip wrote, data descriptors and folders included',
    () => {
      const src = join(root, 'src');
      mkdirSync(join(src, 'decks', 'x', 'assets'), { recursive: true });
      writeFileSync(join(src, 'manifest.json'), '{"a":1}\n');
      writeFileSync(join(src, 'decks', 'x', 'assets', 'mark.png'), PNG);
      writeFileSync(join(src, 'decks', 'x', 'deck.json'), canonicalJson(WORKED_DECK));
      const file = join(root, 'system.zip');
      execFileSync('zip', ['-q', '-r', file, '.'], { cwd: src });
      const read = readZip(new Uint8Array(readFileSync(file)));
      const byName = new Map(read.map((entry) => [entry.name, entry.data]));
      expect(byName.has('decks/x/')).toBe(false);
      expect(Buffer.from(byName.get('decks/x/assets/mark.png')!).equals(PNG)).toBe(true);
      expect(decoder.decode(byName.get('decks/x/deck.json'))).toBe(canonicalJson(WORKED_DECK));
    },
  );
});

describe('the asset scan', () => {
  it('sniffs the five image types and refuses the rest', () => {
    expect(sniffImage(PNG)).toBe('png');
    expect(sniffImage(JPEG)).toBe('jpeg');
    expect(sniffImage(encoder.encode('GIF89a...'))).toBe('gif');
    expect(sniffImage(encoder.encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
    expect(sniffImage(encoder.encode('<?xml version="1.0"?>\n<svg xmlns="x"></svg>'))).toBe('svg');
    expect(sniffImage(encoder.encode('<html><svg></svg></html>'))).toBe(null);
    expect(sniffImage(encoder.encode('plain text'))).toBe(null);
    expect(assetProblem('assets/a.png', PNG)).toBe(null);
    expect(assetProblem('assets/a.png', JPEG)).toMatch(/jpeg image, not png/);
    expect(assetProblem('assets/a.jpg', encoder.encode('nope'))).toMatch(/not an image/);
    expect(assetProblem('assets/a.exe', PNG)).toMatch(/only png, jpg/);
    expect(assetProblem('assets/a.recipe.json', encoder.encode('{}'))).toBe(null);
    expect(assetProblem('assets/a.recipe.json', encoder.encode('{'))).toMatch(/not valid JSON/);
  });
});

describe('pack and unpack', () => {
  it('round trips a deck byte for byte, versions and sidecars included, state excluded', async () => {
    const decksDir = join(root, 'decks');
    const dir = await writeDeck(decksDir);
    const files = listDeckFiles(dir);
    expect(files.documents).toContain('versions/1.json');
    expect(files.documents).toContain('known-findings.json');
    expect(files.documents).not.toContain('leases.json');
    expect(files.assets.length).toBe(Object.keys(WORKED_DECK.assets).length * 2 + 1);
    const packed = packDeckDir(dir, { now: () => '2026-09-11T00:00:00.000Z' });
    const revision = WORKED_DECK.revision + 1;
    expect(packed.fileName).toBe(`gt-brand-r${revision}.zip`);
    expect(packed.manifest.revision).toBe(revision);
    expect(packed.manifest.title).toBe('Bundled deck');
    expect(packed.counts).toEqual({
      documents: files.documents.length,
      assets: files.assets.length,
      versions: 1,
      comments: 0,
    });
    const names = readZip(packed.zip).map((entry) => entry.name);
    expect(names[0]).toBe(BUNDLE_MANIFEST);
    expect(
      names.every((name, i) => i === 0 || name.startsWith(bundleEntryPrefix('gt-brand'))),
    ).toBe(true);
    expect(names).not.toContain('decks/gt-brand/leases.json');
    // the same revision packs to the same bytes
    const again = packDeckDir(dir, { now: () => '2026-09-11T00:00:00.000Z' });
    expect(sha256Hex(again.zip)).toBe(sha256Hex(packed.zip));

    const other = join(root, 'other');
    mkdirSync(other, { recursive: true });
    const result = await unpackBundle(packed.zip, { decksDir: other });
    expect(result).toMatchObject({
      deckId: 'gt-brand',
      sourceDeckId: 'gt-brand',
      title: 'Bundled deck',
      revision,
      replaced: false,
      renamed: false,
    });
    expect(result.counts.slides).toBe(WORKED_SLIDES.length);
    const before = snapshot(dir);
    before.delete('leases.json');
    const after = snapshot(result.dir);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [path, bytes] of before) {
      expect(Buffer.from(after.get(path)!).equals(Buffer.from(bytes)), path).toBe(true);
    }
    expect(existsSync(join(other, '.turboslide', 'unpack'))).toBe(true);
    expect(readdirSync(join(other, '.turboslide', 'unpack'))).toEqual([]);
    // the unpacked deck opens as a store at the same revision
    expect(await openFileStore({ dir: result.dir }).revision()).toBe(revision);
  });

  it('writeDeckBundle writes the file and reports its digest', async () => {
    const dir = await writeDeck(join(root, 'decks'));
    const out = join(root, 'out', 'bundle.zip');
    const result = writeDeckBundle(dir, out, { versions: false });
    expect(result.out).toBe(out);
    expect(result.bytes).toBe(readFileSync(out).byteLength);
    expect(result.sha256).toBe(sha256Hex(new Uint8Array(readFileSync(out))));
    expect(result.counts.versions).toBe(0);
    expect(inspectBundle(new Uint8Array(readFileSync(out))).counts.versions).toBe(0);
  });

  it('packs with and without the comments group byte for byte, drops access.json and leases, refuses a bad thread', async () => {
    const dir = await writeDeck(join(root, 'decks'));
    const plain = packDeckDir(dir, { now: () => '2026-09-11T00:00:00.000Z' });
    // the sidecar and the two records that never travel
    const thread: Thread = {
      id: '01j8z2kmayaq4e0s7r9x2v8b3c',
      deckId: 'gt-brand',
      anchor: { kind: 'block', slideId: 'content-rule', blockId: 'list' },
      comment: {
        id: '01j8z2kmayaq4e0s7r9x2v8b3c',
        author: {
          principalId: 'anon_0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
          label: 'Maya',
          kind: 'human',
        },
        createdAt: '2026-09-11T00:00:00.000Z',
        body: { text: 'Check this', mentions: [] },
      },
      replies: [],
      createdAt: '2026-09-11T00:00:00.000Z',
      updatedAt: '2026-09-11T00:00:00.000Z',
      revision: 0,
    };
    applyCommentOps(dir, 'gt-brand', [{ op: 'add', thread }], '2026-09-11T00:00:00.000Z');
    writeFileSync(
      join(dir, 'access.json'),
      '{ "schemaVersion": 1, "deckId": "gt-brand", "owner": null }\n',
    );
    writeFileSync(join(dir, 'leases.json'), '{ "leases": [] }\n');
    // without the group the bytes are the round two bytes; the records never enter
    const still = packDeckDir(dir, { now: () => '2026-09-11T00:00:00.000Z' });
    expect(sha256Hex(still.zip)).toBe(sha256Hex(plain.zip));
    expect(still.manifest.comments).toBeUndefined();
    expect(listDeckFiles(dir).documents).not.toContain('access.json');
    // with the group: three files, listed under `comments`, verified on the way in
    const withComments = packDeckDir(dir, {
      comments: true,
      now: () => '2026-09-11T00:00:00.000Z',
    });
    expect(withComments.counts.comments).toBe(3);
    expect(Object.keys(withComments.manifest.comments ?? {}).sort()).toEqual([
      'comments/01j8z2kmayaq4e0s7r9x2v8b3c.json',
      'comments/authors.json',
      'comments/index.json',
    ]);
    const names = readZip(withComments.zip).map((entry) => entry.name);
    expect(names).not.toContain('decks/gt-brand/access.json');
    expect(names).not.toContain('decks/gt-brand/leases.json');
    const again = packDeckDir(dir, { comments: true, now: () => '2026-09-11T00:00:00.000Z' });
    expect(sha256Hex(again.zip)).toBe(sha256Hex(withComments.zip));

    const other = join(root, 'other');
    mkdirSync(other, { recursive: true });
    const result = await unpackBundle(withComments.zip, { decksDir: other });
    expect(result.counts.comments).toBe(3);
    expect(
      Buffer.compare(
        readFileSync(join(result.dir, 'comments', 'index.json')),
        readFileSync(join(dir, 'comments', 'index.json')),
      ),
    ).toBe(0);
    expect(existsSync(join(result.dir, 'access.json'))).toBe(false);
    // an archive carrying access.json is read with the record dropped
    const entries = readZip(withComments.zip);
    const smuggled = writeZip(
      [
        ...entries,
        { name: 'decks/gt-brand/access.json', data: new TextEncoder().encode('{"owner":"usr_x"}') },
      ],
      { date: new Date(Date.UTC(2026, 8, 11)) },
    );
    const inspected = inspectBundle(smuggled);
    expect(inspected.dropped).toEqual(['access.json']);
    // a thread that does not validate refuses the bundle before any write
    const bad = entries.map((entry) =>
      entry.name === 'decks/gt-brand/comments/01j8z2kmayaq4e0s7r9x2v8b3c.json'
        ? {
            ...entry,
            data: new TextEncoder().encode(
              '{"id":"01j8z2kmayaq4e0s7r9x2v8b3c","deckId":"gt-brand"}',
            ),
          }
        : entry,
    );
    const manifestEntry = bad.find((entry) => entry.name === BUNDLE_MANIFEST)!;
    const manifest = JSON.parse(new TextDecoder().decode(manifestEntry.data)) as {
      comments: Record<string, { bytes: number; sha256: string }>;
    };
    const badThread = bad.find((entry) => entry.name.endsWith('b3c.json'))!;
    manifest.comments['comments/01j8z2kmayaq4e0s7r9x2v8b3c.json'] = {
      bytes: badThread.data.byteLength,
      sha256: sha256Hex(badThread.data),
    };
    manifestEntry.data = new TextEncoder().encode(canonicalJson(manifest));
    const third = join(root, 'third');
    mkdirSync(third, { recursive: true });
    await expect(
      unpackBundle(writeZip(bad, { date: new Date(Date.UTC(2026, 8, 11)) }), { decksDir: third }),
    ).rejects.toThrow(/not a comment thread/);
    expect(existsSync(join(third, 'gt-brand'))).toBe(false);
  });

  it('refuses a bundle with a bad slide before writing anything', async () => {
    const dir = await writeDeck(join(root, 'decks'));
    writeFileSync(
      join(dir, 'slides', 'content-rule.json'),
      '{ "schemaVersion": 1, "id": "content-rule", "kind": "content" }\n',
    );
    const packed = packDeckDir(dir);
    const other = join(root, 'other');
    mkdirSync(other, { recursive: true });
    await expect(unpackBundle(packed.zip, { decksDir: other })).rejects.toThrow(
      /does not validate/,
    );
    expect(existsSync(join(other, 'gt-brand'))).toBe(false);
  });

  it('refuses a digest that does not match, an entry outside the deck and a mislabeled asset', async () => {
    const dir = await writeDeck(join(root, 'decks'));
    const packed = packDeckDir(dir);
    const entries = readZip(packed.zip);
    const manifest = parseBundleManifest(JSON.parse(decoder.decode(entries[0]!.data)));
    const tamper = (mutate: (list: ZipEntry[]) => void): Uint8Array => {
      const copy = entries.map((entry) => ({ name: entry.name, data: new Uint8Array(entry.data) }));
      mutate(copy);
      return writeZip(copy);
    };
    const flipped = tamper((list) => {
      const slide = list.find((entry) => entry.name.endsWith('/slides/content-rule.json'))!;
      slide.data = encoder.encode(
        decoder.decode(slide.data).replace('content-rule', 'content-rule'),
      );
      slide.data[slide.data.byteLength - 2] = 0x20;
    });
    expect(() => inspectBundle(flipped)).toThrow(/does not match its digest/);
    const outside = tamper((list) => list.push({ name: 'decks/other/deck.json', data: PNG }));
    expect(() => inspectBundle(outside)).toThrow(/outside decks\/gt-brand\//);
    const extra = tamper((list) => list.push({ name: 'decks/gt-brand/slides/x.json', data: PNG }));
    expect(() => inspectBundle(extra)).toThrow(/not listed/);
    const missing = tamper((list) => list.splice(list.length - 1, 1));
    expect(() => inspectBundle(missing)).toThrow(/does not hold/);
    const mislabeled = tamper((list) => {
      const twin = list.find((entry) => entry.name.endsWith('.png'))!;
      const digest = manifest.assets[twin.name.slice(bundleEntryPrefix('gt-brand').length)]!;
      // keep the digest honest for text that is not an image
      const text = encoder.encode('not a png'.padEnd(digest.bytes, ' '));
      twin.data = text;
      const raw = JSON.parse(decoder.decode(list[0]!.data)) as {
        assets: Record<string, { bytes: number; sha256: string }>;
      };
      raw.assets[twin.name.slice(bundleEntryPrefix('gt-brand').length)] = {
        bytes: text.byteLength,
        sha256: sha256Hex(text),
      };
      list[0]!.data = encoder.encode(JSON.stringify(raw));
    });
    expect(() => inspectBundle(mislabeled)).toThrow(/not an image/);
    expect(() =>
      inspectBundle(encoder.encode('not a zip at all, but long enough to search')),
    ).toThrow(/Not a zip archive/);
    expect(() => inspectBundle(writeZip([{ name: 'readme.txt', data: PNG }]))).toThrow(
      /no manifest.json/,
    );
  });

  it('gives a taken id a free sibling, refuses a taken --as, and replaces on request', async () => {
    const decksDir = join(root, 'decks');
    const dir = await writeDeck(decksDir);
    const packed = packDeckDir(dir);
    expect(await freeDeckId('gt-brand', (id) => existsSync(join(decksDir, id, 'deck.json')))).toBe(
      'gt-brand-2',
    );
    const sibling = await unpackBundle(packed.zip, { decksDir });
    expect(sibling).toMatchObject({ deckId: 'gt-brand-2', renamed: true, replaced: false });
    const manifest = JSON.parse(readFileSync(join(sibling.dir, 'deck.json'), 'utf8')) as {
      id: string;
      title: string;
    };
    expect(manifest.id).toBe('gt-brand-2');
    expect(manifest.title).toBe('Bundled deck');
    await expect(unpackBundle(packed.zip, { decksDir, as: 'gt-brand-2' })).rejects.toThrow(
      /exists already/,
    );
    await expect(unpackBundle(packed.zip, { decksDir, as: 'templates' })).rejects.toThrow(
      /templates folder/,
    );
    await expect(unpackBundle(packed.zip, { decksDir, as: 'Not A Slug' })).rejects.toThrow(
      /not a deck id/,
    );
    // replace: the old folder goes, including a file the bundle does not carry
    writeFileSync(join(sibling.dir, 'stray.json'), '{}\n');
    const replaced = await unpackBundle(packed.zip, { decksDir, as: 'gt-brand-2', replace: true });
    expect(replaced).toMatchObject({ deckId: 'gt-brand-2', replaced: true, renamed: true });
    expect(existsSync(join(replaced.dir, 'stray.json'))).toBe(false);
    // an `exists` hook stands in for a store that knows more than the folder
    const hosted = await unpackBundle(packed.zip, {
      decksDir,
      exists: (id) => id === 'gt-brand' || id === 'gt-brand-2' || id === 'gt-brand-3',
    });
    expect(hosted.deckId).toBe('gt-brand-4');
  });
});
