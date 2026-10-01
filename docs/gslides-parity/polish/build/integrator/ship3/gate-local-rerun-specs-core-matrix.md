# Core gate matrix

Base http://localhost:4448, started 2026-09-30T23:38:55.607Z, 595 s. 8 rows judged: 3 passed, 5 failed, 0 not driven (0 of them manual, the checklist's: none), 0 no step, 0 local rows this run did not record (listed apart below, never counted as passed). Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): decks.home.load-budget failed (first byte 112 ms (budget 150); LCP 184 ms on img[hero-dark] (budget 500, the hero picture or the h1); ready 1002 ms (budget 500); images before the first scroll 261883 B (budget 300000); images after a full scroll 261883 B (budget 800000); document 67500 B (budget 60000); long animation frames over 100 ms 0; JavaScript decoded 12800310 B (reported against 600000); first byte 112 ms (budget 150); LCP 184 ms on img[hero-dark] (budget 500, the hero picture or the h1); ready 1002 ms (budget 500); images before the first scroll 261883 B (budget 300000); images after a full scroll 261883 B (budget 800000); document 67500 B (budget 60000); long animation frames over 100 ms 0; JavaScript decoded 12800310 B (reported against 600000)). Cost rows over their ceiling in this run: none. Verdict failed with the committed parked list inbox, templates and the parked rows arrange.group.tail-text-controls, logos.kit.find-a-logo, logos.picker.variants, shaders.background.add-to-theme, shaders.background.place-answers, shaders.frame.scrubber-capture, shaders.library.glyph-engines-render, svg.copy.markup, tables.bar.row-column-buttons, versions.show-changes-marks, view.live-pointers.second-browser; retries 0 configured, 0 test(s) retried; exit 1. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): none; rows whose own controls a ship would keep parked: none; rows of an unparkable feature blocking the ship: shaders.export.missing-frame-row, images.insert.no-external-banner, export.refusal.sentence-and-retry, decks.polish.pages-sweep.

| Row | Feature | Driver | Today | Result | Reason |
| --- | --- | --- | --- | --- | --- |
| `shaders.export.missing-frame-row` | export | core/export.spec.ts | not driven | failed | Error: the export started within 800 ms of the change |
| `images.insert.no-external-banner` | images | core/images.spec.ts | broken | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m |
| `share.name-prompt.empty-field` | share | core/share.spec.ts | broken | passed |  |
| `export.refusal.sentence-and-retry` | export | core/export.spec.ts | broken | failed | [31mTest timeout of 240000ms exceeded.[39m |
| `export.picture.progress-and-capture` | export | core/export.spec.ts | broken | passed |  |
| `decks.polish.pages-sweep` | decks | core/decks.spec.ts | broken | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m |
| `present.link.first-paint-show` | present | core/present.spec.ts | broken | passed |  |
| `decks.home.load-budget` | decks | core/decks.spec.ts | broken | failed | Error: ready 1002 ms (budget 500) |

## Not driven rows, by id and reason


## Failed rows, by id and reason

- `shaders.export.missing-frame-row`: Error: the export started within 800 ms of the change
- `images.insert.no-external-banner`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m
- `export.refusal.sentence-and-retry`: [31mTest timeout of 240000ms exceeded.[39m
- `decks.polish.pages-sweep`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m
- `decks.home.load-budget`: Error: ready 1002 ms (budget 500)

## Measurement rows, by id (PRODUCT.md 8.2; the cost rows of SYNC.md 6.1)

- `decks.home.load-budget`: failed (Error: ready 1002 ms (budget 500)); recorded first byte 112 ms (budget 150); LCP 184 ms on img[hero-dark] (budget 500, the hero picture or the h1); ready 1002 ms (budget 500); images before the first scroll 261883 B (budget 300000); images after a full scroll 261883 B (budget 800000); document 67500 B (budget 60000); long animation frames over

