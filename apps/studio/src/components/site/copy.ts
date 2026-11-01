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

/** The h1 in its four runs of words; the two rows sit after `people` and after `agents`. */
export const TITLE = {
  before: 'Presentations for',
  people: 'people',
  and: 'and',
  agents: 'agents',
} as const;

export const TITLE_TEXT = `${TITLE.before} ${TITLE.people} ${TITLE.and} ${TITLE.agents}`;

/**
 * The people of the title's first row: the generated names the product gives a visitor without
 * an account (`labelFor` of packages/identity/src/labels.ts: a word of LABEL_WORDS and a number),
 * never a real person's name, each drawn as a pointer in one of the live hues (slots 1 to 5).
 */
export const PEOPLE = [
  { name: 'Cobalt 118', hue: 1 },
  { name: 'Argon 905', hue: 2 },
  { name: 'Titanium 471', hue: 3 },
  { name: 'Neon 260', hue: 4 },
  { name: 'Xenon 734', hue: 5 },
] as const;

/** The agents of the second row, by their brand ids (agent-marks.tsx), each drawn as its mark. */
export const AGENTS = [
  { brand: 'claude-code' },
  { brand: 'codex' },
  { brand: 'openclaw' },
  { brand: 'hermes' },
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
 * The Agents screen (CanvasScreen.tsx): an agent builds the lighthouse slide in six writes
 * (agent-run.ts), then the slide is the reader's, a canvas whose heading, paragraph, credit and
 * plate select, move, resize and turn as the editor's objects do, on the editor's snap arithmetic
 * (canvas-pose.ts). The log beside the slide holds every write in the editor's spelling under who
 * made it. The words on the slide are the slide's own (home-deck/slides/lighthouse.json); the
 * objects' names and the handles' sentences are the Tooltip primitive's.
 */
export const CANVAS_SCREEN = {
  heading: 'Agents Edit Beside You',
  figure: {
    alt: 'Claude Code builds the lighthouse slide in six writes. It places a drone photograph of the lantern room of Cape Hatteras Light, a paper plate, the heading, a paragraph and the credit. Its last write moves the heading to the sky and turns it 6 degrees. Then every object on the slide is yours to move.',
  },
  log: {
    name: 'The writes on this slide in order, by Claude Code and by you',
    you: 'You',
  },
  replay: {
    name: 'Replay',
    doc: 'Plays the six writes of Claude Code again from an empty slide.',
  },
  slide: {
    heading: 'Cape Hatteras Light',
    paragraph:
      "The lantern of Cape Hatteras Light on North Carolina's Outer Banks, printed through an 8 by 8 screen at 2 px cells.",
    credit: 'Photograph: National Park Service, public domain',
  },
  /** each object by its block type, as the Tooltip primitive and a screen reader name it */
  objects: {
    box: { name: 'Plate', doc: 'Drag it to move it on the slide.', key: 'Arrow keys' },
    heading: { name: 'Heading', doc: 'Drag it to move it on the slide.', key: 'Arrow keys' },
    paragraph: { name: 'Paragraph', doc: 'Drag it to move it on the slide.', key: 'Arrow keys' },
    credit: { name: 'Credit', doc: 'Drag it to move it on the slide.', key: 'Arrow keys' },
  },
  resize: {
    name: 'Resize',
    doc: 'Drag the handle to resize the selection, and hold the shift key to keep its ratio.',
  },
  turn: {
    name: 'Rotate',
    doc: 'Drag the handle to turn the selection, and hold the shift key for 15 degree steps.',
    key: 'Arrow keys',
  },
  degrees: (deg: number): string => `${deg} degrees`,
} as const;

/**
 * The Themes screen (ThemesScreen.tsx): the title slide of the landing's own deck in each theme of
 * the library, in the picker's order, each tile the renderer's picture of it in the theme
 * (theme-tiles.ts). Each tile's name is the theme's, and its picture's alt names the theme.
 */
export const THEMES_SCREEN = {
  heading: 'Nine Themes',
  name: 'The title slide of one deck in each of the nine themes',
  alt: (theme: string): string => `The title slide of the onboarding plan in the ${theme} theme.`,
} as const;

/**
 * The Present screen (PresentScreen.tsx): the slideshow and presenter view, two windows that move
 * together (apps/studio/content/docs/presenting.mdx), walking the landing's own deck
 * (present-deck.ts), then the keys of a slideshow. The two arrow keys are buttons that move both
 * windows. The console's own words come from the viewer (PRESENT_TEXT).
 */
export const PRESENT_SCREEN = {
  heading: 'Present from Any Link',
  windows: {
    name: 'The slideshow and presenter view of one deck, which move together',
    show: 'Slideshow',
    presenter: 'Presenter view',
  },
  keysName: 'Keys during a slideshow',
  keys: [
    {
      key: '←',
      label: 'Previous slide',
      step: -1,
      doc: 'Moves both windows back one slide.',
      words: 'Left arrow',
    },
    {
      key: '→',
      label: 'Next slide',
      step: 1,
      doc: 'Moves both windows to the next slide.',
      words: 'Right arrow',
    },
    { key: 'S', label: 'Presenter view' },
    { key: 'L', label: 'Laser pointer' },
    { key: 'B', label: 'Black slide' },
    { key: 'Esc', label: 'Stop presenting' },
  ],
} as const;

/**
 * The Patterns screen (PatternsScreen.tsx): a slide with the Dithering pattern playing over its
 * time axis, which a pointer or the arrow keys scrub, with the moment every still place shows
 * marked on it, and one sentence on where the pattern moves
 * (apps/studio/content/docs/editor/objects.mdx).
 */
export const PATTERNS_SCREEN = {
  heading: 'Animated Patterns',
  lead: 'The pattern moves in the slideshow and the viewer and holds its still in the editor, the thumbnails and exported files.',
  figure: {
    alt: 'A slide titled Questions from Northwind carries the Dithering pattern. The pattern is a sphere printed in dots, and its light moves around the sphere.',
  },
  slide: {
    heading: 'Questions from Northwind',
    sentence: 'Thank you for the time today.',
    counter: '8 / 9',
  },
  time: {
    name: 'Time',
    doc: 'Shows the pattern at one moment.',
    key: 'Left and right arrows',
    seconds: [0, 2, 4, 6, 8, 10],
    still: 4,
    at: (s: number): string => `${s} s`,
    stillAt: (s: number): string => `Still, ${s} s`,
    value: (s: number): string => `${s.toFixed(1)} seconds`,
  },
} as const;

/**
 * The Export screen (ExportScreen.tsx): one slide cut by a seam between the two PowerPoint files
 * the CLI wrote for it, the parts each file holds outlined on its side (export-parts.ts), then
 * what each file File > Download writes holds. The modes' names are the Download dialog's
 * (DIALOGS.download), the numbers docs/pptx.md's, the counts the parts lists'.
 */
export const EXPORT_SCREEN = {
  heading: 'PDF and PowerPoint Export',
  files: {
    pictures: {
      name: 'Pictures',
      holds: (c: { text: number }): string =>
        `A PowerPoint file that holds this slide as one picture of 3200 by 1800 pixels over ${c.text} boxes of invisible text. At most 0.1 percent of its pixels differ from the browser.`,
    },
    editable: {
      name: 'Editable text',
      holds: (c: { text: number; rect: number; line: number }): string =>
        `A PowerPoint file that holds this slide as ${c.text} text boxes, ${c.rect} rectangles and ${c.line} lines over the background picture. Its layout matches the browser within 3 px.`,
    },
    pdf: {
      name: 'PDF',
      holds: 'One page of 13.333 by 7.5 in for each slide, with text you can search.',
    },
  },
  seam: {
    alt: (c: { text: number; rect: number; line: number }): string =>
      `The opener field slide shows a lit sphere printed in dots, with a plate of text at the lower right. A seam divides the slide. On the left, the Pictures file holds the slide as one picture of 3200 by 1800 pixels. On the right is the Editable text file. Blue outlines mark its ${c.text} text boxes, ${c.rect} rectangles and ${c.line} lines over the background picture.`,
    chips: {
      picture: 'Picture of the slide',
      invisible: 'Invisible text',
      background: 'Background picture',
      line: 'Line',
      rect: 'Rectangle',
      text: 'Text box',
    },
    slider: {
      name: 'The seam between the two files',
      tip: 'Seam',
      doc: 'Drag it to compare the two PowerPoint files.',
      key: 'Left and right arrows',
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
