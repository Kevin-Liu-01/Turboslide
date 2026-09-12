# Editor depth status

The state of Turboslide at the end of the editor depth round of 2026-09-11 (the preview drives ran
into 2026-09-12 UTC). Kevin's directives, verbatim: (1) "change this to say turboslide and the
default should be images but its just the default like slide sidebar like image 2" (his first
screenshot shows the sidebar head with the GT mark and the text GT brand deck; the second shows the
slide sidebar in thumbnail density with numbered thumbnails and titles); (2) "be able to drag stuff
around in each slide and reorder or move stuff - make the right sidebar much more intuitive and
clear and better with icons - have good tooltips in all control surfaces - be able to reuse
primitives and icons like boxes and shapes and selecting colors and font and typography controls
and stuff. come on this needs to be so much more in depth and we should be able to create decks in
turboslide deployment, and we can see the gt template presentation too"; (3) earlier, "for
presentation thing be able to copy the thing into the main app to edit it on your own or have a way
to connect the local slides with the app for you to edit or something or just be able to edit it
locally".

Four builders worked the round (the document, the stage, the chrome, the deck transfer), then an
integrator and a review fix round; this document is the verifier's record: what shipped per
directive, the product decisions taken over the specification, what integration changed, the
acceptance run on the tree this commit carries with its numbers, the tooltip audit, the export
result, the transfer commands, the state of the bearer token, the blockers and what Kevin must do.
The references are `docs/freeform.md` (the document, the renderer, the linter and the exporter),
`docs/deck-transfer.md` (the bundle, the CLI commands and the routes), `docs/hosting.md` (the store
and the token decision) and `docs/editor-depth-evidence/README.md` (the preview drives with their
files). Every number below comes from this machine (Node 24.13.0, pnpm 11.15.1, Chrome for Testing
147.0.7727.15 on ANGLE Metal, Apple M5 Max, the Prototemplate checkout present) or from a preview
deployment of the `turboslide` Vercel project, and the sentence says which.

## 1. What shipped, per directive

### 1.1 The head reads Turboslide, thumbnails are the default density

- The sidebar head carries the mark and the product name Turboslide (`packages/chrome/src/Sidebar.tsx`
  `PRODUCT_NAME`); the deck's title moved to the status slot. The SSR page of `/deck/gt-brand`
  carries the head text, which is how a deployment is told apart from the hosting round's build.
- Thumbnail density is the default: one 16:9 card per slide with its number and its title, 85 cards
  for the GT deck. The outline density (one 28 px row per slide: number, kind glyph and title) is
  one click away in the density Seg, as the second screenshot asked.
- The cards are live clones of the slides that mount on the client only, capture at most three at a
  time and load their pictures lazily (section 3), so the SSR page holds one copy of the deck and
  an editor write no longer waits behind the thumbnails.

### 1.2 Drag, the inspector, tooltips, primitives, colors and typography, decks in the deployment

- Grammar slides (`cols`, `split`, `center`, `left-mid`, `stack`): drag to move and reorder blocks
  within a slot and across slots, with a drop line and a slot outline while dragging; one
  `block.move` write per drop. On the preview drive a heading moved from the left column into the
  right on the `reputation` slide with 2 drop indicators shown, r12 to r13, one write.
- Freeform slides: `slide.setLayout` to `freeform` keeps every block where it is drawn (6 of 6
  positioned on the drive); a block drags anywhere with the 8 px grid, the rails, the content edges
  and centers, the column seams and the plate edges as guides drawn at the drop point; eight
  resize handles; marquee and Shift selection; the arrange bar with six aligns, two distributes,
  forward and back. Every gesture is one write (`block.set /pos`, `block.align`,
  `block.distribute`, `block.order`), so undo, versions and leases are unchanged.
- The inspector is rebuilt in sections with an icon per section
  (`packages/chrome/src/inspector/sections.ts`), still generated from the Zod annotations, with
  three new control kinds: `color` (swatches for ink, paper, ink-2, titanium, hair, hair-soft,
  plate, edge, green, amber, red and GT blue, plus a custom hex field that shows the off-palette
  lint mark), `typography` (the ladder sizes, weights 300 to 700 with the cap mark over 500,
  alignment, tracking and leading steps) and `position` (x, y, w, h, z). The IconPicker picks a
  sprite icon by name; the three text alignment glyphs joined the sprite (67 Heroicons plus
  `gt-mark`).
