# Core walk matrix

Base https://turboslide.vercel.app, started 2026-09-26T07:08:04.307Z, 3832 s, deck untitled-20260926-r3ok. 609 probe rows: 584 passed, 12 failed, 13 not driven, 0 no step. Verdict failed with the parked list inbox, templates; exit 1. A row passes only when every tagged step of it passed; a not driven row is never counted as passed.

| Row | Feature | Today | Result | Reason | Steps |
| --- | --- | --- | --- | --- | --- |
| `decks.new.draft` | decks | works | passed |  | 1 |
| `decks.new.ground-paint` | decks | flaky | passed |  | 2 |
| `decks.new.first-write` | decks | works | passed |  | 3 |
| `decks.title.save-words` | decks | works | passed |  | 5 |
| `decks.title.rename-enter` | decks | works | passed |  | 6 |
| `decks.title.rename-escape` | decks | works | passed |  | 7 |
| `decks.title.rename-blur` | decks | works | passed |  | 8 |
| `decks.title.rename-empty` | decks | works | passed |  | 9 |
| `decks.title.file-rename` | decks | works | passed |  | 10 |
| `decks.title.tab-title-after-rename` | decks | broken | passed |  | 11 |
| `decks.title.mark-to-list` | decks | works | passed |  | 12 |
| `decks.edit.reload-keeps-slide` | decks | works | passed |  | 13 |
| `decks.save.acknowledged` | decks | flaky | passed |  | 665 |
| `decks.editor.move-to-trash` | decks | works | passed |  | 666 |
| `slides.new.toolbar` | slides | works | passed |  | 17 |
| `slides.new.arrow-layout` | slides | works | passed |  | 18 |
| `slides.new.menu` | slides | works | passed |  | 19 |
| `slides.new.ctrl-m-card` | slides | works | passed |  | 20 |
| `slides.new.ctrl-m-canvas` | slides | works | passed |  | 21 |
| `slides.new.context` | slides | works | passed |  | 22 |
| `slides.new.undo` | slides | works | passed |  | 23 |
| `slides.duplicate.context` | slides | works | passed |  | 24 |
| `slides.duplicate.menu` | slides | works | passed |  | 25 |
| `slides.duplicate.cmd-d` | slides | works | passed |  | 26 |
| `slides.duplicate.undo-toolbar` | slides | works | passed |  | 27 |
| `slides.duplicate.undo-redo-keys` | slides | works | passed |  | 28 |
| `slides.duplicate.two-selected-cmd-d` | slides | works | passed |  | 29 |
| `slides.duplicate.two-selected-menu` | slides | works | passed |  | 30 |
| `slides.delete.key` | slides | works | passed |  | 31 |
| `slides.delete.undo-snackbar` | slides | works | passed |  | 32 |
| `slides.delete.context` | slides | works | passed |  | 33 |
| `slides.delete.undo-cmd-z` | slides | works | passed |  | 34 |
| `slides.delete.menu-undo-redo` | slides | works | passed |  | 35 |
| `slides.delete.two-selected-key-undo` | slides | works | passed |  | 36 |
| `slides.delete.two-selected-menu` | slides | broken | passed |  | 37 |
| `slides.delete.two-selected-edit-menu` | slides | broken | passed |  | 38 |
| `slides.delete.canvas-focus-undo` | slides | flaky | passed |  | 39 |
| `slides.delete.undo-redo-saved` | slides | flaky | passed |  | 40 |
| `slides.select.click` | slides | works | passed |  | 42 |
| `slides.select.arrows-shift` | slides | works | passed |  | 43 |
| `slides.select.shift-cmd-click` | slides | works | passed |  | 44 |
| `slides.select.cmd-click-toggle` | slides | works | passed |  | 45 |
| `slides.reorder.drag-above` | slides | works | passed |  | 47 |
| `slides.reorder.drag-below` | slides | works | passed |  | 49 |
| `slides.reorder.cmd-up-down` | slides | works | passed |  | 50 |
| `slides.reorder.menu-to-end-undo` | slides | works | passed |  | 51 |
| `slides.reorder.undo-drag` | slides | works | passed |  | 48 |
| `slides.reorder.two-selected-drag` | slides | works | passed |  | 54 |
| `slides.skip.context` | slides | works | passed |  | 56 |
| `slides.skip.context-two` | slides | works | passed |  | 58 |
| `slides.skip.menu-unskip` | slides | works | passed |  | 57 |
| `slides.skip.menu-two` | slides | works | passed |  | 59 |
| `slides.layout.picker-open-escape` | slides | works | passed |  | 61 |
| `slides.layout.apply.title` | slides | works | passed |  | 62 |
| `slides.layout.apply.opener` | slides | works | passed |  | 63 |
| `slides.layout.apply.split` | slides | works | passed |  | 64 |
| `slides.layout.apply.cols` | slides | works | passed |  | 65 |
| `slides.layout.apply.title-only` | slides | works | passed |  | 66 |
| `slides.layout.apply.one-column` | slides | works | passed |  | 67 |
| `slides.layout.apply.statement` | slides | works | passed |  | 68 |
| `slides.layout.apply.section-description` | slides | works | passed |  | 69 |
| `slides.layout.apply.mood` | slides | works | passed |  | 70 |
| `slides.layout.apply.big-number` | slides | works | passed |  | 71 |
| `slides.layout.apply.blank` | slides | works | passed |  | 72 |
| `slides.layout.apply.rows` | slides | works | passed |  | 73 |
| `slides.layout.apply.plain` | slides | works | passed |  | 74 |
| `slides.layout.apply.table` | slides | works | passed |  | 75 |
| `slides.layout.apply.figure` | slides | works | passed |  | 76 |
| `slides.layout.apply.pair` | slides | works | passed |  | 77 |
| `slides.layout.apply.tiles` | slides | works | passed |  | 78 |
| `slides.layout.apply.details` | slides | works | passed |  | 79 |
| `slides.layout.apply.board` | slides | works | passed |  | 80 |
| `slides.layout.apply.matrix` | slides | works | passed |  | 81 |
| `slides.layout.apply.closing` | slides | works | passed |  | 82 |
| `slides.layout.reopen-ring` | slides | works | passed |  | 83 |
| `slides.layout.context-apply` | slides | works | passed |  | 84 |
| `slides.layout.menu-apply-undo` | slides | works | passed |  | 85 |
| `slides.layout.fresh-slide-two-picks-no-carry` | slides | broken | passed |  | 86 |
| `slides.layout.typed-title-round-trip` | slides | works | passed |  | 87 |
| `slides.layout.snackbar-counts-typed-only` | slides | broken | passed |  | 88 |
| `slides.layout.undo-typed` | slides | works | passed |  | 89 |
| `slides.notes.type` | slides | works | passed |  | 91 |
| `slides.notes.per-slide` | slides | works | passed |  | 92 |
| `slides.notes.resize-handle` | slides | works | passed |  | 93 |
| `slides.notes.reload` | slides | works | passed |  | 94 |
| `slides.counter.footer-and-cards` | slides | works | passed |  | 97 |
| `slides.hash.click-and-reload` | slides | works | passed |  | 98 |
| `slides.reorder.menu-up-down-beginning` | slides | not driven | passed |  | 52 |
| `slides.reorder.cmd-shift-up-down` | slides | not driven | passed |  | 53 |
| `slides.notes.view-menu-toggle` | slides | not driven | passed |  | 95 |
| `slides.context.empty-canvas` | slides | not driven | passed |  | 99 |
| `text.title.single-click` | text | broken | passed |  | 106 |
| `text.title.double-click` | text | works | passed |  | 107 |
| `text.title.type-escape` | text | works | passed |  | 108 |
| `text.selected.typing-replaces` | text | not driven | passed |  | 109 |
| `text.selected.enter-appends` | text | not driven | passed |  | 110 |
| `text.title.double-click-enters` | text | not driven | passed |  | 111 |
| `text.caret.click-mid-word` | text | works | passed |  | 112 |
| `text.caret.home-end` | text | works | passed |  | 113 |
| `text.caret.shift-arrow-replace` | text | works | passed |  | 114 |
| `text.caret.shift-home-end` | text | works | passed |  | 115 |
| `text.caret.backspace-word` | text | works | passed |  | 116 |
| `text.caret.option-backspace` | text | works | passed |  | 117 |
| `text.caret.delete` | text | works | passed |  | 118 |
| `text.caret.cmd-a` | text | works | passed |  | 119 |
| `text.title.enter-commits` | text | works | passed |  | 120 |
| `text.session.escape-twice` | text | works | passed |  | 121 |
| `text.subtitle.double-click-type` | text | works | passed |  | 122 |
| `text.subtitle.enter-new-line` | text | works | passed |  | 123 |
| `text.subtitle.shift-enter` | text | works | passed |  | 124 |
| `text.subtitle.arrows-backspace-join` | text | works | passed |  | 125 |
| `text.subtitle.escape-commits` | text | works | passed |  | 126 |
| `text.textbox.insert-click-type` | text | works | passed |  | 128 |
| `text.textbox.insert-drag` | text | works | passed |  | 129 |
| `text.textbox.drag-inside-moves` | text | broken | passed |  | 130 |
| `text.textbox.burst-reliability` | text | broken | passed |  | 132 |
| `text.toolbar.swaps-on-select` | text | works | passed |  | 133 |
| `text.fontsize.type-enter` | text | works | passed |  | 134 |
| `text.fontsize.plus-minus` | text | works | passed |  | 135 |
| `text.bold.toolbar` | text | works | passed |  | 136 |
| `text.bold.cmd-b-word` | text | works | passed |  | 137 |
| `text.italic.toolbar-word` | text | broken | passed |  | 138 |
| `text.italic.cmd-i-word` | text | works | passed |  | 139 |
| `text.underline.cmd-u-word` | text | works | passed |  | 140 |
| `text.underline.toolbar` | text | works | passed |  | 142 |
| `text.strikethrough.cmd-shift-x` | text | works | passed |  | 141 |
| `text.strikethrough.menu` | text | works | passed |  | 143 |
| `text.color.swatch-on-word` | text | broken | passed |  | 144 |
| `text.align.toolbar-and-key` | text | works | passed |  | 145 |
| `text.spacing.toolbar` | text | works | passed |  | 146 |
| `text.list.bulleted-toolbar` | text | broken | passed |  | 147 |
| `text.list.numbered-toolbar` | text | broken | passed |  | 148 |
| `text.list.bulleted-menu-preset` | text | works | passed |  | 149 |
| `text.indent.toolbar` | text | works | passed |  | 152 |
| `text.indent.keys` | text | works | passed |  | 153 |
| `text.link.cmd-k-enter` | text | broken | passed |  | 154 |
| `text.clear-formatting` | text | works | passed |  | 156 |
| `text.format-menu.rows-enabled` | text | works | passed |  | 157 |
| `text.format-menu.size-increase` | text | works | passed |  | 158 |
| `text.format-menu.align-left` | text | works | passed |  | 160 |
| `text.format-menu.spacing-double` | text | works | passed |  | 162 |
| `text.format-menu.text-fitting` | text | not driven | passed |  | 164 |
| `text.autofit.title-wraps` | text | works | passed |  | 166 |
| `text.autofit.textbox-grow` | text | broken | passed |  | 167 |
| `text.clipboard.within-box` | text | works | passed |  | 168 |
| `text.clipboard.between-boxes` | text | works | passed |  | 169 |
| `text.clipboard.paste-without-formatting` | text | not driven | not driven | manual: headless Chromium does not synthesize Cmd+Shift+V as a paste; the step is docs/gslides-parity/focus/manual-checklist.md | 170 |
| `text.find-replace.replace-all` | text | works | passed |  | 171 |
| `text.find-replace.shortcut` | text | flaky | passed |  | 172 |
| `text.persistence.reload` | text | works | passed |  | 177 |
| `text.list.numbered-menu-preset` | text | not driven | passed |  | 150 |
| `text.list.chords` | text | not driven | passed |  | 151 |
| `text.link.toolbar-button` | text | not driven | passed |  | 155 |
| `text.format-options.panel` | text | not driven | passed |  | 165 |
| `text.layout-runs.type` | text | not driven | passed |  | 176 |
| `text.context.text-block` | text | not driven | passed |  | 173 |
| `text.context.text-selection` | text | not driven | passed |  | 174 |
| `text.context.inside-session` | text | broken | passed |  | 175 |
| `text.format-menu.size-decrease` | text | not driven | passed |  | 159 |
| `text.format-menu.spacing-single-1-15` | text | not driven | passed |  | 163 |
| `text.format-menu.align-indent-rows` | text | not driven | passed |  | 161 |
| `text.textbox.toolbar-button` | text | not driven | passed |  | 131 |
| `images.insert.toolbar-sources` | images | works | passed |  | 229 |
| `images.select.chip-handles-tail` | images | works | passed |  | 231 |
| `images.delete.key` | images | works | passed |  | 232 |
| `images.move.drag-frame` | images | works | passed |  | 233 |
| `images.guides.edge-snap` | images | works | passed |  | 235 |
| `images.guides.centre-y` | images | works | passed |  | 236 |
| `images.guides.centre-x` | images | flaky | passed |  | 237 |
| `images.nudge.arrows` | images | works | passed |  | 238 |
| `images.resize.eight-handles` | images | works | passed |  | 239 |
| `images.resize.eight-handles-shift` | images | works | passed |  | 240 |
| `images.resize.edge-fill` | images | broken | passed |  | 242 |
| `images.resize.alt-centre` | images | works | passed |  | 241 |
| `images.rotate.ring` | images | works | passed |  | 243 |
| `images.crop.double-click` | images | works | passed |  | 244 |
| `images.crop.east-edge` | images | works | passed |  | 245 |
| `images.crop.south-edge` | images | works | passed |  | 246 |
| `images.crop.enter` | images | works | passed |  | 247 |
| `images.crop.undo` | images | works | passed |  | 248 |
| `images.crop.redo` | images | works | passed |  | 249 |
| `images.crop.menu-escape` | images | works | passed |  | 250 |
| `images.crop.toolbar-escape-cancels` | images | broken | passed |  | 251 |
| `images.options.panel` | images | works | passed |  | 252 |
| `images.options.transparency` | images | works | passed |  | 253 |
| `images.options.reset` | images | works | passed |  | 254 |
| `images.reset-image.menu` | images | works | passed |  | 255 |
| `images.background.colour` | images | works | passed |  | 258 |
| `images.background.toolbar` | images | works | passed |  | 259 |
| `images.background.reset` | images | works | passed |  | 262 |
| `images.present.picture-and-ground` | images | works | passed |  | 261 |
| `images.context.image` | images | not driven | passed |  | 257 |
| `images.options.menu-row` | images | not driven | passed |  | 256 |
| `images.background.hex-field` | images | not driven | passed |  | 260 |
| `arrange.select.click` | arrange | works | passed |  | 269 |
| `arrange.select.shift-add` | arrange | works | passed |  | 270 |
| `arrange.multi.drag-inside-moves-all` | arrange | broken | passed |  | 271 |
| `arrange.select.shift-remove` | arrange | works | passed |  | 272 |
| `arrange.select.marquee` | arrange | works | passed |  | 273 |
| `arrange.select.marquee-partial` | arrange | works | passed |  | 274 |
| `arrange.select.click-away` | arrange | works | passed |  | 275 |
| `arrange.select.cmd-a` | arrange | works | passed |  | 276 |
| `arrange.select.escape` | arrange | works | passed |  | 277 |
| `arrange.order.bring-to-front` | arrange | works | passed |  | 278 |
| `arrange.order.send-to-back` | arrange | works | passed |  | 279 |
| `arrange.order.bring-forward` | arrange | works | passed |  | 280 |
| `arrange.order.send-backward` | arrange | works | passed |  | 281 |
| `arrange.order.keys` | arrange | works | passed |  | 282 |
| `arrange.align.left` | arrange | works | passed |  | 283 |
| `arrange.align.center` | arrange | works | passed |  | 284 |
| `arrange.align.right` | arrange | flaky | passed |  | 285 |
| `arrange.align.top` | arrange | broken | passed |  | 286 |
| `arrange.align.middle` | arrange | works | passed |  | 287 |
| `arrange.align.bottom` | arrange | broken | passed |  | 288 |
| `arrange.align.single-to-slide` | arrange | works | passed |  | 289 |
| `arrange.center.horizontal` | arrange | works | passed |  | 290 |
| `arrange.center.vertical` | arrange | works | passed |  | 291 |
| `arrange.undo.toolbar-on-arrange` | arrange | works | passed |  | 292 |
| `arrange.undo.menu-on-arrange` | arrange | works | passed |  | 293 |
| `arrange.clipboard.copy-paste` | arrange | works | passed |  | 294 |
| `arrange.clipboard.delete` | arrange | works | passed |  | 295 |
| `arrange.clipboard.undo-redo-delete` | arrange | works | passed |  | 296 |
| `arrange.clipboard.cut-paste-undo` | arrange | flaky | passed |  | 297 |
| `arrange.clipboard.menu-copy-paste` | arrange | flaky | passed |  | 298 |
| `arrange.clipboard.paste-after-new-slide-button` | arrange | broken | passed |  | 299 |
| `arrange.clipboard.paste-with-filmstrip-focus` | arrange | broken | passed |  | 300 |
| `arrange.clipboard.paste-keeps-position` | arrange | works | passed |  | 301 |
| `arrange.duplicate.cmd-d` | arrange | works | passed |  | 302 |
| `arrange.duplicate.menu-selects-copy` | arrange | broken | passed |  | 303 |
| `arrange.duplicate.nothing-selected` | arrange | works | passed |  | 304 |
| `arrange.redo.after-undone-duplicate` | arrange | broken | passed |  | 305 |
| `arrange.keys.backspace-empty-selection` | arrange | broken | passed |  | 306 |
| `arrange.nudge.arrows` | arrange | works | passed |  | 307 |
| `arrange.nudge.shift` | arrange | works | passed |  | 308 |
| `arrange.nudge.undo` | arrange | works | passed |  | 309 |
| `arrange.zoom.box-reads` | arrange | works | passed |  | 310 |
| `arrange.zoom.menu-in` | arrange | broken | passed |  | 315 |
| `arrange.zoom.cmd-minus` | arrange | broken | passed |  | 314 |
| `arrange.zoom.cmd-plus` | arrange | broken | passed |  | 313 |
| `arrange.zoom.fit` | arrange | flaky | passed |  | 317 |
| `arrange.zoom.type-percent` | arrange | works | passed |  | 311 |
| `arrange.zoom.arrow-menu` | arrange | works | passed |  | 318 |
| `arrange.zoom.cmd-0` | arrange | works | passed |  | 312 |
| `arrange.zoom.menu-out` | arrange | broken | passed |  | 316 |
| `arrange.readout.fit` | arrange | works | passed |  | 320 |
| `arrange.readout.200` | arrange | works | passed |  | 321 |
| `arrange.selection-colour.light` | arrange | works | passed |  | 323 |
| `arrange.selection-colour.dark` | arrange | works | passed |  | 322 |
| `arrange.escape.text-then-selection` | arrange | works | passed |  | 324 |
| `arrange.zoom.menu-presets` | arrange | not driven | passed |  | 319 |
| `arrange.toolbar.select` | arrange | not driven | passed |  | 325 |
| `shapes.insert.rectangle-click` | shapes | works | passed |  | 354 |
| `shapes.insert.rounded-click` | shapes | works | passed |  | 355 |
| `shapes.insert.ellipse-click` | shapes | works | passed |  | 356 |
| `shapes.insert.rectangle-drag` | shapes | works | passed |  | 357 |
| `shapes.insert.ellipse-drag` | shapes | works | passed |  | 358 |
| `shapes.insert.named-rows` | shapes | not driven | passed |  | 359 |
| `shapes.default-look` | shapes | broken | passed |  | 360 |
| `shapes.select` | shapes | works | passed |  | 361 |
| `shapes.move` | shapes | not driven | passed |  | 362 |
| `shapes.resize.eight-handles` | shapes | not driven | passed |  | 363 |
| `shapes.rotate` | shapes | not driven | passed |  | 364 |
| `shapes.fill.colour` | shapes | not driven | passed |  | 365 |
| `shapes.border.colour-weight-dash` | shapes | not driven | passed |  | 366 |
| `shapes.text.type-align-bold` | shapes | not driven | passed |  | 367 |
| `shapes.duplicate-delete-undo-redo` | shapes | not driven | passed |  | 368 |
| `shapes.format-options.size-position` | shapes | not driven | passed |  | 369 |
| `shapes.reload-and-viewer` | shapes | not driven | passed |  | 371 |
| `shapes.context.shape` | shapes | not driven | passed |  | 370 |
| `lines.insert.line-drag` | lines | not driven | passed |  | 400 |
| `lines.insert.arrow-drag` | lines | not driven | passed |  | 401 |
| `lines.end-handle` | lines | not driven | passed |  | 402 |
| `lines.tail.colour-weight-dash-ends` | lines | not driven | passed |  | 403 |
| `lines.context.line` | lines | not driven | passed |  | 404 |
| `share.file-menu-share-with-others` | share | not driven | passed |  | 505 |
| `versions.open-from-last-edit` | versions | works | passed |  | 506 |
| `versions.pick` | versions | works | passed |  | 507 |
| `versions.name-current` | versions | works | passed |  | 508 |
| `versions.undo-restore` | versions | not driven | passed |  | 509 |
| `export.download-submenu` | export | works | passed |  | 516 |
| `export.pdf.dialog` | export | works | passed |  | 517 |
| `export.pdf.skipped-check` | export | works | passed |  | 518 |
| `export.pdf.close-paths` | export | works | passed |  | 519 |
| `export.pptx.dialog` | export | works | passed |  | 520 |
| `export.print.preview-page` | export | works | passed |  | 523 |
| `export.print.layout-with-notes` | export | works | passed |  | 524 |
| `export.print.include-skipped` | export | works | passed |  | 525 |
| `export.print.print-button` | export | works | passed |  | 526 |
| `export.print.close-preview` | export | works | passed |  | 527 |
| `export.print.file-menu-after-close` | export | flaky | passed |  | 528 |
| `export.print.menu-row` | export | works | passed |  | 529 |
| `export.print.cmd-p` | export | works | passed |  | 530 |
| `help.help-dialog` | help | works | passed |  | 531 |
| `help.documentation-link` | help | broken | passed |  | 532 |
| `help.keyboard-shortcuts` | help | works | passed |  | 533 |
| `help.search-the-menus` | help | works | passed |  | 534 |
| `surface.menus.open-close-escape` | surface | not driven | passed |  | 664 |
| `surface.cleanup` | surface | works | passed |  | 667 |
| `shapes.text.colour-toolbar` | shapes | broken | passed |  | 372 |
| `shapes.text.enter-opens-label` | shapes | works | passed |  | 373 |
| `shapes.borders-lines.menu` | shapes | works | passed |  | 374 |
| `lines.connector.elbow` | lines | works | passed |  | 406 |
| `lines.connector.curved` | lines | works | passed |  | 407 |
| `lines.connector.re-end` | lines | not driven | passed |  | 408 |
| `lines.insert.arrow-head` | lines | works | passed |  | 409 |
| `lines.tail.line-start-end-menu` | lines | not driven | passed |  | 410 |
| `tables.insert.grid` | tables | works | passed |  | 413 |
| `tables.cell.double-click-type` | tables | works | passed |  | 414 |
| `tables.cell.tab-from-written` | tables | broken | passed |  | 415 |
| `tables.cell.tab-from-empty` | tables | works | passed |  | 416 |
| `tables.cell.shift-tab` | tables | not driven | passed |  | 417 |
| `tables.cell.tab-last-appends-row` | tables | works | passed |  | 418 |
| `tables.menu.format-table-with-session` | tables | broken | passed |  | 419 |
| `tables.menu.format-table-selected` | tables | broken | passed |  | 420 |
| `tables.menu.format-table-rows` | tables | not driven | passed |  | 421 |
| `tables.context.rows` | tables | works | passed |  | 422 |
| `tables.context.insert-delete` | tables | works | passed |  | 423 |
| `tables.column.insert-keeps-widths` | tables | broken | passed |  | 424 |
| `tables.column.resize-seam` | tables | not driven | passed |  | 425 |
| `tables.cell.align-menu` | tables | broken | passed |  | 426 |
| `tables.cell.align-toolbar` | tables | broken | passed |  | 427 |
| `tables.select.resize` | tables | works | passed |  | 428 |
| `tables.cell.fill-border-tail` | tables | not driven | passed |  | 429 |
| `tables.cells.merge-unmerge` | tables | not driven | passed |  | 430 |
| `tables.tail.merge-unmerge-buttons` | tables | not driven | passed |  | 431 |
| `tables.distribute.rows-columns` | tables | not driven | passed |  | 432 |
| `tables.light-appearance` | tables | not driven | passed |  | 433 |
| `tables.present` | tables | works | passed |  | 434 |
| `tables.reload` | tables | works | passed |  | 435 |
| `charts.insert.bar` | charts | works | passed |  | 459 |
| `charts.insert.column` | charts | works | passed |  | 460 |
| `charts.insert.line` | charts | works | passed |  | 461 |
| `charts.insert.pie` | charts | works | passed |  | 462 |
| `charts.select.tail` | charts | works | passed |  | 463 |
| `charts.resize` | charts | works | passed |  | 464 |
| `charts.type.panel-legible` | charts | broken | passed |  | 465 |
| `charts.type.toolbar` | charts | not driven | passed |  | 466 |
| `charts.type.menu` | charts | not driven | passed |  | 467 |
| `charts.data.add-series-category` | charts | works | passed |  | 468 |
| `charts.data.edit-cell` | charts | works | passed |  | 469 |
| `charts.data.toolbar-edit-data` | charts | not driven | passed |  | 470 |
| `charts.data.menu-edit-data` | charts | not driven | passed |  | 471 |
| `charts.legend.toolbar` | charts | not driven | passed |  | 472 |
| `charts.number-format.toolbar` | charts | not driven | passed |  | 473 |
| `charts.context` | charts | not driven | passed |  | 474 |
| `charts.light-appearance` | charts | not driven | passed |  | 475 |
| `charts.present` | charts | works | passed |  | 476 |
| `charts.reload` | charts | works | passed |  | 477 |
| `diagrams.panel` | diagrams | works | passed |  | 488 |
| `diagrams.insert.group` | diagrams | works | passed |  | 489 |
| `diagrams.select-move` | diagrams | works | passed |  | 490 |
| `diagrams.edit-label` | diagrams | not driven | passed |  | 491 |
| `diagrams.light-appearance` | diagrams | not driven | passed |  | 492 |
| `diagrams.present` | diagrams | works | passed |  | 493 |
| `diagrams.reload` | diagrams | not driven | passed |  | 494 |
| `wordart.insert` | wordart | works | passed |  | 500 |
| `wordart.edit` | wordart | not driven | passed |  | 501 |
| `wordart.light-appearance` | wordart | not driven | passed |  | 502 |
| `formatting.superscript.chord` | formatting | works | passed |  | 200 |
| `formatting.subscript.chord` | formatting | works | passed |  | 201 |
| `formatting.superscript.menu-word` | formatting | broken | passed |  | 202 |
| `formatting.subscript.menu-word` | formatting | broken | passed |  | 203 |
| `formatting.italic.menu-word` | formatting | broken | passed |  | 204 |
| `formatting.context.selection-rows` | formatting | not driven | passed |  | 205 |
| `formatting.capitalization.upper` | formatting | works | passed |  | 206 |
| `formatting.capitalization.lower` | formatting | works | passed |  | 207 |
| `formatting.capitalization.title` | formatting | works | passed |  | 208 |
| `formatting.align.justified-menu` | formatting | works | passed |  | 209 |
| `formatting.align.justified-chord` | formatting | works | passed |  | 210 |
| `formatting.align.toolbar-justify` | formatting | not driven | passed |  | 211 |
| `formatting.spacing.add-before-remove` | formatting | works | passed |  | 212 |
| `formatting.spacing.add-after` | formatting | works | passed |  | 213 |
| `formatting.spacing.custom-dialog` | formatting | works | passed |  | 214 |
| `formatting.spacing.1-15-value` | formatting | broken | passed |  | 215 |
| `formatting.highlight.word` | formatting | works | passed |  | 216 |
| `formatting.paint-format.button` | formatting | works | passed |  | 218 |
| `formatting.paint-format.chords` | formatting | not driven | passed |  | 219 |
| `formatting.clear.inline-marks` | formatting | broken | passed |  | 220 |
| `formatting.theme.panel-appearance` | formatting | works | passed |  | 221 |
| `formatting.theme.toolbar-button` | formatting | works | passed |  | 222 |
| `formatting.theme.import-hidden` | formatting | not driven | passed |  | 223 |
| `formatting.persistence` | formatting | works | passed |  | 224 |
| `text.title.one-click-tail` | text | broken | passed |  | 178 |
| `text.title.bold-menu` | text | broken | passed |  | 179 |
| `text.title.bold-cmd-b` | text | broken | passed |  | 180 |
| `text.title.align-menu` | text | broken | passed |  | 181 |
| `text.title.size-menu` | text | broken | passed |  | 182 |
| `text.title.format-options-marks` | text | broken | passed |  | 183 |
| `text.title.apply-layout-after-format` | text | not driven | passed |  | 184 |
| `text.fontsize.type-one-undo` | text | broken | passed |  | 185 |
| `text.format-options.field-one-undo` | text | broken | passed |  | 186 |
| `arrange.distribute.horizontal` | arrange | works | passed |  | 326 |
| `arrange.distribute.vertical` | arrange | works | passed |  | 327 |
| `arrange.distribute.needs-three` | arrange | works | passed |  | 328 |
| `arrange.rotate.quarter-turns` | arrange | works | passed |  | 329 |
| `arrange.rotate.flips-menu` | arrange | works | passed |  | 330 |
| `arrange.group.chords` | arrange | works | passed |  | 331 |
| `arrange.group.menu-regroup` | arrange | works | passed |  | 332 |
| `arrange.group.context-rows` | arrange | not driven | passed |  | 333 |
| `arrange.context.rotate-distribute` | arrange | not driven | passed |  | 334 |
| `arrange.ruler.show-hide` | arrange | works | passed |  | 335 |
| `arrange.guides.from-ruler` | arrange | works | passed |  | 336 |
| `arrange.guides.show-toggle` | arrange | works | passed |  | 337 |
| `arrange.guides.add-vertical-horizontal` | arrange | works | passed |  | 338 |
| `arrange.guides.drag` | arrange | flaky | passed |  | 339 |
| `arrange.snap.guides-on-off` | arrange | works | passed |  | 340 |
| `arrange.snap.grid-toggle` | arrange | works | passed |  | 341 |
| `arrange.snap.grid-effect` | arrange | not driven | passed |  | 342 |
| `arrange.guides.context` | arrange | works | passed |  | 343 |
| `arrange.guides.clear` | arrange | works | passed |  | 344 |
| `arrange.select-none.menu` | arrange | works | passed |  | 345 |
| `chrome.split.one-box` | chrome | broken | passed |  | 627 |
| `chrome.split.hover-no-inversion` | chrome | broken | passed |  | 628 |
| `chrome.split.click-show` | chrome | works | passed |  | 629 |
| `chrome.split.chevron-menu-aligned` | chrome | broken | passed |  | 630 |
| `chrome.split.enter-chevron` | chrome | broken | passed |  | 631 |
| `chrome.split.enter-label` | chrome | broken | passed |  | 632 |
| `chrome.split.space-both` | chrome | works | passed |  | 633 |
| `chrome.split.arrow-down-label` | chrome | broken | passed |  | 634 |
| `chrome.split.tab-order` | chrome | flaky | passed |  | 635 |
| `chrome.split.aria` | chrome | broken | passed |  | 636 |
| `chrome.split.collapse-900` | chrome | broken | passed |  | 637 |
| `chrome.separators.once` | chrome | broken | passed |  | 638 |
| `chrome.separators.toolbar-dividers` | chrome | works | passed |  | 639 |
| `chrome.cluster.gaps-heights` | chrome | broken | passed |  | 640 |
| `chrome.comments-glyph.toggle` | chrome | broken | passed |  | 641 |
| `view.appearance.rows` | view | works | passed |  | 538 |
| `view.show-filmstrip` | view | works | passed |  | 539 |
| `view.mode.rows` | view | works | passed |  | 540 |
| `view.mode.viewing-hides-toolbar` | view | broken | passed |  | 541 |
| `view.full-screen` | view | works | passed |  | 542 |
| `view.hide-menus-chevron` | view | not driven | passed |  | 543 |
| `view.live-pointers.toggles` | view | works | passed |  | 544 |
| `view.comments.radios` | view | works | passed |  | 545 |
| `view.comments.show-all-panel` | view | broken | passed |  | 546 |
| `view.comments.modes-markers` | view | not driven | passed |  | 547 |
| `decks.name.follows-heading` | decks | broken | passed |  | 4 |
| `decks.file.open-list-search` | decks | works | failed | File > Open; read the list; type in the search; clear it: 88 decks listed after 1236 ms, first untitled-20260926-78f3; filtered by nonsense 0; cleared 88 | 14 |
| `decks.file.import-slides-deck` | decks | works | passed |  | 15 |
| `decks.file.details` | decks | works | passed |  | 16 |
| `slides.numbers.apply` | slides | not driven | passed |  | 100 |
| `versions.show-changes-toggle` | versions | works | passed |  | 510 |
| `versions.show-changes-marks` | versions | not driven | failed | a heading edit and an added box after the named version; pick the older version with Show changes on; then off: picked versionHistory.964.pick (named row versionHistory.964.pick); marks with Show changes on 0 (); off 0 | 511 |
| `help.check-slides` | help | works | passed |  | 535 |
| `inbox.bell-panel-toggle` | inbox | broken | failed | click the bell; read the panel; click the bell again: with the switch on; panel open true (aria-pressed true); words "NotificationsMark all readNothing newNotification settings"; Mark all read true; settings link true; panel still open after the second click true (aria-pressed true) | 624 |
| `inbox.settings-persist` | inbox | broken | failed | Tools > Notification settings, None, Save; reopen; reload: level forYou -> picked none; Save closed true; reopened none; after a reload forYou | 625 |
| `arrange.insert.selected-after-menu` | arrange | broken | passed |  | 347 |
| `arrange.insert.free-rectangle` | arrange | not driven | passed |  | 348 |
| `slides.layout.title-and-body-single` | slides | broken | passed |  | 101 |
| `slides.layout.subtitle-prompt` | slides | not driven | passed |  | 102 |
| `slides.layout.new-slide-inherits` | slides | not driven | passed |  | 103 |
| `slides.layout.tile-sentences` | slides | broken | passed |  | 104 |
| `slides.import.none-preselected` | slides | broken | passed |  | 105 |
| `text.link.detect-url` | text | broken | failed | type generaltranslation.com then a space at the end of the box; Cmd+Z: text "Visit the site for the terms generaltranslation.com"; link "generaltranslation.com" -> https://generaltranslation.com; after Cmd+Z link gone, text "Visit the site for the terms g" | 188 |
| `text.link.detect-email` | text | broken | passed |  | 189 |
| `text.select.double-click-address` | text | broken | passed |  | 190 |
| `text.select.shift-home-line` | text | broken | passed |  | 191 |
| `text.link.popover-apply-remove` | text | broken | passed |  | 192 |
| `text.format-options.padding-grid` | text | broken | passed |  | 194 |
| `text.format-options.remembers-section` | text | not driven | passed |  | 195 |
| `text.autofit.shrink-on-overflow` | text | not driven | passed |  | 196 |
| `text.find-replace.count-while-typing` | text | broken | passed |  | 197 |
| `images.caption.add` | images | not driven | passed |  | 263 |
| `images.options.picture-sections-only` | images | broken | passed |  | 264 |
| `images.transparency.slider` | images | broken | passed |  | 265 |
| `images.border.drawn` | images | broken | passed |  | 266 |
| `formatting.alt-text.write-undo` | formatting | works | passed |  | 225 |
| `comments.panel.empty-gesture` | comments | broken | passed |  | 515 |
| `versions.panel.author-you` | versions | broken | passed |  | 513 |
| `versions.field.square` | versions | broken | passed |  | 514 |
| `help.shortcuts.no-duplicates` | help | broken | passed |  | 536 |
| `help.shortcuts.question-key` | help | broken | passed |  | 537 |
| `chrome.bottom-bar.removed` | chrome | broken | passed |  | 642 |
| `chrome.menu.no-tooltip-with-submenu` | chrome | broken | passed |  | 643 |
| `chrome.menu.escape-focus-stage` | chrome | broken | passed |  | 644 |
| `chrome.presence.tooltip` | chrome | broken | passed |  | 645 |
| `chrome.contrast.titanium-light` | chrome | broken | passed |  | 646 |
| `chrome.disabled.token-both-appearances` | chrome | not driven | passed |  | 647 |
| `chrome.field.boundary-3-1` | chrome | broken | passed |  | 648 |
| `chrome.hover.ground` | chrome | broken | passed |  | 649 |
| `chrome.floating.edge-frame` | chrome | broken | passed |  | 650 |
| `chrome.focus.one-ring-rule` | chrome | broken | passed |  | 651 |
| `chrome.filmstrip.one-ring` | chrome | broken | passed |  | 652 |
| `chrome.tooltip.none-on-focus-in-menus` | chrome | broken | passed |  | 653 |
| `chrome.menu.plate-fits-labels` | chrome | broken | passed |  | 654 |
| `chrome.menu.no-mnemonics-mac` | chrome | broken | passed |  | 655 |
| `chrome.select.one-rule` | chrome | broken | passed |  | 656 |
| `chrome.check.draws-check` | chrome | broken | passed |  | 657 |
| `chrome.toolbar.bold-follows-selection` | chrome | broken | passed |  | 658 |
| `menus.icons.insert-rows` | chrome | broken | failed | open the Insert menu with the switch on and read every row of docs/VECTOR.md 3.2, the submenus hovered: 43 rows read (switch on true); 38 of 39 named rows draw a glyph; missing: insert.material not drawn; drawn optional rows insert.audio, insert.video, insert.shader missing none | 659 |
| `menus.icons.format-rows` | chrome | broken | passed |  | 661 |
| `menus.icons.one-family` | chrome | works | passed |  | 662 |
| `brand.panel.opens` | brand | not driven | passed |  | 550 |
| `brand.logo.use-on-every-slide` | brand | not driven | passed |  | 552 |
| `brand.logo.remove` | brand | not driven | passed |  | 553 |
| `brand.colors.primary-live` | brand | not driven | passed |  | 554 |
| `brand.colors.palette-row` | brand | broken | passed |  | 555 |
| `brand.colors.control-ids-unique` | brand | broken | passed |  | 556 |
| `brand.colors.version-history-entry` | brand | not driven | passed |  | 557 |
| `brand.colors.role-tooltips` | brand | not driven | passed |  | 558 |
| `brand.background.enter-keeps-open` | brand | broken | failed | Slide > Change background, type #0b3d91, Enter, Done; then Add to theme: the deck back: no control dialog.background.close | 559 |
| `brand.fonts.roles` | brand | not driven | passed |  | 560 |
| `brand.counter.format` | brand | not driven | passed |  | 561 |
| `brand.reset.default-kit` | brand | not driven | passed |  | 562 |
| `brand.layout.tiles-in-kit` | brand | broken | passed |  | 563 |
| `brand.agent.set-get` | brand | not driven | passed |  | 564 |
| `fonts.dropdown.opens` | fonts | not driven | passed |  | 568 |
| `fonts.dropdown.apply-selection` | fonts | not driven | passed |  | 569 |
| `fonts.dropdown.search` | fonts | not driven | passed |  | 570 |
| `fonts.format-menu.row` | fonts | not driven | passed |  | 571 |
| `fonts.more-fonts.licence` | fonts | not driven | passed |  | 572 |
| `fonts.face.reload-and-show` | fonts | not driven | passed |  | 573 |
| `fonts.agent.font-list` | fonts | not driven | passed |  | 574 |
| `assist.entry.title-row` | assist | not driven | passed |  | 616 |
| `assist.panel.first-line-and-cards` | assist | not driven | passed |  | 617 |
| `assist.tailor.dialog-one-undo` | assist | not driven | passed |  | 618 |
| `assist.tailor.agent-deck-tailor` | assist | not driven | passed |  | 619 |
| `assist.outside-write.snackbar` | assist | broken | passed |  | 620 |
| `assist.finder.terms` | assist | broken | passed |  | 621 |
| `assist.finder.ask-row` | assist | not driven | passed |  | 622 |
| `assist.agent.propose-accept` | assist | not driven | failed | assist.propose over HTTP, assist.accept with the card, then the card with one byte changed: assist.propose answered 500 {"error":{"name":"AssistUnavailableError","status":500,"message":"The assistant is not set up on this Turboslide yet","action":"assist.propose"}} | 623 |
| `charts.grid.type-to-edit` | charts | broken | passed |  | 478 |
| `charts.grid.escape-stays` | charts | broken | passed |  | 479 |
| `tables.cell.click-places-caret` | tables | broken | passed |  | 438 |
| `tables.cell.click-then-type` | tables | broken | passed |  | 440 |
| `tables.range.drag-from-selected` | tables | not driven | passed |  | 441 |
| `shapes.label.centred-default` | shapes | broken | passed |  | 375 |
| `shapes.geometry.shapes.hexagon-sheet` | shapes | broken | passed |  | 378 |
| `shapes.geometry.shapes.star5-adjust` | shapes | not driven | passed |  | 379 |
| `shapes.geometry.shapes.pie-arc` | shapes | broken | passed |  | 381 |
| `shapes.geometry.shapes.multipath-can` | shapes | broken | passed |  | 382 |
| `shapes.geometry.shapes.flowchart-own-space` | shapes | broken | passed |  | 383 |
| `shapes.geometry.arrows.right-arrow` | shapes | broken | passed |  | 385 |
| `shapes.geometry.arrows.curved-right` | shapes | broken | passed |  | 386 |
| `shapes.geometry.callouts.wedge-rect` | shapes | broken | passed |  | 388 |
| `shapes.geometry.callouts.cloud` | shapes | broken | passed |  | 389 |
| `shapes.geometry.equation.plus-divide` | shapes | broken | passed |  | 391 |
| `shapes.geometry.pinned-three` | shapes | works | passed |  | 392 |
| `shapes.geometry.sites` | shapes | broken | passed |  | 394 |
| `shapes.geometry.resize-keeps-adjust` | shapes | not driven | passed |  | 380 |
| `shapes.insert.grid-shapes` | shapes | broken | passed |  | 377 |
| `shapes.insert.grid-arrows` | shapes | broken | passed |  | 384 |
| `shapes.insert.grid-callouts` | shapes | broken | passed |  | 387 |
| `shapes.insert.grid-equation` | shapes | broken | passed |  | 390 |
| `shapes.icons.named-rows` | shapes | broken | passed |  | 395 |
| `shapes.change-shape.plate` | shapes | not driven | passed |  | 396 |
| `shapes.mask-image.plate` | shapes | not driven | passed |  | 398 |
| `tables.selected.typing-appends` | tables | broken | passed |  | 442 |
| `tables.cell.arrows-cross-cells` | tables | not driven | passed |  | 443 |
| `tables.range.shift-arrows` | tables | not driven | passed |  | 444 |
| `diagrams.label.double-click-opens` | diagrams | broken | passed |  | 495 |
| `diagrams.label.tab-next` | diagrams | not driven | passed |  | 496 |
| `charts.double-click.opens-data` | charts | broken | passed |  | 480 |
| `charts.mark.click-selects-cell` | charts | not driven | passed |  | 481 |
| `tables.range.bold-italic` | tables | broken | passed |  | 445 |
| `tables.range.size-color` | tables | not driven | passed |  | 446 |
| `diagrams.step.one-object` | diagrams | broken | passed |  | 497 |
| `charts.legend.none-from-toolbar` | charts | broken | passed |  | 482 |
| `charts.panel.no-duplicate-controls` | charts | broken | passed |  | 483 |
| `charts.grid.remove-visible` | charts | broken | passed |  | 484 |
| `tables.panel.table-first` | tables | broken | passed |  | 447 |
| `tables.seam.row-drag` | tables | not driven | not driven | not on this build: handle.table.row (docs/PRODUCT.md 7.1, B3); the selected table shows 3 seam handle(s) (column.0, column.1, column.2) and no row seam (P1, FEATURES.md 2.3 item 1) | 448 |
| `tables.edge.add-row-column` | tables | not driven | not driven | not on this build: handle.table.add.column (docs/PRODUCT.md 7.1, B3); no "+" on the right or the bottom edge of the selected table (P1, FEATURES.md 2.3 item 2) | 449 |
| `tables.heads.select-row-column` | tables | not driven | not driven | not on this build: handle.table.head.column (docs/PRODUCT.md 7.1, B3); no hover band above the columns of the selected table (P1, FEATURES.md 2.3 item 2) | 450 |
| `tables.bar.row-column-buttons` | tables | not driven | not driven | not on this build: bar.table (docs/PRODUCT.md 7.1, B3); no bar under the selected table (P1, FEATURES.md 2.3 item 3) | 451 |
| `brand.objects.kit-colours-first` | brand | not driven | not driven | not on this build: formatOptions.chart.swatches.primary (docs/PRODUCT.md 7.1, B3); the chart's series swatches list formatOptions.chart.swatches.ink, formatOptions.chart.swatches.paper, formatOptions.chart.swatches.ink-2, formatOptions.chart.swatches.titanium, formatOptions.chart.swatches.hair, formatOptions.chart.swatches.hair-soft first and no kit role (P1, FEATURES.md 2.3 item 4); table fill pl | 565 |
| `arrange.group.tail-text-controls` | arrange | not driven | not driven | not on this build: toolbar.group.text (docs/PRODUCT.md 7.1, B3); chip "Group"; the group tail lists toolbar.fillColor, toolbar.borderColor, toolbar.borderWeight, toolbar.borderDash, toolbar.formatOptions and none of the text controls (P1, FEATURES.md 2.3 item 6) | 351 |
| `tables.command.keeps-caret` | tables | broken | passed |  | 452 |
| `wordart.resize.scales-letters` | wordart | broken | passed |  | 503 |
| `tables.cells.prompt-hovered-only` | tables | broken | passed |  | 456 |
| `wordart.tail.fill-outline` | wordart | not driven | not driven | not on this build: toolbar.wordart.outline (docs/PRODUCT.md 7.1, B3); the word art's tail is the text tail with none of Fill color, Border color, Border weight, Border dash (P1, FEATURES.md 2.3 item 10); tail toolbar.font, toolbar.fontSize, toolbar.fontSize.minus, toolbar.fontSize.value, toolbar.fontSize.plus, toolbar.bold, toolbar.italic, toolbar.underline, toolbar.textColor, toolbar.highlightCol | 504 |
| `fonts.links.licence-v4-1` | fonts | broken | passed |  | 575 |
| `fonts.fallback.in-stack` | fonts | broken | passed |  | 576 |
| `fonts.display-features.inter-only` | fonts | not driven | passed |  | 577 |
| `tables.cells.tabular-figures` | tables | broken | passed |  | 453 |
| `formatting.numerals.tabular-row` | formatting | not driven | passed |  | 227 |
| `fonts.catalog.geist` | fonts | not driven | passed |  | 578 |
| `fonts.catalog.six-families` | fonts | not driven | passed |  | 579 |
| `fonts.picker.search-category` | fonts | not driven | passed |  | 580 |
| `fonts.table.takes-family` | fonts | not driven | not driven | not on this build: toolbar.font (docs/PRODUCT.md 7.1, B1); the Font control on a selected table is drawn disabled ("Inter"); takesFamily is P1 (FEATURES.md 3.5) | 581 |
| `logos.insert.row` | logos | not driven | passed |  | 583 |
| `logos.picker.search` | logos | not driven | passed |  | 584 |
| `logos.picker.paper-and-ink` | logos | not driven | passed |  | 585 |
| `logos.picker.your-brand` | logos | not driven | passed |  | 586 |
| `logos.picker.empty-state` | logos | not driven | passed |  | 587 |
| `logos.picker.licence-words` | logos | not driven | passed |  | 588 |
| `logos.insert.one-click-asset` | logos | not driven | passed |  | 589 |
| `logos.insert.logo-size` | logos | not driven | passed |  | 590 |
| `logos.insert.mono-tint` | logos | not driven | passed |  | 591 |
| `logos.insert.every-slide` | logos | not driven | passed |  | 592 |
| `logos.tailor.find-customer-logo` | logos | not driven | passed |  | 593 |
| `logos.replace-image.row` | logos | not driven | passed |  | 594 |
| `logos.picker.variants` | logos | not driven | not driven | not on this build: dialog.logo.kind.wordmark (docs/PRODUCT.md 7.1, B1); no Symbol, Wordmark, Color or Mono control in the dialog head (P1, FEATURES.md 4.11; the appearance rule chooses) | 595 |
| `logos.kit.find-a-logo` | logos | not driven | not driven | not on this build: panel.brand.logo.find (docs/PRODUCT.md 7.1, B6); no Find a logo beside Replace in the Brand kit panel's Logo section (P1, FEATURES.md 4.5) | 596 |
| `logos.intake.url-sentence` | images | broken | passed |  | 597 |
| `shaders.insert.gallery-thumbnails` | shaders | not driven | passed |  | 600 |
| `shaders.insert.selected-free-rectangle` | shaders | broken | passed |  | 601 |
| `shaders.insert.words` | shaders | broken | passed |  | 602 |
| `shaders.panel.slider-live-undo` | shaders | not driven | passed |  | 603 |
| `shaders.panel.preset-tiles` | shaders | broken | failed | read the Preset row's tiles; click a tile that is not pressed: 10 tiles ("Paper on ink", "Ink on paper", "Primary", "Accent", "Captions", "Hints", "Diamond" pressed, "Sphere", "Chrome", "Noir") against 10 presets of paper:liquid-metal; labels not in sentence case: none; click on formatOptions.shader.preset.chrome: preset diamond -> chrome (revision 1061), canvas mean luminance moved 153.1, 94 perc | 604 |
| `shaders.panel.control-sentences` | shaders | not driven | passed |  | 605 |
| `shaders.panel.kit-colours` | shaders | not driven | failed | read the Colors row's swatches; brand.set /colors/<appearance>/primary '#0b3d91'; read the shader and its frame: the Primary swatch clicked (revision 1062 -> 1063); swatches text, background, caption, hint, primary, accent, custom (6 of the six roles); the sheet renders dark (deck.info and the chrome read dark); brand.set /colors/dark/primary ok; frame frame-f91c12dd0d05c000 (key sha256:f91c1) ->  | 606 |
| `shaders.panel.one-home` | shaders | broken | passed |  | 608 |
| `shaders.background.place-answers` | shaders | broken | failed | Slide > Change background on the body slide; Shader; a tile; Place; read the ground, the button and the dialog: chose Liquid metal; Place dialog.background.shader.place; the ground changed after 14193 ms (covering picture background, asset liquid-metal); the button read "Placing, 12 s" with the seconds | 607 |
| `shaders.perf.one-context` | shaders | not driven | failed | a second shader block placed through the window API; select each in turn and count the canvases: with nothing selected 1 canvas on the stage (2 on the page); first selected: 1 on the stage, 1 on the page; second selected: 1 on the stage after 781 ms, the second's root 1 canvas, the first's root 0 canvas, frame img decoded | 609 |
| `shaders.background.add-to-theme` | shaders | not driven | not driven | not on this build: dialog.background.shader.addToTheme (docs/PRODUCT.md 7.1, B1 (dialogs/Background.tsx)); no Add to theme row beside the Shader row (P1, FEATURES.md 5.2 item 1) | 610 |
| `shaders.frame.scrubber-capture` | shaders | not driven | not driven | not on this build: formatOptions.shader.frame.scrubber (docs/PRODUCT.md 7.1, B5 (inspector/shader.tsx)); no Frame scrubber in the Shader section (P1, FEATURES.md 5.2 item 3) | 611 |
| `shaders.view.play-setting` | view | not driven | passed |  | 612 |
| `shaders.insert.gallery-hover-live` | shaders | not driven | passed |  | 613 |

