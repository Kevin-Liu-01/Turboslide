// The deck's one face (SPEC 2.1, 8.4): InterVariable 4.001 with opsz 14 to 32 and wght 100 to
// 900, decoded by the scaffold from Prototemplate/deck/fonts/deck-fonts.css (pptx report section
// 4.10). The static export instances and fonts.json follow in M2 through scripts/build-fonts.py.
// License: SIL OFL 1.1, see THIRD_PARTY_NOTICES.md.
import { readFileSync } from 'node:fs';

export const INTER = {
  family: 'Inter',
  file: 'InterVariable.woff2',
  version: '4.001',
  format: 'woff2',
  bytes: 352240,
  sha256: '693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3',
  weight: [100, 900],
  opticalSize: [14, 32],
  style: 'normal',
  license: 'SIL OFL 1.1',
} as const;

/** Absolute file URL of the variable font, for Node callers (the standalone build, the exporter). */
export const INTER_VARIABLE_WOFF2 = new URL('../assets/InterVariable.woff2', import.meta.url);

/** Absolute file URL of the @font-face stylesheet. */
export const INTER_CSS = new URL('./inter.css', import.meta.url);

/** The deck's font family stack for display and text (head:21-22). */
export const FONT_FAMILY = "'Inter', 'Helvetica Neue', Arial, sans-serif";

/** The font bytes. */
export function interBytes(): Buffer {
  return readFileSync(INTER_VARIABLE_WOFF2);
}

/** The deck's descriptor with a caller-supplied src: a relative path, a URL or a data: URI. */
export function fontFaceCss(src: string): string {
  return [
    '@font-face {',
    `  font-family: '${INTER.family}';`,
    `  font-style: ${INTER.style};`,
    `  font-weight: ${INTER.weight[0]} ${INTER.weight[1]};`,
    '  font-display: swap;',
    `  src: url('${src}') format('${INTER.format}');`,
    '}',
  ].join('\n');
}

/** The @font-face with the font inlined as a data URI, what the standalone build writes at <!--FONTS--> (SPEC 5.2). */
export function inlineFontFaceCss(): string {
  return fontFaceCss(`data:font/woff2;base64,${interBytes().toString('base64')}`);
}
