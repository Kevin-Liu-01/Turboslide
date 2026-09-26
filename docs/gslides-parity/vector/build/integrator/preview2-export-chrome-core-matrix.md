# Core gate matrix

Base https://turboslide-1ncbsb9tb-kl01s-projects.vercel.app, started 2026-09-25T05:43:03.597Z, 355 s. 45 rows judged: 10 passed, 2 failed, 33 not driven (0 of them manual, the checklist's: none), 0 no step. Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): export.download.large-deck-pdf not driven; export.download.large-deck-pptx not driven. Cost rows over their ceiling in this run: none. Verdict failed with the committed parked list inbox, templates and the parked rows arrange.group.tail-text-controls, logos.kit.find-a-logo, logos.picker.variants, tables.bar.row-column-buttons, tables.edge.add-row-column, tables.heads.select-row-column, tables.seam.row-drag, versions.show-changes-marks, view.live-pointers.second-browser, wordart.tail.fill-outline; retries 0 configured, 0 test(s) retried; exit 1. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): shapes, lines, tables, charts, diagrams, wordart, brand, fonts; rows whose own controls a ship would keep parked: export.zip.bundle (file.download.zip); export.html.web-page (file.download.html); export.jpg.current-slide (file.download.jpg); export.png.current-slide (file.download.png); shapes.geometry.export.pptx-prst-avlst (insert.shape.gallery, insert.shape.callouts); shapes.geometry.export.raster-modes (insert.shape.gallery); svg.export.pdf-vector (export.svg.vector); svg.export.pptx-svgblip (export.svg.vector); svg.export.pptx-fallback (export.svg.vector); svg.export.web-page (export.svg.vector); rows of an unparkable feature blocking the ship: images.export.pdf-with-picture, export.print.download-pdf-follows-preview, export.download.named-after-title, export.download.pdf-direct, export.download.pptx-direct, export.download.options-dialog, export.download.progress-per-slide, export.download.mode-sentence, logos.export.pdf-pptx-crisp.

| Row | Feature | Driver | Today | Result | Reason |
| --- | --- | --- | --- | --- | --- |
| `images.export.pdf-with-picture` | images | core/export.spec.ts | works | failed | Error: page.evaluate: Error: Vercel Blob: Failed to fetch blob: 403 Forbidden |
| `shapes.export.pdf` | shapes | core/export.spec.ts | not driven | failed | Error: page.evaluate: Error: Vercel Blob: Failed to fetch blob: 403 Forbidden |
| `shapes.export.pptx` | shapes | core/export.spec.ts | not driven | not driven | skipped |
| `export.pdf.file` | export | core/export.spec.ts | works | passed |  |
| `export.pdf.include-skipped` | export | core/export.spec.ts | works | passed |  |
| `export.pdf.notes-honest` | export | core/export.spec.ts | broken | passed |  |
| `export.pptx.perfect` | export | core/export.spec.ts | works | passed |  |
| `export.pptx.editable` | export | core/export.spec.ts | works | passed |  |
| `export.pptx.notes-and-skipped` | export | core/export.spec.ts | works | passed |  |
| `export.print.download-pdf-follows-preview` | export | core/export.spec.ts | broken | not driven | skipped |
| `lines.connector.export-pptx` | lines | core/export.spec.ts | works | not driven | skipped |
| `tables.export.pdf` | tables | core/export.spec.ts | works | not driven | skipped |
| `tables.export.pptx-editable` | tables | core/export.spec.ts | broken | not driven | skipped |
| `charts.export.pdf` | charts | core/export.spec.ts | not driven | not driven | skipped |
| `charts.export.pptx-native` | charts | core/export.spec.ts | works | not driven | skipped |
| `wordart.export.pdf` | wordart | core/export.spec.ts | works | not driven | skipped |
| `export.zip.bundle` | export | core/export.spec.ts | works | not driven | skipped |
| `export.html.web-page` | export | core/export.spec.ts | flaky | not driven | skipped |
| `export.jpg.current-slide` | export | core/export.spec.ts | broken | not driven | skipped |
| `export.png.current-slide` | export | core/export.spec.ts | broken | not driven | skipped |
| `slides.layout.plate-four-columns` | slides | core/chrome.spec.ts | broken | passed |  |
| `share.dialog.more-row` | share | core/chrome.spec.ts | broken | passed |  |
| `export.download.named-after-title` | export | core/export.spec.ts | broken | not driven | skipped |
| `export.download.pdf-direct` | export | core/export.spec.ts | broken | not driven | skipped |
| `export.download.pptx-direct` | export | core/export.spec.ts | broken | not driven | skipped |
| `export.download.options-dialog` | export | core/export.spec.ts | not driven | not driven | skipped |
| `export.download.progress-per-slide` | export | core/export.spec.ts | broken | not driven | skipped |
| `export.download.mode-sentence` | export | core/export.spec.ts | not driven | not driven | skipped |
| `export.download.large-deck-pdf` | export | core/export.spec.ts | broken | not driven | skipped |
| `export.download.large-deck-pptx` | export | core/export.spec.ts | broken | not driven | skipped |
| `chrome.toolbar.fold-any-width` | chrome | core/chrome.spec.ts | broken | passed |  |
| `brand.footer.text` | brand | core/export.spec.ts | not driven | not driven | skipped |
| `brand.export.pdf-logo` | brand | core/export.spec.ts | not driven | not driven | skipped |
| `fonts.export.editable-names-face` | fonts | core/export.spec.ts | not driven | not driven | skipped |
| `fonts.export.pdf-face` | fonts | core/export.spec.ts | not driven | not driven | skipped |
| `shapes.geometry.text-rect` | shapes | core/export.spec.ts | broken | not driven | skipped |
| `shapes.geometry.export.pptx-prst-avlst` | shapes | core/export.spec.ts | not driven | not driven | skipped |
| `shapes.geometry.export.raster-modes` | shapes | core/export.spec.ts | not driven | not driven | skipped |
| `diagrams.export.step-label` | diagrams | core/export.spec.ts | not driven | not driven | skipped |
| `logos.picker.chrome-1280` | logos | core/chrome.spec.ts | not driven | passed |  |
| `logos.export.pdf-pptx-crisp` | export | core/export.spec.ts | not driven | not driven | skipped |
| `svg.export.pdf-vector` | svg | core/export.spec.ts | not driven | not driven | skipped |
| `svg.export.pptx-svgblip` | svg | core/export.spec.ts | not driven | not driven | skipped |
| `svg.export.pptx-fallback` | svg | core/export.spec.ts | not driven | not driven | skipped |
| `svg.export.web-page` | svg | core/export.spec.ts | not driven | not driven | skipped |

