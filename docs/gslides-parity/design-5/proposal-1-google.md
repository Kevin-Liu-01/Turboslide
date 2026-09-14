# Proposal 1, Google faithful

Design-5 proposal 1 of 3 for the last Google Slides parity round of Turboslide, written 2026-09-14 against `main` at `d5d7f07` (round three and its hotfix; round four is in the working tree and is read from `SPEC-4.md`, never from the tree). Designer 1, angle Google faithful: every remaining Google Slides behaviour a standalone editor can offer is reproduced with Google's label, Google's position and Google's shortcut, one standalone mechanism replaces each Google service, and every Turboslide addition beyond Google's surface is marked `turboslide: true` in the menu model so the completeness test keeps counting Google's rows alone.

The facts behind every row come from the eleven reports of `docs/gslides-parity/research-5/` (cited as R01 to R11 with their section numbers; their sources, URLs and dates are in those reports), from `SPEC-2.md` section 12, `SPEC-3.md` section 17, `SPEC-4.md` sections 0 and 7, `AGENTS.md`, and from the code at `d5d7f07` read with `git show`. Nothing was installed, no server ran, no git write was made, no account was signed in to, and no Google icon or artwork is proposed. Rules of the text: plain technical English, sentence case, no em dashes, no metaphors, no trailing periods on headings, full sentences.

## How to read this proposal

- Section 0 is the decision list; every later section expands one of its rows. A decision that a report already settled is stated with the report's section and not argued again; a decision this proposal takes against a report's recommendation says so and why.
- "Google's label" is the string the menu model stores as `label`; where Google's own spelling differs it sits in `google`. "Unverified" marks a Google behaviour no Google page states; the verifier lists every such item for Kevin (section 13).
- Every capability is an action of `packages/schema/src/actions.ts` with CLI, MCP, HTTP and window handlers working on a checkout (the `FileStore` under `decks/`) and hosted (the Blob store behind `runDeckAction`), the rule SPEC 7.1 and AGENTS.md "The agent surface" set. Section 10 lists the new ids; the table grows from 169 to about 220.
- The foundation does not move: the block document, the action table, the one string renderer, the Perfect export's pixel identity, the Prototemplate look and round four's identity, the security plan of round three. A slide size change is a deck level decision and the exports follow it (R08).
- Builders are B1 to B6, an integrator and a verifier (section 12); the round's steps join `pnpm check` as 32 to 37 after round four's 31.

## 0. The decisions in one page

