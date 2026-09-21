import { useMemo, useState } from 'react';

import { Dialog } from './Dialog';
import { cn } from './lib/cn';
import { buildKeyTable, shortcutLabels } from './menus/keys';
import type { KeyBinding, ShortcutGroup } from './menus/keys';
import { advancedToolsOn, findItem, isPresent } from './menus/model';
import type { MenuContext, Platform } from './menus/model';
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
 * route keeps the card. Since the focus round (docs/FOCUS.md 3.1) the dialog takes the menu
 * context and lists a binding only while its row is present: a parked row and a Later stub leave
 * the list with Tools > Advanced tools off and return with it on. The product round
 * (docs/PRODUCT.md section 2 rank 31; audit-seller 33): one row per action, its chords joined
 * (Redo listed once), and Common actions lead with New slide, Undo, Redo, Copy, Paste, Slideshow
 * and Search the menus, in that order. The `?` key opens the dialog as Cmd+/ does (useEditorKeys).
 */
export type ShortcutsDialogProps = {
  platform: Platform;
  /** the shell's menu context; without it every binding of the table is listed */
  context?: MenuContext;
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

/** The head of Common actions (rank 31): the seller's first seven, in order; the rest follow as listed. */
export const COMMON_ACTIONS_FIRST: ReadonlyArray<string> = [
  'slide.newSlide',
  'edit.undo',
  'edit.redo',
  'edit.copy',
  'edit.paste',
  'view.slideshow',
  'title.slideshow',
  'help.searchMenus',
];

/** Common actions with the seller's seven first; every other group keeps the table's order. */
function orderRows(group: ShortcutGroup, rows: ShortcutRow[]): ShortcutRow[] {
  if (group !== 'Common actions') return rows;
  const rank = (row: ShortcutRow): number => {
    const at = COMMON_ACTIONS_FIRST.indexOf(row.id);
    return at < 0 ? COMMON_ACTIONS_FIRST.length : at;
  };
  return [...rows].sort((a, b) => rank(a) - rank(b));
}

/**
 * The rows of a group for a platform, one per binding, menu access keys included. With a menu
 * context a binding whose menu row exists and is not present (parked or Later with the switch
 * off, docs/FOCUS.md 3.1) is skipped; a binding with no menu row (the filmstrip and canvas keys)
 * is always listed.
 */
export function shortcutRows(
  platform: Platform,
  table: ReadonlyArray<KeyBinding> = buildKeyTable(),
  context?: MenuContext,
): Map<ShortcutGroup, ShortcutRow[]> {
  const out = new Map<ShortcutGroup, ShortcutRow[]>();
  /* one row per action and group (rank 31): a second binding of the same id joins the row's keys,
     so Redo reads once with both its chords */
  const byId = new Map<string, ShortcutRow>();
  for (const binding of table) {
    if (context !== undefined) {
      const item = findItem(binding.id);
      if (item !== undefined && !isPresent(item, context)) continue;
      /* a Later binding with no menu row (the presenter's audience tools) hides with the stubs */
      if (item === undefined && binding.status === 'later' && !advancedToolsOn(context)) continue;
    }
    const keys = shortcutLabels(binding.key, platform, 'words');
    if (keys.length === 0) continue;
    const rowKey = `${binding.group}|${binding.id}`;
    /* a toolbar control that mirrors a menu row (the toolbar's Redo with Cmd+Y beside Edit >
       Redo) joins the row by its label in the group, so Redo reads once with both chords */
    const labelKey = `${binding.group}|${binding.label}`;
    const existing = byId.get(rowKey) ?? byId.get(labelKey);
    if (existing !== undefined) {
      for (const key of keys) if (!existing.keys.includes(key)) existing.keys.push(key);
      /* the row keeps the id the seller's order names (New slide is Slide > New slide, not the
         Insert row or the toolbar button that share its chord) */
      if (COMMON_ACTIONS_FIRST.includes(binding.id) && !COMMON_ACTIONS_FIRST.includes(existing.id))
        existing.id = binding.id;
      byId.set(rowKey, existing);
      continue;
    }
    const row: ShortcutRow = {
      id: binding.id,
      label: binding.label,
      keys: [...keys],
      later: binding.status === 'later',
      ...(binding.reason === undefined ? {} : { reason: binding.reason }),
    };
    byId.set(rowKey, row);
    byId.set(labelKey, row);
    out.set(binding.group, [...(out.get(binding.group) ?? []), row]);
  }
  for (const [group, rows] of out) out.set(group, orderRows(group, rows));
  return out;
}

export function ShortcutsDialog({ platform, context, onClose }: ShortcutsDialogProps) {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => shortcutRows(platform, undefined, context), [platform, context]);
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
