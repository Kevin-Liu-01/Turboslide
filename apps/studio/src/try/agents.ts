import { ACTIONS, isActionId } from '@turboslide/schema/actions';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import { plainOf } from '@turboslide/schema/text';

import { SCRIPT, isAgentSlide } from './script';
import type { AgentKey, AgentScript, SheetPoint, Step, Task } from './script';

/**
 * The runner of the landing's two agents (docs/SITE.md C.10): it plays the script (script.ts) with
 * Claude Code and Codex, each an editor controller of its own on the tab room, at a pace a person
 * can follow: the pointer travels 600 to 900 ms on an eased path posted at the presence batch
 * rate, the agent rests 600 to 800 ms on what it is about to change before each write, typing
 * runs at 9 to 13 characters a second and erasing a little faster, notes arrive a word at a time,
 * and tasks are 300 to 700 ms apart, with the jitter from a seeded generator so a run repeats. No
 * step shows less than 600 ms of work. Each task names itself in a few words (`doing`), which the
 * agent's chip and flags read ("Codex: adding a chart").
 *
 * The agents work all the time the hero is on screen. A task that waits on the other agent's
 * signal (`after`) lets the agent do its next tasks first; with every task left waiting, and at
 * the end of a loop while the other agent finishes, the agent reads a slide of the deck (REVIEW
 * of script.ts), its pointer moving and nothing written.
 *
 * The visitor's work is never touched. Before every write the runner reads the visitor: once the
 * visitor has clicked or typed in the frame, no agent writes to the slide the visitor's stage
 * shows or the block the visitor selected, and a write that changes the whole deck (the theme, the
 * slide order) waits while the visitor types or drags. No agent writes a slide, a block or a deck
 * field the visitor has written. A write that stays blocked for BLOCKED_MS ends its task, the
 * agent moves to its next task on another slide, and the blocked task comes back once at the end
 * of the agent's list, where a `write` step carries on from the letter it stopped at. Until the
 * visitor's first click or key, the director moves the visitor's stage to the slide an agent sets
 * out for or last wrote (one move every four seconds at most), so the first screen shows the
 * cursors and the typing.
 *
 * A press on the agent's avatar in the page's title (`nudge`) wakes the agent: its current pause
 * or wait ends, so its next step comes at once, and the visitor's stage goes to the slide it works
 * on and follows its next write. For WATCH_MS after a press the visitor counts as watching, not
 * editing, until their next click or key in the frame; the rules on the visitor's selection, what
 * they wrote and their typing hold throughout.
 *
 * It runs only while the frame's document is visible and the page says the frame is on screen;
 * paused, it writes nothing and posts no presence. Under reduced motion the pointer jumps to its
 * target and no drag ghost is drawn; every write still happens. A task whose action fails is
 * skipped and the agent goes on. Pure over its dependencies, so agents.test.ts runs it on a fake
 * clock with a simulated visitor.
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
  /**
   * names the step the agent is taking, a few words ("adding a chart"), or none with null: its
   * chip and flags read them from its next presence post (tab-backend.ts `say`)
   */
  say?: (words: string | null) => void;
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
  /** when the visitor last clicked or typed in the frame (ms since the epoch), or -Infinity */
  lastInput?: () => number;
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
  /** the last few errors an action answered, `<task>: <message>`, newest last */
  errors: string[];
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
  /** a press on the agent's avatar: it takes its next step now, and the visitor's stage follows */
  nudge: (agent: AgentKey) => void;
  /** the slide the agent's pointer or caret is on, or null before its first move */
  slideOf: (agent: AgentKey) => string | null;
  state: () => RunnerState;
};

