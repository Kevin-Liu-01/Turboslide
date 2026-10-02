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
  specPathOf,
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
  LOCAL_SPEC_DRIVERS,
  isLocalRow,
  localRows,
  GATE_DRIVER,
  TIER_FEATURES,
  gateRows,
  isGateRow,
  isTierRow,
  tierAbsentReason,
  tierOfFeature,
  tierRows,
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
        CORE_SPEC_DRIVERS.reduce((n, d) => n + rowsForDriver(d).length, 0) +
        /* the people round (docs/PEOPLE.md 6.2): the local rows of the accounts spec */
        localRows().length +
        /* the Cloudflare phase (docs/CLOUDFLARE.md 2.3): the gate's own rows */
        gateRows().length,
    ).toBe(CORE_MATRIX.length);
    expect(localRows()).toEqual(rowsForDriver('e2e/accounts.spec.ts'));
    for (const row of localRows()) expect(isLocalRow(row), row.id).toBe(true);
    for (const row of probeRows()) expect(isLocalRow(row), row.id).toBe(false);
    expect(LOCAL_SPEC_DRIVERS).toEqual(['e2e/accounts.spec.ts']);
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
    /* a parkable feature whose every row carries parks (svg, docs/VECTOR.md 6.1) parks its
       controls and never the feature whole */
    expect(parkedFeaturesOf(partial).parked).toEqual(
      CORE_FEATURES.filter(
        (f) => isParkable(f) && rowsForFeature(f).some((row) => row.parks === undefined),
      ),
    );
    expect(parkedFeaturesOf(partial).blocking.length).toBe(
      CORE_MATRIX.filter((row) => !isParkable(row.feature) && row.parks === undefined).length -
        1 -
        /* a manual row that is also a local row (the realtime round's accounts.google-roundtrip)
           is counted once, under the local rows below */
        CORE_MATRIX.filter(
          (row) => isManualRow(row) && !isParkable(row.feature) && !isLocalRow(row),
        ).length -
        CORE_MATRIX.filter((row) => isMeasureRow(row) && !isParkable(row.feature)).length -
        /* a local row the run did not record is listed apart, never blocking (PEOPLE.md 6.2) */
        localRows().filter((row) => !isParkable(row.feature) && row.parks === undefined).length,
    );
    expect(parkedFeaturesOf(partial).local.map((row) => row.id)).toEqual(
      localRows().map((row) => row.id),
    );
    expect(() => parkedFeaturesOf(results({ [text]: 'green' }))).toThrow(/unknown result green/);
  });

  it('exits clean only when every row outside the committed parked list passed', () => {
    expect(shipVerdict(results())).toEqual({ ok: true, failures: [], measured: [], local: [] });
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
    ).toEqual({ ok: true, failures: [], measured: [], local: [] });
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
    expect(shipVerdict(own, [], probe)).toEqual({
      ok: true,
      failures: [],
      measured: [],
      local: [],
    });
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
      /* the realtime round (docs/REALTIME.md 4.4): the Google round trip is a hand sign in */
      'accounts.google-roundtrip',
      'export.print.print-button',
      /* the Cloudflare phase (docs/CLOUDFLARE.md 2.3): the dashboard's figures and the verifier's
         memory reading are hand rows the gate records from the files given to it */
      'setup.do.memory',
      'setup.free-plan.caps',
      'text.clipboard.paste-without-formatting',
    ]);
    for (const row of manual) expect(row.manual.length).toBeGreaterThan(20);
    const everything = {};
    for (const row of CORE_MATRIX) everything[row.id] = 'passed';
    const paste = 'text.clipboard.paste-without-formatting';
    const notDriven = { ...everything, [paste]: 'not driven' };
    expect(shipVerdict(notDriven)).toEqual({ ok: true, failures: [], measured: [], local: [] });
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
    /* the features round's ship two added 29 rows; the vector round (docs/VECTOR.md 6.1) added 43
       rows and retired logos.intake.svg-sentence; the objects round (docs/OBJECTS.md 6.1) added 33 rows
       and carried five; the field fonts hotfix (build/field-fonts.md 4) added one */
    /* the polish round (docs/POLISH.md 5.1): 130 rows added and one replaced; its fix round added
       text.title.second-session-survives-reload (VERIFICATION.md "Polish round, pass 1" finding 1);
       the people round (docs/PEOPLE.md 6.1) added 21 rows: eleven on every origin and ten local */
    /* the next program's hotfix H6 (docs/NEXT.md 3.2): brand.template.blank-no-gt-mark */
    /* the second click hotfix (docs/gslides-parity/focus/AMENDMENTS.md A2, 2026-10-02):
       text.click.second-click-caret */
    /* the realtime round (docs/REALTIME.md section 2) added 22 rows: sixteen realtime rows, the
       Redis command row and five local accounts rows; its Cloudflare phase (docs/CLOUDFLARE.md
       section 2) added 10: six cost rows per Cloudflare product and four setup rows */
    /* the next program's hotfix H3 (docs/NEXT.md 3.2), carried in the realtime round's R4 push:
       one local accounts row, accounts.sign-out-clean */
    /* the next program's hotfix H7 (docs/NEXT.md 3.2): export.remove.copies-gone */
    /* the next program's hotfix H2 (docs/NEXT.md 3.2): two decks rows and one local accounts row */
    /* the next program's hotfix H4 (docs/NEXT.md 3.2): one accounts row on every origin */
    /* the next program's Round 1 push B2a#15 (docs/NEXT.md 4.1.5): four /home rows */
    /* the next program's Round 1 push B3a#7 (docs/NEXT.md 4.1.5): three menu rows of the cuts */
    /* the next program's Round 1 push B3a#8 (docs/NEXT.md 4.1.5): chrome.words.no-process-words */
    /* the next program's rows (docs/NEXT.md), one term per push in the order of the comments above */
    const NEXT_ROWS = 1 + 1 + 1 + 3 + 1 + 4 + 3 + 1;
    /* the next program's Round 1 push B1#2 (docs/NEXT.md 4.1.5): decks.manifest.paper */
    /* the next program's Round 1 push B2b#16 (docs/NEXT.md 4.1.5): decks.list.ruled-rows */
    /* the next program's Round 1 push B2c#17 (docs/NEXT.md 4.1.5): two rows */
    /* the next program's Round 1 push B2d#18 (docs/NEXT.md 4.1.5): decks.og.deck-card */
    /* the next program's Round 1 push B3b#9 (docs/NEXT.md 4.1.5): three title row rows */
    expect(CORE_MATRIX.length).toBe(
      565 +
        133 +
        16 +
        71 +
        29 +
        43 -
        1 +
        33 +
        1 -
        1 +
        130 +
        1 +
        21 +
        1 +
        22 +
        10 +
        NEXT_ROWS +
        1 +
        1 +
        2 +
        1 +
        3,
    );
    expect(CORE_MATRIX.filter((r) => isMeasureRow(r) && !isCostRow(r)).map((r) => r.id)).toEqual([
      'export.download.large-deck-pdf',
      'export.download.large-deck-pptx',
      /* the features round, ship two (docs/FEATURES.md 7.2): the editor's longest animation frame */
      'shaders.perf.editor-frame',
      /* the polish round (docs/POLISH.md 3.5): the home page's load budget */
      'decks.home.load-budget',
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
    /* the polish round adds five sync rows (docs/POLISH.md 2.8) */
    expect(rowsForFeature('sync').length).toBe(11 + 5);
    /* the realtime round adds the Redis command row (docs/REALTIME.md section 2); its Cloudflare
       phase the six rows per Cloudflare product (docs/CLOUDFLARE.md 2.2) */
    expect(rowsForFeature('cost').length).toBe(5 + 1 + 6);
    expect(isParkable('sync')).toBe(false);
    expect(isParkable('cost')).toBe(false);
    expect(UNPARKABLE_FEATURES).toContain('sync');
    expect(UNPARKABLE_FEATURES).toContain('cost');
    expect(CORE_SPEC_DRIVERS).toContain('core/sync.spec.ts');
    expect(CORE_DRIVERS).toContain(COST_PROBE_DRIVER);
    expect(rowsForDriver('core/sync.spec.ts').length).toBe(10 + 5);
    expect(rowsForDriver('sync.spec.ts')).toEqual(rowsForDriver('core/sync.spec.ts'));
    /* the cost probe drives the five cost rows and the pull row of the sync feature */
    expect(costRows().map((r) => r.id)).toEqual([
      'sync.pull.no-listing',
      'cost.editor-idle.calls',
      'cost.editor-hidden.calls',
      'cost.editor-editing.calls',
      'cost.two-tabs-idle.calls',
      'cost.show.calls',
      'cost.redis.commands',
      'cost.do.requests',
      'cost.do.duration',
      'cost.do.rows-written',
      'cost.d1.reads',
      'cost.d1.writes',
      'cost.worker.requests',
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
    /* the vector round added logos.export.svgblip to the spec and the feature, and retired the
       P1 row logos.intake.svg-sentence with its sentence (docs/VECTOR.md 4.7) */
    /* the polish round adds four rows to the logos spec (docs/POLISH.md 2.5) */
    expect(rowsForDriver('core/logos.spec.ts').length).toBe(8 + 4);
    /* the polish round replaced the P1 probe row tables.cells.prompt-hovered-only (docs/POLISH.md 2.1 item 1) */
    expect(ship.length).toBe(69);
    expect(ship.filter((row) => row.note.startsWith('Ship one P0')).length).toBe(50);
    expect(ship.filter((row) => row.note.startsWith('Ship one P1')).length).toBe(19);
    expect(ship.filter((row) => row.driver === PROBE_DRIVER).length).toBe(53);
    /* the polish round adds two dialog rows (docs/POLISH.md 2.5 items 39 and 46), broken today and
       parking nothing, so a jank dialog parks the picker whole */
    expect(rowsForFeature('logos').length).toBe(23 + 2);
    /* the vector round's logos.export.svgblip is the feature's 23rd row and not ship one's */
    const shipLogos = ship.filter((row) => row.feature === 'logos');
    expect(shipLogos.length).toBe(22);
    for (const row of shipLogos) expect(row.today, row.id).toBe('not driven');
    /* every logos row of the ship but the agent row carries parks (4.12) */
    for (const row of shipLogos)
      if (row.id !== 'logos.agent.search-insert') expect(row.parks, row.id).toBeDefined();
  });

  it('carries the export and intake rows of the logos area under their unparkable features', () => {
    expect(ROW_FEATURE).toEqual({
      'logos.export.pdf-pptx-crisp': 'export',
      'logos.intake.url-sentence': 'images',
      'shaders.export.pdf-frame': 'export',
      'shaders.export.pptx-frame': 'export',
      'shaders.export.html-frame': 'export',
      'shaders.export.missing-frame-row': 'export',
      'shaders.view.play-setting': 'view',
      /* the people round (docs/PEOPLE.md 6.1): two rows of the people area under comments and versions */
      'people.comment-departed-guest': 'comments',
      'people.versions-author-account': 'versions',
    });
    expect(isCoreId('logos.intake.svg-sentence'), 'retired in the vector round (4.7)').toBe(false);
    for (const [id, feature] of Object.entries(ROW_FEATURE)) {
      expect(coreRow(id).feature).toBe(feature);
      /* every exception but the View row lands on an unparkable feature; the View row parks its own control */
      if (id !== 'shaders.view.play-setting') expect(isParkable(feature), id).toBe(false);
      else expect(coreRow(id).parks, id).toEqual(['tools.preferences.playShaders']);
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
      { id: 'logos.picker.search', parks: ['insert.image.logo'], result: 'failed' },
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
          { id: 'logos.insert.row', parks: ['insert.image.logo'] },
          { id: 'charts.double-click.opens-data', parks: ['bar.chart.editData'] },
        ],
      }),
    );
    expect(parkedControlsOf(readParkedList(list))).toEqual([
      'bar.chart.editData',
      'dialog.logo.everySlide',
      'insert.image.logo',
    ]);
    const check = emitParked(list, { out: module, check: true });
    expect(check.changed).toBe(true);
    expect(readFileSync(module, 'utf8')).toContain('new Set<string>([]);');
    const written = emitParked(list, { out: module });
    expect(written.changed).toBe(true);
    const text = readFileSync(module, 'utf8');
    expect(text).toContain(
      "  'bar.chart.editData',\n  'dialog.logo.everySlide',\n  'insert.image.logo',\n]);",
    );
    expect(text).toContain('from ship-abc1234.json; 3 controls');
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
    /* the polish round adds three rows to the shaders spec (docs/POLISH.md 2.5) */
    expect(rowsForDriver('core/shaders.spec.ts').length).toBe(10 + 3);
    expect(ship.length).toBe(29);
    expect(ship.filter((row) => row.note.startsWith('Ship two P0')).length).toBe(22);
    expect(ship.filter((row) => row.note.startsWith('Ship two P1')).length).toBe(7);
    expect(ship.filter((row) => row.driver === PROBE_DRIVER).length).toBe(14);
    /* the shaders feature holds the 24 rows whose area and feature agree; the export rows and the
       View row count under their own features */
    /* the polish round adds three shaders rows (docs/POLISH.md 2.5 items 36, 47, 48) */
    expect(rowsForFeature('shaders').length).toBe(24 + 3);
    expect(ship.filter((row) => row.feature === 'export').length).toBe(4);
    expect(ship.filter((row) => row.feature === 'view').length).toBe(1);
    expect(ship.filter((row) => row.today === 'broken').length).toBe(11);
    expect(ship.filter((row) => row.today === 'not driven').length).toBe(18);
    /* every shaders row but the agent row carries parks (5.10); the export rows carry none and
       block the ship, the measurement row carries none and never holds it */
    /* the polish round's three shaders rows (docs/POLISH.md 2.5) carry none: a red one parks the library */
    for (const row of ship.filter((r) => r.feature === 'shaders'))
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
      {
        id: 'shaders.view.play-setting',
        parks: ['tools.preferences.playShaders'],
        result: 'not driven',
      },
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
      'tools.preferences.playShaders',
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
          { id: 'shaders.view.play-setting', parks: ['tools.preferences.playShaders'] },
          { id: 'shaders.background.place-answers', parks: ['dialog.background.shader'] },
        ],
      }),
    );
    expect(emitParked(list, { out: module }).controls).toEqual([
      'dialog.background.shader',
      'formatOptions.shader.preset',
      'tools.preferences.playShaders',
    ]);
    expect(readFileSync(module, 'utf8')).toContain('from ship-def5678.json; 3 controls');
  });
});

