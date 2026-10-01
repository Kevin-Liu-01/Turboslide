# Core gate matrix

Base https://www.turboslide.com, started 2026-10-01T06:54:55.005Z, 965 s. 9 rows judged: 2 passed, 7 failed, 0 not driven (0 of them manual, the checklist's: none), 0 no step, 0 local rows this run did not record (listed apart below, never counted as passed). Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): none judged. Cost rows over their ceiling in this run: none. Verdict failed with the committed parked list inbox, templates and the parked rows arrange.group.tail-text-controls, logos.kit.find-a-logo, logos.picker.variants, shaders.background.add-to-theme, shaders.background.place-answers, shaders.frame.scrubber-capture, shaders.library.glyph-engines-render, svg.copy.markup, tables.bar.row-column-buttons, versions.show-changes-marks, view.live-pointers.second-browser; retries 0 configured, 0 test(s) retried; exit 1. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): assist, logos, shaders; rows whose own controls a ship would keep parked: none; rows of an unparkable feature blocking the ship: images.insert.no-external-banner, export.refusal.sentence-and-retry, export.picture.progress-and-capture.

| Row                                   | Feature | Driver               | Today  | Result | Reason                                                                                                 |
| ------------------------------------- | ------- | -------------------- | ------ | ------ | ------------------------------------------------------------------------------------------------------ |
| `images.insert.no-external-banner`    | images  | core/images.spec.ts  | broken | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m |
| `shaders.frame.large-png-lands`       | shaders | core/shaders.spec.ts | broken | failed | Error: page.screenshot: Clipped area is either empty or outside the resulting image                    |
| `images.replace.keeps-aspect`         | images  | core/logos.spec.ts   | broken | passed |                                                                                                        |
| `logos.dialog.results-in-view`        | logos   | core/logos.spec.ts   | broken | failed | Error: the dialog's height does not change                                                             |
| `shaders.insert.free-rectangle`       | shaders | core/shaders.spec.ts | broken | failed | [31mTest timeout of 240000ms exceeded.[39m                                                             |
| `export.refusal.sentence-and-retry`   | export  | core/export.spec.ts  | broken | failed | [31mTest timeout of 240000ms exceeded.[39m                                                             |
| `export.picture.progress-and-capture` | export  | core/export.spec.ts  | broken | failed | Error: the file within 4 s on an unchanged slide                                                       |
| `sync.slide.concurrent-add-both-kept` | sync    | core/sync.spec.ts    | broken | passed |                                                                                                        |
| `assist.snackbar.names-change`        | assist  | core/assist.spec.ts  | broken | failed | Error: renewal became contract                                                                         |

## Not driven rows, by id and reason

## Failed rows, by id and reason

- `images.insert.no-external-banner`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m
- `shaders.frame.large-png-lands`: Error: page.screenshot: Clipped area is either empty or outside the resulting image
- `logos.dialog.results-in-view`: Error: the dialog's height does not change
- `shaders.insert.free-rectangle`: [31mTest timeout of 240000ms exceeded.[39m
- `export.refusal.sentence-and-retry`: [31mTest timeout of 240000ms exceeded.[39m
- `export.picture.progress-and-capture`: Error: the file within 4 s on an unchanged slide
- `assist.snackbar.names-change`: Error: renewal became contract
