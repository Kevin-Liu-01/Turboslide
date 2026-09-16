import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { Block, BlockOf } from '@turboslide/schema/blocks';
import type { EquationDisplay } from '@turboslide/schema/blocks/equation';
import { EQUATION_PLACEHOLDER_TEX } from '@turboslide/schema/blocks/equation';

import {
  EQUATION_SOURCE_EVENT,
  equationCaret,
  insertLatex,
  setEquationCaret,
  stepEmptyGroup,
} from '../EquationToolbar';
import type { EquationSourceDetail, SourceCaret } from '../EquationToolbar';
import { tipProps } from '../Tooltip';
import { ColorRow, NumberField, Note, ToggleRow } from './fields';
import type { SectionWrite } from './fields';

import './equation.css';

/**
 * The equation block's inspector section (gslides-parity SPEC-5 8.2; R06 9.2, 9.4): the source
 * field with the live MathML preview on the sheet (every commit is one `block.set /tex` and the
 * sheet renders the block again from the store), Enter committing, Shift Enter a line break
 * inside an environment, Esc restoring the stored source, Tab and Shift Tab between empty
 * groups, Cmd . and Cmd , inserting `^{}` and `_{}`, Google's `\^` and `\_` read as `^` and `_`;
 * under it Display (Block, Inline), Size, Colour and Alt text, each one `block.set`. A parse
 * error the sheet recorded on the block root (`data-equation-error`) reads under the field.
 */
export type EquationSectionProps = { block: Block; write: SectionWrite };

export function isEquationBlock(block: Block): block is BlockOf<'equation'> {
  return block.type === 'equation';
}

/** Google Docs' typed scripts (R06 9.2): `\` then Shift 6 is `\^`, read as `^`; the same for `\_`. */
export function googleEscapes(source: string): string {
  return source.replace(/\\\^/g, '^').replace(/\\_/g, '_');
}

/** The parse error the sheet recorded for a block, read from its rendered root; null when none. */
export function sheetEquationError(blockId: string): string | null {
  if (typeof document === 'undefined') return null;
  const root = document.querySelector(
    `.ts-sheet .equation[data-block="${blockId.replace(/"/g, '\\"')}"]`,
  );
  return root?.getAttribute('data-equation-error') ?? null;
}

function selectionOf(field: HTMLTextAreaElement): SourceCaret {
  return { start: field.selectionStart, end: field.selectionEnd };
}

export function EquationSection({ block, write }: EquationSectionProps) {
  if (!isEquationBlock(block)) return null;
  return <EquationFields block={block} write={write} />;
}

