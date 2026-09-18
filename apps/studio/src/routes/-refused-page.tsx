import type { ReactNode } from 'react';

import { Link, useMatch, useRouter } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';

import { EmptyFigure } from '@turboslide/chrome/EmptyFigure';
import { tipProps } from '@turboslide/chrome/Tooltip';

import { refusalSentence } from '../editor/refusal';

/**
 * The product's error page (the focus round, cycle 3 fix round; VERIFICATION.md C3-F3). Before
 * it, a route without an `errorComponent` fell through to the router's global catch boundary and
 * its built in page, the words "Something went wrong!" and a "Show Error" button on bare paper:
 * the text walk of cycle 3 pass 1 met it when the store's rate limit sentence reached the /edit
 * route through a server function and the editor vanished under it for 22 rows. This page is the
 * Not found page's structure (__root.tsx NotFound; SPEC-4 1.10; the same `.ts-notfound` rules of
 * brand.css): the 64 px mark over the notfound twin's crop, a heading, one sentence and two
 * `.pt-ib` buttons, Reload solid and Your Presentations plain, inside the document shell with
 * its theme, tokens and face. Reload is `router.invalidate()`: the loaders run again, the match
 * objects change and the route's catch boundary resets on them, so the route's component draws
 * in place without a document reload. The heading names what the reader lost: a match whose
 * loader refused (`status === 'error'`) could not be opened, a component that threw while it
 * stood has stopped. The sentence is `refusalSentence`'s (editor/refusal.ts), the product's words
 * for a store error. A dash prefixed file under routes/ is not a route (the convention of
 * -edit-search.ts).
 */
export const REFUSED_PAGE = {
  editorStopped: 'The editor stopped',
  notOpened: 'This presentation could not be opened',
  pageNotShown: 'This page could not be shown',
  reload: 'Reload',
  reloadDoc: 'Reads the page again and draws it in place.',
  decks: 'Your Presentations',
  decksDoc: 'Every presentation on this Turboslide.',
} as const;

/**
 * The page's fixed part: the figure, the heading, the sentence and the Reload button, with the
 * caller's other actions after it. It reads no router, so a test renders it alone.
 */
export function RefusedPage({
  heading,
  sentence,
  onReload,
  children,
}: {
  heading: string;
  sentence: string;
  onReload: () => void;
  children?: ReactNode;
}) {
  return (
    <main className="ts-notfound ts-refused" data-control="refused">
      <EmptyFigure
        figure="notfound"
        heading="h1"
        mark={64}
        title={heading}
        sentence={sentence}
        action={
          <div className="ts-notfound-actions">
            <button
              type="button"
              className="pt-ib is-solid"
              data-control="refused.reload"
              onClick={onReload}
              {...tipProps({ name: REFUSED_PAGE.reload, doc: REFUSED_PAGE.reloadDoc })}
            >
              {REFUSED_PAGE.reload}
            </button>
            {children}
          </div>
        }
      />
    </main>
  );
}

/**
 * The error component of a route: the page over the router, with the heading chosen by how the
 * error arrived (the module comment) and the Your Presentations link beside Reload.
 */
export function RouteRefused({
  error,
  loaderHeading,
  renderHeading,
}: {
  error: unknown;
  /** the heading when the route's loader refused and nothing of the route was drawn */
  loaderHeading: string;
  /** the heading when the route's component threw while it stood */
  renderHeading: string;
}) {
  const router = useRouter();
  const status = useMatch({ strict: false, select: (match) => match.status });
  const onReload = (): void => {
    void router.invalidate();
  };
  return (
    <RefusedPage
      heading={status === 'error' ? loaderHeading : renderHeading}
      sentence={refusalSentence(error)}
      onReload={onReload}
    >
      <Link
        to="/decks"
        className="pt-ib"
        data-control="refused.decks"
        {...tipProps({ name: REFUSED_PAGE.decks, doc: REFUSED_PAGE.decksDoc })}
      >
        {REFUSED_PAGE.decks}
      </Link>
    </RefusedPage>
  );
}

/** The router's `defaultErrorComponent` (router.tsx): every route without a page of its own. */
export function PageRefused({ error }: ErrorComponentProps) {
  return (
    <RouteRefused
      error={error}
      loaderHeading={REFUSED_PAGE.pageNotShown}
      renderHeading={REFUSED_PAGE.pageNotShown}
    />
  );
}
