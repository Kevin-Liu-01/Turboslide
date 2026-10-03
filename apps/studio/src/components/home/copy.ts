import { SITE } from '@turboslide/theme/brand/site';

import type { HomeFacts } from './facts';
import { formatCount } from './facts';
import { HOME_META } from './home-meta';

/**
 * Every string of the /home landing (docs/LANDING.md section 2 and 2.17, the second pass), in one
 * module so `copy.test.ts` can lint them all: sentence case headings with no comma (the h1's list
 * comma aside) and no trailing period, Title Case buttons and chips, every sentence under 20
 * words, no em dash, en dash, exclamation mark, semicolon or colon, no metaphor word and no "X,
 * not Y" pair, none of the forbidden words, phrases or report words, no file path, and the page
 * under 750 words at rest. A string that carries a count of the tree is a function of `HomeFacts`
 * (SPEC-4 0.25). Every key of section 2 is here from V1#8, so no lane waits on a string; a band's
 * words reach the page in the push that renders the band.
 *
 * Three kinds of text sit here outside the page's word count, under the same rules: slide content
 * the page draws (`SLIDES`), generated text (`CANVAS.log`, `HISTORY`, `ANNOUNCE`, the panel's
 * lines) and the product's own strings, which the Tailor band reads from @turboslide/chrome.
 */
export type Text = string | ((facts: HomeFacts) => string);

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
  'pixel for pixel',
];

/** The report words of POLISH.md 3.1 that never appear on the page. */
export const REPORT_WORDS: ReadonlyArray<string> = [
  'Advanced tools',
  'default view',
  'acceptance',
  'audit',
  'verification',
  'revision',
];

/**
 * The capitalised names the page's headings may carry after their first word beside
 * `PROPER_NOUNS`: the products the copy names as written.
 */
export const HOME_PROPER_NOUNS: ReadonlyArray<string> = [
  'Google Slides',
  'Google',
  'Google LLC',
  'PowerPoint',
  'PDF',
  'Vercel',
  'GitHub',
  'MIT',
];

/**
 * The copy paths the default view words rule of the menu model does not read (docs/LANDING.md
 * 2.17): the head, the hero's stage (the agent's terminal and its loop), the agents band (it
 * names the transports), the canvas band's generated command line, the two people band (it names
 * the editor link) and the features table (it names the CLI, MCP and HTTP surfaces).
 */
export const DEFAULT_VIEW_EXEMPT: ReadonlyArray<string> = [
  'meta',
  'hero.stage',
  'agents',
  'canvas.log',
  'people',
  'features',
];

export { HOME_META } from './home-meta';

// ---------------------------------------------------------------------------------------------
// The navigation (docs/LANDING.md 2.1)

export type NavLink = {
  id: string;
  label: string;
  href: string;
  external?: boolean;
};

export const NAV = {
  /** the first Tab stop, shown on focus; it moves focus to the hero */
  skip: 'Skip to content',
  lockup: { word: 'Turboslide', name: 'Turboslide' },
  links: [
    {
      id: 'home.nav.docs',
      label: 'Documentation',
      href: `${GITHUB_FILE}/docs/README.md`,
      external: true,
    },
  ] as ReadonlyArray<NavLink>,
  appearance: {
    label: 'Appearance',
    light: { label: 'Light' },
    dark: { label: 'Dark' },
  },
  /**
   * Pause Motion (docs/LANDING.md 2.1, 3.2): it reads Play Motion while pressed; its button lands
   * in V4#9 with its behaviour
   */
  motion: { pause: 'Pause Motion', play: 'Play Motion' },
  /** drawn for an anonymous visitor once the deployment answers that it offers a method (sign-in.tsx) */
  signIn: { label: 'Sign In' },
  newPresentation: { label: 'New Presentation', href: '/new' },
} as const;

// ---------------------------------------------------------------------------------------------
// The hero (docs/LANDING.md 2.2): the h1 as page text over the editor frame and the terminal

