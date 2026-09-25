import type { Capability, Role } from '@turboslide/schema/access';
import type { ActionId } from '@turboslide/schema/actions';

import type { IconName } from '../icons';
import { FORMAT as FORMAT_WORDS, STUB_PREFIX, stubClause } from './strings.ts';

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
 * Round three (SPEC-3 section 13) flips the comment rows to Now with a live effect, brings in
 * Live pointers, Commenting mode, the own chip's menu, Accessibility settings as a submenu,
 * Activity dashboard, Notification settings, the inbox, the presence slot and its roster rows,
 * Copy link, Dither, Show changes, and gives every row a role predicate: a row a role cannot use
 * is absent, never disabled (13.4; `when`). What stays Later is 13.3, each row with its clause.
 *
 * The focus round (docs/FOCUS.md sections 2 to 4) parks every row a seller does not need weekly
 * behind one switch, Tools > Advanced tools (`tools.advancedTools`, the `advancedTools` setting):
 * a parked row or control carries `advanced: true`, a Later stub hides with the parked set, and
 * `isPresent` is the one predicate that reads the switch. Hidden, never disabled, never deleted:
 * the actions stay registered on every transport. This departs from the parity rounds' rule that
 * a Later row stands disabled in Google's position; with the switch on the rows draw as before.
 * Cycle 2 of the round adds two rules: Insert > Shape, Insert > Line, Format > Borders & lines and
 * the two toolbar buttons are parked whole under the orchestrator's ruling (1) on FOCUS.md section
 * 9 (the `shapes.*` and `lines.*` rows did not all pass on the enforce preview; VERIFICATION.md
 * section 8 item 3), and Edit > Paste stays enabled whatever this page copied, as Google's does
 * (`canPaste`; VERIFICATION.md F-slides-paste).
 *
 * The return round (docs/RETURN.md sections 2 and 3) takes the flag off every row the return
 * audits measured working or nearly working, so it is in the default view again and its matrix
 * rows measure it there: the shapes with their three named rows, the lines with the two
 * connectors, the tables, the charts, the diagrams, the word art, superscript, subscript,
 * capitalization, Justified, the paragraph spacing rows, Borders & lines, Edit data and Chart
 * type, Distribute, Rotate, Group, Ungroup and Regroup, Change theme, the View rows (the rulers,
 * the guides, the snapping, the comment display, the live pointers, the filmstrip toggle, the
 * modes, Full screen, the appearance), the File rows (the template gallery, Open, Import slides,
 * the JPEG, PNG and bundle downloads, Show changes, Details), Select none, Check slides, Help
 * Turboslide improve, Go to slide, Slide numbers, and on the toolbar Paint format, Insert shape,
 * Insert line, Theme and Hide the menus. What stays flagged is RETURN.md 2.9, 2.10, 2.15, 2.16,
 * 2.17, 3.4 and section 8: the shape galleries, Change shape, Mask image, Icons and Materials,
 * Image by URL and From this presentation, Dither, List options, Special characters, Rule, Curve,
 * Polyline and Scribble, the web page and text downloads, Publish to web, Make a copy of selected
 * slides, the inbox and Notification settings, the account rows and Follow, Grid view, Show
 * sections, Underline errors, the Activity dashboard, the Tools > Advanced submenu, Agent access
 * and Embed in a site, Edit HTML, and Alt text and Drop shadow until Kevin answers questions 6
 * and 7 of RETURN.md section 9. A row whose return is conditional on a not driven matrix row
 * (Snap to grid, Show changes, the Hide the menus chevron, Slide numbers, the pictures) is
 * unflagged here and re-parked by the merge owner from the run through its row's `parks`
 * (RETURN.md section 1 rule 2).
 *
 * Nothing in a label, tooltip or stub clause names an internal thing (SPEC 12); the default view
 * words test greps this file. Relative imports carry the `.ts` extension so the parity audit
 * script can load the model under Node; the icon import is a type and is erased.
 */

export type MenuStatus = 'now' | 'later' | 'omit';
export type Platform = 'mac' | 'win';

/**
 * The roles of SPEC-3 6.1 and the capabilities of 6.2, as the menus read them: the schema's
 * `Role` and `Capability` of `@turboslide/schema/access` (B1's day one seam, aliased at merge 1 of
 * round three per build-3/b6.md request 1) plus `none` for a stranger on the You need access
 * page. Type only imports, so the model still loads under plain Node for the parity audit.
 */
export type MenuRole = Role | 'none';
export type MenuCapability = Capability;

/** View > Mode (SPEC-3 5.3, 6.3): an editor's three radios; Commenting and Viewing for a commenter. */
export type MenuMode = 'editing' | 'commenting' | 'viewing';

/** View > Comments (SPEC-3 5.3): the four radio rows over one setting. */
export type CommentsDisplay = 'all' | 'expanded' | 'minimized' | 'hidden';

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

/**
 * The sixty four actions SPEC-3 section 12 adds, in its order (presence and sync 7, comments,
 * notifications, activity and version diff 17, share and publish 21, account 10, admin 5, dither
 * and backgrounds 4), kept as a list for the tests and the audit. B1 landed them in the actions
 * table on day one and merge 1 of round three collapsed `MenuActionId` back into `ActionId` (the
 * round two precedent, SPEC-2 0.49), so a row can only name an action that exists.
 */
export const GS3_ACTION_IDS = [
  'presence.list',
  'presence.follow',
  'presence.unfollow',
  'presence.pointer',
  'sync.status',
  'deck.watch',
  'deck.follow',
  'comment.add',
  'comment.reply',
  'comment.edit',
  'comment.delete',
  'comment.resolve',
  'comment.reopen',
  'comment.assign',
  'comment.done',
  'comment.react',
  'comment.list',
  'comment.get',
  'comment.link',
  'notification.list',
  'notification.markRead',
  'notification.settings',
  'activity.list',
  'version.diff',
  'share.get',
  'share.setGeneralAccess',
  'share.createLink',
  'share.revokeLink',
  'share.rotateLink',
  'share.stop',
  'share.invite',
  'share.setRole',
  'share.remove',
  'share.setExpiry',
  'share.settings',
  'share.requestAccess',
  'share.listRequests',
  'share.respond',
  'share.transferOwnership',
  'share.acceptOwnership',
  'share.declineOwnership',
  'share.claim',
  'share.emailCollaborators',
  'deck.publish',
  'deck.unpublish',
  'account.decks',
  'account.tokens.create',
  'account.tokens.list',
  'account.tokens.revoke',
  'account.me',
  'account.setName',
  'account.setAvatar',
  'account.sessions',
  'account.signOut',
  'account.forget',
  'admin.bootstrap',
  'admin.assignOwner',
  'admin.flag',
  'admin.migrateStorage',
  'admin.mail.list',
  'picture.dither',
  'picture.materialize',
  'slide.setBackgroundPicture',
  'slide.setBackgroundMaterial',
] as const satisfies readonly ActionId[];

export type Gs3ActionId = (typeof GS3_ACTION_IDS)[number];

