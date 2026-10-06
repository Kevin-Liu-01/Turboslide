import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { inlineFontCss, loadThemeBundle } from '../theme-node.ts';

// A rendered document keeps the whole Inter file (SPEC 5.2, 5.3; docs/DESIGN.md 4.4): since the
// design round inter.css declares the page's unicode-range subsets, and the document's font CSS
// replaces that block with the upright inlined whole and no range, so every script renders and
// the bytes of a render stay what they were.

const interCss = readFileSync(new URL('../../../fonts/src/inter.css', import.meta.url), 'utf8');
const woff2 = readFileSync(new URL('../../../fonts/assets/InterVariable.woff2', import.meta.url));

describe('the Inter CSS of a rendered document', () => {
  it('inlines the whole upright once, with no unicode-range and no subset file', () => {
    const css = inlineFontCss(interCss, woff2).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css.match(/data:font\/woff2;base64,/g)).toHaveLength(1);
    expect(css).toContain(woff2.toString('base64').slice(0, 64));
    expect(css).not.toContain('unicode-range');
    expect(css).not.toMatch(/InterVariable-(?:latin|cyrillic|greek|vietnamese|symbols)/);
    expect(css).not.toContain('faces:generated');
    expect(css).toContain("font-family: 'Inter Fallback';");
    expect(css.match(/@font-face/g)).toHaveLength(3);
  });

  it('keeps the rule before the round for a stylesheet without the generated block', () => {
    const old =
      "@font-face { font-family: 'Inter'; src: url('../assets/InterVariable.woff2') format('woff2'); }";
    expect(inlineFontCss(old, Buffer.from('abc'))).toBe(
      "@font-face { font-family: 'Inter'; src: url(data:font/woff2;base64,YWJj) format('woff2'); }",
    );
  });

  it('is what loadThemeBundle hands the renderer', () => {
    const bundle = loadThemeBundle();
    expect(bundle.fontsCss).toBe(inlineFontCss(interCss, woff2));
  });
});
