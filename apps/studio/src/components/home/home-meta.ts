import { SITE } from '@turboslide/theme/brand/site';

/**
 * The head of /home (docs/POLISH.md 3.6): the title carries the value, the description is the
 * hero's lead (`SITE.description`, the one sentence the head, the manifest, the card and the
 * README share), and the path `og:url` names. A module of its own since the round four fixer
 * round (SPEC-4 3.12, VERIFICATION-4 finding 2): the route file's `head()` runs at module level
 * and the route tree imports every route file statically, so importing the page's copy from the
 * route's head would put every string of the page in the entry chunk of every route. `copy.ts`
 * re-exports it so the copy lints read it.
 */
export const HOME_META = {
  title: 'Turboslide, a slides editor in the browser',
  description: SITE.description,
  path: '/home',
} as const;
