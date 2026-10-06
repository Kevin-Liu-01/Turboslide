import { TAILOR as PRODUCT_TAILOR } from '@turboslide/chrome/panels/assist-strings';

import { HISTORY, KITS as KIT_WORDS, MENUS as WORDS } from '../copy';
import { HOME_DECK } from '../deck.generated';
import type { HomeSlideId, SheetBox } from '../deck.generated';
import { HOME_SLIDE_MARKUP } from '../bands/deck.generated';
import { MINI_BLANK, MINI_BLOCKS, MINI_MENUS, MINI_SIZES } from '../menus.generated';
import type { MiniMenu, MiniRow } from '../menus.generated';
import { cloneSlide, registerDeckSlides, registerSlide } from './index';
import type { LiveContext } from './index';
import { ease, finishBand, ms, play } from './motion';
import { createObjects, objectName } from './objects';
import type { ObjectsController } from './objects';
import {
  drawStills,
  paintSlide,
  registerInsertMarkup,
  renumber,
  roleOf,
  sheetLayout,
  UNITS,
} from './paint';
import { insertAfter, sourceOf } from './state';
import type {
  AddedSlideId,
  BlockStyle,
  Change,
  HomeDeckState,
  InsertedBlock,
  KitId,
  ObjectKey,
  SlideKey,
} from './state';
import { HOME_GLYPHS } from '../sprite.generated';
import { glyph } from './sprite';
import { clearGround } from './theme';

import '../editing.css';

/**
 * Menus and keyboard shortcuts (docs/LANDING.md 2.5; docs/DESIGN.md 8.4): the editor in miniature
 * over the page deck. The menu bar is generated from the editor's own model
 * (`menus.generated.ts`, written at build from `packages/chrome/src/menus/model.ts` and `keys.ts`),
 * so every label, rule, submenu and shortcut is the editor's. The rows 2.5's table lists run on the
 * page: each change goes through the store, shows wherever the page draws the slide (the hero
 * frame, every filmstrip, the kits grid, the show and the print, `paint.ts`) and writes its Version
 * history row; Edit > Undo, or Cmd or Ctrl+Z with focus in the band, takes the band's newest
 * change back. Every other row is drawn as a working row with its shortcut and, when pressed, sets
 * the status to "This row runs in the editor." with the row's own sentence; only the rows the
 * editor itself disables with nothing selected are grey (the model's `off`, DESIGN.md 8.4). Each
 * row draws the model's glyph from the landing's sprite (`menu-glyphs.generated.ts`, imported on
 * its own when the band starts), a checked row the editor's check and a submenu the `next` glyph.
 *
 * The bar is a `menubar` with a roving tabindex: Left and Right move between menus, Down, Enter or
 * Space opens one, Up and Down move between rows, Right opens a submenu, Escape closes and returns
 * focus to the title, and with a menu open a pointer over another title opens it, as the editor's do.
 * Menus open and close by cuts (3.6 M1). Under 720 px one Menus key lists the nine menus and drills
 * into one (C's phone editor). The stage takes the editor's selection (`objects.ts`); the
 * filmstrip shows a slide on a click and moves the focused one with Cmd or Ctrl and Up or Down; the
 * notes field writes the shown slide's notes, which the show's bar reads. V2's file, the menus
 * band's chunk.
 */

/** The sheet's content margins and centre lines, in units (LANDING.md 2.2). */
const MARGIN_L = 137;
const MARGIN_R = 1463;
const CENTRE_X = UNITS / 2;
const CENTRE_Y = 450;
/** A copy (Edit > Duplicate) lands this far right of and below its source, in units. */
const COPY_OFFSET = 24;
/** Typing in the notes field writes one change per pause this long (2.5 "Interaction"). */
const NOTES_PAUSE_MS = 500;
/** The slide the stage shows at rest (2.0's table: slide 2 is the menus band's subject). */
const REST_SLIDE: HomeSlideId = 'plan';

/** The model's sentence for a row that needs an object (arrange rows, model.ts). */
const NEEDS_OBJECT = 'Select an object on the slide first.';

// ---------------------------------------------------------------------------------------------
// Small DOM helpers (no markup strings but the renderer's)

type Attrs = Record<string, string | number | boolean | undefined>;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (name === 'class') el.className = String(value);
    else el.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children) if (child !== null && child !== undefined) el.append(child);
  return el;
}

/** One parsed key chord of a binding (the model's raw `Cmd+Shift+L` forms). */
type Chord = { meta: boolean; ctrl: boolean; alt: boolean; shift: boolean; key: string };

const isMac = (): boolean => {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform === 'macOS' || /Mac|iPhone|iPad/.test(navigator.platform);
};

function chordsOf(binding: string, mac: boolean): Chord[] {
  return binding.split(/\s+or\s+/).map((text) => {
    const parts = text.split('+');
    const key = parts.pop() ?? '';
    const c: Chord = { meta: false, ctrl: false, alt: false, shift: false, key };
    for (const p of parts) {
      if (p === 'Cmd') {
        if (mac) c.meta = true;
        else c.ctrl = true;
      } else if (p === 'Ctrl') c.ctrl = true;
      else if (p === 'Option' || p === 'Alt') c.alt = true;
      else if (p === 'Shift') c.shift = true;
    }
    return c;
  });
}

/** The key's name in the model's form, from the physical key where a modifier changes the letter. */
function keyName(e: KeyboardEvent): string {
  if (e.code.startsWith('Key')) return e.code.slice(3);
  if (e.code.startsWith('Digit')) return e.code.slice(5);
  const named: Record<string, string> = {
    Slash: '/',
    Backslash: '\\',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Enter',
    NumpadEnter: 'Enter',
    Delete: 'Delete',
    Backspace: 'Delete',
    F5: 'F5',
    Space: 'Space',
  };
  return named[e.code] ?? e.key;
}

const matches = (e: KeyboardEvent, chord: Chord): boolean =>
  e.metaKey === chord.meta &&
  e.ctrlKey === chord.ctrl &&
  e.altKey === chord.alt &&
  e.shiftKey === chord.shift &&
  keyName(e) === chord.key;

/** Every row of the menus, depth first, with its path of labels. */
function walk(menus: readonly MiniMenu[]): { row: MiniRow; path: string[]; menu: number }[] {
  const out: { row: MiniRow; path: string[]; menu: number }[] = [];
  const go = (rows: readonly MiniRow[], path: string[], menu: number): void => {
    for (const row of rows) {
      out.push({ row, path: [...path, row.label], menu });
      if (row.items !== undefined) go(row.items, [...path, row.label], menu);
    }
  };
  menus.forEach((m, i) => go(m.rows, [m.label], i));
  return out;
}

const ALL_ROWS = walk(MINI_MENUS);
const rowById = (id: string): MiniRow | undefined => ALL_ROWS.find((r) => r.row.id === id)?.row;

/**
 * The rows' model sentences (`menu-docs.generated.ts`): a chunk of their own, imported on the
 * miniature's first hover, focus or press of a menu or a row, so they are not part of the page's
 * script until a row is used (docs/DESIGN.md 8.16, the design round's finishing fix). `docs` is
 * null until it arrives; a row that answers with its sentence waits for it.
 */
type Docs = { docOf(row: { readonly at: number }): string };
let docs: Docs | null = null;
let docsLoad: Promise<Docs> | null = null;
const loadDocs = (): Promise<Docs> =>
  (docsLoad ??= import('../menu-docs.generated')
    .then((m) => (docs = m))
    .catch((error: unknown) => {
      console.error("the menus' sentences did not load", error);
      docsLoad = null;
      return { docOf: () => '' };
    }));
/** A row's sentence once the sentences arrived, else ''. */
const docNow = (row: MiniRow | undefined): string =>
  row === undefined || docs === null ? '' : docs.docOf(row);
/** A row's sentence, after the sentences arrive. */
const docOf = async (row: MiniRow | undefined): Promise<string> =>
  row === undefined ? '' : (await loadDocs()).docOf(row);

/**
 * True when the row runs on the page, or is a submenu with a row under it that does (File >
 * Download for Download > PDF document): the editor draws such a submenu available, so it reads in
 * ink beside the rows it leads to (2.5, verify1 F10).
 */
const runsUnder = (row: MiniRow): boolean => row.run === true || (row.items ?? []).some(runsUnder);

// ---------------------------------------------------------------------------------------------

/** The band entry the loader starts (LANDING.md 6.3 "The band loader"). */
export function start(ctx: LiveContext): void {
  startMenus(ctx);
}

