import { SITE } from '@turboslide/theme/brand/site';

import { HOME_LEAD } from './meta';

/**
 * Every word of /home in one module (docs/SITE.md A.1), so copy.test.ts and the competitor guard
 * read one file. Plain technical English: declarative sentences in sentence case, no em dash, no
 * metaphor, Title Case on buttons alone (DECK-GRAMMAR.md:22). The h1 stays "Presentations for
 * people and agents" (Kevin, 2026-10-14). The counts come from facts.ts and the recorded commands
 * from run.ts; nothing here types a number the tree holds.
 */

const REPOSITORY = SITE.repository;
const GITHUB_FILE = `${REPOSITORY}/blob/main`;
/** General Translation, the maker the footer names. */
const MAKER = 'https://generaltranslation.com';

export const NAV = {
  skip: 'Skip to Content',
  lockup: { word: 'Turboslide', name: 'Turboslide home' },
  /* `wide` links leave the bar under 1024 px, where the row has room for two (site.css); the
     footer carries every one */
  links: [
    { id: 'site.nav.features', label: 'Features', href: '/features', external: false, wide: false },
    { id: 'site.nav.docs', label: 'Documentation', href: '/docs', external: false, wide: false },
    { id: 'site.nav.about', label: 'About', href: '/about', external: false, wide: true },
    { id: 'site.nav.faq', label: 'FAQ', href: '/faq', external: false, wide: true },
    { id: 'site.nav.github', label: 'GitHub', href: REPOSITORY, external: true, wide: true },
  ],
  newPresentation: { label: 'New Presentation', href: '/new' },
} as const;

/** The h1 in its four runs of words; the two stacks sit after `people` and after `agents`. */
export const TITLE = {
  before: 'Presentations for',
  people: 'people',
  and: 'and',
  agents: 'agents',
} as const;

export const TITLE_TEXT = `${TITLE.before} ${TITLE.people} ${TITLE.and} ${TITLE.agents}`;

/**
 * The people of the title's first stack: the generated names the product gives a visitor without
 * an account (`labelFor` of packages/identity/src/labels.ts: a word of LABEL_WORDS and a number),
 * never a real person's name, each ringed in one of the live hues (slots 1 to 5).
 */
export const PEOPLE = [
  { name: 'Cobalt 118', hue: 1 },
  { name: 'Argon 905', hue: 2 },
  { name: 'Titanium 471', hue: 3 },
  { name: 'Neon 260', hue: 4 },
  { name: 'Xenon 734', hue: 5 },
] as const;

/** The agents of the second stack, by their brand ids (agent-marks.tsx), each with its hue. */
export const AGENTS = [
  { brand: 'claude-code', hue: 6 },
  { brand: 'codex', hue: 3 },
  { brand: 'openclaw', hue: 2 },
  { brand: 'hermes', hue: 4 },
] as const;

/**
 * What pressing an avatar does, read by a screen reader after the avatar's name (each button's
 * `aria-describedby`); the label a pointer or the focus lifts names the avatar alone.
 */
export const AVATAR_PRESS = {
  person: {
    id: 'site-press-person',
    sentence: 'Pressing brings this person into the editor below for a short visit.',
  },
  agent: {
    id: 'site-press-agent',
    sentence: 'Pressing has this agent take its next step in the editor below.',
  },
} as const;

export const HERO = {
  lead: HOME_LEAD,
  primary: { label: 'New Presentation', href: '/new', id: 'site.hero.new' },
  secondary: { label: 'Open the Example Deck', href: '/deck/gt-brand', id: 'site.hero.example' },
  figure: {
    alt: 'The Turboslide editor on a presentation titled Northwind quarterly review. It shows the title row with Share, the menus File to Help, the toolbar, the filmstrip of five slides and the title slide on the stage. The pointers of Claude Code and Codex are on the slide.',
    frameTitle: 'The Turboslide editor with Claude Code and Codex',
  },
} as const;

