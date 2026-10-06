import { useState } from 'react';

import { ThemeButton } from '@turboslide/chrome/ThemeButton';
import { tipProps } from '@turboslide/chrome/Tooltip';
import { TurboslideMark } from '@turboslide/chrome/TurboslideMark';

import { useMountEffect } from '../useMountEffect';
import { NAV } from './copy';
import { NAV_ICONS } from './design-copy';
import { HomeLink } from './HomeLink';
import { SignInButton } from './sign-in';

/**
 * The navigation of /home (docs/DESIGN.md 8.1; docs/LANDING.md 2.1): one 58 px row in the 1104 px
 * column at every width, with the seam under it and a cross where the seam meets each rail. The
 * lockup (the 24 px mark beside the 22 px word) links to this page; then Documentation as a text
 * link (from 720 px; under it the link is the footer's), a hairline, the editor's own theme button
 * (`ThemeButton`, the ◐ glyph and the shared tooltip, one control in place of a Light and Dark
 * pair, so the page draws the shared component and no copy of it), the motion toggle, a hairline,
 * Sign In as a text button and New Presentation solid. The two icon controls are 32 px `.pt-ib
 * .pt-icon` squares with the 6 px corner of the ladder on their hover ground.
 *
 * Sign In is drawn for an anonymous visitor once the deployment answers that it offers a method
 * (sign-in.tsx), in a slot drawn at its width from the first paint, so its arrival moves nothing
 * already drawn (the layout shift rows). The skip link comes first in the Tab order and is shown on
 * focus; it moves focus to the hero section.
 *
 * The motion toggle (LANDING.md 3.2) is the page's button, not React's: the boot script answers its
 * click from the first paint, flips `html[data-motion]` and `aria-pressed` and stores the choice;
 * React only names it. Its two glyphs are the editor's `pause` and `play` drawn as masks of
 * `icons.generated.css`, and motion.css shows the one that names the next press. The page is
 * prerendered, so the server's markup cannot know a stored choice: the small inline script after
 * the toggle sets `aria-pressed` from `html[data-motion]` as the document parses, and the tooltip's
 * name follows the same attribute once the page hydrates.
 */
const PRESSED_SCRIPT =
  "(function(){try{var m=document.querySelector('[data-motion-toggle]');if(m)m.setAttribute('aria-pressed',String(document.documentElement.getAttribute('data-motion')==='paused'))}catch(e){}})();";

/**
 * The motion toggle: the navigation's, and the hero terminal's head draws a second one for the
 * recording it plays (DESIGN.md 8.2). Both are the page's one control of motion: the boot script
 * and the live core keep every `[data-motion-toggle]` pressed together.
 */
export function MotionToggle({
  control = 'home.motion',
  className,
}: {
  control?: string;
  className?: string;
}) {
  const [paused, setPaused] = useState(false);
  useMountEffect(() => {
    const read = () => setPaused(document.documentElement.getAttribute('data-motion') === 'paused');
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-motion'],
    });
    return () => observer.disconnect();
  });
  return (
    <button
      type="button"
      className={`pt-ib pt-icon ts-motion-toggle${className === undefined ? '' : ` ${className}`}`}
      data-motion-toggle=""
      data-control={control}
      aria-label={NAV_ICONS.motion.pause}
      aria-pressed="false"
      suppressHydrationWarning
      {...tipProps(paused ? NAV_ICONS.motion.play : NAV_ICONS.motion.pause)}
    >
      <i className="ts-icon is-pause" data-icon="pause" aria-hidden="true" />
      <i className="ts-icon is-play" data-icon="play" aria-hidden="true" />
    </button>
  );
}

export function HomeNav({ nonce }: { nonce?: string }) {
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
              className="ts-product-nav-link"
            >
              {link.label}
            </HomeLink>
          ))}
          <span className="ts-product-nav-rule is-links" aria-hidden="true" />
          <span className="ts-product-nav-icons" data-control="home.theme">
            <ThemeButton className="ts-product-nav-icon" />
            {/* the motion toggle (LANDING.md 2.1, 3.2): the boot script holds its click from the
                first paint and motion.css its two glyphs */}
            <MotionToggle />
          </span>
          <script nonce={nonce} suppressHydrationWarning>
            {PRESSED_SCRIPT}
          </script>
          <span className="ts-product-nav-rule" aria-hidden="true" />
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
