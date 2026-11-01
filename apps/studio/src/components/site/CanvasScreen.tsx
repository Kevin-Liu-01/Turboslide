import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, FocusEvent, KeyboardEvent, PointerEvent, RefObject } from 'react';

import { AGENT_BRANDS, AgentMark } from '@turboslide/chrome/presence/agent-marks';
import { hideTooltip, tipProps } from '@turboslide/chrome/Tooltip';
import { hueFor } from '@turboslide/identity/hues';

import {
  DIRS,
  INITIAL,
  applyMutations,
  callFor,
  duplicate,
  frameOf,
  isGround,
  marqueeBox,
  marqueeHits,
  mergeGuides,
  moveGesture,
  nudge,
  objectById,
  order,
  paintRanks,
  placeOf,
  printCall,
  redo,
  removeAll,
  resizeGesture,
  ringOf,
  selectableIds,
  turnBy,
  turnGesture,
  turnHome,
  undo,
  write,
} from './canvas-pose';
import { CHAR_MS, EMPTY, MOVE_MS, RUN, STEP_MS, stepMutations } from './agent-run';
import type {
  Call,
  CanvasState,
  Dir,
  Gesture,
  Line,
  OrderMove,
  Placed,
  Point,
  Pos,
  Scene,
} from './canvas-pose';
import { Pointer } from './AvatarStack';
import { REDUCED_MOTION, SCREEN, fitCells, inkOf, onAppearance, printCells } from './cells';
import { CANVAS_SCREEN } from './copy';
import { ScreenHead } from './ScreenHead';
import { SiteIcon } from './SiteIcon';
import { useMountEffect } from '../useMountEffect';

import toneUrl from './pictures/lighthouse-tone.webp?url';

/** The tone grid's columns: one value per cell of the deck's own print (2 slide px cells). */
const TONE_COLS = 800;
/** Tone bytes at or under this read as no ink, above the codec's ringing. */
const TONE_FLOOR = 10;
/** A press travels this many CSS px before it is a drag: a finger's wobble stays a tap. */
const SLOP = { mouse: 3, touch: 8 } as const;

/** A box of the slide as the custom properties site.css places it by (`.site-obj`). */
function place(placed: Placed): CSSProperties {
  const [x, y, w, h] = placed.box;
  return { '--x': x, '--y': y, '--w': w, '--h': h, '--r': `${placed.rotate}deg` } as CSSProperties;
}

/** The same placement written straight to an element, for a drag that renders nothing. */
function setPlace(el: HTMLElement, placed: Placed): void {
  const [x, y, w, h] = placed.box;
  el.style.setProperty('--x', String(x));
  el.style.setProperty('--y', String(y));
  el.style.setProperty('--w', String(w));
  el.style.setProperty('--h', String(h));
  el.style.setProperty('--r', `${placed.rotate}deg`);
}

/** The turn the handle reports: the first selected object's. */
function angleOf(scene: Scene, selected: readonly string[]): number {
  const first = selected[0];
  return first === undefined ? 0 : (objectById(scene, first)?.pos.rotate ?? 0);
}

/**
 * Places every object, ring, frame, the agent's flag and the turn handle of the figure as `scene`
 * and `selected` stand: after a render, so nothing a drag wrote outlives it, and on every pointer move of a drag
 * for the scene the gesture would write.
 */
function paint(root: HTMLElement, scene: Scene, selected: readonly string[]): void {
  const byId = new Map(scene.map((object) => [object.id, object]));
  for (const el of root.querySelectorAll<HTMLElement>('[data-cv]')) {
    const object = byId.get(el.dataset.cv ?? '');
    if (object !== undefined) setPlace(el, placeOf(object));
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-cv-ring]')) {
    const object = byId.get(el.dataset.cvRing ?? '');
    if (object !== undefined) setPlace(el, ringOf(object));
  }
  const frame = frameOf(scene, selected);
  const frameEl = root.querySelector<HTMLElement>('[data-cv-frame]');
  if (frame !== null && frameEl !== null) setPlace(frameEl, frame);
  const flag = root.querySelector<HTMLElement>('[data-cv-agent]');
  const flagOn = byId.get(flag?.dataset.cvAgent ?? '');
  if (flag !== null && flagOn !== undefined) setPlace(flag, ringOf(flagOn));
  const knob = root.querySelector<HTMLElement>('.site-cv-knob');
  if (knob !== null) {
    const angle = angleOf(scene, selected);
    knob.setAttribute('aria-valuenow', String(angle));
    knob.setAttribute('aria-valuetext', CANVAS_SCREEN.degrees(angle));
  }
}

