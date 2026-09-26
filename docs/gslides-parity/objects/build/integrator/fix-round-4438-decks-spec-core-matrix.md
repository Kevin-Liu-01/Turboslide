# Core gate matrix

Base http://localhost:4438, started 2026-09-26T15:09:08.595Z, 186 s. 51 rows judged: 50 passed, 1 failed, 0 not driven (0 of them manual, the checklist's: none), 0 no step. Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): none judged. Cost rows over their ceiling in this run: none. Verdict ok with the committed parked list inbox, templates and the parked rows arrange.group.tail-text-controls, logos.kit.find-a-logo, logos.picker.variants, tables.bar.row-column-buttons, tables.edge.add-row-column, tables.heads.select-row-column, tables.seam.row-drag, versions.show-changes-marks, view.live-pointers.second-browser, wordart.tail.fill-outline; retries 0 configured, 0 test(s) retried; exit 0. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): none; rows whose own controls a ship would keep parked: templates.gallery.page (home.gallery, file.new.templateGallery); rows of an unparkable feature blocking the ship: none.

| Row | Feature | Driver | Today | Result | Reason |
| --- | --- | --- | --- | --- | --- |
| `decks.home.new-presentation` | decks | core/decks.spec.ts | works | passed |  |
| `decks.home.your-presentations` | decks | core/decks.spec.ts | works | passed |  |
| `decks.root.redirect` | decks | core/decks.spec.ts | works | passed |  |
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
| `decks.file.template-gallery` | decks | core/decks.spec.ts | works | passed |  |
| `decks.file.open-upload-bundle` | decks | core/decks.spec.ts | works | passed |  |
| `decks.file.import-slides-bundle` | decks | core/decks.spec.ts | works | passed |  |
| `help.improve-link` | help | core/decks.spec.ts | works | passed |  |
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
| `chrome.appearance.first-visit-follows-os` | chrome | core/decks.spec.ts | broken | passed |  |
| `brand.appearance.default` | brand | core/decks.spec.ts | broken | passed |  |

## Not driven rows, by id and reason


## Failed rows, by id and reason

- `templates.gallery.page`: TimeoutError: locator.waitFor: Timeout 6000ms exceeded.