describe('the vector round (docs/VECTOR.md section 6)', () => {
  const vector = CORE_MATRIX.filter((row) => /^Vector round;/.test(row.note ?? ''));
  const good = {
    id: 'menus.icons.insert-rows',
    feature: 'chrome',
    interaction: 'x',
    driver: 'probe --core',
    today: 'works',
    evidence: 'e',
  };

  it('holds the svg feature, the menus area under chrome, the svg spec and the 43 added rows', () => {
    expect(CORE_FEATURES).toContain('svg');
    expect(isParkable('svg')).toBe(true);
    /* the people round (docs/PEOPLE.md 6.1) added the people area under share */
    expect(AREA_FEATURE).toEqual({
      /* the realtime round (docs/REALTIME.md 4.4): the Google sign in rows are the share feature's */
      accounts: 'share',
      collab: 'share',
      menus: 'chrome',
      gestures: 'arrange',
      people: 'share',
    });
    expect(CORE_SPEC_DRIVERS).toContain('core/svg.spec.ts');
    /* the polish round adds two rows to the svg spec (docs/POLISH.md 2.4, 2.5) */
    expect(rowsForDriver('core/svg.spec.ts').length).toBe(12 + 2);
    expect(rowsForDriver('svg.spec.ts')).toEqual(rowsForDriver('core/svg.spec.ts'));
    /* 43 rows added and the named rows row extended, so 44 carry the note */
    expect(vector.length).toBe(44);
    expect(vector.filter((row) => row.id === 'shapes.insert.named-rows').length).toBe(1);
    /* the polish round adds two svg rows (docs/POLISH.md 2.4 item 32, 2.5 item 50) */
    expect(rowsForFeature('svg').length).toBe(16 + 2);
    /* 23 shapes rows added plus the extended named rows row */
    expect(vector.filter((row) => row.feature === 'shapes').length).toBe(24);
    expect(CORE_MATRIX.filter((row) => areaOf(row.id) === 'menus').map((row) => row.id)).toEqual([
      'menus.icons.insert-rows',
      'menus.icons.format-rows',
      'menus.icons.one-family',
      /* the polish round (docs/POLISH.md 2.6 item 57): a glyph on every row */
      'menus.rows.icon-on-every-row',
    ]);
    for (const row of CORE_MATRIX.filter((row) => areaOf(row.id) === 'menus'))
      expect(row.feature, row.id).toBe('chrome');
    /* every svg row parks one or more of the six ids of 4.8, never the feature whole */
    for (const row of rowsForFeature('svg')) {
      expect(row.parks, row.id).toBeDefined();
      for (const control of row.parks)
        expect(control, row.id).toMatch(
          /^(intake\.svg\.|picture\.svg\.copy$|export\.svg\.vector$)/,
        );
    }
    expect(coreRow('logos.export.svgblip').parks).toEqual(['export.svg.vector']);
    /* the gallery rows park their category row alone; the three core rows carry none */
    for (const id of [
      'shapes.geometry.pinned-three',
      'shapes.geometry.text-rect',
      'shapes.icons.named-rows',
      'shapes.insert.named-rows',
    ])
      expect(coreRow(id).parks, id).toBeUndefined();
    expect(coreRow('shapes.insert.grid-arrows').parks).toEqual(['insert.shape.arrows']);
    expect(coreRow('shapes.geometry.shapes.hexagon-sheet').parks).toEqual(['insert.shape.gallery']);
    /* today as the tree and the audits show on 2026-09-24 */
    expect(coreRow('svg.import.upload').today).toBe('broken');
    expect(coreRow('svg.import.upload').severity).toBe(3);
    expect(coreRow('shapes.icons.named-rows').severity).toBe(1);
    expect(coreRow('menus.icons.one-family').today).toBe('works');
    expect(coreRow('shapes.geometry.pinned-three').today).toBe('works');
  });

  it("reads a menus row as the chrome's and refuses the area as a feature", () => {
    expect(() => validateCoreMatrix([good])).not.toThrow();
    expect(() => validateCoreMatrix([{ ...good, feature: 'menus' }])).toThrow(
      /unknown feature menus/,
    );
    expect(() => validateCoreMatrix([{ ...good, feature: 'svg' }])).toThrow(
      /area menus belongs to chrome, not svg/,
    );
    const results = {};
    for (const id of CORE_IDS) results[id] = 'passed';
    /* a red icon row blocks the ship (chrome is unparkable) */
    const run = parkedFeaturesOf({ ...results, 'menus.icons.insert-rows': 'failed' });
    expect(run.parked).toEqual([]);
    expect(run.blocking).toEqual([
      { id: 'menus.icons.insert-rows', feature: 'chrome', result: 'failed' },
    ]);
    /* a red svg row parks its controls alone; a red gallery row parks its category row alone */
    const svg = parkedFeaturesOf({
      ...results,
      'svg.import.paste-markup': 'failed',
      'shapes.insert.grid-arrows': 'not driven',
    });
    expect(svg.parked).toEqual([]);
    expect(svg.blocking).toEqual([]);
    expect(svg.parkedRows).toEqual([
      { id: 'shapes.insert.grid-arrows', parks: ['insert.shape.arrows'], result: 'not driven' },
      { id: 'svg.import.paste-markup', parks: ['intake.svg.paste'], result: 'failed' },
    ]);
    expect(() => shipVerdict(results, ['svg'])).not.toThrow();
  });

  it('knows the six declared ids of VECTOR.md 4.8 and writes them into the parked set from a run', () => {
    for (const id of [
      'intake.svg.upload',
      'intake.svg.paste',
      'intake.svg.drop',
      'intake.svg.url',
      'picture.svg.copy',
      'export.svg.vector',
    ]) {
      expect(DECLARED_CONTROL_IDS).toContain(id);
      expect(isKnownControl(id), id).toBe(true);
    }
    const dir = mkdtempSync(join(tmpdir(), 'core-matrix-vector-'));
    const module = join(dir, 'parked-controls.ts');
    writeFileSync(
      module,
      `// B1's module\n${PARKED_BEGIN}\nexport const PARKED_CONTROLS: ReadonlySet<string> = new Set<string>([]);\n${PARKED_END}\n`,
    );
    /* a fixture run: the paste rows red, the rest green; the ship's list is rendered from it */
    const results = {};
    for (const id of CORE_IDS) results[id] = 'passed';
    const run = parkedFeaturesOf({
      ...results,
      'svg.import.paste-file': 'failed',
      'svg.import.paste-markup': 'not driven',
    });
    const list = join(dir, 'ship-vector.json');
    writeFileSync(
      list,
      JSON.stringify({
        commit: 'abc1234',
        parkedFeatures: run.parked,
        parkedRows: run.parkedRows.map(({ id, parks }) => ({ id, parks })),
      }),
    );
    expect(parkedControlsOf(readParkedList(list))).toEqual(['intake.svg.paste']);
    const written = emitParked(list, { out: module });
    expect(written.controls).toEqual(['intake.svg.paste']);
    expect(readFileSync(module, 'utf8')).toContain("  'intake.svg.paste',\n]);");
    expect(emitParked(list, { out: module, check: true }).changed).toBe(false);
  });
});

