import { HISTORY } from '../copy';
import { HOME_DECK } from '../deck.generated';
import type { HomeObject, HomeObjectId, HomeSlideId, SheetBox } from '../deck.generated';
import type { LiveContext } from './index';
import { createLog } from './log';
import { ease, finishBand, reduced, sequence, slowFactor } from './motion';
import type { HomeDeckState, StoreEvent } from './state';

/**
 * The editor's selection on the page's slides (docs/LANDING.md 2.2 and 2.6, "Interaction"; a
 * replica of research-product.md 5.1 and `packages/chrome/src/Overlay.tsx`): a click or Tab on an
 * object draws the 1 px ring in `--pt-select`, eight squares, the rotation stem and knob and the
 * role chip; a drag moves it with no easing and snaps within 6 px of the sheet's centre lines and
 * content margins with a 1 px guide (Alt drags free); a square resizes in the object's own axes
 * with the opposite side fixed; the knob turns in whole degrees, 15 with Shift. The keys are the
 * editor's (`packages/viewer/src/keys.ts` 161 to 168; `packages/chrome/src/menus/keys.ts` 741 to
 * 799): the arrows nudge 1 unit and 10 with Shift, nudges within 700 ms are one undo step, Option
 * or Alt with Left or Right turns 15 degrees and 1 with Shift, Enter types, Escape ends the typing
 * and keeps focus on the object. A second click types at the pointer with the browser's caret.
 *
 * The store holds every pose (`poses`, sheet units) and every typed text (`texts`); this module
 * writes them on a gesture's release and draws them on every store event, so Undo (the band's
 * button, or Cmd or Ctrl+Z in `index.ts`) returns an object on the move curve by `transform`
 * (3.2 C5, 300 ms plus half the distance, at most 700 ms). The first change on a slide frees its
 * objects as the editor's "first drag turns the slide into a canvas": each keeps its place, held
 * by an empty spacer in the slide's flow, so a resized box never pushes another; the last Undo puts
 * the layout back. Nothing is drawn at rest (`decks.home.capture-plain`): the overlay is created
 * on the first selection, in `main#top`, outside every sheet (l3.md R14).
 */

/** Sheet units across: 1 unit is 1/1,600 of the sheet's width (LANDING.md 2.0). */
const UNITS = 1600;
/** The sheet's centre lines and content margins (LANDING.md 2.2). */
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
/** The paper a moved text box draws around itself on a dithered slide, in units (integrator.md 2.2). */
const CLEAR_ZONE = 24;
/** The narrowest box a resize leaves, in units. */
const MIN_SIDE = 40;
/** Undo's return: 300 ms plus half the distance in px, at most 700 ms (3.2 C5). */
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

/** The words Version history names an object with (integrator.md 4.4). */
const NAMES: Readonly<Record<HomeObject['role'], string>> = {
  Title: 'the title',
  Subtitle: 'the subtitle',
  Heading: 'the heading',
  Text: 'the text',
  Credit: 'the credit',
  Plate: 'the plate',
};

type Item = {
  id: HomeObjectId;
  el: HTMLElement;
  role: HomeObject['role'];
  editable: boolean;
  block: string;
  parent: Item | null;
  /** the box at rest in sheet units, read when the slide's objects are freed */
  rest: SheetBox | null;
  /** the freed box's place in its containing block, in units; null when it was placed already */
  at: { left: number; top: number } | null;
  /** the freed box's size in the flow, in units */
  flow: { w: number; h: number } | null;
  spacer: HTMLElement | null;
  /** the wrapper's own inline style before the slide was freed, put back by the last Undo */
  css: string;
  /** the rotation last drawn on the object, in degrees */
  turned: number;
};

