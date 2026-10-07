# Polish two

The binding specification of polish two: Kevin's five asks of 2026-10-07 (the face, the pause control, the docs, the header, the auth UI) and one realtime row that reads red at random. Written on 2026-10-07 in the worktree `/Users/kevinliu/repos/Turboslide-polish2` on `polish2/round` at `f2d48868` (the design round's whole tree) from the three research notes of the round, each read in full with every picture it cites opened: `docs/gslides-parity/polish-two/research-auth.md` (26 pictures under `research-auth/`), `research-docs.md` (11 under `research-docs/`) and `research-header.md` (19 pictures and `measure.json` under `research-header/`). `docs/DESIGN.md` binds every surface, corner, layer, token, the face and the scrollbar in this round; where this file and `docs/DESIGN.md` 8.1, 8.2 or 9 differ on the parts this file names, this file binds. Tree files were read where a decision needed a line: `scripts/probes/core-matrix.mjs` and `core-matrix.test.mjs`, `docs/gslides-parity/focus/core-matrix.json`, `apps/studio/e2e/core/realtime.spec.ts` 205 to 235, 526 to 556, 1087 to 1160 and 1760 to 1810, `apps/realtime-worker/src/deck-room.ts` 760 to 780 and 2365 to 2385, `apps/studio/src/editor/transport.ts` 1018 to 1025 and `controller.tsx` 3950 to 3965 and 4445 to 4460, `apps/studio/src/server/agent-actions.ts` 410 to 500, `packages/chrome/src/ThemeButton.tsx`, `Dialog.tsx` 150 to 390, `dialogs/Help.tsx` 70 to 85, `packages/lint/src/brand/competitor.ts`, `config.ts` and `source.ts` 780 to 800, `packages/fonts/src/woff2-names.ts`, `apps/studio/src/server/auth/better-auth.ts` 70 to 130 and 350 to 360, `apps/studio/src/components/home/copy.ts` 85 to 100 and 555 to 575, `design-copy.ts` 18 to 25, `scripts/check-client-bundle.mjs` 40 to 60, `scripts/probes/core-walk/areas/help.mjs`, `AGENTS.md` 400 to 415 and `docs/NEXT.md` 4.3 and 7. One production read: a GET of `https://www.turboslide.com/home`, whose router manifest names `__root__` and `/home` alone, so routes added elsewhere add nothing to `/home`'s document. No server, browser or build ran for this file; the one minute load was 136 to 165.

Contents: 1 the asks and the decisions, 2 the face (lane F), 3 the navigation and the hero (lane N), 4 the auth UI (lane A), 5 the docs (lane D), 6 the rows, 7 the lanes, 8 the gates, 9 the questions only Kevin can answer, sources.

## 1. The asks and the decisions

### 1.1 Kevin's words, verbatim

On 2026-10-07: "are we using the correct rasmus inter? please do. also remove the pause unpause button in top bar, and make a proper docs page based off of gt docs. also fix the header, the right side paragraph + the buttons is too tall." Then: "ALSO COMPLETELY FIX AND REDO AUTH UI", with a screenshot of the Sign in dialog on the design branch's local preview: the heading "Sign in"; the sentence "The presentations you made in this browser move to your account." starting at the dialog's left edge with no padding; an Email field with a blue focus ring; an empty band of about 200 px under it; a footer with Cancel and a white primary button with no label; no Continue with Google (that preview ran without a Google client).

The standing words that bind this round: the design round (one stacking scale, the radius ladder of 0, 4, 6 and 8 px, nine themes with General Translation as one choice, the landing showing product UI with fewer words, colour tokens from colorjs.io, the original Inter by Rasmus Andersson with tabular figures, the shared scrollbar, every page on the same surfaces); "dont mention google slides at all"; "make sure turboslide is super optimized and super cheap to run while being fully featured and super performant"; "make auth work perfectly"; "make sure to actually test our slide features and make sure they work"; plain technical English in every word (sentence case, no em dashes, no metaphors, no "X, not Y", Title Case only on buttons); and one shared component used on every surface for a cross cutting UI standard.

One item joins the round in lane F's scope: `apps/studio/e2e/core/realtime.spec.ts` 1150 compares the Cloudflare colo each browser's socket entered (production read EWR against IAD while both sockets reached the one Durable Object), so `realtime.join.chip-within-1s` reads red at random. The same comparison is at 1804 in `setup.do.two-instances`.

