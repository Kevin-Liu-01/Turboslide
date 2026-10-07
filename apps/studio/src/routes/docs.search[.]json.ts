import { createFileRoute } from '@tanstack/react-router';

import { CONTRACTS_CACHE_CONTROL } from '../server/contracts';

/**
 * The docs' search index, /docs/search.json (docs/POLISH-2.md 5.5, C26): one row per heading
 * section of every page, prerendered at build and fetched by the search window on its first open.
 * The handler imports the docs' content when it runs, so the route file the client's route tree
 * holds names none of it.
 */
export const Route = createFileRoute('/docs/search.json')({
  server: {
    handlers: {
      GET: async () => {
        const { searchIndex } = await import('../docs/search-index');
        return new Response(JSON.stringify(await searchIndex()), {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': CONTRACTS_CACHE_CONTROL,
          },
        });
      },
    },
  },
});
