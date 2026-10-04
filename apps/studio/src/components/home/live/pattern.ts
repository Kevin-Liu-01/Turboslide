import { homeAsset } from '../assets';
import { rgbaOf } from './field';
import type { LiveContext } from './index';
import { installGuards, loop, motionPaused, onFrame, onMotionChange, reduced } from './motion';
import type { PatternMount, ShaderColor } from './pattern-mount';

/**
 * The patterns band (docs/LANDING.md 2.13, 3.4 P-T, 4.2; B's animated patterns band). V4's file,
 * the band's chunk entry. Slide 8 twice, side by side: on the right the slide as `renderSlide`
 * draws it with the still frame the exporter stores for its Animated pattern (the role
 * `pattern-still` of the shown appearance, the capture's own pixels), and on the left the same
 * markup whose picture is the live shader (`live/pattern-mount.ts`, a chunk of its own) in the
 * slide's ink and paper, so the appearance and a kit restyle it.
 *
 * Nothing is requested before the band comes within one viewport height (4.2): then the still
 * frames, and, while motion is allowed, the shader chunk. Under reduced motion or with Pause Motion
 * pressed the chunk is not requested and both sides draw the still frame. The shader is the loop
 * P-T, a demonstration: it moves at the recipe's speed while the band is at least half in view and
 * the scheduler picks it, and holds its frame (speed 0, no frame) otherwise.
 *
 * `mountPattern` gives V3's show the same shader on slide 8's clone once the chunk has loaded,
 * through `window.tsHomePattern` (v3.md R11), so the show never imports this module.
 */

type Chunk = typeof import('./pattern-mount');

let chunk: Chunk | null = null;
let requested: Promise<Chunk | null> | null = null;

/** The shader chunk, imported once; null when it does not load. */
function requestChunk(): Promise<Chunk | null> {
  requested ??= import('./pattern-mount').then(
    (module) => (chunk = module),
    (error: unknown) => {
      console.error('the pattern chunk did not load', error);
      return null;
    },
  );
  return requested;
}

/** The slide's paper and ink as the shader takes them, read where the picture sits. */
function colorsOf(el: Element): { paper: ShaderColor; ink: ShaderColor } {
  const style = getComputedStyle(el);
  const vec = (value: string): ShaderColor => {
    const [r, g, b, a] = rgbaOf(value);
    return [r / 255, g / 255, b / 255, a / 255];
  };
  const paper = style.getPropertyValue('--paper').trim() || style.getPropertyValue('--pt-paper');
  const ink = style.getPropertyValue('--ink').trim() || style.getPropertyValue('--pt-ink');
  return { paper: vec(paper.trim() || '#fff'), ink: vec(ink.trim() || '#000') };
}

/** The shader's canvas covers the still frame once it has drawn a frame (two frames later). */
function revealWhenDrawn(box: HTMLElement): void {
  let frames = 0;
  const stop = onFrame(() => {
    frames += 1;
    if (frames < 2) return;
    stop();
    box.setAttribute('data-pattern-live', '');
  });
}

/**
 * Slide 8's pattern moving on a clone the show draws (V3's request R14): null when the shader
 * chunk has not loaded, under reduced motion or with Pause Motion pressed, so the clone keeps its
 * still frame; it never requests the chunk itself.
 */
export function mountPattern(slide: HTMLElement): { stop(): void } | null {
  if (chunk === null || reduced() || motionPaused()) return null;
  const box = slide.querySelector<HTMLElement>('[data-field="pattern"]');
  if (box === null) return null;
  const mount = chunk.createPatternMount(box, colorsOf(box));
  revealWhenDrawn(box);
  mount.play();
  return {
    stop() {
      mount.dispose();
      box.removeAttribute('data-pattern-live');
    },
  };
}

declare global {
  interface Window {
    /** interface merging: the show's doorway to the pattern (v3.md R11), set when this module loads */
    tsHomePattern?: { mount(slide: HTMLElement): { stop(): void } | null };
  }
}

/* the show calls the pattern through the window, so the present band's chunk never imports this
   module (v3.md R11) */
if (typeof window !== 'undefined') window.tsHomePattern = { mount: mountPattern };

/** The still frame's two files on the band, which motion.css draws by the appearance. */
function setStills(band: HTMLElement): void {
  for (const appearance of ['light', 'dark'] as const) {
    try {
      const { path } = homeAsset('pattern-still', appearance);
      band.style.setProperty(`--ts-pattern-still-${appearance}`, `url("${path}")`);
    } catch {
      /* the build has not written the role: the box keeps the slide's print */
      return;
    }
  }
  band.setAttribute('data-pattern-stills', '');
}

/** Runs `fn` once when `el` comes within one viewport height of the visible area (4.2). */
function whenNear(el: Element, fn: () => void): void {
  const near = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      near.disconnect();
      fn();
    },
    { rootMargin: '100% 0px' },
  );
  near.observe(el);
}

/** A clone of the right slide for the left box, when the build did not fill the left itself. */
function leftSlide(moving: HTMLElement, right: HTMLElement): HTMLElement {
  const found = moving.querySelector<HTMLElement>('[data-home-slides]');
  if (found !== null) return found;
  const clone = right.cloneNode(true) as HTMLElement;
  clone.dataset['instance'] = 'patterns-moving';
  for (const node of clone.querySelectorAll('[id]')) node.removeAttribute('id');
  (moving.querySelector<HTMLElement>('.ts-home-sheet') ?? moving).append(clone);
  return clone;
}

export function start(ctx: LiveContext): void {
  installGuards();
  const band = ctx.band;
  const still = band.querySelector<HTMLElement>('[data-pattern="still"]');
  const moving = band.querySelector<HTMLElement>('[data-pattern="moving"]');
  if (still == null || moving == null) return;
  const right = still.querySelector<HTMLElement>('[data-home-slides]');
  if (right === null) return;
  const left = leftSlide(moving, right);
  /* the left draws the same words as the right, which carries them for assistive technology */
  left.setAttribute('aria-hidden', 'true');
  const box = left.querySelector<HTMLElement>('[data-field="pattern"]');
  if (box === null) return;
  /* the field printer's canvas has no use under the shader */
  box.querySelector(':scope > canvas')?.remove();

  let near = false;
  let running = false;
  let mount: PatternMount | null = null;
  const ensure = (): void => {
    if (mount !== null || !near || reduced() || motionPaused()) return;
    void requestChunk().then((loaded) => {
      if (loaded === null || mount !== null || reduced()) return;
      mount = loaded.createPatternMount(box, colorsOf(box));
      revealWhenDrawn(box);
      if (running && !motionPaused()) mount.play();
    });
  };
  whenNear(band, () => {
    near = true;
    setStills(band);
    ensure();
  });
  onMotionChange(ensure);

  /* a kit or an appearance change restyles the shader (the still frame is the export's) */
  const recolor = (): void => {
    if (mount === null) return;
    const { paper, ink } = colorsOf(box);
    mount.recolor(paper, ink);
  };
  new MutationObserver(recolor).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  new MutationObserver(recolor).observe(left, { attributes: true, attributeFilter: ['style'] });
  const main = document.querySelector('main');
  if (main !== null)
    new MutationObserver(recolor).observe(main, {
      attributes: true,
      attributeFilter: ['data-page-kit'],
    });

  const pair = ctx.reserve ?? moving.parentElement ?? band;
  loop('patterns', pair, {
    kind: 'demonstration',
    play() {
      running = true;
      ensure();
      mount?.play();
    },
    pause() {
      running = false;
      mount?.pause();
    },
    still() {
      running = false;
      mount?.still();
    },
  });
}
