# Hosted status

The state of Turboslide at the end of the hosting round of 2026-09-11: the studio runs on Vercel,
and PPTX is the one export target. Kevin's directive, verbatim:
"https://studio-delta-six-40.vercel.app/ shows something went wrong; also instead of exporting to
google slides just make it perfect pptx."

Five builders worked the round (the diagnosis, the hosted store, the serverless Chromium and the
synchronous export, the PPTX exporter and the Slides removal, the integration with the preview
deploys), and this document is the verifier's record: what changed, the measured numbers, the
acceptance run on the tree this commit carries, the blockers and what Kevin must do. The
reference documents are `docs/hosting-diagnosis.md` (the cause, measured before any code changed),
`docs/hosting.md` (the store), `docs/hosting-chromium.md` (renders and exports inside the
function), `docs/pptx.md` (the export) and `docs/hosted-evidence/README.md` (the preview drives
with their files). Every number below comes from this machine (Node 24.13.0, pnpm 11.15.1, Chrome
for Testing 147.0.7727.15 on ANGLE Metal, Apple M5 Max, the Prototemplate checkout present) or from
a preview deployment of the `turboslide` Vercel project, and the sentence says which.

## 1. What went wrong, and what changed

The production function had no checkout above it, no `decks/` folder and a read-only filesystem
apart from `/tmp`, so `repoRoot()` fell back to `/var/task`, `listDecks()` found nothing, the root
route's create-from-template read a `template.json` that was not in the bundle and threw, and the
router rendered its default error view with status 500; `/deck/gt-brand` missed for the same
reason (`docs/hosting-diagnosis.md` section 3, reproduced on the built bundle with the same stack).
Renders and exports would have failed next: the bundle carried no browser and the worker spawned a
CLI binary that was not there (section 4).

| Area              | Change                                                                                                                                                                                                                                                                                                                   | Reference                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Store selection   | `@turboslide/store/select` picks `file`, `tmp` or `blob` once per process from the environment; `apps/studio/src/server/root.ts` answers every path from that choice                                                                                                                                                     | `docs/hosting.md` section 1, section 2 below                  |
| The seed          | `decks/templates` and `decks/gt-brand` travel in the function as Nitro server assets (`vite.deploy.config.ts`), materialized into the overlay on first use; the GT twins are also static files on the CDN; the renderer's and exporter's runtime files (`packages` group, 24 files, 6,250,989 bytes) travel the same way | `docs/hosting.md` section 2                                   |
| Blob backend      | `BlobStore` mirrors one Vercel Blob store per deck with `ifMatch` on `deck.json` as the commit point; the seed is uploaded once; twins answer from the overlay or 302 to their Blob URL                                                                                                                                  | `docs/hosting.md` section 4, section 3 below                  |
| Chromium          | `@sparticuz/chromium` 147.0.2 (`chrome-headless-shell` 147.0.7727.0) as the fourth executable source, selected inside a function; the single-process shell's close guard and deadlines                                                                                                                                   | `docs/hosting-chromium.md` sections 2 and 3b, section 4 below |
| In-process worker | The render worker's local mode runs `runCli()` in the function's process instead of spawning a binary                                                                                                                                                                                                                    | `docs/hosting-chromium.md` section 3                          |
| Sync export       | `POST /api/export/:deckId` runs to completion inside the request and answers the file, the report or a 302 to the stored copy; hosted, every POST is synchronous                                                                                                                                                         | `docs/hosting-chromium.md` section 4, section 5 below         |
| Function config   | `maxDuration: 300` on the base function; `/api/export/**`, `/api/render/**` and `/_serverFn/**` at `maxDuration: 800`, `memory: 3009`; `traceDeps` for the browser package; `.vercelignore` at the root for CLI previews                                                                                                 | `docs/hosting.md` section 6                                   |
| PPTX              | The page raster policy (1-bit, palette, JPEG or truecolor per page, each decoded and diffed against its shot), `perfect` as a measured flag, slide names and hidden titles, the OOXML clean and the package validation, no fonts embedded by default, `turboslide export check`, the QuickLook smoke check               | `docs/pptx.md`, section 6 below                               |
| Google Slides     | The exporter, its `gslides` format, the dry run, the Slides image host route, `calibration/slides.json`, `googleapis` and `docs/google-slides.md` are removed; MILESTONES M6 item 1 is closed as withdrawn                                                                                                               | section 7 below                                               |
| The root route    | `/` redirects to `/edit/<newest deck>` with a 307 and, when the store fails, renders the failure with a link to `/decks` instead of the router's blank error view                                                                                                                                                        | `apps/studio/src/routes/index.tsx`                            |
| Verification      | `scripts/hosted-smoke.mjs <url>` probes the six pages of a deployment and exits 1 on a failure; the preview drives are recorded with their files                                                                                                                                                                         | `docs/hosting.md` section 7, `docs/hosted-evidence/README.md` |