export function startMenus(ctx: LiveContext): void {
  const { band, store } = ctx;
  const box = ctx.reserve ?? band;
  const mac = isMac();

  // the renderer's markup of the inserted blocks and the blank slide (menus.generated.ts)
  registerInsertMarkup('text', MINI_BLOCKS.text);
  registerInsertMarkup('rect', MINI_BLOCKS.rect);
  registerInsertMarkup('oval', MINI_BLOCKS.oval);
  const templates = document.createElement('template');
  const parse = (html: string): HTMLElement | null => {
    // the renderer's output rendered at build (bands.generated.ts, menus.generated.ts)
    templates.innerHTML = html;
    return templates.content.firstElementChild as HTMLElement | null;
  };
  registerDeckSlides(HOME_SLIDE_MARKUP);
  const blankRoot = parse(MINI_BLANK);
  if (blankRoot !== null) registerSlide('blank', blankRoot);

  // ---- the frame: the document's (HomeMenus.tsx): the title row, the menu bar, the plates'
  // layer, the filmstrip and the stage, the notes and the status row ----
  const find = <T extends HTMLElement>(selector: string): T => box.querySelector<T>(selector) as T;
  const frame = find('[data-mini-editor]');
  const titleText = find('[data-mini-title]');
  const countText = find('[data-mini-count]');
  const bar = find('[data-menubar]');
  bar.setAttribute('role', 'menubar');
  bar.setAttribute('aria-label', WORDS.menusKey);
  bar.setAttribute('data-keeps-selection', '');
  const strip = find<HTMLOListElement>('[data-mini-filmstrip]');
  strip.setAttribute('aria-label', WORDS.filmstripLabel);
  const stage = find('[data-mini-stage]');
  const sheetBox =
    stage.querySelector<HTMLElement>('.ts-home-sheet') ??
    h('div', { class: 'ts-home-sheet ts-mini-sheet' });
  if (!sheetBox.isConnected) stage.append(sheetBox);
  const notes = find<HTMLTextAreaElement>('[data-mini-notes]');
  notes.setAttribute('aria-label', WORDS.notesLabel);
  notes.placeholder = 'Click to add speaker notes';
  const status = find('[data-mini-status]');
  const readout = find('[data-mini-readout]');
  if ((status.textContent ?? '').trim() === '') status.textContent = WORDS.statusRest;
  // the plates' layer follows the menu bar: over the frame from 720 px, and in the flow under the
  // Menus key under 720 px, so an open menu is never clipped (DESIGN.md 8.4)
  const plates = find('.ts-mini-plates');

  const say = (text: string): void => {
    status.textContent = text;
    status.toggleAttribute('data-said', true);
    ctx.announce(text);
  };

  // the rows' sentences arrive on the first hover, focus or press of the menu bar or a plate; the
  // rows drawn by then take their tooltip names (`data-tip`), and the rows drawn after take theirs
  // as they are made
  const tipRows = (): void => {
    for (const el of plates.querySelectorAll<HTMLElement>('.ts-mini-row')) {
      const doc = docNow((el as HTMLElement & { miniRow?: MiniRow }).miniRow);
      if (doc !== '' && !el.hasAttribute('data-tip')) el.setAttribute('data-tip', doc);
    }
  };
  const wantDocs = (): void => {
    if (docs !== null) return;
    for (const type of ['pointerover', 'focusin', 'pointerdown'] as const) {
      bar.removeEventListener(type, wantDocs);
      plates.removeEventListener(type, wantDocs);
    }
    void loadDocs().then(tipRows);
  };
  for (const type of ['pointerover', 'focusin', 'pointerdown'] as const) {
    bar.addEventListener(type, wantDocs, { passive: true });
    plates.addEventListener(type, wantDocs, { passive: true });
  }

  // a press on the stage's ground focuses the stage, so the band's keys (Cmd or Ctrl+Z, the rows'
  // shortcuts) act after a click beside the slide, as the editor's canvas takes the keys
  stage.tabIndex = -1;
  stage.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('[data-object]') === null)
      stage.focus({ preventScroll: true });
  });

  // ---- the shown slide, the stage and its selection ----
  let shown: SlideKey = REST_SLIDE;
  const objects: ObjectsController = createObjects(ctx, 'menus', sheetBox);
  const slideNumber = (key: SlideKey = shown): number => store.get().order.indexOf(key) + 1;

  const show = (key: SlideKey, focusThumb = false): void => {
    const state = store.get();
    if (!state.order.includes(key)) key = state.order[0] ?? REST_SLIDE;
    const current = sheetBox.querySelector<HTMLElement>('[data-home-slides]');
    shown = key;
    for (const li of strip.querySelectorAll<HTMLElement>('[data-mini-thumb]')) {
      const on = li.dataset['miniThumb'] === key;
      li.toggleAttribute('data-selected', on);
      li.setAttribute('aria-current', String(on));
      if (on && focusThumb) li.focus({ preventScroll: true });
    }
    if (current?.dataset['slide'] === key) return;
    const fresh = cloneSlide(key, state, 'mini-stage');
    if (fresh === null) return;
    // the stage changes by a cut (3.6 M1), as the editor's does
    if (current === null || current === undefined) sheetBox.append(fresh);
    else current.replaceWith(fresh);
    drawStills(fresh, 'large');
    paintSlide(fresh, state);
    renumber(sheetBox, state);
    settle(fresh);
    paintNotes();
    sheetBox.setAttribute('aria-label', `Slide ${slideNumber()}`);
  };
  /** the renderer's slide cut ends at once in a slide placed after load */
  const settle = (el: Element): void => {
    for (const a of el.getAnimations({ subtree: true })) if (a instanceof CSSAnimation) a.finish();
  };

  objects.onChange((sel, b) => {
    if (sel === null || b === null) {
      readout.textContent = '';
      return;
    }
    readout.textContent = WORDS.readout(sel.role, b.x, b.y, b.rot);
  });

  // ---- the filmstrip ----
  const thumbOf = (key: SlideKey): HTMLElement | null =>
    strip.querySelector<HTMLElement>(`[data-mini-thumb="${key}"]`);
  const makeThumb = (key: SlideKey): HTMLElement | null => {
    const state = store.get();
    const root = cloneSlide(key, state, `mini-thumb-${key}`);
    if (root === null) return null;
    root.classList.add('is-thumb');
    const sheet = h('div', { class: 'ts-home-sheet is-thumb' }, root);
    const li = h(
      'li',
      { class: 'ts-mini-thumb', 'data-mini-thumb': key, tabindex: -1 },
      h('span', { class: 'ts-mini-thumb-n', 'data-thumb-n': true, 'aria-hidden': 'true' }),
      sheet,
    );
    return li;
  };
  const syncStrip = (state: HomeDeckState): void => {
    const want = state.order;
    let before: Element | null = strip.firstElementChild;
    for (const key of want) {
      let li = thumbOf(key);
      if (li === null) {
        li = makeThumb(key);
        if (li === null) continue;
        strip.insertBefore(li, before);
        const root = li.querySelector<HTMLElement>('[data-home-slides]');
        if (root !== null) {
          drawStills(root, 'thumb');
          paintSlide(root, state);
          settle(root);
        }
      } else if (li !== before) strip.insertBefore(li, before);
      before = li.nextElementSibling;
    }
    for (const li of [...strip.querySelectorAll<HTMLElement>('[data-mini-thumb]')])
      if (!want.includes(li.dataset['miniThumb'] as SlideKey)) li.remove();
    for (const li of strip.querySelectorAll<HTMLElement>('[data-mini-thumb]')) {
      const key = li.dataset['miniThumb'] as SlideKey;
      const title = titleOf(key, state);
      li.setAttribute(
        'aria-label',
        `Slide ${want.indexOf(key) + 1}${title === '' ? '' : `, ${title}`}`,
      );
      li.tabIndex = key === shown ? 0 : -1;
    }
    renumber(strip, state);
  };
  const titleOf = (key: SlideKey, state: HomeDeckState): string => {
    const source = sourceOf(state, key);
    if (source === 'blank') return '';
    return (HOME_DECK.slides[source]?.title ?? '').split(HOME_DECK.customer).join(state.customer);
  };

  strip.addEventListener('click', (e) => {
    const li = (e.target as Element).closest<HTMLElement>('[data-mini-thumb]');
    if (li === null || dragged) return;
    show(li.dataset['miniThumb'] as SlideKey, true);
  });

  // a drag moves a slide, as the editor's filmstrip does (Kevin: "we must be able to drag and move
  // around ANYTHING"): past 4 px the thumbnail lifts with the live outline in --pt-select, the
  // others make room by transform over 200 ms (3.6 T4), the drop is one change of the order with
  // its row and its Undo; on touch a 350 ms press lifts it, so a swipe still scrolls the strip
  type Lift = {
    li: HTMLElement;
    pointer: number;
    x0: number;
    y0: number;
    list: HTMLElement[];
    rects: DOMRect[];
    from: number;
    to: number;
    on: boolean;
    touch: boolean;
    timer: number;
  };
  let lift: Lift | null = null;
  let dragged = false;
  const LIFT_PX = 4;
  const PRESS_MS = 350;
  const startLift = (g: Lift): void => {
    g.on = true;
    g.li.setAttribute('data-lifted', '');
    const st = g.li.style;
    st.position = 'relative';
    st.zIndex = '3';
    const ring = h('span', {
      'data-live-overlay': true,
      'data-lift-ring': true,
      'aria-hidden': 'true',
    });
    const sheet = (g.li.querySelector('.ts-home-sheet') ?? g.li).getBoundingClientRect();
    const home = g.li.getBoundingClientRect();
    Object.assign(ring.style, {
      position: 'absolute',
      left: `${sheet.left - home.left}px`,
      top: `${sheet.top - home.top}px`,
      width: `${sheet.width}px`,
      height: `${sheet.height}px`,
      boxSizing: 'border-box',
      border: '2px solid var(--pt-select)',
      zIndex: '4',
      pointerEvents: 'none',
    });
    g.li.append(ring);
    try {
      strip.setPointerCapture(g.pointer);
    } catch {
      /* capture is optional */
    }
  };
  const endLift = (g: Lift): void => {
    g.li.removeAttribute('data-lifted');
    g.li.querySelector('[data-lift-ring]')?.remove();
    for (const t of g.list)
      for (const p of ['position', 'z-index', 'transform', 'transition']) t.style.removeProperty(p);
  };
  strip.addEventListener('pointerdown', (e) => {
    const li = (e.target as Element).closest<HTMLElement>('[data-mini-thumb]');
    if (li === null || e.button !== 0) return;
    dragged = false;
    const list = [...strip.querySelectorAll<HTMLElement>('[data-mini-thumb]')].filter(
      (t) => !t.hidden,
    );
    const g: Lift = {
      li,
      pointer: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      list,
      rects: list.map((t) => t.getBoundingClientRect()),
      from: list.indexOf(li),
      to: list.indexOf(li),
      on: false,
      touch: e.pointerType === 'touch',
      timer: 0,
    };
    lift = g;
    if (g.touch) g.timer = window.setTimeout(() => lift === g && !g.on && startLift(g), PRESS_MS);
  });
  strip.addEventListener('dragstart', (e) => e.preventDefault());
  strip.addEventListener('pointermove', (e) => {
    const g = lift;
    if (g === null || e.pointerId !== g.pointer) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.on) {
      if (g.touch) {
        if (Math.hypot(dx, dy) > 8) {
          window.clearTimeout(g.timer);
          lift = null;
        }
        return;
      }
      if (Math.hypot(dx, dy) < LIFT_PX) return;
      startLift(g);
    }
    dragged = true;
    g.li.style.transform = `translate(${dx}px, ${dy}px)`;
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
      if (t === g.li) continue;
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
    if (!g.on) return;
    const held = g.li.getBoundingClientRect();
    endLift(g);
    const key = g.li.dataset['miniThumb'] as SlideKey;
    const order = store.get().order;
    const from = order.indexOf(key);
    const target = g.list[g.to]?.dataset['miniThumb'] as SlideKey | undefined;
    const at = target === undefined ? from : order.indexOf(target);
    if (e.type === 'pointerup' && at !== from && at >= 0) {
      commit({
        words: HISTORY.slideMoved(from + 1, at + 1),
        slide: key,
        next: (s) => {
          const rest = s.order.filter((k) => k !== key);
          rest.splice(Math.max(0, Math.min(rest.length, at)), 0, key);
          return { ...s, order: rest };
        },
      });
    }
    // T5: the dropped slide settles from where it was held
    const home = g.li.getBoundingClientRect();
    play(
      g.li,
      [
        { transform: `translate(${held.left - home.left}px, ${held.top - home.top}px)` },
        { transform: 'none' },
      ],
      'settle',
      'arrive',
      'menus',
    );
    show(key, true);
  };
  strip.addEventListener('pointerup', drop);
  strip.addEventListener('pointercancel', drop);
  strip.addEventListener('keydown', (e) => {
    const li = (e.target as Element).closest<HTMLElement>('[data-mini-thumb]');
    if (li === null) return;
    const list = [...strip.querySelectorAll<HTMLElement>('[data-mini-thumb]')];
    const i = list.indexOf(li);
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))
      return; // the band's shortcuts move the slide (Slide > Move slide)
    if (
      e.key === 'ArrowUp' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowDown' ||
      e.key === 'ArrowRight'
    ) {
      e.preventDefault();
      const by = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1;
      const next = list[Math.max(0, Math.min(list.length - 1, i + by))];
      if (next !== undefined) show(next.dataset['miniThumb'] as SlideKey, true);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const next = e.key === 'Home' ? list[0] : list[list.length - 1];
      if (next !== undefined) show(next.dataset['miniThumb'] as SlideKey, true);
    }
  });

  // ---- the notes field ----
  const notesOf = (key: SlideKey, state: HomeDeckState): string => {
    const typed = state.notes[key];
    if (typed !== undefined) return typed;
    const source = sourceOf(state, key);
    if (source === 'blank') return '';
    return (HOME_DECK.slides[source]?.notes ?? '').split(HOME_DECK.customer).join(state.customer);
  };
  const paintNotes = (): void => {
    if (document.activeElement === notes) return;
    const text = notesOf(shown, store.get());
    if (notes.value !== text) notes.value = text;
  };
  let notesTimer = 0;
  const commitNotes = (): void => {
    window.clearTimeout(notesTimer);
    const key = shown;
    const text = notes.value;
    if (text === notesOf(key, store.get())) return;
    store.commit({
      band: 'menus',
      author: 'you',
      words: HISTORY.notesEdited(slideNumber(key)),
      slide: key,
      coalesce: `notes:${key}`,
      next: (s) => ({ ...s, notes: { ...s.notes, [key]: text } }),
      undo: (s) => s,
    });
  };
  notes.addEventListener('input', () => {
    window.clearTimeout(notesTimer);
    notesTimer = window.setTimeout(commitNotes, NOTES_PAUSE_MS);
  });
  notes.addEventListener('blur', commitNotes);

  // ---- the view toggles (page settings, not deck changes) ----
  const view = { notes: true, strip: true };
  const paintView = (): void => {
    frame.toggleAttribute('data-notes-off', !view.notes);
    frame.toggleAttribute('data-strip-off', !view.strip);
  };

  // ---- changes ----
  const commit = (
    change: Omit<Change, 'band' | 'author' | 'undo'> & { undo?: Change['undo'] },
  ): void => {
    store.commit({ band: 'menus', author: 'you', undo: (s) => s, ...change });
    const words = change.words;
    if (words !== null) say(`${words}.`);
  };

  /** the selected object of the stage, or the model's sentence and null */
  const selected = (row: MiniRow): { id: ObjectKey; el: HTMLElement; root: HTMLElement } | null => {
    const sel = objects.selected();
    if (sel === null || sel.root !== sheetBox.querySelector('[data-home-slides]')) {
      say(row.needs ?? NEEDS_OBJECT);
      return null;
    }
    return sel;
  };
  const poseOf = (id: ObjectKey): SheetBox | null => objects.poseOf(id);
  const setPose = (id: ObjectKey, p: SheetBox, words: string): void => {
    const slide = shown;
    commit({
      words,
      slide,
      next: (s) => ({
        ...s,
        poses: { ...s.poses, [id]: p },
        canvas: { ...s.canvas, [slide]: true },
      }),
    });
  };
  const setStyle = (id: ObjectKey, patch: Partial<BlockStyle> | null, words: string): void => {
    commit({
      words,
      slide: shown,
      next: (s) => {
        const styles = { ...s.styles };
        if (patch === null) delete styles[id];
        else {
          const next: BlockStyle = { ...styles[id], ...patch };
          for (const k of Object.keys(next) as (keyof BlockStyle)[])
            if (next[k] === undefined) delete next[k];
          styles[id] = next;
        }
        return { ...s, styles };
      },
    });
  };
  let insertCount = 0;
  const nextInsertId = (slide: SlideKey): ObjectKey => {
    const state = store.get();
    let k = state.blocks.length + insertCount + 1;
    while (state.blocks.some((b) => b.id === `${slide}#ins-${k}`)) k += 1;
    insertCount += 1;
    return `${slide}#ins-${k}` as ObjectKey;
  };
  const insertBlock = (kind: InsertedBlock['kind'], what: string, source?: ObjectKey): void => {
    const slide = shown;
    const id = nextInsertId(slide);
    let box: SheetBox;
    if (kind === 'copy' && source !== undefined) {
      const p = poseOf(source) ?? { x: CENTRE_X - 240, y: CENTRE_Y - 32, w: 480, h: 64, rot: 0 };
      box = { ...p, x: p.x + COPY_OFFSET, y: p.y + COPY_OFFSET };
    } else {
      const [w, hh] = kind === 'text' ? MINI_SIZES.text : MINI_SIZES.shape;
      box = { x: CENTRE_X - w / 2, y: CENTRE_Y - hh / 2, w, h: hh, rot: 0 };
    }
    const block: InsertedBlock = {
      id,
      slide,
      kind,
      box: { ...box, rot: 0 },
      ...(source !== undefined ? { source } : {}),
    };
    commit({
      words:
        kind === 'copy'
          ? HISTORY.duplicatedBlock(what, slideNumber(slide))
          : HISTORY.inserted(what, slideNumber(slide)),
      slide,
      next: (s) => {
        const next = { ...s, blocks: [...s.blocks, block] };
        // a copy keeps its source's turn and styles
        if (kind === 'copy' && source !== undefined) {
          const style = s.styles[source];
          if (style !== undefined) next.styles = { ...s.styles, [id]: style };
          const text = s.texts[source];
          if (text !== undefined) next.texts = { ...s.texts, [id]: text };
          if (box.rot !== 0) next.poses = { ...s.poses, [id]: { ...block.box, rot: box.rot } };
        }
        return next;
      },
    });
    // M2: an inserted text box or shape appears selected; a text box takes typing at once
    requestAnimationFrame(() => objects.select(id, { type: kind === 'text' }));
  };

  let addedCount = 0;
  const nextAddedId = (): AddedSlideId => {
    const state = store.get();
    let k = state.added.length + addedCount + 1;
    while (state.order.includes(`added-${k}` as AddedSlideId)) k += 1;
    addedCount += 1;
    return `added-${k}` as AddedSlideId;
  };
  const addSlide = (from: SlideKey | 'blank'): void => {
    const after = shown;
    const id = nextAddedId();
    const n = slideNumber(after) + 1;
    commit({
      words: from === 'blank' ? HISTORY.slideAdded(n) : HISTORY.slideDuplicated(slideNumber(after)),
      slide: id,
      next: (s) => {
        const next: HomeDeckState = {
          ...s,
          added: [...s.added, { id, from }],
          order: insertAfter(s.order, after, id),
        };
        if (from === 'blank') return next;
        // a duplicate carries its source's words, styles, poses and inserted blocks under its own key
        const rekey = <T>(rec: Readonly<Partial<Record<string, T>>>): Record<string, T> => {
          const out: Record<string, T> = { ...(rec as Record<string, T>) };
          for (const [k, v] of Object.entries(rec))
            if (k.startsWith(`${from}#`) && v !== undefined)
              out[`${id}${k.slice(k.indexOf('#'))}`] = v;
          return out;
        };
        return {
          ...next,
          poses: rekey(s.poses),
          texts: rekey(s.texts),
          styles: rekey(s.styles),
          notes: s.notes[from] !== undefined ? { ...s.notes, [id]: s.notes[from] } : s.notes,
          skipped: s.skipped,
          canvas: s.canvas[from] === true ? { ...s.canvas, [id]: true } : s.canvas,
          blocks: [
            ...s.blocks,
            ...s.blocks
              .filter((b) => b.slide === from)
              .map((b) => ({
                ...b,
                slide: id,
                id: `${id}${b.id.slice(b.id.indexOf('#'))}` as ObjectKey,
              })),
          ],
          deleted: [
            ...s.deleted,
            ...s.deleted
              .filter((d) => d.startsWith(`${from}#`))
              .map((d) => `${id}${d.slice(d.indexOf('#'))}` as ObjectKey),
          ],
        };
      },
    });
    show(id, true);
  };
  const deleteSlide = (): void => {
    const key = shown;
    const state = store.get();
    if (state.order.length <= 1) return say('A deck keeps one slide at least.');
    const n = slideNumber(key);
    const next =
      state.order[state.order.indexOf(key) + 1] ?? state.order[state.order.indexOf(key) - 1];
    commit({
      words: HISTORY.slideDeleted(n),
      slide: key,
      next: (s) => ({
        ...s,
        order: s.order.filter((k) => k !== key),
        removed: s.removed.includes(key) ? s.removed : [...s.removed, key],
      }),
    });
    if (next !== undefined) show(next, true);
  };
  const moveSlide = (to: 'up' | 'down' | 'start' | 'end'): void => {
    const key = shown;
    const order = store.get().order;
    const from = order.indexOf(key);
    const at =
      to === 'up' ? from - 1 : to === 'down' ? from + 1 : to === 'start' ? 0 : order.length - 1;
    if (at < 0 || at >= order.length || at === from) return;
    commit({
      words: HISTORY.slideMoved(from + 1, at + 1),
      slide: key,
      next: (s) => {
        const rest = s.order.filter((k) => k !== key);
        rest.splice(Math.max(0, Math.min(rest.length, at)), 0, key);
        return { ...s, order: rest };
      },
    });
    thumbOf(key)?.focus({ preventScroll: true });
  };
  const setKit = (kit: KitId): void => {
    if (kit === store.get().kit && store.get().background === null) return;
    clearGround(
      ctx.root,
      () =>
        commit({
          words: HISTORY.kit(KIT_WORDS.kits[kit].name),
          next: (s) => ({ ...s, kit, background: null }),
        }),
      true,
    );
  };

  // ---- the rows the page runs (2.5's table), by model id ----
  let lastFocus: Element | null = null;
  const inStrip = (): boolean => lastFocus !== null && strip.contains(lastFocus);

  const RUN: Record<string, (row: MiniRow) => void> = {
    'file.rename': () => renameDialog(),
    'file.download.pdf': () => {
      const link = ctx.root.querySelector<HTMLAnchorElement>('a[data-pdf]');
      if (link === null || link.href === '')
        return void docOf(rowById('file.download.pdf')).then(say);
      const a = h('a', {
        href: link.href,
        download: link.getAttribute('download') ?? 'onboarding-plan.pdf',
      });
      a.click();
      say(`${rowById('file.download.pdf')?.label ?? 'PDF'}.`);
    },
    'file.versionHistory.nameCurrent': () => nameDialog(),
    'file.print': () => {
      const print = ctx.root.querySelector<HTMLElement>('[data-print]');
      if (print !== null) print.click();
      else window.print();
    },
    'edit.undo': (row) => {
      if (!store.undo('menus')) say(row.needs ?? 'Nothing to undo.');
    },
    'edit.redo': () => say(WORDS.noRedo),
    'edit.duplicate': (row) => {
      if (inStrip() && objects.selected() === null) return addSlide(shown);
      const sel = selected(row);
      if (sel === null) return;
      insertBlock('copy', objectName(roleOf(sel.el)), sel.id);
    },
    'edit.delete': (row) => {
      if (inStrip() && objects.selected() === null) return deleteSlide();
      const sel = selected(row);
      if (sel === null) return;
      const id = sel.id;
      objects.deselect();
      commit({
        words: HISTORY.deletedBlock(objectName(roleOf(sel.el)), slideNumber()),
        slide: shown,
        next: (s) => ({ ...s, deleted: s.deleted.includes(id) ? s.deleted : [...s.deleted, id] }),
      });
    },
    'view.slideshow': () => void openShowHere(),
    'view.showSpeakerNotes': () => {
      view.notes = !view.notes;
      paintView();
    },
    'view.showFilmstrip': () => {
      view.strip = !view.strip;
      paintView();
    },
    'insert.textBox': () => insertBlock('text', 'a text box'),
    'insert.shape.shapes.rectangle': () => insertBlock('rect', 'a rectangle'),
    'insert.shape.shapes.ellipse': () => insertBlock('oval', 'an ellipse'),
    'insert.newSlide': () => addSlide('blank'),
    'slide.newSlide': () => addSlide('blank'),
    'slide.duplicateSlide': () => addSlide(shown),
    'slide.deleteSlide': () => deleteSlide(),
    'slide.skipSlide': () => {
      const key = shown;
      const on = store.get().skipped[key] !== true;
      commit({
        words: on
          ? HISTORY.slideSkipped(slideNumber(key))
          : HISTORY.slideUnskipped(slideNumber(key)),
        slide: key,
        next: (s) => {
          const skipped = { ...s.skipped };
          if (on) skipped[key] = true;
          else delete skipped[key];
          return { ...s, skipped };
        },
      });
    },
    'slide.moveSlide.up': () => moveSlide('up'),
    'slide.moveSlide.down': () => moveSlide('down'),
    'slide.moveSlide.toBeginning': () => moveSlide('start'),
    'slide.moveSlide.toEnd': () => moveSlide('end'),
    'slide.changeTheme': () => themeDialog(),
    'format.text.bold': (row) => {
      const sel = selected(row);
      if (sel === null) return;
      const on = store.get().styles[sel.id]?.bold !== true;
      setStyle(
        sel.id,
        { bold: on ? true : undefined },
        HISTORY.styled(on ? 'bold' : 'regular', objectName(roleOf(sel.el)), slideNumber()),
      );
    },
    'format.text.underline': (row) => {
      const sel = selected(row);
      if (sel === null) return;
      const on = store.get().styles[sel.id]?.underline !== true;
      setStyle(
        sel.id,
        { underline: on ? true : undefined },
        HISTORY.styled(
          on ? 'underlined' : 'not underlined',
          objectName(roleOf(sel.el)),
          slideNumber(),
        ),
      );
    },
    'format.alignIndent.left': (row) => align(row, 'left'),
    'format.alignIndent.center': (row) => align(row, 'center'),
    'format.alignIndent.right': (row) => align(row, 'right'),
    'format.clearFormatting': (row) => {
      const sel = selected(row);
      if (sel === null) return;
      const style = store.get().styles[sel.id];
      if (style === undefined)
        return say(`${HISTORY.cleared(objectName(roleOf(sel.el)), slideNumber())}.`);
      setStyle(
        sel.id,
        style.z === undefined ? null : { bold: undefined, underline: undefined, align: undefined },
        HISTORY.cleared(objectName(roleOf(sel.el)), slideNumber()),
      );
    },
    'arrange.order.bringToFront': (row) => order(row, 'front'),
    'arrange.order.sendToBack': (row) => order(row, 'back'),
    'arrange.align.left': (row) => place(row, (p) => ({ ...p, x: MARGIN_L }), 'to the left margin'),
    'arrange.align.center': (row) =>
      place(row, (p) => ({ ...p, x: CENTRE_X - p.w / 2 }), 'to the center line'),
    'arrange.align.right': (row) =>
      place(row, (p) => ({ ...p, x: MARGIN_R - p.w }), 'to the right margin'),
    'arrange.centerOnPage.horizontally': (row) =>
      place(row, (p) => ({ ...p, x: CENTRE_X - p.w / 2 }), 'across the page'),
    'arrange.centerOnPage.vertically': (row) =>
      place(row, (p) => ({ ...p, y: CENTRE_Y - p.h / 2 }), 'down the page'),
    'arrange.rotate.clockwise': (row) => turn(row, 90),
    'arrange.rotate.counterClockwise': (row) => turn(row, -90),
    'tools.tailor': () => tailorDialog(),
    'help.searchMenus': () => searchDialog(),
    'help.keyboardShortcuts': () => shortcutsDialog(),
  };
  const align = (row: MiniRow, side: 'left' | 'center' | 'right'): void => {
    const sel = selected(row);
    if (sel === null) return;
    setStyle(
      sel.id,
      { align: side },
      HISTORY.aligned(objectName(roleOf(sel.el)), slideNumber(), side),
    );
  };
  const order = (row: MiniRow, where: 'front' | 'back'): void => {
    const sel = selected(row);
    if (sel === null) return;
    setStyle(
      sel.id,
      { z: where },
      HISTORY.ordered(objectName(roleOf(sel.el)), slideNumber(), `to the ${where}`),
    );
  };
  const place = (row: MiniRow, to: (p: SheetBox) => SheetBox, how: string): void => {
    const sel = selected(row);
    if (sel === null) return;
    const p = poseOf(sel.id);
    if (p === null) return;
    setPose(sel.id, to(p), HISTORY.aligned(objectName(roleOf(sel.el)), slideNumber(), how));
  };
  const turn = (row: MiniRow, by: number): void => {
    const sel = selected(row);
    if (sel === null) return;
    const p = poseOf(sel.id);
    if (p === null) return;
    let rot = Math.round(p.rot + by) % 360;
    if (rot > 180) rot -= 360;
    if (rot <= -180) rot += 360;
    setPose(sel.id, { ...p, rot }, HISTORY.rotated(objectName(roleOf(sel.el)), slideNumber(), by));
  };

  const openShowHere = async (): Promise<void> => {
    try {
      const show = (await import('./show')) as {
        openShow?: (c: HTMLElement, s: SlideKey) => unknown;
      };
      if (typeof show.openShow === 'function') {
        // the show's own chunk loads on the way (show-mount.ts)
        await show.openShow(stage, shown);
        return;
      }
    } catch {
      /* the show has not loaded; the row says what it does */
    }
    say(WORDS.editorRow(await docOf(rowById('view.slideshow'))).trim());
  };

  // ---- dialogs: plates over the stage, square, ruled, paper ----
  const closeDialog = (): void => {
    const open = plates.querySelector<HTMLElement>('[data-mini-dialog]');
    if (open === null) return;
    open.remove();
    const back = lastFocus;
    if (back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true });
  };
  const dialog = (
    title: string,
    lead: string | null,
    content: (HTMLElement | string)[],
    buttons: { label: string; solid?: boolean; act: () => void }[],
  ): HTMLElement => {
    closeMenus(false);
    plates.querySelector('[data-mini-dialog]')?.remove();
    const el = h(
      'div',
      {
        class: 'ts-mini-dialog pt-window',
        role: 'dialog',
        'aria-label': title,
        'data-mini-dialog': true,
      },
      h('p', { class: 'ts-mini-dialog-title' }, title),
      lead === null ? null : h('p', { class: 'ts-mini-dialog-lead' }, lead),
      ...content,
      h(
        'div',
        { class: 'ts-mini-dialog-buttons' },
        ...buttons.map((b) => {
          const btn = h(
            'button',
            {
              type: 'button',
              class: b.solid === true ? 'pt-ib is-solid ts-button' : 'pt-ib ts-button',
            },
            b.label,
          );
          btn.addEventListener('click', b.act);
          return btn;
        }),
      ),
    );
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeDialog();
      }
    });
    plates.append(el);
    const first = el.querySelector<HTMLElement>('input, button');
    first?.focus({ preventScroll: true });
    if (first instanceof HTMLInputElement) first.select();
    return el;
  };
  const field = (label: string, value: string, max = 60): HTMLInputElement => {
    const input = h('input', {
      type: 'text',
      class: 'ts-field',
      maxlength: max,
      spellcheck: 'false',
      'aria-label': label,
    });
    input.value = value;
    return input;
  };
  const onEnter = (input: HTMLInputElement, act: () => void): void => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        act();
      }
    });
  };

  const renameDialog = (): void => {
    const input = field(WORDS.renameTitle, store.get().deckTitle);
    const apply = (): void => {
      const title = input.value.trim().replace(/\s+/g, ' ');
      closeDialog();
      if (title === '' || title === store.get().deckTitle) return;
      commit({ words: HISTORY.renamed(title), next: (s) => ({ ...s, deckTitle: title }) });
    };
    onEnter(input, apply);
    dialog(
      WORDS.renameTitle,
      null,
      [input],
      [
        { label: 'Cancel', act: closeDialog },
        { label: 'Rename', solid: true, act: apply },
      ],
    );
  };

  const nameDialog = (): void => {
    const input = field(WORDS.nameVersionTitle, '');
    input.placeholder = 'Version name';
    const apply = (): void => {
      const name = input.value.trim().replace(/\s+/g, ' ');
      closeDialog();
      if (name === '') return;
      const n = store.versions().length;
      commit({
        words: HISTORY.versionNamed(name),
        next: (s) => ({ ...s, versionNames: { ...s.versionNames, [n]: name } }),
      });
    };
    onEnter(input, apply);
    dialog(
      WORDS.nameVersionTitle,
      null,
      [input],
      [
        { label: 'Cancel', act: closeDialog },
        { label: 'Save', solid: true, act: apply },
      ],
    );
  };

  const themeDialog = (): void => {
    const row = rowById('slide.changeTheme');
    const kits: KitId[] = ['gt', 'kestrel', 'globex'];
    const group = h('div', {
      class: 'ts-mini-kits',
      role: 'group',
      'aria-label': KIT_WORDS.kitsKey,
    });
    for (const kit of kits) {
      const b = h(
        'button',
        {
          type: 'button',
          class: 'ts-home-kit',
          'data-kit': kit,
          'aria-pressed': String(store.get().kit === kit),
          'data-tip': KIT_WORDS.kits[kit].tip,
        },
        h('span', { class: 'ts-home-kit-swatch', 'aria-hidden': 'true' }, h('i')),
        KIT_WORDS.kits[kit].name,
      );
      b.addEventListener('click', () => {
        closeDialog();
        setKit(kit);
      });
      group.append(b);
    }
    const lead = docNow(row);
    const el = dialog('Brand kit', lead || null, [group], [
      { label: 'Close', act: closeDialog },
    ]);
    // pressed before the sentences arrived (a key on the row): the lead joins under the title
    if (lead === '')
      void docOf(row).then((doc) => {
        if (doc === '' || !el.isConnected) return;
        el.querySelector('.ts-mini-dialog-title')?.after(
          h('p', { class: 'ts-mini-dialog-lead' }, doc),
        );
      });
  };

  const tailorDialog = (): void => {
    const state = store.get();
    const input = field(PRODUCT_TAILOR.to, '', 24);
    input.placeholder = 'Customer name';
    const count = h('p', { class: 'ts-mini-dialog-count', 'aria-live': 'polite' });
    const from = h(
      'p',
      { class: 'ts-mini-dialog-from' },
      `${PRODUCT_TAILOR.from} `,
      h('b', {}, state.customer),
    );
    const apply = (): void => {
      const to = input.value.trim().replace(/\s+/g, ' ').slice(0, 24);
      if (to === '') {
        count.textContent = 'Type a customer name first.';
        input.focus();
        return;
      }
      closeDialog();
      const was = store.get().customer;
      if (to === was) return;
      commit({ words: HISTORY.tailored(to), next: (s) => ({ ...s, customer: to }) });
    };
    onEnter(input, apply);
    dialog(
      PRODUCT_TAILOR.title,
      PRODUCT_TAILOR.lead,
      [from, input, count],
      [
        { label: PRODUCT_TAILOR.cancel, act: closeDialog },
        { label: PRODUCT_TAILOR.apply, solid: true, act: apply },
      ],
    );
  };

  const shortcutsDialog = (): void => {
    const list = h('ul', { class: 'ts-mini-keys' });
    for (const { row: r, path } of ALL_ROWS) {
      if (r.run !== true || (r.mac ?? '') === '') continue;
      list.append(
        h(
          'li',
          {},
          h('span', {}, path.slice(1).join(' > ')),
          h('span', { class: 'ts-mini-key' }, (mac ? r.mac : r.win) ?? ''),
        ),
      );
    }
    dialog(WORDS.shortcutsTitle, null, [list], [{ label: 'Close', act: closeDialog }]);
  };

  const searchDialog = (): void => {
    const row = rowById('help.searchMenus');
    const input = field(WORDS.searchLabel, '');
    input.placeholder = WORDS.searchPlaceholder;
    const list = h('ul', {
      class: 'ts-mini-found',
      role: 'listbox',
      'aria-label': row?.label ?? '',
    });
    let found: { row: MiniRow; path: string[] }[] = [];
    let at = 0;
    const paint = (): void => {
      const q = input.value.trim().toLowerCase();
      found =
        q === ''
          ? []
          : ALL_ROWS.filter(
              (r) => r.row.items === undefined && r.path.join(' ').toLowerCase().includes(q),
            ).slice(0, 8);
      at = Math.min(at, Math.max(0, found.length - 1));
      list.replaceChildren(
        ...found.map((f, i) =>
          h(
            'li',
            {
              role: 'option',
              'aria-selected': String(i === at),
              'data-run': f.row.run === true ? '' : undefined,
            },
            h('span', {}, f.path.join(' > ')),
            h('span', { class: 'ts-mini-key' }, (mac ? f.row.mac : f.row.win) ?? ''),
          ),
        ),
      );
    };
    input.addEventListener('input', () => {
      at = 0;
      paint();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        at = Math.max(0, Math.min(found.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)));
        paint();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const f = found[at];
        closeDialog();
        if (f !== undefined) activate(f.row);
      }
    });
    list.addEventListener('click', (e) => {
      const li = (e.target as Element).closest('li');
      const i = li === null ? -1 : [...list.children].indexOf(li);
      const f = found[i];
      closeDialog();
      if (f !== undefined) activate(f.row);
    });
    dialog(WORDS.searchLabel, null, [input, list], [{ label: 'Close', act: closeDialog }]);
  };

  // ---- running a row ----
  const activate = (row: MiniRow): void => {
    finishBand('menus');
    const run = row.run === true ? RUN[row.id] : undefined;
    if (run === undefined) {
      void docOf(row).then((doc) => say(WORDS.editorRow(doc).trim()));
      return;
    }
    run(row);
  };

  // ---- the menu bar, its plates and the Menus key ----
  const narrow = (): boolean => window.matchMedia('(max-width: 719.98px)').matches;
  const titles: HTMLButtonElement[] = MINI_MENUS.map((menu, i) => {
    const t = h(
      'button',
      {
        type: 'button',
        class: 'ts-mini-menu',
        role: 'menuitem',
        'aria-haspopup': 'menu',
        'aria-expanded': 'false',
        'data-menu': menu.id,
        tabindex: i === 0 ? 0 : -1,
      },
      menu.label,
    );
    return t;
  });
  const menusKey = h(
    'button',
    {
      type: 'button',
      class: 'ts-mini-menus-key',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
    },
    WORDS.menusKey,
  );
  bar.replaceChildren(...titles, menusKey);

  type Open = { menu: number; via: 'bar' | 'key' };
  let open: Open | null = null;

  const plateRows = (plate: HTMLElement): HTMLElement[] => [
    ...plate.querySelectorAll<HTMLElement>(':scope > [role^="menuitem"]'),
  ];
  const closeMenus = (focusTitle: boolean): void => {
    const was = open;
    for (const p of [...plates.querySelectorAll('[data-mini-plate]')]) p.remove();
    for (const t of titles) {
      t.setAttribute('aria-expanded', 'false');
      t.classList.remove('is-open');
    }
    menusKey.setAttribute('aria-expanded', 'false');
    open = null;
    if (focusTitle && was !== null)
      (was.via === 'key' || narrow() ? menusKey : (titles[was.menu] ?? menusKey)).focus({
        preventScroll: true,
      });
  };
  const checkOf = (row: MiniRow): boolean | undefined => {
    if (row.id === 'view.showSpeakerNotes') return view.notes;
    if (row.id === 'view.showFilmstrip') return view.strip;
    return row.check;
  };
  const labelOf = (row: MiniRow): string =>
    row.alt !== undefined && row.id === 'slide.skipSlide' && store.get().skipped[shown] === true
      ? row.alt
      : row.label;
  /** a run row that needs an object reads unavailable while none is selected */
  const NEEDS_SELECTION = /^(format\.|arrange\.|edit\.(duplicate|delete)$)/;
  const available = (row: MiniRow): boolean => {
    if (row.run !== true) return false;
    if (row.id === 'edit.undo') return store.canUndo('menus');
    if (row.id === 'edit.redo') return false;
    if (NEEDS_SELECTION.test(row.id))
      return objects.selected() !== null || (row.id.startsWith('edit.') && inStrip());
    return true;
  };

  // each row's glyph (DESIGN.md 8.4): the names arrive on a chunk of their own, paired with the
  // rows depth first; a row drawn before they land takes its glyph when they do
  const glyphOf = new Map<MiniRow, string>();
  const rowGlyph = (row: MiniRow, checked: boolean): SVGSVGElement | null => {
    const id = checked ? HOME_GLYPHS.check : glyphOf.get(row);
    return id === undefined ? null : glyph(id);
  };
  void import('../menu-glyphs.generated').then(({ MENU_GLYPHS }) => {
    let n = 0;
    const pair = (rows: readonly MiniRow[]): void => {
      for (const r of rows) {
        const i = MENU_GLYPHS[n++] ?? -1;
        if (i >= 0) glyphOf.set(r, `g${i}`);
        if (r.items !== undefined) pair(r.items);
      }
    };
    for (const m of MINI_MENUS) pair(m.rows);
    for (const el of plates.querySelectorAll<HTMLElement & { miniRow?: MiniRow }>('.ts-mini-row')) {
      const slot = el.firstElementChild;
      const g = el.miniRow === undefined ? null : rowGlyph(el.miniRow, false);
      if (slot !== null && slot.childElementCount === 0 && g !== null) slot.append(g);
    }
  });

  const plateAt = (depth: number): HTMLElement | null =>
    plates.querySelector<HTMLElement>(`[data-mini-plate="${depth}"]`);

  const showPlate = (
    rows: readonly (MiniRow | { back: true } | { menu: number })[],
    pos: { left: number; top: number },
    depth: number,
    focusFirst: boolean,
    menu: number,
  ): HTMLElement => {
    for (const p of [...plates.querySelectorAll<HTMLElement>('[data-mini-plate]')])
      if (Number(p.dataset['miniPlate']) >= depth) p.remove();
    const plate = h('div', {
      class: 'ts-mini-plate pt-float',
      role: 'menu',
      'data-mini-plate': depth,
    });
    plate.setAttribute('aria-label', menu >= 0 ? (MINI_MENUS[menu]?.label ?? '') : WORDS.menusKey);
    for (const item of rows) {
      if ('back' in item) {
        const b = h(
          'div',
          { class: 'ts-mini-row is-back', role: 'menuitem', tabindex: -1 },
          h('span', { class: 'ts-mini-row-label' }, `‹ ${WORDS.menusKey}`),
        );
        b.addEventListener('click', () => openKey(true));
        plate.append(b);
        continue;
      }
      if ('menu' in item) {
        const m = MINI_MENUS[item.menu];
        if (m === undefined) continue;
        const r = h(
          'div',
          {
            class: 'ts-mini-row is-sub is-run',
            role: 'menuitem',
            tabindex: -1,
            'aria-haspopup': 'menu',
            'data-menu-open': item.menu,
          },
          h('span', { class: 'ts-mini-row-check', 'aria-hidden': 'true' }),
          h('span', { class: 'ts-mini-row-label' }, m.label),
          h('span', { class: 'ts-mini-row-key' }),
          glyph(HOME_GLYPHS.next, 'ts-glyph ts-mini-chevron'),
        );
        plate.append(r);
        continue;
      }
      const row = item;
      if (row.rule === true && plate.childElementCount > 0)
        plate.append(h('div', { class: 'ts-mini-rule', role: 'separator' }));
      const check = checkOf(row);
      const sub = row.items !== undefined;
      const run = runsUnder(row);
      // grey only where the editor greys (DESIGN.md 8.4): a run row the page cannot run now (it
      // needs a selection), or a row the model disables with nothing selected; every other row is
      // a working row, and one the page does not run answers in the status row
      const off = row.run === true ? !available(row) : row.off === true;
      const el = h(
        'div',
        {
          class: `ts-mini-row${run ? ' is-run' : ''}${off ? ' is-off' : ''}${sub ? ' is-sub' : ''}`,
          role: check === undefined ? 'menuitem' : 'menuitemcheckbox',
          tabindex: -1,
          'data-menu-item': row.id === '' ? undefined : row.id,
          'aria-disabled': off && !sub ? 'true' : undefined,
          'aria-haspopup': row.items !== undefined ? 'menu' : undefined,
          'aria-checked': check === undefined ? undefined : String(check),
          'data-tip': docNow(row) || undefined,
        },
        h(
          'span',
          { class: 'ts-mini-row-check', 'aria-hidden': 'true' },
          rowGlyph(row, check === true),
        ),
        h('span', { class: 'ts-mini-row-label' }, labelOf(row)),
        h(
          'span',
          { class: 'ts-mini-row-key' },
          row.items === undefined ? ((mac ? row.mac : row.win) ?? '') : '',
        ),
        sub ? glyph(HOME_GLYPHS.next, 'ts-glyph ts-mini-chevron') : null,
      );
      (el as HTMLElement & { miniRow?: MiniRow }).miniRow = row;
      plate.append(el);
    }
    plates.append(plate);
    plate.style.left = `${pos.left}px`;
    plate.style.top = `${pos.top}px`;
    // a plate stays inside the miniature's frame: a submenu that would cross its right edge opens
    // on its parent's left, as the editor's do, and a menu slides left
    const fr = frame.getBoundingClientRect();
    const pr = plate.getBoundingClientRect();
    if (pr.right > fr.right - 4) {
      const parent = plateAt(depth - 1)?.getBoundingClientRect().left ?? 0;
      const flip = parent - fr.left - pr.width + 2;
      const slid = Math.max(4, pos.left - (pr.right - fr.right) - 8);
      plate.style.left = `${depth > 0 && flip >= 4 ? flip : slid}px`;
    }
    // a plate that runs past the frame's bottom rises, never over the menu bar (a press on a menu
    // title must reach the title), and runs past the bottom when it is taller than the room
    const floor = bar.getBoundingClientRect().bottom - fr.top;
    if (pr.bottom > fr.bottom - 4)
      plate.style.top = `${Math.max(floor, pos.top - (pr.bottom - fr.bottom) - 4)}px`;
    if (focusFirst) plateRows(plate)[0]?.focus({ preventScroll: true });
    return plate;
  };
  const rowOfEl = (el: Element | null): MiniRow | undefined =>
    (el?.closest('.ts-mini-row') as (HTMLElement & { miniRow?: MiniRow }) | null)?.miniRow;

  const openMenu = (i: number, focusFirst: boolean): void => {
    const menu = MINI_MENUS[i];
    const t = titles[i];
    if (menu === undefined || t === undefined) return;
    lastFocus = lastFocus ?? document.activeElement;
    closeMenus(false);
    open = { menu: i, via: 'bar' };
    t.setAttribute('aria-expanded', 'true');
    t.classList.add('is-open');
    for (const other of titles) other.tabIndex = other === t ? 0 : -1;
    const fr = frame.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    showPlate(menu.rows, { left: tr.left - fr.left, top: tr.bottom - fr.top }, 0, focusFirst, i);
  };
  const openKey = (focusFirst: boolean): void => {
    lastFocus = lastFocus ?? document.activeElement;
    closeMenus(false);
    open = { menu: -1, via: 'key' };
    menusKey.setAttribute('aria-expanded', 'true');
    const fr = frame.getBoundingClientRect();
    const kr = menusKey.getBoundingClientRect();
    showPlate(
      MINI_MENUS.map((_m, i) => ({ menu: i })),
      { left: kr.left - fr.left, top: kr.bottom - fr.top },
      0,
      focusFirst,
      -1,
    );
  };
  const openSub = (rowEl: HTMLElement, focusFirst: boolean): void => {
    const plate = rowEl.closest<HTMLElement>('[data-mini-plate]');
    if (plate === null) return;
    const depth = Number(plate.dataset['miniPlate']);
    const fr = frame.getBoundingClientRect();
    const rr = rowEl.getBoundingClientRect();
    for (const r of plateRows(plate)) {
      r.classList.toggle('is-open', r === rowEl);
      if (r.hasAttribute('aria-haspopup')) r.setAttribute('aria-expanded', String(r === rowEl));
    }
    const menuIndex = rowEl.dataset['menuOpen'];
    if (menuIndex !== undefined) {
      // the phone: the Menus key drills into one menu, with a row back to the nine
      const i = Number(menuIndex);
      const menu = MINI_MENUS[i];
      if (menu === undefined) return;
      open = { menu: i, via: 'key' };
      const top = plate.getBoundingClientRect().top - fr.top;
      showPlate(
        [{ back: true }, ...menu.rows],
        { left: plate.getBoundingClientRect().left - fr.left, top },
        0,
        focusFirst,
        i,
      );
      return;
    }
    const row = rowOfEl(rowEl);
    if (row?.items === undefined) return;
    const left = narrow() ? rr.left - fr.left + 12 : rr.right - fr.left - 2;
    const top = narrow() ? rr.bottom - fr.top : rr.top - fr.top - 5;
    showPlate(row.items, { left, top }, depth + 1, focusFirst, open?.menu ?? -1);
  };

  for (const [i, t] of titles.entries()) {
    t.addEventListener('click', () => {
      if (open !== null && open.menu === i && open.via === 'bar') closeMenus(true);
      else openMenu(i, false);
    });
    t.addEventListener('pointerenter', () => {
      if (open !== null && open.via === 'bar' && open.menu !== i) openMenu(i, false);
    });
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu(i, true);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + titles.length) % titles.length;
        for (const other of titles) other.tabIndex = -1;
        const next = titles[n];
        if (next === undefined) return;
        next.tabIndex = 0;
        next.focus();
        if (open !== null) openMenu(n, false);
      } else if (e.key === 'Escape' && open !== null) {
        e.preventDefault();
        closeMenus(true);
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        const next = e.key === 'Home' ? titles[0] : titles[titles.length - 1];
        for (const other of titles) other.tabIndex = -1;
        if (next !== undefined) {
          next.tabIndex = 0;
          next.focus();
        }
      }
    });
  }
  menusKey.addEventListener('click', () => {
    if (open !== null) closeMenus(true);
    else openKey(false);
  });
  menusKey.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openKey(true);
    }
  });

  plates.addEventListener('pointerover', (e) => {
    const rowEl = (e.target as Element).closest<HTMLElement>('.ts-mini-row');
    if (rowEl === null) return;
    const plate = rowEl.closest<HTMLElement>('[data-mini-plate]');
    if (plate === null) return;
    rowEl.focus({ preventScroll: true });
    if (narrow()) return;
    const depth = Number(plate.dataset['miniPlate']);
    if (rowEl.getAttribute('aria-haspopup') === 'menu' && rowEl.dataset['menuOpen'] === undefined) {
      if (!rowEl.classList.contains('is-open')) openSub(rowEl, false);
    } else {
      for (const p of [...plates.querySelectorAll<HTMLElement>('[data-mini-plate]')])
        if (Number(p.dataset['miniPlate']) > depth) p.remove();
      for (const r of plateRows(plate)) r.classList.remove('is-open');
    }
  });
  plates.addEventListener('click', (e) => {
    const rowEl = (e.target as Element).closest<HTMLElement>('.ts-mini-row');
    if (rowEl === null || rowEl.classList.contains('is-back')) return;
    if (rowEl.getAttribute('aria-haspopup') === 'menu') {
      openSub(rowEl, true);
      return;
    }
    const row = rowOfEl(rowEl);
    if (row === undefined) return;
    closeMenus(false);
    returnFocus();
    activate(row);
  });
  plates.addEventListener('keydown', (e) => {
    const rowEl = (e.target as Element).closest<HTMLElement>('.ts-mini-row');
    if (rowEl === null) return;
    const plate = rowEl.closest<HTMLElement>('[data-mini-plate]');
    if (plate === null) return;
    const depth = Number(plate.dataset['miniPlate']);
    const rows = plateRows(plate);
    const k = rows.indexOf(rowEl);
    const menu = open?.menu ?? -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const by = e.key === 'ArrowDown' ? 1 : -1;
      rows[(k + by + rows.length) % rows.length]?.focus({ preventScroll: true });
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      (e.key === 'Home' ? rows[0] : rows[rows.length - 1])?.focus({ preventScroll: true });
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (rowEl.getAttribute('aria-haspopup') === 'menu') openSub(rowEl, true);
      else if (menu >= 0 && open?.via === 'bar') openMenu((menu + 1) % titles.length, true);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (depth > 0) {
        for (const p of [...plates.querySelectorAll<HTMLElement>('[data-mini-plate]')])
          if (Number(p.dataset['miniPlate']) > depth) p.remove();
        plate.remove();
        const parent = plateAt(depth - 1)?.querySelector<HTMLElement>('.ts-mini-row.is-open');
        parent?.classList.remove('is-open');
        parent?.setAttribute('aria-expanded', 'false');
        parent?.focus({ preventScroll: true });
      } else if (menu >= 0 && open?.via === 'bar')
        openMenu((menu - 1 + titles.length) % titles.length, true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (depth > 0) {
        for (const p of [...plates.querySelectorAll<HTMLElement>('[data-mini-plate]')])
          if (Number(p.dataset['miniPlate']) > depth) p.remove();
        plate.remove();
        const parent = plateAt(depth - 1)?.querySelector<HTMLElement>('.ts-mini-row.is-open');
        parent?.classList.remove('is-open');
        parent?.focus({ preventScroll: true });
      } else closeMenus(true);
    } else if (e.key === 'Tab') closeMenus(false);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      rowEl.click();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (open === null) return;
    const t = e.target as Element;
    if (plates.contains(t) || bar.contains(t)) return;
    closeMenus(false);
  });

  /** after a row runs, focus goes back where it was before the menu opened (the object, a thumbnail) */
  const returnFocus = (): void => {
    const back = lastFocus;
    lastFocus = null;
    if (
      back instanceof HTMLElement &&
      back.isConnected &&
      frame.contains(back) &&
      !bar.contains(back)
    )
      back.focus({ preventScroll: true });
  };
  frame.addEventListener('focusin', (e) => {
    const t = e.target as Element;
    if (!bar.contains(t) && !plates.contains(t)) lastFocus = t;
  });

  // ---- the rows' shortcuts, with focus inside the band and not in a text field (2.5) ----
  const BOUND = ALL_ROWS.filter((r) => r.row.run === true && r.row.bind !== undefined).map((r) => ({
    row: r.row,
    chords: chordsOf(r.row.bind?.[mac ? 0 : 1] ?? '', mac),
  }));
  /** the rows whose shortcut means a slide with focus in the filmstrip and an object elsewhere */
  const FILMSTRIP_ROWS = new Set([
    'slide.duplicateSlide',
    'slide.moveSlide.up',
    'slide.moveSlide.down',
    'slide.moveSlide.toBeginning',
    'slide.moveSlide.toEnd',
  ]);
  const OBJECT_ROWS = new Set([
    'edit.duplicate',
    'arrange.order.bringToFront',
    'arrange.order.sendToBack',
  ]);
  /** the rows whose shortcut acts on a text box while it takes typing: the typing ends first */
  const TYPING_ROWS = /^format\.(text\.(bold|underline)|alignIndent\.(left|center|right))$/;
  band.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.isContentEditable && stage.contains(t)) {
      const typed = BOUND.find(
        (b) => TYPING_ROWS.test(b.row.id) && b.chords.some((c) => matches(e, c)),
      );
      if (typed === undefined) return;
      e.preventDefault();
      objects.finishTyping();
      activate(typed.row);
      return;
    }
    if (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
    if (plates.contains(t) && (e.key === 'Enter' || e.key === ' ')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // a bare key acts only on what has focus (SC 2.1.4): the selected object or the slide
      if (objects.selected() === null && !strip.contains(t)) return;
    }
    const hit = BOUND.filter((b) => b.chords.some((c) => matches(e, c)));
    if (hit.length === 0) return;
    const focusStrip = strip.contains(t);
    const pick =
      hit.find((b) => (focusStrip ? FILMSTRIP_ROWS.has(b.row.id) : OBJECT_ROWS.has(b.row.id))) ??
      hit.find((b) => !FILMSTRIP_ROWS.has(b.row.id) && !OBJECT_ROWS.has(b.row.id)) ??
      hit[0];
    if (pick === undefined) return;
    // Cmd or Ctrl+Z is the band's Undo (index.ts); the rest run here
    if (pick.row.id === 'edit.undo') return;
    e.preventDefault();
    lastFocus = t;
    activate(pick.row);
  });

  // ---- the store ----
  /** the title row's count (the deck's title is the core's, `index.ts`) */
  const paintHead = (state: HomeDeckState): void => {
    if (titleText.textContent !== state.deckTitle) titleText.textContent = state.deckTitle;
    const count = WORDS.slides(state.order.length);
    if (countText.textContent !== count) countText.textContent = count;
  };
  store.subscribe((state, event) => {
    // an Undo that took away the focused object leaves the keys in the band: the stage takes focus
    if (
      (document.activeElement === null || document.activeElement === document.body) &&
      lastFocus !== null &&
      !lastFocus.isConnected
    )
      stage.focus({ preventScroll: true });
    syncStrip(state);
    if (!state.order.includes(shown))
      show(
        state.order[Math.min(slideNumber(), state.order.length) - 1] ??
          state.order[0] ??
          REST_SLIDE,
      );
    paintHead(state);
    paintNotes();
    if (event.kind === 'undo' && event.change.band === 'menus' && event.row !== null)
      say(WORDS.statusRest);
    const root = sheetBox.querySelector<HTMLElement>('[data-home-slides]');
    if (root !== null) sheetLayout(root);
  });

  // ---- at rest ----
  const state = store.get();
  syncStrip(state);
  show(REST_SLIDE);
  paintHead(state);
  paintView();
  frame.setAttribute('data-ready', '');
}
