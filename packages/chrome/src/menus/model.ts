import type { ActionId } from '@turboslide/schema/actions';

import type { IconName } from '../icons';
import { STUB_PREFIX, stubClause } from './strings.ts';

/**
 * The menu model of the Google Slides parity round (SPEC 2.13): every row of SPEC sections 2.0 to
 * 2.10 as data, the Slideshow arrow of 9.1, the toolbar order of 3.1, the right-click menus of 4.2
 * and 4.3, and the predicates that enable, check and relabel items. The menu bar, the context
 * menus, Search the menus, the shortcuts dialog and the parity audit are generated from this one
 * table; nothing draws a menu item that is not in it.
 *
 * Reading the data: an item's `status` is `now` (built this round), `later` (present in Google's
 * position, disabled, tooltip "Not available in Turboslide yet" plus `stubReason`) or `omit`
 * (absent; `omitReason` says why and is never shown). Labels are Google's words in sentence
 * case; `google` holds Google's own spelling when it differs, for the completeness test against
 * `__fixtures__/google-menus.json`. Keys are Google's (R04 Part B) in the chord grammar of
 * `keys.ts`, Mac form first; `shortcut()` derives the Windows form the way Google's page does and
 * a row passes its own where Google prints something else. `enabled`, `checked` and `altLabel`
 * name predicates over a `MenuContext`, so the model stays serializable data for the audit
 * script and `evaluate()` is the one place they run.
 *
 * Round two (SPEC-2 section 4) flips the rows the round one Later stubs and the omitted items
 * held back: the text marks, capitalization, justified text, indents, spacing, the bullet and
 * numbering presets, merged cells, the image tools, the border pickers, dashes and line ends,
 * every shape category, charts, the diagram panel, word art, the line kinds, special characters,
 * the hover grid of Insert > Table, slide backgrounds, rotation, flip, groups, Select none and
 * Help Turboslide improve; the canvas (SPEC-2 section 1) makes every top level block of every
 * slide kind an object, so the Arrange rows are enabled on every slide, and brings View > Show
 * ruler, Guides, Snap to and Zoom in (SPEC-2 0.77). What stays Later is section 12 of SPEC-2,
 * each row with its clause.
 *
 * Nothing in a label, tooltip or stub clause names an internal thing (SPEC 12); the default view
 * words test greps this file. Relative imports carry the `.ts` extension so the parity audit
 * script can load the model under Node; the icon import is a type and is erased.
 */

export type MenuStatus = 'now' | 'later' | 'omit';
export type Platform = 'mac' | 'win';

/** Mac chord first; alternates joined by ' or '; an empty string is a platform with no chord. */
export type Shortcut = { mac: string; win: string };

/**
 * The fourteen actions SPEC 7.5 added in round one, kept as a list for the tests and the audit;
 * every id is in the actions table (`ActionId`) since round one's merge 1.
 */
export const GS1_ACTION_IDS = [
  'slide.new',
  'slide.duplicate',
  'slide.skip',
  'slide.applyLayout',
  'slide.import',
  'block.duplicate',
  'text.replaceAll',
  'deck.list',
  'deck.copy',
  'deck.trash',
  'deck.restore',
  'deck.remove',
  'export.text',
  'view.zoom',
] as const satisfies readonly ActionId[];

/**
 * The thirty six actions SPEC-2 section 3 adds, in its order (`slide.toCanvas` and `deck.guides`
 * joined with the canvas, SPEC-2 0.93), kept as a list for the tests and the audit; B1 landed
 * them in the actions table on day one and merge 1 of round two collapsed `MenuActionId` into
 * `ActionId` (SPEC-2 0.49), so a row can only name an action that exists.
 */
export const GS2_ACTION_IDS = [
  'block.group',
  'block.ungroup',
  'block.regroup',
  'block.rotate',
  'block.flip',
  'block.crop',
  'block.mask',
  'block.resetImage',
  'block.adjust',
  'block.setAlt',
  'block.shadow',
  'block.autofit',
  'slide.setBackground',
  'deck.setBackground',
  'text.style',
  'text.list',
  'text.spacing',
  'text.columns',
  'text.indent',
  'text.case',
  'chart.setData',
  'chart.setKind',
  'table.merge',
  'table.unmerge',
  'table.insertRows',
  'table.insertColumns',
  'table.deleteRows',
  'table.deleteColumns',
  'table.distribute',
  'table.cellStyle',
  'shape.set',
  'line.set',
  'diagram.insert',
  'text.insert',
  'slide.toCanvas',
  'deck.guides',
] as const satisfies readonly ActionId[];

/** The action a menu row runs: an id of the actions table, since merge 1 of round two (SPEC-2 0.49). */
export type MenuActionId = ActionId;

/** The per browser and per document toggles the View, Tools and Snap to items flip. */
export type MenuSetting =
  | 'gridView'
  | 'snapGuides'
  | 'snapGrid'
  | 'speakerNotes'
  | 'filmstrip'
  | 'viewing'
  | 'compact'
  | 'sections'
  | 'appearance'
  | 'spellcheck'
  | 'sourceDrawer'
  | 'sideBySide'
  | 'suggestionMarks'
  | 'showIds'
  | 'sectionsTree'
  | 'book'
  | 'zoom'
  /* round two (SPEC-2 0.77): the rulers and the deck's guides, per browser like the snap settings */
  | 'showRuler'
  | 'showGuides';

/** Client side handlers with no action of their own (SPEC 2.13: undo, redo, the clipboard, zoom). */
export type MenuClientHandler =
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'pasteWithoutFormatting'
  | 'delete'
  | 'duplicate'
  | 'selectAll'
  | 'link'
  | 'zoomIn'
  | 'zoomOut'
  | 'focusTitle'
  | 'showSaveState'
  | 'presenterView'
  | 'presentFromBeginning'
  | 'toolFinder'
  | 'runAction'
  /* round two (SPEC-2 4.1): crop mode, the word art bar, the two pickers anchored to a menu row, Select none */
  | 'cropMode'
  | 'wordArt'
  | 'borderColorPicker'
  | 'borderWeightPicker'
  | 'selectNone';

/**
 * The plates a dynamic submenu draws instead of a list of rows: the layout grid, a shape
 * category's glyph grid, the bullet and numbering preset grids, the Insert > Table hover grid,
 * the line end and dash lists (SPEC-2 4.1). The shell renders each; a row whose plate the shell
 * cannot draw yet falls back to its children, or runs its `action` as a command.
 */
export type MenuDynamic =
  'layouts' | 'shapes' | 'bulletPresets' | 'numberPresets' | 'tableGrid' | 'lineEnds' | 'dashes';

/** Google's four shape categories (SPEC-2 2.3); a `shapes` submenu without one shows all four. */
export type ShapeCategory = 'shapes' | 'arrows' | 'callouts' | 'equation';

export type MenuEffect =
  | { kind: 'action'; id: MenuActionId; input?: Readonly<Record<string, unknown>> }
  | { kind: 'dialog'; title: string }
  | { kind: 'panel'; title: string }
  | { kind: 'route'; path: string; newTab?: true }
  | { kind: 'toggle'; setting: MenuSetting; value?: string | boolean }
  | {
      kind: 'submenu';
      dynamic?: MenuDynamic;
      /** the shape category a `shapes` plate shows */
      category?: ShapeCategory;
      /** the action a pick in the plate runs; the row itself runs it as a command when no plate is drawn */
      action?: MenuActionId;
    }
  | { kind: 'client'; handler: MenuClientHandler };

/** The named predicates over a MenuContext; `evaluate` runs them. */
export type MenuPredicate =
  | 'always'
  | 'canUndo'
  | 'canRedo'
  | 'hasSelection'
  | 'canPaste'
  | 'hasSlide'
  | 'slideSubsetSelected'
  | 'canMoveUp'
  | 'canMoveDown'
  | 'pictureLayout'
  | 'slideSkipped'
  | 'blockSelected'
  | 'canBringForward'
  | 'canBringToFront'
  | 'canSendBackward'
  | 'canSendToBack'
  | 'textBlockSelected'
  | 'listItemSelected'
  | 'imageSelected'
  | 'shapeSelected'
  | 'lineSelected'
  | 'tableCellSelected'
  | 'linkable'
  | 'linkSelected'
  | 'manySections'
  /* the toolbar tails (toolbar-tails.ts): a box (the one text family block with a fill), a block that holds a picture, and a control that never takes input */
  | 'boxSelected'
  | 'pictureBlockSelected'
  | 'never'
  /* round two (SPEC-2 4.1, section 1): the objects of the canvas (every top level block of every
     slide kind; the first pick converts a grammar slide), groups, cell ranges, edited pictures,
     runs, list levels, border fields, the deck's guides and the ruler */
  | 'objectSelected'
  | 'twoOrMore'
  | 'threeOrMore'
  | 'rotatable'
  | 'canGroup'
  | 'groupSelected'
  | 'canRegroup'
  | 'cellRangeSelected'
  | 'mergedCellSelected'
  | 'imageEdited'
  | 'chartSelected'
  | 'runSelected'
  | 'listLevelUp'
  | 'listLevelDown'
  | 'hasBorderField'
  | 'spaceBeforeSet'
  | 'spaceAfterSet'
  | 'hasGuides'
  | 'rulerShown'
  | 'coversSheet';

export type MenuCheck = { setting: MenuSetting; value?: string | boolean };

export type MenuItem = {
  /** dotted, stable: `file.download.pptx`; the audit's `data-menu-item` */
  id: string;
  /** Google's label in sentence case, or the Turboslide item's plain name */
  label: string;
  /** Google's own spelling when it differs from `label` */
  google?: string;
  key?: Shortcut;
  icon?: IconName;
  status: MenuStatus;
  /** the clause after "Not available in Turboslide yet" */
  stubReason?: string;
  /** why an omitted item is absent; never shown */
  omitReason?: string;
  effect?: MenuEffect;
  /** the predicate that enables the item; always when absent */
  enabled?: MenuPredicate;
  /** the tooltip sentence while the predicate says no */
  disabledReason?: string;
  /** one sentence for the tooltip beyond the label and the key */
  doc?: string;
  /** a check item's state; a toggle effect implies its own setting */
  checked?: MenuCheck;
  /** a toggle drawn as a plain row: the label flips instead of a check mark (Show ruler reads Hide ruler) */
  plain?: true;
  /** the label while the predicate holds (Skip slide reads Unskip slide) */
  altLabel?: { when: MenuPredicate; label: string };
  /** the effect while the predicate holds (Change background opens the Replace image submenu on a picture layout); `resolveEffect` reads it */
  altEffect?: { when: MenuPredicate; effect: MenuEffect };
  /** the underlined letter; `assignAccessKeys` in keys.ts fills it */
  accessKey?: string;
  /** a 1 px rule is drawn above this item */
  dividerBefore?: true;
  items?: ReadonlyArray<MenuItem>;
  /** an item Google does not have */
  turboslide?: true;
  /** reachable from a right-click menu and Search the menus, not drawn in the menu bar */
  contextOnly?: true;
};

export type MenuId =
  | 'file'
  | 'edit'
  | 'view'
  | 'insert'
  | 'format'
  | 'slide'
  | 'arrange'
  | 'tools'
  | 'extensions'
  | 'help';

export type Menu = {
  id: MenuId;
  label: string;
  /** the access key letter (Ctrl+Option plus it on a Mac, Alt plus it on Windows) */
  accessKey: string;
  key: Shortcut;
  items: ReadonlyArray<MenuItem>;
};

