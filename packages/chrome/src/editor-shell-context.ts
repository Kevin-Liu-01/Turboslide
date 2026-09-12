import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

import type { LayoutId } from '@turboslide/schema/layouts';

import type { DialogId, EditorShellInput, PanelId, ShellSettings } from './editor-shell';
import type { MenuContext, MenuId, MenuItem, MenuSetting, Platform } from './menus/model';
import type { TailControl } from './menus/toolbar-tails';
import type { SnackbarAction } from './Snackbar';

/**
 * What EditorShell publishes to the rows it composes (TitleRow, MenuBar, ToolbarHead, ToolbarTail,
 * BottomBar) and to the panels and dialogs: the route's input, the evaluated menu context, the
 * per browser settings, the open panel and dialog, and the one `runItem` every surface goes
 * through to run a menu item's effect. Read it with `useEditorShell()`; throws outside the shell.
 */
export type LayoutGridPurpose = 'new' | 'apply';

export type LayoutGridRequest = {
  purpose: LayoutGridPurpose;
  anchor: HTMLElement;
  /** where focus returns when the grid closes */
  returnFocusTo?: HTMLElement | null;
};

export type DialogRequest = {
  id: DialogId;
  /** the picture target of Image by URL and Pictures in this presentation */
  target?: import('./editor-shell').PictureTarget;
};

export type EditorShellState = {
  input: EditorShellInput;
  platform: Platform;
  menuContext: MenuContext;
  settings: ShellSettings;
  setSetting: (setting: MenuSetting, value: boolean | string) => void;
  /** runs a menu item's effect: action, dialog, panel, route, toggle or client handler */
  runItem: (item: MenuItem, anchor?: HTMLElement | null) => void;
  /** runs a toolbar control: its item, else its op */
  runControl: (control: TailControl, anchor: HTMLElement | null) => void;
  panel: PanelId | null;
  openPanel: (id: PanelId) => void;
  closePanel: () => void;
  /** the Show side panel chevron: reopens the last panel */
  reopenPanel: () => void;
  dialog: DialogRequest | null;
  openDialog: (request: DialogId | DialogRequest) => void;
  closeDialog: () => void;
  layoutGrid: LayoutGridRequest | null;
  openLayoutGrid: (request: LayoutGridRequest) => void;
  closeLayoutGrid: () => void;
  /** New slide with the layout, or Apply layout to the selection */
  pickLayout: (layout: LayoutId, purpose: LayoutGridPurpose) => void;
  /** the Apply layout submenu of the Slide menu and the right-click menus: the layout grid */
  renderLayoutSubmenu: (item: MenuItem) => ReactNode;
  /** the open bar menu, for the access keys (Ctrl+Option+F opens File) */
  menuOpen: MenuId | null;
  setMenuOpen: (id: MenuId | null) => void;
  compact: boolean;
  setCompact: (compact: boolean) => void;
  toolFinderOpen: boolean;
  setToolFinderOpen: (open: boolean) => void;
  /** the full palette (Tools > Advanced > Run an action…) */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  say: (text: string, action?: SnackbarAction) => void;
  /** the layout picked last for New slide (SPEC 5.3) */
  lastLayout: LayoutId | null;
  /** the id the title field carries, for File > Rename to focus */
  focusTitle: () => void;
  registerTitleField: (el: HTMLElement | null) => void;
};

export const EditorShellContext = createContext<EditorShellState | null>(null);

export function useEditorShell(): EditorShellState {
  const value = useContext(EditorShellContext);
  if (!value) throw new Error('useEditorShell must be called inside EditorShell');
  return value;
}
