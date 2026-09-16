// The fonts of the SVG (gslides-parity SPEC-5 6.4; R09 3): `embed` inlines the InterVariable
// woff2 as one `@font-face` data URI (about 470 KB, the default), `outline` draws every run as
// glyph paths through fontkit with the string kept on `aria-label`, `link` names the families and
// draws nothing. The outline instances fontkit's default master of the variable font: fontkit
// 2.0.4 refuses to instance the WOFF2's other weights on this machine (`getVariation(...).layout`
// throws inside its variation processor), so a bold run is drawn from the Regular outlines with
// its weight recorded on the group and the residual says so; the measured advance of each run
// scales the glyph run to the browser's width, so the line boxes hold whatever the master.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as fontkitModule from 'fontkit';

import type { SceneRun } from '../scene/types.ts';

/** The variable Inter file the sheet draws with, the one face every export names (SPEC 8.4). */
export function interVariablePath(): string {
  return fileURLToPath(new URL('../../../fonts/assets/InterVariable.woff2', import.meta.url));
}

let cachedDataUri: string | undefined;

/** The `@font-face` rule of embed mode: the woff2 inlined as a data URI, one rule for every weight. */
export function interFontFaceCss(): string {
  if (cachedDataUri === undefined) {
    const bytes = readFileSync(interVariablePath());
    cachedDataUri = `data:font/woff2;base64,${bytes.toString('base64')}`;
  }
  return `@font-face { font-family: 'Inter'; font-style: normal; font-weight: 100 900; font-display: block; src: url(${cachedDataUri}) format('woff2'); }`;
}

/** The byte size of the embedded font file, for the report. */
export function interFontBytes(): number {
  return existsSync(interVariablePath()) ? readFileSync(interVariablePath()).byteLength : 0;
}

/** A glyph run laid out by fontkit: one path per glyph in font units with its advance. */
export type GlyphRun = {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  glyphs: { path: string; advance: number; codePoints: number[] }[];
  /** The run's total advance in font units. */
  advance: number;
};

type FontkitFont = {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  layout: (
    text: string,
    features?: string[],
  ) => {
    glyphs: { path: { toSVG: () => string }; codePoints: number[] }[];
    positions: { xAdvance: number }[];
  };
};

let cachedFont: FontkitFont | undefined;

/** fontkit's `create`, wherever the build puts it: a named export (the browser build vite serves) or the default member (the Node build). */
function fontkitCreate(): (buffer: Buffer) => FontkitFont {
  const module = fontkitModule as unknown as {
    create?: (buffer: Buffer) => FontkitFont;
    default?: { create?: (buffer: Buffer) => FontkitFont };
  };
  const create = module.create ?? module.default?.create;
  if (create === undefined) throw new Error('fontkit: no create function in the module');
  return create;
}

/** The Inter master opened once per process. */
export function interFont(): FontkitFont {
  if (cachedFont === undefined) cachedFont = fontkitCreate()(readFileSync(interVariablePath()));
  return cachedFont;
}

/** The OpenType features of a run from its computed `font-feature-settings` (`"cv11", "ss01"`) plus kerning. */
export function featuresOf(settings: string): string[] {
  const named = [...settings.matchAll(/"([a-z0-9]{4})"(?:\s+(\d+))?/gi)]
    .filter((m) => m[2] === undefined || m[2] !== '0')
    .map((m) => (m[1] ?? '').toLowerCase());
  return [...new Set(['kern', 'liga', ...named])];
}

/** The glyph outlines of a run's text in the Inter master. */
export function layoutRun(run: SceneRun): GlyphRun {
  const font = interFont();
  const laid = font.layout(run.text, featuresOf(run.style.features));
  const glyphs = laid.glyphs.map((glyph, index) => ({
    path: glyph.path.toSVG(),
    advance: laid.positions[index]?.xAdvance ?? 0,
    codePoints: glyph.codePoints,
  }));
  return {
    unitsPerEm: font.unitsPerEm,
    ascent: font.ascent,
    descent: font.descent,
    glyphs,
    advance: glyphs.reduce((sum, glyph) => sum + glyph.advance, 0),
  };
}
