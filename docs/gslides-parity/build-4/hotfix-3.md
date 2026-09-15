# Turboslide round four, hotfix 3

Kevin's report on production (`main` at `43707c3`, https://turboslide.vercel.app, 2026-09-14): "expanding and shrinking doesnt really work, the scaling isnt going super well". The subject is resizing objects on the slide canvas by their eight handles; Google Slides is the reference behaviour (round two's canvas model, `docs/freeform.md`, gslides-parity SPEC-2 section 6).

Files this hotfix touches are listed at the end of each section; the reproducer touched only this file.

## 1. Reproduction

By the reproducer, 2026-09-14, 15:40 to 16:40 PDT, against https://turboslide.vercel.app with headless Chromium (`playwright-core` 1.62.1 from the repo's `node_modules`, Node 24.13.0, viewport 1440 by 900 at device scale 2), through the product's own UI and its window API (`window.turboslide.studio`). Scripts, logs, rows, screenshots, render comparisons and the Playwright trace sit under `/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/hotfix3/` (`repro.mjs`, `cleanup-api.mjs`, `smoke.log`, `smoke2.log`, `smoke3.log`, `full.log`, `run-smoke/`, `run-smoke2/`, `run-smoke3/`, `run-full/`; each run folder holds `matrix.json` with one row per drag, `report.json`, `run.log`, `trace.zip`, the 2x screenshots `NNN-<kind>-before.png`, `NNN-<kind>-after-se.png`, `NNN-<kind>-rotated.png`, and `editor-<kind>.png`, `render-<kind>.png`, `diff-<kind>.png` for the headless comparison). The script is copied in section 1.8.

### 1.1 What was done

Every run makes a deck from `/new` (the first write, a `slide.new` of a blank slide, saves it as `untitled-20260914-<rand>`), reopens it on `/edit/<id>?edit=1` (on this build a slide switch on `/new` remounts the editor, hotfix 2 cause A4), sets the blank slide to the freeform layout, and inserts one object per kind. Production's toolbar has no `+` Insert menu (round four passes no entries to `Toolbar`'s `InsertMenu`), so the menubar's Insert menu is the product path: Insert > Text box arms the text tool and a click on the sheet places the 480 by 64 text box with `autofit: 'grow'` (this worked); Insert > Shape > Shapes lists a glyph grid without the `menu.insert.shape.shapes.rectangle` rows, Insert > Line and Insert > Chart > Column wrote nothing within 20 s, so those kinds and the kinds the menubar does not offer (the presets triangle, rightArrow, star5, a line kind, the icon, the box, the picture from a 96 by 64 PNG data URL through `asset.add`, the material, the table, the diagram, the group of a rectangle and a text) were inserted with `block.insert` on the window transport, the same action the menu dispatches. Every object was then moved to its own cell so a click selects it (`block.set /pos`). Each scripted write waits for the previous one to land on the server; without that, a `block.set` inside a `block.insert`'s flight was refused with "No block" (hotfix 2's write path).

For each object and each handle the script zooms the stage (`view.zoom` with the handle's sheet point as the centre), selects the object (a click; a click inside text places the caret, so Escape steps back to the block whose handles the overlay draws), waits until the document's revision equals the reported one, reads the element under the handle's centre, presses at that centre, records the box 90 ms after pointer down, moves by a known delta in eight steps (the delta is 18 percent of the box, at least 24 by 16 px, so a round of eight handles nets to about zero drift), records the preview box, the size readout, the guides drawn, the inspector's fields and the content metrics, releases, polls the snackbar and the revision for 8 s, and records the committed box (`pos`, the `.free` wrapper's rect in sheet pixels, the inner element's rect, the text's font size and line count, the filmstrip clone's box). After each round of eight the last drag is undone through the toolbar's Undo and the box compared. After the plain zoom 100 se drag the stage is screenshot and the slide is fetched from `/api/render/<slide>?deck=<id>&theme=<the editor's appearance>&scale=1` with the agent bearer, and the two images are compared with pixelmatch at threshold 0.1 over the whole sheet and inside the object's region, plus the ink bounding box of the object in each. The rotated case sets `block.rotate` to 30 degrees, drags the eight handles once, and records the pointer's final sheet point against the dragged corner computed from the committed `pos` (rotation about the box centre).

Four runs: `run-smoke` (rectangle, text-grow, chart; zoom 100, plain, rotated), `run-smoke2` (text, rectangle, icon; zoom 100, plain), `run-smoke3` (the same three, with the snackbar polled during the commit wait), and `run-full` (every kind; the full matrix of zoom 50, 100 and 200 by plain, Shift and Alt on text-grow, rectangle, icon, picture, table and the group; zoom 100 by the three modifiers plus zoom 50 and 200 plain on se and nw for the other kinds; rotated 30 on every kind). The `run-full` deck was `untitled-20260914-9t83`; the run inserted sixteen objects and stopped at the diagram insert, whose sample labels carried no `size` (`block.insert: invalid input at /block/data/texts/0/size: Invalid option: expected one of 20|26|18`), so it recorded no drag rows; its `finally` block trashed and deleted the deck (section 1.8). The full matrix and the 1280 by 720 pass (`--viewport 1280x720 --zooms 1 --mods plain --handles se,e,n,nw --rotated 0`) are the next runs of the same script once the diagram fixture names a label size; every finding below comes from the three smoke runs.

### 1.2 The handles that do not commit (reproduced every run)

`run-smoke3`, deck `untitled-20260914-h8je`, the text box: the nw drag committed (r9 to r10, 260 by 140 to 213 by 260). Every one of the seven drags after it, 1.5 to 9 s apart for the next 90 s, previewed correctly (readout "213 × 307", "175 × 210", "253 × 260", ...) and reverted at pointer up; the snackbar read `baseRevision 9 is stale; the document is at revision 10` after each. The rectangle: nw, n, ne committed (r12, r13, r14); e reverted with `baseRevision 13 is stale; the document is at revision 14`; se, s committed; sw reverted with `baseRevision 15 is stale; the document is at revision 16`; w committed. The icon: ne reverted with `baseRevision 19 is stale; the document is at revision 20`, sw with `baseRevision 22 is stale; the document is at revision 23`. In every refused row `describe().state` reported `revision` equal to `serverRevision` and `sync.revision` (10, 14, 16, 20, 23) with `sync.pending` 0, while the write was based one revision lower. `run-smoke2` (deck `untitled-20260914-8zbo`): after the rectangle's nw drag (r15), all seven remaining drags reverted for 90 s and the undo that followed removed the nw resize instead (the box went back to 240 by 150). `run-smoke` (deck `untitled-20260914-w2ts`): the rectangle's n and se drags and the chart's n and w drags reverted the same way (the snackbar was not polled in that run; the 8 s wait outlived its 5 s hold).

The user sees the box follow the pointer and spring back on release, at random, then a run of releases that all spring back; Undo then removes an earlier resize. This is the largest part of "expanding and shrinking doesn't really work".

### 1.3 The text box jumps at pointer up (autofit grow)

`run-smoke3`, the text box from Insert > Text box (`autofit: 'grow'`, 260 by 140, six lines at 22 px): the nw drag previewed 213 by 115 (readout "213 × 115") and committed 213 by 260; the committed box is 145 px taller than the preview (`jumpAtUp` [0, 0, 0, 145]); the text reflowed to eight lines at 22 px. `run-smoke2` (`untitled-20260914-8zbo`): nw 213 by 115 previewed, 213 by 260 committed (+145 in height, reached over 120 in the rect); ne 175 by 210 previewed, 175 by 359 committed (+149); se 143 by 305 previewed, 143 by 425 committed (+120); the font stayed 22 px and the lines went 8, 11, 14. A shrink of a grow text box therefore ends taller than the preview showed, and the height handles (n, s) cannot make the box shorter than its text: the box springs back to the text height at release.

### 1.4 A rotated object resizes away from the pointer

`run-smoke`, deck `untitled-20260914-w2ts`, the rectangle at 30 degrees (191 by 114): nw dragged 40 by 24 px, the corner landed 3.4 px left and 32.5 px below the pointer; n dragged 20 px, the top edge landed 30.3 px below the pointer; ne 26.3 by 18.8 px off; e 17.4 px off; s 32.2 px off. The chart at 30 degrees (572 by 292): n dragged 48 px, the top edge landed 51.2 px right and 115.7 px below the pointer; ne 82.9 by 95.2 px off; se 26.6 by 97.6 px off; s 94.1 px off; w 48.7 px off. In the same rows the unrotated drags landed within 0 to 2 px of the pointer (or within 6 px with a guide drawn). The committed `pos` shows the arithmetic: for the chart's n drag `y` went 158 to 116 and `h` 292 to 334 (the delta turned into the box's own axes), while the box's centre moved straight up the sheet by 21 px, so the anchored bottom edge moved on screen and the top edge left the pointer.

### 1.5 Content that does not scale with the box

The icon (`run-smoke2`, `run-smoke3`): the box went 96 by 96 to 72 by 79, 48 by 63, 28 by 42 while `svg.icon-block` stayed 24 by 24 sheet px (`content.rect` [704, 87, 24, 24] against `pos` 72 by 79); the ink box of the glyph was 20 by 20 in the editor and in the headless render alike. The rectangle's svg (`preserveAspectRatio="none"`, `viewBox` rewritten per render) scaled with the box in every committed drag, and the picture's `img` (object-fit cover) fills its frame by CSS; the table, chart, diagram and material rows are in `run-full/matrix.json`.

### 1.6 What passed

- Pointer and edge together: every committed unrotated plain drag at zoom 100 in the three smoke runs landed the dragged edge or corner within 1 px of the pointer, or within 6 px with a snap guide drawn (`guides` 1 or 2 in the row), for example the rectangle's se drag `gap` (-1, 0) with one guide and the icon's se (4, -5) with two. The `handleOffset` (the handle's centre against the corner it stands for) was 0 in every row.
- Nothing jumped at pointer down: `jumpAtDown` was [0, 0, 0, 0] in every row of every run.
- Text keeps its size and reflows: 22 px before and after every text drag; the line count followed the width (6, 8, 11, 14 lines).
- Undo restores the previous box in one step when the drag committed: the rectangle in `run-smoke` and `run-smoke3`, the icon in `run-smoke3` (`restored true`). Where the last drag had been refused, the one undo removed the drag before it, as expected of the history but not of the user's intent.
- The filmstrip clone agreed with the editor's box after every committed drag (`thumbMatch` [0, 0, 0, 0]).
- The headless render agreed with the editor: after the se drags the object's ink box was identical in the stage screenshot and in `/api/render` at scale 1 (rectangle [423, 97, 132, 101] in both; icon [674, 56, 133, 36] in both; text within 1 px), pixelmatch 1 percent over the sheet and 0 to 6 percent inside the object's region (anti-aliasing of text).
- The size readout chip showed the preview size while a resize was down in every row.
- Escape after a click inside text gives the block's handles; the click alone gives the caret.

Not measured (the full run stopped before its drags): Shift's aspect lock, Alt about the centre, zoom 50 and 200, the group, the table, the chart's content, the diagram, the material, the plate and the template blocks of an opener slide, the title slide heading (the conversion path), the line's end handles, the 1280 by 720 viewport. The inspector's W and H could not be read: no `formatOptions.size.width` or `formatOptions.size.height` field existed on the page in the smoke runs with an object selected and the Format options panel open (`formatControls` []).

### 1.7 Root causes

The canvas files of the working tree equal `43707c3` (`git diff --stat 43707c3` over `packages/viewer/src/{Gestures,Editor,Freeform}.tsx`, `snap.ts`, `rotate.ts`, `packages/chrome/src/Overlay.{tsx,css}`, `packages/render/src/block-css.ts`, `blocks/{primitives,dia}.ts`, `packages/schema/src/freeform.ts` is empty), so their line numbers are the shipped ones; `apps/studio/src/editor/controller.tsx` and `EditorRoot.tsx` are cited from `git show 43707c3:` because hotfix 2 is editing them.

R1. The stage bases every write on the document's revision while the controller checks against the room's. `apps/studio/src/editor/EditorRoot.tsx:604` (`const revision = deck.revision`) and `:1426` pass the document's revision to the stage; `packages/viewer/src/Editor.tsx:871-872` keep it in `revisionRef` (`revisionRef.current = doc.deck.revision` on every render) and `:1045` build the call with it (`actionForMutations(mutations, revisionRef.current)`); the controller's `checkBase` (`controller.tsx:1819-1826` at `43707c3`) refuses any base that is not exactly `reportedRevision()` (`:1812-1817`, the largest of `room.status().revision`, `serverRevision` and the document's revision). On the blob tier the room client's revision moves on the POST answer (`packages/realtime/client/room-client.ts:751` at `43707c3`, `if (response.revision > revision) revision = response.revision`) while the document's revision moves only when the checkpoint frame arrives over the stream from whichever instance holds it, so the drag that follows a committed drag bases one revision low and is refused with `baseRevision N is stale; the document is at revision N+1` (section 1.2). The Editor's `commit` (`Editor.tsx:1040-1063`) reports the error and drops the draft (`setDraft(null)`), which is the spring back. This is hotfix 2's cause A5 seen from the resize path; the stall of 90 s is its cause A3 (the document stops moving while the reported revision climbs). Kinds: every object.

R2. The preview and the commit differ by the autofit. `Editor.tsx:1805-1814` (`preview`) applies only the gesture's mutations to the draft; `Editor.tsx:1897-1925` (`finishCanvasGesture`) appends `withAutofit` at the release (`:1922`), and `withAutofit` (`:1137-1200`) writes `/pos/h` to the measured `contentHeight` of a `grow` block (`:1182`) or steps a `shrink` block's size down one ladder step (`:1190`). The box the user watched is not the box that lands (section 1.3), and a `grow` block cannot be made shorter than its text by the n or s handle. Google keeps the box the user set and turns autofit off for that shape ("Do not autofit") when a handle is dragged; here the fit wins after the fact. Kinds: text boxes from the text tool (`autofit: 'grow'`), converted placeholders (`autofit: 'shrink'`), any grouped member with autofit.

R3. A rotated object's resize keeps the anchored edge in the unrotated frame. `packages/viewer/src/Gestures.tsx:1105` turns the pointer delta into the object's axes (`unrotateDelta`), `:1107-1110` resizes the unrotated box with the opposite edge held, and `:1114` writes `{ ...anchor, x, y, w, h }`. The renderer draws the box at `x, y, w, h` and rotates it about its own centre (`packages/render/src/slide.ts:504-514` `freeTransform`, `packages/render/src/block-css.ts:179` `transform-origin: center`), so a change of `w` or `h` moves the centre along the sheet's axes by half the delta and the rotation then pivots about the new centre: the anchored edge drifts by `(d/2)(e - R e)` and the dragged edge lands `(d/2)(e + R e)` from where it was instead of `R e d`, which for 30 degrees is a 26 percent error per axis on the edge and grows with the box for a corner (section 1.4: 30 px on a 20 px drag of the rectangle's top edge, 116 px on a 48 px drag of the chart's). Google keeps the opposite edge fixed on screen. The fix is to rebuild `x, y` from the anchored point kept in sheet space (the old corner or edge midpoint rotated about the old centre) and the new size rotated about the new centre. `aboutCentre` (`:1150-1157`) is right for Alt because the centre does not move. Kinds: every rotated object.

R4. The icon's glyph is written at its stated size, not the box. `packages/render/src/blocks/primitives.ts:601-618` (`renderIcon`) sets `width:${size}px;height:${size}px` from `block.size ?? 24` and `packages/render/src/block-css.ts:172` sizes `svg.icon-block` only as `display: block`; the canvas rules of `:174-235` give `.free > .box`, `svg.shape`, `.picture`, `.material`, `svg.chart` and `.shape-block` `width: 100%; height: 100%` but no rule for `svg.icon-block`, so the box resizes and the glyph stays 24 px (section 1.5). Kinds: icon.

R5. The diagram scales in width only. `packages/theme/src/gt-ink-paper/sheet.css:601-606` gives `svg.dia` `width: 100%; height: auto`, and `packages/render/src/blocks/dia.ts:104-108` rewrites only the `viewBox` width for `fit: 'slot'`, keeping the viewBox height, so a height drag changes the box and not the drawing, and a width drag stretches the coordinate space rather than scaling the strokes. Predicted from the code and not yet measured (the full run stopped at the diagram insert). Kinds: diagram.

R6. The inspector's W and H fields were absent. With an object selected and Format options open, no `formatOptions.size.width` or `formatOptions.size.height` control existed on the page (`packages/chrome/src/inspector/geometry.tsx:186-200` names them). The cause is not pinned here; the script now dumps the panel's controls, inputs and text per row for the next run.

R7. One drag on a fresh handle press moved the object instead of resizing it (`run-smoke`: the rectangle's nw at 680, 70 moved to 723, 97 with the size unchanged and no size readout; the chart's nw likewise). It did not recur in `run-smoke2` and `run-smoke3`, where the element under the press was the handle (`topAt`). The candidate is the overlay's placement after a zoom change: `Editor.tsx:4114-4124` positions the overlay from the `scroll` state the scroller's `onScroll` sets, one frame behind the sheet, so a press taken from the handle's box before the overlay caught up lands on the object's body, which `armPress` turns into a move (`Editor.tsx:3441-3460`). The script now reads `topAt` on every press and waits for a stable handle box; the next run's rows decide.

### 1.8 Cleanup

Every deck the runs created on production was trashed and deleted forever through the actions API with the agent bearer (`cleanup-api.mjs` and the script's own `finally` block: `deck.info`, `deck.trash` with `baseRevision`, `deck.remove` with `confirm` and `baseRevision`, then a `/edit/<id>` probe): `untitled-20260914-8jon` (the first smoke attempt, trashed and removed by hand, probe 404), `untitled-20260914-v0tz`, `untitled-20260914-0ov9`, `untitled-20260914-rtva`, `untitled-20260914-w2ts`, `untitled-20260914-8zbo`, `untitled-20260914-h8je` (each `deck.trash` 200, `deck.remove` 200 `removed: true`, `/edit` probe 404). `untitled-20260914-9t83` (`run-full`) was removed by the run's `finally` block (`deck.trash` 200 at revision 42, `deck.remove` 200 `removed: true`, `/edit` probe 404; `full.log`). A final probe of every id on `/edit/<id>` answered 404.

The `.turboslide/e2e.lock` existed from 15:34 with no `playwright test` runner alive (other rounds' `playwright-core` scripts ran beside it); the smoke runs went ahead without taking it after a minute of that state and said so in their logs, and `run-full` took the lock (it was free by then) and released it at its end.

### 1.9 Files

The reproducer touched only `docs/gslides-parity/build-4/hotfix-3.md`.

### 1.10 The script

`repro.mjs` as run (the smoke runs passed `--kinds`, `--zooms 1`, `--mods plain`; the full run `--rotated 1 --reduced 1`). The diagram fixture in `makeObjects` needs `size: 20` on each `texts` entry before the next full run:

```js
#!/usr/bin/env node
// Hotfix 3 reproduction (gslides-parity build-4/hotfix-3.md section 1): the resize handles on
// production. Headless Chromium (playwright-core from the repo) opens /new, makes a deck, inserts
// one object of every kind the Insert menu offers plus the kinds that need a dialog or a template
// slide, groups two, and drags the eight resize squares of every object by known deltas at zoom
// 50, 100 and 200 percent, plain, with Shift and with Alt, and once with the object rotated 30
// degrees. After every drag it records the pointer's final sheet point against the dragged edge or
// corner, the box before and after (pos and DOM rect), the content's rendered size against the box,
// the inspector's W and H, the live readout, whether the object moved at pointer down, whether the
// committed box differs from the last preview (a jump at pointer up), the filmstrip clone's box,
// and, once per group of handles, that one undo restores the previous box. Screenshots of each
// object before and after at 2x, and one headless render of the slide compared with the editor's
// stage per object. Trashes and deletes the deck it made through the actions API at the end.
//
//   node repro.mjs [--base https://turboslide.vercel.app] [--out <dir>] [--viewport 1440x900]
//                  [--kinds a,b] [--zooms 1,0.5,2] [--mods plain,shift,alt] [--handles nw,n,...]
//                  [--rotated 0|1] [--reduced 0|1] [--keep-deck] [--deck <id>]
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const sharp = require('sharp');
const { default: pixelmatch } = await import(require.resolve('pixelmatch'));

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'https://turboslide.vercel.app').replace(/\/$/, '');
const OUT = arg(
  'out',
  '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/hotfix3/run',
);
const [VW, VH] = arg('viewport', '1440x900').split('x').map(Number);
const ZOOMS = arg('zooms', '1,0.5,2').split(',').map(Number);
const MODS = arg('mods', 'plain,shift,alt').split(',');
const HANDLES = arg('handles', 'nw,n,ne,e,se,s,sw,w').split(',');
const ROTATED = arg('rotated', '1') === '1';
const REDUCED = arg('reduced', '1') === '1';
const KEEP = argv.includes('--keep-deck');
const ONLY = arg('kinds', '') ? new Set(arg('kinds', '').split(',')) : null;
const EXISTING = arg('deck', '');
mkdirSync(OUT, { recursive: true });

const REPO = '/Users/kevinliu/repos/Turboslide';
const LOCK = join(REPO, '.turboslide', 'e2e.lock');
const hosts = JSON.parse(readFileSync(`${process.env.HOME}/.config/turboslide/hosts.json`, 'utf8'));
const TOKEN = hosts.hosts?.[BASE]?.token ?? null;

const T0 = Date.now();
const t = () => Date.now() - T0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const say = (line) => {
  const row = `[${String(t()).padStart(7)} ms] ${line}`;
  log.push(row);
  console.log(row);
};
const rows = [];
const flush = () => {
  writeFileSync(join(OUT, 'matrix.json'), JSON.stringify(rows, null, 1));
  writeFileSync(join(OUT, 'run.log'), log.join('\n') + '\n');
};
const round2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);

