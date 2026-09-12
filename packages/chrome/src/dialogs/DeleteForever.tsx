import { Dialog } from '../Dialog';
import { DIALOGS } from '../menus/strings';

/**
 * Delete forever (gslides-parity SPEC 6.4, 12 "Dialogs"): "Delete <title> forever? This cannot
 * be undone", Delete forever, Cancel. Presentational: the trash page (B5) runs `deck.remove` in
 * `onConfirm`; the editor never reaches it. Exported for /decks/trash.
 */
export type DeleteForeverDialogProps = {
  title: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
};

export function DeleteForeverDialog({
  title,
  onConfirm,
  onClose,
  busy = false,
}: DeleteForeverDialogProps) {
  return (
    <Dialog
      title={DIALOGS.deleteForever.title(title)}
      onClose={onClose}
      width={440}
      control="dialog.deleteForever"
      cancel
      cancelLabel={DIALOGS.deleteForever.cancel}
      actions={[
        {
          label: DIALOGS.deleteForever.ok,
          primary: true,
          disabled: busy,
          onClick: onConfirm,
          control: 'dialog.deleteForever.ok',
          doc: 'Removes the presentation and its files',
        },
      ]}
    >
      <p>The presentation, its slides and its pictures are removed from this Turboslide.</p>
    </Dialog>
  );
}
