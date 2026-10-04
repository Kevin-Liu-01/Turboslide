import { HOME_DECK } from '../deck.generated';
import { startCanvasField, startInterludes } from './field';
import { startHero } from './hero';
import { hintInView } from './motion';
import { startObjects } from './objects';
import { startStage } from './stage';
import { paintSlide, paintSlides } from './paint';
import { createHomeStore, restState, sourceOf, UNDO_BANDS } from './state';
import type { HomeDeckState, HomeStore, SlideKey, UndoBand } from './state';

/**
 * The live core's entry (docs/LANDING.md 4.2, 6.1, 6.3 "The band loader"; integrator.md 4.6): the
 * route imports it after `load` and one idle callback and calls `startLive(main)`. It creates the
 * page deck's one store, draws the store's state on every slide of the page on every change
 * (`paint.ts`), starts the first screen's registrations, and loads each band below the first
 * screen when the band comes within two viewport heights: the core imports the band's markup
 * (`bands.generated.ts`, V1's) and its entries once, writes each `[data-fill]` of the band's
 * reserved box, draws the deck's state on the slides it inserted, marks the box `data-filled` and
 * starts the band's entries. One registration or entry failing is caught and the others start.
 * V2 owns this file; V3 and V4 add their lines in push order (LANDING.md 6.4).
 */

export type LiveContext = {
  /** `main#top` */
  root: HTMLElement;
  /** the `section[data-band]` the registration names */
  band: HTMLElement;
  store: HomeStore;
  /** writes the band's polite live region (`[data-announce]`) */
  announce(text: string): void;
  /** the band's reserved box, filled by the loader before the entry starts; null in the first screen */
  reserve: HTMLElement | null;
};

/** The bands of the page (LANDING.md 6.3 "The DOM"); `field` is the first pass's strip until V4#18. */
export type BandId =
  | 'hero'
  | 'numbers'
  | 'field'
  | 'menus'
  | 'canvas'
  | 'tailor'
  | 'kits'
  | 'agents'
  | 'people'
  | 'present'
  | 'export'
  | 'patterns'
  | 'features'
  | 'close';

export type Registration = { band: BandId; start(ctx: LiveContext): void };

/** One entry of a band below the first screen: the module it imports and the start it exports. */
export type BandModule = { start(ctx: LiveContext): void };

/**
 * The first screen's registrations, started with the core (4.1: the frame's selection, H5, the
 * hero's loop). V1 adds the frame's filmstrip and loop (`stage.ts`) and V4 its lines here.
 */
const REGISTRATIONS: readonly Registration[] = [
  { band: 'hero', start: (ctx) => void startObjects(ctx, 'hero') },
  { band: 'hero', start: startStage },
  { band: 'hero', start: startHero },
  { band: 'hero', start: (ctx) => startInterludes(ctx.root) },
];

const entries = new Map<BandId, (() => Promise<BandModule>)[]>();

/**
 * Registers one entry of a band below the first screen (6.3). The loader imports every entry of a
 * band together when the band nears and starts them in the order they were registered.
 */
export function registerBand(band: BandId, load: () => Promise<BandModule>): void {
  const list = entries.get(band) ?? [];
  list.push(load);
  entries.set(band, list);
}

/* The bands below the first screen, in the page's order (2.0). The core holds only the first
   screen's code (4.1: the store, the motion system, the frame's selection, H5, the field printer,
   the loader): every band's own code is a chunk of its own, imported when the band nears, and the
   canvas band's two starts are the core's objects and field printer (6.4: V3 and V4 add theirs). */
registerBand('menus', () => import('./menus'));
registerBand('canvas', async () => ({ start: (ctx) => void startObjects(ctx, 'canvas') }));
registerBand('canvas', async () => ({ start: startCanvasField }));
registerBand('tailor', () => import('./tailor'));
registerBand('kits', () => import('./kits'));
registerBand('agents', () => import('./history').then((m) => ({ start: m.startHistory })));
registerBand('agents', () => import('./agents').then((m) => ({ start: m.startAgents })));
registerBand('agents', () => import('./versions'));
registerBand('present', () => import('./show').then((m) => ({ start: m.startShow })));
registerBand('present', () => import('./print').then((m) => ({ start: m.startPrint })));
registerBand('export', () => import('./seam').then((m) => ({ start: m.startSeam })));
registerBand('export', () =>
  import('./seam').then((m) => ({ start: (ctx) => hintInView(ctx.band, m.armHint, m.hint) })),
);
registerBand('export', () => import('./loupe').then((m) => ({ start: m.startLoupe })));
registerBand('close', () => import('./mark').then((m) => ({ start: m.startMark })));

