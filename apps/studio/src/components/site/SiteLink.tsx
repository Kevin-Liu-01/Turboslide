import type { AnchorHTMLAttributes, ReactNode } from 'react';

import { Link } from '@tanstack/react-router';

/**
 * The links of /home and /docs (docs/SITE.md A.1). An address inside the route tree is the
 * router's `Link` with `preload="intent"`, so the move is a same document transition; `/new` is a
 * document navigation on purpose (an editor route whose graph these pages must not carry, and the
 * Speculation Rules candidate of /home); an in page anchor is an anchor; an external address opens
 * in a new tab with `rel="noopener"`. A text link's words are its name, so it carries no tooltip.
 */
export type SiteLinkProps = {
  href: string;
  external?: boolean;
  children: ReactNode;
  className?: string;
  /** the `data-control` id, for the audits and the specs */
  control: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'>;

type Routed =
  | { to: '/home' }
  | { to: '/decks' }
  | { to: '/docs' }
  | { to: '/docs/$'; params: { _splat: string } }
  | { to: '/deck/$deckId'; params: { deckId: string } };

function routed(href: string): Routed | null {
  if (href === '/home') return { to: '/home' };
  if (href === '/decks') return { to: '/decks' };
  if (href === '/docs') return { to: '/docs' };
  const doc = /^\/docs\/([\w/-]+)$/.exec(href);
  if (doc?.[1] !== undefined) return { to: '/docs/$', params: { _splat: doc[1] } };
  const deck = /^\/deck\/([^/?#]+)$/.exec(href);
  if (deck?.[1] !== undefined) return { to: '/deck/$deckId', params: { deckId: deck[1] } };
  return null;
}

export function SiteLink({
  href,
  external = false,
  children,
  className,
  control,
  ...rest
}: SiteLinkProps) {
  const common = { className, 'data-control': control, ...rest };
  if (external)
    return (
      <a href={href} target="_blank" rel="noopener" {...common}>
        {children}
      </a>
    );
  const route = routed(href);
  if (route === null)
    return (
      <a href={href} {...common}>
        {children}
      </a>
    );
  if (route.to === '/deck/$deckId')
    return (
      <Link to={route.to} params={route.params} search={{}} preload="intent" {...common}>
        {children}
      </Link>
    );
  if (route.to === '/docs/$')
    return (
      <Link to={route.to} params={route.params} preload="intent" {...common}>
        {children}
      </Link>
    );
  return (
    <Link to={route.to} preload="intent" {...common}>
      {children}
    </Link>
  );
}
