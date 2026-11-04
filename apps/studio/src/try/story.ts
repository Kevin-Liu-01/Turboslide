import { PEOPLE } from '../components/site/copy';
import { TRY_CHAPTERS } from '../components/site/try-frame';
import type { AgentHandle, Runner } from './agents';
import { HERO_LIGHTHOUSE, HERO_SLIDES, HERO_THEME } from './hero-deck';
import { regionChart, regionData } from './script';
import type { AgentScript } from './script';

/**
 * The chapters after the hero (docs/SITE.md 5, "The chapters"): each section of /home after the
 * hero holds a frame of this editor, and the page names its chapter once the frame is ready
 * (`ts-try:chapter`, components/site/ChapterBox.tsx), so the hero's own presentation shows each
 * claim. Chapter 0 is the hero, the agents' loop of script.ts. Chapters 1 and 2 pause that loop
 * and run a script of their own on the same two agents (agents.ts `createRunner` over the scripts
 * below, its own director moving the visitor's stage to what the agents write): Claude Code adds a
 * slide, lays a pattern of the shader library behind it and tries two more, and Codex places Cape
 * Hatteras Light on it; then Codex adds a chart slide, grows the chart, turns it to columns and
 * adds a table while Claude Code tries three themes and goes back to Swiss. Chapter 3 holds the
 * stage on the title slide while two people of the title and OpenClaw and Hermes visit it
 * (guests.ts), OpenClaw and Hermes leaving a comment each. Chapter 4 starts the slideshow and steps
 * it through the deck. A chapter's script starts again while its section stays on screen.
 *
 * Every chapter leaves the deck as it found it: the slides a chapter adds carry the `story-`
 * prefix, and leaving the chapter waits for its agents to stop, then removes those slides and puts
 * the theme back; leaving the slideshow ends it. Should a frame be named chapters faster than
 * they play, the director moves from the chapter it plays to the last one named, one at a time.
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
        text: 'Cape Hatteras Light',
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

/** The second chapter's slide, whole: a heading and a sentence before the chart and the table. */
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

/** The patterns of the shader library Claude Code tries, in order; the last one stays. */
const PATTERNS = ['paper:god-rays', 'paper:smoke-ring', 'paper:mesh-gradient'] as const;

/** The themes Claude Code tries in the second chapter before it goes back to the deck's own. */
const THEMES = [
  { id: 'coral', name: 'Coral' },
  { id: 'night', name: 'Night' },
  { id: 'mint', name: 'Mint' },
] as const;

/** A step that only shows the slide as it stands. */
const look = (slide: string, ms = 1800) =>
  [
    { kind: 'point', slide, at: { x: 1000, y: 420 } },
    { kind: 'hold', ms },
    { kind: 'point', slide, at: { x: 560, y: 640 } },
    { kind: 'hold', ms },
  ] as const;

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
      steps: PATTERNS.slice(1).flatMap((materialId) => [
        { kind: 'select', slide: LIGHT, block: 'ground' } as const,
        { kind: 'hold', ms: 1400 } as const,
        {
          kind: 'act',
          action: 'block.set',
          slide: LIGHT,
          block: 'ground',
          input: { slideId: LIGHT, blockId: 'ground', path: '/materialId', value: materialId },
        } as const,
      ]),
      needs: [`${LIGHT}#ground`],
    },
    {
      name: 'Look over the slide',
      doing: 'reading the slide',
      after: 'placed',
      steps: [...look(LIGHT), ...look(LIGHT)],
      needs: [LIGHT],
    },
    {
      name: 'Remove the lighthouse slide',
      doing: 'putting the deck back',
      after: 'placed',
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
        { kind: 'point', slide: LIGHT, at: { x: 1180, y: 300 } },
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
              pos: { x: 864, y: 96, w: 640, h: 360, z: 3 },
            },
          },
        },
        { kind: 'select', slide: LIGHT, block: 'photo' },
        { kind: 'hold', ms: 1200 },
        { kind: 'signal', signal: 'placed' },
      ],
      needs: [LIGHT],
    },
  ],
};