/** How far ahead of the viewport a band's chunk is requested (4.2: two viewport heights). */
const BAND_MARGIN = '200% 0px';

const isTextField = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');

/** The band's live region; the text is cleared first so a repeated sentence is read again. */
function announcer(band: HTMLElement): (text: string) => void {
  const region = band.querySelector<HTMLElement>('[data-announce]');
  return (text) => {
    if (region === null) return;
    region.textContent = '';
    window.setTimeout(() => {
      region.textContent = text;
    }, 30);
  };
}

/**
 * The Undo rule of LANDING.md 2.0: a band's Undo button, or Cmd or Ctrl+Z while focus is inside
 * the band and not in a text field, undoes that band's newest change; in the agents, people,
 * Present, export and patterns bands, or with focus outside every band, the key does nothing. Each
 * button carries `aria-disabled` while its band has nothing to undo, so it keeps focus through its
 * last Undo. A button inserted with a band's chunk is found by delegation.
 */
function wireUndo(root: HTMLElement, store: HomeStore): void {
  const paint = (): void => {
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-undo]')) {
      const band = b.dataset['undo'] as UndoBand;
      if (!UNDO_BANDS.includes(band)) continue;
      b.disabled = false;
      const off = String(!store.canUndo(band));
      if (b.getAttribute('aria-disabled') !== off) b.setAttribute('aria-disabled', off);
    }
  };
  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-undo]');
    const band = b?.dataset['undo'] as UndoBand | undefined;
    if (band === undefined || !UNDO_BANDS.includes(band)) return;
    store.undo(band);
  });
  root.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
    if (isTextField(e.target)) return;
    const band = (e.target as Element).closest<HTMLElement>('[data-band]')?.dataset['band'];
    if (!UNDO_BANDS.includes(band as UndoBand)) return;
    e.preventDefault();
    store.undo(band as UndoBand);
  });
  store.subscribe(paint);
  paint();
  live.repaintUndo = paint;
}

/**
 * The recorded run's three Version history rows as the markup draws them at rest, oldest first
 * (each row's third cell holds its words, `HomeAgents.tsx`). Read from the page so the core does
 * not carry `run.generated.ts` for three sentences (l2.md Q9).
 */
const restRows = (root: HTMLElement): string[] =>
  [...root.querySelectorAll<HTMLElement>('[data-history-row]')]
    .map((row) => row.children[2]?.textContent?.trim() ?? '')
    .filter((words) => words !== '')
    .reverse();

// ---------------------------------------------------------------------------------------------
// Every slide of the page deck, at rest (for a band that draws a slide no band inserted yet)

/** One pristine root of each slide, recorded before anything was drawn on it. */
const pristine = new Map<string, HTMLElement>();

/** Records the slide roots under `container` that are still as the build wrote them. */
function recordPristine(container: ParentNode): void {
  for (const el of container.querySelectorAll<HTMLElement>('[data-home-slides][data-slide]')) {
    const slide = el.dataset['slide'] ?? '';
    if (slide === '' || pristine.has(slide) || el.closest('[data-live-overlay]') !== null) continue;
    pristine.set(slide, el.cloneNode(true) as HTMLElement);
  }
}

/** Registers a slide's markup at rest (the menus band's nine and its blank slide). */
export function registerSlide(slide: string, root: HTMLElement): void {
  if (!pristine.has(slide)) pristine.set(slide, root.cloneNode(true) as HTMLElement);
}

/**
 * A fresh root of slide `key` as the build wrote it, its objects renamed to the key when it is a
 * slide a menu row added; null when no instance of it was on the page yet. The caller places it in
 * the page and draws the state on it with `paintSlide`.
 */
