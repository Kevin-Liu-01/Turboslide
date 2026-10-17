import type { ActionId } from '@turboslide/schema/actions';

import { HERO_PICTURE, HERO_SLIDES } from './hero-deck';

/**
 * What Claude Code and Codex do in the landing's live editor (docs/SITE.md C.9): data, not code.
 * Each agent works through its tasks in order and starts again; a task is a few steps on one
 * slide and names itself in a few words (`doing`), which the agent's chip and flags show. The
 * runner (agents.ts) reads the steps, moves the agent's pointer, writes through the page API's
 * own path (`editorAdapter().invoke`, every write one action of the table with the agent's
 * `baseRevision`) and keeps the agent off the visitor's slide and selection. The two agents work
 * at once on different slides for the whole loop, about fifty seconds: Claude Code adds and
 * writes slides, rewrites a title, places and crops a picture, writes speaker notes, adds a row,
 * moves a slide, changes a layout, tries a theme, evens out the shapes Codex drew and puts back
 * the number Codex raised; Codex adds a chart and a table and fills them, draws, drags and aligns
 * shapes, animates the chart and tidies a sentence Claude Code wrote; they comment on each
 * other's work, answer and resolve the threads, and at the end each removes what it added, so the
 * loop ends on the deck it started from.
 *
 * Strings carry two placeholders the runner fills: `{loop}`, the loop's number (so the ids an
 * agent mints are fresh each loop), and `$<key>`, a value an earlier step saved (`save`).
 *
 * Every slide looks finished at every moment a visitor or the poster can catch: what an agent adds
 * arrives whole (a new slide with its heading, sentence and rows or picture; a chart with its
 * data; a table with every cell; a shape with its words), a chart grows from smaller values, and
 * a `write` step only erases back to the words the old and the new text share, so a text never
 * empties (script.test.ts).
 */
export type AgentKey = 'claude' | 'codex';

/** A point on the 1600 by 900 sheet. */
export type SheetPoint = { x: number; y: number };

export type Step =
  /** the pointer travels to a point of the slide (and the agent's stage moves there) */
  | { kind: 'point'; slide: string; at: SheetPoint }
  /** the agent selects a block (its outline in the agent's hue) */
  | { kind: 'select'; slide: string; block: string }
  /** one action; `save` keeps a field of its answer under a key for later steps */
  | {
      kind: 'act';
      action: ActionId;
      slide: string;
      block?: string;
      input: Record<string, unknown>;
      save?: { key: string; from: string };
    }
  /**
   * Writes a Text to `text` a letter at a time with the caret following: erases back to the start
   * the text there and `text` share, one `slide.update` text.replace a letter, then types the
   * rest, one `text.insert` a letter. Run again, it carries on from where it stopped.
   */
  | { kind: 'write'; slide: string; block: string; path: string; text: string }
  /** writes a slide's speaker notes to `text` a word at a time, one `slide.update` a word */
  | { kind: 'notes'; slide: string; text: string }
  /** drags a block on a canvas slide: drag presence frames, then one `block.set /pos` at the release */
  | { kind: 'drag'; slide: string; block: string; to: SheetPoint }
  /** waits until the other agent has said `signal` in this loop */
  | { kind: 'wait'; signal: string }
  /** tells the other agent */
  | { kind: 'signal'; signal: string }
  /** names the step now under way, in place of the task's words */
  | { kind: 'say'; words: string }
  | { kind: 'hold'; ms: number };

export type Task = {
  name: string;
  /** what the agent's chip and flags say while the task runs, a few words ("adding a chart") */
  doing: string;
  /** the steps, in order */
  steps: readonly Step[];
  /**
   * The task runs only when every slide and block it names exists (`slide` or `slide#block`),
   * and is skipped otherwise: a visitor may have removed what it works on.
   */
  needs?: readonly string[];
  /**
   * The task waits for the other agent's signal (or every one of several) in this loop, and the
   * agent does its next tasks meanwhile; one still waiting after WAIT_MS is dropped (a tidy task
   * runs then instead).
   */
  after?: string | readonly string[];
  /** a tidy task: it removes only what the agent made and nobody else wrote (agents.ts) */
  tidy?: true;
};

