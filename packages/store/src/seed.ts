// The seed: the decks a hosted studio starts from (decks/templates and the GT deck with its asset
// twins), read from wherever the build put them and written into the overlay's decks/ folder on
// first use (the hosting round; SPEC 4.1 for the layout). A SeedSource is one folder of files
// keyed by posix paths relative to decks/ (`gt-brand/deck.json`, `gt-brand/assets/mark-dark.png`,
// `templates/gt-brand/template.json`). Two sources exist: a directory (a checkout, the tests) and
// a key-value storage (Nitro's server assets behind `useStorage('assets:decks')`, whose keys use
// `:` where a path uses `/`). Framework free: the studio hands the storage object in.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, posix } from 'node:path';

export type SeedSource = {
  /** where the seed comes from, for the hosting facts and the logs */
  name: string;
  /** every file as a posix path relative to the decks folder */
  keys: () => Promise<string[]>;
  read: (key: string) => Promise<Uint8Array>;
};

/** The unstorage surface a key-value seed needs (nitro/storage `useStorage` returns one). */
export type KeyValueStorage = {
  getKeys: (base?: string) => Promise<string[]>;
  getItemRaw: (key: string) => Promise<unknown>;
};

export const TEMPLATES_KEY = 'templates';

/** Folders and files the seed never carries: state, caches, locks. */
export const SEED_IGNORE: ReadonlyArray<string> = ['.turboslide', '.DS_Store'];

function isIgnored(name: string): boolean {
  return name.startsWith('.') || SEED_IGNORE.includes(name);
}

/** `<deck>/assets/<file>`: the twins, materialized only when a deck or an export needs them. */
export function isAssetKey(key: string): boolean {
  const parts = key.split('/');
  return parts.length >= 3 && parts[0] !== TEMPLATES_KEY && parts[1] === 'assets';
}

/** The deck a key belongs to; `templates` for every template file. */
export function deckOfKey(key: string): string {
  return key.split('/')[0] ?? '';
}

/** The deck ids a seed carries, templates excluded, sorted. */
export function seedDeckIds(keys: ReadonlyArray<string>): string[] {
  const ids = new Set<string>();
  for (const key of keys) {
    const deck = deckOfKey(key);
    if (deck !== '' && deck !== TEMPLATES_KEY) ids.add(deck);
  }
  return [...ids].sort();
}

/** A key is safe to write under a directory when no segment is empty, `.` or `..`. */
export function isSafeKey(key: string): boolean {
  if (key === '' || key.startsWith('/')) return false;
  return key.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function walk(root: string, dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (isIgnored(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(root, path, out);
    else if (entry.isFile()) out.push(posix.join(...path.slice(root.length + 1).split(/[\\/]/)));
  }
}

export type DirectorySeedOptions = {
  /** keep only these top-level folders (deck ids and `templates`); everything when absent */
  only?: ReadonlyArray<string>;
};

/** A decks folder on disk as a seed: a checkout's decks/, or a test fixture. */
export function directorySeed(dir: string, options: DirectorySeedOptions = {}): SeedSource {
  const only = options.only === undefined ? null : new Set(options.only);
  return {
    name: `directory:${dir}`,
    async keys() {
      if (!existsSync(dir)) return [];
      const out: string[] = [];
      walk(dir, dir, out);
      return out.filter((key) => only === null || only.has(deckOfKey(key))).sort();
    },
    async read(key) {
      if (!isSafeKey(key)) throw new RangeError(`Unsafe seed key ${JSON.stringify(key)}`);
      return new Uint8Array(readFileSync(join(dir, ...key.split('/'))));
    },
  };
}

/** unstorage keys use `:` between segments; the seed uses `/`. */
export function keyFromStorage(storageKey: string): string {
  return storageKey
    .split(':')
    .filter((segment) => segment !== '')
    .join('/');
}

export function storageKeyFor(key: string): string {
  return key.split('/').join(':');
}

/**
 * The bytes behind a storage value. Nitro's bundled assets come back as a Uint8Array for binary
 * files and as text for text files; the dev driver returns Buffers; a JSON value that was parsed
 * on the way is re-serialized (not canonical, but the validator normalizes on read).
 */
export function toBytes(value: unknown, key: string): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value !== null && typeof value === 'object') {
    return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
  }
  throw new TypeError(
    `Seed entry ${key} holds ${value === null ? 'null' : typeof value}, not bytes`,
  );
}

/** A key-value storage as a seed (Nitro server assets, or any unstorage instance). */
export function keyValueSeed(name: string, storage: KeyValueStorage): SeedSource {
  return {
    name,
    async keys() {
      const keys = await storage.getKeys();
      return keys.map(keyFromStorage).filter(isSafeKey).sort();
    },
    async read(key) {
      if (!isSafeKey(key)) throw new RangeError(`Unsafe seed key ${JSON.stringify(key)}`);
      const value = await storage.getItemRaw(storageKeyFor(key));
      if (value === null || value === undefined) throw new RangeError(`No seed entry ${key}`);
      return toBytes(value, key);
    },
  };
}

export type MaterializeOptions = {
  /** which keys to write; everything when absent */
  filter?: (key: string) => boolean;
  /** rewrite files that exist; default false, so an instance's edits survive a second call */
  overwrite?: boolean;
  /** how many files are read and written at once; default 8 */
  concurrency?: number;
};

export type MaterializeResult = {
  written: number;
  skipped: number;
  bytes: number;
  /** the keys the filter kept, written or not */
  keys: string[];
};

/** Runs `run` over the items with at most `limit` in flight; the store's uploads share it. */
export async function eachLimit<T>(
  items: ReadonlyArray<T>,
  limit: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      const item = items[index];
      if (index >= items.length || item === undefined) return;
      await run(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Writes the seed's files under a decks folder. Files that exist are left alone unless
 * `overwrite` is set, so the call is idempotent per instance and a re-run after a partial write
 * fills the gaps. Writes go through a temporary name and a rename so a reader never sees a
 * half-written slide.
 */
export async function materializeSeed(
  source: SeedSource,
  decksDir: string,
  options: MaterializeOptions = {},
): Promise<MaterializeResult> {
  const filter = options.filter ?? (() => true);
  const overwrite = options.overwrite ?? false;
  const keys = (await source.keys()).filter((key) => isSafeKey(key) && filter(key));
  const result: MaterializeResult = { written: 0, skipped: 0, bytes: 0, keys };
  await eachLimit(keys, options.concurrency ?? 8, async (key) => {
    const target = join(decksDir, ...key.split('/'));
    if (!overwrite && existsSync(target)) {
      result.skipped += 1;
      return;
    }
    const bytes = await source.read(key);
    mkdirSync(dirname(target), { recursive: true });
    const partial = `${target}.${process.pid}.part`;
    writeFileSync(partial, bytes);
    renameSync(partial, target);
    result.written += 1;
    result.bytes += bytes.byteLength;
  });
  return result;
}
