/**
 * The menu context's default and the functions that read a context (SPEC 11.1, SPEC-3 13.4,
 * docs/FOCUS.md 3.1): whether a row is present, enabled or checked, its label, effect and tooltip
 * sentence, and the rows a menu draws. They read no menu table, so a page that draws a menu and no
 * editor (Recent presentations, the template gallery) does not load the 4,000 line model, about
 * 67 KB of its JavaScript (hardening HR-PC#2, PERF-9). ./model.ts re-exports every name here.
 * Relative imports in this folder carry the `.ts` extension so the parity audit script can load
 * the model under Node.
 */
import type {
  MenuCapability,
  MenuCheck,
  MenuContext,
  MenuEffect,
  MenuItem,
  MenuPredicate,
  MenuStatus,
  ToolbarControl,
} from './model.ts';
import { STUB_PREFIX, stubClause } from './strings.ts';

/** The separator row of a menu table. */
export const DIVIDER = '-';

/** A fresh presentation with nothing selected (SPEC 11.1): the default state of every menu. */
export const DEFAULT_MENU_CONTEXT: MenuContext = {
  platform: 'mac',
  focus: 'none',
  slide: { index: 0, count: 1, skipped: false, freeform: false, pictureLayout: false },
  selectedSlides: 1,
  selection: {
    blocks: 0,
    textBlock: false,
    listItem: false,
    tableCell: false,
    linked: false,
    order: { forward: false, backward: false, front: false, back: false },
  },
  clipboard: 'empty',
  history: { undo: false, redo: false },
  sections: 1,
  guides: 0,
  /* the rulers and the guides start hidden, as Google's do (SPEC-2 6.1 rows 29 and 30); the
     editor opens in Editing mode with every comment shown and the collaborators' pointers on
     (SPEC-3 4.6, 5.3) */
  settings: {
    snapGuides: true,
    speakerNotes: true,
    filmstrip: true,
    spellcheck: true,
    zoom: 'fit',
    appearance: 'match',
    mode: 'editing',
    comments: 'all',
    pointerOthers: true,
  },
};

/** True when the caller holds a capability; a context without capabilities holds them all (a checkout, today's open deck). */
export function hasCapability(ctx: MenuContext, capability: MenuCapability): boolean {
  return ctx.capabilities === undefined || ctx.capabilities.includes(capability);
}

