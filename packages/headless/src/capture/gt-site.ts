// The gt-site recipe (MILESTONES M5 item 1): what generaltranslation.com, prototemplate.com and
// glyphfield.com need before a twin is shot. The theme is seeded under the `gt-theme` key the
// sites read before first paint (Prototemplate src/app/layout.tsx boot script; the deck viewer
// tail.html storedTheme) and stamped three ways the sites read it, as `data-theme`, the `dark`
// class and `color-scheme`, with an observer that restores the stamp when a site's own boot script
// writes another value; the consent cookie is answered `cookie_consent=no` so no banner sits in
// the shot; motion is stilled; a scroll pass arms lazy sections; then fonts, images and an
// 800 ms settle. The init function is self-contained: Playwright serializes it.
import type { CaptureRecipe } from './recipes.ts';
import { registerRecipe, STILL_CSS } from './recipes.ts';

export const GT_THEME_KEY = 'gt-theme';
export const GT_CONSENT_COOKIE = 'cookie_consent=no';

/** Consent banners and chat widgets that would sit over the page. */
const HIDE_CSS =
  '[data-cookie-consent],[data-consent-banner],.cookie-consent,.cookie-banner,#cookie-banner,#CybotCookiebotDialog,.cc-window,[aria-label*="cookie" i][role="dialog"]{display:none!important}';

export const GT_SITE_RECIPE: CaptureRecipe = {
  id: 'gt-site',
  doc: 'generaltranslation.com, prototemplate.com, glyphfield.com: gt-theme seeded before first paint, cookie_consent=no, the dark class and data-theme stamped and held, motion stilled, a scroll pass, an 800 ms settle.',
  init: ({ theme }) => {
    try {
      localStorage.setItem('gt-theme', theme);
      localStorage.setItem('gt-deck-theme', theme);
      localStorage.setItem('theme', theme);
    } catch {
      // storage unavailable: the stamps below carry the theme for the document
    }
    try {
      document.cookie = 'cookie_consent=no; path=/; SameSite=Lax';
    } catch {
      // a document without a cookie jar
    }
    const root = document.documentElement;
    const apply = (): void => {
      if (root.dataset.theme !== theme) root.dataset.theme = theme;
      if (root.classList.contains('dark') !== (theme === 'dark'))
        root.classList.toggle('dark', theme === 'dark');
      if (root.classList.contains('light') !== (theme === 'light'))
        root.classList.toggle('light', theme === 'light');
      if (root.style.colorScheme !== theme) root.style.colorScheme = theme;
    };
    apply();
    new MutationObserver(apply).observe(root, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    });
  },
  css: `${STILL_CSS}${HIDE_CSS}`,
  scrollPass: true,
  settleMs: 800,
};

registerRecipe(GT_SITE_RECIPE);
