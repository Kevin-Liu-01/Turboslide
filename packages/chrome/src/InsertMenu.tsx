import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { ShapeKind } from '@turboslide/schema/blocks';
import { SHAPE_KINDS } from '@turboslide/schema/blocks';
import type { IconName as SpriteIconName } from '@turboslide/schema/icons';
import { setAt } from '@turboslide/schema/pointer';

import type { EditorDispatch } from './dispatch';
import { IconPicker } from './IconPicker';
import { Icon } from './icons';
import { cn } from './lib/cn';
import type { PaletteEntry, PaletteRun } from './palette-data';
import { ToolButton } from './ToolButton';
import { tipProps } from './Tooltip';

import './InsertMenu.css';

/**
 * The Insert menu in the toolbar (Kevin, 2026-09-11: "reuse primitives and icons like boxes and
 * shapes"): a ToolButton in the shell grammar opens a card under itself, in the Export menu's
 * grammar (ExportMenu.css), with three groups drawn from the palette's Insert entries
 * (palette-data.ts insertEntries, so the menu and the palette offer one list): the primitives
 * (Box, Shape as five glyph buttons, Rule, Text, Icon through the sprite picker, Image,
 * Material), the grammar's other blocks, and the slide templates. Every row is one action
 * through the dispatcher the route owns (block.insert or slide.insert); an entry that still
 * needs an input says so in the toast. Every row carries a tooltip with its name, its hint and
 * where it lands. Focus (this round): opened from the keyboard the card focuses its first row,
 * opened with the pointer it takes focus itself (so no row's tooltip shows under the pointer);
 * Up, Down, Home and End move between the rows and the shape variants; Escape and a run return
 * focus to the Insert button. Presentational: the route builds the entries from its view and
 * passes them.
 */
export type InsertMenuProps = {
  /** the palette's entries; the menu keeps the Insert group */
  entries: ReadonlyArray<PaletteEntry>;
  dispatch: EditorDispatch;
  /** a line for the toast */
  onNotice?: (message: string) => void;
  className?: string;
};

/** The shape glyphs: the shape itself on the 20-unit grid, drawn with the ink stroke. */
function ShapeGlyph({ kind }: { kind: ShapeKind }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 };
  return (
    <svg viewBox="0 0 20 20" width={16} height={16} aria-hidden="true">
      {kind === 'rectangle' ? (
        <rect x="2.75" y="4.75" width="14.5" height="10.5" {...stroke} />
      ) : null}
      {kind === 'rounded' ? (
        <rect x="2.75" y="4.75" width="14.5" height="10.5" rx="3" {...stroke} />
      ) : null}
      {kind === 'ellipse' ? <ellipse cx="10" cy="10" rx="7.25" ry="5.25" {...stroke} /> : null}
      {kind === 'line' ? <path d="M3 10h14" {...stroke} /> : null}
      {kind === 'arrow' ? (
        <>
          <path d="M3 10h11" {...stroke} />
          <path d="M12 6.5 17 10l-5 3.5Z" fill="currentColor" />
        </>
      ) : null}
    </svg>
  );
}

type IconPick = { entry: PaletteEntry; run: PaletteRun & { kind: 'icon' } };

/** The rows the arrow keys walk: every menu item in the card, the shape variants included. */
const MENU_ITEMS = '[role="menuitem"]:not(:disabled)';

/** The Insert button of the anchor. */
function triggerOf(anchor: HTMLElement | null): HTMLButtonElement | null {
  return anchor?.querySelector('button') ?? null;
}

