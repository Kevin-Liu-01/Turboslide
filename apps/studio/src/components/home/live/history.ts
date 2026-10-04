import { AGENTS } from '../copy';
import type { LiveContext } from './index';
import { play } from './motion';
import type { HistoryRow, HomeDeckState, StoreEvent } from './state';

/**
 * Version history on /home (docs/LANDING.md 2.9 "Interaction", 3.6 A6; row home.agents.history).
 * V3's file. The band's markup holds the run's end at rest: three Agent rows whose time cell reads
 * "Recorded". From then on the list is the store's `history`, newest first, at most the rows the
 * band reserves (ten ruled rows of 44 px at 720 px and over, five under): every commit that adds a
 * row draws it at the top within the frame, entering on A6 (200 ms, an 8 px rise, the arrive
 * curve); a merged nudge burst rewrites its row in place; an undo takes its row away by a cut.
 * Existing rows never animate (3.7). The row's grammar is the product's Version history: a
 * Heroicon in the key cell (`command-line` for Agent, `user-circle` for You), the author, the
 * change in words and the time in "6:45 PM" form, right aligned.
 *
 * The row's cells are cloned from the markup's resting row, so the page's CSS draws a live row
 * exactly as the build drew the recorded ones; the icon is the resting row's icon element (a mask
 * of `icons.generated.css`) with the author's name, so the live module carries no icon path.
 */

/** The rows the list reserves (2.9 "Layout"): ten at 720 px and over, five under. */
const visible = (): number =>
  typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 719px)').matches
    ? 5
    : 10;

/** The key cell's Heroicon 20 solid per author (LANDING.md 2.4). */
const ICONS: Readonly<Record<HistoryRow['author'], string>> = {
  agent: 'command-line',
  you: 'user-circle',
};

/** "6:45 PM": the hour without a leading zero, as the product's Version history writes it. */
export function historyTime(at: number): string {
  return new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function startHistory(ctx: LiveContext): void {
  const list = ctx.band.querySelector<HTMLElement>('[data-history]');
  if (list === null) return;
  const resting = [...list.querySelectorAll<HTMLElement>('[data-history-row]')];
  const model = resting[0];
  if (model === undefined) return;
  /* the icon as the resting rows draw it: the markup's own icon element with the author's name */
  const restingIcon = model.querySelector<HTMLElement>('[data-icon]');
  const iconOf = (author: HistoryRow['author']): Element | null => {
    if (restingIcon === null) return null;
    const icon = restingIcon.cloneNode(false) as HTMLElement;
    icon.dataset['icon'] = ICONS[author];
    return icon;
  };

  /* the rows on the page by store id; the markup's rows are the store's resting rows, newest first */
  const shown = new Map<number, HTMLElement>();
  const newestFirst = (state: HomeDeckState): HistoryRow[] =>
    [...state.history].reverse().slice(0, visible());
  const atRest = newestFirst(ctx.store.get());
  if (atRest.length === resting.length)
    atRest.forEach((row, i) => {
      const li = resting[i] as HTMLElement;
      li.dataset['historyId'] = String(row.id);
      shown.set(row.id, li);
    });
  else for (const li of resting) li.remove();

  const fill = (li: HTMLElement, row: HistoryRow): void => {
    const cells = [...li.children] as HTMLElement[];
    const [iconCell, author, words, time] = cells;
    li.dataset['historyId'] = String(row.id);
    li.dataset['author'] = row.author;
    if (iconCell !== undefined) {
      const icon = iconOf(row.author);
      if (icon !== null) iconCell.replaceChildren(icon);
    }
    if (author !== undefined) author.textContent = AGENTS.author[row.author];
    if (words !== undefined) words.textContent = row.words;
    if (time !== undefined) {
      time.textContent = row.recorded ? AGENTS.recorded : historyTime(row.at);
      if (time instanceof HTMLTimeElement)
        time.dateTime = row.recorded ? '' : new Date(row.at).toISOString();
    }
  };

  const render = (state: HomeDeckState, entered: HistoryRow | null): void => {
    const rows = newestFirst(state);
    const keep = new Set(rows.map((row) => row.id));
    for (const [id, li] of shown)
      if (!keep.has(id)) {
        li.remove();
        shown.delete(id);
      }
    let before: Element | null = list.firstElementChild;
    for (const row of rows) {
      let li = shown.get(row.id);
      if (li === undefined) {
        li = model.cloneNode(true) as HTMLElement;
        shown.set(row.id, li);
      }
      fill(li, row);
      if (li !== before) list.insertBefore(li, before);
      before = li.nextElementSibling;
    }
    const li = entered === null ? undefined : shown.get(entered.id);
    if (li !== undefined)
      play(
        li,
        [
          { transform: 'translateY(8px)', opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        'row',
        'arrive',
        'agents',
      );
  };

  ctx.store.subscribe((state: HomeDeckState, event: StoreEvent) => {
    render(state, event.kind === 'commit' ? event.row : null);
  });
  /* a change made before the band's chunk loaded (any band above can make one, v2.md R19): the
     list draws the store's rows at once, the resting rows kept where they are the store's */
  if (atRest.length !== resting.length) render(ctx.store.get(), null);
}
