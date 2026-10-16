import { describe, expect, test } from 'vitest';

import {
  FRAME_MAX,
  MESSAGE_MAX,
  STACK_FRAMES_MAX,
  scrubPath,
  scrubMessage,
  scrubRoute,
  scrubStack,
  scrubText,
  scrubUrl,
} from './scrub.ts';

// The scrubber of hardening HR-O#2a (RELIABILITY-14): no deck text, no address, no token and no
// cookie in a report. Every value below is a test value.

describe('scrubText', () => {
  test('a quoted run of deck text loses its words; a code name stays', () => {
    const out = scrubText(
      `SyntaxError: Unexpected token 'Q', "Q3 plan for the Acme board"... is not valid JSON`,
    );
    expect(out).toBe(`SyntaxError: Unexpected token 'Q', "…"... is not valid JSON`);
    expect(out).not.toContain('Acme');
    expect(scrubText(`TypeError: Cannot read properties of undefined (reading 'length')`)).toBe(
      `TypeError: Cannot read properties of undefined (reading 'length')`,
    );
    expect(scrubText('Failed to resolve “The board’s secret slide”')).toBe('Failed to resolve “…”');
    expect(scrubText('Unknown block `chart.bar`')).toBe('Unknown block `chart.bar`');
    // a one word title is deck text; a class name keeps its inner capital (read on 4868)
    expect(scrubText('TypeError: cannot draw "Board" in "DeckRoom"')).toBe(
      'TypeError: cannot draw "…" in "DeckRoom"',
    );
  });

  test('mail and network addresses go', () => {
    const out = scrubText(
      'no account for kevin.test+alias@example.test from 203.0.113.9 and 2001:db8:85a3:0:0:8a2e:370:7334 or fe80::1ff:fe23',
    );
    expect(out).toBe('no account for <address> from <ip> and <ip> or <ip>');
    // a CSS pseudo element and a lone `::` are not addresses
    expect(scrubText('the ::before rule and ::')).toBe('the ::before rule and ::');
  });

  test('a URL keeps its host and route, never its query, fragment or ids', () => {
    expect(
      scrubText(
        'fetch https://www.turboslide.com/api/download/dl_9f8e7d6c5b4a39281706?sig=abcdef0123456789#x failed',
      ),
    ).toBe('fetch https://www.turboslide.com/api/download/$ failed');
    expect(
      scrubText('GET https://www.turboslide.com/deck/q3-board-review/edit?r=grant123456789'),
    ).toBe('GET https://www.turboslide.com/deck/$/edit');
    expect(
      scrubText(
        'magic link http://localhost:4868/api/auth/magic-link/verify?token=zzzzzzzzzzzzzzzz',
      ),
    ).toBe('magic link http://localhost:4868/api/auth/magic-link/verify');
    expect(scrubText('img data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE= broke')).toBe(
      'img data:… broke',
    );
  });

  test('tokens, cookie pairs and signed values go', () => {
    expect(scrubText('Authorization: Bearer ts_live_0123456789abcdefghij failed')).toBe(
      'Authorization: Bearer <token> failed',
    );
    expect(
      scrubText(
        'cookie ts.session=Zm9vYmFyYmF6cXV4MTIzNDU2; anon=anon_1b4e28ba-2fa1-11d2-883f-0016d3cca427',
      ),
    ).toBe('cookie ts.session=<value>; anon=<value>');
    expect(
      scrubText(
        'jwt eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlLXZhbHVlLTEyMw rejected',
      ),
    ).toBe('jwt <id>.<id>.<id> rejected');
    expect(
      scrubText('deck 3a7bd3e2360a3d29eea436fcfb7e44c735d117c4 at revision 1728734400123'),
    ).toBe('deck <id> at revision <n>');
  });

  test('a long text is capped; control characters go', () => {
    const out = scrubText(`Error: ${'x '.repeat(400)}`);
    expect(out.length).toBe(MESSAGE_MAX);
    expect(out.endsWith('…')).toBe(true);
    expect(scrubText('a\u0000b\u001bc')).toBe('a b c');
  });
});

