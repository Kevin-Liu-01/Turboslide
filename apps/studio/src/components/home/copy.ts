import { SITE } from '@turboslide/theme/brand/site';

import type { HomeFacts } from './facts';
import { formatCount } from './facts';
import { HOME_META } from './home-meta';

/**
 * Every string of the /home landing (docs/LANDING.md section 2 and 2.12; the key table of
 * docs/gslides-parity/landing/build/integrator.md "Landing, day 0" 4.8), in one module so
 * `copy.test.ts` can lint them all: sentence case headings with no comma (the h1's list comma
 * aside) and no trailing period, Title Case buttons, every sentence under 20 words, no em dash,
 * en dash, exclamation mark, semicolon or colon, no metaphor word and no "X, not Y" pair, none of
 * the forbidden words, phrases or report words, no file path, and the page under 350 words at
 * rest. A string that carries a count of the tree is a function of `HomeFacts` (SPEC-4 0.25).
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
 * 2.12): the head, the agents band (it names the transports), the canvas band's generated
 * command line, and the parts table (it names the CLI, MCP and HTTP surfaces).
 */
export const DEFAULT_VIEW_EXEMPT: ReadonlyArray<string> = ['meta', 'agents', 'canvas.log', 'parts'];

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
  /** drawn for an anonymous visitor once the deployment answers that it offers a method (sign-in.tsx) */
  signIn: { label: 'Sign In' },
  newPresentation: { label: 'New Presentation', href: '/new' },
} as const;

// ---------------------------------------------------------------------------------------------
// The hero, slide 1 (docs/LANDING.md 2.2)

/** The h1 in its three hand set lines; joined by spaces it is the sentence of decks.home.seller-lead. */
const H1_LINES = ['Build the pitch,', 'present it and', 'send the link'] as const;

export const HERO = {
  h1Lines: H1_LINES,
  heading: H1_LINES.join(' '),
  /**
   * The slide's subtitle, one true sentence per visit, each naming a band below: the editor, the
   * Tailor band, the export band (answer 9). The boot script picks the next each visit; the
   * markup holds the first. At most 50 characters each.
   */
  visit: [
    'Turboslide is a slides editor in the browser.',
    'Turboslide puts one customer name on every slide.',
    'Turboslide downloads PDF and PowerPoint files.',
  ],
  caption: {
    pointer: 'Click the title to select it. Click again to type.',
    touchWide: 'Tap the title to select it, then drag it.',
    touchNarrow: 'Tap the sentence on the slide to select it, then drag it.',
  },
  undo: 'Undo',
  lead: "It has Google Slides' menus and shortcuts. No account is needed.",
  buttons: {
    newPresentation: { label: 'New Presentation', href: '/new' },
    openDeck: { label: 'Open the Example Deck', deckId: 'gt-brand' },
  },
} as const;

/** Slide content the page draws beside the renders (integrator.md 2.1, 2.2): words of the slides. */
export const SLIDES = {
  heroCredit: 'Image: NASA, Reto Stöckli, 2007, public domain',
  heroFieldAlt: "The Blue Marble, NASA's photograph of the Earth",
  rosettaAlt: 'The Rosetta Stone, a decree of 196 BC in three scripts',
  fieldAlt: 'The opener field, a lit sphere printed in dots',
} as const;

// ---------------------------------------------------------------------------------------------
// The bands (docs/LANDING.md 2.4 to 2.10)

/** The Heroicons 20 solid of the page's key cells (DECK-GRAMMAR 40), never before a heading. */
export type SectionIconName =
  | 'bars-3'
  | 'squares-2x2'
  | 'cube'
  | 'paint-brush'
  | 'command-line'
  | 'server'
  | 'globe-alt'
  | 'scale'
  | 'user-circle';

export const AGENTS = {
  id: 'agents',
  h2: 'Agents run the same actions',
  lead: 'Every editor action is a command. Agents send commands over the CLI, MCP and HTTP.',
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
    requestOnly: 'Request only. The CLI tab shows the recorded answer.',
    unclosedQuote: 'The line has an unclosed quote.',
    longName: 'This page takes a name of up to 24 characters.',
  },
} as const;

