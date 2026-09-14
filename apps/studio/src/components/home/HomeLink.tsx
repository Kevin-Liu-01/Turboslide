import type { AnchorHTMLAttributes, ReactNode } from 'react';

import { Link } from '@tanstack/react-router';

import { tipProps } from '@turboslide/chrome/Tooltip';

import type { Tip } from './copy';

/**
 * The page's links (gslides-parity SPEC-4 2.5, 0.39): an address inside the route tree is the
 * router's `Link` with `preload="intent"`, so its loader runs on hover and the move is a same
 * document transition; `/new` is a document navigation on purpose (an editor route whose graph
 * this page must not carry, and the Speculation Rules candidate), an in page anchor is an anchor,
 * and an external address opens in a new tab with `rel="noopener"`. Every link carries the
 * Tooltip primitive (`tipProps`), so the tooltip audit walks the page without an exclusion.
 */
export type HomeLinkProps = {
  href: string;
  tip: Tip;
  external?: boolean;
  children: ReactNode;
  className?: string;
  /** the `data-control` id of the control, for the audits and the specs */
  control: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'>;

/** The in tree routes a `Link` can name from this page; everything else is an anchor. */
type Routed =
  | { to: '/decks' }
  | { to: '/decks/trash' }
  | { to: '/home' }
  | { to: '/deck/$deckId'; params: { deckId: string }; search?: { present: 1 } };

function routed(href: string): Routed | null {
  if (href === '/decks') return { to: '/decks' };
  if (href === '/decks/trash') return { to: '/decks/trash' };
  if (href === '/home') return { to: '/home' };
  const deck = /^\/deck\/([^/?#]+)(\?present=1)?$/.exec(href);
  if (deck !== null && deck[1] !== undefined) {
    return deck[2] === undefined
      ? { to: '/deck/$deckId', params: { deckId: deck[1] } }
      : { to: '/deck/$deckId', params: { deckId: deck[1] }, search: { present: 1 } };
  }
  return null;
}

export function HomeLink({
  href,
  tip,
  external = false,
  children,
  className,
  control,
  ...rest
}: HomeLinkProps) {
  const common = { className, 'data-control': control, ...tipProps(tip), ...rest };
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener" {...common}>
        {children}
      </a>
    );
  }
  const route = routed(href);
  if (route === null) {
    return (
      <a href={href} {...common}>
        {children}
      </a>
    );
  }
  if (route.to === '/deck/$deckId') {
    return (
      <Link
        to={route.to}
        params={route.params}
        search={route.search ?? {}}
        preload="intent"
        {...common}
      >
        {children}
      </Link>
    );
  }
  return (
    <Link to={route.to} preload="intent" {...common}>
      {children}
    </Link>
  );
}