/** The h1 in its three locked lines; joined by spaces it is the sentence of decks.home.seller-lead. */
const H1_LINES = ['Build the pitch,', 'present it and', 'send the link'] as const;

/** The loop's four steps (docs/LANDING.md 2.2): each tab's label; its CLI words are run.generated.ts's. */
export type HeroStepId = 'restore' | 'new' | 'title' | 'rows';

export const HERO = {
  h1Lines: H1_LINES,
  heading: H1_LINES.join(' '),
  /**
   * The lead's first sentence, one true sentence per visit, each naming a band below: the
   * editor, the Tailor band, the export band (answer 9). The boot script sets the next each visit
   * before the first paint; the markup holds the first. At most 50 characters each.
   */
  visit: [
    'Turboslide is a slides editor in the browser.',
    'Turboslide puts one customer name on every slide.',
    'Turboslide downloads PDF and PowerPoint files.',
  ],
  /** the lead after its first sentence */
  lead: "It has Google Slides' menus and shortcuts. No account is needed.",
  buttons: {
    newPresentation: { label: 'New Presentation', href: '/new' },
    openDeck: { label: 'Open the Example Deck', deckId: 'gt-brand' },
  },
  undo: 'Undo',
  /** the editor frame and the agent's terminal (docs/LANDING.md 2.2 "Copy") */
  stage: {
    frameLabel: 'The editor, with this page as its deck',
    menus: ['File', 'Edit', 'View', 'Insert', 'Format', 'Slide', 'Arrange', 'Tools', 'Help'],
    slidesLabel: 'Slides',
    terminalLabel: "The agent's terminal",
    /** panel text: the terminal's head row */
    terminal: { folder: '~/onboarding', author: 'agent' },
    steps: [
      { id: 'restore', label: 'Restore' },
      { id: 'new', label: 'New Slide' },
      { id: 'title', label: 'Set the Title' },
      { id: 'rows', label: 'Set the Rows' },
    ] as ReadonlyArray<{ id: HeroStepId; label: string }>,
    stepsLabel: "The loop's four steps",
    /** the figure is the build's sum of the loop's schedule, rounded to the second */
    caption: (seconds: number): string =>
      `A staged loop of ${seconds} seconds, recorded from the CLI. Press a step to play it, or click the slide's title to move it.`,
  },
} as const;

/** Slide content the page draws beside the renders (integrator.md 2.1, 2.2): words of the slides. */
export const SLIDES = {
  heroCredit: 'Image: NASA, Reto Stöckli, 2007, public domain',
  heroFieldAlt: "The Blue Marble, NASA's photograph of the Earth",
  lighthouseAlt: 'Louisbourg lighthouse, a lighthouse on the Nova Scotia coast',
  fieldAlt: 'The opener field, a lit sphere printed in dots',
  patternAlt: "An animated pattern of dots in the theme's colors",
} as const;

// ---------------------------------------------------------------------------------------------
// The numbers row (docs/LANDING.md 2.3): still on purpose

export type NumberCell = {
  id: 'actions' | 'layouts' | 'patterns' | 'shapes';
  figure: (facts: HomeFacts) => string;
  sentence: string;
};

export const NUMBERS = {
  label: 'Turboslide in four numbers',
  cells: [
    {
      id: 'actions',
      figure: (f: HomeFacts) => `${formatCount(f.actions)} actions`,
      sentence: "Each is a named command in the editor's action table.",
    },
    {
      id: 'layouts',
      figure: (f: HomeFacts) => `${formatCount(f.layouts)} layouts`,
      sentence: 'A new slide starts from one of these layouts.',
    },
    {
      id: 'patterns',
      figure: (f: HomeFacts) => `${formatCount(f.materials)} patterns`,
      sentence: "Insert > Animated pattern draws one in the theme's colors.",
    },
    {
      id: 'shapes',
      figure: (f: HomeFacts) => `${formatCount(f.shapes)} shapes`,
      sentence: "Insert > Shape draws them from PowerPoint's preset definitions.",
    },
  ] as ReadonlyArray<NumberCell>,
} as const;

