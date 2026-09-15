import { SITE } from '@turboslide/theme/brand/site';

import type { HomeFacts } from './facts';
import { FACTS_PATH, formatCount, formatPercent } from './facts';
import { HOME_META } from './home-meta';

/**
 * Every string of the /home page (gslides-parity SPEC-4 2.2, 0.20 to 0.26; R05 section 6
 * rewritten from the round three ship tree), in one module so `copy.test.ts` can lint them all:
 * sentence case headings without a trailing period, full sentences in body text, Title Case on
 * buttons alone, no em dash, no exclamation mark, no eyebrow, no "X, not Y" pair, no word from
 * `METAPHOR_WORDS`, none of the five words of 0.26 ("instant", "realtime", "edge", "lightweight",
 * "built on Rust"), and the default view words of the menu model kept out of every band a rep
 * reads (the two technical bands, the Automation row and the footer's agents group are the
 * exemptions, named in `DEFAULT_VIEW_EXEMPT`). A string that carries a count of the tree is a
 * function of `HomeFacts` (0.25: a literal count is a defect), and every number on the page has
 * a source line beside it (0.20): the file or the report and the date of the measurement.
 * "Today", "after" and "never" (PP section 4) are the tenses: the speed rows are written for the
 * tree the page ships from, so the Rust row ends with the TypeScript sentence; the preload row and
 * the closing sentence carry the verifier's post round production numbers of 2026-09-14
 * (VERIFICATION-4 section 5, the round four fixer round), which replaced the day 0 baseline per 0.26.
 */
export type Text = string | ((facts: HomeFacts) => string);

/** One control's tooltip (the Tooltip primitive's name and sentence). */
export type Tip = { name: string; doc: string };

export const REPOSITORY = SITE.repository;
export const PRODUCTION = SITE.productionOrigin;
const GITHUB_FILE = `${REPOSITORY}/blob/main`;

/** The five words of SPEC-4 0.26 that never appear, and the two phrases of R01 6.1 item 3. */
export const FORBIDDEN_WORDS: ReadonlyArray<string> = [
  'instant',
  'realtime',
  'edge',
  'lightweight',
  'built on Rust',
];
export const FORBIDDEN_PHRASES: ReadonlyArray<string> = [
  'Slides clone',
  'Google Slides alternative',
];

/**
 * The capitalised names the page's headings and titles may carry after their first word beside
 * `PROPER_NOUNS` (the sentence case lint takes a deck's extra nouns the same way): the products and
 * the technologies the copy names as written.
 */
export const HOME_PROPER_NOUNS: ReadonlyArray<string> = [
  'Google Slides',
  'Google',
  'PowerPoint',
  'Paper Shaders',
  'Rust',
  'Vercel',
  'GitHub',
  'Chromium',
  'Chrome',
  'Node',
  'WebAssembly',
  'TypeScript',
  'Kevin Liu',
  'Blob',
  'Apps Script',
  'Canva',
  'Drive',
  'Photos',
  'Gemini',
  'Meet',
  'Docs Offline',
  'Workspace',
  'OpenAPI',
  'Bayer',
  'Blue Marble',
  'Presenter',
  'Undo',
];

/**
 * The paths of `HOME_COPY` the default view words test leaves alone, with the reason: the two
 * technical bands name the transports and the files by their names (MCP, the revision a write
 * read, the native module), as Extensions > Agent access does in the menu model; the Automation
 * row of the comparison and the footer's agents group name the same transports; a `source` line
 * names a file; the head's description is `SITE.description`, the README's first sentence (B1's,
 * SPEC-4 1.6), which names the agent native editor. Everything else is read by a rep and stays
 * clean.
 */
export const DEFAULT_VIEW_EXEMPT: ReadonlyArray<string> = [
  'meta',
  'speed',
  'agents',
  'compare.rows.automation',
  'footer.groups.agents',
];

// ---------------------------------------------------------------------------------------------
// The head (2.1, 2.6)

/* the head's strings live in home-meta.ts so the route's `head()` does not pull this module into the entry chunk */
export { HOME_META } from './home-meta';

// ---------------------------------------------------------------------------------------------
// The navigation (2.2 item 1, 0.23)

export type NavLink = {
  id: string;
  label: string;
  /** an in tree route, an in page anchor or an external address */
  href: string;
  external?: boolean;
  tip: Tip;
};

export const NAV = {
  lockup: {
    word: 'Turboslide',
    tip: { name: 'Turboslide', doc: 'The product page.' } as Tip,
  },
  links: [
    {
      id: 'home.nav.decks',
      label: 'Your presentations',
      href: '/decks',
      tip: { name: 'Your presentations', doc: 'Every presentation on this Turboslide.' },
    },
    {
      id: 'home.nav.docs',
      label: 'Documentation',
      href: `${GITHUB_FILE}/docs/README.md`,
      external: true,
      tip: { name: 'Documentation', doc: 'The index of the documentation on GitHub.' },
    },
    {
      id: 'home.nav.agents',
      label: 'For agents',
      href: '#agents',
      tip: { name: 'For agents', doc: 'One command per transport and the write rule.' },
    },
    {
      id: 'home.nav.github',
      label: 'GitHub',
      href: REPOSITORY,
      external: true,
      tip: { name: 'GitHub', doc: 'The repository, under the MIT licence.' },
    },
  ] as ReadonlyArray<NavLink>,
  appearance: {
    label: 'Appearance',
    light: { label: 'Light', tip: { name: 'Light', doc: 'Switches to the light appearance.' } },
    dark: { label: 'Dark', tip: { name: 'Dark', doc: 'Switches to the dark appearance.' } },
  },
  newPresentation: {
    label: 'New Presentation',
    href: '/new',
    tip: { name: 'New Presentation', doc: 'Opens a fresh presentation; no account needed.' },
  },
} as const;

