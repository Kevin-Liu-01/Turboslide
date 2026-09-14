# Round five amendments

Written by the orchestrator on 2026-09-14 after the round four ship commit (`43707c3`) reached production and Kevin reported three defects on it the same afternoon. This document is binding above `SPEC-5.md` and `MILESTONES-5.md` where they differ; where it is silent, they stand.

## A1. Kevin's reports, verbatim

- "using it is very hard, changes keep messing up, its some youre at revision 2 vs revision 12 despite being yourself, then you can see yourself editing it even though it's you in the slide, fix"
- "expanding and shrinking doesnt really work, the scaling isnt going super well. and fix the revision out of dateness on our own browser instance lol, this system needs to be reworked to be a lot better and accurate. add more font options too"

Reading: (a) a single editor in one browser sees writes refused as stale (`baseRevision N is stale; the document is at revision M`, `packages/schema/src/reduce.ts` line 532 and `StaleRevisionError` in `packages/store/src/templates.ts`) and sees their own presence drawn as a remote collaborator; (b) resizing an object by its handles does not scale correctly; (c) the sync system must be reworked so a single user never meets a revision conflict and two users converge without losing an edit; (d) the font menu must offer more faces than Inter.

## A2. The hotfixes before day 0

Two hotfixes run before round five's day 0 and their commits are part of `BASE`:

- hotfix-2 (`docs/gslides-parity/build-4/hotfix-2.md`): the revision and presence defects, with `scripts/probes/new-write-probe.mjs` extended to twelve acknowledged edits, a reload, a second tab and zero remote rows while alone.
- hotfix-3 (`docs/gslides-parity/build-4/hotfix-3.md`): the resize defects, with one resize model shared by the gesture, the inspector and the keyboard, and `apps/studio/e2e/resize.spec.ts`.

The round's B7 and B4 start from those commits and keep both probes green.

## A3. The sync engine rework (B7)

Google Slides is the reference: a single user never sees a revision conflict, no keystroke is lost, and the saved state is confirmed within about a second. The decisions:

1. One revision authority. The store's manifest revision is the truth. Every write answer, every stream frame and every document read carries `revision`. The client's `serverRevision` is the highest revision acknowledged by a write answer or delivered by the stream, never a value the client computed.
2. No time based document cache on the blob tier. The `syncTtlMs` window in `packages/store/src/blob-store.ts` (750 ms at `BASE`) is removed for documents and manifests: a write reads the manifest with its etag and commits with `ifMatch`; a read inside one request reuses one snapshot; a cached document is served only when its revision equals the revision the room last delivered to that instance, and a stream frame with a higher revision invalidates it. Fluid compute runs several instances, so instance memory is never the truth.
3. Refused writes rebase. A 409 answers the current revision and the operations since `baseRevision` (the operation stream holds them). The client rebases its pending mutations onto them with round three's operation model and retries once without a prompt. Only a true conflict on the same field of the same block shows the conflict card, and the card names the other author.
4. One write in flight per tab. The checkpointer coalesces, but pending writes are queued per tab and the next write leaves only after the previous answer's revision is applied. The status chip reads "Saved at revision N" from `serverRevision` and never shows a revision behind the server's.
5. One identity per tab. One `clientId` per tab (sessionStorage), one principal per browser (the sealed cookie). The self filter applies on every presence surface (roster, title slot, filmstrip chips, sheet outlines, carets, pointers, follow) by `clientId` and by `principalId`. The stream's echo of the tab's own operations is applied as an acknowledgement, never drawn as a remote change. The headless capture, the thumbnail route and the render route never join a room and never mint a principal; they run under a service identity.
6. Publication after the commit. The write path publishes the frame to the channel after the Blob commit succeeds, the frame carries the new revision and the author's `clientId`, and the room on every instance invalidates its cache on a higher revision.
7. Tests. `scripts/probes/sync-stress-probe.mjs <base>`: fifty rapid edits in one tab (every acknowledgement at the next revision, no stale message, no lost character), two tabs alternating edits (both converge to one document and one revision), a reload mid burst, a five second offline window (the pending mirror replays and converges), and the presence rows exactly right in both tabs. Unit tests for the rebase and the queue. Check step 37 runs the probe on the node-server build; the hosted smoke runs it against the preview with two contexts.
8. The wording rule. The strings "is stale" and "baseRevision" never reach a user; the conflict card's sentence names what happened in plain words.

## A4. The resize model (hotfix-3, then B4)

One pure function in `packages/schema/src/canvas.ts`, `resizeBox(handle, delta, modifiers, rotation, kind, box)`, shared by the gesture, the inspector and the keyboard: the opposite edge or corner anchored; corners keep the aspect for pictures, icons, materials, plates, aspect locked shapes and under Shift; Alt resizes about the centre; the client delta is divided by the sheet scale once so zoom does not matter; a rotated object's handles move along its rotated axes; shapes, pictures, icons, materials, plates, lines, tables, charts, diagrams and groups scale their content with the box; a text box reflows and keeps its font size unless autofit says otherwise; minimum sizes hold; the readout and the inspector read the same `pos`; undo is one step; nothing jumps at pointer down or up. `resize.spec.ts` joins check step 32 and stays green through B4's page sweep and the shape interpreter.

## A5. The font catalog (B7)

Google Slides' Font menu lists Google Fonts. The decisions:

