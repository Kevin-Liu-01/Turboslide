import type { ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { LayoutId } from '@turboslide/schema/layouts';
import { layoutEntry } from '@turboslide/schema/layouts';
import { applyTheme, readTheme } from '@turboslide/viewer/theme';
import type { Theme } from '@turboslide/viewer/theme';

import { BottomBar } from './BottomBar';
import { AgentAccessDialog } from './dialogs/AgentAccess';
import { DetailsDialog } from './dialogs/Details';
import { DownloadDialog } from './dialogs/Download';
import { FindReplaceDialog } from './dialogs/FindReplace';
import { FromThisPresentationDialog } from './dialogs/FromThisPresentation';
import { HelpDialog } from './dialogs/Help';
import { ImageByUrlDialog } from './dialogs/ImageByUrl';
import { ImportSlidesDialog } from './dialogs/ImportSlides';
import { InsertIconDialog } from './dialogs/InsertIcon';
import { InsertMaterialDialog } from './dialogs/InsertMaterial';
import { InsertTableDialog } from './dialogs/InsertTable';
import { LinkDialog } from './dialogs/Link';
import { MakeCopyDialog } from './dialogs/MakeCopy';
import { NameVersionDialog } from './dialogs/NameVersion';
import { OpenDialog } from './dialogs/Open';
import { PublishDialog } from './dialogs/Publish';
import { ShareDialog } from './dialogs/Share';
import { SlideNumbersDialog } from './dialogs/SlideNumbers';
import {
  APPEARANCE_STORAGE,
  DEFAULT_SETTINGS,
  LAST_LAYOUT_STORAGE,
  SETTINGS_STORAGE,
  appearanceOf,
  buildMenuContext,
  dialogIdOf,
  factsOf,
  insertIntentOf,
  menuActionPlan,
  panelIdOfTitle,
  pictureTargetOf,
  readLastLayout,
  readStoredSettings,
  writeStoredSettings,
} from './editor-shell';
import type {
  DialogId,
  EditorShellInput,
  InsertPicker,
  PanelId,
  ShellSettings,
} from './editor-shell';
import { EditorShellContext } from './editor-shell-context';
import type { DialogRequest, EditorShellState, LayoutGridRequest } from './editor-shell-context';
import { FormatOptions } from './FormatOptions';
import { HistoryPanel } from './HistoryPanel';
import { LayoutGrid } from './LayoutGrid';
import { LintPanel } from './LintPanel';
import { MenuBar } from './MenuBar';
import { detectPlatform } from './menus/keys';
import type { KeyBinding } from './menus/keys';
import { evaluate, findItem, isEnabled, itemById } from './menus/model';
import type { MenuId, MenuItem, MenuSetting, Platform } from './menus/model';
import { PANELS, SNACKBARS } from './menus/strings';
import type { TailControl } from './menus/toolbar-tails';
import { Palette } from './Palette';
import { Panel } from './Panel';
import { PicturesPanel } from './PicturesPanel';
import { usePtShell } from './shell-context';
import type { ShellState } from './shell-context';
import { ShortcutsDialog } from './ShortcutsDialog';
import { Snackbar } from './Snackbar';
import type { SnackbarAction, SnackbarState } from './Snackbar';
import { ThemesPanel } from './ThemesPanel';
import { TitleRow } from './TitleRow';
import { ToolbarHead } from './ToolbarHead';
import { ToolbarTail } from './ToolbarTail';
import { ToolFinder } from './ToolFinder';
import { useEditorKeys } from './useEditorKeys';
import { VersionsPanel } from './VersionsPanel';
import { useMountEffect } from './lib/useMountEffect';

import './EditorShell.css';

/**
 * The editor's chrome (gslides-parity SPEC 1, 2, 3, 12, 13), composed inside ViewerShell when the
 * route passes `editor`: the title row, the menu bar, the toolbar with its contextual tail, the
 * right panel, the bottom bar, the snackbar, the dialogs, the layout grid, Search the menus, the
 * shortcuts dialog and the editor key map. The viewer shell keeps the slide state (mode, active
 * item, sidebar) and the filmstrip; this component owns everything the route does not: the per
 * browser settings, which panel and dialog are open, compact mode, the chrome appearance, and the
 * one `runItem` every menu, toolbar button, key and finder row goes through to run an effect.
 * New in Turboslide (no Prototemplate source).
 */
export type EditorShellProps = {
  input: EditorShellInput;
  /** the viewer shell's sidebar (the filmstrip) */
  sidebar: ReactNode;
  /** the stage box the viewer shell measures */
  stageRef: RefObject<HTMLDivElement | null>;
  snackbar: SnackbarState;
  /**
   * Compact mode changed (View > Full screen, Ctrl+Shift+F, Esc, the Show the menus chevron): the
   * viewer shell puts `is-compact` on the `.pt-viewer` root, which EditorShell.css hides the menu
   * bar and the toolbar under (SPEC 1.1; the root's class list belongs to ViewerShell.tsx).
   */
  onCompactChange?: (compact: boolean) => void;
  children?: ReactNode;
};

/** The dialog an Insert picker opens (SPEC 2.4). */
const PICKER_DIALOG: Readonly<Record<InsertPicker, DialogId>> = {
  table: 'insertTable',
  icon: 'insertIcon',
  material: 'insertMaterial',
};

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: the choice holds for the session only
  }
}

