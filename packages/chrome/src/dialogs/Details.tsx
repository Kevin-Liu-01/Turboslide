import { slideOrder } from '@turboslide/schema/deck';

import { Dialog } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { DIALOGS } from '../menus/strings';
import { formatWhen } from '../VersionsPanel';

/**
 * File > Details (gslides-parity SPEC 2.1, 12 "Dialogs"): title, slides, sections, created, last
 * edit. The revision number shows here and nowhere else in the default view (SPEC 2.1).
 */
export function DetailsDialog() {
  const shell = useEditorShell();
  const { deck } = shell.input.document;
  const skipped = Object.values(shell.input.document.slides).filter(
    (slide) => slide.skip === true,
  ).length;
  const rows: ReadonlyArray<{ key: string; value: string; control: string }> = [
    { key: DIALOGS.details.name, value: deck.title, control: 'title' },
    {
      key: DIALOGS.details.slides,
      value:
        skipped > 0
          ? `${slideOrder(deck).length} (${skipped} skipped)`
          : String(slideOrder(deck).length),
      control: 'slides',
    },
    { key: DIALOGS.details.sections, value: String(deck.sections.length), control: 'sections' },
    { key: DIALOGS.details.created, value: formatWhen(deck.createdAt), control: 'created' },
    {
      key: DIALOGS.details.lastEdit,
      value: `${formatWhen(deck.updatedAt)} (change ${deck.revision})`,
      control: 'lastEdit',
    },
  ];
  return (
    <Dialog
      title={DIALOGS.details.title}
      onClose={shell.closeDialog}
      width={420}
      control="dialog.details"
      actions={[
        {
          label: 'Done',
          primary: true,
          onClick: shell.closeDialog,
          control: 'dialog.details.done',
          doc: 'Closes the dialog',
        },
      ]}
    >
      <dl className="ts-dialog-facts">
        {rows.map((row) => (
          <div key={row.key} style={{ display: 'contents' }}>
            <dt>{row.key}</dt>
            <dd data-control={`dialog.details.${row.control}`}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
