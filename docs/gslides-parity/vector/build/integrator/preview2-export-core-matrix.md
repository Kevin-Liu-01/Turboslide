# Core gate matrix

Base https://turboslide-1ncbsb9tb-kl01s-projects.vercel.app, started 2026-09-25T06:03:16.622Z, 1653 s. 41 rows judged: 36 passed, 5 failed, 0 not driven (0 of them manual, the checklist's: none), 0 no step. Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): export.download.large-deck-pdf passed (PDF: GT brand deck.pdf, 85 slides in 11.1 s, 0.13 s per slide; PDF: GT brand deck.pdf, 85 slides in 11.1 s, 0.13 s per slide); export.download.large-deck-pptx passed (Editable text PowerPoint with Embed fonts: GT brand deck (editable).pptx, 85 slides in 196.4 s, 2.31 s per slide; Editable text PowerPoint with Embed fonts: GT brand deck (editable).pptx, 85 slides in 196.4 s, 2.31 s per slide). Cost rows over their ceiling in this run: none. Verdict failed with the committed parked list inbox, templates and the parked rows arrange.group.tail-text-controls, logos.kit.find-a-logo, logos.picker.variants, tables.bar.row-column-buttons, tables.edge.add-row-column, tables.heads.select-row-column, tables.seam.row-drag, versions.show-changes-marks, view.live-pointers.second-browser, wordart.tail.fill-outline; retries 0 configured, 0 test(s) retried; exit 1. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): brand; rows whose own controls a ship would keep parked: shapes.geometry.export.raster-modes (insert.shape.gallery); svg.export.pdf-vector (export.svg.vector); svg.export.pptx-svgblip (export.svg.vector); rows of an unparkable feature blocking the ship: export.download.progress-per-slide.

| Row | Feature | Driver | Today | Result | Reason |
| --- | --- | --- | --- | --- | --- |
| `images.export.pdf-with-picture` | images | core/export.spec.ts | works | passed |  |
| `shapes.export.pdf` | shapes | core/export.spec.ts | not driven | passed |  |
| `shapes.export.pptx` | shapes | core/export.spec.ts | not driven | passed |  |
| `export.pdf.file` | export | core/export.spec.ts | works | passed |  |
| `export.pdf.include-skipped` | export | core/export.spec.ts | works | passed |  |
| `export.pdf.notes-honest` | export | core/export.spec.ts | broken | passed |  |
| `export.pptx.perfect` | export | core/export.spec.ts | works | passed |  |
| `export.pptx.editable` | export | core/export.spec.ts | works | passed |  |
| `export.pptx.notes-and-skipped` | export | core/export.spec.ts | works | passed |  |
| `export.print.download-pdf-follows-preview` | export | core/export.spec.ts | broken | passed |  |
| `lines.connector.export-pptx` | lines | core/export.spec.ts | works | passed |  |
| `tables.export.pdf` | tables | core/export.spec.ts | works | passed |  |
| `tables.export.pptx-editable` | tables | core/export.spec.ts | broken | passed |  |
| `charts.export.pdf` | charts | core/export.spec.ts | not driven | passed |  |
| `charts.export.pptx-native` | charts | core/export.spec.ts | works | passed |  |
| `wordart.export.pdf` | wordart | core/export.spec.ts | works | passed |  |
| `export.zip.bundle` | export | core/export.spec.ts | works | passed |  |
| `export.html.web-page` | export | core/export.spec.ts | flaky | passed |  |
| `export.jpg.current-slide` | export | core/export.spec.ts | broken | passed |  |
| `export.png.current-slide` | export | core/export.spec.ts | broken | passed |  |
| `export.download.named-after-title` | export | core/export.spec.ts | broken | passed |  |
| `export.download.pdf-direct` | export | core/export.spec.ts | broken | passed |  |
| `export.download.pptx-direct` | export | core/export.spec.ts | broken | passed |  |
| `export.download.options-dialog` | export | core/export.spec.ts | not driven | passed |  |
| `export.download.progress-per-slide` | export | core/export.spec.ts | broken | failed | Error: a six slide deck |
| `export.download.mode-sentence` | export | core/export.spec.ts | not driven | passed |  |
| `export.download.large-deck-pdf` | export | core/export.spec.ts | broken | passed |  |
| `export.download.large-deck-pptx` | export | core/export.spec.ts | broken | passed |  |
| `brand.footer.text` | brand | core/export.spec.ts | not driven | passed |  |
| `brand.export.pdf-logo` | brand | core/export.spec.ts | not driven | failed | Error: no GT wordmark with a picture logo |
| `fonts.export.editable-names-face` | fonts | core/export.spec.ts | not driven | passed |  |
| `fonts.export.pdf-face` | fonts | core/export.spec.ts | not driven | passed |  |
| `shapes.geometry.text-rect` | shapes | core/export.spec.ts | broken | passed |  |
| `shapes.geometry.export.pptx-prst-avlst` | shapes | core/export.spec.ts | not driven | passed |  |
| `shapes.geometry.export.raster-modes` | shapes | core/export.spec.ts | not driven | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m |
| `diagrams.export.step-label` | diagrams | core/export.spec.ts | not driven | passed |  |
| `logos.export.pdf-pptx-crisp` | export | core/export.spec.ts | not driven | passed |  |
| `svg.export.pdf-vector` | svg | core/export.spec.ts | not driven | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m |
| `svg.export.pptx-svgblip` | svg | core/export.spec.ts | not driven | failed | TimeoutError: page.waitForEvent: Timeout 60000ms exceeded while waiting for event "download" |
| `svg.export.pptx-fallback` | svg | core/export.spec.ts | not driven | passed |  |
| `svg.export.web-page` | svg | core/export.spec.ts | not driven | passed |  |

## Not driven rows, by id and reason


## Failed rows, by id and reason

- `export.download.progress-per-slide`: Error: a six slide deck
- `brand.export.pdf-logo`: Error: no GT wordmark with a picture logo
- `shapes.geometry.export.raster-modes`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m
- `svg.export.pdf-vector`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m
- `svg.export.pptx-svgblip`: TimeoutError: page.waitForEvent: Timeout 60000ms exceeded while waiting for event "download"

## Measurement rows, by id (PRODUCT.md 8.2; the cost rows of SYNC.md 6.1)

- `export.download.large-deck-pdf`: passed; recorded PDF: GT brand deck.pdf, 85 slides in 11.1 s, 0.13 s per slide; PDF: GT brand deck.pdf, 85 slides in 11.1 s, 0.13 s per slide
- `export.download.large-deck-pptx`: passed; recorded Editable text PowerPoint with Embed fonts: GT brand deck (editable).pptx, 85 slides in 196.4 s, 2.31 s per slide; Editable text PowerPoint with Embed fonts: GT brand deck (editable).pptx, 85 slides in 196.4 s, 2.31 s per slide

