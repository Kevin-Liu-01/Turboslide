import { ACTIONS, isActionId } from '@turboslide/schema/actions';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import { plainOf } from '@turboslide/schema/text';

import { SCRIPT } from './script';
import type { AgentKey, AgentScript, SheetPoint, Step, Task } from './script';

/**
 * The runner of the landing's two agents (docs/SITE.md C.10): it plays the script (script.ts) with
 * Claude Code and Codex, each an editor controller of its own on the tab room, at a pace a person
 * can follow: the pointer travels 600 to 900 ms on an eased path posted at the presence batch
 * rate, an action waits 400 ms, typing runs at 9 to 13 characters a second, and tasks are 1.2 to
 * 2 s apart, with the jitter from a seeded generator so a run repeats.
 *
 * The visitor's work is never touched. Before every write the runner reads the visitor: once the
 * visitor has clicked or typed in the frame, no agent writes to the slide the visitor's stage
 * shows or the block the visitor selected, and a write that changes the whole deck (the theme, the
 * slide order) waits while the visitor types or drags. No agent writes a slide, a block or a deck
 * field the visitor has written. A write that stays blocked for three seconds ends its task, and
 * the agent moves to its next task on another slide. Until the visitor's first click or key, the
 * director moves the visitor's stage to the slide an agent last wrote (one move every four seconds
 * at most), so the first screen shows the cursors and the typing.
 *
 * It runs only while the frame's document is visible and the page says the frame is on screen;
 * paused, it writes nothing and posts no presence. Under reduced motion the pointer jumps to its
 * target and no drag ghost is drawn; every write still happens. Pure over its dependencies, so
 * agents.test.ts runs it on a fake clock with a simulated visitor.
 */

/** What the runner draws of an agent: its slide, selection, caret, pointer and drag box. */
export type AgentPresence = {
  slideId: string;
  pointer?: SheetPoint;
  selection?: { blockIds: string[]; caret?: { blockId: string; path: string; offset: number } };
  drag?: { blockId: string; x: number; y: number; w: number; h: number };
};

/** One agent as the runner drives it. */
export type AgentHandle = {
  /** one action through the page API's own path (`editorAdapter().invoke`) */
  invoke: (action: string, input: unknown) => Promise<unknown>;
  present: (state: AgentPresence) => void;
  /** the document as the agent's controller holds it */
  document: () => DeckDocument;
  /** the revision a write names as `baseRevision` (the controller's reported one) */
  revision: () => number;
};

/** The visitor as the runner reads it (visitor.ts reads the visitor's controller and the frame's events). */
export type VisitorView = {
  /** the slide the visitor's stage shows */
  activeSlide: () => string | null;
  /** the block the visitor has selected */
  selectedBlock: () => string | null;
  /** typing (a key in the last 1.5 s, or a text session open) or a pointer held down */
  busy: () => boolean;
  /** the visitor has clicked or typed in the frame */
  engaged: () => boolean;
  /** what the visitor has written: `slide:<id>`, `block:<slide>#<block>`, `deck:<path>` */
  touched: () => ReadonlySet<string>;
  /** moves the visitor's stage (the director) */
  goto: (slideId: string) => void;
};

/** One write as the runner made it, for the director, the specs and the tests. */
export type WriteRecord = {
  agent: AgentKey;
  action: string;
  slideId: string;
  blockId?: string;
  deckLevel: boolean;
  at: number;
};

export type RunnerState = {
  loop: number;
  tasks: Record<AgentKey, string>;
  writes: number;
  /** presence posts made, for the reduced motion reading */
  presence: number;
  paused: boolean;
  skipped: number;
};

export type Runner = {
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  /** the page's word: the frame is on screen or not */
  setOnScreen: (on: boolean) => void;
  /** the document's visibility */
  setVisible: (visible: boolean) => void;
  state: () => RunnerState;
};

export type RunnerOptions = {
  agents: Record<AgentKey, AgentHandle>;
  visitor: VisitorView;
  script?: AgentScript;
  seed?: number;
  reducedMotion?: () => boolean;
  onWrite?: (write: WriteRecord) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

/** What a write answers when the visitor kept it from landing. */
const BLOCKED = Symbol('blocked');

/** The presence batch rate (PRESENCE_BATCH_MS of @turboslide/realtime/protocol). */
export const FRAME_MS = 80;
/** How long a write waits on the visitor before its task ends. */
export const BLOCKED_MS = 3000;
/** How long a `wait` step waits for the other agent. */
export const WAIT_MS = 30_000;
/** The director's floor between two moves of the visitor's stage. */
export const DIRECTOR_MS = 4000;
/** The most slides the agents add and keep (a slide the visitor wrote on stays). */
export const AGENT_SLIDES_MAX = 3;

/** A seeded generator (mulberry32), so a run repeats. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** The writes that change the whole deck: the theme and the order of the slides. */
const DECK_LEVEL = new Set(['deck.set', 'slide.move', 'slide.new', 'slide.remove']);

/** Fills `{loop}` and `$<key>` in every string of a value. */
export function fill(value: unknown, loop: number, saved: ReadonlyMap<string, unknown>): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('$') && saved.has(value.slice(1))) return saved.get(value.slice(1));
    return value.replaceAll('{loop}', String(loop));
  }
  if (Array.isArray(value)) return value.map((item) => fill(item, loop, saved));
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, fill(item, loop, saved)]),
    );
  return value;
}

