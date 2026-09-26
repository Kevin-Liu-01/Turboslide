#!/usr/bin/env node
// The core test matrix of the focus round as a module (docs/FOCUS.md section 6; the integrator's
// day 0). The data is docs/gslides-parity/focus/core-matrix.json, the one file docs/FOCUS.md is
// rendered from, and this module reads it so the ids exist in one place: the walk probe's --core
// mode (scripts/probes/editor-walk-probe.mjs) and the core specs (apps/studio/e2e/core/*.spec.ts,
// through apps/studio/e2e/core/matrix.ts) import the same list and the same lookups, and a row
// added or renamed in the JSON reaches both without a second edit. The module validates the file
// on load and throws on a malformed row, so a run never drives an id the matrix does not hold.
//
// The id scheme (6): `area.feature.interaction`, lower case letters, digits and hyphens, two to
// four dot separated parts, the first part the area; the `feature` field names the section 2
// feature (`collab.*` rows belong to `share`, the one area that is not a feature). `today` is one
// of the four words of the audits; `severity` sits on broken and flaky rows alone; `driver` is
// the probe or one of the seven spec files; `setup` names a window API write that is never a
// driven step. The two ship helpers at the end compute rule 4 of section 1 and the exit rule of
// 6.2 from a run's results, so the parked list is computed and never typed. The return round
// (docs/RETURN.md section 1 rule 2 and section 5) added the features tables, charts, diagrams,
// wordart, formatting, chrome, view and inbox, the list of unparkable features (a red row of one
// blocks the ship), the `parks` field (the data-control ids a row alone guards, validated against
// the menu model's sources) and the `parkedRows` half of the parked list beside `parkedFeatures`.
// The product round (docs/PRODUCT.md section 8) added the features brand, fonts, templates and
// assist (each parkable), the three spec drivers chrome, brand and assist, the panel and page
// sources the `parks` ids are read from (7.1), the declared ids of PRODUCT.md 7.1 for a control a
// lane has not landed yet, and the `measure` field (8.2): a measurement row records its seconds
// per slide in the run and never holds the ship, so a red one is written into the ship note by
// id with its mechanism and neither parks its feature nor blocks. The sync and costs round
// (docs/SYNC.md section 6) added the two unparkable features `sync` and `cost`, the spec driver
// `core/sync.spec.ts` (two browsers with one person's cookies and a third as a stranger) and the
// driver `cost-probe` (scripts/probes/sync-cost-probe.mjs: one page state per process for three
// minutes, every request the page made and `sync.status.storeCalls` sampled, the counts beside
// the ceiling in the run's JSON); a cost row carries `measure: true` in SYNC.md 6.1's sense (its
// counts are recorded and the row holds the ship only over its ceiling on the preview). The features
// round, ship one (docs/FEATURES.md section 7) added the parkable feature `logos`, the spec driver
// `core/logos.spec.ts`, the dialog, overlay and panel files whose control ids `parks` may name
// (`CONTROL_SOURCE_PATHS`), the ids FEATURES.md declares before the lanes' files exist
// (`DECLARED_CONTROL_IDS`), `ROW_FEATURE` (a row whose id area is a new feature while its measurement
// belongs to an unparkable one carries that feature, so a red export or intake row blocks the ship
// instead of parking the picker) and the `--emit-parked` step, which writes the set of
// packages/chrome/src/parked-controls.ts (B1's module, 7.2) from a ship's `parkedRows`. Ship two
// (docs/FEATURES.md section 5, 7.1) added the parkable feature `shaders`, the spec driver
// `core/shaders.spec.ts`, the shaders area's export rows under `export` and its View row under
// `view` (ROW_FEATURE), the Background dialog among the control sources and the ids FEATURES.md
// 5.3 to 5.6 declare for the gallery, the Shader section and the View row before the lanes' files
// hold them.
// packages/chrome/src/parked-controls.ts (B1's module, 7.2) from a ship's `parkedRows`. The
// vector round (docs/VECTOR.md section 6) added the parkable feature `svg` (the SVG pictures:
// the intake, the sheet, the copy, the sanitizer), the area `menus` whose rows belong to the
// unparkable `chrome` (the icons on the visual rows, 3.2 to 3.4), the spec driver
// `core/svg.spec.ts`, the six control ids of VECTOR.md 4.8 the svg rows' `parks` name before the
// lanes' files hold them (`intake.svg.*`, `picture.svg.copy`, `export.svg.vector`), and retired
// the row `logos.intake.svg-sentence` with its sentence (4.7), so ROW_FEATURE keeps the two
// logos rows whose measurement belongs to export and images.
//
//   node scripts/probes/core-matrix.mjs            prints the counts of 6.3 from the file
//   node scripts/probes/core-matrix.mjs --ids      prints every id, one per line
//   node scripts/probes/core-matrix.mjs --emit-parked docs/gslides-parity/focus/ship-<commit>.json
//     [--out packages/chrome/src/parked-controls.ts] [--check]
//       writes (or with --check compares) the PARKED_CONTROLS set of the module between its two
//       markers from the ship's parkedRows: the union of their `parks`, sorted; an empty set on a
//       preview built before the runs (docs/FEATURES.md 7.2)
//
// Node only, no dependency. Type declarations for the TypeScript callers are in core-matrix.d.mts.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The matrix file docs/FOCUS.md is rendered from. */
export const CORE_MATRIX_PATH = fileURLToPath(
  new URL('../../docs/gslides-parity/focus/core-matrix.json', import.meta.url),
);

