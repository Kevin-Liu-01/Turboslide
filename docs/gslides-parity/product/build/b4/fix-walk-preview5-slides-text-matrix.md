# Core walk matrix

Base https://turboslide-o6u6te5bj-kl01s-projects.vercel.app, started 2026-09-21T06:30:02.295Z, 775 s, deck untitled-20260921-wp7i. 518 probe rows: 188 passed, 0 failed, 1 not driven, 329 no step. Verdict failed; exit 1. A row passes only when every tagged step of it passed; a not driven row is never counted as passed.

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
| `decks.save.acknowledged` | decks | flaky | passed |  | 198 |
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
| `text.title.one-click-tail` | text | broken | passed |  | 178 |
| `text.title.bold-menu` | text | broken | passed |  | 179 |
| `text.title.bold-cmd-b` | text | broken | passed |  | 180 |
| `text.title.align-menu` | text | broken | passed |  | 181 |
| `text.title.size-menu` | text | broken | passed |  | 182 |
| `text.title.format-options-marks` | text | broken | passed |  | 183 |
| `text.title.apply-layout-after-format` | text | not driven | passed |  | 184 |
| `text.fontsize.type-one-undo` | text | broken | passed |  | 185 |
| `text.format-options.field-one-undo` | text | broken | passed |  | 186 |
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
| `text.link.detect-url` | text | broken | passed |  | 188 |
| `text.link.detect-email` | text | broken | passed |  | 189 |
| `text.select.double-click-address` | text | broken | passed |  | 190 |
| `text.select.shift-home-line` | text | broken | passed |  | 191 |
| `text.link.popover-apply-remove` | text | broken | passed |  | 192 |
| `text.format-options.padding-grid` | text | broken | passed |  | 194 |
| `text.format-options.remembers-section` | text | not driven | passed |  | 195 |
| `text.autofit.shrink-on-overflow` | text | not driven | passed |  | 196 |
| `text.find-replace.count-while-typing` | text | broken | passed |  | 197 |
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
