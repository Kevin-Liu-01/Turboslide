# Core gate matrix

Base https://turboslide-1ncbsb9tb-kl01s-projects.vercel.app, started 2026-09-25T06:39:53.285Z, 691 s. 54 rows judged: 39 passed, 3 failed, 12 not driven (0 of them manual, the checklist's: none), 0 no step. Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): none judged. Cost rows over their ceiling in this run: none. Verdict failed with the committed parked list inbox, templates and the parked rows arrange.group.tail-text-controls, logos.kit.find-a-logo, logos.picker.variants, tables.bar.row-column-buttons, tables.edge.add-row-column, tables.heads.select-row-column, tables.seam.row-drag, versions.show-changes-marks, view.live-pointers.second-browser, wordart.tail.fill-outline; retries 0 configured, 0 test(s) retried; exit 1. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): inbox, brand, fonts, templates, assist; rows whose own controls a ship would keep parked: view.live-pointers.second-browser (view.livePointers.mine, view.livePointers.collaborators); templates.save.as-template (file.saveAsTemplate); templates.save.same-name-replaces (file.saveAsTemplate); templates.card.rename-and-delete (templates.card.menu); templates.default.use-for-new (panel.brand.template.useForNew); logos.index.cached-offline (insert.logo); rows of an unparkable feature blocking the ship: none.

| Row | Feature | Driver | Today | Result | Reason |
| --- | --- | --- | --- | --- | --- |
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
| `comments.reaches-second-browser` | comments | core/share.spec.ts | not driven | passed |  |
| `versions.restore` | versions | core/share.spec.ts | flaky | passed |  |
| `view.live-pointers.second-browser` | view | core/share.spec.ts | not driven | failed | Error: the second browser's pointer is drawn on the first within 10 s |
| `inbox.notification-arrives` | inbox | core/share.spec.ts | not driven | failed | Error: the first browser's bell shows a count of 1 within 10 s |
| `collab.roster.go-to-slide` | share | core/share.spec.ts | works | passed |  |
| `share.dialog.one-link` | share | core/share.spec.ts | broken | passed |  |
| `share.dialog.slideshow-checkbox` | share | core/share.spec.ts | not driven | passed |  |
| `share.dialog.you-label` | share | core/share.spec.ts | broken | passed |  |
| `share.name-prompt.first-share` | share | core/share.spec.ts | not driven | passed |  |
| `share.dialog.co-edit-from-copied-link` | share | core/share.spec.ts | broken | passed |  |
| `templates.save.as-template` | templates | core/brand.spec.ts | not driven | failed | TimeoutError: page.waitForURL: Timeout 30000ms exceeded. |
| `templates.save.same-name-replaces` | templates | core/brand.spec.ts | not driven | not driven | skipped |
| `templates.card.rename-and-delete` | templates | core/brand.spec.ts | not driven | not driven | skipped |
| `templates.default.use-for-new` | templates | core/brand.spec.ts | not driven | not driven | skipped |
| `templates.deck.read-only` | templates | core/brand.spec.ts | not driven | not driven | skipped |
| `brand.logo.replace-every-slide` | brand | core/brand.spec.ts | not driven | not driven | skipped |
| `brand.colors.collab-rerender` | brand | core/share.spec.ts | not driven | passed |  |
| `brand.surfaces.viewer-and-show` | brand | core/share.spec.ts | not driven | passed |  |
| `fonts.budget.no-load-before-ready` | fonts | core/brand.spec.ts | not driven | not driven | skipped |
| `assist.rewrite.card-accept-undo` | assist | core/assist.spec.ts | not driven | passed |  |
| `assist.notes.draft` | assist | core/assist.spec.ts | not driven | passed |  |
| `assist.free-ask.fallback-sentence` | assist | core/assist.spec.ts | not driven | passed |  |
| `assist.mark.chip-and-history` | assist | core/assist.spec.ts | not driven | passed |  |
| `assist.quota.429` | assist | core/assist.spec.ts | not driven | not driven | not driven: the quota counts across instances only with Upstash and this base does not say which limiter it runs (GET /api/agent instance facts); the unit test apps/studio/src/server/ratelimit.test.ts covers the rows (PRODUCT.md 8.2) |
| `assist.viewer.disabled` | assist | core/share.spec.ts | not driven | passed |  |
| `fonts.inter.italic-release` | fonts | core/brand.spec.ts | broken | not driven | skipped |
| `fonts.picker.specimen-rows` | fonts | core/brand.spec.ts | not driven | not driven | skipped |
| `fonts.picker.recent-group` | fonts | core/brand.spec.ts | not driven | not driven | skipped |
| `fonts.preload.italic-on-edit-only` | fonts | core/brand.spec.ts | not driven | not driven | skipped |
| `logos.picker.recents` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.route.mark-headers` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.index.refresh-dry-run` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.index.refresh-fixture` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.index.cached-offline` | logos | core/logos.spec.ts | not driven | not driven | not driven: the index reads fixture, not the outage (TURBOSLIDE_LOGO_UPSTREAM=down on a preview); the unit test apps/studio/src/server/logos.test.ts covers the cache during an outage (docs/FEATURES.md 7.3) |
| `logos.cache.open-licence-only` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.agent.search-insert` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.export.svgblip` | logos | core/logos.spec.ts | not driven | passed |  |

## Not driven rows, by id and reason

- `templates.save.same-name-replaces`: skipped
- `templates.card.rename-and-delete`: skipped
- `templates.default.use-for-new`: skipped
- `templates.deck.read-only`: skipped
- `brand.logo.replace-every-slide`: skipped
- `fonts.budget.no-load-before-ready`: skipped
- `assist.quota.429`: not driven: the quota counts across instances only with Upstash and this base does not say which limiter it runs (GET /api/agent instance facts); the unit test apps/studio/src/server/ratelimit.test.ts covers the rows (PRODUCT.md 8.2)
- `fonts.inter.italic-release`: skipped
- `fonts.picker.specimen-rows`: skipped
- `fonts.picker.recent-group`: skipped
- `fonts.preload.italic-on-edit-only`: skipped
- `logos.index.cached-offline`: not driven: the index reads fixture, not the outage (TURBOSLIDE_LOGO_UPSTREAM=down on a preview); the unit test apps/studio/src/server/logos.test.ts covers the cache during an outage (docs/FEATURES.md 7.3)

## Failed rows, by id and reason

- `view.live-pointers.second-browser`: Error: the second browser's pointer is drawn on the first within 10 s
- `inbox.notification-arrives`: Error: the first browser's bell shows a count of 1 within 10 s
- `templates.save.as-template`: TimeoutError: page.waitForURL: Timeout 30000ms exceeded.

