import { Dialog } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { DIALOGS, SNACKBARS } from '../menus/strings';
import { tipProps } from '../Tooltip';

/**
 * Share (gslides-parity SPEC 6.6, 12 "Dialogs"): "Share <title>", a Links section with three
 * rows and a Copy link each (View link, Present link, Edit link with "Anyone with this link can
 * edit"), the two honest sentences, Done. No people field, no roles, no General access (there are
 * no accounts).
 */
export function shareLinks(
  origin: string,
  deckId: string,
): ReadonlyArray<{ id: string; label: string; url: string; note?: string }> {
  const id = encodeURIComponent(deckId);
  return [
    {
      id: 'view',
      label: DIALOGS.share.viewLink,
      url: `${origin}/deck/${id}`,
      note: 'Read only, opens on slide 1',
    },
    { id: 'present', label: DIALOGS.share.presentLink, url: `${origin}/deck/${id}?present=1` },
    {
      id: 'edit',
      label: DIALOGS.share.editLink,
      url: `${origin}/edit/${id}`,
      note: DIALOGS.share.anyoneCanEdit,
    },
  ];
}

export function ShareDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const origin = input.origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  const links = shareLinks(origin, input.deckId);
  const title = input.document.deck.title;

  const copy = (url: string) => {
    navigator.clipboard
      .writeText(url)
      .then(() => shell.say(SNACKBARS.linkCopied))
      .catch(() => shell.say(url));
  };

  return (
    <Dialog
      title={DIALOGS.share.title(title)}
      onClose={shell.closeDialog}
      width={520}
      control="dialog.share"
      actions={[
        {
          label: DIALOGS.share.done,
          primary: true,
          onClick: shell.closeDialog,
          control: 'dialog.share.done',
          doc: 'Closes the dialog',
        },
      ]}
    >
      <section aria-labelledby="ts-share-links">
        <h3 id="ts-share-links" className="ts-dialog-field-label">
          Links
        </h3>
        <ul className="ts-dialog-list">
          {links.map((link) => (
            <li key={link.id} className="ts-dialog-row" data-control={`dialog.share.${link.id}`}>
              <span className="ts-dialog-row-title">
                <b>{link.label}</b>
                {link.note !== undefined ? (
                  <span className="ts-dialog-hint"> · {link.note}</span>
                ) : null}
              </span>
              <button
                type="button"
                className="pt-ib is-text"
                data-control={`dialog.share.${link.id}.copy`}
                onClick={() => copy(link.url)}
                {...tipProps({ name: DIALOGS.share.copyLink, doc: link.url })}
              >
                <span className="pt-lb">{DIALOGS.share.copyLink}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <p>{DIALOGS.share.noAccounts}.</p>
      <p>{DIALOGS.share.stripped}.</p>
    </Dialog>
  );
}
