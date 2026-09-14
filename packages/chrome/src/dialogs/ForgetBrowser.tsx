import { useState } from 'react';

import { Dialog } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { ACCOUNT } from '../menus/strings';

/**
 * Forget this browser (gslides-parity SPEC-3 7.4; VERIFICATION-3 finding 12): the question of
 * ACCOUNT.forgetConfirm, Cancel and one solid Forget this browser button. Forget runs the route's
 * `account.forget`, which mints the new anonymous principal and its cookie on the server, clears
 * the localStorage and IndexedDB mirrors together and reloads the page as the new visitor; the
 * old edits keep the old label and nothing links the two.
 */
export function ForgetBrowserDialog() {
  const shell = useEditorShell();
  const account = shell.input.account;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = () => {
    if (busy) return;
    if (account?.forget === undefined) {
      shell.closeDialog();
      return;
    }
    setBusy(true);
    account.forget().then(
      () => shell.closeDialog(),
      (err: unknown) => {
        setBusy(false);
        setError(err instanceof Error ? err.message : String(err));
      },
    );
  };
  return (
    <Dialog
      title={ACCOUNT.forget}
      lead={ACCOUNT.forgetConfirm}
      onClose={() => shell.closeDialog()}
      width={440}
      control="dialog.forgetBrowser"
      cancel
      actions={[
        {
          label: ACCOUNT.forget,
          primary: true,
          disabled: busy,
          onClick: run,
          control: 'dialog.forgetBrowser.confirm',
          doc: 'Replaces your anonymous identity in this browser and clears its unsaved changes',
        },
      ]}
    >
      <p className="ts-dialog-error-row" role="alert" data-control="dialog.forgetBrowser.error">
        {error ?? ''}
      </p>
    </Dialog>
  );
}