// ---------------------------------------------------------------------------------------------
// Builders

/**
 * A shortcut from its Mac chord: Cmd becomes Ctrl, Option becomes Alt and Cmd+Ctrl becomes
 * Ctrl+Alt on Windows (R04 B10); a row whose Windows form differs passes it.
 */
export function shortcut(mac: string, win?: string): Shortcut {
  if (win !== undefined) return { mac, win };
  const derived = mac
    .split(/\s+or\s+/)
    .map((chord) => {
      const both = /\bCmd\b/.test(chord) && /\bCtrl\b/.test(chord);
      return chord
        .replace(/\bCmd\+Ctrl\+|\bCtrl\+Cmd\+/, 'Ctrl+Alt+')
        .replace(/\bCmd\b/, both ? 'Ctrl' : 'Ctrl')
        .replace(/\bOption\b/, 'Alt');
    })
    .join(' or ');
  return { mac, win: derived };
}

type Extra = Partial<
  Omit<MenuItem, 'id' | 'label' | 'status' | 'effect' | 'stubReason' | 'omitReason'>
>;

function now(id: string, label: string, effect: MenuEffect, extra: Extra = {}): MenuItem {
  return { id, label, status: 'now', effect, ...extra };
}

function later(id: string, label: string, stubReason: string, extra: Extra = {}): MenuItem {
  return { id, label, status: 'later', stubReason, ...extra };
}

function omit(id: string, label: string, omitReason: string, extra: Extra = {}): MenuItem {
  return { id, label, status: 'omit', omitReason, ...extra };
}

/** The status a container takes from its children: now over later over omit. */
export function statusOfChildren(items: ReadonlyArray<MenuItem>): MenuStatus {
  if (items.some((item) => item.status === 'now')) return 'now';
  if (items.some((item) => item.status === 'later')) return 'later';
  return 'omit';
}

function sub(
  id: string,
  label: string,
  items: ReadonlyArray<MenuItem>,
  extra: Extra & { effect?: MenuEffect; stubReason?: string; omitReason?: string } = {},
): MenuItem {
  const { effect, stubReason, omitReason, ...rest } = extra;
  const status = statusOfChildren(items);
  const item: MenuItem = { id, label, status, items, ...rest };
  /* a container opens only while something under it is built; a Later or omitted one has no effect */
  if (status === 'now') item.effect = effect ?? { kind: 'submenu' };
  if (status === 'omit') item.omitReason = omitReason ?? 'Every item of the submenu is omitted';
  if (status === 'later')
    item.stubReason = stubReason ?? items.find((each) => each.status === 'later')?.stubReason ?? '';
  return item;
}

const action = (id: MenuActionId, input?: Readonly<Record<string, unknown>>): MenuEffect =>
  input === undefined ? { kind: 'action', id } : { kind: 'action', id, input };
const dialog = (title: string): MenuEffect => ({ kind: 'dialog', title });
const panel = (title: string): MenuEffect => ({ kind: 'panel', title });
const route = (path: string, newTab?: true): MenuEffect =>
  newTab === undefined ? { kind: 'route', path } : { kind: 'route', path, newTab };
const toggle = (setting: MenuSetting, value?: string | boolean): MenuEffect =>
  value === undefined ? { kind: 'toggle', setting } : { kind: 'toggle', setting, value };
const client = (handler: MenuClientHandler): MenuEffect => ({ kind: 'client', handler });

// ---------------------------------------------------------------------------------------------
// Shared clauses (SPEC 12, SPEC-2 12: one clause, no internal noun, no process word)

const COMMENTS_LATER = 'Leave a note in the speaker notes instead';
const STILL_SLIDES = 'The GT theme presents still slides';
const NUMBERING_STARTS = 'Numbering starts at 1';
const NO_MEDIA = 'Link to a recording instead';
const START_FROM_GT = 'Start from the GT brand deck on the home page';
const DOWNLOAD_FORMATS = 'Only PowerPoint, PDF, text, pictures and the web page download';
const GOOGLE_SERVICE = 'A Google service';
/* SPEC-2 12: Edit guides stays Later; a guide is moved by dragging and removed from its right-click menu */
const GUIDES_BY_HAND = 'Drag a guide to move it and right-click it to delete it';

/* the disabled reasons of the object rows (SPEC-2 4.1, section 1): every top level block of every
   slide kind is an object, so no row is disabled because of the slide's layout */
const SELECT_OBJECT = 'Select an object on the slide first';
const SELECT_OBJECTS = 'Select two or more objects on the slide first';
const SELECT_THREE_OBJECTS = 'Select three or more objects on the slide first';
const SELECT_BORDERED = 'Select a box, shape, picture, line, table cell or word art first';

/* the sheet is 1600 by 900: a new guide lands at its centre (SPEC-2 6.1 row 30) */
const SHEET_CENTER_X = 800;
const SHEET_CENTER_Y = 450;

/**
 * The Replace image sources (SPEC 2.4, 2.5): the Insert > Image sources as the Format > Image >
 * Replace image submenu. Change background no longer lists them (SPEC-2 0.74): its dialog inserts
 * the picture object, which then has its own Replace image.
 */
function replaceImageItems(prefix: string): MenuItem[] {
  return [
    now(`${prefix}.upload`, 'Upload from computer', action('asset.add'), { icon: 'photo' }),
    now(`${prefix}.byUrl`, 'By URL', dialog('Image by URL')),
    now(
      `${prefix}.fromThisPresentation`,
      'From this presentation',
      dialog('Pictures in this presentation'),
      { turboslide: true },
    ),
  ];
}

/** Google's six dashes (SPEC-2 2.3.3), one row each; the label is the accessible name of the sample. */
export const DASH_ROWS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'solid', label: 'Solid' },
  { id: 'dot', label: 'Dot' },
  { id: 'dash', label: 'Dash' },
  { id: 'dashDot', label: 'Dash dot' },
  { id: 'longDash', label: 'Long dash' },
  { id: 'longDashDot', label: 'Long dash dot' },
];

function dashItems(prefix: string, enabled: MenuPredicate): MenuItem[] {
  return DASH_ROWS.map(({ id, label }) =>
    now(`${prefix}.${id}`, label, action('block.set', { dash: id }), { enabled }),
  );
}

/** Google's ten line decorations (SPEC-2 2.4.5), one row each under Line start and Line end. */
export const LINE_END_ROWS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'fillArrow', label: 'Arrow' },
  { id: 'stealth', label: 'Stealth arrow' },
  { id: 'fillCircle', label: 'Circle' },
  { id: 'fillSquare', label: 'Square' },
  { id: 'fillDiamond', label: 'Diamond' },
  { id: 'openArrow', label: 'Open arrow' },
  { id: 'openCircle', label: 'Open circle' },
  { id: 'openSquare', label: 'Open square' },
  { id: 'openDiamond', label: 'Open diamond' },
];

function lineEndItems(prefix: string, end: 'start' | 'end'): MenuItem[] {
  return LINE_END_ROWS.map(({ id, label }) =>
    now(`${prefix}.${id}`, label, action('line.set', { [end]: id }), { enabled: 'lineSelected' }),
  );
}

/** A shape category's glyph grid (SPEC-2 4.1): a dynamic submenu whose pick arms the draw tool. */
const shapeGrid = (category: ShapeCategory): MenuEffect => ({
  kind: 'submenu',
  dynamic: 'shapes',
  category,
  action: 'block.insert',
});

// ---------------------------------------------------------------------------------------------
// 2.0 The title row and 9.1 the Slideshow arrow

export const TITLE_ROW_ITEMS: ReadonlyArray<MenuItem> = [
  now('title.appIcon', 'Turboslide home', route('/decks'), {
    google: 'App icon',
    doc: 'Every presentation on this Turboslide',
  }),
  now('title.name', 'Rename', action('deck.rename'), {
    google: 'Title field',
    doc: 'Click the title to rename the presentation; Enter keeps the name and Esc restores it',
  }),
  omit('title.star', 'Star', 'Starring needs a person to star for; there are no accounts (R10 B1)'),
  omit('title.move', 'Move', 'No folders'),
  now('title.saveState', 'Document status', client('showSaveState'), {
    doc: 'All changes saved, Saving, Not saved yet or Couldn’t save, retrying',
  }),
  now('title.lastEdit', 'Last edit', panel('Version history'), {
    icon: 'clock',
    key: shortcut('Cmd+Option+Shift+H'),
    doc: 'Opens Version history',
  }),
  later('title.comments', 'Show all comments', COMMENTS_LATER, { icon: 'chat' }),
  omit('title.meet', 'Meet', GOOGLE_SERVICE),
  omit('title.record', 'Record', GOOGLE_SERVICE),
  now('title.slideshow', 'Slideshow', action('view.present', { on: true }), {
    icon: 'present',
    key: shortcut('Cmd+Enter', 'Ctrl+F5'),
    doc: 'Presents from the current slide; the arrow lists Presenter view and Start from beginning',
    items: [
      now('title.slideshow.presenterView', 'Presenter view', client('presenterView'), {
        doc: 'Your notes, the timer and the next slide in a second window',
      }),
      now(
        'title.slideshow.startFromBeginning',
        'Start from beginning',
        client('presentFromBeginning'),
        { key: shortcut('Cmd+Shift+Enter', 'Ctrl+Shift+F5') },
      ),
      later(
        'title.slideshow.presentOnAnotherScreen',
        'Present on another screen',
        'Presenter view opens a second window you can drag to another screen',
        { google: 'Present using Chromecast' },
      ),
      omit(
        'title.slideshow.displayOptions',
        'Presentation display options',
        "Chrome's multi screen permission flow; Presenter view covers the two window case",
      ),
    ],
  }),
  now('title.share', 'Share', dialog('Share'), {
    icon: 'link',
    doc: 'The view, present and edit links',
  }),
  omit('title.account', 'Account avatar', 'No accounts'),
  omit('title.gemini', 'Ask Gemini', 'No accounts; agents reach the deck through Extensions'),
];

// ---------------------------------------------------------------------------------------------
// 2.1 to 2.10 The ten menus

