import { createFileRoute } from '@tanstack/react-router';

import { clientAddress } from '../../server/headers';
import { logSecurityEvent } from '../../server/log';
import { memoryLimiter } from '../../server/ratelimit';

// POST /api/x/csp/report (gslides-parity SPEC-3 0.31, 8.8): the report endpoint of the
// `Content-Security-Policy-Report-Only` header (`report-uri`, the form every browser sends
// today; the Reporting API's `report-to` needs an endpoint group header this route can join
// later). Each report becomes one `csp.report` line of the security log with the violated
// directive, the blocked URI's host (never its path or query, which can carry a token), the
// document's path and the line number, so the two report weeks before enforcement (SPEC-3 8.8,
// 11.5 R8) read off the Drain. Bodies are capped at 16 KB and one address sends at most 60
// reports a minute (a browser in a loop must not fill the log). No cookie, no identity, no
// answer body: 204.

const BODY_LIMIT = 16 * 1024;
const REPORTS_PER_MINUTE = 60;
const limiter = memoryLimiter();

type CspReport = {
  'document-uri'?: string;
  'violated-directive'?: string;
  'effective-directive'?: string;
  'blocked-uri'?: string;
  'line-number'?: number;
  'source-file'?: string;
  disposition?: string;
};

function hostOf(value: string | undefined): string {
  if (value === undefined || value === '') return '';
  if (value === 'inline' || value === 'eval' || value === 'data' || value === 'blob') return value;
  try {
    return new URL(value).host;
  } catch {
    return value.split(/[/?#]/)[0]?.slice(0, 64) ?? '';
  }
}

function pathOf(value: string | undefined): string {
  if (value === undefined) return '';
  try {
    return new URL(value).pathname.slice(0, 200);
  } catch {
    return '';
  }
}

export const Route = createFileRoute('/api/x/csp/$')({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        if ((params._splat ?? '') !== 'report') return new Response(null, { status: 404 });
        const address = clientAddress(request) ?? 'unknown';
        const admitted = await limiter.limit(`csp:${address}`, REPORTS_PER_MINUTE, 60_000);
        if (!admitted.ok)
          return new Response(null, { status: 429, headers: { 'retry-after': '60' } });
        const length = Number(request.headers.get('content-length') ?? 0);
        if (length > BODY_LIMIT) return new Response(null, { status: 413 });
        const text = await request.text();
        if (text.length > BODY_LIMIT) return new Response(null, { status: 413 });
        let reports: CspReport[] = [];
        try {
          const parsed = JSON.parse(text) as unknown;
          if (Array.isArray(parsed)) {
            // the Reporting API form: [{ type: 'csp-violation', body: {...} }]
            reports = parsed
              .map((entry) => (entry as { body?: CspReport }).body)
              .filter((body): body is CspReport => typeof body === 'object' && body !== null);
          } else if (typeof parsed === 'object' && parsed !== null) {
            const report =
              (parsed as { 'csp-report'?: CspReport })['csp-report'] ?? (parsed as CspReport);
            reports = [report];
          }
        } catch {
          return new Response(null, { status: 400 });
        }
        for (const report of reports.slice(0, 10)) {
          logSecurityEvent({
            event: 'csp.report',
            ip: address === 'unknown' ? undefined : address,
            reason: (
              report['effective-directive'] ??
              report['violated-directive'] ??
              'unknown'
            ).slice(0, 64),
            action: pathOf(report['document-uri']),
            variantKey: hostOf(report['blocked-uri']),
            ...(typeof report['line-number'] === 'number' ? { seq: report['line-number'] } : {}),
          });
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
