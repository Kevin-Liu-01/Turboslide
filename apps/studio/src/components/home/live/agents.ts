import { AGENTS, ANNOUNCE, HISTORY } from '../copy';
import { HOME_DECK } from '../deck.generated';
import type { HomeSlideId } from '../deck.generated';
import { LIVE_SLIDE_HTML } from '../bands/live.generated';
import {
  NAME_MAX,
  formatLines,
  spacedJson,
  splitWords,
  substituteAnswer,
  substituteName,
} from '../panel-format';
import type { PanelWidth } from '../panel-format';
import { HOME_RUN } from '../run.generated';
import type { PanelText, RunDeckState, RunStep, TypedRecording } from '../run.generated';
import { renumber } from './filmstrip';
import type { LiveContext } from './index';
import { ease, finishBand, ms, play, reduced, sequence, slowFactor } from './motion';
import type { AgentStep, HomeDeckState } from './state';
import { applyCustomer } from './tailor';

/**
 * The agents band (docs/LANDING.md 2.4, 3.2 A1 to A8; rows home.agents.*). L3's file. The band's
 * markup is the run's end: the transcript of the three recorded commands in the panel, slide 5
 * written and three Agent rows in Version history. This module acts only on input:
 *
 * - Run Again cuts the band to the run's start (A8: slide 5 leaves the deck, the banner screen,
 *   the run's rows go, the slide's place keeps its four crosses) and plays step 1; each later press
 *   plays one step. A step types the command at the agent's constant 24 ms a character up to its
 *   value, pastes a JSON value whole, prints the answer a line at a time, then one beat later the
 *   ink ring travels to the block the command changed while the change lands under the ink flag
 *   "Agent"; the flag leaves 800 ms after the last landing. A press while a step plays finishes the
 *   step at its end state, and Run keeps focus with `aria-disabled`.
 * - The typed line runs `help`, `tailor --replace=<name>=<Name>`, `version list` and the three
 *   step forms, answered from the CLI's recordings in `run.generated.ts` for the deck the page
 *   holds; anything else answers with the refusal sentence. The one value the page substitutes is
 *   the customer's name, escaped for its place by `panel-format.ts`.
 * - The CLI, MCP and HTTP tabs are a tablist with a roving tabindex; the MCP and HTTP panels show
 *   the requests only, written here from the recording (the document carries the CLI screen alone).
 *
 * Every motion runs through `motion.ts` (the tokens are 0 ms under reduced motion, so each step
 * lands at once and the flag is cut after its 800 ms hold). Nothing here runs at rest.
 */

const TABS = ['cli', 'mcp', 'http'] as const;
type Tab = (typeof TABS)[number];
const WIDTHS: readonly PanelWidth[] = ['wide', 'narrow'];

/** The agent's constant typing clock and the answer's delay (LANDING.md 3.2 A1, A2): clocks, not tokens. */
const CLOCK_MS = 24;
const ANSWER_DELAY_MS = 200;
const ANSWER_STAGGER_MS = 55;
const ROW_STAGGER_MS = 55;
const FLAG_HOLD_MS = 800;
/** One frame between the last typed character and the pasted value (A1). */
const PASTE_MS = 16;
/** A3: 300 ms plus the distance over two, 300 to 700 ms. */
const RING_MIN_MS = 300;
const RING_MAX_MS = 700;

const STEP_STATE: Readonly<Record<AgentStep, RunDeckState>> = {
  0: 'absent',
  1: 'placeholders',
  2: 'titled',
  3: 'filled',
};

/** One printed entry: its physical lines at both widths. */
type Entry = PanelText;
/** An entry on the page: its line elements at both widths. */
type Line = Record<PanelWidth, HTMLElement[]>;

function entryOf(line: string): Entry {
  return {
    wide: formatLines([line], 'wide', { overlong: 'break' }),
    narrow: formatLines([line], 'narrow', { overlong: 'break' }),
  };
}

/** Substitutes the deck's current customer for the fixture's in a step's printed command. */
function commandOf(step: RunStep, customer: string): string {
  return substituteName(step.command, HOME_DECK.customer, customer);
}

function answerOf(step: RunStep, customer: string): string[] {
  return step.answer.map((line) => substituteAnswer(line, HOME_DECK.customer, customer));
}

