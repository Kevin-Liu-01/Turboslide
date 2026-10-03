import { homeAsset } from '../assets';
import type { HomeAssetRole } from '../assets';
import { HOME_DECK } from '../deck.generated';
import type { HomeSlideId, SheetBox } from '../deck.generated';
import type {
  BlockStyle,
  HomeDeckState,
  InsertedBlock,
  InsertedKind,
  KitId,
  ObjectKey,
  SlideKey,
} from './state';

/**
 * The page deck drawn on every slide of the page (docs/LANDING.md 1.2 item 3, 2.0 "Slides" and
 * "The page deck"). V2's file, in the live core. Every slide root on the page, whichever band holds
 * it (the hero frame and its filmstrip, the miniature, the canvas, Tailor, the kits grid, the
 * agents band, the show, the print), is the renderer's markup of one slide of the page deck, and
 * `paintSlide` draws the store's state on it: the kit and a typed background, the customer's name,
 * the counter and the skipped mark, the typed words, the Format rows' styles, the blocks a menu row
 * inserted or deleted, and the moved, resized and turned objects. It never re-renders a slide: it
 * places, clones and restyles the renderer's own markup (2.0 "Slides").
 *
 * A pose frees the slide's objects as the editor's first drag turns a slide into a canvas: each
 * object keeps its place, held by an empty spacer in the slide's flow, so a resized box never
 * pushes another; a slide with no pose left is put back. One sheet unit is one layout pixel of the
 * renderer's 1,600 by 900 stage in every instance (`HomeSheet` scales the stage by a transform), so
 * a pose in units draws the same on a thumbnail and on the stage.
 */

/** Sheet units across: 1 unit is 1/1,600 of the sheet's width (LANDING.md 2.0). */
export const UNITS = 1600;

/** The paper a moved text box draws around itself on a dithered slide, in units (integrator.md 2.2). */
export const CLEAR_ZONE = 24;

const round = (n: number): number => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------------------------
// Kits and the typed background (2.8)

export type KitColors = { paper: string; ink: string; ink2: string; titanium: string };

/** 2.8's table: Kestrel and Globex (Kevin's answer 4: an example kit may carry a customer's colour). */
export const KITS: Readonly<Record<Exclude<KitId, 'gt'>, KitColors>> = {
  kestrel: { paper: '#f3efe6', ink: '#1f1b16', ink2: '#4d463c', titanium: '#6e665a' },
  globex: { paper: '#0a1b38', ink: '#f4f1ea', ink2: '#c9cbd3', titanium: '#8d97ab' },
};

/**
 * The slide tokens of the GT theme a typed background reads (`packages/theme/src/tokens.ts` TOKENS
 * light and dark; `theme.test.ts` holds them equal): the text takes the light ink or the dark
 * ink, whichever reads higher on the typed ground, with that appearance's captions and hints.
 */
export const SLIDE_TOKENS = {
  light: { ink: '#070707', ink2: '#3a3d44', titanium: '#8a8f98' },
  dark: { ink: '#f2f2f0', ink2: '#b9bcc3', titanium: '#8a8f98' },
} as const;

/**
 * The alphas of the ink's derived tokens (`packages/theme/src/tokens.ts` TOKENS, the light set for
 * a light ground and the dark set for a dark one; theme-css.ts THEME_DERIVED_TOKENS and the
 * plate), which `theme.test.ts` holds equal to the theme's.
 */
export const DERIVED_ALPHAS: Readonly<Record<'light' | 'dark', Readonly<Record<string, number>>>> =
  {
    light: { hair: 0.18, 'hair-soft': 0.09, plate: 0.035, cross: 0.38, edge: 0.62, thumb: 0.32 },
    dark: { hair: 0.22, 'hair-soft': 0.1, plate: 0.05, cross: 0.34, edge: 0.55, thumb: 0.32 },
  };

const hexRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** theme-css.ts `luminance`, copied (6.2: a replica with a unit test pinning it). */
function luminance(hex: string): number {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** theme-css.ts `contrastRatio`, copied: the WCAG contrast ratio of two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a) + 0.05;
  const lb = luminance(b) + 0.05;
  return Math.max(la, lb) / Math.min(la, lb);
}

/** theme-css.ts `readableHint`, copied: the base hint while it reads at 3 to 1, else the text colour. */
export function readableHint(ground: string, text: string, baseHint: string): string {
  if (contrastRatio(baseHint, ground) >= 3) return baseHint;
  return text.toLowerCase();
}

/** A typed colour: `#` and six hex digits (2.8). */
export const HEX = /^#[0-9a-f]{6}$/i;

/** The lowest contrast any slide text may read at (2.8, LANDING.md 5 "Contrast"). */
export const TEXT_MIN_RATIO = 4.5;

/**
 * The colours a typed background sets (2.8, a replica of the Brand kit's Background colour): the
 * text in the light or the dark ink, whichever reads higher; the captions in that appearance's
 * captions colour while it reads at 4.5:1, else the text; the hints by `readableHint`. `ratio` is
 * the text's contrast, which the kits band refuses under 4.5:1.
 */
export function backgroundColors(paper: string): { colors: KitColors; ratio: number } {
  const p = paper.toLowerCase();
  const light = contrastRatio(SLIDE_TOKENS.light.ink, p);
  const dark = contrastRatio(SLIDE_TOKENS.dark.ink, p);
  const set = light >= dark ? SLIDE_TOKENS.light : SLIDE_TOKENS.dark;
  const ratio = Math.max(light, dark);
  const ink2 = contrastRatio(set.ink2, p) >= TEXT_MIN_RATIO ? set.ink2 : set.ink;
  return {
    colors: { paper: p, ink: set.ink, ink2, titanium: readableHint(p, set.ink, set.titanium) },
    ratio,
  };
}

