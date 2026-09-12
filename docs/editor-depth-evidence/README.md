# Editor depth evidence

What the integrator measured on 2026-09-11 and 12 against the preview deploys of the `turboslide`
Vercel project for the editor depth round (Kevin's directives: the sidebar head reads Turboslide
with thumbnails as the default density; drag to move and reorder, a clearer inspector with icons
and tooltips everywhere, reusable primitives with color and typography controls; decks created and
edited in the deployment, the GT template presentation visible; a way to move a deck between a
checkout and the deployment). The drive is `node scripts/editor-depth-drive.mjs <preview>` with the
project's development token in the Trusted Sources header (docs/hosting.md section 7); one
Playwright page at 1440 by 900; every row below comes from its own clock or the route's answer.

## The drive (smoke-table.md, drive.json)

`smoke-table.md` is the last run's table as the script wrote it; `drive.json` its step log with the
deck id, the file URLs and the page errors. The last run is preview 9, `turboslide-owb42s633`, the
final tree. Earlier previews of the round are kept in this README where their numbers differ:

| Preview                  | Tree                                                                        | Result                                                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3 `turboslide-ew8qfqu3y` | builders integrated, sidebar and route fixes                                | 11 of 19 rows; the shape insert, typography and the column drag timed out waiting for the server revision                                                                                     |
| 5 `turboslide-1ki2rb5yu` | thumbnails mount client side, lazy clone pictures, three captures at a time | the same three rows failed; the Perfect export from the menu passed in 220.7 s                                                                                                                |
| 6 `turboslide-p22fmc1l2` | first Blob mirror fix (the listing lag)                                     | the same three rows failed: the cause was the CDN body lag, not the listing                                                                                                                   |
| 7 `turboslide-gt5mkhlc5` | Blob mirror proof by md5 against head, record replay                        | every write landed (shape r1 to r2, typography r9 to r12, column drag r12 to r13); the menu export hit the 300 s server function limit while the route's export of the same deck took 221.6 s |
| 8 `turboslide-oss9puowm` | HTTP actions through the hosted store, opened before the folder check       | see smoke-table.md                                                                                                                                                                            |

Rows that cannot pass behind Vercel Authentication from Playwright and are proven another way:
the bundle download and the upload of the bundle (the anchor click navigates to the Vercel SSO page
because the download request carries no Trusted Sources header; the CLI pull of the same route
answered 18.36 MiB in 8 s, cli-transfer.txt), and the blank deck round trip (the same download).

Row 15 (the blank deck round trip) also failed on the reviewer's run of preview 9 for a second
reason: the script named the deck `Bundle round trip` on every run, and the shared Blob store still
held the deck of an earlier run, so the host answered "decks/bundle-round-trip exists already; pick
another name" (the reviewer's screenshot 15-failed). The script now stamps that name as row 2 does
and races the `.ts-decks-error` locator, so a refusal is reported as the cause instead of a timeout.

## The final preview (the verifier)

The tree of the editor depth commit was deployed as preview 11, `turboslide-8hol2vfyy` (2026-09-11
21:04 PDT). `scripts/hosted-smoke.mjs` answered 6 of 6 (`/` 307 in 4672 ms on a cold instance,
`/deck/gt-brand` 200 with the head text Turboslide in the SSR page, `/edit/gt-brand` 200 with 3 of 3
shell marks, `/decks` 200, the twin 200, `/api/agent` 401). The drive passed 5 of 19 rows and was
stopped after the tenth: the box and shape inserts landed r1 and r2, the text insert waited 120 s
for the server revision, and every read of the deck by the function then failed for 10 to 16 minutes with a Blob
403 that this machine could not reproduce against the same blobs with the same token, before it
cleared on the preview and on production
(`drive-final-preview.md`, `17-final-preview-viewer-turboslide-thumbs-1440x900.jpg`,
`18-final-preview-text-insert-failed-1440x900.jpg`; `docs/EDITOR-DEPTH-STATUS.md` sections 9 and
10 have the store's state and the second defect found on the way, the instance-local
`deck.create` over HTTP). `tooltip-audit.txt` is the verifier's rerun on the built client: 0
missing, 610 title only.

## What the three failing writes were

