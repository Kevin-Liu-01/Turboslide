import type { ReactNode } from 'react';

import type { Asset } from '@turboslide/schema/assets';
import type { Block, BlockType } from '@turboslide/schema/blocks';
import { applyTableCommand, emptyTable } from '@turboslide/schema/blocks/table';
import type { TableBlock, TableCommand } from '@turboslide/schema/blocks/table';
import { CATALOG } from '@turboslide/schema/catalog';
import type { Deck, DeckDocument, Slide, SlotName } from '@turboslide/schema/deck';
import { deckAppearance, sectionOfSlide, slideBlocks, slideOrder } from '@turboslide/schema/deck';
import type { Finding } from '@turboslide/schema/findings';
import type { BlockId } from '@turboslide/schema/ids';
import type { LayoutId } from '@turboslide/schema/layouts';
import { derivedLayout, isLayoutId } from '@turboslide/schema/layouts';
import type { Lease, Mutation, Version } from '@turboslide/schema/mutations';
import { splitParagraphs } from '@turboslide/schema/text';
import { TYPE_LADDER, TYPE_LEADING } from '@turboslide/schema/typography';
import type { Theme } from '@turboslide/viewer/theme';

import type { SlideRenderer } from './LayoutGrid';

import type { EditorDispatch } from './dispatch';
import type { DitherWorkerLike } from './inspector/dither';
import type { ControlContext } from './inspector/props';
import type { ArtifactRun, ExportDownload } from './ExportReportCard';
import type { ExportCapabilities, ExportProgress } from './ExportMenu';
import type { BlockFamily, MenuActionId, MenuContext, MenuItem, MenuSetting } from './menus/model';
import { DEFAULT_MENU_CONTEXT } from './menus/model';
import { SNACKBARS } from './menus/strings';
import type { TailKind } from './menus/toolbar-tails';
import { defaultPosition, freeBlockId, insertionSlot, isFreeform } from './palette-data';
import type { PaletteEntry } from './palette-data';
import type { SaveState } from './StatusChip';

/**
 * The editor shell's contract with the studio route (gslides-parity SPEC 1, 2, 3, 6, 12): what
 * `apps/studio/src/routes/edit.$deckId.tsx` passes ViewerShell as its `editor` prop so the title
 * row, the menu bar, the toolbar and the panels can read the document and write through the one
 * dispatcher, and the pure helpers that turn a menu item into an action input, a selection into a
 * toolbar tail and the editor's facts into a `MenuContext`. Every field beyond the document, the
 * dispatcher and the revision is optional with a stated default, so the route wires the shell in
 * steps and the shell still renders every row with the fields it has. Pure apart from the
 * types: no React, no DOM, so `editor-shell.test.ts` runs in Node.
 */

/** What is selected on the canvas, in the shell's own words (the route maps its Selection to it). */
export type EditorSelection = {
  /** the selected block, or the block whose run holds the caret */
  blockId?: string;
  /** several selected blocks on a freeform slide; `[blockId]` when absent */
  blockIds?: readonly string[];
  /** the caret is in a run of the block */
  text?: boolean;
  /** the table cell the caret is in */
  cell?: { row: number; column: number };
  /** the caret is in a list item (a plain block) */
  listItem?: boolean;
};

export type EditorClipboardKind = MenuContext['clipboard'];

/** The clipboard the canvas and the filmstrip own (SPEC 2.2); every handler optional. */
export type EditorClipboard = {
  kind?: EditorClipboardKind;
  cut?: () => void;
  copy?: () => void;
  paste?: () => void;
  pasteWithoutFormatting?: () => void;
  delete?: () => void;
  selectAll?: () => void;
};

export type EditorSaveState = {
  state: SaveState;
  /** the draft at /new before the first edit reads Not saved yet (SPEC 2.0) */
  draft?: boolean;
  /** ISO time of the last committed write, for the Last edit clock */
  lastEditAt?: string;
  /** the author of the last write, shown only when it is not the default `studio` */
  lastEditBy?: string;
};

export type EditorHistory = {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
};

/** The view toggles Tools > Advanced and View flip in the route (the URL search carries them today). */
export type EditorToggles = {
  /** View > Mode > Viewing: read only (?edit=0) */
  viewing?: boolean;
  onViewing?: (viewing: boolean) => void;
  /** Tools > Advanced > Light and dark side by side (the twin stage) */
  sideBySide?: boolean;
  onSideBySide?: (on: boolean) => void;
  /** Tools > Advanced > Show source (the source drawer) */
  source?: boolean;
  onSource?: (on: boolean) => void;
  /** Tools > Advanced > Show suggestion marks on the slide (the lint overlay) */
  suggestionMarks?: boolean;
  onSuggestionMarks?: (on: boolean) => void;
};

/** The Download dialog's run (SPEC 6.7): export.run through the dispatcher unless the route intercepts. */
export type EditorExport = {
  capabilities?: ExportCapabilities | null;
  progress?: ExportProgress | null;
  /** the last finished run, for the Details link */
  run?: ArtifactRun | null;
  onDownload?: (run: ArtifactRun, file: ExportDownload) => void;
  onClearRun?: () => void;
  /** the Details link of the finished Download dialog: shows the report card */
  onShowReport?: () => void;
};

/** A row of the Open and Import slides dialogs: `deck.list`'s head. */
export type DeckHeadRow = {
  id: string;
  title: string;
  slides: number;
  sections: number;
  revision: number;
  updatedAt: string;
  createdAt: string;
  trashedAt?: string;
};

/** What Import slides shows for a source deck: its slides in order with titles. */
export type SourceDeckSlides = {
  id: string;
  title: string;
  slides: ReadonlyArray<{ id: string; title: string; n: number }>;
};

