import type { ReactNode, RefObject } from 'react';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { emptyTable } from '@turboslide/schema/blocks/table';
import type { LayoutId } from '@turboslide/schema/layouts';
import { layoutEntry } from '@turboslide/schema/layouts';
import type { ShapeCategory } from '@turboslide/schema/shapes';
import { applyTheme, readTheme } from '@turboslide/viewer/theme';
import type { Theme } from '@turboslide/viewer/theme';

import { ActivityPanel } from './activity/ActivityPanel';
import { useOnEverySlidePlan } from './brand/UseOnEverySlide';
import { anchorAtSelection, canvasOrder, stepThread } from './comments/comments-model';
import { CommentsPanel } from './comments/CommentsPanel';
import { NamePromptDialog } from './dialogs/NamePrompt';
import { WordArtBar } from './dialogs/WordArtBar';
import { downloadFromPage } from './download';
import {
  APPEARANCE_STORAGE,
  DEFAULT_SETTINGS,
  LAST_LAYOUT_STORAGE,
  PANEL_SECTION_OF,
  SETTINGS_STORAGE,
  TOOL_SIZES,
  appearanceOf,
  buildMenuContext,
  dashPlan,
  dialogIdOf,
  effectiveZoomPercent,
  factsOf,
  insertBlockPlan,
  insertIntentOf,
  lineEndPlan,
  listPlan,
  memberWritePlan,
  menuActionPlan,
  panelIdOfTitle,
  pictureTargetOf,
  readLastLayout,
  readStoredSettings,
  selectedBlock,
  selectedBlocks,
  shapeDrawTool,
  modeOf,
  shapePickPlan,
  wordArtBlock,
  writeStoredSettings,
  zoomStepFrom,
} from './editor-shell';
import type {
  ActionPlan,
  ActionRefusal,
  CommentThreadView,
  DialogId,
  EditorShellInput,
  InsertPicker,
  PanelId,
  ShellSettings,
  VersionDiffView,
} from './editor-shell';
import { EditorShellContext } from './editor-shell-context';
import type {
  CommentCardRequest,
  DialogRequest,
  EditorShellState,
  LayoutGridRequest,
} from './editor-shell-context';
import { InboxPanel } from './inbox/InboxPanel';
import { FormatOptions } from './FormatOptions';
import { HistoryPanel } from './HistoryPanel';
import type { FormatSectionId } from './inspector/format-sections';
import { LayoutGrid } from './LayoutGrid';
import { LintPanel } from './LintPanel';
import { MenuBar } from './MenuBar';
import { detectPlatform } from './menus/keys';
import type { KeyBinding } from './menus/keys';
import { evaluate, findItem, isEnabled, itemById, resolveEffect } from './menus/model';
import type { MenuId, MenuItem, MenuSetting, Platform } from './menus/model';
import { CANVAS_NOTICES, PANELS, REFUSALS, SNACKBARS } from './menus/strings';
import type { TailControl } from './menus/toolbar-tails';
import { Palette } from './Palette';
import { Panel } from './Panel';
import { AssistPanel } from './panels/Assist';
import { ColorPlate } from './pickers/ColorPlate';
import { DashList } from './pickers/DashList';
import { LineEndPicker } from './pickers/LineEndPicker';
import { PresetPicker } from './pickers/PresetPicker';
import { ShapePicker } from './pickers/ShapePicker';
import { TableGrid } from './pickers/TableGrid';
import { WeightList } from './pickers/WeightList';
import { PicturesPanel } from './PicturesPanel';
import { AnnouncerRegion } from './presence/Announcer';
import { FollowingPlate } from './presence/FollowingPlate';
import { openRoster } from './presence/roster-hook';
import { displayNameFor, viewerFactsOf } from './presence/presence-model';
import { usePtShell } from './shell-context';
import type { ShellState } from './shell-context';
import type { FilmstripHandle } from './Sidebar';
import { Snackbar } from './Snackbar';
import type { SnackbarAction, SnackbarState } from './Snackbar';
import { ThemesPanel } from './ThemesPanel';
import { TitleRow } from './TitleRow';
import { ToolbarHead } from './ToolbarHead';
import { ToolbarTail } from './ToolbarTail';
import { ToolFinder } from './ToolFinder';
import { useEditorKeys } from './useEditorKeys';
import { VersionsPanel } from './VersionsPanel';
import { previousOf } from './versions-model';
import { lazyDialog, preloadDialogs } from './lib/lazyDialog';
import { useMountEffect } from './lib/useMountEffect';
import type { Version } from '@turboslide/schema/mutations';

import './EditorShell.css';

/**
 * The editor's chrome (gslides-parity SPEC 1, 2, 3, 12, 13; SPEC-2 sections 4 to 6, 8.6, 9),
 * composed inside ViewerShell when the route passes `editor`: the title row, the menu bar, the
 * toolbar with its contextual tail, the right panel, the bottom bar, the snackbar, the dialogs,
 * the layout grid, the pickers (the shape, preset, line decoration and dash plates as dynamic
 * submenus; the colour and weight plates anchored to a menu row), Search the menus, the shortcuts
 * dialog, the word art bar and the editor key map. The viewer shell keeps the slide state (mode,
 * active item, sidebar) and the filmstrip; this component owns everything the route does not: the
 * per browser settings (the snap, ruler and guide toggles included), which panel, section and
 * dialog are open, compact mode, the chrome appearance, the set Ungroup left for Regroup, and the
 * one `runItem` every menu, toolbar button, key and finder row goes through to run an effect. A
 * canvas gesture the route has not wired yet dispatches its action where one exists and says what
 * to do otherwise. New in Turboslide (no Prototemplate source).
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

/** The dialog an Insert picker opens (SPEC 2.4); Insert > Table is a plate inside the menu (SPEC-2 0.26). */
const PICKER_DIALOG: Readonly<Record<InsertPicker, DialogId>> = {
  icon: 'insertIcon',
  material: 'insertMaterial',
};

/**
 * The dialogs, the Diagram panel, the HTML panel and the shortcuts dialog load on first open
 * (gslides-parity SPEC-4 0.44, 3.12; lib/lazyDialog.ts): one chunk per module, fetched when a menu
 * first opens (`preloadDialogs` below) or when the dialog is asked for. The pickers stay static:
 * the toolbar tail and the inspector import them too, so a split here alone would move no bytes.
 */
