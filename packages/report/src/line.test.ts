import { describe, expect, test } from 'vitest';

import {
  REPORT_KEY_MAX,
  REPORT_LINE_MAX_BYTES,
  encodeReportLine,
  messageOf,
  readReportLine,
  reportKey,
  reportLine,
} from './line.ts';

// The line of hardening HR-O#2a (RELIABILITY-14): what the browser posts and the server logs.

const bytes = (text: string): number => new TextEncoder().encode(text).byteLength;

describe('reportLine', () => {
  test('a thrown Error becomes a scrubbed line with the head of its stack', () => {
    const error = new TypeError(
      'Cannot render "Revenue for Acme, Q3" for kevin@example.test (reading \'blocks\')',
    );
    error.stack = `${error.name}: ${error.message}\n    at SlideView (https://www.turboslide.com/assets/deck-B2.js:10:4)`;
    const line = reportLine({ kind: 'route', route: '/deck/q3-board-review', error });
    expect(line).toEqual({
      kind: 'route',
      route: '/deck/$',
      message: `TypeError: Cannot render "…" for <address> (reading 'blocks')`,
      stack: ['at SlideView (https://www.turboslide.com/assets/deck-B2.js:10:4)'],
    });
  });

  test('a rejection with a value that is not an Error', () => {
    expect(messageOf('the store refused')).toBe('the store refused');
    expect(messageOf({ message: 'plain object' })).toBe('plain object');
    expect(messageOf(42)).toBe('a value of type number was thrown');
    expect(messageOf(null)).toBe('a value of type null was thrown');
    expect(reportLine({ kind: 'rejection', route: '/decks', error: undefined }).message).toBe(
      'a value of type undefined was thrown',
    );
  });
});

describe('encodeReportLine', () => {
  test('a line never passes 4 KB: frames go from the end first', () => {
    const line = {
      kind: 'error' as const,
      route: '/edit/$deckId',
      message: 'm'.repeat(300),
      stack: Array.from({ length: 8 }, (_, i) => `at f${i} (${'p'.repeat(190)})`),
    };
    const small = encodeReportLine(line);
    expect(bytes(small)).toBeLessThanOrEqual(REPORT_LINE_MAX_BYTES);
    expect((JSON.parse(small) as { stack: string[] }).stack).toHaveLength(8);
    // multi byte text that would pass the cap: the stack shrinks until it fits
    const wide = { ...line, stack: line.stack.map((frame) => frame.replace(/p/g, '€')) };
    const fitted = encodeReportLine(wide);
    expect(bytes(fitted)).toBeLessThanOrEqual(REPORT_LINE_MAX_BYTES);
    expect((JSON.parse(fitted) as { stack: string[] }).stack.length).toBeLessThan(8);
  });
});

describe('readReportLine', () => {
  test('a well formed body reads back as the same line', () => {
    const line = reportLine({ kind: 'error', route: '/decks', error: new Error('boom') });
    expect(readReportLine(encodeReportLine(line))).toEqual(line);
  });

  test('anything that is not a line is refused', () => {
    expect(readReportLine('not json')).toBeNull();
    expect(readReportLine('[]')).toBeNull();
    expect(readReportLine(JSON.stringify({ kind: 'panic', route: '/', message: 'x' }))).toBeNull();
    expect(readReportLine(JSON.stringify({ kind: 'error', route: 1, message: 'x' }))).toBeNull();
    expect(
      readReportLine(JSON.stringify({ kind: 'error', route: '/', message: 'x', stack: [1] })),
    ).toBeNull();
    expect(
      readReportLine(
        JSON.stringify({ kind: 'error', route: '/', message: 'x'.repeat(REPORT_LINE_MAX_BYTES) }),
      ),
    ).toBeNull();
  });

  test('a sender that skipped the scrubber is scrubbed by the server', () => {
    const read = readReportLine(
      JSON.stringify({
        kind: 'error',
        route: '/deck/q3-board-review?r=grant0123456789abcdef',
        message:
          'Error: "Board deck: layoffs in March" Bearer abc.def.ghi from 198.51.100.7 ts.session=Zm9vYmFyYmF6cXV4MTIz',
        stack: [
          'at x (https://www.turboslide.com/api/download/dl_0123456789abcdefghij?sig=00ff00ff00ff00ff:1:2)',
          'not a frame: Board deck text',
        ],
      }),
    );
    expect(read).toEqual({
      kind: 'error',
      route: '/deck/$',
      message: 'Error: "…" Bearer <token> from <ip> ts.session=<value>',
      stack: ['at x (https://www.turboslide.com/api/download/$:1:2)'],
    });
  });
});

describe('reportKey', () => {
  test('the scrubbed message, spaces folded, capped', () => {
    expect(reportKey({ message: 'TypeError:   a\n b' })).toBe('TypeError: a b');
    expect(reportKey({ message: '' })).toBe('(empty)');
    expect(reportKey({ message: 'k'.repeat(200) })).toHaveLength(REPORT_KEY_MAX);
  });
});
