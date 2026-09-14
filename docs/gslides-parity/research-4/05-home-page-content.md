# The /home page: research and copy

Report 05 of the Google Slides parity round four, written 2026-09-13 against `main` at `61b16e4`
for Kevin Liu and the design workflow of round four. It answers three questions and then drafts
the page: what Google Slides' own product page says and how it is built; how Vercel, Linear and
Raycast structure a product page; what a salesperson and an agent developer each need to read in
thirty seconds. Section 6 is the copy, section by section, in Kevin's rules (plain technical
English, sentence case, no em dashes, no metaphors, full sentences, Title Case on buttons only,
no trailing periods on headings). Section 8 maps every performance claim to the file that makes it
true, with the number a document in this repository measured and the state of that claim on the
production URL today. Section 12 lists every source with its URL and the date it was read.

Kevin's directive (b), verbatim: "also make a custom turboslide icon and favicon and everything and
custom ui aesthetic and branding that uses awesome bayer dithers and shaders and unique beautiful
ui like a modern clean but also technical and agent-supporting vercel and opinionated and better
and turbo-fast (and explain why its turbofast, like built on rust?) vercel-ified version of google
slides almost. and give it a /home page too". This report covers the words of the /home page. The
icon, the favicon, the aesthetic and the page's visual design are the design-4 reports' work; the
transitions of directive (a) are the baseline report's work, and section 9 names the numbers this
page borrows from it.

## Summary

1. Google's Slides product page is a hero with two calls to action, then seven feature bands in a
   tabbed strip (Gemini, Create, Collaborate, Present, Security, Import, Do more), a customer quote
   band, an FAQ, a closing call to action and a four column footer. Its claims are about
   collaboration, templates and Gemini. It does not state a speed claim and does not show a
   comparison (section 2, read 2026-09-13).
2. Vercel, Linear and Raycast share one skeleton: a hero with a headline, one sentence and two
   buttons; a proof band (customers with numbers at Vercel and Linear, named professionals at
   Raycast); features in groups of three; a technical or developer section with a code sample or an
   API pointer; a final call to action; a footer with four to six link groups (section 3). None of
   the three shows a comparison table.
3. The salesperson needs, in thirty seconds, that the editor is Google Slides as they know it,
   that the GT deck is already there, that a link and a PDF are two clicks, and that nothing needs
   an account. The agent developer needs one command per transport, the rule that every write
   names a revision, and a pointer to the contract (section 4).
4. The page runs nine sections in this order: hero, a numbers strip, the editor in one picture,
   twelve feature cards in four rows of three (the README's groups, with Agent native and Hosting
   promoted to their own sections), a pictures and materials band, why it is fast, agents, a
   comparison with Google Slides, a footer (section 5). The copy is section 6.
