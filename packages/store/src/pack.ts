// deck.pack (docs/deck-transfer.md): a deck directory as one bundle zip. The archive holds
// manifest.json first and then `decks/<id>/<file>` for every file listDeckFiles names, in sorted
// order, every entry stamped with the deck's updatedAt, so packing the same revision twice gives
// the same bytes. The manifest carries a sha256 per file; unpack.ts checks them before it writes.
// Framework free: `turboslide deck pack` writes the file, the studio's download route and its
// server function hand the bytes on.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { canonicalJson } from '@turboslide/schema/json';

import type { BundleDigest, BundleManifest } from './bundle.ts';
import {
  BUNDLE_MANIFEST,
  BUNDLE_VERSION,
  bundleEntryPrefix,
  bundleFileName,
  listDeckFiles,
  sha256Hex,
} from './bundle.ts';
import { loadDeckDir } from './file-store.ts';
import { writeZip } from './zip.ts';
import type { ZipEntry } from './zip.ts';

export type PackOptions = {
  /** carry versions/<n>.json; default true */
  versions?: boolean;
  /** the clock for packedAt, for tests */
  now?: () => string;
};

export type PackedBundle = {
  zip: Uint8Array<ArrayBuffer>;
  manifest: BundleManifest;
  /** `<deckId>-r<revision>.zip` */
  fileName: string;
  counts: { documents: number; assets: number; versions: number };
};

export type PackResult = {
  deckId: string;
  title: string;
  revision: number;
  /** the file written */
  out: string;
  bytes: number;
  sha256: string;
  counts: { documents: number; assets: number; versions: number };
};

function digestOf(bytes: Uint8Array): BundleDigest {
  return { bytes: bytes.byteLength, sha256: sha256Hex(bytes) };
}

/**
 * Packs a deck directory. The directory is read through the validator first, so a folder that is
 * not a deck is a TypeError before any bytes are produced; a deck with validation issues still
 * packs, since the bundle carries the files as they are and unpack validates on the other side.
 */
export function packDeckDir(dir: string, options: PackOptions = {}): PackedBundle {
  const { document } = loadDeckDir(dir);
  const { deck } = document;
  const files = listDeckFiles(dir, { versions: options.versions !== false });
  const prefix = bundleEntryPrefix(deck.id);
  const documents: Record<string, BundleDigest> = {};
  const assets: Record<string, BundleDigest> = {};
  const entries: ZipEntry[] = [];
  for (const relative of files.documents) {
    const bytes = new Uint8Array(readFileSync(join(dir, ...relative.split('/'))));
    documents[relative] = digestOf(bytes);
    entries.push({ name: `${prefix}${relative}`, data: bytes });
  }
  for (const relative of files.assets) {
    const bytes = new Uint8Array(readFileSync(join(dir, ...relative.split('/'))));
    assets[relative] = digestOf(bytes);
    entries.push({ name: `${prefix}${relative}`, data: bytes });
  }
  const now = options.now ?? (() => new Date().toISOString());
  const manifest: BundleManifest = {
    bundleVersion: BUNDLE_VERSION,
    deckId: deck.id,
    title: deck.title,
    revision: deck.revision,
    packedAt: now(),
    documents,
    assets,
  };
  const stamp = new Date(deck.updatedAt);
  const zip = writeZip(
    [
      { name: BUNDLE_MANIFEST, data: new TextEncoder().encode(canonicalJson(manifest)) },
      ...entries,
    ],
    { date: Number.isNaN(stamp.getTime()) ? new Date(Date.UTC(1980, 0, 1)) : stamp },
  );
  return {
    zip,
    manifest,
    fileName: bundleFileName(deck.id, deck.revision),
    counts: {
      documents: files.documents.length,
      assets: files.assets.length,
      versions: files.documents.filter((path) => path.startsWith('versions/')).length,
    },
  };
}

/** `turboslide deck pack`: the bundle written to `out`, folders created as needed. */
export function writeDeckBundle(dir: string, out: string, options: PackOptions = {}): PackResult {
  const packed = packDeckDir(dir, options);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, packed.zip);
  return {
    deckId: packed.manifest.deckId,
    title: packed.manifest.title,
    revision: packed.manifest.revision,
    out,
    bytes: packed.zip.byteLength,
    sha256: sha256Hex(packed.zip),
    counts: packed.counts,
  };
}
