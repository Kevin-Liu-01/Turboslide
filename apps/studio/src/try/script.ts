import type { ActionId } from '@turboslide/schema/actions';

import { HERO_SLIDES } from './hero-deck';

/**
 * What Claude Code and Codex do in the landing's live editor (docs/SITE.md C.9): data, not code.
 * Each agent works through its tasks in order and starts again; a task is a few steps on one
 * slide. The runner (agents.ts) reads the steps, moves the agent's pointer, writes through the
 * page API's own path (`editorAdapter().invoke`, every write one action of the table with the
 * agent's `baseRevision`) and keeps the agent off the visitor's slide and selection. One loop is
 * about seventy seconds; the two agents run at once on different slides.
 *
 * Strings carry two placeholders the runner fills: `{loop}`, the loop's number (so the ids an
 * agent mints are fresh each loop), and `$<key>`, a value an earlier step saved (`save`).
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
  /** types `text` into a Text at its end, one character per `text.insert`, the caret following */
  | { kind: 'type'; slide: string; block: string; path: string; text: string }
  /** drags a block on a canvas slide: drag presence frames, then one `block.set /pos` at the release */
  | { kind: 'drag'; slide: string; block: string; to: SheetPoint }
  /** waits until the other agent has said `signal` in this loop */
  | { kind: 'wait'; signal: string }
  /** tells the other agent */
  | { kind: 'signal'; signal: string }
  | { kind: 'hold'; ms: number };

export type Task = {
  name: string;
  /** the steps, in order */
  steps: readonly Step[];
  /**
   * The task runs only when every slide and block it names exists (`slide` or `slide#block`),
   * and is skipped otherwise: a visitor may have removed what it works on.
   */
  needs?: readonly string[];
  /** a tidy task: it removes only what the agent made and nobody else wrote (agents.ts) */
  tidy?: true;
};

export type AgentScript = Readonly<Record<AgentKey, readonly Task[]>>;

/** The slide Claude Code adds each loop, and the box Codex places on the numbers slide. */
export const NEXT_STEPS = 'next-steps-{loop}';
export const LABEL_BOX = 'label-{loop}';

const { agenda, numbers, plan, shipped } = HERO_SLIDES;