/** The snap guides of a drag, one pooled `i` per merged line, drawn in --pt-guide (site.css). */
function drawGuides(box: HTMLElement, guides: readonly Line[]): void {
  const lines = mergeGuides(guides);
  while (box.children.length < lines.length) box.append(document.createElement('i'));
  [...box.children].forEach((child, index) => {
    const el = child as HTMLElement;
    const line = lines[index];
    el.hidden = line === undefined;
    if (line === undefined) return;
    el.className = 'site-cv-guide';
    el.dataset.axis = line.axis;
    el.style.setProperty('--at', String(line.at));
    el.style.setProperty('--from', String(line.from));
    el.style.setProperty('--len', String(line.to - line.from));
  });
}

/** A JSON value in parts, each comma ending one, so a narrow line breaks between values. */
function valueParts(value: string): string[] {
  return value.split(/(?<=,)/);
}

/** The printed call as lines: the action and its target in the second ink, the value in ink. */
function CallLines({ call }: { call: Call }) {
  return printCall(call).map((line, index) => (
    <span key={index} className={line.inner === true ? 'site-cv-ln is-in' : 'site-cv-ln'}>
      <span className="site-cv-op">{line.op}</span>
      {line.value === undefined ? null : (
        <>
          {' '}
          <span className="site-cv-json">
            {valueParts(line.value).map((part, i) => (
              <Fragment key={i}>
                {i > 0 ? <wbr /> : null}
                {part}
              </Fragment>
            ))}
          </span>
        </>
      )}
    </span>
  ));
}

/** The same lines written into the drag's own element, so a drag renders nothing through React. */
function printInto(el: HTMLElement, call: Call): void {
  const span = (className: string, text: string): HTMLSpanElement => {
    const out = document.createElement('span');
    out.className = className;
    out.textContent = text;
    return out;
  };
  el.replaceChildren(
    ...printCall(call).map((line) => {
      const out = span(line.inner === true ? 'site-cv-ln is-in' : 'site-cv-ln', '');
      out.append(span('site-cv-op', line.op));
      if (line.value !== undefined) {
        const json = span('site-cv-json', '');
        valueParts(line.value).forEach((part, i) => {
          if (i > 0) json.append(document.createElement('wbr'));
          json.append(part);
        });
        out.append(' ', json);
      }
      return out;
    }),
  );
}

/**
 * Prints the slide's picture through the deck's 8 by 8 screen at the size the slide is shown: a
 * cell is the smallest whole CSS px that keeps the cells at or under the tone's 800 columns, the
 * tone area-averaged to that grid by the browser's downscale. The same cells print in the
 * appearance's ink. `reveal` (0 to 1) keeps the cells whose screen threshold is under it, so the
 * agent's insert prints the picture in through the screen; `redraw` draws at the current reveal.
 */
