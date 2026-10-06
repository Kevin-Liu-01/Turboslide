// The landing's glyphs from the editor's own icon table (docs/DESIGN.md 8.0 "Icons", 8.1, 8.2;
// DR-D4#1). D4 owns this file. Every glyph /home draws in a control, a chip, a dialog or a menu row
// is the glyph `packages/chrome/src/icons.tsx` draws for the same name, so a landing glyph is the
// editor's by construction:
//
// - `iconMaskRules(names)` writes the first screen's glyphs (the navigation's two and, from
//   DR-D4#2, the hero frame's title row and toolbar) as CSS masks for `icons.generated.css`, so
//   they cost no request and no document bytes;
// - `spriteSvg(names)` writes one SVG sprite of `<symbol>`s for the glyphs below the first screen,
//   which `scripts/home/sprite.ts` content hashes under `apps/studio/public/home/` and the band
//   chunks reference with `<use href>`, so the file is requested with the first band that draws
//   one.
//
// icons.tsx is a TSX module that Node's type stripping cannot load, so this reads its source text:
// the `PATHS` table and its two shared arrays, from `/* bars-3-bottom-left` to `export type
// IconProps`, with the table's two type annotations removed, evaluated with the schema's own
// `shapePath` (the drawn shape glyphs). `apps/studio/src/components/home/icons.test.ts` pins the
// result against the module's own `iconPaths` for every name, so a change to the table's shape
// fails a test and never draws another glyph.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { shapePath } from '../../packages/schema/src/shapes.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const ICONS_SOURCE = 'packages/chrome/src/icons.tsx';

/** One path of a glyph, as icons.tsx's `IconPath` (a filled Heroicon or a drawn stroke). */
export type IconPath = {
  d: string;
  evenodd?: boolean;
  stroke?: true;
  width?: number;
  dash?: string;
  translate?: readonly [number, number];
};

let table: Readonly<Record<string, readonly IconPath[]>> | null = null;

/** The editor's icon table, read from icons.tsx's source. */
export function iconTable(): Readonly<Record<string, readonly IconPath[]>> {
  if (table !== null) return table;
  const source = readFileSync(resolve(ROOT, ICONS_SOURCE), 'utf8');
  const start = source.indexOf('/* bars-3-bottom-left');
  const end = source.indexOf('export type IconProps');
  if (start < 0 || end < start) throw new Error(`${ICONS_SOURCE}: the PATHS table was not found`);
  const body = source
    .slice(start, end)
    .replace(/:\s*readonly IconPath\[\]/g, '')
    .replace(/:\s*Record<IconName, readonly IconPath\[\]>/g, '');
  // the table is data the repository holds (Heroicons paths and shapePath calls), read at build
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const read = new Function('shapePath', `${body}\nreturn PATHS;`) as (
    fn: typeof shapePath,
  ) => Record<string, readonly IconPath[]>;
  table = read(shapePath);
  return table;
}

/** The paths of a name; throws on a name the editor's table does not hold. */
export function iconPathsOf(name: string): readonly IconPath[] {
  const paths = iconTable()[name];
  if (paths === undefined) throw new Error(`${ICONS_SOURCE} has no glyph named ${name}`);
  return paths;
}

/**
 * The paths of a glyph as SVG markup on the 20 unit grid, the way `Icon` draws them: a filled
 * entry takes the colour from `fill`, a drawn entry is stroked at its width with round caps and
 * joins. `ink` is the colour written on stroked paths and, for a mask, on filled ones (a mask
 * image has no current colour); null leaves filled paths to inherit `fill`.
 */
export function glyphBody(name: string, ink: string | null): string {
  return iconPathsOf(name)
    .map((path) => {
      const transform =
        path.translate === undefined
          ? ''
          : ` transform="translate(${path.translate[0]} ${path.translate[1]})"`;
      if (path.stroke === true) {
        const dash = path.dash === undefined ? '' : ` stroke-dasharray="${path.dash}"`;
        return `<path d="${path.d}" fill="none" stroke="${ink ?? 'currentColor'}" stroke-width="${path.width ?? 1.5}" stroke-linecap="round" stroke-linejoin="round"${dash}${transform}/>`;
      }
      const rule = path.evenodd === true ? ' fill-rule="evenodd" clip-rule="evenodd"' : '';
      const fill = ink === null ? '' : ` fill="${ink}"`;
      return `<path d="${path.d}"${fill}${rule}${transform}/>`;
    })
    .join('');
}

/** A data URI of one glyph as a mask image: opaque where the glyph draws. */
export function maskUri(name: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">${glyphBody(name, '#000')}</svg>`;
  return `data:image/svg+xml,${svg.replace(/"/g, "'").replace(/[<>#%]/g, (c) => encodeURIComponent(c))}`;
}

/** One rule per name: `.ts-icon[data-icon='<name>'] { --ts-icon: url(<mask>); }`. */
export function iconMaskRules(names: readonly string[]): string[] {
  return names.map(
    (name) => `.ts-icon[data-icon='${name}'] {\n  --ts-icon: url("${maskUri(name)}");\n}`,
  );
}

/**
 * The sprite: one `<symbol id="<id>" viewBox="0 0 20 20">` per name, in the order given, its id
 * the name or the one `idOf` gives. A `<use href="<file>#<id>">` inside an
 * `<svg fill="currentColor">` draws the glyph in the text's colour; drawn strokes inherit
 * `stroke` the same way.
 */
export function spriteSvg(
  names: readonly string[],
  idOf: (name: string, index: number) => string = (name) => name,
): string {
  const symbols = names.map(
    (name, i) =>
      `<symbol id="${idOf(name, i)}" viewBox="0 0 20 20">${glyphBody(name, null)}</symbol>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join('')}</svg>\n`;
}