/**
 * Screen 02, Canvas (docs/SITE.md 9): the lighthouse slide after one drag and one turn of its
 * heading, which the CLI wrote (canvas-pose.ts), beside the heading's box at rest and moved. The
 * words on the slide are the slide's own (home-deck/slides/lighthouse.json).
 */
export const CANVAS_SCREEN = {
  sentence: 'Every object on a slide moves.',
  figure: {
    alt: 'The lighthouse slide, a drone photograph of the lantern room of Cape Hatteras Light printed in a two tone dither. The heading, Cape Hatteras Light, was dragged from the paper plate in the lower right to the sky in the upper left and turned 6 degrees to the left. The selection ring of the editor is on it.',
  },
  slide: {
    heading: 'Cape Hatteras Light',
    paragraph:
      "The lantern of Cape Hatteras Light on North Carolina's Outer Banks, printed through an 8 by 8 screen at 2 px cells.",
    credit: 'Photograph: National Park Service, public domain',
    /** the editor's selection chip on the heading: its kind and its id */
    chip: 'heading · h',
  },
  table: {
    name: 'The heading’s box at rest and moved',
    heads: { field: 'Format options', rest: 'At rest', moved: 'Moved' },
    rows: { w: 'Width', h: 'Height', rotate: 'Rotate', x: 'X', y: 'Y' },
  },
} as const;

export const AGENTS_SCREEN = {
  sentence: 'An agent runs the same actions as the menus.',
  table: {
    caption: 'One action, slide.new, on each transport',
    heads: { transport: 'Transport', name: 'Name', actions: 'Actions' },
    rows: [
      { id: 'cli', transport: 'Command line', name: 'turboslide slide new', icon: 'command-line' },
      { id: 'mcp', transport: 'MCP', name: 'deck_new_slide', icon: 'puzzle-piece' },
      { id: 'http', transport: 'HTTP', name: 'POST /api/actions/slide.new', icon: 'globe-alt' },
      { id: 'page', transport: 'Page', name: "studio.invoke('slide.new', input)", icon: 'window' },
    ],
    total: 'Every action',
  },
  /**
   * The path every caller of `slide.new` joins (docs/SITE.md A.4): the menu item and the four
   * transports, the one handler, its two checks with their refusals, and the revision Version
   * history records. Each label is the source's own: the menu row (packages/chrome/src/menus/
   * model.ts, `action('slide.new')`), the dispatcher's input check (packages/agent/src/
   * dispatch.ts), `errorStatus` (packages/schema/src/errors.ts), `commit` and its
   * `baseRevision` (apps/cli/src/store-actions.ts), and the store's one entry per write.
   */
  flow: {
    alt: 'The menu item Slide > New slide and the four transports run into one handler, slide.new. It checks the input against the action’s schema, then checks that baseRevision is current, and Version history records one new revision with its author. A failed input check answers 400 with the failing field, and a stale revision answers 409 with the current document.',
    people: 'People',
    agents: 'Agents',
    menu: 'Slide > New slide',
    stations: [
      { id: 'handler', name: 'slide.new', sub: 'One handler for every caller', code: true },
      {
        id: 'input',
        name: 'Input check',
        sub: 'Against the action’s schema',
        refusal: '400 and the failing field',
      },
      {
        id: 'revision',
        name: 'Revision check',
        sub: '`baseRevision` is current',
        refusal: '409 and the current document',
      },
      { id: 'history', name: 'Version history', sub: 'One new revision, with its author' },
    ],
  },
} as const;

