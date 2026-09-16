// The theme override stylesheet (gslides-parity SPEC-5 0.44, 9.1; R03 4.6): `themeCss(deck)` turns
// `Deck.themeEdits` into one stylesheet scoped to the sheet root that redefines the tokens, the
// frame variables, the corner slot and counter boxes, the chip toggle and the type levels the deck
// changed, empty for an unedited deck so `tokens.test.ts` still pins the base theme. The string
// renderer, the viewer, present mode, the filmstrip clones, the layout tiles, the Themes panel's
// tiles, the print document, the standalone file and the SVG writer load it after the theme's own
// stylesheets through the scene's `themeCss`; the Perfect raster follows the renderer.
//
// The scope is `.ts-sheet:not([data-theme-base])`: every sheet root of every surface holds one
// deck, so the override needs no attribute to stamp; a tile that shows a base theme without the
// deck's edits (the Themes panel's GT and Plate tiles, SPEC-5 9.2) opts out with
// `data-theme-base` through `sheetRootAttributes(id, appearance, { base: true })`. The colour
// blocks are keyed on the appearance the way sheet.css keys them (`.ts-sheet` for light,
// `.ts-sheet[data-theme='dark']` for dark) at a higher specificity, so a light edit never reaches
// a dark sheet. B6's module from day 1 (MILESTONES-5 B6 "Owns"); the integrator landed the
// identity on day 0.
import type { Deck, ThemeBox, ThemeEdits } from '@turboslide/schema/deck';
import { THEME_FONT_ROLES, THEME_TYPE_LEVELS } from '@turboslide/schema/deck';
import type { FontId } from '@turboslide/schema/fonts';
import { THEME_DERIVED_TOKENS } from '@turboslide/schema/validate/theme';
import {
  SHEET_ROOT_CLASS,
  THEME_ATTRIBUTE,
  THEME_BASE_ATTRIBUTE,
  TYPE_LEVEL_SELECTORS,
  crossOffsetOf,
  themeSpec,
} from '@turboslide/theme/themes';
import type { ThemeName } from '@turboslide/theme/tokens';
import { TOKEN_NAMES, parseHex, parseRgba } from '@turboslide/theme/tokens';

// The equation renderer's browser safe API, re-exported here for the lane handler module
// (`apps/cli/src/actions/equation.ts`, which the editor page bundles and which therefore imports
// no Node module): `@turboslide/render` exports no `./blocks/equation` subpath yet (b6.md request
// R6 to the integrator) and this module is the one browser safe subpath B6 owns. Temml itself stays
// the lazy chunk behind `loadEquationEngine`; nothing of it joins the entry graph through this line.
export {
  EQUATION_DEFAULT_SIZE,
  EQUATION_ENGINE_EVENT,
  equationEngine,
  equationMathml,
  loadEquationEngine,
} from './blocks/equation.ts';
export type { EquationEngine, EquationRender } from './blocks/equation.ts';

/** The selector the override sheet scopes to: every sheet root but a base tile. */
export const THEME_CSS_SCOPE = `.${SHEET_ROOT_CLASS}:not([${THEME_BASE_ATTRIBUTE}])`;

/** The id of the `<style>` element a surface keeps the override in, so a live edit replaces it. */
export const THEME_CSS_STYLE_ID = 'ts-theme-css';

/** The selector the override sheet scopes to (the deck argument of the day 0 seam is not needed: one deck per sheet root). */
export function themeCssScope(): string {
  return THEME_CSS_SCOPE;
}

/** True when the deck carries any theme edit beyond its name. */
export function hasThemeEdits(deck: Pick<Deck, 'themeEdits'>): boolean {
  const edits = deck.themeEdits;
  if (edits === undefined) return false;
  return Object.keys(edits).some((key) => key !== 'name');
}

/**
 * The family name and the generic fallback per catalog id (SPEC-5-amendments A5 item 2). The
 * catalog itself is B7's `packages/fonts/src/catalog.ts`; this table repeats the names until B7
 * exports them (b6.md request), when the import replaces it.
 */
