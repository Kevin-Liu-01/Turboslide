import { useState } from 'react';

import { Dialog, DialogCheck, DialogRadio } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import type { NotificationLevel } from '../editor-shell';
import { INBOX } from '../menus/strings';

/**
 * Notification settings (gslides-parity SPEC-3 5.5; Google's per file dialog under Tools):
 * "All comments", "Comments for you", "None" as three radios, adopted verbatim; the email switch
 * for a signed in grant holder; the owner's switch letting commenters read the Activity panel.
 * One `notification.settings` write on Save through the route's handler.
 */
export function NotificationSettingsDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const inbox = input.inbox;
  const owner = input.role === 'owner' || input.access?.via === 'owner';
  const signedIn = input.account?.signedIn === true;
  const [level, setLevel] = useState<NotificationLevel>(inbox?.level ?? 'forYou');
  const [email, setEmail] = useState(inbox?.email ?? false);
  const [commenters, setCommenters] = useState(inbox?.activityForCommenters ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = () => {
    if (busy) return;
    setBusy(true);
    const settings = {
      level,
      ...(signedIn ? { email } : {}),
      ...(owner ? { activityForCommenters: commenters } : {}),
    };
    const write = inbox?.onSettings
      ? inbox.onSettings(settings)
      : input.dispatch('notification.settings', settings);
    write
      .then(() => shell.closeDialog())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      title={INBOX.settings}
      onClose={shell.closeDialog}
      width={400}
      control="dialog.notificationSettings"
      cancel
      actions={[
        {
          label: 'Save',
          primary: true,
          disabled: busy,
          onClick: save,
          control: 'dialog.notificationSettings.save',
          doc: 'Keeps the level for this presentation',
        },
      ]}
    >
      <p className="ts-dialog-field-label">Comments</p>
      <DialogRadio<NotificationLevel>
        name="Comments"
        value={level}
        onChange={setLevel}
        control="dialog.notificationSettings.level"
        options={[
          { value: 'all', label: INBOX.levels.all, doc: 'Every comment on this presentation' },
          {
            value: 'forYou',
            label: INBOX.levels.forYou,
            doc: 'Mentions of you and threads you are in',
          },
          { value: 'none', label: INBOX.levels.none, doc: 'Nothing reaches your notifications' },
        ]}
      />
      {signedIn ? (
        <DialogCheck
          label={INBOX.emailToo}
          checked={email}
          onChange={setEmail}
          control="dialog.notificationSettings.email"
          doc="A digest every 15 minutes at most, to the address you signed in with"
        />
      ) : null}
      {owner ? (
        <DialogCheck
          label={INBOX.activityForCommenters}
          checked={commenters}
          onChange={setCommenters}
          control="dialog.notificationSettings.activityForCommenters"
          doc="Commenters may open Tools > Activity dashboard"
        />
      ) : null}
      <p
        className="ts-dialog-error-row"
        role="alert"
        data-control="dialog.notificationSettings.error"
      >
        {error ?? ''}
      </p>
    </Dialog>
  );
}
