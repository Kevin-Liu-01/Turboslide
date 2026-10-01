# Core gate matrix

Base http://localhost:4448, started 2026-09-30T23:57:25.558Z, 400 s. 4 rows judged: 1 passed, 3 failed, 0 not driven (0 of them manual, the checklist's: none), 0 no step, 0 local rows this run did not record (listed apart below, never counted as passed). Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): decks.home.load-budget failed (first byte 87 ms (budget 150); LCP 160 ms on img[hero-dark] (budget 500, the hero picture or the h1); ready 1034 ms (budget 500); images before the first scroll 261883 B (budget 300000); images after a full scroll 261883 B (budget 800000); document 67500 B (budget 60000); long animation frames over 100 ms 0; JavaScript decoded 12671242 B (reported against 600000); first byte 87 ms (budget 150); LCP 160 ms on img[hero-dark] (budget 500, the hero picture or the h1); ready 1034 ms (budget 500); images before the first scroll 261883 B (budget 300000); images after a full scroll 261883 B (budget 800000); document 67500 B (budget 60000); long animation frames over 100 ms 0; JavaScript decoded 12671242 B (reported against 600000)). Cost rows over their ceiling in this run: none. Verdict failed with the committed parked list inbox, templates and the parked rows arrange.group.tail-text-controls, logos.kit.find-a-logo, logos.picker.variants, shaders.background.add-to-theme, shaders.background.place-answers, shaders.frame.scrubber-capture, shaders.library.glyph-engines-render, svg.copy.markup, tables.bar.row-column-buttons, versions.show-changes-marks, view.live-pointers.second-browser; retries 0 configured, 0 test(s) retried; exit 1. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): none; rows whose own controls a ship would keep parked: none; rows of an unparkable feature blocking the ship: shaders.export.missing-frame-row, export.refusal.sentence-and-retry.

| Row | Feature | Driver | Today | Result | Reason |
| --- | --- | --- | --- | --- | --- |
| `shaders.export.missing-frame-row` | export | core/export.spec.ts | not driven | failed | Error: the export started within 800 ms of the change |
| `export.refusal.sentence-and-retry` | export | core/export.spec.ts | broken | failed | [31mTest timeout of 240000ms exceeded.[39m |
| `decks.polish.pages-sweep` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.home.load-budget` | decks | core/decks.spec.ts | broken | failed | Error: ready 1034 ms (budget 500) |

## Not driven rows, by id and reason


## Failed rows, by id and reason

- `shaders.export.missing-frame-row`: Error: the export started within 800 ms of the change
- `export.refusal.sentence-and-retry`: [31mTest timeout of 240000ms exceeded.[39m
- `decks.home.load-budget`: Error: ready 1034 ms (budget 500)

## Measurement rows, by id (PRODUCT.md 8.2; the cost rows of SYNC.md 6.1)

- `decks.home.load-budget`: failed (Error: ready 1034 ms (budget 500)); recorded first byte 87 ms (budget 150); LCP 160 ms on img[hero-dark] (budget 500, the hero picture or the h1); ready 1034 ms (budget 500); images before the first scroll 261883 B (budget 300000); images after a full scroll 261883 B (budget 800000); document 67500 B (budget 60000); long animation frames over 