// ---------------------------------------------------------------------------------------------
// The hero (2.3, 0.21, 0.22)

export const HERO = {
  word: 'Turboslide',
  sentence:
    "A slides editor with Google Slides' menus, toolbar and shortcuts, a canvas on every slide, and a PowerPoint export that matches the screen pixel for pixel.",
  buttons: {
    newPresentation: {
      label: 'New Presentation',
      href: '/new',
      tip: {
        name: 'New Presentation',
        doc: 'Opens a fresh presentation; the first edit saves it.',
      },
    },
    openDeck: {
      label: 'Open the GT Deck',
      deckId: 'gt-brand',
      tip: { name: 'Open the GT Deck', doc: 'The 85 slide brand deck in the viewer.' },
    },
    github: {
      label: 'GitHub',
      href: REPOSITORY,
      tip: { name: 'GitHub', doc: 'The repository, under the MIT licence.' },
    },
  },
  facts:
    'No account needed to start. Free under the MIT licence, with the code on GitHub. Hosted at turboslide.vercel.app.',
  /** the material credit under the band (0.22), on the page's ground where no cell sits behind it */
  credit: 'Material: liquid metal, Paper Shaders, one frame through the two tone screen',
  /** the decorative twin's sentence, for the record; the element itself is aria-hidden (1.12) */
  twinLabel: 'One frame of a liquid metal material through the two tone screen.',
} as const;

// ---------------------------------------------------------------------------------------------
// The numbers strip (2.2 item 3, 0.20, 0.25)

export type Figure = {
  id: string;
  /** the figure as printed; null while the facts file is absent */
  figure: Text;
  line: string;
  source: string;
};

export const NUMBERS: ReadonlyArray<Figure> = [
  {
    id: 'actions',
    figure: (f) => formatCount(f.actions),
    line: 'actions in one table behind the click, the command line and the API',
    source: 'packages/schema/src/actions.ts',
  },
  {
    id: 'layouts',
    figure: (f) => formatCount(f.layouts),
    line: "layouts, Google's eleven first and the GT layouts after them",
    source: 'packages/schema/src/layouts.ts',
  },
  {
    id: 'shapes',
    figure: (f) => formatCount(f.shapePresets),
    line: 'shape presets drawn from the PowerPoint geometry',
    source: 'packages/schema/src/shapes/definitions.ts',
  },
  {
    id: 'mismatch',
    figure: (f) => formatPercent(f.mismatchPercent),
    line: 'worst page mismatch on the 170 page export of the GT deck',
    source: 'docs/pptx.md, 2026-09-11',
  },
  {
    id: 'materials',
    figure: (f) => formatCount(f.materials),
    line: 'shader materials with typed controls',
    source: 'packages/materials/src/catalog.ts',
  },
  {
    id: 'licence',
    figure: (f) => f.licence,
    line: 'licence, with the code on GitHub',
    source: 'LICENSE',
  },
];

// ---------------------------------------------------------------------------------------------
// The editor in one picture (2.2 item 4; R05 6.3)

export const EDITOR = {
  heading: "Google Slides' frame, on every slide a canvas",
  claims: [
    "The same menus, toolbar, filmstrip, speaker notes and right click menus, in Google's order, with Google's shortcuts. An item Turboslide lacks is in its place, disabled, with one sentence on what to do instead.",
    'Every object drags, resizes, rotates, groups and reorders. The first drag on a slide converts it to a canvas without moving a pixel, and one undo puts the layout back.',
    'One look: Inter, paper and ink, one pixel rules, a light and a dark appearance that the stage, the thumbnails, the slideshow and every download follow.',
  ],
} as const;

// ---------------------------------------------------------------------------------------------
// The shots (2.4, 0.24): the alt text of every README picture and the pipeline's frame

export type ShotName =
  | '01-new-presentation'
  | '02-file-menu'
  | '03-insert-menu'
  | '04-layout-grid'
  | '05-filmstrip-menu'
  | '06-canvas-rotation'
  | '07-canvas-snap-guides'
  | '08-format-options'
  | '09-download-dialog'
  | '10-decks-home'
  | '11-presenter-console'
  | '12-slideshow-dither'
  | '13-editor-light'
  | '14-book-view'
  | '15-grid-view'
  | 'hero-frame';

