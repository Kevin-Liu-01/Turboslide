import { Outlet, createFileRoute } from '@tanstack/react-router';

import docsCss from '../components/docs/docs.css?url';
import { DocsShell } from '../components/docs/DocsShell';

/**
 * The docs layout, /docs and every page under it (docs/POLISH-2.md 5.2): its own stylesheet in
 * the head, so no other route carries the docs' CSS, and the shell (DocsShell.tsx: the page
 * frame, the bar's controls, the sidebar) around the page's outlet. The shell stays mounted while
 * the reader moves between pages; only the outlet's page changes.
 */
export const Route = createFileRoute('/docs')({
  head: () => ({ links: [{ rel: 'stylesheet', href: docsCss }] }),
  component: DocsLayout,
});

function DocsLayout() {
  return (
    <DocsShell>
      <Outlet />
    </DocsShell>
  );
}
