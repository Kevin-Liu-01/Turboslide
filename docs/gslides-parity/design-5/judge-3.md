# Judge 3, the founder's reading of the three round five proposals

Written 2026-09-14 against the three proposals in `docs/gslides-parity/design-5/`, the eleven reports in `research-5/`, SPEC-2 section 12, SPEC-3 section 17, SPEC-4 section 7 and the code at `d5d7f07` read with `git show`. The judge's chair is the founder's: does the proposal complete the parity mandate honestly, does it keep the look and the security plan, does it name what stays for Kevin, and is the copy in the rules. Nothing was installed, no server ran, no git write was made, no account was signed in to.

## 1. Scores

Each axis is 1 to 10; the total is the sum.

| Proposal           | Fidelity | Ease for sales | Architecture fit | Export fidelity | Buildability | Total |
| ------------------ | -------- | -------------- | ---------------- | --------------- | ------------ | ----- |
| 1, Google faithful | 9        | 7              | 8                | 8               | 6            | 38    |
| 2, sales first     | 8        | 9              | 8                | 8               | 7            | 40    |
| 3, architecture    | 7        | 6              | 10               | 9               | 8            | 40    |

Winner: proposal 3, with the grafts of section 5. Proposals 2 and 3 tie on the total; section 4 says how the founder's criteria break the tie.

## 2. What the three agree on

The three proposals share the same spine, and the spine is right. `SlideBase.transition` and an ordered `SlideBase.animations` list on the slide; `compileMotion` in `packages/render/src/motion.ts` as the one schedule the show, the standalone HTML, the PPTX timing tree and the ODP animation tree read; the still rule (every object at rest in every still, so the Perfect gate measures the same surface as today); the OOXML post process modules `transition.ts`, `timing.ts`, `ids.ts` and `media.ts`; a `media` block over a `MediaAsset` union with the five formats, the container sniff, own parsers, the caps and presigned uploads; YouTube through the privacy enhanced host; `Deck.page` in sheet pixels with the height rule; `printLayout()` shared by the print route and the PDF; the ODP writer verified by the LibreOffice loop in the container (R09 path c); the scene SVG writer with three text modes; nspell in a Worker; preferences per principal; Temml for the equation block with the OMML transform; Edit theme as a mode over `themeEdits` with `themeCss(deck)`; `ts-plate` as the second theme with an empty corner; chat as a transient room capability; Explore kept omitted because Google retired it on 2024-01-30; every Later row of `menus/model.ts` flipped except Email collaborators and the Viewers tab; every capability an action with CLI, MCP and window handlers. All three read the research the same way on the hard facts, and the facts I checked (the 21 Later rows at `d5d7f07`, the clause constants, the `panel`, `dialog`, `route`, `toggle` and `client` helpers, `DECK_TEMPLATES` at `actions.ts:567`, `slide.import` at 1478, the template record at `templates.ts:50-77`, the home strip, `objectName` as `ts:<slide>#<id>`) hold.

The differences are therefore in emphasis, in the places where two reports disagree, in the breadth of the template content, in how the security plan is applied to media, and in how the build is cut.

## 3. Each proposal on its own

### 3.1 Proposal 1, Google faithful

Strengths. It is the most complete reproduction of Google's surface a standalone editor can offer. Eight templates with real slides in Google's three gallery categories, led by the fourteen slide Sales pitch; nine building block categories (the union of Google's own six names and the press's seven); the Dictionary as a side panel over the Wiktionary REST endpoint through `safeFetch`, which is Google's form, with the link as the fallback for a checkout without egress; the tool finder gaining a "Text in this presentation" group; the special characters drawing box built as Turboslide's own recogniser with a "Best guesses" label; Import theme showing the themes a file holds and an "In this presentation" list; Star, Camera, Speaker spotlight, Present on another screen; native `a:reflection` and `a:duotone` in the Editable text file. The `turboslide: true` discipline on every addition keeps the completeness test counting Google's rows alone. Section 13 item 14 lists every Google fact adopted unverified, which is exactly what the verifier and Kevin need. The hour estimates and the day by day deliverables are the most concrete of the three.

Weaknesses. The default duration of a new animation is Medium at 1000 ms; PowerPoint's own files write 500 ms for Fade, Fly and Spin (R01 6.5), so a deck exported without touching a slider would play slower in PowerPoint than PowerPoint's own. The `spd` fallback thresholds (under 750 fast, under 1500 med) follow R05's Turboslide mapping and ignore R01 6.2, which quotes LibreOffice's public thresholds and says the design should keep them. B6 is overloaded: the theme mode, the second theme, eight templates (about seventy slides of copy), thirty building blocks, chat, both help pages, the hero, the per deck card, two dither families in TypeScript and Rust, Reflection and Recolor, and ownership of `menus/model.ts` and `strings.ts` for every other builder, in 96 agent hours. Chat adds a new room message type with a Redis list and a separate path on the blob tier where an entry kind on the existing stream would do. The "at most five" cap on imported themes is stated as Google's without a report section behind it. GT Blank stays the default, so a customer's first sheet carries another company's mark unless they find `blank-plate`.

