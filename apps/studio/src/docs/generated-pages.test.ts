import { describe, expect, it } from 'vitest';

import { GROUP_ORDER, shortcutRows } from '../../../../packages/chrome/src/ShortcutsDialog';
import { shortcutsMdx } from './shortcuts';
import type { ShortcutRowsOf } from './shortcuts';

// The docs pages written from the product's own data (docs/POLISH-2.md 5.3): the committed MDX
// must equal a fresh generation, so a change to the key table that leaves the page behind fails
// here. `vitest run -u` rewrites the page.
describe('generated docs pages', () => {
  it('writes the Keyboard shortcuts page from the shortcuts dialog data', async () => {
    const mdx = shortcutsMdx(shortcutRows as ShortcutRowsOf, GROUP_ORDER);
    expect(mdx).toContain('## Common actions');
    expect(mdx).toMatch(/^\| New slide +\| /m);
    await expect(mdx).toMatchFileSnapshot('../../content/docs/shortcuts.mdx');
  });
});