const FILE: Menu = {
  id: 'file',
  label: 'File',
  accessKey: 'f',
  key: shortcut('Ctrl+Option+F', 'Alt+F'),
  items: [
    sub('file.new', 'New', [
      now('file.new.presentation', 'Presentation', route('/new', true), {
        icon: 'plus',
        turboslide: true,
      }),
      now('file.new.templateGallery', 'From template gallery', route('/decks#templates', true), {
        google: 'From Template Gallery',
      }),
    ]),
    now('file.open', 'Open…', dialog('Open'), { key: shortcut('Cmd+O'), icon: 'document' }),
    now('file.importSlides', 'Import slides', dialog('Import slides')),
    sub('file.makeCopy', 'Make a copy', [
      now('file.makeCopy.entire', 'Entire presentation', dialog('Make a copy')),
      now('file.makeCopy.selected', 'Selected slides', dialog('Make a copy'), {
        enabled: 'slideSubsetSelected',
        disabledReason: 'Select some of the slides in the filmstrip first',
      }),
    ]),
    sub(
      'file.share',
      'Share',
      [
        now('file.share.withOthers', 'Share with others', dialog('Share')),
        now('file.share.publish', 'Publish to web', dialog('Publish to the web')),
      ],
      { icon: 'link' },
    ),
    sub('file.email', 'Email', [
      omit(
        'file.email.thisFile',
        'Email this file',
        'No mail service; Share > Copy link is the path',
      ),
      omit('file.email.collaborators', 'Email collaborators', 'No mail service'),
    ]),
    sub('file.download', 'Download', [
      now('file.download.pptx', 'Microsoft PowerPoint (.pptx)', dialog('Download'), {
        doc: 'Perfect by default, or Editable text',
      }),
      later('file.download.odp', 'ODP Document (.odp)', DOWNLOAD_FORMATS),
      now('file.download.pdf', 'PDF Document (.pdf)', dialog('Download'), {
        doc: 'One slide per page',
      }),
      now('file.download.txt', 'Plain Text (.txt)', action('export.text'), {
        doc: 'Every slide’s text in order',
      }),
      now(
        'file.download.jpg',
        'JPEG image (.jpg, current slide)',
        action('render.slide', { format: 'jpg' }),
      ),
      now(
        'file.download.png',
        'PNG image (.png, current slide)',
        action('render.slide', { format: 'png' }),
      ),
      later(
        'file.download.svg',
        'Scalable Vector Graphics (.svg, current slide)',
        DOWNLOAD_FORMATS,
      ),
      now('file.download.html', 'Web page (.html)', action('build.run'), {
        turboslide: true,
        doc: 'One file that opens in any browser',
      }),
      now('file.download.zip', 'Turboslide bundle (.zip)', action('deck.pack'), {
        turboslide: true,
        doc: 'The file Open and Import slides read',
      }),
    ]),
    now('file.rename', 'Rename', client('focusTitle'), { dividerBefore: true }),
    omit('file.move', 'Move', 'No folders'),
    omit('file.addShortcut', 'Add shortcut to Drive', 'No Drive'),
    now('file.moveToTrash', 'Move to trash', action('deck.trash'), {
      icon: 'archive',
      doc: 'The presentation stays in the trash until someone deletes it forever',
    }),
    sub(
      'file.versionHistory',
      'Version history',
      [
        now(
          'file.versionHistory.nameCurrent',
          'Name current version',
          dialog('Name current version'),
        ),
        now('file.versionHistory.see', 'See version history', panel('Version history'), {
          key: shortcut('Cmd+Option+Shift+H'),
        }),
      ],
      { icon: 'clock', dividerBefore: true },
    ),
    omit('file.approvals', 'Approvals', 'Workspace only'),
    omit(
      'file.offline',
      'Make available offline',
      'Present mode keeps working after load without the network (R07 rule 29)',
    ),
    now('file.details', 'Details', dialog('Details'), { icon: 'document' }),
    omit(
      'file.language',
      'Language',
      'One face and English copy rules; spelling follows the browser',
    ),
    later('file.pageSetup', 'Page setup', 'The GT theme is 16:9 at 1600 by 900'),
    now('file.printPreview', 'Print settings and preview', route('/print/:deckId'), {
      dividerBefore: true,
    }),
    now('file.print', 'Print', route('/print/:deckId'), { key: shortcut('Cmd+P') }),
  ],
};

const EDIT: Menu = {
  id: 'edit',
  label: 'Edit',
  accessKey: 'e',
  key: shortcut('Ctrl+Option+E', 'Alt+E'),
  items: [
    now('edit.undo', 'Undo', client('undo'), {
      key: shortcut('Cmd+Z'),
      enabled: 'canUndo',
      disabledReason: 'Nothing to undo',
    }),
    now('edit.redo', 'Redo', client('redo'), {
      key: shortcut('Cmd+Y or Cmd+Shift+Z'),
      enabled: 'canRedo',
      disabledReason: 'Nothing to redo',
    }),
    now('edit.cut', 'Cut', client('cut'), {
      key: shortcut('Cmd+X'),
      enabled: 'hasSelection',
      dividerBefore: true,
    }),
    now('edit.copy', 'Copy', client('copy'), { key: shortcut('Cmd+C'), enabled: 'hasSelection' }),
    now('edit.paste', 'Paste', client('paste'), { key: shortcut('Cmd+V'), enabled: 'canPaste' }),
    now(
      'edit.pasteWithoutFormatting',
      'Paste without formatting',
      client('pasteWithoutFormatting'),
      { key: shortcut('Cmd+Shift+V'), enabled: 'canPaste' },
    ),
    now('edit.delete', 'Delete', client('delete'), {
      key: shortcut('Delete', 'Delete'),
      enabled: 'hasSelection',
      doc: 'Deletes the selected slides, blocks or text; Undo brings them back',
    }),
    now('edit.duplicate', 'Duplicate', client('duplicate'), {
      key: shortcut('Cmd+D'),
      enabled: 'hasSelection',
      doc: 'Duplicates the selected slides in the filmstrip or the selected blocks on the canvas',
    }),
    now('edit.selectAll', 'Select all', client('selectAll'), {
      key: shortcut('Cmd+A'),
      dividerBefore: true,
    }),
    /* SPEC-2 0.61: Google's two key sequence stays unbound; the shortcuts dialog lists it greyed */
    now('edit.selectNone', 'Select none', client('selectNone'), {
      enabled: 'hasSelection',
      doc: 'Clears the selection on the slide and in the filmstrip; Esc does the same',
    }),
    now('edit.findReplace', 'Find and replace', dialog('Find and replace'), {
      key: shortcut('Cmd+Shift+H', 'Ctrl+H'),
      icon: 'search',
      dividerBefore: true,
    }),
  ],
};

const VIEW: Menu = {
  id: 'view',
  label: 'View',
  accessKey: 'v',
  key: shortcut('Ctrl+Option+V', 'Alt+V'),
  items: [
    now('view.slideshow', 'Slideshow', action('view.present', { on: true }), {
      key: shortcut('Cmd+Enter', 'Ctrl+F5'),
      icon: 'present',
    }),
    omit(
      'view.motion',
      'Motion',
      'Section 0.5; the one Transition stub sits in Google’s three Transition positions',
    ),
    omit(
      'view.themeBuilder',
      'Theme builder',
      'The GT theme is edited in the repository; Slide > Edit theme is the Later stub',
    ),
    now('view.gridView', 'Grid view', toggle('gridView'), {
      icon: 'grid',
      dividerBefore: true,
      doc: 'Every slide as a tile; drag to reorder',
    }),
    /* SPEC-2 0.81, 0.101: Zoom in and Zoom out step the ladder 25, 50, 75, 100, 125, 150, 200,
       300, 400, 800, 1600 from the current zoom; the presets and the Zoom box set a value */
    sub('view.zoom', 'Zoom', [
      now('view.zoom.in', 'Zoom in', client('zoomIn'), {
        key: shortcut('Cmd+Plus'),
        doc: 'The next step up, to 1600%',
      }),
      now('view.zoom.out', 'Zoom out', client('zoomOut'), {
        key: shortcut('Cmd+Minus'),
        doc: 'The next step down, to 25%',
      }),
      now('view.zoom.fit', 'Fit', action('view.zoom', { zoom: 'fit' }), {
        checked: { setting: 'zoom', value: 'fit' },
        dividerBefore: true,
        doc: 'The whole slide in the window',
      }),
      now('view.zoom.50', '50%', action('view.zoom', { zoom: 50 }), {
        checked: { setting: 'zoom', value: '50' },
      }),
      now('view.zoom.100', '100%', action('view.zoom', { zoom: 100 }), {
        key: shortcut('Cmd+0'),
        checked: { setting: 'zoom', value: '100' },
      }),
      now('view.zoom.200', '200%', action('view.zoom', { zoom: 200 }), {
        checked: { setting: 'zoom', value: '200' },
      }),
    ]),
    /* SPEC-2 0.77, 6.1 rows 29 and 30: the rulers in inches along the top and left of the stage, and
       the deck's guides; Google relabels Show ruler rather than checking it */
    now('view.showRuler', 'Show ruler', toggle('showRuler'), {
      plain: true,
      altLabel: { when: 'rulerShown', label: 'Hide ruler' },
      doc: 'Rulers in inches along the top and left of the slide; drag out of one to add a guide',
    }),
    sub('view.guides', 'Guides', [
      now('view.guides.show', 'Show guides', toggle('showGuides'), {
        doc: 'The guides on every slide; they never show when presenting',
      }),
      now(
        'view.guides.addVertical',
        'Add vertical guide',
        action('deck.guides', { add: [{ axis: 'x', at: SHEET_CENTER_X }] }),
        { doc: 'A guide at the centre of the slide; drag it into place' },
      ),
      now(
        'view.guides.addHorizontal',
        'Add horizontal guide',
        action('deck.guides', { add: [{ axis: 'y', at: SHEET_CENTER_Y }] }),
        { doc: 'A guide at the centre of the slide; drag it into place' },
      ),
      later('view.guides.edit', 'Edit guides', GUIDES_BY_HAND),
      now('view.guides.clear', 'Clear guides', action('deck.guides', { clear: true }), {
        enabled: 'hasGuides',
        disabledReason: 'Add a guide first',
        doc: 'Removes every guide from the presentation',
      }),
      /* 4.3: the right-click menu of a guide line; the shell names the guide under the pointer */
      now('view.guides.delete', 'Delete guide', action('deck.guides'), {
        enabled: 'hasGuides',
        contextOnly: true,
        doc: 'Removes this guide from every slide',
      }),
    ]),
    sub('view.snapTo', 'Snap to', [
      now('view.snapTo.guides', 'Guides', toggle('snapGuides'), {
        doc: 'Edges and centres of the other objects, the slide and the guides while you drag',
      }),
      now('view.snapTo.grid', 'Grid', toggle('snapGrid'), { doc: 'The 8 px grid' }),
    ]),
    sub(
      'view.comments',
      'Comments',
      [
        later('view.comments.hide', 'Hide comments', COMMENTS_LATER),
        later('view.comments.minimize', 'Minimize comments', COMMENTS_LATER),
        later('view.comments.expand', 'Expand comments', COMMENTS_LATER),
      ],
      { icon: 'chat', dividerBefore: true },
    ),
    sub(
      'view.livePointers',
      'Live pointers',
      [
        omit('view.livePointers.mine', 'Show my pointer', 'Needs presence (R10 C1)'),
        omit(
          'view.livePointers.collaborators',
          'Show collaborator pointers',
          'Needs presence (R10 C1)',
        ),
      ],
      { omitReason: 'Needs presence (R10 C1)' },
    ),
    now('view.showSpeakerNotes', 'Show speaker notes', toggle('speakerNotes'), {
      dividerBefore: true,
    }),
    now('view.showFilmstrip', 'Show filmstrip', toggle('filmstrip'), { icon: 'sidebar' }),
    sub(
      'view.mode',
      'Mode',
      [
        now('view.mode.editing', 'Editing', toggle('viewing', false), {
          doc: 'Handles, the notes pane and Format options',
        }),
        omit('view.mode.commenting', 'Commenting', 'Until comments exist'),
        now('view.mode.viewing', 'Viewing', toggle('viewing', true), {
          doc: 'Read only: no handles, no Format options',
        }),
      ],
      { dividerBefore: true },
    ),
    now('view.fullScreen', 'Full screen', toggle('compact'), {
      key: shortcut('Ctrl+Shift+F', 'Ctrl+Shift+F'),
      icon: 'fullscreen',
      doc: 'Hides the menus and the toolbar; Esc restores them',
    }),
    now('view.showSections', 'Show sections', toggle('sections'), {
      turboslide: true,
      dividerBefore: true,
      doc: 'Section names between the slides in the filmstrip',
    }),
    sub(
      'view.appearance',
      'Appearance',
      [
        now('view.appearance.light', 'Light', toggle('appearance', 'light')),
        now('view.appearance.dark', 'Dark', toggle('appearance', 'dark')),
        now('view.appearance.match', 'Match the presentation', toggle('appearance', 'match')),
      ],
      { turboslide: true, icon: 'swatch' },
    ),
  ],
};