/** The colours in force: the typed background over the kit, else the example kit; null for GT. */
export function colorsOf(kit: KitId, background: string | null): KitColors | null {
  if (background !== null && HEX.test(background)) return backgroundColors(background).colors;
  return kit === 'gt' ? null : KITS[kit];
}

/** The custom properties a kit sets on a sheet, by name with its `--`. */
export function kitProperties(k: KitColors): Record<string, string> {
  const dark = luminance(k.paper) < luminance(k.ink);
  const [r, g, b] = hexRgb(k.ink);
  const props: Record<string, string> = {
    '--ink': k.ink,
    '--paper': k.paper,
    '--ink-2': k.ink2,
    '--titanium': k.titanium,
    '--blue': k.ink,
    '--accent': k.ink,
  };
  for (const [name, alpha] of Object.entries(DERIVED_ALPHAS[dark ? 'dark' : 'light']))
    props[`--${name}`] = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  return props;
}

const PROPERTY_NAMES = Object.keys(kitProperties(KITS.kestrel));

/** The elements a kit writes on: the slide root and the renderer's sheets inside it. */
const sheetsOf = (el: HTMLElement): HTMLElement[] => [
  ...(el.matches('.ts-sheet') ? [el] : []),
  ...el.querySelectorAll<HTMLElement>('.ts-sheet'),
];

/**
 * Sets a kit, or a typed background over it, on a slide root and its sheets; GT with no background
 * removes the properties (l3.md R13: the show and the print call it on their clones).
 */
export function applyKit(el: HTMLElement, kit: KitId, background: string | null = null): void {
  const colors = colorsOf(kit, background);
  const props = colors === null ? null : kitProperties(colors);
  for (const sheet of [el, ...sheetsOf(el)])
    for (const name of PROPERTY_NAMES) {
      const value = props?.[name];
      if (value === undefined) {
        if (sheet.style.getPropertyValue(name) !== '') sheet.style.removeProperty(name);
      } else if (sheet.style.getPropertyValue(name) !== value) sheet.style.setProperty(name, value);
    }
}

// ---------------------------------------------------------------------------------------------
// The customer's name (2.7)

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The notes or any text with the fixture's customer replaced by `to`. */
export function customerText(text: string, to: string): string {
  return text.split(HOME_DECK.customer).join(to);
}

/**
 * Wraps every occurrence of the fixture's name, or of `from`, in the element's text in a
 * `span[data-customer]` once, and returns every such span in document order.
 */
export function markCustomer(el: Element, from: string): HTMLElement[] {
  const names = [...new Set([HOME_DECK.customer, from])].filter((n) => n !== '');
  const re = new RegExp(`(${names.map(escapeRe).join('|')})`);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const hits: Text[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent === null || parent.closest('[data-customer], svg, script, style') !== null) continue;
    if (parent.isContentEditable) continue;
    if (re.test((node as Text).data)) hits.push(node as Text);
  }
  for (const text of hits) {
    const parts = text.data.split(re);
    const frag = document.createDocumentFragment();
    for (const [i, part] of parts.entries()) {
      if (part === '') continue;
      if (i % 2 === 1) {
        const span = document.createElement('span');
        span.setAttribute('data-customer', '');
        span.textContent = part;
        frag.append(span);
      } else frag.append(part);
    }
    text.replaceWith(frag);
  }
  return [...el.querySelectorAll<HTMLElement>('[data-customer]')];
}

/** Sets the customer in markup inserted after the page loaded (l3.md R12). */
export function applyCustomer(el: Element, from: string, to: string): void {
  for (const span of markCustomer(el, from)) if (span.textContent !== to) span.textContent = to;
}

// ---------------------------------------------------------------------------------------------
// The counters, the filmstrips' numbers and the skipped mark (2.0, 2.9; v3.md R12)

/** The wrappers a filmstrip or a grid draws a slide in: they carry the skipped mark. */
const THUMB_WRAPPERS = '[data-thumb], [data-hero-thumb], [data-mini-thumb], [data-kit-thumb]';

const thumbKey = (thumb: HTMLElement): string | undefined =>
  thumb.dataset['thumb'] ??
  thumb.dataset['heroThumb'] ??
  thumb.dataset['miniThumb'] ??
  thumb.dataset['kitThumb'];

/**
 * Rewrites every slide root's counter and every filmstrip's numbers from the deck's order, hides
 * a filmstrip's slide that left the deck, and draws the editor's skipped slide mark on every
 * thumbnail of a skipped slide (`data-skipped` on the wrapper and on its `.ts-home-sheet`, one
 * `span.ts-home-skip` holding the `eye-slash` icon, v3.md R12).
 */
