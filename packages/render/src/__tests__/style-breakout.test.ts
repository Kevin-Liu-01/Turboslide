// Hardening H1 (WEB-1, WEBV-1): deck controlled CSS cannot close the style element it lands in, on
// every render path that writes CSS into one: a slide's residual (`ext.import.css`), the `html`
// block inline (the editor, the show, the template cover, the standalone file) and in its sandboxed
// frame, the brand kit sheet, and the deck and print documents' extra CSS. Each output is parsed
// with jsdom, so the check is the HTML parser's own reading. The objects here skip the schema on
// purpose (a peer's raw op reaches the renderer the same way); the GT deck's imported CSS renders
// byte for byte.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import type { BlockOf } from '@turboslide/schema/blocks';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { safeStyleText } from '@turboslide/schema/style-text';

import type { BlockContext } from '../blocks/context.ts';
import { renderHtmlEscape } from '../blocks/html-escape.ts';
import { renderDeck } from '../deck.ts';
import { renderPrintDocument } from '../print.ts';
import { sanitizeCss } from '../sanitize/css.ts';
import { buildFrameSource, frameDocument, htmlFrameFor } from '../sanitize/frame.ts';
import { renderSlide, rewriteSlideScope } from '../slide.ts';
import { contentSlide, deck } from './fixtures.ts';

/** The payload web-verify.md reproduced, and its variants. */
const PAYLOADS: Record<string, string> = {
  verifier: `.a{}</style><img src=/nonexistent.png onerror="window.__COLLABXSS=1;document.title='COLLABXSS'"><style>.b{}`,
  'mixed case': '.a{color:red}</StYlE><img src=x onerror=alert(1)><style>.b{}',
  'whitespace before >': '.a{color:red}</style\n\t><img src=x onerror=alert(1)>',
  'whitespace after <': '.a{color:red}< /style><img src=x onerror=alert(1)>',
  'inside a string': '.a::after{content:"</style><img src=x onerror=alert(1)>"}',
  'inside a comment': '/* </style><img src=x onerror=alert(1)> */ .a{color:red}',
  'nested comments': '/* /* */ </style><img src=x onerror=alert(1)> /* */ */ .a{color:red}',
  'comment split script': '.a{color:red}<scr/**/ipt>alert(1)</scr/**/ipt>',
  'html comment': '<!-- .a{color:red} --></style><img src=x onerror=alert(1)>',
  cdata: '<![CDATA[ .a{color:red} ]]></style><img src=x onerror=alert(1)>',
  script: '.a{color:red}<SCRIPT>alert(1)</SCRIPT>',
  'json unicode escape, decoded': JSON.parse(
    '".a{color:red}\\u003c/style>\\u003cimg src=x onerror=alert(1)>"',
  ) as string,
};

const MARKUP_OPENER = /<\s*\/\s*style|<\s*!|<\s*script/i;

/** Parses as the browser does and asserts the CSS stayed inside its style elements. */
function expectContained(html: string, document = false): void {
  const dom = new JSDOM(document ? html : `<!doctype html><body>${html}</body>`);
  const doc = dom.window.document;
  expect(doc.querySelectorAll('[onerror]').length).toBe(0);
  expect(doc.querySelectorAll('img[src="x"], img[src="/nonexistent.png"]').length).toBe(0);
  expect(doc.querySelectorAll('script').length).toBe(0);
  for (const style of doc.querySelectorAll('style')) {
    expect(style.textContent).not.toMatch(MARKUP_OPENER);
  }
}

function context(extra: Partial<BlockContext> = {}): BlockContext {
  return {
    slideId: 'held',
    theme: 'light',
    blockAttrs: true,
    gtWord: true,
    image: () => undefined,
    assetUrl: (path) => path,
    slotWidth: 1326,
    slide: { kind: 'content' },
    rasters: [],
    warnings: [],
    rasterCount: 0,
    ...extra,
  };
}

function htmlBlock(css: string): BlockOf<'html'> {
  return { id: 'x', type: 'html', css, html: '<p>an html block</p>', note: 'n' };
}

function heldSlide(css: string): Slide {
  return contentSlide(
    'held',
    { type: 'stack' },
    { main: [htmlBlock(css)] },
    { ext: { import: { css } } },
  );
}

