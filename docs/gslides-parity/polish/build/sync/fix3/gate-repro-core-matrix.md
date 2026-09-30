# Core gate matrix

Base https://turboslide-392lxforp-kl01s-projects.vercel.app, started 2026-09-30T12:53:50.968Z, 128 s. 3 rows judged: 1 passed, 2 failed, 0 not driven (0 of them manual, the checklist's: none), 0 no step. Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): none judged. Cost rows over their ceiling in this run: none. Verdict failed with the committed parked list inbox, templates and the parked rows arrange.group.tail-text-controls, logos.kit.find-a-logo, logos.picker.variants, shaders.background.add-to-theme, shaders.background.place-answers, shaders.frame.scrubber-capture, shaders.library.glyph-engines-render, svg.copy.markup, tables.bar.row-column-buttons, versions.show-changes-marks, view.live-pointers.second-browser; retries 0 configured, 0 test(s) retried; exit 1. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): none; rows whose own controls a ship would keep parked: none; rows of an unparkable feature blocking the ship: sync.block.offline-replay-converges, sync.reject.sentence-below-toolbar.

| Row | Feature | Driver | Today | Result | Reason |
| --- | --- | --- | --- | --- | --- |
| `sync.structural.concurrent` | sync | core/sync.spec.ts | not driven | passed |  |
| `sync.block.offline-replay-converges` | sync | core/sync.spec.ts | works | failed | Error: A's resend carries the offset shifted past B's words |
| `sync.reject.sentence-below-toolbar` | sync | core/sync.spec.ts | broken | failed | Error: one snackbar sentence |

## Not driven rows, by id and reason


## Failed rows, by id and reason

- `sync.block.offline-replay-converges`: Error: A's resend carries the offset shifted past B's words
- `sync.reject.sentence-below-toolbar`: Error: one snackbar sentence