5. Every speed claim maps to a file (section 8). Three claims in the task's list are not true on
   production today and the copy phrases them accordingly: the Rust addon and the wasm module are
   git-ignored build outputs that the Vercel build never produces, so the hosted studio and the
   Docker worker run the TypeScript stages of the same pipeline (`docs/native.md` "What runs
   where"; `.gitignore` lines 22 to 25); the browser's dither preview worker runs the TypeScript
   stages, with the wasm module built and wrapped for it but not mounted
   (`apps/studio/src/workers/dither.worker.ts`; `docs/native.md` open items); `/openapi.json` and
   `/llms.txt` on `https://turboslide.vercel.app` answer 236 and 302 byte placeholder stubs
   (measured today; `apps/studio/src/server/contracts.ts` reads `repoRoot()`, which is the overlay
   when hosted, `docs/hosting.md` section 8). The agent section therefore links the committed
   files on GitHub until the round bundles them.
6. `/home` is free: production answers 404 for it today, `/` stays a 307 to `/new` (parity SPEC
   6.1), and the route must not join `NOINDEX_ROUTES` in `apps/studio/src/routes/__root.tsx`
   (section 10).

## 1. Method and rules

- Repository facts are read from the files named, at `61b16e4`; nothing was built or installed.
  `README.md`, `AGENTS.md`, `docs/spec/SPEC.md` sections 2 and 3, `docs/gslides-parity/SPEC.md`
  sections 0, 1 and 11, `docs/gslides-parity/SPEC-2.md` sections 0 and 1, `docs/hosting.md`,
  `docs/hosting-chromium.md`, `docs/hosting-diagnosis.md`, `docs/native.md`, `docs/pptx.md`,
  `docs/HOSTED-STATUS.md`, `docs/M1-STATUS.md`, `docs/M4-M5-STATUS.md`,
  `docs/gslides-parity/VERIFICATION-2.md`, `docs/gslides-parity/research/07-sales-users.md`,
  `docs/gslides-parity/research-3/07-turboslide-inventory-3.md`, `packages/theme/**`,
  `packages/chrome/src/tokens.css`, `packages/effects/**`, `packages/materials/**`,
  `crates/turboslide-native/**`, `apps/studio/vite.deploy.config.ts`,
  `apps/studio/src/routes/__root.tsx`, `apps/studio/src/router.tsx`, the routes under
  `apps/studio/src/routes/`, `apps/studio/src/server/{contracts,thumbs}.ts`,
  `packages/store/src/snapshots.ts`, `packages/render/src/{slide,deck}.ts`,
  `packages/schema/src/actions.ts`, `packages/agent/generated/*`, `skills/*/SKILL.md`,
  `pnpm-workspace.yaml`, `apps/studio/vercel.json`, `.gitignore`, `LICENSE`.
- Web pages were read on 2026-09-13 through a fetch that returns a structured summary of the page,
  so the section lists below are the pages' order and labels as that summary reported them; a
  short phrase in quotation marks is the page's own label. No page was signed in to. No Google or
  Vercel artwork, logo or icon is reproduced or proposed; both are references for structure and
  tone.
- Production was probed today with plain GET requests for status codes and sizes only (section
  8.4); the bearer token was not used and is not in this report.
- "Measured" names the document that measured a number and its date; every such number is quoted
  from that document and none was measured again for this report. The baseline report of this
  round supplies the client side numbers (section 9).

## 2. Google Slides' product page

`https://workspace.google.com/products/slides/`, read 2026-09-13. The page's own order:

| Position | Section                | What it claims                                                                                                                                                                                                                                             | Media described                                   | Calls to action                                                           |
| -------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| 1        | Hero                   | Headline "Build beautiful presentations together"; one sentence about creating and delivering presentations in the browser with no installation                                                                                                            | A person using Gemini to generate slide content   | "Sign in", "Try Slides for work" (small business and enterprise variants) |
| 2        | Tab strip              | Gemini in Slides, Create, Collaborate, Present, Security, Import, Do more, Customers, FAQs                                                                                                                                                                 | none                                              | tabs that scroll to the bands                                             |
| 3        | Gemini in Slides       | Summaries, slide generation from prompts, Drive content, image generation                                                                                                                                                                                  | A screenshot of AI slide creation                 | none                                                                      |
| 4        | Create                 | Templates, brand consistency through domain templates, GIFs and stickers                                                                                                                                                                                   | Three template layouts, a stickers widget         | none                                                                      |
| 5        | Collaborate            | Meet inside the document, sharing controls, live pointers while co-editing                                                                                                                                                                                 | Video call, permission dialog, pointer indicators | none                                                                      |
| 6        | Present                | Present from Meet, speaker spotlight, recording (marked as premium)                                                                                                                                                                                        | Meet controls, spotlight, a record button         | none                                                                      |
| 7        | Security               | Encryption by default, client side encryption, anti abuse, privacy controls                                                                                                                                                                                | A lock illustration over a deck                   | none                                                                      |
| 8        | Import                 | Imports PowerPoint and Canva presentations                                                                                                                                                                                                                 | A PowerPoint file open in Slides                  | none                                                                      |
| 9        | Do more                | Mobile apps, offline editing, add-ons and developer tools                                                                                                                                                                                                  | Mobile popup, offline dialog, add-on examples     | App Store and Play Store                                                  |
| 10       | Customers              | Four quotes (Robinhood, Forus, Kärcher, MullenLowe) with logos and case study links                                                                                                                                                                        | Logos                                             | case study links                                                          |
| 11       | FAQ                    | Account requirements, PowerPoint compatibility, co-editing                                                                                                                                                                                                 | none                                              | expandable questions                                                      |
| 12       | Closing call to action | One sentence naming create, collaborate and present                                                                                                                                                                                                        | none                                              | "Sign in", "Try Slides for work"                                          |
| 13       | Newsletter             | A form with country, organisation size and consent                                                                                                                                                                                                         | none                                              | submit                                                                    |
| 14       | Footer                 | Four groups: the Workspace apps (18 items), security and management, solutions and pricing; resources (learning, support, stories, training); corporate (Cloud, Domains, Chrome Enterprise, privacy, terms); a language selector with more than 40 entries | none                                              | links                                                                     |

What the structure tells the /home page:

- Google's page is a catalogue of bands, each with one screenshot and two or three sentences. It
  has no speed claim and no comparison with anyone. Its proof is customer quotes. Its calls to
  action are a sign in and a trial, because the product requires an account.
- The order puts Gemini first, creation second and collaboration third. Turboslide has no
  Gemini and no co-editing (section 7), so its page cannot copy this order; it leads with the
  things Turboslide has and Google's page does not mention: the canvas, the export that matches
  the screen, the agent surface and the absence of an account.
- The FAQ answers "do I need an account" and "does it open PowerPoint". Turboslide's page answers
  both in the hero line and the compare row instead of an FAQ.

## 3. How Vercel, Linear and Raycast structure a product page

Read 2026-09-13. Two pages each: the home page and one product page.

| Element                | Vercel (`vercel.com`, `vercel.com/ai`)                                                                                                                                      | Linear (`linear.app`, `linear.app/agents`)                                                                                                                             | Raycast (`raycast.com`)                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Hero                   | A two word headline, one sentence, two buttons ("Deploy now", "Talk to sales"; the AI page has "Deploy now", "Read the docs")                                               | One sentence headline, one sentence sub line, one call to action                                                                                                       | A five word headline, two sentences, no button in the hero (sign in lives in the navigation)                      |
| Proof                  | Three named customers, each with one number (millions of agent conversations daily; over 100 million monthly visits; documentation for over 20,000 companies); no logo wall | Three quotes from named engineers at named companies and one number (over 40,000 product teams); no logo wall                                                          | A band of named professionals with roles; community counts (Slack 37k, X 90k)                                     |
| Features               | Three value propositions, each carrying three features beneath it; the AI page opens with three cards and a three column getting started band                               | Four bands (Intake, Plan, AI, Build), each a claim in one sentence plus a feature list of four to six items; the agents page groups three attributes under one heading | Bands by theme (extensions in category tabs, AI, automation, "what else"), each a heading, one sentence and cards |
| Technical section      | Infrastructure runs through every band; the AI page has a code sample (`npm i ai`) and a security section in five categories                                                | A developer section ("Create your own agents") with two calls to action and no code                                                                                    | A developer section with four benefit cards and two calls to action ("Read the docs", "Get started")              |
| Integrations           | None on the home page; a templates band on the AI page                                                                                                                      | A marketplace band of agent cards (Cursor, Codex, Devin, Sentry and others)                                                                                            | An extensions band with category tabs and a store link                                                            |
| Recently shipped       | Three product cards                                                                                                                                                         | A changelog band                                                                                                                                                       | A community band with video thumbnails                                                                            |
| Closing call to action | One button ("Deploy now"; "Get a demo" on the AI page)                                                                                                                      | Footer only                                                                                                                                                            | A heading, one sentence, a download                                                                               |
| Footer                 | Product, resources, company and legal groups (the fetch returned one call to action for the home page footer)                                                               | Six groups: Product, Features, Company, Resources, Connect, Legal                                                                                                      | Seven groups: Product, Core features, Top extensions, Company, Community, By Raycast, newsletter                  |
| Comparison table       | none                                                                                                                                                                        | none                                                                                                                                                                   | none                                                                                                              |

What to take and what to leave:

- Take the skeleton: hero with one sentence and two or three buttons; a proof band of numbers
  rather than logos (Turboslide has measured numbers and no customers); features in threes; one
  technical section with real commands; one closing call to action; a footer in four groups.
- Take the density: every band is a heading in one line, one sentence of claim, and a list or
  cards. No band on any of the six pages runs past three sentences of prose.
- Leave the artwork. Vercel's triangle, its gradients and its typography are not references for
  assets; Linear's and Raycast's renders are theirs. The page draws its own pictures from the
  product (the fifteen screenshots and a live material, section 7) and uses the Prototemplate
  tokens (`packages/chrome/src/tokens.css`).
- Leave the marketplace band. Turboslide's equivalent is the four skills and the MCP tool list,
  which the agent section carries as commands.
- Add what none of the three has and Kevin asked for: a comparison row with Google Slides that
  stays factual (section 6.8), because the page's readers already use Google Slides.

## 4. What each reader needs in thirty seconds

### 4.1 The salesperson

`docs/gslides-parity/research/07-sales-users.md` (written 2026-09-11 from public sources) and
parity SPEC section 11 describe the reader: a salesperson who knows Google Slides, who tailors an
existing deck far more often than building one (the cover name and logo, a case study, the
pricing slide, the slides that do not apply), who presents over a call and sends a PDF or a link.
Salesforce's figure that reps spend 60 percent of their time on non selling work is the report's
first row (`https://www.salesforce.com/sales/state-of-sales/sales-statistics/`, read 2026-09-11 by
R07).

In thirty seconds this reader must learn, in this order:

1. It is Google Slides as they know it: the same menus, toolbar, filmstrip, notes pane, right
   click menus and shortcuts (README, "The Google Slides shell"; parity SPEC section 1). One
   screenshot proves it faster than a paragraph.
2. The GT deck is already there as the template, and a new presentation opens at once with no
   sign in (README, "Layouts and themes"; `/new`).
3. The everyday tasks are one gesture each: duplicate, skip, reorder, find and replace across the
   deck, replace a logo by dropping a file, present with notes in a second window, share a read
   only link, download a PDF or a PowerPoint that looks like the screen (parity SPEC 11.2).
4. The PowerPoint they send opens without a repair dialog and matches what they saw (README,
   "Exports"; `docs/pptx.md`).
5. Nothing on the page names an internal thing: no revision, no lease, no id (parity SPEC 11.1).

Words this reader should not meet above the fold: action table, MCP, wasm, napi, Blob, Chromium,
Nitro, revision, lease. They belong to sections 6.6 and 6.7, below the features.

### 4.2 The agent developer

`skills/turboslide-api/SKILL.md`, `packages/agent/generated/llms.txt` and `AGENTS.md` "The agent
surface" describe what an agent reads first. In thirty seconds this reader must learn:

1. Every operation is one named action in one table (105 actions,
   `packages/schema/src/actions.ts`), and the CLI, MCP, HTTP and the in page window API are
   generated from it, so a click and a call take the same path (README, "Agent native").
2. One command per transport that works today: the CLI against a checkout, MCP over stdio or
   `/mcp` on the studio, `POST /api/actions/<id>`, `window.turboslide.studio.invoke(...)`.
3. The write protocol in one line: every write names `baseRevision` and its author, a stale one
   is 409 with the current document, a lease protects a slide (`llms.txt` "Rules").
4. Where the contract is: `/api/agent`, `/openapi.json`, `/llms.txt`, the four skills.
5. That the hosted agent routes need a bearer token, and that a checkout serves them to
   localhost without one (`docs/hosting.md` section 6).

Both readers share the hero, the numbers strip and the editor picture; the salesperson stops at the
features and the compare row; the agent developer skips to "Why it is fast" and "For agents".

## 5. Section order

| #   | Section                     | Reader served          | Why it sits here                                                                                                                                                             | Pictures                                                               |
| --- | --------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | Hero                        | both                   | Name, one sentence, three buttons, one line of facts (no account, MIT, the hosted address)                                                                                   | `01-new-presentation.jpg` with `13-editor-light.jpg` as the light twin |
| 2   | Numbers strip               | both                   | The proof band the reference pages use, with measured numbers instead of logos                                                                                               | none                                                                   |
| 3   | The editor in one picture   | salesperson            | Google's frame, every slide a canvas, the GT look, in three short claims beside one screenshot                                                                               | `06-canvas-rotation.jpg`                                               |
| 4   | Features in threes          | salesperson            | Twelve cards in four rows, the README's groups in the README's order, each with a screenshot or an icon from the theme sprite                                                | eleven of the fifteen shots (section 7)                                |
| 5   | Pictures and materials      | both                   | Directive (b) asks for dithers and shaders in the identity; this band shows the product's own two tone pipeline and a live material, with the honest note on what runs where | `12-slideshow-dither.jpg` plus a live material                         |
| 6   | Why it is fast              | agent developer, Kevin | The technical section; every claim maps to a file and a number (section 8)                                                                                                   | none, or a diagram of the one renderer                                 |
| 7   | For agents                  | agent developer        | Six transports, one real command each, the write rule, the contract links                                                                                                    | a terminal block, no screenshot                                        |
| 8   | Compared with Google Slides | salesperson            | Factual rows; the reader already uses Google Slides and wants to know what changes                                                                                           | none                                                                   |
| 9   | Footer                      | both                   | Documentation links, the skills, the licence, the third party notices, the repository, the studio                                                                            | none                                                                   |

## 6. The copy

Rules applied to every string below: sentence case; no em dashes; no metaphors; full sentences in
body text; Title Case on buttons only; no trailing periods on headings; no engineering noun above
section 6.6. A string in a table cell is what the page shows. Where a number comes from a
document, section 8 names it; where the baseline report will supply it, the placeholder reads
`[baseline: ...]` and section 9 lists it.

### 6.1 Hero

- Mark: the Turboslide mark of the design-4 report (today the shell shows the GT mark,
  `packages/chrome/src/GtMark.tsx`; the root route declares no favicon, `__root.tsx` line 40).
- Name: `Turboslide`
- One sentence: `A slides editor with Google Slides' menus, toolbar and shortcuts, a canvas on every slide, and a PowerPoint export that matches the screen pixel for pixel.`
- Buttons: `New Presentation` (to `/new`), `Open the GT Deck` (to `/deck/gt-brand`), `GitHub`
  (to `https://github.com/Kevin-Liu-01/Turboslide`). The second opens the viewer rather than the
  editor: the production store has no accounts, so `/edit/gt-brand` would hand every visitor the
  one shared copy of the brand deck (research-3 report 07, summary item 2). The viewer's Share
  and the home page's card menu offer Make a copy for anyone who wants to edit.
- Fact line under the buttons: `No account. Open source under the MIT licence. Hosted at turboslide.vercel.app.`
- Picture: the fresh Untitled presentation (`01-new-presentation.jpg`), swapped for
  `13-editor-light.jpg` in the light theme.

Alternative one sentence, shorter, for a narrow viewport:
`Google Slides' behaviours, a canvas on every slide, and a PowerPoint that matches the screen.`

### 6.2 Numbers strip

Six figures with one line each. Every figure is a repository fact (section 8 for the sources).

| Figure    | Line                                                               |
| --------- | ------------------------------------------------------------------ |
| `105`     | `actions, one table for the click, the CLI, MCP and the API`       |
| `21`      | `layouts, Google's eleven first and the ten GT layouts after them` |
| `135`     | `shape presets drawn from the PowerPoint geometry`                 |
| `0.003 %` | `worst page mismatch on the 170 page export of the GT deck`        |
| `17`      | `shader materials with typed controls`                             |
| `MIT`     | `licence, with the code on GitHub`                                 |

### 6.3 The editor in one picture

Heading: `Google Slides' frame, on every slide a canvas`

Three claims beside `06-canvas-rotation.jpg`:

- `The same menus, toolbar, filmstrip, speaker notes and right click menus, in Google's order, with Google's shortcuts. An item Turboslide does not have is in its place, disabled, with one sentence on what to do instead.`
- `Every object drags, resizes, rotates, groups and reorders. The first drag on a slide converts it to a canvas without moving a pixel, and one undo puts the layout back.`
- `One look: Inter, paper and ink, one pixel rules, a light and a dark appearance that the stage, the thumbnails, the slideshow and every download follow.`

### 6.4 Features in threes

Heading: `What it does`

Twelve cards, four rows of three, in the README's order. Each card has a title, two sentences and
a picture or an icon from the theme sprite (`packages/theme/assets/sprite-ids.json`; the id is
named where an icon fits better than a shot). Every fact is in `README.md`, "Feature tour".

| Row | Card                            | Copy                                                                                                                                                                                                                                                                                     | Picture or icon                 |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1   | The Google Slides shell         | `Ten menus, a toolbar whose tail follows the selection, the filmstrip, the notes pane, the right panels and the bottom bar. Search the menus finds every item by name, and every control carries its name and its key.`                                                                  | `02-file-menu.jpg`              |
| 1   | The canvas                      | `Drag, resize and rotate with live readouts. Snap guides, rulers, guides, zoom to 1600 percent, marquee selection, z order, groups, crop mode and connectors that follow the shape they are attached to.`                                                                                | `07-canvas-snap-guides.jpg`     |
| 1   | Layouts and themes              | `Twenty one layouts in one grid: Google's eleven and the ten GT layouts. Apply layout keeps the content and never refuses. A new presentation opens on a Title slide with four starter pictures already in it.`                                                                          | `04-layout-grid.jpg`            |
| 2   | Text                            | `Bold, italic, underline, strikethrough, super and subscript, colour and highlight on a range. Lists with nine bullet and six numbering presets, line spacing, columns, indents, alignment, autofit, find and replace across the deck, links to a URL or a slide.`                       | icon `i-bars-3-bottom-left`     |
| 2   | Objects, pictures and materials | `135 shapes in Google's four categories, seven line kinds with ten end decorations, fills, borders, dashes and shadows. Pictures upload, crop, mask to any shape and adjust. Seventeen shader materials play live on the stage, and a photograph becomes a two tone dither in one step.` | `08-format-options.jpg`         |
| 2   | Tables                          | `A hover grid up to 20 by 20. Insert and delete rows and columns, merge and unmerge, distribute, header rows, cell fills and borders. Tab moves between cells. The editable export writes a real PowerPoint table.`                                                                      | icon `i-table-cells`            |
| 3   | Charts and diagrams             | `Bar, column, line and pie charts with a data grid in the panel, up to 12 categories and 6 series. Six diagram templates in three styles insert as a group you edit like any other.`                                                                                                     | icon `i-presentation-chart-bar` |
| 3   | Exports                         | `Perfect PowerPoint by default: each page is the rendered slide over searchable text, checked against the screen before the file is written. Editable text PowerPoint, PDF, a single web page, plain text, JPEG and PNG beside it.`                                                      | `09-download-dialog.jpg`        |
| 3   | Present                         | `Slideshow from the current slide, Presenter view in a second window with the timer, the notes and the next slide, Google's presenting keys, a laser pointer, and a present link you can send.`                                                                                          | `11-presenter-console.jpg`      |
| 4   | The viewer and sharing          | `A read only link with Slide, Grid and Book views, an embed for any site, and a Share dialog with the view, present and edit links. Skipped slides and speaker notes stay out of what you share unless you ask.`                                                                         | `14-book-view.jpg`              |
| 4   | Home and files                  | `Recent presentations as cards with thumbnails, Make a copy, Rename, Move to trash with Undo, Import slides from another presentation, Version history with named versions, and a bundle you can download and upload.`                                                                   | `10-decks-home.jpg`             |
| 4   | Quality gates                   | `Fifty five grammar rules check overflow, contrast, type sizes and copy in both themes, with Fix for the mechanical ones. A 25 step acceptance chain and a 2,100 row parity audit run before anything ships.`                                                                            | icon `i-check-badge`            |

The two README groups this table leaves out, Agent native and Hosting, are sections 6.7 and 6.6.
A card's picture is the shot named; `03-insert-menu.jpg`, `05-filmstrip-menu.jpg` and
`15-grid-view.jpg` are the alternates (section 7).

### 6.5 Pictures and materials

Heading: `Dithers and shaders, from the deck to the interface`

Copy, three sentences and one caption:

- `The GT brand deck draws its photographs as two tone dithers: an eight by eight Bayer screen at two pixel cells, cut from a toned and cropped picture, with a light twin that is the exact inverse of the dark one.`
- `The same pipeline runs on any photograph or on a frozen frame of a shader material, reports how clear the plate stays, and is written three times with one arithmetic: in TypeScript, in a Rust addon for Node and in a Rust module for the browser, with a test that proves the three light the same cells.`
- `Seventeen Paper Shaders materials play live on the stage with typed controls and the GT palette presets, and every one is captured as frozen frames for the thumbnails and the exports.`
- Caption under `12-slideshow-dither.jpg`: `The Blue Marble slide of the GT deck in the slideshow, a two tone dither with its plate.`

Facts: `packages/effects/src/pipeline.ts` (the stage order), `crates/turboslide-native/src/bayer.rs`
(the screen), `docs/native.md` "Parity results" (0 disagreeing cells on 30 screens of 360,000
cells), `packages/materials/src/catalog.ts` (17 `PaperShaderName` entries),
`packages/materials/NOTICE` (Paper Shaders, Apache-2.0). The word "arithmetic" is the document's
own (`docs/native.md`, "Why a native module"). The design-4 report decides how the page itself uses
dithers and materials; the copy above describes the product's pipeline and claims nothing about
the page.

### 6.6 Why it is fast

Heading: `Why it is fast`

Lead sentence: `Most of the speed is structural: one renderer, contracts generated ahead of time, immutable documents and caches, and export work that runs where the browser already is. The numbers below are measured, and each one names the file that produces it.`

Eight rows, each a title, two sentences and the number. Section 8 gives the file and the source
per row.

| Row                                      | Copy                                                                                                                                                                                                                                                                                                                                                                  | Number shown                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| One renderer                             | `One function turns a slide into the same HTML and CSS for the editor, the viewer, the embed, the CLI's screenshots and the exporters. A render at one revision is the same pixels on every surface, so nothing is drawn twice and nothing has to be reconciled.`                                                                                                     | `170 renders of the GT deck in 18.3 s in the acceptance chain; a slide is ready in 6 ms at the median`    |
| Contracts generated once                 | `Every operation is one entry in one table. The CLI parsers, the MCP tools, the HTTP contract, the window API list and the skills are generated from it and committed, so describing the API costs nothing per request and a stale copy fails the build.`                                                                                                             | `105 actions, 89 MCP tools, 87 HTTP paths, from one file`                                                 |
| Rust where the arithmetic must not drift | `The dither and image comparison pipeline is a Rust crate compiled to a Node addon and to WebAssembly, with a TypeScript copy of the same arithmetic where neither is built. The crate exists so that a dither approved in the browser and one produced on a server light the same cells; where the addon is built it also cuts a screen in less than half the time.` | `20 ms for a 1600 by 900 screen through the addon, 23 ms through wasm, 52 ms in TypeScript`               |
| The export is a screenshot               | `Perfect PowerPoint rasterises each page in Chromium at twice the sheet size, stores it in the smallest encoding that decodes within budget, then decodes it again and compares it with the shot before the file is written. The page is the screen; there is no second layout engine to disagree with it.`                                                           | `worst decoded mismatch 0.003 percent over 170 pages; about 15.5 MiB per theme`                           |
| Export in batches                        | `On the hosted studio a long deck exports in batches of sixty slides, each one function call, with a progress sentence and a merge at the end. A failed batch is retried on its own; the file is never started over.`                                                                                                                                                 | `one slide in 7.5 s cold; the 85 slide GT deck in about three and a half minutes`                         |
| Compute that lasts                       | `The export and render routes run on Vercel functions with an 800 second budget and 3,009 MB of memory, on fluid compute, so several requests to one deployment share one warm process and a render never waits for a cold start when the process is already up.`                                                                                                     | `800 s and 3,009 MB on /api/export, /api/render and the server functions`                                 |
| Routes load before the click             | `The router preloads a route's code and data as soon as the pointer reaches its link, so the move from the home page to a presentation, or from the editor to the viewer, starts before the click lands.`                                                                                                                                                             | `[baseline: /home to /new, /home to /deck/gt-brand, warm]`                                                |
| Immutable documents and caches           | `Every committed write stores the whole document under the hash of its bytes, so a reader proves it has the current document from one header and fetches no slide it already holds. Thumbnails named by revision are cached for a year, and the GT deck's pictures are static files on the CDN that answer before the function runs.`                                 | `a cached thumbnail in 239 to 385 ms; a picture from the CDN in 112 to 299 ms; the list in 164 to 292 ms` |

Closing sentence, honest by design: `What is still slow is measured too: the editor's page is ready [baseline: /new ready] after the shell, a thumbnail that is not cached takes seven to nine seconds on a cold instance, and one instance renders one slide at a time. Those numbers are this round's targets.`

If the round closes the editor readiness target before the page ships, the closing sentence keeps
the two facts that remain true and drops the one that no longer is; the copy never claims a number
the baseline report has not measured.

### 6.7 For agents

Heading: `For agents`

Lead: `Every capability of the editor is an action. The same 105 actions run on the CLI, over MCP, over HTTP and inside an open page, through one validator, and every write names the revision it read.`

Six rows, each a label, one sentence and one real command. The commands are the ones
`README.md`, `skills/turboslide-api/SKILL.md` and `llms.txt` document; the deck id `gt-brand` and
the slide id `thesis` exist in the repository.

| Transport  | Sentence                                                                                                                                               | Command                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI        | `Edits a decks folder with no browser page; --json gives machine output and --base-revision names the revision the write read.`                        | `pnpm exec turboslide slide new --layout split --after title --deck decks/gt-brand --json`                                                                                  |
| MCP        | `One deck_<action> tool per action over stdio or streamable HTTP, with render tools that return PNGs and the deck_review prompt for the judge lenses.` | `pnpm exec turboslide mcp --deck decks/gt-brand`, or `POST https://turboslide.vercel.app/mcp?deck=gt-brand` with a bearer token                                             |
| HTTP       | `One JSON object in, the normalized result and its findings out; a stale revision is 409 with the current document.`                                   | `curl -X POST 'https://turboslide.vercel.app/api/actions/deck.info?deck=gt-brand' -H 'authorization: Bearer $TURBOSLIDE_TOKEN' -H 'content-type: application/json' -d '{}'` |
| Window API | `Inside an open editor, viewer or presenter page, the same actions run through the same dispatcher a click uses.`                                      | `window.turboslide.studio.invoke('view.goto', { slideId: 'thesis' })`                                                                                                       |
| OpenAPI    | `The OpenAPI 3.1 document, the manifest and the llms guides are generated from the action table and committed.`                                        | `packages/agent/generated/openapi.json` on GitHub today; `GET https://turboslide.vercel.app/openapi.json` once the round bundles it (section 8.4)                           |
| Skills     | `Four skills with generated reference tables: discovery and the write protocol, writing slides in the grammar, driving the live page, verifying.`      | `skills/turboslide-api/SKILL.md`, `skills/turboslide-create/SKILL.md`, `skills/turboslide-studio/SKILL.md`, `skills/turboslide-verify/SKILL.md`                             |

Two closing sentences: `The hosted agent routes accept a bearer token set by the deployment's owner; a checkout serves them to localhost without one. A deck moves between a checkout and the hosted studio with turboslide deck push and deck pull.`

Push command, for the row that shows it: `pnpm exec turboslide deck push gt-brand --to https://turboslide.vercel.app`.

### 6.8 Compared with Google Slides

Heading: `Compared with Google Slides`

Lead: `Turboslide follows Google Slides' structure and behaviours on purpose, so the differences are the point. Google Slides is a product of Google LLC; Turboslide is not affiliated with Google.`

Every Google cell names a public page the parity research read on 2026-09-11 (R01, R03, R07,
R10 in `docs/gslides-parity/research/`) or the product page read today; every Turboslide cell names
the README section or the file.

| Row                  | Google Slides                                                                                                                                               | Turboslide                                                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account              | `A Google account; the product page's calls to action are Sign in and Try Slides for work` (product page, 2026-09-13)                                       | `No account. Anyone with a link opens it; the store is shared` (README "The viewer and sharing")                                                                                                  |
| Where the file lives | `Google Drive` (R03)                                                                                                                                        | `A folder in a checkout, or a Vercel Blob store on the hosted studio, with one immutable copy per revision` (`docs/hosting.md` section 4)                                                         |
| Editing together     | `Real time co editing with live pointers, comments, assignments and a comments panel` (product page; R10 A11)                                               | `One editor holds a ten minute lease on the slide it edits; another writer's change arrives within a second with a banner. No comments yet` (README "Home and files"; `menus/model.ts` line 1025) |
| Export               | `PowerPoint, ODP, PDF, plain text, JPEG, PNG and SVG of the current slide` (R01, File > Download)                                                           | `PowerPoint in two modes, one pixel identical to the screen with a report; PDF, one file web page, plain text, JPEG, PNG and the Turboslide bundle. No ODP or SVG` (README "Exports")             |
| Import               | `PowerPoint and Canva files; Import slides from another presentation` (product page; R01)                                                                   | `Import slides from a presentation on this studio; open a Turboslide bundle. No PowerPoint import yet` (`menus/strings.ts` line 498)                                                              |
| Automation           | `A REST API with presentations.get and batchUpdate, Apps Script and add-ons; the developer site lists an MCP server` (Slides API overview, 2026-09-13; R01) | `105 actions on the CLI, MCP, HTTP and the window API, generated from one table with an OpenAPI document and four skills` (README "Agent native")                                                 |
| Layouts and themes   | `Many themes and templates; eleven predefined layouts per theme` (R03; Apps Script PredefinedLayout)                                                        | `One theme, gt-ink-paper, with Google's eleven layouts and ten GT layouts` (README "Layouts and themes")                                                                                          |
| Pictures             | `Stock and web images, Drive and Photos, GIFs and stickers, Gemini image generation` (product page)                                                         | `Upload, URL or this presentation; crop, mask, adjust; two tone dithers and seventeen shader materials` (README "Objects, pictures and materials")                                                |
| Transitions          | `Slide transitions and object animations` (R01, Slide > Transition)                                                                                         | `None; the Transition item is present and disabled with a sentence` (`menus/model.ts` line 1503)                                                                                                  |
| Presenting           | `Slideshow, Presenter view, present from Meet, recording` (product page; R04)                                                                               | `Slideshow, Presenter view in a second window, Google's keys, a present link` (README "Present")                                                                                                  |
| Offline              | `With the Docs Offline extension in Chrome or Edge` (R07)                                                                                                   | `The slideshow keeps running after load; the editor needs the server` (README "Present")                                                                                                          |
| Licence and hosting  | `Part of Google Workspace` (product page)                                                                                                                   | `MIT; run it from a checkout or deploy it to Vercel` (`LICENSE`; `docs/hosting.md`)                                                                                                               |

The rows where Turboslide has less (comments, co editing, PowerPoint import, ODP and SVG,
transitions, Gemini) stay in the table. A comparison that hides them would be read by people who
use both products daily.

### 6.9 Footer

Four groups, one heading each, plain links.

| Group         | Links                                                                                                                                                                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Studio        | `New presentation` (`/new`), `Your presentations` (`/decks`), `The GT deck` (`/deck/gt-brand`), `Present the GT deck` (`/deck/gt-brand?present=1`), `Trash` (`/decks/trash`)                                                                                                                                                                           |
| Documentation | `The documentation index` (`docs/README.md`), `The specification` (`docs/spec/SPEC.md`), `Google Slides parity` (`docs/gslides-parity/SPEC.md`, `SPEC-2.md`), `The grammar` (`docs/grammar.md`), `PowerPoint export` (`docs/pptx.md`), `Hosting` (`docs/hosting.md`), `The native module` (`docs/native.md`), `Rules for the repository` (`AGENTS.md`) |
| Agents        | `Manifest` (`/api/agent`), `OpenAPI` (the committed file until section 8.4 is fixed), `llms.txt`, `MCP` (`/mcp`), the four skills                                                                                                                                                                                                                      |
| Licence       | `MIT licence, copyright 2026 Kevin Liu` (`LICENSE`), `Third party notices` (`THIRD_PARTY_NOTICES.md`: Paper Shaders Apache-2.0, Heroicons MIT, Inter OFL), `GitHub` (`https://github.com/Kevin-Liu-01/Turboslide`)                                                                                                                                     |

One closing line: `Turboslide is General Translation's slides editor. Google Slides is a product of Google LLC.`

### 6.10 Metadata

- `<title>`: `Turboslide`
- Meta description (one sentence): `An agent native slides editor with Google Slides' behaviours, a canvas on every slide and a pixel identical PowerPoint export.`
- Open Graph image: the design-4 report's; `01-new-presentation.jpg` cropped to 1200 by 630 until
  then.
- Robots: indexable. `/home` must not join `NOINDEX_ROUTES` (`__root.tsx` line 33).

## 7. Screenshots to use

`docs/readme/` holds fifteen JPEGs, written by the README workflow. Their captions are the README's.
The table assigns each to a section; three are alternates. A light and dark pair exists for the
editor only (01 and 13); every other shot is in the dark appearance, so the design decides whether
a light page shows dark shots in a frame or asks the README workflow for light twins.

| File                        | Shows                                                               | Section                               |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------- |
| `01-new-presentation.jpg`   | The fresh Untitled presentation, dark                               | 6.1 hero (dark)                       |
| `13-editor-light.jpg`       | The editor on a content slide, light                                | 6.1 hero (light twin)                 |
| `06-canvas-rotation.jpg`    | Rotation by the handle with the readout, beside a chart and a table | 6.3 the editor in one picture         |
| `02-file-menu.jpg`          | File menu with the Download submenu                                 | 6.4 The Google Slides shell           |
| `07-canvas-snap-guides.jpg` | A group dragged into alignment with the snap guide                  | 6.4 The canvas                        |
| `04-layout-grid.jpg`        | The layout grid, Google's eleven and the ten GT layouts             | 6.4 Layouts and themes                |
| `08-format-options.jpg`     | Format options on a rotated rectangle                               | 6.4 Objects, pictures and materials   |
| `09-download-dialog.jpg`    | The Download dialog with Perfect and Editable text                  | 6.4 Exports                           |
| `11-presenter-console.jpg`  | Presenter view with the timer, the notes and the previews           | 6.4 Present                           |
| `14-book-view.jpg`          | The viewer's book view                                              | 6.4 The viewer and sharing            |
| `10-decks-home.jpg`         | The home page at `/decks` with cards                                | 6.4 Home and files                    |
| `12-slideshow-dither.jpg`   | The Blue Marble slide, a two tone dither with its plate             | 6.5 Pictures and materials            |
| `03-insert-menu.jpg`        | The Insert menu with the Chart submenu                              | alternate for The Google Slides shell |
| `05-filmstrip-menu.jpg`     | The filmstrip's right click menu                                    | alternate for The Google Slides shell |
| `15-grid-view.jpg`          | The viewer's grid view                                              | alternate for The viewer and sharing  |

Shots the page wants and the folder does not have (requests to the README workflow, which owns
`docs/readme/`): a shader material live on the stage with its controls in Format options; a table
with merged cells and a chart's data grid; the Extensions > Agent access dialog with the MCP and
API addresses; the source drawer with a slide's JSON; a terminal running `turboslide slides --json`
against the GT deck. The last two can be drawn as text blocks in the page's own type if no shot
arrives.

## 8. The claims map

Every claim in section 6.6, the file that makes it true, the measurement and its source, and the
state of the claim on `https://turboslide.vercel.app` today.

### 8.1 Claims that hold on production today

| Claim                          | Files                                                                                                                                                                                                                                              | Measured                                                                                                                                                                                                                           | Source                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| One renderer                   | `packages/render/src/slide.ts` (`renderSlide`, "one string function"), `deck.ts`, `standalone.ts`, `thumb.ts`; consumers in `apps/studio`, `packages/viewer`, `apps/cli`, `packages/export`                                                        | 170 renders in 18.3 s (check step 10, 2026-09-12); readiness wait p50 6 ms, p95 28 ms; screenshot p50 99 ms (M1, 2026-09-10); 170 pairs against the brand deck's own screenshots, worst 0.408 percent, mean 0.016 percent          | `docs/gslides-parity/VERIFICATION-2.md` section 2; `docs/M1-STATUS.md` lines 87 to 100; README "Quality gates" |
| Contracts generated once       | `packages/schema/src/actions.ts` (105 `id:` entries), `packages/agent/generated/{cli,describe,manifest,mcp-tools,openapi}.json`, `llms.txt`, `llms-full.txt`; `pnpm generate:contracts`; check step 3                                              | 105 actions; 89 `deck_*` tools in `mcp-tools.json`; 87 `/api/actions/` paths in `openapi.json` (counted today at `61b16e4`)                                                                                                        | the files; README "Agent native"; `AGENTS.md` "Contracts between builders"                                     |
| The export is a screenshot     | `packages/export/src/pptx/page-raster.ts` (the policy), `packages/export/src/**`, `docs/pptx.md`                                                                                                                                                   | 170 pages, worst decoded mismatch 0.003 percent (`horizon`, 194 of 5,760,000 px), 15.68 and 15.85 MiB per theme locally; 15.52 MiB and 0.003 percent in the function                                                               | `docs/pptx.md` lines 379 to 384; `docs/HOSTED-STATUS.md` lines 114 to 154                                      |
| Export in batches              | `packages/export/src/batch/plan.ts` (60 per batch from `floor(240 s / (2.6 s × 1.5))`), `apps/studio/src/server/export-batch.ts`, `download.ts`, `routes/api/export.$deckId.ts`                                                                    | one flatten slide 7.46 s cold (`perfect: true`); 85 pages flatten 187.9 to 203.1 s; Editable text 125.4 to 127.4 s; the batched export of the GT deck on a preview 239.5 s at a 784.2 MiB peak; one Editable text slide 1.8 s warm | `docs/hosting.md` section 7; `docs/HOSTED-STATUS.md` lines 114 to 119; `VERIFICATION-2.md` line 32             |
| Compute that lasts             | `apps/studio/vite.deploy.config.ts` (`HEAVY = { maxDuration: 800, memory: 3009 }` on `/api/export/**`, `/api/render/**`, `/_serverFn/**`; catch-all 300 s); the project's fluid compute setting                                                    | fluid compute on with `elasticConcurrencyEnabled: true` (the project's settings as read 2026-09-11); the Vercel build accepted the function values without a warning                                                               | `docs/hosting-diagnosis.md` line 25; `docs/hosting.md` section 6                                               |
| Routes load before the click   | `apps/studio/src/router.tsx` (`defaultPreload: 'intent'`, `defaultPreloadStaleTime: 0`)                                                                                                                                                            | not measured in any document; the baseline report's row (section 9)                                                                                                                                                                | the file                                                                                                       |
| Immutable documents and caches | `packages/store/src/snapshots.ts`, `blob-store.ts` (`pull()` by etag), `apps/studio/src/server/thumbs.ts` (`public, max-age=31536000, immutable` when the revision is in the URL), `vite.deploy.config.ts` `publicAssets` (the GT twins, one hour) | an unchanged deck costs one `head` per read and no download; a cached 320 px thumbnail 239 to 385 ms; a twin 112 to 299 ms from the CDN; the deck list 164 to 292 ms; the shell 104 to 242 ms; `/` 568 ms warm, 1.6 to 3.9 s cold  | `docs/hosting.md` sections 2, 4 and 7                                                                          |

