import type { CSSProperties } from 'react';
import { useRef } from 'react';

import { createFileRoute, useRouter } from '@tanstack/react-router';

import { SITE } from '@turboslide/theme/brand/site';

import { HomeAgents } from '../components/home/HomeAgents';
import { HomeCards } from '../components/home/HomeCards';
import { HomeCompare } from '../components/home/HomeCompare';
import { HomeEditor } from '../components/home/HomeEditor';
import { HomeFacts } from '../components/home/HomeFacts';
import { HomeFooter } from '../components/home/HomeFooter';
import { HomeHero } from '../components/home/HomeHero';
import { HomeNav } from '../components/home/HomeNav';
import { HomePipeline } from '../components/home/HomePipeline';
import { HomeSpeed } from '../components/home/HomeSpeed';
import { HOME_FACTS } from '../components/home/facts';
import { HOME_META } from '../components/home/home-meta';
import { useMountEffect } from '../components/useMountEffect';

import './home.css';

/**
 * The product page, /home (gslides-parity SPEC-4 section 2, 0.42, 0.43; R05 sections 5 and 6;
 * design-4 proposal 1 section 4): nine bands on the 1120 px rail over B1's tokens and components,
 * prerendered at build (B3's `prerender` option in the Vite configs; the route has no loader and
 * reads no storage except `gt-theme`), indexable and outside `NOINDEX_ROUTES`. The page renders a
 * `main` element (the perf check's landmark) with the root class `.ts-product` (never
 * `.ts-home-page`, the /decks class) and stamps `data-hydrated` once its handlers are attached, the
 * mark the specs and the shell driver wait for. The head sets the title, the description of 1.6
 * and `og:url`; the root route carries the icon set and the card. The Speculation Rules script of
 * 0.42 is inline: `prerender` for `/new` at `moderate` eagerness (a hover, never viewport entry)
 * and `prefetch` for `/decks` and `/deck/gt-brand`; `/new` gates its session attach on
 * `document.prerendering` (B3). The two hero twins and the figure twin reach the sheet as custom
 * properties from `SITE.twins`, so the paths stay `site.ts`'s and `home.css` names no file.
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

/** The twins as custom properties: the sheet picks the light or the dark one by `data-theme`. */
const TWIN_STYLE = {
  '--ts-product-hero-light': `url("${SITE.twins.hero.light}")`,
  '--ts-product-hero-dark': `url("${SITE.twins.hero.dark}")`,
  '--ts-product-figure-light': `url("${SITE.twins.figure.light}")`,
  '--ts-product-figure-dark': `url("${SITE.twins.figure.dark}")`,
} as CSSProperties;

function HomePage() {
  const root = useRef<HTMLElement>(null);
  /* the request's CSP nonce (SPEC-3 8.8), the way __root.tsx gives it to the boot scripts */
  const nonce = useRouter().options.ssr?.nonce;
  useMountEffect(() => {
    root.current?.setAttribute('data-hydrated', '');
  });
  return (
    <main ref={root} className="ts-product" style={TWIN_STYLE} data-page="home">
      <script type="speculationrules" nonce={nonce} suppressHydrationWarning>
        {SPECULATION_RULES_JSON}
      </script>
      <HomeNav />
      <HomeHero />
      <HomeEditor />
      <HomeCards facts={HOME_FACTS} />
      {/* the facts band and For agents sit below the fold (docs/PRODUCT.md section 2 rank 22):
          a seller reads the pitch, the editor and the cards first */}
      <HomeFacts facts={HOME_FACTS} />
      <HomePipeline facts={HOME_FACTS} />
      <HomeSpeed facts={HOME_FACTS} />
      <HomeAgents facts={HOME_FACTS} />
      <HomeCompare facts={HOME_FACTS} />
      <HomeFooter />
    </main>
  );
}