const INSERT: Menu = {
  id: 'insert',
  label: 'Insert',
  accessKey: 'i',
  key: shortcut('Ctrl+Option+I', 'Alt+I'),
  items: [
    sub(
      'insert.image',
      'Image',
      [
        now('insert.image.upload', 'Upload from computer', action('asset.add'), {
          doc: 'Pictures up to 25 MB',
        }),
        omit(
          'insert.image.stockWeb',
          'Stock & web',
          'Google services and the licensing hazard R07 names',
        ),
        omit('insert.image.drivePhotos', 'Drive & Photos', GOOGLE_SERVICE),
        omit('insert.image.camera', 'Camera', GOOGLE_SERVICE),
        now('insert.image.byUrl', 'By URL', dialog('Image by URL')),
        now(
          'insert.image.fromThisPresentation',
          'From this presentation',
          dialog('Pictures in this presentation'),
          { turboslide: true },
        ),
      ],
      { icon: 'photo' },
    ),
    now('insert.textBox', 'Text box', action('block.insert'), {
      icon: 'text',
      doc: 'Click to place a box, or drag to draw one',
    }),
    later('insert.audio', 'Audio', NO_MEDIA, { icon: 'speaker-wave' }),
    later('insert.video', 'Video', NO_MEDIA, { icon: 'video-camera' }),
    /* SPEC-2 4.1: each category is a glyph grid drawn from the shape table; a pick arms the draw
       tool. The rows under Shapes and Arrows are the legacy presets the draw tools already know;
       the grid replaces them as the drawn plate once the shell renders it. */
    sub(
      'insert.shape',
      'Shape',
      [
        sub(
          'insert.shape.shapes',
          'Shapes',
          [
            now('insert.shape.shapes.rectangle', 'Rectangle', action('block.insert'), {
              turboslide: true,
            }),
            now('insert.shape.shapes.rounded', 'Rounded rectangle', action('block.insert'), {
              turboslide: true,
            }),
            now('insert.shape.shapes.ellipse', 'Ellipse', action('block.insert'), {
              turboslide: true,
            }),
          ],
          { effect: shapeGrid('shapes') },
        ),
        sub(
          'insert.shape.arrows',
          'Arrows',
          [
            now('insert.shape.arrows.arrow', 'Arrow', action('block.insert'), {
              turboslide: true,
            }),
          ],
          { effect: shapeGrid('arrows') },
        ),
        now('insert.shape.callouts', 'Callouts', shapeGrid('callouts'), {
          doc: 'A shape with a pointer you can drag',
        }),
        now('insert.shape.equation', 'Equation', shapeGrid('equation'), {
          doc: 'Plus, minus, multiply, divide, equal and not equal',
        }),
      ],
      { icon: 'box' },
    ),
    now(
      'insert.table',
      'Table',
      { kind: 'submenu', dynamic: 'tableGrid', action: 'block.insert' },
      {
        icon: 'table',
        enabled: 'hasSlide',
        doc: 'Point at the size you want, up to 20 columns by 20 rows',
      },
    ),
    sub(
      'insert.chart',
      'Chart',
      [
        now('insert.chart.bar', 'Bar', action('block.insert', { chart: 'bar' }), {
          enabled: 'hasSlide',
        }),
        now('insert.chart.column', 'Column', action('block.insert', { chart: 'column' }), {
          enabled: 'hasSlide',
        }),
        now('insert.chart.line', 'Line', action('block.insert', { chart: 'line' }), {
          enabled: 'hasSlide',
        }),
        now('insert.chart.pie', 'Pie', action('block.insert', { chart: 'pie' }), {
          enabled: 'hasSlide',
        }),
        omit('insert.chart.fromSheets', 'From Sheets', GOOGLE_SERVICE),
      ],
      { icon: 'chart-bar', doc: 'A chart with sample numbers you edit in Format options' },
    ),
    now('insert.diagram', 'Diagram', panel('Diagram'), {
      icon: 'rectangle-group',
      enabled: 'hasSlide',
      doc: 'Grid, Hierarchy, Timeline, Process, Relationship or Cycle',
    }),
    now('insert.wordArt', 'Word art', client('wordArt'), {
      enabled: 'hasSlide',
      doc: 'Type your text and press Enter',
    }),
    sub(
      'insert.line',
      'Line',
      [
        now('insert.line.line', 'Line', action('block.insert')),
        now('insert.line.arrow', 'Arrow', action('block.insert')),
        now('insert.line.rule', 'Rule', action('block.insert'), {
          turboslide: true,
          doc: 'A hairline across the slot',
        }),
        now('insert.line.elbowConnector', 'Elbow connector', action('block.insert'), {
          google: 'Elbow Connector',
          enabled: 'hasSlide',
          doc: 'Turns a corner between two shapes and follows them when they move',
        }),
        now('insert.line.curvedConnector', 'Curved connector', action('block.insert'), {
          google: 'Curved Connector',
          enabled: 'hasSlide',
          doc: 'Bends between two shapes and follows them when they move',
        }),
        now('insert.line.curve', 'Curve', action('block.insert'), {
          enabled: 'hasSlide',
          doc: 'Click each point; double click to finish',
        }),
        now('insert.line.polyline', 'Polyline', action('block.insert'), {
          enabled: 'hasSlide',
          doc: 'Click each corner; double click to finish',
        }),
        now('insert.line.scribble', 'Scribble', action('block.insert'), {
          enabled: 'hasSlide',
          doc: 'Draw freehand',
        }),
      ],
      { icon: 'minus' },
    ),
    now('insert.specialCharacters', 'Special characters', dialog('Insert special characters'), {
      doc: 'Arrows, punctuation, currency, math, symbols and emoji, by name',
    }),
    omit('insert.animation', 'Animation', 'Section 0.5'),
    now('insert.link', 'Link', client('link'), {
      key: shortcut('Cmd+K'),
      icon: 'link',
      enabled: 'linkable',
      disabledReason: 'Select text or one block first',
      dividerBefore: true,
    }),
    later('insert.comment', 'Comment', COMMENTS_LATER, {
      key: shortcut('Cmd+Option+M'),
      icon: 'chat',
    }),
    now('insert.newSlide', 'New slide', action('slide.new'), {
      key: shortcut('Ctrl+M', 'Ctrl+M'),
      icon: 'plus',
      dividerBefore: true,
      doc: 'After the current slide, with the same layout',
    }),
    now('insert.slideNumbers', 'Slide numbers', dialog('Slide numbers')),
    omit('insert.placeholder', 'Placeholder', 'Theme builder only'),
    later('insert.templates', 'Templates', START_FROM_GT),
    later('insert.buildingBlocks', 'Building blocks', START_FROM_GT),
    omit('insert.speakerSpotlight', 'Speaker spotlight', 'Meet only'),
    now('insert.icon', 'Icon', action('block.insert'), {
      turboslide: true,
      icon: 'sparkles',
      dividerBefore: true,
      doc: 'One of the theme’s icons',
    }),
    now('insert.material', 'Material', action('block.insert'), {
      turboslide: true,
      icon: 'cube',
      doc: 'A captured picture from the theme',
    }),
  ],
};

