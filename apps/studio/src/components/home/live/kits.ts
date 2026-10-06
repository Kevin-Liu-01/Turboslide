import { HISTORY, KITS as WORDS } from '../copy';
import { HOME_SLIDE_MARKUP } from '../bands/deck.generated';
import { KITS_ROUND } from '../design-copy';
import { HOME_THEME_CSS } from '../themes.generated';
import { cloneSlide, registerDeckSlides } from './index';
import type { LiveContext } from './index';
import { finishBand } from './motion';
import {
  applyKit,
  backgroundColors,
  drawStills,
  HEX,
  paintSlide,
  paintSlides,
  renumber,
  TEXT_MIN_RATIO,
} from './paint';
import type { HomeDeckState, KitId, SlideKey } from './state';
import { clearGround, kitOfSwatch } from './theme';

import '../editing.css';

/**
 * Brand kits restyle every slide (docs/LANDING.md 2.8; prototype C's kits and typed colour). The
 * three swatches are a replica of the Brand kit's colours (Slide > Change theme): each sets the six
 * colour variables `packages/render/src/theme-css.ts` writes on every slide root of the page, so the
 * hero frame, the miniature, the grid below, every band, the show and the print follow (`paint.ts`
 * draws them on every change); GT removes them. The words and the ground under every text box
 * change at once and the old ground outside them clears in Bayer order over 500 ms (3.6 T3).
 *
 * The Background field is a replica of the Brand kit's Background colour: each keystroke that makes
 * a valid `#rrggbb` shows it on every slide at once (K2, a cut); Enter applies it as one change;
 * Escape or leaving the field without Enter puts the kit's back. A typed colour takes the light or
 * the dark ink, whichever reads higher on it, and a colour whose best text reads under 4.5:1 is
 * refused with the sentence that names its ratio. Undo takes the band's newest change back. The grid
 * holds every slide of the deck as a thumbnail, in the deck's order. V2's file, the kits band's chunk.
 */

/** The band entry the loader starts (LANDING.md 6.3 "The band loader"). */
export function start(ctx: LiveContext): void {
  startKits(ctx);
}

