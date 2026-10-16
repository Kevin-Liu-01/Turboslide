import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';

import { ACTIONS, isActionId } from '@turboslide/schema/actions';

import { AGENT_SLIDES_MAX, STEP_MS, createRunner, seeded } from './agents';
import type { AgentHandle, AgentPresence, VisitorView, WriteRecord } from './agents';
import { heroDocument } from './hero-deck';
import { REVIEW, SCRIPT, isAgentSlide, scriptActions } from './script';
import type { AgentKey, Task } from './script';

// The agents' runner (docs/SITE.md C.10) on a fake clock: the script's writes land on a small
// model of the deck (the slide, block and text writes the script makes), and a simulated visitor
// moves between slides, selects blocks and types. The properties: no agent write lands on the
// visitor's slide or selected block once they engaged, a deck level write never lands while they
// type or drag, a slide the visitor wrote on is never removed, nothing is written or posted while
// paused, under reduced motion a pointer move is one post, one loop with an idle visitor ends
// on the deck it started from, every slide reads at every write (no empty text), and a press
// wakes an agent out of a pause or a wait and sends the visitor's stage to its slide.

type Model = { document: DeckDocument; theme: string; values: number[]; comments: number };

function slideIds(document: DeckDocument): string[] {
  return document.deck.sections.flatMap((section) => section.slideIds);
}

/** The deck the agents write, as far as the script's writes reach it. */
function model(): Model {
  return {
    document: heroDocument('try-test'),
    theme: 'swiss',
    values: [42, 51, 58, 66],
    comments: 0,
  };
}

type Block = {
  id: string;
  type: string;
  text?: string;
  pos?: { x: number; y: number; w: number; h: number; z: number };
};

/** The Text at a JSON pointer inside a block, or ''. */
function textOf(block: Block, path: string): string {
  let value: unknown = block;
  for (const key of path.split('/').slice(1))
    value = (value as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'string' ? value : '';
}

function setText(block: Block, path: string, text: string): void {
  const keys = path.split('/').slice(1);
  let value = block as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) value = value[key] as Record<string, unknown>;
  value[keys[keys.length - 1]!] = text;
}

/** Every Text of a block: its text, a table's cells. */
function textsOf(block: Block): string[] {
  const rows = (block as { rows?: { cells?: unknown[] }[] }).rows ?? [];
  return [
    ...(typeof block.text === 'string' ? [block.text] : []),
    ...rows.flatMap((row) =>
      (row.cells ?? []).filter((cell): cell is string => typeof cell === 'string'),
    ),
  ];
}

function blocksOf(document: DeckDocument, slideId: string): Block[] {
  const slide = document.slides[slideId] as unknown as
    { slots?: Record<string, Block[]> } | undefined;
  return Object.values(slide?.slots ?? {}).flat();
}

