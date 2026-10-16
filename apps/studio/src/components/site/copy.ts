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
  note: 'No account is needed.',
  figure: {
    number: '01',
    label: 'The editor',
    caption:
      'Claude Code and Codex are editing this presentation with you. It lives only in this tab.',
    alt: 'The Turboslide editor on a presentation titled Northwind quarterly review. It shows the title row with Share, the menus File to Help, the toolbar, the filmstrip of five slides and the title slide on the stage. The pointers of Claude Code and Codex are on the slide.',
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

/**
 * The footer of every site page and the docs (SiteFooter.tsx): the lockup with the animated mark,
 * one sentence, four columns of links, then the maker, the build and the appearance switch.
 */
export const FOOTER = {
  word: 'Turboslide',
  /** the lockup's name on /home, where it goes back to the top, and on every other page */
  top: 'Turboslide, back to the top',
  home: 'Turboslide home',
  sentence:
    'Turboslide is a slides editor in the browser for people and agents. Every command in its menus is also an action an agent can run.',
  /** the words of the sentence drawn in the site accent, as the title draws them */
  keys: ['people', 'agents'],
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