### 3.2 Proposal 2, sales first

Strengths. The seven scenarios are the product's user and every section answers one of them. It is the only proposal that applies the security plan to media on the first day: the `assetKey` prefix for media on restricted decks, which R11 recommends and the other two leave on Kevin's list. A demo video of an unreleased product is the asset most likely to leak, so this is the right default. Play on click as the default with Google's 2020 date; a new animation at 500 ms (PowerPoint's own value); Plate as the theme of Blank and the work templates so a customer's sheet never shows the GT mark; the presenter console's next preview showing the state after the next click, which is what a presenter about to click needs; the "Messages are not saved" first line in chat; the one sentence import report; the sales pitch deck as the fixture the motion, media and import gates exercise; the 28 row table of what remains for Kevin with the round's default per row, the most usable form of that list. The acceptance list is concrete and includes the hosted smoke rows.

Weaknesses. The template gallery's categories are Work, Brand and Blank, which are not Google's and expose the GT brand deck to every customer as a category; Personal, Work and Education are unverified but they are the documented reading. Import theme reads `ppt/theme/theme1.xml` only, so a file with several themes loses them. Every slide of the four work templates ships with a Fade transition, which Google's templates do not do and a customer may not want. The Dictionary is a link out. "PPTX import is the front door" is a metaphor, and the copy rule forbids metaphors. The `spd` thresholds follow R05 against R01. B5 carries the 123 page derivation sites, the print layouts, ODP, SVG, the shape interpreter and the per deck card at once.

### 3.3 Proposal 3, architecture

Strengths. It extends the one truth rule to everything the round adds, and it is the only proposal that states the contracts a parallel build needs as contracts. The resting rule; one schedule; one id with four spellings (`data-block`, `ts:<slide>#<block>`, `xml:id`, `blockId`) so an agent, the show, the PPTX and the ODP address a block by the same id; one `Scene` gaining `page`, `transition`, `schedule`, `media`, `equations`, `language` and `themeCss` so the pptx, odp and svg writers never read the deck; a table of every schema field with its meaning when absent, its validator code, its writer and its consumers; `MUTATION_OPS` unchanged; motion on a grammar slide never converting it to a canvas; the `paragraphs(blockId)` callback so the renderer and the scene count paragraphs the same way; `deck.set`'s pointer regex kept closed to `/page` and `/themeEdits` so each has one write path; the day 0 seam and the named typed seams between builders. On export fidelity it is the only proposal that noticed two reports disagree on the `spd` thresholds and took R01's public LibreOffice reference; its defaults of 500 ms match PowerPoint's own files; it writes `nextAc="seek"` with `onPrev` and `onNext`; it says what an equation becomes in the SVG (a raster, because `foreignObject` is ruled out) and what a media block becomes in TXT; the ODP writer records the speed quantization in the residual; the motion e2e asserts the Perfect report is `perfect: true` and the GT deck's export bytes are unchanged; the import fidelity table gains a visual number that is reported and not gated, which is the honest way to report a face substitution.

Weaknesses. The template area is thin: one twelve slide sales starter and its Plate twin, a gallery with category headings and one entry under one of them, and "a fourth template is a folder and one index line". The brief asks for a gallery with categories and this is not a gallery. The Dictionary is a link out. The drawing box of the special characters dialog stays omitted. The presenter's next preview is the resting slide. The import's default theme mode for File > Open is not stated. B6 carries the equation block, the theme mode, the second theme and every deferred engineering item including the shape interpreter, the WebSocket transport, the per deck card, the vitals route and the Lighthouse job; it is the most overloaded lane in any of the three proposals. The Later count "drops to 2" while the same section lists three Later rows.

## 4. The tie and how the founder breaks it

Proposals 2 and 3 total 40. The founder's criteria break it for proposal 3.

Turboslide's promise is that one document renders once and every export is that render, and that an agent can query and edit everything a person can. Round five adds motion, media, equations, a page size, a theme record and an import path, each of which could have become a second render path or a second id space. Proposal 3 is the one that prevents that by construction, and the SPEC-5 the winner becomes is the document six builders type against. The day 0 seam, the typed contracts between lanes and the schema table are the hardest part of a parallel round to add after the fact; the sales scenarios, the security default for media and the template content are additive and graft cleanly onto proposal 3's structure without moving a seam. Grafting proposal 3's scene and seam architecture onto proposal 2 would rewrite proposal 2's structure.

