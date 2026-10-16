// The browser half of the error reporter (hardening HR-O#2b, RELIABILITY-14; docs/hardening/
// HARDENING.md 4.8). Before it the client reported no error anywhere: no `window` error handler,
// no unhandled rejection handler, and the route error page drew its sentence and sent nothing.
// Now an uncaught error, an unhandled rejection and a route's caught error (the router's
// `defaultOnCatch`, router.tsx) each post one scrubbed line (`@turboslide/report/line`) to
// `POST /api/x/errors` (server/client-errors.ts), which logs it.
//
// The sampling on this side: one page sends at most REPORTS_PER_PAGE lines and never the same
// fault twice (the kind, the route and the scrubbed message), so a render loop sends one line.
// Two kinds of noise are left out: a cross origin script's "Script error." (no message, no
// stack: nothing to act on) and an AbortError (a fetch the page cancelled on purpose). The
// reporter never throws: a failure to report is swallowed, so a report cannot raise the error it
// reports. Importing this module touches no browser global; `installErrorReporter` does, once.
import { encodeReportLine, reportKey, reportLine } from '@turboslide/report/line';
import type { ReportKind } from '@turboslide/report/line';

/** The route the lines are posted to. */
export const REPORT_PATH = '/api/x/errors';
/** The most lines one page sends. */
export const REPORTS_PER_PAGE = 10;

/** Posts one encoded line; the default is a `keepalive` fetch, so a line survives a navigation. */
export type ReportSender = (body: string) => void;

export type ErrorReporter = {
  /** Sends a line for one thrown value; false when it was a repeat, noise or past the cap. */
  report: (kind: ReportKind, error: unknown) => boolean;
  /** Adds the `error` and `unhandledrejection` listeners to the target; returns their removal. */
  install: (target: EventTarget) => () => void;
};

function sendByFetch(body: string): void {
  void fetch(REPORT_PATH, {
    method: 'POST',
    body,
    keepalive: true,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
  }).catch(() => undefined);
}

/** True for a value no one can act on, or one the page made on purpose. */
function isNoise(error: unknown, message: string | undefined): boolean {
  if (error === undefined || error === null) return message === 'Script error.' || !message;
  return (
    typeof error === 'object' &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

/**
 * A reporter with its own page state: the faults it sent and how many. `route` names the route
 * the line belongs to (the router's matched route id, else the path); `send` posts the body.
 */
export function createErrorReporter(options: {
  route: () => string;
  send?: ReportSender;
}): ErrorReporter {
  const send = options.send ?? sendByFetch;
  const sent = new Set<string>();
  const report = (kind: ReportKind, error: unknown, message?: string): boolean => {
    try {
      if (isNoise(error, message)) return false;
      if (sent.size >= REPORTS_PER_PAGE) return false;
      const line = reportLine({ kind, route: options.route(), error: error ?? message });
      const key = `${line.kind} ${line.route} ${reportKey(line)}`;
      if (sent.has(key)) return false;
      sent.add(key);
      send(encodeReportLine(line));
      return true;
    } catch {
      return false;
    }
  };
  return {
    report: (kind, error) => report(kind, error),
    install(target) {
      const onError = (event: Event): void => {
        const { error, message } = event as Event & { error?: unknown; message?: string };
        report('error', error, message);
      };
      const onRejection = (event: Event): void => {
        report('rejection', (event as Event & { reason?: unknown }).reason);
      };
      target.addEventListener('error', onError);
      target.addEventListener('unhandledrejection', onRejection);
      return () => {
        target.removeEventListener('error', onError);
        target.removeEventListener('unhandledrejection', onRejection);
      };
    },
  };
}

const INSTALLED = Symbol.for('turboslide.studio.errorReporter');

type ReporterHolder = { [INSTALLED]?: ErrorReporter };

/**
 * The page's reporter, listening on `window` from the first call on; later calls (the router is
 * built again on a hot update) keep the first. A no-op on the server.
 */
export function installErrorReporter(route: () => string): void {
  if (typeof window === 'undefined') return;
  const holder = window as unknown as ReporterHolder;
  if (holder[INSTALLED] !== undefined) return;
  const reporter = createErrorReporter({ route });
  reporter.install(window);
  holder[INSTALLED] = reporter;
}

/** The router's `defaultOnCatch`: a route's caught error, through the page's reporter. */
export function reportRouteError(error: unknown): void {
  if (typeof window === 'undefined') return;
  (window as unknown as ReporterHolder)[INSTALLED]?.report('route', error);
}
