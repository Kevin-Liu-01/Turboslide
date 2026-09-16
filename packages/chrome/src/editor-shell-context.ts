import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

import type { LayoutId } from '@turboslide/schema/layouts';

import type {
  CommentAnchorView,
  DialogId,
  EditorShellInput,
  PanelId,
  PictureTarget,
  ShellSettings,
  VersionDiffView,
} from './editor-shell';
import type { FormatSectionId } from './inspector/format-sections';
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
  target?: PictureTarget;
  /** the role the Request access dialog asks for (the View only button asks for editor) */
  role?: 'viewer' | 'commenter' | 'editor';
  /* round five (gslides-parity SPEC-5 7.7, 7.1): the version record Delete this and older
     versions was opened on, the Preferences tab, and the Find and replace query the tool finder hands over */
  upTo?: number;
  tab?: 'general' | 'substitutions';
  query?: string;
};

/** The comment card the overlay draws (SPEC-3 5.3): an existing thread, or a new comment at an anchor. */
export type CommentCardRequest = { threadId?: string; anchor?: CommentAnchorView };

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
  /** opens a panel; Format options opens at a section when one is named (Text fitting, Drop shadow, Alt text, Edit data) */
  openPanel: (id: PanelId, options?: { section?: FormatSectionId }) => void;
  /** the section Format options was opened at, until the panel closes */
  panelSection: FormatSectionId | null;
  closePanel: () => void;
  /** the word art bar over the canvas (Insert > Word art) */
  wordArtOpen: boolean;
  setWordArtOpen: (open: boolean) => void;
  /** the filmstrip registers its handle here (Edit > Select all and Select none with the filmstrip focused, SPEC-2 8.6) */
  registerFilmstrip: (handle: import('./Sidebar').FilmstripHandle | null) => void;
  /**
   * The guide under the pointer while its right-click menu is open (SPEC-2 4.3 `guide`): the
   * stage sets it before it opens the menu and clears it after, so Delete guide knows which guide
   * to remove.
   */
  setGuideUnderPointer: (guide: { axis: 'x' | 'y'; at: number } | null) => void;
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
  /**
   * The plate of a dynamic submenu (menus/model.ts `MenuDynamic`): the layout grid for Apply
   * layout, the hover grid for Insert > Table, the shape, preset, line end and dash grids; null
   * for a plate the shell does not draw, so the menu falls back to the row's children or runs its
   * action. `viaKeyboard` says the submenu was opened from the keyboard and the plate should take
   * focus; `onPicked` runs after a pick, so a right-click menu drawing the plate closes with it.
   */
  renderDynamicSubmenu: (
    item: MenuItem,
    options?: { viaKeyboard?: boolean; onPicked?: () => void },
  ) => ReactNode;
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
  /* round three (SPEC-3 5.3, 5.7): the comment card and Show changes the overlay draws */
  /** the open comment card: a thread's, or a new comment's anchor; null when none */
  commentCard: CommentCardRequest | null;
  openCommentCard: (request: CommentCardRequest) => void;
  closeCommentCard: () => void;
  /** `j` and `k`: the next or previous open thread in the canvas order */
  stepComment: (direction: 1 | -1) => void;
  /** the `version.diff` Show changes draws, null while off */
  diff: VersionDiffView | null;
};

export const EditorShellContext = createContext<EditorShellState | null>(null);

export function useEditorShell(): EditorShellState {
  const value = useContext(EditorShellContext);
  if (!value) throw new Error('useEditorShell must be called inside EditorShell');
  return value;
}