function EquationFields({ block, write }: { block: BlockOf<'equation'>; write: SectionWrite }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<SourceCaret | null>(null);
  const stored = block.tex;
  const shown = draft ?? stored;

  const set = (path: string, value: unknown) =>
    write.report(
      write.dispatch('block.set', {
        slideId: write.slideId,
        blockId: block.id,
        path,
        ...(value === undefined ? {} : { value }),
        baseRevision: write.revision,
      }),
    );

  const commit = (next: string) => {
    setDraft(null);
    if (next !== stored) set('/tex', next);
  };

  /* the sheet's parse finding, read after every render of the block */
  useEffect(() => {
    setError(sheetEquationError(block.id));
    const timer = window.setTimeout(() => setError(sheetEquationError(block.id)), 120);
    return () => window.clearTimeout(timer);
  }, [block.id, stored]);

  /* a toolbar pick moves the draft and the caret (EquationToolbar.tsx) */
  useEffect(() => {
    const onSource = (event: Event) => {
      const detail = (event as CustomEvent<EquationSourceDetail>).detail;
      if (detail.blockId !== block.id) return;
      setDraft(detail.tex);
      pendingCaret.current = detail.caret;
    };
    document.addEventListener(EQUATION_SOURCE_EVENT, onSource);
    return () => document.removeEventListener(EQUATION_SOURCE_EVENT, onSource);
  }, [block.id]);

  useEffect(() => {
    const caret = pendingCaret.current;
    const el = field.current;
    if (caret === null || el === null) return;
    pendingCaret.current = null;
    el.focus();
    el.setSelectionRange(caret.start, caret.end);
  }, [shown]);

  const place = (next: { tex: string; caret: SourceCaret }) => {
    setDraft(next.tex);
    setEquationCaret(block.id, next.caret);
    pendingCaret.current = next.caret;
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const el = event.currentTarget;
    const caret = selectionOf(el);
    const source = shown;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      commit(googleEscapes(source));
      el.blur();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
      el.blur();
      return;
    }
    if (event.key === 'Tab') {
      const next = stepEmptyGroup(source, caret, event.shiftKey ? -1 : 1);
      if (next.start === caret.start && next.end === caret.end) return;
      event.preventDefault();
      setEquationCaret(block.id, next);
      el.setSelectionRange(next.start, next.end);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && (event.key === '.' || event.key === ',')) {
      event.preventDefault();
      place(insertLatex(source, caret, event.key === '.' ? '^{}' : '_{}'));
    }
  };

  const tip = tipProps({
    name: 'Equation LaTeX',
    doc: 'LaTeX; Enter applies, Shift Enter breaks a line inside an environment, Tab moves between empty groups, Cmd . and Cmd , add a superscript and a subscript',
    key: 'Enter',
  });
  const isPlaceholder = stored === EQUATION_PLACEHOLDER_TEX && draft === null;
  const display: EquationDisplay = block.display ?? 'block';

  return (
    <div className="ts-eq-section" data-control="formatOptions.equation">
      <label className="ts-fo-field ts-eq-field">
        <span className="ts-fo-field-label">Equation</span>
        <textarea
          ref={field}
          className="ts-eq-source"
          value={shown}
          rows={4}
          spellCheck={false}
          autoComplete="off"
          aria-label="Equation LaTeX"
          aria-invalid={error !== null ? true : undefined}
          data-control="formatOptions.equation.source"
          data-placeholder={isPlaceholder ? 'true' : undefined}
          {...tip}
          onChange={(event) => setDraft(googleEscapes(event.target.value))}
          onFocus={(event) => {
            tip.onFocus(event);
            const caret = equationCaret(block.id, shown);
            if (isPlaceholder) event.currentTarget.select();
            else event.currentTarget.setSelectionRange(caret.start, caret.end);
          }}
          onSelect={(event) => setEquationCaret(block.id, selectionOf(event.currentTarget))}
          onKeyUp={(event) => setEquationCaret(block.id, selectionOf(event.currentTarget))}
          onClick={(event) => setEquationCaret(block.id, selectionOf(event.currentTarget))}
          onKeyDown={(event) => {
            tip.onKeyDown(event);
            onKeyDown(event);
          }}
          onBlur={(event) => {
            tip.onBlur(event);
            setEquationCaret(block.id, selectionOf(event.currentTarget));
            if (draft !== null) commit(googleEscapes(draft));
          }}
        />
      </label>
      {error !== null ? (
        <p className="ts-eq-error" role="status" data-control="formatOptions.equation.error">
          {error}
        </p>
      ) : (
        <Note>The sheet draws the LaTeX as MathML and the file keeps the LaTeX</Note>
      )}
      {block.mathml !== undefined && stored.trim() === '' ? (
        <Note>Imported from PowerPoint as MathML; the first LaTeX you type replaces it</Note>
      ) : null}
      <div className="ts-fo-row">
        <span className="ts-fo-field-label">Display</span>
        <ToggleRow<EquationDisplay>
          label="Display"
          options={[
            {
              value: 'block',
              label: 'Block',
              doc: 'Display math, the default for a placed object',
            },
            { value: 'inline', label: 'Inline', doc: 'A small equation set at text size' },
          ]}
          pressed={display}
          onToggle={(value) => set('/display', value === 'block' ? undefined : value)}
          control="formatOptions.equation.display"
          disabled={write.busy}
        />
      </div>
      <NumberField
        label="Size"
        value={block.size}
        min={8}
        max={400}
        unit="px"
        doc="Font size in sheet px; empty for the body size"
        control="formatOptions.equation.size"
        disabled={write.busy}
        onCommit={(value) => set('/size', value)}
      />
      <ColorRow
        label="Colour"
        current={block.color}
        control="formatOptions.equation.color"
        disabled={write.busy}
        onPick={(value) => set('/color', value === null ? undefined : value)}
        doc="The ink of the equation; the theme's ink when unset"
      />
      <label className="ts-fo-field">
        <span className="ts-fo-field-label">Alt text</span>
        <span className="ts-fo-field-box">
          <input
            type="text"
            className="ts-eq-alt"
            defaultValue={block.alt ?? ''}
            key={`${block.id}:${block.alt ?? ''}`}
            aria-label="Alt text"
            data-control="formatOptions.equation.alt"
            disabled={write.busy}
            {...tipProps({
              name: 'Alt text',
              doc: 'The spoken form of the equation; Enter applies',
              key: 'Enter',
            })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                const value = event.currentTarget.value.trim();
                set('/alt', value === '' ? undefined : value);
                event.currentTarget.blur();
              }
            }}
            onBlur={(event) => {
              const value = event.currentTarget.value.trim();
              if (value !== (block.alt ?? '')) set('/alt', value === '' ? undefined : value);
            }}
          />
        </span>
      </label>
    </div>
  );
}
