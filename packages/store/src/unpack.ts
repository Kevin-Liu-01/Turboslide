// deck.unpack (docs/deck-transfer.md): a deck directory from a bundle zip. inspectBundle reads
// the archive, checks the manifest, every digest and every asset's image signature, and runs the
// document through validateDeck (SPEC 4.4), all before a byte is written; unpackBundle then writes
// the deck into a staging folder under the decks folder's state directory and renames it into
// place, so a reader never sees a half-written deck. The target id is the bundle's deck id, or
// `as`; an id that is taken becomes the next free `<id>-2`, `<id>-3` unless `replace` is set, in
// which case the deck that holds the id is removed first. An explicit `as` that is taken is
// refused without `replace`, since the caller named it. Framework free: the CLI writes into the
// checkout's decks/, the studio into the folder its store owns (and pushes to Blob after).
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  commentAuthorsSchema,
  commentsIndexSchema,
  threadSchema,
} from '@turboslide/schema/comments';
import type { Deck } from '@turboslide/schema/deck';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import { canonicalJson } from '@turboslide/schema/json';
import { validateDeck } from '@turboslide/schema/validate';
import type { Issue } from '@turboslide/schema/validate';

import type { BundleManifest } from './bundle.ts';
import {
  BUNDLE_DROPS,
  BUNDLE_MANIFEST,
  BUNDLE_MAX_BYTES,
  COMMENTS_GROUP,
  assetProblem,
  bundleEntryPrefix,
  parseBundleManifest,
  sha256Hex,
} from './bundle.ts';
import { STATE_DIR } from './file-store.ts';
import { TEMPLATES_DIR } from './templates.ts';
import { readZip } from './zip.ts';

export type InspectedBundle = {
  manifest: BundleManifest;
  /** the deck's documents by path relative to the deck directory */
  documents: Map<string, Uint8Array>;
  /** the twins and recipes under assets/ */
  assets: Map<string, Uint8Array>;
  /** the comments sidecar files, each validated against the schema (gslides-parity SPEC-3 2.2); empty without the group */
  comments: Map<string, Uint8Array>;
  /** the validated manifest of the bundle */
  deck: Deck;
  /** the validator's issues below severity 3 */
  issues: Issue[];
  /** the entries the reader dropped: the access record, the leases, the state folder (SPEC-3 2.2) */
  dropped: string[];
  counts: { slides: number; assets: number; versions: number; documents: number; comments: number };
};

export type InspectOptions = {
  /** the most bytes the archive may inflate to; default twice BUNDLE_MAX_BYTES */
  maxBytes?: number;
};

const decoder = new TextDecoder('utf-8', { fatal: true });