const FORMAT: Menu = {
  id: 'format',
  label: 'Format',
  accessKey: 'o',
  key: shortcut('Ctrl+Option+O', 'Alt+O'),
  items: [
    sub(
      'format.text',
      'Text',
      [
        now('format.text.bold', 'Bold', action('block.set'), {
          key: shortcut('Cmd+B'),
          enabled: 'textBlockSelected',
        }),
        now('format.text.italic', 'Italic', action('text.style', { mark: 'i' }), {
          key: shortcut('Cmd+I'),
          enabled: 'textBlockSelected',
          icon: 'italic',
        }),
        now('format.text.underline', 'Underline', action('text.style', { mark: 'u' }), {
          key: shortcut('Cmd+U'),
          enabled: 'textBlockSelected',
          icon: 'underline',
        }),
        now('format.text.strikethrough', 'Strikethrough', action('text.style', { mark: 's' }), {
          key: shortcut('Cmd+Shift+X', 'Alt+Shift+5'),
          enabled: 'textBlockSelected',
          icon: 'strikethrough',
          doc: 'Strikes through the selected text, or a whole list item',
        }),
        now('format.text.superscript', 'Superscript', action('text.style', { mark: 'sup' }), {
          key: shortcut('Cmd+.'),
          enabled: 'textBlockSelected',
        }),
        now('format.text.subscript', 'Subscript', action('text.style', { mark: 'sub' }), {
          key: shortcut('Cmd+,'),
          enabled: 'textBlockSelected',
          doc: 'Your browser may take this key; the Format menu has the item',
        }),
        sub(
          'format.text.size',
          'Size',
          [
            now('format.text.size.increase', 'Increase font size', action('block.set'), {
              key: shortcut('Cmd+Shift+>'),
              enabled: 'textBlockSelected',
            }),
            now('format.text.size.decrease', 'Decrease font size', action('block.set'), {
              key: shortcut('Cmd+Shift+<'),
              enabled: 'textBlockSelected',
            }),
          ],
          { dividerBefore: true },
        ),
        sub(
          'format.text.capitalization',
          'Capitalization',
          [
            now(
              'format.text.capitalization.lower',
              'lowercase',
              action('text.case', { mode: 'lower' }),
              { enabled: 'textBlockSelected' },
            ),
            now(
              'format.text.capitalization.upper',
              'UPPERCASE',
              action('text.case', { mode: 'upper' }),
              { enabled: 'textBlockSelected' },
            ),
            now(
              'format.text.capitalization.title',
              'Title Case',
              action('text.case', { mode: 'title' }),
              { enabled: 'textBlockSelected' },
            ),
          ],
          { enabled: 'textBlockSelected', doc: 'Rewrites the selected text' },
        ),
      ],
      { icon: 'text' },
    ),
    sub('format.alignIndent', 'Align & indent', [
      now('format.alignIndent.left', 'Left', action('block.set'), {
        key: shortcut('Cmd+Shift+L'),
        enabled: 'textBlockSelected',
      }),
      now('format.alignIndent.center', 'Center', action('block.set'), {
        key: shortcut('Cmd+Shift+E'),
        enabled: 'textBlockSelected',
      }),
      now('format.alignIndent.right', 'Right', action('block.set'), {
        key: shortcut('Cmd+Shift+R'),
        enabled: 'textBlockSelected',
      }),
      now('format.alignIndent.justified', 'Justified', action('block.set'), {
        key: shortcut('Cmd+Shift+J'),
        enabled: 'textBlockSelected',
      }),
      now(
        'format.alignIndent.increaseIndent',
        'Increase indent',
        action('text.indent', { by: 1 }),
        {
          key: shortcut('Cmd+]'),
          enabled: 'textBlockSelected',
          icon: 'bars-arrow-down',
          dividerBefore: true,
          doc: 'Moves the paragraph right, or a list item down a level',
        },
      ),
      now(
        'format.alignIndent.decreaseIndent',
        'Decrease indent',
        action('text.indent', { by: -1 }),
        {
          key: shortcut('Cmd+['),
          enabled: 'textBlockSelected',
          icon: 'bars-arrow-up',
          doc: 'Moves the paragraph left, or a list item up a level',
        },
      ),
      later(
        'format.alignIndent.indentationOptions',
        'Indentation options',
        'Set the indent under Text fitting',
      ),
    ]),
    sub('format.spacing', 'Line & paragraph spacing', [
      now('format.spacing.single', 'Single', action('block.set'), {
        enabled: 'textBlockSelected',
      }),
      now('format.spacing.1_15', '1.15', action('block.set'), { enabled: 'textBlockSelected' }),
      now('format.spacing.1_5', '1.5', action('block.set'), { enabled: 'textBlockSelected' }),
      now('format.spacing.double', 'Double', action('block.set'), {
        enabled: 'textBlockSelected',
      }),
      now(
        'format.spacing.addBefore',
        'Add space before paragraph',
        action('text.spacing', { before: 8 }),
        {
          enabled: 'textBlockSelected',
          altLabel: { when: 'spaceBeforeSet', label: 'Remove space before paragraph' },
          dividerBefore: true,
        },
      ),
      now(
        'format.spacing.addAfter',
        'Add space after paragraph',
        action('text.spacing', { after: 8 }),
        {
          enabled: 'textBlockSelected',
          altLabel: { when: 'spaceAfterSet', label: 'Remove space after paragraph' },
        },
      ),
      now('format.spacing.custom', 'Custom spacing', dialog('Custom spacing'), {
        enabled: 'textBlockSelected',
        dividerBefore: true,
        doc: 'Line spacing, and the space before and after each paragraph',
      }),
    ]),
    sub('format.bulletsNumbering', 'Bullets & numbering', [
      now(
        'format.bulletsNumbering.numbered',
        'Numbered list',
        { kind: 'submenu', dynamic: 'numberPresets', action: 'text.list' },
        {
          key: shortcut('Cmd+Shift+7'),
          enabled: 'textBlockSelected',
          icon: 'numbered-list',
          doc: 'Six numbering styles; the button and the key apply the first',
        },
      ),
      now(
        'format.bulletsNumbering.bulleted',
        'Bulleted list',
        { kind: 'submenu', dynamic: 'bulletPresets', action: 'text.list' },
        {
          key: shortcut('Cmd+Shift+8'),
          enabled: 'textBlockSelected',
          icon: 'list-bullet',
          doc: 'Nine bullet styles; the button and the key apply the first',
        },
      ),
      sub(
        'format.bulletsNumbering.listOptions',
        'List options',
        [
          later(
            'format.bulletsNumbering.listOptions.restart',
            'Restart numbering',
            NUMBERING_STARTS,
          ),
          later(
            'format.bulletsNumbering.listOptions.prefixSuffix',
            'Edit prefix and suffix',
            NUMBERING_STARTS,
          ),
          now(
            'format.bulletsNumbering.listOptions.moreBullets',
            'More bullets',
            dialog('Insert special characters'),
            { enabled: 'listItemSelected' },
          ),
        ],
        { enabled: 'listItemSelected' },
      ),
    ]),
    sub(
      'format.table',
      'Table',
      [
        now('format.table.insertRowAbove', 'Insert row above', action('block.set'), {
          enabled: 'tableCellSelected',
        }),
        now('format.table.insertRowBelow', 'Insert row below', action('block.set'), {
          enabled: 'tableCellSelected',
        }),
        now('format.table.insertColumnLeft', 'Insert column left', action('block.set'), {
          enabled: 'tableCellSelected',
        }),
        now('format.table.insertColumnRight', 'Insert column right', action('block.set'), {
          enabled: 'tableCellSelected',
        }),
        now('format.table.deleteRow', 'Delete row', action('block.set'), {
          enabled: 'tableCellSelected',
          dividerBefore: true,
        }),
        now('format.table.deleteColumn', 'Delete column', action('block.set'), {
          enabled: 'tableCellSelected',
        }),
        now('format.table.deleteTable', 'Delete table', action('block.remove'), {
          enabled: 'tableCellSelected',
        }),
        now('format.table.distributeRows', 'Distribute rows', action('block.set'), {
          enabled: 'tableCellSelected',
          dividerBefore: true,
        }),
        now('format.table.distributeColumns', 'Distribute columns', action('block.set'), {
          enabled: 'tableCellSelected',
        }),
        now('format.table.mergeCells', 'Merge cells', action('table.merge'), {
          enabled: 'cellRangeSelected',
          disabledReason: 'Select two or more cells first',
          dividerBefore: true,
        }),
        now('format.table.unmergeCells', 'Unmerge cells', action('table.unmerge'), {
          enabled: 'mergedCellSelected',
          disabledReason: 'Select a merged cell first',
        }),
      ],
      { icon: 'table', dividerBefore: true },
    ),
    sub(
      'format.image',
      'Image',
      [
        now('format.image.cropImage', 'Crop image', client('cropMode'), {
          enabled: 'imageSelected',
          icon: 'viewfinder-circle',
          doc: 'Drag the handles to crop; press Enter to finish',
        }),
        now(
          'format.image.maskImage',
          'Mask image',
          { kind: 'submenu', dynamic: 'shapes', action: 'block.mask' },
          { enabled: 'imageSelected', doc: 'Shows the picture inside a shape' },
        ),
        sub(
          'format.image.replaceImage',
          'Replace image',
          replaceImageItems('format.image.replaceImage'),
          { enabled: 'imageSelected' },
        ),
        now('format.image.resetImage', 'Reset image', action('block.resetImage'), {
          enabled: 'imageEdited',
          disabledReason: 'The picture is not cropped, masked or adjusted',
          icon: 'arrow-uturn-left',
        }),
        now('format.image.imageOptions', 'Image options', panel('Format options'), {
          enabled: 'imageSelected',
        }),
      ],
      { icon: 'photo' },
    ),
    /* SPEC-2 0.27, 0.62: Border color and Border weight open the toolbar's pickers anchored to
       the row and write the block's border, or a word art block's outline */
    sub('format.bordersLines', 'Borders & lines', [
      now('format.bordersLines.borderColor', 'Border color', client('borderColorPicker'), {
        enabled: 'hasBorderField',
        disabledReason: SELECT_BORDERED,
      }),
      now('format.bordersLines.borderWeight', 'Border weight', client('borderWeightPicker'), {
        enabled: 'hasBorderField',
        disabledReason: SELECT_BORDERED,
      }),
      sub(
        'format.bordersLines.borderDash',
        'Border dash',
        dashItems('format.bordersLines.borderDash', 'blockSelected'),
        { enabled: 'blockSelected' },
      ),
      sub(
        'format.bordersLines.lineStart',
        'Line start',
        lineEndItems('format.bordersLines.lineStart', 'start'),
        { enabled: 'lineSelected', dividerBefore: true },
      ),
      sub(
        'format.bordersLines.lineEnd',
        'Line end',
        lineEndItems('format.bordersLines.lineEnd', 'end'),
        { enabled: 'lineSelected' },
      ),
    ]),
    now('format.formatOptions', 'Format options', panel('Format options'), {
      icon: 'adjustments',
      dividerBefore: true,
    }),
    now('format.clearFormatting', 'Clear formatting', action('block.set'), {
      key: shortcut('Cmd+\\', 'Ctrl+\\ or Ctrl+Space'),
      enabled: 'blockSelected',
      doc: 'Removes the size, weight, colour and border overrides',
    }),
    /* 4.3: on the right-click menus and in Search the menus; Format options carries the sections */
    now('format.altText', 'Alt text', panel('Format options'), {
      key: shortcut('Cmd+Option+Y'),
      enabled: 'blockSelected',
      contextOnly: true,
      doc: 'The description a screen reader reads',
    }),
    now('format.textFitting', 'Text fitting', panel('Format options'), {
      enabled: 'textBlockSelected',
      contextOnly: true,
      doc: 'Do not autofit, Shrink text on overflow, or Resize shape to fit text',
    }),
    now('format.dropShadow', 'Drop shadow', panel('Format options'), {
      enabled: 'blockSelected',
      contextOnly: true,
      doc: 'Colour, transparency, angle, distance and blur',
    }),
    /* SPEC-2 4.3: the shape and chart right-click menus; Turboslide additions (section 10) */
    now(
      'format.changeShape',
      'Change shape',
      { kind: 'submenu', dynamic: 'shapes', action: 'shape.set' },
      { enabled: 'shapeSelected', contextOnly: true, turboslide: true },
    ),
    now('format.editData', 'Edit data', panel('Format options'), {
      enabled: 'chartSelected',
      contextOnly: true,
      turboslide: true,
      doc: 'The categories and series of the chart',
    }),
    sub(
      'format.chartType',
      'Chart type',
      [
        now('format.chartType.bar', 'Bar', action('chart.setKind', { kind: 'bar' }), {
          enabled: 'chartSelected',
          turboslide: true,
        }),
        now('format.chartType.column', 'Column', action('chart.setKind', { kind: 'column' }), {
          enabled: 'chartSelected',
          turboslide: true,
        }),
        now('format.chartType.line', 'Line', action('chart.setKind', { kind: 'line' }), {
          enabled: 'chartSelected',
          turboslide: true,
        }),
        now('format.chartType.pie', 'Pie', action('chart.setKind', { kind: 'pie' }), {
          enabled: 'chartSelected',
          turboslide: true,
          doc: 'Keeps the first series',
        }),
      ],
      { enabled: 'chartSelected', contextOnly: true, turboslide: true },
    ),
  ],
};

const SLIDE: Menu = {
  id: 'slide',
  label: 'Slide',
  accessKey: 's',
  key: shortcut('Ctrl+Option+S', 'Alt+S'),
  items: [
    now('slide.newSlide', 'New slide', action('slide.new'), {
      key: shortcut('Ctrl+M', 'Ctrl+M'),
      icon: 'plus',
      doc: 'After the current slide, with the same layout',
    }),
    now('slide.duplicateSlide', 'Duplicate slide', action('slide.duplicate'), {
      key: shortcut('Cmd+D'),
      icon: 'slide',
      enabled: 'hasSlide',
    }),
    now('slide.deleteSlide', 'Delete slide', action('slide.remove'), {
      enabled: 'hasSlide',
      doc: 'Undo brings it back',
    }),
    now('slide.skipSlide', 'Skip slide', action('slide.skip'), {
      enabled: 'hasSlide',
      altLabel: { when: 'slideSkipped', label: 'Unskip slide' },
      doc: 'A skipped slide stays in the filmstrip and leaves the slideshow and the downloads',
    }),
    sub(
      'slide.moveSlide',
      'Move slide',
      [
        now('slide.moveSlide.up', 'Move slide up', action('slide.move'), {
          key: shortcut('Cmd+Up'),
          enabled: 'canMoveUp',
        }),
        now('slide.moveSlide.down', 'Move slide down', action('slide.move'), {
          key: shortcut('Cmd+Down'),
          enabled: 'canMoveDown',
        }),
        now('slide.moveSlide.toBeginning', 'Move slide to beginning', action('slide.move'), {
          key: shortcut('Cmd+Shift+Up'),
          enabled: 'canMoveUp',
        }),
        now('slide.moveSlide.toEnd', 'Move slide to end', action('slide.move'), {
          key: shortcut('Cmd+Shift+Down'),
          enabled: 'canMoveDown',
        }),
      ],
      { dividerBefore: true },
    ),
    /* SPEC-2 0.74, 4.1: one Background dialog on every slide kind; Color writes the fill and
       Choose image inserts a picture object at the bottom of the stack (the slide converts to the
       canvas first), so the picture kinds' Replace image submenu of round one retires */
    now('slide.changeBackground', 'Change background', dialog('Background'), {
      enabled: 'hasSlide',
      icon: 'photo',
      dividerBefore: true,
      doc: 'A colour or a picture behind the slide',
    }),
    now(
      'slide.applyLayout',
      'Apply layout',
      { kind: 'submenu', dynamic: 'layouts', action: 'slide.applyLayout' },
      {
        icon: 'columns',
        enabled: 'hasSlide',
        doc: 'Keeps your content and moves it into the new layout',
      },
    ),
    later('slide.transition', 'Transition', STILL_SLIDES),
    /* SPEC-2 0.75, 12: the frame, the wordmark and the counter stay theme level until Edit theme */
    later(
      'slide.editTheme',
      'Edit theme',
      'The footer mark, the slide counter and the rails belong to the GT theme',
      { dividerBefore: true },
    ),
    now('slide.changeTheme', 'Change theme', panel('Themes'), { icon: 'swatch' }),
  ],
};

