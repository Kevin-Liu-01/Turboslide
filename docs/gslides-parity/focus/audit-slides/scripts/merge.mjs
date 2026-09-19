#!/usr/bin/env node
// Merges the run JSON with the need and severity judgments and prints the markdown table plus the
// structured rows JSON. node merge.mjs run-1.json > table.md ; the rows land in rows.json beside it.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// node merge.mjs out-dir run-1.json:exclude=22,24,30-68 run-2.json:exclude=7,8 run-3.json ...
const outDir = process.argv[2];
const inputs = process.argv.slice(3).map((arg) => {
  const [file, opts = ''] = arg.split(':exclude=');
  const excluded = new Set();
  for (const part of opts.split(',').filter(Boolean)) {
    const [a, b] = part.split('-').map(Number);
    for (let i = a; i <= (b ?? a); i += 1) excluded.add(i);
  }
  return { file, excluded };
});
const run = { rows: [], consoleErrors: [], ms: 0, deckId: '', runs: [] };
for (const { file, excluded } of inputs) {
  const one = JSON.parse(readFileSync(file, 'utf8'));
  const label = path.basename(file, '.json').replace('run-', 'run ');
  run.runs.push({
    label,
    deckId: one.deckId,
    ms: one.ms,
    rows: one.rows.length,
    startedAt: one.startedAt,
    version: one.version,
    consoleErrors: one.consoleErrors,
  });
  for (const row of one.rows) {
    if (excluded.has(row.n)) continue;
    run.rows.push({ ...row, run: label, runN: row.n });
  }
  run.consoleErrors.push(...one.consoleErrors.map((e) => `${label}: ${e}`));
  run.ms += one.ms;
}
const file = path.join(outDir, 'merged.json');

/** Rows whose script criterion misjudged the product's result; the note says why. */
const OVERRIDES = {
  'run 4:7': {
    result: 'works',
    note: 'the script read 2 blocks before the apply while the title session was still closing; the result (3 blocks, runs h,p1,p2, title kept) matches trials 2 and 3',
  },
  'run 4:10': {
    note: "the snackbar read here is the previous row's, still inside its 5 s hold; trials 2 and 3 read the message this apply raised",
  },
  'run 7:9': {
    note: "the Delete key on the focused card did not remove the slide within 8 s and the following Cmd+Z and Cmd+Shift+Z changed nothing; the trial ran right after trial 2's refused redo and a reload, so the cause is not settled",
  },
};
for (const row of run.rows) {
  const o = OVERRIDES[`${row.run}:${row.runN}`];
  if (!o) continue;
  if (o.result) row.result = o.result;
  if (o.note) row.evidence = `${row.evidence}; note: ${o.note}`;
}
/** Interactions the runs never drove cleanly, recorded as not driven with the reason. */
run.rows.push({
  n: 0,
  run: 'runs 2, 6, 7',
  runN: '',
  feature: 'Grid view',
  interaction: 'In the grid, select two tiles and press Delete, then Undo',
  result: 'not driven',
  attempts: 9,
  evidence:
    'not driven: in runs 2 and 6 the first tile click was a plain click, which opens the slide and leaves the grid (GridView pick runs onSelect), so the Shift click and the Delete landed on the canvas; in run 7 the Shift click did select two tiles from the current one, the Delete removed two slides, but the script waited for the order before clicking the snackbar Undo and the 5 s hold had ended, so the Undo was never clicked and the next trial found the grid toggled off. The selection of two tiles by Shift click is visible in audit-slides/65-grid-shift-select.png (run 2, before the Delete).',
  shot: 'audit-slides/65-grid-shift-select.png',
  consoleErrors: [],
});

