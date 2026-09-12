import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent } from 'react';
import { Fragment, useState } from 'react';

import { LiveClone } from './LiveClone';
import { pad2, trimTitle } from './model';
import type { ViewerDeck, ViewerSlide } from './model';
import type { Theme } from './theme';

import './GridView.css';

/** The tile widths of grid view, picked by the minus and plus at the bottom left (gslides-parity SPEC 4.4). */
export const GRID_TILE_SIZES = [200, 300, 400] as const;
export type GridTileSize = (typeof GRID_TILE_SIZES)[number];
export const GRID_DEFAULT_TILE: GridTileSize = 300;

/** Where a dragged tile would land: before or after the tile under the pointer. */
export type GridDrop = { id: string; half: 'before' | 'after' };

/** The one `slide.move` target a drop stands for (Sidebar.tsx targetFor is the same arithmetic). */
export type GridMoveTarget = { sectionId: string; after?: string };

export type GridViewProps = {
  deck: ViewerDeck;
  active: string;
  theme: Theme;
  /** a pick opens the slide live in slide mode (tail.html go) */
  onSelect: (slideId: string) => void;
  label?: string;
  /**
   * The editor's grid (gslides-parity SPEC 4.4): the selected tiles ring in ink, drag reorders
   * through `onMove` (the moved ids in deck order and the `slide.move` target), a right-click
   * opens the card menu through `onContextMenu`, a double click returns to the slide through
   * `onOpen`, and the tile size is the page's setting. Absent on the view route, where the grid
   * is a picker.
   */
  edit?: {
    selected: readonly string[];
    onSelectionChange: (slideIds: string[]) => void;
    onMove: (slideIds: string[], target: GridMoveTarget) => void;
    onContextMenu: (slideId: string, point: { x: number; y: number }, element: HTMLElement) => void;
    onOpen: (slideId: string) => void;
    tile: GridTileSize;
    onTile: (tile: GridTileSize) => void;
    /** the sections have names to show between the tiles (View > Show sections) */
    sections?: boolean;
  };
};

/**
 * Enter and Space activate a role="button" tile the way a native button
 * does. Space stops here: the shell's document listener reads Space as
 * "next", and the tile's own selection must win. Enter is neither prevented
 * nor stopped, so the digit buffer (1, 2, then Enter) still lands.
 */
function activateOnKey(event: KeyboardEvent<HTMLElement>, act: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (event.key === ' ') {
    event.preventDefault();
    event.stopPropagation();
  }
  act();
}

/** A pointer press on a tile must not park focus on it (Prototemplate ListRow.tsx pressWithoutFocus). */
function pressWithoutFocus(event: MouseEvent<HTMLElement>): void {
  event.preventDefault();
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && focused !== event.currentTarget) focused.blur();
}

/**
 * The render worker's capture for a tile (M3 item 5): invisible until it has decoded, then shown
 * over the live clone in one cut; a capture that fails to load leaves the clone in place.
 */
function StaticShot({ shot, theme }: { shot: NonNullable<ViewerSlide['shot']>; theme: Theme }) {
  const src = theme === 'dark' ? (shot.dark ?? shot.light) : shot.light;
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  if (failed === src) return null;
  return (
    <img
      key={src}
      className={loaded === src ? 'pt-thumb-shot is-loaded' : 'pt-thumb-shot'}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(src)}
      onError={() => setFailed(src)}
    />
  );
}

/** The `slide.move` target of a drop before or after a tile, the dragged ids left out (pure; grid-view.test.ts pins it). */
export function gridMoveTarget(
  deck: Pick<ViewerDeck, 'sections'>,
  dragged: readonly string[],
  at: GridDrop,
): GridMoveTarget | null {
  const section = deck.sections.find((row) => row.slideIds.includes(at.id));
  if (!section) return null;
  const rest = section.slideIds.filter((id) => !dragged.includes(id));
  const index = rest.indexOf(at.id);
  if (index < 0) return null;
  if (at.half === 'after') return { sectionId: section.id, after: at.id };
  const previous = rest[index - 1];
  return previous === undefined
    ? { sectionId: section.id }
    : { sectionId: section.id, after: previous };
}

/** The next tile size one step from `tile`, clamped to the ladder. */
export function stepTile(tile: GridTileSize, delta: 1 | -1): GridTileSize {
  const at = GRID_TILE_SIZES.indexOf(tile);
  const next = Math.max(0, Math.min(GRID_TILE_SIZES.length - 1, at + delta));
  return GRID_TILE_SIZES[next] ?? GRID_DEFAULT_TILE;
}

/**
 * Every slide at once (SPEC 5.5; gslides-parity SPEC 4.4): a paper scroll region over the stage
 * with tiles at 200, 300 or 400 px and the sections as row-spanning labels, each tile a live clone
 * with its number (and, on the view route, its title). In the editor the tiles are cards of the
 * filmstrip: the selected ones ring in ink, a skipped slide sits at 40 percent with the eye-slash
 * glyph, drag reorders, a right-click opens the card menu and a double click opens the slide.
 */
