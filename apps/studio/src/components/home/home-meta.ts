import { SITE } from '@turboslide/theme/brand/site';

/**
 * The head of /home (gslides-parity SPEC-4 1.6, 2.6): the title, the description the head tags
 * reuse and the path `og:url` names. A module of its own since the round four fixer round (SPEC-4
 * 3.12, VERIFICATION-4 finding 2): the route file's `head()` runs at module level, the route tree
 * imports every route file statically, and `copy.ts` holds every string of the page (about 30 KB
 * of source), so importing `HOME_META` from `copy.ts` put the whole page's copy in the entry
 * chunk of every route. `copy.ts` re-exports it so `HOME_COPY.meta` and the copy lints keep it.
 */
export const HOME_META = {
  title: 'Turboslide',
  description: SITE.description,
  path: '/home',
} as const;
