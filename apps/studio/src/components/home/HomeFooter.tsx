import { TurboslideMark } from '@turboslide/chrome/TurboslideMark';

import { FOOTER, NAV } from './copy';
import { HomeLink } from './HomeLink';

/**
 * The footer (docs/POLISH.md 3.2 item 8): the 16 px mark and the word as an anchor to `#top`
 * (the `main` element's id, so the lockup scrolls the page to its top; audit-home item 10), six
 * links in one row and the closing line. No appearance control here, it is in the navigation.
 */
export function HomeFooter() {
  return (
    <footer className="ts-product-footer" data-band="footer">
      <div className="ts-product-rail ts-product-foot">
        <a
          href={FOOTER.lockup.href}
          className="ts-product-lockup ts-product-lockup-small"
          data-control="home.foot.lockup"
          aria-label={FOOTER.lockup.name}
        >
          <TurboslideMark size={16} aria-hidden="true" />
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
        <p className="ts-product-foot-closing">{FOOTER.closing}</p>
      </div>
    </footer>
  );
}
