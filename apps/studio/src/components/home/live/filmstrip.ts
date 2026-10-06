import { ANNOUNCE, HISTORY, TAILOR } from '../copy';
import { cloneSlide } from './index';
import type { LiveContext } from './index';
import { ease, finishBand, ms, play } from './motion';
import { paintSlide, renumber } from './paint';
import { HOME_GLYPHS } from '../sprite.generated';
import { glyph } from './sprite';
import type { HomeDeckState, SlideKey } from './state';
import type { Snackbar } from './tailor';

/**
 * The Tailor band's filmstrip (docs/LANDING.md 2.5 "Filmstrip"; prototype A `a.js` 821 to 943):
 * a click shows the slide on the stage by a cut (3.2 T6); a drag lifts a thumbnail with a 2 px
 * outline in `--pt-select`, the others make room over 200 ms and the dropped slide settles over
 * 240 ms (T4, T5); on touch a 350 ms press lifts it, so a swipe still scrolls; Cmd or Ctrl with Up
 * or Down moves the focused thumbnail; Move Up and Move Down, glyph buttons this module adds to
 * each thumbnail (the model's `bars-arrow-up` and `bars-arrow-down` from the landing's sprite),
 * shown on its hover and focus (docs/DESIGN.md 8.6), are the single pointer path (WCAG 2.5.7). Every move is one change of the store's `order`, which Undo
 * puts back, and every counter on the page renumbers from it (`renumber`, which the agents band's
 * Run Again also reaches through `index.ts`, l3.md R11). Slide 5 enters and leaves the filmstrip by
 * a cut with the order.
 */

/** A press this long lifts a thumbnail on touch (2.5): an input window, not a motion token. */
const PRESS_MS = 350;
/** Pointer travel that starts a mouse drag, and that cancels a touch press, in px. */
const LIFT_PX = 4;
const SWIPE_PX = 8;

/* the counters, the numbers and the skipped mark are drawn by paint.ts on every change; kept here
   for the bands that imported it from the filmstrip in the first pass (l3.md R11) */
export { renumber };

/** Ends at once the renderer's CSS animations an inserted slide starts (its `.slide.is-on` cut). */
function settleCuts(el: Element): void {
  for (const a of el.getAnimations({ subtree: true })) if (a instanceof CSSAnimation) a.finish();
}

/** The order with `id` moved to `index` among the filmstrip's slides (the others keep places). */
function reorder(
  order: readonly SlideKey[],
  strip: readonly SlideKey[],
  id: SlideKey,
  index: number,
): SlideKey[] {
  const inStrip = order.filter((s) => strip.includes(s));
  const from = inStrip.indexOf(id);
  if (from < 0) return [...order];
  inStrip.splice(from, 1);
  inStrip.splice(Math.max(0, Math.min(inStrip.length, index)), 0, id);
  let k = 0;
  return order.map((s) => (strip.includes(s) ? (inStrip[k++] ?? s) : s));
}

