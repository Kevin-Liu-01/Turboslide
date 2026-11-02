// The export font set (SPEC 8.4; docs/DESIGN.md 4.3, decision C8): which family name a run
// travels under, and which file embeds it. Weight 500 has no DrawingML attribute (only the bold
// flag), so the medium cut is its own family (pptx report section 4.2). Every name is one the
// upstream Inter release installs under or Inter followed by a size: `standard` (the default)
// names Inter and Inter Medium under 44 px and Inter Display and Inter Display Medium from 44 px,
// and takes the width the opsz 14 text faces add over the browser's optical size back as
// character spacing (fonts.json `spacing`, face-advance.ts); `exact` names a per size cut, Inter
// Text 14 to Inter Text 26, under 44 px. In both, a heading whose computed features carry cv11 or
// ss01 (General Translation's theme) names Inter Display Alternates, the one face with those
// letters frozen into its glyphs, because DrawingML cannot ask for a stylistic set. The set
// carries Regular and Medium cuts only: a run at 600 or 700 (the inspector offers 300 to 700,
// schema/typography.ts) travels as the Medium family plus the bold flag, a run under 400 as the
// Regular family, and the report's residual names the substitution (docs/pptx.md). The files
// and the recorded mapping come from packages/fonts/export/fonts.json, which scripts/build-fonts.py
// writes (the fonts builder); when that file is absent the table below still names the families
// and the report lists them under requiredOnViewer instead of embedded.
//
// Inter's LICENSE.txt (SIL OFL 1.1, THIRD_PARTY_NOTICES.md) declares no Reserved Font Name after
// its copyright statement, so modified instances may carry the Inter names (SPEC 11, open
// question 5); scripts/build-fonts.py refuses to build if a later release declares one.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { catalogFont } from '@turboslide/fonts/catalog';
import type { ExportCut, ExportPick } from '@turboslide/fonts/export-cuts';
import { exportPlanFor, pickExportCut } from '@turboslide/fonts/export-cuts';
import { FONT_NAMES } from '@turboslide/fonts/names';
import type { ExportFontSet } from '@turboslide/schema/export';
import type { FontCategory, FontId } from '@turboslide/schema/fonts';

import type { EmbedFont, FontSlot } from '../ooxml/fonts.ts';

export type FontSet = ExportFontSet;

/** The text families of the standard set by weight cut. */
export const STANDARD_FAMILIES = { 400: 'Inter', 500: 'Inter Medium' } as const;

/** The display families (opsz 32) by weight cut. */
export const DISPLAY_FAMILIES = { 400: 'Inter Display', 500: 'Inter Display Medium' } as const;

/** The display face with cv11 and ss01 frozen, for a theme that draws those letters. */
export const ALTERNATES_FAMILY = 'Inter Display Alternates';

/** Runs at and above this size travel in a display face (SPEC 8.4 table). */
export const DISPLAY_FROM_PX = 44;

/** The optical sizes the exact set is cut at (SPEC 8.4 table). */
export const EXACT_OPSZ = [14, 15, 18, 20, 22, 24, 26] as const;

export type FontEntry = {
  family: string;
  /** File name under packages/fonts/export/, when the set has been built. */
  file?: string;
  weight: number;
  opsz: number;
  display: boolean;
  /** the italic twin of the family (gslides-parity SPEC-2 7.1), embedded in its Italic slot */
  italic: boolean;
};

type FontsJsonFace = {
  family: string;
  file: string;
  weight: number;
  opsz?: number;
  display?: boolean;
  italic?: boolean;
  sizes?: number[];
  sets?: string[];
};

/** scripts/build-fonts.py writes `faces`; `families` is accepted when it is the same array. */
export type FontsJson = {
  version?: string;
  faces?: FontsJsonFace[];
  families?: FontsJsonFace[] | Record<string, unknown>;
  /** family to whole pixel size to the share the run is wider than in the browser */
  spacing?: Record<string, Record<string, number>>;
};

