import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FONT_FAMILY_WITH_FALLBACK,
  INTER,
  INTER_CSS,
  INTER_FALLBACK,
  INTER_ITALIC,
  INTER_LICENCE_URL,
  INTER_NAME_VERSION,
  INTER_RELEASE,
  fallbackFontFaceCss,
  fontFaceCss,
  inlineFontFaceCss,
  INTER_LATIN_MAX_BYTES,
  INTER_SUBSETS,
  interBytes,
  interItalicBytes,
  interSubsetFile,
  interSubsetUrl,
} from './inter.ts';
import { FONTS_JSON } from './export.ts';
import { licenceUrl } from './summary.ts';
import { woff2Facts } from './woff2-names.ts';

describe('InterVariable', () => {
  it('is the deck’s file, byte for byte', () => {
    const bytes = interBytes();
    expect(bytes.byteLength).toBe(INTER.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(INTER.sha256);
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
  });

  it('has the deck’s descriptor in inter.css for every subset, the italic beside each (gslides-parity SPEC-2 7.1; docs/DESIGN.md 4.4)', () => {
    const css = readFileSync(INTER_CSS, 'utf8');
    expect(css).toContain("font-family: 'Inter';");
    expect(css).toContain('font-weight: 100 900;');
    expect(css).toContain('font-style: italic;');
    /* the page loads the subsets, never the whole files */
    expect(css).not.toContain("url('../assets/InterVariable.woff2')");
    expect(css).not.toContain("url('../assets/InterVariable-Italic.woff2')");
    for (const subset of INTER_SUBSETS)
      for (const style of ['normal', 'italic'] as const)
        expect(css, `${subset} ${style}`).toContain(
          `url('../assets/${interSubsetFile(subset, style)}') format('woff2')`,
        );
    expect(fontFaceCss('x.woff2')).toContain("src: url('x.woff2') format('woff2');");
    expect(fontFaceCss('y.woff2', 'italic')).toContain('font-style: italic;');
    const inlined = inlineFontFaceCss();
    expect(inlined).toMatch(/^@font-face \{[\s\S]*data:font\/woff2;base64,d09GMgABAAAA/);
    expect(inlined.match(/@font-face/g)).toHaveLength(2);
    expect(inlined).toContain('font-style: italic;');
  });

  it('is the italic file of the same v4.1 release, byte for byte, and its name table says so (docs/archive/rounds/FEATURES.md 3.1 item 1)', () => {
    const bytes = interItalicBytes();
    expect(bytes.byteLength).toBe(INTER_ITALIC.bytes);
    expect(bytes.byteLength).toBe(387976);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(INTER_ITALIC.sha256);
    expect(INTER_ITALIC.sha256).toBe(
      'e564f652916db6c139570fefb9524a77c4d48f30c92928de9db19b6b5c7a262a',
    );
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
    expect(INTER_ITALIC.style).toBe('italic');
    expect(INTER_ITALIC.family).toBe(INTER.family);
    // the version is read from the file's own name table (name ID 5), not from a constant alone:
    // the 4.0 italic this file replaced read "Version 4.000;git-a52131595" (audit-fonts 4)
    const italic = woff2Facts(bytes);
    expect(italic.version).toBe(INTER_NAME_VERSION);
    expect(italic.version).toBe('Version 4.001;git-9221beed3');
    expect(italic.subfamily).toBe('Italic');
    expect(italic.family).toBe('Inter Variable');
    // 4.1 dropped the incomplete c2sc and smcp features the 4.0 italic carried (the changelog)
    expect(italic.features).not.toContain('c2sc');
    expect(italic.features).not.toContain('smcp');
    expect(italic.features).toContain('tnum');
    const upright = woff2Facts(interBytes());
    expect(upright.version).toBe(INTER_NAME_VERSION);
    expect(upright.features).toContain('cv11');
    expect(upright.features).toContain('ss01');
    expect(upright.features).toContain('tnum');
    expect(INTER.version).toBe('4.001');
    expect(INTER_ITALIC.version).toBe('4.001');
  });

  it('names the release tag v4.1 in both release URLs, both licence URLs and fonts.json (docs/archive/rounds/FEATURES.md 3.1 items 1 and 2)', () => {
    const tag = 'https://github.com/rsms/inter/releases/tag/v4.1';
    expect(INTER_RELEASE).toBe(tag);
    expect(INTER.release).toBe(tag);
    expect(INTER_ITALIC.release).toBe(tag);
    expect(INTER_ITALIC.path).toBe('web/InterVariable-Italic.woff2');
    expect(INTER.path).toBe('web/InterVariable.woff2');
    expect(INTER_LICENCE_URL).toBe('https://github.com/rsms/inter/blob/v4.1/LICENSE.txt');
    expect(licenceUrl('inter', 'rsms/inter v4.1 web/', 'unused')).toBe(INTER_LICENCE_URL);
    for (const url of [INTER_RELEASE, INTER_LICENCE_URL, INTER.release, INTER_ITALIC.release]) {
      expect(url).not.toContain('v4.001');
      expect(url).toContain('/v4.1');
    }
    const fonts = JSON.parse(readFileSync(FONTS_JSON, 'utf8')) as {
      source: {
        version: string;
        sha256: string;
        italic: { version: string; sha256: string; bytes: number; release: string; path: string };
      };
    };
    expect(fonts.source.italic.release).toBe(tag);
    expect(fonts.source.italic.path).toBe(INTER_ITALIC.path);
    expect(fonts.source.italic.sha256).toBe(INTER_ITALIC.sha256);
    expect(fonts.source.italic.bytes).toBe(INTER_ITALIC.bytes);
    expect(fonts.source.italic.version).toBe(INTER_NAME_VERSION);
    expect(fonts.source.version).toBe(INTER_NAME_VERSION);
    expect(fonts.source.sha256).toBe(INTER.sha256);
    // the notices and the stylesheet name the same tag and never the tag that does not exist
    const notices = readFileSync(
      new URL('../../../THIRD_PARTY_NOTICES.md', import.meta.url),
      'utf8',
    );
    const inter = notices.slice(
      notices.indexOf('## Inter'),
      notices.indexOf('\n## ', notices.indexOf('## Inter') + 1),
    );
    expect(inter).toContain(tag);
    expect(inter).toContain(INTER_LICENCE_URL);
    expect(inter).not.toContain('v4.001');
    expect(inter).toContain(INTER_ITALIC.sha256);
    expect(readFileSync(INTER_CSS, 'utf8')).not.toContain('v4.001');
  });

  it('ships the metric matched fallback face of gslides-parity SPEC-3 9.2 G1, pinned to the build script', () => {
    // the four descriptors in inter.css equal INTER_FALLBACK and fonts.json `fallback`, which
    // scripts/build-fonts.py computes from InterVariable's tables and the pinned Arial metrics
    const css = readFileSync(INTER_CSS, 'utf8');
    expect(css).toContain("font-family: 'Inter Fallback';");
    // Arial first, Liberation Sans (metric compatible) for a machine without it (FEATURES.md 3.1 item 3)
    expect(css).toContain("src: local('Arial'), local('Liberation Sans');");
    expect(INTER_FALLBACK.localSecond).toBe('Liberation Sans');
    expect(css).toContain(`size-adjust: ${INTER_FALLBACK.sizeAdjust};`);
    expect(css).toContain(`ascent-override: ${INTER_FALLBACK.ascentOverride};`);
    expect(css).toContain(`descent-override: ${INTER_FALLBACK.descentOverride};`);
    expect(css).toContain(`line-gap-override: ${INTER_FALLBACK.lineGapOverride};`);
    /* the twelve subset faces of the design round (docs/DESIGN.md 4.4) and the fallback */
    expect(css.match(/@font-face/g)).toHaveLength(INTER_SUBSETS.length * 2 + 1);
    expect(fallbackFontFaceCss()).toContain(`size-adjust: ${INTER_FALLBACK.sizeAdjust};`);
    expect(fallbackFontFaceCss()).toContain("src: local('Arial'), local('Liberation Sans');");
    expect(FONT_FAMILY_WITH_FALLBACK.startsWith("'Inter', 'Inter Fallback'")).toBe(true);

    const fonts = JSON.parse(readFileSync(FONTS_JSON, 'utf8')) as {
      fallback: typeof INTER_FALLBACK & {
        metrics: {
          inter: {
            unitsPerEm: number;
            ascent: number;
            descent: number;
            lineGap: number;
            avgWidth: number;
          };
          arial: {
            unitsPerEm: number;
            ascent: number;
            descent: number;
            lineGap: number;
            avgWidth: number;
          };
        };
      };
    };
    const { metrics, ...descriptors } = fonts.fallback;
    const { localSecond, ...pinned } = INTER_FALLBACK;
    void localSecond;
    expect(descriptors).toEqual(pinned);
    // the arithmetic, recomputed from the recorded metrics (InterVariable 4.001: 2048 upm, ascent
    // 1984, descent -494, line gap 0; Arial: 2048 upm, ascent 1854, descent -434, line gap 67)
    expect(metrics.inter).toMatchObject({
      unitsPerEm: 2048,
      ascent: 1984,
      descent: -494,
      lineGap: 0,
    });
    expect(metrics.arial).toMatchObject({
      unitsPerEm: 2048,
      ascent: 1854,
      descent: -434,
      lineGap: 67,
    });
    const sizeAdjust =
      metrics.inter.avgWidth /
      metrics.inter.unitsPerEm /
      (metrics.arial.avgWidth / metrics.arial.unitsPerEm);
    // four decimals with the trailing zeros dropped, the form build-fonts.py writes and prettier keeps
    const percent = (value: number): string =>
      `${(value * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '') || '0'}%`;
    expect(percent(sizeAdjust)).toBe(INTER_FALLBACK.sizeAdjust);
    expect(percent(metrics.inter.ascent / 2048 / sizeAdjust)).toBe(INTER_FALLBACK.ascentOverride);
    expect(percent(-metrics.inter.descent / 2048 / sizeAdjust)).toBe(
      INTER_FALLBACK.descentOverride,
    );
    expect(percent(metrics.inter.lineGap / 2048 / sizeAdjust)).toBe(INTER_FALLBACK.lineGapOverride);
    // the fallback's line box equals Inter's: (ascent + descent + gap) per em times size-adjust
    const interBox = (metrics.inter.ascent - metrics.inter.descent + metrics.inter.lineGap) / 2048;
    const fallbackBox =
      (metrics.inter.ascent / 2048 / sizeAdjust + -metrics.inter.descent / 2048 / sizeAdjust) *
      sizeAdjust;
    expect(Math.abs(interBox - fallbackBox)).toBeLessThan(1e-9);
  });
});

// The web subsets of the design round (docs/DESIGN.md 4.4, decision C7): the two release files cut
// into unicode-range files by scripts/build-fonts.py, recorded in fonts.json `web` and declared by
// inter.css's generated block; `turboslide fonts build --check` compares them with a fresh cut.
type WebRecord = {
  file: string;
  range: string;
  style: 'normal' | 'italic';
  unicodeRange: string;
  codepoints: number;
  bytes: number;
  sha256: string;
};

function codepointsOf(range: string): Set<number> {
  const out = new Set<number>();
  for (const part of range.split(',')) {
    const [low, high] = part.trim().replace(/^U\+/i, '').split('-');
    const a = parseInt(low ?? '', 16);
    const b = high === undefined ? a : parseInt(high, 16);
    for (let c = a; c <= b; c += 1) out.add(c);
  }
  return out;
}

describe('the web subsets of InterVariable', () => {
  const fonts = JSON.parse(readFileSync(FONTS_JSON, 'utf8')) as { web: WebRecord[] };
  const css = readFileSync(INTER_CSS, 'utf8');

  it('records one file per subset and style, each on disk with its bytes and sha256', () => {
    expect(fonts.web).toHaveLength(INTER_SUBSETS.length * 2);
    for (const subset of INTER_SUBSETS)
      for (const style of ['normal', 'italic'] as const) {
        const record = fonts.web.find((w) => w.range === subset && w.style === style);
        expect(record, `${subset} ${style}`).toBeDefined();
        expect(record?.file).toBe(interSubsetFile(subset, style));
        const bytes = readFileSync(interSubsetUrl(subset, style));
        expect(bytes.byteLength, record?.file).toBe(record?.bytes);
        expect(createHash('sha256').update(bytes).digest('hex'), record?.file).toBe(record?.sha256);
        expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
      }
  });

  it('keeps the Latin upright under 120,000 B, a third of the whole file', () => {
    const latin = readFileSync(interSubsetUrl('latin')).byteLength;
    expect(latin).toBeLessThanOrEqual(INTER_LATIN_MAX_BYTES);
    expect(latin).toBeLessThan(INTER.bytes / 3);
    expect(readFileSync(interSubsetUrl('latin', 'italic')).byteLength).toBeLessThan(
      INTER_ITALIC.bytes / 3,
    );
  });

  it('keeps the release in every file: the 4.1 name table, the alternates and the figures', () => {
    for (const record of fonts.web) {
      const facts = woff2Facts(readFileSync(new URL(`../assets/${record.file}`, import.meta.url)));
      expect(facts.version, record.file).toBe(INTER_NAME_VERSION);
      expect(facts.family, record.file).toBe('Inter Variable');
    }
    const latin = woff2Facts(readFileSync(interSubsetUrl('latin')));
    for (const feature of ['cv11', 'ss01', 'tnum', 'zero', 'case', 'calt'])
      expect(latin.features, feature).toContain(feature);
  });

  it('declares each file with its own range, Latin last so it is checked first where ranges overlap', () => {
    const rules = [
      ...css.matchAll(
        /src: url\('\.\.\/assets\/([^']+)'\) format\('woff2'\);\s*unicode-range:\s*([^;]+);/g,
      ),
    ];
    expect(rules.map((m) => m[1])).toEqual(
      INTER_SUBSETS.flatMap((subset) => [
        interSubsetFile(subset, 'normal'),
        interSubsetFile(subset, 'italic'),
      ]),
    );
    for (const [, file, range] of rules) {
      const record = fonts.web.find((w) => w.file === file);
      expect((range ?? '').replace(/\s+/g, ' ').trim(), file).toBe(record?.unicodeRange);
    }
    /* the chrome's own control glyphs sit in the Latin range, so a page of chrome text asks for
       the Latin file alone (research-type 1.2) */
    const latin = codepointsOf(
      fonts.web.find((w) => w.file === interSubsetFile('latin'))?.unicodeRange ?? '',
    );
    for (const glyph of '⋯⋮▾▸✓⚠↩⇥●█▄▀⌘⌥⇧⌫←→↵…–—•×◐')
      expect(latin.has(glyph.codePointAt(0) ?? 0), glyph).toBe(true);
    /* the Cyrillic range holds Cyrillic and the Latin range holds none of it */
    const cyrillic = codepointsOf(
      fonts.web.find((w) => w.file === interSubsetFile('cyrillic'))?.unicodeRange ?? '',
    );
    for (const letter of 'Привет') {
      expect(cyrillic.has(letter.codePointAt(0) ?? 0), letter).toBe(true);
      expect(latin.has(letter.codePointAt(0) ?? 0), letter).toBe(false);
    }
  });
});