// ---------------------------------------------------------------------------------------------
// The bands (docs/LANDING.md 2.5 to 2.15)

/**
 * The Heroicons 20 solid of the page's key cells (DECK-GRAMMAR 40): the features table and
 * Version history's author cell, never before a heading, never sparkles or cursor-arrow-rays.
 */
export type SectionIconName =
  | 'bars-3'
  | 'pencil-square'
  | 'swatch'
  | 'chat-bubble-left-right'
  | 'clock'
  | 'user-group'
  | 'presentation-chart-bar'
  | 'arrow-down-tray'
  | 'cube'
  | 'command-line'
  | 'user-circle'
  | 'eye-slash';

export const MENUS = {
  id: 'menus',
  h2: "The menus are Google's",
  lead: "File, Edit, View, Insert, Format, Slide, Arrange, Tools and Help are in Google's order, with Google's shortcuts. The rows this page runs are in ink, and the others say what they do in the editor.",
  /** the status row at rest */
  statusRest: 'Open a menu and choose a row. Undo puts the deck back.',
  /**
   * a row the page does not run sets the status to this sentence and the row's own `doc` sentence
   * of the menu model (a product string, exempt from the page's colon and semicolon rules)
   */
  editorRow: (doc: string): string => `This row runs in the editor. ${doc}`,
  noRedo: 'This page has no redo.',
  /** the miniature's title row beside the deck's title */
  slides: (n: number): string => `${n} slides`,
  notesLabel: 'Speaker notes',
  /** the one key that lists the nine menus under 720 px */
  menusKey: 'Menus',
  searchLabel: 'Search the menus',
  searchPlaceholder: 'Search the menus',
  shortcutsTitle: 'Keyboard shortcuts',
  renameTitle: 'Rename',
  nameVersionTitle: 'Name current version',
  filmstripLabel: 'The nine slides',
  editorLabel: 'A miniature of the editor, with this page as its deck',
  /** generated: the status row's readout of the selected object, in tabular figures */
  readout: (role: string, x: number, y: number, deg: number): string =>
    `${role} · x ${Math.round(x)} · y ${Math.round(y)} · ${Math.round(deg)}°`,
} as const;

export const AGENTS = {
  id: 'agents',
  h2: 'Agents run the same actions',
  /** the figures are the CLI's commands and facts.json's MCP tools and HTTP paths, said here once */
  lead: (f: HomeFacts): string =>
    `The CLI takes ${formatCount(f.cliCommands)} of the editor's actions, the MCP server ${formatCount(f.mcpTools)} and the HTTP API ${formatCount(f.httpPaths)}. The commands below change the slide above them.`,
  /** the chips (V3#13): each reads its second label once its change is made */
  chips: {
    tailor: (name: string): string => `Tailor for ${name}`,
    turn: 'Turn the Title',
    straighten: 'Straighten the Title',
    row: 'Rewrite a Row',
    putBack: 'Put the Row Back',
    skip: 'Skip This Slide',
    unskip: 'Unskip This Slide',
  },
  chipsLabel: 'Commands for slide 5',
  chipsCaption: 'Each command and answer is recorded from the CLI. The ring marks what it changed.',
  run: {
    again: 'Run Again',
    step: (n: number): string => `Run Step ${n}`,
  },
  stepLabel: (n: number, total: number): string => `${n} of ${total}`,
  /** the figure is the build's sum of the three steps' scheduled lengths, rounded (run.generated.ts) */
  caption: (seconds: number): string =>
    `A staged run of three commands, ${seconds} seconds in all. The answers are recorded from the CLI.`,
  historyLabel: 'Version history',
  recorded: 'Recorded',
  author: { agent: 'Agent', you: 'You' },
  tabs: { cli: 'CLI', mcp: 'MCP', http: 'HTTP' },
  tabsLabel: 'Transport',
  panel: {
    prompt: '$ turboslide',
    placeholder: 'Type a command or help',
    inputLabel: 'A command for the CLI',
    refusal: (runs: number, total: number): string =>
      `This page runs ${runs} of the CLI's ${total} commands.`,
    /** panel text: the hero's terminal head row is HERO.stage.terminal; this is the console's */
    help: 'The commands this page runs',
    requestOnly: 'Request only. The CLI tab shows the recorded answer.',
    unclosedQuote: 'The line has an unclosed quote.',
    longName: 'This page takes a name of up to 24 characters.',
  },
} as const;