export const SHOT_ALT: Readonly<Record<ShotName, string>> = {
  '01-new-presentation':
    'The fresh Untitled presentation on the Title slide in the dark appearance: the title row, the menu bar, the toolbar, the filmstrip and the speaker notes pane.',
  '02-file-menu': 'The File menu open with its Download submenu.',
  '03-insert-menu': 'The Insert menu with the Chart submenu.',
  '04-layout-grid': "The layout grid with Google's eleven layouts and the GT layouts after them.",
  '05-filmstrip-menu': "The filmstrip's right click menu with Google's rows.",
  '06-canvas-rotation':
    'Rotation by the handle with the degree readout, beside a chart and a table.',
  '07-canvas-snap-guides': 'A group dragged into alignment with a snap guide.',
  '08-format-options': 'Format options on a rotated rectangle.',
  '09-download-dialog': 'The Download dialog with Perfect and Editable text.',
  '10-decks-home': 'The home page at /decks with the search field and the cards.',
  '11-presenter-console': 'Presenter view with the timer, the notes and the previews.',
  '12-slideshow-dither':
    'The Blue Marble slide of the GT deck in the slideshow, a two tone dither with its plate.',
  '13-editor-light': 'The editor on a content slide in the light appearance.',
  '14-book-view': "The viewer's book view of the GT brand deck.",
  '15-grid-view': "The viewer's grid view of the GT deck's Brand section.",
  'hero-frame': 'The liquid metal material, one continuous frame before the two tone screen.',
};

// ---------------------------------------------------------------------------------------------
// What it does (2.2 item 5; R05 6.4 with the two round three cards rewritten from the README)

export type CardIcon =
  'bars-3-bottom-left' | 'table-cells' | 'check-badge' | 'presentation-chart-bar';

export type Card = {
  id: string;
  title: string;
  copy: Text;
  /** the card's picture, or none for an icon card */
  shot?: ShotName;
  /** a second picture beside the first (0.24: the shell card pairs 02 with 05, the viewer card 14 with 15) */
  pair?: ShotName;
  /** a Heroicon from the theme sprite (0.19) */
  icon?: CardIcon;
};

export const CARDS = {
  heading: 'What it does',
  lead: 'Twelve groups of features, in the order the README lists them. Every card is one thing the editor does today.',
  cards: [
    {
      id: 'shell',
      title: 'The Google Slides shell',
      copy: 'Ten menus, a toolbar whose tail follows the selection, the filmstrip, the notes pane, the right panels and the bottom bar. Search the menus finds every item by name, and every control carries its name and its key.',
      shot: '02-file-menu',
      pair: '05-filmstrip-menu',
    },
    {
      id: 'canvas',
      title: 'The canvas',
      copy: 'Drag, resize and rotate with live readouts. Snap guides, rulers, guides, zoom to 1600 percent, marquee selection, z order, groups, crop mode and connectors that follow the shape they are attached to.',
      shot: '07-canvas-snap-guides',
    },
    {
      id: 'layouts',
      title: 'Layouts and themes',
      copy: (f) =>
        `${formatCount(f.layouts)} layouts in one grid: Google's eleven and the ${formatCount(f.layouts - 11)} GT layouts after them. Apply layout keeps the content and never refuses. A new presentation opens on a Title slide with four starter pictures already in it.`,
      shot: '04-layout-grid',
    },
    {
      id: 'text',
      title: 'Text',
      copy: 'Bold, italic, underline, strikethrough, super and subscript, colour and highlight on a range. Lists with nine bullet and six numbering presets, line spacing, columns, indents, alignment, autofit, find and replace across the deck, links to a URL or a slide.',
      icon: 'bars-3-bottom-left',
    },
    {
      id: 'objects',
      title: 'Objects, pictures and materials',
      copy: (f) =>
        `${formatCount(f.shapePresets)} shapes in Google's four categories, seven line kinds with ten end decorations, fills, borders, dashes and shadows. Pictures upload, crop, mask to any shape and adjust. ${formatCount(f.materials)} shader materials play live on the stage, and a photograph becomes a two tone dither in one step.`,
      shot: '08-format-options',
    },
    {
      id: 'tables',
      title: 'Tables',
      copy: 'A hover grid up to 20 by 20. Insert and delete rows and columns, merge and unmerge, distribute, header rows, cell fills and borders. Tab moves between cells. The editable export writes a real PowerPoint table.',
      icon: 'table-cells',
    },
    {
      id: 'charts',
      title: 'Charts and diagrams',
      copy: 'Bar, column, line and pie charts with a data grid in the panel, up to 12 categories and 6 series. Six diagram templates in three styles insert as a group you edit like any other.',
      shot: '03-insert-menu',
      icon: 'presentation-chart-bar',
    },
    {
      id: 'exports',
      title: 'Exports',
      copy: 'Perfect PowerPoint by default: each page is the rendered slide over searchable text, checked against the screen before the file is written. Editable text PowerPoint, PDF, a single web page, plain text, JPEG and PNG beside it.',
      shot: '09-download-dialog',
    },
    {
      id: 'present',
      title: 'Present',
      copy: "Slideshow from the current slide, Presenter view in a second window with the timer, the notes and the next slide, Google's presenting keys, a laser pointer, and a present link you can send.",
      shot: '11-presenter-console',
    },
    {
      id: 'viewer',
      title: 'The viewer and sharing',
      copy: 'A read only link with Slide, Grid and Book views, an embed for any site, and a Share dialog with people by email and a role, Anyone with the link, and Publish to the web. Skipped slides and speaker notes stay out of the view and present links.',
      shot: '14-book-view',
      pair: '15-grid-view',
    },
    {
      id: 'files',
      title: 'Home and files',
      copy: 'Recent presentations as cards with thumbnails, Make a copy, Rename, Move to trash with Undo, Import slides from another presentation, Version history by author with named versions, comments with an inbox, and a bundle you can download and upload.',
      shot: '10-decks-home',
    },
    {
      id: 'quality',
      title: 'Quality gates',
      copy: (f) =>
        `Every slide is checked for overflow, contrast, type sizes and copy in both appearances, with Fix for the mechanical findings. A ${formatCount(f.checkSteps)} step acceptance chain and a ${formatCount(f.parityRows)} row parity audit pass before anything ships.`,
      icon: 'check-badge',
    },
  ] as ReadonlyArray<Card>,
} as const;

