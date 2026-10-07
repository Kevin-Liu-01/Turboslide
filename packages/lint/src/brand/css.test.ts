import { describe, expect, test } from 'vitest';

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lintAlternatesText, lintCss, parseCss } from './css.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function rulesOf(text: string, file = 'packages/chrome/src/Fixture.css'): string[] {
  return lintCss(file, text).map((f) => f.rule);
}

describe('the CSS parser', () => {
  test('reads each declaration with its selector, line, at-rules and block, comments out', () => {
    const decls = parseCss(
      [
        '/* a { color: red } */',
        '.a,',
        '.b { color: var(--pt-ink); background: url("x;y.png") }',
        '@media (max-width: 1023px) {',
        '  .c > .d { border-radius: 4px; }',
        '}',
        '.e { &:hover { color: red } .f { color: blue } }',
      ].join('\n'),
    );
    expect(decls.map((d) => [d.selector, d.property, d.value, d.line])).toEqual([
      ['.a, .b', 'color', 'var(--pt-ink)', 3],
      ['.a, .b', 'background', 'url("x;y.png")', 3],
      ['.c > .d', 'border-radius', '4px', 5],
      ['.e:hover', 'color', 'red', 7],
      ['.e .f', 'color', 'blue', 7],
    ]);
    expect(decls[2]?.atRules).toEqual(['@media (max-width: 1023px)']);
  });
});