### 8.2 The Rust claim, stated precisely

| Fact                                                                                                                                                                                                                                                                                                                                                  | Source                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| The crate `crates/turboslide-native` holds the two tone pipeline, the 1-bit PNG encoder, the exact and pixelmatch diffs and DSSIM, behind `napi` and `wasm` features; 37 unit tests and 6 Pillow parity tests                                                                                                                                         | `crates/turboslide-native/src/lib.rs`, `Cargo.toml`; `docs/M4-M5-STATUS.md` line 393                                                         |
| `packages/effects/src/select.ts` picks the addon, then the wasm module, then the TypeScript stages, once per process; `TURBOSLIDE_EFFECTS_BACKEND` pins one                                                                                                                                                                                           | the file; `docs/native.md` "Loading order"                                                                                                   |
| The three implementations light the same cells: 30 screens of 360,000 cells, 0 disagreements; 4,228 tone LUTs, 68 Lanczos tables, 48 pixelmatch cases, 0 disagreements                                                                                                                                                                                | `docs/native.md` "Parity results" (2026-09-10)                                                                                               |
| Cost of a 1600 by 900 screen: 52 ms TypeScript, 20 ms addon, 23 ms wasm (Apple M5 Max, warm)                                                                                                                                                                                                                                                          | `docs/native.md` "Costs"                                                                                                                     |
| The document's own reason: "the crate is not a faster pipeline; it is the same pipeline, operation for operation, compiled for three places"                                                                                                                                                                                                          | `docs/native.md` "Why a native module"                                                                                                       |
| `*.node` and `packages/native/wasm/*` are git-ignored; the Vercel build is `pnpm install --frozen-lockfile` and `vite build -c vite.deploy.config.ts` with no cargo step, so the function holds neither and runs TypeScript; the Docker worker image runs the TypeScript stages too; the addon exists on a checkout that built it (darwin-arm64 here) | `.gitignore` lines 22 to 25; `apps/studio/vercel.json`; `apps/studio/package.json` line 14; `docs/native.md` "What runs where" and "Targets" |
| The browser's dither preview worker composes the TypeScript stages; the wasm module is built and wrapped for a worker and not mounted                                                                                                                                                                                                                 | `apps/studio/src/workers/dither.worker.ts` lines 1 to 26; `docs/native.md` open items                                                        |

