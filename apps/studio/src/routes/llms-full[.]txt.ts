import { createFileRoute } from '@tanstack/react-router';

import { llmsFullText } from '../server/contracts';

// GET /llms-full.txt: the long generated guide, every action and every lint rule (SPEC 7.1;
// MILESTONES M4 item 1). The file name escapes the dot ([.]) so the route path keeps it.
export const Route = createFileRoute('/llms-full.txt')({
  server: {
    handlers: {
      GET: async () =>
        new Response(llmsFullText(), {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        }),
    },
  },
});
