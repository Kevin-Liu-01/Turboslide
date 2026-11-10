import { PEOPLE } from '../components/site/copy';
import { TRY_CHAPTERS } from '../components/site/try-frame';
import type { AgentHandle, Runner } from './agents';
import { HERO_LIGHTHOUSE, HERO_SLIDES, HERO_THEME, TITLE_LEAD } from './hero-deck';
import { flowArrow, flowBox, regionChart, regionData } from './script';
import type { AgentScript, Step } from './script';

/**
 * The chapters after the hero (docs/SITE.md 5, "The chapters"): each section of /home after the
 * hero holds a frame of this editor, and the page names its chapter once the frame is ready
 * (`ts-try:chapter`, components/site/ChapterBox.tsx), so the hero's own presentation shows each
 * claim. Chapter 0 is the hero, the agents' loop of script.ts. Chapters 1 to 3 pause that loop and
 * run a script of their own on the same two agents (agents.ts `createRunner` over the scripts
 * below, its own director moving the visitor's stage to what the agents write; Kevin, 2026-11-03:
 * "make the stuff each agent is doing a lot more impressive"):
 *
 * 1. Claude Code adds a slide, lays a pattern of the shader library behind it and tries two more;
 *    Codex places Cape Hatteras Light as a disc, drags it into place and asks in a comment for a
 *    heading that names the light; Claude Code types it and answers, Codex resolves the thread,
 *    and Claude Code turns the heading 6 degrees into the sky.
 * 2. Codex adds a chart slide and grows the chart, turns it to columns and adds a table, then
 *    draws an order flow on a second slide; Claude Code animates the chart, aligns and spaces the
 *    flow's boxes, Codex connects them and turns the chart to a pie, and Claude Code tries Coral,
 *    Night and Mint before it goes back to Swiss.
 * 3. On the title slide Codex asks in a comment for a lead that names the quarter, Claude Code
 *    rewrites the lead and answers, Codex resolves it and Claude Code puts the lead back, while
 *    two people of the title and OpenClaw and Hermes visit the slide (guests.ts), OpenClaw and
 *    Hermes leaving a comment each.
 *
 * Chapter 4 gives the deck a transition and starts the slideshow, which steps through the deck;
 * under reduced motion it stays on the title slide (Kevin, 2026-11-09). A chapter's script starts
 * again while its section stays on screen. While the section is off screen
 * or the tab is hidden the chapter waits: its runner pauses, and the third chapter's visits and the
 * slideshow's steps hold the time they have left and carry on from there.
 *
 * Every chapter leaves the deck as it found it: the slides a chapter adds carry the `story-`
 * prefix, and leaving the chapter waits for its agents to stop, then removes those slides and puts
 * back the theme, the title's lead and the deck's transition; leaving the slideshow ends it.
 * Should a frame be named chapters faster than they play, the director moves from the chapter it
 * plays to the last one named, one at a time.
 */

/** The prefix of every slide a chapter adds. */
const STORY_PREFIX = 'story-';

/** Whether a slide is one the story added. */
export function isStorySlide(slideId: string): boolean {
  return slideId.startsWith(STORY_PREFIX);
}

const { title } = HERO_SLIDES;
const LIGHT = 'story-light-{loop}';
const CHART = 'story-chart-{loop}';
const FLOW = 'story-flow-{loop}';

/** The first chapter's slide, whole: a paper plate with its heading, sentence and credit. */
const LIGHT_SLIDE = {
  schemaVersion: 1,
  id: LIGHT,
  kind: 'content',
  layout: { type: 'freeform' },
  slots: {
    main: [
      { id: 'plate', type: 'box', fill: 'paper', pos: { x: 96, y: 536, w: 704, h: 280, z: 4 } },
      {
        id: 'h',
        type: 'heading',
        level: 'h2',
        text: 'Cape Hatteras',
        pos: { x: 136, y: 572, w: 624, h: 72, z: 5 },
      },
      {
        id: 'p1',
        type: 'paragraph',
        text: 'The lantern room above the Outer Banks, printed through an 8 by 8 screen.',
        pos: { x: 136, y: 652, w: 624, h: 80, z: 6 },
      },
      {
        id: 'credit',
        type: 'credit',
        text: 'Photograph: National Park Service, public domain',
        pos: { x: 136, y: 760, w: 624, h: 24, z: 7 },
      },
    ],
  },
} as const;

