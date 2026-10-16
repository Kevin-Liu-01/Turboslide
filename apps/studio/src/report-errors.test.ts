import { describe, expect, test } from 'vitest';

import { REPORT_LINE_MAX_BYTES } from '@turboslide/report/line';

import { REPORTS_PER_PAGE, createErrorReporter } from './report-errors';

// The browser half of hardening HR-O#2b (RELIABILITY-14): the window's error and unhandled
// rejection events and a route's caught error each post one scrubbed line, once per fault, at
// most ten per page. The window is an EventTarget here; every value is a test value.

function errorEvent(fields: { error?: unknown; message?: string }): Event {
  return Object.assign(new Event('error'), fields);
}

function rejectionEvent(reason: unknown): Event {
  return Object.assign(new Event('unhandledrejection'), { reason });
}

function rig(route = '/edit/$deckId') {
  const bodies: string[] = [];
  const reporter = createErrorReporter({ route: () => route, send: (body) => bodies.push(body) });
  const target = new EventTarget();
  const remove = reporter.install(target);
  const lines = () => bodies.map((body) => JSON.parse(body) as Record<string, unknown>);
  return { reporter, target, remove, bodies, lines };
}

describe('the browser reporter', () => {
  test('an uncaught error posts one scrubbed line under the route', () => {
    const { target, lines, bodies } = rig();
    const error = new TypeError('Cannot read "Acme board plan" of undefined');
    error.stack = `${error.name}: ${error.message}\n    at Stage (https://www.turboslide.com/assets/edit-D4.js?t=0123456789abcdef:2:9)`;
    target.dispatchEvent(errorEvent({ error, message: `Uncaught ${error.message}` }));
    expect(lines()).toEqual([
      {
        kind: 'error',
        route: '/edit/$deckId',
        message: 'TypeError: Cannot read "…" of undefined',
        stack: ['at Stage (https://www.turboslide.com/assets/edit-D4.js:2:9)'],
      },
    ]);
    expect(new TextEncoder().encode(bodies[0]).byteLength).toBeLessThanOrEqual(
      REPORT_LINE_MAX_BYTES,
    );
  });

  test('the same fault is sent once; an unhandled rejection and a route error are their own kinds', () => {
    const { reporter, target, lines } = rig('/deck/$deckId');
    for (let i = 0; i < 5; i += 1) target.dispatchEvent(errorEvent({ error: new Error('loop') }));
    target.dispatchEvent(rejectionEvent('the store refused'));
    expect(reporter.report('route', new Error('loop'))).toBe(true);
    expect(reporter.report('route', new Error('loop'))).toBe(false);
    expect(lines().map((line) => [line['kind'], line['message']])).toEqual([
      ['error', 'Error: loop'],
      ['rejection', 'the store refused'],
      ['route', 'Error: loop'],
    ]);
  });

  test('a cross origin script error and an aborted fetch are left out; an event without an error object is not', () => {
    const { target, lines } = rig();
    target.dispatchEvent(errorEvent({ message: 'Script error.' }));
    target.dispatchEvent(errorEvent({}));
    target.dispatchEvent(
      rejectionEvent(new DOMException('The user aborted a request.', 'AbortError')),
    );
    target.dispatchEvent(rejectionEvent(undefined));
    expect(lines()).toEqual([]);
    target.dispatchEvent(errorEvent({ message: 'Uncaught ReferenceError: chartz is not defined' }));
    expect(lines().map((line) => line['message'])).toEqual([
      'Uncaught ReferenceError: chartz is not defined',
    ]);
  });

  test('a page sends at most ten lines', () => {
    const { target, bodies } = rig();
    for (let i = 0; i < REPORTS_PER_PAGE + 5; i += 1)
      target.dispatchEvent(errorEvent({ error: new Error(`fault number ${i}`) }));
    expect(bodies).toHaveLength(REPORTS_PER_PAGE);
  });

  test('a sender that throws is swallowed; removed listeners send nothing', () => {
    const reporter = createErrorReporter({
      route: () => '/',
      send: () => {
        throw new Error('offline');
      },
    });
    expect(reporter.report('error', new Error('x'))).toBe(false);
    const { target, remove, bodies } = rig();
    remove();
    target.dispatchEvent(errorEvent({ error: new Error('after removal') }));
    expect(bodies).toEqual([]);
  });
});
