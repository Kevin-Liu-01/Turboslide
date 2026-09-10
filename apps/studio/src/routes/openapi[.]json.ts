import { createFileRoute } from '@tanstack/react-router';

import { openApiDocument } from '../server/contracts';

// GET /openapi.json: the generated OpenAPI 3.1 document (SPEC 7.1; MILESTONES
// M1 item 11). The file name escapes the dot ([.]) so the route path keeps it.
export const Route = createFileRoute('/openapi.json')({
  server: {
    handlers: {
      GET: async () =>
        new Response(openApiDocument(), {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        }),
    },
  },
});