export function GridView({
  deck,
  active,
  theme,
  onSelect,
  label = 'Every slide as a grid',
  edit,
}: GridViewProps) {
  const byId = new Map(deck.slides.map((slide) => [slide.id, slide]));
  const [dragging, setDragging] = useState<string[] | null>(null);
  const [drop, setDrop] = useState<GridDrop | null>(null);
  const selected = edit?.selected ?? [active];
  const tile = edit?.tile ?? GRID_DEFAULT_TILE;
  const order = deck.sections.flatMap((section) => section.slideIds);

  const pick = (slide: ViewerSlide, event: MouseEvent<HTMLElement> | null) => {
    if (!edit) {
      onSelect(slide.id);
      return;
    }
    if (event?.shiftKey && selected.length > 0) {
      const anchor = order.indexOf(selected[0] ?? active);
      const to = order.indexOf(slide.id);
      const [from, until] = anchor <= to ? [anchor, to] : [to, anchor];
      edit.onSelectionChange(order.slice(from, until + 1));
      return;
    }
    if (event && (event.metaKey || event.ctrlKey)) {
      const next = selected.includes(slide.id)
        ? selected.filter((id) => id !== slide.id)
        : order.filter((id) => selected.includes(id) || id === slide.id);
      edit.onSelectionChange(next.length > 0 ? next : [slide.id]);
      return;
    }
    edit.onSelectionChange([slide.id]);
    onSelect(slide.id);
  };

  const onDragStart = (slide: ViewerSlide, event: DragEvent<HTMLElement>) => {
    if (!edit) return;
    const ids = selected.includes(slide.id)
      ? order.filter((id) => selected.includes(id))
      : [slide.id];
    event.dataTransfer.setData('text/plain', ids.join(','));
    event.dataTransfer.effectAllowed = 'move';
    setDragging(ids);
  };

  const onDragOver = (slide: ViewerSlide, event: DragEvent<HTMLElement>) => {
    if (!dragging || dragging.includes(slide.id)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const half = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    if (!drop || drop.id !== slide.id || drop.half !== half) setDrop({ id: slide.id, half });
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const ids = dragging ?? event.dataTransfer.getData('text/plain').split(',').filter(Boolean);
    const at = drop;
    setDragging(null);
    setDrop(null);
    if (!edit || ids.length === 0 || !at) return;
    const target = gridMoveTarget(deck, ids, at);
    if (target) edit.onMove(ids, target);
  };

  const onDragEnd = () => {
    setDragging(null);
    setDrop(null);
  };

  return (
    <div
      className={edit ? 'pt-grid pt-scroll is-edit' : 'pt-grid pt-scroll'}
      role="region"
      aria-label={label}
      data-tile={tile}
      style={{ '--pt-grid-tile': `${tile}px` } as CSSProperties}
    >
      <div className="pt-thumbs">
        {deck.sections.map((section) => (
          <Fragment key={section.id}>
            {!edit || edit.sections !== false || deck.sections.length > 1 ? (
              <div className="pt-sec-label">{section.name}</div>
            ) : null}
            {section.slideIds.map((id) => {
              const slide = byId.get(id);
              if (!slide) return null;
              const on = slide.id === active;
              const isSelected = edit ? selected.includes(slide.id) : on;
              const select = () => pick(slide, null);
              const name = `Slide ${slide.n}${slide.skip ? ', skipped' : ''}`;
              return (
                <div
                  key={slide.id}
                  className={[
                    'pt-thumb',
                    on && 'is-active',
                    isSelected && 'is-selected',
                    slide.skip && 'is-skipped',
                    dragging?.includes(slide.id) && 'is-dragging',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role={edit ? 'option' : 'button'}
                  tabIndex={0}
                  data-id={slide.id}
                  data-skip={slide.skip ? '' : undefined}
                  data-drop={drop?.id === slide.id ? drop.half : undefined}
                  aria-current={on || undefined}
                  aria-selected={edit ? isSelected : undefined}
                  aria-label={edit ? name : undefined}
                  draggable={edit ? true : undefined}
                  onMouseDown={pressWithoutFocus}
                  onClick={(event) => pick(slide, event)}
                  onDoubleClick={edit ? () => edit.onOpen(slide.id) : undefined}
                  onKeyDown={(event) => activateOnKey(event, select)}
                  onContextMenu={
                    edit
                      ? (event) => {
                          event.preventDefault();
                          if (!selected.includes(slide.id)) edit.onSelectionChange([slide.id]);
                          edit.onContextMenu(
                            slide.id,
                            { x: event.clientX, y: event.clientY },
                            event.currentTarget,
                          );
                        }
                      : undefined
                  }
                  onDragStart={edit ? (event) => onDragStart(slide, event) : undefined}
                  onDragOver={edit ? (event) => onDragOver(slide, event) : undefined}
                  onDrop={edit ? onDrop : undefined}
                  onDragEnd={edit ? onDragEnd : undefined}
                >
                  <div className="n">{pad2(slide.n)}</div>
                  <div className="pt-thumb-body">
                    <div className="pt-thumb-frame">
                      <LiveClone html={slide.html} theme={theme} />
                      {slide.shot ? <StaticShot shot={slide.shot} theme={theme} /> : null}
                      {slide.skip ? (
                        <span className="pt-thumb-skip" aria-hidden="true">
                          <svg viewBox="0 0 20 20" fill="currentColor">
                            <use href="#i-eye-slash" />
                          </svg>
                        </span>
                      ) : null}
                    </div>
                    {edit ? null : (
                      <div className="pt-thumb-title" data-preview={slide.id}>
                        {trimTitle(slide.title)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      {edit ? (
        <div className="pt-grid-size" role="group" aria-label="Tile size">
          <button
            type="button"
            className="pt-ib pt-icon"
            aria-label="Smaller tiles"
            data-tip="Smaller tiles"
            data-control="grid.smaller"
            disabled={tile === GRID_TILE_SIZES[0]}
            onClick={() => edit.onTile(stepTile(tile, -1))}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <use href="#i-minus" />
            </svg>
          </button>
          <button
            type="button"
            className="pt-ib pt-icon"
            aria-label="Larger tiles"
            data-tip="Larger tiles"
            data-control="grid.larger"
            disabled={tile === GRID_TILE_SIZES[GRID_TILE_SIZES.length - 1]}
            onClick={() => edit.onTile(stepTile(tile, 1))}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <use href="#i-plus" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