const AgentAccessDialog = lazyDialog(() =>
  import('./dialogs/AgentAccess').then((m) => m.AgentAccessDialog),
);
const AvatarBuilderDialog = lazyDialog(() =>
  import('./dialogs/AvatarBuilder').then((m) => m.AvatarBuilderDialog),
);
const BackgroundDialog = lazyDialog(() =>
  import('./dialogs/Background').then((m) => m.BackgroundDialog),
);
const CustomSpacingDialog = lazyDialog(() =>
  import('./dialogs/CustomSpacing').then((m) => m.CustomSpacingDialog),
);
const DetailsDialog = lazyDialog(() => import('./dialogs/Details').then((m) => m.DetailsDialog));
const DownloadDialog = lazyDialog(() => import('./dialogs/Download').then((m) => m.DownloadDialog));
const FindReplaceDialog = lazyDialog(() =>
  import('./dialogs/FindReplace').then((m) => m.FindReplaceDialog),
);
const FromThisPresentationDialog = lazyDialog(() =>
  import('./dialogs/FromThisPresentation').then((m) => m.FromThisPresentationDialog),
);
const HelpDialog = lazyDialog(() => import('./dialogs/Help').then((m) => m.HelpDialog));
const ImageByUrlDialog = lazyDialog(() =>
  import('./dialogs/ImageByUrl').then((m) => m.ImageByUrlDialog),
);
const ImportSlidesDialog = lazyDialog(() =>
  import('./dialogs/ImportSlides').then((m) => m.ImportSlidesDialog),
);
const InsertIconDialog = lazyDialog(() =>
  import('./dialogs/InsertIcon').then((m) => m.InsertIconDialog),
);
const InsertMaterialDialog = lazyDialog(() =>
  import('./dialogs/InsertMaterial').then((m) => m.InsertMaterialDialog),
);
const LinkDialog = lazyDialog(() => import('./dialogs/Link').then((m) => m.LinkDialog));
const MakeCopyDialog = lazyDialog(() => import('./dialogs/MakeCopy').then((m) => m.MakeCopyDialog));
const ForgetBrowserDialog = lazyDialog(() =>
  import('./dialogs/ForgetBrowser').then((m) => m.ForgetBrowserDialog),
);
const NameVersionDialog = lazyDialog(() =>
  import('./dialogs/NameVersion').then((m) => m.NameVersionDialog),
);
const NotificationSettingsDialog = lazyDialog(() =>
  import('./dialogs/NotificationSettings').then((m) => m.NotificationSettingsDialog),
);
const OpenDialog = lazyDialog(() => import('./dialogs/Open').then((m) => m.OpenDialog));
const ProfileDialog = lazyDialog(() => import('./dialogs/Profile').then((m) => m.ProfileDialog));
const PublishDialog = lazyDialog(() => import('./dialogs/Publish').then((m) => m.PublishDialog));
const RequestAccessDialog = lazyDialog(() =>
  import('./dialogs/RequestAccess').then((m) => m.RequestAccessDialog),
);
const ShareDialog = lazyDialog(() => import('./dialogs/Share').then((m) => m.ShareDialog));
const SignInDialog = lazyDialog(() => import('./dialogs/SignIn').then((m) => m.SignInDialog));
const SlideNumbersDialog = lazyDialog(() =>
  import('./dialogs/SlideNumbers').then((m) => m.SlideNumbersDialog),
);
const SpecialCharactersDialog = lazyDialog(() =>
  import('./dialogs/SpecialCharacters').then((m) => m.SpecialCharactersDialog),
);
const DiagramPanel = lazyDialog(() => import('./DiagramPanel').then((m) => m.DiagramPanel));
const EditHtmlPanel = lazyDialog(() => import('./EditHtmlPanel').then((m) => m.EditHtmlPanel));
const ShortcutsDialog = lazyDialog(() =>
  import('./ShortcutsDialog').then((m) => m.ShortcutsDialog),
);
/* the product round (docs/PRODUCT.md 4.3, section 5): Save as template and Tailor for a customer */
const SaveAsTemplateDialog = lazyDialog(() =>
  import('./dialogs/SaveAsTemplate').then((m) => m.SaveAsTemplateDialog),
);
const TailorDialog = lazyDialog(() => import('./dialogs/Tailor').then((m) => m.TailorDialog));

const LAZY_DIALOGS = [
  AgentAccessDialog,
  AvatarBuilderDialog,
  BackgroundDialog,
  CustomSpacingDialog,
  DetailsDialog,
  DownloadDialog,
  FindReplaceDialog,
  FromThisPresentationDialog,
  HelpDialog,
  ImageByUrlDialog,
  ImportSlidesDialog,
  InsertIconDialog,
  InsertMaterialDialog,
  LinkDialog,
  MakeCopyDialog,
  ForgetBrowserDialog,
  NameVersionDialog,
  NotificationSettingsDialog,
  OpenDialog,
  ProfileDialog,
  PublishDialog,
  RequestAccessDialog,
  ShareDialog,
  SignInDialog,
  SlideNumbersDialog,
  SpecialCharactersDialog,
  DiagramPanel,
  EditHtmlPanel,
  ShortcutsDialog,
  SaveAsTemplateDialog,
  TailorDialog,
] as const;

/** A colour or weight plate anchored to a menu row (SPEC-2 0.27). */
type AnchoredPicker = { kind: 'color' | 'weight'; anchor: HTMLElement };

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

/** The sessionStorage key the home page reads for the editor's Move to trash (-recent.ts TRASHED_KEY). */
const TRASHED_MARKER_KEY = 'turboslide:trashed';

/**
 * Writes the trashed marker for /decks (docs/PRODUCT.md section 2 ranks 15 and 16): the deck's id
 * and title with the facts its card draws, so the Undo on the home page restores the deck and its
 * Recent entry. A refused storage leaves the seller with the listing, which no longer holds the
 * deck.
 */
function writeTrashedMarker(input: EditorShellInput): void {
  try {
    const deck = input.document.deck;
    const firstSlide = deck.sections[0]?.slideIds[0] ?? null;
    const marker = {
      id: input.deckId,
      title: deck.title,
      at: Date.now(),
      facts: {
        title: deck.title,
        appearance: appearanceOf(deck),
        firstSlide,
        revision: input.revision,
      },
    };
    window.sessionStorage.setItem(TRASHED_MARKER_KEY, JSON.stringify(marker));
  } catch {
    // private mode: the listing alone carries the change
  }
}