export function renumber(root: ParentNode, state: HomeDeckState): void {
  const total = state.order.length;
  // a view laid over the page (the scrubber's earlier version) draws its own state
  const inOverlay = root instanceof Element && root.closest('[data-live-overlay]') !== null;
  for (const el of root.querySelectorAll<HTMLElement>('[data-home-slides][data-slide]')) {
    if (!inOverlay && el.closest('[data-live-overlay]') !== null) continue;
    const n = state.order.indexOf(el.dataset['slide'] as SlideKey) + 1;
    if (n === 0) continue;
    const text = `${n} / ${total}`;
    if (el.dataset['counter'] !== text) el.dataset['counter'] = text;
    for (const c of el.querySelectorAll('[data-counter-text]'))
      if (c.textContent !== text) c.textContent = text;
  }
  for (const thumb of root.querySelectorAll<HTMLElement>(THUMB_WRAPPERS)) {
    const key = thumbKey(thumb) as SlideKey | undefined;
    if (key === undefined) continue;
    const n = state.order.indexOf(key) + 1;
    if (thumb.hidden !== (n === 0)) thumb.hidden = n === 0;
    const label = thumb.querySelector('[data-thumb-n]');
    if (label !== null && n > 0 && label.textContent !== String(n)) label.textContent = String(n);
    const skipped = state.skipped[key] === true;
    const sheet = thumb.querySelector<HTMLElement>('.ts-home-sheet');
    for (const el of [thumb, sheet])
      if (el !== null && el.hasAttribute('data-skipped') !== skipped)
        el.toggleAttribute('data-skipped', skipped);
    const host = sheet ?? thumb;
    const mark = host.querySelector(':scope > .ts-home-skip');
    if (skipped && mark === null) {
      const span = document.createElement('span');
      span.className = 'ts-home-skip';
      span.setAttribute('aria-hidden', 'true');
      span.setAttribute('data-live-overlay', '');
      const icon = document.createElement('i');
      icon.className = 'ts-icon';
      icon.dataset['icon'] = 'eye-slash';
      span.append(icon);
      host.append(span);
    } else if (!skipped && mark !== null) mark.remove();
  }
}

// ---------------------------------------------------------------------------------------------
// The objects of a slide (2.5, 2.6)

/** The word the selection chip shows for a block the build did not mark, by its `data-type`. */
const ROLE_OF_TYPE: Readonly<Record<string, string>> = {
  heading: 'Heading',
  paragraph: 'Text',
  text: 'Text',
  rows: 'Rows',
  shape: 'Shape',
  picture: 'Picture',
  rule: 'Line',
  plain: 'List',
  list: 'List',
};

/**
 * The slides whose objects a band edits (LANDING.md 5): the hero frame's slide, the miniature's
 * stage and the lighthouse on the canvas band.
 */
const EDITED_HOSTS = '[data-hero-slide], [data-mini-stage], [data-reserve="canvas"]';

/** The block types a second click or Enter types in. */
const TYPED_TYPES = new Set(['heading', 'paragraph', 'text']);

/**
 * Marks every top level block of a slide root the build left unmarked as a selectable object
 * (`data-object="<slide>#<block>"`, a group named by its role), so every slide the miniature shows
 * is editable (LANDING.md 2.5). A block inside an object (a plate's heading) keeps its own mark.
 * The objects take Tab where a band edits them (`edited`) and hold text or a drawing; a band that
 * only shows a slide gives its objects no Tab stop at first marking, which a band's own code may
 * change (v4.md Q15); a thumbnail's, the print's and an overlay's (`live` false) never take one.
 */
export function markObjects(root: HTMLElement, live: boolean, edited = live): void {
  const slide = root.dataset['slide'];
  if (slide === undefined) return;
  for (const el of root.querySelectorAll<HTMLElement>('[data-block]')) {
    if (el.closest('[data-object]') !== null) continue;
    if (el.parentElement?.closest('[data-block]') !== null) continue;
    if (el.closest('[data-live-overlay]') !== null) continue;
    const type = el.dataset['type'] ?? '';
    const role = ROLE_OF_TYPE[type];
    if (role === undefined) continue;
    el.dataset['object'] = `${slide}#${el.dataset['block'] ?? ''}`;
    el.setAttribute('role', 'group');
    el.setAttribute('aria-roledescription', role === 'Shape' ? 'shape' : 'text box');
    el.setAttribute('aria-label', role);
    el.tabIndex = live && edited && drawn(el) ? 0 : -1;
    if (TYPED_TYPES.has(type)) el.dataset['typed'] = '';
  }
  if (!live) for (const el of root.querySelectorAll<HTMLElement>('[data-object]')) el.tabIndex = -1;
}

/** An object that draws something: text, or an element (a plate's print, a shape's drawing). */
const drawn = (el: HTMLElement): boolean =>
  el.childElementCount > 0 || (el.textContent ?? '').trim() !== '';

/**
 * The Tab stops of a slide root's objects as the build marked them (every instance at rest carries
 * `tabindex="0"`): kept where a band edits them and the object draws, removed elsewhere (v4.md
 * Q15). Run once a root, at its first drawing, so a band's own code may set them after.
 */
function tabStops(root: HTMLElement, edited: boolean): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-object]'))
    el.tabIndex = edited && drawn(el) ? 0 : -1;
}

/** The chip word of an object: the build's role, else the marked role. */
export function roleOf(el: HTMLElement): string {
  const id = el.dataset['object'] ?? '';
  const slide = id.slice(0, id.indexOf('#')) as HomeSlideId;
  const facts = HOME_DECK.slides[slide]?.objects.find((o) => o.id === id);
  return facts?.role ?? el.getAttribute('aria-label') ?? 'Text';
}

/** True when the object takes typing: the build's word, else its block type. */
export function typesIn(el: HTMLElement): boolean {
  const id = el.dataset['object'] ?? '';
  const slide = id.slice(0, id.indexOf('#')) as HomeSlideId;
  const facts = HOME_DECK.slides[slide]?.objects.find((o) => o.id === id);
  if (facts !== undefined) return facts.editable;
  return el.hasAttribute('data-typed') || el.querySelector('[data-typed]') !== null;
}