Proposal 3 also reads the research most carefully where it matters for the files: it caught the disagreement between R01 and R05 on the fallback speed thresholds, and it took the public reference. In a round whose deliverable is a PPTX that opens in PowerPoint as authored, that care is the tiebreak.

Proposal 1 is the most complete on Google's surface and the tables of its sections 1 to 5 are the reference the builders should read for labels, positions and controls. It loses on buildability and on two defaults that would make an exported deck play unlike PowerPoint's own.

## 5. Grafts onto proposal 3

From proposal 2:

1. Section 0's seven sales scenarios and the five rules, as the opening of SPEC-5 before the decisions table, so every later section names the scenario it answers.
2. The `assetKey` prefix for media on restricted decks from the first day, with the picture precedent as the interim and the Share dialog sentence while it lasts (R11 2 rule 6). This applies the security plan rather than deferring it.
3. Plate as the theme of Blank and of the work templates, the GT brand deck staying on GT, listed for Kevin as the round's default with the mark toggle in the schema and not drawn.
4. The presenter console's next preview showing the state after the next click while steps remain, marked `turboslide: true`, since Google's console is not documented to do it (R01 8 item 7).
5. The "Messages are not saved" first line of the Chat panel and the per tier `chatMessagesPerMinutePerDeck` rows.
6. The 28 row form of the list for Kevin with the round's default per row, replacing proposal 3's twelve item list.
7. The sales pitch deck as the fixture the motion, media and import gates exercise, and acceptance item 9's hosted smoke rows (an import through the bundle route, a media grant, a Range request answering 206, the updates page cached).
8. `adopt` as the default theme mode for File > Open and the home page's Upload tab, with the reasoning that a near black which becomes `ink` follows the appearance switch.

From proposal 1:

9. The template set: the fourteen slide Sales pitch and the seven other templates across Personal, Work and Education (the categories flagged unverified), so the gallery page has categories with cards under each. The slide lists of proposal 1 section 3.3 are the content brief.
10. Nine building block categories (Agendas, Lists, Key statistics, Quotes, Headlines, Text callouts, Calls to action, People, Cards), about thirty blocks, each a group of native blocks that Ungroup splits.
11. The Dictionary as a side panel over the Wiktionary REST endpoint through `safeFetch` on the hosted studio, with the Look up link as the fallback when `TURBOSLIDE_DICTIONARY=link`; the provider stays Kevin's decision, the panel is the recommendation.
12. The tool finder's "Text in this presentation" group with up to five deck text hits and the prefilled Find and replace row.
13. The special characters drawing box as Turboslide's own recogniser over the Math and Arrows categories with the "Best guesses" label.
14. Native `a:reflection` and `a:duotone`, `a:grayscl` or `a:biLevel` in the Editable text file through the post process, with the Perfect raster following the renderer; the importer's rows land on the same fields.
15. The Import theme flow that lists every theme a file holds and the "In this presentation" group, without the "at most five" cap unless a source is found.
16. The hour estimates and the day by day deliverables per lane, recalibrated for the rebalanced lanes of graft 18.
17. Section 13 item 14's list of every Google fact adopted unverified, merged with proposal 3's item 12, as the verifier's checklist.

Rebalancing:

18. Split proposal 3's B6. The equation block and the theme work stay with B6; the deferred engineering moves: the shape interpreter, the per deck card and the vitals and Lighthouse rows to B4 (page, print, ODP, SVG, which already owns the geometry and the export gates), the nested groups and Reflection and Recolor to B3 (import, which maps `a:reflection`, `a:duotone` and `p:grpSp` onto them), the dither families and the crate to B2 (media, whose store and worker code they sit beside), the WebSocket flag to the integrator. B3 gains the eight templates and the building blocks from graft 9 and 10 in place of the deferred items, so its load stays level.

## 6. Rejections

1. Proposal 1's Medium 1000 ms default for a new animation. A new animation is 500 ms, the value PowerPoint writes (R01 6.5); a new transition is 500 ms as proposal 3 has it, or 1000 ms as proposal 2 has it, and the choice is Kevin's item with 500 ms as the default.
2. Proposals 1 and 2's `spd` thresholds of 750 and 1500 ms. The writer follows LibreOffice's public thresholds as R01 6.2 recommends: 500 ms and under `fast`, under 1000 `med`, 1000 and over `slow`, with `p14:dur` carrying the milliseconds.
3. Proposal 2's gallery categories Work, Brand and Blank. The gallery uses Personal, Work and Education, flagged unverified, and the GT brand deck sits under Personal as General presentation with Blank first.
4. Proposal 2's Fade transition on every slide of every work template. Templates ship without a transition; the Sales pitch's pricing slide keeps its By paragraph Appear on click because it demonstrates the feature a rep asked for.
5. Proposal 2's Import theme reading `theme1.xml` alone. The dialog lists every `ppt/theme/themeN.xml` the file holds.
6. Proposal 1's chat transport as a new room message type with a Redis list and a separate blob tier path. Chat is an entry kind on the operation stream beside `edit` and `comment`, never checkpointed, as proposals 2 and 3 have it.
7. Proposal 1's ownership of `menus/model.ts` and `strings.ts` by B6. The integrator owns both and `actions.ts` on day 0 and by request after, as proposals 2 and 3 have it.
8. Proposals 2 and 3's Dictionary as a link out alone. The panel is the design, the link is the fallback (graft 11).
9. Proposal 3's omission of the special characters drawing box (graft 13) and its one template gallery (graft 9).
10. Proposal 1's "at most five" cap on imported themes stated as Google's. Either a source is found and cited or the cap is dropped.
11. Proposal 2's sentence "PPTX import is the front door" and proposal 1's "the store is the standalone Drive" and "the house pattern". SPEC-5 states the mechanism without the figure.