// -----------------------------------------------------------------------------------------------
// The e2e lock: never overlap another Playwright run on this machine (AGENTS.md dev server rules)

/** True while a `playwright test` runner is alive on this machine (the runs the lock serializes). */
function playwrightTestRunning() {
  try {
    const out = execSync(
      "ps -axo command | grep -E 'playwright(/cli\\.js)? test|@playwright/test/cli' | grep -v grep",
      { encoding: 'utf8' },
    );
    return out.trim().length > 0;
  } catch {
    return false;
  }
}
let lockOwned = false;
async function takeLock() {
  let waited = 0;
  let idleChecks = 0;
  for (;;) {
    try {
      mkdirSync(LOCK);
      lockOwned = true;
      say(`took ${LOCK}`);
      return;
    } catch {
      if (waited % 60_000 === 0) say(`waiting for ${LOCK} (held by another run)`);
      /* a lock left behind by a run whose `playwright test` process is gone: this script is a
         single page playwright-core run against production (no dev server, no port), so it goes
         ahead without taking the lock and says so, once no test runner has been seen for a minute */
      idleChecks = playwrightTestRunning() ? 0 : idleChecks + 1;
      if (idleChecks >= 12) {
        say(`${LOCK} exists but no playwright test runner is alive; proceeding without taking it`);
        return;
      }
      await sleep(5000);
      waited += 5000;
    }
  }
}
function dropLock() {
  if (!lockOwned) return;
  try {
    rmdirSync(LOCK);
    lockOwned = false;
    say(`released ${LOCK}`);
  } catch {
    // already gone
  }
}

// -----------------------------------------------------------------------------------------------
// The browser

await takeLock();
process.on('exit', dropLock);
process.on('SIGINT', () => {
  dropLock();
  process.exit(130);
});

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 2,
});
await context.tracing.start({ screenshots: false, snapshots: false, sources: false });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push({ t: t(), text: String(e).slice(0, 300) }));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning')
    consoleErrors.push({ t: t(), type: m.type(), text: m.text().slice(0, 300) });
});
const staleAnswers = [];
page.on('response', async (response) => {
  const url = response.url();
  if (!url.startsWith(BASE)) return;
  if (response.request().method() !== 'POST') return;
  if (!/_serverFn|\/api\/decks\//.test(url)) return;
  try {
    const text = await response.text();
    if (/is stale|resync|changed in the Blob store/.test(text))
      staleAnswers.push({
        t: t(),
        path: url.slice(BASE.length, BASE.length + 80),
        status: response.status(),
        text: text.slice(0, 200),
      });
  } catch {
    // body already consumed
  }
});

// -----------------------------------------------------------------------------------------------
// Studio helpers (window.turboslide.studio, SPEC 7.4)

const st = () =>
  page.evaluate(() => {
    const studio = window.turboslide?.studio;
    if (!studio) return { missing: true };
    const s = studio.describe().state;
    return {
      deckId: s.deckId,
      slideId: s.slideId,
      blockId: s.blockId,
      revision: s.revision,
      serverRevision: s.serverRevision,
      pending: s.pending,
      zoom: s.zoom ?? (s.view && s.view.zoom),
    };
  });
const invoke = (action, input) =>
  page.evaluate(([a, i]) => window.turboslide.studio.invoke(a, i), [action, input]);
/** The read only actions take no baseRevision (their input objects are strict). */
const READ_ONLY =
  /^(view\.|slide\.list$|slide\.get$|deck\.info$|material\.list$|lint\.run$|sync\.status$|presence\.list$)/;
async function act(action, input) {
  if (READ_ONLY.test(action)) return invoke(action, input);
  /* a scripted write waits for the last one to land on the server: on this production build a
     block.set that follows a block.insert inside the flight is refused with "No block" (the
     write path hotfix 2 is fixing), which is not what this round measures */
  await settle(10_000);
  const s = await st();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await invoke(action, { ...input, baseRevision: (await st()).revision });
    } catch (error) {
      const text = String(error);
      if (attempt < 2 && /ConflictError|No block|is stale|revision/.test(text)) {
        say(`  ${action} retried after: ${text.slice(0, 120)}`);
        await sleep(800);
        await settle(10_000);
        continue;
      }
      throw error;
    }
  }
  return invoke(action, { ...input, baseRevision: s.revision });
}
const source = () => page.evaluate(() => JSON.parse(window.turboslide.studio.readSource()));
const posOf = async (id) => (await source()).slots?.main?.find((b) => b.id === id)?.pos ?? null;
const blockOf = async (id) => {
  const slide = await source();
  return Object.values(slide.slots ?? {})
    .flat()
    .find((b) => b.id === id);
};

