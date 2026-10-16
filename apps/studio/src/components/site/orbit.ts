/**
 * The orbits of the landing's title (docs/SITE.md B; Kevin, 2026-10-16: "the arcs should curve
 * around the e and s"): each avatar stack sits on a circle centred on the bowl of its word's last
 * letter, the "e" of "people" and the "s" of "agents". `orbitFor` is the geometry, free of the
 * page: from the letter's ink box, the ink boxes of every other glyph of the h1, the avatars
 * already placed and the box an avatar may use, it finds the smallest circle on which the stack's
 * resting and open fans touch no glyph, and the angle the fan centres on. `layoutTitle` measures
 * the h1 in the page (each glyph's advance box from a Range, its ink from the canvas metrics of
 * the h1's own font) and writes the result to each stack as custom properties that site.css
 * reads; Title.tsx runs it after hydration, after the fonts load and at every change of the h1's
 * size, so the orbits follow every width and every wrap of the line.
 */

/** A box in page pixels, y down. */
export type Box = { x0: number; y0: number; x1: number; y1: number };

/** An avatar already placed, as a disc. */
export type Disc = { x: number; y: number; r: number };

export type OrbitInput = {
  /** the ink box of the letter the stack orbits */
  letter: Box;
  /** the ink boxes of the h1's other glyphs */
  glyphs: readonly Box[];
  /** avatars of a stack placed before this one */
  discs: readonly Disc[];
  /** the box every avatar stays inside */
  bounds: Box;
  /** how many avatars */
  n: number;
  /** an avatar's diameter in px */
  s: number;
  /** the angle the fan centres on when it has the room, in degrees counterclockwise from 3 o'clock */
  prefer: number;
};

/** A stack's orbit: its centre and radius in page pixels, the fan's middle and steps in degrees. */
export type Orbit = {
  cx: number;
  cy: number;
  r: number;
  mid: number;
  rest: number;
  open: number;
};

/** The step between two avatars at rest and with the fan open, in avatar diameters along the arc. */
export const STEP_REST = 0.62;
export const STEP_OPEN = 0.95;
/** The smallest step that still shows each face; under it the orbit grows instead. */
export const STEP_MIN = 0.5;

const RAD = Math.PI / 180;

/** The distance from a point to a box, 0 inside it. */
function boxDistance(x: number, y: number, box: Box): number {
  const dx = Math.max(box.x0 - x, 0, x - box.x1);
  const dy = Math.max(box.y0 - y, 0, y - box.y1);
  return Math.hypot(dx, dy);
}

/** The avatar centre at an angle of an orbit, in page pixels. */
export function pointAt(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  return { x: cx + r * Math.cos(deg * RAD), y: cy - r * Math.sin(deg * RAD) };
}

/** The angle of avatar `i` of `n` on a fan centred on `mid` with `step` between neighbours. */
export function angleOf(i: number, n: number, mid: number, step: number): number {
  return mid + ((n - 1) / 2 - i) * step;
}

/** The free runs of whole degrees on a circle, each as [from, to], merged across 180. */
function freeRuns(free: (deg: number) => boolean): [number, number][] {
  const runs: [number, number][] = [];
  let start: number | null = null;
  for (let deg = -180; deg <= 180; deg += 1) {
    const ok = deg < 180 && free(deg);
    if (ok && start === null) start = deg;
    if (!ok && start !== null) {
      runs.push([start, deg - 1]);
      start = null;
    }
  }
  const first = runs[0];
  const last = runs[runs.length - 1];
  if (runs.length > 1 && first && last && first[0] === -180 && last[1] === 179) {
    runs.pop();
    runs[0] = [last[0], first[1] + 360];
  }
  return runs;
}

/**
 * The orbit of one stack: the smallest radius, from just outside the letter in quarter avatar
 * steps, with a free run of the circle long enough for the fan at STEP_MIN; the fan at rest and
 * open takes STEP_REST and STEP_OPEN where the run has the room and shares the run otherwise, and
 * centres on `prefer` as far as the open fan stays in the run. When no radius has the room, the
 * radius with the longest free arc.
 */