/**
 * The section 2 features in the order of the document, plus the switch (section 3), plus the
 * return round's features (docs/RETURN.md section 5): the documents (tables, charts, diagrams,
 * word art), the text and paragraph formatting rows, the chrome (the title row's split button,
 * the separators and the right cluster), the View menu rows and the inbox.
 */
export const CORE_FEATURES = Object.freeze([
  'decks',
  'slides',
  'text',
  'images',
  'arrange',
  'shapes',
  'lines',
  'tables',
  'charts',
  'diagrams',
  'wordart',
  'formatting',
  'present',
  'share',
  'comments',
  'versions',
  'export',
  'help',
  'chrome',
  'view',
  'inbox',
  /* the product round (docs/PRODUCT.md 8.1): the brand kit, the font catalog, the templates and the assist */
  'brand',
  'fonts',
  'templates',
  'assist',
  /* the sync and costs round (docs/SYNC.md 6.1): the write path's order and the calls per state */
  'sync',
  'cost',
  /* the features round, ship one (docs/FEATURES.md 4.12): the logo picker over thesvg.org, parkable */
  'logos',
  /* the features round, ship two (docs/FEATURES.md 5.10): the shader library, parkable; Insert >
     Shader is in the default view on the ship's branch and the run's parked list moves it behind
     Tools > Advanced tools if its rows are red */
  'shaders',
  /* the vector round (docs/VECTOR.md 6.1): the SVG pictures, parkable; its rows park the six
     control ids of 4.8 and never the feature whole */
  'svg',
  'surface',
]);

/**
 * An id's first part that is not a feature name, with the feature its rows belong to: the
 * `collab` rows are the share feature's, and the `menus` rows of the vector round (the icons on
 * the visual rows, docs/VECTOR.md 6.1) are the chrome's, so an icon row is unparkable.
 */
export const AREA_FEATURE = Object.freeze({ collab: 'share', menus: 'chrome' });

/**
 * The rows whose feature is not their id's area (docs/FEATURES.md 7.1): a row of a new feature's
 * area whose measurement belongs to an unparkable feature carries that feature, so a red one blocks
 * the ship instead of parking the new feature. The export row of the logos area is the exporters'
 * (B7, `export`), the two intake rows are the upload's (`images`). Ship two adds the shaders area's
 * four export rows the same way (B7, `export`: the PDF, the Editable PowerPoint, the web page and
 * the report row) and its View row (`view`: View > Play shaders parks its own control through
 * `parks` and never the shader library). Every other row's feature is its area's.
 */
export const ROW_FEATURE = Object.freeze({
  'logos.export.pdf-pptx-crisp': 'export',
  /* `logos.intake.svg-sentence` left with its sentence in the vector round (docs/VECTOR.md 4.7);
     `svg.import.upload` measures the upload under the parkable feature `svg` */
  'logos.intake.url-sentence': 'images',
  'shaders.export.pdf-frame': 'export',
  'shaders.export.pptx-frame': 'export',
  'shaders.export.html-frame': 'export',
  'shaders.export.missing-frame-row': 'export',
  'shaders.view.play-setting': 'view',
});

/** The four words of the audits for what production did; nothing else is a state. */
export const CORE_STATES = Object.freeze(['works', 'broken', 'flaky', 'not driven']);

/** The three results a run records for a driven row (6.2); a step nobody drove is `not driven`. */
export const RUN_RESULTS = Object.freeze(['passed', 'failed', 'not driven']);

/** The walk probe in --core mode. */
export const PROBE_DRIVER = 'probe --core';

/**
 * The cost probe (docs/SYNC.md 6.3): scripts/probes/sync-cost-probe.mjs, run by the gate. It drives
 * one page state per process for three minutes at human speed, records every request the page
 * made, samples `sync.status.storeCalls` five times and writes the counts beside the ceiling.
 */
export const COST_PROBE_DRIVER = 'cost-probe';

/** The Playwright specs under apps/studio/e2e/core/, as the `driver` field spells them. */
export const CORE_SPEC_DRIVERS = Object.freeze([
  'core/decks.spec.ts',
  'core/slides.spec.ts',
  'core/images.spec.ts',
  'core/present.spec.ts',
  'core/share.spec.ts',
  'core/export.spec.ts',
  'core/surface.spec.ts',
  /* the return round (docs/RETURN.md section 5): the clipboard paste into the chart grid */
  'core/documents.spec.ts',
  /* the product round (docs/PRODUCT.md 8.1): the viewport rows at 1440 and 1280, the kit and the
     catalog's file chooser, network and window API rows, the assist panel against the fixture */
  'core/chrome.spec.ts',
  'core/brand.spec.ts',
  'core/assist.spec.ts',
  /* the sync and costs round (docs/SYNC.md 6.1): the two browser spec of the ordering rows */
  'core/sync.spec.ts',
  /* the features round, ship one (docs/FEATURES.md 7.1): the bearer rows, the network rows, the
     fixture upstream rows and the two browser rows of the logo picker */
  'core/logos.spec.ts',
  /* the features round, ship two (docs/FEATURES.md 7.1): the frame rows (the second tab and the
     second context), the reduced motion context, the WebGL rows, the measurement row and the
     agent transports of the shader library */
  'core/shaders.spec.ts',
  /* the vector round (docs/VECTOR.md 6.1): the svg intake by the chooser, a paste, a drop and a
     URL, the sheet at two zooms, the picture gestures, the copy and the sanitizer rows */
  'core/svg.spec.ts',
]);

