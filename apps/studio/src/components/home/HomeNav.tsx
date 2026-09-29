import { TurboslideMark } from '@turboslide/chrome/TurboslideMark';
import { applyTheme, useTheme } from '@turboslide/viewer/theme';
import type { Theme } from '@turboslide/viewer/theme';

import { NAV } from './copy';
import { HomeLink } from './HomeLink';

/**
 * The navigation of /home (docs/POLISH.md 3.2 item 0): a 44 px bar with one `--pt-hair` rule
 * under it, the 16 px mark and the word as one link to this page, Documentation and GitHub, the
 * appearance group and the one solid button. The appearance group is a `role="group"` of two
 * `aria-pressed` buttons, Light and Dark, that write `gt-theme` through `applyTheme` (the key the
 * boot script reads), never a toggle whose label has to be read to know the state. The page is
 * prerendered, so the server's markup cannot know the stored appearance: the pressed look comes
 * from `home.css` keyed on the `data-theme` attribute the boot script stamps before first paint
 * (never from a React class, so no frame shows both buttons outlined or both pressed), and the
 * small inline script after the group sets `aria-pressed` from the same attribute as the document
 * parses, so the pressed state at 150 ms equals the hydrated state (audit-collab item 20). At
 * 390 the row wraps to two: the lockup and the button, then the links and the group.
 */
const PRESSED_SCRIPT =
  "(function(){try{var t=document.documentElement.getAttribute('data-theme');var b=document.querySelectorAll('[data-theme-option]');for(var i=0;i<b.length;i++)b[i].setAttribute('aria-pressed',String(b[i].getAttribute('data-theme-option')===t))}catch(e){}})();";

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
    <header className="ts-product-nav">
      <div className="ts-product-rail ts-product-nav-row">
        <HomeLink
          href="/home"
          control="home.nav.lockup"
          className="ts-product-lockup"
          aria-label={NAV.lockup.name}
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
          <script nonce={nonce} suppressHydrationWarning>
            {PRESSED_SCRIPT}
          </script>
        </nav>
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
