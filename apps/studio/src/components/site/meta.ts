import { SITE } from '@turboslide/theme/brand/site';

/**
 * The head of /home (docs/SITE.md): the title states what the product is, and the description is
 * the page's lead, the one sentence that says what an agent does with it. A module of its own,
 * because a route file's `head()` runs at module level and the route tree imports every route
 * file, so the head's words must not pull the page's copy into every route's entry chunk.
 */
export const HOME_LEAD =
  'Turboslide is a slides editor in the browser. Every command in its menus is also an action that an agent runs over the command line, MCP or HTTP.';

export const HOME_META = {
  title: 'Turboslide is a slides editor in the browser',
  description: HOME_LEAD,
  path: '/home',
} as const;

/** The heads of /features, /faq and /about (the pages step), in the same light module. */
export const FEATURES_META = {
  title: 'Turboslide features',
  description:
    'What Turboslide does today: make, present, share and download presentations, run every command from an agent, and run the studio yourself.',
  path: '/features',
} as const;

export const FAQ_META = {
  title: 'Turboslide questions and answers',
  description:
    'Answers about accounts, where presentations are stored, who can see them, downloads, working offline, agents, limits, backups and running Turboslide yourself.',
  path: '/faq',
} as const;

export const ABOUT_META = {
  title: 'About Turboslide',
  description:
    'Turboslide is an open source slides editor in the browser, made by General Translation. Every command in its menus is also an action that an agent runs.',
  path: '/about',
} as const;

export type PageMeta = { title: string; description: string; path: string };

/**
 * The head of a site page: its title and description, the Open Graph lines, the canonical address
 * at the public origin, and the site stylesheet linked by URL (routes/-home-css.test.ts).
 */
export function siteHead(page: PageMeta, stylesheet: string) {
  const url = `${SITE.origin()}${page.path}`;
  return {
    meta: [
      { title: page.title },
      { name: 'description', content: page.description },
      { property: 'og:title', content: page.title },
      { property: 'og:description', content: page.description },
      { property: 'og:url', content: url },
    ],
    links: [
      { rel: 'canonical', href: url },
      { rel: 'stylesheet', href: stylesheet },
    ],
  };
}
