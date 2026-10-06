// The brand kit's override stylesheet (docs/archive/rounds/PRODUCT.md 4.1; ported from round five's theme-css.ts
// and re pointed at `deck.brand`): `themeCss(deck, options)` turns the record into one stylesheet
// scoped to the sheet root that redefines the tokens the six colour roles name, the two font
// stacks, the frame's rails, rules and crosses, and the stage's own wordmark where the
// kit draws its own footer slot (slide.ts renderKitLayer). It is empty for a deck without a
// record, or a record that names nothing the sheet draws, so `tokens.test.ts` still pins the base
// and every existing gate measures the same pixels. renderSlide emits it as a `<style>` inside the
// slide (slide.ts), so the string renderer, the viewer, the show, the filmstrip clones, the
// layout tiles, the print document, the standalone file and the export capture all carry it
// through the one renderer; the Brand kit panel injects the same string under THEME_CSS_STYLE_ID
// as a transient sheet while a colour is typed.
//
// The scope is `.ts-sheet:not([data-theme-base])`: every sheet root of every surface holds one
// deck, so the override needs no attribute to stamp; a tile that shows the base theme opts out
// with `data-theme-base`. The colour blocks are keyed on the appearance the way sheet.css keys
// them (`.ts-sheet` for light, `.ts-sheet[data-theme='dark']` for dark) at a higher specificity,
// so a light edit never reaches a dark sheet. Browser safe: no `node:` import.
//
// The theme under the kit (docs/DESIGN.md 7.5): the deck's theme (packages/theme/src/themes.ts)
// gives every value a base and the kit overrides the fields it names. The theme's own rules come
// first in the sheet (its twelve tokens per appearance, its display features, its frame, its
// title composition and its accent bar), the kit's after them at the same specificity, so a kit
// colour wins. General Translation is the sheet itself, so a General Translation deck without a
// kit still emits nothing and every gate that reads GT pixels keeps them.
import type { BrandKit, KitColor, ThemeId } from '@turboslide/schema/brand';
import {
  GT_THEME_ID,
  KIT_COLORS,
  KIT_COLOR_TOKENS,
  frameOf,
  themeFactsOf,
  themeIdOf,
} from '@turboslide/schema/brand';
import type { Deck } from '@turboslide/schema/deck';
import type { FontId } from '@turboslide/schema/fonts';
import { DEFAULT_FONT_ID } from '@turboslide/schema/fonts';
import { fontFamilyStack } from '@turboslide/fonts/summary';
import { contrastRatio as wcagRatio } from '@turboslide/theme/contrast';
import type { ThemeRecord } from '@turboslide/theme/themes';
import { themeRecord } from '@turboslide/theme/themes';
import type { ThemeName, TokenName } from '@turboslide/theme/tokens';
import {
  DISPLAY,
  DISPLAY_FEATURES_OFF,
  DISPLAY_FEATURES_TOKEN,
  TOKEN_NAMES,
  parseHex,
  parseRgba,
  toHex,
} from '@turboslide/theme/tokens';

/** The deck fields the override sheet reads: the theme and the kit. */
export type ThemeDeck = Pick<Deck, 'brand' | 'theme'>;

/** The selector the override sheet scopes to: every sheet root but a base tile. */
export const THEME_CSS_SCOPE = '.ts-sheet:not([data-theme-base])';

/** The attribute a tile sets to show the base theme without the deck's kit. */
export const THEME_BASE_ATTRIBUTE = 'data-theme-base';

/**
 * The attribute renderSlide writes on a slide of a theme other than General Translation, with the
 * theme's id (docs/DESIGN.md 7.5). The theme's rules scope to a sheet that holds such a slide
 * (`themeScope`), so a stylesheet left in the page by an earlier render, or a picker tile drawing
 * another theme beside the stage, reaches only the sheets of its own theme.
 */
export const THEME_SLIDE_ATTRIBUTE = 'data-ts-theme';

/**
 * The root a deck's rules scope to: every sheet root but a base tile for General Translation (the
 * sheet itself, so a GT deck's kit reads as before), and for any other theme the sheet roots that
 * hold a slide of that theme.
 */
export function themeScope(theme: string | undefined): string {
  const id = themeIdOf(theme);
  return id === GT_THEME_ID
    ? THEME_CSS_SCOPE
    : `${THEME_CSS_SCOPE}:has(.slide[${THEME_SLIDE_ATTRIBUTE}='${id}'])`;
}

/** The id of the `<style>` element a surface keeps a transient override in, so a live edit replaces it. */
export const THEME_CSS_STYLE_ID = 'ts-theme-css';

/** The class of the `<style>` renderSlide emits inside a slide, so a test can find and count it. */
export const THEME_CSS_CLASS = 'ts-kit-css';

