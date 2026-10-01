# Core gate matrix

Base https://www.turboslide.com, started 2026-10-01T06:13:37.488Z, 2342 s. 69 rows judged: 58 passed, 11 failed, 0 not driven (0 of them manual, the checklist's: none), 0 no step, 0 local rows this run did not record (listed apart below, never counted as passed). Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): decks.home.load-budget passed (first byte 38 ms (budget 150); LCP 172 ms on img[hero-dark] (budget 500, the hero picture or the h1); ready 201 ms (budget 500); images before the first scroll 261883 B (budget 300000); images after a full scroll 261883 B (budget 800000); document 15729 B (budget 60000); long animation frames over 100 ms 0; JavaScript decoded 1238762 B (reported against 600000); first byte 38 ms (budget 150); LCP 172 ms on img[hero-dark] (budget 500, the hero picture or the h1); ready 201 ms (budget 500); images before the first scroll 261883 B (budget 300000); images after a full scroll 261883 B (budget 800000); document 15729 B (budget 60000); long animation frames over 100 ms 0; JavaScript decoded 1238762 B (reported against 600000)). Cost rows over their ceiling in this run: none. Verdict failed with the committed parked list inbox, templates and the parked rows arrange.group.tail-text-controls, logos.kit.find-a-logo, logos.picker.variants, shaders.background.add-to-theme, shaders.background.place-answers, shaders.frame.scrubber-capture, shaders.library.glyph-engines-render, svg.copy.markup, tables.bar.row-column-buttons, versions.show-changes-marks, view.live-pointers.second-browser; retries 0 configured, 0 test(s) retried; exit 1. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): assist, logos, shaders; rows whose own controls a ship would keep parked: collab.follow.anonymous-editor (title.presence.follow); rows of an unparkable feature blocking the ship: images.insert.no-external-banner, images.replace.keeps-aspect, export.refusal.sentence-and-retry, export.picture.progress-and-capture, sync.slide.concurrent-add-both-kept, decks.home.links-and-card.

