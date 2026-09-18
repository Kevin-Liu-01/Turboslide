import { describe, expect, it } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';
import { LAYOUTS } from '@turboslide/schema/layouts';

import { PATH_SEPARATOR, finderRows, isFinderItem } from '../menus/finder';
import type { MenuContext } from '../menus/model';
import { DEFAULT_MENU_CONTEXT, allItems, isPresent } from '../menus/model';
import { forbiddenWordsIn } from '../menus/strings';
import { toolFinderEntries } from '../ToolFinder';

// Search the menus (gslides-parity SPEC 2.10): every menu item of the model that is not omitted
// and is a command is a row with its menu path and its key; the slides and the layouts stay as
// groups; nothing in a row's words is an engineering term. The focus round (docs/FOCUS.md 3.1):
// a row the context does not draw (a parked row, a Later row while Tools > Advanced tools is off)
// is not listed, so the Later rows are asserted behind the switch.
const document = workedDocument();

/** Tools > Advanced tools on: the Later rows and the parked rows are listed. */
const ADVANCED: MenuContext = {
  ...DEFAULT_MENU_CONTEXT,
  settings: { ...DEFAULT_MENU_CONTEXT.settings, advancedTools: true },
};

describe('finderRows', () => {
  const rows = finderRows(ADVANCED);
  const plain = finderRows(DEFAULT_MENU_CONTEXT);

  it('lists every command of the model outside the omitted ones and the plain containers', () => {
    const expected = allItems()
      .filter(isFinderItem)
      .filter((item) => isPresent(item, ADVANCED));
    expect(rows.map((row) => row.item.id)).toEqual(expected.map((item) => item.id));
    expect(rows.length).toBeGreaterThan(100);
    expect(rows.some((row) => row.item.status === 'omit')).toBe(false);
    /* with the switch off the same list without its Later rows and its parked rows */
    expect(plain.map((row) => row.item.id)).toEqual(
      expected
        .filter((item) => item.status !== 'later' && item.advanced !== true)
        .map((item) => item.id),
    );
    expect(plain.some((row) => row.later)).toBe(false);
    expect(plain.some((row) => row.item.id === 'tools.advancedTools')).toBe(true);
  });

  it('gives every row its menu path and marks the Later rows', () => {
    const pdf = rows.find((row) => row.item.id === 'file.download.pdf');
    expect(pdf?.path).toBe(['File', 'Download'].join(PATH_SEPARATOR));
    expect(pdf?.title).toBe('PDF Document (.pdf)');
    /* Italic is Now since SPEC-2 0.1 (disabled with nothing selected); Edit guides stays Later */
    const italic = rows.find((row) => row.item.id === 'format.text.italic');
    expect(italic?.later).toBe(false);
    expect(italic?.enabled).toBe(false);
    const editGuides = rows.find((row) => row.item.id === 'view.guides.edit');
    expect(editGuides?.later).toBe(true);
    expect(editGuides?.enabled).toBe(false);
    expect(editGuides?.doc?.startsWith('Not available in Turboslide yet')).toBe(true);
    expect(editGuides?.path).toBe(['View', 'Guides'].join(PATH_SEPARATOR));
    /* the Later row is behind the switch: absent from the default list (docs/FOCUS.md 3.1) */
    expect(plain.find((row) => row.item.id === 'view.guides.edit')).toBeUndefined();
    /* Insert > Table is listed (its plate is dynamic), the plain containers are not */
    expect(rows.some((row) => row.item.id === 'insert.table')).toBe(true);
    expect(rows.some((row) => row.item.id === 'view.guides')).toBe(false);
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
    /* File > Details is parked (docs/FOCUS.md 3.2): the run is asserted with the switch on, and
       the default list is asserted without the row below */
    const entries = toolFinderEntries(
      document,
      'content-rule',
      ADVANCED,
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
    /* with the switch off the parked row is not listed and a core row still runs */
    let ranOff: string | null = null;
    const plain = toolFinderEntries(
      document,
      'content-rule',
      DEFAULT_MENU_CONTEXT,
      (item) => {
        ranOff = item.id;
      },
      () => undefined,
    );
    expect(plain.find((entry) => entry.id === 'menu:file.details')).toBeUndefined();
    const rename = plain.find((entry) => entry.id === 'menu:file.rename');
    expect(rename?.meta).toBe('File');
    if (rename?.run.kind === 'call') rename.run.call();
    expect(ranOff).toBe('file.rename');
  });
});