// ---------------------------------------------------------------------------------------------
// Dithers and shaders, from the deck to the interface (2.2 item 6; R05 6.5)

export const DITHERS = {
  heading: 'Dithers and shaders, from the deck to the interface',
  lead: 'The GT brand deck draws its photographs as two tone dithers: an eight by eight Bayer screen at two pixel cells, cut from a toned and cropped picture, with a light version that is the exact inverse of the dark one.',
  claims: [
    'The same pipeline handles any photograph or a frozen frame of a shader material, reports how clear the plate stays, and is written three times with one arithmetic: in TypeScript, in a Rust addon for Node and in a Rust module for the browser, with a test that proves the three light the same cells.',
    (f: HomeFacts) =>
      `${formatCount(f.materials)} Paper Shaders materials play live on the stage with typed controls and the GT colour presets, and every one is captured as frozen frames for the thumbnails and the exports.`,
  ] as ReadonlyArray<Text>,
  caption:
    'The Blue Marble slide of the GT deck in the slideshow, a two tone dither with its plate.',
  pipeline: {
    frame: {
      caption:
        '1. The material, one frame of its clock before the screen, captured from the shader.',
    },
    twin: {
      caption:
        '2. The hero frame through the two tone screen at one cell per two pixels: black point 160, white point 250, gamma 1.5.',
      label: 'The hero frame as a two tone dither, shown at one cell per two pixels.',
    },
    mark: {
      caption:
        '3. The mark is the same construction: a slide, a plate cut from the picture, the screen filling the rest.',
    },
  },
  specimens: {
    heading: 'Where the identity appears in the product',
    empty: {
      title: 'No presentations yet',
      sentence: 'Start one from the strip above.',
      caption:
        'The empty state: a crop of the figure frame in a hairline frame, a title, one sentence and one action.',
    },
    curtain: {
      caption:
        "The loading curtain: the figure where the sheet will be and the deck's ramp as the progress texture.",
      label: 'The loading curtain with its progress ramp.',
    },
    chip: {
      caption:
        'A presence chip: the identity mark of a person in the room, here an anonymous label.',
      /** the anonymous principal the specimen renders; the label is computed from it */
      principalId: 'anon_home_specimen',
    },
  },
} as const;

// ---------------------------------------------------------------------------------------------
// Why it is fast (2.2 item 7; 0.20, 0.26; PP section 4 for the tense)

export type SpeedRow = {
  id: string;
  title: string;
  body: string;
  figure: Text;
  source: string;
};

/**
 * The measured numbers the speed band quotes, each with the document that measured it and its
 * date, so `copy.test.ts` can cross check the verifier's rows against the JSON under
 * `docs/gslides-parity/verification-4/` (SPEC-4 0.25: the measured numbers come from that JSON
 * with the date). A number from a document with no JSON names the document alone.
 */