/** One object of one slide root, with what freeing it wrote. */
export type LayoutItem = {
  id: ObjectKey;
  el: HTMLElement;
  parent: LayoutItem | null;
  /** the box at rest in sheet units, read when the slide's objects are freed */
  rest: SheetBox | null;
  /** the freed box's place in its containing block, in units; null when it was placed already */
  at: { left: number; top: number } | null;
  /** the freed box's size in the flow, in units */
  flow: { w: number; h: number } | null;
  spacer: HTMLElement | null;
  /** the wrapper's own inline style before the slide was freed, put back when it is put back */
  css: string;
  /** a first or last child whose margin collapsed through the wrapper, and its inline style */
  inner: { el: HTMLElement; css: string }[];
  /** the rotation last drawn on the object, in degrees */
  turned: number;
};

/** The objects of one slide root and their freed places (the canvas of 2.6, generalised). */
export type SheetLayout = {
  readonly root: HTMLElement;
  /** the objects, in document order, read again when a block was inserted or removed */
  items(): LayoutItem[];
  item(id: string): LayoutItem | undefined;
  /** the item an element belongs to */
  itemOf(el: Element | null): LayoutItem | undefined;
  freed(): boolean;
  /** frees every object in place; false when the root is not laid out */
  free(): boolean;
  unfree(): void;
  /** draws a pose on the object; with no pose, its rest */
  draw(it: LayoutItem, p: SheetBox | undefined): void;
  /** the store's pose, else the box at rest, else a zero box */
  pose(it: LayoutItem, state: HomeDeckState): SheetBox;
  /** the offset the object's ancestors' moves add, in units */
  offset(it: LayoutItem, state: HomeDeckState): { x: number; y: number; rot: number };
  /** screen pixels per unit */
  scale(): number;
  /** writes the freed places and the spacers again after a resize */
  lay(): void;
};

const layouts = new WeakMap<HTMLElement, SheetLayout>();

/** True when the slide draws a dithered picture: a moved text box draws its paper there. */
const dithered = (root: HTMLElement): boolean =>
  root.querySelector('.ts-home-print, [data-field]') !== null;

/**
 * A moved text box's paper on a dithered slide (integrator.md 2.2, LANDING.md 2.6 "the moved text
 * keeps its paper ground"): the box's own ground and a clear zone of `CLEAR_ZONE` px around it, so
 * its type never reads over the print. A plate draws its own.
 */
export function paperGround(root: HTMLElement, el: HTMLElement, on: boolean): void {
  if (!dithered(root) || el.classList.contains('mood-plate')) return;
  if (on) {
    el.style.outline = `${CLEAR_ZONE}px solid var(--paper)`;
    el.style.backgroundColor = 'var(--paper)';
  } else {
    el.style.removeProperty('outline');
    el.style.removeProperty('background-color');
  }
}