/** The derived tokens, alpha forms of the ink (SPEC-5 9.1): recomputed from an edited text colour at the base alphas. */
export const THEME_DERIVED_TOKENS = ['hair', 'hair-soft', 'cross', 'edge', 'thumb'] as const;

/** The tokens that are alpha forms of the paper, recomputed from an edited background colour. */
const PAPER_DERIVED_TOKENS = ['plate'] as const;

/**
 * The CSS font stack of a catalog face: its name first, then the base sheet's fallbacks for its
 * category. One definition for the kit path here and the block path (`--ts-font-<id>`, fonts.ts):
 * `@turboslide/fonts/summary` `fontFamilyStack` (docs/archive/rounds/FEATURES.md 3.5; audit-fonts 16, two stacks
 * for one face fell back to different faces before it loaded).
 */
export function fontStack(id: FontId): string {
  return fontFamilyStack(id);
}

/**
 * The value of `--display-features` for a display face (docs/archive/rounds/FEATURES.md 3.1 item 5): Inter's
 * cv11 and ss01, and `normal` for every other family, whose own ss01 means something else.
 */
export function displayFeatures(display: FontId, theme: ThemeId = GT_THEME_ID): string {
  // Inter draws General Translation's alternates in its theme alone (docs/DESIGN.md 4.2): every
  // other theme draws Inter's defaults
  return display === DEFAULT_FONT_ID && theme === GT_THEME_ID
    ? DISPLAY.features
    : DISPLAY_FEATURES_OFF;
}

/** True when the deck carries a record that changes what the sheet draws. */
export function hasKitOverrides(deck: Pick<Deck, 'brand'>): boolean {
  const kit = deck.brand;
  if (kit === undefined) return false;
  return (
    kit.colors !== undefined ||
    kit.fonts !== undefined ||
    kit.frame !== undefined ||
    kitDrawsFooter(kit)
  );
}

/** True when the deck's sheet draws another theme than the base sheet: any theme but General Translation. */
export function hasThemeOverrides(deck: Pick<Deck, 'theme'>): boolean {
  return themeIdOf(deck.theme) !== GT_THEME_ID;
}

/**
 * True when the kit draws the footer slot itself (slide.ts renderKitLayer) and the stage's
 * `.wordmark` steps aside: a footer logo other than the default in the default corner, a footer
 * text, or a moved footer logo.
 */
export function kitDrawsFooter(kit: BrandKit | undefined): boolean {
  if (kit === undefined) return false;
  const logo = kit.footer?.logo;
  const position = kit.positions?.footerLogo;
  return (
    (logo !== undefined && logo !== 'default') ||
    (kit.footer?.text !== undefined && kit.footer.text !== '') ||
    (position !== undefined && position !== 'bottom-left')
  );
}

type Rule = { selector: string; declarations: string[] };

function appearanceScope(appearance: ThemeName, root: string = THEME_CSS_SCOPE): string {
  return appearance === 'dark' ? `${root}[data-theme='dark']` : `${root}:not([data-theme='dark'])`;
}

function colourRules(
  kit: BrandKit,
  appearance: ThemeName,
  theme: ThemeRecord,
  root: string,
): Rule[] {
  const map = kit.colors?.[appearance];
  if (map === undefined) return [];
  const scope = appearanceScope(appearance, root);
  const rules: Rule[] = [];
  const tokens: string[] = [];
  // the derived alphas and the hint read the deck's theme, the base the kit edits
  const base = theme.tokens[appearance];
  for (const role of KIT_COLORS) {
    const value = map[role];
    if (value !== undefined) tokens.push(`--${KIT_COLOR_TOKENS[role]}: ${value}`);
  }
  // Accent defaults to Primary (docs/archive/rounds/PRODUCT.md 4.1): a kit that sets the key colour and not the
  // second one keeps the two together, as the base theme does
  if (map.primary !== undefined && map.accent === undefined)
    tokens.push(`--accent: ${map.primary}`);
  const text = map.text;
  if (text !== undefined) {
    const rgb = parseHex(text);
    for (const name of THEME_DERIVED_TOKENS) {
      const { alpha } = parseRgba(base[name]);
      tokens.push(`--${name}: rgba(${rgb.join(', ')}, ${alpha})`);
    }
  }
  const background = map.background;
  if (background !== undefined) {
    // the plate is the ink at a low alpha; over a coloured ground it stays the text's alpha form
    const rgb = parseHex(text ?? base.ink);
    for (const name of PAPER_DERIVED_TOKENS) {
      const { alpha } = parseRgba(base[name]);
      tokens.push(`--${name}: rgba(${rgb.join(', ')}, ${alpha})`);
    }
    // the hint colour (slide numbers, the wordmark, prompts) recomputes against a coloured ground
    // (audit-brand 17: it vanished on #0b3d91): the base hint stays while it reads at 3 to 1,
    // else the text colour takes its place
    if (map.hint === undefined) {
      const hint = readableHint(background, text ?? base.ink, base.titanium);
      if (hint !== base.titanium) tokens.push(`--titanium: ${hint}`);
    }
  }
  if (tokens.length > 0) rules.push({ selector: scope, declarations: tokens });
  if (map.primary !== undefined)
    rules.push({ selector: `${scope} .slide a`, declarations: [`color: ${map.primary}`] });
  if (background !== undefined)
    // the viewer paints the slide box itself over the sheet (Sheet.css `.pt-slide`); the render
    // surface's sheet reads --paper
    rules.push({ selector: `${scope} .pt-slide`, declarations: [`background: ${background}`] });
  return rules;
}

