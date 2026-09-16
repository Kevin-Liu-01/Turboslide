import type { ReactNode, RefObject } from 'react';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { emptyTable } from '@turboslide/schema/blocks/table';
import type { LayoutId } from '@turboslide/schema/layouts';
import { layoutEntry } from '@turboslide/schema/layouts';
import type { ShapeCategory } from '@turboslide/schema/shapes';
import { createMediaController } from '@turboslide/viewer/present/media-controller';
import type { MediaController } from '@turboslide/viewer/present/media-controller';
import { advanceMotionPreview, motionPreview } from '@turboslide/viewer/present/SlideshowLayer';
import { PRESENT_TEXT } from '@turboslide/viewer/present/strings';
import { applyTheme, readTheme } from '@turboslide/viewer/theme';
import type { Theme } from '@turboslide/viewer/theme';

import { ActivityPanel } from './activity/ActivityPanel';
import { BottomBar } from './BottomBar';
import { anchorAtSelection, canvasOrder, stepThread } from './comments/comments-model';
import { CommentsPanel } from './comments/CommentsPanel';
import { NamePromptDialog } from './dialogs/NamePrompt';
import { WordArtBar } from './dialogs/WordArtBar';
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
import { hasMediaPlayback } from './inspector/media';
import type { FormatSectionId } from './inspector/format-sections';
import type { SectionWrite } from './inspector/fields';
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
import type { Preferences } from '@turboslide/schema/preferences';
import { preferencesMirror } from '@turboslide/schema/preferences';
import { EquationToolbar } from './EquationToolbar';
import { isEquationBlock } from './inspector/equation';
import { SidebarStrip } from './SidebarStrip';
import { VerbalizeRegion } from './accessibility/VerbalizeRegion';
import { announceVerbalize } from './accessibility/verbalize';
import { readStashedImportReport } from './dialogs/ImportReport';
import { screenDetailsSupported } from './dialogs/DisplayOptions';
import { deckLanguageOf, preferencesOf, writePreference } from './text-tools';
import type { ChatRow, SpellingFinding } from './text-tools';
import { ROUND_FIVE } from './menus/strings';

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
/**
 * The Accessibility menu's Go to rows (gslides-parity SPEC-5 7.5): the caret moves to the start of
 * the next or previous text run whose marks differ from the current one, inside the focused text
 * box. False when no caret sits in a run.
 */