const renderOptions = {
  theme: 'light',
  assetBase: 'decks/test/',
  chrome: false,
  blockAttrs: false,
  gtWord: false,
} as const;
const bundle = { sheetCss: '', stageCss: '', sprite: '', fontsCss: '' };
const heldDeck: Deck = {
  ...deck,
  sections: [{ id: 'brand', name: 'Brand', slideIds: ['held'] }],
};

describe('the harness', () => {
  it('sees the verifier payload break out of an unguarded style element', () => {
    const dom = new JSDOM(`<!doctype html><body><style>${PAYLOADS['verifier']}</style></body>`);
    expect(dom.window.document.querySelectorAll('img[onerror]').length).toBe(1);
  });
});

describe('every render path keeps the CSS inside its style element', () => {
  for (const [name, css] of Object.entries(PAYLOADS)) {
    describe(name, () => {
      it('renderSlide: the residual and the html block inline (the editor, the show)', () => {
        const rendered = renderSlide(heldDeck, heldSlide(css), renderOptions);
        expect(rendered.html).toContain('ts-x-held');
        expectContained(rendered.html);
      });

      it('renderSlide with the frame: the srcdoc document', () => {
        const rendered = renderSlide(heldDeck, heldSlide(css), {
          ...renderOptions,
          htmlFrame: htmlFrameFor({ theme: 'light', assetUrl: (path) => path }),
        });
        expectContained(rendered.html);
        const frame = new JSDOM(`<body>${rendered.html}</body>`).window.document.querySelector(
          'iframe',
        );
        expect(frame).not.toBeNull();
        expectContained(frame?.getAttribute('srcdoc') ?? '', true);
      });

      it('renderHtmlEscape and sanitizeCss', () => {
        expectContained(renderHtmlEscape(htmlBlock(css), context()));
        expect(sanitizeCss(css).css).not.toMatch(MARKUP_OPENER);
      });

      it('buildFrameSource and frameDocument with raw CSS', () => {
        expectContained(
          buildFrameSource(htmlBlock(css), { theme: 'dark', assetUrl: (p) => p }).srcdoc,
          true,
        );
        expectContained(
          frameDocument({ html: '<p>x</p>', css, themeCss: css, scope: 'ts-x-s', theme: 'light' }),
          true,
        );
      });

      it('the brand kit sheet, through a font source', () => {
        const kitDeck: Deck = { ...heldDeck, brand: { fonts: { display: 'roboto' } } };
        const rendered = renderSlide(
          kitDeck,
          contentSlide('held', { type: 'stack' }, { main: [] }),
          {
            ...renderOptions,
            fontSrc: () => `x') }${css}`,
          },
        );
        expect(rendered.html).toContain('ts-kit-css');
        expectContained(rendered.html);
      });

      it('renderDeck and renderPrintDocument with extra CSS', () => {
        const slide = heldSlide(css);
        expectContained(
          renderDeck(heldDeck, [slide], {
            ...renderOptions,
            bundle,
            extraCss: css,
            runtime: '',
          }).html.replace(/<script><\/script>/, ''),
          true,
        );
        expectContained(
          renderPrintDocument(heldDeck, [slide], { ...renderOptions, bundle, extraCss: css }).html,
          true,
        );
      });
    });
  }
});

describe("the GT deck's imported CSS", () => {
  const dir = join(resolve(import.meta.dirname, '../../../..'), 'decks/gt-brand');
  const gtDeck = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as Deck;
  const slides = readdirSync(join(dir, 'slides')).map(
    (file) => JSON.parse(readFileSync(join(dir, 'slides', file), 'utf8')) as Slide,
  );
  const withCss = slides.filter(
    (slide) =>
      typeof (slide.ext as { import?: { css?: unknown } } | undefined)?.import?.css === 'string',
  );

  it('renders unchanged: the residual style element is rewriteSlideScope of the stored CSS', () => {
    expect(withCss.length).toBeGreaterThan(10);
    for (const slide of withCss) {
      const css = (slide.ext as { import: { css: string } }).import.css;
      const scoped = rewriteSlideScope(css, `.ts-x-${slide.id}`);
      expect(safeStyleText(scoped)).toBe(scoped);
      const rendered = renderSlide(gtDeck, slide, { ...renderOptions, deckSlides: slides });
      expect(rendered.html).toContain(`<style>${scoped}</style>`);
    }
  });
});
