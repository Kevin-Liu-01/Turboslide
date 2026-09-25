# Core gate matrix

Base http://localhost:4417, started 2026-09-25T17:11:47.840Z, 338 s. 10 rows judged: 2 passed, 5 failed, 3 not driven (0 of them manual, the checklist's: none), 0 no step. Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): shaders.perf.editor-frame failed (longest animation frame 158.9 ms over 5 s with one shader on the stage (583 animation frames; rAF gaps; 1 canvas; renderer ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)); longest animation frame 158.9 ms over 5 s with one shader on the stage (583 animation frames; rAF gaps; 1 canvas; renderer ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver))). Cost rows over their ceiling in this run: none. Verdict failed; retries 0 configured, 0 test(s) retried; exit 1. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): none; rows whose own controls a ship would keep parked: shaders.frame.auto-capture (insert.shader); shaders.frame.box-aspect (insert.shader); shaders.frame.reuse-and-prune (insert.shader); shaders.frame.one-capturer (insert.shader); shaders.library.glyph-engines-render (dialog.shader.engine.glyph); shaders.show.plays-when-on (view.playShaders, formatOptions.shader.play); shaders.show.frame-when-off (view.playShaders); rows of an unparkable feature blocking the ship: none.

| Row | Feature | Driver | Today | Result | Reason |
| --- | --- | --- | --- | --- | --- |
| `shaders.frame.auto-capture` | shaders | core/shaders.spec.ts | broken | failed | Error: the block has a frame asset after the recipe change |
| `shaders.frame.box-aspect` | shaders | core/shaders.spec.ts | not driven | failed | Error: a frame after the resize |
| `shaders.frame.reuse-and-prune` | shaders | core/shaders.spec.ts | not driven | failed | Error: the 1.2 frame |
| `shaders.frame.one-capturer` | shaders | core/shaders.spec.ts | not driven | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m |
| `shaders.perf.hidden-pauses` | shaders | core/shaders.spec.ts | not driven | passed |  |
| `shaders.perf.editor-frame` | shaders | core/shaders.spec.ts | not driven | failed | Error: under 150 ms |
| `shaders.agent.list-insert-set-render` | shaders | core/shaders.spec.ts | not driven | passed |  |
| `shaders.library.glyph-engines-render` | shaders | core/shaders.spec.ts | not driven | not driven | not on this build: dialog.shader.engine.glyph (docs/FEATURES.md 5.2 item 2, B5, P1); the catalog lists none of proto:studio-field, glyph:mesh-gradient, glyph:dither-gradient |
| `shaders.show.plays-when-on` | shaders | core/shaders.spec.ts | broken | not driven | not on this build: formatOptions.shader.play and the show's ShaderLayer (packages/viewer/src/present/ShaderLayer.tsx; docs/FEATURES.md 5.6, B5 with B1, P1); the show draws the frame until they land |
| `shaders.show.frame-when-off` | shaders | core/shaders.spec.ts | not driven | not driven | not on this build: formatOptions.shader.play and the show's ShaderLayer (packages/viewer/src/present/ShaderLayer.tsx; docs/FEATURES.md 5.6, B5 with B1, P1); the show draws the frame until they land |

## Not driven rows, by id and reason

- `shaders.library.glyph-engines-render`: not on this build: dialog.shader.engine.glyph (docs/FEATURES.md 5.2 item 2, B5, P1); the catalog lists none of proto:studio-field, glyph:mesh-gradient, glyph:dither-gradient
- `shaders.show.plays-when-on`: not on this build: formatOptions.shader.play and the show's ShaderLayer (packages/viewer/src/present/ShaderLayer.tsx; docs/FEATURES.md 5.6, B5 with B1, P1); the show draws the frame until they land
- `shaders.show.frame-when-off`: not on this build: formatOptions.shader.play and the show's ShaderLayer (packages/viewer/src/present/ShaderLayer.tsx; docs/FEATURES.md 5.6, B5 with B1, P1); the show draws the frame until they land

## Failed rows, by id and reason

- `shaders.frame.auto-capture`: Error: the block has a frame asset after the recipe change
- `shaders.frame.box-aspect`: Error: a frame after the resize
- `shaders.frame.reuse-and-prune`: Error: the 1.2 frame
- `shaders.frame.one-capturer`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m
- `shaders.perf.editor-frame`: Error: under 150 ms

## Measurement rows, by id (PRODUCT.md 8.2; the cost rows of SYNC.md 6.1)

- `shaders.perf.editor-frame`: failed (Error: under 150 ms); recorded longest animation frame 158.9 ms over 5 s with one shader on the stage (583 animation frames; rAF gaps; 1 canvas; renderer ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)); longest animation frame 158.9 ms over 5 s with one shader on the stage (583 an

