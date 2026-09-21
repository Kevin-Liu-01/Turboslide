import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from './icons';

import type { Deck, DeckDocument, Slide } from '@turboslide/schema/deck';
import type { LayoutEntry, LayoutId } from '@turboslide/schema/layouts';
import { LAYOUT_RULE_LABEL, derivedLayout, layoutGroups } from '@turboslide/schema/layouts';
import { LiveClone } from '@turboslide/viewer/LiveClone';
import type { Theme } from '@turboslide/viewer/theme';

import { cn } from './lib/cn';

import './LayoutGrid.css';

/**
 * The layout grid (gslides-parity SPEC 5.2, 5.3, 5.5; R03 finding 2): the 21 layouts as 128 by
 * 72 tiles in three columns with the name under each, Google's eleven first, a labelled rule
 * reading "GT layouts", the ten GT layouts after it. Each tile is the slide the entry's `make`
 * produces for this deck, rendered through the one renderer with the live prompts, in the deck's
 * appearance, cached per appearance and deck. The current layout is ringed in ink. A picture
 * layout the deck cannot make (no starter picture) reads "Add a picture first" and asks for one.
 * One component in four places: the New slide arrow, the Layout button, Slide > Apply layout and
 * the filmstrip's Apply layout submenu (SPEC 5.1). The renderer arrives as a prop: the chrome
 * package does not depend on @turboslide/render (the route passes `renderSlide`), and without one
 * a tile shows the layout's name on the plate. New in Turboslide (no Prototemplate source).
 *
 * The product round (docs/PRODUCT.md 3.4, section 2 rank 24): four columns at 1280 px and up so
 * Google's eleven show without scrolling (audit-interface 34); the GT layouts as a collapsed
 * group under a disclosure row, remembered per browser; and the layout's sentence in a caption
 * row at the bottom of the plate for the hovered or focused tile instead of a floating tooltip
 * over the neighbouring tiles (audit-interface 24). The tiles keep `data-tip` so the tooltip
 * audit finds a name on every control, and attach no tooltip handlers.
 */

/** The browser's memory of the GT group's disclosure (3.4). */
export const GT_GROUP_KEY = 'ts-layout-gt-open';

function readGtOpen(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(GT_GROUP_KEY) === '1';
  } catch {
    return false;
  }
}

function storeGtOpen(open: boolean): void {
  try {
    localStorage.setItem(GT_GROUP_KEY, open ? '1' : '0');
  } catch {
    // private mode: the choice lasts the plate
  }
}

/** The plate's columns: four at 1280 px and up (LayoutGrid.css), three under it. */
export function columnsFor(width: number): number {
  return width >= 1280 ? 4 : 3;
}

/** The sentence the caption row reads with no tile under the pointer. */
export const CAPTION_REST = 'Point at a layout to read what it holds';

/** Renders a slide of the deck to its HTML in a theme, with the live prompts drawn (SPEC 5.4). */
export type SlideRenderer = (slide: Slide, theme: Theme) => string;
export type LayoutGridProps = {
  document: DeckDocument;
  /** the slide whose layout is ringed; none on New slide */
  slide?: Slide;
  theme: Theme;
  /** the renderer; a tile without one shows the layout's name */
  render?: SlideRenderer;
  onPick: (layout: LayoutId) => void;
  /** a picture layout the deck cannot make yet: open the file picker */
  onAddPicture?: () => void;
  /** the data-control id prefix; `layout` unless set */
  control?: string;
  /** focus the first tile on mount (opened from the keyboard) */
  autoFocus?: boolean;
  className?: string;
};

/** The id the grid renders a preview slide under; never written to the deck. */
const PREVIEW_ID = 'layout-preview';

export type LayoutTile = {
  entry: LayoutEntry;
  /** the rendered slide; null when the deck lacks the picture the layout needs; undefined without a renderer */
  html: string | null | undefined;
};

/** The tiles for a deck: one render per entry, the live prompts drawn (SPEC 5.4). */
export function layoutTiles(
  deck: Deck,
  theme: Theme,
  renderer?: SlideRenderer,
): { google: LayoutTile[]; gt: LayoutTile[] } {
  const sectionId = deck.sections[0]?.id ?? 'deck';
  const render = (entry: LayoutEntry): LayoutTile => {
    const made = entry.make(PREVIEW_ID, deck, sectionId);
    if (made === null) return { entry, html: null };
    if (renderer === undefined) return { entry, html: undefined };
    try {
      return { entry, html: renderer(made, theme) };
    } catch {
      return { entry, html: undefined };
    }
  };
  const groups = layoutGroups();
  return { google: groups.google.map(render), gt: groups.gt.map(render) };
}

const ADD_PICTURE = 'Add a picture first';

