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
