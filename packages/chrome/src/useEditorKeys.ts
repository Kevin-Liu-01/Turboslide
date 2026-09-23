import { useRef } from 'react';

import { RETIRED_KEYS, RETIRED_KEYS_STORAGE, retiredKeySentence } from './editor-shell';
import type { MenuItem, Platform } from './menus/model';
import { findItem, isEnabled, isPresent, MENUS } from './menus/model';
import type { MenuContext, MenuId } from './menus/model';
import { bindingsFor, buildKeyTable, isBareKey, chordsOf } from './menus/keys';
import type { KeyBinding } from './menus/keys';
import { useMountEffect } from './lib/useMountEffect';

/**
 * The editor's one document keydown owner (gslides-parity SPEC 0.28, 10.1, 10.2, 13.5): Google's
 * chords from the menu model's key table and nothing else. No bare letter is bound; the first
 * press of a retired letter (S, D, E, P, F, G, B, J, K, L, H, R, ?, [) with nothing focused shows
 * the snackbar once per browser naming the menu item that replaces it. The view route keeps
 * useShellKeys and its reading keys; this hook runs only under the editor shell.
 *
 * Scope: a chord fires from anywhere except inside a text field of the chrome (an input, a
 * textarea, a dialog's field), where the browser's own editing keys keep their meaning; inside
 * the canvas's editable run (the InlineText, B4) only the `editor` scoped chords with a modifier
 * fire (Bold, Find and replace, Save); the run's own keys (Enter, Esc, Tab, the arrows) are the
 * editor's. A binding whose menu item's predicate says no does nothing. Esc walks the ladder of
 * SPEC 10.2: a menu or a dialog closes itself; then the shell leaves compact mode, closes the
 * panel, or leaves present mode.
 */
export type EditorKeyHandlers = {
  /** runs a menu item's effect */
  runItem: (item: MenuItem) => void;
  /** a binding with no menu item: `key.find`, `key.findAgain`, `key.save`, the filmstrip and canvas keys */
  runBinding: (binding: KeyBinding, event: KeyboardEvent) => boolean;
  /** opens a bar menu (the access keys) */
  openMenu: (id: MenuId) => void;
  /** the Esc ladder below a menu or a dialog: returns true when something closed */
  escape: () => boolean;
  /** the snackbar */
  say: (text: string) => void;
  /** true while a menu, a dialog, the finder or the palette is open: their own keys apply */
  overlayOpen: () => boolean;
};

export type EditorKeyState = {
  platform: Platform;
  menuContext: MenuContext;
  enabled: boolean;
};

/** The input types that take text; a checkbox, a radio, a range or a colour has no editing keys of its own. */
const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'time',
  'week',
]);

/**
 * A chrome field keeps the browser's own editing keys, so the chords return early inside one. A
 * control that takes no text (the Tabular figures checkbox of Format options, a radio, a range)
 * is not a field: Cmd+Z from it reaches `edit.undo` through the key table, Google's behaviour
 * from the sidebar (the features round's fix round, VERIFICATION.md pass 1 F7; build/b1.md R6).
 * A `<select>` stays a field because its arrow keys are its own.
 */
function isChromeField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(target.type);
  if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  if (target.isContentEditable && target.closest('.ts-sheet, .ts-stage') === null) return true;
  return false;
}

/** The editable run on the canvas (the InlineText), where only modifier chords of the editor scope fire. */
function isCanvasText(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.isContentEditable &&
    target.closest('.ts-sheet, .ts-stage') !== null
  );
}

/** Storage helpers that tolerate a private window. */
function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(RETIRED_KEYS_STORAGE);
    return new Set(raw === null ? [] : (JSON.parse(raw) as string[]));
  } catch {
    return new Set();
  }
}

function storeSeen(seen: Set<string>): void {
  try {
    localStorage.setItem(RETIRED_KEYS_STORAGE, JSON.stringify([...seen]));
  } catch {
    // private mode: the sentence shows once per session instead
  }
}

