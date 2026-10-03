import { GtMark } from '@turboslide/chrome/GtMark';
import { TurboslideMark } from '@turboslide/chrome/TurboslideMark';

import { FOOTER, NAV } from './copy';
import { HomeLink } from './HomeLink';

/**
 * The footer (docs/archive/rounds/POLISH.md 3.2 item 8; docs/NEXT.md 4.1.2): the lockup (the 24 px mark beside
 * the word, B1's request 2) as an anchor to `#top` (the `main` element's id, so the lockup
 * scrolls the page to its top; audit-home item 10), six links in one row, GitHub among them since
 * Round 1 moved it out of the navigation, and the closing line: the one sentence that names
 * General Translation with the GT mark set inline before the name at the text's cap
 * (brand-judge-3 graft 2), then the sentence on Google Slides. No appearance control here, it is
 * in the navigation.
 */
export function HomeFooter() {
  return (
    <footer className="ts-product-footer" data-band="footer">
      <div className="ts-col ts-product-foot">
        <a
          href={FOOTER.lockup.href}
          className="ts-product-lockup ts-product-lockup-small"
          data-control="home.foot.lockup"
          aria-label={FOOTER.lockup.name}
        >
          <TurboslideMark size={24} aria-hidden="true" />
          <span className="ts-product-lockup-word">{NAV.lockup.word}</span>
        </a>
        <ul className="ts-product-foot-links">
          {FOOTER.links.map((link) => (
            <li key={link.id}>
              <HomeLink
                href={link.href}
                external={link.external}
                control={link.id}
                className="ts-product-foot-link"
              >
                {link.label}
              </HomeLink>
            </li>
          ))}
        </ul>
        <p className="ts-product-foot-closing" data-control="home.foot.maker">
          {FOOTER.maker.before}{' '}
          <span className="ts-product-foot-company">
            <GtMark width={16} height={10} />
            {FOOTER.maker.company}
          </span>
          {FOOTER.maker.after} {FOOTER.closing}
        </p>
      </div>
    </footer>
  );
}
