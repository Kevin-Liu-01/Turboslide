import { useMemo, useState } from 'react';

import { Dialog } from './Dialog';
import { cn } from './lib/cn';
import { buildKeyTable, shortcutLabels } from './menus/keys';
import type { KeyBinding, ShortcutGroup } from './menus/keys';
import type { Platform } from './menus/model';
import { DIALOGS, stubClause } from './menus/strings';
import { tipProps } from './Tooltip';

import './ShortcutsDialog.css';

/**
 * Keyboard shortcuts (gslides-parity SPEC 2.10, 10.1, 13.10; Cmd+/): the key table of the menu
 * model under Google's group names with a search box. Every row is real text, so a screen reader
 * reads it; a Later row is greyed with its reason. Groups follow Google's shortcut page order
 * (R04 Part B): Common actions, Film strip actions, Navigation, Menus, Text, Move and arrange
 * objects, Presenting, then the groups whose rows are all Later. Built from `buildKeyTable()`,
 * so the dialog is always true for the editor. Replaces HelpCard.tsx for the editor; the view
 * route keeps the card.
 */
export type ShortcutsDialogProps = {
  platform: Platform;
  onClose: () => void;
};

/** Google's group order on the shortcuts page (R04 Part B). */
export const GROUP_ORDER: ReadonlyArray<ShortcutGroup> = [
  'Common actions',
  'Film strip actions',
  'Navigation',
  'Menus',
  'Text',
  'Move and arrange objects',
  'Presenting',
  'Comments',
  'Video player',
  'Screen reader support',
];

export type ShortcutRow = {
  id: string;
  label: string;
  keys: string[];
  later: boolean;
  reason?: string;
};

/** The rows of a group for a platform, one per binding, menu access keys included. */
export function shortcutRows(
  platform: Platform,
  table: ReadonlyArray<KeyBinding> = buildKeyTable(),
): Map<ShortcutGroup, ShortcutRow[]> {
  const out = new Map<ShortcutGroup, ShortcutRow[]>();
  const seen = new Set<string>();
  for (const binding of table) {
    const keys = shortcutLabels(binding.key, platform, 'words');
    if (keys.length === 0) continue;
    const dedupe = `${binding.group}|${binding.label}|${keys.join(',')}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const row: ShortcutRow = {
      id: binding.id,
      label: binding.label,
      keys,
      later: binding.status === 'later',
      ...(binding.reason === undefined ? {} : { reason: binding.reason }),
    };
    out.set(binding.group, [...(out.get(binding.group) ?? []), row]);
  }
  return out;
}

export function ShortcutsDialog({ platform, onClose }: ShortcutsDialogProps) {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => shortcutRows(platform), [platform]);
  const needle = query.trim().toLowerCase();
  const groups = GROUP_ORDER.map((group) => ({
    group,
    rows: (rows.get(group) ?? []).filter(
      (row) =>
        needle === '' ||
        row.label.toLowerCase().includes(needle) ||
        row.keys.join(' ').toLowerCase().includes(needle),
    ),
  })).filter((entry) => entry.rows.length > 0);
  const searchTip = tipProps({
    name: DIALOGS.keyboardShortcuts.search,
    doc: 'Type a word of the action or the key',
  });

  return (
    <Dialog
      title={DIALOGS.keyboardShortcuts.title}
      onClose={onClose}
      width={640}
      control="dialog.keyboardShortcuts"
      className="ts-shortcuts"
    >
      <label className="ts-shortcuts-search">
        <input
          type="search"
          value={query}
          placeholder={DIALOGS.keyboardShortcuts.search}
          aria-label={DIALOGS.keyboardShortcuts.search}
          data-control="dialog.keyboardShortcuts.search"
          autoComplete="off"
          spellCheck={false}
          {...searchTip}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="ts-shortcuts-list pt-scroll">
        {groups.length === 0 ? <p className="ts-dialog-empty">Nothing matches</p> : null}
        {groups.map((entry) => (
          <section
            key={entry.group}
            className="ts-shortcuts-group"
            aria-labelledby={`ts-shortcuts-${entry.group.replace(/\s+/g, '-')}`}
          >
            <h3 id={`ts-shortcuts-${entry.group.replace(/\s+/g, '-')}`}>{entry.group}</h3>
            <table>
              <tbody>
                {entry.rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(row.later && 'is-later')}
                    data-status={row.later ? 'later' : 'now'}
                    data-binding={row.id}
                  >
                    <td className="ts-shortcuts-action">
                      {row.label}
                      {row.later ? (
                        <span className="ts-shortcuts-reason">{stubClause(row.reason ?? '')}</span>
                      ) : null}
                    </td>
                    <td className="ts-shortcuts-keys">
                      {row.keys.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
