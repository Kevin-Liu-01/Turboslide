# Scrollbars: research for the design round

The scroll researcher's note for item 5 of the design round ("also make and use custom scrollbars",
Kevin, 2026-10-05). It inventories every scroll container of the product, measures what each one
draws today in Chromium, WebKit and Firefox on macOS, reads General Translation's scrollbar standard
and the brand deck, and proposes one scrollbar for Turboslide with the containers that use it.
Worktree `/Users/kevinliu/repos/Turboslide-design`, branch `design/round` at `0d75ab90`, dev server
on port 4655 (stopped). Nothing here is committed by this lane.

Contents: 1 summary, 2 method, 3 findings, 4 proposal, 5 proposals with costs, 6 pictures,
7 measurements and loads, 8 agreement with the surfaces and type notes, 9 questions only Kevin can
answer, sources.

## 1. Summary

1. Two scrollbars ship today. 19 elements in 17 files carry `.pt-scroll`
   (`packages/chrome/src/tokens.css` 199 to 282) and draw a 4 px gutter with a 2 px square thumb
   in Chromium and WebKit. About 30 other regions (every menu, the font list, the dialog lists,
   the speaker notes, the presenter's notes and slide list, the zoomed stage, the `/home` and
   `/decks` documents) draw the platform bar: 15 px with a track in Chromium and Firefox under
   macOS "Always", and nothing at rest in WebKit's overlay mode.
2. Firefox draws the 15 px platform bar on every `.pt-scroll` region too. The Firefox block at
   `tokens.css` 276 to 282 is gated on `@supports not selector(::-webkit-scrollbar)`, and Firefox
   153 answers `CSS.supports('selector(::-webkit-scrollbar)')` with true, so the block never
   applies. `selector(::-webkit-scrollbar-thumb)` answers false in Firefox and true in Chromium
   and WebKit, which makes it a working gate. The standalone deck copy
   (`packages/viewer/standalone/chrome.ts` 60), Prototemplate's deck (`deck/parts/head.html` 198)
   and the surfaces and type notes of this round carry the same dead gate.
3. The thumb's colour (`--pt-thumb`, ink at 0.32) reads 2.18:1 on light paper and 2.58:1 on dark
   paper, under the 3:1 of WCAG 2.2 SC 1.4.11.
4. Proposal: one CSS rule for every scroller by default, in `tokens.css`, 0 B of script. An 8 px
   gutter, a 4 px thumb with round ends at rest, 6 px under the pointer and while dragged, a 32 px
   shortest thumb, no track, no buttons. The thumb is ink at 0.44 (3.12:1 light, 3.97:1 dark),
   `--pt-ink-2` under the pointer and `--pt-ink` while dragged. Chromium and Safari draw it on every
   fine pointer whatever the macOS setting; Firefox draws its own thin bar in the same colour
   (11 px under "Always", an overlay otherwise); touch screens keep the platform overlay. The
   zoomed stage paints its track in the chrome's paper so the thumb reads over a dark slide.
   `.pt-scroll` keeps the vertical overflow and the stable gutter, `.pt-scroll-x` the sideways
   overflow without a gutter. A brand lint rule fails any scrollbar declaration outside
   `tokens.css`. Pictures: `scroll/after-anatomy.png`, `scroll/after-states.png`,
   `scroll/after-a.png`, `scroll/after-b.png`.
5. Three defects sit beside the scrollbar: the landing's miniature notes field draws a 15 px bar
   for 1 px of overflow (`scroll/landing-notes.png`), the speaker notes handle covers the zoomed
   stage's horizontal bar (`scroll/stage-handle.png`), and the phone layout's sideways filmstrip
   keeps a vertical gutter.

## 2. Method

- Server: `vite dev --port 4655` from `apps/studio` with the round's environment
  (`TURBOSLIDE_STORE=tmp`, overlay `.turboslide/scroll-overlay`, realtime memory, local open,
  capture mail, secrets generated per run and never printed). The tmp store seeds `decks/`; the
  editor runs on `gt-brand` (85 slides).
- Engines (Playwright 1.62.1): Chromium 151.0.7922.34 headless with `--hide-scrollbars` removed;
  it draws the classic scroller, which is what Chrome draws under macOS "Always". Firefox 153.0
  headed; it draws the classic scroller (headless Firefox draws the overlay mode, and the pref
  `ui.useOverlayScrollbars: 0` changed nothing headless). WebKit 26.5 draws the overlay mode: the
  per-process argument `-AppleShowScrollBars Always` (through a wrapper executable) and the key in
  the test browser's own domain (`org.webkit.Playwright`, written and deleted in one command) did
  not reach its content process. The system setting was not changed. The WebKit columns are
  therefore WebKit under "Automatic" or "When scrolling"; under "Always" Safari draws the AppKit
  legacy scroller in those regions (expected 15 px, 11 px thin; not measured).
- Readings per scroller: computed `overflow-x`, `overflow-y`, `scrollbar-width`,
  `scrollbar-color` and `scrollbar-gutter`; the bar's width as `offsetWidth - clientWidth` less the
  borders (the same for height); whether `scrollHeight` exceeds `clientHeight`. Crops of each
  region's right edge in both appearances (the appearance switched with `data-theme` on `<html>`).