/** The second chapter's chart slide, whole: a heading and a sentence before the chart and table. */
const CHART_SLIDE = {
  schemaVersion: 1,
  id: CHART,
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

/** The second chapter's flow slide, whole: a heading and the first box of the order flow. */
const FLOW_SLIDE = {
  schemaVersion: 1,
  id: FLOW,
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

/** The patterns of the shader library Claude Code tries, in order; the last one stays. */
const PATTERNS = ['paper:god-rays', 'paper:smoke-ring', 'paper:mesh-gradient'] as const;

/** The themes Claude Code tries in the second chapter before it goes back to the deck's own. */
const THEMES = [
  { id: 'coral', name: 'Coral' },
  { id: 'night', name: 'Night' },
  { id: 'mint', name: 'Mint' },
] as const;

/** The transition the fourth chapter gives the deck before its slideshow. */
export const STORY_TRANSITION = { name: 'blur-swipe', durationMs: 700 } as const;

/** Steps that only show the slide as it stands. */
const look = (slide: string, ms = 1800): Step[] => [
  { kind: 'point', slide, at: { x: 1000, y: 420 } },
  { kind: 'hold', ms },
  { kind: 'point', slide, at: { x: 560, y: 640 } },
  { kind: 'hold', ms },
];

/** Chapter 1: agents edit beside you. */
const AGENTS: AgentScript = {
  claude: [
    {
      name: 'Add the lighthouse slide',
      doing: 'adding a slide',
      steps: [
        { kind: 'point', slide: title, at: { x: 800, y: 760 } },
        {
          kind: 'act',
          action: 'slide.insert',
          slide: LIGHT,
          input: { sectionId: 'deck', after: title, slide: LIGHT_SLIDE },
        },
      ],
      needs: [title],
    },
    {
      name: 'Lay a pattern behind the slide',
      doing: 'opening the shader library',
      steps: [
        { kind: 'point', slide: LIGHT, at: { x: 1100, y: 300 } },
        {
          kind: 'act',
          action: 'block.insert',
          slide: LIGHT,
          block: 'ground',
          input: {
            slideId: LIGHT,
            slot: 'main',
            block: {
              id: 'ground',
              type: 'material',
              alt: 'A moving pattern in the theme’s colours',
              materialId: PATTERNS[0],
              pos: { x: 0, y: 0, w: 1600, h: 900, z: 0 },
            },
          },
        },
        { kind: 'signal', signal: 'ground' },
      ],
      needs: [LIGHT],
    },
    {
      name: 'Try two more patterns',
      doing: 'trying patterns',
      steps: PATTERNS.slice(1).flatMap((materialId): Step[] => [
        { kind: 'select', slide: LIGHT, block: 'ground' },
        { kind: 'hold', ms: 1400 },
        {
          kind: 'act',
          action: 'block.set',
          slide: LIGHT,
          block: 'ground',
          input: { slideId: LIGHT, blockId: 'ground', path: '/materialId', value: materialId },
        },
      ]),
      needs: [`${LIGHT}#ground`],
    },
    {
      name: 'Answer Codex',
      doing: 'renaming the heading',
      after: 'asked',
      steps: [
        { kind: 'point', slide: LIGHT, at: { x: 330, y: 610 } },
        { kind: 'select', slide: LIGHT, block: 'h' },
        { kind: 'write', slide: LIGHT, block: 'h', path: '/text', text: 'Cape Hatteras Light' },
        {
          kind: 'act',
          action: 'comment.reply',
          slide: LIGHT,
          input: {
            threadId: '$lightThread',
            body: { text: 'Done. It names the light now.', mentions: [] },
          },
        },
        { kind: 'signal', signal: 'answered' },
      ],
      needs: [`${LIGHT}#h`],
    },
    {
      name: 'Turn the heading into the sky',
      doing: 'turning the heading',
      after: 'resolved',
      steps: [
        { kind: 'select', slide: LIGHT, block: 'h' },
        { kind: 'hold', ms: 900 },
        {
          kind: 'act',
          action: 'block.set',
          slide: LIGHT,
          block: 'h',
          input: {
            slideId: LIGHT,
            blockId: 'h',
            path: '/pos',
            value: { x: 136, y: 96, w: 760, h: 96, z: 8, rotate: 354 },
          },
        },
        { kind: 'signal', signal: 'turned' },
        ...look(LIGHT),
      ],
      needs: [`${LIGHT}#h`],
    },
    {
      name: 'Remove the lighthouse slide',
      doing: 'putting the deck back',
      after: 'looked',
      tidy: true,
      steps: [
        { kind: 'point', slide: LIGHT, at: { x: 800, y: 450 } },
        { kind: 'act', action: 'slide.remove', slide: LIGHT, input: { slideId: LIGHT } },
      ],
      needs: [LIGHT],
    },
  ],
  codex: [
    {
      name: 'Place the photograph',
      doing: 'placing a photograph',
      after: 'ground',
      steps: [
        { kind: 'point', slide: LIGHT, at: { x: 1340, y: 300 } },
        {
          kind: 'act',
          action: 'block.insert',
          slide: LIGHT,
          block: 'photo',
          input: {
            slideId: LIGHT,
            slot: 'main',
            block: {
              id: 'photo',
              alt: 'The lantern room of Cape Hatteras Light above the Outer Banks, from a drone',
              type: 'picture',
              asset: HERO_LIGHTHOUSE,
              mask: 'ellipse',
              pos: { x: 1180, y: 150, w: 380, h: 380, z: 3 },
            },
          },
        },
        { kind: 'drag', slide: LIGHT, block: 'photo', to: { x: 1000, y: 120 } },
      ],
      needs: [LIGHT],
    },
    {
      name: 'Ask for a heading that names the light',
      doing: 'leaving a comment',
      after: 'ground',
      steps: [
        { kind: 'point', slide: LIGHT, at: { x: 300, y: 610 } },
        { kind: 'select', slide: LIGHT, block: 'h' },
        {
          kind: 'act',
          action: 'comment.add',
          slide: LIGHT,
          block: 'h',
          input: {
            anchor: { kind: 'block', slideId: LIGHT, blockId: 'h' },
            body: { text: 'Can the heading name the light?', mentions: [] },
          },
          save: { key: 'lightThread', from: 'thread.id' },
        },
        { kind: 'signal', signal: 'asked' },
      ],
      needs: [`${LIGHT}#h`],
    },
    {
      name: 'Resolve the heading thread',
      doing: 'resolving a comment',
      after: 'answered',
      steps: [
        { kind: 'point', slide: LIGHT, at: { x: 520, y: 600 } },
        {
          kind: 'act',
          action: 'comment.resolve',
          slide: LIGHT,
          input: { threadId: '$lightThread' },
        },
        { kind: 'signal', signal: 'resolved' },
      ],
      needs: [LIGHT],
    },
    {
      name: 'Look over the slide',
      doing: 'reading the slide',
      after: 'turned',
      steps: [...look(LIGHT), { kind: 'signal', signal: 'looked' }],
      needs: [LIGHT],
    },
  ],
};

/** Chapter 2: every feature you reach for. */
const FEATURES: AgentScript = {
  claude: [
    {
      name: 'Animate the chart',
      doing: 'animating the chart',
      after: 'chart-ready',
      steps: [
        { kind: 'point', slide: CHART, at: { x: 480, y: 600 } },
        { kind: 'select', slide: CHART, block: 'chart' },
        {
          kind: 'act',
          action: 'motion.add',
          slide: CHART,
          block: 'chart',
          input: {
            slideId: CHART,
            effect: {
              block: 'chart',
              role: 'enter',
              motion: { preset: 'rise-in' },
              start: 'click',
            },
          },
        },
        { kind: 'signal', signal: 'animated' },
      ],
      needs: [`${CHART}#chart`],
    },
    {
      name: 'Align and space the boxes',
      doing: 'evening out Codex’s boxes',
      after: 'drawn',
      steps: [
        { kind: 'point', slide: FLOW, at: { x: 800, y: 420 } },
        {
          kind: 'act',
          action: 'block.align',
          slide: FLOW,
          block: 'packed',
          input: {
            slideId: FLOW,
            blockIds: ['placed', 'packed', 'delivered'],
            edge: 'middle',
            to: 'selection',
          },
        },
        { kind: 'point', slide: FLOW, at: { x: 780, y: 470 } },
        {
          kind: 'act',
          action: 'block.distribute',
          slide: FLOW,
          block: 'packed',
          input: { slideId: FLOW, blockIds: ['placed', 'packed', 'delivered'], axis: 'horizontal' },
        },
        { kind: 'signal', signal: 'evened' },
      ],
      needs: [`${FLOW}#placed`, `${FLOW}#packed`, `${FLOW}#delivered`],
    },
    {
      name: 'Try three themes',
      doing: 'trying themes',
      after: 'connected',
      steps: [
        ...THEMES.flatMap((theme): Step[] => [
          { kind: 'say', words: `trying the ${theme.name} theme` },
          {
            kind: 'act',
            action: 'deck.set',
            slide: FLOW,
            input: { path: '/theme', value: theme.id },
          },
          { kind: 'point', slide: FLOW, at: { x: 700, y: 500 } },
          { kind: 'hold', ms: 1400 },
        ]),
        { kind: 'say', words: 'going back to Swiss' },
        {
          kind: 'act',
          action: 'deck.set',
          slide: FLOW,
          input: { path: '/theme', value: HERO_THEME },
        },
        ...look(FLOW),
        { kind: 'signal', signal: 'themed' },
      ],
      needs: [FLOW],
    },
  ],
  codex: [
    {
      name: 'Add a chart slide',
      doing: 'adding a slide',
      steps: [
        { kind: 'point', slide: title, at: { x: 900, y: 760 } },
        {
          kind: 'act',
          action: 'slide.insert',
          slide: CHART,
          input: { sectionId: 'deck', after: title, slide: CHART_SLIDE },
        },
      ],
      needs: [title],
    },
    {
      name: 'Add and grow a chart',
      doing: 'adding a chart',
      steps: [
        { kind: 'point', slide: CHART, at: { x: 500, y: 520 } },
        {
          kind: 'act',
          action: 'block.insert',
          slide: CHART,
          block: 'chart',
          input: {
            slideId: CHART,
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
        { kind: 'say', words: 'filling the chart' },
        {
          kind: 'act',
          action: 'chart.setData',
          slide: CHART,
          block: 'chart',
          input: regionChart([20, 15, 10, 3], CHART),
        },
        {
          kind: 'act',
          action: 'chart.setData',
          slide: CHART,
          block: 'chart',
          input: regionChart([28, 21, 13, 4], CHART),
        },
        { kind: 'signal', signal: 'chart-ready' },
      ],
      needs: [CHART],
    },
    {
      name: 'Turn the chart to columns',
      doing: 'switching to columns',
      steps: [
        { kind: 'point', slide: CHART, at: { x: 640, y: 420 } },
        {
          kind: 'act',
          action: 'chart.setKind',
          slide: CHART,
          block: 'chart',
          input: { slideId: CHART, blockId: 'chart', kind: 'column' },
        },
      ],
      needs: [`${CHART}#chart`],
    },
    {
      name: 'Add a table',
      doing: 'adding a table',
      steps: [
        { kind: 'point', slide: CHART, at: { x: 1180, y: 330 } },
        {
          kind: 'act',
          action: 'block.insert',
          slide: CHART,
          block: 'table',
          input: {
            slideId: CHART,
            slot: 'main',
            block: {
              id: 'table',
              type: 'table',
              size: 16,
              columns: [{}, { align: 'right' }],
              rows: [
                { header: true, cells: ['Region', 'Orders'] },
                { cells: ['North America', '28,000'] },
                { cells: ['Europe', '21,000'] },
                { cells: ['Asia', '13,000'] },
              ],
              pos: { x: 917, y: 300, w: 546, h: 220, z: 3 },
            },
          },
        },
      ],
      needs: [CHART],
    },
    {
      name: 'Draw the order flow',
      doing: 'drawing a flow',
      steps: [
        { kind: 'point', slide: CHART, at: { x: 1100, y: 760 } },
        {
          kind: 'act',
          action: 'slide.insert',
          slide: FLOW,
          input: { sectionId: 'deck', after: CHART, slide: FLOW_SLIDE },
        },
        { kind: 'point', slide: FLOW, at: { x: 760, y: 440 } },
        {
          kind: 'act',
          action: 'block.insert',
          slide: FLOW,
          block: 'packed',
          input: {
            slideId: FLOW,
            slot: 'main',
            block: flowBox('packed', 'Packed in the warehouse', 560, 250, 2),
          },
        },
        { kind: 'drag', slide: FLOW, block: 'packed', to: { x: 600, y: 360 } },
        { kind: 'point', slide: FLOW, at: { x: 1300, y: 520 } },
        {
          kind: 'act',
          action: 'block.insert',
          slide: FLOW,
          block: 'delivered',
          input: {
            slideId: FLOW,
            slot: 'main',
            block: flowBox('delivered', 'Delivered', 1143, 440, 3),
          },
        },
        { kind: 'signal', signal: 'drawn' },
      ],
      needs: [CHART],
    },
    {
      name: 'Connect the boxes',
      doing: 'connecting the boxes',
      after: 'evened',
      steps: [
        { kind: 'point', slide: FLOW, at: { x: 548, y: 480 } },
        {
          kind: 'act',
          action: 'block.insert',
          slide: FLOW,
          block: 'arrow-1',
          input: { slideId: FLOW, slot: 'main', block: flowArrow('arrow-1', 477) },
        },
        { kind: 'point', slide: FLOW, at: { x: 1052, y: 480 } },
        {
          kind: 'act',
          action: 'block.insert',
          slide: FLOW,
          block: 'arrow-2',
          input: { slideId: FLOW, slot: 'main', block: flowArrow('arrow-2', 980) },
        },
        { kind: 'signal', signal: 'connected' },
      ],
      needs: [`${FLOW}#packed`],
    },
    {
      name: 'Turn the chart to a pie',
      doing: 'switching to a pie',
      after: 'animated',
      steps: [
        { kind: 'point', slide: CHART, at: { x: 520, y: 500 } },
        {
          kind: 'act',
          action: 'chart.setKind',
          slide: CHART,
          block: 'chart',
          input: { slideId: CHART, blockId: 'chart', kind: 'pie' },
        },
        ...look(CHART),
      ],
      needs: [`${CHART}#chart`],
    },
    {
      name: 'Remove the slides',
      doing: 'putting the deck back',
      after: 'themed',
      tidy: true,
      steps: [
        { kind: 'point', slide: FLOW, at: { x: 800, y: 450 } },
        { kind: 'act', action: 'slide.remove', slide: FLOW, input: { slideId: FLOW } },
        { kind: 'point', slide: CHART, at: { x: 800, y: 450 } },
        { kind: 'act', action: 'slide.remove', slide: CHART, input: { slideId: CHART } },
      ],
      needs: [CHART],
    },
  ],
};

/** The lead Claude Code writes in the third chapter, naming the quarter. */
const LEAD_NAMED = 'Where the third quarter stands and what ships next.';

/** Chapter 3: edit together, on the title slide. */
const TOGETHER: AgentScript = {
  claude: [
    {
      name: 'Answer Codex',
      doing: 'rewriting the lead',
      after: 'asked',
      steps: [
        { kind: 'point', slide: title, at: { x: 600, y: 310 } },
        { kind: 'select', slide: title, block: 'lead' },
        { kind: 'write', slide: title, block: 'lead', path: '/text', text: LEAD_NAMED },
        {
          kind: 'act',
          action: 'comment.reply',
          slide: title,
          input: {
            threadId: '$leadThread',
            body: { text: 'Done. It names the third quarter.', mentions: [] },
          },
        },
        { kind: 'signal', signal: 'answered' },
      ],
      needs: [`${title}#lead`],
    },
    {
      name: 'Put the lead back',
      doing: 'putting the lead back',
      after: 'resolved',
      tidy: true,
      steps: [
        { kind: 'hold', ms: 3200 },
        { kind: 'select', slide: title, block: 'lead' },
        { kind: 'write', slide: title, block: 'lead', path: '/text', text: TITLE_LEAD },
      ],
      needs: [`${title}#lead`],
    },
  ],
  codex: [
    {
      name: 'Ask for a lead that names the quarter',
      doing: 'leaving a comment',
      steps: [
        { kind: 'point', slide: title, at: { x: 560, y: 310 } },
        { kind: 'select', slide: title, block: 'lead' },
        {
          kind: 'act',
          action: 'comment.add',
          slide: title,
          block: 'lead',
          input: {
            anchor: { kind: 'block', slideId: title, blockId: 'lead' },
            body: { text: 'Can the lead name the quarter?', mentions: [] },
          },
          save: { key: 'leadThread', from: 'thread.id' },
        },
        { kind: 'signal', signal: 'asked' },
      ],
      needs: [`${title}#lead`],
    },
    {
      name: 'Resolve the lead thread',
      doing: 'resolving a comment',
      after: 'answered',
      steps: [
        { kind: 'point', slide: title, at: { x: 900, y: 320 } },
        {
          kind: 'act',
          action: 'comment.resolve',
          slide: title,
          input: { threadId: '$leadThread' },
        },
        { kind: 'signal', signal: 'resolved' },
        ...look(title),
      ],
      needs: [title],
    },
  ],
};

/** The scripts of the chapters the agents play, by chapter. */
export const STORY_SCRIPTS: Readonly<Record<1 | 2 | 3, AgentScript>> = {
  1: AGENTS,
  2: FEATURES,
  3: TOGETHER,
};

/** A visit of the third chapter: a person of the title by name and hue, or OpenClaw or Hermes. */
export type StoryVisit =
  | { kind: 'person'; name: string; hue: 1 | 2 | 3 | 4 | 5 | 6 }
  | { kind: 'agent'; brand: 'openclaw' | 'hermes' };

/** The third chapter's visits, in order, one every VISIT_EVERY_MS. */
export const STORY_VISITS: readonly StoryVisit[] = [
  { kind: 'person', name: PEOPLE[0].name, hue: PEOPLE[0].hue },
  { kind: 'agent', brand: 'openclaw' },
  { kind: 'person', name: PEOPLE[1].name, hue: PEOPLE[1].hue },
  { kind: 'agent', brand: 'hermes' },
];

/** The time between two visits of the third chapter. */
const VISIT_EVERY_MS = 1400;
/** The time after which the third chapter's visits start again (a visit lasts twelve seconds). */
const VISITS_AGAIN_MS = 16_000;
/** The time each slide of the fourth chapter's slideshow stays. */
export const SLIDESHOW_MS = 2600;

export type StoryOptions = {
  /** the agents' loop of the hero at rest */
  main: Pick<Runner, 'pause' | 'resume'>;
  /** a runner of the two agents over a chapter's script (session.ts) */
  runner: (script: AgentScript) => Runner;
  /** the agent whose controller writes the transition and puts back what a chapter changed */
  tidy: Pick<AgentHandle, 'invoke' | 'document' | 'revision'>;
  /** the visitor's editor */
  visitor: {
    goto: (slideId: string) => void;
    present: (on: boolean) => void;
    activeSlide: () => string | null;
  };
  visit: (visit: StoryVisit) => void;
  /** clears the words both agents' flags show, so a chapter's step never names the next one's */
  hush: () => void;
  setTimeout: (run: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  /** the clock the held timers measure what they have left by; Date.now unless set */
  now?: () => number;
  /** reduced motion: the slideshow does not step */
  reducedMotion?: () => boolean;
};

export type Story = {
  /** the page's word: the chapter the reader has scrolled to, 0 to TRY_CHAPTERS */
  set: (chapter: number) => void;
  /** the chapter playing now */
  chapter: () => number;
  /** forwards the page's and the document's word to the chapter's runner and holds its timers */
  setOnScreen: (on: boolean) => void;
  setVisible: (visible: boolean) => void;
  /** the third chapter plays: the guests visit though the hero's loop is paused */
  hosting: () => boolean;
  /** settles once the director has reached the chapter named last */
  settled: () => Promise<void>;
  stop: () => Promise<void>;
};

/**
 * A timer of the story: armed while the frame is on screen and its document visible, held with
 * the time it has left otherwise, so the visits and the slideshow carry on from where they were.
 */
type Timer = { run: () => void; left: number; due: number; id: number | null };

export function createStory(options: StoryOptions): Story {
  const now = options.now ?? (() => Date.now());
  let target = 0;
  let current = 0;
  let onScreen = true;
  let visible = true;
  let stopped = false;
  let active: Runner | null = null;
  let timers: Timer[] = [];
  let moving: Promise<void> = Promise.resolve();

  const open = (): boolean => onScreen && visible;
  const arm = (timer: Timer): void => {
    timer.due = now() + timer.left;
    timer.id = options.setTimeout(() => {
      timers = timers.filter((each) => each !== timer);
      timer.run();
    }, timer.left);
  };
  const later = (run: () => void, ms: number): void => {
    const timer: Timer = { run, left: ms, due: 0, id: null };
    timers.push(timer);
    if (open()) arm(timer);
  };
  /** off screen or hidden: every armed timer stops and keeps what it has left */
  const hold = (): void => {
    for (const timer of timers) {
      if (timer.id === null) continue;
      options.clearTimeout(timer.id);
      timer.id = null;
      timer.left = Math.max(0, timer.due - now());
    }
  };
  /** back on screen and visible: every held timer runs out what it had left */
  const release = (): void => {
    for (const timer of timers) if (timer.id === null) arm(timer);
  };
  const clearTimers = (): void => {
    for (const timer of timers) if (timer.id !== null) options.clearTimeout(timer.id);
    timers = [];
  };
  const regate = (): void => {
    if (open()) release();
    else hold();
  };

  /** one write of the tidy agent, with its base revision; a refusal is left as it is */
  const write = (action: string, input: Record<string, unknown>): Promise<unknown> =>
    options.tidy
      .invoke(action, { ...input, baseRevision: options.tidy.revision() })
      .catch(() => undefined);

  /** what a chapter added or changed, put back by one agent's controller */
  const putBack = async (): Promise<void> => {
    const document = (): ReturnType<typeof options.tidy.document> => options.tidy.document();
    for (const slideId of Object.keys(document().slides).filter(isStorySlide))
      await write('slide.remove', { slideId });
    if (document().deck.theme !== HERO_THEME)
      await write('deck.set', { path: '/theme', value: HERO_THEME });
    const titleSlide = document().slides[title] as { slots?: Record<string, unknown> } | undefined;
    const lead = titleSlide?.slots?.main;
    const leadText = Array.isArray(lead)
      ? (lead as { id?: string; text?: unknown }[]).find((block) => block.id === 'lead')?.text
      : undefined;
    if (typeof leadText === 'string' && leadText !== TITLE_LEAD)
      await write('block.set', {
        slideId: title,
        blockId: 'lead',
        path: '/text',
        value: TITLE_LEAD,
      });
    if ((document().deck as { transition?: unknown }).transition !== undefined)
      await write('slide.transition', { transition: null });
  };

  /** the third chapter's visits, again every VISITS_AGAIN_MS while it plays */
  const visits = (): void => {
    STORY_VISITS.forEach((visit, i) => later(() => options.visit(visit), i * VISIT_EVERY_MS));
    later(visits, VISITS_AGAIN_MS);
  };

  /** the fourth chapter's slideshow: the next slide of the deck every SLIDESHOW_MS */
  const step = (): void => {
    const order = options.tidy.document().deck.sections.flatMap((section) => section.slideIds);
    const at = order.indexOf(options.visitor.activeSlide() ?? '');
    const next = order[(at + 1) % order.length];
    if (next !== undefined) options.visitor.goto(next);
    later(step, SLIDESHOW_MS);
  };

  const leave = async (chapter: number): Promise<void> => {
    clearTimers();
    if (chapter >= 1 && chapter <= 3) {
      const runner = active;
      active = null;
      await runner?.stop();
    }
    if (chapter === 4) options.visitor.present(false);
    if (chapter !== 0) await putBack();
    options.hush();
  };

  const enter = (chapter: number): void => {
    if (chapter === 0) {
      options.main.resume();
      return;
    }
    options.main.pause();
    if (chapter === 1 || chapter === 2 || chapter === 3) {
      const runner = options.runner(STORY_SCRIPTS[chapter]);
      runner.setOnScreen(onScreen);
      runner.setVisible(visible);
      runner.start();
      active = runner;
      if (chapter === 3) {
        options.visitor.goto(title);
        visits();
      }
      return;
    }
    void write('slide.transition', { transition: STORY_TRANSITION });
    options.visitor.goto(title);
    options.visitor.present(true);
    if (options.reducedMotion?.() !== true) later(step, SLIDESHOW_MS);
  };

  /* read through a call, since stop() sets it while a move awaits */
  const halted = (): boolean => stopped;

  /** one chapter at a time, from the one playing to the last one named */
  const move = async (): Promise<void> => {
    while (!halted() && current !== target) {
      await leave(current);
      current = target;
      if (!halted()) enter(current);
    }
  };

  return {
    set(chapter) {
      if (stopped || !Number.isInteger(chapter) || chapter < 0 || chapter > TRY_CHAPTERS) return;
      target = chapter;
      moving = moving.then(move);
    },
    chapter: () => current,
    setOnScreen(on) {
      onScreen = on;
      active?.setOnScreen(on);
      regate();
    },
    setVisible(on) {
      visible = on;
      active?.setVisible(on);
      regate();
    },
    hosting: () => current === 3 && onScreen && visible,
    settled: () => moving,
    async stop() {
      stopped = true;
      clearTimers();
      await moving;
      await active?.stop();
      active = null;
    },
  };
}
