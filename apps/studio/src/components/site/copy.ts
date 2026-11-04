import { SITE } from '@turboslide/theme/brand/site';

import { SITE_FACTS } from './facts';
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
 * The chapters after the hero (Chapters.tsx): one section each, its heading and one sentence
 * beside a live editor that plays the chapter in the deck (try/story.ts). Each heading is a short
 * Title Case phrase, as the screens' were; each sentence says what that editor shows.
 */
export const STORY = {
  /** each chapter's editor frame, named for the screen reader */
  frameTitle: (heading: string): string => `The Turboslide editor, ${heading}`,
  chapters: [
    {
      id: 'agents',
      heading: 'Agents Edit Beside You',
      lead: 'Claude Code and Codex build a slide while you watch, ask each other in comments and answer with edits.',
    },
    {
      id: 'features',
      heading: 'Every Feature You Reach For',
      lead: `The editor has charts, tables, shapes, animation and ${SITE_FACTS.themes} themes, and every deck downloads as PowerPoint with its text still editable.`,
    },
    {
      id: 'together',
      heading: 'Edit Together',
      lead: 'People and agents open the same link, each with a pointer, and talk in comments on the slide.',
    },
    {
      id: 'present',
      heading: 'Present from the Editor',
      lead: 'The slideshow starts from any slide with its transitions, and the deck you edit is the deck you show.',
    },
  ],
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
