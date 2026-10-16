import type { DialogId } from './editor-shell';

/**
 * An editor whose presentation lives in the browser tab alone (the landing's live editor,
 * docs/SITE.md D10): what it answers in place of a feature that needs the server. A module of its
 * own, so the viewer shell reads the snackbar rule without the editor's input module.
 */
export type EditorTabOnly = {
  sentence: string;
  /** the dialogs that need the server */
  dialogs: readonly DialogId[];
  /** the snackbar's button with the sentence */
  action: { label: string; run: () => void };
};

/**
 * The snackbar's words and button for a message: a message that carries the tab's sentence,
 * whichever path said it ("The picture could not be uploaded: <sentence>"), shows the sentence with
 * the tab's button; every other message is shown as it was said.
 */
export function tabSnack(
  tab: EditorTabOnly | undefined,
  text: string,
  action?: { label: string; run: () => void },
): { text: string; action?: { label: string; run: () => void } } {
  if (tab !== undefined && action === undefined && text.includes(tab.sentence))
    return { text: tab.sentence, action: tab.action };
  return action === undefined ? { text } : { text, action };
}