export const TAILOR = {
  id: 'tailor',
  h2: 'One name on every slide',
  lead: "Tools > Tailor for a customer puts one name in every slide's text and notes. Undo puts every name back.",
  placeholder: 'Customer name',
  /** the page's own answer to an empty Apply (docs/LANDING.md 2.5) */
  empty: 'Type a customer name first.',
  moveUp: 'Move Up',
  moveDown: 'Move Down',
  filmstripLabel: 'Slides 1 to 5',
} as const;

/** The brand kits band (docs/LANDING.md 2.8): GT, Kestrel and Globex, and a typed colour. */
export type KitId = 'gt' | 'kestrel' | 'globex';

export const KITS = {
  id: 'kits',
  h2: 'Brand kits restyle every slide',
  lead: 'Slide > Change theme opens the Brand kit. Its six colors apply to every slide at once.',
  kitsKey: 'Kits',
  kits: {
    gt: { name: 'GT', tip: "GT. The GT brand deck's own colors." },
    kestrel: { name: 'Kestrel', tip: "Kestrel. An example customer's colors." },
    globex: { name: 'Globex', tip: "Globex. An example customer's colors." },
  },
  backgroundKey: 'Background',
  /** the field's placeholder: a colour in code form, not prose */
  backgroundPlaceholder: '#e6e0d2',
  backgroundHelp: 'Type a color. Every slide shows it as you type, and Enter applies it.',
  undo: 'Undo',
  gridLabel: 'The nine slides',
  /** the status line, shown only after a press */
  status: {
    kit: (kit: KitId, slides: number): string =>
      kit === 'globex'
        ? `Globex, an example customer's kit, set the colors of ${slides} slides.`
        : `The ${kit === 'gt' ? 'GT' : 'Kestrel'} kit set the colors of ${slides} slides.`,
    background: (color: string): string => `The background of every slide is ${color} now.`,
    backgroundReset: "The background is back to the kit's.",
    invalid: 'Type a color as # and six hex digits.',
    contrast: (color: string, ratio: number): string =>
      `Text on ${color} reads at ${ratio.toFixed(1)} to 1. Choose a color that keeps it at 4.5 to 1 or more.`,
  },
} as const;

export const CANVAS = {
  id: 'canvas',
  h2: 'Everything on a slide moves',
  lead: 'Drag, resize and rotate any object. The first drag turns the slide into a canvas. Undo puts the layout back.',
  layoutKey: 'Layout',
  layout: { mood: 'Mood', canvas: 'Canvas' },
  undo: 'Undo',
  commandKey: 'Command',
  commandRest: 'Each gesture prints its CLI command.',
  /** generated text: the CLI form of a gesture, in a form of packages/agent/generated/cli.json */
  log: {
    toCanvas: (slide: string): string => `turboslide slide to-canvas ${slide}`,
    pos: (
      slide: string,
      block: string,
      box: { x: number; y: number; w: number; h: number },
    ): string =>
      `turboslide block set ${slide}#${block} /pos '${JSON.stringify({
        x: Math.round(box.x),
        y: Math.round(box.y),
        w: Math.round(box.w),
        h: Math.round(box.h),
      })}'`,
    rotate: (slide: string, block: string, degrees: number): string =>
      `turboslide block rotate ${slide}#${block} --to ${Math.round(degrees)}`,
  },
} as const;