export type AgentScript = Readonly<Record<AgentKey, readonly Task[]>>;

/** The slides the agents add each loop, and the shapes Codex draws. */
const NEXT_STEPS = 'next-steps-{loop}';
const WAREHOUSE = 'warehouse-{loop}';
const REGIONS = 'regions-{loop}';
const ORDER_FLOW = 'order-flow-{loop}';

/** The id prefixes of the slides the agents add; the runner's cap counts them (agents.ts). */
const AGENT_SLIDE_PREFIXES = ['next-steps-', 'warehouse-', 'regions-', 'order-flow-'];

/** Whether a slide is one the agents added. */
export function isAgentSlide(slideId: string): boolean {
  return AGENT_SLIDE_PREFIXES.some((prefix) => slideId.startsWith(prefix));
}

const { agenda, numbers, plan, shipped } = HERO_SLIDES;

/** The slide Claude Code adds first, whole: a heading, a sentence it then writes on, two rows. */
const NEXT_STEPS_SLIDE = {
  schemaVersion: 1,
  id: NEXT_STEPS,
  kind: 'content',
  template: 'rows',
  layout: { type: 'cols', ratio: '5/7', gap: 72, align: 'center' },
  slots: {
    left: [
      { id: 'h', type: 'heading', level: 'h2', text: 'Next steps' },
      { id: 'p1', type: 'paragraph', text: 'Two releases next quarter.', measure: 56 },
    ],
    right: [
      {
        id: 'rows',
        type: 'rows',
        key: 180,
        tight: true,
        items: [
          { key: 'January', value: 'One checkout for every region' },
          { key: 'March', value: 'Returns start from the order page' },
        ],
      },
    ],
  },
} as const;

/** The picture slide Claude Code adds, whole: a heading, a sentence and the warehouse picture. */
const WAREHOUSE_SLIDE = {
  schemaVersion: 1,
  id: WAREHOUSE,
  kind: 'content',
  layout: { type: 'cols', ratio: '5/7', gap: 72, align: 'center' },
  slots: {
    left: [
      { id: 'h', type: 'heading', level: 'h2', text: 'The new warehouse' },
      {
        id: 'p1',
        type: 'paragraph',
        text: 'Opens in March and ships orders in a day.',
        measure: 40,
      },
    ],
    right: [{ id: 'pic', type: 'picture', asset: HERO_PICTURE }],
  },
} as const;

/** The chart slide Codex adds, whole: a heading and a sentence, before the chart and the table. */
const REGIONS_SLIDE = {
  schemaVersion: 1,
  id: REGIONS,
  kind: 'content',
  layout: { type: 'freeform' },
  slots: {
    main: [
      {
        id: 'h',
        type: 'heading',
        level: 'h2',
        text: 'Orders by region',
        pos: { x: 137, y: 110, w: 1100, h: 72, z: 0 },
      },
      {
        id: 'p1',
        type: 'paragraph',
        text: 'The fourth quarter, in thousands of orders.',
        pos: { x: 137, y: 196, w: 900, h: 40, z: 1 },
      },
    ],
  },
} as const;

const REGION_NAMES = ['North America', 'Europe', 'Asia', 'South America'];

const regionData = (values: number[]) => ({
  categories: REGION_NAMES,
  series: [{ name: 'Orders', values }],
});

const regionChart = (values: number[]) => ({
  slideId: REGIONS,
  blockId: 'chart',
  ...regionData(values),
});

/** A box of Codex's order flow, at its first (uneven) place. */
const flowBox = (id: string, text: string, x: number, y: number, z: number) => ({
  id,
  type: 'box',
  fill: 'plate',
  stroke: 'ink',
  padding: 24,
  valign: 'middle',
  text,
  typography: { size: 26 },
  pos: { x, y, w: 320, h: 160, z },
});

