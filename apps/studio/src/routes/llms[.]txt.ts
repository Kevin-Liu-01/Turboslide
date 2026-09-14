import { createFileRoute } from '@tanstack/react-router';

import { CONTRACTS_CACHE_CONTROL, llmsText } from '../server/contracts';

// GET /llms.txt: the generated index for agents (SPEC 7.1; MILESTONES M1 item 11), from the
// bundled file with the CDN rule of gslides-parity SPEC-4 3.11.
export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: async () =>
        new Response(llmsText(), {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': CONTRACTS_CACHE_CONTROL,
          },
        }),
    },
  },
});
