// The deck's face (SPEC 2.1, 8.4): InterVariable 4.001 with opsz 14 to 32 and wght 100 to 900,
// decoded by the scaffold from Prototemplate/deck/fonts/deck-fonts.css (pptx report section
// 4.10), and its italic companion InterVariable-Italic from the same release (gslides-parity
// SPEC-2 7.1), so the sheet renders true italics for the mark span rule. The static export
// instances and fonts.json come from scripts/build-fonts.py. License: SIL OFL 1.1, see
// THIRD_PARTY_NOTICES.md.
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

/** The italic companion (gslides-parity SPEC-2 7.1): the rsms/inter 4.001 release asset `web/InterVariable-Italic.woff2`. */
export const INTER_ITALIC = {
  family: 'Inter',
  file: 'InterVariable-Italic.woff2',
  version: '4.001',
  format: 'woff2',
  bytes: 380904,
  sha256: '0470791f15efd2987bdb50b24027c3f584a2cf9b7b63fbf86012c5f2e9abcc05',
  weight: [100, 900],
  opticalSize: [14, 32],
  style: 'italic',
  license: 'SIL OFL 1.1',
  /** the release the file comes from and its path inside the zip */
  release: 'https://github.com/rsms/inter/releases/tag/v4.001',
  path: 'web/InterVariable-Italic.woff2',
} as const;

/** Absolute file URL of the variable font, for Node callers (the standalone build, the exporter). */
export const INTER_VARIABLE_WOFF2 = new URL('../assets/InterVariable.woff2', import.meta.url);

/** Absolute file URL of the italic variable font. */
export const INTER_ITALIC_WOFF2 = new URL('../assets/InterVariable-Italic.woff2', import.meta.url);

/** Absolute file URL of the @font-face stylesheet. */
export const INTER_CSS = new URL('./inter.css', import.meta.url);

/** The deck's font family stack for display and text (head:21-22). */
export const FONT_FAMILY = "'Inter', 'Helvetica Neue', Arial, sans-serif";

/** The font bytes. */
export function interBytes(): Buffer {
  return readFileSync(INTER_VARIABLE_WOFF2);
}

/** The italic font bytes. */
export function interItalicBytes(): Buffer {
  return readFileSync(INTER_ITALIC_WOFF2);
}

/** The deck's descriptor with a caller-supplied src: a relative path, a URL or a data: URI. */
export function fontFaceCss(src: string, style: 'normal' | 'italic' = 'normal'): string {
  const face = style === 'italic' ? INTER_ITALIC : INTER;
  return [
    '@font-face {',
    `  font-family: '${face.family}';`,
    `  font-style: ${face.style};`,
    `  font-weight: ${face.weight[0]} ${face.weight[1]};`,
    '  font-display: swap;',
    `  src: url('${src}') format('${face.format}');`,
    '}',
  ].join('\n');
}

/**
 * The two @font-face rules with the fonts inlined as data URIs, what the standalone build writes
 * at <!--FONTS--> (SPEC 5.2): the upright, then the italic (SPEC-2 7.1), so `<i>` renders the
 * true italic and the sheet raster carries it.
 */
export function inlineFontFaceCss(): string {
  return [
    fontFaceCss(`data:font/woff2;base64,${interBytes().toString('base64')}`),
    fontFaceCss(`data:font/woff2;base64,${interItalicBytes().toString('base64')}`, 'italic'),
  ].join('\n');
}
