// The Brand kit check (the Glyphfield port, wave 2 item 6, from the colour and logo sections of
// Glyphfield's src/lib/brandHealth.ts): the short list at the foot of the Brand kit panel of the
// pairs a kit makes unreadable while it is set up, before any slide is rendered. Text on
// Background must reach 4.5:1, and Captions, Hints, Primary and Accent 3:1, in both appearances,
// measured on the colours the slides draw (the deck's theme under its kit, `deckTokens`) through
// the one contrast function (packages/theme/src/contrast.ts). Each such row carries its Fix, one
// kit write of the role's colour with its OKLCH lightness moved until the pair reaches the ratio
// (`adjustForContrast`). The logo the deck's slides draw must reach 3:1 on Background (WCAG 2.2
// SC 1.4.11, a graphic), measured on its pixels; it has no Fix. No score and no grade. The kit's
// fonts are not checked: each is a catalog id with its files (schema/fonts.ts FONT_IDS).
import { deckTokens } from '@turboslide/render/theme-css';
import type { ThemeDeck } from '@turboslide/render/theme-css';
import { KIT_COLOR_TOKENS, KIT_COLOR_WORDS } from '@turboslide/schema/brand';
import type { KitColor } from '@turboslide/schema/brand';
import type { HexColor } from '@turboslide/schema/color';
import { isHexColor } from '@turboslide/schema/color';
import type { Appearance } from '@turboslide/schema/deck';
import { adjustForContrast } from '@turboslide/theme/color-space';
import { contrastRatio, parseColor } from '@turboslide/theme/contrast';
import type { TokenName } from '@turboslide/theme/tokens';

/** Each role the check reads against Background, with the ratio it needs. */
export const KIT_CHECK_PAIRS: ReadonlyArray<{
  role: Exclude<KitColor, 'background'>;
  ratio: number;
}> = [
  { role: 'text', ratio: 4.5 },
  { role: 'caption', ratio: 3 },
  { role: 'hint', ratio: 3 },
  { role: 'primary', ratio: 3 },
  { role: 'accent', ratio: 3 },
];

/** The ratio a logo needs on Background: a graphic (WCAG 2.2 SC 1.4.11). */
export const KIT_CHECK_LOGO_RATIO = 3;

export type KitFinding = {
  /** `contrast.<appearance>.<role>` or `logo.<appearance>` */
  id: string;
  sentence: string;
  /** the one kit write that fixes it, when the fix is deterministic */
  fix?: { pointer: string; value: HexColor; doc: string };
};

/** A ratio as the panel reads it: one decimal, rounded down, so 4.49 never reads 4.5. */
export function ratioText(ratio: number): string {
  return String(Math.floor(ratio * 10) / 10);
}

/**
 * The contrast findings of a deck's kit in both appearances. A role whose colour is the colour of
 * a role already found in that appearance is left out (Accent follows Primary while the kit sets
 * no Accent), so one write fixes one row.
 */
export function kitContrastFindings(deck: ThemeDeck): KitFinding[] {
  const findings: KitFinding[] = [];
  for (const appearance of ['light', 'dark'] as const satisfies readonly Appearance[]) {
    const tokens = deckTokens(deck, appearance);
    const ground = tokens.paper;
    const found = new Set<string>();
    for (const { role, ratio } of KIT_CHECK_PAIRS) {
      const color = tokens[KIT_COLOR_TOKENS[role] as TokenName];
      if (found.has(color)) continue;
      const measured = contrastRatio(color, ground);
      if (measured >= ratio) continue;
      found.add(color);
      const name = KIT_COLOR_WORDS[role].name;
      const fixed = adjustForContrast(color, ground, ratio);
      findings.push({
        id: `contrast.${appearance}.${role}`,
        sentence: `${name} on Background measures ${ratioText(measured)}:1 on ${appearance} slides; it needs ${ratio}:1`,
        ...(fixed !== null && isHexColor(fixed)
          ? {
              fix: {
                pointer: `/colors/${appearance}/${role}`,
                value: fixed,
                doc: `Sets ${name} on ${appearance} slides to ${fixed}, which measures ${ratioText(contrastRatio(fixed, ground))}:1`,
              },
            }
          : {}),
      });
    }
  }
  return findings;
}

/**
 * The contrast of a logo on a ground, read from its pixels (RGBA, as a canvas returns them): the
 * median ratio of the pixels at least half opaque, each composited on the ground. Null for a
 * picture with no such pixel or a ground that is not a colour.
 */
export function logoContrast(pixels: Uint8ClampedArray, ground: string): number | null {
  const base = parseColor(ground);
  if (base === null) return null;
  const ratios: number[] = [];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const a = (pixels[i + 3] ?? 0) / 255;
    if (a < 0.5) continue;
    ratios.push(
      contrastRatio(
        { r: pixels[i] ?? 0, g: pixels[i + 1] ?? 0, b: pixels[i + 2] ?? 0, a },
        { ...base, a: 1 },
      ),
    );
  }
  if (ratios.length === 0) return null;
  ratios.sort((x, y) => x - y);
  return ratios[Math.floor(ratios.length / 2)] ?? null;
}

/** The logo's finding in the deck's appearance, or null while it reaches the ratio. */
export function logoFinding(ratio: number | null, appearance: Appearance): KitFinding | null {
  if (ratio === null || ratio >= KIT_CHECK_LOGO_RATIO) return null;
  return {
    id: `logo.${appearance}`,
    sentence: `The logo measures ${ratioText(ratio)}:1 on the ${appearance} Background; it needs ${KIT_CHECK_LOGO_RATIO}:1`,
  };
}
