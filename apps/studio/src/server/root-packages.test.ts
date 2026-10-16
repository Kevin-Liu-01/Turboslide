import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import { openHostedDecks } from '@turboslide/store/hosted';
import type { SeedSource } from '@turboslide/store/seed';
import { selectStore } from '@turboslide/store/select';

import { ensureDeckAssets, listStoredDecks, openDeckStore } from './root';

// Hardening PS#7 (docs/hardening/HARDENING.md 4.9; PERF-6 item 1): the package files (the theme,
// the fonts, the export faces) are written on the render, export, capture and measure paths
// alone, through `ensureDeckAssets`. Before, `ensureDecks` wrote them ahead of every deck read, so
// a listing or a store open on a fresh instance waited on 290 files and 29.9 MB, and failed with
// them. The runtime here is a tmp store over a seed of one deck, its package seed one that throws.

const DECK = WORKED_DECK.id;

type RuntimeHolder = { __turboslideRuntime?: unknown };
const shared = globalThis as typeof globalThis & RuntimeHolder;

/** A seed of the given files, posix paths under the decks folder. */
function memorySeed(name: string, files: Record<string, string>): SeedSource {
  return {
    name,
    keys: () => Promise.resolve(Object.keys(files)),
    read: (key) => {
      const text = files[key];
      return text === undefined
        ? Promise.reject(new RangeError(`no ${key} in the seed`))
        : Promise.resolve(new TextEncoder().encode(text));
    },
  };
}

let root: string;
let packageReads = 0;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'turboslide-root-packages-'));
  packageReads = 0;
  const selection = selectStore({ TURBOSLIDE_STORE: 'tmp' });
  const files: Record<string, string> = { [`${DECK}/deck.json`]: canonicalJson(WORKED_DECK) };
  for (const slide of WORKED_SLIDES)
    files[`${DECK}/slides/${slide.id}.json`] = canonicalJson(slide);
  const packages: SeedSource = {
    name: 'packages that throw',
    keys: () => {
      packageReads += 1;
      return Promise.reject(new Error('the package seed is unreadable'));
    },
    read: () => Promise.reject(new Error('the package seed is unreadable')),
  };
  shared.__turboslideRuntime = {
    selection,
    decks: openHostedDecks({
      selection,
      workspaceDecksDir: null,
      overlayRoot: join(root, 'overlay'),
      seed: memorySeed('one deck', files),
      blob: null,
      log: () => undefined,
    }),
    blob: null,
    packages,
  };
});

afterEach(() => {
  delete shared.__turboslideRuntime;
  rmSync(root, { recursive: true, force: true });
});

describe('hardening PS#7: the package files are the render paths alone', () => {
  it('lists the decks and opens a store when the package seed throws', async () => {
    const heads = await listStoredDecks();
    expect(heads.map((head) => head.id)).toContain(DECK);
    const store = await openDeckStore(DECK);
    expect((await store.read()).document.deck.id).toBe(DECK);
    expect(packageReads).toBe(0);
  });

  it('writes the package files before a render, where their failure is answered', async () => {
    await expect(ensureDeckAssets(DECK)).rejects.toThrow('the package seed is unreadable');
    expect(packageReads).toBe(1);
  });
});
