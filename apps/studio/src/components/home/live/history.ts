import { AGENTS } from '../copy';
import type { LiveContext } from './index';
import { play } from './motion';
import type { HistoryRow, HomeDeckState, StoreEvent } from './state';

/**
 * Version history on /home (docs/LANDING.md 2.9 "Interaction", 3.6 A6; docs/DESIGN.md 8.8; rows
 * home.agents.history and home.agents.history-panel). V3's file, D4's since the design round. The
 * panel draws the editor's Version history: the versions in a scroll region of fixed height, the
 * changes made on this page under Today and the recorded run under "Recorded from the CLI"
 * (`HomeAgents.tsx` writes that group and its version numbers at rest). From then on Today is the
 * store's `history` without the run's rows, newest first, each row with its time in "6:45 PM"
 * form and its version's number on the row (`data-version`, which `versions.ts` reads to put the
 * chosen version's row on the plate); a sentence stands in Today while it has no row. A commit
 * that adds a row draws it at the top of Today within the frame, entering on A6 (200 ms, an 8 px
 * rise, the arrive curve); a merged nudge burst rewrites its row in place; an undo takes its row
 * away by a cut. Existing rows never animate (3.7). The row's grammar is the product's: the
 * author's chip with its Heroicon (`command-line` for Agent, `user-circle` for You), the author
 * and the change in words, and the time right aligned in tabular figures.
 *
 * A Today row is cloned from the markup's first recorded row, so the page's CSS draws it as the
 * build drew the recorded ones; the icon is that row's icon element (a mask of
 * `icons.generated.css`) with the author's name, so the live module carries no icon path.
 */

/** Today keeps at most this many rows in its region (older ones leave the page, not the store). */
const TODAY_ROWS = 30;

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
  const today = ctx.band.querySelector<HTMLElement>('[data-history-group="today"]');
  const model = ctx.band.querySelector<HTMLElement>(
    '[data-history-group="recorded"] [data-history-row]',
  );
  const empty = ctx.band.querySelector<HTMLElement>('[data-history-empty]');
  if (today === null || model === null) return;
  const iconOf = (author: HistoryRow['author']): Element | null => {
    const icon = model.querySelector<HTMLElement>('[data-icon]')?.cloneNode(false);
    if (!(icon instanceof HTMLElement)) return null;
    icon.dataset['icon'] = ICONS[author];
    return icon;
  };

  /* the rows on the page by store id, Today's alone: the recorded group is the markup's */
  const shown = new Map<number, HTMLElement>();
  const newestFirst = (state: HomeDeckState): HistoryRow[] =>
    state.history
      .filter((row) => !row.recorded)
      .reverse()
      .slice(0, TODAY_ROWS);
  /** each row's version number, from the store's list of versions */
  const versionOf = (): Map<number, number> =>
    new Map(
      ctx.store
        .versions()
        .flatMap((v) => (v.rowId === null ? [] : [[v.rowId, v.n] as [number, number]])),
    );

  const fill = (li: HTMLElement, row: HistoryRow, version: number | undefined): void => {
    li.dataset['historyId'] = String(row.id);
    li.dataset['author'] = row.author;
    li.removeAttribute('data-history-run');
    if (version === undefined) li.removeAttribute('data-version');
    else li.dataset['version'] = String(version);
    const iconCell = li.querySelector('.ts-home-history-icon');
    const icon = iconOf(row.author);
    if (iconCell !== null && icon !== null) iconCell.replaceChildren(icon);
    const author = li.querySelector('.ts-home-history-author');
    if (author !== null) author.textContent = AGENTS.author[row.author];
    const words = li.querySelector('[data-history-words]');
    if (words !== null) words.textContent = row.words;
    const time = li.querySelector('.ts-home-history-time');
    if (time !== null) time.textContent = historyTime(row.at);
  };

  const render = (state: HomeDeckState, entered: HistoryRow | null): void => {
    const rows = newestFirst(state);
    const versions = versionOf();
    const keep = new Set(rows.map((row) => row.id));
    for (const [id, li] of shown)
      if (!keep.has(id)) {
        li.remove();
        shown.delete(id);
      }
    let before: Element | null = today.firstElementChild;
    for (const row of rows) {
      let li = shown.get(row.id);
      if (li === undefined) {
        li = model.cloneNode(true) as HTMLElement;
        li.removeAttribute('aria-current');
        shown.set(row.id, li);
      }
      fill(li, row, versions.get(row.id));
      if (li !== before) today.insertBefore(li, before);
      before = li.nextElementSibling;
    }
    if (empty !== null) empty.hidden = rows.length > 0;
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
     list draws the store's rows at once */
  render(ctx.store.get(), null);
}
