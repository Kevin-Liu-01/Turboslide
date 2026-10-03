import { TurboslideMark } from '@turboslide/chrome/TurboslideMark';
import { applyTheme, useTheme } from '@turboslide/viewer/theme';
import type { Theme } from '@turboslide/viewer/theme';

import { NAV } from './copy';
import { HomeLink } from './HomeLink';
import { SignInButton } from './sign-in';

/**
 * The navigation of /home (docs/archive/rounds/POLISH.md 3.2 item 0; the page grammar of docs/NEXT.md 4.1.2 and
 * 4.1.3 item 9): the 58 px bar in the 1104 px column with the seam under it and a cross where the
 * seam meets each rail, the lockup (the 24 px mark beside the 22 px word, B1's request 2) as one
 * link to this page, then Documentation, the appearance group, Pause Motion, Sign In and the one
 * solid button (docs/LANDING.md 2.1). GitHub moved to the footer. Sign In is drawn for an anonymous visitor once the deployment
 * answers that it offers a method (sign-in.tsx), in a slot drawn at its width from the first
 * paint, so its arrival moves nothing that was already drawn (the layout shift rows). The skip
 * link comes first in the Tab order and is shown on focus (docs/LANDING.md 2.1); it moves focus to
 * the hero section. The appearance group
 * is a `role="group"` of two `aria-pressed` buttons, Light and Dark, that write `gt-theme`
 * through `applyTheme` (the key the boot script reads), never a toggle whose label has to be read
 * to know the state. The page is prerendered, so the server's markup cannot know the stored
 * appearance: the pressed look comes from `home.css` keyed on the `data-theme` attribute the boot
 * script stamps before first paint, and the small inline script after the group sets
 * `aria-pressed` from the same attribute as the document parses, so the pressed state at 150 ms
 * equals the hydrated state (audit-collab item 20); the same script sets Pause Motion's
 * `aria-pressed` from `html[data-motion]`, which the boot script stamps (V4's). Pause Motion is the
 * page's button, not React's: the boot script answers its click from the first paint. Under
 * 1023 px the bar is two rows: the lockup, Sign In and the button, then Documentation, the group
 * and Pause Motion; under 400 px the lockup shows the mark alone.
 */
const PRESSED_SCRIPT =
  "(function(){try{var t=document.documentElement.getAttribute('data-theme');var b=document.querySelectorAll('[data-theme-option]');for(var i=0;i<b.length;i++)b[i].setAttribute('aria-pressed',String(b[i].getAttribute('data-theme-option')===t));var m=document.querySelector('[data-motion-toggle]');if(m)m.setAttribute('aria-pressed',String(document.documentElement.getAttribute('data-motion')==='paused'))}catch(e){}})();";

export function HomeNav({ nonce }: { nonce?: string }) {
  const theme = useTheme();
  const choose = (next: Theme) => {
    if (next !== theme) applyTheme(next);
  };
  const option = (value: Theme, label: string) => (
    <button
      type="button"
      className="pt-ib"
      aria-pressed={value === theme}
      data-control={`home.theme.${value}`}
      data-theme-option={value}
      onClick={() => choose(value)}
    >
      <span className="pt-lb">{label}</span>
    </button>
  );
  return (
    <header className="ts-product-nav ts-seam">
      <a className="ts-skip" href="#hero" data-control="home.nav.skip">
        {NAV.skip}
      </a>
      <div className="ts-col ts-product-nav-row">
        <HomeLink
          href="/home"
          control="home.nav.lockup"
          className="ts-product-lockup"
          aria-label={NAV.lockup.name}
        >
          <TurboslideMark size={24} aria-hidden="true" />
          <span className="ts-product-lockup-word">{NAV.lockup.word}</span>
        </HomeLink>
        <nav className="ts-product-nav-links" aria-label="Site">
          {NAV.links.map((link) => (
            <HomeLink
              key={link.id}
              href={link.href}
              external={link.external}
              control={link.id}
              className="pt-ib ts-product-nav-link"
            >
              <span className="pt-lb">{link.label}</span>
            </HomeLink>
          ))}
          <span
            className="ts-product-appearance"
            role="group"
            aria-label={NAV.appearance.label}
            data-control="home.theme"
          >
            {option('light', NAV.appearance.light.label)}
            {option('dark', NAV.appearance.dark.label)}
          </span>
          {/* Pause Motion (LANDING.md 2.1, 3.2): the page's button, not React's; the boot script
              holds its click from the first paint and motion.css its look and its two words */}
          <button
            type="button"
            className="pt-ib ts-motion-toggle"
            data-motion-toggle
            data-control="home.motion"
            aria-pressed="false"
            suppressHydrationWarning
          >
            <span className="pt-lb is-pause">{NAV.motion.pause}</span>
            <span className="pt-lb is-play">{NAV.motion.play}</span>
          </button>
          <script nonce={nonce} suppressHydrationWarning>
            {PRESSED_SCRIPT}
          </script>
        </nav>
        <span className="ts-product-nav-signin">
          <SignInButton control="home.nav.signIn" className="pt-ib" />
        </span>
        <HomeLink
          href={NAV.newPresentation.href}
          control="home.nav.new"
          className="pt-ib is-solid ts-product-nav-new"
        >
          {NAV.newPresentation.label}
        </HomeLink>
      </div>
    </header>
  );
}