export type EditorShellInput = {
  deckId: string;
  document: DeckDocument;
  /** the current slide; the shell's active item follows it */
  slideId: string;
  /** the filmstrip's multi-selection; `[slideId]` when absent */
  selectedSlideIds?: readonly string[];
  selection?: EditorSelection | null;
  /** which region has focus, for Cut, Copy, Delete and Duplicate */
  focus?: MenuContext['focus'];
  revision: number;
  dispatch: EditorDispatch;
  /**
   * One write of arbitrary mutations with a history entry (the editor's commit): the Themes
   * panel's `deck.set /defaults/appearance`, Slide numbers' `/defaults/counter` and Clear
   * formatting use it. Without it those controls dispatch what they can and say what they cannot.
   */
  commit?: (mutations: Mutation[], label: string) => Promise<unknown>;
  history?: EditorHistory;
  save?: EditorSaveState;
  clipboard?: EditorClipboard;
  toggles?: EditorToggles;
  /** the current slide's findings, for Check slides; every finding when the route passes them */
  findings?: ReadonlyArray<Finding>;
  versions?: ReadonlyArray<Version>;
  /** the undo stack as Version rows, for Change history */
  historyEntries?: ReadonlyArray<Version>;
  leases?: ReadonlyArray<Lease>;
  onUndoTo?: (entry: Version) => void;
  onSelectBlock?: (blockId: string | undefined) => void;
  lintText?: ControlContext['lintText'];
  assetUrl?: (path: string) => string;
  createDitherWorker?: () => DitherWorkerLike;
  /** a write is in flight: the Format options controls take no input */
  busy?: boolean;
  /**
   * Renders a slide of this deck to HTML in a theme with the live prompts (the layout grid's
   * tiles, the Themes panel's thumbnails); the route passes renderSlide because the chrome package
   * does not depend on @turboslide/render
   */
  renderSlide?: SlideRenderer;
  /** the full palette's entries (Tools > Advanced > Run an action…) */
  paletteEntries?: ReadonlyArray<PaletteEntry>;
  /** a line for the snackbar */
  onNotice?: (message: string) => void;
  /** the notes pane (B4's NotesPane), drawn under the canvas while View > Show speaker notes is on */
  notes?: ReactNode;
  /** the source drawer, over the stage, while Tools > Advanced > Show source is on */
  drawer?: ReactNode;
  export?: EditorExport;
  /** deck.list, for Open and Import slides; the dispatcher's `deck.list` when absent */
  listDecks?: () => Promise<ReadonlyArray<DeckHeadRow>>;
  /** another deck's slides, for Import slides step 2 */
  readDeck?: (deckId: string) => Promise<SourceDeckSlides>;
  /** the Upload tab of Open and Import slides: a Turboslide bundle (.zip) */
  uploadBundle?: (file: File) => Promise<{ id: string }>;
  /** Insert > Image > Upload from computer and Replace image: the OS file picker then asset.add */
  uploadPicture?: (target: PictureTarget) => void;
  /** the origin the share links carry; window.location.origin when absent */
  origin?: string;
  /** TURBOSLIDE_TOKEN is set on the deployment (Agent access) */
  tokenRequired?: boolean;
  /** Insert > Link: the canvas link popover (B4); a dialog when absent */
  onLink?: () => void;
  /** Paint format: arm the gesture (B4); a snackbar when absent */
  onPaintFormat?: () => void;
  /** the draw tools (B4): Text box, Shape and Line; block.insert into the current slot when absent */
  onDrawTool?: (tool: DrawTool) => void;
  /** Slideshow (B6): from the current slide, from the beginning, or Presenter view */
  present?: {
    start?: (fromBeginning: boolean) => void;
    presenterView?: () => void;
  };
  /** navigation; window.location and window.open when absent */
  navigate?: (path: string, newTab?: boolean) => void;
  /** the deck.trash snackbar's Undo restored the deck (the route re-enables the editor) */
  onTrashed?: () => void;
};

export type DrawTool =
  | { kind: 'text' }
  | { kind: 'shape'; shape: 'rectangle' | 'rounded' | 'ellipse' | 'arrow' | 'line' }
  | { kind: 'rule' };

/** Where a picked picture lands: a new shot block, the selected block's asset, or the slide's picture. */
export type PictureTarget =
  | { kind: 'insert'; slideId: string }
  | { kind: 'block'; slideId: string; blockId: string; path: string }
  | { kind: 'slide'; slideId: string; path: '/picture/asset' };

// ---------------------------------------------------------------------------------------------
// Panels and dialogs

export const PANEL_IDS = [
  'themes',
  'formatOptions',
  'versionHistory',
  'checkSlides',
  'changeHistory',
  'picturesMaterials',
] as const;
export type PanelId = (typeof PANEL_IDS)[number];

/** The panel a `panel` effect's title names (menus/model.ts). */
export function panelIdOfTitle(title: string): PanelId | null {
  switch (title) {
    case 'Themes':
      return 'themes';
    case 'Format options':
      return 'formatOptions';
    case 'Version history':
      return 'versionHistory';
    case 'Suggestions for this slide':
      return 'checkSlides';
    case 'Change history':
      return 'changeHistory';
    case 'Pictures and materials':
      return 'picturesMaterials';
    default:
      return null;
  }
}

export const DIALOG_IDS = [
  'open',
  'importSlides',
  'makeCopy',
  'share',
  'publish',
  'download',
  'downloadPdf',
  'slideNumbers',
  'details',
  'findReplace',
  'nameVersion',
  'agentAccess',
  'help',
  'keyboardShortcuts',
  'imageByUrl',
  'fromThisPresentation',
  'link',
  /* the Insert pickers (SPEC 2.4): the table size grid, the symbol picker, the material list */
  'insertTable',
  'insertIcon',
  'insertMaterial',
] as const;
export type DialogId = (typeof DIALOG_IDS)[number];