/** The judgment per interaction: a regex over "feature :: interaction", the need, the severity a failure carries, and why. */
const META = [
  [
    /New slide template :: Open \/new/,
    'core',
    3,
    'A seller starts from the deck the address opens on; the landing slide is the first thing every seller sees.',
  ],
  [
    /New slide template :: Double click the title/,
    'core',
    3,
    'Retyping the cover title is the first edit of every tailored deck.',
  ],
  [
    /New slide :: Click New slide in the toolbar/,
    'core',
    3,
    'Adding a slide is a weekly task and the toolbar button is where Google puts it.',
  ],
  [
    /New slide :: Click the arrow beside New slide/,
    'useful',
    2,
    'Choosing the layout at insert time saves an Apply layout step but the plain New slide plus Apply layout reaches the same result.',
  ],
  [
    /New slide :: Slide menu > New slide/,
    'useful',
    2,
    'The menu is the second route to a slide a seller adds from the toolbar or the keyboard.',
  ],
  [
    /New slide :: Press Ctrl\+M with a filmstrip card/,
    'core',
    2,
    'Ctrl+M is the New slide shortcut sellers carry from Google Slides.',
  ],
  [
    /New slide :: Press Ctrl\+M with the canvas/,
    'core',
    2,
    'The shortcut has to work wherever the seller is, not only with a card focused.',
  ],
  [
    /New slide :: Press Cmd\+M/,
    'park',
    1,
    'Google binds New slide to Ctrl+M on the Mac as well; Cmd+M is the browser window chord and no seller expects a slide from it.',
  ],
  [
    /New slide :: Right click a filmstrip card and pick New slide/,
    'core',
    2,
    'The filmstrip right click menu is where a seller tailoring a deck adds a slide next to the one in view.',
  ],
  [
    /New slide :: Undo a New slide/,
    'core',
    2,
    'Undo covering every slide action is the reason no confirmation dialogs exist.',
  ],
  [
    /Duplicate slide :: Right click the title card/,
    'core',
    3,
    'Duplicating a slide is how a seller makes a second case study or pricing slide.',
  ],
  [
    /Duplicate slide :: Slide menu/,
    'useful',
    2,
    'The menu route repeats the right click and the shortcut.',
  ],
  [
    /Duplicate slide :: Press Cmd\+D/,
    'core',
    2,
    'Cmd+D is the duplicate shortcut sellers know from Google Slides.',
  ],
  [
    /Duplicate slide :: Undo a duplicate with the toolbar/,
    'core',
    2,
    'A duplicate made by mistake must leave in one click.',
  ],
  [
    /Duplicate slide :: Undo a duplicate with Cmd\+Z, then Redo/,
    'useful',
    2,
    'Redo is used less than undo but a seller who undoes one step too far needs it.',
  ],
  [
    /Delete slide :: Press Delete with a filmstrip card/,
    'core',
    3,
    'Deleting the slides that do not apply to the prospect is the most frequent filmstrip action.',
  ],
  [
    /Delete slide :: Undo a delete with the snackbar/,
    'core',
    3,
    'Delete has no confirmation, so the snackbar Undo is the only guard against losing a slide.',
  ],
  [
    /Delete slide :: Right click a card and pick Delete/,
    'core',
    2,
    'The right click menu is the second delete route a seller uses.',
  ],
  [
    /Delete slide :: Undo a delete with Cmd\+Z/,
    'core',
    3,
    'Cmd+Z after a delete is what a seller reaches for first.',
  ],
  [
    /Delete slide :: Slide menu > Delete slide/,
    'useful',
    2,
    'The menu route and Redo repeat the keyboard and the snackbar.',
  ],
  [
    /Delete slide :: Select two cards/,
    'core',
    3,
    'Removing several slides at once is how a seller trims a long master deck for one prospect.',
  ],
  [
    /Filmstrip selection :: Click the second card/,
    'core',
    3,
    'Clicking a card is how a seller moves between slides; the canvas and the address must follow.',
  ],
  [
    /Filmstrip selection :: Shift click/,
    'core',
    2,
    'Range selection is what makes delete, duplicate and move work on several slides at once.',
  ],
  [
    /Filmstrip selection :: Arrow down/,
    'useful',
    2,
    'The arrows move through a deck from the keyboard while the mouse is on the canvas.',
  ],
  [
    /Reorder slides :: Drag the second filmstrip card above the first/,
    'core',
    3,
    'Dragging a card is the reorder gesture every seller uses.',
  ],
  [
    /Reorder slides :: Drag the first filmstrip card below the third/,
    'core',
    3,
    'A drop after a card is half of every reorder drag.',
  ],
  [
    /Reorder slides :: Press Cmd\+Down then Cmd\+Up/,
    'useful',
    2,
    'The move chords are quicker than a drag for a one step move but a seller finishes with the drag.',
  ],
  [
    /Reorder slides :: Slide menu > Move slide/,
    'useful',
    1,
    'Move to end from the menu is a rarer route than the drag.',
  ],
  [
    /Reorder slides :: Undo a drag reorder/,
    'core',
    2,
    'A drag that lands one card off must be reversible in one key.',
  ],
  [
    /Layout picker :: Click Layout in the toolbar/,
    'core',
    3,
    'The layout picker is the control that turns the template into a one click choice of slide templates.',
  ],
  [
    /Apply layout :: Apply the layout "(Title slide|Title and body|Title and two columns|Title only|Section header|Blank|Main point|Big number|Caption|One column text|Section title and description|Closing)"/,
    'core',
    2,
    "Google's eleven layouts and the closing slide are the ones a sales deck is built from.",
  ],
  [
    /Apply layout :: Apply the layout/,
    'useful',
    2,
    "The GT layouts (rows, lists, tables, figures, grids, boards, matrix) are the template's extra slide types; a seller uses a few of them.",
  ],
  [
    /Apply layout :: Reopen the picker after the last apply/,
    'useful',
    1,
    'The ring in the picker tells the seller which layout the slide has.',
  ],
  [
    /Apply layout :: Right click a card > Apply layout/,
    'core',
    2,
    'Right click > Apply layout is the route Google teaches for changing a layout.',
  ],
  [
    /Apply layout :: Slide menu > Apply layout/,
    'useful',
    2,
    'The menu route and the undo of a layout change repeat the picker.',
  ],
  [
    /Skip slide :: Right click a card > Skip slide/,
    'core',
    3,
    'Skipping the slides that do not apply is the reversible alternative to deleting them, and the skipped pricing slide must not present.',
  ],
  [
    /Skip slide :: Slide menu > Unskip/,
    'core',
    2,
    'Unskipping from the Slide menu is how a seller brings a slide back for the next call.',
  ],
  [
    /Grid view :: Click Grid view in the bottom bar/,
    'useful',
    2,
    'The grid is for bulk reordering of a long deck; the filmstrip covers a short one.',
  ],
  [
    /Grid view :: In the grid, select two tiles and press Delete, then Undo/,
    'useful',
    1,
    'Bulk delete from the grid is what the grid view is for; this audit did not drive it cleanly.',
  ],
  [
    /Grid view :: In the grid, click a tile/,
    'useful',
    1,
    'A single click that leaves the grid differs from Google, where a click selects and a double click opens; Shift and Cmd clicks still select inside it.',
  ],
  [
    /Grid view :: View menu > Grid view/,
    'useful',
    1,
    'The menu toggle repeats the bottom bar button.',
  ],
  [
    /Grid view :: Double click a filmstrip card/,
    'park',
    1,
    'Double clicking a card to reach the grid is a shortcut few sellers know.',
  ],
  [
    /Grid view :: Drag a grid tile/,
    'useful',
    2,
    'Reordering in the grid is the reason the grid exists.',
  ],
  [
    /Speaker notes :: Click the notes field and type/,
    'core',
    3,
    'Talk tracks live in the notes and are read in presenter view on the call.',
  ],
  [
    /Speaker notes :: Switch to another slide and back/,
    'core',
    3,
    'Notes shown on the wrong slide would mislead the presenter mid call.',
  ],
  [
    /Speaker notes :: Drag the notes handle/,
    'useful',
    1,
    'A taller pane helps with a long talk track; the default height works for a line or two.',
  ],
  [
    /Speaker notes :: Reload the deck/,
    'core',
    3,
    'Notes that do not survive a reload are lost work before the call.',
  ],
  [
    /Slide counter :: The counter reads the slide number; clicking it/,
    'useful',
    1,
    'A seller reads the slide number from the card gutter; a go to field is a convenience in a long deck.',
  ],
  [
    /Address hash :: The address carries the slide/,
    'useful',
    2,
    'A link to a slide is how a manager points a seller at the slide to fix.',
  ],
  [
    /Slide counter :: The counter follows/,
    'useful',
    1,
    'The count is read at a glance while trimming a deck.',
  ],
  [
    /Apply layout :: Trial \d: on a fresh empty Title and body slide apply Section header/,
    'core',
    2,
    'A seller who tries a picture layout and goes back keeps a starter picture they never placed.',
  ],
  [
    /Apply layout :: Trial \d: on a fresh empty Title and body slide apply Ruled statement list/,
    'core',
    2,
    'A seller who tries two layouts on a new slide ends with a slide full of prompts they never typed.',
  ],
  [
    /Apply layout :: Trial \d: type a title on a fresh slide/,
    'core',
    2,
    'Changing the layout of a slide with a typed title is the layout change a seller actually makes.',
  ],
  [
    /Apply layout :: Trial \d: apply Title slide to a fresh empty/,
    'useful',
    1,
    'A warning about a dropped block when nothing was typed teaches the seller to ignore the snackbar.',
  ],
  [
    /Apply layout :: Undo after a layout change on a typed slide/,
    'core',
    2,
    'A wrong layout pick must come back in one key with the text intact.',
  ],
  [
    /Filmstrip selection :: Cmd click a second card/,
    'useful',
    2,
    'Cmd click builds the non adjacent selection a seller needs to delete two scattered slides.',
  ],
  [
    /Duplicate slide :: Select two cards with Shift click and press Cmd\+D/,
    'useful',
    2,
    'Duplicating several slides at once is how a seller copies a section.',
  ],
  [
    /Reorder slides :: Select two cards with Shift click and drag them/,
    'useful',
    2,
    'Moving a two slide section by one drag saves a seller two drags.',
  ],
  [
    /Skip slide :: Select two cards with Shift click, right click, Skip slide/,
    'core',
    2,
    'Skipping a block of slides that do not apply to one prospect is the weekly tailoring step.',
  ],
  [
    /Grid view :: In the grid, Shift click a second tile then Delete/,
    'useful',
    2,
    'Bulk delete from the grid is what the grid view is for.',
  ],
  [
    /Delete slide :: Trial \d: in the grid, Shift click two tiles/,
    'useful',
    2,
    'Bulk delete from the grid is what the grid view is for.',
  ],
  [
    /Delete slide :: Trial \d: in the grid, with the fifth slide current/,
    'useful',
    2,
    'Bulk delete from the grid is what the grid view is for.',
  ],
  [
    /Delete slide :: Trial \d: in the filmstrip, Shift click two cards, press Delete/,
    'core',
    3,
    'Deleting several slides and undoing it is the filmstrip action a seller trusts most.',
  ],
  [
    /Delete slide :: Trial \d: two cards selected, Slide menu > Delete slide/,
    'useful',
    2,
    'Slide > Delete slide must remove the selection the way the Delete key and the right click do.',
  ],
  [
    /Delete slide :: Trial \d: two cards selected, Edit menu > Delete/,
    'useful',
    2,
    'Edit > Delete must remove the selection the way the Delete key does.',
  ],
  [
    /Duplicate slide :: Trial \d: two cards selected, Slide menu > Duplicate slide/,
    'useful',
    2,
    'The menu must duplicate the selection the way Cmd+D does.',
  ],
  [
    /Skip slide :: Trial \d: two cards selected, Slide menu > Skip slide/,
    'core',
    2,
    'Skipping a block of slides from the menu is the same weekly step as from the right click.',
  ],
  [
    /Delete slide :: Trial \d: click the empty canvas/,
    'core',
    3,
    'Delete with the canvas focused is a key a seller presses by accident; the result must be recoverable.',
  ],
  [
    /Delete slide :: Trial \d: delete the last slide with the Delete key on its card, wait for the save/,
    'core',
    3,
    'Undo and redo across saved writes is the guard behind a delete with no confirmation.',
  ],
  [
    /Slide counter :: Read the sheet footer counter/,
    'useful',
    1,
    'The footer number and the card numbers are how a seller knows where they are in the deck.',
  ],
  [
    /Slide counter :: The sheet footer counter follows/,
    'useful',
    1,
    'The footer number and the card numbers are how a seller knows where they are in the deck.',
  ],
  [/cleanup ::/, 'park', 1, "The audit's own cleanup of the scratch deck."],
];