describe('paths and routes', () => {
  test('id segments are written $; a built chunk keeps its name', () => {
    expect(scrubPath('/deck/q3-board-review/edit')).toBe('/deck/$/edit');
    expect(scrubPath('/api/decks/gt-brand/stream')).toBe('/api/decks/$/stream');
    expect(scrubPath('/s/Q2xpY2tIZXJlVG9rZW4')).toBe('/s/$');
    expect(scrubPath('/docs/reference/block')).toBe('/docs/reference/block');
    expect(scrubPath('/assets/index-DkF3x9aB.js')).toBe('/assets/index-DkF3x9aB.js');
    expect(scrubPath('/assets/figure.png')).toBe('/assets/$');
    expect(scrubPath('/x/01hzx3k9q2m7w8v6t5r4p3n2b1')).toBe('/x/$');
  });

  test('a URL loses its query; a frame tail stays', () => {
    expect(scrubUrl('https://www.turboslide.com/assets/editor-Bq9.js:12:345')).toBe(
      'https://www.turboslide.com/assets/editor-Bq9.js:12:345',
    );
    expect(scrubUrl('not a url')).toBe('<url>');
    expect(scrubUrl('blob:https://www.turboslide.com/1b4e28ba-2fa1-11d2-883f')).toBe('blob:…');
  });

  test('a route id stays; a path is scrubbed; anything else is /', () => {
    expect(scrubRoute('/deck/$deckId')).toBe('/deck/$deckId');
    expect(scrubRoute('/edit/q3-board-review?slide=4#x')).toBe('/edit/$');
    expect(scrubRoute('javascript:alert(1)')).toBe('/');
    expect(scrubRoute(undefined)).toBe('/');
    expect(scrubRoute(`/${'a'.repeat(200)}`).length).toBeLessThanOrEqual(80);
  });
});

describe('scrubStack', () => {
  test('the head of a V8 stack, scrubbed, without the message line', () => {
    const stack = [
      'TypeError: Cannot read properties of undefined (reading "title of Acme")',
      ...Array.from(
        { length: 12 },
        (_, i) =>
          `    at Slide${i} (https://www.turboslide.com/assets/editor-Bq9x.js?v=abcdef0123456789:${i + 1}:20)`,
      ),
    ].join('\n');
    const frames = scrubStack(stack);
    expect(frames).toHaveLength(STACK_FRAMES_MAX);
    expect(frames[0]).toBe('at Slide0 (https://www.turboslide.com/assets/editor-Bq9x.js:1:20)');
    expect(frames.join('\n')).not.toContain('Acme');
  });

  test('the name@url form of the other engines; a frame is capped', () => {
    const frames = scrubStack(
      /* a long name of short parts: a run of 300 letters would read as a token (digitFreeToken) */
      `render@https://www.turboslide.com/assets/deck-C1.js:4:9\n${'ab.'.repeat(100)}@https://a.test/b.js:1:1`,
    );
    expect(frames[0]).toBe('render@https://www.turboslide.com/assets/deck-C1.js:4:9');
    expect(frames[1]!.length).toBe(FRAME_MAX);
    expect(scrubStack(undefined)).toEqual([]);
  });
});

// post-deploy review of b01cb984: one crafted report reached the production log with the deck's
// words outside quotes and a share token in a bare path; locally "Jane Doe left the deck" and a
// digit-free id passed too.
describe('scrubMessage', () => {
  test('the crafted report of the review loses its names, its address, its token and its path', () => {
    const out = scrubMessage(
      'Error: lay out Q7Z Secret Merger for jane@example.test from 203.0.113.9 with Bearer AbCdEf0123456789 at /s/AbCdEfGhIjKlMnOpQrStUv',
    );
    expect(out).toBe('Error: lay out Q7Z … … for <address> from <ip> with Bearer <token> at /s/$');
    expect(scrubMessage('Jane Doe left the deck')).toBe('Jane … left the deck');
    expect(scrubMessage('could not open the deck abcdefghijklmnopqrstuvwxyz')).toBe(
      'could not open the deck <id>',
    );
    expect(scrubMessage('lost /deck/q3-board-review/edit while saving')).toBe(
      'lost /deck/$/edit while saving',
    );
  });

  test("the engines' own messages stay readable", () => {
    for (const message of [
      `TypeError: Cannot read properties of undefined (reading 'getBoundingClientRect')`,
      'ResizeObserver loop completed with undelivered notifications.',
      'Failed to construct XMLHttpRequestEventTarget: Illegal constructor',
      'TypeError: undefined is not a Promise or an Object.keys result',
      'SyntaxError: Unexpected end of JSON input',
      'the ::before rule and ::',
      'NetworkError when attempting to fetch resource.',
    ])
      expect(scrubMessage(message)).toBe(message);
  });
});

describe('a token with no digit and a bare path', () => {
  test('a digit-free token goes; a long camelCase name stays', () => {
    expect(scrubText('link AbCdEfGhIjKlMnOpQrStUv revoked')).toBe('link <id> revoked');
    expect(scrubText('at HTMLDocument.getBoundingClientRect')).toBe(
      'at HTMLDocument.getBoundingClientRect',
    );
    expect(scrubPath('/x/abcdefghijklmnopqrstuvwxyz')).toBe('/x/$');
    expect(scrubText('GET /api/decks/gt-brand/bundle 401')).toBe('GET /api/decks/$/bundle 401');
  });
});