export const PRESENT_SCREEN = {
  sentence: 'Anyone with the link can open the presentation and present it.',
  figure: {
    alt: 'The Turboslide viewer on the example deck. Its bar holds Previous, the slide counter, Next, the Slide, Grid and Book views, Theme and Present.',
  },
  keysName: 'Keys during a slideshow',
  keys: [
    { key: '→', label: 'Next slide' },
    { key: '←', label: 'Previous slide' },
    { key: 'S', label: 'Presenter view' },
    { key: 'L', label: 'Laser pointer' },
    { key: 'B', label: 'Black slide' },
    { key: 'Esc', label: 'Stop presenting' },
  ],
  /**
   * The row under the keys: the slideshow and presenter view, two windows that move together
   * (apps/studio/content/docs/presenting.mdx). The console's own words come from the viewer
   * (PRESENT_TEXT); the slides are slides 2 and 3 of the example deck the viewer above shows.
   */
  windows: {
    alt: 'Two windows. The slideshow, seen by the audience, shows the slide. S opens presenter view, seen by you, with the timer, the current slide, the next slide and the speaker notes. The left and right arrows in either window move both.',
    show: { label: 'Slideshow', who: 'Seen by the audience' },
    presenter: { label: 'Presenter view', who: 'Seen by you' },
    opens: 'opens',
    moveBoth: 'move both',
    deck: 'GT brand deck',
    /** a frozen reading of the console's timer, four seconds after it opened */
    time: '0:04',
    slide: { index: 2, total: 85, title: 'General Translation' },
    next: 'Every product in every language',
    notesSize: '16 px',
  },
} as const;

/**
 * Screen 05, Patterns (docs/SITE.md 9): a slide with the Dithering pattern beside the moments
 * of its movement, one of them held as the still, and where the pattern moves
 * (apps/studio/content/docs/editor/objects.mdx).
 */
export const PATTERNS_SCREEN = {
  sentence: 'Patterns move in the show, and downloads keep the moment you choose.',
  figure: {
    alt: 'A slide titled Questions from Northwind with the Dithering pattern: a sphere printed in dots whose light moves around it.',
  },
  slide: {
    heading: 'Questions from Northwind',
    sentence: 'Thank you for the time today.',
    counter: '8 / 9',
  },
  strip: {
    name: 'The pattern at 0, 2, 4, 6, 8 and 10 seconds. The moment at 4 seconds is the still.',
    seconds: [0, 2, 4, 6, 8, 10],
    still: 4,
    at: (s: number): string => `${s} s`,
    stillAt: (s: number): string => `Still, ${s} s`,
  },
  table: {
    caption: 'Where the pattern moves',
    heads: { place: 'Place', pattern: 'Pattern' },
    rows: [
      { place: 'Slideshow and viewer', pattern: 'Moves' },
      { place: 'Editor', pattern: 'Still' },
      { place: 'PDF and PowerPoint file', pattern: 'Still' },
      { place: 'Thumbnails', pattern: 'Still' },
      { place: 'With Reduce motion on', pattern: 'Still' },
    ],
  },
} as const;

/** One run of a file's sentence: plain words, or the words that name a part, underlined. */
export type ExportRun = { text: string; part?: 'object' | 'hidden' };

/**
 * Screen 06, Export (docs/SITE.md 9): the files File > Download writes from one slide, then one
 * slide cut by a seam between the two PowerPoint files, with the parts each file holds
 * (export-parts.ts). The modes' names are the Download dialog's (DIALOGS.download), the file names
 * `downloadFileName`'s, the numbers docs/pptx.md's.
 */
