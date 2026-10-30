import { SITE } from '@turboslide/theme/brand/site';

import { SITE_FACTS } from './facts';
import type { SiteIconName } from './SiteIcon';

/**
 * Every word of /features, /faq and /about (Kevin, 2026-10-15: "add an about, faq, and features
 * page"), in one module. Plain technical English as copy.ts writes it. Each claim is one the
 * documentation or the code states (the docs chapter a feature links to,
 * packages/schema/src/access.ts for a new presentation's access, docs/export.mdx and docs/editor
 * for the limits); a fact the code does not settle, such as a price, is left out. The counts come
 * from facts.ts. Inline code in an answer is written between backticks and drawn as `code`
 * (InlineCode.tsx).
 */

const REPOSITORY = SITE.repository;
const GITHUB_FILE = `${REPOSITORY}/blob/main`;
const F = SITE_FACTS;

/** A button of a page's head: Title Case words, a solid icon, and its `data-control` id. */
type PageAction = {
  id: string;
  label: string;
  href: string;
  icon: SiteIconName;
  external?: boolean;
};

/**
 * A site page's head: the h1 with its key words in the accent (Keyed.tsx), the lead where the page
 * has one, and the page's two buttons, New Presentation first, as /home draws its own.
 */
export type PageHeadCopy = {
  title: string;
  keys: readonly string[];
  lead?: string;
  actions: readonly PageAction[];
};

/** New Presentation, the first button of every page's head. */
const NEW_PRESENTATION = { label: 'New Presentation', href: '/new', icon: 'plus' } as const;

/**
 * One framed shot of a page's first screen: a docs figure (public/docs/figures) or a code panel,
 * under a head that names it and, where it has one, links to the block or question it belongs to.
 */
export type Shot = {
  id: string;
  label: string;
  icon: SiteIconName;
  /** the block or answer of the page the shot belongs to */
  href?: string;
} & ({ kind: 'crop'; name: string; alt: string } | { kind: 'code'; lines: readonly string[] });

/** One feature: its name, one sentence, and its chapter of the documentation. */
type Feature = { name: string; sentence: string; href: string };

/** A figure of a group: a crop of the product (public/docs/figures) or a code panel. */
type GroupFigure =
  { kind: 'crop'; name: string; alt: string } | { kind: 'code'; lines: readonly string[] };

export type FeatureGroup = {
  id: string;
  heading: string;
  /** the words of the heading drawn in the accent */
  keys: readonly string[];
  docs: { label: string; href: string };
  figure: GroupFigure;
  features: readonly Feature[];
};

export const FEATURES_HEAD: PageHeadCopy = {
  title: 'Features for people and agents',
  keys: ['people', 'agents'],
  actions: [
    { id: 'site.features.new', ...NEW_PRESENTATION },
    { id: 'site.features.docs', label: 'Read the Docs', href: '/docs', icon: 'book-open' },
  ],
};

/**
 * The first screen of /features: the Theme panel and File > Download that a person uses, and the
 * commands an agent runs for the same work, each a shot that links to its group below.
 */
export const FEATURES_SHOTS: readonly Shot[] = [
  {
    id: 'make',
    kind: 'crop',
    name: 'themes-panel',
    label: 'Theme panel',
    icon: 'pencil-square',
    href: '#make',
    alt: 'The Theme panel shows the Light and Dark appearances, the Swiss theme and brand kit of this presentation, and the first theme tile, Simple.',
  },
  {
    id: 'export',
    kind: 'crop',
    name: 'file-download',
    label: 'File > Download',
    icon: 'arrow-down-tray',
    href: '#export',
    alt: 'The File menu is open at Download, which lists Microsoft PowerPoint, PDF Document, JPEG image, PNG image and More formats.',
  },
  {
    id: 'agents',
    kind: 'code',
    label: 'Command line',
    icon: 'command-line',
    href: '#agents',
    lines: [
      'turboslide info --json',
      'turboslide slides --json',
      'turboslide slide new --layout split --after title',
      'turboslide render all --theme light,dark --out renders --json',
      'turboslide lint all --json',
      'turboslide export pptx --mode flatten --theme both --out exports',
    ],
  },
];

