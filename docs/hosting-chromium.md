# Hosting Chromium: renders and exports inside the function

How a render or a PPTX export runs inside a Vercel function, measured on 2026-09-11 for the hosting
round (`docs/hosting-diagnosis.md` sections 4 and 5 name the two facts this closes: the function
has no browser and the worker spawned a CLI binary the bundle does not carry). Two recorded
deviations from the specification come with it, both stated in the code and in every record they
touch: the browser is `chrome-headless-shell`, not Chrome for Testing (SPEC 5.3), and inside the
function it runs in the web app's process (SPEC 3.3 item 7). Every number below was measured on
this machine or in the Linux x64 container of section 7; nothing was deployed.

## 1. What changed

| Path                                                      | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/headless/src/launch.ts`                         | A fourth `ExecutableSource`, `sparticuz`; `resolveExecutable` stays synchronous and gains a test seam; `prepareExecutable` (async) loads `@sparticuz/chromium`, inflates the binary and merges its switches; `rendererString` takes the product name; `LaunchedBrowser.product`                                                                                                                                                                                                             |
| `packages/headless/src/launch.test.ts`                    | The selection order, the switch merge and the renderer string for the new source (9 tests, `TURBOSLIDE_SKIP_BROWSER_TESTS=1 node_modules/.bin/vitest run packages/headless/src/launch.test.ts`)                                                                                                                                                                                                                                                                                             |
| `packages/headless/src/context.ts`                        | `SheetScale` (1, 2 or 3) with `SheetPageOptions<S>` and `SheetPage<S>` generic over the scale, so `record.ts` keeps the record scales and the export's 3x page reports 3; every sheet page a job opens comes from `openSheetPage`, which is where the single-process close guard and the `CONTEXT_TIMEOUT_MS` deadlines live (section 3b, the native export fix)                                                                                                                            |
| `packages/headless/src/launch.ts` (fix round)             | `markSingleProcessBrowser`, what `launchBrowser` calls for the sparticuz source, exported as the test seam of the close guard                                                                                                                                                                                                                                                                                                                                                               |
| `packages/export/src/scene/extract.ts`, `extract.test.ts` | The raw 3x `openShotPage` (`browser.newContext({ deviceScaleFactor: 3 })` closed with `context.close()`) is gone; the 2x and 3x shot pages are `openSheetPage` calls and `raster.scale` is the page's own scale; `ExtractOptions.browser` takes a launched browser the caller owns. The test runs one native slide against a Chrome for Testing browser flagged with `markSingleProcessBrowser` and asserts the 1x, 2x and 3x contexts stay open, and that an unflagged browser closes them |
| `packages/headless/package.json`, `pnpm-workspace.yaml`   | `@sparticuz/chromium` as an optional dependency at catalog version `147.0.2`; the lockfile is the integrator's `pnpm install`                                                                                                                                                                                                                                                                                                                                                               |
| `apps/render-worker/src/cli.ts`                           | `execMode`: `spawn` (the binary as a child process, unchanged) or `inprocess` (`runCli()` from `@turboslide/cli/cli` with both streams captured, the same `CliRun` shape); `TURBOSLIDE_WORKER_EXEC` forces one; the default is in-process inside a function or when the CLI package cannot be resolved                                                                                                                                                                                      |
| `apps/render-worker/src/queue.ts`                         | `run(kind, input, runner, timeoutMs)`: submit and wait in one call                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `apps/render-worker/src/client.ts`                        | `runJob`, `readJobFile`, `exec` on both clients; inside a function with no `TURBOSLIDE_WORKER_DIR` the work directory is `<tmpdir>/turboslide-worker`                                                                                                                                                                                                                                                                                                                                       |
| `apps/render-worker/src/jobs/export.ts`                   | `slideIds` (export.run's subset, as CLI positionals); verify runs only when `soffice` answers, otherwise the report's residual carries `verify: unavailable in this environment` and the flatten note; the result records `verify: ran, skipped, not-requested` and `exec`                                                                                                                                                                                                                  |
| `apps/studio/src/server/export-sync.ts`                   | `runSyncExport`: the job to completion, the files read back with sha256, one stored zip for two themes (`zipStored` over `node:zlib` crc32), the header summary, the JSON body                                                                                                                                                                                                                                                                                                              |
| `apps/studio/src/routes/api/export.$deckId.ts`            | `POST ?sync=1` (or `"sync": true`) answers the file; `?format=json` the report; 413 with the JSON body when the file cannot leave a function; hosted, every POST is synchronous (`X-Turboslide-Sync: hosted`) and the async job path stays for a checkout and the Docker worker                                                                                                                                                                                                             |
| `apps/studio/src/routes/api/render.$slideId.ts`           | The docblock and `X-Turboslide-Exec` (`exec` in the JSON variant); the render itself already went through `launchBrowser`                                                                                                                                                                                                                                                                                                                                                                   |
| `docker/Dockerfile.test`, `docker/chromium-test.mjs`      | The Linux x64 measurement of section 7                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## 2. The serverless binary

`@sparticuz/chromium` `147.0.2` (published 2026-04-20; `npm view` on 2026-09-11: 16 files,
68,409,349 bytes unpacked, `engines.node >=22.17.0`, one dependency `tar-fs ^3.1.2`, ESM entry
`build/esm/index.mjs`). The package was unpacked into the session scratchpad and read; nothing of
it is in the repository.

What it ships, read from `bin/` and the inflated archives on an amd64 container:

| File                     | Packed bytes | Inflated                                                                                                                                                                                                                                 |
| ------------------------ | -----------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bin/chromium.br`        |   63,606,468 | `/tmp/chromium`, 196,676,728 bytes, `chrome-headless-shell` (`source/index.ts` passes `--headless='shell'`; the README says the package is built on `headless_shell`)                                                                    |
| `bin/swiftshader.tar.br` |    3,490,494 | `/tmp/libEGL.so` 360,208, `libGLESv2.so` 7,743,216, `libvk_swiftshader.so` 6,026,040, `libvulkan.so.1` 787,592, `vk_swiftshader_icd.json`                                                                                                |
| `bin/fonts.tar.br`       |      183,718 | `/tmp/fonts.conf` and `/tmp/fonts/Open_Sans/OpenSans-{Regular,Bold,Italic}.ttf` (Latin, Greek, Cyrillic)                                                                                                                                 |
| `bin/al2023.tar.br`      |    1,075,752 | `/tmp/al2023/lib/`: `libexpat.so.1`, `libnspr4.so`, `libnss3.so`, `libnssutil3.so`, `libplc4.so`, `libplds4.so`, `libsoftokn3.so`, `libfreebl3.so`, `libfreeblpriv3.so` and their `.chk` files; inflated only under the AL2023 detection |