describe('the CSS checks', () => {
  test('css/no-smooth-scroll reads scroll-behavior: smooth and passes auto', () => {
    expect(rulesOf('.pt-book { scroll-behavior: smooth; }')).toEqual(['css/no-smooth-scroll']);
    expect(rulesOf('html { scroll-behavior: auto; }')).toEqual([]);
  });

  test('css/radius passes the ladder and reads every other corner', () => {
    expect(
      rulesOf(
        '.a { border-radius: 0 } .b { border-radius: 50% } .c { border-radius: var(--pt-radius) } .d { border-top-left-radius: calc(var(--pt-radius) - 1px) } .e { border-radius: var(--pt-radius, 6px) }',
      ),
    ).toEqual([]);
    expect(rulesOf('.a { border-radius: 4px }')).toEqual(['css/radius']);
    expect(rulesOf('.a { --ts-card-radius: 4px }')).toEqual(['css/radius']);
    expect(rulesOf(':root { --pt-radius: 6px }')).toEqual([]);
    /* the two named exceptions left in DR-D1#5: Slideshow and the search key chip draw the
       ladder's tokens, so their old literals are findings in their own files too */
    expect(
      rulesOf('.ts-title-slideshow { border-radius: 8px }', 'packages/chrome/src/TitleRow.css'),
    ).toEqual(['css/radius']);
    expect(
      rulesOf('.pt-search-kbd { border-radius: 4px }', 'packages/chrome/src/Toolbar.css'),
    ).toEqual(['css/radius']);
    expect(
      rulesOf(
        '.ts-title-slideshow { border-radius: var(--pt-radius) } .pt-kbd { border-radius: var(--pt-radius-sm) } .pt-window { border-radius: var(--pt-radius-lg) }',
        'packages/chrome/src/TitleRow.css',
      ),
    ).toEqual([]);
  });

  test('css/mono-outside-code passes code elements and the named code surfaces alone', () => {
    expect(rulesOf('.ts-x code, .ts-x pre { font-family: var(--pt-mono) }')).toEqual([]);
    expect(rulesOf('.ts-x kbd:hover { font: 12px/1 var(--pt-mono) }')).toEqual([]);
    expect(rulesOf('.ts-drawer-label { font-family: var(--pt-mono) }')).toEqual([
      'css/mono-outside-code',
    ]);
    expect(rulesOf('.ts-x code, .ts-y { font-family: monospace }')).toEqual([
      'css/mono-outside-code',
    ]);
    /* /home's code surfaces are its two #101010 panels, the hero's terminal and the agents band's
       console, both `.ts-home-panel` since the landing's second pass (config.ts) */
    expect(
      rulesOf('.ts-home-panel { font-family: var(--pt-mono) }', 'apps/studio/src/routes/home.css'),
    ).toEqual([]);
    expect(rulesOf('.ts-home-panel { font-family: var(--pt-mono) }')).toEqual([
      'css/mono-outside-code',
    ]);
    expect(
      rulesOf('.ts-product-cmd { font-family: var(--pt-mono) }', 'apps/studio/src/routes/home.css'),
    ).toEqual(['css/mono-outside-code']);
    expect(rulesOf(':root { --pt-mono: ui-monospace, Menlo, monospace }')).toEqual([]);
  });

  test('css/no-eyebrow reads uppercase with positive tracking in one rule', () => {
    expect(rulesOf('.a { text-transform: uppercase; letter-spacing: 0.06em }')).toEqual([
      'css/no-eyebrow',
    ]);
    expect(rulesOf('.a { text-transform: uppercase; letter-spacing: 0 }')).toEqual([]);
    expect(rulesOf('.a { text-transform: uppercase } .b { letter-spacing: 0.06em }')).toEqual([]);
  });

  test('css/inter-only reads a face outside Inter and its fallbacks', () => {
    expect(
      rulesOf(
        "--x: 1; .a { font-family: 'Inter', 'Inter Fallback', 'Helvetica Neue', Arial, sans-serif }",
      ),
    ).toEqual([]);
    expect(rulesOf('.a { font: var(--ts-body) / 1.55 var(--pt-text) }')).toEqual([]);
    expect(rulesOf('.a { font-family: Georgia, serif }')).toEqual(['css/inter-only']);
    expect(rulesOf("@font-face { font-family: 'Lora'; src: url(l.woff2) }")).toEqual([
      'css/inter-only',
    ]);
    expect(rulesOf("@font-face { font-family: 'Inter'; src: url(i.woff2) }")).toEqual([]);
  });

  test('css/single-rail reads the retired outer rail', () => {
    expect(rulesOf('.a { left: calc(-1 * var(--tc-rail-outer)) }')).toEqual(['css/single-rail']);
    expect(rulesOf('.ts-rail-outer { border-inline: 1px solid var(--pt-hair) }')).toEqual([
      'css/single-rail',
    ]);
    expect(rulesOf('.ts-rail { border-inline: 1px solid var(--pt-hair) }')).toEqual([]);
  });

  test('css/radius takes the ladder of the design round: the three rungs and a rung less an inset', () => {
    expect(
      rulesOf(
        '.a { border-radius: var(--pt-radius-sm) } .b { border-radius: var(--pt-radius-lg) } .c { border-radius: calc(var(--pt-radius-lg) - 1px) } .d { border-radius: var(--pt-radius-sm) var(--pt-radius-sm) 0 0 }',
      ),
    ).toEqual([]);
    expect(rulesOf(':root { --pt-radius-sm: 4px; --pt-radius-lg: 8px }')).toEqual([]);
    expect(rulesOf('.a { border-radius: 8px }')).toEqual(['css/radius']);
    expect(rulesOf('.a { border-radius: var(--pt-radius-xl) }')).toEqual(['css/radius']);
  });

  test('css/z-index passes local order under 5 and the layer tokens, and reads every other value', () => {
    expect(
      rulesOf(
        '.a { z-index: 1 } .b { z-index: -1 } .c { z-index: auto } .d { z-index: var(--ts-layer-popover) } .e { z-index: var(--ts-layer-skip) }',
      ),
    ).toEqual([]);
    expect(rulesOf('.ts-menu { z-index: 30 }')).toEqual(['css/z-index']);
    expect(rulesOf('.ts-tip { z-index: 120 }')).toEqual(['css/z-index']);
    expect(rulesOf('.a { z-index: var(--ts-layer-modal) }')).toEqual(['css/z-index']);
    expect(rulesOf('.a { z-index: calc(var(--ts-layer-popover) + 1) }')).toEqual(['css/z-index']);
    /* tokens.css declares the layers; a z-index there is its own */
    expect(rulesOf('.a { z-index: 40 }', 'packages/chrome/src/tokens.css')).toEqual([]);
  });

  test('css/no-shadow passes the ring of spreads and reads a blur or an offset', () => {
    expect(
      rulesOf(
        '.a { box-shadow: var(--pt-ring) } .b { box-shadow: 0 0 0 1px var(--pt-paper), 0 0 0 2px var(--pt-hair-soft) } .c { box-shadow: inset 0 0 0 1px var(--pt-ink) } .d { box-shadow: none }',
      ),
    ).toEqual([]);
    expect(rulesOf('.ts-dialog-card { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18) }')).toEqual([
      'css/no-shadow',
    ]);
    expect(rulesOf('.a { box-shadow: 0 0 12px var(--pt-hair) }')).toEqual(['css/no-shadow']);
    expect(rulesOf('.a { box-shadow: 0 0 0 1px red, 2px 2px 0 0 blue }')).toEqual([
      'css/no-shadow',
    ]);
    /* an inset line with no blur is a rule inside the box, not a shadow */
    expect(rulesOf('.a { box-shadow: inset 0 -1px 0 var(--pt-hair) }')).toEqual([]);
    expect(rulesOf('.a { box-shadow: inset 0 2px 6px var(--pt-hair) }')).toEqual(['css/no-shadow']);
  });

  test('css/scrollbar keeps the one scrollbar in tokens.css and lets another file only hide a bar', () => {
    expect(
      rulesOf(
        '.ts-menubar { scrollbar-width: none } .ts-menubar::-webkit-scrollbar { display: none }',
      ),
    ).toEqual([]);
    expect(rulesOf('.a::-webkit-scrollbar { width: 8px }')).toEqual(['css/scrollbar']);
    expect(rulesOf('.a::-webkit-scrollbar-thumb { background: var(--pt-thumb) }')).toEqual([
      'css/scrollbar',
    ]);
    expect(rulesOf('.a { scrollbar-width: thin }')).toEqual(['css/scrollbar']);
    expect(rulesOf('html { scrollbar-color: var(--pt-thumb) transparent }')).toEqual([
      'css/scrollbar',
    ]);
    expect(
      rulesOf(
        '::-webkit-scrollbar { width: 8px } :root { scrollbar-color: red transparent }',
        'packages/chrome/src/tokens.css',
      ),
    ).toEqual([]);
  });

  test('css/numerals reads tabular figures written by hand outside tokens.css', () => {
    expect(rulesOf('.a { font-variant-numeric: var(--pt-numerals) }')).toEqual([]);
    expect(rulesOf('.a { font-variant-numeric: tabular-nums }')).toEqual(['css/numerals']);
    expect(rulesOf(".a { font-feature-settings: 'tnum' }")).toEqual(['css/numerals']);
    expect(
      rulesOf('.pt-num { font-variant-numeric: tabular-nums }', 'packages/chrome/src/tokens.css'),
    ).toEqual([]);
  });

  test("css/chrome-alternates reads every stylistic set and character variant outside the General Translation theme's files", () => {
    expect(rulesOf(".ts-x { font-feature-settings: 'cv11', 'ss01' }")).toEqual([
      'css/chrome-alternates',
    ]);
    expect(rulesOf(".ts-x { --ts-features: 'ss01' }")).toEqual(['css/chrome-alternates']);
    /* docs/POLISH-2.md 2.3: every ssNN, cvNN, salt, swsh and aalt, not only General Translation's two */
    expect(rulesOf('.pt-button { font-feature-settings: "ss02" }')).toEqual([
      'css/chrome-alternates',
    ]);
    for (const tag of ['ss20', 'cv01', 'cv99', 'salt', 'swsh', 'aalt'])
      expect(rulesOf(`.ts-x { font-feature-settings: '${tag}' 1 }`), tag).toEqual([
        'css/chrome-alternates',
      ]);
    expect(rulesOf('.ts-x { font-variant-alternates: stylistic(x) }')).toEqual([
      'css/chrome-alternates',
    ]);
    expect(rulesOf('.ts-x { font-variant: styleset(open-digits) }')).toEqual([
      'css/chrome-alternates',
    ]);
    expect(rulesOf('.ts-x { font-variant-alternates: normal }')).toEqual([]);
    expect(rulesOf('.ts-x { font-feature-settings: normal }')).toEqual([]);
    /* case, calt and kern are not alternates; the numeric features are css/numerals' */
    expect(rulesOf(".ts-x { font-feature-settings: 'case', 'calt', 'kern' }")).toEqual([]);
    /* the theme's token is read only on a slide */
    expect(rulesOf('.ts-x h1 { font-feature-settings: var(--display-features) }')).toEqual([
      'css/chrome-alternates',
    ]);
    expect(
      rulesOf(
        '.ts-sheet .ts-home-h1, .ts-home-h2 { font-feature-settings: var(--display-features) }',
      ),
    ).toEqual(['css/chrome-alternates']);
    expect(
      rulesOf(
        '.ts-sheet .ts-home-h1,\n.ts-sheet .ts-home-h2 { font-feature-settings: var(--display-features) }',
        'apps/studio/src/routes/home.css',
      ),
    ).toEqual([]);
    expect(
      rulesOf(
        ".ts-sheet h1 { font-feature-settings: 'cv11', 'ss01' }",
        'packages/theme/src/gt-ink-paper/sheet.css',
      ),
    ).toEqual([]);
  });

  test('css/chrome-alternates reads the generated brand sources as text, and nothing else reads them', () => {
    const old =
      '<svg><text font-weight="500" style="font-feature-settings:\'cv11\',\'ss01\'">Turboslide</text></svg>';
    expect(lintAlternatesText('packages/theme/brand/wordmark.svg', old)).toMatchObject([
      { rule: 'css/chrome-alternates', line: 1 },
    ]);
    const card =
      "<style>\nbody { color: var(--pt-ink); font-feature-settings: 'cv11', 'ss01'; }\n</style>";
    expect(lintAlternatesText('packages/theme/brand/og-template.html', card)).toMatchObject([
      { rule: 'css/chrome-alternates', line: 2 },
    ]);
    expect(
      lintAlternatesText('packages/theme/brand/og-template.html', '<!-- cv11 and ss01 -->'),
    ).toEqual([]);
    /* the committed sources since P2-F#3 */
    for (const file of [
      'packages/theme/brand/wordmark.svg',
      'packages/theme/brand/og-template.html',
    ])
      expect(lintAlternatesText(file, readFileSync(resolve(ROOT, file), 'utf8')), file).toEqual([]);
    /* a stylesheet under an alternates root is read by this rule alone */
    expect(rulesOf('.x { border-radius: 3px; z-index: 40 }', 'packages/theme/brand/x.css')).toEqual(
      [],
    );
  });

  test('each finding names the file, the line and the declaration', () => {
    const [finding] = lintCss(
      'packages/viewer/src/BookView.css',
      '\n.pt-book {\n  scroll-behavior: smooth;\n}',
    );
    expect(finding).toMatchObject({
      rule: 'css/no-smooth-scroll',
      file: 'packages/viewer/src/BookView.css',
      line: 3,
      column: 3,
      text: '.pt-book { scroll-behavior: smooth }',
    });
  });
});
