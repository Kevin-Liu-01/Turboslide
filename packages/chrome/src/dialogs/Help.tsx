import { Dialog } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { DIALOGS } from '../menus/strings';
import { tipProps } from '../Tooltip';

/**
 * Help > Help (gslides-parity SPEC 2.10, 11.2): the ten tasks of the sales user as one line
 * how-tos, and a link to the documentation.
 */
export const HOW_TOS: ReadonlyArray<{ task: string; how: string }> = [
  {
    task: 'Open a presentation',
    how: 'Click its card on the home page, or press Cmd+O and pick it',
  },
  {
    task: 'Make a copy for a prospect',
    how: 'File > Make a copy > Entire presentation, type the name, press Enter',
  },
  {
    task: 'Change a name across the deck',
    how: 'Edit > Find and replace, type the old and the new name, Replace all',
  },
  {
    task: 'Swap a logo',
    how: 'Drop the file on the picture, or right-click it and choose Replace image',
  },
  {
    task: 'Add, duplicate, delete and reorder slides',
    how: 'Ctrl+M adds, Cmd+D duplicates, Delete removes, drag a card to move it',
  },
  { task: 'Hide slides that do not apply', how: 'Select the cards, right-click, Skip slide' },
  {
    task: 'Update a table or a big number',
    how: 'Click a cell and type; Tab moves to the next cell',
  },
  {
    task: 'Write a talk track',
    how: 'Click under the slide where it reads Click to add speaker notes',
  },
  {
    task: 'Present over a call',
    how: 'Slideshow arrow > Presenter view; share the slideshow window',
  },
  {
    task: 'Send a PDF or a link',
    how: 'Share > Copy link under View link, or File > Download > PDF Document',
  },
];

export function HelpDialog() {
  const shell = useEditorShell();
  return (
    <Dialog
      title={DIALOGS.help.title}
      onClose={shell.closeDialog}
      width={560}
      control="dialog.help"
      actions={[
        {
          label: 'Done',
          primary: true,
          onClick: shell.closeDialog,
          control: 'dialog.help.done',
          doc: 'Closes the dialog',
        },
      ]}
    >
      <ol className="ts-dialog-howto">
        {HOW_TOS.map((row) => (
          <li key={row.task}>
            <b>{row.task}.</b> {row.how}.
          </li>
        ))}
      </ol>
      <p>
        <a
          href="https://github.com/Kevin-Liu-01/Turboslide/blob/main/docs/README.md"
          target="_blank"
          rel="noopener"
          data-control="dialog.help.docs"
          {...tipProps({ name: 'Documentation', doc: 'Opens the guides in a new tab' })}
        >
          Documentation
        </a>
      </p>
    </Dialog>
  );
}
