# Core walk matrix

Base http://localhost:4321, started 2026-09-29T10:28:57.745Z, 4376 s, deck untitled-20260929-mjn1. 701 probe rows: 654 passed, 35 failed, 12 not driven, 0 no step. Verdict failed; exit 1. A row passes only when every tagged step of it passed; a not driven row is never counted as passed.

| Row | Feature | Today | Result | Reason | Steps |
| --- | --- | --- | --- | --- | --- |
| `decks.new.draft` | decks | works | passed |  | 1 |
| `decks.new.ground-paint` | decks | flaky | passed |  | 2 |
| `decks.new.first-write` | decks | works | passed |  | 3 |
| `decks.title.save-words` | decks | works | failed | a second edit: words All changes saved; final "All changes saved" | 5 |
| `decks.title.rename-enter` | decks | works | passed |  | 6 |
| `decks.title.rename-escape` | decks | works | passed |  | 7 |
| `decks.title.rename-blur` | decks | works | passed |  | 8 |
| `decks.title.rename-empty` | decks | works | passed |  | 9 |
| `decks.title.file-rename` | decks | works | passed |  | 10 |
| `decks.title.tab-title-after-rename` | decks | broken | passed |  | 11 |
| `decks.title.mark-to-list` | decks | works | passed |  | 12 |
| `decks.edit.reload-keeps-slide` | decks | works | passed |  | 13 |
| `decks.save.acknowledged` | decks | flaky | passed |  | 792 |
| `decks.editor.move-to-trash` | decks | works | passed |  | 793 |
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
| `text.autofit.title-wraps` | text | works | failed | type a long title into the title slide: lines 1; split words 0; overlap with the subtitle 0 px²; inside the sheet true | 166 |
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
| `images.options.reset` | images | works | failed | Adjustments > Reset: opacity 0.39; stored transparency true | 254 |
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
| `share.file-menu-share-with-others` | share | not driven | passed |  | 560 |
| `versions.open-from-last-edit` | versions | works | failed | click the Last edit words in the title row: error: locator.waitFor: Timeout 8000ms exceeded. | 561 |
| `versions.pick` | versions | works | failed | pick a version in the panel: no version rows in the panel | 562 |
| `versions.name-current` | versions | works | failed | Name current version, type a name, Save: error: locator.boundingBox: Timeout 30000ms exceeded. | 563 |
| `versions.undo-restore` | versions | not driven | failed | Restore an earlier version, then Cmd+Z: no Restore control in the panel | 564 |
| `export.download-submenu` | export | works | passed |  | 571 |
| `export.pdf.dialog` | export | works | passed |  | 572 |
| `export.pdf.skipped-check` | export | works | passed |  | 573 |
| `export.pdf.close-paths` | export | works | passed |  | 574 |
| `export.pptx.dialog` | export | works | passed |  | 575 |
| `export.print.preview-page` | export | works | passed |  | 578 |
| `export.print.layout-with-notes` | export | works | passed |  | 579 |
| `export.print.include-skipped` | export | works | passed |  | 580 |
| `export.print.print-button` | export | works | passed |  | 581 |
| `export.print.close-preview` | export | works | passed |  | 582 |
| `export.print.file-menu-after-close` | export | flaky | passed |  | 583 |
| `export.print.menu-row` | export | works | passed |  | 584 |
| `export.print.cmd-p` | export | works | passed |  | 585 |
| `help.help-dialog` | help | works | passed |  | 586 |
| `help.documentation-link` | help | broken | passed |  | 587 |
| `help.keyboard-shortcuts` | help | works | passed |  | 588 |
| `help.search-the-menus` | help | works | passed |  | 589 |
| `surface.menus.open-close-escape` | surface | not driven | passed |  | 791 |
| `surface.cleanup` | surface | works | passed |  | 794 |
| `shapes.text.colour-toolbar` | shapes | broken | passed |  | 372 |
| `shapes.text.enter-opens-label` | shapes | works | passed |  | 373 |
| `shapes.borders-lines.menu` | shapes | works | passed |  | 374 |
| `lines.connector.elbow` | lines | works | passed |  | 406 |
| `lines.connector.curved` | lines | works | passed |  | 407 |
| `lines.connector.re-end` | lines | not driven | passed |  | 409 |
| `lines.insert.arrow-head` | lines | works | passed |  | 410 |
| `lines.tail.line-start-end-menu` | lines | not driven | passed |  | 411 |
| `tables.insert.grid` | tables | works | passed |  | 414 |
| `tables.cell.double-click-type` | tables | works | passed |  | 415 |
| `tables.cell.tab-from-written` | tables | broken | passed |  | 416 |
| `tables.cell.tab-from-empty` | tables | works | passed |  | 417 |
| `tables.cell.shift-tab` | tables | not driven | passed |  | 418 |
| `tables.cell.tab-last-appends-row` | tables | works | passed |  | 419 |
| `tables.menu.format-table-with-session` | tables | broken | passed |  | 420 |
| `tables.menu.format-table-selected` | tables | broken | passed |  | 421 |
| `tables.menu.format-table-rows` | tables | not driven | passed |  | 422 |
| `tables.context.rows` | tables | works | passed |  | 423 |
| `tables.context.insert-delete` | tables | works | passed |  | 424 |
| `tables.column.insert-keeps-widths` | tables | broken | passed |  | 425 |
| `tables.column.resize-seam` | tables | not driven | passed |  | 426 |
| `tables.cell.align-menu` | tables | broken | passed |  | 427 |
| `tables.cell.align-toolbar` | tables | broken | passed |  | 428 |
| `tables.select.resize` | tables | works | passed |  | 429 |
| `tables.cell.fill-border-tail` | tables | not driven | passed |  | 430 |
| `tables.cells.merge-unmerge` | tables | not driven | passed |  | 431 |
| `tables.tail.merge-unmerge-buttons` | tables | not driven | passed |  | 432 |
| `tables.distribute.rows-columns` | tables | not driven | passed |  | 433 |
| `tables.light-appearance` | tables | not driven | passed |  | 434 |
| `tables.present` | tables | works | passed |  | 435 |
| `tables.reload` | tables | works | passed |  | 436 |
| `charts.insert.bar` | charts | works | passed |  | 473 |
| `charts.insert.column` | charts | works | passed |  | 474 |
| `charts.insert.line` | charts | works | passed |  | 475 |
| `charts.insert.pie` | charts | works | passed |  | 476 |
| `charts.select.tail` | charts | works | passed |  | 477 |
| `charts.resize` | charts | works | passed |  | 478 |
| `charts.type.panel-legible` | charts | broken | passed |  | 479 |
| `charts.type.toolbar` | charts | not driven | passed |  | 480 |
| `charts.type.menu` | charts | not driven | passed |  | 481 |
| `charts.data.add-series-category` | charts | works | passed |  | 482 |
| `charts.data.edit-cell` | charts | works | passed |  | 483 |
| `charts.data.toolbar-edit-data` | charts | not driven | passed |  | 484 |
| `charts.data.menu-edit-data` | charts | not driven | passed |  | 485 |
| `charts.legend.toolbar` | charts | not driven | passed |  | 486 |
| `charts.number-format.toolbar` | charts | not driven | passed |  | 487 |
| `charts.context` | charts | not driven | passed |  | 488 |
| `charts.light-appearance` | charts | not driven | passed |  | 489 |
| `charts.present` | charts | works | passed |  | 490 |
| `charts.reload` | charts | works | passed |  | 491 |
| `diagrams.panel` | diagrams | works | passed |  | 505 |
| `diagrams.insert.group` | diagrams | works | passed |  | 506 |
| `diagrams.select-move` | diagrams | works | passed |  | 507 |
| `diagrams.edit-label` | diagrams | not driven | passed |  | 508 |
| `diagrams.light-appearance` | diagrams | not driven | passed |  | 509 |
| `diagrams.present` | diagrams | works | passed |  | 510 |
| `diagrams.reload` | diagrams | not driven | passed |  | 511 |
| `wordart.insert` | wordart | works | passed |  | 519 |
| `wordart.edit` | wordart | not driven | passed |  | 520 |
| `wordart.light-appearance` | wordart | not driven | passed |  | 521 |
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
| `chrome.split.one-box` | chrome | broken | passed |  | 682 |
| `chrome.split.hover-no-inversion` | chrome | broken | passed |  | 683 |
| `chrome.split.click-show` | chrome | works | passed |  | 684 |
| `chrome.split.chevron-menu-aligned` | chrome | broken | passed |  | 685 |
| `chrome.split.enter-chevron` | chrome | broken | passed |  | 686 |
| `chrome.split.enter-label` | chrome | broken | passed |  | 687 |
| `chrome.split.space-both` | chrome | works | passed |  | 688 |
| `chrome.split.arrow-down-label` | chrome | broken | passed |  | 689 |
| `chrome.split.tab-order` | chrome | flaky | passed |  | 690 |
| `chrome.split.aria` | chrome | broken | passed |  | 691 |
| `chrome.split.collapse-900` | chrome | broken | passed |  | 692 |
| `chrome.separators.once` | chrome | broken | passed |  | 693 |
| `chrome.separators.toolbar-dividers` | chrome | works | passed |  | 694 |
| `chrome.cluster.gaps-heights` | chrome | broken | passed |  | 695 |
| `chrome.comments-glyph.toggle` | chrome | broken | passed |  | 696 |
| `view.appearance.rows` | view | works | passed |  | 593 |
| `view.show-filmstrip` | view | works | passed |  | 594 |
| `view.mode.rows` | view | works | passed |  | 595 |
| `view.mode.viewing-hides-toolbar` | view | broken | passed |  | 596 |
| `view.full-screen` | view | works | passed |  | 597 |
| `view.hide-menus-chevron` | view | not driven | passed |  | 598 |
| `view.live-pointers.toggles` | view | works | passed |  | 599 |
| `view.comments.radios` | view | works | passed |  | 600 |
| `view.comments.show-all-panel` | view | broken | passed |  | 601 |
| `view.comments.modes-markers` | view | not driven | passed |  | 602 |
| `decks.name.follows-heading` | decks | broken | passed |  | 4 |
| `decks.file.open-list-search` | decks | works | passed |  | 14 |
| `decks.file.import-slides-deck` | decks | works | passed |  | 15 |
| `decks.file.details` | decks | works | passed |  | 16 |
| `slides.numbers.apply` | slides | not driven | passed |  | 100 |
| `versions.show-changes-toggle` | versions | works | passed |  | 565 |
| `versions.show-changes-marks` | versions | not driven | failed | a heading edit and an added box after the named version; pick the older version with Show changes on; then off: picked versionHistory.553.pick (named row null); marks with Show changes on 0 (); off 0 | 566 |
| `help.check-slides` | help | works | passed |  | 590 |
| `inbox.bell-panel-toggle` | inbox | broken | failed | click the bell; read the panel; click the bell again: with the switch on; panel open true (aria-pressed true); words "NotificationsMark all readNothing newNotification settings"; Mark all read true; settings link true; panel still open after the second click true (aria-pressed true) | 679 |
| `inbox.settings-persist` | inbox | broken | passed |  | 680 |
| `arrange.insert.selected-after-menu` | arrange | broken | passed |  | 347 |
| `arrange.insert.free-rectangle` | arrange | not driven | passed |  | 348 |
| `slides.layout.title-and-body-single` | slides | broken | passed |  | 101 |
| `slides.layout.subtitle-prompt` | slides | not driven | passed |  | 102 |
| `slides.layout.new-slide-inherits` | slides | not driven | passed |  | 103 |
| `slides.layout.tile-sentences` | slides | broken | passed |  | 104 |
| `slides.import.none-preselected` | slides | broken | passed |  | 105 |
| `text.link.detect-url` | text | broken | passed |  | 188 |
| `text.link.detect-email` | text | broken | passed |  | 189 |
| `text.select.double-click-address` | text | broken | passed |  | 190 |
| `text.select.shift-home-line` | text | broken | passed |  | 191 |
| `text.link.popover-apply-remove` | text | broken | passed |  | 192 |
| `text.format-options.padding-grid` | text | broken | passed |  | 194 |
| `text.format-options.remembers-section` | text | not driven | passed |  | 195 |
| `text.autofit.shrink-on-overflow` | text | not driven | passed |  | 196 |
| `text.find-replace.count-while-typing` | text | broken | passed |  | 197 |
| `images.caption.add` | images | not driven | not driven | not on this build: format.image.addCaption (docs/PRODUCT.md 7.1, B2); the picture's menu lists edit.cut, edit.copy, edit.paste, edit.delete, edit.duplicate, arrange.order, arrange.rotate, arrange.centerOnPage, arrange.align, format.image.replaceImage, format.image.cropImage, format.image.maskImage, format.image.resetImage, format.image.imageOptions, format.formatOptions, format.altText, insert.com | 263 |
| `images.options.picture-sections-only` | images | broken | passed |  | 264 |
| `images.transparency.slider` | images | broken | passed |  | 265 |
| `images.border.drawn` | images | broken | passed |  | 266 |
| `formatting.alt-text.write-undo` | formatting | works | passed |  | 225 |
| `comments.panel.empty-gesture` | comments | broken | passed |  | 570 |
| `versions.panel.author-you` | versions | broken | passed |  | 568 |
| `versions.field.square` | versions | broken | passed |  | 569 |
| `help.shortcuts.no-duplicates` | help | broken | passed |  | 591 |
| `help.shortcuts.question-key` | help | broken | passed |  | 592 |
| `chrome.bottom-bar.removed` | chrome | broken | passed |  | 697 |
| `chrome.menu.no-tooltip-with-submenu` | chrome | broken | passed |  | 698 |
| `chrome.menu.escape-focus-stage` | chrome | broken | passed |  | 699 |
| `chrome.presence.tooltip` | chrome | broken | passed |  | 700 |
| `chrome.contrast.titanium-light` | chrome | broken | passed |  | 701 |
| `chrome.disabled.token-both-appearances` | chrome | not driven | passed |  | 702 |
| `chrome.field.boundary-3-1` | chrome | broken | passed |  | 703 |
| `chrome.hover.ground` | chrome | broken | passed |  | 704 |
| `chrome.floating.edge-frame` | chrome | broken | passed |  | 705 |
| `chrome.focus.one-ring-rule` | chrome | broken | passed |  | 706 |
| `chrome.filmstrip.one-ring` | chrome | broken | passed |  | 707 |
| `chrome.tooltip.none-on-focus-in-menus` | chrome | broken | passed |  | 708 |
| `chrome.menu.plate-fits-labels` | chrome | broken | passed |  | 709 |
| `chrome.menu.no-mnemonics-mac` | chrome | broken | passed |  | 710 |
| `chrome.select.one-rule` | chrome | broken | passed |  | 711 |
| `chrome.check.draws-check` | chrome | broken | passed |  | 712 |
| `chrome.toolbar.bold-follows-selection` | chrome | broken | passed |  | 713 |
| `menus.icons.insert-rows` | chrome | broken | passed |  | 714 |
| `menus.icons.format-rows` | chrome | broken | passed |  | 716 |
| `menus.icons.one-family` | chrome | works | passed |  | 717 |
| `brand.panel.opens` | brand | not driven | passed |  | 605 |
| `brand.logo.use-on-every-slide` | brand | not driven | not driven | not on this build: format.image.useOnEverySlide (docs/PRODUCT.md 7.1, B5a); the picture's menu lists edit.cut, edit.copy, edit.paste, edit.delete, edit.duplicate, arrange.order, arrange.rotate, arrange.centerOnPage, arrange.align, format.image.replaceImage, format.image.cropImage, format.image.maskImage, format.image.resetImage, format.image.imageOptions, format.formatOptions, format.altText, inse | 607 |
| `brand.logo.remove` | brand | not driven | passed |  | 608 |
| `brand.colors.primary-live` | brand | not driven | passed |  | 609 |
| `brand.colors.palette-row` | brand | broken | passed |  | 610 |
| `brand.colors.control-ids-unique` | brand | broken | passed |  | 611 |
| `brand.colors.version-history-entry` | brand | not driven | passed |  | 612 |
| `brand.colors.role-tooltips` | brand | not driven | passed |  | 613 |
| `brand.background.enter-keeps-open` | brand | broken | passed |  | 614 |
| `brand.fonts.roles` | brand | not driven | passed |  | 615 |
| `brand.counter.format` | brand | not driven | passed |  | 616 |
| `brand.reset.default-kit` | brand | not driven | passed |  | 617 |
| `brand.layout.tiles-in-kit` | brand | broken | passed |  | 618 |
| `brand.agent.set-get` | brand | not driven | passed |  | 619 |
| `fonts.dropdown.opens` | fonts | not driven | passed |  | 623 |
| `fonts.dropdown.apply-selection` | fonts | not driven | passed |  | 624 |
| `fonts.dropdown.search` | fonts | not driven | passed |  | 625 |
| `fonts.format-menu.row` | fonts | not driven | passed |  | 626 |
| `fonts.more-fonts.licence` | fonts | not driven | passed |  | 627 |
| `fonts.face.reload-and-show` | fonts | not driven | passed |  | 628 |
| `fonts.agent.font-list` | fonts | not driven | passed |  | 629 |
| `assist.entry.title-row` | assist | not driven | passed |  | 671 |
| `assist.panel.first-line-and-cards` | assist | not driven | passed |  | 672 |
| `assist.tailor.dialog-one-undo` | assist | not driven | passed |  | 673 |
| `assist.tailor.agent-deck-tailor` | assist | not driven | passed |  | 674 |
| `assist.outside-write.snackbar` | assist | broken | passed |  | 675 |
| `assist.finder.terms` | assist | broken | passed |  | 676 |
| `assist.finder.ask-row` | assist | not driven | passed |  | 677 |
| `assist.agent.propose-accept` | assist | not driven | failed | assist.propose over HTTP, assist.accept with the card, then the card with one byte changed: assist.propose answered 401 {"error":{"name":"ModelCallError","status":401,"message":"The assistant’s model answered 401","action":"assist.propose"}} | 678 |
| `charts.grid.type-to-edit` | charts | broken | passed |  | 492 |
| `charts.grid.escape-stays` | charts | broken | passed |  | 493 |
| `tables.cell.click-places-caret` | tables | broken | passed |  | 439 |
| `tables.cell.click-then-type` | tables | broken | passed |  | 441 |
| `tables.range.drag-from-selected` | tables | not driven | passed |  | 442 |
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
| `tables.selected.typing-appends` | tables | broken | passed |  | 443 |
| `tables.cell.arrows-cross-cells` | tables | not driven | passed |  | 444 |
| `tables.range.shift-arrows` | tables | not driven | passed |  | 445 |
| `diagrams.label.double-click-opens` | diagrams | broken | passed |  | 512 |
| `diagrams.label.tab-next` | diagrams | not driven | passed |  | 513 |
| `charts.double-click.opens-data` | charts | broken | passed |  | 494 |
| `charts.mark.click-selects-cell` | charts | not driven | passed |  | 495 |
| `tables.range.bold-italic` | tables | broken | passed |  | 446 |
| `tables.range.size-color` | tables | not driven | passed |  | 447 |
| `diagrams.step.one-object` | diagrams | broken | passed |  | 514 |
| `charts.legend.none-from-toolbar` | charts | broken | passed |  | 496 |
| `charts.panel.no-duplicate-controls` | charts | broken | passed |  | 497 |
| `charts.grid.remove-visible` | charts | broken | failed | the grid with the pointer away; the active row's remove control, the series swatch; a right click on a series header: remove control formatOptions.chart.category.0.remove opacity 0 with the row hovered (0 with the pointer away, item 26); series swatch 14 by 14; right click on the series header lists Add series, Remove Series 1 (FEATURES.md 2.2 rank 12, B3) | 498 |
| `tables.panel.table-first` | tables | broken | passed |  | 448 |
| `tables.seam.row-drag` | tables | not driven | passed |  | 449 |
| `tables.edge.add-row-column` | tables | not driven | passed |  | 450 |
| `tables.heads.select-row-column` | tables | not driven | passed |  | 451 |
| `tables.bar.row-column-buttons` | tables | not driven | not driven | not on this build: bar.table (docs/PRODUCT.md 7.1, B3); no bar under the selected table (P1, FEATURES.md 2.3 item 3) | 452 |
| `brand.objects.kit-colours-first` | brand | not driven | not driven | not on this build: formatOptions.chart.swatches.primary (docs/PRODUCT.md 7.1, B3); the chart's series swatches list formatOptions.chart.swatches.ink, formatOptions.chart.swatches.paper, formatOptions.chart.swatches.ink-2, formatOptions.chart.swatches.titanium, formatOptions.chart.swatches.hair, formatOptions.chart.swatches.hair-soft first and no kit role (P1, FEATURES.md 2.3 item 4); table fill pl | 620 |
| `arrange.group.tail-text-controls` | arrange | not driven | not driven | not on this build: toolbar.group.text (docs/PRODUCT.md 7.1, B3); chip "Group"; the group tail lists toolbar.fillColor, toolbar.borderColor, toolbar.borderWeight, toolbar.borderDash, toolbar.formatOptions and none of the text controls (P1, FEATURES.md 2.3 item 6) | 351 |
| `tables.command.keeps-caret` | tables | broken | passed |  | 453 |
| `wordart.resize.scales-letters` | wordart | broken | passed |  | 522 |
| `wordart.tail.fill-outline` | wordart | not driven | passed |  | 523 |
| `fonts.links.licence-v4-1` | fonts | broken | passed |  | 630 |
| `fonts.fallback.in-stack` | fonts | broken | passed |  | 631 |
| `fonts.display-features.inter-only` | fonts | not driven | passed |  | 632 |
| `tables.cells.tabular-figures` | tables | broken | passed |  | 454 |
| `formatting.numerals.tabular-row` | formatting | not driven | passed |  | 227 |
| `fonts.catalog.geist` | fonts | not driven | passed |  | 633 |
| `fonts.catalog.six-families` | fonts | not driven | passed |  | 634 |
| `fonts.picker.search-category` | fonts | not driven | passed |  | 635 |
| `fonts.table.takes-family` | fonts | not driven | not driven | not on this build: toolbar.font (docs/PRODUCT.md 7.1, B1); the Font control on a selected table is drawn disabled ("Inter"); takesFamily is P1 (FEATURES.md 3.5) | 636 |
| `logos.insert.row` | logos | not driven | passed |  | 638 |
| `logos.picker.search` | logos | not driven | failed | Insert > Logo; type figma at human speed; Enter: 20 result tiles 3 ms after the last key (first fsharp active true; foot "Logos from thesvg.org as of 25 September 2026. Brand marks belong to their owners; use them to name the brand, not to imply endorsement"); Enter inserted shot logo 441,415 160x160; dialog closed true | 639 |
| `logos.picker.paper-and-ink` | logos | not driven | failed | search vercel; read the tile's paper and ink halves; Slide > Change theme light; insert; read the mark: no Vercel tile among 23 tiles | 640 |
| `logos.picker.your-brand` | logos | not driven | failed | open the dialog; read the Your brand group; a role logo asset added through the window API; open again; click the brand tile: Your brand before the asset: kit (a tmp store has no deployment kit logo); asset.add role logo ok (brand-mark-asset); after: kit (group drawn true); the click inserted mark mark 734,408 132x84 (logo size true) | 641 |
| `logos.picker.empty-state` | logos | not driven | failed | search zzqx; Upload; then General Translation: "zzqx" (3 ms): "no empty state"; Upload false, chooser opened false; "General Translation" (3 ms): "No logo named General Translation on thesvg.org. Upload a file, or ask the brand for its press kitYour brand kit’s logo is under Your brandUpload"; no kit name on this deployment (the half is recorded, not judged) | 642 |
| `logos.picker.licence-words` | logos | not driven | passed |  | 643 |
| `logos.insert.one-click-asset` | logos | not driven | passed |  | 644 |
| `logos.insert.logo-size` | logos | not driven | passed |  | 645 |
| `logos.insert.mono-tint` | logos | not driven | passed |  | 646 |
| `logos.insert.every-slide` | logos | not driven | passed |  | 647 |
| `logos.tailor.find-customer-logo` | logos | not driven | failed | a picture with alt Acme and a text naming Acme as setup; Tools > Tailor; From Acme, To Figma; Find the Figma logo; Apply; Cmd+Z: button "Find the Figma logo" with the mark drawn true; stored "The Figma logo is ready; Apply puts it where the old logo was"; Apply dialog.tailor.apply: picture asset acme-logo-asset -> figma-4 (swapped true), text "Prepared for Figma" (revision 619 -> 619); Cmd+Z -> 61 | 648 |
| `logos.replace-image.row` | logos | not driven | passed |  | 649 |
| `logos.picker.variants` | logos | not driven | not driven | not on this build: dialog.logo.kind.wordmark (docs/PRODUCT.md 7.1, B1); no Symbol, Wordmark, Color or Mono control in the dialog head (P1, FEATURES.md 4.11; the appearance rule chooses) | 650 |
| `logos.kit.find-a-logo` | logos | not driven | not driven | not on this build: panel.brand.logo.find (docs/PRODUCT.md 7.1, B6); no Find a logo beside Replace in the Brand kit panel's Logo section (P1, FEATURES.md 4.5) | 651 |
| `logos.intake.url-sentence` | images | broken | passed |  | 652 |
| `shaders.insert.gallery-thumbnails` | shaders | not driven | failed | Insert > Shader; read the title, the sentence and the cards; search "metal"; a category chip: title "Shader"; sentence missing; 17 cards, 17 with a decoded thumbnail 2 ms after the open (2 a row); 0 canvas in the dialog; search "metal" narrows to 1 (Liquid metal); chips 6 (dialog.shader.category.metal narrows to 1) | 655 |
| `shaders.insert.selected-free-rectangle` | shaders | broken | failed | Insert > Shader; click Liquid metal on the Title slide: Liquid metal inserted material at 309,129 1154x642 (paper:liquid-metal, preset diamond); move handle true; resize handles 8; rotate true; ring true; chip "Shader"; session false; caret false; overlaps heading heading, paragraph lead of 3; kind title -> content (recorded) | 656 |
| `shaders.insert.words` | shaders | broken | passed |  | 657 |
| `shaders.panel.slider-live-undo` | shaders | not driven | passed |  | 658 |
| `shaders.panel.preset-tiles` | shaders | broken | passed |  | 659 |
| `shaders.panel.control-sentences` | shaders | not driven | passed |  | 660 |
| `shaders.panel.kit-colours` | shaders | not driven | failed | read the Colors row's swatches; brand.set /colors/<appearance>/primary '#0b3d91'; read the shader and its frame: the Primary swatch clicked (revision 632 -> 633); swatches text, background, caption, hint, primary, accent, custom (6 of the six roles); the sheet renders dark (deck.info and the chrome read dark); brand.set /colors/dark/primary ok; frame frame-fb458c99b7bb9c2f (key sha256:fb458) -> fr | 661 |
| `shaders.panel.one-home` | shaders | broken | passed |  | 663 |
| `shaders.background.place-answers` | shaders | broken | passed |  | 662 |
| `shaders.perf.one-context` | shaders | not driven | passed |  | 664 |
| `shaders.background.add-to-theme` | shaders | not driven | not driven | not on this build: dialog.background.shader.addToTheme (docs/PRODUCT.md 7.1, B1 (dialogs/Background.tsx)); no Add to theme row beside the Shader row (P1, FEATURES.md 5.2 item 1) | 665 |
| `shaders.frame.scrubber-capture` | shaders | not driven | not driven | not on this build: formatOptions.shader.frame.scrubber (docs/PRODUCT.md 7.1, B5 (inspector/shader.tsx)); no Frame scrubber in the Shader section (P1, FEATURES.md 5.2 item 3) | 666 |
| `shaders.view.play-setting` | view | not driven | passed |  | 667 |
| `shaders.insert.gallery-hover-live` | shaders | not driven | passed |  | 668 |
| `gestures.draw.shape-fill-at-step5` | arrange | broken | passed |  | 526 |
| `gestures.draw.click-at-press` | arrange | broken | passed |  | 527 |
| `gestures.draw.text-box-frame` | arrange | works | passed |  | 528 |
| `gestures.draw.grammar-slide-converts` | arrange | broken | passed |  | 530 |
| `gestures.resize.shape-follows` | arrange | works | passed |  | 533 |
| `gestures.resize.text-reflows` | arrange | not driven | passed |  | 535 |
| `gestures.resize.picture-follows` | arrange | works | passed |  | 537 |
| `gestures.resize.table-follows` | arrange | works | passed |  | 540 |
| `gestures.seam.table-follows` | arrange | works | passed |  | 541 |
| `gestures.resize.chart-follows` | arrange | works | passed |  | 542 |
| `gestures.resize.diagram-follows` | arrange | not driven | passed |  | 545 |
| `gestures.resize.wordart-scales` | arrange | not driven | passed |  | 543 |
| `gestures.move.connector-follows-live` | arrange | broken | passed |  | 548 |
| `gestures.rotate.ring-turns-live` | arrange | broken | passed |  | 551 |
| `gestures.rotate.ring-after-release` | arrange | broken | passed |  | 552 |
| `gestures.frame.one-render-per-frame` | arrange | not driven | passed |  | 555 |
| `gestures.frame.cost-budget` | arrange | not driven | passed |  | 556 |
| `gestures.readout.stays` | arrange | works | passed |  | 557 |
| `gestures.watch.chart-se-after-mark-click` | arrange | flaky | passed |  | 559 |
| `tables.select.ring-with-cell-open` | tables | broken | passed |  | 461 |
| `tables.cell.ring-on-cell` | tables | broken | passed |  | 462 |
| `tables.cells.empty-grid-guides` | tables | broken | passed |  | 463 |
| `tables.light-appearance-guides` | tables | not driven | passed |  | 464 |
| `tables.insert.box-fits-rows` | tables | broken | passed |  | 459 |
| `tables.rows.grow-with-text` | tables | broken | passed |  | 466 |
| `tables.resize.rows-share-extra` | tables | broken | passed |  | 467 |
| `tables.seam.visible-with-cell-open` | tables | broken | passed |  | 468 |
| `tables.heads.header-toggle` | tables | not driven | passed |  | 469 |
| `tables.panel.section-words` | tables | broken | passed |  | 470 |
| `charts.pie.add-series-refused` | charts | broken | passed |  | 501 |
| `diagrams.member.duplicate-delete` | diagrams | not driven | passed |  | 516 |
| `lines.chip.kind-name` | lines | broken | passed |  | 408 |
| `tables.cells.no-prompt` | tables | broken | passed |  | 720 |
| `tables.rows.ring-follows-typing` | tables | broken | passed |  | 721 |
| `tables.cell.click-moves-caret` | tables | broken | passed |  | 722 |
| `tables.tail.size-step-ladder` | tables | broken | failed | a typed 3 by 3 table; the header row selected as a range by a drag; the tail's "−" twice, then "+" until 20: range true; field 20 -> 18 -> 17 (stored size 17); back at 20; "+" aria-disabled true "Increase font size"; snackbar none (docs/POLISH.md 2.2 item 5, B1's ToolbarTail.tsx by B2's request) | 723 |
| `tables.insert.box-never-shorter-than-rows` | tables | broken | failed | Insert > Table, the 12 by 4 cell, on the Title and body slide under its title; the grid's size words read: h 137,129 1326x48.4; rows drawn null px (fits false); top at 218 false; size words "12 x 4" (docs/POLISH.md 2.2 item 6, B2) | 726 |
| `tables.heads.keys-act-on-range` | tables | broken | passed |  | 728 |
| `tables.insert.one-placement-rule` | tables | broken | failed | Insert > Table 1 by 1, then 1 by 2, then 3 by 3 on the Title and body slide; Cmd+Z after each: 1x1: y 129 (not 218); 1x2: y 129 (not 218); 3x3: y 129 (not 218) (docs/POLISH.md 2.2 item 8, B2) | 727 |
| `tables.edge.stays-inside-sheet` | tables | broken | passed |  | 729 |
| `tables.range.align-cells-only` | tables | broken | passed |  | 730 |
| `tables.context.object-menu-on-frame` | tables | broken | passed |  | 731 |
| `tables.polish.seams-snap-grid` | tables | broken | failed | a 3 by 3 table selected; the pointer at the second column seam's middle, its tooltip read, a 12 step drag right; the se handle dragged 160 px right; Insert > Table with the pointer moved 30 px left inside the grid's first column: seam handle.pt-seams.column.1: tooltip "Column seam 2Drag to resize the column; the next column takes the difference. Left and Right step 1 px, Shift 10 px.", widths [nul | 732 |
| `text.bold.toolbar-marks-run` | text | broken | failed | "Acme" selected in a text box; the tail's Bold; Cmd+Z; Format > Text > Bold; then the box selected by one click and Bold: tail: selected "Acme", mark true at 700, rest 400, stored "*Acme* renews in Q3"; menu: mark true at 700, rest 400, stored "*Acme* renews in Q3"; whole box: weight 400, stored "*Acme renews in Q3*" (bold true) (docs/POLISH.md 2.3 item 12, B1) | 734 |
| `slides.layout.blank-empty` | slides | broken | passed |  | 788 |
| `text.paragraph.toolbar-live` | text | broken | failed | a two line text box; a session open with the caret in line 1; Center from the tail, then 1.5, then Increase indent: Center: moved within a frame false (after 400 ms false), caret kept true; 1.5: moved within a frame false (after 400 ms false), caret kept true; Increase indent: moved within a frame true (after 400 ms true), caret kept true (docs/POLISH.md 2.3 item 14, B1) | 735 |
| `text.list.enter-tab-no-error` | text | broken | failed | a text box reading One; Bulleted list from the tail; the session opened at the end; Enter, "Two", Tab, Enter, "Three"; Escape; Cmd+Z until the box is back: listed true; items ["One","Two","Three"] (second nested false); error over the stage none; console 0; restored by Cmd+Z true (docs/POLISH.md 2.3 item 15, B1) | 736 |
| `text.size.run-and-typed-value` | text | broken | passed |  | 737 |
| `text.marks.whole-block-from-menu` | text | broken | passed |  | 738 |
| `text.tail.heading-takes-list-indent` | text | broken | failed | the title placeholder selected by one click; Bulleted list, Increase indent and Paint format from the tail; every disabled tail button read: disabled tail buttons 3 (toolbar.redo: "Redo"; toolbar.font: "Font"; toolbar.clearFormatting: "Clear formatting"); Bulleted list: not written snackbar "Bulleted list: No block "heading" on slide "title-1-fba7""; Increase indent: written snackbar "Bulleted lis | 740 |
| `text.heading.enter-keeps-session` | text | broken | passed |  | 741 |
| `text.link.chip-on-click` | text | broken | passed |  | 744 |
| `text.title.shrink-on-overflow` | text | broken | failed | the title selected and twelve words typed over it; Escape: font 44 -> 44 px over 1 lines; ring height 110 -> 110 sheet px (kept true); text inside the sheet true (k 0.7) (docs/POLISH.md 2.3 item 21, B1) | 743 |
| `text.link.popover-anchored` | text | broken | passed |  | 745 |
| `text.link.detection-setting` | text | broken | failed | Tools > Preferences > Link detection off, "See www.example.com now" typed into an empty box; on, typed again into another: error: locator.boundingBox: Timeout 30000ms exceeded. | 746 |
| `text.tail.size-reads-heading` | text | broken | failed | a title session open; the size field read; a subtitle session; the field read: title field "44"; subtitle field "26" (docs/POLISH.md 2.3 item 22, B1) | 742 |
| `text.polish.highlight-console` | text | broken | passed |  | 747 |
| `lines.hit.stroke-only` | lines | broken | passed |  | 750 |
| `shapes.geometry.cloud-callout-closed` | shapes | broken | passed |  | 754 |
| `charts.grid.every-series-in-view` | charts | broken | passed |  | 755 |
| `chrome.format-options.fields-by-kind` | chrome | broken | passed |  | 771 |
| `lines.move.detaches` | lines | broken | passed |  | 751 |
| `lines.select.handles-no-ring` | lines | broken | passed |  | 752 |
| `arrange.select.no-browser-highlight` | arrange | broken | passed |  | 756 |
| `diagrams.label.double-click-selects-word` | diagrams | broken | failed | Insert > Diagram > Process; a double click on "Step 2" of the diagram, " plus" typed; a text box double clicked at a point, typed: double click selected ""; the label reads "Step  plus2"; the text box after a double click on "caret" and "X" typed reads "Keep the Xcaret here" (docs/POLISH.md 2.4 item 30, B1's Selection.tsx by B3's request; question 5) | 757 |
| `lines.connector.perpendicular-at-sites` | lines | broken | failed | A above B; a curved connector from A's bottom site to B's top site; an elbow the same; A rotated 90 degrees: curved: leaves 1.1 and arrives 1.1 degrees from vertical; elbow: leaves 0 and arrives 0 degrees from vertical; elbow after A's rotation (rotated): arrives 90 degrees from vertical (docs/POLISH.md 2.4 item 33, B3) | 753 |
| `wordart.bar.closes` | wordart | broken | passed |  | 758 |
| `wordart.polish.chip-weight-arming` | wordart | broken | failed | Insert > Word art with "Big words" typed and Enter; the chip and the tail's B read; B pressed once; Insert > Line > Elbow connector armed: chip "Word art"; B pressed at insert false; weight 400 -> 400 after one press (bolder false); ring before arming drawn, after arming the elbow tool ring still drawn, chip "Word art" (docs/POLISH.md 2.4 item 34, B3 with B1's Editor.tsx hunks) | 759 |
| `images.panel.seller-words` | images | broken | passed |  | 762 |
| `images.panel.drop-shadow` | images | not driven | passed |  | 763 |
| `images.mask.picker-fits-panel` | images | broken | passed |  | 764 |
| `images.caption.grows-box` | images | broken | not driven | not on this build: format.image.addCaption (docs/PRODUCT.md 7.1, B4); the picture's menu lists edit.cut, edit.copy, edit.paste, edit.delete, edit.duplicate, arrange.order, arrange.rotate, arrange.centerOnPage, arrange.align, format.image.replaceImage, format.image.cropImage, format.image.maskImage, format.image.resetImage, format.image.imageOptions, format.formatOptions, format.altText, insert.com | 765 |
| `images.border.color-draws-at-once` | images | broken | passed |  | 766 |
| `images.alt.focused-empty` | images | broken | passed |  | 767 |
| `images.crop.dims-outside` | images | broken | passed |  | 768 |
| `chrome.plate.fits-viewport` | chrome | broken | passed |  | 772 |
| `formatting.spacing.table-cells` | formatting | broken | passed |  | 782 |
| `help.check-slides.plain-sentence` | help | broken | failed | an empty 3 by 3 table on a slide of its own; Tools > Check slides: 4 findings; about empty cells 2 ("The table has 9 empty cells; type into them or remove the rows."); parenthesis or SPEC false (docs/POLISH.md 2.6 item 55, B1) | 784 |
| `slides.background.picture-grid` | slides | broken | passed |  | 785 |
| `menus.rows.icon-on-every-row` | chrome | broken | passed |  | 786 |
| `chrome.snackbar.refusal-sentence` | chrome | broken | passed |  | 773 |
| `chrome.handles.tooltip-words` | chrome | broken | passed |  | 774 |
| `chrome.tooltips.only-on-hover` | chrome | broken | passed |  | 790 |
| `chrome.chip.above-ring` | chrome | broken | failed | a 120 px picture and a 60 px picture selected in turn: pc-small: chip 1130,519.5 50.2x18, over move; pc-small-2: chip 1242.8,505.4 50.2x18, over move (docs/POLISH.md 2.6 item 62, B1's Overlay.tsx by B4's request) | 775 |
| `chrome.dialog.no-loading-jump` | chrome | broken | passed |  | 776 |
| `chrome.dialog.focus-return-and-trap` | chrome | broken | passed |  | 777 |
| `comments.insert.needs-selection` | comments | broken | passed |  | 787 |
| `chrome.context.escape-closes-submenu` | chrome | broken | passed |  | 778 |
| `formatting.border-weight.menu-opens` | formatting | broken | passed |  | 783 |
| `chrome.toolbar.select-glyph` | chrome | broken | passed |  | 779 |
| `chrome.words.one-spelling` | chrome | broken | passed |  | 780 |
| `chrome.menus.structure-sweep` | chrome | broken | passed |  | 781 |
| `slides.filmstrip.follows-every-move` | slides | broken | passed |  | 789 |

## Console errors (1)

- console: Failed to load resource: the server responded with a status of 404 ()
