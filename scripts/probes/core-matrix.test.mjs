import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AREA_FEATURE,
  CORE_DRIVERS,
  CORE_FEATURES,
  CORE_IDS,
  CORE_ID_PATTERN,
  CORE_MATRIX,
  CORE_SPEC_DRIVERS,
  CORE_STATES,
  PROBE_DRIVER,
  UNPARKABLE_FEATURE,
  areaOf,
  coreRow,
  featureOf,
  isCoreId,
  isManualRow,
  parkedFeaturesOf,
  probeRows,
  readParkedList,
  rowsForDriver,
  rowsForFeature,
  shipVerdict,
  tally,
  validateCoreMatrix,
} from './core-matrix.mjs';

// The core matrix module (docs/FOCUS.md section 6; the integrator's day 0): the committed file
// loads and every row keeps the id scheme, the lookups the probe and the core specs use answer
// from the file, and the two ship helpers compute rule 4 of section 1 and the exit rule of 6.2.

describe('the committed matrix', () => {
  it('loads with every row on the scheme and no duplicate id', () => {
    expect(CORE_MATRIX.length).toBeGreaterThan(300);
    expect(new Set(CORE_IDS).size).toBe(CORE_IDS.length);
    for (const row of CORE_MATRIX) {
      expect(row.id, row.id).toMatch(CORE_ID_PATTERN);
      expect(CORE_FEATURES, row.id).toContain(row.feature);
      expect(CORE_DRIVERS, row.id).toContain(row.driver);
      expect(CORE_STATES, row.id).toContain(row.today);
      const area = areaOf(row.id);
      expect(row.feature, row.id).toBe(AREA_FEATURE[area] ?? area);
      if (row.today === 'broken' || row.today === 'flaky')
        expect([1, 2, 3], row.id).toContain(row.severity);
      else expect(row.severity, row.id).toBeUndefined();
    }
    expect(Object.isFrozen(CORE_MATRIX)).toBe(true);
    expect(Object.isFrozen(CORE_MATRIX[0])).toBe(true);
  });

  it('holds every feature of section 2 and the switch, every driver, and the collab rows under share', () => {
    for (const feature of CORE_FEATURES)
      expect(rowsForFeature(feature).length, feature).toBeGreaterThan(0);
    for (const driver of CORE_DRIVERS)
      expect(rowsForDriver(driver).length, driver).toBeGreaterThan(0);
    expect(rowsForDriver('decks.spec.ts')).toEqual(rowsForDriver('core/decks.spec.ts'));
    expect(probeRows()).toEqual(rowsForDriver(PROBE_DRIVER));
    expect(
      probeRows().length + CORE_SPEC_DRIVERS.reduce((n, d) => n + rowsForDriver(d).length, 0),
    ).toBe(CORE_MATRIX.length);
    for (const row of CORE_MATRIX.filter((each) => areaOf(each.id) === 'collab'))
      expect(row.feature, row.id).toBe('share');
    for (const row of rowsForFeature('surface')) expect(areaOf(row.id)).toBe('surface');
    const t = tally();
    expect(t.rows).toBe(CORE_MATRIX.length);
    expect(t.works + t.broken + t.flaky + t['not driven']).toBe(t.rows);
  });

  it('answers the lookups from the file and refuses an unknown id', () => {
    const first = CORE_MATRIX[0];
    expect(isCoreId(first.id)).toBe(true);
    expect(coreRow(first.id)).toBe(first);
    expect(featureOf(first.id)).toBe(first.feature);
    expect(isCoreId('decks.no.such-row')).toBe(false);
    expect(() => coreRow('decks.no.such-row')).toThrow(RangeError);
    expect(() => featureOf('nothing')).toThrow(/unknown core matrix id/);
  });
});