/** The counts under the shots, read from facts.ts. */
export const FEATURE_COUNTS = [
  { id: 'actions', label: 'Actions', value: F.actions, href: '/docs/reference' },
  { id: 'layouts', label: 'Layouts', value: F.layouts, href: '/docs/editor/slides#layouts' },
  { id: 'themes', label: 'Themes', value: F.themes, href: '/docs/themes' },
  { id: 'materials', label: 'Animated patterns', value: F.materials, href: '/docs/editor' },
] as const;

export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  {
    id: 'make',
    heading: 'Make Slides in the Browser',
    keys: ['Browser'],
    docs: { label: 'The editor', href: '/docs/editor' },
    figure: {
      kind: 'crop',
      name: 'editor-top',
      alt: "The top of the Turboslide editor shows the title row with the presentation's name, then the menus and the toolbar. The menus are File, Edit, View, Insert, Format, Slide, Arrange, Tools and Help.",
    },
    features: [
      {
        name: 'Slides and layouts',
        sentence: `You can add, duplicate, skip and move slides. Each slide uses one of ${F.layouts} layouts.`,
        href: '/docs/editor/slides',
      },
      {
        name: 'Text, pictures and shapes',
        sentence:
          'You can write and format text, add pictures and logos, and draw shapes, lines and connectors. You can also edit tables and charts.',
        href: '/docs/editor/objects',
      },
      {
        name: 'Themes and brand kits',
        sentence: `Each of the ${F.themes} themes has a light and a dark appearance. A brand kit adds your logo, colors, fonts and footer to a theme.`,
        href: '/docs/themes',
      },
      {
        name: 'Animated patterns',
        sentence: `Insert > Animated pattern adds one of ${F.materials} moving patterns to a slide.`,
        href: '/docs/editor#the-menus',
      },
      {
        name: 'Speaker notes',
        sentence:
          'The notes pane under the slide holds what you will say. Presenter view shows the notes. A PDF or PowerPoint file can include them.',
        href: '/docs/editor#speaker-notes',
      },
      {
        name: 'Version history',
        sentence:
          'Turboslide saves every change as you make it. Version history restores any earlier version.',
        href: '/docs/editor#version-history',
      },
      {
        name: 'Assist',
        sentence:
          "The assistant can shorten a slide's text or write its speaker notes. Nothing changes until you accept the result.",
        href: '/docs/editor#assist',
      },
      {
        name: 'Search the menus',
        sentence: 'Help > Search the menus finds any command by its name.',
        href: '/docs/editor#the-menus',
      },
    ],
  },
  {
    id: 'present',
    heading: 'Present Full Screen',
    keys: ['Full Screen'],
    docs: { label: 'Presenting', href: '/docs/presenting' },
    figure: {
      kind: 'crop',
      name: 'viewer-bar',
      alt: "The right end of the viewer's bar holds the Slide, Grid and Book views, Theme, Present, full screen, Copy link and Help.",
    },
    features: [
      {
        name: 'Slideshow',
        sentence:
          'A slideshow starts from the current slide or from the first slide. It leaves out skipped slides.',
        href: '/docs/presenting#start-a-slideshow',
      },
      {
        name: 'Presenter view',
        sentence:
          'A second window shows your notes, the previous and next slides and a timer. It stays on the same slide as the slideshow.',
        href: '/docs/presenting#presenter-view',
      },
      {
        name: 'Keys',
        sentence:
          'You can use the keyboard to go to a slide by number, turn on the laser pointer or show a black or white slide.',
        href: '/docs/presenting#keys-during-a-slideshow',
      },
      {
        name: 'Present from a link',
        sentence:
          'Anyone with a view link can present in the viewer. A link with `?present=1` starts the slideshow when the page opens.',
        href: '/docs/presenting#present-from-a-link',
      },
      {
        name: 'Print',
        sentence: 'File > Print prints the presentation with one slide on each page.',
        href: '/docs/export#print',
      },
    ],
  },
  {
    id: 'share',
    heading: 'Share and Edit Together',
    keys: ['Together'],
    docs: { label: 'Sharing and people', href: '/docs/sharing' },
    figure: {
      kind: 'crop',
      name: 'share-dialog',
      alt: "The sharing dialog sets General access to Anyone with the link, with the role Viewer. It also shows Copy Link, the Open as a slideshow box, the owner's row and More.",
    },
    features: [
      {
        name: 'Links',
        sentence:
          'A link gives anyone who has it the role of viewer, commenter or editor. You can rotate or revoke a link.',
        href: '/docs/sharing#share-by-link',
      },
      {
        name: 'People by name',
        sentence:
          'When you are signed in, you can add people by email with a role and an expiration date. A person without access can request it.',
        href: '/docs/sharing#share-with-people-by-name',
      },
      {
        name: 'Editing together',
        sentence:
          'Several people can edit one presentation at the same time. The title row shows a chip for each person. Live pointers show where each person points.',
        href: '/docs/sharing#work-together',
      },
      {
        name: 'Follow',
        sentence: 'When you follow a person, your stage shows the slide that person has open.',
        href: '/docs/sharing#work-together',
      },
      {
        name: 'Comments',
        sentence:
          'You can comment on an object, a text selection, a table cell or a whole slide. You reply in the Comments panel.',
        href: '/docs/sharing#comments',
      },
      {
        name: 'Signing in',
        sentence:
          'You can make and present without an account. With an account, you can open your presentations on another computer.',
        href: '/docs/sharing#signing-in',
      },
    ],
  },
  {
    id: 'export',
    heading: 'Downloads That Match the Slide',
    keys: ['Match'],
    docs: { label: 'Download and export', href: '/docs/export' },
    figure: {
      kind: 'crop',
      name: 'file-download',
      alt: 'The File menu is open at Download, which lists Microsoft PowerPoint, PDF Document, JPEG image, PNG image and More formats.',
    },
    features: [
      {
        name: 'PowerPoint',
        sentence:
          'In the Pictures mode, each slide is one picture that matches Turboslide. In the Editable text mode, you can change the text in PowerPoint.',
        href: '/docs/export#powerpoint-pictures-or-editable-text',
      },
      {
        name: 'PDF',
        sentence: 'A PDF has one slide on each page and can include the speaker notes.',
        href: '/docs/export#options',
      },
      {
        name: 'Pictures',
        sentence: 'You can download the current slide as a JPEG or PNG file.',
        href: '/docs/export#formats',
      },
      {
        name: 'Web page',
        sentence: 'A web page is one HTML file that opens in any browser and presents the slides.',
        href: '/docs/export#formats',
      },
      {
        name: 'Turboslide file',
        sentence:
          'A Turboslide file is a .zip file of the whole presentation with its pictures. File > Open and Import slides read it back.',
        href: '/docs/export#formats',
      },
    ],
  },
  {
    id: 'agents',
    heading: 'Feature Parity for Agents',
    keys: ['Agents'],
    docs: { label: 'Agents', href: '/docs/agents' },
    figure: {
      kind: 'code',
      lines: [
        'turboslide info --json',
        'turboslide slide new --layout split --after title',
        'turboslide export pptx --mode flatten --theme both --out exports',
      ],
    },
    features: [
      {
        name: 'One table of actions',
        sentence: `Turboslide has ${F.actions} actions. Each action has one input schema, and every transport checks it the same way.`,
        href: '/docs/reference',
      },
      {
        name: 'Command line',
        sentence: `${F.cli} actions run as \`turboslide\` commands with JSON output and exit codes.`,
        href: '/docs/agents/cli',
      },
      {
        name: 'MCP',
        sentence: `${F.mcp} actions run as MCP tools over standard input and output or over HTTP at \`/mcp\`.`,
        href: '/docs/agents/mcp',
      },
      {
        name: 'HTTP',
        sentence: `${F.http} actions run at \`POST /api/actions/<id>\`, and an OpenAPI file describes them.`,
        href: '/docs/agents/http',
      },
      {
        name: 'The page API',
        sentence: `${F.page} actions run in an open page through \`window.turboslide.studio\`.`,
        href: '/docs/agents/browser',
      },
      {
        name: 'Skills',
        sentence:
          'Four skills show an agent how to write slides, call the actions, control an open page and check its work.',
        href: '/docs/agents/skills',
      },
      {
        name: 'Revisions and leases',
        sentence:
          'Each write names the revision it read. The server refuses the write with 409 if the presentation changed since then. A lease reserves a slide for ten minutes.',
        href: '/docs/agents#rules-every-agent-follows',
      },
    ],
  },
  {
    id: 'self-hosting',
    heading: 'Run It Yourself',
    keys: ['Yourself'],
    docs: { label: 'Run Turboslide yourself', href: '/docs/self-hosting' },
    figure: {
      kind: 'code',
      lines: [
        'git clone https://github.com/Kevin-Liu-01/Turboslide.git',
        'cd Turboslide',
        'corepack enable',
        'pnpm install',
        'pnpm dev',
      ],
    },
    features: [
      {
        name: 'Open source',
        sentence:
          'The studio, the command line and every package they use are in one repository under the MIT License.',
        href: '/docs/self-hosting',
      },
      {
        name: 'Your computer',
        sentence:
          '`pnpm dev` starts the studio at localhost:4321 and stores each presentation as a folder under `decks/`.',
        href: '/docs/self-hosting#run-it-on-your-computer',
      },
      {
        name: 'A server',
        sentence: 'The same code builds a Node server or a Vercel deployment.',
        href: '/docs/self-hosting#build-it-for-a-server',
      },
      {
        name: 'Storage',
        sentence:
          'The studio stores presentations in a folder, a temporary folder or Vercel Blob. An optional private store can hold the documents.',
        href: '/docs/self-hosting#where-presentations-are-stored',
      },
      {
        name: 'Accounts',
        sentence:
          'You can turn on sign in with Google, GitHub or email. Cloudflare D1 or SQLite stores the accounts.',
        href: '/docs/self-hosting#sign-in-and-accounts',
      },
      {
        name: 'Switches',
        sentence: 'An admin can turn off downloads and other features without a new deploy.',
        href: '/docs/self-hosting#limits-and-switches',
      },
    ],
  },
];