export const PRESENT = {
  id: 'present',
  h2: 'Present from the browser',
  lead: 'This page is a deck with your changes. Present it here or print it.',
  present: 'Present',
  print: 'Print This Deck',
  listLabel: 'The slides of this page',
  show: { previous: 'Previous', next: 'Next', exit: 'Exit' },
  counter: (n: number, total: number): string => `${n} / ${total}`,
  stageName: (n: number, total: number): string => `Slide ${n} of ${total}`,
} as const;

export const EXPORT = {
  id: 'export',
  h2: 'Export to PDF and PowerPoint',
  /* LANDING.md 2.12 wrote "what each kind of PowerPoint file holds"; "kind" is a default view word
     of the menu model (packages/chrome/src/menus/strings.ts), so the lead says it without it */
  lead: 'File > Download writes a PDF or a PowerPoint file. Drag the seam to see what each PowerPoint file holds.',
  /** the Download dialog's own mode names (packages/chrome/src/ExportMenu.tsx 85) */
  labels: { perfect: 'Perfect', editable: 'Editable text' },
  rows: {
    perfect: {
      key: 'Perfect',
      sentence: (size: { width: number; height: number }, facts: HomeFacts): string =>
        `Each page is one picture, ${size.width} by ${size.height}. The worst GT deck page differs from its screenshot by ${formatPercentFigure(facts.mismatchPercent)}.`,
      link: {
        id: 'home.export.record',
        label: 'Read the record',
        href: `${GITHUB_FILE}/docs/pptx.md`,
      },
    },
    editable: { key: 'Editable text', sentence: 'Text boxes stay text boxes.' },
    pdf: { key: 'PDF', sentence: 'Text stays text.', link: 'Download the PDF' },
  },
  slider: (percent: number): string =>
    `The Perfect file's picture fills ${Math.round(percent)} percent of the slide`,
  sliderLabel: 'Where the two files meet',
  perfectAlt: 'Slide 7 as the one picture the Perfect file holds',
  caption:
    "Hold the pointer on the slide to compare the browser's render with the Perfect file's picture.",
  /** the loupe (V3#17) */
  loupe: {
    browser: 'Browser',
    perfect: 'Perfect file',
    target: 'Pixel comparison of slide 7',
    /** generated: the readout under the two windows */
    readout: (differ: number, total: number, x: number, y: number): string =>
      `${differ} of ${total} pixels differ at x ${x}, y ${y}.`,
  },
} as const;

/** Version history's scrubber in the agents band (docs/LANDING.md 2.9, V2#14). */
export const VERSIONS = {
  label: 'Version history',
  sliderName: 'Version',
  restore: 'Restore This Version',
  /** generated: the scrubber's caption for a version made on the page */
  caption: (n: number, total: number, author: string, time: string): string =>
    `Version ${n} of ${total}, by ${author} at ${time}.`,
  /** generated: the scrubber's caption for a recorded version */
  recordedCaption: (n: number, total: number): string =>
    `Version ${n} of ${total}, recorded from the CLI.`,
} as const;

/** Two people edit the same slide (docs/LANDING.md 2.10). */
export const PEOPLE = {
  id: 'people',
  h2: 'Two people edit the same slide',
  lead: "Share an editor link. Each person's outline, caret and name show on the other screen. Follow keeps your view on the other person's slide.",
  screens: { maya: "Maya's screen", sam: "Sam's screen" },
  flags: { maya: 'Maya', sam: 'Sam' },
  following: 'Following Sam',
  stop: 'Stop',
  /** the figure is the sequence's length rounded, from live/people.ts's schedule */
  caption: (seconds: number): string =>
    `A staged loop of ${seconds} seconds, drawn with the editor's own presence marks. Click a text box on either screen to type as that person.`,
} as const;