export function InsertMenu({ entries, dispatch, onNotice, className }: InsertMenuProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [at, setAt2] = useState<{ x: number; y: number } | null>(null);
  const [iconPick, setIconPick] = useState<IconPick | null>(null);
  /* the last press on the anchor was a pointer, so the open that follows is the pointer's */
  const viaPointer = useRef(false);

  /* the card sits under the button, in the viewport, like the Export menu */
  useEffect(() => {
    if (!open) return;
    const button = triggerOf(anchor.current);
    const rect = button?.getBoundingClientRect();
    if (rect) setAt2({ x: Math.min(rect.left, window.innerWidth - 352), y: rect.bottom + 6 });
    const onDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (card.current?.contains(event.target) || anchor.current?.contains(event.target)) return;
      // the press lands elsewhere: the menu closes and focus follows the press, not the button
      setOpen(false);
      setIconPick(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (iconPick) {
        setIconPick(null);
        return;
      }
      setOpen(false);
      triggerOf(anchor.current)?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, iconPick]);

  /* focus on open: the first row from the keyboard, the card itself from the pointer; the sprite
     picker manages its own focus while it has the card */
  useEffect(() => {
    if (!open || at === null || iconPick !== null) return;
    const el = card.current;
    if (!el) return;
    const first = viaPointer.current ? null : el.querySelector<HTMLElement>(MENU_ITEMS);
    (first ?? el).focus();
  }, [open, at, iconPick]);

  /* Up, Down, Home and End walk the rows (roving focus over the menu items) */
  const onCardKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (iconPick) return;
    const items = Array.from(card.current?.querySelectorAll<HTMLElement>(MENU_ITEMS) ?? []);
    if (items.length === 0) return;
    const index = items.findIndex((item) => item === document.activeElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = index < 0 ? 0 : (index + 1) % items.length;
        break;
      case 'ArrowUp':
        next = index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    items[next]?.focus();
  };

  const inserts = entries.filter((entry) => entry.group === 'insert');
  const primitives = inserts.filter((entry) => entry.insert === 'primitive');
  const blocks = inserts.filter((entry) => entry.insert === 'block');
  const slides = inserts.filter((entry) => entry.insert === 'slide');
  const shapes = primitives.filter((entry) => entry.variant !== undefined);
  const others = primitives.filter((entry) => entry.variant === undefined);

  /** Closes and returns focus to the Insert button (Escape, a run). */
  const close = () => {
    setOpen(false);
    setIconPick(null);
    triggerOf(anchor.current)?.focus();
  };

  const perform = (entry: PaletteEntry, run: PaletteRun) => {
    switch (run.kind) {
      case 'dispatch':
        close();
        dispatch(run.action, run.input)
          .then(() => onNotice?.(`Inserted ${entry.title.toLowerCase()}`))
          .catch((error: unknown) =>
            onNotice?.(error instanceof Error ? error.message : String(error)),
          );
        return;
      case 'icon':
        setIconPick({ entry, run });
        return;
      case 'needs':
        onNotice?.(`${entry.title}: ${run.reason}`);
        return;
      case 'call':
        close();
        run.call();
        return;
      case 'prompt':
        onNotice?.(`${entry.title}: use the palette`);
        return;
    }
  };

  const pickIcon = (name: SpriteIconName) => {
    if (!iconPick) return;
    const input: Record<string, unknown> = structuredClone(iconPick.run.input);
    setAt(input, iconPick.run.path, name);
    perform(iconPick.entry, { kind: 'dispatch', action: iconPick.run.action, input });
  };

  const row = (entry: PaletteEntry) => (
    <button
      key={entry.id}
      type="button"
      role="menuitem"
      className={cn('ts-insert-row', entry.run.kind === 'needs' && 'is-needs')}
      data-control={`insert.${entry.id.replace(/^insert:/, '')}`}
      onClick={() => perform(entry, entry.run)}
      {...tipProps({
        name: entry.title,
        doc: `${entry.hint ?? ''} ${entry.meta ? `Lands ${entry.meta}.` : ''}`.trim(),
      })}
    >
      <span className="ts-insert-ic" aria-hidden="true">
        <Icon name={entry.icon} />
      </span>
      <span className="ts-insert-t">{entry.title}</span>
      {entry.run.kind === 'needs' ? (
        <span className="ts-insert-needs">{entry.run.reason}</span>
      ) : null}
    </button>
  );

  return (
    <span
      ref={anchor}
      className={cn('ts-insert-anchor', className)}
      onPointerDownCapture={() => {
        viaPointer.current = true;
      }}
      onKeyDownCapture={(event) => {
        if (event.target === triggerOf(anchor.current)) viaPointer.current = false;
      }}
    >
      <ToolButton
        icon="plus"
        label="Insert"
        title="Insert"
        doc="Primitives (box, shape, rule, text, icon, image, material), the grammar's blocks and the slide templates; + in the palette lists the same."
        pressed={open}
        control="insert.open"
        className="ts-insert-btn"
        onClick={() => (open ? close() : setOpen(true))}
      />
      {open && at ? (
        <div
          ref={card}
          className="ts-insert"
          role="menu"
          aria-label="Insert"
          data-control="insert.menu"
          tabIndex={-1}
          style={{ left: at.x, top: at.y }}
          onKeyDown={onCardKey}
        >
          {iconPick ? (
            <div className="ts-insert-iconpick">
              <span className="ts-insert-head">{iconPick.run.label}</span>
              <IconPicker
                label="Insert icon"
                control="insert.icon"
                closeOnOutsidePress={false}
                onPick={pickIcon}
                onClose={() => setIconPick(null)}
              />
            </div>
          ) : (
            <>
              {inserts.length === 0 ? (
                <p className="ts-insert-note">
                  Nothing can be inserted here: open a content slide or a slide with a plate.
                </p>
              ) : null}
              {others.length > 0 || shapes.length > 0 ? (
                <span className="ts-insert-head">Primitives</span>
              ) : null}
              {others.slice(0, 1).map(row)}
              {shapes.length > 0 ? (
                <div className="ts-insert-shapes" role="group" aria-label="Shapes">
                  <span className="ts-insert-ic" aria-hidden="true">
                    <Icon name="cube" />
                  </span>
                  <span className="ts-insert-t">Shape</span>
                  <span className="ts-insert-variants">
                    {SHAPE_KINDS.map((kind) => {
                      const entry = shapes.find((candidate) => candidate.variant === kind);
                      if (entry === undefined) return null;
                      return (
                        <button
                          key={kind}
                          type="button"
                          role="menuitem"
                          className="ts-insert-variant"
                          aria-label={entry.title}
                          data-control={`insert.block.shape.${kind}`}
                          onClick={() => perform(entry, entry.run)}
                          {...tipProps({
                            name: entry.title,
                            doc: `${entry.hint ?? ''} ${entry.meta ? `Lands ${entry.meta}.` : ''}`.trim(),
                          })}
                        >
                          <ShapeGlyph kind={kind} />
                        </button>
                      );
                    })}
                  </span>
                </div>
              ) : null}
              {others.slice(1).map(row)}
              {blocks.length > 0 ? (
                <>
                  <span className="ts-insert-rule" aria-hidden="true" />
                  <span className="ts-insert-head">Blocks</span>
                  {blocks.map(row)}
                </>
              ) : null}
              {slides.length > 0 ? (
                <>
                  <span className="ts-insert-rule" aria-hidden="true" />
                  <span className="ts-insert-head">Slides</span>
                  {slides.map(row)}
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </span>
  );
}
