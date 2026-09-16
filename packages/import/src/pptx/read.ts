// The Node entry of the reader (gslides-parity SPEC-5 5.2; R04 1 decision 4, 9): the bytes of a
// `.pptx` from a path or a `data:` URL, refused by signature before any inflation (`.ppt`,
// encrypted packages, a file that is not a zip, the 200 MB cap), inflated through the store's
// `readZip` with the 400 MB inflate cap (zip64 and a zip bomb are its refusals), read by
// `importPptx`, and written as a deck folder the way `unpackBundle` writes one: into a staging
// folder, validated, then renamed into place with `import-report.json` and `import-ids.json`
// beside the manifest. Everything above this module is Node free.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { canonicalJson } from '@turboslide/schema/json';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import { readZip } from '@turboslide/store/zip';

import { importPptx } from './import-pptx.ts';
import type { ImportPptxOptions, ImportedDocument } from './import-pptx.ts';
import {
  PPTX_INFLATE_MAX_BYTES,
  PPTX_MAX_BYTES,
  PackageRefusal,
  refuseBySignature,
} from './package.ts';
import type { PackageEntry } from './package.ts';

/** A `data:` URL's bytes and media type; undefined for any other string. */
export function decodeDataUrl(value: string): { bytes: Uint8Array; mime: string } | undefined {
  const m = /^data:([^;,]*)(;[^,]*)?,(.*)$/s.exec(value);
  if (m === null) return undefined;
  const mime = m[1] ?? '';
  const base64 = (m[2] ?? '').includes('base64');
  const payload = m[3] ?? '';
  const bytes = base64
    ? new Uint8Array(Buffer.from(payload, 'base64'))
    : new TextEncoder().encode(decodeURIComponent(payload));
  return { bytes, mime };
}

export type PptxSource = { bytes: Uint8Array; fileName: string };

/**
 * The bytes a `file` input names: a `data:` URL anywhere, a path on the machine on the CLI
 * (resolved against `cwd`). A path outside `cwd` is allowed on the CLI (the file lives where the
 * user keeps it); the hosted composition never passes paths (SPEC-5 5.2).
 */
export function readPptxSource(
  file: string,
  options: { cwd?: string; fileName?: string; allowPaths?: boolean } = {},
): PptxSource {
  const data = decodeDataUrl(file);
  if (data !== undefined) {
    if (data.bytes.byteLength > PPTX_MAX_BYTES)
      throw new PackageRefusal(
        'too-large',
        `The file is ${data.bytes.byteLength} bytes; a presentation is at most ${PPTX_MAX_BYTES}`,
      );
    return { bytes: data.bytes, fileName: options.fileName ?? 'upload.pptx' };
  }
  if (options.allowPaths === false)
    throw new TypeError('This transport takes a data: URL or an upload key, not a path');
  const path = resolve(options.cwd ?? process.cwd(), file);
  if (!existsSync(path)) throw new RangeError(`No file at ${path}`);
  const bytes = new Uint8Array(readFileSync(path));
  if (bytes.byteLength > PPTX_MAX_BYTES)
    throw new PackageRefusal(
      'too-large',
      `${basename(path)} is ${bytes.byteLength} bytes; a presentation is at most ${PPTX_MAX_BYTES}`,
    );
  return { bytes, fileName: options.fileName ?? basename(path) };
}

/** The package entries of a `.pptx`: the signature refusals, then the store's zip reader under the inflate cap. */
export function pptxEntries(bytes: Uint8Array, fileName = 'presentation.pptx'): PackageEntry[] {
  refuseBySignature(bytes, fileName);
  try {
    return readZip(bytes, { maxTotalBytes: PPTX_INFLATE_MAX_BYTES });
  } catch (error) {
    if (error instanceof TypeError)
      throw new PackageRefusal('not-zip', `${fileName}: ${error.message}`);
    throw error;
  }
}

/** Reads a `.pptx` from bytes into a deck document (the Node form of `importPptx`). */
export async function importPptxBytes(
  bytes: Uint8Array,
  options: ImportPptxOptions = {},
): Promise<ImportedDocument> {
  const fileName = options.fileName ?? 'presentation.pptx';
  return importPptx(pptxEntries(bytes, fileName), { ...options, fileName });
}

export type WriteDeckOptions = {
  /** replace an existing folder of the same id; refused otherwise */
  replace?: boolean;
  /** a folder for the staging copy; `<decksDir>/.turboslide/import` when absent */
  stagingDir?: string;
};

export type WrittenDeck = { deckId: string; dir: string; files: number; replaced: boolean };

/**
 * Writes an imported document as `<decksDir>/<deckId>`: the manifest, one slide file each, the
 * asset files, `import-report.json` and `import-ids.json`, first into a staging folder, then
 * renamed into place (the pattern of `unpackBundle`). A blocking validation issue refuses the
 * write with the first issue's sentence.
 */
export function writeImportedDeck(
  document: ImportedDocument,
  decksDir: string,
  options: WriteDeckOptions = {},
): WrittenDeck {
  const deckId = document.deck.id;
  if (!SLUG_PATTERN.test(deckId)) throw new TypeError(`"${deckId}" is not a deck id (a slug)`);
  const blocking = document.issues.filter((issue) => issue.severity === 3);
  if (blocking.length > 0) {
    const first = blocking[0];
    throw new TypeError(
      `The imported deck does not validate: ${first?.file ?? ''}${first?.pointer ?? ''}: ${first?.message ?? 'invalid'}`,
    );
  }
  const target = join(decksDir, deckId);
  const exists = existsSync(join(target, 'deck.json'));
  if (exists && options.replace !== true)
    throw new TypeError(`decks/${deckId} exists already; pass --into with another id or --replace`);
  const staging = join(
    options.stagingDir ?? join(decksDir, '.turboslide', 'import'),
    `${deckId}.${process.pid}.${Date.now().toString(36)}`,
  );
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(join(staging, 'slides'), { recursive: true });
  let files = 0;
  for (const slide of document.slides) {
    writeFileSync(join(staging, 'slides', `${slide.id}.json`), canonicalJson(slide));
    files += 1;
  }
  for (const file of document.files) {
    const path = join(staging, ...file.relative.split('/'));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.bytes);
    files += 1;
  }
  writeFileSync(join(staging, 'import-report.json'), canonicalJson({ ...document.report, deckId }));
  writeFileSync(join(staging, 'import-ids.json'), canonicalJson(document.ids));
  writeFileSync(join(staging, 'deck.json'), canonicalJson(document.deck));
  files += 3;
  mkdirSync(dirname(target), { recursive: true });
  if (exists) rmSync(target, { recursive: true, force: true });
  try {
    renameSync(staging, target);
  } catch {
    // a rename across devices: copy then remove
    cpSync(staging, target, { recursive: true });
    rmSync(staging, { recursive: true, force: true });
  }
  return { deckId, dir: target, files, replaced: exists };
}

/** The folder the CLI stages an import under. */
export function importStagingDir(decksDir: string): string {
  return join(decksDir, '.turboslide', 'import');
}
