import { SITE } from '@turboslide/theme/brand/site';

import type { HomeFacts } from './facts';
import { formatCount } from './facts';
import { HOME_META } from './home-meta';

/**
 * Every string of the /home page (docs/POLISH.md section 3, on the page grammar of docs/NEXT.md
 * 4.1.2 and 4.1.3 item 9 since Round 1; the round four notes of gslides-parity SPEC-4 section 2
 * stand under it), in one module so `copy.test.ts` can lint them
 * all: sentence case headings with no comma and no trailing period, one thought per sentence
 * under 20 words, Title Case on buttons alone, no em dash, no exclamation mark, no semicolon, no
 * colon list, no metaphor word, no "X, not Y" pair, none of the five words of SPEC-4 0.26, none
 * of the report words of POLISH.md 3.1 and no file path outside the agents section's command
 * box. A string that carries a count of the tree is a function of `HomeFacts` (SPEC-4 0.25: a
 * literal count is a defect). The page holds about 200 words.
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
 * The copy paths the default view words rule of the menu model does not read: the head (a
 * sentence about the product, not a band), the agents section (it names the transports), the
 * license section ("Run it from a checkout" is plain English, and "run" is a menu model word) and
 * the numbers row (its actions figure names the transports). The path `licence` keeps the British
 * spelling of the ids (`home.licence.*`), which Round 1 keeps while the words read "license".
 */
export const DEFAULT_VIEW_EXEMPT: ReadonlyArray<string> = ['meta', 'agents', 'licence', 'numbers'];

export { HOME_META } from './home-meta';

// ---------------------------------------------------------------------------------------------
// The navigation (3.2 item 0; docs/NEXT.md 4.1.3 item 9: GitHub moves to the footer and Sign In
// joins the bar)

export type NavLink = {
  id: string;
  label: string;
  href: string;
  external?: boolean;
};