/** Whether an action's input carries `baseRevision` (the strict contract of SPEC-3 3.10). */
export function takesBase(action: string): boolean {
  if (!isActionId(action)) return false;
  const shape = (ACTIONS[action].input as { shape?: Record<string, unknown> }).shape;
  return shape !== undefined && 'baseRevision' in shape;
}

function blockOf(slide: Slide | undefined, blockId: string) {
  if (slide === undefined) return undefined;
  return slideBlocks(slide).find((row) => row.block.id === blockId)?.block;
}

/** The plain text of a block's Text at a pointer, in code points. */
export function textLength(
  document: DeckDocument,
  slideId: string,
  blockId: string,
  path: string,
): number {
  const block = blockOf(document.slides[slideId], blockId) as Record<string, unknown> | undefined;
  const value = block?.[path.replace(/^\//, '')];
  return typeof value === 'string' ? [...plainOf(value)].length : 0;
}

/** Whether `slide` or `slide#block` exists in the document. */
export function exists(document: DeckDocument, need: string): boolean {
  const [slideId = '', blockId] = need.split('#');
  const slide = document.slides[slideId];
  if (slide === undefined) return false;
  return blockId === undefined || blockOf(slide, blockId) !== undefined;
}

/**
 * What a write would change that the visitor may have written, in the keys of
 * `VisitorView.touched`: the block a block write names, the slide a slide removal or move names,
 * the manifest field `deck.set` names. A write on another block of a slide the visitor wrote on
 * goes through; one on the visitor's own block, slide or field never does.
 */
export function targetsOf(
  action: string,
  slideId: string,
  blockId: string | undefined,
  input: unknown,
): string[] {
  if (action === 'deck.set') return [`deck:${String((input as { path?: unknown }).path)}`];
  if (action === 'slide.remove' || action === 'slide.move') return [`slide:${slideId}`];
  return blockId === undefined ? [] : [`block:${slideId}#${blockId}`];
}

type Gate = { open: () => boolean; wait: () => Promise<void> };

export function createRunner(options: RunnerOptions): Runner {
  const script = options.script ?? SCRIPT;
  const random = seeded(options.seed ?? 20261014);
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const reduced = options.reducedMotion ?? (() => false);
  const { visitor } = options;
  const keys = Object.keys(options.agents) as AgentKey[];

  let running = false;
  let paused = false;
  let onScreen = true;
  let visible = true;
  let loop = 1;
  let writes = 0;
  let presencePosts = 0;
  let skipped = 0;
  const tasks: Record<AgentKey, string> = { claude: '', codex: '' };
  const signals = new Map<string, number>();
  const saved = new Map<string, unknown>();
  const pointers = new Map<AgentKey, AgentPresence>();
  let lastWrite: WriteRecord | null = null;
  let lastGoto = -Infinity;
  /* the agents finish a loop together: the barrier counts who is done with the current one */
  const doneWith = new Map<AgentKey, number>();

  const gate: Gate = {
    open: () => running && !paused && onScreen && visible,
    wait: async () => {
      while (running && !gate.open()) await sleep(200);
    },
  };
  const jitter = (from: number, to: number): number => from + (to - from) * random();

  const present = (agent: AgentKey, state: AgentPresence): void => {
    if (!gate.open()) return;
    pointers.set(agent, state);
    presencePosts += 1;
    options.agents[agent].present(state);
  };

  /** the director: the visitor's stage follows the agents until the visitor engages */
  const direct = (): void => {
    if (visitor.engaged() || lastWrite === null) return;
    if (visitor.activeSlide() === lastWrite.slideId) return;
    if (now() - lastGoto < DIRECTOR_MS) return;
    if (!exists(options.agents.claude.document(), lastWrite.slideId)) return;
    lastGoto = now();
    visitor.goto(lastWrite.slideId);
  };

  /** whether a write may land now (the rules of the module comment) */
  const allowed = (
    action: string,
    slideId: string,
    blockId: string | undefined,
    input: unknown,
  ): boolean => {
    const touched = visitor.touched();
    if (targetsOf(action, slideId, blockId, input).some((key) => touched.has(key))) return false;
    if (!visitor.engaged()) return true;
    if (visitor.activeSlide() === slideId) return false;
    if (
      blockId !== undefined &&
      visitor.selectedBlock() === blockId &&
      visitor.activeSlide() === slideId
    )
      return false;
    if (DECK_LEVEL.has(action) && visitor.busy()) return false;
    return true;
  };

  /** waits until the write may land; false after BLOCKED_MS (the task ends) */
  const until = async (
    action: string,
    slideId: string,
    blockId: string | undefined,
    input: unknown,
  ): Promise<boolean> => {
    const from = now();
    for (;;) {
      await gate.wait();
      if (!running) return false;
      if (allowed(action, slideId, blockId, input)) return true;
      if (now() - from >= BLOCKED_MS) return false;
      await sleep(150);
    }
  };

  /** one write: the visitor read and the invoke in one turn, so nothing lands between them */
  const write = async (
    agent: AgentKey,
    action: string,
    slideId: string,
    blockId: string | undefined,
    raw: Record<string, unknown>,
  ): Promise<unknown | typeof BLOCKED> => {
    if (!(await until(action, slideId, blockId, raw))) return BLOCKED;
    const handle = options.agents[agent];
    if (!allowed(action, slideId, blockId, raw)) return BLOCKED;
    const input = takesBase(action) ? { ...raw, baseRevision: handle.revision() } : raw;
    let output: unknown;
    try {
      output = await handle.invoke(action, input);
    } catch (error) {
      /* a 409: read the revision again and retry once, as an agent does */
      const current = (error as { currentRevision?: unknown }).currentRevision;
      if (typeof current !== 'number' || !takesBase(action)) throw error;
      if (!allowed(action, slideId, blockId, raw)) return BLOCKED;
      output = await handle.invoke(action, { ...raw, baseRevision: current });
    }
    noteWrite(agent, action, slideId, blockId);
    return output;
  };

  /** counts a write that landed, and lets the director follow it */
  const noteWrite = (agent: AgentKey, action: string, slideId: string, blockId?: string): void => {
    const record: WriteRecord = {
      agent,
      action,
      slideId,
      ...(blockId === undefined ? {} : { blockId }),
      deckLevel: DECK_LEVEL.has(action),
      at: now(),
    };
    writes += 1;
    lastWrite = record;
    options.onWrite?.(record);
    direct();
  };

  const travel = async (
    agent: AgentKey,
    slideId: string,
    to: SheetPoint,
    extra: Partial<AgentPresence> = {},
  ): Promise<void> => {
    const from = pointers.get(agent);
    const start = from?.slideId === slideId && from.pointer !== undefined ? from.pointer : null;
    if (reduced() || start === null) {
      present(agent, { slideId, pointer: to, ...extra });
      return;
    }
    const ms = jitter(600, 900);
    const frames = Math.max(1, Math.round(ms / FRAME_MS));
    for (let i = 1; i <= frames; i += 1) {
      await gate.wait();
      const t = ease(i / frames);
      present(agent, {
        slideId,
        pointer: { x: start.x + (to.x - start.x) * t, y: start.y + (to.y - start.y) * t },
        ...extra,
      });
      await sleep(FRAME_MS);
    }
  };

  const runStep = async (agent: AgentKey, step: Step): Promise<boolean> => {
    const handle = options.agents[agent];
    const at = (value: string): string => fill(value, loop, saved) as string;
    await gate.wait();
    if (!running) return false;
    switch (step.kind) {
      case 'point':
        await travel(agent, at(step.slide), step.at);
        return true;
      case 'select': {
        const current = pointers.get(agent);
        present(agent, {
          slideId: at(step.slide),
          ...(current?.pointer === undefined ? {} : { pointer: current.pointer }),
          selection: { blockIds: [at(step.block)] },
        });
        await sleep(jitter(300, 500));
        return true;
      }
      case 'hold':
        await sleep(step.ms);
        return true;
      case 'signal':
        signals.set(step.signal, loop);
        return true;
      case 'wait': {
        const from = now();
        while (running && signals.get(step.signal) !== loop) {
          if (now() - from > WAIT_MS) return false;
          await sleep(200);
        }
        return running;
      }
      case 'act': {
        await sleep(400);
        const slideId = at(step.slide);
        const blockId = step.block === undefined ? undefined : at(step.block);
        const input = fill(step.input, loop, saved) as Record<string, unknown>;
        const output = await write(agent, step.action, slideId, blockId, input);
        if (output === BLOCKED) return false;
        if (step.save !== undefined) {
          let value: unknown = output;
          for (const key of step.save.from.split('.'))
            value = (value as Record<string, unknown> | null)?.[key];
          saved.set(step.save.key, value);
        }
        return true;
      }
      case 'type': {
        /* a person's typing never waits for the room's answer: each key is one text.insert at
           the caret, applied in the agent's own copy at once and sent behind the others; the
           caret is the agent's own (nobody else writes this block: the visitor's keys stop the
           agent, docs/SITE.md C.10), so its offset is counted here */
        const slideId = at(step.slide);
        const blockId = at(step.block);
        let offset = textLength(handle.document(), slideId, blockId, step.path);
        const sent: Promise<unknown>[] = [];
        let blocked = false;
        for (const ch of [...step.text]) {
          if (!(await until('text.insert', slideId, blockId, {}))) {
            blocked = true;
            break;
          }
          if (!allowed('text.insert', slideId, blockId, {})) {
            blocked = true;
            break;
          }
          const input = {
            slideId,
            blockId,
            path: step.path,
            at: offset,
            text: ch,
            baseRevision: handle.revision(),
          };
          sent.push(handle.invoke('text.insert', input).catch(() => undefined));
          noteWrite(agent, 'text.insert', slideId, blockId);
          offset += 1;
          /* while it types the agent's caret and its flag stand for it: the pointer leaves */
          present(agent, {
            slideId,
            selection: { blockIds: [blockId], caret: { blockId, path: step.path, offset } },
          });
          await sleep(jitter(1000 / 13, 1000 / 9) * (ch === ' ' ? 1.4 : 1));
        }
        await Promise.all(sent);
        return !blocked;
      }
      case 'drag': {
        const slideId = at(step.slide);
        const blockId = at(step.block);
        const block = blockOf(handle.document().slides[slideId], blockId) as
          { pos?: { x: number; y: number; w: number; h: number; z: number } } | undefined;
        const pos = block?.pos;
        if (pos === undefined) return false;
        if (!(await until('block.set', slideId, blockId, {}))) return false;
        if (!reduced()) {
          const frames = Math.round(jitter(800, 1000) / FRAME_MS);
          for (let i = 1; i <= frames; i += 1) {
            await gate.wait();
            const t = ease(i / frames);
            const x = pos.x + (step.to.x - pos.x) * t;
            const y = pos.y + (step.to.y - pos.y) * t;
            present(agent, {
              slideId,
              pointer: { x: x + pos.w / 2, y: y + pos.h / 2 },
              selection: { blockIds: [blockId] },
              drag: { blockId, x, y, w: pos.w, h: pos.h },
            });
            await sleep(FRAME_MS);
          }
        }
        const output = await write(agent, 'block.set', slideId, blockId, {
          slideId,
          blockId,
          path: '/pos',
          value: { ...pos, x: step.to.x, y: step.to.y },
        });
        present(agent, {
          slideId,
          pointer: { x: step.to.x + pos.w / 2, y: step.to.y + pos.h / 2 },
          selection: { blockIds: [blockId] },
        });
        return output !== BLOCKED;
      }
    }
  };

  const runTask = async (agent: AgentKey, task: Task): Promise<void> => {
    tasks[agent] = task.name;
    const document = options.agents[agent].document();
    const needs = (task.needs ?? []).map((need) => fill(need, loop, saved) as string);
    if (!needs.every((need) => exists(document, need))) {
      skipped += 1;
      return;
    }
    /* a slide add past the cap: the agents only restyle and move once three of their slides stay */
    if (task.steps.some((step) => step.kind === 'act' && step.action === 'slide.new')) {
      const ours = Object.keys(document.slides).filter((id) => id.startsWith('next-steps-'));
      if (ours.length >= AGENT_SLIDES_MAX) {
        skipped += 1;
        return;
      }
    }
    for (const step of task.steps) {
      if (!running) return;
      if (!(await runStep(agent, step))) {
        skipped += 1;
        return;
      }
    }
  };

  const runAgent = async (agent: AgentKey): Promise<void> => {
    while (running) {
      for (const task of script[agent]) {
        if (!running) return;
        await runTask(agent, task);
        await sleep(jitter(1200, 2000));
      }
      /* the barrier: both agents finish the loop before the next starts */
      doneWith.set(agent, loop);
      const mine = loop;
      while (running && keys.some((key) => (doneWith.get(key) ?? 0) < mine)) await sleep(200);
      if (loop === mine) loop += 1;
    }
  };

  /* the director's own tick, for a stage left on a slide no agent writes any more */
  const directorTick = async (): Promise<void> => {
    while (running) {
      await sleep(1000);
      if (gate.open()) direct();
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      for (const key of keys) void runAgent(key).catch(() => undefined);
      void directorTick();
    },
    stop() {
      running = false;
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    setOnScreen(on) {
      onScreen = on;
    },
    setVisible(on) {
      visible = on;
    },
    state: () => ({
      loop,
      tasks: { ...tasks },
      writes,
      presence: presencePosts,
      paused: !gate.open(),
      skipped,
    }),
  };
}