export function cloneSlide(
  key: SlideKey,
  state: HomeDeckState,
  instance: string,
): HTMLElement | null {
  const source = sourceOf(state, key);
  const template = pristine.get(source);
  if (template === undefined) return null;
  const el = template.cloneNode(true) as HTMLElement;
  el.dataset['slide'] = key;
  el.dataset['instance'] = instance;
  for (const node of el.querySelectorAll('[id]')) node.removeAttribute('id');
  for (const node of el.querySelectorAll<HTMLElement>('[data-slide]')) node.dataset['slide'] = key;
  if (source !== key)
    for (const node of el.querySelectorAll<HTMLElement>('[data-object]')) {
      const id = node.dataset['object'] ?? '';
      node.dataset['object'] = `${key}${id.slice(id.indexOf('#'))}`;
    }
  return el;
}

export { paintSlide, paintSlides };

// ---------------------------------------------------------------------------------------------
// The band loader

type FillsModule = { FILLS: Readonly<Record<string, string>> };

/**
 * Each band's markup (V1's `bands/<band>.generated.ts`, one module a band so each travels in its
 * band's chunk alone, v2.md R2), imported when the band nears; V4 adds its bands' lines.
 */
const FILL_MODULES: Partial<Record<BandId, () => Promise<FillsModule>>> = {
  canvas: () => import('../bands/canvas.generated'),
  tailor: () => import('../bands/tailor.generated'),
  agents: () => import('../bands/agents.generated'),
  present: () => import('../bands/present.generated'),
  export: () => import('../bands/export.generated'),
  close: () => import('../bands/close.generated'),
};

const fills = (band: BandId): Promise<FillsModule | null> => {
  const load = FILL_MODULES[band];
  if (load === undefined) return Promise.resolve(null);
  return load().catch((error: unknown) => {
    console.error(`the ${band} band's markup did not load`, error);
    return null;
  });
};

/**
 * Registers the nine slides at rest (V1's `bands/deck.generated.ts` `HOME_SLIDE_MARKUP`), which a
 * band chunk that draws its own copies imports and hands here, so `cloneSlide` has every slide
 * whatever band loaded first.
 */
export function registerDeckSlides(markup: Readonly<Record<string, string>>): void {
  const template = document.createElement('template');
  for (const [slide, html] of Object.entries(markup)) {
    if (pristine.has(slide)) continue;
    // the renderer's output rendered at build into bands/deck.generated.ts, never typed text
    template.innerHTML = html;
    const root = template.content.firstElementChild;
    if (root instanceof HTMLElement) pristine.set(slide, root);
  }
}

/** The core's own state, read by the drivers and the band entries. */
const live: {
  store: HomeStore | null;
  loaded: Set<string>;
  repaintUndo: () => void;
} = { store: null, loaded: new Set(), repaintUndo: () => undefined };

/** The store, once the core started (a band entry and the drivers read it). */
export function homeStore(): HomeStore | null {
  return live.store;
}

async function loadBand(
  root: HTMLElement,
  band: HTMLElement,
  box: HTMLElement | null,
): Promise<void> {
  const id = band.dataset['band'] as BandId;
  if (live.loaded.has(id)) return;
  live.loaded.add(id);
  const store = live.store;
  if (store === null) return;
  const list = entries.get(id) ?? [];
  const [markup, modules] = await Promise.all([
    box === null ? Promise.resolve(null) : fills(id),
    Promise.all(
      list.map((load) =>
        load().catch((error: unknown) => {
          console.error(`the ${id} band's chunk did not load`, error);
          return null;
        }),
      ),
    ),
  ]);
  if (box !== null) {
    const bandFills = markup?.FILLS ?? {};
    for (const slot of box.querySelectorAll<HTMLElement>('[data-fill]')) {
      if (slot.childElementCount > 0) continue;
      const html = bandFills[slot.dataset['fill'] ?? ''];
      // the renderer's output rendered at build into bands.generated.ts, never typed text
      if (html !== undefined) slot.innerHTML = html;
    }
    recordPristine(box);
    paintSlides(box, store.get());
    box.setAttribute('data-filled', '');
  }
  const ctx: LiveContext = { root, band, store, announce: announcer(band), reserve: box };
  for (const module of modules) {
    if (module === null) continue;
    try {
      module.start(ctx);
    } catch (error) {
      console.error(`the ${id} band did not start`, error);
    }
  }
  live.repaintUndo();
}

