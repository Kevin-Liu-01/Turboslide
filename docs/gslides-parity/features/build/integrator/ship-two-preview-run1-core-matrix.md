# Core gate matrix

Base https://turboslide-2lbzoh8o7-kl01s-projects.vercel.app, started 2026-09-24T22:19:41.531Z, 9184 s. 814 rows judged: 755 passed, 40 failed, 19 not driven (1 of them manual, the checklist's: text.clipboard.paste-without-formatting), 0 no step. Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): export.download.large-deck-pdf passed (PDF: GT brand deck.pdf, 85 slides in 9.7 s, 0.11 s per slide; PDF: GT brand deck.pdf, 85 slides in 9.7 s, 0.11 s per slide); export.download.large-deck-pptx passed (Editable text PowerPoint with Embed fonts: GT brand deck (editable).pptx, 85 slides in 198.7 s, 2.34 s per slide; Editable text PowerPoint with Embed fonts: GT brand deck (editable).pptx, 85 slides in 198.7 s, 2.34 s per slide); cost.editor-idle.calls passed (function requests 8.99 a minute (ceiling 12; 27 in 3 min); the store settled 63.65 s after the state was ready (7 sync.status read(s) before the window; the first read: head 21, put 3, list 1, del 0); store simple 27 a minute (ceiling 40; 3 of the heads the probe's own sync.status reads, which the ceiling carries, b3.md R7 b); store advanced 9 a minute (ceiling 11); instances answering sync.status 2); cost.editor-hidden.calls not driven (function requests 9.66 a minute and 9 session poll(s) were read from the tab that stayed visible); cost.editor-editing.calls passed (function requests 71.28 a minute (ceiling 75; 214 in 3 min); the store settled 2.26 s after the state was ready (1 sync.status read(s) before the window); store simple 133 a minute (ceiling 140; 3 of the heads the probe's own sync.status reads, which the ceiling carries, b3.md R7 b); store advanced 70 a minute (ceiling 85); instances answering sync.status 1); cost.two-tabs-idle.calls passed (the store settled 2.90 s after the state was ready (1 sync.status read(s) before the window); store advanced 18 a minute (ceiling 30); store list 0 (ceiling 0); instances answering sync.status 2); cost.show.calls passed (function requests 0 in the window (ceiling 0); the store settled 105.14 s after the state was ready (11 sync.status read(s) before the window; the first read: head 19, put 20, list 0, del 0); store calls at the first sample 1 (head 1, get 0, put 0, list 0, del 0), of which 1 the probe's own sync.status read(s) (one deck.json head each, b3.md R7 b); the page's 0 (ceiling 0); function requests between the load and the window 0 (the settle, 105.14 s); instances answering sync.status 1); shaders.perf.editor-frame failed (longest animation frame 241.7 ms over 5 s with one shader on the stage (573 animation frames; rAF gaps; 1 canvas; renderer ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)); longest animation frame 241.7 ms over 5 s with one shader on the stage (573 animation frames; rAF gaps; 1 canvas; renderer ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver))). Cost rows over their ceiling in this run: none. Verdict failed; retries 0 configured, 0 test(s) retried; exit 1. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): inbox, brand, fonts, templates, assist, shaders; rows whose own controls a ship would keep parked: view.live-pointers.second-browser (view.livePointers.mine, view.livePointers.collaborators); decks.file.open-list-search (file.open); versions.show-changes-marks (file.versionHistory.showChanges); templates.gallery.page (home.gallery, file.new.templateGallery); templates.save.as-template (file.saveAsTemplate); templates.save.same-name-replaces (file.saveAsTemplate); templates.card.rename-and-delete (templates.card.menu); templates.default.use-for-new (panel.brand.template.useForNew); assist.notes.draft (panel.assist.starter.notes); tables.seam.row-drag (handle.table.row); tables.edge.add-row-column (handle.table.add.column, handle.table.add.row); tables.heads.select-row-column (handle.table.head.column, handle.table.head.row); tables.bar.row-column-buttons (bar.table); arrange.group.tail-text-controls (toolbar.group.text); wordart.tail.fill-outline (toolbar.wordart.outline); logos.index.refresh-fixture (insert.logo); logos.index.cached-offline (insert.logo); logos.picker.variants (dialog.logo.kind.wordmark, dialog.logo.tone.mono); logos.kit.find-a-logo (panel.brand.logo.find); shaders.insert.selected-free-rectangle (insert.shader); shaders.insert.words (insert.shader); shaders.panel.slider-live-undo (formatOptions.shader.strength); shaders.panel.preset-tiles (formatOptions.shader.preset); shaders.panel.control-sentences (formatOptions.shader); shaders.panel.kit-colours (formatOptions.shader.color); shaders.panel.one-home (formatOptions.shader); shaders.frame.auto-capture (insert.shader); shaders.frame.box-aspect (insert.shader); shaders.frame.reuse-and-prune (insert.shader); shaders.frame.one-capturer (insert.shader); shaders.perf.one-context (insert.shader); shaders.background.add-to-theme (dialog.background.shader.addToTheme); shaders.library.glyph-engines-render (dialog.shader.engine.glyph); shaders.frame.scrubber-capture (formatOptions.shader.frame.scrubber, formatOptions.shader.frame.capture); shaders.show.plays-when-on (view.playShaders, formatOptions.shader.play); shaders.show.frame-when-off (view.playShaders); rows of an unparkable feature blocking the ship: images.insert.upload-while-pending, images.background.upload-picture, versions.restore, versions.undo-restore, sync.title.concurrent-both-kept, sync.block.offline-replay-converges, sync.resend.idempotent, shaders.export.pdf-frame, shaders.export.html-frame.