// The objects round (docs/OBJECTS.md section 6, 6.1): the gestures area whose rows are the arrange
// feature's (unparkable), the 33 rows added and the five carried, each carrying the round in its
// note; the frame rows' setup writes; the carried tables rows keep their parks.
describe('the objects round (docs/OBJECTS.md section 6)', () => {
  const objects = CORE_MATRIX.filter((row) =>
    /Objects round; docs\/OBJECTS\.md/.test(row.note ?? ''),
  );

  it('maps the gestures area to arrange, which cannot be parked', () => {
    expect(AREA_FEATURE.gestures).toBe('arrange');
    expect(isParkable('arrange')).toBe(false);
    const gestures = CORE_MATRIX.filter((row) => areaOf(row.id) === 'gestures');
    expect(gestures.length).toBe(19);
    for (const row of gestures) {
      expect(row.feature, row.id).toBe('arrange');
      expect(row.driver, row.id).toBe(PROBE_DRIVER);
      expect(row.parks, row.id).toBeUndefined();
    }
    expect(
      validateCoreMatrix([
        {
          id: 'gestures.draw.x',
          feature: 'arrange',
          interaction: 'x',
          driver: 'probe --core',
          today: 'works',
          evidence: 'e',
        },
      ]),
    ).toHaveLength(1);
    expect(() =>
      validateCoreMatrix([
        {
          id: 'gestures.draw.x',
          feature: 'shapes',
          interaction: 'x',
          driver: 'probe --core',
          today: 'works',
          evidence: 'e',
        },
      ]),
    ).toThrow(/area gestures belongs to arrange, not shapes/);
  });

  it('holds the 33 added rows and the five carried ones with the round in their notes', () => {
    expect(objects.length).toBe(38);
    const byArea = {};
    for (const row of objects) byArea[areaOf(row.id)] = (byArea[areaOf(row.id)] ?? 0) + 1;
    expect(byArea).toEqual({
      gestures: 19,
      tables: 15,
      charts: 1,
      diagrams: 1,
      wordart: 1,
      lines: 1,
    });
    for (const id of [
      'tables.seam.row-drag',
      'tables.edge.add-row-column',
      'tables.heads.select-row-column',
      /* the polish round replaced tables.cells.prompt-hovered-only with tables.cells.no-prompt
         (docs/POLISH.md 2.1 item 1); the new row keeps the objects round in its note */
      'tables.cells.no-prompt',
      'wordart.tail.fill-outline',
    ])
      expect(
        objects.some((row) => row.id === id),
        id,
      ).toBe(true);
    /* the carried P1 rows and the new header toggle keep their parks on the declared families */
    expect(coreRow('tables.heads.header-toggle').parks).toEqual(['handle.table.head.row']);
    expect(coreRow('tables.seam.row-drag').parks).toEqual(['handle.table.row']);
    expect(coreRow('tables.show.rules-only').driver).toBe('core/export.spec.ts');
    /* every frame row reads the window API field the integrator lands by B1's request */
    for (const id of ['gestures.frame.one-render-per-frame', 'gestures.frame.cost-budget'])
      expect(coreRow(id).interaction).toContain('describe().state.gesture');
    /* a broken row of the round carries the severity its item's value gives */
    for (const row of objects.filter((r) => r.today === 'broken'))
      expect([1, 2, 3], row.id).toContain(row.severity);
  });
});