On previews 3 to 6 every second editor write on the host failed while the same writes passed on
the dev server. Measured against the live Blob store from this machine with two mirrors
(`packages/store/src/blob-store.ts`): after instance A committed r12, instance B's `head()` saw
the new etag but `list()` still carried r11's, and `get()` served r11's body for more than ten
seconds after that; the SDK's `useCache: false` bypasses the CDN only for private stores; the etag
is the md5 of the body. The mirror therefore proves a document by hashing it against `head()`,
derives the current document by replaying the immutable version records through the writer's own
reducer when the body lags, discards a mirror tainted by a failed commit, and refuses to commit a
base it cannot prove (`StaleMirrorError`). `hosted.test.ts` holds the fake's listing and bodies
stale between two instances' writes. The live proof: two fresh mirrors wrote r1 to r7 in turn on
the `fixture-pushed-181201` deck while `get` still answered the r4 body.

A second hosted defect found on the way: the HTTP action route wrote through a plain FileStore on
the instance's overlay, so eight `POST /api/actions/block.insert` calls answered r11 to r18 while
the Blob store stayed at r10 (nothing persisted). `apps/studio/src/server/actions.ts` now opens
the hosted store first; on preview 8 the same eight writes landed r2 to r9 and the store lists the
eight records (http-writes.txt).

## Other files

- `tooltip-audit.txt`, `tooltip-audit.json`: `node scripts/tooltip-audit.mjs --base http://localhost:4455` against the built client (`vite build` then `vite preview`), after the audit learned to wait for the shell instead of network idle (thumbnails keep the network busy): 0 missing on /edit/gt-brand?edit=1, /deck/gt-brand and /decks once the picture asset select and the deck title links carried tooltips. In the review fix round the audit stopped counting a native `title` as coverage: such controls are listed apart as title-only and fail only under `--strict`, and a fourth page walks a scratch deck's freeform slide with a block selected (the move chip, the resize squares and the arrange bar, which now carry the Tooltip primitive instead of titles). The rerun on this machine: 0 missing, 610 title-only (the sidebar's slide rows, `ListRow.tsx title={item.title}`; the /decks row links and buttons; the two ConnectCard copy buttons; the report card's download and close buttons), 0 pages not walked.
- `export-check-perfect-light.txt`: `turboslide export check` on the Perfect file the menu produced on preview 5 (15.52 MiB, 446 parts, 85 slides, 885 shapes, valid); `export-report-perfect-light-route.json`: the route's Perfect export of the preview 7 deck at r13 (221.6 s, `perfect: true`, 16,283,754 bytes).
- `export-check-native-light.txt`, `export-report-native-light.json`: the route's Editable text export of the preview 5 deck (154 s, 85 pages, 23,689,578 bytes; 597 parts, 1332 shapes, valid). In its slide 53 (`content-rule`) the inserted box is a native `p:sp` with `prstGeom rect` and the custom fill `FF6600`, beside 7 native lines.
- `cli-transfer.txt`: `turboslide deck pull` and `deck push` against the previews, with the 4.5 MB raw body refusal for the 18 MiB bundle.
- `http-writes.txt`: the eight HTTP action writes on preview 8 with their request ids.
- The screenshots: `01` the viewer with the head reading Turboslide and the thumbnail cards, `02` the created deck in the editor, `03` the Insert menu (re-shot in the review fix round: the drive had taken it mid fade-in, at opacity 0 to 0.5, so the first `03` showed the menu's text over the stage without its plate; the script now waits for the card's animations to finish, and the committed `03` is the settled menu on `content-rule` of `gt-brand` from a built client on this machine), `04` the primitives on the slide, `05` the freeform layout, `06` the drag with the guides at the drop point, `07` the align, `08` the custom color with its lint mark, `09` typography, `10` the drag across columns with the drop indicator, `11` a tooltip, `12` the export report card when the menu export completed within the function's limit, and the present view; a `failed` screenshot is the page as a step failed.

Not in this folder: the PPTX files (the report URLs serve them) and the dry runs against the dev
server that shaped the script (selectors under thumbnail density, the covered-block selection
through the inspector's block list, the press pause that keeps two presses from reading as a
double click).
