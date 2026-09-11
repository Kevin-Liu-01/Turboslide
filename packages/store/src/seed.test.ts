// The seed: a directory and a key-value storage list the same keys, bytes come back as written,
// the asset keys are told apart from the documents, and materializeSeed writes what is missing
// and leaves what is there.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  deckOfKey,
  directorySeed,
  isAssetKey,
  isSafeKey,
  keyFromStorage,
  keyValueSeed,
  materializeSeed,
  seedDeckIds,
  storageKeyFor,
  toBytes,
} from './seed.ts';
import type { KeyValueStorage } from './seed.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function writeSeed(root: string): void {
  mkdirSync(join(root, 'gt-brand', 'slides'), { recursive: true });
  mkdirSync(join(root, 'gt-brand', 'assets'), { recursive: true });
  mkdirSync(join(root, 'gt-brand', '.turboslide'), { recursive: true });
  mkdirSync(join(root, 'templates', 'gt-brand'), { recursive: true });
  writeFileSync(join(root, 'gt-brand', 'deck.json'), '{"revision":1}\n');
  writeFileSync(join(root, 'gt-brand', 'slides', 'title.json'), '{"id":"title"}\n');
  writeFileSync(join(root, 'gt-brand', 'assets', 'mark-dark.png'), PNG);
  writeFileSync(join(root, 'gt-brand', '.turboslide', 'leases.json'), '{"leases":[]}\n');
  writeFileSync(join(root, 'templates', 'gt-brand', 'template.json'), '{"id":"gt-brand"}\n');
  writeFileSync(join(root, '.DS_Store'), 'x');
}

const KEYS = [
  'gt-brand/assets/mark-dark.png',
  'gt-brand/deck.json',
  'gt-brand/slides/title.json',
  'templates/gt-brand/template.json',
];

describe('seed keys', () => {
  it('tells twins from documents and names their deck', () => {
    expect(isAssetKey('gt-brand/assets/mark-dark.png')).toBe(true);
    expect(isAssetKey('gt-brand/deck.json')).toBe(false);
    expect(isAssetKey('templates/gt-brand/assets/x.png')).toBe(false);
    expect(deckOfKey('gt-brand/slides/title.json')).toBe('gt-brand');
    expect(deckOfKey('templates/gt-brand/template.json')).toBe('templates');
    expect(seedDeckIds(KEYS)).toEqual(['gt-brand']);
  });

  it('refuses keys that leave the folder', () => {
    expect(isSafeKey('gt-brand/deck.json')).toBe(true);
    expect(isSafeKey('../deck.json')).toBe(false);
    expect(isSafeKey('gt-brand//deck.json')).toBe(false);
    expect(isSafeKey('/etc/passwd')).toBe(false);
    expect(isSafeKey('')).toBe(false);
  });

  it('maps between storage keys and paths', () => {
    expect(keyFromStorage('gt-brand:slides:title.json')).toBe('gt-brand/slides/title.json');
    expect(storageKeyFor('gt-brand/slides/title.json')).toBe('gt-brand:slides:title.json');
  });

  it('turns storage values into bytes', () => {
    expect(toBytes('{"a":1}', 'k')).toEqual(new TextEncoder().encode('{"a":1}'));
    expect(toBytes(PNG, 'k')).toBe(PNG);
    expect(new TextDecoder().decode(toBytes({ a: 1 }, 'k'))).toBe('{\n  "a": 1\n}\n');
    expect(() => toBytes(null, 'k')).toThrow(/holds null/);
  });
});

describe('directorySeed and keyValueSeed', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-seed-'));
    writeSeed(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('lists the files sorted, without state folders or dotfiles', async () => {
    const seed = directorySeed(root);
    expect(await seed.keys()).toEqual(KEYS);
    expect(await seed.read('gt-brand/assets/mark-dark.png')).toEqual(PNG);
    await expect(seed.read('../outside')).rejects.toThrow(/Unsafe seed key/);
  });

  it('keeps only the named folders', async () => {
    expect(await directorySeed(root, { only: ['templates'] }).keys()).toEqual([
      'templates/gt-brand/template.json',
    ]);
    expect(await directorySeed(join(root, 'missing')).keys()).toEqual([]);
  });

  it('reads a key-value storage the way Nitro exposes server assets', async () => {
    const storage: KeyValueStorage = {
      async getKeys() {
        return KEYS.map(storageKeyFor).reverse();
      },
      async getItemRaw(key) {
        const path = join(root, ...keyFromStorage(key).split('/'));
        return key.endsWith('.png')
          ? new Uint8Array(readFileSync(path))
          : readFileSync(path, 'utf8');
      },
    };
    const seed = keyValueSeed('test', storage);
    expect(await seed.keys()).toEqual(KEYS);
    expect(await seed.read('gt-brand/assets/mark-dark.png')).toEqual(PNG);
    expect(new TextDecoder().decode(await seed.read('gt-brand/deck.json'))).toBe(
      '{"revision":1}\n',
    );
  });
});

describe('materializeSeed', () => {
  let root: string;
  let target: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-seed-'));
    writeSeed(root);
    // outside the seed folder, or the seed would list what it wrote
    target = join(mkdtempSync(join(tmpdir(), 'turboslide-overlay-')), 'decks');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(join(target, '..'), { recursive: true, force: true });
  });

  it('writes the documents, then the twins, and skips what is present', async () => {
    const seed = directorySeed(root);
    const documents = await materializeSeed(seed, target, { filter: (key) => !isAssetKey(key) });
    expect(documents).toMatchObject({ written: 3, skipped: 0 });
    expect(documents.keys).toEqual(KEYS.filter((key) => !isAssetKey(key)));
    expect(existsSync(join(target, 'gt-brand', 'deck.json'))).toBe(true);
    expect(existsSync(join(target, 'gt-brand', 'assets'))).toBe(false);

    writeFileSync(join(target, 'gt-brand', 'deck.json'), '{"revision":2}\n');
    const again = await materializeSeed(seed, target);
    expect(again).toMatchObject({ written: 1, skipped: 3, bytes: PNG.byteLength });
    expect(readFileSync(join(target, 'gt-brand', 'deck.json'), 'utf8')).toBe('{"revision":2}\n');
    expect(readFileSync(join(target, 'gt-brand', 'assets', 'mark-dark.png'))).toEqual(
      Buffer.from(PNG),
    );

    const forced = await materializeSeed(seed, target, { overwrite: true });
    expect(forced.written).toBe(4);
    expect(readFileSync(join(target, 'gt-brand', 'deck.json'), 'utf8')).toBe('{"revision":1}\n');
    expect(existsSync(join(target, 'gt-brand', `deck.json.${process.pid}.part`))).toBe(false);
  });
});
