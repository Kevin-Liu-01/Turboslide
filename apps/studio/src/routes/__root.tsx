import { TanStackDevtools } from '@tanstack/react-devtools';
import { VitalsReporter } from '../components/VitalsReporter';
import { HeadContent, Link, Scripts, createRootRoute, useRouter } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import type { ReactNode } from 'react';
import { useState } from 'react';

import brandCss from '@turboslide/chrome/brand.css?url';
import { EmptyFigure } from '@turboslide/chrome/EmptyFigure';
import tokensCss from '@turboslide/chrome/tokens.css?url';
import { tipProps } from '@turboslide/chrome/Tooltip';
import interWoff2 from '@turboslide/fonts/assets/InterVariable.woff2?url';
import interCss from '@turboslide/fonts/inter.css?url';
import interItalicWoff2 from '../../../../packages/fonts/assets/InterVariable-Italic.woff2?url';
import { BLOCK_CSS } from '@turboslide/render/block-css';
import { SITE } from '@turboslide/theme/brand/site';
import sheetCss from '@turboslide/theme/gt-ink-paper/sheet.css?url';
import stageCss from '@turboslide/theme/gt-ink-paper/stage.css?url';
import { THEME_BOOT_SCRIPT } from '@turboslide/viewer/theme';

import { useMountEffect } from '../components/useMountEffect';
import appCss from '../styles.css?url';

// The document shell (SPEC 3.4): the theme boot script (gt-theme then
// gt-deck-theme, default dark, never prefers-color-scheme) runs in the head
// before first paint; the chrome tokens (--pt-), the identity tokens (--ts-,
// gslides-parity SPEC-4 0.8), the sheet theme (.ts-sheet), the stage rules,
// the renderer's block CSS and the one face (Inter) load once for every
// route. The head carries the icon set, the manifest and the site card of
// SPEC-4 1.6 (research-4 report 02 section 4.1) from packages/theme/brand/site.ts.

/**
 * The routes a crawler is told to leave alone (gslides-parity SPEC 6.1, 6.8, 13.4; SPEC-4 0.34):
 * the fresh presentation, because the root now renders an editor; the trash; the print preview;
 * the editor, because its `'data-only'` render puts the dehydrated document in the HTML. The
 * presenter window carries its own meta in its route (SPEC 9.3). `/deck`, `/embed` and `/home`
 * stay indexable: they are the links a rep sends and the product page.
 */
const NOINDEX_ROUTES: ReadonlySet<string> = new Set([
  '/new',
  '/decks/trash',
  '/print/$deckId',
  '/edit/$deckId',
]);

/**
 * The `theme-color` statement (SPEC-4 1.6; R02 2.4): the meta carries the dark paper in the
 * server's HTML and this script, placed after the head's content, sets it to the stamped theme's
 * `--pt-paper` before first paint, so the browser's own chrome follows the stored theme and not
 * the operating system's. `applyTheme` (@turboslide/viewer/theme) does the same on a toggle.
 */
export const THEME_COLOR_BOOT_SCRIPT = `(function(){try{var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',document.documentElement.getAttribute('data-theme')==='light'?'${SITE.themeColor.light}':'${SITE.themeColor.dark}')}catch(e){}})();`;

/**
 * The shell geometry boot script (gslides-parity SPEC-3 9.2 D1, D4, D6; research-3 05 3.3): runs
 * in the head before first paint beside the theme boot script and stamps the saved geometry the
 * viewer shell would otherwise apply in a mount effect (`gt-shell-sb`, `gt-shell-density`,
 * `gt-shell-mode:deck:<id>` in localStorage; `?present=1` in the address) on `<html>` as
 * `data-boot-sb`, `data-boot-density`, `data-boot-mode` and `data-boot-present`, so the chrome's
 * CSS carries the unsettled frame (`.pt-viewer:not([data-settled])`, ViewerShell.css) and a saved
 * closed list or outline density moves nothing at hydration. Attributes only; the React state
 * still boots in its effect and stamps `data-settled` after it, so the server markup is unchanged.
 * A storage that refuses to answer (a private window) stamps nothing and the default frame stands.
 */