export const CORE_DRIVERS = Object.freeze([PROBE_DRIVER, ...CORE_SPEC_DRIVERS, COST_PROBE_DRIVER]);

/** `area.feature.interaction`: two to four parts of lower case letters, digits and hyphens. */
export const CORE_ID_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*){1,3}$/;

/**
 * The features that cannot be parked (docs/RETURN.md section 1 rule 2): a feature already in the
 * default view with no flag to hide it. A failed or not driven row of one of them blocks the ship
 * unless the row carries `parks` (below). `surface` (the switch), `chrome` (the title row's split
 * button, separators and right cluster; nothing hides them) and every core feature of FOCUS.md
 * section 2. The parkable features are the rest of CORE_FEATURES: every menu row and control of
 * each carries the `advanced` flag or a stub sentence, so hiding the feature is one flag change.
 */
export const UNPARKABLE_FEATURES = Object.freeze([
  'surface',
  'chrome',
  /* the sync and costs round (docs/SYNC.md 6.1): every row of both holds the ship, except that a
     cost row marked measure records its counts and holds it only over its ceiling on the preview */
  'sync',
  'cost',
  'decks',
  'slides',
  'text',
  'images',
  'arrange',
  'present',
  'share',
  'comments',
  'versions',
  'export',
  'help',
]);

/** The focus round's one unparkable feature, kept for the callers that named it. */
export const UNPARKABLE_FEATURE = 'surface';

/** True for a feature a red row can park (rule 2). */
export function isParkable(feature) {
  return CORE_FEATURES.includes(feature) && !UNPARKABLE_FEATURES.includes(feature);
}

const ROW_KEYS = new Set([
  'id',
  'feature',
  'interaction',
  'driver',
  'today',
  'evidence',
  'severity',
  'note',
  'setup',
  'manual',
  'parks',
  'measure',
]);

/**
 * The sources the `parks` ids are validated against (docs/RETURN.md section 5: "validated against
 * model.ts"): the menu model, the toolbar tails and the title row, read as text; an id is known
 * when it appears as a string literal in one of them. A plain Node module cannot import the
 * TypeScript model, so the check is the literal's presence, which catches a typo and a row that
 * names a control the product no longer has.
 */
export const CONTROL_SOURCE_PATHS = Object.freeze(
  [
    '../../packages/chrome/src/menus/model.ts',
    '../../packages/chrome/src/menus/toolbar-tails.ts',
    '../../packages/chrome/src/TitleRow.tsx',
    /* the product round (docs/PRODUCT.md 7.1): a `parks` id may name a panel or a page control */
    '../../packages/chrome/src/ThemesPanel.tsx',
    '../../packages/chrome/src/FontPicker.tsx',
    '../../packages/chrome/src/panels/Assist.tsx',
    '../../packages/chrome/src/dialogs/Tailor.tsx',
    '../../packages/chrome/src/dialogs/SaveAsTemplate.tsx',
    '../../apps/studio/src/routes/decks.index.tsx',
    '../../apps/studio/src/routes/decks.templates.tsx',
    /* the features round (docs/FEATURES.md section 6, B4's row): the logo dialog, the shader gallery
       and section, the overlay's handles and bars, the Tabular figures row and B1's parked set */
    '../../packages/chrome/src/dialogs/Logo.tsx',
    '../../packages/chrome/src/dialogs/ShaderGallery.tsx',
    '../../packages/chrome/src/inspector/shader.tsx',
    '../../packages/chrome/src/inspector/typography.tsx',
    '../../packages/chrome/src/Overlay.tsx',
    '../../packages/chrome/src/parked-controls.ts',
    /* the features round, ship two (docs/FEATURES.md 5.4, 5.10): the Background dialog's Shader row
       and its P1 Add to theme row */
    '../../packages/chrome/src/dialogs/Background.tsx',
  ].map((rel) => fileURLToPath(new URL(rel, import.meta.url))),
);

/**
 * The control ids docs/PRODUCT.md 7.1 declares before the lanes' files exist (the product round):
 * every new control has its id in that table before a driver is written, and a `parks` id in this
 * list is known while the file that will hold it is not on the tree yet, so the matrix validates
 * on the tree the lanes start from. Two ids here are templated in their source and never appear
 * as one literal: `format.image.replaceImage.byUrl` (`replaceImageItems(prefix)` writes
 * `${prefix}.byUrl`, model.ts) and `templates.card.menu`, which names the card menu family
 * `templates.card.<id>.menu` of 7.1. Once every lane has landed, an id here that its source holds
 * as a literal is found there first; the list is then documentation and may be trimmed.
 */
