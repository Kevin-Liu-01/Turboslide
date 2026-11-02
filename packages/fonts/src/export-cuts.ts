// The export cuts of the font catalog (docs/pptx.md "The catalog faces in Editable text"): the
// static TrueType faces the PowerPoint export embeds for a catalog family under --embed-fonts,
// the family name and style slot a run travels under, and the cut a run picks. Planned from the
// catalog's facts (catalog-files.ts) alone, so the export names a run the same way whether or not
// the files are built, and scripts/build-export-cuts.mjs cuts exactly this list into
// export/catalog/<id>/ with export/catalog/catalog.json beside it.
//
// DrawingML names a face by family and carries two style flags, bold and italic, so a family has
// four slots: Regular, Bold, Italic and Bold Italic. Weights 400 and 700 are the family's own
// Regular and Bold; every other weight is a family of its own named after the weight, the legacy
// naming Windows lists a variable font's named instances under and the static Google Fonts
// families use (Poppins SemiBold, IBM Plex Mono Light), the way Inter's Medium cut is
// `Inter Medium` (fonts-map.ts). A face with an optical size axis reaching past 24 is cut twice,
// at opsz 24 for text and at opsz 72 (or the axis maximum) for runs of 44 px and over under
// `<Name> Display`, the split the Inter set makes at the same size; the width a cut draws over
// the browser's optical size at the run's size is recorded per cut and taken back as character
// spacing (catalog.json `spacing`, pptx/text.ts).
//
// The licence rule (docs/archive/rounds/PRODUCT.md 4.2): a catalog face is under the SIL OFL 1.1
// or the Apache License 2.0. An instance of a variable file is a Modified Version, which the OFL
// forbids to carry a Reserved Font Name, so a variable face that declares one is refused (its
// runs still travel by name, and the report names it); a static file is decoded as it ships,
// its name table untouched, so its cut is usable only when the file already answers to the
// planned family and style.
import { THEME_FACTS } from '@turboslide/schema/brand';
import type { FontId } from '@turboslide/schema/fonts';
import { FONT_LICENCES } from '@turboslide/schema/fonts';

import type { CatalogFamilyFacts } from './catalog-files.ts';
import { CATALOG_FILES } from './catalog-files.ts';

/** The facts a plan reads. */
export type ExportFacts = Pick<
  CatalogFamilyFacts,
  'id' | 'name' | 'licence' | 'reservedFontName' | 'axes' | 'files'
>;

/**
 * The catalog faces the themes draw (THEME_FACTS fonts), in FONT_IDS order of first use: the cuts
 * the hosted function carries (apps/studio/vite.deploy.config.ts), so a deck in any theme embeds
 * its type there while a face only a kit or a block names travels by name.
 */
export const THEME_FACE_IDS: readonly FontId[] = [
  ...new Set(
    Object.values(THEME_FACTS).flatMap((facts) => [facts.fonts.display, facts.fonts.text]),
  ),
].filter((id) => id !== 'inter');

/** The weights the export cuts: the inspector's typography control offers 300 to 700. */
export const EXPORT_CUT_WEIGHTS: readonly number[] = [300, 400, 500, 600, 700];

/** Runs at and above this size take a face's display cut, where it has one (the Inter set's split). */
export const DISPLAY_FROM_PX = 44;

/** The optical size of the text cut, clamped to the axis. */
export const TEXT_OPSZ = 24;

/** The optical size of the display cut, clamped to the axis. */
export const DISPLAY_OPSZ = 72;

/** The bold flag stands in for a weight of 600 and over the chosen cut does not reach (CSS synthesis). */
export const SYNTHETIC_BOLD_FROM = 600;

/** The four faces of a DrawingML family. */
export type ExportSlot = 'regular' | 'bold' | 'italic' | 'boldItalic';

export type ExportBand = 'text' | 'display';

export type ExportCut = {
  id: FontId;
  /** the family name a run names in `a:latin typeface` and the cut's name table answers to */
  family: string;
  slot: ExportSlot;
  /** the cut's OS/2 weight class */
  weight: number;
  italic: boolean;
  /** the optical size band; null for a face without an opsz axis */
  band: ExportBand | null;
  /** the optical size the cut is instanced at; null for a face without an opsz axis */
  opsz: number | null;
  /** the woff2 under assets/<id>/ the cut is made from */
  source: string;
  /** a static file decoded as it ships (no instancing, no renaming) */
  decoded: boolean;
  /** the TrueType file under export/catalog/<id>/ */
  file: string;
};

export type ExportPlan = {
  id: FontId;
  name: string;
  cuts: ExportCut[];
  /** why no cut of the face is built; its runs still travel under the planned names */
  refused: string | null;
};

const WEIGHT_NAMES: Readonly<Record<number, string>> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  500: 'Medium',
  600: 'SemiBold',
  800: 'ExtraBold',
  900: 'Black',
};

const SLOT_STYLES: Readonly<Record<ExportSlot, string>> = {
  regular: 'Regular',
  bold: 'Bold',
  italic: 'Italic',
  boldItalic: 'Bold Italic',
};

/** The family a cut answers to: the name, `Display` for the display band, the weight unless 400 or 700. */
export function exportCutFamily(name: string, weight: number, band: ExportBand | null): string {
  const parts = [name];
  if (band === 'display') parts.push('Display');
  const label = WEIGHT_NAMES[weight];
  if (weight !== 400 && weight !== 700 && label !== undefined) parts.push(label);
  return parts.join(' ');
}