describe('the polish round (docs/POLISH.md section 5)', () => {
  const polish = CORE_MATRIX.filter((row) => /Polish round; docs\/POLISH\.md/.test(row.note ?? ''));

  it('holds the 130 rows of 5.1 with the round, the item and the lane in their notes', () => {
    /* 130 new rows plus the six carried rows whose notes gained the round */
    expect(polish.length).toBe(136);
    const carried = [
      'assist.viewer.disabled',
      'decks.home.seller-lead',
      'decks.home.your-presentations',
      'images.insert.upload',
      'shaders.export.missing-frame-row',
      'sync.viewer.live-updates',
    ];
    for (const id of carried)
      expect(
        polish.some((row) => row.id === id),
        id,
      ).toBe(true);
    expect(polish.filter((row) => !carried.includes(row.id)).length).toBe(130);
    expect(isCoreId('tables.cells.prompt-hovered-only')).toBe(false);
    expect(coreRow('tables.cells.no-prompt').driver).toBe(PROBE_DRIVER);
    /* every new row names its item or the home page's section */
    for (const row of polish)
      expect(row.note, row.id).toMatch(/docs\/POLISH\.md (?:2\.\d+ item \d+|3\.\d|5\.1|section 0)/);
    /* a broken row carries its item's severity; a not driven row none */
    for (const row of polish) {
      if (row.today === 'broken' || row.today === 'flaky')
        expect([1, 2, 3], row.id).toContain(row.severity);
      else expect(row.severity, row.id).toBeUndefined();
    }
  });

  it('keeps the areas of the round under their features and the two parks rows on known ids', () => {
    expect(coreRow('menus.rows.icon-on-every-row').feature).toBe('chrome');
    for (const id of [
      'collab.follow.anonymous-editor',
      'collab.presence.join-within-2s',
      'collab.polish.session-sweep',
    ])
      expect(coreRow(id).feature, id).toBe('share');
    expect(coreRow('shaders.export.missing-frame-row').feature).toBe('export');
    expect(coreRow('images.panel.drop-shadow').parks).toEqual(['formatOptions.picture.shadow']);
    expect(DECLARED_CONTROL_IDS).toContain('formatOptions.picture.shadow');
    expect(coreRow('collab.follow.anonymous-editor').parks).toEqual(['title.presence.follow']);
    /* the one measurement row of the round records its numbers and never holds the ship */
    expect(isMeasureRow(coreRow('decks.home.load-budget'))).toBe(true);
    const { measured, blocking } = parkedFeaturesOf({ 'decks.home.load-budget': 'failed' }, [
      coreRow('decks.home.load-budget'),
    ]);
    expect(measured.map((m) => m.id)).toEqual(['decks.home.load-budget']);
    expect(blocking).toEqual([]);
    /* a row the table names with two drivers carries the spec that reads the file or the show */
    expect(coreRow('tables.header.rule-with-text').driver).toBe('core/export.spec.ts');
    expect(coreRow('charts.labels.fit-slot').driver).toBe('core/export.spec.ts');
    expect(coreRow('images.picture.no-plate').driver).toBe('core/logos.spec.ts');
    expect(coreRow('decks.polish.pages-sweep').driver).toBe('core/decks.spec.ts');
    /* the surface row of section 0 reads the build's commit on the gate's origin */
    expect(coreRow('surface.domain.build-commit').driver).toBe('core/surface.spec.ts');
    expect(coreRow('surface.domain.build-commit').feature).toBe('surface');
  });
});