/** One question and its answer; `links` are the chapters that say more. */
export type Question = {
  id: string;
  question: string;
  answer: readonly string[];
  links: readonly { label: string; href: string }[];
};

export const FAQ_HEAD: PageHeadCopy = {
  title: 'Questions and answers',
  keys: ['answers'],
  actions: [
    { id: 'site.faq.new', ...NEW_PRESENTATION },
    { id: 'site.faq.docs', label: 'Read the Docs', href: '/docs', icon: 'book-open' },
  ],
};

/**
 * The shots of /faq: the part of the product an answer talks about, in a column beside the list
 * that holds the shot of the answer opened last (FaqPage.tsx). `href` is the answer the shot
 * belongs to.
 */
export const FAQ_SHOTS = {
  share: {
    id: 'share',
    kind: 'crop',
    name: 'share-dialog',
    label: 'Share',
    icon: 'user-group',
    href: '#privacy',
    alt: "The sharing dialog sets General access to Anyone with the link, with the role Viewer. It also shows Copy Link, the Open as a slideshow box, the owner's row and More.",
  },
  download: {
    id: 'download',
    kind: 'crop',
    name: 'file-download',
    label: 'File > Download',
    icon: 'arrow-down-tray',
    href: '#export',
    alt: 'The File menu is open at Download, which lists Microsoft PowerPoint, PDF Document, JPEG image, PNG image and More formats.',
  },
  agents: {
    id: 'agents',
    kind: 'code',
    label: 'Command line',
    icon: 'command-line',
    href: '#connect',
    lines: [
      'turboslide login --to https://www.turboslide.com',
      'turboslide mcp --deck <folder>',
      'turboslide slide new --layout split --after title',
    ],
  },
  source: {
    id: 'source',
    kind: 'code',
    label: 'Your computer',
    icon: 'code-bracket',
    href: '#self-host',
    lines: [
      'git clone https://github.com/Kevin-Liu-01/Turboslide.git',
      'cd Turboslide',
      'corepack enable',
      'pnpm install',
      'pnpm dev',
    ],
  },
} as const satisfies Record<string, Shot>;

