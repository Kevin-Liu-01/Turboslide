import { createFileRoute } from '@tanstack/react-router';

import { SITE } from '@turboslide/theme/brand/site';

import { CONTRACTS_CACHE_CONTROL } from '../server/contracts';

/** The site's indexable pages in the sitemap's XML, at absolute addresses. */
function sitemapXml(origin: string, paths: readonly string[]): string {
  const urls = paths.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * /sitemap.xml (docs/POLISH-2.md 5.2): the product page and every docs page at the public origin.
 * The other routes carry a person's presentations or the editor and stay out. Prerendered at build;
 * robots.txt names it. The handler imports the docs' content when it runs.
 */
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const { pagesInOrder } = await import('../docs/source');
        const paths = ['/home', ...pagesInOrder().map((page) => page.url)];
        return new Response(sitemapXml(SITE.origin(), paths), {
          headers: {
            'content-type': 'application/xml; charset=utf-8',
            'cache-control': CONTRACTS_CACHE_CONTROL,
          },
        });
      },
    },
  },
});
