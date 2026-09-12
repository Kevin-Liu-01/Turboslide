import { useState } from 'react';

import { Dialog, DialogField } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { DIALOGS } from '../menus/strings';
import { tipProps } from '../Tooltip';

/**
 * File > Version history > Name current version (gslides-parity SPEC 2.1, 12 "Dialogs"): Name,
 * Save. One `version.save` with the note.
 */
export function NameVersionDialog() {
  const shell = useEditorShell();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const note = name.trim();
    if (note === '') return;
    shell.input
      .dispatch('version.save', { note })
      .then(() => {
        shell.closeDialog();
        shell.say(`Saved the version ${note}`);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };
  return (
    <Dialog
      title={DIALOGS.nameVersion.title}
      onClose={shell.closeDialog}
      width={400}
      control="dialog.nameVersion"
      cancel
      actions={[
        {
          label: DIALOGS.nameVersion.ok,
          primary: true,
          disabled: name.trim() === '',
          onClick: save,
          control: 'dialog.nameVersion.save',
          doc: 'Names the current version',
        },
      ]}
    >
      <DialogField label={DIALOGS.nameVersion.name}>
        <input
          type="text"
          value={name}
          autoFocus
          aria-label={DIALOGS.nameVersion.name}
          data-control="dialog.nameVersion.name"
          autoComplete="off"
          {...tipProps({
            name: DIALOGS.nameVersion.name,
            doc: 'What this version is called in Version history',
            key: 'Enter',
          })}
          onChange={(event) => setName(event.target.value)}
        />
      </DialogField>
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
