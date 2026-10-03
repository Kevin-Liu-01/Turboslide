import { useRef } from 'react';

import { createFileRoute, useRouter } from '@tanstack/react-router';

import { MARK_PATH, MARK_VIEWBOX } from '@turboslide/theme/brand';
import { SITE } from '@turboslide/theme/brand/site';

import { BOOT_SCRIPT } from '../components/home/boot.generated';
import { HomeAgents } from '../components/home/HomeAgents';
import { HomeCanvas } from '../components/home/HomeCanvas';
import { HomeClose } from '../components/home/HomeClose';
import { HomeExport } from '../components/home/HomeExport';
import { HomeField } from '../components/home/HomeField';
import { HomeFooter } from '../components/home/HomeFooter';
import { HomeHero } from '../components/home/HomeHero';
import { HomeNav } from '../components/home/HomeNav';
import { HomeParts } from '../components/home/HomeParts';
import { HomePresent } from '../components/home/HomePresent';
import { HomeTailor } from '../components/home/HomeTailor';
import { HOME_META } from '../components/home/home-meta';
import { useMountEffect } from '../components/useMountEffect';

import '../components/home/grammar.css';
import '../components/home/icons.generated.css';
import '../components/home/selection.css';
import '../components/home/print.css';
import './home.css';

/**
 * The landing, /home (docs/LANDING.md, Kevin's ask of 2026-10-02: "inspired off of lovefrom and
 * openai brand ... much more interactive and showing off features"): the page is one eight slide
 * deck, rendered at build from `apps/studio/home-deck` after the agents run, and each band holds one
 * of its slides as a made object. The bands in the order of LANDING.md section 2: the navigation,
 * the hero (slide 1, the h1 its title), the field strip, Agents (slide 5), Tailor (slides 2 to 5),
 * the canvas (slide 6), Present (slide 3 and the list), Export (slide 7 from the two PowerPoint
 * files), the hatch strip and "Turboslide today", the close (slide 8), the footer. Every band's
 * markup is its end state, so without script, under reduced motion and for a crawler the page
 * reads whole.
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
    root.current?.setAttribute('data-hydrated', '');
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
      <HomeField />
      <HomeAgents />
      <HomeTailor />
      <HomeCanvas />
      <HomePresent />
      <HomeExport />
      <HomeParts />
      <HomeClose />
      <HomeFooter />
      <div className="ts-print-deck" data-print-deck />
    </main>
  );
}
