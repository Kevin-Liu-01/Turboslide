# The site: `/home` and `/docs`

The Workbench direction Kevin picked on 2026-10-14 for the landing and the docs, built on `site/bench` from `8c9465b6`. It replaces `docs/LANDING.md` for `/home`. The build plan, with its decisions D1 to D12 in full and the file by file work, is the orchestrator's (`/Users/kevinliu/turboslide-scratch/site/plan.md`); this file keeps what a builder of these pages needs.

## 1. The page

- `/home` is one route file (`apps/studio/src/routes/home.tsx`) over `apps/studio/src/components/site/`: the bar with the T in a box (`SiteBar`, `BoxedMark`), screen 01 (`Hero`: the h1 with its two stacks, the lead with New Presentation and Open the Example Deck, the editor's figure), screen 02 (`AgentsScreen`: the recorded CLI run beside `slide.new` on each transport), screen 03 (`PresentScreen`: the viewer and the slideshow keys) and the footer (`SiteFooter`).
- Every word is in `copy.ts`, every count in `facts.ts` (pinned to the action table by `facts.test.ts`), the recorded run in `run.ts` (pinned to `home-deck/recorded/run.json` by `run.test.ts`).
- The stylesheet `site.css` is linked from the route's head with `?url`, so no rule reaches another page; every selector names the root `.ts-site` (`routes/-home-css.test.ts`). `/docs` takes the same root and stylesheet in its own build step.
- The page imports no editor module (`graph.test.ts`). The live editor arrives in the hero step as a same origin frame of its own route; until then the hero box holds a poster.

## 2. Decisions

- D6. The four agent marks (Claude Code, Codex, OpenClaw, Hermes) are inlined once from thesvg.org in `packages/chrome/src/presence/agent-marks.tsx`, MIT, each in its own colours; Hermes draws in ink on a dark ground.
- D7. `/home` and `/docs` share `components/site/`.
- D8. The display size is 72 px at 1440 (`clamp(40px, 5vw, 72px)`; 36/44 on a phone), so the one line h1 and its two stacks fit the 1280 px column.
- D9. The capital labels name figures, tables, navigation groups and screen numbers; the brand lint accepts `.ts-site .t-label` by name.
- D11. The solid icons are Heroicons 20 solid from the chrome's one icon module, picked by name from its exported constants (`components/site/SiteIcon.tsx`), so a page carries the paths it draws and none of the editor's table.
- D12. No local production build: the byte lines and the tooltip audit are read on a preview.

## 3. Type, grid and colour

- One face, the product's InterVariable 4.1, weights 400 and 500, `font-optical-sizing: auto`, `font-synthesis: none`.
- Display 72/72 (500, -0.032em); Title 40/48 (400); Head 24/32 (500, opsz 32); Lead 20/28; Read 17/28; Small 14/20; Label 12/16 capitals (500, +0.06em, `case`, tabular figures); code in the platform monospace on the `#101010` panel.
- The column is 1280 px with 32 px gutters (16 px at 720 px and under); one layout breakpoint at 1023 px; the bar is 56 px.
- Colours are the generated `--pt-` tokens, so both appearances follow `html[data-theme]`. Corners: 0 for frames and slides, 4 px key chips, 6 px buttons, round avatars.

## 4. The title and the hero

- The h1 reads "Presentations for people and agents". A stack of round avatars sits at the top right of "people" (five generated names, never a real person's) and of "agents" (the four marks inside the dashed agent ring). Each stack is an inline box after its word with `vertical-align: top`, inside a no-wrap run with the word, so it never reaches the line above or covers the next word. Each avatar is a focusable image with its name and the product's tooltip; the heading's text content stays the sentence.
- The hero box is 16:10 above 720 px and `min(560px, 72svh)` tall on a phone; its poster is a capture of the real editor in each appearance and width (`scripts/site/capture.mjs`), and only the poster of the page's appearance is fetched.