The copy in 6.6 therefore says "compiled to a Node addon and to WebAssembly, with a TypeScript
copy of the same arithmetic where neither is built" and "where the addon is built it also cuts a
screen in less than half the time". It does not say that the hosted studio runs Rust, because today
it does not. If the round adds a Linux build of the addon to the deploy (the release matrix
`docs/native.md` names as not existing yet) or mounts the wasm module in the worker, the sentence
can be strengthened to name the place.

### 8.3 Numbers the page must not show yet

- Any client side transition time (route to route, slide to slide, panel open) until the baseline
  report measures it. No document in the repository measures these.
- The editor's readiness on production: the last measurement is 4.1 to 5.9 s after the shell for
  the window API (`docs/hosting.md` section 7, 2026-09-11), which is a number to improve and not
  to advertise. The closing sentence of 6.6 carries it as a target.
- "Turbo fast" as a bare adjective. The page shows the mechanisms and the measured numbers; the
  heading is "Why it is fast".

### 8.4 Production probes, 2026-09-13

Plain GET requests from this machine, no token, status and size only:

| Path             | Status | Bytes   | Note                                                                                                     |
| ---------------- | ------ | ------- | -------------------------------------------------------------------------------------------------------- |
| `/`              | 307    | 0       | `Location: https://turboslide.vercel.app/new`; time to first byte 106 ms                                 |
| `/home`          | 404    | 23,846  | the not found page; the route is free                                                                    |
| `/openapi.json`  | 200    | 236     | the placeholder stub (`"paths": {}`, "Run pnpm generate:contracts"); the committed file is 433,636 bytes |
| `/llms.txt`      | 200    | 302     | the placeholder stub                                                                                     |
| `/deck/gt-brand` | 200    | 381,416 | time to first byte 203 ms                                                                                |
| `/decks`         | 200    | 50,677  | time to first byte 404 ms                                                                                |