## 2. The store selection

`selectStore(env)` (`packages/store/src/select.ts`) is the one decision, tested in
`select.test.ts` (9 tests): `TURBOSLIDE_STORE=file|tmp|blob` wins; else `VERCEL` set selects
`blob` when `BLOB_READ_WRITE_TOKEN` is set and `tmp` otherwise; else `file`, the checkout's
`decks/` folder. `blob` without a token and an unknown word are TypeErrors at the first request.
The deck list names the store and its reason in its footer, and the editor shows the banner
"Edits are kept on this server instance only and do not persist until a Blob store is connected"
over the `tmp` overlay (`NOT_PERSISTENT_NOTICE`). Every backend hands out `DeckStore` instances,
so `applyWrite`, leases and the version log are unchanged (SPEC 7.1, 6.7); the collection behind
them (`@turboslide/store/hosted` `HostedDecks`) serves the list, `deck.create`, the store of a
deck and the twins through the same calls whatever the kind. The store package's tests
(`select`, `seed`, `hosted`: 35 tests) run the `DeckStore` contract over `FileStore` and over
`BlobStore` with the in-memory fake, two instances standing in for two functions, the Blob races
and the seed uploaded once.

## 3. The Blob step

The integrator connected one store on 2026-09-11: `turboslide-decks` (`store_GGmYcVj7j6224Ay5`,
region `iad1`, public access) to the `turboslide` project for production, preview and
development, which set `BLOB_READ_WRITE_TOKEN` on the three environments (`vercel blob
create-store turboslide-decks --access public --region iad1 --yes` from the linked root;
`docs/hosting.md` section 5). The first request of the next preview uploaded the seed
(`decks/gt-brand/`, 183 documents and 202 twins) in 6.8 s. Two facts of the live service that the
fake did not have were fixed on the previews: the SDK's error classes are anonymous (the client
checks `instanceof` with the message as the fallback), and `get({ useCache: false })` answers a
weak validator where `ifMatch` needs the strong etag (the client strips `W/`). Measured before
those fixes: every page 500 on "The requested blob does not exist", then every editor commit
refused as changed in the store.

The store's copy of the GT deck is at revision 31 (`deck.json` read from the public store URL on
2026-09-11 at 22:14 UTC, `updatedAt` 2026-09-11T21:06:10.943Z); the repository's copy is revision 24. The seven revisions are the preview drives' writes (an inspector write on `thesis` and the
drives that followed; the `thesis` slide in the store carries no title override today). The store
seeds once and then owns the deck, so a change to `decks/gt-brand` in the repository does not
reach the hosted deck until the store's copy is removed (section 10).

## 4. The Chromium path

