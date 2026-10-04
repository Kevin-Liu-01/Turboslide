import { AGENTS, HISTORY, VERSIONS } from '../copy';
import { HOME_SLIDE_MARKUP } from '../bands/deck.generated';
import { LIVE_SLIDE_HTML } from '../bands/live.generated';
import { cloneSlide, registerDeckSlides } from './index';
import type { LiveContext } from './index';
import { drawStills, paintSlide, renumber } from './paint';
import type { HomeDeckState, SlideKey, Version } from './state';

import '../editing.css';

/**
 * Version history's scrubber and Restore This Version (docs/LANDING.md 2.9 "The scrubber";
 * prototype C's "Every change has an author", without its Play: the pick is "drag through versions
 * and restore"). A slider over the versions the store keeps: the deck before the recorded run, the
 * run's three steps, then one per change made on the page. A drag, a click on the track, the arrows
 * (one version), Page Up and Page Down (five), Home and End choose a version; the slide above shows
 * the slide that version changed as it stood then, by a cut (3.6 S1), and the caption names the
 * version; nothing else on the page changes while the visitor scrubs. Restore This Version commits
 * one change by You whose state is that version's, so every band shows it and a new newest version
 * enters; it is `aria-disabled` on the newest. The thumb is an ink square, the ticks ink for You and
 * titanium for Agent and the recorded versions (2.0 "Colour": nothing blue at rest). V2's file,
 * started with the agents band's chunk.
 */

/** Page Up and Page Down move this many versions (2.9). */
const PAGE = 5;

/** "6:45 PM": the hour without a leading zero, as the product's Version history writes it. */
const timeOf = (at: number): string =>
  new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** The slide a version shows: the one it changed, else slide 1 (a change of the whole deck). */
function slideOf(v: Version): SlideKey {
  if (v.slide !== null && v.state.order.includes(v.slide)) return v.slide;
  return v.state.order[0] ?? ('title' as SlideKey);
}

/** The caption of a version (generated text, 2.9). */
function captionOf(v: Version, total: number): string {
  if (v.recorded) return VERSIONS.recordedCaption(v.n, total);
  const caption = VERSIONS.caption(v.n, total, AGENTS.author[v.author], timeOf(v.at));
  const name = v.state.versionNames[v.n];
  return name === undefined ? caption : `${caption.replace(/\.$/, '')}, named ${name}.`;
}

/** The band entry the loader starts with the agents band (LANDING.md 6.3). */
export function start(ctx: LiveContext): void {
  startVersions(ctx);
}

const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  return el;
};

