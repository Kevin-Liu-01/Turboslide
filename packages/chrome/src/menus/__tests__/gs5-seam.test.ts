// The round five seam of the menu model (gslides-parity SPEC-5 1.6, 14.1; MILESTONES-5 integrator
// day 0 and merge 2): every planned effect names a row that carries it now (the flips landed at
// merge 2; the three B4 rows stay Later, BUILD-STATUS-5.md), every planned key row names a fixture
// row or is marked as ours, and the titles are sentence case with no trailing period.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { forbiddenWordsIn } from '../strings.ts';
import { GS5_KEY_ROWS, OMITTED_SHORTCUTS, parseChord } from '../keys.ts';
import { GS5_DIALOG_TITLES, GS5_PANEL_TITLES, GS5_PLANNED_EFFECTS, findItem } from '../model.ts';
import { ROUND_FIVE } from '../strings.ts';

const fixture = JSON.parse(
  readFileSync(new URL('../__fixtures__/google-shortcuts.json', import.meta.url), 'utf8'),
) as { groups: { rows: { id: string }[] }[] };
const fixtureRows = new Set(fixture.groups.flatMap((group) => group.rows.map((row) => row.id)));

/** The two toolbar controls of the planned table, which are no menu items. */
const CONTROLS = new Set(['toolbar.transition', 'toolbar.font']);

/** The rows of SPEC-5 14.1 still Later at merge 2: B4's page, ODP and SVG surfaces are not in the tree (BUILD-STATUS-5.md "B4"). */
const STILL_LATER = new Set(['file.pageSetup', 'file.download.odp', 'file.download.svg']);

describe('the round five seam of the menu model', () => {
  it('flips every planned row to Now with its planned effect, the three B4 rows apart', () => {
    for (const [id, planned] of Object.entries(GS5_PLANNED_EFFECTS)) {
      if (CONTROLS.has(id)) continue;
      const item = findItem(id);
      expect(item, id).toBeDefined();
      if (STILL_LATER.has(id)) {
        expect(item?.status, id).toBe('later');
        continue;
      }
      expect(item?.status, id).toBe('now');
      /* a submenu's planned effect is the container's own; a client row runs its handler */
      if (planned.effect.kind !== 'submenu') expect(item?.effect, id).toEqual(planned.effect);
      expect(planned.lane).toMatch(/^B[1-7]$/);
      if (planned.effect.kind === 'dialog')
        expect(
          GS5_DIALOG_TITLES.includes(planned.effect.title) || planned.effect.title === 'Download',
          planned.effect.title,
        ).toBe(true);
      if (planned.effect.kind === 'panel')
        expect(GS5_PANEL_TITLES, planned.effect.title).toContain(planned.effect.title);
    }
    expect(findItem('file.download.odp')?.status).toBe('later');
    expect(findItem('file.pageSetup')?.status).toBe('later');
    expect(findItem('toolbar.transition')).toBeUndefined();
  });

  it('spells the titles and the sentences in sentence case with no trailing period and no engineering word', () => {
    for (const title of [...GS5_DIALOG_TITLES, ...GS5_PANEL_TITLES]) {
      expect(title).toMatch(/^[A-Z][^.]*$/);
      expect(forbiddenWordsIn(title), title).toEqual([]);
    }
    for (const value of Object.values(ROUND_FIVE)) {
      const text = typeof value === 'function' ? value(42, 3, 1) : value;
      expect(text.endsWith('.'), text).toBe(false);
      expect(text.includes('—'), text).toBe(false);
    }
    expect(ROUND_FIVE.importSummary(42, 3, 1)).toBe(
      '42 objects imported, 3 shown differently, 1 dropped',
    );
    expect(ROUND_FIVE.stepOf(2, 4)).toBe('Step 2 of 4');
  });

  it('names a fixture row for every Google key row, marks the others as ours, and parses every chord', () => {
    const greyed = new Set(OMITTED_SHORTCUTS.map((entry) => entry.google));
    for (const row of GS5_KEY_ROWS) {
      if (row.google === undefined) expect(row.turboslide, row.id).toBe(true);
      else {
        expect(fixtureRows.has(row.google), row.google).toBe(true);
        /* the row is bound or listed as omitted with its reason; nothing is greyed by mistake */
        expect(greyed.has(row.google) || !row.turboslide, row.google).toBe(true);
      }
      expect(() => parseChord(row.mac), row.mac).not.toThrow();
      expect(() => parseChord(row.win), row.win).not.toThrow();
    }
    const ids = GS5_KEY_ROWS.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    /* the eleven Google rows of SPEC-5 16.1 that leave OMITTED_SHORTCUTS */
    expect(GS5_KEY_ROWS.filter((row) => row.google !== undefined).length).toBeGreaterThanOrEqual(
      11,
    );
  });
});