function useLighthouse(
  sheet: RefObject<HTMLDivElement | null>,
  pic: RefObject<HTMLCanvasElement | null>,
  reveal: RefObject<number>,
  redraw: { current: () => void },
) {
  useMountEffect(() => {
    const box = sheet.current;
    const canvas = pic.current;
    if (box === null || canvas === null) return;
    const tone = new Image();
    tone.decoding = 'async';
    let last = '';
    const draw = (): void => {
      if (!tone.complete || tone.naturalWidth === 0) return;
      const rect = box.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const cell = Math.max(1, Math.ceil(rect.width / TONE_COLS));
      const ink = inkOf(box);
      const shown = reveal.current;
      const key = `${rect.width}x${rect.height}+${rect.left}:${cell}:${window.devicePixelRatio}:${ink.join()}:${shown}`;
      if (key === last) return;
      last = key;
      const { cols, rows } = fitCells(canvas, rect, cell);
      const grid = document.createElement('canvas');
      grid.width = cols;
      grid.height = rows;
      const g = grid.getContext('2d', { willReadFrequently: true });
      if (g === null) return;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(tone, 0, 0, cols, rows);
      const data = g.getImageData(0, 0, cols, rows).data;
      printCells(canvas, cols, rows, ink, (col, row) => {
        const byte = data[(row * cols + col) * 4] ?? 0;
        const at = SCREEN[(row & 7) * 8 + (col & 7)] ?? 1;
        return byte > TONE_FLOOR && byte / 255 > at && at < shown;
      });
    };
    redraw.current = draw;
    tone.addEventListener('load', draw);
    tone.src = toneUrl;
    const resize = new ResizeObserver(draw);
    resize.observe(box);
    const stop = onAppearance(draw);
    return () => {
      redraw.current = () => {};
      tone.removeEventListener('load', draw);
      resize.disconnect();
      stop();
    };
  });
}

/** One press on the slide, from pointer down to pointer up. */
type Drag = {
  pointer: number;
  kind: 'move' | 'resize' | 'turn' | 'marquee' | 'tap';
  dir: Dir;
  /** the selection the gesture acts on */
  ids: readonly string[];
  rect: DOMRect;
  /** the press in slide px and in client px */
  start: Point;
  client: Point;
  slop: number;
  armed: boolean;
  /** the object pressed, and what a press that never travels does to the selection */
  pressed: string | null;
  onClick: 'keep' | 'drop' | 'only';
  shift: boolean;
  result: Gesture | null;
  hits: string[];
};

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Who wrote a row of the log: the agent of the run, or the person on the page. */
type Who = 'agent' | 'you';
type LogRow = { key: number; who: Who; call: Call };
/** Where the run stands: waiting to be seen, writing, or handed over. */
type Run = 'idle' | 'running' | 'done';

/** The log keeps the last rows that fit beside the slide. */
const LOG_ROWS = 8;
const AGENT = AGENT_BRANDS['claude-code'];
/** The live hues of the agent's flag and of the person's pointer (packages/identity hues.ts). */
const AGENT_HUE = hueFor(3);
const YOU_HUE = hueFor(1);
const AGENT_LOG: readonly LogRow[] = RUN.map((step, key) => ({
  key,
  who: 'agent',
  call: step.call,
}));
/** The slide after each write of the run. */
const SCENES: readonly Scene[] = RUN.reduce<Scene[]>(
  (scenes, step) => [...scenes, applyMutations(scenes.at(-1) ?? EMPTY, stepMutations(step)).scene],
  [],
);
/** The screen before the run: an empty freeform slide, nothing selected. */
const IDLE: CanvasState = { ...INITIAL, scene: EMPTY, selected: [] };

/** A position part way from `a` to `b`, turned the short way. */
function lerpPos(a: Pos, b: Pos, t: number): Pos {
  const turn = (((b.rotate ?? 0) - (a.rotate ?? 0) + 540) % 360) - 180;
  const mix = (from: number, to: number): number => from + (to - from) * t;
  return {
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    w: mix(a.w, b.w),
    h: mix(a.h, b.h),
    z: b.z,
    rotate: ((((a.rotate ?? 0) + turn * t) % 360) + 360) % 360,
  };
}

/** The ease of the agent's move: out, as the editor's own moves settle. */
const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/** One row of the log: who wrote it, drawn as the editor draws them, and the call. */
function LogEntry({ row }: { row: LogRow }) {
  return (
    <li className="site-log-row" data-who={row.who}>
      <span className="site-log-who">
        {row.who === 'agent' ? (
          <AgentMark brand="claude-code" size={14} className="site-log-mark" />
        ) : (
          <span className="site-log-pointer" style={{ '--ts-hue': YOU_HUE } as CSSProperties}>
            <Pointer />
          </span>
        )}
        {row.who === 'agent' ? AGENT.name : CANVAS_SCREEN.log.you}
      </span>
      <code className="site-cv-code">
        <CallLines call={row.call} />
      </code>
    </li>
  );
}

