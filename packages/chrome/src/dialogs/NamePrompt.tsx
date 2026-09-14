import { useState } from 'react';

import { Dialog } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { ACCOUNT } from '../menus/strings';
import { tipProps } from '../Tooltip';

import './accounts.css';

/**
 * The display name prompt (gslides-parity SPEC-3 0.18, 7.2; research 11 8 P6): a 360 by 168
 * box, "How should others see you?", one field prefilled with the label, Continue and a Sign in
 * link. It fires on the first edit, comment or lease from a principal without a chosen name,
 * never on open; the route says when. Declining keeps the label. The server's refusal sentences
 * (reserved, already in use, the shape rule) show in a reserved error row so the box never moves.
 * Nothing else is asked, ever, of a person who edits by link.
 *
 * The box floats at the bottom right with no scrim and takes no focus (Dialog `modal={false}`):
 * it opens after a typing burst, and a modal card there took the caret and blocked the menu bar
 * for the person typing (VERIFICATION-3 finding 8; the round two suites met it as a 30 s timeout
 * on every menu click). Recorded as a deviation from 7.2's "over the scrim" in build-3/integrator.md.
 * Opened on purpose from the own chip's Change name row it is the shell's dialog (`modal`): the
 * scrim, the focus trap and Esc, as SPEC-3 15 asks of a dialog a person opened (finding 36).
 */
export function NamePromptDialog({ modal = false }: { modal?: boolean } = {}) {
  const shell = useEditorShell();
  const account = shell.input.account;
  const prefilled =
    account?.namePrompt?.prefilled ?? account?.principal.name ?? account?.principal.label ?? '';
  const [name, setName] = useState(prefilled);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    account?.onNamePrompt?.(false);
    shell.closeDialog();
  };

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed === '' || busy) return;
    if (account?.setName === undefined) {
      close();
      return;
    }
    setBusy(true);
    account
      .setName(trimmed)
      .then(() => close())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  const tip = tipProps({
    name: ACCOUNT.namePrompt.name,
    doc: 'Up to 40 letters or digits; Enter keeps it',
    key: 'Enter',
  });

  return (
    <Dialog
      title={ACCOUNT.namePrompt.title}
      onClose={close}
      width={360}
      control="dialog.namePrompt"
      className="ts-name-prompt"
      modal={modal}
      actions={[
        {
          label: ACCOUNT.namePrompt.continue,
          primary: true,
          disabled: busy || name.trim() === '',
          onClick: submit,
          control: 'dialog.namePrompt.continue',
          doc: 'Keeps this name on your edits and comments in this presentation',
        },
      ]}
    >
      <div className="ts-name-prompt-row">
        <input
          type="text"
          className="ts-name-prompt-field"
          value={name}
          maxLength={80}
          aria-label={ACCOUNT.namePrompt.name}
          data-control="dialog.namePrompt.name"
          autoComplete="nickname"
          spellCheck={false}
          {...tip}
          onFocus={(event) => {
            tip.onFocus(event);
            event.currentTarget.select();
          }}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
        {account?.signInAvailable === true ? (
          <button
            type="button"
            className="ts-name-prompt-signin"
            data-control="dialog.namePrompt.signIn"
            onClick={() => {
              account.onNamePrompt?.(false);
              shell.openDialog('signIn');
            }}
            {...tipProps({
              name: ACCOUNT.namePrompt.signIn,
              doc: 'Keep your name across browsers',
            })}
          >
            {ACCOUNT.namePrompt.signIn}
          </button>
        ) : null}
      </div>
      <p className="ts-dialog-error-row" role="alert" data-control="dialog.namePrompt.error">
        {error ?? ''}
      </p>
    </Dialog>
  );
}