describe('the people round (docs/PEOPLE.md section 6)', () => {
  /* the 21 added rows; the two carried rows (versions.panel.author-you, share.dialog.you-label)
     name the round in their note too and are read apart below */
  const carried = ['versions.panel.author-you', 'share.dialog.you-label'];
  const people = CORE_MATRIX.filter(
    (row) => /^People round;/.test(row.note ?? '') && !carried.includes(row.id),
  );

  it('holds the 21 rows under the people area, the versions and comments features and the local driver', () => {
    expect(people.length).toBe(21);
    expect(AREA_FEATURE.people).toBe('share');
    expect(isParkable('share')).toBe(false);
    expect(ROW_FEATURE['people.comment-departed-guest']).toBe('comments');
    expect(ROW_FEATURE['people.versions-author-account']).toBe('versions');
    for (const row of CORE_MATRIX.filter((each) => areaOf(each.id) === 'people'))
      expect(row.feature, row.id).toBe(ROW_FEATURE[row.id] ?? 'share');
    expect(people.filter((row) => row.driver === PROBE_DRIVER).length).toBe(7);
    expect(people.filter((row) => row.driver === 'core/share.spec.ts').length).toBe(4);
    expect(people.filter(isLocalRow).length).toBe(10);
    /* the realtime round adds the five accounts rows after these ten (its own block below) */
    expect(
      localRows()
        .map((row) => row.id)
        .filter((id) => !id.startsWith('accounts.')),
    ).toEqual([
      'people.verified-badge',
      'people.versions-author-account',
      'people.labels-disambiguated',
      'share.dialog.grant-email-line',
      'people.avatar-upload',
      'people.avatar-cap-refusal',
      'people.avatar-rotation',
      'people.avatar-fallback-plate',
      'people.avatar-link-visitor',
      'people.avatar-metadata-stripped',
    ]);
    /* every local row is not driven today: production holds no account (6.1) */
    for (const row of localRows()) expect(row.today, row.id).toBe('not driven');
    for (const row of localRows().slice(0, 10)) expect(row.id).not.toMatch(/^accounts\./);
    /* the picture rows and the two own chip rows carry parks (6.1); every other people row parks nothing */
    const picture = ['dialog.avatarBuilder.panel.picture', 'dialog.avatarBuilder.file'];
    for (const id of [
      'people.avatar-upload',
      'people.avatar-cap-refusal',
      'people.avatar-rotation',
      'people.avatar-fallback-plate',
      'people.avatar-metadata-stripped',
    ])
      expect(coreRow(id).parks, id).toEqual(picture);
    expect(coreRow('people.own-chip-follows-name').parks).toEqual([
      'title.account',
      'title.presence.me',
    ]);
    expect(coreRow('people.own-chip-follows-avatar').parks).toEqual(['title.account.changeAvatar']);
    for (const row of people)
      if (
        !/^people\.(avatar-(upload|cap-refusal|rotation|fallback-plate|metadata-stripped)|own-chip-follows-(name|avatar))$/.test(
          row.id,
        )
      )
        expect(row.parks, row.id).toBeUndefined();
    /* the two carried rows name the round */
    expect(coreRow('versions.panel.author-you').note).toContain(
      'People round; docs/PEOPLE.md 3.11',
    );
    expect(coreRow('share.dialog.you-label').note).toContain('People round; docs/PEOPLE.md 3.11');
    /* the declared ids of PEOPLE.md 5.2 are known before the lanes' files hold them */
    for (const id of [
      'dialog.avatarBuilder.panel.picture',
      'version.restore',
      'dialog.share.row.email',
    ])
      expect(isKnownControl(id), id).toBe(true);
  });

  it('lists a local row absent from a run apart, never as passed and never as a reason to park, and judges a recorded one like any row', () => {
    const results = {};
    for (const row of CORE_MATRIX) if (!isLocalRow(row)) results[row.id] = 'passed';
    /* a deployment run: no local row recorded */
    const run = parkedFeaturesOf(results);
    expect(run.parked).toEqual([]);
    expect(run.blocking).toEqual([]);
    expect(run.parkedRows).toEqual([]);
    expect(run.local.map((row) => row.id)).toEqual(localRows().map((row) => row.id));
    for (const row of run.local) expect(row.reason).toBe('no identity database on this base');
    const verdict = shipVerdict(results);
    expect(verdict.ok).toBe(true);
    expect(verdict.failures).toEqual([]);
    expect(verdict.local.map((row) => row.id)).toEqual(localRows().map((row) => row.id));
    /* the accounts run: a recorded local row is judged; a red one without parks blocks share, a
       red picture row parks its controls alone */
    const badge = 'people.verified-badge';
    const upload = 'people.avatar-upload';
    const local = { ...results, [badge]: 'failed', [upload]: 'not driven' };
    const judged = parkedFeaturesOf(local);
    expect(judged.local.map((row) => row.id)).toEqual(
      localRows()
        .map((row) => row.id)
        .filter((id) => id !== badge && id !== upload),
    );
    expect(judged.blocking).toEqual([{ id: badge, feature: 'share', result: 'failed' }]);
    expect(judged.parkedRows).toEqual([
      {
        id: upload,
        parks: ['dialog.avatarBuilder.panel.picture', 'dialog.avatarBuilder.file'],
        result: 'not driven',
      },
    ]);
    expect(judged.parked).toEqual([]);
    const red = shipVerdict(local);
    expect(red.ok).toBe(false);
    expect(red.failures.map((f) => f.id)).toEqual([badge, upload]);
    /* narrowed to the local rows alone (the gate's --only accounts) the reading is the same, and
       the eight local rows this run did not record stay listed apart */
    const narrowed = shipVerdict(local, [], localRows());
    expect(narrowed.failures.map((f) => f.id)).toEqual([badge, upload]);
    expect(narrowed.local.map((row) => row.id)).toEqual(
      localRows()
        .map((row) => row.id)
        .filter((id) => id !== badge && id !== upload),
    );
    /* every local row recorded: nothing listed apart */
    const all = { ...results };
    for (const row of localRows()) all[row.id] = 'passed';
    expect(shipVerdict(all, [], localRows())).toEqual({
      ok: true,
      failures: [],
      measured: [],
      local: [],
    });
  });
});

