import { useState } from 'react';

import { slideOrder, slideTitle } from '@turboslide/schema/deck';
import type { SlideLinkKeyword } from '@turboslide/schema/text';

import { Dialog, DialogField } from '../Dialog';
import { selectedBlock } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { tipProps } from '../Tooltip';

/**
 * Insert > Link on a selected block (gslides-parity SPEC 2.4, 7.2.7; Cmd+K): a Link (URL) field
 * and Slides in this presentation (Next, Previous, First, Last, then each slide by title), Apply;
 * Remove on a linked block. One `block.set /link`. The canvas link popover for a text selection
 * is the editor's (B4); this dialog serves the whole block when the route passes no `onLink`.
 */
const KEYWORDS: ReadonlyArray<{ value: SlideLinkKeyword; label: string }> = [
  { value: 'next', label: 'Next slide' },
  { value: 'previous', label: 'Previous slide' },
  { value: 'first', label: 'First slide' },
  { value: 'last', label: 'Last slide' },
];

export function LinkDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const slide = input.document.slides[input.slideId];
  const block = selectedBlock(slide, input.selection);
  const current = block?.link;
  const [url, setUrl] = useState(typeof current === 'string' ? current : '');
  const [target, setTarget] = useState<string>(
    current !== undefined && typeof current === 'object' ? current.slide : '',
  );
  const [error, setError] = useState<string | null>(null);
  const order = slideOrder(input.document.deck);

  const write = (value: unknown) => {
    if (block === undefined) return;
    input
      .dispatch('block.set', {
        slideId: input.slideId,
        blockId: block.id,
        path: '/link',
        ...(value === undefined ? {} : { value }),
        baseRevision: input.revision,
      })
      .then(() => shell.closeDialog())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  const apply = () => {
    if (target !== '') return write({ slide: target });
    const trimmed = url.trim();
    if (trimmed === '') return write(undefined);
    write(trimmed);
  };

  const actions = [
    ...(current !== undefined
      ? [
          {
            label: 'Remove',
            onClick: () => write(undefined),
            control: 'dialog.link.remove',
            doc: 'Removes the link',
          },
        ]
      : []),
    {
      label: 'Apply',
      primary: true,
      disabled: block === undefined,
      onClick: apply,
      control: 'dialog.link.apply',
      doc: 'Links the selected block',
    },
  ];

  return (
    <Dialog
      title="Link"
      onClose={shell.closeDialog}
      width={440}
      control="dialog.link"
      cancel
      actions={actions}
    >
      {block === undefined ? <p>Select a block first.</p> : null}
      <DialogField label="Link">
        <input
          type="url"
          value={url}
          autoFocus
          placeholder="https://"
          aria-label="Link"
          data-control="dialog.link.url"
          autoComplete="off"
          {...tipProps({ name: 'Link', doc: 'A web address; leave it empty to link to a slide' })}
          onChange={(event) => {
            setUrl(event.target.value);
            if (event.target.value !== '') setTarget('');
          }}
        />
      </DialogField>
      <DialogField label="Slides in this presentation">
        <select
          value={target}
          aria-label="Slides in this presentation"
          data-control="dialog.link.slide"
          onChange={(event) => {
            setTarget(event.target.value);
            if (event.target.value !== '') setUrl('');
          }}
          {...tipProps({ name: 'Slides in this presentation', doc: 'A slide the link jumps to' })}
        >
          <option value="">None</option>
          {KEYWORDS.map((keyword) => (
            <option key={keyword.value} value={keyword.value}>
              {keyword.label}
            </option>
          ))}
          {order.map((id, index) => {
            const each = input.document.slides[id];
            return (
              <option key={id} value={id}>
                {index + 1}. {each === undefined ? id : slideTitle(each, index + 1)}
              </option>
            );
          })}
        </select>
      </DialogField>
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