/**
 * The action a menu row runs: an id of the actions table (since merge 1 of round two, SPEC-2
 * 0.49; the round three ids joined `ACTION_IDS` on day one and the widening alias went at
 * merge 1 of round three).
 */
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
  | 'showGuides'
  /* round three (SPEC-3 13.1, 13.2): View > Mode's three radios (`viewing` stays as the round one
     flag the route still reads), View > Comments' four radios, the two live pointer toggles, the
     collaborator announcements, the Version history panel's Show changes checkbox */
  | 'mode'
  | 'comments'
  | 'pointerMine'
  | 'pointerOthers'
  | 'announce'
  | 'showChanges'
  /* the focus round (docs/FOCUS.md 3.1): Tools > Advanced tools, the one switch that shows the
     parked rows, controls and palette entries; off by default, kept per browser with the other
     stored settings (`STORED_SETTINGS` in editor-shell.ts) */
  | 'advancedTools'
  /* the product round (docs/PRODUCT.md section 2 rank 9): Tools > Preferences > Link detection,
     the one preference row; on by default, kept per browser; the Editor reads it as `linkDetection` */
  | 'linkDetection';

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
  | 'selectNone'
  /* round three (SPEC-3 13.1, 13.2): the comment card at the selection, Copy link without a
     token, a one time jump to a collaborator's slide, the own chip's menu */
  | 'comment'
  | 'copyLink'
  | 'goToClient'
  | 'accountMenu'
  /* the product round (docs/PRODUCT.md sections 2, 4.1, 4.4, 7.1): the title row's side panel
     toggle, Add a caption on a picture, Use on every slide, the Font row that opens the toolbar's
     dropdown */
  | 'toggleSidePanel'
  | 'addCaption'
  | 'useOnEverySlide'
  | 'fontPicker';

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
  /** a picture whose asset is a raster: crop applies (docs/VECTOR.md 4.4) */
  | 'rasterPictureSelected'
  | 'chartSelected'
  | 'runSelected'
  | 'listLevelUp'
  | 'listLevelDown'
  | 'hasBorderField'
  | 'spaceBeforeSet'
  | 'spaceAfterSet'
  | 'hasGuides'
  | 'rulerShown'
  | 'coversSheet'
  /** an html block is selected: the Edit HTML source panel (SPEC-3 0.27) */
  | 'htmlBlockSelected'
  /* round three (SPEC-3 13.4): the role predicates over the caller's capabilities (6.2); a
     context without capabilities reads as the owner of a checkout, so every row is present */
  | 'write'
  | 'comment'
  | 'readComments'
  | 'readNotes'
  | 'history'
  | 'share'
  | 'settings'
  | 'publish'
  | 'copy'
  | 'export'
  | 'rename'
  | 'trash'
  | 'follow'
  /** the comment capability while the mode allows it (Viewing mode hides the comment controls, 5.3) */
  | 'canComment'
  /** `history`, or `comment` when the owner allows commenters into the Activity panel (5.7) */
  | 'activity'
  /** a viewer on the editor route: the View only button (6.3) */
  | 'viewOnly'
  /** the own chip's menu: Sign out and Sessions for a signed in principal, Sign in for the others (7.5) */
  | 'signedIn'
  | 'canSignIn'
  /** Tools > Advanced tools is on (docs/FOCUS.md 3.1): the one effect that changes with the switch, the Shapes gallery plate (section 4) */
  | 'advancedTools';

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
  /**
   * The predicate that draws the item at all (SPEC-3 13.4): a row a role cannot use is absent,
   * never disabled, so no tooltip has to name the person's role. Always when absent.
   */
  when?: MenuPredicate;
  /** the tooltip sentence while the predicate says no; a function answers per state, undefined for the doc */
  disabledReason?: string | ((ctx: MenuContext) => string | undefined);
  /** one sentence for the tooltip beyond the label and the key */
  doc?: string;
  /**
   * The seller's own words for Search the menus beyond the label, the path and the doc (the
   * features round, docs/FEATURES.md 4.3 and 3.1 item 4; finder.ts `sellerTermsOf` reads them
   * after the finder's own table)
   */
  terms?: ReadonlyArray<string>;
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
  /**
   * A parked row (docs/FOCUS.md section 3): absent from the menu bar, the right-click menus,
   * Search the menus and the shortcuts dialog while Tools > Advanced tools is off, present with
   * it on. Hidden, never disabled, and never deleted: the row's action stays registered on every
   * transport, so the CLI, MCP, HTTP and window callers see no change. `isPresent` is the one
   * predicate that reads the flag.
   */
  advanced?: true;
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
  /** the predicate that draws the whole menu (SPEC-3 13.4; 09 2.3: Edit, Format, Slide, Arrange and Extensions are absent below editor) */
  when?: MenuPredicate;
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

/**
 * A parked row (docs/FOCUS.md 3.2) and, when it is a container, every row under it: each carries
 * `advanced: true`, so the row, its children in Search the menus and their chords all follow the
 * switch. A parked leaf row passes `advanced: true` in its extra instead.
 */
function parked(item: MenuItem): MenuItem {
  return {
    ...item,
    advanced: true,
    ...(item.items === undefined ? {} : { items: item.items.map(parked) }),
  };
}

// ---------------------------------------------------------------------------------------------
// Shared clauses (SPEC 12, SPEC-2 12, SPEC-3 13.3: one clause, no internal noun, no process word)

/* SPEC-3 13.3: the four rows that stay Later this round, each with its clause; the comment stub
   clause of rounds one and two is gone with the comment rows now live (5.3) */
const CHAT_LATER = 'Leave a comment on the slide instead';
const EMAIL_COLLABORATORS_LATER = 'The invitation carries your message';
const DELETE_VERSIONS_LATER = 'Named versions are kept; older records thin out after 30 days';
const VIEWERS_TAB_LATER = 'Turboslide keeps no record of who viewed a presentation';
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

/* SPEC-3 5.3: Viewing mode hides the Add comment controls; the sentence names the way back, never a role */
const COMMENT_IN_MODE = 'Switch to Commenting or Editing under View > Mode to comment';

/**
 * The role gate of a menu (SPEC-3 13.4, 09 2.3): every row of the menu that carries no `when` of
 * its own takes the menu's predicate, recursively, so a commenter sees Insert > Comment alone and
 * a viewer sees none of the write menus. Returns a copy; the rows keep their order.
 */
function gate(
  items: ReadonlyArray<MenuItem>,
  when: MenuPredicate,
  except: Readonly<Record<string, MenuPredicate>> = {},
): MenuItem[] {
  return items.map((item) => {
    const own = except[item.id] ?? item.when ?? when;
    const copy: MenuItem = { ...item, when: own };
    if (item.items !== undefined) copy.items = gate(item.items, own, except);
    return copy;
  });
}

/**
 * The Replace image sources (SPEC 2.4, 2.5): the Insert > Image sources as the Format > Image >
 * Replace image submenu. Change background no longer lists them (SPEC-2 0.74): its dialog inserts
 * the picture object, which then has its own Replace image.
 */