describe('validateCoreMatrix', () => {
  const good = {
    id: 'decks.home.new-presentation',
    feature: 'decks',
    interaction: 'x',
    driver: 'probe --core',
    today: 'works',
    evidence: 'e',
  };

  it('accepts a well formed row and names every problem of a malformed one', () => {
    expect(validateCoreMatrix([good])).toHaveLength(1);
    expect(() => validateCoreMatrix([good, good])).toThrow(/duplicate id/);
    expect(() => validateCoreMatrix([{ ...good, id: 'Decks.Home' }])).toThrow(
      /area\.feature\.interaction/,
    );
    expect(() => validateCoreMatrix([{ ...good, id: 'decks' }])).toThrow(
      /area\.feature\.interaction/,
    );
    expect(() => validateCoreMatrix([{ ...good, feature: 'tables' }])).toThrow(
      /unknown feature tables/,
    );
    expect(() => validateCoreMatrix([{ ...good, id: 'slides.x.y' }])).toThrow(
      /area slides belongs to slides, not decks/,
    );
    expect(() =>
      validateCoreMatrix([{ ...good, id: 'collab.x.y', feature: 'share' }]),
    ).not.toThrow();
    expect(() => validateCoreMatrix([{ ...good, driver: 'core/tables.spec.ts' }])).toThrow(
      /unknown driver/,
    );
    expect(() => validateCoreMatrix([{ ...good, today: 'green' }])).toThrow(/unknown state green/);
    expect(() => validateCoreMatrix([{ ...good, severity: 2 }])).toThrow(/carries no severity/);
    expect(() => validateCoreMatrix([{ ...good, today: 'broken' }])).toThrow(/needs a severity/);
    expect(() => validateCoreMatrix([{ ...good, today: 'flaky', severity: 4 }])).toThrow(
      /needs a severity/,
    );
    expect(() => validateCoreMatrix([{ ...good, extra: 1 }])).toThrow(/unknown key extra/);
    expect(() => validateCoreMatrix([])).toThrow(/no rows/);
  });
});

