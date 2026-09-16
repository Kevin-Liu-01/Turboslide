import { useState } from 'react';

import { Dialog, DialogField } from '../Dialog';
import { selectedBlock } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { tipProps } from '../Tooltip';

import './text-tools-dialogs.css';

/**
 * Format > Bullets & numbering > List options > Restart numbering and Edit prefix and suffix
 * (gslides-parity SPEC-5 7.7, 0.42; P1 5.13): Google's two small dialogs over `plain.start` and
 * the prefix and suffix strings, one `text.list` write each (the widened form of the handler,
 * apps/cli/src/actions/prefs.ts). The PPTX writes `startAt` and the scheme's text where OOXML has
 * one (`arabicParenR` and kin) and reports the rest (pptx/text.ts numberSchemeFor).
 */
export const LIST_OPTIONS_STRINGS = {
  restart: 'Restart numbering',
  startAt: 'Start at',
  prefixSuffix: 'Edit prefix and suffix',
  prefix: 'Prefix',
  suffix: 'Suffix',
  apply: 'Apply',
  none: 'Select a numbered list to change its numbering',
} as const;

type ListBlock = {
  id: string;
  type: 'plain';
  marker?: string;
  start?: number;
  prefix?: string;
  suffix?: string;
};

function listBlockOf(input: ReturnType<typeof useEditorShell>['input']): ListBlock | undefined {
  const slide = input.document.slides[input.slideId];
  const block = selectedBlock(slide, input.selection);
  if (block === undefined || block.type !== 'plain') return undefined;
  return block as unknown as ListBlock;
}

export function RestartNumberingDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const block = listBlockOf(input);
  const [value, setValue] = useState(() => String(block?.start ?? 1));
  const [error, setError] = useState<string | null>(null);
  const apply = () => {
    if (block === undefined) return;
    const start = Number(value.trim());
    if (!Number.isInteger(start) || start < 0 || start > 9999) {
      setError('Start at takes a whole number from 0 to 9999');
      return;
    }
    input
      .dispatch('text.list', {
        slideId: input.slideId,
        blockId: block.id,
        start: start === 1 ? null : start,
        baseRevision: input.revision,
      })
      .then(() => shell.closeDialog())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };
  return (
    <Dialog
      title={LIST_OPTIONS_STRINGS.restart}
      onClose={shell.closeDialog}
      cancel
      width={360}
      control="dialog.restartNumbering"
      actions={[
        {
          label: LIST_OPTIONS_STRINGS.apply,
          primary: true,
          disabled: block === undefined,
          onClick: apply,
          control: 'dialog.restartNumbering.apply',
          doc: 'The list counts from this number',
        },
      ]}
    >
      {block === undefined ? <p className="ts-tt-empty">{LIST_OPTIONS_STRINGS.none}</p> : null}
      <DialogField label={LIST_OPTIONS_STRINGS.startAt} doc="The number the first item shows">
        <input
          type="number"
          min={0}
          max={9999}
          className="ts-tt-field"
          value={value}
          aria-label={LIST_OPTIONS_STRINGS.startAt}
          data-control="dialog.restartNumbering.start"
          disabled={block === undefined}
          autoFocus
          {...tipProps({
            name: LIST_OPTIONS_STRINGS.startAt,
            doc: 'The number the first item shows',
          })}
          onChange={(event) => setValue(event.target.value)}
        />
      </DialogField>
      {error !== null ? (
        <p className="ts-tt-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

export function PrefixSuffixDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const block = listBlockOf(input);
  const [prefix, setPrefix] = useState(block?.prefix ?? '');
  const [suffix, setSuffix] = useState(block?.suffix ?? '.');
  const [error, setError] = useState<string | null>(null);
  const apply = () => {
    if (block === undefined) return;
    if (prefix.length > 8 || suffix.length > 8) {
      setError('A prefix or suffix is at most 8 characters');
      return;
    }
    input
      .dispatch('text.list', {
        slideId: input.slideId,
        blockId: block.id,
        prefix: prefix === '' ? null : prefix,
        suffix: suffix === '.' || suffix === '' ? null : suffix,
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
    <DialogField label={label} doc={doc}>
      <input
        type="text"
        maxLength={8}
        className="ts-tt-field"
        value={value}
        aria-label={label}
        data-control={control}
        disabled={block === undefined}
        {...tipProps({ name: label, doc })}
        onChange={(event) => onChange(event.target.value)}
      />
    </DialogField>
  );
  return (
    <Dialog
      title={LIST_OPTIONS_STRINGS.prefixSuffix}
      onClose={shell.closeDialog}
      cancel
      width={360}
      control="dialog.prefixSuffix"
      actions={[
        {
          label: LIST_OPTIONS_STRINGS.apply,
          primary: true,
          disabled: block === undefined,
          onClick: apply,
          control: 'dialog.prefixSuffix.apply',
          doc: 'Writes the text around every numeral',
        },
      ]}
    >
      {block === undefined ? <p className="ts-tt-empty">{LIST_OPTIONS_STRINGS.none}</p> : null}
      {field(
        LIST_OPTIONS_STRINGS.prefix,
        prefix,
        setPrefix,
        'dialog.prefixSuffix.prefix',
        'The text before each numeral, such as an opening bracket',
      )}
      {field(
        LIST_OPTIONS_STRINGS.suffix,
        suffix,
        setSuffix,
        'dialog.prefixSuffix.suffix',
        'The text after each numeral; a period is the default',
      )}
      {error !== null ? (
        <p className="ts-tt-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
