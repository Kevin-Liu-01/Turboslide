import { TurboslideMark } from '@turboslide/chrome/TurboslideMark';

import { FOOTER, NAV } from './copy';
import { HomeLink } from './HomeLink';

/**
 * The footer (gslides-parity SPEC-4 2.2 item 10; R05 6.9): four groups of plain links (Studio,
 * Documentation, Agents, Licence), the closing line and the small lockup back to the top of the
 * page; no appearance control here, it is in the navigation (0.23). Every link carries the
 * Tooltip primitive.
 */
export function HomeFooter() {
  return (
    <footer className="ts-product-footer">
      <div className="ts-product-rail">
        <div className="ts-product-foot">
          {FOOTER.groups.map((group) => (
            <div key={group.id} className="ts-product-foot-group" data-group={group.id}>
              <h3 className="ts-product-foot-heading">{group.heading}</h3>
              <ul className="ts-product-foot-list">
                {group.links.map((link) => (
                  <li key={link.id}>
                    <HomeLink
                      href={link.href}
                      external={link.external}
                      tip={link.tip}
                      control={link.id}
                      className="ts-product-foot-link"
                    >
                      {link.label}
                    </HomeLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="ts-product-foot-line">
          <HomeLink
            href="/home"
            tip={FOOTER.lockupTip}
            control="home.foot.lockup"
            className="ts-product-lockup ts-product-lockup-small"
            aria-label={FOOTER.lockupTip.name}
          >
            <TurboslideMark size={16} aria-hidden="true" />
            <span className="ts-product-lockup-word">{NAV.lockup.word}</span>
          </HomeLink>
          <span>{FOOTER.closing}</span>
        </div>
      </div>
    </footer>
  );
}
