import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AREA_FEATURE,
  COST_PROBE_DRIVER,
  CORE_DRIVERS,
  DECLARED_CONTROL_IDS,
  CORE_FEATURES,
  CORE_IDS,
  CORE_ID_PATTERN,
  CORE_MATRIX,
  CORE_SPEC_DRIVERS,
  CORE_STATES,
  PARKED_BEGIN,
  PARKED_END,
  PROBE_DRIVER,
  ROW_FEATURE,
  UNPARKABLE_FEATURES,
  areaOf,
  coreRow,
  costRows,
  emitParked,
  featureOf,
  isCoreId,
  isCostRow,
  isKnownControl,
  isManualRow,
  isMeasureRow,
  isParkable,
  parkedControlsOf,
  parkedFeaturesOf,
  probeRows,
  readParkedList,
  renderParkedSet,
  spliceParkedSet,
  rowsForDriver,
  rowsForFeature,
  shipVerdict,
  tally,
  validateCoreMatrix,
} from './core-matrix.mjs';

// The core matrix module (docs/FOCUS.md section 6; the integrator's day 0; docs/RETURN.md section 5
// for the return round): the committed file loads and every row keeps the id scheme, the lookups the
// probe and the core specs use answer from the file, and the two ship helpers compute rule 4 of
// section 1, RETURN.md's rule 2 (the unparkable features, the `parks` rows) and the exit rule of 6.2.

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
      expect(row.feature, row.id).toBe(ROW_FEATURE[row.id] ?? AREA_FEATURE[area] ?? area);
      if (row.today === 'broken' || row.today === 'flaky')
        expect([1, 2, 3], row.id).toContain(row.severity);
      else expect(row.severity, row.id).toBeUndefined();
      /* every parks id is a control the menu model's sources hold (RETURN.md section 5) */
      for (const control of row.parks ?? []) expect(isKnownControl(control), control).toBe(true);
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
      probeRows().length +
        costRows().length +
        CORE_SPEC_DRIVERS.reduce((n, d) => n + rowsForDriver(d).length, 0),
    ).toBe(CORE_MATRIX.length);
    for (const row of CORE_MATRIX.filter((each) => areaOf(each.id) === 'collab'))
      expect(row.feature, row.id).toBe('share');
    for (const row of rowsForFeature('surface')) expect(areaOf(row.id)).toBe('surface');
    /* the return round's features and their unparkable half (RETURN.md rule 2) */
    for (const feature of [
      'tables',
      'charts',
      'diagrams',
      'wordart',
      'formatting',
      'view',
      'inbox',
      /* the product round's four features (docs/PRODUCT.md 8.1), each parkable */
      'brand',
      'fonts',
      'templates',
      'assist',
      /* the features round, ship one (docs/FEATURES.md 4.12): the logo picker, parkable */
      'logos',
    ])
      expect(isParkable(feature), feature).toBe(true);
    for (const feature of UNPARKABLE_FEATURES) expect(isParkable(feature), feature).toBe(false);
    expect(UNPARKABLE_FEATURES).toContain('chrome');
    expect([...CORE_FEATURES.filter((f) => !isParkable(f))].sort()).toEqual(
      [...UNPARKABLE_FEATURES].sort(),
    );
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
    expect(() => validateCoreMatrix([{ ...good, feature: 'boxes' }])).toThrow(
      /unknown feature boxes/,
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
    /* parks: a list of known data-control ids (RETURN.md section 5) */
    expect(() => validateCoreMatrix([{ ...good, parks: ['file.download.jpg'] }])).not.toThrow();
    expect(() => validateCoreMatrix([{ ...good, parks: [] }])).toThrow(/parks is not a list/);
    expect(() => validateCoreMatrix([{ ...good, parks: ['Not an id'] }])).toThrow(
      /not a data-control id/,
    );
    expect(() => validateCoreMatrix([{ ...good, parks: ['file.download.noSuchRow'] }])).toThrow(
      /no control source holds/,
    );
  });
});