const ARRANGE: Menu = {
  id: 'arrange',
  label: 'Arrange',
  accessKey: 'r',
  key: shortcut('Ctrl+Option+R', 'Alt+R'),
  items: [
    sub(
      'arrange.order',
      'Order',
      [
        now(
          'arrange.order.bringToFront',
          'Bring to front',
          action('block.order', { to: 'front' }),
          { key: shortcut('Cmd+Shift+Up'), enabled: 'canBringToFront' },
        ),
        now(
          'arrange.order.bringForward',
          'Bring forward',
          action('block.order', { to: 'forward' }),
          { key: shortcut('Cmd+Up'), enabled: 'canBringForward' },
        ),
        now(
          'arrange.order.sendBackward',
          'Send backward',
          action('block.order', { to: 'backward' }),
          { key: shortcut('Cmd+Down'), enabled: 'canSendBackward' },
        ),
        now('arrange.order.sendToBack', 'Send to back', action('block.order', { to: 'back' }), {
          key: shortcut('Cmd+Shift+Down'),
          enabled: 'canSendToBack',
        }),
      ],
      { icon: 'queue-list', enabled: 'objectSelected', disabledReason: SELECT_OBJECT },
    ),
    /* SPEC-2 0.80, 4.1: Align is enabled on every slide kind with one object selected (it aligns
       to the slide) or several (to the selection); the action picks the reference when `to` is
       absent. The first pick on a grammar slide converts it to the canvas (1.6). */
    sub(
      'arrange.align',
      'Align',
      [
        now('arrange.align.left', 'Left', action('block.align', { edge: 'left' }), {
          enabled: 'objectSelected',
          disabledReason: SELECT_OBJECT,
        }),
        now('arrange.align.center', 'Center', action('block.align', { edge: 'center' }), {
          enabled: 'objectSelected',
          disabledReason: SELECT_OBJECT,
        }),
        now('arrange.align.right', 'Right', action('block.align', { edge: 'right' }), {
          enabled: 'objectSelected',
          disabledReason: SELECT_OBJECT,
        }),
        now('arrange.align.top', 'Top', action('block.align', { edge: 'top' }), {
          enabled: 'objectSelected',
          disabledReason: SELECT_OBJECT,
          dividerBefore: true,
        }),
        now('arrange.align.middle', 'Middle', action('block.align', { edge: 'middle' }), {
          enabled: 'objectSelected',
          disabledReason: SELECT_OBJECT,
        }),
        now('arrange.align.bottom', 'Bottom', action('block.align', { edge: 'bottom' }), {
          enabled: 'objectSelected',
          disabledReason: SELECT_OBJECT,
        }),
      ],
      {
        icon: 'columns',
        enabled: 'objectSelected',
        disabledReason: SELECT_OBJECT,
        doc: 'One object lines up with the slide; several line up with each other',
      },
    ),
    sub(
      'arrange.distribute',
      'Distribute',
      [
        now(
          'arrange.distribute.horizontally',
          'Horizontally',
          action('block.distribute', { axis: 'x' }),
          { enabled: 'threeOrMore', disabledReason: SELECT_THREE_OBJECTS },
        ),
        now(
          'arrange.distribute.vertically',
          'Vertically',
          action('block.distribute', { axis: 'y' }),
          { enabled: 'threeOrMore', disabledReason: SELECT_THREE_OBJECTS },
        ),
      ],
      { enabled: 'threeOrMore', disabledReason: SELECT_THREE_OBJECTS },
    ),
    /* SPEC-2 0.80: Center on page is block.align against the sheet, on every slide kind */
    sub(
      'arrange.centerOnPage',
      'Center on page',
      [
        now(
          'arrange.centerOnPage.horizontally',
          'Horizontally',
          action('block.align', { edge: 'center', to: 'sheet' }),
          { enabled: 'objectSelected', disabledReason: SELECT_OBJECT },
        ),
        now(
          'arrange.centerOnPage.vertically',
          'Vertically',
          action('block.align', { edge: 'middle', to: 'sheet' }),
          { enabled: 'objectSelected', disabledReason: SELECT_OBJECT },
        ),
      ],
      { enabled: 'objectSelected', disabledReason: SELECT_OBJECT },
    ),
    /* SPEC-2 0.2, 0.3, 4.1: rotation, flip and groups on every object of every slide kind */
    sub(
      'arrange.rotate',
      'Rotate',
      [
        now(
          'arrange.rotate.clockwise',
          'Rotate clockwise 90°',
          action('block.rotate', { by: 90 }),
          { enabled: 'rotatable', disabledReason: SELECT_OBJECT },
        ),
        now(
          'arrange.rotate.counterClockwise',
          'Rotate counter-clockwise 90°',
          action('block.rotate', { by: -90 }),
          { enabled: 'rotatable', disabledReason: SELECT_OBJECT },
        ),
        now(
          'arrange.rotate.flipHorizontally',
          'Flip horizontally',
          action('block.flip', { axis: 'h' }),
          { enabled: 'rotatable', disabledReason: SELECT_OBJECT },
        ),
        now(
          'arrange.rotate.flipVertically',
          'Flip vertically',
          action('block.flip', { axis: 'v' }),
          { enabled: 'rotatable', disabledReason: SELECT_OBJECT },
        ),
      ],
      {
        icon: 'arrow-path',
        enabled: 'rotatable',
        disabledReason: SELECT_OBJECT,
        dividerBefore: true,
        doc: 'Option and the Left or Right arrow turn the selection by 15 degrees; with Shift, by 1',
      },
    ),
    now('arrange.group', 'Group', action('block.group'), {
      key: shortcut('Cmd+Option+G'),
      icon: 'rectangle-group',
      enabled: 'canGroup',
      disabledReason: SELECT_OBJECTS,
      dividerBefore: true,
      doc: 'Moves, resizes, rotates and formats the objects together',
    }),
    now('arrange.ungroup', 'Ungroup', action('block.ungroup'), {
      key: shortcut('Cmd+Option+Shift+G'),
      enabled: 'groupSelected',
      disabledReason: 'Select a group first',
    }),
    now('arrange.regroup', 'Regroup', action('block.regroup'), {
      enabled: 'canRegroup',
      disabledReason: 'Available after Ungroup, while the objects are still on the slide',
    }),
  ],
};

const TOOLS: Menu = {
  id: 'tools',
  label: 'Tools',
  accessKey: 't',
  key: shortcut('Ctrl+Option+T', 'Alt+T'),
  items: [
    sub(
      'tools.spelling',
      'Spelling',
      [
        later(
          'tools.spelling.spellCheck',
          'Spell check',
          'Your browser underlines misspellings and offers suggestions on right-click',
        ),
        now('tools.spelling.underlineErrors', 'Underline errors', toggle('spellcheck'), {
          doc: 'Your browser’s spelling marks in text and notes',
        }),
        omit(
          'tools.spelling.personalDictionary',
          'Personal dictionary',
          'The browser’s dictionary applies',
        ),
      ],
      { icon: 'language' },
    ),
    omit('tools.explore', 'Explore', 'Retired by Google in 2024 (R02 8.6)'),
    omit('tools.linkedObjects', 'Linked objects', 'No linked sources'),
    omit('tools.dictionary', 'Dictionary', GOOGLE_SERVICE),
    omit('tools.qaHistory', 'Q&A history', GOOGLE_SERVICE),
    omit('tools.dictateNotes', 'Dictate speaker notes', GOOGLE_SERVICE),
    later(
      'tools.preferences',
      'Preferences',
      'Text fitting is set per text box in Format options; the ruler reads inches',
    ),
    omit(
      'tools.accessibilitySettings',
      'Accessibility settings',
      'The browser’s screen reader works on the DOM',
    ),
    omit('tools.activityDashboard', 'Activity dashboard', 'No identity'),
    now('tools.checkSlides', 'Check slides', panel('Suggestions for this slide'), {
      turboslide: true,
      icon: 'check-badge',
      dividerBefore: true,
      doc: 'One suggestion per row, with Fix where there is one',
    }),
    sub(
      'tools.advanced',
      'Advanced',
      [
        now('tools.advanced.showSource', 'Show source', toggle('sourceDrawer'), {
          turboslide: true,
          icon: 'code',
        }),
        now('tools.advanced.sideBySide', 'Light and dark side by side', toggle('sideBySide'), {
          turboslide: true,
        }),
        now(
          'tools.advanced.suggestionMarks',
          'Show suggestion marks on the slide',
          toggle('suggestionMarks'),
          { turboslide: true },
        ),
        now('tools.advanced.showIds', 'Show slide and block ids', toggle('showIds'), {
          turboslide: true,
        }),
        now('tools.advanced.renderSlide', 'Render this slide', action('render.slide'), {
          turboslide: true,
          enabled: 'hasSlide',
        }),
        now('tools.advanced.changeHistory', 'Change history', panel('Change history'), {
          turboslide: true,
          icon: 'clock',
        }),
        now('tools.advanced.sectionsTree', 'Show sections as a tree', toggle('sectionsTree'), {
          turboslide: true,
        }),
        now('tools.advanced.readAsBook', 'Read as a book', toggle('book'), {
          turboslide: true,
          icon: 'book',
        }),
        now(
          'tools.advanced.picturesMaterials',
          'Pictures and materials',
          panel('Pictures and materials'),
          { turboslide: true, icon: 'cube' },
        ),
        now('tools.advanced.runAction', 'Run an action…', client('runAction'), {
          turboslide: true,
          doc: 'Every action by name',
        }),
      ],
      { turboslide: true, icon: 'beaker' },
    ),
  ],
};

const EXTENSIONS: Menu = {
  id: 'extensions',
  label: 'Extensions',
  accessKey: 'x',
  key: shortcut('Ctrl+Option+X', 'Alt+X'),
  items: [
    sub(
      'extensions.addOns',
      'Add-ons',
      [
        omit('extensions.addOns.get', 'Get add-ons', 'No marketplace'),
        omit('extensions.addOns.manage', 'Manage add-ons', 'No marketplace'),
      ],
      { omitReason: 'No marketplace' },
    ),
    omit('extensions.installedAddOns', 'Installed add-ons', 'No marketplace', {
      google: 'Installed add-on entries',
    }),
    omit(
      'extensions.appsScript',
      'Apps Script',
      `${GOOGLE_SERVICE}; the name is not reused for unrelated things (section 0.26)`,
    ),
    omit(
      'extensions.appSheet',
      'AppSheet',
      `${GOOGLE_SERVICE}; the name is not reused for unrelated things (section 0.26)`,
    ),
    now('extensions.agentAccess', 'Agent access', dialog('Agent access'), {
      turboslide: true,
      icon: 'code',
      doc: 'The addresses and commands an assistant uses to read and edit this presentation',
    }),
    now('extensions.embedInSite', 'Embed in a site', dialog('Publish to the web'), {
      turboslide: true,
      icon: 'external',
      doc: 'The snippet that shows this presentation on a web page',
    }),
  ],
};

