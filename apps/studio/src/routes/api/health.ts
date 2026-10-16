import { createFileRoute } from '@tanstack/react-router';

import { cachedHealth, publicHealth } from '../../server/health-check';
import { roomBearerMatches } from '../../server/room-bearer';

// GET /api/health (hardening HR-O#3, RELIABILITY-14): 200 when the store heads the canary deck's
// manifest and the accounts database answers, 503 when either fails (server/health-check.ts). The
// answer is `{ ok, commit }`; with the room bearer, which the realtime Worker's scheduled check
// sends every five minutes, it carries each check, the night's backup and the month's drill. One
// reading per instance per 30 s, whoever calls. Never cached by the CDN.
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const reading = await cachedHealth();
        const body = roomBearerMatches(request) ? reading : publicHealth(reading);
        return Response.json(body, {
          status: reading.ok ? 200 : 503,
          headers: { 'cache-control': 'no-store' },
        });
      },
    },
  },
});
