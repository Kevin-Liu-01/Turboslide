import type { Block } from '@turboslide/schema/blocks';
import type { Color } from '@turboslide/schema/color';
import { marksOfRange, plainLength } from '@turboslide/schema/text';
import type { RunMarks } from '@turboslide/schema/text';
import { LINE_SPACING_PRESETS, TYPE_COLUMNS } from '@turboslide/schema/typography';
import type { TypeColumns } from '@turboslide/schema/typography';

import type { EditorSelection } from '../editor-shell';
import { textAt, textPathOf } from '../editor-shell';
import { FORMAT } from '../menus/strings';
import { ColorRow, NumberField, SelectField, ToggleRow } from './fields';
import type { SectionWrite } from './fields';

/**
 * The Text section's round two rows (gslides-parity SPEC-2 0.20, 0.21, 2.2.1 to 2.2.10, section 5):
 * Line spacing (Single, 1.15, 1.5, Double, Custom), Space before and Space after in px, Columns
 * (1, 2, 3), and the marks of the caret's run as toggle buttons (Bold, Italic, Underline,
 * Strikethrough, Superscript, Subscript) with Text color and Highlight color swatches while a run
 * is selected. Each is one action call: `text.spacing`, `text.columns`, `text.style`, and Bold
 * through `block.set /typography` as round one did. The generated typography rows of round one
 * stay above these.
 */
export type TextMarksSectionProps = {
  block: Block;
  selection: EditorSelection | null | undefined;
  write: SectionWrite;
};

type Mark = 'b' | 'i' | 'u' | 's' | 'sup' | 'sub';

function typographyOf(block: Block): Record<string, unknown> {
  return 'typography' in block && typeof block.typography === 'object' && block.typography !== null
    ? (block.typography as Record<string, unknown>)
    : {};
}

/** The line spacing option a leading value reads as. */
export function lineSpacingOption(
  leading: unknown,
): 'single' | '1.15' | '1.5' | 'double' | 'custom' {
  if (leading === undefined || leading === 1 || leading === 1.02) return 'single';
  if (leading === 1.15 || leading === 1.2) return '1.15';
  if (leading === 1.5) return '1.5';
  if (leading === 2 || leading === 1.7) return 'double';
  return 'custom';
}

