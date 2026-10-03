import { useRef } from 'react';

import { createFileRoute, useRouter } from '@tanstack/react-router';

import { MARK_PATH, MARK_VIEWBOX } from '@turboslide/theme/brand';
import { SITE } from '@turboslide/theme/brand/site';

import { BOOT_SCRIPT } from '../components/home/boot.generated';
import { HomeAgents } from '../components/home/HomeAgents';
import { HomeCanvas } from '../components/home/HomeCanvas';
import { HomeClose } from '../components/home/HomeClose';
import { HomeExport } from '../components/home/HomeExport';
import { HomeFeatures } from '../components/home/HomeFeatures';
import { HomeField } from '../components/home/HomeField';
import { HomeFooter } from '../components/home/HomeFooter';
import { HomeHero } from '../components/home/HomeHero';
import { HomeKits } from '../components/home/HomeKits';
import { HomeMenus } from '../components/home/HomeMenus';
import { HomeNav } from '../components/home/HomeNav';
import { HomeNumbers } from '../components/home/HomeNumbers';
import { HomePresent } from '../components/home/HomePresent';
import { HomeTailor } from '../components/home/HomeTailor';
import { HOME_META } from '../components/home/home-meta';
import { useMountEffect } from '../components/useMountEffect';

import '../components/home/grammar.css';
import '../components/home/icons.generated.css';
import '../components/home/selection.css';
import '../components/home/print.css';
import './home.css';
import '../components/home/editing.css';
import '../components/home/motion.css';

/**
 * The landing, /home (docs/LANDING.md, the second pass for Kevin's picks of 2026-10-03 from
 * directions A, B and C): the page is one nine slide deck, rendered at build from
 * `apps/studio/home-deck` after the recorded run, and each band holds its slides as made objects.
 * The bands in the order of LANDING.md section 2, each rendered from its push: the navigation, the
 * hero (the 96 px h1 as page text over the editor frame and the agent's terminal), the numbers
 * row, the first pass's field strip (until V4#18), the canvas (slide 6, the lighthouse), Tailor
 * (slides 1 to 5), the agents band (slide 5), Present (slide 3 and the list), Export (slide 7 from
 * the two PowerPoint files), the features table, the close (slide 9), the footer; the menus, kits,
 * two people and patterns bands join in V2#11, V2#12, V4#20 and V4#19. The document carries the
 * first screen and every band's words; each band's instrument arrives after `load` and one idle
 * callback into its reserved box (4.2), so without script a crawler reads every word.
 *
 * Kept from the page before it: the prerender (the deploy config's `prerender` option; the route
 * has no loader and reads no storage except `gt-theme`), `main#top.ts-product[data-page="home"]`,
 * `data-hydrated` once the handlers are attached, the column's two rails drawn once (`.ts-rails`),
 * the head of `home-meta.ts`, and the Speculation Rules of SPEC-4 0.42 (`prerender` for `/new` at
 * `moderate` eagerness, `prefetch` for `/decks` and `/deck/gt-brand`). The boot script (L4's,
 * `boot.generated.ts`) is the first child of `main` when the build has written it (l4.md M1).
 */
export const Route = createFileRoute('/home')({
  head: () => ({
    meta: [
      { title: HOME_META.title },
      { name: 'description', content: HOME_META.description },
      { property: 'og:title', content: HOME_META.title },
      { property: 'og:description', content: HOME_META.description },
      { property: 'og:url', content: `${SITE.origin()}${HOME_META.path}` },
    ],
  }),
  component: HomePage,
});

/** The rules of 0.42 as the browser reads them (Chrome and Edge; others ignore the script). */
export const SPECULATION_RULES = {
  prerender: [{ source: 'list', urls: ['/new'], eagerness: 'moderate' }],
  prefetch: [{ source: 'list', urls: ['/decks', '/deck/gt-brand'] }],
} as const;

const SPECULATION_RULES_JSON = JSON.stringify(SPECULATION_RULES);

function HomePage() {
  const root = useRef<HTMLElement>(null);
  /* the request's CSP nonce (SPEC-3 8.8), the way __root.tsx gives it to the boot scripts */
  const nonce = useRouter().options.ssr?.nonce;
  useMountEffect(() => {
    const main = root.current;
    if (main === null) return;
    main.setAttribute('data-hydrated', '');
    /* the live module (LANDING.md 4.2, integrator.md 4.6): one chunk, imported after `load` and
       one idle callback (capped at 1.5 s), never before `load` */
    const idle = (fn: () => void): void => {
      if (typeof window.requestIdleCallback === 'function')
        window.requestIdleCallback(fn, { timeout: 1500 });
      else window.setTimeout(fn, 0);
    };
    const go = (): void =>
      idle(() => {
        import('../components/home/live/index')
          .then((live) => live.startLive(main))
          .catch((error: unknown) => console.error('the live module did not load', error));
      });
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
    /* the features table's shortcuts: the server renders the Mac form; elsewhere the editor's
       other form (LANDING.md 2.14, keys.ts) */
    if (!/Mac|iPhone|iPad/.test(navigator.platform))
      for (const key of main.querySelectorAll<HTMLElement>('kbd[data-shortcut-other]'))
        key.textContent = key.dataset['shortcutOther'] ?? key.textContent;
  });
  return (
    <main ref={root} id="top" className="ts-product" data-page="home">
      {BOOT_SCRIPT !== '' ? (
        <script nonce={nonce} suppressHydrationWarning>
          {BOOT_SCRIPT}
        </script>
      ) : null}
      <script type="speculationrules" nonce={nonce} suppressHydrationWarning>
        {SPECULATION_RULES_JSON}
      </script>
      <svg className="ts-sprite" aria-hidden="true" focusable="false">
        {/* the Turboslide mark the slides' frame band draws (`<use href="#ts-mark">`, the build's
            rewrite of the theme's wordmark) */}
        <symbol id="ts-mark" viewBox={MARK_VIEWBOX}>
          <path d={MARK_PATH} />
        </symbol>
      </svg>
      {/* the column's two rails, drawn once for the whole page (grammar.css .ts-rails) */}
      <div className="ts-rails" aria-hidden="true" />
      <HomeNav nonce={nonce} />
      <HomeHero />
      <HomeNumbers />
      <HomeField />
      <HomeMenus />
      <HomeCanvas />
      <HomeTailor />
      <HomeKits />
      <HomeAgents />
      <HomePresent />
      <HomeExport />
      <HomeFeatures />
      <HomeClose />
      <HomeFooter />
      <div className="ts-print-deck" data-print-deck />
    </main>
  );
}
