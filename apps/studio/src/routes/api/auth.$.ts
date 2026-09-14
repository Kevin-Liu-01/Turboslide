import { createFileRoute } from '@tanstack/react-router';
import { jsonResponse } from '@turboslide/agent/http/errors';

import { NO_DATABASE_NOTICE } from '../../server/auth/db';
import { identityRuntime } from '../../server/auth/identity';

// /api/auth/$ (gslides-parity SPEC-3 7.3, 11.3): better-auth's handler, mounted on the catch
// all the official TanStack Start integration names (server/auth/better-auth.ts builds the
// instance with the magic link, the email OTP, the device authorization flow and the cookie
// plugin). Without a database (no DATABASE_URL, no TURBOSLIDE_AUTH_DB) the studio runs anonymous
// only, the Sign in row is absent, and every request here answers 404 with the sentence so a
// client that guessed the path learns nothing else. The library sets and reads its own cookies
// (`ts.session_token` and its companions) and runs its own CSRF and rate limit checks; the
// identity cookie of the anonymous principal is the middleware's and is not touched here.

async function serve(request: Request): Promise<Response> {
  const runtime = identityRuntime();
  if (runtime.auth === null)
    return jsonResponse(
      { error: { name: 'RangeError', status: 404, message: NO_DATABASE_NOTICE } },
      404,
    );
  await runtime.ready;
  return runtime.auth.handler(request);
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => serve(request),
      POST: ({ request }) => serve(request),
    },
  },
});
