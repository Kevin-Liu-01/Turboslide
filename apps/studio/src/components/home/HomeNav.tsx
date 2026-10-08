import { useState } from 'react';

import { ThemeButton } from '@turboslide/chrome/ThemeButton';
import { tipProps } from '@turboslide/chrome/Tooltip';
import { TurboslideMark } from '@turboslide/chrome/TurboslideMark';

import { useMountEffect } from '../useMountEffect';
import { NAV } from './copy';
import { MOTION_BUTTON, NAV_ICONS } from './design-copy';
import { HomeLink } from './HomeLink';
import { SignInButton } from './sign-in';

/**
 * The script that sets every motion toggle's `aria-pressed` from `html[data-motion]` as the
 * document parses (docs/POLISH-2.md 3.1 item 3). The page is prerendered, so the server's markup
 * cannot know a stored choice; the boot script has set `html[data-motion]` by then. The footer
 * renders it after its own toggle, the last one in the document, so a visitor who paused on an
 * earlier visit hears both toggles as pressed before the live core loads.
 */
export const MOTION_PRESSED_SCRIPT =
  "for(const m of document.querySelectorAll('[data-motion-toggle]'))m.setAttribute('aria-pressed',document.documentElement.dataset.motion=='paused')";

/**
 * The motion toggle (LANDING.md 3.2): the hero terminal's icon button and the footer's text
 * button (`label`), the page's one control of motion in two places. It is the page's button, not
 * React's: the boot script answers its click from the first paint, flips `html[data-motion]` and
 * `aria-pressed` and stores the choice, and the live core keeps every `[data-motion-toggle]`
 * pressed together; React only names it. Its glyphs are the editor's `pause` and `play` drawn as
 * masks of `icons.generated.css`, and motion.css shows the one that names the next press. The
 * text button draws both of its labels in one grid cell and shows one the same way, so its width
 * never changes on a press. Its name is "Pause motion" with `aria-pressed`, as the icon button's.
 */
export function MotionToggle({
  control = 'home.motion',
  className,
  label = false,
}: {
  control?: string;
  className?: string;
  /** the footer's text button: the glyph, then "Pause Motion" or "Play Motion" */
  label?: boolean;
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
      className={`pt-ib ${label ? 'is-label' : 'pt-icon'} ts-motion-toggle${className === undefined ? '' : ` ${className}`}`}
      data-motion-toggle=""
      data-control={control}
      aria-label={NAV_ICONS.motion.pause}
      aria-pressed="false"
      suppressHydrationWarning
      {...(label ? {} : tipProps(paused ? NAV_ICONS.motion.play : NAV_ICONS.motion.pause))}
    >
      <i className="ts-icon is-pause" data-icon="pause" aria-hidden="true" />
      <i className="ts-icon is-play" data-icon="play" aria-hidden="true" />
      {label ? (
        <>
          <span className="ts-motion-word is-pause">{MOTION_BUTTON.pause}</span>
          <span className="ts-motion-word is-play">{MOTION_BUTTON.play}</span>
        </>
      ) : null}
    </button>
  );
}

/**
 * The navigation of /home (docs/DESIGN.md 8.1; docs/LANDING.md 2.1; docs/POLISH-2.md 3.2): one
 * 58 px row in the 1104 px column at every width, with the seam under it and a cross where the
 * seam meets each rail. The lockup (the 24 px mark beside the 22 px word) links to this page; then
 * Documentation as a text link (from 720 px; under it the link is the footer's), the editor's own
 * theme button (`ThemeButton`, the half disc glyph and the shared tooltip, one control in place of a
 * Light and Dark pair, so the page draws the shared component and no copy of it), one hairline,
 * Sign In as a text button and New Presentation solid. The theme button is a 32 px `.pt-ib
 * .pt-icon` square with the 6 px corner of the ladder on its hover ground. The bar draws no motion
 * toggle (polish two, Kevin: "remove the pause unpause button in top bar"): the hero terminal's
 * head and the footer hold the page's two.
 *
 * Sign In is drawn for an anonymous visitor once the deployment answers that it offers a method
 * (sign-in.tsx), in a slot drawn at its width from the first paint, so its arrival moves nothing
 * already drawn (the layout shift rows). The skip link comes first in the Tab order and is shown on
 * focus; it moves focus to the hero section. The bar renders no script, so it takes no nonce.
 */
export function HomeNav() {
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
          <ThemeButton className="ts-product-nav-icon" />
          {/* the bar's one hairline, before Sign In (docs/POLISH-2.md 3.2) */}
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