describe('the realtime round (docs/REALTIME.md section 2)', () => {
  const realtime = CORE_MATRIX.filter((row) => /^Realtime round;/.test(row.note ?? ''));
  const REALTIME_IDS = [
    'realtime.keystroke.within-300ms',
    'realtime.caret.within-300ms',
    'realtime.caret.offset-after-merge',
    'realtime.selection.outline-within-300ms',
    'realtime.block.drag-live',
    'realtime.title.two-typers',
    'realtime.join.chip-within-1s',
    'realtime.follow.for-everyone',
    'realtime.agent.write-announced',
    'realtime.share-link.every-instance',
    'realtime.reload.loses-nothing',
    'realtime.reconnect.loses-nothing',
    'realtime.pointer.second-browser',
    'realtime.caret.dims-and-leaves',
    'realtime.card.chip-painted',
    'realtime.departed-guest.name-stable',
  ];
  const ACCOUNTS_IDS = [
    'accounts.google-button',
    'accounts.google-leaves',
    'accounts.google-error-sentence',
    'accounts.email-hidden-without-mail',
    'accounts.google-roundtrip',
  ];

  it('holds the sixteen realtime rows under the unparkable feature, the cost row and the five local accounts rows', () => {
    expect(CORE_FEATURES).toContain('realtime');
    expect(UNPARKABLE_FEATURES).toContain('realtime');
    expect(isParkable('realtime')).toBe(false);
    expect(rowsForFeature('realtime').map((row) => row.id)).toEqual(REALTIME_IDS);
    expect(AREA_FEATURE.accounts).toBe('share');
    for (const id of ACCOUNTS_IDS) expect(coreRow(id).feature).toBe('share');
    expect(
      localRows()
        .map((row) => row.id)
        .slice(-5),
    ).toEqual(ACCOUNTS_IDS);
    /* the drivers: the two browser spec, the share spec's two rows, the agent surface's spec and
       the walk's presence area; every row has a driver the gate runs (FOCUS.md 6.1) */
    expect(CORE_SPEC_DRIVERS).toContain('core/realtime.spec.ts');
    expect(CORE_SPEC_DRIVERS).toContain('e2e/agent-http.spec.ts');
    /* twelve realtime rows and, since the Cloudflare phase, the setup row setup.do.two-instances */
    expect(rowsForDriver('core/realtime.spec.ts').length).toBe(12 + 1);
    expect(
      rowsForDriver('core/realtime.spec.ts').filter((r) => r.feature === 'realtime').length,
    ).toBe(12);
    expect(rowsForDriver('realtime.spec.ts')).toEqual(rowsForDriver('core/realtime.spec.ts'));
    expect(rowsForDriver('e2e/agent-http.spec.ts').map((row) => row.id)).toEqual([
      'realtime.agent.write-announced',
    ]);
    expect(
      rowsForDriver('core/share.spec.ts')
        .filter((row) => row.feature === 'realtime')
        .map((row) => row.id),
    ).toEqual(['realtime.share-link.every-instance', 'realtime.departed-guest.name-stable']);
    expect(coreRow('realtime.card.chip-painted').driver).toBe(PROBE_DRIVER);
    expect(specPathOf('core/realtime.spec.ts')).toBe('apps/studio/e2e/core/realtime.spec.ts');
    expect(specPathOf('e2e/agent-http.spec.ts')).toBe('apps/studio/e2e/agent-http.spec.ts');
    expect(() => specPathOf('probe --core')).toThrow(RangeError);
    /* the agent row's spec is not a local driver: it runs on every base */
    expect(isLocalRow(coreRow('realtime.agent.write-announced'))).toBe(false);
    /* today as the audits measured production on 2026-09-28 to 2026-10-01 */
    expect(coreRow('realtime.keystroke.within-300ms').today).toBe('broken');
    expect(coreRow('realtime.keystroke.within-300ms').severity).toBe(3);
    expect(coreRow('realtime.follow.for-everyone').today).toBe('not driven');
    expect(coreRow('realtime.reload.loses-nothing').today).toBe('works');
    expect(coreRow('realtime.share-link.every-instance').today).toBe('flaky');
    /* no realtime row carries parks: the feature is unparkable and a red row blocks */
    for (const row of rowsForFeature('realtime')) expect(row.parks, row.id).toBeUndefined();
    /* the cost row is a measurement row of the cost probe with the Redis ceiling in its text */
    const redis = coreRow('cost.redis.commands');
    expect(isCostRow(redis)).toBe(true);
    expect(isMeasureRow(redis)).toBe(true);
    expect(redis.today).toBe('not driven');
    expect(redis.interaction).toContain('12,000 Redis commands');
    /* the three cost rows of the sync round restate their store ceilings for the redis tier */
    expect(coreRow('cost.editor-idle.calls').interaction).toContain('10 simple and 2 advanced');
    /* the Cloudflare phase restated the redis editing column from the counters (docs/CLOUDFLARE.md 2.2) */
    expect(coreRow('cost.editor-editing.calls').interaction).toContain('40 simple and 65 advanced');
    expect(coreRow('cost.two-tabs-idle.calls').interaction).toContain(
      'restated for the redis tier at 2',
    );
    /* the round's rows name it in their notes: the 22 added */
    expect(realtime.length).toBe(22);
    /* the round trip is the one manual row of the round */
    expect(isManualRow(coreRow('accounts.google-roundtrip'))).toBe(true);
    for (const id of ACCOUNTS_IDS)
      if (id !== 'accounts.google-roundtrip') expect(isManualRow(coreRow(id)), id).toBe(false);
    /* the declared ids of REALTIME.md 5.2 are known before the lanes' files hold them */
    for (const id of [
      'view.livePointers.others',
      'view.livePointers.collaborators',
      'dialog.signIn.google',
    ])
      expect(isKnownControl(id), id).toBe(true);
  });

  it('blocks the ship on a red realtime row and records a red Redis command row', () => {
    const results = {};
    for (const row of CORE_MATRIX) if (!isLocalRow(row)) results[row.id] = 'passed';
    const run = parkedFeaturesOf({
      ...results,
      'realtime.keystroke.within-300ms': 'failed',
      'realtime.follow.for-everyone': 'not driven',
      'cost.redis.commands': 'failed',
    });
    expect(run.parked).toEqual([]);
    expect(run.blocking).toEqual([
      { id: 'realtime.keystroke.within-300ms', feature: 'realtime', result: 'failed' },
      { id: 'realtime.follow.for-everyone', feature: 'realtime', result: 'not driven' },
    ]);
    expect(run.measured).toEqual([
      { id: 'cost.redis.commands', feature: 'cost', result: 'failed' },
    ]);
    /* the five accounts rows are listed apart on a deployment run like the people round's ten */
    expect(run.local.map((row) => row.id).slice(-5)).toEqual(ACCOUNTS_IDS);
    expect(() => shipVerdict(results, ['realtime'])).toThrow(/realtime cannot be parked/);
    const verdict = shipVerdict({ ...results, 'realtime.card.chip-painted': 'failed' });
    expect(verdict.ok).toBe(false);
    expect(verdict.failures).toEqual([
      { id: 'realtime.card.chip-painted', feature: 'realtime', result: 'failed' },
    ]);
  });
});

