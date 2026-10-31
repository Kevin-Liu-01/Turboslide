import { useRef } from 'react';

import { GT_COVER } from '@turboslide/theme/brand/site';

import { REDUCED_MOTION, inkOf, onAppearance } from '../components/site/cells';
import type { Rgb } from '../components/site/cells';
import { LENS_RADIUS, cellFor, cellsOf, fadeAt, lensAt } from '../components/site/field';
import type { Rect } from '../components/site/field';
import { useMountEffect } from '../components/useMountEffect';

/**
 * The calls the start band's three tiles stand for, in the agent surface's HTTP form (AGENTS.md
 * "The agent surface"): Blank presentation and GT brand deck are `deck.create`, Template gallery
 * reads `template.list`. A tile's plate carries `data-field-call` with its index here.
 */
export const FIELD_CALLS = [
  { id: 'deck.create', input: { name: 'Untitled presentation', from: 'blank' } },
  { id: 'deck.create', input: { name: 'GT brand deck', from: GT_COVER.deck } },
  { id: 'template.list', input: {} },
] as const;

/** One call as the field sets it: `POST /api/actions/<id> <input>` and a space. */
export function callText(call: (typeof FIELD_CALLS)[number]): string {
  return `POST /api/actions/${call.id} ${JSON.stringify(call.input)} `;
}

/** The texts the cells draw: each tile's call, then the three calls in a row for the ground. */
export const CALL_TEXTS: readonly string[] = FIELD_CALLS.map(callText);
export const FIELD_SOURCE: string = CALL_TEXTS.join('');

/** The field's type: Katagami Mono at 10 px, a cell of 6.25 by 12.5 px. */
export const FIELD_PX = 10;
export const FIELD_CELL = cellFor(FIELD_PX);

/** The ink of a cell at rest: the ground's everywhere, more within a tile's reach. */
export const FIELD_INK = { ground: 0.1, tile: 0.36, revealed: 0.66 } as const;

/** How far a tile's call reaches from its plate, across and down, in px. */
export const FIELD_REACH = { x: 168, y: 56 } as const;

/** The share of the band's rows drawn at full ink before the field fades into the list. */
export const FIELD_SOLID = 0.55;

/**
 * A tile's pull on a point `dx` and `dy` px outside its plate: 1 at the plate's edge, easing to
 * 0 at FIELD_REACH, measured on the ellipse the reach draws.
 */
export function reachAt(dx: number, dy: number): number {
  const d = Math.hypot(dx / FIELD_REACH.x, dy / FIELD_REACH.y);
  if (d >= 1) return 0;
  return 1 - d * d * (3 - 2 * d);
}

/** A cell's ink: its rest ink, lifted toward legible by the lens's strength (0 to 1). */
export function inkAt(rest: number, lens: number): number {
  return rest + (Math.max(rest, FIELD_INK.revealed) - rest) * lens;
}

/** The device pixel ratio the field draws at, at most 2. */
const MAX_DPR = 2;
/** How far the lens moves toward the pointer each frame (1 under reduced motion). */
const EASE = 0.28;
const FAR = { x: -1e4, y: -1e4 } as const;
/** a cell a plate covers or a name keeps clear */
const HIDDEN = -2;
/** a cell of the ground, out of every tile's reach */
const GROUND = -1;

type Grid = {
  cols: number;
  rows: number;
  dpr: number;
  /** each cell's ink at rest, through the fade */
  rest: Float32Array;
  /** each cell's text: a tile's index into CALL_TEXTS, GROUND or HIDDEN */
  owner: Int8Array;
};

/**
 * The ground of /decks' start band (Kevin, 2026-10-30: "a full width interactive experience with
 * ascii in the background"; "exercise abstract thinking"): one canvas filling the band, set in
 * Katagami Mono in the calls the band's tiles make. Around each tile's plate the cells spell that
 * tile's call and ink darker, so the Blank presentation tile sits in `deck.create` from `blank`,
 * the GT brand deck in `deck.create` from `gt-brand` and the gallery in `template.list`; the rest
 * of the band is a faint ground of the three calls. A lens under the pointer inks every cell, so
 * the call reads where the pointer is: what a click on the tile does, as an agent sends it. The
 * lens and the cell geometry are the site's (components/site/field.ts), so the landing and this
 * band draw one way.
 *
 * The canvas is decorative (`aria-hidden`): the tiles carry the names and the controls, and the
 * calls are the agent surface's own. It draws once per size, appearance and font, and after that
 * only the cells under the lens, only while the lens moves, so the page idles at zero. It is
 * absolutely placed inside the band, whose height its tiles set, so its arrival moves nothing; it
 * fades in once drawn. A plate (`data-field-call`) hides the cells under it and a name
 * (`data-field-clear`) keeps its cells paper.
 */