export type FontsCatalog = {
  version: string;
  entries: FontEntry[];
  /** The directory the files live in. */
  dir: string;
  /** True when fonts.json was read. */
  built: boolean;
  /** The standard set's width difference from the browser (fonts.json `spacing`); empty unbuilt. */
  spacing: Record<string, Record<string, number>>;
  /** The catalog faces' cuts under `catalog/` (catalog.json, build-export-cuts.mjs). */
  cuts: CatalogCuts;
};

/** One built cut of a catalog face (catalog.json `faces.<id>.cuts`). */
export type CatalogCutEntry = ExportCut & {
  bytes: number;
  sha256: string;
  /** whole pixel size to the share the cut draws wider than the browser; opsz faces only */
  spacing?: Record<string, number>;
};

export type CatalogCuts = {
  version: string;
  /** The directory the face folders live in. */
  dir: string;
  /** Every built cut, by face. */
  cuts: CatalogCutEntry[];
  /** Face id to the reason it has no cut (the licence rule of export-cuts.ts). */
  refused: Partial<Record<FontId, string>>;
};

type CatalogJson = {
  version?: string;
  faces?: Record<
    string,
    { refused?: string | null; cuts?: Omit<CatalogCutEntry, 'id'>[] } | undefined
  >;
};

function fontsExportDir(): string {
  // a bundled server names the folder (docs/hosting.md; @turboslide/fonts/export exportFontsDir)
  const override = process.env.TURBOSLIDE_PACKAGES_DIR;
  if (override) return join(override, 'fonts', 'export');
  try {
    return join(
      dirname(fileURLToPath(import.meta.resolve('@turboslide/fonts/package.json'))),
      'export',
    );
  } catch {
    return join(process.cwd(), 'packages/fonts/export');
  }
}

/**
 * Reads packages/fonts/export/catalog/catalog.json when present: the built cuts of the catalog
 * faces (packages/fonts/scripts/build-export-cuts.mjs) and the faces the licence rule refuses.
 */
export function loadCatalogCuts(dir: string): CatalogCuts {
  const path = join(dir, 'catalog.json');
  const empty: CatalogCuts = { version: 'unbuilt', dir, cuts: [], refused: {} };
  if (!existsSync(path)) return empty;
  let parsed: CatalogJson;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as CatalogJson;
  } catch {
    return { ...empty, version: 'unreadable' };
  }
  const cuts: CatalogCutEntry[] = [];
  const refused: CatalogCuts['refused'] = {};
  for (const [id, face] of Object.entries(parsed.faces ?? {})) {
    if (typeof face?.refused === 'string') refused[id as FontId] = face.refused;
    for (const cut of face?.cuts ?? []) cuts.push({ ...cut, id: id as FontId });
  }
  return { version: parsed.version ?? 'unknown', dir, cuts, refused };
}

/** Reads packages/fonts/export/fonts.json when present, and the catalog cuts beside it. */
export function loadFontsCatalog(dir: string = fontsExportDir()): FontsCatalog {
  const path = join(dir, 'fonts.json');
  const cuts = loadCatalogCuts(join(dir, 'catalog'));
  if (!existsSync(path))
    return { version: 'unbuilt', entries: [], dir, built: false, spacing: {}, cuts };
  let parsed: FontsJson;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as FontsJson;
  } catch {
    return { version: 'unreadable', entries: [], dir, built: false, spacing: {}, cuts };
  }
  const faces: FontsJsonFace[] = Array.isArray(parsed.faces)
    ? parsed.faces
    : Array.isArray(parsed.families)
      ? parsed.families
      : [];
  const entries: FontEntry[] = faces
    .filter((f) => typeof f.family === 'string' && typeof f.file === 'string')
    .map((f) => ({
      family: f.family,
      file: f.file,
      weight: f.weight,
      opsz: f.opsz ?? 14,
      display: f.display ?? false,
      italic: f.italic ?? false,
    }));
  return {
    version: parsed.version ?? 'unknown',
    entries,
    dir,
    built: entries.length > 0,
    spacing: parsed.spacing ?? {},
    cuts,
  };
}