export function startVersions(ctx: LiveContext): void {
  const { band, store } = ctx;
  const scope = ctx.reserve ?? band;
  registerDeckSlides(HOME_SLIDE_MARKUP);
  const history = scope.querySelector<HTMLElement>('[data-history]');

  // ---- the scrubber row: the hooks V1's shell draws, else the row built before the list ----
  let row = scope.querySelector<HTMLElement>('[data-versions]');
  let slider = scope.querySelector<HTMLElement>('[data-version-slider]');
  let restore = scope.querySelector<HTMLButtonElement>('[data-version-restore]');
  let caption = scope.querySelector<HTMLElement>('[data-version-caption]');
  if (row === null) {
    row = h('div', { class: 'ts-versions', 'data-versions': '' });
    if (history !== null) history.before(row);
    else scope.append(row);
  }
  if (slider === null) {
    slider = h('div', { 'data-version-slider': '' });
    row.append(slider);
  }
  if (restore === null) {
    restore = h('button', { type: 'button', class: 'pt-ib ts-button', 'data-version-restore': '' });
    restore.textContent = VERSIONS.restore;
    row.append(restore);
  }
  if (caption === null) {
    caption = h('p', { class: 'ts-versions-caption', 'data-version-caption': '' });
    row.append(caption);
  }
  const sliderEl = slider;
  const restoreEl = restore;
  const captionEl = caption;
  sliderEl.classList.add('ts-versions-slider');
  sliderEl.setAttribute('role', 'slider');
  sliderEl.setAttribute('aria-label', VERSIONS.sliderName);
  sliderEl.tabIndex = 0;
  const track =
    sliderEl.querySelector<HTMLElement>('.ts-versions-track') ??
    h('div', { class: 'ts-versions-track' });
  const ticks =
    sliderEl.querySelector<HTMLElement>('.ts-versions-ticks') ??
    h('div', { class: 'ts-versions-ticks', 'aria-hidden': 'true' });
  const thumb =
    sliderEl.querySelector<HTMLElement>('.ts-versions-thumb') ??
    h('span', { class: 'ts-versions-thumb', 'aria-hidden': 'true' });
  if (!track.isConnected) sliderEl.append(track);
  if (!ticks.isConnected) sliderEl.append(ticks);
  if (!thumb.isConnected) track.append(thumb);
  restoreEl.textContent = VERSIONS.restore;
  captionEl.setAttribute('aria-live', 'off');

  // ---- the slide above, and the view laid over it while an earlier version is chosen ----
  // the slide above's sheet, and the box the view is placed against: V3's stage around it (R11),
  // else the sheet's parent, which may hold more than the sheet (the console and Version history
  // under it at 390), so the view takes the sheet's own box in it
  const sheetAbove =
    scope.querySelector<HTMLElement>('[data-fill="agents"]') ??
    scope.querySelector<HTMLElement>('[data-home-slides]')?.parentElement ??
    null;
  const above =
    scope.querySelector<HTMLElement>('[data-agents-stage]') ?? sheetAbove?.parentElement ?? null;
  let view: HTMLElement | null = null;
  /** lays the view on the sheet's box inside `above` */
  const fit = (el: HTMLElement): void => {
    if (above === null || sheetAbove === null) return;
    const a = above.getBoundingClientRect();
    const r = sheetAbove.getBoundingClientRect();
    Object.assign(el.style, {
      // inline, so a band's rule for the sheets in its stage (`position: relative`) never puts the
      // view in the flow under the slide
      position: 'absolute',
      top: `${r.top - a.top - above.clientTop}px`,
      left: `${r.left - a.left - above.clientLeft}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      right: 'auto',
      bottom: 'auto',
    });
  };
  const viewOf = (): HTMLElement | null => {
    if (above === null) return null;
    if (view !== null) return view;
    if (getComputedStyle(above).position === 'static') above.style.position = 'relative';
    view = h('div', {
      class: 'ts-home-sheet ts-version-view',
      'data-version-view': '',
      'data-live-overlay': '',
    });
    view.hidden = true;
    above.append(view);
    return view;
  };
  // the sheet's box follows the column's width: the view follows it while it shows
  if (sheetAbove !== null && typeof ResizeObserver === 'function')
    new ResizeObserver(() => {
      if (view !== null && !view.hidden) fit(view);
    }).observe(sheetAbove);

  const templates = document.createElement('template');
  /** a root of the version's slide as it stood: the recorded step's own render for slide 5 */
  const rootFor = (v: Version): HTMLElement | null => {
    const key = slideOf(v);
    const step = v.state.agentStep;
    if (key === 'next-steps' && (step === 1 || step === 2)) {
      // the renderer's output rendered at build (bands.generated.ts LIVE_SLIDE_HTML)
      templates.innerHTML =
        step === 1 ? LIVE_SLIDE_HTML.nextSteps.placeholders : LIVE_SLIDE_HTML.nextSteps.titled;
      const el = templates.content.firstElementChild as HTMLElement | null;
      if (el !== null) el.dataset['instance'] = 'version-view';
      return el;
    }
    return cloneSlide(key, v.state, 'version-view');
  };

  // ---- the chosen version ----
  let versions = store.versions();
  let chosen = versions.length;

  const draw = (): void => {
    versions = store.versions();
    const total = versions.length;
    chosen = Math.max(1, Math.min(total, chosen));
    const v = versions[chosen - 1];
    if (v === undefined) return;
    const newest = chosen === total;
    sliderEl.setAttribute('aria-valuemin', '1');
    sliderEl.setAttribute('aria-valuemax', String(total));
    sliderEl.setAttribute('aria-valuenow', String(chosen));
    const text = captionOf(v, total);
    sliderEl.setAttribute('aria-valuetext', text);
    const at = total === 1 ? 1 : (chosen - 1) / (total - 1);
    thumb.style.left = `${at * 100}%`;
    // the ticks: one per version, ink for You and titanium for Agent and the recorded versions
    if (ticks.childElementCount !== total) ticks.replaceChildren(...versions.map(() => h('i')));
    versions.forEach((ver, i) => {
      const tick = ticks.children[i] as HTMLElement;
      tick.style.left = `${total === 1 ? 0 : (i / (total - 1)) * 100}%`;
      tick.dataset['author'] = ver.recorded ? 'recorded' : ver.author;
    });
    captionEl.textContent = text;
    restoreEl.setAttribute('aria-disabled', String(newest));
    const el = viewOf();
    if (el === null) return;
    if (newest) {
      el.hidden = true;
      el.replaceChildren();
      above?.removeAttribute('data-scrubbed');
      return;
    }
    const root = rootFor(v);
    if (root === null) return;
    // S1: the slide above shows the version by a cut
    el.replaceChildren(root);
    el.hidden = false;
    fit(el);
    above?.setAttribute('data-scrubbed', '');
    drawStills(root, 'large');
    paintSlide(root, v.state);
    renumber(el, v.state);
    for (const a of root.getAnimations({ subtree: true }))
      if (a instanceof CSSAnimation) a.finish();
  };

  const choose = (n: number, announce: boolean): void => {
    const was = chosen;
    chosen = Math.max(1, Math.min(store.versions().length, n));
    if (chosen === was) return;
    draw();
    if (announce) ctx.announce(captionEl.textContent ?? '');
  };

  // ---- pointer: a click on the track or a drag of the thumb ----
  const fromPointer = (x: number): number => {
    const r = track.getBoundingClientRect();
    const total = store.versions().length;
    const t = r.width === 0 ? 1 : Math.max(0, Math.min(1, (x - r.left) / r.width));
    return Math.round(t * (total - 1)) + 1;
  };
  let dragging: number | null = null;
  sliderEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    sliderEl.focus({ preventScroll: true });
    dragging = e.pointerId;
    try {
      sliderEl.setPointerCapture(e.pointerId);
    } catch {
      /* capture is optional */
    }
    sliderEl.setAttribute('data-active', '');
    choose(fromPointer(e.clientX), false);
  });
  sliderEl.addEventListener('pointermove', (e) => {
    if (dragging !== e.pointerId) return;
    choose(fromPointer(e.clientX), false);
  });
  const up = (e: PointerEvent): void => {
    if (dragging !== e.pointerId) return;
    dragging = null;
    sliderEl.removeAttribute('data-active');
  };
  sliderEl.addEventListener('pointerup', up);
  sliderEl.addEventListener('pointercancel', up);
  sliderEl.addEventListener('keydown', (e) => {
    const total = store.versions().length;
    let n = chosen;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') n -= 1;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') n += 1;
    else if (e.key === 'PageDown') n -= PAGE;
    else if (e.key === 'PageUp') n += PAGE;
    else if (e.key === 'Home') n = 1;
    else if (e.key === 'End') n = total;
    else return;
    e.preventDefault();
    choose(n, true);
  });

  // ---- Restore This Version ----
  restoreEl.addEventListener('click', () => {
    const list = store.versions();
    if (chosen >= list.length) return;
    const v = list[chosen - 1];
    if (v === undefined) return;
    const words = v.recorded ? HISTORY.restoredVersion(v.n) : HISTORY.restored(timeOf(v.at));
    if (store.restore(v.n, 'you', words)) {
      chosen = store.versions().length;
      draw();
      ctx.announce(captionEl.textContent ?? '');
    }
  });

  // ---- the store: a new version moves a scrubber at the newest along with it ----
  let count = versions.length;
  store.subscribe((_state: HomeDeckState) => {
    const total = store.versions().length;
    if (chosen === count || chosen > total) chosen = total;
    count = total;
    draw();
  });
  draw();
}
