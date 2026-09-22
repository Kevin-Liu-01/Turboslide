// The brand kit's override stylesheet (docs/PRODUCT.md 4.1; ported from round five's theme-css.ts
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
import type { BrandKit, KitColor } from '@turboslide/schema/brand';
import { KIT_COLORS, KIT_COLOR_TOKENS } from '@turboslide/schema/brand';
import type { Deck } from '@turboslide/schema/deck';
import type { FontId } from '@turboslide/schema/fonts';
import { DEFAULT_FONT_ID } from '@turboslide/schema/fonts';
import { fontFamilyStack } from '@turboslide/fonts/summary';
import type { ThemeName } from '@turboslide/theme/tokens';
import {
  DISPLAY,
  DISPLAY_FEATURES_OFF,
  DISPLAY_FEATURES_TOKEN,
  TOKENS,
  parseHex,
  parseRgba,
  toHex,
} from '@turboslide/theme/tokens';

/** The selector the override sheet scopes to: every sheet root but a base tile. */
export const THEME_CSS_SCOPE = '.ts-sheet:not([data-theme-base])';

/** The attribute a tile sets to show the base theme without the deck's kit. */
export const THEME_BASE_ATTRIBUTE = 'data-theme-base';

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
 * `@turboslide/fonts/summary` `fontFamilyStack` (docs/FEATURES.md 3.5; audit-fonts 16, two stacks
 * for one face fell back to different faces before it loaded).
 */
export function fontStack(id: FontId): string {
  return fontFamilyStack(id);
}

/**
 * The value of `--display-features` for a display face (docs/FEATURES.md 3.1 item 5): Inter's
 * cv11 and ss01, and `normal` for every other family, whose own ss01 means something else.
 */
export function displayFeatures(display: FontId): string {
  return display === DEFAULT_FONT_ID ? DISPLAY.features : DISPLAY_FEATURES_OFF;
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

function appearanceScope(appearance: ThemeName): string {
  return appearance === 'dark'
    ? `${THEME_CSS_SCOPE}[data-theme='dark']`
    : `${THEME_CSS_SCOPE}:not([data-theme='dark'])`;
}

function colourRules(kit: BrandKit, appearance: ThemeName): Rule[] {
  const map = kit.colors?.[appearance];
  if (map === undefined) return [];
  const scope = appearanceScope(appearance);
  const rules: Rule[] = [];
  const tokens: string[] = [];
  const base = TOKENS[appearance];
  for (const role of KIT_COLORS) {
    const value = map[role];
    if (value !== undefined) tokens.push(`--${KIT_COLOR_TOKENS[role]}: ${value}`);
  }
  // Accent defaults to Primary (docs/PRODUCT.md 4.1): a kit that sets the key colour and not the
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

function luminance(hex: string): number {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** The WCAG contrast ratio of two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a) + 0.05;
  const lb = luminance(b) + 0.05;
  return Math.max(la, lb) / Math.min(la, lb);
}

/** The hint colour over a ground: the base hint while it reads at 3 to 1, else the text colour. */
export function readableHint(ground: string, text: string, baseHint: string): string {
  if (contrastRatio(baseHint, ground) >= 3) return baseHint;
  return toHex(parseHex(text));
}

/**
 * The override stylesheet of a deck: one rule per changed group, nothing for a deck without a
 * record or a record that names nothing the sheet draws. The slots' pictures and text are markup
 * (slide.ts titleMarkSlot, stage.ts frameBandHtml), so this sheet hides the stage's own wordmark where the
 * kit takes them over and nothing else about them.
 */
export function themeCss(deck: Pick<Deck, 'brand'>): string {
  const kit = deck.brand;
  if (kit === undefined) return '';
  const scope = THEME_CSS_SCOPE;
  const rules: Rule[] = [...colourRules(kit, 'light'), ...colourRules(kit, 'dark')];

  const root: string[] = [];
  const fonts = kit.fonts;
  if (fonts?.display !== undefined) {
    root.push(`--display: ${fontStack(fonts.display)}`);
    // the display features travel with the face (3.1 item 5): a kit in Fraunces or Playfair
    // Display computes `normal` on every heading, a kit that names Inter keeps cv11 and ss01
    root.push(`--${DISPLAY_FEATURES_TOKEN}: ${displayFeatures(fonts.display)}`);
  }
  if (fonts?.text !== undefined) root.push(`--text: ${fontStack(fonts.text)}`);
  if (root.length > 0) rules.push({ selector: scope, declarations: root });

  const frame = kit.frame;
  if (frame?.rails === false)
    rules.push({
      selector: `${scope} .frame::before, ${scope} .frame::after`,
      declarations: ['display: none'],
    });
  if (frame?.rules === false)
    rules.push({ selector: `${scope} .frame .rule`, declarations: ['display: none'] });
  if (frame?.crosses === false)
    rules.push({ selector: `${scope} .frame .cross`, declarations: ['display: none'] });

  // the stage's own wordmark steps aside for the kit's footer slot (stage.ts frameBandHtml and
  // the viewer's Frame draw it with the class ts-kit-wordmark); a Frame that does not know the
  // kit yet hides its GT mark and draws nothing in its place
  if (kitDrawsFooter(kit))
    rules.push({
      selector: `${scope} .wordmark:not(.ts-kit-wordmark)`,
      declarations: ['display: none'],
    });
  // the counter's format is the frame's to draw (stage.ts counterText through the band; the
  // viewer's Frame reads it), so nothing here hides the stage's counter: a Frame that does not
  // know the format yet draws `n / N`, which reads better than no number at all

  return rules.map((rule) => `${rule.selector} { ${rule.declarations.join('; ')}; }`).join('\n');
}

/** The role whose token a hex sets, for the panel's tooltips and the plate's kit row: the token id. */
export function kitTokenOf(role: KitColor): string {
  return KIT_COLOR_TOKENS[role];
}