/** The chrome appearance the browser keeps: light, dark or match (SPEC 1.4). */
function readAppearance(): 'light' | 'dark' | 'match' {
  const saved = load(APPEARANCE_STORAGE);
  if (saved === 'light' || saved === 'dark' || saved === 'match') return saved;
  /* nothing chosen: a stored gt-theme is the reader's (or a test's) explicit choice, else match */
  const theme = load('gt-theme');
  return theme === 'light' || theme === 'dark' ? theme : 'match';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function EditorShell({
  input,
  sidebar,
  stageRef,
  snackbar,
  onCompactChange,
  children,
}: EditorShellProps) {
  const shell = usePtShell();
  const shellRef = useRef<ShellState>(shell);
  shellRef.current = shell;
  const inputRef = useRef(input);
  inputRef.current = input;

  const [platform, setPlatform] = useState<Platform>('mac');
  const [settings, setSettings] = useState<ShellSettings>(DEFAULT_SETTINGS);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const lastPanel = useRef<PanelId>('formatOptions');
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [layoutGrid, setLayoutGrid] = useState<LayoutGridRequest | null>(null);
  const [menuOpen, setMenuOpen] = useState<MenuId | null>(null);
  const [compact, setCompactState] = useState(false);
  const [toolFinderOpen, setToolFinderOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [lastLayout, setLastLayout] = useState<LayoutId | null>(null);
  const titleField = useRef<HTMLElement | null>(null);
  /* read in the initializer, so the first effect run sees the browser's choice (the editor routes render on the client only) */
  const [appearance, setAppearanceState] = useState<'light' | 'dark' | 'match'>(() =>
    typeof window === 'undefined' ? 'match' : readAppearance(),
  );
  const [makeCopySelected, setMakeCopySelected] = useState(false);
  const [publishTab, setPublishTab] = useState<'link' | 'embed'>('link');

  /* the platform, the stored settings, the last layout and the chrome appearance, read after mount */
  useMountEffect(() => {
    setPlatform(detectPlatform());
    setSettings({ ...DEFAULT_SETTINGS, ...readStoredSettings(load(SETTINGS_STORAGE)) });
    setLastLayout(readLastLayout(load(LAST_LAYOUT_STORAGE)));
    const chosen = readAppearance();
    setAppearanceState(chosen);
    const theme: Theme = chosen === 'match' ? appearanceOf(inputRef.current.document.deck) : chosen;
    if (readTheme() !== theme) applyTheme(theme);
  });

  /* Tools > Advanced > Show slide and block ids and Show sections as a tree: the root carries the
     flags so the stage chip, the id tooltips and the filmstrip can read them (SPEC 2.8) */
  useEffect(() => {
    const root = stageRef.current?.closest<HTMLElement>('.pt-viewer');
    if (!root) return;
    root.toggleAttribute('data-show-ids', settings.showIds === true);
    root.toggleAttribute('data-sections-tree', settings.sectionsTree === true);
    root.toggleAttribute('data-spellcheck', settings.spellcheck !== false);
  }, [settings.showIds, settings.sectionsTree, settings.spellcheck, stageRef]);

  /* the right panel column opens on the root (EditorShell.css reads data-rpanel) */
  useEffect(() => {
    const root = stageRef.current?.closest<HTMLElement>('.pt-viewer');
    if (!root) return;
    if (panel === null) root.removeAttribute('data-rpanel');
    else root.setAttribute('data-rpanel', panel);
  }, [panel, stageRef]);

  /* the deck's appearance changed while the chrome matches it */
  const deckAppearance = appearanceOf(input.document.deck);
  useEffect(() => {
    if (appearance === 'match' && readTheme() !== deckAppearance) applyTheme(deckAppearance);
  }, [appearance, deckAppearance]);

  /* the settings the route owns are mirrored into the context so the menus check them */
  const effectiveSettings = useMemo<ShellSettings>(
    () => ({
      ...settings,
      gridView: shell.mode === 'grid',
      book: shell.mode === 'book',
      filmstrip: shell.sidebarOpen,
      compact,
      appearance,
      viewing: input.toggles?.viewing ?? false,
      sideBySide: input.toggles?.sideBySide ?? false,
      sourceDrawer: input.toggles?.source ?? false,
      suggestionMarks: input.toggles?.suggestionMarks ?? false,
      sections: settings.sections ?? input.document.deck.sections.length > 1,
    }),
    [
      settings,
      shell.mode,
      shell.sidebarOpen,
      compact,
      appearance,
      input.toggles,
      input.document.deck.sections.length,
    ],
  );

  const menuContext = useMemo(
    () => buildMenuContext(input, effectiveSettings, platform),
    [input, effectiveSettings, platform],
  );

  const say = useCallback(
    (text: string, action?: SnackbarAction) => snackbar.show(text, action),
    [snackbar],
  );

  const setSetting = useCallback((setting: MenuSetting, value: boolean | string) => {
    setSettings((prev) => {
      const next = { ...prev, [setting]: value };
      store(SETTINGS_STORAGE, writeStoredSettings(next));
      return next;
    });
  }, []);

  const onCompactRef = useRef(onCompactChange);
  onCompactRef.current = onCompactChange;
  const setCompact = useCallback((on: boolean) => {
    setCompactState(on);
    setMenuOpen(null);
    onCompactRef.current?.(on);
  }, []);

  const openPanel = useCallback((id: PanelId) => {
    lastPanel.current = id;
    setPanel(id);
  }, []);
  const closePanel = useCallback(() => setPanel(null), []);
  const reopenPanel = useCallback(() => setPanel(lastPanel.current), []);

  const openDialog = useCallback((request: DialogId | DialogRequest) => {
    setDialog(typeof request === 'string' ? { id: request } : request);
    setMenuOpen(null);
  }, []);
  const closeDialog = useCallback(() => setDialog(null), []);

  const openLayoutGrid = useCallback((request: LayoutGridRequest) => setLayoutGrid(request), []);
  const closeLayoutGrid = useCallback(() => setLayoutGrid(null), []);

  const navigate = useCallback((path: string, newTab?: boolean) => {
    const target = path.replace(':deckId', encodeURIComponent(inputRef.current.deckId));
    if (inputRef.current.navigate) inputRef.current.navigate(target, newTab);
    else if (newTab) window.open(target, '_blank', 'noopener');
    else window.location.assign(target);
  }, []);

  const setAppearance = useCallback((value: 'light' | 'dark' | 'match') => {
    setAppearanceState(value);
    store(APPEARANCE_STORAGE, value);
    const theme: Theme = value === 'match' ? appearanceOf(inputRef.current.document.deck) : value;
    applyTheme(theme);
  }, []);

  /** Dispatches an action plan and words its snackbar. */
  const runPlan = useCallback(
    (item: MenuItem) => {
      const current = inputRef.current;
      /* the Insert rows (SPEC 2.4) act before any write: Text box, the shapes and the lines arm
         the canvas's draw tool; Table, Icon and Material open their picker; Upload from computer
         opens the OS file picker on the target the row names. The plan below is the write a row
         makes when the route gave the shell no draw tool. */
      const intent = insertIntentOf(item);
      if (intent?.kind === 'upload') {
        if (current.uploadPicture)
          current.uploadPicture(
            pictureTargetOf(item.id, current.slideId, current.selection?.blockId),
          );
        else say(SNACKBARS.noFilePicker);
        return;
      }
      if (intent?.kind === 'picker') {
        openDialog(PICKER_DIALOG[intent.picker]);
        return;
      }
      if (intent?.kind === 'tool' && current.onDrawTool) {
        current.onDrawTool(intent.tool);
        return;
      }
      const plan = menuActionPlan(item, factsOf(current, lastLayout));
      if ('refused' in plan) {
        say(plan.refused);
        return;
      }
      const undoAction: SnackbarAction | undefined =
        plan.undo && current.history?.undo
          ? { label: SNACKBARS.undo, run: () => current.history?.undo() }
          : undefined;
      current
        .dispatch(plan.action, plan.input)
        .then((result) => {
          if (plan.action === 'view.zoom') {
            const zoom = (plan.input as { zoom: number | 'fit' }).zoom;
            setSetting('zoom', zoom === 'fit' ? 'fit' : String(Math.round(zoom * 100)));
          }
          if (plan.action === 'deck.trash') {
            say(SNACKBARS.movedToTrash, {
              label: SNACKBARS.undo,
              run: () => {
                void current.dispatch('deck.restore', {
                  id: current.deckId,
                  baseRevision: current.revision,
                });
                current.onTrashed?.();
              },
            });
            navigate('/decks');
            return;
          }
          if (plan.action === 'export.text') {
            const text = (result as { text?: string }).text ?? '';
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${current.deckId}.txt`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return;
          }
          if (plan.action === 'render.slide') {
            const images = (result as { images?: string[] }).images ?? [];
            const first = images[0];
            if (first !== undefined && /^(https?:)?\//.test(first))
              window.open(first, '_blank', 'noopener');
            else say(`Rendered ${images.length} image${images.length === 1 ? '' : 's'}`);
            return;
          }
          if (plan.action === 'deck.pack') {
            const path = (result as { path?: string }).path;
            say(path === undefined ? 'The bundle is ready' : `The bundle is at ${path}`);
            return;
          }
          if (plan.action === 'build.run') {
            say('The web page is ready');
            return;
          }
          if (plan.snackbar !== undefined) say(plan.snackbar, undoAction);
        })
        .catch((error: unknown) => say(errorText(error)));
    },
    [lastLayout, navigate, openDialog, say, setSetting],
  );

  /** Client handlers: the effects with no action of their own (SPEC 2.13). */
  const runClient = useCallback(
    (handler: string, item: MenuItem, anchor?: HTMLElement | null) => {
      const current = inputRef.current;
      const s = shellRef.current;
      switch (handler) {
        case 'undo':
          current.history?.undo();
          return;
        case 'redo':
          current.history?.redo();
          return;
        case 'cut':
        case 'copy':
        case 'paste':
        case 'pasteWithoutFormatting':
        case 'selectAll': {
          const fn = current.clipboard?.[handler];
          if (fn) fn();
          else say(`${item.label} works on the slides and the canvas once they are focused`);
          return;
        }
        case 'delete':
          if (current.clipboard?.delete) {
            current.clipboard.delete();
            return;
          }
          runPlan(itemById('slide.deleteSlide'));
          return;
        case 'duplicate':
          runPlan(item);
          return;
        case 'link':
          if (current.onLink) current.onLink();
          else openDialog('link');
          return;
        case 'zoomIn':
        case 'zoomOut': {
          const zoom = effectiveSettings.zoom;
          const now = zoom === 'fit' || zoom === undefined ? 100 : Number(zoom);
          const steps = [25, 50, 75, 100, 125, 150, 200, 300, 400];
          const at = steps.findIndex((step) => step >= now);
          const next =
            handler === 'zoomIn'
              ? steps[Math.min(steps.length - 1, (at < 0 ? steps.length - 1 : at) + 1)]
              : steps[Math.max(0, (at < 0 ? steps.length : at) - 1)];
          if (next === undefined) return;
          current
            .dispatch('view.zoom', { zoom: next / 100 })
            .then(() => setSetting('zoom', String(next)))
            .catch((error: unknown) => say(errorText(error)));
          return;
        }
        case 'focusTitle':
          titleField.current?.focus();
          titleField.current?.click();
          return;
        case 'showSaveState': {
          const save = current.save;
          say(
            save?.draft
              ? 'Not saved yet: the first edit saves the presentation'
              : SNACKBARS.autosaved,
          );
          return;
        }
        case 'presenterView':
          if (current.present?.presenterView) current.present.presenterView();
          else {
            window.open(`/present/${encodeURIComponent(current.deckId)}`, '_blank', 'noopener');
            s.setPresent(true);
          }
          return;
        case 'presentFromBeginning':
          if (current.present?.start) current.present.start(true);
          else {
            const first = s.paged[0];
            if (first) s.select(first.id);
            s.setPresent(true);
          }
          return;
        case 'toolFinder':
          setToolFinderOpen(true);
          return;
        case 'runAction':
          setPaletteOpen(true);
          return;
        default:
          say(`${item.label} is not available for the current selection`);
      }
      void anchor;
    },
    [effectiveSettings.zoom, openDialog, runPlan, say, setSetting],
  );

  const runToggle = useCallback(
    (setting: MenuSetting, value: string | boolean | undefined) => {
      const current = inputRef.current;
      const s = shellRef.current;
      switch (setting) {
        case 'gridView':
          s.setMode(s.mode === 'grid' ? 'slide' : 'grid');
          return;
        case 'book':
          s.setMode(s.mode === 'book' ? 'slide' : 'book');
          return;
        case 'filmstrip':
          s.setSidebar(!s.sidebarOpen);
          return;
        case 'compact':
          setCompact(!compact);
          return;
        case 'viewing':
          current.toggles?.onViewing?.(value === true);
          return;
        case 'sideBySide':
          current.toggles?.onSideBySide?.(!(current.toggles.sideBySide ?? false));
          return;
        case 'sourceDrawer':
          current.toggles?.onSource?.(!(current.toggles.source ?? false));
          return;
        case 'suggestionMarks':
          current.toggles?.onSuggestionMarks?.(!(current.toggles.suggestionMarks ?? false));
          return;
        case 'appearance':
          if (value === 'light' || value === 'dark' || value === 'match') setAppearance(value);
          return;
        default: {
          const now = effectiveSettings[setting];
          setSetting(setting, typeof value === 'string' ? value : !(now === true));
        }
      }
    },
    [compact, effectiveSettings, setAppearance, setCompact, setSetting],
  );

  const runItem = useCallback(
    (item: MenuItem, anchor?: HTMLElement | null) => {
      const effect = item.effect;
      if (item.status !== 'now' || effect === undefined) return;
      if (!isEnabled(item, menuContext)) {
        if (item.disabledReason !== undefined) say(item.disabledReason);
        return;
      }
      setMenuOpen(null);
      switch (effect.kind) {
        case 'action':
          runPlan(item);
          return;
        case 'dialog': {
          const id = dialogIdOf(effect.title, item.id);
          if (id === 'imageByUrl' || id === 'fromThisPresentation') {
            const current = inputRef.current;
            openDialog({
              id,
              target: pictureTargetOf(item.id, current.slideId, current.selection?.blockId),
            });
            return;
          }
          if (id === 'makeCopy') setMakeCopySelected(item.id === 'file.makeCopy.selected');
          if (id === 'publish')
            setPublishTab(item.id === 'extensions.embedInSite' ? 'embed' : 'link');
          if (id !== null) openDialog(id);
          return;
        }
        case 'panel': {
          const id = panelIdOfTitle(effect.title);
          if (id !== null) openPanel(id);
          return;
        }
        case 'route':
          navigate(effect.path, effect.newTab);
          return;
        case 'toggle':
          runToggle(effect.setting, effect.value);
          return;
        case 'submenu':
          if (effect.dynamic === 'layouts' && anchor)
            openLayoutGrid({ purpose: 'apply', anchor, returnFocusTo: anchor });
          return;
        case 'client':
          if (effect.handler === 'runAction' && item.id.startsWith('toolbar.more.')) return;
          runClient(effect.handler, item, anchor);
          return;
      }
    },
    [
      menuContext,
      navigate,
      openDialog,
      openLayoutGrid,
      openPanel,
      runClient,
      runPlan,
      runToggle,
      say,
    ],
  );

  const pickLayout = useCallback(
    (layout: LayoutId, purpose: 'new' | 'apply') => {
      const current = inputRef.current;
      setLayoutGrid(null);
      setMenuOpen(null);
      const slideIds = current.selectedSlideIds ?? [current.slideId];
      if (purpose === 'new') {
        setLastLayout(layout);
        store(LAST_LAYOUT_STORAGE, layout);
        const section = current.document.deck.sections.find((each) =>
          each.slideIds.includes(current.slideId),
        );
        current
          .dispatch('slide.new', {
            layout,
            after: current.slideId,
            ...(section === undefined ? {} : { sectionId: section.id }),
            baseRevision: current.revision,
          })
          .catch((error: unknown) => say(errorText(error)));
        return;
      }
      current
        .dispatch('slide.applyLayout', {
          slideIds: [...slideIds],
          layout,
          baseRevision: current.revision,
        })
        .then((result) => {
          const dropped = (result as { dropped?: Array<{ blockIds: string[] }> }).dropped ?? [];
          const count = dropped.reduce((sum, row) => sum + row.blockIds.length, 0);
          const label = layoutEntry(layout).label;
          if (count > 0) {
            say(
              SNACKBARS.appliedLayout(label, count, count === 1 ? 'block' : 'blocks'),
              current.history?.undo
                ? { label: SNACKBARS.undo, run: () => current.history?.undo() }
                : undefined,
            );
          }
        })
        .catch((error: unknown) => say(errorText(error)));
    },
    [say],
  );

  const runControl = useCallback(
    (control: TailControl, anchor: HTMLElement | null) => {
      const current = inputRef.current;
      if (control.status !== 'now' || !evaluate(control.enabled, menuContext)) return;
      switch (control.control) {
        case 'toolbar.paintFormat':
          if (current.onPaintFormat) current.onPaintFormat();
          else say('Select a block, then click the block to paint');
          return;
        case 'toolbar.select':
          current.onSelectBlock?.(undefined);
          return;
        case 'toolbar.textBox':
          if (current.onDrawTool) current.onDrawTool({ kind: 'text' });
          else runItem(itemById('insert.textBox'), anchor);
          return;
        case 'toolbar.layout':
          if (anchor) openLayoutGrid({ purpose: 'apply', anchor, returnFocusTo: anchor });
          return;
        case 'toolbar.formatOptions':
          if (panel === 'formatOptions') closePanel();
          else openPanel('formatOptions');
          return;
        case 'toolbar.theme':
          if (panel === 'themes') closePanel();
          else openPanel('themes');
          return;
        default:
          break;
      }
      if (control.item !== undefined) {
        const item = findItem(control.item);
        if (item !== undefined) runItem(item, anchor);
      }
    },
    [closePanel, menuContext, openLayoutGrid, openPanel, panel, runItem, say],
  );

  const renderLayoutSubmenu = useCallback(
    (_item: MenuItem) => (
      <div className="ts-layout-plate is-submenu">
        <LayoutGrid
          document={input.document}
          slide={input.document.slides[input.slideId]}
          theme={deckAppearance}
          render={input.renderSlide}
          onPick={(layout) => pickLayout(layout, 'apply')}
          onAddPicture={() =>
            input.uploadPicture?.({ kind: 'slide', slideId: input.slideId, path: '/picture/asset' })
          }
          control="layout.apply"
        />
      </div>
    ),
    [input, deckAppearance, pickLayout],
  );

  const focusTitle = useCallback(() => {
    titleField.current?.click();
  }, []);
  const registerTitleField = useCallback((el: HTMLElement | null) => {
    if (el) titleField.current = el;
  }, []);

  /* the Esc ladder below a menu or a dialog (SPEC 10.2) */
  const escape = useCallback((): boolean => {
    if (layoutGrid !== null) {
      setLayoutGrid(null);
      return true;
    }
    if (compact) {
      setCompact(false);
      return true;
    }
    if (panel !== null) {
      setPanel(null);
      return true;
    }
    const s = shellRef.current;
    if (s.present && !document.fullscreenElement) {
      s.setPresent(false);
      return true;
    }
    return false;
  }, [compact, layoutGrid, panel, setCompact]);

  const runBinding = useCallback(
    (binding: KeyBinding, _event: KeyboardEvent): boolean => {
      const current = inputRef.current;
      const s = shellRef.current;
      switch (binding.id) {
        case 'key.find':
        case 'key.findAgain':
        case 'key.findPrevious':
          openDialog('findReplace');
          return true;
        case 'key.save':
          say(SNACKBARS.autosaved);
          return true;
        case 'key.moveToFilmstrip':
          document
            .querySelector<HTMLElement>(
              '.pt-sb .pt-orow.is-active, .pt-sb [aria-current], .pt-sb a',
            )
            ?.focus();
          return true;
        case 'key.moveToCanvas':
          document.querySelector<HTMLElement>('.ts-stage, .pt-stagewrap')?.focus();
          return true;
        case 'key.openNotes':
          document
            .querySelector<HTMLElement>('.ts-notes-slot textarea, [data-control="notes"]')
            ?.focus();
          return true;
        case 'key.contextMenu':
          return false;
        default:
          break;
      }
      void current;
      void s;
      return false;
    },
    [openDialog, runClient, say],
  );

  useEditorKeys(
    { platform, menuContext, enabled: true },
    {
      runItem,
      runBinding,
      openMenu: (id) => {
        setCompact(false);
        setMenuOpen(id);
      },
      escape,
      say,
      overlayOpen: () =>
        menuOpen !== null ||
        dialog !== null ||
        toolFinderOpen ||
        paletteOpen ||
        layoutGrid !== null,
    },
  );

  const state: EditorShellState = useMemo(
    () => ({
      input,
      platform,
      menuContext,
      settings: effectiveSettings,
      setSetting,
      runItem,
      runControl,
      panel,
      openPanel,
      closePanel,
      reopenPanel,
      dialog,
      openDialog,
      closeDialog,
      layoutGrid,
      openLayoutGrid,
      closeLayoutGrid,
      pickLayout,
      renderLayoutSubmenu,
      menuOpen,
      setMenuOpen,
      compact,
      setCompact,
      toolFinderOpen,
      setToolFinderOpen,
      paletteOpen,
      setPaletteOpen,
      say,
      lastLayout,
      focusTitle,
      registerTitleField,
    }),
    [
      input,
      platform,
      menuContext,
      effectiveSettings,
      setSetting,
      runItem,
      runControl,
      panel,
      openPanel,
      closePanel,
      reopenPanel,
      dialog,
      openDialog,
      closeDialog,
      layoutGrid,
      openLayoutGrid,
      closeLayoutGrid,
      pickLayout,
      renderLayoutSubmenu,
      menuOpen,
      compact,
      setCompact,
      toolFinderOpen,
      paletteOpen,
      say,
      lastLayout,
      focusTitle,
      registerTitleField,
    ],
  );

  const slide = input.document.slides[input.slideId];
  const speakerNotes = effectiveSettings.speakerNotes !== false;

  const panelNode = (() => {
    switch (panel) {
      case 'themes':
        return (
          <ThemesPanel
            document={input.document}
            render={input.renderSlide}
            commit={input.commit}
            onNotice={say}
            onClose={closePanel}
          />
        );
      case 'formatOptions':
        return slide === undefined ? (
          <Panel
            title={PANELS.formatOptions.title}
            onClose={closePanel}
            control="panel.formatOptions"
          >
            <p className="ts-panel-empty">{PANELS.formatOptions.empty}</p>
          </Panel>
        ) : (
          <FormatOptions
            deck={input.document.deck}
            slide={slide}
            blockId={input.selection?.blockId}
            revision={input.revision}
            dispatch={input.dispatch}
            commit={input.commit}
            findings={input.findings}
            lintText={input.lintText}
            assetUrl={input.assetUrl}
            busy={input.busy}
            onChangeLayout={(anchor) =>
              openLayoutGrid({ purpose: 'apply', anchor, returnFocusTo: anchor })
            }
            onClose={closePanel}
          />
        );
      case 'versionHistory':
        return (
          <Panel
            title={PANELS.versionHistory.title}
            onClose={closePanel}
            control="panel.versionHistory"
          >
            <VersionsPanel
              versions={input.versions ?? []}
              revision={input.revision}
              dispatch={input.dispatch}
              history
              onMakeCopy={() => {
                setMakeCopySelected(false);
                openDialog('makeCopy');
              }}
            />
          </Panel>
        );
      case 'checkSlides':
        return (
          <Panel
            title={PANELS.suggestions.title}
            count={
              (input.findings ?? []).filter((finding) => finding.slideId === input.slideId).length
            }
            onClose={closePanel}
            control="panel.checkSlides"
          >
            <LintPanel
              findings={input.findings ?? []}
              slideId={input.slideId}
              revision={input.revision}
              dispatch={input.dispatch}
              selectedBlockId={input.selection?.blockId}
              onSelectBlock={input.onSelectBlock}
              suggestions
              embedded
            />
          </Panel>
        );
      case 'changeHistory':
        return (
          <Panel
            title={PANELS.changeHistory.title}
            onClose={closePanel}
            control="panel.changeHistory"
          >
            <HistoryPanel entries={input.historyEntries ?? []} onUndoTo={input.onUndoTo} embedded />
          </Panel>
        );
      case 'picturesMaterials':
        return slide === undefined ? null : (
          <PicturesPanel
            deck={input.document.deck}
            slide={slide}
            blockId={input.selection?.blockId}
            revision={input.revision}
            dispatch={input.dispatch}
            assetUrl={input.assetUrl}
            createDitherWorker={input.createDitherWorker}
            onNotice={say}
            busy={input.busy}
            onClose={closePanel}
          />
        );
      default:
        return null;
    }
  })();

  const dialogNode = (() => {
    if (dialog === null) return null;
    switch (dialog.id) {
      case 'open':
        return <OpenDialog />;
      case 'importSlides':
        return <ImportSlidesDialog />;
      case 'makeCopy':
        return <MakeCopyDialog selected={makeCopySelected} />;
      case 'share':
        return <ShareDialog />;
      case 'publish':
        return <PublishDialog tab={publishTab} />;
      case 'download':
        return <DownloadDialog format="pptx" />;
      case 'downloadPdf':
        return <DownloadDialog format="pdf" />;
      case 'slideNumbers':
        return <SlideNumbersDialog />;
      case 'details':
        return <DetailsDialog />;
      case 'findReplace':
        return <FindReplaceDialog />;
      case 'nameVersion':
        return <NameVersionDialog />;
      case 'agentAccess':
        return <AgentAccessDialog />;
      case 'help':
        return <HelpDialog />;
      case 'keyboardShortcuts':
        return <ShortcutsDialog platform={platform} onClose={closeDialog} />;
      case 'imageByUrl':
        return <ImageByUrlDialog target={dialog.target} />;
      case 'fromThisPresentation':
        return <FromThisPresentationDialog target={dialog.target} />;
      case 'link':
        return <LinkDialog />;
      case 'insertTable':
        return <InsertTableDialog />;
      case 'insertIcon':
        return <InsertIconDialog />;
      case 'insertMaterial':
        return <InsertMaterialDialog />;
    }
  })();

  const layoutPlate =
    layoutGrid === null ? null : (
      <LayoutPlate request={layoutGrid} onClose={closeLayoutGrid}>
        <LayoutGrid
          document={input.document}
          slide={layoutGrid.purpose === 'apply' ? slide : undefined}
          theme={deckAppearance}
          render={input.renderSlide}
          onPick={(layout) => pickLayout(layout, layoutGrid.purpose)}
          onAddPicture={() =>
            input.uploadPicture?.({ kind: 'slide', slideId: input.slideId, path: '/picture/asset' })
          }
          control={layoutGrid.purpose === 'new' ? 'layout.new' : 'layout.apply'}
          autoFocus
        />
      </LayoutPlate>
    );

  return (
    <EditorShellContext value={state}>
      <TitleRow compact={compact} onShowMenus={() => setCompact(false)} />
      <MenuBar />
      <div className="ts-toolbar" role="toolbar" aria-label="Toolbar" data-control="toolbar">
        <ToolbarHead />
        <ToolbarTail />
      </div>
      {sidebar}
      <section className="pt-main" data-editor-main="">
        <div ref={stageRef} className="pt-stagewrap">
          {children}
        </div>
        {speakerNotes && input.notes !== undefined ? (
          <div className="ts-notes-slot">{input.notes}</div>
        ) : null}
        {input.drawer}
      </section>
      <div className="ts-rpanel">{panelNode}</div>
      <BottomBar />
      {layoutPlate}
      {dialogNode}
      <ToolFinder
        open={toolFinderOpen}
        document={input.document}
        slideId={input.slideId}
        menuContext={menuContext}
        dispatch={input.dispatch}
        onRunItem={(item) => {
          setToolFinderOpen(false);
          runItem(item);
        }}
        onPickLayout={(layout) => {
          setToolFinderOpen(false);
          pickLayout(layout, 'new');
        }}
        onClose={() => setToolFinderOpen(false)}
        onNotice={say}
      />
      <Palette
        open={paletteOpen}
        entries={input.paletteEntries ?? []}
        dispatch={input.dispatch}
        onClose={() => setPaletteOpen(false)}
        onNotice={say}
      />
      <Snackbar message={snackbar.message} onDismiss={snackbar.dismiss} />
    </EditorShellContext>
  );
}

/** The plate the layout grid opens in from the New slide arrow, the Layout button or Format options. */
function LayoutPlate({
  request,
  onClose,
  children,
}: {
  request: LayoutGridRequest;
  onClose: () => void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const rect = request.anchor.getBoundingClientRect();
    const width = root.current?.offsetWidth ?? 440;
    const height = root.current?.offsetHeight ?? 480;
    let left = rect.left;
    let top = rect.bottom + 2;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - width);
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - 2 - height);
    setPos({ left, top });
    const onDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (root.current?.contains(event.target) || request.anchor.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [request, onClose]);

  return (
    <div
      ref={root}
      className="ts-layout-plate"
      role="dialog"
      aria-label={request.purpose === 'new' ? 'New slide with layout' : 'Apply layout'}
      style={
        pos === null ? { visibility: 'hidden', left: 0, top: 0 } : { left: pos.left, top: pos.top }
      }
      data-control={request.purpose === 'new' ? 'layout.new.plate' : 'layout.apply.plate'}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          request.returnFocusTo?.focus();
        }
      }}
    >
      <div className="ts-layout-plate-head">
        <span>{request.purpose === 'new' ? 'New slide with layout' : 'Apply layout'}</span>
      </div>
      {children}
    </div>
  );
}