| # | Area | Decision |
| --- | --- | --- |
| 0.1 | Motion, the document | `SlideBase.transition?: { kind, durationMs }` and `SlideBase.animations?: Animation[]` in play order, one entry per animation with `blockId`, `effect` (the fifteen Google types folded to nine effects plus a direction, plus `playMedia`), `trigger` (`click`, `afterPrevious`, `withPrevious`), `durationMs`, `byParagraph`; additive at schema version 1 (R05 3). The list lives on the slide, not the block, because Google's panel is one ordered list per slide and reordering across blocks is one array move. |
| 0.2 | Motion, the panel | One side panel titled Motion on the right, sections Slide Transition and Object Animations, opened by Insert > Animation, View > Motion, Slide > Transition, the toolbar's Transition button, the filmstrip's Transition row and the object menu's Animate row, chord Ctrl+Alt+Shift+B (Cmd+Option+Shift+B), following the selection while open (R01 1 to 3). A new animation is "Appear (On click)", Google's help text (R01 8 item 4 settles it against the 2024 walkthrough). |
| 0.3 | Motion, the numbers | The speed slider stores milliseconds from 100 to 5000 with three labelled stops Slow, Medium and Fast at 2000, 1000 and 500 ms and the seconds in its tooltip; the default is Medium. Google prints no number (R05 4), so the values are Turboslide's and are on Kevin's list. Slide from right is a push (both slides move); Zoom scales about the object's centre; Spin turns 360 degrees clockwise. |
| 0.4 | Motion, the show | `compileMotion(slide)` in `packages/render/src/motion.ts` is the one schedule the show, Presenter view, the HTML export and the PPTX writer read (R05 4). A click, Space, Enter, Right arrow or Page down plays the next step; Left arrow, Backspace and Page up reverse one step; when no step remains the slide changes and the incoming slide's transition plays; a digit jump lands on the slide at step 0 with its entry step played; Auto-play ticks advance one step; reduced motion cuts every duration to 0 and keeps the step gates. |
| 0.5 | Motion, the still rule | A still (the editor canvas, thumbnails, the Perfect page raster, the PDF, the JPEG, the PNG, the SVG, the ODP Perfect page) shows the document with every object at rest: entrance objects present, exit objects present, nothing rotated or scaled, a video at its poster, an audio icon shown even under Hide icon. The Perfect gate is unchanged by construction (R05 9.1). |
| 0.6 | Motion, the exports | Editable text PPTX writes `p:transition` inside `mc:AlternateContent` with `p14:dur` and the `spd` fallback and `p:timing` with PowerPoint's five level tree, the presets of R01 6.4 and `p:bldP build="p"` for By paragraph, all through the OOXML post process (R01 6, R05 5 to 6). Perfect PPTX writes neither. The HTML export gains a `#ts-motion` schedule, generated keyframes, a second standalone script and an `autoplay` option with Google's eight intervals and Loop (R05 9.2). ODP writes `smil:type` and `anim:par` from the same schedule (R09 2.2). |
| 0.7 | Media, the blocks | A `media` block with `kind: 'audio' \| 'video'`, `source` (a stored asset or a YouTube id), `poster` and `playback` (R05 3), and a `MediaAsset` record in `deck.assets` discriminated by `kind` (R11 1.4). Formats: `mp4`, `webm`, `mp3`, `m4a`, `wav`; `mov`, `ogg`, `mkv`, `avi`, `flac`, `aac` refused with a sentence (R11 1.1). |
| 0.8 | Media, the dialogs | Insert > Audio opens a dialog with Upload and By URL tabs (Google's Drive picker has no standalone form; the store is the standalone Drive). Insert > Video opens Google's three tabs: Search YouTube (disabled with the clause "Search needs a YouTube Data API key" until Kevin decides), By URL (a YouTube link or an https media URL) and Upload (in Google's Google Drive position). Format options gains Audio playback (Start playing, Volume when presenting, Loop audio, Stop on slide change, Hide icon when presenting) and Video playback (Play with on click, automatically, manual; Start at; End at; Mute audio) with Google's labels and defaults (R02 a.1, a.2). |
| 0.9 | Media, the rules | Uploads pass the media sniff and Turboslide's own container parsers, never a decoder, under `largestAudioBytes` 25 and 50 MB, `largestVideoBytes` 25 and 200 MB, `mediaBytes` 300 MB per deck (R11 1.2, 1.3, 1.7); hosted files over 4.5 MB go browser to Blob through the presigned path built this round (R11 1.8); URLs pass `safeFetch` with the allow list gaining `www.youtube.com` (oEmbed only) and `i.ytimg.com`; YouTube plays through the IFrame API on `youtube-nocookie.com` under the terms' rules; the poster of a YouTube block is Turboslide's own frame with the title (R11 4). |
| 0.10 | Templates | Insert > Templates and the toolbar's Templates button open the Templates pane of the right sidebar; Insert > Building blocks opens the Building blocks pane; the home page gains a Template gallery page with the headings Personal, Work and Education; File > New > From template gallery opens it in a new tab (R02 b.1). Eight templates ship with real slides, the Sales pitch of fourteen slides first (section 3.3); about thirty building blocks in nine categories are groups of native blocks that Ungroup splits (section 3.2). |
| 0.11 | Import | `import.pptx` reads a PPTX through the store's `readZip`, `@xmldom/xmldom` and the inverse of the export tables (R04); `slide.import` gains `sourceFile`; the Upload tabs of Open, Import slides and the home page accept `.pptx`; the Import slides dialog is Google's two steps with "Select slides: All", None, the count, "Keep original theme" (`theme: keep`, else `adopt`) and "Import slides" (R02 c.1). The report lists every dropped or substituted object with the slide, the shape and the reason, shown as "N objects imported, M shown differently, K dropped" with Details (R04 11). |
| 0.12 | Import theme | The Themes panel's Import theme button takes a PPTX or a Turboslide deck, shows the themes the file holds, and writes a theme record (twelve colours, two fonts) into the deck's "In this presentation" list (at most five, Google's cap); picking one applies it as `themeEdits` (R03 4.7). |
| 0.13 | Page setup | `Deck.page?: { width, height, preset }` in sheet pixels, absent meaning 1600 by 900; presets keep the height at 900: Standard (4:3) 1200 by 900, Widescreen (16:9) 1600 by 900, Widescreen (16:10) 1440 by 900; Custom takes inches, centimeters, points or pixels (the sheet pixel, on Kevin's list); objects keep their coordinates; every export reads the page (R08 3). |
| 0.14 | Print | The print preview's layout dropdown offers 1 slide without notes, 1 slide with notes and handouts of 2, 3, 4, 6 and 9 per page, Landscape and Portrait, Include skipped slides, Hide background, Download as PDF and Print; the pages are laid out on Letter or A4 by one pure function the route and the PDF share (R08 4). |
| 0.15 | ODP and SVG | ODP through a Turboslide writer in `packages/export/src/odp/` fed by the scenes, verified through the existing LibreOffice loop, in both modes; SVG of the current slide from the scene with `<text>` per line and three text modes, `embed` the default (R09). |
| 0.16 | Preferences | Tools > Preferences with Google's General and Substitutions tabs, stored per principal on the round three record with a `localStorage` mirror; autocorrect as a pure rule engine whose corrections revert on the first undo and on Backspace; twelve default substitutions written by Turboslide (R10 1 to 3). |
| 0.17 | Spelling and language | The spell check card over nspell in a Web Worker with Change, Change all, Ignore, Ignore all and Add to dictionary; Underline errors through the CSS Custom Highlight API; a Personal dictionary dialog; File > Language as a submenu writing `deck.set /language`; seven languages ship, German and Italian wait on Kevin's licence decision (R10 4 to 5). |
| 0.18 | Dictate, Accessibility, Dictionary | Tools > Dictate speaker notes over the Web Speech API with the on device option where the browser offers it; Turn on screen reader support draws the Accessibility menu with Google's Verbalize rows over a live region; Turn on braille support changes the filmstrip's accessible names; Tools > Dictionary is a side panel over the Wiktionary REST endpoint behind an allow list entry, with the Look up link as its fallback (R10 6 to 8). |
| 0.19 | Explore | Tools > Explore stays omitted because Google retired it on 2024-01-30; its successor, the tool finder, is Search the menus (Alt+/), which gains deck text results and a prefilled Find and replace row (R10 9). Kevin may ask for the row anyway (section 13). |
| 0.20 | Help pages | Help > Training opens `/help/training` and Help > Updates opens `/help/updates`, two prerendered Turboslide pages fed from the repository (section 5.12). |
| 0.21 | Equation | Insert > Equation, marked `turboslide: true` because Google Slides has no equation editor (R06 3): an `equation` block storing LaTeX, rendered as MathML Core through Temml, edited under Google Docs' toolbar (New equation, Greek letters, Miscellaneous operations, Relations, Math operators, Arrows) with the backslash grammar and the thirteen Google aliases; the Editable text PPTX carries `a14:m` OMML with a PNG fallback through the post process (R06 8, R03 6). |
| 0.22 | Edit theme | Slide > Edit theme and View > Theme builder open an editor mode over a `themeEdits` record and `customLayouts` on the deck, with Google's Colors dropdown of twelve names mapped onto the tokens, Fonts, Insert > Placeholder inside the mode, Rename, New, Duplicate, Rename and Delete layout; the renderer emits one override stylesheet so every surface follows (R03 4). |
| 0.23 | The second theme | A second built in theme, id `ts-plate`, built from round four's construction (the plate cut lower left, the one cell rail, Inter 500 with `cv11` and `ss01`), on the GT grid so no object moves, with an empty corner slot by default and the Turboslide mark as a toggle under Edit theme; the panel name and the mark toggle are Kevin's (R03 5, SPEC-4 7). |
| 0.24 | Chat | Join chat opens a Chat side panel over the realtime channel: messages are a room message type, never document content, not saved beyond the session, with the comment caps and abuse logging; the row needs the `comment` capability (section 8). |
| 0.25 | Present on another screen | Both Slideshow rows flip to Now over the Window Management API, disabled at runtime where the API is absent with today's drag clause (R11 7). Camera and Speaker spotlight flip to Now over `getUserMedia` after the `Permissions-Policy` header opens `camera=(self)` and `microphone=(self)` on the editor and present routes (R11 6). |
| 0.26 | Deferred engineering | The live monochrome hero, the per deck card, the 320 px twin variant, the deck index on the blob tier, field INP and Lighthouse CI, the crate's `ditherPicture` patterns, the error diffusion and halftone families, Reflection and Recolor, nested groups and the WebSocket transport behind its flag are designed in section 9 with what each needs; none needs a decision from Kevin except the hosts they run on. |
| 0.27 | The menu model | 35 rows flip from Later or Omit to Now, one shared clause per retired stub is deleted, the Accessibility menu leaves `OMITTED_MENUS` behind a setting, and 18 rows stay Omit with a reason that names the Google service or the retirement (section 10). |
| 0.28 | Acceptance | Parity audit rows for every flipped row; `motion.spec.ts` in present mode; the import fixture set with fidelity numbers (fixture 5 round trips at 100 percent of ids, texts and positions within 1 px); the exports verified in the container (motion legs, media, ODP, equations); the layout shift gate at zero on every new surface; the perf budget rows holding with Temml, nspell, the motion script and the theme mode as lazy chunks (section 11). |

## 1. Motion

### 1.1 The document shape

```ts
// packages/schema/src/deck.ts, SlideBase (additive at version 1, SPEC 7.7)
transition?: {
  kind: 'none' | 'dissolve' | 'fade' | 'slideRight' | 'slideLeft' | 'flip' | 'cube' | 'gallery';
  durationMs: number;               // 100 to 5000; the slider's value
};
animations?: Animation[];           // play order, the Motion panel's order

// packages/schema/src/motion.ts
export type AnimationEffect =
  | 'appear' | 'disappear' | 'fadeIn' | 'fadeOut' | 'flyIn' | 'flyOut'
  | 'zoomIn' | 'zoomOut' | 'spin' | 'playMedia';
export type Animation = {
  id: string;                       // a slug unique on the slide
  blockId: string;
  effect: AnimationEffect;
  direction?: 'left' | 'right' | 'top' | 'bottom';   // flyIn and flyOut only
  trigger: 'click' | 'afterPrevious' | 'withPrevious';
  durationMs: number;               // 100 to 5000
  byParagraph?: true;               // text carriers only
};
export const TRANSITION_KINDS, ANIMATION_EFFECTS, ANIMATION_TRIGGERS, MOTION_STOPS = { slow: 2000, medium: 1000, fast: 500 };
```

Google's fifteen types are the nine effects with a direction: Fly in from left is `flyIn` with `left`, Fly out to bottom is `flyOut` with `bottom`. The panel prints Google's fifteen labels; the file stores the pair because the OOXML preset is one id with a subtype (R01 6.4) and the CSS is one keyframe with a translate sign. `kind: 'none'` on a transition is how Apply to all slides clears every slide.

Validation (`validate.ts`, new codes `motion`): a `blockId` that names no block on the slide, a `byParagraph` on a block without a Text, a `direction` on an effect other than fly, a `playMedia` on a block that is not `media`, a duration outside 100 to 5000, and an `animations` list over 200 entries are `invalid` at severity 2. `slide.set` on `/transition` and `/animations` is the write path; the mutation ops are unchanged (R07 1.7).

### 1.2 The Motion panel

The panel is `packages/chrome/src/MotionPanel.tsx`, a `panel('Motion')` effect, 320 px wide on the right (the side panel convention of R08 B10), title Motion, an X at the top right. It follows the selection: the Slide Transition section reads the current slide, the Object Animations section reads the selected objects.

| Control | Google's label and behaviour | Turboslide's implementation |
| --- | --- | --- |
| Slide Transition header | "Slide Transition" | a section heading |
| Transition type | a dropdown, default None, items Dissolve, Fade, Slide from right, Slide from left, Flip, Cube, Gallery (R01 2) | `slide.setTransition { slideId, kind, durationMs }`; picking None writes `kind: 'none'`, which the renderer treats as absent |
| Speed slider | "drag the slider" (R01 2); Slow, Medium, Fast marks (third parties) | a range 100 to 5000 ms with three tick labels, the seconds in the tooltip, `slide.setTransition` on release; the row is hidden while the kind is None as Google's is (unverified) |
| Apply to all slides | a button (R01 2) | `slide.applyTransitionToAll { slideId }` writes one `slide.set` per slide in one write |
| Object Animations header | "Object Animations" | a section heading |
| Animation rows | collapsible rows "Fade in (On click)", top first, in play order (R01 3) | one row per `animations[]` entry; the header names Google's type label and trigger |
| Add animation | "Add animation", or "Select an object to animate" when nothing is selected (R01 3) | `animation.add { slideId, blockIds, effect: 'appear', trigger: 'click', durationMs: 1000 }`; several selected objects add one row each with the same settings |
| Type dropdown | the fifteen types | `animation.set { slideId, animationId, effect, direction }` |
| Start dropdown | On click, After previous, With previous | `animation.set { trigger }` |
| By paragraph | a checkbox for text objects | `animation.set { byParagraph }`; absent on a block without a Text |
| Speed slider | the same slider | `animation.set { durationMs }` |
| Reorder handle | six dots at the right of the header, drag up and down | `animation.move { slideId, animationId, to }`; keyboard: Alt+Up and Alt+Down on the focused row (a Turboslide addition, `turboslide: true`, because a drag has no keyboard form) |
| Remove | a trash icon in the expanded row | `animation.remove { slideId, animationId }` |
| Play | "Play" at the bottom, "Stop" while running; Enter continues a waiting click step (R01 2, 3) | `motion.play` (window only): the canvas runs the schedule with the present layer's CSS; Enter or a click advances a step; Stop or Esc returns every object to rest |
| Media rows | a video set to Play automatically appears in the list (R02 a.2) | a `playMedia` entry; `media.setPlayback { start: 'auto' }` appends it, `start: 'click'` or `'manual'` removes it |

The filmstrip shows a small motion glyph (Heroicons `i-play-circle` from the sprite, never Google's icon) beside a slide whose `transition.kind` is not none or whose `animations` is not empty, and under the thumbnail in Grid view (R01 1). The context menus gain Google's rows: the filmstrip's Transition (row 11, exists as `slide.transition`, flips), the object menu's Animate (row 14, new id `block.animate`, label "Animate", `google: 'Animate'`, R08 marks the label unverified). Insert > Animation adds the default animation and opens the panel; View > Motion opens it; Slide > Transition opens it scrolled to the transition section; the toolbar's Transition button toggles it and stays pressed while open.

### 1.3 The schedule

`compileMotion(slide, blocks): MotionSchedule` is R05 4's pure function, in `packages/render/src/motion.ts` so the render package (framework free) owns the one truth:

- A `click` animation opens a new step; `withPrevious` joins the current step at delay 0; `afterPrevious` joins it at the previous effect's end. A first animation with `afterPrevious` or `withPrevious` joins step 0, which plays on entry.
- `byParagraph` expands into one effect per paragraph of the block's Text (the paragraph count from `parseText`, the same count `text.ts` writes as `a:p` elements); with `click` each paragraph is a step, with `afterPrevious` they chain in one step, with `withPrevious` they play together.
- Entrance effects put the block in `hiddenAtStart`; exit effects hide it at their end; `spin` never changes visibility; `playMedia` lasts the media's remaining length or the step's length when looping.
- The output also names `stepsCount`, which the presenter console and `view.present` report.

`motionCss(schedule, page)` writes the keyframes once for the show, the HTML export and the panel's Play (R05 9.4): opacity for fades, translate past the sheet edge for flies (the offset from the block's box against the page, R08's variable sheet), scale about the centre for zooms, one full turn for spin, and the transition forms: a Bayer sprite mask stepped over 64 frames for Dissolve (the house pattern from `@turboslide/effects/bayer`), a crossfade for Fade, `translateX` by one page width for the two slides, `rotateY` halves with `backface-visibility: hidden` for Flip, two faces under `preserve-3d` for Cube, a translate with a few degrees of Y rotation and a 0.9 scale at the midpoint for Gallery. Easing is `ease-in-out` for transitions, `ease-out` for entrances and `ease-in` for exits (Turboslide's, unverified against Google).

### 1.4 Present mode and Presenter view

- The Slideshow (`apps/studio/src/components/Slideshow.tsx`) keeps a `step` beside `index`; `presentKeyAction` (`presentKeys.ts`) returns `{ type: 'next' }` and `{ type: 'previous' }` as today and the controller consumes a step before moving the play index (R05 9.3). Every `data-step="k"` class change is on the sheet root; `hiddenAtStart` and the per step classes exist only in the show and the HTML runtime, never in `renderSlide` (the still rule).
- Going back: Left arrow, Backspace and Page up reverse one step (the state before the step's effects, entrance objects hidden again, exit objects shown again), then the previous slide at its last step. This is PowerPoint's `onPrev` seek and what the written file does; Google's behaviour is unverified (R01 8 item 5).
- A digit jump, Home and End land on the slide at step 0 with its entry step played (PowerPoint's rule; Google unverified). The slide list dropdown does the same.
- The transition plays when the slide changes forward; going back plays the outgoing slide's transition reversed at the same duration (a Turboslide choice; Google unverified). Reduced motion cuts both.
- Auto-play: the Options menu's Auto-play submenu with every 1, 2, 3, 5, 10, 15 and 30 seconds and every minute, Play, and Loop, set again each time the show starts (R01 4); each tick is one `advance(1)`, so a step and a slide change take one tick each; a click or a key pauses it. `autoPlayStub` retires.
- Presenter view: Previous and Next drive the same `advance`; the current slide clone shows the audience's step state (the `state` message gains `step` and `steps`); the next slide preview is at rest; a small "Step 2 of 4" line under the slide number is a Turboslide addition (`turboslide: true`); the channel adds `step` to `state` and a `media` message (R11 5.6).
- The pen: the present toolbar's pen (Google's "Turn on the pen", a stub today) draws strokes on a canvas over the stage in `--pt-ink` at 3 px, cleared on slide change and by Esc, mirrored to the audience over the channel as `stroke` messages; nothing is stored. Downloads inside the show: Download as PDF and Download as PPTX open the Download dialog over the show's surround without leaving the show. Both stubs retire.
- The audience route `?present=1` and the standalone file start without a user activation; the media controller's muted fallback of R11 5.2 applies; motion needs no activation.

### 1.5 The still rule

Every still is the resting document (0.5). The rule is enforced where the state lives: `renderSlide` never reads `animations` except to emit `data-motion="1"` on the slide root for the filmstrip glyph; the present layer and the standalone motion script are the only writers of step classes; the print document, the sheet route, the thumbnails, the PDF, the Perfect raster, the JPEG, the SVG and the ODP Perfect page render through `renderSlide` alone. `pdf/build.ts`'s gate and `PAGE_RASTER_BUDGETS` are unchanged. The residual of an Editable text export names the objects whose still state differs from their state after the last step (an object with a Disappear, an audio with Hide icon), so an agent sees the rule applied.

### 1.6 The Editable text OOXML post process

New modules in `packages/export/src/ooxml/`, in the pattern of `shapes.ts` (R05 11): `ids.ts` (`renumberShapeIds` walks every `cNvPr` after every insertion and rewrites connector ids), `transition.ts` (`writeTransition` after `</p:clrMapOvr>`, declaring `xmlns:mc` and `xmlns:p14` on `p:sld`), `timing.ts` (`writeTiming` after the transition). The order in `pptx/build.ts`: strip, adjust values, columns, connectors, alt text, media, equations, grouping, slide name, hidden title, renumber, transition, timing, then the package passes.

| Google | Choice element | Fallback | Notes |
| --- | --- | --- | --- |
| None | no element | | |
| Dissolve | `<p:dissolve/>` | same | |
| Fade | `<p:fade/>` | same | `thruBlk` not written |
| Slide from right | `<p:push dir="l"/>` | same | the new slide enters from the right (R05 2) |
| Slide from left | `<p:push dir="r"/>` | same | |
| Flip | `<p14:flip dir="l"/>` | `<p:fade/>` | |
| Cube | `<p14:prism dir="l" isContent="0" isInverted="0"/>` | `<p:fade/>` | PowerPoint's convex whole slide form |
| Gallery | `<p14:gallery dir="l"/>` | `<p:fade/>` | |

`spd` from the duration: under 750 ms `fast`, under 1500 ms `med`, else `slow` (R05 5). `advTm` is never written: Google's autoplay is a session setting.

The timing tree is R01 6.3's five levels with the presets of R01 6.4 (Appear entr 1 0, Disappear exit 1 0, Fade in entr 10 0, Fade out exit 10 0, Fly in entr 2 with 1, 2, 4, 8, Fly out exit 2 with the same, Zoom in entr 23 16, Zoom out exit 23 32, Spin emph 8 0), the behaviours quoted there from PowerPoint authored files, `nodeType` from the trigger, the click group and the `onBegin` condition for a step 0 that plays on entry, `delay` for After previous as the previous effect's end, `p:bldP` per animated text shape with `build="p"` and `p:pRg` per paragraph for By paragraph. Targets resolve by object name through `listShapes`, a group by the group's own id (`groupShapes` returns it), a table or chart by its `p:graphicFrame`; an animation on a block that exported as no shape is skipped and the residual names it (R05 6.3).

Media nodes (`p:audio`, `p:video`, `p:cMediaNode` with `vol`, `mute`, `numSld`, `showWhenStopped`, `repeatCount`) and the `mediacall` effect for automatic playback follow R05 7.4. `export.check` gains the "round five" read back: per slide the transition element and duration, the effect count with `presetID`, the `nodeType` histogram, the `bldP build="p"` count, the media references, the `mc:AlternateContent` count by `Requires` (R05 10 leg 1). The container leg converts the file to ODP with LibreOffice and asserts `smil:type`, `presentation:preset-id` and `presentation:node-type` against LibreOffice's own names (R05 10 leg 2, R09 2.2).

### 1.7 The autoplay HTML export

`build.run` and `export.run` for HTML gain `motion: 'keep' | 'drop'` (default keep) and `autoplay?: { intervalMs: 1000 | 2000 | 3000 | 5000 | 10000 | 15000 | 30000 | 60000; loop?: boolean }`. The document carries `<script type="application/json" id="ts-motion">` and `<style id="ts-motion-css">` only when a slide has motion, and a second standalone script `packages/viewer/standalone/motion.ts` ported like `runtime.ts`; the frozen runtime gains one hook, `window.__tsMotion?.advance(dir)` before `go(k)`, recorded in SPEC 5.3's amendment list (R05 9.2). The Download dialog's Web page row gains "Auto-advance slides" with Google's eight intervals, "Start slideshow as soon as the player loads" and "Restart the slideshow after the last slide", the three controls of Google's Publish to web dialog (R01 4), which is where Google offers autoplay in a file. Media in the file follow R11 5.7 (`inline`, `url`, `poster`).

### 1.8 Actions and CLI

| Action | Group | Input | Output | CLI |
| --- | --- | --- | --- | --- |
| `slide.setTransition` | slide | `slideId`, `kind`, `durationMs?`, `baseRevision` | `{ revision }` | `turboslide slide transition <slideId> fade --duration 1000` |
| `slide.applyTransitionToAll` | slide | `slideId`, `baseRevision` | `{ revision, slides }` | `turboslide slide transition <slideId> --apply-to-all` |
| `animation.add` | block | `slideId`, `blockIds`, `effect?`, `direction?`, `trigger?`, `durationMs?`, `byParagraph?`, `baseRevision` | `{ revision, animationIds }` | `turboslide animation add <slideId> <blockId>... --effect fadeIn --trigger click` |
| `animation.set` | block | `slideId`, `animationId`, the partial fields, `baseRevision` | `{ revision }` | `turboslide animation set <slideId> <animationId> --trigger afterPrevious --duration 500` |
| `animation.move` | block | `slideId`, `animationId`, `to` (an index), `baseRevision` | `{ revision, order }` | `turboslide animation move <slideId> <animationId> --to 0` |
| `animation.remove` | block | `slideId`, `animationId` or `blockId`, `baseRevision` | `{ revision }` | `turboslide animation remove <slideId> <animationId>` |
| `animation.list` | block | `slideId` | the list with the compiled step index of each entry | `turboslide animation list <slideId> --json` |
| `motion.compile` | render | `slideId` | `MotionSchedule` | `turboslide motion compile <slideId>` |
| `motion.play` | view (window) | `slideId`, `step?` | `{ steps }` | none |
| `view.present` | view | gains `step?` | reports `step`, `steps` | `turboslide view present --slide <id> --step 2` |
| `export.run`, `build.run` | export | `motion`, `autoplay` (HTML) | the report gains `motion` counts | `turboslide export html --autoplay 5000 --loop`; `export pptx --motion drop` |

MCP tools are `deck_<action>` with the same objects. Every one runs on a checkout through the CLI's store actions and hosted through `runDeckAction`; the window owner for `motion.play` is the editor.

### 1.9 Tests

`motion.test.ts` (schema): the validator codes; `compileMotion` on twelve slides (click chains, with and after, By paragraph in each trigger, an entrance then an exit on one block, media loops). `motion-css.test.ts`: every effect produces one keyframe block and no CSS reaches `renderSlide`. `ooxml/timing.test.ts`: the tree's XPath of R01 6.3 for every effect, the ids unique, the `bldP` count, the fallback wrapper. `motion.spec.ts` (e2e, section 11.2). The parity audit gains the six entry points and the panel's controls by `data-control` id.

## 2. Media

### 2.1 The blocks and the asset record

The `media` block is R05 3's shape and the `MediaAsset` is R11 1.4's, both additive: `deck.assets` becomes a union discriminated on `kind`; `validateDeck` gains the three media rules; the standalone build and the bundle skip media assets where they handle twins. The block joins `CATALOG` as label Audio or Video by kind, group Figures, allowed in `content`, export `mixed`. A `spotlight` block (R11 6) is a positioned shape with a placeholder picture, group Figures, export `raster`.

### 2.2 The dialogs

| Dialog | Google | Turboslide |
| --- | --- | --- |
| Insert > Audio | the Drive picker filtered to `.mp3` and `.wav` (R02 a.1) | `dialog('Insert audio')`: tabs Upload (a drop zone and a file button; the accepted list in one sentence) and By URL (an https URL of an audio file on an allow listed host); Select confirms; the speaker icon lands as a 96 by 96 px block near the slide's centre |
| Insert > Video | "Insert video" with Search YouTube, By URL, Google Drive; Select (R02 a.2) | `dialog('Insert video')`: Search YouTube (disabled, "Search needs a YouTube Data API key", the tab drawn because Google's is), By URL (any form of R11 4.1, or an https media URL), Upload; a preview with the live YouTube thumbnail in the editor only; Select inserts a 960 by 540 block at the centre |
| Camera | Insert > Image > Camera (the device camera, R03 1 corrects the omit reason) | `dialog('Camera')`: the preview, a device picker, Capture, Use photo (R11 6) |

### 2.3 Format options

The inspector's section for a media block replaces Text fitting with Google's section (R02 a.1, a.2; the fields of R05 3):

| Section | Control | Default | Writes |
| --- | --- | --- | --- |
| Audio playback | Start playing: On click, Automatically | On click | `playback.start` |
| | Volume when presenting, 0 to 100 | 100 | `playback.volume` |
| | Loop audio | off | `playback.loop` |
| | Stop on slide change | on | `playback.stopOnSlideChange` |
| | Hide icon when presenting (only with Automatically, per Slidesgo; kept so) | off | `playback.hideIcon` |
| Video playback | Play: Play (on click), Play (automatically), Play (manual) | Play (on click) | `playback.start` |
| | Start at, End at as `m:ss` fields | absent | `playback.startMs`, `endMs`; a new poster is captured on change |
| | Mute audio | off | `playback.mute` |

Size & rotation and Position apply as to every object; a video keeps its aspect from the corners and has no crop or mask (Google's rule, R02 a.2). Every control is `media.setPlayback`; `block.set /playback/...` writes the same field.

### 2.4 Intake and security

R11 1 and 2 are adopted whole: the accepted extensions, the signature sniff in `packages/store/src/media/sniff.ts` shared by the store's bundle scan and the headless intake, the own parsers for duration, size and codecs, the content types in the Blob table, the asset route and `INLINE_TYPES`, `putAssetFile` streaming from disk, the four quota rows and the deck cap, the presigned client upload to the private store's `uploads/` prefix with `allowedContentTypes` and `maximumSizeInBytes`, the checkout route's Range support, `media-src` in the CSP, and the `tmp` tier refusing media with its sentence. URLs pass `safeFetch` with its pinned lookup; the `assetKey` prefix for media on restricted decks is the recommendation and Kevin's decision 3 in R11.

### 2.5 Present playback

The show and the standalone motion script mount `<audio>`, `<video>` and the YouTube iframe over the poster when the slide shows and unmount them when it leaves; audio with Stop on slide change off lives in `#ts-media-layer` outside the slide DOM; Start at and End at run through `currentTime` and a re-armed timer; a click on a `manual` media toggles it and never advances; `auto` media are `playMedia` steps of the schedule; a `NotAllowedError` plays muted with the one line toast (R11 5). The presenter console shows a row per playing medium with Pause and Restart and never holds an element.

### 2.6 Posters and stills

A video's poster is the frame at Start at, captured in the editor through a `crossorigin` video element and a canvas, stored as a picture asset with role `thumb`, recaptured when Start at changes; the fallbacks are Turboslide's own frame with the play glyph, the title and the duration (R11 3). An audio's poster is Turboslide's own speaker glyph in the theme's ink. The render worker captures `webm` posters only, because its Chromium lacks H.264 and AAC (R11 summary 2). Stills follow 0.5.

### 2.7 Exports

Editable text PPTX writes each medium through the post process (`ooxml/media.ts`): the poster picture becomes the media `p:pic` with `a:audioFile` or `a:videoFile`, the `p14:media` extension with `p14:trim`, the two relationships and a stored media part, plus the timing nodes of R05 7.4; YouTube through pptxgenjs's online form with the poster; over the 300 MB deck cap the largest files travel as posters and the residual names them (R05 7, 8). Perfect, PDF, JPEG, PNG and SVG show the poster. ODP writes `draw:plugin` with the file under `Media/` (R09 2.2). HTML follows R11 5.7.

### 2.8 Actions

R11 8.1's table stands: `media.insert`, `media.setPlayback`, `media.poster`, `media.info`, `media.list`, `camera.capture`, `view.presentOnScreen`, each with CLI, MCP and window forms; the presigned grant is a route the CLI wraps. `spotlight.insert { slideId, shape?, pos? }` inserts the spotlight block.

## 3. Templates and building blocks

### 3.1 Insert > Templates and the Templates pane

The 2025 sidebar's Templates pane is the model (R02 b.1): a vertical strip at the right end of the toolbar carries pane icons for Templates and Building blocks (the other Google panes, Stock images, Image generation, Speaker spotlight and Slides recordings, are Google services and are not drawn). Insert > Templates and the toolbar's Templates button (top left of the toolbar, Google's position since November 2024) open the pane: a list of templates by purpose with a thumbnail of their first slide; choosing one shows its slides as thumbnails; a click inserts one slide after the current slide through `slide.import { sourceDeckId: 'templates/<id>', slideIds }`; "Insert all slides" inserts them all. Slides land in the current theme (`slide.import`'s `ensureAssets` path copies pictures).

### 3.2 Insert > Building blocks

A building block is "a formatted piece of content, like agendas, quotes, or key statistics", composed of native objects, inserted by click or drag, split by Ungroup (R02 b.1). The pane lists nine categories (Google names six on its page, the press names three more): Agendas, Lists, Key statistics, Quotes, Headlines, Text callouts, Calls to action, People, Cards. Each block is a JSON file under `decks/templates/building-blocks/<category>/<id>.json` holding a `blocks: Block[]` array whose members carry `pos` relative to a 1600 by 900 sheet and one `pos.group` tag, plus `name`, `category` and `box`. A click inserts the group centred on the content box through `buildingBlock.insert { slideId, id, pos? }`, which is one `block.insert` per member in one write with a fresh group tag; a drag drops it at the pointer. The pane renders each block's thumbnail through `renderSlide` on a blank slide. About thirty blocks ship: three or four per category, built from headings, paragraphs, text boxes, shapes, rules, `plain` lists, `rows`, `table`, `icon` and picture placeholders (a `box` with a dashed hair stroke labelled "Add a picture"), in both appearances through the tokens.

### 3.3 The Sales pitch starter deck

A full template, `decks/templates/sales-pitch/`, fourteen slides on GT layouts with real copy in sentence case, the deck a rep opens and rewrites. Every text is a placeholder sentence that reads as copy, never "Lorem ipsum"; the pictures are the GT template's two tone twins until the user replaces them.

| # | Layout | Title | Content |
| --- | --- | --- | --- |
| 1 | `title` | Sales pitch | The heading "Company name", the lead "One sentence on what you sell and for whom", the mark slot |
| 2 | `plain` | Agenda | Five ruled items: The problem, What we built, How it works, Results, Next steps |
| 3 | `split` | The problem | A heading and three lead sentences naming the cost of the status quo |
| 4 | `cols` (5/7) | Who this is for | Left, the buyer and the user in two paragraphs; right, a `rows` block of three role and need pairs |
| 5 | `figure` | The product | A picture placeholder with a caption "The product in use" |
| 6 | `rows` | How it works | Four ruled rows: Connect, Configure, Run, Review, each with a one line value |
| 7 | `tiles` (3 across) | Results | Three tiles with a big number, a label and a one line note (`big-number` styling) |
| 8 | `statement` | Customer quote | One quoted sentence at 72 px and a credit line |
| 9 | `table` | Comparison | A 4 by 4 table: the criteria against Today, Alternative and Us with header row |
| 10 | `rows` | Pricing | Three rows: Starter, Team, Enterprise, with a price and one line each |
| 11 | `matrix` | Timeline | A 4 by 3 matrix of quarters against workstreams with check marks |
| 12 | `details` | The team | Three picture placeholders with name and role captions |
| 13 | `plain` | Next steps | Three numbered items: Pilot scope, Success criteria, Decision date |
| 14 | `closing` | Thank you | The closing plate with contact lines |

The template record (`template.json`, R07 4.5's `TemplateRecord`) gains `category: 'work' | 'education' | 'personal'`, `tags`, `cover` (the first slide) and `slideCount`; `DECK_TEMPLATES` becomes the list of folders under `decks/templates/` read at boot, and `deck.create { from }` accepts any id. The seven other templates use the same archetypes with their own copy: Work: Status report (8 slides), Consulting proposal (10), Case study (8), Product roadmap (8); Education: Lesson plan (8), Book report (6); Personal: Portfolio (8). The GT brand deck stays the Personal category's General presentation and Blank stays first.

### 3.4 The Template gallery page

`/decks/templates` is the gallery: the heading "Template gallery", a Recent templates strip when the browser has opened one, then the three category headings Personal, Work and Education in Google's documented order (R02 b.1, the third party list predates the 2024 refresh and is unverified), each a row of cards with the first slide's thumbnail, the name and the slide count; a click runs `deck.create { from }` and opens the editor, Google's "a copy of the chosen template opens". The home page's strip keeps the Blank card, then the featured templates (the eight), with the "Template gallery" link at the strip's right; `/decks#templates` redirects to the page. Settings gains "Display recent templates on home screens" (Google's toggle) as a per browser setting hiding the strip.

### 3.5 File > New > From template gallery

The row is Now already and routes to `/decks#templates`; it changes to `route('/decks/templates', true)`, a new tab as Google opens it (R02 b.1). File > New's other rows are unchanged.

### 3.6 Actions

`template.list` (the records with category and cover), `template.get { id }` (the record with slide thumbnails' render ids), `template.insert { id, slideIds | 'all', after }` (the pane's insert over `slide.import`), `buildingBlock.list`, `buildingBlock.insert`; `deck.create { from }` widened. CLI: `turboslide template list`, `turboslide template insert sales-pitch --slides 3,7 --after <slideId>`, `turboslide block building-block insert agendas/five-items --slide <id>`. MCP `deck_template_*`, `deck_building_block_*`. The templates are read only decks: `deck.set` on `templates/*` is refused.

## 4. PPTX import

### 4.1 The reader

R04 is adopted as written: `packages/import/src/pptx/` with `package.ts` (the store's `readZip` with its inflate cap, content types, relationships, `validatePackage`), `xml.ts` (`@xmldom/xmldom` 0.9.12, namespace aware, DOCTYPE refused), `theme.ts`, `inherit.ts` (shape, layout placeholder by `idx` then `type`, master placeholder, master `txStyles`, `defaultTextStyle`), `units.ts` (1 px per 7,620 EMU; `sheet: 'fit' | 'match'` per R08 3g), `text.ts`, `shapes.ts`, `pictures.ts`, `tables.ts`, `charts.ts`, `groups.ts`, `diagrams.ts`, `motion.ts`, `media.ts`, `math.ts`, `report.ts`, `import-pptx.ts`. Every imported slide is a canvas slide (`freeform`, `template: 'blank'`, every block with `pos`).

### 4.2 The mapping

R04 5 is the mapping table and `docs/import-pptx.md` becomes its user facing form. The rows that land on this round's new fields rather than `ext`: `p:transition` to `transition` with the fold of R01 6.6 (every ISO and `p14` type onto Google's seven, the rest to Fade with a report line); `p:timing` to `animations` with `entr` 1, 2, 10, 23, `exit` 1, 2, 10, 23 and `emph` 8 kept, other entrances to Fade in, other exits to Fade out, `path`, other `emph`, `verb` and `mediacall` dropped and reported; `a:audioFile`, `a:videoFile` and `p14:media` to a `media` block with the file when it passes the caps, else the poster; `a14:m` to an `equation` block with `mathml` set and `tex` empty (R06 8.5); `p:grpSp` nesting to the group tree of section 9.9; `a:reflection` and `a:duotone` to the picture fields of section 9.8; `p:sldSz` to `deck.page` under `match`. Text sizes stay exact, colours snap to tokens within a channel difference of 12 in `adopt` mode and stay hex in `keep` mode.

### 4.3 The report

`import-report.json` beside the deck and the action's output: `source` (producer, application version, slide size, sections, embedded fonts), `slides` (per slide: the imported block count, the `dropped` rows and the `substituted` rows, each `{ shape, reason }`), `fonts` (every source family with its run count), `theme` (the twelve resolved hexes and two font names for Import theme), `validation` (the package issues read past). The dialog shows "42 objects imported, 3 shown differently, 1 dropped" with a Details link to the report card, the pattern the Download dialog uses; the snackbar after an Open reads "Some PowerPoint features look different in Turboslide" with the same Details link (Google's banner wording is Google's; this sentence is Turboslide's).

### 4.4 Fixtures and fidelity

R04 10's five fixtures under `packages/import/src/__fixtures__/pptx/` generated by `scripts/pptx-fixtures.py` in the fonts venv (never at runtime) plus the exporter, with expected documents and reports; the sixth class of saved PowerPoint, Google Slides and Keynote files under `.turboslide/inbox`, read when present. Fidelity numbers the verifier records (section 11.3): fixture 5 round trips at 100 percent of block ids, texts, table cells and chart values with every position within 1 px; fixtures 1 to 4 deep equal their expected documents; the producer files report their counts per producer; every produced slide renders without an error and with a non blank thumbnail.

### 4.5 The Upload tab and Import slides

- File > Open's Upload tab and the home page's Upload tab accept `.pptx` beside `.zip`; a `.pptx` runs `import.pptx` with `sheet: 'match'` (the new deck takes the file's size) and opens the editor with the snackbar of 4.3. The refusal sentence `IMPORT_PPTX` retires from `strings.ts`, the dialogs, the snackbar list and `menu-model.test.ts`.
- File > Import slides is Google's two steps (R02 c.1): step one the Presentations tab (this studio's decks with search, list and grid toggles, sort) and the Upload tab (a `.pptx` or a bundle); step two a thumbnail grid rendered from `import.pptx { dryRun: true }` through the renderer, "Select slides: All", None, a Back button, the selected count, the "Keep original theme" checkbox and the "Import slides" button; imported slides land after the current slide under `sheet: 'fit'`, with one sentence when the source size differs (R08 3g). Keep original theme checked means `theme: keep` (colours as hex, sizes exact) and the source's theme record joins "In this presentation" without being applied; unchecked means `adopt`.
- Refusals: `.ppt`, `.pps`, `.pot`, `.pptm`, `.ppsm`, `.potm`, an encrypted package, `.odp`, a zip64 archive, a package over 200 MB or inflating over 400 MB, a package without `ppt/presentation.xml`, each a sentence (R04 9).

### 4.6 Import theme

The Themes panel's Import theme button (bottom right, R02 c.1) opens the same picker family: Presentations and Upload; the second step shows the themes the file holds (a PPTX's `ppt/theme/theme*.xml` by name with a rendered tile of the deck's first slide under that theme; a Turboslide deck's theme and its imported records) and the "Import theme" button. The result is a `ThemeRecord { name, colors, fonts, source }` appended to `deck.importedThemes[]` (at most five, Google's cap per file; the sixth is refused with a sentence) and shown in the panel's "In this presentation" group; clicking a record applies it as `themeEdits.colors` and `themeEdits.fonts` through `theme.set`. Turboslide applies one theme to every slide because its layouts are code; a PPTX's layouts are not imported as custom layouts this round and the report says so (R03 4.7). The "your own image" option of Google's dialog is not offered.

### 4.7 Actions

`import.pptx` (R04 9's fields: `file` or `url`, `into`, `theme`, `snapToLadder`, `includeMasterShapes`, `includeHidden`, `includeComments`, `splitMixedSizes`, `truncateTables`, `keepPageRaster`, `sheet`, `dryRun`), `slide.import` with `sourceFile` and `slideIndexes`, `theme.import { file | deckId, themeIndex? }`. CLI: `turboslide import deck.pptx --into <id> --theme keep --sheet match`, `turboslide slide import --file deck.pptx 3,5-7 --after <slideId>`, `turboslide theme import deck.pptx`. MCP `deck_import_pptx`, the widened `deck_import_slides`, `deck_import_theme`. Hosted, the upload takes the bundle ticket route with the `.pptx` content type and the action runs server side.

## 5. Page, print, downloads and the remaining rows

### 5.1 Page setup

R08 3 is adopted: `Deck.page` with the height rule, `deckPage(deck)`, `grid(page)` and `geometry(page)` replacing the eleven constants, the stage emitting `--ts-sheet-w` and `--ts-sheet-h`, the 123 constant sites resolved as derive, data or stay, objects keeping their coordinates with `deck.setPageSize { objects: 'keep' | 'fit' | 'maximize' }`, guides dropped or scaled, every export reading the page, the per deck card containing the first slide. The dialog (`dialog('Page setup')`) carries Google's four labels, Custom's Width, Height and unit dropdown (Inches, Centimeters, Points, Pixels), a readout sentence, Cancel and OK (Google's help prints OK; Apply is the third party reading, unverified), and the second step of R08 3d only when a shrink would push objects off the sheet. The row `file.pageSetup` flips to Now; the clause "The GT theme is 16:9 at 1600 by 900" retires. Rulers read the page and the unit preference (R08 3f).

### 5.2 Handouts and notes pages

R08 4 is adopted: `printLayout({ page, layout, paper, orientation, order })` in `packages/render/src/print-layout.ts` with the geometry tables of R08 4.5 for Letter and A4 in both orientations, 36 pt margins, 18 pt gutters, the footer band with the deck title and `n of m`, the 3 per page layout with ruled lines, the notes page with the slide capped at 45 percent of the printable height over 11 pt notes, Hide background forcing the light appearance and a transparent paper while keeping the frame, Include skipped slides over `slideOrder`. The layout dropdown's rows: "1 slide without notes", "1 slide with notes", "Handout: 2 slides per page", 3, 4, 6, 9 (Google's exact handout strings are unverified and the fixture marks them); Orientation with Landscape and Portrait; the Paper dropdown (Letter, A4) is a Turboslide addition, `turboslide: true`. `export.run` for PDF gains `layout`, `orientation`, `paper`, `order`, `hideBackground`; the gate for handout pages is per cell against an area averaged reference (R08 4.11). `HANDOUT_STUB` retires.

### 5.3 ODP

R09 2 path c: `packages/export/src/odp/` (`package.ts` with `mimetype` first and stored, `styles.ts`, `text.ts`, `shapes.ts`, `table.ts`, `chart.ts`, `notes.ts`, `media.ts`, `motion.ts`, `build.ts`, `export-odp.ts`) over the same scenes as the PPTX, both modes (Perfect through `loext:opacity` on the invisible runs and the page raster; Editable text through `draw:frame` text boxes with the LibreOffice baseline model), transitions and animations from `compileMotion` with LibreOffice's preset ids pinned from the container round trip, presets as `draw:custom-shape` with `draw:type="ooxml-<prst>"` and the full `draw:enhanced-path` once the shape interpreter of SPEC-2 0.57 lands (B4 builds it this round, section 12), verified through `soffice --convert-to pdf` and the existing gate. The Download row becomes `now('file.download.odp', 'ODP Document (.odp)', dialog('Download'))` with the LibreOffice sentences; `export.run` gains `format: 'odp'`; `export.check` accepts `.odp` with the manifest and mimetype assertions. The path b oracle (LibreOffice converting the Editable text PPTX) diffs `content.xml` in the container.

### 5.4 SVG

R09 3 path b: `render.slide { format: 'svg', text: 'embed' | 'outline' | 'link' }` writing from the scene one `<text>` per line with `textLength` per run and the measured `SceneLine.baseline`, shapes and charts as the renderer's paths, icons and the mark as sprite symbols, rasters as PNG data URIs, the frame and counter, `<title>` and `<desc>`, no script, no external reference; `embed` inlines InterVariable as an `@font-face` data URI (about 470 KB), `outline` writes glyph paths through fontkit 2.0.4 (the catalog gains it after `pnpm audit`), `link` writes family names. The Download row becomes `now('file.download.svg', 'Scalable Vector Graphics (.svg, current slide)', action('render.slide', { format: 'svg' }))`; the text mode default lives in Preferences under "SVG text" (a Turboslide row). The fidelity gate is the PDF gate's values for `embed`; `export.check` accepts `.svg`.

### 5.5 Preferences

R10 1 to 3: `dialog('Preferences')` with the General tab (Automatically capitalize words, Automatically correct spelling, Automatically detect links, Automatically detect lists, Use smart quotes; Use custom autofit preferences with Do not autofit, Shrink text on overflow, Resize shape to fit text; Use measurement unit preferences with Inches, Centimeters, Pixels; and the Turboslide row SVG text) and the Substitutions tab (Automatic substitution, the Replace and With table with per row checkboxes and Remove, the empty first row adding a pair). Preferences live on the principal record with a `localStorage` mirror; `prefs.get` and `prefs.set` address them by JSON pointer; `spellcheck` and `announce` migrate from the per browser list. The autocorrect engine runs on the trigger keystroke in InlineText and the notes textarea as its own `text.splice` burst so the first Cmd Z and a Backspace revert the correction alone (Google's rule, R10 1.4); the twelve default substitutions are R10 2.2's without an em dash row. `text.autocorrect` applies the rules to a Text, a slide or the deck for agents.

### 5.6 Spelling

R10 4: `packages/spelling` over nspell 2.1.5 in a Web Worker and in Node, dictionaries served as static files per language and loaded lazily, the reading order walk with its skip rules, the card at the top right with Change and Change all, Ignore and Ignore all, the Turboslide row Add to dictionary, Ctrl+' and Ctrl+; stepping (leaving `OMITTED_SHORTCUTS`), Underline errors through `CSS.highlights` with a decorator fallback, the Personal dictionary dialog over `preferences.spelling.dictionary` and `.turboslide/dictionary.txt` on a checkout, the `text/spelling` lint rule at severity 1. Actions `spelling.check`, `spelling.replace`, `spelling.ignore`, `dictionary.add`, `dictionary.remove`, `dictionary.list`.

### 5.7 Language

`Deck.language?: string` (BCP 47), absent as `en-US`; File > Language flips to a submenu of radio rows for English (United States), English (United Kingdom), Español, Français, Nederlands, Português (Brasil), Português (Portugal), plus Deutsch and Italiano when Kevin ships their dictionaries; it picks the dictionary, the quote style, the sheet's `lang`, `a:rPr lang` in the PPTX, `fo:language` and `fo:country` in the ODP and `<html lang>` in the HTML (R10 5). Units stay a preference, not a consequence of the language.

### 5.8 Dictate speaker notes

R10 6: `tools.dictateNotes` flips to `client('dictate')`; the microphone box over the notes pane with a language dropdown and the round button, `continuous` recognition with interim text shown grey and final text written through the pane's `slide.set /notes`, the on device path through `available()`, `install()` and `processLocally` where the browser offers it, one privacy sentence stating where the audio goes, the unsupported sentence where neither `SpeechRecognition` nor the prefixed form exists. The `Permissions-Policy` header opens `microphone=(self)` on the editor routes.

### 5.9 Explore and the tool finder

Tools > Explore stays Omit with the reason "Google retired Explore on 2024-01-30; Search the menus (Alt+/) finds tools and text in the presentation". Search the menus is Google's tool finder (R10 9): the palette gains a group Text in this presentation listing up to five deck text hits by slide with "Find and replace <query>" as its first row, opening Edit > Find and replace prefilled. `open-explore` stays in `OMITTED_SHORTCUTS`. The brief's "Explore as a Turboslide search over the deck" is met by this group; a row labelled Explore is on Kevin's list because a row Google removed is not parity.

### 5.10 Accessibility settings and the Accessibility menu

R10 7: Turn on screen reader support (Ctrl+Alt+Z, Cmd+Option+Z) draws the Accessibility menu as the eleventh menu (Alt+A, Ctrl+Option+A) with Verbalize to screen reader (Verbalize selection Ctrl+Alt+X, Verbalize selection formatting Ctrl+Alt+A then F, Verbalize from cursor location Ctrl+Alt+R), Move to next and previous comment, Move to next and previous formatting change, and the Turboslide row Speak selection aloud over `speechSynthesis` off by default; the verbalisation writes a `role="status"` live region and announces "Screen reader support enabled". Turn on braille support (Ctrl+Alt+H) changes the filmstrip's accessible names to "Slide n, title, layout". The screen magnifier stays omitted with the reason "Your operating system's magnifier follows the caret; View > Zoom enlarges the slide". `Menu` gains `setting?: MenuSetting` so the bar draws the menu only while the toggle is on.

### 5.11 Dictionary

Google's Dictionary is a side panel with a search field, the definition, part of speech, pronunciation, synonyms and antonyms, Ctrl+Shift+Y (R02 d.4). The Google faithful form is the panel, so this proposal takes R10 8's Wiktionary REST option as the design and its Look up link as the fallback: `panel('Dictionary')` on the right with a search field prefilled from the selection, results from `dictionary.lookup { word, language }`, which the studio answers through `/api/define` proxying `https://<ll>.wiktionary.org/api/rest_v1/page/definition/<term>` through `safeFetch` (the host on the allow list, a `User-Agent`, HTML stripped to text, a 24 hour cache), each entry with part of speech and numbered definitions, a Wiktionary attribution line (CC BY-SA) and a link to the page; pronunciation, synonyms and antonyms are not in that endpoint and the panel omits them. When the proxy is off (`TURBOSLIDE_DICTIONARY=link`, the checkout default without egress) the row opens the Wiktionary page in a new tab and the action returns `{ url }`. The provider is R03 decision 4 and stays on Kevin's list; the recommendation here is the panel on the hosted studio.

### 5.12 Help > Training and Help > Updates

Two prerendered routes in the studio, in the shape of `/home` (SPEC-4 0.43): `/help/training` renders a walkthrough built from the four skill references (`skills/turboslide-*/references/`) and the fifteen README screenshots, in sections named after the menus, with the key of every row from `keys.ts`; `/help/updates` renders `docs/updates.md`, a release notes file the integrator appends per round with the date, the round and the rows that flipped, generated in part from `menu-model` diffs (`scripts/updates-from-model.mjs` prints the rows whose status changed since a tag). Rows: `now('help.training', 'Training', route('/help/training', true))`, `now('help.updates', 'Updates', route('/help/updates', true))`; both pages are in `NOINDEX_ROUTES`' complement (indexable) and under the `/home` budgets.

### 5.13 The remaining Later and Omit rows

| Row | Google | Turboslide |
| --- | --- | --- |
| View > Guides > Edit guides | a dialog with Vertical and Horizontal tabs, a position field and a colour per guide, X, Add new guide, Done (SPEC-2 12) | `dialog('Edit guides')` over `Deck.guides` through `deck.guides`; the colour is a Turboslide extension of `DeckGuides` to `{ x: number[] \| { at, color }[] }`, additive; the unit follows the preference |
| Format > Align & indent > Indentation options | Left, Right, First line and Hanging indents in a dialog | `typography.indentRight`, `firstLine`, `hanging` (px) on `Typography`; the ruler's indent markers on `Rulers.tsx`; `text.indent` gains the fields; the PPTX writes `marL`, `marR`, `indent` |
| Format > Bullets & numbering > List options > Restart numbering, Edit prefix and suffix | a field for the start, a dialog with Prefix and Suffix | `PlainBlock.start`, `prefix`, `suffix`; `text.list` gains them; the PPTX writes `startAt` and the prefix and suffix as the scheme's text where OOXML has one (`arabicParenR` and kin) and reports the rest |
| Slideshow > Present on another screen, Presentation display options | Chromecast and Google's screen picker | R11 7 over the Window Management API; the rows disabled at runtime where the API is absent |
| File > Version history > Delete this and older versions, Delete history | context rows | `version.delete { upTo \| all }` with the re-authentication rule and a confirm (SPEC-3 0.45); records thin out anyway after 30 days |
| Insert > Image > Camera | the device camera | R11 6 |
| Insert > Speaker spotlight | a shape showing the presenter's camera in a Meet presentation | R11 6, a `spotlight` block; on Kevin's list as R03 decision 9 places it |
| Star (title row) | a per person list | a `starred: string[]` on the principal record; the star toggles `account.star { deckId, on }`; the home page gains a Starred view beside Recent and Owned; Google's tooltip "Star" |
| Edit points, Change shape (a curve or polyline) | point handles | `points` handles on `curve` and `polyline` shapes in the editor's Gestures, writing `shape.set /points`; Change shape on a path picks another line kind |
| The cell border selection chord | a per edge picker | the Format options Border section gains an edge picker (top, bottom, left, right, inner, outer) writing `cells[].border` per edge; `TableCell.border` widens to per edge, additive; the PPTX writes `a:lnL`, `a:lnR`, `a:lnT`, `a:lnB` |
| The special characters drawing box | draw a character to find it | a 160 by 160 canvas in the dialog matched against a stroke feature table of the Math and Arrows categories by a nearest neighbour over 8 direction histograms; Turboslide's own recogniser, not Google's, so its result list says "Best guesses" |
| Auto-play, the pen, downloads in the show | present toolbar | section 1.4 |
| Make available offline | a service worker pin | Kevin's list (R03 proposed row) |
| Q&A history | audience Q&A | Kevin's list (SPEC-3 17 waits a month of comment limits) |

## 6. The equation block and its editor

R06 12.1 is adopted: Temml 0.13.5 bundled in `packages/render` and loaded lazily in the studio on the first equation; the `equation` block (`tex`, `display`, `size`, `color`, `alt`, `mathml`, `shadow`) positioned like a text box; `<math>` in the DOM on every surface with `Temml-Local.css` scoped and Latin Modern Math shipped like Inter only when a deck holds an equation (the sans alternative is R06 12.2, Kevin's); the toolbar (New equation, Greek letters, Miscellaneous operations, Relations, Math operators, Arrows, and a Turboslide More dropdown) replacing the text toolbar while an equation is edited, the source field in the inspector with a live preview, Tab between empty groups, the backslash grammar and the thirteen `GOOGLE_ALIASES`; View > Show equation toolbar as a `toggle('equationToolbar')`; Cmd+Option+Shift+E (Ctrl+Alt+Shift+E) marked `turboslide: true`; the Editable text PPTX's `mc:AlternateContent` with `a14:m` OMML from Turboslide's own MathML Core to OMML transform in `ooxml/math.ts` and the PNG Fallback shape; the Perfect raster and the PDF unchanged; the report's `equations: { native, raster }`. The label Math operators is Google's help page's (R06 13 item 3). Actions `equation.render` and `equation.symbols`, plus `block.insert` of type `equation` and `block.set /tex`. The Insert row sits after Special characters; its tooltip says the row is Turboslide's own. The `html` escape block's sanitizer keeps `math` forbidden; the equation renderer is the one writer of `<math>`.

## 7. Edit theme and the second theme

### 7.1 Edit theme

R03 4 is adopted: an editor mode (`mode: 'theme'`) over `themeEdits` (name, colors per appearance, fonts, frame toggles and inset, the mark slot's kind and box, the counter's show, side, format and box, the chips toggle, the type levels, the background) and `customLayouts` (canvas slides with `placeholder` blocks, a name, a `hidden` flag for a built in layout Delete hides); the filmstrip shows one Theme tile and the layouts; the toolbar carries Background, Colors, Fonts, Insert placeholder (Title, Subtitle, Body text, Slide number, Image), Rename and the X; right click on a layout offers New layout (Ctrl+M inside the mode), Duplicate layout, Rename layout and Delete layout; the canvas ground is `--pt-panel-ink`; changes are commits like any other. The Colors dropdown lists Google's twelve names in Google's order over the token mapping of R03 4.2; the Fonts control lists the faces the fonts package ships. `themeCss(deck)` emits one override stylesheet the string renderer, the viewer, present mode, the thumbnails, the PDF, the HTML and the Perfect PPTX all draw through; the Editable text export writes the edited values into `clrScheme`, `fontScheme` and the masters. Actions `theme.get`, `theme.set`, `theme.rename`, `theme.reset`, `theme.import`, `layout.create`, `layout.duplicate`, `layout.rename`, `layout.delete`, `layout.setPlaceholder`, `layout.list`. The rows `slide.editTheme`, `view.themeBuilder` and `insert.placeholder` flip to Now (Placeholder is present only in the mode).

### 7.2 The second theme

R03 5 is adopted with R08 3c's correction: `THEMES = ['gt-ink-paper', 'ts-plate']`, tokens keyed by theme id, a second `sheet.css` and `stage.css` under `packages/theme/src/ts-plate/`, `stageHtml(id)`, per theme PPTX master names, a second group in the Themes panel; the GT grid kept so Change theme moves nothing; the frame reduced to the mark's two rules at 56 px from the left and bottom edges; the plates stored as fractions of the page (`W/8, H/2, W/2, 3H/8`); Inter 500 with `cv11` and `ss01` for display; the same ten token values; the corner slot empty by default with `mark.kind: 'turboslide'` as an Edit theme toggle. The panel's name and the default of the toggle are Kevin's (section 13). `decks/templates/blank-plate` is the second blank template so File > New picks a theme.

## 8. Chat inside the file

Google's Join chat sits in the collaborators popover of the title row and opens a Chat side panel; the messages are not saved with the file (Google's help says the chat history is not kept when the file closes; this proposal did not read that page in this session, so the statement is unverified and the verifier lists it). The standalone form:

- `title.presence.joinChat` flips to `now(..., panel('Chat'))`, visible when at least one other participant is present, the row's `when` predicate requiring the `comment` capability (commenters and editors; viewers see the row disabled with "Commenters and editors can chat").
- The panel lists messages with the author's identity mark and name (the round three identity), the time, and a composer with Enter to send; mentions through the round three `@` picker; a message is 2,000 code points at most, 20 mentions, plain text with links detected.
- Transport: a `chat` message type on the realtime channel (`packages/realtime/src/protocol.ts`), never a mutation and never a version record; the room keeps the last 200 messages in memory (the `memory` and `redis` tiers, a Redis list with the room's TTL) so a late joiner sees the session's history; on the `blob` tier the message rides the ops stream as a non document entry within the 10,000 retained entries and is dropped at the next checkpoint's compaction. Nothing lands in `decks/<id>/`.
- Limits and logging: `chatPerMinutePerDeck` 60 per principal, the comment body cap, the abuse log line of comments (`log.ts` fields: principal, deck, length, mentions), the kill switch `comments` also gating chat.
- Actions `chat.send { text }` and `chat.list` (the retained messages), transports all, so an agent in the room can read and answer; CLI `turboslide chat send "text" --from <studio>`, MCP `deck_chat_send`, `deck_chat_list`.
- `CHAT_LATER` retires.

## 9. The deferred engineering

| # | Item | Design | What it needs |
| --- | --- | --- | --- |
| 9.1 | The live monochrome hero (SPEC-4 7) | On `/home`, after the largest contentful paint and on an idle callback, when the document is visible, WebGL2 exists, the viewport is 900 px or wider and reduced motion is off, `MaterialMount` mounts `paper:liquid-metal` in the `ink-paper` preset under the still twin and crossfades in over `--pt-dur-enter`; the mount runs through the two tone screen shader pass (the same Bayer threshold as the twin) so the live frame is two colours; on `visibilitychange` hidden or reduced motion it unmounts and the twin stays. | The shader split of SPEC-4 0.44 landed; a measurement showing `/home` under 600 KB of decoded JavaScript with the deferred chunk counted; the perf budget row gains the deferred chunk. |
| 9.2 | The per deck card `/og/deck/:deckId.png` (SPEC-4 7, R08 3e) | A Chromium render of the deck's first slide contained in the 1200 by 630 card frame on `--pt-panel-ink`, keyed by `?r=<revision>` with `Cache-Control: public, s-maxage=31536000, immutable` and without `r` at `s-maxage=60`; served only for decks whose `generalAccess.mode` is `link` or `open` (a restricted deck serves the site card); rendered through the render worker under the renders quota; `/deck/$deckId` sets `og:image` from its loader with the revision. | The private store's URL rules (the render reads assets server side, never a public URL); a 4 s budget row; the render worker's queue. |
| 9.3 | The 320 px twin variant (SPEC-4 7) | `AssetVariant` gains `thumb-320` per twin (a palette PNG for two tone, JPEG for continuous) written at intake and by `picture.materialize --twins` for existing decks; the filmstrip clone's `<img>` carries `srcset` with the 320 and the 1600 twins and `sizes` from the clone width; the standalone build inlines the 1600 only. | Nothing external; the image bytes budget row for `/edit` gains the filmstrip's total. |
| 9.4 | The deck index on the blob tier (SPEC-4 7) | `decks/index.json` on the public store (titles are public on a link) written with `ifMatch` by `deck.create`, `rename`, `trash`, `restore`, `remove` and by every commit that changes the title, the slide count, the appearance or the first slide; `/decks` reads one `get` and falls back to the `folders()` walk when the index is missing or a listed deck's `head` disagrees; rebuilt by `turboslide deck reindex`. | Nothing external; the blob write rate (about 15 commits per second) is respected because the index write is coalesced per instance over 2 s. |
| 9.5 | Field INP and Lighthouse CI (SPEC-4 7) | `web-vitals/attribution` in the client posts `{ name, value, rating, route, attribution: { eventTarget, eventType, loadState } }` for INP, LCP and CLS to `POST /api/vitals` (1 KB body, a 10 percent sample, no identity, rate limited per IP), appended to `vitals/<date>.jsonl` on the private store; `scripts/vitals-report.mjs` prints p75 per route and `perf-budget.mjs` reads the INP row against a 200 ms p75 ceiling as a report; `.github/workflows/lighthouse.yml` runs Lighthouse CI on `/home`, `/new`, `/decks` and `/deck/gt-brand` against the node-server build with assertions (performance 90 on `/home`, CLS 0, the JS budget) and uploads the report. | GitHub Actions minutes on the public repository; the workflow's Chromium; `@vercel/functions` `waitUntil` for the append. |
| 9.6 | The `ditherPicture` patterns in the crate (SPEC-4 7) | `bayer4`, `blue64` (the pinned 64 by 64 texture as a constant), `random` (a seeded xorshift), `strength`, `steps` and the tone LUT in `crates/turboslide-native/src/dither.rs` behind `bind_napi.rs` and `bind_wasm.rs`; the wasm worker covers the block dither; a parity test asserts agreement 1.0 with the TypeScript stages on the fixture crops. | The CI rebuild job of SPEC-4 0.38 and the committed binaries. |
| 9.7 | Error diffusion and halftone families (SPEC-3 17) | `DITHER_PATTERNS` gains `floyd-steinberg`, `atkinson` and `stucki` (serpentine error diffusion over the tone image at the chosen `cell` as a pre downsample, since diffusion has no per cell threshold) and `halftone-dot`, `halftone-line` (a screen function of `angle` 45 by default and `cell` as the pitch); implemented in TypeScript and in the crate with the parity test; the inspector's Pattern dropdown lists them; the export twins are unchanged because a two tone image is a two tone image. | Nothing external; the preview budget of 100 ms is measured per pattern and the worker falls back to Bayer above it. |
| 9.8 | Reflection and Recolor (SPEC-2 12) | `ShotAdjust` gains `reflection?: { transparency, distance, size }` (Google's three sliders) and `recolor?: RecolorPreset` (No recolor, Grayscale, Sepia, Negative, and light and dark duotones of ink, ink-2, titanium and the four semantic hues, built from the theme's colours as Google builds its list from the theme's); the renderer draws the reflection as a mirrored `<img>` under a `mask-image` gradient and the recolor through an SVG `feColorMatrix` filter; the Editable text PPTX writes `a:reflection` in the picture's `a:effectLst` and `a:duotone`, `a:grayscl` or `a:biLevel` in the blip through the post process (native), and the Perfect raster follows the renderer; the importer's `a:reflection` and `a:duotone` rows land on the fields. | Nothing external. |
| 9.9 | Nested groups (SPEC-2 12) | `SlideBase.groups?: { id, parent?, name? }[]` beside `Position.group` (the tag names the innermost group); Group on a selection that contains a group creates a parent; Ungroup removes one level; selection picks the outermost group and a double click enters a level (Google's behaviour); `groupShapes` writes nested `p:grpSp` recursively and the importer keeps the tree; the ODP and SVG writers nest `draw:g` and `<g>`. | Nothing external; the canvas Gestures gain the level state. |
| 9.10 | The WebSocket transport behind `TURBOSLIDE_REALTIME_WS` (SPEC-3 17) | An upgrade route on the node-server preset through Nitro's `crossws` handler carrying the same message types as the SSE stream in both directions (the client's batch as a frame instead of a POST); off by default; on Vercel functions the flag is ignored because functions do not upgrade; in dev a sidecar `ws` server on 4322 stands in for the Nitro handler until TanStack Start's dev server story is settled; WAF rule r19 exists. | The long lived worker host on Kevin's list for a hosted use; a checkout uses it today. |

## 10. The menu model

### 10.1 Rows that flip to Now

| Id | From | To | Section |
| --- | --- | --- | --- |
| `slide.transition`, `toolbar.transition`, the filmstrip Transition row | Later, `STILL_SLIDES` | `panel('Motion')` | 1.2 |
| `view.motion` | Omit | `panel('Motion')` | 1.2 |
| `insert.animation` | Omit | `action('animation.add')` then the panel | 1.2 |
| `block.animate` (object menu) | new | `action('animation.add')` | 1.2 |
| `title.slideshow.presentOnAnotherScreen` | Later | `action('view.presentOnScreen', { screen: 'other' })`, disabled at runtime without the API | 5.13 |
| `title.slideshow.displayOptions` | Omit | `dialog('Presentation display options')` | 5.13 |
| `insert.audio`, `insert.video` | Later, `NO_MEDIA` | `dialog('Insert audio')`, `dialog('Insert video')` | 2.2 |
| `insert.image.camera` | Omit | `dialog('Camera')` | 2.2 |
| `insert.speakerSpotlight` | Omit | `action('spotlight.insert')` | 5.13 |
| `insert.templates`, `insert.buildingBlocks` | Later, `START_FROM_GT` | `panel('Templates')`, `panel('Building blocks')` | 3 |
| `file.new.templateGallery` | Now, `/decks#templates` | `route('/decks/templates', true)` | 3.5 |
| `file.download.odp`, `file.download.svg` | Later, `DOWNLOAD_FORMATS` | `dialog('Download')`, `action('render.slide', { format: 'svg' })` | 5.3, 5.4 |
| `file.pageSetup` | Later | `dialog('Page setup')` | 5.1 |
| `file.language` | Omit | a submenu of radio rows writing `deck.set /language` | 5.7 |
| `file.versionHistory.deleteOlder`, `deleteHistory` | Later, `DELETE_VERSIONS_LATER` | `action('version.delete')` with a confirm | 5.13 |
| `view.guides.edit` | Later, `GUIDES_BY_HAND` | `dialog('Edit guides')` | 5.13 |
| `view.themeBuilder`, `slide.editTheme` | Omit, Later | `client('themeMode')` | 7.1 |
| `insert.placeholder` | Omit | a submenu inside the theme mode | 7.1 |
| `insert.equation`, `view.equationToolbar` | new, `turboslide: true` | `action('block.insert', { type: 'equation' })`, `toggle('equationToolbar')` | 6 |
| `format.alignIndent.indentationOptions` | Later | `dialog('Indentation options')` | 5.13 |
| `format.bulletsNumbering.listOptions.restart`, `prefixSuffix` | Later, `NUMBERING_STARTS` | `dialog('Restart numbering')`, `dialog('Edit prefix and suffix')` | 5.13 |
| `tools.spelling.spellCheck` | Later | `panel('Spell check')` | 5.6 |
| `tools.spelling.personalDictionary` | Omit | `dialog('Personal dictionary')` | 5.6 |
| `tools.preferences` | Later | `dialog('Preferences')` | 5.5 |
| `tools.dictionary` | Omit | `panel('Dictionary')` (or the link) | 5.11 |
| `tools.dictateNotes` | Omit | `client('dictate')` | 5.8 |
| `tools.accessibilitySettings.screenReader`, `braille`, `speakAloud` (new) | Omit, Omit, new | `toggle('screenReader')`, `toggle('braille')`, `toggle('speakAloud')` | 5.10 |
| The Accessibility menu | `OMITTED_MENUS` | a `Menu` with `setting: 'screenReader'` | 5.10 |
| `help.training`, `help.updates` | Omit | `route('/help/training', true)`, `route('/help/updates', true)` | 5.12 |
| `title.presence.joinChat` | Later, `CHAT_LATER` | `panel('Chat')` | 8 |
| `title.star` | Omit | `action('account.star')` | 5.13 |

Retired clauses: `STILL_SLIDES`, `NO_MEDIA`, `START_FROM_GT`, `DOWNLOAD_FORMATS`, `NUMBERING_STARTS`, `GUIDES_BY_HAND`, `CHAT_LATER`, `DELETE_VERSIONS_LATER`, "The browser's dictionary applies", "Your browser underlines misspellings and offers suggestions on right-click", "Text fitting is set per text box in Format options; the ruler reads inches", "One face and English copy rules; spelling follows the browser", "The browser's screen reader works on the DOM", "The GT theme is 16:9 at 1600 by 900", "The footer mark, the slide counter and the rails belong to the GT theme", "Theme builder only", "Meet only", "Section 0.5", the `OMITTED_MENUS` reason for Accessibility, the `IMPORT_PPTX` sentence, `HANDOUT_STUB`, `autoPlayStub`, `penStub`, `downloadStub`. `menu-model.test.ts` asserts each is gone; the Later count falls from 21 to 3.

### 10.2 Rows that stay Later

`file.email.collaborators` (and its container `file.email`) and `tools.activityDashboard.viewers`, both waiting on Kevin (the mail sender; the privacy decision to record views), with their clauses unchanged.

### 10.3 Rows that stay Omit, with the reason

| Id | Reason |
| --- | --- |
| `title.move`, `file.move`, `file.addShortcut` | Drive's folder tree; a Google service |
| `title.meet`, `title.gemini`, `extensions.appsScript`, `extensions.appSheet`, `insert.chart.fromSheets`, `insert.image.drivePhotos` | A Google service |
| `title.record` | Records to Drive in Workspace; the standalone recording of R11 6 stores large video and is Kevin's decision |
| `file.email.thisFile` | Sends the file by mail; needs the mail sender |
| `file.approvals` | Workspace Enterprise only |
| `file.offline` | A service worker pin; Kevin's list |
| `insert.image.stockWeb` | Google's image search and stock library; a licensed provider needs a key and a licence review (Kevin) |
| `tools.explore` | Retired by Google on 2024-01-30; Search the menus is the tool finder |
| `tools.linkedObjects` | Lists objects linked to Sheets, Docs and Slides; no linked sources |
| `tools.qaHistory` | Audience Q&A waits on a month of comment limits in production (SPEC-3 17) |
| `extensions.addOns`, `.get`, `.manage`, `extensions.installedAddOns` | The Workspace Marketplace; Turboslide's extension surface is Extensions > Agent access |
| `help.privacyPolicy`, `help.termsOfService` | The texts and the domain are Kevin's |
| The screen magnifier checkbox | The operating system's magnifier |

## 11. Acceptance

### 11.1 The parity audit

`scripts/gslides-parity-audit.mjs` gains one row per flipped row of 10.1: the row is `now`, its effect fires (the panel or dialog opens by `data-control`, the action returns a revision, the route answers 200), and the tooltip carries the key. New surface rows: the Motion panel's fourteen controls, the two media dialogs' tabs, the Format options media sections, the Templates and Building blocks panes, the gallery page's three headings, the Import slides steps, the Page setup dialog's four labels, the print preview's dropdown rows and checkboxes, the Preferences tabs, the spell check card's four buttons, the Accessibility menu while the toggle is on, the equation toolbar's six dropdowns, the theme mode's toolbar, the Chat panel. The Later count asserted at 3 and the Omit rows each with a reason.

### 11.2 The motion e2e

`apps/studio/e2e/motion.spec.ts`: on a copy of the fixture deck, open the Motion panel through each of the six entry points; set Fade at 1000 ms on slide 2 and Apply to all slides, then read `slide.list` and assert every slide carries it; add Fade in on click to a text box, tick By paragraph on a three paragraph box, add Fly in from left with After previous on a shape, reorder by drag and by Alt+Up, remove one; Play in the panel and assert Stop appears and Enter advances; present: the first click reveals paragraph one (the others hidden by class), the third click plays the fly, the fourth changes the slide with the incoming slide's `is-entering` class held about 1000 ms; Left arrow reverses one step; the presenter window shows "Step 2 of 4" and its next preview is at rest; the JPEG of slide 2 shows every object; export the HTML with `--autoplay 1000 --loop`, open the file and assert the steps advance on the timer and the show restarts after the last slide; `export check` on the Editable text file counts one transition per slide and the effect nodes.

### 11.3 The import fixture set

`packages/import` tests over the five fixtures: fixtures 1 to 4 deep equal their expected documents after `canonicalJson` and their reports row for row; fixture 5's round trip equals the fixture deck at 100 percent of block ids, texts, table cells and chart values with positions within 1 px and no new report rows on the second pass; the oracle counts of `pptx-oracle.py` agree when the venv exists; the guards refuse the zip bomb, the DOCTYPE, the `javascript:` link, the `.pptm` and truncate the 21 column table. The verifier records the producer files' counts per producer in `VERIFICATION-5.md` (objects imported, shown differently, dropped) as the round's fidelity numbers.

### 11.4 The exports in the container

Step 25 grows: the fixture deck with motion and media exported in Editable text and converted to ODP by LibreOffice with the `smil:type`, `presentation:preset-id`, `presentation:node-type` and `draw:plugin` assertions (R05 10 leg 2); the ODP writer's output in both modes through `soffice --convert-to pdf` with Perfect pages under 0.1 percent and native within the block budgets, and the path b oracle diff; an equation deck's Editable text file measured with the equation region reported; the page 4:3 fixture in both PPTX modes and the PDF; a handout PDF's page count and per cell budget. The stills leg asserts the resting document.

### 11.5 The layout shift gate and the perf budgets

`layout-shift-audit.mjs` gains rows for the Motion panel opening and following the selection, the two media dialogs, the Templates pane, the gallery page, the Import slides steps, the Page setup dialog, the print preview switching layouts, the Preferences dialog, the spell check card, the theme mode entering and leaving, the Chat panel; every row at zero entries, under SPEC-3 6.1's nine rules (fixed slots, no late images without dimensions). `perf-budget.mjs` holds its rows: `/edit` under 2 MB decoded and the largest chunk under 600 KB because Temml, nspell and the dictionaries, the motion script, the ODP writer (server side), the theme mode, the equation toolbar and the panes are lazy chunks or server code; `/home` under 600 KB with the hero's deferred chunk counted; the image bytes rows with the 320 px variants; the idle budget unchanged; the INP row reported.

### 11.6 The check steps

`pnpm check` grows from 31 to 37: 32 motion (`packages/schema` motion tests, `packages/export` timing tests, `motion.spec.ts`, `export check` on the motion fixture); 33 media (R11 8.4's unit files, `media.spec.ts`, the fixture digests); 34 import (the fixture tests, the round trip gate, the oracle when present); 35 page, print and downloads (R08 3i's step, the ODP and SVG tests, `export check` on `.odp` and `.svg`); 36 text tools and equation (R10 10.4's step, the Temml snapshots, the OMML fixtures, `text-tools.spec.ts`, `equation.spec.ts`); 37 theme, templates and chat (`theme-css.test.ts`, the template records validate and every template renders, `theme.spec.ts`, `chat.spec.ts`). Steps 3, 5, 6, 18, 20, 21, 25, 26 and 27 grow as named above.

## 12. File ownership for six builders, an integrator and a verifier

The shape is MILESTONES-3's: a shared checkout, disjoint ownership, requests through `docs/gslides-parity/build-5/<key>.md`, never `pnpm install`, never a git write, each builder on their own dev server port with `TURBOSLIDE_STORE=tmp`, Playwright serialized through `.turboslide/e2e.lock`. Estimates are agent-hours judged from rounds two to four; the round is ten days: day 1 seams (the schema fields, the action entries with examples, the menu rows, the strings), day 2 merge 1, days 2 to 7 the parallel build, day 8 merge 2 and the verifier, day 9 the fixer round, day 10 the ship step.

### B1 Motion and the show (about 84 agent-hours)

Owns: `packages/schema/src/motion.ts` and the `transition` and `animations` fields in `deck.ts`, `validate.ts` (the `motion` codes); `packages/render/src/motion.ts`, `motion-css.ts`; `packages/chrome/src/MotionPanel.tsx` and its CSS; `packages/viewer/src/present/**` (`presentKeys.ts`, `presentModel.ts`, `presentSync.ts` with `step` and `stroke`, `PresenterConsole.tsx`, `PresentToolbar.tsx`, `strings.ts`), `apps/studio/src/components/Slideshow.tsx`, `DeckViewer.tsx` (the step advance), the present routes; `packages/viewer/standalone/motion.ts` and the one hook in `runtime.ts`; `packages/render/src/standalone.ts` (the `#ts-motion` emission); `packages/export/src/ooxml/{ids,transition,timing}.ts`, the order in `pptx/build.ts`, `check.ts`'s motion line, the ODP `motion.ts` (with B4); the pen and the in show downloads; `apps/studio/e2e/motion.spec.ts`.

Delivers: day 1 the fields, the nine actions, the panel's rows; day 3 `compileMotion` and the CSS with the panel's Play; day 4 the show's step model and the presenter's state; day 5 the OOXML writers and the read back; day 6 the HTML export and autoplay; day 7 the pen, Auto-play, the downloads, the e2e.

Acceptance: `cd packages/schema && ../../node_modules/.bin/vitest run motion`; `cd packages/render && ../../node_modules/.bin/vitest run motion`; `cd packages/export && ../../node_modules/.bin/vitest run timing transition`; `motion.spec.ts`; `turboslide export check` on the motion fixture's Editable text file printing the round five line.

### B2 Media, the camera and the screens (about 92 agent-hours)

Owns: `packages/schema/src/assets.ts` (the union), the `media` and `spotlight` blocks in `blocks.ts` and `catalog.ts`, the three media validator rules; `packages/store/src/media/**` (sniff, isobmff, ebml, mp3, wav, info), `bundle.ts` and `unpack.ts` (the media entries, the 500 MB cap if Kevin confirms), `blob-store.ts` and `blob-vercel.ts` (content types, `putAssetFile`, `cacheControlMaxAge`, multipart), `hosted.ts` (the deck index of 9.4); `apps/studio/src/server/upload.ts` (the presigned `blob` backend, the media grant), `ratelimit.ts` (the four rows and the deck cap), `headers.ts` (`media-src`, `frame-src`, `camera=(self)`, `microphone=(self)`), `apps/studio/src/routes/api/x.upload.$.ts`, `decks.$deckId.assets.$.ts` (Range, HEAD); `packages/headless/src/capture/shared.ts` (the allow list entries, `maxBytes` per kind); `packages/chrome/src/dialogs/{InsertAudio,InsertVideo,Camera,DisplayOptions}.tsx`, `inspector/media.tsx`; `packages/render/src/blocks/media.ts` (the poster root and the two glyphs under `packages/theme/assets/`); the media controller in the show and the standalone motion script (with B1); `packages/export/src/ooxml/media.ts`, `clean.ts` (the content type corrections); `packages/materials/src/actions.ts` (the media actions), `view.presentOnScreen`, `camera.capture`, `spotlight.insert`; the 320 px twin variant of 9.3; `apps/studio/e2e/media.spec.ts`; `fixtures/media/**`.

Delivers: day 1 the asset union and the block, the seven actions, the dialogs' rows; day 3 the sniff and parsers with fixtures, the intake paths, the content types; day 4 the dialogs and the Format options sections, the posters; day 5 the controller in the show and the standalone, YouTube; day 6 the PPTX media post process, the camera, the spotlight, the screens; day 7 the twin variant, the deck index, the e2e.

Acceptance: `cd packages/store && ../../node_modules/.bin/vitest run media bundle`; `apps/studio` server tests for the headers and the upload grant; `media.spec.ts`; `export check` counting `a:audioFile`, `a:videoFile`, `p14:media` and the media parts; the presigned upload of a 150 MB `webm` on a preview through the CLI recorded in `build-5/b2.md`.

### B3 Import and nested groups (about 84 agent-hours)

Owns: `packages/import/src/pptx/**` and its fixtures, `import-deck.ts`'s dispatch by source, `apps/cli/src/commands/import.ts`, `scripts/{pptx-fixtures,pptx-oracle}.py`; the `import.pptx` and `theme.import` actions and the `slide.import` extension in `actions.ts`; `packages/chrome/src/dialogs/{Open,ImportSlides}.tsx` (the Upload tabs, the two steps, the report card), `strings.ts` (the retired refusal), the home page's Upload tab (`decks.index.tsx`, a request to B6 for the strip file); `apps/studio/src/server/bundle-core.ts` (the `.pptx` ticket); the Import theme picker in `ThemesPanel.tsx` (with B6); `SlideBase.groups` and the group tree in `position.ts`, `canvas.ts`, `freeform.ts`, `packages/viewer/src/Gestures.tsx` (the level state), `packages/export/src/ooxml/groups.ts` (recursive), `docs/import-pptx.md`.

Delivers: day 1 the action rows, the Upload tabs' accept, the package and xml modules; day 3 text, shapes, pictures, tables, charts with fixtures 1 to 3; day 4 groups, diagrams, motion, media, math, fixture 4; day 5 the round trip of fixture 5, the report card, the dialogs; day 6 Import theme's reader side, the group tree; day 7 the producer inbox, the docs.

Acceptance: `cd packages/import && ../../node_modules/.bin/vitest run` (the five fixtures, the round trip gate, the guards); `turboslide import <fixture> --dry-run --json` printing the report; the parity audit's Upload tab rows; `ooxml/groups.test.ts` with two levels.

### B4 Page, print, ODP, SVG and the shape interpreter (about 96 agent-hours)

Owns: `Deck.page` in `deck.ts`, `deckPage`, `render.ts`, `canvas.ts`, `freeform.ts`, `diagrams.ts` (the page derivations), `scaleCanvas`; `packages/theme/src/tokens.ts` (`grid(page)`), `stage.css` (the custom properties), `packages/render/src/{geometry,stage,slide,print,print-layout}.ts`, `packages/viewer/src/{rulers-model,Sheet,LiveClone,snap,canvas-measure}.ts` and the sheet literals of `Editor.tsx` and `Gestures.tsx` (by request to B3 where they overlap), `packages/chrome/src/{Rulers,Overlay}.tsx`, `dialogs/PageSetup.tsx`, `dialogs/Download.tsx` (ODP), `apps/studio/src/routes/print.$deckId.tsx` and `print.css`; `packages/export/src/units.ts`, `pptx/masters.ts`, `images.ts`, `build.ts` (the page), `pdf/build.ts` (the layouts and the per cell gate), `odp/**`, `svg/**`, `scene/measure.ts` (`baseline`), `check.ts` (`.odp`, `.svg`, `--page`), `verify/**` (the page arguments, the ODP input); `packages/headless/src/{context,document,measure,screenshot,sheet}.ts`; `packages/schema/src/shapes/geometry.ts` (the interpreter of SPEC-2 0.57 over `definitions.ts`, replacing the box stub of `shapePath`, `textInset` and `sites`); the `deck.setPageSize` action, `export.run`'s PDF and ODP fields, `render.slide`'s svg fields; `decks/fixture/page-4-3`, `page-16-10`; `apps/studio/e2e/page-setup.spec.ts`.

Delivers: day 1 `Deck.page`, the action, the dialog rows, the export option rows; day 3 the derivations across the packages with the 16:9 gates green; day 4 the print layouts and the PDF options; day 5 the ODP writer's package, styles and text; day 6 the ODP shapes, tables, charts and the shape interpreter; day 7 the SVG writer and the gates.

Acceptance: `tokens.test.ts` for two pages; `print.test.ts` pinning R08 4.5; `cd packages/export && ../../node_modules/.bin/vitest run odp svg units`; `shapes.test.ts` asserting the 135 paths against the definitions; `page-setup.spec.ts`; step 35.

### B5 Text tools, the equation and the remaining Format rows (about 88 agent-hours)

Owns: new `packages/spelling/**`, `packages/schema/src/{autocorrect,autocorrect-lists,prefs,equation}.ts`, `blocks/equation.ts`, `Deck.language`, `Typography`'s indent fields, `PlainBlock`'s `start`, `prefix`, `suffix`, the per edge `TableCell.border`; `packages/identity/src/principal.ts` (the `preferences` and `starred` fields), `apps/studio/src/server/auth/principal.ts`; `packages/viewer/src/InlineText.tsx` (the trigger path), `packages/chrome/src/NotesPane.tsx` (the engine and the dictation box), `packages/chrome/src/dialogs/{Preferences,PersonalDictionary,EditGuides,IndentationOptions,RestartNumbering,PrefixSuffix}.tsx`, `SpellCheckCard.tsx`, `DictionaryPanel.tsx`, `EquationToolbar.tsx`, `inspector/equation.tsx`, `AccessibilityMenu` rows in `menus/model.ts` (the Tools, Format and File rows of section 10.1 that are B5's, by request to B6 who holds the file), `keys.ts` (the eleven bindings leaving `OMITTED_SHORTCUTS`, the equation chord), `Palette.tsx` (the deck text group); `packages/render/src/blocks/equation.ts`, `theme-node.ts` (the math font), `packages/export/src/ooxml/math.ts`, `pptx/text.ts` (`lang`, `marL`, `marR`, `indent`, `startAt`), `table.ts` (the side borders); `apps/studio/src/routes/api/define.ts`, `apps/studio/public/dictionaries/**`, `scripts/check-dictionaries.mjs`; the actions of R10 11 and R06 12.1 item 7, `version.delete`, `account.star`; `apps/studio/e2e/{text-tools,equation}.spec.ts`.

Delivers: day 1 the fields, the twenty action rows, the dialog and panel ids; day 3 the autocorrect engine and Preferences; day 4 the spelling package, the card and the marks; day 5 language, dictation, the Accessibility menu, the Dictionary panel; day 6 the equation block, renderer, toolbar and OMML; day 7 the Format rows, Edit guides, Star, `version.delete`, the e2e.

Acceptance: `cd packages/spelling && ../../node_modules/.bin/vitest run`; `cd packages/schema && ../../node_modules/.bin/vitest run autocorrect prefs equation`; `cd packages/export && ../../node_modules/.bin/vitest run math text`; `text-tools.spec.ts`, `equation.spec.ts`; `check-dictionaries.mjs` under the gzip budget.

### B6 Theme, templates, chat and the identity engineering (about 96 agent-hours)

Owns: `themeEdits`, `customLayouts`, `importedThemes` in `deck.ts`, `packages/theme/src/{theme,tokens,theme-css}.ts`, `packages/theme/src/ts-plate/**`, `packages/render/src/{stage,slide}.ts` (per theme), `theme-node.ts` (the override stylesheet), `packages/export/src/pptx/masters.ts` and `verify/fixture.ts` (per theme, with B4 for the page), `packages/chrome/src/{ThemesPanel,ThemeMode,ThemeToolbar,LayoutMenu}.tsx`, `menus/model.ts` and `strings.ts` (the file's owner; the other builders request their rows), `editor-shell.ts` (the mode, the panel and dialog ids), `TitleRow.tsx` (Join chat, Star), `ChatPanel.tsx`, `TemplatesPane.tsx`, `BuildingBlocksPane.tsx`, `SidebarStrip.tsx`; `packages/realtime/src/protocol.ts` and the channel implementations (the `chat` message), `apps/studio/src/server/{limits,log}.ts` (the chat row); `decks/templates/**` (the eight templates, `building-blocks/**`, `blank-plate`), `packages/store/src/templates.ts`, `apps/studio/src/routes/decks.templates.tsx`, `decks.index.tsx` (the strip), `help.training.tsx`, `help.updates.tsx`, `docs/updates.md`, `scripts/updates-from-model.mjs`; the hero mount of 9.1 (`apps/studio/src/routes/home.tsx`, `MaterialMount.tsx`), the per deck card route of 9.2 (`apps/studio/src/routes/og.deck.$deckId[.]png.ts`), `packages/effects/src/dither.ts` and `crates/turboslide-native/src/dither.rs` (9.6, 9.7), `ShotAdjust`'s reflection and recolor with `packages/render/src/blocks/picture.ts` and the post process rows (9.8); the theme, layout, template, building block and chat actions; `apps/studio/e2e/{theme,chat,templates}.spec.ts`.

Delivers: day 1 the fields, the rows and strings for every builder, the mode's ids; day 3 the theme mode with Colors and Fonts, `themeCss`; day 4 the second theme, the Themes panel groups, Import theme's writer side; day 5 the templates, the panes, the gallery page, the Sales pitch deck; day 6 chat, the help pages, the hero, the card; day 7 the dither families and the crate patterns, Reflection and Recolor, the e2e.

Acceptance: `theme-css.test.ts`, `tokens.test.ts` per theme; every template renders in both themes and both appearances without a lint finding above severity 1; `cd packages/effects && ../../node_modules/.bin/vitest run` with the parity test per pattern; `theme.spec.ts`, `chat.spec.ts`, `templates.spec.ts`; the parity audit's theme, template and chat rows.

### Integrator (about 48 agent-hours)

Owns: the merges, `playwright.config.ts`, `AGENTS.md` (the round five sections: motion, media, import, the page, the theme record, chat), `docs/gslides-parity/{SPEC-5,MILESTONES-5,BUILD-STATUS-5}.md`, the `on(...)` table wiring in the editor for the new window actions as they land, `pnpm generate:contracts`, `pnpm-workspace.yaml` (the catalog entries `@xmldom/xmldom`, `temml`, `nspell`, the dictionaries, `fontkit`, `web-vitals`, each after `pnpm audit`), `scripts/check.mjs` (steps 32 to 37 and the grown steps), `.github/workflows/lighthouse.yml`, the WebSocket flag of 9.10 and the vitals route of 9.5, the preview deploys, the ship step.

Acceptance: `pnpm check` at 37 of 37 on the merged tree; a boot probe of `/new`, `/edit`, `/decks/templates` and `/help/training` after every merge; the preview answers the smoke rows.

### Verifier (about 40 agent-hours)

Owns: `docs/gslides-parity/VERIFICATION-5.md` and `verification-5/**`. Runs `pnpm check`, the parity audit, the layout shift audit and the perf budget on the preview, the motion walk in two browsers (the audience and the presenter through a preview), the import fidelity table over the fixtures and the producer inbox, the container verification with the motion, media, ODP and equation legs, the SVG files opened in Chromium and, where available, in Inkscape and Figma with the result recorded, the PowerPoint manual checklist of `docs/export-verification.md` extended with the Transitions gallery, the Animation Pane, media playback and the equation, and records every number this proposal names against its measurement. Lists for Kevin every unverified Google fact the round built on (section 13).

## 13. What remains for Kevin

Decisions the round builds with a default, reversible at the cost named:

1. The motion numbers: the slider range 100 to 5000 ms, the stops Slow 2000, Medium 1000, Fast 500 and the Medium default; the push reading of Slide from right; Left arrow reversing one step; a digit jump landing at step 0. Google prints none of these (R01 8, R05 13). Cost of a change: constants in `motion.ts` and the panel.
2. The Turboslide additions marked `turboslide: true`: the "Step 2 of 4" line in Presenter view, Alt+Up and Alt+Down reordering, the Paper dropdown in the print preview, the SVG text preference, Add to dictionary on the card, Speak selection aloud, the More dropdown in the equation toolbar, Insert > Equation itself. Each can be hidden by a row flag.
3. Explore: omitted here because Google retired it; a row labelled Explore running the deck text search of 5.9 is one `now()` line if Kevin wants the word in the menu.
4. The YouTube Data API key for the Search YouTube tab, and whether a user may pin a YouTube thumbnail as a poster (R11 decisions 1 and 2).
5. The public asset URL position for media on restricted decks: the picture precedent, the `assetKey` prefix for media first (recommended), or private storage with signed GET URLs (R11 decision 3); the bundle cap at 500 MB; the `tmp` tier refusing media; `ogg` and `mov` later (R11 decisions 5 to 7).
6. The second theme's panel name and the default of the Turboslide mark toggle; the identity's own rule says no mark on a customer's sheet (SPEC-4 1.3), the brief asks for a branded theme (R03 decision 1).
7. The Page setup pixel unit (the sheet pixel at 120 per inch against Google's 96), the 16:10 preset at 12 by 7.5 inches, the paper default, the handout footer, Hide background keeping the frame, `p:sldSz` without `type`, the OK label, notes pages clipping, the 120 to 6720 px cap (R08 decisions 1 to 11).
8. ODP inside the function (path c) against a LibreOffice conversion that needs the worker host; the SVG default text mode; `loext:opacity` in the Perfect ODP; fontkit in the catalog; odfvalidator and a JRE in the image (R09 decisions 1 to 5).
9. The German and Italian dictionaries (GPL only); the definitions provider (the Wiktionary panel recommended); preferences per principal; the em dash substitution row absent; Turboslide's own misspelling correction list; the `text/spelling` lint rule (R10 decisions 1 to 8).
10. The math font (Latin Modern Math against a sans face); inline math in a Text as a later round; Cambria Math named in the OMML runs (R06 12.2 to 12.4).
11. Speaker spotlight, Star and the recording of the presenter (R03 decisions 8 and 9); Make available offline and Q&A history stay on the list.
12. Recording views for the Activity dashboard's Viewers tab; the mail sender for Email collaborators and Email this file; the texts of Privacy Policy and Terms of Service; a stock picture provider (R03 decisions 2, 3, 5, 7).
13. The hosts the deferred engineering runs on: the long lived worker host for the WebSocket transport and a LibreOffice conversion; Redis and Postgres as before; GitHub Actions for the Lighthouse job and the native rebuild.
14. The Google facts adopted unverified, which the verifier lists with the round's reading: the transition list of seven, the default animation type, the slider's scale, the push against cover reading, Left arrow's behaviour, autoplay's tick unit, the PDF's resting objects, the audio icon's default size, the labels Start at, End at and Mute audio, the gallery's three category headings, the building block category labels, the conversion notice's label, the OK against Apply label, the handout strings, the Preferences checkbox set, the Define row, spoken punctuation in notes, the magnifier and announcements labels, chat's unsaved history, the Verbalize mechanism, the navigation row labels, Google's SVG and ODP file contents.

## 14. Risks

1. Text that fit in a source face overflows in Inter after import; mitigated by `autofit: 'shrink'` on every auto fitted body and the report's estimate row (R04 12).
2. The motion CSS on a 4:3 or custom page: the fly offsets derive from the page; the e2e runs the motion spec on the 4:3 fixture too.
3. LibreOffice's fallback for `p14:flip` and `p14:gallery` is measured, not documented; the container leg records what arrives.
4. The presigned client upload's `onUploadCompleted` needs a public callback and is not relied on; an abandoned upload is swept after 24 hours.
5. The chat's `blob` tier rides the ops stream; a busy deck could push chat entries past the retained 10,000 before a late joiner reads them, which loses history only, never a document change.
6. The shape interpreter changes how presets draw on the sheet; `canvas-fidelity.mjs` and the Perfect gate over the fixture decks catch a regression, and the GT deck uses no preset beyond rect, roundRect and ellipse.
7. Six builders share `menus/model.ts` through B6; the day 1 seam lands every row and string so no builder edits the file after merge 1.
8. The `Permissions-Policy` change opens the camera and microphone to the studio's own origin only; the `/embed` route keeps both closed.

## 15. Sources

Research reports, working tree, read 2026-09-14: `docs/gslides-parity/research-5/01-google-motion.md` (R01), `02-media-templates-import-page.md` (R02), `03-later-rows-and-edit-theme.md` (R03), `04-pptx-import-feasibility.md` (R04), `05-motion-media-export.md` (R05), `06-equation-editor.md` (R06), `07-turboslide-inventory-5.md` (R07), `08-page-setup-and-print-layouts.md` (R08), `09-odp-and-svg-downloads.md` (R09), `10-text-tools-spelling-autocorrect-voice-accessibility.md` (R10), `11-media-pipeline-and-playback.md` (R11); their Google, Microsoft, OASIS, W3C, LibreOffice and vendor sources with URLs and dates are in each report's Sources section.

Specifications: `docs/gslides-parity/SPEC-2.md` section 12; `SPEC-3.md` sections 17 and 18; `SPEC-4.md` sections 0, 7 and 8; `AGENTS.md` ("Code rules", "The agent surface", "Acceptance", "Contracts between builders that the scripts assume"); `docs/gslides-parity/design-3/proposal-1-google.md` (the shape of the ownership section).

Code at `d5d7f07`, read with `git show`: `packages/schema/src/{actions,deck,blocks,assets,position,validate}.ts`, `packages/chrome/src/menus/model.ts` (the helpers, `MenuEffect`, `MenuSetting`, the Later and Omit rows), `packages/viewer/src/present/strings.ts`, `packages/store/src/templates.ts`, `decks/templates/**` (the folder layout), `scripts/check.mjs`.