export const SHELL_BOOT_SCRIPT =
  "(function(){try{var d=document.documentElement,l=localStorage;var sb=l.getItem('gt-shell-sb');if(sb==='0'||sb==='1')d.setAttribute('data-boot-sb',sb);var de=l.getItem('gt-shell-density');if(de==='outline'||de==='thumbs')d.setAttribute('data-boot-density',de);var m=/^\\/(?:deck|embed|edit)\\/([^/?#]+)/.exec(location.pathname);if(m){var id=decodeURIComponent(m[1]);var mode=l.getItem('gt-shell-mode:deck:'+id);if(mode==='slide'||mode==='grid'||mode==='book')d.setAttribute('data-boot-mode',mode)}if(/[?&]present=1(?:&|$)/.test(location.search))d.setAttribute('data-boot-present','1')}catch(e){}})();";

export const Route = createRootRoute({
  head: ({ matches }) => {
    const leaf = matches[matches.length - 1];
    const noindex = leaf !== undefined && NOINDEX_ROUTES.has(leaf.routeId);
    /* the card's absolute address (R02 4.1): TURBOSLIDE_PUBLIC_ORIGIN when the deployment sets
       it, else production; a route with a loader may set its own og:url from its request */
    const card = `${SITE.origin()}${SITE.card.path}`;
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: 'Turboslide' },
        { name: 'description', content: SITE.description },
        { name: 'application-name', content: SITE.name },
        { name: 'apple-mobile-web-app-title', content: SITE.name },
        /* one value, kept equal to --pt-paper by THEME_COLOR_BOOT_SCRIPT and the toggle (SPEC-4 1.6) */
        { name: 'theme-color', content: SITE.themeColor.dark },
        { property: 'og:site_name', content: SITE.name },
        { property: 'og:type', content: 'website' },
        { property: 'og:locale', content: 'en_US' },
        { property: 'og:title', content: SITE.name },
        { property: 'og:description', content: SITE.description },
        { property: 'og:image', content: card },
        { property: 'og:image:type', content: SITE.card.type },
        { property: 'og:image:width', content: String(SITE.card.width) },
        { property: 'og:image:height', content: String(SITE.card.height) },
        { property: 'og:image:alt', content: SITE.imageAlt },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: SITE.name },
        { name: 'twitter:description', content: SITE.description },
        { name: 'twitter:image', content: card },
        { name: 'twitter:image:alt', content: SITE.imageAlt },
        ...(noindex ? [{ name: 'robots', content: 'noindex' }] : []),
      ],
      links: [
        /* the icon set of SPEC-4 0.13 (R02 4.1): the ICO first with its sizes, the SVG tile second,
           the touch icon and the manifest; every one a static file the CDN answers */
        { rel: 'icon', href: SITE.icons.favicon, sizes: '32x32' },
        { rel: 'icon', href: SITE.icons.svg, type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: SITE.icons.touch },
        { rel: 'manifest', href: SITE.icons.manifest },
        /* both Inter faces start with the HTML (SPEC-3 9.2 G1): the request no longer waits for
           the stylesheet, and the metric matched fallback face of inter.css covers the swap */
        {
          rel: 'preload',
          href: interWoff2,
          as: 'font',
          type: 'font/woff2',
          crossOrigin: 'anonymous',
        },
        {
          rel: 'preload',
          href: interItalicWoff2,
          as: 'font',
          type: 'font/woff2',
          crossOrigin: 'anonymous',
        },
        { rel: 'stylesheet', href: interCss },
        { rel: 'stylesheet', href: tokensCss },
        /* the identity tokens after the chrome tokens they read (SPEC-4 0.8) */
        { rel: 'stylesheet', href: brandCss },
        { rel: 'stylesheet', href: sheetCss },
        { rel: 'stylesheet', href: stageCss },
        { rel: 'stylesheet', href: appCss },
      ],
    };
  },
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
});