## Not driven rows, by id and reason

- `shapes.export.pptx`: skipped
- `export.print.download-pdf-follows-preview`: skipped
- `lines.connector.export-pptx`: skipped
- `tables.export.pdf`: skipped
- `tables.export.pptx-editable`: skipped
- `charts.export.pdf`: skipped
- `charts.export.pptx-native`: skipped
- `wordart.export.pdf`: skipped
- `export.zip.bundle`: skipped
- `export.html.web-page`: skipped
- `export.jpg.current-slide`: skipped
- `export.png.current-slide`: skipped
- `export.download.named-after-title`: skipped
- `export.download.pdf-direct`: skipped
- `export.download.pptx-direct`: skipped
- `export.download.options-dialog`: skipped
- `export.download.progress-per-slide`: skipped
- `export.download.mode-sentence`: skipped
- `export.download.large-deck-pdf`: skipped
- `export.download.large-deck-pptx`: skipped
- `brand.footer.text`: skipped
- `brand.export.pdf-logo`: skipped
- `fonts.export.editable-names-face`: skipped
- `fonts.export.pdf-face`: skipped
- `shapes.geometry.text-rect`: skipped
- `shapes.geometry.export.pptx-prst-avlst`: skipped
- `shapes.geometry.export.raster-modes`: skipped
- `diagrams.export.step-label`: skipped
- `logos.export.pdf-pptx-crisp`: skipped
- `svg.export.pdf-vector`: skipped
- `svg.export.pptx-svgblip`: skipped
- `svg.export.pptx-fallback`: skipped
- `svg.export.web-page`: skipped

## Failed rows, by id and reason

- `images.export.pdf-with-picture`: Error: page.evaluate: Error: Vercel Blob: Failed to fetch blob: 403 Forbidden
- `shapes.export.pdf`: Error: page.evaluate: Error: Vercel Blob: Failed to fetch blob: 403 Forbidden

## Measurement rows, by id (PRODUCT.md 8.2; the cost rows of SYNC.md 6.1)

- `export.download.large-deck-pdf`: not driven (skipped)
- `export.download.large-deck-pptx`: not driven (skipped)

