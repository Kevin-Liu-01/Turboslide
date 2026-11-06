import type { ReactNode } from 'react';
import { useRef } from 'react';

import { ThemeButton } from '@turboslide/chrome/ThemeButton';
import { TurboslideMark } from '@turboslide/chrome/TurboslideMark';

import { useMountEffect } from '../useMountEffect';
import { NAV } from './copy';
import { attachSignInSlot } from './sign-in-slot';
import { SiteIcon } from './SiteIcon';
import { SiteLink } from './SiteLink';

/**
 * The bar of the site pages and /docs (docs/SITE.md A.1, D7): one sticky 56 px row in the page's
 * column. It draws no rule at the top of the page; a hairline fades in under it over the first
 * 48 px of scroll (site.css). The lockup (the product's mark at 24 px, the vector the editor's
 * title row draws, and the word) links to /home;
 * then `slot` (the docs put their search there); then Features, Documentation, About, FAQ and
 * GitHub (About, FAQ and GitHub leave under 1024 px), the product's own theme button, Sign In and
 * New Presentation with its solid plus. At 720 px and
 * under the row keeps the lockup, the slot, the theme button and New Presentation (site.css);
 * under 390 px the lockup keeps its T and drops the word, so the row fits the column.
 *
 * Sign In appears once the deployment answers that it offers a method (sign-in-slot.ts, which
 * this bar calls on mount and /home's static script calls on its load); its slot is drawn at its
 * width from the first paint, so its arrival moves nothing already drawn. The skip link comes first in the Tab order and is shown on focus.
 *
 * The docs' bar (`docs`, docs/SITE.md section 6): the lockup, then the slot (Documentation and
 * the search field), the theme button and New Presentation; it names
 * Documentation once and draws no Sign In, as the docs' bar did before the site build.
 */
export function SiteBar({
  slot,
  skipTo = '#main',
  docs = false,
}: {
  slot?: ReactNode;
  skipTo?: string;
  docs?: boolean;
}) {
  const signIn = useRef<HTMLSpanElement>(null);
  useMountEffect(() => (signIn.current === null ? undefined : attachSignInSlot(signIn.current)));
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
          <TurboslideMark size={24} aria-hidden="true" />
          <span>{NAV.lockup.word}</span>
        </SiteLink>
        {slot}
        {docs ? null : (
          <>
            <nav className="site-bar-nav" aria-label="Site">
              {NAV.links.map((link) => (
                <SiteLink
                  key={link.id}
                  href={link.href}
                  external={link.external}
                  control={link.id}
                  className={link.wide ? 'site-bar-link is-wide' : 'site-bar-link'}
                >
                  {link.label}
                </SiteLink>
              ))}
            </nav>
          </>
        )}
        <div className="site-bar-act">
          <ThemeButton className="site-bar-theme" />
          {docs ? null : <span ref={signIn} className="site-bar-signin" />}
          <SiteLink
            href={NAV.newPresentation.href}
            control={docs ? 'docs.bar.new' : 'site.nav.new'}
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
