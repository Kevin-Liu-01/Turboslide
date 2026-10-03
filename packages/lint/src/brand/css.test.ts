import { describe, expect, test } from 'vitest';

import { lintCss, parseCss } from './css.ts';

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

  test('css/radius passes the rule and the named exceptions, and reads every other corner', () => {
    expect(
      rulesOf(
        '.a { border-radius: 0 } .b { border-radius: 50% } .c { border-radius: var(--pt-radius) } .d { border-top-left-radius: calc(var(--pt-radius) - 1px) } .e { border-radius: var(--pt-radius, 6px) }',
      ),
    ).toEqual([]);
    expect(rulesOf('.a { border-radius: 4px }')).toEqual(['css/radius']);
    expect(rulesOf('.a { --ts-card-radius: 4px }')).toEqual(['css/radius']);
    expect(rulesOf(':root { --pt-radius: 6px }')).toEqual([]);
    expect(
      rulesOf('.ts-title-slideshow { border-radius: 8px }', 'packages/chrome/src/TitleRow.css'),
    ).toEqual([]);
    expect(
      rulesOf('.ts-title-share { border-radius: 8px }', 'packages/chrome/src/TitleRow.css'),
    ).toEqual(['css/radius']);
    expect(rulesOf('.ts-title-slideshow { border-radius: 8px }')).toEqual(['css/radius']);
    expect(
      rulesOf('.pt-search-kbd { border-radius: 4px }', 'packages/chrome/src/Toolbar.css'),
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
    /* /home's one code surface is the agents band's panel since the landing (config.ts) */
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