export const MEASURED = {
  renders: {
    text: '170 renders of the GT deck in 18.3 s in the acceptance chain; a slide is ready in 6 ms at the median',
    source:
      'packages/render/src/slide.ts; docs/gslides-parity/VERIFICATION-2.md step 10, 2026-09-12; docs/M1-STATUS.md render records, 2026-09-10',
  },
  rust: {
    text: '20 ms for a 1600 by 900 screen through the addon, 23 ms through wasm, 52 ms in TypeScript',
    source: 'crates/turboslide-native; docs/native.md costs table, 2026-09-10, Apple M5 Max',
  },
  export: {
    text: 'worst decoded mismatch 0.003 percent over 170 pages; 15.5 MiB per appearance',
    source:
      'packages/export/src/pptx/page-raster.ts; docs/pptx.md, 2026-09-11; docs/hosting.md section 7, 2026-09-11',
  },
  batches: {
    text: 'the 85 slide GT deck in 188 to 203 s as one call on the hosted studio; two batches of 60 and 25 on the batched path',
    source:
      'packages/export/src/batch/plan.ts; apps/studio/src/server/export-batch.ts; docs/hosting.md section 7, 2026-09-11',
  },
  compute: {
    text: '800 s and 3,009 MB on /api/export, /api/render and the server functions',
    source: 'apps/studio/vite.deploy.config.ts; docs/hosting.md section 6',
  },
  preload: {
    /** verification-4/perf-budget-production-2026-09-14.json `decks->edit` 167.5 in page, `edit->decks` 15.8 in page (medians of three, warm) */
    decksToEditGtBrandMs: 168,
    editToDecksMs: 16,
    text: '168 ms from the click on a card to a ready editor for the 85 slide GT deck and 16 ms from the title row mark back to the list, warm, on production',
    source:
      'apps/studio/src/router.tsx; docs/gslides-parity/VERIFICATION-4.md section 5.2, 2026-09-14',
  },
  immutable: {
    /** verification-4/perf-budget-production-2026-09-14.json `twins` 0 of 16 re-fetched, `cdn` HIT on 7 of 7 paths */
    twinsRefetched: [0, 16] as const,
    text: "0 of 16 pictures of the GT deck fetched again on a second visit within the hour; the icon set, the card and /home answered from the CDN's cache on their second request",
    source:
      'packages/store/src/snapshots.ts; apps/studio/src/server/thumbs.ts; docs/gslides-parity/VERIFICATION-4.md sections 5.1 and 5.2, 2026-09-14',
  },
  closing: {
    /** verification-4/perf-budget-production-2026-09-14.json: /decks cold first byte 409 at the median with 3,782 in the worst of three samples; /deck/gt-brand cold ready 1,067; /new cold ready 570; js decoded 968,671 to 2,257,712 bytes per route */
    decksTtfbColdMs: 409,
    decksTtfbWorstMs: 3782,
    deckReadyColdMs: 1067,
    newReadyColdMs: 570,
    jsDecodedKb: [946, 2205] as const,
    source:
      'docs/gslides-parity/VERIFICATION-4.md section 5; docs/gslides-parity/verification-4/perf-budget-production-2026-09-14.json, 2026-09-14',
  },
} as const;

export const SPEED = {
  heading: 'Why it is fast',
  lead: 'Most of the speed is structural: one renderer, contracts generated ahead of time, immutable documents and caches, and export work that runs where the browser already is. The numbers below are measured, and each one names the file that produces it and the date it was read.',
  rows: [
    {
      id: 'renderer',
      title: 'One renderer',
      body: "One function turns a slide into the same HTML and CSS for the editor, the viewer, the embed, the CLI's screenshots and the exporters. A render at one revision is the same pixels on every surface, so nothing is drawn twice and nothing has to be reconciled.",
      figure: MEASURED.renders.text,
      source: MEASURED.renders.source,
    },
    {
      id: 'contracts',
      title: 'Contracts generated once',
      body: 'Every operation is one entry in one table. The CLI parsers, the MCP tools, the HTTP contract, the window API list and the skills are generated from it and committed, so a stale copy fails the check before anything ships.',
      figure: (f) =>
        `${formatCount(f.actions)} actions, ${formatCount(f.mcpTools)} MCP tools, ${formatCount(f.httpPaths)} HTTP paths, from one file`,
      source: `packages/schema/src/actions.ts; packages/agent/generated; ${FACTS_PATH}`,
    },
    {
      id: 'rust',
      title: 'Rust where the arithmetic must not drift',
      body: 'The dither and image comparison pipeline is a Rust crate compiled to a Node addon and to WebAssembly, with a TypeScript copy of the same arithmetic where neither is built. The crate exists so that a dither approved in the browser and one produced on a server light the same cells; where the addon is built it also cuts a screen in less than half the time. The hosted studio runs the TypeScript stages today.',
      figure: MEASURED.rust.text,
      source: MEASURED.rust.source,
    },
    {
      id: 'export',
      title: 'The export is a screenshot',
      body: 'Perfect PowerPoint rasterises each page in Chromium at twice the sheet size, stores it in the smallest encoding that decodes within budget, then decodes it again and compares it with the shot before the file is written. The page is the screen; there is no second layout engine to disagree with it.',
      figure: MEASURED.export.text,
      source: MEASURED.export.source,
    },
    {
      id: 'batches',
      title: 'Export in batches',
      body: 'On the hosted studio a long deck exports in batches of sixty slides, each one function call, with a progress sentence and a merge at the end. A failed batch is retried on its own; the file is never started over.',
      figure: MEASURED.batches.text,
      source: MEASURED.batches.source,
    },
    {
      id: 'compute',
      title: 'Compute that lasts',
      body: 'The export and render routes run on Vercel functions with an 800 second budget and 3,009 MB of memory, on fluid compute. Several requests to one deployment share one warm process, so a render never waits for a cold start when the process is already up.',
      figure: MEASURED.compute.text,
      source: MEASURED.compute.source,
    },
    {
      id: 'preload',
      title: 'Routes load before the click',
      body: "The router preloads a route's code and data as soon as the pointer reaches its link, so a presentation opened from the list is loading before the click lands. The title row's mark is a link of the same document, so leaving the editor for the list keeps the page and its code.",
      figure: MEASURED.preload.text,
      source: MEASURED.preload.source,
    },
    {
      id: 'immutable',
      title: 'Immutable documents and caches',
      body: "Every committed write stores the whole document under the hash of its bytes, so a reader proves it has the current document from one header. Thumbnails named by their version are cached for a year, and the GT deck's pictures are static files that the CDN keeps for a day and the browser for an hour, so a second visit fetches none of them.",
      figure: MEASURED.immutable.text,
      source: MEASURED.immutable.source,
    },
  ] as ReadonlyArray<SpeedRow>,
  closing: {
    text: `What is still slow is measured too: the list at /decks answers its first byte in ${MEASURED.closing.decksTtfbColdMs} ms at the median of a cold visit and in ${(MEASURED.closing.decksTtfbWorstMs / 1000).toFixed(1)} s in its worst sample; the viewer of the 85 slide GT deck is ready ${(MEASURED.closing.deckReadyColdMs / 1000).toFixed(2)} s after a cold load; the editor is ready ${(MEASURED.closing.newReadyColdMs / 1000).toFixed(2)} s after a cold load of /new; every route loads ${MEASURED.closing.jsDecodedKb[0]} to ${formatCount(MEASURED.closing.jsDecodedKb[1])} KB of JavaScript; and one instance renders one slide at a time. Those are the numbers the current work is measured against.`,
    source: MEASURED.closing.source,
  },
} as const;