export const DECLARED_CONTROL_IDS = Object.freeze([
  /* the Brand kit panel and the colour plate (B5a) */
  'panel.brand',
  'panel.brand.template.useForNew',
  'panel.brand.reset',
  'toolbar.textColor.menu',
  'format.image.useOnEverySlide',
  /* the Font dropdown (B5a) */
  'toolbar.font.search',
  'toolbar.font.more',
  'dialog.moreFonts',
  'format.text.font',
  /* the templates (B5b) */
  'templates.page',
  'templates.card.menu',
  'file.saveAsTemplate',
  'dialog.saveAsTemplate',
  'home.gallery',
  /* the assist (B6) */
  'title.assist',
  'tools.assist',
  'tools.tailor',
  'panel.assist',
  'panel.assist.prompt',
  'panel.assist.starter.tailor',
  'panel.assist.starter.shorter',
  'panel.assist.starter.notes',
  'finder.assist.ask',
  'dialog.tailor',
  /* the pictures (B2): the templated By URL row */
  'format.image.replaceImage.byUrl',
  /* the features round, ship one (docs/FEATURES.md 2.2, 2.3, 3.1, 4.3 to 4.11, 4.12): the ids the
     rows' `parks` name before the lanes' files hold them. The menu rows land in model.ts by request
     (B1 `insert.logo`, `insert.image.logo`; B6 `format.image.replaceImage.logo`, templated as
     `${prefix}.logo` by `replaceImageItems`); the dialog controls in dialogs/Logo.tsx (B1), the
     Tailor button in dialogs/Tailor.tsx (B1), the kit button in ThemesPanel.tsx (B6, P1), the Edit
     data button and the P1 table handles and bar in Overlay.tsx (B3), the two P1 tails in
     toolbar-tails.ts (B3) and the Tabular figures row in inspector/typography.tsx (B2). Four are
     families their source templates: `handle.table.row` (`handle.table.row.<n>`),
     `handle.table.head.column` and `.row` (`handle.table.head.<axis>.<n>`) and `bar.table`
     (`bar.table.<command>`). */
  'insert.logo',
  'insert.image.logo',
  'format.image.replaceImage.logo',
  'dialog.logo.group.brand',
  'dialog.logo.group.recent',
  'dialog.logo.upload',
  'dialog.logo.source',
  'dialog.logo.everySlide',
  'dialog.logo.kind.wordmark',
  'dialog.logo.tone.mono',
  'dialog.tailor.logo.find',
  'panel.brand.logo.find',
  'bar.chart.editData',
  'bar.table',
  'handle.table.row',
  'handle.table.add.column',
  'handle.table.add.row',
  'handle.table.head.column',
  'handle.table.head.row',
  'toolbar.group.text',
  'toolbar.wordart.outline',
  'formatOptions.typography.numerals',
  /* the features round, ship two (docs/FEATURES.md 5.3 to 5.6, 5.10): the ids the shaders rows'
     `parks` name before the lanes' files hold them. The Insert row lands in model.ts by request
     (B1 `insert.shader`, the `insert.material` row renamed and unflagged) and the P1 View row with
     its setting (B1 `view.playShaders`); the Shader row of the Background dialog and its P1 Add to
     theme row in dialogs/Background.tsx (B1); the Shader section and its controls in
     inspector/shader.tsx (B5), where `formatOptions.shader` is the section's head and the
     families `formatOptions.shader.preset` (`.preset.<id>`) and `formatOptions.shader.color`
     (`.color.<role>`) name their tiles and swatches; the P1 engine chip and the P1 hover surface in
     dialogs/ShaderGallery.tsx (B1). */
  'insert.shader',
  'view.playShaders',
  'dialog.background.shader',
  'dialog.background.shader.addToTheme',
  'dialog.shader.engine.glyph',
  'dialog.shader.hover',
  'formatOptions.shader',
  'formatOptions.shader.strength',
  'formatOptions.shader.preset',
  'formatOptions.shader.color',
  'formatOptions.shader.play',
  'formatOptions.shader.frame.scrubber',
  'formatOptions.shader.frame.capture',
  /* the vector round (docs/VECTOR.md 4.8): the six ids the svg rows' `parks` name, each read where
     it acts through `isParked` of parked-controls.ts (the chooser's accept list and the client
     sniff, the paste and drop handlers, the URL path, the copy handler, the Download dialog); the
     viewer's files hold them once B3 and B1 land, and the ids are known here from day 0 */
  'intake.svg.upload',
  'intake.svg.paste',
  'intake.svg.drop',
  'intake.svg.url',
  'picture.svg.copy',
  'export.svg.vector',
]);

let controlSourceText = null;
/** The concatenated text of the control sources, read once; empty when none exists (a copied file alone). */
function controlSources() {
  if (controlSourceText === null)
    controlSourceText = CONTROL_SOURCE_PATHS.filter((p) => existsSync(p))
      .map((p) => readFileSync(p, 'utf8'))
      .join('\n');
  return controlSourceText;
}

/** A data-control id: dot separated parts of letters and digits. */
export const CONTROL_ID_PATTERN = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+$/;

/**
 * True when the id appears as a string literal in one of the control sources, or is one of the
 * ids docs/PRODUCT.md 7.1 declares (`DECLARED_CONTROL_IDS`) for a control whose file a lane has
 * not landed yet.
 */
