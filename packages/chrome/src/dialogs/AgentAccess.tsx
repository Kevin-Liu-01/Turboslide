import { connectCommands } from '../ConnectCard';
import { Dialog } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { DIALOGS, SNACKBARS } from '../menus/strings';
import { tipProps } from '../Tooltip';

/**
 * Extensions > Agent access (gslides-parity SPEC 2.9, 12 "Dialogs"): the MCP address, the API
 * address, the push and pull commands with this deployment's origin, a Copy button each, and the
 * sentence "A token is required and is never shown here". The Connect card of /decks lives here
 * now. The one dialog allowed the words agent and MCP (SPEC 12).
 */
export function agentAddresses(origin: string, deckId: string, tokenRequired: boolean) {
  const commands = connectCommands(origin, deckId, tokenRequired);
  return [
    {
      id: 'mcp',
      label: DIALOGS.agentAccess.mcp,
      value: `${origin}/mcp?deck=${encodeURIComponent(deckId)}`,
    },
    { id: 'api', label: DIALOGS.agentAccess.api, value: `${origin}/api/actions` },
    { id: 'push', label: DIALOGS.agentAccess.push, value: commands.push },
    { id: 'pull', label: DIALOGS.agentAccess.pull, value: commands.pull },
  ];
}

export function AgentAccessDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const origin = input.origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  const rows = agentAddresses(origin, input.deckId, input.tokenRequired ?? true);
  const copy = (value: string) => {
    navigator.clipboard
      .writeText(value)
      .then(() => shell.say(SNACKBARS.linkCopied))
      .catch(() => shell.say(value));
  };
  return (
    <Dialog
      title={DIALOGS.agentAccess.title}
      onClose={shell.closeDialog}
      width={600}
      control="dialog.agentAccess"
      actions={[
        {
          label: 'Done',
          primary: true,
          onClick: shell.closeDialog,
          control: 'dialog.agentAccess.done',
          doc: 'Closes the dialog',
        },
      ]}
    >
      <p>An assistant reads and edits this presentation through these addresses and commands.</p>
      {rows.map((row) => (
        <div key={row.id} className="ts-dialog-field">
          <span className="ts-dialog-field-label">{row.label}</span>
          <div className="ts-dialog-code">
            <code data-control={`dialog.agentAccess.${row.id}`}>{row.value}</code>
            <button
              type="button"
              className="pt-ib is-text"
              data-control={`dialog.agentAccess.${row.id}.copy`}
              onClick={() => copy(row.value)}
              {...tipProps({
                name: DIALOGS.agentAccess.copy,
                doc: `Copies the ${row.label.toLowerCase()}`,
              })}
            >
              <span className="pt-lb">{DIALOGS.agentAccess.copy}</span>
            </button>
          </div>
        </div>
      ))}
      <p>{DIALOGS.agentAccess.token}.</p>
    </Dialog>
  );
}