// ---------------------------------------------------------------------------------------------
// For agents (2.2 item 8; R05 6.7)

export type AgentRow = {
  id: string;
  label: string;
  sentence: string;
  /** the command box, one line per entry */
  command: ReadonlyArray<string>;
  /** where the row points, when the command names a file */
  href?: string;
};

export const AGENTS = {
  anchor: 'agents',
  heading: 'For agents',
  lead: (f: HomeFacts) =>
    `Every capability of the editor is an action. The same ${formatCount(f.actions)} actions run on the CLI, over MCP, over HTTP and inside an open page, through one validator, and every write names the revision it read.`,
  rows: [
    {
      id: 'cli',
      label: 'CLI',
      sentence:
        'Edits a decks folder with no browser page; --json gives machine output and --base-revision names the revision the write read.',
      command: [
        'pnpm exec turboslide slide new --layout split --after title --deck decks/gt-brand --json',
      ],
    },
    {
      id: 'mcp',
      label: 'MCP',
      sentence:
        'One deck_<action> tool per action over stdio or streamable HTTP, with render tools that return PNGs and the deck_review prompt for the judge lenses.',
      command: [
        'pnpm exec turboslide mcp --deck decks/gt-brand',
        `POST ${PRODUCTION}/mcp?deck=gt-brand   (with a bearer token)`,
      ],
    },
    {
      id: 'http',
      label: 'HTTP',
      sentence:
        'One JSON object in, the normalized result and its findings out; a stale revision is 409 with the current document.',
      command: [
        `curl -X POST '${PRODUCTION}/api/actions/deck.info?deck=gt-brand' \\`,
        "  -H 'authorization: Bearer $TURBOSLIDE_TOKEN' -H 'content-type: application/json' -d '{}'",
      ],
    },
    {
      id: 'window',
      label: 'Window API',
      sentence:
        'Inside an open editor, viewer or presenter page, the same actions run through the same dispatcher a click uses.',
      command: ["window.turboslide.studio.invoke('view.goto', { slideId: 'thesis' })"],
    },
    {
      id: 'openapi',
      label: 'OpenAPI',
      sentence:
        'The OpenAPI 3.1 document, the manifest and the llms guides are generated from the action table and committed; the hosted studio answers a stub for them until the generated files ship inside its bundle.',
      command: ['packages/agent/generated/openapi.json   (the committed file, on GitHub)'],
      href: `${GITHUB_FILE}/packages/agent/generated/openapi.json`,
    },
    {
      id: 'skills',
      label: 'Skills',
      sentence:
        'Four skills with generated reference tables: discovery and the write protocol, writing slides in the grammar, driving the live page, verifying.',
      command: [
        'skills/turboslide-api/SKILL.md   skills/turboslide-create/SKILL.md',
        'skills/turboslide-studio/SKILL.md   skills/turboslide-verify/SKILL.md',
      ],
      href: `${GITHUB_FILE}/skills/turboslide-api/SKILL.md`,
    },
  ] as ReadonlyArray<AgentRow>,
  closing:
    "The hosted agent routes accept a bearer token set by the deployment's owner; a checkout serves them to localhost without one. A deck moves between a checkout and the hosted studio with turboslide deck push and deck pull.",
  push: `pnpm exec turboslide deck push gt-brand --to ${PRODUCTION}`,
} as const;

// ---------------------------------------------------------------------------------------------
// Compared with Google Slides (2.2 item 9; R05 6.8 with four rows rewritten for the ship tree)

export type CompareRow = { id: string; row: string; google: string; turboslide: Text };

