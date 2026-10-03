import { HISTORY } from '../copy';
import { HOME_DECK } from '../deck.generated';
import type { HomeSlideId, SheetBox } from '../deck.generated';
import type { LiveContext } from './index';
import { createLog } from './log';
import type { CommandLog } from './log';
import { ease, finishBand, reduced, sequence, slowFactor } from './motion';
import { noteResting, paperGround, roleOf, sheetLayout, textOf, typesIn, UNITS } from './paint';
import type { LayoutItem } from './paint';
import type { HomeDeckState, ObjectKey, SlideKey, StoreEvent } from './state';

/**
 * The editor's selection on the page's slides (docs/LANDING.md 2.2, 2.5 and 2.6 "Interaction"; a
 * replica of research-product.md 5.1 and `packages/chrome/src/Overlay.tsx`), on the slide a band
 * shows now: the hero frame's (whichever slide its filmstrip shows), the miniature's stage and the
 * lighthouse. A click or Tab on an object draws the 1 px ring in `--pt-select`, eight squares, the
 * rotation stem and knob and the role chip; a drag moves it with no easing and snaps within 6 px of
 * the sheet's centre lines and content margins with a 1 px guide (Alt drags free); a square resizes
 * in the object's own axes with the opposite side fixed; the knob turns in whole degrees, 15 with
 * Shift. The keys are the editor's (`packages/viewer/src/keys.ts` 161 to 168;
 * `packages/chrome/src/menus/keys.ts` 741 to 799): the arrows nudge 1 unit and 10 with Shift,
 * nudges within 700 ms are one undo step, Option or Alt with Left or Right turns 15 degrees and 1
 * with Shift, Enter types, Escape ends the typing and keeps focus on the object. A second click
 * types at the pointer with the browser's caret.
 *
 * The store holds every pose and every typed text; this module commits them on a gesture's release
 * and draws a gesture's live pose on the band's own slide only. `paint.ts` draws the committed
 * state on every slide of the page, so the frame's thumbnails, the miniature, the show and the
 * print follow (1.2 item 3). Undo returns an object on the move curve by `transform` (3.6 C5, 300
 * ms plus half the distance, at most 700 ms). Nothing is drawn at rest (`decks.home.capture-plain`):
 * the overlay is created on the first selection, in `main#top`, outside every sheet (l3.md R14).
 */

/** The sheet's centre lines and content margins, in units (LANDING.md 2.2). */
const SNAP_X = [137, 800, 1463] as const;
const SNAP_Y = [129, 450, 771] as const;
/** Snap distance in screen pixels. */
const SNAP_PX = 6;
/** A box side shorter than this, in screen px, draws no middle squares on it. */
const SMALL_PX = 64;
/** Pointer travel before a press becomes a drag, in screen pixels. */
const DRAG_PX = 3;
/** `packages/viewer/src/keys.ts` NUDGE_PX, NUDGE_SHIFT_PX, ROTATE_KEY_DEG, ROTATE_KEY_FINE_DEG. */
const NUDGE = 1;
const NUDGE_SHIFT = 10;
const TURN = 15;
const TURN_FINE = 1;
/** The narrowest box a resize leaves, in units. */
const MIN_SIDE = 40;
/** Undo's return: 300 ms plus half the distance in px, at most 700 ms (3.6 C5). */
const RETURN_BASE_MS = 300;
const RETURN_MAX_MS = 700;

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Handle = (typeof HANDLES)[number];
const DIRS: Readonly<Record<Handle, readonly [number, number]>> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};

/** The words Version history names an object with (integrator.md 4.4), by its chip word. */
export function objectName(role: string): string {
  return `the ${role.toLowerCase()}`;
}

/** The bands whose slides take the selection (2.0 "Undo"). */
export type ObjectsBand = 'hero' | 'menus' | 'canvas';

export type Selected = { id: ObjectKey; el: HTMLElement; role: string; root: HTMLElement };

export type ObjectsController = {
  /** the slide root the band edits now */
  sheet(): HTMLElement | null;
  selected(): Selected | null;
  /** selects an object of the shown slide; with `type` it types at once (Insert > Text box) */
  select(id: ObjectKey, options?: { type?: boolean }): boolean;
  deselect(): void;
  /** the box an object stands in now, in units: the store's pose, else its box at rest */
  poseOf(id: ObjectKey): SheetBox | null;
  /** called on every selection change and during a gesture with the live box */
  onChange(fn: (sel: Selected | null, box: SheetBox | null) => void): void;
  /** places the overlay again (after the band moved the slide) */
  place(): void;
  /** ends a typing at once (its words committed), the object staying selected */
  finishTyping(): void;
};

