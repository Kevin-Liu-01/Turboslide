import { Link } from '@tanstack/react-router';
import type { ComponentType } from 'react';

import type { LinkComponent, LinkSlotProps } from '@turboslide/chrome/editor-shell';

/**
 * The router's `Link` as the chrome's `linkComponent` slot (gslides-parity SPEC-4 0.16, 1.10;
 * packages/chrome/src/editor-shell.ts LinkSlotProps): the title row's mark (TitleRow.tsx
 * TitleHomeLink) and the app bar lockup (AppBarBrand.tsx) render this instead of a plain anchor,
 * so a click is a same document transition with the loader preloaded on intent, the chrome stays
 * router free, and the `edit->decks` transition of SPEC-4 4.2 stops being a document load. The
 * slot's `to` is a plain string because the chrome knows no route tree; the typed `Link` takes
 * only the paths of `routeTree.gen.ts`, so the one cast below hands it the string, and a path the
 * tree does not know (B2's `/home` before its route lands) renders the router's Not found page
 * rather than failing the build. The slot passes the anchor attributes through (`data-control`,
 * the `aria-label`, the Tooltip primitive's handlers), as the seam says.
 */
const UntypedLink = Link as unknown as ComponentType<LinkSlotProps>;

export const RouterLinkSlot: LinkComponent = function RouterLinkSlot(props: LinkSlotProps) {
  return <UntypedLink {...props} />;
};