/**
 * The Agents screen: the lighthouse slide as a small canvas with the editor's gestures, built by
 * an agent and then handed to the reader. When half the slide first comes into view the agent
 * writes the slide from empty in six calls (agent-run.ts), its flag standing on each object as
 * the write lands, the picture printing in through the deck's screen and the texts typing in;
 * each call lands in the log beside the slide in the editor's own spelling. The last write moves
 * the heading into the sky and turns it, and the slide is the reader's: every object (the
 * heading, the paragraph, the credit and the plate) selects with the editor's ring, eight resize
 * squares and turn handle (Overlay.css). A drag moves the selection, a square resizes it and the
 * handle turns it, each snapping to the slide's guides, its edges and centre, the other objects'
 * edges and centres and their equal gaps, with the snapped line drawn in --pt-guide; Shift click
 * and a marquee on the photograph select several. The arrows nudge, Cmd D duplicates, Delete
 * deletes, Cmd and the arrows reorder, Cmd Z and Shift Cmd Z undo and redo, and Escape clears.
 * Each of the reader's writes lands in the same log under the reader's pointer, so the agent's
 * calls and the person's are one list of one table's actions. A press on the slide during the run
 * ends it at once; Replay runs it again from an empty slide. Under Reduce motion, or when the
 * slide is already in view at load, the run is never played and the log holds its six calls.
 */
