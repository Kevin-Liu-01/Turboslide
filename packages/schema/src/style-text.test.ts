// Hardening H1 (WEB-1, WEBV-1): deck controlled CSS cannot close the style element it lands in.
// `safeStyleText` over the verifier's payload and its variants, valid CSS byte for byte, and the
// schema boundary: a slide's `ext.import.css` and an `html` block's `css` are cleaned when they
// are written (applyWrite) or read (validateDeck), and the GT deck's imported CSS is unchanged.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { blockSchema, extSchema } from './blocks.ts';
import type { ContentSlide, Slide } from './deck.ts';
import { importResidual } from './ext.ts';
import { workedDocument } from './fixtures.ts';
import { applyWrite } from './reduce.ts';
import { isSafeStyleText, safeStyleText } from './style-text.ts';
import { validateDeck, validateDocument, validateSlide } from './validate.ts';

/** The payload web-verify.md reproduced as an anonymous editor link collaborator. */
const VERIFIER_PAYLOAD = `.a{}</style><img src=/nonexistent.png onerror="window.__COLLABXSS=1;document.title='COLLABXSS'"><style>.b{}`;

/** The breakout in every form the HTML parser accepts, and the openers the check also stops. */
const BREAKOUT_VARIANTS: Record<string, string> = {
  verifier: VERIFIER_PAYLOAD,
  'mixed case': '.a{}</StYlE><img src=x onerror=alert(1)><style>.b{}',
  'upper case': '.a{}</STYLE><img src=x onerror=alert(1)>',
  'space before >': '.a{}</style ><img src=x onerror=alert(1)>',
  'newline before >': '.a{}</style\n><img src=x onerror=alert(1)>',
  'tab and slash': '.a{}</style\t/><img src=x onerror=alert(1)>',
  'form feed': '.a{}</style\f><img src=x onerror=alert(1)>',
  'whitespace after <': '.a{}< /style><img src=x onerror=alert(1)>',
  'whitespace after </': '.a{}</ style><img src=x onerror=alert(1)>',
  'newline after <': '.a{}<\n/style><img src=x onerror=alert(1)>',
  'inside a string': 'a{content:"</style><img src=x onerror=alert(1)>"}',
  'inside a single quoted string': "a{content:'</style><img src=x onerror=alert(1)>'}",
  'inside a url': 'a{background:url(</style><img src=x onerror=alert(1)>)}',
  'inside a comment': '/* </style><img src=x onerror=alert(1)> */ .a{color:red}',
  'nested comments': '/* /* */ </style><img src=x onerror=alert(1)> /* */ */ .a{}',
  'doubled opener': '.a{}<</style>/style><img src=x onerror=alert(1)>',
  'html comment opener': '<!-- .a{} --></style><img src=x onerror=alert(1)>',
  'cdata opener': '<![CDATA[ .a{} ]]></style><img src=x onerror=alert(1)>',
  'script tag': '.a{}<script>alert(1)</script>',
  'script tag upper case': '.a{}<SCRIPT>alert(1)</SCRIPT>',
  'script tag with whitespace': '.a{}< script>alert(1)</ script>',
  'json unicode escape, decoded': JSON.parse(
    '".a{}\\u003c/style>\\u003cimg src=x onerror=alert(1)>"',
  ) as string,
};

/** Escaped forms that are text inside a style element: they never close it and stay as written. */
const INERT_ESCAPES = [
  '.a::after { content: "\\3c /style>"; }',
  '.a::after { content: "&lt;/style&gt;"; }',
  '.a::after { content: "\\u003c/style>"; }',
];

/** Valid CSS that holds a `<` or a `>` the check must leave alone. */
const VALID_CSS = [
  '@media (width < 600px) { .a { color: red; } }',
  '@media (400px <= width <= 700px) { .a { color: red; } }',
  '@media (width<600px){.a{color:red}}',
  '@container (inline-size < 30em) { .a { gap: 4px; } }',
  '.a > .b + .c ~ .d { margin: 0; }',
  '.a::after { content: "a < b"; }',
  '.a::after { content: "<"; }',
];

/** True when the text holds an end tag, comment, CDATA or script opener, with any whitespace. */
function breaksOut(text: string): boolean {
  return /<\s*\/\s*style|<\s*!|<\s*script/i.test(text);
}

const DECKS = join(import.meta.dirname, '..', '..', '..', 'decks');

function loadDeckDir(dir: string): { deck: unknown; slides: Slide[] } {
  const deck: unknown = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8'));
  const slides = readdirSync(join(dir, 'slides'))
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(join(dir, 'slides', file), 'utf8')) as Slide);
  return { deck, slides };
}

function residualCss(slide: Slide): string | undefined {
  const ext = slide.ext as { import?: { css?: unknown } } | undefined;
  return typeof ext?.import?.css === 'string' ? ext.import.css : undefined;
}