export function orbitFor(input: OrbitInput): Orbit {
  const { letter, glyphs, discs, bounds, n, s, prefer } = input;
  const cx = (letter.x0 + letter.x1) / 2;
  const cy = (letter.y0 + letter.y1) / 2;
  const half = s / 2;
  const clear = Math.max(2, s * 0.08);
  const rho = Math.max(letter.x1 - letter.x0, letter.y1 - letter.y0) / 2;
  /* the ring between the letter and its avatars: the avatar's own 2 px paper ring and a little air */
  const ring = Math.max(4, s * 0.16);
  const r0 = rho + ring + half;
  const spans = Math.max(1, n - 1);
  let fallback: { orbit: Orbit; arc: number } | null = null;
  for (let k = 0; k <= 16; k += 1) {
    const r = r0 + k * s * 0.25;
    const free = (deg: number): boolean => {
      const { x, y } = pointAt(cx, cy, r, deg);
      if (x - half < bounds.x0 || x + half > bounds.x1) return false;
      if (y - half < bounds.y0 || y + half > bounds.y1) return false;
      /* the orbited letter is a bowl: a circle, whose box corners are empty */
      if (Math.hypot(x - cx, y - cy) < rho + half + ring - 0.5) return false;
      if (glyphs.some((glyph) => boxDistance(x, y, glyph) < half + clear)) return false;
      return !discs.some((disc) => Math.hypot(x - disc.x, y - disc.y) < half + disc.r + clear);
    };
    const runs = freeRuns(free);
    const degPer = (steps: number): number => (steps * s) / r / RAD;
    const need = spans * degPer(STEP_MIN);
    let pick: { run: [number, number]; off: number } | null = null;
    for (const run of runs) {
      const length = run[1] - run[0];
      if (length < need) continue;
      const near = Math.min(Math.max(prefer, run[0]), run[1]);
      const off = Math.abs(near - prefer);
      if (pick === null || off < pick.off) pick = { run, off };
    }
    const orbitIn = (run: [number, number]): Orbit => {
      const length = run[1] - run[0];
      const share = length / spans;
      const rest = Math.min(degPer(STEP_REST), share);
      const open = Math.max(rest, Math.min(degPer(STEP_OPEN), share));
      const reach = (spans * open) / 2;
      const mid = Math.min(Math.max(prefer, run[0] + reach), run[1] - reach);
      return { cx, cy, r, mid, rest, open };
    };
    if (pick !== null) return orbitIn(pick.run);
    for (const run of runs) {
      const arc = (run[1] - run[0]) * RAD * r;
      if (fallback === null || arc > fallback.arc) fallback = { orbit: orbitIn(run), arc };
    }
  }
  return fallback?.orbit ?? { cx, cy, r: r0, mid: prefer, rest: 0, open: 0 };
}

/** The discs of a placed stack, at rest and with its fan open, for the stacks placed after it. */
export function discsOf(orbit: Orbit, n: number, s: number): Disc[] {
  const out: Disc[] = [];
  for (const step of [orbit.rest, orbit.open])
    for (let i = 0; i < n; i += 1) {
      const { x, y } = pointAt(orbit.cx, orbit.cy, orbit.r, angleOf(i, n, orbit.mid, step));
      out.push({ x, y, r: s / 2 });
    }
  return out;
}

/** The box the open fan covers, the hover area that keeps the fan open under the pointer. */
export function fanBox(orbit: Orbit, n: number, s: number): Box {
  const box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const step of [orbit.rest, orbit.open])
    for (let i = 0; i < n; i += 1) {
      const { x, y } = pointAt(orbit.cx, orbit.cy, orbit.r, angleOf(i, n, orbit.mid, step));
      box.x0 = Math.min(box.x0, x - s / 2);
      box.y0 = Math.min(box.y0, y - s / 2);
      box.x1 = Math.max(box.x1, x + s / 2);
      box.y1 = Math.max(box.y1, y + s / 2);
    }
  return box;
}

/**
 * The angle each stack's fan centres on when site.css names none (its `--prefer`, in degrees):
 * over the right shoulder of its letter.
 */
export const PREFER: Readonly<Record<'people' | 'agents', number>> = { people: 70, agents: 50 };

