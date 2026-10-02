# Hotfix builder HB: H5 to H10

The hotfixes H5 to H10 of docs/NEXT.md 3.2, built on `next/round1` in the worktree
`Turboslide-next`, one commit each, in that order. The dev servers were mine on 4502 and 4512
(tmp store, memory channel, local open surface), stopped before the note was closed. Every
timing below carries the one minute load average it was read at.

## H5: the format gate

- `.prettierignore`: the evidence lines (old 22 to 24 and 37 to 105, the realtime and cloudflare
  lines included) become the one line `docs/gslides-parity/`, with a comment that names NEXT.md
  5.3 rule 9. The fixture, fonts, wasm and Worker type lines stay.
- Readings: `node scripts/check.mjs --only 19` exit 0 in 127.9 s at load 53.84 to 72.44
  ("All matched files use Prettier code style!", "README.md is current");
  `node_modules/.bin/prettier --check .` exit 0 in 109.5 s at load 41.64. Before the change the
  evidence alone (`prettier --check --ignore-path <old file> docs/gslides-parity`) exited 2 with
  1,084 files warned and 13 that do not parse, 568.5 s at load about 50 to 70.
- Commit: `56431c76`.

## H6: the blank template draws no GT mark

- `decks/templates/blank/deck.json`: a brand record `{ "mark": { "kind": "none" }, "footer": { "logo": "none" } }`,
  the record the Brand kit panel's Logo > Remove writes (`ThemesPanel.tsx` `removeLogo`). The
  title slide's mark slot then draws nothing (`render/slide.ts` `titleMarkSlot`) and the frame
  band carries no wordmark (`render/stage.ts` `frameBandOf`), in the editor, the viewer's Frame,
  the print document the PDF is printed from and the PowerPoint's scene. `title.json` keeps its
  `mark` box: the schema requires it on a title slide (`schema/deck.ts` 562).
- `packages/render/src/stage.ts`: the `GT_BAND` comment names its scope, the GT template and the GT
  deck (decks without a record). No code changed there.
- Tests: `packages/render/src/__tests__/blank-template.test.ts` (5 tests: the record, both slides
  in both themes, the band and the stage, the print document, the GT template keeping `GT_BAND`);
  the render suite 432 passed, the store suite 263 passed, `turboslide validate decks/templates/blank`
  0 errors.
- Row `brand.template.blank-no-gt-mark` (feature brand, `core/brand.spec.ts`, broken, severity 3,
  audit-brand-surfaces 27). The driver reads the stage and the filmstrip on both slides of the
  file's Blank deck, downloads a PDF and a native PowerPoint, then sets the GT logo for a control
  (the PDF gains filled paths, the PowerPoint gains the wordmark and mark objects) and puts the
  record back to none.
- Row readings on 4502 (`PLAYWRIGHT_BASE_URL=http://localhost:4502 playwright test
  apps/studio/e2e/core/brand.spec.ts -g brand.template.blank-no-gt-mark`, under
  `.turboslide/e2e.lock`):
  - run 1 at load 15.38: not driven to its reads. The file's setup (`newDeck` on `/new`) met the
    dev server's dependency optimizer rebuilding its React chunks on the first browser visit;
    the page drew "Cannot read properties of null (reading 'useContext')" (two React copies) and
    the editor never came up in 90 s. The spec mocks the dev server's HMR socket, so the page
    never got Vite's reload. A rerun on the warmed server is the cure; nothing in the product.
  - run 2 at load 15.93 to 17.49: passed in 22.7 s.
  - run 3 at load 16.73 to 31.98 (JSON reporter): passed in 31.3 s. The record
    `{"mark":{"kind":"none"},"footer":{"logo":"none"}}`; the title slide and the split slide
    drew stage 0, filmstrip 0, wordmark 0; with the GT logo set the title slide drew 2 glyphs on
    the stage; PDF fills 48 against 51 with the GT logo; PowerPoint GT objects 0 against 3
    (`slideLayout2.xml` `ts:master#wordmark` and `GT wordmark`, `slide1.xml` `mark (mark)`).
- Shared files, staged by their own hunks only (the H2 lane's rows sat beside mine unstaged):
  `docs/gslides-parity/focus/core-matrix.json` (the row after `brand.panel.words-match-sheet`),
  `scripts/probes/core-matrix.test.mjs` (the count plus one, with a comment), `README.md` (the
  rendered "The brand kit" line of What works today, 24 of 24 rows).

## H7: a deck's export copies leave with the deck

- `packages/store/src/blob-store.ts`: `DECK_COPY_FOLDERS` (`exports`, `builds`, `bundles`) and
  `deckCopyPrefix(folder, id)`; `remove` lists and deletes the deck's three copy folders before
  it deletes the deck, so a store that refuses the delete fails the remove while the deck is
  still there to remove again. The job records under `exports/.jobs/` are no deck's folder.
- `apps/studio/src/server/export-sync.ts`: `storedExportPath` builds on `deckCopyPrefix`;
  `deckHoldsCopies(id)` answers whether the collection still holds the deck.
- `apps/studio/src/routes/api/export.$deckId.ts` (outside NEXT.md's list, no lane owns it): the
  `?job=&file=` form answers 404 for a deck deleted forever. On the file and tmp tiers a copy is a
  file in the instance's job folder that this route streams, so without it the local reading of
  the row stays 200.
- Tests: `packages/store/src/hosted.test.ts`, two tests on the blob collection (the copies of the
  removed deck go, another deck's and the job records stay; a refused delete keeps the deck and a
  second remove succeeds).
- Row `export.remove.copies-gone` (feature export, `core/export.spec.ts`, broken, severity 1,
  audit-performance 164): a PDF and a native PowerPoint through the sync export route, every copy
  200 while the deck lives, then Move to trash and Delete forever through the product, then every
  copy 404 within 5 s.
- Row reading on 4502 (`playwright test apps/studio/e2e/core/export.spec.ts -g
  export.remove.copies-gone`, under `.turboslide/e2e.lock`), load 23.62 at the start and 27.36
  at the end: passed in 11.3 s. Two copies (`/api/export/<deck>?job=&file=`, the PDF and the
  PowerPoint): 200 and 200 before the removal, 404 and 404 28 ms after it.
- Shared files, staged by their own hunks only: `core-matrix.json` (the row after
  `export.picture.progress-and-capture`), `core-matrix.test.mjs` (the count plus one),
  `README.md` (the rendered "Download and print" line), `export.spec.ts` (the test, the
  `teardown` import and the coverage entry).
- The hosted bound: Vercel's Blob page (https://vercel.com/docs/vercel-blob, last updated
  2026-08-26) says a delete "may take up to 60 seconds to propagate through our cache". A public
  copy can therefore answer from the CDN for up to a minute after the removal, past the row's
  5 s, on the preview and on production. The local tiers read the route and are not cached.