type Drag = {
  mode: 'move' | 'resize' | 'rotate';
  item: LayoutItem;
  handle: Handle | null;
  pointer: number;
  x0: number;
  y0: number;
  /** the store's pose before the gesture; undefined at rest */
  before: SheetBox | undefined;
  /** the pose the gesture started from */
  p0: SheetBox;
  p: SheetBox;
  moved: boolean;
  wasSelected: boolean;
  target: Element;
};

/** An object's centre in units relative to its sheet, and its drawn rotation. */
type Visual = { cx: number; cy: number; rot: number };

const round = (n: number): number => Math.round(n * 100) / 100;

const normalize = (deg: number): number => {
  let a = Math.round(deg) % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
};

const slideOf = (root: HTMLElement): SlideKey => root.dataset['slide'] as SlideKey;

/** The block id the CLI prints for an object after `slide to-canvas` (2.6), else its own. */
const canvasBlock = (id: ObjectKey): string => {
  const slide = id.slice(0, id.indexOf('#')) as HomeSlideId;
  const facts = HOME_DECK.slides[slide]?.objects.find((o) => o.id === id);
  return facts?.canvasBlock ?? id.slice(id.indexOf('#') + 1);
};

/**
 * Starts the selection on a band's shown slide. `host` holds the band's editable slide root (the
 * hero's `[data-hero-slide]`, the miniature's `[data-mini-stage]`, the canvas band's box); the
 * root may be replaced (a filmstrip shows another slide), and every listener is on the host, so the
 * selection follows whichever slide is there.
 */
