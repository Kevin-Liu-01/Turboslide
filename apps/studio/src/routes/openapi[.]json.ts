import { createFileRoute } from '@tanstack/react-router';

import { CONTRACTS_CACHE_CONTROL, openApiDocument } from '../server/contracts';

// GET /openapi.json: the generated OpenAPI 3.1 document (SPEC 7.1; MILESTONES M1 item 11), from
// the bundled file with the CDN rule of gslides-parity SPEC-4 3.11. The file name escapes the
// dot ([.]) so the route path keeps it.
export const Route = createFileRoute('/openapi.json')({
  server: {
    handlers: {
      GET: async () =>
        new Response(openApiDocument(), {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': CONTRACTS_CACHE_CONTROL,
          },
        }),
    },
  },
});