function apply(m: Model, action: string, input: Record<string, unknown>): unknown {
  const doc = m.document;
  const order = doc.deck.sections[0]!.slideIds;
  switch (action) {
    case 'slide.new': {
      const id = input.id as string;
      doc.slides[id] = {
        schemaVersion: 1,
        id,
        kind: 'content',
        layout: { type: 'split' },
        slots: {
          head: [{ id: 'h', type: 'heading', text: '' }],
          body: [{ id: 'p1', type: 'paragraph', text: '' }],
        },
      } as never;
      order.splice(order.indexOf(input.after as string) + 1, 0, id);
      return { slide: doc.slides[id] };
    }
    case 'slide.insert': {
      const slide = structuredClone(input.slide) as { id: string };
      doc.slides[slide.id] = slide as never;
      order.splice(order.indexOf(input.after as string) + 1, 0, slide.id);
      return { slide };
    }
    case 'slide.remove': {
      delete doc.slides[input.slideId as string];
      order.splice(order.indexOf(input.slideId as string), 1);
      return {};
    }
    case 'slide.move': {
      order.splice(order.indexOf(input.slideId as string), 1);
      order.splice(order.indexOf(input.after as string) + 1, 0, input.slideId as string);
      return {};
    }
    case 'block.insert': {
      const slide = doc.slides[input.slideId as string] as unknown as {
        slots: Record<string, Block[]>;
      };
      slide.slots.main!.push(structuredClone(input.block) as Block);
      return {};
    }
    case 'block.remove': {
      const slide = doc.slides[input.slideId as string] as unknown as {
        slots: Record<string, Block[]>;
      };
      slide.slots.main = slide.slots.main!.filter((block) => block.id !== input.blockId);
      return {};
    }
    case 'block.set': {
      const block = blocksOf(doc, input.slideId as string).find((row) => row.id === input.blockId);
      if (block !== undefined) block.pos = input.value as Block['pos'];
      return {};
    }
    case 'text.insert': {
      const block = blocksOf(doc, input.slideId as string).find((row) => row.id === input.blockId);
      if (block !== undefined) {
        const text = textOf(block, input.path as string);
        const at = input.at as number;
        setText(
          block,
          input.path as string,
          `${text.slice(0, at)}${input.text as string}${text.slice(at)}`,
        );
      }
      return {};
    }
    case 'slide.update': {
      for (const mutation of input.mutations as Record<string, unknown>[]) {
        if (mutation.op === 'slide.set' && mutation.path === '/notes')
          (doc.slides[input.slideId as string] as { notes?: string }).notes =
            mutation.value as string;
        if (mutation.op === 'text.replace') {
          const block = blocksOf(doc, input.slideId as string).find(
            (row) => row.id === mutation.blockId,
          );
          if (block === undefined) continue;
          const text = textOf(block, mutation.path as string);
          const [from, to] = mutation.range as [number, number];
          setText(
            block,
            mutation.path as string,
            `${text.slice(0, from)}${mutation.text as string}${text.slice(to)}`,
          );
        }
      }
      return {};
    }
    case 'chart.setData':
      if (input.slideId === 'numbers')
        m.values = ((input.series as { values: number[] }[])[0]?.values ?? []).slice();
      return {};
    case 'deck.set':
      m.theme = input.value as string;
      return {};
    case 'comment.add':
      m.comments += 1;
      return { thread: { id: `01j9zzzzzzzzzzzzzzzzzzzz${String(m.comments).padStart(2, '0')}` } };
    default:
      return {};
  }
}

type World = {
  m: Model;
  says: { agent: AgentKey; words: string | null; at: number }[];
  writes: (WriteRecord & { input: Record<string, unknown> })[];
  presence: { agent: AgentKey; state: AgentPresence; at: number }[];
  violations: string[];
};

function world(visitor: () => VisitorView): World & { agents: Record<AgentKey, AgentHandle> } {
  const w: World = { m: model(), says: [], writes: [], presence: [], violations: [] };
  const handle = (agent: AgentKey): AgentHandle => ({
    invoke: async (action, raw) => {
      const input = raw as Record<string, unknown>;
      const v = visitor();
      const slideId =
        (input.slideId as string | undefined) ??
        (action === 'slide.new' ? (input.id as string) : undefined) ??
        (action === 'slide.insert' ? (input.slide as { id: string }).id : undefined);
      if (v.engaged() && slideId !== undefined && slideId === v.activeSlide())
        w.violations.push(`${agent} ${action} on the visitor's slide ${slideId}`);
      if (
        v.engaged() &&
        ['deck.set', 'slide.move', 'slide.new', 'slide.insert', 'slide.remove'].includes(action) &&
        v.busy()
      )
        w.violations.push(`${agent} ${action} while the visitor typed`);
      if (action === 'slide.remove' && v.touched().has(`slide:${input.slideId as string}`))
        w.violations.push(`${agent} removed the visitor's slide ${input.slideId as string}`);
      w.writes.push({
        agent,
        action,
        slideId: slideId ?? '',
        deckLevel: false,
        at: Date.now(),
        input,
      });
      return apply(w.m, action, input);
    },
    present: (state) => w.presence.push({ agent, state, at: Date.now() }),
    say: (words) => w.says.push({ agent, words, at: Date.now() }),
    document: () => w.m.document,
    revision: () => 1,
  });
  return { ...w, agents: { claude: handle('claude'), codex: handle('codex') } };
}