describe('the ship helpers of 6.2', () => {
  /** Every row passed, then the given ids changed. */
  const results = (changes = {}) => {
    const out = {};
    for (const id of CORE_IDS) out[id] = 'passed';
    return { ...out, ...changes };
  };

  it('parks a parkable feature with one red row, blocks the ship on a red row of an unparkable one, and parks the controls of a parks row alone', () => {
    const clean = parkedFeaturesOf(results());
    expect(clean.parked).toEqual([]);
    expect(clean.parkedRows).toEqual([]);
    expect(clean.blocking).toEqual([]);
    /* RETURN.md rule 2: text and images are core features and cannot be parked; a red row blocks */
    const text = rowsForFeature('text').find((row) => row.parks === undefined).id;
    const images = rowsForFeature('images').find((row) => row.parks === undefined).id;
    const surface = rowsForFeature('surface')[0].id;
    const tables = rowsForFeature('tables').find((row) => row.parks === undefined).id;
    const chrome = rowsForFeature('chrome')[0].id;
    const run = parkedFeaturesOf(
      results({
        [text]: 'failed',
        [images]: 'not driven',
        [surface]: 'failed',
        [tables]: 'failed',
        [chrome]: 'not driven',
      }),
    );
    expect(run.parked).toEqual(['tables']);
    /* the blocking rows come in the file's order */
    expect([...run.blocking].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [
        { id: text, feature: 'text', result: 'failed' },
        { id: images, feature: 'images', result: 'not driven' },
        { id: chrome, feature: 'chrome', result: 'not driven' },
        { id: surface, feature: 'surface', result: 'failed' },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(run.red.text).toEqual([{ id: text, result: 'failed' }]);
    /* a red row carrying parks keeps its controls parked and neither parks its feature nor blocks */
    const jpg = coreRow('export.jpg.current-slide');
    const merge = coreRow('tables.cells.merge-unmerge');
    const withParks = parkedFeaturesOf(results({ [jpg.id]: 'failed', [merge.id]: 'not driven' }));
    expect(withParks.parked).toEqual([]);
    expect(withParks.blocking).toEqual([]);
    expect(withParks.parkedRows).toEqual([
      { id: merge.id, parks: [...merge.parks], result: 'not driven' },
      { id: jpg.id, parks: [...jpg.parks], result: 'failed' },
    ]);
    /* an id the run never recorded is not driven, never passed */
    const partial = { [text]: 'passed' };
    expect(parkedFeaturesOf(partial).parked).toEqual(CORE_FEATURES.filter(isParkable));
    expect(parkedFeaturesOf(partial).blocking.length).toBe(
      CORE_MATRIX.filter((row) => !isParkable(row.feature) && row.parks === undefined).length -
        1 -
        CORE_MATRIX.filter((row) => isManualRow(row) && !isParkable(row.feature)).length -
        CORE_MATRIX.filter((row) => isMeasureRow(row) && !isParkable(row.feature)).length,
    );
    expect(() => parkedFeaturesOf(results({ [text]: 'green' }))).toThrow(/unknown result green/);
  });

  it('exits clean only when every row outside the committed parked list passed', () => {
    expect(shipVerdict(results())).toEqual({ ok: true, failures: [], measured: [] });
    const shapes = rowsForFeature('shapes')[0].id;
    const decks = rowsForFeature('decks')[0].id;
    const red = results({ [shapes]: 'not driven', [decks]: 'failed' });
    expect(shipVerdict(red).ok).toBe(false);
    expect(shipVerdict(red).failures.map((f) => f.id)).toEqual([decks, shapes]);
    expect(shipVerdict(red, ['shapes']).failures).toEqual([
      { id: decks, feature: 'decks', result: 'failed' },
    ]);
    /* RETURN.md rule 2: decks is unparkable, so a list naming it is refused */
    expect(() => shipVerdict(red, ['shapes', 'decks'])).toThrow(/decks cannot be parked/);
    expect(() => shipVerdict(red, ['surface'])).toThrow(/cannot be parked/);
    expect(() => shipVerdict(red, ['chrome'])).toThrow(/chrome cannot be parked/);
    expect(() => shipVerdict(red, ['boxes'])).toThrow(/unknown feature boxes/);
    /* a surface row never passes by omission */
    const surface = rowsForFeature('surface')[0].id;
    expect(shipVerdict(results({ [surface]: 'not driven' })).failures).toEqual([
      { id: surface, feature: 'surface', result: 'not driven' },
    ]);
    /* the object form: parkedRows keeps a red parks row out of the failures, and only that row */
    const jpg = coreRow('export.jpg.current-slide');
    const zip = coreRow('export.zip.bundle');
    const both = results({ [jpg.id]: 'failed', [zip.id]: 'failed' });
    const list = { parkedFeatures: [], parkedRows: [{ id: jpg.id, parks: [...jpg.parks] }] };
    expect(shipVerdict(both, list).failures).toEqual([
      { id: zip.id, feature: 'export', result: 'failed' },
    ]);
    expect(
      shipVerdict(both, {
        parkedFeatures: [],
        parkedRows: [
          { id: jpg.id, parks: [...jpg.parks] },
          { id: zip.id, parks: [...zip.parks] },
        ],
      }),
    ).toEqual({ ok: true, failures: [], measured: [] });
    expect(() =>
      shipVerdict(both, { parkedFeatures: [], parkedRows: [{ id: decks, parks: [] }] }),
    ).toThrow(/carries no parks/);
    expect(() =>
      shipVerdict(both, {
        parkedFeatures: [],
        parkedRows: [{ id: jpg.id, parks: ['file.download.pdf'] }],
      }),
    ).toThrow(/does not guard/);
  });

  it("narrows both helpers to one driver's rows, so the walk probe judges its own rows alone", () => {
    const probe = probeRows();
    const own = {};
    for (const row of probe) own[row.id] = 'passed';
    /* every spec row is unrecorded, and the narrowed reading does not count it */
    expect(shipVerdict(own, [], probe)).toEqual({ ok: true, failures: [], measured: [] });
    expect(parkedFeaturesOf(own, probe).parked).toEqual([]);
    const red = probe.find((row) => row.feature === 'text').id;
    const narrowed = shipVerdict({ ...own, [red]: 'failed' }, [], probe);
    expect(narrowed.failures).toEqual([{ id: red, feature: 'text', result: 'failed' }]);
    /* text is unparkable (RETURN.md rule 2): the red row blocks instead of parking */
    const narrowedParking = parkedFeaturesOf({ ...own, [red]: 'failed' }, probe);
    expect(narrowedParking.parked).toEqual([]);
    expect(narrowedParking.blocking).toEqual([{ id: red, feature: 'text', result: 'failed' }]);
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
    expect(shipVerdict(notDriven)).toEqual({ ok: true, failures: [], measured: [] });
    expect(parkedFeaturesOf(notDriven).parked).toEqual([]);
    const failed = { ...everything, [paste]: 'failed' };
    expect(shipVerdict(failed).failures).toEqual([
      { id: paste, feature: 'text', result: 'failed' },
    ]);
    /* text is unparkable (RETURN.md rule 2): the failed manual row blocks the ship */
    expect(parkedFeaturesOf(failed).parked).toEqual([]);
    expect(parkedFeaturesOf(failed).blocking).toEqual([
      { id: paste, feature: 'text', result: 'failed' },
    ]);
    /* an unrecorded manual row reads as not driven, the same as a recorded one */
    const { [paste]: _omitted, ...unrecorded } = everything;
    expect(shipVerdict(unrecorded).ok).toBe(true);
    /* the validator refuses an empty manual field */
    expect(() => validateCoreMatrix([{ ...CORE_MATRIX[0], manual: '' }])).toThrow(
      /manual is not a sentence/,
    );
  });

  it('reads a committed parked list with its parkedRows and refuses an unparkable feature, an unknown feature and a row without parks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'core-matrix-'));
    const good = join(dir, 'ship-abc1234.json');
    writeFileSync(good, JSON.stringify({ commit: 'abc1234', parkedFeatures: ['shapes', 'lines'] }));
    expect(readParkedList(good)).toEqual({
      commit: 'abc1234',
      parkedFeatures: ['shapes', 'lines'],
      parkedRows: [],
    });
    const jpg = coreRow('export.jpg.current-slide');
    const withRows = join(dir, 'ship-rows.json');
    writeFileSync(
      withRows,
      JSON.stringify({
        commit: 'abc1234',
        parkedFeatures: ['inbox'],
        parkedRows: [{ id: jpg.id, parks: [...jpg.parks] }],
      }),
    );
    expect(readParkedList(withRows)).toEqual({
      commit: 'abc1234',
      parkedFeatures: ['inbox'],
      parkedRows: [{ id: jpg.id, parks: [...jpg.parks] }],
    });
    const surface = join(dir, 'ship-surface.json');
    writeFileSync(surface, JSON.stringify({ commit: 'x', parkedFeatures: ['surface'] }));
    expect(() => readParkedList(surface)).toThrow(/cannot be parked/);
    const core = join(dir, 'ship-core.json');
    writeFileSync(core, JSON.stringify({ commit: 'x', parkedFeatures: ['text'] }));
    expect(() => readParkedList(core)).toThrow(/text cannot be parked/);
    const unknown = join(dir, 'ship-unknown.json');
    writeFileSync(unknown, JSON.stringify({ commit: 'x', parkedFeatures: ['boxes'] }));
    expect(() => readParkedList(unknown)).toThrow(/unknown feature boxes/);
    const noParks = join(dir, 'ship-noparks.json');
    writeFileSync(
      noParks,
      JSON.stringify({
        commit: 'x',
        parkedFeatures: [],
        parkedRows: [{ id: 'export.pdf.file', parks: [] }],
      }),
    );
    expect(() => readParkedList(noParks)).toThrow(/carries no parks/);
    const noList = join(dir, 'ship-nolist.json');
    writeFileSync(noList, JSON.stringify({ commit: 'x' }));
    expect(() => readParkedList(noList)).toThrow(/no parkedFeatures list/);
  });
});

describe('the product round (docs/PRODUCT.md section 8)', () => {
  const good = {
    id: 'export.download.large-deck-pdf',
    feature: 'export',
    interaction: 'x',
    driver: 'core/export.spec.ts',
    today: 'broken',
    severity: 2,
    evidence: 'e',
  };

  it('holds the four features, the three specs and the 133 added rows', () => {
    for (const feature of ['brand', 'fonts', 'templates', 'assist'])
      expect(rowsForFeature(feature).length, feature).toBeGreaterThan(0);
    for (const driver of ['core/chrome.spec.ts', 'core/brand.spec.ts', 'core/assist.spec.ts'])
      expect(rowsForDriver(driver).length, driver).toBeGreaterThan(0);
    expect(CORE_MATRIX.length).toBe(565 + 133 + 16 + 71 + 29);
    expect(CORE_MATRIX.filter((r) => isMeasureRow(r) && !isCostRow(r)).map((r) => r.id)).toEqual([
      'export.download.large-deck-pdf',
      'export.download.large-deck-pptx',
      /* the features round, ship two (docs/FEATURES.md 7.2): the editor's longest animation frame */
      'shaders.perf.editor-frame',
    ]);
  });

  it('validates the measure field as true or absent, never on a manual row', () => {
    expect(() => validateCoreMatrix([{ ...good, measure: true }])).not.toThrow();
    expect(() => validateCoreMatrix([{ ...good, measure: false }])).toThrow(/measure is true/);
    expect(() => validateCoreMatrix([{ ...good, measure: true, manual: 'the OS dialog' }])).toThrow(
      /never manual/,
    );
  });

  it('records a red measurement row and never parks or blocks on it', () => {
    const results = {};
    for (const id of CORE_IDS) results[id] = 'passed';
    const pdf = 'export.download.large-deck-pdf';
    const pptx = 'export.download.large-deck-pptx';
    const run = parkedFeaturesOf({ ...results, [pdf]: 'failed', [pptx]: 'not driven' });
    expect(run.parked).toEqual([]);
    expect(run.blocking).toEqual([]);
    expect(run.measured).toEqual([
      { id: pdf, feature: 'export', result: 'failed' },
      { id: pptx, feature: 'export', result: 'not driven' },
    ]);
    expect(run.red.export).toBeUndefined();
    const verdict = shipVerdict({ ...results, [pdf]: 'failed' });
    expect(verdict.ok).toBe(true);
    expect(verdict.failures).toEqual([]);
    expect(verdict.measured).toEqual([{ id: pdf, feature: 'export', result: 'failed' }]);
  });

  it('knows the declared ids of PRODUCT.md 7.1 before the lanes land their files', () => {
    for (const id of DECLARED_CONTROL_IDS) expect(isKnownControl(id), id).toBe(true);
    expect(isKnownControl('panel.assist.noSuchControl')).toBe(false);
    /* every parks id of the added rows is a declared id or a literal of a control source */
    for (const row of CORE_MATRIX)
      for (const control of row.parks ?? []) expect(isKnownControl(control), control).toBe(true);
  });
});

describe('the sync and costs round (docs/SYNC.md section 6)', () => {
  it('holds the 16 rows under the two unparkable features, the sync spec and the cost probe', () => {
    /* ten spec rows and the pull row of the cost probe under sync; the five cost rows under cost */
    expect(rowsForFeature('sync').length).toBe(11);
    expect(rowsForFeature('cost').length).toBe(5);
    expect(isParkable('sync')).toBe(false);
    expect(isParkable('cost')).toBe(false);
    expect(UNPARKABLE_FEATURES).toContain('sync');
    expect(UNPARKABLE_FEATURES).toContain('cost');
    expect(CORE_SPEC_DRIVERS).toContain('core/sync.spec.ts');
    expect(CORE_DRIVERS).toContain(COST_PROBE_DRIVER);
    expect(rowsForDriver('core/sync.spec.ts').length).toBe(10);
    expect(rowsForDriver('sync.spec.ts')).toEqual(rowsForDriver('core/sync.spec.ts'));
    /* the cost probe drives the five cost rows and the pull row of the sync feature */
    expect(costRows().map((r) => r.id)).toEqual([
      'sync.pull.no-listing',
      'cost.editor-idle.calls',
      'cost.editor-hidden.calls',
      'cost.editor-editing.calls',
      'cost.two-tabs-idle.calls',
      'cost.show.calls',
    ]);
    expect(rowsForDriver(COST_PROBE_DRIVER)).toEqual(costRows());
    for (const row of costRows()) expect(isCostRow(row), row.id).toBe(true);
    for (const row of rowsForFeature('sync'))
      if (!isCostRow(row)) expect(row.driver).toBe('core/sync.spec.ts');
    /* every cost row of the cost feature is a measurement row in SYNC.md 6.1's sense; the pull row is not */
    for (const row of rowsForFeature('cost')) expect(isMeasureRow(row), row.id).toBe(true);
    expect(isMeasureRow(coreRow('sync.pull.no-listing'))).toBe(false);
    /* today as the audits saw production on 2026-09-20 */
    expect(coreRow('sync.title.concurrent-both-kept').today).toBe('broken');
    expect(coreRow('sync.title.concurrent-both-kept').severity).toBe(3);
    expect(coreRow('sync.serial.order-and-latency').today).toBe('works');
    expect(coreRow('sync.viewer.live-updates').setup).toMatch(/share\.setGeneralAccess/);
    expect(coreRow('cost.show.calls').severity).toBe(3);
  });

  it('reads a red cost row as recorded, and a red pull row as blocking the ship', () => {
    const results = {};
    for (const id of CORE_IDS) results[id] = 'passed';
    const run = parkedFeaturesOf({
      ...results,
      'cost.show.calls': 'failed',
      'sync.pull.no-listing': 'failed',
      'sync.viewer.live-updates': 'not driven',
    });
    expect(run.parked).toEqual([]);
    expect(run.measured).toEqual([{ id: 'cost.show.calls', feature: 'cost', result: 'failed' }]);
    expect(run.blocking).toEqual([
      { id: 'sync.viewer.live-updates', feature: 'sync', result: 'not driven' },
      { id: 'sync.pull.no-listing', feature: 'sync', result: 'failed' },
    ]);
    expect(() => shipVerdict(results, ['sync'])).toThrow(/sync cannot be parked/);
    expect(() => shipVerdict(results, ['cost'])).toThrow(/cost cannot be parked/);
  });
});

describe('the features round, ship one (docs/FEATURES.md section 7)', () => {
  const ship = CORE_MATRIX.filter((row) => /^Ship one P[01];/.test(row.note ?? ''));

  it('holds the logos feature, the logos spec and the 71 added rows with their tiers', () => {
    expect(CORE_FEATURES).toContain('logos');
    expect(isParkable('logos')).toBe(true);
    expect(CORE_SPEC_DRIVERS).toContain('core/logos.spec.ts');
    expect(rowsForDriver('core/logos.spec.ts').length).toBe(7);
    expect(ship.length).toBe(71);
    expect(ship.filter((row) => row.note.startsWith('Ship one P0')).length).toBe(50);
    expect(ship.filter((row) => row.note.startsWith('Ship one P1')).length).toBe(21);
    expect(ship.filter((row) => row.driver === PROBE_DRIVER).length).toBe(54);
    expect(rowsForFeature('logos').length).toBe(22);
    for (const row of rowsForFeature('logos')) expect(row.today, row.id).toBe('not driven');
    /* every logos row but the agent row carries parks (4.12) */
    for (const row of rowsForFeature('logos'))
      if (row.id !== 'logos.agent.search-insert') expect(row.parks, row.id).toBeDefined();
  });

  it('carries the export and intake rows of the logos area under their unparkable features', () => {
    expect(ROW_FEATURE).toEqual({
      'logos.export.pdf-pptx-crisp': 'export',
      'logos.intake.svg-sentence': 'images',
      'logos.intake.url-sentence': 'images',
      'shaders.export.pdf-frame': 'export',
      'shaders.export.pptx-frame': 'export',
      'shaders.export.html-frame': 'export',
      'shaders.export.missing-frame-row': 'export',
      'shaders.view.play-setting': 'view',
    });
    for (const [id, feature] of Object.entries(ROW_FEATURE)) {
      expect(coreRow(id).feature).toBe(feature);
      /* every exception but the View row lands on an unparkable feature; the View row parks its own control */
      if (id !== 'shaders.view.play-setting') expect(isParkable(feature), id).toBe(false);
      else expect(coreRow(id).parks, id).toEqual(['view.playShaders']);
    }
    expect(() =>
      validateCoreMatrix([
        {
          id: 'logos.export.pdf-pptx-crisp',
          feature: 'logos',
          interaction: 'x',
          driver: 'core/export.spec.ts',
          today: 'not driven',
          evidence: 'e',
        },
      ]),
    ).toThrow(/area logos belongs to export, not logos/);
    /* a red export row of the logos area blocks the ship and parks nothing (7.1) */
    const results = {};
    for (const id of CORE_IDS) results[id] = 'passed';
    const run = parkedFeaturesOf({ ...results, 'logos.export.pdf-pptx-crisp': 'failed' });
    expect(run.parked).toEqual([]);
    expect(run.blocking).toEqual([
      { id: 'logos.export.pdf-pptx-crisp', feature: 'export', result: 'failed' },
    ]);
    /* a red logos row with parks parks its controls alone; one without parks the feature (4.12) */
    const picker = parkedFeaturesOf({ ...results, 'logos.picker.search': 'failed' });
    expect(picker.parked).toEqual([]);
    expect(picker.parkedRows).toEqual([
      { id: 'logos.picker.search', parks: ['insert.logo'], result: 'failed' },
    ]);
    const agent = parkedFeaturesOf({ ...results, 'logos.agent.search-insert': 'not driven' });
    expect(agent.parked).toEqual(['logos']);
  });

  it('writes the parked set of parked-controls.ts from a ship list between the markers, empty before the runs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'core-matrix-parked-'));
    const module = join(dir, 'parked-controls.ts');
    const head = "// B1's module\nimport { x } from './y';\n\n";
    const tail =
      '\n\nexport function isParked(id: string): boolean {\n  return PARKED_CONTROLS.has(id);\n}\n';
    writeFileSync(
      module,
      `${head}${PARKED_BEGIN}\nexport const PARKED_CONTROLS: ReadonlySet<string> = new Set<string>([]);\n${PARKED_END}${tail}`,
    );
    const empty = join(dir, 'ship-empty.json');
    writeFileSync(empty, JSON.stringify({ commit: 'abc1234', parkedFeatures: [], parkedRows: [] }));
    expect(parkedControlsOf(readParkedList(empty))).toEqual([]);
    const first = emitParked(empty, { out: module });
    expect(first.controls).toEqual([]);
    expect(readFileSync(module, 'utf8')).toContain(
      'export const PARKED_CONTROLS: ReadonlySet<string> = new Set<string>([]);',
    );
    expect(readFileSync(module, 'utf8').startsWith(head)).toBe(true);
    expect(readFileSync(module, 'utf8').endsWith(tail)).toBe(true);
    const list = join(dir, 'ship-two-rows.json');
    writeFileSync(
      list,
      JSON.stringify({
        commit: 'abc1234',
        parkedFeatures: [],
        parkedRows: [
          { id: 'logos.insert.every-slide', parks: ['dialog.logo.everySlide'] },
          { id: 'logos.insert.row', parks: ['insert.logo', 'insert.image.logo'] },
          { id: 'charts.double-click.opens-data', parks: ['bar.chart.editData'] },
        ],
      }),
    );
    expect(parkedControlsOf(readParkedList(list))).toEqual([
      'bar.chart.editData',
      'dialog.logo.everySlide',
      'insert.image.logo',
      'insert.logo',
    ]);
    const check = emitParked(list, { out: module, check: true });
    expect(check.changed).toBe(true);
    expect(readFileSync(module, 'utf8')).toContain('new Set<string>([]);');
    const written = emitParked(list, { out: module });
    expect(written.changed).toBe(true);
    const text = readFileSync(module, 'utf8');
    expect(text).toContain(
      "  'bar.chart.editData',\n  'dialog.logo.everySlide',\n  'insert.image.logo',\n  'insert.logo',\n]);",
    );
    expect(text).toContain('from ship-abc1234.json; 4 controls');
    expect(text.split(PARKED_BEGIN).length).toBe(2);
    expect(emitParked(list, { out: module, check: true }).changed).toBe(false);
    expect(() => spliceParkedSet('no markers here', renderParkedSet([], null))).toThrow(
      /parked-controls:begin/,
    );
    expect(() => emitParked(list, { out: join(dir, 'missing.ts') })).toThrow(/does not exist/);
    /* a list naming a row without parks, or controls the row does not guard, is refused before anything is written */
    const bad = join(dir, 'ship-bad.json');
    writeFileSync(
      bad,
      JSON.stringify({
        commit: 'abc1234',
        parkedFeatures: [],
        parkedRows: [{ id: 'logos.insert.row', parks: ['insert.shader'] }],
      }),
    );
    expect(() => emitParked(bad, { out: module })).toThrow(/controls the row does not guard/);
  });
});

