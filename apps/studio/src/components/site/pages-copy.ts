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
export type PageAction = {
  id: string;
  label: string;
  href: string;
  icon: SiteIconName;
  external?: boolean;
};

/**
 * A site page's head: the h1 with its key words in the accent (Keyed.tsx), the lead that says what
 * the page holds, and the page's two buttons, New Presentation first, as /home draws its own.
 */
export type PageHeadCopy = {
  title: string;
  keys: readonly string[];
  lead: string;
  actions: readonly PageAction[];
};

/** New Presentation, the first button of every page's head. */
const NEW_PRESENTATION = { label: 'New Presentation', href: '/new', icon: 'plus' } as const;

/**
 * One framed shot of a page's first screen: a docs figure (public/docs/figures) or a code panel,
 * under a head that names it and, where it has one, the block or question it belongs to.
 */
export type Shot = {
  id: string;
  label: string;
  icon: SiteIconName;
  /** the block or answer of the page the shot belongs to, and its number */
  href?: string;
  number?: string;
  caption: string;
} & ({ kind: 'crop'; name: string; alt: string } | { kind: 'code'; lines: readonly string[] });

/** One feature: its name, one sentence, and its chapter of the documentation. */
export type Feature = { name: string; sentence: string; href: string };

/** A figure of a group: a crop of the product (public/docs/figures) or a code panel. */
export type GroupFigure =
  | { kind: 'crop'; name: string; alt: string; caption: string }
  | { kind: 'code'; label: string; lines: readonly string[]; caption: string };

export type FeatureGroup = {
  id: string;
  number: string;
  label: string;
  icon: SiteIconName;
  sentence: string;
  /** the words of the sentence drawn in the accent */
  keys: readonly string[];
  docs: { label: string; href: string };
  figure: GroupFigure;
  features: readonly Feature[];
};

export const FEATURES_HEAD: PageHeadCopy = {
  title: 'Features for people and agents',
  keys: ['people', 'agents'],
  lead: 'What Turboslide does today, in six groups. Each feature links to its chapter of the documentation.',
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
    number: '01',
    href: '#make',
    alt: 'The Theme panel: the Light and Dark appearance, the Swiss theme and brand kit of this presentation, and the first theme tile, Simple.',
    caption: `${F.themes} themes, each with a light and a dark appearance.`,
  },
  {
    id: 'export',
    kind: 'crop',
    name: 'file-download',
    label: 'File > Download',
    icon: 'arrow-down-tray',
    number: '04',
    href: '#export',
    alt: 'The File menu open at Download, with Microsoft PowerPoint, PDF Document, JPEG image, PNG image and More formats.',
    caption: 'PowerPoint, PDF, JPEG and PNG from the File menu.',
  },
  {
    id: 'agents',
    kind: 'code',
    label: 'Command line',
    icon: 'command-line',
    number: '05',
    href: '#agents',
    lines: [
      'turboslide info --json',
      'turboslide slides --json',
      'turboslide slide new --layout split --after title',
      'turboslide render all --theme light,dark --out renders --json',
      'turboslide lint all --json',
      'turboslide export pptx --mode flatten --theme both --out exports',
    ],
    caption: 'The same work as actions an agent runs.',
  },
];

/** The counts under the lead, read from facts.ts. */
export const FEATURE_COUNTS = [
  { id: 'actions', label: 'Actions', value: F.actions, href: '/docs/reference' },
  { id: 'layouts', label: 'Layouts', value: F.layouts, href: '/docs/editor/slides#layouts' },
  { id: 'themes', label: 'Themes', value: F.themes, href: '/docs/themes' },
  { id: 'materials', label: 'Animated patterns', value: F.materials, href: '/docs/editor' },
] as const;

