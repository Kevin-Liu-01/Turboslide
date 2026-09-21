// The catalog's bytes for Node callers (gslides-parity SPEC-5-amendments A5 items 3 and 5): the
// standalone build and the headless capture inline a used face as a data URI, the export's
// residual names the files, and the studio's asset route serves them. The catalog itself
// (catalog.ts) is browser safe; this module reads files and stays out of the client graph.
import { readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { FontId } from '@turboslide/schema/fonts';

import { catalogFont, fontAssetPath } from './catalog.ts';
import type { CatalogFile } from './catalog-files.ts';
import { PACKAGES_DIR_VARIABLE } from './export.ts';

/** The package directory in a checkout. */
export const FONTS_PACKAGE_DIR = new URL('../', import.meta.url);

/** The package directory this process reads: the TURBOSLIDE_PACKAGES_DIR override's fonts/, else the checkout's. */
export function fontsPackageDir(): URL {
  const override = process.env[PACKAGES_DIR_VARIABLE];
  return override ? pathToFileURL(join(override, 'fonts') + sep) : FONTS_PACKAGE_DIR;
}

/** The absolute URL of one catalog file. */
export function fontFileUrl(id: FontId, file: string): URL {
  return new URL(fontAssetPath(id, file), fontsPackageDir());
}

/** The bytes of one catalog file. */
export function fontFileBytes(id: FontId, file: string): Buffer {
  return readFileSync(fileURLToPath(fontFileUrl(id, file)));
}

/** A `data:` URI of one catalog file, the `src` a self contained document uses. */
export function fontFileDataUri(id: FontId, file: string): string {
  return `data:font/woff2;base64,${fontFileBytes(id, file).toString('base64')}`;
}

/** The files of a face with their bytes, for a writer that embeds or measures them. */
export function fontFilesWithBytes(id: FontId): { file: CatalogFile; bytes: Buffer }[] {
  return catalogFont(id).files.map((file) => ({ file, bytes: fontFileBytes(id, file.file) }));
}