/** Watches each band below the first screen and loads it within two viewport heights. */
function watchBands(root: HTMLElement): void {
  const boxes = new Map<Element, HTMLElement>();
  const started = new Set<string>();
  for (const box of root.querySelectorAll<HTMLElement>('[data-reserve]')) {
    const band = box.closest<HTMLElement>('[data-band]');
    if (band === null) continue;
    boxes.set(box, band);
    started.add(band.dataset['band'] ?? '');
  }
  // a band with entries and no reserved box (the first pass's markup in the document) starts now
  for (const id of entries.keys()) {
    if (started.has(id)) continue;
    const band = root.querySelector<HTMLElement>(`[data-band="${id}"]`);
    if (band !== null) void loadBand(root, band, null);
  }
  if (boxes.size === 0) return;
  if (typeof IntersectionObserver !== 'function') {
    for (const [box, band] of boxes) void loadBand(root, band, box as HTMLElement);
    return;
  }
  const seen = new IntersectionObserver(
    (records) => {
      for (const record of records) {
        if (!record.isIntersecting) continue;
        seen.unobserve(record.target);
        const band = boxes.get(record.target);
        if (band !== undefined) void loadBand(root, band, record.target as HTMLElement);
      }
    },
    { rootMargin: BAND_MARGIN },
  );
  for (const box of boxes.keys()) seen.observe(box);
}

/** Creates the store, draws it, starts the first screen and watches the bands below it. */
export function startLive(root: HTMLElement): void {
  // the bands are React's until hydration commits (`main[data-hydrated]`, home.tsx): a write to
  // them before it would be thrown away with a tree React regenerates on a mismatch
  if (!root.hasAttribute('data-hydrated')) {
    const wait = new MutationObserver(() => {
      if (!root.hasAttribute('data-hydrated')) return;
      wait.disconnect();
      startLive(root);
    });
    wait.observe(root, { attributes: true, attributeFilter: ['data-hydrated'] });
    return;
  }
  recordPristine(root);
  const store = createHomeStore(restState(HOME_DECK, restRows(root)));
  live.store = store;
  // the drivers read the page deck through the page (FOCUS.md 6.1): the state and the versions,
  // read only, as `window.tsHomeMotion` gives the motion system's (LANDING.md 3.8)
  (window as unknown as { tsHomeStore?: unknown }).tsHomeStore = {
    get: () => store.get(),
    versions: () => store.versions().map(({ state: _state, ...v }) => v),
  };
  // every slide on the page draws the deck: the kit, the names, the counters, the objects; the
  // page's own ink follows an example kit (`main[data-page-kit]`, the fields' ink, integrator.md 4.1)
  const pageKit = (state: HomeDeckState): void => {
    if (state.kit === 'gt') delete root.dataset['pageKit'];
    else if (root.dataset['pageKit'] !== state.kit) root.dataset['pageKit'] = state.kit;
  };
  store.subscribe((state, event) => {
    paintSlides(root, state, {
      names: !(event.kind === 'commit' && event.change.band === 'tailor'),
    });
    pageKit(state);
    // File > Rename: the title rows of the hero frame and the miniature follow (2.5)
    for (const el of root.querySelectorAll<HTMLElement>('[data-hero-title], [data-mini-title]'))
      if (el.textContent !== state.deckTitle) el.textContent = state.deckTitle;
  });
  paintSlides(root, store.get());
  pageKit(store.get());
  wireUndo(root, store);
  for (const registration of REGISTRATIONS) {
    const band = root.querySelector<HTMLElement>(`[data-band="${registration.band}"]`);
    if (band === null) continue;
    try {
      registration.start({ root, band, store, announce: announcer(band), reserve: null });
    } catch (error) {
      console.error(`the ${registration.band} band did not start`, error);
    }
  }
  watchBands(root);
  root.dataset['live'] = 'ready';
}