const FONT_FACES: Readonly<Record<FontId, { name: string; generic: 'sans' | 'serif' | 'mono' }>> = {
  inter: { name: 'Inter', generic: 'sans' },
  roboto: { name: 'Roboto', generic: 'sans' },
  'open-sans': { name: 'Open Sans', generic: 'sans' },
  lato: { name: 'Lato', generic: 'sans' },
  montserrat: { name: 'Montserrat', generic: 'sans' },
  poppins: { name: 'Poppins', generic: 'sans' },
  'source-sans-3': { name: 'Source Sans 3', generic: 'sans' },
  'source-serif-4': { name: 'Source Serif 4', generic: 'serif' },
  merriweather: { name: 'Merriweather', generic: 'serif' },
  'playfair-display': { name: 'Playfair Display', generic: 'serif' },
  lora: { name: 'Lora', generic: 'serif' },
  'pt-serif': { name: 'PT Serif', generic: 'serif' },
  'libre-baskerville': { name: 'Libre Baskerville', generic: 'serif' },
  'eb-garamond': { name: 'EB Garamond', generic: 'serif' },
  nunito: { name: 'Nunito', generic: 'sans' },
  raleway: { name: 'Raleway', generic: 'sans' },
  'work-sans': { name: 'Work Sans', generic: 'sans' },
  'dm-sans': { name: 'DM Sans', generic: 'sans' },
  'space-grotesk': { name: 'Space Grotesk', generic: 'sans' },
  oswald: { name: 'Oswald', generic: 'sans' },
  'bebas-neue': { name: 'Bebas Neue', generic: 'sans' },
  'roboto-mono': { name: 'Roboto Mono', generic: 'mono' },
  'jetbrains-mono': { name: 'JetBrains Mono', generic: 'mono' },
  'ibm-plex-sans': { name: 'IBM Plex Sans', generic: 'sans' },
  'ibm-plex-mono': { name: 'IBM Plex Mono', generic: 'mono' },
  'fira-code': { name: 'Fira Code', generic: 'mono' },
};

const GENERIC_STACKS = {
  sans: "'Helvetica Neue', Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
} as const;

/** The CSS font stack of a catalog face: its name first, then the base sheet's fallbacks. */
export function fontStack(id: FontId): string {
  const face = FONT_FACES[id];
  return `'${face.name}', ${GENERIC_STACKS[face.generic]}`;
}

type Rule = { selector: string; declarations: string[] };

const px = (value: number): string => `${value}px`;

function appearanceScope(appearance: ThemeName): string {
  return appearance === 'dark'
    ? `${THEME_CSS_SCOPE}[${THEME_ATTRIBUTE}='dark']`
    : `${THEME_CSS_SCOPE}:not([${THEME_ATTRIBUTE}='dark'])`;
}

function colourRules(
  edits: ThemeEdits,
  base: ReturnType<typeof themeSpec>['tokens'],
  appearance: ThemeName,
): Rule[] {
  const map = edits.colors?.[appearance];
  if (map === undefined) return [];
  const scope = appearanceScope(appearance);
  const rules: Rule[] = [];
  const tokens: string[] = [];
  for (const name of TOKEN_NAMES) {
    const value = map[name];
    if (value !== undefined) tokens.push(`--${name}: ${value}`);
  }
  const ink = map.ink;
  if (ink !== undefined) {
    // the derived tokens are alpha forms of the ink (R03 4.2): recomputed from the edited ink
    // with the base alpha unless the record pins one
    const rgb = parseHex(ink);
    for (const name of THEME_DERIVED_TOKENS) {
      if (map[name] !== undefined) continue;
      const { alpha } = parseRgba(base[appearance][name]);
      tokens.push(`--${name}: rgba(${rgb.join(', ')}, ${alpha})`);
    }
  }
  if (tokens.length > 0) rules.push({ selector: scope, declarations: tokens });
  for (const hue of ['ok', 'warn', 'no', 'info'] as const) {
    const value = map[hue];
    if (value !== undefined)
      rules.push({ selector: `${scope} .ic.${hue}`, declarations: [`color: ${value}`] });
  }
  if (map.raised !== undefined)
    rules.push({ selector: `${scope} .panel`, declarations: [`background: ${map.raised}`] });
  if (map.link !== undefined)
    rules.push({ selector: `${scope} .slide a`, declarations: [`color: ${map.link}`] });
  return rules;
}

/** The bottom inset of a box on the page: the page height less the box's lower edge. */
function bottomOf(box: ThemeBox): string {
  const [, y, , h] = box;
  return `calc(var(--ts-sheet-h, 900px) - ${px(y + h)})`;
}