/** Animated patterns (docs/LANDING.md 2.13). */
export const PATTERNS = {
  id: 'patterns',
  h2: 'Animated patterns',
  lead: 'Each pattern moves on its slide in the editor and in the show. Every export carries its still frame.',
  labels: { moving: 'In the editor and the show', still: 'In the PDF and the PowerPoint file' },
} as const;

/**
 * Features and where to find them (docs/LANDING.md 2.14): A's "Turboslide today" and B's ten rows
 * in one table with no figure. Each where cell and shortcut is the menu model's, read at build
 * (`facts-data.ts` `features`); the key and the icon are here.
 */
export type FeatureId =
  | 'menus'
  | 'tailor'
  | 'kit'
  | 'comments'
  | 'versions'
  | 'share'
  | 'presenter'
  | 'download'
  | 'pattern'
  | 'agents';

export type FeatureRow = { id: FeatureId; icon: SectionIconName; key: string };

export const FEATURES = {
  id: 'features',
  h2: 'Features and where to find them',
  heads: { feature: 'Feature', where: 'Where', shortcut: 'Shortcut' },
  rows: [
    { id: 'menus', icon: 'bars-3', key: 'Menus' },
    { id: 'tailor', icon: 'pencil-square', key: 'Tailor for a customer' },
    { id: 'kit', icon: 'swatch', key: 'Brand kit' },
    { id: 'comments', icon: 'chat-bubble-left-right', key: 'Comments' },
    { id: 'versions', icon: 'clock', key: 'Version history' },
    { id: 'share', icon: 'user-group', key: 'Share' },
    { id: 'presenter', icon: 'presentation-chart-bar', key: 'Presenter view' },
    { id: 'download', icon: 'arrow-down-tray', key: 'Download' },
    { id: 'pattern', icon: 'cube', key: 'Animated pattern' },
    { id: 'agents', icon: 'command-line', key: 'Agents' },
  ] as ReadonlyArray<FeatureRow>,
} as const;

export const CLOSE = {
  id: 'close',
  h2: 'A new presentation needs no account',
  lead: 'New Presentation opens a blank deck. The first edit saves it. Open the Example Deck opens the GT brand deck.',
  buttons: {
    newPresentation: { label: 'New Presentation', href: '/new' },
    openDeck: { label: 'Open the Example Deck', deckId: 'gt-brand' },
  },
} as const;

/** Generated text: the words of a Version history row (integrator.md 4.4). */
export const HISTORY = {
  moved: (name: string, n: number): string => `Moved ${name} on slide ${n}`,
  resized: (name: string, n: number): string => `Resized ${name} on slide ${n}`,
  turned: (name: string, n: number, degrees: number): string =>
    `Turned ${name} on slide ${n} to ${Math.round(degrees)} degrees`,
  edited: (name: string, n: number): string => `Edited ${name} on slide ${n}`,
  tailored: (name: string): string => `Tailored for ${name}`,
  kit: (name: string): string => `Set the ${name} kit`,
  slideMoved: (from: number, to: number): string => `Moved slide ${from} to place ${to}`,
  restored: (time: string): string => `Restored the version of ${time}`,
  rewroteRow: (n: number): string => `Rewrote a row on slide ${n}`,
  background: (color: string): string => `Set the background to ${color}`,
  /* the menus band's rows (V2#11) */
  inserted: (kind: string, n: number): string => `Inserted ${kind} on slide ${n}`,
  deletedBlock: (name: string, n: number): string => `Deleted ${name} on slide ${n}`,
  duplicatedBlock: (name: string, n: number): string => `Duplicated ${name} on slide ${n}`,
  styled: (style: string, name: string, n: number): string => `Made ${name} ${style} on slide ${n}`,
  aligned: (name: string, n: number, side: string): string =>
    `Aligned ${name} ${side} on slide ${n}`,
  cleared: (name: string, n: number): string => `Cleared the formatting of ${name} on slide ${n}`,
  ordered: (name: string, n: number, where: string): string =>
    `Brought ${name} ${where} on slide ${n}`,
  rotated: (name: string, n: number, degrees: number): string =>
    `Rotated ${name} on slide ${n} by ${Math.round(degrees)} degrees`,
  slideAdded: (n: number): string => `Added slide ${n}`,
  slideDuplicated: (n: number): string => `Duplicated slide ${n}`,
  slideDeleted: (n: number): string => `Deleted slide ${n}`,
  slideSkipped: (n: number): string => `Skipped slide ${n}`,
  slideUnskipped: (n: number): string => `Showed slide ${n} again`,
  renamed: (title: string): string => `Renamed the presentation to ${title}`,
  versionNamed: (name: string): string => `Named the version ${name}`,
  notesEdited: (n: number): string => `Edited the notes of slide ${n}`,
} as const;