/** The layout of a slide root, made once per root. */
export function sheetLayout(root: HTMLElement): SheetLayout {
  const known = layouts.get(root);
  if (known !== undefined) return known;
  let list: LayoutItem[] = [];
  let isFreed = false;
  const scan = (): LayoutItem[] => {
    const els = [...root.querySelectorAll<HTMLElement>('[data-object]')].filter(
      (el) => el.closest('[data-live-overlay]') === null,
    );
    if (els.length === list.length && els.every((el, i) => list[i]?.el === el)) return list;
    const next: LayoutItem[] = [];
    for (const el of els) {
      const old = list.find((it) => it.el === el);
      if (old !== undefined) {
        old.parent = null;
        next.push(old);
        continue;
      }
      next.push({
        id: el.dataset['object'] as ObjectKey,
        el,
        parent: null,
        rest: null,
        at: null,
        flow: null,
        spacer: null,
        css: el.style.cssText,
        inner: [],
        turned: 0,
      });
    }
    for (const it of next)
      for (const other of next) if (other !== it && other.el.contains(it.el)) it.parent = other;
    list = next;
    return list;
  };
  const scale = (): number => root.getBoundingClientRect().width / UNITS;
  const ground = (it: LayoutItem, on: boolean): void => paperGround(root, it.el, on);
  /** frees one item in place (it was laid out with its spacer's room) */
  const freeOne = (
    it: LayoutItem,
    sr: DOMRect,
    k: number,
    r: DOMRect,
    cs: CSSStyleDeclaration,
  ): void => {
    it.css = it.el.style.cssText;
    // the style the build wrote travels with the element, so a copy of a drawn slide can be put
    // back (`heal`) before it is drawn again
    it.el.dataset['liveCss'] = it.css;
    const w = r.width / k;
    const h = r.height / k;
    it.rest = { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w, h, rot: 0 };
    if (cs.position === 'absolute' || cs.position === 'fixed') return;
    // a child's margin that collapses through the wrapper in the flow (the hero's title carries
    // its slot's margin-top) would sit inside the freed box: the spacer takes it, the child drops it
    let mt = parseFloat(cs.marginTop) || 0;
    let mb = parseFloat(cs.marginBottom) || 0;
    const through = (side: 'Top' | 'Bottom'): boolean =>
      cs.display === 'block' &&
      (parseFloat(cs[`padding${side}`]) || 0) === 0 &&
      (parseFloat(cs[`border${side}Width`]) || 0) === 0;
    const collapse = (a: number, b: number): number => Math.max(a, b, 0) + Math.min(a, b, 0);
    const first = it.el.firstElementChild;
    const last = it.el.lastElementChild;
    if (first instanceof HTMLElement && through('Top')) {
      const m = parseFloat(getComputedStyle(first).marginTop) || 0;
      if (m !== 0) {
        mt = collapse(mt, m);
        it.inner.push({ el: first, css: first.style.cssText });
        first.dataset['liveCss'] = first.style.cssText;
        first.style.marginTop = '0px';
      }
    }
    if (last instanceof HTMLElement && through('Bottom')) {
      const m = parseFloat(getComputedStyle(last).marginBottom) || 0;
      if (m !== 0) {
        mb = collapse(mb, m);
        if (!it.inner.some((x) => x.el === last))
          it.inner.push({ el: last, css: last.style.cssText });
        last.dataset['liveCss'] ??= last.style.cssText;
        last.style.marginBottom = '0px';
      }
    }
    const spacer = document.createElement('div');
    spacer.setAttribute('data-live-spacer', '');
    spacer.setAttribute('aria-hidden', 'true');
    const sp = spacer.style;
    sp.display = cs.display.startsWith('inline') ? 'inline-block' : 'block';
    sp.flex = 'none';
    sp.margin = `${mt}px ${cs.marginRight} ${mb}px ${cs.marginLeft}`;
    // the spacer holds the box's place before the box leaves the flow, so a container placed by its
    // bottom edge (a mood slide's plate) keeps its height and the place read below is final
    sp.width = `${w}px`;
    sp.height = `${h}px`;
    it.el.before(spacer);
    it.spacer = spacer;
    it.flow = { w, h };
    const st = it.el.style;
    st.position = 'absolute';
    st.margin = '0';
    st.boxSizing = 'border-box';
    st.width = `${w}px`;
    st.left = '0px';
    st.top = '0px';
    const r0 = it.el.getBoundingClientRect();
    it.at = { left: (r.left - r0.left) / k, top: (r.top - r0.top) / k };
    st.left = `${it.at.left}px`;
    st.top = `${it.at.top}px`;
  };
  const layout: SheetLayout = {
    root,
    items: scan,
    item: (id) => scan().find((it) => it.id === id),
    itemOf(el) {
      const o = el?.closest<HTMLElement>('[data-object]');
      return o ? scan().find((it) => it.el === o) : undefined;
    },
    freed: () => isFreed,
    free() {
      const items = scan();
      const fresh = items.filter((it) => it.rest === null);
      if (isFreed && fresh.length === 0) return true;
      const sr = root.getBoundingClientRect();
      if (sr.width === 0) return false;
      const k = sr.width / UNITS;
      // sizes from the drawn boxes (nothing is turned at rest), so a fractional height is kept
      // exactly and freeing moves nothing by a rounding
      const read = fresh.map((it) => ({
        it,
        r: it.el.getBoundingClientRect(),
        cs: getComputedStyle(it.el),
      }));
      for (const { it, r, cs } of read) freeOne(it, sr, k, r, cs);
      isFreed = true;
      return true;
    },
    unfree() {
      if (!isFreed) return;
      isFreed = false;
      for (const it of scan()) {
        it.spacer?.remove();
        it.spacer = null;
        it.at = null;
        it.flow = null;
        it.turned = 0;
        it.rest = null;
        it.el.style.cssText = it.css;
        for (const x of it.inner) {
          x.el.style.cssText = x.css;
          delete x.el.dataset['liveCss'];
        }
        delete it.el.dataset['liveCss'];
        it.inner = [];
      }
    },
    draw(it, p) {
      const st = it.el.style;
      if (!isFreed || it.rest === null) return;
      it.turned = p?.rot ?? 0;
      ground(it, p !== undefined);
      // an inserted block is placed by its own box (`width` and `height` inline, as the renderer's
      // `.free` wrapper is), so a resize writes its height; a block of the slide grows by min-height
      const inserted = it.el.dataset['inserted'] !== undefined;
      if (p === undefined) {
        st.removeProperty('transform');
        if (inserted) {
          st.width = `${round(it.rest.w)}px`;
          st.height = `${round(it.rest.h)}px`;
          return;
        }
        if (it.at !== null) st.width = `${round(it.rest.w)}px`;
        else st.removeProperty('width');
        st.removeProperty('min-height');
        return;
      }
      const dx = round(p.x - it.rest.x);
      const dy = round(p.y - it.rest.y);
      st.transform =
        dx === 0 && dy === 0 && p.rot === 0
          ? ''
          : `translate(${dx}px, ${dy}px) rotate(${p.rot}deg)`;
      if (inserted) {
        st.width = `${round(p.w)}px`;
        st.height = `${round(p.h)}px`;
        return;
      }
      // a box placed by its slide keeps its own width until a resize, so a typed word widens it as
      // the slide drew it (its clear zone with it); a box freed from the flow holds its width
      if (it.at !== null || Math.abs(p.w - it.rest.w) > 0.01) st.width = `${round(p.w)}px`;
      else st.removeProperty('width');
      if (Math.abs(p.h - it.rest.h) > 0.01) st.minHeight = `${round(p.h)}px`;
      else st.removeProperty('min-height');
    },
    pose: (it, state) => state.poses[it.id] ?? it.rest ?? { x: 0, y: 0, w: 0, h: 0, rot: 0 },
    offset(it, state) {
      let x = 0;
      let y = 0;
      let rot = 0;
      for (let p = it.parent; p !== null; p = p.parent) {
        const q = layout.pose(p, state);
        if (p.rest !== null) {
          x += q.x - p.rest.x;
          y += q.y - p.rest.y;
        }
        rot += q.rot;
      }
      return { x, y, rot };
    },
    scale,
    lay() {
      for (const it of scan()) {
        if (it.spacer !== null && it.flow !== null) {
          it.spacer.style.width = `${it.flow.w}px`;
          it.spacer.style.height = `${it.flow.h}px`;
        }
        if (it.at !== null) {
          it.el.style.left = `${it.at.left}px`;
          it.el.style.top = `${it.at.top}px`;
        }
      }
    },
  };
  layouts.set(root, layout);
  return layout;
}