/** The flow slide Codex adds, whole: a heading and the first box. */
const ORDER_FLOW_SLIDE = {
  schemaVersion: 1,
  id: ORDER_FLOW,
  kind: 'content',
  layout: { type: 'freeform' },
  slots: {
    main: [
      {
        id: 'h',
        type: 'heading',
        level: 'h2',
        text: 'How an order moves',
        pos: { x: 137, y: 110, w: 1100, h: 72, z: 0 },
      },
      flowBox('placed', 'Order placed', 137, 400, 1),
    ],
  },
} as const;

/** The arrow between two boxes of the flow once Claude Code has evened the gaps. */
const flowArrow = (id: string, x: number) => ({
  id,
  type: 'shape',
  shape: 'arrow',
  stroke: 'ink',
  width: 1.5,
  pos: { x, y: 468, w: 143, h: 24, z: 4 },
});

/**
 * The end of an agent's loop: it removes each slide it added, once the other agent is done with
 * them (`after`), so the loop ends on the deck it started from; a slide the visitor wrote on stays.
 */
const cleanup = (after: readonly string[], slides: readonly string[]): Task[] =>
  slides.map((slide) => ({
    name: `Remove ${slide}`,
    doing: 'putting the deck back',
    after,
    tidy: true,
    steps: [
      { kind: 'point', slide, at: { x: 800, y: 450 } },
      { kind: 'act', action: 'slide.remove', slide, input: { slideId: slide } },
    ],
    needs: [slide],
  }));

