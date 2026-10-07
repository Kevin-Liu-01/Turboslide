/**
 * The landing's words of the design round (docs/DESIGN.md 8; lane D4), apart from copy.ts while
 * copy.ts waits for the round's merge of origin/main (DESIGN.md 10.0 lists it among the files
 * another round changes). copy.test.ts reads every string here through the same lints as copy.ts:
 * no em dash, en dash or exclamation mark, no metaphor and no "X, not Y", sentence case with Title
 * Case on buttons alone, and no name of another company's slides app. A string here replaces the
 * copy.ts string it names; the page draws this one.
 */

/**
 * The motion toggle's name and its tooltip (DESIGN.md 8.1). Since polish two (docs/POLISH-2.md
 * 3.1) the toggles are the hero terminal's icon button and the footer's text button; the
 * navigation draws none.
 */
export const NAV_ICONS = {
  motion: { pause: 'Pause motion', play: 'Play motion' },
} as const;

/** The footer's motion toggle, a text button (docs/POLISH-2.md 3.1): its two labels. */
export const MOTION_BUTTON = { pause: 'Pause Motion', play: 'Play Motion' } as const;

/** The h1 in its two lines (DESIGN.md 8.2, question 20); replaces copy.ts `HERO.h1Lines`. */
const H1_LINES = ['Presentations for', 'people and agents'] as const;

/** The hero (DESIGN.md 8.2): the h1, the lead after the visit sentence, the frame and the terminal. */
export const HERO_ROUND = {
  h1Lines: H1_LINES,
  heading: H1_LINES.join(' '),
  /** the lead after its visit sentence; replaces copy.ts `HERO.lead` */
  lead: 'It has a CLI and an MCP server, so agents edit the same deck. No account is needed.',
  frame: {
    toolbarLabel: 'Toolbar',
    /** the agent's chip in the presence slot */
    agent: 'Agent',
    notesLabel: 'Speaker notes',
  },
  terminal: {
    /** the panel's head: the agent, then the recording's length (the caption folded in) */
    agent: 'Agent',
    recorded: (seconds: number): string => `Recorded from the CLI, ${seconds} s`,
    stepsLabel: "The recording's four steps",
    /** a step's length in its row, tabular: "2.5 s" */
    length: (seconds: string): string => `${seconds} s`,
  },
} as const;

/**
 * The numbers row (DESIGN.md 8.3): each cell's noun beside its figure, its place in the editor as
 * crumbs, and the actions cell's chips, the CLI's, the MCP server's and the HTTP API's counts,
 * said here once (they leave the agents band's lead). Replaces copy.ts `NUMBERS`'s sentences.
 */
export const NUMBERS_ROUND = {
  label: 'Turboslide in four numbers',
  nouns: { actions: 'actions', layouts: 'layouts', patterns: 'patterns', shapes: 'shapes' },
  chips: { cli: 'CLI', mcp: 'MCP', http: 'HTTP' },
  chipsLabel: 'The actions each agent surface runs',
} as const;

/**
 * The menus band (DESIGN.md 8.4): the h2 and one sentence; replaces copy.ts `MENUS.h2` and
 * `MENUS.lead`, which named another company's menus.
 */
export const MENUS_ROUND = {
  h2: 'Menus and keyboard shortcuts',
  lead: 'It has menus and keyboard shortcuts for editing, arranging and presenting.',
} as const;

/**
 * The canvas band's Format options readout (DESIGN.md 8.5): the section the page adds to the
 * product's panel and the panel's accessible name.
 */
export const CANVAS_ROUND = {
  command: 'Command',
  panelLabel: 'Format options of the selected object',
} as const;

/** A band's Undo as a glyph button (the miniature's title row, the canvas panel's head). */
export const BAND_CONTROLS = { undo: 'Undo' } as const;

/**
 * The line diagrams of the Present and export bands (DESIGN.md 8.0 "Diagrams", 8.10, 8.11): each
 * one's sentence, its accessible name, which the bands' markup carries.
 */
export const DIAGRAMS_ROUND = {
  present: {
    label:
      'The editor, presenter view and a phone with the show, joined by the S key and a present link.',
  },
  export: { label: 'A slide with a line to two files, pitch.pdf and pitch.pptx.' },
  agents: {
    label:
      'The CLI, the MCP server and the HTTP API send one action, which the deck records in Version history.',
  },
} as const;

/**
 * The diagrams' labels, drawn at build into the landing's sprite (scripts/home/sprite.ts); no
 * component imports them, so the route's script leaves them out.
 */