type Drag = {
  mode: 'move' | 'resize' | 'rotate';
  item: Item;
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

type Visual = { cx: number; cy: number; rot: number };

const objectFacts = (slide: HomeSlideId, id: string): HomeObject | undefined =>
  HOME_DECK.slides[slide]?.objects.find((o) => o.id === id);

const round = (n: number): number => Math.round(n * 100) / 100;

const normalize = (deg: number): number => {
  let a = Math.round(deg) % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
};

/** Starts the selection replica on the hero or the canvas band's slide. */
export function startObjects(ctx: LiveContext, band: 'hero' | 'canvas'): void {
  const found = ctx.band.querySelector<HTMLElement>('[data-home-slides]');
  if (found === null) return;
  const sheet: HTMLElement = found;
  const slide = sheet.dataset['slide'] as HomeSlideId;
  const store = ctx.store;
  const log = band === 'canvas' ? createLog(ctx.band, slide, ctx.announce) : null;

  const items: Item[] = [];
  for (const el of sheet.querySelectorAll<HTMLElement>('[data-object]')) {
    const id = el.dataset['object'] as HomeObjectId;
    const facts = objectFacts(slide, id);
    const block = facts?.canvasBlock ?? id.slice(id.indexOf('#') + 1);
    let parent: Item | null = null;
    for (const it of items) if (it.el.contains(el)) parent = it;
    items.push({
      id,
      el,
      role: facts?.role ?? 'Text',
      editable:
        facts?.editable ??
        (el.matches('[data-block]') || el.querySelector('[data-block]') !== null),
      block,
      parent,
      rest: null,
      at: null,
      flow: null,
      spacer: null,
      css: '',
      turned: 0,
    });
  }
  if (items.length === 0) return;
  const byEl = (el: Element | null): Item | undefined => {
    const o = el?.closest<HTMLElement>('[data-object]');
    return o ? items.find((it) => it.el === o) : undefined;
  };

  // ---- geometry: screen px per unit (S) and local layout px per unit (L) ----
  // The renderer's stage is 1,600 px wide inside the sheet, scaled to the sheet's width by
  // `--k` or laid out in container units (HomeSheet.tsx); its layout width over its drawn width
  // turns screen px into the local px the objects are placed in, whichever way it is scaled.
  const frame = sheet.querySelector<HTMLElement>('.ts-stage') ?? sheet;
  const S = (): number => sheet.getBoundingClientRect().width / UNITS;
  const L = (): number => (S() * frame.offsetWidth) / (frame.getBoundingClientRect().width || 1);
  const pose = (it: Item): SheetBox =>
    store.get().poses[it.id] ?? it.rest ?? { x: 0, y: 0, w: 0, h: 0, rot: 0 };
  /** the offset the object's ancestors' moves add, in units */
  const offset = (it: Item): { x: number; y: number; rot: number } => {
    let x = 0;
    let y = 0;
    let rot = 0;
    for (let p = it.parent; p !== null; p = p.parent) {
      const q = pose(p);
      if (p.rest !== null) {
        x += q.x - p.rest.x;
        y += q.y - p.rest.y;
      }
      rot += q.rot;
    }
    return { x, y, rot };
  };
  /** the rotation drawn on the object with its ancestors' */
  const turnedAll = (it: Item): number => {
    let rot = 0;
    for (let p: Item | null = it; p !== null; p = p.parent) rot += p.turned;
    return rot;
  };
  const visual = (it: Item): Visual => {
    const r = it.el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, rot: turnedAll(it) };
  };
  /** the object's box as the visitor sees it, in units: its centre and its own size */
  const shown = (it: Item): SheetBox => {
    const v = visual(it);
    const sr = sheet.getBoundingClientRect();
    const s = S();
    const l = L();
    const w = it.el.offsetWidth / l;
    const h = it.el.offsetHeight / l;
    return { x: (v.cx - sr.left) / s - w / 2, y: (v.cy - sr.top) / s - h / 2, w, h, rot: v.rot };
  };

  // ---- freeing the slide's objects (the editor's to-canvas) and drawing a pose ----
  let freed = false;
  const free = (): void => {
    if (freed) return;
    freed = true;
    const sr = sheet.getBoundingClientRect();
    const s = S();
    const l = L();
    // sizes from the drawn boxes (nothing is turned at rest), so a fractional height is kept
    // exactly and freeing moves nothing by a rounding
    const k = l / s;
    const read = items.map((it) => {
      const r = it.el.getBoundingClientRect();
      return { it, r, w: r.width * k, h: r.height * k, cs: getComputedStyle(it.el) };
    });
    for (const { it, r, w, h, cs } of read) {
      it.css = it.el.style.cssText;
      it.rest = { x: (r.left - sr.left) / s, y: (r.top - sr.top) / s, w: w / l, h: h / l, rot: 0 };
      if (cs.position === 'absolute' || cs.position === 'fixed') continue;
      const spacer = document.createElement('div');
      spacer.setAttribute('data-live-spacer', '');
      spacer.setAttribute('aria-hidden', 'true');
      const sp = spacer.style;
      sp.display = cs.display.startsWith('inline') ? 'inline-block' : 'block';
      sp.flex = 'none';
      sp.margin = `${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`;
      // the spacer holds the box's place before the box leaves the flow, so a container placed by
      // its bottom edge (a mood slide's plate) keeps its height and the place read below is final
      sp.width = `${w}px`;
      sp.height = `${h}px`;
      it.el.before(spacer);
      it.spacer = spacer;
      it.flow = { w: w / l, h: h / l };
      const st = it.el.style;
      st.position = 'absolute';
      st.margin = '0';
      st.boxSizing = 'border-box';
      st.width = `${w}px`;
      st.left = '0px';
      st.top = '0px';
      const r0 = it.el.getBoundingClientRect();
      it.at = { left: (r.left - r0.left) / s, top: (r.top - r0.top) / s };
      // placed now, before a child inside it reads its own containing block
      lay(it);
    }
  };
  /** writes the freed places and the spacers in local px, again after a resize */
  const lay = (only?: Item): void => {
    const l = L();
    for (const it of only === undefined ? items : [only]) {
      if (it.spacer !== null && it.flow !== null) {
        it.spacer.style.width = `${it.flow.w * l}px`;
        it.spacer.style.height = `${it.flow.h * l}px`;
      }
      if (it.at !== null) {
        it.el.style.left = `${it.at.left * l}px`;
        it.el.style.top = `${it.at.top * l}px`;
      }
    }
  };
  const unfree = (): void => {
    if (!freed) return;
    freed = false;
    for (const it of items) {
      it.spacer?.remove();
      it.spacer = null;
      it.at = null;
      it.flow = null;
      it.turned = 0;
      it.el.style.cssText = it.css;
      if (current === it) it.el.style.touchAction = 'none';
    }
  };
  /** draws a pose on the object; with no pose, its rest */
  /**
   * A text box moved, resized or turned on a dithered slide draws the slide's paper 24 units beyond
   * its box, the hero's clear zone (integrator.md 2.2), so type never sits on dither (LANDING.md 5
   * "Contrast") when it leaves its plate; the editor draws none (a recorded deviation). An outline
   * moves with the box's transform and takes no room. The plate is paper already.
   */
  const ground = (it: Item, on: boolean): void => {
    if (band !== 'canvas' || it.role === 'Plate') return;
    if (on) it.el.style.outline = `${round(CLEAR_ZONE * L())}px solid var(--paper)`;
    else it.el.style.removeProperty('outline');
  };
  const draw = (it: Item, p: SheetBox | undefined): void => {
    const st = it.el.style;
    if (!freed || it.rest === null) return;
    it.turned = p?.rot ?? 0;
    ground(it, p !== undefined);
    if (p === undefined) {
      st.removeProperty('transform');
      if (it.at !== null) st.width = `${round(it.rest.w * L())}px`;
      else st.removeProperty('width');
      st.removeProperty('min-height');
      return;
    }
    const l = L();
    const dx = round((p.x - it.rest.x) * l);
    const dy = round((p.y - it.rest.y) * l);
    st.transform =
      dx === 0 && dy === 0 && p.rot === 0 ? '' : `translate(${dx}px, ${dy}px) rotate(${p.rot}deg)`;
    // a box placed by its slide keeps its own width until a resize, so a typed word widens it as
    // the slide drew it (its clear zone with it); a box freed from the flow holds its width
    if (it.at !== null || Math.abs(p.w - it.rest.w) > 0.01) st.width = `${round(p.w * l)}px`;
    else st.removeProperty('width');
    if (Math.abs(p.h - it.rest.h) > 0.01) st.minHeight = `${round(p.h * l)}px`;
    else st.removeProperty('min-height');
  };
  const drawState = (state: HomeDeckState): void => {
    const posed = items.some((it) => state.poses[it.id] !== undefined);
    if (posed) free();
    for (const it of items) draw(it, state.poses[it.id]);
    if (!posed) unfree();
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
    box = document.createElement('div');
    box.className = 'ts-home-sel';
    box.hidden = true;
    let inner = '<span class="ts-home-sel-ring"></span>';
    for (const h of HANDLES) inner += `<span class="ts-home-sel-h" data-h="${h}"></span>`;
    inner += '<span class="ts-home-sel-stem"></span><span class="ts-home-sel-knob"></span>';
    inner += '<span class="ts-home-sel-chip"></span>';
    box.innerHTML = inner;
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

  let current: Item | null = null;
  let editing: { it: Item; text: HTMLElement; html: string } | null = null;
  let drag: Drag | null = null;

  const place = (): void => {
    if (box === null) return;
    if (current === null) {
      box.hidden = true;
      return;
    }
    const it = current;
    const v = visual(it);
    const k = S() / L();
    // the box with what its text overflows across (a typed word past a resized locked line), in
    // its own axes; read on the text, so the hero's clear zone (the wrapper's ::before) never counts
    const ow = it.el.offsetWidth;
    const oh = it.el.offsetHeight;
    const t = textOf(it);
    const w = (ow + Math.max(0, t.scrollWidth - t.clientWidth)) * k;
    const h = oh * k;
    const a = (v.rot * Math.PI) / 180;
    const ex = (w - ow * k) / 2;
    const ey = (h - oh * k) / 2;
    const cx = v.cx + ex * Math.cos(a) - ey * Math.sin(a);
    const cy = v.cy + ex * Math.sin(a) + ey * Math.cos(a);
    const m = ctx.root.getBoundingClientRect();
    const st = box.style;
    box.hidden = false;
    st.left = `${round(cx - w / 2 - m.left)}px`;
    st.top = `${round(cy - h / 2 - m.top)}px`;
    st.width = `${round(w)}px`;
    st.height = `${round(h)}px`;
    st.transform = v.rot === 0 ? '' : `rotate(${v.rot}deg)`;
    // on a box too small for its middle squares (a phone's subtitle), they step aside so a press
    // inside it moves the box; the corners still resize it
    for (const sq of box.querySelectorAll<HTMLElement>('.ts-home-sel-h')) {
      const d = sq.dataset['h'];
      sq.hidden =
        ((d === 'n' || d === 's') && h < SMALL_PX) || ((d === 'e' || d === 'w') && w < SMALL_PX);
    }
  };
  const guides = (x: number | null, y: number | null): void => {
    if (guideV === null || guideH === null) return;
    const sr = sheet.getBoundingClientRect();
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
    if (chip !== null && current !== null) chip.textContent = text ?? current.role;
  };

  const select = (it: Item): void => {
    if (current === it) return place();
    if (editing !== null) endEdit();
    if (current !== null) current.el.style.removeProperty('touch-action');
    current = it;
    overlay();
    it.el.style.touchAction = 'none';
    chipWord();
    place();
  };
  const deselect = (): void => {
    if (editing !== null) endEdit();
    if (current !== null) current.el.style.removeProperty('touch-action');
    current = null;
    drag = null;
    guides(null, null);
    place();
  };

  // ---- committing a pose ----
  const slideNumber = (): number => store.get().order.indexOf(slide) + 1;
  const commitPose = (
    it: Item,
    before: SheetBox | undefined,
    after: SheetBox,
    words: string,
    line: 'pos' | 'rotate',
    coalesce?: string,
  ): void => {
    const toCanvas = band === 'canvas' && store.get().canvas[slide] !== true;
    const id = it.id;
    store.commit({
      band,
      author: 'you',
      words,
      ...(coalesce !== undefined ? { coalesce } : {}),
      next: (s) => ({
        ...s,
        poses: { ...s.poses, [id]: after },
        canvas: toCanvas ? { ...s.canvas, [slide]: true } : s.canvas,
      }),
      undo: (s) => {
        const poses = { ...s.poses };
        if (before === undefined) delete poses[id];
        else poses[id] = before;
        const canvas = { ...s.canvas };
        if (toCanvas) delete canvas[slide];
        return { ...s, poses, canvas };
      },
    });
    log?.print(
      it.block,
      () => {
        const b = shown(it);
        return line === 'pos' ? { kind: 'pos', box: b } : { kind: 'rotate', deg: b.rot };
      },
      coalesce !== undefined,
      toCanvas,
    );
  };

  // ---- pointer gestures ----
  function pointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const it = byEl(e.target as Element);
    if (it === undefined) {
      deselect();
      return;
    }
    if (editing?.it === it) return;
    finishBand(band);
    const wasSelected = current === it;
    select(it);
    it.el.focus({ preventScroll: true });
    // no compatibility mouse events, so the tap's mousedown never takes the focus off the box;
    // the page still scrolls under an unselected box, which keeps its touch-action
    e.preventDefault();
    // a first touch only selects (2.2)
    if (e.pointerType !== 'mouse' && !wasSelected) return;
    begin(e, 'move', it, null, sheet, wasSelected);
  }

  /** a gesture down: the pose it starts from, captured on its target */
  const begin = (
    e: PointerEvent,
    mode: Drag['mode'],
    it: Item,
    handle: Handle | null,
    target: Element,
    wasSelected: boolean,
  ): void => {
    const p0 = pose(it);
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
    const t = e.target as HTMLElement;
    const handle = (t.dataset['h'] as Handle | undefined) ?? null;
    const knob = t.classList.contains('ts-home-sel-knob');
    if (it === null || e.button !== 0 || (handle === null && !knob)) return;
    e.preventDefault();
    e.stopPropagation();
    finishBand(band);
    free();
    begin(e, knob ? 'rotate' : 'resize', it, handle, t, true);
    box?.setAttribute('data-active', '');
    t.setAttribute('data-on', '');
  }

  function pointerMove(e: PointerEvent): void {
    const g = drag;
    if (g === null || e.pointerId !== g.pointer) return;
    const s = S();
    if (!g.moved) {
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < DRAG_PX) return;
      if (!freed) {
        free();
        g.p0 = pose(g.item);
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
        const off = offset(it);
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
          const marks = rotated ? [size / 2] : [0, size / 2, size];
          for (const mark of marks)
            for (const t of targets) {
              const d = Math.abs(v + mark - t);
              if (d < best) {
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
      const sr = sheet.getBoundingClientRect();
      const off = offset(it);
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
      const rad = ((p0.rot + offset(it).rot) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      const w = hx !== 0 ? Math.max(MIN_SIDE, p0.w + hx * lx) : p0.w;
      const asked = hy !== 0 ? Math.max(MIN_SIDE, p0.h + hy * ly) : 0;
      draw(it, { ...p0, w, h: 0 });
      const natural = it.el.offsetHeight / L();
      const h = Math.max(asked, natural);
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
    draw(it, g.p);
    guides(snapX, snapY);
    place();
  }

  function pointerUp(e: PointerEvent): void {
    const g = drag;
    if (g === null || e.pointerId !== g.pointer) return;
    drag = null;
    box?.removeAttribute('data-active');
    g.target.removeAttribute('data-on');
    guides(null, null);
    chipWord();
    const it = g.item;
    if (!g.moved) {
      if (g.mode === 'move' && g.wasSelected) startEdit(it, e.clientX, e.clientY);
      else drawState(store.get());
      return;
    }
    const n = slideNumber();
    const name = NAMES[it.role];
    if (g.mode === 'move') commitPose(it, g.before, g.p, HISTORY.moved(name, n), 'pos');
    else if (g.mode === 'resize') commitPose(it, g.before, g.p, HISTORY.resized(name, n), 'pos');
    else commitPose(it, g.before, g.p, HISTORY.turned(name, n, g.p.rot), 'rotate');
    place();
  }

  function cancel(): void {
    if (drag === null) return;
    drag = null;
    box?.removeAttribute('data-active');
    guides(null, null);
    chipWord();
    drawState(store.get());
    place();
  }

  // ---- keys (the editor's: Google's nudge and rotate rows) ----
  function keyDown(e: KeyboardEvent): void {
    const it = byEl(e.target as Element);
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
    if (e.key === 'Enter' && !e.altKey && !e.shiftKey && it.editable) {
      e.preventDefault();
      startEdit(it);
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
    free();
    const before = store.get().poses[it.id];
    const p0 = pose(it);
    const p = { ...p0, x: p0.x + dx, y: p0.y + dy, rot: normalize(p0.rot + turn) };
    const n = slideNumber();
    const name = NAMES[it.role];
    if (turn !== 0)
      commitPose(it, before, p, HISTORY.turned(name, n, p.rot), 'rotate', `turn:${it.id}`);
    else commitPose(it, before, p, HISTORY.moved(name, n), 'pos', `nudge:${it.id}`);
    place();
  }

  // ---- typing (a second click or Enter; the browser's caret in the text's colour) ----
  const textOf = (it: Item): HTMLElement =>
    it.el.hasAttribute('data-block')
      ? it.el
      : (it.el.querySelector<HTMLElement>('[data-block]') ?? it.el);

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

  function startEdit(it: Item, x?: number, y?: number): void {
    if (!it.editable) return;
    finishBand(band);
    const text = textOf(it);
    editing = { it, text, html: text.innerHTML };
    // `true`, not `plaintext-only`: Chromium draws a plaintext-only box with `white-space:
    // pre-wrap`, which turns the spaces between the hero's three line spans into lines of their
    // own; a paste is taken as plain text below, so no markup enters either way
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
    const { it, text, html } = e;
    text.removeEventListener('input', place);
    text.removeEventListener('paste', pastePlain);
    text.removeAttribute('contenteditable');
    box?.removeAttribute('data-editing');
    if (current === it) it.el.style.touchAction = 'none';
    const words = (text.textContent ?? '').trim();
    if (text.innerHTML === html) return place();
    if (words === '') {
      text.innerHTML = html;
      return place();
    }
    const id = it.id;
    const typed = text.textContent ?? '';
    let restore = '';
    store.commit({
      band,
      author: 'you',
      words: HISTORY.edited(NAMES[it.role], slideNumber()),
      next: (s) => {
        restore = s.texts[id] ?? '';
        return { ...s, texts: { ...s.texts, [id]: typed } };
      },
      undo: (s) => {
        const texts = { ...s.texts };
        if (restore === '') delete texts[id];
        else texts[id] = restore;
        return { ...s, texts };
      },
    });
    edits.set(store.get().history.at(-1)?.id ?? -1, { text, before: html });
    place();
  }

  /** The markup before and after each typed change, by its Version history row. */
  const edits = new Map<number, { text: HTMLElement; before: string }>();

  // ---- the store: draw every pose; an Undo returns on the move curve ----
  /** ends a running return at its end state */
  let stopReturn: (() => void) | null = null;
  const settle = (state: HomeDeckState): void => {
    stopReturn?.();
    const s = S();
    const l = L();
    const before = new Map(items.map((it) => [it, visual(it)]));
    const turnedBefore = new Map(items.map((it) => [it, it.turned]));
    drawState(state);
    const moves: { it: Item; from: string; to: string; dist: number }[] = [];
    for (const it of items) {
      const a = before.get(it);
      if (a === undefined) continue;
      const b = visual(it);
      let dx = a.cx - b.cx;
      let dy = a.cy - b.cy;
      if (it.parent !== null) {
        const pa = before.get(it.parent);
        if (pa !== undefined) {
          const pb = visual(it.parent);
          dx -= pa.cx - pb.cx;
          dy -= pa.cy - pb.cy;
        }
      }
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && a.rot === b.rot) continue;
      const p = state.poses[it.id];
      const tx = p !== undefined && it.rest !== null ? (p.x - it.rest.x) * l : 0;
      const ty = p !== undefined && it.rest !== null ? (p.y - it.rest.y) * l : 0;
      const rot = p?.rot ?? 0;
      const ownRot = turnedBefore.get(it) ?? 0;
      moves.push({
        it,
        from: `translate(${round(tx + (dx * l) / s)}px, ${round(ty + (dy * l) / s)}px) rotate(${ownRot}deg)`,
        to: `translate(${round(tx)}px, ${round(ty)}px) rotate(${rot}deg)`,
        dist: Math.hypot(dx, dy),
      });
    }
    // the returned object shows its selection while it returns, as the editor's Undo does
    const first = moves[0]?.it;
    if (first !== undefined) select(first);
    if (moves.length === 0 || reduced() || typeof Element.prototype.animate !== 'function') return;
    const dist = Math.max(...moves.map((m) => m.dist));
    const duration = Math.min(RETURN_MAX_MS, RETURN_BASE_MS + dist / 2) * slowFactor();
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

  store.subscribe((state: HomeDeckState, event: StoreEvent) => {
    log?.layout(state.canvas[slide] === true);
    if (event.change.band !== band) return;
    if (event.kind === 'undo') {
      const edit = event.row === null ? undefined : edits.get(event.row.id);
      if (edit !== undefined) {
        if (editing?.text === edit.text) endEdit();
        edit.text.innerHTML = edit.before;
        edits.delete(event.row?.id ?? -1);
        const it = byEl(edit.text);
        if (it !== undefined) select(it);
      }
      settle(state);
    } else if (drag === null) drawState(state);
    place();
  });

  // ---- wiring ----
  sheet.addEventListener('pointerdown', pointerDown);
  sheet.addEventListener('pointermove', pointerMove);
  sheet.addEventListener('pointerup', pointerUp);
  sheet.addEventListener('pointercancel', cancel);
  sheet.addEventListener('keydown', keyDown);
  sheet.addEventListener('focusin', (e) => {
    const it = byEl(e.target as Element);
    if (it !== undefined && editing?.it !== it) select(it);
  });
  sheet.addEventListener('focusout', (e) => {
    const to = e.relatedTarget as Node | null;
    if (current === null) return;
    if (to !== null && (current.el.contains(to) || box?.contains(to))) return;
    if (editing !== null && to !== null && editing.text.contains(to)) return;
    deselect();
  });
  sheet.addEventListener('dragstart', (e) => e.preventDefault());
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Node;
    if (current !== null && !sheet.contains(t) && !(box?.contains(t) ?? false)) deselect();
  });
  const relayout = (): void => {
    if (freed) {
      lay();
      drawState(store.get());
    }
    place();
  };
  window.addEventListener('resize', relayout);
  if (typeof ResizeObserver === 'function') new ResizeObserver(relayout).observe(sheet);
}
