# Core gate matrix

Base https://turboslide-la4qb4vqm-kl01s-projects.vercel.app, started 2026-09-30T12:59:19.101Z, 211 s. 14 rows judged: 11 passed, 1 failed, 2 not driven (0 of them manual, the checklist's: none), 0 no step. Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): none judged. Cost rows over their ceiling in this run: none. Verdict ok with the committed parked list inbox, templates and the parked rows arrange.group.tail-text-controls, logos.kit.find-a-logo, logos.picker.variants, shaders.background.add-to-theme, shaders.background.place-answers, shaders.frame.scrubber-capture, shaders.library.glyph-engines-render, svg.copy.markup, tables.bar.row-column-buttons, versions.show-changes-marks, view.live-pointers.second-browser; retries no specs run; exit 0. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): none; rows whose own controls a ship would keep parked: shaders.background.place-answers (dialog.background.shader); shaders.background.add-to-theme (dialog.background.shader.addToTheme); shaders.frame.scrubber-capture (formatOptions.shader.frame.scrubber, formatOptions.shader.frame.capture); rows of an unparkable feature blocking the ship: none.

| Row | Feature | Driver | Today | Result | Reason |
| --- | --- | --- | --- | --- | --- |
| `shaders.insert.gallery-thumbnails` | shaders | probe --core | not driven | passed |  |
| `shaders.insert.selected-free-rectangle` | shaders | probe --core | broken | passed |  |
| `shaders.insert.words` | shaders | probe --core | broken | passed |  |
| `shaders.panel.slider-live-undo` | shaders | probe --core | not driven | passed |  |
| `shaders.panel.preset-tiles` | shaders | probe --core | broken | passed |  |
| `shaders.panel.control-sentences` | shaders | probe --core | not driven | passed |  |
| `shaders.panel.kit-colours` | shaders | probe --core | not driven | passed |  |
| `shaders.panel.one-home` | shaders | probe --core | broken | passed |  |
| `shaders.background.place-answers` | shaders | probe --core | broken | failed | Slide > Change background on the body slide; Shader; a tile; Place; read the ground, the button and the dialog: chose Liquid metal; Place dialog.background.shader.place; the ground changed after 25186 ms (covering picture background, asset liquid-metal); the button read "Placing, 18 s" with the seco |
| `shaders.perf.one-context` | shaders | probe --core | not driven | passed |  |
| `shaders.background.add-to-theme` | shaders | probe --core | not driven | not driven | not on this build: dialog.background.shader.addToTheme (docs/PRODUCT.md 7.1, B1 (dialogs/Background.tsx)); no Add to theme row beside the Shader row (P1, FEATURES.md 5.2 item 1) |
| `shaders.frame.scrubber-capture` | shaders | probe --core | not driven | not driven | not on this build: formatOptions.shader.frame.scrubber (docs/PRODUCT.md 7.1, B5 (inspector/shader.tsx)); no Frame scrubber in the Shader section (P1, FEATURES.md 5.2 item 3) |
| `shaders.view.play-setting` | view | probe --core | not driven | passed |  |
| `shaders.insert.gallery-hover-live` | shaders | probe --core | not driven | passed |  |

## Not driven rows, by id and reason

- `shaders.background.add-to-theme`: not on this build: dialog.background.shader.addToTheme (docs/PRODUCT.md 7.1, B1 (dialogs/Background.tsx)); no Add to theme row beside the Shader row (P1, FEATURES.md 5.2 item 1)
- `shaders.frame.scrubber-capture`: not on this build: formatOptions.shader.frame.scrubber (docs/PRODUCT.md 7.1, B5 (inspector/shader.tsx)); no Frame scrubber in the Shader section (P1, FEATURES.md 5.2 item 3)

## Failed rows, by id and reason

- `shaders.background.place-answers`: Slide > Change background on the body slide; Shader; a tile; Place; read the ground, the button and the dialog: chose Liquid metal; Place dialog.background.shader.place; the ground changed after 25186 ms (covering picture background, asset liquid-metal); the button read "Placing, 18 s" with the seco