const HELP: Menu = {
  id: 'help',
  label: 'Help',
  accessKey: 'h',
  key: shortcut('Ctrl+Option+H', 'Alt+H'),
  items: [
    now('help.searchMenus', 'Search the menus', client('toolFinder'), {
      key: shortcut('Option+/', 'Alt+/ or Alt+Z'),
      icon: 'search',
      doc: 'Type the name of any menu item',
    }),
    now('help.help', 'Help', dialog('Help'), {
      icon: 'help',
      doc: 'The ten most common tasks, one line each',
    }),
    omit('help.training', 'Training', 'No training site'),
    omit('help.updates', 'Updates', 'No release notes page'),
    /* SPEC-2 0.28: the repository's issue page, in a new tab */
    now(
      'help.improve',
      'Help Turboslide improve',
      route('https://github.com/Kevin-Liu-01/Turboslide/issues/new', true),
      { google: 'Help Slides improve', doc: 'Report a problem or ask for something, in a new tab' },
    ),
    omit('help.privacyPolicy', 'Privacy Policy', 'No policy page'),
    omit('help.termsOfService', 'Terms of Service', 'No terms page'),
    now('help.keyboardShortcuts', 'Keyboard shortcuts', dialog('Keyboard shortcuts'), {
      key: shortcut('Cmd+/'),
      dividerBefore: true,
    }),
  ],
};

/** The ten menus in Google's order (R01 row 2). */
export const MENUS: ReadonlyArray<Menu> = [
  FILE,
  EDIT,
  VIEW,
  INSERT,
  FORMAT,
  SLIDE,
  ARRANGE,
  TOOLS,
  EXTENSIONS,
  HELP,
];

/** Google menus the bar does not carry at all, with the reason. */
export const OMITTED_MENUS: ReadonlyArray<{ label: string; reason: string }> = [
  {
    label: 'Accessibility',
    reason:
      'Appears in Google only with screen reader support on; the browser’s screen reader reads the page as it is',
  },
];

// ---------------------------------------------------------------------------------------------
// 3.1 The toolbar

export type ToolbarControl = {
  /** the `data-control` id */
  control: string;
  label: string;
  icon?: IconName;
  /** a text button rather than an icon square */
  text?: true;
  key?: Shortcut;
  status: MenuStatus;
  stubReason?: string;
  /** the menu item the button runs */
  item?: string;
  /** a split button: the arrow opens this item's submenu */
  arrow?: string;
  enabled?: MenuPredicate;
  disabledReason?: string;
  dividerBefore?: true;
  doc?: string;
  /** a control Google's toolbar does not have (SPEC-2 section 10) */
  turboslide?: true;
};

/** Positions 1 to 7 (SPEC 3.1); never collapse. */
export const TOOLBAR_HEAD: ReadonlyArray<ToolbarControl> = [
  {
    control: 'toolbar.search',
    label: 'Search the menus',
    icon: 'search',
    key: shortcut('Option+/', 'Alt+/ or Alt+Z'),
    status: 'now',
    item: 'help.searchMenus',
  },
  {
    control: 'toolbar.newSlide',
    label: 'New slide',
    icon: 'plus',
    key: shortcut('Ctrl+M', 'Ctrl+M'),
    status: 'now',
    item: 'slide.newSlide',
    arrow: 'slide.applyLayout',
    doc: 'The arrow picks a layout for the new slide',
  },
  {
    control: 'toolbar.undo',
    label: 'Undo',
    icon: 'arrow-uturn-left',
    key: shortcut('Cmd+Z'),
    status: 'now',
    item: 'edit.undo',
    enabled: 'canUndo',
  },
  {
    control: 'toolbar.redo',
    label: 'Redo',
    icon: 'arrow-uturn-right',
    key: shortcut('Cmd+Y'),
    status: 'now',
    item: 'edit.redo',
    enabled: 'canRedo',
  },
  {
    control: 'toolbar.print',
    label: 'Print',
    icon: 'printer',
    key: shortcut('Cmd+P'),
    status: 'now',
    item: 'file.print',
  },
  {
    control: 'toolbar.paintFormat',
    label: 'Paint format',
    icon: 'paint-brush',
    key: shortcut('Cmd+Option+C or Cmd+Option+V'),
    status: 'now',
    enabled: 'blockSelected',
    doc: 'Click once to copy the look of the selection, then click the block to paint; double click keeps it armed and Esc disarms',
  },
  {
    control: 'toolbar.zoom',
    label: 'Zoom',
    text: true,
    status: 'now',
    item: 'view.zoom',
    doc: 'Fit, 50%, 100%, 200%, or type a value from 25 to 1600',
  },
];

/** Positions 8 to 18 with nothing selected (SPEC 3.1); from 8 the tail collapses into More under 1100 px. */
export const TOOLBAR_TAIL_DEFAULT: ReadonlyArray<ToolbarControl> = [
  {
    control: 'toolbar.select',
    label: 'Select',
    icon: 'cursor-arrow-rays',
    status: 'now',
    dividerBefore: true,
    doc: 'The pointer; a draw tool returns here when it finishes',
  },
  {
    control: 'toolbar.textBox',
    label: 'Text box',
    icon: 'text',
    status: 'now',
    item: 'insert.textBox',
  },
  {
    control: 'toolbar.insertImage',
    label: 'Insert image',
    icon: 'photo',
    status: 'now',
    item: 'insert.image',
    arrow: 'insert.image',
  },
  {
    control: 'toolbar.insertShape',
    label: 'Insert shape',
    icon: 'square-2-stack',
    status: 'now',
    item: 'insert.shape',
    arrow: 'insert.shape',
  },
  {
    control: 'toolbar.insertLine',
    label: 'Insert line',
    icon: 'minus',
    status: 'now',
    item: 'insert.line',
    arrow: 'insert.line',
  },
  {
    control: 'toolbar.insertComment',
    label: 'Insert comment',
    icon: 'chat',
    key: shortcut('Cmd+Option+M'),
    status: 'later',
    stubReason: COMMENTS_LATER,
    item: 'insert.comment',
  },
  {
    control: 'toolbar.background',
    label: 'Background',
    text: true,
    status: 'now',
    item: 'slide.changeBackground',
    enabled: 'hasSlide',
    dividerBefore: true,
    doc: 'A colour or a picture behind the slide',
  },
  {
    control: 'toolbar.layout',
    label: 'Layout',
    text: true,
    status: 'now',
    item: 'slide.applyLayout',
    arrow: 'slide.applyLayout',
  },
  {
    control: 'toolbar.theme',
    label: 'Theme',
    text: true,
    status: 'now',
    item: 'slide.changeTheme',
  },
  {
    control: 'toolbar.transition',
    label: 'Transition',
    text: true,
    status: 'later',
    stubReason: STILL_SLIDES,
    item: 'slide.transition',
  },
  {
    control: 'toolbar.hideMenus',
    label: 'Hide the menus',
    icon: 'chevron-up',
    key: shortcut('Ctrl+Shift+F', 'Ctrl+Shift+F'),
    status: 'now',
    item: 'view.fullScreen',
  },
];

// ---------------------------------------------------------------------------------------------
// 4.2 and 4.3 The right-click menus

export type ContextTarget =
  | 'filmstripCard'
  | 'emptyCanvas'
  | 'textBlock'
  | 'image'
  | 'tableCell'
  | 'textSelection'
  /* round two (SPEC-2 4.3): a shape, a line, a group, a chart, a range of table cells and a guide line */
  | 'shape'
  | 'line'
  | 'group'
  | 'chart'
  | 'cellRange'
  | 'guide';

/**
 * A menu item by id, a divider, or an item (or a divider, `id: DIVIDER`) shown only while a
 * predicate holds.
 */
export type ContextEntry = string | { id: string; when: MenuPredicate };

export const DIVIDER = '-';

/** The clipboard rows every object menu starts with (SPEC 4.3). */
const OBJECT_CLIPBOARD: ReadonlyArray<ContextEntry> = [
  'edit.cut',
  'edit.copy',
  'edit.paste',
  'edit.delete',
  'edit.duplicate',
];

/** The Arrange rows of an object menu (SPEC 4.3; SPEC-2 4.3 adds Rotate, Group and Ungroup). */
const OBJECT_ARRANGE: ReadonlyArray<ContextEntry> = [
  'arrange.order',
  'arrange.rotate',
  'arrange.centerOnPage',
  'arrange.align',
  'arrange.distribute',
  'arrange.group',
  'arrange.ungroup',
];

/**
 * The right-click menus, in the orders of SPEC 4.2 (the card), 4.3 (the canvas) and SPEC-2 4.3
 * (the shape, line, group, chart, cell range and guide targets). Every id is a menu bar item (R07
 * rule 2), so labels, keys, effects and predicates come from the one table; the label of
 * `edit.delete` reads Delete, as Google's card menu does. Every object menu opens on every slide
 * kind with its rows enabled (SPEC-2 1.1): the first row a person picks converts the slide.
 */