/** The WCAG contrast ratio of two hex colours: the one function of @turboslide/theme/contrast. */
export function contrastRatio(a: string, b: string): number {
  return wcagRatio(a, b);
}

/** The hint colour over a ground: the base hint while it reads at 3 to 1, else the text colour. */
export function readableHint(ground: string, text: string, baseHint: string): string {
  if (contrastRatio(baseHint, ground) >= 3) return baseHint;
  return toHex(parseHex(text));
}

/** The theme's tokens of one appearance as declarations, every one of the twelve. */
function tokenDeclarations(tokens: Readonly<Record<TokenName, string>>): string[] {
  return TOKEN_NAMES.map((name) => `--${name}: ${tokens[name]}`);
}

/**
 * The rules of a theme other than General Translation (docs/DESIGN.md 7.2, 7.4): the twelve
 * tokens of each appearance, the display features, the title slide's composition and the accent
 * bar over each heading. The frame is the deck's (`frameRules`), since a kit toggle overrides it.
 */
function themeRules(theme: ThemeRecord, root: string): Rule[] {
  const rules: Rule[] = [
    {
      selector: appearanceScope('light', root),
      declarations: tokenDeclarations(theme.tokens.light),
    },
    { selector: appearanceScope('dark', root), declarations: tokenDeclarations(theme.tokens.dark) },
    {
      selector: root,
      declarations: [`--${DISPLAY_FEATURES_TOKEN}: ${theme.displayFeatures}`],
    },
  ];
  // the fixed title kind's column (slide.ts, `.left-mid` in the title section); a slide converted
  // to the canvas keeps its own boxes
  const title = `${root} .slide[data-kind='title'] .left-mid`;
  switch (theme.title.composition) {
    case 'top-left':
      rules.push({ selector: title, declarations: ['top: 0', 'transform: none'] });
      break;
    case 'bottom-left':
      rules.push({ selector: title, declarations: ['top: auto', 'bottom: 0', 'transform: none'] });
      break;
    case 'centre':
      rules.push({ selector: title, declarations: ['text-align: center'] });
      rules.push({
        selector: `${title} > *`,
        declarations: ['margin-left: auto', 'margin-right: auto'],
      });
      break;
    default:
      break;
  }
  if (theme.title.accentBar) {
    // the bar sits outside the heading's box, so no measured box, line or canvas conversion moves
    rules.push({
      selector: `${root} .slide h1, ${root} .slide h2`,
      declarations: ['position: relative'],
    });
    rules.push({
      selector: `${root} .slide h1::before, ${root} .slide h2::before`,
      declarations: [
        "content: ''",
        'position: absolute',
        'left: 0',
        'top: -24px',
        'width: 56px',
        'height: 4px',
        'background: var(--accent)',
      ],
    });
  }
  return rules;
}

/**
 * The frame's rules for the deck: each part the theme or the kit turns off is hidden (the kit's
 * toggle first, then the theme's part; schema brand.ts `frameOf`). Nothing for General
 * Translation without a frame toggle, whose sheet draws every part.
 */
function frameRules(deck: ThemeDeck, root: string): Rule[] {
  const frame = frameOf(deck.theme, deck.brand);
  const rules: Rule[] = [];
  if (!frame.rails)
    rules.push({
      selector: `${root} .frame::before, ${root} .frame::after`,
      declarations: ['display: none'],
    });
  if (!frame.top && !frame.bottom)
    rules.push({ selector: `${root} .frame .rule`, declarations: ['display: none'] });
  else if (!frame.top)
    rules.push({ selector: `${root} .frame .rule.top`, declarations: ['display: none'] });
  else if (!frame.bottom)
    rules.push({ selector: `${root} .frame .rule.bottom`, declarations: ['display: none'] });
  if (!frame.crosses)
    rules.push({ selector: `${root} .frame .cross`, declarations: ['display: none'] });
  return rules;
}