/** The right inset of a box on the page: the page width less the box's right edge. */
function rightOf(box: ThemeBox): string {
  const [x, , w] = box;
  return `calc(var(--ts-sheet-w, 1600px) - ${px(x + w)})`;
}

/**
 * The override stylesheet of a deck: one rule per changed group, nothing for an unedited deck
 * or for a record that carries only a name. `background` emits nothing here because the renderer
 * draws `defaults.background` itself (SPEC-2 2.6) and Edit theme's Background writes both.
 */
export function themeCss(deck: Pick<Deck, 'id' | 'themeEdits' | 'theme'>): string {
  const edits = deck.themeEdits;
  if (edits === undefined) return '';
  const spec = themeSpec(deck.theme);
  const scope = THEME_CSS_SCOPE;
  const rules: Rule[] = [
    ...colourRules(edits, spec.tokens, 'light'),
    ...colourRules(edits, spec.tokens, 'dark'),
  ];

  const root: string[] = [];
  const fonts = edits.fonts;
  if (fonts !== undefined) {
    for (const role of THEME_FONT_ROLES) {
      const id = fonts[role];
      if (id !== undefined) root.push(`--${role}: ${fontStack(id)}`);
    }
  }
  const frame = edits.frame;
  if (frame?.inset !== undefined) {
    root.push(`--rail: ${px(frame.inset)}`);
    root.push(`--cross-offset: ${px(crossOffsetOf(frame.inset, spec.frame.crossSize))}`);
  }
  const mark = edits.mark;
  if (mark?.box !== undefined) {
    const [x, , , h] = mark.box;
    root.push(
      `--mark-left: ${px(x)}`,
      `--mark-bottom: ${bottomOf(mark.box)}`,
      `--mark-height: ${px(h)}`,
    );
  }
  const counter = edits.counter;
  if (counter?.box !== undefined) {
    const [x] = counter.box;
    root.push(
      `--counter-inset: ${counter.side === 'left' ? px(x) : rightOf(counter.box)}`,
      `--counter-bottom: ${bottomOf(counter.box)}`,
    );
  }
  if (root.length > 0) rules.push({ selector: scope, declarations: root });

  if (frame?.rails === false)
    rules.push({
      selector: `${scope} .frame::before, ${scope} .frame::after`,
      declarations: ['display: none'],
    });
  if (frame?.rules === false)
    rules.push({ selector: `${scope} .frame .rule`, declarations: ['display: none'] });
  if (frame?.crosses === false)
    rules.push({ selector: `${scope} .frame .cross`, declarations: ['display: none'] });

  if (mark !== undefined) {
    if (mark.kind === 'none') {
      rules.push({ selector: `${scope} .wordmark`, declarations: ['display: none'] });
    } else if (mark.box !== undefined) {
      rules.push({ selector: `${scope} .wordmark`, declarations: [`width: ${px(mark.box[2])}`] });
      rules.push({
        selector: `${scope} .wordmark svg, ${scope} .wordmark img`,
        declarations: ['width: 100%', 'height: 100%'],
      });
    }
  }

  if (counter !== undefined) {
    const declarations: string[] = [];
    if (counter.show === false) declarations.push('display: none');
    if (counter.side === 'left')
      declarations.push('right: auto', 'left: var(--counter-inset)', 'text-align: left');
    if (counter.box !== undefined) declarations.push(`width: ${px(counter.box[2])}`);
    if (declarations.length > 0) rules.push({ selector: `${scope} .counter`, declarations });
  }

  if (edits.chips?.show === false)
    rules.push({ selector: `${scope} .ts-chips`, declarations: ['display: none'] });

  const levels = edits.type?.levels;
  if (levels !== undefined) {
    for (const level of THEME_TYPE_LEVELS) {
      const step = levels[level];
      if (step === undefined) continue;
      const declarations: string[] = [];
      if (step.size !== undefined) declarations.push(`font-size: ${px(step.size)}`);
      if (step.weight !== undefined) declarations.push(`font-weight: ${step.weight}`);
      if (step.tracking !== undefined) declarations.push(`letter-spacing: ${step.tracking}em`);
      if (declarations.length === 0) continue;
      rules.push({
        selector: TYPE_LEVEL_SELECTORS[level].map((selector) => `${scope} ${selector}`).join(', '),
        declarations,
      });
    }
  }

  return rules.map((rule) => `${rule.selector} { ${rule.declarations.join('; ')}; }`).join('\n');
}