export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  {
    id: 'make',
    number: '01',
    label: 'Make',
    icon: 'pencil-square',
    sentence: 'Make a presentation in the browser, with no account.',
    keys: ['no account'],
    docs: { label: 'The editor', href: '/docs/editor' },
    figure: {
      kind: 'crop',
      name: 'editor-top',
      alt: "The top of the Turboslide editor: the title row with the presentation's name, the menus File, Edit, View, Insert, Format, Slide, Arrange, Tools and Help, and the toolbar.",
      caption: 'The title row, the menus and the toolbar of the editor.',
    },
    features: [
      {
        name: 'Slides and layouts',
        sentence: `Add, duplicate, skip and move slides, and give each slide one of ${F.layouts} layouts.`,
        href: '/docs/editor/slides',
      },
      {
        name: 'Text, pictures and shapes',
        sentence:
          'Write and format text, add pictures and logos, draw shapes, lines and connectors, and edit tables and charts.',
        href: '/docs/editor/objects',
      },
      {
        name: 'Themes and brand kits',
        sentence: `Pick one of ${F.themes} themes, each with a light and a dark appearance, and lay your logo, colors, fonts and footer over it.`,
        href: '/docs/themes',
      },
      {
        name: 'Animated patterns',
        sentence: `Insert > Animated pattern places one of ${F.materials} moving patterns on a slide.`,
        href: '/docs/editor#the-menus',
      },
      {
        name: 'Speaker notes',
        sentence:
          'Write what you will say under each slide. The notes show in Presenter view and can go into a PDF or PowerPoint file.',
        href: '/docs/editor#speaker-notes',
      },
      {
        name: 'Version history',
        sentence:
          'Every change is saved as you make it, and Version history brings back any earlier version.',
        href: '/docs/editor#version-history',
      },
      {
        name: 'Assist',
        sentence:
          "The assistant shortens a slide's text or writes its speaker notes, and nothing changes until you accept.",
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
    number: '02',
    label: 'Present',
    icon: 'play',
    sentence: 'Present full screen, with your notes in a second window.',
    keys: ['full screen'],
    docs: { label: 'Presenting', href: '/docs/presenting' },
    figure: {
      kind: 'crop',
      name: 'viewer-bar',
      alt: "The right end of the viewer's bar: the Slide, Grid and Book views, Theme, Present, full screen, Copy link and Help.",
      caption: "The right end of the viewer's bar. Present starts the slideshow.",
    },
    features: [
      {
        name: 'Slideshow',
        sentence: 'Present from the current slide or from the first. Skipped slides are left out.',
        href: '/docs/presenting#start-a-slideshow',
      },
      {
        name: 'Presenter view',
        sentence:
          'A second window shows your notes, the previous and the next slide and a timer, and stays on the slide the slideshow shows.',
        href: '/docs/presenting#presenter-view',
      },
      {
        name: 'Keys',
        sentence:
          'Go to a slide by its number, turn on the laser pointer, or show a black or a white slide from the keyboard.',
        href: '/docs/presenting#keys-during-a-slideshow',
      },
      {
        name: 'Present from a link',
        sentence:
          'Anyone with a view link can present in the viewer, and `?present=1` starts the slideshow as the page opens.',
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
    number: '03',
    label: 'Share and work together',
    icon: 'user-group',
    sentence: 'Share by link or by name, and edit together.',
    keys: ['edit together'],
    docs: { label: 'Sharing and people', href: '/docs/sharing' },
    figure: {
      kind: 'crop',
      name: 'share-dialog',
      alt: "The sharing dialog: General access set to Anyone with the link with the role Viewer, Copy Link, the Open as a slideshow box, the owner's row and More.",
      caption: 'The sharing dialog with Anyone with the link and Viewer chosen.',
    },
    features: [
      {
        name: 'Links',
        sentence:
          'Share with anyone who has the link, as a viewer, a commenter or an editor. A link can be rotated or revoked.',
        href: '/docs/sharing#share-by-link',
      },
      {
        name: 'People by name',
        sentence:
          'Signed in, add people by email with a role and an expiration date. A person without access can ask for it.',
        href: '/docs/sharing#share-with-people-by-name',
      },
      {
        name: 'Editing together',
        sentence:
          'Several people edit one presentation at once. The title row shows a chip for each person, and live pointers show where they point.',
        href: '/docs/sharing#work-together',
      },
      {
        name: 'Follow',
        sentence: 'Follow a person to keep the slide they have open on your stage.',
        href: '/docs/sharing#work-together',
      },
      {
        name: 'Comments',
        sentence:
          'Comment on an object, some text, a table cell or a whole slide, and reply in the Comments panel.',
        href: '/docs/sharing#comments',
      },
      {
        name: 'Signing in',
        sentence:
          'No account is needed to make or present. Sign in to open your presentations on another computer.',
        href: '/docs/sharing#signing-in',
      },
    ],
  },
  {
    id: 'export',
    number: '04',
    label: 'Export',
    icon: 'arrow-down-tray',
    sentence: 'Download what you see on the slide.',
    keys: ['what you see'],
    docs: { label: 'Download and export', href: '/docs/export' },
    figure: {
      kind: 'crop',
      name: 'file-download',
      alt: 'The File menu open at Download, with Microsoft PowerPoint, PDF Document, JPEG image, PNG image and More formats.',
      caption: 'File > Download. The web page and the Turboslide file are under More formats.',
    },
    features: [
      {
        name: 'PowerPoint',
        sentence:
          'Each slide as a picture that looks the same as in Turboslide, or with text you can change in PowerPoint.',
        href: '/docs/export#powerpoint-pictures-or-editable-text',
      },
      {
        name: 'PDF',
        sentence: 'One slide on each page, with the speaker notes if you include them.',
        href: '/docs/export#options',
      },
      {
        name: 'Pictures',
        sentence: 'The current slide as a JPEG or a PNG file.',
        href: '/docs/export#formats',
      },
      {
        name: 'Web page',
        sentence: 'One HTML file that opens in any browser and presents the slides.',
        href: '/docs/export#formats',
      },
      {
        name: 'Turboslide file',
        sentence:
          'The whole presentation with its pictures in a .zip file that File > Open and Import slides read back.',
        href: '/docs/export#formats',
      },
    ],
  },
  {
    id: 'agents',
    number: '05',
    label: 'Agents',
    icon: 'command-line',
    sentence: 'Every menu command is an action an agent can run.',
    keys: ['agent'],
    docs: { label: 'Agents', href: '/docs/agents' },
    figure: {
      kind: 'code',
      label: 'Command line',
      lines: [
        'turboslide info --json',
        'turboslide slide new --layout split --after title',
        'turboslide export pptx --mode flatten --theme both --out exports',
      ],
      caption: 'Three commands from the command line chapter.',
    },
    features: [
      {
        name: 'One table of actions',
        sentence: `${F.actions} actions, each with one input schema that every transport checks the same way.`,
        href: '/docs/reference',
      },
      {
        name: 'Command line',
        sentence: `${F.cli} actions as \`turboslide\` commands, with JSON output and exit codes.`,
        href: '/docs/agents/cli',
      },
      {
        name: 'MCP',
        sentence: `${F.mcp} actions as MCP tools, over standard input and output or over HTTP at \`/mcp\`.`,
        href: '/docs/agents/mcp',
      },
      {
        name: 'HTTP',
        sentence: `${F.http} actions at \`POST /api/actions/<id>\`, described by an OpenAPI file.`,
        href: '/docs/agents/http',
      },
      {
        name: 'The page API',
        sentence: `${F.page} actions in an open page through \`window.turboslide.studio\`.`,
        href: '/docs/agents/browser',
      },
      {
        name: 'Skills',
        sentence:
          'Four skills teach an agent to write slides, call the actions, drive an open page and check its work.',
        href: '/docs/agents/skills',
      },
      {
        name: 'Revisions and leases',
        sentence:
          'A write names the revision it read and is refused with 409 if the presentation changed. A lease reserves a slide for ten minutes.',
        href: '/docs/agents#rules-every-agent-follows',
      },
    ],
  },
  {
    id: 'self-hosting',
    number: '06',
    label: 'Run it yourself',
    icon: 'code-bracket',
    sentence: 'Run the studio from its repository on your own computer or server.',
    keys: ['your own'],
    docs: { label: 'Run Turboslide yourself', href: '/docs/self-hosting' },
    figure: {
      kind: 'code',
      label: 'Your computer',
      lines: [
        'git clone https://github.com/Kevin-Liu-01/Turboslide.git',
        'cd Turboslide',
        'corepack enable',
        'pnpm install',
        'pnpm dev',
      ],
      caption: 'The studio then answers at localhost:4321.',
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
          '`pnpm dev` starts the studio at localhost:4321 and keeps each presentation as a folder under `decks/`.',
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
          'Keep presentations in a folder, a temporary folder or Vercel Blob, with an optional private store for the documents.',
        href: '/docs/self-hosting#where-presentations-are-stored',
      },
      {
        name: 'Accounts',
        sentence:
          'Turn on sign in with Google, GitHub or email, with the accounts in Cloudflare D1 or SQLite.',
        href: '/docs/self-hosting#sign-in-and-accounts',
      },
      {
        name: 'Switches',
        sentence: 'The admin turns a feature such as downloads off without a deploy.',
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
  lead: 'What people ask before they make a presentation with Turboslide. Each answer links to the documentation that says more.',
  actions: [
    { id: 'site.faq.new', ...NEW_PRESENTATION },
    { id: 'site.faq.docs', label: 'Read the Docs', href: '/docs', icon: 'book-open' },
  ],
};

/**
 * The shots of /faq: the part of the product an answer talks about, in a column beside the list
 * that holds the shot of the answer opened last (FaqPage.tsx). `href` is the answer the shot
 * belongs to; its number is that question's place in the list.
 */
export const FAQ_SHOTS = {
  share: {
    id: 'share',
    kind: 'crop',
    name: 'share-dialog',
    label: 'Share',
    icon: 'user-group',
    href: '#privacy',
    alt: "The sharing dialog: General access set to Anyone with the link with the role Viewer, Copy Link, the Open as a slideshow box, the owner's row and More.",
    caption: 'Share sets who can open a presentation and what each person can do.',
  },
  download: {
    id: 'download',
    kind: 'crop',
    name: 'file-download',
    label: 'File > Download',
    icon: 'arrow-down-tray',
    href: '#export',
    alt: 'The File menu open at Download, with Microsoft PowerPoint, PDF Document, JPEG image, PNG image and More formats.',
    caption: 'PowerPoint, PDF, JPEG and PNG, and the Turboslide file under More formats.',
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
    caption: 'An agent signs in once, then runs the same actions as the menus.',
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
    caption: 'The studio then answers at localhost:4321.',
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
      'No. You can make, present and download a presentation without one.',
      'A presentation made without an account belongs to this browser. Sign in to open it on another computer or to share it with people by name.',
    ],
    links: [{ label: 'Signing in', href: '/docs/sharing#signing-in' }],
  },
  {
    id: 'cost',
    question: 'What is free to use?',
    answer: [
      'Everything on the features page. The studio has no paid plans and asks for no payment.',
      'Sharing with people by name needs a sign in with Google, and every person has the daily limits below.',
    ],
    links: [{ label: 'Limits and switches', href: '/docs/self-hosting#limits-and-switches' }],
  },
  {
    id: 'storage',
    question: 'Where are my presentations stored?',
    answer: [
      "On turboslide.com, in the studio's store on its server. Without an account a presentation belongs to this browser, and clearing the browser's site data loses access to it.",
      'A copy of the repository keeps each presentation as a folder under `decks/`.',
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
      'Only you, until you share it. A new presentation is restricted to the person who made it.',
      'Share adds a link for anyone who has it, or people by name, each as a viewer, a commenter or an editor. Speaker notes reach editors and the owner only.',
    ],
    links: [{ label: 'Sharing and people', href: '/docs/sharing' }],
  },
  {
    id: 'export',
    question: 'Can I download PowerPoint and PDF files?',
    answer: [
      'Yes. File > Download makes a PowerPoint file, a PDF, a JPEG or PNG picture of the slide, a web page or a Turboslide file.',
      'Every download is drawn by the same renderer as the editor, so the file shows what you see on the slide.',
    ],
    links: [{ label: 'Download and export', href: '/docs/export' }],
  },
  {
    id: 'offline',
    question: 'Does it work offline?',
    answer: [
      'The editor needs the studio to open a presentation. If the connection drops while it is open, your changes wait in this browser, up to 1 MB, and are sent when it reconnects.',
    ],
    links: [{ label: 'Saving offline and limits', href: '/docs/editor#saving-offline-and-limits' }],
  },
  {
    id: 'agents',
    question: 'What can agents do?',
    answer: [
      `What a person can do from the menus. Every command is one of ${F.actions} actions that an agent runs over the command line, MCP, HTTP or an open page.`,
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
      'For turboslide.com, `turboslide login --to https://www.turboslide.com` gets an API key, and the agent calls `/mcp` or the HTTP actions with it. Give the agent the turboslide-api skill.',
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
      'Yes. Changes from others appear as they are made. The title row shows a chip for each person, and View > Live pointers shows where they point.',
    ],
    links: [{ label: 'Work together', href: '/docs/sharing#work-together' }],
  },
  {
    id: 'present-link',
    question: 'Can I present from a link?',
    answer: [
      'Yes. A view link opens the viewer, where anyone with the link can present. Add `?present=1` to the link to start the slideshow as the page opens.',
    ],
    links: [{ label: 'Present from a link', href: '/docs/presenting#present-from-a-link' }],
  },
  {
    id: 'self-host',
    question: 'Can I run it myself?',
    answer: [
      'Yes. Clone the repository, run `pnpm install` and `pnpm dev`, and the studio opens at localhost:4321 with each presentation as a folder under `decks/`.',
      'The same code builds a Node server or a Vercel deployment.',
    ],
    links: [{ label: 'Run Turboslide yourself', href: '/docs/self-hosting' }],
  },
  {
    id: 'license',
    question: 'What is the license?',
    answer: [
      'The MIT License. The repository holds the studio, the command line and every package they use, and the third party notices list the code from other projects it includes.',
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
      'A slide holds at most 200 kB. A person can download 5 times a day without an account and 30 times signed in, one download at a time.',
      'The assistant answers 20 requests a day without an account and 300 signed in.',
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
      'Every change is saved as you make it, and Version history brings back any earlier version.',
      'A studio set up with a backup store copies the documents of every presentation there each night. File > Download > More formats > Turboslide file keeps a copy of your own.',
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
      'The sign in page asks first. Add Them moves them to your account, and Keep Them Separate keeps them in this browser alone.',
    ],
    links: [{ label: 'Signing in', href: '/docs/sharing#signing-in' }],
  },
  {
    id: 'delete-account',
    question: 'How do I delete my account?',
    answer: [
      'Open Profile from your account in the editor and choose Delete account. The account is removed after you confirm.',
    ],
    links: [{ label: 'Signing in', href: '/docs/sharing#signing-in' }],
  },
];

/** A block of /about: its number, label, icon and sentence, then its paragraphs. */
export type AboutBlock = {
  id: string;
  number: string;
  label: string;
  icon: SiteIconName;
  sentence: string;
  /** the words of the sentence drawn in the accent */
  keys: readonly string[];
  body: readonly string[];
  points?: readonly { name: string; sentence: string }[];
  links?: readonly { label: string; href: string; external: boolean }[];
};

export const ABOUT_HEAD: PageHeadCopy = {
  title: 'About Turboslide',
  keys: ['Turboslide'],
  lead: 'Turboslide is a slides editor in the browser for people and agents. It is open source under the MIT License and made by General Translation.',
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
    label: 'The editor',
    icon: 'pencil-square',
    caption: 'Claude Code and Codex at work on a presentation.',
    alt: 'The Turboslide editor on a presentation titled Northwind quarterly review, with the menus, the toolbar, the filmstrip and the title slide. The pointers of Claude Code and Codex are on the slide.',
  },
  viewer: {
    label: 'The viewer',
    icon: 'play',
    caption: 'Anyone with the link presents it.',
    alt: 'The Turboslide viewer on a phone in the Book view of the example deck, with the slide counter, the Slide, Grid and Book views, Theme and Help in its bar.',
  },
} as const;

export const GENERAL_TRANSLATION = 'https://generaltranslation.com';

export const ABOUT_BLOCKS: readonly AboutBlock[] = [
  {
    id: 'what',
    number: '01',
    label: 'What it is',
    icon: 'presentation-chart-bar',
    sentence: 'A slides editor in the browser.',
    keys: ['browser'],
    body: [
      'You start a presentation at turboslide.com/new, present it full screen and send the link. It is saved as you type.',
      'A slide is a layout with typed blocks in named slots on a sheet of 1600 by 900 pixels, so a program can read and write it as data.',
    ],
    links: [
      { label: 'Features', href: '/features', external: false },
      { label: 'Deck grammar', href: '/docs/agents/grammar', external: false },
    ],
  },
  {
    id: 'agents',
    number: '02',
    label: 'Agent native',
    icon: 'command-line',
    sentence: 'Every menu command is an action.',
    keys: ['action'],
    body: [
      `Turboslide keeps every operation in one table of ${F.actions} actions. The menus, the command line, MCP, HTTP and the page API are made from that table, so an agent can do what a person can.`,
      'Each action checks its input the same way on every transport. A write names the revision it read, and it is refused if the presentation changed since.',
    ],
    links: [{ label: 'Agents', href: '/docs/agents', external: false }],
  },
  {
    id: 'principles',
    number: '03',
    label: 'Principles',
    icon: 'check-badge',
    sentence: 'Your presentations stay yours.',
    keys: ['yours'],
    body: [],
    points: [
      {
        name: 'No account needed',
        sentence: 'Make, present and download a presentation without signing in.',
      },
      {
        name: 'Plain files',
        sentence:
          'A presentation is a folder of JSON files: `deck.json` and one file for each slide. A Turboslide file carries the folder with its pictures.',
      },
      {
        name: 'Your data',
        sentence:
          'A new presentation is restricted to you until you share it. Downloads take it out as PowerPoint, PDF or a Turboslide file.',
      },
    ],
  },
  {
    id: 'source',
    number: '04',
    label: 'Open source',
    icon: 'code-bracket',
    sentence: 'Open source under the MIT License.',
    keys: ['Open source'],
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
    number: '05',
    label: 'Who makes it',
    icon: 'globe-alt',
    sentence: 'Made by General Translation.',
    keys: ['General Translation'],
    body: [],
    links: [{ label: 'generaltranslation.com', href: GENERAL_TRANSLATION, external: true }],
  },
  {
    id: 'contact',
    number: '06',
    label: 'Contact',
    icon: 'chat-bubble-left-right',
    sentence: 'Report a problem or ask for a feature on GitHub.',
    keys: ['GitHub'],
    body: [
      'Open an issue in the repository. Say what you did, what you expected and what happened, with the address of the page.',
    ],
  },
];

export const ABOUT_ISSUE = { label: 'Open an Issue', href: `${REPOSITORY}/issues/new` } as const;

/** The labels the pages share. */
export const PAGES = {
  docsLink: 'Read the chapter',
  figure: 'Figure',
  countsName: 'Turboslide in numbers',
  shotsName: 'Turboslide for people and agents',
  shotName: 'The product this answer is about',
  aboutShotsName: 'The editor and the viewer',
  codeSource: 'From the docs',
  commands: (n: number): string => `${n} commands`,
  questionsName: 'Questions',
} as const;