export const SCRIPT: AgentScript = {
  claude: [
    {
      name: 'Add a slide after What shipped',
      doing: 'adding a slide',
      steps: [
        { kind: 'point', slide: shipped, at: { x: 1180, y: 640 } },
        {
          kind: 'act',
          action: 'slide.insert',
          slide: NEXT_STEPS,
          input: { sectionId: 'deck', after: shipped, slide: NEXT_STEPS_SLIDE },
        },
      ],
      needs: [shipped],
    },
    {
      name: 'Write on the new slide',
      doing: 'writing a point',
      steps: [
        { kind: 'point', slide: NEXT_STEPS, at: { x: 420, y: 520 } },
        {
          kind: 'write',
          slide: NEXT_STEPS,
          block: 'p1',
          path: '/text',
          text: 'Two releases next quarter. Both ship to every region at once.',
        },
        { kind: 'signal', signal: 'written' },
      ],
      needs: [`${NEXT_STEPS}#p1`],
    },
    {
      name: 'Rewrite the title',
      doing: 'rewriting the title',
      steps: [
        { kind: 'point', slide: NEXT_STEPS, at: { x: 330, y: 380 } },
        { kind: 'select', slide: NEXT_STEPS, block: 'h' },
        { kind: 'write', slide: NEXT_STEPS, block: 'h', path: '/text', text: 'Next releases' },
      ],
      needs: [`${NEXT_STEPS}#h`],
    },
    {
      name: 'Add a picture slide',
      doing: 'adding a picture slide',
      steps: [
        { kind: 'point', slide: numbers, at: { x: 1200, y: 700 } },
        {
          kind: 'act',
          action: 'slide.insert',
          slide: WAREHOUSE,
          input: { sectionId: 'deck', after: numbers, slide: WAREHOUSE_SLIDE },
        },
      ],
      needs: [numbers],
    },
    {
      name: 'Crop the picture',
      doing: 'cropping the picture',
      steps: [
        { kind: 'point', slide: WAREHOUSE, at: { x: 1100, y: 450 } },
        { kind: 'select', slide: WAREHOUSE, block: 'pic' },
        {
          kind: 'act',
          action: 'block.crop',
          slide: WAREHOUSE,
          block: 'pic',
          input: {
            slideId: WAREHOUSE,
            blockId: 'pic',
            trim: { left: 0.16, right: 0.06, top: 0.04, bottom: 0.1 },
          },
        },
        { kind: 'point', slide: WAREHOUSE, at: { x: 1230, y: 380 } },
        {
          kind: 'act',
          action: 'block.crop',
          slide: WAREHOUSE,
          block: 'pic',
          input: {
            slideId: WAREHOUSE,
            blockId: 'pic',
            trim: { left: 0.32, right: 0.12, top: 0.06, bottom: 0.18 },
          },
        },
        { kind: 'signal', signal: 'cropped' },
      ],
      needs: [`${WAREHOUSE}#pic`],
    },
    {
      name: 'Animate the heading',
      doing: 'animating the heading',
      steps: [
        { kind: 'point', slide: WAREHOUSE, at: { x: 330, y: 330 } },
        { kind: 'select', slide: WAREHOUSE, block: 'h' },
        {
          kind: 'act',
          action: 'motion.add',
          slide: WAREHOUSE,
          block: 'h',
          input: {
            slideId: WAREHOUSE,
            effect: { block: 'h', role: 'enter', motion: { preset: 'word-rise' }, start: 'click' },
          },
        },
      ],
      needs: [`${WAREHOUSE}#h`],
    },
    {
      name: 'Write the speaker notes',
      doing: 'writing speaker notes',
      steps: [
        { kind: 'point', slide: NEXT_STEPS, at: { x: 800, y: 820 } },
        {
          kind: 'notes',
          slide: NEXT_STEPS,
          text: 'Start with January. Both releases reach every region on the same day.',
        },
      ],
      needs: [NEXT_STEPS],
    },
    {
      name: 'Add a row to the next steps',
      doing: 'adding a row',
      steps: [
        { kind: 'point', slide: NEXT_STEPS, at: { x: 1100, y: 560 } },
        { kind: 'select', slide: NEXT_STEPS, block: 'rows' },
        {
          kind: 'act',
          action: 'block.set',
          slide: NEXT_STEPS,
          block: 'rows',
          input: {
            slideId: NEXT_STEPS,
            blockId: 'rows',
            path: '/items',
            value: [
              { key: 'January', value: 'One checkout for every region' },
              { key: 'March', value: 'Returns start from the order page' },
              { key: 'May', value: 'Sellers set prices by region' },
            ],
          },
        },
      ],
      needs: [`${NEXT_STEPS}#rows`],
    },
    {
      name: 'Ask Codex about the chart',
      doing: 'asking Codex about the chart',
      after: 'chart-ready',
      steps: [
        { kind: 'point', slide: REGIONS, at: { x: 600, y: 520 } },
        { kind: 'select', slide: REGIONS, block: 'chart' },
        {
          kind: 'act',
          action: 'comment.add',
          slide: REGIONS,
          block: 'chart',
          input: {
            anchor: { kind: 'block', slideId: REGIONS, blockId: 'chart' },
            body: { text: 'Can this chart show each region’s share?', mentions: [] },
          },
          save: { key: 'chartThread', from: 'thread.id' },
        },
        { kind: 'signal', signal: 'asked' },
      ],
      needs: [`${REGIONS}#chart`],
    },
    {
      name: 'Move the new slide up',
      doing: 'moving a slide up',
      steps: [
        { kind: 'point', slide: NEXT_STEPS, at: { x: 800, y: 450 } },
        {
          kind: 'act',
          action: 'slide.move',
          slide: NEXT_STEPS,
          input: { slideId: NEXT_STEPS, sectionId: 'deck', after: agenda },
        },
      ],
      needs: [NEXT_STEPS],
    },
    {
      name: 'Answer Codex',
      doing: 'answering Codex',
      after: 'review-asked',
      steps: [
        { kind: 'point', slide: NEXT_STEPS, at: { x: 460, y: 540 } },
        {
          kind: 'write',
          slide: NEXT_STEPS,
          block: 'p1',
          path: '/text',
          text: 'Two releases next quarter. Both ship to all four regions at once.',
        },
        {
          kind: 'act',
          action: 'comment.reply',
          slide: NEXT_STEPS,
          input: {
            threadId: '$sentenceThread',
            body: { text: 'Done. It names all four regions now.', mentions: [] },
          },
        },
        { kind: 'signal', signal: 'answered' },
      ],
      needs: [`${NEXT_STEPS}#p1`],
    },
    {
      name: 'Change the picture slide’s layout',
      doing: 'changing the layout',
      steps: [
        { kind: 'point', slide: WAREHOUSE, at: { x: 640, y: 450 } },
        {
          kind: 'act',
          action: 'slide.setLayout',
          slide: WAREHOUSE,
          input: {
            slideId: WAREHOUSE,
            layout: { type: 'cols', ratio: '4/8', gap: 72, align: 'center' },
          },
        },
      ],
      needs: [WAREHOUSE],
    },
    {
      name: 'Try the Coral theme',
      doing: 'trying the Coral theme',
      steps: [
        { kind: 'point', slide: plan, at: { x: 800, y: 450 } },
        { kind: 'act', action: 'deck.set', slide: plan, input: { path: '/theme', value: 'coral' } },
        { kind: 'point', slide: plan, at: { x: 520, y: 400 } },
        { kind: 'point', slide: plan, at: { x: 1080, y: 500 } },
        { kind: 'say', words: 'going back to Swiss' },
        { kind: 'act', action: 'deck.set', slide: plan, input: { path: '/theme', value: 'swiss' } },
      ],
    },
    {
      name: 'Even out the shapes Codex drew',
      doing: 'evening out Codex’s shapes',
      after: 'aligned',
      steps: [
        { kind: 'point', slide: ORDER_FLOW, at: { x: 780, y: 470 } },
        {
          kind: 'act',
          action: 'block.distribute',
          slide: ORDER_FLOW,
          block: 'packed',
          input: {
            slideId: ORDER_FLOW,
            blockIds: ['placed', 'packed', 'delivered'],
            axis: 'horizontal',
          },
        },
        { kind: 'signal', signal: 'evened' },
      ],
      needs: [`${ORDER_FLOW}#placed`, `${ORDER_FLOW}#packed`, `${ORDER_FLOW}#delivered`],
    },
    {
      name: 'Resolve the chart thread',
      doing: 'resolving a comment',
      after: 'shared',
      steps: [
        { kind: 'point', slide: REGIONS, at: { x: 560, y: 520 } },
        {
          kind: 'act',
          action: 'comment.resolve',
          slide: REGIONS,
          input: { threadId: '$chartThread' },
        },
        { kind: 'signal', signal: 'resolved' },
      ],
      needs: [REGIONS],
    },
    {
      name: 'Put the chart back',
      doing: 'putting Codex’s number back',
      tidy: true,
      steps: [
        { kind: 'point', slide: numbers, at: { x: 1130, y: 600 } },
        {
          kind: 'act',
          action: 'chart.setData',
          slide: numbers,
          block: 'chart',
          input: {
            slideId: numbers,
            blockId: 'chart',
            categories: ['Q1', 'Q2', 'Q3', 'Q4'],
            series: [{ name: 'Orders', values: [42, 51, 58, 66] }],
          },
        },
      ],
      needs: [`${numbers}#chart`],
    },
    ...cleanup(['codex-tidied', 'sentence-resolved'], [WAREHOUSE, NEXT_STEPS]),
  ],
  codex: [
    {
      name: 'Raise the fourth quarter',
      doing: 'raising the fourth quarter',
      steps: [
        { kind: 'point', slide: numbers, at: { x: 1300, y: 640 } },
        { kind: 'select', slide: numbers, block: 'chart' },
        {
          kind: 'act',
          action: 'chart.setData',
          slide: numbers,
          block: 'chart',
          input: {
            slideId: numbers,
            blockId: 'chart',
            categories: ['Q1', 'Q2', 'Q3', 'Q4'],
            series: [{ name: 'Orders', values: [42, 51, 58, 71] }],
          },
        },
      ],
      needs: [`${numbers}#chart`],
    },
    {
      name: 'Add a chart slide',
      doing: 'adding a slide',
      steps: [
        { kind: 'point', slide: numbers, at: { x: 900, y: 760 } },
        {
          kind: 'act',
          action: 'slide.insert',
          slide: REGIONS,
          input: { sectionId: 'deck', after: numbers, slide: REGIONS_SLIDE },
        },
      ],
      needs: [numbers],
    },
    {
      name: 'Add a chart',
      doing: 'adding a chart',
      steps: [
        { kind: 'point', slide: REGIONS, at: { x: 500, y: 520 } },
        {
          kind: 'act',
          action: 'block.insert',
          slide: REGIONS,
          block: 'chart',
          input: {
            slideId: REGIONS,
            slot: 'main',
            block: {
              id: 'chart',
              type: 'chart',
              kind: 'bar',
              legend: 'none',
              ...regionData([12, 9, 6, 2]),
              pos: { x: 137, y: 270, w: 700, h: 520, z: 2 },
            },
          },
        },
      ],
      needs: [REGIONS],
    },
    {
      name: 'Fill the chart',
      doing: 'filling the chart',
      steps: [
        { kind: 'select', slide: REGIONS, block: 'chart' },
        {
          kind: 'act',
          action: 'chart.setData',
          slide: REGIONS,
          block: 'chart',
          input: regionChart([20, 15, 10, 3]),
        },
        {
          kind: 'act',
          action: 'chart.setData',
          slide: REGIONS,
          block: 'chart',
          input: regionChart([28, 21, 13, 4]),
        },
        { kind: 'signal', signal: 'chart-ready' },
      ],
      needs: [`${REGIONS}#chart`],
    },
    {
      name: 'Switch the chart to columns',
      doing: 'switching to columns',
      steps: [
        { kind: 'point', slide: REGIONS, at: { x: 640, y: 420 } },
        {
          kind: 'act',
          action: 'chart.setKind',
          slide: REGIONS,
          block: 'chart',
          input: { slideId: REGIONS, blockId: 'chart', kind: 'column' },
        },
      ],
      needs: [`${REGIONS}#chart`],
    },
    {
      name: 'Add a table',
      doing: 'adding a table',
      steps: [
        { kind: 'point', slide: REGIONS, at: { x: 1180, y: 330 } },
        {
          kind: 'act',
          action: 'block.insert',
          slide: REGIONS,
          block: 'table',
          input: {
            slideId: REGIONS,
            slot: 'main',
            block: {
              id: 'table',
              type: 'table',
              size: 16,
              columns: [{}, { align: 'right' }, {}],
              rows: [
                { header: true, cells: ['Region', 'Orders', 'Note'] },
                { cells: ['North America', '28,000', 'Largest'] },
                { cells: ['Europe', '21,000', 'Up'] },
                { cells: ['Asia', '13,000', 'Fastest'] },
              ],
              pos: { x: 917, y: 300, w: 546, h: 220, z: 3 },
            },
          },
        },
      ],
      needs: [REGIONS],
    },
    {
      name: 'Fill the table',
      doing: 'filling the table',
      steps: [
        { kind: 'point', slide: REGIONS, at: { x: 1400, y: 380 } },
        {
          kind: 'write',
          slide: REGIONS,
          block: 'table',
          path: '/rows/1/cells/2',
          text: 'Largest region',
        },
        {
          kind: 'write',
          slide: REGIONS,
          block: 'table',
          path: '/rows/2/cells/2',
          text: 'Up from 18,000',
        },
        {
          kind: 'write',
          slide: REGIONS,
          block: 'table',
          path: '/rows/3/cells/2',
          text: 'Fastest growth',
        },
      ],
      needs: [`${REGIONS}#table`],
    },
    {
      name: 'Animate the chart',
      doing: 'animating the chart',
      steps: [
        { kind: 'point', slide: REGIONS, at: { x: 480, y: 600 } },
        { kind: 'select', slide: REGIONS, block: 'chart' },
        {
          kind: 'act',
          action: 'motion.add',
          slide: REGIONS,
          block: 'chart',
          input: {
            slideId: REGIONS,
            effect: {
              block: 'chart',
              role: 'enter',
              motion: { preset: 'rise-in' },
              start: 'click',
            },
          },
        },
      ],
      needs: [`${REGIONS}#chart`],
    },
    {
      name: 'Review the sentence Claude Code wrote',
      doing: 'reviewing Claude’s slide',
      after: 'written',
      steps: [
        { kind: 'point', slide: NEXT_STEPS, at: { x: 380, y: 540 } },
        { kind: 'select', slide: NEXT_STEPS, block: 'p1' },
        {
          kind: 'act',
          action: 'comment.add',
          slide: NEXT_STEPS,
          block: 'p1',
          input: {
            anchor: { kind: 'block', slideId: NEXT_STEPS, blockId: 'p1' },
            body: { text: 'Can this sentence say how many regions?', mentions: [] },
          },
          save: { key: 'sentenceThread', from: 'thread.id' },
        },
        { kind: 'signal', signal: 'review-asked' },
      ],
      needs: [`${NEXT_STEPS}#p1`],
    },
    {
      name: 'Draw the order flow',
      doing: 'drawing shapes',
      steps: [
        { kind: 'point', slide: shipped, at: { x: 1100, y: 760 } },
        {
          kind: 'act',
          action: 'slide.insert',
          slide: ORDER_FLOW,
          input: { sectionId: 'deck', after: shipped, slide: ORDER_FLOW_SLIDE },
        },
        { kind: 'point', slide: ORDER_FLOW, at: { x: 760, y: 440 } },
        {
          kind: 'act',
          action: 'block.insert',
          slide: ORDER_FLOW,
          block: 'packed',
          input: {
            slideId: ORDER_FLOW,
            slot: 'main',
            block: flowBox('packed', 'Packed in the warehouse', 560, 250, 2),
          },
        },
        { kind: 'drag', slide: ORDER_FLOW, block: 'packed', to: { x: 600, y: 360 } },
        { kind: 'point', slide: ORDER_FLOW, at: { x: 1300, y: 520 } },
        {
          kind: 'act',
          action: 'block.insert',
          slide: ORDER_FLOW,
          block: 'delivered',
          input: {
            slideId: ORDER_FLOW,
            slot: 'main',
            block: flowBox('delivered', 'Delivered', 1143, 440, 3),
          },
        },
      ],
      needs: [shipped],
    },
    {
      name: 'Align the shapes',
      doing: 'aligning the shapes',
      steps: [
        { kind: 'point', slide: ORDER_FLOW, at: { x: 800, y: 420 } },
        {
          kind: 'act',
          action: 'block.align',
          slide: ORDER_FLOW,
          block: 'packed',
          input: {
            slideId: ORDER_FLOW,
            blockIds: ['placed', 'packed', 'delivered'],
            edge: 'middle',
            to: 'selection',
          },
        },
        { kind: 'signal', signal: 'aligned' },
      ],
      needs: [`${ORDER_FLOW}#placed`, `${ORDER_FLOW}#packed`, `${ORDER_FLOW}#delivered`],
    },
    {
      name: 'Answer Claude Code',
      doing: 'answering Claude',
      after: 'asked',
      steps: [
        { kind: 'point', slide: REGIONS, at: { x: 500, y: 520 } },
        { kind: 'say', words: 'making the chart a pie' },
        {
          kind: 'act',
          action: 'chart.setKind',
          slide: REGIONS,
          block: 'chart',
          input: { slideId: REGIONS, blockId: 'chart', kind: 'pie' },
        },
        { kind: 'say', words: 'answering Claude' },
        {
          kind: 'act',
          action: 'comment.reply',
          slide: REGIONS,
          input: {
            threadId: '$chartThread',
            body: { text: 'It is a pie now, so each share shows.', mentions: [] },
          },
        },
        { kind: 'signal', signal: 'shared' },
      ],
      needs: [`${REGIONS}#chart`],
    },
    {
      name: 'Tidy the sentence Claude Code wrote',
      doing: 'tidying Claude’s sentence',
      after: 'cropped',
      steps: [
        { kind: 'point', slide: WAREHOUSE, at: { x: 380, y: 520 } },
        {
          kind: 'write',
          slide: WAREHOUSE,
          block: 'p1',
          path: '/text',
          text: 'Opens in March and ships orders within a day.',
        },
        { kind: 'signal', signal: 'codex-tidied' },
      ],
      needs: [`${WAREHOUSE}#p1`],
    },
    {
      name: 'Connect the shapes',
      doing: 'connecting the shapes',
      after: 'evened',
      steps: [
        { kind: 'point', slide: ORDER_FLOW, at: { x: 548, y: 480 } },
        {
          kind: 'act',
          action: 'block.insert',
          slide: ORDER_FLOW,
          block: 'arrow-1',
          input: { slideId: ORDER_FLOW, slot: 'main', block: flowArrow('arrow-1', 477) },
        },
        { kind: 'point', slide: ORDER_FLOW, at: { x: 1052, y: 480 } },
        {
          kind: 'act',
          action: 'block.insert',
          slide: ORDER_FLOW,
          block: 'arrow-2',
          input: { slideId: ORDER_FLOW, slot: 'main', block: flowArrow('arrow-2', 980) },
        },
      ],
      needs: [`${ORDER_FLOW}#packed`],
    },
    {
      name: 'Resolve the sentence thread',
      doing: 'resolving a comment',
      after: 'answered',
      steps: [
        { kind: 'point', slide: NEXT_STEPS, at: { x: 420, y: 540 } },
        {
          kind: 'act',
          action: 'comment.resolve',
          slide: NEXT_STEPS,
          input: { threadId: '$sentenceThread' },
        },
        { kind: 'signal', signal: 'sentence-resolved' },
      ],
      needs: [NEXT_STEPS],
    },
    ...cleanup(['resolved', 'evened'], [ORDER_FLOW, REGIONS]),
  ],
};

