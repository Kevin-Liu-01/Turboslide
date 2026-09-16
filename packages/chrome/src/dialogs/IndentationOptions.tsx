import { useState } from 'react';

import { Dialog, DialogField } from '../Dialog';
import { selectedBlock } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { formatUnit, parseUnit, preferencesOf, unitSuffix } from '../text-tools';
import { tipProps } from '../Tooltip';

import './text-tools-dialogs.css';

/**
 * Format > Align & indent > Indentation options (gslides-parity SPEC-5 7.7, 0.42; P1 5.13):
 * Google's small dialog with the Left, First line and Hanging fields in the preference's unit
 * (Google's Right field is not drawn: the block model has no right indent, so the row would be
 * a control without a write). Apply is one `text.indent` write with `to`, `firstLine` and
 * `hanging` together; the ruler's two indent markers follow the block's typography (Rulers.tsx,
 * B4, by request). Cancel leaves the block as it was.
 */
export const INDENTATION_STRINGS = {
  title: 'Indentation options',
  left: 'Left',
  firstLine: 'First line',
  hanging: 'Hanging',
  apply: 'Apply',
  none: 'Select a text box or a paragraph to set its indents',
} as const;

export function IndentationOptionsDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const unit = preferencesOf(input).units;
  const slide = input.document.slides[input.slideId];
  const block = selectedBlock(slide, input.selection);
  const typography =
    (block as { typography?: Record<string, unknown> } | undefined)?.typography ?? {};
  const read = (key: string): number =>
    typeof typography[key] === 'number' ? (typography[key] as number) : 0;
  const [left, setLeft] = useState(() => formatUnit(read('indent'), unit));
  const [firstLine, setFirstLine] = useState(() => formatUnit(read('firstLine'), unit));
  const [hanging, setHanging] = useState(() => formatUnit(read('hanging'), unit));
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    if (block === undefined) return;
    const to = parseUnit(left, unit);
    const first = parseUnit(firstLine, unit);
    const hang = parseUnit(hanging, unit);
    if (to === null || first === null || hang === null || to < 0 || first < 0 || hang < 0) {
      setError(`Each field takes a number of ${unitSuffix(unit)} at or above zero`);
      return;
    }
    setError(null);
    input
      .dispatch('text.indent', {
        slideId: input.slideId,
        blockIds: [block.id],
        to,
        firstLine: first === 0 ? null : first,
        hanging: hang === 0 ? null : hang,
        baseRevision: input.revision,
      })
      .then(() => shell.closeDialog())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  const field = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    control: string,
    doc: string,
  ) => (
    <DialogField label={label} hint={unitSuffix(unit)} doc={doc}>
      <input
        type="text"
        inputMode="decimal"
        className="ts-tt-field"
        value={value}
        aria-label={`${label} in ${unitSuffix(unit)}`}
        data-control={control}
        disabled={block === undefined}
        {...tipProps({ name: label, doc })}
        onChange={(event) => onChange(event.target.value)}
      />
    </DialogField>
  );

  return (
    <Dialog
      title={INDENTATION_STRINGS.title}
      onClose={shell.closeDialog}
      cancel
      width={400}
      control="dialog.indentationOptions"
      actions={[
        {
          label: INDENTATION_STRINGS.apply,
          primary: true,
          disabled: block === undefined,
          onClick: apply,
          control: 'dialog.indentationOptions.apply',
          doc: 'Writes the three indents as one change',
        },
      ]}
    >
      {block === undefined ? <p className="ts-tt-empty">{INDENTATION_STRINGS.none}</p> : null}
      {field(
        INDENTATION_STRINGS.left,
        left,
        setLeft,
        'dialog.indentationOptions.left',
        'The left indent of every line',
      )}
      {field(
        INDENTATION_STRINGS.firstLine,
        firstLine,
        setFirstLine,
        'dialog.indentationOptions.firstLine',
        'The extra indent of the first line of each paragraph',
      )}
      {field(
        INDENTATION_STRINGS.hanging,
        hanging,
        setHanging,
        'dialog.indentationOptions.hanging',
        'The extra indent of every line but the first',
      )}
      {error !== null ? (
        <p className="ts-tt-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