export function startKits(ctx: LiveContext): void {
  const { band, root, store } = ctx;
  const scope = ctx.reserve ?? band;
  const swatches = [...band.querySelectorAll<HTMLElement>('[data-kit]')];
  const field = band.querySelector<HTMLInputElement>('[data-kit-color]');
  const status = band.querySelector<HTMLElement>('[data-kit-status]');
  const grid =
    scope.querySelector<HTMLElement>('[data-kit-grid]') ??
    band.querySelector<HTMLElement>('[data-kit-grid]');

  registerDeckSlides(HOME_SLIDE_MARKUP);
  const say = (text: string): void => {
    if (status !== null) status.textContent = text;
    ctx.announce(text);
  };

  // ---- the grid: every slide of the deck, framed as thumbnails (V1's `li[data-thumb]` items) ----
  const thumbOf = (key: SlideKey): HTMLElement | null =>
    grid?.querySelector<HTMLElement>(`:scope > [data-thumb="${key}"]`) ?? null;
  const fillThumb = (li: HTMLElement, key: SlideKey, state: HomeDeckState): void => {
    let sheet = li.querySelector<HTMLElement>('.ts-home-sheet');
    if (sheet === null) {
      sheet = document.createElement('div');
      sheet.className = 'ts-home-sheet is-thumb';
      li.append(sheet);
    }
    if (sheet.querySelector('[data-home-slides]') !== null) return;
    const slide = cloneSlide(key, state, `kits-${key}`);
    if (slide === null) return;
    slide.classList.add('is-thumb');
    sheet.append(slide);
    drawStills(slide, 'thumb');
    paintSlide(slide, state);
    for (const a of slide.getAnimations({ subtree: true }))
      if (a instanceof CSSAnimation) a.finish();
  };
  const syncGrid = (state: HomeDeckState): void => {
    if (grid === null) return;
    let before: Element | null = grid.firstElementChild;
    for (const key of state.order) {
      let li = thumbOf(key);
      if (li === null) {
        li = document.createElement('li');
        li.className = 'ts-kit-thumb';
        li.dataset['thumb'] = key;
        const n = document.createElement('span');
        n.className = 'ts-kit-thumb-n pt-num';
        n.dataset['thumbN'] = '';
        n.setAttribute('aria-hidden', 'true');
        li.append(n);
        grid.insertBefore(li, before);
      } else if (li !== before) grid.insertBefore(li, before);
      fillThumb(li, key, state);
      before = li.nextElementSibling;
    }
    for (const li of [...grid.querySelectorAll<HTMLElement>(':scope > [data-thumb]')]) {
      const key = li.dataset['thumb'] as SlideKey;
      // a slide that left the deck leaves the grid; a fixture slide's item stays hidden for its Undo
      li.hidden = !state.order.includes(key);
      if (li.hidden && key.startsWith('added-')) li.remove();
    }
    for (const li of grid.querySelectorAll<HTMLElement>(':scope > [data-thumb]')) {
      const n = state.order.indexOf(li.dataset['thumb'] as SlideKey) + 1;
      if (n > 0) li.setAttribute('aria-label', `Slide ${n}`);
    }
    renumber(grid, state);
  };

  // ---- the themes (DESIGN.md 8.7): a pick swaps in the renderer's stylesheet of that theme for
  // every slide on the page, one style element after the page's own sheets; a kit's colours are
  // inline on each slide, so they stay over any theme ----
  const tiles = [...band.querySelectorAll<HTMLElement>('[data-theme-id]')];
  let themeSheet: HTMLStyleElement | null = null;
  for (const tile of tiles)
    tile.addEventListener('click', () => {
      const id = tile.dataset['themeId'] ?? '';
      if (tile.getAttribute('aria-pressed') === 'true') return;
      if (themeSheet === null) {
        themeSheet = document.createElement('style');
        themeSheet.dataset['homeTheme'] = '';
        document.head.append(themeSheet);
      }
      themeSheet.textContent = HOME_THEME_CSS[id] ?? '';
      themeSheet.dataset['homeTheme'] = id;
      for (const other of tiles) other.setAttribute('aria-pressed', String(other === tile));
      say(KITS_ROUND.status.theme(tile.textContent?.trim() ?? id));
    });

  // ---- the swatches ----
  const paintSwatches = (state: HomeDeckState): void => {
    for (const s of swatches) {
      const on = state.background === null && kitOfSwatch(s) === state.kit;
      if (s.getAttribute('aria-pressed') !== String(on)) s.setAttribute('aria-pressed', String(on));
    }
  };
  for (const swatch of swatches)
    swatch.addEventListener('click', () => {
      finishBand('kits');
      const kit: KitId = kitOfSwatch(swatch);
      const state = store.get();
      if (kit === state.kit && state.background === null) return;
      // the veils read the old ground first; the commit's paint sets the new kit under them
      clearGround(
        root,
        () =>
          store.commit({
            band: 'kits',
            author: 'you',
            words: HISTORY.kit(WORDS.kits[kit].name),
            next: (s) => ({ ...s, kit, background: null }),
            undo: (s) => s,
          }),
        true,
      );
      if (field !== null) field.value = '';
      say(WORDS.status.kit(kit, store.get().order.length));
    });

  // ---- the typed colour ----
  /** the colour the slides preview, null while they draw the store's */
  let preview: string | null = null;
  const showPreview = (hex: string | null): void => {
    preview = hex;
    const state = store.get();
    if (hex === null) {
      paintSlides(root, state);
      return;
    }
    // K2: a cut on every slide of the page, before the change is made
    for (const slide of root.querySelectorAll<HTMLElement>('[data-home-slides]'))
      if (slide.closest('[data-live-overlay]') === null) applyKit(slide, state.kit, hex);
  };
  /** the field's value as a colour: `#` and six hex digits, a missing `#` added */
  const read = (): string => {
    const raw = (field?.value ?? '').trim().toLowerCase();
    return raw.startsWith('#') ? raw : `#${raw}`;
  };
  field?.addEventListener('input', () => {
    const hex = read();
    if (!HEX.test(hex)) {
      if (preview !== null) showPreview(null);
      return;
    }
    const { ratio } = backgroundColors(hex);
    if (ratio < TEXT_MIN_RATIO) {
      if (preview !== null) showPreview(null);
      return;
    }
    showPreview(hex);
  });
  const apply = (): void => {
    const hex = read();
    if (!HEX.test(hex)) {
      showPreview(null);
      say(WORDS.status.invalid);
      return;
    }
    const { ratio } = backgroundColors(hex);
    if (ratio < TEXT_MIN_RATIO) {
      showPreview(null);
      say(WORDS.status.contrast(hex, Math.floor(ratio * 10) / 10));
      return;
    }
    preview = null;
    if (store.get().background === hex) return;
    store.commit({
      band: 'kits',
      author: 'you',
      words: HISTORY.background(hex),
      next: (s) => ({ ...s, background: hex }),
      undo: (s) => s,
    });
    say(WORDS.status.background(hex));
  };
  field?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finishBand('kits');
      apply();
    } else if (e.key === 'Escape' && preview !== null) {
      e.preventDefault();
      showPreview(null);
      say(WORDS.status.backgroundReset);
    }
  });
  field?.addEventListener('blur', () => {
    if (preview === null) return;
    showPreview(null);
    say(WORDS.status.backgroundReset);
  });

  // ---- the store ----
  store.subscribe((state, event) => {
    syncGrid(state);
    paintSwatches(state);
    if (preview !== null && event.change.band !== 'kits') showPreview(preview);
    if (event.kind === 'undo' && event.change.band === 'kits') {
      if (field !== null && document.activeElement !== field) field.value = '';
      say(
        state.background !== null
          ? WORDS.status.background(state.background)
          : WORDS.status.kit(state.kit, state.order.length),
      );
    }
  });
  const state = store.get();
  syncGrid(state);
  paintSwatches(state);
}
