import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ASSET_CATALOG_FILE, externalManifestOf } from '@turboslide/schema/deck';
import type { Deck } from '@turboslide/schema/deck';
import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';

import { memoryBlobClient } from './blob-fake.ts';
import { openBlobStore, pushDeckDir } from './blob-store.ts';
import { loadDeckDir } from './file-store.ts';
import { manifestKeyMatches, snapshotPath } from './snapshots.ts';

// Hardening PS#12a (docs/hardening/HARDENING.md 4.9; PERF-3 item 3, CRIT-M13): a manifest whose
// asset catalog sits in `assets.json` beside `deck.json` reads the same as one with the catalog
// inline. The writer is unchanged; PS#12b, a release later, writes the external shape. These pins
// read both shapes from a folder, and from the Blob store through a fresh mirror by the snapshot
// path and by the bodies.

const DECK = WORKED_DECK.id;
const md5 = (text: string): string => createHash('md5').update(text).digest('hex');

let root: string;

/** A deck folder in the given shape: the inline manifest, or the external one and its catalog. */
function folder(name: string, shape: 'inline' | 'external'): string {
  const dir = join(root, name, DECK);
  mkdirSync(join(dir, 'slides'), { recursive: true });
  const deck: Deck = WORKED_DECK;
  if (shape === 'inline') writeFileSync(join(dir, 'deck.json'), canonicalJson(deck));
  else {
    const catalog = canonicalJson(deck.assets);
    writeFileSync(join(dir, ASSET_CATALOG_FILE), catalog);
    writeFileSync(join(dir, 'deck.json'), canonicalJson(externalManifestOf(deck, md5(catalog))));
  }
  for (const slide of WORKED_SLIDES)
    writeFileSync(join(dir, 'slides', `${slide.id}.json`), canonicalJson(slide));
  return dir;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'turboslide-asset-catalog-'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('hardening PS#12a: the asset catalog beside deck.json reads as the inline one', () => {
  it('reads both shapes of a folder as the same document', () => {
    const inline = loadDeckDir(folder('inline', 'inline'));
    const externalDir = folder('external', 'external');
    const external = loadDeckDir(externalDir);
    expect(external.issues).toEqual(inline.issues);
    expect(canonicalJson(external.document)).toBe(canonicalJson(inline.document));
    // the external bytes' md5 is a key of the inline document's manifest
    const externalKey = md5(readFileSync(join(externalDir, 'deck.json'), 'utf8'));
    expect(manifestKeyMatches(inline.document.deck, externalKey)).toBe(true);
    expect(manifestKeyMatches(inline.document.deck, md5('{}'))).toBe(false);
  });

  it('refuses an external manifest whose catalog is missing', () => {
    const dir = folder('external', 'external');
    rmSync(join(dir, ASSET_CATALOG_FILE));
    expect(() => loadDeckDir(dir)).toThrow(TypeError);
  });

  it('a fresh Blob mirror reads an external head by its snapshot and by its bodies', async () => {
    const inline = loadDeckDir(folder('inline', 'inline')).document;
    const external = folder('external', 'external');
    for (const path of ['snapshot', 'bodies'] as const) {
      const fake = memoryBlobClient();
      await pushDeckDir(fake, DECK, external, { overwrite: false });
      if (path === 'bodies') {
        // the store holds no snapshot of the head: the mirror reads the manifest, the catalog
        // and the slides by name and proves each
        const key = md5(readFileSync(join(external, 'deck.json'), 'utf8'));
        await fake.del([`decks/${DECK}/${snapshotPath(key)}`]);
      }
      const store = openBlobStore({
        client: fake,
        deckId: DECK,
        dir: join(root, `mirror-${path}`, DECK),
        syncTtlMs: 0,
      });
      const read = await store.read();
      expect(canonicalJson(read.document), path).toBe(canonicalJson(inline));
    }
  });
});