describe('the features round, ship two (docs/FEATURES.md section 5, 7.1)', () => {
  const ship = CORE_MATRIX.filter((row) => /^Ship two P[01];/.test(row.note ?? ''));
  const measure = CORE_MATRIX.find((row) => row.id === 'shaders.perf.editor-frame');

  it('holds the shaders feature, the shaders spec and the 29 added rows with their tiers', () => {
    expect(CORE_FEATURES).toContain('shaders');
    expect(isParkable('shaders')).toBe(true);
    expect(CORE_SPEC_DRIVERS).toContain('core/shaders.spec.ts');
    expect(rowsForDriver('core/shaders.spec.ts').length).toBe(10);
    expect(ship.length).toBe(29);
    expect(ship.filter((row) => row.note.startsWith('Ship two P0')).length).toBe(22);
    expect(ship.filter((row) => row.note.startsWith('Ship two P1')).length).toBe(7);
    expect(ship.filter((row) => row.driver === PROBE_DRIVER).length).toBe(14);
    /* the shaders feature holds the 24 rows whose area and feature agree; the export rows and the
       View row count under their own features */
    expect(rowsForFeature('shaders').length).toBe(24);
    expect(ship.filter((row) => row.feature === 'export').length).toBe(4);
    expect(ship.filter((row) => row.feature === 'view').length).toBe(1);
    expect(ship.filter((row) => row.today === 'broken').length).toBe(11);
    expect(ship.filter((row) => row.today === 'not driven').length).toBe(18);
    /* every shaders row but the agent row carries parks (5.10); the export rows carry none and
       block the ship, the measurement row carries none and never holds it */
    for (const row of rowsForFeature('shaders'))
      if (
        row.id !== 'shaders.agent.list-insert-set-render' &&
        row.id !== 'shaders.perf.editor-frame'
      )
        expect(row.parks, row.id).toBeDefined();
    for (const row of ship.filter((r) => r.feature === 'export')) expect(row.parks).toBeUndefined();
    expect(measure?.measure).toBe(true);
    expect(measure?.parks).toBeUndefined();
  });

  it('parks the shaders controls a red row names, the feature on the agent row, and blocks on an export row', () => {
    const results = {};
    for (const id of CORE_IDS) results[id] = 'passed';
    const gallery = parkedFeaturesOf({ ...results, 'shaders.insert.gallery-thumbnails': 'failed' });
    expect(gallery.parked).toEqual([]);
    expect(gallery.parkedRows).toEqual([
      { id: 'shaders.insert.gallery-thumbnails', parks: ['insert.shader'], result: 'failed' },
    ]);
    const agent = parkedFeaturesOf({
      ...results,
      'shaders.agent.list-insert-set-render': 'not driven',
    });
    expect(agent.parked).toEqual(['shaders']);
    const pdf = parkedFeaturesOf({ ...results, 'shaders.export.pdf-frame': 'failed' });
    expect(pdf.parked).toEqual([]);
    expect(pdf.blocking).toEqual([
      { id: 'shaders.export.pdf-frame', feature: 'export', result: 'failed' },
    ]);
    /* the View row parks its own control alone, never view and never shaders */
    const view = parkedFeaturesOf({ ...results, 'shaders.view.play-setting': 'not driven' });
    expect(view.parked).toEqual([]);
    expect(view.blocking).toEqual([]);
    expect(view.parkedRows).toEqual([
      { id: 'shaders.view.play-setting', parks: ['view.playShaders'], result: 'not driven' },
    ]);
    /* the measurement row is recorded and holds nothing */
    const frame = parkedFeaturesOf({ ...results, 'shaders.perf.editor-frame': 'failed' });
    expect(frame.parked).toEqual([]);
    expect(frame.measured).toEqual([
      { id: 'shaders.perf.editor-frame', feature: 'shaders', result: 'failed' },
    ]);
    expect(shipVerdict({ ...results, 'shaders.perf.editor-frame': 'failed' }).ok).toBe(true);
  });

  it('knows the declared ids of FEATURES.md 5.3 to 5.6 and writes them into the parked set', () => {
    for (const id of [
      'insert.shader',
      'view.playShaders',
      'dialog.background.shader',
      'formatOptions.shader',
      'formatOptions.shader.strength',
      'formatOptions.shader.preset',
      'formatOptions.shader.color',
      'dialog.shader.hover',
    ])
      expect(isKnownControl(id), id).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), 'core-matrix-parked-two-'));
    const module = join(dir, 'parked-controls.ts');
    writeFileSync(
      module,
      `${PARKED_BEGIN}\nexport const PARKED_CONTROLS: ReadonlySet<string> = new Set<string>([]);\n${PARKED_END}\n`,
    );
    const list = join(dir, 'ship-shaders.json');
    writeFileSync(
      list,
      JSON.stringify({
        commit: 'def5678',
        parkedFeatures: [],
        parkedRows: [
          { id: 'shaders.panel.preset-tiles', parks: ['formatOptions.shader.preset'] },
          { id: 'shaders.view.play-setting', parks: ['view.playShaders'] },
          { id: 'shaders.background.place-answers', parks: ['dialog.background.shader'] },
        ],
      }),
    );
    expect(emitParked(list, { out: module }).controls).toEqual([
      'dialog.background.shader',
      'formatOptions.shader.preset',
      'view.playShaders',
    ]);
    expect(readFileSync(module, 'utf8')).toContain('from ship-def5678.json; 3 controls');
  });
});
