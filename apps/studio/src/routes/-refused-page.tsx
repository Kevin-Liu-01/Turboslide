import type { ReactNode } from 'react';

import { Link, useMatch, useParams, useRouter } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';

import type { LinkComponent } from '@turboslide/chrome/editor-shell';
import { tipProps } from '@turboslide/chrome/Tooltip';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { PageFrame } from '../components/home/PageFrame';
import { refusalSentence } from '../editor/refusal';
import { RouterLinkSlot } from './-link-slot';

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
 *
 * Round 1 (docs/NEXT.md 4.1.3 item 11): the page stands in the page frame (PageFrame.tsx: the
 * 1104 px column, its rails and the 58 px bar with the lockup), its heading and sentence at the
 * ladder's sizes, its two buttons Title Case (DECK-GRAMMAR 22); the dithered figure and its mark
 * left, so the lockup is the page's one mark.
 *
 * The Round 1 follow-up (lane C item 3): an address whose deck id is not a slug (/edit/Not_A_Slug)
 * drew the store's words, "deckId must be a slug.", under "This presentation could not be opened".
 * Such an address names no presentation, so the page says that in the product's words, drops
 * Reload (the same address refuses the same way) and makes Your Presentations its one action.
 */
export const REFUSED_PAGE = {
  editorStopped: 'The editor stopped',
  notOpened: 'This presentation could not be opened',
  pageNotShown: 'This page could not be shown',
  notAnAddress: 'This address is not a presentation',
  addressSentence:
    'A presentation’s address ends in lower case letters, digits and hyphens. Open the presentation from Your Presentations.',
  reload: 'Reload',
  reloadDoc: 'Reads the page again and draws it in place.',
  decks: 'Your Presentations',
  decksDoc: 'Your presentations and the ones shared with you.',
} as const;

/**
 * True when the refusal is the address itself: the route's deck id is not a slug, or the server
 * answered the store's sentence for one ("deckId must be a slug"). Such an address names no
 * presentation, and reading it again refuses the same way.
 */
export function isAddressRefusal(error: unknown, deckId: unknown): boolean {
  if (typeof deckId === 'string' && !SLUG_PATTERN.test(deckId)) return true;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message)
        : '';
  return /\bmust be a slug\b/i.test(message);
}

/**
 * The page's fixed part: the frame with the lockup, the heading, the sentence and the Reload
 * button when a read again can help, with the caller's other actions after it. It reads no
 * router unless the caller hands it the router's link, so a test renders it alone.
 */
export function RefusedPage({
  heading,
  sentence,
  onReload,
  children,
  linkComponent,
}: {
  heading: string;
  sentence: string;
  /** Reload's handler; without it the page draws no Reload (an address that names no presentation) */
  onReload?: () => void;
  children?: ReactNode;
  /** the router's link for the lockup; plain anchors without it (a test renders the page alone) */
  linkComponent?: LinkComponent;
}) {
  return (
    <PageFrame
      className="ts-notfound ts-refused"
      control="refused"
      {...(linkComponent === undefined ? {} : { linkComponent })}
    >
      <h1 className="ts-page-title">{heading}</h1>
      <p className="ts-page-sentence">{sentence}</p>
      <div className="ts-page-actions ts-notfound-actions">
        {onReload === undefined ? null : (
          <button
            type="button"
            className="pt-ib is-solid"
            data-control="refused.reload"
            onClick={onReload}
            {...tipProps({ name: REFUSED_PAGE.reload, doc: REFUSED_PAGE.reloadDoc })}
          >
            {REFUSED_PAGE.reload}
          </button>
        )}
        {children}
      </div>
    </PageFrame>
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
  const deckId: unknown = useParams({ strict: false, select: (params) => params.deckId });
  const address = isAddressRefusal(error, deckId);
  const onReload = (): void => {
    void router.invalidate();
  };
  return (
    <RefusedPage
      heading={
        address ? REFUSED_PAGE.notAnAddress : status === 'error' ? loaderHeading : renderHeading
      }
      sentence={address ? REFUSED_PAGE.addressSentence : refusalSentence(error)}
      {...(address ? {} : { onReload })}
      linkComponent={RouterLinkSlot}
    >
      <Link
        to="/decks"
        className={address ? 'pt-ib is-solid' : 'pt-ib'}
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