function replaceImageItems(prefix: string): MenuItem[] {
  return [
    now(`${prefix}.upload`, 'Upload from computer', action('asset.add'), {
      icon: 'arrow-up-tray',
    }),
    /* docs/FOCUS.md 3.2 parked By URL and From this presentation with the Insert rows; By URL
       returned in the product round (docs/PRODUCT.md section 5) */
    now(`${prefix}.byUrl`, 'By URL', dialog('Image by URL'), { icon: 'link' }),
    /* the features round (docs/FEATURES.md 4.4; build/b6.md R1): Replace image > Logo swaps the
       picture's asset for a mark of thesvg.org and keeps the box */
    now(`${prefix}.logo`, 'Logo', dialog('Logo'), {
      turboslide: true,
      icon: 'tag',
      doc: 'A company logo from thesvg.org in the same box',
      terms: ['logo', 'brand', 'company', 'mark'],
    }),
    now(
      `${prefix}.fromThisPresentation`,
      'From this presentation',
      dialog('Pictures in this presentation'),
      { turboslide: true, advanced: true, icon: 'document-duplicate' },
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
// 2.0 The title row and 9.1 the Slideshow arrow; SPEC-3 4.2 the five fixed slots of the right group

export const TITLE_ROW_ITEMS: ReadonlyArray<MenuItem> = [
  now('title.appIcon', 'Turboslide home', route('/decks'), {
    google: 'App icon',
    doc: 'Every presentation on this Turboslide',
  }),
  now('title.name', 'Rename', action('deck.rename'), {
    google: 'Title field',
    when: 'rename',
    doc: 'Click the title to rename the presentation; Enter keeps the name and Esc restores it',
  }),
  omit(
    'title.star',
    'Star',
    'Starring is a per person list; the home page lists every presentation',
  ),
  omit('title.move', 'Move', 'No folders'),
  now('title.saveState', 'Document status', client('showSaveState'), {
    when: 'write',
    doc: 'All changes saved, Saving, Offline, Not saved yet or Couldn’t save, retrying',
  }),
  now('title.lastEdit', 'Last edit', panel('Version history'), {
    icon: 'clock',
    key: shortcut('Cmd+Option+Shift+H'),
    enabled: 'history',
    doc: 'Who changed the presentation last and when; opens Version history',
  }),
  /* SPEC-3 4.2, 13.2: the presence slot, drawn as four chips, the +N chip and the own chip; its
     menu is the roster (the Collaborators list of 4.5) and these are its rows */
  sub(
    'title.presence',
    'Collaborators',
    [
      now('title.presence.follow', 'Follow', action('presence.follow'), {
        turboslide: true,
        advanced: true,
        when: 'follow',
        doc: 'Jumps to that person’s slide and moves with them; your own edit or click stops it',
      }),
      now('title.presence.goTo', 'Go to slide', client('goToClient'), {
        turboslide: true,
        /* back in the default view at the features round's ship one: the matrix row
           collab.roster.go-to-slide (whose `parks` names this id) read green in both preview runs
           of record and on production at the sync round's ship, so it leaves the parked list
           (docs/gslides-parity/focus/ship-f1afe1e.json `leaves`; docs/FEATURES.md 7.2). It was
           re-parked at the return round's ship when the row read red in both runs (docs/RETURN.md
           section 1 rule 2; VERIFICATION.md R2-F1). */
        doc: 'A one time jump to the slide that person has open',
      }),
      later('title.presence.joinChat', 'Join chat', CHAT_LATER, { dividerBefore: true }),
      now('title.presence.me', 'You', client('accountMenu'), {
        turboslide: true,
        advanced: true,
        dividerBefore: true,
        doc: 'Your name and avatar, and the ways to sign in and out',
      }),
    ],
    {
      google: 'Avatar row',
      doc: 'Who has this presentation open; click a chip to follow that person',
    },
  ),
  /* the product round (docs/PRODUCT.md 6.1): the assistant's entry, where Google draws Ask Gemini */
  now('title.assist', 'Assist', panel('Assist'), {
    turboslide: true,
    icon: 'sparkles',
    key: shortcut('Cmd+J'),
    when: 'write',
    doc: 'Tailor the deck for a customer, ask for a shorter slide or for speaker notes; nothing changes until you accept',
  }),
  now('title.comments', 'Show all comments', panel('Comments'), {
    icon: 'chat',
    when: 'readComments',
    doc: 'Every comment on this presentation, with the ones for you first',
  }),
  /* the product round (docs/PRODUCT.md section 2 rank 25): the side panel toggle the bottom bar
     held, now in the title row's right cluster (TitleRow.tsx draws it) */
  now('title.sidePanel', 'Show side panel', client('toggleSidePanel'), {
    turboslide: true,
    icon: 'sidebar',
    doc: 'Reopens the last panel: Format options, Brand kit, Comments or Version history; closes the open one',
  }),
  now('title.inbox', 'Notifications', panel('Notifications'), {
    turboslide: true,
    advanced: true,
    doc: 'Mentions, replies and requests on this presentation',
  }),
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
    doc: 'Who can open this presentation, and the link to send',
  }),
  /* SPEC-3 0.21, 7.5, 13.1: the own chip's menu is the one place accounts appear; parked whole
     (docs/FOCUS.md 3.2) */
  parked(
    sub(
      'title.account',
      'Account',
      [
        now('title.account.changeName', 'Change name', dialog('Change name'), {
          turboslide: true,
          doc: 'How others see you in this presentation',
        }),
        now('title.account.changeAvatar', 'Change avatar', dialog('Change avatar'), {
          turboslide: true,
          doc: 'Initials, a pattern from your name, or a picture',
        }),
        now('title.account.signIn', 'Sign in', dialog('Sign in'), {
          turboslide: true,
          when: 'canSignIn',
          dividerBefore: true,
          doc: 'Keep your name across browsers and receive invitations by email',
        }),
        now('title.account.signOut', 'Sign out', action('account.signOut'), {
          turboslide: true,
          when: 'signedIn',
          dividerBefore: true,
          doc: 'Ends the sign in on this browser; your edits keep your name',
        }),
        now('title.account.forget', 'Forget this browser', action('account.forget'), {
          turboslide: true,
          doc: 'Clears your name, avatar and unsaved changes from this browser; earlier edits keep the old name',
        }),
        now('title.account.sessions', 'Sessions', dialog('Sessions'), {
          turboslide: true,
          dividerBefore: true,
          doc: 'The browsers signed in as you, with Sign out for each',
        }),
      ],
      { google: 'Account avatar', doc: 'Your name and avatar; nothing else asks for an account' },
    ),
  ),
  omit('title.gemini', 'Ask Gemini', GOOGLE_SERVICE),
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
      /* parked with the templates feature at the product round's ship (docs/PRODUCT.md 8.2; the
         parks rule of the ship step): templates.card.rename-and-delete and
         templates.default.use-for-new read red twice on the enforce preview of record, the
         gallery on another instance keeping a renamed, deleted or default template for the
         rows' bounds while the public store's edge refused the just written index; the gallery
         page stays at its address and the actions stay for agents (product/build/ship.md 7) */
      now('file.new.templateGallery', 'From template gallery', route('/decks/templates', true), {
        google: 'From Template Gallery',
        advanced: true,
      }),
    ]),
    now('file.open', 'Open…', dialog('Open'), {
      key: shortcut('Cmd+O'),
      icon: 'document',
    }),
    now('file.importSlides', 'Import slides', dialog('Import slides'), {
      when: 'write',
    }),
    sub(
      'file.makeCopy',
      'Make a copy',
      [
        now('file.makeCopy.entire', 'Entire presentation', dialog('Make a copy')),
        now('file.makeCopy.selected', 'Selected slides', dialog('Make a copy'), {
          advanced: true,
          enabled: 'slideSubsetSelected',
          disabledReason: 'Select some of the slides in the filmstrip first',
        }),
      ],
      { when: 'copy' },
    ),
    /* the product round (docs/PRODUCT.md 4.3): the deck as a template of this deployment, listed
       under Your organisation in the gallery; the same name replaces and keeps the slug */
    now('file.saveAsTemplate', 'Save as template', dialog('Save as template'), {
      when: 'copy',
      turboslide: true,
      /* parked with the templates feature at the product round's ship (the comment on
         file.new.templateGallery above); the dialog and template.create stay for agents */
      advanced: true,
      doc: 'Saves this presentation as a template for new ones on this Turboslide, with its brand kit',
    }),
    sub(
      'file.share',
      'Share',
      [
        now('file.share.withOthers', 'Share with others', dialog('Share')),
        now('file.share.publish', 'Publish to web', dialog('Publish to the web'), {
          when: 'publish',
          advanced: true,
        }),
        /* SPEC-3 0.16, 13.2: the address of the presentation with no token in it */
        now('file.share.copyLink', 'Copy link', client('copyLink'), {
          turboslide: true,
          doc: 'Copies the address of this presentation; whoever opens it needs their own access',
        }),
      ],
      { icon: 'link' },
    ),
    sub('file.email', 'Email', [
      omit('file.email.thisFile', 'Email this file', 'Share sends the link with your message'),
      /* SPEC-3 13.3, 6.5: declared this round, live in round four (an open relay risk, 09 4.5) */
      later('file.email.collaborators', 'Email collaborators', EMAIL_COLLABORATORS_LATER),
    ]),
    sub(
      'file.download',
      'Download',
      [
        now('file.download.pptx', 'Microsoft PowerPoint (.pptx)', dialog('Download'), {
          doc: 'Perfect by default, or Editable text',
        }),
        later('file.download.odp', 'ODP Document (.odp)', DOWNLOAD_FORMATS),
        now('file.download.pdf', 'PDF Document (.pdf)', dialog('Download'), {
          doc: 'One slide per page',
        }),
        /* the product round (docs/PRODUCT.md section 2 rank 8): the two rows above start their
           download at once; this row opens the whole dialog */
        now('file.download.options', 'Download options', dialog('Download options'), {
          turboslide: true,
          doc: 'The file type and the modes, Include skipped slides and Include speaker notes',
        }),
        /* docs/FOCUS.md 3.2 parked the text, picture, web page and bundle downloads. The return
           round returns the pictures (with the signed render url of docs/RETURN.md 2.19, since the
           tab answered 401 on production, audit-export rows 22, 23) and the bundle (2.17); the
           fix round returns the web page once its cancelled downloads had a named mechanism (the
           built file stored on the blob backend, server/download.ts builtFileLink; 2.17), with the
           page fetching every one of these four addresses itself (packages/chrome/src/download.ts);
           the text download stays parked (section 8) */
        now('file.download.txt', 'Plain Text (.txt)', action('export.text'), {
          doc: 'Every slide’s text in order',
          advanced: true,
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
      ],
      /* SPEC-3 6.2: the Download rows follow the export capability (the owner's download switch) */
      { when: 'export' },
    ),
    now('file.rename', 'Rename', client('focusTitle'), { dividerBefore: true, when: 'rename' }),
    omit('file.move', 'Move', 'No folders'),
    omit('file.addShortcut', 'Add shortcut to Drive', 'No Drive'),
    now('file.moveToTrash', 'Move to trash', action('deck.trash'), {
      icon: 'archive',
      when: 'trash',
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
        /* SPEC-3 5.7, 13.2: the panel's checkbox at its bottom, Google's position; 0.45, 13.3: the
           two delete rows of a version's More menu, present and disabled with their clause */
        /* re-parked from the return round's runs (docs/RETURN.md section 1 rule 2; the row
           versions.show-changes-marks carries this id in `parks` and read 0 change marks for a
           heading edit and an added box on the memory tier and on the enforce preview;
           return/build/integrator.md section 6) */
        now('file.versionHistory.showChanges', 'Show changes', toggle('showChanges'), {
          contextOnly: true,
          advanced: true,
          doc: 'Marks what each person changed on the slide, with their chip',
        }),
        later(
          'file.versionHistory.deleteOlder',
          'Delete this and older versions',
          DELETE_VERSIONS_LATER,
          {
            contextOnly: true,
          },
        ),
        later('file.versionHistory.deleteHistory', 'Delete history', DELETE_VERSIONS_LATER, {
          contextOnly: true,
        }),
      ],
      { icon: 'clock', dividerBefore: true, when: 'history' },
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
      when: 'export',
    }),
    now('file.print', 'Print', route('/print/:deckId'), { key: shortcut('Cmd+P'), when: 'export' }),
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
    /* docs/FOCUS.md 3.2 kept Slideshow, Zoom and Show speaker notes in the default view and
       parked the rest; the return round (docs/RETURN.md 2.16, 2.17) returns the rulers, the
       guides, the snapping, the comment display, the live pointers, the filmstrip toggle, the
       modes, Full screen and the appearance, and the grid and the sections stay parked (section 8) */
    now('view.gridView', 'Grid view', toggle('gridView'), {
      icon: 'grid',
      advanced: true,
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
    /* SPEC-3 5.3, 13.1: the four display modes as radio rows over one setting, in Google's order
       (01 3, the 2024 rollout); the chord hides */
    sub(
      'view.comments',
      'Comments',
      [
        now('view.comments.showAll', 'Show all comments', toggle('comments', 'all'), {
          doc: 'The Comments panel and every marker on the slides',
        }),
        now('view.comments.expand', 'Expand comments', toggle('comments', 'expanded'), {
          doc: 'Every card open beside the slide',
        }),
        now('view.comments.minimize', 'Minimize comments', toggle('comments', 'minimized'), {
          doc: 'Markers only; a click opens the card',
        }),
        now('view.comments.hide', 'Hide comments', toggle('comments', 'hidden'), {
          key: shortcut('Cmd+Option+Shift+J'),
          doc: 'No markers and no cards; the panel still lists them',
        }),
      ],
      { icon: 'chat', dividerBefore: true, when: 'readComments' },
    ),
    /* SPEC-3 4.4, 4.6, 13.1: Google's two rows; the own pointer is off by default and needs the
       editor role, the collaborators' pointers are on by default for everyone. Parked again by
       the return round's integration (docs/RETURN.md section 1 rule 2): the matrix row
       view.live-pointers.second-browser, which carries `parks` naming these two rows, was red on
       the memory tier and on the enforce preview on 2026-09-19 (the editor reports the slide,
       the selection and the caret to the room and never the pointer, so the second browser's
       pointer is not drawn on the first; build/integrator.md). The rows flip and hold
       (view.live-pointers.toggles) and return when the second browser row passes. */
    parked(
      sub('view.livePointers', 'Live pointers', [
        now('view.livePointers.mine', 'Show my pointer', toggle('pointerMine'), {
          when: 'write',
          doc: 'Others see where your pointer is on the slide, with your name',
        }),
        now(
          'view.livePointers.collaborators',
          'Show collaborator pointers',
          toggle('pointerOthers'),
          { doc: 'The pointers of the people in this presentation, up to twenty' },
        ),
      ]),
    ),
    now('view.showSpeakerNotes', 'Show speaker notes', toggle('speakerNotes'), {
      dividerBefore: true,
      when: 'readNotes',
    }),
    now('view.showFilmstrip', 'Show filmstrip', toggle('filmstrip'), {
      icon: 'sidebar',
    }),
    /* SPEC-3 5.3, 6.3, 13.1: three radios for an editor, Commenting and Viewing for a commenter,
       no Mode menu for a viewer */
    sub(
      'view.mode',
      'Mode',
      [
        now('view.mode.editing', 'Editing', toggle('mode', 'editing'), {
          when: 'write',
          doc: 'Handles, the notes pane and Format options',
        }),
        now('view.mode.commenting', 'Commenting', toggle('mode', 'commenting'), {
          when: 'comment',
          doc: 'Comments without moving anything: no handles, no Format options',
        }),
        now('view.mode.viewing', 'Viewing', toggle('mode', 'viewing'), {
          doc: 'Read only: no handles, no Format options, no comment controls',
        }),
      ],
      { dividerBefore: true, when: 'comment' },
    ),
    now('view.fullScreen', 'Full screen', toggle('compact'), {
      key: shortcut('Ctrl+Shift+F', 'Ctrl+Shift+F'),
      icon: 'fullscreen',
      doc: 'Hides the menus and the toolbar; Esc restores them',
    }),
    now('view.showSections', 'Show sections', toggle('sections'), {
      turboslide: true,
      advanced: true,
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
          icon: 'arrow-up-tray',
          doc: 'Pictures up to 25 MB',
        }),
        /* the features round (docs/FEATURES.md 4.3; build/b1.md R1): the Logo picker in the submenu */
        now('insert.image.logo', 'Logo', dialog('Logo'), {
          turboslide: true,
          icon: 'tag',
          doc: 'A company logo from thesvg.org, or your own',
          terms: ['logo', 'brand', 'company', 'mark'],
        }),
        omit(
          'insert.image.stockWeb',
          'Stock & web',
          'Google services and the licensing hazard R07 names',
        ),
        omit('insert.image.drivePhotos', 'Drive & Photos', GOOGLE_SERVICE),
        omit('insert.image.camera', 'Camera', GOOGLE_SERVICE),
        /* docs/FOCUS.md 3.2 parked By URL (three stacked defects, audit-images rows 2 to 4) and
           From this presentation; Upload from computer is the core route. The product round
           returns By URL with its three defects fixed (docs/PRODUCT.md section 5; build/b2.md 1.12) */
        now('insert.image.byUrl', 'By URL', dialog('Image by URL'), { icon: 'link' }),
        now(
          'insert.image.fromThisPresentation',
          'From this presentation',
          dialog('Pictures in this presentation'),
          { turboslide: true, advanced: true, icon: 'document-duplicate' },
        ),
      ],
      { icon: 'photo' },
    ),
    /* the features round (docs/FEATURES.md 4.3; build/b1.md R1): Insert > Logo in the default view,
       with the finder terms so Search the menus "logo" answers Logo first (audit-logos 12) */
    now('insert.logo', 'Logo', dialog('Logo'), {
      turboslide: true,
      icon: 'tag',
      doc: 'A company logo from thesvg.org, or your own',
      terms: ['logo', 'brand', 'company', 'mark'],
    }),
    now('insert.textBox', 'Text box', action('block.insert'), {
      icon: 'text',
      doc: 'Click to place a box, or drag to draw one',
    }),
    later('insert.audio', 'Audio', NO_MEDIA, { icon: 'speaker-wave' }),
    later('insert.video', 'Video', NO_MEDIA, { icon: 'video-camera' }),
    /* SPEC-2 4.1: each category is a glyph grid drawn from the shape table; a pick arms the draw
       tool. The focus round (docs/FOCUS.md section 4): Shapes lists Rectangle, Rounded rectangle
       and Ellipse as named rows in both views; the Shapes gallery is its own row, All shapes,
       drawn only while Tools > Advanced tools is on (cycle 2 fix round, VERIFICATION.md C2-F11:
       the matrix row `shapes.insert.named-rows` is driven with the switch on while the feature is
       parked, and the plate that stood in for the rows with the switch on hid them). Arrows,
       Callouts and Equation are parked until the geometry interpreter draws their presets. Cycle
       2, under the orchestrator's ruling (1) on FOCUS.md section 9 (shapes ship only when every
       `shapes.*` row passes on the enforce preview and on production; VERIFICATION.md
       F-shapes-export and section 8 item 3; build/b3.md R14): the whole of Insert > Shape leaves
       the default view for this ship. The rows stay, flagged, and return whole under FOCUS.md
       section 8 once the rows pass; nothing here is deleted. The return round (docs/RETURN.md
       2.2) returns Insert > Shape with its three named rows; All shapes, Arrows, Callouts and
       Equation stay parked until the geometry interpreter draws their presets (2.9). The vector
       round (docs/VECTOR.md 2.6, 3.2; vector/build/b1.md R1): the three named rows hoist out of
       the Shapes container with their glyph icons, and Shapes (Google's row, once All shapes),
       Arrows, Callouts and Equation follow them in the default view as glyph grids now that the
       geometry interpreter draws every preset. */
    sub(
      'insert.shape',
      'Shape',
      [
        now('insert.shape.shapes.rectangle', 'Rectangle', action('block.insert'), {
          turboslide: true,
          icon: 'shape-rect',
          doc: 'Click to place a 240 by 160 rectangle, or drag to draw one',
        }),
        now('insert.shape.shapes.rounded', 'Rounded rectangle', action('block.insert'), {
          turboslide: true,
          icon: 'shape-round-rect',
          doc: 'Click to place a rounded rectangle, or drag to draw one',
        }),
        now('insert.shape.shapes.ellipse', 'Ellipse', action('block.insert'), {
          turboslide: true,
          icon: 'shape-ellipse',
          doc: 'Click to place an ellipse, or drag to draw one',
        }),
        now('insert.shape.gallery', 'Shapes', shapeGrid('shapes'), {
          icon: 'squares-2x2',
          dividerBefore: true,
          doc: 'Every shape preset; a tile places a shape, or drag to draw one',
        }),
        now('insert.shape.arrows', 'Arrows', shapeGrid('arrows'), {
          icon: 'arrow-long-right',
          doc: 'Block arrows; a tile places one, or drag to draw one',
        }),
        now('insert.shape.callouts', 'Callouts', shapeGrid('callouts'), {
          icon: 'chat-bubble-left',
          doc: 'A shape with a pointer; set the pointer under Format options',
        }),
        now('insert.shape.equation', 'Equation', shapeGrid('equation'), {
          icon: 'variable',
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
    /* docs/FOCUS.md 2.2, 3.2 parked tables and charts until their own audit; audit-objects of
       the return round measured both and they return (docs/RETURN.md 2.4, 2.5) */
    sub(
      'insert.chart',
      'Chart',
      [
        now('insert.chart.bar', 'Bar', action('block.insert', { chart: 'bar' }), {
          icon: 'chart-bars',
          enabled: 'hasSlide',
        }),
        now('insert.chart.column', 'Column', action('block.insert', { chart: 'column' }), {
          icon: 'chart-bar',
          enabled: 'hasSlide',
        }),
        now('insert.chart.line', 'Line', action('block.insert', { chart: 'line' }), {
          icon: 'chart-line',
          enabled: 'hasSlide',
        }),
        now('insert.chart.pie', 'Pie', action('block.insert', { chart: 'pie' }), {
          icon: 'chart-pie',
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
      icon: 'word-art',
      enabled: 'hasSlide',
      doc: 'Type your text and press Enter',
    }),
    /* docs/FOCUS.md section 4: Line and Arrow are the kept kinds; the rule, the connectors, the
       curve, the polyline and the scribble are parked. Cycle 2, under ruling (1) and section 4's
       last rule (a `lines.*` row not passing on the enforce preview parks Line and Arrow with the
       shapes; VERIFICATION.md section 8 item 3, build/b3.md R14): the whole of Insert > Line leaves
       the default view for this ship and returns whole under section 8 once its rows pass. The
       return round (docs/RETURN.md 2.3) returns Line, Arrow and the two connectors; Rule, Curve,
       Polyline and Scribble stay parked as chosen departures (RETURN.md section 8). */
    sub(
      'insert.line',
      'Line',
      [
        now('insert.line.line', 'Line', action('block.insert'), { icon: 'line-line' }),
        now('insert.line.arrow', 'Arrow', action('block.insert'), { icon: 'line-arrow' }),
        now('insert.line.rule', 'Rule', action('block.insert'), {
          icon: 'line-rule',
          turboslide: true,
          advanced: true,
          doc: 'A hairline across the slot',
        }),
        now('insert.line.elbowConnector', 'Elbow connector', action('block.insert'), {
          google: 'Elbow Connector',
          icon: 'line-elbow',
          enabled: 'hasSlide',
          doc: 'Turns a corner between two shapes and follows them when they move',
        }),
        now('insert.line.curvedConnector', 'Curved connector', action('block.insert'), {
          google: 'Curved Connector',
          icon: 'line-curved',
          enabled: 'hasSlide',
          doc: 'Bends between two shapes and follows them when they move',
        }),
        now('insert.line.curve', 'Curve', action('block.insert'), {
          icon: 'line-curve',
          advanced: true,
          enabled: 'hasSlide',
          doc: 'Click each point; double click to finish',
        }),
        now('insert.line.polyline', 'Polyline', action('block.insert'), {
          icon: 'line-polyline',
          advanced: true,
          enabled: 'hasSlide',
          doc: 'Click each corner; double click to finish',
        }),
        now('insert.line.scribble', 'Scribble', action('block.insert'), {
          icon: 'line-scribble',
          advanced: true,
          enabled: 'hasSlide',
          doc: 'Draw freehand',
        }),
      ],
      { icon: 'minus' },
    ),
    now('insert.specialCharacters', 'Special characters', dialog('Insert special characters'), {
      icon: 'language',
      advanced: true,
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
    /* SPEC-3 5.3, 13.1: the card at the selection (the block, the text range, the cell), on the
       empty sheet at the slide, on a thumbnail at that slide; absent for a viewer, disabled in
       Viewing mode */
    now('insert.comment', 'Comment', client('comment'), {
      key: shortcut('Cmd+Option+M'),
      icon: 'chat',
      when: 'comment',
      enabled: 'canComment',
      disabledReason: COMMENT_IN_MODE,
      doc: 'A comment on the selected object, text or cell, or on the slide',
    }),
    now('insert.newSlide', 'New slide', action('slide.new'), {
      key: shortcut('Ctrl+M', 'Ctrl+M'),
      icon: 'plus',
      dividerBefore: true,
      doc: 'After the current slide, with the same layout',
    }),
    now('insert.slideNumbers', 'Slide numbers', dialog('Slide numbers'), { icon: 'hashtag' }),
    omit('insert.placeholder', 'Placeholder', 'Theme builder only'),
    later('insert.templates', 'Templates', START_FROM_GT),
    later('insert.buildingBlocks', 'Building blocks', START_FROM_GT),
    omit('insert.speakerSpotlight', 'Speaker spotlight', 'Meet only'),
    now('insert.icon', 'Icon', action('block.insert'), {
      turboslide: true,
      advanced: true,
      icon: 'sparkles',
      dividerBefore: true,
      doc: 'One of the theme’s icons',
    }),
    now('insert.material', 'Material', action('block.insert'), {
      turboslide: true,
      advanced: true,
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
          icon: 'bold',
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
        /* docs/FOCUS.md 3.2 parked superscript, subscript and capitalization; the return round
           returns them (docs/RETURN.md 2.11) */
        now('format.text.superscript', 'Superscript', action('text.style', { mark: 'sup' }), {
          key: shortcut('Cmd+.'),
          enabled: 'textBlockSelected',
        }),
        now('format.text.subscript', 'Subscript', action('text.style', { mark: 'sub' }), {
          key: shortcut('Cmd+,'),
          enabled: 'textBlockSelected',
          doc: 'Your browser may take this key; the Format menu has the item',
        }),
        /* the product round (docs/PRODUCT.md 4.2): the Font row opens the toolbar's dropdown */
        now('format.text.font', 'Font', client('fontPicker'), {
          turboslide: true,
          enabled: 'textBlockSelected',
          dividerBefore: true,
          doc: 'The face of the selected text; More fonts lists every face with its licence',
        }),
        /* the features round (docs/FEATURES.md 3.1 item 4; build/b2.md R1): the Tabular figures row
           opens Format options at its Text section, and the finder terms list it for a seller who
           never heard the word */
        now('format.text.tabularFigures', 'Tabular figures', panel('Format options'), {
          turboslide: true,
          enabled: 'textBlockSelected',
          doc: 'Every digit takes the same width, so numbers line up in a column',
          terms: ['tabular', 'numbers', 'digits', 'line up numbers', 'align numbers'],
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
        icon: 'bars-3-bottom-left',
      }),
      now('format.alignIndent.center', 'Center', action('block.set'), {
        key: shortcut('Cmd+Shift+E'),
        enabled: 'textBlockSelected',
        icon: 'bars-3-center-left',
      }),
      now('format.alignIndent.right', 'Right', action('block.set'), {
        key: shortcut('Cmd+Shift+R'),
        enabled: 'textBlockSelected',
        icon: 'bars-3-bottom-right',
      }),
      now('format.alignIndent.justified', 'Justified', action('block.set'), {
        key: shortcut('Cmd+Shift+J'),
        enabled: 'textBlockSelected',
        icon: 'bars-3',
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
      parked(
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
      ),
    ]),
    /* the Table rows: parked by docs/FOCUS.md 2.2, 3.2, returned with the tables by
       docs/RETURN.md 2.4 (enabled with a cell session or a selected table, fix 2 there) */
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
        /* returned in the return round's fix round: the Editor's cell range (a Shift click on a
           second cell or a drag across cells, packages/viewer/src/table-range.ts; return/build/b5.md
           "Return round fix round") gives Merge cells its range, the mechanism the integration's
           re-park named (return/build/integrator.md section 6). The rows tables.cells.merge-unmerge
           and tables.tail.merge-unmerge-buttons keep these ids in `parks`, so a red run re-parks
           the two rows alone (docs/RETURN.md 2.4, section 1 rule 2) */
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
        /* the vector round (docs/VECTOR.md 4.4): crop has no vector meaning, so an svg picture
           disables the row with the one sentence; with nothing selected the row keeps its doc */
        now('format.image.cropImage', 'Crop image', client('cropMode'), {
          enabled: 'rasterPictureSelected',
          disabledReason: (ctx) =>
            ctx.selection.vector === true ? FORMAT_WORDS.picture.svgCrop : undefined,
          icon: 'viewfinder-circle',
          doc: 'Drag the handles to crop; press Enter to finish',
        }),
        now(
          'format.image.maskImage',
          'Mask image',
          { kind: 'submenu', dynamic: 'shapes', action: 'block.mask' },
          { icon: 'mask', enabled: 'imageSelected', doc: 'Shows the picture inside a shape' },
        ),
        sub(
          'format.image.replaceImage',
          'Replace image',
          replaceImageItems('format.image.replaceImage'),
          { icon: 'arrow-path', enabled: 'imageSelected' },
        ),
        /* the product round (docs/PRODUCT.md section 2 rank 10): the caption under a picture */
        now('format.image.addCaption', 'Add a caption', client('addCaption'), {
          icon: 'bars-2',
          enabled: 'imageSelected',
          turboslide: true,
          doc: 'A caption under the picture; type it on the slide or in Image options',
        }),
        now('format.image.resetImage', 'Reset image', action('block.resetImage'), {
          enabled: 'imageEdited',
          disabledReason: 'The picture is not cropped, masked or adjusted',
          icon: 'arrow-uturn-left',
        }),
        /* the product round (docs/PRODUCT.md 4.4): the picture as the kit's logo on every slide */
        now('format.image.useOnEverySlide', 'Use on every slide', client('useOnEverySlide'), {
          icon: 'slide',
          enabled: 'imageSelected',
          turboslide: true,
          doc: 'Makes this picture the logo on the title slide and in the footer of every slide',
        }),
        /* SPEC-3 10.5, 13.2: the deck's two tone screen over the picture, on and off; the Format
           options Dither section carries the parameters */
        now('format.image.dither', 'Dither', action('picture.dither'), {
          advanced: true,
          enabled: 'imageSelected',
          turboslide: true,
          doc: 'The deck’s two tone screen over the picture; change it under Format options',
        }),
        now('format.image.imageOptions', 'Image options', panel('Format options'), {
          icon: 'adjustments',
          enabled: 'imageSelected',
        }),
      ],
      { icon: 'photo' },
    ),
    /* SPEC-2 0.27, 0.62: Border color and Border weight open the toolbar's pickers anchored to
       the row and write the block's border, or a word art block's outline. Cycle 2: the submenu
       is the shapes and lines feature's (docs/FOCUS.md 2.6) and leaves the default view with it
       under ruling (1) (build/b3.md R14); it returned with the two features in the return round
       (docs/RETURN.md 2.2, 2.3, 3.3). */
    sub(
      'format.bordersLines',
      'Borders & lines',
      [
        now('format.bordersLines.borderColor', 'Border color', client('borderColorPicker'), {
          icon: 'swatch',
          enabled: 'hasBorderField',
          disabledReason: SELECT_BORDERED,
        }),
        now('format.bordersLines.borderWeight', 'Border weight', client('borderWeightPicker'), {
          icon: 'line-weight',
          enabled: 'hasBorderField',
          disabledReason: SELECT_BORDERED,
        }),
        sub(
          'format.bordersLines.borderDash',
          'Border dash',
          dashItems('format.bordersLines.borderDash', 'blockSelected'),
          { icon: 'line-dash', enabled: 'blockSelected' },
        ),
        sub(
          'format.bordersLines.lineStart',
          'Line start',
          lineEndItems('format.bordersLines.lineStart', 'start'),
          { icon: 'line-start', enabled: 'lineSelected', dividerBefore: true },
        ),
        sub(
          'format.bordersLines.lineEnd',
          'Line end',
          lineEndItems('format.bordersLines.lineEnd', 'end'),
          { icon: 'line-end', enabled: 'lineSelected' },
        ),
      ],
      { icon: 'line-weight' },
    ),
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
    /* docs/FOCUS.md 3.2, 3.4 parked Alt text, Drop shadow, Change shape, Edit data, Edit HTML and
       Chart type. Edit data and Chart type returned with the charts (docs/RETURN.md 2.5); Alt text
       and Drop shadow wait for Kevin's answers to questions 6 and 7 of RETURN.md section 9;
       Change shape stays with the galleries (2.9) and Edit HTML with the html block; Text fitting
       stays in the default view */
    now('format.altText', 'Alt text', panel('Format options'), {
      key: shortcut('Cmd+Option+Y'),
      /* the product round returns Alt text to the default view (docs/PRODUCT.md section 5;
         docs/RETURN.md question 6's default) */
      enabled: 'blockSelected',
      contextOnly: true,
      doc: 'The description a screen reader reads',
    }),
    /* docs/FOCUS.md 2.3 lists Text fitting among the Format menu's rows and the matrix row
       `text.format-menu.text-fitting` drives it from the menu bar (VERIFICATION F18), so the row
       is drawn in the Format menu as well as on the text block's right-click menu; Google keeps
       the section inside Format options alone, hence `turboslide` */
    now('format.textFitting', 'Text fitting', panel('Format options'), {
      icon: 'arrows-pointing-in',
      enabled: 'textBlockSelected',
      turboslide: true,
      doc: 'Do not autofit, Shrink text on overflow, or Resize shape to fit text',
    }),
    now('format.dropShadow', 'Drop shadow', panel('Format options'), {
      icon: 'shadow',
      advanced: true,
      enabled: 'blockSelected',
      contextOnly: true,
      doc: 'Colour, transparency, angle, distance and blur',
    }),
    /* SPEC-2 4.3: the shape and chart right-click menus; Turboslide additions (section 10) */
    now(
      'format.changeShape',
      'Change shape',
      { kind: 'submenu', dynamic: 'shapes', action: 'shape.set' },
      { icon: 'square-2-stack', enabled: 'shapeSelected', contextOnly: true, turboslide: true },
    ),
    now('format.editData', 'Edit data', panel('Format options'), {
      icon: 'table-cells',
      enabled: 'chartSelected',
      contextOnly: true,
      turboslide: true,
      doc: 'The categories and series of the chart',
    }),
    /* SPEC-3 0.27: the html block shows inside a frame, so its markup is edited in the Edit HTML panel */
    now('format.editHtml', 'Edit HTML', panel('Edit HTML'), {
      advanced: true,
      enabled: 'htmlBlockSelected',
      contextOnly: true,
      turboslide: true,
      doc: 'The markup and styles of the embedded block',
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
      { icon: 'chart-bar', enabled: 'chartSelected', contextOnly: true, turboslide: true },
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
    /* the product round (docs/PRODUCT.md 4.1): Edit theme opens the Brand kit panel, the deck's
       colours, faces, logo, footer, slide numbers and frame */
    now('slide.editTheme', 'Edit theme', panel('Brand kit'), {
      dividerBefore: true,
      doc: 'The colours, faces, logo, footer, slide numbers and frame of this presentation',
    }),
    /* docs/FOCUS.md 3.2 parked Change theme; it returns as the appearance switch between the GT
       light and dark appearances (docs/RETURN.md 2.13), the Appearance section of the Brand kit panel */
    now('slide.changeTheme', 'Change theme', panel('Brand kit'), { icon: 'swatch' }),
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
    /* docs/FOCUS.md 3.2: Distribute, Rotate, Group, Ungroup and Regroup are parked (they passed
       their audit rows and are the least work to bring back, section 8) */
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
    /* docs/FOCUS.md 3.2: the Tools menu keeps Accessibility settings and the switch itself in
       the default view; Spelling, Notification settings, Activity dashboard, Check slides and the
       Advanced submenu are parked */
    parked(
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
    ),
    omit('tools.explore', 'Explore', 'Retired by Google in 2024 (R02 8.6)'),
    omit('tools.linkedObjects', 'Linked objects', 'No linked sources'),
    omit('tools.dictionary', 'Dictionary', GOOGLE_SERVICE),
    omit('tools.qaHistory', 'Q&A history', GOOGLE_SERVICE),
    omit('tools.dictateNotes', 'Dictate speaker notes', GOOGLE_SERVICE),
    /* SPEC-3 5.5, 13.2: Google's per file row; All comments, Comments for you or None */
    now('tools.notificationSettings', 'Notification settings', dialog('Notification settings'), {
      when: 'comment',
      advanced: true,
      doc: 'Which comments reach your notifications: all of them, the ones for you, or none',
    }),
    /* the product round (docs/PRODUCT.md section 2 rank 9): the one preference Turboslide keeps,
       link detection as you type; text fitting is set per text box in Format options */
    sub('tools.preferences', 'Preferences', [
      now('tools.preferences.linkDetection', 'Link detection', toggle('linkDetection'), {
        turboslide: true,
        doc: 'A web or mail address becomes a link when you type a space or Enter after it',
      }),
    ]),
    /* SPEC-3 0.42, 4.9, 13.1: a submenu with the one row Turboslide can honour; the screen reader
       and braille rows stay out with their reason */
    sub('tools.accessibilitySettings', 'Accessibility settings', [
      now(
        'tools.accessibilitySettings.collaboratorAnnouncements',
        'Turn on collaborator announcements',
        toggle('announce'),
        { doc: 'Your screen reader says who joined, who left and who is on which slide' },
      ),
      omit(
        'tools.accessibilitySettings.screenReader',
        'Turn on screen reader support',
        'The browser’s screen reader works on the DOM',
      ),
      omit(
        'tools.accessibilitySettings.braille',
        'Turn on braille support',
        'The browser’s screen reader works on the DOM',
      ),
    ]),
    /* SPEC-3 5.7, 13.1, 13.3: the Activity panel for editors, and for commenters when the owner
       allows; the row opens the panel itself (a split, like the Slideshow button) and its one
       child is the panel's Later tab, Viewers, with its clause */
    parked({
      ...now('tools.activityDashboard', 'Activity dashboard', panel('Activity'), {
        when: 'activity',
        doc: 'Edits, comments, sharing, names and restores, by time and by person',
      }),
      items: [
        later('tools.activityDashboard.viewers', 'Viewers', VIEWERS_TAB_LATER, {
          contextOnly: true,
        }),
      ],
    }),
    /* the product round (docs/PRODUCT.md sections 5 and 6): the deterministic tailoring pass and
       the assistant's panel, both under Tools beside Check slides */
    now('tools.tailor', 'Tailor for a customer', dialog('Tailor for a customer'), {
      turboslide: true,
      icon: 'sparkles',
      dividerBefore: true,
      when: 'write',
      doc: 'Replaces the customer name everywhere, swaps the pictures named after the old one and skips slides, as one change',
    }),
    now('tools.assist', 'Assist', panel('Assist'), {
      turboslide: true,
      when: 'write',
      doc: 'Tailor the deck for a customer, ask for a shorter slide or for speaker notes; nothing changes until you accept',
    }),
    now('tools.checkSlides', 'Check slides', panel('Suggestions for this slide'), {
      turboslide: true,
      icon: 'check-badge',
      when: 'write',
      doc: 'One suggestion per row, with Fix where there is one',
    }),
    /* the focus round (docs/FOCUS.md 3.1): the one switch that shows the parked rows; a check
       row over the `advancedTools` setting, off by default and kept per browser */
    now('tools.advancedTools', 'Advanced tools', toggle('advancedTools'), {
      turboslide: true,
      doc: 'Shows the tools that are not yet tested end to end, in every menu, on the toolbar and in the right click menus',
    }),
    parked(
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
    /* docs/FOCUS.md 3.2: both rows are parked, so the menu is not drawn while the switch is off */
    now('extensions.agentAccess', 'Agent access', dialog('Agent access'), {
      turboslide: true,
      advanced: true,
      icon: 'code',
      doc: 'The addresses and commands an assistant uses to read and edit this presentation',
    }),
    now('extensions.embedInSite', 'Embed in a site', dialog('Publish to the web'), {
      turboslide: true,
      advanced: true,
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
      {
        google: 'Help Slides improve',
        doc: 'Report a problem or ask for something, in a new tab',
      },
    ),
    omit('help.privacyPolicy', 'Privacy Policy', 'No policy page'),
    omit('help.termsOfService', 'Terms of Service', 'No terms page'),
    now('help.keyboardShortcuts', 'Keyboard shortcuts', dialog('Keyboard shortcuts'), {
      key: shortcut('Cmd+/'),
      dividerBefore: true,
    }),
  ],
};

/**
 * The ten menus in Google's order (R01 row 2), with the role gates of SPEC-3 13.4 and 09 2.3:
 * Edit, Format, Slide, Arrange and Extensions are the editor's; Insert shows a commenter its
 * Comment row alone; File, View, Tools and Help gate row by row; Help is everyone's.
 */
export const MENUS: ReadonlyArray<Menu> = [
  FILE,
  { ...EDIT, when: 'write', items: gate(EDIT.items, 'write') },
  VIEW,
  {
    ...INSERT,
    when: 'comment',
    items: gate(INSERT.items, 'write', { 'insert.comment': 'comment' }),
  },
  { ...FORMAT, when: 'write', items: gate(FORMAT.items, 'write') },
  { ...SLIDE, when: 'write', items: gate(SLIDE.items, 'write') },
  { ...ARRANGE, when: 'write', items: gate(ARRANGE.items, 'write') },
  {
    ...TOOLS,
    items: gate(TOOLS.items, 'write', {
      'tools.notificationSettings': 'comment',
      'tools.preferences': 'always',
      'tools.accessibilitySettings': 'always',
      'tools.activityDashboard': 'activity',
    }),
  },
  { ...EXTENSIONS, when: 'write', items: gate(EXTENSIONS.items, 'write') },
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
  /** the predicate that draws the control at all (SPEC-3 13.4): absent for a role that cannot use it */
  when?: MenuPredicate;
  /** an effect of the control's own, for a control that is no menu item (the View only button, SPEC-3 13.2) */
  effect?: MenuEffect;
  /** a parked control (docs/FOCUS.md 3.3): absent from the toolbar while Tools > Advanced tools is off; `isPresent` reads it */
  advanced?: true;
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
  /* Paint format: parked by docs/FOCUS.md 3.3, returned by docs/RETURN.md 2.11 and 3.2 (it
     copies the weight, the colour and the size, audit-formatting row 61) */
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
  /* cycle 2: the two buttons left the default view with Insert > Shape and Insert > Line under
     ruling (1) (docs/FOCUS.md section 4, build/b3.md R14); they returned with their rows in the
     return round (docs/RETURN.md 2.2, 2.3, 3.2) */
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
    status: 'now',
    item: 'insert.comment',
    when: 'comment',
    enabled: 'canComment',
    disabledReason: COMMENT_IN_MODE,
    doc: 'A comment on the selected object, text or cell, or on the slide',
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
  /* docs/FOCUS.md 3.3 parked Theme, Transition (Later) and Hide the menus; Theme returned with
     Change theme (docs/RETURN.md 2.13) and the Hide the menus chevron returns if its row
     view.hide-menus-chevron passes (RETURN.md 3.2; a red row parks the chevron alone through the
     row's parks); Transition stays a Later stub */
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
 * predicate holds. `advanced` parks the row on this target alone (docs/FOCUS.md 3.4): it is
 * drawn only while Tools > Advanced tools is on, while the same item may stay in the menu bar; a
 * row parked everywhere carries the flag on the item instead, and `isPresent` drops it here too.
 */
export type ContextEntry = string | { id: string; when?: MenuPredicate; advanced?: true };

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
    /* SPEC-3 0.27: an embedded html block edits its markup in the Edit HTML panel */
    { id: 'format.editHtml', when: 'htmlBlockSelected' },
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
    /* the product round (docs/PRODUCT.md section 2 rank 10, 4.4): the caption and the kit's logo */
    'format.image.addCaption',
    'format.image.maskImage',
    'format.image.resetImage',
    'format.image.useOnEverySlide',
    /* SPEC-3 13.2: the picture's Dither toggle sits with the image rows */
    'format.image.dither',
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
    /** the selected picture draws a vector (svg) asset (docs/VECTOR.md 4.4): crop is refused with the sentence */
    vector?: boolean;
    /** the selected text block carries an outline (word art) */
    outlined?: boolean;
    /** the selected list item's level, 1 to 9 */
    listLevel?: number;
    /** the selected block's paragraphs carry space before, or after */
    spaceBefore?: boolean;
    spaceAfter?: boolean;
    /** the selected block is an embedded html block (SPEC-3 0.27) */
    html?: boolean;
  };
  clipboard: 'empty' | 'slides' | 'blocks' | 'text' | 'image';
  history: { undo: boolean; redo: boolean };
  sections: number;
  /** how many guides the presentation holds (Deck.guides, SPEC-2 2.10); none when absent */
  guides?: number;
  settings: Readonly<Partial<Record<MenuSetting, boolean | string>>>;
  /* round three (SPEC-3 13.4), every field optional so a context built before merge 1 reads as today */
  /** the caller's role on the deck (6.1); absent on a checkout and on a deck with no access record */
  role?: MenuRole;
  /** the caller's capabilities (6.2); absent reads as every capability, today's open deck */
  capabilities?: ReadonlyArray<MenuCapability>;
  /** the identity facts the own chip's menu reads (7.3, 7.5) */
  account?: { signedIn: boolean; signInAvailable: boolean };
  /** the access record facts the rows read (5.7, 6.5) */
  access?: {
    /** the owner lets commenters read the Activity panel (`notification.settings { activityForCommenters }`) */
    activityForCommenters?: boolean;
    /** pending access requests, for the dot on Share */
    pendingRequests?: number;
  };
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
      return hasCapability(ctx, 'comment') && ctx.settings.mode !== 'viewing';
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

/**
 * True for a row the switch decides (docs/FOCUS.md 3.1, 3.2): flagged `advanced`, a Later stub, or
 * unknown. Read by the palette, whose Insert entries name the menu row each corresponds to and
 * leave the default view with it; the surfaces that hold a context read `isPresent` instead.
 */
export function isParkedRow(id: string): boolean {
  const item = INDEX.get(id);
  return item === undefined || item.advanced === true || item.status === 'later';
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

/**
 * The items a menu draws: omitted items dropped, context-only items dropped unless asked, and
 * with a context the rows whose `when` says no dropped too (SPEC-3 13.4: absent, never disabled).
 * With a context a plain container (a row whose only effect is to open its submenu) with no
 * visible child is dropped as well (docs/FOCUS.md 3.1: a parent whose children are all parked is
 * absent); a split row that runs a command of its own keeps its place with an empty arrow.
 */
export function visibleItems(
  items: ReadonlyArray<MenuItem>,
  options: { contextOnly?: boolean; context?: MenuContext } = {},
): MenuItem[] {
  const ctx = options.context;
  return items.filter(
    (item) =>
      item.status !== 'omit' &&
      (options.contextOnly === true || item.contextOnly !== true) &&
      (ctx === undefined ||
        (isPresent(item, ctx) &&
          !isEmptyContainer(item, { contextOnly: options.contextOnly, ctx }))),
  );
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

/**
 * The menus the bar draws in a context: a menu whose `when` says no is absent (SPEC-3 13.4), and
 * so is a menu none of whose rows is visible (docs/FOCUS.md 3.1: Extensions with the switch off).
 */
export function visibleMenus(ctx: MenuContext, menus: ReadonlyArray<Menu> = MENUS): Menu[] {
  return menus.filter(
    (menu) => isPresent(menu, ctx) && visibleItems(menu.items, { context: ctx }).length > 0,
  );
}

/**
 * The items of a right-click menu, resolved: dividers kept as `DIVIDER`, conditional entries
 * filtered by the context, and a row a role cannot use dropped (SPEC-3 13.4); two dividers left
 * adjacent by a dropped row collapse into one.
 */
export function contextMenuItems(
  target: ContextTarget,
  ctx: MenuContext,
): Array<MenuItem | typeof DIVIDER> {
  return resolveContextEntries(CONTEXT_MENUS[target], ctx);
}

/**
 * The rows a list of right-click entries draws in a context, the rule `contextMenuItems`
 * applies: a conditional entry whose predicate says no is dropped, an entry parked on this target
 * (`advanced`) is dropped while Tools > Advanced tools is off, a row `isPresent` refuses is
 * dropped, and the dividers collapse. Exported so the rule is tested on a list of its own.
 */
export function resolveContextEntries(
  entries: ReadonlyArray<ContextEntry>,
  ctx: MenuContext,
): Array<MenuItem | typeof DIVIDER> {
  const out: Array<MenuItem | typeof DIVIDER> = [];
  const push = (entry: MenuItem | typeof DIVIDER) => {
    if (entry === DIVIDER) {
      if (out.length === 0 || out[out.length - 1] === DIVIDER) return;
      out.push(DIVIDER);
      return;
    }
    if (!isPresent(entry, ctx)) return;
    out.push(entry);
  };
  for (const entry of entries) {
    if (entry === DIVIDER) {
      push(DIVIDER);
      continue;
    }
    if (typeof entry === 'string') {
      push(itemById(entry));
      continue;
    }
    if (entry.advanced === true && !advancedToolsOn(ctx)) continue;
    if (!evaluate(entry.when, ctx)) continue;
    push(entry.id === DIVIDER ? DIVIDER : itemById(entry.id));
  }
  while (out.length > 0 && out[out.length - 1] === DIVIDER) out.pop();
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
