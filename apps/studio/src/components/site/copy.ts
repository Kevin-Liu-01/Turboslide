import { SITE } from '@turboslide/theme/brand/site';

import { HOME_LEAD } from './meta';

/**
 * Every word of /home in one module (docs/SITE.md A.1), so copy.test.ts and the competitor guard
 * read one file. Plain technical English in the manner of ASD-STE100 (Kevin, 2026-10-30): one idea
 * per sentence, active voice, present tense, complete sentences in sentence case, no em dash, no
 * metaphor. Each screen's heading is a short phrase in Title Case (Kevin, 2026-10-30: "Feature
 * Parity for Agents"), as the buttons are (DECK-GRAMMAR.md:22). Names, table heads and diagram labels
 * stay noun phrases. The h1 stays "Presentations for people and agents" (Kevin, 2026-10-14). The
 * counts come from facts.ts and the recorded commands from run.ts; nothing here types a number the
 * tree holds.
 */

const REPOSITORY = SITE.repository;
const GITHUB_FILE = `${REPOSITORY}/blob/main`;
/** Kevin Liu, the maker the footer names (Kevin, 2026-10-30). */
const MAKER = 'https://kevinliu.studio';

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
    sentence: 'This button brings this person into the editor below for a short visit.',
  },
  agent: {
    id: 'site-press-agent',
    sentence: 'This button tells this agent to take its next step in the editor below.',
  },
} as const;

export const HERO = {
  lead: HOME_LEAD,
  primary: { label: 'New Presentation', href: '/new', id: 'site.hero.new' },
  secondary: { label: 'Open the Example Deck', href: '/deck/gt-brand', id: 'site.hero.example' },
  figure: {
    alt: 'The Turboslide editor shows a presentation titled Northwind quarterly review. The top holds the title row with Share, the menus from File to Help and the toolbar. The filmstrip holds five slides, and the stage shows the title slide. The pointers of Claude Code and Codex are on the slide.',
    frameTitle: 'The Turboslide editor with Claude Code and Codex',
  },
} as const;

/**
 * Screen 02, Canvas (docs/SITE.md 9): the lighthouse slide after one drag and one turn of its
 * heading, which the CLI wrote (canvas-pose.ts), beside the heading's box at rest and moved. The
 * words on the slide are the slide's own (home-deck/slides/lighthouse.json).
 */
export const CANVAS_SCREEN = {
  heading: 'Freeform Canvas',
  figure: {
    alt: 'The lighthouse slide shows a drone photograph of the lantern room of Cape Hatteras Light in a two tone dither. The heading, Cape Hatteras Light, has moved from the paper plate at the lower right to the sky at the upper left. It is rotated 6 degrees counterclockwise, and the editor’s selection ring surrounds it.',
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
    name: 'The heading’s box before and after the move',
    heads: { field: 'Format options', rest: 'Before', moved: 'After' },
    rows: { w: 'Width', h: 'Height', rotate: 'Rotate', x: 'X', y: 'Y' },
  },
} as const;

export const AGENTS_SCREEN = {
  heading: 'Feature Parity for Agents',
  table: {
    caption: 'The action slide.new on each transport',
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
    alt: 'The menu item Slide > New slide and the four transports all call one handler, slide.new. The handler checks the input against the action’s schema. Then it checks that baseRevision is current. Version history records one new revision with its author. A failed input check returns 400 with the failing field. A stale revision returns 409 with the current document.',
    people: 'People',
    agents: 'Agents',
    menu: 'Slide > New slide',
    stations: [
      { id: 'handler', name: 'slide.new', sub: 'One handler for every caller', code: true },
      {
        id: 'input',
        name: 'Input check',
        sub: 'The input matches the action’s schema',
        refusal: '400 with the failing field',
      },
      {
        id: 'revision',
        name: 'Revision check',
        sub: '`baseRevision` is current',
        refusal: '409 with the current document',
      },
      { id: 'history', name: 'Version history', sub: 'One new revision with its author' },
    ],
  },
} as const;

export const PRESENT_SCREEN = {
  heading: 'Present from Any Link',
  figure: {
    alt: 'The Turboslide viewer shows the example deck. Its bar holds Previous, the slide counter, Next, the Slide, Grid and Book views, Theme and Present.',
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
    alt: 'The slideshow window shows the slide to the audience. The S key opens presenter view, which only you see. Presenter view shows the timer, the current slide, the next slide and the speaker notes. The left and right arrow keys in either window move both windows.',
    show: { label: 'Slideshow', who: 'For the audience' },
    presenter: { label: 'Presenter view', who: 'For you' },
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
  heading: 'Animated Patterns',
  figure: {
    alt: 'A slide titled Questions from Northwind carries the Dithering pattern. The pattern is a sphere printed in dots, and its light moves around the sphere.',
  },
  slide: {
    heading: 'Questions from Northwind',
    sentence: 'Thank you for the time today.',
    counter: '8 / 9',
  },
  strip: {
    name: 'The pattern at 0, 2, 4, 6, 8 and 10 seconds, with the still at 4 seconds',
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
      { place: 'PDF and PowerPoint files', pattern: 'Still' },
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
  heading: 'PDF and PowerPoint Export',
  files: {
    heading: 'Orders by quarter',
    list: [
      {
        id: 'pdf',
        kind: 'PDF',
        name: 'Northwind quarterly review.pdf',
        says: [{ text: 'Each slide is one page of 13.333 by 7.5 in. You can search its text.' }],
      },
      {
        id: 'pictures',
        kind: 'PowerPoint, Pictures',
        name: 'Northwind quarterly review.pptx',
        says: [
          { text: 'The slide is ' },
          { text: 'one picture', part: 'object' },
          { text: ' of 3200 by 1800 pixels. Its text sits behind the picture in an ' },
          { text: 'invisible layer', part: 'hidden' },
          {
            text: ' that you can search. At most 0.1 percent of the pixels on each page differ from the browser.',
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
          { text: '. The chart is a ' },
          { text: 'PowerPoint chart', part: 'object' },
          { text: '. The layout matches the browser within 3 px.' },
        ],
      },
    ],
  },
  seam: {
    pictures: 'Pictures',
    editable: 'Editable text',
    alt: (c: { text: number; rect: number; line: number }): string =>
      `The opener field slide shows a lit sphere printed in dots, with a plate of text at the lower right. A seam divides the slide. On the left, the Pictures file holds the slide as one picture of 3200 by 1800 pixels. On the right is the Editable text file. Blue outlines mark its ${c.text} text boxes, ${c.rect} rectangles and ${c.line} lines over the background picture.`,
    holds: {
      pictures: (c: { text: number }): string =>
        `The file holds one picture of the slide, the logo and ${c.text} text boxes of invisible text.`,
      editable: (c: { text: number; rect: number; line: number }): string =>
        `The file holds ${c.text} text boxes, ${c.rect} rectangles, ${c.line} lines, the logo and the background picture.`,
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
      name: 'The seam between the two files',
      value: (p: number): string =>
        `${p} percent Pictures file on the left, ${100 - p} percent Editable text file on the right`,
    },
  },
} as const;

/**
 * The footer of every site page and the docs (SiteFooter.tsx): the lockup with the mark,
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
  made: { before: 'Made by', name: 'Kevin Liu', href: MAKER },
  build: {
    label: 'Build',
    name: (commit: string): string => `Build ${commit}, the commit on GitHub`,
    href: (commit: string): string => `${REPOSITORY}/commit/${commit}`,
  },
  appearance: { name: 'Appearance', light: 'Light', dark: 'Dark' },
} as const;
