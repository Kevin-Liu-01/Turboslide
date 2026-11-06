import { useRef } from 'react';

import { createFileRoute, useRouter } from '@tanstack/react-router';

import { SITE } from '@turboslide/theme/brand/site';

import { Chapters } from '../components/site/Chapters';
import { Hero } from '../components/site/Hero';
import { HOME_META } from '../components/site/meta';
import { SiteBar } from '../components/site/SiteBar';
import { SiteFooter } from '../components/site/SiteFooter';
import fieldToneUrl from '../components/site/pictures/lighthouse-tone.webp?url';
import siteCss from '../components/site/site.css?url';
import { useMountEffect } from '../components/useMountEffect';

/**
 * The landing, /home, in the Workbench layout Kevin picked on 2026-10-14 (docs/SITE.md): the bar
 * with the T in a box; screen 01, the one line h1 with its two avatar stacks, the lead with New
 * Presentation and Open the Example Deck, and the live editor in its frame; then four sections,
 * each a heading and a sentence beside a live editor that plays one chapter in the hero's deck
 * (agents editing beside you, the features, editing together, the slideshow; Kevin, 2026-11-03:
 * "the hero's presentation is used to show a bunch of things", then "just make it sectioned off
 * like before"); the footer. The page's own stylesheet is linked from its head (`site.css?url`),
 * so no rule of it reaches another route (routes/-home-css.test.ts). The page imports no editor
 * module (components/site/graph.test.ts).
 *
 * Kept from the page before it: the prerender (the deploy config's `prerender` option; the route
 * has no loader and reads no storage except `gt-theme`), `data-page="home"` on the root,
 * `data-hydrated` once the handlers are attached, and the Speculation Rules of SPEC-4 0.42
 * (`prerender` for `/new` at `moderate` eagerness, `prefetch` for `/decks` and `/deck/gt-brand`).
 * The root is a block that holds the bar, `main` and the footer, so each keeps its landmark.
 *
 * A static page since 2026-11-05 (docs/SITE.md D13): the server's render loads no client router,
 * React or app module, only home-entry.ts, which attaches the behaviours and stamps
 * `data-hydrated` (routes/__root.tsx `PAGE_SCRIPTS`). This component renders the same markup and,
 * when /home is reached by a client navigation from a page the router runs, its components attach
 * themselves and HomePage stamps `data-hydrated`. The page's links are document navigations from
 * a static load, so the rules also prefetch every page of this origin a link names once the
 * pointer rests on it (`moderate`), as the router's intent preload did.
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
  prefetch: [
    { source: 'list', urls: ['/decks', '/deck/gt-brand'] },
    { source: 'document', where: { href_matches: '/*' }, eagerness: 'moderate' },
  ],
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
        <Chapters />
      </main>
      <SiteFooter top />
    </div>
  );
}
