import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { BlockOf } from '@turboslide/schema/blocks';
import type { EquationSymbol, EquationSymbolGroup } from '@turboslide/schema/blocks/equation';
import {
  EQUATION_GROUP_LABELS,
  EQUATION_PLACEHOLDER_TEX,
  EQUATION_SYMBOL_GROUPS,
  equationSymbolsOf,
  firstEmptyGroup,
  isGoogleAlias,
} from '@turboslide/schema/blocks/equation';

import type { SectionWrite } from './inspector/fields';
import { cn } from './lib/cn';
import { gridKey } from './pickers/grid';
import { ToolButton } from './ToolButton';
import { tipProps } from './Tooltip';

import './EquationToolbar.css';

/**
 * The equation toolbar (gslides-parity SPEC-5 8.2; R06 2, 9.1): while an equation block is
 * selected it replaces the text toolbar in place with Google Docs' controls under Google's labels,
 * New equation (a second block below the current one), then the five dropdowns Greek letters,
 * Miscellaneous operations, Relations, Math operators and Arrows, each a glyph grid drawn from
 * `EQUATION_SYMBOLS` with the command as the tooltip, and a sixth, More (matrices, cases,
 * aligned, accents, fonts, colour; Turboslide's own). A pick inserts the symbol's LaTeX at the
 * caret of the inspector's source field (the caret this module keeps per block, `equationCaret`)
 * and leaves the caret inside the first empty group, then writes the source as one `block.set
 * /tex`; the sheet re-renders the MathML from the store. View > Show equation toolbar
 * (`settings.equationToolbar`, on by default) hides it. The toolbar is a `toolbar` role with the
 * dropdowns as menu buttons, like the shape picker (R06 11).
 */
export type EquationToolbarProps = {
  block: BlockOf<'equation'>;
  write: SectionWrite;
  /** New equation: a second block below this one; absent hides the button */
  onNewEquation?: () => void;
  /** View > Show equation toolbar off draws nothing */
  hidden?: boolean;
};

/** The dropdown grid's columns (the shape picker's eight, SPEC-2 section 10). */
export const EQUATION_GRID_COLUMNS = 8;

/** The caret of a block's source field, kept while the field is not mounted or focused. */
export type SourceCaret = { start: number; end: number };

const carets = new Map<string, SourceCaret>();

/** The event a pick dispatches on `document` so the source field moves its caret and draft. */
export const EQUATION_SOURCE_EVENT = 'ts-equation-source';

export type EquationSourceDetail = { blockId: string; tex: string; caret: SourceCaret };

export function equationCaret(blockId: string, source: string): SourceCaret {
  const caret = carets.get(blockId);
  if (caret === undefined) return { start: source.length, end: source.length };
  const end = Math.min(source.length, caret.end);
  return { start: Math.min(end, caret.start), end };
}

export function setEquationCaret(blockId: string, caret: SourceCaret): void {
  carets.set(blockId, caret);
}

/**
 * The source with a symbol's LaTeX inserted at the caret (replacing a selection), with a space
 * before it when a command would otherwise run into a letter (`x\alpha` is one command name), and
 * the caret after the insertion: inside its first empty group, else at its end (SPEC-5 8.2).
 */
export function insertLatex(
  source: string,
  caret: SourceCaret,
  latex: string,
): { tex: string; caret: SourceCaret } {
  const before = source.slice(0, caret.start);
  const after = source.slice(caret.end);
  const needsSpace = /\\[A-Za-z]+$/.test(before) && /^[A-Za-z]/.test(latex.replace(/^\\/, ''));
  const insert = `${needsSpace ? ' ' : ''}${latex}`;
  const tex = `${before}${insert}${after}`;
  const at = before.length + (needsSpace ? 1 : 0) + firstEmptyGroup(latex);
  return { tex, caret: { start: at, end: at } };
}

/** The caret after Tab or Shift Tab: the next or previous empty group, else unchanged. */
export function stepEmptyGroup(source: string, caret: SourceCaret, direction: 1 | -1): SourceCaret {
  if (direction === 1) {
    const at = source.indexOf('{}', caret.end);
    return at === -1 ? caret : { start: at + 1, end: at + 1 };
  }
  const at = source.lastIndexOf('{}', Math.max(0, caret.start - 2));
  return at === -1 ? caret : { start: at + 1, end: at + 1 };
}

/** The tooltip of a glyph tile: the command, and the standard form when the command is Google's alias. */
export function symbolTip(symbol: EquationSymbol): { name: string; doc: string } {
  return {
    name: symbol.command,
    doc: isGoogleAlias(symbol.command)
      ? `Google Docs' name; inserts ${symbol.latex}`
      : `Inserts ${symbol.latex}`,
  };
}

type GridProps = {
  group: EquationSymbolGroup;
  onPick: (symbol: EquationSymbol) => void;
  onClose: () => void;
  control: string;
};

