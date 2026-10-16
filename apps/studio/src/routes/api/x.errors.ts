import { createFileRoute } from '@tanstack/react-router';

import { acceptClientError } from '../../server/client-errors';

// POST /api/x/errors (hardening HR-O#2a, RELIABILITY-14): the browser's scrubbed error report,
// capped at 4 KB, rate limited per address and sampled past a budget per instance, logged as one
// line (server/client-errors.ts). No cookie is read and no answer body is sent: 204.
export const Route = createFileRoute('/api/x/errors')({
  server: {
    handlers: {
      POST: async ({ request }) => (await acceptClientError(request)).response,
    },
  },
});
