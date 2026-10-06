/**
 * The landing's words of the design round (docs/DESIGN.md 8; lane D4), apart from copy.ts while
 * copy.ts waits for the round's merge of origin/main (DESIGN.md 10.0 lists it among the files
 * another round changes). copy.test.ts reads every string here through the same lints as copy.ts:
 * no em dash, en dash or exclamation mark, no metaphor and no "X, not Y", sentence case with Title
 * Case on buttons alone, and no name of another company's slides app. A string here replaces the
 * copy.ts string it names; the page draws this one.
 */

/** The navigation's icon controls (DESIGN.md 8.1): the motion toggle's name and its tooltip. */
export const NAV_ICONS = {
  motion: { pause: 'Pause motion', play: 'Play motion' },
} as const;

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

/** Every string of this module, keyed, for the lints of copy.test.ts. */
export const DESIGN_COPY = {
  navIcons: NAV_ICONS,
  hero: HERO_ROUND,
} as const;
