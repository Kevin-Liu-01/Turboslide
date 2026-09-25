# Core gate matrix

Base http://localhost:4418, started 2026-09-24T21:52:43.872Z, 619 s. 27 rows judged: 18 passed, 6 failed, 3 not driven (0 of them manual, the checklist's: none), 0 no step. Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): shaders.perf.editor-frame passed (longest animation frame 80.3 ms over 5 s with one shader on the stage (535 animation frames; long-animation-frame; 1 canvas; renderer ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)); longest animation frame 80.3 ms over 5 s with one shader on the stage (535 animation frames; long-animation-frame; 1 canvas; renderer ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver))). Cost rows over their ceiling in this run: none. Verdict failed; retries 0 configured, 0 test(s) retried; exit 1. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): assist; rows whose own controls a ship would keep parked: logos.index.cached-offline (insert.logo); shaders.frame.auto-capture (insert.shader); shaders.frame.box-aspect (insert.shader); shaders.frame.reuse-and-prune (insert.shader); shaders.frame.one-capturer (insert.shader); shaders.library.glyph-engines-render (dialog.shader.engine.glyph); shaders.show.plays-when-on (view.playShaders, formatOptions.shader.play); shaders.show.frame-when-off (view.playShaders); rows of an unparkable feature blocking the ship: none.

| Row | Feature | Driver | Today | Result | Reason |
| --- | --- | --- | --- | --- | --- |
| `slides.layout.plate-four-columns` | slides | core/chrome.spec.ts | broken | passed |  |
| `share.dialog.more-row` | share | core/chrome.spec.ts | broken | passed |  |
| `chrome.toolbar.fold-any-width` | chrome | core/chrome.spec.ts | broken | passed |  |
| `assist.rewrite.card-accept-undo` | assist | core/assist.spec.ts | not driven | passed |  |
| `assist.notes.draft` | assist | core/assist.spec.ts | not driven | passed |  |
| `assist.free-ask.fallback-sentence` | assist | core/assist.spec.ts | not driven | passed |  |
| `assist.mark.chip-and-history` | assist | core/assist.spec.ts | not driven | passed |  |
| `assist.quota.429` | assist | core/assist.spec.ts | not driven | not driven | not driven: the quota counts across instances only with Upstash and this base does not say which limiter it runs (GET /api/agent instance facts); the unit test apps/studio/src/server/ratelimit.test.ts covers the rows (PRODUCT.md 8.2) |
| `logos.picker.recents` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.picker.chrome-1280` | logos | core/chrome.spec.ts | not driven | passed |  |
| `logos.route.mark-headers` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.index.refresh-dry-run` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.index.refresh-fixture` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.index.cached-offline` | logos | core/logos.spec.ts | not driven | not driven | not driven: the index reads fixture, not the outage (TURBOSLIDE_LOGO_UPSTREAM=down on a preview); the unit test apps/studio/src/server/logos.test.ts covers the cache during an outage (docs/FEATURES.md 7.3) |
| `logos.cache.open-licence-only` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.agent.search-insert` | logos | core/logos.spec.ts | not driven | passed |  |
| `shaders.panel.section-groups` | shaders | core/chrome.spec.ts | broken | passed |  |
| `shaders.frame.auto-capture` | shaders | core/shaders.spec.ts | broken | failed | Error: the block has a frame asset after the recipe change |
| `shaders.frame.box-aspect` | shaders | core/shaders.spec.ts | not driven | failed | Error: a frame after the resize |
| `shaders.frame.reuse-and-prune` | shaders | core/shaders.spec.ts | not driven | failed | Error: the 1.2 frame |
| `shaders.frame.one-capturer` | shaders | core/shaders.spec.ts | not driven | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m |
| `shaders.perf.hidden-pauses` | shaders | core/shaders.spec.ts | not driven | passed |  |
| `shaders.perf.editor-frame` | shaders | core/shaders.spec.ts | not driven | passed |  |
| `shaders.agent.list-insert-set-render` | shaders | core/shaders.spec.ts | not driven | passed |  |
| `shaders.library.glyph-engines-render` | shaders | core/shaders.spec.ts | not driven | not driven | not on this build: dialog.shader.engine.glyph (docs/FEATURES.md 5.2 item 2, B5, P1); the catalog lists none of proto:studio-field, glyph:mesh-gradient, glyph:dither-gradient |
| `shaders.show.plays-when-on` | shaders | core/shaders.spec.ts | broken | failed | Error: one canvas in the show |
| `shaders.show.frame-when-off` | shaders | core/shaders.spec.ts | not driven | failed | Error: the frame is shown |

## Not driven rows, by id and reason

- `assist.quota.429`: not driven: the quota counts across instances only with Upstash and this base does not say which limiter it runs (GET /api/agent instance facts); the unit test apps/studio/src/server/ratelimit.test.ts covers the rows (PRODUCT.md 8.2)
- `logos.index.cached-offline`: not driven: the index reads fixture, not the outage (TURBOSLIDE_LOGO_UPSTREAM=down on a preview); the unit test apps/studio/src/server/logos.test.ts covers the cache during an outage (docs/FEATURES.md 7.3)
- `shaders.library.glyph-engines-render`: not on this build: dialog.shader.engine.glyph (docs/FEATURES.md 5.2 item 2, B5, P1); the catalog lists none of proto:studio-field, glyph:mesh-gradient, glyph:dither-gradient

## Failed rows, by id and reason

- `shaders.frame.auto-capture`: Error: the block has a frame asset after the recipe change
- `shaders.frame.box-aspect`: Error: a frame after the resize
- `shaders.frame.reuse-and-prune`: Error: the 1.2 frame
- `shaders.frame.one-capturer`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m
- `shaders.show.plays-when-on`: Error: one canvas in the show
- `shaders.show.frame-when-off`: Error: the frame is shown

## Measurement rows, by id (PRODUCT.md 8.2; the cost rows of SYNC.md 6.1)

- `shaders.perf.editor-frame`: passed; recorded longest animation frame 80.3 ms over 5 s with one shader on the stage (535 animation frames; long-animation-frame; 1 canvas; renderer ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)); longest animation frame 80.3 ms over 5 s with one shader on the sta

