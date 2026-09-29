# Core walk matrix

Base http://localhost:4448, started 2026-09-29T05:16:20.416Z, 3106 s, deck untitled-20260929-2acl. 701 probe rows: 494 passed, 31 failed, 19 not driven, 157 no step. Verdict failed with the parked list inbox, templates; exit 1. A row passes only when every tagged step of it passed; a not driven row is never counted as passed.

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
| `decks.save.acknowledged` | decks | flaky | passed |  | 599 |
| `decks.editor.move-to-trash` | decks | works | passed |  | 600 |
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
| `slides.layout.typed-title-round-trip` | slides | works | failed | type a title, apply Main point, then Title and body: error: page.evaluate: Execution context was destroyed, most likely because of a navigation | 87 |
| `slides.layout.snackbar-counts-typed-only` | slides | broken | failed | apply Title slide to an untouched slide: error: page.evaluate: TypeError: Cannot read properties of undefined (reading 'studio') | 88 |
| `slides.layout.undo-typed` | slides | works | failed | Cmd+Z after a layout change on a typed slide: error: page.evaluate: TypeError: Cannot read properties of undefined (reading 'studio') | 89 |
| `slides.notes.type` | slides | works | not driven | setup failed: trim the deck to 4 slides | 91 |
| `slides.notes.per-slide` | slides | works | not driven | setup failed: trim the deck to 4 slides | 92 |
| `slides.notes.resize-handle` | slides | works | not driven | setup failed: trim the deck to 4 slides | 93 |
| `slides.notes.reload` | slides | works | not driven | setup failed: trim the deck to 4 slides | 94 |
| `slides.counter.footer-and-cards` | slides | works | not driven | setup failed: trim the deck to 4 slides | 95 |
| `slides.hash.click-and-reload` | slides | works | not driven | setup failed: trim the deck to 4 slides | 96 |
| `slides.reorder.menu-up-down-beginning` | slides | not driven | passed |  | 52 |
| `slides.reorder.cmd-shift-up-down` | slides | not driven | passed |  | 53 |
| `slides.notes.view-menu-toggle` | slides | not driven | not driven | setup failed: trim the deck to 4 slides | 97 |
| `slides.context.empty-canvas` | slides | not driven | not driven | setup failed: trim the deck to 4 slides | 98 |
| `text.title.single-click` | text | broken | passed |  | 105 |
| `text.title.double-click` | text | works | passed |  | 106 |
| `text.title.type-escape` | text | works | passed |  | 107 |
| `text.selected.typing-replaces` | text | not driven | passed |  | 108 |
| `text.selected.enter-appends` | text | not driven | passed |  | 109 |
| `text.title.double-click-enters` | text | not driven | passed |  | 110 |
| `text.caret.click-mid-word` | text | works | passed |  | 111 |
| `text.caret.home-end` | text | works | passed |  | 112 |
| `text.caret.shift-arrow-replace` | text | works | passed |  | 113 |
| `text.caret.shift-home-end` | text | works | passed |  | 114 |
| `text.caret.backspace-word` | text | works | passed |  | 115 |
| `text.caret.option-backspace` | text | works | passed |  | 116 |
| `text.caret.delete` | text | works | passed |  | 117 |
| `text.caret.cmd-a` | text | works | passed |  | 118 |
| `text.title.enter-commits` | text | works | passed |  | 119 |
| `text.session.escape-twice` | text | works | passed |  | 120 |
| `text.subtitle.double-click-type` | text | works | passed |  | 121 |
| `text.subtitle.enter-new-line` | text | works | passed |  | 122 |
| `text.subtitle.shift-enter` | text | works | passed |  | 123 |
| `text.subtitle.arrows-backspace-join` | text | works | passed |  | 124 |
| `text.subtitle.escape-commits` | text | works | passed |  | 125 |
| `text.textbox.insert-click-type` | text | works | passed |  | 127 |
| `text.textbox.insert-drag` | text | works | passed |  | 128 |
| `text.textbox.drag-inside-moves` | text | broken | passed |  | 129 |
| `text.textbox.burst-reliability` | text | broken | passed |  | 131 |
| `text.toolbar.swaps-on-select` | text | works | passed |  | 132 |
| `text.fontsize.type-enter` | text | works | passed |  | 133 |
| `text.fontsize.plus-minus` | text | works | passed |  | 134 |
| `text.bold.toolbar` | text | works | passed |  | 135 |
| `text.bold.cmd-b-word` | text | works | passed |  | 136 |
| `text.italic.toolbar-word` | text | broken | passed |  | 137 |
| `text.italic.cmd-i-word` | text | works | passed |  | 138 |
| `text.underline.cmd-u-word` | text | works | passed |  | 139 |
| `text.underline.toolbar` | text | works | passed |  | 141 |
| `text.strikethrough.cmd-shift-x` | text | works | passed |  | 140 |
| `text.strikethrough.menu` | text | works | passed |  | 142 |
| `text.color.swatch-on-word` | text | broken | passed |  | 143 |
| `text.align.toolbar-and-key` | text | works | passed |  | 144 |
| `text.spacing.toolbar` | text | works | passed |  | 145 |
| `text.list.bulleted-toolbar` | text | broken | passed |  | 146 |
| `text.list.numbered-toolbar` | text | broken | passed |  | 147 |
| `text.list.bulleted-menu-preset` | text | works | passed |  | 148 |
| `text.indent.toolbar` | text | works | passed |  | 151 |
| `text.indent.keys` | text | works | passed |  | 152 |
| `text.link.cmd-k-enter` | text | broken | passed |  | 153 |
| `text.clear-formatting` | text | works | passed |  | 155 |
| `text.format-menu.rows-enabled` | text | works | passed |  | 156 |
| `text.format-menu.size-increase` | text | works | passed |  | 157 |
| `text.format-menu.align-left` | text | works | passed |  | 159 |
| `text.format-menu.spacing-double` | text | works | passed |  | 161 |
| `text.format-menu.text-fitting` | text | not driven | passed |  | 163 |
| `text.autofit.title-wraps` | text | works | failed | type a long title into the title slide: lines 1; split words 0; overlap with the subtitle 0 px²; inside the sheet true | 165 |
| `text.autofit.textbox-grow` | text | broken | passed |  | 166 |
| `text.clipboard.within-box` | text | works | passed |  | 167 |
| `text.clipboard.between-boxes` | text | works | passed |  | 168 |
| `text.clipboard.paste-without-formatting` | text | not driven | not driven | manual: headless Chromium does not synthesize Cmd+Shift+V as a paste; the step is docs/gslides-parity/focus/manual-checklist.md | 169 |
| `text.find-replace.replace-all` | text | works | passed |  | 170 |
| `text.find-replace.shortcut` | text | flaky | passed |  | 171 |
| `text.persistence.reload` | text | works | passed |  | 176 |
| `text.list.numbered-menu-preset` | text | not driven | passed |  | 149 |
| `text.list.chords` | text | not driven | passed |  | 150 |
| `text.link.toolbar-button` | text | not driven | passed |  | 154 |
| `text.format-options.panel` | text | not driven | passed |  | 164 |
| `text.layout-runs.type` | text | not driven | passed |  | 175 |
| `text.context.text-block` | text | not driven | passed |  | 172 |
| `text.context.text-selection` | text | not driven | passed |  | 173 |
| `text.context.inside-session` | text | broken | passed |  | 174 |
| `text.format-menu.size-decrease` | text | not driven | passed |  | 158 |
| `text.format-menu.spacing-single-1-15` | text | not driven | passed |  | 162 |
| `text.format-menu.align-indent-rows` | text | not driven | passed |  | 160 |
| `text.textbox.toolbar-button` | text | not driven | passed |  | 130 |
| `images.insert.toolbar-sources` | images | works | passed |  | 228 |
| `images.select.chip-handles-tail` | images | works | passed |  | 230 |
| `images.delete.key` | images | works | passed |  | 231 |
| `images.move.drag-frame` | images | works | passed |  | 232 |
| `images.guides.edge-snap` | images | works | passed |  | 234 |
| `images.guides.centre-y` | images | works | passed |  | 235 |
| `images.guides.centre-x` | images | flaky | passed |  | 236 |
| `images.nudge.arrows` | images | works | passed |  | 237 |
| `images.resize.eight-handles` | images | works | passed |  | 238 |
| `images.resize.eight-handles-shift` | images | works | passed |  | 239 |
| `images.resize.edge-fill` | images | broken | passed |  | 241 |
| `images.resize.alt-centre` | images | works | passed |  | 240 |
| `images.rotate.ring` | images | works | passed |  | 242 |
| `images.crop.double-click` | images | works | passed |  | 243 |
| `images.crop.east-edge` | images | works | passed |  | 244 |
| `images.crop.south-edge` | images | works | passed |  | 245 |
| `images.crop.enter` | images | works | passed |  | 246 |
| `images.crop.undo` | images | works | passed |  | 247 |
| `images.crop.redo` | images | works | passed |  | 248 |
| `images.crop.menu-escape` | images | works | passed |  | 249 |
| `images.crop.toolbar-escape-cancels` | images | broken | passed |  | 250 |
| `images.options.panel` | images | works | passed |  | 251 |
| `images.options.transparency` | images | works | passed |  | 252 |
| `images.options.reset` | images | works | failed | Adjustments > Reset: opacity 0.39; stored transparency true | 253 |
| `images.reset-image.menu` | images | works | passed |  | 254 |
| `images.background.colour` | images | works | passed |  | 257 |
| `images.background.toolbar` | images | works | passed |  | 258 |
| `images.background.reset` | images | works | passed |  | 261 |
| `images.present.picture-and-ground` | images | works | passed |  | 260 |
| `images.context.image` | images | not driven | passed |  | 256 |
| `images.options.menu-row` | images | not driven | passed |  | 255 |
| `images.background.hex-field` | images | not driven | passed |  | 259 |
| `arrange.select.click` | arrange | works | passed |  | 268 |
| `arrange.select.shift-add` | arrange | works | passed |  | 269 |
| `arrange.multi.drag-inside-moves-all` | arrange | broken | passed |  | 270 |
| `arrange.select.shift-remove` | arrange | works | passed |  | 271 |
| `arrange.select.marquee` | arrange | works | passed |  | 272 |
| `arrange.select.marquee-partial` | arrange | works | passed |  | 273 |
| `arrange.select.click-away` | arrange | works | passed |  | 274 |
| `arrange.select.cmd-a` | arrange | works | passed |  | 275 |
| `arrange.select.escape` | arrange | works | passed |  | 276 |
| `arrange.order.bring-to-front` | arrange | works | passed |  | 277 |
| `arrange.order.send-to-back` | arrange | works | passed |  | 278 |
| `arrange.order.bring-forward` | arrange | works | passed |  | 279 |
| `arrange.order.send-backward` | arrange | works | passed |  | 280 |
| `arrange.order.keys` | arrange | works | passed |  | 281 |
| `arrange.align.left` | arrange | works | passed |  | 282 |
| `arrange.align.center` | arrange | works | passed |  | 283 |
| `arrange.align.right` | arrange | flaky | passed |  | 284 |
| `arrange.align.top` | arrange | broken | passed |  | 285 |
| `arrange.align.middle` | arrange | works | passed |  | 286 |
| `arrange.align.bottom` | arrange | broken | passed |  | 287 |
| `arrange.align.single-to-slide` | arrange | works | passed |  | 288 |
| `arrange.center.horizontal` | arrange | works | passed |  | 289 |
| `arrange.center.vertical` | arrange | works | passed |  | 290 |
| `arrange.undo.toolbar-on-arrange` | arrange | works | passed |  | 291 |
| `arrange.undo.menu-on-arrange` | arrange | works | passed |  | 292 |
| `arrange.clipboard.copy-paste` | arrange | works | passed |  | 293 |
| `arrange.clipboard.delete` | arrange | works | passed |  | 294 |
| `arrange.clipboard.undo-redo-delete` | arrange | works | passed |  | 295 |
| `arrange.clipboard.cut-paste-undo` | arrange | flaky | passed |  | 296 |
| `arrange.clipboard.menu-copy-paste` | arrange | flaky | passed |  | 297 |
| `arrange.clipboard.paste-after-new-slide-button` | arrange | broken | passed |  | 298 |
| `arrange.clipboard.paste-with-filmstrip-focus` | arrange | broken | passed |  | 299 |
| `arrange.clipboard.paste-keeps-position` | arrange | works | passed |  | 300 |
| `arrange.duplicate.cmd-d` | arrange | works | passed |  | 301 |
| `arrange.duplicate.menu-selects-copy` | arrange | broken | passed |  | 302 |
| `arrange.duplicate.nothing-selected` | arrange | works | passed |  | 303 |
| `arrange.redo.after-undone-duplicate` | arrange | broken | passed |  | 304 |
| `arrange.keys.backspace-empty-selection` | arrange | broken | passed |  | 305 |
| `arrange.nudge.arrows` | arrange | works | passed |  | 306 |
| `arrange.nudge.shift` | arrange | works | passed |  | 307 |
| `arrange.nudge.undo` | arrange | works | passed |  | 308 |
| `arrange.zoom.box-reads` | arrange | works | passed |  | 309 |
| `arrange.zoom.menu-in` | arrange | broken | passed |  | 314 |
| `arrange.zoom.cmd-minus` | arrange | broken | passed |  | 313 |
| `arrange.zoom.cmd-plus` | arrange | broken | passed |  | 312 |
| `arrange.zoom.fit` | arrange | flaky | passed |  | 316 |
| `arrange.zoom.type-percent` | arrange | works | passed |  | 310 |
| `arrange.zoom.arrow-menu` | arrange | works | passed |  | 317 |
| `arrange.zoom.cmd-0` | arrange | works | passed |  | 311 |
| `arrange.zoom.menu-out` | arrange | broken | passed |  | 315 |
| `arrange.readout.fit` | arrange | works | passed |  | 319 |
| `arrange.readout.200` | arrange | works | passed |  | 320 |
| `arrange.selection-colour.light` | arrange | works | passed |  | 322 |
| `arrange.selection-colour.dark` | arrange | works | passed |  | 321 |
| `arrange.escape.text-then-selection` | arrange | works | passed |  | 323 |
| `arrange.zoom.menu-presets` | arrange | not driven | passed |  | 318 |
| `arrange.toolbar.select` | arrange | not driven | passed |  | 324 |
| `shapes.insert.rectangle-click` | shapes | works | passed |  | 353 |
| `shapes.insert.rounded-click` | shapes | works | passed |  | 354 |
| `shapes.insert.ellipse-click` | shapes | works | passed |  | 355 |
| `shapes.insert.rectangle-drag` | shapes | works | passed |  | 356 |
| `shapes.insert.ellipse-drag` | shapes | works | passed |  | 357 |
| `shapes.insert.named-rows` | shapes | not driven | passed |  | 358 |
| `shapes.default-look` | shapes | broken | passed |  | 359 |
| `shapes.select` | shapes | works | passed |  | 360 |
| `shapes.move` | shapes | not driven | passed |  | 361 |
| `shapes.resize.eight-handles` | shapes | not driven | passed |  | 362 |
| `shapes.rotate` | shapes | not driven | passed |  | 363 |
| `shapes.fill.colour` | shapes | not driven | passed |  | 364 |
| `shapes.border.colour-weight-dash` | shapes | not driven | passed |  | 365 |
| `shapes.text.type-align-bold` | shapes | not driven | passed |  | 366 |
| `shapes.duplicate-delete-undo-redo` | shapes | not driven | passed |  | 367 |
| `shapes.format-options.size-position` | shapes | not driven | passed |  | 368 |
| `shapes.reload-and-viewer` | shapes | not driven | passed |  | 370 |
| `shapes.context.shape` | shapes | not driven | passed |  | 369 |
| `lines.insert.line-drag` | lines | not driven | no step | the area was not run (--only) |  |
| `lines.insert.arrow-drag` | lines | not driven | no step | the area was not run (--only) |  |
| `lines.end-handle` | lines | not driven | no step | the area was not run (--only) |  |
| `lines.tail.colour-weight-dash-ends` | lines | not driven | no step | the area was not run (--only) |  |
| `lines.context.line` | lines | not driven | no step | the area was not run (--only) |  |
| `share.file-menu-share-with-others` | share | not driven | passed |  | 496 |
| `versions.open-from-last-edit` | versions | works | failed | click the Last edit words in the title row: error: locator.waitFor: Timeout 8000ms exceeded. | 497 |
| `versions.pick` | versions | works | failed | pick a version in the panel: no version rows in the panel | 498 |
| `versions.name-current` | versions | works | failed | Name current version, type a name, Save: error: locator.boundingBox: Timeout 30000ms exceeded. | 499 |
| `versions.undo-restore` | versions | not driven | failed | Restore an earlier version, then Cmd+Z: no Restore control in the panel | 500 |
| `export.download-submenu` | export | works | no step | the area was not run (--only) |  |
| `export.pdf.dialog` | export | works | no step | the area was not run (--only) |  |
| `export.pdf.skipped-check` | export | works | no step | the area was not run (--only) |  |
| `export.pdf.close-paths` | export | works | no step | the area was not run (--only) |  |
| `export.pptx.dialog` | export | works | no step | the area was not run (--only) |  |
| `export.print.preview-page` | export | works | no step | the area was not run (--only) |  |
| `export.print.layout-with-notes` | export | works | no step | the area was not run (--only) |  |
| `export.print.include-skipped` | export | works | no step | the area was not run (--only) |  |
| `export.print.print-button` | export | works | no step | the area was not run (--only) |  |
| `export.print.close-preview` | export | works | no step | the area was not run (--only) |  |
| `export.print.file-menu-after-close` | export | flaky | no step | the area was not run (--only) |  |
| `export.print.menu-row` | export | works | no step | the area was not run (--only) |  |
| `export.print.cmd-p` | export | works | no step | the area was not run (--only) |  |
| `help.help-dialog` | help | works | no step | the area was not run (--only) |  |
| `help.documentation-link` | help | broken | no step | the area was not run (--only) |  |
| `help.keyboard-shortcuts` | help | works | no step | the area was not run (--only) |  |
| `help.search-the-menus` | help | works | no step | the area was not run (--only) |  |
| `surface.menus.open-close-escape` | surface | not driven | no step | the area was not run (--only) |  |
| `surface.cleanup` | surface | works | passed |  | 601 |
| `shapes.text.colour-toolbar` | shapes | broken | passed |  | 371 |
| `shapes.text.enter-opens-label` | shapes | works | passed |  | 372 |
| `shapes.borders-lines.menu` | shapes | works | passed |  | 373 |
| `lines.connector.elbow` | lines | works | no step | the area was not run (--only) |  |
| `lines.connector.curved` | lines | works | no step | the area was not run (--only) |  |
| `lines.connector.re-end` | lines | not driven | no step | the area was not run (--only) |  |
| `lines.insert.arrow-head` | lines | works | no step | the area was not run (--only) |  |
| `lines.tail.line-start-end-menu` | lines | not driven | no step | the area was not run (--only) |  |
| `tables.insert.grid` | tables | works | passed |  | 400 |
| `tables.cell.double-click-type` | tables | works | passed |  | 401 |
| `tables.cell.tab-from-written` | tables | broken | passed |  | 402 |
| `tables.cell.tab-from-empty` | tables | works | passed |  | 403 |
| `tables.cell.shift-tab` | tables | not driven | passed |  | 404 |
| `tables.cell.tab-last-appends-row` | tables | works | passed |  | 405 |
| `tables.menu.format-table-with-session` | tables | broken | passed |  | 406 |
| `tables.menu.format-table-selected` | tables | broken | passed |  | 407 |
| `tables.menu.format-table-rows` | tables | not driven | passed |  | 408 |
| `tables.context.rows` | tables | works | passed |  | 409 |
| `tables.context.insert-delete` | tables | works | passed |  | 410 |
| `tables.column.insert-keeps-widths` | tables | broken | passed |  | 411 |
| `tables.column.resize-seam` | tables | not driven | passed |  | 412 |
| `tables.cell.align-menu` | tables | broken | passed |  | 413 |
| `tables.cell.align-toolbar` | tables | broken | passed |  | 414 |
| `tables.select.resize` | tables | works | passed |  | 415 |
| `tables.cell.fill-border-tail` | tables | not driven | passed |  | 416 |
| `tables.cells.merge-unmerge` | tables | not driven | passed |  | 417 |
| `tables.tail.merge-unmerge-buttons` | tables | not driven | passed |  | 418 |
| `tables.distribute.rows-columns` | tables | not driven | passed |  | 419 |
| `tables.light-appearance` | tables | not driven | passed |  | 420 |
| `tables.present` | tables | works | passed |  | 421 |
| `tables.reload` | tables | works | passed |  | 422 |
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
| `diagrams.panel` | diagrams | works | no step | the area was not run (--only) |  |
| `diagrams.insert.group` | diagrams | works | no step | the area was not run (--only) |  |
| `diagrams.select-move` | diagrams | works | no step | the area was not run (--only) |  |
| `diagrams.edit-label` | diagrams | not driven | no step | the area was not run (--only) |  |
| `diagrams.light-appearance` | diagrams | not driven | no step | the area was not run (--only) |  |
| `diagrams.present` | diagrams | works | no step | the area was not run (--only) |  |
| `diagrams.reload` | diagrams | not driven | no step | the area was not run (--only) |  |
| `wordart.insert` | wordart | works | passed |  | 491 |
| `wordart.edit` | wordart | not driven | passed |  | 492 |
| `wordart.light-appearance` | wordart | not driven | passed |  | 493 |
| `formatting.superscript.chord` | formatting | works | passed |  | 199 |
| `formatting.subscript.chord` | formatting | works | passed |  | 200 |
| `formatting.superscript.menu-word` | formatting | broken | passed |  | 201 |
| `formatting.subscript.menu-word` | formatting | broken | passed |  | 202 |
| `formatting.italic.menu-word` | formatting | broken | passed |  | 203 |
| `formatting.context.selection-rows` | formatting | not driven | passed |  | 204 |
| `formatting.capitalization.upper` | formatting | works | passed |  | 205 |
| `formatting.capitalization.lower` | formatting | works | passed |  | 206 |
| `formatting.capitalization.title` | formatting | works | passed |  | 207 |
| `formatting.align.justified-menu` | formatting | works | passed |  | 208 |
| `formatting.align.justified-chord` | formatting | works | passed |  | 209 |
| `formatting.align.toolbar-justify` | formatting | not driven | passed |  | 210 |
| `formatting.spacing.add-before-remove` | formatting | works | passed |  | 211 |
| `formatting.spacing.add-after` | formatting | works | passed |  | 212 |
| `formatting.spacing.custom-dialog` | formatting | works | passed |  | 213 |
| `formatting.spacing.1-15-value` | formatting | broken | passed |  | 214 |
| `formatting.highlight.word` | formatting | works | passed |  | 215 |
| `formatting.paint-format.button` | formatting | works | passed |  | 217 |
| `formatting.paint-format.chords` | formatting | not driven | passed |  | 218 |
| `formatting.clear.inline-marks` | formatting | broken | passed |  | 219 |
| `formatting.theme.panel-appearance` | formatting | works | passed |  | 220 |
| `formatting.theme.toolbar-button` | formatting | works | passed |  | 221 |
| `formatting.theme.import-hidden` | formatting | not driven | passed |  | 222 |
| `formatting.persistence` | formatting | works | passed |  | 223 |
| `text.title.one-click-tail` | text | broken | passed |  | 177 |
| `text.title.bold-menu` | text | broken | passed |  | 178 |
| `text.title.bold-cmd-b` | text | broken | passed |  | 179 |
| `text.title.align-menu` | text | broken | passed |  | 180 |
| `text.title.size-menu` | text | broken | passed |  | 181 |
| `text.title.format-options-marks` | text | broken | passed |  | 182 |
| `text.title.apply-layout-after-format` | text | not driven | passed |  | 183 |
| `text.fontsize.type-one-undo` | text | broken | passed |  | 184 |
| `text.format-options.field-one-undo` | text | broken | passed |  | 185 |
| `arrange.distribute.horizontal` | arrange | works | passed |  | 325 |
| `arrange.distribute.vertical` | arrange | works | passed |  | 326 |
| `arrange.distribute.needs-three` | arrange | works | passed |  | 327 |
| `arrange.rotate.quarter-turns` | arrange | works | passed |  | 328 |
| `arrange.rotate.flips-menu` | arrange | works | passed |  | 329 |
| `arrange.group.chords` | arrange | works | passed |  | 330 |
| `arrange.group.menu-regroup` | arrange | works | passed |  | 331 |
| `arrange.group.context-rows` | arrange | not driven | passed |  | 332 |
| `arrange.context.rotate-distribute` | arrange | not driven | passed |  | 333 |
| `arrange.ruler.show-hide` | arrange | works | passed |  | 334 |
| `arrange.guides.from-ruler` | arrange | works | passed |  | 335 |
| `arrange.guides.show-toggle` | arrange | works | passed |  | 336 |
| `arrange.guides.add-vertical-horizontal` | arrange | works | passed |  | 337 |
| `arrange.guides.drag` | arrange | flaky | passed |  | 338 |
| `arrange.snap.guides-on-off` | arrange | works | passed |  | 339 |
| `arrange.snap.grid-toggle` | arrange | works | passed |  | 340 |
| `arrange.snap.grid-effect` | arrange | not driven | passed |  | 341 |
| `arrange.guides.context` | arrange | works | passed |  | 342 |
| `arrange.guides.clear` | arrange | works | passed |  | 343 |
| `arrange.select-none.menu` | arrange | works | passed |  | 344 |
| `chrome.split.one-box` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.split.hover-no-inversion` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.split.click-show` | chrome | works | no step | the area was not run (--only) |  |
| `chrome.split.chevron-menu-aligned` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.split.enter-chevron` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.split.enter-label` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.split.space-both` | chrome | works | no step | the area was not run (--only) |  |
| `chrome.split.arrow-down-label` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.split.tab-order` | chrome | flaky | no step | the area was not run (--only) |  |
| `chrome.split.aria` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.split.collapse-900` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.separators.once` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.separators.toolbar-dividers` | chrome | works | no step | the area was not run (--only) |  |
| `chrome.cluster.gaps-heights` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.comments-glyph.toggle` | chrome | broken | no step | the area was not run (--only) |  |
| `view.appearance.rows` | view | works | passed |  | 507 |
| `view.show-filmstrip` | view | works | passed |  | 508 |
| `view.mode.rows` | view | works | passed |  | 509 |
| `view.mode.viewing-hides-toolbar` | view | broken | passed |  | 510 |
| `view.full-screen` | view | works | passed |  | 511 |
| `view.hide-menus-chevron` | view | not driven | passed |  | 512 |
| `view.live-pointers.toggles` | view | works | passed |  | 513 |
| `view.comments.radios` | view | works | passed |  | 514 |
| `view.comments.show-all-panel` | view | broken | passed |  | 515 |
| `view.comments.modes-markers` | view | not driven | passed |  | 516 |
| `decks.name.follows-heading` | decks | broken | passed |  | 4 |
| `decks.file.open-list-search` | decks | works | passed |  | 14 |
| `decks.file.import-slides-deck` | decks | works | passed |  | 15 |
| `decks.file.details` | decks | works | passed |  | 16 |
| `slides.numbers.apply` | slides | not driven | not driven | setup failed: trim the deck to 4 slides | 99 |
| `versions.show-changes-toggle` | versions | works | passed |  | 501 |
| `versions.show-changes-marks` | versions | not driven | failed | a heading edit and an added box after the named version; pick the older version with Show changes on; then off: picked versionHistory.448.pick (named row null); marks with Show changes on 0 (); off 0 | 502 |
| `help.check-slides` | help | works | no step | the area was not run (--only) |  |
| `inbox.bell-panel-toggle` | inbox | broken | no step | the area was not run (--only) |  |
| `inbox.settings-persist` | inbox | broken | no step | the area was not run (--only) |  |
| `arrange.insert.selected-after-menu` | arrange | broken | passed |  | 346 |
| `arrange.insert.free-rectangle` | arrange | not driven | passed |  | 347 |
| `slides.layout.title-and-body-single` | slides | broken | not driven | setup failed: trim the deck to 4 slides | 100 |
| `slides.layout.subtitle-prompt` | slides | not driven | not driven | setup failed: trim the deck to 4 slides | 101 |
| `slides.layout.new-slide-inherits` | slides | not driven | not driven | setup failed: trim the deck to 4 slides | 102 |
| `slides.layout.tile-sentences` | slides | broken | not driven | setup failed: trim the deck to 4 slides | 103 |
| `slides.import.none-preselected` | slides | broken | not driven | setup failed: trim the deck to 4 slides | 104 |
| `text.link.detect-url` | text | broken | passed |  | 187 |
| `text.link.detect-email` | text | broken | passed |  | 188 |
| `text.select.double-click-address` | text | broken | passed |  | 189 |
| `text.select.shift-home-line` | text | broken | passed |  | 190 |
| `text.link.popover-apply-remove` | text | broken | passed |  | 191 |
| `text.format-options.padding-grid` | text | broken | passed |  | 193 |
| `text.format-options.remembers-section` | text | not driven | passed |  | 194 |
| `text.autofit.shrink-on-overflow` | text | not driven | passed |  | 195 |
| `text.find-replace.count-while-typing` | text | broken | passed |  | 196 |
| `images.caption.add` | images | not driven | not driven | not on this build: format.image.addCaption (docs/PRODUCT.md 7.1, B2); the picture's menu lists edit.cut, edit.copy, edit.paste, edit.delete, edit.duplicate, arrange.order, arrange.rotate, arrange.centerOnPage, arrange.align, format.image.replaceImage, format.image.cropImage, format.image.maskImage, format.image.resetImage, format.image.imageOptions, format.formatOptions, format.altText, insert.com | 262 |
| `images.options.picture-sections-only` | images | broken | passed |  | 263 |
| `images.transparency.slider` | images | broken | passed |  | 264 |
| `images.border.drawn` | images | broken | passed |  | 265 |
| `formatting.alt-text.write-undo` | formatting | works | passed |  | 224 |
| `comments.panel.empty-gesture` | comments | broken | passed |  | 506 |
| `versions.panel.author-you` | versions | broken | passed |  | 504 |
| `versions.field.square` | versions | broken | passed |  | 505 |
| `help.shortcuts.no-duplicates` | help | broken | no step | the area was not run (--only) |  |
| `help.shortcuts.question-key` | help | broken | no step | the area was not run (--only) |  |
| `chrome.bottom-bar.removed` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.menu.no-tooltip-with-submenu` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.menu.escape-focus-stage` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.presence.tooltip` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.contrast.titanium-light` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.disabled.token-both-appearances` | chrome | not driven | no step | the area was not run (--only) |  |
| `chrome.field.boundary-3-1` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.hover.ground` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.floating.edge-frame` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.focus.one-ring-rule` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.filmstrip.one-ring` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.tooltip.none-on-focus-in-menus` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.menu.plate-fits-labels` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.menu.no-mnemonics-mac` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.select.one-rule` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.check.draws-check` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.toolbar.bold-follows-selection` | chrome | broken | no step | the area was not run (--only) |  |
| `menus.icons.insert-rows` | chrome | broken | no step | the area was not run (--only) |  |
| `menus.icons.format-rows` | chrome | broken | no step | the area was not run (--only) |  |
| `menus.icons.one-family` | chrome | works | no step | the area was not run (--only) |  |
| `brand.panel.opens` | brand | not driven | no step | the area was not run (--only) |  |
| `brand.logo.use-on-every-slide` | brand | not driven | no step | the area was not run (--only) |  |
| `brand.logo.remove` | brand | not driven | no step | the area was not run (--only) |  |
| `brand.colors.primary-live` | brand | not driven | no step | the area was not run (--only) |  |
| `brand.colors.palette-row` | brand | broken | no step | the area was not run (--only) |  |
| `brand.colors.control-ids-unique` | brand | broken | no step | the area was not run (--only) |  |
| `brand.colors.version-history-entry` | brand | not driven | no step | the area was not run (--only) |  |
| `brand.colors.role-tooltips` | brand | not driven | no step | the area was not run (--only) |  |
| `brand.background.enter-keeps-open` | brand | broken | no step | the area was not run (--only) |  |
| `brand.fonts.roles` | brand | not driven | no step | the area was not run (--only) |  |
| `brand.counter.format` | brand | not driven | no step | the area was not run (--only) |  |
| `brand.reset.default-kit` | brand | not driven | no step | the area was not run (--only) |  |
| `brand.layout.tiles-in-kit` | brand | broken | no step | the area was not run (--only) |  |
| `brand.agent.set-get` | brand | not driven | no step | the area was not run (--only) |  |
| `fonts.dropdown.opens` | fonts | not driven | no step | the area was not run (--only) |  |
| `fonts.dropdown.apply-selection` | fonts | not driven | no step | the area was not run (--only) |  |
| `fonts.dropdown.search` | fonts | not driven | no step | the area was not run (--only) |  |
| `fonts.format-menu.row` | fonts | not driven | no step | the area was not run (--only) |  |
| `fonts.more-fonts.licence` | fonts | not driven | no step | the area was not run (--only) |  |
| `fonts.face.reload-and-show` | fonts | not driven | no step | the area was not run (--only) |  |
| `fonts.agent.font-list` | fonts | not driven | no step | the area was not run (--only) |  |
| `assist.entry.title-row` | assist | not driven | passed |  | 519 |
| `assist.panel.first-line-and-cards` | assist | not driven | passed |  | 520 |
| `assist.tailor.dialog-one-undo` | assist | not driven | passed |  | 521 |
| `assist.tailor.agent-deck-tailor` | assist | not driven | passed |  | 522 |
| `assist.outside-write.snackbar` | assist | broken | passed |  | 523 |
| `assist.finder.terms` | assist | broken | passed |  | 524 |
| `assist.finder.ask-row` | assist | not driven | passed |  | 525 |
| `assist.agent.propose-accept` | assist | not driven | failed | assist.propose over HTTP, assist.accept with the card, then the card with one byte changed: assist.propose answered 401 {"error":{"name":"ModelCallError","status":401,"message":"The assistant’s model answered 401","action":"assist.propose"}} | 526 |
| `charts.grid.type-to-edit` | charts | broken | passed |  | 478 |
| `charts.grid.escape-stays` | charts | broken | passed |  | 479 |
| `tables.cell.click-places-caret` | tables | broken | passed |  | 425 |
| `tables.cell.click-then-type` | tables | broken | passed |  | 427 |
| `tables.range.drag-from-selected` | tables | not driven | passed |  | 428 |
| `shapes.label.centred-default` | shapes | broken | passed |  | 374 |
| `shapes.geometry.shapes.hexagon-sheet` | shapes | broken | passed |  | 377 |
| `shapes.geometry.shapes.star5-adjust` | shapes | not driven | passed |  | 378 |
| `shapes.geometry.shapes.pie-arc` | shapes | broken | passed |  | 380 |
| `shapes.geometry.shapes.multipath-can` | shapes | broken | passed |  | 381 |
| `shapes.geometry.shapes.flowchart-own-space` | shapes | broken | passed |  | 382 |
| `shapes.geometry.arrows.right-arrow` | shapes | broken | passed |  | 384 |
| `shapes.geometry.arrows.curved-right` | shapes | broken | passed |  | 385 |
| `shapes.geometry.callouts.wedge-rect` | shapes | broken | passed |  | 387 |
| `shapes.geometry.callouts.cloud` | shapes | broken | passed |  | 388 |
| `shapes.geometry.equation.plus-divide` | shapes | broken | passed |  | 390 |
| `shapes.geometry.pinned-three` | shapes | works | passed |  | 391 |
| `shapes.geometry.sites` | shapes | broken | passed |  | 393 |
| `shapes.geometry.resize-keeps-adjust` | shapes | not driven | passed |  | 379 |
| `shapes.insert.grid-shapes` | shapes | broken | passed |  | 376 |
| `shapes.insert.grid-arrows` | shapes | broken | passed |  | 383 |
| `shapes.insert.grid-callouts` | shapes | broken | passed |  | 386 |
| `shapes.insert.grid-equation` | shapes | broken | passed |  | 389 |
| `shapes.icons.named-rows` | shapes | broken | passed |  | 394 |
| `shapes.change-shape.plate` | shapes | not driven | passed |  | 395 |
| `shapes.mask-image.plate` | shapes | not driven | passed |  | 397 |
| `tables.selected.typing-appends` | tables | broken | passed |  | 429 |
| `tables.cell.arrows-cross-cells` | tables | not driven | passed |  | 430 |
| `tables.range.shift-arrows` | tables | not driven | passed |  | 431 |
| `diagrams.label.double-click-opens` | diagrams | broken | no step | the area was not run (--only) |  |
| `diagrams.label.tab-next` | diagrams | not driven | no step | the area was not run (--only) |  |
| `charts.double-click.opens-data` | charts | broken | passed |  | 480 |
| `charts.mark.click-selects-cell` | charts | not driven | passed |  | 481 |
| `tables.range.bold-italic` | tables | broken | passed |  | 432 |
| `tables.range.size-color` | tables | not driven | passed |  | 433 |
| `diagrams.step.one-object` | diagrams | broken | no step | the area was not run (--only) |  |
| `charts.legend.none-from-toolbar` | charts | broken | passed |  | 482 |
| `charts.panel.no-duplicate-controls` | charts | broken | passed |  | 483 |
| `charts.grid.remove-visible` | charts | broken | failed | the grid with the pointer away; the active row's remove control, the series swatch; a right click on a series header: remove control formatOptions.chart.category.0.remove opacity 0 with the row hovered (0 with the pointer away, item 26); series swatch 14 by 14; right click on the series header lists Add series, Remove Series 1 (FEATURES.md 2.2 rank 12, B3) | 484 |
| `tables.panel.table-first` | tables | broken | passed |  | 434 |
| `tables.seam.row-drag` | tables | not driven | passed |  | 435 |
| `tables.edge.add-row-column` | tables | not driven | passed |  | 436 |
| `tables.heads.select-row-column` | tables | not driven | passed |  | 437 |
| `tables.bar.row-column-buttons` | tables | not driven | not driven | not on this build: bar.table (docs/PRODUCT.md 7.1, B3); no bar under the selected table (P1, FEATURES.md 2.3 item 3) | 438 |
| `brand.objects.kit-colours-first` | brand | not driven | no step | the area was not run (--only) |  |
| `arrange.group.tail-text-controls` | arrange | not driven | not driven | not on this build: toolbar.group.text (docs/PRODUCT.md 7.1, B3); chip "Group"; the group tail lists toolbar.fillColor, toolbar.borderColor, toolbar.borderWeight, toolbar.borderDash, toolbar.formatOptions and none of the text controls (P1, FEATURES.md 2.3 item 6) | 350 |
| `tables.command.keeps-caret` | tables | broken | passed |  | 439 |
| `wordart.resize.scales-letters` | wordart | broken | passed |  | 494 |
| `wordart.tail.fill-outline` | wordart | not driven | passed |  | 495 |
| `fonts.links.licence-v4-1` | fonts | broken | no step | the area was not run (--only) |  |
| `fonts.fallback.in-stack` | fonts | broken | no step | the area was not run (--only) |  |
| `fonts.display-features.inter-only` | fonts | not driven | no step | the area was not run (--only) |  |
| `tables.cells.tabular-figures` | tables | broken | passed |  | 440 |
| `formatting.numerals.tabular-row` | formatting | not driven | passed |  | 226 |
| `fonts.catalog.geist` | fonts | not driven | no step | the area was not run (--only) |  |
| `fonts.catalog.six-families` | fonts | not driven | no step | the area was not run (--only) |  |
| `fonts.picker.search-category` | fonts | not driven | no step | the area was not run (--only) |  |
| `fonts.table.takes-family` | fonts | not driven | no step | the area was not run (--only) |  |
| `logos.insert.row` | logos | not driven | no step | the area was not run (--only) |  |
| `logos.picker.search` | logos | not driven | no step | the area was not run (--only) |  |
| `logos.picker.paper-and-ink` | logos | not driven | no step | the area was not run (--only) |  |
| `logos.picker.your-brand` | logos | not driven | no step | the area was not run (--only) |  |
| `logos.picker.empty-state` | logos | not driven | no step | the area was not run (--only) |  |
| `logos.picker.licence-words` | logos | not driven | no step | the area was not run (--only) |  |
| `logos.insert.one-click-asset` | logos | not driven | no step | the area was not run (--only) |  |
| `logos.insert.logo-size` | logos | not driven | no step | the area was not run (--only) |  |
| `logos.insert.mono-tint` | logos | not driven | no step | the area was not run (--only) |  |
| `logos.insert.every-slide` | logos | not driven | no step | the area was not run (--only) |  |
| `logos.tailor.find-customer-logo` | logos | not driven | no step | the area was not run (--only) |  |
| `logos.replace-image.row` | logos | not driven | no step | the area was not run (--only) |  |
| `logos.picker.variants` | logos | not driven | no step | the area was not run (--only) |  |
| `logos.kit.find-a-logo` | logos | not driven | no step | the area was not run (--only) |  |
| `logos.intake.url-sentence` | images | broken | no step | the area was not run (--only) |  |
| `shaders.insert.gallery-thumbnails` | shaders | not driven | no step | the area was not run (--only) |  |
| `shaders.insert.selected-free-rectangle` | shaders | broken | no step | the area was not run (--only) |  |
| `shaders.insert.words` | shaders | broken | no step | the area was not run (--only) |  |
| `shaders.panel.slider-live-undo` | shaders | not driven | no step | the area was not run (--only) |  |
| `shaders.panel.preset-tiles` | shaders | broken | no step | the area was not run (--only) |  |
| `shaders.panel.control-sentences` | shaders | not driven | no step | the area was not run (--only) |  |
| `shaders.panel.kit-colours` | shaders | not driven | no step | the area was not run (--only) |  |
| `shaders.panel.one-home` | shaders | broken | no step | the area was not run (--only) |  |
| `shaders.background.place-answers` | shaders | broken | no step | the area was not run (--only) |  |
| `shaders.perf.one-context` | shaders | not driven | no step | the area was not run (--only) |  |
| `shaders.background.add-to-theme` | shaders | not driven | no step | the area was not run (--only) |  |
| `shaders.frame.scrubber-capture` | shaders | not driven | no step | the area was not run (--only) |  |
| `shaders.view.play-setting` | view | not driven | no step | the area was not run (--only) |  |
| `shaders.insert.gallery-hover-live` | shaders | not driven | no step | the area was not run (--only) |  |
| `gestures.draw.shape-fill-at-step5` | arrange | broken | no step | the area was not run (--only) |  |
| `gestures.draw.click-at-press` | arrange | broken | no step | the area was not run (--only) |  |
| `gestures.draw.text-box-frame` | arrange | works | no step | the area was not run (--only) |  |
| `gestures.draw.grammar-slide-converts` | arrange | broken | no step | the area was not run (--only) |  |
| `gestures.resize.shape-follows` | arrange | works | no step | the area was not run (--only) |  |
| `gestures.resize.text-reflows` | arrange | not driven | no step | the area was not run (--only) |  |
| `gestures.resize.picture-follows` | arrange | works | no step | the area was not run (--only) |  |
| `gestures.resize.table-follows` | arrange | works | no step | the area was not run (--only) |  |
| `gestures.seam.table-follows` | arrange | works | no step | the area was not run (--only) |  |
| `gestures.resize.chart-follows` | arrange | works | no step | the area was not run (--only) |  |
| `gestures.resize.diagram-follows` | arrange | not driven | no step | the area was not run (--only) |  |
| `gestures.resize.wordart-scales` | arrange | not driven | no step | the area was not run (--only) |  |
| `gestures.move.connector-follows-live` | arrange | broken | no step | the area was not run (--only) |  |
| `gestures.rotate.ring-turns-live` | arrange | broken | no step | the area was not run (--only) |  |
| `gestures.rotate.ring-after-release` | arrange | broken | no step | the area was not run (--only) |  |
| `gestures.frame.one-render-per-frame` | arrange | not driven | no step | the area was not run (--only) |  |
| `gestures.frame.cost-budget` | arrange | not driven | no step | the area was not run (--only) |  |
| `gestures.readout.stays` | arrange | works | no step | the area was not run (--only) |  |
| `gestures.watch.chart-se-after-mark-click` | arrange | flaky | no step | the area was not run (--only) |  |
| `tables.select.ring-with-cell-open` | tables | broken | passed |  | 447 |
| `tables.cell.ring-on-cell` | tables | broken | passed |  | 448 |
| `tables.cells.empty-grid-guides` | tables | broken | passed |  | 449 |
| `tables.light-appearance-guides` | tables | not driven | passed |  | 450 |
| `tables.insert.box-fits-rows` | tables | broken | passed |  | 445 |
| `tables.rows.grow-with-text` | tables | broken | passed |  | 452 |
| `tables.resize.rows-share-extra` | tables | broken | passed |  | 453 |
| `tables.seam.visible-with-cell-open` | tables | broken | passed |  | 454 |
| `tables.heads.header-toggle` | tables | not driven | passed |  | 455 |
| `tables.panel.section-words` | tables | broken | passed |  | 456 |
| `charts.pie.add-series-refused` | charts | broken | passed |  | 487 |
| `diagrams.member.duplicate-delete` | diagrams | not driven | no step | the area was not run (--only) |  |
| `lines.chip.kind-name` | lines | broken | no step | the area was not run (--only) |  |
| `tables.cells.no-prompt` | tables | broken | passed |  | 528 |
| `tables.rows.ring-follows-typing` | tables | broken | passed |  | 529 |
| `tables.cell.click-moves-caret` | tables | broken | passed |  | 530 |
| `tables.tail.size-step-ladder` | tables | broken | failed | a typed 3 by 3 table; the header row selected as a range by a drag; the tail's "−" twice, then "+" until 20: range true; field 20 -> 18 -> 17 (stored size 17); back at 20; "+" aria-disabled true "Increase font size"; snackbar none (docs/POLISH.md 2.2 item 5, B1's ToolbarTail.tsx by B2's request) | 531 |
| `tables.insert.box-never-shorter-than-rows` | tables | broken | failed | Insert > Table, the 12 by 4 cell, on the Title and body slide under its title; the grid's size words read: h 137,129 1326x48.4; rows drawn null px (fits false); top at 218 false; size words "12 x 4" (docs/POLISH.md 2.2 item 6, B2) | 534 |
| `tables.heads.keys-act-on-range` | tables | broken | passed |  | 536 |
| `tables.insert.one-placement-rule` | tables | broken | failed | Insert > Table 1 by 1, then 1 by 2, then 3 by 3 on the Title and body slide; Cmd+Z after each: 1x1: y 129 (not 218); 1x2: y 129 (not 218); 3x3: y 129 (not 218) (docs/POLISH.md 2.2 item 8, B2) | 535 |
| `tables.edge.stays-inside-sheet` | tables | broken | passed |  | 537 |
| `tables.range.align-cells-only` | tables | broken | passed |  | 538 |
| `tables.context.object-menu-on-frame` | tables | broken | passed |  | 539 |
| `tables.polish.seams-snap-grid` | tables | broken | failed | a 3 by 3 table selected; the pointer at the second column seam's middle, its tooltip read, a 12 step drag right; the se handle dragged 160 px right; Insert > Table with the pointer moved 30 px left inside the grid's first column: seam handle.pt-seams.column.1: tooltip "Column seam 2Drag to resize the column; the next column takes the difference. Left and Right step 1 px, Shift 10 px.", widths [nul | 540 |
| `text.bold.toolbar-marks-run` | text | broken | failed | "Acme" selected in a text box; the tail's Bold; Cmd+Z; Format > Text > Bold; then the box selected by one click and Bold: tail: selected "Acme", mark true at 700, rest 400, stored "*Acme* renews in Q3"; menu: mark true at 700, rest 400, stored "*Acme* renews in Q3"; whole box: weight 400, stored "*Acme renews in Q3*" (bold true) (docs/POLISH.md 2.3 item 12, B1) | 542 |
| `slides.layout.blank-empty` | slides | broken | passed |  | 596 |
| `text.paragraph.toolbar-live` | text | broken | failed | a two line text box; a session open with the caret in line 1; Center from the tail, then 1.5, then Increase indent: Center: moved within a frame false (after 400 ms false), caret kept true; 1.5: moved within a frame false (after 400 ms false), caret kept true; Increase indent: moved within a frame true (after 400 ms true), caret kept true (docs/POLISH.md 2.3 item 14, B1) | 543 |
| `text.list.enter-tab-no-error` | text | broken | failed | a text box reading One; Bulleted list from the tail; the session opened at the end; Enter, "Two", Tab, Enter, "Three"; Escape; Cmd+Z until the box is back: listed true; items ["One","Two","Three"] (second nested false); error over the stage none; console 0; restored by Cmd+Z true (docs/POLISH.md 2.3 item 15, B1) | 544 |
| `text.size.run-and-typed-value` | text | broken | passed |  | 545 |
| `text.marks.whole-block-from-menu` | text | broken | passed |  | 546 |
| `text.tail.heading-takes-list-indent` | text | broken | failed | the title placeholder selected by one click; Bulleted list, Increase indent and Paint format from the tail; every disabled tail button read: disabled tail buttons 3 (toolbar.redo: "Redo"; toolbar.font: "Font"; toolbar.clearFormatting: "Clear formatting"); Bulleted list: not written snackbar "Bulleted list: No block "heading" on slide "title-1-2eed""; Increase indent: written snackbar "Bulleted lis | 548 |
| `text.heading.enter-keeps-session` | text | broken | passed |  | 549 |
| `text.link.chip-on-click` | text | broken | passed |  | 552 |
| `text.title.shrink-on-overflow` | text | broken | failed | the title selected and twelve words typed over it; Escape: font 44 -> 44 px over 1 lines; ring height 110 -> 110 sheet px (kept true); text inside the sheet true (k 0.7) (docs/POLISH.md 2.3 item 21, B1) | 551 |
| `text.link.popover-anchored` | text | broken | passed |  | 553 |
| `text.link.detection-setting` | text | broken | failed | Tools > Preferences > Link detection off, "See www.example.com now" typed into an empty box; on, typed again into another: error: locator.boundingBox: Timeout 30000ms exceeded. | 554 |
| `text.tail.size-reads-heading` | text | broken | failed | a title session open; the size field read; a subtitle session; the field read: title field "44"; subtitle field "26" (docs/POLISH.md 2.3 item 22, B1) | 550 |
| `text.polish.highlight-console` | text | broken | passed |  | 555 |
| `lines.hit.stroke-only` | lines | broken | passed |  | 558 |
| `shapes.geometry.cloud-callout-closed` | shapes | broken | passed |  | 562 |
| `charts.grid.every-series-in-view` | charts | broken | passed |  | 563 |
| `chrome.format-options.fields-by-kind` | chrome | broken | passed |  | 579 |
| `lines.move.detaches` | lines | broken | passed |  | 559 |
| `lines.select.handles-no-ring` | lines | broken | passed |  | 560 |
| `arrange.select.no-browser-highlight` | arrange | broken | passed |  | 564 |
| `diagrams.label.double-click-selects-word` | diagrams | broken | failed | Insert > Diagram > Process; a double click on "Step 2" of the diagram, " plus" typed; a text box double clicked at a point, typed: double click selected ""; the label reads "Step  plus2"; the text box after a double click on "caret" and "X" typed reads "Keep the Xcaret here" (docs/POLISH.md 2.4 item 30, B1's Selection.tsx by B3's request; question 5) | 565 |
| `lines.connector.perpendicular-at-sites` | lines | broken | failed | A above B; a curved connector from A's bottom site to B's top site; an elbow the same; A rotated 90 degrees: curved: leaves 1.1 and arrives 1.1 degrees from vertical; elbow: leaves 0 and arrives 0 degrees from vertical; elbow after A's rotation (rotated): arrives 90 degrees from vertical (docs/POLISH.md 2.4 item 33, B3) | 561 |
| `wordart.bar.closes` | wordart | broken | passed |  | 566 |
| `wordart.polish.chip-weight-arming` | wordart | broken | failed | Insert > Word art with "Big words" typed and Enter; the chip and the tail's B read; B pressed once; Insert > Line > Elbow connector armed: chip "Word art"; B pressed at insert false; weight 400 -> 400 after one press (bolder false); ring before arming drawn, after arming the elbow tool ring still drawn, chip "Word art" (docs/POLISH.md 2.4 item 34, B3 with B1's Editor.tsx hunks) | 567 |
| `images.panel.seller-words` | images | broken | passed |  | 570 |
| `images.panel.drop-shadow` | images | not driven | passed |  | 571 |
| `images.mask.picker-fits-panel` | images | broken | passed |  | 572 |
| `images.caption.grows-box` | images | broken | not driven | not on this build: format.image.addCaption (docs/PRODUCT.md 7.1, B4); the picture's menu lists edit.cut, edit.copy, edit.paste, edit.delete, edit.duplicate, arrange.order, arrange.rotate, arrange.centerOnPage, arrange.align, format.image.replaceImage, format.image.cropImage, format.image.maskImage, format.image.resetImage, format.image.imageOptions, format.formatOptions, format.altText, insert.com | 573 |
| `images.border.color-draws-at-once` | images | broken | passed |  | 574 |
| `images.alt.focused-empty` | images | broken | passed |  | 575 |
| `images.crop.dims-outside` | images | broken | passed |  | 576 |
| `chrome.plate.fits-viewport` | chrome | broken | passed |  | 580 |
| `formatting.spacing.table-cells` | formatting | broken | passed |  | 590 |
| `help.check-slides.plain-sentence` | help | broken | failed | an empty 3 by 3 table on a slide of its own; Tools > Check slides: 4 findings; about empty cells 2 ("The table has 9 empty cells; type into them or remove the rows."); parenthesis or SPEC false (docs/POLISH.md 2.6 item 55, B1) | 592 |
| `slides.background.picture-grid` | slides | broken | passed |  | 593 |
| `menus.rows.icon-on-every-row` | chrome | broken | failed | every row of the nine menus with their submenus, the card's, the sheet's, the text box's, the picture's, the shape's and the table cell's right click menus, the show's options and the /decks card menu read: 299 rows read; without a glyph 1 (show options: present.options.more) (docs/POLISH.md 2.6 item 57, the integrator's model.ts with B1's glyph list and B5's decks.index.tsx and Slideshow.tsx) | 594 |
| `chrome.snackbar.refusal-sentence` | chrome | broken | passed |  | 581 |
| `chrome.handles.tooltip-words` | chrome | broken | passed |  | 582 |
| `chrome.tooltips.only-on-hover` | chrome | broken | passed |  | 598 |
| `chrome.chip.above-ring` | chrome | broken | failed | a 120 px picture and a 60 px picture selected in turn: pc-small: chip 1130,519.5 50.2x18, over move; pc-small-2: chip 1242.8,505.4 50.2x18, over move (docs/POLISH.md 2.6 item 62, B1's Overlay.tsx by B4's request) | 583 |
| `chrome.dialog.no-loading-jump` | chrome | broken | passed |  | 584 |
| `chrome.dialog.focus-return-and-trap` | chrome | broken | passed |  | 585 |
| `comments.insert.needs-selection` | comments | broken | failed | nothing selected: the Insert menu read; the rectangle selected: Insert > Comment: Insert > Comment with nothing selected enabled; card 610.3,257.7 300x109.4 2/-110.8 px from the ring (docs/POLISH.md 2.6 item 66, the integrator's model.ts 3398 with B5's CommentCard.tsx) | 595 |
| `chrome.context.escape-closes-submenu` | chrome | broken | passed |  | 586 |
| `formatting.border-weight.menu-opens` | formatting | broken | passed |  | 591 |
| `chrome.toolbar.select-glyph` | chrome | broken | passed |  | 587 |
| `chrome.words.one-spelling` | chrome | broken | passed |  | 588 |
| `chrome.menus.structure-sweep` | chrome | broken | passed |  | 589 |
| `slides.filmstrip.follows-every-move` | slides | broken | passed |  | 597 |

## Console errors (1)

- console: Failed to load resource: the server responded with a status of 404 ()