export function LayoutGrid({
  document,
  slide,
  theme,
  render,
  onPick,
  onAddPicture,
  control = 'layout',
  autoFocus = false,
  className,
}: LayoutGridProps) {
  const { deck } = document;
  const tiles = useMemo(() => layoutTiles(deck, theme, render), [deck, theme, render]);
  const current = slide === undefined ? null : derivedLayout(slide);
  const root = useRef<HTMLDivElement>(null);
  /* the GT group opens when the current layout is one of its own, else as this browser left it */
  const [gtOpen, setGtOpen] = useState<boolean>(
    () => tiles.gt.some((tile) => tile.entry.id === current) || readGtOpen(),
  );
  const all = useMemo(
    () => (gtOpen ? [...tiles.google, ...tiles.gt] : tiles.google),
    [tiles, gtOpen],
  );
  const [focusId, setFocusId] = useState<LayoutId>(current ?? all[0]?.entry.id ?? 'title');
  /* the caption row's tile: the one under the pointer or the focus, else the current layout */
  const [captionId, setCaptionId] = useState<LayoutId | null>(null);
  const [columns, setColumns] = useState(3);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const apply = () => setColumns(columnsFor(window.innerWidth));
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  useEffect(() => {
    if (!autoFocus) return;
    root.current?.querySelector<HTMLElement>(`[data-layout="${focusId}"]`)?.focus();
  }, [autoFocus, focusId]);

  const toggleGt = () => {
    setGtOpen((open) => {
      storeGtOpen(!open);
      return !open;
    });
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest('.ts-layout-rule') !== null)
      return;
    const at = all.findIndex((tile) => tile.entry.id === focusId);
    if (at < 0) return;
    let next = at;
    switch (event.key) {
      case 'ArrowRight':
        next = Math.min(all.length - 1, at + 1);
        break;
      case 'ArrowLeft':
        next = Math.max(0, at - 1);
        break;
      case 'ArrowDown':
        next = Math.min(all.length - 1, at + columns);
        break;
      case 'ArrowUp':
        next = Math.max(0, at - columns);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = all.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = all[next];
    if (target === undefined) return;
    setFocusId(target.entry.id);
    root.current?.querySelector<HTMLElement>(`[data-layout="${target.entry.id}"]`)?.focus();
  };

  /** The caption of a tile (rank 24): the seller's sentence, or the picture it needs. */
  const captionOf = (item: LayoutTile | undefined): string => {
    if (item === undefined) return CAPTION_REST;
    return item.html === null
      ? `${item.entry.sentence}. ${ADD_PICTURE}: this layout carries a full picture`
      : item.entry.sentence;
  };
  const captionTile =
    (captionId === null ? undefined : all.find((each) => each.entry.id === captionId)) ??
    (current === null ? undefined : all.find((each) => each.entry.id === current));

  const tile = (item: LayoutTile) => {
    const { entry, html } = item;
    const isCurrent = current === entry.id;
    const missing = html === null;
    return (
      <button
        key={entry.id}
        type="button"
        className={cn('ts-layout-tile', isCurrent && 'is-current', missing && 'is-missing')}
        role="option"
        aria-selected={isCurrent}
        aria-label={entry.label}
        tabIndex={focusId === entry.id ? 0 : -1}
        data-layout={entry.id}
        data-control={`${control}.${entry.id}`}
        data-tip={entry.label}
        onPointerEnter={() => setCaptionId(entry.id)}
        onPointerLeave={() => setCaptionId((id) => (id === entry.id ? null : id))}
        onFocus={() => {
          setFocusId(entry.id);
          setCaptionId(entry.id);
        }}
        onBlur={() => setCaptionId((id) => (id === entry.id ? null : id))}
        onClick={() => {
          if (missing) onAddPicture?.();
          else onPick(entry.id);
        }}
      >
        <span className="ts-layout-frame" aria-hidden="true">
          {missing ? (
            <span className="ts-layout-missing">{ADD_PICTURE}</span>
          ) : html === undefined ? (
            <span className="ts-layout-missing is-name">{entry.label}</span>
          ) : (
            <LiveClone html={html} theme={theme} frame={false} />
          )}
        </span>
        <span className="ts-layout-name">{entry.label}</span>
      </button>
    );
  };

  return (
    <div
      ref={root}
      className={cn('ts-layout-grid ts-chrome', className)}
      role="listbox"
      aria-label="Layouts"
      data-control={control}
      data-theme={theme}
      onKeyDown={onKeyDown}
    >
      <div className="ts-layout-tiles">{tiles.google.map(tile)}</div>
      <button
        type="button"
        className="ts-layout-rule"
        aria-expanded={gtOpen}
        aria-controls={`${control}-gt`}
        data-control={`${control}.gt`}
        data-tip={LAYOUT_RULE_LABEL}
        onClick={toggleGt}
      >
        <span>
          {LAYOUT_RULE_LABEL} ({tiles.gt.length})
        </span>
        <Icon name="chevron-down" />
      </button>
      {gtOpen ? (
        <div className="ts-layout-tiles" id={`${control}-gt`}>
          {tiles.gt.map(tile)}
        </div>
      ) : null}
      <p className="ts-layout-caption" data-control={`${control}.caption`} aria-live="polite">
        {captionOf(captionTile)}
      </p>
    </div>
  );
}