/**
 * Not found (gslides-parity SPEC-4 1.10): the 64 px mark over the notfound twin's crop, the
 * heading, one sentence and three `.pt-ib` buttons, all router links now that the /home route is
 * in the route tree (the About Turboslide button was a plain anchor until B2's route landed).
 */
function NotFound() {
  return (
    <main className="ts-notfound" data-control="notfound">
      <EmptyFigure
        figure="notfound"
        heading="h1"
        mark={64}
        title="Not found"
        sentence="No page at this address. Start a new presentation, open your presentations or read what Turboslide is."
        action={
          <div className="ts-notfound-actions">
            <Link
              to="/new"
              className="pt-ib is-solid"
              data-control="notfound.new"
              {...tipProps({ name: 'New Presentation', doc: 'Starts a blank presentation.' })}
            >
              New Presentation
            </Link>
            <Link
              to="/decks"
              className="pt-ib"
              data-control="notfound.decks"
              {...tipProps({
                name: 'Your Presentations',
                doc: 'Every presentation on this Turboslide.',
              })}
            >
              Your Presentations
            </Link>
            <Link
              to="/home"
              className="pt-ib"
              data-control="notfound.about"
              {...tipProps({
                name: 'About Turboslide',
                doc: 'What Turboslide is and how fast it runs.',
              })}
            >
              About Turboslide
            </Link>
          </div>
        }
      />
    </main>
  );
}

/**
 * The devtools, mounted after hydration and never for an automated browser (gslides-parity
 * build-2/b4.md request 6): their stylesheet declares its own `@font-face { font-family: Inter }`
 * from node_modules, and a face declared last in the document wins for the same descriptors, so
 * every Inter run on a dev stage, the hidden canvas measure root included, rendered in the
 * devtools' Inter (the statement's 72 px line measured 971 px wide against the CLI's 978). This
 * devtools version has no shadow root option, so the e2e runs and the canvas walk, which compare
 * the editor's measurement with the CLI's, run without the devtools (`navigator.webdriver`); a
 * person's dev browser keeps them, and the recorded difference stands for that browser alone.
 */
function DevtoolsMount() {
  const [show, setShow] = useState(false);
  useMountEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.webdriver) return;
    setShow(true);
  });
  return show ? (
    <TanStackDevtools
      config={{ position: 'bottom-right' }}
      plugins={[{ name: 'TanStack Router', render: <TanStackRouterDevtoolsPanel /> }]}
    />
  ) : null;
}

function RootDocument({ children }: { children: ReactNode }) {
  /* the request's CSP nonce (SPEC-3 8.8): the router carries it from the security headers middleware
     (router.tsx requestNonce); the browser hides the attribute once the script ran, so the hydration
     compare is suppressed on these three elements */
  const nonce = useRouter().options.ssr?.nonce;
  return (
    // the boot script stamps data-theme before hydration, so the attribute is expected to differ from the server's markup
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
        />
        {/* the saved shell geometry stamped before first paint (SPEC-3 9.2 D1, D4), beside the theme */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: SHELL_BOOT_SCRIPT }}
        />
        <HeadContent />
        {/* the theme-color meta follows the stamped theme before first paint (SPEC-4 1.6) */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_COLOR_BOOT_SCRIPT }}
        />
        {/* the CSS the renderer owns (SPEC 5.2), after the theme's sheet.css and under the same .ts-sheet root */}
        <style
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: BLOCK_CSS }}
        />
      </head>
      <body>
        {children}
        {/* the field sample of INP, LCP and CLS on one page load in ten (gslides-parity SPEC-5 11) */}
        <VitalsReporter />
        {/* Dev only (SPEC 3.3 item 5): the component is Solid based and must never reach a
            production bundle. The devtools() Vite plugin strips it from builds as well. */}
        {import.meta.env.DEV ? <DevtoolsMount /> : null}
        <Scripts />
      </body>
    </html>
  );
}
