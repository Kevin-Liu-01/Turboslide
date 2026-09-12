import { useState } from 'react';

import { deckCounter } from '@turboslide/schema/deck';
import type { CounterMode } from '@turboslide/schema/deck';

import { Dialog, DialogRadio } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { DIALOGS } from '../menus/strings';

/**
 * Insert > Slide numbers (gslides-parity SPEC 2.4, 7.2.4, 12 "Dialogs"): On, Off, Skip title
 * slides, Apply. One `deck.set /defaults/counter` through the editor's commit.
 */
export function SlideNumbersDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const current = deckCounter(input.document.deck);
  const [value, setValue] = useState<CounterMode>(current);
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    if (input.commit === undefined) {
      setError('Slide numbers cannot be changed here yet');
      return;
    }
    input
      .commit([{ op: 'deck.set', path: '/defaults/counter', value }], 'Slide numbers')
      .then(() => shell.closeDialog())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  return (
    <Dialog
      title={DIALOGS.slideNumbers.title}
      onClose={shell.closeDialog}
      width={400}
      control="dialog.slideNumbers"
      cancel
      actions={[
        {
          label: DIALOGS.slideNumbers.apply,
          primary: true,
          onClick: apply,
          control: 'dialog.slideNumbers.apply',
          doc: 'Writes the choice to the presentation',
        },
      ]}
    >
      <DialogRadio
        name="Slide numbers"
        value={value}
        onChange={setValue}
        control="dialog.slideNumbers"
        options={[
          {
            value: 'on',
            label: DIALOGS.slideNumbers.on,
            doc: 'The number in the frame of every slide',
          },
          { value: 'off', label: DIALOGS.slideNumbers.off, doc: 'No numbers' },
          {
            value: 'skip-title',
            label: DIALOGS.slideNumbers.skipTitles,
            doc: 'Numbers on every slide but the title slides',
          },
        ]}
      />
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