export function isKnownControl(id) {
  if (DECLARED_CONTROL_IDS.includes(id)) return true;
  const text = controlSources();
  if (text === '') return true;
  return text.includes(`'${id}'`) || text.includes(`"${id}"`) || text.includes(`\`${id}\``);
}

/**
 * A manual row (the orchestrator's ruling (3) on docs/FOCUS.md section 9): a row whose only
 * obstacle is the headless browser (the OS print dialog, a second screen, a chord the browser does
 * not synthesize) carries `manual: <the reason>` and a checklist step in
 * docs/gslides-parity/focus/manual-checklist.md. A run records it as not driven with that reason
 * and never as passed; it does not park its feature and does not fail the ship. A manual row a
 * driver does record as failed is a failure like any other.
 */
export function isManualRow(row) {
  return typeof row?.manual === 'string' && row.manual.length > 0;
}

/**
 * A measurement row (docs/PRODUCT.md 8.2): `measure: true` on a row whose claim is a number the
 * run records (the seconds per slide of the large deck exports). It runs in the second preview
 * run and the production run, its measurement is written into the run's JSON (the gate collects a
 * spec's `measure` annotations), and it never holds the ship: a red measurement row is written
 * into the ship note by id with its mechanism and neither parks its feature nor blocks. A row
 * nobody drives is still "no step" and fails the run.
 *
 * The cost rows of the sync and costs round (docs/SYNC.md 6.1) carry the field in a narrower
 * sense: their counts are recorded beside their ceilings, and a cost row over its ceiling on the
 * preview holds the ship (6.2). The verdict helpers below keep the PRODUCT.md rule for every
 * measurement row (recorded, never counted), so the ship step reads a red cost row from `measured`
 * and the cost probe's own exit code, which is 1 on a row over its ceiling; `isCostRow` tells the
 * two kinds apart.
 */
export function isMeasureRow(row) {
  return row?.measure === true;
}

/** A row of the cost probe (docs/SYNC.md 6.1, 6.3): its driver is `cost-probe`. */
export function isCostRow(row) {
  return row?.driver === COST_PROBE_DRIVER;
}

/** The area of an id: its first part. */
export function areaOf(id) {
  return String(id).split('.')[0];
}

/**
 * Checks every row against the scheme and throws one error naming every problem: a duplicate or
 * malformed id, an unknown feature, driver or state, a feature that disagrees with the area, a
 * severity on a row that is not broken or flaky or missing on one that is, an unknown key.
 */
export function validateCoreMatrix(rows) {
  const problems = [];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('core-matrix.json: no rows');
  const seen = new Set();
  rows.forEach((row, index) => {
    const where = `row ${index + 1} (${row?.id ?? 'no id'})`;
    if (row === null || typeof row !== 'object') {
      problems.push(`${where}: not an object`);
      return;
    }
    for (const key of Object.keys(row))
      if (!ROW_KEYS.has(key)) problems.push(`${where}: unknown key ${key}`);
    if (typeof row.id !== 'string' || !CORE_ID_PATTERN.test(row.id))
      problems.push(`${where}: id does not read area.feature.interaction`);
    if (seen.has(row.id)) problems.push(`${where}: duplicate id`);
    seen.add(row.id);
    if (!CORE_FEATURES.includes(row.feature))
      problems.push(`${where}: unknown feature ${row.feature}`);
    const area = areaOf(row.id);
    const expected = ROW_FEATURE[row.id] ?? AREA_FEATURE[area] ?? area;
    if (row.feature !== expected)
      problems.push(`${where}: area ${area} belongs to ${expected}, not ${row.feature}`);
    if (typeof row.interaction !== 'string' || row.interaction.length === 0)
      problems.push(`${where}: no interaction`);
    if (!CORE_DRIVERS.includes(row.driver)) problems.push(`${where}: unknown driver ${row.driver}`);
    if (!CORE_STATES.includes(row.today)) problems.push(`${where}: unknown state ${row.today}`);
    if (typeof row.evidence !== 'string' || row.evidence.length === 0)
      problems.push(`${where}: no evidence`);
    const red = row.today === 'broken' || row.today === 'flaky';
    if (red && ![1, 2, 3].includes(row.severity))
      problems.push(`${where}: a ${row.today} row needs a severity of 1, 2 or 3`);
    if (!red && row.severity !== undefined)
      problems.push(`${where}: a ${row.today} row carries no severity`);
    if (row.note !== undefined && typeof row.note !== 'string')
      problems.push(`${where}: note is not a string`);
    if (row.manual !== undefined && (typeof row.manual !== 'string' || row.manual.length === 0))
      problems.push(`${where}: manual is not a sentence naming the obstacle`);
    if (row.setup !== undefined && typeof row.setup !== 'string')
      problems.push(`${where}: setup is not a string`);
    if (row.measure !== undefined && row.measure !== true)
      problems.push(`${where}: measure is true or absent`);
    if (row.measure === true && row.manual !== undefined)
      problems.push(`${where}: a measurement row is driven, never manual`);
    if (row.parks !== undefined) {
      if (!Array.isArray(row.parks) || row.parks.length === 0)
        problems.push(`${where}: parks is not a list of data-control ids`);
      else
        for (const control of row.parks) {
          if (typeof control !== 'string' || !CONTROL_ID_PATTERN.test(control))
            problems.push(
              `${where}: parks names ${JSON.stringify(control)}, not a data-control id`,
            );
          else if (!isKnownControl(control))
            problems.push(
              `${where}: parks names ${control}, which no control source holds (model.ts, toolbar-tails.ts, TitleRow.tsx)`,
            );
        }
    }
  });
  if (problems.length > 0) throw new Error(`core-matrix.json: ${problems.join('; ')}`);
  return rows;
}

