import { useState } from 'react';

import { Dialog, DialogCheck, DialogField } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { DIALOGS } from '../menus/strings';
import { tipProps } from '../Tooltip';

/**
 * File > Make a copy (gslides-parity SPEC 2.1, 6.5, 12 "Dialogs"): Name prefilled "Copy of
 * <title>" and selected, Remove speaker notes, Make a copy. `selected` copies the filmstrip's
 * selection only. One `deck.copy`; the copy opens in a new tab.
 */
export function MakeCopyDialog({ selected = false }: { selected?: boolean }) {
  const shell = useEditorShell();
  const { input } = shell;
  const title = input.document.deck.title;
  const [name, setName] = useState(`Copy of ${title}`);
  const [removeNotes, setRemoveNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slideIds = selected ? [...(input.selectedSlideIds ?? [input.slideId])] : undefined;

  const run = () => {
    const trimmed = name.trim();
    if (trimmed === '' || busy) return;
    setBusy(true);
    /* the new tab opens on the click, while the gesture is live: a window opened after the
       server has answered is a popup the browser blocks (measured in headless Chromium) */
    const tab = window.open('', '_blank');
    input
      .dispatch('deck.copy', {
        id: input.deckId,
        name: trimmed,
        ...(slideIds === undefined ? {} : { slideIds }),
        ...(removeNotes ? { removeNotes: true } : {}),
        baseRevision: input.revision,
      })
      .then((result) => {
        /* deck.copy answers deckId (packages/schema actions.ts); the old id read opened nothing */
        const answer = result as { deckId?: string; id?: string };
        const id = answer.deckId ?? answer.id;
        shell.closeDialog();
        if (id !== undefined) {
          const path = `/edit/${encodeURIComponent(id)}`;
          if (tab) tab.location.href = path;
          else if (input.navigate) input.navigate(path, true);
          else window.open(path, '_blank', 'noopener');
        } else tab?.close();
        shell.say(`Copied as ${trimmed}`);
      })
      .catch((err: unknown) => {
        tab?.close();
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setBusy(false));
  };

  const nameTip = tipProps({
    name: DIALOGS.makeCopy.name,
    doc: 'The title of the copy; Enter makes it',
    key: 'Enter',
  });
  return (
    <Dialog
      title={DIALOGS.makeCopy.title}
      lead={
        selected
          ? `${slideIds?.length ?? 0} selected slide${(slideIds?.length ?? 0) === 1 ? '' : 's'}`
          : undefined
      }
      onClose={shell.closeDialog}
      control="dialog.makeCopy"
      cancel
      cancelLabel={DIALOGS.makeCopy.cancel}
      actions={[
        {
          label: DIALOGS.makeCopy.ok,
          primary: true,
          disabled: busy || name.trim() === '',
          onClick: run,
          control: 'dialog.makeCopy.ok',
          doc: 'Makes the copy and opens it in a new tab',
        },
      ]}
    >
      <DialogField label={DIALOGS.makeCopy.name}>
        <input
          type="text"
          value={name}
          autoFocus
          aria-label={DIALOGS.makeCopy.name}
          data-control="dialog.makeCopy.name"
          autoComplete="off"
          {...nameTip}
          onFocus={(event) => {
            nameTip.onFocus(event);
            event.currentTarget.select();
          }}
          onChange={(event) => setName(event.target.value)}
        />
      </DialogField>
      <DialogCheck
        label={DIALOGS.makeCopy.removeNotes}
        checked={removeNotes}
        onChange={setRemoveNotes}
        control="dialog.makeCopy.removeNotes"
        doc="The copy carries no speaker notes"
      />
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