## Console errors (38)

- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260926-r3ok/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide.vercel.app/decks/untitle
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260926-r3ok/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide.vercel.app/decks/untitle
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260926-r3ok/assets/vercel.bc3f1148-light.svg' (redirected from 'https://turboslide.vercel.app/decks/untitle
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260926-r3ok/assets/vercel.bc3f1148-light.svg' (redirected from 'https://turboslide.vercel.app/decks/untitle
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260926-r3ok/assets/figma-2.source.0c0d457a.svg' (redirected from 'https://turboslide.vercel.app/decks/untit
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260926-r3ok/assets/figma-2.source.0c0d457a.svg' (redirected from 'https://turboslide.vercel.app/decks/untit
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260926-r3ok/assets/figma-2.source.0c0d457a.svg' (redirected from 'https://turboslide.vercel.app/decks/untit
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260926-r3ok/assets/figma-2.source.0c0d457a.svg' (redirected from 'https://turboslide.vercel.app/decks/untit
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260926-r3ok/assets/figma-2.source.0c0d457a.svg' (redirected from 'https://turboslide.vercel.app/decks/untit
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260926-r3ok/assets/figma-3.source.0c0d457a.svg' (redirected from 'https://turboslide.vercel.app/decks/untit
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260926-r3ok/assets/figma-3.source.0c0d457a.svg' (redirected from 'https://turboslide.vercel.app/decks/untit
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260926-r3ok/assets/figma-3.source.0c0d457a.svg' (redirected from 'https://turboslide.vercel.app/decks/untit
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260926-r3ok/assets/figma-4.source.0c0d457a.svg' (redirected from 'https://turboslide.vercel.app/decks/untit
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260926-r3ok/assets/figma-4.source.0c0d457a.svg' (redirected from 'https://turboslide.vercel.app/decks/untit
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260926-r3ok/assets/figma-4.source.0c0d457a.svg' (redirected from 'https://turboslide.vercel.app/decks/untit
- console: Failed to load resource: net::ERR_FAILED
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 502 ()
