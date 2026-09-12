import { describe, expect, it } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';
import { LAYOUTS } from '@turboslide/schema/layouts';

import { PATH_SEPARATOR, finderRows, isFinderItem } from '../menus/finder';
import { DEFAULT_MENU_CONTEXT, allItems } from '../menus/model';
import { forbiddenWordsIn } from '../menus/strings';
import { toolFinderEntries } from '../ToolFinder';

// Search the menus (gslides-parity SPEC 2.10): every menu item of the model that is not omitted
// and is a command is a row with its menu path and its key; the slides and the layouts stay as
// groups; nothing in a row's words is an engineering term.
const document = workedDocument();

describe('finderRows', () => {
  const rows = finderRows(DEFAULT_MENU_CONTEXT);

  it('lists every command of the model outside the omitted ones and the plain containers', () => {
    const expected = allItems().filter(isFinderItem);
    expect(rows.map((row) => row.item.id)).toEqual(expected.map((item) => item.id));
    expect(rows.length).toBeGreaterThan(100);
    expect(rows.some((row) => row.item.status === 'omit')).toBe(false);
  });

  it('gives every row its menu path and marks the Later rows', () => {
    const pdf = rows.find((row) => row.item.id === 'file.download.pdf');
    expect(pdf?.path).toBe(['File', 'Download'].join(PATH_SEPARATOR));
    expect(pdf?.title).toBe('PDF Document (.pdf)');
    const italic = rows.find((row) => row.item.id === 'format.text.italic');
    expect(italic?.later).toBe(true);
    expect(italic?.enabled).toBe(false);
    expect(italic?.doc?.startsWith('Not available in Turboslide yet')).toBe(true);
    const undo = rows.find((row) => row.item.id === 'edit.undo');
    expect(undo?.key).toBe('Cmd Z');
    expect(undo?.enabled).toBe(false);
  });

  it('keeps the engineering words out of every row outside Tools > Advanced and Agent access', () => {
    for (const row of rows) {
      if (row.item.id.startsWith('tools.advanced') || row.item.id === 'extensions.agentAccess')
        continue;
      expect(forbiddenWordsIn(row.title), row.item.id).toEqual([]);
      if (row.doc !== undefined) expect(forbiddenWordsIn(row.doc), row.item.id).toEqual([]);
    }
  });
});

describe('toolFinderEntries', () => {
  it('has the menus, the slides and the 21 layouts as groups, and runs a menu row through the shell', () => {
    let ran: string | null = null;
    let picked: string | null = null;
    const entries = toolFinderEntries(
      document,
      'content-rule',
      DEFAULT_MENU_CONTEXT,
      (item) => {
        ran = item.id;
      },
      (layout) => {
        picked = layout;
      },
    );
    const groups = new Set(entries.map((entry) => entry.group));
    expect([...groups]).toEqual(['menus', 'slides', 'layouts']);
    expect(entries.filter((entry) => entry.group === 'layouts')).toHaveLength(LAYOUTS.length);
    expect(entries.filter((entry) => entry.group === 'slides')).toHaveLength(
      Object.keys(document.slides).length,
    );
    const details = entries.find((entry) => entry.id === 'menu:file.details');
    expect(details?.meta).toBe('File');
    if (details?.run.kind === 'call') details.run.call();
    expect(ran).toBe('file.details');
    const layout = entries.find((entry) => entry.id === 'layout:big-number');
    if (layout?.run.kind === 'call') layout.run.call();
    expect(picked).toBe('big-number');
    /* a disabled row reports why instead of running */
    const undo = entries.find((entry) => entry.id === 'menu:edit.undo');
    expect(undo?.run.kind).toBe('needs');
  });
});