export function startFilmstrip(ctx: LiveContext, snack: Snackbar): void {
  const { band, store } = ctx;
  const strip = band.querySelector<HTMLElement>('[data-filmstrip]');
  const stage = band.querySelector<HTMLElement>('[data-stage]');
  if (strip === null) return;
  const thumbs = [...strip.querySelectorAll<HTMLElement>('[data-thumb]')];
  const ids = thumbs.map((t) => t.dataset['thumb'] as SlideKey);
  const thumbOf = (id: SlideKey): HTMLElement | undefined =>
    thumbs.find((t) => t.dataset['thumb'] === id);
  const visible = (): HTMLElement[] => {
    const order = store.get().order;
    return order.flatMap((id) => {
      const t = thumbOf(id);
      return t !== undefined && !t.hidden ? [t] : [];
    });
  };
  for (const t of thumbs) if (t.tabIndex < 0) t.tabIndex = 0;
  for (const t of thumbs) {
    if (t.querySelector('[data-thumb-move]') !== null) continue;
    const moves = document.createElement('span');
    moves.className = 'ts-home-thumb-moves';
    for (const dir of ['up', 'down'] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pt-ib pt-icon ts-thumb-move';
      b.dataset['thumbMove'] = dir;
      b.tabIndex = -1;
      b.setAttribute('aria-label', dir === 'up' ? TAILOR.moveUp : TAILOR.moveDown);
      b.append(glyph(HOME_GLYPHS[dir === 'up' ? 'bars-arrow-up' : 'bars-arrow-down']));
      moves.append(b);
    }
    t.append(moves);
  }

  // ---- the stage shows the chosen slide (a cut) ----
  const stageSlide = stage?.querySelector<HTMLElement>('[data-home-slides]')?.dataset['slide'];
  let chosen: SlideKey = (stageSlide as SlideKey | undefined) ?? ids[0] ?? 'plan';
  const choose = (id: SlideKey): void => {
    chosen = id;
    for (const t of thumbs) {
      const on = t.dataset['thumb'] === id;
      t.toggleAttribute('data-selected', on);
      t.setAttribute('aria-current', String(on));
    }
    const shown = stage?.querySelector<HTMLElement>('[data-home-slides]');
    const source = thumbOf(id)?.querySelector<HTMLElement>('[data-home-slides]');
    if (shown === null || shown === undefined || source === null || source === undefined) return;
    if (shown.dataset['slide'] === id) return;
    // a fresh root of the slide as the build wrote it, with the deck's state drawn on it (a clone
    // of the thumbnail would carry the thumbnail's drawn poses as if they were its rest)
    const clone =
      cloneSlide(id, store.get(), 'tailor-stage') ?? (source.cloneNode(true) as HTMLElement);
    clone.dataset['instance'] = 'tailor-stage';
    for (const el of clone.querySelectorAll('[id]')) el.removeAttribute('id');
    shown.replaceWith(clone);
    paintSlide(clone, store.get());
    // the stage changes by a cut (3.6 T6): the renderer's slide cut ends at once
    settleCuts(clone);
  };
  choose(chosen);

  // ---- a move: one change of the order ----
  const placeOf = (id: SlideKey): number => store.get().order.indexOf(id) + 1;
  const move = (id: SlideKey, index: number): void => {
    const before = store.get().order;
    const from = placeOf(id);
    const next = reorder(before, ids, id, index);
    if (next.every((s, i) => s === before[i])) return;
    const to = next.indexOf(id) + 1;
    const stripFrom = before.filter((s) => ids.includes(s)).indexOf(id);
    store.commit({
      band: 'tailor',
      author: 'you',
      words: HISTORY.slideMoved(from, to),
      slide: id,
      next: (s) => ({ ...s, order: reorder(s.order, ids, id, index) }),
      undo: (s) => ({ ...s, order: reorder(s.order, ids, id, stripFrom) }),
    });
    // the move's sentence takes the snackbar's row with its Undo, the pointer path back
    snack.show(ANNOUNCE.slideMoved(from, to));
  };
  const step = (thumb: HTMLElement, by: number): void => {
    const list = visible();
    const i = list.indexOf(thumb);
    if (i < 0) return;
    move(thumb.dataset['thumb'] as SlideKey, i + by);
  };

  // ---- drawing the order: the thumbnails take their places (FLIP) ----
  let flipNext = true;
  const arrange = (state: HomeDeckState): void => {
    const shown = new Map(thumbs.map((t) => [t, t.getBoundingClientRect()]));
    const want = state.order.flatMap((id) => {
      const t = thumbOf(id);
      return t === undefined ? [] : [t];
    });
    const current = [...strip.querySelectorAll<HTMLElement>('[data-thumb]')];
    if (want.every((t, i) => current[i] === t)) return;
    // moveBefore keeps a moved slide's state, so the renderer's slide cut does not play again
    for (const t of want) {
      const parent = t.parentElement as
        (HTMLElement & { moveBefore?: (n: Node, r: Node | null) => void }) | null;
      if (parent === null) continue;
      if (typeof parent.moveBefore === 'function') parent.moveBefore(t, null);
      else parent.append(t);
    }
    settleCuts(strip);
    if (!flipNext) return;
    for (const t of want) {
      const a = shown.get(t);
      const b = t.getBoundingClientRect();
      if (a === undefined || t.hidden || a.width === 0) continue;
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      play(
        t,
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        'settle',
        'arrive',
        'tailor',
      );
    }
  };

  store.subscribe((state, event) => {
    arrange(state);
    if (!state.order.includes(chosen)) choose(visible()[0]?.dataset['thumb'] as SlideKey);
    if (event.change.band === 'tailor' && event.kind === 'undo') finishBand('tailor');
  });

  // ---- pointer: click to show, drag to move, a press on touch ----
  type Lift = {
    thumb: HTMLElement;
    pointer: number;
    x0: number;
    y0: number;
    rects: DOMRect[];
    list: HTMLElement[];
    from: number;
    to: number;
    on: boolean;
    touch: boolean;
    timer: number;
  };
  let lift: Lift | null = null;

  const startLift = (g: Lift): void => {
    g.on = true;
    // the 2 px outline in --pt-select is selection.css's `.ts-home-thumb[data-lifted]`; the chosen
    // slide's ink edge and its Move row step aside while it is held (the drop chooses it again)
    g.thumb.removeAttribute('data-selected');
    g.thumb.setAttribute('data-lifted', '');
    const st = g.thumb.style;
    st.position = 'relative';
    st.zIndex = '2';
    st.cursor = 'grabbing';
    // the outline drawn over the slide itself: the thumbnail's edge rule paints under the slide
    // while home.css stacks the slide at z-index 1 (l2.md Q11), and a held slide must read lifted
    const sheet = (
      g.thumb.querySelector<HTMLElement>('.ts-home-sheet') ?? g.thumb
    ).getBoundingClientRect();
    const home = g.thumb.getBoundingClientRect();
    const ring = document.createElement('span');
    ring.setAttribute('data-live-overlay', '');
    ring.setAttribute('data-lift-ring', '');
    ring.setAttribute('aria-hidden', 'true');
    Object.assign(ring.style, {
      position: 'absolute',
      left: `${sheet.left - home.left}px`,
      top: `${sheet.top - home.top}px`,
      width: `${sheet.width}px`,
      height: `${sheet.height}px`,
      boxSizing: 'border-box',
      border: '2px solid var(--pt-select)',
      zIndex: '3',
      pointerEvents: 'none',
    });
    g.thumb.append(ring);
    try {
      strip.setPointerCapture(g.pointer);
    } catch {
      /* capture is optional */
    }
  };
  const endLift = (g: Lift): void => {
    g.thumb.removeAttribute('data-lifted');
    g.thumb.querySelector('[data-lift-ring]')?.remove();
    for (const p of ['position', 'z-index', 'cursor', 'transform', 'transition'])
      g.thumb.style.removeProperty(p);
  };

  strip.addEventListener('pointerdown', (e) => {
    const thumb = (e.target as Element).closest<HTMLElement>('[data-thumb]');
    if (thumb === null || e.button !== 0 || (e.target as Element).closest('[data-thumb-move]'))
      return;
    finishBand('tailor');
    const list = visible();
    const g: Lift = {
      thumb,
      pointer: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      rects: list.map((t) => t.getBoundingClientRect()),
      list,
      from: list.indexOf(thumb),
      to: list.indexOf(thumb),
      on: false,
      touch: e.pointerType === 'touch',
      timer: 0,
    };
    lift = g;
    // the press keeps its native focus (a click focuses the thumbnail without a focus ring, so
    // Cmd or Ctrl with Up or Down moves it next); text selection and the native drag are refused
    if (g.touch) g.timer = window.setTimeout(() => lift === g && !g.on && startLift(g), PRESS_MS);
  });
  strip.addEventListener('selectstart', (e) => e.preventDefault());
  strip.addEventListener('dragstart', (e) => e.preventDefault());

  strip.addEventListener('pointermove', (e) => {
    const g = lift;
    if (g === null || e.pointerId !== g.pointer) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.on) {
      if (g.touch) {
        if (Math.hypot(dx, dy) > SWIPE_PX) {
          window.clearTimeout(g.timer);
          lift = null;
        }
        return;
      }
      if (Math.hypot(dx, dy) < LIFT_PX) return;
      startLift(g);
    }
    g.thumb.style.transform = `translate(${dx}px, ${dy}px)`;
    const r0 = g.rects[g.from];
    if (r0 === undefined) return;
    const cx = r0.left + r0.width / 2 + dx;
    const cy = r0.top + r0.height / 2 + dy;
    let best = Number.POSITIVE_INFINITY;
    for (const [i, r] of g.rects.entries()) {
      const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      if (d < best) {
        best = d;
        g.to = i;
      }
    }
    const room = ms('row');
    for (const [i, t] of g.list.entries()) {
      if (t === g.thumb) continue;
      let j = i;
      if (g.from < g.to && i > g.from && i <= g.to) j = i - 1;
      if (g.from > g.to && i < g.from && i >= g.to) j = i + 1;
      const a = g.rects[i];
      const b = g.rects[j];
      if (a === undefined || b === undefined) continue;
      t.style.transition = room > 0 ? `transform ${room}ms ${ease('arrive')}` : 'none';
      t.style.transform = j === i ? '' : `translate(${b.left - a.left}px, ${b.top - a.top}px)`;
    }
  });
  strip.addEventListener(
    'touchmove',
    (e) => {
      if (lift?.on === true) e.preventDefault();
    },
    { passive: false },
  );

  const drop = (e: PointerEvent): void => {
    const g = lift;
    if (g === null || e.pointerId !== g.pointer) return;
    window.clearTimeout(g.timer);
    lift = null;
    if (!g.on) {
      if (e.type === 'pointerup') choose(g.thumb.dataset['thumb'] as SlideKey);
      return;
    }
    const held = g.thumb.getBoundingClientRect();
    for (const t of g.list) {
      t.style.removeProperty('transition');
      t.style.removeProperty('transform');
    }
    endLift(g);
    flipNext = false;
    if (g.to !== g.from) move(g.thumb.dataset['thumb'] as SlideKey, g.to);
    flipNext = true;
    const home = g.thumb.getBoundingClientRect();
    play(
      g.thumb,
      [
        { transform: `translate(${held.left - home.left}px, ${held.top - home.top}px)` },
        { transform: 'none' },
      ],
      'settle',
      'arrive',
      'tailor',
    );
    choose(g.thumb.dataset['thumb'] as SlideKey);
  };
  strip.addEventListener('pointerup', drop);
  strip.addEventListener('pointercancel', drop);

  // ---- keys and the single pointer path ----
  strip.addEventListener('keydown', (e) => {
    const thumb = (e.target as Element).closest<HTMLElement>('[data-thumb]');
    if (thumb === null || (e.target as Element).closest('[data-thumb-move]')) return;
    const id = thumb.dataset['thumb'] as SlideKey;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      finishBand('tailor');
      step(thumb, e.key === 'ArrowUp' ? -1 : 1);
      choose(id);
      thumb.focus({ preventScroll: true });
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && !thumb.matches('button')) {
      e.preventDefault();
      choose(id);
    }
  });
  strip.addEventListener('click', (e) => {
    const button = (e.target as Element).closest<HTMLElement>('[data-thumb-move]');
    const thumb = button?.closest<HTMLElement>('[data-thumb]');
    if (button === null || thumb === null || thumb === undefined) return;
    e.preventDefault();
    finishBand('tailor');
    step(thumb, button.dataset['thumbMove'] === 'up' ? -1 : 1);
    choose(thumb.dataset['thumb'] as SlideKey);
    button.focus({ preventScroll: true });
  });
}
