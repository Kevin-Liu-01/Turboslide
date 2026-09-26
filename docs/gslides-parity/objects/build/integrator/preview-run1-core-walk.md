# Core walk matrix

Base https://turboslide-dxutmn8x9-kl01s-projects.vercel.app, started 2026-09-26T04:52:41.208Z, 4124 s, deck untitled-20260926-v38m. 627 probe rows: 603 passed, 14 failed, 10 not driven, 0 no step. Verdict failed with the parked list inbox, templates; exit 1. A row passes only when every tagged step of it passed; a not driven row is never counted as passed.

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
| `decks.save.acknowledged` | decks | flaky | failed | every window API write of the walk is acknowledged within 60 s: 1 unanswered call(s): block.set at 2026-09-26T05:02:35.164Z on untitled-20260926-g98d in slides (Apply layout > Title, subtitle and body on the new slide; read the prompts); 1 fresh deck(s) made for the areas after | 705 |
| `decks.editor.move-to-trash` | decks | works | failed | File > Move to trash: error: page.waitForURL: Timeout 20000ms exceeded. | 706 |
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
| `text.title.single-click` | text | broken | passed |  | 107 |
| `text.title.double-click` | text | works | passed |  | 108 |
| `text.title.type-escape` | text | works | passed |  | 109 |
| `text.selected.typing-replaces` | text | not driven | passed |  | 110 |
| `text.selected.enter-appends` | text | not driven | passed |  | 111 |
| `text.title.double-click-enters` | text | not driven | passed |  | 112 |
| `text.caret.click-mid-word` | text | works | passed |  | 113 |
| `text.caret.home-end` | text | works | passed |  | 114 |
| `text.caret.shift-arrow-replace` | text | works | passed |  | 115 |
| `text.caret.shift-home-end` | text | works | passed |  | 116 |
| `text.caret.backspace-word` | text | works | passed |  | 117 |
| `text.caret.option-backspace` | text | works | passed |  | 118 |
| `text.caret.delete` | text | works | passed |  | 119 |
| `text.caret.cmd-a` | text | works | passed |  | 120 |
| `text.title.enter-commits` | text | works | passed |  | 121 |
| `text.session.escape-twice` | text | works | passed |  | 122 |
| `text.subtitle.double-click-type` | text | works | passed |  | 123 |
| `text.subtitle.enter-new-line` | text | works | passed |  | 124 |
| `text.subtitle.shift-enter` | text | works | passed |  | 125 |
| `text.subtitle.arrows-backspace-join` | text | works | passed |  | 126 |
| `text.subtitle.escape-commits` | text | works | passed |  | 127 |
| `text.textbox.insert-click-type` | text | works | passed |  | 129 |
| `text.textbox.insert-drag` | text | works | passed |  | 130 |
| `text.textbox.drag-inside-moves` | text | broken | passed |  | 131 |
| `text.textbox.burst-reliability` | text | broken | passed |  | 133 |
| `text.toolbar.swaps-on-select` | text | works | passed |  | 134 |
| `text.fontsize.type-enter` | text | works | passed |  | 135 |
| `text.fontsize.plus-minus` | text | works | passed |  | 136 |
| `text.bold.toolbar` | text | works | passed |  | 137 |
| `text.bold.cmd-b-word` | text | works | passed |  | 138 |
| `text.italic.toolbar-word` | text | broken | passed |  | 139 |
| `text.italic.cmd-i-word` | text | works | passed |  | 140 |
| `text.underline.cmd-u-word` | text | works | passed |  | 141 |
| `text.underline.toolbar` | text | works | passed |  | 143 |
| `text.strikethrough.cmd-shift-x` | text | works | passed |  | 142 |
| `text.strikethrough.menu` | text | works | passed |  | 144 |
| `text.color.swatch-on-word` | text | broken | passed |  | 145 |
| `text.align.toolbar-and-key` | text | works | passed |  | 146 |
| `text.spacing.toolbar` | text | works | passed |  | 147 |
| `text.list.bulleted-toolbar` | text | broken | passed |  | 148 |
| `text.list.numbered-toolbar` | text | broken | passed |  | 149 |
| `text.list.bulleted-menu-preset` | text | works | passed |  | 150 |
| `text.indent.toolbar` | text | works | passed |  | 153 |
| `text.indent.keys` | text | works | passed |  | 154 |
| `text.link.cmd-k-enter` | text | broken | passed |  | 155 |
| `text.clear-formatting` | text | works | passed |  | 157 |
| `text.format-menu.rows-enabled` | text | works | passed |  | 158 |
| `text.format-menu.size-increase` | text | works | passed |  | 159 |
| `text.format-menu.align-left` | text | works | passed |  | 161 |
| `text.format-menu.spacing-double` | text | works | passed |  | 163 |
| `text.format-menu.text-fitting` | text | not driven | passed |  | 165 |
| `text.autofit.title-wraps` | text | works | passed |  | 167 |
| `text.autofit.textbox-grow` | text | broken | passed |  | 168 |
| `text.clipboard.within-box` | text | works | passed |  | 169 |
| `text.clipboard.between-boxes` | text | works | passed |  | 170 |
| `text.clipboard.paste-without-formatting` | text | not driven | not driven | manual: headless Chromium does not synthesize Cmd+Shift+V as a paste; the step is docs/gslides-parity/focus/manual-checklist.md | 171 |
| `text.find-replace.replace-all` | text | works | passed |  | 172 |
| `text.find-replace.shortcut` | text | flaky | passed |  | 173 |
| `text.persistence.reload` | text | works | passed |  | 178 |
| `text.list.numbered-menu-preset` | text | not driven | passed |  | 151 |
| `text.list.chords` | text | not driven | passed |  | 152 |
| `text.link.toolbar-button` | text | not driven | passed |  | 156 |
| `text.format-options.panel` | text | not driven | passed |  | 166 |
| `text.layout-runs.type` | text | not driven | passed |  | 177 |
| `text.context.text-block` | text | not driven | passed |  | 174 |
| `text.context.text-selection` | text | not driven | passed |  | 175 |
| `text.context.inside-session` | text | broken | passed |  | 176 |
| `text.format-menu.size-decrease` | text | not driven | passed |  | 160 |
| `text.format-menu.spacing-single-1-15` | text | not driven | passed |  | 164 |
| `text.format-menu.align-indent-rows` | text | not driven | passed |  | 162 |
| `text.textbox.toolbar-button` | text | not driven | passed |  | 132 |
| `images.insert.toolbar-sources` | images | works | passed |  | 230 |
| `images.select.chip-handles-tail` | images | works | passed |  | 232 |
| `images.delete.key` | images | works | passed |  | 233 |
| `images.move.drag-frame` | images | works | passed |  | 234 |
| `images.guides.edge-snap` | images | works | passed |  | 236 |
| `images.guides.centre-y` | images | works | passed |  | 237 |
| `images.guides.centre-x` | images | flaky | passed |  | 238 |
| `images.nudge.arrows` | images | works | passed |  | 239 |
| `images.resize.eight-handles` | images | works | passed |  | 240 |
| `images.resize.eight-handles-shift` | images | works | passed |  | 241 |
| `images.resize.edge-fill` | images | broken | passed |  | 243 |
| `images.resize.alt-centre` | images | works | passed |  | 242 |
| `images.rotate.ring` | images | works | passed |  | 244 |
| `images.crop.double-click` | images | works | passed |  | 245 |
| `images.crop.east-edge` | images | works | passed |  | 246 |
| `images.crop.south-edge` | images | works | passed |  | 247 |
| `images.crop.enter` | images | works | passed |  | 248 |
| `images.crop.undo` | images | works | passed |  | 249 |
| `images.crop.redo` | images | works | passed |  | 250 |
| `images.crop.menu-escape` | images | works | passed |  | 251 |
| `images.crop.toolbar-escape-cancels` | images | broken | failed | the toolbar Crop image button, an edge drag, Escape: error: no crop handle e | 252 |
| `images.options.panel` | images | works | passed |  | 253 |
| `images.options.transparency` | images | works | passed |  | 254 |
| `images.options.reset` | images | works | passed |  | 255 |
| `images.reset-image.menu` | images | works | passed |  | 256 |
| `images.background.colour` | images | works | passed |  | 259 |
| `images.background.toolbar` | images | works | passed |  | 260 |
| `images.background.reset` | images | works | passed |  | 263 |
| `images.present.picture-and-ground` | images | works | passed |  | 262 |
| `images.context.image` | images | not driven | passed |  | 258 |
| `images.options.menu-row` | images | not driven | passed |  | 257 |
| `images.background.hex-field` | images | not driven | passed |  | 261 |
| `arrange.select.click` | arrange | works | passed |  | 270 |
| `arrange.select.shift-add` | arrange | works | passed |  | 271 |
| `arrange.multi.drag-inside-moves-all` | arrange | broken | passed |  | 272 |
| `arrange.select.shift-remove` | arrange | works | passed |  | 273 |
| `arrange.select.marquee` | arrange | works | passed |  | 274 |
| `arrange.select.marquee-partial` | arrange | works | passed |  | 275 |
| `arrange.select.click-away` | arrange | works | passed |  | 276 |
| `arrange.select.cmd-a` | arrange | works | passed |  | 277 |
| `arrange.select.escape` | arrange | works | passed |  | 278 |
| `arrange.order.bring-to-front` | arrange | works | passed |  | 279 |
| `arrange.order.send-to-back` | arrange | works | passed |  | 280 |
| `arrange.order.bring-forward` | arrange | works | passed |  | 281 |
| `arrange.order.send-backward` | arrange | works | passed |  | 282 |
| `arrange.order.keys` | arrange | works | passed |  | 283 |
| `arrange.align.left` | arrange | works | passed |  | 284 |
| `arrange.align.center` | arrange | works | passed |  | 285 |
| `arrange.align.right` | arrange | flaky | passed |  | 286 |
| `arrange.align.top` | arrange | broken | passed |  | 287 |
| `arrange.align.middle` | arrange | works | passed |  | 288 |
| `arrange.align.bottom` | arrange | broken | passed |  | 289 |
| `arrange.align.single-to-slide` | arrange | works | passed |  | 290 |
| `arrange.center.horizontal` | arrange | works | passed |  | 291 |
| `arrange.center.vertical` | arrange | works | passed |  | 292 |
| `arrange.undo.toolbar-on-arrange` | arrange | works | passed |  | 293 |
| `arrange.undo.menu-on-arrange` | arrange | works | passed |  | 294 |
| `arrange.clipboard.copy-paste` | arrange | works | passed |  | 295 |
| `arrange.clipboard.delete` | arrange | works | passed |  | 296 |
| `arrange.clipboard.undo-redo-delete` | arrange | works | passed |  | 297 |
| `arrange.clipboard.cut-paste-undo` | arrange | flaky | passed |  | 298 |
| `arrange.clipboard.menu-copy-paste` | arrange | flaky | passed |  | 299 |
| `arrange.clipboard.paste-after-new-slide-button` | arrange | broken | passed |  | 300 |
| `arrange.clipboard.paste-with-filmstrip-focus` | arrange | broken | passed |  | 301 |
| `arrange.clipboard.paste-keeps-position` | arrange | works | passed |  | 302 |
| `arrange.duplicate.cmd-d` | arrange | works | passed |  | 303 |
| `arrange.duplicate.menu-selects-copy` | arrange | broken | passed |  | 304 |
| `arrange.duplicate.nothing-selected` | arrange | works | passed |  | 305 |
| `arrange.redo.after-undone-duplicate` | arrange | broken | passed |  | 306 |
| `arrange.keys.backspace-empty-selection` | arrange | broken | passed |  | 307 |
| `arrange.nudge.arrows` | arrange | works | passed |  | 308 |
| `arrange.nudge.shift` | arrange | works | passed |  | 309 |
| `arrange.nudge.undo` | arrange | works | passed |  | 310 |
| `arrange.zoom.box-reads` | arrange | works | passed |  | 311 |
| `arrange.zoom.menu-in` | arrange | broken | passed |  | 316 |
| `arrange.zoom.cmd-minus` | arrange | broken | passed |  | 315 |
| `arrange.zoom.cmd-plus` | arrange | broken | passed |  | 314 |
| `arrange.zoom.fit` | arrange | flaky | passed |  | 318 |
| `arrange.zoom.type-percent` | arrange | works | passed |  | 312 |
| `arrange.zoom.arrow-menu` | arrange | works | passed |  | 319 |
| `arrange.zoom.cmd-0` | arrange | works | passed |  | 313 |
| `arrange.zoom.menu-out` | arrange | broken | passed |  | 317 |
| `arrange.readout.fit` | arrange | works | passed |  | 321 |
| `arrange.readout.200` | arrange | works | passed |  | 322 |
| `arrange.selection-colour.light` | arrange | works | passed |  | 324 |
| `arrange.selection-colour.dark` | arrange | works | passed |  | 323 |
| `arrange.escape.text-then-selection` | arrange | works | passed |  | 325 |
| `arrange.zoom.menu-presets` | arrange | not driven | passed |  | 320 |
| `arrange.toolbar.select` | arrange | not driven | passed |  | 326 |
| `shapes.insert.rectangle-click` | shapes | works | passed |  | 355 |
| `shapes.insert.rounded-click` | shapes | works | passed |  | 356 |
| `shapes.insert.ellipse-click` | shapes | works | passed |  | 357 |
| `shapes.insert.rectangle-drag` | shapes | works | passed |  | 358 |
| `shapes.insert.ellipse-drag` | shapes | works | passed |  | 359 |
| `shapes.insert.named-rows` | shapes | not driven | passed |  | 360 |
| `shapes.default-look` | shapes | broken | passed |  | 361 |
| `shapes.select` | shapes | works | passed |  | 362 |
| `shapes.move` | shapes | not driven | passed |  | 363 |
| `shapes.resize.eight-handles` | shapes | not driven | passed |  | 364 |
| `shapes.rotate` | shapes | not driven | passed |  | 365 |
| `shapes.fill.colour` | shapes | not driven | passed |  | 366 |
| `shapes.border.colour-weight-dash` | shapes | not driven | passed |  | 367 |
| `shapes.text.type-align-bold` | shapes | not driven | passed |  | 368 |
| `shapes.duplicate-delete-undo-redo` | shapes | not driven | passed |  | 369 |
| `shapes.format-options.size-position` | shapes | not driven | passed |  | 370 |
| `shapes.reload-and-viewer` | shapes | not driven | passed |  | 372 |
| `shapes.context.shape` | shapes | not driven | passed |  | 371 |
| `lines.insert.line-drag` | lines | not driven | passed |  | 401 |
| `lines.insert.arrow-drag` | lines | not driven | passed |  | 402 |
| `lines.end-handle` | lines | not driven | passed |  | 403 |
| `lines.tail.colour-weight-dash-ends` | lines | not driven | passed |  | 404 |
| `lines.context.line` | lines | not driven | passed |  | 405 |
| `share.file-menu-share-with-others` | share | not driven | passed |  | 562 |
| `versions.open-from-last-edit` | versions | works | passed |  | 563 |
| `versions.pick` | versions | works | passed |  | 564 |
| `versions.name-current` | versions | works | passed |  | 565 |
| `versions.undo-restore` | versions | not driven | passed |  | 566 |
| `export.download-submenu` | export | works | passed |  | 573 |
| `export.pdf.dialog` | export | works | passed |  | 574 |
| `export.pdf.skipped-check` | export | works | passed |  | 575 |
| `export.pdf.close-paths` | export | works | passed |  | 576 |
| `export.pptx.dialog` | export | works | passed |  | 577 |
| `export.print.preview-page` | export | works | passed |  | 580 |
| `export.print.layout-with-notes` | export | works | passed |  | 581 |
| `export.print.include-skipped` | export | works | passed |  | 582 |
| `export.print.print-button` | export | works | passed |  | 583 |
| `export.print.close-preview` | export | works | passed |  | 584 |
| `export.print.file-menu-after-close` | export | flaky | passed |  | 585 |
| `export.print.menu-row` | export | works | passed |  | 586 |
| `export.print.cmd-p` | export | works | passed |  | 587 |
| `help.help-dialog` | help | works | passed |  | 588 |
| `help.documentation-link` | help | broken | passed |  | 589 |
| `help.keyboard-shortcuts` | help | works | passed |  | 590 |
| `help.search-the-menus` | help | works | passed |  | 591 |
| `surface.menus.open-close-escape` | surface | not driven | passed |  | 704 |
| `surface.cleanup` | surface | works | passed |  | 707 |
| `shapes.text.colour-toolbar` | shapes | broken | passed |  | 373 |
| `shapes.text.enter-opens-label` | shapes | works | passed |  | 374 |
| `shapes.borders-lines.menu` | shapes | works | passed |  | 375 |
| `lines.connector.elbow` | lines | works | passed |  | 407 |
| `lines.connector.curved` | lines | works | passed |  | 408 |
| `lines.connector.re-end` | lines | not driven | passed |  | 410 |
| `lines.insert.arrow-head` | lines | works | passed |  | 411 |
| `lines.tail.line-start-end-menu` | lines | not driven | passed |  | 412 |
| `tables.insert.grid` | tables | works | passed |  | 415 |
| `tables.cell.double-click-type` | tables | works | passed |  | 416 |
| `tables.cell.tab-from-written` | tables | broken | passed |  | 417 |
| `tables.cell.tab-from-empty` | tables | works | passed |  | 418 |
| `tables.cell.shift-tab` | tables | not driven | passed |  | 419 |
| `tables.cell.tab-last-appends-row` | tables | works | passed |  | 420 |
| `tables.menu.format-table-with-session` | tables | broken | passed |  | 421 |
| `tables.menu.format-table-selected` | tables | broken | passed |  | 422 |
| `tables.menu.format-table-rows` | tables | not driven | passed |  | 423 |
| `tables.context.rows` | tables | works | passed |  | 424 |
| `tables.context.insert-delete` | tables | works | passed |  | 425 |
| `tables.column.insert-keeps-widths` | tables | broken | passed |  | 426 |
| `tables.column.resize-seam` | tables | not driven | passed |  | 427 |
| `tables.cell.align-menu` | tables | broken | passed |  | 428 |
| `tables.cell.align-toolbar` | tables | broken | passed |  | 429 |
| `tables.select.resize` | tables | works | passed |  | 430 |
| `tables.cell.fill-border-tail` | tables | not driven | passed |  | 431 |
| `tables.cells.merge-unmerge` | tables | not driven | passed |  | 432 |
| `tables.tail.merge-unmerge-buttons` | tables | not driven | passed |  | 433 |
| `tables.distribute.rows-columns` | tables | not driven | passed |  | 434 |
| `tables.light-appearance` | tables | not driven | passed |  | 435 |
| `tables.present` | tables | works | passed |  | 436 |
| `tables.reload` | tables | works | passed |  | 437 |
| `charts.insert.bar` | charts | works | passed |  | 475 |
| `charts.insert.column` | charts | works | passed |  | 476 |
| `charts.insert.line` | charts | works | passed |  | 477 |
| `charts.insert.pie` | charts | works | passed |  | 478 |
| `charts.select.tail` | charts | works | passed |  | 479 |
| `charts.resize` | charts | works | passed |  | 480 |
| `charts.type.panel-legible` | charts | broken | passed |  | 481 |
| `charts.type.toolbar` | charts | not driven | passed |  | 482 |
| `charts.type.menu` | charts | not driven | passed |  | 483 |
| `charts.data.add-series-category` | charts | works | passed |  | 484 |
| `charts.data.edit-cell` | charts | works | passed |  | 485 |
| `charts.data.toolbar-edit-data` | charts | not driven | passed |  | 486 |
| `charts.data.menu-edit-data` | charts | not driven | passed |  | 487 |
| `charts.legend.toolbar` | charts | not driven | passed |  | 488 |
| `charts.number-format.toolbar` | charts | not driven | passed |  | 489 |
| `charts.context` | charts | not driven | passed |  | 490 |
| `charts.light-appearance` | charts | not driven | passed |  | 491 |
| `charts.present` | charts | works | passed |  | 492 |
| `charts.reload` | charts | works | passed |  | 493 |
| `diagrams.panel` | diagrams | works | passed |  | 507 |
| `diagrams.insert.group` | diagrams | works | passed |  | 508 |
| `diagrams.select-move` | diagrams | works | passed |  | 509 |
| `diagrams.edit-label` | diagrams | not driven | passed |  | 510 |
| `diagrams.light-appearance` | diagrams | not driven | passed |  | 511 |
| `diagrams.present` | diagrams | works | passed |  | 512 |
| `diagrams.reload` | diagrams | not driven | passed |  | 513 |
| `wordart.insert` | wordart | works | passed |  | 521 |
| `wordart.edit` | wordart | not driven | passed |  | 522 |
| `wordart.light-appearance` | wordart | not driven | passed |  | 523 |
| `formatting.superscript.chord` | formatting | works | passed |  | 201 |
| `formatting.subscript.chord` | formatting | works | passed |  | 202 |
| `formatting.superscript.menu-word` | formatting | broken | passed |  | 203 |
| `formatting.subscript.menu-word` | formatting | broken | passed |  | 204 |
| `formatting.italic.menu-word` | formatting | broken | passed |  | 205 |
| `formatting.context.selection-rows` | formatting | not driven | passed |  | 206 |
| `formatting.capitalization.upper` | formatting | works | passed |  | 207 |
| `formatting.capitalization.lower` | formatting | works | passed |  | 208 |
| `formatting.capitalization.title` | formatting | works | passed |  | 209 |
| `formatting.align.justified-menu` | formatting | works | passed |  | 210 |
| `formatting.align.justified-chord` | formatting | works | passed |  | 211 |
| `formatting.align.toolbar-justify` | formatting | not driven | passed |  | 212 |
| `formatting.spacing.add-before-remove` | formatting | works | passed |  | 213 |
| `formatting.spacing.add-after` | formatting | works | passed |  | 214 |
| `formatting.spacing.custom-dialog` | formatting | works | passed |  | 215 |
| `formatting.spacing.1-15-value` | formatting | broken | passed |  | 216 |
| `formatting.highlight.word` | formatting | works | passed |  | 217 |
| `formatting.paint-format.button` | formatting | works | passed |  | 219 |
| `formatting.paint-format.chords` | formatting | not driven | passed |  | 220 |
| `formatting.clear.inline-marks` | formatting | broken | passed |  | 221 |
| `formatting.theme.panel-appearance` | formatting | works | passed |  | 222 |
| `formatting.theme.toolbar-button` | formatting | works | passed |  | 223 |
| `formatting.theme.import-hidden` | formatting | not driven | passed |  | 224 |
| `formatting.persistence` | formatting | works | passed |  | 225 |
| `text.title.one-click-tail` | text | broken | passed |  | 179 |
| `text.title.bold-menu` | text | broken | passed |  | 180 |
| `text.title.bold-cmd-b` | text | broken | passed |  | 181 |
| `text.title.align-menu` | text | broken | passed |  | 182 |
| `text.title.size-menu` | text | broken | passed |  | 183 |
| `text.title.format-options-marks` | text | broken | passed |  | 184 |
| `text.title.apply-layout-after-format` | text | not driven | passed |  | 185 |
| `text.fontsize.type-one-undo` | text | broken | passed |  | 186 |
| `text.format-options.field-one-undo` | text | broken | passed |  | 187 |
| `arrange.distribute.horizontal` | arrange | works | passed |  | 327 |
| `arrange.distribute.vertical` | arrange | works | passed |  | 328 |
| `arrange.distribute.needs-three` | arrange | works | passed |  | 329 |
| `arrange.rotate.quarter-turns` | arrange | works | passed |  | 330 |
| `arrange.rotate.flips-menu` | arrange | works | passed |  | 331 |
| `arrange.group.chords` | arrange | works | passed |  | 332 |
| `arrange.group.menu-regroup` | arrange | works | passed |  | 333 |
| `arrange.group.context-rows` | arrange | not driven | passed |  | 334 |
| `arrange.context.rotate-distribute` | arrange | not driven | passed |  | 335 |
| `arrange.ruler.show-hide` | arrange | works | passed |  | 336 |
| `arrange.guides.from-ruler` | arrange | works | passed |  | 337 |
| `arrange.guides.show-toggle` | arrange | works | passed |  | 338 |
| `arrange.guides.add-vertical-horizontal` | arrange | works | passed |  | 339 |
| `arrange.guides.drag` | arrange | flaky | passed |  | 340 |
| `arrange.snap.guides-on-off` | arrange | works | passed |  | 341 |
| `arrange.snap.grid-toggle` | arrange | works | passed |  | 342 |
| `arrange.snap.grid-effect` | arrange | not driven | passed |  | 343 |
| `arrange.guides.context` | arrange | works | passed |  | 344 |
| `arrange.guides.clear` | arrange | works | passed |  | 345 |
| `arrange.select-none.menu` | arrange | works | passed |  | 346 |
| `chrome.split.one-box` | chrome | broken | passed |  | 667 |
| `chrome.split.hover-no-inversion` | chrome | broken | passed |  | 668 |
| `chrome.split.click-show` | chrome | works | passed |  | 669 |
| `chrome.split.chevron-menu-aligned` | chrome | broken | passed |  | 670 |
| `chrome.split.enter-chevron` | chrome | broken | passed |  | 671 |
| `chrome.split.enter-label` | chrome | broken | passed |  | 672 |
| `chrome.split.space-both` | chrome | works | passed |  | 673 |
| `chrome.split.arrow-down-label` | chrome | broken | passed |  | 674 |
| `chrome.split.tab-order` | chrome | flaky | passed |  | 675 |
| `chrome.split.aria` | chrome | broken | passed |  | 676 |
| `chrome.split.collapse-900` | chrome | broken | passed |  | 677 |
| `chrome.separators.once` | chrome | broken | passed |  | 678 |
| `chrome.separators.toolbar-dividers` | chrome | works | passed |  | 679 |
| `chrome.cluster.gaps-heights` | chrome | broken | passed |  | 680 |
| `chrome.comments-glyph.toggle` | chrome | broken | passed |  | 681 |
| `view.appearance.rows` | view | works | passed |  | 595 |
| `view.show-filmstrip` | view | works | passed |  | 596 |
| `view.mode.rows` | view | works | passed |  | 597 |
| `view.mode.viewing-hides-toolbar` | view | broken | passed |  | 598 |
| `view.full-screen` | view | works | passed |  | 599 |
| `view.hide-menus-chevron` | view | not driven | passed |  | 600 |
| `view.live-pointers.toggles` | view | works | passed |  | 601 |
| `view.comments.radios` | view | works | passed |  | 602 |
| `view.comments.show-all-panel` | view | broken | passed |  | 603 |
| `view.comments.modes-markers` | view | not driven | passed |  | 604 |
| `decks.name.follows-heading` | decks | broken | passed |  | 4 |
| `decks.file.open-list-search` | decks | works | failed | File > Open; read the list; type in the search; clear it: 80 decks listed after 12443 ms, first untitled-20260926-gx0e; filtered by nonsense 0; cleared 80 | 14 |
| `decks.file.import-slides-deck` | decks | works | passed |  | 15 |
| `decks.file.details` | decks | works | passed |  | 16 |
| `slides.numbers.apply` | slides | not driven | passed |  | 100 |
| `versions.show-changes-toggle` | versions | works | passed |  | 567 |
| `versions.show-changes-marks` | versions | not driven | failed | a heading edit and an added box after the named version; pick the older version with Show changes on; then off: picked versionHistory.944.pick (named row versionHistory.944.pick); marks with Show changes on 0 (); off 0 | 568 |
| `help.check-slides` | help | works | passed |  | 592 |
| `inbox.bell-panel-toggle` | inbox | broken | failed | click the bell; read the panel; click the bell again: with the switch on; panel open true (aria-pressed true); words "NotificationsMark all readNothing newNotification settings"; Mark all read true; settings link true; panel still open after the second click true (aria-pressed true) | 664 |
| `inbox.settings-persist` | inbox | broken | failed | Tools > Notification settings, None, Save; reopen; reload: level forYou -> picked none; Save closed true; reopened forYou; after a reload forYou | 665 |
| `arrange.insert.selected-after-menu` | arrange | broken | passed |  | 348 |
| `arrange.insert.free-rectangle` | arrange | not driven | passed |  | 349 |
| `slides.layout.title-and-body-single` | slides | broken | passed |  | 101 |
| `slides.layout.subtitle-prompt` | slides | not driven | failed | Apply layout > Title, subtitle and body on the new slide; read the prompts: error: page.evaluate: RangeError: No slide "split-4" | 102 |
| `slides.layout.new-slide-inherits` | slides | not driven | failed | Apply Title and two columns to a slide, New slide; then New slide on the title slide: error: page.evaluate: RangeError: No slide "split-4" | 103 |
| `slides.layout.tile-sentences` | slides | broken | failed | open Apply layout, hover the Title slide tile, read the caption row and the tooltip: error: no filmstrip card split-4 | 104 |
| `slides.import.none-preselected` | slides | broken | failed | File > Import slides, the General Translation brand deck; click three; Shift click a range; None, three, Import: error: no filmstrip card split-4 | 105 |
| `text.link.detect-url` | text | broken | passed |  | 189 |
| `text.link.detect-email` | text | broken | passed |  | 190 |
| `text.select.double-click-address` | text | broken | passed |  | 191 |
| `text.select.shift-home-line` | text | broken | passed |  | 192 |
| `text.link.popover-apply-remove` | text | broken | passed |  | 193 |
| `text.format-options.padding-grid` | text | broken | passed |  | 195 |
| `text.format-options.remembers-section` | text | not driven | passed |  | 196 |
| `text.autofit.shrink-on-overflow` | text | not driven | passed |  | 197 |
| `text.find-replace.count-while-typing` | text | broken | passed |  | 198 |
| `images.caption.add` | images | not driven | passed |  | 264 |
| `images.options.picture-sections-only` | images | broken | passed |  | 265 |
| `images.transparency.slider` | images | broken | passed |  | 266 |
| `images.border.drawn` | images | broken | passed |  | 267 |
| `formatting.alt-text.write-undo` | formatting | works | passed |  | 226 |
| `comments.panel.empty-gesture` | comments | broken | passed |  | 572 |
| `versions.panel.author-you` | versions | broken | passed |  | 570 |
| `versions.field.square` | versions | broken | passed |  | 571 |
| `help.shortcuts.no-duplicates` | help | broken | passed |  | 593 |
| `help.shortcuts.question-key` | help | broken | passed |  | 594 |
| `chrome.bottom-bar.removed` | chrome | broken | passed |  | 682 |
| `chrome.menu.no-tooltip-with-submenu` | chrome | broken | passed |  | 683 |
| `chrome.menu.escape-focus-stage` | chrome | broken | passed |  | 684 |
| `chrome.presence.tooltip` | chrome | broken | passed |  | 685 |
| `chrome.contrast.titanium-light` | chrome | broken | passed |  | 686 |
| `chrome.disabled.token-both-appearances` | chrome | not driven | passed |  | 687 |
| `chrome.field.boundary-3-1` | chrome | broken | passed |  | 688 |
| `chrome.hover.ground` | chrome | broken | passed |  | 689 |
| `chrome.floating.edge-frame` | chrome | broken | passed |  | 690 |
| `chrome.focus.one-ring-rule` | chrome | broken | passed |  | 691 |
| `chrome.filmstrip.one-ring` | chrome | broken | passed |  | 692 |
| `chrome.tooltip.none-on-focus-in-menus` | chrome | broken | passed |  | 693 |
| `chrome.menu.plate-fits-labels` | chrome | broken | passed |  | 694 |
| `chrome.menu.no-mnemonics-mac` | chrome | broken | passed |  | 695 |
| `chrome.select.one-rule` | chrome | broken | passed |  | 696 |
| `chrome.check.draws-check` | chrome | broken | passed |  | 697 |
| `chrome.toolbar.bold-follows-selection` | chrome | broken | passed |  | 698 |
| `menus.icons.insert-rows` | chrome | broken | passed |  | 699 |
| `menus.icons.format-rows` | chrome | broken | passed |  | 701 |
| `menus.icons.one-family` | chrome | works | passed |  | 702 |
| `brand.panel.opens` | brand | not driven | passed |  | 607 |
| `brand.logo.use-on-every-slide` | brand | not driven | passed |  | 609 |
| `brand.logo.remove` | brand | not driven | passed |  | 610 |
| `brand.colors.primary-live` | brand | not driven | passed |  | 611 |
| `brand.colors.palette-row` | brand | broken | passed |  | 612 |
| `brand.colors.control-ids-unique` | brand | broken | passed |  | 613 |
| `brand.colors.version-history-entry` | brand | not driven | passed |  | 614 |
| `brand.colors.role-tooltips` | brand | not driven | passed |  | 615 |
| `brand.background.enter-keeps-open` | brand | broken | failed | Slide > Change background, type #0b3d91, Enter, Done; then Add to theme: the deck back: locator.boundingBox: Timeout 30000ms exceeded. | 616 |
| `brand.fonts.roles` | brand | not driven | passed |  | 617 |
| `brand.counter.format` | brand | not driven | passed |  | 618 |
| `brand.reset.default-kit` | brand | not driven | passed |  | 619 |
| `brand.layout.tiles-in-kit` | brand | broken | passed |  | 620 |
| `brand.agent.set-get` | brand | not driven | passed |  | 621 |
| `fonts.dropdown.opens` | fonts | not driven | passed |  | 625 |
| `fonts.dropdown.apply-selection` | fonts | not driven | passed |  | 626 |
| `fonts.dropdown.search` | fonts | not driven | passed |  | 627 |
| `fonts.format-menu.row` | fonts | not driven | passed |  | 628 |
| `fonts.more-fonts.licence` | fonts | not driven | passed |  | 629 |
| `fonts.face.reload-and-show` | fonts | not driven | passed |  | 630 |
| `fonts.agent.font-list` | fonts | not driven | passed |  | 631 |
| `assist.entry.title-row` | assist | not driven | passed |  | 656 |
| `assist.panel.first-line-and-cards` | assist | not driven | passed |  | 657 |
| `assist.tailor.dialog-one-undo` | assist | not driven | passed |  | 658 |
| `assist.tailor.agent-deck-tailor` | assist | not driven | passed |  | 659 |
| `assist.outside-write.snackbar` | assist | broken | passed |  | 660 |
| `assist.finder.terms` | assist | broken | passed |  | 661 |
| `assist.finder.ask-row` | assist | not driven | passed |  | 662 |
| `assist.agent.propose-accept` | assist | not driven | passed |  | 663 |
| `charts.grid.type-to-edit` | charts | broken | passed |  | 494 |
| `charts.grid.escape-stays` | charts | broken | passed |  | 495 |
| `tables.cell.click-places-caret` | tables | broken | passed |  | 440 |
| `tables.cell.click-then-type` | tables | broken | passed |  | 442 |
| `tables.range.drag-from-selected` | tables | not driven | passed |  | 443 |
| `shapes.label.centred-default` | shapes | broken | passed |  | 376 |
| `shapes.geometry.shapes.hexagon-sheet` | shapes | broken | passed |  | 379 |
| `shapes.geometry.shapes.star5-adjust` | shapes | not driven | passed |  | 380 |
| `shapes.geometry.shapes.pie-arc` | shapes | broken | passed |  | 382 |
| `shapes.geometry.shapes.multipath-can` | shapes | broken | passed |  | 383 |
| `shapes.geometry.shapes.flowchart-own-space` | shapes | broken | passed |  | 384 |
| `shapes.geometry.arrows.right-arrow` | shapes | broken | passed |  | 386 |
| `shapes.geometry.arrows.curved-right` | shapes | broken | passed |  | 387 |
| `shapes.geometry.callouts.wedge-rect` | shapes | broken | passed |  | 389 |
| `shapes.geometry.callouts.cloud` | shapes | broken | passed |  | 390 |
| `shapes.geometry.equation.plus-divide` | shapes | broken | passed |  | 392 |
| `shapes.geometry.pinned-three` | shapes | works | passed |  | 393 |
| `shapes.geometry.sites` | shapes | broken | failed | Insert > Line > Line dragged from the sheet to the hexagon's upper right edge; the same to the rectangle: hexagon (6 sites from the schema, the end dropped on 200,0): shape-7, 0 site marks during the drag, connect {"end":{"block":"vector-hexagon","site":5}}; rectangle: shape-8, 5 site marks, connect {"end":{"block":"shape","site":3}} | 395 |
| `shapes.geometry.resize-keeps-adjust` | shapes | not driven | passed |  | 381 |
| `shapes.insert.grid-shapes` | shapes | broken | passed |  | 378 |
| `shapes.insert.grid-arrows` | shapes | broken | passed |  | 385 |
| `shapes.insert.grid-callouts` | shapes | broken | passed |  | 388 |
| `shapes.insert.grid-equation` | shapes | broken | passed |  | 391 |
| `shapes.icons.named-rows` | shapes | broken | passed |  | 396 |
| `shapes.change-shape.plate` | shapes | not driven | passed |  | 397 |
| `shapes.mask-image.plate` | shapes | not driven | passed |  | 399 |
| `tables.selected.typing-appends` | tables | broken | passed |  | 444 |
| `tables.cell.arrows-cross-cells` | tables | not driven | passed |  | 445 |
| `tables.range.shift-arrows` | tables | not driven | passed |  | 446 |
| `diagrams.label.double-click-opens` | diagrams | broken | passed |  | 514 |
| `diagrams.label.tab-next` | diagrams | not driven | passed |  | 515 |
| `charts.double-click.opens-data` | charts | broken | passed |  | 496 |
| `charts.mark.click-selects-cell` | charts | not driven | passed |  | 497 |
| `tables.range.bold-italic` | tables | broken | passed |  | 447 |
| `tables.range.size-color` | tables | not driven | passed |  | 448 |
| `diagrams.step.one-object` | diagrams | broken | passed |  | 516 |
| `charts.legend.none-from-toolbar` | charts | broken | passed |  | 498 |
| `charts.panel.no-duplicate-controls` | charts | broken | passed |  | 499 |
| `charts.grid.remove-visible` | charts | broken | passed |  | 500 |
| `tables.panel.table-first` | tables | broken | passed |  | 449 |
| `tables.seam.row-drag` | tables | not driven | passed |  | 450 |
| `tables.edge.add-row-column` | tables | not driven | not driven | not on this build: handle.table.add.column (docs/PRODUCT.md 7.1, B3); no "+" on the right or the bottom edge of the selected table (P1, FEATURES.md 2.3 item 2) | 451 |
| `tables.heads.select-row-column` | tables | not driven | not driven | not on this build: handle.table.head.column (docs/PRODUCT.md 7.1, B3); no hover band above the columns of the selected table (P1, FEATURES.md 2.3 item 2) | 452 |
| `tables.bar.row-column-buttons` | tables | not driven | not driven | not on this build: bar.table (docs/PRODUCT.md 7.1, B3); no bar under the selected table (P1, FEATURES.md 2.3 item 3) | 453 |
| `brand.objects.kit-colours-first` | brand | not driven | not driven | not on this build: formatOptions.chart.swatches.primary (docs/PRODUCT.md 7.1, B3); the chart's series swatches list formatOptions.chart.swatches.ink, formatOptions.chart.swatches.paper, formatOptions.chart.swatches.ink-2, formatOptions.chart.swatches.titanium, formatOptions.chart.swatches.hair, formatOptions.chart.swatches.hair-soft first and no kit role (P1, FEATURES.md 2.3 item 4); table fill pl | 622 |
| `arrange.group.tail-text-controls` | arrange | not driven | not driven | not on this build: toolbar.group.text (docs/PRODUCT.md 7.1, B3); chip "Group"; the group tail lists toolbar.fillColor, toolbar.borderColor, toolbar.borderWeight, toolbar.borderDash, toolbar.formatOptions and none of the text controls (P1, FEATURES.md 2.3 item 6) | 352 |
| `tables.command.keeps-caret` | tables | broken | passed |  | 454 |
| `wordart.resize.scales-letters` | wordart | broken | passed |  | 524 |
| `tables.cells.prompt-hovered-only` | tables | works | passed |  | 458 |
| `wordart.tail.fill-outline` | wordart | not driven | passed |  | 525 |
| `fonts.links.licence-v4-1` | fonts | broken | passed |  | 632 |
| `fonts.fallback.in-stack` | fonts | broken | passed |  | 633 |
| `fonts.display-features.inter-only` | fonts | not driven | passed |  | 634 |
| `tables.cells.tabular-figures` | tables | broken | passed |  | 455 |
| `formatting.numerals.tabular-row` | formatting | not driven | passed |  | 228 |
| `fonts.catalog.geist` | fonts | not driven | passed |  | 635 |
| `fonts.catalog.six-families` | fonts | not driven | passed |  | 636 |
| `fonts.picker.search-category` | fonts | not driven | passed |  | 637 |
| `fonts.table.takes-family` | fonts | not driven | not driven | not on this build: toolbar.font (docs/PRODUCT.md 7.1, B1); the Font control on a selected table is drawn disabled ("Inter"); takesFamily is P1 (FEATURES.md 3.5) | 638 |
| `logos.insert.row` | logos | not driven | passed |  | 640 |
| `logos.picker.search` | logos | not driven | passed |  | 641 |
| `logos.picker.paper-and-ink` | logos | not driven | passed |  | 642 |
| `logos.picker.your-brand` | logos | not driven | passed |  | 643 |
| `logos.picker.empty-state` | logos | not driven | passed |  | 644 |
| `logos.picker.licence-words` | logos | not driven | passed |  | 645 |
| `logos.insert.one-click-asset` | logos | not driven | passed |  | 646 |
| `logos.insert.logo-size` | logos | not driven | passed |  | 647 |
| `logos.insert.mono-tint` | logos | not driven | passed |  | 648 |
| `logos.insert.every-slide` | logos | not driven | passed |  | 649 |
| `logos.tailor.find-customer-logo` | logos | not driven | passed |  | 650 |
| `logos.replace-image.row` | logos | not driven | passed |  | 651 |
| `logos.picker.variants` | logos | not driven | not driven | not on this build: dialog.logo.kind.wordmark (docs/PRODUCT.md 7.1, B1); no Symbol, Wordmark, Color or Mono control in the dialog head (P1, FEATURES.md 4.11; the appearance rule chooses) | 652 |
| `logos.kit.find-a-logo` | logos | not driven | not driven | not on this build: panel.brand.logo.find (docs/PRODUCT.md 7.1, B6); no Find a logo beside Replace in the Brand kit panel's Logo section (P1, FEATURES.md 4.5) | 653 |
| `logos.intake.url-sentence` | images | broken | passed |  | 654 |
| `gestures.draw.shape-fill-at-step5` | arrange | broken | passed |  | 528 |
| `gestures.draw.click-at-press` | arrange | broken | passed |  | 529 |
| `gestures.draw.text-box-frame` | arrange | works | passed |  | 530 |
| `gestures.draw.grammar-slide-converts` | arrange | broken | passed |  | 532 |
| `gestures.resize.shape-follows` | arrange | works | passed |  | 535 |
| `gestures.resize.text-reflows` | arrange | not driven | passed |  | 537 |
| `gestures.resize.picture-follows` | arrange | works | passed |  | 539 |
| `gestures.resize.table-follows` | arrange | works | passed |  | 542 |
| `gestures.seam.table-follows` | arrange | works | passed |  | 543 |
| `gestures.resize.chart-follows` | arrange | works | passed |  | 544 |
| `gestures.resize.diagram-follows` | arrange | not driven | passed |  | 547 |
| `gestures.resize.wordart-scales` | arrange | not driven | passed |  | 545 |
| `gestures.move.connector-follows-live` | arrange | broken | passed |  | 550 |
| `gestures.rotate.ring-turns-live` | arrange | broken | passed |  | 553 |
| `gestures.rotate.ring-after-release` | arrange | broken | passed |  | 554 |
| `gestures.frame.one-render-per-frame` | arrange | not driven | passed |  | 557 |
| `gestures.frame.cost-budget` | arrange | not driven | passed |  | 558 |
| `gestures.readout.stays` | arrange | works | passed |  | 559 |
| `gestures.watch.chart-se-after-mark-click` | arrange | flaky | failed | one click on the second bar of the chart, the se handle pressed within 300 ms and dragged by 100 by 60; three times, Cmd+Z after each: try 1: the press about 846 ms after the click; marquee during false, text selection "", readout "664 × 381 · South: 45"; 100,100 560x320 -> 100,100 664x381 (resized true) \| try 2: the press about 942 ms after the click; marquee during false, text selection "", rea | 561 |
| `tables.select.ring-with-cell-open` | tables | broken | passed |  | 463 |
| `tables.cell.ring-on-cell` | tables | broken | passed |  | 464 |
| `tables.cells.empty-grid-guides` | tables | broken | passed |  | 465 |
| `tables.light-appearance-guides` | tables | not driven | passed |  | 466 |
| `tables.insert.box-fits-rows` | tables | broken | passed |  | 461 |
| `tables.rows.grow-with-text` | tables | broken | passed |  | 468 |
| `tables.resize.rows-share-extra` | tables | broken | passed |  | 469 |
| `tables.seam.visible-with-cell-open` | tables | broken | passed |  | 470 |
| `tables.heads.header-toggle` | tables | not driven | not driven | not on this build: handle.table.head.row (docs/PRODUCT.md 7.1, B5); no row head beside the selected table (docs/OBJECTS.md 3.3 item 4) | 471 |
| `tables.panel.section-words` | tables | broken | passed |  | 472 |
| `charts.pie.add-series-refused` | charts | broken | passed |  | 503 |
| `diagrams.member.duplicate-delete` | diagrams | not driven | passed |  | 518 |
| `lines.chip.kind-name` | lines | broken | passed |  | 409 |

## Console errors (509)

- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 404 ()
- console: Failed to load resource: the server responded with a status of 503 ()
- console: Failed to load resource: the server responded with a status of 503 ()
- console: Failed to load resource: the server responded with a status of 503 ()
- console: Failed to load resource: the server responded with a status of 503 ()
- console: Failed to load resource: the server responded with a status of 503 ()
- console: Failed to load resource: the server responded with a status of 503 ()
- console: Failed to load resource: the server responded with a status of 503 ()
- console: Failed to load resource: the server responded with a status of 503 ()
- console: Failed to load resource: the server responded with a status of 503 ()
- console: Failed to load resource: the server responded with a status of 503 ()
- console: Failed to load resource: the server responded with a status of 503 ()
- console: Failed to load resource: the server responded with a status of 503 ()
- console: Failed to load resource: the server responded with a status of 503 ()
- console: Failed to load resource: the server responded with a status of 503 ()