/**
 * The clipboard chords ride the browser's copy, cut and paste events (B4, docs/gslides-parity/
 * build/b4.md decision 9): the stage and the filmstrip answer those events, so the key owner
 * neither runs the Edit menu's rows for them nor prevents their default, whether the item is
 * enabled or not (measured: preventDefault here stopped the copy event, and a disabled Paste with
 * an empty in-page clipboard would have stopped a paste from another tab). The menu rows keep
 * their client handlers for the mouse.
 */
const CLIPBOARD_CHORDS: ReadonlySet<string> = new Set([
  'edit.cut',
  'edit.copy',
  'edit.paste',
  'edit.pasteWithoutFormatting',
]);

/** The items whose chords the canvas run owns while the caret is in it (SPEC 2.2, 10.2). */
const RUN_OWNED: ReadonlySet<string> = new Set([
  'edit.delete',
  'edit.selectAll',
  'edit.undo',
  'edit.redo',
  'format.text.bold',
  'insert.link',
]);

/**
 * The caret keys: inside the canvas run they move the caret with every modifier (Cmd Up and Down
 * to the text's start and end on a Mac, Shift to extend, Option by word) and never run a chord
 * (Move slide up, Bring forward, the filmstrip's Home and End) (build-4/hotfix-4.md, key
 * ownership). The stage's own key table yields the same way (viewer keys.ts editorKeyAction).
 */
export const CARET_KEYS: ReadonlySet<string> = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/** True when a key pressed inside the canvas run is the caret's, whatever the modifiers. */
export function isCaretKeyInCanvasText(event: Pick<KeyboardEvent, 'key' | 'target'>): boolean {
  return CARET_KEYS.has(event.key) && isCanvasText(event.target);
}