export const DIAGRAM_WORDS = {
  present: {
    editor: 'Editor',
    presenter: 'Presenter view',
    timer: 'Timer',
    notes: 'Notes',
    next: 'Next slide',
    show: 'Show',
    key: 'S',
    link: 'present link',
  },
  export: { slide: 'Slide', pdf: 'pitch.pdf', pptx: 'pitch.pptx' },
  agents: {
    cli: 'CLI',
    mcp: 'MCP',
    http: 'HTTP',
    action: 'One action',
    deck: 'Deck',
    history: 'Version history',
  },
} as const;

/**
 * The figures of the Present and patterns bands (DESIGN.md 8.10, 8.12): the presenter view's
 * description and caption, and the name of the patterns gallery's list.
 */
export const FIGURES_ROUND = {
  presenter: {
    alt: "Presenter view of this page's deck on slide 2, with the timer, the next slide and the speaker notes.",
    caption:
      'Presenter view opens in a second window with the timer, the next slide and your notes.',
  },
  download: {
    alt: "The editor's Download dialog with Microsoft PowerPoint (.pptx) in Pictures or Editable text, and PDF Document (.pdf)",
  },
  patterns: { label: 'The patterns of Insert > Animated pattern' },
} as const;

/**
 * Themes and brand kits (DESIGN.md 8.7): the band's h2 and lead, which replace copy.ts `KITS.h2`
 * and `KITS.lead`, the theme row's key and the status line after a pick.
 */
export const KITS_ROUND = {
  h2: 'Themes and brand kits',
  lead: 'Pick one of nine themes, then put your colors and logo over it.',
  themeKey: 'Theme',
  status: { theme: (name: string): string => `Every slide is in the ${name} theme now.` },
  /** the row of the kit's six colours (DESIGN.md 8.7) */
  colorsKey: 'Colors',
  /**
   * the six colour roles in the Brand kit panel's order and words (packages/schema/src/brand.ts
   * KIT_COLORS and KIT_COLOR_WORDS; copy.test.ts pins them; the page does not import the schema)
   */
  roles: ['Text', 'Background', 'Captions', 'Hints', 'Primary', 'Accent'],
  /** the contrast of the kit's text on its background, by the page's one contrast function */
  ratio: (ratio: number): string => `Text on background reads ${ratio.toFixed(1)} to 1`,
} as const;

/** The agents band's lead without the figures the numbers row says (DESIGN.md 8.3, 8.8). */
export const AGENTS_ROUND = {
  lead: "The CLI, the MCP server and the HTTP API run the editor's actions. The commands below change the slide above them.",
  /**
   * Version history as the editor's panel draws it (DESIGN.md 8.8): the changes made on this page
   * under Today, newest first, and the recorded run under the CLI's group with each version's
   * number; the first version is the deck as the CLI's version list names it
   */
  history: {
    today: 'Today',
    recorded: 'Recorded from the CLI',
    empty: 'A change you make on this page is listed here.',
    version: (n: number): string => `v${n}`,
  },
} as const;

/**
 * The two people band's Share dialog (DESIGN.md 8.9), in the editor's own words (copy.test.ts pins
 * each to packages/chrome/src/menus/strings.ts DIALOGS.share; the page does not import the editor's
 * strings): the general access, the link of this page with Copy Link, the people with their roles
 * and the slide each is on, and Done
 */
export const PEOPLE_ROUND = {
  share: {
    title: (name: string): string => `Share ${name}`,
    generalAccess: 'General access',
    anyoneWithLink: 'Anyone with the link',
    anyoneCanEdit: 'Anyone with this link can edit',
    linkLabel: 'The link to this page',
    copyLink: 'Copy Link',
    linkCopied: 'Link copied',
    you: 'You',
    roles: { owner: 'Owner', editor: 'Editor' },
    editing: (n: number): string => `Editing slide ${n}`,
    done: 'Done',
    doneSays: 'Done closes the dialog in the editor.',
  },
} as const;

/** The close (DESIGN.md 8.14): the h2 and one line; replaces copy.ts `CLOSE.h2` and `CLOSE.lead`. */
export const CLOSE_ROUND = {
  h2: 'Start a presentation',
  lead: 'No account is needed. The first edit saves it.',
} as const;

/** Every string of this module, keyed, for the lints of copy.test.ts. */
export const DESIGN_COPY = {
  navIcons: NAV_ICONS,
  motionButton: MOTION_BUTTON,
  hero: HERO_ROUND,
  numbers: NUMBERS_ROUND,
  menus: MENUS_ROUND,
  canvas: CANVAS_ROUND,
  controls: BAND_CONTROLS,
  diagrams: DIAGRAMS_ROUND,
  diagramWords: DIAGRAM_WORDS,
  figures: FIGURES_ROUND,
  kits: KITS_ROUND,
  agents: AGENTS_ROUND,
  people: PEOPLE_ROUND,
  close: CLOSE_ROUND,
} as const;
