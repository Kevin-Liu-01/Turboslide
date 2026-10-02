# Hosted evidence

What the integrator measured against the preview deploys of the `turboslide` Vercel project on
2026-09-11 (Kevin's directive: "https://studio-delta-six-40.vercel.app/ shows something went wrong").
The last two previews, `turboslide-abjh1s171` and `turboslide-4qc1szmew-kl01s-projects.vercel.app`,
carry the tree this evidence comes from; the native (Editable text) rows come from
`turboslide-no1sl8n5y-kl01s-projects.vercel.app`, the preview of the fix round that routed the export's
3x shot page through `openSheetPage` (`docs/hosting-chromium.md` section 3b); the production URL gets
it from the push to `main`. Every number is from `vercel logs` or the probe's own clock; the probes
ran from this machine with the project's development token in the Trusted Sources header
(`docs/hosting.md` section 7).

| Step                                                                        | Result | Numbers                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/` is 307 to `/edit/gt-brand`                                              | pass   | 568 ms warm, 1.6 to 3.9 s on a cold instance (seed of 183 documents and the 24 package files, about 600 ms of it)                                                                                                                                                                                                                                            |
| `/deck/gt-brand` renders the deck                                           | pass   | 200 in 597 to 751 ms, 358,117 chars; the screenshot shows the opener with Inter loaded (`document.fonts.check` true)                                                                                                                                                                                                                                         |
| `/edit/gt-brand` loads the editor                                           | pass   | 200 shell in 104 to 242 ms; the window API answers after 4.1 to 5.9 s (`Saved · r27`)                                                                                                                                                                                                                                                                        |
| an inspector write lands                                                    | pass   | `slide.title` on `thesis`: r27 to r28, the chip `Saved · r28` (`shoot-write.json`)                                                                                                                                                                                                                                                                           |
| the write survives a reload on another instance                             | pass   | reload on `x-vercel-id` `j9wzd...` answered r28 with the text (the Blob backend; on the first preview without a store the reload showed r24)                                                                                                                                                                                                                 |
| `/api/render/opener-brand?w=320` returns a PNG                              | pass   | 18,735 bytes; 7.2 to 9.0 s on a cold instance (inflate 2.4 to 2.7 s, launch 50 to 67 ms, ready 30 ms, shot 194 ms), 239 to 385 ms from the cache                                                                                                                                                                                                             |
| a warm render of another slide (`title`, JSON record)                       | pass   | 1.6 to 2.2 s; renderer `chrome-headless-shell 147.0.7727.0, SwiftShader, Google`; no console errors                                                                                                                                                                                                                                                          |
| `POST /api/export/gt-brand?sync=1` flatten light                            | pass   | 85 pages in 187.9, 199.8 and 203.1 s; 16,271,404 to 16,278,003 bytes (15.52 MiB, under 25 MB); 302 to the stored copy on Blob                                                                                                                                                                                                                                |
| the PPTX reopens                                                            | pass   | python-pptx: 85 slides, 774 shapes; `turboslide export check`: valid, 446 parts, 528 relationships, 83 png-palette + 2 jpeg pages, 85 titles                                                                                                                                                                                                                 |
| the report                                                                  | pass   | `perfect: true`, `passed: true`, worst decoded mismatch 0.003 percent, verify not requested (no LibreOffice in the function)                                                                                                                                                                                                                                 |
| the editor's Export menu (PPTX, light)                                      | pass   | `capabilities.sync`: one `POST /api/export/gt-brand?sync=1&format=json`, 200 after 184.8 s; the report card (`Passed in 179.4 s`, perfect yes) and the download of the stored copy (`?download=1`); one earlier attempt hit the route's 780 s limit (502) and is recorded as such                                                                            |
| `/api/agent` off localhost                                                  | pass   | 401 (no `TURBOSLIDE_TOKEN`)                                                                                                                                                                                                                                                                                                                                  |
| `POST /api/export/gt-brand?sync=1&format=json` native (Editable text) light | pass   | 85 pages in 127.4 s (the job 126.4 s), 23,689,436 bytes (22.59 MiB) stored on Blob; `passed: true`, geometry in bounds, 242 native text blocks, 70 raster blocks, 18 pictures, verify not requested; before the fix every native export answered 502 after the slides had measured (`browserContext.close: Target page, context or browser has been closed`) |
| the same, dark                                                              | pass   | 85 pages in 125.4 s (the job 124.3 s), 24,847,042 bytes (23.70 MiB) stored on Blob; `passed: true`, geometry in bounds, 242 native text blocks, 70 raster blocks                                                                                                                                                                                             |
| one native slide (`thesis`), then with `rasterScale: 3`                     | pass   | 200 in 6.5 s on a cold instance and 1.8 s warm (17,879 bytes each); the 3x page is the only shot page under the forced policy; before the fix 502 in 2.2 and 6.4 s                                                                                                                                                                                           |
| the native files reopen                                                     | pass   | `turboslide export check` light: valid, 597 parts, 695 relationships, 1329 shapes in bounds, 219 RGBA PNG, 15 1-bit PNG and 3 JPEG media, 85 titles, python-pptx 85 slides and 1085 shapes; dark: valid, 597 parts, 695 relationships, 1329 shapes in bounds, the same media split, python-pptx 85 slides and 1085 shapes                                    |
| a second export on the same instance                                        | pass   | after the first: 270 MB free of 525 MB on `/tmp`, no core files; before the fix 9 MB free and every `file://` load failed                                                                                                                                                                                                                                    |

Files:

- `smoke-table.txt`: `node scripts/hosted-smoke.mjs <preview>` (6 of 6).
- `deck-gt-brand-1440x900.jpg`, `deck-gt-brand-slide2-1440x900.jpg`: the viewer at 1440 by 900.
- `edit-gt-brand-1440x900.jpg`, `edit-after-write-1440x900.jpg`, `edit-after-reload-1440x900.jpg`:
  the editor before the write, after it and after the reload; `shoot-write.json` is the step log.
- `render-opener-brand-w320.png`: the 320 px thumbnail the function rendered;
  `render-title-record.json`: a full `RenderRecord` from the function; `probe-render.json`: the
  timings.
- `edit-export-card-1440x900.jpg`: the editor's report card after the Export menu ran the sync
  export; `shoot-export.json` is its step log with the download URL.
- `export-report.json`: the `ExportReport` of the sync export with its summary and the stored
  file's URL; `probe-export-file.json`, `probe-export-json.json`: the two export requests' timings
  and headers; `export-check.txt`: `turboslide export check` on the downloaded file;
  `export-quicklook-first-page.jpg`: the first page as macOS QuickLook draws the PPTX.
- `probe-export-native.json`: the four native requests of the fix round (one slide, one slide at
  `rasterScale: 3`, the whole deck light, the whole deck dark) with their timings, headers,
  summaries and stored URLs; `export-report-native-light.json`, `export-report-native-dark.json`:
  their `ExportReport`s; `export-check-native-light.txt`, `export-check-native-dark.txt`:
  `turboslide export check` on the downloaded files.

Not in this folder: the PPTX itself (16 MB; the URL in `export-report.json` serves it) and the
raw `vercel logs`, which `docs/hosting.md` section 7 and `docs/hosting-chromium.md` section 3b
quote.
