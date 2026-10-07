import { createFileRoute } from '@tanstack/react-router';

import { CONTRACTS_CACHE_CONTROL } from '../server/contracts';

/**
 * Every written docs page as markdown, /docs/llms-full.txt (docs/POLISH-2.md 5.7): the guides in
 * the sidebar's order, each its twin, for an agent that reads the docs whole. The generated action
 * reference stays in its own twins and in /llms-full.txt. Prerendered at build; the handler
 * imports the docs' content when it runs.
 */
export const Route = createFileRoute('/docs/llms-full.txt')({
  server: {
    handlers: {
      GET: async () => {
        const { llmsFull } = await import('../docs/llms');
        return new Response(await llmsFull(), {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': CONTRACTS_CACHE_CONTROL,
          },
        });
      },
    },
  },
});