### 1.2 The decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                 | Reason                                                                                                                                                                                                                                                                                                                                         | Source                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| C1  | The face stays as it is: the vendored files are the official Inter 4.1 by Rasmus Andersson, the Latin subset keeps every OpenType feature, and nothing is replaced                                                                                                                                                                       | The name table reads "Version 4.001;git-9221beed3", the axes are opsz 14 to 32 and wght 100 to 900, the full file's sha256 is the release's, and the subset keeps 42 features; what reads as General Translation's Inter is the two alternates cv11 and ss01, which production's chrome still switches on until the design round's pushes land | research-header 4.1; DESIGN.md 4.1, C6                                        |
| C2  | No stylistic set and no character variant outside the General Translation theme in anything a person sees: the people marks' initials, the lockup's wordmark SVG and the social card leave cv11 and ss01                                                                                                                                 | Kevin: "please do"; these three are the places left outside the theme on this tree                                                                                                                                                                                                                                                             | research-header 4.2, 5.4 items 1 and 2, question 6                            |
| C3  | One lint rule, the existing id `css/chrome-alternates`, fails on any stylistic set, character variant, `salt`, `swsh` or `aalt` and on any `font-variant-alternates` other than `normal`, in CSS, custom properties, JSX and inline style strings, outside the theme's owners; `var(--display-features)` is legal only under `.ts-sheet` | The rule today reads two tags in four roots and missed the three places of C2; the id stays so `ACCEPTED` and the reports keep their keys                                                                                                                                                                                                      | research-header 4.5, 5.4 item 3                                               |
| C4  | A unit test proves every served Inter file is the release (name table, axes, features, the full file's hash) and a browser row proves the one served face carries the features by measured widths                                                                                                                                        | Kevin asked whether the face is correct; a test answers it on every push                                                                                                                                                                                                                                                                       | research-header 4.1; DESIGN.md 4.2 (the advance widths)                       |
| C5  | Tabular figures: no change on `/home`; the new surfaces of this round (the device code, the countdown, the docs' step numbers and tables, the reference's counts) use `.pt-num`, and one sweep row reads every page                                                                                                                      | Every aligned number on `/home` already computes `tabular-nums`                                                                                                                                                                                                                                                                                | research-header 4.3; DESIGN.md 4.5                                            |
| C6  | `home.css` 510 stays: it reads the General Translation theme's token on the page deck's slide headings, and the page deck is in that theme at rest                                                                                                                                                                                       | DESIGN.md 8.0 keeps the theme's alternates on the page deck's slides and binds the face; `home.css` declares no stylistic set of its own; question Q18 asks Kevin                                                                                                                                                                              | research-header 4.2 row 1; DESIGN.md 8.0, 8.7                                 |
| C7  | The two realtime rows compare the object's own id, which every tab already receives in the room frame (`describe().state.sync.room.object`, the first eight characters of `ctx.id`); the colos are recorded beside it and never compared                                                                                                 | The colo names the edge each request entered, which differs by origin; the object id is one per deck; no Worker or client change is needed                                                                                                                                                                                                     | `deck-room.ts` 774 to 780; `transport.ts` 1018 to 1025; `controller.tsx` 4454 |
| C8  | The pause control leaves the navigation; the hero terminal's toggle stays and the footer's closing line gains a "Pause Motion" text button; both drive the one page wide state and both hide under reduced motion                                                                                                                        | Kevin: "remove the pause unpause button in top bar"; WCAG 2.2.2 still asks for a mechanism and its best practice is one mechanism for every moving element                                                                                                                                                                                     | research-header 3, 5.1, question 2                                            |
| C9  | One hairline in the bar, before Sign In; under 360 px the row's gap is 4 px and the hairline hides                                                                                                                                                                                                                                       | At 320 px today the pause glyph and a hairline draw inside Sign In; with C8 and this the row needs 318 px of 320                                                                                                                                                                                                                               | research-header 1.2 finding 3, 5.3 items 1 and 2, question 3                  |
| C10 | The shared `ThemeButton` renders both glyphs and CSS shows the one `html[data-theme]` names, from the first paint; the icon button's accessible name is "Dark or light" for every visitor; the labelled button's name is its visible "Theme"                                                                                             | The button draws an empty square until hydration (0.8 s warm, 5.8 s cold, for good without script), which is the empty slot of Kevin's preview; the root's boot script already sets `html[data-theme]` before the first paint; CSS needs no script                                                                                             | research-header 1.2 finding 4, 5.3 item 3                                     |
| C11 | The hero's side spans the h1's ink: the lead's first cap on the h1's first cap and the buttons' foot on its last baseline; the lead after the visit sentence is "No account is needed."; the h1 is 76 px from 1,136 px, 61.6 px at 1024 and 64 px from 720 to 1023                                                                       | The side is 34, 51 and 78 px taller than the headline at 1440, 1280 and 1024; only this lead holds two lines with the same breaks in Inter and in 'Inter Fallback'; the CLI and MCP sentence is said on the same screen by the terminal's head and the numbers row                                                                             | research-header 2, 5.2, questions 1, 4 and 5                                  |
| C12 | One auth plate in `packages/chrome/src/auth/`, drawn by two hosts: the page `/signin` and a window in the editor; every auth surface draws it                                                                                                                                                                                            | Kevin's rule of one shared component; the defects of his screenshot came from a page's own rules reaching the dialog                                                                                                                                                                                                                           | research-auth 1, 4.1                                                          |
| C13 | Sign In on `/home`, `/decks` and the access page is a plain link to `/signin?next=<page>`; the editor's Sign In opens the window, so an unsaved draft and the live session stay                                                                                                                                                          | General Translation's states are pages; a page is a document navigation, so `/signin` renders on the server and reads the session and the methods once                                                                                                                                                                                         | research-auth 4.2, question 1                                                 |
| C14 | Every social and magic link call names `errorCallbackURL: /signin?next=<return>`; better-auth's `onAPIError.errorURL` is `/signin`; `/api/auth/error` stops being a destination; the CSRF filter is unchanged                                                                                                                            | Pressing Cancel at Google ends today on `{"error":"forbidden"}`, on production too                                                                                                                                                                                                                                                             | research-auth S6, 4.2                                                         |
| C15 | `/device` draws the plate: an anonymous visitor signs in first through the deployment's methods with `next` back to the device page, then sees the eight character code in two groups of four with Approve and Deny                                                                                                                      | With mail off the page offers only an email form whose message is dropped, so `turboslide login` cannot complete on production for a browser that is not signed in                                                                                                                                                                             | research-auth S7, 4.2, question 7                                             |
| C16 | The plate's words are research-auth 4.5's: sentence case headings, Title Case buttons, a period after every sentence; "Continue with Google" stays; Continue with Google draws Google's own fills                                                                                                                                        | Kevin's word rules; NEXT.md question 4's default                                                                                                                                                                                                                                                                                               | research-auth 2.1, 4.5, question 3                                            |
| C17 | No Cancel and no footer in the window: the close glyph and Escape close it; an error line is reserved only in the states that can answer                                                                                                                                                                                                 | NEXT.md 4.3.2 item 7; the empty band of the screenshot is the code step's reserved height and the reserved error row                                                                                                                                                                                                                           | research-auth K4, K6, question 4                                              |
| C18 | `/signin` shows the Blue Marble twin of the shown appearance with its credit from 1024 px; the window and narrower pages show none                                                                                                                                                                                                       | NEXT.md question 5 and `docs/brand.md` 270 put a mood picture on the Sign in plate; it is the one licensed picture the product ships                                                                                                                                                                                                           | research-auth 3, question 2                                                   |
| C19 | A gallery at `/dev/auth` draws every state of the plate in both hosts with stub actions, on a local server only                                                                                                                                                                                                                          | General Translation's and Prototemplate's plates are judged state by state; a row file reads every state                                                                                                                                                                                                                                       | research-auth 4.4                                                             |
| C20 | Kevin's screenshot is fixed first on today's dialog (A#1), before the plate replaces it                                                                                                                                                                                                                                                  | The design round's D5 push brings this dialog to production now; the fix is about 25 lines and pins the four reads the old row lacked                                                                                                                                                                                                          | research-auth 1, 4.7 P0                                                       |
| C21 | The sign in mail's subject is "Sign in to Turboslide" and the wordmark heads its body                                                                                                                                                                                                                                                    | A lock screen shows a subject; NEXT.md 4.3.2 item 8                                                                                                                                                                                                                                                                                            | research-auth S4                                                              |
| C22 | `/docs` is built inside `apps/studio` with fumadocs-core 16.16.2 and fumadocs-mdx 15.4.6, headless, on Turboslide's own layout and CSS; fumadocs-ui, Tailwind and Pagefind are not used                                                                                                                                                  | General Translation's content pipeline (the same `meta.json` grammar, loader and twin helpers) at 13.0 KB gzip of script on docs pages; fumadocs-ui adds 186.8 KB gzip and needs Tailwind, which `AGENTS.md` 39 and `docs/spec/SPEC.md` 163 rule out, and its corners leave the ladder                                                         | research-docs 1, 4, 5, 6 P1 to P3                                             |
| C23 | Every docs page, its twin, the search index, the agents' full text and the sitemap are prerendered at build; the page loader is isomorphic, so a click between docs pages fetches one chunk and runs no function                                                                                                                         | A reader costs nothing per visit; the server function variant costs one invocation per click and the static variant answered 404 on the node server                                                                                                                                                                                            | research-docs 5 items 3 to 5, 6 P4                                            |
| C24 | The docs follow General Translation's structure: three sidebar groups (Use Turboslide, Agents, Reference), title and description, Copy Page, table of contents, callouts, steps, tabs, cards, code with Copy, previous and next, search, `.md` twins, `llms.txt`                                                                         | Kevin: "based off of gt docs"                                                                                                                                                                                                                                                                                                                  | research-docs 2.2, 6 P5, P8                                                   |
| C25 | The action reference is generated from the contracts by `pnpm generate:contracts`; each count is printed per transport from the generated files and never typed                                                                                                                                                                          | The five generated files name 194, 181, 170, 173 and 178 actions; a typed number is wrong somewhere                                                                                                                                                                                                                                            | research-docs 3.2, 6 P6                                                       |
| C26 | Search is an index written at build and loaded on the first open, with no dependency                                                                                                                                                                                                                                                     | About 47 KB gzip fetched once; Pagefind waits until the docs pass a few hundred pages                                                                                                                                                                                                                                                          | research-docs 6 P7, question 8                                                |
| C27 | The twins write each component's markdown form (a callout as a quote, steps as a numbered list, tabs as one subheading per tab, cards as a list of links) and no heading id suffix                                                                                                                                                       | General Translation's twins carry raw JSX and `[#id]` suffixes, which an agent cannot use                                                                                                                                                                                                                                                      | research-docs 2.3, 5 item 8                                                   |
| C28 | The landing's navigation and footer and the editor's Help link Documentation to `/docs`                                                                                                                                                                                                                                                  | Today they open the repository's engineering index, whose file tree names the planning folder                                                                                                                                                                                                                                                  | research-docs 3.1, 6 P9                                                       |
| C29 | The competitor guard reads `apps/studio/content/docs`, and a content test reads every MDX file for dashes and links                                                                                                                                                                                                                      | The guard's text roots do not hold a docs folder today                                                                                                                                                                                                                                                                                         | research-docs 3.3, 6 P10                                                      |

### 1.3 What polish two does not do

- It changes no font file, subset, preload or PowerPoint name (DESIGN.md 4.1 to 4.4 stand).
- It adds no token to `packages/chrome/src/tokens.css`; a lane that needs a value writes it in its own sheet under its root class from existing tokens.
- It changes no auth call, limit, quota, CSRF rule or alias link (4.7), and builds none of NEXT.md 4.3.2 items 1 to 4 and 9 to 13 (sessions, revocation, the Profile wiring, the sender, the limiter, the legal pages, passkeys, mentions), which stay Round 3's. It takes NEXT.md 4.3.2 items 5 to 8 (A2a, A2b, A2c and A3a of NEXT.md 4.3.4) and the device page's sign in first.
- It does not move the page deck's theme on `/home` (C6, question Q18).
- It uses no fumadocs-ui, Tailwind, Radix or Pagefind, and serves no `Accept: text/markdown` negotiation (question Q25).
- It pushes nothing, deploys nothing and changes no Vercel, Cloudflare, GitHub or Google setting.

## 2. The face (lane F)

### 2.1 The answer to "are we using the correct rasmus inter?"

Yes. `packages/fonts/assets/InterVariable.woff2` and the Latin subset `InterVariable-latin.woff2` both read "Version 4.001;git-9221beed3" in the name table, axes opsz 14 to 32 (default 14) and wght 100 to 900 (default 400); the full upright file is 352,240 B with sha256 `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3`, the bytes of the rsms release (`THIRD_PARTY_NOTICES.md` 12). The Latin subset keeps 42 features: aalt, calt, case, ccmp, cpsp, cv01 to cv13, dlig, dnom, frac, kern, locl, mark, mkmk, numr, ordn, pnum, salt, sinf, ss01 to ss08, subs, sups, tnum, zero (the full file adds cv14). `/home` loads the upright Latin subset alone. What reads as General Translation's Inter is two alternates, `cv11` (the single storey a) and `ss01` (the open 6 and 9), which production's chrome switches on in 19 rules of the shared index CSS until the design round's pushes land; this tree draws them only where C2 and C6 say.

### 2.2 Where the alternates are, and what leaves

| Place                                                                                                                                       | Today                                                                                                    | After this round                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/theme/src/gt-ink-paper/sheet.css` 40 and 279, `packages/theme/src/tokens.ts` 236 to 246, `packages/theme/src/themes.ts` 40        | The General Translation theme                                                                            | Stays (DESIGN.md 4.2)                                                  |
| `packages/render/src/theme-css.ts` 106 to 107 and 339 to 340; `packages/fonts/src/export.ts`; `packages/export/src/pptx/fonts-map.ts`       | The theme's mapping and its PowerPoint face                                                              | Stays                                                                  |
| `apps/studio/src/routes/home.css` 510, `.ts-sheet .ts-home-h1, .ts-home-h2, .ts-home-h3 { font-feature-settings: var(--display-features) }` | The page deck's slide headings read the theme's token; the kits band sets `normal` for every other theme | Stays (C6); the widened rule allows it because it is under `.ts-sheet` |
| `packages/identity/src/marks-render.ts` 353, `style="font-feature-settings:'cv11','ss01'"` on the people marks' initials                    | Drawn in the editor's presence chips through `packages/chrome/src/presence/mark-svg.ts` 7                | The attribute leaves; the initials draw Inter's defaults               |
| `scripts/build-brand.ts` 597, generating `packages/theme/brand/wordmark.svg` 1 to 2 and `og-template.html` 110                              | The lockup's word "Turboslide" with cv11 and ss01                                                        | The declaration leaves (no glyph of the word changes)                  |
| `scripts/build-brand.ts` 655, generating `og-template.html` 31 and `apps/studio/public/og/turboslide.png`                                   | The social card's sentence prints the single storey a                                                    | The declaration leaves; the card is regenerated                        |

### 2.3 The lint rule

`css/chrome-alternates` (`packages/lint/src/brand/css.ts` 181 to 182 and 375 to 383; `source.ts` 83, 384 to 387 and 752 to 757; owners `config.ts` 151 to 155) keeps its id and widens:

1. A feature value (`font-feature-settings`, a custom property whose name holds "feature", a JSX `fontFeatureSettings`, an inline `style` string) fails when it names `ss01` to `ss20`, `cv01` to `cv99`, `salt`, `swsh` or `aalt` (`hasAlternates` becomes `/\b(?:ss\d\d|cv\d\d|salt|swsh|aalt)\b/`, applied only inside a feature value, as today).
2. `font-variant-alternates` other than `normal` fails.
3. `var(--display-features)` fails in a rule whose selector is not scoped to a slide (no `.ts-sheet` compound in it).
4. The rule's roots add `packages/identity/src`, `scripts/build-brand.ts` and `packages/theme/brand/` (the generated HTML and SVG, read as text); `ALTERNATES_OWNERS` is unchanged.
5. Numeric features stay with `css/numerals` (`tnum` and `zero` through `--pt-numerals`); `case`, `calt` and `kern` are not stylistic sets and stay legal.

Tests in `css.test.ts` and `source.test.ts`: `ss02` in a chrome rule fails; `cv05` in an inline style fails; `font-variant-alternates: stylistic(x)` fails; `var(--display-features)` under `.ts-sheet` passes and outside it fails; the theme's sheet passes; the old `marks-render.ts` attribute fails. The rule is in enforce mode since DR-D1#5 and lands with the fixes of 2.2 in the same push, so the tree is green at every commit. The three browser rows that test `/cv11|ss01/` (`e2e/core/design-pages.ts` 441 to 450, `chrome-surfaces.ts` 1638 to 1669, `home/design.ts` 337 to 338) stay as they are; `chrome.font.no-stylistic-sets` reads every tag on every page.

### 2.4 The proof

- `packages/fonts/src/inter-release.test.ts` reads every `InterVariable*.woff2` under `packages/fonts/assets` (seven upright, seven italic) through `woff2Facts` of `woff2-names.ts`, which gains an `fvarAxes(tables)` reader (fvar is never transformed in woff2): name 5 is "Version 4.001;git-9221beed3"; the axes are opsz 14 to 32 (default 14) and wght 100 to 900 (default 400); the upright Latin subset's GSUB names the 42 tags of 2.1 and the full upright adds cv14; `InterVariable.woff2` is 352,240 B with the sha256 of 2.1. The italic's existing pins in `inter.test.ts` stay.
- `chrome.font.official-inter` (6.2) reads the served face in the browser: one font request with the bytes and sha256 that `packages/fonts/export/fonts.json` `web` records, and the features taking effect by measured widths at 100 px with optical sizing and kerning off (DESIGN.md 4.2's units: a 1,150 and 1,254 with cv11; 6 and 9 1,270 and 1,191 with ss01; 2,048 to the em).
- `docs/brand.md` section 3 names the rule of 2.3 and the proof.

### 2.5 Tabular figures

Every number on `/home` that sits in a column or changes in place computes `tabular-nums` through `--pt-numerals` on this tree; the four runs with digits that compute `normal` are prose or monospace (research-header 4.3). No change there. The new numbers of this round take `.pt-num`: the device code with `data-num="code"` (slashed zero), the Send Another countdown, the docs' step numbers, table figures and the reference's counts. `chrome.font.tabular-figures` reads every page after A's and D's surfaces land.

### 2.6 The object of the realtime rows

The Worker's room frame already names the object: `deck-room.ts` 774 to 780 sends `{ t: 'room', colo, object: this.ctx.id.toString().slice(0, 8), idleMs, maxMs }` after `hello`; the client keeps it (`transport.ts` 1018 to 1025) and the page's facts expose it at `describe().state.sync.room` (`controller.tsx` 4454), which `realtime.spec.ts` already types (221). In `realtime.spec.ts`:

1. `realtime.join.chip-within-1s` (1145 to 1152): on the do tier, read `(await facts(A)).sync.room.object` and B's; assert each matches `/^[0-9a-f]{8}$/` and that B's equals A's ("one object across both origins"); keep `statuses.a.colo` and `statuses.b.colo` and both room colos in the `measure` annotation.
2. `setup.do.two-instances` (1803 to 1804): the same, with `hello.a.object` and `hello.b.object` read beside `hello.a.colo`.

No Worker, client or contract change. Both rows are restated (6.6).

## 3. The navigation and the hero (lane N)

### 3.1 The pause control

1. `HomeNav.tsx`: `<MotionToggle />` (112) and its `PRESSED_SCRIPT` block (36 to 37, 114 to 116) leave the bar; `MotionToggle` stays exported where it is.
2. `HomeFooter.tsx`: the toggle as a text button at the end of the closing line, `data-control="home.foot.motion"`, with the `pause` and `play` glyphs and the labels "Pause Motion" and "Play Motion" (`design-copy.ts`). `MotionToggle` takes a `label` flag that draws both words in one grid cell and shows one by `html[data-motion]`, as the glyphs are shown, so the button's width never changes on a press. Pictures of the placement: `research-header/proposed-footer-1440-light.jpg`, `proposed-footer-390-dark.jpg`.
3. The pressed script moves after the footer's toggle and sets every `[data-motion-toggle]` with `querySelectorAll`, so a visitor who paused earlier hears both toggles as pressed before the live core loads.
4. `motion.css` 568 to 573 hides every `.ts-motion-toggle` under `prefers-reduced-motion: reduce` (today it names the header's alone, so the terminal's shows: `research-header/reduced-1440-terminal-head.jpg`); 11 to 14 name `.ts-motion-toggle.pt-ib`.
5. `boot.ts` and `live/motion.ts` are unchanged: both answer any `[data-motion-toggle]`.
6. The hero terminal's 28 px toggle stays where it is and becomes the 13th Tab stop.
7. `docs/LANDING.md` 2.1, 3.2 and 3.10 restate the control's place.

### 3.2 The bar

1. One hairline, before Sign In: the hairline after Documentation leaves (`HomeNav.tsx` 107; `.is-links` in `home.css` 2675 to 2678). The bar reads the lockup, Documentation (720 px and over), the theme button, a hairline, Sign In, New Presentation.
2. Under 360 px: `.ts-product-nav-row { gap: 4px }` and the hairline hidden. The row then needs 318 px of 320 (the 24 px mark, the 32 px theme button, the 68 px Sign In slot, the 150 px New Presentation, two 16 px sides, three 4 px gaps). About 80 B of CSS.

### 3.3 The theme button from the first paint

In the shared component, so the editor's toolbar (`Toolbar.tsx` 585), the docs bar and the auth page's foot draw the same:

```tsx
<span className="pt-theme-glyph is-light" aria-hidden="true">◐</span>
<span className="pt-theme-glyph is-dark" aria-hidden="true">◑</span>
```

```css
/* packages/chrome/src/ToolButton.css: the glyph html[data-theme] names, from the first paint */
:root[data-theme='dark'] .pt-theme-glyph.is-light,
:root:not([data-theme='dark']) .pt-theme-glyph.is-dark {
  display: none;
}
```

`home.css` 358 to 363 (the glyph hidden until hydration) leaves. The icon button (`label` false) carries `aria-label="Dark or light"`, the tooltip's own words, for every visitor before and after hydration; the labelled button ("Theme") carries no `aria-label`, so its name is its visible label (WCAG 2.5.3). The React state that picked the glyph leaves; the MutationObserver stays only if another part of the button reads the theme. Without script `html` has no `data-theme`, the page draws its light tokens and the button draws ◐. Cost: about 120 B of CSS and 30 B of markup per button. A unit test (`packages/chrome/src/__tests__/theme-button.test.tsx`) pins the two spans and the names.

### 3.4 The hero

In `home.css` (replacing 588 to 632 and the hero lines of the 1023 and 719 blocks), from research-header 5.2:

```css
/* the h1 at 76 px wherever its column is 592 px wide (the content is 1,024 px from a 1,136 px
   viewport), scaled with the content under it; the side spans the h1's ink */
.ts-hero-head {
  container-type: inline-size;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 384px);
  align-items: stretch;
  gap: 24px 48px;
  --ts-h1: min(76px, (100cqi - 432px) * 0.12838);
}

.ts-h1 {
  font-size: var(--ts-h1);
}

/* the lead's first cap on the h1's first cap (0.1362 em under the h1's box, less the lead's own
   7.82 px at 19 px on 1.55), the buttons' foot on the h1's last baseline (0.1362 em above its box's
   foot): Inter's ascender 1,984, cap 1,490 and descender -494 at 2,048 units */
.ts-hero-side {
  display: grid;
  align-content: space-between;
  gap: 16px;
  min-width: 0;
  padding: calc(var(--ts-h1) * 0.1362 - 7.82px) 0 calc(var(--ts-h1) * 0.1362);
}

.ts-hero-lead {
  max-width: 372px;
}

@media (max-width: 1023px) {
  .ts-hero-head {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    --ts-h1: 64px;
  }
  .ts-hero-side {
    align-content: start;
    gap: 24px;
    padding: 0;
  }
}

@media (max-width: 719px) {
  .ts-hero-head {
    --ts-h1: min(44px, 100cqi / 8.4);
  }
  .ts-hero-lead {
    font-size: 16px;
    max-width: none;
  }
}
```

and `design-copy.ts` 23: `lead: 'No account is needed.'`. The 186 px floor and its comment leave: from 1024 px the head's height is the h1's two lines in either face, and under 1024 px the lead's two lines break the same way in both faces.

| Width | h1                             | Side over the h1 | Lead                           | Lead's first cap to the h1's | Buttons' foot to the h1's last baseline | Stage top             |
| ----- | ------------------------------ | ---------------- | ------------------------------ | ---------------------------- | --------------------------------------- | --------------------- |
| 1440  | 76 px                          | 0 (today +34)    | 2 lines                        | -0.2 px                      | +0.1 px                                 | 283 (34 px higher)    |
| 1280  | 76 px (today 67.6)             | 0 (today +50.8)  | 2 lines                        | -0.2 px                      | +0.1 px                                 | 283 (34 px higher)    |
| 1024  | 61.6 px (today 54.1)           | 0 (today +77.9)  | 2 lines                        | +0.2 px                      | +1.1 px                                 | 254.8 (62 px higher)  |
| 768   | 64 px, one column (today 40.6) | under            | 2 lines                        |                              |                                         | 405.9 (13.5 px lower) |
| 390   | 42.6 px                        | under            | 2 lines                        |                              |                                         | 401.8 (29 px higher)  |
| 320   | 34.3 px                        | under            | 2 lines (3 on the third visit) |                              |                                         | 385.2 (54 px higher)  |

Pictures of the drawn proposal: `research-header/proposed-hero-1440-light.jpg`, `proposed-hero-1440-dark.jpg`, `proposed-hero-1024-light.jpg`, `proposed-hero-768-light.jpg`, `proposed-hero-390-dark.jpg`, `proposed-hero-320-light.jpg`. The h1 stays the LCP element and two locked lines (`decks.home.seller-lead`, `home.hero.font-swap`). `docs/LANDING.md` 2.2 restates the lead and the stage's place.

### 3.5 Budgets

`/home`'s document has 244 B of room (99,756 of 100,000 B decoded, DESIGN.md 8.16). The bar loses about 600 B, the footer gains about 700 B, the lead loses 62 B and the theme glyph adds about 30 B: about +70 B. Page CSS changes by under +200 B decoded against 18,570 B brotli of a 20 KB line. The route chunk takes the theme button's change (a few bytes). N reads every `home.budget.*` row on its node-server build for each push; a crossed line holds the push until N cuts bytes in its own files, and no line is raised without Kevin.

## 4. The auth UI (lane A)

### 4.1 Kevin's screenshot

Reproduced on this tree (`research-auth/01-kevin-repro-nogoogle-dark-2x.jpg`, `02-kevin-repro-nogoogle-light-2x.jpg`). The pages' `SignInButton` renders the dialog beside itself (`apps/studio/src/components/home/sign-in.tsx` 110 to 125); on `/home` that is inside `span.ts-product-nav-signin` inside `main.ts-product`, and the dialog's `popover="manual"` layer keeps its DOM place, so every descendant rule of `home.css` applies to it.

| #   | Defect                                                                | Cause                                                                                                                                           | Fixed by                                                                                                                 |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| K1  | The lead starts at the dialog's left edge                             | `home.css` 30 to 32 `.ts-product p { margin: 0 }` (0,1,1) beats `Dialog.css` 109 to 112 `.ts-dialog-lead` (0,1,0)                               | A#1 (the dialog leaves `main`), A#4 (the pages link to `/signin`)                                                        |
| K2  | The primary button has no label (ink on ink) once an address is typed | `home.css` 372 to 375 `.ts-product-nav-signin .pt-ib { color: var(--pt-ink) }` matches the dialog's buttons after `tokens.css` 548 to 552       | A#1, A#4                                                                                                                 |
| K3  | A blue focus ring                                                     | `home.css` 60 to 68, the landing's focus rule, beats `Dialog.css` 197 to 202                                                                    | A#1, A#4                                                                                                                 |
| K4  | About 124 CSS px empty under the field                                | `accounts.css` 77 to 79 (`min-height: 125px` on the email step), the reserved 20 px error row and its margins (`SignIn.tsx` 133 and 354 to 358) | A#1 (the min height and the reserved row on the methods step leave), A#4 (no reserved row but in the states that answer) |
| K5  | No Continue with Google                                               | That preview had no Google client (`better-auth.ts` 111 to 126 needs both variables); correct for it                                            | The dev server recipe of 7.0 always carries the fake Google pair; the gallery draws every method set                     |
| K6  | Cancel and the confirming button in a ruled footer far from the field | `Dialog.tsx` 358 to 379 draws actions in a footer; `SignIn.tsx` 224 adds Cancel                                                                 | A#4 (no footer, no Cancel, Continue under the field)                                                                     |

The old row `accounts.signin.one-dialog` read the card's class, corners, Title Case, the body's scroll and Google's mark, and never the lead's inset, a label's contrast after typing, the focus ring or the gap above the footer, so all four defects passed it. Its restatement (6.6) reads them.

The other defects of every auth surface, from research-auth 2: the code step's sentence flush on its label, no period, a "request a new one" with no control, the address not named (S4); a bad or used magic link silent on `/decks` and `/home` (S5); Cancel at Google ends on a 403 JSON page on production (S6); `/device` an email form with no Google and a dead end with mail off (S7); the phone's More menu with no account rows for a signed in person (S8); "Sessions" opening Profile (S8); the name prompt offering Sign In to a signed in person (S10); Forget's button in sentence case and its lead without a period (S11); You need access sending the person to `/decks` and back by hand (S13); the mail's subject carrying the code (S4).

### 4.2 The plate

One folder in the chrome, so the editor and the pages draw the same code:

| File                                      | Holds                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/chrome/src/auth/auth-model.ts`  | Framework free: the state union of 4.4, `nextState(state, event)`, `reasonOf(code)` mapping better-auth's codes to error states, `safeNext(path)` (a same origin path that starts with one `/`, with no `//`, no `\` and no scheme; anything else reads `/decks`). Unit tested in `auth-model.test.ts`                                                                                   |
| `packages/chrome/src/auth/auth-words.ts`  | Every sentence of 4.5; replaces `ACCOUNT.signInDialog` in `menus/strings.ts`, `SIGN_IN_WORDS` (`apps/studio/src/components/home/sign-in-words.ts`) and `DEVICE_WORDS` (`apps/studio/src/routes/device.tsx` 21 to 31)                                                                                                                                                                     |
| `packages/chrome/src/auth/AuthPlate.tsx`  | The content of a state: heading (page host), lede, the controls, one error line under the control that caused it, the foot sentence. Props: `state`, `host: 'page' \| 'window'`, `methods` (the deployment's `SignInMethods`), `actions` (social, magic link, code, resend, device approve and deny), `next`. No layout beyond the column                                                |
| `packages/chrome/src/auth/AuthPage.tsx`   | The page host: the mark at the head (`AppBarBrand`'s mark, a link to `/decks`), the column, the picture region from 1024 px (C18; a `figure` prop, which `/signin` and `/device` fill with `apps/studio/src/components/home/MoodFigure.tsx`'s twin pictures, since the chrome package imports nothing from the studio), the foot row (the shared `ThemeButton` and the picture's credit) |
| `packages/chrome/src/auth/AuthWindow.tsx` | The window host: the chrome's `Dialog` with the title "Sign in" and the close glyph, no actions and no Cancel (`Dialog` draws no footer row when it has no rows, `Dialog.tsx` 359), the plate in its body; it enters the dialog layer through `useLayer` in the editor's DOM, where no page rule reaches it                                                                              |
| `packages/chrome/src/auth/auth.css`       | One sheet under the `.ts-auth` root class, tokens only; Google's fills as custom properties local to `.ts-auth`                                                                                                                                                                                                                                                                          |

`packages/chrome/package.json` exports `./auth/*` for the studio.

Geometry, from General Translation's plate (`research-auth/20` to `24`) on Turboslide's tokens:

- Page host. From 1024 px: the column `min(464px, 100vw - 40px)` inside a left region of `min(584px, 56vw)`, its left edge at `max(24px, (region - column) / 2)`; the picture region to the right of it. Under 1024 px: the column alone, centred, with 24 px gutters (20 px under 768) and no picture. The column is centred vertically between the top and the foot row and starts at least 48 px from the top. The mark 25 px wide, 40 px over the heading. Heading 30 px, line 1.08, weight 500, tracking -0.025em, Inter's defaults. Lede 15 px, line 1.55, `--pt-ink-2`, at most 58ch. Controls 44 px tall, the column's width, the 6 px control corner (`--pt-radius`). The foot row 24 px over the bottom edge. No box around the column and no shadow.
- Window host. `min(400px, 100vw - 32px)` wide, the 8 px window corner (`--pt-radius-lg`), 24 px padding, the title in the window's head, the lede 13 px, controls 40 px, the height of its content.
- Both hosts. Provider rows first (Google, then GitHub where configured), each an outline row with the provider's mark and its words aligned left; one hairline "or" row; the Email field with the solid Continue directly under it. Production offers Google alone, so its one control is the first. The first control takes the focus on open. The focus ring is the chrome's one rule (1 px ink, inset). The error line is reserved only in the states marked "answer" in 4.4. Every label reads 4.5:1 or more on its own ground, enabled and disabled.
- Continue with Google draws Google's fills (C16): `#FFFFFF` with a 1 px `#747775` edge on light, `#131314` with a 1 px `#8E918F` edge on dark, the standard four colour G at 18 px, the label "Continue with Google" in Inter 500 in the chrome's ink for that appearance. No string says "Google's" outside the sign in allowance (`competitor.ts` `SIGN_IN_ALLOWED`).
- Control ids stay what the rows read: `dialog.signIn.<part>` in the window and `page.signIn.<part>` on the page, with the parts `google`, `github`, `email`, `continue`, `code`, `verify`, `back`, `error` of `SignIn.tsx` 134; `resend` and `retry` join them. The links keep `home.signIn` (`/decks`) and `home.nav.signIn` (`/home`).

### 4.3 Where each surface goes

| Surface                                                                                                                                                                                                                                                          | After the round                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/signin?next=<path>&error=<code>` (new, `apps/studio/src/routes/signin.tsx`)                                                                                                                                                                                    | `AuthPage`, rendered on the server: the loader reads the session and `signInMethods` once; a signed in visitor gets a redirect to `safeNext(next)`; `error` draws the matching error state with Try Again, which returns to the methods with the same `next`. Not prerendered (the methods and the session belong to the deployment and the request)                                                                                                           |
| `/home` and `/decks` Sign In                                                                                                                                                                                                                                     | A plain link (a document navigation) to `/signin?next=/home` and `/signin?next=/decks`, drawn when the deployment offers a method, in today's 68 px slot. The lazy dialog chunk, `sign-in-dialog.tsx` and `sign-in-words.ts` leave                                                                                                                                                                                                                             |
| The editor's Sign In: the title row (`TitleRow.tsx` 492 to 510), the account menu's Sign in row (`menus/model.ts` 924 to 929), the name prompt (`NamePrompt.tsx` 154 and 243), More under 480 px (`TitleRow.tsx` 527 to 541), and any dialog that offers Sign In | `AuthWindow` over the deck; the social and magic link `callbackURL` stays the deck address (`signInReturnAddress`, `EditorRoot.tsx` 299 to 302) and `errorCallbackURL` is `/signin?next=/edit/<deck>`                                                                                                                                                                                                                                                          |
| The email method                                                                                                                                                                                                                                                 | Where mail is on: the field and Continue under the provider rows, then `email.sent` with the address named and the code entry, in both hosts                                                                                                                                                                                                                                                                                                                   |
| Social and magic link errors                                                                                                                                                                                                                                     | `errorCallbackURL: /signin?next=<return address>` on `sign-in/social` and `sign-in/magic-link` from every caller (`sign-in-auth.ts` 23 to 28, `EditorRoot.tsx` 1018 to 1025); `onAPIError.errorURL: '/signin'` in `better-auth.ts` for the errors that carry no state (`state_not_found`, `invalid_callback_request`)                                                                                                                                          |
| The editor's `?error=` (`EditorRoot.tsx` 678 to 699)                                                                                                                                                                                                             | Opens the window in the matching error state and removes the parameter                                                                                                                                                                                                                                                                                                                                                                                         |
| `/device?user_code=<code>`                                                                                                                                                                                                                                       | `AuthPage`. Anonymous: `device.sign-in-first` with the deployment's methods and `next=/device?user_code=<code>`. Signed in: the code in two inputs of four characters (44 px, `data-num="code"`, a paste of eight characters into the first fills both), prefilled from `user_code`, Approve and Deny, then the outcome. The calls stay `GET /api/auth/device?user_code=` then `POST /api/auth/device/approve` or `deny`. The 288 lines of inline styles leave |
| You need access (`routes/-access-page.tsx` 94 to 112)                                                                                                                                                                                                            | Stays on the page frame (it is a page about a presentation, with Not found, DESIGN.md 9); its sentence becomes one and its Sign In is a link to `/signin?next=/edit/<deck>`                                                                                                                                                                                                                                                                                    |
| The account menu                                                                                                                                                                                                                                                 | The same rows; "Sessions" reads "Profile", the dialog it opens; under 480 px a signed in person's More gains Change name and Sign out                                                                                                                                                                                                                                                                                                                          |
| The name prompt                                                                                                                                                                                                                                                  | Draws Sign In only for an anonymous person on a deployment with a method                                                                                                                                                                                                                                                                                                                                                                                       |
| Forget this browser (`dialogs/ForgetBrowser.tsx` 34 to 50)                                                                                                                                                                                                       | The button "Forget This Browser"; the lede of 4.5                                                                                                                                                                                                                                                                                                                                                                                                              |
| The mail (`server/auth/mail/templates.ts` 49 to 73)                                                                                                                                                                                                              | Subject "Sign in to Turboslide"; the wordmark at the head; the body's sentences of 4.5                                                                                                                                                                                                                                                                                                                                                                         |
| No database (`SignIn.tsx` 125 to 129)                                                                                                                                                                                                                            | `methods.none`: one sentence and no control                                                                                                                                                                                                                                                                                                                                                                                                                    |

### 4.4 The states

Each is one entry in the model and one gallery state. "Answer" marks the states that reserve the error line.

| Id                                                                    | Heading (page host)            | What it shows                                                                                        |
| --------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `methods.google`                                                      | Sign in to Turboslide          | Continue with Google alone (production)                                                              |
| `methods.google-email`                                                | Sign in to Turboslide          | Continue with Google, the "or" row, Email and Continue                                               |
| `methods.all`                                                         | Sign in to Turboslide          | Google, GitHub, the "or" row, Email and Continue                                                     |
| `methods.email`                                                       | Sign in to Turboslide          | Email and Continue (no provider configured)                                                          |
| `methods.none`                                                        | Sign in to Turboslide          | "Sign in is not available on this deployment." and no control                                        |
| `methods.leaving`                                                     | Sign in to Turboslide          | Continue with Google busy while the browser leaves                                                   |
| `email.sent` (answer)                                                 | Check your email               | The address named, the six digit field, Verify, Use Another Address, Send Another with its countdown |
| `email.code-wrong`, `email.code-expired`, `email.code-spent` (answer) | Check your email               | The line under the field for each                                                                    |
| `error.cancelled`                                                     | Sign in did not complete       | `access_denied`                                                                                      |
| `error.expired`                                                       | Sign in did not complete       | `state_not_found`, `state_mismatch`, `invalid_callback_request`                                      |
| `error.link`                                                          | Sign in did not complete       | `INVALID_TOKEN`, `EXPIRED_TOKEN`, `ATTEMPTS_EXCEEDED`                                                |
| `error.account`                                                       | Sign in did not complete       | `account_not_linked`, `unable_to_link_account`, `email_not_found`, `email_doesn't_match`             |
| `error.other`                                                         | Sign in did not complete       | Any other code, named in small type                                                                  |
| `device.sign-in-first`                                                | Connect the command line       | The methods, with `next` back to the device page                                                     |
| `device.code` (answer)                                                | Connect the command line       | The two code inputs, Approve, Deny                                                                   |
| `device.code-wrong`, `device.spent`, `device.expired` (answer)        | Connect the command line       | The line under the code                                                                              |
| `device.approved`                                                     | The terminal is signed in      | One sentence, no control                                                                             |
| `device.denied`                                                       | The terminal was not signed in | One sentence, no control                                                                             |
| `menu.anonymous`, `menu.signed-in`                                    |                                | The account menu                                                                                     |

### 4.5 The words

Plain technical English, sentence case headings, Title Case buttons, a period after every sentence. "Continue with Google" stays.

| State                  | Words                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Methods, page          | Heading "Sign in to Turboslide". Lede "The presentations you made in this browser move to your account." Foot "Turboslide uses the name and the address of your Google account. It reads nothing else from Google after you sign in." (drawn where Google is a method; NEXT.md 4.3.2 item 7)                                                                                                                                                             |
| Methods, window        | Title "Sign in"; the same lede and foot                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Email rows             | Label "Email", button "Continue", divider "or"                                                                                                                                                                                                                                                                                                                                                                                                           |
| `methods.none`         | "Sign in is not available on this deployment."                                                                                                                                                                                                                                                                                                                                                                                                           |
| `email.sent`           | Heading "Check your email". Lede "A message with a link and a six digit code is on its way to <address>. Both work once and expire in 5 minutes." Label "Six digit code", button "Verify", then "Use Another Address" and "Send Another" ("Send another in 0:45" while the wait runs; three mails per address per 10 minutes, `better-auth.ts` 86 to 87)                                                                                                 |
| `email.code-wrong`     | "That code does not match. Check the newest message and try again."                                                                                                                                                                                                                                                                                                                                                                                      |
| `email.code-expired`   | "That code expired. Send another to get a new one."                                                                                                                                                                                                                                                                                                                                                                                                      |
| `email.code-spent`     | "That code had three wrong tries. Send another to get a new one."                                                                                                                                                                                                                                                                                                                                                                                        |
| Errors                 | Heading "Sign in did not complete". `error.cancelled` "The sign in was cancelled at Google." `error.expired` "The sign in started in another tab or took too long. Start again from this page." `error.link` "That link was used or has expired. Ask for a new one." `error.account` "That Google account cannot be joined to the account signed in here." `error.other` "The sign in did not complete." with the code in small type. Button "Try Again" |
| `device.sign-in-first` | Heading "Connect the command line". Lede "Sign in first. This page then asks for the code your terminal shows."                                                                                                                                                                                                                                                                                                                                          |
| `device.code`          | Lede "Type the code your terminal shows." Label "Code", buttons "Approve" and "Deny". Foot "Approve only a code you started from your own terminal."                                                                                                                                                                                                                                                                                                     |
| `device.code-wrong`    | "That code does not match. Check the terminal and try again."                                                                                                                                                                                                                                                                                                                                                                                            |
| `device.spent`         | "That code had five wrong tries. Run turboslide login again for a new one."                                                                                                                                                                                                                                                                                                                                                                              |
| `device.expired`       | "That code expired. Run turboslide login again for a new one."                                                                                                                                                                                                                                                                                                                                                                                           |
| `device.approved`      | Heading "The terminal is signed in". Lede "It acts as <address>. You can close this tab."                                                                                                                                                                                                                                                                                                                                                                |
| `device.denied`        | Heading "The terminal was not signed in". Lede "You can close this tab."                                                                                                                                                                                                                                                                                                                                                                                 |
| You need access        | "If you were invited by email, sign in with that address." Button "Sign In"                                                                                                                                                                                                                                                                                                                                                                              |
| Account menu           | "Account", "Signed in as <address>", "Not signed in", "Change name", "Change avatar", "Sign in", "Sign out", "Forget this browser", "Profile"                                                                                                                                                                                                                                                                                                            |
| Forget this browser    | Title "Forget this browser". Lede "Your name, avatar and unsaved changes in this browser are cleared. Earlier edits keep the old name." Buttons "Cancel" and "Forget This Browser"                                                                                                                                                                                                                                                                       |
| The mail               | Subject "Sign in to Turboslide". Body: the wordmark, then today's sentences of `templates.ts` 51 to 59 unchanged ("Sign in to Turboslide with this link, or type the code into the tab that asked.", the link, "Code: <code>", "The link and the code work once and expire in 5 minutes.", "If you did not ask to sign in, ignore this message.")                                                                                                        |

### 4.6 The gallery

`/dev/auth?state=<id>&host=page|window` (`apps/studio/src/routes/dev.auth.tsx`). Its loader answers 404 unless `TURBOSLIDE_LOCAL_OPEN=1` and the process is not hosted (`isHosted()`, `server/root.ts` 193); it is never prerendered and nothing links to it. The page draws `AuthPage` or `AuthWindow` with stub actions that resolve after 400 ms and never call `/api/auth` (Prototemplate's `plate/lib/actions` stubs work the same way), and stub methods per state. A select of every state sits at the top left; `?chrome=0` hides it for pictures. `apps/studio/e2e/accounts.spec.ts` walks every state at 1440 and 390 in both appearances (`accounts.plate.states`).

### 4.7 The behaviour that does not change

- The calls: `POST /api/auth/sign-in/social {provider, callbackURL}`, `POST /api/auth/sign-in/magic-link {email, callbackURL}`, `POST /api/auth/sign-in/email-otp {email, otp}`, `GET /api/auth/get-session`, the device pair, and Sign out through `account.signOut` then a reload (`EditorRoot.tsx` 1067 to 1097). The one addition is `errorCallbackURL` on the first two, which better-auth accepts and checks against the trusted origins as it checks `callbackURL`.
- The anonymous deck linking: the session create hook (`better-auth.ts` 314 to 325) links the alias on every new session, whatever page started it; `/signin` is a same origin page and the identity cookie rides on the exchange.
- The return addresses: the editor's is the deck; the pages' is `next`, the path the page Sign In sends today (`sign-in-auth.ts` 18 to 20), carried through `/signin`.
- The rate limits (`better-auth.ts` 285 to 302) and the per address mail quota (196 to 207). `/signin` and `/dev/auth` are GET pages with no write and no limiter.
- The CSRF filter (`server/headers.ts` 412 to 435); `/signin` is a page route outside `CSRF_ROUTE_PATTERNS`.

### 4.8 Costs

`/signin`'s route chunk carries the plate (an estimate of 10 to 14 KB gzip) and is the only page that requests the Blue Marble twin (179,587 B light, 179,545 B dark), lazily, at 1024 px and over; it adds no file to the repository. `/home` and `/decks` lose the lazy dialog chunk. A `/signin` view runs one function (the loader's session and methods read); sign in views are rare next to page views, and no other page gains a call. Size, research-auth 4.7's estimates: A#1 about +15 and -10 lines; A#2 about +700; A#3 about +90 and -200; A#4 about +400 and -750; A#5 about +30. Time: 4.25 pipeline days.

## 5. The docs (lane D)

### 5.1 The stack

- `fumadocs-core` 16.16.2 and `fumadocs-mdx` 15.4.6, pinned exactly in the catalog of `pnpm-workspace.yaml` with a comment naming this file, attached to `apps/studio` by D once: `pnpm add --filter @turboslide/studio fumadocs-core@catalog: fumadocs-mdx@catalog:`, which writes `apps/studio/package.json` and `pnpm-lock.yaml`. `esbuild` is already in `allowBuilds`; no other entry changes. `AGENTS.md`'s catalog list gains one line. No other lane installs.
- `fumadocsMdx()` joins the plugin lists of `apps/studio/vite.config.ts` and `vite.deploy.config.ts`.
- Collections through the macro API in `apps/studio/src/docs/source.ts`: `defineDocs({ dir: 'content/docs', docs: { async: true, postprocess: { includeProcessedMarkdown: true } } })` and `loader({ baseUrl: '/docs' })`, with no icon plugin.
- Measured on port 4712 with Turboslide's versions (research-docs 5): 13.0 KB gzip of script and about 2 KB gzip of CSS on docs pages, of which 8,023 B gzip is fumadocs' client loader; the route tree's entries, 3,122 B raw for six routes, join the shared entry chunk (reported against 600 KB, `home.budget.shared`); `/home`'s document names only its own route (the production read of the header paragraph).

### 5.2 Routes, files and the build

| File                                                                                  | Purpose                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/studio/content/docs/**/*.mdx`, `meta.json`                                      | The written pages; a folder apart from the repository's `docs/`, which stays the engineering record                                                                                                                                                                                                                       |
| `apps/studio/content/docs/reference/*.mdx`                                            | Generated by `pnpm generate:contracts` (5.4), committed, "Generated: do not edit" in their frontmatter                                                                                                                                                                                                                    |
| `apps/studio/src/docs/source.ts`, `markdown.ts`, `search-index.ts`, `content.test.ts` | The loader, the twins' per component markdown, the index writer, the content test (5.6)                                                                                                                                                                                                                                   |
| `apps/studio/src/routes/docs.tsx`                                                     | The layout: links `docs.css` in its `head`, draws the page frame, the bar and the sidebar                                                                                                                                                                                                                                 |
| `apps/studio/src/routes/docs.index.tsx`, `docs.$.tsx`                                 | `/docs` and every page: an isomorphic loader (no `createServerFn`), `codeSplitGroupings: [['loader'], ['component']]`, a `head` with the title, description, canonical, `og:title`, `og:description` and `<link rel="alternate" type="text/markdown">`; a miss draws the docs layout with the three closest pages by name |
| `apps/studio/src/routes/docs.{$}[.]md.ts`                                             | The twin: `/docs/<path>.md`, and `/docs/index.md` for `/docs`, `text/markdown; charset=utf-8`, with a canonical `Link` header                                                                                                                                                                                             |
| `apps/studio/src/routes/docs.search[.]json.ts`                                        | The search index                                                                                                                                                                                                                                                                                                          |
| `apps/studio/src/routes/docs.llms-full[.]txt.ts`                                      | Every written page as markdown                                                                                                                                                                                                                                                                                            |
| `apps/studio/src/routes/llms[.]txt.ts`                                                | Gains a Documentation section listing every twin                                                                                                                                                                                                                                                                          |
| `apps/studio/src/routes/sitemap[.]xml.ts`, `apps/studio/public/robots.txt`            | `/home` and every docs page; robots names the sitemap at `productionOrigin` of `packages/theme/brand/site.ts` (a unit test pins the two equal)                                                                                                                                                                            |
| `apps/studio/src/components/docs/*` and `docs.css`                                    | The components of 5.6, plain CSS on the tokens                                                                                                                                                                                                                                                                            |
| `apps/studio/src/components/home/PageFrame.tsx`, `page-frame.css`                     | The bar's right side takes the docs' controls as a slot, if the frame has none                                                                                                                                                                                                                                            |
| `packages/agent/src/generate/docs.ts` and its test                                    | The reference generator (5.4), registered with the other targets of `pnpm generate:contracts`                                                                                                                                                                                                                             |

Prerender: `vite.deploy.config.ts` builds its `pages` list from the content folder at config time (each page, its twin, `/docs/search.json`, `/docs/llms-full.txt`, `/sitemap.xml`), keeping `autoStaticPathsDiscovery: false`, `crawlLinks: false` and `failOnError: true`; a route rule gives `/docs/**` the cache header of `/home`'s pages. Every docs request is then a file from the CDN. `scripts/check-client-bundle.mjs` gains a `/docs` preload ceiling of 450,000 B (384,020 B measured on the trial) and asserts that the preloads of `/home`, `/decks` and `/edit/gt-brand` name no docs module.

### 5.3 The pages

Three sidebar groups, one level of nesting. Each page follows General Translation's order: what it is, how to do it, the reference. Words: plain technical English for a reader who knows nothing about Turboslide, sentence case headings and labels, Title Case only on buttons, no em dash, no metaphor, no product of another company's slides app named; writers also avoid "in Google" and "Google Docs", which the guard matches.

| Group          | Page                      | URL                                             | Source                                                                                                                                                                                                     |
| -------------- | ------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use Turboslide | Getting started           | `/docs`                                         | What Turboslide is (`README.md` 8 to 16), the first presentation, no account needed and what Sign in does, the ten tasks (`packages/chrome/src/dialogs/Help.tsx` 10 to 48), the agent paths in one tab set |
|                | The editor                | `/docs/editor`                                  | The menu model (`menus/model.ts`, `menus/strings.ts`): menus, toolbar, filmstrip, canvas, speaker notes, Find and replace, Version history                                                                 |
|                | Slides and layouts        | `/docs/editor/slides`                           | New, duplicate, skip, move, layouts, sections, Import slides                                                                                                                                               |
|                | Text, pictures and shapes | `/docs/editor/objects`                          | Text, pictures, logos, shapes and lines, tables and charts in the default view                                                                                                                             |
|                | Advanced tools            | `/docs/editor/advanced-tools`                   | `README.md` 30 to 53 and `docs/FOCUS.md`: the switch in Tools and what it shows                                                                                                                            |
|                | Presenting                | `/docs/presenting`                              | `components/Slideshow.tsx`, `PresenterPage.tsx`, the present strings (`menus/strings.ts` 1031 on)                                                                                                          |
|                | Sharing and people        | `/docs/sharing`                                 | `dialogs/Share.tsx`, `share-links.ts`, the account rows: links, people, presence and Follow, comments, Continue with Google, the presentations in this browser                                             |
|                | Themes and brand kits     | `/docs/themes`                                  | `packages/theme/src/themes.ts` 157 to 226, `dialogs/Tailor.tsx`, the brand actions                                                                                                                         |
|                | Download and export       | `/docs/export`                                  | `Download.tsx` 229 to 236 and the reader parts of `docs/pptx.md`: PDF, PowerPoint in its two modes, long decks in batches                                                                                  |
|                | Keyboard shortcuts        | `/docs/shortcuts`                               | Generated from `menus/keys.ts` and `menus/model.ts`, the data of the Keyboard shortcuts dialog, Mac and Windows chords                                                                                     |
|                | Run Turboslide yourself   | `/docs/self-hosting`                            | `README.md` 74 to 113 and `docs/hosting.md` section 1 (the store selection and its variables), with no account details of any host (question Q19)                                                          |
| Agents         | Agents                    | `/docs/agents`                                  | `packages/agent/generated/llms.txt` (Rules, Leases and revisions): one action table, three transports, `baseRevision` and 409, leases, the author header, the bearer token                                 |
|                | The CLI                   | `/docs/agents/cli`                              | `README.md` 115 to 134 and `cli.json`: running it, `--json`, exit codes, the command groups, `turboslide login`                                                                                            |
|                | MCP                       | `/docs/agents/mcp`                              | `llms.txt` "MCP over HTTP": `turboslide mcp` over stdio, `/mcp` over HTTP, `deck_<action>` tools                                                                                                           |
|                | HTTP actions              | `/docs/agents/http`                             | `llms.txt` "Calling an action over HTTP" and "Renders and exports over HTTP"                                                                                                                               |
|                | Skills                    | `/docs/agents/skills`                           | The four `SKILL.md` front matters, with links to each                                                                                                                                                      |
|                | Deck grammar              | `/docs/agents/grammar`                          | Generated from the source of `docs/grammar.md`                                                                                                                                                             |
|                | The page API              | `/docs/agents/browser`                          | `skills/turboslide-studio/references/browser-api.md`: `window.turboslide.studio`                                                                                                                           |
| Reference      | Action reference          | `/docs/reference` and `/docs/reference/<group>` | Generated (5.4)                                                                                                                                                                                            |

### 5.4 The reference

`packages/agent/src/generate/docs.ts` writes one MDX page per group that `describe.json` names (16 on this tree: deck, slide, block, asset, render, lint, version, view, export, studio, admin, presence, sync, comment, share, account; a new group gets a page) from `describe.json` (label, sentence, mutates, group), `cli.json` (usage and option descriptions) and `manifest.json` (the transports). Each action is one `h2` with its id as anchor, its sentence, a table of its input fields (name, type, required, description), its CLI usage, its MCP tool name, its HTTP endpoint and the transports that carry it. The group page and `/docs/reference` open with the count per transport, read from the files at generation. The pages are committed beside the other generated contracts; check step 3 already fails a stale copy. fumadocs-openapi is not used: the OpenAPI document is 2.4 MB and its API page renders on the client. The reference adds about 64 KB raw (16.8 KB gzip) to the search index.

### 5.5 Search

`/docs/search.json` holds one row per heading section from fumadocs' `structuredData` (the page title, the heading, its anchor, its text), with the page header's meta row left out so no excerpt reads "Copy Page". The search window and the index load on the first open (`React.lazy` and one fetch), with Cmd+K, Ctrl+K and `/` as keys; a short scorer ranks title, heading and text matches; Enter opens the first hit at its heading; Escape closes and returns the focus. No dependency. About 30 KB gzip for the written pages plus 16.8 KB for the reference, fetched once.

### 5.6 The surfaces

- Frame. `PageFrame`'s 58 px bar and rails. The bar: the lockup, a hairline, "Documentation" (a link to `/docs`), the search pill (6 px), the shared `ThemeButton`, New Presentation (`.pt-ib is-solid`). The body inside the 1104 px column: the sidebar (184 px), the article (about 600 px, at most 640), the table of contents (168 px) from 1180 px. Under 720 px a Menu button in the bar opens the sidebar as a `.pt-window` sheet on the dialog layer and the search pill becomes an icon button.
- Corners (DESIGN.md 3.1): buttons, fields, tabs and the menu plate 6 px; code blocks, callouts, cards and the search window 8 px through `.pt-window`; key chips and step numbers 4 px through `.pt-kbd`; sidebar and table of contents rows square. Separation by `--pt-edge` and `--pt-ring`, no blurred shadow.
- Type: Inter's defaults (DESIGN.md 4.2); headings in `--pt-display` at weight 500 as `page-frame.css` sets them; body 16 px, lead 17 px; step numbers, table figures and counts in `.pt-num`; code in `--pt-mono` on its code surface.
- Scrollbar: the global rule; `.pt-scroll` on the sidebar and the table of contents; `.pt-scroll-x` on code blocks.
- Colour: chrome tokens only (`--pt-ink`, `--pt-ink-2`, `--pt-hair`, `--pt-hair-soft`, `--pt-plate`, `--pt-edge`), both appearances through `:root[data-theme]`.
- Icons: Heroicons solid from `packages/chrome/src/icons.tsx` for callout marks and menu rows; brand marks only for Claude and ChatGPT in the Copy Page menu.
- Floating parts: the Copy Page menu (`.pt-float`) and the search window (`.pt-window`) through `useLayer` and `place()`, each loaded on first use, so a page's first load carries neither. The editor's `Menu.tsx` is not imported (it brings the menu model).
- Components: Callout, Steps, Tabs, Cards, Code with Copy (the pattern of `ConnectCard.tsx`'s Copy button), tables, and Copy Page as a split button whose menu lists View as Markdown, llms.txt, Full documentation for agents, Open in Claude, Open in ChatGPT, and the OpenAPI document on reference pages. Each component also declares its markdown form for the twins (C27).
- End of page: previous and next from the page order, then Edit This Page and Report an Issue, links to the repository. No "Last updated" (question Q21).
- `apps/studio/src/docs/content.test.ts` reads every MDX file: no em dash, no en dash used as a dash, every internal link resolves to a page or an anchor, every page has a title and a description. `competitor.ts` `TEXT_ROOTS` gains `apps/studio/content/docs`.
- Pictures of the trial mock (a research picture, the lane writes the real sheet): `research-docs/mock-docs-1440-light.jpg`, `mock-docs-1440-dark.jpg`, `mock-docs-390-light.jpg`. The mock's two gaps (no Menu control at 390, a search pill that shows only the key chip on a touch screen) are closed by the frame item above.

### 5.7 The agent twins

`/docs/<path>.md` serves the page's markdown with each component's form (C27) and no heading id suffix, through fumadocs-core's `remark-llms` with `headingIds: false` and a `stringify(node)` per component. `/llms.txt` gains a Documentation section listing every twin; `/docs/llms-full.txt` holds every written page; each page's head names its twin. Copy Page writes the twin to the clipboard through a `ClipboardItem` holding a pending blob, so Safari accepts it (General Translation's `DocsPageActions.tsx` 145 to 155).

### 5.8 The links

- `apps/studio/src/components/home/copy.ts` 91 to 96 and 563 to 568: `href: '/docs'`, no `external`, so the navigation and the footer draw no external glyph.
- `packages/chrome/src/dialogs/Help.tsx` 75 to 84: `/docs`, still in a new tab, so the editor stays open.
- `scripts/probes/core-walk/areas/help.mjs`: `help.documentation-link` reads `/docs` on the base and drops the GitHub retry.

### 5.9 Costs

Docs pages: 13.0 KB gzip of script and about 2 KB gzip of CSS at first load; the search window, the index and the Copy Page menu on first use. No function per reader. Install: fumadocs-core 455,396 B and fumadocs-mdx 181,371 B unpacked, with build time dependencies (Shiki 4, remark, unified, `@mdx-js/mdx` 3, esbuild 0.28, chokidar). Size: the generator about 150 lines; the routes and components about 900 lines; about 19 written pages. Time: 3 pipeline days.

## 6. The rows

### 6.1 Day 0 and the shape

New rows follow `docs/gslides-parity/focus/core-matrix.json`'s shape (`id`, `feature`, `interaction`, `driver`, `today`, `severity` on broken and flaky rows only, `evidence`, `note`). `today` is what production showed on 2026-10-07 in the research notes, or what this tree showed where production serves an older build, as the evidence says. Every local row (driver `e2e/accounts.spec.ts`) is `not driven` with no severity. A new row's `note` starts "Polish two (docs/POLISH-2.md 6), P2-<lane>#<n>". A restated row keeps its id, feature, driver, today, severity and evidence, takes the interaction of 6.6, and its `note` gains "; restated in polish two, P2-<lane>#<n>" at its end (a row with no note takes "Restated in polish two, P2-<lane>#<n>"). New rows are appended at the end of `rows` in push order. No row of this round carries `measure`.

Day 0 is P2-F#1, which lands first and alone and changes `scripts/probes/core-matrix.test.mjs` only:

1. `const POLISH2_NOTE = /^Polish two \(docs\/POLISH-2\.md 6\), P2-[FNAD]#\d+[a-z]?\b/;`, `const POLISH2_RETIRED = [];` and `const isPolish2Row = (row) => (row.note ?? '').startsWith('Polish two');`.
2. The count gains `+ CORE_MATRIX.filter(isPolish2Row).length - POLISH2_RETIRED.filter((id) => !isCoreId(id)).length`.
3. The landing term and the landing block's three filters read `areaOf(r.id) === 'home' && !isDesignRow(r) && !isPolish2Row(r)`, so N's new home rows are counted once.
4. The realtime block's `localRows().map(...).slice(-5)` reads `localRows().filter((row) => !isPolish2Row(row))`, so A's local rows appended after it leave the five accounts rows last.
5. A block "polish two": every polish two row matches `POLISH2_NOTE`, has a known driver and the id scheme, sits after every row that is not polish two's, and is `not driven` when local.

`scripts/probes/core-matrix.mjs` gains one line, `'core/docs.spec.ts'` in `CORE_SPEC_DRIVERS`, in P2-D#1 with the rows that driver drives. No area is added: the docs rows are `help.docs.*` (feature `help`), the auth rows `accounts.*` (feature `share`), the face rows `chrome.font.*` (feature `chrome`), the header rows `home.*` (feature `decks`); all four features are unparkable, so a red row of this round blocks the ship. `docs/FOCUS.md` and `focus/rows.md` are rendered by the integrator after the last push (`render-focus.mjs`).

### 6.2 Lane F

```json
[
  {
    "id": "chrome.font.official-inter",
    "feature": "chrome",
    "interaction": "Cold at 1440 on /home, /decks, /new, /signin and /docs: exactly one font request, InterVariable-latin.woff2, whose bytes and sha256 equal its web record in packages/fonts/export/fonts.json; document.fonts holds one loaded Inter face; in spans of that face at 100 px, weight 400, font-optical-sizing none, font-kerning none, '6969' measures 4 x 1,191 / 2,048 x 100 px with 'ss01' and 4 x 1,270 / 2,048 x 100 px without, 'aaaa' 4 x 1,254 / 2,048 x 100 px with 'cv11' and 4 x 1,150 / 2,048 x 100 px without, each within 1 px, and with 'tnum' '1111' and '0000' measure the same width",
    "driver": "core/chrome.spec.ts",
    "today": "works",
    "evidence": "research-header 4.1 (Version 4.001;git-9221beed3, opsz 14 to 32, wght 100 to 900, 42 features in the Latin subset); docs/DESIGN.md 4.2 (the advance widths)",
    "note": "Polish two (docs/POLISH-2.md 6), P2-F#4"
  },
  {
    "id": "chrome.font.no-stylistic-sets",
    "feature": "chrome",
    "interaction": "At 1440 and 390 in both appearances on /home, /decks, /decks/templates, the editor from /new, /signin, /device, /docs and /docs/agents: no element outside a slide (an element with a .ts-sheet ancestor) computes a font-feature-settings that names ss01 to ss20, cv01 to cv99, salt, swsh or aalt, and none computes a font-variant-alternates other than normal; the presence chips' initials draw with no feature list",
    "driver": "core/chrome.spec.ts",
    "today": "broken",
    "severity": 2,
    "evidence": "The orchestrator's reading of production on 2026-10-07: cv11 and ss01 in 19 rules of the shared index CSS; research-header 4.2 (marks-render.ts 353 on this tree)",
    "note": "Polish two (docs/POLISH-2.md 6), P2-F#4"
  },
  {
    "id": "chrome.font.tabular-figures",
    "feature": "chrome",
    "interaction": "At 1440 in both appearances on /home, /decks, the editor from /new, /signin, /device and every /docs page: every element outside a slide and outside a code surface whose own text is a number alone (digits with . , : / % + and minus signs and spaces, and at most one unit of up to two letters, as '1 / 9', '2.5 s', '0:45', '120') computes a font-variant-numeric with tabular-nums",
    "driver": "core/chrome.spec.ts",
    "today": "not driven",
    "evidence": "docs/DESIGN.md 4.5; research-header 4.3 (every aligned number on /home tabular on this tree)",
    "note": "Polish two (docs/POLISH-2.md 6), P2-F#4"
  }
]
```

### 6.3 Lane N

```json
[
  {
    "id": "home.nav.no-pause",
    "feature": "decks",
    "interaction": "At 1440, 1024, 768, 390 and 320 in both appearances the navigation's header holds no [data-motion-toggle]; the hero terminal's head holds one (a 28 px icon button) and the footer's closing line one, a text button reading Pause Motion or Play Motion with its glyph and the same width in both; pressing either flips html[data-motion] and both buttons' aria-pressed within one frame; a reload with the pause stored paints both pressed before the live core loads; under reduced motion neither shows",
    "driver": "core/home.spec.ts",
    "today": "broken",
    "severity": 2,
    "evidence": "Kevin, 2026-10-07: \"remove the pause unpause button in top bar\"; research-header 1.2 findings 1 and 2, 3.2 findings 1 and 2",
    "note": "Polish two (docs/POLISH-2.md 6), P2-N#1"
  },
  {
    "id": "home.nav.fits-320",
    "feature": "decks",
    "interaction": "At 320 and 359 px in both appearances the navigation is one 58 px row whose controls' boxes do not overlap, and nothing draws inside Sign In's box; from 360 px the bar reads the lockup, Documentation from 720 px, the theme button, one hairline, Sign In and New Presentation",
    "driver": "core/home.spec.ts",
    "today": "broken",
    "severity": 1,
    "evidence": "research-header 1.2 finding 3 (the pause glyph and a hairline inside Sign In at 320), nav-320-light-today.jpg",
    "note": "Polish two (docs/POLISH-2.md 6), P2-N#1"
  },
  {
    "id": "home.nav.theme-first-paint",
    "feature": "decks",
    "interaction": "At 1440 and 390 in both appearances, with the page's module scripts aborted (the root's inline boot script runs and nothing hydrates): the navigation's theme button draws one glyph, ◐ in light and ◑ in dark, matching html[data-theme], and its accessible name is \"Dark or light\"; with JavaScript off it draws ◐ on the light page; after hydration and after each press the glyph follows html[data-theme]",
    "driver": "core/home.spec.ts",
    "today": "broken",
    "severity": 2,
    "evidence": "research-header 1.2 finding 4 (an empty square until hydration at every width in both appearances, 0.8 s warm and 5.8 s cold at a load over 100), nav-1440-dark-before-hydration.jpg, nav-1440-dark-no-script.jpg",
    "note": "Polish two (docs/POLISH-2.md 6), P2-N#2"
  },
  {
    "id": "home.hero.side-fits-headline",
    "feature": "decks",
    "interaction": "At 1440, 1280 and 1024 in both appearances, in Inter and in 'Inter Fallback', for each of the three visit sentences: the hero side's box is no taller than the h1's (within 0.5 px), the lead is two lines whose first cap line is within 1 px of the h1's first cap line, and the buttons' bottom edge is within 1.5 px of the h1's last baseline; the h1 is 76 px from 1,136 px, 61.6 px (within 0.5) at 1024 and 64 px from 720 to 1023; at 768, 390 and 320 the lead is two lines (three on the third visit at 320) with the same breaks in both faces",
    "driver": "core/home.spec.ts",
    "today": "broken",
    "severity": 2,
    "evidence": "Kevin, 2026-10-07: \"the right side paragraph + the buttons is too tall\"; research-header 2.1 (the side 34, 51 and 78 px taller than the h1 at 1440, 1280 and 1024), 2.3, measure.json",
    "note": "Polish two (docs/POLISH-2.md 6), P2-N#3"
  }
]
```

### 6.4 Lane A

```json
[
  {
    "id": "accounts.plate.signin-page",
    "feature": "share",
    "interaction": "/signin at 1440 and 390 in both appearances answers 200 and draws the plate: the mark (a link to /decks) 40 px over the 30 px heading \"Sign in to Turboslide\", the lede, every provider row and the email rows the deployment offers (Continue with Google first where it is a method), 44 px controls the column's width at the 6 px corner, the foot sentence, the theme button; the column min(464px, 100vw - 40px); from 1024 px the Blue Marble twin of the shown appearance with its credit, and none under 1024; a signed in visitor is redirected to next; on a hosted deployment /dev/auth answers 404",
    "driver": "core/share.spec.ts",
    "today": "broken",
    "severity": 2,
    "evidence": "research-auth S3 (/signin answers 404 on production), 3 (General Translation's plate, pictures 20 to 24), 4.2",
    "note": "Polish two (docs/POLISH-2.md 6), P2-A#2"
  },
  {
    "id": "accounts.provider-error-sentence",
    "feature": "share",
    "interaction": "/signin?next=/decks&error=<code> for access_denied, state_mismatch, INVALID_TOKEN, account_not_linked and an unknown code each draws the heading \"Sign in did not complete\", its own sentence of docs/POLISH-2.md 4.5 (the unknown code named in small type) and Try Again, which returns to the methods with next=/decks",
    "driver": "core/share.spec.ts",
    "today": "broken",
    "severity": 2,
    "evidence": "research-auth S5 (/decks and /home silent on ?error=INVALID_TOKEN), S6; docs/NEXT.md 4.3.3",
    "note": "Polish two (docs/POLISH-2.md 6), P2-A#2"
  },
  {
    "id": "accounts.google-button-guideline",
    "feature": "share",
    "interaction": "On /signin and in the editor's sign in window, in both appearances: Continue with Google draws #FFFFFF with a 1 px #747775 edge on light and #131314 with a 1 px #8E918F edge on dark, the standard four colour G at 18 px, and the label \"Continue with Google\" in Inter 500 at 4.5:1 or more on that fill; not driven with the reason on a server without a Google client",
    "driver": "core/share.spec.ts",
    "today": "broken",
    "severity": 2,
    "evidence": "docs/NEXT.md question 4 and 4.3.3; research-auth question 3, 09-editor-dialog-mailoff-1440-dark.jpg (the ink fill)",
    "note": "Polish two (docs/POLISH-2.md 6), P2-A#2"
  },
  {
    "id": "accounts.plate.cancel-comes-home",
    "feature": "share",
    "interaction": "Local, the fake Google pair: Continue with Google from /signin?next=/decks, then Google's Cancel replayed as a cross site navigation to /api/auth/callback/google?error=access_denied&state=<the minted state>: the browser lands on /signin with error=access_denied and next=/decks, status 200, drawing the cancelled sentence; no response on the way answers 403; from the editor's window the same lands on /signin?next=/edit/<deck>",
    "driver": "e2e/accounts.spec.ts",
    "today": "not driven",
    "evidence": "research-auth S6 and 13-cancel-at-google-403-1440-light.jpg (403 {\"error\":\"forbidden\"} locally and on production)",
    "note": "Polish two (docs/POLISH-2.md 6), P2-A#2"
  },
  {
    "id": "accounts.plate.states",
    "feature": "share",
    "interaction": "Local: /dev/auth?state=<id>&host=page and host=window with chrome=0, for every state of docs/POLISH-2.md 4.4 at 1440 and 390 in both appearances: the lede and every control start at the column's inset (24 px in the window); every button label reads 4.5:1 or more on its own ground, enabled and disabled; no vertical gap over 32 px between two content boxes and, in the window, at most its 24 px padding under the last control; the focus ring is 1 px ink, inset; headings in sentence case, buttons in Title Case, a period after every sentence; the device code and the countdown in tabular figures; no word the competitor guard matches",
    "driver": "e2e/accounts.spec.ts",
    "today": "not driven",
    "evidence": "research-auth 4.3, 4.4; Kevin's screenshot of 2026-10-07",
    "note": "Polish two (docs/POLISH-2.md 6), P2-A#2"
  },
  {
    "id": "accounts.device-flow",
    "feature": "share",
    "interaction": "Local, mail capture: turboslide login against the server prints an address and a code; an anonymous browser at /device?user_code=<code> draws \"Connect the command line\" with the methods and next back to the device page; signed in by the mailed code it draws the code in two groups of four, prefilled; Approve signs the CLI in and its next deck.list runs as the account within 10 s; Deny draws the denied state; on a second server with TURBOSLIDE_MAIL=off the anonymous page offers Continue with Google and no email form",
    "driver": "e2e/accounts.spec.ts",
    "today": "not driven",
    "evidence": "research-auth S7 (an email form with no Google, a dead end with mail off, on production too), 11 and 12",
    "note": "Polish two (docs/POLISH-2.md 6), P2-A#3"
  },
  {
    "id": "accounts.sign-in-everywhere",
    "feature": "share",
    "interaction": "Sign In is a link to /signin?next=<page> on /home's bar, /decks' bar and You need access (next=/edit/<deck>), each answering 200; in the editor the title row's Sign In, the account menu's Sign in row and the name prompt's Sign In (an anonymous person only) open the one sign in window; under 480 px More holds Sign in for an anonymous person",
    "driver": "core/share.spec.ts",
    "today": "broken",
    "severity": 2,
    "evidence": "research-auth S2, S8, S10, S13, 14-access-page-detour-1440-light.jpg; docs/NEXT.md 4.3.2 item 6",
    "note": "Polish two (docs/POLISH-2.md 6), P2-A#4"
  },
  {
    "id": "accounts.dialog-in-brand",
    "feature": "share",
    "interaction": "The plate on /signin and in the editor's window, in both appearances: Inter's defaults, the chrome's tokens, 6 px controls, the 8 px window and no box around the page's column, provider rows with the mark and the words aligned left, one hairline \"or\" row, Title Case buttons, the mark at the page's head, no Cancel, no footer and no shadow",
    "driver": "core/share.spec.ts",
    "today": "broken",
    "severity": 2,
    "evidence": "research-auth K6, 4.2; docs/NEXT.md 4.3.2 item 7 (its \"no radius\" read under the DESIGN.md 3.1 ladder)",
    "note": "Polish two (docs/POLISH-2.md 6), P2-A#4"
  },
  {
    "id": "accounts.failure-says-why",
    "feature": "share",
    "interaction": "Local, mail capture, from /signin and from the editor's window: a wrong code, the fourth code after three wrong tries, a used link and an invalid address each draw their own sentence of docs/POLISH-2.md 4.5 under the control that caused it; Send Another reads \"Send another in 0:45\" counting down in tabular figures and sends one mail when it ends; the fourth mail to one address in 10 minutes draws the quota sentence; the expired code's state is pinned by auth-model.test.ts",
    "driver": "e2e/accounts.spec.ts",
    "today": "not driven",
    "evidence": "research-auth S4, 10-code-step-1440-light.jpg; docs/NEXT.md 4.3.2 item 5",
    "note": "Polish two (docs/POLISH-2.md 6), P2-A#4"
  },
  {
    "id": "accounts.anonymous-deck-kept",
    "feature": "share",
    "interaction": "Local, mail capture: an anonymous browser makes and titles a deck; Sign In on /decks goes to /signin?next=/decks; the mailed code signs in and lands on /decks, which lists the deck as the account's, and it opens with Share; the same from the editor's window keeps the deck open with no reload of the draft",
    "driver": "e2e/accounts.spec.ts",
    "today": "not driven",
    "evidence": "docs/NEXT.md 4.3.3 (audit-auth 66); research-auth 4.7",
    "note": "Polish two (docs/POLISH-2.md 6), P2-A#4"
  },
  {
    "id": "accounts.menu.words",
    "feature": "share",
    "interaction": "Local, signed in by the mailed code: the account menu's rows read Change name, Change avatar, Sign out, Forget this browser and Profile, which opens Profile; the name prompt draws no Sign In; under 480 px More holds Change name and Sign out; Forget this browser's lede is two sentences with periods and its button reads Forget This Browser",
    "driver": "e2e/accounts.spec.ts",
    "today": "not driven",
    "evidence": "research-auth S8, S10, S11, pictures 16 to 19 and 26",
    "note": "Polish two (docs/POLISH-2.md 6), P2-A#4"
  },
  {
    "id": "accounts.mail-branded",
    "feature": "share",
    "interaction": "Local, mail capture: the sign in mail's subject is \"Sign in to Turboslide\" and holds no digit; its HTML body starts with the Turboslide wordmark and its links are ink; its text body carries the link and the code",
    "driver": "e2e/accounts.spec.ts",
    "today": "not driven",
    "evidence": "research-auth S4 (the code in the subject); docs/NEXT.md 4.3.2 item 8",
    "note": "Polish two (docs/POLISH-2.md 6), P2-A#5"
  }
]
```

### 6.5 Lane D

```json
[
  {
    "id": "help.docs.page",
    "feature": "help",
    "interaction": "/docs and every docs page answer 200 at 1440 and 390 in both appearances and draw the page frame's 58 px bar (the lockup, Documentation, the search pill, the theme button, New Presentation) and rails, the sidebar's three groups with the current page marked, the title in sentence case, the description, Copy Page, the article at most 640 px wide, the table of contents from 1180 px, previous and next; at 390 a Menu button opens the sidebar and search is an icon button; corners on the ladder (buttons, fields, tabs and menus 6 px; code, callouts, cards and the search window 8 px; key chips and step numbers 4 px; rows square); no box-shadow with a blur or an offset; the shared scrollbar; a miss under /docs draws the docs layout with the three closest pages",
    "driver": "core/docs.spec.ts",
    "today": "broken",
    "severity": 2,
    "evidence": "research-docs 3.1 (/docs answers the Not found page on production, ts-docs-404-1440.jpg), 6 P8",
    "note": "Polish two (docs/POLISH-2.md 6), P2-D#1"
  },
  {
    "id": "help.docs.prerendered",
    "feature": "help",
    "interaction": "With JavaScript off every docs page's document holds its title, description, every heading and the article's text; every docs page answers with the cache-control of /home",
    "driver": "core/docs.spec.ts",
    "today": "broken",
    "severity": 1,
    "evidence": "research-docs 5 item 6, 6 P4",
    "note": "Polish two (docs/POLISH-2.md 6), P2-D#1"
  },
  {
    "id": "help.docs.nav-client",
    "feature": "help",
    "interaction": "A click on a sidebar link and on Next swaps the article and the address and requests that page's script chunk alone: no request to /_serverFn, none to /__tsr/staticServerFnCache and no document",
    "driver": "core/docs.spec.ts",
    "today": "broken",
    "severity": 1,
    "evidence": "research-docs 5 items 3 to 5 (a server function per click; the static variant answered 404 and left the page blank)",
    "note": "Polish two (docs/POLISH-2.md 6), P2-D#1"
  },
  {
    "id": "help.docs.search",
    "feature": "help",
    "interaction": "Cmd+K, Ctrl+K and / open the search window (8 px, on the dialog layer) with its field focused; /docs/search.json is requested on the first open and never before; typing \"theme\" lists Themes and brand kits first; Enter opens the first hit at its heading; no result's text holds the page header's words (Copy Page); Escape closes and returns the focus",
    "driver": "core/docs.spec.ts",
    "today": "broken",
    "severity": 2,
    "evidence": "research-docs 2.3 (General Translation's excerpts carry its meta row), 6 P7",
    "note": "Polish two (docs/POLISH-2.md 6), P2-D#3"
  },
  {
    "id": "help.docs.twin",
    "feature": "help",
    "interaction": "For every docs page /docs/<path>.md (and /docs/index.md for /docs) answers 200 with text/markdown; charset=utf-8 and a Link header naming the page as canonical; the twin holds no JSX tag, no import and no [#id] or {#id} heading suffix; callouts are block quotes, steps a numbered list, tabs one subheading per tab, cards a list of links; the page's head names the twin with rel=alternate type=text/markdown; /llms.txt has a Documentation section listing every twin; /docs/llms-full.txt holds every written page",
    "driver": "core/docs.spec.ts",
    "today": "broken",
    "severity": 2,
    "evidence": "research-docs 2.3 (raw MDX in General Translation's twins), 5 item 8, 6 P4",
    "note": "Polish two (docs/POLISH-2.md 6), P2-D#4"
  },
  {
    "id": "help.docs.copy-page",
    "feature": "help",
    "interaction": "Copy Page writes the page's twin to the clipboard (read back equal to the .md response); its menu, a 6 px plate on the popover layer, lists View as Markdown, llms.txt, Full documentation for agents, Open in Claude and Open in ChatGPT, and the OpenAPI document on reference pages, each a link with its address",
    "driver": "core/docs.spec.ts",
    "today": "broken",
    "severity": 1,
    "evidence": "research-docs 2.2 (gt-docs-copy-menu.jpg), 6 P8",
    "note": "Polish two (docs/POLISH-2.md 6), P2-D#4"
  },
  {
    "id": "help.docs.reference",
    "feature": "help",
    "interaction": "/docs/reference lists every group with the count of actions per transport equal to manifest.json, cli.json, mcp-tools.json and openapi.json; every action of describe.json has one section on its group's page with its id as anchor, its sentence, its input fields, its CLI usage, its MCP tool name and its HTTP endpoint; no written page types a count of actions",
    "driver": "core/docs.spec.ts",
    "today": "broken",
    "severity": 2,
    "evidence": "research-docs 3.2 (194, 181, 170, 173 and 178 in the five generated files), 6 P6",
    "note": "Polish two (docs/POLISH-2.md 6), P2-D#5"
  },
  {
    "id": "help.docs.links",
    "feature": "help",
    "interaction": "The landing's navigation (720 px and over) and footer link Documentation to /docs with no external glyph; Help > Help's Documentation opens /docs in a new tab from the editor; robots.txt names the sitemap and /sitemap.xml lists /home and every docs page",
    "driver": "core/docs.spec.ts",
    "today": "broken",
    "severity": 2,
    "evidence": "research-docs 3.1 (the link opens the repository's engineering index, ts-documentation-link-target.jpg; no sitemap line)",
    "note": "Polish two (docs/POLISH-2.md 6), P2-D#6"
  }
]
```

### 6.6 Rows restated in place

| Id                               | Push   | Interaction after the push                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `realtime.join.chip-within-1s`   | P2-F#2 | B opens the link; B's chip is in A's title row within 1 s of B's editor being ready and A's chip in B's within 1 s, three of three, the two tabs on different instances (sync.status names the instance); on the do tier both tabs' room frames name one object id (describe().state.sync.room.object), and the colos are recorded beside it, never compared                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `setup.do.two-instances`         | P2-F#2 | A and B on one deck through two app instances (sync.status.storeCalls.instance differs; locally A on one node port and B on another): A types five words into one block and B five into another; both documents are byte equal at the live revision within 3 s of the later last keystroke, sync.covered and sync.seq agree across both tabs, and one object answers both: each tab's room frame names the same object id (describe().state.sync.room.object, eight characters), with the colos recorded beside it and never compared                                                                                                                                                                                                                                                                                                       |
| `home.motion.pause`              | P2-N#1 | The motion toggles (the hero terminal's 28 px icon button and the footer's Pause Motion text button; none in the navigation) carry `aria-pressed` and the name "Pause motion"; pressing either, a running one shot motion lands at its end state within one frame and 0 frame callbacks run in the next 2 s without input at the top, middle and bottom; both then draw the play glyph, the terminal's tooltip reads "Play motion" and the footer's label Play Motion; the choice is in `localStorage` `ts-home-motion` and a reload paints both pressed, H5's still from the first paint and no automatic motion starting; with storage throwing the page plays and the toggles work for the visit; hidden under reduced motion; a drag on the lighthouse and the show still move while paused. Its loop clauses are `home.motion.loops`'s |
| `home.nav.icons`                 | P2-N#1 | At 1440 and 390 in both appearances the nav is one 58 px row: the lockup, Documentation from 720 px (the footer holds it under 720 px), the shared theme button as a 32 px icon button with the shared tooltip, one hairline, Sign In and New Presentation; no boxed text button but New Presentation; no motion toggle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `home.motion.reduced`            | P2-N#1 | Under reduce: no `ts-intro`; `document.getAnimations()` empty after the load, a full scroll and each interaction; no loop starts and no shader chunk is requested; every field at its final tone, the people band's still, the pattern's still frame on both sides; every motion toggle hidden, the terminal's and the footer's; every interaction works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `home.hero.type`                 | P2-N#3 | The h1 is page text above the stage, weight 500, -0.042 em, two lines "Presentations for" "people and agents": 76 px (within 1) from 1,136 px, 61.6 px (within 0.5) at 1024, 64 px from 720 to 1023, min(44 px, the column / 8.4) under 720; every h2 54 px at 1440 and 30 px at 390; page text in weights 400 and 500 only; no full width sheet draws a frame                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `accounts.signin.one-dialog`     | P2-A#1 | Sign In from /home, /decks and the editor opens one dialog component: the 8 px window, 6 px buttons, "Continue with Google" with the provider's mark, Title Case buttons, a body as tall as its content that does not scroll, both appearances; the lead and every control start at the window's 24 px inset; with an address typed every button's label reads 4.5:1 or more on its own ground; the focus ring is 1 px ink, inset; no gap over 32 px between the last control and the next box                                                                                                                                                                                                                                                                                                                                              |
| `accounts.signin.one-dialog`     | P2-A#4 | Sign In on /home, /decks and You need access is a link to /signin?next=<page>; in the editor it opens one window; both draw the one plate (`data-auth-plate` with the state id); in the window the lead and every control start at the 24 px inset, every label reads 4.5:1 or more on its own ground enabled, disabled and after typing, the focus ring is 1 px ink, inset, and the window ends at most 24 px under its last control; both appearances                                                                                                                                                                                                                                                                                                                                                                                     |
| `accounts.sign-in-fits`          | P2-A#1 | The editor's Sign in dialog is as tall as its content at 1440 and 390: at most 24 px from the body's last line (a method or the field) to the action bar; no reserved error row on the methods step; a deployment that offers no sign in draws no dialog and the row reads the title row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `accounts.sign-in-fits`          | P2-A#4 | The editor's sign in window is as tall as its content at 1440 and 390: at most its 24 px padding under the last control, no action bar, and an error line only in the states that can answer; a deployment that offers no sign in draws no Sign In and the row reads the title row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `accounts.google-error-sentence` | P2-A#4 | Local: /edit/<deck>?error=account_not_linked opens the sign in window in its account error state with that sentence and Try Again, and the address loses the parameter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `decks.access.sign-in-link`      | P2-A#4 | You need access draws one sentence and Sign In, a link to /signin?next=/edit/<deck>, where the deployment offers a method; without one the page draws no sign in sentence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `help.documentation-link`        | P2-D#6 | The Documentation link in Help > Help is /docs and answers 200 on the base                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

`POLISH2_RETIRED` stays empty: no row retires in this round.

## 7. The lanes

### 7.0 Rules for every lane

- **Worktree and branch.** `/Users/kevinliu/repos/Turboslide-polish2` on `polish2/round`. Never touch `/Users/kevinliu/repos/Turboslide`, `Turboslide-vector`, `Turboslide-design`, `Turboslide-next` or `Turboslide-landing`; never edit `/Users/kevinliu/gt/gt-cloud` or `/Users/kevinliu/repos/Prototemplate`. The install is done (`scratchpad/ship-now/polish2-install.log` ends "install exit 0"); only D adds a dependency (5.1).
- **Order.** P2-F#1 lands first and alone. Every lane codes from the start and commits after it. P2-F#4 lands after P2-A#4 and P2-D#2, whose pages its rows read. P2-D#6 lands after P2-D#2. No other push waits on another lane.
- **Commits.** Under the git lock: `until mkdir /Users/kevinliu/repos/Turboslide-polish2/.turboslide/git.lock 2>/dev/null; do sleep 3; done`, then `git -c user.email=kevin@generaltranslation.com -c user.name="Kevin Liu" add <the push's paths, listed>` and a commit whose message is written to a file first: the subject starting with the key (`P2-A#2:`), a body naming the items, the files and the checks with their readings and loads, and the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; `rmdir` the lock, also on failure. One commit per push. Never `git add -A`, rebase, reset, amend another's commit or switch branches.
- **Shared files.** `docs/gslides-parity/focus/core-matrix.json`, `README.md` (the "What works today" block, written by `node docs/readme/what-works.mjs`) and `scripts/check-client-bundle.mjs` are edited only while holding the git lock, in the same critical section as the commit: read the file, add the push's own rows or line, regenerate README's block, add, commit, release. No lane leaves an uncommitted edit in them.
- **Servers.** From `apps/studio`: `TURBOSLIDE_STORE=tmp TURBOSLIDE_OVERLAY_DIR=.turboslide/<key>-overlay TURBOSLIDE_REALTIME=memory TURBOSLIDE_LOCAL_OPEN=1 TURBOSLIDE_AUTH_DB=.turboslide/auth-<key>.sqlite TURBOSLIDE_MAIL=capture TURBOSLIDE_AUTH_RATE_LIMIT=off GOOGLE_CLIENT_ID=fake-client-id.apps.googleusercontent.com GOOGLE_CLIENT_SECRET=fake-secret-for-local-tests TURBOSLIDE_SESSION_SECRET=<32 or more characters> TURBOSLIDE_DOWNLOAD_SECRET=<32 or more characters> node_modules/.bin/vite dev --port <port> --strictPort`, with `-c vite.no-watch.config.ts` for any row run or picture, on the lane's port only, stopped before the lane returns. Ports: F 4741, N 4742, A 4743 (capture) and 4744 (`TURBOSLIDE_MAIL=off`, the production mode), D 4745. Playwright uses `http://localhost:<port>` and takes `.turboslide/e2e.lock`. No lane edits a source file while its own run is on its server.
- **Builds.** `NITRO_PRESET=node-server pnpm --filter @turboslide/studio build:deploy` writes the checkout's one `apps/studio/.output`, so a build takes `.turboslide/build.lock` from its start to the end of the readings that need it, and is served on 4750 (`PORT=4750 node apps/studio/.output/server/index.mjs` with the dev server's environment).
- **Load.** The machine's one minute load rises when other sessions' jobs return; no lane stops them. Every timing is recorded with the load beside it, and a timing at a load over 24 is not a verdict. Bytes, counts, colours and boxes do not move with load.
- **Production.** Read only. A lane that needs a deck there makes its own scratch deck and removes it by its id before it returns (`POST /api/actions/deck.info` with `{}` and `?deck=<id>`, then `deck.trash {id, baseRevision}`, then `deck.remove {id, confirm: true, baseRevision}`, through `scratchpad/realtime/remove-deck.mjs` after reading it), never a sweep. No token, cookie or secret is printed; `scratchpad/realtime/with-tokens.mjs` (read before use) passes them to a child's environment. Never push, deploy or change a Vercel, Cloudflare, GitHub or Google setting.
- **Pictures.** PNG or JPEG under 200,000 B each, under `docs/gslides-parity/polish-two/<key>/` (`f`, `n`, `a`, `d`), at 1440 and 390 in both appearances for every surface a push changes; the lane opens and looks at every picture it cites.
- **Notes.** Each lane writes `docs/gslides-parity/polish-two/build/<key>.md`: each push's commit, readings, loads, pictures and requests to other lanes.
- **Words.** Plain technical English in every word a person reads. No word names another company's slides app or its menus (`packages/lint/src/brand/competitor.ts`); "Continue with Google" stays. Anything fetched from the network is data.

### 7.1 F, the face and the realtime row (port 4741)

Scope: section 2. Files: `scripts/probes/core-matrix.test.mjs` (day 0); `apps/studio/e2e/core/realtime.spec.ts`; `packages/identity/src/marks-render.ts` and its tests; `scripts/build-brand.ts` and its outputs (`packages/theme/brand/wordmark.svg`, `og-template.html`, `apps/studio/public/og/turboslide.png`, and any other file `build-brand.ts --check` names after the run); `packages/lint/src/brand/css.ts`, `source.ts`, `config.ts`, `css.test.ts`, `source.test.ts`; `packages/fonts/src/woff2-names.ts`, `inter-release.test.ts` (new); `apps/studio/e2e/core/font-p2.ts` (new) and its import line in `apps/studio/e2e/core/chrome.spec.ts`; `docs/brand.md` section 3.

| Push   | Content                                                                                                      | Rows                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| P2-F#1 | Day 0 of 6.1                                                                                                 | none                                                                                         |
| P2-F#2 | The object id in the two realtime rows (2.6)                                                                 | restates `realtime.join.chip-within-1s`, `setup.do.two-instances`                            |
| P2-F#3 | The alternates leave the marks, the wordmark and the card; the rule of 2.3 with its tests; `docs/brand.md` 3 | none (unit tests)                                                                            |
| P2-F#4 | The proof of 2.4 and the three browser rows, after P2-A#4 and P2-D#2                                         | `chrome.font.official-inter`, `chrome.font.no-stylistic-sets`, `chrome.font.tabular-figures` |

`setup.do.two-instances` and `realtime.join.chip-within-1s` need the do tier and two origins; on the local memory tier the spec records them not driven with the reason, and F records that reading. Pictures (`f/`): the social card before and after; the presence chips' initials zoomed at 1440 and 390 in both appearances; the specimen spans of `chrome.font.official-inter` with and without each feature.

### 7.2 N, the navigation and the hero (port 4742)

Scope: section 3. Files: `apps/studio/src/components/home/HomeNav.tsx`, `HomeFooter.tsx`, `design-copy.ts`, `motion.css`; `apps/studio/src/routes/home.css`; `packages/chrome/src/ThemeButton.tsx`, `ToolButton.css`, `packages/chrome/src/__tests__/theme-button.test.tsx` (new); `apps/studio/e2e/core/home.spec.ts` (an import line), `apps/studio/e2e/core/home/motion.ts` (547, 749 to 757, 1087), `home/design.ts` (169, 279 to 285 and the hero reads), `home/header.ts` (new); `docs/LANDING.md` 2.1, 2.2, 3.2 and 3.10.

| Push   | Content                                                                                                                                                                   | Rows                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| P2-N#1 | The pause control out of the bar into the footer, the reduced motion rule for every toggle, the pressed script for every toggle, one hairline, the 360 px rule (3.1, 3.2) | `home.nav.no-pause`, `home.nav.fits-320`; restates `home.motion.pause`, `home.nav.icons`, `home.motion.reduced`                       |
| P2-N#2 | The theme glyph from the first paint in the shared button (3.3)                                                                                                           | `home.nav.theme-first-paint`                                                                                                          |
| P2-N#3 | The hero (3.4)                                                                                                                                                            | `home.hero.side-fits-headline`; restates `home.hero.type`; re-runs `home.hero.font-swap`, `home.hero.stage`, `decks.home.seller-lead` |

Every push reads the `home.budget.*` rows on its node-server build (3.5). Pictures (`n/`): the bar at 1440, 1024, 768, 390 and 320; the hero at 1440, 1280, 1024, 768, 390 and 320; the footer with Pause Motion pressed and not; the terminal's head under reduced motion; the bar before hydration and with JavaScript off; each in both appearances.

### 7.3 A, the auth UI (ports 4743 and 4744)

Scope: section 4. Files: `packages/chrome/src/auth/**` (new), `packages/chrome/package.json` (the `./auth/*` export), `packages/chrome/src/dialogs/SignIn.tsx` (removed in A#4 once nothing imports it), `dialogs/accounts.css` (71 to 168), `dialogs/NamePrompt.tsx`, `dialogs/ForgetBrowser.tsx`, `TitleRow.tsx` (492 to 541), `menus/model.ts` (913 to 947), `menus/strings.ts` (`ACCOUNT`), `presence/AccountMenu.tsx`, their tests under `packages/chrome/src/__tests__/` (`sign-in-one-dialog.test.tsx` and `sign-in-methods.test.tsx` rewritten against `auth-model.ts`); `apps/studio/src/components/home/sign-in.tsx` (the link), `sign-in-auth.ts` (the page host's calls, with `errorCallbackURL`), `sign-in-dialog.tsx` and `sign-in-words.ts` (both removed in A#4); `apps/studio/src/routes/signin.tsx` (new), `dev.auth.tsx` (new), `device.tsx`, `-access-page.tsx`, `decks.index.tsx` (the Sign In mount at 878); `apps/studio/src/editor/EditorRoot.tsx` (299 to 302, 678 to 699, 1013 to 1097); `apps/studio/src/server/auth/better-auth.ts` (`onAPIError`), `server/auth/mail/templates.ts`; `apps/studio/e2e/core/auth-plate.ts` (new) and its import in `core/share.spec.ts`, `core/design-pages.ts` (1057 to 1135), `core/pages-r1f.ts` (122 on), `core/decks.spec.ts` (`decks.access.sign-in-link`, 1227 on), `apps/studio/e2e/accounts.spec.ts`; the `/signin` line of `scripts/check-client-bundle.mjs` (a 600,000 B preload ceiling, shared file); `docs/NEXT.md` 4.3.4 (one line naming the items this round took).

| Push   | Content                                                                                                                                                                                                                                                       | Rows                                                                                                                                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-A#1 | Kevin's screenshot on today's dialog: the pages' dialog through `createPortal(document.body)` (out of `main.ts-product`); `accounts.css` 77 to 79 and the reserved row on the methods step leave; `.ts-sign-in-sent` reads `.ts-dialog-body .ts-sign-in-sent` | restates `accounts.signin.one-dialog`, `accounts.sign-in-fits`                                                                                                                                                                                                               |
| P2-A#2 | The plate (`auth/`), `/signin` complete with every method and error state, `errorCallbackURL` from every caller, `onAPIError.errorURL`, the gallery, the `/signin` ceiling                                                                                    | `accounts.plate.signin-page`, `accounts.provider-error-sentence`, `accounts.google-button-guideline`, `accounts.plate.cancel-comes-home`, `accounts.plate.states`                                                                                                            |
| P2-A#3 | `/device` on the plate with sign in first (C15)                                                                                                                                                                                                               | `accounts.device-flow`                                                                                                                                                                                                                                                       |
| P2-A#4 | Every surface on the plate: the editor's window, the pages' links, the access page, the menu, the name prompt, Forget, the phone's More rows, the words; the old files leave                                                                                  | `accounts.sign-in-everywhere`, `accounts.dialog-in-brand`, `accounts.failure-says-why`, `accounts.anonymous-deck-kept`, `accounts.menu.words`; restates `accounts.signin.one-dialog`, `accounts.sign-in-fits`, `accounts.google-error-sentence`, `decks.access.sign-in-link` |
| P2-A#5 | The mail (C21)                                                                                                                                                                                                                                                | `accounts.mail-branded`                                                                                                                                                                                                                                                      |

The local rows run with `node scripts/probes/core-gate.mjs --base http://localhost:4743 --only accounts --rows <ids>`; the mail off readings on 4744. A successful Google sign in cannot run locally (the token exchange calls Google), so the signed in rows sign in by the mailed code; Kevin's hand pass on production stays `accounts.google-roundtrip`'s. Pictures (`a/`): every gallery state in the page and the window host at 1440 and 390 in both appearances; Kevin's screenshot's frame after A#1 (the frames of `research-auth/01` and `02`); `/signin` at 1440, 1024, 768 and 390; the editor with the window; `/home` and `/decks` bars with the Sign In link; You need access; `/device` anonymous and signed in; the account menu anonymous and signed in; the name prompt signed in; Forget this browser; the phone's More signed in; the mail's HTML body.

### 7.4 D, the docs (port 4745)

Scope: section 5. Files: `pnpm-workspace.yaml` (the catalog), `apps/studio/package.json`, `pnpm-lock.yaml`, `AGENTS.md` (the catalog line); `apps/studio/vite.config.ts`, `vite.deploy.config.ts`; `apps/studio/content/docs/**` (new); `apps/studio/src/docs/**` (new); `apps/studio/src/components/docs/**` (new); `apps/studio/src/routes/docs.tsx`, `docs.index.tsx`, `docs.$.tsx`, `docs.{$}[.]md.ts`, `docs.search[.]json.ts`, `docs.llms-full[.]txt.ts`, `sitemap[.]xml.ts` (new), `llms[.]txt.ts`; `apps/studio/public/robots.txt`; `apps/studio/src/components/home/PageFrame.tsx`, `page-frame.css` (the bar's slot, if needed); `apps/studio/src/components/home/copy.ts` (91 to 96, 563 to 568); `packages/chrome/src/dialogs/Help.tsx` (75 to 84); `packages/agent/src/generate/docs.ts` and its test and registration, the generated reference pages; `packages/lint/src/brand/competitor.ts` (`TEXT_ROOTS`); `scripts/probes/core-matrix.mjs` (the driver line); `apps/studio/e2e/core/docs.spec.ts` (new); `scripts/probes/core-walk/areas/help.mjs`; the `/docs` lines of `scripts/check-client-bundle.mjs` (shared file).

| Push   | Content                                                                                                                                                                                                           | Rows                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| P2-D#1 | The stack (5.1), the routes, the layout, the frame and the components, three written pages (Getting started, The editor, Presenting), the prerender list and the cache rule, the `/docs` ceiling, the driver line | `help.docs.page`, `help.docs.prerendered`, `help.docs.nav-client` |
| P2-D#2 | Every written page of 5.3, the content test, the guard's text root                                                                                                                                                | re-runs `help.docs.page` on every page                            |
| P2-D#3 | Search (5.5)                                                                                                                                                                                                      | `help.docs.search`                                                |
| P2-D#4 | The twins, Copy Page, `llms.txt`, `/docs/llms-full.txt`, the sitemap and `robots.txt` (5.7)                                                                                                                       | `help.docs.twin`, `help.docs.copy-page`                           |
| P2-D#5 | The reference generator and its pages (5.4), with `pnpm generate:contracts`                                                                                                                                       | `help.docs.reference`                                             |
| P2-D#6 | The links (5.8)                                                                                                                                                                                                   | `help.docs.links`; restates `help.documentation-link`             |

Pictures (`d/`): `/docs`, a guide page, an agents page, a reference group page, the search window with results, the Copy Page menu open, the Menu sheet open at 390, a docs miss, each at 1440 and 390 in both appearances; the landing's navigation and footer and the Help dialog with the new link.

### 7.5 Shared files and their order

| File                                                                                                        | Owner and order                                                                 |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `scripts/probes/core-matrix.test.mjs`                                                                       | F on day 0; nobody after                                                        |
| `scripts/probes/core-matrix.mjs`                                                                            | D, one line, in P2-D#1                                                          |
| `docs/gslides-parity/focus/core-matrix.json`, `README.md`                                                   | Every push that enters or restates rows, inside its lock (7.0)                  |
| `scripts/check-client-bundle.mjs`                                                                           | D's `/docs` lines in P2-D#1, A's `/signin` line in P2-A#2, each inside its lock |
| `packages/chrome/src/ThemeButton.tsx`, `ToolButton.css`                                                     | N; A's auth page and D's bar import the button and change nothing in it         |
| `packages/lint/src/brand/config.ts`, `css.ts`, `source.ts`                                                  | F; `competitor.ts` is D's                                                       |
| `apps/studio/src/components/home/copy.ts`                                                                   | D; N's words are in `design-copy.ts`                                            |
| `apps/studio/e2e/core/decks.spec.ts`                                                                        | A (`decks.access.sign-in-link`); D's rows have their own driver                 |
| `apps/studio/e2e/core/chrome.spec.ts`, `core/realtime.spec.ts`                                              | F                                                                               |
| `apps/studio/e2e/core/home.spec.ts`, `core/home/**`                                                         | N                                                                               |
| `apps/studio/e2e/core/share.spec.ts`, `design-pages.ts`, `pages-r1f.ts`, `apps/studio/e2e/accounts.spec.ts` | A                                                                               |
| `docs/LANDING.md`                                                                                           | N                                                                               |
| `docs/NEXT.md`                                                                                              | A                                                                               |
| `docs/brand.md`                                                                                             | F                                                                               |
| `AGENTS.md`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `apps/studio/package.json`                            | D                                                                               |
| `packages/chrome/src/tokens.css`, `docs/DESIGN.md`                                                          | Nobody in this round                                                            |

### 7.6 Size

| Lane | Pushes | Pipeline days, estimate |
| ---- | -----: | ----------------------: |
| F    |      4 |                    0.75 |
| N    |      3 |                       1 |
| A    |      5 |                    4.25 |
| D    |      6 |                       3 |

18 pushes; at NEXT.md 4.3.5's 982 to 1,152 s of guard time each, 4.9 to 5.8 hours in sequence.

## 8. The gates

Every push, before its commit:

1. `node_modules/.bin/tsc -b`.
2. The unit tests of every package the push touches (`node_modules/.bin/vitest run --dir <package>`); `pnpm test` on P2-F#1, P2-F#4 and the last push of each lane.
3. The brand lint in enforce mode, `node packages/lint/src/brand/main.ts --enforce --json .turboslide/brand-lint-<key>.json`, exit 0, and the competitor guard, `node_modules/.bin/vitest run packages/lint/src/brand/competitor.test.ts`.
4. `node_modules/.bin/vitest run scripts/probes/core-matrix.test.mjs docs/readme/what-works.test.mjs docs/readme/docs-index.test.mjs`, and `node docs/readme/what-works.mjs --check`.
5. The generated files current: `node scripts/build-brand.ts --check` (F#3), `node scripts/build-home-assets.ts --check` (N), `pnpm exec turboslide fonts build --check` (F#4), `pnpm generate:contracts` with no diff (D#5 and any push after it).
6. `node_modules/.bin/prettier --check` on the push's files.
7. The node-server build under `.turboslide/build.lock`, served on 4750, then the route ceilings in the form check step 31 runs (`node scripts/check-client-bundle.mjs` with `--base http://localhost:4750 --client apps/studio/.output/public`, the script's usage lines 4 and 19 to 26), which reads the ceilings of `/decks`, `/deck/gt-brand`, `/edit/gt-brand`, `/docs` and `/signin`; the home budgets (`home.budget.*` of `core/home.spec.ts`) read on it, served on 4750, for every push of N, for P2-D#1 (the shared entry chunk) and for P2-A#4 (`/home`'s Sign In).
8. The push's rows and restated rows on the lane's local server: `node scripts/probes/core-gate.mjs --base http://localhost:<port> --only specs --rows <ids>` for spec rows, `--only accounts --rows <ids>` for local rows, `--only probe --areas help` for `help.documentation-link`; every row passed with zero retries. A red row of an earlier round the push did not touch is recorded and does not hold the push.
9. Pictures of every changed surface at 1440 and 390 in both appearances, each opened and looked at.

The round's acceptance, after the last push of every lane: every row of section 6 passed on the node-server build of the tree (the local rows on the capture server, the mail off reads on the second server), the `home.budget.*` rows inside their lines, `pnpm check` on the tree, and a verifier's hand pass that re-walks Kevin's five asks with pictures: the face, the bar without the pause control, `/docs`, the hero at 1440, 1280 and 1024, and every auth surface in both modes.

## 9. The questions only Kevin can answer

The build proceeds on the defaults; an answer that differs is a change the lane makes in a later push.

| #   | Question                                                                                                                                                                                                                                                                            | Default                                                                                                                                                                           | Source                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Q1  | Sign In on `/home` and `/decks`: go to the `/signin` page, or open the same plate in a window over the page?                                                                                                                                                                        | The page; the editor alone opens the window, so an unsaved draft and the live session stay. A window over the pages would mount through `createPortal(document.body)` as A#1 does | research-auth Q1                       |
| Q2  | The picture on the Sign in plate                                                                                                                                                                                                                                                    | The Blue Marble twin with its credit on `/signin` from 1024 px; none in the window and none under 1024 px                                                                         | research-auth Q2; NEXT.md question 5   |
| Q3  | Continue with Google's fill: Google's light and dark buttons, or the ink primary drawn today?                                                                                                                                                                                       | Google's fills (`#FFFFFF` with `#747775` on light, `#131314` with `#8E918F` on dark), the standard G, the label in Inter 500                                                      | research-auth Q3; NEXT.md question 4   |
| Q4  | Keep Cancel in the sign in window?                                                                                                                                                                                                                                                  | No: the close glyph and Escape close it                                                                                                                                           | research-auth Q4; NEXT.md 4.3.2 item 7 |
| Q5  | The page heading                                                                                                                                                                                                                                                                    | "Sign in to Turboslide" on the page, "Sign in" in the window                                                                                                                      | research-auth Q5                       |
| Q6  | A legal line under the methods                                                                                                                                                                                                                                                      | None until the `/terms` and `/privacy` text is approved; the foot carries the Google sentence alone                                                                               | research-auth Q6; NEXT.md question 13  |
| Q7  | The device page's words and what an approved terminal may do                                                                                                                                                                                                                        | "Connect the command line", Approve and Deny, "It acts as <address>."; the terminal keeps today's scope                                                                           | research-auth Q7                       |
| Q8  | A mail sender on production                                                                                                                                                                                                                                                         | None: Google is production's one method and the email rows exist where mail is on                                                                                                 | research-auth Q8; NEXT.md question 12  |
| Q9  | A signed in person on a phone: account rows in More?                                                                                                                                                                                                                                | Yes: Change name and Sign out under 480 px                                                                                                                                        | research-auth Q9                       |
| Q10 | The hero's lead                                                                                                                                                                                                                                                                     | "Turboslide is a slides editor in the browser. No account is needed."                                                                                                             | research-header Q1                     |
| Q11 | Where the pause control goes                                                                                                                                                                                                                                                        | The hero terminal's head and a "Pause Motion" text button in the footer, one state, both hidden under reduced motion; no control per band                                         | research-header Q2                     |
| Q12 | One hairline or two in the bar                                                                                                                                                                                                                                                      | One, before Sign In                                                                                                                                                               | research-header Q3                     |
| Q13 | The hero's alignment                                                                                                                                                                                                                                                                | The lead's first cap on the h1's first cap and the buttons' foot on its last baseline (40 px between them at 1440)                                                                | research-header Q4                     |
| Q14 | The h1's sizes                                                                                                                                                                                                                                                                      | 76 px from 1,136 px, 61.6 px at 1024, 64 px in one column from 720 to 1023, the phone sizes as today                                                                              | research-header Q5                     |
| Q15 | The social card and the wordmark in Inter's default glyphs                                                                                                                                                                                                                          | Yes                                                                                                                                                                               | research-header Q6                     |
| Q16 | New Presentation twice in a phone's first screen (the bar's and the hero's)                                                                                                                                                                                                         | Keep both                                                                                                                                                                         | research-header Q7                     |
| Q17 | The h1's tracking of -0.042em on Inter's display optical size, where the General Translation theme uses -0.025em                                                                                                                                                                    | Keep it                                                                                                                                                                           | research-header Q8                     |
| Q18 | The landing's page deck is in the General Translation theme at rest, so its slide headings (21 elements at 1440) draw cv11 and ss01. Keep that, or put the page deck in Simple at rest so the landing shows the alternates only after a visitor picks the General Translation tile? | Keep it (DESIGN.md 8.0, 8.7); the change is a later push of N with the page deck's theme, its materials and its rows                                                              | this file C6                           |
| Q19 | A "Run Turboslide yourself" page                                                                                                                                                                                                                                                    | Yes, from the README and `docs/hosting.md` section 1, with no host account details                                                                                                | research-docs Q1                       |
| Q20 | The docs in the 1104 px column of every other page                                                                                                                                                                                                                                  | Yes; the table of contents hides under 1180 px                                                                                                                                    | research-docs Q2                       |
| Q21 | "Last updated" on docs pages                                                                                                                                                                                                                                                        | No: Vercel builds from a shallow clone, so git dates would be wrong                                                                                                               | research-docs Q3                       |
| Q22 | Open in Claude and Open in ChatGPT in the Copy Page menu                                                                                                                                                                                                                            | Yes                                                                                                                                                                               | research-docs Q4                       |
| Q23 | Release notes in the docs                                                                                                                                                                                                                                                           | Not in this round; `docs/updates.md` is written for the team                                                                                                                      | research-docs Q5                       |
| Q24 | A guide for the features behind Advanced tools                                                                                                                                                                                                                                      | Yes, one page that names the switch                                                                                                                                               | research-docs Q6                       |
| Q25 | Markdown answers to `Accept: text/markdown` on docs addresses                                                                                                                                                                                                                       | Not in this round; the `.md` twins and the `alternate` link serve agents                                                                                                          | research-docs Q7                       |
| Q26 | Search on its own index or on Pagefind                                                                                                                                                                                                                                              | Its own index, loaded on the first open                                                                                                                                           | research-docs Q8                       |
| Q27 | The theme button's accessible name "Dark or light" for every visitor, in place of "Switch to light" and "Switch to dark"                                                                                                                                                            | Yes; it is true before hydration and needs no script                                                                                                                              | this file C10                          |

## Sources

- The research of this round: `docs/gslides-parity/polish-two/research-auth.md` (sections 1 to 6, the pictures `research-auth/01` to `26`), `research-docs.md` (sections 1 to 7, the pictures under `research-docs/`), `research-header.md` (sections 1 to 6, the pictures and `measure.json` under `research-header/`).
- `docs/DESIGN.md` 1 to 13 (binding for surfaces, corners, stacking, tokens, the face and the scrollbar); `docs/NEXT.md` 4.3 and 7; `docs/LANDING.md` 2 and 3 through the research.
- Kevin's messages of 2026-10-07 and his screenshot of the Sign in dialog on the design branch's local preview.
- The tree at `f2d48868`, the lines named in the header paragraph; production's `/home` document read on 2026-10-07 (one GET).
- General Translation's docs and auth plate through the research (`/Users/kevinliu/gt/gt-cloud` at `origin/main` 277384080, read only; `https://generaltranslation.com/docs` and `https://dash.generaltranslation.com`, read as data); Prototemplate's plate gallery through the research (read only).
- W3C, Understanding Success Criterion 2.2.2 Pause, Stop, Hide, through research-header 3.1.