/** Chapter 2: every feature you reach for. */
const FEATURES: AgentScript = {
  claude: [
    {
      name: 'Try three themes',
      doing: 'trying themes',
      after: 'chart-ready',
      steps: [
        ...THEMES.flatMap((theme) => [
          { kind: 'say', words: `trying the ${theme.name} theme` } as const,
          {
            kind: 'act',
            action: 'deck.set',
            slide: CHART,
            input: { path: '/theme', value: theme.id },
          } as const,
          { kind: 'point', slide: CHART, at: { x: 700, y: 500 } } as const,
          { kind: 'hold', ms: 1400 } as const,
        ]),
        { kind: 'say', words: 'going back to Swiss' },
        {
          kind: 'act',
          action: 'deck.set',
          slide: CHART,
          input: { path: '/theme', value: HERO_THEME },
        },
        { kind: 'signal', signal: 'themed' },
      ],
      needs: [CHART],
    },
    {
      name: 'Look over the chart',
      doing: 'reading the slide',
      after: 'tabled',
      steps: look(CHART),
      needs: [CHART],
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
      name: 'Add a chart',
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
        { kind: 'signal', signal: 'tabled' },
      ],
      needs: [CHART],
    },
    {
      name: 'Remove the chart slide',
      doing: 'putting the deck back',
      after: 'themed',
      tidy: true,
      steps: [
        ...look(CHART),
        { kind: 'point', slide: CHART, at: { x: 800, y: 450 } },
        { kind: 'act', action: 'slide.remove', slide: CHART, input: { slideId: CHART } },
      ],
      needs: [CHART],
    },
  ],
};

/** The scripts of the chapters the agents play, by chapter. */
export const STORY_SCRIPTS: Readonly<Record<1 | 2, AgentScript>> = { 1: AGENTS, 2: FEATURES };

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
  /** the agent whose controller removes what a chapter added */
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
};

export type Story = {
  /** the page's word: the chapter the reader has scrolled to, 0 to TRY_CHAPTERS */
  set: (chapter: number) => void;
  /** the chapter playing now */
  chapter: () => number;
  /** forwards the page's and the document's word to the chapter's runner */
  setOnScreen: (on: boolean) => void;
  setVisible: (visible: boolean) => void;
  /** the third chapter plays: the guests visit though the hero's loop is paused */
  hosting: () => boolean;
  /** settles once the director has reached the chapter named last */
  settled: () => Promise<void>;
  stop: () => Promise<void>;
};

export function createStory(options: StoryOptions): Story {
  let target = 0;
  let current = 0;
  let onScreen = true;
  let visible = true;
  let stopped = false;
  let active: Runner | null = null;
  let timers: number[] = [];
  let moving: Promise<void> = Promise.resolve();

  const later = (run: () => void, ms: number): void => {
    timers.push(options.setTimeout(run, ms));
  };
  const clearTimers = (): void => {
    for (const id of timers) options.clearTimeout(id);
    timers = [];
  };

  /** the slides a chapter added and the theme it changed, put back by one agent's controller */
  const putBack = async (): Promise<void> => {
    const { tidy } = options;
    for (const slideId of Object.keys(tidy.document().slides).filter(isStorySlide))
      await tidy
        .invoke('slide.remove', { slideId, baseRevision: tidy.revision() })
        .catch(() => undefined);
    if (tidy.document().deck.theme !== HERO_THEME)
      await tidy
        .invoke('deck.set', { path: '/theme', value: HERO_THEME, baseRevision: tidy.revision() })
        .catch(() => undefined);
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
    if (chapter === 1 || chapter === 2) {
      const runner = active;
      active = null;
      await runner?.stop();
      await putBack();
    }
    if (chapter === 4) options.visitor.present(false);
    options.hush();
  };

  const enter = (chapter: number): void => {
    if (chapter === 0) {
      options.main.resume();
      return;
    }
    options.main.pause();
    if (chapter === 1 || chapter === 2) {
      const runner = options.runner(STORY_SCRIPTS[chapter]);
      runner.setOnScreen(onScreen);
      runner.setVisible(visible);
      runner.start();
      active = runner;
      return;
    }
    if (chapter === 3) {
      options.visitor.goto(title);
      visits();
      return;
    }
    options.visitor.goto(title);
    options.visitor.present(true);
    later(step, SLIDESHOW_MS);
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
    },
    setVisible(on) {
      visible = on;
      active?.setVisible(on);
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