`ldd /tmp/chromium` on Debian 12 x64 lists `libc.so.6`, `libdl.so.2`, `libm.so.6`,
`libpthread.so.0`, `libgcc_s.so.1`, `ld-linux-x86-64.so.2` and three that are not in a bare image:
`libexpat.so.1`, `libnspr4.so`, `libnss3.so` (`libnssutil3.so` comes with `libnss3`). Fontconfig,
FreeType, GBM and X are built in, so the binary asks the host for nothing else; `al2023.tar.br` is
exactly the three missing libraries plus NSS's own modules.

Detection in `build/esm/index.mjs`: `isRunningInAmazonLinux2023` is true when `AWS_EXECUTION_ENV`,
`AWS_LAMBDA_JS_RUNTIME` or `CODEBUILD_BUILD_IMAGE` names Node 20, 22 or 24, or when `VERCEL` is set
and Node is 20 or newer. Then, at module load, `FONTCONFIG_PATH ??= /tmp/fonts`, `HOME ??= /tmp`
and `LD_LIBRARY_PATH` is prefixed with `/tmp/al2023/lib`, and `executablePath()` inflates
`al2023.tar.br` beside the other three. `executablePath()` returns `/tmp/chromium` at once when it
exists (a warm function inflates once); it throws when `bin/` is missing with a message about
externalizing the package from the bundler, which is section 6. Graphics mode is on by default
and stays on: `setGraphicsMode = false` drops the SwiftShader archive and WebGL, which the materials
and two-tone pipelines need. The API of 147.0.2 is `args`, `graphics`, `setGraphicsMode`,
`executablePath(input?)` and the exports `inflate` and `setupLambdaEnvironment`; there is no
`font()` method in this version (the README's way to add faces is a `fonts` directory on one of the
four paths `fonts.conf` names: `/var/task/.fonts`, `/var/task/fonts`, `/opt/fonts`, `/tmp/fonts`).

### Selection order

`resolveExecutable(env)` in `packages/headless/src/launch.ts`, synchronous, tested:

