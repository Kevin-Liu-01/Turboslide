# Core walk matrix

Base http://localhost:4448, started 2026-09-29T06:12:23.770Z, 820 s, deck untitled-20260929-21dl. 701 probe rows: 141 passed, 6 failed, 0 not driven, 554 no step. Verdict failed with the parked list inbox, templates; exit 1. A row passes only when every tagged step of it passed; a not driven row is never counted as passed.

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
| `decks.save.acknowledged` | decks | flaky | passed |  | 160 |
| `decks.editor.move-to-trash` | decks | works | no step | the area was not run (--only) |  |
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
| `text.title.single-click` | text | broken | no step | the area was not run (--only) |  |
| `text.title.double-click` | text | works | no step | the area was not run (--only) |  |
| `text.title.type-escape` | text | works | no step | the area was not run (--only) |  |
| `text.selected.typing-replaces` | text | not driven | no step | the area was not run (--only) |  |
| `text.selected.enter-appends` | text | not driven | no step | the area was not run (--only) |  |
| `text.title.double-click-enters` | text | not driven | no step | the area was not run (--only) |  |
| `text.caret.click-mid-word` | text | works | no step | the area was not run (--only) |  |
| `text.caret.home-end` | text | works | no step | the area was not run (--only) |  |
| `text.caret.shift-arrow-replace` | text | works | no step | the area was not run (--only) |  |
| `text.caret.shift-home-end` | text | works | no step | the area was not run (--only) |  |
| `text.caret.backspace-word` | text | works | no step | the area was not run (--only) |  |
| `text.caret.option-backspace` | text | works | no step | the area was not run (--only) |  |
| `text.caret.delete` | text | works | no step | the area was not run (--only) |  |
| `text.caret.cmd-a` | text | works | no step | the area was not run (--only) |  |
| `text.title.enter-commits` | text | works | no step | the area was not run (--only) |  |
| `text.session.escape-twice` | text | works | no step | the area was not run (--only) |  |
| `text.subtitle.double-click-type` | text | works | no step | the area was not run (--only) |  |
| `text.subtitle.enter-new-line` | text | works | no step | the area was not run (--only) |  |
| `text.subtitle.shift-enter` | text | works | no step | the area was not run (--only) |  |
| `text.subtitle.arrows-backspace-join` | text | works | no step | the area was not run (--only) |  |
| `text.subtitle.escape-commits` | text | works | no step | the area was not run (--only) |  |
| `text.textbox.insert-click-type` | text | works | no step | the area was not run (--only) |  |
| `text.textbox.insert-drag` | text | works | no step | the area was not run (--only) |  |
| `text.textbox.drag-inside-moves` | text | broken | no step | the area was not run (--only) |  |
| `text.textbox.burst-reliability` | text | broken | no step | the area was not run (--only) |  |
| `text.toolbar.swaps-on-select` | text | works | no step | the area was not run (--only) |  |
| `text.fontsize.type-enter` | text | works | no step | the area was not run (--only) |  |
| `text.fontsize.plus-minus` | text | works | no step | the area was not run (--only) |  |
| `text.bold.toolbar` | text | works | no step | the area was not run (--only) |  |
| `text.bold.cmd-b-word` | text | works | no step | the area was not run (--only) |  |
| `text.italic.toolbar-word` | text | broken | no step | the area was not run (--only) |  |
| `text.italic.cmd-i-word` | text | works | no step | the area was not run (--only) |  |
| `text.underline.cmd-u-word` | text | works | no step | the area was not run (--only) |  |
| `text.underline.toolbar` | text | works | no step | the area was not run (--only) |  |
| `text.strikethrough.cmd-shift-x` | text | works | no step | the area was not run (--only) |  |
| `text.strikethrough.menu` | text | works | no step | the area was not run (--only) |  |
| `text.color.swatch-on-word` | text | broken | no step | the area was not run (--only) |  |
| `text.align.toolbar-and-key` | text | works | no step | the area was not run (--only) |  |
| `text.spacing.toolbar` | text | works | no step | the area was not run (--only) |  |
| `text.list.bulleted-toolbar` | text | broken | no step | the area was not run (--only) |  |
| `text.list.numbered-toolbar` | text | broken | no step | the area was not run (--only) |  |
| `text.list.bulleted-menu-preset` | text | works | no step | the area was not run (--only) |  |
| `text.indent.toolbar` | text | works | no step | the area was not run (--only) |  |
| `text.indent.keys` | text | works | no step | the area was not run (--only) |  |
| `text.link.cmd-k-enter` | text | broken | no step | the area was not run (--only) |  |
| `text.clear-formatting` | text | works | no step | the area was not run (--only) |  |
| `text.format-menu.rows-enabled` | text | works | no step | the area was not run (--only) |  |
| `text.format-menu.size-increase` | text | works | no step | the area was not run (--only) |  |
| `text.format-menu.align-left` | text | works | no step | the area was not run (--only) |  |
| `text.format-menu.spacing-double` | text | works | no step | the area was not run (--only) |  |
| `text.format-menu.text-fitting` | text | not driven | no step | the area was not run (--only) |  |
| `text.autofit.title-wraps` | text | works | no step | the area was not run (--only) |  |
| `text.autofit.textbox-grow` | text | broken | no step | the area was not run (--only) |  |
| `text.clipboard.within-box` | text | works | no step | the area was not run (--only) |  |
| `text.clipboard.between-boxes` | text | works | no step | the area was not run (--only) |  |
| `text.clipboard.paste-without-formatting` | text | not driven | no step | the area was not run (--only) |  |
| `text.find-replace.replace-all` | text | works | no step | the area was not run (--only) |  |
| `text.find-replace.shortcut` | text | flaky | no step | the area was not run (--only) |  |
| `text.persistence.reload` | text | works | no step | the area was not run (--only) |  |
| `text.list.numbered-menu-preset` | text | not driven | no step | the area was not run (--only) |  |
| `text.list.chords` | text | not driven | no step | the area was not run (--only) |  |
| `text.link.toolbar-button` | text | not driven | no step | the area was not run (--only) |  |
| `text.format-options.panel` | text | not driven | no step | the area was not run (--only) |  |
| `text.layout-runs.type` | text | not driven | no step | the area was not run (--only) |  |
| `text.context.text-block` | text | not driven | no step | the area was not run (--only) |  |
| `text.context.text-selection` | text | not driven | no step | the area was not run (--only) |  |
| `text.context.inside-session` | text | broken | no step | the area was not run (--only) |  |
| `text.format-menu.size-decrease` | text | not driven | no step | the area was not run (--only) |  |
| `text.format-menu.spacing-single-1-15` | text | not driven | no step | the area was not run (--only) |  |
| `text.format-menu.align-indent-rows` | text | not driven | no step | the area was not run (--only) |  |
| `text.textbox.toolbar-button` | text | not driven | no step | the area was not run (--only) |  |
| `images.insert.toolbar-sources` | images | works | no step | the area was not run (--only) |  |
| `images.select.chip-handles-tail` | images | works | no step | the area was not run (--only) |  |
| `images.delete.key` | images | works | no step | the area was not run (--only) |  |
| `images.move.drag-frame` | images | works | no step | the area was not run (--only) |  |
| `images.guides.edge-snap` | images | works | no step | the area was not run (--only) |  |
| `images.guides.centre-y` | images | works | no step | the area was not run (--only) |  |
| `images.guides.centre-x` | images | flaky | no step | the area was not run (--only) |  |
| `images.nudge.arrows` | images | works | no step | the area was not run (--only) |  |
| `images.resize.eight-handles` | images | works | no step | the area was not run (--only) |  |
| `images.resize.eight-handles-shift` | images | works | no step | the area was not run (--only) |  |
| `images.resize.edge-fill` | images | broken | no step | the area was not run (--only) |  |
| `images.resize.alt-centre` | images | works | no step | the area was not run (--only) |  |
| `images.rotate.ring` | images | works | no step | the area was not run (--only) |  |
| `images.crop.double-click` | images | works | no step | the area was not run (--only) |  |
| `images.crop.east-edge` | images | works | no step | the area was not run (--only) |  |
| `images.crop.south-edge` | images | works | no step | the area was not run (--only) |  |
| `images.crop.enter` | images | works | no step | the area was not run (--only) |  |
| `images.crop.undo` | images | works | no step | the area was not run (--only) |  |
| `images.crop.redo` | images | works | no step | the area was not run (--only) |  |
| `images.crop.menu-escape` | images | works | no step | the area was not run (--only) |  |
| `images.crop.toolbar-escape-cancels` | images | broken | no step | the area was not run (--only) |  |
| `images.options.panel` | images | works | no step | the area was not run (--only) |  |
| `images.options.transparency` | images | works | no step | the area was not run (--only) |  |
| `images.options.reset` | images | works | no step | the area was not run (--only) |  |
| `images.reset-image.menu` | images | works | no step | the area was not run (--only) |  |
| `images.background.colour` | images | works | no step | the area was not run (--only) |  |
| `images.background.toolbar` | images | works | no step | the area was not run (--only) |  |
| `images.background.reset` | images | works | no step | the area was not run (--only) |  |
| `images.present.picture-and-ground` | images | works | no step | the area was not run (--only) |  |
| `images.context.image` | images | not driven | no step | the area was not run (--only) |  |
| `images.options.menu-row` | images | not driven | no step | the area was not run (--only) |  |
| `images.background.hex-field` | images | not driven | no step | the area was not run (--only) |  |
| `arrange.select.click` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.select.shift-add` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.multi.drag-inside-moves-all` | arrange | broken | no step | the area was not run (--only) |  |
| `arrange.select.shift-remove` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.select.marquee` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.select.marquee-partial` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.select.click-away` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.select.cmd-a` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.select.escape` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.order.bring-to-front` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.order.send-to-back` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.order.bring-forward` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.order.send-backward` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.order.keys` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.align.left` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.align.center` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.align.right` | arrange | flaky | no step | the area was not run (--only) |  |
| `arrange.align.top` | arrange | broken | no step | the area was not run (--only) |  |
| `arrange.align.middle` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.align.bottom` | arrange | broken | no step | the area was not run (--only) |  |
| `arrange.align.single-to-slide` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.center.horizontal` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.center.vertical` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.undo.toolbar-on-arrange` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.undo.menu-on-arrange` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.clipboard.copy-paste` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.clipboard.delete` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.clipboard.undo-redo-delete` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.clipboard.cut-paste-undo` | arrange | flaky | no step | the area was not run (--only) |  |
| `arrange.clipboard.menu-copy-paste` | arrange | flaky | no step | the area was not run (--only) |  |
| `arrange.clipboard.paste-after-new-slide-button` | arrange | broken | no step | the area was not run (--only) |  |
| `arrange.clipboard.paste-with-filmstrip-focus` | arrange | broken | no step | the area was not run (--only) |  |
| `arrange.clipboard.paste-keeps-position` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.duplicate.cmd-d` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.duplicate.menu-selects-copy` | arrange | broken | no step | the area was not run (--only) |  |
| `arrange.duplicate.nothing-selected` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.redo.after-undone-duplicate` | arrange | broken | no step | the area was not run (--only) |  |
| `arrange.keys.backspace-empty-selection` | arrange | broken | no step | the area was not run (--only) |  |
| `arrange.nudge.arrows` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.nudge.shift` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.nudge.undo` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.zoom.box-reads` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.zoom.menu-in` | arrange | broken | no step | the area was not run (--only) |  |
| `arrange.zoom.cmd-minus` | arrange | broken | no step | the area was not run (--only) |  |
| `arrange.zoom.cmd-plus` | arrange | broken | no step | the area was not run (--only) |  |
| `arrange.zoom.fit` | arrange | flaky | no step | the area was not run (--only) |  |
| `arrange.zoom.type-percent` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.zoom.arrow-menu` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.zoom.cmd-0` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.zoom.menu-out` | arrange | broken | no step | the area was not run (--only) |  |
| `arrange.readout.fit` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.readout.200` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.selection-colour.light` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.selection-colour.dark` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.escape.text-then-selection` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.zoom.menu-presets` | arrange | not driven | no step | the area was not run (--only) |  |
| `arrange.toolbar.select` | arrange | not driven | no step | the area was not run (--only) |  |
| `shapes.insert.rectangle-click` | shapes | works | no step | the area was not run (--only) |  |
| `shapes.insert.rounded-click` | shapes | works | no step | the area was not run (--only) |  |
| `shapes.insert.ellipse-click` | shapes | works | no step | the area was not run (--only) |  |
| `shapes.insert.rectangle-drag` | shapes | works | no step | the area was not run (--only) |  |
| `shapes.insert.ellipse-drag` | shapes | works | no step | the area was not run (--only) |  |
| `shapes.insert.named-rows` | shapes | not driven | no step | the area was not run (--only) |  |
| `shapes.default-look` | shapes | broken | no step | the area was not run (--only) |  |
| `shapes.select` | shapes | works | no step | the area was not run (--only) |  |
| `shapes.move` | shapes | not driven | no step | the area was not run (--only) |  |
| `shapes.resize.eight-handles` | shapes | not driven | no step | the area was not run (--only) |  |
| `shapes.rotate` | shapes | not driven | no step | the area was not run (--only) |  |
| `shapes.fill.colour` | shapes | not driven | no step | the area was not run (--only) |  |
| `shapes.border.colour-weight-dash` | shapes | not driven | no step | the area was not run (--only) |  |
| `shapes.text.type-align-bold` | shapes | not driven | no step | the area was not run (--only) |  |
| `shapes.duplicate-delete-undo-redo` | shapes | not driven | no step | the area was not run (--only) |  |
| `shapes.format-options.size-position` | shapes | not driven | no step | the area was not run (--only) |  |
| `shapes.reload-and-viewer` | shapes | not driven | no step | the area was not run (--only) |  |
| `shapes.context.shape` | shapes | not driven | no step | the area was not run (--only) |  |
| `lines.insert.line-drag` | lines | not driven | no step | the area was not run (--only) |  |
| `lines.insert.arrow-drag` | lines | not driven | no step | the area was not run (--only) |  |
| `lines.end-handle` | lines | not driven | no step | the area was not run (--only) |  |
| `lines.tail.colour-weight-dash-ends` | lines | not driven | no step | the area was not run (--only) |  |
| `lines.context.line` | lines | not driven | no step | the area was not run (--only) |  |
| `share.file-menu-share-with-others` | share | not driven | no step | the area was not run (--only) |  |
| `versions.open-from-last-edit` | versions | works | no step | the area was not run (--only) |  |
| `versions.pick` | versions | works | no step | the area was not run (--only) |  |
| `versions.name-current` | versions | works | no step | the area was not run (--only) |  |
| `versions.undo-restore` | versions | not driven | no step | the area was not run (--only) |  |
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
| `surface.cleanup` | surface | works | no step | the area was not run (--only) |  |
| `shapes.text.colour-toolbar` | shapes | broken | no step | the area was not run (--only) |  |
| `shapes.text.enter-opens-label` | shapes | works | no step | the area was not run (--only) |  |
| `shapes.borders-lines.menu` | shapes | works | no step | the area was not run (--only) |  |
| `lines.connector.elbow` | lines | works | no step | the area was not run (--only) |  |
| `lines.connector.curved` | lines | works | no step | the area was not run (--only) |  |
| `lines.connector.re-end` | lines | not driven | no step | the area was not run (--only) |  |
| `lines.insert.arrow-head` | lines | works | no step | the area was not run (--only) |  |
| `lines.tail.line-start-end-menu` | lines | not driven | no step | the area was not run (--only) |  |
| `tables.insert.grid` | tables | works | no step | the area was not run (--only) |  |
| `tables.cell.double-click-type` | tables | works | no step | the area was not run (--only) |  |
| `tables.cell.tab-from-written` | tables | broken | no step | the area was not run (--only) |  |
| `tables.cell.tab-from-empty` | tables | works | no step | the area was not run (--only) |  |
| `tables.cell.shift-tab` | tables | not driven | no step | the area was not run (--only) |  |
| `tables.cell.tab-last-appends-row` | tables | works | no step | the area was not run (--only) |  |
| `tables.menu.format-table-with-session` | tables | broken | no step | the area was not run (--only) |  |
| `tables.menu.format-table-selected` | tables | broken | no step | the area was not run (--only) |  |
| `tables.menu.format-table-rows` | tables | not driven | no step | the area was not run (--only) |  |
| `tables.context.rows` | tables | works | no step | the area was not run (--only) |  |
| `tables.context.insert-delete` | tables | works | no step | the area was not run (--only) |  |
| `tables.column.insert-keeps-widths` | tables | broken | no step | the area was not run (--only) |  |
| `tables.column.resize-seam` | tables | not driven | no step | the area was not run (--only) |  |
| `tables.cell.align-menu` | tables | broken | no step | the area was not run (--only) |  |
| `tables.cell.align-toolbar` | tables | broken | no step | the area was not run (--only) |  |
| `tables.select.resize` | tables | works | no step | the area was not run (--only) |  |
| `tables.cell.fill-border-tail` | tables | not driven | no step | the area was not run (--only) |  |
| `tables.cells.merge-unmerge` | tables | not driven | no step | the area was not run (--only) |  |
| `tables.tail.merge-unmerge-buttons` | tables | not driven | no step | the area was not run (--only) |  |
| `tables.distribute.rows-columns` | tables | not driven | no step | the area was not run (--only) |  |
| `tables.light-appearance` | tables | not driven | no step | the area was not run (--only) |  |
| `tables.present` | tables | works | no step | the area was not run (--only) |  |
| `tables.reload` | tables | works | no step | the area was not run (--only) |  |
| `charts.insert.bar` | charts | works | passed |  | 108 |
| `charts.insert.column` | charts | works | passed |  | 109 |
| `charts.insert.line` | charts | works | passed |  | 110 |
| `charts.insert.pie` | charts | works | passed |  | 111 |
| `charts.select.tail` | charts | works | passed |  | 112 |
| `charts.resize` | charts | works | passed |  | 113 |
| `charts.type.panel-legible` | charts | broken | passed |  | 114 |
| `charts.type.toolbar` | charts | not driven | passed |  | 115 |
| `charts.type.menu` | charts | not driven | passed |  | 116 |
| `charts.data.add-series-category` | charts | works | passed |  | 117 |
| `charts.data.edit-cell` | charts | works | passed |  | 118 |
| `charts.data.toolbar-edit-data` | charts | not driven | passed |  | 119 |
| `charts.data.menu-edit-data` | charts | not driven | passed |  | 120 |
| `charts.legend.toolbar` | charts | not driven | passed |  | 121 |
| `charts.number-format.toolbar` | charts | not driven | passed |  | 122 |
| `charts.context` | charts | not driven | passed |  | 123 |
| `charts.light-appearance` | charts | not driven | passed |  | 124 |
| `charts.present` | charts | works | passed |  | 125 |
| `charts.reload` | charts | works | passed |  | 126 |
| `diagrams.panel` | diagrams | works | no step | the area was not run (--only) |  |
| `diagrams.insert.group` | diagrams | works | no step | the area was not run (--only) |  |
| `diagrams.select-move` | diagrams | works | no step | the area was not run (--only) |  |
| `diagrams.edit-label` | diagrams | not driven | no step | the area was not run (--only) |  |
| `diagrams.light-appearance` | diagrams | not driven | no step | the area was not run (--only) |  |
| `diagrams.present` | diagrams | works | no step | the area was not run (--only) |  |
| `diagrams.reload` | diagrams | not driven | no step | the area was not run (--only) |  |
| `wordart.insert` | wordart | works | no step | the area was not run (--only) |  |
| `wordart.edit` | wordart | not driven | no step | the area was not run (--only) |  |
| `wordart.light-appearance` | wordart | not driven | no step | the area was not run (--only) |  |
| `formatting.superscript.chord` | formatting | works | no step | the area was not run (--only) |  |
| `formatting.subscript.chord` | formatting | works | no step | the area was not run (--only) |  |
| `formatting.superscript.menu-word` | formatting | broken | no step | the area was not run (--only) |  |
| `formatting.subscript.menu-word` | formatting | broken | no step | the area was not run (--only) |  |
| `formatting.italic.menu-word` | formatting | broken | no step | the area was not run (--only) |  |
| `formatting.context.selection-rows` | formatting | not driven | no step | the area was not run (--only) |  |
| `formatting.capitalization.upper` | formatting | works | no step | the area was not run (--only) |  |
| `formatting.capitalization.lower` | formatting | works | no step | the area was not run (--only) |  |
| `formatting.capitalization.title` | formatting | works | no step | the area was not run (--only) |  |
| `formatting.align.justified-menu` | formatting | works | no step | the area was not run (--only) |  |
| `formatting.align.justified-chord` | formatting | works | no step | the area was not run (--only) |  |
| `formatting.align.toolbar-justify` | formatting | not driven | no step | the area was not run (--only) |  |
| `formatting.spacing.add-before-remove` | formatting | works | no step | the area was not run (--only) |  |
| `formatting.spacing.add-after` | formatting | works | no step | the area was not run (--only) |  |
| `formatting.spacing.custom-dialog` | formatting | works | no step | the area was not run (--only) |  |
| `formatting.spacing.1-15-value` | formatting | broken | no step | the area was not run (--only) |  |
| `formatting.highlight.word` | formatting | works | no step | the area was not run (--only) |  |
| `formatting.paint-format.button` | formatting | works | no step | the area was not run (--only) |  |
| `formatting.paint-format.chords` | formatting | not driven | no step | the area was not run (--only) |  |
| `formatting.clear.inline-marks` | formatting | broken | no step | the area was not run (--only) |  |
| `formatting.theme.panel-appearance` | formatting | works | no step | the area was not run (--only) |  |
| `formatting.theme.toolbar-button` | formatting | works | no step | the area was not run (--only) |  |
| `formatting.theme.import-hidden` | formatting | not driven | no step | the area was not run (--only) |  |
| `formatting.persistence` | formatting | works | no step | the area was not run (--only) |  |
| `text.title.one-click-tail` | text | broken | no step | the area was not run (--only) |  |
| `text.title.bold-menu` | text | broken | no step | the area was not run (--only) |  |
| `text.title.bold-cmd-b` | text | broken | no step | the area was not run (--only) |  |
| `text.title.align-menu` | text | broken | no step | the area was not run (--only) |  |
| `text.title.size-menu` | text | broken | no step | the area was not run (--only) |  |
| `text.title.format-options-marks` | text | broken | no step | the area was not run (--only) |  |
| `text.title.apply-layout-after-format` | text | not driven | no step | the area was not run (--only) |  |
| `text.fontsize.type-one-undo` | text | broken | no step | the area was not run (--only) |  |
| `text.format-options.field-one-undo` | text | broken | no step | the area was not run (--only) |  |
| `arrange.distribute.horizontal` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.distribute.vertical` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.distribute.needs-three` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.rotate.quarter-turns` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.rotate.flips-menu` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.group.chords` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.group.menu-regroup` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.group.context-rows` | arrange | not driven | no step | the area was not run (--only) |  |
| `arrange.context.rotate-distribute` | arrange | not driven | no step | the area was not run (--only) |  |
| `arrange.ruler.show-hide` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.guides.from-ruler` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.guides.show-toggle` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.guides.add-vertical-horizontal` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.guides.drag` | arrange | flaky | no step | the area was not run (--only) |  |
| `arrange.snap.guides-on-off` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.snap.grid-toggle` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.snap.grid-effect` | arrange | not driven | no step | the area was not run (--only) |  |
| `arrange.guides.context` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.guides.clear` | arrange | works | no step | the area was not run (--only) |  |
| `arrange.select-none.menu` | arrange | works | no step | the area was not run (--only) |  |
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
| `view.appearance.rows` | view | works | no step | the area was not run (--only) |  |
| `view.show-filmstrip` | view | works | no step | the area was not run (--only) |  |
| `view.mode.rows` | view | works | no step | the area was not run (--only) |  |
| `view.mode.viewing-hides-toolbar` | view | broken | no step | the area was not run (--only) |  |
| `view.full-screen` | view | works | no step | the area was not run (--only) |  |
| `view.hide-menus-chevron` | view | not driven | no step | the area was not run (--only) |  |
| `view.live-pointers.toggles` | view | works | no step | the area was not run (--only) |  |
| `view.comments.radios` | view | works | no step | the area was not run (--only) |  |
| `view.comments.show-all-panel` | view | broken | no step | the area was not run (--only) |  |
| `view.comments.modes-markers` | view | not driven | no step | the area was not run (--only) |  |
| `decks.name.follows-heading` | decks | broken | passed |  | 4 |
| `decks.file.open-list-search` | decks | works | passed |  | 14 |
| `decks.file.import-slides-deck` | decks | works | passed |  | 15 |
| `decks.file.details` | decks | works | passed |  | 16 |
| `slides.numbers.apply` | slides | not driven | passed |  | 100 |
| `versions.show-changes-toggle` | versions | works | no step | the area was not run (--only) |  |
| `versions.show-changes-marks` | versions | not driven | no step | the area was not run (--only) |  |
| `help.check-slides` | help | works | no step | the area was not run (--only) |  |
| `inbox.bell-panel-toggle` | inbox | broken | no step | the area was not run (--only) |  |
| `inbox.settings-persist` | inbox | broken | no step | the area was not run (--only) |  |
| `arrange.insert.selected-after-menu` | arrange | broken | no step | the area was not run (--only) |  |
| `arrange.insert.free-rectangle` | arrange | not driven | no step | the area was not run (--only) |  |
| `slides.layout.title-and-body-single` | slides | broken | passed |  | 101 |
| `slides.layout.subtitle-prompt` | slides | not driven | passed |  | 102 |
| `slides.layout.new-slide-inherits` | slides | not driven | passed |  | 103 |
| `slides.layout.tile-sentences` | slides | broken | passed |  | 104 |
| `slides.import.none-preselected` | slides | broken | passed |  | 105 |
| `text.link.detect-url` | text | broken | no step | the area was not run (--only) |  |
| `text.link.detect-email` | text | broken | no step | the area was not run (--only) |  |
| `text.select.double-click-address` | text | broken | no step | the area was not run (--only) |  |
| `text.select.shift-home-line` | text | broken | no step | the area was not run (--only) |  |
| `text.link.popover-apply-remove` | text | broken | no step | the area was not run (--only) |  |
| `text.format-options.padding-grid` | text | broken | no step | the area was not run (--only) |  |
| `text.format-options.remembers-section` | text | not driven | no step | the area was not run (--only) |  |
| `text.autofit.shrink-on-overflow` | text | not driven | no step | the area was not run (--only) |  |
| `text.find-replace.count-while-typing` | text | broken | no step | the area was not run (--only) |  |
| `images.caption.add` | images | not driven | no step | the area was not run (--only) |  |
| `images.options.picture-sections-only` | images | broken | no step | the area was not run (--only) |  |
| `images.transparency.slider` | images | broken | no step | the area was not run (--only) |  |
| `images.border.drawn` | images | broken | no step | the area was not run (--only) |  |
| `formatting.alt-text.write-undo` | formatting | works | no step | the area was not run (--only) |  |
| `comments.panel.empty-gesture` | comments | broken | no step | the area was not run (--only) |  |
| `versions.panel.author-you` | versions | broken | no step | the area was not run (--only) |  |
| `versions.field.square` | versions | broken | no step | the area was not run (--only) |  |
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
| `assist.entry.title-row` | assist | not driven | no step | the area was not run (--only) |  |
| `assist.panel.first-line-and-cards` | assist | not driven | no step | the area was not run (--only) |  |
| `assist.tailor.dialog-one-undo` | assist | not driven | no step | the area was not run (--only) |  |
| `assist.tailor.agent-deck-tailor` | assist | not driven | no step | the area was not run (--only) |  |
| `assist.outside-write.snackbar` | assist | broken | no step | the area was not run (--only) |  |
| `assist.finder.terms` | assist | broken | no step | the area was not run (--only) |  |
| `assist.finder.ask-row` | assist | not driven | no step | the area was not run (--only) |  |
| `assist.agent.propose-accept` | assist | not driven | no step | the area was not run (--only) |  |
| `charts.grid.type-to-edit` | charts | broken | passed |  | 127 |
| `charts.grid.escape-stays` | charts | broken | passed |  | 128 |
| `tables.cell.click-places-caret` | tables | broken | no step | the area was not run (--only) |  |
| `tables.cell.click-then-type` | tables | broken | no step | the area was not run (--only) |  |
| `tables.range.drag-from-selected` | tables | not driven | no step | the area was not run (--only) |  |
| `shapes.label.centred-default` | shapes | broken | no step | the area was not run (--only) |  |
| `shapes.geometry.shapes.hexagon-sheet` | shapes | broken | no step | the area was not run (--only) |  |
| `shapes.geometry.shapes.star5-adjust` | shapes | not driven | no step | the area was not run (--only) |  |
| `shapes.geometry.shapes.pie-arc` | shapes | broken | no step | the area was not run (--only) |  |
| `shapes.geometry.shapes.multipath-can` | shapes | broken | no step | the area was not run (--only) |  |
| `shapes.geometry.shapes.flowchart-own-space` | shapes | broken | no step | the area was not run (--only) |  |
| `shapes.geometry.arrows.right-arrow` | shapes | broken | no step | the area was not run (--only) |  |
| `shapes.geometry.arrows.curved-right` | shapes | broken | no step | the area was not run (--only) |  |
| `shapes.geometry.callouts.wedge-rect` | shapes | broken | no step | the area was not run (--only) |  |
| `shapes.geometry.callouts.cloud` | shapes | broken | no step | the area was not run (--only) |  |
| `shapes.geometry.equation.plus-divide` | shapes | broken | no step | the area was not run (--only) |  |
| `shapes.geometry.pinned-three` | shapes | works | no step | the area was not run (--only) |  |
| `shapes.geometry.sites` | shapes | broken | no step | the area was not run (--only) |  |
| `shapes.geometry.resize-keeps-adjust` | shapes | not driven | no step | the area was not run (--only) |  |
| `shapes.insert.grid-shapes` | shapes | broken | no step | the area was not run (--only) |  |
| `shapes.insert.grid-arrows` | shapes | broken | no step | the area was not run (--only) |  |
| `shapes.insert.grid-callouts` | shapes | broken | no step | the area was not run (--only) |  |
| `shapes.insert.grid-equation` | shapes | broken | no step | the area was not run (--only) |  |
| `shapes.icons.named-rows` | shapes | broken | no step | the area was not run (--only) |  |
| `shapes.change-shape.plate` | shapes | not driven | no step | the area was not run (--only) |  |
| `shapes.mask-image.plate` | shapes | not driven | no step | the area was not run (--only) |  |
| `tables.selected.typing-appends` | tables | broken | no step | the area was not run (--only) |  |
| `tables.cell.arrows-cross-cells` | tables | not driven | no step | the area was not run (--only) |  |
| `tables.range.shift-arrows` | tables | not driven | no step | the area was not run (--only) |  |
| `diagrams.label.double-click-opens` | diagrams | broken | no step | the area was not run (--only) |  |
| `diagrams.label.tab-next` | diagrams | not driven | no step | the area was not run (--only) |  |
| `charts.double-click.opens-data` | charts | broken | passed |  | 129 |
| `charts.mark.click-selects-cell` | charts | not driven | passed |  | 130 |
| `tables.range.bold-italic` | tables | broken | no step | the area was not run (--only) |  |
| `tables.range.size-color` | tables | not driven | no step | the area was not run (--only) |  |
| `diagrams.step.one-object` | diagrams | broken | no step | the area was not run (--only) |  |
| `charts.legend.none-from-toolbar` | charts | broken | passed |  | 131 |
| `charts.panel.no-duplicate-controls` | charts | broken | passed |  | 132 |
| `charts.grid.remove-visible` | charts | broken | failed | the grid with the pointer away; the active row's remove control, the series swatch; a right click on a series header: remove control formatOptions.chart.category.0.remove opacity 0 with the row hovered (0 with the pointer away, item 26); series swatch 14 by 14; right click on the series header lists Add series, Remove Series 1 (FEATURES.md 2.2 rank 12, B3) | 133 |
| `tables.panel.table-first` | tables | broken | no step | the area was not run (--only) |  |
| `tables.seam.row-drag` | tables | not driven | no step | the area was not run (--only) |  |
| `tables.edge.add-row-column` | tables | not driven | no step | the area was not run (--only) |  |
| `tables.heads.select-row-column` | tables | not driven | no step | the area was not run (--only) |  |
| `tables.bar.row-column-buttons` | tables | not driven | no step | the area was not run (--only) |  |
| `brand.objects.kit-colours-first` | brand | not driven | no step | the area was not run (--only) |  |
| `arrange.group.tail-text-controls` | arrange | not driven | no step | the area was not run (--only) |  |
| `tables.command.keeps-caret` | tables | broken | no step | the area was not run (--only) |  |
| `wordart.resize.scales-letters` | wordart | broken | no step | the area was not run (--only) |  |
| `wordart.tail.fill-outline` | wordart | not driven | no step | the area was not run (--only) |  |
| `fonts.links.licence-v4-1` | fonts | broken | no step | the area was not run (--only) |  |
| `fonts.fallback.in-stack` | fonts | broken | no step | the area was not run (--only) |  |
| `fonts.display-features.inter-only` | fonts | not driven | no step | the area was not run (--only) |  |
| `tables.cells.tabular-figures` | tables | broken | no step | the area was not run (--only) |  |
| `formatting.numerals.tabular-row` | formatting | not driven | no step | the area was not run (--only) |  |
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
| `tables.select.ring-with-cell-open` | tables | broken | no step | the area was not run (--only) |  |
| `tables.cell.ring-on-cell` | tables | broken | no step | the area was not run (--only) |  |
| `tables.cells.empty-grid-guides` | tables | broken | no step | the area was not run (--only) |  |
| `tables.light-appearance-guides` | tables | not driven | no step | the area was not run (--only) |  |
| `tables.insert.box-fits-rows` | tables | broken | no step | the area was not run (--only) |  |
| `tables.rows.grow-with-text` | tables | broken | no step | the area was not run (--only) |  |
| `tables.resize.rows-share-extra` | tables | broken | no step | the area was not run (--only) |  |
| `tables.seam.visible-with-cell-open` | tables | broken | no step | the area was not run (--only) |  |
| `tables.heads.header-toggle` | tables | not driven | no step | the area was not run (--only) |  |
| `tables.panel.section-words` | tables | broken | no step | the area was not run (--only) |  |
| `charts.pie.add-series-refused` | charts | broken | passed |  | 136 |
| `diagrams.member.duplicate-delete` | diagrams | not driven | no step | the area was not run (--only) |  |
| `lines.chip.kind-name` | lines | broken | no step | the area was not run (--only) |  |
| `tables.cells.no-prompt` | tables | broken | no step | the area was not run (--only) |  |
| `tables.rows.ring-follows-typing` | tables | broken | no step | the area was not run (--only) |  |
| `tables.cell.click-moves-caret` | tables | broken | no step | the area was not run (--only) |  |
| `tables.tail.size-step-ladder` | tables | broken | no step | the area was not run (--only) |  |
| `tables.insert.box-never-shorter-than-rows` | tables | broken | no step | the area was not run (--only) |  |
| `tables.heads.keys-act-on-range` | tables | broken | no step | the area was not run (--only) |  |
| `tables.insert.one-placement-rule` | tables | broken | no step | the area was not run (--only) |  |
| `tables.edge.stays-inside-sheet` | tables | broken | no step | the area was not run (--only) |  |
| `tables.range.align-cells-only` | tables | broken | no step | the area was not run (--only) |  |
| `tables.context.object-menu-on-frame` | tables | broken | no step | the area was not run (--only) |  |
| `tables.polish.seams-snap-grid` | tables | broken | no step | the area was not run (--only) |  |
| `text.bold.toolbar-marks-run` | text | broken | no step | the area was not run (--only) |  |
| `slides.layout.blank-empty` | slides | broken | passed |  | 157 |
| `text.paragraph.toolbar-live` | text | broken | no step | the area was not run (--only) |  |
| `text.list.enter-tab-no-error` | text | broken | no step | the area was not run (--only) |  |
| `text.size.run-and-typed-value` | text | broken | no step | the area was not run (--only) |  |
| `text.marks.whole-block-from-menu` | text | broken | no step | the area was not run (--only) |  |
| `text.tail.heading-takes-list-indent` | text | broken | no step | the area was not run (--only) |  |
| `text.heading.enter-keeps-session` | text | broken | no step | the area was not run (--only) |  |
| `text.link.chip-on-click` | text | broken | no step | the area was not run (--only) |  |
| `text.title.shrink-on-overflow` | text | broken | no step | the area was not run (--only) |  |
| `text.link.popover-anchored` | text | broken | no step | the area was not run (--only) |  |
| `text.link.detection-setting` | text | broken | no step | the area was not run (--only) |  |
| `text.tail.size-reads-heading` | text | broken | no step | the area was not run (--only) |  |
| `text.polish.highlight-console` | text | broken | no step | the area was not run (--only) |  |
| `lines.hit.stroke-only` | lines | broken | no step | the area was not run (--only) |  |
| `shapes.geometry.cloud-callout-closed` | shapes | broken | no step | the area was not run (--only) |  |
| `charts.grid.every-series-in-view` | charts | broken | no step | the area was not run (--only) |  |
| `chrome.format-options.fields-by-kind` | chrome | broken | passed |  | 140 |
| `lines.move.detaches` | lines | broken | no step | the area was not run (--only) |  |
| `lines.select.handles-no-ring` | lines | broken | no step | the area was not run (--only) |  |
| `arrange.select.no-browser-highlight` | arrange | broken | no step | the area was not run (--only) |  |
| `diagrams.label.double-click-selects-word` | diagrams | broken | no step | the area was not run (--only) |  |
| `lines.connector.perpendicular-at-sites` | lines | broken | no step | the area was not run (--only) |  |
| `wordart.bar.closes` | wordart | broken | no step | the area was not run (--only) |  |
| `wordart.polish.chip-weight-arming` | wordart | broken | no step | the area was not run (--only) |  |
| `images.panel.seller-words` | images | broken | no step | the area was not run (--only) |  |
| `images.panel.drop-shadow` | images | not driven | no step | the area was not run (--only) |  |
| `images.mask.picker-fits-panel` | images | broken | no step | the area was not run (--only) |  |
| `images.caption.grows-box` | images | broken | no step | the area was not run (--only) |  |
| `images.border.color-draws-at-once` | images | broken | no step | the area was not run (--only) |  |
| `images.alt.focused-empty` | images | broken | no step | the area was not run (--only) |  |
| `images.crop.dims-outside` | images | broken | no step | the area was not run (--only) |  |
| `chrome.plate.fits-viewport` | chrome | broken | passed |  | 141 |
| `formatting.spacing.table-cells` | formatting | broken | passed |  | 151 |
| `help.check-slides.plain-sentence` | help | broken | failed | an empty 3 by 3 table on a slide of its own; Tools > Check slides: 4 findings; about empty cells 2 ("The table has 9 empty cells; type into them or remove the rows."); parenthesis or SPEC false (docs/POLISH.md 2.6 item 55, B1) | 153 |
| `slides.background.picture-grid` | slides | broken | passed |  | 154 |
| `menus.rows.icon-on-every-row` | chrome | broken | failed | every row of the nine menus with their submenus, the card's, the sheet's, the text box's, the picture's, the shape's and the table cell's right click menus, the show's options and the /decks card menu read: 299 rows read; without a glyph 1 (show options: present.options.more) (docs/POLISH.md 2.6 item 57, the integrator's model.ts with B1's glyph list and B5's decks.index.tsx and Slideshow.tsx) | 155 |
| `chrome.snackbar.refusal-sentence` | chrome | broken | passed |  | 142 |
| `chrome.handles.tooltip-words` | chrome | broken | passed |  | 143 |
| `chrome.tooltips.only-on-hover` | chrome | broken | passed |  | 159 |
| `chrome.chip.above-ring` | chrome | broken | failed | a 120 px picture and a 60 px picture selected in turn: pc-small: chip 1130,519.5 50.2x18, over move; pc-small-2: chip 1242.8,505.4 50.2x18, over move (docs/POLISH.md 2.6 item 62, B1's Overlay.tsx by B4's request) | 144 |
| `chrome.dialog.no-loading-jump` | chrome | broken | passed |  | 145 |
| `chrome.dialog.focus-return-and-trap` | chrome | broken | passed |  | 146 |
| `comments.insert.needs-selection` | comments | broken | passed |  | 156 |
| `chrome.context.escape-closes-submenu` | chrome | broken | passed |  | 147 |
| `formatting.border-weight.menu-opens` | formatting | broken | passed |  | 152 |
| `chrome.toolbar.select-glyph` | chrome | broken | passed |  | 148 |
| `chrome.words.one-spelling` | chrome | broken | passed |  | 149 |
| `chrome.menus.structure-sweep` | chrome | broken | passed |  | 150 |
| `slides.filmstrip.follows-every-move` | slides | broken | failed | the deck grown to 40 slides through the window API; End, Home, Slide > Duplicate slide and a window API slide.new: error: page.evaluate: TypeError: Cannot read properties of undefined (reading 'studio') | 158 |

## Console errors (1)

- console: Failed to load resource: the server responded with a status of 404 ()