- Forced overflow: the local server has one deck and no signed-in people, so the Import slides
  list, the share people list, Version history, Comments and the presenter's notes got a 1,400 px
  spacer or 10 to 14 rows inside the region's own element, keeping its own CSS. Each such reading
  says "forced". The menus were read in a 340 px tall window, which is when a menu scrolls.
- The proposal was drawn by injecting its CSS into the same pages (a copy with each selector raised
  to beat today's `.pt-scroll` rules), in all three engines, at 2x.
- Probe scripts live in the session scratchpad and are not part of the repository.

## 3. Findings

### 3.1 What the engines do (measured)

One 160 by 200 px box per style, `overflow-y: auto`, bar width in px:

| Box | Chromium 151 (classic) | WebKit 26.5 (overlay) | Firefox 153 (classic) |
| --- | --- | --- | --- |
| No scrollbar rule | 15 | 0 | 15 |
| `scrollbar-width: thin` | 11 | 0 | 11 |
| `scrollbar-color` only | 15 | 0 | 15 |
| `::-webkit-scrollbar { width: 4px }` | 4 | 4 | 15 |
| The webkit rule and `scrollbar-width: thin` | 11 | 0 | 11 |

1. A `::-webkit-scrollbar` rule draws a classic bar in Chromium and WebKit whatever the macOS
   setting: WebKit drew 4 px in its overlay mode.
2. Chromium 151 and WebKit 26.5 ignore the webkit rules on a box whose `scrollbar-width` is not
   `auto` (last row). The same holds for `scrollbar-color` in Chromium 121 and later
   (`tokens.css` 210 to 213 records it).
3. `CSS.supports`: `selector(::-webkit-scrollbar)` is true in all three engines;
   `selector(::-webkit-scrollbar-thumb)` is true in Chromium and WebKit and false in Firefox.
   `scrollbar-width`, `scrollbar-color` and `scrollbar-gutter` are supported in all three.
4. WebKit applies a root scrollbar rule that arrives after load only once the root's overflow
   changes; in a stylesheet present at load it reads 8 px. Page captures: Firefox's leaves the
   root scrollbar out and WebKit's paints it black, so the document pictures use Chromium.
5. Touch: under touch emulation (`hasTouch`, and `isMobile` in Chromium) the media query
   `(hover: hover) and (pointer: fine)` is false and both engines draw the overlay (0 px).

### 3.2 The inventory

Bar widths in px. "Custom 4" is `.pt-scroll`'s 4 px gutter with its 2 px thumb; "platform" is the
browser's own bar with its track. "Rule" means the region was not driven and the cell follows from
its CSS and 3.1. Loads for every reading are in section 7.

**Editor**

| Region | Source | Overflow | Class | Chromium | WebKit | Firefox |
| --- | --- | --- | --- | --- | --- | --- |
| Filmstrip | `Filmstrip.tsx` 1153, `Filmstrip.css` 20 to 28 | `.pt-scroll`: y scroll, gutter stable | `.pt-scroll` | custom 4 | custom 4 | platform 15 |
| Filmstrip at 700 px wide | `PhoneEditor.css` 84 to 91 | x auto, y hidden, the gutter stays | `.pt-scroll` | 4 by 4 (a vertical gutter on a sideways strip) | 0 by 4 | 15 by 15 |
| Stage at a zoom | `packages/viewer/src/Editor.css` 83 to 85, `Sheet.tsx` 163 to 167 | auto | none | platform 15 by 15 | 0 | rule: 15 by 15 |
| Speaker notes | `NotesPane.css` 64 to 77 (`textarea`) | the textarea's own | none | platform 15 (30 lines) | 0 | platform 15 |
| Notes slot under 720 px | `PhoneEditor.css` 55 to 61 | auto | none | rule: 15 | rule: 0 | rule: 15 |
| Side panel body: Version history, Comments, Themes, Format options, Assist | `Panel.tsx` 57 | `.pt-scroll` | `.pt-scroll` | custom 4 (forced) | custom 4 | platform 15 |
| Inspector scroll | `Inspector.tsx` 556 | `.pt-scroll` | `.pt-scroll` | rule: custom 4 | rule: custom 4 | rule: 15 |
| Assist request field | `panels/Assist.css` 190 to 200 (`max-height: 120px`) | the textarea's own | none | platform 15 (12 lines) | 0 | platform 15 |
| Menu plate (every menu and submenu) | `Menu.css` 17 to 34, `Menu.tsx` 148 | y auto, plate as tall as the window allows | none | platform 15 (340 px window) | 0 | platform 15 |
| Layout list (context menu) | `ContextMenu.css` 5 to 11 | y auto | none | rule: 15 | rule: 0 | rule: 15 |
| Insert menu, Export menu, outline row menu, anchored pickers, layout plate | `InsertMenu.css` 13 to 19, `ExportMenu.css` 15 to 21, `Sidebar.css` 630 to 639, `pickers/Pickers.css` 157 to 161, `EditorShell.css` 153 to 164 | y auto | none | rule: 15 | rule: 0 | rule: 15 |
| Presence plate menu rows | `presence/PlateMenu.tsx` 167, `presence.css` 254 to 259 | y auto, gutter stable | `.pt-scroll` | rule: custom 4 | rule: custom 4 | rule: 15 |
| Font picker list | `FontPicker.css` 61 to 67 | auto | none | platform 15 | 0 | platform 15 |
| More fonts list | `FontPicker.css` 172 to 178 | auto | none | rule: 15 | rule: 0 | rule: 15 |
| Dialog body | `Dialog.css` 117 to 124 | y auto | none | rule: 15 | rule: 0 | rule: 15 |
| Open and Import slides presentation list | `Dialog.css` 318 to 325 | y auto, 320 px | none | platform 15 (forced) | 0 | platform 15 |
| Import slides thumbnails | `Dialog.css` 559 to 565 | y auto, 320 px | none | rule: 15 | rule: 0 | rule: 15 |
| Background dialog pictures | `Dialog.css` 679 to 685 | y auto, 260 px | none | rule: 15 | rule: 0 | rule: 15 |
| Share people, access requests, links | `dialogs/Share.tsx` 1153, 1264, 1410; `share.css` 36 to 45, 158 to 168 | y auto, gutter stable (both set again locally) | `.pt-scroll` | custom 4 (forced) | custom 4 | platform 15 |
| Keyboard shortcuts | `ShortcutsDialog.tsx` 175 | `.pt-scroll` | `.pt-scroll` | custom 4 | custom 4 | platform 15 |
| Special characters grid | `dialogs/SpecialCharacters.tsx` 220 to 230 (inline `overflowY: 'auto'`) | y auto | `.pt-scroll` | rule: custom 4 | rule: custom 4 | rule: 15 |
| Logo groups, shader gallery, icon picker, asset picker, search the menus, source drawer | `Logo.tsx` 1024, `ShaderGallery.tsx` 546, `IconPicker.tsx` 159, `AssetPicker.tsx` 200, `Palette.tsx` 336, `SourceDrawer.tsx` 328 | `.pt-scroll` or local y auto | `.pt-scroll` | rule: custom 4 | rule: custom 4 | rule: 15 |
| Comment list | `comments/CommentCard.tsx` 576, `comments.css` 79 to 84 | y auto, gutter stable | `.pt-scroll` | rule: custom 4 | rule: custom 4 | rule: 15 |
| Reply mentions | `comments.css` 293 to 306 | y auto | none | rule: 15 | rule: 0 | rule: 15 |
| Profile rows | `dialogs/accounts.css` 178 to 186 | y auto, gutter stable | none | rule: 15 | rule: 0 | rule: 15 |
| Help card, export report, conflict banner and its `pre` | `HelpCard.css` 21 to 29, `ExportReportCard.css` 7 to 14, `routes/edit.$deckId.css` 26 to 35 and 80 to 83 | auto | none | rule: 15 | rule: 0 | rule: 15 |
| Connect card command | `ConnectCard.css` 61 to 67 | x auto, plate ground | none | rule: 15 | rule: 0 | rule: 15 |
| Chart data grid | `inspector/chart.css` 66 to 95 | x auto, its own 8 px webkit bar on a plate track | own copy | rule: 8 | rule: 8 | rule: 15 |
| Text control, several lines | `inspector/text.css` 33 to 37 | auto | none | rule: 15 | rule: 0 | rule: 15 |
| Menu bar row at or under 600 px | `MenuBar.css` 53 to 63 | x auto, `scrollbar-width: none`, webkit `display: none` | hidden | 0 | 0 | 0 |

**Viewer, presenter and slideshow**

| Region | Source | Overflow | Class | Chromium | WebKit | Firefox |
| --- | --- | --- | --- | --- | --- | --- |
| Viewer sidebar | `Sidebar.tsx` 1091 | `.pt-scroll` | `.pt-scroll` | custom 4 | custom 4 | platform 15 |
| Grid view | `packages/viewer/src/GridView.tsx` 314 | `.pt-scroll` | `.pt-scroll` | custom 4 | not driven | platform 15 |
| Book view | `BookView.tsx` 211 | `.pt-scroll` | `.pt-scroll` | rule: custom 4 | rule: custom 4 | rule: 15 |
| Presenter notes | `present/PresenterConsole.css` 320 to 327 | y auto | none | platform 15 (forced) | 0 | platform 15 |
| Presenter slide column | `PresenterConsole.css` 174 to 182 | y auto | none | platform 15 | 0 | platform 15 |
| Presenter slide list | `present/SlideList.css` 7 to 14 | y auto | none | platform 15 | 0 | platform 15 |
| Slideshow shortcuts card | `present/PresentShortcuts.css` 15 to 26 | y auto, paper ground | none | rule: 15 | rule: 0 | rule: 15 |
| Standalone deck viewer | `packages/viewer/standalone/chrome.ts` 53 to 60 (`.scroll`) | a copy of `.pt-scroll` with the same Firefox gate | `.scroll` | rule: custom 4 | rule: custom 4 | rule: 15 |

**Pages**

| Region | Source | Overflow | Class | Chromium | WebKit | Firefox |
| --- | --- | --- | --- | --- | --- | --- |
| `/home` document | none | the root | none | platform 15 | 0 | platform 15 (not in the capture) |
| Landing miniature filmstrip | `components/home/editing.css` 105 to 113 | y auto, `scrollbar-width: thin` | own rule | platform 11 | 0 | platform 11 |
| Same, at 390 px | `editing.css` 616 to 624 | x auto | own rule | platform 11 (height) | 0 | rule: 11 |
| Landing miniature notes field | `editing.css` 158 to 171 (`rows={1}`, `HomeMenus.tsx` 56) | the textarea's own | none | platform 15 at rest (content 48 px in a 47 px box) | 0 | rule: 15 |
| Landing miniature dialog | `editing.css` 325 to 340 | y auto | none | rule: 15 | rule: 0 | rule: 15 |
| Landing hero filmstrip under 720 px | `routes/home.css` 2092 to 2105 | x auto, `scrollbar-width: none`, webkit `display: none` | hidden | 0 | 0 | 0 |
| Landing agents console | `components/home/agents.css` 108 to 112 | hidden: 10 rows of 44 px, no scroller | none | none | none | none |
| `/decks`, `/decks/trash`, `/decks/templates` documents | `routes/decks.css` 24 to 26 (`html:has(.ts-home-page)` gutter stable) | the root | none | platform 15 | 0 | platform 15 |
| Print preview document | `routes/print.css` 167 to 169 | the root, gutter stable | none | rule: 15 | rule: 0 | rule: 15 |

Totals: 44 scroll declarations (`overflow` at `auto` or `scroll`) in 32 files, 2 of them
`.pt-scroll`'s own; `.pt-scroll` on 19 elements in 17 files; 4 local scrollbar rules
(`chart.css`, `editing.css` 110, `home.css` 2100 to 2105, `MenuBar.css` 58 to 62).
Pictures of today: `scroll/today-a-pt-scroll.png` (the `.pt-scroll` regions),
`scroll/today-b-plain.png` (regions without the class), `scroll/today-c-document.png` (the
documents, the presenter's notes and the zoomed stage), `scroll/landing-edge.png` (the `/home`
document bar, left half).

### 3.3 Defects

1. **The Firefox gate never applies.** `tokens.css` 276 to 282 and
   `packages/viewer/standalone/chrome.ts` 60 use `@supports not selector(::-webkit-scrollbar)`,
   true in Firefox 153 (3.1 item 3). Firefox therefore keeps `scrollbar-width: auto` and draws
   15 px on every `.pt-scroll` region (filmstrip, panel, shortcuts, share, viewer sidebar, grid
   all read 15 in Firefox). Picture: `scroll/today-a-pt-scroll.png`, the Firefox columns.
2. **Two looks in one window.** In Chromium the filmstrip draws the 2 px thumb while the font list
   beside it draws a 15 px bar with a grey track (`scroll/today-b-plain.png`). In WebKit under
   "Automatic" the plain regions show no bar at rest, so a long menu or the font list gives no
   sign that it scrolls.
3. **Thumb contrast.** `--pt-thumb` (`tokens.css` 61 and 186; `packages/theme/src/tokens.ts` 44
   and 58) composites #b0b0b0 on #ffffff (2.18:1) and #525252 on #070707 (2.58:1). `--pt-field`
   (ink at 0.44, `tokens.css` 43 and 175) composites 3.12:1 and 3.97:1, and 3.05:1 on the light
   hover ground.
4. **Local copies.** `inspector/chart.css` 66 to 95 draws its own 8 px bar on a plate track (a
   third look). `editing.css` 110 sets `scrollbar-width: thin`, which in Chromium switches off any
   custom rule and draws the platform's 11 px bar. `share.css` 42 and 164, `comments.css` 83,
   `presence.css` 258 and `accounts.css` 185 repeat `scrollbar-gutter: stable`, and `share.css`
   41 and 163 and `comments.css` 82 change `.pt-scroll`'s `overflow-y: scroll` to `auto`.
5. **`.pt-scroll-x` reserves a vertical gutter.** `tokens.css` 216 to 218 gives both classes
   `scrollbar-gutter: stable`, which reserves the vertical bar's width even on a sideways region
   with `overflow-y: hidden`. Measured on the filmstrip in the phone layout (`PhoneEditor.css` 84 to
   91 keeps `.pt-scroll` and turns the strip sideways): Chromium 4 px wide and 4 px tall, Firefox
   15 and 15, in a 700 px window.
6. **The landing's notes field scrolls by 1 px.** `.ts-mini-notes textarea` (`editing.css` 158 to
   171) is 47 px tall with 14 px padding top and bottom and one 19.6 px line (14 px at 1.4), so
   its content is 48 px and Chromium draws a 15 px bar beside "Ask Northwind who reviews each
   week." at rest (`scroll/landing-notes.png`; also visible in `scroll/landing-edge.png`).