The stub is the state `docs/hosting.md` section 8 and `docs/HOSTED-STATUS.md` line 220 recorded on
2026-09-11 and it is unchanged: `apps/studio/src/server/contracts.ts` reads
`packages/agent/generated` under `repoRoot()`, which is the overlay in a function, and the
`packages` server asset group in `vite.deploy.config.ts` does not include `agent/generated`. The
fix those documents name is to bundle the generated files as imports. Until it lands the agent
section links the committed files on GitHub and the footer's OpenAPI link does the same.

## 9. Numbers the baseline report supplies

The page has four placeholders. The baseline report of this round (directive (a)) owns them; the
page shows a number only when that report has measured it on production.

| Placeholder                                 | What to measure                                                                                                                             | Where it appears                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `[baseline: /home to /new, warm]`           | Time from the click on New Presentation to the editor's first paint and to `turboslide:studio-api-ready`, with the route preloaded by hover | 6.6 "Routes load before the click" |
| `[baseline: /home to /deck/gt-brand, warm]` | Time from the click on Open the GT Deck to the viewer's first slide painted                                                                 | 6.6 "Routes load before the click" |
| `[baseline: /new ready]`                    | The editor's readiness after the shell on production, the number that replaces 4.1 to 5.9 s                                                 | 6.6 closing sentence               |
| `[baseline: slide to slide]`                | Filmstrip click to the stage showing the next slide, in the editor and in the viewer                                                        | optional ninth row of 6.6          |

