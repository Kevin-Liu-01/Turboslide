// The one bit PNG of a mark (gslides-parity SPEC-3 4.1; research 11 7.1): `renderMarkBits`
// packed through the effects package's encoder with the theme's two colours as the palette, so
// `turboslide account me --avatar-png me.png`, the PPTX comment authors and any export that
// embeds a chip show the raster the chrome drew. On its own subpath because `encodePng1` imports
// node:zlib; the browser safe renderers stay in marks-render.ts.
import { encodePng1 } from '@turboslide/effects/png1';

import type { MarkSpec } from './marks.ts';
import { MARK_COLORS, renderMarkBits } from './marks-render.ts';
import type { MarkTheme } from './marks-render.ts';

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The mark as a PNG: index 0 the theme's paper, index 1 its ink. */
export function renderMarkPng1(spec: MarkSpec, size: number, theme: MarkTheme): Uint8Array {
  const colors = MARK_COLORS[theme];
  return encodePng1(renderMarkBits(spec, size), { palette: [rgb(colors.paper), rgb(colors.ink)] });
}
