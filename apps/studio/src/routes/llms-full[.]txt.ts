import { createFileRoute } from '@tanstack/react-router';

import { CONTRACTS_CACHE_CONTROL, llmsFullText } from '../server/contracts';

// GET /llms-full.txt: the long generated guide, every action and every lint rule (SPEC 7.1;
// MILESTONES M4 item 1), from the bundled file with the CDN rule of gslides-parity SPEC-4 3.11.
// The file name escapes the dot ([.]) so the route path keeps it.
export const Route = createFileRoute('/llms-full.txt')({
  server: {
    handlers: {
      GET: async () =>
        new Response(llmsFullText(), {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': CONTRACTS_CACHE_CONTROL,
          },
        }),
    },
  },
});