/** True when the slide's objects stand free in this state: a pose, an inserted block or a z order. */
function needsFree(slide: string, state: HomeDeckState): boolean {
  const prefix = `${slide}#`;
  for (const id of Object.keys(state.poses)) if (id.startsWith(prefix)) return true;
  for (const [id, style] of Object.entries(state.styles))
    if (id.startsWith(prefix) && style?.z !== undefined) return true;
  return false;
}

/** Draws the store's poses on one slide root; a slide with none is put back. */
export function paintPoses(root: HTMLElement, state: HomeDeckState): void {
  const slide = root.dataset['slide'];
  if (slide === undefined) return;
  const layout = sheetLayout(root);
  if (!needsFree(slide, state)) {
    layout.unfree();
    return;
  }
  if (!layout.free()) return;
  for (const it of layout.items()) layout.draw(it, state.poses[it.id]);
}

// ---------------------------------------------------------------------------------------------
// Inserted blocks, deleted objects, typed words and styles (2.5)

/** The markup a menu row inserts, rendered at build (`menus.generated.ts`), registered by `menus.ts`. */
const insertMarkup = new Map<InsertedKind, string>();
let templates: HTMLTemplateElement | null = null;

/** Registers the renderer's markup for a text box, a rectangle or an ellipse (the menus chunk). */
export function registerInsertMarkup(kind: Exclude<InsertedKind, 'copy'>, html: string): void {
  insertMarkup.set(kind, html);
}

const ROLE_OF_KIND: Readonly<Record<InsertedKind, string>> = {
  text: 'Text',
  rect: 'Shape',
  oval: 'Shape',
  copy: 'Text',
};

/** The element of one inserted block, made from the registered markup or a copy of its source. */
function makeInserted(root: HTMLElement, block: InsertedBlock): HTMLElement | null {
  let inner: Element | null = null;
  const blockId = block.id.slice(block.id.indexOf('#') + 1);
  if (block.kind === 'copy') {
    const source = root.querySelector<HTMLElement>(`[data-object="${block.source ?? ''}"]`);
    if (source === null) return null;
    // a copy of an inserted block copies the block inside its wrapper, not the wrapper
    const from =
      source.dataset['inserted'] !== undefined ? source.firstElementChild : (source as Element);
    if (from === null) return null;
    inner = from.cloneNode(true) as Element;
    for (const name of ['data-inserted', 'data-free', 'data-typed', 'data-deleted', 'aria-hidden'])
      inner.removeAttribute(name);
    (inner as HTMLElement).style?.removeProperty('visibility');
    for (const el of [inner, ...inner.querySelectorAll('[data-object]')]) {
      el.removeAttribute('data-object');
      el.removeAttribute('tabindex');
      el.removeAttribute('role');
      el.removeAttribute('aria-roledescription');
      (el as HTMLElement).style?.removeProperty('transform');
    }
    for (const el of inner.querySelectorAll('[data-live-spacer], .ts-home-skip')) el.remove();
    const st = (inner as HTMLElement).style;
    for (const p of ['position', 'left', 'top', 'margin', 'width', 'min-height', 'outline'])
      st.removeProperty(p);
  } else {
    const html = insertMarkup.get(block.kind);
    if (html === undefined) return null;
    if (templates === null) templates = document.createElement('template');
    // the renderer's markup rendered at build into menus.generated.ts, never typed text
    templates.innerHTML = html;
    inner = templates.content.firstElementChild?.cloneNode(true) as Element | null;
    if (inner === null) return null;
  }
  for (const el of [inner, ...inner.querySelectorAll('[data-block]')]) {
    if (el.hasAttribute('data-block')) el.setAttribute('data-block', blockId);
    if (el.hasAttribute('data-run')) el.setAttribute('data-run', `${blockId}/text`);
    if (el.hasAttribute('data-rid')) el.setAttribute('data-rid', `${blockId}:1`);
  }
  const wrap = document.createElement('div');
  wrap.className = 'free';
  wrap.dataset['free'] = blockId;
  wrap.dataset['object'] = block.id;
  wrap.dataset['inserted'] = block.kind;
  if (block.kind === 'text' || block.kind === 'copy') wrap.dataset['typed'] = '';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-roledescription', block.kind === 'text' ? 'text box' : 'shape');
  wrap.setAttribute(
    'aria-label',
    block.kind === 'copy' ? roleOfCopy(root, block) : ROLE_OF_KIND[block.kind],
  );
  wrap.tabIndex = root.closest(THUMB_WRAPPERS) === null ? 0 : -1;
  const b = block.box;
  wrap.style.cssText = `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px`;
  wrap.append(inner);
  return wrap;
}

const roleOfCopy = (root: HTMLElement, block: InsertedBlock): string => {
  const source = root.querySelector<HTMLElement>(`[data-object="${block.source ?? ''}"]`);
  return source === null ? 'Text' : roleOf(source);
};

/** The layer at the stage's origin the inserted blocks sit in (the renderer's `.freeform-sheet`). */
function insertLayer(root: HTMLElement): HTMLElement | null {
  const stage = root.querySelector<HTMLElement>('.ts-stage') ?? root;
  let layer = stage.querySelector<HTMLElement>(':scope > [data-inserted-layer]');
  if (layer !== null) return layer;
  layer = document.createElement('div');
  layer.className = 'freeform-sheet';
  layer.setAttribute('data-inserted-layer', '');
  layer.style.cssText = 'left:0;top:0;z-index:4';
  const slide = stage.querySelector(':scope > section.slide');
  if (slide !== null) slide.after(layer);
  else stage.append(layer);
  return layer;
}

