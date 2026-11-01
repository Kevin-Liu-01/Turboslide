import { useRef } from 'react';

import { createFileRoute, useRouter } from '@tanstack/react-router';

import { SITE } from '@turboslide/theme/brand/site';

import { CanvasScreen } from '../components/site/CanvasScreen';
import { ExportScreen } from '../components/site/ExportScreen';
import { Hero } from '../components/site/Hero';
import { HOME_META } from '../components/site/meta';
import { PatternsScreen } from '../components/site/PatternsScreen';
import { PresentScreen } from '../components/site/PresentScreen';
import { SiteBar } from '../components/site/SiteBar';
import { SiteFooter } from '../components/site/SiteFooter';
import { ThemesScreen } from '../components/site/ThemesScreen';
import fieldToneUrl from '../components/site/pictures/lighthouse-tone.webp?url';
import siteCss from '../components/site/site.css?url';
import { useMountEffect } from '../components/useMountEffect';

/**
 * The landing, /home, in the Workbench layout Kevin picked on 2026-10-14 (docs/SITE.md): the bar
 * with the T in a box; screen 01, the one line h1 with its two avatar stacks, the lead with New
 * Presentation and Open the Example Deck, and the editor in a square frame with corner crosses;
 * screen 02, an agent builds a slide in six writes and hands it over as a canvas, every write of
 * the agent's and the reader's in one log; screen 03, one title slide in the nine themes; screen
 * 04, the viewer, the slideshow keys and presenter view; screen 05, an animated pattern and its
 * still; screen 06, the files a download writes and the two PowerPoint files at a seam; the
 * footer. The page's own stylesheet is linked from its head (`site.css?url`),
 * so no rule of it reaches another route (routes/-home-css.test.ts). The page imports no editor
 * module (components/site/graph.test.ts).
 *
 * Kept from the page before it: the prerender (the deploy config's `prerender` option; the route
 * has no loader and reads no storage except `gt-theme`), `data-page="home"` on the root,
 * `data-hydrated` once the handlers are attached, and the Speculation Rules of SPEC-4 0.42
 * (`prerender` for `/new` at `moderate` eagerness, `prefetch` for `/decks` and `/deck/gt-brand`).
 * The root is a block that holds the bar, `main` and the footer, so each keeps its landmark.
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
    links: [
      { rel: 'stylesheet', href: siteCss },
      /* the hero field's tone picture (13 KB), fetched at low priority beside the HTML so the field
         prints itself as soon as the page hydrates (SiteField.tsx) */
      { rel: 'preload', href: fieldToneUrl, as: 'image', fetchPriority: 'low' },
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
  const root = useRef<HTMLDivElement>(null);
  /* the request's CSP nonce (SPEC-3 8.8), the way __root.tsx gives it to the boot scripts */
  const nonce = useRouter().options.ssr?.nonce;
  useMountEffect(() => {
    root.current?.setAttribute('data-hydrated', '');
  });
  return (
    <div ref={root} id="top" className="ts-site" data-page="home">
      <script type="speculationrules" nonce={nonce} suppressHydrationWarning>
        {SPECULATION_RULES_JSON}
      </script>
      <SiteBar />
      <main id="main">
        <Hero />
        <CanvasScreen />
        <ThemesScreen />
        <PresentScreen />
        <PatternsScreen />
        <ExportScreen />
      </main>
      <SiteFooter top />
    </div>
  );
}