export const EXPORT_SCREEN = {
  sentence: 'Download the presentation as a PDF or as a PowerPoint file.',
  files: {
    heading: 'Orders by quarter',
    list: [
      {
        id: 'pdf',
        kind: 'PDF',
        name: 'Northwind quarterly review.pdf',
        says: [{ text: 'One page per slide, 13.333 by 7.5 in, with text you can search.' }],
      },
      {
        id: 'pictures',
        kind: 'PowerPoint, Pictures',
        name: 'Northwind quarterly review.pptx',
        says: [
          { text: 'The slide is ' },
          { text: 'one picture', part: 'object' },
          { text: ', 3200 by 1800, over its text in an ' },
          { text: 'invisible layer', part: 'hidden' },
          {
            text: ' you can search. On each page, at most 0.1 percent of the pixels differ from the browser.',
          },
        ],
      },
      {
        id: 'editable',
        kind: 'PowerPoint, Editable text',
        name: 'Northwind quarterly review (editable).pptx',
        says: [
          { text: 'The heading is a ' },
          { text: 'text box', part: 'object' },
          { text: ' and the chart is a ' },
          { text: 'PowerPoint chart', part: 'object' },
          { text: '. The layout is within 3 px of the browser.' },
        ],
      },
    ],
  },
  seam: {
    pictures: 'Pictures',
    editable: 'Editable text',
    alt: (c: { text: number; rect: number; line: number }): string =>
      `The opener field, a lit sphere printed in dots with a plate of text at the lower right. Left of the seam is the Pictures file, where the slide is one picture of 3200 by 1800 pixels. Right of it is the Editable text file, where the slide’s ${c.text} text boxes, ${c.rect} rectangles and ${c.line} lines are each outlined in blue over its background picture.`,
    holds: {
      pictures: (c: { text: number }): string =>
        `One picture of the slide, the logo and ${c.text} text boxes of invisible text.`,
      editable: (c: { text: number; rect: number; line: number }): string =>
        `${c.text} text boxes, ${c.rect} rectangles, ${c.line} lines, the logo and the background picture.`,
    },
    chips: {
      picture: 'Picture of the slide, 3200 by 1800',
      invisible: 'Invisible text',
      background: 'Background picture',
      line: 'Line',
      rect: 'Rectangle',
      text: 'Text box',
    },
    slider: {
      name: 'Where the two files meet',
      value: (p: number): string => `Pictures on the left ${p} percent, Editable text on the rest`,
    },
  },
} as const;

/**
 * The footer of every site page and the docs (SiteFooter.tsx): the lockup with the animated mark,
 * four columns of links, then the maker, the build and the appearance switch.
 */
export const FOOTER = {
  word: 'Turboslide',
  /** the lockup's name on /home, where it goes back to the top, and on every other page */
  top: 'Turboslide, back to the top',
  home: 'Turboslide home',
  nav: 'Footer',
  columns: [
    {
      id: 'product',
      title: 'Product',
      icon: 'presentation-chart-bar',
      links: [
        { label: 'New presentation', href: '/new', external: false },
        /* the row decks.home.your-presentations opens /decks from here */
        { label: 'Your presentations', href: '/decks', external: false },
        { label: 'Features', href: '/features', external: false },
        { label: 'The example deck', href: '/deck/gt-brand', external: false },
      ],
    },
    {
      id: 'agents',
      title: 'Agents',
      icon: 'command-line',
      links: [
        { label: 'Command line', href: '/docs/agents/cli', external: false },
        { label: 'MCP', href: '/docs/agents/mcp', external: false },
        { label: 'HTTP', href: '/docs/agents/http', external: false },
        { label: 'Skills', href: '/docs/agents/skills', external: false },
        { label: 'llms.txt', href: '/llms.txt', external: false },
      ],
    },
    {
      id: 'docs',
      title: 'Docs',
      icon: 'book-open',
      links: [
        { label: 'Getting started', href: '/docs', external: false },
        { label: 'Sharing', href: '/docs/sharing', external: false },
        { label: 'Export', href: '/docs/export', external: false },
        { label: 'Self-hosting', href: '/docs/self-hosting', external: false },
      ],
    },
    {
      id: 'project',
      title: 'Project',
      icon: 'code-bracket',
      links: [
        { label: 'About', href: '/about', external: false },
        { label: 'FAQ', href: '/faq', external: false },
        { label: 'GitHub', href: REPOSITORY, external: true },
        { label: 'MIT License', href: `${GITHUB_FILE}/LICENSE`, external: true },
        {
          label: 'Third party notices',
          href: `${GITHUB_FILE}/THIRD_PARTY_NOTICES.md`,
          external: true,
        },
      ],
    },
  ],
  made: { before: 'Made by', name: 'General Translation', href: MAKER },
  build: {
    label: 'Build',
    name: (commit: string): string => `Build ${commit}, the commit on GitHub`,
    href: (commit: string): string => `${REPOSITORY}/commit/${commit}`,
  },
  appearance: { name: 'Appearance', light: 'Light', dark: 'Dark' },
} as const;