async function waitStudio(timeout = 90_000) {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout });
}
async function waitRev(from, timeout = 8000) {
  try {
    await page.waitForFunction(
      (r) => {
        const s = window.turboslide?.studio?.describe().state;
        return Boolean(s) && s.revision > r;
      },
      from,
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}
/**
 * True once the document's own revision has caught up with the reported one (the room's answer
 * moves the reported revision first; the document follows the checkpoint frame): a drag committed
 * before that meets hotfix 2's cause A5 ("baseRevision N is stale") and is not a resize measurement.
 */
async function waitCaughtUp(timeout = 10_000) {
  const t1 = Date.now();
  try {
    await page.waitForFunction(
      () => {
        const s = window.turboslide?.studio?.describe().state;
        if (!s) return false;
        const doc = s.document && s.document.deck ? s.document.deck.revision : s.revision;
        return doc >= s.revision && (s.sync ? s.sync.pending === 0 : true);
      },
      null,
      { timeout },
    );
    return { ok: true, ms: Date.now() - t1 };
  } catch {
    const s = await page.evaluate(() => {
      const s = window.turboslide?.studio?.describe().state ?? {};
      return {
        revision: s.revision,
        doc: s.document && s.document.deck ? s.document.deck.revision : null,
        pending: s.pending,
        sync: s.sync
          ? { pending: s.sync.pending, seq: s.sync.seq, revision: s.sync.revision }
          : null,
      };
    });
    return { ok: false, ms: Date.now() - t1, state: s };
  }
}
async function settle(timeout = 12_000) {
  try {
    await page.waitForFunction(
      () => {
        const s = window.turboslide?.studio?.describe().state;
        return Boolean(s) && s.pending === 0 && s.serverRevision >= s.revision;
      },
      null,
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}
async function gotoSlide(slideId) {
  await act('view.goto', { slideId });
  await page.waitForFunction(
    (id) => window.turboslide?.studio?.describe().state.slideId === id,
    slideId,
    { timeout: 10_000 },
  );
  await sleep(400);
}
async function setZoom(zoom, center) {
  await act('view.zoom', { zoom, ...(center ? { center } : {}) });
  await sleep(180);
}

const STAGE = '.ts-stagewrap.ts-editor .ts-stage';
const geom = () =>
  page.evaluate((sel) => {
    const stage = document.querySelector(sel);
    if (!stage) return null;
    const r = stage.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, k: r.width / 1600 };
  }, STAGE);

/** Everything the report reads about one object at one moment, in sheet pixels. */
const snapshot = (id, members = []) =>
  page.evaluate(
    ([sel, id, members]) => {
      const stage = document.querySelector(sel);
      if (!stage) return { error: 'no stage' };
      const sr = stage.getBoundingClientRect();
      const k = sr.width / 1600;
      const r2 = (v) => Math.round(v * 100) / 100;
      const toSheet = (r) => [
        r2((r.left - sr.left) / k),
        r2((r.top - sr.top) / k),
        r2(r.width / k),
        r2(r.height / k),
      ];
      const body = stage.querySelector('.pt-slide');
      const wrap =
        body?.querySelector(`.free[data-free="${id}"]`) ??
        body?.querySelector(`[data-block="${id}"]`) ??
        null;
      const out = {
        t: Date.now(),
        k: r2(k),
        stage: [sr.left, sr.top, sr.width, sr.height].map(r2),
      };
      out.rect = wrap ? toSheet(wrap.getBoundingClientRect()) : null;
      out.isWrapper = wrap ? wrap.classList.contains('free') : false;
      out.inline = wrap
        ? {
            left: wrap.style.left,
            top: wrap.style.top,
            width: wrap.style.width,
            height: wrap.style.height,
            transform: wrap.style.transform || null,
          }
        : null;
      const inner = wrap ? wrap.firstElementChild : null;
      if (inner) {
        const c = {
          tag: inner.tagName.toLowerCase(),
          rect: toSheet(inner.getBoundingClientRect()),
        };
        c.cls = typeof inner.className === 'string' ? inner.className : inner.getAttribute('class');
        c.fontSize = getComputedStyle(inner).fontSize;
        if (inner instanceof SVGElement) {
          c.viewBox = inner.getAttribute('viewBox');
          c.svgSize = [inner.getAttribute('width'), inner.getAttribute('height')];
          const g = inner.querySelector('path, rect, ellipse, line, polygon, use');
          if (g && g.getBBox) {
            try {
              const b = g.getBBox();
              c.bbox = [b.x, b.y, b.width, b.height].map(r2);
            } catch {
              // a use without a target
            }
          }
          c.from = inner.getAttribute('data-from');
          c.to = inner.getAttribute('data-to');
        }
        const svg = wrap.querySelector('svg');
        if (svg && !(inner instanceof SVGElement)) {
          c.svg = {
            rect: toSheet(svg.getBoundingClientRect()),
            viewBox: svg.getAttribute('viewBox'),
          };
        }
        const img = wrap.querySelector('img');
        if (img)
          c.img = {
            rect: toSheet(img.getBoundingClientRect()),
            natural: [img.naturalWidth, img.naturalHeight],
            fit: getComputedStyle(img).objectFit,
          };
        const canvas = wrap.querySelector('canvas');
        if (canvas)
          c.canvas = {
            rect: toSheet(canvas.getBoundingClientRect()),
            size: [canvas.width, canvas.height],
          };
        const live = wrap.querySelector('.ts-material-live');
        if (live) c.live = toSheet(live.getBoundingClientRect());
        const textEl = inner.matches('p, h1, h2, h3, .big, .box, .shape-block, .credit')
          ? inner.matches('.box')
            ? (inner.querySelector('.box-text') ?? inner)
            : inner.matches('.shape-block')
              ? inner.querySelector('.shape-text')
              : inner
          : wrap.querySelector('p, h1, h2, .box-text, .shape-text');
        if (textEl) {
          const range = document.createRange();
          range.selectNodeContents(textEl);
          const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
          const tops = new Set(rects.map((r) => Math.round(r.top)));
          c.text = {
            lines: tops.size,
            fontSize: getComputedStyle(textEl).fontSize,
            rect: toSheet(textEl.getBoundingClientRect()),
            scroll: [r2(textEl.scrollWidth / 1), r2(textEl.scrollHeight / 1)],
            inkRect: rects.length
              ? toSheet({
                  left: Math.min(...rects.map((r) => r.left)),
                  top: Math.min(...rects.map((r) => r.top)),
                  width:
                    Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left)),
                  height:
                    Math.max(...rects.map((r) => r.bottom)) - Math.min(...rects.map((r) => r.top)),
                })
              : null,
          };
        }
        const table = wrap.querySelector('.table');
        if (table) {
          const tr = table.querySelector('.tr');
          c.table = {
            rect: toSheet(table.getBoundingClientRect()),
            rows: table.querySelectorAll('.tr').length,
            fontSize: getComputedStyle(table).fontSize,
            cols: tr ? getComputedStyle(tr).gridTemplateColumns : null,
          };
        }
        out.content = c;
      } else out.content = null;
      if (members.length > 0) {
        out.members = members.map((m) => {
          const w = body?.querySelector(`.free[data-free="${m}"]`);
          const inner2 = w?.firstElementChild;
          return {
            id: m,
            rect: w ? toSheet(w.getBoundingClientRect()) : null,
            fontSize: inner2 ? getComputedStyle(inner2).fontSize : null,
          };
        });
      }
      const val = (s) => {
        const el = document.querySelector(s);
        if (!el) return null;
        return 'value' in el ? el.value : el.textContent;
      };
      out.inspector = {
        w: val('[data-control="formatOptions.size.width"]'),
        h: val('[data-control="formatOptions.size.height"]'),
        posW: val(`[data-control="block.${id}.pos.w"]`),
        posH: val(`[data-control="block.${id}.pos.h"]`),
        x: val('[data-control="formatOptions.position.x"]'),
        y: val('[data-control="formatOptions.position.y"]'),
      };
      out.readout = document.querySelector('.ts-readout')?.textContent ?? null;
      out.editing =
        document.querySelector('.ts-stagewrap.ts-editor')?.hasAttribute('data-editing') ?? false;
      out.formatControls = [...document.querySelectorAll('[data-control^="formatOptions."]')]
        .map((e) => e.getAttribute('data-control'))
        .slice(0, 40);
      const panel = document.querySelector('[data-control="panel.formatOptions"]');
      out.panel = panel
        ? {
            controls: [...panel.querySelectorAll('[data-control]')]
              .map((e) => e.getAttribute('data-control'))
              .slice(0, 40),
            text: (panel.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 240),
            inputs: [...panel.querySelectorAll('input')]
              .map((e) => ({ label: e.getAttribute('aria-label'), value: e.value }))
              .slice(0, 12),
          }
        : null;
      out.guides = document.querySelectorAll('.ts-guide').length;
      const ring = document.querySelector(
        '.ts-overlay .ts-turn .ts-select, .ts-overlay .ts-select.is-selected',
      );
      out.ring = ring ? toSheet(ring.getBoundingClientRect()) : null;
      const state = window.turboslide.studio.describe().state;
      out.blockId = state.blockId;
      out.revision = state.revision;
      /* the filmstrip clone of the slide: the wrapper's box in the clone's own sheet pixels */
      const clones = [...document.querySelectorAll(`.free[data-free="${id}"]`)].filter(
        (el) => !el.closest('.ts-stagewrap') && !el.closest('.ts-canvas-measure'),
      );
      out.thumb = clones.slice(0, 2).map((el) => {
        const root = el.closest('.ts-stage') ?? el.closest('.pt-slide') ?? el.parentElement;
        const rr = root.getBoundingClientRect();
        const kk = rr.width / 1600;
        const r = el.getBoundingClientRect();
        return kk > 0
          ? [
              r2((r.left - rr.left) / kk),
              r2((r.top - rr.top) / kk),
              r2(r.width / kk),
              r2(r.height / kk),
            ]
          : null;
      });
      return out;
    },
    [STAGE, id, members],
  );

// -----------------------------------------------------------------------------------------------
// Selection

const control = (id) => page.locator(`[data-control="${id}"]`).first();

async function clickSelect(id, point) {
  const g = await geom();
  if (!g) return false;
  await page.mouse.click(g.left + point.x * g.k, g.top + point.y * g.k);
  try {
    await page.waitForFunction(
      (want) => window.turboslide?.studio?.describe().state.blockId === want,
      id,
      { timeout: 1200 },
    );
    return true;
  } catch {
    return false;
  }
}

/** Selects an object: a press inside its box near the top left, else the inspector's Block row. */
async function select(id, opts = {}) {
  const now = await st();
  if (now.blockId === id && !opts.force) return 'kept';
  const pos = (await posOf(id)) ?? opts.box ?? null;
  if (pos) {
    const inset = opts.inset ?? { x: Math.min(12, pos.w / 2), y: Math.min(8, pos.h / 2) };
    const points = opts.point
      ? [opts.point]
      : [
          { x: pos.x + inset.x, y: pos.y + inset.y },
          { x: pos.x + pos.w - inset.x, y: pos.y + pos.h - inset.y },
          { x: pos.x + pos.w / 2, y: pos.y + pos.h / 2 },
        ];
    for (const pt of points) {
      await page.keyboard.press('Escape');
      await sleep(120);
      if (await clickSelect(id, pt)) {
        /* a click inside a text run places the caret (SPEC 10.2); Escape steps back to the block,
         whose handles the overlay draws only outside the caret state */
        const editing = await page.evaluate(
          () =>
            document.querySelector('.ts-stagewrap.ts-editor')?.hasAttribute('data-editing') ??
            false,
        );
        if (editing) {
          await page.keyboard.press('Escape');
          await sleep(150);
          const still = await st();
          if (still.blockId === id) return 'click+escape';
          if (await clickSelect(id, pt)) {
            await page.keyboard.press('Escape');
            await sleep(150);
            if ((await st()).blockId === id) return 'click+escape';
          }
        } else return 'click';
      }
    }
  }
  await page.keyboard.press('Escape');
  await sleep(120);
  const row = control(`inspector.block.${id}`);
  if ((await row.count()) > 0) {
    await row.click();
    try {
      await page.waitForFunction(
        (want) => window.turboslide?.studio?.describe().state.blockId === want,
        id,
        { timeout: 1500 },
      );
      return 'row';
    } catch {
      // fall through
    }
  }
  return 'failed';
}

// -----------------------------------------------------------------------------------------------
// Geometry

const deg = Math.PI / 180;
function rotatedCorner(pos, dir) {
  const cx = pos.x + pos.w / 2;
  const cy = pos.y + pos.h / 2;
  const lx = dir.includes('w') ? pos.x : dir.includes('e') ? pos.x + pos.w : cx;
  const ly = dir.includes('n') ? pos.y : dir.includes('s') ? pos.y + pos.h : cy;
  const a = ((pos.rotate ?? 0) % 360) * deg;
  const dx = lx - cx;
  const dy = ly - cy;
  return {
    x: cx + dx * Math.cos(a) - dy * Math.sin(a),
    y: cy + dx * Math.sin(a) + dy * Math.cos(a),
  };
}
function handlePoint(pos, dir) {
  return rotatedCorner(pos, dir);
}
/** The delta of one handle drag, chosen so a round of eight handles nets to about zero drift. */
function deltaFor(dir, size) {
  const gx = Math.max(24, Math.min(64, Math.round(size.w * 0.18)));
  const gy = Math.max(16, Math.min(48, Math.round(size.h * 0.18)));
  switch (dir) {
    case 'n':
      return { dx: 0, dy: -gy };
    case 's':
      return { dx: 0, dy: gy };
    case 'e':
      return { dx: gx, dy: 0 };
    case 'w':
      return { dx: -gx, dy: 0 };
    case 'nw':
      return { dx: gx, dy: gy };
    case 'ne':
      return { dx: -gx, dy: gy };
    case 'se':
      return { dx: -gx, dy: -gy };
    case 'sw':
      return { dx: gx, dy: -gy };
    default:
      return { dx: 0, dy: 0 };
  }
}
const boxEq = (a, b, tol = 0.51) =>
  a && b && a.length === 4 && b.length === 4 && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const boxDiff = (a, b) => (a && b ? a.map((v, i) => round2(b[i] - v)) : null);

// -----------------------------------------------------------------------------------------------
// One drag

let shotIndex = 0;
async function shot(name) {
  shotIndex += 1;
  const g = await geom();
  const file = `${String(shotIndex).padStart(3, '0')}-${name}.png`;
  const clip = g
    ? {
        x: Math.max(0, g.left - 4),
        y: Math.max(0, g.top - 30),
        width: Math.min(VW - Math.max(0, g.left - 4), g.width + 8),
        height: Math.min(VH - Math.max(0, g.top - 30), g.height + 40),
      }
    : undefined;
  await page.screenshot({ path: join(OUT, file), ...(clip ? { clip } : {}) });
  return file;
}

async function undoOnce() {
  const s0 = await st();
  const button = control('toolbar.undo');
  if ((await button.count()) > 0 && (await button.isEnabled().catch(() => false)))
    await button.click();
  else await page.keyboard.press('Meta+z');
  const ok = await waitRev(s0.revision, 6000);
  await sleep(250);
  return ok;
}

async function dragHandle(spec) {
  const { kind, id, anchor, dir, zoom, mod, members = [], convertPath = false } = spec;
  const row = { kind, id, anchor, dir, zoom, mod, rotated: spec.rotated ?? 0, t: t() };
  try {
    const pos0 = (await posOf(anchor)) ?? spec.fallbackBox ?? null;
    if (!pos0) {
      row.error = 'no pos before the drag';
      return row;
    }
    row.posBefore = pos0;
    const unionBefore = spec.union ? await spec.union() : null;
    const geomBox = unionBefore ?? pos0;
    const point = handlePoint(geomBox, dir);
    await setZoom(zoom, point);
    const picked = await select(anchor, {
      box: pos0,
      ...(spec.selectPoint ? { point: spec.selectPoint } : {}),
    });
    row.selectedBy = picked;
    if (picked === 'failed') {
      row.error = 'could not select';
      return row;
    }
    const handle = page
      .locator(`.ts-overlay [data-control="handle.${anchor}.resize.${dir}"]`)
      .first();
    try {
      await handle.waitFor({ timeout: 4000 });
    } catch {
      row.error = `no handle handle.${anchor}.resize.${dir}`;
      row.handlesPresent = await page.evaluate(() =>
        [...document.querySelectorAll('.ts-overlay [data-control^="handle."]')].map((e) =>
          e.getAttribute('data-control'),
        ),
      );
      return row;
    }
    let hb = await handle.boundingBox();
    for (let i = 0; i < 8; i += 1) {
      await sleep(120);
      const again = await handle.boundingBox();
      if (again && hb && Math.abs(again.x - hb.x) < 0.5 && Math.abs(again.y - hb.y) < 0.5) break;
      hb = again;
    }
    let g = await geom();
    const { dx, dy } = spec.delta ?? deltaFor(dir, geomBox);
    row.delta = { dx, dy };
    let cx = hb.x + hb.width / 2;
    let cy = hb.y + hb.height / 2;
    let tx = cx + dx * g.k;
    let ty = cy + dy * g.k;
    const inside = (x, y) => x > 8 && y > 8 && x < VW - 8 && y < VH - 8;
    if (!inside(cx, cy) || !inside(tx, ty)) {
      await setZoom(zoom, { x: point.x + dx / 2, y: point.y + dy / 2 });
      await select(anchor, { box: pos0 });
      await handle.waitFor({ timeout: 4000 });
      hb = await handle.boundingBox();
      g = await geom();
      cx = hb.x + hb.width / 2;
      cy = hb.y + hb.height / 2;
      tx = cx + dx * g.k;
      ty = cy + dy * g.k;
    }
    row.k = round2(g.k);
    row.handleCss = { x: round2(cx), y: round2(cy), w: round2(hb.width), h: round2(hb.height) };
    /* the element the press will land on: the handle, or whatever the overlay draws over it */
    row.topAt = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        const control = el.closest('[data-control]')?.getAttribute('data-control') ?? null;
        return {
          tag: el.tagName.toLowerCase(),
          cls: String(el.className).slice(0, 60),
          control,
          side: el.getAttribute('data-side'),
        };
      },
      [cx, cy],
    );
    /* the handle's centre against the corner it stands for, in sheet px (the overlay's placement) */
    const handleSheet = { x: (cx - g.left) / g.k, y: (cy - g.top) / g.k };
    row.handleOffset = { x: round2(handleSheet.x - point.x), y: round2(handleSheet.y - point.y) };
    row.caughtUp = await waitCaughtUp();
    const s0 = await st();
    const before = await snapshot(anchor, members);
    row.before = before;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await sleep(90);
    const atDown = await snapshot(anchor, members);
    row.atDown = { rect: atDown.rect, revision: atDown.revision, blockId: atDown.blockId };
    row.jumpAtDown = boxDiff(before.rect, atDown.rect);
    if (mod === 'shift') await page.keyboard.down('Shift');
    if (mod === 'alt') await page.keyboard.down('Alt');
    const steps = 8;
    for (let i = 1; i <= steps; i += 1) {
      await page.mouse.move(cx + ((tx - cx) * i) / steps, cy + ((ty - cy) * i) / steps);
      if (i === 1) await sleep(40);
    }
    await sleep(160);
    const preview = await snapshot(anchor, members);
    row.preview = {
      rect: preview.rect,
      ring: preview.ring,
      readout: preview.readout,
      guides: preview.guides,
      inspector: preview.inspector,
      content: preview.content,
      members: preview.members,
    };
    await page.mouse.up();
    if (mod === 'shift') await page.keyboard.up('Shift');
    if (mod === 'alt') await page.keyboard.up('Alt');
    /* the commit wait doubles as a poll of the snackbar: a refusal shows for a few seconds only */
    const deadline = Date.now() + (convertPath ? 15_000 : 8000);
    const notices = [];
    let committed = false;
    while (Date.now() < deadline) {
      const probe = await page.evaluate((r) => {
        const bar = document.querySelector('[data-control="snackbar"]');
        const s = window.turboslide?.studio?.describe().state ?? {};
        return {
          snackbar: bar ? (bar.textContent ?? '').trim().slice(0, 200) : null,
          error: s.error ?? null,
          pending: s.pending,
          serverRevision: s.serverRevision,
          revision: s.revision,
          sync: s.sync
            ? {
                seq: s.sync.seq,
                pending: s.sync.pending,
                revision: s.sync.revision,
                status: s.sync.status,
              }
            : null,
          committed: typeof s.revision === 'number' && s.revision > r,
        };
      }, s0.revision);
      if (probe.snackbar && !notices.some((n) => n.snackbar === probe.snackbar))
        notices.push({ at: Date.now() - (deadline - (convertPath ? 15_000 : 8000)), ...probe });
      if (probe.committed) {
        committed = true;
        row.notice = probe;
        break;
      }
      await sleep(150);
    }
    row.committed = committed;
    row.notices = notices;
    if (!committed) {
      row.notice = await page.evaluate(() => {
        const bar = document.querySelector('[data-control="snackbar"]');
        const s = window.turboslide?.studio?.describe().state ?? {};
        return {
          snackbar: bar ? (bar.textContent ?? '').trim().slice(0, 200) : null,
          error: s.error ?? null,
          pending: s.pending,
          serverRevision: s.serverRevision,
          revision: s.revision,
          sync: s.sync
            ? {
                seq: s.sync.seq,
                pending: s.sync.pending,
                revision: s.sync.revision,
                status: s.sync.status,
              }
            : null,
        };
      });
    }
    await sleep(300);
    let after = await snapshot(anchor, members);
    for (let i = 0; i < 6; i += 1) {
      await sleep(150);
      const again = await snapshot(anchor, members);
      if (boxEq(after.rect, again.rect, 0.01)) {
        after = again;
        break;
      }
      after = again;
    }
    row.after = after;
    row.posAfter = (await posOf(anchor)) ?? null;
    row.blockAfter = await blockOf(anchor);
    const pointer = { x: (tx - g.left) / g.k, y: (ty - g.top) / g.k };
    row.pointer = { x: round2(pointer.x), y: round2(pointer.y) };
    if (row.posAfter) {
      const after1 = spec.union ? await spec.union() : row.posAfter;
      const corner = rotatedCorner(after1, dir);
      row.corner = { x: round2(corner.x), y: round2(corner.y) };
      const movesX = dir.includes('e') || dir.includes('w');
      const movesY = dir.includes('n') || dir.includes('s');
      row.gap = {
        x: movesX ? round2(corner.x - pointer.x) : null,
        y: movesY ? round2(corner.y - pointer.y) : null,
      };
      const expected = handlePoint(geomBox, dir);
      row.expectedCorner = { x: round2(expected.x + dx), y: round2(expected.y + dy) };
    }
    row.jumpAtUp = boxDiff(preview.rect, after.rect);
    row.rectDelta = boxDiff(before.rect, after.rect);
    row.posDelta = row.posAfter
      ? {
          x: round2(row.posAfter.x - pos0.x),
          y: round2(row.posAfter.y - pos0.y),
          w: round2(row.posAfter.w - pos0.w),
          h: round2(row.posAfter.h - pos0.h),
        }
      : null;
    if (before.content && after.content) {
      row.contentDelta = {
        rect: boxDiff(before.content.rect, after.content.rect),
        fontSize: [before.content.fontSize, after.content.fontSize],
        text:
          before.content.text && after.content.text
            ? {
                lines: [before.content.text.lines, after.content.text.lines],
                fontSize: [before.content.text.fontSize, after.content.text.fontSize],
                ink: [before.content.text.inkRect, after.content.text.inkRect],
              }
            : null,
        img:
          before.content.img && after.content.img
            ? boxDiff(before.content.img.rect, after.content.img.rect)
            : null,
        svg:
          before.content.svg && after.content.svg
            ? {
                rect: boxDiff(before.content.svg.rect, after.content.svg.rect),
                viewBox: [before.content.svg.viewBox, after.content.svg.viewBox],
              }
            : null,
        viewBox: [before.content.viewBox, after.content.viewBox],
        bbox: [before.content.bbox, after.content.bbox],
        table:
          before.content.table && after.content.table
            ? {
                rows: [before.content.table.rows, after.content.table.rows],
                font: [before.content.table.fontSize, after.content.table.fontSize],
                rect: boxDiff(before.content.table.rect, after.content.table.rect),
                cols: [before.content.table.cols, after.content.table.cols],
              }
            : null,
        live:
          before.content.live && after.content.live
            ? boxDiff(before.content.live, after.content.live)
            : null,
        canvas:
          before.content.canvas && after.content.canvas
            ? boxDiff(before.content.canvas.rect, after.content.canvas.rect)
            : null,
      };
    }
    row.thumbMatch = after.thumb?.[0] ? boxDiff(after.rect, after.thumb[0]) : null;
    row.stale = staleAnswers.length;
  } catch (error) {
    row.error = String(error).slice(0, 300);
    try {
      await page.mouse.up();
      await page.keyboard.up('Shift');
      await page.keyboard.up('Alt');
    } catch {
      // nothing held
    }
  }
  return row;
}

// -----------------------------------------------------------------------------------------------
// The render comparison (the headless measure against the editor)