export function DecksField() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useMountEffect(() => {
    const node = canvas.current;
    const host = node?.parentElement ?? null;
    const g = node?.getContext('2d', { alpha: true }) ?? null;
    if (node === null || host === null || g === null) return undefined;
    const reduced = window.matchMedia(REDUCED_MOTION);
    const cell = FIELD_CELL;
    let grid: Grid | null = null;
    let ink: Rgb = inkOf(host);
    let family = monoOf(host);
    let ready = false;
    let frame = 0;
    let pending = 0;
    let cancelled = false;
    /* the lens: where it is drawn and where it heads */
    let lens: { x: number; y: number } = { ...FAR };
    let goal: { x: number; y: number } = { ...FAR };
    let drawn: { x: number; y: number } = { ...FAR };

    const build = (): void => {
      const box = host.getBoundingClientRect();
      if (!ready || box.width === 0 || box.height === 0) return;
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      const cols = Math.max(1, Math.ceil(box.width / cell.w));
      const rows = Math.max(1, Math.ceil(box.height / cell.h));
      node.width = Math.round(cols * cell.w * dpr);
      node.height = Math.round(rows * cell.h * dpr);
      node.style.width = `${cols * cell.w}px`;
      node.style.height = `${rows * cell.h}px`;
      const relative = (el: Element): Rect => {
        const r = el.getBoundingClientRect();
        return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
      };
      const tiles = [...host.querySelectorAll<HTMLElement>('[data-field-call]')]
        .map((el) => ({ rect: relative(el), call: Number(el.dataset.fieldCall) }))
        .filter((tile) => tile.rect.w > 0 && CALL_TEXTS[tile.call] !== undefined);
      const rest = new Float32Array(cols * rows);
      const owner = new Int8Array(cols * rows).fill(GROUND);
      for (let row = 0; row < rows; row += 1) {
        const y = row * cell.h + cell.h / 2;
        /* the band fades in under the bar over its first rows and out into the list */
        const fade = fadeAt(row, rows, FIELD_SOLID) * Math.min(1, (row + 1) / 3);
        for (let col = 0; col < cols; col += 1) {
          const x = col * cell.w + cell.w / 2;
          const i = row * cols + col;
          let pull = 0;
          for (const { rect, call } of tiles) {
            const dx = Math.max(rect.x - x, 0, x - rect.x - rect.w);
            const dy = Math.max(rect.y - y, 0, y - rect.y - rect.h);
            if (dx === 0 && dy === 0) {
              owner[i] = HIDDEN;
              break;
            }
            const at = reachAt(dx, dy);
            if (at > pull) {
              pull = at;
              owner[i] = call;
            }
          }
          if (owner[i] === HIDDEN) continue;
          if (pull < 0.02) owner[i] = GROUND;
          rest[i] = (FIELD_INK.ground + (FIELD_INK.tile - FIELD_INK.ground) * pull) * fade;
        }
      }
      for (const el of host.querySelectorAll<HTMLElement>('[data-field-clear]')) {
        const r = relative(el);
        if (r.w === 0) continue;
        const pad = 6;
        const c = cellsOf(
          { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad },
          { cols, rows },
          cell,
        );
        for (let row = c.r0; row < c.r1; row += 1)
          owner.fill(HIDDEN, row * cols + c.c0, row * cols + c.c1);
      }
      grid = { cols, rows, dpr, rest, owner };
      drawCells(0, 0, cols, rows);
      node.dataset.ready = '';
    };

    /** Draws the cells of a block of the grid, after clearing it. */
    const drawCells = (c0: number, r0: number, c1: number, r1: number): void => {
      if (grid === null) return;
      const { cols, dpr, rest, owner } = grid;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(c0 * cell.w, r0 * cell.h, (c1 - c0) * cell.w, (r1 - r0) * cell.h);
      g.font = `400 ${FIELD_PX}px ${family}`;
      g.textBaseline = 'middle';
      g.textAlign = 'center';
      const [r, gr, b] = ink;
      let last = -1;
      for (let row = r0; row < r1; row += 1) {
        const y = row * cell.h + cell.h / 2;
        for (let col = c0; col < c1; col += 1) {
          const i = row * cols + col;
          const who = owner[i] ?? HIDDEN;
          if (who === HIDDEN) continue;
          const x = col * cell.w + cell.w / 2;
          const alpha = inkAt(rest[i] ?? 0, lensAt(Math.hypot(x - lens.x, y - lens.y)));
          if (alpha <= 0.01) continue;
          const step = Math.round(alpha * 20);
          if (step !== last) {
            g.fillStyle = `rgb(${r} ${gr} ${b} / ${step / 20})`;
            last = step;
          }
          const text = who === GROUND ? FIELD_SOURCE : (CALL_TEXTS[who] ?? FIELD_SOURCE);
          g.fillText(text[i % text.length] ?? ' ', x, y);
        }
      }
    };

    /** Draws again the cells the lens covered and now covers. */
    const drawLens = (): void => {
      if (grid === null) return;
      const reach = LENS_RADIUS + cell.w;
      /* a lens that moved a little draws the box around both places once; one that jumped
         across the band draws its two places, not the band between them */
      const places = near(drawn, lens, reach)
        ? [
            {
              x: Math.min(drawn.x, lens.x) - reach,
              y: Math.min(drawn.y, lens.y) - reach,
              w: Math.abs(drawn.x - lens.x) + 2 * reach,
              h: Math.abs(drawn.y - lens.y) + 2 * reach,
            },
          ]
        : [drawn, lens].map((at) => ({
            x: at.x - reach,
            y: at.y - reach,
            w: 2 * reach,
            h: 2 * reach,
          }));
      for (const place of places) {
        const c = cellsOf(place, grid, cell);
        drawCells(c.c0, c.r0, c.c1, c.r1);
      }
      drawn = { ...lens };
    };

    const tick = (): void => {
      frame = 0;
      const k = reduced.matches ? 1 : EASE;
      lens = { x: lens.x + (goal.x - lens.x) * k, y: lens.y + (goal.y - lens.y) * k };
      if (Math.hypot(goal.x - lens.x, goal.y - lens.y) < 0.5) lens = { ...goal };
      drawLens();
      if (lens.x !== goal.x || lens.y !== goal.y) frame = window.requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent): void => {
      if (grid === null || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
      const box = host.getBoundingClientRect();
      const at = { x: event.clientX - box.left, y: event.clientY - box.top };
      /* the lens enters at the pointer instead of sweeping in from where it last left */
      if (goal.x < -1e3) lens = { ...at };
      goal = at;
      if (frame === 0) frame = window.requestAnimationFrame(tick);
    };
    const onLeave = (): void => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      goal = { ...FAR };
      lens = { ...FAR };
      drawLens();
    };

    const rebuild = (): void => {
      window.cancelAnimationFrame(pending);
      pending = window.requestAnimationFrame(() => {
        if (!cancelled) build();
      });
    };
    const resize = new ResizeObserver(rebuild);
    resize.observe(host);
    const stopAppearance = onAppearance(() => {
      ink = inkOf(host);
      rebuild();
    });
    host.addEventListener('pointermove', onMove, { passive: true });
    host.addEventListener('pointerleave', onLeave);

    /* the face first (Katagami Mono is not preloaded on /decks), then the first draw */
    void document.fonts
      .load(`${FIELD_PX}px ${family}`)
      .catch(() => [])
      .then(() => {
        if (cancelled) return;
        ready = true;
        family = monoOf(host);
        build();
      });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(pending);
      resize.disconnect();
      stopAppearance();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
    };
  });
  return <canvas ref={canvas} className="ts-decks-field" aria-hidden="true" />;
}

/** The monospace stack the page points `--pt-mono` at (decks.css): Katagami Mono on /decks. */
function monoOf(element: Element): string {
  return getComputedStyle(element).getPropertyValue('--pt-mono').trim() || 'monospace';
}

/** Whether the boxes of two lens places, `reach` from each centre, overlap. */
function near(a: { x: number; y: number }, b: { x: number; y: number }, reach: number): boolean {
  return Math.abs(a.x - b.x) < 2 * reach && Math.abs(a.y - b.y) < 2 * reach;
}