describe('safeStyleText', () => {
  for (const [name, css] of Object.entries(BREAKOUT_VARIANTS)) {
    it(`neutralises the breakout: ${name}`, () => {
      expect(breaksOut(css)).toBe(true);
      const safe = safeStyleText(css);
      expect(breaksOut(safe)).toBe(false);
      expect(safe).toContain('\\3c ');
      expect(isSafeStyleText(safe)).toBe(true);
      expect(safeStyleText(safe)).toBe(safe);
    });
  }

  it('writes the verifier payload with the escape and nothing else changed', () => {
    expect(safeStyleText(VERIFIER_PAYLOAD)).toBe(
      `.a{}\\3c /style><img src=/nonexistent.png onerror="window.__COLLABXSS=1;document.title='COLLABXSS'"><style>.b{}`,
    );
  });

  it('keeps an escaped form, which is text inside a style element, as written', () => {
    for (const css of INERT_ESCAPES) {
      expect(breaksOut(css)).toBe(false);
      expect(safeStyleText(css)).toBe(css);
    }
  });

  it('keeps valid CSS byte for byte', () => {
    for (const css of VALID_CSS) {
      expect(safeStyleText(css)).toBe(css);
      expect(isSafeStyleText(css)).toBe(true);
    }
  });
});

describe('the schema boundary', () => {
  it('extSchema cleans import.css and keeps every other field', () => {
    const parsed = extSchema.parse({
      import: { css: VERIFIER_PAYLOAD, scope: 's09', classes: ['rules'] },
      other: { kept: true },
    });
    expect(parsed).toEqual({
      import: { css: safeStyleText(VERIFIER_PAYLOAD), scope: 's09', classes: ['rules'] },
      other: { kept: true },
    });
    const clean = { import: { css: '.rules > div { padding: 13px 0; }' } };
    expect(extSchema.parse(clean)).toEqual(clean);
  });

  it('importResidual answers the cleaned CSS', () => {
    for (const css of Object.values(BREAKOUT_VARIANTS)) {
      const residual = importResidual({ import: { css } });
      expect(residual?.css).toBe(safeStyleText(css));
      expect(breaksOut(residual?.css ?? '')).toBe(false);
    }
  });

  it("cleans an html block's css when the block parses", () => {
    for (const css of Object.values(BREAKOUT_VARIANTS)) {
      const block = blockSchema.parse({ id: 'x', type: 'html', css, html: '<p>x</p>', note: 'n' });
      expect(block.type === 'html' && block.css).toBe(safeStyleText(css));
    }
  });

  it('validateSlide cleans both on a stored slide, so a deck written before the check loads safe', () => {
    const slide: ContentSlide = {
      schemaVersion: 1,
      id: 'held',
      kind: 'content',
      layout: { type: 'stack' },
      slots: {
        main: [{ id: 'x', type: 'html', css: VERIFIER_PAYLOAD, html: '<p>x</p>', note: 'n' }],
      },
      ext: { import: { css: VERIFIER_PAYLOAD } },
    };
    const result = validateSlide(slide);
    expect(result.ok).toBe(true);
    const stored = result.slide as ContentSlide;
    expect(residualCss(stored)).toBe(safeStyleText(VERIFIER_PAYLOAD));
    const block = stored.slots['main']?.[0];
    expect(block?.type === 'html' && block.css).toBe(safeStyleText(VERIFIER_PAYLOAD));
  });

  it('applyWrite stores the cleaned CSS of a slide.set /ext and of an inserted html block', () => {
    const base = validateDocument(workedDocument());
    if (!base.ok || base.deck === null) throw new Error('fixture');
    const result = applyWrite(
      { deck: base.deck, slides: base.slides },
      {
        baseRevision: base.deck.revision,
        author: { kind: 'agent', name: 'agent', runId: 'h1' },
        mutations: [
          {
            op: 'slide.set',
            slideId: 'content-rule',
            path: '/ext',
            value: { import: { css: VERIFIER_PAYLOAD } },
          },
          {
            op: 'block.insert',
            slideId: 'content-rule',
            slot: 'left',
            block: {
              id: 'x',
              type: 'html',
              css: BREAKOUT_VARIANTS['mixed case'] ?? '',
              html: '<p>x</p>',
              note: 'n',
            },
          },
        ],
      },
    );
    if (!result.ok) throw new Error(result.message);
    const slide = result.document.slides['content-rule'] as ContentSlide;
    expect(residualCss(slide)).toBe(safeStyleText(VERIFIER_PAYLOAD));
    const block = slide.slots['left']?.find((each) => each.id === 'x');
    expect(block?.type === 'html' && breaksOut(block.css)).toBe(false);
    expect(JSON.stringify(result.document.slides)).not.toMatch(/<\/style/i);
  });

  it("keeps the GT deck's imported CSS byte for byte through validateDeck", () => {
    for (const dir of [join(DECKS, 'gt-brand'), join(DECKS, 'templates', 'gt-brand')]) {
      const raw = loadDeckDir(dir);
      const withCss = raw.slides.filter((slide) => residualCss(slide) !== undefined);
      expect(withCss.length).toBeGreaterThan(10);
      const result = validateDeck(raw);
      expect(result.ok).toBe(true);
      for (const slide of withCss) {
        const css = residualCss(slide) ?? '';
        expect(isSafeStyleText(css)).toBe(true);
        const parsed = result.slides[slide.id];
        expect(parsed && residualCss(parsed)).toBe(css);
      }
    }
  });
});