async function renderCompare(kind, id, slideId, deckId, box) {
  const out = { kind, id, slideId };
  try {
    await settle(20_000);
    await page.keyboard.press('Escape');
    await page.mouse.move(4, VH - 4);
    await sleep(200);
    await setZoom('fit');
    await sleep(400);
    const g = await geom();
    out.editorRevision = (await st()).revision;
    const stageShot = await page.screenshot({
      clip: { x: g.left, y: g.top, width: g.width, height: g.height },
    });
    const editor = await sharp(stageShot)
      .resize(1600, 900, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const editorPaper = [
      editor[(4 * 1600 + 4) * 4],
      editor[(4 * 1600 + 4) * 4 + 1],
      editor[(4 * 1600 + 4) * 4 + 2],
    ];
    const theme = editorPaper[0] < 128 ? 'dark' : 'light';
    out.theme = theme;
    const headers = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};
    const t1 = Date.now();
    const response = await fetch(
      `${BASE}/api/render/${encodeURIComponent(slideId)}?deck=${encodeURIComponent(deckId)}&theme=${theme}&scale=1`,
      { headers },
    );
    out.renderStatus = response.status;
    out.renderMs = Date.now() - t1;
    out.renderRecord = (response.headers.get('x-turboslide-record') ?? '').slice(0, 300);
    if (!response.ok) {
      out.error = (await response.text()).slice(0, 200);
      return out;
    }
    const png = Buffer.from(await response.arrayBuffer());
    writeFileSync(join(OUT, `render-${kind}.png`), png);
    const meta = await sharp(png).metadata();
    out.renderSize = [meta.width, meta.height];
    const render = await sharp(png)
      .resize(1600, 900, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const diff = Buffer.alloc(1600 * 900 * 4);
    const mismatched = pixelmatch(editor, render, diff, 1600, 900, { threshold: 0.1 });
    out.mismatch = round2(mismatched / (1600 * 900));
    await sharp(diff, { raw: { width: 1600, height: 900, channels: 4 } })
      .png()
      .toFile(join(OUT, `diff-${kind}.png`));
    await sharp(stageShot)
      .resize(1600, 900, { fit: 'fill' })
      .png()
      .toFile(join(OUT, `editor-${kind}.png`));
    /* the object's ink box in both images: pixels that differ from the paper sampled at (4, 4) */
    const inkBox = (buf) => {
      const paper = [
        buf[(4 * 1600 + 4) * 4],
        buf[(4 * 1600 + 4) * 4 + 1],
        buf[(4 * 1600 + 4) * 4 + 2],
      ];
      const x0 = Math.max(0, Math.floor(box.x - 30));
      const y0 = Math.max(0, Math.floor(box.y - 30));
      const x1 = Math.min(1599, Math.ceil(box.x + box.w + 30));
      const y1 = Math.min(899, Math.ceil(box.y + box.h + 30));
      let minX = Infinity,
        minY = Infinity,
        maxX = -1,
        maxY = -1,
        count = 0;
      for (let y = y0; y <= y1; y += 1)
        for (let x = x0; x <= x1; x += 1) {
          const i = (y * 1600 + x) * 4;
          if (
            Math.abs(buf[i] - paper[0]) +
              Math.abs(buf[i + 1] - paper[1]) +
              Math.abs(buf[i + 2] - paper[2]) >
            60
          ) {
            count += 1;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      return count > 0
        ? { box: [minX, minY, maxX - minX + 1, maxY - minY + 1], pixels: count, paper }
        : { box: null, pixels: 0, paper };
    };
    out.editorInk = inkBox(editor);
    out.renderInk = inkBox(render);
    out.pos = box;
    /* the mismatch inside the object's region alone */
    let regionMismatch = 0;
    let regionPixels = 0;
    const rx0 = Math.max(0, Math.floor(box.x - 8));
    const ry0 = Math.max(0, Math.floor(box.y - 8));
    const rx1 = Math.min(1599, Math.ceil(box.x + box.w + 8));
    const ry1 = Math.min(899, Math.ceil(box.y + box.h + 8));
    for (let y = ry0; y <= ry1; y += 1)
      for (let x = rx0; x <= rx1; x += 1) {
        regionPixels += 1;
        const i = (y * 1600 + x) * 4;
        if (diff[i] === 255 && diff[i + 1] === 0 && diff[i + 2] === 0) regionMismatch += 1;
      }
    out.regionMismatch = regionPixels ? round2(regionMismatch / regionPixels) : null;
  } catch (error) {
    out.error = String(error).slice(0, 300);
  }
  return out;
}

// -----------------------------------------------------------------------------------------------
// The deck and the objects

const report = {
  base: BASE,
  viewport: [VW, VH],
  startedAt: new Date(T0).toISOString(),
  zooms: ZOOMS,
  mods: MODS,
  handles: HANDLES,
  objects: [],
  renders: [],
  undo: [],
  cleanup: [],
};
let deckId = EXISTING || null;

async function boot() {
  if (!deckId) {
    /* /new: the draft's id is known before the first write; the first write saves the deck and,
       on this production build, the slide switch that follows remounts the editor (hotfix 2 cause
       A4), so the studio handle is awaited again and the editor is reopened on /edit/<id> */
    say('open /new');
    await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
    await waitStudio();
    await sleep(1500);
    const s0 = await st();
    deckId = s0.deckId;
    say(`draft ${deckId} r${s0.revision}`);
    await act('slide.new', { layout: 'blank', after: s0.slideId, id: 'canvas-a' });
    await page
      .waitForFunction(
        () => {
          const s = window.turboslide?.studio?.describe().state;
          return Boolean(s) && s.revision >= 1;
        },
        null,
        { timeout: 60_000 },
      )
      .catch(() => say('the first write did not report a revision within 60 s'));
    await settle(60_000);
    const saved = await st();
    say(
      `saved ${saved.deckId ?? deckId} r${saved.revision} (server r${saved.serverRevision}) at ${page.url().slice(BASE.length)}`,
    );
  }
  say(`open /edit/${deckId}`);
  await page.goto(`${BASE}/edit/${encodeURIComponent(deckId)}?edit=1`, {
    waitUntil: 'domcontentloaded',
  });
  await waitStudio();
  await settle(20_000);
  await sleep(800);
  const s = await st();
  say(`editor r${s.revision} slide ${s.slideId}`);
  /* the anonymous identity's name prompt ("How should others see you?") sits over the sheet's corner */
  const prompt = page.locator('text=How should others see you?').first();
  if (await prompt.isVisible().catch(() => false)) {
    const close = prompt
      .locator('xpath=ancestor::*[self::div or self::section or self::form][1]//button')
      .last();
    await close.click({ timeout: 2000 }).catch(() => page.keyboard.press('Escape'));
    await sleep(300);
    report.namePromptDismissed = !(await prompt.isVisible().catch(() => false));
    say(`name prompt dismissed: ${report.namePromptDismissed}`);
  }
  /* Format options open, so the inspector's Width and Height fields exist on the page */
  try {
    if ((await control('toolbar.formatOptions').count()) > 0) {
      await control('toolbar.formatOptions').click();
    } else {
      await control('menubar.format').click();
      await sleep(250);
      await control('menu.format.formatOptions').click({ timeout: 3000 });
    }
    await sleep(500);
    report.formatOptionsOpen = (await control('panel.formatOptions').count()) > 0;
    report.formatOptionsSizeField = (await control('formatOptions.size.width').count()) > 0;
  } catch (error) {
    await page.keyboard.press('Escape');
    report.formatOptionsOpen = false;
    report.formatOptionsError = String(error).slice(0, 160);
  }
  say(
    `format options open: ${report.formatOptionsOpen}, size field present: ${report.formatOptionsSizeField}`,
  );
}

async function ensureSlide(id, layout) {
  const list = await invoke('slide.list', {});
  const ids = (Array.isArray(list) ? list : (list.slides ?? [])).map((s) => s.id ?? s.slideId ?? s);
  if (!ids.includes(id)) {
    const s = await st();
    await act('slide.new', { layout, after: ids[ids.length - 1], id });
    await waitRev(s.revision, 30_000);
    say(`slide ${id} (${layout}) made`);
  }
  await gotoSlide(id);
  const slide = await source();
  if (layout === 'blank' && slide.layout?.type !== 'freeform') {
    const s = await st();
    await act('slide.setLayout', { slideId: id, layout: { type: 'freeform' } });
    await waitRev(s.revision, 30_000);
    say(`slide ${id} set to freeform`);
  }
}

const freshIds = async () =>
  new Set(
    Object.values((await source()).slots ?? {})
      .flat()
      .map((b) => b.id),
  );
async function freshBlock(before, type) {
  const after = Object.values((await source()).slots ?? {}).flat();
  return after.find((b) => b.type === type && !before.has(b.id)) ?? null;
}

/**
 * Walks the menubar's Insert menu (production has no toolbar `+`; the round four editor passes
 * no entries to Toolbar's InsertMenu): `menubar.insert`, then a hover per submenu id, then a
 * click on the last id. False when a row is missing, so the caller falls back to block.insert.
 */
async function menuPick(ids) {
  await page.keyboard.press('Escape');
  await sleep(150);
  const bar = control('menubar.insert');
  if ((await bar.count()) === 0) return false;
  await bar.click();
  await sleep(250);
  for (let i = 0; i < ids.length; i += 1) {
    const item = control(`menu.${ids[i]}`);
    const shown = await item
      .waitFor({ state: 'visible', timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (!shown) {
      const listed = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="menu."]')]
          .map((e) => e.getAttribute('data-control'))
          .slice(0, 80),
      );
      say(`  menu row menu.${ids[i]} missing; rows: ${listed.join(' ')}`);
      await page.keyboard.press('Escape');
      return false;
    }
    if (i < ids.length - 1) {
      await item.hover();
      await sleep(350);
    } else await item.click();
  }
  await sleep(250);
  return true;
}

/** An Insert pick that arms a draw tool: a click on the sheet at `point` places the default box. */
async function insertViaTool(ids, type, point) {
  const before = await freshIds();
  const s = await st();
  if (!(await menuPick(ids))) return null;
  const g = await geom();
  await page.mouse.click(g.left + point.x * g.k, g.top + point.y * g.k);
  const landed = await waitRev(s.revision, 20_000);
  if (!landed) {
    say(`  the click after menu.${ids.join('.')} wrote nothing`);
    await page.keyboard.press('Escape');
    return null;
  }
  await sleep(300);
  await page.keyboard.press('Escape');
  await sleep(200);
  return (await freshBlock(before, type))?.id ?? null;
}

/** An Insert pick that dispatches block.insert at once (a chart, a line). */
async function insertViaMenuRow(ids, type) {
  const before = await freshIds();
  const s = await st();
  if (!(await menuPick(ids))) return null;
  const landed = await waitRev(s.revision, 20_000);
  if (!landed) {
    say(`  menu.${ids.join('.')} wrote nothing`);
    await page.keyboard.press('Escape');
    return null;
  }
  await sleep(300);
  return (await freshBlock(before, type))?.id ?? null;
}

/** Inserts through block.insert with a position (the same action the menu dispatches). */
async function insertViaAction(block, pos) {
  const slide = await source();
  const stack = slide.slots?.main ?? [];
  const last = stack[stack.length - 1]?.id;
  const z = Math.max(0, ...stack.map((b) => b.pos?.z ?? 0)) + 1;
  const s = await st();
  await act('block.insert', {
    slideId: slide.id,
    slot: 'main',
    ...(last ? { after: last } : {}),
    block: { ...block, pos: { ...pos, z } },
  });
  await waitRev(s.revision, 20_000);
  await sleep(250);
  return block.id;
}

async function place(id, box) {
  const pos = await posOf(id);
  if (!pos) return;
  const slide = await source();
  const s = await st();
  await act('block.set', {
    slideId: slide.id,
    blockId: id,
    path: '/pos',
    value: { ...pos, ...box },
  });
  await waitRev(s.revision, 15_000);
  await sleep(200);
}

async function setField(id, path, value) {
  const slide = await source();
  const s = await st();
  await act('block.set', { slideId: slide.id, blockId: id, path, value });
  await waitRev(s.revision, 15_000);
  await sleep(200);
}

const LONG_TEXT =
  'Resize handles keep the opposite edge anchored while the pointer moves the dragged edge. The text reflows in the new width and keeps its size.';

async function pngDataUrl() {
  const png = await sharp({
    create: { width: 96, height: 64, channels: 4, background: { r: 47, g: 92, b: 224, alpha: 1 } },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 48,
            height: 32,
            channels: 4,
            background: { r: 240, g: 160, b: 32, alpha: 1 },
          },
        })
          .png()
          .toBuffer(),
        left: 24,
        top: 16,
      },
    ])
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** Every object under test: id, slide, how it was inserted, the matrix it runs. */
const objects = [];