export type FaqShotId = keyof typeof FAQ_SHOTS;

/** The shot each answer opens beside the list; an answer not named here leaves the shot as it is. */
export const FAQ_SHOT_FOR: Readonly<Record<string, FaqShotId>> = {
  privacy: 'share',
  collaborate: 'share',
  'present-link': 'share',
  export: 'download',
  backups: 'download',
  agents: 'agents',
  connect: 'agents',
  'self-host': 'source',
  license: 'source',
};

export const QUESTIONS: readonly Question[] = [
  {
    id: 'account',
    question: 'Do I need an account?',
    answer: [
      'You do not need an account. You can make, present and download a presentation without one.',
      'A presentation that you make without an account belongs to this browser. Sign in to open it on another computer or to share it with people by name.',
    ],
    links: [{ label: 'Signing in', href: '/docs/sharing#signing-in' }],
  },
  {
    id: 'cost',
    question: 'What is free to use?',
    answer: [
      'Everything on the features page is free. Turboslide has no paid plans and asks for no payment.',
      'To share with people by name, you must sign in with Google. Every person has the daily limits listed below.',
    ],
    links: [{ label: 'Limits and switches', href: '/docs/self-hosting#limits-and-switches' }],
  },
  {
    id: 'storage',
    question: 'Where are my presentations stored?',
    answer: [
      "On turboslide.com, the studio stores your presentations on its server. Without an account, a presentation belongs to this browser. If you clear the browser's site data, you lose access to it.",
      'When you run the studio from the repository, it stores each presentation as a folder under `decks/`.',
    ],
    links: [
      {
        label: 'Where presentations are stored',
        href: '/docs/self-hosting#where-presentations-are-stored',
      },
    ],
  },
  {
    id: 'privacy',
    question: 'Who can see my presentation?',
    answer: [
      'Only you can see a new presentation until you share it.',
      'Share gives access to anyone with the link or to people by name. Each person gets the role of viewer, commenter or editor. Only editors and the owner can see the speaker notes.',
    ],
    links: [{ label: 'Sharing and people', href: '/docs/sharing' }],
  },
  {
    id: 'export',
    question: 'Can I download PowerPoint and PDF files?',
    answer: [
      'File > Download makes a PowerPoint file, a PDF, a JPEG or PNG picture of the slide, a web page or a Turboslide file.',
      'The same renderer draws the editor and every download, so the file shows what you see on the slide.',
    ],
    links: [{ label: 'Download and export', href: '/docs/export' }],
  },
  {
    id: 'offline',
    question: 'Does it work offline?',
    answer: [
      'The editor needs a connection to the studio to open a presentation. If the connection drops while a presentation is open, this browser keeps up to 1 MB of changes. The editor sends them when the connection returns.',
    ],
    links: [{ label: 'Saving offline and limits', href: '/docs/editor#saving-offline-and-limits' }],
  },
  {
    id: 'agents',
    question: 'What can agents do?',
    answer: [
      `An agent can do everything that a person can do from the menus. Each menu command is one of ${F.actions} actions, which an agent runs over the command line, MCP, HTTP or an open page.`,
      'Each write names the revision it read, so an agent never writes over a change it has not seen.',
    ],
    links: [
      { label: 'Agents', href: '/docs/agents' },
      { label: 'Action reference', href: '/docs/reference' },
    ],
  },
  {
    id: 'connect',
    question: 'How do I connect Claude Code or Codex?',
    answer: [
      'Add `turboslide mcp --deck <folder>` to the agent’s MCP servers to work on a presentation folder.',
      'For turboslide.com, run `turboslide login --to https://www.turboslide.com` to get an API key. The agent then calls `/mcp` or the HTTP actions with that key. Give the agent the turboslide-api skill.',
    ],
    links: [
      { label: 'MCP', href: '/docs/agents/mcp' },
      { label: 'Skills', href: '/docs/agents/skills' },
    ],
  },
  {
    id: 'collaborate',
    question: 'Can several people edit at once?',
    answer: [
      'Changes from other people appear as they make them. The title row shows a chip for each person. View > Live pointers shows where each person points.',
    ],
    links: [{ label: 'Work together', href: '/docs/sharing#work-together' }],
  },
  {
    id: 'present-link',
    question: 'Can I present from a link?',
    answer: [
      'A view link opens the viewer, where anyone with the link can present. Add `?present=1` to the link to start the slideshow when the page opens.',
    ],
    links: [{ label: 'Present from a link', href: '/docs/presenting#present-from-a-link' }],
  },
  {
    id: 'self-host',
    question: 'Can I run it myself?',
    answer: [
      'Clone the repository and run `pnpm install` and `pnpm dev`. The studio opens at localhost:4321 and stores each presentation as a folder under `decks/`.',
      'The same code builds a Node server or a Vercel deployment.',
    ],
    links: [{ label: 'Run Turboslide yourself', href: '/docs/self-hosting' }],
  },
  {
    id: 'license',
    question: 'What is the license?',
    answer: [
      'Turboslide is open source under the MIT License. The repository holds the studio, the command line and every package they use. The third party notices list the code that it includes from other projects.',
    ],
    links: [
      { label: 'MIT License', href: `${GITHUB_FILE}/LICENSE` },
      { label: 'Third party notices', href: `${GITHUB_FILE}/THIRD_PARTY_NOTICES.md` },
    ],
  },
  {
    id: 'limits',
    question: 'What are the limits?',
    answer: [
      'A slide holds at most 200 kB. Without an account, a person can download 5 times a day. A signed in person can download 30 times a day. Downloads run one at a time.',
      'The assistant answers 20 requests a day without an account and 300 requests a day with one.',
    ],
    links: [
      { label: 'Who can download', href: '/docs/export#who-can-download' },
      { label: 'Saving offline and limits', href: '/docs/editor#saving-offline-and-limits' },
    ],
  },
  {
    id: 'backups',
    question: 'Are there backups?',
    answer: [
      'Turboslide saves every change as you make it. Version history restores any earlier version.',
      'A studio with a backup store copies the documents of every presentation to it each night. To keep your own copy, use File > Download > More formats > Turboslide file.',
    ],
    links: [
      { label: 'Version history', href: '/docs/editor#version-history' },
      {
        label: 'Where presentations are stored',
        href: '/docs/self-hosting#where-presentations-are-stored',
      },
    ],
  },
  {
    id: 'before-sign-in',
    question: 'What happens to the presentations I made before I signed in?',
    answer: [
      'The sign in page asks you first. Add Them moves them to your account. Keep Them Separate keeps them in this browser only.',
    ],
    links: [{ label: 'Signing in', href: '/docs/sharing#signing-in' }],
  },
  {
    id: 'delete-account',
    question: 'How do I delete my account?',
    answer: [
      'In the editor, open Profile from your account and choose Delete account. Turboslide removes the account after you confirm.',
    ],
    links: [{ label: 'Signing in', href: '/docs/sharing#signing-in' }],
  },
];

