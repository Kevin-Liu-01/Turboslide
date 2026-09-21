import { Dialog } from '../Dialog';
import { DIALOGS } from '../menus/strings';

/**
 * Delete forever (gslides-parity SPEC 6.4, 12 "Dialogs"; docs/PRODUCT.md 3.3): the chrome's one
 * Dialog with the 18 px title "Delete <title> forever?" and the lead "This cannot be undone.",
 * one sentence naming what goes, Cancel and the solid Delete forever, which takes the focus on
 * open so Enter deletes and Esc keeps (docs/FOCUS.md rank 29). Presentational: the trash page runs
 * `deck.remove` in `onConfirm` for one deck or for every deck in the trash (`count`); the editor
 * never reaches it. Exported for /decks/trash.
 */
export type DeleteForeverDialogProps = {
  /** the presentation's title; with `count` the number of presentations the confirm covers */
  title: string;
  count?: number;
  /** the slide count of the one presentation, for the sentence */
  slides?: number;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
};

/** The title of the confirm (3.3): one presentation by name, or the count. */
export function deleteForeverTitle(title: string, count?: number): string {
  if (count !== undefined && count !== 1)
    return `Delete ${count} presentation${count === 1 ? '' : 's'} forever?`;
  return `Delete ${title} forever?`;
}

/** The lead under the title, the same for one or many (3.3). */
export const DELETE_FOREVER_LEAD = 'This cannot be undone.';

/** The sentence of the body: what goes, for one presentation or for the whole trash. */
export function deleteForeverSentence(title: string, count?: number, slides?: number): string {
  if (count !== undefined && count !== 1)
    return 'Every presentation in the trash, with its slides and versions, is deleted.';
  const n = slides === undefined ? 'The slides' : `${slides} slide${slides === 1 ? '' : 's'}`;
  return `${n} and every version of ${title} are deleted.`;
}

export function DeleteForeverDialog({
  title,
  count,
  slides,
  onConfirm,
  onClose,
  busy = false,
}: DeleteForeverDialogProps) {
  return (
    <Dialog
      title={deleteForeverTitle(title, count)}
      lead={DELETE_FOREVER_LEAD}
      onClose={onClose}
      width={480}
      /* the trash page's ids since round one (`trash.confirm`, `.ok`, `.cancel`): the drivers of
         the trash rows and the fresh presentation write probe read them */
      control="trash.confirm"
      cancel
      cancelLabel={DIALOGS.deleteForever.cancel}
      actions={[
        {
          label: DIALOGS.deleteForever.ok,
          primary: true,
          disabled: busy,
          autoFocus: true,
          onClick: onConfirm,
          control: 'trash.confirm.ok',
          doc: 'Deletes the files; nothing brings them back',
        },
      ]}
    >
      <p>{deleteForeverSentence(title, count, slides)}</p>
    </Dialog>
  );
}