/** Reads and validates a matrix file; the rows are frozen. */
export function loadCoreMatrix(path = CORE_MATRIX_PATH) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const rows = validateCoreMatrix(parsed.rows);
  return Object.freeze(rows.map((row) => Object.freeze({ ...row })));
}

/** Every row of docs/gslides-parity/focus/core-matrix.json, in the file's order. */
export const CORE_MATRIX = loadCoreMatrix();

/** Every id, in the file's order. */
export const CORE_IDS = Object.freeze(CORE_MATRIX.map((row) => row.id));

const BY_ID = new Map(CORE_MATRIX.map((row) => [row.id, row]));

/** True for an id the matrix holds. */
export function isCoreId(id) {
  return BY_ID.has(id);
}

/** The row with the id; a RangeError on an unknown id, so a typo in a probe tag or a spec fails the run. */
export function coreRow(id) {
  const row = BY_ID.get(id);
  if (row === undefined) throw new RangeError(`unknown core matrix id ${id}`);
  return row;
}

/** The feature a row belongs to. */
export function featureOf(id) {
  return coreRow(id).feature;
}

/** The rows of a feature, in the file's order. */
export function rowsForFeature(feature) {
  return CORE_MATRIX.filter((row) => row.feature === feature);
}

/**
 * The rows a driver carries: `probe --core`, `cost-probe` or a `core/<area>.spec.ts` file name
 * (`core/` optional).
 */
export function rowsForDriver(driver) {
  const name =
    driver === PROBE_DRIVER || driver === COST_PROBE_DRIVER || driver.startsWith('core/')
      ? driver
      : `core/${driver}`;
  return CORE_MATRIX.filter((row) => row.driver === name);
}

/** The rows the walk probe drives in --core mode. */
export function probeRows() {
  return rowsForDriver(PROBE_DRIVER);
}

/** The rows the cost probe drives (docs/SYNC.md 6.3). */
export function costRows() {
  return rowsForDriver(COST_PROBE_DRIVER);
}

/** The counts of a list of rows by the four words, the shape of 6.3. */
export function tally(rows = CORE_MATRIX) {
  const out = { rows: rows.length };
  for (const state of CORE_STATES) out[state] = rows.filter((row) => row.today === state).length;
  return out;
}

/**
 * Rule 4 of section 1, with docs/RETURN.md section 1 rule 2, over a run: `results` maps every core
 * id to `passed`, `failed` or `not driven` (an id the run did not record is `not driven`). Returns
 * the features that would be parked at a ship on this run (`parked`), the rows whose own controls
 * would stay parked (`parkedRows`, each `{ id, parks, result }`: a red row carrying `parks` parks
 * those ids alone, never its feature), the rows of an unparkable feature that would block the ship
 * (`blocking`), the red measurement rows recorded for the ship note (`measured`, PRODUCT.md 8.2;
 * they park nothing and block nothing) and the red rows by feature, so the ship note renders the
 * list instead of typing it. `rows` narrows the reading to one driver's rows (the walk probe judges its own rows, the gate
 * judges the whole matrix).
 */
export function parkedFeaturesOf(results, rows = CORE_MATRIX) {
  const red = new Map();
  const parkedRows = [];
  const parkingFeatures = new Set();
  const blocking = [];
  const measured = [];
  for (const row of rows) {
    const result = results[row.id] ?? 'not driven';
    if (!RUN_RESULTS.includes(result)) throw new RangeError(`${row.id}: unknown result ${result}`);
    if (result === 'passed') continue;
    /* a manual row not driven is the checklist's, never a reason to park (ruling (3)) */
    if (result === 'not driven' && isManualRow(row)) continue;
    /* a red measurement row is recorded by id for the ship note and holds nothing (PRODUCT.md 8.2) */
    if (isMeasureRow(row)) {
      measured.push({ id: row.id, feature: row.feature, result });
      continue;
    }
    const list = red.get(row.feature) ?? [];
    list.push({ id: row.id, result });
    red.set(row.feature, list);
    if (row.parks !== undefined) {
      parkedRows.push({ id: row.id, parks: [...row.parks], result });
      continue;
    }
    if (isParkable(row.feature)) parkingFeatures.add(row.feature);
    else blocking.push({ id: row.id, feature: row.feature, result });
  }
  const parked = CORE_FEATURES.filter((feature) => parkingFeatures.has(feature));
  return { parked, parkedRows, blocking, measured, red: Object.fromEntries(red) };
}