export const CONTEXT_MENUS: Readonly<Record<ContextTarget, ReadonlyArray<ContextEntry>>> = {
  filmstripCard: [
    'edit.cut',
    'edit.copy',
    'edit.paste',
    DIVIDER,
    'slide.newSlide',
    'slide.duplicateSlide',
    'edit.delete',
    'slide.skipSlide',
    DIVIDER,
    'slide.changeBackground',
    'slide.applyLayout',
    'slide.changeTheme',
    'slide.transition',
    DIVIDER,
    'slide.moveSlide',
    DIVIDER,
    'insert.comment',
  ],
  /* opens from the empty sheet and from the workspace around it (SPEC-2 0.100); Guides ▸ is
     Google's row 7 after Comment (R08 A5, SPEC-2 0.91) */
  emptyCanvas: [
    'edit.paste',
    DIVIDER,
    'slide.newSlide',
    'slide.duplicateSlide',
    'slide.deleteSlide',
    'slide.skipSlide',
    DIVIDER,
    'slide.changeBackground',
    'slide.applyLayout',
    'slide.changeTheme',
    'slide.transition',
    DIVIDER,
    'insert.comment',
    DIVIDER,
    'view.guides',
  ],
  textBlock: [
    ...OBJECT_CLIPBOARD,
    DIVIDER,
    ...OBJECT_ARRANGE,
    DIVIDER,
    'insert.link',
    'format.textFitting',
    'format.dropShadow',
    'format.formatOptions',
    'format.altText',
    DIVIDER,
    'insert.comment',
  ],
  image: [
    ...OBJECT_CLIPBOARD,
    DIVIDER,
    'arrange.order',
    'arrange.rotate',
    'arrange.group',
    'arrange.centerOnPage',
    'arrange.align',
    DIVIDER,
    'format.image.replaceImage',
    'format.image.cropImage',
    'format.image.maskImage',
    'format.image.resetImage',
    'format.image.imageOptions',
    'format.formatOptions',
    'format.altText',
    DIVIDER,
    'insert.comment',
    /* SPEC-2 0.100: a picture object covering the sheet at the bottom of the stack leaves no
       empty sheet to right-click, so Change background and Guides stay one click away */
    { id: DIVIDER, when: 'coversSheet' },
    { id: 'slide.changeBackground', when: 'coversSheet' },
    { id: 'view.guides', when: 'coversSheet' },
  ],
  shape: [
    ...OBJECT_CLIPBOARD,
    DIVIDER,
    ...OBJECT_ARRANGE,
    DIVIDER,
    'insert.link',
    'format.textFitting',
    'format.dropShadow',
    'format.formatOptions',
    'format.changeShape',
    'format.altText',
    DIVIDER,
    'insert.comment',
  ],
  line: [
    ...OBJECT_CLIPBOARD,
    DIVIDER,
    ...OBJECT_ARRANGE,
    DIVIDER,
    'insert.link',
    'format.dropShadow',
    'format.formatOptions',
    'format.bordersLines.lineStart',
    'format.bordersLines.lineEnd',
    'format.altText',
    DIVIDER,
    'insert.comment',
  ],
  group: [
    'arrange.ungroup',
    { id: 'arrange.regroup', when: 'canRegroup' },
    DIVIDER,
    ...OBJECT_CLIPBOARD,
    DIVIDER,
    'arrange.order',
    'arrange.rotate',
    'arrange.centerOnPage',
    'arrange.align',
    'arrange.distribute',
    DIVIDER,
    'format.dropShadow',
    'format.formatOptions',
    'format.altText',
    DIVIDER,
    'insert.comment',
  ],
  chart: [
    ...OBJECT_CLIPBOARD,
    DIVIDER,
    'arrange.order',
    'arrange.rotate',
    'arrange.centerOnPage',
    'arrange.align',
    'arrange.distribute',
    'arrange.group',
    DIVIDER,
    'format.editData',
    'format.chartType',
    'format.formatOptions',
    'format.altText',
    DIVIDER,
    'insert.comment',
  ],
  tableCell: [
    'format.table.insertRowAbove',
    'format.table.insertRowBelow',
    'format.table.insertColumnLeft',
    'format.table.insertColumnRight',
    'format.table.deleteRow',
    'format.table.deleteColumn',
    'format.table.deleteTable',
    DIVIDER,
    'format.table.distributeRows',
    'format.table.distributeColumns',
    'format.table.mergeCells',
    'format.table.unmergeCells',
    DIVIDER,
    'edit.cut',
    'edit.copy',
    'edit.paste',
    'insert.link',
    'format.formatOptions',
  ],
  cellRange: [
    'format.table.mergeCells',
    'format.table.unmergeCells',
    'format.table.distributeRows',
    'format.table.distributeColumns',
    DIVIDER,
    'format.table.insertRowAbove',
    'format.table.insertRowBelow',
    'format.table.insertColumnLeft',
    'format.table.insertColumnRight',
    'format.table.deleteRow',
    'format.table.deleteColumn',
    'format.table.deleteTable',
    DIVIDER,
    'edit.cut',
    'edit.copy',
    'edit.paste',
    'format.formatOptions',
  ],
  textSelection: [
    'edit.cut',
    'edit.copy',
    'edit.paste',
    'edit.pasteWithoutFormatting',
    DIVIDER,
    'format.text.italic',
    'format.text.underline',
    'format.text.strikethrough',
    'format.text.superscript',
    'format.text.subscript',
    'format.text.capitalization',
    DIVIDER,
    'insert.link',
    DIVIDER,
    'format.formatOptions',
  ],
  /* a right-click on a guide line (R08 A20, SPEC-2 0.91) */
  guide: ['view.guides.delete', 'view.guides.edit'],
};

// ---------------------------------------------------------------------------------------------
// Context and predicates

export type BlockFamily = 'text' | 'shape' | 'image' | 'line' | 'table' | 'chart' | 'other';

export type MenuContext = {
  platform: Platform;
  /** which region has focus */
  focus: 'filmstrip' | 'canvas' | 'text' | 'notes' | 'none';
  /** the current slide, or null when the deck has none */
  slide: {
    index: number;
    count: number;
    skipped: boolean;
    /** the slide is on the freeform layout already (a canvas, SPEC-2 1.1); no row reads it since every slide converts on its first canvas write */
    freeform: boolean;
    /** Section header, Caption or Closing: the layouts with a full picture */
    pictureLayout: boolean;
  } | null;
  /** how many filmstrip cards are selected */
  selectedSlides: number;
  selection: {
    blocks: number;
    /** the family of the one selected block */
    block?: BlockFamily;
    /** the one selected block is a box (fill and border apply) */
    box?: boolean;
    /** the one selected block holds a picture (shot, pair, tiles, details) */
    picture?: boolean;
    /** heading, paragraph, text, box or table: typography applies */
    textBlock: boolean;
    listItem: boolean;
    tableCell: boolean;
    /** the selected run or block carries a link */
    linked: boolean;
    order: { forward: boolean; backward: boolean; front: boolean; back: boolean };
    /* round two (SPEC-2 4.1, section 1), every field optional so a context built before merge 1 still reads */
    /**
     * The selected blocks are objects of the canvas: top level blocks of any slide kind, a title
     * or statement slide's field and a plate's block included (SPEC-2 1.1). On when absent, because
     * everything a person selects on the sheet is one; the route says no for a block nested inside
     * another. The Arrange, Rotate and Group rows read this and the first pick converts the slide.
     */
    object?: boolean;
    /** every selected block carries a position box already (the slide is a canvas); informational, the rows read `object` */
    rotatable?: boolean;
    /** the selected blocks share this group tag */
    group?: string;
    /** the editor remembers an ungrouped set whose blocks are still on the slide */
    regroup?: boolean;
    /** the selected picture object covers the sheet at the bottom of the stack (SPEC-2 0.100) */
    coversSheet?: boolean;
    /** a range of table cells is selected, from (r0, c0) to (r1, c1) */
    cells?: { r0: number; c0: number; r1: number; c1: number };
    /** the selected cell is the anchor of merged cells */
    merged?: boolean;
    /** the caret selects a range of text, as offsets into the block's text */
    range?: [number, number];
    /** the selected picture is cropped, masked or adjusted */
    imageEdited?: boolean;
    /** the selected text block carries an outline (word art) */
    outlined?: boolean;
    /** the selected list item's level, 1 to 9 */
    listLevel?: number;
    /** the selected block's paragraphs carry space before, or after */
    spaceBefore?: boolean;
    spaceAfter?: boolean;
  };
  clipboard: 'empty' | 'slides' | 'blocks' | 'text' | 'image';
  history: { undo: boolean; redo: boolean };
  sections: number;
  /** how many guides the presentation holds (Deck.guides, SPEC-2 2.10); none when absent */
  guides?: number;
  settings: Readonly<Partial<Record<MenuSetting, boolean | string>>>;
};

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
  /* the rulers and the guides start hidden, as Google's do (SPEC-2 6.1 rows 29 and 30) */
  settings: {
    snapGuides: true,
    speakerNotes: true,
    filmstrip: true,
    spellcheck: true,
    zoom: 'fit',
    appearance: 'match',
  },
};

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
      return ctx.clipboard !== 'empty';
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
  }
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
  if (item.status === 'now' && !evaluate(item.enabled, ctx) && item.disabledReason !== undefined)
    return item.disabledReason;
  return item.doc;
}

/** True when the tooltip of a Later item begins as SPEC 14.4 expects. */
export function isStubTooltip(text: string): boolean {
  return text.startsWith(STUB_PREFIX);
}

// ---------------------------------------------------------------------------------------------
// Walking the table

/** Every item under `items`, depth first, parents before children. */
export function walkItems(items: ReadonlyArray<MenuItem>): MenuItem[] {
  const out: MenuItem[] = [];
  for (const item of items) {
    out.push(item);
    if (item.items !== undefined) out.push(...walkItems(item.items));
  }
  return out;
}

/** Every item of the model: the title row, then the ten menus in order. */
export function allItems(): MenuItem[] {
  return [...walkItems(TITLE_ROW_ITEMS), ...MENUS.flatMap((menu) => walkItems(menu.items))];
}

const INDEX = new Map<string, MenuItem>();
for (const item of allItems()) {
  if (INDEX.has(item.id)) throw new Error(`duplicate menu item id ${item.id}`);
  INDEX.set(item.id, item);
}

/** The item with the id, or undefined. */
export function findItem(id: string): MenuItem | undefined {
  return INDEX.get(id);
}

/** The item with the id; throws on an unknown id (a typo in a context menu or a test). */
export function itemById(id: string): MenuItem {
  const item = INDEX.get(id);
  if (item === undefined) throw new Error(`unknown menu item ${id}`);
  return item;
}

/** The menu an item belongs to, or 'title' for the title row. */
export function menuOf(itemId: string): MenuId | 'title' {
  const head = itemId.split('.')[0];
  if (head === 'title') return 'title';
  const menu = MENUS.find((each) => each.id === head);
  if (menu === undefined) throw new Error(`no menu for ${itemId}`);
  return menu.id;
}

/** The labels from the menu title down to the item: ['File', 'Download', 'PDF Document (.pdf)']. */
export function itemPath(itemId: string): string[] {
  const menuId = menuOf(itemId);
  const root =
    menuId === 'title' ? TITLE_ROW_ITEMS : (MENUS.find((each) => each.id === menuId)?.items ?? []);
  const path: string[] = [];
  const found = (items: ReadonlyArray<MenuItem>): boolean => {
    for (const item of items) {
      path.push(item.label);
      if (item.id === itemId) return true;
      if (item.items !== undefined && found(item.items)) return true;
      path.pop();
    }
    return false;
  };
  if (!found(root)) throw new Error(`unknown menu item ${itemId}`);
  const title =
    menuId === 'title' ? 'Title row' : (MENUS.find((each) => each.id === menuId)?.label ?? '');
  return [title, ...path];
}

/** The items a menu draws: omitted items dropped, context-only items dropped unless asked. */
export function visibleItems(
  items: ReadonlyArray<MenuItem>,
  options: { contextOnly?: boolean } = {},
): MenuItem[] {
  return items.filter(
    (item) => item.status !== 'omit' && (options.contextOnly === true || item.contextOnly !== true),
  );
}

/** The items of a right-click menu, resolved: dividers kept as `DIVIDER`, conditional entries filtered by the context. */
export function contextMenuItems(
  target: ContextTarget,
  ctx: MenuContext,
): Array<MenuItem | typeof DIVIDER> {
  const out: Array<MenuItem | typeof DIVIDER> = [];
  for (const entry of CONTEXT_MENUS[target]) {
    if (entry === DIVIDER) {
      out.push(DIVIDER);
      continue;
    }
    if (typeof entry === 'string') {
      out.push(itemById(entry));
      continue;
    }
    if (!evaluate(entry.when, ctx)) continue;
    out.push(entry.id === DIVIDER ? DIVIDER : itemById(entry.id));
  }
  return out;
}

/** The item ids a right-click menu can draw, conditional entries included and dividers left out. */
export function contextMenuIds(target: ContextTarget): string[] {
  return CONTEXT_MENUS[target]
    .map((entry) => (typeof entry === 'string' ? entry : entry.id))
    .filter((id) => id !== DIVIDER);
}

/** The action ids the model names, through `action` effects and dynamic submenus. */
export function actionIdsOf(item: MenuItem): MenuActionId[] {
  const effect = item.effect;
  if (effect === undefined) return [];
  if (effect.kind === 'action') return [effect.id];
  if (effect.kind === 'submenu' && effect.action !== undefined) return [effect.action];
  return [];
}
