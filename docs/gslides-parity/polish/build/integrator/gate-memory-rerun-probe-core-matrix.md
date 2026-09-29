# Core gate matrix

Base http://localhost:4448, started 2026-09-29T05:16:20.239Z, 3107 s. 541 rows judged: 491 passed, 31 failed, 19 not driven (1 of them manual, the checklist's: text.clipboard.paste-without-formatting), 0 no step. Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): none judged. Cost rows over their ceiling in this run: none. Verdict failed with the committed parked list inbox, templates and the parked rows arrange.group.tail-text-controls, logos.kit.find-a-logo, logos.picker.variants, shaders.background.add-to-theme, shaders.background.place-answers, shaders.frame.scrubber-capture, shaders.library.glyph-engines-render, svg.copy.markup, tables.bar.row-column-buttons, versions.show-changes-marks, view.live-pointers.second-browser; retries no specs run; exit 1. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): lines, tables, charts, diagrams, wordart, assist; rows whose own controls a ship would keep parked: slides.numbers.apply (insert.slideNumbers); versions.show-changes-marks (file.versionHistory.showChanges); tables.bar.row-column-buttons (bar.table); arrange.group.tail-text-controls (toolbar.group.text); rows of an unparkable feature blocking the ship: decks.title.save-words, slides.layout.typed-title-round-trip, slides.layout.snackbar-counts-typed-only, slides.layout.undo-typed, slides.notes.type, slides.notes.per-slide, slides.notes.resize-handle, slides.notes.reload, slides.counter.footer-and-cards, slides.hash.click-and-reload, slides.notes.view-menu-toggle, slides.context.empty-canvas, text.autofit.title-wraps, images.options.reset, versions.open-from-last-edit, versions.pick, versions.name-current, versions.undo-restore, slides.layout.title-and-body-single, slides.layout.subtitle-prompt, slides.layout.new-slide-inherits, slides.layout.tile-sentences, slides.import.none-preselected, images.caption.add, text.bold.toolbar-marks-run, text.paragraph.toolbar-live, text.list.enter-tab-no-error, text.tail.heading-takes-list-indent, text.title.shrink-on-overflow, text.link.detection-setting, text.tail.size-reads-heading, images.caption.grows-box, help.check-slides.plain-sentence, menus.rows.icon-on-every-row, chrome.chip.above-ring, comments.insert.needs-selection.

