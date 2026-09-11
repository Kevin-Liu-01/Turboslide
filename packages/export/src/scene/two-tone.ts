// Two-tone twins at 2x (SPEC 5.4, 8.2): a 2x screenshot of the 1x twin is bilinear and soft
// (slides report section 2.5), so the one-bit screen is read back from the stored twin (every JPEG
// cell stays on its side of the threshold, OPENERS.md) and scaled 4x nearest to 3200 by 1800, then
// written as a two-entry palette PNG in the theme's exact paper and ink. The extractor swaps the
// picture element's source to this image before the flatten screenshot and hands the same bytes to
// the native background.
import type { Theme } from '@turboslide/schema/render';
import { bitsFromGray } from '@turboslide/effects/diff';
import { decodeImage } from '@turboslide/effects/io';
import { encodePng1 } from '@turboslide/effects/png1';
import { scaleNearest } from '@turboslide/effects/resample';
import { toGray } from '@turboslide/effects/tone';

import { parseCssColor } from '../units.ts';

export type TwoToneAt2x = { png: Uint8Array; width: number; height: number; litFraction: number };

function rgbOf(hex: string): [number, number, number] {
  const { hex: h } = parseCssColor(hex);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * The 2x twin for a theme from the stored 1x twin: the bright cells of the file stay bright. For
 * the light twin bright is paper, for the dark twin bright is ink; the palette carries the theme's
 * exact values so the file composites like the sheet.
 */
export async function twoToneTwinAt2x(
  twinPath: string,
  theme: Theme,
  colors: { paper: string; ink: string },
  cell = 2,
): Promise<TwoToneAt2x> {
  const rgba = await decodeImage(twinPath);
  const gray = toGray(rgba, 'gray');
  const screen = bitsFromGray(gray, cell);
  const scaled = scaleNearest(screen, cell * 2);
  let lit = 0;
  for (const b of screen.bits) lit += b;
  const bright = theme === 'light' ? colors.paper : colors.ink;
  const dark = theme === 'light' ? colors.ink : colors.paper;
  const png = encodePng1(scaled, { palette: [rgbOf(dark), rgbOf(bright)] });
  return {
    png,
    width: scaled.width,
    height: scaled.height,
    litFraction: screen.bits.length === 0 ? 0 : lit / screen.bits.length,
  };
}