/** Cmd+] or Cmd+[ on a Mac, Ctrl+] or Ctrl+[ elsewhere, with no other modifier (SPEC-2 0.55). */
export function isIndentChord(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
  platform: Platform,
): boolean {
  if (event.key !== ']' && event.key !== '[') return false;
  if (event.altKey || event.shiftKey) return false;
  return platform === 'mac' ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

/** The menu a `menu.<id>` binding opens. */
function menuIdOf(binding: KeyBinding): MenuId | null {
  if (!binding.id.startsWith('menu.')) return null;
  const id = binding.id.slice('menu.'.length);
  return MENUS.some((menu) => menu.id === id) ? (id as MenuId) : null;
}

export function useEditorKeys(state: EditorKeyState, handlers: EditorKeyHandlers): void {
  const stateRef = useRef(state);
  stateRef.current = state;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useMountEffect(() => {
    const table = buildKeyTable();
    const seen = loadSeen();

    const onKeyDown = (event: KeyboardEvent) => {
      const s = stateRef.current;
      const h = handlersRef.current;
      if (!s.enabled || event.isComposing || event.defaultPrevented) return;
      const inField = isChromeField(event.target);
      const inCanvasText = isCanvasText(event.target);
      const modifier = event.metaKey || event.ctrlKey || event.altKey;

      /* the caret keys inside the canvas run are the caret's with every modifier: Cmd Up would
         otherwise run Move slide up or Bring forward and the caret would not move */
      if (isCaretKeyInCanvasText(event)) return;

      /* Esc: menus and dialogs close themselves; the shell's ladder runs when nothing of theirs is open */
      if (event.key === 'Escape') {
        if (h.overlayOpen() || inField || inCanvasText) return;
        /* a modal dialog takes the key alone (its document listener closes it, Dialog.tsx); the
           shell's ladder would otherwise close an open panel with it, where Google closes the
           dialog and leaves the panel (b1 R30) */
        if (document.querySelector('.ts-dialog-scrim') !== null) return;
        if (h.escape()) event.preventDefault();
        return;
      }

      /* Cmd+] and Cmd+[ are Chrome's Forward and Back on macOS (SPEC-2 0.55, section 9): the
         editor takes both in every focus state, before the field early return, and always
         prevents the default; the indent runs only when a list item or a text block is selected,
         and the canvas run handles its own (InlineText) */
      if (isIndentChord(event, s.platform)) {
        event.preventDefault();
        if (inCanvasText || h.overlayOpen()) return;
        const id =
          event.key === ']'
            ? 'format.alignIndent.increaseIndent'
            : 'format.alignIndent.decreaseIndent';
        const item = findItem(id);
        if (item !== undefined && isEnabled(item, s.menuContext)) h.runItem(item);
        return;
      }

      /* inside a chrome field the browser's editing keys keep their meaning; the menu access
         keys and the Find and replace chord still work */
      if (inField && !(event.altKey && event.ctrlKey) && !(event.metaKey && event.shiftKey)) return;

      /* `?` opens the Keyboard shortcuts dialog as Cmd+/ does (docs/PRODUCT.md 3.1.1;
         audit-interface 25): the snackbar that named the Help menu left */
      if (event.key === '?' && !modifier && !inField && !inCanvasText && !h.overlayOpen()) {
        const shortcuts = findItem('help.keyboardShortcuts');
        if (shortcuts !== undefined && isEnabled(shortcuts, s.menuContext)) {
          event.preventDefault();
          h.runItem(shortcuts);
          return;
        }
      }

      const matches = bindingsFor(event, s.platform, table);
      if (matches.length === 0) {
        /* a retired letter with nothing focused: the one time sentence (SPEC 0.28) */
        if (!modifier && !inField && !inCanvasText && !h.overlayOpen()) {
          const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
          if (key in RETIRED_KEYS && !seen.has(key)) {
            seen.add(key);
            storeSeen(seen);
            const sentence = retiredKeySentence(key);
            if (sentence !== null) h.say(sentence);
          }
        }
        return;
      }

      for (const binding of matches) {
        /* inside the canvas run only the modifier chords of the editor scope fire; the run owns the rest */
        if (inCanvasText) {
          const bare = chordsOf(s.platform === 'mac' ? binding.key.mac : binding.key.win).some(
            isBareKey,
          );
          if (bare || binding.scope === 'filmstrip' || binding.scope === 'canvas') continue;
        }
        if (binding.scope === 'present') continue;
        if (CLIPBOARD_CHORDS.has(binding.id)) continue;
        if (inCanvasText && RUN_OWNED.has(binding.id)) continue;
        /* a bare Delete or Backspace removes a slide only while the filmstrip has the focus
           (docs/FOCUS.md section 5 rank 4; audit-arrange row 48): with the stage, a toolbar button
           or nothing focused and no object selected the key does nothing, where it used to run
           `edit.delete` and take the current slide with no prompt; the stage removes its own
           selection before this table sees the key, and Edit > Delete from the menu is untouched */
        if (binding.id === 'edit.delete' && !modifier && s.menuContext.focus !== 'filmstrip')
          continue;
        const menuId = menuIdOf(binding);
        if (menuId !== null) {
          event.preventDefault();
          h.openMenu(menuId);
          return;
        }
        const item = findItem(binding.id);
        if (item !== undefined) {
          /* a parked row's chord matches nothing, prevents nothing and runs nothing while Tools >
             Advanced tools is off (docs/FOCUS.md 3.1; the matrix row surface.parked-shortcut-unbound) */
          if (!isPresent(item, s.menuContext)) continue;
          if (!isEnabled(item, s.menuContext)) {
            /* a disabled item swallows its chord so the browser's own meaning does not fire (Cmd+P, Cmd+O) */
            if (binding.status === 'now') event.preventDefault();
            continue;
          }
          event.preventDefault();
          h.runItem(item);
          return;
        }
        if (h.runBinding(binding, event)) {
          event.preventDefault();
          return;
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });
}