/** Inserts and removes the blocks a menu row inserted, in the state's order. */
export function paintInserted(root: HTMLElement, state: HomeDeckState): boolean {
  const slide = root.dataset['slide'];
  let changed = false;
  const want = state.blocks.filter((b) => b.slide === slide);
  const have = [...root.querySelectorAll<HTMLElement>('[data-inserted][data-object]')];
  for (const el of have)
    if (!want.some((b) => b.id === el.dataset['object'])) {
      el.remove();
      changed = true;
    }
  if (want.length === 0) return changed;
  const layer = insertLayer(root);
  if (layer === null) return changed;
  for (const block of want) {
    if (root.querySelector(`[data-inserted][data-object="${block.id}"]`) !== null) continue;
    const el = makeInserted(root, block);
    if (el === null) continue;
    layer.append(el);
    changed = true;
  }
  return changed;
}

/** Hides the objects Edit > Delete took off the slide (an Undo shows them again). */
export function paintDeleted(root: HTMLElement, state: HomeDeckState): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-object]')) {
    const gone = state.deleted.includes(el.dataset['object'] as ObjectKey);
    if (gone && el.style.visibility !== 'hidden') {
      el.style.visibility = 'hidden';
      el.setAttribute('aria-hidden', 'true');
      el.dataset['deleted'] = '';
    } else if (!gone && el.hasAttribute('data-deleted')) {
      el.style.removeProperty('visibility');
      el.removeAttribute('aria-hidden');
      el.removeAttribute('data-deleted');
    }
  }
}

/** The text element of an object: the element carrying `data-block`, else the object itself. */
export function textOf(el: HTMLElement): HTMLElement {
  if (el.hasAttribute('data-block') && el.dataset['type'] !== 'shape') return el;
  return el.querySelector<HTMLElement>('[data-block]:not([data-type="shape"])') ?? el;
}

/** The markup each object held before its first typed change, by root, so an Undo puts it back. */
const restingText = new WeakMap<HTMLElement, string>();

/**
 * Records the markup a text box holds before the visitor types in it (`objects.ts` calls it as the
 * typing starts), so an Undo of the typed change puts the renderer's own markup back.
 */
export function noteResting(text: HTMLElement): void {
  if (restingText.has(text)) return;
  restingText.set(text, text.innerHTML);
  text.dataset['liveRest'] = text.innerHTML;
}

/** Draws the typed words of every object: the typed text, or the markup it held at rest. */
export function paintTexts(root: HTMLElement, state: HomeDeckState): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-object]')) {
    const id = el.dataset['object'] as ObjectKey;
    const text = textOf(el);
    if (text.isContentEditable) continue;
    const typed = state.texts[id];
    if (typed !== undefined) {
      if (!restingText.has(text)) {
        restingText.set(text, text.innerHTML);
        text.dataset['liveRest'] = text.innerHTML;
      }
      if (text.textContent !== typed || text.querySelector('[data-customer]') !== null) {
        // the visitor's words as plain text (the page never writes typed text as markup)
        text.textContent = typed;
      }
    } else {
      const html = restingText.get(text);
      if (html !== undefined) {
        // the renderer's markup the box held at rest, read from the page before the first change
        text.innerHTML = html;
        restingText.delete(text);
        delete text.dataset['liveRest'];
      }
    }
  }
}

const STYLE_PROPS = ['font-weight', 'text-decoration-line', 'text-align', 'z-index'] as const;

/** The declarations a style writes on an object's text element (z on the object itself). */
function styleDeclarations(style: BlockStyle | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (style === undefined) return out;
  // the bold run the renderer writes is a `b` element at the browser's bolder weight, 700 over the
  // slide's 400 and 500 (packages/render/src/text.ts 53); the underline is a `u` element
  if (style.bold === true) out['font-weight'] = '700';
  if (style.underline === true) out['text-decoration-line'] = 'underline';
  if (style.align !== undefined) out['text-align'] = style.align;
  return out;
}

/** Draws Format and Arrange rows' styles on every object. */
export function paintStyles(root: HTMLElement, state: HomeDeckState): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-object]')) {
    const style = state.styles[el.dataset['object'] as ObjectKey];
    const text = textOf(el);
    const want = styleDeclarations(style);
    for (const name of STYLE_PROPS) {
      if (name === 'z-index') continue;
      const value = want[name];
      if (value === undefined) {
        if (text.style.getPropertyValue(name) !== '') text.style.removeProperty(name);
      } else if (text.style.getPropertyValue(name) !== value) text.style.setProperty(name, value);
    }
    const z = style?.z === 'front' ? '20' : style?.z === 'back' ? '0' : '';
    if (z === '') {
      if (el.style.zIndex !== '' && el.dataset['inserted'] === undefined)
        el.style.removeProperty('z-index');
    } else if (el.style.zIndex !== z) el.style.zIndex = z;
  }
}

// ---------------------------------------------------------------------------------------------
// The whole slide

export type PaintOptions = {
  /** Tailor's band draws the names itself, 55 ms apart (3.6 T1) */
  names?: boolean;
  /** the kits band clears the old ground itself (3.6 T3); the kit is set all the same */
  thumbnails?: boolean;
};

/** Painters other lanes add (V3's slide 5 looks, v3.md R8), run on every root after the poses. */
const painters: ((root: HTMLElement, state: HomeDeckState) => void)[] = [];

/**
 * Adds a painter `paintSlide` runs on every slide root it draws, after the poses (v3.md R8: V3's
 * `paintNextSteps`, registered by the module that owns it, so the core never imports a file a later
 * push lands).
 */
