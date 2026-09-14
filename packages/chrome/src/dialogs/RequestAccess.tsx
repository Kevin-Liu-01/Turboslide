import { useState } from 'react';

import { Dialog, DialogField } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import type { EditorRole } from '../editor-shell';
import { ACCESS_PAGE, DIALOGS, REFUSALS } from '../menus/strings';

/**
 * Request access from inside the editor (gslides-parity SPEC-3 6.3, 6.5): the View only button's
 * "Request edit access" with the role picker defaulting to what the button asked for, an optional
 * message, an email field for an anonymous requester. The answer is always "If this presentation
 * exists, its owner has been asked." (0.47): the dialog closes on it and the snackbar says it.
 */
export function RequestAccessDialog({ role: initial = 'editor' }: { role?: EditorRole }) {
  const shell = useEditorShell();
  const { input } = shell;
  const anonymous = input.account?.signedIn !== true;
  const [role, setRole] = useState<EditorRole>(initial);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = () => {
    if (busy) return;
    if (anonymous && email.trim() === '') {
      setError('An address the answer can reach');
      return;
    }
    setBusy(true);
    input
      .dispatch('share.requestAccess', {
        id: input.deckId,
        role,
        ...(message.trim() === '' ? {} : { message: message.trim() }),
        ...(anonymous ? { email: email.trim() } : {}),
      })
      .then(() => {
        shell.closeDialog();
        shell.say(REFUSALS.requested);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      title={REFUSALS.requestEditAccess}
      onClose={shell.closeDialog}
      width={400}
      control="dialog.requestAccess"
      cancel
      actions={[
        {
          label: ACCESS_PAGE.requestAccess,
          primary: true,
          disabled: busy,
          onClick: send,
          control: 'dialog.requestAccess.send',
          doc: 'Asks the owner; the answer arrives by mail or in Notifications',
        },
      ]}
    >
      <DialogField label={ACCESS_PAGE.role} doc="What you would like to do">
        <select
          value={role}
          aria-label={ACCESS_PAGE.role}
          data-control="dialog.requestAccess.role"
          onChange={(event) => setRole(event.target.value as EditorRole)}
        >
          <option value="viewer">{DIALOGS.share.roles.viewer}</option>
          <option value="commenter">{DIALOGS.share.roles.commenter}</option>
          <option value="editor">{DIALOGS.share.roles.editor}</option>
        </select>
      </DialogField>
      <DialogField label={ACCESS_PAGE.message} doc="A line for the owner">
        <textarea
          value={message}
          rows={3}
          aria-label={ACCESS_PAGE.message}
          data-control="dialog.requestAccess.message"
          onChange={(event) => setMessage(event.target.value)}
        />
      </DialogField>
      {anonymous ? (
        <DialogField label={ACCESS_PAGE.email} doc="Where the owner's answer reaches you">
          <input
            type="email"
            value={email}
            aria-label={ACCESS_PAGE.email}
            data-control="dialog.requestAccess.email"
            autoComplete="email"
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
          />
        </DialogField>
      ) : null}
      <p className="ts-dialog-error-row" role="alert" data-control="dialog.requestAccess.error">
        {error ?? ''}
      </p>
    </Dialog>
  );
}
