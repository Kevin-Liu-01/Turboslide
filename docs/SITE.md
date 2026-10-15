# The site: `/home` and `/docs`

The Workbench direction Kevin picked on 2026-10-14 for the landing and the docs, built on `site/bench` from `8c9465b6`. It replaces `docs/LANDING.md` for `/home`. The build plan, with its decisions D1 to D12 in full and the file by file work, is the orchestrator's (`/Users/kevinliu/turboslide-scratch/site/plan.md`); this file keeps what a builder of these pages needs.

## 1. The page

- `/home` is one route file (`apps/studio/src/routes/home.tsx`) over `apps/studio/src/components/site/`: the bar with the T in a box (`SiteBar`, `BoxedMark`), screen 01 (`Hero`: the h1 with its two stacks, the lead with New Presentation and Open the Example Deck, the editor's figure), screen 02 (`AgentsScreen`: the recorded CLI run beside `slide.new` on each transport), screen 03 (`PresentScreen`: the viewer and the slideshow keys) and the footer (`SiteFooter`).
- Every word is in `copy.ts`, every count in `facts.ts` (pinned to the action table by `facts.test.ts`), the recorded run in `run.ts` (pinned to `home-deck/recorded/run.json` by `run.test.ts`).
- The stylesheet `site.css` is linked from the route's head with `?url`, so no rule reaches another page; every selector names the root `.ts-site` (`routes/-home-css.test.ts`). `/docs` takes the same root and stylesheet in its own build step.
- The page imports no editor module (`graph.test.ts`). The live editor is a same origin frame of its own route, `/try` (section 5); the hero box holds a poster until the frame says it is ready.

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

## 5. The live editor in the hero

- D1. The editor runs in a same origin frame of `/try` (`apps/studio/src/routes/try.tsx`, `ssr: false`, not indexed). Inside a frame of the hero's size the editor's fixed root, its document key maps, its address hash, the phone layout under 720 px and the dialogs' scrim are already right, so the real editor is unchanged. `/try` answers `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'` (`server/headers.ts`); every other page but the embed answers DENY. It is rendered per request, not prerendered: its shell takes the request's CSP nonce.
- D2. One seam for the editor's server calls: `apps/studio/src/editor/backend.ts`. The server backend (`backend-server.ts`) is every server function, the room's wire, the IndexedDB mirror, sessionStorage, the page's requests and records as the editor called them before; `/try` binds the tab backend once, before the editor mounts. `backend.test.ts` pins that the editor's files import no runtime module of `../server/` and no route address.
- D3. The tab backend (`apps/studio/src/try/tab-backend.ts`) runs the room in the tab: the realtime package's room server over its memory channel, a checkpoint two seconds after the last op, comments in memory (`tab-comments.ts`), version rows in memory, the unsent queue's mirror in memory. Nothing is written to the server, no deck id reaches the store, a reload starts from the shipped deck (`hero-deck.ts`, "Northwind quarterly review").
- D4. Claude Code and Codex are headless editor controllers on the same tab room, each with its own author and undo history; every agent write is one action of the table through `editorAdapter().invoke` with the agent's `baseRevision` (`session.ts`).
- D5. An agent whose roster row names a brand mark (only the tab room writes one) draws like a person: its chip shows the brand mark, its outline is dashed in its hue, and it has a pointer and a drag ghost; its writes raise no outside write banner. Every other agent draws as before.
- D10. A feature that needs the server answers one sentence with New Presentation (`TAB_ONLY` of `packages/chrome/src/menus/strings.ts`): the dialogs of `TAB_ONLY_DIALOGS` (`session.ts`), Presenter view, and every server function the tab backend refuses. The save cell reads "In this tab only". A navigation away from `/try` loads in the window around the frame.
- The script (`script.ts`) is data; the runner (`agents.ts`) plays it at a pace a person can follow. Once the visitor clicks or types in the frame, no agent writes the slide the visitor's stage shows or the block they selected, a deck level write waits while they type or drag, and no agent writes a block, slide or deck field the visitor wrote. Until then the director moves the visitor's stage to the slide an agent last wrote, once every four seconds at most. The agents run only while the frame is on screen and its document visible; under reduced motion the pointer jumps and no drag ghost is drawn.
- The frame protocol (`components/site/try-frame.ts`): the frame says `ts-try:ready` once its filmstrip is drawn with both agents in the roster; the page then fades the frame in over the poster (150 ms, none under reduced motion) and removes the poster, so nothing moves; the page says `ts-try:visible` as the box enters and leaves the screen. The appearance travels as the viewer's `gt-theme` message.
