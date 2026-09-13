// The export font set (SPEC 8.4; MILESTONES M2 item 5; gslides-parity SPEC-2 7.1): the static
// instances scripts/build-fonts.py cuts from InterVariable and InterVariable-Italic into export/,
// described by export/fonts.json. The PPTX builder asks exportFace(sizePx, weight, { italic }) for
// the family name a text run travels under (DrawingML has no weight 500, so the medium cut is its
// own family, pptx report section 1 item 2; an italic run keeps the family and the file carries
// the Italic style), the OOXML post-process embeds exportFaces(set) as .fntdata parts, and the
// render worker's Docker image installs the same files so LibreOffice renders with them.
// fontSetVersion() is what ExportReport.fontSetVersion records. License: SIL OFL 1.1 with no
// Reserved Font Name declared by either source (fonts.json `license`).
import { existsSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type ExportFontSet = 'exact' | 'standard';

export type ExportFace = {
  /** File name under export/. */
  file: string;
  /** The family name a run names in the PPTX and the installed face answers to. */
  family: string;
  style: string;
  /** true for an italic twin (gslides-parity SPEC-2 7.1); the family name is the upright's */
  italic: boolean;
  postScriptName: string;
  opsz: number;
  weight: number;
  /** The display instance (opsz 32 with cv11 and ss01 frozen) for headings. */
  display: boolean;
  /** The sheet pixel sizes this face serves. */
  sizes: number[];
  frozen: string[];
  remappedCodepoints: number;
  sets: ExportFontSet[];
  bytes: number;
  sha256: string;
};

export type ExportFontSource = {
  file: string;
  family: string | null;
  version: string;
  sha256: string;
  bytes: number;
  fsType: number;
  axes: Record<string, [number, number, number]>;
};

export type ExportFonts = {
  version: string;
  generatedBy: string;
  prefix: string;
  source: ExportFontSource & {
    /** the italic source of the same release (SPEC-2 7.1, 0.66) */
    italic: ExportFontSource & { italicAngle: number; release: string; path: string };
  };
  license: {
    id: string;
    reservedFontName: string | null;
    italicReservedFontName: string | null;
    checked: string[];
    note: string;
  };
  textSizes: number[];
  weights: number[];
  displaySizes: number[];
  displayOpsz: number;
  standard: Record<string, string>;
  faces: ExportFace[];
};

/** The directory of the committed set, in a checkout. */
export const EXPORT_FONTS_DIR = new URL('../export/', import.meta.url);

export const FONTS_JSON = new URL('fonts.json', EXPORT_FONTS_DIR);

/**
 * A folder laid out like packages/ that stands in for the workspace in a bundled server (the
 * same variable @turboslide/render/theme-node reads; docs/hosting.md). Unset in a checkout.
 */
export const PACKAGES_DIR_VARIABLE = 'TURBOSLIDE_PACKAGES_DIR';

/** The directory of the set this process reads: the override's fonts/export/, else the checkout's. */
export function exportFontsDir(): URL {
  const override = process.env[PACKAGES_DIR_VARIABLE];
  return override ? pathToFileURL(join(override, 'fonts', 'export') + sep) : EXPORT_FONTS_DIR;
}

/** Headings at and above this size use the display instance (SPEC 8.4 table). */
export const DISPLAY_MIN_PX = 44;

let cached: ExportFonts | undefined;

/** fonts.json, read once. Throws when the set has not been built (`turboslide fonts build`). */
export function loadExportFonts(): ExportFonts {
  if (cached) return cached;
  const path = fileURLToPath(new URL('fonts.json', exportFontsDir()));
  if (!existsSync(path)) {
    throw new Error(
      `@turboslide/fonts: ${path} is missing; run \`turboslide fonts build\` (scripts/build-fonts.py)`,
    );
  }
  cached = JSON.parse(readFileSync(path, 'utf8')) as ExportFonts;
  return cached;
}

/** Absolute path of a face's file. */
export function exportFacePath(face: ExportFace): string {
  return fileURLToPath(new URL(face.file, exportFontsDir()));
}

export function exportFaceBytes(face: ExportFace): Buffer {
  return readFileSync(exportFacePath(face));
}

/** The faces of a set, in fonts.json order, the italic twins included. */
export function exportFaces(set: ExportFontSet = 'exact'): ExportFace[] {
  return loadExportFonts().faces.filter((face) => face.sets.includes(set));
}

/** The version string ExportReport.fontSetVersion carries: `<inter version>+gt.<build>:<set>`. */
export function fontSetVersion(set: ExportFontSet = 'exact'): string {
  return `${loadExportFonts().version}:${set}`;
}

/** The text size of the ladder nearest to a rendered size (ties go down: 16 px is Text 15). */
export function nearestTextSize(sizePx: number, sizes?: readonly number[]): number {
  const ladder = sizes ?? loadExportFonts().textSizes;
  let best = ladder[0] ?? sizePx;
  for (const size of ladder) {
    const d = Math.abs(size - sizePx);
    const bestD = Math.abs(best - sizePx);
    if (d < bestD || (d === bestD && size < best)) best = size;
  }
  return best;
}

/** Weight 500 and above travels as the medium family; everything else as the regular. */
export function exportWeight(weight: number): 400 | 500 {
  return weight >= 500 ? 500 : 400;
}

export type ExportFaceQuery = {
  set?: ExportFontSet;
  /** Force the display instance (a heading block) regardless of size. */
  display?: boolean;
  /** The italic twin of the face (gslides-parity SPEC-2 7.1): the same family, style Italic. */
  italic?: boolean;
};

/**
 * The face a text run at `sizePx` and `weight` exports with. In the exact set a display run is
 * `GT Inter Display` and text runs map to the nearest ladder size and weight; in the standard set
 * headings keep the display face and every text run is `Inter` or `Inter Medium` (SPEC 8.4). An
 * italic run takes the italic twin of the same family (SPEC-2 7.1).
 */
export function exportFace(
  sizePx: number,
  weight: number,
  query: ExportFaceQuery = {},
): ExportFace {
  const fonts = loadExportFonts();
  const set = query.set ?? 'exact';
  const italic = query.italic === true;
  const faces = fonts.faces.filter(
    (face) => face.sets.includes(set) && (face.italic ?? face.style === 'Italic') === italic,
  );
  const display = query.display ?? sizePx >= DISPLAY_MIN_PX;
  if (display) {
    const face = faces.find((f) => f.display);
    if (face) return face;
  }
  const w = exportWeight(weight);
  if (set === 'standard') {
    const family = fonts.standard[String(w)];
    const face = faces.find((f) => f.family === family && !f.display);
    if (face) return face;
  }
  const size = nearestTextSize(sizePx, fonts.textSizes);
  const face = faces.find((f) => !f.display && f.opsz === size && f.weight === w);
  if (!face) {
    throw new RangeError(
      `@turboslide/fonts: no ${set} ${italic ? 'italic ' : ''}face for ${sizePx} px weight ${weight} (opsz ${size}, wght ${w})`,
    );
  }
  return face;
}

/** The family name for a run, the value a `typeface` attribute carries. */
export function exportFamily(sizePx: number, weight: number, query?: ExportFaceQuery): string {
  return exportFace(sizePx, weight, query).family;
}

// ---------------------------------------------------------------------------------------------
// Reading a TrueType name table, for tests and for checking embedded font parts (SPEC 8.5).

/** The platform 3 (Windows) name records of a TrueType file by name id. */
export function ttfNames(buffer: Buffer): Map<number, string> {
  const names = new Map<number, string>();
  const numTables = buffer.readUInt16BE(4);
  let nameOffset = -1;
  let nameLength = 0;
  for (let i = 0; i < numTables; i += 1) {
    const at = 12 + i * 16;
    const tag = buffer.toString('latin1', at, at + 4);
    if (tag === 'name') {
      nameOffset = buffer.readUInt32BE(at + 8);
      nameLength = buffer.readUInt32BE(at + 12);
    }
  }
  if (nameOffset < 0) return names;
  const count = buffer.readUInt16BE(nameOffset + 2);
  const stringOffset = nameOffset + buffer.readUInt16BE(nameOffset + 4);
  for (let i = 0; i < count; i += 1) {
    const rec = nameOffset + 6 + i * 12;
    const platformId = buffer.readUInt16BE(rec);
    const nameId = buffer.readUInt16BE(rec + 6);
    const length = buffer.readUInt16BE(rec + 8);
    const offset = buffer.readUInt16BE(rec + 10);
    if (platformId !== 3) continue;
    const start = stringOffset + offset;
    if (start + length > nameOffset + nameLength) continue;
    const raw = buffer.subarray(start, start + length);
    // Windows records are UTF-16BE; swap to little endian for Node's decoder.
    const swapped = Buffer.from(raw);
    swapped.swap16();
    names.set(nameId, swapped.toString('utf16le'));
  }
  return names;
}
