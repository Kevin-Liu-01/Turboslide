# Core walk matrix

Base https://turboslide-lav4xmwv1-kl01s-projects.vercel.app, started 2026-09-30T11:55:19.131Z, 842 s, deck untitled-20260930-r9al. 703 probe rows: 95 passed, 11 failed, 6 not driven, 591 no step. Verdict failed with the parked list inbox, templates; exit 1. A row passes only when every tagged step of it passed; a not driven row is never counted as passed.

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
| `decks.save.acknowledged` | decks | flaky | passed |  | 126 |
| `decks.editor.move-to-trash` | decks | works | no step | the area was not run (--only) |  |
| `slides.new.toolbar` | slides | works | no step | the area was not run (--only) |  |
| `slides.new.arrow-layout` | slides | works | no step | the area was not run (--only) |  |
| `slides.new.menu` | slides | works | no step | the area was not run (--only) |  |
| `slides.new.ctrl-m-card` | slides | works | no step | the area was not run (--only) |  |
| `slides.new.ctrl-m-canvas` | slides | works | no step | the area was not run (--only) |  |
| `slides.new.context` | slides | works | no step | the area was not run (--only) |  |
| `slides.new.undo` | slides | works | no step | the area was not run (--only) |  |
| `slides.duplicate.context` | slides | works | no step | the area was not run (--only) |  |
| `slides.duplicate.menu` | slides | works | no step | the area was not run (--only) |  |
| `slides.duplicate.cmd-d` | slides | works | no step | the area was not run (--only) |  |
| `slides.duplicate.undo-toolbar` | slides | works | no step | the area was not run (--only) |  |
| `slides.duplicate.undo-redo-keys` | slides | works | no step | the area was not run (--only) |  |
| `slides.duplicate.two-selected-cmd-d` | slides | works | no step | the area was not run (--only) |  |
| `slides.duplicate.two-selected-menu` | slides | works | no step | the area was not run (--only) |  |
| `slides.delete.key` | slides | works | no step | the area was not run (--only) |  |
| `slides.delete.undo-snackbar` | slides | works | no step | the area was not run (--only) |  |
| `slides.delete.context` | slides | works | no step | the area was not run (--only) |  |
| `slides.delete.undo-cmd-z` | slides | works | no step | the area was not run (--only) |  |
| `slides.delete.menu-undo-redo` | slides | works | no step | the area was not run (--only) |  |
| `slides.delete.two-selected-key-undo` | slides | works | no step | the area was not run (--only) |  |
| `slides.delete.two-selected-menu` | slides | broken | no step | the area was not run (--only) |  |
| `slides.delete.two-selected-edit-menu` | slides | broken | no step | the area was not run (--only) |  |
| `slides.delete.canvas-focus-undo` | slides | flaky | no step | the area was not run (--only) |  |
| `slides.delete.undo-redo-saved` | slides | flaky | no step | the area was not run (--only) |  |
| `slides.select.click` | slides | works | no step | the area was not run (--only) |  |
| `slides.select.arrows-shift` | slides | works | no step | the area was not run (--only) |  |
| `slides.select.shift-cmd-click` | slides | works | no step | the area was not run (--only) |  |
| `slides.select.cmd-click-toggle` | slides | works | no step | the area was not run (--only) |  |
| `slides.reorder.drag-above` | slides | works | no step | the area was not run (--only) |  |
| `slides.reorder.drag-below` | slides | works | no step | the area was not run (--only) |  |
| `slides.reorder.cmd-up-down` | slides | works | no step | the area was not run (--only) |  |
| `slides.reorder.menu-to-end-undo` | slides | works | no step | the area was not run (--only) |  |
| `slides.reorder.undo-drag` | slides | works | no step | the area was not run (--only) |  |
| `slides.reorder.two-selected-drag` | slides | works | no step | the area was not run (--only) |  |
| `slides.skip.context` | slides | works | no step | the area was not run (--only) |  |
| `slides.skip.context-two` | slides | works | no step | the area was not run (--only) |  |
| `slides.skip.menu-unskip` | slides | works | no step | the area was not run (--only) |  |
| `slides.skip.menu-two` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.picker-open-escape` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.title` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.opener` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.split` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.cols` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.title-only` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.one-column` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.statement` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.section-description` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.mood` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.big-number` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.blank` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.rows` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.plain` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.table` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.figure` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.pair` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.tiles` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.details` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.board` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.matrix` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.apply.closing` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.reopen-ring` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.context-apply` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.menu-apply-undo` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.fresh-slide-two-picks-no-carry` | slides | broken | no step | the area was not run (--only) |  |
| `slides.layout.typed-title-round-trip` | slides | works | no step | the area was not run (--only) |  |
| `slides.layout.snackbar-counts-typed-only` | slides | broken | no step | the area was not run (--only) |  |
| `slides.layout.undo-typed` | slides | works | no step | the area was not run (--only) |  |
| `slides.notes.type` | slides | works | no step | the area was not run (--only) |  |
| `slides.notes.per-slide` | slides | works | no step | the area was not run (--only) |  |
| `slides.notes.resize-handle` | slides | works | no step | the area was not run (--only) |  |
| `slides.notes.reload` | slides | works | no step | the area was not run (--only) |  |
| `slides.counter.footer-and-cards` | slides | works | no step | the area was not run (--only) |  |
| `slides.hash.click-and-reload` | slides | works | no step | the area was not run (--only) |  |
| `slides.reorder.menu-up-down-beginning` | slides | not driven | no step | the area was not run (--only) |  |
| `slides.reorder.cmd-shift-up-down` | slides | not driven | no step | the area was not run (--only) |  |
| `slides.notes.view-menu-toggle` | slides | not driven | no step | the area was not run (--only) |  |
| `slides.context.empty-canvas` | slides | not driven | no step | the area was not run (--only) |  |
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
| `share.file-menu-share-with-others` | share | not driven | passed |  | 17 |
| `versions.open-from-last-edit` | versions | works | passed |  | 18 |
| `versions.pick` | versions | works | passed |  | 19 |
| `versions.name-current` | versions | works | passed |  | 20 |
| `versions.undo-restore` | versions | not driven | passed |  | 21 |
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
| `charts.insert.bar` | charts | works | no step | the area was not run (--only) |  |
| `charts.insert.column` | charts | works | no step | the area was not run (--only) |  |
| `charts.insert.line` | charts | works | no step | the area was not run (--only) |  |
| `charts.insert.pie` | charts | works | no step | the area was not run (--only) |  |
| `charts.select.tail` | charts | works | no step | the area was not run (--only) |  |
| `charts.resize` | charts | works | no step | the area was not run (--only) |  |
| `charts.type.panel-legible` | charts | broken | no step | the area was not run (--only) |  |
| `charts.type.toolbar` | charts | not driven | no step | the area was not run (--only) |  |
| `charts.type.menu` | charts | not driven | no step | the area was not run (--only) |  |
| `charts.data.add-series-category` | charts | works | no step | the area was not run (--only) |  |
| `charts.data.edit-cell` | charts | works | no step | the area was not run (--only) |  |
| `charts.data.toolbar-edit-data` | charts | not driven | no step | the area was not run (--only) |  |
| `charts.data.menu-edit-data` | charts | not driven | no step | the area was not run (--only) |  |
| `charts.legend.toolbar` | charts | not driven | no step | the area was not run (--only) |  |
| `charts.number-format.toolbar` | charts | not driven | no step | the area was not run (--only) |  |
| `charts.context` | charts | not driven | no step | the area was not run (--only) |  |
| `charts.light-appearance` | charts | not driven | no step | the area was not run (--only) |  |
| `charts.present` | charts | works | no step | the area was not run (--only) |  |
| `charts.reload` | charts | works | no step | the area was not run (--only) |  |
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
| `decks.file.open-list-search` | decks | works | failed | File > Open; read the list; type in the search; clear it: 115 decks listed after 11711 ms, first untitled-20260930-8ovx; filtered by nonsense 0; cleared 115 | 14 |
| `decks.file.import-slides-deck` | decks | works | passed |  | 15 |
| `decks.file.details` | decks | works | passed |  | 16 |
| `slides.numbers.apply` | slides | not driven | no step | the area was not run (--only) |  |
| `versions.show-changes-toggle` | versions | works | passed |  | 22 |
| `versions.show-changes-marks` | versions | not driven | failed | a heading edit and an added box after the named version; pick the older version with Show changes on; then off: picked versionHistory.11.pick (named row versionHistory.11.pick); marks with Show changes on 0 (); off 0 | 23 |
| `help.check-slides` | help | works | no step | the area was not run (--only) |  |
| `inbox.bell-panel-toggle` | inbox | broken | failed | click the bell; read the panel; click the bell again: with the switch on; panel open true (aria-pressed true); words "NotificationsMark all readNothing newNotification settings"; Mark all read true; settings link true; panel still open after the second click true (aria-pressed true) | 95 |
| `inbox.settings-persist` | inbox | broken | passed |  | 96 |
| `arrange.insert.selected-after-menu` | arrange | broken | no step | the area was not run (--only) |  |
| `arrange.insert.free-rectangle` | arrange | not driven | no step | the area was not run (--only) |  |
| `slides.layout.title-and-body-single` | slides | broken | no step | the area was not run (--only) |  |
| `slides.layout.subtitle-prompt` | slides | not driven | no step | the area was not run (--only) |  |
| `slides.layout.new-slide-inherits` | slides | not driven | no step | the area was not run (--only) |  |
| `slides.layout.tile-sentences` | slides | broken | no step | the area was not run (--only) |  |
| `slides.import.none-preselected` | slides | broken | no step | the area was not run (--only) |  |
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
| `comments.panel.empty-gesture` | comments | broken | passed |  | 27 |
| `versions.panel.author-you` | versions | broken | passed |  | 25 |
| `versions.field.square` | versions | broken | passed |  | 26 |
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
| `brand.panel.opens` | brand | not driven | passed |  | 29 |
| `brand.logo.use-on-every-slide` | brand | not driven | not driven | not on this build: format.image.useOnEverySlide (docs/PRODUCT.md 7.1, B5a); the picture's menu lists edit.cut, edit.copy, edit.paste, edit.delete, edit.duplicate, arrange.order, arrange.rotate, arrange.centerOnPage, arrange.align, format.image.replaceImage, format.image.cropImage, format.image.maskImage, format.image.resetImage, format.image.imageOptions, format.formatOptions, format.altText, inse | 31 |
| `brand.logo.remove` | brand | not driven | passed |  | 32 |
| `brand.colors.primary-live` | brand | not driven | passed |  | 33 |
| `brand.colors.palette-row` | brand | broken | passed |  | 34 |
| `brand.colors.control-ids-unique` | brand | broken | passed |  | 35 |
| `brand.colors.version-history-entry` | brand | not driven | passed |  | 36 |
| `brand.colors.role-tooltips` | brand | not driven | passed |  | 37 |
| `brand.background.enter-keeps-open` | brand | broken | passed |  | 38 |
| `brand.fonts.roles` | brand | not driven | passed |  | 39 |
| `brand.counter.format` | brand | not driven | passed |  | 40 |
| `brand.reset.default-kit` | brand | not driven | passed |  | 41 |
| `brand.layout.tiles-in-kit` | brand | broken | passed |  | 42 |
| `brand.agent.set-get` | brand | not driven | failed | brand.set /colors/light/primary and brand.get on the window API, then over HTTP: window API: --blue #2f5ce0 -> #0b3d91; brand.get {"brand":{"colors":{"light":{"primary":"#0b3d91"}}},"own":true,"revision":41}; HTTP not driven: no bearer for this origin (TURBOSLIDE_TOKEN or ~/.config/turboslide/hosts.json) | 43 |
| `fonts.dropdown.opens` | fonts | not driven | passed |  | 47 |
| `fonts.dropdown.apply-selection` | fonts | not driven | passed |  | 48 |
| `fonts.dropdown.search` | fonts | not driven | passed |  | 49 |
| `fonts.format-menu.row` | fonts | not driven | passed |  | 50 |
| `fonts.more-fonts.licence` | fonts | not driven | passed |  | 51 |
| `fonts.face.reload-and-show` | fonts | not driven | passed |  | 52 |
| `fonts.agent.font-list` | fonts | not driven | failed | font.list on the window API, then over HTTP with the bearer: window API: 34 rows, 34 with a licence; HTTP not driven: no bearer for this origin | 53 |
| `assist.entry.title-row` | assist | not driven | no step | the area was not run (--only) |  |
| `assist.panel.first-line-and-cards` | assist | not driven | no step | the area was not run (--only) |  |
| `assist.tailor.dialog-one-undo` | assist | not driven | no step | the area was not run (--only) |  |
| `assist.tailor.agent-deck-tailor` | assist | not driven | no step | the area was not run (--only) |  |
| `assist.outside-write.snackbar` | assist | broken | no step | the area was not run (--only) |  |
| `assist.finder.terms` | assist | broken | no step | the area was not run (--only) |  |
| `assist.finder.ask-row` | assist | not driven | no step | the area was not run (--only) |  |
| `assist.agent.propose-accept` | assist | not driven | no step | the area was not run (--only) |  |
| `charts.grid.type-to-edit` | charts | broken | no step | the area was not run (--only) |  |
| `charts.grid.escape-stays` | charts | broken | no step | the area was not run (--only) |  |
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
| `charts.double-click.opens-data` | charts | broken | no step | the area was not run (--only) |  |
| `charts.mark.click-selects-cell` | charts | not driven | no step | the area was not run (--only) |  |
| `tables.range.bold-italic` | tables | broken | no step | the area was not run (--only) |  |
| `tables.range.size-color` | tables | not driven | no step | the area was not run (--only) |  |
| `diagrams.step.one-object` | diagrams | broken | no step | the area was not run (--only) |  |
| `charts.legend.none-from-toolbar` | charts | broken | no step | the area was not run (--only) |  |
| `charts.panel.no-duplicate-controls` | charts | broken | no step | the area was not run (--only) |  |
| `charts.grid.remove-visible` | charts | broken | no step | the area was not run (--only) |  |
| `tables.panel.table-first` | tables | broken | no step | the area was not run (--only) |  |
| `tables.seam.row-drag` | tables | not driven | no step | the area was not run (--only) |  |
| `tables.edge.add-row-column` | tables | not driven | no step | the area was not run (--only) |  |
| `tables.heads.select-row-column` | tables | not driven | no step | the area was not run (--only) |  |
| `tables.bar.row-column-buttons` | tables | not driven | no step | the area was not run (--only) |  |
| `brand.objects.kit-colours-first` | brand | not driven | failed | the table cell's Fill color plate, the chart's series swatches, the text colour plate; a new chart's series: no table from the tables area to read | 44 |
| `arrange.group.tail-text-controls` | arrange | not driven | no step | the area was not run (--only) |  |
| `tables.command.keeps-caret` | tables | broken | no step | the area was not run (--only) |  |
| `wordart.resize.scales-letters` | wordart | broken | no step | the area was not run (--only) |  |
| `wordart.tail.fill-outline` | wordart | not driven | no step | the area was not run (--only) |  |
| `fonts.links.licence-v4-1` | fonts | broken | passed |  | 54 |
| `fonts.fallback.in-stack` | fonts | broken | passed |  | 55 |
| `fonts.display-features.inter-only` | fonts | not driven | passed |  | 56 |
| `tables.cells.tabular-figures` | tables | broken | no step | the area was not run (--only) |  |
| `formatting.numerals.tabular-row` | formatting | not driven | no step | the area was not run (--only) |  |
| `fonts.catalog.geist` | fonts | not driven | passed |  | 57 |
| `fonts.catalog.six-families` | fonts | not driven | passed |  | 58 |
| `fonts.picker.search-category` | fonts | not driven | passed |  | 59 |
| `fonts.table.takes-family` | fonts | not driven | not driven | not on this build: toolbar.font (docs/PRODUCT.md 7.1, B1); the Font control on a selected table is drawn disabled ("Inter"); takesFamily is P1 (FEATURES.md 3.5) | 60 |
| `fonts.field.own-face` | fonts | broken | failed | select the cover title and pick Fraunces in the Font dropdown; Cmd+Z and Cmd+Shift+Z; the subtitle through Format > Text > Font, Manrope; a statement slide, its big line, Geist; a reload; the show; the PDF and the Editable text PowerPoint from the export route: title slide title-1-4e95: heading typed true, lead typed true; title: label "Inter" -> stored fraunces, drawn Fraunces, Georgia, "Times Ne | 61 |
| `logos.insert.row` | logos | not driven | passed |  | 63 |
| `logos.picker.search` | logos | not driven | passed |  | 64 |
| `logos.picker.paper-and-ink` | logos | not driven | passed |  | 65 |
| `logos.picker.your-brand` | logos | not driven | failed | open the dialog; read the Your brand group; a role logo asset added through the window API; open again; click the brand tile: Your brand before the asset: kit (a tmp store has no deployment kit logo); asset.add role logo ok (brand-mark-asset); after: kit (group drawn true); the click inserted mark mark 734,408 132x84 (logo size true) | 66 |
| `logos.picker.empty-state` | logos | not driven | passed |  | 67 |
| `logos.picker.licence-words` | logos | not driven | passed |  | 68 |
| `logos.insert.one-click-asset` | logos | not driven | passed |  | 69 |
| `logos.insert.logo-size` | logos | not driven | passed |  | 70 |
| `logos.insert.mono-tint` | logos | not driven | passed |  | 71 |
| `logos.insert.every-slide` | logos | not driven | passed |  | 72 |
| `logos.tailor.find-customer-logo` | logos | not driven | passed |  | 73 |
| `logos.replace-image.row` | logos | not driven | passed |  | 74 |
| `logos.picker.variants` | logos | not driven | not driven | not on this build: dialog.logo.kind.wordmark (docs/PRODUCT.md 7.1, B1); no Symbol, Wordmark, Color or Mono control in the dialog head (P1, FEATURES.md 4.11; the appearance rule chooses) | 75 |
| `logos.kit.find-a-logo` | logos | not driven | not driven | not on this build: panel.brand.logo.find (docs/PRODUCT.md 7.1, B6); no Find a logo beside Replace in the Brand kit panel's Logo section (P1, FEATURES.md 4.5) | 76 |
| `logos.intake.url-sentence` | images | broken | passed |  | 77 |
| `shaders.insert.gallery-thumbnails` | shaders | not driven | passed |  | 80 |
| `shaders.insert.selected-free-rectangle` | shaders | broken | passed |  | 81 |
| `shaders.insert.words` | shaders | broken | passed |  | 82 |
| `shaders.panel.slider-live-undo` | shaders | not driven | passed |  | 83 |
| `shaders.panel.preset-tiles` | shaders | broken | passed |  | 84 |
| `shaders.panel.control-sentences` | shaders | not driven | passed |  | 85 |
| `shaders.panel.kit-colours` | shaders | not driven | passed |  | 86 |
| `shaders.panel.one-home` | shaders | broken | passed |  | 88 |
| `shaders.background.place-answers` | shaders | broken | failed | Slide > Change background on the body slide; Shader; a tile; Place; read the ground, the button and the dialog: chose Liquid metal; Place dialog.background.shader.place; the ground changed after 24016 ms (covering picture background, asset liquid-metal); the button read "Placing, 22 s" with the seconds | 87 |
| `shaders.perf.one-context` | shaders | not driven | passed |  | 89 |
| `shaders.background.add-to-theme` | shaders | not driven | not driven | not on this build: dialog.background.shader.addToTheme (docs/PRODUCT.md 7.1, B1 (dialogs/Background.tsx)); no Add to theme row beside the Shader row (P1, FEATURES.md 5.2 item 1) | 90 |
| `shaders.frame.scrubber-capture` | shaders | not driven | not driven | not on this build: formatOptions.shader.frame.scrubber (docs/PRODUCT.md 7.1, B5 (inspector/shader.tsx)); no Frame scrubber in the Shader section (P1, FEATURES.md 5.2 item 3) | 91 |
| `shaders.view.play-setting` | view | not driven | passed |  | 92 |
| `shaders.insert.gallery-hover-live` | shaders | not driven | passed |  | 93 |
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
| `charts.pie.add-series-refused` | charts | broken | no step | the area was not run (--only) |  |
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
| `text.bold.toolbar-marks-run` | text | broken | passed |  | 99 |
| `slides.layout.blank-empty` | slides | broken | no step | the area was not run (--only) |  |
| `text.paragraph.toolbar-live` | text | broken | passed |  | 100 |
| `text.list.enter-tab-no-error` | text | broken | passed |  | 101 |
| `text.size.run-and-typed-value` | text | broken | passed |  | 102 |
| `text.marks.whole-block-from-menu` | text | broken | passed |  | 103 |
| `text.tail.heading-takes-list-indent` | text | broken | failed | the title placeholder selected by one click; Bulleted list, Increase indent and Paint format from the tail; every disabled tail button read: disabled tail buttons 2 (toolbar.redo: "Redo"; toolbar.clearFormatting: "Clear formatting"); Bulleted list: written; Increase indent: written; Paint format: armed false (docs/POLISH.md 2.3 item 18, B1) | 105 |
| `text.heading.enter-keeps-session` | text | broken | passed |  | 106 |
| `text.link.chip-on-click` | text | broken | passed |  | 110 |
| `text.title.shrink-on-overflow` | text | broken | passed |  | 108 |
| `text.title.second-session-survives-reload` | text | broken | passed |  | 109 |
| `text.link.popover-anchored` | text | broken | passed |  | 111 |
| `text.link.detection-setting` | text | broken | passed |  | 112 |
| `text.tail.size-reads-heading` | text | broken | passed |  | 107 |
| `text.polish.highlight-console` | text | broken | passed |  | 113 |
| `lines.hit.stroke-only` | lines | broken | passed |  | 116 |
| `shapes.geometry.cloud-callout-closed` | shapes | broken | passed |  | 120 |
| `charts.grid.every-series-in-view` | charts | broken | passed |  | 121 |
| `chrome.format-options.fields-by-kind` | chrome | broken | no step | the area was not run (--only) |  |
| `lines.move.detaches` | lines | broken | passed |  | 117 |
| `lines.select.handles-no-ring` | lines | broken | passed |  | 118 |
| `arrange.select.no-browser-highlight` | arrange | broken | passed |  | 122 |
| `diagrams.label.double-click-selects-word` | diagrams | broken | failed | Insert > Diagram > Process; a double click on "Step 2" of the diagram, " plus" typed; a text box double clicked at a point, typed: double click selected "2"; the label reads "Step  plus"; the text box after a double click on "caret" and "X" typed reads "Keep the Xcaret here" (docs/POLISH.md 2.4 item 30, B1's Selection.tsx by B3's request; question 5) | 123 |
| `lines.connector.perpendicular-at-sites` | lines | broken | passed |  | 119 |
| `wordart.bar.closes` | wordart | broken | passed |  | 124 |
| `wordart.polish.chip-weight-arming` | wordart | broken | passed |  | 125 |
| `images.panel.seller-words` | images | broken | no step | the area was not run (--only) |  |
| `images.panel.drop-shadow` | images | not driven | no step | the area was not run (--only) |  |
| `images.mask.picker-fits-panel` | images | broken | no step | the area was not run (--only) |  |
| `images.caption.grows-box` | images | broken | no step | the area was not run (--only) |  |
| `images.border.color-draws-at-once` | images | broken | no step | the area was not run (--only) |  |
| `images.alt.focused-empty` | images | broken | no step | the area was not run (--only) |  |
| `images.crop.dims-outside` | images | broken | no step | the area was not run (--only) |  |
| `chrome.plate.fits-viewport` | chrome | broken | no step | the area was not run (--only) |  |
| `formatting.spacing.table-cells` | formatting | broken | no step | the area was not run (--only) |  |
| `help.check-slides.plain-sentence` | help | broken | no step | the area was not run (--only) |  |
| `slides.background.picture-grid` | slides | broken | no step | the area was not run (--only) |  |
| `menus.rows.icon-on-every-row` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.snackbar.refusal-sentence` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.handles.tooltip-words` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.tooltips.only-on-hover` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.chip.above-ring` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.dialog.no-loading-jump` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.dialog.focus-return-and-trap` | chrome | broken | no step | the area was not run (--only) |  |
| `comments.insert.needs-selection` | comments | broken | no step | the area was not run (--only) |  |
| `chrome.context.escape-closes-submenu` | chrome | broken | no step | the area was not run (--only) |  |
| `formatting.border-weight.menu-opens` | formatting | broken | no step | the area was not run (--only) |  |
| `chrome.toolbar.select-glyph` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.words.one-spelling` | chrome | broken | no step | the area was not run (--only) |  |
| `chrome.menus.structure-sweep` | chrome | broken | no step | the area was not run (--only) |  |
| `slides.filmstrip.follows-every-move` | slides | broken | no step | the area was not run (--only) |  |

## Console errors (130)

- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
- console: Access to fetch at 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/untitled-20260930-r9al/assets/figma.source.0c0d457a.svg' (redirected from 'https://turboslide-lav4xmwv1-kl01s-projects
- console: Failed to load resource: net::ERR_FAILED
