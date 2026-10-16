import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { TryPage } from '../try/TryPage';
import { validateEditSearch } from './-edit-search';
import type { EditSearch } from './-edit-search';

/**
 * The landing's live editor, /try (docs/SITE.md D1, C.5): the editor on a presentation that lives
 * in the tab, with Claude Code and Codex working in it, drawn inside /home's frame (the page
 * frames it from the same origin; server/headers.ts answers SAMEORIGIN here alone) or opened
 * alone. `ssr: false`: everything happens in the tab, so the server sends the document and no
 * data. `?still=1` holds the agents at their first pose for the poster's capture. Not indexed.
 */
type TrySearch = EditSearch & { frame?: 1; still?: 1 };

export const Route = createFileRoute('/try')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): TrySearch => ({
    ...validateEditSearch(search),
    ...(search.frame === 1 || search.frame === '1' ? { frame: 1 as const } : {}),
    ...(search.still === 1 || search.still === '1' ? { still: 1 as const } : {}),
  }),
  head: () => ({ meta: [{ title: 'Turboslide editor' }] }),
  component: Try,
});

function Try() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const onSearch = (patch: Partial<EditSearch>) => {
    void navigate({
      search: (prev) => {
        const next: Record<string, unknown> = { ...prev, ...patch };
        for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
        return next;
      },
      hash: true,
      replace: true,
    });
  };
  return <TryPage search={search} still={search.still === 1} onSearch={onSearch} />;
}