export type ThemeCssOptions = {
  /**
   * The root the rules scope to, exactly; `themeScope(deck.theme)` when absent. A page that draws
   * slides of no stamped theme (the landing's page deck, restyled by swapping one stylesheet)
   * passes its own root.
   */
  root?: string;
};

/**
 * The override stylesheet of a deck: the theme's rules (nothing for General Translation, the
 * sheet itself), then the kit's, one rule per changed group; nothing for a General Translation
 * deck without a record or with a record that names nothing the sheet draws. The slots' pictures
 * and text are markup (slide.ts titleMarkSlot, stage.ts frameBandHtml), so this sheet hides the
 * stage's own wordmark where the kit takes them over and nothing else about them.
 */
export function themeCss(deck: ThemeDeck, options: ThemeCssOptions = {}): string {
  const themeId = themeIdOf(deck.theme);
  const root = options.root ?? themeScope(themeId);
  const theme = themeRecord(themeId);
  const kit = deck.brand;
  const rules: Rule[] = themeId === GT_THEME_ID ? [] : themeRules(theme, root);
  if (kit !== undefined) {
    rules.push(...colourRules(kit, 'light', theme, root), ...colourRules(kit, 'dark', theme, root));
    const declarations: string[] = [];
    const fonts = kit.fonts;
    if (fonts?.display !== undefined) {
      declarations.push(`--display: ${fontStack(fonts.display)}`);
      // the display features travel with the face (3.1 item 5) and the theme: a kit in Fraunces
      // or Playfair Display computes `normal` on every heading, a kit that names Inter keeps cv11
      // and ss01 in General Translation alone
      declarations.push(`--${DISPLAY_FEATURES_TOKEN}: ${displayFeatures(fonts.display, themeId)}`);
    }
    if (fonts?.text !== undefined) declarations.push(`--text: ${fontStack(fonts.text)}`);
    if (declarations.length > 0) rules.push({ selector: root, declarations });
  }
  rules.push(...frameRules(deck, root));

  // the stage's own wordmark steps aside for the kit's footer slot (stage.ts frameBandHtml and
  // the viewer's Frame draw it with the class ts-kit-wordmark); a Frame that does not know the
  // kit yet hides its GT mark and draws nothing in its place. A theme without the GT wordmark
  // hides it the same way.
  if (kitDrawsFooter(kit) || !themeFactsOf(deck.theme).logo)
    rules.push({
      selector: `${root} .wordmark:not(.ts-kit-wordmark)`,
      declarations: ['display: none'],
    });
  // the counter's format is the frame's to draw (stage.ts counterText through the band; the
  // viewer's Frame reads it), so nothing here hides the stage's counter: a Frame that does not
  // know the format yet draws `n / N`, which reads better than no number at all

  return rules.map((rule) => `${rule.selector} { ${rule.declarations.join('; ')}; }`).join('\n');
}

/**
 * The twelve tokens a deck's sheet computes in one appearance: the theme's, with the kit's
 * colour roles over them and the derived alphas recomputed from an edited text colour, the values
 * themeCss writes. For a writer that cannot read the page (the PowerPoint shadow and outline,
 * export/src/scene/enrich.ts).
 */
export function deckTokens(deck: ThemeDeck, appearance: ThemeName): Record<TokenName, string> {
  const theme = themeRecord(deck.theme);
  const tokens: Record<TokenName, string> = { ...theme.tokens[appearance] };
  const map = deck.brand?.colors?.[appearance];
  if (map === undefined) return tokens;
  for (const role of KIT_COLORS) {
    const value = map[role];
    if (value !== undefined) tokens[KIT_COLOR_TOKENS[role] as TokenName] = value;
  }
  if (map.primary !== undefined && map.accent === undefined) tokens.accent = map.primary;
  if (map.text !== undefined) {
    const rgb = parseHex(map.text);
    for (const name of THEME_DERIVED_TOKENS) {
      const { alpha } = parseRgba(theme.tokens[appearance][name]);
      tokens[name] = `rgba(${rgb.join(', ')}, ${alpha})`;
    }
  }
  if (map.background !== undefined) {
    const rgb = parseHex(map.text ?? theme.tokens[appearance].ink);
    const { alpha } = parseRgba(theme.tokens[appearance].plate);
    tokens.plate = `rgba(${rgb.join(', ')}, ${alpha})`;
    if (map.hint === undefined)
      tokens.titanium = readableHint(
        map.background,
        map.text ?? theme.tokens[appearance].ink,
        theme.tokens[appearance].titanium,
      );
  }
  return tokens;
}

/** The role whose token a hex sets, for the panel's tooltips and the plate's kit row: the token id. */
export function kitTokenOf(role: KitColor): string {
  return KIT_COLOR_TOKENS[role];
}