export function registerPainter(fn: (root: HTMLElement, state: HomeDeckState) => void): void {
  if (!painters.includes(fn)) painters.push(fn);
}

/** The roots drawn on this page load: a root first seen is healed before it is drawn. */
const seen = new WeakSet<HTMLElement>();

/**
 * Puts a copy of a drawn slide back as the build wrote it (a band that cloned a slide another band
 * had drawn on: its freed boxes, spacers, inserted blocks, typed words and overlays), so the copy
 * draws the state from its own rest. Every value it writes back is one the page read from the
 * renderer's markup before it changed it (`data-live-css`, `data-live-rest`).
 */
function heal(root: HTMLElement): void {
  for (const el of root.querySelectorAll(
    '[data-live-spacer], [data-inserted], [data-live-overlay]',
  ))
    el.remove();
  for (const el of root.querySelectorAll<HTMLElement>('[data-live-css]')) {
    el.style.cssText = el.dataset['liveCss'] ?? '';
    delete el.dataset['liveCss'];
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-live-rest]')) {
    // the renderer's markup the box held before the visitor typed, recorded by the page
    el.innerHTML = el.dataset['liveRest'] ?? '';
    delete el.dataset['liveRest'];
  }
  for (const el of root.querySelectorAll('[contenteditable]'))
    el.removeAttribute('contenteditable');
}

/** The customer each root last drew, so a rename finds the old name in it. */
const drawnCustomer = new WeakMap<HTMLElement, string>();

/** Draws the page deck's state on one slide root (any band, any size). */
export function paintSlide(
  root: HTMLElement,
  state: HomeDeckState,
  options: PaintOptions = {},
): void {
  // a thumbnail, the print and a view laid over the page (the scrubber's) are never edited
  const live =
    root.closest(THUMB_WRAPPERS) === null &&
    root.closest('[data-print-deck], [data-live-overlay]') === null;
  const edited = live && root.closest(EDITED_HOSTS) !== null;
  if (!seen.has(root)) {
    seen.add(root);
    heal(root);
    tabStops(root, edited);
  }
  markObjects(root, live, edited);
  applyKit(root, state.kit, state.background);
  paintInserted(root, state);
  paintDeleted(root, state);
  paintTexts(root, state);
  paintStyles(root, state);
  if (options.names !== false) {
    const from = drawnCustomer.get(root) ?? HOME_DECK.customer;
    if (from !== state.customer || state.customer !== HOME_DECK.customer)
      applyCustomer(root, from, state.customer);
    drawnCustomer.set(root, state.customer);
  }
  paintPoses(root, state);
  for (const fn of painters) {
    try {
      fn(root, state);
    } catch (error) {
      console.error('a slide painter failed', error);
    }
  }
}

/** Draws the state on every slide root under `container` (the container itself included). */
export function paintSlides(
  container: ParentNode,
  state: HomeDeckState,
  options: PaintOptions = {},
): void {
  const roots = [...container.querySelectorAll<HTMLElement>('[data-home-slides]')];
  if (container instanceof HTMLElement && container.matches('[data-home-slides]'))
    roots.unshift(container);
  for (const root of roots) {
    if (root.closest('[data-live-overlay]') !== null) continue;
    paintSlide(root, state, options);
  }
  renumber(container, state);
}

/** Notes the root's customer as drawn (Tailor's band set the names itself). */
export function noteCustomer(root: HTMLElement, customer: string): void {
  drawnCustomer.set(root, customer);
}

// ---------------------------------------------------------------------------------------------
// The pictures of a slide a band placed itself (the miniature, the kits grid, the scrubber's view)

/** The page's appearance, which picks a still's file (assets.ts). */
const appearance = (): 'light' | 'dark' => {
  const theme = document.documentElement.dataset['theme'];
  if (theme === 'dark' || theme === 'light') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/** The served still of a picture the document carries no still for, by its field box. */
const ROLE_OF_FIELD: Readonly<Record<string, HomeAssetRole>> = {
  'field-slide': 'field-still',
  pattern: 'pattern-still',
};

/**
 * Gives every picture box of a placed slide its dithered still (LANDING.md 2.0 "Slides"): a
 * thumbnail takes the hero frame's thumbnail's inlined still of the same slide (no request); a
 * large slide takes the served still of its role in the page's appearance, requested when it is
 * first drawn (slide 7's and slide 8's pictures, 4.2). A box that has a still already is left.
 */
export function drawStills(root: HTMLElement, size: 'thumb' | 'large'): void {
  for (const box of root.querySelectorAll<HTMLElement>('[data-field]')) {
    const field = box.dataset['field'] ?? '';
    const role = ROLE_OF_FIELD[field];
    if (size === 'large' && role !== undefined) {
      try {
        const url = `url("${homeAsset(role, appearance()).path}")`;
        if (box.style.getPropertyValue('--ts-still') !== url)
          box.style.setProperty('--ts-still', url);
      } catch {
        /* the build has not written the still: the box keeps the thumbnail's */
      }
      if (box.style.getPropertyValue('--ts-still') !== '') continue;
    }
    if (box.style.getPropertyValue('--ts-still') !== '') continue;
    if (getComputedStyle(box).getPropertyValue('--ts-still').trim() !== '') continue;
    // each picture's field name is its slide's own, so a slide a menu row copied finds it too
    const twin = document.querySelector<HTMLElement>(`[data-hero-thumb] [data-field="${field}"]`);
    if (twin === null) continue;
    const cs = getComputedStyle(twin);
    for (const name of ['--ts-still', '--ts-still-disc']) {
      const value = cs.getPropertyValue(name).trim();
      if (value !== '') box.style.setProperty(name, value);
    }
  }
}