export const COMPARE = {
  heading: 'Compared with Google Slides',
  lead: "Turboslide follows Google Slides' structure and behaviours on purpose, so the differences are the point. Google Slides is a product of Google LLC; Turboslide is not affiliated with Google.",
  columns: { google: 'Google Slides', turboslide: 'Turboslide' },
  rows: [
    {
      id: 'account',
      row: 'Account',
      google:
        "A Google account; the product page's calls to action are Sign in and Try Slides for work.",
      turboslide:
        'Optional. Anonymous by default with a label such as Wax 613, and sign in by email code or magic link when your work should follow you.',
    },
    {
      id: 'file',
      row: 'Where the file lives',
      google: 'Google Drive.',
      turboslide:
        'A folder in a checkout, or a Vercel Blob store on the hosted studio, with one immutable copy per saved version.',
    },
    {
      id: 'together',
      row: 'Editing together',
      google: 'Live co editing with pointers, comments, assignments and a comments panel.',
      turboslide:
        'Several people edit one presentation at once, with live carets and pointers, comments with replies and assignments, a roster in the title row and version history by author.',
    },
    {
      id: 'export',
      row: 'Export',
      google: 'PowerPoint, ODP, PDF, plain text, JPEG, PNG and SVG of the current slide.',
      turboslide:
        'PowerPoint in two modes, one pixel identical to the screen with a report; PDF, one file web page, plain text, JPEG, PNG and the Turboslide bundle. No ODP or SVG.',
    },
    {
      id: 'import',
      row: 'Import',
      google: 'PowerPoint and Canva files; Import slides from another presentation.',
      turboslide:
        'Import slides from a presentation on this studio; open a Turboslide bundle. No PowerPoint import yet.',
    },
    {
      id: 'automation',
      row: 'Automation',
      google:
        'A REST API with presentations.get and batchUpdate, Apps Script and add-ons; the developer site lists an MCP server.',
      turboslide: (f: HomeFacts) =>
        `${formatCount(f.actions)} actions on the CLI, MCP, HTTP and the window API, generated from one table with an OpenAPI document and four skills.`,
    },
    {
      id: 'layouts',
      row: 'Layouts and themes',
      google: 'Many themes and templates; eleven predefined layouts per theme.',
      turboslide: (f: HomeFacts) =>
        `One theme, gt-ink-paper, with Google's eleven layouts and ${formatCount(f.layouts - 11)} GT layouts.`,
    },
    {
      id: 'pictures',
      row: 'Pictures',
      google: 'Stock and web images, Drive and Photos, GIFs and stickers, Gemini image generation.',
      turboslide: (f: HomeFacts) =>
        `Upload, URL or this presentation; crop, mask, adjust; two tone dithers and ${formatCount(f.materials)} shader materials.`,
    },
    {
      id: 'transitions',
      row: 'Transitions',
      google: 'Slide transitions and object animations.',
      turboslide: 'None; the Transition item is present and disabled with a sentence.',
    },
    {
      id: 'presenting',
      row: 'Presenting',
      google: 'Slideshow, Presenter view, present from Meet, recording.',
      turboslide: "Slideshow, Presenter view in a second window, Google's keys, a present link.",
    },
    {
      id: 'offline',
      row: 'Offline',
      google: 'With the Docs Offline extension in Chrome or in a browser built on Chromium.',
      turboslide: 'The slideshow keeps going after load; the editor needs the server.',
    },
    {
      id: 'licence',
      row: 'Licence and hosting',
      google: 'Part of Google Workspace.',
      turboslide: 'MIT; start it from a checkout or deploy it to Vercel.',
    },
  ] as ReadonlyArray<CompareRow>,
} as const;

// ---------------------------------------------------------------------------------------------
// The footer (2.2 item 10; R05 6.9)

export type FooterLink = {
  id: string;
  label: string;
  href: string;
  external?: boolean;
  tip: Tip;
};

export type FooterGroup = { id: string; heading: string; links: ReadonlyArray<FooterLink> };

const doc = (label: string, doc: string): Tip => ({ name: label, doc });