/** The ink boxes of the h1's glyphs, measured: a Range per character, the canvas for the ink. */
export function measureGlyphs(h1: HTMLElement): { box: Box; node: Text; at: number }[] {
  const style = getComputedStyle(h1);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx === null) return [];
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const ink = new Map<string, TextMetrics>();
  const out: { box: Box; node: Text; at: number }[] = [];
  const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node as Text;
    const value = text.data;
    for (let at = 0; at < value.length; at += 1) {
      const ch = value[at] ?? '';
      if (ch.trim() === '') continue;
      range.setStart(text, at);
      range.setEnd(text, at + 1);
      const rect = range.getClientRects()[0];
      if (rect === undefined) continue;
      let m = ink.get(ch);
      if (m === undefined) {
        m = ctx.measureText(ch);
        ink.set(ch, m);
      }
      const base = rect.top + m.fontBoundingBoxAscent + window.scrollY;
      const left = rect.left + window.scrollX;
      out.push({
        box: {
          x0: left - m.actualBoundingBoxLeft,
          x1: left + m.actualBoundingBoxRight,
          y0: base - m.actualBoundingBoxAscent,
          y1: base + m.actualBoundingBoxDescent,
        },
        node: text,
        at,
      });
    }
  }
  return out;
}

const px = (value: number): string => `${Math.round(value * 100) / 100}px`;
const deg = (value: number): string => `${Math.round(value * 100) / 100}deg`;

/**
 * Lays out both stacks of the title in the page: the people first, then the agents clear of the
 * people's avatars. Each stack sits at its word's top right corner (site.css), so the orbit's
 * centre is written relative to that corner. Returns the orbits for the caller's reading.
 */
export function layoutTitle(h1: HTMLElement): Orbit[] {
  const glyphs = measureGlyphs(h1);
  if (glyphs.length === 0) return [];
  const section = h1.parentElement ?? h1;
  const area = section.getBoundingClientRect();
  const head = h1.getBoundingClientRect();
  let next = h1.nextElementSibling;
  while (next !== null && (next as HTMLElement).hidden) next = next.nextElementSibling;
  const below = next?.getBoundingClientRect().top ?? head.bottom + 16;
  const bounds: Box = {
    x0: area.left + window.scrollX,
    x1: area.right + window.scrollX,
    y0: area.top + window.scrollY + 4,
    y1: below + window.scrollY - 4,
  };
  const orbits: Orbit[] = [];
  const discs: Disc[] = [];
  for (const stack of h1.querySelectorAll<HTMLElement>('.site-stack')) {
    const word = stack.parentElement;
    if (word === null) continue;
    const kind = stack.dataset.stack === 'agents' ? 'agents' : 'people';
    const own = glyphs.filter((g) => word.contains(g.node));
    const letter = own[own.length - 1];
    if (letter === undefined) continue;
    const avatars = stack.querySelectorAll<HTMLElement>('.site-av');
    const n = avatars.length;
    /* the avatar's laid out width: --s is a clamp() the custom property keeps unresolved */
    const s = avatars[0]?.offsetWidth ?? 32;
    const prefer = parseFloat(getComputedStyle(stack).getPropertyValue('--prefer'));
    const orbit = orbitFor({
      letter: letter.box,
      glyphs: glyphs.filter((g) => g !== letter).map((g) => g.box),
      discs,
      bounds,
      n,
      s,
      prefer: Number.isFinite(prefer) ? prefer : PREFER[kind],
    });
    const corner = word.getBoundingClientRect();
    const ox = corner.right + window.scrollX;
    const oy = corner.top + window.scrollY;
    const hit = fanBox(orbit, n, s);
    stack.style.setProperty('--cx', px(orbit.cx - ox));
    stack.style.setProperty('--cy', px(orbit.cy - oy));
    stack.style.setProperty('--r', px(orbit.r));
    stack.style.setProperty('--mid', deg(orbit.mid));
    stack.style.setProperty('--rest', deg(orbit.rest));
    stack.style.setProperty('--open', deg(orbit.open));
    stack.style.setProperty('--hit-x', px(hit.x0 - ox - 4));
    stack.style.setProperty('--hit-y', px(hit.y0 - oy - 4));
    stack.style.setProperty('--hit-w', px(hit.x1 - hit.x0 + 8));
    stack.style.setProperty('--hit-h', px(hit.y1 - hit.y0 + 8));
    stack.dataset.orbit = '';
    orbits.push(orbit);
    discs.push(...discsOf(orbit, n, s));
  }
  return orbits;
}
