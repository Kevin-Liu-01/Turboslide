import { useRouter } from '@tanstack/react-router';

import { TurboslideMark } from '@turboslide/chrome/TurboslideMark';

import { FOOTER, NAV } from './copy';
import { HomeLink } from './HomeLink';
import { MOTION_PRESSED_SCRIPT, MotionToggle } from './HomeNav';

/**
 * The footer (docs/archive/rounds/POLISH.md 3.2 item 8; docs/NEXT.md 4.1.2): the lockup (the 24 px mark beside
 * the word, B1's request 2) as an anchor to `#top` (the `main` element's id, so the lockup
 * scrolls the page to its top; audit-home item 10), six links in one row, GitHub among them since
 * Round 1 moved it out of the navigation, and the closing line: the one sentence that names
 * General Translation with the GT mark set inline before the name at the text's cap
 * (brand-judge-3 graft 2; drawn as a mask of `icons.generated.css`), then Pause Motion as a text
 * button at the line's end (docs/POLISH-2.md 3.1), the page's second motion toggle after the hero
 * terminal's. The script after it, the last toggle in the document, sets every toggle's pressed
 * state as the document parses. No appearance control here, it is in the navigation.
 */
export function HomeFooter() {
  /* the request's CSP nonce (SPEC-3 8.8), the way __root.tsx gives it to the boot scripts */
  const nonce = useRouter().options.ssr?.nonce;
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
        <div className="ts-product-foot-end">
          <p className="ts-product-foot-closing" data-control="home.foot.maker">
            {FOOTER.maker.before}{' '}
            <span className="ts-product-foot-company">
              {/* the mark as a mask of icons.generated.css, so its path is not in the document */}
              <i className="ts-icon" data-icon="gt-mark" aria-hidden="true" />
              {FOOTER.maker.company}
            </span>
            {FOOTER.maker.after}
          </p>
          <MotionToggle control="home.foot.motion" label />
        </div>
        <script nonce={nonce} suppressHydrationWarning>
          {MOTION_PRESSED_SCRIPT}
        </script>
      </div>
    </footer>
  );
}
