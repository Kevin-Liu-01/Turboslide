import { SITE } from '@turboslide/theme/brand/site';

import { HOME_LEAD } from './meta';

/**
 * Every word of /home in one module (docs/SITE.md A.1), so copy.test.ts and the competitor guard
 * read one file. Plain technical English: declarative sentences in sentence case, no em dash, no
 * metaphor, Title Case on buttons alone (DECK-GRAMMAR.md:22). The h1 stays "Presentations for
 * people and agents" (Kevin, 2026-10-14). The counts come from facts.ts and the recorded commands
 * from run.ts; nothing here types a number the tree holds.
 */

export const REPOSITORY = SITE.repository;
const GITHUB_FILE = `${REPOSITORY}/blob/main`;

export const NAV = {
  skip: 'Skip to Content',
  lockup: { word: 'Turboslide', name: 'Turboslide home' },
  links: [
    { id: 'site.nav.docs', label: 'Documentation', href: '/docs', external: false },
    { id: 'site.nav.github', label: 'GitHub', href: REPOSITORY, external: true },
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

/** The tooltip sentence under an avatar's name. */
export const AVATAR_DOCS = {
  person: 'A visitor without an account works under a generated name like this one.',
  agent: 'An agent that runs Turboslide’s actions over the command line, MCP or HTTP.',
} as const;

export const HERO = {
  lead: HOME_LEAD,
  primary: { label: 'New Presentation', href: '/new', id: 'site.hero.new' },
  secondary: { label: 'Open the Example Deck', href: '/deck/gt-brand', id: 'site.hero.example' },
  note: 'No account is needed.',
  figure: {
    number: '01',
    label: 'The editor',
    caption:
      'Claude Code and Codex are editing this presentation with you. It lives only in this tab.',
    alt: 'The Turboslide editor on a presentation titled Northwind quarterly review. It shows the title row with Share, the menus File to Help, the toolbar, the filmstrip of five slides and the title slide on the stage.',
    frameTitle: 'The Turboslide editor with Claude Code and Codex',
  },
} as const;

export const AGENTS_SCREEN = {
  number: '02',
  label: 'Agents',
  sentence: 'An agent runs the same actions as the menus.',
  terminal: {
    label: 'Recorded from the CLI',
    count: (n: number): string => `${n} commands`,
  },
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
  note: 'Each transport checks an action’s input the same way. A write names the version of the presentation it read, and if the presentation changed since, it is refused with 409 and the current document.',
} as const;

export const PRESENT_SCREEN = {
  number: '03',
  label: 'Present',
  sentence: 'Anyone with the link can open the presentation and present it.',
  figure: {
    label: 'The viewer',
    address: 'turboslide.com/deck/gt-brand',
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
} as const;

export const FOOTER = {
  name: 'Turboslide, back to the top',
  nav: 'Footer',
  columns: [
    {
      id: 'presentations',
      title: 'Presentations',
      icon: 'presentation-chart-bar',
      links: [
        { label: 'New presentation', href: '/new', external: false },
        { label: 'Your presentations', href: '/decks', external: false },
        { label: 'The example deck', href: '/deck/gt-brand', external: false },
      ],
    },
    {
      id: 'documentation',
      title: 'Documentation',
      icon: 'book-open',
      links: [
        { label: 'Getting started', href: '/docs', external: false },
        { label: 'Agents', href: '/docs/agents', external: false },
        { label: 'Action reference', href: '/docs/reference', external: false },
      ],
    },
    {
      id: 'source',
      title: 'Source',
      icon: 'code-bracket',
      links: [
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
  made: 'Turboslide is made by General Translation.',
  licence: 'Turboslide is open source under the MIT License.',
} as const;