/** The features and rows of a parked list: an array of features (the focus round's form) or the object. */
function parkedOf(parked) {
  if (Array.isArray(parked)) return { parkedFeatures: parked, parkedRows: [] };
  return {
    parkedFeatures: parked?.parkedFeatures ?? [],
    parkedRows: parked?.parkedRows ?? [],
  };
}

/** Throws on a parked list that names an unparkable feature, an unknown feature or a row without `parks`. */
function checkParkedList(parkedFeatures, parkedRows, where) {
  for (const feature of parkedFeatures) {
    if (UNPARKABLE_FEATURES.includes(feature))
      throw new RangeError(
        `${where}${feature} cannot be parked: a failed or not driven ${feature} row blocks the ship`,
      );
    if (!CORE_FEATURES.includes(feature))
      throw new RangeError(`${where}unknown feature ${feature} in the parked list`);
  }
  for (const entry of parkedRows) {
    if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string')
      throw new RangeError(`${where}parkedRows holds an entry without an id`);
    const row = BY_ID.get(entry.id);
    if (row === undefined)
      throw new RangeError(`${where}parkedRows names an unknown row ${entry.id}`);
    if (row.parks === undefined)
      throw new RangeError(`${where}parkedRows names ${entry.id}, a row that carries no parks`);
    if (!Array.isArray(entry.parks) || entry.parks.some((id) => !row.parks.includes(id)))
      throw new RangeError(
        `${where}parkedRows entry ${entry.id} names controls the row does not guard (${row.parks.join(', ')})`,
      );
  }
}

/**
 * The committed parked list of a ship (6.2; docs/RETURN.md section 1 rule 2):
 * `docs/gslides-parity/focus/ship-<commit>.json` with `{ "commit": "<sha>", "parkedFeatures":
 * [...], "parkedRows": [{ "id", "parks" }] }` (`parkedRows` optional; rendered from a run, never
 * typed). Returns the list, checked against the feature names and the matrix; an unparkable
 * feature is refused here as it is in `shipVerdict`, and a parkedRows entry must name a row that
 * carries `parks` and only the controls that row guards.
 */
export function readParkedList(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const list = parsed?.parkedFeatures;
  if (!Array.isArray(list)) throw new Error(`${path}: no parkedFeatures list`);
  const parkedRows = parsed?.parkedRows ?? [];
  if (!Array.isArray(parkedRows)) throw new Error(`${path}: parkedRows is not a list`);
  checkParkedList(list, parkedRows, `${path}: `);
  return {
    commit: typeof parsed.commit === 'string' ? parsed.commit : null,
    parkedFeatures: list,
    parkedRows: parkedRows.map((entry) => ({ id: entry.id, parks: [...entry.parks] })),
  };
}

/**
 * The exit rule of 6.2 over a run and the ship's committed parked list: every core id must be
 * `passed` unless its feature is in `parkedFeatures` or the row itself is in `parkedRows` (a row
 * carrying `parks`, whose own controls stay behind the switch for the ship); an unparkable
 * feature cannot be listed. `parked` is the array of features (the focus round's form) or the
 * object `readParkedList` returns. Returns `ok`, the ids that fail it with their result, and the
 * red measurement rows (`measured`) the verdict recorded and did not count. `rows` narrows the
 * rule to one driver's rows.
 */
export function shipVerdict(results, parked = [], rows = CORE_MATRIX) {
  const { parkedFeatures, parkedRows } = parkedOf(parked);
  checkParkedList(parkedFeatures, parkedRows, '');
  const parkedIds = new Set(parkedRows.map((entry) => entry.id));
  const failures = [];
  const measured = [];
  for (const row of rows) {
    const result = results[row.id] ?? 'not driven';
    if (!RUN_RESULTS.includes(result)) throw new RangeError(`${row.id}: unknown result ${result}`);
    if (result === 'passed' || parkedFeatures.includes(row.feature) || parkedIds.has(row.id))
      continue;
    if (result === 'not driven' && isManualRow(row)) continue;
    /* a measurement row never holds the ship; the ship note carries it by id (PRODUCT.md 8.2) */
    if (isMeasureRow(row)) {
      measured.push({ id: row.id, feature: row.feature, result });
      continue;
    }
    failures.push({ id: row.id, feature: row.feature, result });
  }
  return { ok: failures.length === 0, failures, measured };
}

// -----------------------------------------------------------------------------------------------
// the parked set of packages/chrome/src/parked-controls.ts (docs/FEATURES.md 7.2)

/** B1's module, whose set this generator writes between the two markers. */
export const PARKED_CONTROLS_PATH = fileURLToPath(
  new URL('../../packages/chrome/src/parked-controls.ts', import.meta.url),
);
/** The two markers the module carries around its set; the generator touches nothing outside them. */
export const PARKED_BEGIN = '/* parked-controls:begin */';
export const PARKED_END = '/* parked-controls:end */';

/**
 * The control ids a ship's parked list keeps behind the switch through the module: the union of
 * the `parks` of its `parkedRows`, sorted, each checked against the row (readParkedList did). A
 * list with no parked rows (a preview built before the runs) gives the empty set. A menu row or a
 * toolbar control among them is hidden by the `advanced` flag of model.ts as well; listing it
 * here is harmless, since the module's readers are the overlay, the dialogs and the Shader section.
 */