describe('the Cloudflare phase of the realtime round (docs/CLOUDFLARE.md section 2)', () => {
  const DO_COST_IDS = [
    'cost.do.requests',
    'cost.do.duration',
    'cost.do.rows-written',
    'cost.d1.reads',
    'cost.d1.writes',
    'cost.worker.requests',
  ];
  const SETUP_IDS = [
    'setup.worker.health',
    'setup.do.two-instances',
    'setup.free-plan.caps',
    'setup.do.memory',
  ];

  it('holds the six cost rows per product as measurement rows of the cost probe with their ceilings in their texts', () => {
    for (const id of DO_COST_IDS) {
      const row = coreRow(id);
      expect(row.feature, id).toBe('cost');
      expect(isCostRow(row), id).toBe(true);
      expect(isMeasureRow(row), id).toBe(true);
      expect(row.today, id).toBe('not driven');
      expect(row.note, id).toMatch(/^Cloudflare phase; docs\/CLOUDFLARE\.md 2\.2/);
    }
    expect(coreRow('cost.do.requests').interaction).toContain(
      'at most 300 Durable Object request units',
    );
    expect(coreRow('cost.do.duration').interaction).toContain('at most 20 GB-s');
    expect(coreRow('cost.do.rows-written').interaction).toContain('at most 800 rows written');
    expect(coreRow('cost.d1.reads').interaction).toContain('at most 300 D1 rows read');
    expect(coreRow('cost.d1.writes').interaction).toContain('at most 20 D1 rows written');
    expect(coreRow('cost.worker.requests').interaction).toContain(
      'at most 90 requests to the Worker',
    );
    /* the three store rows of the sync round carry their do tier column */
    expect(coreRow('cost.editor-idle.calls').interaction).toContain(
      'on the do tier at most 1 function request a minute',
    );
    expect(coreRow('cost.editor-editing.calls').interaction).toContain(
      'at most 20 object request units a minute and at most 60 rows written a minute',
    );
    expect(coreRow('cost.two-tabs-idle.calls').interaction).toContain(
      'on the do tier no list, at most 2 advanced and 0 object requests',
    );
    /* the Redis row stays for the redis tier */
    expect(coreRow('cost.redis.commands').note).toContain('not driven on do');
  });

  it("holds the four setup rows under the unparkable feature setup, the do tier's, with the gate as the driver of three", () => {
    expect(CORE_FEATURES).toContain('setup');
    expect(UNPARKABLE_FEATURES).toContain('setup');
    expect(isParkable('setup')).toBe(false);
    expect(rowsForFeature('setup').map((row) => row.id)).toEqual(SETUP_IDS);
    expect(CORE_DRIVERS).toContain(GATE_DRIVER);
    expect(GATE_DRIVER).toBe('core-gate');
    expect(gateRows().map((row) => row.id)).toEqual([
      'setup.worker.health',
      'setup.free-plan.caps',
      'setup.do.memory',
    ]);
    expect(rowsForDriver('core-gate')).toEqual(gateRows());
    for (const row of gateRows()) expect(isGateRow(row), row.id).toBe(true);
    expect(isGateRow(coreRow('setup.do.two-instances'))).toBe(false);
    expect(coreRow('setup.do.two-instances').driver).toBe('core/realtime.spec.ts');
    expect(coreRow('setup.do.two-instances').setup).toBe('block.insert of the two body blocks');
    /* the two hand rows: the dashboard's figures and the verifier's reading, recorded by the gate */
    expect(isManualRow(coreRow('setup.free-plan.caps'))).toBe(true);
    expect(isManualRow(coreRow('setup.do.memory'))).toBe(true);
    expect(isManualRow(coreRow('setup.worker.health'))).toBe(false);
    expect(isManualRow(coreRow('setup.do.two-instances'))).toBe(false);
    for (const id of SETUP_IDS) {
      expect(coreRow(id).today, id).toBe('not driven');
      expect(coreRow(id).parks, id).toBeUndefined();
      expect(coreRow(id).note, id).toMatch(/^Cloudflare phase; docs\/CLOUDFLARE\.md 2\.3/);
    }
    expect(coreRow('setup.worker.health').interaction).toContain('within 2 s');
    expect(coreRow('setup.free-plan.caps').interaction).toContain(
      'under 10,000 requests and under 20,000 rows written',
    );
  });

  it("reads the setup rows as the do tier's (TIER_FEATURES), judged there and listed apart elsewhere", () => {
    expect(TIER_FEATURES).toEqual({ setup: 'do' });
    expect(tierOfFeature('setup')).toBe('do');
    expect(tierOfFeature('realtime')).toBeNull();
    expect(tierOfFeature('nothing')).toBeNull();
    expect(tierRows().map((row) => row.id)).toEqual(SETUP_IDS);
    expect(tierRows('do')).toEqual(tierRows());
    expect(tierRows('blob')).toEqual([]);
    for (const row of tierRows()) expect(isTierRow(row), row.id).toBe(true);
    expect(isTierRow(coreRow('realtime.join.chip-within-1s'))).toBe(false);
    expect(isTierRow(undefined)).toBe(false);
    expect(tierAbsentReason(coreRow('setup.worker.health'), 'blob')).toBe(
      "a do tier row; this run's tier is blob",
    );
    expect(tierAbsentReason(coreRow('setup.worker.health'), null)).toBe(
      "a do tier row; this run's tier is not named (no --tier)",
    );
    /* the two ship helpers know nothing of tiers: on the do tier a red setup row blocks like any
       unparkable row, and the gate narrows its judged rows on another tier (core-gate.mjs) */
    const results = {};
    for (const row of CORE_MATRIX) if (!isLocalRow(row)) results[row.id] = 'passed';
    const run = parkedFeaturesOf({ ...results, 'setup.worker.health': 'failed' });
    expect(run.parked).toEqual([]);
    expect(run.blocking).toEqual([
      { id: 'setup.worker.health', feature: 'setup', result: 'failed' },
    ]);
    expect(() => shipVerdict(results, ['setup'])).toThrow(/setup cannot be parked/);
    /* a not driven hand row of setup is the checklist's, never blocking (ruling (3)) */
    const hand = shipVerdict({ ...results, 'setup.do.memory': 'not driven' });
    expect(hand.ok).toBe(true);
    /* the judged rows of a run on another tier leave the setup rows out and the verdict holds */
    const judged = CORE_MATRIX.filter((row) => !isTierRow(row));
    const { 'setup.worker.health': _h, 'setup.do.two-instances': _t, ...without } = results;
    expect(shipVerdict(without, [], judged).ok).toBe(true);
    expect(shipVerdict(without, []).failures.map((f) => f.id)).toEqual([
      'setup.worker.health',
      'setup.do.two-instances',
    ]);
  });
});
