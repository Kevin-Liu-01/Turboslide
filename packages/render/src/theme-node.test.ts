import { describe, expect, it } from 'vitest';

import { equationEngine } from './blocks/equation.ts';
import {
  equationCssNode,
  equationFontPaths,
  loadThemeBundle,
  themeFolder,
  themePaths,
} from './theme-node.ts';

// The Node loader (gslides-parity SPEC-5 8.1, 9.3; SPEC-5-amendments A5 items 3 and 5): the
// engine installed at import, the scoped Temml rules on every sheet with the 9 KB supplement
// inlined, the 380 KB math face only for a deck with an equation, the catalog faces on request,
// and the Plate sheet as the GT sheet plus its keyed rules.
describe('theme-node', () => {
  it('installs the Temml engine at import time', () => {
    expect(equationEngine()).not.toBeNull();
  });

  it('names the equation fonts under packages/render/assets', () => {
    const paths = equationFontPaths();
    expect(paths.temmlWoff2.endsWith('/render/assets/Temml.woff2')).toBe(true);
    expect(paths.mathWoff2.endsWith('/render/assets/latinmodern-math.woff2')).toBe(true);
  });

  it('inlines the supplement on every sheet and the math face only when asked', () => {
    const plain = equationCssNode();
    expect(plain).toContain("@font-face { font-family: 'Temml'; src: url(data:font/woff2;base64,");
    expect(plain).not.toContain("font-family: 'Latin Modern Math'; src");
    expect(plain.length).toBeLessThan(30_000);
    const withMath = equationCssNode({ equations: true });
    expect(withMath).toContain(
      "font-family: 'Latin Modern Math'; src: url(data:font/woff2;base64,",
    );
    expect(withMath.length).toBeGreaterThan(500_000);
  });

  it('appends the equation stylesheet to the sheet and the math face on request', () => {
    const bundle = loadThemeBundle();
    expect(bundle.sheetCss).toContain('.ts-sheet .equation math {');
    expect(bundle.sheetCss).not.toContain("font-family: 'Latin Modern Math'; src");
    expect(loadThemeBundle({ equations: true }).sheetCss).toContain(
      "font-family: 'Latin Modern Math'; src",
    );
    expect(loadThemeBundle({ equations: false }).sheetCss).toBe(bundle.sheetCss);
  });

  it('appends one @font-face block per catalog face asked for (b7.md request 5)', () => {
    const base = loadThemeBundle().fontsCss;
    const withRoboto = loadThemeBundle({ fonts: ['roboto'] }).fontsCss;
    expect(withRoboto.startsWith(base)).toBe(true);
    expect(withRoboto).toContain("font-family: 'Roboto'");
    expect(withRoboto).toContain('--ts-font-roboto');
    expect(loadThemeBundle({ fonts: ['inter'] }).fontsCss).toBe(base);
  });

  it('reads the Plate sheet as the GT sheet plus its keyed rules', () => {
    expect(themeFolder()).toBe('gt-ink-paper');
    expect(themeFolder('ts-plate')).toBe('ts-plate');
    expect(themePaths('ts-plate').sheetCss.endsWith('/src/ts-plate/sheet.css')).toBe(true);
    const gt = loadThemeBundle().sheetCss;
    const plate = loadThemeBundle({ theme: 'ts-plate' }).sheetCss;
    expect(plate).toContain(".ts-sheet[data-sheet='ts-plate'] .frame::after");
    expect(plate.startsWith(gt.slice(0, 2000))).toBe(true);
    expect(loadThemeBundle({ theme: 'ts-plate' }).stageCss).toContain(
      ".ts-sheet[data-sheet='ts-plate'].is-picture",
    );
  });
});