/** A visitor who moves between slides at random, selects blocks and types now and then. */
function wanderingVisitor(
  seed: number,
  doc: () => DeckDocument,
): VisitorView & { tick: () => void } {
  const random = seeded(seed);
  let active: string | null = 'title';
  let block: string | null = null;
  let typingUntil = 0;
  const touched = new Set<string>();
  return {
    activeSlide: () => active,
    selectedBlock: () => block,
    busy: () => Date.now() < typingUntil,
    engaged: () => true,
    touched: () => touched,
    goto: () => undefined,
    tick() {
      const ids = slideIds(doc());
      active = ids[Math.floor(random() * ids.length)] ?? null;
      const blocks = active === null ? [] : blocksOf(doc(), active);
      block = random() < 0.5 ? (blocks[Math.floor(random() * blocks.length)]?.id ?? null) : null;
      if (random() < 0.3) {
        typingUntil = Date.now() + 1500;
        if (active !== null) touched.add(`slide:${active}`);
      }
    },
  };
}

describe("the agents' runner", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-14T12:00:00Z') });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes only the actions of the script', async () => {
    let view: VisitorView | null = null;
    const w = world(() => view!);
    view = {
      activeSlide: () => 'title',
      selectedBlock: () => null,
      busy: () => false,
      engaged: () => false,
      touched: () => new Set(),
      goto: () => undefined,
    };
    const runner = createRunner({ agents: w.agents, visitor: view, seed: 1 });
    runner.start();
    await vi.advanceTimersByTimeAsync(90_000);
    runner.stop();
    const allowed = new Set<string>(scriptActions());
    expect(w.writes.length).toBeGreaterThan(100);
    expect(w.writes.filter((row) => !allowed.has(row.action))).toEqual([]);
    /* every write the runner made, the letters and the notes included, parses as its action */
    for (const row of w.writes) {
      if (!isActionId(row.action)) continue;
      const parsed = ACTIONS[row.action].input.safeParse(row.input);
      expect(parsed.success, `${row.action} ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it('names every task in a few words as it starts, and reviews a slide while it waits', async () => {
    let view: VisitorView | null = null;
    const w = world(() => view!);
    view = {
      activeSlide: () => 'title',
      selectedBlock: () => null,
      busy: () => false,
      engaged: () => false,
      touched: () => new Set(),
      goto: () => undefined,
    };
    const runner = createRunner({ agents: w.agents, visitor: view, seed: 2, review: REVIEW });
    runner.start();
    while (runner.state().loop < 2) await vi.advanceTimersByTimeAsync(1000);
    runner.stop();
    for (const agent of ['claude', 'codex'] as const) {
      const said = new Set(w.says.filter((row) => row.agent === agent).map((row) => row.words));
      for (const task of SCRIPT[agent]) expect(said.has(task.doing), task.name).toBe(true);
    }
    const reviewed = new Set<string>(
      Object.values(REVIEW).flatMap((tasks: readonly Task[]) => tasks.map((task) => task.doing)),
    );
    expect(w.says.some((row) => row.words !== null && reviewed.has(row.words))).toBe(true);
  });

  it('keeps both agents at work: no agent is still for long, and they often work at once', async () => {
    let view: VisitorView | null = null;
    const w = world(() => view!);
    view = {
      activeSlide: () => 'title',
      selectedBlock: () => null,
      busy: () => false,
      engaged: () => false,
      touched: () => new Set(),
      goto: () => undefined,
    };
    const runner = createRunner({ agents: w.agents, visitor: view, seed: 3, review: REVIEW });
    const t0 = Date.now();
    runner.start();
    await vi.advanceTimersByTimeAsync(120_000);
    runner.stop();
    for (const agent of ['claude', 'codex'] as const) {
      const times = [
        ...w.presence.filter((row) => row.agent === agent).map((row) => row.at),
        ...w.writes.filter((row) => row.agent === agent).map((row) => row.at),
      ].sort((a, b) => a - b);
      const start = (times[0] ?? t0) - t0;
      let longest = 0;
      for (let i = 1; i < times.length; i += 1)
        longest = Math.max(longest, times[i]! - times[i - 1]!);
      expect(start).toBeLessThan(2000);
      expect(longest, agent).toBeLessThan(2600);
    }
    /* seconds in which both agents wrote, each on its own slide */
    const second = (at: number) => Math.floor(at / 1000);
    const both = new Set(
      w.writes
        .filter((row) => row.agent === 'claude')
        .map((row) => `${second(row.at)}`)
        .filter((at) =>
          w.writes.some((row) => row.agent === 'codex' && `${second(row.at)}` === at),
        ),
    );
    expect(both.size).toBeGreaterThan(10);
  });

  it('until the visitor engages, keeps their stage on a slide an agent works on', async () => {
    let view: VisitorView | null = null;
    const w = world(() => view!);
    let active = 'title';
    view = {
      activeSlide: () => active,
      selectedBlock: () => null,
      busy: () => false,
      engaged: () => false,
      touched: () => new Set(),
      goto: (slideId) => {
        active = slideId;
      },
    };
    const runner = createRunner({ agents: w.agents, visitor: view, seed: 5, review: REVIEW });
    runner.start();
    await vi.advanceTimersByTimeAsync(3000);
    let samples = 0;
    let shown = 0;
    for (let t = 0; t < 90_000; t += 250) {
      await vi.advanceTimersByTimeAsync(250);
      samples += 1;
      if (active === runner.slideOf('claude') || active === runner.slideOf('codex')) shown += 1;
    }
    runner.stop();
    expect(shown / samples).toBeGreaterThan(0.75);
  });

  it('shows at least STEP_MS of work before every write', async () => {
    let view: VisitorView | null = null;
    const w = world(() => view!);
    view = {
      activeSlide: () => 'title',
      selectedBlock: () => null,
      busy: () => false,
      engaged: () => false,
      touched: () => new Set(),
      goto: () => undefined,
    };
    const runner = createRunner({ agents: w.agents, visitor: view, seed: 7, review: REVIEW });
    runner.start();
    await vi.advanceTimersByTimeAsync(90_000);
    runner.stop();
    /* a write that is not a letter or a word of notes comes at least STEP_MS after the words of
       its step were said */
    const letters = new Set(['text.insert', 'slide.update']);
    for (const agent of ['claude', 'codex'] as const)
      for (const row of w.writes.filter((each) => each.agent === agent)) {
        if (letters.has(row.action)) continue;
        const said = w.says.filter((each) => each.agent === agent && each.at < row.at).pop();
        expect(said, row.action).toBeDefined();
        expect(row.at - said!.at, `${agent} ${row.action}`).toBeGreaterThanOrEqual(STEP_MS);
      }
  });

  it('leaves a slide the visitor works on, does other work, and comes back to finish', async () => {
    let view: VisitorView | null = null;
    const w = world(() => view!);
    let active = 'agenda';
    view = {
      activeSlide: () => active,
      selectedBlock: () => null,
      busy: () => false,
      engaged: () => true,
      touched: () => new Set(),
      goto: () => undefined,
      lastInput: () => Date.now(),
    };
    const script = {
      claude: [
        {
          name: 'Rewrite the agenda heading',
          doing: 'rewriting the title',
          steps: [
            { kind: 'point' as const, slide: 'agenda', at: { x: 300, y: 400 } },
            {
              kind: 'write' as const,
              slide: 'agenda',
              block: 'h',
              path: '/text',
              text: 'Agenda for the review',
            },
          ],
        },
        {
          name: 'Write on what shipped',
          doing: 'writing a point',
          steps: [
            {
              kind: 'write' as const,
              slide: 'shipped',
              block: 'p1',
              path: '/text',
              text: 'Three releases this quarter, all on time.',
            },
          ],
        },
      ],
      codex: [],
    };
    const runner = createRunner({ agents: w.agents, visitor: view, seed: 11, script });
    runner.start();
    await vi.advanceTimersByTimeAsync(2500);
    expect(w.writes.filter((row) => row.slideId === 'agenda')).toEqual([]);
    /* the visitor moves on: the agenda is free again and the heading is finished */
    await vi.advanceTimersByTimeAsync(4000);
    active = 'title';
    await vi.advanceTimersByTimeAsync(8000);
    runner.stop();
    const order = w.writes.map((row) => row.slideId);
    expect(order.indexOf('shipped')).toBeLessThan(order.indexOf('agenda'));
    const agenda = blocksOf(w.m.document, 'agenda').find((block) => block.id === 'h');
    expect(agenda?.text).toBe('Agenda for the review');
    const shipped = blocksOf(w.m.document, 'shipped').find((block) => block.id === 'p1');
    expect(shipped?.text).toBe('Three releases this quarter, all on time.');
  });

  it('never writes on the visitor’s slide or selected block, nor the deck while they type (200 seeds)', async () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      let view: (VisitorView & { tick: () => void }) | null = null;
      const w = world(() => view!);
      view = wanderingVisitor(seed, () => w.m.document);
      const random = seeded(seed * 7);
      const runner = createRunner({ agents: w.agents, visitor: view, seed });
      runner.start();
      for (let t = 0; t < 60_000;) {
        const step = 500 + Math.floor(random() * 2500);
        await vi.advanceTimersByTimeAsync(step);
        t += step;
        view.tick();
      }
      runner.stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(w.violations, `seed ${seed}`).toEqual([]);
    }
  }, 900_000);

  it('writes nothing and posts nothing while paused or off screen', async () => {
    let view: VisitorView | null = null;
    const w = world(() => view!);
    view = {
      activeSlide: () => 'title',
      selectedBlock: () => null,
      busy: () => false,
      engaged: () => false,
      touched: () => new Set(),
      goto: () => undefined,
    };
    const runner = createRunner({ agents: w.agents, visitor: view, seed: 3 });
    runner.start();
    await vi.advanceTimersByTimeAsync(8000);
    for (const pause of [
      () => runner.setOnScreen(false),
      () => runner.setVisible(false),
      () => runner.pause(),
    ]) {
      pause();
      await vi.advanceTimersByTimeAsync(500);
      const writes = w.writes.length;
      const posts = w.presence.length;
      await vi.advanceTimersByTimeAsync(10_000);
      expect(w.writes.length).toBe(writes);
      expect(w.presence.length).toBe(posts);
      runner.setOnScreen(true);
      runner.setVisible(true);
      runner.resume();
      await vi.advanceTimersByTimeAsync(6000);
      expect(w.writes.length + w.presence.length).toBeGreaterThan(writes + posts);
    }
    runner.stop();
  });

  it('under reduced motion moves a pointer in one post and draws no drag box', async () => {
    let view: VisitorView | null = null;
    const w = world(() => view!);
    view = {
      activeSlide: () => 'title',
      selectedBlock: () => null,
      busy: () => false,
      engaged: () => false,
      touched: () => new Set(),
      goto: () => undefined,
    };
    const runner = createRunner({
      agents: w.agents,
      visitor: view,
      seed: 4,
      review: REVIEW,
      reducedMotion: () => true,
    });
    runner.start();
    await vi.advanceTimersByTimeAsync(80_000);
    runner.stop();
    expect(w.presence.some((row) => row.state.drag !== undefined)).toBe(false);
    /* a pointer moves in one post: every pointer an agent posts on its own is a point of the
       script, never a place on the way there */
    const targets = new Set(
      [...Object.values(SCRIPT), ...Object.values(REVIEW)].flatMap((tasks: readonly Task[]) =>
        tasks.flatMap((task) =>
          task.steps.flatMap((step) =>
            step.kind === 'point' ? [`${step.at.x},${step.at.y}`] : [],
          ),
        ),
      ),
    );
    for (const row of w.presence)
      if (row.state.selection === undefined && row.state.pointer !== undefined)
        expect(targets.has(`${row.state.pointer.x},${row.state.pointer.y}`), row.agent).toBe(true);
    expect(w.writes.some((row) => row.action === 'block.set')).toBe(true);
  });

  it('ends a loop with an idle visitor on the deck it started from', async () => {
    let view: VisitorView | null = null;
    const w = world(() => view!);
    const start = structuredClone(w.m.document);
    view = {
      activeSlide: () => 'title',
      selectedBlock: () => null,
      busy: () => false,
      engaged: () => false,
      touched: () => new Set(),
      goto: () => undefined,
    };
    const runner = createRunner({ agents: w.agents, visitor: view, seed: 5 });
    runner.start();
    while (runner.state().loop < 2) await vi.advanceTimersByTimeAsync(1000);
    runner.stop();
    expect(slideIds(w.m.document)).toEqual(slideIds(start));
    expect(w.m.document.slides.numbers).toEqual(start.slides.numbers);
    expect(w.m.theme).toBe('swiss');
    expect(w.m.values).toEqual([42, 51, 58, 66]);
    expect(w.writes.some((row) => row.action === 'text.insert' && row.agent === 'claude')).toBe(
      true,
    );
    expect(w.writes.some((row) => row.action === 'block.insert' && row.agent === 'codex')).toBe(
      true,
    );
  });

  it('never removes a slide the visitor wrote on, and keeps at most AGENT_SLIDES_MAX of its own', async () => {
    let view: VisitorView | null = null;
    const w = world(() => view!);
    const touched = new Set<string>();
    view = {
      activeSlide: () => 'title',
      selectedBlock: () => null,
      busy: () => false,
      engaged: () => false,
      touched: () => touched,
      goto: () => undefined,
    };
    const runner = createRunner({ agents: w.agents, visitor: view, seed: 6 });
    runner.start();
    /* the visitor writes on every slide the agents add */
    for (let i = 0; i < 400; i += 1) {
      await vi.advanceTimersByTimeAsync(1000);
      for (const id of slideIds(w.m.document)) if (isAgentSlide(id)) touched.add(`slide:${id}`);
    }
    runner.stop();
    expect(w.violations).toEqual([]);
    expect(w.writes.filter((row) => row.action === 'slide.remove')).toEqual([]);
    expect(slideIds(w.m.document).filter(isAgentSlide).length).toBe(AGENT_SLIDES_MAX);
  }, 60_000);

  it('keeps every text on every slide readable at every write (no empty placeholder)', async () => {
    let view: VisitorView | null = null;
    const w = world(() => view!);
    view = {
      activeSlide: () => 'title',
      selectedBlock: () => null,
      busy: () => false,
      engaged: () => false,
      touched: () => new Set(),
      goto: () => undefined,
    };
    const empties: string[] = [];
    const runner = createRunner({
      agents: w.agents,
      visitor: view,
      seed: 8,
      onWrite: () => {
        for (const id of slideIds(w.m.document))
          for (const block of blocksOf(w.m.document, id))
            for (const text of textsOf(block))
              if (text.trim() === '') empties.push(`${id}#${block.id}`);
      },
    });
    runner.start();
    while (runner.state().loop < 3) await vi.advanceTimersByTimeAsync(1000);
    runner.stop();
    expect(w.writes.length).toBeGreaterThan(60);
    expect(empties).toEqual([]);
  }, 60_000);

  it('takes a pressed agent out of a pause or a wait at once and shows the visitor its slide', async () => {
    const chart = (value: number) => ({
      kind: 'act' as const,
      action: 'chart.setData' as const,
      slide: 'numbers',
      block: 'chart',
      input: {
        slideId: 'numbers',
        blockId: 'chart',
        categories: ['Q1', 'Q2', 'Q3', 'Q4'],
        series: [{ name: 'Orders', values: [42, 51, 58, value] }],
      },
    });
    const scripts = {
      pause: [
        {
          name: 'Rest, then write',
          doing: 'resting',
          steps: [
            { kind: 'point' as const, slide: 'numbers', at: { x: 800, y: 400 } },
            { kind: 'hold' as const, ms: 20_000 },
            chart(70),
          ],
        },
      ],
      wait: [
        {
          name: 'Wait for a signal that never comes',
          doing: 'waiting',
          steps: [
            { kind: 'point' as const, slide: 'numbers', at: { x: 800, y: 400 } },
            { kind: 'wait' as const, signal: 'never' },
          ],
        },
        { name: 'Write', doing: 'writing', steps: [chart(71)] },
      ],
    };
    for (const [name, claude] of Object.entries(scripts)) {
      let view: VisitorView | null = null;
      const w = world(() => view!);
      const gotos: string[] = [];
      view = {
        activeSlide: () => 'title',
        selectedBlock: () => null,
        busy: () => false,
        engaged: () => true,
        touched: () => new Set(),
        goto: (slideId) => gotos.push(slideId),
        lastInput: () => Date.now() - 60_000,
      };
      const runner = createRunner({
        agents: w.agents,
        visitor: view,
        seed: 9,
        script: { claude, codex: [] },
      });
      runner.start();
      await vi.advanceTimersByTimeAsync(3000);
      expect(w.writes, name).toEqual([]);
      runner.nudge('claude');
      expect(gotos, name).toEqual(['numbers']);
      await vi.advanceTimersByTimeAsync(1000);
      expect(
        w.writes.map((row) => row.action),
        name,
      ).toEqual(['chart.setData']);
      runner.stop();
    }
  });
});