1. `Typography.family` (an id from `FONT_IDS`) on the text style and on the theme's two roles (`text`, `display`); absent means the theme's face (Inter at `BASE`). The integrator lands the field on day 0 with the other schema rows.
2. `packages/fonts/src/catalog.ts` with about twenty five open licence faces Google Slides also offers, each row `id`, `name` (the name PowerPoint and Google Slides use), `category` (sans, serif, display, mono), `weights`, `italic`, `licence` (OFL 1.1 or Apache 2.0), `files`, `source` (the pinned Google Fonts commit path): Inter (present), Roboto, Open Sans, Lato, Montserrat, Poppins, Source Sans 3, Source Serif 4, Merriweather, Playfair Display, Lora, PT Serif, Libre Baskerville, EB Garamond, Nunito, Raleway, Work Sans, DM Sans, Space Grotesk, Oswald, Bebas Neue, Roboto Mono, JetBrains Mono, IBM Plex Sans, IBM Plex Mono, Fira Code. The files live under `packages/fonts/assets/<id>/` as woff2 (variable where the family ships one) beside their `LICENSE`, fetched once by `packages/fonts/scripts/fetch-fonts.mjs` from the Google Fonts repository at a pinned commit and committed; the check chain never fetches. A family under a licence other than OFL or Apache is not added.
3. Loading. The renderer emits one `@font-face` block per family a deck uses into the sheet stylesheet and nothing for unused families; the editor's picker renders each label in its own face with `font-display: swap`, loading a face only when its row scrolls into view. The `/edit` budgets of SPEC-4 4 hold: no font file loads before the ready mark unless the deck uses it.
4. The surfaces. The toolbar's Font dropdown in Google's position (left of the font size control) with a search field, the used families first, then the catalog by category, each label in its face, and "More fonts" opening Google's dialog form with the categories and the licence line. The theme mode's Fonts control (B6) lists the same catalog for the two roles. The Format menu's Text submenu gains nothing new; the dropdown writes the text style through the existing text style action.
5. Exports. Editable text names the family in `a:latin typeface` and the residual line names families PowerPoint may substitute on a machine without them; the Perfect raster embeds nothing because it is pixels; the standalone HTML inlines the used faces as base64 woff2 (subset with the fonts venv when present, else the full file, the sizes recorded in `b7.md`); the PDF and the thumbnails load the files through the headless capture.
6. Actions. `font.list` (the catalog with licences), `theme.set /fonts/text` and `/fonts/display` (B6's theme record), the text style action with `family`; the CLI `turboslide fonts list`.
7. Tests. The catalog's files and licences exist (a unit test); the renderer emits one `@font-face` per used family and none otherwise; the picker's row count equals the catalog's; the Editable text export names the face; `compare-to-shoot` is unchanged because the GT deck uses Inter alone.

SPEC-5 section 17 row 24 (fonts beyond Inter left to Kevin) is superseded by this section.

## A6. B7 Sync engine and fonts

Estimate: 90 agent hours. Dev server port 4358. B7 joins MILESTONES-5's six builders; the integrator's day 0 note maps its ownership onto the tree after hotfix-2 and hotfix-3.

Owns: the sync client module the integrator names on day 0 after reading hotfix-2 (new `apps/studio/src/editor/sync/**` or `packages/realtime/src/client/**`), the write queue and rebase functions that `controller.tsx` imports (the controller stays the integrator's file; B7's lines in it are requests answered the same day), the document read path of `packages/store/src/blob-store.ts` (`sync`, the manifest read, the cache rule; B2 owns the media entries of the same file, so each edits only its own functions and says so in its notes), `packages/chrome/src/presence/**` (the self filter), new `scripts/probes/sync-stress-probe.mjs`, `packages/fonts/**` (the catalog, the assets, the fetch script, the tests), new `packages/render/src/fonts.ts` (the `@font-face` emission), new `packages/chrome/src/FontPicker.tsx` and `dialogs/MoreFonts.tsx`, the toolbar row by request to the integrator, `packages/export/src/pptx/text.ts`'s family lines by request to B5, `packages/export/src/standalone` font inlining lines by request to B1 where `renderStandalone` is B1's, the `font` handler module, `apps/studio/e2e/{sync,fonts}.spec.ts`, `docs/sync.md`, `docs/fonts.md`, `docs/gslides-parity/build-5/b7.md`.

Delivers: day 1 (merge 1): the catalog with its assets and licences, the `Typography.family` runtime and `FONT_IDS`, the renderer's `@font-face` emission, and the sync stress probe written and run against `BASE` with its baseline numbers recorded in `b7.md`. Days 3 to 7: A3 items 1 to 8 (the sync engine), A5 items 3 to 7 (the picker, the dialog, the exports, the actions), the two specs, the two documents.

Acceptance: the sync stress probe green on 4358 and on the preview; `cd packages/fonts && ../../node_modules/.bin/vitest run`; `cd packages/render && ../../node_modules/.bin/vitest run fonts`; the presence and realtime suites; `PLAYWRIGHT_BASE_URL=http://localhost:4358 node_modules/.bin/playwright test apps/studio/e2e/sync.spec.ts apps/studio/e2e/fonts.spec.ts`; `node apps/cli/bin/turboslide.mjs fonts list --json` listing the catalog; the `/edit` budgets unchanged with no font file before the ready mark on a deck that uses Inter alone.

## A7. Changes to the plan

- Merge 2 order: B4, B1, B2, B6, B3, B5, B7.
- Check steps: 32 to 36 as SPEC-5 16.7, plus 37 (the sync stress probe on the node-server build, the fonts tests); `--list` prints 37.
- The verifier adds: the sync stress probe against the preview in two browsers, a deck with five families exported in both modes and opened, `resize.spec.ts` against the preview, and Kevin's three reports re-walked on the preview with screenshots.
- The ship step's commit title adds "the sync engine and the font catalog".
- SPEC-5 17 gains a row: the font catalog's membership (faces Kevin wants added or removed; each is one catalog row and one asset folder).