/** Runs a named predicate. */
export function evaluate(predicate: MenuPredicate | undefined, ctx: MenuContext): boolean {
  const { slide, selection } = ctx;
  /* SPEC-2 1.1: every top level block of every slide kind is an object; the route says no only for a nested block */
  const objects = selection.object !== false;
  switch (predicate) {
    case undefined:
    case 'always':
      return true;
    case 'canUndo':
      return ctx.history.undo;
    case 'canRedo':
      return ctx.history.redo;
    case 'hasSelection':
      return ctx.selectedSlides > 0 || selection.blocks > 0 || ctx.focus === 'text';
    case 'canPaste':
      /* Paste stays enabled, as Google's does (cycle 2, VERIFICATION F-slides-paste, b4 FR2):
         `ctx.clipboard` is the kind of the payload this page last wrote and reads `empty` in a
         tab that copied nothing, while the system clipboard may hold a slide envelope another
         tab wrote or text copied anywhere; the browser lets the page read it only at the paste
         (`clipboardStore.read()`), and a paste with nothing to read does nothing */
      return true;
    case 'hasSlide':
      return slide !== null;
    case 'slideSubsetSelected':
      return slide !== null && ctx.selectedSlides > 0 && ctx.selectedSlides < slide.count;
    case 'canMoveUp':
      return slide !== null && slide.index > 0;
    case 'canMoveDown':
      return slide !== null && slide.index < slide.count - 1;
    case 'pictureLayout':
      return slide?.pictureLayout === true;
    case 'slideSkipped':
      return slide?.skipped === true;
    case 'blockSelected':
      return selection.blocks >= 1;
    case 'canBringForward':
      return selection.blocks >= 1 && selection.order.forward;
    case 'canBringToFront':
      return selection.blocks >= 1 && selection.order.front;
    case 'canSendBackward':
      return selection.blocks >= 1 && selection.order.backward;
    case 'canSendToBack':
      return selection.blocks >= 1 && selection.order.back;
    case 'textBlockSelected':
      return selection.textBlock || ctx.focus === 'text';
    case 'listItemSelected':
      return selection.listItem;
    case 'imageSelected':
      return selection.block === 'image';
    case 'shapeSelected':
      return selection.block === 'shape';
    case 'lineSelected':
      return selection.block === 'line';
    case 'tableCellSelected':
      return selection.tableCell;
    case 'linkable':
      return ctx.focus === 'text' || selection.blocks === 1;
    case 'linkSelected':
      return selection.linked;
    case 'manySections':
      return ctx.sections > 1;
    case 'boxSelected':
      return selection.blocks === 1 && selection.box === true;
    case 'pictureBlockSelected':
      return selection.blocks === 1 && selection.picture === true;
    case 'never':
      return false;
    /* round two (SPEC-2 4.1, 0.80, 0.83): the object rows read `object`, never the layout, so a
       grammar slide's block enables them and the first pick converts the slide (1.6) */
    case 'objectSelected':
    case 'rotatable':
      return selection.blocks >= 1 && objects;
    case 'twoOrMore':
    case 'canGroup':
      return selection.blocks >= 2 && objects;
    case 'threeOrMore':
      return selection.blocks >= 3 && objects;
    case 'groupSelected':
      return selection.blocks >= 1 && selection.group !== undefined;
    case 'canRegroup':
      return selection.regroup === true;
    case 'cellRangeSelected':
      return selection.tableCell && selection.cells !== undefined;
    case 'mergedCellSelected':
      return selection.tableCell && selection.merged === true;
    case 'imageEdited':
      return selection.block === 'image' && selection.imageEdited === true;
    case 'rasterPictureSelected':
      return selection.block === 'image' && selection.vector !== true;
    case 'coversSheet':
      return selection.block === 'image' && selection.coversSheet === true;
    case 'hasGuides':
      return (ctx.guides ?? 0) > 0;
    case 'rulerShown':
      return ctx.settings.showRuler === true;
    case 'chartSelected':
      return selection.block === 'chart';
    case 'runSelected':
      return ctx.focus === 'text' && selection.range !== undefined;
    case 'listLevelUp':
      return selection.listItem && (selection.listLevel ?? 1) < 9;
    case 'listLevelDown':
      return selection.listItem && (selection.listLevel ?? 1) > 1;
    case 'hasBorderField':
      return (
        selection.blocks >= 1 &&
        (selection.box === true ||
          selection.block === 'shape' ||
          selection.block === 'image' ||
          selection.block === 'line' ||
          selection.tableCell ||
          selection.outlined === true)
      );
    case 'spaceBeforeSet':
      return selection.spaceBefore === true;
    case 'spaceAfterSet':
      return selection.spaceAfter === true;
    case 'htmlBlockSelected':
      return selection.blocks === 1 && selection.html === true;
    /* round three (SPEC-3 13.4): the role predicates over the capabilities of 6.2 */
    case 'write':
    case 'comment':
    case 'readComments':
    case 'readNotes':
    case 'history':
    case 'share':
    case 'settings':
    case 'publish':
    case 'copy':
    case 'export':
    case 'rename':
    case 'trash':
    case 'follow':
      return hasCapability(ctx, predicate);
    case 'canComment':
      return (
        hasCapability(ctx, 'comment') &&
        ctx.settings.mode !== 'viewing' &&
        (selection.blocks > 0 || ctx.focus === 'text' || ctx.focus === 'filmstrip')
      );
    case 'canEdit':
      return hasCapability(ctx, 'write') && (ctx.settings.mode ?? 'editing') === 'editing';
    case 'activity':
      return (
        hasCapability(ctx, 'history') ||
        (hasCapability(ctx, 'comment') && ctx.access?.activityForCommenters === true)
      );
    case 'viewOnly':
      return ctx.role === 'viewer';
    case 'signedIn':
      return ctx.account?.signedIn === true;
    case 'canSignIn':
      return ctx.account !== undefined && !ctx.account.signedIn && ctx.account.signInAvailable;
    case 'advancedTools':
      return advancedToolsOn(ctx);
  }
}

/** True while Tools > Advanced tools is on (docs/FOCUS.md 3.1): the parked set is drawn. */
export function advancedToolsOn(ctx: Pick<MenuContext, 'settings'>): boolean {
  return ctx.settings.advancedTools === true;
}

/** What `isPresent` reads: a menu row, a menu, a toolbar control or a right-click entry. */
export type Presentable = { when?: MenuPredicate; status?: MenuStatus; advanced?: true };

/**
 * True when a row is drawn at all in a context (SPEC-3 13.4): its `when` holds, or it has none.
 * The focus round (docs/FOCUS.md 3.1) adds the one rule of the parked set here and nowhere else:
 * while Tools > Advanced tools is off, a row carrying `advanced: true` and a row whose `status`
 * is `later` are absent; with it on both are drawn as before, the Later row disabled with its stub
 * clause. Every surface that draws or runs a row reads presence through this function.
 */
export function isPresent(item: Presentable, ctx: MenuContext): boolean {
  if (!advancedToolsOn(ctx) && (item.advanced === true || item.status === 'later')) return false;
  return item.when === undefined || evaluate(item.when, ctx);
}

/** The toolbar controls a context draws (docs/FOCUS.md 3.1): the head, a tail or the tail end filtered by `isPresent`. */
export function presentControls<T extends ToolbarControl>(
  controls: ReadonlyArray<T>,
  ctx: MenuContext,
): T[] {
  return controls.filter((control) => isPresent(control, ctx));
}

/** True when the item takes input now: a `now` item whose predicate holds. */
export function isEnabled(item: MenuItem, ctx: MenuContext): boolean {
  return item.status === 'now' && evaluate(item.enabled, ctx);
}

/**
 * The effect an item runs in a context: its `altEffect` while that predicate holds (Change
 * background opens the Replace image submenu on a picture layout and the Background dialog
 * elsewhere), else its effect. Every surface that runs or draws an item reads the effect here.
 */