const judge = (row) => {
  const key = `${row.feature} :: ${row.interaction}`;
  for (const [re, need, severity, why] of META) if (re.test(key)) return { need, severity, why };
  return { need: 'useful', severity: 2, why: 'No judgment recorded.' };
};

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const out = [];
out.push(
  '| # | Run | Feature | Interaction | Result | Evidence | Screenshot | Severity | Need | Why |',
);
out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
const structured = [];
for (const row of run.rows) {
  const j = judge(row);
  const severity = row.result === 'works' ? 0 : j.severity;
  const errs = row.consoleErrors?.length
    ? `; console errors: ${row.consoleErrors.join(' ; ')}`
    : '';
  const evidence = `${row.evidence}${errs}`;
  out.push(
    `| ${structured.length + 1} | ${row.run} ${row.runN} | ${esc(row.feature)} | ${esc(row.interaction)} | ${row.result} | ${esc(evidence)} | ${row.shot ? `\`${row.shot}\`` : ''} | ${severity} | ${j.need} | ${esc(j.why)} |`,
  );
  structured.push({
    feature: row.feature,
    interaction: row.interaction,
    result: row.result,
    evidence: `${evidence}${row.shot ? ` (screenshot ${row.shot})` : ''}`,
    severity,
    need: j.need,
    why: j.why,
  });
}
console.log(out.join('\n'));
writeFileSync(path.join(outDir, 'rows.json'), JSON.stringify(structured, null, 2));
writeFileSync(file, JSON.stringify(run, null, 2));
const counts = run.rows.reduce((a, r) => ({ ...a, [r.result]: (a[r.result] ?? 0) + 1 }), {});
console.error(
  JSON.stringify({
    rows: run.rows.length,
    counts,
    ms: run.ms,
    runs: run.runs.map((r) => `${r.label} ${r.deckId} ${r.rows} rows ${Math.round(r.ms / 1000)} s`),
    consoleErrors: run.consoleErrors.length,
  }),
);