/** The slot of a cut: Bold at 700, Regular at every other weight, each with its italic twin. */
export function exportCutSlot(weight: number, italic: boolean): ExportSlot {
  if (weight === 700) return italic ? 'boldItalic' : 'bold';
  return italic ? 'italic' : 'regular';
}

/** The name table style (ID 2) of a slot. */
export function exportSlotStyle(slot: ExportSlot): string {
  return SLOT_STYLES[slot];
}

/** The cut's file name: the PostScript form of the family and the style. */
export function exportCutFile(family: string, slot: ExportSlot): string {
  const compact = (value: string): string => value.replace(/[^A-Za-z0-9]/g, '');
  return `${compact(family)}-${compact(SLOT_STYLES[slot])}.ttf`;
}

function clamp(value: number, [min, max]: [number, number]): number {
  return Math.min(max, Math.max(min, value));
}

/** Why a face has no built cut, or null when its cuts are built (the licence rule above). */
export function exportRefusal(facts: ExportFacts): string | null {
  if (!(FONT_LICENCES as readonly string[]).includes(facts.licence))
    return `licence ${facts.licence} is neither OFL 1.1 nor Apache 2.0`;
  const variable = facts.files.some((file) => Array.isArray(file.weight));
  if (variable && facts.reservedFontName !== null)
    return `the OFL Reserved Font Name "${facts.reservedFontName}" forbids an instanced cut under that name`;
  return null;
}

/**
 * The cuts of a face: per style file, each export weight the file covers (a variable file's
 * range, a static file's own weight), at the text and display optical sizes when the face has an
 * opsz axis reaching past 24, at its one optical size when it stops short. Inter has none here: its
 * set is packages/fonts/export (fonts-map.ts).
 */
export function exportPlan(facts: ExportFacts): ExportPlan {
  const cuts: ExportCut[] = [];
  const opsz = facts.axes?.opsz;
  const bands: { band: ExportBand | null; opsz: number | null }[] = opsz
    ? [
        { band: 'text', opsz: clamp(TEXT_OPSZ, opsz) },
        ...(opsz[1] > TEXT_OPSZ
          ? [{ band: 'display' as const, opsz: clamp(DISPLAY_OPSZ, opsz) }]
          : []),
      ]
    : [{ band: null, opsz: null }];
  if (facts.id !== 'inter')
    for (const file of facts.files) {
      const italic = file.style === 'italic';
      const range = file.weight;
      const weights = Array.isArray(range)
        ? EXPORT_CUT_WEIGHTS.filter((w) => w >= range[0] && w <= range[1])
        : EXPORT_CUT_WEIGHTS.filter((w) => w === range);
      for (const { band, opsz: at } of bands)
        for (const weight of weights) {
          const family = exportCutFamily(facts.name, weight, band);
          const slot = exportCutSlot(weight, italic);
          cuts.push({
            id: facts.id,
            family,
            slot,
            weight,
            italic,
            band,
            opsz: at,
            source: file.file,
            decoded: !Array.isArray(range),
            file: exportCutFile(family, slot),
          });
        }
    }
  return { id: facts.id, name: facts.name, cuts, refused: exportRefusal(facts) };
}

const plans = new Map<FontId, ExportPlan>();

/** The plan of a catalog id, from the generated facts; memoized. */
export function exportPlanFor(id: FontId): ExportPlan {
  let plan = plans.get(id);
  if (plan === undefined) {
    const facts = CATALOG_FILES.find((row) => row.id === id);
    plan = facts ? exportPlan(facts) : { id, name: id, cuts: [], refused: null };
    plans.set(id, plan);
  }
  return plan;
}

/** The weights the CSS font matching algorithm tries for a desired weight, best first (CSS Fonts 4, 5.2). */
function weightOrder(desired: number, available: readonly number[]): number[] {
  const up = [...available].sort((a, b) => a - b);
  const down = [...up].reverse();
  if (desired >= 400 && desired <= 500)
    return [
      ...up.filter((w) => w >= desired && w <= 500),
      ...down.filter((w) => w < desired),
      ...up.filter((w) => w > 500),
    ];
  if (desired < 400) return [...down.filter((w) => w <= desired), ...up.filter((w) => w > desired)];
  return [...up.filter((w) => w >= desired), ...down.filter((w) => w < desired)];
}

export type ExportPick = {
  cut: ExportCut;
  /** the run's `b="1"`: the cut is a Bold slot, or the browser synthesizes bold over a lighter cut */
  bold: boolean;
};

/**
 * The cut a run of a face travels in: the display band from 44 px where the face has one, the
 * italic cut for an italic run where one ships (else the upright, which the viewer slants as the
 * browser does), and the weight the CSS matching algorithm picks among the cuts, so a variable
 * face lands on its exact weight and a static face on the cut the browser drew. Null without cuts.
 */
export function pickExportCut(
  cuts: readonly ExportCut[],
  sizePx: number,
  weight: number,
  italic: boolean,
): ExportPick | null {
  if (cuts.length === 0) return null;
  const display = sizePx >= DISPLAY_FROM_PX && cuts.some((c) => c.band === 'display');
  const banded = cuts.filter((c) => c.band === null || c.band === (display ? 'display' : 'text'));
  const styled = banded.filter((c) => c.italic === italic);
  const pool = styled.length > 0 ? styled : banded;
  const order = weightOrder(weight, [...new Set(pool.map((c) => c.weight))]);
  const cut = pool.find((c) => c.weight === order[0]);
  if (!cut) return null;
  const boldSlot = cut.slot === 'bold' || cut.slot === 'boldItalic';
  return { cut, bold: boldSlot || (weight >= SYNTHETIC_BOLD_FROM && cut.weight < 600) };
}