| Row | Feature | Driver | Today | Result | Reason |
| --- | --- | --- | --- | --- | --- |
| `decks.home.new-presentation` | decks | core/decks.spec.ts | works | passed |  |
| `decks.home.your-presentations` | decks | core/decks.spec.ts | works | passed |  |
| `decks.root.redirect` | decks | core/decks.spec.ts | works | passed |  |
| `decks.new.draft` | decks | probe --core | works | passed |  |
| `decks.new.ground-paint` | decks | probe --core | flaky | passed |  |
| `decks.new.first-write` | decks | probe --core | works | passed |  |
| `decks.title.save-words` | decks | probe --core | works | passed |  |
| `decks.title.rename-enter` | decks | probe --core | works | passed |  |
| `decks.title.rename-escape` | decks | probe --core | works | passed |  |
| `decks.title.rename-blur` | decks | probe --core | works | passed |  |
| `decks.title.rename-empty` | decks | probe --core | works | passed |  |
| `decks.title.file-rename` | decks | probe --core | works | passed |  |
| `decks.title.tab-title-after-rename` | decks | probe --core | broken | passed |  |
| `decks.title.mark-to-list` | decks | probe --core | works | passed |  |
| `decks.edit.reload-keeps-slide` | decks | probe --core | works | passed |  |
| `decks.save.acknowledged` | decks | probe --core | flaky | passed |  |
| `decks.list.read` | decks | core/decks.spec.ts | works | passed |  |
| `decks.list.search` | decks | core/decks.spec.ts | works | passed |  |
| `decks.list.open-thumbnail` | decks | core/decks.spec.ts | works | passed |  |
| `decks.list.open-title` | decks | core/decks.spec.ts | works | passed |  |
| `decks.list.open-recent` | decks | core/decks.spec.ts | works | passed |  |
| `decks.card.menu-open-escape` | decks | core/decks.spec.ts | works | passed |  |
| `decks.card.rename-enter` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.card.rename-escape` | decks | core/decks.spec.ts | works | passed |  |
| `decks.row.rename-enter` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.card.make-a-copy` | decks | core/decks.spec.ts | flaky | passed |  |
| `decks.card.open-in-new-tab` | decks | core/decks.spec.ts | flaky | passed |  |
| `decks.card.present` | decks | core/decks.spec.ts | works | passed |  |
| `decks.card.move-to-trash-undo` | decks | core/decks.spec.ts | works | passed |  |
| `decks.list.gt-brand-deck` | decks | core/decks.spec.ts | works | passed |  |
| `decks.editor.move-to-trash` | decks | probe --core | works | passed |  |
| `decks.trash.listed-after-move` | decks | core/decks.spec.ts | flaky | passed |  |
| `decks.trash.restore` | decks | core/decks.spec.ts | works | passed |  |
| `decks.trash.lists-after-restore` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.trash.delete-forever-cancel` | decks | core/decks.spec.ts | works | passed |  |
| `decks.trash.delete-forever-button` | decks | core/decks.spec.ts | works | passed |  |
| `decks.trash.delete-forever-enter` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.nav.back-forward` | decks | core/decks.spec.ts | works | passed |  |
| `decks.access.unknown-edit` | decks | core/decks.spec.ts | works | passed |  |
| `decks.access.paint` | decks | core/decks.spec.ts | flaky | passed |  |
| `decks.access.sign-in-link` | decks | core/decks.spec.ts | works | passed |  |
| `decks.access.unknown-deck` | decks | core/decks.spec.ts | works | passed |  |
| `decks.notfound.page` | decks | core/decks.spec.ts | works | passed |  |
| `decks.file.make-a-copy` | decks | core/decks.spec.ts | not driven | passed |  |
| `decks.card.download` | decks | core/decks.spec.ts | works | passed |  |
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
| `slides.layout.typed-title-round-trip` | slides | probe --core | works | passed |  |
| `slides.layout.snackbar-counts-typed-only` | slides | probe --core | broken | passed |  |
| `slides.layout.undo-typed` | slides | probe --core | works | passed |  |
| `slides.notes.type` | slides | probe --core | works | passed |  |
| `slides.notes.per-slide` | slides | probe --core | works | passed |  |
| `slides.notes.resize-handle` | slides | probe --core | works | passed |  |
| `slides.notes.reload` | slides | probe --core | works | passed |  |
| `slides.counter.footer-and-cards` | slides | probe --core | works | passed |  |
| `slides.hash.click-and-reload` | slides | probe --core | works | passed |  |
| `slides.clipboard.copy-paste-card` | slides | core/slides.spec.ts | not driven | passed |  |
| `slides.reorder.menu-up-down-beginning` | slides | probe --core | not driven | passed |  |
| `slides.reorder.cmd-shift-up-down` | slides | probe --core | not driven | passed |  |
| `slides.notes.view-menu-toggle` | slides | probe --core | not driven | passed |  |
| `slides.context.empty-canvas` | slides | probe --core | not driven | passed |  |
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
| `text.link.present-click` | text | core/present.spec.ts | not driven | passed |  |
| `text.clear-formatting` | text | probe --core | works | passed |  |
| `text.format-menu.rows-enabled` | text | probe --core | works | passed |  |
| `text.format-menu.size-increase` | text | probe --core | works | passed |  |
| `text.format-menu.align-left` | text | probe --core | works | passed |  |
| `text.format-menu.spacing-double` | text | probe --core | works | passed |  |
| `text.format-menu.text-fitting` | text | probe --core | not driven | passed |  |
| `text.autofit.title-wraps` | text | probe --core | works | passed |  |
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
| `images.insert.first-on-new-deck` | images | core/images.spec.ts | broken | passed |  |
| `images.insert.upload` | images | core/images.spec.ts | flaky | passed |  |
| `images.insert.upload-while-pending` | images | core/images.spec.ts | broken | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m |
| `images.insert.drop` | images | core/images.spec.ts | flaky | passed |  |
| `images.insert.paste` | images | core/images.spec.ts | flaky | passed |  |
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
| `images.options.reset` | images | probe --core | works | passed |  |
| `images.reset-image.menu` | images | probe --core | works | passed |  |
| `images.replace.upload` | images | core/images.spec.ts | broken | passed |  |
| `images.background.colour` | images | probe --core | works | passed |  |
| `images.background.toolbar` | images | probe --core | works | passed |  |
| `images.background.upload-picture` | images | core/images.spec.ts | flaky | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m |
| `images.background.remove-picture` | images | core/images.spec.ts | works | passed |  |
| `images.background.reset` | images | probe --core | works | passed |  |
| `images.present.picture-and-ground` | images | probe --core | works | passed |  |
| `images.export.pdf-with-picture` | images | core/export.spec.ts | works | passed |  |
| `images.replace.drop-on-picture` | images | core/images.spec.ts | not driven | passed |  |
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
| `shapes.export.pdf` | shapes | core/export.spec.ts | not driven | passed |  |
| `shapes.export.pptx` | shapes | core/export.spec.ts | not driven | passed |  |
| `shapes.reload-and-viewer` | shapes | probe --core | not driven | passed |  |
| `shapes.context.shape` | shapes | probe --core | not driven | passed |  |
| `lines.insert.line-drag` | lines | probe --core | not driven | passed |  |
| `lines.insert.arrow-drag` | lines | probe --core | not driven | passed |  |
| `lines.end-handle` | lines | probe --core | not driven | passed |  |
| `lines.tail.colour-weight-dash-ends` | lines | probe --core | not driven | passed |  |
| `lines.context.line` | lines | probe --core | not driven | passed |  |
| `present.slideshow.button` | present | core/present.spec.ts | works | passed |  |
| `present.slideshow.cmd-enter` | present | core/present.spec.ts | works | passed |  |
| `present.keys.arrow-right` | present | core/present.spec.ts | works | passed |  |
| `present.keys.arrow-left` | present | core/present.spec.ts | works | passed |  |
| `present.keys.space` | present | core/present.spec.ts | works | passed |  |
| `present.keys.digit-enter` | present | core/present.spec.ts | works | passed |  |
| `present.keys.home` | present | core/present.spec.ts | works | passed |  |
| `present.keys.end` | present | core/present.spec.ts | works | passed |  |
| `present.click-advances` | present | core/present.spec.ts | works | passed |  |
| `present.counter` | present | core/present.spec.ts | works | passed |  |
| `present.laser` | present | core/present.spec.ts | works | passed |  |
| `present.escape` | present | core/present.spec.ts | works | passed |  |
| `present.presenter-view.arrow` | present | core/present.spec.ts | works | passed |  |
| `present.presenter-view.s-key` | present | core/present.spec.ts | works | passed |  |
| `present.notes-in-presenter` | present | core/present.spec.ts | works | passed |  |
| `present.slideshow.from-beginning` | present | core/present.spec.ts | works | passed |  |
| `present.keys.blank-black-white` | present | core/present.spec.ts | not driven | passed |  |
| `present.skipped-left-out` | present | core/present.spec.ts | not driven | passed |  |
| `share.dialog.open` | share | core/share.spec.ts | works | passed |  |
| `share.copy-view-link` | share | core/share.spec.ts | works | passed |  |
| `share.copy-edit-link` | share | core/share.spec.ts | works | passed |  |
| `share.escape` | share | core/share.spec.ts | works | passed |  |
| `share.file-menu-copy-link` | share | core/share.spec.ts | works | passed |  |
| `share.view-link-lands-viewer` | share | core/share.spec.ts | works | passed |  |
| `share.edit-link-lands-editor` | share | core/share.spec.ts | works | passed |  |
| `share.view-link-cannot-edit` | share | core/share.spec.ts | broken | passed |  |
| `share.stranger-cannot-edit` | share | core/share.spec.ts | broken | passed |  |
| `collab.edit-from-second-browser` | share | core/share.spec.ts | flaky | passed |  |
| `collab.edit-from-owner` | share | core/share.spec.ts | works | passed |  |
| `collab.slide-added-appears` | share | core/share.spec.ts | flaky | passed |  |
| `collab.presence-chips` | share | core/share.spec.ts | broken | passed |  |
| `collab.rename-reaches-second-browser` | share | core/share.spec.ts | broken | passed |  |
| `share.view-link-excludes-skipped-and-notes` | share | core/share.spec.ts | not driven | passed |  |
| `share.present-link-excludes-skipped` | share | core/share.spec.ts | not driven | passed |  |
| `share.copy-present-link` | share | core/share.spec.ts | works | passed |  |
| `share.file-menu-share-with-others` | share | probe --core | not driven | passed |  |
| `comments.on-title-placeholder` | comments | core/present.spec.ts | broken | passed |  |
| `comments.on-slide` | comments | core/present.spec.ts | works | passed |  |
| `comments.on-object` | comments | core/present.spec.ts | works | passed |  |
| `comments.reply` | comments | core/present.spec.ts | works | passed |  |
| `comments.resolve` | comments | core/present.spec.ts | flaky | passed |  |
| `comments.toolbar-and-menu-routes` | comments | core/present.spec.ts | not driven | passed |  |
| `comments.reaches-second-browser` | comments | core/share.spec.ts | not driven | passed |  |
| `versions.open-from-last-edit` | versions | probe --core | works | passed |  |
| `versions.pick` | versions | probe --core | works | passed |  |
| `versions.name-current` | versions | probe --core | works | passed |  |
| `versions.restore` | versions | core/share.spec.ts | flaky | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoContain[2m([22m[32mexpected[39m[2m) // indexOf[22m |
| `versions.undo-restore` | versions | probe --core | not driven | failed | Restore an earlier version, then Cmd+Z: restore wrote true (revision 922 -> 923) and changed the deck true (read after 1076 ms of a 35 s bound; versionHistory.852.restore; snackbar Version 923 saved; panel notice Restored the version of Sep 24, 03:55 PM; state.error none); Cmd+Z brought the current  |
| `export.download-submenu` | export | probe --core | works | passed |  |
| `export.pdf.dialog` | export | probe --core | works | passed |  |
| `export.pdf.skipped-check` | export | probe --core | works | passed |  |
| `export.pdf.close-paths` | export | probe --core | works | passed |  |
| `export.pdf.file` | export | core/export.spec.ts | works | passed |  |
| `export.pdf.include-skipped` | export | core/export.spec.ts | works | passed |  |
| `export.pdf.notes-honest` | export | core/export.spec.ts | broken | passed |  |
| `export.pptx.dialog` | export | probe --core | works | passed |  |
| `export.pptx.perfect` | export | core/export.spec.ts | works | passed |  |
| `export.pptx.editable` | export | core/export.spec.ts | works | passed |  |
| `export.pptx.notes-and-skipped` | export | core/export.spec.ts | works | passed |  |
| `export.print.preview-page` | export | probe --core | works | passed |  |
| `export.print.layout-with-notes` | export | probe --core | works | passed |  |
| `export.print.include-skipped` | export | probe --core | works | passed |  |
| `export.print.download-pdf-follows-preview` | export | core/export.spec.ts | broken | passed |  |
| `export.print.print-button` | export | probe --core | works | passed |  |
| `export.print.close-preview` | export | probe --core | works | passed |  |
| `export.print.file-menu-after-close` | export | probe --core | flaky | passed |  |
| `export.print.menu-row` | export | probe --core | works | passed |  |
| `export.print.cmd-p` | export | probe --core | works | passed |  |
| `help.help-dialog` | help | probe --core | works | passed |  |
| `help.documentation-link` | help | probe --core | broken | passed |  |
| `help.keyboard-shortcuts` | help | probe --core | works | passed |  |
| `help.search-the-menus` | help | probe --core | works | passed |  |
| `surface.menus.open-close-escape` | surface | probe --core | not driven | passed |  |
| `surface.advanced.off-by-default` | surface | core/surface.spec.ts | not driven | passed |  |
| `surface.advanced.on-shows-parked` | surface | core/surface.spec.ts | not driven | passed |  |
| `surface.advanced.remembered` | surface | core/surface.spec.ts | not driven | passed |  |
| `surface.parked-blocks-render` | surface | core/surface.spec.ts | not driven | passed |  |
| `surface.cleanup` | surface | probe --core | works | passed |  |
| `surface.parked-shortcut-unbound` | surface | core/surface.spec.ts | not driven | passed |  |
| `surface.parked-block-core-rows` | surface | core/surface.spec.ts | not driven | passed |  |
| `shapes.text.colour-toolbar` | shapes | probe --core | broken | passed |  |
| `shapes.text.enter-opens-label` | shapes | probe --core | works | passed |  |
| `shapes.borders-lines.menu` | shapes | probe --core | works | passed |  |
| `lines.connector.elbow` | lines | probe --core | works | passed |  |
| `lines.connector.curved` | lines | probe --core | works | passed |  |
| `lines.connector.re-end` | lines | probe --core | not driven | passed |  |
| `lines.insert.arrow-head` | lines | probe --core | works | passed |  |
| `lines.tail.line-start-end-menu` | lines | probe --core | not driven | passed |  |
| `lines.connector.export-pptx` | lines | core/export.spec.ts | works | passed |  |
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
| `tables.export.pdf` | tables | core/export.spec.ts | works | passed |  |
| `tables.export.pptx-editable` | tables | core/export.spec.ts | broken | passed |  |
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
| `charts.data.paste-rows` | charts | core/documents.spec.ts | not driven | passed |  |
| `charts.context` | charts | probe --core | not driven | passed |  |
| `charts.light-appearance` | charts | probe --core | not driven | passed |  |
| `charts.present` | charts | probe --core | works | passed |  |
| `charts.export.pdf` | charts | core/export.spec.ts | not driven | passed |  |
| `charts.export.pptx-native` | charts | core/export.spec.ts | works | passed |  |
| `charts.reload` | charts | probe --core | works | passed |  |
| `diagrams.panel` | diagrams | probe --core | works | passed |  |
| `diagrams.insert.group` | diagrams | probe --core | works | passed |  |
| `diagrams.select-move` | diagrams | probe --core | works | passed |  |
| `diagrams.edit-label` | diagrams | probe --core | not driven | passed |  |
| `diagrams.light-appearance` | diagrams | probe --core | not driven | passed |  |
| `diagrams.present` | diagrams | probe --core | works | passed |  |
| `diagrams.reload` | diagrams | probe --core | not driven | passed |  |
| `wordart.insert` | wordart | probe --core | works | passed |  |
| `wordart.edit` | wordart | probe --core | not driven | passed |  |
| `wordart.light-appearance` | wordart | probe --core | not driven | passed |  |
| `wordart.export.pdf` | wordart | core/export.spec.ts | works | passed |  |
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
| `chrome.split.one-box` | chrome | probe --core | broken | passed |  |
| `chrome.split.hover-no-inversion` | chrome | probe --core | broken | passed |  |
| `chrome.split.click-show` | chrome | probe --core | works | passed |  |
| `chrome.split.chevron-menu-aligned` | chrome | probe --core | broken | passed |  |
| `chrome.split.enter-chevron` | chrome | probe --core | broken | passed |  |
| `chrome.split.enter-label` | chrome | probe --core | broken | passed |  |
| `chrome.split.space-both` | chrome | probe --core | works | passed |  |
| `chrome.split.arrow-down-label` | chrome | probe --core | broken | passed |  |
| `chrome.split.tab-order` | chrome | probe --core | flaky | passed |  |
| `chrome.split.aria` | chrome | probe --core | broken | passed |  |
| `chrome.split.collapse-900` | chrome | probe --core | broken | passed |  |
| `chrome.separators.once` | chrome | probe --core | broken | passed |  |
| `chrome.separators.toolbar-dividers` | chrome | probe --core | works | passed |  |
| `chrome.cluster.gaps-heights` | chrome | probe --core | broken | passed |  |
| `chrome.comments-glyph.toggle` | chrome | probe --core | broken | passed |  |
| `view.appearance.rows` | view | probe --core | works | passed |  |
| `view.show-filmstrip` | view | probe --core | works | passed |  |
| `view.mode.rows` | view | probe --core | works | passed |  |
| `view.mode.viewing-hides-toolbar` | view | probe --core | broken | passed |  |
| `view.full-screen` | view | probe --core | works | passed |  |
| `view.hide-menus-chevron` | view | probe --core | not driven | passed |  |
| `view.live-pointers.toggles` | view | probe --core | works | passed |  |
| `view.live-pointers.second-browser` | view | core/share.spec.ts | not driven | failed | Error: the second browser's pointer is drawn on the first within 10 s |
| `view.comments.radios` | view | probe --core | works | passed |  |
| `view.comments.show-all-panel` | view | probe --core | broken | passed |  |
| `view.comments.modes-markers` | view | probe --core | not driven | passed |  |
| `decks.name.follows-heading` | decks | probe --core | broken | passed |  |
| `decks.file.template-gallery` | decks | core/decks.spec.ts | works | passed |  |
| `decks.file.open-list-search` | decks | probe --core | works | failed | File > Open; read the list; type in the search; clear it: 63 decks listed after 14434 ms, first untitled-20260924-2316; filtered by nonsense 0; cleared 63 |
| `decks.file.open-upload-bundle` | decks | core/decks.spec.ts | works | passed |  |
| `decks.file.import-slides-deck` | decks | probe --core | works | passed |  |
| `decks.file.import-slides-bundle` | decks | core/decks.spec.ts | works | passed |  |
| `decks.file.details` | decks | probe --core | works | passed |  |
| `slides.numbers.apply` | slides | probe --core | not driven | passed |  |
| `versions.show-changes-toggle` | versions | probe --core | works | passed |  |
| `versions.show-changes-marks` | versions | probe --core | not driven | failed | a heading edit and an added box after the named version; pick the older version with Show changes on; then off: picked versionHistory.923.pick (named row versionHistory.923.pick); marks with Show changes on 0 (); off 0 |
| `export.zip.bundle` | export | core/export.spec.ts | works | passed |  |
| `export.html.web-page` | export | core/export.spec.ts | flaky | passed |  |
| `export.jpg.current-slide` | export | core/export.spec.ts | broken | passed |  |
| `export.png.current-slide` | export | core/export.spec.ts | broken | passed |  |
| `help.check-slides` | help | probe --core | works | passed |  |
| `help.improve-link` | help | core/decks.spec.ts | works | passed |  |
| `inbox.bell-panel-toggle` | inbox | probe --core | broken | failed | click the bell; read the panel; click the bell again: with the switch on; panel open true (aria-pressed true); words "NotificationsMark all readNothing newNotification settings"; Mark all read true; settings link true; panel still open after the second click true (aria-pressed true) |
| `inbox.settings-persist` | inbox | probe --core | broken | failed | Tools > Notification settings, None, Save; reopen; reload: level forYou -> picked none; Save closed true; reopened forYou; after a reload forYou |
| `inbox.notification-arrives` | inbox | core/share.spec.ts | not driven | failed | Error: the first browser's bell shows a count of 1 within 10 s |
| `collab.roster.go-to-slide` | share | core/share.spec.ts | works | passed |  |
| `arrange.insert.selected-after-menu` | arrange | probe --core | broken | passed |  |
| `arrange.insert.free-rectangle` | arrange | probe --core | not driven | passed |  |
| `slides.layout.title-and-body-single` | slides | probe --core | broken | passed |  |
| `slides.layout.subtitle-prompt` | slides | probe --core | not driven | passed |  |
| `slides.layout.new-slide-inherits` | slides | probe --core | not driven | passed |  |
| `slides.layout.tile-sentences` | slides | probe --core | broken | passed |  |
| `slides.layout.plate-four-columns` | slides | core/chrome.spec.ts | broken | passed |  |
| `slides.import.none-preselected` | slides | probe --core | broken | passed |  |
| `share.dialog.one-link` | share | core/share.spec.ts | broken | passed |  |
| `share.dialog.slideshow-checkbox` | share | core/share.spec.ts | not driven | passed |  |
| `share.dialog.more-row` | share | core/chrome.spec.ts | broken | passed |  |
| `share.dialog.you-label` | share | core/share.spec.ts | broken | passed |  |
| `share.name-prompt.first-share` | share | core/share.spec.ts | not driven | passed |  |
| `share.dialog.co-edit-from-copied-link` | share | core/share.spec.ts | broken | passed |  |
| `decks.recent.drops-trashed` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.trash.editor-undo-snackbar` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.recent.this-browser-sentence` | decks | core/decks.spec.ts | not driven | passed |  |
| `decks.home.seller-lead` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.card.thumbnail-slide-1` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.card.edited-relative-time` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.card.more-glyph` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.trash.button-heights` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.trash.confirm-dialog-chrome` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.new.skeleton-one-frame` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.access.stranger-links` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.notfound.sentence-case` | decks | core/decks.spec.ts | broken | passed |  |
| `templates.gallery.page` | templates | core/decks.spec.ts | broken | failed | TimeoutError: locator.waitFor: Timeout 6000ms exceeded. |
| `templates.gallery.strip-and-link` | templates | core/decks.spec.ts | broken | passed |  |
| `templates.save.as-template` | templates | core/brand.spec.ts | not driven | failed | Error: the gallery lists Core spec template mug5kdad under Your organisation |
| `templates.save.same-name-replaces` | templates | core/brand.spec.ts | not driven | failed | Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed |
| `templates.card.rename-and-delete` | templates | core/brand.spec.ts | not driven | failed | Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed |
| `templates.default.use-for-new` | templates | core/brand.spec.ts | not driven | failed | Error: the card is marked as used for new presentations |
| `templates.deck.read-only` | templates | core/brand.spec.ts | not driven | not driven | no editor address opens the Blank template on this build (B5b) |
| `export.download.named-after-title` | export | core/export.spec.ts | broken | passed |  |
| `export.download.pdf-direct` | export | core/export.spec.ts | broken | passed |  |
| `export.download.pptx-direct` | export | core/export.spec.ts | broken | passed |  |
| `export.download.options-dialog` | export | core/export.spec.ts | not driven | passed |  |
| `export.download.progress-per-slide` | export | core/export.spec.ts | broken | passed |  |
| `export.download.mode-sentence` | export | core/export.spec.ts | not driven | passed |  |
| `export.download.large-deck-pdf` | export | core/export.spec.ts | broken | passed |  |
| `export.download.large-deck-pptx` | export | core/export.spec.ts | broken | passed |  |
| `text.link.detect-url` | text | probe --core | broken | passed |  |
| `text.link.detect-email` | text | probe --core | broken | passed |  |
| `text.select.double-click-address` | text | probe --core | broken | passed |  |
| `text.select.shift-home-line` | text | probe --core | broken | passed |  |
| `text.link.popover-apply-remove` | text | probe --core | broken | passed |  |
| `text.link.slide-target` | text | core/present.spec.ts | broken | passed |  |
| `text.format-options.padding-grid` | text | probe --core | broken | passed |  |
| `text.format-options.remembers-section` | text | probe --core | not driven | passed |  |
| `text.autofit.shrink-on-overflow` | text | probe --core | not driven | passed |  |
| `text.find-replace.count-while-typing` | text | probe --core | broken | passed |  |
| `images.insert.centred-in-body` | images | core/images.spec.ts | broken | passed |  |
| `images.insert.instant-preview` | images | core/images.spec.ts | broken | passed |  |
| `images.caption.add` | images | probe --core | not driven | passed |  |
| `images.options.picture-sections-only` | images | probe --core | broken | passed |  |
| `images.insert.menu-direct` | images | core/images.spec.ts | broken | passed |  |
| `images.upload.failure-snackbar` | images | core/images.spec.ts | not driven | passed |  |
| `images.transparency.slider` | images | probe --core | broken | passed |  |
| `images.border.drawn` | images | probe --core | broken | passed |  |
| `images.insert.by-url` | images | core/images.spec.ts | broken | passed |  |
| `formatting.alt-text.write-undo` | formatting | probe --core | works | passed |  |
| `comments.panel.empty-gesture` | comments | probe --core | broken | passed |  |
| `versions.panel.author-you` | versions | probe --core | broken | passed |  |
| `versions.field.square` | versions | probe --core | broken | passed |  |
| `help.shortcuts.no-duplicates` | help | probe --core | broken | passed |  |
| `help.shortcuts.question-key` | help | probe --core | broken | passed |  |
| `present.show.no-white-block` | present | core/present.spec.ts | broken | passed |  |
| `present.show.bar-on-entry` | present | core/present.spec.ts | broken | passed |  |
| `present.presenter.sentence-case` | present | core/present.spec.ts | broken | passed |  |
| `chrome.bottom-bar.removed` | chrome | probe --core | broken | passed |  |
| `chrome.menu.no-tooltip-with-submenu` | chrome | probe --core | broken | passed |  |
| `chrome.menu.escape-focus-stage` | chrome | probe --core | broken | passed |  |
| `chrome.presence.tooltip` | chrome | probe --core | broken | passed |  |
| `chrome.contrast.titanium-light` | chrome | probe --core | broken | passed |  |
| `chrome.disabled.token-both-appearances` | chrome | probe --core | not driven | passed |  |
| `chrome.field.boundary-3-1` | chrome | probe --core | broken | passed |  |
| `chrome.hover.ground` | chrome | probe --core | broken | passed |  |
| `chrome.floating.edge-frame` | chrome | probe --core | broken | passed |  |
| `chrome.focus.one-ring-rule` | chrome | probe --core | broken | passed |  |
| `chrome.filmstrip.one-ring` | chrome | probe --core | broken | passed |  |
| `chrome.appearance.first-visit-follows-os` | chrome | core/decks.spec.ts | broken | passed |  |
| `chrome.tooltip.none-on-focus-in-menus` | chrome | probe --core | broken | passed |  |
| `chrome.menu.plate-fits-labels` | chrome | probe --core | broken | passed |  |
| `chrome.menu.no-mnemonics-mac` | chrome | probe --core | broken | passed |  |
| `chrome.select.one-rule` | chrome | probe --core | broken | passed |  |
| `chrome.check.draws-check` | chrome | probe --core | broken | passed |  |
| `chrome.toolbar.fold-any-width` | chrome | core/chrome.spec.ts | broken | passed |  |
| `chrome.toolbar.bold-follows-selection` | chrome | probe --core | broken | passed |  |
| `brand.panel.opens` | brand | probe --core | not driven | passed |  |
| `brand.logo.replace-every-slide` | brand | core/brand.spec.ts | not driven | passed |  |
| `brand.logo.use-on-every-slide` | brand | probe --core | not driven | passed |  |
| `brand.logo.remove` | brand | probe --core | not driven | passed |  |
| `brand.colors.primary-live` | brand | probe --core | not driven | passed |  |
| `brand.colors.palette-row` | brand | probe --core | broken | passed |  |
| `brand.colors.control-ids-unique` | brand | probe --core | broken | passed |  |
| `brand.colors.collab-rerender` | brand | core/share.spec.ts | not driven | passed |  |
| `brand.colors.version-history-entry` | brand | probe --core | not driven | passed |  |
| `brand.colors.role-tooltips` | brand | probe --core | not driven | passed |  |
| `brand.background.enter-keeps-open` | brand | probe --core | broken | passed |  |
| `brand.fonts.roles` | brand | probe --core | not driven | passed |  |
| `brand.footer.text` | brand | core/export.spec.ts | not driven | passed |  |
| `brand.counter.format` | brand | probe --core | not driven | passed |  |
| `brand.frame.toggles` | brand | core/present.spec.ts | not driven | passed |  |
| `brand.appearance.default` | brand | core/decks.spec.ts | broken | passed |  |
| `brand.reset.default-kit` | brand | probe --core | not driven | passed |  |
| `brand.export.pdf-logo` | brand | core/export.spec.ts | not driven | passed |  |
| `brand.surfaces.viewer-and-show` | brand | core/share.spec.ts | not driven | passed |  |
| `brand.layout.tiles-in-kit` | brand | probe --core | broken | passed |  |
| `brand.agent.set-get` | brand | probe --core | not driven | passed |  |
| `fonts.dropdown.opens` | fonts | probe --core | not driven | passed |  |
| `fonts.dropdown.apply-selection` | fonts | probe --core | not driven | passed |  |
| `fonts.dropdown.search` | fonts | probe --core | not driven | passed |  |
| `fonts.format-menu.row` | fonts | probe --core | not driven | passed |  |
| `fonts.more-fonts.licence` | fonts | probe --core | not driven | passed |  |
| `fonts.budget.no-load-before-ready` | fonts | core/brand.spec.ts | not driven | passed |  |
| `fonts.export.editable-names-face` | fonts | core/export.spec.ts | not driven | passed |  |
| `fonts.export.pdf-face` | fonts | core/export.spec.ts | not driven | passed |  |
| `fonts.face.reload-and-show` | fonts | probe --core | not driven | passed |  |
| `fonts.agent.font-list` | fonts | probe --core | not driven | passed |  |
| `assist.entry.title-row` | assist | probe --core | not driven | passed |  |
| `assist.panel.first-line-and-cards` | assist | probe --core | not driven | passed |  |
| `assist.tailor.dialog-one-undo` | assist | probe --core | not driven | passed |  |
| `assist.tailor.agent-deck-tailor` | assist | probe --core | not driven | passed |  |
| `assist.rewrite.card-accept-undo` | assist | core/assist.spec.ts | not driven | passed |  |
| `assist.notes.draft` | assist | core/assist.spec.ts | not driven | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m |
| `assist.free-ask.fallback-sentence` | assist | core/assist.spec.ts | not driven | passed |  |
| `assist.mark.chip-and-history` | assist | core/assist.spec.ts | not driven | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m |
| `assist.outside-write.snackbar` | assist | probe --core | broken | passed |  |
| `assist.finder.terms` | assist | probe --core | broken | passed |  |
| `assist.finder.ask-row` | assist | probe --core | not driven | passed |  |
| `assist.quota.429` | assist | core/assist.spec.ts | not driven | failed | Error: every scratch deck is trashed, deleted forever and answers 404 |
| `assist.viewer.disabled` | assist | core/share.spec.ts | not driven | passed |  |
| `assist.agent.propose-accept` | assist | probe --core | not driven | passed |  |
| `sync.serial.order-and-latency` | sync | core/sync.spec.ts | works | passed |  |
| `sync.title.concurrent-both-kept` | sync | core/sync.spec.ts | broken | failed | Error: both words in both browsers in every round of three |
| `sync.title.offline-both-kept` | sync | core/sync.spec.ts | broken | passed |  |
| `sync.block.concurrent-same-offset-order` | sync | core/sync.spec.ts | broken | passed |  |
| `sync.structural.concurrent` | sync | core/sync.spec.ts | not driven | passed |  |
| `sync.block.offline-replay-converges` | sync | core/sync.spec.ts | works | failed | Error: A's resend carries the offset shifted past B's words |
| `sync.viewer.live-updates` | sync | core/sync.spec.ts | broken | passed |  |
| `sync.reload.same-document` | sync | core/sync.spec.ts | works | passed |  |
| `sync.undo.after-remote` | sync | core/sync.spec.ts | not driven | passed |  |
| `sync.resend.idempotent` | sync | core/sync.spec.ts | not driven | not driven | not on this build: the version record carries no origin (docs/SYNC.md 3.2, B3); the word landed once in both browsers |
| `sync.pull.no-listing` | sync | cost-probe | broken | passed |  |
| `cost.editor-idle.calls` | cost | cost-probe | broken | passed |  |
| `cost.editor-hidden.calls` | cost | cost-probe | broken | not driven | document.visibilityState read "visible" after a second page was brought to the front (headless Chromium reports no hidden page), so the hidden state was not reached |
| `cost.editor-editing.calls` | cost | cost-probe | broken | passed |  |
| `cost.two-tabs-idle.calls` | cost | cost-probe | works | passed |  |
| `cost.show.calls` | cost | cost-probe | broken | passed |  |
| `charts.grid.type-to-edit` | charts | probe --core | broken | passed |  |
| `charts.grid.escape-stays` | charts | probe --core | broken | passed |  |
| `tables.cell.click-places-caret` | tables | probe --core | broken | passed |  |
| `tables.cell.click-then-type` | tables | probe --core | broken | passed |  |
| `tables.range.drag-from-selected` | tables | probe --core | not driven | passed |  |
| `shapes.label.centred-default` | shapes | probe --core | broken | passed |  |
| `tables.selected.typing-appends` | tables | probe --core | broken | passed |  |
| `tables.cell.arrows-cross-cells` | tables | probe --core | not driven | passed |  |
| `tables.range.shift-arrows` | tables | probe --core | not driven | passed |  |
| `diagrams.label.double-click-opens` | diagrams | probe --core | broken | passed |  |
| `diagrams.label.tab-next` | diagrams | probe --core | not driven | passed |  |
| `charts.double-click.opens-data` | charts | probe --core | broken | passed |  |
| `charts.mark.click-selects-cell` | charts | probe --core | not driven | passed |  |
| `tables.range.bold-italic` | tables | probe --core | broken | passed |  |
| `tables.range.size-color` | tables | probe --core | not driven | passed |  |
| `diagrams.step.one-object` | diagrams | probe --core | broken | passed |  |
| `diagrams.export.step-label` | diagrams | core/export.spec.ts | not driven | passed |  |
| `charts.legend.none-from-toolbar` | charts | probe --core | broken | passed |  |
| `charts.panel.no-duplicate-controls` | charts | probe --core | broken | passed |  |
| `charts.grid.remove-visible` | charts | probe --core | broken | passed |  |
| `tables.panel.table-first` | tables | probe --core | broken | passed |  |
| `tables.seam.row-drag` | tables | probe --core | not driven | not driven | not on this build: handle.table.row (docs/PRODUCT.md 7.1, B3); the selected table shows 3 seam handle(s) (column.0, column.1, column.2) and no row seam (P1, FEATURES.md 2.3 item 1) |
| `tables.edge.add-row-column` | tables | probe --core | not driven | not driven | not on this build: handle.table.add.column (docs/PRODUCT.md 7.1, B3); no "+" on the right or the bottom edge of the selected table (P1, FEATURES.md 2.3 item 2) |
| `tables.heads.select-row-column` | tables | probe --core | not driven | not driven | not on this build: handle.table.head.column (docs/PRODUCT.md 7.1, B3); no hover band above the columns of the selected table (P1, FEATURES.md 2.3 item 2) |
| `tables.bar.row-column-buttons` | tables | probe --core | not driven | not driven | not on this build: bar.table (docs/PRODUCT.md 7.1, B3); no bar under the selected table (P1, FEATURES.md 2.3 item 3) |
| `brand.objects.kit-colours-first` | brand | probe --core | not driven | not driven | not on this build: formatOptions.chart.swatches.primary (docs/PRODUCT.md 7.1, B3); the chart's series swatches list formatOptions.chart.swatches.ink, formatOptions.chart.swatches.paper, formatOptions.chart.swatches.ink-2, formatOptions.chart.swatches.titanium, formatOptions.chart.swatches.hair, form |
| `tables.paste.tsv-makes-table` | tables | core/documents.spec.ts | broken | passed |  |
| `tables.paste.into-cell-spreads` | tables | core/documents.spec.ts | broken | passed |  |
| `arrange.group.tail-text-controls` | arrange | probe --core | not driven | not driven | not on this build: toolbar.group.text (docs/PRODUCT.md 7.1, B3); chip "Group"; the group tail lists toolbar.fillColor, toolbar.borderColor, toolbar.borderWeight, toolbar.borderDash, toolbar.formatOptions and none of the text controls (P1, FEATURES.md 2.3 item 6) |
| `tables.command.keeps-caret` | tables | probe --core | broken | passed |  |
| `wordart.resize.scales-letters` | wordart | probe --core | broken | passed |  |
| `tables.cells.prompt-hovered-only` | tables | probe --core | broken | passed |  |
| `wordart.tail.fill-outline` | wordart | probe --core | not driven | not driven | not on this build: toolbar.wordart.outline (docs/PRODUCT.md 7.1, B3); the word art's tail is the text tail with none of Fill color, Border color, Border weight, Border dash (P1, FEATURES.md 2.3 item 10); tail toolbar.font, toolbar.fontSize, toolbar.fontSize.minus, toolbar.fontSize.value, toolbar.fon |
| `fonts.inter.italic-release` | fonts | core/brand.spec.ts | broken | passed |  |
| `fonts.links.licence-v4-1` | fonts | probe --core | broken | passed |  |
| `fonts.fallback.in-stack` | fonts | probe --core | broken | passed |  |
| `fonts.display-features.inter-only` | fonts | probe --core | not driven | passed |  |
| `tables.cells.tabular-figures` | tables | probe --core | broken | passed |  |
| `formatting.numerals.tabular-row` | formatting | probe --core | not driven | passed |  |
| `fonts.catalog.geist` | fonts | probe --core | not driven | passed |  |
| `fonts.catalog.six-families` | fonts | probe --core | not driven | passed |  |
| `fonts.picker.specimen-rows` | fonts | core/brand.spec.ts | not driven | not driven | not on this build: the specimen rows of the Font dropdown (docs/FEATURES.md 3.5, P1, B1 with B2) |
| `fonts.picker.recent-group` | fonts | core/brand.spec.ts | not driven | failed | [31mTest timeout of 180000ms exceeded.[39m |
| `fonts.picker.search-category` | fonts | probe --core | not driven | passed |  |
| `fonts.preload.italic-on-edit-only` | fonts | core/brand.spec.ts | not driven | passed |  |
| `fonts.table.takes-family` | fonts | probe --core | not driven | not driven | not on this build: toolbar.font (docs/PRODUCT.md 7.1, B1); the Font control on a selected table is drawn disabled ("Inter"); takesFamily is P1 (FEATURES.md 3.5) |
| `logos.insert.row` | logos | probe --core | not driven | passed |  |
| `logos.picker.search` | logos | probe --core | not driven | passed |  |
| `logos.picker.paper-and-ink` | logos | probe --core | not driven | passed |  |
| `logos.picker.your-brand` | logos | probe --core | not driven | passed |  |
| `logos.picker.empty-state` | logos | probe --core | not driven | passed |  |
| `logos.picker.recents` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.picker.licence-words` | logos | probe --core | not driven | passed |  |
| `logos.picker.chrome-1280` | logos | core/chrome.spec.ts | not driven | passed |  |
| `logos.insert.one-click-asset` | logos | probe --core | not driven | passed |  |
| `logos.insert.logo-size` | logos | probe --core | not driven | passed |  |
| `logos.insert.mono-tint` | logos | probe --core | not driven | passed |  |
| `logos.insert.every-slide` | logos | probe --core | not driven | passed |  |
| `logos.tailor.find-customer-logo` | logos | probe --core | not driven | passed |  |
| `logos.replace-image.row` | logos | probe --core | not driven | passed |  |
| `logos.route.mark-headers` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.index.refresh-dry-run` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.index.refresh-fixture` | logos | core/logos.spec.ts | not driven | failed | Error: a refresh after the fixture dropped the slug reports it dropped |
| `logos.index.cached-offline` | logos | core/logos.spec.ts | not driven | not driven | not driven: the index reads fixture, not the outage (TURBOSLIDE_LOGO_UPSTREAM=down on a preview); the unit test apps/studio/src/server/logos.test.ts covers the cache during an outage (docs/FEATURES.md 7.3) |
| `logos.cache.open-licence-only` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.export.pdf-pptx-crisp` | export | core/export.spec.ts | not driven | passed |  |
| `logos.agent.search-insert` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.picker.variants` | logos | probe --core | not driven | not driven | not on this build: dialog.logo.kind.wordmark (docs/PRODUCT.md 7.1, B1); no Symbol, Wordmark, Color or Mono control in the dialog head (P1, FEATURES.md 4.11; the appearance rule chooses) |
| `logos.kit.find-a-logo` | logos | probe --core | not driven | not driven | not on this build: panel.brand.logo.find (docs/PRODUCT.md 7.1, B6); no Find a logo beside Replace in the Brand kit panel's Logo section (P1, FEATURES.md 4.5) |
| `logos.intake.svg-sentence` | images | core/images.spec.ts | broken | passed |  |
| `logos.intake.url-sentence` | images | probe --core | broken | passed |  |
| `shaders.insert.gallery-thumbnails` | shaders | probe --core | not driven | passed |  |
| `shaders.insert.selected-free-rectangle` | shaders | probe --core | broken | failed | Insert > Shader; click Liquid metal on the Title slide: Liquid metal inserted material at 646,129 480x272 (paper:liquid-metal, preset diamond); move handle true; resize handles 8; rotate true; ring true; chip "Shader"; session false; caret false; overlaps no text box of 3; kind title -> content |
| `shaders.insert.words` | shaders | probe --core | broken | failed | read the Insert row, the chip, the section title and the alt; the sheet, the viewer and the show for a paper: id or "not captured": Insert row "Shader"; chip "Shader"; section "Shader"; alt "The liquid metal shader"; sheet clean (0 label elements); show clean; viewer unread: Error: page.evaluate: Ta |
| `shaders.panel.section-groups` | shaders | core/chrome.spec.ts | broken | passed |  |
| `shaders.panel.slider-live-undo` | shaders | probe --core | not driven | failed | select the shader; drag Amplitude with the mount at rest (Strength maps to no uniform of liquid metal, build/integrator.md); release; Cmd+Z: mount at rest 0.00 percent moving; during the drag the value read 3.2 with 0.0 percent of pixels changed and revision 1014 (1014 before); release: revision 101 |
| `shaders.panel.preset-tiles` | shaders | probe --core | broken | failed | read the Preset row's tiles; click a tile that is not pressed: 10 tiles ("Paper on ink", "Ink on paper", "Primary", "Accent", "Captions", "Hints", "Diamond" pressed, "Sphere", "Chrome", "Noir") against 10 presets of paper:liquid-metal; labels not in sentence case: none; click on formatOptions.shader |
| `shaders.panel.control-sentences` | shaders | probe --core | not driven | failed | hover each slider of the Shader section and read its tooltip: 11 of 11 controls drawn, 8 with the sentence; strength: "Strength"; detail: "Detail"; frequency: the sentence; amplitude: the sentence; density: the sentence; brightness: the sentence; grain: "Grain"; rotation: the sentence; centerX: the  |
| `shaders.panel.kit-colours` | shaders | probe --core | not driven | failed | read the Colors row's swatches; brand.set /colors/<appearance>/primary '#0b3d91'; read the shader and its frame: swatches text, background, caption, hint, primary, accent, custom (6 of the six roles); brand.set /colors/dark/primary ok; the canvas's mean colour moved 0.0; frame frame-4de0ed899c6bb6f2 |
| `shaders.panel.one-home` | shaders | probe --core | broken | failed | Tools > Advanced tools; Tools > Pictures and materials with the shader selected; the Background dialog's options link: Pictures and materials sections Pictures and materials, Pictures1 (with the switch on); the Background dialog's link absent (ground not placed by the place row) |
| `shaders.frame.auto-capture` | shaders | core/shaders.spec.ts | broken | failed | Error: the asset id is frame-<first 16 hex of frameKey> (5.5) |
| `shaders.frame.box-aspect` | shaders | core/shaders.spec.ts | not driven | failed | Error: within 48 per channel |
| `shaders.frame.reuse-and-prune` | shaders | core/shaders.spec.ts | not driven | failed | Error: one frame asset for the block |
| `shaders.frame.one-capturer` | shaders | core/shaders.spec.ts | not driven | failed | Error: one frame asset for the block |
| `shaders.background.place-answers` | shaders | probe --core | broken | passed |  |
| `shaders.export.pdf-frame` | export | core/export.spec.ts | broken | failed | Error: the pixels sampled |
| `shaders.export.pptx-frame` | export | core/export.spec.ts | broken | passed |  |
| `shaders.export.html-frame` | export | core/export.spec.ts | broken | failed | Error: the frame's pixels are the file's own (a data URI) |
| `shaders.export.missing-frame-row` | export | core/export.spec.ts | not driven | passed |  |
| `shaders.perf.one-context` | shaders | probe --core | not driven | failed | a second shader block placed through the window API; select each in turn and count the canvases: with nothing selected 1 canvas on the stage (1 on the page); first selected: 2 on the stage, 2 on the page; second selected: 1 on the stage after 1295 ms, the second's root 1 canvas, the first's root 0 c |
| `shaders.perf.hidden-pauses` | shaders | core/shaders.spec.ts | not driven | passed |  |
| `shaders.perf.editor-frame` | shaders | core/shaders.spec.ts | not driven | failed | Error: under 150 ms |
| `shaders.agent.list-insert-set-render` | shaders | core/shaders.spec.ts | not driven | failed | Error: shader.render answers |
| `shaders.background.add-to-theme` | shaders | probe --core | not driven | not driven | not on this build: dialog.background.shader.addToTheme (docs/PRODUCT.md 7.1, B1 (dialogs/Background.tsx)); no Add to theme row beside the Shader row (P1, FEATURES.md 5.2 item 1) |
| `shaders.library.glyph-engines-render` | shaders | core/shaders.spec.ts | not driven | not driven | not on this build: dialog.shader.engine.glyph (docs/FEATURES.md 5.2 item 2, B5, P1); the catalog lists none of proto:studio-field, glyph:mesh-gradient, glyph:dither-gradient |
| `shaders.frame.scrubber-capture` | shaders | probe --core | not driven | not driven | not on this build: formatOptions.shader.frame.scrubber (docs/PRODUCT.md 7.1, B5 (inspector/shader.tsx)); no Frame scrubber in the Shader section (P1, FEATURES.md 5.2 item 3) |
| `shaders.view.play-setting` | view | probe --core | not driven | passed |  |
| `shaders.show.plays-when-on` | shaders | core/shaders.spec.ts | broken | failed | Error: one canvas in the show |
| `shaders.show.frame-when-off` | shaders | core/shaders.spec.ts | not driven | failed | Error: the frame is shown |
| `shaders.insert.gallery-hover-live` | shaders | probe --core | not driven | passed |  |

## Not driven rows, by id and reason

- `text.clipboard.paste-without-formatting`: manual: headless Chromium does not synthesize Cmd+Shift+V as a paste; the step is docs/gslides-parity/focus/manual-checklist.md
- `templates.deck.read-only`: no editor address opens the Blank template on this build (B5b)
- `sync.resend.idempotent`: not on this build: the version record carries no origin (docs/SYNC.md 3.2, B3); the word landed once in both browsers
- `cost.editor-hidden.calls`: document.visibilityState read "visible" after a second page was brought to the front (headless Chromium reports no hidden page), so the hidden state was not reached
- `tables.seam.row-drag`: not on this build: handle.table.row (docs/PRODUCT.md 7.1, B3); the selected table shows 3 seam handle(s) (column.0, column.1, column.2) and no row seam (P1, FEATURES.md 2.3 item 1)
- `tables.edge.add-row-column`: not on this build: handle.table.add.column (docs/PRODUCT.md 7.1, B3); no "+" on the right or the bottom edge of the selected table (P1, FEATURES.md 2.3 item 2)
- `tables.heads.select-row-column`: not on this build: handle.table.head.column (docs/PRODUCT.md 7.1, B3); no hover band above the columns of the selected table (P1, FEATURES.md 2.3 item 2)
- `tables.bar.row-column-buttons`: not on this build: bar.table (docs/PRODUCT.md 7.1, B3); no bar under the selected table (P1, FEATURES.md 2.3 item 3)
- `brand.objects.kit-colours-first`: not on this build: formatOptions.chart.swatches.primary (docs/PRODUCT.md 7.1, B3); the chart's series swatches list formatOptions.chart.swatches.ink, formatOptions.chart.swatches.paper, formatOptions.chart.swatches.ink-2, formatOptions.chart.swatches.titanium, formatOptions.chart.swatches.hair, form
- `arrange.group.tail-text-controls`: not on this build: toolbar.group.text (docs/PRODUCT.md 7.1, B3); chip "Group"; the group tail lists toolbar.fillColor, toolbar.borderColor, toolbar.borderWeight, toolbar.borderDash, toolbar.formatOptions and none of the text controls (P1, FEATURES.md 2.3 item 6)
- `wordart.tail.fill-outline`: not on this build: toolbar.wordart.outline (docs/PRODUCT.md 7.1, B3); the word art's tail is the text tail with none of Fill color, Border color, Border weight, Border dash (P1, FEATURES.md 2.3 item 10); tail toolbar.font, toolbar.fontSize, toolbar.fontSize.minus, toolbar.fontSize.value, toolbar.fon
- `fonts.picker.specimen-rows`: not on this build: the specimen rows of the Font dropdown (docs/FEATURES.md 3.5, P1, B1 with B2)
- `fonts.table.takes-family`: not on this build: toolbar.font (docs/PRODUCT.md 7.1, B1); the Font control on a selected table is drawn disabled ("Inter"); takesFamily is P1 (FEATURES.md 3.5)
- `logos.index.cached-offline`: not driven: the index reads fixture, not the outage (TURBOSLIDE_LOGO_UPSTREAM=down on a preview); the unit test apps/studio/src/server/logos.test.ts covers the cache during an outage (docs/FEATURES.md 7.3)
- `logos.picker.variants`: not on this build: dialog.logo.kind.wordmark (docs/PRODUCT.md 7.1, B1); no Symbol, Wordmark, Color or Mono control in the dialog head (P1, FEATURES.md 4.11; the appearance rule chooses)
- `logos.kit.find-a-logo`: not on this build: panel.brand.logo.find (docs/PRODUCT.md 7.1, B6); no Find a logo beside Replace in the Brand kit panel's Logo section (P1, FEATURES.md 4.5)
- `shaders.background.add-to-theme`: not on this build: dialog.background.shader.addToTheme (docs/PRODUCT.md 7.1, B1 (dialogs/Background.tsx)); no Add to theme row beside the Shader row (P1, FEATURES.md 5.2 item 1)
- `shaders.library.glyph-engines-render`: not on this build: dialog.shader.engine.glyph (docs/FEATURES.md 5.2 item 2, B5, P1); the catalog lists none of proto:studio-field, glyph:mesh-gradient, glyph:dither-gradient
- `shaders.frame.scrubber-capture`: not on this build: formatOptions.shader.frame.scrubber (docs/PRODUCT.md 7.1, B5 (inspector/shader.tsx)); no Frame scrubber in the Shader section (P1, FEATURES.md 5.2 item 3)

## Failed rows, by id and reason

- `images.insert.upload-while-pending`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m
- `images.background.upload-picture`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m
- `versions.restore`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoContain[2m([22m[32mexpected[39m[2m) // indexOf[22m
- `versions.undo-restore`: Restore an earlier version, then Cmd+Z: restore wrote true (revision 922 -> 923) and changed the deck true (read after 1076 ms of a 35 s bound; versionHistory.852.restore; snackbar Version 923 saved; panel notice Restored the version of Sep 24, 03:55 PM; state.error none); Cmd+Z brought the current 
- `view.live-pointers.second-browser`: Error: the second browser's pointer is drawn on the first within 10 s
- `decks.file.open-list-search`: File > Open; read the list; type in the search; clear it: 63 decks listed after 14434 ms, first untitled-20260924-2316; filtered by nonsense 0; cleared 63
- `versions.show-changes-marks`: a heading edit and an added box after the named version; pick the older version with Show changes on; then off: picked versionHistory.923.pick (named row versionHistory.923.pick); marks with Show changes on 0 (); off 0
- `inbox.bell-panel-toggle`: click the bell; read the panel; click the bell again: with the switch on; panel open true (aria-pressed true); words "NotificationsMark all readNothing newNotification settings"; Mark all read true; settings link true; panel still open after the second click true (aria-pressed true)
- `inbox.settings-persist`: Tools > Notification settings, None, Save; reopen; reload: level forYou -> picked none; Save closed true; reopened forYou; after a reload forYou
- `inbox.notification-arrives`: Error: the first browser's bell shows a count of 1 within 10 s
- `templates.gallery.page`: TimeoutError: locator.waitFor: Timeout 6000ms exceeded.
- `templates.save.as-template`: Error: the gallery lists Core spec template mug5kdad under Your organisation
- `templates.save.same-name-replaces`: Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed
- `templates.card.rename-and-delete`: Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed
- `templates.default.use-for-new`: Error: the card is marked as used for new presentations
- `assist.notes.draft`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m
- `assist.mark.chip-and-history`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m
- `assist.quota.429`: Error: every scratch deck is trashed, deleted forever and answers 404
- `sync.title.concurrent-both-kept`: Error: both words in both browsers in every round of three
- `sync.block.offline-replay-converges`: Error: A's resend carries the offset shifted past B's words
- `fonts.picker.recent-group`: [31mTest timeout of 180000ms exceeded.[39m
- `logos.index.refresh-fixture`: Error: a refresh after the fixture dropped the slug reports it dropped
- `shaders.insert.selected-free-rectangle`: Insert > Shader; click Liquid metal on the Title slide: Liquid metal inserted material at 646,129 480x272 (paper:liquid-metal, preset diamond); move handle true; resize handles 8; rotate true; ring true; chip "Shader"; session false; caret false; overlaps no text box of 3; kind title -> content
- `shaders.insert.words`: read the Insert row, the chip, the section title and the alt; the sheet, the viewer and the show for a paper: id or "not captured": Insert row "Shader"; chip "Shader"; section "Shader"; alt "The liquid metal shader"; sheet clean (0 label elements); show clean; viewer unread: Error: page.evaluate: Ta
- `shaders.panel.slider-live-undo`: select the shader; drag Amplitude with the mount at rest (Strength maps to no uniform of liquid metal, build/integrator.md); release; Cmd+Z: mount at rest 0.00 percent moving; during the drag the value read 3.2 with 0.0 percent of pixels changed and revision 1014 (1014 before); release: revision 101
- `shaders.panel.preset-tiles`: read the Preset row's tiles; click a tile that is not pressed: 10 tiles ("Paper on ink", "Ink on paper", "Primary", "Accent", "Captions", "Hints", "Diamond" pressed, "Sphere", "Chrome", "Noir") against 10 presets of paper:liquid-metal; labels not in sentence case: none; click on formatOptions.shader
- `shaders.panel.control-sentences`: hover each slider of the Shader section and read its tooltip: 11 of 11 controls drawn, 8 with the sentence; strength: "Strength"; detail: "Detail"; frequency: the sentence; amplitude: the sentence; density: the sentence; brightness: the sentence; grain: "Grain"; rotation: the sentence; centerX: the 
- `shaders.panel.kit-colours`: read the Colors row's swatches; brand.set /colors/<appearance>/primary '#0b3d91'; read the shader and its frame: swatches text, background, caption, hint, primary, accent, custom (6 of the six roles); brand.set /colors/dark/primary ok; the canvas's mean colour moved 0.0; frame frame-4de0ed899c6bb6f2
- `shaders.panel.one-home`: Tools > Advanced tools; Tools > Pictures and materials with the shader selected; the Background dialog's options link: Pictures and materials sections Pictures and materials, Pictures1 (with the switch on); the Background dialog's link absent (ground not placed by the place row)
- `shaders.frame.auto-capture`: Error: the asset id is frame-<first 16 hex of frameKey> (5.5)
- `shaders.frame.box-aspect`: Error: within 48 per channel
- `shaders.frame.reuse-and-prune`: Error: one frame asset for the block
- `shaders.frame.one-capturer`: Error: one frame asset for the block
- `shaders.export.pdf-frame`: Error: the pixels sampled
- `shaders.export.html-frame`: Error: the frame's pixels are the file's own (a data URI)
- `shaders.perf.one-context`: a second shader block placed through the window API; select each in turn and count the canvases: with nothing selected 1 canvas on the stage (1 on the page); first selected: 2 on the stage, 2 on the page; second selected: 1 on the stage after 1295 ms, the second's root 1 canvas, the first's root 0 c
- `shaders.perf.editor-frame`: Error: under 150 ms
- `shaders.agent.list-insert-set-render`: Error: shader.render answers
- `shaders.show.plays-when-on`: Error: one canvas in the show
- `shaders.show.frame-when-off`: Error: the frame is shown

## Measurement rows, by id (PRODUCT.md 8.2; the cost rows of SYNC.md 6.1)

- `export.download.large-deck-pdf`: passed; recorded PDF: GT brand deck.pdf, 85 slides in 9.7 s, 0.11 s per slide; PDF: GT brand deck.pdf, 85 slides in 9.7 s, 0.11 s per slide
- `export.download.large-deck-pptx`: passed; recorded Editable text PowerPoint with Embed fonts: GT brand deck (editable).pptx, 85 slides in 198.7 s, 2.34 s per slide; Editable text PowerPoint with Embed fonts: GT brand deck (editable).pptx, 85 slides in 198.7 s, 2.34 s per slide
- `cost.editor-idle.calls`: passed; recorded function requests 8.99 a minute (ceiling 12; 27 in 3 min); the store settled 63.65 s after the state was ready (7 sync.status read(s) before the window; the first read: head 21, put 3, list 1, del 0); store simple 27 a minute (ceiling 40; 3 of the heads the probe's own sync.status reads, which the c (a cost row: over its ceiling on the preview it holds the ship)
- `cost.editor-hidden.calls`: not driven (document.visibilityState read "visible" after a second page was brought to the front (headless Chromium reports no hidden page), so the hidden state was not reached); recorded function requests 9.66 a minute and 9 session poll(s) were read from the tab that stayed visible (a cost row: over its ceiling on the preview it holds the ship)
- `cost.editor-editing.calls`: passed; recorded function requests 71.28 a minute (ceiling 75; 214 in 3 min); the store settled 2.26 s after the state was ready (1 sync.status read(s) before the window); store simple 133 a minute (ceiling 140; 3 of the heads the probe's own sync.status reads, which the ceiling carries, b3.md R7 b); store advanced  (a cost row: over its ceiling on the preview it holds the ship)
- `cost.two-tabs-idle.calls`: passed; recorded the store settled 2.90 s after the state was ready (1 sync.status read(s) before the window); store advanced 18 a minute (ceiling 30); store list 0 (ceiling 0); instances answering sync.status 2 (a cost row: over its ceiling on the preview it holds the ship)
- `cost.show.calls`: passed; recorded function requests 0 in the window (ceiling 0); the store settled 105.14 s after the state was ready (11 sync.status read(s) before the window; the first read: head 19, put 20, list 0, del 0); store calls at the first sample 1 (head 1, get 0, put 0, list 0, del 0), of which 1 the probe's own sync.sta (a cost row: over its ceiling on the preview it holds the ship)
- `shaders.perf.editor-frame`: failed (Error: under 150 ms); recorded longest animation frame 241.7 ms over 5 s with one shader on the stage (573 animation frames; rAF gaps; 1 canvas; renderer ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)); longest animation frame 241.7 ms over 5 s with one shader on the stage (573 an

