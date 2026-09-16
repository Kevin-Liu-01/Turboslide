// Node-only loader for the ThemeBundle: reads sheet.css, stage.css and the sprite from
// @turboslide/theme and the Inter CSS from @turboslide/fonts, inlining the woff2 as a data URI so
// a rendered document is self-contained (SPEC 5.2, 5.3: inlined fonts are a determinism rule).
// Browser code never imports this module; the studio serves the stylesheets instead.
//
// Round five (gslides-parity SPEC-5 8.1, 9.3; SPEC-5-amendments A5 item 3): this module is the
// Node entry every render path loads (the exporter's scene extractor, the CLI's render, the
// thumbnails, the studio's viewer route), so it installs the Temml engine into
// `blocks/equation.ts` at import time; every Node render of an equation block draws MathML and
// never the pending source. `loadThemeBundle` appends the scoped Temml stylesheet with the 9 KB
// supplement face to `sheetCss` for every document (the rules match nothing without an equation
// block), inlines the 380 KB Latin Modern Math face only when `options.equations` says the deck
// holds one (`deckUsesEquations`), and appends the `@font-face` rules of the catalog families
// `options.fonts` names (B7's `usedFontIds`) so the headless capture, the thumbnails and the PDF
// draw a used face.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import temml from 'temml';

import { fontFileDataUri } from '@turboslide/fonts/catalog-node';
import type { ThemeId } from '@turboslide/schema/deck';
import type { FontId } from '@turboslide/schema/fonts';
import { themeFolderOf } from '@turboslide/theme/themes';

import { equationCss, setEquationEngine } from './blocks/equation.ts';
// the equation renderer's API for Node callers (the exporter's scene and math modules, the CLI's
// equation.render): `@turboslide/render` exports no `./blocks/equation` subpath yet (b6.md request
// R6 to the integrator), and every Node render path loads this module anyway, so the names travel
// through it until the subpath lands
export {
  EQUATION_DEFAULT_SIZE,
  EQUATION_ENGINE_EVENT,
  EQUATION_SCOPE,
  MATH_FONT_FAMILY,
  TEMML_VERSION,
  clearEquationEngine,
  deckUsesEquations,
  equationCss,
  equationEngine,
  equationMathml,
  loadEquationEngine,
  renderEquation,
  setEquationEngine,
} from './blocks/equation.ts';
export type { EquationCssSources, EquationEngine, EquationRender } from './blocks/equation.ts';
import type { ThemeBundle } from './deck.ts';
import { fontsCss } from './fonts.ts';

setEquationEngine(temml);

/**
 * A folder laid out like the workspace's packages/ (theme/, fonts/, export/) that stands in for
 * the workspace where there is none: a bundled server (a Vercel function) has no
 * @turboslide/theme package to resolve, so the studio materializes the runtime files there and
 * names the folder (docs/hosting.md). Unset in a checkout.
 */
export const PACKAGES_DIR_VARIABLE = 'TURBOSLIDE_PACKAGES_DIR';

function packageDir(name: string): string {
  const override = process.env[PACKAGES_DIR_VARIABLE];
  if (override) return join(override, name.slice('@turboslide/'.length));
  return dirname(fileURLToPath(import.meta.resolve(`${name}/package.json`)));
}

/**
 * The stylesheet folder of a theme under packages/theme/src (gslides-parity SPEC-5 9.3): the GT
 * theme's own folder, or `ts-plate`, whose files carry the Plate rules keyed on
 * `[data-sheet='ts-plate']` over the GT sheet (`@turboslide/theme/themes` `themeFolderOf`).
 */
export function themeFolder(theme: ThemeId = 'gt-ink-paper'): string {
  return themeFolderOf(theme);
}

/** The paths SPEC 3.1 and MILESTONES M1 name for the theme and font files, per theme id. */
export function themePaths(themeId: ThemeId = 'gt-ink-paper'): {
  sheetCss: string;
  stageCss: string;
  /** the GT sheet the Plate rules extend; the same file as `sheetCss` on the GT theme */
  baseSheetCss: string;
  sprite: string;
  interCss: string;
  interWoff2: string;
} {
  const theme = packageDir('@turboslide/theme');
  const fonts = packageDir('@turboslide/fonts');
  const folder = themeFolder(themeId);
  return {
    sheetCss: join(theme, `src/${folder}/sheet.css`),
    stageCss: join(theme, `src/${folder}/stage.css`),
    baseSheetCss: join(theme, 'src/gt-ink-paper/sheet.css'),
    sprite: join(theme, 'assets/sprite.svg'),
    interCss: join(fonts, 'src/inter.css'),
    interWoff2: join(fonts, 'assets/InterVariable.woff2'),
  };
}

/** The equation fonts under packages/render/assets (SPEC-5 8.1): the Temml supplement and Latin Modern Math. */
export function equationFontPaths(): { temmlWoff2: string; mathWoff2: string } {
  const render = packageDir('@turboslide/render');
  return {
    temmlWoff2: join(render, 'assets/Temml.woff2'),
    mathWoff2: join(render, 'assets/latinmodern-math.woff2'),
  };
}

