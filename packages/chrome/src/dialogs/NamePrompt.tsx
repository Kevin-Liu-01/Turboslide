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
export type NamePromptDialogProps = {
  modal?: boolean;
  /**
   * The words of the prompt when another surface opens it: the first Share on a browser with no
   * name asks "Your name, shown to collaborators" (docs/archive/rounds/PRODUCT.md section 2 rank 4), and hands
   * the result to `onDone` instead of closing the shell's dialog, since the Share dialog stands
   * behind it.
   */
  title?: string;
  onDone?: (named: boolean) => void;
};

/** The title of the prompt the first Share raises (rank 4). */
export const SHARE_NAME_PROMPT_TITLE = 'Your name, shown to collaborators';

/**
 * The prompt's state and writes, shared by the dialog and the title row's plate: the field opens
 * empty unless the person chose a name (docs/archive/rounds/POLISH.md 2.6 item 63; audit-chrome item 10 read
 * "studio", the write path's default author, filled in and selected on a fresh browser): a
 * prefilled value the route hands over, else the principal's chosen name, never the generated
 * label or the default author, with "Your name" as the placeholder. `close(named)` tells the
 * route the prompt is done and hands `onDone` the outcome, else closes the shell's dialog.
 */
function useNamePrompt(onDone: ((named: boolean) => void) | undefined) {
  const shell = useEditorShell();
  const account = shell.input.account;
  const prefilled = account?.namePrompt?.prefilled ?? account?.principal.name ?? '';
  const [name, setName] = useState(prefilled);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = (named = false) => {
    account?.onNamePrompt?.(false);
    if (onDone !== undefined) onDone(named);
    else shell.closeDialog();
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
      .then(() => close(true))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  const tip = tipProps({
    name: ACCOUNT.namePrompt.name,
    doc: 'Up to 40 letters or digits; Enter keeps it',
    key: 'Enter',
  });

  return { shell, account, name, setName, error, setError, busy, close, submit, tip };
}

/**
 * The prompt as a plate in the title row (docs/archive/rounds/POLISH.md 2.8 item 103; the row
 * `share.name-prompt.never-mid-drag`): what the route opens on the first write, or at the join,
 * when nobody asked for it. It sits in the row's right cluster before the collaborators, 32 px
 * tall inside the 44 px row, so it is never over the sheet and never over the toolbar: the
 * floating card at the bottom right it replaces stood over the stage while the seller worked
 * (the polish round's collaboration audit, item 6). It takes no focus of its own: a person typing
 * keeps the caret, and a click in the field brings the caret here. Enter keeps the name, the
 * cross keeps the generated label. The field's placeholder is "Your name" (docs/archive/rounds/POLISH.md 2.6
 * item 63; the row `share.name-prompt.empty-field`) and the question is the group's label, so
 * the plate stays about 340 px wide and the deck's name beside it keeps its room at 1440 (a label
 * before the field cut the title to one letter in the fix round 3's first read; the question as
 * the placeholder read against item 63 at the ship step's third attempt). The controls carry the
 * dialog's ids, so a driver reads one prompt whichever surface it has (`dialog.namePrompt`,
 * `.name`, `.continue`, `.close`, `.error`).
 */
export function NamePromptPlate() {
  const { shell, account, name, setName, error, setError, busy, close, submit, tip } =
    useNamePrompt(undefined);
  return (
    <form
      className="ts-title-name-plate"
      data-control="dialog.namePrompt"
      role="group"
      aria-label={ACCOUNT.namePrompt.title}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <input
        type="text"
        className="ts-title-name-plate-field"
        value={name}
        maxLength={80}
        placeholder="Your name"
        aria-label={ACCOUNT.namePrompt.name}
        aria-invalid={error !== null ? true : undefined}
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
      <button
        type="submit"
        className="pt-ib is-solid ts-title-name-plate-continue"
        data-control="dialog.namePrompt.continue"
        disabled={busy || name.trim() === ''}
        {...tipProps({
          name: ACCOUNT.namePrompt.continue,
          doc: 'Keeps this name on your edits and comments in this presentation',
          key: 'Enter',
        })}
      >
        <span className="pt-lb">{ACCOUNT.namePrompt.continue}</span>
      </button>
      {account?.signInAvailable === true ? (
        <button
          type="button"
          className="ts-name-prompt-signin"
          data-control="dialog.namePrompt.signIn"
          onClick={() => {
            account.onNamePrompt?.(false);
            shell.openDialog('signIn');
          }}
          {...tipProps({ name: ACCOUNT.namePrompt.signIn, doc: 'Keep your name across browsers' })}
        >
          {ACCOUNT.namePrompt.signIn}
        </button>
      ) : null}
      <button
        type="button"
        className="pt-ib is-quiet ts-title-name-plate-close"
        data-control="dialog.namePrompt.close"
        aria-label="Not now"
        onClick={() => close(false)}
        {...tipProps({ name: 'Not now', doc: 'Keeps the generated label for now', key: 'Esc' })}
      >
        <span aria-hidden="true">×</span>
      </button>
      <span
        className="ts-title-name-plate-error"
        role="alert"
        data-control="dialog.namePrompt.error"
      >
        {error ?? ''}
      </span>
    </form>
  );
}

export function NamePromptDialog({ modal = false, title, onDone }: NamePromptDialogProps = {}) {
  const { shell, account, name, setName, error, setError, busy, close, submit, tip } =
    useNamePrompt(onDone);

  return (
    <Dialog
      title={title ?? ACCOUNT.namePrompt.title}
      onClose={() => close(false)}
      width={360}
      control="dialog.namePrompt"
      className="ts-name-prompt"
      modal={modal}
      actions={[
        ...(onDone === undefined
          ? []
          : [
              {
                label: 'Skip',
                onClick: () => close(false),
                control: 'dialog.namePrompt.skip',
                doc: 'Keeps the generated label for now',
              },
            ]),
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
          placeholder="Your name"
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
