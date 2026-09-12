import { TanStackDevtools } from '@tanstack/react-devtools';
import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import type { ReactNode } from 'react';

import tokensCss from '@turboslide/chrome/tokens.css?url';
import interCss from '@turboslide/fonts/inter.css?url';
import { BLOCK_CSS } from '@turboslide/render/block-css';
import sheetCss from '@turboslide/theme/gt-ink-paper/sheet.css?url';
import stageCss from '@turboslide/theme/gt-ink-paper/stage.css?url';
import { THEME_BOOT_SCRIPT } from '@turboslide/viewer/theme';

import appCss from '../styles.css?url';

// The document shell (SPEC 3.4): the theme boot script (gt-theme then
// gt-deck-theme, default dark, never prefers-color-scheme) runs in the head
// before first paint; the chrome tokens (--pt-), the sheet theme (.ts-sheet),
// the stage rules, the renderer's block CSS and the one face (Inter) load once
// for every route.

/**
 * The routes a crawler is told to leave alone (gslides-parity SPEC 6.1, 6.8, 13.4): the fresh
 * presentation, because the root now renders an editor; the trash; the print preview. The
 * presenter window carries its own meta in its route (SPEC 9.3). `/deck` and `/embed` stay
 * indexable: they are the links a rep sends.
 */
const NOINDEX_ROUTES: ReadonlySet<string> = new Set(['/new', '/decks/trash', '/print/$deckId']);

export const Route = createRootRoute({
  head: ({ matches }) => {
    const leaf = matches[matches.length - 1];
    const noindex = leaf !== undefined && NOINDEX_ROUTES.has(leaf.routeId);
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: 'Turboslide' },
        ...(noindex ? [{ name: 'robots', content: 'noindex' }] : []),
      ],
      links: [
        /* no favicon file yet: an empty data URL keeps the browser from asking for /favicon.ico */
        { rel: 'icon', href: 'data:,' },
        { rel: 'stylesheet', href: interCss },
        { rel: 'stylesheet', href: tokensCss },
        { rel: 'stylesheet', href: sheetCss },
        { rel: 'stylesheet', href: stageCss },
        { rel: 'stylesheet', href: appCss },
      ],
    };
  },
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <main className="ts-home">
      <h1>Not found</h1>
      <p>
        No page at this address. <Link to="/new">Start a new presentation</Link> or open{' '}
        <Link to="/decks">your presentations</Link>.
      </p>
    </main>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    // the boot script stamps data-theme before hydration, so the attribute is expected to differ from the server's markup
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <HeadContent />
        {/* the CSS the renderer owns (SPEC 5.2), after the theme's sheet.css and under the same .ts-sheet root */}
        <style dangerouslySetInnerHTML={{ __html: BLOCK_CSS }} />
      </head>
      <body>
        {children}
        {/* Dev only (SPEC 3.3 item 5): the component is Solid based and must never reach a
            production bundle. The devtools() Vite plugin strips it from builds as well. */}
        {import.meta.env.DEV ? (
          <TanStackDevtools
            config={{ position: 'bottom-right' }}
            plugins={[{ name: 'TanStack Router', render: <TanStackRouterDevtoolsPanel /> }]}
          />
        ) : null}
        <Scripts />
      </body>
    </html>
  );
}