describe('the ship helpers of 6.2', () => {
  /** Every row passed, then the given ids changed. */
  const results = (changes = {}) => {
    const out = {};
    for (const id of CORE_IDS) out[id] = 'passed';
    return { ...out, ...changes };
  };

  it('parks a feature with one failed or not driven row and never parks the switch', () => {
    const clean = parkedFeaturesOf(results());
    expect(clean.parked).toEqual([]);
    expect(clean.blocking).toEqual([]);
    const text = rowsForFeature('text')[0].id;
    const images = rowsForFeature('images')[0].id;
    const surface = rowsForFeature('surface')[0].id;
    const run = parkedFeaturesOf(
      results({ [text]: 'failed', [images]: 'not driven', [surface]: 'failed' }),
    );
    expect(run.parked).toEqual(['text', 'images']);
    expect(run.blocking).toEqual([{ id: surface, result: 'failed' }]);
    expect(run.red.text).toEqual([{ id: text, result: 'failed' }]);
    /* an id the run never recorded is not driven, never passed */
    const partial = { [text]: 'passed' };
    expect(parkedFeaturesOf(partial).parked).toEqual(
      CORE_FEATURES.filter((f) => f !== UNPARKABLE_FEATURE),
    );
    expect(parkedFeaturesOf(partial).blocking.length).toBe(rowsForFeature('surface').length);
    expect(() => parkedFeaturesOf(results({ [text]: 'green' }))).toThrow(/unknown result green/);
  });

  it('exits clean only when every row outside the committed parked list passed', () => {
    expect(shipVerdict(results())).toEqual({ ok: true, failures: [] });
    const shapes = rowsForFeature('shapes')[0].id;
    const decks = rowsForFeature('decks')[0].id;
    const red = results({ [shapes]: 'not driven', [decks]: 'failed' });
    expect(shipVerdict(red).ok).toBe(false);
    expect(shipVerdict(red).failures.map((f) => f.id)).toEqual([decks, shapes]);
    expect(shipVerdict(red, ['shapes']).failures).toEqual([
      { id: decks, feature: 'decks', result: 'failed' },
    ]);
    expect(shipVerdict(red, ['shapes', 'decks'])).toEqual({ ok: true, failures: [] });
    expect(() => shipVerdict(red, ['surface'])).toThrow(/cannot be parked/);
    expect(() => shipVerdict(red, ['tables'])).toThrow(/unknown feature tables/);
    /* a surface row never passes by omission */
    const surface = rowsForFeature('surface')[0].id;
    expect(shipVerdict(results({ [surface]: 'not driven' })).failures).toEqual([
      { id: surface, feature: 'surface', result: 'not driven' },
    ]);
  });

  it("narrows both helpers to one driver's rows, so the walk probe judges its own rows alone", () => {
    const probe = probeRows();
    const own = {};
    for (const row of probe) own[row.id] = 'passed';
    /* every spec row is unrecorded, and the narrowed reading does not count it */
    expect(shipVerdict(own, [], probe)).toEqual({ ok: true, failures: [] });
    expect(parkedFeaturesOf(own, probe).parked).toEqual([]);
    const red = probe.find((row) => row.feature === 'text').id;
    const narrowed = shipVerdict({ ...own, [red]: 'failed' }, [], probe);
    expect(narrowed.failures).toEqual([{ id: red, feature: 'text', result: 'failed' }]);
    expect(parkedFeaturesOf({ ...own, [red]: 'failed' }, probe).parked).toEqual(['text']);
    /* the whole matrix still reads the spec rows as not driven */
    expect(shipVerdict(own).ok).toBe(false);
  });

  it('treats a manual row (ruling (3)) as the checklist’s: not driven parks nothing and fails no ship, failed still does', () => {
    const manual = CORE_MATRIX.filter(isManualRow);
    expect(manual.map((row) => row.id).sort()).toEqual([
      'export.print.print-button',
      'text.clipboard.paste-without-formatting',
    ]);
    for (const row of manual) expect(row.manual.length).toBeGreaterThan(20);
    const everything = {};
    for (const row of CORE_MATRIX) everything[row.id] = 'passed';
    const paste = 'text.clipboard.paste-without-formatting';
    const notDriven = { ...everything, [paste]: 'not driven' };
    expect(shipVerdict(notDriven)).toEqual({ ok: true, failures: [] });
    expect(parkedFeaturesOf(notDriven).parked).toEqual([]);
    const failed = { ...everything, [paste]: 'failed' };
    expect(shipVerdict(failed).failures).toEqual([
      { id: paste, feature: 'text', result: 'failed' },
    ]);
    expect(parkedFeaturesOf(failed).parked).toEqual(['text']);
    /* an unrecorded manual row reads as not driven, the same as a recorded one */
    const { [paste]: _omitted, ...unrecorded } = everything;
    expect(shipVerdict(unrecorded).ok).toBe(true);
    /* the validator refuses an empty manual field */
    expect(() => validateCoreMatrix([{ ...CORE_MATRIX[0], manual: '' }])).toThrow(
      /manual is not a sentence/,
    );
  });

  it('reads a committed parked list and refuses the switch and an unknown feature', () => {
    const dir = mkdtempSync(join(tmpdir(), 'core-matrix-'));
    const good = join(dir, 'ship-abc1234.json');
    writeFileSync(good, JSON.stringify({ commit: 'abc1234', parkedFeatures: ['shapes', 'lines'] }));
    expect(readParkedList(good)).toEqual({
      commit: 'abc1234',
      parkedFeatures: ['shapes', 'lines'],
    });
    const surface = join(dir, 'ship-surface.json');
    writeFileSync(surface, JSON.stringify({ commit: 'x', parkedFeatures: ['surface'] }));
    expect(() => readParkedList(surface)).toThrow(/cannot be parked/);
    const unknown = join(dir, 'ship-unknown.json');
    writeFileSync(unknown, JSON.stringify({ commit: 'x', parkedFeatures: ['tables'] }));
    expect(() => readParkedList(unknown)).toThrow(/unknown feature tables/);
    const noList = join(dir, 'ship-nolist.json');
    writeFileSync(noList, JSON.stringify({ commit: 'x' }));
    expect(() => readParkedList(noList)).toThrow(/no parkedFeatures list/);
  });
});