/** A block of /about: its sentence, then its paragraphs. */
export type AboutBlock = {
  id: string;
  heading: string;
  /** the words of the heading drawn in the accent */
  keys: readonly string[];
  body: readonly string[];
  points?: readonly { name: string; sentence: string }[];
  links?: readonly { label: string; href: string; external: boolean }[];
};

export const ABOUT_HEAD: PageHeadCopy = {
  title: 'About Turboslide',
  keys: ['Turboslide'],
  lead: 'Turboslide is a slides editor in the browser for people and agents.',
  actions: [
    { id: 'site.about.new', ...NEW_PRESENTATION },
    {
      id: 'site.about.source',
      label: 'Read the Source',
      href: REPOSITORY,
      icon: 'code-bracket',
      external: true,
    },
  ],
};

/**
 * The first screen of /about: the editor with both agents at work (the poster of /home's live
 * editor) beside the viewer on a phone, both captures of the real product (scripts/site/capture.mjs).
 */
export const ABOUT_FIGURE = {
  editor: {
    alt: 'The Turboslide editor shows a presentation titled Northwind quarterly review with its menus, toolbar, filmstrip and title slide. The pointers of Claude Code and Codex are on the slide.',
  },
  viewer: {
    alt: 'The Turboslide viewer shows the example deck in the Book view on a phone. Its bar holds the slide counter, the Slide, Grid and Book views, Theme and Help.',
  },
} as const;

