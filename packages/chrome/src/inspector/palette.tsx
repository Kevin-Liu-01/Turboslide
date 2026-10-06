import { useContext, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { colorHexOf, deckTokens } from '@turboslide/render/theme-css';
import type { DeckTokens } from '@turboslide/render/theme-css';
import {
  COLOR_LABELS,
  COLOR_TOKENS,
  SEMANTIC_PALETTE,
  isColorToken,
  isHexColor,
} from '@turboslide/schema/color';
import type { ColorToken } from '@turboslide/schema/color';
import { deckAppearance } from '@turboslide/schema/deck';
import { contrastRatio } from '@turboslide/theme/contrast';
import { TOKENS } from '@turboslide/theme/tokens';
import { useTheme } from '@turboslide/viewer/theme';

import { EditorShellContext } from '../editor-shell-context';
import { tipProps } from '../Tooltip';
import { LintMark } from './lint-mark';
import type { ControlProps } from './props';
import { HIDDEN_NATIVE_CLASS } from './props';

import './palette.css';

/**
 * A Color as the palette control (annotation control `color`, schema/color.ts; Kevin, 2026-09-11:
 * "selecting colors"): a swatch row of the eight theme tokens and the four semantic hues, each
 * named in its tooltip, then a custom hex field with a contrast readout against the slide's
 * ground and the color/off-palette lint mark while a hex is set (severity 2, rules.ts). Every
 * swatch here, in the colour plate, the Background dialog, Format options and the chart's series
 * paints the colour the deck's slides draw: the deck's theme under its brand kit in the deck's
 * appearance (`useDeckTokens`, render/theme-css.ts `deckTokens` and `colorHexOf`; docs/DESIGN.md
 * 7.5), and the contrast reads against that theme's paper. A visually hidden select carries the
 * label and data-control, so the window API's set(label, 'plate') lands in the same onChange as
 * a click.
 */
type Rgb = [number, number, number];

/**
 * The tokens the deck's slides draw in the deck's appearance, its theme under its brand kit
 * (docs/DESIGN.md 7.5), read from the editor's document; outside the editor (a lone control in a
 * test), General Translation's sheet in the chrome's appearance.
 */
export function useDeckTokens(): DeckTokens {
  const shell = useContext(EditorShellContext);
  const chrome = useTheme();
  const deck = shell?.input.document.deck;
  return useMemo(
    () => (deck === undefined ? TOKENS[chrome] : deckTokens(deck, deckAppearance(deck))),
    [deck, chrome],
  );
}

const OFF_PALETTE = {
  rule: 'color/off-palette',
  proposal: 'A custom hex color on a primitive block instead of a palette token.',
} as const;

export function hexToRgb(hex: string): Rgb | null {
  const digits = hex.replace(/^#/, '');
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((char) => char + char)
          .join('')
      : digits;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** `#abc` becomes `#aabbcc`, `ABCDEF` becomes `#abcdef`; null for anything else. */
export function normalizeHex(input: string): string | null {
  const rgb = hexToRgb(input.trim());
  if (rgb === null) return null;
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** The RGB of a color value on the deck's slides: a token from the deck's tokens, a hex as written. */
export function colorRgb(value: string, tokens: DeckTokens): Rgb | null {
  const hex = colorHexOf(tokens, value);
  return hex === null ? hexToRgb(value) : hexToRgb(hex);
}

/**
 * The WCAG 2.2 contrast ratio of a color against the slide's ground (the deck's paper), to one
 * decimal, through the one contrast module of the design round (packages/theme/src/contrast.ts;
 * docs/DESIGN.md 5.4); null when unknown.
 */
export function contrastAgainstPaper(value: string, tokens: DeckTokens): number | null {
  const rgb = colorRgb(value, tokens);
  const paper = hexToRgb(tokens.paper);
  if (rgb === null || paper === null) return null;
  const ratio = contrastRatio(
    { r: rgb[0], g: rgb[1], b: rgb[2], a: 1 },
    { r: paper[0], g: paper[1], b: paper[2], a: 1 },
  );
  return Math.round(ratio * 10) / 10;
}

/**
 * The CSS paint of a swatch: the hex the colour paints on the deck's slides (`colorHexOf` over
 * the deck's tokens), so a swatch is the slide's colour and never the chrome's.
 */
export function swatchPaint(value: string, tokens: DeckTokens): string {
  return colorHexOf(tokens, value) ?? value;
}

const TOKEN_DOC: Readonly<Record<ColorToken, string>> = {
  ink: 'The text color; follows the theme.',
  paper: 'The sheet ground; follows the theme.',
  'ink-2': 'Body ink, a step lighter than ink.',
  titanium: 'The hint colour of slide numbers, prompts and credits.',
  hair: 'The 1 px rule.',
  'hair-soft': 'The soft rule between rows.',
  plate: 'The faint ground of a plate.',
  edge: 'The frame of a thumbnail or a capture.',
  green: `The semantic ok hue ${SEMANTIC_PALETTE.green}.`,
  amber: `The semantic warn hue ${SEMANTIC_PALETTE.amber}.`,
  red: `The semantic no hue ${SEMANTIC_PALETTE.red}.`,
  blue: 'The brand kit’s Primary: links and the key colour of charts and highlights.',
  accent:
    'The brand kit’s Accent, the second color of charts and highlights; Primary until a kit sets it.',
};

export function PaletteControl({ spec, onChange, disabled }: ControlProps) {
  const deckColors = useDeckTokens();
  const current = typeof spec.value === 'string' ? spec.value : '';
  const [draft, setDraft] = useState<string | null>(null);
  const [hexError, setHexError] = useState(false);
  const tokens = (spec.options ?? COLOR_TOKENS).filter(
    (option): option is ColorToken => typeof option === 'string' && isColorToken(option),
  );
  /* the schema takes a hex when the palette is not the whole set it accepts */
  const customAllowed = spec.schema.safeParse('#0a0a0a').success;
  const isHex = current !== '' && isHexColor(current);
  const contrast = current === '' ? null : contrastAgainstPaper(current, deckColors);

  const pick = (value: string | undefined) => {
    if (disabled) return;
    setHexError(false);
    setDraft(null);
    if (value === undefined) {
      if (spec.optional) onChange(undefined);
      return;
    }
    if (value !== current) onChange(value);
  };

  const commitHex = (raw: string) => {
    setDraft(null);
    const trimmed = raw.trim();
    if (trimmed === '') {
      setHexError(false);
      if (spec.optional) onChange(undefined);
      return;
    }
    const hex = normalizeHex(trimmed);
    if (hex === null) {
      setHexError(true);
      return;
    }
    setHexError(false);
    if (hex !== current) onChange(hex);
  };

  /* Enter and Space pick the focused swatch here, so the pick is one keydown in every browser and
     the stage's Enter (inline editing of the selected block) never reads the key: the Editor's
     document listener yields to chrome controls (Editor.tsx isChromeControlTarget) */
  const onSwatchKey = (event: KeyboardEvent<HTMLButtonElement>, value: string | undefined) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    pick(value);
  };

  const onHexKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitHex(event.currentTarget.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(null);
      setHexError(false);
      event.currentTarget.blur();
    }
  };

  const shownHex = draft ?? (isHex ? current : '');
  const noneTip = tipProps({ name: 'None', doc: 'No color set: the grammar default applies.' });
  const hexTip = tipProps({
    name: 'Custom hex',
    doc: 'Six hex digits after the hash; a custom color is the same in both themes and is flagged color/off-palette.',
    key: 'Enter',
  });

  return (
    <span className="ts-ctl-color" data-value={current || undefined}>
      <select
        className={HIDDEN_NATIVE_CLASS}
        aria-label={spec.label}
        data-control={spec.control}
        value={current}
        disabled={disabled}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '') pick(undefined);
          else if (isColorToken(raw)) pick(raw);
          else commitHex(raw);
        }}
      >
        {spec.optional || current === '' ? <option value="">none</option> : null}
        {tokens.map((token) => (
          <option key={token} value={token}>
            {token}
          </option>
        ))}
        {isHex ? <option value={current}>{current}</option> : null}
      </select>
      <span className="ts-ctl-swatches" role="group" aria-label={`${spec.label} palette`}>
        {spec.optional ? (
          <button
            type="button"
            className={current === '' ? 'ts-ctl-swatch is-none is-on' : 'ts-ctl-swatch is-none'}
            aria-pressed={current === ''}
            aria-label={`${spec.label} none`}
            data-control={`${spec.control}.none`}
            disabled={disabled}
            onClick={() => pick(undefined)}
            {...noneTip}
            onKeyDown={(event) => {
              noneTip.onKeyDown(event);
              onSwatchKey(event, undefined);
            }}
          />
        ) : null}
        {tokens.map((token) => {
          const tip = tipProps({ name: COLOR_LABELS[token], doc: TOKEN_DOC[token] });
          return (
            <button
              key={token}
              type="button"
              className={current === token ? 'ts-ctl-swatch is-on' : 'ts-ctl-swatch'}
              style={{ ['--swatch' as string]: swatchPaint(token, deckColors) }}
              aria-pressed={current === token}
              aria-label={`${spec.label} ${token}`}
              data-control={`${spec.control}.${token}`}
              data-token={token}
              disabled={disabled}
              onClick={() => pick(token)}
              {...tip}
              onKeyDown={(event) => {
                tip.onKeyDown(event);
                onSwatchKey(event, token);
              }}
            />
          );
        })}
      </span>
      {customAllowed ? (
        <span className="ts-ctl-hex">
          <i
            className={isHex ? 'ts-ctl-swatch is-custom is-on' : 'ts-ctl-swatch is-custom'}
            style={isHex ? { ['--swatch' as string]: current } : undefined}
            aria-hidden="true"
          />
          <input
            className={hexError ? 'ts-ctl-hexfield is-error' : 'ts-ctl-hexfield'}
            type="text"
            inputMode="text"
            spellCheck={false}
            autoComplete="off"
            maxLength={7}
            placeholder="#rrggbb"
            aria-label={`${spec.label} hex`}
            data-control={`${spec.control}.hex`}
            value={shownHex}
            disabled={disabled}
            {...hexTip}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => {
              hexTip.onBlur(event);
              if (draft !== null) commitHex(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              hexTip.onKeyDown(event);
              onHexKey(event);
            }}
          />
          {contrast !== null ? (
            <span
              className="ts-ctl-contrast"
              data-low={contrast < 3 ? '' : undefined}
              {...tipProps({
                name: 'Contrast',
                doc: `${contrast}:1 against the slide’s background; text wants 4.5:1, large type 3:1.`,
              })}
            >
              {contrast}:1
            </span>
          ) : null}
          {isHex ? (
            <LintMark rule={OFF_PALETTE.rule} severity={2} proposal={OFF_PALETTE.proposal} />
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