If the baseline report also measures the hosted `/` and `/decks` times, the 8.1 numbers from
2026-09-11 should be replaced by its values, which are newer.

## 10. Routing and product notes for the builder

- Route file `apps/studio/src/routes/home.tsx`, path `/home`, server rendered (the page is static
  text and pictures; nothing on it needs `ssr: false`). `/` stays a 307 to `/new` (parity SPEC
  6.1, Kevin's directive that the root lands on a new slide). Whether the title row's GT mark,
  which links to `/decks` today (parity SPEC 1.1), should link to `/home` is Kevin's decision
  (section 11).
- `/home` is indexable and stays out of `NOINDEX_ROUTES` in `__root.tsx`. Its `head` sets the
  title, the description of 6.10 and the Open Graph tags; the root route sets none today.
- The page imports the chrome tokens through the root route like every other route and uses
  `--pt-` tokens, Inter and the one pixel line law (`packages/chrome/src/tokens.css`; SPEC 2.2).
  Plain CSS, one file per component (AGENTS.md).
- The pictures are `docs/readme/*.jpg` today. They must be copied into the studio's public assets
  or served through a route; a page cannot read `docs/`. The design-4 report decides the frame.
- Every button and link on the page carries the Tooltip primitive as every control in the shell
  does, or the tooltip audit (`scripts/tooltip-audit.mjs`) must exclude the page; the audit walks
  the built client's pages.
- `scripts/hosted-smoke.mjs` should gain a `/home` row (200, the hero sentence present) so a
  deploy that loses the page is caught.
- The theme boot script (`THEME_BOOT_SCRIPT`) defaults to dark; the hero's picture swaps between
  01 and 13 by `data-theme`.
- The agent section's HTTP example uses `deck.info`, whose input is the empty object
  (`packages/schema/src/actions.ts` line 470); `slide new --layout split` is the layout id the
  README uses; `thesis` is a slide id of the GT deck.
- `landing.spec.ts` asserts the `/` redirect and the fresh presentation; a `home.spec.ts` for the
  page's links and its two theme pictures is one more spec for check step 21.

## 11. Decisions for Kevin

1. The second hero button opens the viewer (`/deck/gt-brand`) and not the editor, because the
   production store is shared and has no accounts. Confirm, or accept that visitors edit the one
   GT deck.
2. The compare row keeps the rows where Turboslide has less (comments, co editing, PowerPoint
   import, transitions, ODP and SVG). Confirm that the page shows them.
3. The closing sentence of "Why it is fast" names what is still slow. Confirm, or drop it once the
   baseline report closes the targets.
4. The Rust sentence says where the crate runs and where it does not. Confirm, or fund a Linux
   build of the addon in the deploy so the sentence can say "on the server".
5. The footer's line "Google Slides is a product of Google LLC" and the affiliation sentence in
   6.8. Confirm the wording or ask counsel.
6. Whether the title row's GT mark should link to `/home` instead of `/decks`.
7. Whether `/openapi.json` and `/llms.txt` are fixed in this round (bundle the generated files as
   imports) so the page can link them on production.

## 12. Sources

Web pages, read 2026-09-13 through a fetch that returns a structured summary of the page:

- Google Slides product page, `https://workspace.google.com/products/slides/`: the hero, the tab
  strip, the seven feature bands, the customer quotes, the FAQ, the closing call to action, the
  footer groups (section 2).
- Google Workspace, "Create, view, or download a file", `https://support.google.com/docs/answer/49114`:
  read for the download format list; the summary reported that the page names "Choose a file type"
  without listing the formats, so the format list in 6.8 comes from R01 (below).
- Google Slides API overview, `https://developers.google.com/workspace/slides/api/guides/overview`:
  REST, `presentations.get`, `batchUpdate`, OAuth, Apps Script, an "MCP server" entry in the
  navigation (section 6.8, Automation).
- Vercel home page, `https://vercel.com/`: the hero, three value propositions with features in
  threes, three customer cases with numbers, the recently shipped cards, the closing call to action
  (section 3).
- Vercel AI page, `https://vercel.com/ai`: three feature cards, a three column getting started band,
  a five category security section, a code sample, two testimonials, the closing calls to action
  (section 3).
- Linear home page, `https://linear.app/`: the hero, four feature bands, the changelog band, three
  quotes and one number, six footer groups (section 3).
- Linear agents page, `https://linear.app/agents`: the hero, the attribute grouping, the agent
  cards, the developer section (section 3).
- Raycast home page, `https://www.raycast.com/`: the hero, the extensions band with category tabs,
  the AI, automation and capabilities bands, the professionals band, the developer section, the
  seven footer groups (section 3).

Research reports in this repository (public pages read 2026-09-11, cited as they cite them):

- R01 `docs/gslides-parity/research/01-menu-bar.md`: the File > Download formats (PowerPoint,
  ODP, PDF, plain text, JPEG, PNG, SVG), Import slides accepting .pptx, Make available offline,
  Comments, Apps Script, Transition.
- R03 `docs/gslides-parity/research/03-home-themes-layouts-io.md` and the Apps Script
  `PredefinedLayout` reference (`https://developers.google.com/apps-script/reference/slides/predefined-layout`):
  the eleven layouts, themes and templates, Drive.
- R04 `docs/gslides-parity/research/04-present-and-shortcuts.md`: Slideshow and Presenter view.
- R07 `docs/gslides-parity/research/07-sales-users.md`: the sales user, the top tasks, offline
  through the Docs Offline extension, the Salesforce figure
  (`https://www.salesforce.com/sales/state-of-sales/sales-statistics/`).
- R10 `docs/gslides-parity/research/10-identity-sharing-and-presence.md`: roles, the comments
  panel, live pointers.
- Research-3 report 07 `docs/gslides-parity/research-3/07-turboslide-inventory-3.md` (2026-09-13,
  at `61b16e4`): the routes and their gates, the shared store, the disabled comment rows.

Repository files read at `61b16e4` on 2026-09-13: those listed in section 1. Measured numbers are
quoted from `docs/M1-STATUS.md` (2026-09-10), `docs/M4-M5-STATUS.md` (2026-09-11),
`docs/native.md` (2026-09-10), `docs/pptx.md` (2026-09-11), `docs/hosting.md`,
`docs/hosting-chromium.md`, `docs/hosting-diagnosis.md` and `docs/HOSTED-STATUS.md` (2026-09-11),
and `docs/gslides-parity/VERIFICATION-2.md` (2026-09-12), each named at the point of use.

Production probes, 2026-09-13, from this machine with `curl`, no token: section 8.4.