/** Generated text: what the bands' polite live regions read (docs/LANDING.md 5 "Announcements"). */
export const ANNOUNCE = {
  slideAdded: (n: number): string => `Slide ${n} added`,
  slideMoved: (from: number, to: number): string => `Slide ${from} moved to place ${to}`,
  showCounter: (n: number, total: number): string => `Slide ${n} of ${total}`,
  slideChanged: (n: number): string => `Slide ${n} changed`,
} as const;

// ---------------------------------------------------------------------------------------------
// The footer (docs/LANDING.md 2.16): the licence keeps its one place here, "MIT License"

export type FooterLink = { id: string; label: string; href: string; external?: boolean };

export const FOOTER = {
  lockup: { name: 'Turboslide', href: '#top' },
  links: [
    { id: 'home.foot.new', label: 'New presentation', href: '/new' },
    { id: 'home.foot.decks', label: 'Your presentations', href: '/decks' },
    {
      id: 'home.foot.docs',
      label: 'Documentation',
      href: `${GITHUB_FILE}/docs/README.md`,
      external: true,
    },
    { id: 'home.foot.github', label: 'GitHub', href: REPOSITORY, external: true },
    {
      id: 'home.foot.licence',
      label: 'MIT License',
      href: `${GITHUB_FILE}/LICENSE`,
      external: true,
    },
    {
      id: 'home.foot.notices',
      label: 'Third party notices',
      href: `${GITHUB_FILE}/THIRD_PARTY_NOTICES.md`,
      external: true,
    },
  ] as ReadonlyArray<FooterLink>,
  /** the sentence that names the company, the GT mark set inline before its name (brand-judge-3 graft 2) */
  maker: { before: 'Turboslide is made by', company: 'General Translation', after: '.' },
  closing: 'Google Slides is a product of Google LLC.',
} as const;

/** Every string of the page, keyed, for the lints. */
export const HOME_COPY = {
  meta: { title: HOME_META.title, description: SITE.description },
  nav: NAV,
  hero: HERO,
  slides: SLIDES,
  numbers: NUMBERS,
  menus: MENUS,
  canvas: CANVAS,
  tailor: TAILOR,
  kits: KITS,
  /* Version history's scrubber is the agents band's (2.9), so its words read under it */
  agents: { ...AGENTS, versions: VERSIONS },
  people: PEOPLE,
  present: PRESENT,
  export: EXPORT,
  patterns: PATTERNS,
  features: FEATURES,
  close: CLOSE,
  history: HISTORY,
  announce: ANNOUNCE,
  footer: FOOTER,
} as const;

/** A percent as the export row prints it: the number and the sign. */
export function formatPercentFigure(n: number): string {
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 3 })}%`;
}

/** A string, or a text function applied to the facts; null when a function has no facts to read. */
export function resolveText(text: Text, facts: HomeFacts | null): string | null {
  if (typeof text === 'string') return text;
  return facts === null ? null : text(facts);
}
