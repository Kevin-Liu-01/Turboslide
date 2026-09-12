import { useState } from 'react';

import { CATALOG } from '@turboslide/schema/catalog';
import type { IconName } from '@turboslide/schema/icons';

import { Dialog } from '../Dialog';
import { factsOf, insertBlockPlan } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { IconPicker } from '../IconPicker';
import { DIALOGS } from '../menus/strings';

/**
 * Insert > Icon (gslides-parity SPEC 2.4, a Turboslide row): the theme's symbol picker
 * (IconPicker.tsx, the one card the inspector and the palette use, embedded) in a dialog; a
 * symbol inserts an `icon` block of that name at 24 px through one `block.insert` into the
 * current slot. The symbols carry `dialog.insertIcon.pick.<name>` for the window API; the tone
 * is set afterwards in Format options.
 */
export function InsertIconDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const words = DIALOGS.insertIcon;

  const pick = (name: IconName) => {
    if (busy) return;
    const plan = insertBlockPlan(
      factsOf(input, shell.lastLayout),
      'icon',
      (id) => ({ ...CATALOG.icon.make(id), name }),
      words.title,
    );
    if ('refused' in plan) {
      setError(plan.refused);
      return;
    }
    setBusy(true);
    input
      .dispatch(plan.action, plan.input)
      .then(() => shell.closeDialog())
      .catch((err: unknown) => {
        setBusy(false);
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  return (
    <Dialog
      title={words.title}
      lead={words.lead}
      onClose={shell.closeDialog}
      width={420}
      control="dialog.insertIcon"
    >
      <IconPicker
        label={words.title}
        onPick={pick}
        onClose={shell.closeDialog}
        control="dialog.insertIcon"
        embedded
      />
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
