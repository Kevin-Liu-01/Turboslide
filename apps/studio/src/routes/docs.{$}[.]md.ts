import { createFileRoute } from '@tanstack/react-router';

import { SITE } from '@turboslide/theme/brand/site';

import { slugsOfTwin } from '../docs/paths';
import { CONTRACTS_CACHE_CONTROL } from '../server/contracts';

/**
 * A docs page's markdown twin, /docs/<path>.md and /docs/index.md for /docs (docs/POLISH-2.md 5.7,
 * C27): the page's title, its description and its body with every component in its markdown
 * form, as text/markdown with a canonical Link header naming the page. Prerendered at build with
 * the pages (vite.deploy.config.ts), so a reader's request is a file; the route rules there carry
 * the same two headers to the static copy.
 */
export const Route = createFileRoute('/docs/{$}.md')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { source } = await import('../docs/source');
        const { pageMarkdown } = await import('../docs/llms');
        const splat = params._splat ?? '';
        const slugs = slugsOfTwin(splat.endsWith('.md') ? splat : `${splat}.md`);
        const page = slugs === null ? undefined : source.getPage(slugs);
        if (page === undefined)
          return new Response('No documentation page is at this address.\n', {
            status: 404,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          });
        return new Response(await pageMarkdown(page), {
          headers: {
            'content-type': 'text/markdown; charset=utf-8',
            link: `<${SITE.origin()}${page.url}>; rel="canonical"`,
            'cache-control': CONTRACTS_CACHE_CONTROL,
          },
        });
      },
    },
  },
});