/**
 * What an agent does while it waits for the other (a task waiting on a signal, the end of the
 * loop): it reads a slide, its pointer moving over the blocks, and writes nothing.
 */
export const REVIEW: AgentScript = {
  claude: [
    {
      name: 'Read the agenda',
      doing: 'reading the agenda',
      steps: [
        { kind: 'point', slide: agenda, at: { x: 900, y: 360 } },
        { kind: 'select', slide: agenda, block: 'rows' },
        { kind: 'point', slide: agenda, at: { x: 1100, y: 560 } },
        { kind: 'hold', ms: 600 },
      ],
      needs: [`${agenda}#rows`],
    },
    {
      name: 'Read what shipped',
      doing: 'checking what shipped',
      steps: [
        { kind: 'point', slide: shipped, at: { x: 1000, y: 380 } },
        { kind: 'select', slide: shipped, block: 'rows' },
        { kind: 'point', slide: shipped, at: { x: 1240, y: 560 } },
        { kind: 'hold', ms: 600 },
      ],
      needs: [`${shipped}#rows`],
    },
  ],
  codex: [
    {
      name: 'Check the numbers',
      doing: 'checking the numbers',
      steps: [
        { kind: 'point', slide: numbers, at: { x: 700, y: 400 } },
        { kind: 'select', slide: numbers, block: 'chart' },
        { kind: 'point', slide: numbers, at: { x: 1000, y: 640 } },
        { kind: 'hold', ms: 600 },
      ],
      needs: [`${numbers}#chart`],
    },
    {
      name: 'Read the plan',
      doing: 'reading the plan',
      steps: [
        { kind: 'point', slide: plan, at: { x: 700, y: 420 } },
        { kind: 'point', slide: plan, at: { x: 1000, y: 480 } },
        { kind: 'hold', ms: 600 },
      ],
      needs: [plan],
    },
  ],
};

/** The actions the script names, for script.test.ts. */
export function scriptActions(script: AgentScript = SCRIPT): ActionId[] {
  const out = new Set<ActionId>(['text.insert', 'block.set']);
  for (const tasks of Object.values(script))
    for (const task of tasks)
      for (const step of task.steps) {
        if (step.kind === 'act') out.add(step.action);
        if (step.kind === 'write' || step.kind === 'notes') out.add('slide.update');
      }
  return [...out];
}