/** The dialog a `dialog` effect's title names; the item id tells the two Download rows apart. */
export function dialogIdOf(title: string, itemId?: string): DialogId | null {
  switch (title) {
    case 'Open':
      return 'open';
    case 'Import slides':
      return 'importSlides';
    case 'Make a copy':
      return 'makeCopy';
    case 'Share':
      return 'share';
    case 'Publish to the web':
      return 'publish';
    case 'Download':
      return itemId === 'file.download.pdf' ? 'downloadPdf' : 'download';
    case 'Slide numbers':
      return 'slideNumbers';
    case 'Details':
      return 'details';
    case 'Find and replace':
      return 'findReplace';
    case 'Name current version':
      return 'nameVersion';
    case 'Agent access':
      return 'agentAccess';
    case 'Help':
      return 'help';
    case 'Keyboard shortcuts':
      return 'keyboardShortcuts';
    case 'Image by URL':
      return 'imageByUrl';
    case 'Pictures in this presentation':
      return 'fromThisPresentation';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------
// The selection's family and the toolbar tail

const TEXT_TYPES: ReadonlySet<string> = new Set(['heading', 'paragraph', 'text', 'box']);
const PICTURE_TYPES: ReadonlySet<string> = new Set(['shot', 'pair', 'tiles', 'details']);

/** The menu model's family of a block (SPEC 3.2 to 3.8). */
export function blockFamily(block: Block): BlockFamily {
  if (TEXT_TYPES.has(block.type)) return 'text';
  if (block.type === 'shape')
    return block.shape === 'line' || block.shape === 'arrow' ? 'line' : 'shape';
  if (block.type === 'rule') return 'line';
  if (block.type === 'shot') return 'image';
  if (block.type === 'table') return 'table';
  return 'other';
}

/** The block a selection names on a slide, or undefined. */
export function selectedBlock(
  slide: Slide | undefined,
  selection: EditorSelection | null | undefined,
): Block | undefined {
  if (!slide || !selection?.blockId) return undefined;
  return slideBlocks(slide).find(({ block }) => block.id === selection.blockId)?.block;
}

/** Which tail the toolbar draws (SPEC 3.2 to 3.8). */
export function tailKindOf(
  slide: Slide | undefined,
  selection: EditorSelection | null | undefined,
): TailKind {
  const block = selectedBlock(slide, selection);
  if (block === undefined) return selection?.text ? 'text' : 'default';
  if (block.type === 'table')
    return selection?.cell !== undefined || selection?.text ? 'table' : 'other';
  const family = blockFamily(block);
  if (family === 'text') return 'text';
  if (family === 'shape') return 'shape';
  if (family === 'image') return 'image';
  if (family === 'line') return 'line';
  return 'other';
}

// ---------------------------------------------------------------------------------------------
// The MenuContext

export type ShellSettings = Readonly<Partial<Record<MenuSetting, boolean | string>>>;

const PICTURE_KINDS: ReadonlySet<string> = new Set(['opener', 'mood', 'closing']);

/** The context the menus evaluate their predicates over, from the editor's facts and the shell's settings. */
export function buildMenuContext(
  input: Pick<
    EditorShellInput,
    'document' | 'slideId' | 'selectedSlideIds' | 'selection' | 'focus' | 'history' | 'clipboard'
  >,
  settings: ShellSettings,
  platform: MenuContext['platform'],
): MenuContext {
  const order = slideOrder(input.document.deck);
  const slide = input.document.slides[input.slideId];
  const index = order.indexOf(input.slideId);
  const block = selectedBlock(slide, input.selection);
  const blocks = input.selection?.blockIds?.length ?? (block === undefined ? 0 : 1);
  const freeform = slide?.kind === 'content' && slide.layout.type === 'freeform';
  const placed = slide === undefined ? [] : slideBlocks(slide);
  const z = block?.pos?.z;
  const zs = placed
    .map(({ block: each }) => each.pos?.z)
    .filter((v): v is number => v !== undefined);
  const top = zs.length > 0 ? Math.max(...zs) : 0;
  const bottom = zs.length > 0 ? Math.min(...zs) : 0;
  /* SPEC 4.3: on a freeform slide Order moves the paint order, so the rows read from z; on a
     grammar slide it moves the block one place within its slot (block.move, the write the stage
     makes for Cmd Up and Cmd Down), so the rows read from the block's place there: forward and
     front when it is not first, backward and back when it is not last. A plate (opener, mood,
     closing) has no slot to move within (VERIFICATION.md finding 2). */
  const canOrderZ = freeform && block !== undefined && placed.length > 1;
  const held =
    !freeform && slide !== undefined && block !== undefined ? slotOf(slide, block.id) : undefined;
  const at = held === undefined ? -1 : held.blocks.findIndex((each) => each.id === block?.id);
  const canOrderSlot = held !== undefined && held.blocks.length > 1 && at >= 0;
  const earlier = freeform ? canOrderZ && z !== undefined && z < top : canOrderSlot && at > 0;
  const later = freeform
    ? canOrderZ && z !== undefined && z > bottom
    : canOrderSlot && held !== undefined && at < held.blocks.length - 1;
  const family = block === undefined ? undefined : blockFamily(block);
  const selection: MenuContext['selection'] = {
    blocks,
    ...(family === undefined ? {} : { block: family }),
    box: block?.type === 'box',
    picture: block !== undefined && PICTURE_TYPES.has(block.type),
    textBlock:
      (block !== undefined && TEXT_TYPES.has(block.type)) ||
      input.selection?.text === true ||
      block?.type === 'table',
    listItem: input.selection?.listItem === true || block?.type === 'plain',
    tableCell:
      block?.type === 'table' &&
      (input.selection?.cell !== undefined || input.selection?.text === true),
    linked: block?.link !== undefined,
    order: { forward: earlier, front: earlier, backward: later, back: later },
  };
  const focus: MenuContext['focus'] =
    input.focus ?? (input.selection?.text ? 'text' : blocks > 0 ? 'canvas' : 'none');
  /* the slide's place comes from the manifest, so a shell that has the deck but not the slide
     bodies (the bridge of ViewerShell.tsx) still knows there is a slide to act on */
  return {
    platform,
    focus,
    slide:
      index < 0 && slide === undefined
        ? null
        : {
            index: Math.max(0, index),
            count: order.length,
            skipped: slide?.skip === true,
            freeform,
            pictureLayout: slide !== undefined && PICTURE_KINDS.has(slide.kind),
          },
    selectedSlides: input.selectedSlideIds?.length ?? (slide === undefined ? 0 : 1),
    selection,
    clipboard: input.clipboard?.kind ?? 'empty',
    history: { undo: input.history?.canUndo ?? false, redo: input.history?.canRedo ?? false },
    sections: input.document.deck.sections.length,
    settings: { ...DEFAULT_MENU_CONTEXT.settings, ...settings },
  };
}

// ---------------------------------------------------------------------------------------------
// Menu items to action inputs

/** What a menu item's `action` effect dispatches: the action id, its input, the history label. */
export type ActionPlan = {
  action: MenuActionId;
  input: Record<string, unknown>;
  label: string;
  /** the slide to select after the write (New slide, Duplicate) */
  selectSlide?: 'result' | string;
  /** the sentence for the snackbar after the write; the Undo action follows when `undo` is set */
  snackbar?: string;
  undo?: true;
};

/** A plan that cannot be built from the current selection: the sentence the snackbar shows. */
export type ActionRefusal = { refused: string };

export type ActionFacts = {
  document: DeckDocument;
  slideId: string;
  selectedSlideIds: readonly string[];
  selection: EditorSelection | null | undefined;
  revision: number;
  /** the last layout picked for New slide in this browser (SPEC 5.3) */
  lastLayout?: LayoutId | null;
};

const SELECT_TEXT = 'Select a text block first';
const SELECT_BLOCK = 'Select a block first';
const SELECT_CELL = 'Click a table cell first';

function currentSlide(facts: ActionFacts): Slide | undefined {
  return facts.document.slides[facts.slideId];
}

/** The slot of a grammar slide that holds `blockId`, with its blocks in order; undefined on a plate or a freeform slide. */
function slotOf(slide: Slide, blockId: string): { slot: SlotName; blocks: Block[] } | undefined {
  if (slide.kind !== 'content' || slide.layout.type === 'freeform') return undefined;
  for (const [slot, blocks] of Object.entries(slide.slots)) {
    if (blocks?.some((each) => each.id === blockId))
      return { slot: slot as SlotName, blocks: blocks ?? [] };
  }
  return undefined;
}

/** The facts `menuActionPlan` reads, from the shell's input (the dialogs build their plans the same way). */
export function factsOf(input: EditorShellInput, lastLayout: LayoutId | null = null): ActionFacts {
  return {
    document: input.document,
    slideId: input.slideId,
    selectedSlideIds: input.selectedSlideIds ?? [input.slideId],
    selection: input.selection,
    revision: input.revision,
    lastLayout,
  };
}

// ---------------------------------------------------------------------------------------------
// The Insert menu (SPEC 2.4): what a row does before its write

/** The picker an Insert row opens before its block.insert: the table size grid, the symbols, the materials. */
export type InsertPicker = 'table' | 'icon' | 'material';

/**
 * What an Insert row does before any write (SPEC 2.4, 3.1): Text box, the shapes and the lines
 * arm a draw tool (a click places, a drag draws); Table, Icon and Material open a picker; Upload
 * from computer opens the OS file picker. Null for a row that plans an action outright.
 */
export type InsertIntent =
  { kind: 'tool'; tool: DrawTool } | { kind: 'picker'; picker: InsertPicker } | { kind: 'upload' };

const DRAW_TOOL_OF: Readonly<Record<string, DrawTool>> = {
  'insert.textBox': { kind: 'text' },
  'insert.shape.shapes.rectangle': { kind: 'shape', shape: 'rectangle' },
  'insert.shape.shapes.rounded': { kind: 'shape', shape: 'rounded' },
  'insert.shape.shapes.ellipse': { kind: 'shape', shape: 'ellipse' },
  'insert.shape.arrows.arrow': { kind: 'shape', shape: 'arrow' },
  'insert.line.line': { kind: 'shape', shape: 'line' },
  'insert.line.arrow': { kind: 'shape', shape: 'arrow' },
  'insert.line.rule': { kind: 'rule' },
};

const PICKER_OF: Readonly<Record<string, InsertPicker>> = {
  'insert.table': 'table',
  'insert.icon': 'icon',
  'insert.material': 'material',
};

export function insertIntentOf(item: Pick<MenuItem, 'id' | 'effect'>): InsertIntent | null {
  const tool = DRAW_TOOL_OF[item.id];
  if (tool !== undefined) return { kind: 'tool', tool };
  const picker = PICKER_OF[item.id];
  if (picker !== undefined) return { kind: 'picker', picker };
  if (item.effect?.kind === 'action' && item.effect.id === 'asset.add') return { kind: 'upload' };
  return null;
}

/** The block type a draw tool inserts (Gestures.tsx toolBlockType, repeated here so the shell stays pure). */
export function drawToolBlockType(tool: DrawTool): BlockType {
  if (tool.kind === 'text') return 'text';
  if (tool.kind === 'rule') return 'rule';
  return 'shape';
}

/**
 * The block a draw tool places when its row runs without a canvas to draw on (Gestures.tsx
 * toolBlock builds the same block for a click on the sheet): an empty text box, a shape, a line
 * or an arrow, or a rule.
 */
export function drawToolBlock(tool: DrawTool, id: BlockId): Block {
  if (tool.kind === 'text') return { id, type: 'text', text: '' };
  if (tool.kind === 'rule') return { id, type: 'rule', orientation: 'horizontal' };
  return { id, type: 'shape', shape: tool.shape };
}

/**
 * Where a picked picture lands for an Upload from computer, By URL or From this presentation row
 * (SPEC 2.4, 2.5, 2.6): Replace image writes the selected block's asset, Change background the
 * slide's picture, and Insert > Image a new shot block on the current slide.
 */
export function pictureTargetOf(
  itemId: string,
  slideId: string,
  blockId: string | undefined,
): PictureTarget {
  if (itemId.startsWith('format.image.replaceImage') && blockId !== undefined)
    return { kind: 'block', slideId, blockId, path: '/asset' };
  if (itemId.startsWith('slide.changeBackground'))
    return { kind: 'slide', slideId, path: '/picture/asset' };
  return { kind: 'insert', slideId };
}

/**
 * One block.insert of a made block into the current slide (SPEC 2.4): after the selected block in
 * its slot, else into the layout's first filled slot or its first slot; with a position box on a
 * freeform slide (palette-data.ts rules; a table takes 960 by 320). Refuses with the sentence
 * naming the layouts that take blocks when the slide has no slot (a Title slide, a Statement) or
 * when the slot does not take the block (a shape on a picture layout's plate).
 */
export function insertBlockPlan(
  facts: ActionFacts,
  type: BlockType,
  make: (id: BlockId) => Block,
  label: string,
): ActionPlan | ActionRefusal {
  const slide = currentSlide(facts);
  if (slide === undefined) return { refused: 'No slide to insert into' };
  const selected = facts.selection?.blockId;
  const slot = insertionSlot(slide, selected);
  if (slot === null) return { refused: SNACKBARS.needsBody(label) };
  const place = slot === 'plate' ? 'plate' : 'content';
  if (!CATALOG[type].allowedIn.includes(place)) return { refused: SNACKBARS.needsBody(label) };
  const id = freeBlockId(slide, type);
  const made = make(id);
  const block: Block = isFreeform(slide)
    ? ({ ...made, pos: defaultPosition(slide, type, selected) } as Block)
    : made;
  /* after the selected block only when it sits in the slot the block lands in */
  const after =
    selected !== undefined &&
    slideBlocks(slide).some(
      ({ block: each, slot: eachSlot }) => each.id === selected && eachSlot === slot,
    )
      ? selected
      : undefined;
  return {
    action: 'block.insert',
    input: {
      slideId: facts.slideId,
      slot,
      ...(after === undefined ? {} : { after }),
      block,
      baseRevision: facts.revision,
    },
    label,
  };
}

/** The default table the Table row inserts when its grid is not on hand: 3 columns by 3 rows with a header row. */
export const DEFAULT_TABLE_SIZE = { columns: 3, rows: 3 } as const;

function block(facts: ActionFacts): Block | undefined {
  return selectedBlock(currentSlide(facts), facts.selection);
}

function blockSet(
  facts: ActionFacts,
  blockId: string,
  path: string,
  value: unknown,
  label: string,
): ActionPlan {
  return {
    action: 'block.set',
    input: {
      slideId: facts.slideId,
      blockId,
      path,
      ...(value === undefined ? {} : { value }),
      baseRevision: facts.revision,
    },
    label,
  };
}

function typographyOf(target: Block): Record<string, unknown> {
  return 'typography' in target &&
    typeof target.typography === 'object' &&
    target.typography !== null
    ? { ...(target.typography as Record<string, unknown>) }
    : {};
}

/** The block's current size: its typography override, else the ladder step its role implies. */
function currentSize(target: Block): number {
  const typography = typographyOf(target);
  if (typeof typography.size === 'number') return typography.size;
  if (target.type === 'heading') {
    if (target.level === 'big') return 88;
    if (target.level === 'h1' || target.level === 'title') return 58;
    return 34;
  }
  if (target.type === 'paragraph')
    return target.role === 'lead' ? 26 : target.role === 'cap' ? 17 : 20;
  if (target.type === 'table') return (target as TableBlock).size ?? 20;
  return 20;
}

/** The next ladder step: larger sizes come first in TYPE_LADDER, so `up` walks towards the head. */
export function stepLadder(size: number, direction: 1 | -1): number {
  const ladder = [...TYPE_LADDER].sort((a, b) => a - b);
  const at = ladder.findIndex((step) => step >= size);
  const index = at < 0 ? ladder.length - 1 : at;
  const next = ladder[Math.max(0, Math.min(ladder.length - 1, index + direction))];
  return next ?? size;
}

/** Google's spacing names on the theme's leading steps (SPEC 2.5). */
export const SPACING_STEPS: ReadonlyArray<{ label: string; leading: number }> = [
  { label: 'Single', leading: TYPE_LEADING[0] },
  { label: '1.15', leading: 1.2 },
  { label: '1.5', leading: 1.5 },
  { label: 'Double', leading: TYPE_LEADING[TYPE_LEADING.length - 1] ?? 1.7 },
];

/** The list block a paragraph or text block becomes under Bulleted list (SPEC 0.11, 2.5). */
export function listFrom(target: Block, numbered: boolean): Block | null {
  if (target.type === 'plain') {
    const next = { ...target } as Block & { numbered?: true };
    if (numbered) next.numbered = true;
    else delete next.numbered;
    return next;
  }
  if (target.type !== 'paragraph' && target.type !== 'text' && target.type !== 'box') return null;
  const text = typeof target.text === 'string' ? target.text : '';
  const items = splitParagraphs(text)
    .filter((paragraph) => paragraph.trim() !== '')
    .map((paragraph) => ({ text: paragraph }));
  const plain: Block = {
    id: target.id,
    type: 'plain',
    items: items.length > 0 ? items : [{ text: '' }],
    ...(numbered ? { numbered: true } : {}),
    ...(target.pos === undefined ? {} : { pos: target.pos }),
  } as Block;
  return plain;
}

/** The table command a Format > Table item names, at the selected cell. */
export function tableCommandOf(
  itemId: string,
  cell: { row: number; column: number },
): TableCommand | null {
  switch (itemId) {
    case 'format.table.insertRowAbove':
      return { kind: 'insertRowAbove', row: cell.row };
    case 'format.table.insertRowBelow':
      return { kind: 'insertRowBelow', row: cell.row };
    case 'format.table.insertColumnLeft':
      return { kind: 'insertColumnLeft', column: cell.column };
    case 'format.table.insertColumnRight':
      return { kind: 'insertColumnRight', column: cell.column };
    case 'format.table.deleteRow':
      return { kind: 'deleteRow', row: cell.row };
    case 'format.table.deleteColumn':
      return { kind: 'deleteColumn', column: cell.column };
    case 'format.table.deleteTable':
      return { kind: 'deleteTable' };
    case 'format.table.distributeRows':
      return { kind: 'distributeRows' };
    case 'format.table.distributeColumns':
      return { kind: 'distributeColumns' };
    default:
      return null;
  }
}

const ALIGN_OF: Readonly<Record<string, 'left' | 'center' | 'right'>> = {
  'format.alignIndent.left': 'left',
  'format.alignIndent.center': 'center',
  'format.alignIndent.right': 'right',
};

const SPACING_OF: Readonly<Record<string, number>> = {
  'format.spacing.single': SPACING_STEPS[0]?.leading ?? 1.02,
  'format.spacing.1_15': 1.2,
  'format.spacing.1_5': 1.5,
  'format.spacing.double': SPACING_STEPS[3]?.leading ?? 1.7,
};

/** The overrides Clear formatting removes (SPEC 2.5), one block.set each in one slide.update. */
export const FORMAT_OVERRIDE_PATHS: ReadonlyArray<string> = [
  '/typography',
  '/color',
  '/fill',
  '/stroke',
  '/strokeWidth',
];

/**
 * The action a `now` item with an `action` effect dispatches, given the editor's facts. Items whose
 * effect names the action outright (slide.new, slide.duplicate, ...) get their input built from
 * the current slide and selection; Format items that all name `block.set` are told apart by id.
 * Returns a refusal sentence when the selection does not carry what the item needs.
 */
export function menuActionPlan(item: MenuItem, facts: ActionFacts): ActionPlan | ActionRefusal {
  const effect = item.effect;
  if (effect === undefined) return { refused: `${item.label} has no action` };
  /* a client item (Edit > Duplicate) plans an action too once its case below builds one; only
     the fall through at the end needs the effect to name an action outright */
  const rev = { baseRevision: facts.revision };
  const slide = currentSlide(facts);
  const slideIds =
    facts.selectedSlideIds.length > 0 ? [...facts.selectedSlideIds] : [facts.slideId];
  const section =
    slide === undefined ? undefined : sectionOfSlide(facts.document.deck, facts.slideId);
  const target = block(facts);

  switch (item.id) {
    case 'insert.newSlide':
    case 'slide.newSlide': {
      const layout: LayoutId =
        facts.lastLayout ??
        (slide === undefined ? 'split' : slide.kind === 'title' ? 'split' : derivedLayout(slide));
      return {
        action: 'slide.new',
        input: {
          layout,
          ...(slide === undefined ? {} : { after: facts.slideId }),
          ...(section === undefined ? {} : { sectionId: section.id }),
          ...rev,
        },
        label: 'New slide',
        selectSlide: 'result',
      };
    }
    case 'slide.duplicateSlide':
      return {
        action: 'slide.duplicate',
        input: { slideIds, ...rev },
        label: 'Duplicate slide',
        selectSlide: 'result',
      };
    case 'slide.deleteSlide':
      return {
        action: 'slide.remove',
        input: { slideId: facts.slideId, ...rev },
        label: 'Delete slide',
        snackbar: 'Slide deleted',
        undo: true,
      };
    case 'slide.skipSlide': {
      const skip = !(slide?.skip === true);
      return {
        action: 'slide.skip',
        input: { slideIds, skip, ...rev },
        label: skip ? 'Skip slide' : 'Unskip slide',
        ...(skip && slideIds.length > 1
          ? { snackbar: `Skipped ${slideIds.length} slides`, undo: true }
          : {}),
      };
    }
    case 'slide.moveSlide.up':
    case 'slide.moveSlide.down':
    case 'slide.moveSlide.toBeginning':
    case 'slide.moveSlide.toEnd': {
      if (section === undefined) return { refused: 'No slide to move' };
      const order = slideOrder(facts.document.deck);
      const at = order.indexOf(facts.slideId);
      const others = order.filter((id) => id !== facts.slideId);
      let after: string | undefined;
      let sectionId = section.id;
      if (item.id === 'slide.moveSlide.up') {
        if (at <= 0) return { refused: 'The slide is first' };
        after = at >= 2 ? others[at - 2] : undefined;
        const prev = order[at - 1];
        sectionId =
          (prev === undefined ? undefined : sectionOfSlide(facts.document.deck, prev)?.id) ??
          sectionId;
      } else if (item.id === 'slide.moveSlide.down') {
        if (at >= order.length - 1) return { refused: 'The slide is last' };
        after = others[at];
        const next = order[at + 1];
        sectionId =
          (next === undefined ? undefined : sectionOfSlide(facts.document.deck, next)?.id) ??
          sectionId;
      } else if (item.id === 'slide.moveSlide.toBeginning') {
        const first = facts.document.deck.sections[0];
        sectionId = first?.id ?? sectionId;
        after = undefined;
      } else {
        const last = facts.document.deck.sections[facts.document.deck.sections.length - 1];
        sectionId = last?.id ?? sectionId;
        after = others[others.length - 1];
      }
      return {
        action: 'slide.move',
        input: {
          slideId: facts.slideId,
          sectionId,
          ...(after === undefined ? {} : { after }),
          ...rev,
        },
        label: item.label,
      };
    }
    case 'slide.applyLayout':
      return { refused: 'Pick a layout in the grid' };
    /* the Insert rows (SPEC 2.4): the shell arms the draw tool or opens the picker first
       (insertIntentOf); this is the write when no canvas or picker is on hand */
    case 'insert.textBox':
    case 'insert.shape.shapes.rectangle':
    case 'insert.shape.shapes.rounded':
    case 'insert.shape.shapes.ellipse':
    case 'insert.shape.arrows.arrow':
    case 'insert.line.line':
    case 'insert.line.arrow':
    case 'insert.line.rule': {
      const tool = DRAW_TOOL_OF[item.id];
      if (tool === undefined) break;
      return insertBlockPlan(
        facts,
        drawToolBlockType(tool),
        (id) => drawToolBlock(tool, id),
        item.label,
      );
    }
    case 'insert.table':
      return insertBlockPlan(
        facts,
        'table',
        (id) => emptyTable(id, DEFAULT_TABLE_SIZE.columns, DEFAULT_TABLE_SIZE.rows),
        item.label,
      );
    case 'insert.icon':
      return insertBlockPlan(facts, 'icon', (id) => CATALOG.icon.make(id), item.label);
    case 'insert.material':
      return insertBlockPlan(facts, 'material', (id) => CATALOG.material.make(id), item.label);
    case 'edit.duplicate':
      if (target !== undefined)
        return {
          action: 'block.duplicate',
          input: {
            slideId: facts.slideId,
            blockIds: facts.selection?.blockIds ?? [target.id],
            ...rev,
          },
          label: 'Duplicate',
        };
      return {
        action: 'slide.duplicate',
        input: { slideIds, ...rev },
        label: 'Duplicate slide',
        selectSlide: 'result',
      };
    case 'file.moveToTrash':
      return {
        action: 'deck.trash',
        input: { id: facts.document.deck.id, ...rev },
        label: 'Move to trash',
        snackbar: 'Moved to trash',
        undo: true,
      };
    case 'file.download.txt':
      return { action: 'export.text', input: {}, label: 'Plain text' };
    case 'file.download.jpg':
      return {
        action: 'render.slide',
        input: { slideIds: [facts.slideId], scale: 2, format: 'jpg' },
        label: 'JPEG image',
      };
    case 'file.download.png':
      return {
        action: 'render.slide',
        input: { slideIds: [facts.slideId], scale: 2 },
        label: 'PNG image',
      };
    case 'tools.advanced.renderSlide':
      return {
        action: 'render.slide',
        input: { slideIds: [facts.slideId] },
        label: 'Render this slide',
      };
    case 'file.download.html':
      return {
        action: 'build.run',
        input: { out: `.turboslide/${facts.document.deck.id}.html`, budgetMB: 16 },
        label: 'Web page',
      };
    case 'file.download.zip':
      return {
        action: 'deck.pack',
        input: { id: facts.document.deck.id },
        label: 'Turboslide bundle',
      };
    case 'view.zoom.fit':
    case 'view.zoom.50':
    case 'view.zoom.100':
    case 'view.zoom.200': {
      const zoom = effect.kind === 'action' ? (effect.input?.zoom as number | 'fit') : 'fit';
      return {
        action: 'view.zoom',
        input: { zoom: zoom === 'fit' ? 'fit' : zoom / 100 },
        label: item.label,
      };
    }
    case 'arrange.order.bringToFront':
    case 'arrange.order.bringForward':
    case 'arrange.order.sendBackward':
    case 'arrange.order.sendToBack': {
      if (target === undefined) return { refused: SELECT_BLOCK };
      const move = effect.kind === 'action' ? (effect.input?.to as string) : 'forward';
      /* SPEC 4.3: one place within the slot on a grammar slide, the block.move the stage writes for
         Cmd Up and Cmd Down (Editor.tsx orderBlock); the paint order on a freeform slide */
      const held = slide === undefined ? undefined : slotOf(slide, target.id);
      if (held !== undefined) {
        const at = held.blocks.findIndex((each) => each.id === target.id);
        const others = held.blocks.filter((each) => each.id !== target.id);
        if (others.length === 0) return { refused: 'The block is alone in its place' };
        if ((move === 'forward' || move === 'front') && at === 0)
          return { refused: 'The block is already first' };
        if ((move === 'backward' || move === 'back') && at === held.blocks.length - 1)
          return { refused: 'The block is already last' };
        const after =
          move === 'front'
            ? undefined
            : move === 'back'
              ? others[others.length - 1]?.id
              : move === 'forward'
                ? held.blocks[at - 2]?.id
                : held.blocks[at + 1]?.id;
        return {
          action: 'block.move',
          input: {
            slideId: facts.slideId,
            blockId: target.id,
            slot: held.slot,
            ...(after === undefined ? {} : { after }),
            ...rev,
          },
          label: item.label,
        };
      }
      return {
        action: 'block.order',
        input: { slideId: facts.slideId, blockId: target.id, move, ...rev },
        label: item.label,
      };
    }
    case 'arrange.align.left':
    case 'arrange.align.center':
    case 'arrange.align.right':
    case 'arrange.align.top':
    case 'arrange.align.middle':
    case 'arrange.align.bottom':
    case 'arrange.centerOnPage.horizontally':
    case 'arrange.centerOnPage.vertically': {
      const ids = facts.selection?.blockIds ?? (target === undefined ? [] : [target.id]);
      if (ids.length === 0) return { refused: SELECT_BLOCK };
      const extra = effect.kind === 'action' ? (effect.input ?? {}) : {};
      const to = extra.to === 'page' ? 'content' : ids.length > 1 ? 'selection' : 'content';
      return {
        action: 'block.align',
        input: { slideId: facts.slideId, blockIds: [...ids], edge: extra.edge, to, ...rev },
        label: item.label,
      };
    }
    case 'arrange.distribute.horizontally':
    case 'arrange.distribute.vertically': {
      const ids = facts.selection?.blockIds ?? [];
      if (ids.length < 3) return { refused: 'Select three or more blocks first' };
      const axis = item.id.endsWith('horizontally') ? 'horizontal' : 'vertical';
      return {
        action: 'block.distribute',
        input: { slideId: facts.slideId, blockIds: [...ids], axis, ...rev },
        label: item.label,
      };
    }
    case 'format.text.bold': {
      if (target === undefined) return { refused: SELECT_TEXT };
      const typography = typographyOf(target);
      const weight = typography.weight === 500 ? undefined : 500;
      const next = { ...typography };
      if (weight === undefined) delete next.weight;
      else next.weight = weight;
      return blockSet(
        facts,
        target.id,
        '/typography',
        Object.keys(next).length === 0 ? undefined : next,
        'Bold',
      );
    }
    case 'format.text.strikethrough': {
      if (target?.type !== 'plain') return { refused: 'Strikethrough applies to a list item' };
      const items = [...target.items];
      const index = facts.selection?.cell?.row ?? 0;
      const current = items[index];
      if (current === undefined) return { refused: 'Strikethrough applies to a list item' };
      const struck = { ...current } as { no?: true };
      if (struck.no) delete struck.no;
      else struck.no = true;
      items[index] = struck as (typeof items)[number];
      return blockSet(facts, target.id, '/items', items, 'Strikethrough');
    }
    case 'format.text.size.increase':
    case 'format.text.size.decrease': {
      if (target === undefined) return { refused: SELECT_TEXT };
      const size = stepLadder(currentSize(target), item.id.endsWith('increase') ? 1 : -1);
      if (target.type === 'table') return blockSet(facts, target.id, '/size', size, item.label);
      return blockSet(
        facts,
        target.id,
        '/typography',
        { ...typographyOf(target), size },
        item.label,
      );
    }
    case 'format.alignIndent.left':
    case 'format.alignIndent.center':
    case 'format.alignIndent.right': {
      if (target === undefined) return { refused: SELECT_TEXT };
      if (target.type === 'table') {
        const column = facts.selection?.cell?.column ?? 0;
        const columns = (target as TableBlock).columns.map((each, index) =>
          index === column ? { ...each, align: ALIGN_OF[item.id] } : each,
        );
        return blockSet(facts, target.id, '/columns', columns, item.label);
      }
      return blockSet(
        facts,
        target.id,
        '/typography',
        { ...typographyOf(target), align: ALIGN_OF[item.id] },
        item.label,
      );
    }
    case 'format.spacing.single':
    case 'format.spacing.1_15':
    case 'format.spacing.1_5':
    case 'format.spacing.double': {
      if (target === undefined) return { refused: SELECT_TEXT };
      return blockSet(
        facts,
        target.id,
        '/typography',
        { ...typographyOf(target), leading: SPACING_OF[item.id] },
        item.label,
      );
    }
    case 'format.bulletsNumbering.bulleted':
    case 'format.bulletsNumbering.numbered': {
      if (target === undefined) return { refused: SELECT_TEXT };
      const numbered = item.id.endsWith('numbered');
      const list = listFrom(target, numbered);
      if (list === null) return { refused: 'Select a paragraph or a text box first' };
      if (target.type === 'plain') {
        return blockSet(facts, target.id, '/numbered', numbered ? true : undefined, item.label);
      }
      const placed =
        slide === undefined
          ? undefined
          : slideBlocks(slide).find(({ block: each }) => each.id === target.id);
      if (placed === undefined || slide === undefined) return { refused: SELECT_TEXT };
      const siblings = slideBlocks(slide).filter(({ slot }) => slot === placed.slot);
      const at = siblings.findIndex(({ block: each }) => each.id === target.id);
      const previous = at > 0 ? siblings[at - 1]?.block.id : undefined;
      const mutations: Mutation[] = [
        { op: 'block.remove', slideId: facts.slideId, blockId: target.id },
        {
          op: 'block.insert',
          slideId: facts.slideId,
          slot: placed.slot,
          ...(previous === undefined ? {} : { after: previous }),
          block: list,
        },
      ];
      return {
        action: 'slide.update',
        input: { slideId: facts.slideId, mutations, ...rev },
        label: item.label,
      };
    }
    case 'format.table.insertRowAbove':
    case 'format.table.insertRowBelow':
    case 'format.table.insertColumnLeft':
    case 'format.table.insertColumnRight':
    case 'format.table.deleteRow':
    case 'format.table.deleteColumn':
    case 'format.table.deleteTable':
    case 'format.table.distributeRows':
    case 'format.table.distributeColumns': {
      if (target?.type !== 'table') return { refused: SELECT_CELL };
      const cell = facts.selection?.cell ?? { row: 0, column: 0 };
      const command = tableCommandOf(item.id, cell);
      if (command === null) return { refused: SELECT_CELL };
      const edit = applyTableCommand(target as TableBlock, command);
      if ('deleted' in edit)
        return {
          action: 'block.remove',
          input: { slideId: facts.slideId, blockId: target.id, ...rev },
          label: 'Delete table',
        };
      const mutations: Mutation[] = [
        {
          op: 'block.set',
          slideId: facts.slideId,
          blockId: target.id,
          path: '/columns',
          value: edit.columns,
        },
        {
          op: 'block.set',
          slideId: facts.slideId,
          blockId: target.id,
          path: '/rows',
          value: edit.rows,
        },
      ];
      const added = command.kind === 'insertRowAbove' || command.kind === 'insertRowBelow';
      return {
        action: 'slide.update',
        input: { slideId: facts.slideId, mutations, ...rev },
        label: item.label,
        ...(added ? { snackbar: 'Row added', undo: true } : {}),
      };
    }
    case 'format.image.cropImage': {
      if (target?.type !== 'shot') return { refused: 'Select a picture first' };
      return blockSet(
        facts,
        target.id,
        '/crop',
        target.crop === 'top' ? 'center' : 'top',
        'Crop image',
      );
    }
    case 'format.bordersLines.borderColor':
    case 'format.bordersLines.borderWeight':
    case 'format.bordersLines.lineStart':
    case 'format.bordersLines.lineEnd':
      return { refused: 'Use the toolbar control to pick a value' };
    case 'format.clearFormatting': {
      if (target === undefined) return { refused: SELECT_BLOCK };
      const present = FORMAT_OVERRIDE_PATHS.filter(
        (path) => path.slice(1) in (target as unknown as Record<string, unknown>),
      );
      if (present.length === 0) return { refused: 'Nothing to clear' };
      const mutations: Mutation[] = present.map((path) => ({
        op: 'block.set',
        slideId: facts.slideId,
        blockId: target.id,
        path,
      }));
      return {
        action: 'slide.update',
        input: { slideId: facts.slideId, mutations, ...rev },
        label: 'Clear formatting',
      };
    }
    default:
      break;
  }
  /* an item whose effect names an action outright with no input to build */
  if (effect.kind === 'action') {
    return { action: effect.id, input: { ...(effect.input ?? {}) }, label: item.label };
  }
  if (effect.kind === 'submenu' && effect.action !== undefined) {
    return { refused: `${item.label} needs a choice` };
  }
  return { refused: `${item.label} has no action` };
}

// ---------------------------------------------------------------------------------------------
// Retired letters (SPEC 0.28, 10.2)

/** What each retired bare key did, and the menu item that replaces it, for the one time snackbar. */
export const RETIRED_KEYS: Readonly<Record<string, { item: string; menu: string }>> = {
  s: { item: 'hides the filmstrip', menu: 'View' },
  '[': { item: 'hides the filmstrip', menu: 'View' },
  d: { item: 'switches light and dark', menu: 'View' },
  e: { item: 'switches Editing and Viewing', menu: 'View' },
  p: { item: 'starts the slideshow', menu: 'View' },
  f: { item: 'hides the menus', menu: 'View' },
  g: { item: 'opens grid view', menu: 'View' },
  b: { item: 'opens the book', menu: 'Tools' },
  r: { item: 'opens Format options', menu: 'Format' },
  '?': { item: 'shows the keyboard shortcuts', menu: 'Help' },
  j: { item: 'moves to the next slide with the Down arrow', menu: 'View' },
  l: { item: 'moves to the next slide with the Down arrow', menu: 'View' },
  k: { item: 'moves to the previous slide with the Up arrow', menu: 'View' },
  h: { item: 'moves to the previous slide with the Up arrow', menu: 'View' },
};

/** The one time sentence for a retired letter: "S now hides the filmstrip from the View menu". */
export function retiredKeySentence(key: string): string | null {
  const entry = RETIRED_KEYS[key.toLowerCase()];
  if (entry === undefined) return null;
  const letter = key.length === 1 && /[a-z]/i.test(key) ? key.toUpperCase() : key;
  return `${letter} now ${entry.item} from the ${entry.menu} menu`;
}

/** The storage key of the retired letters already announced in this browser. */
export const RETIRED_KEYS_STORAGE = 'ts-retired-keys';

// ---------------------------------------------------------------------------------------------
// Small facts the rows read

/** The appearance the stage, the thumbnails and the Download dialog default to (SPEC 1.4). */
export function appearanceOf(deck: Deck): Theme {
  return deckAppearance(deck);
}

/** The pictures of a deck by role, for the Replace image list and the Pictures panel. */
export function picturesOf(deck: Deck): Asset[] {
  return Object.values(deck.assets);
}

/** `Slide 3` for a slide without a heading. */
export function slideNumberOf(document: DeckDocument, slideId: string): number {
  return slideOrder(document.deck).indexOf(slideId) + 1;
}

/** The stored last layout for New slide, when it is a layout id. */
export function readLastLayout(value: string | null): LayoutId | null {
  return value !== null && isLayoutId(value) ? value : null;
}

/** The storage key of the last layout picked for New slide (SPEC 5.3). */
export const LAST_LAYOUT_STORAGE = 'ts-last-layout';

/** The storage key of the chrome appearance (SPEC 1.4): light, dark or match. */
export const APPEARANCE_STORAGE = 'ts-chrome-appearance';

/** The storage key of the per browser toggles (snap to grid, show ids, spellcheck, sections). */
export const SETTINGS_STORAGE = 'ts-editor-settings';

/** The settings a browser keeps (SPEC 0.9, 2.3, 2.8); the rest are per session. */
export const STORED_SETTINGS: ReadonlyArray<MenuSetting> = [
  'snapGrid',
  'snapGuides',
  'showIds',
  'spellcheck',
  'speakerNotes',
];

/** The settings the shell starts from (SPEC 11.3 defaults). */
export const DEFAULT_SETTINGS: ShellSettings = {
  snapGuides: true,
  snapGrid: false,
  speakerNotes: true,
  filmstrip: true,
  spellcheck: true,
  viewing: false,
  compact: false,
  sections: false,
  appearance: 'match',
  sourceDrawer: false,
  sideBySide: false,
  suggestionMarks: false,
  showIds: false,
  sectionsTree: false,
  book: false,
  gridView: false,
  zoom: 'fit',
};

/** The settings read back from storage, over the defaults; unknown keys ignored. */
export function readStoredSettings(saved: string | null): ShellSettings {
  if (saved === null) return {};
  try {
    const parsed: unknown = JSON.parse(saved);
    if (parsed === null || typeof parsed !== 'object') return {};
    const out: Partial<Record<MenuSetting, boolean | string>> = {};
    for (const key of STORED_SETTINGS) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === 'boolean' || typeof value === 'string') out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** The stored subset of the settings as JSON. */
export function writeStoredSettings(settings: ShellSettings): string {
  const out: Partial<Record<MenuSetting, boolean | string>> = {};
  for (const key of STORED_SETTINGS) {
    const value = settings[key];
    if (value !== undefined) out[key] = value;
  }
  return JSON.stringify(out);
}
