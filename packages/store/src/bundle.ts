// The deck bundle (docs/deck-transfer.md; Kevin's directive of 2026-09-11: copy a deck into the
// hosted app to edit it there, or pull it into a checkout to edit it locally). A bundle is one zip
// holding `manifest.json` and the deck's files under `decks/<id>/` in the layout of SPEC 4.1:
// deck.json, slides/<slideId>.json, assets/<file>, versions/<n>.json (optional) and the sidecars
// (import-ids.json, import-report.json, known-findings.json). The manifest names the bundle
// version, the deck id, its title and revision, and a sha256 digest per document and per asset,
// so unpack can refuse a bundle whose bytes do not match before it writes anything. Leases and the
// .turboslide state folder never travel. This module holds the shared shapes and checks; pack.ts
// writes a bundle from a deck directory and unpack.ts writes a deck directory from a bundle.
// Framework free: the CLI, the studio's server functions and its two routes all use it.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

import { STATE_DIR } from './file-store.ts';
import { isSafeKey } from './seed.ts';

export const BUNDLE_VERSION = 1;
export const BUNDLE_MANIFEST = 'manifest.json';
export const BUNDLE_MEDIA_TYPE = 'application/zip';
/** The upload cap of the studio route and the CLI push: 200 MB. */
export const BUNDLE_MAX_BYTES = 200 * 1024 * 1024;
/** The lease file never travels: leases expire and belong to one store. */
const LEASES_FILE = 'leases.json';

export type BundleDigest = { bytes: number; sha256: string };

export type BundleManifest = {
  bundleVersion: typeof BUNDLE_VERSION;
  deckId: string;
  title: string;
  revision: number;
  /** when the bundle was written, ISO 8601 */
  packedAt: string;
  /** deck.json, slides/<id>.json, versions/<n>.json and the sidecars, by path relative to the deck directory */
  documents: Record<string, BundleDigest>;
  /** the twins and recipes under assets/, by the same relative path */
  assets: Record<string, BundleDigest>;
  /**
   * the comments sidecar (`comments/index.json`, `comments/<threadId>.json`, `comments/authors.json`;
   * gslides-parity SPEC-3 2.2, 5.2), carried only when the packer asked for it; absent on a bundle
   * written before the round or without `--comments`
   */
  comments?: Record<string, BundleDigest>;
};

/** The deck's files grouped as the manifest records them. */
export type DeckFileList = { documents: string[]; assets: string[]; comments: string[] };

/** The sidecar folder of the comments (SPEC-3 2.2); its files form the bundle's `comments` group. */
export const COMMENTS_GROUP = 'comments';

/** The files that never travel in a bundle (SPEC-3 2.2): the access record and the leases. */
export const BUNDLE_DROPS: ReadonlySet<string> = new Set(['access.json', LEASES_FILE]);

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** `decks/<id>/`: where a deck's files sit inside the archive. */
export function bundleEntryPrefix(deckId: string): string {
  return `decks/${deckId}/`;
}