function parseJsonBytes(bytes: Uint8Array, file: string): unknown {
  try {
    return JSON.parse(decoder.decode(bytes)) as unknown;
  } catch (error) {
    throw new TypeError(
      `${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Folders an archive tool adds that a bundle ignores. */
function isNoise(name: string): boolean {
  return name.startsWith('__MACOSX/') || name.endsWith('/.DS_Store');
}

/**
 * Reads and checks a bundle without writing: the manifest, the entry set against the manifest
 * (nothing missing, nothing extra, every digest matching), the asset scan, and the document
 * through the validator. Every refusal is a TypeError that names the entry.
 */
export function inspectBundle(zip: Uint8Array, options: InspectOptions = {}): InspectedBundle {
  const entries = readZip(zip, { maxTotalBytes: options.maxBytes ?? BUNDLE_MAX_BYTES * 2 });
  const manifestEntry = entries.find((entry) => entry.name === BUNDLE_MANIFEST);
  if (manifestEntry === undefined) {
    throw new TypeError(`Not a deck bundle: no ${BUNDLE_MANIFEST} at the root of the archive`);
  }
  const manifest = parseBundleManifest(parseJsonBytes(manifestEntry.data, BUNDLE_MANIFEST));
  if (!SLUG_PATTERN.test(manifest.deckId)) {
    throw new TypeError(`${BUNDLE_MANIFEST}: deckId "${manifest.deckId}" is not a slug`);
  }
  const prefix = bundleEntryPrefix(manifest.deckId);
  const documents = new Map<string, Uint8Array>();
  const assets = new Map<string, Uint8Array>();
  const comments = new Map<string, Uint8Array>();
  const dropped: string[] = [];
  const commentsGroup = manifest.comments ?? {};
  for (const entry of entries) {
    if (entry.name === BUNDLE_MANIFEST || isNoise(entry.name)) continue;
    if (!entry.name.startsWith(prefix)) {
      throw new TypeError(
        `"${entry.name}" is outside ${prefix}; a bundle holds one deck under decks/<id>/`,
      );
    }
    const relative = entry.name.slice(prefix.length);
    // the records that never travel (SPEC-3 2.2): dropped whether or not the manifest lists them
    if (BUNDLE_DROPS.has(relative) || relative.startsWith(`${STATE_DIR}/`)) {
      dropped.push(relative);
      continue;
    }
    const isAsset = relative.startsWith('assets/');
    const isComment = relative.startsWith(`${COMMENTS_GROUP}/`);
    const group = isAsset ? manifest.assets : isComment ? commentsGroup : manifest.documents;
    const digest = group[relative];
    if (digest === undefined) {
      throw new TypeError(`"${entry.name}" is not listed in ${BUNDLE_MANIFEST}`);
    }
    if (digest.bytes !== entry.data.byteLength || digest.sha256 !== sha256Hex(entry.data)) {
      throw new TypeError(`"${entry.name}" does not match its digest in ${BUNDLE_MANIFEST}`);
    }
    if (isAsset) {
      const problem = assetProblem(relative, entry.data);
      if (problem !== null) throw new TypeError(problem);
      assets.set(relative, entry.data);
    } else if (isComment) {
      checkCommentsFile(relative, entry.data, manifest.deckId);
      comments.set(relative, entry.data);
    } else {
      if (!relative.endsWith('.json')) {
        throw new TypeError(`"${entry.name}": a deck document is a .json file`);
      }
      documents.set(relative, entry.data);
    }
  }
  for (const relative of Object.keys(manifest.documents)) {
    if (
      !documents.has(relative) &&
      !BUNDLE_DROPS.has(relative) &&
      !relative.startsWith(`${STATE_DIR}/`)
    ) {
      throw new TypeError(`${BUNDLE_MANIFEST} lists ${relative}, which the archive does not hold`);
    }
  }
  for (const relative of Object.keys(manifest.assets)) {
    if (!assets.has(relative)) {
      throw new TypeError(`${BUNDLE_MANIFEST} lists ${relative}, which the archive does not hold`);
    }
  }
  for (const relative of Object.keys(commentsGroup)) {
    if (!comments.has(relative)) {
      throw new TypeError(`${BUNDLE_MANIFEST} lists ${relative}, which the archive does not hold`);
    }
  }
  const rawDeck = parseJsonBytes(documents.get('deck.json') as Uint8Array, 'deck.json');
  const rawSlides: Record<string, unknown> = {};
  for (const [relative, bytes] of documents) {
    if (!relative.startsWith('slides/')) continue;
    rawSlides[relative.slice('slides/'.length, -'.json'.length)] = parseJsonBytes(bytes, relative);
  }
  const result = validateDeck({ deck: rawDeck, slides: rawSlides });
  if (result.deck === null || !result.ok) {
    const first = result.issues.find((issue) => issue.severity === 3) ?? result.issues[0];
    throw new TypeError(
      `The bundle does not validate: ${first?.file ?? 'deck.json'}${first?.pointer ?? ''} ${first?.message ?? 'invalid'}`,
    );
  }
  if (result.deck.id !== manifest.deckId) {
    throw new TypeError(
      `deck.json names id "${result.deck.id}" while ${BUNDLE_MANIFEST} names "${manifest.deckId}"`,
    );
  }
  const slides = Object.keys(rawSlides).length;
  const versions = [...documents.keys()].filter((path) => path.startsWith('versions/')).length;
  return {
    manifest,
    documents,
    assets,
    comments,
    deck: result.deck,
    issues: result.issues,
    dropped,
    counts: {
      slides,
      assets: assets.size,
      versions,
      documents: documents.size,
      comments: comments.size,
    },
  };
}

/**
 * A comments sidecar file must parse as what its name says (SPEC-3 2.2, 5.1): the index, the
 * authors, or a thread whose id is its file name and whose deck is this deck. A bad thread refuses
 * the whole bundle before anything is written, as a bad slide does.
 */
function checkCommentsFile(relative: string, bytes: Uint8Array, deckId: string): void {
  const name = relative.slice(`${COMMENTS_GROUP}/`.length);
  const raw = parseJsonBytes(bytes, relative);
  if (name === 'index.json') {
    const parsed = commentsIndexSchema.safeParse(raw);
    if (!parsed.success)
      throw new TypeError(
        `${relative} is not a comments index: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
      );
    if (parsed.data.deckId !== deckId)
      throw new TypeError(`${relative} names deck "${parsed.data.deckId}", not "${deckId}"`);
    return;
  }
  if (name === 'authors.json') {
    const parsed = commentAuthorsSchema.safeParse(raw);
    if (!parsed.success)
      throw new TypeError(
        `${relative} is not a comments author list: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
      );
    return;
  }
  const parsed = threadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TypeError(
      `${relative} is not a comment thread: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
    );
  }
  if (`${parsed.data.id}.json` !== name)
    throw new TypeError(`${relative} holds thread "${parsed.data.id}", whose file name differs`);
  if (parsed.data.deckId !== deckId)
    throw new TypeError(`${relative} names deck "${parsed.data.deckId}", not "${deckId}"`);
}

