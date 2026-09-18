// The print page's Close preview link (docs/FOCUS.md rank 37, the matrix row
// `export.print.file-menu-after-close`; VERIFICATION C2-F25): the link back to the editor runs no
// route view transition, because while a view transition is active the browser hit tests the
// `::view-transition` pseudo tree and not the live document, so the first click on the editor's
// File title after Close preview reached nothing on the hosted tier (measured on the enforce
// preview of 2026-09-17: `:active-view-transition` true at the click, the click's target the root
// element, `::view-transition-new(pt-stage)` running). The route module imports the router and
// the server functions, so this guard reads the source: the one Link with `data-control`
// `print.close` carries `viewTransition={false}`, and no other Link in the file does, so the
// opt out stays deliberate and local to that link.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'print.$deckId.tsx'), 'utf8');

/** Every `<Link ...>` opening tag of the file, attributes flattened to one line. */
function linkTags(text: string): string[] {
  return [...text.matchAll(/<Link\b([\s\S]*?)>/g)].map((match) =>
    (match[1] ?? '').replace(/\s+/g, ' ').trim(),
  );
}

describe('the print page Close preview link', () => {
  const links = linkTags(source);
  const close = links.filter((attrs) => attrs.includes('data-control="print.close"'));

  it('is one Link back to the editor route', () => {
    expect(close).toHaveLength(1);
    expect(close[0]).toContain('to="/edit/$deckId"');
  });

  it('opts out of the route view transition so the first click after it lands', () => {
    expect(close[0]).toContain('viewTransition={false}');
  });

  it('is the only Link of the file that opts out', () => {
    const optedOut = links.filter((attrs) => attrs.includes('viewTransition='));
    expect(optedOut).toEqual(close);
  });
});