function SymbolGrid({ group, onPick, onClose, control }: GridProps) {
  const root = useRef<HTMLDivElement>(null);
  const tiles = equationSymbolsOf(group);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    root.current?.focus();
  }, []);
  const active = tiles[Math.min(index, tiles.length - 1)];
  const tip = tipProps({
    name: EQUATION_GROUP_LABELS[group],
    doc: 'The arrows move, Enter inserts the symbol at the caret of the equation’s LaTeX',
    key: 'Enter',
  });
  return (
    <div
      ref={root}
      className="ts-picker ts-eq-grid"
      role="grid"
      aria-label={EQUATION_GROUP_LABELS[group]}
      aria-activedescendant={active === undefined ? undefined : `ts-eq-${group}-${index}`}
      tabIndex={0}
      data-control={`${control}.grid`}
      {...tip}
      onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
        tip.onKeyDown(event);
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return;
        }
        const result = gridKey(event, index, tiles.length, EQUATION_GRID_COLUMNS);
        if (result === null) return;
        event.preventDefault();
        event.stopPropagation();
        if ('pick' in result) {
          if (active !== undefined) onPick(active);
          return;
        }
        setIndex(result.index);
      }}
    >
      <div
        className="ts-picker-grid"
        role="row"
        style={{ gridTemplateColumns: `repeat(${EQUATION_GRID_COLUMNS}, 40px)` }}
      >
        {tiles.map((symbol, i) => (
          <button
            key={symbol.command}
            type="button"
            id={`ts-eq-${group}-${i}`}
            role="gridcell"
            className={cn('ts-picker-tile ts-eq-tile', i === index && 'is-active')}
            data-control={`${control}.pick.${symbol.command.replace(/^\\/, '').replace(/[^A-Za-z0-9]+/g, '-')}`}
            data-latex={symbol.latex}
            tabIndex={-1}
            onClick={() => onPick(symbol)}
            {...tipProps(symbolTip(symbol))}
            onMouseEnter={(event) => {
              tipProps(symbolTip(symbol)).onMouseEnter(event);
              setIndex(i);
            }}
          >
            <span className="ts-eq-glyph" aria-hidden="true">
              {symbol.unicode}
            </span>
            <span className="pt-sr">{symbol.command}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function EquationToolbar({ block, write, onNewEquation, hidden }: EquationToolbarProps) {
  const [open, setOpen] = useState<EquationSymbolGroup | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const onDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) setOpen(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (hidden === true) return null;

  const pick = (symbol: EquationSymbol) => {
    const source = block.tex === EQUATION_PLACEHOLDER_TEX ? '' : block.tex;
    const caret =
      block.tex === EQUATION_PLACEHOLDER_TEX
        ? { start: 0, end: 0 }
        : equationCaret(block.id, source);
    const next = insertLatex(source, caret, symbol.latex);
    setEquationCaret(block.id, next.caret);
    setOpen(null);
    if (typeof document !== 'undefined')
      document.dispatchEvent(
        new CustomEvent<EquationSourceDetail>(EQUATION_SOURCE_EVENT, {
          detail: { blockId: block.id, tex: next.tex, caret: next.caret },
        }),
      );
    write.report(
      write.dispatch('block.set', {
        slideId: write.slideId,
        blockId: block.id,
        path: '/tex',
        value: next.tex,
        baseRevision: write.revision,
      }),
    );
  };

  return (
    <div
      ref={rootRef}
      className="ts-eq-toolbar ts-tb-slot"
      role="toolbar"
      aria-label="Equation toolbar"
      data-control="equationToolbar"
    >
      {onNewEquation !== undefined ? (
        <ToolButton
          icon="plus"
          label="New equation"
          title="New equation"
          control="equationToolbar.new"
          onClick={onNewEquation}
        />
      ) : null}
      {EQUATION_SYMBOL_GROUPS.map((group) => {
        const control = `equationToolbar.${group}`;
        const isOpen = open === group;
        return (
          <span key={group} className="ts-eq-drop">
            <button
              type="button"
              className={cn('pt-ib is-text ts-tb ts-eq-drop-btn', isOpen && 'is-on')}
              aria-haspopup="grid"
              aria-expanded={isOpen}
              data-control={control}
              onClick={() => setOpen(isOpen ? null : group)}
              {...tipProps({
                name: EQUATION_GROUP_LABELS[group],
                doc:
                  group === 'more'
                    ? 'Matrices, cases, aligned rows, accents, fonts and colour beyond Google Docs’ table'
                    : `Google Docs’ ${EQUATION_GROUP_LABELS[group]} dropdown`,
              })}
            >
              <span className="pt-lb">{EQUATION_GROUP_LABELS[group]}</span>
              <span className="ts-eq-chevron" aria-hidden="true">
                ▾
              </span>
            </button>
            {isOpen ? (
              <div className="ts-eq-plate ts-chrome" role="presentation">
                <SymbolGrid
                  group={group}
                  onPick={pick}
                  onClose={() => setOpen(null)}
                  control={control}
                />
              </div>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
