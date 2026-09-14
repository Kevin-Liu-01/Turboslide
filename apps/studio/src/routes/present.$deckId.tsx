import { createFileRoute, notFound, redirect } from '@tanstack/react-router';

import { PresenterPage } from '../components/PresenterPage';
import { PresenterSkeleton } from '../components/PresenterSkeleton';
import { readEditorDeck } from '../server/write';
import { AccessPage } from './-access-page';

// Presenter view, /present/:deckId (gslides-parity SPEC 9.3; MILESTONES B6 item 3; docs/spec/SPEC.md
// 6.10): the second window of a show. The route loads the document itself (the editor's read, so
// the speaker notes and the skip flags are here, which the audience payload of /deck leaves out
// on purpose) and hands it to components/PresenterPage.tsx, which renders the unskipped slides
// once for the console's live frames and syncs with the slideshow window (gslides-parity SPEC-4
// 0.36, 0.44; PP 3.7: the page and `renderSlide` live in the presenter's own chunk, read by the
// component alone, so the renderer leaves the entry every route loads). `?screen=1`, the address
// docs/spec/SPEC.md 6.10 gave the audience form, redirects to /deck/:id?present=1, which stays the
// shareable present link.
//
// `ssr: 'data-only'` (SPEC-4 0.34, 0.36): the loader runs on the server and its payload rides the
// document, the server renders the skeleton in the route's place (SPEC-3 9.2 P1) and the popup
// paints the console's grid at first byte, then the console over it without a `readEditorDeck`
// round trip. `pendingMinMs: 0` beside `pendingMs: 0` so the skeleton never outlives the console.
// `notFoundComponent` is the You need access page (VERIFICATION-3 finding 53; the round four
// ruling 3): the loader answers null for a missing and a restricted deck alike.

export type PresentSearch = { screen?: 1 };

export function validatePresentSearch(search: Record<string, unknown>): PresentSearch {
  const out: PresentSearch = {};
  if (search.screen === 1 || search.screen === '1' || search.screen === true) out.screen = 1;
  return out;
}

export const Route = createFileRoute('/present/$deckId')({
  ssr: 'data-only',
  validateSearch: validatePresentSearch,
  // first paint carries the console's grid while the loader answers (SPEC-3 9.2 P1)
  pendingComponent: PresenterSkeleton,
  pendingMs: 0,
  pendingMinMs: 0,
  beforeLoad: ({ params, search }) => {
    if (search.screen === 1) {
      throw redirect({
        to: '/deck/$deckId',
        params: { deckId: params.deckId },
        search: { present: 1 },
        replace: true,
      });
    }
  },
  loader: async ({ params }) => {
    const payload = await readEditorDeck({ deckId: params.deckId });
    if (!payload) throw notFound();
    return payload;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.document.deck.title}, Presenter view, Turboslide`
          : 'Presenter view, Turboslide',
      },
      // a presenter window is never indexed (SPEC 7.9 item 5 lists the route as new)
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: PresentPage,
  notFoundComponent: PresentMissing,
});

function PresentPage() {
  const payload = Route.useLoaderData();
  return <PresenterPage payload={payload} />;
}

function PresentMissing() {
  const { deckId } = Route.useParams();
  return <AccessPage deckId={deckId} />;
}
