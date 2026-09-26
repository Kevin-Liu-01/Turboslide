# Core gate matrix

Base https://turboslide-1ncbsb9tb-kl01s-projects.vercel.app, started 2026-09-25T06:34:49.698Z, 190 s. 12 rows judged: 10 passed, 2 failed, 0 not driven (0 of them manual, the checklist's: none), 0 no step. Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): none judged. Cost rows over their ceiling in this run: none. Verdict failed with the committed parked list inbox, templates and the parked rows arrange.group.tail-text-controls, logos.kit.find-a-logo, logos.picker.variants, tables.bar.row-column-buttons, tables.edge.add-row-column, tables.heads.select-row-column, tables.seam.row-drag, versions.show-changes-marks, view.live-pointers.second-browser, wordart.tail.fill-outline; retries 0 configured, 0 test(s) retried; exit 1. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): none; rows whose own controls a ship would keep parked: svg.render.vector-at-zoom (intake.svg.upload, intake.svg.paste, intake.svg.drop, intake.svg.url); svg.copy.markup (picture.svg.copy); rows of an unparkable feature blocking the ship: none.

| Row | Feature | Driver | Today | Result | Reason |
| --- | --- | --- | --- | --- | --- |
| `svg.import.upload` | svg | core/svg.spec.ts | broken | passed |  |
| `svg.import.paste-file` | svg | core/svg.spec.ts | not driven | passed |  |
| `svg.import.paste-markup` | svg | core/svg.spec.ts | not driven | passed |  |
| `svg.import.drop` | svg | core/svg.spec.ts | not driven | passed |  |
| `svg.import.url` | svg | core/svg.spec.ts | not driven | passed |  |
| `svg.render.vector-at-zoom` | svg | core/svg.spec.ts | not driven | failed | Error: the viewer draws the same img |
| `svg.render.picture-gestures` | svg | core/svg.spec.ts | not driven | passed |  |
| `svg.copy.markup` | svg | core/svg.spec.ts | not driven | failed | Error: text/plain begins with the prolog or <svg |
| `svg.sanitize.script-and-handlers` | svg | core/svg.spec.ts | not driven | passed |  |
| `svg.sanitize.data-image-kept` | svg | core/svg.spec.ts | not driven | passed |  |
| `svg.sanitize.cap` | svg | core/svg.spec.ts | not driven | passed |  |
| `svg.sanitize.broken` | svg | core/svg.spec.ts | not driven | passed |  |

## Not driven rows, by id and reason


## Failed rows, by id and reason

- `svg.render.vector-at-zoom`: Error: the viewer draws the same img
- `svg.copy.markup`: Error: text/plain begins with the prolog or <svg

