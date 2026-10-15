import { useEffect, useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';

import { Dialog } from './Dialog';
import { DIALOGS } from './menus/strings';

/**
 * The confirm of a destructive act (the Glyphfield port, PLAN.md wave 1 item 6, from Glyphfield's
 * `StudioConfirmDialog.tsx`): the chrome's one Dialog as an `alertdialog`, in the top layer
 * through the Layer primitive and never through `showModal()` (docs/DESIGN.md decision C2). The
 * title names the object ("Delete Q3 review forever?") and the sentence says what goes. Cancel
 * holds the focus on open, so Enter on open keeps everything; Escape, the scrim and Close cancel
 * too, and the confirming button's tooltip names no key (docs/FOCUS.md rank 29). Mount it only
 * while it asks.
 *
 * The confirming button closes the card first, gives the focus back to the control that opened
 * it, and only then runs `onConfirm`, the order `window.confirm` kept: the write a confirm starts
 * can disable that control (Share's role field, Profile's Delete account), and a focus returned
 * to a disabled control falls to the page body. Cancel returns the focus the same way at once.
 * Inside another dialog the card is rendered in that dialog's own tree, so the outer card's focus
 * trap counts the confirm's buttons as its own. Used by Delete forever, Share's Remove access and
 * Profile's Delete account.
 */
export type ConfirmDialogProps = {
  /** the question, naming the object */
  title: string;
  /** a line under the title, such as "This cannot be undone." */
  lead?: string;
  /** what the act removes, in one or two sentences */
  sentence: string;
  /** the confirming button's words, in Title Case */
  confirmLabel: string;
  /** one sentence for the confirming button's tooltip */
  confirmDoc: string;
  /** the card's data-control; its buttons are `<control>.ok` and `<control>.cancel` */
  control: string;
  onConfirm: () => void;
  /** Cancel, Escape, the scrim and Close */
  onClose: () => void;
  /** a run in progress: the confirming button is disabled */
  busy?: boolean;
  width?: number;
};

export function ConfirmDialog({
  title,
  lead,
  sentence,
  confirmLabel,
  confirmDoc,
  control,
  onConfirm,
  onClose,
  busy = false,
  width = 480,
}: ConfirmDialogProps) {
  const opener = useRef<HTMLElement | null>(null);
  /* the control that opened the card, read before the card's own mount effect moves the focus to
     Cancel: a layout effect runs before every passive effect of the same commit */
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) opener.current = active;
  }, []);

  /* Cancel holds the focus once the frame has settled: an opener that takes the focus back after
     the card mounted (a card menu closing on the trash page) left it on Close (Delete forever's
     frame wait since docs/archive/rounds/POLISH.md item 97, now for Cancel); a button of the
     actions row the person already reached keeps it */
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const card = document.querySelector(`[data-control="${control}"]`);
      const cancel = card?.querySelector<HTMLElement>(`[data-control="${control}.cancel"]`);
      const active = document.activeElement;
      const onAction =
        active instanceof HTMLElement &&
        card?.querySelector('.ts-dialog-actions')?.contains(active);
      if (cancel instanceof HTMLElement && onAction !== true) cancel.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [control]);

  /** The card leaves in this event, then the focus goes back to the opener while it can take it. */
  const close = () => {
    flushSync(onClose);
    const back = opener.current;
    if (back !== null && back.isConnected) back.focus({ preventScroll: true });
  };

  return (
    <Dialog
      role="alertdialog"
      title={title}
      {...(lead === undefined ? {} : { lead })}
      onClose={close}
      width={width}
      control={control}
      actions={[
        {
          label: DIALOGS.cancel.label,
          onClick: close,
          autoFocus: true,
          control: `${control}.cancel`,
          doc: DIALOGS.cancel.doc,
        },
        {
          label: confirmLabel,
          primary: true,
          disabled: busy,
          onClick: () => {
            close();
            onConfirm();
          },
          control: `${control}.ok`,
          doc: confirmDoc,
        },
      ]}
    >
      <p>{sentence}</p>
    </Dialog>
  );
}