1. `TURBOSLIDE_CHROME=sparticuz` selects the serverless binary; any other value is a path (`env`).
2. The `chromium-1217` build when its path exists (the deck's `shoot-slide.mjs` build).
3. playwright-core's default when it exists on disk (CI after `playwright-core install`).
4. Inside a function (`VERCEL` or `AWS_LAMBDA_FUNCTION_NAME` set) with none of the above:
   `sparticuz`.
5. Otherwise playwright-core's default path, so a developer without a browser still reads
   Playwright's install message.

For `sparticuz` the synchronous path is `<tmpdir>/chromium`, where the binary will be once
`prepareExecutable()` has inflated it, so the browser tests' `existsSync(resolveExecutable().path)`
skip as before on a machine without it. `prepareExecutable()` (awaited by `launchBrowser`) imports
the package through a variable specifier, so no bundler follows an optional dependency, refuses to
run it off Linux x64 with a message, awaits `executablePath()` and records `inflateMs`. The
backend is forced to `swiftshader` for this source whatever the platform default says.

### The switches

Playwright 1.62.1 builds the command line as its own switches, then `--enable-unsafe-swiftshader`,
then `--headless`, `--hide-scrollbars`, `--mute-audio` and the pointer settings, then
`--no-sandbox` (because `chromiumSandbox` is off by default), then the caller's `args`
(`lib/coreBundle.js`, `_innerDefaultArgs`). Chromium reads the last occurrence of a repeated
switch, so a caller switch overrides Playwright's. `sparticuzExtraArgs(chromium.args)` therefore
keeps the package's list minus four groups, and `launchBrowser` orders the command line
`LAUNCH_ARGS.swiftshader`, the kept switches, `extraArgs`:

| Group                                                                                                                                                  | Kept or dropped                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` (both lists), `--ignore-gpu-blocklist`                                            | Kept once: the SwiftShader set of SPEC 5.3 comes from `LAUNCH_ARGS.swiftshader`; the package's copies are deduplicated                                                                                               |
| `--headless='shell'`                                                                                                                                   | Dropped: Playwright passes `--headless`; the binary is the headless shell whatever the switch says, and the literal quotes would otherwise reach the process                                                         |
| `--enable-features=SharedArrayBuffer`, `--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process`                                   | Dropped: they would replace Playwright's own feature lists (`CDPScreenshotNewSurface`, the Translate and field trial disables that keep a screenshot deterministic); site isolation is moot under `--single-process` |
| `--no-sandbox`, `--disable-setuid-sandbox`                                                                                                             | `--no-sandbox` dropped (Playwright adds it); `--disable-setuid-sandbox` kept                                                                                                                                         |
| `--single-process`, `--no-zygote`, `--in-process-gpu`                                                                                                  | Kept: one process in the function, the package's recommendation                                                                                                                                                      |
| `--font-render-hinting=none`                                                                                                                           | Kept, and recorded: the container gate renders with the default hinting, so glyph edges differ between the two hosts; `compare-to-shoot` stays a local and container gate                                            |
| `--disable-web-security`, `--allow-running-insecure-content`, `--disable-site-isolation-trials`                                                        | Kept: harmless on the `file://` documents the renderer loads                                                                                                                                                         |
| `--ash-no-nudges`, `--disable-domain-reliability`, `--disable-print-preview`, `--disk-cache-size=33554432`, `--no-default-browser-check`, `--no-pings` | Kept                                                                                                                                                                                                                 |

The renderer string of every `RenderRecord` from this source starts with `chrome-headless-shell
<version>` instead of `Chrome for Testing <version>` (`rendererString(version, webgl, backend,
product)`), so a record from the function is never mistaken for one from the gate. The rest of the
string (`SwiftShader`, the device) is composed as before.

### Fonts

The render document already carries Inter as a data URI: `@turboslide/render/theme-node`
`loadThemeBundle()` inlines `InterVariable.woff2` (352,240 bytes) into `inter.css` unless
`inlineFonts: false` is passed, and `renderDeck` puts that CSS in the document head (SPEC 5.3:
inlined fonts are a determinism rule). A web font does not go through fontconfig, so a host with
no system font at all renders the deck's text in Inter; section 7 measures this under the binary
(`document.fonts.check()` for the four weight and size combinations the probe asks, and the
`fonts.status` of every render record, which `waitForReady` computes from `document.fonts.load()`
for every combination the slide's text uses). No fallback registration is needed for the deck's
own text.

What the host's fonts do decide is the fallback for glyphs Inter lacks: the language specimen
(`multilingual#lang`, `docs/M4-M5-STATUS.md`) renders through fallback faces. Under `VERCEL` the
package's `fonts.conf` and Open Sans (Latin, Greek, Cyrillic) are the whole fallback set; other
scripts render as missing glyph boxes there. Adding faces means a `fonts` directory at one of the
four paths above, which is the hosting store builder's bundle decision, not a code change here.

## 3. Running in the function's process

`apps/render-worker/src/cli.ts` `execMode(env)`: `TURBOSLIDE_WORKER_EXEC=spawn|inprocess` wins;
`TURBOSLIDE_BIN` means spawn; inside a function the default is `inprocess`; otherwise `inprocess`
only when `import.meta.resolve('@turboslide/cli/package.json')` fails or names a missing file,
which is the traced bundle's case (`docs/hosting-diagnosis.md` section 4). `runTurboslideInProcess`
calls `runCli(args, { cwd, env, streams, stdin })` from `@turboslide/cli/cli`, the pure entry the
CLI's tests drive, with stdout and stderr captured into the same `CliRun` the spawn produces
(`code`, `stdout`, `stderr`, `ms`, `args`, plus `exec`). Every job (render, sheet, export, verify,
and `build.run` through `download.ts`) therefore runs in both modes without knowing which; the
module is loaded on first use so the studio's dev server optimizer never crawls the CLI graph
(the measured hazard in `vite.config.ts`). An in-process run has no kill: `timeoutMs` applies to
spawn only and the platform's duration limit bounds the function.

This is the deviation from SPEC 3.3 item 7, which keeps Chromium out of the web app's function
because a browser crash would take the request with it and because the worker image carries
LibreOffice. Inside one Vercel function there is no second process to hand the work to, so the
choice is this or a container service (`docs/hosting-diagnosis.md` section 4, unverified). The
Docker worker path is unchanged: `TURBOSLIDE_WORKER_URL` still selects the HTTP client and the
image still spawns the binary.

Paths inside the function: `clientPaths()` moves the work directory to `<tmpdir>/turboslide-worker`
when `TURBOSLIDE_WORKER_DIR` is unset and the function markers are set (`/var/task` is read-only;
`/tmp` is the writable path). The decks directory stays `defaultPaths()`'s: `TURBOSLIDE_DECKS_DIR`,
else `<root>/decks`. The hosting store builder owns that seam: the export reads the deck's
`deck.json`, `slides/*.json` and the asset twins from a directory (`extractScenes` builds
`file://` URLs and reads two-tone twins with sharp), so a deck materialized from the store under
`/tmp` and named by `TURBOSLIDE_DECKS_DIR` is what this code expects.

## 3b. What the hosted previews taught (integration, 2026-09-11)

Nine preview deploys of the `turboslide` project ran renders and exports in the function; each
fact below is from their `vercel logs` (`docs/hosting.md` section 7 has the numbers that count).

- The binary launches: `@sparticuz/chromium` 147.0.2 inflates `/tmp/chromium` in 2.4 to 2.7 s on
  a cold instance (0 ms after), `chromium.launch` answers in 50 to 67 ms, and the WebGL probe reads
  `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`.
  The renderer string of every hosted record is `chrome-headless-shell 147.0.7727.0, SwiftShader,
Google`, so the exact build is 147.0.7727.0, the same as the worker image's.
- The single-process shell dies when a browser context is closed. The first previews closed the
  WebGL probe's context and then hung in the next `newContext` (no protocol answer, no timeout,
  every render and export ran to the job's 300 s limit and answered 502). `launch.ts` now keeps
  the probe context open for that source, `context.ts` never closes a sheet context on it, and
  `newContext`/`newPage` carry a 60 s deadline (`CONTEXT_TIMEOUT_MS`) so a hang is an error with
  a name. The two-frame `requestAnimationFrame` settle in `ready.ts` is bounded the same way.
- Every crash wrote a core file: `/tmp` is 525 MB in the function and after two renders held
  `core.chromium.51` (1,069 MB) and `core.chromium.92` (1,037 MB, sparse) beside `chromium`
  (187.6 MB), leaving 9 MB; the next browser then failed every `file://` load with
  `net::ERR_FAILED` (the record's `consoleErrors` name the twins). Three defences: the binary
  starts through `/tmp/chromium-nocore.sh` (`ulimit -c 0`, and the shell's pid written to the
  file `TURBOSLIDE_PIDFILE` names, which the `exec` keeps), `LaunchedBrowser.close()` ends that
  process with SIGKILL by that pid instead of the graceful close that crashed, and the worker
  client removes `core*`, Playwright profiles, Chromium shared memory and stale
  `turboslide-render-*`/`turboslide-export-*` temp folders ahead of every job. The job log names
  the volume before each job (`work volume: N MB free of 525 MB`) and its eight largest entries.
- `/tmp` budget after those: the inflated browser and its libraries about 205 MB, the overlay's
  decks 37 MB and package files 6 MB, one export's job folder about 55 MB (the `work/` sheet
  shots, 38 MB for one theme, plus the PPTX). `runSyncExport` prunes the job folder once the bytes
  are read (`WorkerClient.pruneJob`: `work/` always, the whole folder when the copies are stored).
- Fluid compute runs several routes of one deployment in one Node process: a render request that
  arrived while an export ran on the same instance waited in the local queue for it (measured:
  183.6 s for a 320 px thumbnail, the export's 187.9 s). Renders and exports on one instance are
  sequential by design (one Chromium at a time); the second cached read of a thumbnail is 220 to
  280 ms, a warm-instance render of another slide 1.6 to 2.2 s.
- A whole-deck flatten export of the GT deck (85 slides, light) took 187.9 s cold in the function,
  16,277,245 bytes; over the 4.5 MB cap it answers 302 to the stored copy on the Blob store (the
  route's `?sync=1`), which `python-pptx` reopens with 85 slides and `turboslide export check`
  reports valid (section 4 and `docs/hosting.md` section 7).
- Native mode crashed the shell the same way until the fix round. Every Editable text export on
  the previews answered 502 (`export exited 2 without an export report`) after the slides had
  measured, whole deck or one slide, in 1.5 to 156 s; the job record held the CLI's stderr,
  `browserContext.close: Target page, context or browser has been closed` at `extractScenes`.
  The 3x shot page for icons and marks (the `auto` raster policy, SPEC 8.6) was opened raw in
  `packages/export/src/scene/extract.ts` with `browser.newContext({ deviceScaleFactor: 3 })` and
  closed with `context.close()`, outside the guard of the second bullet; flatten never opens a 3x
  page, which is why flatten passed. Every page now comes from `openSheetPage` (`SheetScale` 1, 2
  or 3), so the guard and the 60 s deadlines cover the 3x page, and `extract.test.ts` runs one
  native slide against a Chrome for Testing browser flagged with `markSingleProcessBrowser` and
  asserts the three contexts stay open. Measured on the preview `turboslide-no1sl8n5y`
  (2026-09-11, the fixed tree): a one-slide native export (`thesis`, light) answered 200 in
  6.5 s on a cold instance and the same slide with `rasterScale: 3` (the 3x page as the only shot
  page) in 1.8 s warm, both `passed: true`, stored on Blob, `turboslide export check` valid.
  The whole deck in native mode then ran in 127.4 s (light, 23,689,436 bytes, 22.59 MiB) and
  125.4 s (dark, 24,847,042 bytes, 23.70 MiB), 85 pages each, `passed: true`, geometry in
  bounds, 242 native text and 70 raster blocks per theme, both stored on Blob and valid under
  `turboslide export check` (`docs/hosted-evidence/README.md` has the rows and the files).

## 4. The synchronous export

`POST /api/export/:deckId?sync=1` (or `"sync": true` in the body, removed before the export.run
schema validates the rest) runs `runSyncExport` (`apps/studio/src/server/export-sync.ts`):
`client.runJob('export', { deckId, ...input }, 780_000)` through the local queue (or over HTTP
when a worker URL is set), the `ExportReport` parsed from the result, every file the report lists
read back with `client.readJobFile(job.id, 'export/<name>')` (the job writes under
`<job dir>/export`; the HTTP client fetches `/jobs/:id/files/export/<name>`), sha256 per file.

Hosted, `?sync=1` is implied. When `isHosted()` is true (`server/root.ts`: the tmp or blob backend,
so every Vercel function) the route runs a POST without `?sync=1` synchronously as well and answers
the same way, with `X-Turboslide-Sync: hosted` in place of `requested`. Measured on the preview of
2026-09-11 before this rule: `POST /api/export/gt-brand` with a one-slide native body answered 202
with a job (`worker local`, `exec inprocess`); sixty polls of `GET ?job=` over 90 s showed it
`running` with two log lines, and it reached `failed` only after 235 s, when another request kept
the instance busy. A function is frozen once it has answered, so a queued job gets CPU only while
some other request runs on that instance, and its record lives on that instance alone (`GET ?job=`
from another is 404). The 202 path stays where a queue outlives the request: a checkout, and the
Docker worker over `TURBOSLIDE_WORKER_URL`. `/llms.txt` states the rule for API callers
(`packages/agent/src/generate/llms.ts`); the OpenAPI document has no entry for this route (it
describes the action table), which is an open item for the agent surface. Measured with the rule on
the preview `turboslide-krbfpkh3a`: the same body without `?sync=1` answered 200 in 10.6 s cold
with `X-Turboslide-Sync: hosted` and the stored copy's URL under `Accept: application/json`, the
PPTX as an attachment (29,284 bytes) in 4.5 s warm without it, and `requested` with `?sync=1`
(`docs/hosting.md` section 7).

The answer:

- The file: `Content-Type` of the PPTX, `Content-Disposition: attachment; filename="<deckId>-<theme>.pptx"`,
  `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. Two themes travel as one stored zip
  named `<deckId>-r<revision>-<mode>.zip`: `zipStored` writes local headers, a central directory
  and the end record by hand over `node:zlib`'s `crc32` (the studio has no zip dependency; PPTX
  parts are deflated already, so method 0 costs nothing). A two-entry zip written this way passed
  `unzip -t` on this machine.
- `X-Turboslide-Export-Report`: one line of ASCII JSON with the report's facts minus the per-slide
  entries: `job`, `deckId`, `revision`, `format`, `mode`, `themes`, `pages`, `passed`,
  `geometryInBounds`, `fontsEmbedded`, `files` (name, bytes, sha256), `verify`, `renderer`,
  `worker`, `exec`, `ms`. Header fields are bounded (Node's default is 16 KB across the response),
  which is why the per-slide list is not there.
- `X-Turboslide-Job`, `X-Turboslide-Worker` (`local` or `http`), `X-Turboslide-Exec` (`spawn`,
  `inprocess` or `remote`), `X-Turboslide-Sync` (`requested` when the caller sent `?sync=1` or
  `"sync": true`, `hosted` when the instance ran a plain POST synchronously).
- `?format=json` (or `Accept: application/json`): `{ sync: true, summary, report, files, verify,
verifyNote, log }`, the full report and the file list without the bytes.
- Errors: 404 for a missing deck (the job's `RangeError` message), 502 with the job's message when
  the export failed, 400 for an invalid body as before.
- Inside a function (`VERCEL` or `AWS_LAMBDA_FUNCTION_NAME`) a body over 4,718,592 bytes
  (`VERCEL_BODY_CAP`, the 4.5 MB of `docs/hosting-diagnosis.md` section 4) cannot leave, so the
  route answers 413 with `code: response_too_large` and the JSON body, and the caller exports one
  theme or a slide subset, or reads the stored copy the hosting store builder writes. The measured
  full deck is 28 to 29 MB per theme in native mode, so the whole deck never fits; the three-slide
  flatten file of section 7 does.

Verify: `runExportJob` asks `verifyTools()` once per process (`toolVersions` of
`@turboslide/export/verify/libreoffice`, `soffice --version`; a missing binary answers null at
once). When `verify` is requested and `soffice` is absent, the CLI runs without `--verify`, the
report gets one residual line and `export-report.json` is rewritten with it:

```
verify: unavailable in this environment (soffice not on PATH; the LibreOffice loop of SPEC 8.5
runs in the turboslide-render-worker image); flatten is pixel identical by construction: each
slide is the 2x sheet raster the browser painted (SPEC 8.2)
```

For native mode the second clause reads `native text placement is unverified in this file`. The
job result's `verify` is `ran`, `skipped` or `not-requested`, the sync summary carries it, and
`passed` reflects the checks that ran (the builder's geometry and package checks). Measured on
this machine (no `soffice`): a one-slide flatten export with `verify: true` answered `verify:
skipped` with that line, `passed: true`, `gt-brand-light.pptx` 62,318 bytes.

Time budget: `SYNC_EXPORT_TIMEOUT_MS` is 780 s, under the Pro maximum duration of 800 s with room
to answer; the hosting store builder sets `functionRules` for `/api/export/**`, `/api/render/**`
and `/_serverFn/**` at `maxDuration: 800` and `memory: 4096` (`docs/hosting-diagnosis.md` section
6; the package's README wants 1600 MB for Chromium alone). The base function keeps the defaults.

The editor's `export.run` in a checkout (`apps/studio/src/server/download.ts` `startExport` and
`pollExport`, polled once a second) and the `/api/actions/export.run` dispatcher still use submit
and wait; both run through the same `runTurboslide`, so they work in process too, within one
invocation, because the local queue's wait resolves in the same request. The signed download URLs
of `download.ts` resolve against the job's `outDir` in `<tmpdir>/turboslide-worker`, which lives
for the warm function only; the sync route exists so a caller gets the bytes in the same request.
Hosted, the editor exports synchronously (`exportCapabilities().sync`): today through a browser
fetch of the route with `?sync=1&format=json`; `download.ts` `syncExport` is the same
`runSyncExport` and the same JSON answer as a server function, for the case where the route
requires the bearer token (`docs/hosting.md` section 6).

### The batched export in the function

The Google Slides parity round two (gslides-parity SPEC-2 8.1; `docs/hosting.md` section 7 "The
batched Perfect export") splits a long export into per slide batches, each one function call.
`apps/studio/src/server/export-batch.ts` runs `extractScenes` in the function's process for one
batch, the way the in-process CLI export of section 3 does (the same `launchBrowser`, the same
serverless binary of section 2, the same `/tmp` budget of section 3b: a batch's work folder is a
`mkdtemp` under `/tmp` removed when the batch's parts are stored), and the merge runs `buildPptx`
over the stored scenes with no browser at all, so the merge call's cost is memory, not Chromium:
its peak resident memory is sampled every second and answered as `peakMb`. Batch calls on one
instance run one after the other (a module level slot), which keeps the one browser rule of
section 3b for the batches themselves; a thumbnail render that lands on the same instance while a
batch runs still goes through the worker's local queue and may overlap the batch's browser, the
same way it may overlap the synchronous export's today. The recorded measurements of a batched
export of the GT deck on a preview are in `docs/gslides-parity/build-2/b6.md`.

## 5. Renders and thumbnails

`GET /api/render/:slideId` and the thumbnails (`server/thumbs.ts`) call `worker().renderSlide`,
which runs the render job through `runTurboslide` and therefore, in the function, through
`runCli(['render', ...])` in process, whose `launchBrowser()` selects the serverless binary. The
response gained `X-Turboslide-Exec`; the `RenderRecord` in `X-Turboslide-Record` names the renderer
(`chrome-headless-shell 147...`). The worker's render cache under `<tmpdir>/turboslide-worker/cache`
makes the second request for a slide at the same revision a file read while the function is warm;
`thumbs.ts` still writes its own cache under `repoRoot()/.turboslide/thumbs`, which is the hosting
store builder's item 3 (`/tmp` or the store).

## 6. What the function bundle must include

Settled by the integrator on 2026-09-11 (`apps/studio/vite.deploy.config.ts`, measured on the
preview deploys of that day):

1. `'@sparticuz/chromium'` is in `SERVER_ONLY` of both Vite configs: external for the server, a stub
   for the client. The import in `launch.ts` uses a variable specifier, so neither build follows it.
2. The whole package travels with the function through Nitro's `traceDeps: ['@sparticuz/chromium*']`
   (the full-trace suffix copies every file, `bin/*.br` included). Nitro resolves a `traceDeps`
   entry from the app's own direct dependencies and directory, not from the workspace package that
   declares it, and under pnpm's strict layout the package exists only where a `package.json`
   names it, so `apps/studio/package.json` lists `@sparticuz/chromium` as an optional dependency
   too. Measured without that line: `nf3: could not resolve `traceInclude` entry
"@sparticuz/chromium" from any root` and no `node_modules/@sparticuz` in the function;
   `traceOpts.traceIncludeRoots` does not help because Nitro overwrites it with its own root list.
   With it, the Vercel build traces 21 packages (112 files) including `@sparticuz/chromium`
   147.0.2, `tar-fs`, `tar-stream`, `streamx`, `b4a`, `fast-fifo`, `text-decoder`,
   `events-universal`, `pump`, `once`, `end-of-stream`, `wrappy`, `bare-fs` and `bare-path`, and
   each of the four function directories (`__server`, `api/export`, `api/render`, `_serverFn`) is
   about 150 MB uncompressed with the four `bin/*.br` files (63,606,468 + 3,490,494 + 183,718 +
   1,075,752 bytes), under the 250 MB cap.
3. The runtime files the renderer and the exporter read from the workspace travel as the
   `packages` server asset group (docs/hosting.md section 2): `theme/src/gt-ink-paper/*.css`,
   `theme/assets/sprite.svg`, `fonts/src/inter.css`, `fonts/assets/InterVariable.woff2`,
   `fonts/export/*` and `export/src/calibration/calibration.json`, 6,250,989 bytes in 24 files.
   `server/root.ts` writes them under `<overlay>/packages` on the first request (measured 306 to
   315 ms) and sets `TURBOSLIDE_PACKAGES_DIR`, which `@turboslide/render/theme-node`,
   `@turboslide/fonts/export`, `@turboslide/export/pptx/fonts-map` and
   `@turboslide/export/calibration/locate` read before their `import.meta.resolve` and
   `import.meta.url` paths. Without this the function has no `@turboslide/theme` to resolve and
   `new URL('../calibration/calibration.json', import.meta.url)` names a file that is not there.
4. Environment: nothing is required for the browser (`VERCEL` is set by the platform and step 4 of
   the selection order picks the binary); `TURBOSLIDE_CHROME=sparticuz` makes the choice explicit;
   `TURBOSLIDE_WORKER_EXEC` is not needed (in-process is the function default); `root.ts` points
   `TURBOSLIDE_DECKS_DIR` and `TURBOSLIDE_WORKER_DIR` at the overlay. `TURBOSLIDE_GPU` is ignored
   for this source (SwiftShader is forced). `TURBOSLIDE_LAUNCH_LOG=1` prints the launch steps
   (executable, inflate, launch, WebGL probe) on stderr; inside a function they always print, so
   `vercel logs` shows where a launch stopped.
5. `functionRules` at `maxDuration: 800`, `memory: 3009` for `/api/export/**`, `/api/render/**` and
   `/_serverFn/**` (section 4; `HEAVY` in the config), the base function at 300 s.
6. The lockfile lists the package (`pnpm install` ran in the integration), so the Vercel build's
   `pnpm install --frozen-lockfile` resolves it.

The Docker check of section 7 stays the way to measure the binary off Vercel; the preview deploys
are the measurement that counts (docs/hosting.md section 7).

## 7. Measured on Linux x64

The measurement environment is `docker/Dockerfile.test`: `node:24-bookworm` for `linux/amd64`
(Docker Desktop 29.5.2 on this arm64 Mac runs it under emulation, so every time below is an upper
bound), `libnss3 libnspr4 libexpat1 ca-certificates` and nothing else installed, no fontconfig
package, no font, the workspace installed with `pnpm install --no-frozen-lockfile`, the committed
`decks/gt-brand` (revision 24) in place, `TURBOSLIDE_CHROME=sparticuz`. `docker/chromium-test.mjs`
runs the three steps and prints one JSON summary; the evidence files are in the session scratchpad
and their numbers are below.

The image build and the two container runs were not completed inside this session: the first
build reached `pnpm install` (2m 34s under emulation, 671 packages resolved, the optional
dependency installed) and then aborted in the follow-up `node -e` on libuv's io_uring assertion,
which `UV_USE_IO_URING=0` in the Dockerfile answers; the rebuild was in progress when the session
had to report (`docker build still running at 17:50:45Z UTC (last line: [WARN] Request took 40979ms: https://registry.npmjs.org/@tanstack%2Freact-router)`). What was measured on amd64 before that, in a `node:24-bookworm-slim`
container with the unpacked package mounted: the binary inflates to 196,676,728 bytes, `ldd` lists
the three libraries of section 2 and nothing else, and `--version` fails only for want of
`libnspr4.so` on the bare image, which is why the Dockerfile installs `libnss3 libnspr4 libexpat1`.
The same code path was measured on this machine in process (section 4): `renderSlide` for
`opener-brand` dark through `runCli` with the local Chrome for Testing 147.0.7727.15, and the
one-slide flatten sync export with `verify: skipped`, `passed: true`, 62,318 bytes.

To complete the measurement, from the repository root:

```
docker build --platform linux/amd64 -f docker/Dockerfile.test -t turboslide-chromium-test .
docker run --rm turboslide-chromium-test > chromium-test-plain.json
docker run --rm -e VERCEL=1 turboslide-chromium-test > chromium-test-vercel.json
```

Each JSON carries `render` (exit code, wall time, renderer string, per record `fonts.status`,
`faces`, `pageErrors`, `timing`, the PNG sizes), `export` (exit code, wall time, `passed`,
`geometryInBounds`, pages, embedded fonts, residual lines, the PPTX and sheet sizes), `fonts`
(launch time, `executableSource`, `product`, the Chromium version, the merged switches,
`document.fonts.check()` for `400 22px`, `500 22px`, `500 44px` and `400 14px Inter`, the faces
`document.fonts` holds, the Inter versus fallback width test) and `inflated` (the `/tmp` files).
The verifier records the two JSON files under `docs/m6-evidence/` and the numbers in this
section: the times are upper bounds under emulation, the renderer string names the exact
Chromium 147 build, and `fonts.status` must be `loaded` on every record for the deck's own text.

## 8. Residuals and open items

- The browser in the function is `chrome-headless-shell`, which SPEC 5.3 and `AGENTS.md`
  "Chromium" forbid for the gate; every record from it says so in `renderer`. The exact Chromium
  build behind `147.0.2` is what the container run reports below; it is not the `147.0.7727.15` of
  this machine or the `147.0.7727.0` of the worker image, so `compare-to-shoot` and the native PPTX
  gate stay where LibreOffice and Chrome for Testing are: this machine and the container.
- `--font-render-hinting=none` is kept from the package's list and changes glyph edges against
  the container's default hinting; a flatten export from the function is pixel identical to what
  the function's own browser painted, not to the container gate's pixels.
- Fallback faces: under `VERCEL` the page has Inter (inlined) and Open Sans (the package's), so the
  language specimen's other scripts show missing glyph boxes; a `fonts` directory on one of the
  four `fonts.conf` paths adds faces (section 2).
- Verify never runs in the function; the report says so per file (section 4). Perfect PPTX means
  the native gate in the container and the flatten construction, both unchanged by this round.
- A whole-deck export cannot leave the function as a body (4.5 MB response cap); on the blob
  backend the route stores the file and answers 302 to it (section 3b), on the tmp backend it
  still answers 413 with the JSON body and the caller exports a subset.
- No job outlives a request in the function, so the route's 202 path is not offered there
  (section 4); `GET ?job=` and the job list answer for the instance that took the request only.
- Exact versions: the code was written against `@sparticuz/chromium` 147.0.2's `index.mjs` and
  playwright-core 1.62.1's `coreBundle.js`; a version bump of either re-reads section 2's switch
  table.
- Files edited beyond the assigned list, with the reason: `apps/render-worker/src/cli.ts`, because
  the in-process mode has to sit where every job already calls `runTurboslide`, so render, sheet,
  export, verify and `build.run` all gain it from one seam instead of a second render runner; and
  `docker/Dockerfile.test.dockerignore` and `docker/chromium-test.mjs`, the companions of the
  assigned Dockerfile. `apps/render-worker/src/jobs/export.ts` is also on the PPTX builder's list
  (the `gslides` enum value); this round's edits there are additive and away from that line.
- Done by the integrator on 2026-09-11: `pnpm install` (the lockfile), the two Vite configs'
  `SERVER_ONLY` lists, `traceDeps`, `functionRules` and the preview deploys (section 3b,
  `docs/hosting.md` section 7).