export function createObjects(
  ctx: LiveContext,
  band: ObjectsBand,
  host: HTMLElement,
): ObjectsController {
  const store = ctx.store;
  const listeners: ((sel: Selected | null, box: SheetBox | null) => void)[] = [];
  /** the canvas band's Command row, made for the slide it shows */
  let log: CommandLog | null = null;
  let logSlide: SlideKey | null = null;

  const sheetEl = (): HTMLElement | null =>
    host.matches('[data-home-slides]')
      ? host
      : host.querySelector<HTMLElement>('[data-home-slides]');
  const logFor = (root: HTMLElement): CommandLog | null => {
    if (band !== 'canvas') return null;
    const slide = slideOf(root);
    if (logSlide !== slide) {
      log = createLog(ctx.band, slide as HomeSlideId, ctx.announce);
      logSlide = slide;
    }
    return log;
  };

  // ---- geometry: screen px per unit ----
  const S = (): number => (sheetEl()?.getBoundingClientRect().width ?? UNITS) / UNITS;
  const turnedAll = (it: LayoutItem): number => {
    let rot = 0;
    for (let p: LayoutItem | null = it; p !== null; p = p.parent) rot += p.turned;
    return rot;
  };
  const visual = (it: LayoutItem): Visual => {
    const root = sheetEl();
    const r = it.el.getBoundingClientRect();
    const sr = root?.getBoundingClientRect() ?? r;
    const s = S();
    return {
      cx: (r.left + r.width / 2 - sr.left) / s,
      cy: (r.top + r.height / 2 - sr.top) / s,
      rot: turnedAll(it),
    };
  };
  /** the object's box as the visitor sees it, in units: its centre and its own size */
  const shown = (it: LayoutItem): SheetBox => {
    const v = visual(it);
    const w = it.el.offsetWidth;
    const h = it.el.offsetHeight;
    return { x: v.cx - w / 2, y: v.cy - h / 2, w, h, rot: v.rot };
  };

  // ---- the overlay: ring, squares, stem, knob, chip, guides ----
  let layer: HTMLElement | null = null;
  let box: HTMLElement | null = null;
  let chip: HTMLElement | null = null;
  let guideV: HTMLElement | null = null;
  let guideH: HTMLElement | null = null;
  const overlay = (): HTMLElement => {
    if (box !== null) return box;
    layer = document.createElement('div');
    layer.className = 'ts-home-sel-layer';
    layer.setAttribute('data-live-overlay', '');
    layer.setAttribute('aria-hidden', 'true');
    layer.dataset['selBand'] = band;
    box = document.createElement('div');
    box.className = 'ts-home-sel';
    box.hidden = true;
    const ring = document.createElement('span');
    ring.className = 'ts-home-sel-ring';
    box.append(ring);
    for (const h of HANDLES) {
      const sq = document.createElement('span');
      sq.className = 'ts-home-sel-h';
      sq.dataset['h'] = h;
      box.append(sq);
    }
    for (const cls of ['ts-home-sel-stem', 'ts-home-sel-knob', 'ts-home-sel-chip']) {
      const span = document.createElement('span');
      span.className = cls;
      box.append(span);
    }
    chip = box.querySelector('.ts-home-sel-chip');
    guideV = document.createElement('i');
    guideH = document.createElement('i');
    for (const [g, axis] of [
      [guideV, 'v'],
      [guideH, 'h'],
    ] as const) {
      g.className = 'ts-home-guide';
      g.dataset['axis'] = axis;
      g.hidden = true;
    }
    layer.append(box, guideV, guideH);
    ctx.root.append(layer);
    box.addEventListener('pointerdown', handleDown);
    box.addEventListener('pointermove', pointerMove);
    box.addEventListener('pointerup', pointerUp);
    box.addEventListener('pointercancel', cancel);
    return box;
  };

  let current: LayoutItem | null = null;
  let currentRoot: HTMLElement | null = null;
  let editing: { it: LayoutItem; root: HTMLElement; text: HTMLElement; html: string } | null = null;
  let drag: Drag | null = null;

  const selectedInfo = (): Selected | null =>
    current === null || currentRoot === null
      ? null
      : { id: current.id, el: current.el, role: roleOf(current.el), root: currentRoot };
  const tell = (live?: SheetBox): void => {
    const sel = selectedInfo();
    const root = currentRoot;
    let b: SheetBox | null = null;
    if (sel !== null && root !== null && current !== null)
      b = live ?? sheetLayout(root).pose(current, store.get());
    for (const fn of listeners) fn(sel, b);
  };

  const place = (): void => {
    if (box === null) return;
    if (current === null || currentRoot === null || !currentRoot.isConnected) {
      box.hidden = true;
      return;
    }
    const it = current;
    const r = it.el.getBoundingClientRect();
    const k = S();
    // the box with what its text overflows across (a typed word past a resized locked line), in
    // its own axes; read on the text, so a clear zone (the wrapper's outline) never counts
    const ow = it.el.offsetWidth;
    const oh = it.el.offsetHeight;
    const t = textOf(it.el);
    const w = (ow + Math.max(0, t.scrollWidth - t.clientWidth)) * k;
    const h = oh * k;
    const rot = turnedAll(it);
    const a = (rot * Math.PI) / 180;
    const ex = (w - ow * k) / 2;
    const ey = (h - oh * k) / 2;
    const cx = r.left + r.width / 2 + ex * Math.cos(a) - ey * Math.sin(a);
    const cy = r.top + r.height / 2 + ex * Math.sin(a) + ey * Math.cos(a);
    const m = ctx.root.getBoundingClientRect();
    const st = box.style;
    box.hidden = false;
    st.left = `${round(cx - w / 2 - m.left)}px`;
    st.top = `${round(cy - h / 2 - m.top)}px`;
    st.width = `${round(w)}px`;
    st.height = `${round(h)}px`;
    st.transform = rot === 0 ? '' : `rotate(${rot}deg)`;
    // on a box too small for its middle squares' hit areas (a title in the hero frame, a phone's
    // subtitle), the eight squares are drawn and the middle ones take no press, so a press inside
    // the box moves it; the corners still resize it
    for (const sq of box.querySelectorAll<HTMLElement>('.ts-home-sel-h')) {
      const d = sq.dataset['h'];
      const small =
        ((d === 'n' || d === 's') && h < SMALL_PX) || ((d === 'e' || d === 'w') && w < SMALL_PX);
      sq.style.pointerEvents = small ? 'none' : '';
    }
  };
  const guides = (x: number | null, y: number | null): void => {
    if (guideV === null || guideH === null) return;
    const root = sheetEl();
    if (root === null) return;
    const sr = root.getBoundingClientRect();
    const m = ctx.root.getBoundingClientRect();
    const s = S();
    guideV.hidden = x === null;
    guideH.hidden = y === null;
    const at = (g: HTMLElement, l: number, t: number, w: number, h: number): void => {
      g.style.cssText = `left:${round(l)}px;top:${round(t)}px;width:${round(w)}px;height:${round(h)}px`;
    };
    if (x !== null) at(guideV, sr.left - m.left + x * s, sr.top - m.top, 1, sr.height);
    if (y !== null) at(guideH, sr.left - m.left, sr.top - m.top + y * s, sr.width, 1);
  };
  const chipWord = (text?: string): void => {
    if (chip !== null && current !== null) chip.textContent = text ?? roleOf(current.el);
  };

  const select = (it: LayoutItem, root: HTMLElement): void => {
    if (current === it && currentRoot === root) {
      place();
      return;
    }
    if (editing !== null) endEdit();
    if (current !== null) current.el.style.removeProperty('touch-action');
    current = it;
    currentRoot = root;
    overlay();
    it.el.style.touchAction = 'none';
    chipWord();
    place();
    tell();
  };
  const deselect = (): void => {
    if (editing !== null) endEdit();
    if (current !== null) current.el.style.removeProperty('touch-action');
    const had = current !== null;
    current = null;
    currentRoot = null;
    drag = null;
    guides(null, null);
    place();
    if (had) tell();
  };

  // ---- committing a pose ----
  const slideNumber = (root: HTMLElement): number => store.get().order.indexOf(slideOf(root)) + 1;
  const commitPose = (
    root: HTMLElement,
    it: LayoutItem,
    after: SheetBox,
    words: string,
    line: 'pos' | 'rotate',
    coalesce?: string,
  ): void => {
    const slide = slideOf(root);
    const toCanvas = store.get().canvas[slide] !== true;
    const id = it.id;
    const log = logFor(root);
    store.commit({
      band,
      author: 'you',
      words,
      slide,
      ...(coalesce !== undefined ? { coalesce } : {}),
      next: (s) => ({
        ...s,
        poses: { ...s.poses, [id]: after },
        canvas: toCanvas ? { ...s.canvas, [slide]: true } : s.canvas,
      }),
      undo: (s) => s,
    });
    log?.print(
      canvasBlock(it.id),
      () => {
        const b = shown(it);
        return line === 'pos' ? { kind: 'pos', box: b } : { kind: 'rotate', deg: b.rot };
      },
      coalesce !== undefined,
      toCanvas && band === 'canvas',
    );
  };

  // ---- pointer gestures ----
  function pointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const root = (e.target as Element).closest<HTMLElement>('[data-home-slides]');
    if (root === null || root !== sheetEl()) return;
    const layout = sheetLayout(root);
    const it = layout.itemOf(e.target as Element);
    if (it === undefined || it.el.hasAttribute('data-deleted')) {
      deselect();
      return;
    }
    if (editing?.it === it) return;
    finishBand(band);
    const wasSelected = current === it;
    select(it, root);
    it.el.focus({ preventScroll: true });
    // no compatibility mouse events, so the tap's mousedown never takes the focus off the box;
    // the page still scrolls under an unselected box, which keeps its touch-action
    e.preventDefault();
    // a first touch only selects (2.2)
    if (e.pointerType !== 'mouse' && !wasSelected) return;
    begin(e, 'move', it, null, root, wasSelected);
  }

  /** a gesture down: the pose it starts from, captured on its target */
  const begin = (
    e: PointerEvent,
    mode: Drag['mode'],
    it: LayoutItem,
    handle: Handle | null,
    target: Element,
    wasSelected: boolean,
  ): void => {
    const root = currentRoot;
    if (root === null) return;
    const p0 = sheetLayout(root).pose(it, store.get());
    drag = {
      mode,
      item: it,
      handle,
      pointer: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      before: store.get().poses[it.id],
      p0,
      p: p0,
      moved: false,
      wasSelected,
      target,
    };
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* capture is optional */
    }
  };

  function handleDown(e: PointerEvent): void {
    const it = current;
    const root = currentRoot;
    const t = e.target as HTMLElement;
    const handle = (t.dataset['h'] as Handle | undefined) ?? null;
    const knob = t.classList.contains('ts-home-sel-knob');
    if (it === null || root === null || e.button !== 0 || (handle === null && !knob)) return;
    e.preventDefault();
    e.stopPropagation();
    finishBand(band);
    sheetLayout(root).free();
    begin(e, knob ? 'rotate' : 'resize', it, handle, t, true);
    box?.setAttribute('data-active', '');
    t.setAttribute('data-on', '');
  }

  function pointerMove(e: PointerEvent): void {
    const g = drag;
    const root = currentRoot;
    if (g === null || root === null || e.pointerId !== g.pointer) return;
    const layout = sheetLayout(root);
    const s = S();
    const state = store.get();
    if (!g.moved) {
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < DRAG_PX) return;
      if (!layout.freed()) {
        layout.free();
        g.p0 = layout.pose(g.item, state);
      }
    }
    g.moved = true;
    const dx = (e.clientX - g.x0) / s;
    const dy = (e.clientY - g.y0) / s;
    const it = g.item;
    const p0 = g.p0;
    let snapX: number | null = null;
    let snapY: number | null = null;
    if (g.mode === 'move') {
      const p = { ...p0, x: p0.x + dx, y: p0.y + dy };
      if (!e.altKey) {
        const off = layout.offset(it, state);
        const tol = SNAP_PX / s;
        const fit = (
          v: number,
          size: number,
          targets: readonly number[],
          rotated: boolean,
        ): [number, number | null] => {
          let best = tol;
          let to = v;
          let line: number | null = null;
          // the centre first, and it wins a tie within half a unit, so a box as wide as the
          // content (the title of slide 1) draws the centre line when its edges meet the margins
          const marks = rotated ? [size / 2] : [size / 2, 0, size];
          for (const mark of marks)
            for (const t of targets) {
              const d = Math.abs(v + mark - t);
              if (d < best - (line === null || mark === size / 2 ? 0 : 0.5)) {
                best = d;
                to = t - mark;
                line = t;
              }
            }
          return [to, line];
        };
        const rotated = p.rot !== 0;
        const [x, lx] = fit(p.x + off.x, p.w, SNAP_X, rotated);
        const [y, ly] = fit(p.y + off.y, p.h, SNAP_Y, rotated);
        p.x = x - off.x;
        p.y = y - off.y;
        snapX = lx;
        snapY = ly;
      }
      g.p = p;
    } else if (g.mode === 'rotate') {
      const sr = root.getBoundingClientRect();
      const off = layout.offset(it, state);
      const cx = p0.x + p0.w / 2 + off.x;
      const cy = p0.y + p0.h / 2 + off.y;
      const px = (e.clientX - sr.left) / s;
      const py = (e.clientY - sr.top) / s;
      let a = (Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90 - off.rot;
      a = e.shiftKey ? Math.round(a / TURN) * TURN : Math.round(a);
      g.p = { ...p0, rot: normalize(a) };
      chipWord(`${g.p.rot}°`);
    } else if (g.handle !== null) {
      const [hx, hy] = DIRS[g.handle];
      const rad = ((p0.rot + layout.offset(it, state).rot) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      const w = hx !== 0 ? Math.max(MIN_SIDE, p0.w + hx * lx) : p0.w;
      const asked = hy !== 0 ? Math.max(MIN_SIDE, p0.h + hy * ly) : 0;
      const inserted = it.el.dataset['inserted'] !== undefined;
      layout.draw(it, { ...p0, w, h: inserted ? Math.max(asked, MIN_SIDE) : 0 });
      const natural = inserted ? 0 : it.el.offsetHeight;
      const h = Math.max(asked, natural, hy === 0 ? p0.h : 0);
      // the opposite side stays where it was, in the slide's axes; a side handle keeps the top
      const ax = (-hx * p0.w) / 2;
      const ay = hy !== 0 ? (-hy * p0.h) / 2 : -p0.h / 2;
      const bx = (-hx * w) / 2;
      const by = hy !== 0 ? (-hy * h) / 2 : -h / 2;
      const c0x = p0.x + p0.w / 2;
      const c0y = p0.y + p0.h / 2;
      const anchorX = c0x + ax * cos - ay * sin;
      const anchorY = c0y + ax * sin + ay * cos;
      const c1x = anchorX - (bx * cos - by * sin);
      const c1y = anchorY - (bx * sin + by * cos);
      g.p = { x: c1x - w / 2, y: c1y - h / 2, w, h, rot: p0.rot };
    }
    layout.draw(it, g.p);
    guides(snapX, snapY);
    place();
    tell(g.p);
  }

  function pointerUp(e: PointerEvent): void {
    const g = drag;
    const root = currentRoot;
    if (g === null || root === null || e.pointerId !== g.pointer) return;
    drag = null;
    box?.removeAttribute('data-active');
    g.target.removeAttribute('data-on');
    guides(null, null);
    chipWord();
    const it = g.item;
    if (!g.moved) {
      if (g.mode === 'move' && g.wasSelected) startEdit(it, root, e.clientX, e.clientY);
      else redraw();
      return;
    }
    const n = slideNumber(root);
    const name = objectName(roleOf(it.el));
    if (g.mode === 'move') commitPose(root, it, g.p, HISTORY.moved(name, n), 'pos');
    else if (g.mode === 'resize') commitPose(root, it, g.p, HISTORY.resized(name, n), 'pos');
    else commitPose(root, it, g.p, HISTORY.turned(name, n, g.p.rot), 'rotate');
    place();
  }

  function cancel(): void {
    if (drag === null) return;
    drag = null;
    box?.removeAttribute('data-active');
    guides(null, null);
    chipWord();
    redraw();
    place();
  }

  /** draws the store's poses on the band's slide again (a gesture that ended with no change) */
  const redraw = (): void => {
    const root = sheetEl();
    if (root === null) return;
    const layout = sheetLayout(root);
    const state = store.get();
    if (layout.freed()) for (const it of layout.items()) layout.draw(it, state.poses[it.id]);
    tell();
  };

  // ---- keys (the editor's: Google's nudge and rotate rows) ----
  function keyDown(e: KeyboardEvent): void {
    const root = (e.target as Element).closest<HTMLElement>('[data-home-slides]');
    if (root === null || root !== sheetEl()) return;
    const layout = sheetLayout(root);
    const it = layout.itemOf(e.target as Element);
    if (it === undefined) return;
    if (editing !== null && editing.it === it) {
      if (e.key === 'Escape') {
        e.preventDefault();
        endEdit();
        it.el.focus({ preventScroll: true });
      } else if ((e.key === 'Home' || e.key === 'End') && !e.metaKey && !e.ctrlKey) {
        // Chromium leaves the caret where it is in a scaled sheet's line spans and scrolls the
        // page to its end instead; the line's ends are taken here
        e.preventDefault();
        getSelection()?.modify(
          e.shiftKey ? 'extend' : 'move',
          e.key === 'End' ? 'forward' : 'backward',
          'lineboundary',
        );
      }
      return;
    }
    if (e.metaKey || e.ctrlKey) return;
    finishBand(band);
    if (e.key === 'Enter' && !e.altKey && !e.shiftKey && typesIn(it.el)) {
      e.preventDefault();
      startEdit(it, root);
      return;
    }
    const arrow = e.key.startsWith('Arrow') ? e.key.slice(5) : '';
    if (arrow === '') return;
    let turn = 0;
    let dx = 0;
    let dy = 0;
    if (e.altKey) {
      if (arrow !== 'Left' && arrow !== 'Right') return;
      turn = (arrow === 'Left' ? -1 : 1) * (e.shiftKey ? TURN_FINE : TURN);
    } else {
      const step = e.shiftKey ? NUDGE_SHIFT : NUDGE;
      if (arrow === 'Left') dx = -step;
      else if (arrow === 'Right') dx = step;
      else if (arrow === 'Up') dy = -step;
      else dy = step;
    }
    e.preventDefault();
    if (current !== it) select(it, root);
    layout.free();
    const p0 = layout.pose(it, store.get());
    const p = { ...p0, x: p0.x + dx, y: p0.y + dy, rot: normalize(p0.rot + turn) };
    const n = slideNumber(root);
    const name = objectName(roleOf(it.el));
    if (turn !== 0)
      commitPose(root, it, p, HISTORY.turned(name, n, p.rot), 'rotate', `turn:${it.id}`);
    else commitPose(root, it, p, HISTORY.moved(name, n), 'pos', `nudge:${it.id}`);
    place();
  }

  // ---- typing (a second click or Enter; the browser's caret in the text's colour) ----

  /** a paste into a box is its plain text (the editor's text boxes take no markup from outside) */
  function pastePlain(e: ClipboardEvent): void {
    e.preventDefault();
    const plain = e.clipboardData?.getData('text/plain') ?? '';
    const range = getSelection()?.getRangeAt(0);
    if (range === undefined || plain === '') return;
    range.deleteContents();
    const node = document.createTextNode(plain);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    place();
  }

  function startEdit(it: LayoutItem, root: HTMLElement, x?: number, y?: number): void {
    if (!typesIn(it.el)) return;
    finishBand(band);
    const text = textOf(it.el);
    noteResting(text);
    editing = { it, root, text, html: text.innerHTML };
    // `true`, not `plaintext-only`: Chromium draws a plaintext-only box with `white-space:
    // pre-wrap`, which turns the spaces between a title's line spans into lines of their own; a
    // paste is taken as plain text above, so no markup enters either way
    text.contentEditable = 'true';
    text.addEventListener('paste', pastePlain);
    box?.setAttribute('data-editing', '');
    it.el.style.touchAction = 'auto';
    text.focus({ preventScroll: true });
    const selection = getSelection();
    let range: Range | null = null;
    if (x !== undefined && y !== undefined && typeof document.caretRangeFromPoint === 'function')
      range = document.caretRangeFromPoint(x, y);
    if (range === null || !text.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(text);
      range.collapse(false);
    }
    selection?.removeAllRanges();
    selection?.addRange(range);
    text.addEventListener('input', place);
    place();
  }

  function endEdit(): void {
    const e = editing;
    if (e === null) return;
    editing = null;
    const { it, root, text, html } = e;
    text.removeEventListener('input', place);
    text.removeEventListener('paste', pastePlain);
    text.removeAttribute('contenteditable');
    box?.removeAttribute('data-editing');
    if (current === it) it.el.style.touchAction = 'none';
    const words = (text.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text.innerHTML === html) return place();
    const inserted = it.el.dataset['inserted'] === 'text';
    if (words === '' && !inserted) {
      // the renderer's markup the box held before the typing began, read from the page
      text.innerHTML = html;
      return place();
    }
    const id = it.id;
    store.commit({
      band,
      author: 'you',
      words: HISTORY.edited(objectName(roleOf(it.el)), slideNumber(root)),
      slide: slideOf(root),
      next: (s) => ({ ...s, texts: { ...s.texts, [id]: words } }),
      undo: (s) => s,
    });
    place();
  }

  // ---- the store: an Undo returns on the move curve ----
  /** the objects' last drawn centres on the band's slide, so an Undo returns from where they were */
  let last = new Map<LayoutItem, Visual>();
  const remember = (): void => {
    const root = sheetEl();
    if (root === null || root.getBoundingClientRect().width === 0) return;
    last = new Map(
      sheetLayout(root)
        .items()
        .map((it) => [it, visual(it)]),
    );
  };
  /** ends a running return at its end state */
  let stopReturn: (() => void) | null = null;
  const settle = (state: HomeDeckState): void => {
    stopReturn?.();
    const root = sheetEl();
    if (root === null) return;
    const layout = sheetLayout(root);
    const moves: { it: LayoutItem; from: string; to: string; dist: number }[] = [];
    for (const it of layout.items()) {
      const a = last.get(it);
      if (a === undefined) continue;
      const b = visual(it);
      let dx = a.cx - b.cx;
      let dy = a.cy - b.cy;
      if (it.parent !== null) {
        const pa = last.get(it.parent);
        if (pa !== undefined) {
          const pb = visual(it.parent);
          dx -= pa.cx - pb.cx;
          dy -= pa.cy - pb.cy;
        }
      }
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && a.rot === b.rot) continue;
      const p = state.poses[it.id];
      const tx = p !== undefined && it.rest !== null ? p.x - it.rest.x : 0;
      const ty = p !== undefined && it.rest !== null ? p.y - it.rest.y : 0;
      const rot = p?.rot ?? 0;
      moves.push({
        it,
        from: `translate(${round(tx + dx)}px, ${round(ty + dy)}px) rotate(${a.rot - (b.rot - rot)}deg)`,
        to: `translate(${round(tx)}px, ${round(ty)}px) rotate(${rot}deg)`,
        dist: Math.hypot(dx, dy) * S(),
      });
    }
    // the returned object shows its selection while it returns, as the editor's Undo does
    const first = moves[0]?.it;
    if (first !== undefined) select(first, root);
    if (moves.length === 0 || reduced() || typeof Element.prototype.animate !== 'function') return;
    const dist = Math.max(...moves.map((m) => m.dist));
    const duration = Math.min(RETURN_MAX_MS, RETURN_BASE_MS + dist / 2) * slowFactor();
    const ground = (it: LayoutItem, on: boolean): void => paperGround(root, it.el, on);
    const animations = moves.map((m) =>
      m.it.el.animate([{ transform: m.from }, { transform: m.to }], {
        duration,
        easing: ease('move'),
      }),
    );
    // a returning text box keeps its paper until it is home, so its type never crosses dither
    for (const m of moves) ground(m.it, true);
    let frame = 0;
    const end = (): void => {
      cancelAnimationFrame(frame);
      for (const a of animations) a.cancel();
      for (const m of moves) ground(m.it, store.get().poses[m.it.id] !== undefined);
      run.done();
      if (stopReturn === end) stopReturn = null;
      place();
      remember();
    };
    const run = sequence(band, end);
    stopReturn = end;
    const tick = (): void => {
      place();
      if (animations.some((a) => a.playState === 'running')) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    void Promise.all(animations.map((a) => a.finished)).then(end, () => undefined);
  };

  ctx.store.subscribe((state: HomeDeckState, event: StoreEvent) => {
    const root = sheetEl();
    if (root !== null && band === 'canvas')
      logFor(root)?.layout(state.canvas[slideOf(root)] === true);
    if (current !== null && (!current.el.isConnected || current.el.hasAttribute('data-deleted')))
      deselect();
    if (event.kind === 'undo' && event.change.band === band) settle(state);
    else if (drag !== null) {
      const layout = root === null ? null : sheetLayout(root);
      if (layout !== null) layout.draw(drag.item, drag.p);
    }
    place();
    tell();
    if (stopReturn === null) remember();
  });

  // ---- wiring: every listener on the host, so a replaced slide keeps them ----
  host.addEventListener('pointerdown', pointerDown);
  host.addEventListener('pointermove', pointerMove);
  host.addEventListener('pointerup', pointerUp);
  host.addEventListener('pointercancel', cancel);
  host.addEventListener('keydown', keyDown);
  host.addEventListener('focusin', (e) => {
    const root = (e.target as Element).closest<HTMLElement>('[data-home-slides]');
    if (root === null || root !== sheetEl()) return;
    const it = sheetLayout(root).itemOf(e.target as Element);
    if (it !== undefined && editing?.it !== it && !it.el.hasAttribute('data-deleted'))
      select(it, root);
  });
  host.addEventListener('focusout', (e) => {
    const to = e.relatedTarget as Node | null;
    if (current === null) return;
    if (to !== null && (current.el.contains(to) || box?.contains(to))) return;
    if (editing !== null && to !== null && editing.text.contains(to)) return;
    // a menu of the band keeps the selection while it is open (the miniature's rows act on it)
    if (to instanceof Element && to.closest('[data-keeps-selection]') !== null) return;
    deselect();
  });
  host.addEventListener('dragstart', (e) => e.preventDefault());
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Element;
    if (current === null || host.contains(t) || (box?.contains(t) ?? false)) return;
    if (t.closest?.('[data-keeps-selection]') !== null) return;
    deselect();
  });
  // a replaced slide drops the selection made on the slide it replaced
  new MutationObserver(() => {
    if (currentRoot !== null && currentRoot !== sheetEl()) deselect();
    remember();
  }).observe(host, { childList: true });
  const relayout = (): void => {
    const root = sheetEl();
    if (root !== null) {
      const layout = sheetLayout(root);
      if (layout.freed()) layout.lay();
    }
    place();
  };
  window.addEventListener('resize', relayout);
  if (typeof ResizeObserver === 'function') new ResizeObserver(relayout).observe(host);
  remember();

  return {
    sheet: sheetEl,
    selected: selectedInfo,
    select(id, options = {}) {
      const root = sheetEl();
      if (root === null) return false;
      const it = sheetLayout(root).item(id);
      if (it === undefined) return false;
      select(it, root);
      it.el.focus({ preventScroll: true });
      if (options.type === true) startEdit(it, root);
      return true;
    },
    deselect,
    poseOf(id) {
      const root = sheetEl();
      if (root === null) return null;
      const layout = sheetLayout(root);
      const it = layout.item(id);
      if (it === undefined) return null;
      const state = store.get();
      const posed = state.poses[id];
      if (posed !== undefined) return posed;
      layout.free();
      const rest = it.rest;
      if (!Object.keys(state.poses).some((k) => k.startsWith(`${slideOf(root)}#`))) layout.unfree();
      return rest;
    },
    onChange(fn) {
      listeners.push(fn);
    },
    place,
    finishTyping() {
      const e = editing;
      if (e === null) return;
      endEdit();
      e.it.el.focus({ preventScroll: true });
    },
  };
}

/**
 * Starts the selection on the hero frame's shown slide or the canvas band's lighthouse
 * (registrations of `index.ts`). The hero's host is the frame's `[data-hero-slide]` (V1's,
 * LANDING.md 2.2), else the band's first slide (the first pass's hero).
 */
export function startObjects(ctx: LiveContext, band: 'hero' | 'canvas'): ObjectsController | null {
  const host =
    (band === 'hero'
      ? ctx.band.querySelector<HTMLElement>('[data-hero-slide]')
      : (ctx.reserve ?? null)) ??
    ctx.band.querySelector<HTMLElement>('[data-home-slides]')?.parentElement ??
    null;
  if (host === null) return null;
  return createObjects(ctx, band, host);
}