/** Replaces two names at once, so a recording made as A=B prints as C=D in one pass. */
function substituteNames(text: string, pairs: ReadonlyArray<readonly [string, string]>): string {
  const live = pairs.filter(([from]) => from !== '');
  if (live.length === 0) return text;
  const map = new Map(live);
  const pattern = new RegExp(
    [...map.keys()]
      .sort((a, b) => b.length - a.length)
      .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|'),
    'g',
  );
  return text.replace(pattern, (name) => map.get(name) ?? name);
}

/** The words a recorded command passes on, after `turboslide`, with the current customer. */
function stepWords(step: RunStep, customer: string): string[] | null {
  const split = splitWords(commandOf(step, customer));
  if (!split.ok) return null;
  return split.words[0] === 'turboslide' ? split.words.slice(1) : split.words;
}

/** Two argument lists are one command when every word matches, a JSON value by its value. */
function sameWords(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((word, i) => {
    const other = b[i] as string;
    if (word === other) return true;
    try {
      return JSON.stringify(JSON.parse(word)) === JSON.stringify(JSON.parse(other));
    } catch {
      return false;
    }
  });
}

/** Text nodes under an element, in document order. */
function textNodes(el: Node): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode())
    out.push(node as Text);
  return out;
}

/** A rendered slide instance's markup as nodes: the root's children and its class. */
function parseInstance(html: string): { className: string; nodes: Node[] } | null {
  if (html === '') return null;
  const template = document.createElement('template');
  template.innerHTML = html;
  const root =
    template.content.querySelector<HTMLElement>('[data-home-slides]') ??
    template.content.firstElementChild;
  if (root === null) return null;
  return { className: root.className, nodes: [...root.childNodes] };
}

/** Ends at once the renderer's own entrance fade (`.slide.is-on`, sheet.css `cut`), a motion 3.2 does not list. */
export function settleEntrance(el: Element): void {
  for (const a of el.getAnimations({ subtree: true }))
    if (a instanceof CSSAnimation && a.animationName === 'cut') a.finish();
}

type Box = { x: number; y: number; w: number; h: number };

function boxIn(el: Element, frame: Element): Box {
  const a = el.getBoundingClientRect();
  const f = frame.getBoundingClientRect();
  return { x: a.left - f.left, y: a.top - f.top, w: a.width, h: a.height };
}

/** The agent's ring: four 1 px edges scaled along their length, so the line stays 1 px (A3). */
function ringFrames(box: Box): { root: string; edges: [string, string, string, string] } {
  const w = Math.max(1, Math.round(box.w));
  const h = Math.max(1, Math.round(box.h));
  return {
    root: `translate(${Math.round(box.x)}px, ${Math.round(box.y)}px)`,
    edges: [
      `scaleX(${w})`,
      `translate(0px, ${h - 1}px) scaleX(${w})`,
      `scaleY(${h})`,
      `translate(${w - 1}px, 0px) scaleY(${h})`,
    ],
  };
}

function insertAfter(
  order: readonly HomeSlideId[],
  after: HomeSlideId,
  id: HomeSlideId,
): HomeSlideId[] {
  const at = order.indexOf(after);
  const out = [...order];
  out.splice(at < 0 ? out.length : at + 1, 0, id);
  return out;
}