async function makeObjects() {
  // Slide A: the primitives on a 5 by 3 grid of 300 by 250 cells
  await ensureSlide('canvas-a', 'blank');
  const cell = (i) => ({ x: 80 + (i % 5) * 300, y: 70 + Math.floor(i / 5) * 260 });
  let i = 0;
  const add = async (kind, id, made, box, extra = {}) => {
    const c = cell(i);
    i += 1;
    await place(id, { x: c.x, y: c.y, w: box.w, h: box.h });
    objects.push({ kind, id, slide: 'canvas-a', made, full: extra.full === true, ...extra });
    say(`object ${kind} = ${id} (${made}) at ${c.x},${c.y} ${box.w}x${box.h}`);
  };
  const want = (kind) => ONLY === null || ONLY.has(kind);

  const cellPoint = () => {
    const c = cell(i);
    return { x: c.x + 40, y: c.y + 40 };
  };
  if (want('text')) {
    /* Insert > Text box arms the text tool; the click places the default 480 by 64 box (autofit grow) */
    let made = 'menubar Insert > Text box, one click on the sheet';
    let id = await insertViaTool(['insert.textBox'], 'text', cellPoint());
    if (!id) {
      made = 'block.insert (the menu path failed)';
      id = await insertViaAction(
        { id: 'text-menu', type: 'text', text: 'Text.' },
        { x: 0, y: 0, w: 260, h: 140 },
      );
    }
    await setField(id, '/text', LONG_TEXT);
    await add('text', id, made, { w: 260, h: 140 });
  }
  if (want('text-grow')) {
    const id = await insertViaAction(
      { id: 'text-grow', type: 'text', text: LONG_TEXT, autofit: 'grow' },
      { x: 0, y: 0, w: 260, h: 140 },
    );
    await add(
      'text-grow',
      id,
      'block.insert (autofit grow, as the text tool writes)',
      { w: 260, h: 140 },
      { full: true },
    );
  }
  if (want('text-shrink')) {
    const id = await insertViaAction(
      { id: 'text-shrink', type: 'text', text: LONG_TEXT, autofit: 'shrink' },
      { x: 0, y: 0, w: 260, h: 140 },
    );
    await add(
      'text-shrink',
      id,
      'block.insert (autofit shrink, as a converted placeholder carries)',
      { w: 260, h: 140 },
    );
  }
  for (const [kind, row, shape] of [
    ['rectangle', 'rectangle', 'rectangle'],
    ['rounded', 'rounded', 'rounded'],
    ['ellipse', 'ellipse', 'ellipse'],
  ]) {
    if (!want(kind)) continue;
    let made = `menubar Insert > Shape > Shapes > ${row}, one click on the sheet`;
    let id = await insertViaTool(
      ['insert.shape', 'insert.shape.shapes', `insert.shape.shapes.${row}`],
      'shape',
      cellPoint(),
    );
    if (!id) {
      made = 'block.insert (the menu path failed)';
      id = await insertViaAction(
        { id: `${kind}-shape`, type: 'shape', shape, stroke: 'hair' },
        { x: 0, y: 0, w: 240, h: 150 },
      );
    }
    if (kind === 'rectangle') await setField(id, '/fill', 'plate');
    await add(kind, id, made, { w: 240, h: 150 }, { full: kind === 'rectangle' });
  }
  if (want('triangle')) {
    const id = await insertViaAction(
      { id: 'triangle', type: 'shape', shape: 'triangle', stroke: 'hair', fill: 'plate' },
      { x: 0, y: 0, w: 240, h: 150 },
    );
    await add(
      'triangle',
      id,
      'block.insert (preset triangle; the menu lists the presets as a glyph grid)',
      { w: 240, h: 150 },
    );
  }
  if (want('arrow')) {
    let made = 'menubar Insert > Shape > Arrows > Arrow, one click on the sheet';
    let id = await insertViaTool(
      ['insert.shape', 'insert.shape.arrows', 'insert.shape.arrows.arrow'],
      'shape',
      cellPoint(),
    );
    if (!id) {
      made = 'block.insert (preset rightArrow; the menu path failed)';
      id = await insertViaAction(
        { id: 'arrow-shape', type: 'shape', shape: 'rightArrow', stroke: 'hair', fill: 'plate' },
        { x: 0, y: 0, w: 240, h: 150 },
      );
    }
    await add('arrow', id, made, { w: 240, h: 150 });
  }
  if (want('star')) {
    const id = await insertViaAction(
      { id: 'star', type: 'shape', shape: 'star5', stroke: 'hair', fill: 'plate' },
      { x: 0, y: 0, w: 240, h: 150 },
    );
    await add('star', id, 'block.insert (preset star5)', { w: 240, h: 150 });
  }
  if (want('rule')) {
    let made = 'menubar Insert > Line > Rule';
    let id = await insertViaMenuRow(['insert.line', 'insert.line.rule'], 'rule');
    if (!id) {
      made = 'block.insert (the menu path failed)';
      id = await insertViaAction(
        { id: 'rule-a', type: 'rule', orientation: 'horizontal' },
        { x: 0, y: 0, w: 240, h: 8 },
      );
    }
    await add('rule', id, made, { w: 240, h: 8 });
  }
  if (want('line')) {
    let made = 'menubar Insert > Line > Line';
    let id = await insertViaMenuRow(['insert.line', 'insert.line.line'], 'shape');
    if (!id) {
      made = 'block.insert (line kind; the menu path failed)';
      id = await insertViaAction(
        { id: 'line', type: 'shape', shape: 'line', orientation: 'diagonal-down' },
        { x: 0, y: 0, w: 240, h: 120 },
      );
    }
    await add('line', id, made, { w: 240, h: 120 }, { line: true });
  }
  if (want('icon')) {
    const id = await insertViaAction(
      { id: 'icon-a', type: 'icon', name: 'check-circle', size: 24 },
      { x: 0, y: 0, w: 96, h: 96 },
    );
    await add(
      'icon',
      id,
      'block.insert (the Icon primitive of the toolbar Insert menu, absent on this build)',
      { w: 96, h: 96 },
      { full: true },
    );
  }
  if (want('box')) {
    const id = await insertViaAction(
      { id: 'box-a', type: 'box', stroke: 'hair', padding: 16, text: LONG_TEXT },
      { x: 0, y: 0, w: 260, h: 150 },
    );
    await add('box', id, 'block.insert (the Box primitive)', { w: 260, h: 150 });
  }
  if (want('picture')) {
    const s = await st();
    const asset = await act('asset.add', {
      id: 'probe-picture',
      file: await pngDataUrl(),
      role: 'capture',
      alt: 'A blue plate with an amber centre',
    });
    say(`asset.add ${JSON.stringify(asset).slice(0, 120)}`);
    await waitRev(s.revision, 20_000);
    await page
      .waitForFunction(
        () => {
          try {
            return Boolean(JSON.parse(window.turboslide.studio.readSource()));
          } catch {
            return false;
          }
        },
        null,
        { timeout: 5000 },
      )
      .catch(() => {});
    const id = await insertViaAction(
      { id: 'picture-a', type: 'picture', asset: 'probe-picture' },
      { x: 0, y: 0, w: 240, h: 160 },
    );
    await add(
      'picture',
      id,
      'asset.add (a 96 by 64 PNG data URL) + block.insert picture',
      { w: 240, h: 160 },
      { full: true },
    );
  }
  if (want('group')) {
    const a = await insertViaAction(
      { id: 'g-rect', type: 'shape', shape: 'rectangle', stroke: 'hair', fill: 'plate' },
      { x: 0, y: 0, w: 120, h: 140 },
    );
    const b = await insertViaAction(
      { id: 'g-text', type: 'text', text: 'Grouped text keeps its size.', autofit: 'grow' },
      { x: 0, y: 0, w: 130, h: 140 },
    );
    const c = cell(i);
    i += 1;
    await place(a, { x: c.x, y: c.y, w: 120, h: 140 });
    await place(b, { x: c.x + 130, y: c.y, w: 130, h: 140 });
    const slide = await source();
    const s = await st();
    await act('block.group', { slideId: slide.id, blockIds: [a, b] });
    await waitRev(s.revision, 15_000);
    objects.push({
      kind: 'group',
      id: a,
      slide: 'canvas-a',
      made: 'two objects grouped with block.group',
      members: [a, b],
      full: true,
    });
    say(`object group = ${a}+${b}`);
  }

  // Slide B: the large blocks on a 2 by 2 grid
  if (want('table') || want('chart') || want('dia') || want('material')) {
    await ensureSlide('canvas-b', 'blank');
    const cellB = (j) => ({ x: 90 + (j % 2) * 740, y: 60 + Math.floor(j / 2) * 400 });
    let j = 0;
    const addB = async (kind, id, made, box, extra = {}) => {
      const c = cellB(j);
      j += 1;
      await place(id, { x: c.x, y: c.y, w: box.w, h: box.h });
      objects.push({ kind, id, slide: 'canvas-b', made, ...extra });
      say(`object ${kind} = ${id} (${made}) at ${c.x},${c.y} ${box.w}x${box.h}`);
    };
    if (want('table')) {
      const id = await insertViaAction(
        {
          id: 'table-a',
          type: 'table',
          columns: [{}, {}, {}],
          rows: [
            { cells: ['Metric', 'Q3', 'Q4'], header: true },
            { cells: ['Revenue', '1.2', '1.6'] },
            { cells: ['Margin', '41%', '44%'] },
            { cells: ['Headcount', '18', '22'] },
          ],
        },
        { x: 0, y: 0, w: 640, h: 300 },
      );
      await addB(
        'table',
        id,
        'block.insert (the menu grid is a hover plate)',
        { w: 640, h: 300 },
        { full: true },
      );
    }
    if (want('chart')) {
      let made = 'menubar Insert > Chart > Column';
      let id = await insertViaMenuRow(['insert.chart', 'insert.chart.column'], 'chart');
      if (!id) {
        made = 'block.insert (the menu path failed)';
        id = await insertViaAction(
          {
            id: 'chart-a',
            type: 'chart',
            kind: 'column',
            series: [{ name: 'A', values: [3, 5, 2, 6] }],
            categories: ['Q1', 'Q2', 'Q3', 'Q4'],
          },
          { x: 0, y: 0, w: 640, h: 340 },
        );
      }
      await addB('chart', id, made, { w: 640, h: 340 });
    }
    if (want('dia')) {
      const id = await insertViaAction(
        {
          id: 'dia-a',
          type: 'dia',
          fit: 'slot',
          alt: 'Diagram',
          data: {
            w: 627,
            h: 300,
            lines: [
              { x1: 20, y1: 150, x2: 600, y2: 150, stroke: 'ink' },
              { x1: 313, y1: 20, x2: 313, y2: 280, stroke: 'mid' },
            ],
            rects: [
              { x: 60, y: 60, w: 160, h: 90, fill: 'plate', stroke: 'ink' },
              { x: 400, y: 160, w: 160, h: 90, fill: 'paper', stroke: 'ink' },
            ],
            markers: [{ x: 313, y: 150 }],
            texts: [
              { x: 140, y: 40, text: 'Input' },
              { x: 480, y: 270, text: 'Output' },
            ],
            icons: [],
            marks: [],
          },
        },
        { x: 0, y: 0, w: 640, h: 300 },
      );
      await addB(
        'dia',
        id,
        'block.insert (a declared diagram with lines, rects, a marker and two labels)',
        { w: 640, h: 300 },
      );
    }
    if (want('material')) {
      const id = await insertViaAction(
        {
          id: 'material-a',
          type: 'material',
          materialId: 'paper:gem-smoke',
          preset: 'brand-blue',
          anchor: 5500,
          alt: 'The gem smoke material in the brand blue',
        },
        { x: 0, y: 0, w: 640, h: 340 },
      );
      await addB('material', id, 'block.insert (the Material primitive)', { w: 640, h: 340 });
    }
  }

  // Slide C: an opener template slide: the plate, the photograph and the plate's heading
  if (want('plate') || want('opener-picture') || want('template-big')) {
    const list = await invoke('slide.list', {});
    const ids = (Array.isArray(list) ? list : (list.slides ?? [])).map(
      (s) => s.id ?? s.slideId ?? s,
    );
    if (!ids.includes('opener-1')) {
      const s = await st();
      try {
        await act('slide.new', { layout: 'opener', after: ids[ids.length - 1], id: 'opener-1' });
        await waitRev(s.revision, 30_000);
      } catch (error) {
        say(`slide.new opener refused: ${String(error).slice(0, 160)}`);
      }
    }
    await gotoSlide('opener-1').catch(() => {});
    const slide = await source();
    if (slide.id === 'opener-1') {
      const big =
        slide.plate?.blocks?.find((b) => b.type === 'heading') ??
        slide.slots?.main?.find((b) => b.type === 'heading');
      if (big) {
        const s = await st();
        await act('block.set', {
          slideId: 'opener-1',
          blockId: big.id,
          path: '/text',
          value: 'Section title that runs long enough to wrap',
        });
        await waitRev(s.revision, 15_000);
      }
      if (want('plate'))
        objects.push({
          kind: 'plate',
          id: 'plate',
          slide: 'opener-1',
          made: 'the opener template plate (a virtual object until the first drag converts the slide)',
          convertPath: true,
          selectPoint: 'plate',
        });
      if (want('opener-picture'))
        objects.push({
          kind: 'opener-picture',
          id: 'picture',
          slide: 'opener-1',
          made: 'the opener photograph covering the sheet',
          convertPath: true,
          selectPoint: 'picture',
          skipRotate: true,
        });
      if (want('template-big') && big)
        objects.push({
          kind: 'template-big',
          id: big.id,
          slide: 'opener-1',
          made: 'the opener plate heading (autofit shrink after the conversion)',
          convertPath: true,
        });
    }
  }
  // Slide D: the deck's title slide heading (a title kind)
  if (want('title-heading')) {
    await gotoSlide('title').catch(() => {});
    const slide = await source();
    if (slide.kind === 'title' || slide.template === 'title') {
      if (slide.kind === 'title') {
        const s = await st();
        await act('slide.update', {
          slideId: 'title',
          mutations: [
            {
              op: 'slide.set',
              slideId: 'title',
              path: '/heading',
              value: 'Quarterly review of the resize handles',
            },
          ],
        }).catch(() => {});
        await waitRev(s.revision, 15_000).catch(() => {});
      }
      objects.push({
        kind: 'title-heading',
        id: 'heading',
        slide: 'title',
        made: 'the title slide heading (a slide field drawn as an object; the first drag converts the kind)',
        convertPath: true,
      });
    }
  }
}

// -----------------------------------------------------------------------------------------------
// The matrix

async function pointerSelectSpec(object) {
  /* virtual objects of an unconverted picture kind: the plate by its padding, the photograph by the sheet */
  if (object.selectPoint === 'plate') {
    const box = await page.evaluate((sel) => {
      const stage = document.querySelector(sel);
      const plate = stage?.querySelector('[data-slot="plate"]');
      if (!stage || !plate) return null;
      const sr = stage.getBoundingClientRect();
      const k = sr.width / 1600;
      const r = plate.getBoundingClientRect();
      return {
        x: (r.left - sr.left) / k,
        y: (r.top - sr.top) / k,
        w: r.width / k,
        h: r.height / k,
      };
    }, STAGE);
    return box ? { box, point: { x: box.x + 10, y: box.y + 8 } } : {};
  }
  if (object.selectPoint === 'picture')
    return { box: { x: 0, y: 0, w: 1600, h: 900 }, point: { x: 1500, y: 60 } };
  return {};
}

async function measuredBox(id) {
  return page.evaluate(
    ([sel, id]) => {
      const stage = document.querySelector(sel);
      const el = stage?.querySelector(`.free[data-free="${id}"], [data-block="${id}"]`);
      if (!stage || !el) return null;
      const sr = stage.getBoundingClientRect();
      const k = sr.width / 1600;
      const r = el.getBoundingClientRect();
      return {
        x: (r.left - sr.left) / k,
        y: (r.top - sr.top) / k,
        w: r.width / k,
        h: r.height / k,
      };
    },
    [STAGE, id],
  );
}

async function runObject(object) {
  say(`---- ${object.kind} (${object.id}) on ${object.slide}`);
  await gotoSlide(object.slide);
  const entry = { ...object, drags: 0, errors: 0, shots: {} };
  const pick = await pointerSelectSpec(object);
  const members = object.members ?? [];
  const union = members.length
    ? async () => {
        const slide = await source();
        const ps = members
          .map((m) => slide.slots.main.find((b) => b.id === m)?.pos)
          .filter(Boolean);
        const x = Math.min(...ps.map((p) => p.x));
        const y = Math.min(...ps.map((p) => p.y));
        return {
          x,
          y,
          w: Math.max(...ps.map((p) => p.x + p.w)) - x,
          h: Math.max(...ps.map((p) => p.y + p.h)) - y,
        };
      }
    : null;
  await setZoom('fit');
  await select(object.id, { box: pick.box, point: pick.point });
  entry.shots.before = await shot(`${object.kind}-before`);
  const fallback = pick.box ?? (await measuredBox(object.id));

  const zooms = object.full || !REDUCED ? ZOOMS : [1];
  const plan = [];
  for (const zoom of zooms) for (const mod of MODS) plan.push({ zoom, mod, handles: HANDLES });
  if (REDUCED && !object.full) {
    for (const zoom of ZOOMS.filter((z) => z !== 1))
      plan.push({ zoom, mod: 'plain', handles: ['se', 'nw'] });
  }
  if (object.line) {
    /* a line has two end handles and no resize squares: record what the overlay offers */
    await select(object.id, { box: fallback });
    entry.lineHandles = await page.evaluate(() =>
      [...document.querySelectorAll('.ts-overlay [data-control^="handle."]')].map((e) =>
        e.getAttribute('data-control'),
      ),
    );
    say(`line handles: ${entry.lineHandles.join(' ')}`);
    /* drag the end handle by a known delta and compare the end against the pointer */
    for (const zoom of [1, 0.5, 2]) {
      const pos = await posOf(object.id);
      if (!pos) break;
      await setZoom(zoom, { x: pos.x + pos.w, y: pos.y + pos.h });
      await select(object.id, { box: pos });
      const end = page.locator(`.ts-overlay [data-control="handle.${object.id}.end"]`).first();
      if ((await end.count()) === 0) break;
      const hb = await end.boundingBox();
      const g = await geom();
      const s0 = await st();
      const before = await snapshot(object.id);
      const cx = hb.x + hb.width / 2;
      const cy = hb.y + hb.height / 2;
      const dx = 40;
      const dy = 24;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let i = 1; i <= 8; i += 1)
        await page.mouse.move(cx + (dx * g.k * i) / 8, cy + (dy * g.k * i) / 8);
      await sleep(150);
      const preview = await snapshot(object.id);
      await page.mouse.up();
      const committed = await waitRev(s0.revision, 8000);
      await sleep(350);
      const after = await snapshot(object.id);
      const posAfter = await posOf(object.id);
      const pointer = { x: (cx + dx * g.k - g.left) / g.k, y: (cy + dy * g.k - g.top) / g.k };
      const to = after.content?.to ? after.content.to.split(/[ ,]+/).map(Number) : null;
      const endSheet = to && posAfter ? { x: posAfter.x + to[0], y: posAfter.y + to[1] } : null;
      rows.push({
        kind: object.kind,
        id: object.id,
        anchor: object.id,
        dir: 'end',
        zoom,
        mod: 'plain',
        k: round2(g.k),
        delta: { dx, dy },
        posBefore: pos,
        posAfter,
        before: { rect: before.rect, content: before.content },
        preview: { rect: preview.rect, readout: preview.readout, guides: preview.guides },
        after: { rect: after.rect, content: after.content, inspector: after.inspector },
        committed,
        pointer: { x: round2(pointer.x), y: round2(pointer.y) },
        lineEnd: endSheet ? { x: round2(endSheet.x), y: round2(endSheet.y) } : null,
        gap: endSheet
          ? { x: round2(endSheet.x - pointer.x), y: round2(endSheet.y - pointer.y) }
          : null,
        jumpAtUp: boxDiff(preview.rect, after.rect),
      });
      entry.drags += 1;
      flush();
    }
    const undoOk = await undoOnce();
    report.undo.push({
      kind: object.kind,
      zoom: 2,
      mod: 'plain',
      ok: undoOk,
      note: 'line end drag',
    });
    return entry;
  }

  for (const step of plan) {
    let last = null;
    for (const dir of step.handles) {
      const row = await dragHandle({
        kind: object.kind,
        id: object.id,
        anchor: object.id,
        dir,
        zoom: step.zoom,
        mod: step.mod,
        members,
        union,
        fallbackBox: fallback,
        convertPath: object.convertPath === true,
        ...(pick.point ? { selectPoint: pick.point } : {}),
      });
      rows.push(row);
      entry.drags += 1;
      if (row.error) {
        entry.errors += 1;
        say(`  ${dir} z${step.zoom} ${step.mod}: ERROR ${row.error}`);
      } else {
        const g = row.gap ?? {};
        say(
          `  ${dir} z${step.zoom} ${step.mod}: pos ${row.posBefore.w}x${row.posBefore.h} -> ${row.posAfter?.w}x${row.posAfter?.h} gap ${g.x ?? '-'},${g.y ?? '-'} jumpDown ${JSON.stringify(row.jumpAtDown)} jumpUp ${JSON.stringify(row.jumpAtUp)} readout "${row.preview?.readout}" insp ${row.preview?.inspector?.w}x${row.preview?.inspector?.h} -> ${row.after?.inspector?.w}x${row.after?.inspector?.h} guides ${row.preview?.guides} committed ${row.committed} caughtUp ${row.caughtUp?.ok}/${row.caughtUp?.ms}ms top ${row.topAt?.control ?? row.topAt?.cls} snack "${(row.notices ?? []).map((n) => n.snackbar).join(' | ')}" sync ${JSON.stringify(row.notice?.sync ?? null)}`,
        );
        last = row;
        if (dir === 'se' && step.zoom === 1 && step.mod === 'plain' && !entry.shots.after) {
          entry.shots.after = await shot(`${object.kind}-after-se`);
          const box = row.posAfter ?? fallback;
          if (box) {
            const cmp = await renderCompare(object.kind, object.id, object.slide, deckId, box);
            report.renders.push(cmp);
            say(
              `  render: status ${cmp.renderStatus} mismatch ${cmp.mismatch} region ${cmp.regionMismatch} editorInk ${JSON.stringify(cmp.editorInk?.box)} renderInk ${JSON.stringify(cmp.renderInk?.box)} ${cmp.error ?? ''}`,
            );
            await gotoSlide(object.slide);
          }
        }
      }
      flush();
    }
    /* one undo after the round: the last drag's box comes back in one step */
    if (last && last.posAfter) {
      const undoOk = await undoOnce();
      const posNow = await posOf(object.id);
      const restored =
        posNow &&
        last.posBefore &&
        ['x', 'y', 'w', 'h'].every(
          (key) => Math.abs((posNow[key] ?? 0) - (last.posBefore[key] ?? 0)) <= 0.51,
        );
      report.undo.push({
        kind: object.kind,
        zoom: step.zoom,
        mod: step.mod,
        dir: last.dir,
        ok: undoOk,
        restored,
        before: last.posBefore,
        afterUndo: posNow,
        afterDrag: last.posAfter,
        blockAfterUndo: await blockOf(object.id),
      });
      say(
        `  undo after ${last.dir}: write ${undoOk}, box restored ${restored} (${JSON.stringify(posNow)})`,
      );
    }
    await settle(8000);
  }

  if (ROTATED && !object.skipRotate) {
    const slide = await source();
    const s = await st();
    try {
      await act('block.rotate', {
        slideId: slide.id,
        blockIds: members.length ? members : [object.id],
        to: 30,
      });
      await waitRev(s.revision, 15_000);
      await sleep(300);
      for (const dir of HANDLES) {
        const row = await dragHandle({
          kind: object.kind,
          id: object.id,
          anchor: object.id,
          dir,
          zoom: 1,
          mod: 'plain',
          rotated: 30,
          members,
          union,
          fallbackBox: fallback,
        });
        rows.push(row);
        entry.drags += 1;
        if (row.error) {
          entry.errors += 1;
          say(`  rotated ${dir}: ERROR ${row.error}`);
        } else {
          say(
            `  rotated ${dir}: pos ${JSON.stringify(row.posBefore)} -> ${JSON.stringify(row.posAfter)} corner ${JSON.stringify(row.corner)} pointer ${JSON.stringify(row.pointer)} gap ${JSON.stringify(row.gap)} jumpUp ${JSON.stringify(row.jumpAtUp)}`,
          );
        }
        flush();
      }
      entry.shots.rotated = await shot(`${object.kind}-rotated`);
      const s2 = await st();
      await act('block.rotate', {
        slideId: slide.id,
        blockIds: members.length ? members : [object.id],
        to: 0,
      }).catch(() => {});
      await waitRev(s2.revision, 15_000);
    } catch (error) {
      say(`  rotate failed: ${String(error).slice(0, 200)}`);
      entry.rotateError = String(error).slice(0, 200);
    }
  }
  return entry;
}