| Row                                       | Feature  | Driver                 | Today      | Result | Reason                                                                                                 |
| ----------------------------------------- | -------- | ---------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------ |
| `surface.domain.build-commit`             | surface  | core/surface.spec.ts   | broken     | passed |                                                                                                        |
| `tables.header.rule-with-text`            | tables   | core/export.spec.ts    | broken     | passed |                                                                                                        |
| `charts.labels.fit-slot`                  | charts   | core/export.spec.ts    | broken     | passed |                                                                                                        |
| `svg.paste.keeps-text`                    | svg      | core/svg.spec.ts       | broken     | passed |                                                                                                        |
| `images.insert.no-external-banner`        | images   | core/images.spec.ts    | broken     | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m |
| `shaders.frame.large-png-lands`           | shaders  | core/shaders.spec.ts   | broken     | failed | Error: page.screenshot: Clipped area is either empty or outside the resulting image                    |
| `images.replace.keeps-aspect`             | images   | core/logos.spec.ts     | broken     | failed | Error: the picture's natural size is known                                                             |
| `images.picture.no-plate`                 | images   | core/logos.spec.ts     | broken     | passed |                                                                                                        |
| `logos.dialog.results-in-view`            | logos    | core/logos.spec.ts     | broken     | failed | Error: the dialog's height does not change                                                             |
| `logos.dialog.sentence-case-whole-names`  | logos    | core/logos.spec.ts     | broken     | passed |                                                                                                        |
| `shaders.gallery.words-and-head`          | shaders  | core/shaders.spec.ts   | broken     | passed |                                                                                                        |
| `shaders.insert.free-rectangle`           | shaders  | core/shaders.spec.ts   | broken     | failed | [31mTest timeout of 240000ms exceeded.[39m                                                             |
| `brand.panel.words-match-sheet`           | brand    | core/brand.spec.ts     | broken     | passed |                                                                                                        |
| `images.byurl.preview-contained`          | images   | core/images.spec.ts    | broken     | passed |                                                                                                        |
| `svg.intake.long-comment`                 | svg      | core/svg.spec.ts       | broken     | passed |                                                                                                        |
| `images.drop.clamped`                     | images   | core/images.spec.ts    | broken     | passed |                                                                                                        |
| `images.polish.natural-size`              | images   | core/images.spec.ts    | broken     | passed |                                                                                                        |
| `chrome.tail.reads-mode`                  | chrome   | core/share.spec.ts     | broken     | passed |                                                                                                        |
| `share.name-prompt.empty-field`           | share    | core/share.spec.ts     | broken     | passed |                                                                                                        |
| `decks.recent.keeps-new-deck`             | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |
| `decks.card.rename-everywhere`            | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |
| `decks.list.one-card-per-deck`            | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |
| `export.print.deck-appearance`            | export   | core/export.spec.ts    | broken     | passed |                                                                                                        |
| `share.dialog.new-deck-restricted-viewer` | share    | core/share.spec.ts     | broken     | passed |                                                                                                        |
| `share.role-change.keeps-link`            | share    | core/share.spec.ts     | broken     | passed |                                                                                                        |
| `export.details.seller-card`              | export   | core/export.spec.ts    | broken     | passed |                                                                                                        |
| `decks.trash.leaves-at-once`              | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |
| `export.refusal.sentence-and-retry`       | export   | core/export.spec.ts    | broken     | failed | [31mTest timeout of 240000ms exceeded.[39m                                                             |
| `export.print.opens`                      | export   | core/export.spec.ts    | broken     | passed |                                                                                                        |
| `decks.card.title-ellipsis`               | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |
| `decks.card.download-powerpoint`          | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |
| `export.download.one-name-rule`           | export   | core/export.spec.ts    | broken     | passed |                                                                                                        |
| `export.picture.progress-and-capture`     | export   | core/export.spec.ts    | broken     | failed | Error: the file within 4 s on an unchanged slide                                                       |
| `decks.import.upload-drop-zone`           | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |
| `decks.back.list-restored`                | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |
| `decks.card.thumbnail-or-plate`           | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |
| `versions.panel.rows-read-clean`          | versions | core/documents.spec.ts | broken     | passed |                                                                                                        |
| `versions.title-row.last-edit-inline`     | versions | core/documents.spec.ts | broken     | passed |                                                                                                        |
| `present.bar.no-dead-control`             | present  | core/present.spec.ts   | broken     | passed |                                                                                                        |
| `present.laser.visible`                   | present  | core/present.spec.ts   | broken     | passed |                                                                                                        |
| `comments.marker.one-per-anchor`          | comments | core/documents.spec.ts | broken     | passed |                                                                                                        |
| `share.dialog.restricted-and-more`        | share    | core/share.spec.ts     | broken     | passed |                                                                                                        |
| `decks.trash.enter-confirms`              | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |
| `decks.card.rename-field-fits`            | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |
| `decks.trash.empty-not-primary`           | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |
| `decks.polish.pages-sweep`                | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |
| `sync.slide.concurrent-add-both-kept`     | sync     | core/sync.spec.ts      | broken     | failed | Error: both browsers hold both slides within 5 s, no reject card, no retry word, three rounds          |
| `sync.title-row.save-words-truthful`      | sync     | core/sync.spec.ts      | broken     | passed |                                                                                                        |
| `sync.reject.sentence-below-toolbar`      | sync     | core/sync.spec.ts      | broken     | passed |                                                                                                        |
| `share.name-prompt.never-mid-drag`        | share    | core/share.spec.ts     | broken     | passed |                                                                                                        |
| `collab.follow.anonymous-editor`          | share    | core/share.spec.ts     | not driven | failed | Error: the roster lists Follow for an anonymous editor                                                 |
| `present.link.first-paint-show`           | present  | core/present.spec.ts   | broken     | passed |                                                                                                        |
| `surface.skeleton.matches-editor`         | surface  | core/surface.spec.ts   | broken     | passed |                                                                                                        |
| `sync.write.5xx-keeps-document`           | sync     | core/sync.spec.ts      | broken     | passed |                                                                                                        |
| `sync.recovered.no-plate-for-held-writes` | sync     | core/sync.spec.ts      | broken     | passed |                                                                                                        |
| `collab.presence.join-within-2s`          | share    | core/share.spec.ts     | broken     | passed |                                                                                                        |
| `decks.thumbnail.never-502`               | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |
| `collab.polish.session-sweep`             | share    | core/share.spec.ts     | broken     | passed |                                                                                                        |
| `assist.panel.mode-aware`                 | assist   | core/assist.spec.ts    | broken     | passed |                                                                                                        |
| `assist.tailor.one-pass`                  | assist   | core/assist.spec.ts    | broken     | passed |                                                                                                        |
| `assist.snackbar.names-change`            | assist   | core/assist.spec.ts    | broken     | failed | Error: renewal became contract                                                                         |
| `assist.panel.words-and-layout`           | assist   | core/assist.spec.ts    | broken     | passed |                                                                                                        |
| `assist.polish.agent-sweep`               | assist   | core/assist.spec.ts    | broken     | passed |                                                                                                        |
| `decks.home.pictures-three-widths`        | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |
| `decks.home.copy-rules`                   | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |
| `decks.home.product-pictures`             | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |
| `decks.home.links-and-card`               | decks    | core/decks.spec.ts     | broken     | failed | Error: og:url names www.turboslide.com                                                                 |
| `decks.home.load-budget`                  | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |
| `decks.home.layout-shift`                 | decks    | core/decks.spec.ts     | broken     | passed |                                                                                                        |

## Not driven rows, by id and reason

## Failed rows, by id and reason

- `images.insert.no-external-banner`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m
- `shaders.frame.large-png-lands`: Error: page.screenshot: Clipped area is either empty or outside the resulting image
- `images.replace.keeps-aspect`: Error: the picture's natural size is known
- `logos.dialog.results-in-view`: Error: the dialog's height does not change
- `shaders.insert.free-rectangle`: [31mTest timeout of 240000ms exceeded.[39m
- `export.refusal.sentence-and-retry`: [31mTest timeout of 240000ms exceeded.[39m
- `export.picture.progress-and-capture`: Error: the file within 4 s on an unchanged slide
- `sync.slide.concurrent-add-both-kept`: Error: both browsers hold both slides within 5 s, no reject card, no retry word, three rounds
- `collab.follow.anonymous-editor`: Error: the roster lists Follow for an anonymous editor
- `assist.snackbar.names-change`: Error: renewal became contract
- `decks.home.links-and-card`: Error: og:url names www.turboslide.com

## Measurement rows, by id (PRODUCT.md 8.2; the cost rows of SYNC.md 6.1)

- `decks.home.load-budget`: passed; recorded first byte 38 ms (budget 150); LCP 172 ms on img[hero-dark] (budget 500, the hero picture or the h1); ready 201 ms (budget 500); images before the first scroll 261883 B (budget 300000); images after a full scroll 261883 B (budget 800000); document 15729 B (budget 60000); long animation frames over 1