function moveCaretToFormattingChange(direction: 1 | -1): boolean {
  if (typeof window === 'undefined') return false;
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  if (!selection || !node) return false;
  const element = node instanceof Element ? node : node.parentElement;
  const run = element?.closest<HTMLElement>('[data-run]');
  const box = run?.closest<HTMLElement>('[contenteditable]');
  if (!run || !box) return false;
  const runs = Array.from(box.querySelectorAll<HTMLElement>('[data-run]'));
  const at = runs.indexOf(run);
  const next = runs[at + direction];
  if (next === undefined) return false;
  const range = document.createRange();
  range.setStart(next.firstChild ?? next, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

/* round five (gslides-parity SPEC-5 14.1; merge 2): B1's Motion panel, B2's four dialogs, B3's
   two dialogs and two panes, B5's seven dialogs and three panels, each behind one import() */
const MotionPanel = lazyDialog(() => import('./panels/MotionPanel').then((m) => m.MotionPanel));
const InsertAudioDialog = lazyDialog(() =>
  import('./dialogs/InsertAudio').then((m) => m.InsertAudioDialog),
);
const InsertVideoDialog = lazyDialog(() =>
  import('./dialogs/InsertVideo').then((m) => m.InsertVideoDialog),
);
const CameraDialog = lazyDialog(() => import('./dialogs/Camera').then((m) => m.CameraDialog));
const DisplayOptionsDialog = lazyDialog(() =>
  import('./dialogs/DisplayOptions').then((m) => m.DisplayOptionsDialog),
);
const ImportThemeDialog = lazyDialog(() =>
  import('./dialogs/ImportTheme').then((m) => m.ImportThemeDialog),
);
const ImportReportDialog = lazyDialog(() =>
  import('./dialogs/ImportReport').then((m) => m.ImportReportDialog),
);
const TemplatesPane = lazyDialog(() =>
  import('./panels/TemplatesPane').then((m) => m.TemplatesPane),
);
const BuildingBlocksPane = lazyDialog(() =>
  import('./panels/BuildingBlocksPane').then((m) => m.BuildingBlocksPane),
);
const PreferencesDialog = lazyDialog(() =>
  import('./dialogs/Preferences').then((m) => m.PreferencesDialog),
);
const PersonalDictionaryDialog = lazyDialog(() =>
  import('./dialogs/PersonalDictionary').then((m) => m.PersonalDictionaryDialog),
);
const GuidesDialog = lazyDialog(() => import('./dialogs/Guides').then((m) => m.GuidesDialog));
const IndentationOptionsDialog = lazyDialog(() =>
  import('./dialogs/IndentationOptions').then((m) => m.IndentationOptionsDialog),
);
const RestartNumberingDialog = lazyDialog(() =>
  import('./dialogs/ListOptions').then((m) => m.RestartNumberingDialog),
);
const PrefixSuffixDialog = lazyDialog(() =>
  import('./dialogs/ListOptions').then((m) => m.PrefixSuffixDialog),
);
const DeleteVersionsDialog = lazyDialog(() =>
  import('./dialogs/DeleteVersions').then((m) => m.DeleteVersionsDialog),
);
const SpellCheckPanel = lazyDialog(() =>
  import('./panels/SpellCheck').then((m) => m.SpellCheckPanel),
);
const ChatPanel = lazyDialog(() => import('./panels/Chat').then((m) => m.ChatPanel));
const DictionaryPanel = lazyDialog(() =>
  import('./panels/Dictionary').then((m) => m.DictionaryPanel),
);
const ShortcutsDialog = lazyDialog(() =>
  import('./ShortcutsDialog').then((m) => m.ShortcutsDialog),
);

const LAZY_DIALOGS = [
  InsertAudioDialog,
  InsertVideoDialog,
  CameraDialog,
  DisplayOptionsDialog,
  ImportThemeDialog,
  ImportReportDialog,
  PreferencesDialog,
  PersonalDictionaryDialog,
  GuidesDialog,
  IndentationOptionsDialog,
  RestartNumberingDialog,
  PrefixSuffixDialog,
  DeleteVersionsDialog,
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
  /* round five (gslides-parity SPEC-5 7.1; b5.md request 4): the caller's preferences, the route's
     record first, else the browser mirror the `prefs.set` window handler writes; every write goes
     through `writePreference`, whose answer lands here so the rulers, the toggles and the dialogs
     re-render on the stored value */
  const [preferences, setPreferences] = useState<Preferences>(() => preferencesOf(input));
  useEffect(() => {
    if (input.preferences !== undefined) setPreferences(input.preferences);
  }, [input.preferences]);
  const shellInput = useMemo<EditorShellInput>(
    () => ({
      ...input,
      preferences,
      language: input.language ?? input.document.deck.language ?? 'en-US',
      screens: input.screens ?? screenDetailsSupported(),
    }),
    [input, preferences],
  );
  const writePref = useCallback(async (path: string, value?: unknown) => {
    const stored = await writePreference(inputRef.current, path, value);
    setPreferences(stored);
    if (typeof window !== 'undefined') preferencesMirror(window.localStorage).write(stored);
    return stored;
  }, []);
  /* the Import report of a `.pptx` this deck was made from, once, on the first mount (SPEC-5 5.2; b3.md B3-23) */
  useMountEffect(() => {
    if (typeof window === 'undefined') return;
    if (readStashedImportReport(input.deckId) !== null && window.location.hash === '')
      setDialog({ id: 'importReport' });
  });
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
  }, [
    settings.showIds,
    settings.sectionsTree,
    settings.spellcheck,
    settings.showRuler,
    settings.showGuides,
    stageRef,
  ]);

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
      /* round five (SPEC-5 7.2, 7.5, 7.7): the preference backed toggles read the record */
      spellcheck: preferences.spelling.underline,
      screenReader: preferences.accessibility.screenReader,
      braille: preferences.accessibility.braille,
      speakAloud: preferences.accessibility.speakAloud,
      starred: preferences.starred.includes(input.deckId),
      equationToolbar: settings.equationToolbar ?? true,
    }),
    [
      settings,
      preferences,
      input.deckId,
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
    () =>
      buildMenuContext({ ...shellInput, regroup: regroup !== null }, effectiveSettings, platform),
    [shellInput, effectiveSettings, platform, regroup],
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
      current
        .dispatch(plan.action, plan.input)
        .then((result) => {
          /* Ungroup leaves a set Regroup puts back; Group and Regroup forget it (SPEC-2 4.1) */
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
            if (members.length >= 2) setRegroup({ blockIds: members, group: tag });
          } else if (plan.action === 'block.group' || plan.action === 'block.regroup') {
            setRegroup(null);
          }
          return result;
        })
        .catch((error: unknown) => say(errorText(error)));
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
      const undoAction: SnackbarAction | undefined =
        plan.undo && current.history?.undo
          ? { label: SNACKBARS.undo, run: () => current.history?.undo() }
          : undefined;
      if (
        plan.action === 'block.ungroup' ||
        plan.action === 'block.group' ||
        plan.action === 'block.regroup'
      ) {
        runBuilt(plan);
        return;
      }
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
    [facts, navigate, openDialog, runBuilt, say, setSetting],
  );

  /** Zoom in and Zoom out step the ladder of SPEC-2 0.81 from the effective zoom. */
  const zoomStep = useCallback(
    (direction: 1 | -1) => {
      const current = inputRef.current;
      if (current.editor?.zoomStep) {
        current.editor.zoomStep(direction);
        return;
      }
      const next = zoomStepFrom(
        effectiveZoomPercent(effectiveSettings.zoom, current.view?.zoom),
        direction,
      );
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
          runPlan(item);
          return;
        case 'link':
          if (current.onLink) current.onLink();
          else openDialog('link');
          return;
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
          const anchor = anchorAtSelection(current.slideId, current.selection);
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
        /* round five (gslides-parity SPEC-5 7.3, 9.2, A5; merge 2) */
        case 'themeMode':
          if (current.onThemeMode) current.onThemeMode();
          else say('Edit theme opens from the editor');
          return;
        case 'dictate':
          if (current.onDictate) current.onDictate();
          else say('Dictation needs the notes pane; open the presentation in the editor');
          return;
        case 'fontPicker':
          document.querySelector<HTMLElement>('[data-control="toolbar.font"]')?.click();
          return;
        case 'nextFormattingChange':
        case 'previousFormattingChange':
          if (!moveCaretToFormattingChange(handler === 'nextFormattingChange' ? 1 : -1))
            say('Place the caret in a text box first');
          return;
        case 'nextSlide':
          s.step(1);
          return;
        case 'previousSlide':
          s.step(-1);
          return;
        default:
          say(`${item.label} is not available for the current selection`);
      }
    },
    [openDialog, runPlan, say, zoomStep],
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
        /* round five (gslides-parity SPEC-5 7.2, 7.5, 7.7): the toggles over the preferences record */
        case 'spellcheck':
          void writePref('/spelling/underline', !(effectiveSettings.spellcheck !== false));
          return;
        case 'screenReader':
        case 'braille':
        case 'speakAloud': {
          const on = !(effectiveSettings[setting] === true);
          void writePref(`/accessibility/${setting}`, on).then(() => {
            if (setting === 'screenReader' && on) {
              announceVerbalize(ROUND_FIVE.screenReaderOn);
              say(ROUND_FIVE.screenReaderOn);
            }
          });
          return;
        }
        case 'starred': {
          const list = preferences.starred;
          const index = list.indexOf(current.deckId);
          void writePref(
            index >= 0 ? `/starred/${index}` : '/starred/-',
            index >= 0 ? undefined : current.deckId,
          ).then(() => say(index >= 0 ? 'Removed from Starred' : 'Added to Starred'));
          return;
        }
        default: {
          const now = effectiveSettings[setting];
          setSetting(setting, typeof value === 'string' ? value : !(now === true));
        }
      }
    },
    [
      compact,
      effectiveSettings,
      preferences.starred,
      say,
      setAppearance,
      setCompact,
      setSetting,
      writePref,
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

  /* round five (gslides-parity SPEC-5 3.5, 15; VERIFICATION-5 finding 7): Enter on a selected audio
     or video block plays it where it stands, through the show's controller mounted over the slide's
     poster roots (`data-src` is the stored file, render/slide.ts), and Enter again pauses it. The
     controller is created on the first press over the slide root in front and torn down with the
     shell; a slide the person left is mounted again on the next press. */
  const editorMedia = useRef<{ controller: MediaController; slideRoot: Element } | null>(null);
  useEffect(
    () => () => {
      editorMedia.current?.controller.destroy();
      editorMedia.current = null;
    },
    [],
  );
  const toggleSelectedMedia = useCallback(
    (blockId: string): boolean => {
      const root = document.querySelector<HTMLElement>(
        `.ts-stage [data-media="${CSS.escape(blockId)}"], .pt-stagewrap [data-media="${CSS.escape(blockId)}"]`,
      );
      const slideRoot = root?.closest<HTMLElement>('[data-slide]') ?? null;
      if (root === null || slideRoot === null) return false;
      let entry = editorMedia.current;
      if (
        entry === null ||
        entry.slideRoot !== slideRoot ||
        !entry.controller.mounted().includes(blockId)
      ) {
        entry?.controller.destroy();
        const controller = createMediaController({
          origin: window.location.origin,
          onSoundOff: () => say(PRESENT_TEXT.soundOff),
        });
        // the controller types the DOM structurally (`RootLike`) so its unit test drives fakes
        controller.mount(slideRoot as unknown as Parameters<MediaController['mount']>[0]);
        entry = { controller, slideRoot };
        editorMedia.current = entry;
      }
      void entry.controller.toggle(blockId);
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
        case 'key.commit':
          if (current.editor?.exitCrop) {
            current.editor.exitCrop();
            return true;
          }
          return false;
        /* round five (SPEC-5 2.1, 3.5, 15; VERIFICATION-5 finding 7): Enter dispatches by focus
           beside the crop mode's Enter (SHARED_CHORDS): a waiting click step of the Motion panel's
           preview continues, the selected media block plays or pauses; each answers false when its
           surface is not in front, so the next binding reads the key */
        case 'key.motion.preview':
          if (motionPreview()?.waiting !== true) return false;
          advanceMotionPreview();
          return true;
        case 'key.media.play': {
          if (current.selection?.text === true) return false;
          const block = selectedBlock(current.document.slides[current.slideId], current.selection);
          if (block === undefined || !hasMediaPlayback(block)) return false;
          return toggleSelectedMedia(block.id);
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
        /* round five (gslides-parity SPEC-5 7.2, 7.7; b5.md R16): the card steps itself while open */
        case 'key.spelling.next':
        case 'key.spelling.previous':
          if (panel !== 'spellCheck') openPanel('spellCheck');
          return true;
        case 'key.table.borderSelection':
          openPanel('formatOptions', { section: 'table' });
          window.setTimeout(() => {
            document
              .querySelector<HTMLElement>('[data-control="formatOptions.table.cell.border.edges"]')
              ?.focus();
          }, 0);
          return true;
        default:
          break;
      }
      return false;
    },
    [
      commentCard?.threadId,
      openCommentCard,
      openDialog,
      openPanel,
      rotateBy,
      say,
      toggleSelectedMedia,
    ],
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
      input: shellInput,
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
  /* gslides-parity SPEC-5 8.2: the selected equation block and the write its toolbar makes (block.set on the block's fields) */
  const equationBlock = (() => {
    const block = selectedBlock(slide, input.selection);
    return block !== undefined && isEquationBlock(block) ? block : undefined;
  })();
  const equationWrite = useMemo<SectionWrite>(
    () => ({
      slideId: input.slideId,
      revision: input.revision,
      dispatch: input.dispatch,
      busy: input.busy === true,
      report: (promise) => {
        promise.catch((error: unknown) =>
          say(error instanceof Error ? error.message : String(error)),
        );
      },
      ...(input.editor === undefined ? {} : { editor: input.editor }),
    }),
    [input.busy, input.dispatch, input.editor, input.revision, input.slideId, say],
  );
  /* SPEC-5 7.4: the word under the selection for the Dictionary panel */
  const selectedWord = (): string | null => {
    if (typeof window === 'undefined') return null;
    const text = window.getSelection()?.toString().trim() ?? '';
    const word = text.split(/\s+/)[0] ?? '';
    return /^[\p{L}\p{M}'’-]{1,64}$/u.test(word) ? word : null;
  };
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
            renderThemed={input.renderThemed}
            commit={input.commit}
            dispatch={input.dispatch}
            revision={input.revision}
            onImportTheme={() => openDialog('importTheme')}
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
              showChanges={effectiveSettings.showChanges === true}
              selected={selectedVersion}
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
      /* round five (gslides-parity SPEC-5 2.1, 4.4, 4.5, 7.2, 7.4, 10; merge 2) */
      case 'motion':
        return (
          <MotionPanel.Component
            document={input.document}
            slideId={input.slideId}
            selection={
              input.selection?.blockIds ??
              (input.selection?.blockId === undefined ? [] : [input.selection.blockId])
            }
            revision={input.revision}
            dispatch={input.dispatch}
            busy={input.busy}
            onNotice={say}
            onSelectBlock={(blockId) => input.onSelectBlock?.(blockId)}
            onClose={closePanel}
          />
        );
      case 'templates':
        return (
          <TemplatesPane.Component
            slideId={input.slideId}
            revision={input.revision}
            dispatch={input.dispatch}
            deck={input.document.deck}
            onClose={closePanel}
            onNotice={say}
            busy={input.busy}
          />
        );
      case 'buildingBlocks':
        return (
          <BuildingBlocksPane.Component
            slideId={input.slideId}
            revision={input.revision}
            dispatch={input.dispatch}
            deck={input.document.deck}
            render={input.renderSlide}
            theme={deckAppearance}
            onClose={closePanel}
            onNotice={say}
            busy={input.busy}
          />
        );
      case 'spellCheck':
        return (
          <SpellCheckPanel.Component
            language={deckLanguageOf(shellInput)}
            revision={input.revision}
            check={async () => {
              const run =
                input.spellingCheck ?? ((request) => input.dispatch('spelling.check', request));
              return (await run({
                language: deckLanguageOf(shellInput),
                notes: true,
                ignore: preferences.spelling.dictionary,
              })) as {
                language: string;
                dictionary?: string | null;
                misspellings: SpellingFinding[];
              };
            }}
            replace={(finding, text, all) =>
              input.dispatch('spelling.replace', {
                slideId: finding.slideId,
                ...(finding.blockId === undefined ? {} : { blockId: finding.blockId }),
                path: finding.path,
                range: finding.range,
                text,
                ...(all ? { all: true } : {}),
                baseRevision: input.revision,
              })
            }
            ignore={(word, all) =>
              input.dispatch('spelling.ignore', { word, ...(all ? { all: true } : {}) })
            }
            addWord={async (word) => {
              await input.dispatch('dictionary.add', { word });
              setPreferences(preferencesOf(inputRef.current));
            }}
            select={(finding) => {
              if (finding.slideId !== input.slideId) shell.select(finding.slideId);
              input.onSelectBlock?.(finding.blockId);
            }}
            onClose={closePanel}
          />
        );
      case 'dictionary':
        return (
          <DictionaryPanel.Component
            language={deckLanguageOf(shellInput)}
            {...(selectedWord() === null ? {} : { initialWord: selectedWord() as string })}
            lookup={(word) =>
              input.dispatch('dictionary.lookup', {
                word,
                language: deckLanguageOf(shellInput),
              }) as Promise<{ word: string; url: string }>
            }
            open={(url) => window.open(url, '_blank', 'noopener')}
            onClose={closePanel}
          />
        );
      case 'chat':
        return (
          <ChatPanel.Component
            list={() => input.dispatch('chat.list', {}) as Promise<{ messages: ChatRow[] }>}
            send={(text) => input.dispatch('chat.send', { text })}
            canSend={
              input.chat?.canSend ??
              ((input.capabilities === undefined || input.capabilities.includes('comment')) &&
                effectiveSettings.mode !== 'viewing')
            }
            participants={input.chat?.participants ?? (input.presence?.others.length ?? 0) + 1}
            {...(input.sync?.tier === undefined ? {} : { tier: input.sync.tier })}
            {...(input.account?.principal.principalId === undefined
              ? {}
              : { selfId: input.account.principal.principalId })}
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
        return <ShortcutsDialog.Component platform={platform} onClose={closeDialog} />;
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
      /* round five (gslides-parity SPEC-5 3.2, 3.7, 5.3, 7.1, 7.2, 7.7; merge 2) */
      case 'insertAudio':
        return <InsertAudioDialog.Component />;
      case 'insertVideo':
        return <InsertVideoDialog.Component />;
      case 'camera':
        return <CameraDialog.Component />;
      case 'displayOptions':
        return (
          <DisplayOptionsDialog.Component
            host={{
              deckId: input.deckId,
              presenterPath: `/present/${encodeURIComponent(input.deckId)}`,
              presenterWindowName: `turboslide-presenter:${input.deckId}`,
              present: () => {
                if (input.present?.start) input.present.start(false);
                else shell.setPresent(true);
              },
            }}
          />
        );
      case 'importTheme':
        return <ImportThemeDialog.Component />;
      case 'importReport':
        return <ImportReportDialog.Component />;
      case 'preferences':
        return (
          <PreferencesDialog.Component {...(dialog.tab === undefined ? {} : { tab: dialog.tab })} />
        );
      case 'personalDictionary':
        return <PersonalDictionaryDialog.Component />;
      case 'editGuides':
        return <GuidesDialog.Component />;
      case 'indentationOptions':
        return <IndentationOptionsDialog.Component />;
      case 'restartNumbering':
        return <RestartNumberingDialog.Component />;
      case 'prefixSuffix':
        return <PrefixSuffixDialog.Component />;
      case 'deleteVersions':
        return (
          <DeleteVersionsDialog.Component
            {...(dialog.upTo === undefined ? {} : { upTo: dialog.upTo })}
          />
        );
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
      <div className="ts-toolbar" role="toolbar" aria-label="Toolbar" data-control="toolbar">
        <ToolbarHead />
        {equationBlock !== undefined ? (
          /* gslides-parity SPEC-5 8.2: Google Docs' equation toolbar in the tail's place while an equation is selected */
          <EquationToolbar
            block={equationBlock}
            write={equationWrite}
            hidden={effectiveSettings.equationToolbar === false}
          />
        ) : (
          <ToolbarTail />
        )}
        {/* SPEC-5 4.4: Google's 2025 sidebar strip, the Templates and Building blocks panes */}
        <SidebarStrip />
      </div>
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
      <BottomBar />
      {/* SPEC-5 7.5: the Verbalize rows' live region, spoken too while Speak aloud is on */}
      <VerbalizeRegion on={preferences.accessibility.screenReader} />
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