export type RunnerOptions = {
  agents: Record<AgentKey, AgentHandle>;
  visitor: VisitorView;
  script?: AgentScript;
  /** what an agent reads while it waits (script.ts REVIEW); nothing unless set */
  review?: AgentScript;
  /** the slides the agents added, which the cap counts (script.ts `isAgentSlide`) */
  ownSlide?: (slideId: string) => boolean;
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
/** How long a write waits on the visitor before its task ends and the agent does other work. */
export const BLOCKED_MS = 1500;
/** How long a `wait` step or a task's `after` waits for the other agent. */
export const WAIT_MS = 15_000;
/** The director's floor between two moves of the visitor's stage. */
export const DIRECTOR_MS = 1500;
/** How long the director follows one agent before it turns to the other. */
export const FOCUS_MS = 9000;
/** The most slides the agents add and keep (a slide the visitor wrote on stays). */
export const AGENT_SLIDES_MAX = 6;
/** The shortest work a step shows, in ms: the rest before a write, a selection's hold. */
export const STEP_MS = 600;
/**
 * How long a write waits for its answer before the agent moves on: a write shows in every copy at
 * once, while its answer comes with the tab room's next checkpoint, two to ten seconds later
 * (tab-backend.ts); a refusal comes before this, and a later one is logged.
 */
export const ANSWER_MS = 250;
/** How long after a press the visitor counts as watching the agent, not editing. */
export const WATCH_MS = 8000;

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
const DECK_LEVEL = new Set(['deck.set', 'slide.move', 'slide.new', 'slide.insert', 'slide.remove']);

/** The writes that add a slide of the agents' own. */
const ADDS_SLIDE = new Set(['slide.new', 'slide.insert']);

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

/** The plain text of a block's Text at a JSON pointer (`/text`, `/rows/1/cells/2`), or ''. */
export function textAt(
  document: DeckDocument,
  slideId: string,
  blockId: string,
  path: string,
): string {
  let value: unknown = blockOf(document.slides[slideId], blockId);
  for (const key of path.split('/').slice(1)) {
    if (typeof value !== 'object' || value === null) return '';
    value = (value as Record<string, unknown>)[key.replaceAll('~1', '/').replaceAll('~0', '~')];
  }
  return typeof value === 'string' ? plainOf(value) : '';
}

/** How many code points two texts share from their start. */
export function sharedStart(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  let n = 0;
  while (n < left.length && n < right.length && left[n] === right[n]) n += 1;
  return n;
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
  /* a slide field (the speaker notes): the slide is the visitor's once they wrote anything on it */
  if (action === 'slide.update' && blockId === undefined) return [`slide:${slideId}`];
  return blockId === undefined ? [] : [`block:${slideId}#${blockId}`];
}

type Gate = { open: () => boolean; wait: () => Promise<void> };

/** How a step ended: it did its work, a write stayed blocked on the visitor, or it could not run. */
type StepEnd = 'ok' | 'blocked' | 'failed';
/** How a task ended. */
type TaskEnd = 'done' | 'blocked' | 'skipped';

export function createRunner(options: RunnerOptions): Runner {
  const script = options.script ?? SCRIPT;
  const review = options.review ?? { claude: [], codex: [] };
  const ownSlide = options.ownSlide ?? isAgentSlide;
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
  const errors: string[] = [];
  const tasks: Record<AgentKey, string> = { claude: '', codex: '' };
  const signals = new Map<string, number>();
  const saved = new Map<string, unknown>();
  const pointers = new Map<AgentKey, AgentPresence>();
  const reviewAt = new Map<AgentKey, number>();
  let lastWrite: WriteRecord | null = null;
  let lastGoto = -Infinity;
  /* the agents finish a loop together: the barrier counts who is done with the current one */
  const doneWith = new Map<AgentKey, number>();
  /* a press: the agents with a press not yet used, the wake of each agent's current pause, the
     agents that left a task early for a press, the agents whose next write the visitor's stage
     follows, and the watch after the last press */
  const pressed = new Set<AgentKey>();
  const wakers = new Map<AgentKey, () => void>();
  const rushed = new Set<AgentKey>();
  const follow = new Set<AgentKey>();
  let watchFrom = -Infinity;

  const gate: Gate = {
    open: () => running && !paused && onScreen && visible,
    wait: async () => {
      while (running && !gate.open()) await sleep(200);
    },
  };
  const jitter = (from: number, to: number): number => from + (to - from) * random();

  /** a pause a press ends early, leaving the press for the caller to use */
  const doze = async (agent: AgentKey, ms: number): Promise<void> => {
    if (pressed.has(agent)) return;
    await Promise.race([
      sleep(ms),
      new Promise<void>((resolve) => {
        wakers.set(agent, resolve);
      }),
    ]);
    wakers.delete(agent);
  };
  /** a pause a press ends early: the press is used by the pause it ends, or by the next one */
  const nap = async (agent: AgentKey, ms: number): Promise<void> => {
    await doze(agent, ms);
    pressed.delete(agent);
  };
  /** the visitor is editing: they engaged, and no press since their last click or key */
  const editing = (): boolean => {
    if (!visitor.engaged()) return false;
    if (now() - watchFrom > WATCH_MS) return true;
    return (visitor.lastInput?.() ?? -Infinity) > watchFrom;
  };
  /** moves the visitor's stage to a slide now, unless they type or hold the pointer down */
  const show = (slideId: string): void => {
    if (visitor.busy() || visitor.activeSlide() === slideId) return;
    if (!exists(options.agents.claude.document(), slideId)) return;
    lastGoto = now();
    visitor.goto(slideId);
  };

  const present = (agent: AgentKey, state: AgentPresence): void => {
    if (!gate.open()) return;
    pointers.set(agent, state);
    presencePosts += 1;
    options.agents[agent].present(state);
  };

  /** names the agent's step: its chip and flags read the words from the next presence post */
  const say = (agent: AgentKey, words: string): void => {
    options.agents[agent].say?.(words);
    const current = pointers.get(agent);
    if (current !== undefined) present(agent, current);
  };

  /* the agent the director follows, since when, and the agents reading a slide while they wait */
  let focus: AgentKey | null = null;
  let focusFrom = -Infinity;
  const reviewing = new Set<AgentKey>();

  /**
   * the director: until the visitor engages, the visitor's stage follows one agent at a time, to
   * the slide it sets out for and the slides it writes; after FOCUS_MS, or once the agent only
   * reads while it waits, it turns to the other agent. Without `agent` (its own tick) it brings
   * the stage back to the followed agent's slide.
   */
  const direct = (agent?: AgentKey, to?: string): void => {
    if (editing()) return;
    const turn = (to: AgentKey): void => {
      focus = to;
      focusFrom = now();
    };
    if (agent !== undefined) {
      if (
        focus !== agent &&
        (focus === null || reviewing.has(focus) || now() - focusFrom > FOCUS_MS)
      )
        turn(agent);
      if (focus !== agent) return;
    } else if (focus !== null && reviewing.has(focus)) {
      const other = keys.find((key) => key !== focus && !reviewing.has(key));
      if (other !== undefined) turn(other);
    }
    const followed = focus === null ? undefined : pointers.get(focus)?.slideId;
    const slideId = to ?? followed ?? lastWrite?.slideId;
    if (slideId === undefined) return;
    if (visitor.activeSlide() === slideId) return;
    if (now() - lastGoto < DIRECTOR_MS) return;
    if (!exists(options.agents.claude.document(), slideId)) return;
    lastGoto = now();
    visitor.goto(slideId);
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
    if (
      blockId !== undefined &&
      visitor.selectedBlock() === blockId &&
      visitor.activeSlide() === slideId &&
      visitor.engaged()
    )
      return false;
    if (DECK_LEVEL.has(action) && visitor.engaged() && visitor.busy()) return false;
    /* while the visitor edits (engaged, and no press since their last input) their slide is theirs */
    return !editing() || visitor.activeSlide() !== slideId;
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

  /** an answer that came after the agent moved on: a refusal is logged, the rest is dropped */
  const late = (promise: Promise<unknown>, name: string): void => {
    promise.catch((error: unknown) => {
      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      if (errors.length > 8) errors.shift();
    });
  };

  /** the invoke's answer, or `pending` once ANSWER_MS passed without one (`wait` waits it out) */
  const answer = async (
    promise: Promise<unknown>,
    wait: boolean,
  ): Promise<{ ok: unknown } | { error: unknown } | 'pending'> => {
    const settled = promise.then(
      (ok: unknown) => ({ ok }),
      (error: unknown) => ({ error }),
    );
    if (wait) return settled;
    return Promise.race([settled, sleep(ANSWER_MS).then(() => 'pending' as const)]);
  };

  /**
   * one write: the visitor read and the invoke in one turn, so nothing lands between them. The
   * agent waits for the answer only when a later step needs it (`wait`), or ANSWER_MS for a
   * refusal; a 409 is retried once with the revision it names, as an agent does
   */
  const write = async (
    agent: AgentKey,
    action: string,
    slideId: string,
    blockId: string | undefined,
    raw: Record<string, unknown>,
    wait = false,
  ): Promise<unknown | typeof BLOCKED> => {
    if (!(await until(action, slideId, blockId, raw))) return BLOCKED;
    const handle = options.agents[agent];
    if (!allowed(action, slideId, blockId, raw)) return BLOCKED;
    const input = takesBase(action) ? { ...raw, baseRevision: handle.revision() } : raw;
    const first = handle.invoke(action, input);
    let outcome = await answer(first, wait);
    if (outcome !== 'pending' && 'error' in outcome) {
      const current = (outcome.error as { currentRevision?: unknown }).currentRevision;
      if (typeof current !== 'number' || !takesBase(action)) throw outcome.error;
      if (!allowed(action, slideId, blockId, raw)) return BLOCKED;
      const again = handle.invoke(action, { ...raw, baseRevision: current });
      outcome = await answer(again, wait);
      if (outcome !== 'pending' && 'error' in outcome) throw outcome.error;
      if (outcome === 'pending') late(again, action);
    } else if (outcome === 'pending') late(first, action);
    noteWrite(agent, action, slideId, blockId);
    return outcome === 'pending' ? undefined : outcome.ok;
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
    if (follow.delete(agent)) show(slideId);
    else direct(agent, slideId);
  };

  /**
   * one letter or word of a text, sent without waiting for the room's answer, as a person's
   * typing never waits: applied in the agent's own copy at once and sent behind the others, in
   * order; a refusal is logged
   */
  const keystroke = (
    agent: AgentKey,
    action: string,
    slideId: string,
    blockId: string | undefined,
    input: Record<string, unknown>,
  ): void => {
    const handle = options.agents[agent];
    late(handle.invoke(action, { ...input, baseRevision: handle.revision() }), action);
    noteWrite(agent, action, slideId, blockId);
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

  /**
   * a `write` step: erases back to the start the text there and the target share, then types the
   * rest, the caret following; run again after a block, it carries on from where it stopped
   */
  const writeText = async (
    agent: AgentKey,
    slideId: string,
    blockId: string,
    path: string,
    target: string,
  ): Promise<StepEnd> => {
    const handle = options.agents[agent];
    const current = textAt(handle.document(), slideId, blockId, path);
    const keep = sharedStart(current, target);
    let length = [...current].length;
    const rest = [...target].slice(keep);
    const caret = (offset: number): void =>
      /* while it types the agent's caret and its flag stand for it: the pointer leaves */
      present(agent, {
        slideId,
        selection: { blockIds: [blockId], caret: { blockId, path, offset } },
      });
    const free = async (action: string): Promise<boolean> =>
      (await until(action, slideId, blockId, {})) && allowed(action, slideId, blockId, {});
    if (length > keep || rest.length > 0) caret(length);
    while (length > keep) {
      if (!(await free('slide.update'))) return 'blocked';
      keystroke(agent, 'slide.update', slideId, blockId, {
        slideId,
        mutations: [
          { op: 'text.replace', slideId, blockId, path, range: [length - 1, length], text: '' },
        ],
      });
      length -= 1;
      caret(length);
      await sleep(jitter(1000 / 16, 1000 / 12));
    }
    for (const ch of rest) {
      if (!(await free('text.insert'))) return 'blocked';
      keystroke(agent, 'text.insert', slideId, blockId, {
        slideId,
        blockId,
        path,
        at: length,
        text: ch,
      });
      length += 1;
      caret(length);
      await sleep(jitter(1000 / 13, 1000 / 9) * (ch === ' ' ? 1.4 : 1));
    }
    return 'ok';
  };

  /** a `notes` step: the slide's speaker notes grow to `target` a word at a time */
  const writeNotes = async (agent: AgentKey, slideId: string, target: string): Promise<StepEnd> => {
    const handle = options.agents[agent];
    const words = target.split(' ');
    const notes = (handle.document().slides[slideId] as { notes?: unknown } | undefined)?.notes;
    const current = typeof notes === 'string' ? notes : '';
    let n = 0;
    while (n < words.length && current.startsWith(words.slice(0, n + 1).join(' '))) n += 1;
    for (let i = n + 1; i <= words.length; i += 1) {
      if (!(await until('slide.update', slideId, undefined, {}))) return 'blocked';
      if (!allowed('slide.update', slideId, undefined, {})) return 'blocked';
      keystroke(agent, 'slide.update', slideId, undefined, {
        slideId,
        mutations: [
          { op: 'slide.set', slideId, path: '/notes', value: words.slice(0, i).join(' ') },
        ],
      });
      await sleep(jitter(220, 320));
    }
    return 'ok';
  };

  const runStep = async (agent: AgentKey, step: Step, lead: boolean): Promise<StepEnd> => {
    const handle = options.agents[agent];
    const at = (value: string): string => fill(value, loop, saved) as string;
    await gate.wait();
    if (!running) return 'failed';
    switch (step.kind) {
      case 'point':
        if (lead) direct(agent, at(step.slide));
        await travel(agent, at(step.slide), step.at);
        return 'ok';
      case 'select': {
        const current = pointers.get(agent);
        present(agent, {
          slideId: at(step.slide),
          ...(current?.pointer === undefined ? {} : { pointer: current.pointer }),
          selection: { blockIds: [at(step.block)] },
        });
        await nap(agent, jitter(STEP_MS, STEP_MS + 200));
        return 'ok';
      }
      case 'hold':
        await nap(agent, step.ms);
        return 'ok';
      case 'say':
        say(agent, step.words);
        return 'ok';
      case 'signal':
        signals.set(step.signal, loop);
        return 'ok';
      case 'wait': {
        const from = now();
        while (running && signals.get(step.signal) !== loop) {
          if (now() - from > WAIT_MS) return 'failed';
          /* a pressed agent leaves a wait and starts its next task at once */
          if (pressed.delete(agent)) {
            rushed.add(agent);
            return 'failed';
          }
          await doze(agent, 200);
        }
        return running ? 'ok' : 'failed';
      }
      case 'act': {
        /* the agent rests on what it is about to change, its words on its flag */
        await nap(agent, jitter(STEP_MS, STEP_MS + 200));
        const slideId = at(step.slide);
        const blockId = step.block === undefined ? undefined : at(step.block);
        const input = fill(step.input, loop, saved) as Record<string, unknown>;
        const output = await write(
          agent,
          step.action,
          slideId,
          blockId,
          input,
          step.save !== undefined,
        );
        if (output === BLOCKED) return 'blocked';
        if (step.save !== undefined) {
          let value: unknown = output;
          for (const key of step.save.from.split('.'))
            value = (value as Record<string, unknown> | null)?.[key];
          saved.set(step.save.key, value);
        }
        return 'ok';
      }
      case 'write':
        return writeText(agent, at(step.slide), at(step.block), step.path, at(step.text));
      case 'notes':
        return writeNotes(agent, at(step.slide), at(step.text));
      case 'drag': {
        const slideId = at(step.slide);
        const blockId = at(step.block);
        const block = blockOf(handle.document().slides[slideId], blockId) as
          { pos?: { x: number; y: number; w: number; h: number; z: number } } | undefined;
        const pos = block?.pos;
        if (pos === undefined) return 'failed';
        if (!(await until('block.set', slideId, blockId, {}))) return 'blocked';
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
        return output === BLOCKED ? 'blocked' : 'ok';
      }
    }
  };

  /** one task; `lead` false for a review, which moves no stage */
  const runTask = async (agent: AgentKey, task: Task, lead = true): Promise<TaskEnd> => {
    tasks[agent] = task.name;
    const document = options.agents[agent].document();
    const needs = (task.needs ?? []).map((need) => fill(need, loop, saved) as string);
    if (!needs.every((need) => exists(document, need))) return 'skipped';
    /* a slide add past the cap: the agents only work on what is there once enough of theirs stay */
    if (task.steps.some((step) => step.kind === 'act' && ADDS_SLIDE.has(step.action))) {
      const ours = Object.keys(document.slides).filter(ownSlide);
      if (ours.length >= AGENT_SLIDES_MAX) return 'skipped';
    }
    say(agent, task.doing);
    try {
      for (const step of task.steps) {
        if (!running) return 'skipped';
        const end = await runStep(agent, step, lead);
        if (end === 'blocked') return 'blocked';
        if (end === 'failed') return 'skipped';
      }
    } catch (error) {
      /* an action the room refused: the agent leaves the task and goes on */
      errors.push(`${task.name}: ${error instanceof Error ? error.message : String(error)}`);
      if (errors.length > 8) errors.shift();
      return 'skipped';
    }
    return 'done';
  };

  /** the agent reads a slide while it waits: the next of its review tasks, or a short rest */
  const reviewOnce = async (agent: AgentKey): Promise<void> => {
    const list = review[agent];
    if (list.length === 0) {
      await doze(agent, 200);
      return;
    }
    const i = reviewAt.get(agent) ?? 0;
    reviewAt.set(agent, i + 1);
    const task = list[i % list.length]!;
    reviewing.add(agent);
    try {
      if ((await runTask(agent, task, false)) !== 'done') await doze(agent, 200);
    } finally {
      reviewing.delete(agent);
    }
  };

  const ready = (task: Task, mine: number): boolean =>
    (task.after === undefined
      ? []
      : typeof task.after === 'string'
        ? [task.after]
        : task.after
    ).every((signal) => signals.get(fill(signal, mine, saved) as string) === mine);

  const runAgent = async (agent: AgentKey): Promise<void> => {
    while (running) {
      const mine = loop;
      const queue = [...script[agent]];
      /* a task the visitor blocked comes back once, at the end of the list */
      const retried = new Set<Task>();
      let waitingFrom: number | null = null;
      while (running && queue.length > 0) {
        const index = queue.findIndex((task) => ready(task, mine));
        if (index < 0) {
          /* every task left waits on the other agent: read a slide meanwhile; past WAIT_MS the
             signal is not coming, so the tidy tasks run anyway and the rest are dropped */
          waitingFrom ??= now();
          if (now() - waitingFrom > WAIT_MS) {
            const tidy = queue.filter((task) => task.tidy === true);
            skipped += queue.length - tidy.length;
            queue.length = 0;
            for (const task of tidy) if ((await runTask(agent, task)) !== 'done') skipped += 1;
            break;
          }
          await reviewOnce(agent);
          continue;
        }
        waitingFrom = null;
        const task = queue.splice(index, 1)[0]!;
        const end = await runTask(agent, task);
        if (end === 'blocked' && !retried.has(task)) {
          retried.add(task);
          queue.push(task);
        } else if (end !== 'done') skipped += 1;
        if (!rushed.delete(agent)) await nap(agent, jitter(300, 700));
      }
      /* the barrier: both agents finish the loop before the next starts; the first reads slides */
      doneWith.set(agent, mine);
      while (running && keys.some((key) => (doneWith.get(key) ?? 0) < mine))
        await reviewOnce(agent);
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
    nudge(agent) {
      if (!keys.includes(agent)) return;
      pressed.add(agent);
      watchFrom = now();
      wakers.get(agent)?.();
      follow.add(agent);
      const at = pointers.get(agent)?.slideId;
      if (at !== undefined) show(at);
    },
    slideOf: (agent) => pointers.get(agent)?.slideId ?? null,
    state: () => ({
      loop,
      tasks: { ...tasks },
      writes,
      presence: presencePosts,
      paused: !gate.open(),
      skipped,
      errors: [...errors],
    }),
  };
}
