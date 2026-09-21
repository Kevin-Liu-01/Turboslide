// Color (Kevin, 2026-09-11: primitives "selecting colors" from the palette): a Color is a token
// name first, a custom hex string second. The tokens are the sheet's theme tokens (DECK-GRAMMAR.md:28,
// tokens.ts TOKEN_NAMES) plus the four semantic hues under plain names (green, amber, red, blue;
// DECK-GRAMMAR.md:30, head:113-116). A token follows the theme, so a box filled `plate` is right
// in both themes; a hex literal is the same in both and the linter flags it at severity 2 as
// color/off-palette so a pure-grammar deck knows. This module imports only zod and annotate so
// blocks.ts and blocks/material.ts can import it without a cycle.
import { z } from 'zod';
import { annotate } from './annotate.ts';
import type { Inspector } from './annotate.ts';

/** The palette in the order the inspector's swatch row shows it. */
export const COLOR_TOKENS = [
  'ink',
  'paper',
  'ink-2',
  'titanium',
  'hair',
  'hair-soft',
  'plate',
  'edge',
  'green',
  'amber',
  'red',
  'blue',
  'accent',
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];

/** A custom color: `#rrggbb`, six hex digits after the hash. */
export type HexColor = `#${string}`;

export type Color = ColorToken | HexColor;

/** The four semantic hues, the same in both themes (DECK-GRAMMAR.md:30; head:113-116). */
export const SEMANTIC_PALETTE: Readonly<Record<'green' | 'amber' | 'red' | 'blue', HexColor>> = {
  green: '#12a37a',
  amber: '#f0a020',
  red: '#e5484d',
  blue: '#2f5ce0',
};

export const HEX_COLOR_PATTERN = /^[0-9a-fA-F]{6}$/;

export const hexColorSchema = z.templateLiteral([
  '#',
  z.string().regex(HEX_COLOR_PATTERN, 'six hex digits after the hash'),
]) satisfies z.ZodType<HexColor>;

/** A token name or a `#rrggbb` string; the JSON Schema keeps both branches. */
export const colorSchema = z.union([
  z.enum(COLOR_TOKENS),
  hexColorSchema,
]) satisfies z.ZodType<Color>;

/** The one label per token the inspector's palette shows. */
export const COLOR_LABELS: Readonly<Record<ColorToken, string>> = {
  ink: 'Ink',
  paper: 'Paper',
  'ink-2': 'Ink 2',
  titanium: 'Titanium',
  hair: 'Hairline',
  'hair-soft': 'Soft hairline',
  plate: 'Plate',
  edge: 'Edge',
  green: 'Green',
  amber: 'Amber',
  red: 'Red',
  blue: 'GT blue',
  accent: 'Accent',
};

export function isColorToken(value: string): value is ColorToken {
  return (COLOR_TOKENS as ReadonlyArray<string>).includes(value);
}

export function isHexColor(value: string): value is HexColor {
  return value.startsWith('#') && HEX_COLOR_PATTERN.test(value.slice(1));
}

/**
 * The CSS value of a Color: a theme token becomes `var(--token)`, a semantic hue its hex, a
 * custom color its hex as written. The renderer writes this inline; the exporter reads the
 * computed color back from the page, so it never needs a theme here. GT blue is the brand kit's
 * Primary role (docs/PRODUCT.md 4.1: "links and the key colour of charts and highlights"), so it
 * reads the sheet's `--blue` with its own hex as the fallback; `accent` is the kit's second
 * colour, the sheet's `--accent`.
 */
export function colorCss(color: Color): string {
  if (isColorToken(color)) {
    if (color === 'blue') return `var(--blue, ${SEMANTIC_PALETTE.blue})`;
    if (color === 'green' || color === 'amber' || color === 'red') return SEMANTIC_PALETTE[color];
    return `var(--${color})`;
  }
  return color;
}

/** A color field annotation with the palette as its snap set (control `color`, SPEC 6.5). */
export function colorField(
  label: string,
  help: string,
  group: Inspector['group'] = 'Block',
): z.ZodOptional<typeof colorSchema> {
  return annotate(colorSchema.optional(), {
    label,
    control: 'color',
    snap: COLOR_TOKENS,
    group,
    help,
  });
}