export const FOOTER = {
  groups: [
    {
      id: 'studio',
      heading: 'Studio',
      links: [
        {
          id: 'home.foot.new',
          label: 'New presentation',
          href: '/new',
          tip: doc('New presentation', 'Opens a fresh presentation.'),
        },
        {
          id: 'home.foot.decks',
          label: 'Your presentations',
          href: '/decks',
          tip: doc('Your presentations', 'Every presentation on this Turboslide.'),
        },
        {
          id: 'home.foot.deck',
          label: 'The GT deck',
          href: '/deck/gt-brand',
          tip: doc('The GT deck', 'The 85 slide brand deck in the viewer.'),
        },
        {
          id: 'home.foot.present',
          label: 'Present the GT deck',
          href: '/deck/gt-brand?present=1',
          tip: doc('Present the GT deck', 'The brand deck as a slideshow.'),
        },
        {
          id: 'home.foot.trash',
          label: 'Trash',
          href: '/decks/trash',
          tip: doc('Trash', 'The presentations moved to the trash.'),
        },
      ],
    },
    {
      id: 'docs',
      heading: 'Documentation',
      links: [
        {
          id: 'home.foot.docs',
          label: 'The documentation index',
          href: `${GITHUB_FILE}/docs/README.md`,
          external: true,
          tip: doc('The documentation index', 'Every document of the repository, on GitHub.'),
        },
        {
          id: 'home.foot.spec',
          label: 'The specification',
          href: `${GITHUB_FILE}/docs/spec/SPEC.md`,
          external: true,
          tip: doc('The specification', 'What Turboslide is, section by section.'),
        },
        {
          id: 'home.foot.parity',
          label: 'Google Slides parity',
          href: `${GITHUB_FILE}/docs/gslides-parity/SPEC.md`,
          external: true,
          tip: doc('Google Slides parity', 'The behaviours mimicked and the rows that differ.'),
        },
        {
          id: 'home.foot.grammar',
          label: 'The slide rules',
          href: `${GITHUB_FILE}/docs/grammar.md`,
          external: true,
          tip: doc('The slide rules', 'The rules every slide is checked against.'),
        },
        {
          id: 'home.foot.pptx',
          label: 'PowerPoint export',
          href: `${GITHUB_FILE}/docs/pptx.md`,
          external: true,
          tip: doc('PowerPoint export', 'How the two export modes are built and checked.'),
        },
        {
          id: 'home.foot.hosting',
          label: 'Hosting',
          href: `${GITHUB_FILE}/docs/hosting.md`,
          external: true,
          tip: doc('Hosting', 'The stores, the deploy configuration and the measured numbers.'),
        },
        {
          id: 'home.foot.native',
          label: 'The Rust module',
          href: `${GITHUB_FILE}/docs/native.md`,
          external: true,
          tip: doc('The Rust module', 'The image pipeline compiled for Node and the browser.'),
        },
        {
          id: 'home.foot.rules',
          label: 'Rules for the repository',
          href: `${GITHUB_FILE}/AGENTS.md`,
          external: true,
          tip: doc('Rules for the repository', 'The contract every contributor works under.'),
        },
      ],
    },
    {
      id: 'agents',
      heading: 'Agents',
      links: [
        {
          id: 'home.foot.manifest',
          label: 'Manifest',
          href: '/api/agent',
          external: true,
          tip: doc('Manifest', 'The agent manifest of this deployment, as JSON.'),
        },
        {
          id: 'home.foot.openapi',
          label: 'OpenAPI',
          href: `${GITHUB_FILE}/packages/agent/generated/openapi.json`,
          external: true,
          tip: doc('OpenAPI', 'The committed OpenAPI 3.1 document, on GitHub.'),
        },
        {
          id: 'home.foot.llms',
          label: 'llms.txt',
          href: `${GITHUB_FILE}/packages/agent/generated/llms.txt`,
          external: true,
          tip: doc('llms.txt', 'The committed agent guide, on GitHub.'),
        },
        {
          id: 'home.foot.mcp',
          label: 'MCP',
          href: `${GITHUB_FILE}/skills/turboslide-api/SKILL.md`,
          external: true,
          tip: doc('MCP', 'How to connect over stdio or streamable HTTP.'),
        },
        {
          id: 'home.foot.skill-api',
          label: 'turboslide-api',
          href: `${GITHUB_FILE}/skills/turboslide-api/SKILL.md`,
          external: true,
          tip: doc('turboslide-api', 'Discovery and the write protocol.'),
        },
        {
          id: 'home.foot.skill-create',
          label: 'turboslide-create',
          href: `${GITHUB_FILE}/skills/turboslide-create/SKILL.md`,
          external: true,
          tip: doc('turboslide-create', 'Writing slides in the grammar.'),
        },
        {
          id: 'home.foot.skill-studio',
          label: 'turboslide-studio',
          href: `${GITHUB_FILE}/skills/turboslide-studio/SKILL.md`,
          external: true,
          tip: doc('turboslide-studio', 'Driving the live page.'),
        },
        {
          id: 'home.foot.skill-verify',
          label: 'turboslide-verify',
          href: `${GITHUB_FILE}/skills/turboslide-verify/SKILL.md`,
          external: true,
          tip: doc('turboslide-verify', 'Evidence, judging and completion rules.'),
        },
      ],
    },
    {
      id: 'licence',
      heading: 'Licence',
      links: [
        {
          id: 'home.foot.licence',
          label: 'MIT licence, copyright 2026 Kevin Liu',
          href: `${GITHUB_FILE}/LICENSE`,
          external: true,
          tip: doc('MIT licence', 'The licence text, on GitHub.'),
        },
        {
          id: 'home.foot.notices',
          label: 'Third party notices',
          href: `${GITHUB_FILE}/THIRD_PARTY_NOTICES.md`,
          external: true,
          tip: doc(
            'Third party notices',
            'Paper Shaders, Heroicons and Inter, with their licences.',
          ),
        },
        {
          id: 'home.foot.github',
          label: 'GitHub',
          href: REPOSITORY,
          external: true,
          tip: doc('GitHub', 'The repository.'),
        },
      ],
    },
  ] as ReadonlyArray<FooterGroup>,
  closing:
    "Turboslide is General Translation's slides editor. Google Slides is a product of Google LLC.",
  lockupTip: { name: 'Turboslide', doc: 'The top of this page.' } as Tip,
} as const;

/** Every section, for the tests that walk the strings. */
export const HOME_COPY = {
  meta: HOME_META,
  nav: NAV,
  hero: HERO,
  numbers: NUMBERS,
  editor: EDITOR,
  shots: SHOT_ALT,
  cards: CARDS,
  dithers: DITHERS,
  speed: SPEED,
  agents: AGENTS,
  compare: COMPARE,
  footer: FOOTER,
} as const;

/** A `Text` resolved for the page: the string, or the function applied to the facts, or null while they are absent. */
export function resolveText(text: Text, facts: HomeFacts | null): string | null {
  if (typeof text === 'string') return text;
  return facts === null ? null : text(facts);
}