/** The nearest optical size of the exact set for a text size. */
export function nearestOpsz(sizePx: number): number {
  let best: number = EXACT_OPSZ[0];
  for (const o of EXACT_OPSZ) if (Math.abs(o - sizePx) < Math.abs(best - sizePx)) best = o;
  return best;
}

export type FamilyPick = {
  family: string;
  display: boolean;
  opsz: number;
  /** the cut the family holds */
  weight: 400 | 500;
  /** the run's measured weight, as requested */
  requested: number;
  /** the run travels with the bold flag: the requested weight is 600 or more */
  bold: boolean;
};

/** The weight cuts the export set holds; every other weight is a substitution the report names. */
export const EXPORT_WEIGHTS: readonly number[] = [400, 500];

/** The bold flag stands in for the weights above the Medium cut. */
export const BOLD_FROM = 600;

/** Whether a computed `font-feature-settings` asks for General Translation's alternate letters. */
export function drawsAlternates(features: string): boolean {
  return /\b(cv11|ss01)\b/.test(features);
}

/**
 * The family a run travels under. A run at 44 px and above (the h1, h2, big and mood title) goes
 * to a display face (opsz 32): Inter Display or Inter Display Medium, or Inter Display Alternates
 * for a run of weight 500 or more whose features draw cv11 and ss01. Under 44 px a run goes to
 * Inter or Inter Medium in the standard set, or to the per size cut nearest its optical size in
 * the exact set. A weight of 600 or more takes the Medium cut plus `bold`; a weight under 500
 * takes Regular.
 */
export function pickFamily(
  sizePx: number,
  weight: number,
  set: FontSet,
  alternates = false,
): FamilyPick {
  const medium = weight >= 500;
  const bold = weight >= BOLD_FROM;
  const cut = medium ? 500 : 400;
  if (sizePx >= DISPLAY_FROM_PX)
    return {
      family: medium && alternates ? ALTERNATES_FAMILY : DISPLAY_FAMILIES[cut],
      display: true,
      opsz: 32,
      weight: cut,
      requested: weight,
      bold,
    };
  if (set === 'standard')
    return {
      family: STANDARD_FAMILIES[cut],
      display: false,
      opsz: 14,
      weight: cut,
      requested: weight,
      bold,
    };
  const opsz = nearestOpsz(sizePx);
  return {
    family: `Inter Text ${opsz}${medium ? ' Medium' : ''}`,
    display: false,
    opsz,
    weight: medium ? 500 : 400,
    requested: weight,
    bold,
  };
}

/**
 * The residual line for a weight the set has no cut for; null for 400 and 500. One line per
 * distinct weight in the report (build.ts collects them in a Set).
 */
export function weightSubstitution(pick: FamilyPick): string | null {
  if (EXPORT_WEIGHTS.includes(pick.requested)) return null;
  const cut = pick.weight === 500 ? 'Medium' : 'Regular';
  return pick.bold
    ? `fonts: weight ${pick.requested} exported as the ${cut} cut plus bold; the export set carries Regular and Medium cuts only (docs/pptx.md)`
    : `fonts: weight ${pick.requested} exported as the ${cut} cut; the export set carries Regular and Medium cuts only (docs/pptx.md)`;
}

/**
 * The monospace family the code panel travels under (SPEC 8.6). The deck's stack is
 * `ui-monospace, 'SF Mono', Menlo, Consolas, monospace` (head:23); the reference browser in the
 * render worker image resolves it to DejaVu Sans Mono (`fc-match monospace`), and LibreOffice
 * there matched the M2 name Menlo to Noto Sans, a proportional face: the dark theme code panels
 * measured 38 to 147 px narrower and 6 px low (M5 baseline, calibration.json `monoFamily`). The
 * family is the one the verify host resolves; Menlo on macOS is metric compatible with it (Menlo
 * is a DejaVu Sans Mono derivative), and the report's residual names the substitution.
 */
