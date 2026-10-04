# Core gate matrix

Base http://localhost:4321, started 2026-10-04T05:13:28.773Z, 12655 s. 1101 rows judged: 930 passed, 80 failed, 91 not driven (2 of them manual, the checklist's: text.clipboard.paste-without-formatting, accounts.google-roundtrip), 0 no step, 17 local rows this run did not record (listed apart below, never counted as passed). Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): export.download.large-deck-pdf passed (PDF: GT brand deck.pdf, 95 slides in 7.0 s, 0.07 s per slide; PDF: GT brand deck.pdf, 95 slides in 7.0 s, 0.07 s per slide); export.download.large-deck-pptx passed (Editable text PowerPoint with Embed fonts: GT brand deck (editable).pptx, 95 slides in 71.8 s, 0.76 s per slide; Editable text PowerPoint with Embed fonts: GT brand deck (editable).pptx, 95 slides in 71.8 s, 0.76 s per slide); cost.editor-idle.calls passed (tier memory; function requests 9.67 a minute (ceiling 12; 29 in 3 min); the store half reads zero on this base (the file store); the function requests alone are asserted); cost.editor-hidden.calls not driven (function requests 9.67 a minute and 9 session poll(s) were read from the tab that stayed visible); cost.editor-editing.calls failed (tier memory; function requests 76.66 a minute (ceiling 75; 230 in 3 min); the store half reads zero on this base (the file store); the function requests alone are asserted); cost.two-tabs-idle.calls passed (tier memory; the store half reads zero on this base (the file store); the function requests alone are asserted); cost.show.calls passed (tier memory; function requests 0 in the window (ceiling 0); the store half reads zero on this base (the file store); the function requests alone are asserted); shaders.perf.editor-frame failed (longest animation frame 153.4 ms over 5 s with one shader on the stage (470 animation frames; rAF gaps; 1 canvas; renderer ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)); longest animation frame 153.4 ms over 5 s with one shader on the stage (470 animation frames; rAF gaps; 1 canvas; renderer ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver))); decks.home.load-budget failed (first byte 11 ms (budget 150); LCP 152 ms on img[hero-dark] (budget 500, the hero picture or the h1); ready 608 ms (budget 500); images before the first scroll 216540 B (budget 300000); images after a full scroll 216540 B (budget 800000); document 72224 B (budget 60000); long animation frames over 100 ms 0; JavaScript decoded 11736333 B (reported against 600000); first byte 11 ms (budget 150); LCP 152 ms on img[hero-dark] (budget 500, the hero picture or the h1); ready 608 ms (budget 500); images before the first scroll 216540 B (budget 300000); images after a full scroll 216540 B (budget 800000); document 72224 B (budget 60000); long animation frames over 100 ms 0; JavaScript decoded 11736333 B (reported against 600000)); cost.redis.commands not driven (function requests 73.64 a minute in the editing window were read from the page); cost.do.requests not driven (tier memory; the page made 75.29 function requests a minute and 0 request(s) to the room host (0 socket open(s)) in the editing window); cost.do.duration not driven (tier memory; the page made 75.29 function requests a minute and 0 request(s) to the room host (0 socket open(s)) in the editing window); cost.do.rows-written not driven (tier memory; the page made 75.29 function requests a minute and 0 request(s) to the room host (0 socket open(s)) in the editing window); cost.d1.reads not driven (tier memory; the page made 75.29 function requests a minute and 0 request(s) to the room host (0 socket open(s)) in the editing window); cost.d1.writes not driven (tier memory; the page made 75.29 function requests a minute and 0 request(s) to the room host (0 socket open(s)) in the editing window); cost.worker.requests not driven (tier memory; the page made 75.29 function requests a minute and 0 request(s) to the room host (0 socket open(s)) in the editing window). Cost rows over their ceiling in this run: cost.editor-editing.calls. Verdict failed; retries 0 configured, 0 test(s) retried; exit 1. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): shapes, lines, tables, charts, formatting, inbox, brand, fonts, templates, assist, logos, shaders; rows whose own controls a ship would keep parked: tables.cell.fill-border-tail (toolbar.fillColor, toolbar.borderColor, toolbar.borderWeight, toolbar.borderDash); tables.cells.merge-unmerge (format.table.mergeCells, format.table.unmergeCells); tables.tail.merge-unmerge-buttons (toolbar.mergeCells, toolbar.unmergeCells); tables.distribute.rows-columns (format.table.distributeRows, format.table.distributeColumns); versions.show-changes-marks (file.versionHistory.showChanges); templates.gallery.page (home.gallery, file.new.templateGallery); brand.logo.use-on-every-slide (format.image.useOnEverySlide); assist.tailor.dialog-one-undo (tools.tailor); assist.rewrite.card-accept-undo (panel.assist.starter.shorter); assist.notes.draft (panel.assist.starter.notes); assist.free-ask.fallback-sentence (panel.assist.prompt); tables.seam.row-drag (handle.table.row); tables.edge.add-row-column (handle.table.add.column, handle.table.add.row); tables.heads.select-row-column (handle.table.head.column, handle.table.head.row); tables.bar.row-column-buttons (bar.table); arrange.group.tail-text-controls (toolbar.group.text); logos.picker.search (insert.image.logo); logos.picker.paper-and-ink (insert.image.logo); logos.picker.empty-state (dialog.logo.upload); logos.picker.recents (dialog.logo.group.recent); logos.tailor.find-customer-logo (dialog.tailor.logo.find); logos.index.refresh-fixture (insert.image.logo); logos.index.cached-offline (insert.image.logo); logos.picker.variants (dialog.logo.kind.wordmark, dialog.logo.tone.mono); logos.kit.find-a-logo (panel.brand.logo.find); shaders.panel.preset-tiles (formatOptions.shader.preset); shaders.panel.kit-colours (formatOptions.shader.color); shaders.frame.auto-capture (insert.shader); shaders.frame.box-aspect (insert.shader); shaders.frame.reuse-and-prune (insert.shader); shaders.frame.one-capturer (insert.shader); shaders.background.place-answers (dialog.background.shader); shaders.background.add-to-theme (dialog.background.shader.addToTheme); shaders.library.glyph-engines-render (dialog.shader.engine.glyph); shaders.frame.scrubber-capture (formatOptions.shader.frame.scrubber, formatOptions.shader.frame.capture); shaders.show.plays-when-on (tools.preferences.playShaders, formatOptions.shader.play); shaders.show.frame-when-off (tools.preferences.playShaders); svg.import.upload (intake.svg.upload); svg.render.picture-gestures (intake.svg.upload, intake.svg.paste, intake.svg.drop, intake.svg.url); svg.copy.markup (picture.svg.copy); svg.export.pptx-svgblip (export.svg.vector); svg.export.pptx-fallback (export.svg.vector); svg.sanitize.script-and-handlers (intake.svg.upload); svg.sanitize.cap (intake.svg.upload); svg.sanitize.broken (intake.svg.upload); tables.heads.header-toggle (handle.table.head.row); rows of an unparkable feature blocking the ship: images.resize.eight-handles, images.resize.eight-handles-shift, images.resize.alt-centre, images.rotate.ring, images.crop.redo, arrange.clipboard.menu-copy-paste, arrange.redo.after-undone-duplicate, versions.undo-restore, arrange.distribute.horizontal, arrange.distribute.vertical, arrange.group.chords, arrange.group.menu-regroup, arrange.context.rotate-distribute, arrange.snap.guides-on-off, decks.recent.this-browser-sentence, text.select.shift-home-line, sync.title.concurrent-both-kept, sync.resend.idempotent, shaders.export.missing-frame-row, text.paragraph.toolbar-live, text.list.enter-tab-no-error, text.size.run-and-typed-value, images.insert.no-external-banner, help.check-slides.plain-sentence, share.name-prompt.empty-field, decks.list.own-and-shared, decks.list.action-scoped, export.refusal.sentence-and-retry, export.picture.progress-and-capture, present.laser.visible, realtime.title.two-typers.

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
| `images.insert.upload-while-pending` | images | core/images.spec.ts | broken | passed |  |
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
| `images.resize.eight-handles` | images | probe --core | works | failed | drag each of the eight handles plain: FAIL nw plain: 411,250 240x160 -> 351,210 300x200 (ratio 1.500 -> 1.500); readout during "300 × 200", after none; chip "Image" -> "Image"; undo restored false \| FAIL n plain: 351,210 300x200 -> 351,170 300x240 (expected 351,170 300x240); readout during "300 × 2 |
| `images.resize.eight-handles-shift` | images | probe --core | works | failed | drag each of the eight handles with Shift: FAIL nw shift: 231,129 605x401 -> 171,89 665x441 (ratio 1.509 -> 1.508); readout during "665 × 441", after none; chip "Image" -> "Image"; undo restored false \| FAIL n shift: 171,89 665x441 -> 171,49 725x481 (ratio 1.508 -> 1.507); readout during "725 × 481 |
| `images.resize.edge-fill` | images | probe --core | broken | passed |  |
| `images.resize.alt-centre` | images | probe --core | works | failed | a drag with Alt on the se handle: se alt: 56,9 1080x718 -> -4,-35 1200x806 (ratio 1.504 -> 1.489, centre kept); readout during "1200 × 806", after none; chip "Image" -> "Image"; undo restored false |
| `images.rotate.ring` | images | probe --core | works | failed | drag the ring about 35 degrees: rotate 35; readout during "35°", after none; after undo 35 |
| `images.crop.double-click` | images | probe --core | works | passed |  |
| `images.crop.east-edge` | images | probe --core | works | passed |  |
| `images.crop.south-edge` | images | probe --core | works | passed |  |
| `images.crop.enter` | images | probe --core | works | passed |  |
| `images.crop.undo` | images | probe --core | works | passed |  |
| `images.crop.redo` | images | probe --core | works | failed | Cmd+Shift+Z: 400,250 240x160 |
| `images.crop.menu-escape` | images | probe --core | works | passed |  |
| `images.crop.toolbar-escape-cancels` | images | probe --core | broken | passed |  |
| `images.options.panel` | images | probe --core | works | passed |  |
| `images.options.transparency` | images | probe --core | works | passed |  |
| `images.options.reset` | images | probe --core | works | passed |  |
| `images.reset-image.menu` | images | probe --core | works | passed |  |
| `images.replace.upload` | images | core/images.spec.ts | broken | passed |  |
| `images.background.colour` | images | probe --core | works | passed |  |
| `images.background.toolbar` | images | probe --core | works | passed |  |
| `images.background.upload-picture` | images | core/images.spec.ts | flaky | passed |  |
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
| `arrange.clipboard.menu-copy-paste` | arrange | probe --core | flaky | failed | Edit > Copy then Edit > Paste on a clean stage: 3 -> 3 |
| `arrange.clipboard.paste-after-new-slide-button` | arrange | probe --core | broken | passed |  |
| `arrange.clipboard.paste-with-filmstrip-focus` | arrange | probe --core | broken | passed |  |
| `arrange.clipboard.paste-keeps-position` | arrange | probe --core | works | passed |  |
| `arrange.duplicate.cmd-d` | arrange | probe --core | works | passed |  |
| `arrange.duplicate.menu-selects-copy` | arrange | probe --core | broken | passed |  |
| `arrange.duplicate.nothing-selected` | arrange | probe --core | works | passed |  |
| `arrange.redo.after-undone-duplicate` | arrange | probe --core | broken | failed | Cmd+D, Cmd+Z, then Cmd+Shift+Z (Cmd+Y, the toolbar Redo, Edit > Redo when needed): Cmd+Shift+Z: nothing; Cmd+Y: nothing; toolbar Redo: nothing; Edit > Redo: nothing; toolbar Redo aria-disabled true |
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
| `shapes.fill.colour` | shapes | probe --core | not driven | failed | the toolbar Fill color: a swatch, then a hex value; Undo: fill rgba(242, 242, 240, 0.05) -> rgb(47, 92, 224) (stored blue true) -> rgb(170, 51, 102); after two undos rgb(47, 92, 224) |
| `shapes.border.colour-weight-dash` | shapes | probe --core | not driven | failed | the toolbar Border color, Border weight and Border dash, then Format > Borders & lines; Undo: colour rgb(242, 242, 240) -> rgb(229, 72, 77); weight 1px -> 2px (menu.toolbar.borderWeight.weight-2); dash none -> 8px, 6px (toolbar.borderDash.pick.dash); Format > Borders & lines > Border color (plate fo |
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
| `lines.tail.colour-weight-dash-ends` | lines | probe --core | not driven | failed | the line toolbar's Line color, Line weight, Line dash, Line start and Line end; Undo: colour rgb(242, 242, 240) -> rgb(229, 72, 77); weight 1px -> 1.5px (menu.toolbar.lineWeight.line-1.5); dash none -> 6px, 4.5px (toolbar.lineDash.pick.dash); start true (toolbar.lineStart.pick.fillCircle); end true  |
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
| `versions.restore` | versions | core/share.spec.ts | flaky | passed |  |
| `versions.undo-restore` | versions | probe --core | not driven | failed | Restore an earlier version, then Cmd+Z: restore wrote true (revision 559 -> 560) and changed the deck true (read after 151 ms of a 35 s bound; versionHistory.499.restore; snackbar Saved the version Before the customer copy; panel notice Restored the version of Oct 3, 10:51 PM; state.error none); Cmd |
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
| `shapes.borders-lines.menu` | shapes | probe --core | works | failed | select the rectangle; Format > Borders & lines > Border color, a red swatch; Border dash > Dot; Cmd+Z each: swatch format.bordersLines.borderColor.red: stroke rgb(229, 72, 77) -> rgb(229, 72, 77) -> Cmd+Z rgb(229, 72, 77); Dot: dash none -> 2px, 4px; block restored true |
| `lines.connector.elbow` | lines | probe --core | works | failed | Insert > Line > Elbow connector dragged from A's right site to B's left site; B moved by 150 px: the two rectangles were not placed |
| `lines.connector.curved` | lines | probe --core | works | failed | Insert > Line > Curved connector dragged from A's right site to B's left site; B moved by 150 px: the two rectangles were not placed |
| `lines.connector.re-end` | lines | probe --core | not driven | failed | a third rectangle C; select the elbow connector, drag its end handle from B's site to C's left site; move C: no elbow connector to re-end |
| `lines.insert.arrow-head` | lines | probe --core | works | passed |  |
| `lines.tail.line-start-end-menu` | lines | probe --core | not driven | failed | select the line; Format > Borders & lines > Line start > Arrow, Cmd+Z; Line end > None, Cmd+Z: Line start > Arrow: start field true (drawn parts 2 -> 3), Cmd+Z restored true; Line end > Arrow then None: arrow true -> false (drawn parts 2); two Cmd+Z restored false |
| `lines.connector.export-pptx` | lines | core/export.spec.ts | works | passed |  |
| `tables.insert.grid` | tables | probe --core | works | not driven | setup failed: a slide for the tables |
| `tables.cell.double-click-type` | tables | probe --core | works | not driven | setup failed: a slide for the tables |
| `tables.cell.tab-from-written` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `tables.cell.tab-from-empty` | tables | probe --core | works | not driven | setup failed: a slide for the tables |
| `tables.cell.shift-tab` | tables | probe --core | not driven | not driven | setup failed: a slide for the tables |
| `tables.cell.tab-last-appends-row` | tables | probe --core | works | not driven | setup failed: a slide for the tables |
| `tables.menu.format-table-with-session` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `tables.menu.format-table-selected` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `tables.menu.format-table-rows` | tables | probe --core | not driven | not driven | setup failed: a slide for the tables |
| `tables.context.rows` | tables | probe --core | works | not driven | setup failed: a slide for the tables |
| `tables.context.insert-delete` | tables | probe --core | works | not driven | setup failed: a slide for the tables |
| `tables.column.insert-keeps-widths` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `tables.column.resize-seam` | tables | probe --core | not driven | not driven | setup failed: a slide for the tables |
| `tables.cell.align-menu` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `tables.cell.align-toolbar` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `tables.select.resize` | tables | probe --core | works | not driven | setup failed: a slide for the tables |
| `tables.cell.fill-border-tail` | tables | probe --core | not driven | not driven | setup failed: a slide for the tables |
| `tables.cells.merge-unmerge` | tables | probe --core | not driven | not driven | setup failed: a slide for the tables |
| `tables.tail.merge-unmerge-buttons` | tables | probe --core | not driven | not driven | setup failed: a slide for the tables |
| `tables.distribute.rows-columns` | tables | probe --core | not driven | not driven | setup failed: a slide for the tables |
| `tables.light-appearance` | tables | probe --core | not driven | not driven | setup failed: a slide for the tables |
| `tables.present` | tables | probe --core | works | not driven | setup failed: a slide for the tables |
| `tables.export.pdf` | tables | core/export.spec.ts | works | passed |  |
| `tables.export.pptx-editable` | tables | core/export.spec.ts | broken | passed |  |
| `tables.reload` | tables | probe --core | works | not driven | setup failed: a slide for the tables |
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
| `charts.export.pdf` | charts | core/export.spec.ts | not driven | failed | Error: North is in the PDF text |
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
| `formatting.align.justified-chord` | formatting | probe --core | works | failed | select the box, Cmd+Shift+J: align null -> justify (drawn justify); after Cmd+Z justify |
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
| `arrange.distribute.horizontal` | arrange | probe --core | works | failed | three objects selected, Arrange > Distribute > Horizontally; Cmd+Z: error: Cannot read properties of null (reading 'free') |
| `arrange.distribute.vertical` | arrange | probe --core | works | failed | three objects selected, Arrange > Distribute > Vertically; Cmd+Z: error: Cannot read properties of null (reading 'free') |
| `arrange.distribute.needs-three` | arrange | probe --core | works | passed |  |
| `arrange.rotate.quarter-turns` | arrange | probe --core | works | passed |  |
| `arrange.rotate.flips-menu` | arrange | probe --core | works | passed |  |
| `arrange.group.chords` | arrange | probe --core | works | failed | a1 and a2 selected, Cmd+Option+G, ArrowRight twice, Cmd+Option+Shift+G; three Cmd+Z: chip "2 objects" -> "Group" (group group); x 152,600 -> 154,602; after ungroup undefined; 6 Cmd+Z returned the start false |
| `arrange.group.menu-regroup` | arrange | probe --core | works | failed | Arrange > Group, Ungroup, Regroup; read the enabled states; Cmd+Z: enabled before {"group":true,"ungroup":false,"regroup":false}; Group -> group; enabled then {"group":true,"ungroup":true,"regroup":false}; Ungroup -> undefined; enabled then {"group":false,"ungroup":false,"regroup":false}; Regroup -> |
| `arrange.group.context-rows` | arrange | probe --core | not driven | passed |  |
| `arrange.context.rotate-distribute` | arrange | probe --core | not driven | failed | right click a shape, a text block and a line: Rotate > Rotate clockwise 90 on each (Cmd+Z each); three selected, right click one, Distribute > Horizontally: error: Cannot read properties of null (reading 'free') |
| `arrange.ruler.show-hide` | arrange | probe --core | works | passed |  |
| `arrange.guides.from-ruler` | arrange | probe --core | works | passed |  |
| `arrange.guides.show-toggle` | arrange | probe --core | works | passed |  |
| `arrange.guides.add-vertical-horizontal` | arrange | probe --core | works | passed |  |
| `arrange.guides.drag` | arrange | probe --core | flaky | passed |  |
| `arrange.snap.guides-on-off` | arrange | probe --core | works | failed | drop a1 4 px short of the guide at 1000 with Snap to > Guides on, then off: guide at 1001; aimed 997: with Snap to guides on landed 152; off landed 997 |
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
| `view.live-pointers.second-browser` | view | core/share.spec.ts | not driven | passed |  |
| `view.comments.radios` | view | probe --core | works | passed |  |
| `view.comments.show-all-panel` | view | probe --core | broken | passed |  |
| `view.comments.modes-markers` | view | probe --core | not driven | passed |  |
| `decks.name.follows-heading` | decks | probe --core | broken | passed |  |
| `decks.file.template-gallery` | decks | core/decks.spec.ts | works | passed |  |
| `decks.file.open-list-search` | decks | probe --core | works | passed |  |
| `decks.file.open-upload-bundle` | decks | core/decks.spec.ts | works | passed |  |
| `decks.file.import-slides-deck` | decks | probe --core | works | passed |  |
| `decks.file.import-slides-bundle` | decks | core/decks.spec.ts | works | passed |  |
| `decks.file.details` | decks | probe --core | works | passed |  |
| `slides.numbers.apply` | slides | probe --core | not driven | passed |  |
| `versions.show-changes-toggle` | versions | probe --core | works | passed |  |
| `versions.show-changes-marks` | versions | probe --core | not driven | failed | a heading edit and an added box after the named version; pick the older version with Show changes on; then off: picked versionHistory.560.pick (named row versionHistory.560.pick); marks with Show changes on 0 (); off 0 |
| `export.zip.bundle` | export | core/export.spec.ts | works | passed |  |
| `export.html.web-page` | export | core/export.spec.ts | flaky | passed |  |
| `export.jpg.current-slide` | export | core/export.spec.ts | broken | passed |  |
| `export.png.current-slide` | export | core/export.spec.ts | broken | passed |  |
| `help.check-slides` | help | probe --core | works | passed |  |
| `help.improve-link` | help | core/decks.spec.ts | works | passed |  |
| `inbox.bell-panel-toggle` | inbox | probe --core | broken | failed | click the bell; read the panel; click the bell again: with the switch on; panel open true (aria-pressed true); words "NotificationsMark all readNothing newNotification settings"; Mark all read true; settings link true; panel still open after the second click true (aria-pressed true) |
| `inbox.settings-persist` | inbox | probe --core | broken | passed |  |
| `inbox.notification-arrives` | inbox | core/share.spec.ts | not driven | passed |  |
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
| `share.dialog.co-edit-from-copied-link` | share | core/share.spec.ts | broken | passed |  |
| `decks.recent.drops-trashed` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.trash.editor-undo-snackbar` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.recent.this-browser-sentence` | decks | core/decks.spec.ts | not driven | not driven | not on this build: home.recent.sentence (docs/archive/rounds/PRODUCT.md 7.1, B1) |
| `decks.home.seller-lead` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.card.thumbnail-slide-1` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.card.edited-relative-time` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.card.more-glyph` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.trash.button-heights` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.trash.confirm-dialog-chrome` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.new.skeleton-one-frame` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.access.stranger-links` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.notfound.sentence-case` | decks | core/decks.spec.ts | broken | passed |  |
| `templates.gallery.page` | templates | core/decks.spec.ts | broken | failed | TimeoutError: browserContext.waitForEvent: Timeout 20000ms exceeded while waiting for event "page" |
| `templates.gallery.strip-and-link` | templates | core/decks.spec.ts | broken | passed |  |
| `templates.save.as-template` | templates | core/brand.spec.ts | not driven | passed |  |
| `templates.save.same-name-replaces` | templates | core/brand.spec.ts | not driven | passed |  |
| `templates.card.rename-and-delete` | templates | core/brand.spec.ts | not driven | passed |  |
| `templates.default.use-for-new` | templates | core/brand.spec.ts | not driven | passed |  |
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
| `text.select.shift-home-line` | text | probe --core | broken | failed | a three line paragraph in a narrow box; End; Shift+Home: the narrow box was not placed |
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
| `menus.icons.insert-rows` | chrome | probe --core | broken | passed |  |
| `menus.icons.format-rows` | chrome | probe --core | broken | passed |  |
| `menus.icons.one-family` | chrome | probe --core | works | passed |  |
| `brand.panel.opens` | brand | probe --core | not driven | passed |  |
| `brand.logo.replace-every-slide` | brand | core/brand.spec.ts | not driven | passed |  |
| `brand.logo.use-on-every-slide` | brand | probe --core | not driven | not driven | not on this build: format.image.useOnEverySlide (docs/archive/rounds/PRODUCT.md 7.1, B5a); the picture's menu lists edit.cut, edit.copy, edit.paste, edit.delete, edit.duplicate, arrange.order, arrange.rotate, arrange.centerOnPage, arrange.align, format.image.replaceImage, format.image.cropImage, for |
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
| `assist.tailor.dialog-one-undo` | assist | probe --core | not driven | failed | Tools > Tailor for a customer: Acme to Globex, skip the pricing slide, Apply; Cmd+Z: count "6 places on 5 slides" (acme at blank-1-38b4/slots/main/0/id, blank-1-38b4/slots/main/0/text, blank-2-38b4/slots/main/0/id, blank-2-38b4/slots/main/0/text, split-1-bf53/slots/main/6/id, split-1-bf53/slots/main |
| `assist.tailor.agent-deck-tailor` | assist | probe --core | not driven | passed |  |
| `assist.rewrite.card-accept-undo` | assist | core/assist.spec.ts | not driven | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m |
| `assist.notes.draft` | assist | core/assist.spec.ts | not driven | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m |
| `assist.free-ask.fallback-sentence` | assist | core/assist.spec.ts | not driven | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m |
| `assist.mark.chip-and-history` | assist | core/assist.spec.ts | not driven | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m |
| `assist.outside-write.snackbar` | assist | probe --core | broken | passed |  |
| `assist.finder.terms` | assist | probe --core | broken | passed |  |
| `assist.finder.ask-row` | assist | probe --core | not driven | passed |  |
| `assist.quota.429` | assist | core/assist.spec.ts | not driven | not driven | not driven: the quota counts across instances only with Upstash and this base does not say which limiter it runs (GET /api/agent instance facts); the unit test apps/studio/src/server/ratelimit.test.ts covers the rows (PRODUCT.md 8.2) |
| `assist.viewer.disabled` | assist | core/share.spec.ts | not driven | failed | Error: the viewer sees the disabled panel with its sentence |
| `assist.agent.propose-accept` | assist | probe --core | not driven | failed | assist.propose over HTTP, assist.accept with the card, then the card with one byte changed: assist.propose answered 401 {"error":{"name":"ModelCallError","status":401,"message":"The assistant’s model answered 401","action":"assist.propose"}} |
| `sync.serial.order-and-latency` | sync | core/sync.spec.ts | works | passed |  |
| `sync.title.concurrent-both-kept` | sync | core/sync.spec.ts | broken | failed | Error: both words in both browsers in every round of three |
| `sync.title.offline-both-kept` | sync | core/sync.spec.ts | broken | passed |  |
| `sync.block.concurrent-same-offset-order` | sync | core/sync.spec.ts | broken | passed |  |
| `sync.structural.concurrent` | sync | core/sync.spec.ts | not driven | passed |  |
| `sync.block.offline-replay-converges` | sync | core/sync.spec.ts | works | passed |  |
| `sync.viewer.live-updates` | sync | core/sync.spec.ts | broken | passed |  |
| `sync.reload.same-document` | sync | core/sync.spec.ts | works | passed |  |
| `sync.undo.after-remote` | sync | core/sync.spec.ts | not driven | passed |  |
| `sync.resend.idempotent` | sync | core/sync.spec.ts | not driven | not driven | not on this build: version.list answers no origin (packages/store/src/versions.ts toVersion drops the record's origin on every tier; docs/archive/rounds/SYNC.md 3.2 names it on the record, the sync owner's); the word landed once in both browsers; records above 2: 1 (the memory tier's checkpointer wr |
| `sync.pull.no-listing` | sync | cost-probe | broken | passed |  |
| `cost.editor-idle.calls` | cost | cost-probe | broken | passed |  |
| `cost.editor-hidden.calls` | cost | cost-probe | broken | not driven | document.visibilityState read "visible" after a second page was brought to the front (headless Chromium reports no hidden page), so the hidden state was not reached |
| `cost.editor-editing.calls` | cost | cost-probe | broken | failed | function requests 76.66 a minute over 75 |
| `cost.two-tabs-idle.calls` | cost | cost-probe | works | passed |  |
| `cost.show.calls` | cost | cost-probe | broken | passed |  |
| `charts.grid.type-to-edit` | charts | probe --core | broken | passed |  |
| `charts.grid.escape-stays` | charts | probe --core | broken | passed |  |
| `tables.cell.click-places-caret` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `tables.cell.click-then-type` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `tables.range.drag-from-selected` | tables | probe --core | not driven | not driven | setup failed: a slide for the tables |
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
| `shapes.geometry.text-rect` | shapes | core/export.spec.ts | broken | passed |  |
| `shapes.geometry.sites` | shapes | probe --core | broken | passed |  |
| `shapes.geometry.resize-keeps-adjust` | shapes | probe --core | not driven | passed |  |
| `shapes.geometry.export.pptx-prst-avlst` | shapes | core/export.spec.ts | not driven | passed |  |
| `shapes.geometry.export.raster-modes` | shapes | core/export.spec.ts | not driven | passed |  |
| `shapes.insert.grid-shapes` | shapes | probe --core | broken | passed |  |
| `shapes.insert.grid-arrows` | shapes | probe --core | broken | passed |  |
| `shapes.insert.grid-callouts` | shapes | probe --core | broken | passed |  |
| `shapes.insert.grid-equation` | shapes | probe --core | broken | passed |  |
| `shapes.icons.named-rows` | shapes | probe --core | broken | passed |  |
| `shapes.change-shape.plate` | shapes | probe --core | not driven | passed |  |
| `shapes.mask-image.plate` | shapes | probe --core | not driven | passed |  |
| `tables.selected.typing-appends` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `tables.cell.arrows-cross-cells` | tables | probe --core | not driven | not driven | setup failed: a slide for the tables |
| `tables.range.shift-arrows` | tables | probe --core | not driven | not driven | setup failed: a slide for the tables |
| `diagrams.label.double-click-opens` | diagrams | probe --core | broken | passed |  |
| `diagrams.label.tab-next` | diagrams | probe --core | not driven | passed |  |
| `charts.double-click.opens-data` | charts | probe --core | broken | passed |  |
| `charts.mark.click-selects-cell` | charts | probe --core | not driven | passed |  |
| `tables.range.bold-italic` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `tables.range.size-color` | tables | probe --core | not driven | not driven | setup failed: a slide for the tables |
| `diagrams.step.one-object` | diagrams | probe --core | broken | passed |  |
| `diagrams.export.step-label` | diagrams | core/export.spec.ts | not driven | passed |  |
| `charts.legend.none-from-toolbar` | charts | probe --core | broken | passed |  |
| `charts.panel.no-duplicate-controls` | charts | probe --core | broken | passed |  |
| `charts.grid.remove-visible` | charts | probe --core | broken | passed |  |
| `tables.panel.table-first` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `tables.seam.row-drag` | tables | probe --core | not driven | not driven | setup failed: a slide for the tables |
| `tables.edge.add-row-column` | tables | probe --core | not driven | not driven | setup failed: a slide for the tables |
| `tables.heads.select-row-column` | tables | probe --core | not driven | not driven | setup failed: a slide for the tables |
| `tables.bar.row-column-buttons` | tables | probe --core | not driven | not driven | setup failed: a slide for the tables |
| `brand.objects.kit-colours-first` | brand | probe --core | not driven | failed | the table cell's Fill color plate, the chart's series swatches, the text colour plate; a new chart's series: no table from the tables area to read |
| `tables.paste.tsv-makes-table` | tables | core/documents.spec.ts | broken | passed |  |
| `tables.paste.into-cell-spreads` | tables | core/documents.spec.ts | broken | passed |  |
| `arrange.group.tail-text-controls` | arrange | probe --core | not driven | not driven | not on this build: toolbar.group.text (docs/archive/rounds/PRODUCT.md 7.1, B3); chip "Group"; the group tail lists toolbar.fillColor, toolbar.borderColor, toolbar.borderWeight, toolbar.borderDash, toolbar.formatOptions and none of the text controls (P1, FEATURES.md 2.3 item 6) |
| `tables.command.keeps-caret` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `wordart.resize.scales-letters` | wordart | probe --core | broken | passed |  |
| `wordart.tail.fill-outline` | wordart | probe --core | not driven | passed |  |
| `fonts.inter.italic-release` | fonts | core/brand.spec.ts | broken | passed |  |
| `fonts.links.licence-v4-1` | fonts | probe --core | broken | passed |  |
| `fonts.fallback.in-stack` | fonts | probe --core | broken | passed |  |
| `fonts.display-features.inter-only` | fonts | probe --core | not driven | passed |  |
| `tables.cells.tabular-figures` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `formatting.numerals.tabular-row` | formatting | probe --core | not driven | passed |  |
| `fonts.catalog.geist` | fonts | probe --core | not driven | passed |  |
| `fonts.catalog.six-families` | fonts | probe --core | not driven | passed |  |
| `fonts.picker.specimen-rows` | fonts | core/brand.spec.ts | not driven | not driven | not on this build: the specimen rows of the Font dropdown (docs/archive/rounds/FEATURES.md 3.5, P1, B1 with B2) |
| `fonts.picker.recent-group` | fonts | core/brand.spec.ts | not driven | passed |  |
| `fonts.picker.search-category` | fonts | probe --core | not driven | passed |  |
| `fonts.preload.italic-on-edit-only` | fonts | core/brand.spec.ts | not driven | passed |  |
| `fonts.table.takes-family` | fonts | probe --core | not driven | not driven | not on this build: toolbar.font (docs/archive/rounds/PRODUCT.md 7.1, B1); the Font control on a selected table is drawn disabled ("Inter"); takesFamily is P1 (FEATURES.md 3.5) |
| `fonts.field.own-face` | fonts | probe --core | broken | passed |  |
| `logos.insert.row` | logos | probe --core | not driven | passed |  |
| `logos.picker.search` | logos | probe --core | not driven | failed | Insert > Logo; type figma at human speed; Enter: 20 result tiles 5 ms after the last key (first fsharp active true; foot "Logos from thesvg.org as of 25 September 2026. Brand marks belong to their owners; use them to name the brand, not to imply endorsement"); Enter inserted shot logo 441,415 160x16 |
| `logos.picker.paper-and-ink` | logos | probe --core | not driven | failed | search vercel; read the tile's paper and ink halves; Slide > Change theme light; insert; read the mark: no Vercel tile among 23 tiles |
| `logos.picker.your-brand` | logos | probe --core | not driven | passed |  |
| `logos.picker.empty-state` | logos | probe --core | not driven | failed | search zzqx; Upload; then General Translation: "zzqx" (5 ms): "no empty state"; Upload false, chooser opened false; "General Translation" (4 ms): "No logo named General Translation on thesvg.org. Upload a file, or ask the brand for its press kitYour brand kit’s logo is under Your brandUpload"; no ki |
| `logos.picker.recents` | logos | core/logos.spec.ts | not driven | failed | Error: figma is a result |
| `logos.picker.licence-words` | logos | probe --core | not driven | passed |  |
| `logos.picker.chrome-1280` | logos | core/chrome.spec.ts | not driven | passed |  |
| `logos.insert.one-click-asset` | logos | probe --core | not driven | passed |  |
| `logos.insert.logo-size` | logos | probe --core | not driven | passed |  |
| `logos.insert.mono-tint` | logos | probe --core | not driven | passed |  |
| `logos.insert.every-slide` | logos | probe --core | not driven | passed |  |
| `logos.tailor.find-customer-logo` | logos | probe --core | not driven | failed | a picture with alt Acme and a text naming Acme as setup; Tools > Tailor; From Acme, To Figma; Find the Figma logo; Apply; Cmd+Z: button "Find the Figma logo" with the mark drawn true; stored "The Figma logo is ready; Apply puts it where the old logo was"; Apply dialog.tailor.apply: picture asset acm |
| `logos.replace-image.row` | logos | probe --core | not driven | passed |  |
| `logos.route.mark-headers` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.index.refresh-dry-run` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.index.refresh-fixture` | logos | core/logos.spec.ts | not driven | not driven | not driven: the index reads network, not the ten mark fixture (TURBOSLIDE_LOGO_UPSTREAM=fixture on a preview); the unit tests apps/studio/src/server/logos.test.ts cover the 404 marking and the takedown (docs/archive/rounds/FEATURES.md 7.3) |
| `logos.index.cached-offline` | logos | core/logos.spec.ts | not driven | not driven | not driven: the index reads network, not the outage (TURBOSLIDE_LOGO_UPSTREAM=down on a preview); the unit test apps/studio/src/server/logos.test.ts covers the cache during an outage (docs/archive/rounds/FEATURES.md 7.3) |
| `logos.cache.open-licence-only` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.export.pdf-pptx-crisp` | export | core/export.spec.ts | not driven | passed |  |
| `logos.agent.search-insert` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.picker.variants` | logos | probe --core | not driven | not driven | not on this build: dialog.logo.kind.wordmark (docs/archive/rounds/PRODUCT.md 7.1, B1); no Symbol, Wordmark, Color or Mono control in the dialog head (P1, FEATURES.md 4.11; the appearance rule chooses) |
| `logos.kit.find-a-logo` | logos | probe --core | not driven | not driven | not on this build: panel.brand.logo.find (docs/archive/rounds/PRODUCT.md 7.1, B6); no Find a logo beside Replace in the Brand kit panel's Logo section (P1, FEATURES.md 4.5) |
| `logos.intake.url-sentence` | images | probe --core | broken | passed |  |
| `shaders.insert.gallery-thumbnails` | shaders | probe --core | not driven | passed |  |
| `shaders.insert.selected-free-rectangle` | shaders | probe --core | broken | passed |  |
| `shaders.insert.words` | shaders | probe --core | broken | passed |  |
| `shaders.panel.section-groups` | shaders | core/chrome.spec.ts | broken | passed |  |
| `shaders.panel.slider-live-undo` | shaders | probe --core | not driven | passed |  |
| `shaders.panel.preset-tiles` | shaders | probe --core | broken | failed | read the Preset row's tiles; click a tile that is not pressed: 10 tiles ("Paper on ink", "Ink on paper", "Primary", "Accent", "Captions", "Hints", "Diamond" pressed, "Sphere", "Chrome", "Noir") against 10 presets of paper:liquid-metal; labels not in sentence case: none; click on formatOptions.shader |
| `shaders.panel.control-sentences` | shaders | probe --core | not driven | passed |  |
| `shaders.panel.kit-colours` | shaders | probe --core | not driven | failed | read the Colors row's swatches; brand.set /colors/<appearance>/primary '#0b3d91'; read the shader and its frame: the Primary swatch clicked (revision 649 -> 650); swatches text, background, caption, hint, primary, accent, custom (6 of the six roles); the sheet renders dark (deck.info and the chrome  |
| `shaders.panel.one-home` | shaders | probe --core | broken | passed |  |
| `shaders.frame.auto-capture` | shaders | core/shaders.spec.ts | broken | failed | Error: the block has a frame asset after the recipe change |
| `shaders.frame.box-aspect` | shaders | core/shaders.spec.ts | not driven | failed | Error: a frame after the resize |
| `shaders.frame.reuse-and-prune` | shaders | core/shaders.spec.ts | not driven | failed | Error: the 1.2 frame |
| `shaders.frame.one-capturer` | shaders | core/shaders.spec.ts | not driven | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m |
| `shaders.background.place-answers` | shaders | probe --core | broken | failed | Slide > Change background on the body slide; Shader; a tile; Place; read the ground, the button and the dialog: chose Liquid metal; Place dialog.background.shader.place; the ground changed after 10223 ms (covering picture background, asset liquid-metal); the button read "Placing, 9 s" with the secon |
| `shaders.export.pdf-frame` | export | core/export.spec.ts | broken | passed |  |
| `shaders.export.pptx-frame` | export | core/export.spec.ts | broken | passed |  |
| `shaders.export.html-frame` | export | core/export.spec.ts | broken | passed |  |
| `shaders.export.missing-frame-row` | export | core/export.spec.ts | not driven | failed | Error: the export started within 800 ms of the change |
| `shaders.perf.one-context` | shaders | probe --core | not driven | passed |  |
| `shaders.perf.hidden-pauses` | shaders | core/shaders.spec.ts | not driven | passed |  |
| `shaders.perf.editor-frame` | shaders | core/shaders.spec.ts | not driven | failed | Error: under 150 ms |
| `shaders.agent.list-insert-set-render` | shaders | core/shaders.spec.ts | not driven | passed |  |
| `shaders.background.add-to-theme` | shaders | probe --core | not driven | not driven | not on this build: dialog.background.shader.addToTheme (docs/archive/rounds/PRODUCT.md 7.1, B1 (dialogs/Background.tsx)); no Add to theme row beside the Shader row (P1, FEATURES.md 5.2 item 1) |
| `shaders.library.glyph-engines-render` | shaders | core/shaders.spec.ts | not driven | not driven | not on this build: dialog.shader.engine.glyph (docs/archive/rounds/FEATURES.md 5.2 item 2, B5, P1); the catalog lists none of proto:studio-field, glyph:mesh-gradient, glyph:dither-gradient |
| `shaders.frame.scrubber-capture` | shaders | probe --core | not driven | not driven | not on this build: formatOptions.shader.frame.scrubber (docs/archive/rounds/PRODUCT.md 7.1, B5 (inspector/shader.tsx)); no Frame scrubber in the Shader section (P1, FEATURES.md 5.2 item 3) |
| `shaders.view.play-setting` | view | probe --core | not driven | passed |  |
| `shaders.show.plays-when-on` | shaders | core/shaders.spec.ts | broken | not driven | not on this build: formatOptions.shader.play and the show's ShaderLayer (packages/viewer/src/present/ShaderLayer.tsx; docs/archive/rounds/FEATURES.md 5.6, B5 with B1, P1); the show draws the frame until they land |
| `shaders.show.frame-when-off` | shaders | core/shaders.spec.ts | not driven | not driven | not on this build: formatOptions.shader.play and the show's ShaderLayer (packages/viewer/src/present/ShaderLayer.tsx; docs/archive/rounds/FEATURES.md 5.6, B5 with B1, P1); the show draws the frame until they land |
| `shaders.insert.gallery-hover-live` | shaders | probe --core | not driven | passed |  |
| `logos.export.svgblip` | logos | core/logos.spec.ts | not driven | passed |  |
| `svg.import.upload` | svg | core/svg.spec.ts | broken | failed | Error: the asset reads kind 'svg' |
| `svg.import.paste-file` | svg | core/svg.spec.ts | not driven | passed |  |
| `svg.import.paste-markup` | svg | core/svg.spec.ts | not driven | passed |  |
| `svg.import.drop` | svg | core/svg.spec.ts | not driven | passed |  |
| `svg.import.url` | svg | core/svg.spec.ts | not driven | passed |  |
| `svg.render.vector-at-zoom` | svg | core/svg.spec.ts | not driven | passed |  |
| `svg.render.picture-gestures` | svg | core/svg.spec.ts | not driven | failed | Error: every gesture writes, draws and undoes (move 400,200 -> 480,240 (true); se with Shift 360x240 -> 450x300 (aspect 1.500 -> 1.500, true); rotate 15 (true); mask ellipse drawn ellipse clip path("M 0 120 A 180 120 0 0 1 180 0 A 18 (true); border weight {"weight":2} drawn 2px (true); shadow {"colo |
| `svg.copy.markup` | svg | core/svg.spec.ts | not driven | failed | Error: text/plain begins with the prolog or <svg |
| `svg.export.pdf-vector` | svg | core/export.spec.ts | not driven | passed |  |
| `svg.export.pptx-svgblip` | svg | core/export.spec.ts | not driven | failed | Error: the p:pic carries asvg:svgBlip inside a:extLst with the ext uri |
| `svg.export.pptx-fallback` | svg | core/export.spec.ts | not driven | failed | Error: and whose IHDR width is the block's width times 3 |
| `svg.export.web-page` | svg | core/export.spec.ts | not driven | passed |  |
| `svg.sanitize.script-and-handlers` | svg | core/svg.spec.ts | not driven | failed | Error: no script |
| `svg.sanitize.data-image-kept` | svg | core/svg.spec.ts | not driven | passed |  |
| `svg.sanitize.cap` | svg | core/svg.spec.ts | not driven | failed | Error: nothing lands |
| `svg.sanitize.broken` | svg | core/svg.spec.ts | not driven | failed | Error: the sentence |
| `gestures.draw.shape-fill-at-step5` | arrange | probe --core | broken | passed |  |
| `gestures.draw.click-at-press` | arrange | probe --core | broken | passed |  |
| `gestures.draw.text-box-frame` | arrange | probe --core | works | passed |  |
| `gestures.draw.grammar-slide-converts` | arrange | probe --core | broken | passed |  |
| `gestures.resize.shape-follows` | arrange | probe --core | works | passed |  |
| `gestures.resize.text-reflows` | arrange | probe --core | not driven | passed |  |
| `gestures.resize.picture-follows` | arrange | probe --core | works | passed |  |
| `gestures.resize.table-follows` | arrange | probe --core | works | passed |  |
| `gestures.seam.table-follows` | arrange | probe --core | works | passed |  |
| `gestures.resize.chart-follows` | arrange | probe --core | works | passed |  |
| `gestures.resize.diagram-follows` | arrange | probe --core | not driven | passed |  |
| `gestures.resize.wordart-scales` | arrange | probe --core | not driven | passed |  |
| `gestures.move.connector-follows-live` | arrange | probe --core | broken | passed |  |
| `gestures.rotate.ring-turns-live` | arrange | probe --core | broken | passed |  |
| `gestures.rotate.ring-after-release` | arrange | probe --core | broken | passed |  |
| `gestures.frame.one-render-per-frame` | arrange | probe --core | not driven | passed |  |
| `gestures.frame.cost-budget` | arrange | probe --core | not driven | passed |  |
| `gestures.readout.stays` | arrange | probe --core | works | passed |  |
| `gestures.watch.chart-se-after-mark-click` | arrange | probe --core | flaky | passed |  |
| `tables.select.ring-with-cell-open` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `tables.cell.ring-on-cell` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `tables.cells.empty-grid-guides` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `tables.show.rules-only` | tables | core/export.spec.ts | works | passed |  |
| `tables.light-appearance-guides` | tables | probe --core | not driven | not driven | setup failed: a slide for the tables |
| `tables.insert.box-fits-rows` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `tables.rows.grow-with-text` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `tables.resize.rows-share-extra` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `tables.seam.visible-with-cell-open` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `tables.heads.header-toggle` | tables | probe --core | not driven | not driven | setup failed: a slide for the tables |
| `tables.panel.section-words` | tables | probe --core | broken | not driven | setup failed: a slide for the tables |
| `charts.pie.add-series-refused` | charts | probe --core | broken | passed |  |
| `diagrams.member.duplicate-delete` | diagrams | probe --core | not driven | passed |  |
| `lines.chip.kind-name` | lines | probe --core | broken | failed | select the elbow connector, the line, the arrow, the curved connector and rectangle A in turn; read the chip: the elbow connector: chip not on the slide (Elbow connector); the line: chip "Line" (Line); the arrow: chip "Arrow" (Arrow); the curved connector: chip not on the slide (Curved connector); r |
| `people.chip-plate-size` | share | probe --core | broken | passed |  |
| `people.mark-renderers-agree` | share | probe --core | broken | passed |  |
| `people.own-chip-follows-name` | share | probe --core | broken | passed |  |
| `people.own-chip-follows-avatar` | share | probe --core | broken | passed |  |
| `people.avatar-anonymous-refused` | share | probe --core | works | passed |  |
| `versions.window-mark-column` | versions | probe --core | broken | passed |  |
| `versions.restore-in-more` | versions | probe --core | broken | passed |  |
| `people.chip-tooltip-trust` | share | core/share.spec.ts | broken | passed |  |
| `people.comment-departed-guest` | comments | core/share.spec.ts | broken | passed |  |
| `share.dialog.owner-resolved` | share | core/share.spec.ts | broken | passed |  |
| `collab.caret-hue-matches-chip` | share | core/share.spec.ts | broken | passed |  |
| `people.verified-badge` | share | e2e/accounts.spec.ts | not driven | not driven | no identity database on this base |
| `people.versions-author-account` | versions | e2e/accounts.spec.ts | not driven | not driven | no identity database on this base |
| `people.labels-disambiguated` | share | e2e/accounts.spec.ts | not driven | not driven | no identity database on this base |
| `share.dialog.grant-email-line` | share | e2e/accounts.spec.ts | not driven | not driven | no identity database on this base |
| `people.avatar-upload` | share | e2e/accounts.spec.ts | not driven | not driven | no identity database on this base |
| `people.avatar-cap-refusal` | share | e2e/accounts.spec.ts | not driven | not driven | no identity database on this base |
| `people.avatar-rotation` | share | e2e/accounts.spec.ts | not driven | not driven | no identity database on this base |
| `people.avatar-fallback-plate` | share | e2e/accounts.spec.ts | not driven | not driven | no identity database on this base |
| `people.avatar-link-visitor` | share | e2e/accounts.spec.ts | not driven | not driven | no identity database on this base |
| `people.avatar-metadata-stripped` | share | e2e/accounts.spec.ts | not driven | not driven | no identity database on this base |
| `surface.domain.build-commit` | surface | core/surface.spec.ts | broken | passed |  |
| `tables.cells.no-prompt` | tables | probe --core | broken | passed |  |
| `tables.rows.ring-follows-typing` | tables | probe --core | broken | passed |  |
| `tables.header.rule-with-text` | tables | core/export.spec.ts | broken | passed |  |
| `tables.cell.click-moves-caret` | tables | probe --core | broken | passed |  |
| `tables.tail.size-step-ladder` | tables | probe --core | broken | passed |  |
| `tables.insert.box-never-shorter-than-rows` | tables | probe --core | broken | passed |  |
| `tables.heads.keys-act-on-range` | tables | probe --core | broken | passed |  |
| `tables.insert.one-placement-rule` | tables | probe --core | broken | passed |  |
| `tables.edge.stays-inside-sheet` | tables | probe --core | broken | passed |  |
| `tables.range.align-cells-only` | tables | probe --core | broken | passed |  |
| `tables.context.object-menu-on-frame` | tables | probe --core | broken | passed |  |
| `tables.polish.seams-snap-grid` | tables | probe --core | broken | passed |  |
| `text.bold.toolbar-marks-run` | text | probe --core | broken | passed |  |
| `slides.layout.blank-empty` | slides | probe --core | broken | passed |  |
| `text.paragraph.toolbar-live` | text | probe --core | broken | failed | a two line text box; a session open with the caret in line 1; Center from the tail, then Double, then Increase indent: no text box |
| `text.list.enter-tab-no-error` | text | probe --core | broken | failed | a text box reading One; Bulleted list from the tail; the session opened at the end; Enter, "Two", Tab, Enter, "Three"; Escape; Cmd+Z until the box is back: listed true; items ["One","Two","Three"] (second nested true); error over the stage none; console 0; restored by Cmd+Z false (docs/archive/round |
| `text.size.run-and-typed-value` | text | probe --core | broken | failed | "Acme" selected in a 20 px text box; 36 typed into the size field, Enter: no text box |
| `text.marks.whole-block-from-menu` | text | probe --core | broken | passed |  |
| `text.tail.heading-takes-list-indent` | text | probe --core | broken | passed |  |
| `text.heading.enter-keeps-session` | text | probe --core | broken | passed |  |
| `text.link.chip-on-click` | text | probe --core | broken | passed |  |
| `text.title.shrink-on-overflow` | text | probe --core | broken | passed |  |
| `text.title.second-session-survives-reload` | text | probe --core | broken | passed |  |
| `text.link.popover-anchored` | text | probe --core | broken | passed |  |
| `text.link.detection-setting` | text | probe --core | broken | passed |  |
| `text.tail.size-reads-heading` | text | probe --core | broken | passed |  |
| `text.polish.highlight-console` | text | probe --core | broken | passed |  |
| `lines.hit.stroke-only` | lines | probe --core | broken | passed |  |
| `shapes.geometry.cloud-callout-closed` | shapes | probe --core | broken | passed |  |
| `charts.grid.every-series-in-view` | charts | probe --core | broken | passed |  |
| `chrome.format-options.fields-by-kind` | chrome | probe --core | broken | passed |  |
| `lines.move.detaches` | lines | probe --core | broken | passed |  |
| `lines.select.handles-no-ring` | lines | probe --core | broken | failed | a line, an arrow and the curved connector each selected: po-line: no path; po-arrow: end handles 2, resize handles 0, ring none, chip -9.4/8.4 px from the start handle; po-curve: end handles 2, resize handles 0, ring none, chip -9.4/8.4 px from the start handle (docs/archive/rounds/POLISH.md 2.4 ite |
| `arrange.select.no-browser-highlight` | arrange | probe --core | broken | passed |  |
| `diagrams.label.double-click-selects-word` | diagrams | probe --core | broken | passed |  |
| `charts.labels.fit-slot` | charts | core/export.spec.ts | broken | passed |  |
| `svg.paste.keeps-text` | svg | core/svg.spec.ts | broken | passed |  |
| `lines.connector.perpendicular-at-sites` | lines | probe --core | broken | passed |  |
| `wordart.bar.closes` | wordart | probe --core | broken | passed |  |
| `wordart.polish.chip-weight-arming` | wordart | probe --core | broken | passed |  |
| `images.insert.no-external-banner` | images | core/images.spec.ts | broken | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m |
| `shaders.frame.large-png-lands` | shaders | core/shaders.spec.ts | broken | failed | Error: page.screenshot: Clipped area is either empty or outside the resulting image |
| `images.replace.keeps-aspect` | images | core/logos.spec.ts | broken | passed |  |
| `images.picture.no-plate` | images | core/logos.spec.ts | broken | passed |  |
| `logos.dialog.results-in-view` | logos | core/logos.spec.ts | broken | failed | Error: the dialog's height does not change |
| `images.panel.seller-words` | images | probe --core | broken | passed |  |
| `images.panel.drop-shadow` | images | probe --core | not driven | passed |  |
| `images.mask.picker-fits-panel` | images | probe --core | broken | passed |  |
| `images.caption.grows-box` | images | probe --core | broken | passed |  |
| `images.border.color-draws-at-once` | images | probe --core | broken | passed |  |
| `images.alt.focused-empty` | images | probe --core | broken | passed |  |
| `logos.dialog.sentence-case-whole-names` | logos | core/logos.spec.ts | broken | failed | Error: it lists under Recent |
| `shaders.gallery.words-and-head` | shaders | core/shaders.spec.ts | broken | passed |  |
| `shaders.insert.free-rectangle` | shaders | core/shaders.spec.ts | broken | failed | [31mTest timeout of 240000ms exceeded.[39m |
| `brand.panel.words-match-sheet` | brand | core/brand.spec.ts | broken | passed |  |
| `brand.template.blank-no-gt-mark` | brand | core/brand.spec.ts | broken | passed |  |
| `brand.template.blank-plain` | brand | core/brand.spec.ts | broken | passed |  |
| `images.byurl.preview-contained` | images | core/images.spec.ts | broken | passed |  |
| `svg.intake.long-comment` | svg | core/svg.spec.ts | broken | passed |  |
| `images.drop.clamped` | images | core/images.spec.ts | broken | passed |  |
| `images.crop.dims-outside` | images | probe --core | broken | passed |  |
| `images.polish.natural-size` | images | core/images.spec.ts | broken | passed |  |
| `chrome.plate.fits-viewport` | chrome | probe --core | broken | passed |  |
| `formatting.spacing.table-cells` | formatting | probe --core | broken | passed |  |
| `help.check-slides.plain-sentence` | help | probe --core | broken | failed | an empty 3 by 3 table on a slide of its own; Tools > Check slides: no slide |
| `slides.background.picture-grid` | slides | probe --core | broken | passed |  |
| `chrome.tail.reads-mode` | chrome | core/share.spec.ts | broken | passed |  |
| `menus.rows.icon-on-every-row` | chrome | probe --core | broken | passed |  |
| `chrome.snackbar.refusal-sentence` | chrome | probe --core | broken | passed |  |
| `chrome.handles.tooltip-words` | chrome | probe --core | broken | passed |  |
| `chrome.tooltips.only-on-hover` | chrome | probe --core | broken | passed |  |
| `chrome.chip.above-ring` | chrome | probe --core | broken | passed |  |
| `share.name-prompt.empty-field` | share | core/share.spec.ts | broken | failed | [31mTest timeout of 150000ms exceeded.[39m |
| `chrome.dialog.no-loading-jump` | chrome | probe --core | broken | passed |  |
| `chrome.dialog.focus-return-and-trap` | chrome | probe --core | broken | passed |  |
| `comments.insert.needs-selection` | comments | probe --core | broken | passed |  |
| `chrome.context.escape-closes-submenu` | chrome | probe --core | broken | passed |  |
| `share.dialog.ruled-rows` | share | core/share.spec.ts | broken | passed |  |
| `versions.panel.seam-and-time` | versions | core/chrome.spec.ts | broken | passed |  |
| `present.presenter.phone-head` | present | core/present.spec.ts | broken | passed |  |
| `chrome.title-row.phone` | chrome | core/chrome.spec.ts | broken | passed |  |
| `chrome.phone.menus-key` | chrome | core/chrome.spec.ts | not driven | passed |  |
| `chrome.title-row.name-after-first-write` | chrome | core/chrome.spec.ts | flaky | passed |  |
| `chrome.title-row.one-status` | chrome | core/chrome.spec.ts | broken | passed |  |
| `chrome.stage.deck-appearance` | chrome | core/chrome.spec.ts | broken | passed |  |
| `chrome.mark.one-product-mark` | chrome | core/chrome.spec.ts | broken | passed |  |
| `chrome.ai.no-sparkle` | chrome | core/chrome.spec.ts | broken | passed |  |
| `chrome.selection.gt-blue` | chrome | core/chrome.spec.ts | broken | passed |  |
| `chrome.scroll.no-smooth` | chrome | core/chrome.spec.ts | broken | passed |  |
| `formatting.border-weight.menu-opens` | formatting | probe --core | broken | passed |  |
| `chrome.toolbar.select-glyph` | chrome | probe --core | broken | passed |  |
| `chrome.words.one-spelling` | chrome | probe --core | broken | passed |  |
| `chrome.menus.one-logo-row` | chrome | core/chrome.spec.ts | broken | passed |  |
| `chrome.menus.preferences-named` | chrome | core/chrome.spec.ts | broken | passed |  |
| `chrome.menus.download-four-first` | chrome | core/chrome.spec.ts | broken | passed |  |
| `chrome.words.no-process-words` | chrome | core/chrome.spec.ts | broken | passed |  |
| `chrome.menus.structure-sweep` | chrome | probe --core | broken | passed |  |
| `decks.recent.keeps-new-deck` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.card.rename-everywhere` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.list.one-card-per-deck` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.list.own-and-shared` | decks | core/decks.spec.ts | broken | failed | Error: a fresh anonymous browser lists no presentation |
| `decks.list.action-scoped` | decks | core/decks.spec.ts | broken | failed | Error: the principal lists its own deck alone |
| `decks.manifest.paper` | decks | core/decks.spec.ts | broken | passed |  |
| `export.print.deck-appearance` | export | core/export.spec.ts | broken | passed |  |
| `share.dialog.new-deck-restricted-viewer` | share | core/share.spec.ts | broken | passed |  |
| `share.role-change.keeps-link` | share | core/share.spec.ts | broken | passed |  |
| `export.details.seller-card` | export | core/export.spec.ts | broken | passed |  |
| `decks.trash.leaves-at-once` | decks | core/decks.spec.ts | broken | passed |  |
| `export.refusal.sentence-and-retry` | export | core/export.spec.ts | broken | failed | [31mTest timeout of 240000ms exceeded.[39m |
| `export.print.opens` | export | core/export.spec.ts | broken | passed |  |
| `decks.card.title-ellipsis` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.card.download-powerpoint` | decks | core/decks.spec.ts | broken | passed |  |
| `export.download.one-name-rule` | export | core/export.spec.ts | broken | passed |  |
| `export.picture.progress-and-capture` | export | core/export.spec.ts | broken | failed | Error: the file within 4 s on an unchanged slide |
| `export.remove.copies-gone` | export | core/export.spec.ts | broken | passed |  |
| `decks.import.upload-drop-zone` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.back.list-restored` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.card.thumbnail-or-plate` | decks | core/decks.spec.ts | broken | passed |  |
| `versions.panel.rows-read-clean` | versions | core/documents.spec.ts | broken | passed |  |
| `versions.title-row.last-edit-inline` | versions | core/documents.spec.ts | broken | passed |  |
| `present.bar.no-dead-control` | present | core/present.spec.ts | broken | passed |  |
| `present.laser.visible` | present | core/present.spec.ts | broken | failed | Error: the drawn diameter is 14 px with its ring |
| `comments.marker.one-per-anchor` | comments | core/documents.spec.ts | broken | passed |  |
| `share.dialog.restricted-and-more` | share | core/share.spec.ts | broken | passed |  |
| `decks.trash.enter-confirms` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.card.rename-field-fits` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.trash.empty-not-primary` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.polish.pages-sweep` | decks | core/decks.spec.ts | broken | passed |  |
| `sync.slide.concurrent-add-both-kept` | sync | core/sync.spec.ts | broken | passed |  |
| `sync.title-row.save-words-truthful` | sync | core/sync.spec.ts | broken | passed |  |
| `sync.reject.sentence-below-toolbar` | sync | core/sync.spec.ts | broken | passed |  |
| `share.name-prompt.never-mid-drag` | share | core/share.spec.ts | broken | passed |  |
| `collab.follow.anonymous-editor` | share | core/share.spec.ts | not driven | passed |  |
| `present.link.first-paint-show` | present | core/present.spec.ts | broken | passed |  |
| `surface.skeleton.matches-editor` | surface | core/surface.spec.ts | broken | passed |  |
| `slides.filmstrip.follows-every-move` | slides | probe --core | broken | passed |  |
| `sync.write.5xx-keeps-document` | sync | core/sync.spec.ts | broken | passed |  |
| `sync.recovered.no-plate-for-held-writes` | sync | core/sync.spec.ts | broken | passed |  |
| `collab.presence.join-within-2s` | share | core/share.spec.ts | broken | passed |  |
| `decks.thumbnail.never-502` | decks | core/decks.spec.ts | broken | passed |  |
| `collab.polish.session-sweep` | share | core/share.spec.ts | broken | passed |  |
| `assist.panel.mode-aware` | assist | core/assist.spec.ts | broken | passed |  |
| `assist.tailor.one-pass` | assist | core/assist.spec.ts | broken | passed |  |
| `assist.snackbar.names-change` | assist | core/assist.spec.ts | broken | failed | Error: renewal became contract |
| `assist.panel.words-and-layout` | assist | core/assist.spec.ts | broken | passed |  |
| `assist.polish.agent-sweep` | assist | core/assist.spec.ts | broken | passed |  |
| `decks.home.pictures-three-widths` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.home.copy-rules` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.home.product-pictures` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.home.links-and-card` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.home.load-budget` | decks | core/decks.spec.ts | broken | failed | Error: ready 608 ms (budget 500) |
| `decks.home.layout-shift` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.home.grammar` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.home.capture-plain` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.home.copy` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.home.phone` | decks | core/decks.spec.ts | broken | passed |  |
| `decks.list.ruled-rows` | decks | core/decks.spec.ts | broken | passed |  |
| `chrome.buttons.one-rule` | chrome | core/chrome.spec.ts | broken | passed |  |
| `share.access.true-sentence` | share | core/share.spec.ts | broken | passed |  |
| `decks.og.deck-card` | decks | core/decks.spec.ts | broken | passed |  |
| `realtime.keystroke.within-300ms` | realtime | core/realtime.spec.ts | broken | passed |  |
| `realtime.caret.within-300ms` | realtime | core/realtime.spec.ts | broken | passed |  |
| `realtime.caret.offset-after-merge` | realtime | core/realtime.spec.ts | broken | passed |  |
| `realtime.selection.outline-within-300ms` | realtime | core/realtime.spec.ts | broken | passed |  |
| `realtime.block.drag-live` | realtime | core/realtime.spec.ts | broken | passed |  |
| `realtime.title.two-typers` | realtime | core/realtime.spec.ts | broken | failed | Error:  ub2 once, no word lost |
| `realtime.join.chip-within-1s` | realtime | core/realtime.spec.ts | broken | passed |  |
| `realtime.follow.for-everyone` | realtime | core/realtime.spec.ts | not driven | passed |  |
| `realtime.agent.write-announced` | realtime | e2e/agent-http.spec.ts | broken | passed |  |
| `realtime.share-link.every-instance` | realtime | core/share.spec.ts | flaky | passed |  |
| `realtime.reload.loses-nothing` | realtime | core/realtime.spec.ts | works | passed |  |
| `realtime.reconnect.loses-nothing` | realtime | core/realtime.spec.ts | works | passed |  |
| `realtime.pointer.second-browser` | realtime | core/realtime.spec.ts | not driven | passed |  |
| `realtime.caret.dims-and-leaves` | realtime | core/realtime.spec.ts | broken | passed |  |
| `realtime.card.chip-painted` | realtime | probe --core | broken | passed |  |
| `realtime.departed-guest.name-stable` | realtime | core/share.spec.ts | flaky | passed |  |
| `cost.redis.commands` | cost | cost-probe | not driven | not driven | no Redis URL (--redis-url, TURBOSLIDE_PROBE_REDIS_URL or REDIS_URL): INFO commandstats cannot be read |
| `accounts.decks-list-scoped` | share | e2e/accounts.spec.ts | not driven | not driven | no identity database on this base |
| `accounts.sign-out-clean` | share | e2e/accounts.spec.ts | not driven | not driven | no identity database on this base |
| `accounts.google-button` | share | e2e/accounts.spec.ts | not driven | not driven | no identity database on this base |
| `accounts.google-leaves` | share | e2e/accounts.spec.ts | not driven | not driven | no identity database on this base |
| `accounts.google-error-sentence` | share | e2e/accounts.spec.ts | not driven | not driven | no identity database on this base |
| `accounts.email-hidden-without-mail` | share | e2e/accounts.spec.ts | not driven | not driven | no identity database on this base |
| `accounts.google-roundtrip` | share | e2e/accounts.spec.ts | not driven | not driven | no identity database on this base |
| `accounts.no-dead-method` | share | core/share.spec.ts | broken | passed |  |
| `cost.do.requests` | cost | cost-probe | not driven | not driven | a do tier row; this run's tier is memory |
| `cost.do.duration` | cost | cost-probe | not driven | not driven | a do tier row; this run's tier is memory |
| `cost.do.rows-written` | cost | cost-probe | not driven | not driven | a do tier row; this run's tier is memory |
| `cost.d1.reads` | cost | cost-probe | not driven | not driven | a do tier row; this run's tier is memory |
| `cost.d1.writes` | cost | cost-probe | not driven | not driven | a do tier row; this run's tier is memory |
| `cost.worker.requests` | cost | cost-probe | not driven | not driven | a do tier row; this run's tier is memory |

## Not driven rows, by id and reason

- `text.clipboard.paste-without-formatting`: manual: headless Chromium does not synthesize Cmd+Shift+V as a paste; the step is docs/gslides-parity/focus/manual-checklist.md
- `tables.insert.grid`: setup failed: a slide for the tables
- `tables.cell.double-click-type`: setup failed: a slide for the tables
- `tables.cell.tab-from-written`: setup failed: a slide for the tables
- `tables.cell.tab-from-empty`: setup failed: a slide for the tables
- `tables.cell.shift-tab`: setup failed: a slide for the tables
- `tables.cell.tab-last-appends-row`: setup failed: a slide for the tables
- `tables.menu.format-table-with-session`: setup failed: a slide for the tables
- `tables.menu.format-table-selected`: setup failed: a slide for the tables
- `tables.menu.format-table-rows`: setup failed: a slide for the tables
- `tables.context.rows`: setup failed: a slide for the tables
- `tables.context.insert-delete`: setup failed: a slide for the tables
- `tables.column.insert-keeps-widths`: setup failed: a slide for the tables
- `tables.column.resize-seam`: setup failed: a slide for the tables
- `tables.cell.align-menu`: setup failed: a slide for the tables
- `tables.cell.align-toolbar`: setup failed: a slide for the tables
- `tables.select.resize`: setup failed: a slide for the tables
- `tables.cell.fill-border-tail`: setup failed: a slide for the tables
- `tables.cells.merge-unmerge`: setup failed: a slide for the tables
- `tables.tail.merge-unmerge-buttons`: setup failed: a slide for the tables
- `tables.distribute.rows-columns`: setup failed: a slide for the tables
- `tables.light-appearance`: setup failed: a slide for the tables
- `tables.present`: setup failed: a slide for the tables
- `tables.reload`: setup failed: a slide for the tables
- `decks.recent.this-browser-sentence`: not on this build: home.recent.sentence (docs/archive/rounds/PRODUCT.md 7.1, B1)
- `templates.deck.read-only`: no editor address opens the Blank template on this build (B5b)
- `brand.logo.use-on-every-slide`: not on this build: format.image.useOnEverySlide (docs/archive/rounds/PRODUCT.md 7.1, B5a); the picture's menu lists edit.cut, edit.copy, edit.paste, edit.delete, edit.duplicate, arrange.order, arrange.rotate, arrange.centerOnPage, arrange.align, format.image.replaceImage, format.image.cropImage, for
- `assist.quota.429`: not driven: the quota counts across instances only with Upstash and this base does not say which limiter it runs (GET /api/agent instance facts); the unit test apps/studio/src/server/ratelimit.test.ts covers the rows (PRODUCT.md 8.2)
- `sync.resend.idempotent`: not on this build: version.list answers no origin (packages/store/src/versions.ts toVersion drops the record's origin on every tier; docs/archive/rounds/SYNC.md 3.2 names it on the record, the sync owner's); the word landed once in both browsers; records above 2: 1 (the memory tier's checkpointer wr
- `cost.editor-hidden.calls`: document.visibilityState read "visible" after a second page was brought to the front (headless Chromium reports no hidden page), so the hidden state was not reached
- `tables.cell.click-places-caret`: setup failed: a slide for the tables
- `tables.cell.click-then-type`: setup failed: a slide for the tables
- `tables.range.drag-from-selected`: setup failed: a slide for the tables
- `tables.selected.typing-appends`: setup failed: a slide for the tables
- `tables.cell.arrows-cross-cells`: setup failed: a slide for the tables
- `tables.range.shift-arrows`: setup failed: a slide for the tables
- `tables.range.bold-italic`: setup failed: a slide for the tables
- `tables.range.size-color`: setup failed: a slide for the tables
- `tables.panel.table-first`: setup failed: a slide for the tables
- `tables.seam.row-drag`: setup failed: a slide for the tables
- `tables.edge.add-row-column`: setup failed: a slide for the tables
- `tables.heads.select-row-column`: setup failed: a slide for the tables
- `tables.bar.row-column-buttons`: setup failed: a slide for the tables
- `arrange.group.tail-text-controls`: not on this build: toolbar.group.text (docs/archive/rounds/PRODUCT.md 7.1, B3); chip "Group"; the group tail lists toolbar.fillColor, toolbar.borderColor, toolbar.borderWeight, toolbar.borderDash, toolbar.formatOptions and none of the text controls (P1, FEATURES.md 2.3 item 6)
- `tables.command.keeps-caret`: setup failed: a slide for the tables
- `tables.cells.tabular-figures`: setup failed: a slide for the tables
- `fonts.picker.specimen-rows`: not on this build: the specimen rows of the Font dropdown (docs/archive/rounds/FEATURES.md 3.5, P1, B1 with B2)
- `fonts.table.takes-family`: not on this build: toolbar.font (docs/archive/rounds/PRODUCT.md 7.1, B1); the Font control on a selected table is drawn disabled ("Inter"); takesFamily is P1 (FEATURES.md 3.5)
- `logos.index.refresh-fixture`: not driven: the index reads network, not the ten mark fixture (TURBOSLIDE_LOGO_UPSTREAM=fixture on a preview); the unit tests apps/studio/src/server/logos.test.ts cover the 404 marking and the takedown (docs/archive/rounds/FEATURES.md 7.3)
- `logos.index.cached-offline`: not driven: the index reads network, not the outage (TURBOSLIDE_LOGO_UPSTREAM=down on a preview); the unit test apps/studio/src/server/logos.test.ts covers the cache during an outage (docs/archive/rounds/FEATURES.md 7.3)
- `logos.picker.variants`: not on this build: dialog.logo.kind.wordmark (docs/archive/rounds/PRODUCT.md 7.1, B1); no Symbol, Wordmark, Color or Mono control in the dialog head (P1, FEATURES.md 4.11; the appearance rule chooses)
- `logos.kit.find-a-logo`: not on this build: panel.brand.logo.find (docs/archive/rounds/PRODUCT.md 7.1, B6); no Find a logo beside Replace in the Brand kit panel's Logo section (P1, FEATURES.md 4.5)
- `shaders.background.add-to-theme`: not on this build: dialog.background.shader.addToTheme (docs/archive/rounds/PRODUCT.md 7.1, B1 (dialogs/Background.tsx)); no Add to theme row beside the Shader row (P1, FEATURES.md 5.2 item 1)
- `shaders.library.glyph-engines-render`: not on this build: dialog.shader.engine.glyph (docs/archive/rounds/FEATURES.md 5.2 item 2, B5, P1); the catalog lists none of proto:studio-field, glyph:mesh-gradient, glyph:dither-gradient
- `shaders.frame.scrubber-capture`: not on this build: formatOptions.shader.frame.scrubber (docs/archive/rounds/PRODUCT.md 7.1, B5 (inspector/shader.tsx)); no Frame scrubber in the Shader section (P1, FEATURES.md 5.2 item 3)
- `shaders.show.plays-when-on`: not on this build: formatOptions.shader.play and the show's ShaderLayer (packages/viewer/src/present/ShaderLayer.tsx; docs/archive/rounds/FEATURES.md 5.6, B5 with B1, P1); the show draws the frame until they land
- `shaders.show.frame-when-off`: not on this build: formatOptions.shader.play and the show's ShaderLayer (packages/viewer/src/present/ShaderLayer.tsx; docs/archive/rounds/FEATURES.md 5.6, B5 with B1, P1); the show draws the frame until they land
- `tables.select.ring-with-cell-open`: setup failed: a slide for the tables
- `tables.cell.ring-on-cell`: setup failed: a slide for the tables
- `tables.cells.empty-grid-guides`: setup failed: a slide for the tables
- `tables.light-appearance-guides`: setup failed: a slide for the tables
- `tables.insert.box-fits-rows`: setup failed: a slide for the tables
- `tables.rows.grow-with-text`: setup failed: a slide for the tables
- `tables.resize.rows-share-extra`: setup failed: a slide for the tables
- `tables.seam.visible-with-cell-open`: setup failed: a slide for the tables
- `tables.heads.header-toggle`: setup failed: a slide for the tables
- `tables.panel.section-words`: setup failed: a slide for the tables
- `people.verified-badge`: no identity database on this base
- `people.versions-author-account`: no identity database on this base
- `people.labels-disambiguated`: no identity database on this base
- `share.dialog.grant-email-line`: no identity database on this base
- `people.avatar-upload`: no identity database on this base
- `people.avatar-cap-refusal`: no identity database on this base
- `people.avatar-rotation`: no identity database on this base
- `people.avatar-fallback-plate`: no identity database on this base
- `people.avatar-link-visitor`: no identity database on this base
- `people.avatar-metadata-stripped`: no identity database on this base
- `cost.redis.commands`: no Redis URL (--redis-url, TURBOSLIDE_PROBE_REDIS_URL or REDIS_URL): INFO commandstats cannot be read
- `accounts.decks-list-scoped`: no identity database on this base
- `accounts.sign-out-clean`: no identity database on this base
- `accounts.google-button`: no identity database on this base
- `accounts.google-leaves`: no identity database on this base
- `accounts.google-error-sentence`: no identity database on this base
- `accounts.email-hidden-without-mail`: no identity database on this base
- `accounts.google-roundtrip`: no identity database on this base
- `cost.do.requests`: a do tier row; this run's tier is memory
- `cost.do.duration`: a do tier row; this run's tier is memory
- `cost.do.rows-written`: a do tier row; this run's tier is memory
- `cost.d1.reads`: a do tier row; this run's tier is memory
- `cost.d1.writes`: a do tier row; this run's tier is memory
- `cost.worker.requests`: a do tier row; this run's tier is memory

## Failed rows, by id and reason

- `images.resize.eight-handles`: drag each of the eight handles plain: FAIL nw plain: 411,250 240x160 -> 351,210 300x200 (ratio 1.500 -> 1.500); readout during "300 × 200", after none; chip "Image" -> "Image"; undo restored false \| FAIL n plain: 351,210 300x200 -> 351,170 300x240 (expected 351,170 300x240); readout during "300 × 2
- `images.resize.eight-handles-shift`: drag each of the eight handles with Shift: FAIL nw shift: 231,129 605x401 -> 171,89 665x441 (ratio 1.509 -> 1.508); readout during "665 × 441", after none; chip "Image" -> "Image"; undo restored false \| FAIL n shift: 171,89 665x441 -> 171,49 725x481 (ratio 1.508 -> 1.507); readout during "725 × 481
- `images.resize.alt-centre`: a drag with Alt on the se handle: se alt: 56,9 1080x718 -> -4,-35 1200x806 (ratio 1.504 -> 1.489, centre kept); readout during "1200 × 806", after none; chip "Image" -> "Image"; undo restored false
- `images.rotate.ring`: drag the ring about 35 degrees: rotate 35; readout during "35°", after none; after undo 35
- `images.crop.redo`: Cmd+Shift+Z: 400,250 240x160
- `arrange.clipboard.menu-copy-paste`: Edit > Copy then Edit > Paste on a clean stage: 3 -> 3
- `arrange.redo.after-undone-duplicate`: Cmd+D, Cmd+Z, then Cmd+Shift+Z (Cmd+Y, the toolbar Redo, Edit > Redo when needed): Cmd+Shift+Z: nothing; Cmd+Y: nothing; toolbar Redo: nothing; Edit > Redo: nothing; toolbar Redo aria-disabled true
- `shapes.fill.colour`: the toolbar Fill color: a swatch, then a hex value; Undo: fill rgba(242, 242, 240, 0.05) -> rgb(47, 92, 224) (stored blue true) -> rgb(170, 51, 102); after two undos rgb(47, 92, 224)
- `shapes.border.colour-weight-dash`: the toolbar Border color, Border weight and Border dash, then Format > Borders & lines; Undo: colour rgb(242, 242, 240) -> rgb(229, 72, 77); weight 1px -> 2px (menu.toolbar.borderWeight.weight-2); dash none -> 8px, 6px (toolbar.borderDash.pick.dash); Format > Borders & lines > Border color (plate fo
- `lines.tail.colour-weight-dash-ends`: the line toolbar's Line color, Line weight, Line dash, Line start and Line end; Undo: colour rgb(242, 242, 240) -> rgb(229, 72, 77); weight 1px -> 1.5px (menu.toolbar.lineWeight.line-1.5); dash none -> 6px, 4.5px (toolbar.lineDash.pick.dash); start true (toolbar.lineStart.pick.fillCircle); end true 
- `versions.undo-restore`: Restore an earlier version, then Cmd+Z: restore wrote true (revision 559 -> 560) and changed the deck true (read after 151 ms of a 35 s bound; versionHistory.499.restore; snackbar Saved the version Before the customer copy; panel notice Restored the version of Oct 3, 10:51 PM; state.error none); Cmd
- `shapes.borders-lines.menu`: select the rectangle; Format > Borders & lines > Border color, a red swatch; Border dash > Dot; Cmd+Z each: swatch format.bordersLines.borderColor.red: stroke rgb(229, 72, 77) -> rgb(229, 72, 77) -> Cmd+Z rgb(229, 72, 77); Dot: dash none -> 2px, 4px; block restored true
- `lines.connector.elbow`: Insert > Line > Elbow connector dragged from A's right site to B's left site; B moved by 150 px: the two rectangles were not placed
- `lines.connector.curved`: Insert > Line > Curved connector dragged from A's right site to B's left site; B moved by 150 px: the two rectangles were not placed
- `lines.connector.re-end`: a third rectangle C; select the elbow connector, drag its end handle from B's site to C's left site; move C: no elbow connector to re-end
- `lines.tail.line-start-end-menu`: select the line; Format > Borders & lines > Line start > Arrow, Cmd+Z; Line end > None, Cmd+Z: Line start > Arrow: start field true (drawn parts 2 -> 3), Cmd+Z restored true; Line end > Arrow then None: arrow true -> false (drawn parts 2); two Cmd+Z restored false
- `charts.export.pdf`: Error: North is in the PDF text
- `formatting.align.justified-chord`: select the box, Cmd+Shift+J: align null -> justify (drawn justify); after Cmd+Z justify
- `arrange.distribute.horizontal`: three objects selected, Arrange > Distribute > Horizontally; Cmd+Z: error: Cannot read properties of null (reading 'free')
- `arrange.distribute.vertical`: three objects selected, Arrange > Distribute > Vertically; Cmd+Z: error: Cannot read properties of null (reading 'free')
- `arrange.group.chords`: a1 and a2 selected, Cmd+Option+G, ArrowRight twice, Cmd+Option+Shift+G; three Cmd+Z: chip "2 objects" -> "Group" (group group); x 152,600 -> 154,602; after ungroup undefined; 6 Cmd+Z returned the start false
- `arrange.group.menu-regroup`: Arrange > Group, Ungroup, Regroup; read the enabled states; Cmd+Z: enabled before {"group":true,"ungroup":false,"regroup":false}; Group -> group; enabled then {"group":true,"ungroup":true,"regroup":false}; Ungroup -> undefined; enabled then {"group":false,"ungroup":false,"regroup":false}; Regroup ->
- `arrange.context.rotate-distribute`: right click a shape, a text block and a line: Rotate > Rotate clockwise 90 on each (Cmd+Z each); three selected, right click one, Distribute > Horizontally: error: Cannot read properties of null (reading 'free')
- `arrange.snap.guides-on-off`: drop a1 4 px short of the guide at 1000 with Snap to > Guides on, then off: guide at 1001; aimed 997: with Snap to guides on landed 152; off landed 997
- `versions.show-changes-marks`: a heading edit and an added box after the named version; pick the older version with Show changes on; then off: picked versionHistory.560.pick (named row versionHistory.560.pick); marks with Show changes on 0 (); off 0
- `inbox.bell-panel-toggle`: click the bell; read the panel; click the bell again: with the switch on; panel open true (aria-pressed true); words "NotificationsMark all readNothing newNotification settings"; Mark all read true; settings link true; panel still open after the second click true (aria-pressed true)
- `templates.gallery.page`: TimeoutError: browserContext.waitForEvent: Timeout 20000ms exceeded while waiting for event "page"
- `text.select.shift-home-line`: a three line paragraph in a narrow box; End; Shift+Home: the narrow box was not placed
- `assist.tailor.dialog-one-undo`: Tools > Tailor for a customer: Acme to Globex, skip the pricing slide, Apply; Cmd+Z: count "6 places on 5 slides" (acme at blank-1-38b4/slots/main/0/id, blank-1-38b4/slots/main/0/text, blank-2-38b4/slots/main/0/id, blank-2-38b4/slots/main/0/text, split-1-bf53/slots/main/6/id, split-1-bf53/slots/main
- `assist.rewrite.card-accept-undo`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m
- `assist.notes.draft`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m
- `assist.free-ask.fallback-sentence`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m
- `assist.mark.chip-and-history`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m
- `assist.viewer.disabled`: Error: the viewer sees the disabled panel with its sentence
- `assist.agent.propose-accept`: assist.propose over HTTP, assist.accept with the card, then the card with one byte changed: assist.propose answered 401 {"error":{"name":"ModelCallError","status":401,"message":"The assistant’s model answered 401","action":"assist.propose"}}
- `sync.title.concurrent-both-kept`: Error: both words in both browsers in every round of three
- `cost.editor-editing.calls`: function requests 76.66 a minute over 75
- `brand.objects.kit-colours-first`: the table cell's Fill color plate, the chart's series swatches, the text colour plate; a new chart's series: no table from the tables area to read
- `logos.picker.search`: Insert > Logo; type figma at human speed; Enter: 20 result tiles 5 ms after the last key (first fsharp active true; foot "Logos from thesvg.org as of 25 September 2026. Brand marks belong to their owners; use them to name the brand, not to imply endorsement"); Enter inserted shot logo 441,415 160x16
- `logos.picker.paper-and-ink`: search vercel; read the tile's paper and ink halves; Slide > Change theme light; insert; read the mark: no Vercel tile among 23 tiles
- `logos.picker.empty-state`: search zzqx; Upload; then General Translation: "zzqx" (5 ms): "no empty state"; Upload false, chooser opened false; "General Translation" (4 ms): "No logo named General Translation on thesvg.org. Upload a file, or ask the brand for its press kitYour brand kit’s logo is under Your brandUpload"; no ki
- `logos.picker.recents`: Error: figma is a result
- `logos.tailor.find-customer-logo`: a picture with alt Acme and a text naming Acme as setup; Tools > Tailor; From Acme, To Figma; Find the Figma logo; Apply; Cmd+Z: button "Find the Figma logo" with the mark drawn true; stored "The Figma logo is ready; Apply puts it where the old logo was"; Apply dialog.tailor.apply: picture asset acm
- `shaders.panel.preset-tiles`: read the Preset row's tiles; click a tile that is not pressed: 10 tiles ("Paper on ink", "Ink on paper", "Primary", "Accent", "Captions", "Hints", "Diamond" pressed, "Sphere", "Chrome", "Noir") against 10 presets of paper:liquid-metal; labels not in sentence case: none; click on formatOptions.shader
- `shaders.panel.kit-colours`: read the Colors row's swatches; brand.set /colors/<appearance>/primary '#0b3d91'; read the shader and its frame: the Primary swatch clicked (revision 649 -> 650); swatches text, background, caption, hint, primary, accent, custom (6 of the six roles); the sheet renders dark (deck.info and the chrome 
- `shaders.frame.auto-capture`: Error: the block has a frame asset after the recipe change
- `shaders.frame.box-aspect`: Error: a frame after the resize
- `shaders.frame.reuse-and-prune`: Error: the 1.2 frame
- `shaders.frame.one-capturer`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m
- `shaders.background.place-answers`: Slide > Change background on the body slide; Shader; a tile; Place; read the ground, the button and the dialog: chose Liquid metal; Place dialog.background.shader.place; the ground changed after 10223 ms (covering picture background, asset liquid-metal); the button read "Placing, 9 s" with the secon
- `shaders.export.missing-frame-row`: Error: the export started within 800 ms of the change
- `shaders.perf.editor-frame`: Error: under 150 ms
- `svg.import.upload`: Error: the asset reads kind 'svg'
- `svg.render.picture-gestures`: Error: every gesture writes, draws and undoes (move 400,200 -> 480,240 (true); se with Shift 360x240 -> 450x300 (aspect 1.500 -> 1.500, true); rotate 15 (true); mask ellipse drawn ellipse clip path("M 0 120 A 180 120 0 0 1 180 0 A 18 (true); border weight {"weight":2} drawn 2px (true); shadow {"colo
- `svg.copy.markup`: Error: text/plain begins with the prolog or <svg
- `svg.export.pptx-svgblip`: Error: the p:pic carries asvg:svgBlip inside a:extLst with the ext uri
- `svg.export.pptx-fallback`: Error: and whose IHDR width is the block's width times 3
- `svg.sanitize.script-and-handlers`: Error: no script
- `svg.sanitize.cap`: Error: nothing lands
- `svg.sanitize.broken`: Error: the sentence
- `lines.chip.kind-name`: select the elbow connector, the line, the arrow, the curved connector and rectangle A in turn; read the chip: the elbow connector: chip not on the slide (Elbow connector); the line: chip "Line" (Line); the arrow: chip "Arrow" (Arrow); the curved connector: chip not on the slide (Curved connector); r
- `text.paragraph.toolbar-live`: a two line text box; a session open with the caret in line 1; Center from the tail, then Double, then Increase indent: no text box
- `text.list.enter-tab-no-error`: a text box reading One; Bulleted list from the tail; the session opened at the end; Enter, "Two", Tab, Enter, "Three"; Escape; Cmd+Z until the box is back: listed true; items ["One","Two","Three"] (second nested true); error over the stage none; console 0; restored by Cmd+Z false (docs/archive/round
- `text.size.run-and-typed-value`: "Acme" selected in a 20 px text box; 36 typed into the size field, Enter: no text box
- `lines.select.handles-no-ring`: a line, an arrow and the curved connector each selected: po-line: no path; po-arrow: end handles 2, resize handles 0, ring none, chip -9.4/8.4 px from the start handle; po-curve: end handles 2, resize handles 0, ring none, chip -9.4/8.4 px from the start handle (docs/archive/rounds/POLISH.md 2.4 ite
- `images.insert.no-external-banner`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m
- `shaders.frame.large-png-lands`: Error: page.screenshot: Clipped area is either empty or outside the resulting image
- `logos.dialog.results-in-view`: Error: the dialog's height does not change
- `logos.dialog.sentence-case-whole-names`: Error: it lists under Recent
- `shaders.insert.free-rectangle`: [31mTest timeout of 240000ms exceeded.[39m
- `help.check-slides.plain-sentence`: an empty 3 by 3 table on a slide of its own; Tools > Check slides: no slide
- `share.name-prompt.empty-field`: [31mTest timeout of 150000ms exceeded.[39m
- `decks.list.own-and-shared`: Error: a fresh anonymous browser lists no presentation
- `decks.list.action-scoped`: Error: the principal lists its own deck alone
- `export.refusal.sentence-and-retry`: [31mTest timeout of 240000ms exceeded.[39m
- `export.picture.progress-and-capture`: Error: the file within 4 s on an unchanged slide
- `present.laser.visible`: Error: the drawn diameter is 14 px with its ring
- `assist.snackbar.names-change`: Error: renewal became contract
- `decks.home.load-budget`: Error: ready 608 ms (budget 500)
- `realtime.title.two-typers`: Error:  ub2 once, no word lost

## Tier rows this run did not judge (docs/CLOUDFLARE.md 2.3)

Listed apart with the reason "a do tier row; this run's tier is not named (no --tier)": judged by a run on their tier alone, never counted as passed and never a reason to park.

- `setup.worker.health`
- `setup.do.two-instances`
- `setup.free-plan.caps`
- `setup.do.memory`

## Local rows this run did not record (docs/archive/rounds/PEOPLE.md 6.2)

Driven by e2e/accounts.spec.ts on a node server with an identity database (`--only accounts`), never by a deployment run; listed apart with the reason "no identity database on this base", never counted as passed and never a reason to park.

- `people.verified-badge`
- `people.versions-author-account`
- `people.labels-disambiguated`
- `share.dialog.grant-email-line`
- `people.avatar-upload`
- `people.avatar-cap-refusal`
- `people.avatar-rotation`
- `people.avatar-fallback-plate`
- `people.avatar-link-visitor`
- `people.avatar-metadata-stripped`
- `accounts.decks-list-scoped`
- `accounts.sign-out-clean`
- `accounts.google-button`
- `accounts.google-leaves`
- `accounts.google-error-sentence`
- `accounts.email-hidden-without-mail`
- `accounts.google-roundtrip`

## Measurement rows, by id (PRODUCT.md 8.2; the cost rows of SYNC.md 6.1)

- `export.download.large-deck-pdf`: passed; recorded PDF: GT brand deck.pdf, 95 slides in 7.0 s, 0.07 s per slide; PDF: GT brand deck.pdf, 95 slides in 7.0 s, 0.07 s per slide
- `export.download.large-deck-pptx`: passed; recorded Editable text PowerPoint with Embed fonts: GT brand deck (editable).pptx, 95 slides in 71.8 s, 0.76 s per slide; Editable text PowerPoint with Embed fonts: GT brand deck (editable).pptx, 95 slides in 71.8 s, 0.76 s per slide
- `cost.editor-idle.calls`: passed; recorded tier memory; function requests 9.67 a minute (ceiling 12; 29 in 3 min); the store half reads zero on this base (the file store); the function requests alone are asserted (a cost row: over its ceiling on the preview it holds the ship)
- `cost.editor-hidden.calls`: not driven (document.visibilityState read "visible" after a second page was brought to the front (headless Chromium reports no hidden page), so the hidden state was not reached); recorded function requests 9.67 a minute and 9 session poll(s) were read from the tab that stayed visible (a cost row: over its ceiling on the preview it holds the ship)
- `cost.editor-editing.calls`: failed (function requests 76.66 a minute over 75); recorded tier memory; function requests 76.66 a minute (ceiling 75; 230 in 3 min); the store half reads zero on this base (the file store); the function requests alone are asserted (a cost row: over its ceiling on the preview it holds the ship)
- `cost.two-tabs-idle.calls`: passed; recorded tier memory; the store half reads zero on this base (the file store); the function requests alone are asserted (a cost row: over its ceiling on the preview it holds the ship)
- `cost.show.calls`: passed; recorded tier memory; function requests 0 in the window (ceiling 0); the store half reads zero on this base (the file store); the function requests alone are asserted (a cost row: over its ceiling on the preview it holds the ship)
- `shaders.perf.editor-frame`: failed (Error: under 150 ms); recorded longest animation frame 153.4 ms over 5 s with one shader on the stage (470 animation frames; rAF gaps; 1 canvas; renderer ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)); longest animation frame 153.4 ms over 5 s with one shader on the stage (470 an
- `decks.home.load-budget`: failed (Error: ready 608 ms (budget 500)); recorded first byte 11 ms (budget 150); LCP 152 ms on img[hero-dark] (budget 500, the hero picture or the h1); ready 608 ms (budget 500); images before the first scroll 216540 B (budget 300000); images after a full scroll 216540 B (budget 800000); document 72224 B (budget 60000); long animation frames over 1
- `cost.redis.commands`: not driven (no Redis URL (--redis-url, TURBOSLIDE_PROBE_REDIS_URL or REDIS_URL): INFO commandstats cannot be read); recorded function requests 73.64 a minute in the editing window were read from the page (a cost row: over its ceiling on the preview it holds the ship)
- `cost.do.requests`: not driven (a do tier row; this run's tier is memory); recorded tier memory; the page made 75.29 function requests a minute and 0 request(s) to the room host (0 socket open(s)) in the editing window (a cost row: over its ceiling on the preview it holds the ship)
- `cost.do.duration`: not driven (a do tier row; this run's tier is memory); recorded tier memory; the page made 75.29 function requests a minute and 0 request(s) to the room host (0 socket open(s)) in the editing window (a cost row: over its ceiling on the preview it holds the ship)
- `cost.do.rows-written`: not driven (a do tier row; this run's tier is memory); recorded tier memory; the page made 75.29 function requests a minute and 0 request(s) to the room host (0 socket open(s)) in the editing window (a cost row: over its ceiling on the preview it holds the ship)
- `cost.d1.reads`: not driven (a do tier row; this run's tier is memory); recorded tier memory; the page made 75.29 function requests a minute and 0 request(s) to the room host (0 socket open(s)) in the editing window (a cost row: over its ceiling on the preview it holds the ship)
- `cost.d1.writes`: not driven (a do tier row; this run's tier is memory); recorded tier memory; the page made 75.29 function requests a minute and 0 request(s) to the room host (0 socket open(s)) in the editing window (a cost row: over its ceiling on the preview it holds the ship)
- `cost.worker.requests`: not driven (a do tier row; this run's tier is memory); recorded tier memory; the page made 75.29 function requests a minute and 0 request(s) to the room host (0 socket open(s)) in the editing window (a cost row: over its ceiling on the preview it holds the ship)

