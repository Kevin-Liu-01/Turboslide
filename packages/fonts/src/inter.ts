// The deck's face (SPEC 2.1, 8.4): InterVariable from Rasmus Andersson's Inter 4.1 release of
// 2024-11-16 (the font's own name table reads "Version 4.001;git-9221beed3"; the release tag is
// v4.1), with opsz 14 to 32 and wght 100 to 900, decoded by the scaffold from
// Prototemplate/deck/fonts/deck-fonts.css (pptx report section 4.10), and its italic companion
// InterVariable-Italic from the same release (gslides-parity SPEC-2 7.1; docs/FEATURES.md 3.1
// item 1 replaced the 4.0 italic with the 4.1 file), so the sheet renders true italics for the
// mark span rule. The static export instances and fonts.json come from scripts/build-fonts.py.
// License: SIL OFL 1.1, see THIRD_PARTY_NOTICES.md.
import { readFileSync } from 'node:fs';

import { INTER_LICENCE_URL, INTER_RELEASE } from './names.ts';

export { INTER_LICENCE_URL, INTER_RELEASE };

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
  /** the release the file comes from and its path inside the zip (`Inter-4.1.zip`) */
  release: INTER_RELEASE,
  path: 'web/InterVariable.woff2',
} as const;

/**
 * The italic companion (gslides-parity SPEC-2 7.1): the rsms/inter 4.1 release asset
 * `web/InterVariable-Italic.woff2` (docs/FEATURES.md 3.1 item 1; audit-fonts 4: the file this
 * replaced was the 4.0 release's, "Version 4.000;git-a52131595", 380,904 bytes).
 */
export const INTER_ITALIC = {
  family: 'Inter',
  file: 'InterVariable-Italic.woff2',
  version: '4.001',
  format: 'woff2',
  bytes: 387976,
  sha256: 'e564f652916db6c139570fefb9524a77c4d48f30c92928de9db19b6b5c7a262a',
  weight: [100, 900],
  opticalSize: [14, 32],
  style: 'italic',
  license: 'SIL OFL 1.1',
  /** the release the file comes from and its path inside the zip */
  release: INTER_RELEASE,
  path: 'web/InterVariable-Italic.woff2',
} as const;

/** The name table's version string of both 4.1 files (name ID 5), what inter.test.ts reads from the bytes. */
export const INTER_NAME_VERSION = 'Version 4.001;git-9221beed3';

/** Absolute file URL of the variable font, for Node callers (the standalone build, the exporter). */
export const INTER_VARIABLE_WOFF2 = new URL('../assets/InterVariable.woff2', import.meta.url);

/** Absolute file URL of the italic variable font. */
export const INTER_ITALIC_WOFF2 = new URL('../assets/InterVariable-Italic.woff2', import.meta.url);

/** Absolute file URL of the @font-face stylesheet. */
export const INTER_CSS = new URL('./inter.css', import.meta.url);

/** The deck's font family stack for display and text before the fallback face joined it (head:21-22). */
export const FONT_FAMILY = "'Inter', 'Helvetica Neue', Arial, sans-serif";

/**
 * The metric matched fallback face of gslides-parity SPEC-3 9.2 G1 (research-3 05 section 4 rule
 * 3): Arial with size-adjust and the three overrides so the sheet's line boxes equal Inter's
 * before the woff2 arrives. Computed by scripts/build-fonts.py from InterVariable's hhea and OS/2
 * tables and Arial's (fonts.json `fallback`, pinned by inter.test.ts): size-adjust is Inter's
 * frequency weighted average advance over Arial's, the overrides Inter's ascent, descent and
 * line gap per em divided by size-adjust. inter.css carries the same four numbers.
 */
export const INTER_FALLBACK = {
  family: 'Inter Fallback',
  local: 'Arial',
  /** the second `local()` source for a machine without Arial (docs/FEATURES.md 3.1 item 3): metric compatible with Arial */
  localSecond: 'Liberation Sans',
  sizeAdjust: '107.4724%',
  ascentOverride: '90.1394%',
  descentOverride: '22.444%',
  lineGapOverride: '0%',
} as const;

/**
 * The stack with the fallback face in place (docs/FEATURES.md 3.1 item 3): the sheet's
 * `--display` and `--text` (sheet.css, tokens.ts FONTS), the chrome's `--pt-display` and
 * `--pt-text` (tokens.css) and the identity's initials (marks-render.ts) all read this order, so
 * a first paint takes Inter's metrics before the woff2 arrives and nothing moves when it does.
 */
export const FONT_FAMILY_WITH_FALLBACK =
  "'Inter', 'Inter Fallback', 'Helvetica Neue', Arial, sans-serif";

/** The @font-face rule of the fallback, for a stylesheet that inlines its faces (the standalone build may add it beside the two woff2 faces). */
export function fallbackFontFaceCss(): string {
  return [
    '@font-face {',
    `  font-family: '${INTER_FALLBACK.family}';`,
    `  src: local('${INTER_FALLBACK.local}'), local('${INTER_FALLBACK.localSecond}');`,
    `  size-adjust: ${INTER_FALLBACK.sizeAdjust};`,
    `  ascent-override: ${INTER_FALLBACK.ascentOverride};`,
    `  descent-override: ${INTER_FALLBACK.descentOverride};`,
    `  line-gap-override: ${INTER_FALLBACK.lineGapOverride};`,
    '}',
  ].join('\n');
}

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