| Row | Feature | Driver | Today | Result | Reason |
| --- | --- | --- | --- | --- | --- |
| `decks.new.draft` | decks | probe --core | works | passed |  |
| `decks.new.ground-paint` | decks | probe --core | flaky | passed |  |
| `decks.new.first-write` | decks | probe --core | works | passed |  |
| `decks.title.save-words` | decks | probe --core | works | failed | a second edit: words All changes saved; final "All changes saved" |
| `decks.title.rename-enter` | decks | probe --core | works | passed |  |
| `decks.title.rename-escape` | decks | probe --core | works | passed |  |
| `decks.title.rename-blur` | decks | probe --core | works | passed |  |
| `decks.title.rename-empty` | decks | probe --core | works | passed |  |
| `decks.title.file-rename` | decks | probe --core | works | passed |  |
| `decks.title.tab-title-after-rename` | decks | probe --core | broken | passed |  |
| `decks.title.mark-to-list` | decks | probe --core | works | passed |  |
| `decks.edit.reload-keeps-slide` | decks | probe --core | works | passed |  |
| `slides.new.toolbar` | slides | probe --core | works | passed |  |
| `slides.new.arrow-layout` | slides | probe --core | works | passed |  |
| `slides.new.menu` | slides | probe --core | works | passed |  |
| `slides.new.ctrl-m-card` | slides | probe --core | works | passed |  |
| `slides.new.ctrl-m-canvas` | slides | probe --core | works | passed |  |
| `slides.new.context` | slides | probe --core | works | passed |  |
| `slides.new.undo` | slides | probe --core | works | passed |  |
| `slides.duplicate.context` | slides | probe --core | works | passed |  |
| `slides.duplicate.menu` | slides | probe --core | works | passed |  |
| `slides.duplicate.cmd-d` | slides | probe --core | works | passed |  |
| `slides.duplicate.undo-toolbar` | slides | probe --core | works | passed |  |
| `slides.duplicate.undo-redo-keys` | slides | probe --core | works | passed |  |
| `slides.duplicate.two-selected-cmd-d` | slides | probe --core | works | passed |  |
| `slides.duplicate.two-selected-menu` | slides | probe --core | works | passed |  |
| `slides.delete.key` | slides | probe --core | works | passed |  |
| `slides.delete.undo-snackbar` | slides | probe --core | works | passed |  |
| `slides.delete.context` | slides | probe --core | works | passed |  |
| `slides.delete.undo-cmd-z` | slides | probe --core | works | passed |  |
| `slides.delete.menu-undo-redo` | slides | probe --core | works | passed |  |
| `slides.delete.two-selected-key-undo` | slides | probe --core | works | passed |  |
| `slides.delete.two-selected-menu` | slides | probe --core | broken | passed |  |
| `slides.delete.two-selected-edit-menu` | slides | probe --core | broken | passed |  |
| `slides.delete.canvas-focus-undo` | slides | probe --core | flaky | passed |  |
| `slides.delete.undo-redo-saved` | slides | probe --core | flaky | passed |  |
| `slides.select.click` | slides | probe --core | works | passed |  |
| `slides.select.arrows-shift` | slides | probe --core | works | passed |  |
| `slides.select.shift-cmd-click` | slides | probe --core | works | passed |  |
| `slides.select.cmd-click-toggle` | slides | probe --core | works | passed |  |
| `slides.reorder.drag-above` | slides | probe --core | works | passed |  |
| `slides.reorder.drag-below` | slides | probe --core | works | passed |  |
| `slides.reorder.cmd-up-down` | slides | probe --core | works | passed |  |
| `slides.reorder.menu-to-end-undo` | slides | probe --core | works | passed |  |
| `slides.reorder.undo-drag` | slides | probe --core | works | passed |  |
| `slides.reorder.two-selected-drag` | slides | probe --core | works | passed |  |
| `slides.skip.context` | slides | probe --core | works | passed |  |
| `slides.skip.context-two` | slides | probe --core | works | passed |  |
| `slides.skip.menu-unskip` | slides | probe --core | works | passed |  |
| `slides.skip.menu-two` | slides | probe --core | works | passed |  |
| `slides.layout.picker-open-escape` | slides | probe --core | works | passed |  |
| `slides.layout.apply.title` | slides | probe --core | works | passed |  |
| `slides.layout.apply.opener` | slides | probe --core | works | passed |  |
| `slides.layout.apply.split` | slides | probe --core | works | passed |  |
| `slides.layout.apply.cols` | slides | probe --core | works | passed |  |
| `slides.layout.apply.title-only` | slides | probe --core | works | passed |  |
| `slides.layout.apply.one-column` | slides | probe --core | works | passed |  |
| `slides.layout.apply.statement` | slides | probe --core | works | passed |  |
| `slides.layout.apply.section-description` | slides | probe --core | works | passed |  |
| `slides.layout.apply.mood` | slides | probe --core | works | passed |  |
| `slides.layout.apply.big-number` | slides | probe --core | works | passed |  |
| `slides.layout.apply.blank` | slides | probe --core | works | passed |  |
| `slides.layout.apply.rows` | slides | probe --core | works | passed |  |
| `slides.layout.apply.plain` | slides | probe --core | works | passed |  |
| `slides.layout.apply.table` | slides | probe --core | works | passed |  |
| `slides.layout.apply.figure` | slides | probe --core | works | passed |  |
| `slides.layout.apply.pair` | slides | probe --core | works | passed |  |
| `slides.layout.apply.tiles` | slides | probe --core | works | passed |  |
| `slides.layout.apply.details` | slides | probe --core | works | passed |  |
| `slides.layout.apply.board` | slides | probe --core | works | passed |  |
| `slides.layout.apply.matrix` | slides | probe --core | works | passed |  |
| `slides.layout.apply.closing` | slides | probe --core | works | passed |  |
| `slides.layout.reopen-ring` | slides | probe --core | works | passed |  |
| `slides.layout.context-apply` | slides | probe --core | works | passed |  |
| `slides.layout.menu-apply-undo` | slides | probe --core | works | passed |  |
| `slides.layout.fresh-slide-two-picks-no-carry` | slides | probe --core | broken | passed |  |
| `slides.layout.typed-title-round-trip` | slides | probe --core | works | failed | type a title, apply Main point, then Title and body: error: page.evaluate: Execution context was destroyed, most likely because of a navigation |
| `slides.layout.snackbar-counts-typed-only` | slides | probe --core | broken | failed | apply Title slide to an untouched slide: error: page.evaluate: TypeError: Cannot read properties of undefined (reading 'studio') |
| `slides.layout.undo-typed` | slides | probe --core | works | failed | Cmd+Z after a layout change on a typed slide: error: page.evaluate: TypeError: Cannot read properties of undefined (reading 'studio') |
| `slides.notes.type` | slides | probe --core | works | not driven | setup failed: trim the deck to 4 slides |
| `slides.notes.per-slide` | slides | probe --core | works | not driven | setup failed: trim the deck to 4 slides |
| `slides.notes.resize-handle` | slides | probe --core | works | not driven | setup failed: trim the deck to 4 slides |
| `slides.notes.reload` | slides | probe --core | works | not driven | setup failed: trim the deck to 4 slides |
| `slides.counter.footer-and-cards` | slides | probe --core | works | not driven | setup failed: trim the deck to 4 slides |
| `slides.hash.click-and-reload` | slides | probe --core | works | not driven | setup failed: trim the deck to 4 slides |
| `slides.reorder.menu-up-down-beginning` | slides | probe --core | not driven | passed |  |
| `slides.reorder.cmd-shift-up-down` | slides | probe --core | not driven | passed |  |
| `slides.notes.view-menu-toggle` | slides | probe --core | not driven | not driven | setup failed: trim the deck to 4 slides |
| `slides.context.empty-canvas` | slides | probe --core | not driven | not driven | setup failed: trim the deck to 4 slides |
| `text.title.single-click` | text | probe --core | broken | passed |  |
| `text.title.double-click` | text | probe --core | works | passed |  |
| `text.title.type-escape` | text | probe --core | works | passed |  |
| `text.selected.typing-replaces` | text | probe --core | not driven | passed |  |
| `text.selected.enter-appends` | text | probe --core | not driven | passed |  |
| `text.title.double-click-enters` | text | probe --core | not driven | passed |  |
| `text.caret.click-mid-word` | text | probe --core | works | passed |  |
| `text.caret.home-end` | text | probe --core | works | passed |  |
| `text.caret.shift-arrow-replace` | text | probe --core | works | passed |  |
| `text.caret.shift-home-end` | text | probe --core | works | passed |  |
| `text.caret.backspace-word` | text | probe --core | works | passed |  |
| `text.caret.option-backspace` | text | probe --core | works | passed |  |
| `text.caret.delete` | text | probe --core | works | passed |  |
| `text.caret.cmd-a` | text | probe --core | works | passed |  |
| `text.title.enter-commits` | text | probe --core | works | passed |  |
| `text.session.escape-twice` | text | probe --core | works | passed |  |
| `text.subtitle.double-click-type` | text | probe --core | works | passed |  |
| `text.subtitle.enter-new-line` | text | probe --core | works | passed |  |
| `text.subtitle.shift-enter` | text | probe --core | works | passed |  |
| `text.subtitle.arrows-backspace-join` | text | probe --core | works | passed |  |
| `text.subtitle.escape-commits` | text | probe --core | works | passed |  |
| `text.textbox.insert-click-type` | text | probe --core | works | passed |  |
| `text.textbox.insert-drag` | text | probe --core | works | passed |  |
| `text.textbox.drag-inside-moves` | text | probe --core | broken | passed |  |
| `text.textbox.burst-reliability` | text | probe --core | broken | passed |  |
| `text.toolbar.swaps-on-select` | text | probe --core | works | passed |  |
| `text.fontsize.type-enter` | text | probe --core | works | passed |  |
| `text.fontsize.plus-minus` | text | probe --core | works | passed |  |
| `text.bold.toolbar` | text | probe --core | works | passed |  |
| `text.bold.cmd-b-word` | text | probe --core | works | passed |  |
| `text.italic.toolbar-word` | text | probe --core | broken | passed |  |
| `text.italic.cmd-i-word` | text | probe --core | works | passed |  |
| `text.underline.cmd-u-word` | text | probe --core | works | passed |  |
| `text.underline.toolbar` | text | probe --core | works | passed |  |
| `text.strikethrough.cmd-shift-x` | text | probe --core | works | passed |  |
| `text.strikethrough.menu` | text | probe --core | works | passed |  |
| `text.color.swatch-on-word` | text | probe --core | broken | passed |  |
| `text.align.toolbar-and-key` | text | probe --core | works | passed |  |
| `text.spacing.toolbar` | text | probe --core | works | passed |  |
| `text.list.bulleted-toolbar` | text | probe --core | broken | passed |  |
| `text.list.numbered-toolbar` | text | probe --core | broken | passed |  |
| `text.list.bulleted-menu-preset` | text | probe --core | works | passed |  |
| `text.indent.toolbar` | text | probe --core | works | passed |  |
| `text.indent.keys` | text | probe --core | works | passed |  |
| `text.link.cmd-k-enter` | text | probe --core | broken | passed |  |
| `text.clear-formatting` | text | probe --core | works | passed |  |
| `text.format-menu.rows-enabled` | text | probe --core | works | passed |  |
| `text.format-menu.size-increase` | text | probe --core | works | passed |  |
| `text.format-menu.align-left` | text | probe --core | works | passed |  |
| `text.format-menu.spacing-double` | text | probe --core | works | passed |  |
| `text.format-menu.text-fitting` | text | probe --core | not driven | passed |  |
| `text.autofit.title-wraps` | text | probe --core | works | failed | type a long title into the title slide: lines 1; split words 0; overlap with the subtitle 0 px²; inside the sheet true |
| `text.autofit.textbox-grow` | text | probe --core | broken | passed |  |
| `text.clipboard.within-box` | text | probe --core | works | passed |  |
| `text.clipboard.between-boxes` | text | probe --core | works | passed |  |
| `text.clipboard.paste-without-formatting` | text | probe --core | not driven | not driven | manual: headless Chromium does not synthesize Cmd+Shift+V as a paste; the step is docs/gslides-parity/focus/manual-checklist.md |
| `text.find-replace.replace-all` | text | probe --core | works | passed |  |
| `text.find-replace.shortcut` | text | probe --core | flaky | passed |  |
| `text.persistence.reload` | text | probe --core | works | passed |  |
| `text.list.numbered-menu-preset` | text | probe --core | not driven | passed |  |
| `text.list.chords` | text | probe --core | not driven | passed |  |
| `text.link.toolbar-button` | text | probe --core | not driven | passed |  |
| `text.format-options.panel` | text | probe --core | not driven | passed |  |
| `text.layout-runs.type` | text | probe --core | not driven | passed |  |
| `text.context.text-block` | text | probe --core | not driven | passed |  |
| `text.context.text-selection` | text | probe --core | not driven | passed |  |
| `text.context.inside-session` | text | probe --core | broken | passed |  |
| `text.format-menu.size-decrease` | text | probe --core | not driven | passed |  |
| `text.format-menu.spacing-single-1-15` | text | probe --core | not driven | passed |  |
| `text.format-menu.align-indent-rows` | text | probe --core | not driven | passed |  |
| `text.textbox.toolbar-button` | text | probe --core | not driven | passed |  |
| `images.insert.toolbar-sources` | images | probe --core | works | passed |  |
| `images.select.chip-handles-tail` | images | probe --core | works | passed |  |
| `images.delete.key` | images | probe --core | works | passed |  |
| `images.move.drag-frame` | images | probe --core | works | passed |  |
| `images.guides.edge-snap` | images | probe --core | works | passed |  |
| `images.guides.centre-y` | images | probe --core | works | passed |  |
| `images.guides.centre-x` | images | probe --core | flaky | passed |  |
| `images.nudge.arrows` | images | probe --core | works | passed |  |
| `images.resize.eight-handles` | images | probe --core | works | passed |  |
| `images.resize.eight-handles-shift` | images | probe --core | works | passed |  |
| `images.resize.edge-fill` | images | probe --core | broken | passed |  |
| `images.resize.alt-centre` | images | probe --core | works | passed |  |
| `images.rotate.ring` | images | probe --core | works | passed |  |
| `images.crop.double-click` | images | probe --core | works | passed |  |
| `images.crop.east-edge` | images | probe --core | works | passed |  |
| `images.crop.south-edge` | images | probe --core | works | passed |  |
| `images.crop.enter` | images | probe --core | works | passed |  |
| `images.crop.undo` | images | probe --core | works | passed |  |
| `images.crop.redo` | images | probe --core | works | passed |  |
| `images.crop.menu-escape` | images | probe --core | works | passed |  |
| `images.crop.toolbar-escape-cancels` | images | probe --core | broken | passed |  |
| `images.options.panel` | images | probe --core | works | passed |  |
| `images.options.transparency` | images | probe --core | works | passed |  |
| `images.options.reset` | images | probe --core | works | failed | Adjustments > Reset: opacity 0.39; stored transparency true |
| `images.reset-image.menu` | images | probe --core | works | passed |  |
| `images.background.colour` | images | probe --core | works | passed |  |
| `images.background.toolbar` | images | probe --core | works | passed |  |
| `images.background.reset` | images | probe --core | works | passed |  |
| `images.present.picture-and-ground` | images | probe --core | works | passed |  |
| `images.context.image` | images | probe --core | not driven | passed |  |
| `images.options.menu-row` | images | probe --core | not driven | passed |  |
| `images.background.hex-field` | images | probe --core | not driven | passed |  |
| `arrange.select.click` | arrange | probe --core | works | passed |  |
| `arrange.select.shift-add` | arrange | probe --core | works | passed |  |
| `arrange.multi.drag-inside-moves-all` | arrange | probe --core | broken | passed |  |
| `arrange.select.shift-remove` | arrange | probe --core | works | passed |  |
| `arrange.select.marquee` | arrange | probe --core | works | passed |  |
| `arrange.select.marquee-partial` | arrange | probe --core | works | passed |  |
| `arrange.select.click-away` | arrange | probe --core | works | passed |  |
| `arrange.select.cmd-a` | arrange | probe --core | works | passed |  |
| `arrange.select.escape` | arrange | probe --core | works | passed |  |
| `arrange.order.bring-to-front` | arrange | probe --core | works | passed |  |
| `arrange.order.send-to-back` | arrange | probe --core | works | passed |  |
| `arrange.order.bring-forward` | arrange | probe --core | works | passed |  |
| `arrange.order.send-backward` | arrange | probe --core | works | passed |  |
| `arrange.order.keys` | arrange | probe --core | works | passed |  |
| `arrange.align.left` | arrange | probe --core | works | passed |  |
| `arrange.align.center` | arrange | probe --core | works | passed |  |
| `arrange.align.right` | arrange | probe --core | flaky | passed |  |
| `arrange.align.top` | arrange | probe --core | broken | passed |  |
| `arrange.align.middle` | arrange | probe --core | works | passed |  |
| `arrange.align.bottom` | arrange | probe --core | broken | passed |  |
| `arrange.align.single-to-slide` | arrange | probe --core | works | passed |  |
| `arrange.center.horizontal` | arrange | probe --core | works | passed |  |
| `arrange.center.vertical` | arrange | probe --core | works | passed |  |
| `arrange.undo.toolbar-on-arrange` | arrange | probe --core | works | passed |  |
| `arrange.undo.menu-on-arrange` | arrange | probe --core | works | passed |  |
| `arrange.clipboard.copy-paste` | arrange | probe --core | works | passed |  |
| `arrange.clipboard.delete` | arrange | probe --core | works | passed |  |
| `arrange.clipboard.undo-redo-delete` | arrange | probe --core | works | passed |  |
| `arrange.clipboard.cut-paste-undo` | arrange | probe --core | flaky | passed |  |
| `arrange.clipboard.menu-copy-paste` | arrange | probe --core | flaky | passed |  |
| `arrange.clipboard.paste-after-new-slide-button` | arrange | probe --core | broken | passed |  |
| `arrange.clipboard.paste-with-filmstrip-focus` | arrange | probe --core | broken | passed |  |
| `arrange.clipboard.paste-keeps-position` | arrange | probe --core | works | passed |  |
| `arrange.duplicate.cmd-d` | arrange | probe --core | works | passed |  |
| `arrange.duplicate.menu-selects-copy` | arrange | probe --core | broken | passed |  |
| `arrange.duplicate.nothing-selected` | arrange | probe --core | works | passed |  |
| `arrange.redo.after-undone-duplicate` | arrange | probe --core | broken | passed |  |
| `arrange.keys.backspace-empty-selection` | arrange | probe --core | broken | passed |  |
| `arrange.nudge.arrows` | arrange | probe --core | works | passed |  |
| `arrange.nudge.shift` | arrange | probe --core | works | passed |  |
| `arrange.nudge.undo` | arrange | probe --core | works | passed |  |
| `arrange.zoom.box-reads` | arrange | probe --core | works | passed |  |
| `arrange.zoom.menu-in` | arrange | probe --core | broken | passed |  |
| `arrange.zoom.cmd-minus` | arrange | probe --core | broken | passed |  |
| `arrange.zoom.cmd-plus` | arrange | probe --core | broken | passed |  |
| `arrange.zoom.fit` | arrange | probe --core | flaky | passed |  |
| `arrange.zoom.type-percent` | arrange | probe --core | works | passed |  |
| `arrange.zoom.arrow-menu` | arrange | probe --core | works | passed |  |
| `arrange.zoom.cmd-0` | arrange | probe --core | works | passed |  |
| `arrange.zoom.menu-out` | arrange | probe --core | broken | passed |  |
| `arrange.readout.fit` | arrange | probe --core | works | passed |  |
| `arrange.readout.200` | arrange | probe --core | works | passed |  |
| `arrange.selection-colour.light` | arrange | probe --core | works | passed |  |
| `arrange.selection-colour.dark` | arrange | probe --core | works | passed |  |
| `arrange.escape.text-then-selection` | arrange | probe --core | works | passed |  |
| `arrange.zoom.menu-presets` | arrange | probe --core | not driven | passed |  |
| `arrange.toolbar.select` | arrange | probe --core | not driven | passed |  |
| `shapes.insert.rectangle-click` | shapes | probe --core | works | passed |  |
| `shapes.insert.rounded-click` | shapes | probe --core | works | passed |  |
| `shapes.insert.ellipse-click` | shapes | probe --core | works | passed |  |
| `shapes.insert.rectangle-drag` | shapes | probe --core | works | passed |  |
| `shapes.insert.ellipse-drag` | shapes | probe --core | works | passed |  |
| `shapes.insert.named-rows` | shapes | probe --core | not driven | passed |  |
| `shapes.default-look` | shapes | probe --core | broken | passed |  |
| `shapes.select` | shapes | probe --core | works | passed |  |
| `shapes.move` | shapes | probe --core | not driven | passed |  |
| `shapes.resize.eight-handles` | shapes | probe --core | not driven | passed |  |
| `shapes.rotate` | shapes | probe --core | not driven | passed |  |
| `shapes.fill.colour` | shapes | probe --core | not driven | passed |  |
| `shapes.border.colour-weight-dash` | shapes | probe --core | not driven | passed |  |
| `shapes.text.type-align-bold` | shapes | probe --core | not driven | passed |  |
| `shapes.duplicate-delete-undo-redo` | shapes | probe --core | not driven | passed |  |
| `shapes.format-options.size-position` | shapes | probe --core | not driven | passed |  |
| `shapes.reload-and-viewer` | shapes | probe --core | not driven | passed |  |
| `shapes.context.shape` | shapes | probe --core | not driven | passed |  |
| `share.file-menu-share-with-others` | share | probe --core | not driven | passed |  |
| `versions.open-from-last-edit` | versions | probe --core | works | failed | click the Last edit words in the title row: error: locator.waitFor: Timeout 8000ms exceeded. |
| `versions.pick` | versions | probe --core | works | failed | pick a version in the panel: no version rows in the panel |
| `versions.name-current` | versions | probe --core | works | failed | Name current version, type a name, Save: error: locator.boundingBox: Timeout 30000ms exceeded. |
| `versions.undo-restore` | versions | probe --core | not driven | failed | Restore an earlier version, then Cmd+Z: no Restore control in the panel |
| `shapes.text.colour-toolbar` | shapes | probe --core | broken | passed |  |
| `shapes.text.enter-opens-label` | shapes | probe --core | works | passed |  |
| `shapes.borders-lines.menu` | shapes | probe --core | works | passed |  |
| `tables.insert.grid` | tables | probe --core | works | passed |  |
| `tables.cell.double-click-type` | tables | probe --core | works | passed |  |
| `tables.cell.tab-from-written` | tables | probe --core | broken | passed |  |
| `tables.cell.tab-from-empty` | tables | probe --core | works | passed |  |
| `tables.cell.shift-tab` | tables | probe --core | not driven | passed |  |
| `tables.cell.tab-last-appends-row` | tables | probe --core | works | passed |  |
| `tables.menu.format-table-with-session` | tables | probe --core | broken | passed |  |
| `tables.menu.format-table-selected` | tables | probe --core | broken | passed |  |
| `tables.menu.format-table-rows` | tables | probe --core | not driven | passed |  |
| `tables.context.rows` | tables | probe --core | works | passed |  |
| `tables.context.insert-delete` | tables | probe --core | works | passed |  |
| `tables.column.insert-keeps-widths` | tables | probe --core | broken | passed |  |
| `tables.column.resize-seam` | tables | probe --core | not driven | passed |  |
| `tables.cell.align-menu` | tables | probe --core | broken | passed |  |
| `tables.cell.align-toolbar` | tables | probe --core | broken | passed |  |
| `tables.select.resize` | tables | probe --core | works | passed |  |
| `tables.cell.fill-border-tail` | tables | probe --core | not driven | passed |  |
| `tables.cells.merge-unmerge` | tables | probe --core | not driven | passed |  |
| `tables.tail.merge-unmerge-buttons` | tables | probe --core | not driven | passed |  |
| `tables.distribute.rows-columns` | tables | probe --core | not driven | passed |  |
| `tables.light-appearance` | tables | probe --core | not driven | passed |  |
| `tables.present` | tables | probe --core | works | passed |  |
| `tables.reload` | tables | probe --core | works | passed |  |
| `charts.insert.bar` | charts | probe --core | works | passed |  |
| `charts.insert.column` | charts | probe --core | works | passed |  |
| `charts.insert.line` | charts | probe --core | works | passed |  |
| `charts.insert.pie` | charts | probe --core | works | passed |  |
| `charts.select.tail` | charts | probe --core | works | passed |  |
| `charts.resize` | charts | probe --core | works | passed |  |
| `charts.type.panel-legible` | charts | probe --core | broken | passed |  |
| `charts.type.toolbar` | charts | probe --core | not driven | passed |  |
| `charts.type.menu` | charts | probe --core | not driven | passed |  |
| `charts.data.add-series-category` | charts | probe --core | works | passed |  |
| `charts.data.edit-cell` | charts | probe --core | works | passed |  |
| `charts.data.toolbar-edit-data` | charts | probe --core | not driven | passed |  |
| `charts.data.menu-edit-data` | charts | probe --core | not driven | passed |  |
| `charts.legend.toolbar` | charts | probe --core | not driven | passed |  |
| `charts.number-format.toolbar` | charts | probe --core | not driven | passed |  |
| `charts.context` | charts | probe --core | not driven | passed |  |
| `charts.light-appearance` | charts | probe --core | not driven | passed |  |
| `charts.present` | charts | probe --core | works | passed |  |
| `charts.reload` | charts | probe --core | works | passed |  |
| `wordart.insert` | wordart | probe --core | works | passed |  |
| `wordart.edit` | wordart | probe --core | not driven | passed |  |
| `wordart.light-appearance` | wordart | probe --core | not driven | passed |  |
| `formatting.superscript.chord` | formatting | probe --core | works | passed |  |
| `formatting.subscript.chord` | formatting | probe --core | works | passed |  |
| `formatting.superscript.menu-word` | formatting | probe --core | broken | passed |  |
| `formatting.subscript.menu-word` | formatting | probe --core | broken | passed |  |
| `formatting.italic.menu-word` | formatting | probe --core | broken | passed |  |
| `formatting.context.selection-rows` | formatting | probe --core | not driven | passed |  |
| `formatting.capitalization.upper` | formatting | probe --core | works | passed |  |
| `formatting.capitalization.lower` | formatting | probe --core | works | passed |  |
| `formatting.capitalization.title` | formatting | probe --core | works | passed |  |
| `formatting.align.justified-menu` | formatting | probe --core | works | passed |  |
| `formatting.align.justified-chord` | formatting | probe --core | works | passed |  |
| `formatting.align.toolbar-justify` | formatting | probe --core | not driven | passed |  |
| `formatting.spacing.add-before-remove` | formatting | probe --core | works | passed |  |
| `formatting.spacing.add-after` | formatting | probe --core | works | passed |  |
| `formatting.spacing.custom-dialog` | formatting | probe --core | works | passed |  |
| `formatting.spacing.1-15-value` | formatting | probe --core | broken | passed |  |
| `formatting.highlight.word` | formatting | probe --core | works | passed |  |
| `formatting.paint-format.button` | formatting | probe --core | works | passed |  |
| `formatting.paint-format.chords` | formatting | probe --core | not driven | passed |  |
| `formatting.clear.inline-marks` | formatting | probe --core | broken | passed |  |
| `formatting.theme.panel-appearance` | formatting | probe --core | works | passed |  |
| `formatting.theme.toolbar-button` | formatting | probe --core | works | passed |  |
| `formatting.theme.import-hidden` | formatting | probe --core | not driven | passed |  |
| `formatting.persistence` | formatting | probe --core | works | passed |  |
| `text.title.one-click-tail` | text | probe --core | broken | passed |  |
| `text.title.bold-menu` | text | probe --core | broken | passed |  |
| `text.title.bold-cmd-b` | text | probe --core | broken | passed |  |
| `text.title.align-menu` | text | probe --core | broken | passed |  |
| `text.title.size-menu` | text | probe --core | broken | passed |  |
| `text.title.format-options-marks` | text | probe --core | broken | passed |  |
| `text.title.apply-layout-after-format` | text | probe --core | not driven | passed |  |
| `text.fontsize.type-one-undo` | text | probe --core | broken | passed |  |
| `text.format-options.field-one-undo` | text | probe --core | broken | passed |  |
| `arrange.distribute.horizontal` | arrange | probe --core | works | passed |  |
| `arrange.distribute.vertical` | arrange | probe --core | works | passed |  |
| `arrange.distribute.needs-three` | arrange | probe --core | works | passed |  |
| `arrange.rotate.quarter-turns` | arrange | probe --core | works | passed |  |
| `arrange.rotate.flips-menu` | arrange | probe --core | works | passed |  |
| `arrange.group.chords` | arrange | probe --core | works | passed |  |
| `arrange.group.menu-regroup` | arrange | probe --core | works | passed |  |
| `arrange.group.context-rows` | arrange | probe --core | not driven | passed |  |
| `arrange.context.rotate-distribute` | arrange | probe --core | not driven | passed |  |
| `arrange.ruler.show-hide` | arrange | probe --core | works | passed |  |
| `arrange.guides.from-ruler` | arrange | probe --core | works | passed |  |
| `arrange.guides.show-toggle` | arrange | probe --core | works | passed |  |
| `arrange.guides.add-vertical-horizontal` | arrange | probe --core | works | passed |  |
| `arrange.guides.drag` | arrange | probe --core | flaky | passed |  |
| `arrange.snap.guides-on-off` | arrange | probe --core | works | passed |  |
| `arrange.snap.grid-toggle` | arrange | probe --core | works | passed |  |
| `arrange.snap.grid-effect` | arrange | probe --core | not driven | passed |  |
| `arrange.guides.context` | arrange | probe --core | works | passed |  |
| `arrange.guides.clear` | arrange | probe --core | works | passed |  |
| `arrange.select-none.menu` | arrange | probe --core | works | passed |  |
| `view.appearance.rows` | view | probe --core | works | passed |  |
| `view.show-filmstrip` | view | probe --core | works | passed |  |
| `view.mode.rows` | view | probe --core | works | passed |  |
| `view.mode.viewing-hides-toolbar` | view | probe --core | broken | passed |  |
| `view.full-screen` | view | probe --core | works | passed |  |
| `view.hide-menus-chevron` | view | probe --core | not driven | passed |  |
| `view.live-pointers.toggles` | view | probe --core | works | passed |  |
| `view.comments.radios` | view | probe --core | works | passed |  |
| `view.comments.show-all-panel` | view | probe --core | broken | passed |  |
| `view.comments.modes-markers` | view | probe --core | not driven | passed |  |
| `decks.name.follows-heading` | decks | probe --core | broken | passed |  |
| `decks.file.open-list-search` | decks | probe --core | works | passed |  |
| `decks.file.import-slides-deck` | decks | probe --core | works | passed |  |
| `decks.file.details` | decks | probe --core | works | passed |  |
| `slides.numbers.apply` | slides | probe --core | not driven | not driven | setup failed: trim the deck to 4 slides |
| `versions.show-changes-toggle` | versions | probe --core | works | passed |  |
| `versions.show-changes-marks` | versions | probe --core | not driven | failed | a heading edit and an added box after the named version; pick the older version with Show changes on; then off: picked versionHistory.448.pick (named row null); marks with Show changes on 0 (); off 0 |
| `arrange.insert.selected-after-menu` | arrange | probe --core | broken | passed |  |
| `arrange.insert.free-rectangle` | arrange | probe --core | not driven | passed |  |
| `slides.layout.title-and-body-single` | slides | probe --core | broken | not driven | setup failed: trim the deck to 4 slides |
| `slides.layout.subtitle-prompt` | slides | probe --core | not driven | not driven | setup failed: trim the deck to 4 slides |
| `slides.layout.new-slide-inherits` | slides | probe --core | not driven | not driven | setup failed: trim the deck to 4 slides |
| `slides.layout.tile-sentences` | slides | probe --core | broken | not driven | setup failed: trim the deck to 4 slides |
| `slides.import.none-preselected` | slides | probe --core | broken | not driven | setup failed: trim the deck to 4 slides |
| `text.link.detect-url` | text | probe --core | broken | passed |  |
| `text.link.detect-email` | text | probe --core | broken | passed |  |
| `text.select.double-click-address` | text | probe --core | broken | passed |  |
| `text.select.shift-home-line` | text | probe --core | broken | passed |  |
| `text.link.popover-apply-remove` | text | probe --core | broken | passed |  |
| `text.format-options.padding-grid` | text | probe --core | broken | passed |  |
| `text.format-options.remembers-section` | text | probe --core | not driven | passed |  |
| `text.autofit.shrink-on-overflow` | text | probe --core | not driven | passed |  |
| `text.find-replace.count-while-typing` | text | probe --core | broken | passed |  |
| `images.caption.add` | images | probe --core | not driven | not driven | not on this build: format.image.addCaption (docs/PRODUCT.md 7.1, B2); the picture's menu lists edit.cut, edit.copy, edit.paste, edit.delete, edit.duplicate, arrange.order, arrange.rotate, arrange.centerOnPage, arrange.align, format.image.replaceImage, format.image.cropImage, format.image.maskImage,  |
| `images.options.picture-sections-only` | images | probe --core | broken | passed |  |
| `images.transparency.slider` | images | probe --core | broken | passed |  |
| `images.border.drawn` | images | probe --core | broken | passed |  |
| `formatting.alt-text.write-undo` | formatting | probe --core | works | passed |  |
| `comments.panel.empty-gesture` | comments | probe --core | broken | passed |  |
| `versions.panel.author-you` | versions | probe --core | broken | passed |  |
| `versions.field.square` | versions | probe --core | broken | passed |  |
| `assist.entry.title-row` | assist | probe --core | not driven | passed |  |
| `assist.panel.first-line-and-cards` | assist | probe --core | not driven | passed |  |
| `assist.tailor.dialog-one-undo` | assist | probe --core | not driven | passed |  |
| `assist.tailor.agent-deck-tailor` | assist | probe --core | not driven | passed |  |
| `assist.outside-write.snackbar` | assist | probe --core | broken | passed |  |
| `assist.finder.terms` | assist | probe --core | broken | passed |  |
| `assist.finder.ask-row` | assist | probe --core | not driven | passed |  |
| `assist.agent.propose-accept` | assist | probe --core | not driven | failed | assist.propose over HTTP, assist.accept with the card, then the card with one byte changed: assist.propose answered 401 {"error":{"name":"ModelCallError","status":401,"message":"The assistant’s model answered 401","action":"assist.propose"}} |
| `charts.grid.type-to-edit` | charts | probe --core | broken | passed |  |
| `charts.grid.escape-stays` | charts | probe --core | broken | passed |  |
| `tables.cell.click-places-caret` | tables | probe --core | broken | passed |  |
| `tables.cell.click-then-type` | tables | probe --core | broken | passed |  |
| `tables.range.drag-from-selected` | tables | probe --core | not driven | passed |  |
| `shapes.label.centred-default` | shapes | probe --core | broken | passed |  |
| `shapes.geometry.shapes.hexagon-sheet` | shapes | probe --core | broken | passed |  |
| `shapes.geometry.shapes.star5-adjust` | shapes | probe --core | not driven | passed |  |
| `shapes.geometry.shapes.pie-arc` | shapes | probe --core | broken | passed |  |
| `shapes.geometry.shapes.multipath-can` | shapes | probe --core | broken | passed |  |
| `shapes.geometry.shapes.flowchart-own-space` | shapes | probe --core | broken | passed |  |
| `shapes.geometry.arrows.right-arrow` | shapes | probe --core | broken | passed |  |
| `shapes.geometry.arrows.curved-right` | shapes | probe --core | broken | passed |  |
| `shapes.geometry.callouts.wedge-rect` | shapes | probe --core | broken | passed |  |
| `shapes.geometry.callouts.cloud` | shapes | probe --core | broken | passed |  |
| `shapes.geometry.equation.plus-divide` | shapes | probe --core | broken | passed |  |
| `shapes.geometry.pinned-three` | shapes | probe --core | works | passed |  |
| `shapes.geometry.sites` | shapes | probe --core | broken | passed |  |
| `shapes.geometry.resize-keeps-adjust` | shapes | probe --core | not driven | passed |  |
| `shapes.insert.grid-shapes` | shapes | probe --core | broken | passed |  |
| `shapes.insert.grid-arrows` | shapes | probe --core | broken | passed |  |
| `shapes.insert.grid-callouts` | shapes | probe --core | broken | passed |  |
| `shapes.insert.grid-equation` | shapes | probe --core | broken | passed |  |
| `shapes.icons.named-rows` | shapes | probe --core | broken | passed |  |
| `shapes.change-shape.plate` | shapes | probe --core | not driven | passed |  |
| `shapes.mask-image.plate` | shapes | probe --core | not driven | passed |  |
| `tables.selected.typing-appends` | tables | probe --core | broken | passed |  |
| `tables.cell.arrows-cross-cells` | tables | probe --core | not driven | passed |  |
| `tables.range.shift-arrows` | tables | probe --core | not driven | passed |  |
| `charts.double-click.opens-data` | charts | probe --core | broken | passed |  |
| `charts.mark.click-selects-cell` | charts | probe --core | not driven | passed |  |
| `tables.range.bold-italic` | tables | probe --core | broken | passed |  |
| `tables.range.size-color` | tables | probe --core | not driven | passed |  |
| `charts.legend.none-from-toolbar` | charts | probe --core | broken | passed |  |
| `charts.panel.no-duplicate-controls` | charts | probe --core | broken | passed |  |
| `charts.grid.remove-visible` | charts | probe --core | broken | failed | the grid with the pointer away; the active row's remove control, the series swatch; a right click on a series header: remove control formatOptions.chart.category.0.remove opacity 0 with the row hovered (0 with the pointer away, item 26); series swatch 14 by 14; right click on the series header lists |
| `tables.panel.table-first` | tables | probe --core | broken | passed |  |
| `tables.seam.row-drag` | tables | probe --core | not driven | passed |  |
| `tables.edge.add-row-column` | tables | probe --core | not driven | passed |  |
| `tables.heads.select-row-column` | tables | probe --core | not driven | passed |  |
| `tables.bar.row-column-buttons` | tables | probe --core | not driven | not driven | not on this build: bar.table (docs/PRODUCT.md 7.1, B3); no bar under the selected table (P1, FEATURES.md 2.3 item 3) |
| `arrange.group.tail-text-controls` | arrange | probe --core | not driven | not driven | not on this build: toolbar.group.text (docs/PRODUCT.md 7.1, B3); chip "Group"; the group tail lists toolbar.fillColor, toolbar.borderColor, toolbar.borderWeight, toolbar.borderDash, toolbar.formatOptions and none of the text controls (P1, FEATURES.md 2.3 item 6) |
| `tables.command.keeps-caret` | tables | probe --core | broken | passed |  |
| `wordart.resize.scales-letters` | wordart | probe --core | broken | passed |  |
| `wordart.tail.fill-outline` | wordart | probe --core | not driven | passed |  |
| `tables.cells.tabular-figures` | tables | probe --core | broken | passed |  |
| `formatting.numerals.tabular-row` | formatting | probe --core | not driven | passed |  |
| `tables.select.ring-with-cell-open` | tables | probe --core | broken | passed |  |
| `tables.cell.ring-on-cell` | tables | probe --core | broken | passed |  |
| `tables.cells.empty-grid-guides` | tables | probe --core | broken | passed |  |
| `tables.light-appearance-guides` | tables | probe --core | not driven | passed |  |
| `tables.insert.box-fits-rows` | tables | probe --core | broken | passed |  |
| `tables.rows.grow-with-text` | tables | probe --core | broken | passed |  |
| `tables.resize.rows-share-extra` | tables | probe --core | broken | passed |  |
| `tables.seam.visible-with-cell-open` | tables | probe --core | broken | passed |  |
| `tables.heads.header-toggle` | tables | probe --core | not driven | passed |  |
| `tables.panel.section-words` | tables | probe --core | broken | passed |  |
| `charts.pie.add-series-refused` | charts | probe --core | broken | passed |  |
| `tables.cells.no-prompt` | tables | probe --core | broken | passed |  |
| `tables.rows.ring-follows-typing` | tables | probe --core | broken | passed |  |
| `tables.cell.click-moves-caret` | tables | probe --core | broken | passed |  |
| `tables.tail.size-step-ladder` | tables | probe --core | broken | failed | a typed 3 by 3 table; the header row selected as a range by a drag; the tail's "−" twice, then "+" until 20: range true; field 20 -> 18 -> 17 (stored size 17); back at 20; "+" aria-disabled true "Increase font size"; snackbar none (docs/POLISH.md 2.2 item 5, B1's ToolbarTail.tsx by B2's request) |
| `tables.insert.box-never-shorter-than-rows` | tables | probe --core | broken | failed | Insert > Table, the 12 by 4 cell, on the Title and body slide under its title; the grid's size words read: h 137,129 1326x48.4; rows drawn null px (fits false); top at 218 false; size words "12 x 4" (docs/POLISH.md 2.2 item 6, B2) |
| `tables.heads.keys-act-on-range` | tables | probe --core | broken | passed |  |
| `tables.insert.one-placement-rule` | tables | probe --core | broken | failed | Insert > Table 1 by 1, then 1 by 2, then 3 by 3 on the Title and body slide; Cmd+Z after each: 1x1: y 129 (not 218); 1x2: y 129 (not 218); 3x3: y 129 (not 218) (docs/POLISH.md 2.2 item 8, B2) |
| `tables.edge.stays-inside-sheet` | tables | probe --core | broken | passed |  |
| `tables.range.align-cells-only` | tables | probe --core | broken | passed |  |
| `tables.context.object-menu-on-frame` | tables | probe --core | broken | passed |  |
| `tables.polish.seams-snap-grid` | tables | probe --core | broken | failed | a 3 by 3 table selected; the pointer at the second column seam's middle, its tooltip read, a 12 step drag right; the se handle dragged 160 px right; Insert > Table with the pointer moved 30 px left inside the grid's first column: seam handle.pt-seams.column.1: tooltip "Column seam 2Drag to resize th |
| `text.bold.toolbar-marks-run` | text | probe --core | broken | failed | "Acme" selected in a text box; the tail's Bold; Cmd+Z; Format > Text > Bold; then the box selected by one click and Bold: tail: selected "Acme", mark true at 700, rest 400, stored "*Acme* renews in Q3"; menu: mark true at 700, rest 400, stored "*Acme* renews in Q3"; whole box: weight 400, stored "*A |
| `slides.layout.blank-empty` | slides | probe --core | broken | passed |  |
| `text.paragraph.toolbar-live` | text | probe --core | broken | failed | a two line text box; a session open with the caret in line 1; Center from the tail, then 1.5, then Increase indent: Center: moved within a frame false (after 400 ms false), caret kept true; 1.5: moved within a frame false (after 400 ms false), caret kept true; Increase indent: moved within a frame t |
| `text.list.enter-tab-no-error` | text | probe --core | broken | failed | a text box reading One; Bulleted list from the tail; the session opened at the end; Enter, "Two", Tab, Enter, "Three"; Escape; Cmd+Z until the box is back: listed true; items ["One","Two","Three"] (second nested false); error over the stage none; console 0; restored by Cmd+Z true (docs/POLISH.md 2.3 |
| `text.size.run-and-typed-value` | text | probe --core | broken | passed |  |
| `text.marks.whole-block-from-menu` | text | probe --core | broken | passed |  |
| `text.tail.heading-takes-list-indent` | text | probe --core | broken | failed | the title placeholder selected by one click; Bulleted list, Increase indent and Paint format from the tail; every disabled tail button read: disabled tail buttons 3 (toolbar.redo: "Redo"; toolbar.font: "Font"; toolbar.clearFormatting: "Clear formatting"); Bulleted list: not written snackbar "Bullete |
| `text.heading.enter-keeps-session` | text | probe --core | broken | passed |  |
| `text.link.chip-on-click` | text | probe --core | broken | passed |  |
| `text.title.shrink-on-overflow` | text | probe --core | broken | failed | the title selected and twelve words typed over it; Escape: font 44 -> 44 px over 1 lines; ring height 110 -> 110 sheet px (kept true); text inside the sheet true (k 0.7) (docs/POLISH.md 2.3 item 21, B1) |
| `text.link.popover-anchored` | text | probe --core | broken | passed |  |
| `text.link.detection-setting` | text | probe --core | broken | failed | Tools > Preferences > Link detection off, "See www.example.com now" typed into an empty box; on, typed again into another: error: locator.boundingBox: Timeout 30000ms exceeded. |
| `text.tail.size-reads-heading` | text | probe --core | broken | failed | a title session open; the size field read; a subtitle session; the field read: title field "44"; subtitle field "26" (docs/POLISH.md 2.3 item 22, B1) |
| `text.polish.highlight-console` | text | probe --core | broken | passed |  |
| `lines.hit.stroke-only` | lines | probe --core | broken | passed |  |
| `shapes.geometry.cloud-callout-closed` | shapes | probe --core | broken | passed |  |
| `charts.grid.every-series-in-view` | charts | probe --core | broken | passed |  |
| `chrome.format-options.fields-by-kind` | chrome | probe --core | broken | passed |  |
| `lines.move.detaches` | lines | probe --core | broken | passed |  |
| `lines.select.handles-no-ring` | lines | probe --core | broken | passed |  |
| `arrange.select.no-browser-highlight` | arrange | probe --core | broken | passed |  |
| `diagrams.label.double-click-selects-word` | diagrams | probe --core | broken | failed | Insert > Diagram > Process; a double click on "Step 2" of the diagram, " plus" typed; a text box double clicked at a point, typed: double click selected ""; the label reads "Step  plus2"; the text box after a double click on "caret" and "X" typed reads "Keep the Xcaret here" (docs/POLISH.md 2.4 item |
| `lines.connector.perpendicular-at-sites` | lines | probe --core | broken | failed | A above B; a curved connector from A's bottom site to B's top site; an elbow the same; A rotated 90 degrees: curved: leaves 1.1 and arrives 1.1 degrees from vertical; elbow: leaves 0 and arrives 0 degrees from vertical; elbow after A's rotation (rotated): arrives 90 degrees from vertical (docs/POLIS |
| `wordart.bar.closes` | wordart | probe --core | broken | passed |  |
| `wordart.polish.chip-weight-arming` | wordart | probe --core | broken | failed | Insert > Word art with "Big words" typed and Enter; the chip and the tail's B read; B pressed once; Insert > Line > Elbow connector armed: chip "Word art"; B pressed at insert false; weight 400 -> 400 after one press (bolder false); ring before arming drawn, after arming the elbow tool ring still dr |
| `images.panel.seller-words` | images | probe --core | broken | passed |  |
| `images.panel.drop-shadow` | images | probe --core | not driven | passed |  |
| `images.mask.picker-fits-panel` | images | probe --core | broken | passed |  |
| `images.caption.grows-box` | images | probe --core | broken | not driven | not on this build: format.image.addCaption (docs/PRODUCT.md 7.1, B4); the picture's menu lists edit.cut, edit.copy, edit.paste, edit.delete, edit.duplicate, arrange.order, arrange.rotate, arrange.centerOnPage, arrange.align, format.image.replaceImage, format.image.cropImage, format.image.maskImage,  |
| `images.border.color-draws-at-once` | images | probe --core | broken | passed |  |
| `images.alt.focused-empty` | images | probe --core | broken | passed |  |
| `images.crop.dims-outside` | images | probe --core | broken | passed |  |
| `chrome.plate.fits-viewport` | chrome | probe --core | broken | passed |  |
| `formatting.spacing.table-cells` | formatting | probe --core | broken | passed |  |
| `help.check-slides.plain-sentence` | help | probe --core | broken | failed | an empty 3 by 3 table on a slide of its own; Tools > Check slides: 4 findings; about empty cells 2 ("The table has 9 empty cells; type into them or remove the rows."); parenthesis or SPEC false (docs/POLISH.md 2.6 item 55, B1) |
| `slides.background.picture-grid` | slides | probe --core | broken | passed |  |
| `menus.rows.icon-on-every-row` | chrome | probe --core | broken | failed | every row of the nine menus with their submenus, the card's, the sheet's, the text box's, the picture's, the shape's and the table cell's right click menus, the show's options and the /decks card menu read: 299 rows read; without a glyph 1 (show options: present.options.more) (docs/POLISH.md 2.6 ite |
| `chrome.snackbar.refusal-sentence` | chrome | probe --core | broken | passed |  |
| `chrome.handles.tooltip-words` | chrome | probe --core | broken | passed |  |
| `chrome.tooltips.only-on-hover` | chrome | probe --core | broken | passed |  |
| `chrome.chip.above-ring` | chrome | probe --core | broken | failed | a 120 px picture and a 60 px picture selected in turn: pc-small: chip 1130,519.5 50.2x18, over move; pc-small-2: chip 1242.8,505.4 50.2x18, over move (docs/POLISH.md 2.6 item 62, B1's Overlay.tsx by B4's request) |
| `chrome.dialog.no-loading-jump` | chrome | probe --core | broken | passed |  |
| `chrome.dialog.focus-return-and-trap` | chrome | probe --core | broken | passed |  |
| `comments.insert.needs-selection` | comments | probe --core | broken | failed | nothing selected: the Insert menu read; the rectangle selected: Insert > Comment: Insert > Comment with nothing selected enabled; card 610.3,257.7 300x109.4 2/-110.8 px from the ring (docs/POLISH.md 2.6 item 66, the integrator's model.ts 3398 with B5's CommentCard.tsx) |
| `chrome.context.escape-closes-submenu` | chrome | probe --core | broken | passed |  |
| `formatting.border-weight.menu-opens` | formatting | probe --core | broken | passed |  |
| `chrome.toolbar.select-glyph` | chrome | probe --core | broken | passed |  |
| `chrome.words.one-spelling` | chrome | probe --core | broken | passed |  |
| `chrome.menus.structure-sweep` | chrome | probe --core | broken | passed |  |
| `slides.filmstrip.follows-every-move` | slides | probe --core | broken | passed |  |

## Not driven rows, by id and reason

- `slides.notes.type`: setup failed: trim the deck to 4 slides
- `slides.notes.per-slide`: setup failed: trim the deck to 4 slides
- `slides.notes.resize-handle`: setup failed: trim the deck to 4 slides
- `slides.notes.reload`: setup failed: trim the deck to 4 slides
- `slides.counter.footer-and-cards`: setup failed: trim the deck to 4 slides
- `slides.hash.click-and-reload`: setup failed: trim the deck to 4 slides
- `slides.notes.view-menu-toggle`: setup failed: trim the deck to 4 slides
- `slides.context.empty-canvas`: setup failed: trim the deck to 4 slides
- `text.clipboard.paste-without-formatting`: manual: headless Chromium does not synthesize Cmd+Shift+V as a paste; the step is docs/gslides-parity/focus/manual-checklist.md
- `slides.numbers.apply`: setup failed: trim the deck to 4 slides
- `slides.layout.title-and-body-single`: setup failed: trim the deck to 4 slides
- `slides.layout.subtitle-prompt`: setup failed: trim the deck to 4 slides
- `slides.layout.new-slide-inherits`: setup failed: trim the deck to 4 slides
- `slides.layout.tile-sentences`: setup failed: trim the deck to 4 slides
- `slides.import.none-preselected`: setup failed: trim the deck to 4 slides
- `images.caption.add`: not on this build: format.image.addCaption (docs/PRODUCT.md 7.1, B2); the picture's menu lists edit.cut, edit.copy, edit.paste, edit.delete, edit.duplicate, arrange.order, arrange.rotate, arrange.centerOnPage, arrange.align, format.image.replaceImage, format.image.cropImage, format.image.maskImage, 
- `tables.bar.row-column-buttons`: not on this build: bar.table (docs/PRODUCT.md 7.1, B3); no bar under the selected table (P1, FEATURES.md 2.3 item 3)
- `arrange.group.tail-text-controls`: not on this build: toolbar.group.text (docs/PRODUCT.md 7.1, B3); chip "Group"; the group tail lists toolbar.fillColor, toolbar.borderColor, toolbar.borderWeight, toolbar.borderDash, toolbar.formatOptions and none of the text controls (P1, FEATURES.md 2.3 item 6)
- `images.caption.grows-box`: not on this build: format.image.addCaption (docs/PRODUCT.md 7.1, B4); the picture's menu lists edit.cut, edit.copy, edit.paste, edit.delete, edit.duplicate, arrange.order, arrange.rotate, arrange.centerOnPage, arrange.align, format.image.replaceImage, format.image.cropImage, format.image.maskImage, 

## Failed rows, by id and reason

- `decks.title.save-words`: a second edit: words All changes saved; final "All changes saved"
- `slides.layout.typed-title-round-trip`: type a title, apply Main point, then Title and body: error: page.evaluate: Execution context was destroyed, most likely because of a navigation
- `slides.layout.snackbar-counts-typed-only`: apply Title slide to an untouched slide: error: page.evaluate: TypeError: Cannot read properties of undefined (reading 'studio')
- `slides.layout.undo-typed`: Cmd+Z after a layout change on a typed slide: error: page.evaluate: TypeError: Cannot read properties of undefined (reading 'studio')
- `text.autofit.title-wraps`: type a long title into the title slide: lines 1; split words 0; overlap with the subtitle 0 px²; inside the sheet true
- `images.options.reset`: Adjustments > Reset: opacity 0.39; stored transparency true
- `versions.open-from-last-edit`: click the Last edit words in the title row: error: locator.waitFor: Timeout 8000ms exceeded.
- `versions.pick`: pick a version in the panel: no version rows in the panel
- `versions.name-current`: Name current version, type a name, Save: error: locator.boundingBox: Timeout 30000ms exceeded.
- `versions.undo-restore`: Restore an earlier version, then Cmd+Z: no Restore control in the panel
- `versions.show-changes-marks`: a heading edit and an added box after the named version; pick the older version with Show changes on; then off: picked versionHistory.448.pick (named row null); marks with Show changes on 0 (); off 0
- `assist.agent.propose-accept`: assist.propose over HTTP, assist.accept with the card, then the card with one byte changed: assist.propose answered 401 {"error":{"name":"ModelCallError","status":401,"message":"The assistant’s model answered 401","action":"assist.propose"}}
- `charts.grid.remove-visible`: the grid with the pointer away; the active row's remove control, the series swatch; a right click on a series header: remove control formatOptions.chart.category.0.remove opacity 0 with the row hovered (0 with the pointer away, item 26); series swatch 14 by 14; right click on the series header lists
- `tables.tail.size-step-ladder`: a typed 3 by 3 table; the header row selected as a range by a drag; the tail's "−" twice, then "+" until 20: range true; field 20 -> 18 -> 17 (stored size 17); back at 20; "+" aria-disabled true "Increase font size"; snackbar none (docs/POLISH.md 2.2 item 5, B1's ToolbarTail.tsx by B2's request)
- `tables.insert.box-never-shorter-than-rows`: Insert > Table, the 12 by 4 cell, on the Title and body slide under its title; the grid's size words read: h 137,129 1326x48.4; rows drawn null px (fits false); top at 218 false; size words "12 x 4" (docs/POLISH.md 2.2 item 6, B2)
- `tables.insert.one-placement-rule`: Insert > Table 1 by 1, then 1 by 2, then 3 by 3 on the Title and body slide; Cmd+Z after each: 1x1: y 129 (not 218); 1x2: y 129 (not 218); 3x3: y 129 (not 218) (docs/POLISH.md 2.2 item 8, B2)
- `tables.polish.seams-snap-grid`: a 3 by 3 table selected; the pointer at the second column seam's middle, its tooltip read, a 12 step drag right; the se handle dragged 160 px right; Insert > Table with the pointer moved 30 px left inside the grid's first column: seam handle.pt-seams.column.1: tooltip "Column seam 2Drag to resize th
- `text.bold.toolbar-marks-run`: "Acme" selected in a text box; the tail's Bold; Cmd+Z; Format > Text > Bold; then the box selected by one click and Bold: tail: selected "Acme", mark true at 700, rest 400, stored "*Acme* renews in Q3"; menu: mark true at 700, rest 400, stored "*Acme* renews in Q3"; whole box: weight 400, stored "*A
- `text.paragraph.toolbar-live`: a two line text box; a session open with the caret in line 1; Center from the tail, then 1.5, then Increase indent: Center: moved within a frame false (after 400 ms false), caret kept true; 1.5: moved within a frame false (after 400 ms false), caret kept true; Increase indent: moved within a frame t
- `text.list.enter-tab-no-error`: a text box reading One; Bulleted list from the tail; the session opened at the end; Enter, "Two", Tab, Enter, "Three"; Escape; Cmd+Z until the box is back: listed true; items ["One","Two","Three"] (second nested false); error over the stage none; console 0; restored by Cmd+Z true (docs/POLISH.md 2.3
- `text.tail.heading-takes-list-indent`: the title placeholder selected by one click; Bulleted list, Increase indent and Paint format from the tail; every disabled tail button read: disabled tail buttons 3 (toolbar.redo: "Redo"; toolbar.font: "Font"; toolbar.clearFormatting: "Clear formatting"); Bulleted list: not written snackbar "Bullete
- `text.title.shrink-on-overflow`: the title selected and twelve words typed over it; Escape: font 44 -> 44 px over 1 lines; ring height 110 -> 110 sheet px (kept true); text inside the sheet true (k 0.7) (docs/POLISH.md 2.3 item 21, B1)
- `text.link.detection-setting`: Tools > Preferences > Link detection off, "See www.example.com now" typed into an empty box; on, typed again into another: error: locator.boundingBox: Timeout 30000ms exceeded.
- `text.tail.size-reads-heading`: a title session open; the size field read; a subtitle session; the field read: title field "44"; subtitle field "26" (docs/POLISH.md 2.3 item 22, B1)
- `diagrams.label.double-click-selects-word`: Insert > Diagram > Process; a double click on "Step 2" of the diagram, " plus" typed; a text box double clicked at a point, typed: double click selected ""; the label reads "Step  plus2"; the text box after a double click on "caret" and "X" typed reads "Keep the Xcaret here" (docs/POLISH.md 2.4 item
- `lines.connector.perpendicular-at-sites`: A above B; a curved connector from A's bottom site to B's top site; an elbow the same; A rotated 90 degrees: curved: leaves 1.1 and arrives 1.1 degrees from vertical; elbow: leaves 0 and arrives 0 degrees from vertical; elbow after A's rotation (rotated): arrives 90 degrees from vertical (docs/POLIS
- `wordart.polish.chip-weight-arming`: Insert > Word art with "Big words" typed and Enter; the chip and the tail's B read; B pressed once; Insert > Line > Elbow connector armed: chip "Word art"; B pressed at insert false; weight 400 -> 400 after one press (bolder false); ring before arming drawn, after arming the elbow tool ring still dr
- `help.check-slides.plain-sentence`: an empty 3 by 3 table on a slide of its own; Tools > Check slides: 4 findings; about empty cells 2 ("The table has 9 empty cells; type into them or remove the rows."); parenthesis or SPEC false (docs/POLISH.md 2.6 item 55, B1)
- `menus.rows.icon-on-every-row`: every row of the nine menus with their submenus, the card's, the sheet's, the text box's, the picture's, the shape's and the table cell's right click menus, the show's options and the /decks card menu read: 299 rows read; without a glyph 1 (show options: present.options.more) (docs/POLISH.md 2.6 ite
- `chrome.chip.above-ring`: a 120 px picture and a 60 px picture selected in turn: pc-small: chip 1130,519.5 50.2x18, over move; pc-small-2: chip 1242.8,505.4 50.2x18, over move (docs/POLISH.md 2.6 item 62, B1's Overlay.tsx by B4's request)
- `comments.insert.needs-selection`: nothing selected: the Insert menu read; the rectangle selected: Insert > Comment: Insert > Comment with nothing selected enabled; card 610.3,257.7 300x109.4 2/-110.8 px from the ring (docs/POLISH.md 2.6 item 66, the integrator's model.ts 3398 with B5's CommentCard.tsx)

