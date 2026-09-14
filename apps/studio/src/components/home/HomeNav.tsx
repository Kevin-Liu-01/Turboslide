import { tipProps } from '@turboslide/chrome/Tooltip';
import { TurboslideMark } from '@turboslide/chrome/TurboslideMark';
import { applyTheme, useTheme } from '@turboslide/viewer/theme';
import type { Theme } from '@turboslide/viewer/theme';

import { NAV } from './copy';
import { HomeLink } from './HomeLink';

/**
 * The navigation of /home (gslides-parity SPEC-4 2.2 item 1, 0.23; P1 4.1): one rule under a
 * 56 px bar, the horizontal lockup (the 16 px solid mark and the word at 22 px) as one link to
 * this page, the four links, the appearance group and the one solid button. The appearance group
 * is a `role="group"` of two `aria-pressed` buttons, Light and Dark, that write `gt-theme` through
 * `applyTheme` (the key the boot script reads, `THEME_BOOT_SCRIPT`), never a toggle whose label
 * has to be read to know the current state. `useTheme` hydrates with the server's dark and
 * re-renders with the stamped attribute before paint, so the pressed state never mismatches the
 * server markup. Under 760 px the four links hide (home.css) and the button and the group stay.
 */
export function HomeNav() {
  const theme = useTheme();
  const choose = (next: Theme) => {
    if (next !== theme) applyTheme(next);
  };
  const option = (value: Theme, label: string, tip: { name: string; doc: string }) => (
    <button
      type="button"
      className={value === theme ? 'pt-ib is-on' : 'pt-ib'}
      aria-pressed={value === theme}
      data-control={`home.theme.${value}`}
      onClick={() => choose(value)}
      {...tipProps(tip)}
    >
      <span className="pt-lb">{label}</span>
    </button>
  );
  return (
    <header className="ts-product-nav">
      <div className="ts-product-rail ts-product-nav-row">
        <HomeLink
          href="/home"
          tip={NAV.lockup.tip}
          control="home.nav.lockup"
          className="ts-product-lockup"
          aria-label={NAV.lockup.tip.name}
        >
          <TurboslideMark size={16} aria-hidden="true" />
          <span className="ts-product-lockup-word">{NAV.lockup.word}</span>
        </HomeLink>
        <nav className="ts-product-nav-links" aria-label="Site">
          {NAV.links.map((link) => (
            <HomeLink
              key={link.id}
              href={link.href}
              external={link.external}
              tip={link.tip}
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
            {option('light', NAV.appearance.light.label, NAV.appearance.light.tip)}
            {option('dark', NAV.appearance.dark.label, NAV.appearance.dark.tip)}
          </span>
          <HomeLink
            href={NAV.newPresentation.href}
            tip={NAV.newPresentation.tip}
            control="home.nav.new"
            className="pt-ib is-solid"
          >
            {NAV.newPresentation.label}
          </HomeLink>
        </nav>
      </div>
    </header>
  );
}