export function CanvasScreen() {
  const [state, setState] = useState<CanvasState>(INITIAL);
  const [run, setRun] = useState<Run>('done');
  const [log, setLog] = useState<readonly LogRow[]>(AGENT_LOG);
  /* the object the agent's flag stands on, and the text it is typing */
  const [agentAt, setAgentAt] = useState<string | null>(null);
  const [typing, setTyping] = useState<{ id: string; n: number } | null>(null);
  /* the state the handlers read between a write and its render */
  const live = useRef(state);
  const runNow = useRef<Run>('done');
  const rowKey = useRef(AGENT_LOG.length);
  const timers = useRef<{ timeouts: number[]; frames: number[] }>({ timeouts: [], frames: [] });
  const reveal = useRef(1);
  const redrawPicture = useRef<() => void>(() => {});
  const fig = useRef<HTMLElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const pic = useRef<HTMLCanvasElement>(null);
  const liveCode = useRef<HTMLElement>(null);
  const guides = useRef<HTMLDivElement>(null);
  const marquee = useRef<HTMLElement>(null);
  const drag = useRef<Drag | null>(null);
  const pointerFocus = useRef(false);
  /* the element that held the focus before a key's write: a reorder moves it in the DOM */
  const refocus = useRef<HTMLElement | null>(null);
  useLighthouse(sheet, pic, reveal, redrawPicture);

  const focusQuietly = (el: HTMLElement | null | undefined): void => {
    pointerFocus.current = true;
    el?.focus({ preventScroll: true });
    pointerFocus.current = false;
  };

  useLayoutEffect(() => {
    live.current = state;
    if (fig.current !== null) paint(fig.current, state.scene, state.selected);
    const el = refocus.current;
    refocus.current = null;
    if (el !== null && el.isConnected && document.activeElement !== el) focusQuietly(el);
  });

  /* a write of the reader's lands in the log; a change of selection alone does not */
  const commit = (next: CanvasState): void => {
    if (next.seq !== live.current.seq && runNow.current === 'done') {
      const row: LogRow = { key: rowKey.current++, who: 'you', call: next.call };
      setLog((rows) => [...rows, row].slice(-LOG_ROWS));
    }
    live.current = next;
    setState(next);
  };

  const stopRun = (): void => {
    for (const id of timers.current.timeouts) window.clearTimeout(id);
    for (const id of timers.current.frames) window.cancelAnimationFrame(id);
    timers.current = { timeouts: [], frames: [] };
  };

  const later = (fn: () => void, ms: number): void => {
    timers.current.timeouts.push(window.setTimeout(fn, ms));
  };

  /** Runs `each(t)` for t from 0 to 1 over `ms`, one frame at a time, then `then`. */
  const tween = (ms: number, each: (t: number) => void, then: () => void): void => {
    const from = performance.now();
    const frame = (now: number): void => {
      const t = Math.min(1, (now - from) / ms);
      each(t);
      if (t < 1) timers.current.frames.push(window.requestAnimationFrame(frame));
      else then();
    };
    timers.current.frames.push(window.requestAnimationFrame(frame));
  };

  const setRunState = (next: Run): void => {
    runNow.current = next;
    setRun(next);
  };

  /** The slide handed over: the run's last state with the heading selected, the log complete. */
  const handOver = (): void => {
    stopRun();
    setRunState('done');
    setAgentAt(null);
    setTyping(null);
    setLog(AGENT_LOG);
    reveal.current = 1;
    redrawPicture.current();
    live.current = INITIAL;
    setState(INITIAL);
  };

  const runStep = (index: number): void => {
    const current = RUN[index];
    const row = AGENT_LOG[index];
    if (current === undefined || row === undefined) {
      handOver();
      return;
    }
    setLog((rows) => [...rows, row]);
    setAgentAt(current.target);
    const before = SCENES[index - 1] ?? EMPTY;
    const after = SCENES[index] ?? EMPTY;
    const moved = current.call.id === 'block.set';
    if (moved) {
      /* the heading travels to its write, drawn straight to the DOM, then the reader has it */
      const from = objectById(before, current.target)?.pos;
      const to = objectById(after, current.target)?.pos;
      const root = fig.current;
      if (from === undefined || to === undefined || root === null) {
        handOver();
        return;
      }
      later(() => {
        tween(
          MOVE_MS,
          (t) => {
            const pos = lerpPos(from, to, easeOut(t));
            const scene = before.map((object) =>
              object.id === current.target ? { ...object, pos } : object,
            );
            paint(root, scene, []);
          },
          () => later(handOver, STEP_MS / 2),
        );
      }, STEP_MS / 3);
      return;
    }
    live.current = { ...IDLE, scene: after, call: current.call };
    setState(live.current);
    let busy = 0;
    if (current.target === 'picture') {
      busy = STEP_MS;
      tween(
        STEP_MS,
        (t) => {
          reveal.current = t;
          redrawPicture.current();
        },
        () => undefined,
      );
    }
    const text = objectById(after, current.target)?.fields.text;
    if (current.types && typeof text === 'string') {
      busy = text.length * CHAR_MS;
      setTyping({ id: current.target, n: 0 });
      tween(
        busy,
        (t) => setTyping({ id: current.target, n: Math.round(t * text.length) }),
        () => setTyping(null),
      );
    }
    later(() => runStep(index + 1), busy + STEP_MS);
  };

  const startRun = (): void => {
    stopRun();
    setRunState('running');
    runStep(0);
  };

  /** The slide emptied for the run, nothing printed, nothing in the log. */
  const empty = (): void => {
    stopRun();
    setRunState('idle');
    setLog([]);
    setAgentAt(null);
    setTyping(null);
    reveal.current = 0;
    redrawPicture.current();
    live.current = IDLE;
    setState(IDLE);
  };

  const replay = (): void => {
    hideTooltip();
    empty();
    startRun();
  };

  /* the run plays once, when half the slide is first in view, unless motion is reduced or the
     slide is on screen at load (a reload in place keeps what the reader saw) */
  useMountEffect(() => {
    const el = sheet.current;
    if (el === null || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia(REDUCED_MOTION).matches) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) return;
    empty();
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.intersectionRatio >= 0.5)) return;
        seen.disconnect();
        if (runNow.current === 'idle') startRun();
      },
      { threshold: [0.5] },
    );
    seen.observe(el);
    return () => {
      seen.disconnect();
      stopRun();
    };
  });

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    const el = sheet.current;
    if (drag.current !== null || el === null || event.button !== 0) return;
    /* a press during the run hands the slide over at once */
    if (runNow.current !== 'done') {
      event.preventDefault();
      handOver();
      return;
    }
    const target = event.target as Element;
    const square = target.closest<HTMLElement>('[data-cv-dir]');
    const knob = target.closest<HTMLElement>('.site-cv-knob');
    const object = target.closest<HTMLElement>('[data-cv]');
    const touch = event.pointerType === 'touch';
    const kind: Drag['kind'] =
      square !== null
        ? 'resize'
        : knob !== null
          ? 'turn'
          : object !== null
            ? 'move'
            : touch
              ? 'tap'
              : 'marquee';
    const s = live.current;
    const rect = el.getBoundingClientRect();
    const k = 1600 / rect.width;
    let ids = s.selected;
    let onClick: Drag['onClick'] = 'keep';
    const pressed = object?.dataset.cv ?? null;
    if (pressed !== null) {
      const selected = ids.includes(pressed);
      if (event.shiftKey) {
        if (selected) onClick = 'drop';
        else ids = [...ids, pressed];
      } else if (!selected) ids = [pressed];
      else if (ids.length > 1) onClick = 'only';
    }
    /* a finger on the photograph scrolls the page; only a tap that never travels clears */
    if (kind !== 'tap') {
      event.preventDefault();
      el.setPointerCapture(event.pointerId);
    }
    hideTooltip();
    /* after a press the arrows nudge: the focus goes to the object, or to the first selected
       object for a handle; the turn handle's own arrows serve the keyboard alone */
    if (kind === 'move') focusQuietly(object);
    else if (kind === 'turn' || kind === 'resize')
      focusQuietly(el.querySelector<HTMLElement>(`[data-cv="${ids[0] ?? ''}"]`));
    else if (kind === 'marquee') focusQuietly(el);
    drag.current = {
      pointer: event.pointerId,
      kind,
      dir: (square?.dataset.cvDir ?? 'se') as Dir,
      ids,
      rect,
      start: { x: (event.clientX - rect.left) * k, y: (event.clientY - rect.top) * k },
      client: { x: event.clientX, y: event.clientY },
      slop: touch ? SLOP.touch : SLOP.mouse,
      armed: false,
      pressed,
      onClick,
      shift: event.shiftKey,
      result: null,
      hits: [],
    };
    if (ids !== s.selected) commit({ ...s, selected: ids });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    const root = fig.current;
    if (d === null || root === null || event.pointerId !== d.pointer) return;
    if (!d.armed) {
      if (Math.hypot(event.clientX - d.client.x, event.clientY - d.client.y) < d.slop) return;
      if (d.kind === 'tap') {
        drag.current = null;
        return;
      }
      d.armed = true;
      root.setAttribute('data-drag', d.kind === 'resize' ? `resize-${d.dir}` : d.kind);
    }
    const k = 1600 / d.rect.width;
    const now = { x: (event.clientX - d.rect.left) * k, y: (event.clientY - d.rect.top) * k };
    const s = live.current;
    if (d.kind === 'marquee') {
      const box = marqueeBox(d.start, now);
      if (marquee.current !== null) setPlace(marquee.current, { box, rotate: 0 });
      d.hits = marqueeHits(s.scene, box);
      for (const el of root.querySelectorAll<HTMLElement>('[data-cv]'))
        el.toggleAttribute('data-hit', d.hits.includes(el.dataset.cv ?? ''));
      return;
    }
    const mods = { shift: event.shiftKey, alt: event.altKey, meta: event.metaKey || event.ctrlKey };
    const dx = now.x - d.start.x;
    const dy = now.y - d.start.y;
    d.result =
      d.kind === 'move'
        ? moveGesture(s.scene, d.ids, dx, dy, mods)
        : d.kind === 'resize'
          ? resizeGesture(s.scene, d.ids, d.dir, dx, dy, mods)
          : turnGesture(s.scene, d.ids, d.start, now, mods);
    const scene = d.result === null ? s.scene : applyMutations(s.scene, d.result.mutations).scene;
    paint(root, scene, s.selected);
    if (guides.current !== null) drawGuides(guides.current, d.result?.guides ?? []);
    if (liveCode.current !== null) {
      liveCode.current.hidden = d.result === null;
      if (d.result !== null) printInto(liveCode.current, callFor(d.result.mutations));
    }
  };

  const end = (event: PointerEvent<HTMLDivElement>, cancelled: boolean): void => {
    const d = drag.current;
    const root = fig.current;
    if (d === null || root === null || event.pointerId !== d.pointer) return;
    drag.current = null;
    root.removeAttribute('data-drag');
    if (guides.current !== null) drawGuides(guides.current, []);
    if (liveCode.current !== null) liveCode.current.hidden = true;
    for (const el of root.querySelectorAll<HTMLElement>('[data-hit]'))
      el.removeAttribute('data-hit');
    const s = live.current;
    if (cancelled) {
      paint(root, s.scene, s.selected);
      return;
    }
    if (!d.armed) {
      const pressed = d.pressed;
      if (pressed !== null && d.onClick === 'drop')
        commit({ ...s, selected: s.selected.filter((id) => id !== pressed) });
      else if (pressed !== null && d.onClick === 'only') commit({ ...s, selected: [pressed] });
      else if ((d.kind === 'marquee' || d.kind === 'tap') && !d.shift && s.selected.length > 0)
        commit({ ...s, selected: [] });
      return;
    }
    if (d.kind === 'marquee') {
      const selected = d.shift ? [...new Set([...s.selected, ...d.hits])] : d.hits;
      commit({ ...s, selected });
      return;
    }
    if (d.result === null) paint(root, s.scene, s.selected);
    else commit(write(s, d.result.mutations));
  };

  /* a Tab onto an object selects it, as the editor's Tab does; a press selects in onPointerDown */
  const onFocus = (event: FocusEvent<HTMLElement>): void => {
    const id = (event.target as HTMLElement).dataset.cv;
    const s = live.current;
    if (pointerFocus.current || id === undefined || s.selected.includes(id)) return;
    commit({ ...s, selected: [id] });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (drag.current !== null) return;
    if (runNow.current !== 'done') {
      if ((event.target as Element).closest('.site-cv-objs, .site-cv-over') !== null) handOver();
      return;
    }
    const s = live.current;
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const anchor = s.selected[0];
    const onKnob = (event.target as Element).classList.contains('site-cv-knob');
    const arrow = ARROWS[key];
    let next: CanvasState | null = null;
    if (mod && key === 'z') next = event.shiftKey ? redo(s) : undo(s);
    else if (mod && key === 'y') next = redo(s);
    else if (mod && key === 'a') next = { ...s, selected: selectableIds(s.scene) };
    else if (anchor === undefined) return;
    else if (mod && key === 'd') {
      const copy = duplicate(s.scene, s.selected);
      next = write(s, copy.mutations, copy.call, copy.copies);
    } else if (key === 'Escape') next = { ...s, selected: [] };
    else if (key === 'Delete' || key === 'Backspace') {
      focusQuietly(sheet.current);
      next = write(s, removeAll(s.scene, s.selected), undefined, []);
    } else if (arrow !== undefined && mod && arrow[1] !== 0) {
      const move: OrderMove = event.shiftKey
        ? arrow[1] < 0
          ? 'front'
          : 'back'
        : arrow[1] < 0
          ? 'forward'
          : 'backward';
      next = write(s, order(s.scene, anchor, move), { id: 'block.order', blockId: anchor, move });
    } else if (arrow !== undefined && onKnob) {
      const step = event.shiftKey ? 15 : 1;
      next = write(s, turnBy(s.scene, s.selected, (arrow[0] - arrow[1]) * step));
    } else if (arrow !== undefined && !mod) {
      const step = event.shiftKey ? 10 : 1;
      next = write(s, nudge(s.scene, s.selected, arrow[0] * step, arrow[1] * step));
    } else if (key === 'Home' && onKnob) next = write(s, turnHome(s.scene, s.selected));
    else return;
    event.preventDefault();
    if (next === s) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && fig.current?.contains(active) === true)
      refocus.current = active;
    commit(next);
  };

  const { scene, selected } = state;
  const ranks = paintRanks(scene);
  /* the objects in paint order, so the DOM order is the stacking order and no z-index is written */
  const painted = [...scene]
    .filter((object) => !isGround(object))
    .sort((a, b) => (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0));
  const ground = scene.some(isGround);
  const frame = frameOf(scene, selected);
  const several = selected.length > 1;
  const angle = angleOf(scene, selected);
  const flagOn = agentAt === null ? undefined : objectById(scene, agentAt);
  return (
    <section className="site-claim site-cv" id="agents" aria-labelledby="site-agents-title">
      <ScreenHead titleId="site-agents-title" heading={CANVAS_SCREEN.heading} />
      <figure
        ref={fig}
        className="site-cv-fig site-wrap"
        aria-label={CANVAS_SCREEN.figure.alt}
        data-run={run}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
      >
        <div
          ref={sheet}
          className="site-sheet"
          tabIndex={-1}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => end(event, false)}
          onPointerCancel={(event) => end(event, true)}
        >
          <div className="site-cv-objs">
            <canvas ref={pic} className="site-cells" hidden={!ground} aria-hidden="true" />
            {painted.map((object) => {
              const tip = CANVAS_SCREEN.objects[object.type as keyof typeof CANVAS_SCREEN.objects];
              const full = typeof object.fields.text === 'string' ? object.fields.text : undefined;
              const text =
                full !== undefined && typing?.id === object.id ? full.slice(0, typing.n) : full;
              return (
                <div
                  key={object.id}
                  role="button"
                  tabIndex={0}
                  data-cv={object.id}
                  className={`site-obj site-cv-obj site-cv-${object.type}`}
                  style={place(placeOf(object))}
                  aria-pressed={selected.includes(object.id)}
                  aria-label={full === undefined ? tip.name : full}
                  aria-describedby="site-cv-write"
                  {...tipProps(tip)}
                >
                  {text}
                </div>
              );
            })}
          </div>
          <div className="site-cv-over">
            {several
              ? selected.map((id) => {
                  const object = objectById(scene, id);
                  return object === undefined ? null : (
                    <i
                      key={id}
                      data-cv-ring={id}
                      className="site-obj site-cv-ring"
                      style={place(ringOf(object))}
                    />
                  );
                })
              : null}
            {frame === null ? null : (
              <div
                data-cv-frame=""
                className={several ? 'site-obj site-cv-frame is-group' : 'site-obj site-cv-frame'}
                style={place(frame)}
              >
                {DIRS.map((dir) => (
                  <i
                    key={dir}
                    data-cv-dir={dir}
                    className="site-cv-sq"
                    aria-hidden="true"
                    {...tipProps(CANVAS_SCREEN.resize)}
                  />
                ))}
                <span
                  className="site-cv-knob"
                  role="slider"
                  tabIndex={0}
                  aria-label={CANVAS_SCREEN.turn.name}
                  aria-valuemin={0}
                  aria-valuemax={359}
                  aria-valuenow={angle}
                  aria-valuetext={CANVAS_SCREEN.degrees(angle)}
                  aria-describedby="site-cv-write"
                  {...tipProps(CANVAS_SCREEN.turn)}
                />
              </div>
            )}
            {/* the agent's selection as the editor draws another author's: a ring in the
                author's hue and a flag with its mark and name (presence.css) */}
            <div
              data-cv-agent={flagOn?.id ?? ''}
              className="site-obj site-cv-agent"
              data-on={flagOn === undefined ? undefined : ''}
              style={
                {
                  ...(flagOn === undefined ? {} : place(ringOf(flagOn))),
                  '--ts-hue': AGENT_HUE,
                } as CSSProperties
              }
              aria-hidden="true"
            >
              <span className="site-cv-flag">
                <AgentMark brand="claude-code" size={12} className="site-log-mark" />
                {AGENT.name}
              </span>
            </div>
            <i ref={marquee} className="site-obj site-cv-marquee" />
            <div ref={guides} className="site-cv-guides" aria-hidden="true" />
          </div>
        </div>
        <figcaption className="site-log" aria-label={CANVAS_SCREEN.log.name}>
          <div className="site-log-in">
            <ol className="site-log-rows" id="site-cv-write">
              {log.map((row) => (
                <LogEntry key={row.key} row={row} />
              ))}
            </ol>
            <code ref={liveCode} className="site-cv-code site-cv-live" hidden aria-hidden="true" />
          </div>
          {run === 'done' ? (
            <button
              type="button"
              className="site-log-replay"
              aria-label={CANVAS_SCREEN.replay.name}
              onClick={replay}
              {...tipProps(CANVAS_SCREEN.replay)}
            >
              <SiteIcon name="play" />
            </button>
          ) : null}
        </figcaption>
      </figure>
    </section>
  );
}
