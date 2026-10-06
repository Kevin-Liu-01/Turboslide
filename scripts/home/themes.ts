// The kits band's themes (docs/DESIGN.md 8.7): the library's nine themes as the product writes
// them for the page deck. D4's build module; scripts/build-home-assets.ts calls it in its
// derivation (no browser) and writes two modules:
//
// - themes.generated.ts, imported by the kits band's chunk alone: each theme's stylesheet, the
//   renderer's own `themeCss` (packages/render/src/theme-css.ts) of the page deck with that theme
//   and the deck's kit, scoped to the page's slides. The renderer keys a slide's appearance on its
//   own `data-theme`; the page's slides carry none and follow the page's (home.css), so the two
//   appearance selectors are rewritten to the page's root, and the heading selectors name the
//   page's heading classes. General Translation is the sheet itself and writes nothing.
// - theme-tiles.generated.ts, read by the band's markup: each theme's id, name, sentence and the
//   paper and ink of each appearance for its tile (the accents stay on the slides: nothing on the
//   page outside a slide is coloured at rest, LANDING.md 2.0).
import { themeCss } from '../../packages/render/src/theme-css.ts';
import { themeIdOf } from '../../packages/schema/src/brand.ts';
import { THEME_RECORDS } from '../../packages/theme/src/themes.ts';

/** Every slide the page draws: the hero frame, the bands, the grid, the show and the print. */
export const THEME_ROOT = '.ts-product [data-home-slides]';

function fail(message: string): never {
  console.error(`home/themes: ${message}`);
  process.exit(1);
}

/** The page deck's stylesheet for one theme, its appearance read from the page's root. */
export function pageThemeCss(deck: Record<string, unknown>, theme: string): string {
  const css = themeCss({ ...deck, theme } as Parameters<typeof themeCss>[0], { root: THEME_ROOT });
  const light = `${THEME_ROOT}:not([data-theme='dark'])`;
  const dark = `${THEME_ROOT}[data-theme='dark']`;
  const out = css
    .split(light)
    .join(`:root:not([data-theme='dark']) ${THEME_ROOT}`)
    .split(dark)
    .join(`:root[data-theme='dark'] ${THEME_ROOT}`);
  if (/\[data-home-slides\]\[data-theme|\[data-home-slides\]:not\(\[data-theme/.test(out))
    fail(`${theme}: an appearance selector on the slide root is left`);
  /* the page's slides draw their headings as .ts-home-h1 to .ts-home-h3 (one h1 per page), so a
     theme's heading rule (Swiss's accent bar) names those */
  const headings = out.replace(/\.slide h([1-3])(?![\w-])/g, '.slide .ts-home-h$1');
  if (/\.slide h[1-6](?![\w-])/.test(headings)) fail(`${theme}: a heading selector is left`);
  return headings;
}

export function deriveThemeModules(
  header: (spec: string) => string,
  deck: Record<string, unknown>,
): { css: string; tiles: string } {
  const sheets = Object.fromEntries(THEME_RECORDS.map((r) => [r.id, pageThemeCss(deck, r.id)]));
  const tiles = THEME_RECORDS.map((r) => ({
    id: r.id,
    name: r.name,
    sentence: r.sentence,
    light: { paper: r.colors.light.paper, ink: r.colors.light.ink },
    dark: { paper: r.colors.dark.paper, ink: r.colors.dark.ink },
  }));
  return {
    css: `${header('docs/DESIGN.md 8.7')}
//
// Each theme's stylesheet for the page deck: packages/render/src/theme-css.ts \`themeCss\` with
// the theme and the deck's kit, scoped to every slide on /home and keyed on the page's appearance
// (scripts/home/themes.ts). The kits band's chunk swaps one of these in; General Translation is
// the sheet itself and writes nothing.
export const HOME_THEME_CSS: Readonly<Record<string, string>> = ${JSON.stringify(sheets, null, 2)};
`,
    tiles: `${header('docs/DESIGN.md 8.7')}
//
// The theme library's nine tiles (packages/theme/src/themes.ts THEME_RECORDS): each theme's id,
// name, sentence and the paper and ink of each appearance.
export type HomeThemeTile = {
  id: string;
  name: string;
  sentence: string;
  light: { paper: string; ink: string };
  dark: { paper: string; ink: string };
};

export const HOME_THEME_TILES: readonly HomeThemeTile[] = ${JSON.stringify(tiles, null, 2)};

/** The page deck's theme at rest (DESIGN.md 7.9 rule 1). */
export const HOME_THEME_AT_REST = ${JSON.stringify(themeIdOf(deck['theme'] as string | undefined))};
`,
  };
}
