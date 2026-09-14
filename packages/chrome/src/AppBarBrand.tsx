import type { AnchorHTMLAttributes, ReactNode } from 'react';

import type { LinkComponent } from './editor-shell';
import { tipProps } from './Tooltip';
import { TurboslideMark } from './TurboslideMark';

/**
 * The app bar lockup of /decks and /decks/trash (gslides-parity SPEC-4 0.16, 1.2, 1.10): the
 * 16 px solid mark as one link to the files page and the word "Turboslide" as a second link to
 * the product page, 22 px type with a 10 px gap (brand.css `.ts-brand-lockup`). The route passes
 * the router's `Link` through `linkComponent` so the chrome stays router free and the transition
 * is same document; without it the lockup renders plain anchors, which is what a server render
 * without the router's context or a test gets. Both links carry the Tooltip primitive: the mark
 * keeps today's "Turboslide. Your presentations." and the word says what /home is. New in
 * Turboslide (no Prototemplate source).
 */
export const APP_BAR_BRAND = {
  home: { name: 'Turboslide', doc: 'Your presentations.' },
  about: { name: 'About Turboslide', doc: 'What Turboslide is and how fast it runs.' },
} as const;

export type AppBarBrandProps = {
  /** the router's `Link`, wrapped to the slot's props; plain anchors when absent */
  linkComponent?: LinkComponent;
  /** where the mark goes; the files page */
  homeTo?: string;
  /** where the word goes; the product page */
  aboutTo?: string;
  className?: string;
};

type SlotLinkProps = {
  to: string;
  className: string;
  children: ReactNode;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'>;

function SlotLink({
  link,
  to,
  className,
  children,
  ...rest
}: SlotLinkProps & { link: LinkComponent | undefined }) {
  if (link === undefined)
    return (
      <a href={to} className={className} {...rest}>
        {children}
      </a>
    );
  const Link = link;
  return (
    <Link to={to} preload="intent" className={className} {...rest}>
      {children}
    </Link>
  );
}

export function AppBarBrand({
  linkComponent,
  homeTo = '/decks',
  aboutTo = '/home',
  className,
}: AppBarBrandProps) {
  return (
    <span className={className ? `ts-brand-lockup ${className}` : 'ts-brand-lockup'}>
      <SlotLink
        link={linkComponent}
        to={homeTo}
        className="ts-brand-lockup-mark"
        aria-label={APP_BAR_BRAND.home.name}
        data-control="appbar.home"
        {...tipProps(APP_BAR_BRAND.home)}
      >
        <TurboslideMark size={16} aria-hidden="true" />
      </SlotLink>
      <SlotLink
        link={linkComponent}
        to={aboutTo}
        className="ts-brand-lockup-word"
        data-control="appbar.about"
        {...tipProps(APP_BAR_BRAND.about)}
      >
        Turboslide
      </SlotLink>
    </span>
  );
}