export function resolveEffect(item: MenuItem, ctx: MenuContext): MenuEffect | undefined {
  if (item.altEffect !== undefined && evaluate(item.altEffect.when, ctx))
    return item.altEffect.effect;
  return item.effect;
}

/** The check state of a check or radio item; undefined for a plain item (a `plain` toggle relabels instead). */
export function isChecked(item: MenuItem, ctx: MenuContext): boolean | undefined {
  if (item.plain === true) return undefined;
  const check: MenuCheck | undefined =
    item.checked ??
    (item.effect?.kind === 'toggle'
      ? item.effect.value === undefined
        ? { setting: item.effect.setting }
        : { setting: item.effect.setting, value: item.effect.value }
      : undefined);
  if (check === undefined) return undefined;
  /* a selection check (the Header row row): the fact the context carries about the selected table */
  if ('selection' in check) return ctx.selection[check.selection] === true;
  const current = ctx.settings[check.setting];
  if (check.value === undefined) return current === true;
  /* a boolean value reads the setting as a flag: Editing is checked while Viewing is not on */
  if (typeof check.value === 'boolean') return (current === true) === check.value;
  return String(current) === String(check.value);
}

/** The label to draw: the alternate while its predicate holds (Unskip slide on a skipped card). */
export function resolveLabel(item: MenuItem, ctx: MenuContext): string {
  return item.altLabel !== undefined && evaluate(item.altLabel.when, ctx)
    ? item.altLabel.label
    : item.label;
}

/**
 * The tooltip sentence of an item: the stub formula on a Later item, the disabled reason while
 * the predicate says no, else the item's own sentence.
 */
export function tooltipDoc(item: MenuItem, ctx: MenuContext): string | undefined {
  if (item.status === 'later') return stubClause(item.stubReason ?? '');
  if (item.status === 'now' && !evaluate(item.enabled, ctx)) {
    const reason =
      typeof item.disabledReason === 'function' ? item.disabledReason(ctx) : item.disabledReason;
    if (reason !== undefined) return reason;
  }
  return item.doc;
}

/** True when the tooltip of a Later item begins as SPEC 14.4 expects. */
export function isStubTooltip(text: string): boolean {
  return text.startsWith(STUB_PREFIX);
}

/**
 * The items a menu draws: omitted items dropped, context-only items dropped unless asked, and
 * with a context the rows whose `when` says no dropped too (SPEC-3 13.4: absent, never disabled).
 * With a context a plain container (a row whose only effect is to open its submenu) with no
 * visible child is dropped as well (docs/FOCUS.md 3.1: a parent whose children are all parked is
 * absent); a split row that runs a command of its own keeps its place with an empty arrow.
 */
export function visibleItems(
  items: ReadonlyArray<MenuItem>,
  options: { contextOnly?: boolean; context?: MenuContext; collapseSingles?: boolean } = {},
): MenuItem[] {
  const ctx = options.context;
  const present = items.filter(
    (item) =>
      item.status !== 'omit' &&
      (options.contextOnly === true || item.contextOnly !== true) &&
      (ctx === undefined ||
        (isPresent(item, ctx) &&
          !isEmptyContainer(item, { contextOnly: options.contextOnly, ctx }))),
  );
  if (ctx === undefined || options.collapseSingles !== true) return present;
  /* the polish round (docs/archive/rounds/POLISH.md 2.6 item 74; audit-chrome item 30): a plain submenu whose
     visible rows number one draws as that row (Make a copy with Selected slides parked,
     Preferences, Accessibility settings); the ids stay, so the finder and the drivers read the
     row by its own id. The menus ask for it (Menu.tsx); the title row's chips and the surfaces
     that count a container's rows read the table as it is */
  return present.map((item) => {
    if (
      item.items === undefined ||
      item.effect === undefined ||
      item.effect.kind !== 'submenu' ||
      item.effect.dynamic !== undefined
    )
      return item;
    const children = visibleItems(item.items, {
      contextOnly: options.contextOnly,
      context: ctx,
      collapseSingles: true,
    });
    const only = children.length === 1 ? children[0] : undefined;
    if (only === undefined) return item;
    /* a row with a collapsed label draws it (New presentation); a dialog reached by the one row
       takes the container's name (Make a copy opens the Make a copy dialog for the whole
       presentation); a toggle keeps its own words */
    if (only.collapsedLabel !== undefined) return { ...only, label: only.collapsedLabel };
    return only.effect?.kind === 'dialog' ? { ...only, label: item.label } : only;
  });
}

/** True for a plain submenu row whose children are all absent in the context. */
function isEmptyContainer(
  item: MenuItem,
  options: { contextOnly?: boolean; ctx: MenuContext },
): boolean {
  if (item.items === undefined || item.items.length === 0) return false;
  if (
    item.effect === undefined ||
    item.effect.kind !== 'submenu' ||
    item.effect.dynamic !== undefined
  )
    return false;
  return (
    visibleItems(item.items, { contextOnly: options.contextOnly, context: options.ctx }).length ===
    0
  );
}