const dataUriCache = new Map<string, string>();

function woff2DataUri(path: string): string {
  let uri = dataUriCache.get(path);
  if (uri === undefined) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(path);
    } catch (error) {
      // a bundled server names the folder in TURBOSLIDE_PACKAGES_DIR and ships the files as the
      // `render/assets/*` entry of its runtime glob (apps/studio/vite.deploy.config.ts
      // PACKAGES_PATTERN); the merge 2 preview lacked the entry and every export answered this
      // ENOENT with no hint (VERIFICATION-5 finding 2), so the sentence names the fix
      throw new Error(
        `@turboslide/render: cannot read the equation font at ${path} (${error instanceof Error ? error.message : String(error)}); packages/render/assets must be in the checkout, or in the ${PACKAGES_DIR_VARIABLE} folder of a bundled server through the deployment's render/assets/* glob`,
      );
    }
    uri = `data:font/woff2;base64,${bytes.toString('base64')}`;
    dataUriCache.set(path, uri);
  }
  return uri;
}

/**
 * The equation stylesheet a Node document inlines: the scoped Temml rules with the supplement
 * face as a data URI, and the math face inlined only when the deck holds an equation block.
 */
export function equationCssNode(options: { equations?: boolean } = {}): string {
  const paths = equationFontPaths();
  return equationCss({
    temmlWoff2: woff2DataUri(paths.temmlWoff2),
    ...(options.equations === true ? { mathWoff2: woff2DataUri(paths.mathWoff2) } : {}),
  });
}

/** The sprite file starts with an HTML comment; the document needs the `<svg>` only. */
export function spriteMarkup(fileText: string): string {
  return fileText.replace(/^\s*<!--[\s\S]*?-->\s*/, '').trim();
}

/** The Inter CSS with the woff2 inlined at its `url(...)`. */
export function inlineFontCss(css: string, woff2: Buffer): string {
  return css.replace(
    /url\(['"]?[^)'"]+['"]?\)/,
    `url(data:font/woff2;base64,${woff2.toString('base64')})`,
  );
}

export type LoadThemeOptions = {
  /** The deck's theme id; the GT theme when absent (gslides-parity SPEC-5 9.3). */
  theme?: ThemeId;
  /** Inline the woff2 (default true). */
  inlineFonts?: boolean;
  /**
   * The deck holds an equation block (`deckUsesEquations`): the Latin Modern Math face is inlined
   * as a data URI (SPEC-5 8.1). Absent or false leaves the OS math face stack, so a deck without
   * an equation pays nothing.
   */
  equations?: boolean;
  /**
   * The catalog families the deck uses (`usedFontIds`, SPEC-5-amendments A5 items 3 and 5): one
   * `@font-face` block per family appended to `fontsCss` with the files inlined, so the headless
   * capture, the thumbnails and the PDF draw a used face. Inter is the base stylesheet's.
   */
  fonts?: readonly FontId[];
  /** Overrides for tests and for a bundle built before the theme lands. */
  overrides?: Partial<ThemeBundle>;
};

export function loadThemeBundle(options: LoadThemeOptions = {}): ThemeBundle {
  const paths = themePaths(options.theme);
  const read = (path: string, what: string): string => {
    try {
      return readFileSync(path, 'utf8');
    } catch (error) {
      throw new Error(
        `@turboslide/render: cannot read ${what} at ${path} (${error instanceof Error ? error.message : String(error)}); the theme builder's files are missing`,
      );
    }
  };
  const overrides = options.overrides ?? {};
  let fontsCssText =
    overrides.fontsCss ??
    (options.inlineFonts === false
      ? read(paths.interCss, 'inter.css')
      : inlineFontCss(read(paths.interCss, 'inter.css'), readFileSync(paths.interWoff2)));
  if (options.fonts !== undefined && options.fonts.length > 0) {
    const used = fontsCss(options.fonts, (id, file) => fontFileDataUri(id, file.file));
    if (used !== '') fontsCssText = `${fontsCssText}\n${used}`;
  }
  // the Plate sheet is the GT sheet plus the rules keyed on its data-sheet (SPEC-5 9.3; R03 5.1)
  const sheet =
    overrides.sheetCss ??
    (paths.sheetCss === paths.baseSheetCss
      ? read(paths.sheetCss, 'sheet.css')
      : `${read(paths.baseSheetCss, 'sheet.css')}\n${read(paths.sheetCss, 'sheet.css')}`);
  const sheetCss =
    overrides.sheetCss !== undefined
      ? sheet
      : `${sheet}\n${equationCssNode({ ...(options.equations === true ? { equations: true } : {}) })}`;
  return {
    sheetCss,
    stageCss: overrides.stageCss ?? read(paths.stageCss, 'stage.css'),
    sprite: overrides.sprite ?? spriteMarkup(read(paths.sprite, 'sprite.svg')),
    fontsCss: fontsCssText,
  };
}
