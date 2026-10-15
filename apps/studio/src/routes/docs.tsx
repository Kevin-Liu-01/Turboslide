import { Outlet, createFileRoute } from '@tanstack/react-router';

import docsCss from '../components/docs/docs.css?url';
import { DocsShell } from '../components/docs/DocsShell';
import siteCss from '../components/site/site.css?url';

/**
 * The docs layout, /docs and every page under it (docs/POLISH-2.md 5.2; docs/SITE.md section 6):
 * the site's stylesheet and the docs' own in the head, in that order, so no other route carries
 * either and the docs' rules follow the site's, and the shell (DocsShell.tsx: the site's root and
 * bar, the navigation, the footer) around the page's outlet. The shell stays mounted while the
 * reader moves between pages; only the outlet's page changes.
 */
export const Route = createFileRoute('/docs')({
  head: () => ({
    links: [
      { rel: 'stylesheet', href: siteCss },
      { rel: 'stylesheet', href: docsCss },
    ],
  }),
  component: DocsLayout,
});

function DocsLayout() {
  return (
    <DocsShell>
      <Outlet />
    </DocsShell>
  );
}
