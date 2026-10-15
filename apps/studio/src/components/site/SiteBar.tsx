import type { ReactNode } from 'react';

import { ThemeButton } from '@turboslide/chrome/ThemeButton';

import { SignInButton } from '../home/sign-in';
import { BoxedMark } from './BoxedMark';
import { NAV } from './copy';
import { SiteIcon } from './SiteIcon';
import { SiteLink } from './SiteLink';

/**
 * The bar of /home and /docs (docs/SITE.md A.1, D7): one sticky 56 px row in the 1280 px column
 * with a hairline under it. The lockup (the T in a box at 24 px and the word) links to /home;
 * then `slot` (the docs put their search there); then Documentation and GitHub, one hairline, the
 * product's own theme button, Sign In and New Presentation with its solid plus. At 720 px and
 * under the row keeps the lockup, the slot, the theme button and New Presentation (site.css).
 *
 * Sign In appears after hydration, once the deployment answers that it offers a method
 * (home/sign-in.tsx); its slot is drawn at its width from the first paint, so its arrival moves
 * nothing already drawn. The skip link comes first in the Tab order and is shown on focus.
 */
export function SiteBar({ slot, skipTo = '#main' }: { slot?: ReactNode; skipTo?: string }) {
  return (
    <header className="site-bar">
      <a className="site-skip site-btn site-btn-ink site-btn-sm" href={skipTo}>
        {NAV.skip}
      </a>
      <div className="site-wrap site-bar-row">
        <SiteLink
          href="/home"
          control="site.nav.lockup"
          className="site-lockup"
          aria-label={NAV.lockup.name}
        >
          <BoxedMark size={24} />
          <span>{NAV.lockup.word}</span>
        </SiteLink>
        {slot}
        <nav className="site-bar-nav" aria-label="Site">
          {NAV.links.map((link) => (
            <SiteLink
              key={link.id}
              href={link.href}
              external={link.external}
              control={link.id}
              className="site-bar-link"
            >
              {link.label}
            </SiteLink>
          ))}
        </nav>
        <span className="site-bar-rule" aria-hidden="true" />
        <div className="site-bar-act">
          <ThemeButton className="site-bar-theme" />
          <span className="site-bar-signin">
            <SignInButton
              control="site.nav.signIn"
              className="site-btn site-btn-quiet site-btn-sm"
            />
          </span>
          <SiteLink
            href={NAV.newPresentation.href}
            control="site.nav.new"
            className="site-btn site-btn-ink site-btn-sm site-bar-new"
          >
            <SiteIcon name="plus" />
            {NAV.newPresentation.label}
          </SiteLink>
        </div>
      </div>
    </header>
  );
}