export function TextMarksSection({ block, selection, write }: TextMarksSectionProps) {
  const words = FORMAT.text;
  const typography = typographyOf(block);
  const path = textPathOf(block, selection);
  const text = path === null ? undefined : textAt(block, path);
  const range: [number, number] = selection?.range ?? [0, plainLength(text ?? '')];
  const inRun = selection?.text === true && path !== null;
  const marks: RunMarks = selection?.marks ?? (text === undefined ? {} : marksOfRange(text, range));
  const bold = typography.weight === 500;
  const pressed = new Set<Mark>();
  if (bold) pressed.add('b');
  for (const mark of ['i', 'u', 's', 'sup', 'sub'] as const)
    if (marks[mark] === true) pressed.add(mark);

  const dispatchStyle = (edit: Record<string, unknown>) => {
    if (path === null) return;
    write.report(
      write.dispatch('text.style', {
        slideId: write.slideId,
        blockId: block.id,
        path,
        range,
        marks: edit,
        baseRevision: write.revision,
      }),
    );
  };

  const toggle = (mark: Mark) => {
    if (mark === 'b') {
      const next = { ...typography };
      if (bold) delete next.weight;
      else next.weight = 500;
      write.report(
        write.dispatch('block.set', {
          slideId: write.slideId,
          blockId: block.id,
          path: '/typography',
          ...(Object.keys(next).length === 0 ? {} : { value: next }),
          baseRevision: write.revision,
        }),
      );
      return;
    }
    const on = pressed.has(mark);
    const edit: Record<string, unknown> = { [mark]: !on };
    if (!on && mark === 'sup') edit.sub = false;
    if (!on && mark === 'sub') edit.sup = false;
    dispatchStyle(edit);
  };

  const spacing = (fields: {
    line?: number | null;
    before?: number | null;
    after?: number | null;
  }) =>
    write.report(
      write.dispatch('text.spacing', {
        slideId: write.slideId,
        blockIds: [block.id],
        ...fields,
        baseRevision: write.revision,
      }),
    );

  const lineOption = lineSpacingOption(typography.leading);
  const canColumn = block.type === 'text' || block.type === 'box' || block.type === 'paragraph';

  return (
    <>
      <div className="ts-fo-fields is-two">
        <SelectField<'single' | '1.15' | '1.5' | 'double' | 'custom'>
          label={words.lineSpacing}
          value={lineOption}
          control="formatOptions.text.lineSpacing"
          options={[
            { value: 'single', label: words.single },
            { value: '1.15', label: '1.15' },
            { value: '1.5', label: '1.5' },
            { value: 'double', label: words.double },
            { value: 'custom', label: words.custom },
          ]}
          onChange={(value) => {
            if (value === 'custom') return;
            const leading =
              value === 'single'
                ? LINE_SPACING_PRESETS[0]
                : value === '1.15'
                  ? LINE_SPACING_PRESETS[1]
                  : value === '1.5'
                    ? LINE_SPACING_PRESETS[2]
                    : LINE_SPACING_PRESETS[3];
            spacing({ line: leading });
          }}
          disabled={write.busy}
          doc="Single, 1.15, 1.5 or Double; Custom spacing is in the Format menu"
        />
        {canColumn ? (
          <SelectField<string>
            label={words.columns}
            value={String(typeof typography.columns === 'number' ? typography.columns : 1)}
            control="formatOptions.text.columns"
            options={TYPE_COLUMNS.map((n) => ({ value: String(n), label: String(n) }))}
            onChange={(value) =>
              write.report(
                write.dispatch('text.columns', {
                  slideId: write.slideId,
                  blockIds: [block.id],
                  columns: Number(value) as TypeColumns,
                  baseRevision: write.revision,
                }),
              )
            }
            disabled={write.busy}
            doc="The text flows in 1, 2 or 3 columns"
          />
        ) : null}
      </div>
      <div className="ts-fo-fields is-two">
        <NumberField
          label={words.spaceBefore}
          value={typeof typography.spaceBefore === 'number' ? typography.spaceBefore : 0}
          control="formatOptions.text.spaceBefore"
          onCommit={(value) => spacing({ before: value <= 0 ? null : Math.round(value) })}
          disabled={write.busy}
          min={0}
          unit="px"
        />
        <NumberField
          label={words.spaceAfter}
          value={typeof typography.spaceAfter === 'number' ? typography.spaceAfter : 0}
          control="formatOptions.text.spaceAfter"
          onCommit={(value) => spacing({ after: value <= 0 ? null : Math.round(value) })}
          disabled={write.busy}
          min={0}
          unit="px"
        />
      </div>
      {path !== null ? (
        <ToggleRow<Mark>
          label="Marks"
          options={[
            { value: 'b', label: 'Bold', icon: 'bold', doc: 'Cmd B' },
            { value: 'i', label: 'Italic', icon: 'italic', doc: 'Cmd I' },
            { value: 'u', label: 'Underline', icon: 'underline', doc: 'Cmd U' },
            { value: 's', label: 'Strikethrough', icon: 'strikethrough', doc: 'Cmd Shift X' },
            { value: 'sup', label: 'Superscript', doc: 'Cmd .' },
            { value: 'sub', label: 'Subscript', doc: 'Cmd ,' },
          ]}
          pressed={pressed}
          onToggle={toggle}
          control="formatOptions.text.marks"
          mode="multi"
          disabled={write.busy}
        />
      ) : null}
      {inRun ? (
        <>
          <ColorRow
            label={words.textColor}
            current={marks.color as Color | undefined}
            control="formatOptions.text.color"
            onPick={(value) => dispatchStyle({ color: value })}
            disabled={write.busy}
            doc="The colour of the selected text"
          />
          <ColorRow
            label={words.highlightColor}
            current={marks.hl as Color | undefined}
            control="formatOptions.text.highlight"
            onPick={(value) => dispatchStyle({ highlight: value })}
            disabled={write.busy}
            doc="The colour behind the selected text"
          />
        </>
      ) : null}
    </>
  );
}