Inside a function `resolveExecutable(env)` selects `sparticuz` when `TURBOSLIDE_CHROME` is unset,
the `chromium-1217` build is absent and playwright-core's browser is not on disk
(`docs/hosting-chromium.md` section 2, tested in `launch.test.ts`). `prepareExecutable()` inflates
`/tmp/chromium` (196,676,728 bytes) with SwiftShader and the package's fonts, merges the package's
switches minus the four groups the switch table drops, and forces the SwiftShader backend. The
renderer string of every hosted record is `chrome-headless-shell 147.0.7727.0, SwiftShader,
Google`, so a record from the function is never mistaken for one from the gate (SPEC 4.2). The
single-process shell dies when a context is closed, so the probe context stays open, no sheet
context is closed on that source, `newContext` and `newPage` carry a 60 s deadline, the browser is
killed by pid, core files are disabled and swept before every job. Measured on the previews: the
inflate 2.4 to 2.7 s on a cold instance, the launch 50 to 67 ms, a 320 px thumbnail 7.2 to 9.0 s
cold and 239 to 385 ms from the cache, a warm render of another slide 1.6 to 2.2 s, 270 MB of the
function's 525 MB `/tmp` free after a render. The deviations from SPEC 5.3 (the headless shell)
and SPEC 3.3 item 7 (the browser in the web app's process) are recorded in `AGENTS.md` and are not
approved beyond the directive to make the deployment work.

## 5. The sync export

`POST /api/export/:deckId` inside a function runs `runSyncExport` (`apps/studio/src/server/export-sync.ts`)
to completion within the request: the job through the local queue in process, every produced file
read back with its sha256, one stored zip when two themes are exported, the report in
`X-Turboslide-Export-Report`, `X-Turboslide-Sync: hosted` (or `requested` with `?sync=1`),
`X-Turboslide-Exec: inprocess`. `?format=json` (or `Accept: application/json`) answers the report
and the file list; on the blob backend the files are also stored under `exports/<deckId>/<job>/`
and a file over the 4.5 MB response cap answers 302 to that copy. Verify never runs there (no
LibreOffice); the report's residual says so and `verify` is `not-requested` or `skipped`. The
editor's Export menu posts the same route with `?sync=1&format=json` when `capabilities.sync` is
set and downloads the stored copy. The budget is 780 s under the route's 800 s function.

Measured on the previews of 2026-09-11 (`docs/hosting.md` section 7, `docs/hosted-evidence/`):

| Request                                                                         | Result                                                                                                                                                           |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| flatten, light, 85 pages, `?sync=1`                                             | 302 to the stored copy after 187.9, 199.8 and 203.1 s; 16,271,404 to 16,278,003 bytes (15.52 MiB); `perfect: true`, worst decoded mismatch 0.003 percent         |
| the same from the editor's Export menu                                          | 200 after 184.8 s, the report card `Passed in 179.4 s`, perfect, the download of the stored copy; one earlier attempt hit the 780 s limit (502) and is recorded  |
| native (Editable text), light, 85 pages                                         | 200 after 127.4 s, 23,689,436 bytes (22.59 MiB), `passed: true`, geometry in bounds, 242 native text blocks and 70 raster blocks                                 |
| native, dark, 85 pages                                                          | 200 after 125.4 s, 24,847,042 bytes (23.70 MiB), the same counts                                                                                                 |
| one native slide (`thesis`), then with `rasterScale: 3`                         | 200 in 6.5 s cold and 1.8 s warm (17,879 bytes each); before the fix round every native export answered 502 after the slides had measured (the 3x context close) |
| one flatten slide (`thesis`, light) on the final preview `turboslide-8ueqvr3ej` | 200 in 7.46 s cold (the job 5,854 ms), 45,532 bytes, `perfect: true`, `passed: true`, revision 31, stored on Blob, `X-Turboslide-Sync: hosted`                   |
| the files reopen                                                                | python-pptx 85 slides (774 shapes flatten, 1085 native); `turboslide export check` valid on all three whole-deck files                                           |

## 6. Perfect PPTX

`docs/pptx.md` is the definition. Perfect (`--mode flatten`, the default and the menu's first
option) writes every page as the 2x sheet screenshot of the rendered slide (3200 by 1800) over
the slide's text as invisible runs, so the page is pixel identical to the web render in every
viewer that draws pictures and the text stays searchable. The screenshot travels in the smallest
encoding the raster policy accepts (a 1-bit PNG for two-color pages, an 8-bit palette PNG within
1 percent, a JPEG at quality 92 with 4:4:4 chroma for photographic pages within 0.5 percent and
only when smaller, else truecolor), and the exporter decodes that encoding again and diffs it
against the shot before the file is written. `ExportReport.perfect` is true when every page
decodes within 0.1 percent of its shot at pixelmatch threshold 0.1 and the package validated;
`--verify` measures the rendered file against the web render through LibreOffice in the worker
image (the M2 gate at 0.1 percent per page). No fonts are embedded in the flatten file; the native
file embeds them only under `--embed-fonts`. Every slide is named after its title and carries a
hidden title placeholder; `kern="0"`, empty `extLst` and the content type overrides for missing
parts are stripped; the package is validated against its content types and relationships. Editable
text (`--mode native`) keeps the M5 gate: layout within 3 px horizontally and 1 px vertically on
every one of the 624 gated blocks.

Measured on `decks/gt-brand` at revision 24, 85 slides, 2026-09-11 (`docs/pptx.md` "Measured on
the deck"):

| Where                                                                          | Mode    | Theme | File                  | Bytes                      | Pages and encodings             | Decoded mismatch (perfect)                                            | LibreOffice verify                                                                                        | Time                                             |
| ------------------------------------------------------------------------------ | ------- | ----- | --------------------- | -------------------------- | ------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| this machine (Chrome for Testing 147.0.7727.15)                                | flatten | light | `gt-brand-light.pptx` | 15.68 MiB (40.75 at M2)    | 85: 83 palette PNG, 2 JPEG      | `perfect: true`; worst 0.003 percent (`horizon`, 194 of 5,760,000 px) | not run (no `soffice` here)                                                                               | 180.9 s for both themes                          |
| this machine                                                                   | flatten | dark  | `gt-brand-dark.pptx`  | 15.85 MiB (42.42 at M2)    | 85: 83 palette PNG, 2 JPEG      | `perfect: true`; 136 of the 170 pages at exactly 0                    | not run                                                                                                   | (the same run); `gt-brand-both.zip` 31.53 MiB    |
| the worker image (`cee157aeb63d`, Chromium 147.0.7727.0, LibreOffice 25.2.3.2) | flatten | light | `gt-brand-light.pptx` | 15.36 MiB                  | 85: 83 palette PNG, 2 JPEG      | `perfect: true`                                                       | `passed: true`; worst page `opener-developer-experience` 0.049 percent (a JPEG page; the gate is 0.1)     | 1428.9 s for both themes and three verify passes |
| the worker image                                                               | flatten | dark  | `gt-brand-dark.pptx`  | 15.52 MiB                  | 85: 83 palette PNG, 2 JPEG      | `perfect: true`; worst decoded 0.010 percent; 139 of 170 at 0         | `passed: true`; 133 of 170 pages at exactly 0; the 30 regenerated two-tone pictures at most 0.055 percent | (the same run); `gt-brand-both.zip` 30.88 MiB    |
| the worker image                                                               | native  | light | `gt-brand-light.pptx` | 22.51 MiB (28.05 MB at M5) | 85; 1329 shapes                 | `perfect: false` as designed                                          | `passed: true`; 624 gated blocks within budget (`dx` 0 on 590, `dy` 0 on 362, `dw` 0 on 422)              | 481.4 s for both themes                          |
| the worker image                                                               | native  | dark  | `gt-brand-dark.pptx`  | 23.61 MiB (29.21 MB at M5) | 85; 1329 shapes                 | `perfect: false` as designed                                          | `passed: true`; worst page fraction 1.213 percent (`inspirations`, informational in this mode)            | (the same run)                                   |
| the Vercel function (`chrome-headless-shell` 147.0.7727.0)                     | flatten | light | `gt-brand-light.pptx` | 16,271,404 to 16,278,003   | 85: 83 palette PNG, 2 JPEG      | `perfect: true`; worst 0.003 percent                                  | not available in the function (`verify: not-requested`)                                                   | 187.9 to 203.1 s                                 |
| the Vercel function                                                            | native  | light | `gt-brand-light.pptx` | 23,689,436                 | 85; 242 text blocks, 70 rasters | `perfect: false` as designed                                          | not available                                                                                             | 127.4 s                                          |
| the Vercel function                                                            | native  | dark  | `gt-brand-dark.pptx`  | 24,847,042                 | 85; 242 text blocks, 70 rasters | `perfect: false` as designed                                          | not available                                                                                             | 125.4 s                                          |

The hosted flatten file is 3.6 to 3.8 percent larger than this machine's because the two browsers
antialias differently (`--font-render-hinting=none` is kept from the package's switch list) and
the palette quantizer sees other pixels; both are pixel identical to what their own browser
painted, and the LibreOffice gate stays on this machine and in the worker image
(`docs/hosting-chromium.md` section 8). `turboslide export check` on the hosted light flatten
file: valid, 446 parts, 528 relationships, 883 shapes in bounds, 2 JPEG, 83 palette PNG and 1
truecolor PNG media (15.22 MiB), 85 titles, 0 `custGeom`, 0 `normAutofit`, 0 `kern="0"`,
python-pptx 85 slides and 774 shapes (`docs/hosted-evidence/export-check.txt`).

## 7. The Google Slides removal

Kevin's direction of 2026-09-11 closed SPEC 8.3 and MILESTONES M6 item 1 as withdrawn. Removed:
`packages/export/src/gslides/` (auth, build, calibration, client, ids, images, notes, pace,
requests, schema, thumbs, units, the fixtures and five test files), `calibration/slides.json`, the
`gslides` value of the `export.run` format enum (`packages/schema/src/actions.ts`, `export.ts`),
the CLI and MCP commands, the worker job's branch, the Export menu's Slides and Dry run entries
with `SetupCard`, the Slides image host route `apps/studio/src/routes/api/assets.$token.ts`,
`googleapis` from the catalog and `packages/export/package.json`, `docs/google-slides.md`, and the
Slides cases of `apps/studio/e2e/landing.spec.ts`. `pnpm generate:contracts` rewrote the five
JSON contracts, the two llms guides and the four skill references; the coverage and skills tests
pass. `docs/M2-STATUS.md` and `docs/M4-M5-STATUS.md` keep their Slides lines as history with a
note at the top. `TURBOSLIDE_GOOGLE_CREDENTIALS` is no longer read anywhere.

## 8. Acceptance

### `pnpm check`

Run on 2026-09-11 from 15:14:32 local time on the uncommitted hosting tree. Step 3 failed as
written after 1.3 s because its `git diff --exit-code` compares the generated files with the
committed copies, and the round's regenerated copies were not yet committed; the regeneration was
verified by hand (every generated file copied aside, `pnpm generate:contracts`, `diff -r`: no
difference, 15:15:50), the run continued with `node scripts/check.mjs --from 4` (15:15:51 to
15:20:36, exit 0), and step 3 was run alone once more after the paths were staged (section 9).
Step time 271.9 s over the 19 steps.

| Step | Command                                              | Result                                                                                                                                                                                                                                          |
| ---- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `pnpm install --frozen-lockfile`                     | ok in 0.4 s, 30 workspace projects, already up to date                                                                                                                                                                                          |
| 2    | `tsr generate`                                       | ok in 0.8 s                                                                                                                                                                                                                                     |
| 3    | contracts generated and diffed                       | as written: exit 1 after 1.3 s on the uncommitted tree (above); by hand: every generated file identical after regeneration; alone after staging: see section 9                                                                                  |
| 4    | `tsc -b`                                             | ok in 4.5 s, 0 errors                                                                                                                                                                                                                           |
| 5    | `pnpm test`                                          | ok in 29.2 s: 104 files, 972 tests passed, 3 skipped (98 files and 948 tests at M5; the store's 35 hosted tests, the export's raster, check, titles and QuickLook tests, the CLI's export tests, the headless launch and extract tests are new) |
| 6    | `pnpm build` and the client bundle check             | ok in 6.0 s; the marker in 0 of 22 client files and 1 of 55 server files                                                                                                                                                                        |
| 7    | import the Prototemplate deck into `gt-brand`        | ok in 1.4 s; the revision stays 24                                                                                                                                                                                                              |
| 8    | `htmlBlocks === 0`                                   | ok                                                                                                                                                                                                                                              |
| 9    | `validate decks/gt-brand`                            | ok in 1.5 s, 85 slides, 0 errors, 46 warnings (the `ext` data kept at `/ext`, SPEC 4.1)                                                                                                                                                         |
| 10   | `render all` both themes at 1x                       | ok in 27.7 s, 170 records                                                                                                                                                                                                                       |
| 11   | 170 records, 0 page errors                           | ok                                                                                                                                                                                                                                              |
| 12   | `compare-to-shoot` at 0.5 percent, every slide       | ok in 60.8 s (the reference shot in 54.8 s): 170 pairs, 170 compared, 0 over budget, worst 0.408 percent, mean 0.016 percent                                                                                                                    |
| 13   | `sheet all`                                          | ok in 6.5 s                                                                                                                                                                                                                                     |
| 14   | sheets exist with 85 cells                           | ok                                                                                                                                                                                                                                              |
| 15   | `lint all --json`                                    | ok in 13.9 s: 187 findings, 0 at severity 3, 88 at 2, 99 at 1 (unchanged from M5)                                                                                                                                                               |
| 16   | `build --budget 16`                                  | ok in 4.6 s: `brand-deck.html` 14.53 MiB of the 16 MiB budget, 85 slides, revision 24                                                                                                                                                           |
| 17   | `viewer.spec.ts` on the dev server                   | ok in 19.3 s, 6 passed (18.2 s in Playwright; the runner started and stopped the server)                                                                                                                                                        |
| 18   | `lint --chrome` at 1440, 1280 and 390 in both themes | ok in 77.0 s: `/deck/gt-brand` and `/edit/gt-brand` 24 audits each, 0 with findings, 0 states unapplied                                                                                                                                         |
| 19   | `pnpm format:check`                                  | ok in 18.1 s                                                                                                                                                                                                                                    |

### The hosted lines

| Line                                                                                     | Result | Numbers                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a preview deploy of this tree (`vercel deploy --yes --archive=tgz` from the linked root) | pass   | `turboslide-8ueqvr3ej-kl01s-projects.vercel.app`, 15:15:53 to 15:16:39 (46 s: 26.4 MB uploaded, 1211 files, `Build Completed in /vercel/output [21s]` on a 4 core, 8 GB `iad1` machine, 21 traced dependencies in 112 files); `.gitignore` unchanged, no `.env.local` left behind                                                                                |
| `node scripts/hosted-smoke.mjs <preview>` with the development OIDC token                | pass   | 6 of 6: `/` 307 to `/edit/gt-brand` in 1,855 ms (cold), `/deck/gt-brand` 200 in 564 ms (358,146 chars), `/edit/gt-brand` 200 in 217 ms (15,504 chars, 3 of 3 shell marks), `/decks` 200 in 155 ms, `cover-fumadocs.png` 200 image/png 335,538 B in 253 ms, `/api/agent` 401 in 114 ms                                                                            |
| one flatten slide exported synchronously on that preview                                 | pass   | `POST /api/export/gt-brand` (`thesis`, light, `Accept: application/json`): 200 in 7.46 s cold, `X-Turboslide-Sync: hosted`, `X-Turboslide-Exec: inprocess`, 45,532 bytes, `perfect: true`, `passed: true`, revision 31, stored on Blob, renderer `chrome-headless-shell 147.0.7727.0, SwiftShader, Google`                                                       |
| `/llms.txt` and `/openapi.json` on that preview                                          | open   | 200 with the placeholder stubs (302 and 236 bytes; the committed files are 6,417 and 433,636 bytes): `server/contracts.ts` still reads `repoRoot()`, which is the overlay hosted (`docs/hosting.md` section 8)                                                                                                                                                   |
| the earlier preview drives (the integrator, the same day)                                | pass   | the 17 rows of `docs/hosted-evidence/README.md`: the editor write surviving a reload on another instance (r27 to r28), the thumbnails, the whole-deck exports in both modes and both themes, the files reopening, `/tmp` free after two exports                                                                                                                  |
| the store, seed and hosted unit tests                                                    | pass   | inside step 5: `select.test.ts` 9, `seed.test.ts` 8, `hosted.test.ts` 18                                                                                                                                                                                                                                                                                         |
| the export unit tests with Chrome for Testing                                            | pass   | inside step 5: `export-pptx.test.ts` (both modes, four slides, both themes: the perfect flag, the page formats, no font parts, names and titles through the XML and python-pptx, the validation), `page-raster.test.ts`, `check.test.ts`, `post-process.test.ts`, `quicklook.test.ts`, `extract.test.ts` (the 3x context stays open on a single-process browser) |
| the whole-deck PPTX gates with LibreOffice                                               | pass   | in the worker image, 2026-09-11, before this run (section 6): flatten `perfect` and `passed` in both themes, native 624 of 624 blocks within budget; not repeated here (the image was not rebuilt from this exact tree; the export code did not change after that run)                                                                                           |

### The production URL

Measured on 2026-09-11 at 22:14 UTC, before the push:

| URL                                             | Answer                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://studio-delta-six-40.vercel.app/`       | 404 `DEPLOYMENT_NOT_FOUND` (107 bytes) on every path; the name is no longer a domain of the project (`GET /v9/projects/<id>/domains` lists `turboslide.vercel.app` alone) |
| `https://turboslide.vercel.app/`                | the old production build (`studio-nbk6mxk7u`, 12 hours old): 500 on `/`, 404 on `/deck/gt-brand`, the state of the diagnosis                                              |
| `https://turboslide-kl01s-projects.vercel.app/` | 404 `DEPLOYMENT_NOT_FOUND`: no production deployment has run under the project's new name yet                                                                             |
| `https://studio-kl01s-projects.vercel.app/`     | 302 to Vercel SSO: an alias of the old deployment that kept the old name                                                                                                  |

The project Kevin imported (`prj_sWt52OAxiFaboav50hepmtl7Ct74`, root directory `apps/studio`,
Git link `Kevin-Liu-01/Turboslide`, production branch `main`) was named `studio` in the
diagnosis and is named `turboslide` now; `vercel projects ls` still prints
`https://studio-delta-six-40.vercel.app` as its latest production URL, from the deployment record
of the old build. The push of this commit to `main` builds the production deployment under the
new name and assigns `turboslide.vercel.app`, `turboslide-kl01s-projects.vercel.app` and
`turboslide-git-main-kl01s-projects.vercel.app` to it. The verifier polls those and the
directive's URL after the push and runs `scripts/hosted-smoke.mjs` plus one synchronous export
against whichever serves the new build; those numbers are in the round's report, since this
document is committed before the deployment exists.

## 9. The commit

The tree is committed by explicit path lists after `git status --short` (never `.github`,
`.turboslide`, `.vercel`, `dist`, `target`, `node_modules`, logs or build outputs; the evidence
screenshots under `docs/hosted-evidence/` follow the precedent of the M2 to M5 evidence folders),
step 3 of `pnpm check` is run alone after the staging so `git diff --exit-code` compares the
generator's output with the staged copies, and step 19 is run alone after the documents of this
round were formatted. `.github/` stays untracked and unpushed, as in every round.

## 10. Blockers

- Verify never runs in the function: there is no LibreOffice, so a hosted export's `perfect` is
  the decoded-raster measurement and the package validation, and the LibreOffice gate holds on
  this machine and in the worker image only. The report's residual says so per file.
- The browser in the function is `chrome-headless-shell` in the web app's process, two recorded
  deviations from SPEC 5.3 and 3.3 item 7 that Kevin has not approved beyond the directive; a
  container service for the worker is the alternative and is unverified.
- `/openapi.json`, `/llms.txt` and `/llms-full.txt` serve the placeholder stubs hosted (the table
  above); bundling the generated files as imports fixes it.
- The agent surface's writes (`/api/actions`, `/mcp`, the server-side window actions) open
  `FileStore` over the deck folder directly (`apps/studio/src/server/actions.ts` `storeFor`,
  `lint.ts`, `render.ts`); on the tmp backend that is the overlay the editor writes, so they work,
  and on the blob backend their writes land in this instance's mirror and are not pushed. The
  agent routes answer 401 without `TURBOSLIDE_TOKEN`, so no agent write reaches the hosted deck
  today. Asset uploads on blob are not pushed either (`docs/hosting.md` section 8).
- `TURBOSLIDE_TOKEN` is unset, so `/api/export` and `/api/render` are open on the production URL
  (an anonymous caller can spend up to 800 s of function time per export); the editor's page
  reaches both routes without a header, so setting the token alone would break the editor's
  export until `edit.$deckId.tsx` switches to the `syncExport` server function
  (`docs/hosting.md` section 6, options 1 to 3).
- One Chromium job at a time per instance: an export started while the sidebar's thumbnails are
  still rendering waits behind them (measured 183.6 s for a thumbnail queued behind an export).
- The hosted deck is at revision 31 with the drives' writes, seven past the repository's 24.
- The whole-deck native export in both themes is 46 MiB and never fits the 4.5 MB response cap;
  it works on the blob backend through the stored copies and answers 413 on the tmp backend.
- Fallback faces under `VERCEL` are Open Sans only, so the language specimen's other scripts
  render as missing glyph boxes hosted.
- The PowerPoint manual pass (`docs/export-verification.md`, `docs/pptx.md` "PowerPoint notes") has
  not run on this round's files: PowerPoint does not run here.
- `vercel link --yes --project studio` created a stray empty project named `studio`
  (`prj_g7MnEbMtpUvd4dBoCAGfSC0fiUfK`, root directory `.`, no deployments).

## 11. What Kevin must do

1. Decide the production name. `turboslide.vercel.app` is the project's domain and receives the
   deploy from `main`; `studio-delta-six-40.vercel.app` answers `DEPLOYMENT_NOT_FOUND` since the
   project was renamed. To keep the old name, add it to the project (Settings, Domains, Add; or
   `vercel domains add studio-delta-six-40.vercel.app turboslide --scope kl01s-projects`); whether
   an auto-generated `.vercel.app` name can be claimed again is unverified.
2. Decide the bearer token (`docs/hosting.md` section 6): leave the routes open with the open
   editor (what runs), set `TURBOSLIDE_TOKEN` and switch the editor's export to the server
   function, or put the deployment behind Vercel Deployment Protection.
3. Decide the hosted deck's copy. To reset it to the repository's revision 24: remove the
   `decks/gt-brand/` prefix from the `turboslide-decks` store (`vercel blob list --prefix
decks/gt-brand/` then `vercel blob del <urls>`, or the dashboard) and load any page; the next
   instance re-uploads the seed. To keep it, nothing.
4. Open `gt-brand-light.pptx` from a hosted export in PowerPoint and walk the checklist (the
   repair dialog must not appear, the selection pane lists the hidden titles, the outline shows
   them, the JPEG pages read at 100 percent).
5. Delete the stray `studio` project if it is not wanted (`vercel project rm studio`).
6. Approve or refuse the two recorded Chromium deviations (section 4); refusing means a worker
   service for renders and exports.
7. Keep `.env.local` and the `.vercel/` folders out of the tree (both are ignored; the CLI writes
   them on `link` and `env pull`).