## 7. Items the round must surface to Kevin beyond the proposals' lists

1. Explore. The brief lists Explore in the round's scope; all three proposals keep the row omitted because Google retired it on 2024-01-30 (R10 9) and parity is the menu Google has today. Their reading is defensible and the deck text search of graft 12 is the standalone form. Kevin should see this as a named decision: a row labelled Explore running that search is one `now()` line if he wants the word in the menu.
2. The defaults the three proposals disagreed on, listed together with the round's choice: the new animation's type and duration, the transition's default duration, the `spd` thresholds, the push reading of Slide from right, Left arrow reversing a step, the presenter's next preview, Blank on Plate, `adopt` as the Open default.
3. The `assetKey` prefix for media shipping this round (graft 2), since it is R11's recommendation and the round three migration recorded it as not shipped.

## 8. Copy check

None of the three proposals contains an em dash or an en dash; no heading ends in a period; headings are in sentence case. Proposal 2 has one metaphor ("the front door") and one figure of speech ("the shortest path is the honest one"); proposal 1 has two figures ("the standalone Drive", "the house pattern"); proposal 3 has none I would flag ("the writer read backwards" describes the mapping tables). All three write in full sentences and in plain technical English.

## 9. Facts checked

- `packages/chrome/src/menus/model.ts` at `d5d7f07`: 21 `later(` rows and 38 `omit(` rows; the helpers `now`, `later`, `omit`, `sub`, `action`, `dialog`, `panel`, `route`, `toggle`, `client` at lines 485 to 529; the clauses `CHAT_LATER`, `DELETE_VERSIONS_LATER`, `STILL_SLIDES`, `NUMBERING_STARTS`, `NO_MEDIA`, `START_FROM_GT`, `DOWNLOAD_FORMATS`, `GUIDES_BY_HAND` at 536 to 547; `insert.animation` omitted with "Section 0.5", `tools.explore` omitted as retired, `tools.dictionary` omitted as a Google service, `help.training` and `help.updates` omitted at 2205 and 2206.
- `packages/schema/src/actions.ts`: `DECK_TEMPLATES = ['gt-brand', 'blank']` at 567; `slide.import` at 1478.
- `packages/store/src/templates.ts`: `TemplateRecord` at 50 to 77 with `archetypes`.
- `packages/export/src/pptx/shapes.ts`: `objectName` writes `ts:<slide>#<id>`.
- `packages/realtime/src/protocol.ts`: entry kinds `edit` and `comment`; room event types `hello`, `ops`, `op`, `presence`, `leave`, `reject`, `inbox`, `access`, `resync`, `checkpoint`.
- R01 6.2 (line 132): LibreOffice's `spd` thresholds and "the design should keep the same thresholds"; R01 6.5 (line 180): PowerPoint's 500 ms defaults; R01 8 item 4: the default animation type is unverified between "Appear (On click)" and Fade in.
- R05 line 200: the 750 and 1500 ms thresholds as "a Turboslide mapping".
- R02 a.2 (line 54): Play (on click) the default since 2020-10-14; R02 line 71: Personal, Work and Education from a third party, unverified; R02 line 79: the building block categories from the press; R02 line 81: Google names no sales starter deck.
- R11 2 rule 6 (line 234) and decisions 3 (line 482): the `assetKey` prefix recommended for media first.
- R10 8 (lines 392 to 398): the four dictionary options with the Look up row recommended now and the Wiktionary panel as the panel form; R10 9 (lines 404 to 408): Explore retired 2024-01-30.
- R09 2.6 (lines 208 to 210): path c recommended for ODP.
- R03 8 item 1 and SPEC-4 7: the second theme "recommended against" with the empty corner as the report's default.
- The round one report `research/08-context-menus-and-menu-conventions.md` B10: the side panel convention both proposals cite.