export const MONO_FAMILY = 'DejaVu Sans Mono';

/** The catalog entry for a picked family, when the set has been built. */
export function entryFor(catalog: FontsCatalog, pick: FamilyPick): FontEntry | undefined {
  return catalog.entries.find((e) => e.family === pick.family);
}

/** The catalog's family names (docs/archive/rounds/PRODUCT.md 4.2), the words a PowerPoint file uses. */
const CATALOG_NAMES: ReadonlySet<string> = new Set(Object.values(FONT_NAMES));

/**
 * The first family of a computed `font-family` value, unquoted: `'Playfair Display', Georgia,
 * serif` answers `Playfair Display`. Empty for an empty value.
 */
export function firstFamily(computed: string): string {
  const first = computed.split(',')[0] ?? '';
  return first
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

/**
 * The catalog face a computed family names (docs/archive/rounds/PRODUCT.md 4.2, 4.5): the family name when the
 * first family of the stack is one of the catalog's, else null, so a run set in a catalog face
 * or drawn by the brand kit's Display or Text role travels under that name in `a:latin typeface`
 * and Inter keeps the export set's picks (`Inter Display Medium`, `Inter`, `Inter Text 22`).
 */
export function catalogFamilyName(computed: string): string | null {
  const first = firstFamily(computed);
  if (first === '' || first === 'Inter') return null;
  return CATALOG_NAMES.has(first) ? first : null;
}

// ---------------------------------------------------------------------------------------------
// The catalog faces' cuts (docs/pptx.md "The catalog faces in Editable text";
// @turboslide/fonts/export-cuts)

const CATALOG_IDS: ReadonlyMap<string, FontId> = new Map(
  Object.entries(FONT_NAMES).map(([id, name]) => [name, id as FontId]),
);

/** The planned cuts of a catalog face by its family name; empty for Inter and an unknown name. */
export function catalogCuts(name: string): ExportCut[] {
  const id = CATALOG_IDS.get(name);
  if (id === undefined || id === 'inter') return [];
  return exportPlanFor(id).cuts;
}

/**
 * The cut a run of a catalog face travels in (export-cuts.ts pickExportCut): the family its
 * `a:latin typeface` names and the bold flag. Planned from the catalog's facts, so the name is
 * the same whether or not the files are built; null for a name the catalog does not hold.
 */
export function catalogPick(
  name: string,
  sizePx: number,
  weight: number,
  italic: boolean,
): ExportPick | null {
  return pickExportCut(catalogCuts(name), sizePx, weight, italic);
}

/**
 * The residual line for a catalog run whose weight has no cut (a static face's missing weight, or
 * a weight outside 300 to 700); null when the cut is the run's weight.
 */
export function catalogWeightSubstitution(
  name: string,
  weight: number,
  pick: ExportPick,
): string | null {
  if (pick.cut.weight === weight) return null;
  const boldSlot = pick.cut.slot === 'bold' || pick.cut.slot === 'boldItalic';
  return `fonts: ${name} weight ${weight} exported as the ${pick.cut.weight} cut${pick.bold && !boldSlot ? ' plus bold' : ''}; the export cuts carry ${[...new Set(catalogCuts(name).map((c) => c.weight))].join(', ')} (docs/pptx.md)`;
}

/** The DrawingML pitch and family byte of a catalog category (variable pitch, the GDI family). */
const CATEGORY_PITCH: Readonly<Record<FontCategory, number>> = {
  sans: 0x22,
  serif: 0x12,
  display: 0x52,
  mono: 0x31,
};

/** The slots a slot falls back to when the set has no cut for it, nearest first. */
const SLOT_FALLBACK: Readonly<Record<FontSlot, readonly FontSlot[]>> = {
  regular: [],
  bold: ['regular'],
  italic: ['regular'],
  boldItalic: ['bold', 'italic', 'regular'],
};

/** The pitch and family byte the export set's Inter faces carry (variable pitch, swiss). */
export const INTER_PITCH_FAMILY = 0x22;

export type EmbedList = {
  fonts: EmbedFont[];
  /** family to the reason it could not be embedded, one line each in the residual */
  missing: Map<string, string>;
  /** a file the manifest names but the folder lacks: a broken set, a report warning */
  warnings: string[];
};

/**
 * The files an embed takes for the faces the runs name (ooxml/fonts.ts usedFaceSlots): per
 * family and slot, the Inter set's file (Regular and Italic; the set has no Bold, so a bold run
 * of an Inter family is the viewer's synthesis, as the residual's weight line says) or the
 * catalog cut, and per family with no file the reason: the licence rule refusing the face, the
 * code panel's mono face outside every set, or a set that was not built.
 */
export function embedList(
  used: ReadonlyMap<string, ReadonlySet<FontSlot>>,
  catalog: FontsCatalog,
): EmbedList {
  const out: EmbedList = { fonts: [], missing: new Map(), warnings: [] };
  for (const [family, slots] of used) {
    const inter = catalog.entries.filter((e) => e.family === family && e.file !== undefined);
    const cuts = catalog.cuts.cuts.filter((c) => c.family === family);
    const fileOf = (slot: FontSlot): string | null => {
      const italic = slot === 'italic' || slot === 'boldItalic';
      const entry =
        slot === 'regular' || slot === 'italic'
          ? inter.find((e) => e.italic === italic)
          : undefined;
      if (entry?.file) return join(catalog.dir, entry.file);
      const cut = cuts.find((c) => c.slot === slot);
      return cut ? join(catalog.cuts.dir, cut.id, cut.file) : null;
    };
    const embedded = new Set<FontSlot>();
    let absent = false;
    for (const wanted of slots) {
      // a slot the set has no cut for takes the nearest upright one, which the viewer slants or
      // emboldens as the browser does for a face without that style
      const slot = [wanted, ...SLOT_FALLBACK[wanted]].find((s) => fileOf(s) !== null);
      if (slot === undefined || embedded.has(slot)) continue;
      const path = fileOf(slot) ?? '';
      if (!existsSync(path)) {
        // the hosted function carries the theme faces' folders alone (vite.deploy.config.ts), so
        // a catalog cut the manifest lists may be absent there; an Inter file never is
        if (inter.length > 0)
          out.warnings.push(`${family}: the export set names ${path} but the file is missing`);
        else absent = true;
        continue;
      }
      embedded.add(slot);
      const cut = cuts[0];
      out.fonts.push({
        family,
        slot,
        ttf: readFileSync(path),
        pitchFamily: cut ? CATEGORY_PITCH[catalogFont(cut.id).category] : INTER_PITCH_FAMILY,
      });
    }
    if (embedded.size > 0 || inter.length > 0 || (cuts.length > 0 && !absent)) continue;
    const planned = [...CATALOG_IDS.entries()].find(([name]) =>
      catalogCuts(name).some((c) => c.family === family),
    );
    if (planned) {
      const [name, id] = planned;
      const refused = catalog.cuts.refused[id];
      out.missing.set(
        family,
        refused !== undefined
          ? `${refused}; it travels by name and a viewer without ${name} substitutes`
          : absent
            ? `the cuts of ${name} are not on this host, which carries the theme faces' cuts alone (docs/pptx.md); it travels by name`
            : 'the catalog cuts are not on this host (node packages/fonts/scripts/build-export-cuts.mjs builds them); it travels by name',
      );
    } else if (family === MONO_FAMILY)
      out.missing.set(family, "the code panel's face is in no export set; it travels by name");
    else if (!catalog.built)
      out.missing.set(family, 'the Inter export set is not built here (turboslide fonts build)');
    else out.missing.set(family, 'no export set holds it; it travels by name');
  }
  return out;
}
