import { useState } from 'react';

import { Dialog } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';

import './text-tools-dialogs.css';

/**
 * File > Version history > Delete this and older versions, Delete history (gslides-parity SPEC-5
 * 7.7, 0.42; SPEC-3 0.45): a confirm naming the count, then one `version.delete` call. Named
 * versions before the point are kept unless the whole history goes; hosted, the handler asks for
 * a sign in within 5 minutes or the agent bearer and answers the sentence otherwise, which the
 * dialog shows as is. The dialog takes the record the row was opened on (`upTo`) or `all`.
 */
export const DELETE_VERSIONS_STRINGS = {
  older: 'Delete this and older versions',
  history: 'Delete history',
  confirmOlder: (count: number, named: number) =>
    `${count} version${count === 1 ? '' : 's'} will be deleted${named > 0 ? `; ${named} named version${named === 1 ? '' : 's'} stay` : ''}. Named versions and the current state are kept.`,
  confirmHistory: (count: number) =>
    `Every version will be deleted (${count} record${count === 1 ? '' : 's'}), the named ones included. The presentation itself stays as it is.`,
  delete: 'Delete',
  deleted: (count: number) => `${count} version${count === 1 ? '' : 's'} deleted`,
} as const;

export type DeleteVersionsProps = {
  /** the record the row was opened on; absent for Delete history */
  upTo?: number;
};

export function DeleteVersionsDialog({ upTo }: DeleteVersionsProps) {
  const shell = useEditorShell();
  const { input } = shell;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const versions = input.versions ?? [];
  const all = upTo === undefined;
  const affected = all
    ? versions
    : versions.filter((version) => version.n <= upTo && version.note === '');
  const named = all
    ? 0
    : versions.filter((version) => version.n <= upTo && version.note !== '').length;

  const run = () => {
    setBusy(true);
    setError(null);
    input
      .dispatch('version.delete', all ? { all: true, confirm: true } : { upTo, confirm: true })
      .then((answer) => {
        const deleted = (answer as { deleted?: number }).deleted ?? 0;
        shell.say(DELETE_VERSIONS_STRINGS.deleted(deleted));
        shell.closeDialog();
      })
      .catch((err: unknown) => {
        setBusy(false);
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  return (
    <Dialog
      title={all ? DELETE_VERSIONS_STRINGS.history : DELETE_VERSIONS_STRINGS.older}
      onClose={shell.closeDialog}
      cancel
      width={420}
      control="dialog.deleteVersions"
      actions={[
        {
          label: DELETE_VERSIONS_STRINGS.delete,
          primary: true,
          disabled: busy || affected.length === 0,
          onClick: run,
          control: 'dialog.deleteVersions.delete',
          doc: all
            ? 'Removes every version record'
            : 'Removes this version and the older unnamed ones',
        },
      ]}
    >
      <p className="ts-tt-label" data-control="dialog.deleteVersions.count">
        {all
          ? DELETE_VERSIONS_STRINGS.confirmHistory(affected.length)
          : DELETE_VERSIONS_STRINGS.confirmOlder(affected.length, named)}
      </p>
      {error !== null ? (
        <p className="ts-tt-error" role="alert" data-control="dialog.deleteVersions.error">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