export function parkedControlsOf(list) {
  const { parkedRows } = parkedOf(list);
  return [...new Set(parkedRows.flatMap((entry) => entry.parks))].sort();
}

/**
 * The lines the generator writes between the markers: the set literal and the ship it came from.
 * `commit` names the ship (`null` for a set written from a run with no commit yet).
 */
export function renderParkedSet(controls, commit) {
  const from = commit === null ? 'no ship yet' : `ship-${commit}.json`;
  const items = controls.map((id) => `  '${id}',`).join('\n');
  return [
    `// written by scripts/probes/core-matrix.mjs --emit-parked from ${from}; ${controls.length} control${controls.length === 1 ? '' : 's'}`,
    `export const PARKED_CONTROLS: ReadonlySet<string> = new Set<string>([${controls.length === 0 ? '' : `\n${items}\n`}]);`,
  ].join('\n');
}

/**
 * The module's text with its set replaced. The file must carry both markers once; a module without
 * them is B1's to amend (the request in build/b4.md), so the generator refuses rather than guess
 * where the set lives.
 */
export function spliceParkedSet(source, rendered) {
  const a = source.indexOf(PARKED_BEGIN);
  const b = source.indexOf(PARKED_END);
  if (a < 0 || b < 0 || b < a)
    throw new Error(
      `parked-controls.ts must carry ${PARKED_BEGIN} before ${PARKED_END} exactly once; the set is written between them and nothing else is touched`,
    );
  if (source.indexOf(PARKED_BEGIN, a + 1) >= 0 || source.indexOf(PARKED_END, b + 1) >= 0)
    throw new Error('parked-controls.ts carries a marker twice');
  return `${source.slice(0, a + PARKED_BEGIN.length)}\n${rendered}\n${source.slice(b)}`;
}

/**
 * The `--emit-parked` step: reads the ship's parked list, renders its set and writes it into the
 * module (or, with `check`, answers whether the module already holds it). Returns
 * `{ controls, changed, path }`; throws when the module is absent or carries no markers.
 */
export function emitParked(listPath, { out = PARKED_CONTROLS_PATH, check = false } = {}) {
  const list = readParkedList(listPath);
  const controls = parkedControlsOf(list);
  if (!existsSync(out))
    throw new Error(
      `${out} does not exist; packages/chrome/src/parked-controls.ts is B1's module (docs/FEATURES.md 7.2) and the generator writes its set between the markers only`,
    );
  const source = readFileSync(out, 'utf8');
  const next = spliceParkedSet(source, renderParkedSet(controls, list.commit));
  const changed = next !== source;
  if (!check && changed) writeFileSync(out, next);
  return { controls, changed, path: out, commit: list.commit };
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const argOf = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  if (argv.includes('--ids')) {
    for (const id of CORE_IDS) console.log(id);
  } else if (argv.includes('--emit-parked')) {
    const listPath = argOf('--emit-parked');
    if (listPath === undefined || listPath.startsWith('--')) {
      console.error(
        'usage: node scripts/probes/core-matrix.mjs --emit-parked <ship json> [--out <parked-controls.ts>] [--check]',
      );
      process.exit(2);
    }
    const check = argv.includes('--check');
    const result = emitParked(listPath, { out: argOf('--out') ?? PARKED_CONTROLS_PATH, check });
    console.log(
      `${check ? (result.changed ? 'stale' : 'current') : result.changed ? 'wrote' : 'unchanged'}: ${result.path} holds ${result.controls.length} parked control${result.controls.length === 1 ? '' : 's'} from ${result.commit === null ? 'a list with no commit' : `ship-${result.commit}.json`}${result.controls.length > 0 ? ` (${result.controls.join(', ')})` : ''}`,
    );
    if (check && result.changed) process.exit(1);
  } else {
    const all = tally();
    console.log(
      `core-matrix: ${all.rows} rows; ${all.works} works, ${all.broken} broken, ${all.flaky} flaky, ${all['not driven']} not driven`,
    );
    for (const feature of CORE_FEATURES) {
      const t = tally(rowsForFeature(feature));
      console.log(
        `  ${feature.padEnd(9)} ${String(t.rows).padStart(3)} rows  ${String(t.works).padStart(3)} works ${String(t.broken).padStart(3)} broken ${String(t.flaky).padStart(3)} flaky ${String(t['not driven']).padStart(3)} not driven`,
      );
    }
    for (const driver of CORE_DRIVERS)
      console.log(
        `  ${driver.padEnd(24)} ${String(rowsForDriver(driver).length).padStart(3)} rows`,
      );
    const withParks = CORE_MATRIX.filter((row) => row.parks !== undefined);
    const measure = CORE_MATRIX.filter((row) => isMeasureRow(row) && !isCostRow(row));
    const cost = CORE_MATRIX.filter(isCostRow);
    const manual = CORE_MATRIX.filter(isManualRow);
    console.log(
      `  ${withParks.length} rows carry parks; ${measure.length} measurement rows (${measure.map((r) => r.id).join(', ') || 'none'}); ${cost.length} cost probe rows (${cost.map((r) => r.id).join(', ') || 'none'}); ${manual.length} manual rows; unparkable features: ${UNPARKABLE_FEATURES.join(', ')}`,
    );
  }
}