export function startAgents(ctx: LiveContext): void {
  const { band, store } = ctx;
  const run = band.querySelector<HTMLElement>('[data-agent-run]');
  const stepLabel = band.querySelector<HTMLElement>('[data-step]');
  const input = band.querySelector<HTMLInputElement>('[data-cmd]');
  const tablist = band.querySelector<HTMLElement>('[data-transports]');
  const slide = band.querySelector<HTMLElement>('[data-home-slides][data-slide="next-steps"]');
  if (run === null || stepLabel === null || tablist === null || slide === null) return;
  const sheet = slide.parentElement ?? slide;
  const restingClass = slide.className;
  const restingNodes = [...slide.childNodes].map((node) => node.cloneNode(true));

  /* ---------- the tabs (A7: a cut) ---------- */
  const tabs = new Map<Tab, HTMLElement>();
  const panels = new Map<Tab, HTMLElement>();
  const views = new Map<Tab, Record<PanelWidth, HTMLElement>>();
  for (const tab of tablist.querySelectorAll<HTMLElement>('[role="tab"]')) {
    const key = (tab.dataset['transport'] ?? tab.textContent ?? '').trim().toLowerCase() as Tab;
    if (!TABS.includes(key)) continue;
    tabs.set(key, tab);
    const panelId = tab.getAttribute('aria-controls');
    const panel = panelId === null ? null : document.getElementById(panelId);
    if (panel !== null) panels.set(key, panel);
  }
  /* the CLI panel's two views are the markup's; the MCP and HTTP panels are empty in the document
     (l1.md Q5) and take two views of the same element and class here */
  const cliPanel = panels.get('cli');
  const cliWide = cliPanel?.querySelector<HTMLElement>('[data-panel-text="wide"]');
  const cliNarrow = cliPanel?.querySelector<HTMLElement>('[data-panel-text="narrow"]');
  if (cliWide == null || cliNarrow == null) return;
  views.set('cli', { wide: cliWide, narrow: cliNarrow });
  for (const key of ['mcp', 'http'] as const) {
    const panel = panels.get(key);
    if (panel === undefined) continue;
    let wide = panel.querySelector<HTMLElement>('[data-panel-text="wide"]');
    let narrow = panel.querySelector<HTMLElement>('[data-panel-text="narrow"]');
    if (wide === null || narrow === null) {
      wide = cliWide.cloneNode(false) as HTMLElement;
      narrow = cliNarrow.cloneNode(false) as HTMLElement;
      panel.replaceChildren(wide, narrow);
    }
    views.set(key, { wide, narrow });
  }
  const select = (key: Tab, focus: boolean): void => {
    for (const [name, tab] of tabs) {
      const on = name === key;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      const panel = panels.get(name);
      if (panel !== undefined) panel.hidden = !on;
    }
    if (focus) tabs.get(key)?.focus();
  };
  tablist.addEventListener('click', (event) => {
    const tab = (event.target as Element).closest<HTMLElement>('[role="tab"]');
    const key = [...tabs].find(([, el]) => el === tab)?.[0];
    if (key !== undefined) select(key, false);
  });
  tablist.addEventListener('keydown', (event) => {
    const order = TABS.filter((key) => tabs.has(key));
    const current = order.findIndex((key) => tabs.get(key) === document.activeElement);
    if (current < 0) return;
    let next = current;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = (current + 1) % order.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (current - 1 + order.length) % order.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = order.length - 1;
    else return;
    event.preventDefault();
    select(order[next] as Tab, true);
  });

  /* ---------- the panel's screens ---------- */
  const linesOf = (texts: readonly string[]): HTMLElement[] =>
    texts.map((text) => {
      const el = document.createElement('span');
      el.textContent = text;
      return el;
    });
  /** Writes one entry at both widths and returns its line elements, by width. */
  const add = (tab: Tab, entry: Entry): Line => {
    const pair = views.get(tab);
    const line: Line = { wide: [], narrow: [] };
    if (pair === undefined) return line;
    for (const width of WIDTHS) {
      line[width] = linesOf(entry[width]);
      pair[width].append(...line[width]);
    }
    return line;
  };
  /** Rewrites an entry in place (a command being typed), its lines replaced where they stand. */
  const setEntry = (line: Line, entry: Entry): void => {
    for (const width of WIDTHS) {
      const old = line[width];
      const next = linesOf(entry[width]);
      const first = old[0];
      if (first !== undefined) first.before(...next);
      else views.get('cli')?.[width].append(...next);
      for (const el of old) el.remove();
      line[width] = next;
    }
  };
  const clear = (tab: Tab): void => {
    const pair = views.get(tab);
    if (pair === undefined) return;
    for (const width of WIDTHS) pair[width].replaceChildren();
  };
  const fadeIn = (line: Line, delayMs: number): void => {
    for (const el of [...line.wide, ...line.narrow])
      play(el, [{ opacity: 0 }, { opacity: 1 }], 'fast', 'fade', 'agents', delayMs);
  };

  /** The request a step sends, as the MCP and HTTP tabs print it (LANDING.md 2.4). */
  const requestLine = (tab: 'mcp' | 'http', step: RunStep, customer: string): string => {
    /* the name replaced as a value, so a name with a quote stays valid JSON */
    const swap = (value: unknown): unknown =>
      JSON.parse(
        JSON.stringify(value, (_key, v: unknown) =>
          typeof v === 'string' ? v.split(HOME_DECK.customer).join(customer) : v,
        ),
      );
    return tab === 'mcp'
      ? `tools/call ${step.mcp.name} ${spacedJson(swap(step.mcp.arguments))}`
      : `${step.http.method} ${step.http.path} ${spacedJson(swap(step.http.body))}`;
  };
  /** The MCP and HTTP panels: each played step's request, then the request only line. */
  const paintRequests = (steps: number, customer: string): void => {
    for (const tab of ['mcp', 'http'] as const) {
      if (!views.has(tab)) continue;
      clear(tab);
      for (const step of HOME_RUN.steps.slice(0, steps))
        add(tab, entryOf(requestLine(tab, step, customer)));
      add(tab, entryOf(AGENTS.panel.requestOnly));
    }
  };

  const stepEntries = (step: RunStep, customer: string): Entry[] => [
    entryOf(`$ ${commandOf(step, customer)}`),
    ...answerOf(step, customer).map((line) => entryOf(line)),
  ];
  /**
   * The CLI screen of the run after `n` steps: the banner at the run's start and under step 1
   * (7 slots and step 1's 3 or 4), then the transcript of the played steps alone.
   */
  const paintRunScreen = (n: number, customer: string, banner = n <= 1): void => {
    clear('cli');
    if (banner) add('cli', HOME_RUN.screens.banner);
    for (const step of HOME_RUN.steps.slice(0, n))
      for (const entry of stepEntries(step, customer)) add('cli', entry);
  };
  /** Which screen the CLI panel holds: the run's, or one typed command and its answer. */
  let screen: 'run' | 'typed' = 'run';

  /* ---------- the run's controls ---------- */
  const stepsTotal = HOME_RUN.steps.length;
  const paintControls = (state: HomeDeckState, playing: number | null): void => {
    const shown = playing ?? state.agentStep;
    stepLabel.textContent = shown === 0 ? '' : AGENTS.stepLabel(shown, stepsTotal);
    run.textContent =
      shown === 0 || shown >= stepsTotal ? AGENTS.run.again : AGENTS.run.step(shown + 1);
    if (playing === null) run.removeAttribute('aria-disabled');
    else run.setAttribute('aria-disabled', 'true');
  };

  /* ---------- the slide ---------- */
  const frameOf = (): HTMLElement | null => slide.querySelector<HTMLElement>('.frame');
  /**
   * The slide in one of its four states. Absent is the run's start: the slide's place keeps the
   * sheet's paper and its four crosses (the content hidden by home.css's `[data-agent-absent]`,
   * the frame shown again inline with its rails and rules drawn in no colour), so step 1's rails
   * draw out of crosses that stand (LANDING.md 3.2 A4; l3.md R3b).
   */
  const setSlide = (kind: RunDeckState): void => {
    if (kind === 'absent') {
      slide.setAttribute('data-agent-absent', '');
      const frame = frameOf();
      frame?.style.setProperty('visibility', 'visible');
      frame?.style.setProperty('--hair', 'transparent');
      return;
    }
    slide.removeAttribute('data-agent-absent');
    const parsed =
      kind === 'filled'
        ? { className: restingClass, nodes: restingNodes.map((node) => node.cloneNode(true)) }
        : parseInstance(
            kind === 'placeholders'
              ? LIVE_SLIDE_HTML.nextSteps.placeholders
              : LIVE_SLIDE_HTML.nextSteps.titled,
          );
    if (parsed === null) return;
    if (slide.className !== parsed.className) slide.className = parsed.className;
    slide.replaceChildren(...parsed.nodes);
    settleEntrance(slide);
    /* the inserted markup spells the fixture's name and its place: the deck's current ones */
    applyCustomer(slide, HOME_DECK.customer, store.get().customer);
    renumber(ctx.root, store.get());
  };
  const targetOf = (step: RunStep): Element => {
    const hash = step.target.indexOf('#');
    if (hash < 0) return slide;
    const block = step.target.slice(hash + 1);
    return slide.querySelector(`[data-block="${block}"]`) ?? slide;
  };
  /** A4: the new slide's rails draw out of their crosses, CSS keyed on a class (l3.md R4). */
  const drawRails = (slow: number): number => {
    const frame = frameOf();
    const line = ms('line');
    if (frame === null || line === 0) return 0;
    const length = line + 3 * 60 * slow;
    frame.style.setProperty('--ts-slow', String(slow));
    frame.classList.add('ts-home-draw');
    const stop = (): void => {
      clearTimeout(timer);
      frame.classList.remove('ts-home-draw');
      frame.style.removeProperty('--ts-slow');
      drawn.done();
    };
    const drawn = sequence('agents', stop);
    const timer = setTimeout(stop, length);
    return length;
  };

  /* ---------- the ring and the flag ---------- */
  let ring: HTMLElement | null = null;
  let flag: HTMLElement | null = null;
  let lastBox: Box | null = null;
  const dropMarks = (): void => {
    ring?.remove();
    flag?.remove();
    ring = null;
    flag = null;
  };
  /* Web Animations this module starts outside `play` (the ring's length is a distance, not a
     token); each commits its end and cancels, so document.getAnimations() is empty at rest */
  const running = new Set<Animation>();
  const track = (animation: Animation): void => {
    running.add(animation);
    const settle = (): void => {
      if (!running.delete(animation)) return;
      try {
        animation.commitStyles();
      } catch {
        /* the element left the page */
      }
      animation.cancel();
    };
    animation.addEventListener('finish', settle);
  };
  const finishTracked = (): void => {
    for (const animation of [...running]) animation.finish();
  };
  const placeRing = (to: Box, durationMs: number): void => {
    if (ring === null) {
      ring = document.createElement('div');
      ring.className = 'ts-home-ring';
      ring.setAttribute('aria-hidden', 'true');
      ring.setAttribute('data-live-overlay', '');
      /* over the slide, whose root is positioned at z-index 1 in its wrapper (home.css) */
      ring.style.zIndex = '2';
      for (let i = 0; i < 4; i += 1) ring.append(document.createElement('i'));
      sheet.append(ring);
    }
    const from = lastBox ?? to;
    const a = ringFrames(from);
    const b = ringFrames(to);
    const edges = [...ring.children] as HTMLElement[];
    ring.style.transform = b.root;
    edges.forEach((edge, i) => {
      edge.style.transform = b.edges[i] as string;
    });
    if (durationMs > 0 && lastBox !== null) {
      const timing = { duration: durationMs, easing: ease('move') };
      track(ring.animate([{ transform: a.root }, { transform: b.root }], timing));
      edges.forEach((edge, i) =>
        track(edge.animate([{ transform: a.edges[i] }, { transform: b.edges[i] }], timing)),
      );
    }
    lastBox = to;
  };
  const showFlag = (at: Box): void => {
    if (flag === null) {
      flag = document.createElement('span');
      flag.className = 'ts-home-flag';
      flag.setAttribute('aria-hidden', 'true');
      flag.setAttribute('data-live-overlay', '');
      flag.style.zIndex = '2';
      flag.textContent = AGENTS.author.agent;
      sheet.append(flag);
    }
    const height = flag.offsetHeight || 20;
    const above = at.y - height;
    const x = Math.round(at.x);
    const y = Math.round(above >= 0 ? above : at.y);
    flag.style.transform = `translate(${x}px, ${y}px)`;
  };

  /* ---------- one step ---------- */
  type Playing = { n: number; finish: () => void };
  let playing: Playing | null = null;

  const runStep = (step: RunStep, options: { typed: boolean }): void => {
    const customer = store.get().customer;
    const n = step.n;
    const slow = slowFactor();
    const still = reduced();
    const command = commandOf(step, customer);
    const answer = answerOf(step, customer);
    /* A1: the words up to the value at 24 ms a character; a JSON value pastes whole */
    const typedChars =
      options.typed || still
        ? 0
        : substituteName(step.command.slice(0, step.typedChars), HOME_DECK.customer, customer)
            .length;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const at = (delay: number, fn: () => void): void => {
      if (delay <= 0) {
        fn();
        return;
      }
      const timer = setTimeout(() => {
        timers.delete(timer);
        fn();
      }, delay);
      timers.add(timer);
    };
    let ended = false;
    let landed = false;
    const handle = sequence('agents', () => end());
    playing = { n, finish: () => end() };
    screen = 'run';
    paintControls(store.get(), n);

    /* the screen: the banner while step 1 plays, the transcript of the steps before from step 2 */
    paintRunScreen(n - 1, customer, n === 1);
    const cmd = add('cli', entryOf(`$ ${typedChars === 0 ? command : ''}`));
    if (typedChars === 0) paintRequests(n, customer);
    for (let i = 1; i <= typedChars; i += 1)
      at(i * CLOCK_MS * slow, () => setEntry(cmd, entryOf(`$ ${command.slice(0, i)}`)));
    const typedEnd = typedChars * CLOCK_MS * slow;
    /* the value, when the command has one, prints whole in the next frame, as a paste does */
    if (typedChars > 0)
      at(typedEnd + PASTE_MS * slow, () => {
        if (typedChars < command.length) setEntry(cmd, entryOf(`$ ${command}`));
        paintRequests(n, customer);
      });

    /* A2: the answer, 200 ms after A1, a line at a time */
    const answerAt = still ? 0 : typedEnd + ANSWER_DELAY_MS * slow;
    at(answerAt, () => {
      answer.forEach((line, i) => {
        const els = add('cli', entryOf(line));
        if (!still) fadeIn(els, i * ANSWER_STAGGER_MS);
      });
    });
    const answerLength =
      answer.length === 0 || still
        ? 0
        : ms('fast') + (answer.length - 1) * ANSWER_STAGGER_MS * slow;

    /* A3 to A5: one beat later the ring travels and the change lands under the flag */
    const land = (animate: boolean): number => {
      landed = true;
      setSlide(STEP_STATE[n as AgentStep]);
      const target = targetOf(step);
      const box = boxIn(target, sheet);
      const distance =
        lastBox === null
          ? 0
          : Math.hypot(
              box.x + box.w / 2 - (lastBox.x + lastBox.w / 2),
              box.y + box.h / 2 - (lastBox.y + lastBox.h / 2),
            );
      const ringLength =
        animate && lastBox !== null
          ? Math.min(RING_MAX_MS, Math.max(RING_MIN_MS, RING_MIN_MS + distance / 2)) * slow
          : 0;
      placeRing(box, ringLength);
      showFlag(box);
      let landLength = 0;
      if (animate && step.landing.kind === 'rails') {
        landLength = drawRails(slow);
      } else if (animate && step.landing.kind === 'words') {
        landLength = typeWords(target, slow);
      } else if (animate) {
        const rows = [...target.children] as HTMLElement[];
        rows.forEach((row, i) =>
          play(
            row,
            [{ opacity: 0 }, { opacity: 1 }],
            'state',
            'fade',
            'agents',
            Math.min(i, 6) * ROW_STAGGER_MS,
          ),
        );
        landLength =
          rows.length === 0
            ? 0
            : ms('state') + (Math.min(rows.length, 7) - 1) * ROW_STAGGER_MS * slow;
      }
      store.commit({
        band: 'agents',
        author: 'agent',
        words: step.history,
        run: true,
        undo: null,
        next: (s) => ({
          ...s,
          agentStep: n as AgentStep,
          order:
            n === 1 && !s.order.includes('next-steps')
              ? insertAfter(s.order as readonly HomeSlideId[], 'ships', 'next-steps')
              : s.order,
        }),
      });
      ctx.announce(
        n === 1 ? ANNOUNCE.slideAdded(store.get().order.indexOf('next-steps') + 1) : step.history,
      );
      return Math.max(ringLength, landLength);
    };
    const landAt = still ? 0 : answerAt + answerLength + ms('beat');
    at(landAt, () => {
      const longest = land(!still);
      /* the flag holds 800 ms after the last landing and leaves in 160 ms (cut when reduced) */
      at(longest + FLAG_HOLD_MS * slow, () => {
        const leaving = flag;
        if (leaving !== null && !still && ms('state') > 0) {
          play(leaving, [{ opacity: 1 }, { opacity: 0 }], 'state', 'fade', 'agents');
          at(ms('state'), end);
        } else end();
      });
    });

    /* the step's end state: everything printed, the change set, the marks gone */
    function end(): void {
      if (ended) return;
      ended = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      finishTracked();
      const now = store.get().customer;
      if (!landed) land(false);
      setSlide(STEP_STATE[n as AgentStep]);
      if (screen === 'run') paintRunScreen(n, now);
      paintRequests(n, now);
      dropMarks();
      playing = null;
      handle.done();
      paintControls(store.get(), null);
    }
  };

  /** A5 for step 2: the title's words land at 24 ms a character; returns the length in ms. */
  const typeWords = (el: Element, slow: number): number => {
    const nodes = textNodes(el).filter((node) => node.data.length > 0);
    const total = nodes.reduce((sum, node) => sum + node.data.length, 0);
    if (total === 0) return 0;
    const parts = nodes.map((node) => {
      const shown = document.createElement('span');
      const rest = document.createElement('span');
      rest.style.color = 'transparent';
      rest.textContent = node.data;
      node.replaceWith(shown, rest);
      return { shown, rest, text: node.data };
    });
    const paint = (k: number): void => {
      let left = k;
      for (const part of parts) {
        const take = Math.max(0, Math.min(part.text.length, left));
        part.shown.textContent = part.text.slice(0, take);
        part.rest.textContent = part.text.slice(take);
        left -= take;
      }
    };
    paint(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let k = 1; k <= total; k += 1)
      timers.push(setTimeout(() => paint(k), k * CLOCK_MS * slow));
    const finish = (): void => {
      for (const timer of timers) clearTimeout(timer);
      paint(total);
    };
    const words = sequence('agents', finish);
    timers.push(setTimeout(() => words.done(), total * CLOCK_MS * slow));
    return total * CLOCK_MS * slow;
  };

  /* ---------- Run ---------- */
  /* whether a step played when this press began: the page's input guard (motion.ts, the capture
     phase on the document) finishes the step before the click arrives, and that press only
     finishes it (LANDING.md 2.4); read on the window, which the capture phase reaches first */
  let pressedWhilePlaying = false;
  const notePress = (event: Event): void => {
    if (event.target instanceof Node && run.contains(event.target))
      pressedWhilePlaying = playing !== null;
  };
  window.addEventListener('pointerdown', notePress, true);
  window.addEventListener('keydown', notePress, true);
  /** A8: the run's start, by a cut; the visitor's own rows stay. */
  const cutToStart = (): void => {
    finishBand('agents');
    store.commit({
      band: 'agents',
      author: 'agent',
      words: null,
      undo: null,
      next: (s) => ({
        ...s,
        agentStep: 0,
        order: s.order.filter((id) => id !== 'next-steps'),
        history: s.history.filter((row) => !row.run),
      }),
    });
    setSlide('absent');
    lastBox = null;
    screen = 'run';
    paintRunScreen(0, store.get().customer);
    paintRequests(0, store.get().customer);
    paintControls(store.get(), null);
  };
  const press = (): void => {
    const finishing = playing !== null || pressedWhilePlaying;
    pressedWhilePlaying = false;
    if (finishing) {
      finishBand('agents');
      playing?.finish();
      return;
    }
    const state = store.get();
    if (state.agentStep === 0 || state.agentStep >= stepsTotal) {
      if (state.agentStep !== 0) cutToStart();
      runStep(HOME_RUN.steps[0], { typed: false });
      return;
    }
    runStep((HOME_RUN.steps as readonly RunStep[])[state.agentStep] as RunStep, { typed: false });
  };
  run.addEventListener('click', (event) => {
    event.preventDefault();
    press();
  });

  /* any other input on the band finishes its running sequence first (LANDING.md 3.5) */
  const interrupt = (event: Event): void => {
    if (playing === null) return;
    if (event.target instanceof Node && run.contains(event.target)) return;
    if (event instanceof KeyboardEvent && (event.key === 'Tab' || event.key === 'Shift')) return;
    finishBand('agents');
  };
  band.addEventListener('pointerdown', interrupt, true);
  band.addEventListener('keydown', interrupt, true);

  /* the deck changed elsewhere: the panel prints the current customer's name (LANDING.md 2.4) */
  let shownCustomer = store.get().customer;
  store.subscribe((state) => {
    if (state.customer === shownCustomer || playing !== null) return;
    shownCustomer = state.customer;
    if (screen === 'run') paintRunScreen(state.agentStep, state.customer);
    paintRequests(state.agentStep, state.customer);
    if (state.agentStep > 0) setSlide(STEP_STATE[state.agentStep]);
  });

  /* ---------- the typed line ---------- */
  if (input !== null) {
    const recalled: string[] = [];
    let recall = 0;
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const line = input.value;
        input.value = '';
        if (line.trim() === '') return;
        recalled.push(line);
        recall = recalled.length;
        typedLine(line);
      } else if (event.key === 'ArrowUp') {
        if (recalled.length === 0) return;
        event.preventDefault();
        recall = Math.max(0, recall - 1);
        input.value = recalled[recall] ?? '';
      } else if (event.key === 'ArrowDown') {
        if (recalled.length === 0) return;
        event.preventDefault();
        recall = Math.min(recalled.length, recall + 1);
        input.value = recalled[recall] ?? '';
      }
    });
  }

  /** One typed command and its answer replace the screen (LANDING.md 2.4 "The panel's screens"). */
  const printTyped = (echo: string, answer: readonly string[]): void => {
    const still = reduced();
    screen = 'typed';
    select('cli', false);
    clear('cli');
    add('cli', entryOf(echo));
    answer.forEach((line, i) => {
      const els = add('cli', entryOf(line));
      if (!still) fadeIn(els, ANSWER_DELAY_MS + i * ANSWER_STAGGER_MS);
    });
    const first = answer[0];
    if (first !== undefined) ctx.announce(first);
  };

  const recording = (
    form: TypedRecording['form'],
    state: HomeDeckState | null,
    match: (r: TypedRecording) => boolean = () => true,
  ): TypedRecording | undefined =>
    HOME_RUN.typed.find(
      (r) =>
        r.form === form && (state === null || r.state === STEP_STATE[state.agentStep]) && match(r),
    );
  /** A recording's printed lines with its names replaced by the page's (`version list` prints its table). */
  const printed = (
    rec: TypedRecording,
    pairs: ReadonlyArray<readonly [string, string]>,
  ): string[] => {
    const lines = rec.form === 'version-list' ? [...rec.answer, ...rec.findings] : [...rec.answer];
    return lines.map((text) => (rec.names === null ? text : substituteNames(text, pairs)));
  };

  const typedLine = (line: string): void => {
    const trimmed = line.trim();
    const echo = /^turboslide(\s|$)/.test(trimmed) ? `$ ${trimmed}` : `$ turboslide ${trimmed}`;
    const split = splitWords(trimmed);
    if (!split.ok) {
      printTyped(echo, [AGENTS.panel.unclosedQuote]);
      return;
    }
    const words = split.words[0] === 'turboslide' ? split.words.slice(1) : split.words;
    const state = store.get();
    const refuse = (): void => printTyped(echo, [HOME_RUN.refusal]);

    if (
      words.length === 0 ||
      (words.length === 1 && ['help', '--help', '-h'].includes(words[0] as string))
    ) {
      printTyped(echo, HOME_RUN.help);
      return;
    }

    if (words[0] === 'tailor') {
      /* the CLI takes `--replace=<from>=<to>`; it refuses the spaced form whatever the deck holds,
         so that answer is the one recording made of it (l1.md Q7) */
      if (words.length === 3 && words[1] === '--replace') {
        const rec = recording('tailor-spaced', null);
        if (rec === undefined) refuse();
        else printTyped(echo, printed(rec, []));
        return;
      }
      const pair =
        words.length === 2 && (words[1] as string).startsWith('--replace=')
          ? (words[1] as string).slice('--replace='.length)
          : null;
      const eq = pair === null ? -1 : pair.indexOf('=');
      if (pair === null || eq <= 0 || eq === pair.length - 1) {
        refuse();
        return;
      }
      const from = pair.slice(0, eq);
      const to = pair.slice(eq + 1);
      if (to.length > NAME_MAX) {
        printTyped(echo, [AGENTS.panel.longName]);
        return;
      }
      const found = from === state.customer;
      const rec = recording('tailor', state, (r) => r.nameFound === found);
      if (rec === undefined) {
        refuse();
        return;
      }
      const names = rec.names;
      printTyped(
        echo,
        printed(
          rec,
          names === null
            ? []
            : [
                [names.from, from],
                [names.to, to],
              ],
        ),
      );
      if (found && to !== from)
        store.commit({
          band: 'agents',
          author: 'agent',
          words: HISTORY.tailored(to),
          undo: null,
          next: (s) => ({ ...s, customer: to }),
        });
      return;
    }

    if (words.length === 2 && words[0] === 'version' && words[1] === 'list') {
      const rec = recording('version-list', state);
      if (rec === undefined) refuse();
      else printTyped(echo, printed(rec, []));
      return;
    }

    const k = HOME_RUN.steps.findIndex((step) => {
      const expected = stepWords(step, state.customer);
      return expected !== null && sameWords(words, expected);
    });
    if (k >= 0) {
      const step = HOME_RUN.steps[k] as RunStep;
      if (step.n === state.agentStep + 1) {
        finishBand('agents');
        runStep(step, { typed: true });
        return;
      }
      const rec = recording('step', state, (r) => r.step === step.n);
      if (rec === undefined) {
        refuse();
        return;
      }
      const names = rec.names;
      printTyped(echo, printed(rec, names === null ? [] : [[names.from, state.customer]]));
      return;
    }
    refuse();
  };

  /* the MCP and HTTP panels hold the requests of the deck at rest from the start */
  paintRequests(store.get().agentStep, store.get().customer);
}
