import { useRef } from 'react';

import { createFileRoute, useRouter } from '@tanstack/react-router';

import { SITE } from '@turboslide/theme/brand/site';

import { HomeAgents } from '../components/home/HomeAgents';
import { HomeCanvas } from '../components/home/HomeCanvas';
import { HomeExport } from '../components/home/HomeExport';
import { HomeFooter } from '../components/home/HomeFooter';
import { HomeHero } from '../components/home/HomeHero';
import { HomeLicence } from '../components/home/HomeLicence';
import { HomeMenus } from '../components/home/HomeMenus';
import { HomeNav } from '../components/home/HomeNav';
import { HomePresent } from '../components/home/HomePresent';
import { HOME_FACTS } from '../components/home/facts';
import { HOME_META } from '../components/home/home-meta';
import { useMountEffect } from '../components/useMountEffect';

import './home.css';

/**
 * The product page, /home (docs/POLISH.md section 3; the round four notes of gslides-parity
 * SPEC-4 section 2, 0.42, 0.43 stand under it): the navigation, the hero and six sections with
 * one purpose each on the 1120 px rail over the chrome's tokens, prerendered at build (the
 * `prerender` option of the deploy config; the route has no loader and reads no storage except
 * `gt-theme`), indexable and outside `NOINDEX_ROUTES`. The page renders a `main` element (the
 * perf check's landmark) with the root class `.ts-product` (never `.ts-home-page`, the /decks
 * class) and the id `top` the footer's lockup scrolls to, and stamps `data-hydrated` once its
 * handlers are attached, the mark the specs and the shell driver wait for. The head sets the
 * title, the one description of `site.ts` and `og:url` from `SITE.origin()`; the root route
 * carries the icon set and the card. The Speculation Rules script of 0.42 is inline: `prerender`
 * for `/new` at `moderate` eagerness (a hover, never viewport entry) and `prefetch` for `/decks`
 * and `/deck/gt-brand`; `/new` gates its session attach on `document.prerendering`.
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
      <script type="speculationrules" nonce={nonce} suppressHydrationWarning>
        {SPECULATION_RULES_JSON}
      </script>
      <HomeNav nonce={nonce} />
      <HomeHero />
      <HomeCanvas />
      <HomeMenus />
      <HomePresent />
      <HomeExport facts={HOME_FACTS} />
      <HomeAgents facts={HOME_FACTS} />
      <HomeLicence />
      <HomeFooter />
    </main>
  );
}