export const TAILOR = {
  id: 'tailor',
  h2: 'One customer on every slide',
  lead: "Tools > Tailor for a customer puts one name in every slide's text and notes. Slide > Change theme sets the colors of every slide.",
  examplesKey: 'Example kits',
  placeholder: 'Customer name',
  /** the page's own answer to an empty Apply (docs/LANDING.md 2.5) */
  empty: 'Type a customer name first.',
  kits: {
    gt: { name: 'GT', tip: "GT. The GT brand deck's own colors." },
    kestrel: { name: 'Kestrel', tip: "Kestrel. An example customer's colors." },
    fenwick: { name: 'Fenwick', tip: "Fenwick. An example customer's colors." },
  },
  /** the status after a kit change: GT is the deck's own kit, the others an example customer's */
  kitStatus: (kit: 'gt' | 'kestrel' | 'fenwick', slides: number): string =>
    kit === 'gt'
      ? `The GT kit set the colors of ${slides} slides.`
      : `${kit === 'kestrel' ? 'Kestrel' : 'Fenwick'}, an example customer's kit, set the colors of ${slides} slides.`,
  moveUp: 'Move Up',
  moveDown: 'Move Down',
  filmstripLabel: 'Slides 2 to 5',
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
  lead: 'File > Download writes a PDF or a PowerPoint file.',
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
} as const;

export type PartRow = {
  id: string;
  icon: SectionIconName;
  key: string;
  where: string;
  figure: (facts: HomeFacts) => string;
  /** the row's key links to this address in a new tab */
  href?: string;
};

export const PARTS = {
  id: 'parts',
  h2: 'Turboslide today',
  rows: [
    {
      id: 'menus',
      icon: 'bars-3',
      key: 'Menus',
      where: 'File to Help',
      figure: (f: HomeFacts) => formatCount(f.menus),
    },
    {
      id: 'layouts',
      icon: 'squares-2x2',
      key: 'Layouts',
      where: 'Slide > Apply layout',
      figure: (f: HomeFacts) => formatCount(f.layouts),
    },
    {
      id: 'shapes',
      icon: 'cube',
      key: 'PowerPoint shapes',
      where: 'Insert > Shape',
      figure: (f: HomeFacts) => formatCount(f.shapes),
    },
    {
      id: 'patterns',
      icon: 'paint-brush',
      key: 'Animated patterns',
      where: 'Insert > Animated pattern',
      figure: (f: HomeFacts) => formatCount(f.materials),
    },
    {
      id: 'cli',
      icon: 'command-line',
      key: 'CLI commands',
      where: 'The CLI',
      figure: (f: HomeFacts) => formatCount(f.cliCommands),
    },
    {
      id: 'mcp',
      icon: 'server',
      key: 'MCP tools',
      where: 'The MCP server',
      figure: (f: HomeFacts) => formatCount(f.mcpTools),
    },
    {
      id: 'http',
      icon: 'globe-alt',
      key: 'HTTP paths',
      where: 'The HTTP API',
      figure: (f: HomeFacts) => formatCount(f.httpPaths),
    },
    {
      id: 'license',
      icon: 'scale',
      key: 'License',
      where: 'GitHub',
      figure: (f: HomeFacts) => f.licence,
      href: REPOSITORY,
    },
  ] as ReadonlyArray<PartRow>,
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
} as const;

/** Generated text: what the bands' polite live regions read (docs/LANDING.md 5 "Announcements"). */
export const ANNOUNCE = {
  slideAdded: (n: number): string => `Slide ${n} added`,
  slideMoved: (from: number, to: number): string => `Slide ${from} moved to place ${to}`,
  showCounter: (n: number, total: number): string => `Slide ${n} of ${total}`,
} as const;

// ---------------------------------------------------------------------------------------------
// The footer (docs/LANDING.md 2.11, unchanged)

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
    { id: 'home.foot.licence', label: 'License', href: `${GITHUB_FILE}/LICENSE`, external: true },
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
  agents: AGENTS,
  tailor: TAILOR,
  canvas: CANVAS,
  present: PRESENT,
  export: EXPORT,
  parts: PARTS,
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