/** The block types whose Insert > Link goes to the text popover; every other block takes the whole block Link dialog (docs/PRODUCT.md section 2 rank 19). */
const TEXT_LINK_TYPES: ReadonlySet<string> = new Set([
  'heading',
  'paragraph',
  'text',
  'box',
  'plain',
  'rows',
  'refs',
  'say',
  'table',
]);

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
  const [panelSection, setPanelSection] = useState<FormatSectionId | null>(null);
  const lastPanel = useRef<PanelId>('formatOptions');
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [layoutGrid, setLayoutGrid] = useState<LayoutGridRequest | null>(null);
  const [menuOpen, setMenuOpen] = useState<MenuId | null>(null);
  /* a menu opening is the intent to open a dialog: the lazy modules load now, once (SPEC-4 0.44) */
  const dialogsPreloaded = useRef(false);
  useEffect(() => {
    if (menuOpen === null || dialogsPreloaded.current) return;
    dialogsPreloaded.current = true;
    preloadDialogs(LAZY_DIALOGS);
  }, [menuOpen]);
  const [compact, setCompactState] = useState(false);
  const [toolFinderOpen, setToolFinderOpen] = useState(false);
  /* the phrase Search the menus hands the Assist panel ("Ask the assistant: <phrase>", docs/PRODUCT.md 6.1) */
  const [assistPrompt, setAssistPrompt] = useState<string | undefined>(undefined);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [wordArtOpen, setWordArtOpen] = useState(false);
  const [anchoredPicker, setAnchoredPicker] = useState<AnchoredPicker | null>(null);
  const [lastLayout, setLastLayout] = useState<LayoutId | null>(null);
  /* the set the last Ungroup left, for Arrange > Regroup (SPEC-2 4.1) */
  const [regroup, setRegroup] = useState<{ blockIds: string[]; group: string } | null>(null);
  const regroupRef = useRef(regroup);
  regroupRef.current = regroup;
  const guideRef = useRef<{ axis: 'x' | 'y'; at: number } | null>(null);
  const filmstripRef = useRef<FilmstripHandle | null>(null);
  const titleField = useRef<HTMLElement | null>(null);
  /* read in the initializer, so the first effect run sees the browser's choice (the editor routes render on the client only) */
  const [appearance, setAppearanceState] = useState<'light' | 'dark' | 'match'>(() =>
    typeof window === 'undefined' ? 'match' : readAppearance(),
  );
  const [makeCopySelected, setMakeCopySelected] = useState(false);
  const [publishTab, setPublishTab] = useState<'link' | 'embed'>('link');
  /* round three (SPEC-3 5.3, 5.7): the comment card the overlay draws, the Show changes diff */
  const [commentCard, setCommentCard] = useState<CommentCardRequest | null>(null);
  const [diff, setDiff] = useState<VersionDiffView | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  /* the first chord of a two step comment chord (Cmd+Ctrl+N then C), until the C or 2 s */
  const pendingChord = useRef<{ direction: 1 | -1; at: number } | null>(null);

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
     flags so the stage chip, the id tooltips and the filmstrip can read them (SPEC 2.8); the
     ruler and guide toggles too, so the stage draws them (SPEC-2 0.77) */
  useEffect(() => {
    const root = stageRef.current?.closest<HTMLElement>('.pt-viewer');
    if (!root) return;
    root.toggleAttribute('data-show-ids', settings.showIds === true);
    root.toggleAttribute('data-sections-tree', settings.sectionsTree === true);
    root.toggleAttribute('data-spellcheck', settings.spellcheck !== false);
    root.toggleAttribute('data-show-ruler', settings.showRuler === true);
    root.toggleAttribute('data-show-guides', settings.showGuides === true);
    /* docs/FOCUS.md 3.1: the switch on the root, so a driver and the chrome lint can read it */
    root.toggleAttribute('data-advanced-tools', settings.advancedTools === true);
  }, [
    settings.showIds,
    settings.sectionsTree,
    settings.spellcheck,
    settings.showRuler,
    settings.showGuides,
    settings.advancedTools,
    stageRef,
  ]);

  /* the stored settings reach the page that hosts the shell (docs/FOCUS.md 3.1: the window API
     reports Advanced tools as a setting through describe().state.settings) */
  const onSettingsRef = useRef(input.onSettingsChange);
  onSettingsRef.current = input.onSettingsChange;
  useEffect(() => {
    onSettingsRef.current?.(settings);
  }, [settings]);

  /* the right panel column opens on the root (EditorShell.css reads data-rpanel) */
  useEffect(() => {
    const root = stageRef.current?.closest<HTMLElement>('.pt-viewer');
    if (!root) return;
    if (panel === null) root.removeAttribute('data-rpanel');
    else root.setAttribute('data-rpanel', panel);
  }, [panel, stageRef]);

  /* View > Mode on the root, so the stage and the stylesheet read it (SPEC-3 5.3, 6.3) */
  const mode = modeOf(input);
  useEffect(() => {
    const root = stageRef.current?.closest<HTMLElement>('.pt-viewer');
    if (!root) return;
    root.setAttribute('data-edit-mode', mode);
  }, [mode, stageRef]);

  /* the name prompt fires when the route says so (SPEC-3 0.18): never on open, on the first write.
     It is a floating card beside the dialog slot, not the shell's dialog, so the keys, the menu bar
     and the caret of the person typing stay live while it waits (VERIFICATION-3 finding 8); a real
     dialog covers it while open */
  const namePromptOpen = input.account?.namePrompt?.open === true;

  /* `comment.link`'s target and the route's open thread: the card follows it */
  const routeThread = input.comments?.openThreadId ?? null;
  useEffect(() => {
    if (routeThread !== null) setCommentCard({ threadId: routeThread });
  }, [routeThread]);

  /* the default made explicit: `applyTheme` persists the theme it stamps under gt-theme (the
     viewer's key), and `readAppearance` reads a stored gt-theme as the reader's explicit choice
     when no choice of this menu is stored, so a chrome that matched the deck once and reloaded
     came back pinned to that theme and stopped following the deck (the light appearance rows read
     the dark selection colour on a light deck after a reload: return/build/b4.md request 4,
     `arrange.selection-colour.light`). With nothing chosen and no gt-theme set before the mount,
     the choice is recorded as `match`; a gt-theme a reader or a test stored before the page opened
     keeps its meaning */
  useEffect(() => {
    if (load(APPEARANCE_STORAGE) !== null) return;
    const stored = load('gt-theme');
    if (stored === 'light' || stored === 'dark') return;
    store(APPEARANCE_STORAGE, 'match');
  }, []);

  /* the deck's appearance changed while the chrome matches it */
  const deckAppearance = appearanceOf(input.document.deck);
  useEffect(() => {
    if (appearance === 'match' && readTheme() !== deckAppearance) applyTheme(deckAppearance);
  }, [appearance, deckAppearance]);

  /* the remembered ungrouped set is for one slide; a change of slide forgets it */
  useEffect(() => {
    setRegroup(null);
  }, [input.slideId]);

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
      /* SPEC-3 5.3: the route's mode, else the round one Viewing flag */
      mode: modeOf(input),
      /* SPEC-3 4.6: the room's pointer facts win over the stored settings */
      ...(input.presence?.pointerMine === undefined
        ? {}
        : { pointerMine: input.presence.pointerMine }),
      ...(input.presence?.pointersVisible === undefined
        ? {}
        : { pointerOthers: input.presence.pointersVisible }),
      ...(input.comments?.display === undefined ? {} : { comments: input.comments.display }),
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
      input.mode,
      input.presence?.pointerMine,
      input.presence?.pointersVisible,
      input.comments?.display,
      input.document.deck.sections.length,
    ],
  );

  const menuContext = useMemo(
    () => buildMenuContext({ ...input, regroup: regroup !== null }, effectiveSettings, platform),
    [input, effectiveSettings, platform, regroup],
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

  const openPanel = useCallback((id: PanelId, options?: { section?: FormatSectionId }) => {
    lastPanel.current = id;
    setPanel(id);
    setPanelSection(options?.section ?? null);
  }, []);
  const closePanel = useCallback(() => {
    setPanel(null);
    setPanelSection(null);
  }, []);
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

  /** The facts the plans read: the shell's input plus the Regroup memory and the guide under the pointer. */
  const facts = useCallback(
    () =>
      factsOf(inputRef.current, lastLayout, {
        regroup: regroupRef.current,
        guide: guideRef.current,
      }),
    [lastLayout],
  );

  /** Dispatches a plan built outside `menuActionPlan` (a picker's pick) and words its failure. */
  const runBuilt = useCallback(
    (plan: ActionPlan | ActionRefusal) => {
      if ('refused' in plan) {
        say(plan.refused);
        return;
      }
      const current = inputRef.current;
      /* Ungroup leaves a set Regroup puts back; Group and Regroup forget it (SPEC-2 4.1). The
         memory is written when the write is sent, from the selection the plan was built on, not
         when the room acknowledges it: the Arrange menu opened in that gap read Regroup disabled
         while the row, picked a moment later, worked (arrange.group.menu-regroup on the return
         round's gate; return/build/integrator.md). A refused ungroup forgets it again below. */
      let remembered: { blockIds: string[]; group: string } | null = null;
      if (plan.action === 'block.ungroup') {
        const ids = (plan.input.blockIds as string[] | undefined) ?? [];
        const group = plan.input.group as string | undefined;
        const members =
          ids.length > 0
            ? ids
            : selectedBlocks(current.document.slides[current.slideId], current.selection).map(
                (b) => b.id,
              );
        const tag = group ?? current.selection?.group ?? `group-${Date.now().toString(36)}`;
        if (members.length >= 2) {
          remembered = { blockIds: members, group: tag };
          setRegroup(remembered);
        }
      } else if (plan.action === 'block.group' || plan.action === 'block.regroup') {
        setRegroup(null);
      }
      current.dispatch(plan.action, plan.input).catch((error: unknown) => {
        if (remembered !== null) setRegroup(null);
        say(errorText(error));
      });
    },
    [say],
  );

  /** Dispatches an action plan and words its snackbar. */
  const runPlan = useCallback(
    (item: MenuItem) => {
      const current = inputRef.current;
      /* the Insert rows (SPEC 2.4; SPEC-2 6.2) act before any write: Text box, the shapes and the
         lines arm the canvas's draw tool; Icon and Material open their picker; Upload from
         computer opens the OS file picker on the target the row names. The plan below is the write
         a row makes when the route gave the shell no draw tool. */
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
      const plan = menuActionPlan(item, facts());
      if ('refused' in plan) {
        say(plan.refused);
        return;
      }
      /* a batch plan is one write per input, in order (Slide > Delete slide on several cards,
         docs/FOCUS.md rank 22); the snackbar's Undo takes every write back */
      const inputs = plan.batch ?? [plan.input];
      const undoAction: SnackbarAction | undefined =
        plan.undo && current.history?.undo
          ? {
              label: SNACKBARS.undo,
              run: () => {
                for (let i = 0; i < inputs.length; i += 1) current.history?.undo();
              },
            }
          : undefined;
      if (
        plan.action === 'block.ungroup' ||
        plan.action === 'block.group' ||
        plan.action === 'block.regroup'
      ) {
        runBuilt(plan);
        return;
      }
      const dispatchAll = async (): Promise<unknown> => {
        let result: unknown;
        for (const input of inputs) result = await current.dispatch(plan.action, input);
        return result;
      };
      dispatchAll()
        .then(async (result) => {
          if (plan.action === 'view.zoom') {
            const zoom = (plan.input as { zoom: number | 'fit' }).zoom;
            setSetting('zoom', zoom === 'fit' ? 'fit' : String(Math.round(zoom * 100)));
          }
          if (plan.action === 'deck.trash') {
            /* the marker /decks reads on landing (docs/PRODUCT.md section 2 ranks 15 and 16;
               apps/studio/src/routes/-recent.ts takeTrashedMarker): the home page drops the deck
               from its Opened on this device row and shows Moved to trash with Undo there, since
               this page leaves before its own snackbar can be read */
            writeTrashedMarker(current);
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
            /* the picture's address carries a ten minute grant the render route takes for the
               bearer and answers as an attachment (server/tokens.ts signRenderGrant; docs/RETURN.md
               2.19). A popup opened after a 6 to 27 s render sits outside the click's transient
               activation and Chromium can block it (return/build/b7.md B7-R2), and an anchor's
               download request is the browser's, not the page's: it carries none of the page's
               headers and a redirect to another origin navigates the tab away from the editor
               (VERIFICATION.md R1-F5). So the page fetches the picture and saves its bytes under
               the server's file name (download.ts); a refusal is the server's sentence in the
               snackbar. A picture on another origin keeps the tab. */
            const images = (result as { images?: string[] }).images ?? [];
            const first = images[0];
            if (first !== undefined && /^(https?:)?\//.test(first)) {
              const sameOrigin =
                first.startsWith('/') ||
                (typeof window !== 'undefined' && first.startsWith(window.location.origin));
              if (sameOrigin) {
                const format = (plan.input as { format?: string }).format ?? 'png';
                await downloadFromPage(first, { name: `${current.deckId}.${format}` });
              } else window.open(first, '_blank', 'noopener');
            } else say(`Rendered ${images.length} image${images.length === 1 ? '' : 's'}`);
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
    [facts, navigate, openDialog, runBuilt, say, setSetting],
  );

  /** Zoom in and Zoom out step the ladder of SPEC-2 0.81 from the effective zoom. */
  const zoomStep = useCallback(
    (direction: 1 | -1) => {
      const current = inputRef.current;
      /* the step is taken from the effective percent (the stage's scale while Fit, else the
         setting) and applied through zoomTo, so the box text follows the step (docs/FOCUS.md
         rank 23: every step landed on 25 percent and the box kept its old text); the editor's own
         zoomStep stays for a route without the view report */
      /* at Fit the controller holds no number (`snap.zoom` is 'fit', so `view.zoom` is undefined)
         and the effective percent read 100, whose next rung is 125 (docs/FOCUS.md
         `arrange.zoom.menu-in`: "71% -> 125%, expected 75"); the stage's live scale is the
         percent the step starts from (b1 R20, F-zoom-fit) */
      const live = current.view?.zoom ?? current.editor?.scale?.();
      const next = zoomStepFrom(effectiveZoomPercent(effectiveSettings.zoom, live), direction);
      if (current.editor?.zoomStep && live === undefined && !current.editor.zoomTo) {
        current.editor.zoomStep(direction);
        return;
      }
      if (current.editor?.zoomTo) {
        current.editor.zoomTo(next / 100);
        setSetting('zoom', String(next));
        return;
      }
      current
        .dispatch('view.zoom', { zoom: next / 100 })
        .then(() => setSetting('zoom', String(next)))
        .catch((error: unknown) => say(errorText(error)));
    },
    [effectiveSettings.zoom, say, setSetting],
  );

  /** Client handlers: the effects with no action of their own (SPEC 2.13; SPEC-2 4.1). */
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
        case 'selectAll': {
          /* Edit > Select all with the filmstrip focused selects every card (SPEC-2 8.6) */
          if (current.focus === 'filmstrip' && filmstripRef.current) {
            filmstripRef.current.selectAll();
            return;
          }
          const fn = current.clipboard?.selectAll;
          if (fn) fn();
          else say(CANVAS_NOTICES.noEditor(item.label));
          return;
        }
        case 'cut':
        case 'copy':
        case 'paste':
        case 'pasteWithoutFormatting': {
          const fn = current.clipboard?.[handler];
          if (fn) fn();
          else say(CANVAS_NOTICES.noEditor(item.label));
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
          /* with blocks selected the stage's own duplicate runs, which selects the copies as
             Cmd+D does (docs/FOCUS.md rank 34: Edit > Duplicate left the original selected) */
          if (
            current.editor?.duplicate &&
            current.selection?.blockId !== undefined &&
            current.focus !== 'filmstrip'
          ) {
            current.editor.duplicate();
            return;
          }
          runPlan(item);
          return;
        case 'link': {
          /* one link popover for the text case (docs/PRODUCT.md section 2 rank 19): a run being
             edited or a selected block that carries text opens the stage's popover; a block with
             no text (a picture, a shape with none) takes the Link dialog for the whole block */
          const slideNow = current.document.slides[current.slideId];
          const block = slideNow ? selectedBlock(slideNow, current.selection) : undefined;
          const textual =
            current.selection?.text === true ||
            (block !== undefined && TEXT_LINK_TYPES.has(block.type)) ||
            (block === undefined && current.selection?.blockId !== undefined);
          if (textual && current.onLink) current.onLink();
          else openDialog('link');
          return;
        }
        case 'addCaption': {
          /* Add a caption on a picture (rank 10): the stage writes the caption field and opens it */
          if (current.editor?.addCaption?.() !== true) say('Select a picture first');
          return;
        }
        case 'toggleSidePanel':
          /* the title row's toggle (docs/PRODUCT.md section 2 rank 25): the last panel back, or the open one closed */
          if (panel === null) reopenPanel();
          else closePanel();
          return;
        case 'useOnEverySlide': {
          /* the picture as the kit's logo on the title slide and in every footer (docs/PRODUCT.md 4.4) */
          const slideNow = current.document.slides[current.slideId];
          const block = slideNow ? selectedBlock(slideNow, current.selection) : undefined;
          if (block === undefined) {
            say('Select a picture first');
            return;
          }
          const plan = useOnEverySlidePlan(current.document, block);
          if ('refused' in plan) {
            say(plan.refused);
            return;
          }
          if (current.commit === undefined) {
            say(PANELS.brand.noKitYet);
            return;
          }
          const undo = current.history?.undo;
          current
            .commit(plan.mutations, plan.label)
            .then(() =>
              say(
                PANELS.brand.logoEverySlide,
                undo === undefined ? undefined : { label: SNACKBARS.undo, run: () => undo() },
              ),
            )
            .catch((error: unknown) => say(errorText(error)));
          return;
        }
        case 'fontPicker': {
          /* Format > Text > Font opens the toolbar's dropdown (docs/PRODUCT.md 4.2); a control
             folded into More opens More first */
          const control = document.querySelector<HTMLElement>('[data-control="toolbar.font"]');
          if (control !== null && control.offsetParent !== null) {
            /* once the menu has closed: a click from inside the row's own select handler opened
               the dropdown under the closing menu, which took it down with itself */
            window.setTimeout(() => control.click(), 0);
            return;
          }
          const more = document.querySelector<HTMLElement>('[data-control="toolbar.more"]');
          if (more === null) {
            say('Select some text first');
            return;
          }
          more.click();
          window.setTimeout(() => {
            document
              .querySelector<HTMLElement>('[data-control="toolbar.more.toolbar.font"]')
              ?.click();
          }, 0);
          return;
        }
        case 'zoomIn':
          zoomStep(1);
          return;
        case 'zoomOut':
          zoomStep(-1);
          return;
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
        /* round two (SPEC-2 4.1) */
        case 'cropMode':
          if (current.editor?.cropMode) current.editor.cropMode();
          else say('Double click the picture on the slide to crop it');
          return;
        case 'wordArt':
          setWordArtOpen(true);
          return;
        case 'borderColorPicker':
        case 'borderWeightPicker':
          if (anchor)
            setAnchoredPicker({
              kind: handler === 'borderColorPicker' ? 'color' : 'weight',
              anchor,
            });
          else say(`${item.label} opens from the Format menu or the toolbar`);
          return;
        case 'selectNone':
          current.editor?.selectNone?.();
          current.onSelectBlock?.(undefined);
          filmstripRef.current?.selectNone();
          return;
        /* round three (SPEC-3 5.3, 13.1, 13.2) */
        case 'comment': {
          if (current.comments?.add === undefined) {
            say('Comments need the room; open the presentation from the studio');
            return;
          }
          const anchor = anchorAtSelection(
            current.slideId,
            current.selection,
            undefined,
            current.document.slides[current.slideId],
          );
          setCommentCard({ anchor });
          return;
        }
        case 'copyLink': {
          /* the address without a token (0.16) */
          const origin =
            current.origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
          const url = `${origin}/deck/${encodeURIComponent(current.deckId)}`;
          navigator.clipboard
            .writeText(url)
            .then(() => say(SNACKBARS.linkCopied))
            .catch(() => say(url));
          return;
        }
        case 'goToClient': {
          const target = current.presence?.others.find((each) => each.slideId !== undefined);
          if (target === undefined) {
            say('Nobody else has this presentation open');
            return;
          }
          if (current.presence?.onGoTo) current.presence.onGoTo(target.clientId);
          else if (target.slideId !== undefined) s.select(target.slideId);
          return;
        }
        case 'accountMenu':
          document.querySelector<HTMLButtonElement>('[data-control="title.account"]')?.click();
          return;
        default:
          say(`${item.label} is not available for the current selection`);
      }
    },
    [closePanel, openDialog, panel, reopenPanel, runPlan, say, zoomStep],
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
        /* SPEC-3 5.3: the editor's setMode gates the gestures; a route with the round one flag alone reads Viewing */
        case 'mode': {
          const mode =
            value === 'commenting' || value === 'viewing' || value === 'editing'
              ? value
              : 'editing';
          if (current.editor?.setMode) current.editor.setMode(mode);
          else current.toggles?.onViewing?.(mode === 'viewing');
          return;
        }
        /* round three (SPEC-3 4.6, 5.3, 5.7, 0.42) */
        case 'comments': {
          const display =
            value === 'all' || value === 'expanded' || value === 'minimized' || value === 'hidden'
              ? value
              : 'all';
          setSetting('comments', display);
          current.comments?.onDisplay?.(display);
          /* View > Comments > Show all comments opens the Comments panel its sentence promises
             and Hide comments closes it; Expand and Minimize change the markers alone
             (docs/RETURN.md 2.16; audit-surface row 53; the matrix row view.comments.show-all-panel) */
          if (display === 'all') openPanel('comments');
          else if (display === 'hidden' && panel === 'comments') closePanel();
          return;
        }
        case 'pointerMine': {
          const on = !(current.presence?.pointerMine ?? effectiveSettings.pointerMine === true);
          setSetting('pointerMine', on);
          current.presence?.onPointer?.(on);
          return;
        }
        case 'pointerOthers': {
          const on = !(
            current.presence?.pointersVisible ?? effectiveSettings.pointerOthers !== false
          );
          setSetting('pointerOthers', on);
          current.presence?.onPointerOthers?.(on);
          return;
        }
        case 'announce': {
          const on = !(effectiveSettings.announce === true);
          setSetting('announce', on);
          current.presence?.onAnnounce?.(on);
          return;
        }
        case 'showChanges':
          setSetting('showChanges', !(effectiveSettings.showChanges === true));
          if (effectiveSettings.showChanges === true) setDiff(null);
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
    [
      closePanel,
      compact,
      effectiveSettings,
      openPanel,
      panel,
      setAppearance,
      setCompact,
      setSetting,
    ],
  );

  /* the comment card (SPEC-3 5.3): the overlay draws it; the route learns the open thread */
  const openCommentCard = useCallback((request: CommentCardRequest) => {
    setCommentCard(request);
    if (request.threadId !== undefined) inputRef.current.comments?.onOpen?.(request.threadId);
  }, []);
  const closeCommentCard = useCallback(() => {
    setCommentCard(null);
    inputRef.current.comments?.onOpen?.(null);
    const marker = document.querySelector<HTMLElement>('[data-control="comment.marker"]');
    marker?.focus();
  }, []);
  const stepComment = useCallback(
    (direction: 1 | -1) => {
      const current = inputRef.current;
      const threads = current.comments?.threads ?? [];
      const order = canvasOrder(threads, current.document);
      const currentId = commentCard?.threadId ?? null;
      const next: CommentThreadView | null = stepThread(order, currentId, direction);
      if (next === null) return;
      if (next.anchor.slideId !== undefined && next.anchor.slideId !== current.slideId)
        shellRef.current.select(next.anchor.slideId);
      openCommentCard({ threadId: next.id });
    },
    [commentCard?.threadId, openCommentCard],
  );

  /* Show changes (SPEC-3 5.7): the selected version against its predecessor */
  const selectVersion = useCallback(
    (version: Version | null) => {
      setSelectedVersion(version);
      const current = inputRef.current;
      if (version === null || effectiveSettings.showChanges !== true) {
        setDiff(null);
        return;
      }
      const previous = previousOf(current.versions ?? [], version);
      const from = previous?.revision ?? Math.max(0, version.revision - 1);
      const run =
        current.diffVersions?.(from, version.revision) ??
        (current.dispatch('version.diff', {
          from,
          to: version.revision,
        }) as Promise<VersionDiffView>);
      run.then((result) => setDiff(result)).catch((error: unknown) => say(errorText(error)));
    },
    [effectiveSettings.showChanges, say],
  );
  useEffect(() => {
    if (effectiveSettings.showChanges === true && selectedVersion !== null && diff === null)
      selectVersion(selectedVersion);
  }, [effectiveSettings.showChanges, selectedVersion, diff, selectVersion]);

  /* the second step of Cmd+Ctrl+N then C and P then C (section 14) */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const pending = pendingChord.current;
      if (pending === null) return;
      if (Date.now() - pending.at > 2000) {
        pendingChord.current = null;
        return;
      }
      if (event.key.toLowerCase() === 'c') {
        event.preventDefault();
        pendingChord.current = null;
        stepComment(pending.direction);
      } else if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key !== 'Shift') {
        pendingChord.current = null;
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [stepComment]);

  const runItem = useCallback(
    (item: MenuItem, anchor?: HTMLElement | null) => {
      const effect = resolveEffect(item, menuContext);
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
          if (id === null) return;
          const section = PANEL_SECTION_OF[item.id] as FormatSectionId | undefined;
          openPanel(id, section === undefined ? undefined : { section });
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
          /* the hover grid is drawn inside the menu; run as a command (Search the menus) the row
             inserts the default table size (SPEC-2 6.2); the preset grids run the first preset */
          else if (effect.dynamic === 'tableGrid') runPlan(item);
          else if (effect.dynamic === 'bulletPresets' || effect.dynamic === 'numberPresets')
            runPlan(item);
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
          current.onSelectTool?.();
          return;
        case 'toolbar.insertLine':
          /* the button arms the Line tool the way Text box arms the text tool; the arrow beside it
             lists Line and Arrow (docs/FOCUS.md `lines.insert.line-drag`, the toolbar route) */
          if (current.onDrawTool) {
            current.onDrawTool({ kind: 'line', line: 'line' });
            return;
          }
          break;
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

  /**
   * The write of an Insert > Table pick (SPEC-2 6.2): one block.insert of an empty table of the
   * picked size with a header row, centred on the sheet as an object.
   */
  const pickTableSize = useCallback(
    (columns: number, rows: number) => {
      setMenuOpen(null);
      runBuilt(insertBlockPlan(facts(), 'table', (id) => emptyTable(id, columns, rows), 'Table'));
    },
    [facts, runBuilt],
  );

  /** A shape picker pick (SPEC-2 4.1): the draw tool for an Insert row, the mask or the change of shape otherwise. */
  const pickShape = useCallback(
    (item: MenuItem, shape: string) => {
      setMenuOpen(null);
      const current = inputRef.current;
      if (item.id.startsWith('insert.shape') && current.onDrawTool) {
        current.onDrawTool(shapeDrawTool(shape));
        return;
      }
      if (item.id === 'format.image.maskImage' && current.editor?.mask) {
        current.editor.mask(shape);
        return;
      }
      runBuilt(shapePickPlan(item, facts(), shape));
    },
    [facts, runBuilt],
  );

  /** The word art bar's insert (SPEC-2 0.14, 6.2): through the editor's handle, else one block.insert centred on the sheet. */
  const insertWordArt = useCallback(
    (text: string) => {
      setWordArtOpen(false);
      const current = inputRef.current;
      if (current.editor?.wordArt) {
        current.editor.wordArt(text);
        return;
      }
      runBuilt(
        insertBlockPlan(facts(), 'text', (id) => wordArtBlock(id, text), 'Word art', {
          size: TOOL_SIZES.wordArt,
        }),
      );
    },
    [facts, runBuilt],
  );

  /**
   * The plate of a dynamic submenu (menus/model.ts `MenuDynamic`): the layout grid for Apply
   * layout, the hover grid for Insert > Table (SPEC-2 0.26), a shape category's glyph grid (4.1),
   * the bullet and numbering preset grids, the line decoration grid and the dash list. Null for
   * a row with no plate, so the menu lists the row's children or runs its action. A pick closes
   * the bar menu and calls `onPicked`, which a right-click menu passes so it closes too (4.3).
   */
  const renderDynamicSubmenu = useCallback(
    (item: MenuItem, options?: { viaKeyboard?: boolean; onPicked?: () => void }): ReactNode => {
      const effect = resolveEffect(item, menuContext);
      if (effect?.kind !== 'submenu') return null;
      const autoFocus = options?.viaKeyboard === true;
      const picked = (): void => options?.onPicked?.();
      const current = inputRef.current;
      const slide = current.document.slides[current.slideId];
      const block = selectedBlock(slide, current.selection);
      switch (effect.dynamic) {
        case 'layouts':
          return (
            <div className="ts-layout-plate is-submenu">
              <LayoutGrid
                document={input.document}
                slide={input.document.slides[input.slideId]}
                theme={deckAppearance}
                render={input.renderSlide}
                onPick={(layout) => {
                  pickLayout(layout, 'apply');
                  picked();
                }}
                onAddPicture={() =>
                  input.uploadPicture?.({
                    kind: 'slide',
                    slideId: input.slideId,
                    path: '/picture/asset',
                  })
                }
                control="layout.apply"
              />
            </div>
          );
        case 'tableGrid':
          return (
            <TableGrid
              onPick={(columns, rows) => {
                pickTableSize(columns, rows);
                picked();
              }}
              autoFocus={autoFocus}
            />
          );
        case 'shapes':
          return (
            <ShapePicker
              category={effect.category as ShapeCategory | undefined}
              picked={
                item.id === 'format.changeShape' && block?.type === 'shape'
                  ? block.shape
                  : item.id === 'format.image.maskImage' &&
                      (block?.type === 'shot' || block?.type === 'picture')
                    ? block.mask
                    : undefined
              }
              onPick={(shape) => {
                pickShape(item, shape);
                picked();
              }}
              autoFocus={autoFocus}
              control={item.id}
            />
          );
        case 'bulletPresets':
        case 'numberPresets': {
          const family = effect.dynamic === 'bulletPresets' ? 'bullet' : 'number';
          return (
            <PresetPicker
              family={family}
              picked={block?.type === 'plain' ? block.preset : undefined}
              onPick={(preset) => {
                setMenuOpen(null);
                runBuilt(listPlan(facts(), { marker: family, preset }, item.label));
                picked();
              }}
              autoFocus={autoFocus}
              control={item.id}
            />
          );
        }
        case 'lineEnds': {
          const end = item.id.endsWith('lineStart') ? 'start' : 'end';
          return (
            <LineEndPicker
              end={end}
              picked={
                block?.type === 'shape'
                  ? end === 'start'
                    ? block.lineStart
                    : block.lineEnd
                  : undefined
              }
              onPick={(kind) => {
                setMenuOpen(null);
                runBuilt(lineEndPlan(facts(), end, kind, item.label));
                picked();
              }}
              autoFocus={autoFocus}
              control={item.id}
            />
          );
        }
        case 'dashes':
          return (
            <DashList
              picked={block !== undefined && 'dash' in block ? (block.dash as never) : undefined}
              onPick={(dash) => {
                setMenuOpen(null);
                runBuilt(dashPlan(facts(), dash === 'solid' ? null : dash, item.label));
                picked();
              }}
              autoFocus={autoFocus}
              control={item.id}
            />
          );
        default:
          return null;
      }
    },
    [input, deckAppearance, facts, menuContext, pickLayout, pickShape, pickTableSize, runBuilt],
  );

  const focusTitle = useCallback(() => {
    titleField.current?.click();
  }, []);
  const registerTitleField = useCallback((el: HTMLElement | null) => {
    if (el) titleField.current = el;
  }, []);
  const registerFilmstrip = useCallback((handle: FilmstripHandle | null) => {
    filmstripRef.current = handle;
  }, []);
  const setGuideUnderPointer = useCallback((guide: { axis: 'x' | 'y'; at: number } | null) => {
    guideRef.current = guide;
  }, []);

  /* the Esc ladder below a menu or a dialog (SPEC 10.2) */
  const escape = useCallback((): boolean => {
    if (anchoredPicker !== null) {
      setAnchoredPicker(null);
      return true;
    }
    if (wordArtOpen) {
      setWordArtOpen(false);
      return true;
    }
    if (layoutGrid !== null) {
      setLayoutGrid(null);
      return true;
    }
    if (compact) {
      setCompact(false);
      return true;
    }
    if (panel !== null) {
      closePanel();
      return true;
    }
    const s = shellRef.current;
    if (s.present && !document.fullscreenElement) {
      s.setPresent(false);
      return true;
    }
    return false;
  }, [anchoredPicker, closePanel, compact, layoutGrid, panel, setCompact, wordArtOpen]);

  /** The rotate keys of SPEC-2 section 9 (Google's, and the Cmd+Option aliases of 0.78) as one block.rotate. */
  const rotateBy = useCallback(
    (by: number) => {
      const current = inputRef.current;
      const ids =
        current.selection?.blockIds ??
        (current.selection?.blockId === undefined ? [] : [current.selection.blockId]);
      if (ids.length === 0) return false;
      if (current.editor?.rotate) {
        current.editor.rotate(by, ids.length > 1 ? 'selection' : 'each');
        return true;
      }
      current
        .dispatch('block.rotate', {
          slideId: current.slideId,
          blockIds: ids,
          by,
          ...(ids.length > 1 && current.selection?.group !== undefined
            ? { about: 'selection' }
            : {}),
          baseRevision: current.revision,
        })
        .catch((error: unknown) => say(errorText(error)));
      return true;
    },
    [say],
  );

  const runBinding = useCallback(
    (binding: KeyBinding, _event: KeyboardEvent): boolean => {
      const current = inputRef.current;
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
        /* SPEC-2 section 9: the rotate keys with an object selected and no caret */
        case 'key.rotateLeft15':
        case 'key.rotateLeft15Alias':
          return current.selection?.text === true ? false : rotateBy(-15);
        case 'key.rotateRight15':
        case 'key.rotateRight15Alias':
          return current.selection?.text === true ? false : rotateBy(15);
        case 'key.rotateLeft1':
          return current.selection?.text === true ? false : rotateBy(-1);
        case 'key.rotateRight1':
          return current.selection?.text === true ? false : rotateBy(1);
        case 'key.commit': {
          /* a bare Enter outside a field finishes an open crop and nothing else. The binding used
             to answer true whenever the editor exposed `exitCrop`, which the stage's handle always
             does, so the key table prevented the default of every bare Enter and the focused
             Slideshow half, the chevron and every other title row button lost their Enter
             activation (docs/RETURN.md 4.1; return-drive rows 7 to 12 read defaultPrevented true).
             The stage's handle says whether a crop is open (`cropOpen`, Editor.tsx; return/build/b1.md
             R1 and R4); a handle without it is read through the overlay's `.ts-crop-frame`, drawn
             only while a crop is open (Overlay.tsx). With no crop the key is left to the focused
             element. */
          const cropOpen =
            current.editor?.cropOpen !== undefined
              ? current.editor.cropOpen()
              : document.querySelector('.ts-crop-frame') !== null;
          if (current.editor?.exitCrop && cropOpen) {
            current.editor.exitCrop();
            return true;
          }
          return false;
        }
        /* round three (SPEC-3 0.42, section 14): Shift+Tab reaches the key owner when the open
           menu's list does not hold focus (the title button does); the menu closes and the
           roster takes focus once it is placed, as it would from inside the list */
        case 'key.roster': {
          const opened = openRoster();
          if (opened) setMenuOpen(null);
          return opened;
        }
        case 'key.comment.enter': {
          const card = document.querySelector<HTMLElement>('[data-control="comment.card"]');
          if (card) {
            card.focus();
            return true;
          }
          const marker = document.querySelector<HTMLElement>('[data-control="comment.marker"]');
          if (marker) {
            marker.click();
            return true;
          }
          return false;
        }
        case 'key.comment.thread': {
          const threadId =
            commentCard?.threadId ??
            document.querySelector<HTMLElement>('[data-control="comment.marker"]')?.dataset.thread;
          if (threadId === undefined) {
            openPanel('comments');
            return true;
          }
          openCommentCard({ threadId });
          openPanel('comments');
          return true;
        }
        case 'key.comment.next':
          pendingChord.current = { direction: 1, at: Date.now() };
          return true;
        case 'key.comment.previous':
          pendingChord.current = { direction: -1, at: Date.now() };
          return true;
        default:
          break;
      }
      return false;
    },
    [commentCard?.threadId, openCommentCard, openDialog, openPanel, rotateBy, say],
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
        layoutGrid !== null ||
        anchoredPicker !== null ||
        wordArtOpen,
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
      panelSection,
      closePanel,
      reopenPanel,
      wordArtOpen,
      setWordArtOpen,
      registerFilmstrip,
      setGuideUnderPointer,
      dialog,
      openDialog,
      closeDialog,
      layoutGrid,
      openLayoutGrid,
      closeLayoutGrid,
      pickLayout,
      renderDynamicSubmenu,
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
      commentCard,
      openCommentCard,
      closeCommentCard,
      stepComment,
      diff,
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
      panelSection,
      closePanel,
      reopenPanel,
      wordArtOpen,
      registerFilmstrip,
      setGuideUnderPointer,
      dialog,
      openDialog,
      closeDialog,
      layoutGrid,
      openLayoutGrid,
      closeLayoutGrid,
      pickLayout,
      renderDynamicSubmenu,
      menuOpen,
      compact,
      setCompact,
      toolFinderOpen,
      paletteOpen,
      say,
      lastLayout,
      focusTitle,
      registerTitleField,
      commentCard,
      openCommentCard,
      closeCommentCard,
      stepComment,
      diff,
    ],
  );

  const slide = input.document.slides[input.slideId];
  const speakerNotes = effectiveSettings.speakerNotes !== false;
  const followed =
    input.presence?.following === undefined || input.presence.following === null
      ? undefined
      : input.presence.others.find((each) => each.clientId === input.presence?.following);

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
            selection={input.selection}
            revision={input.revision}
            dispatch={input.dispatch}
            commit={input.commit}
            findings={input.findings}
            lintText={input.lintText}
            assetUrl={input.assetUrl}
            busy={input.busy}
            editor={input.editor}
            measuredBoxes={input.measuredBoxes}
            uploadPicture={input.uploadPicture}
            say={say}
            openSection={panelSection}
            slots={input.formatSlots}
            advancedTools={effectiveSettings.advancedTools === true}
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
              identities={input.identities}
              /* this browser's own principal: the account when signed in, else the anonymous
                 principal the room knows this tab by (the account record carries a null principal
                 id while anonymous, and the rows then never read You) */
              me={input.account?.signedIn ? input.account.principal : input.presence?.self}
              showChanges={effectiveSettings.showChanges === true}
              selected={selectedVersion}
              menuContext={menuContext}
              onShowChanges={(on) => {
                setSetting('showChanges', on);
                if (!on) setDiff(null);
              }}
              onSelect={selectVersion}
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
      case 'diagram':
        /* B5's Diagram panel (SPEC-2 section 5 "Diagram panel"), mounted by the integrator at merge 2 (b5.md request 3) */
        return (
          <DiagramPanel.Component
            slideId={input.slideId}
            revision={input.revision}
            dispatch={input.dispatch}
            onClose={closePanel}
            onNotice={say}
            busy={input.busy}
          />
        );
      /* round three (SPEC-3 5.3, 5.5, 5.7, 0.27): the collaboration panels and Edit HTML */
      case 'comments':
        return input.comments === undefined ? (
          <Panel title={PANELS.comments.title} onClose={closePanel} control="panel.comments">
            <p className="ts-panel-empty">{PANELS.comments.empty}</p>
          </Panel>
        ) : (
          <CommentsPanel
            comments={input.comments}
            document={input.document}
            me={input.account?.principal}
            canComment={
              (input.capabilities === undefined || input.capabilities.includes('comment')) &&
              effectiveSettings.mode !== 'viewing'
            }
            onOpen={(thread) => {
              if (thread.anchor.slideId !== undefined && thread.anchor.slideId !== input.slideId)
                shell.select(thread.anchor.slideId);
              openCommentCard({ threadId: thread.id });
            }}
            onNotificationSettings={
              input.capabilities === undefined || input.capabilities.includes('comment')
                ? () => openDialog('notificationSettings')
                : undefined
            }
            onClose={closePanel}
            say={say}
          />
        );
      case 'inbox':
        return input.inbox === undefined ? (
          <Panel title={PANELS.inbox.title} onClose={closePanel} control="panel.inbox">
            <p className="ts-panel-empty">{PANELS.inbox.empty}</p>
          </Panel>
        ) : (
          <InboxPanel
            inbox={input.inbox}
            document={input.document}
            onOpen={(item) => {
              if (input.inbox?.onOpen) input.inbox.onOpen(item);
              if (item.slideId !== undefined && item.slideId !== input.slideId)
                shell.select(item.slideId);
              if (item.threadId !== undefined) openCommentCard({ threadId: item.threadId });
              else if (item.kind === 'accessRequest') openDialog('share');
            }}
            onSettings={() => openDialog('notificationSettings')}
            onClose={closePanel}
          />
        );
      case 'activity':
        return (
          <ActivityPanel
            activity={input.activity}
            onOpen={(event) => {
              if (event.slideId !== undefined && event.slideId !== input.slideId)
                shell.select(event.slideId);
              if (event.threadId !== undefined) openCommentCard({ threadId: event.threadId });
            }}
            onClose={closePanel}
          />
        );
      case 'editHtml':
        return (
          <EditHtmlPanel.Component
            slideId={input.slideId}
            block={selectedBlock(slide, input.selection)}
            revision={input.revision}
            dispatch={input.dispatch}
            busy={input.busy}
            onNotice={say}
            onClose={closePanel}
          />
        );
      /* the product round (docs/PRODUCT.md 6.1): the assistant's panel; Accept commits through the
         editor's own dispatch, one undo step */
      case 'assist':
        return (
          <AssistPanel
            document={input.document}
            slideId={input.slideId}
            revision={input.revision}
            dispatch={input.dispatch}
            canWrite={input.capabilities === undefined || input.capabilities.includes('write')}
            restricted={input.access?.generalAccess.mode === 'restricted'}
            {...(assistPrompt === undefined ? {} : { initialPrompt: assistPrompt })}
            onTailor={() => openDialog('tailor')}
            say={say}
            {...(input.history?.undo === undefined ? {} : { onUndo: () => input.history?.undo() })}
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
        return <OpenDialog.Component />;
      case 'importSlides':
        return <ImportSlidesDialog.Component />;
      case 'makeCopy':
        return <MakeCopyDialog.Component selected={makeCopySelected} />;
      case 'share':
        return <ShareDialog.Component />;
      case 'publish':
        return <PublishDialog.Component tab={publishTab} />;
      case 'download':
        return <DownloadDialog.Component format="pptx" />;
      case 'downloadPdf':
        return <DownloadDialog.Component format="pdf" />;
      /* the product round (docs/PRODUCT.md section 2 rank 8, 4.3, section 5) */
      case 'downloadOptions':
        return <DownloadDialog.Component format="pptx" options />;
      case 'saveAsTemplate':
        return <SaveAsTemplateDialog.Component />;
      case 'tailor':
        return <TailorDialog.Component />;
      case 'slideNumbers':
        return <SlideNumbersDialog.Component />;
      case 'details':
        return <DetailsDialog.Component />;
      case 'findReplace':
        return <FindReplaceDialog.Component />;
      case 'nameVersion':
        return <NameVersionDialog.Component />;
      case 'agentAccess':
        return <AgentAccessDialog.Component />;
      case 'help':
        return <HelpDialog.Component />;
      case 'keyboardShortcuts':
        return (
          <ShortcutsDialog.Component
            platform={platform}
            context={menuContext}
            onClose={closeDialog}
          />
        );
      case 'imageByUrl':
        return <ImageByUrlDialog.Component target={dialog.target} />;
      case 'fromThisPresentation':
        return <FromThisPresentationDialog.Component target={dialog.target} />;
      case 'link':
        return <LinkDialog.Component />;
      case 'insertIcon':
        return <InsertIconDialog.Component />;
      case 'insertMaterial':
        return <InsertMaterialDialog.Component />;
      /* round two (SPEC-2 4.1) */
      case 'background':
        return <BackgroundDialog.Component />;
      case 'customSpacing':
        return <CustomSpacingDialog.Component />;
      case 'specialCharacters':
        return <SpecialCharactersDialog.Component />;
      /* round three (SPEC-3 7.2 to 7.6, 5.5, 6.5) */
      case 'namePrompt':
        /* opened on purpose (Change name): a dialog with the scrim and the trap (finding 36) */
        return <NamePromptDialog modal />;
      case 'signIn':
        return <SignInDialog.Component />;
      case 'profile':
        return <ProfileDialog.Component />;
      case 'avatarBuilder':
        return <AvatarBuilderDialog.Component />;
      case 'notificationSettings':
        return <NotificationSettingsDialog.Component />;
      case 'requestAccess':
        return <RequestAccessDialog.Component role={dialog.role ?? 'editor'} />;
      case 'forgetBrowser':
        return <ForgetBrowserDialog.Component />;
    }
  })();

  /* Format > Borders & lines > Border color and Border weight anchored to the row (SPEC-2 0.27, 0.62) */
  const anchoredNode = (() => {
    if (anchoredPicker === null) return null;
    const current = inputRef.current;
    const currentSlide = current.document.slides[current.slideId];
    const block = selectedBlock(currentSlide, current.selection);
    const outlined = block?.type === 'text' && block.outline !== undefined;
    const close = () => setAnchoredPicker(null);
    if (anchoredPicker.kind === 'color') {
      const currentColor = outlined
        ? block.outline?.color
        : block !== undefined && 'stroke' in block
          ? (block.stroke as never)
          : block?.type === 'rule'
            ? block.color
            : undefined;
      return (
        <ColorPlate
          anchor={anchoredPicker.anchor}
          label="Border color"
          current={currentColor}
          control="format.bordersLines.borderColor"
          onClose={close}
          onPick={(value) => {
            close();
            if (block === undefined) return;
            if (outlined && block.type === 'text' && block.outline !== undefined) {
              runBuilt({
                action: 'block.set',
                input: {
                  slideId: current.slideId,
                  blockId: block.id,
                  path: '/outline',
                  ...(value === 'none' ? {} : { value: { ...block.outline, color: value } }),
                  baseRevision: current.revision,
                },
                label: 'Border color',
              });
              return;
            }
            runBuilt(
              memberWritePlan(
                facts(),
                'stroke',
                value === 'none' ? undefined : value,
                'Border color',
              ),
            );
          }}
        />
      );
    }
    const weights = outlined
      ? [1, 1.5, 2]
      : block?.type === 'shape'
        ? [0, 1, 1.5, 2, 3, 4]
        : [0, 1, 1.5, 2];
    const currentWeight = outlined
      ? block.outline?.width
      : block !== undefined && 'strokeWidth' in block
        ? (block.strokeWidth as number | undefined)
        : block?.type === 'shape'
          ? block.width
          : block?.type === 'rule'
            ? block.weight
            : undefined;
    return (
      <WeightList
        anchor={anchoredPicker.anchor}
        label="Border weight"
        weights={weights}
        current={currentWeight}
        control="format.bordersLines.borderWeight"
        onClose={close}
        onPick={(weight) => {
          close();
          if (block === undefined) return;
          if (outlined && block.type === 'text' && block.outline !== undefined) {
            runBuilt({
              action: 'block.set',
              input: {
                slideId: current.slideId,
                blockId: block.id,
                path: '/outline',
                value: { ...block.outline, width: weight },
                baseRevision: current.revision,
              },
              label: 'Border weight',
            });
            return;
          }
          runBuilt(memberWritePlan(facts(), 'strokeWidth', weight, 'Border weight'));
        }}
      />
    );
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
      {/* View > Mode > Viewing draws no toolbar, as Google's does; Commenting and Editing keep it
          (docs/RETURN.md 2.14 item 6; EditorShell.css zeroes the row from the root's data-edit-mode).
          A viewer, whose route is always Viewing, keeps the tail's end alone: the View only button
          of SPEC-3 6.3 is the viewer's way to ask for edit access, and the parity audit's roles
          check reads it (the return round's integration; build/integrator.md section 2) */}
      {mode === 'viewing' ? (
        evaluate('viewOnly', menuContext) ? (
          <div
            className="ts-toolbar is-view-only"
            role="toolbar"
            aria-label="Toolbar"
            data-control="toolbar"
          >
            <ToolbarTail />
          </div>
        ) : null
      ) : (
        <div className="ts-toolbar" role="toolbar" aria-label="Toolbar" data-control="toolbar">
          <ToolbarHead />
          <ToolbarTail />
        </div>
      )}
      {sidebar}
      <section className="pt-main" data-editor-main="">
        <div ref={stageRef} className="pt-stagewrap">
          {wordArtOpen ? (
            <WordArtBar onInsert={insertWordArt} onCancel={() => setWordArtOpen(false)} />
          ) : null}
          {children}
          {followed !== undefined ? (
            <FollowingPlate
              followed={followed}
              name={displayNameFor(followed, viewerFactsOf(input.access, input.presence))}
              onStop={() => {
                if (input.presence?.onUnfollow) input.presence.onUnfollow();
                else input.editor?.followClient?.('');
              }}
            />
          ) : null}
          {input.sync?.persisted !== undefined && input.sync.persisted.count > 0 ? (
            <div className="ts-queue-plate ts-chrome" role="status" data-control="sync.persisted">
              <span>{REFUSALS.unsavedChanges(input.sync.persisted.count)}</span>
              <button
                type="button"
                className="pt-ib is-text"
                data-control="sync.persisted.discard"
                onClick={input.sync.persisted.onDiscard}
              >
                <span className="pt-lb">{REFUSALS.discard}</span>
              </button>
              <button
                type="button"
                className="pt-ib is-solid"
                data-control="sync.persisted.apply"
                onClick={input.sync.persisted.onApply}
              >
                <span className="pt-lb">{REFUSALS.apply}</span>
              </button>
            </div>
          ) : null}
        </div>
        {speakerNotes && input.notes !== undefined ? (
          <div className="ts-notes-slot">{input.notes}</div>
        ) : null}
        {input.drawer}
      </section>
      <div className="ts-rpanel">
        <Suspense fallback={null}>{panelNode}</Suspense>
      </div>
      {/* the bottom bar left in the product round (docs/PRODUCT.md section 2 rank 25): its side
          panel toggle sits in the title row's right cluster (TitleRow.tsx `title.sidePanel`) */}
      {layoutPlate}
      {anchoredNode}
      <Suspense fallback={null}>{dialogNode}</Suspense>
      {namePromptOpen && dialog === null ? <NamePromptDialog /> : null}
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
        onAsk={(phrase) => {
          /* "Ask the assistant: <phrase>" opens the panel with the words in the box (docs/PRODUCT.md 6.1) */
          setAssistPrompt(phrase);
          setToolFinderOpen(false);
          openPanel('assist');
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
      <AnnouncerRegion
        on={effectiveSettings.announce === true}
        presence={input.presence}
        document={input.document}
        viewer={viewerFactsOf(input.access, input.presence)}
      />
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
    /* Escape closes the plate whatever holds the focus: opened by a click on the toolbar button
       the focus stays on that button, outside the plate, so the plate's own onKeyDown never sees
       Escape (build-4/hotfix-4.md cause W5). A document capture listener answers it, and the
       plate's onKeyDown still serves a keyboard user whose focus is inside it. */
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
      request.returnFocusTo?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
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