- Primitives: box, shape (rectangle, rounded rectangle, ellipse, line, arrow), rule, text and icon,
  inserted from the toolbar's Insert menu or from the palette's Primitives group, with `fill`,
  `stroke`, `strokeWidth`, `radius`, `color` and `typography` fields whose values come first from
  the theme tokens and the semantic palette. The renderer draws them on the half-pixel grid with 1
  px strokes (`packages/render/src/blocks/primitives.ts`); the native export writes them as shapes
  (section 6).
- Tooltips: the Tooltip primitive (`packages/chrome/src/Tooltip.tsx`) on every control, toolbar
  button, menu item, handle and chip, with the name, one sentence on what it does and the key;
  `scripts/tooltip-audit.mjs` measures it (section 5). The drive read three: Insert ("Primitives
  (box, shape, rule, text, icon, image, material), the grammar's blocks and ..."), Export ("Opens
  the export options: one perfect PPTX per theme, or the standalone HTML file.") and the density
  option Outline ("One 28 px row per slide: number, kind glyph and title.").
- Decks in the deployment: `/decks` creates a deck from the GT brand template (85 slides) or blank
  through the store; on the blob backend the deck is uploaded before the answer, so it works on the
  production URL (4.6 to 5.2 s per template deck on the host). Every row has Open, Present,
  Export and Download bundle. `/deck/gt-brand?present=1` is the GT template presentation on any
  studio that holds the deck.
- Agent writes persist hosted: `POST /api/actions/<id>` writes through the hosted store (before
  this round a hosted agent write never left the instance).

### 1.3 Copy a deck into the app, or connect the local slides

- The deck bundle is one zip with `manifest.json` (per-file digests) and `decks/<id>/...` in the
  layout of SPEC 4.1. `turboslide deck pack`, `deck unpack`, `deck push` and `deck pull` move it
  (the actions `deck.pack`, `deck.unpack`, `deck.push`, `deck.pull`, transport `cli`);
  `GET /api/decks/:deckId/bundle` and `POST /api/decks/bundle` are the hosted surface, with the
  bearer or a short-lived ticket. `/decks` has Upload deck bundle and Download bundle per row, the
  Export menu has Download deck bundle, and the Connect card on `/decks` names the push and pull
  commands with this deployment's URL filled in and a Copy button each (section 7).
- Editing locally is the checkout: `pnpm dev` on 4321 over `decks/`. Pull a hosted deck into it,
  edit, push it back; or push a local deck and edit it in the browser.

## 2. The product decisions recorded

Taken as the founder's direction over the specification's earlier rule and recorded in
`docs/freeform.md` section 1 and in AGENTS.md (the deviations list):

- The grammar layouts stay as they are and gain drag to move and reorder blocks within and across
  slots. Blocks in them still have no coordinates.
- A new layout, `freeform`, carries positioned blocks: `pos` with x, y, w, h and z on the 1600 by
  900 sheet, snapped to the 8 px grid and to the rails, the plates and the column seams. The
  validator requires `pos` there and refuses it everywhere else. A freeform slide is a
  `layout/freeform` finding at severity 1, so a pure grammar deck knows. Rotation stays out.
- The primitive blocks box, shape (rectangle, rounded rectangle, ellipse, line, arrow), rule and
  text carry color, stroke and typography fields. A color is a palette token first: the theme
  tokens ink, paper, ink-2, titanium, hair, hair-soft, plate and edge, and the semantic hues green
  `#12a37a`, amber `#f0a020`, red `#e5484d` and GT blue `#2f5ce0`. A custom hex is allowed and is a
  `color/off-palette` finding at severity 2.
- Typography offers the type ladder sizes (a size off the ladder is `type/ladder` at severity 2
  with a fix to the nearest step), weights 300 to 700 with the 500 cap enforced as the
  `type/weight-cap` lint and not as a hard block, alignment, letter spacing steps and line height
  steps. A field that is absent keeps the grammar default, so every deck written before this round
  renders unchanged.
- Two more rules keep freeform slides honest: `freeform/off-sheet` (severity 3, a block leaves the
  sheet) and `freeform/overlap` (severity 1, two text-carrying boxes intersect).
- Every control and toolbar button carries a tooltip with its name, what it does and its key.
- `TURBOSLIDE_TOKEN` is set on the production and preview environments (section 8), which closes
  the open decision of `docs/hosting.md` section 6 as option 2.

## 3. What integration and the review fix round changed

- `apps/studio/src/routes/edit.$deckId.tsx`: the editor's `on(...)` table gained `block.align`,
  `block.distribute`, `block.order` (the schema's arithmetic, one commit each) and
  `slide.setLayout` (the stage's measured boxes to freeform, lossless back to the recorded grammar
  layout, `convertLayout` otherwise); the Insert menu on `EditTools`; the palette entries built on
  every document change so the menu and the palette list one set; a write the Blob mirror refuses
  as unprovable is retried six times at growing intervals instead of being dropped.
- `apps/studio/src/server/bundle.ts` split from `bundle-core.ts`: the module the pages import
  reached `node:crypto`, which Vite externalizes in the browser with a throw at module evaluation,
  so the dev server's /deck never hydrated (the viewer spec failed on every test).
- `packages/viewer/src/Freeform.tsx` `readStageBoxes` queries the stage wrapper: under thumbnail
  density the sidebar's live clones are `.pt-slide` elements under the route's root too, and the
  layout switch measured a clone. The e2e specs' stage selectors changed for the same reason.
- `packages/chrome/src/Thumb.tsx`: live clones mount on the client only (a clone's `<a>` inside
  the row's `<a>` broke hydration of the whole sidebar and put 85 slide copies in the SSR page),
  and at most three captures fetch at once; `packages/viewer/src/LiveClone.tsx` marks clone
  pictures lazy (120 asset requests at once held every connection to the dev server so a write
  waited 15 s behind them; 6.6 s after both changes, and no longer behind pictures).
- `packages/store/src/blob-store.ts`: the mirror proves a document by md5 against `head()`,
  replays the version records through `applyWrite` when the CDN body lags, discards a mirror
  tainted by a failed commit and refuses an unprovable base (`StaleMirrorError`); `blob-fake.ts`
  gained `holdList`, `holdGet` and md5 versions; two regression tests. The cause and the live
  proof are in `docs/hosting.md` section 6 and `docs/editor-depth-evidence/README.md`.
- `apps/studio/src/server/actions.ts`: `deckDispatcher` is async and writes through the hosted
  store, opened before the folder check; the four call sites await it.
- `apps/studio/src/server/lint.ts` and `render.ts`: both open the deck through `openDeckStore`
  (the sync) before they read or render. Before this the page's `lint.run` counted 0
  `color/off-palette` while `POST /api/actions/lint.run` answered 1: a plain FileStore read of the
  instance's overlay that never pulled the mirror. `packages/store/src/hosted.test.ts` holds the
  case (instance B's `open().read()` answers A's r2 while B's overlay folder still holds r1).
- `apps/cli/src/commands/deck.ts`: push and pull send `VERCEL_OIDC_TOKEN` in the Trusted Sources
  header when set, so they reach a preview.
- `apps/studio/src/routes/decks.index.tsx`: tooltips on the deck title links; `data-hydrated` on
  `.ts-decks-page` from a mount effect, which `deck-transfer.spec.ts` waits for before its first
  click (two of its four tests had clicked before hydration); the updated stamp suppresses the
  hydration warning its time zone caused (React 418 on the host).
- `packages/chrome/src/inspector/asset.tsx`: the picture asset select carries a tooltip (the last
  miss of the audit). `scripts/tooltip-audit.mjs` waits for the shell instead of network idle, no
  longer counts a native `title` as coverage (title-only controls are listed apart and fail only
  under `--strict`) and walks a freeform slide's handles and arrange bar.
- `packages/schema/src/catalog.test.ts`: `deck.unpack`, `deck.push` and `deck.pull` join the list
  of mutating actions without a `baseRevision`.
- The docs: AGENTS.md (the authentication paragraph, the tooltip and palette rule, the sprite
  count, the actions paragraph, the freeform deviation, the bundle contract, the acceptance
  section), README.md (the layout, the pages, the CLI list, the hosting paragraph, the export),
  `docs/README.md`, `docs/hosting.md`, `docs/deck-transfer.md`, `docs/freeform.md` section 8,
  `scripts/editor-depth-drive.mjs` (the preview drive, section 9).

## 4. `pnpm check`

On the final tree, this machine, 2026-09-11 from 21:03 PDT, with five other worktrees' `vite
preview` servers running alongside (load average 6 to 7) and the preview deploy of section 9
archiving the tree during the first run:

| Step                         | Result            | Numbers                                                                                                                                                                                                                                                        |
| ---------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 install                    | pass              | 0.5 s (frozen lockfile, nothing to add)                                                                                                                                                                                                                        |
| 2 routes                     | pass              | 1.1 s                                                                                                                                                                                                                                                          |
| 3 contracts                  | pass              | 1.8 s: `pnpm generate:contracts` answers "14 files current" and the diff against the staged generated files is empty (the step fails as written while those files are modified and unstaged)                                                                   |
| 4 `tsc -b`                   | pass              | 2.5 s                                                                                                                                                                                                                                                          |
| 5 `pnpm test`                | pass on the rerun | first run: 2 of 119 files failed, `material capture freezes a frame` at 5003 ms and `parity mood-earth` at 5472 ms against their 5 s timeout while the deploy archived the tree (1141 passed); rerun alone: 119 files, 1143 passed, 3 skipped (1146) in 21.3 s |
| 6 build and client bundle    | pass              | 5.6 s (turbo: the native addon and wasm cached, the CLI 163 kB, the studio client and server); 0 of 24 client text files carry the marker, 1 of 59 server files does                                                                                           |
| 7 to 8 import                | pass              | 85 slides, 8 sections, 0 escape blocks                                                                                                                                                                                                                         |
| 9 validate                   | pass              | 0.9 s                                                                                                                                                                                                                                                          |
| 10 to 11 render              | pass              | 19.0 s; 170 records, no page errors                                                                                                                                                                                                                            |
| 12 compare to shoot          | pass              | 53.6 s: 170 pairs compared, 0 skipped, worst 0.408 percent, mean 0.016 percent against the 0.5 percent budget; every slide under 0.005 mismatch                                                                                                                |
| 13 to 14 sheet               | pass              | 3.8 s; 85 cells per theme                                                                                                                                                                                                                                      |
| 15 lint                      | pass              | 8.3 s: 187 findings on the GT deck at revision 24 (99 at severity 1, 88 at severity 2, none at 3)                                                                                                                                                              |
| 16 build the standalone file | pass              | 2.8 s: 14.54 MiB of the 16 MiB budget, 85 slides, revision 24, under the 16 MB budget                                                                                                                                                                          |
| 17 viewer spec               | pass              | 17.2 s: 6 of 6 (16.6 s inside Playwright)                                                                                                                                                                                                                      |
| 18 chrome lint               | pass              | 78.4 s: 24 audits per page over 3 widths and 2 themes, 0 with findings for both pages at three widths and two themes                                                                                                                                           |
| 19 format                    | pass              | 6.5 s                                                                                                                                                                                                                                                          |

The editor, window API and deck transfer e2e specs are the integrator's and the reviewer's runs
(`docs/editor-depth-evidence/README.md`): 8 of 8 in 28.8 s against the dev server for the first
two, and `deck-transfer.spec.ts` plus `editor.spec.ts` 10 of 10 in 36.6 s against a `vite preview`
of the built studio after the hydration wait.

## 5. The tooltip audit

`node scripts/tooltip-audit.mjs --base <origin>` walks the built client's pages (the editor on the
GT deck with editing on, the viewer, the deck list, and a scratch deck's freeform slide with a
block selected) and their menus (Insert, Export, the palette, a slide row's menu, the inspector)
and lists every interactive element without the Tooltip primitive. The verifier's run against a `vite preview` of the built studio on this checkout (port 4461, 2026-09-11 21:13 PDT, after the chain's step 6 built it): 0 missing, 610 title only, 0 pages not walked, exit 0; per page, /edit/gt-brand?edit=1 0 missing and 510 title only, /deck/gt-brand 0 and 85, /decks 0 and 12, the scratch deck's freeform slide 0 and 3. The title-only controls are the sidebar's slide rows (`ListRow.tsx` `title={item.title}`), the /decks row links and buttons, the two Connect card copy buttons and the report card's download and close buttons; they fail only under `--strict`. The review fix round's run gave the same count, and `docs/editor-depth-evidence/tooltip-audit.txt` is this run's output.

## 6. The export result

PPTX stays the one export target (`docs/pptx.md`), and the primitives joined the native mode:

- Perfect (flatten): the route's export of the preview 7 deck at r13 (85 slides, the inserted
  primitives on `content-rule`) took 221.6 s inside the function and answered `perfect: true`,
  16,283,754 bytes; `turboslide export check` on the menu's Perfect file of preview 5 reads 15.52
  MiB, 446 parts, 85 slides, 885 shapes, 0 out of bounds, 85 titles, 528 relationships checked, 0
  invalid, valid. From the Export menu the same export passed on previews 5, 6 and 8 in 191.6 to
  220.7 s.
- Editable text (native): the route's export of the preview 5 deck took 154 s, 85 pages,
  23,689,578 bytes; `export check` reads 22.59 MiB, 597 parts, 1332 shapes, 0 out of bounds, valid.
  In its slide 53 (`content-rule`) the inserted box is a native `p:sp` with `prstGeom rect` and the
  custom fill `FF6600`, beside 7 native lines; a closed shape travels as `rect`, `roundRect` or
  `ellipse` with its fill and stroke, a line or arrow as a native line with triangle heads, a rule
  as a line, a text primitive as a text box (`docs/freeform.md` section 7). The icon block stays a
  raster like every glyph (SPEC 8.6).
- The checked files and reports are in `docs/editor-depth-evidence/`. The production export after
  the push is the verifier's report (section 12).

## 7. The bundle and connect commands

The Connect card on `/decks` prints these with the deployment's URL filled in; against production
they read:

```
turboslide deck push <deck-id> --to https://turboslide.vercel.app --token <TURBOSLIDE_TOKEN>
turboslide deck pull <deck-id> --from https://turboslide.vercel.app --token <TURBOSLIDE_TOKEN>
turboslide deck pack <deck-id> [--out <file.zip>] [--no-versions]
turboslide deck unpack <file.zip> [--as <id>] [--replace]
```

`--token` is needed once per host; the CLI saves it in `~/.config/turboslide/hosts.json` (mode 0600) and reads it back, and `TURBOSLIDE_TOKEN` in the environment outranks the file. A push over a
function's 4.5 MB body cap is refused with the reason; store the zip on the deck store's Blob host
(`vercel blob put <file.zip>`) and pass `--from-url <blobUrl>`. A pull of a bundle over the cap
follows the route's 302 to a stored copy. Measured against the previews (`cli-transfer.txt`): pull
of an 85 slide deck, 18.36 MiB, in 8 s; push of the fixture deck in 1 s with `/deck/<id>` answering
200 after it; the raw 18 MiB push refused as documented.

## 8. `TURBOSLIDE_TOKEN`

Set on the production and preview environments of the `turboslide` project on 2026-09-11
(`openssl rand -hex 32`, `vercel env add TURBOSLIDE_TOKEN production` and `preview`, both shown as
Encrypted by `vercel env ls`); the same value is in Kevin's `~/.config/turboslide/hosts.json` under
`https://turboslide.vercel.app`; it was never printed and is nowhere in the tree. The production
function reads it from the deploy this push makes; until then the production URL ran open. With it
set: `/api/actions`, `/api/agent` and `/mcp` open to callers that send `Authorization: Bearer
<token>`; `/api/export`, the full-size and JSON variants of `/api/render` and the two bundle routes
require it; the `?w=` thumbnail variant stays open; the editor reaches its export through the
`syncExport` server function and its bundle download and upload through tickets, so the page never
holds the token. Against the built studio with the token set: `/api/decks/gt-brand/bundle` 401
without the header and 200 with it, `POST /api/decks/bundle` 401, `/api/agent` 401 and 200 with the
bearer, `GET /api/export/gt-brand` 401, `/api/render/thesis?w=160` 200 (`docs/hosting.md` section
6). The token gates the agent surface and the raw routes, not the editor's compute; Deployment
Protection remains a project setting Kevin can turn on.

## 9. The preview lines

Eleven previews were deployed in the round; `docs/editor-depth-evidence/README.md` has the
per-preview table with what each tree carried and `smoke-table.md` and `drive.json` the drive of
preview 9 (`turboslide-owb42s633`). The verifier deployed the final tree as
`turboslide-8hol2vfyy` (`vercel deploy --yes --archive=tgz` from the linked repository root,
2026-09-11 21:05 PDT, 41 s build) and probed it:

| Path                                        | Status | ms   | Result | Detail                                                  |
| ------------------------------------------- | ------ | ---- | ------ | ------------------------------------------------------- |
| `/`                                         | 307    | 4672 | pass   | to `/edit/editor-depth-09120307` (a cold instance)      |
| `/deck/gt-brand`                            | 200    | 409  | pass   | 374,609 chars, the head text Turboslide in the SSR page |
| `/edit/gt-brand`                            | 200    | 224  | pass   | 17,235 chars, 3 of 3 shell marks                        |
| `/decks`                                    | 200    | 247  | pass   | 40,993 chars                                            |
| `/decks/gt-brand/assets/cover-fumadocs.png` | 200    | 229  | pass   | image/png, 335,538 B                                    |
| `/api/agent`                                | 401    | 110  | pass   | the bearer rule                                         |

The verifier then ran `node scripts/editor-depth-drive.mjs` against that preview (21:13 PDT;
`docs/editor-depth-evidence/drive-final-preview.md` has the rows, `17-` and `18-` the screenshots):
5 of 19 rows passed and the run was stopped after the tenth row. The head read Turboslide with 85
thumbnail cards (settled in 4.1 s on a cold instance); the template deck `editor-depth-09120413`
was created in 4.7 s with 85 slides; the editor opened `content-rule` at r0; the box insert landed
r0 to r1 in 3.6 s and the shape insert r1 to r2 in 3.8 s; the text insert then waited 120 s for the
server revision and every later row could only time out on the same deck, so the verifier stopped
the drive rather than spend 25 minutes on rows that were already lost. The state of the store
afterwards, read from this machine with the preview environment's Blob token: `deck.json` at
revision 2 (updated 04:13:18 UTC), `slides/content-rule.json`, `leases.json`, 202 assets and one
version record, `versions/1.json`, which carries the shape write (revision 2, base revision 1); the
box write's record is missing. Every function instance that reads the deck answers 500 with
`Vercel Blob: Failed to fetch blob: 403 Forbidden` (`deck.info` three times from three instances,
`/deck/editor-depth-09120413` 500, the thumbnail render 502), while the same `head` and `get`
calls through `@vercel/blob` from this machine with the same token answer 200 for every one of the
deck's 290 blobs and `null` for the missing records, and the other hosted decks (`gt-brand` r31,
`editor-depth-09120307` r19, `editor-depth-09120252` r13, `fixture-p8-193001` r29) read fine on
the same preview. Between 21:22 and 21:29 PDT the 403 cleared: the preview and production both
read the deck at revision 2 afterwards (section 12). The cause is not established (section 10);
the drive of preview 9 had landed all twelve editor writes with the same store code.

A second hosted defect turned up while reproducing: `POST /api/actions/deck.create` on the preview
answered `revision 0` with `dir: /tmp/turboslide/decks/verifier-repro-2113`, the store never
received the deck (`vercel blob ls` lists nothing under its prefix), and the next request answered
404 `unknown_deck`. The page's New deck goes through `createStoredDeck`, which uploads before it
answers; the HTTP surface hands the CLI's `deck.create` the instance's decks folder
(`registerDeckActions` in `apps/studio/src/server/actions.ts`).

What the drives of the round established on the earlier previews (the numbers per preview are in
the evidence README):

- The head reads Turboslide, the list opens in thumbnail density with 85 cards, the shell settles
  in 1.6 to 4.9 s on a cold instance.
- A deck from the GT template: created in 4.6 to 5.2 s on the host, 85 slides, opened in the
  editor.
- Insert box, rectangle shape and text box: one write each (r0 to r3); the freeform switch keeps
  every block where it was drawn (6 of 6 positioned); a drag lands on the left rail and the content
  top (137,377 to 56,96) with 2 guides drawn at the drop point as one write; a corner resize is one
  write; align left of two blocks is one write; the palette token then the custom hex land as two
  writes with the off-palette mark; size 28, weight 700 and center land as three writes with two
  weight-cap marks; a block drags from the left column into the right on a cols slide with 2 drop
  indicators, one write. On preview 9 all twelve editor writes landed (r0 to r13).
- Agent writes: eight `POST /api/actions/block.insert` calls landed r2 to r9 on preview 8 and the
  Blob store lists the eight records (`http-writes.txt`).
- The bundle download and upload cannot be driven from Playwright behind Vercel Authentication
  (the anchor download carries no Trusted Sources header); the CLI pull and push of section 7 prove
  the routes, and `deck-transfer.spec.ts` proves the page's tickets against the built studio.
- `/deck/<id>?present=1` enters present mode on the first slide.

## 10. Blockers

- A fresh hosted deck went dark for a quarter of an hour (section 9): after the drive created
  `editor-depth-09120413` and wrote r1 and r2 within a minute, the third write never landed, the
  store kept `deck.json` at r2 with the box write's record missing, and for 10 to 16 minutes every
  function instance's read of the deck failed with a Blob 403 that this machine could not
  reproduce against the same blobs with the same token; the 403 then cleared on the preview and on
  production alike. The likely suspect is the Blob CDN's state for a freshly created public blob
  overwritten twice, fetched with `useCache: false` from inside Vercel; the function's own log
  line would settle it, and immutable per-revision documents would remove the overwrite. The lost
  record means the deck's history starts at its second write. The store code is the one preview 9
  landed twelve writes on.
- `deck.create` over `POST /api/actions` is instance-local hosted (section 9): the deck lands in
  the function's `/tmp` and never in the store. Route it through `createStoredDeck` as the page
  does; until then an agent creates a deck hosted through the page or `turboslide deck push`.
- The shared Blob store holds every deck the drives created (`editor-depth-09120035`, `-09120057`,
  `-09120131`, `-09120205`, `-09120252`, `-09120307`, `-09120413`, `fixture-pushed-181201`,
  `fixture-p7-190558`, `fixture-p8-193001`, `bundle-round-trip`) and the root route opens the
  newest deck, so production's `/` will open a drive's deck until they are removed; there is no
  `deck.remove` action, so the removal is `vercel blob del` per prefix.
- Vercel Blob's CDN serves an overwritten body for tens of seconds and `list()` lags `head()`. The
  mirror now proves by md5 and derives from the version records, and the editor retries a refused
  write six times, but a fresh instance opening a deck whose records are missing cannot prove the
  base and refuses writes until the CDN catches up. Immutable per-revision snapshots (content
  addressed documents) would remove the dependence on overwritten pathnames.
- The Perfect export of an 85 slide deck takes 190 to 222 s inside the function against the 300 s
  server function limit; it passed on previews 5, 6 and 8 and hit the limit once on preview 7. A
  larger deck or a slower instance fails from the menu while the route still answers. A worker
  service is the fix (`docs/hosting.md` section 8).
- A raw push over 4.5 MB is refused; the stored copy path (`--from-url`) stands in, and a direct
  client upload to the Blob store from the CLI is not built. The stored download copies under
  `bundles/` are never deleted.
- Behind Vercel Authentication the bundle download cannot be driven from Playwright; production
  has no such wall, so the page's download and upload there are Kevin's manual check (section 11).
- `material capture freezes a frame` and `parity mood-earth` time out at their 5 s limit when the
  machine is loaded (twice in this round's runs, passing alone each time); a longer timeout on those
  two tests would make step 5 deterministic under load.
- The hydration mismatch on /decks from the reader's time zone is suppressed, not removed; a UTC
  stamp would remove it.
- Two rows the drive cannot pass behind the preview wall are proven another way (section 9), so
  the drive's table never reads 19 of 19 on a preview.

## 11. What Kevin must do

- Decide whether the drives' test decks leave the store now (`vercel blob del` on their
  `decks/<id>/` prefixes, from the linked root with the store token) or after a `deck.remove`
  action exists; until then `https://turboslide.vercel.app/` opens the newest of them.
- Do not create decks hosted through `POST /api/actions/deck.create` until it uploads (section
  10); the /decks page and `turboslide deck push` do.
- After the production deploy of this push, open `https://turboslide.vercel.app/decks`: confirm
  the head reads Turboslide with the thumbnail cards on `/deck/gt-brand`, create a deck from the GT
  template, insert a box from the Insert menu, switch a slide to freeform and drag it, pick a
  palette color and a custom one, download the deck's bundle from a row and upload it back (the two
  steps the previews could not prove from Playwright), and run one Perfect export from the menu.
- Decide whether the freeform layout, the primitives and the palette and typography fields become
  part of the specification (SPEC 1, 4.3, 6.4 and the block catalog of SPEC 4) or stay the recorded
  deviation, and whether rotation ever comes.
- Decide on Deployment Protection for the production editor: the token gates the agent surface and
  the raw routes, and anyone can open the editor and spend function time on renders through it.
- To push or pull from another machine, run `turboslide deck push <id> --to
https://turboslide.vercel.app --token <value>` once with the value from `vercel env pull` (the
  CLI saves it per host); the value is never printed by the tree.
- Approve or redirect the two next steps the blockers name: immutable per-revision snapshots in
  the Blob store, and a worker service for exports and renders off the function.
- The open questions of the hosting round stand: the repository license and the private overlay
  for `docs/spec/` and the GT deck's photographs (AGENTS.md).

## 12. Production after the push

Commit `3f1be80ed8871e5cba24e718d704a353f7e6ae4c` (`Turboslide editor depth: freeform layout,
primitives, palette and typography, tooltips, deck transfer`, authored as the repo-local identity)
was pushed to `main` at 21:24:31 PDT on 2026-09-11. Vercel created the production deployment
`turboslide-kgu6an9md` at 21:24:35, built it in 41 s, and `https://turboslide.vercel.app` served it
by 21:25:41: the SSR page of `/deck/gt-brand` carried the head text Turboslide twice and 25
`data-tip` attributes where the hosting round's build carried none. (The verifier's first poll
used `grep` on the saved body and counted zero because this machine's `grep` treats the page's
long UTF-8 lines as binary; a byte count with Python found the marker at once.)

`node scripts/hosted-smoke.mjs https://turboslide.vercel.app` at 21:28 PDT
(`docs/editor-depth-evidence/smoke-production.md`):

| Path                                        | Status | ms   | Result | Detail                                                    |
| ------------------------------------------- | ------ | ---- | ------ | --------------------------------------------------------- |
| `/`                                         | 307    | 3505 | pass   | to `/edit/editor-depth-09120413`, the drive's broken deck |
| `/deck/gt-brand`                            | 200    | 275  | pass   | 374,609 chars                                             |
| `/edit/gt-brand`                            | 200    | 100  | pass   | 17,235 chars, 3 of 3 shell marks                          |
| `/decks`                                    | 200    | 279  | pass   | 42,426 chars                                              |
| `/decks/gt-brand/assets/cover-fumadocs.png` | 200    | 190  | pass   | image/png, 335,538 B                                      |
| `/api/agent`                                | 401    | 96   | pass   | the bearer rule; `TURBOSLIDE_TOKEN` is now enforced       |

One synchronous flatten export against production, `POST
/api/export/gt-brand?sync=1&format=json` with the bearer and the body `{ format: pptx, mode:
flatten, theme: [light], fonts: exact, slideIds: [thesis] }`: HTTP 200 in 7.68 s end to end,
`X-Turboslide-Sync: requested`, the summary at revision 31, 1 page, `passed: true`, the report's
`perfect: true`, geometry in bounds, no fonts embedded, `gt-brand-light.pptx` of 45,531 bytes
(sha256 `349dd026…98fa10`), stored in the Blob store under `exports/` (`stored: true`), 6,143 ms
inside the function on `chrome-headless-shell 147.0.7727.0` over SwiftShader, `exec: inprocess`,
verify not requested (it never runs hosted).

Production reads the drive's deck: `deck.info` on `editor-depth-09120413` answers revision 2 with
85 slides and one version record (the shape write), `/deck/editor-depth-09120413` is 200 and
`/deck/gt-brand?present=1` is 200; `/decks` lists 14 decks, the GT deck among twelve the drives
created and one fixture, and `/` opens the newest of them. By 21:29 PDT the preview read the same
deck at revision 2 too, so the Blob 403 of section 9 lasted between 10 and 16 minutes and then
cleared on every instance.