export const SCRIPT: AgentScript = {
  claude: [
    {
      name: 'Add a slide after What shipped',
      steps: [
        { kind: 'point', slide: shipped, at: { x: 1180, y: 640 } },
        { kind: 'hold', ms: 500 },
        {
          kind: 'act',
          action: 'slide.new',
          slide: NEXT_STEPS,
          input: { layout: 'split', after: shipped, sectionId: 'deck', id: NEXT_STEPS },
        },
      ],
      needs: [shipped],
    },
    {
      name: 'Title the new slide',
      steps: [
        { kind: 'point', slide: NEXT_STEPS, at: { x: 260, y: 170 } },
        { kind: 'type', slide: NEXT_STEPS, block: 'h', path: '/text', text: 'Next steps' },
      ],
      needs: [`${NEXT_STEPS}#h`],
    },
    {
      name: 'Ask Codex to label the box',
      steps: [
        { kind: 'wait', signal: 'box-placed' },
        { kind: 'point', slide: numbers, at: { x: 1240, y: 300 } },
        { kind: 'select', slide: numbers, block: LABEL_BOX },
        {
          kind: 'act',
          action: 'comment.add',
          slide: numbers,
          block: LABEL_BOX,
          input: {
            anchor: { kind: 'block', slideId: numbers, blockId: LABEL_BOX },
            body: { text: 'Label this with the quarter.', mentions: [] },
          },
          save: { key: 'thread', from: 'thread.id' },
        },
        { kind: 'signal', signal: 'asked' },
      ],
      needs: [`${numbers}#${LABEL_BOX}`],
    },
    {
      name: 'Write the new slide',
      steps: [
        { kind: 'point', slide: NEXT_STEPS, at: { x: 300, y: 330 } },
        {
          kind: 'type',
          slide: NEXT_STEPS,
          block: 'p1',
          path: '/text',
          text: 'One checkout ships to every region in January.',
        },
      ],
      needs: [`${NEXT_STEPS}#p1`],
    },
    {
      name: 'Move the new slide up',
      steps: [
        { kind: 'point', slide: NEXT_STEPS, at: { x: 800, y: 450 } },
        { kind: 'hold', ms: 600 },
        {
          kind: 'act',
          action: 'slide.move',
          slide: NEXT_STEPS,
          input: { slideId: NEXT_STEPS, sectionId: 'deck', after: agenda },
        },
        { kind: 'hold', ms: 3000 },
      ],
      needs: [NEXT_STEPS],
    },
    {
      name: 'Remove the new slide',
      tidy: true,
      steps: [
        { kind: 'wait', signal: 'tidied' },
        { kind: 'point', slide: NEXT_STEPS, at: { x: 800, y: 450 } },
        { kind: 'hold', ms: 500 },
        { kind: 'act', action: 'slide.remove', slide: NEXT_STEPS, input: { slideId: NEXT_STEPS } },
        { kind: 'hold', ms: 4000 },
      ],
      needs: [NEXT_STEPS],
    },
  ],
  codex: [
    {
      name: 'Raise the fourth quarter',
      steps: [
        { kind: 'point', slide: numbers, at: { x: 1300, y: 640 } },
        { kind: 'select', slide: numbers, block: 'chart' },
        { kind: 'hold', ms: 700 },
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
      name: 'Place a box on the chart',
      steps: [
        { kind: 'point', slide: numbers, at: { x: 1010, y: 260 } },
        {
          kind: 'act',
          action: 'block.insert',
          slide: numbers,
          block: LABEL_BOX,
          input: {
            slideId: numbers,
            slot: 'main',
            block: {
              id: LABEL_BOX,
              type: 'box',
              fill: 'plate',
              stroke: 'hair',
              padding: 16,
              text: '',
              pos: { x: 980, y: 236, w: 320, h: 80, z: 5 },
            },
          },
        },
        { kind: 'drag', slide: numbers, block: LABEL_BOX, to: { x: 1092, y: 300 } },
        { kind: 'signal', signal: 'box-placed' },
      ],
      needs: [`${numbers}#chart`],
    },
    {
      name: 'Label the box and answer',
      steps: [
        { kind: 'wait', signal: 'asked' },
        { kind: 'point', slide: numbers, at: { x: 1140, y: 330 } },
        {
          kind: 'type',
          slide: numbers,
          block: LABEL_BOX,
          path: '/text',
          text: 'Q4: 71,000 orders',
        },
        {
          kind: 'act',
          action: 'comment.reply',
          slide: numbers,
          input: { threadId: '$thread', body: { text: 'Done.', mentions: [] } },
        },
        { kind: 'act', action: 'comment.resolve', slide: numbers, input: { threadId: '$thread' } },
      ],
      needs: [`${numbers}#${LABEL_BOX}`],
    },
    {
      name: 'Try the Coral theme',
      steps: [
        { kind: 'point', slide: plan, at: { x: 800, y: 450 } },
        { kind: 'hold', ms: 500 },
        { kind: 'act', action: 'deck.set', slide: plan, input: { path: '/theme', value: 'coral' } },
        { kind: 'hold', ms: 4000 },
        { kind: 'act', action: 'deck.set', slide: plan, input: { path: '/theme', value: 'swiss' } },
      ],
    },
    {
      name: 'Put the chart back',
      tidy: true,
      steps: [
        { kind: 'point', slide: numbers, at: { x: 1130, y: 330 } },
        { kind: 'hold', ms: 600 },
        {
          kind: 'act',
          action: 'block.remove',
          slide: numbers,
          block: LABEL_BOX,
          input: { slideId: numbers, blockId: LABEL_BOX },
        },
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
        { kind: 'signal', signal: 'tidied' },
        { kind: 'hold', ms: 4000 },
      ],
      needs: [`${numbers}#chart`],
    },
  ],
};

/** The actions the script names, for script.test.ts. */
export function scriptActions(script: AgentScript = SCRIPT): ActionId[] {
  const out = new Set<ActionId>(['text.insert', 'block.set']);
  for (const tasks of Object.values(script))
    for (const task of tasks)
      for (const step of task.steps) if (step.kind === 'act') out.add(step.action);
  return [...out];
}
