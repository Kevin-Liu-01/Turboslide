import { createFileRoute } from '@tanstack/react-router';

import { CONTRACTS_CACHE_CONTROL, llmsText } from '../server/contracts';

// GET /llms.txt: the generated index for agents (SPEC 7.1; MILESTONES M1 item 11), from the
// bundled file with the CDN rule of gslides-parity SPEC-4 3.11, and since polish two the docs'
// Documentation section listing every page's markdown twin (docs/POLISH-2.md 5.7), whose module
// the handler imports when it runs so the client's route tree carries none of the docs.
export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: async () => {
        const { llmsDocumentation } = await import('../docs/llms');
        return new Response(`${llmsText().trimEnd()}\n\n${llmsDocumentation()}`, {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': CONTRACTS_CACHE_CONTROL,
          },
        });
      },
    },
  },
});