/** `<deckId>-r<revision>.zip`, the name a download and `deck pack` default to. */
export function bundleFileName(deckId: string, revision: number): string {
  return `${deckId}-r${revision}.zip`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDigests(raw: unknown, field: string, file: string): Record<string, BundleDigest> {
  if (!isRecord(raw)) throw new TypeError(`${file}: ${field} must be an object of digests`);
  const out: Record<string, BundleDigest> = {};
  for (const [path, digest] of Object.entries(raw)) {
    if (!isSafeKey(path)) throw new TypeError(`${file}: ${field} names an unsafe path "${path}"`);
    if (
      !isRecord(digest) ||
      typeof digest.bytes !== 'number' ||
      !Number.isInteger(digest.bytes) ||
      digest.bytes < 0 ||
      typeof digest.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(digest.sha256)
    ) {
      throw new TypeError(`${file}: ${field}/${path} must be { bytes, sha256 }`);
    }
    out[path] = { bytes: digest.bytes, sha256: digest.sha256 };
  }
  return out;
}

/** Parses manifest.json; a TypeError names the first field that does not hold. */
export function parseBundleManifest(raw: unknown, file = BUNDLE_MANIFEST): BundleManifest {
  if (!isRecord(raw)) throw new TypeError(`${file} must hold one JSON object`);
  if (raw.bundleVersion !== BUNDLE_VERSION) {
    throw new TypeError(
      `${file}: bundleVersion must be ${BUNDLE_VERSION}, got ${JSON.stringify(raw.bundleVersion)}; this studio reads bundle version ${BUNDLE_VERSION}`,
    );
  }
  if (typeof raw.deckId !== 'string' || raw.deckId === '') {
    throw new TypeError(`${file}: deckId must be a non-empty string`);
  }
  if (typeof raw.title !== 'string') throw new TypeError(`${file}: title must be a string`);
  if (typeof raw.revision !== 'number' || !Number.isInteger(raw.revision) || raw.revision < 0) {
    throw new TypeError(`${file}: revision must be a non-negative integer`);
  }
  if (typeof raw.packedAt !== 'string') throw new TypeError(`${file}: packedAt must be a string`);
  const documents = parseDigests(raw.documents, 'documents', file);
  if (documents['deck.json'] === undefined) {
    throw new TypeError(`${file}: documents must include deck.json`);
  }
  const comments =
    raw.comments === undefined ? undefined : parseDigests(raw.comments, 'comments', file);
  for (const path of Object.keys(comments ?? {})) {
    if (!path.startsWith(`${COMMENTS_GROUP}/`) || !path.endsWith('.json')) {
      throw new TypeError(`${file}: comments/${path} is not a comments sidecar file`);
    }
  }
  return {
    bundleVersion: BUNDLE_VERSION,
    deckId: raw.deckId,
    title: raw.title,
    revision: raw.revision,
    packedAt: raw.packedAt,
    documents,
    assets: parseDigests(raw.assets, 'assets', file),
    ...(comments === undefined ? {} : { comments }),
  };
}

/** True for the top-level JSON files a deck directory carries beside deck.json: the sidecars, never the access record or the leases. */
export function isSidecar(name: string): boolean {
  return name.endsWith('.json') && name !== 'deck.json' && !BUNDLE_DROPS.has(name);
}

/**
 * The files of a deck directory a bundle carries, as posix paths relative to the directory:
 * deck.json, the sidecars, slides/*.json, versions/*.json (when `versions` is on) and everything
 * under assets/. Dotfiles, the .turboslide state folder, leases.json and unknown folders stay out.
 */
export function listDeckFiles(
  dir: string,
  options: { versions?: boolean; comments?: boolean } = {},
): DeckFileList {
  if (!existsSync(join(dir, 'deck.json'))) throw new RangeError(`No deck.json in ${dir}`);
  const documents: string[] = ['deck.json'];
  const assets: string[] = [];
  const comments: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === STATE_DIR) continue;
    if (entry.isFile() && isSidecar(entry.name)) documents.push(entry.name);
  }
  const jsonFolder = (folder: string): void => {
    const path = join(dir, folder);
    if (!existsSync(path) || !statSync(path).isDirectory()) return;
    for (const name of readdirSync(path)) {
      if (name.startsWith('.') || !name.endsWith('.json')) continue;
      if (statSync(join(path, name)).isFile()) documents.push(posix.join(folder, name));
    }
  };
  jsonFolder('slides');
  if (options.versions !== false) jsonFolder('versions');
  if (options.comments === true) {
    const path = join(dir, COMMENTS_GROUP);
    if (existsSync(path) && statSync(path).isDirectory()) {
      for (const name of readdirSync(path)) {
        if (name.startsWith('.') || !name.endsWith('.json')) continue;
        if (statSync(join(path, name)).isFile()) comments.push(posix.join(COMMENTS_GROUP, name));
      }
    }
  }
  const assetsDir = join(dir, 'assets');
  if (existsSync(assetsDir) && statSync(assetsDir).isDirectory()) {
    const walk = (folder: string, relative: string): void => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const rel = posix.join(relative, entry.name);
        if (entry.isDirectory()) walk(join(folder, entry.name), rel);
        else if (entry.isFile()) assets.push(rel);
      }
    };
    walk(assetsDir, 'assets');
  }
  return { documents: documents.sort(), assets: assets.sort(), comments: comments.sort() };
}

// ---------------------------------------------------------------------------------------------
// The asset scan: every file under assets/ must be an image of the type its name claims, or JSON

export type AssetKind = 'png' | 'jpeg' | 'gif' | 'webp' | 'svg' | 'json';

const KIND_BY_EXTENSION: Record<string, AssetKind> = {
  '.png': 'png',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.gif': 'gif',
  '.webp': 'webp',
  '.svg': 'svg',
  '.json': 'json',
};

/** The asset kind an extension announces, or null for an extension the bundle does not carry. */
export function assetKindOf(path: string): AssetKind | null {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return null;
  return KIND_BY_EXTENSION[path.slice(dot).toLowerCase()] ?? null;
}

function startsWith(bytes: Uint8Array, signature: ReadonlyArray<number>, at = 0): boolean {
  if (bytes.byteLength < at + signature.length) return false;
  return signature.every((byte, index) => bytes[at + index] === byte);
}

/** The image type the bytes carry by their signature; null when they are none of the five. */
export function sniffImage(bytes: Uint8Array): Exclude<AssetKind, 'json'> | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39))
    return 'gif';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return 'webp';
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, Math.min(bytes.byteLength, 4096)))
    .replace(/^\uFEFF/, '')
    .trimStart();
  if (
    (head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!--')) &&
    /<svg[\s>]/.test(head)
  )
    return 'svg';
  return null;
}

/**
 * Why an asset entry is refused, or null when it passes: the extension must be one the deck
 * layout uses (png, jpg, jpeg, gif, webp, svg, json), an image must carry the signature of its
 * extension, and a .json file (a recipe) must parse.
 */
export function assetProblem(path: string, bytes: Uint8Array): string | null {
  const kind = assetKindOf(path);
  if (kind === null)
    return `${path}: only png, jpg, gif, webp, svg and json files travel under assets/`;
  if (kind === 'json') {
    try {
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      return null;
    } catch {
      return `${path}: not valid JSON`;
    }
  }
  const sniffed = sniffImage(bytes);
  if (sniffed === null) return `${path}: the bytes are not an image`;
  if (sniffed !== kind) return `${path}: the bytes are a ${sniffed} image, not ${kind}`;
  return null;
}