// -----------------------------------------------------------------------------------------------
// Cleanup through the actions API (the window transport refuses deck.remove on a trashed deck)

async function apiAction(name, id, body) {
  const response = await fetch(`${BASE}/api/actions/${name}?deck=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      'x-turboslide-author': 'agent:hotfix-3-reproducer',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not json
  }
  return { status: response.status, json, text: text.slice(0, 200) };
}

async function cleanup(id) {
  const steps = [];
  const info = await apiAction('deck.info', id, {});
  steps.push({
    step: 'deck.info',
    status: info.status,
    revision: info.json?.revision,
    trashedAt: info.json?.trashedAt ?? null,
  });
  if (info.status === 200) {
    if (!info.json?.trashedAt) {
      const trash = await apiAction('deck.trash', id, { id, baseRevision: info.json.revision });
      steps.push({
        step: 'deck.trash',
        status: trash.status,
        revision: trash.json?.revision,
        text: trash.status === 200 ? undefined : trash.text,
      });
    }
    const again = await apiAction('deck.info', id, {});
    const remove = await apiAction('deck.remove', id, {
      id,
      confirm: true,
      baseRevision: again.json?.revision ?? info.json.revision,
    });
    steps.push({
      step: 'deck.remove',
      status: remove.status,
      text: remove.status === 200 ? JSON.stringify(remove.json).slice(0, 120) : remove.text,
    });
  }
  const probe = await fetch(`${BASE}/edit/${encodeURIComponent(id)}`, { redirect: 'manual' });
  steps.push({ step: '/edit probe', status: probe.status });
  return { deckId: id, steps };
}

// -----------------------------------------------------------------------------------------------
// Main

try {
  await boot();
  await makeObjects();
  report.objects = objects.map((o) => ({ ...o, union: undefined }));
  flush();
  for (const object of objects) {
    const entry = await runObject(object);
    report.objects = report.objects.map((o) =>
      o.id === object.id && o.kind === object.kind ? { ...o, ...entry } : o,
    );
    writeFileSync(
      join(OUT, 'report.json'),
      JSON.stringify(
        { ...report, deckId, pageErrors, consoleErrors: consoleErrors.slice(0, 200), staleAnswers },
        null,
        1,
      ),
    );
    flush();
  }
} catch (error) {
  say(`FAILED: ${String(error).slice(0, 400)}`);
  report.fatal = String(error).slice(0, 400);
  try {
    await page.screenshot({ path: join(OUT, 'failed.png') });
  } catch {
    // no page
  }
} finally {
  report.finishedAt = new Date().toISOString();
  report.deckId = deckId;
  report.pageErrors = pageErrors;
  report.consoleErrors = consoleErrors.slice(0, 200);
  report.staleAnswers = staleAnswers;
  try {
    await context.tracing.stop({ path: join(OUT, 'trace.zip') });
  } catch {
    // tracing already stopped
  }
  await browser.close().catch(() => {});
  if (deckId && !KEEP) {
    const done = await cleanup(deckId);
    report.cleanup.push(done);
    say(`cleanup ${deckId}: ${JSON.stringify(done.steps)}`);
  } else if (deckId) say(`deck ${deckId} kept (--keep-deck); delete it with cleanup-api.mjs`);
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  flush();
  dropLock();
  say(`done: ${rows.length} drags, ${rows.filter((r) => r.error).length} errors`);
}
```

## 2. The fix

By the fixer, 2026-09-14, 16:50 to 18:30 PDT, on the shared checkout over `main` at `0830115` (the round five amendments commit on top of the round four ship commit `43707c3`), with the reproducer's section 1 in this file and `docs/gslides-parity/SPEC-5-amendments.md` A4 as the specification of the model. Every root cause of section 1.7 was read in the source before it was changed; the change per cause is the smallest one that makes the reference behaviour hold, each has a unit test in its owning package, and `apps/studio/e2e/resize.spec.ts` drags every handle of a shape, a picture, a text box and a group at zoom 50, 100 and 200 against a dev server. Scratch files sit under `/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/hotfix3/fix/` (the dev server log `dev-4348.log`, the gates log `gates.log` with `compare-report.json` and `canvas-fidelity.json`, the spec logs `resize-run*.log` and `resize-diag*.log`).

### 2.1 Diagnosis, confirmed against the source

- R1 (the refused second drag) is hotfix 2's cause A5 seen from the stage. The stage's `dispatch` is `controller.invoke` (`apps/studio/src/editor/EditorRoot.tsx`, the `StageEditor` mount), which hotfix 2 made `invokeRebasing` (`controller.tsx`): a write `checkBase` refuses because the room's acknowledged revision moved ahead of the document's is retried once on the revision the refusal named, and nothing was committed by the refused attempt. The stage still bases its call on `doc.deck.revision` (`packages/viewer/src/Editor.tsx` `revisionRef`), which on the blob tier lags the acknowledged revision until the checkpoint frame arrives; the retry closes that gap without a spring back, because `commit`'s `.finally(() => setDraft(null))` runs after the rebased write resolved and the document already holds the box. The 90 s stall is hotfix 2's A3. This hotfix changes nothing in the write path, by the coordination rule of the round (`EditorRoot.tsx`, `controller.tsx` and `room-client.ts` are hotfix 2's files, in flight on this checkout); the resize spec's consecutive drags on the memory tier cover the stage's path, and the production check of the blob tier is the verifier's re-walk of Kevin's report on the preview (A7).
- R2 (the text box jumps at pointer up). `Editor.tsx` `withAutofit` appended a `/pos/h` write to the measured text height for every touched `grow` block, so the box the user set was replaced by the text's height at the release, and the n and s handles could never shorten a grow box. Google keeps the box a handle drag set and turns the shape's fitting to "Do not autofit".
- R3 (a rotated object resizes away from the pointer). `packages/viewer/src/Gestures.tsx` unrotated the delta, resized the unrotated box with the opposite edge held in that frame and wrote `x, y, w, h`; the renderer rotates the box about its own centre (`packages/render/src/slide.ts` `freeTransform`, `block-css.ts` `transform-origin: center`), so the centre moved along the sheet axes by half the size change and the rotation pivoted about the new centre: the anchored edge drifted and the dragged edge left the pointer, as section 1.4 measured. The Alt path (`aboutCentre`) was right because the centre stayed.
- R4 (the icon glyph stays 24 px). `packages/render/src/blocks/primitives.ts` `renderIcon` wrote `width:<size>px;height:<size>px` inline from `block.size ?? 24` for every icon, positioned or not, and `block-css.ts` had no rule giving `svg.icon-block` its wrapper's size under `.free`, unlike `.box`, `svg.shape`, `.picture`, `.material` and `svg.chart`.
- R5 (the diagram scales in width only; predicted). `packages/theme/src/gt-ink-paper/sheet.css` gives `svg.dia` `width: 100%; height: auto`, and `packages/render/src/blocks/dia.ts` writes no `preserveAspectRatio`, so under `.free` a height drag changed the box and not the drawing.
- R6 (the Format options Width and Height fields absent). Not a product defect. `packages/chrome/src/FormatOptions.tsx` renders `SizeRotationSection` (`formatOptions.size.width` and `formatOptions.size.height` through `NumberField`, `data-control` on the input) whenever a block is selected, and `EditorShell.tsx` passes the shell's selection to it; on the dev server the two fields, the position fields and the text fitting fields are on the page with a rectangle selected and the panel open (the spec's `openFormatOptions` step). What emptied the reproducer's rows is the Escape it pressed before every selection (`select` in section 1.10: "Escape steps back to the block"): `EditorShell.tsx`'s Escape handler closes an open right panel (`if (panel !== null) closePanel()`), as Google's sidebar closes on Escape, so the panel it had opened at setup was gone by the first row and its `[data-control^="formatOptions."]` query found nothing. The spec reopens the panel before it reads the fields and asserts they read the committed box after every drag.
- R7 (a press on a handle moved the object; seen once). Pinned on the dev server with the spec's press probe (`elementFromPoint` at the handle's centre): the element under the nw handle was the selection chip (`handle.<id>.move`), because the ring, the frame strips and the chip stood 6 px below the handles. The handles are drawn from `pos` and the ring from the stage's measured boxes (`packages/viewer/src/Freeform.tsx` `measureBoxes`), and the boxes were 6 px low: the sheet's slide change animates the slide body from `translateY(6px)` (`Sheet.css` `pt-slide-up` on `.pt-sheet-stage[data-dir='next'] .ts-stage > .pt-slide`), `Editor.tsx` measures in the layout effect on the body's first frame, `getBoundingClientRect` of every wrapper carries the body's translate while the stage's rect does not, and nothing re-measures when the cut ends (`document.fonts.ready` resolves at once). The boxes stayed 6 px low until the next edit re-rendered the slide, so a press right after `view.goto` on the nw handle (whose upper half the chip covers when the chip sits 2 px above the ring) started a free move. The reproducer's later runs inserted objects after arriving on the slide, which re-measured, and saw the handle every time; `run-smoke`'s first drags came right after `gotoSlide`. The `Editor.tsx` overlay placement of section 1.7 was not the cause.

### 2.2 The change per cause

- One resize model (SPEC-5-amendments A4): `packages/schema/src/canvas.ts` gains `resizeBox(handle, delta, modifiers, rotation, kind, box, options)`, pure over sheet pixels, with `RESIZE_HANDLES`, `ResizeModifiers` (`shift`, `alt`, `lock`), `ResizeKind` (a block type, `plate` for the plate box of a converted picture kind, `group` for a multi selection), `ASPECT_LOCKED_KINDS` (`picture`, `icon`, `material`, `mark`, `plate`) with `locksAspect` and `resizeKindOf`, `RESIZE_MIN_SIZE` (16), `rotateVector` and `rotatedBoxCorners`. The delta arrives in sheet pixels (the caller divides the client delta by the sheet scale once, `Gestures.tsx` `sheetPoint`, so the zoom does not matter) and is turned into the object's own axes for a rotated object; the dragged edges move, the leading edges snap through the caller's `snap` functions (unrotated only), no side drops under `min`; a corner keeps the ratio for the locked kinds, and every handle does under Shift or the inspector's lock, the axis with the larger relative change leading and an edge scaling the other side from its own left or top; Alt mirrors the moved edges about the centre; otherwise the anchored point (the edge opposite the moving one, the left or top of an axis no handle moves) is kept in sheet space through the rotation and `x, y` are rebuilt from it and the new size, which is the R3 fix. Unrotated results are whole pixels, rotated ones 1/64 px steps (the canvas precision).
- The gesture (`packages/viewer/src/snap.ts`, `Gestures.tsx`, `rotate.ts`). `snapResize` keeps its signature and its snap of the moving edges and calls the model, with the new options `alt`, `rotation` and `kind`; `freeGesture`'s single object path passes the object's rotation and kind and no longer unrotates the delta itself or holds the anchored edge in the unrotated frame (`aboutCentre` and the `unrotateDelta` call are gone); the multi selection path passes `alt` and `kind: 'group'` and scales the members about the union as before; `nudgeMutation`'s `free-resize` case turns the one pixel step into sheet space with `rotateVector` and back through the model, so a keyboard nudge on a turned object grows the object by the whole step along its own axis with the opposite edge held; `unrotateDelta` delegates to the schema's `rotateVector` so one arithmetic turns every vector.
- The autofit at the release (`Editor.tsx` `withAutofit`). A `grow` block whose box the write resized (its `w` or `h` differs from the document's) gets `block.set /autofit 'none'` in the same write and keeps the box it was given; the measure runs only for the blocks that still take a fit (a `shrink` block steps its size down one ladder step on overflow as before, a `grow` block that was only moved still takes its text height). The committed box is the previewed box, the height handles shorten a grow box, and the write stays one `slide.update`, so undo is one step.
- The icon (`packages/render/src/blocks/primitives.ts`, `block-css.ts`). `renderIcon` writes the inline size only for a block without `pos`; `.ts-sheet .free > svg.icon-block` (and under `.link`) takes `width: 100%; height: 100%`, so the glyph fills the box the wrapper draws and scales with it; the sprite symbol's own `viewBox` keeps the glyph's proportions, and the corner handles of an icon keep the box square through the model's lock. At the box the conversion measured (the flow icon's own 48 by 48) the pixels are unchanged, which the canvas fidelity gate confirms.
- The diagram (`block-css.ts`, `blocks/dia.ts`). `.ts-sheet .free > svg.dia` takes `width: 100%; height: 100%`, and `renderDia` adds `preserveAspectRatio="none"` to a positioned diagram (a raw svg that declares its own rule keeps it), so the drawing scales in both axes with the box. A `fit: 'slot'` diagram keeps its declared width rule (the coordinate space is the box's width), which is what keeps a converted slot diagram pixel identical; its height now follows the box.
- The table (`block-css.ts`). `.ts-sheet .free > .table` takes the box height; the classic form's rows (`.tr`, a flex column) get `flex: 1 1 auto` so the extra height is shared, and the grid form gets `align-content: stretch` so its auto tracks stretch. At the measured box there is no extra height, so a converted table is unchanged.
- The stage's measurer (`packages/viewer/src/Freeform.tsx` `measureBoxes`). Every box is read against the slide body's own rect instead of the stage's, with the scale still from the stage's width: the body's translate moves every wrapper with it, so a box against the body is the layout position at any frame of the cut, and the ring, the strips, the chip and the handles agree from the first frame. `packages/viewer/src/Editor.css` also stops the sheet's slide change cut on the editor's body (`.ts-editor .pt-sheet-stage[data-dir] .ts-stage > .pt-slide { animation: none }`), the way the file already stops the theme's entrance cut: in edit mode the body would otherwise travel 6 px under a static overlay for the length of the cut after every slide switch.
- The inspector (`packages/chrome/src/inspector/geometry.tsx`). Width and Height write through `resizeBox` from the `se` handle with the top left held (the rotation passed as 0, so X and Y keep the box the fields show, as the existing test pins), the lock as the model's `lock` modifier; the lock toggle starts on for the locked kinds (a picture object's fields keep its ratio, as Google's do) and off for the rest, and the toggle overrides it. The fields and the readout read the same `pos` (the readout the gesture's `size`, the fields the document's box after the commit).
- The spec (`apps/studio/e2e/resize.spec.ts`), section 2.3.

Not changed, on purpose: the write path (hotfix 2's files), `packages/theme/src/gt-ink-paper/sheet.css` (the parity chain with `head.html`; the canvas rules live in `block-css.ts`), the group scaling arithmetic (`scalePositions`, typography untouched per SPEC-2 0.102), `scripts/check.mjs` (the spec joins check step 32 in round five per A4), and Google's refit of a "Resize shape to fit text" box's height after a side handle drag: here every handle drag of a grow box keeps the box and turns the fit off, so the preview and the commit agree (recorded in 2.6).

### 2.3 Tests

Unit tests, in the owning package, each failing on the source of `0830115`.

- `packages/schema/src/canvas.test.ts`, describe `resizeBox` (ten cases): every handle moves its edge or corner by the delta and holds the opposite one; the minimum holds while the anchored edge stays; Shift keeps the ratio from a corner's dominant delta and from an edge's own side, and the inspector's lock is the same rule; the five locked kinds keep their ratio from a corner alone and change one dimension from a side handle while a shape, a text box, a table, a chart, a diagram, a box and a group resize freely, with `resizeKindOf` naming the plate; Alt keeps the centre on every handle, with Shift too; a rotated object (30, 90, 135 and 300 degrees) keeps its anchored corner on the sheet within 0.75 px and lands its dragged corner under the pointer on every corner handle, and keeps the opposite edge from a side handle with the size following the delta along its own axis; Alt keeps a rotated object's centre and Shift its ratio; the snap runs on the moving edges only (a corner dragged along one axis never snaps the other) and a rotated object is never snapped; the results are whole pixels unrotated and 1/64 px steps rotated, and one sheet delta gives one box whatever zoom divided it.
- `packages/viewer/src/__tests__/canvas.test.ts`, describe "the resize handles share the schema model" (four cases): `freeGesture` on a rotated rectangle keeps the anchored corner and lands the dragged corner under the pointer, holds the opposite edge from a side handle, draws no guides and reads out the box written; Alt resizes about the centre, an icon's corner keeps its ratio without Shift while its side handle changes one dimension, and Shift keeps a text box's ratio; `nudgeMutation` on a rotated object's handle grows the object by the whole step along its own axis with the opposite edge held; a multi selection's Alt drag scales both members about the union's centre. The existing `snapResize` cases of `snap-freeform.test.ts` (the grid, the minimum, the aspect rules, the rail guide) pass unchanged over the model.
- `packages/viewer/src/__tests__/measure-boxes.test.ts` (new, jsdom): `measureBoxes` reads a positioned block's wrapper at its `pos` at stage scales 0.5, 1 and 2, is unmoved by a 6 px translate of the slide body (the slide change cut), and answers null before the stage has a size.
- `packages/render/src/__tests__/blocks.test.ts`, describe "objects of the canvas scale their content with the box" (three cases): a positioned icon writes no inline size and a flow icon keeps its stated size, with the `svg.icon-block` rule in `BLOCK_CSS`; a positioned diagram carries `preserveAspectRatio="none"` with its own viewBox (a `fit: 'slot'` one the box's width), a flow diagram none, a raw svg with its own rule keeps it, with the `svg.dia` rule in `BLOCK_CSS`; the three table rules are in `BLOCK_CSS`. The `canvas.test.ts` snapshot of the export fixture's `canvas-title` slide changed in one attribute per theme: the positioned icon's `style="width:48px;height:48px"` is gone (the glyph takes its 48 by 48 box through the stylesheet); the snapshot was updated for that change alone (`git diff` of the `.snap` file shows the two lines).
- `packages/chrome`: the existing `format-options-round-two.test.tsx` cases pin the inspector's writes over the model (a Width edit at rotation 30 keeps X and Y; the lock scales the other side; a group's Width scales every member).
- `apps/studio/e2e/resize.spec.ts` (new): on a scratch copy of the GT deck a blank canvas slide gets a rectangle, a picture (a stored GT capture), a text box with autofit grow and a group of two rectangles through the window API; at zoom 50, 100 and 200 percent every one of the eight handles of the rectangle, the picture and the text box is dragged by a known sheet delta with Cmd held (the snaps off), and after each drag the committed `pos` equals the model's box, the element under the press was the handle and the stage armed `free-resize`, the wrapper's box under the pointer at the last move equals the box that landed (no jump at the release), the size readout named it, the content took the box (the shape's svg and the picture's frame equal the wrapper, the text's paragraph width follows and its font stays 22 px, the grow box's autofit reads `none`), and the Format options Width and Height read the box; one undo restores the box before the last drag; every handle of the group scales both members about the union at the three zooms; the rectangle at 30 degrees keeps its anchored corner within 1 px and lands its dragged corner under the pointer within 1 px on every handle; Shift keeps the text box's ratio and Alt keeps the rectangle's centre; the setup asserts the ring the overlay draws equals the wrapper right after a slide change (cause R7).

### 2.4 Commands run and their results

All from `/Users/kevinliu/repos/Turboslide` (or the package folder named) with Node 24.13.0 and `node_modules/.bin/<tool>`; no `pnpm` command, no git write command, no Docker. Other rounds' work ran on the checkout throughout (hotfix 2's ship step held `.turboslide/e2e.lock` for its production probe twice while this round waited).

| Command                                                                                                                                                                                                                                                 | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules/.bin/tsc -b` (after every source change; six runs)                                                                                                                                                                                        | exit 0 each time once the tree settled (one `TS6133` for the `hasDir` helper `snapResize` no longer needed, removed; two strictness errors in new tests, fixed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `cd packages/schema && ../../node_modules/.bin/vitest run`                                                                                                                                                                                              | 24 files, 501 tests passed (the ten `resizeBox` cases new)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `cd packages/viewer && ../../node_modules/.bin/vitest run`                                                                                                                                                                                              | 28 files, 249 tests passed (four gesture cases and the three measurer cases new; `snap-freeform.test.ts` unchanged and green)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `cd packages/render && ../../node_modules/.bin/vitest run`                                                                                                                                                                                              | 14 files, 337 tests passed after the one snapshot update (`vitest run src/__tests__/canvas.test.ts -u`; two snapshot lines, the icon's inline size)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `cd packages/chrome && ../../node_modules/.bin/vitest run`                                                                                                                                                                                              | 54 files, 496 tests passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `cd packages/chrome && ../../node_modules/.bin/vitest run src/menus/__tests__/default-view-words.test.ts`                                                                                                                                               | 8 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `node apps/cli/bin/turboslide.mjs render all --theme light,dark --scale 1 --out <scratch>/render --json`                                                                                                                                                | exit 0, 170 records, no page errors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `node scripts/compare-to-shoot.mjs --deck decks/gt-brand --render <scratch>/render --shoot /Users/kevinliu/repos/Prototemplate/deck --max-mismatch 0.005 --report <scratch>/compare-report.json`                                                        | exit 0: 170 pairs, 170 compared, 0 over budget; worst non-escape 0.408 percent, mean 0.016 percent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `node scripts/canvas-fidelity.mjs --deck decks/gt-brand --deck decks/templates/gt-brand --deck decks/templates/blank --max-mismatch 0.005 --out <scratch>/canvas-fidelity --report <scratch>/canvas-fidelity.json`                                      | exit 0: 171 slides converted, 342 pairs compared, 0 over budget; worst 0.262 percent (gt-brand/directions dark), mean 0.004 percent, 109.1 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `node_modules/.bin/prettier --check <every changed file>`                                                                                                                                                                                               | clean after `--write` on the files the tests and the spec were appended to; `git diff` shows only the appended hunks and the import lines                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `cd apps/studio && TURBOSLIDE_STORE=tmp TURBOSLIDE_REALTIME=memory TURBOSLIDE_SESSION_SECRET=<fake> TURBOSLIDE_DOWNLOAD_SECRET=<fake> TURBOSLIDE_LOCAL_OPEN=1 TURBOSLIDE_AUTH_RATE_LIMIT=off ../../node_modules/.bin/vite dev --port 4348 --strictPort` | up in 2 s; `/home` and `/edit/gt-brand` 200; stopped at the end of the round                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `mkdir .turboslide/e2e.lock && PLAYWRIGHT_BASE_URL=http://localhost:4348 node_modules/.bin/playwright test apps/studio/e2e/resize.spec.ts; rmdir .turboslide/e2e.lock`                                                                                  | every one of the eight tests green, across three consecutive runs of the final spec on the memory tier: `resize-run3.log` the setup and the 50 and 100 percent tests (five tests, 6.2 m, 24 drags per zoom plus the group's 8), `resize-run4.log` the two 200 percent tests (2.8 m) after the zoom centre moved to the dragged handle, `resize-run5.log` the rotated test (1.1 m) after its no jump check took the rotated box's bounds. Two attempts at one uninterrupted run of all eight (`resize-final.log`, `resize-final2.log`) passed the setup and the first drags and were cut by a page reload the dev server made when another round wrote to the shared checkout (`dev-4348.log`: `page reload src/routeTree.gen.ts` at 18:05:11, `page reload packages/native/wasm/turboslide_native_bg.wasm` at 18:07:13), so the execution context was destroyed mid drag. The third attempt (`resize-final3.log`) ran uninterrupted, passed the setup and the 50 and 100 percent tests (five tests) and failed the 200 percent test on the text box's south east handle: the box sat at sheet x 1000, so at 200 percent the scroller could not bring that handle under the stage centre and it landed under the open Format options panel (`elementFromPoint` answered the panel); the spec now places the picture at x 460 and the text box at x 800, in the sheet's left two thirds. The fourth attempt (`resize-final4.log`) ran uninterrupted and passed seven of the eight (the setup, the three zooms of the objects, the three zooms of the group, 7.4 m) and failed the rotated test's first selection: eight drags net to about zero but not exactly and the undo takes one back, so after three zoom rounds the rectangle had drifted onto the picture, which took the click at its centre (`handle.rs-rect.move` never appeared); the spec now puts every object back at its starting box at the start of each test. The fifth attempt (`resize-final5.log`, 18:24 to 18:34) ran uninterrupted with the final spec and passed all eight tests in 9.1 m: the setup, the three zooms of the objects (24 drags each, every press on its handle, every box the model's, every readout the box, no jump at the release, the text at 22 px with `autofit: 'none'`, the Format options fields reading the box, one undo per object), the three zooms of the group, and the rotated rectangle with Shift and Alt |

The diagnostic runs on the way (`resize-run1.log` to `resize-diag6.log`, `resize-geom.log`, `resize-panel.log`): the first run refused every mutating window call for want of `baseRevision` (the spec's `act` helper now passes the tab's revision); the second hung on a `textContent()` wait for a readout that was not there, because the first press had started a move (the R7 finding above); the rectangle-only subsets then pinned the chip under the nw handle and the 6 px measured offset, and passed all eight handles once the measurer read against the body; the panel probe showed the Format options fields present with an object selected; the first full run passed the setup and the 50 and 100 percent tests and failed the 200 percent test on the picture's west handle, which the zoom centred on the object's centre had left under the filmstrip (`elementFromPoint` answered a thumbnail), so the spec now centres the zoom on the dragged handle's own sheet point.

### 2.5 Deviations and open items, recorded

1. R1 is fixed by hotfix 2's `invokeRebasing` (the stage's `dispatch` is `controller.invoke`); the stage still bases on the document's revision and relies on the one retry. The stage could read the shell's reported revision instead, which needs a prop from `EditorRoot.tsx`, hotfix 2's file: left to round five's B7 (A3 item 1, one revision authority). The blob tier path is verified on the preview by the verifier's re-walk, not here (the dev server runs the memory tier).
2. Google refits the height of a "Resize shape to fit text" box after a side handle drag and turns the fit off after a top or bottom handle drag; here every handle drag of a grow box keeps the box and writes `autofit: 'none'`, so the preview equals the commit and no measure runs at the release. A live refit would need the measure in the preview loop.
3. A `fit: 'slot'` diagram object keeps its declared width rule (its coordinate space is the box's width), so a width drag extends the drawing space rather than scaling the strokes horizontally, while a height drag now scales the drawing; the GT deck's slot diagrams stay pixel identical through the conversion because of it. A diagram whose `fit` names a viewBox scales in both axes.
4. A table object's extra height is shared equally among its rows (Google spreads it in proportion); a box shorter than the rows' content lets the rows overflow.
5. The inspector's Width and Height read the document's box, so they follow a drag at the release, not during it; the size readout is the live surface during a drag. A live inspector needs the draft `pos` on the shell's selection facts.
6. The keyboard resize of SPEC-2 6.1 row 10 (Cmd+Ctrl+B, I, J, K, W) is not bound on this build; the keyboard path this hotfix shares with the model is the focused handle's arrow keys (`nudgeMutation`), which now step along a turned object's own axis.
7. `scripts/check.mjs` does not run `resize.spec.ts` yet; A4 has it join check step 32 in round five.
8. The spec drags with Cmd held so the arithmetic is exact; the snapped path (guides and grid) is covered by `snap-freeform.test.ts` and the canvas spec's existing drags.

### 2.6 Files

Changed: `packages/schema/src/canvas.ts`, `packages/schema/src/canvas.test.ts`, `packages/viewer/src/snap.ts`, `packages/viewer/src/Gestures.tsx`, `packages/viewer/src/rotate.ts`, `packages/viewer/src/Editor.tsx`, `packages/viewer/src/Editor.css`, `packages/viewer/src/Freeform.tsx`, `packages/viewer/src/__tests__/canvas.test.ts`, `packages/render/src/blocks/primitives.ts`, `packages/render/src/blocks/dia.ts`, `packages/render/src/block-css.ts`, `packages/render/src/__tests__/blocks.test.ts`, `packages/render/src/__tests__/__snapshots__/canvas.test.ts.snap`, `packages/chrome/src/inspector/geometry.tsx`, `docs/gslides-parity/build-4/hotfix-3.md` (this note). New: `packages/viewer/src/__tests__/measure-boxes.test.ts`, `apps/studio/e2e/resize.spec.ts`. Nothing under `docs/gslides-parity/verification-4/`, `VERIFICATION-4.md`, `build-4/hotfix-2.md` or `scripts/probes/new-write-probe.mjs` was touched; `EditorRoot.tsx`, `controller.tsx` and `room-client.ts` were left to hotfix 2.

## 3. The ship step

By the ship step, 2026-09-14, 18:35 PDT onwards, on the shared checkout over `main` at `02e92c6` (hotfix 2's production table commit, on top of `cb646e9`, `0830115` and `43707c3`). Other rounds ran on the checkout throughout (a `check.mjs --from 21` chain with its dev server on 4321 and its specs, a Prototemplate tank check with two Chrome instances, the round four fixer round); the load average stood between 17 and 70 for the whole step. Scratch evidence sits under `/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/hotfix3/ship/` (the gate logs, the deploy logs, the spec logs, the trace of the failed test, the probe and its log, the cleanup logs).

### 3.1 The gates, re-run

| Command                                                                                                                                    | Result                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules/.bin/tsc -b`                                                                                                                 | exit 0 (three runs: at the start, after the `snap.ts` comment below, after the spec change of 3.3)                                                                                                                                                                                       |
| `cd packages/schema && ../../node_modules/.bin/vitest run`                                                                                 | 24 files, 501 tests; the full run under load 46 timed out one property test (`apply-layout.test.ts`, then `comments.test.ts` on the second run, each "Test timed out in 5000ms"); the two files alone: 21 passed in 4.1 s                                                                |
| `cd packages/viewer && ../../node_modules/.bin/vitest run`                                                                                 | 28 files, 249 tests passed                                                                                                                                                                                                                                                               |
| `cd packages/render && ../../node_modules/.bin/vitest run`                                                                                 | 14 files, 337 tests passed                                                                                                                                                                                                                                                               |
| `cd packages/chrome && ../../node_modules/.bin/vitest run`                                                                                 | 54 files, 496 tests; two timed out under load (`editor-shell-render.test.tsx`, `format-options-round-two.test.tsx`, 5000 ms); the two files alone: 24 passed                                                                                                                             |
| `cd packages/chrome && ../../node_modules/.bin/vitest run src/menus/__tests__/default-view-words.test.ts`                                  | 8 passed                                                                                                                                                                                                                                                                                 |
| `cd packages/agent && node src/generate/main.ts --check`                                                                                   | every committed contract is current. The working tree's `packages/agent/generated/*.json` diff ("Measure (ch)" to "Line length (ch)") belongs to another round's `packages/schema/src/blocks.ts` change and is not this hotfix's; no generated file joins the commit                     |
| `node scripts/canvas-fidelity.mjs --deck decks/gt-brand --deck decks/templates/gt-brand --deck decks/templates/blank --max-mismatch 0.005` | exit 0: 171 slides converted, 342 pairs compared, 0 over budget; worst 0.262 percent (gt-brand/directions dark), mean 0.004 percent, 311 s under load                                                                                                                                    |
| `node scripts/check.mjs --only 4,5,6`, first run                                                                                           | step 4 ok in 0.7 s; step 5 (`pnpm test`) failed 26 tests in 10 files, every one "Test timed out in 5000ms" under load 46 to 70 (the CLI's browser tests, the MCP tool list, the agent contracts test, the schema property test), 2982 passed; step 6 did not run. Re-run recorded in 3.4 |
| `node_modules/.bin/eslint <the hotfix's source and spec files>`                                                                            | 22 findings, every one on a line outside the hotfix's hunks (pre-existing at HEAD: `no-unnecessary-type-assertion`, `no-unnecessary-condition`, `import/no-duplicates`, `no-shadow`, `no-fallthrough`); 0 in the two new files                                                           |
| `node_modules/.bin/prettier --check` on `snap.ts` and `resize.spec.ts` after the two edits below                                           | clean                                                                                                                                                                                                                                                                                    |

One edit to the fixer's files before the preview: `packages/viewer/src/snap.ts` had lost the one line docblock of `resizeCursor` in the rewrite of `snapResize`; the line is back, so the diff holds only the model's wiring.

### 3.2 The preview deployment and the smoke

`vercel deploy --yes --archive=tgz` from the repository root failed twice while packing the upload (`ENOENT ... decks/untitled-20260915-71o5/deck.json`, then `decks/fixture-2/deck.json`): another round's specs create and delete scratch decks under `decks/` on the shared checkout faster than the CLI can stat them. The third deploy ran from an rsync snapshot of the tree (the `.vercelignore` exclusions, `decks/untitled-*` and `decks/e2e-*` left out, `.vercel/` copied for the project link), the same content the root would upload: `https://turboslide-1c1gzevld-kl01s-projects.vercel.app`, READY, behind Vercel Authentication (302 without the Trusted Sources header, 200 on `/home` and `/edit/gt-brand` with it). The snapshot carries the working tree, so the preview also runs the other rounds' uncommitted edits (`apps/studio/src/editor/controller.tsx`, `apps/studio/src/server/write.ts`, `decks.ts`, the inspector's `props.ts`, `seg.tsx`, `select.tsx`, the home copy); the commit below carries only this hotfix's files, and the production run of 3.5 is the check of what shipped.

`node scripts/hosted-smoke.mjs --base <preview> --token-env TURBOSLIDE_TOKEN` with `VERCEL_OIDC_TOKEN` from `.turboslide/vercel-dev.env` and the bearer from `~/.config/turboslide/hosts.json`: 37 of 37 passed (four rows skipped by name as on every run: the private store, the twin URL, the restricted deck, the template copy).

### 3.3 The spec on the preview, the stall it met, and the settle it now waits on

The root Playwright config sends no Trusted Sources header, so the preview run used a config under the gitignored `.turboslide/` that spreads the root config and adds `extraHTTPHeaders` from `VERCEL_OIDC_TOKEN` (the way `hosted-smoke.mjs` and `layout-shift-audit.mjs` send it); the repository's config is unchanged. `PLAYWRIGHT_BASE_URL=<preview> node_modules/.bin/playwright test --config .turboslide/hotfix3-preview.playwright.config.ts apps/studio/e2e/resize.spec.ts` under `.turboslide/e2e.lock` (taken with `until mkdir`, released after), first run, 18:50 to 19:01: 7 of 8 passed (the setup, the three zooms of the rectangle, the picture and the text box with every handle, the three zooms of the group; 10.8 m), and the rotated test failed on its 300 s budget inside `landed`'s `settled` wait after its third drag.

What the trace holds (`.turboslide/playwright-preview/.../trace.zip`, network and actions): the tab opened the scratch deck at revision 142 on the blob tier; nine `POST /api/decks/<id>/ops` writes followed (the five `resetObjects` boxes, `block.rotate` to 30, the nw, n and ne drags), each answered `ok: true` in 551 to 1386 ms with `head` 143 to 151, each entry's admitted mutation identical to the request, the ninth `block.set /pos {x: 157.828125, y: 169.109375, w: 230, h: 122, rotate: 30}`, the model's box for the ne handle on the rotated rectangle. `deck.info` on the preview afterwards: revision 151; `slide.get`: the rectangle at exactly that box; `version.list`: version 148 at revision 151 written at 01:56:39.460Z, half a second after the POST. The write landed and was checkpointed. The page's `describe().state.revision` moved 150 to 151 two seconds after the release (the spec's `expect.poll` passed) and the standard settle (`pending === 0 && revision === serverRevision`, the wait every canvas spec uses) never came true in the remaining four and a half minutes. The stream (`GET /api/decks/<id>/stream?since=142`) stayed open 278 s and delivered nothing after `hello`; its reconnect asked `since=142` again. Every 31 s a 25 s long poll server function answered `[]`, and a document read ran every 60 s.

The mechanism, read in `packages/realtime/client/room-client.ts`: an admitted op of the tab's own moves from `pending` to `retained` ("acked at a seq, not yet covered by a checkpoint") and leaves `retained` only on a stream `checkpoint` event (`retained = retained.filter((op) => op.seq > event.toSeq)`) or a resync; `status().pending` counts the in-flight ops alone. `apps/studio/src/editor/controller.tsx` `onStatus` publishes `pending: status.pending + status.retained`, which is what `describe().state.pending` reports (and what draws "Saving…"). On the blob tier under fluid compute the instance that serves a tab's stream is not the one that took its write, and the checkpoint frame reaches the tab when that instance sees it, or not at all within the run (hotfix 2 cause A3 names the same frames). A probe against the preview on the same scratch deck (`settle-probe.mjs`, six `block.set /pos` writes on the rotated rectangle and the picture through the window API, the state read every 250 ms for up to 15 s each): every write was answered at the next revision with the room's `sync.pending` at 0 and `revision === serverRevision` within a second; one of the six kept `sync.retained` at 1 and `pending` at 1 for the whole 15 s (the standard settle false), the next write's frame released both, the other five settled in 2 to 1521 ms. The stall is not the rotation and not the fractional position (the same fractional box settled in 2 ms one write later): it is the wait for the stream's frame.

This is outside the hotfix's files (the room client and the controller are hotfix 2's and round five's), the product effect is the chip reading "Saving…" until the frame arrives, and it is recorded for round five in 3.6. The fix in the same files is the spec's wait: `settled` in `apps/studio/e2e/resize.spec.ts` now waits for nothing in flight (`state.sync.pending`, the room's own count, falling back to `state.pending` when there is no room) and `revision === serverRevision`, and no longer for a retained op; the box a drag committed is read from the admitted form the acknowledgement carried, which is what every assertion of the spec compares against the model. No assertion changed; no existing spec changed (the other specs keep the standard settle on the memory tier). The re-run is in 3.4.

### 3.4 The re-run, the remaining gate, the commit

The spec with the settle of 3.3, against the same preview under the lock, 19:16 to 19:21: 8 of 8 passed in 5.0 m (the setup 21.9 s; the three zooms of the objects and of the group; the rotated rectangle with Shift and Alt). The run's scratch decks (`e2e-resize-mu20lvlx` from the first run, `e2e-resize-mu21jaqy` from the second) were trashed and deleted forever through the actions API (`deck.trash`, `deck.remove`; `/edit/<id>` answers 404). No redeploy was needed: the change is in the spec, which runs from the checkout.

`node scripts/check.mjs --only 5,6`, second run at load 12 to 31: step 5 (`pnpm test`) ok in 90.2 s, 3008 passed, 2 skipped, no timeout; step 6 (`pnpm build`, the client bundle check, the greps) ok; "all 2 selected step(s) passed in 99.2 s". With step 4 from the first run, steps 4, 5 and 6 are green.

The 25 s long poll of 3.3 is the session poll: another round committed `720ccb4` ("the session poll cadence at 25 s plus 6 s", `useStudioSession.ts`) to `origin/main` while this step ran, so the hotfix commit sits on it.

Commit `1e781324d0f67349a75f7d70692af32afd378cf0` on `main`, "Turboslide round four hotfix: one resize model for every block kind", by an explicit path list of the eighteen files of 2.6 (this note included), the repository's local identity, the `Co-Authored-By` trailer; no generated file, nothing of `verification-4/`, `VERIFICATION-4.md`, `hotfix-2.md`, `new-write-probe.mjs`, `.github`, `decks/untitled-*`, the design previews, `.turboslide` or `.vercel`. `git push origin main`: `720ccb4..1e78132`, accepted on the first try. Production is in 3.5.

### 3.5 Production

The push started deployment `dpl_Gug2NGGZY7kaLQEFm2m1bSkGB88X` (`turboslide-qrrijps9l-kl01s-projects.vercel.app`); `https://turboslide.vercel.app` served it, Ready, at 19:23:27, 97 s after the push (the first poll accepted `dpl_CS9T12VPJQo4HdcnCN7WWaW2L31a` at 19:22:35, but that build was created at 19:01:15 from `720ccb4`, before the push; the second poll waited for the deployment whose URL the project listed as Building after the push).

`PLAYWRIGHT_BASE_URL=https://turboslide.vercel.app node_modules/.bin/playwright test apps/studio/e2e/resize.spec.ts` (the root config; production is not behind Vercel Authentication) under the lock, first run 19:24 to 19:25: the setup passed and the 50 percent test failed on the eighth drag of the rectangle (the w handle) at the "nothing jumped at the release" check, `sameBox(result.preview, after, 1)`: `x 221 vs 269`. The drag line the spec printed shows the committed box at the model's `{x: 269, y: 187, w: 217, h: 137}` and the readout at `217 × 137`, so the write and the readout were right; the wrapper's box the spec read 60 ms after the last pointer move was still the previous drag's `x 221, w 265`: the sheet re-renders the slide for a draft after the overlay's readout, and under the machine's load that frame came later than the fixed pause. The same read passed twice on the preview (about 300 drags). `dragHandle` now reads the wrapper's box once two reads 40 ms apart agree (within 1.5 s), so it reads the drawn draft of the last move; the assertion is unchanged (the drawn box before the release equals the box that landed). Serial mode skipped the other six tests of that run; its scratch deck `e2e-resize-mu21t64a` was trashed and deleted forever through the actions API.

The screenshot script (`production-shots.mjs`, scratch) ran after the spec in the same lock: a scratch copy of the GT deck, a blank canvas slide, a rectangle, a picture (the stored `gh-gt` capture) and a grow text box inserted through the window API, the south east handle of each dragged by 35 percent of the box with Cmd held, one shot with the pointer down and one after the commit, the boxes in `production.json`. Its first run completed the rectangle (press on `handle.hs-rect.resize.se`, readout `324 × 203`, the wrapper and the shape's svg at `324 × 203` under the pointer and after the commit, `{x: 120, y: 120, w: 324, h: 203}` committed) and then waited 30 s on the strict settle after the picture's write, the retained-op wait of 3.3 on production; the script took the spec's settle and ran again. Its first scratch deck `hotfix3-shots-mu21urir` was deleted through the API.

The second production run of the spec (19:28 to 19:30) failed the same check on the sixteenth drag, the picture's sw handle: `x 503 vs 444`, the wrapper at the pre-drag box while the committed box was the model's `{x: 444, y: 154, w: 383, h: 208}` and the readout `383 × 208`. Its trace (`.turboslide/playwright/resize-at-50-percent-.../trace.zip`, the DOM snapshot per action) settles what the wrapper did: through the eight moves it followed the pointer step by step (`331 × 180`, `339 × 184`, up to `383 × 208`, each with the readout naming the same size), then about 100 ms after the last move, with the pointer still down, it snapped back to the pre-drag `324 × 176` and the readout was gone, and the release drew `383 × 208`. So the live preview was cleared under the pointer: `packages/viewer/src/Editor.tsx` ended the preview on every document change (the `[doc]` effect, "a new document ends any preview") and when a commit's answer settled, and on the blob tier the checkpoint frame of the previous drag's write (3.3) reaches the tab seconds later, in the middle of the next drag. On the memory tier the frame lands before the next drag begins, which is why the dev server and the two preview runs never showed it. A person dragging on production sees the object fall back to its old box mid-drag until the next move, and jump at the release: part of what Kevin reported.

The fix, in the hotfix's own file: both clears skip while a gesture is down (`gesture.current` is set at pointer down and cleared at the release, before the commit), the next move recomputes the preview over the new document through `docRef`, and the release commits over it. `tsc -b` exit 0; the viewer suite 28 files, 249 tests passed; prettier clean. The probe step is the spec's "nothing jumped at the release" assertion, which caught the defect twice and whose trace holds the evidence; a jsdom unit test of the Editor's draft lifecycle is recorded for round five in 3.6. Commit `6679c54349548e33e30537d9ed2478441d0f5357`, "Turboslide round four hotfix: a live gesture keeps its preview through a late document update" (`Editor.tsx`, `resize.spec.ts` with the pre-release wait above), pushed `1e78132..6679c54`.

The screenshot script's second run (19:30, on the build of `1e78132`) completed the three objects; its rows are the table below and its scratch deck `hotfix3-shots-mu221jrx` was deleted through the API; the spec run's `e2e-resize-mu21z7nh` too.

The push of `6679c54` started deployment `dpl_F68Eh7ETHKstZTL1USjfBvxuVeBk` (`turboslide-m0gsdzuzd-kl01s-projects.vercel.app`); production served it, Ready, at 19:38:06. `node scripts/hosted-smoke.mjs --base https://turboslide.vercel.app --token-env TURBOSLIDE_TOKEN` against it: 37 of 37 passed. The spec waited on the lock from 19:38:26 while the round four verifier's phase B chain (the parity audit, the tooltip audit, the chrome lint on six URLs, its shots, the banner probe, the preload ceilings, the perf budget on a vite preview) held it, and took it at 20:04:28 when that chain released it.

`PLAYWRIGHT_BASE_URL=https://turboslide.vercel.app node_modules/.bin/playwright test apps/studio/e2e/resize.spec.ts`, third production run, 20:04 to 20:15 on the build of `6679c54`: 8 of 8 passed in 10.5 m. The setup; at 50, 100 and 200 percent every one of the eight handles of the rectangle, the picture and the grow text box (72 drags: the press on the handle, the committed box the model's, no jump at the release with the drawn box under the pointer equal to the box that landed, the readout the box, the content taking the box with the text at 22 px and `autofit: 'none'`, the Format options fields reading the box, one undo per object); every handle of the group at the three zooms; the rectangle at 30 degrees with its anchored corner within 1 px and the dragged corner under the pointer, Shift keeping the text box's ratio, Alt keeping the centre. The two drags that failed the pre-release check on the earlier builds (the rectangle's w at 50 percent, the picture's sw at 50 percent) passed with the guard. The run's scratch deck `e2e-resize-mu238ysc` was trashed and deleted forever through the actions API (`/edit/<id>` 404).

The screenshot script then ran in the same lock (its third run, 20:15, scratch deck `hotfix3-shots-mu23mh2g`, deleted the same way). The files under `docs/gslides-parity/build-4/hotfix-3/`: `canvas-before.png` (the three objects at their starting boxes), `shape-during-drag.png`, `shape-after-release.png`, `picture-during-drag.png`, `picture-after-release.png`, `text-during-drag.png`, `text-after-release.png` (each pair: the pointer still down after the last move with the live box and the size readout, then the committed box with the object selected), and `production.json` with the rows below. Every box is in sheet pixels; the south east handle was dragged by 35 percent of the box with Cmd held.

| Object              | Press landed on               | Before              | Delta    | Readout under the pointer | Drawn box under the pointer | Committed box                                            | Content box after                                                                 | Autofit          |
| ------------------- | ----------------------------- | ------------------- | -------- | ------------------------- | --------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------- |
| Rectangle (`shape`) | `handle.hs-rect.resize.se`    | 120, 120, 240 × 150 | +84, +53 | 324 × 203                 | 120, 120, 324 × 203         | 120, 120, 324 × 203                                      | the shape's svg 120, 120, 324 × 203                                               | none             |
| Picture (`gh-gt`)   | `handle.hs-picture.resize.se` | 460, 120, 240 × 160 | +84, +56 | 324 × 216                 | 460, 120, 324 × 216         | 460, 120, 324 × 216 (the 3:2 ratio kept from the corner) | the picture frame 460, 120, 324 × 216                                             | none             |
| Text box (grow)     | `handle.hs-text.resize.se`    | 800, 120, 260 × 140 | +91, +49 | 351 × 189                 | 800, 120, 351 × 189         | 800, 120, 351 × 189                                      | the paragraph 800, 120, 351 × 165 (reflowed in the new width, the font unchanged) | `grow` to `none` |

In every row the drawn box under the pointer, the readout and the committed box agree, and the content took the box. On this build the picture's row waited on nothing: the screenshot script's settle is the spec's.

Production at the end of the step: `main` at `6679c54`, `https://turboslide.vercel.app` on `dpl_F68Eh7ETHKstZTL1USjfBvxuVeBk`. No scratch deck of this step remains on the store (`deck.list` names none of `e2e-resize-*` or `hotfix3-shots-*`); the other rounds' `untitled-*` decks were left alone. The lock this step took was released at 20:15:26 (the verifier's next run took a fresh one two seconds later); no dev server, probe, browser or Playwright process of this step remains. No `pnpm install`, `pnpm add`, `pnpm exec`, `pnpm build` outside `check.mjs`, or Docker was run; the only git write commands were the three explicit path commits and their pushes. Nothing under `docs/gslides-parity/verification-4/`, `VERIFICATION-4.md`, `build-4/hotfix-2.md` or `scripts/probes/new-write-probe.mjs` was touched.

### 3.6 Open items for round five, recorded by the ship step

1. A retained op holds "Saving…" until the stream's checkpoint frame reaches the tab; on the blob tier under fluid compute that frame took over 15 s for one write in six and over 4.5 minutes once (3.3). The room client releases a retained op only on a `checkpoint` event or a resync; the ops answer already carries `head` and `revision`, so the client could release the retained ops at or below the answered head from the answer itself, or the chip could stop counting retained ops once the answer named their revision. Hotfix 2's and B7's files (`room-client.ts`, `controller.tsx`); the fixer's deviation 1 (R1) stands beside it.
2. The Editor's draft lifecycle has no unit test: the guard of 3.5 (a live gesture keeps its preview through a document change and a late commit answer) is covered by the spec's "nothing jumped" assertion on production and its trace. A jsdom test that mounts the Editor, starts a resize with pointer events, swaps the document and reads the wrapper's box belongs beside `editor-keys.test.ts`.
3. Every e2e spec carries its own copy of the `settled` wait with the strict condition (`pending === 0 && revision === serverRevision`); on a hosted blob-tier target each of them can stall on a retained op the way the resize spec did (3.3). One shared helper with the resize spec's condition (nothing in flight, the reported revision at the server's) would let the other specs run against a preview or production.
4. The root Playwright config sends no Trusted Sources header, so a spec cannot run against a preview behind Vercel Authentication without a side config; `extraHTTPHeaders` from `VERCEL_OIDC_TOKEN` in `playwright.config.ts`, the way the audits and the smoke send it, would make `PLAYWRIGHT_BASE_URL=<preview>` enough.
5. `vercel deploy --archive=tgz` from the shared checkout fails while another round's specs create and delete scratch decks under `decks/` (3.2); `decks/untitled-*` and `decks/e2e-*` in `.vercelignore`, or a deploy from a snapshot as this step did, keeps a preview deploy independent of the other rounds' runs.
6. `resize.spec.ts` joins check step 32 (SPEC-5-amendments A4), with the pre-release wait and the settle of this step.
