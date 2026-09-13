import { useState } from 'react';

import { LINE_SPACING_PRESETS } from '@turboslide/schema/typography';

import { Dialog, DialogField } from '../Dialog';
import { selectedBlock } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { DIALOGS } from '../menus/strings';

/**
 * Format > Line & paragraph spacing > Custom spacing (gslides-parity SPEC-2 0.20, 4.1, 12
 * "Dialogs"): Line spacing as a factor, Paragraph spacing Before and After in px, Apply. One
 * `text.spacing` on the selected text block; Google's dialog has the same three fields.
 */
export function CustomSpacingDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const slide = input.document.slides[input.slideId];
  const block = selectedBlock(slide, input.selection);
  const typography =
    block !== undefined && 'typography' in block && typeof block.typography === 'object'
      ? (block.typography as Record<string, unknown> | undefined)
      : undefined;
  const [line, setLine] = useState(
    String(typeof typography?.leading === 'number' ? typography.leading : LINE_SPACING_PRESETS[0]),
  );
  const [before, setBefore] = useState(
    String(typeof typography?.spaceBefore === 'number' ? typography.spaceBefore : 0),
  );
  const [after, setAfter] = useState(
    String(typeof typography?.spaceAfter === 'number' ? typography.spaceAfter : 0),
  );
  const [error, setError] = useState<string | null>(null);
  const words = DIALOGS.customSpacing;

  const apply = () => {
    if (block === undefined) {
      setError('Select a text block first');
      return;
    }
    const leading = Number(line);
    const spaceBefore = Number(before);
    const spaceAfter = Number(after);
    if (!Number.isFinite(leading) || leading <= 0) {
      setError('Line spacing is a number above 0');
      return;
    }
    if (
      !Number.isFinite(spaceBefore) ||
      spaceBefore < 0 ||
      !Number.isFinite(spaceAfter) ||
      spaceAfter < 0
    ) {
      setError('Paragraph spacing is a number of px, 0 or more');
      return;
    }
    input
      .dispatch('text.spacing', {
        slideId: input.slideId,
        blockIds: [block.id],
        line: leading,
        before: spaceBefore === 0 ? null : spaceBefore,
        after: spaceAfter === 0 ? null : spaceAfter,
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
    step: string,
  ) => (
    <DialogField label={label} doc={doc}>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={0}
        value={value}
        aria-label={label}
        data-control={control}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            apply();
          }
        }}
      />
    </DialogField>
  );

  return (
    <Dialog
      title={words.title}
      onClose={shell.closeDialog}
      width={400}
      control="dialog.customSpacing"
      cancel
      cancelLabel={words.cancel}
      actions={[
        {
          label: words.apply,
          primary: true,
          onClick: apply,
          control: 'dialog.customSpacing.apply',
          doc: 'Writes the spacing to the selected text',
          disabled: block === undefined,
        },
      ]}
    >
      {field(
        words.lineSpacing,
        line,
        setLine,
        'dialog.customSpacing.line',
        'A factor of the type size: 1 is single, 2 is double',
        '0.05',
      )}
      <p className="ts-dialog-lead">{words.paragraphSpacing}</p>
      {field(
        words.before,
        before,
        setBefore,
        'dialog.customSpacing.before',
        'Space above every paragraph but the first',
        '1',
      )}
      {field(
        words.after,
        after,
        setAfter,
        'dialog.customSpacing.after',
        'Space under every paragraph but the last',
        '1',
      )}
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