export type UnpackOptions = {
  /** the decks folder the deck lands in */
  decksDir: string;
  /** the deck id to write under; the bundle's when absent */
  as?: string;
  /** remove a deck that holds the target id first; without it a taken id gets a free sibling */
  replace?: boolean;
  /**
   * whether a deck id is taken; defaults to the folder's deck.json. The hosted studio asks its
   * store, since a deck made on another instance is not in this instance's folder yet.
   */
  exists?: (deckId: string) => Promise<boolean> | boolean;
  maxBytes?: number;
};

export type UnpackResult = {
  /** the id the deck was written under */
  deckId: string;
  /** the id the bundle carried */
  sourceDeckId: string;
  title: string;
  revision: number;
  dir: string;
  /** an existing deck of the same id was removed first */
  replaced: boolean;
  /** the deck id differs from the bundle's */
  renamed: boolean;
  counts: { slides: number; assets: number; versions: number; documents: number; comments: number };
};

/** The first of `<base>`, `<base>-2`, `<base>-3` ... that is not taken. */
export async function freeDeckId(
  base: string,
  exists: (deckId: string) => Promise<boolean> | boolean,
): Promise<string> {
  if (!(await exists(base))) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new RangeError(`No free id under decks/ for ${base}`);
}

function writeUnder(root: string, relative: string, bytes: Uint8Array): void {
  const path = join(root, ...relative.split('/'));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

/**
 * Writes a bundle as decks/<id>. Everything is checked first (inspectBundle); the files go into a
 * staging folder under `<decksDir>/.turboslide/unpack/` and are renamed into place, replacing
 * the deck of the same id only when `replace` is set. When the target id differs from the
 * bundle's, deck.json is rewritten with the new id in canonical form; otherwise every file is
 * written byte for byte as it was packed.
 */
export async function unpackBundle(zip: Uint8Array, options: UnpackOptions): Promise<UnpackResult> {
  const inspected = inspectBundle(zip, {
    ...(options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}),
  });
  const { decksDir } = options;
  const exists =
    options.exists ?? ((deckId: string) => existsSync(join(decksDir, deckId, 'deck.json')));
  const wanted = options.as ?? inspected.manifest.deckId;
  if (!SLUG_PATTERN.test(wanted)) throw new TypeError(`"${wanted}" is not a deck id (a slug)`);
  if (wanted === TEMPLATES_DIR) {
    throw new TypeError(`"${TEMPLATES_DIR}" is the templates folder, not a deck id`);
  }
  let deckId = wanted;
  let replaced = false;
  if (await exists(wanted)) {
    if (options.replace === true) {
      replaced = true;
    } else if (options.as !== undefined) {
      throw new TypeError(
        `decks/${wanted} exists already; pass --replace to overwrite it or another --as`,
      );
    } else {
      deckId = await freeDeckId(wanted, exists);
    }
  }
  const stagingRoot = join(decksDir, STATE_DIR, 'unpack');
  mkdirSync(stagingRoot, { recursive: true });
  const staging = mkdtempSync(join(stagingRoot, `${deckId}-`));
  try {
    for (const [relative, bytes] of inspected.documents) {
      if (relative === 'deck.json' && deckId !== inspected.manifest.deckId) {
        const raw = JSON.parse(decoder.decode(bytes)) as Record<string, unknown>;
        writeUnder(
          staging,
          relative,
          new TextEncoder().encode(canonicalJson({ ...raw, id: deckId })),
        );
        continue;
      }
      writeUnder(staging, relative, bytes);
    }
    for (const [relative, bytes] of inspected.assets) writeUnder(staging, relative, bytes);
    for (const [relative, bytes] of inspected.comments) {
      if (deckId !== inspected.manifest.deckId) {
        // the sidecar names its deck; the copy under a new id is rewritten in canonical form
        const raw = JSON.parse(decoder.decode(bytes)) as Record<string, unknown>;
        writeUnder(
          staging,
          relative,
          new TextEncoder().encode(canonicalJson('deckId' in raw ? { ...raw, deckId } : raw)),
        );
        continue;
      }
      writeUnder(staging, relative, bytes);
    }
    const target = join(decksDir, deckId);
    if (replaced) rmSync(target, { recursive: true, force: true });
    if (existsSync(target)) {
      // a folder without deck.json, or a deck that appeared since the check: never merge into it
      throw new TypeError(`decks/${deckId} exists already; pass --replace to overwrite it`);
    }
    renameSync(staging, target);
    return {
      deckId,
      sourceDeckId: inspected.manifest.deckId,
      title: inspected.deck.title,
      revision: inspected.deck.revision,
      dir: target,
      replaced,
      renamed: deckId !== inspected.manifest.deckId,
      counts: inspected.counts,
    };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
