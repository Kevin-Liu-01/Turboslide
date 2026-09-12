// The export font set (SPEC 8.4): which family name a run travels under, and which file embeds it.
// Weight 500 has no DrawingML attribute (only the bold flag), so the medium cut is its own family
// (pptx report section 4.2). `exact` maps every size to a per-size Inter instance renamed GT Inter;
// `standard` keeps Inter and Inter Medium under 44 px and the display instance above. The set
// carries Regular and Medium cuts only: a run at 600 or 700 (the inspector offers 300 to 700,
// schema/typography.ts) travels as the Medium family plus the bold flag, a run under 400 as the
// Regular family, and the report's residual names the substitution (docs/pptx.md). The files
// and the recorded mapping come from packages/fonts/export/fonts.json, which scripts/build-fonts.py
// writes (the fonts builder); when that file is absent the table below still names the families
// and the report lists them under requiredOnViewer instead of embedded.
//
// Inter's LICENSE.txt (SIL OFL 1.1, THIRD_PARTY_NOTICES.md) declares no Reserved Font Name after
// its copyright statement, so renamed instances are permitted (SPEC 11, open question 5). Should a
// later Inter release declare one, RESERVED_FONT_NAME switches the prefix back to Inter.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type FontSet = 'exact' | 'standard';

/** Set when Inter's license declares a Reserved Font Name; the family prefix then stays 'Inter'. */
export const RESERVED_FONT_NAME: string | null = null;

export const FAMILY_PREFIX = RESERVED_FONT_NAME === null ? 'GT Inter' : 'Inter';

/** The optical sizes the exact set is cut at (SPEC 8.4 table). */
export const EXACT_OPSZ = [14, 15, 18, 20, 22, 24, 26] as const;

export type FontEntry = {
  family: string;
  /** File name under packages/fonts/export/, when the set has been built. */
  file?: string;
  weight: number;
  opsz: number;
  display: boolean;
};

type FontsJsonFace = {
  family: string;
  file: string;
  weight: number;
  opsz?: number;
  display?: boolean;
  sizes?: number[];
  sets?: string[];
};

/** scripts/build-fonts.py writes `faces`; `families` is accepted when it is the same array. */
export type FontsJson = {
  version?: string;
  prefix?: string;
  faces?: FontsJsonFace[];
  families?: FontsJsonFace[] | Record<string, unknown>;
};

export type FontsCatalog = {
  version: string;
  entries: FontEntry[];
  /** The directory the files live in. */
  dir: string;
  /** True when fonts.json was read. */
  built: boolean;
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

/** Reads packages/fonts/export/fonts.json when present. */
export function loadFontsCatalog(dir: string = fontsExportDir()): FontsCatalog {
  const path = join(dir, 'fonts.json');
  if (!existsSync(path)) return { version: 'unbuilt', entries: [], dir, built: false };
  let parsed: FontsJson;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as FontsJson;
  } catch {
    return { version: 'unreadable', entries: [], dir, built: false };
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
    }));
  if (parsed.prefix !== undefined && parsed.prefix !== FAMILY_PREFIX)
    return {
      version: `${parsed.version ?? 'unknown'} (prefix ${parsed.prefix} differs from ${FAMILY_PREFIX})`,
      entries,
      dir,
      built: entries.length > 0,
    };
  return { version: parsed.version ?? 'unknown', entries, dir, built: entries.length > 0 };
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

/**
 * The family a run travels under. Display text (weight 500 or more at 44 px and above, the h1, h2,
 * big and mood title) goes to the display instance with cv11 and ss01 frozen; everything else to
 * a text instance by optical size in the exact set, or to Inter and Inter Medium in the standard
 * set. A weight of 600 or more takes the Medium cut plus `bold`; a weight under 500 takes Regular.
 */
export function pickFamily(sizePx: number, weight: number, set: FontSet): FamilyPick {
  const medium = weight >= 500;
  const bold = weight >= BOLD_FROM;
  const display = medium && sizePx >= 44;
  if (display)
    return {
      family: `${FAMILY_PREFIX} Display`,
      display: true,
      opsz: 32,
      weight: 500,
      requested: weight,
      bold,
    };
  if (set === 'standard')
    return {
      family: medium ? 'Inter Medium' : 'Inter',
      display: false,
      opsz: 14,
      weight: medium ? 500 : 400,
      requested: weight,
      bold,
    };
  const opsz = nearestOpsz(sizePx);
  return {
    family: `${FAMILY_PREFIX} Text ${opsz}${medium ? ' Medium' : ''}`,
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