/** The maker /about names (Kevin, 2026-10-30). */
export const KEVIN_LIU = 'https://kevinliu.studio';

export const ABOUT_BLOCKS: readonly AboutBlock[] = [
  {
    id: 'what',
    heading: 'Slides in the Browser',
    keys: ['Browser'],
    body: [
      'You start a presentation at turboslide.com/new, present it full screen and send the link. Turboslide saves it as you type.',
      'A slide is a layout with typed blocks in named slots on a sheet of 1600 by 900 pixels. A program can read and write it as data.',
    ],
    links: [
      { label: 'Features', href: '/features', external: false },
      { label: 'Deck grammar', href: '/docs/agents/grammar', external: false },
    ],
  },
  {
    id: 'agents',
    heading: 'Every Command Is an Action',
    keys: ['Action'],
    body: [
      `Turboslide keeps every operation in one table of ${F.actions} actions. The menus, the command line, MCP, HTTP and the page API all come from that table. An agent can therefore do everything that a person can do.`,
      'Each action checks its input the same way on every transport. A write names the revision it read. The server refuses the write if the presentation changed since that revision.',
    ],
    links: [{ label: 'Agents', href: '/docs/agents', external: false }],
  },
  {
    id: 'principles',
    heading: 'Your Presentations Stay Yours',
    keys: ['Yours'],
    body: [],
    points: [
      {
        name: 'No account needed',
        sentence: 'You can make, present and download a presentation without signing in.',
      },
      {
        name: 'Plain files',
        sentence:
          'A presentation is a folder of JSON files. It holds `deck.json` and one file for each slide. A Turboslide file carries the folder and its pictures.',
      },
      {
        name: 'Your data',
        sentence:
          'Only you can see a new presentation until you share it. You can download it as a PowerPoint file, a PDF or a Turboslide file.',
      },
    ],
  },
  {
    id: 'source',
    heading: 'Open Source',
    keys: ['Open Source'],
    body: [
      'The repository holds the studio, the command line and every package they use. Anyone can read the code and run the studio on their own computer or server.',
    ],
    links: [
      { label: 'GitHub', href: REPOSITORY, external: true },
      { label: 'MIT License', href: `${GITHUB_FILE}/LICENSE`, external: true },
      { label: 'Run Turboslide yourself', href: '/docs/self-hosting', external: false },
    ],
  },
  {
    id: 'maker',
    heading: 'Made by Kevin Liu',
    keys: ['Kevin Liu'],
    body: [],
    links: [{ label: 'kevinliu.studio', href: KEVIN_LIU, external: true }],
  },
  {
    id: 'contact',
    heading: 'Feedback on GitHub',
    keys: ['GitHub'],
    body: [
      'Open an issue in the repository. Describe what you did, what you expected and what happened. Include the address of the page.',
    ],
  },
];

export const ABOUT_ISSUE = { label: 'Open an Issue', href: `${REPOSITORY}/issues/new` } as const;

/** The labels the pages share. */
export const PAGES = {
  docsLink: 'Read the chapter',
  countsName: 'Turboslide in numbers',
  shotsName: 'Turboslide for people and agents',
  shotName: 'The product this answer is about',
  aboutShotsName: 'The editor and the viewer',
  questionsName: 'Questions',
} as const;