7. **The notes handle covers the zoomed stage's bar.** `.ts-notes-handle` (`NotesPane.css` 22 to
   40) sits at `top: -7px`, 13 px tall, `z-index: 1`, centred on the seam. At 200 % it covers the
   lower 7 px of today's 15 px bar and, with an 8 px bar, the middle of the thumb
   (`scroll/stage-handle.png`). It belongs to item 1's layering work as well.
8. **The zoomed stage needs a track.** The stage at a zoom is the slide's ground, which can be dark
   under light chrome. With a transparent track at 200 % in Chromium, the light chrome's thumb
   (ink at 0.44) over the black slide of `gt-brand` cannot be seen, and the dark chrome's thumb
   reads (`scroll/stage-transparent.jpg`). With the track in the chrome's paper both thumbs read
   (`scroll/after-zoom.jpg`).
9. **No scroller sits on an ink ground.** The ink panels (`--pt-panel-ink`: the slideshow layer,
   the present toolbar, the asset picker's preview) do not scroll, the slideshow shortcuts card is
   paper (`PresentShortcuts.css` 21), and the landing's agents console clips at 10 rows
   (`agents.css` 108 to 112). A thumb colour for ink grounds is not needed today.

### 3.4 General Translation's standard (read only)

gt-cloud `origin/main` at `a0918e771`:

- `packages/ui/src/css/shared.css` 496 to 518: the page's own scroller, `scrollbar-width: thin`,
  `scrollbar-color: hsl(var(--foreground) / 0.25) transparent`, and webkit rules of 8 px with a
  2 px transparent border and `border-radius: 999px`, hover at 0.4.
- `shared.css` 520 to 547: `.gt-scrollbar` and `.fd-scroll-container`, the same thin and colour
  pair, webkit rules of 6 px, round thumb, hover at 0.4. 548 to 566: Radix scroll areas it does not
  own get an 8 px bar with a round thumb.
- `packages/ui/src/components/ui/scroll-area.tsx` 9 to 71: the `ScrollArea` component, a Radix
  scroll area (script) with an 8 px bar, 2 px padding, a round thumb at foreground 0.25 (0.4 on
  hover) that fades while the content rests.
- By 3.1 item 2, the same element sets `scrollbar-width: thin` and the webkit rules, so the 6 px
  and 8 px webkit rules never draw in Chromium 121 or later or in WebKit 26.5; the site draws the
  platform's thin bar in its colour. The values worth taking are the round thumb, the
  transparent track and the colour step on hover.
- Radius scale: `shared.css` 85 to 87 and 250, `--radius` 8 px, `-md` 6 px, `-sm` 4 px.

### 3.5 The brand deck (read only)

- Prototemplate `DESIGN.md` 165 to 169: one thin scrollbar in chrome, a 4 px gutter with no track
  rule, a 2 px thumb in `--pt-thumb` that widens to 4 px on hover, owned by `.pt-scroll` and
  mirrored by the deck's `.scroll`; "No scroll region draws a rule beside its thumb."
- `deck/parts/head.html` 188 to 198: that rule, radius 0, with the Firefox gate of 3.3 item 1.
- `DESIGN.md` 421 and 437: the shell's chrome is radius 0 except five named elements.
- `deck/slides/39-avoid.html` 11: smooth scrolling and scroll hijacking are not used; Turboslide's
  brand lint bans scroll libraries (`packages/lint/src/brand/source.ts` 202 to 211).

## 4. Proposal

### 4.1 The rule

In `packages/chrome/src/tokens.css`, replacing lines 199 to 282 (the values beside the other
`--pt-` tokens on `:root`; `--pt-thumb` is the existing token at the new value):

```css
:root {
  --pt-thumb: rgba(7, 7, 7, 0.44); /* was 0.32; dark remap rgba(242, 242, 240, 0.44) */
  --pt-scroll-w: 8px;
  --pt-scroll-inset: 2px;
  --pt-scroll-inset-on: 1px;
  --pt-scroll-min: 32px;
}

/* every scroller on a fine pointer, in Chromium and Safari */
@media (hover: hover) and (pointer: fine) and (forced-colors: none) {
  ::-webkit-scrollbar { width: var(--pt-scroll-w); height: var(--pt-scroll-w); background: transparent; }
  ::-webkit-scrollbar-track,
  ::-webkit-scrollbar-corner { background: transparent; border: 0; }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
  ::-webkit-scrollbar-thumb {
    min-width: var(--pt-scroll-min);
    min-height: var(--pt-scroll-min);
    border: var(--pt-scroll-inset) solid transparent;
    border-radius: var(--pt-radius-sm);
    background: var(--pt-thumb);
    background-clip: padding-box;
  }
  ::-webkit-scrollbar-thumb:hover { border-width: var(--pt-scroll-inset-on); background-color: var(--pt-ink-2); }
  ::-webkit-scrollbar-thumb:active { border-width: var(--pt-scroll-inset-on); background-color: var(--pt-ink); }
  .pt-scroll-solid::-webkit-scrollbar-track,
  .pt-scroll-solid::-webkit-scrollbar-corner { background: var(--pt-paper); }
}

/* Firefox: the only engine that answers false here (research-scroll.md 3.1 item 3) */
@supports not selector(::-webkit-scrollbar-thumb) {
  :root { scrollbar-color: var(--pt-thumb) transparent; }
  * { scrollbar-width: thin; }
  .pt-scroll-solid { scrollbar-color: var(--pt-thumb) var(--pt-paper); }
}

@media (prefers-contrast: more) {
  :root { --pt-thumb: var(--pt-ink-2); }
}

/* layout only: a vertical list region whose width never changes, and a sideways one */
.pt-scroll { overflow-y: auto; overflow-x: hidden; scrollbar-gutter: stable; }
.pt-scroll-x { overflow-x: auto; overflow-y: hidden; }
```

Notes on the rule:

- Specificity: `::-webkit-scrollbar` alone is (0,0,1) and `*` is (0,0,0), so every local rule
  that hides a bar (`MenuBar.css` 56 to 63, `home.css` 2092 to 2105) keeps winning, in every
  engine.
- `scrollbar-color` inherits, so the one `:root` declaration reaches every Firefox scroller; it
  sits inside the Firefox block so Chromium and WebKit never see a non-`auto` value that would
  switch the webkit rules off. `.pt-scroll` loses today's `scrollbar-width: auto` and
  `scrollbar-color: auto` resets (`tokens.css` 219 and 220), which would beat `*` in Firefox.
- `.pt-scroll` moves from `overflow-y: scroll` to `auto` with the stable gutter: the same box and
  the same paint in Chromium and WebKit, and in Firefox's classic mode no empty disabled bar on a
  short list.
- The corner: `border-radius: var(--pt-radius-sm)` is the 4 px step of the surfaces note's scale
  (`research-surfaces.md` P2). With the 2 px transparent border the thumb's own radius is 2 px on
  a 4 px thumb, and 3 px on the 6 px thumb under the pointer, so both states have fully round
  ends. Chromium drew the same pixels at 4x with `999px` and with `4px`. Until P2 lands the value
  is `4px` with a named exception in the brand lint's radius rule
  (`packages/lint/src/brand/config.ts`).
- `forced-colors: active` leaves the platform's bar in place, which follows the forced palette.

### 4.2 Geometry and colour

| Part | Value | Light | Dark |
| --- | --- | --- | --- |
| Gutter | 8 px, transparent track, no line | the paper shows | the paper shows |
| Thumb at rest | 4 px, 2 px from each edge, round ends, 32 px shortest | `--pt-thumb` (ink at 0.44), 3.12:1 | paper-ink at 0.44, 3.97:1 |
| Pointer on the thumb | 6 px, 1 px from each edge | `--pt-ink-2`, 10.88:1 | 10.59:1 |
| Dragging | 6 px | `--pt-ink`, 20.14:1 | 17.97:1 |
| Zoomed stage track | 8 px in `--pt-paper` with its corner | white | #070707 |
| Firefox | its own thin bar in `--pt-thumb` over a transparent track | 11 px under "Always", an overlay otherwise | same |

Pictures: `scroll/after-anatomy.png` (the parts at 6x with the contrast of each colour, both
appearances), `scroll/after-states.png` (rest, pointer and drag on the filmstrip's right edge at
4x, both appearances, beside today's bar and the width and corner options).

### 4.3 Overlay versus classic

- Chromium and Safari on a fine pointer draw the classic bar of 4.1 in every region, under every
  macOS setting, because a webkit rule always draws classic (3.1 item 1). Readers on "Always" and
  on "Automatic" see the same window. The gutter costs 8 px of width where today's `.pt-scroll`
  cost 4 px and the plain regions cost 15 px (classic) or 0 (overlay).
- Firefox draws its own thin bar: classic 11 px under "Always", an overlay under "Automatic". Its
  colour is ours; the hover and drag steps are Firefox's.
- Touch screens (`pointer: coarse`) keep the platform's overlay: 0 px of layout and the native
  indicator.
- An overlay of our own in every engine needs script per scroller: OverlayScrollbars 2.16.0 reads
  14,948 B gzip of script and 2,604 B of CSS (`research-type.md` 5), it wraps every scroller in an
  element, and the brand lint bans scroll libraries. This note does not propose it (question 4).

### 4.4 Who uses it

- Every scroller by default, with no class: the documents of `/home`, `/decks`, `/decks/trash`,
  `/decks/templates` and print, every menu and submenu, the font lists, every dialog body and list,
  the speaker notes and every textarea, the presenter's notes, column and slide list, the slideshow
  shortcuts card, the help card, the export report, the conflict banner, the Connect card command,
  the chart grid, the landing's miniature filmstrip, notes field and dialog.
- `.pt-scroll` (the stable gutter) stays on its 19 elements and is added to the lists that grow
  while open: `.ts-font-list`, `.ts-more-fonts-list`, `.ts-dialog-list`, `.ts-dialog-slides`,
  `.ts-dialog-tiles`, `.ts-reply-mentions`, `.ts-profile-rows`, `.ts-presenter-notes`,
  `.ts-slide-list`. The local `scrollbar-gutter` and `overflow-y` repeats of 3.3 item 4 go.
- `.pt-scroll-x` for sideways regions: the phone layout's filmstrip (`PhoneEditor.css` 84 to 91
  swaps the class or sets `scrollbar-gutter: auto`), the landing's miniature filmstrip under
  720 px, the chart grid.
- `.pt-scroll-solid` on the stage: `packages/viewer/src/Sheet.tsx` 165 adds it to
  `pt-sheet-stage`.
- Kept at `scrollbar-width: none` with webkit `display: none`: the menu bar row at or under 600 px
  (`MenuBar.css` 53 to 63) and the landing's hero filmstrip under 720 px (`home.css` 2092 to 2105).
  Both are one row of items cut at the window's edge; an 8 px bar under a 28 px row would grow the
  row or cover it (question 5).
- The standalone deck (`packages/viewer/standalone/chrome.ts` 53 to 60) takes the same rule over
  its own token names (`--thumb` at 0.44 in `packages/theme/src/tokens.ts` 44 and 58).

### 4.5 Keeping it in one place

A brand lint rule `css/scrollbar` in `packages/lint/src/brand/css.ts` (beside `css/radius` at 145):
a `::-webkit-scrollbar` selector, `scrollbar-color`, or a `scrollbar-width` other than `none`
anywhere outside `packages/chrome/src/tokens.css` (and the standalone copy) fails, and a
`::-webkit-scrollbar` rule outside it may only set `display: none`. That is Kevin's one shared rule
for every surface, enforced by the gate that already reads the tree's stylesheets.

## 5. Proposals with costs

| Key | Change | Files and lines | Cost |
| --- | --- | --- | --- |
| S1 | The rule of 4.1 replaces `.pt-scroll`'s webkit block | `tokens.css` 199 to 282 | Minified: today's section 1,116 B (346 B gzip, 273 B brotli), the proposed rule 1,438 B (413 B gzip, 351 B brotli) plus about 150 B of layout classes. About +200 B gzip in the shared stylesheet; the document, the route chunk and the live core are unchanged (0 B of script). |
| S2 | The Firefox gate reads `selector(::-webkit-scrollbar-thumb)` | `tokens.css` 276; `standalone/chrome.ts` 60 | 1 selector each |
| S3 | `--pt-thumb` from 0.32 to 0.44 in both appearances | `tokens.css` 61 and 186; `packages/theme/src/tokens.ts` 44 and 58; `standalone/chrome.ts` 46 and 47; the token tests | 6 values |
| S4 | The local copies go | `inspector/chart.css` 66 to 95 (about 25 lines out), `editing.css` 110, the repeats of 3.3 item 4 | about 35 lines out |
| S5 | `.pt-scroll-solid` on the stage | `Sheet.tsx` 165 | 1 class |
| S6 | `.pt-scroll` on the growing lists of 4.4 | 9 class names in their components | 9 edits |
| S7 | The phone filmstrip loses the vertical gutter | `PhoneEditor.css` 84 to 91 | 1 line |
| S8 | The landing's notes field fits its line: `line-height: 19px` (14 + 19 + 14 = 47) | `editing.css` 158 to 171 | 1 line; the document and page CSS budgets move by bytes |
| S9 | The notes handle sits under the seam while the stage is zoomed, for example `.ts-editor:has(.pt-sheet-stage[data-zoom]) .ts-notes-handle { top: 0 }` | `NotesPane.css` 22 to 40 | 1 rule |
| S10 | The lint rule of 4.5 with its test | `packages/lint/src/brand/css.ts`, `config.ts`, `css.test.ts` | about 40 lines |
| S11 | Docs: `docs/brand.md` names the rule; Prototemplate's `DESIGN.md` 165 to 169 and `deck/parts/head.html` 188 to 198 carry the same dead gate and are Prototemplate's to change | `docs/brand.md` | a paragraph |

Every change is CSS or a class name; no row adds script, a request or a dependency.

## 6. Pictures

All under `docs/gslides-parity/design-round/scroll/`, each under 200,000 B, each opened and read.

| File | Shows |
| --- | --- |
| `today-a-pt-scroll.png` | Today, the `.pt-scroll` regions (filmstrip, Version history, shortcuts, share people), right edges at 2x, Chromium, WebKit and Firefox in both appearances: the 2 px thumb in Chromium and WebKit, Firefox's 15 px bar |
| `today-b-plain.png` | Today, regions without the class (font list, Import slides list, menu, speaker notes): the 15 px bar with its track in Chromium and Firefox, nothing at rest in WebKit's overlay mode |
| `today-c-document.png` | Today, the `/home` and `/decks` documents, the presenter's notes and the zoomed stage |
| `landing-edge.png` | `/home` after a 1,800 px scroll, the window's right edge in Chromium: today's 15 px bar and track, the proposed 8 px gutter, both appearances; the notes field's bar of 3.3 item 6 shows in all four |
| `landing-notes.png` | The landing's notes field at 3x: 48 px of content in a 47 px box draws the 15 px bar |
| `stage-handle.png` | The speaker notes handle over the zoomed stage's horizontal bar, today and proposed, both appearances |
| `after-anatomy.png` | The proposed scrollbar's parts at 6x: gutter, thumb at rest, under the pointer and dragged, the colours and their contrast, Firefox's line, both appearances |
| `after-states.png` | The filmstrip's right edge at 4x: today's bar, the proposed rest, pointer and drag states, the square corner, and 6 px and 10 px gutter options, both appearances |
| `after-a.png` | The proposal injected into the dev server in all three engines, both appearances: filmstrip, Version history, font list, Import slides list |
| `after-b.png` | Same for the menu, the speaker notes, the `/home` document and the zoomed stage's lower right corner |
| `after-editor.jpg` | The proposal in Chromium: the filmstrip and the open font list, and Version history, in both appearances |
| `stage-transparent.jpg` | The zoomed stage at 200 % with a transparent track, the rejected form: the light chrome's thumb cannot be seen over the dark slide |
| `after-zoom.jpg` | The zoomed stage at 200 % with the paper track, light and dark chrome |

## 7. Measurements and loads

Load is the one minute average of `uptime` or `os.loadavg()`. The machine ran other sessions' jobs;
no reading here is a timing, and none would be a verdict at these loads.

| Reading | Engine | Time (UTC) | Load |
| --- | --- | --- | --- |
| Engine table 3.1, per-process and per-domain "Always" attempts | all three | 22:40 to 22:47 | 220 to 460 |
| Editor inventory, first pass | Chromium | 22:50 to 22:52 | 130 to 168 |
| Editor inventory with forced overflow | Chromium, WebKit, Firefox | 22:53 to 22:58 | 114 to 164 |
| Route inventory (`/home`, `/home` at 390 px, `/decks`, trash, templates, `/deck`, `/present`) | all three | 23:00 to 23:05 | 115 to 160 |
| Panels, card menu, 700 px window, presenter notes and slide list, grid view | all three | 23:06 to 23:13 | 120 to 255 |
| `CSS.supports` readings | all three | 23:14 | 200 to 255 |
| Proposal mechanics (4 px rest, 6 px pointer, drag) | all three | 23:15 to 23:18 | 200 to 255 |
| Proposal injected, every region of `after-a.png` and `after-b.png` | all three | 23:20 to 23:31 | 110 to 218 |
| Root bar after injection in WebKit; the stage track | WebKit, all three | 23:27 to 23:34 | 128 to 178 |
| The stage with a transparent track | Chromium | 23:50 | 114 |
| Landing notes field heights | Chromium, WebKit | 23:36 | 154 to 156 |
| Touch gate; radius 4 px against 999 px at 4x | Chromium, WebKit | 23:37 to 23:47 | 123 to 160 |
| Today's speaker notes in both appearances, recaptured | all three | 23:41 | about 150 |

Scrolling cost: the 19 `.pt-scroll` regions already draw a webkit bar, so their paint path does
not change. The other regions move from the platform bar to a painted one. Whether that changes a
scroll frame was not measured: at loads of 110 to 460 a frame time is not a verdict. The build lane
reads the filmstrip's and the font list's wheel scroll in Chromium with the Performance panel's
frame times, today against the proposal, at a load at or under 24, and records both with the load.

## 8. Agreement with the surfaces and type notes

`research-surfaces.md` P6 (361 to 375) and `research-type.md` 5 (409 to 453) reach the same rule:
an 8 px gutter, a 4 px thumb, 6 px under the pointer, a 32 px shortest thumb, ink at 0.44, every
scroller by default, `.pt-scroll` for the gutter only, the local copies out, 0 B of script, no
OverlayScrollbars. This note differs in five places:

1. Both notes gate the Firefox block on `@supports not selector(::-webkit-scrollbar)`
   (`research-surfaces.md` 365 to 366, `research-type.md` 427), which never applies in Firefox
   153 (3.1 item 3). The gate is `selector(::-webkit-scrollbar-thumb)`.
2. The zoomed stage needs the paper track of `.pt-scroll-solid` (3.3 item 8); neither note has it.
3. The thumb keeps the name `--pt-thumb` at the new value, so the standalone deck and the theme's
   `--thumb` change value only; `research-type.md` retires `--pt-thumb` for `--pt-field`. The
   pixels are the same.
4. The two hidden strips keep `scrollbar-width: none` here; `research-surfaces.md` 369 to 370 gives them
   `.pt-scroll-x`, which shows a bar (question 5).
5. `--pt-thumb-on-ink` (`research-type.md` 434 to 435) is not needed today: no scroller sits on an
   ink ground (3.3 item 9).

## 9. Questions only Kevin can answer

1. **Width.** An 8 px gutter with a 4 px thumb (6 px under the pointer), a 6 px gutter with a 4 px
   thumb, or a 10 px gutter with a 6 px thumb (`scroll/after-states.png`, the last two columns)?
   Default: 8 px.
2. **Corner.** Round ends (General Translation's site, the 4 px step of the new radius scale) or
   square ends (the brand deck's radius 0 chrome, `DESIGN.md` 165 to 169)? Default: round.
3. **At rest.** Show the thumb at rest, or only while the pointer is over the region (the gutter
   stays reserved either way, so hiding saves no space)? Default: shown at rest.
4. **Firefox.** Accept Firefox's own thin bar in our colour (11 px under "Always", an overlay
   otherwise), or add a script overlay (OverlayScrollbars, about 15 KB gzip and a wrapper per
   scroller) so Firefox draws the same pixels? Default: Firefox's own bar.
5. **The two hidden strips.** Keep the menu bar row (600 px and under) and the landing's hero
   filmstrip (under 720 px) without a bar, or give them the 8 px bar? Default: keep them hidden.
6. **Touch screens.** Keep the platform's overlay on touch-first devices, or draw the custom bar
   there too? Default: the platform's overlay.
7. **The notes handle at a zoom.** Move it under the seam while the stage is zoomed (S9), or hide it
   while zoomed? Default: move it under the seam.
8. **General Translation's site.** gt-cloud's `.gt-scrollbar` and `html` rules draw the platform's
   thin bar in Chromium and Safari because the same element sets `scrollbar-width: thin`
   (3.4). Report it to the gt-cloud owners, or leave it? Default: report it; no change in this round
   (gt-cloud is read only here).

## Sources

- Turboslide: `packages/chrome/src/tokens.css` 43, 61, 175, 186, 199 to 282;
  `packages/viewer/standalone/chrome.ts` 46 to 60; `packages/theme/src/tokens.ts` 12, 27, 44, 58;
  the files and lines of the tables in 3.2; `packages/lint/src/brand/css.ts` 1 to 11 and 143 to
  158; `packages/lint/src/brand/source.ts` 202 to 211; `docs/LANDING.md` 556 to 564 (the budgets).
- General Translation: gt-cloud `origin/main` `a0918e771`, `packages/ui/src/css/shared.css` 85 to
  87, 250, 496 to 566; `packages/ui/src/components/ui/scroll-area.tsx` 9 to 71.
- Prototemplate (read only): `DESIGN.md` 165 to 169, 421 to 437; `deck/parts/head.html` 188 to
  198; `deck/slides/39-avoid.html` 11.
- This round: `research-surfaces.md` 215 to 236, 320 to 333, 361 to 375; `research-type.md` 409
  to 453.