export const NAV = {
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
// The hero (3.2 item 1)

/** The pictures the capture writes (scripts/build-home-assets.ts --capture), one per appearance. */
export type ShotKind = 'hero' | 'canvas' | 'menus';

export const HERO = {
  heading: 'Build the pitch, present it and send the link',
  /** the one description of the product, shared with the head, the manifest, the card and the README */
  lead: SITE.description,
  buttons: {
    newPresentation: { label: 'New Presentation', href: '/new' },
    openDeck: { label: 'Open the Example Deck', deckId: 'gt-brand' },
  },
  picture: {
    shot: 'hero' as ShotKind,
    alt: 'The Turboslide editor with the example deck open on its Blue Marble slide.',
  },
  /** the facts rows beside the hero's text (brand-c rule 5): a key with its Heroicon, one sentence */
  facts: [
    {
      id: 'menus',
      icon: 'bars-3' as SectionIconName,
      key: 'Menus',
      value: "The menus go from File to Help in Google's order, with Google's shortcuts.",
    },
    {
      id: 'present',
      icon: 'play' as SectionIconName,
      key: 'Present',
      value: 'Presenter view opens in a second window with the timer and the notes.',
    },
    {
      id: 'export',
      icon: 'arrow-down-tray' as SectionIconName,
      key: 'Export',
      value: 'Downloads are PDF and PowerPoint files that match the screen.',
    },
  ],
} as const;

// ---------------------------------------------------------------------------------------------
// The numbers row (docs/NEXT.md 4.1.2, A's graft: three figures of packages/theme/brand/facts.json)

export const NUMBERS = {
  label: 'Turboslide in three numbers',
  cells: [
    {
      id: 'layouts',
      figure: (facts: HomeFacts): string => `${formatCount(facts.layouts)} layouts`,
      sentence: 'A new slide starts from one of these layouts.',
    },
    {
      id: 'actions',
      figure: (facts: HomeFacts): string => `${formatCount(facts.actions)} actions`,
      sentence: 'Agents run the same actions as the editor over the CLI, MCP and HTTP.',
    },
    {
      id: 'mismatch',
      figure: (facts: HomeFacts): string => formatPercentFigure(facts.mismatchPercent),
      sentence:
        'The worst page of the example PowerPoint export differs from the screen by this share.',
      /** the figure links to the export record */
      href: `${GITHUB_FILE}/docs/pptx.md`,
    },
  ],
} as const;

// ---------------------------------------------------------------------------------------------
// The sections (3.2 items 2 to 7)

/**
 * The Heroicons of the page's key cells, by the sprite's names. Since Round 1 an icon sits only in
 * a key cell of the facts rows (DECK-GRAMMAR 40), never before a heading.
 */
export type SectionIconName =
  'cursor-arrow-rays' | 'bars-3' | 'play' | 'arrow-down-tray' | 'command-line' | 'document-text';

export const CANVAS = {
  id: 'canvas',
  heading: 'Everything on a slide moves',
  lead: 'Drag, resize and rotate any object. The first drag turns the slide into a canvas. Undo puts the layout back.',
  /** a diagram in the deck's grammar in place of the capture, which drew the blue selection ring */
  diagram: {
    label:
      'A slide with one picture moved, resized and rotated, its first place drawn as a hairline.',
    slide: 'Slide',
    before: 'First place',
    move: 'Drag',
    resize: 'Resize',
    rotate: 'Rotate',
  },
} as const;

export const MENUS = {
  id: 'menus',
  heading: "The menus are Google's",
  lead: "File, Edit, View, Insert, Format, Slide, Arrange, Tools and Help are in Google's order. The shortcuts are Google's too. So are the right click menus.",
  picture: { shot: 'menus' as ShotKind, alt: 'The menu bar with the Insert menu open.' },
} as const;

export const PRESENT = {
  id: 'present',
  heading: 'Present from the browser',
  lead: 'Slideshow starts on the current slide. Presenter view opens in a second window with the timer, the notes and the next slide. A present link opens the show for anyone.',
  diagram: {
    label:
      'The editor, presenter view and a phone with the show, joined by the S key and a present link.',
    editor: 'Editor',
    presenter: 'Presenter view',
    timer: 'Timer',
    notes: 'Notes',
    next: 'Next slide',
    show: 'Show',
    key: 'S',
    link: 'present link',
  },
} as const;

export const EXPORT = {
  id: 'export',
  heading: 'Export to PDF and PowerPoint',
  lead: 'File > Download writes a PDF or a PowerPoint file. The PowerPoint file matches the screen pixel for pixel.',
  diagram: {
    label: 'A slide with a line to two files, pitch.pdf and pitch.pptx.',
    slide: 'Slide',
    pdf: 'pitch.pdf',
    pptx: 'pitch.pptx',
  },
} as const;

export const AGENTS = {
  id: 'agents',
  anchor: 'agents',
  heading: 'Agents run the same actions',
  lead: (facts: HomeFacts): string =>
    `Every editor action is a command. Agents run the same ${formatCount(facts.actions)} actions over the CLI, MCP and HTTP.`,
  /** the one monospace on the page (SPEC-4 0.20) */
  command: 'pnpm exec turboslide slide new --layout split --deck decks/pitch --json',
  diagram: {
    label: (facts: HomeFacts): string =>
      `One table of ${formatCount(facts.actions)} actions, reached from the CLI, MCP, HTTP and the page, out to a deck.`,
    table: (facts: HomeFacts): string => `${formatCount(facts.actions)} actions`,
    sources: ['CLI', 'MCP', 'HTTP', 'The page'],
    deck: 'Deck',
  },
  link: {
    id: 'home.agents.docs',
    label: 'Read the agent documentation',
    href: `${REPOSITORY}/tree/main/skills`,
  },
} as const;

export const LICENCE = {
  id: 'licence',
  heading: 'Free under the MIT license',
  lead: 'Run it from a checkout or deploy it to Vercel. The code is on GitHub.',
  button: { id: 'home.licence.github', label: 'GitHub', href: REPOSITORY },
} as const;

// ---------------------------------------------------------------------------------------------
// The footer (3.2 item 8)

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
  numbers: NUMBERS,
  canvas: CANVAS,
  menus: MENUS,
  present: PRESENT,
  export: EXPORT,
  agents: AGENTS,
  licence: LICENCE,
  footer: FOOTER,
} as const;

/** A percent as the measured sentence prints it: the number and the word. */
export function formatPercentWord(n: number): string {
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 3 })} percent`;
}

/** A percent as the numbers row prints it: the number and the sign. */
export function formatPercentFigure(n: number): string {
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 3 })}%`;
}

/** A string, or a text function applied to the facts; null when a function has no facts to read. */
export function resolveText(text: Text, facts: HomeFacts | null): string | null {
  if (typeof text === 'string') return text;
  return facts === null ? null : text(facts);
}
