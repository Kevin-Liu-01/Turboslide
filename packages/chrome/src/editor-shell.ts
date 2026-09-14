import type { AnchorHTMLAttributes, ComponentType, ReactNode } from 'react';

import type { MarkSpec } from '@turboslide/identity/marks';
import type { Asset } from '@turboslide/schema/assets';
import type { Block, BlockType, PictureDither, ShapeBlock } from '@turboslide/schema/blocks';
import { emptyChart } from '@turboslide/schema/blocks/chart';
import type { ChartKind } from '@turboslide/schema/blocks/chart';
import { emptyTable } from '@turboslide/schema/blocks/table';
import type { TableBlock, TableCommand } from '@turboslide/schema/blocks/table';
import { CATALOG } from '@turboslide/schema/catalog';
import type { Deck, DeckDocument, DeckGuides, Slide } from '@turboslide/schema/deck';
import { deckAppearance, sectionOfSlide, slideBlocks, slideOrder } from '@turboslide/schema/deck';
import type { Finding } from '@turboslide/schema/findings';
import type { BlockId } from '@turboslide/schema/ids';
import type { LayoutId } from '@turboslide/schema/layouts';
import { derivedLayout, isLayoutId } from '@turboslide/schema/layouts';
import type { Lease, Mutation, Version } from '@turboslide/schema/mutations';
import type { Position } from '@turboslide/schema/position';
import { SHEET_HEIGHT, SHEET_WIDTH } from '@turboslide/schema/render';
import { isLineKind } from '@turboslide/schema/shapes';
import {
  BULLET_PRESETS,
  NUMBER_PRESETS,
  marksOfRange,
  plainLength,
  splitParagraphs,
} from '@turboslide/schema/text';
import type { RunMarks } from '@turboslide/schema/text';
import { TYPE_LADDER, TYPE_LEADING } from '@turboslide/schema/typography';
import type { Theme } from '@turboslide/viewer/theme';

import type { SlideRenderer } from './LayoutGrid';

import type { EditorDispatch } from './dispatch';
import type { DitherWorkerLike } from './inspector/dither';
import type { ControlContext } from './inspector/props';
import type { ArtifactRun, ExportDownload } from './ExportReportCard';
import type { ExportCapabilities, ExportProgress } from './ExportMenu';
import type {
  BlockFamily,
  CommentsDisplay,
  MenuActionId,
  MenuCapability,
  MenuContext,
  MenuItem,
  MenuMode,
  MenuRole,
  MenuSetting,
} from './menus/model';
import { DEFAULT_MENU_CONTEXT } from './menus/model';
import type { TailKind } from './menus/toolbar-tails';
import { freeBlockId } from './palette-data';
import type { PaletteEntry } from './palette-data';
import type { SaveState } from './StatusChip';
import { tableCommandOfItem, tablePlan, tableWriteInput } from './table-tools';

/**
 * The editor shell's contract with the studio route (gslides-parity SPEC 1, 2, 3, 6, 12): what
 * `apps/studio/src/editor/EditorRoot.tsx` passes ViewerShell as its `editor` prop so the title
 * row, the menu bar, the toolbar and the panels can read the document and write through the one
 * dispatcher, and the pure helpers that turn a menu item into an action input, a selection into a
 * toolbar tail and the editor's facts into a `MenuContext`. Every field beyond the document, the
 * dispatcher and the revision is optional with a stated default, so the route wires the shell in
 * steps and the shell still renders every row with the fields it has. Pure apart from the
 * types: no React, no DOM, so `editor-shell.test.ts` runs in Node.
 */

/** The marks of the caret's run (SPEC-2 2.2.1 to 2.2.6): the schema's own type. */
export type { RunMarks };

/**
 * The props of the link slot (gslides-parity SPEC-4 0.16, 1.10): the title row's mark and the
 * app bar lockup render the component the studio passes here, the router's `Link` wrapped to
 * these props with `preload: 'intent'`, so the chrome stays router free and a click is a same
 * document transition instead of a document load. The anchor attributes pass through, because
 * the slot carries `data-control`, the `aria-label` and the Tooltip primitive's handlers.
 */
export type LinkSlotProps = {
  to: string;
  preload?: 'intent';
  className?: string;
  children: ReactNode;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'>;

export type LinkComponent = ComponentType<LinkSlotProps>;

/** What is selected on the canvas, in the shell's own words (the route maps its Selection to it). */
export type EditorSelection = {
  /** the selected block, or the block whose run holds the caret */
  blockId?: string;
  /** several selected blocks on a freeform slide or in the objects of any slide; `[blockId]` when absent */
  blockIds?: readonly string[];
  /** the caret is in a run of the block */
  text?: boolean;
  /** the table cell the caret is in */
  cell?: { row: number; column: number };
  /** the caret is in a list item (a plain block) */
  listItem?: boolean;
  /* round two (SPEC-2 seams): every field optional until the integrator wires the route */
  /** the selected blocks share this group tag (`pos.group`) */
  group?: string;
  /** a range of table cells, from (r0, c0) to (r1, c1) */
  cells?: { r0: number; c0: number; r1: number; c1: number };
  /** the caret selects this range of the block's text, as plain text offsets */
  range?: [number, number];
  /** the marks of the caret's run, for the pressed state of the toolbar buttons */
  marks?: RunMarks;
  /** the selected picture carries a crop, mask or adjustment */
  imageEdited?: boolean;
  /** every selected block carries a `pos` (rotation, flip and groups apply) */
  positioned?: boolean;
  /** the selected text block carries an outline (word art) */
  outlined?: boolean;
  /** the selected list item's level, 1 to 9 */
  listLevel?: number;
  /** the selected picture object covers the sheet at the bottom of the stack (SPEC-2 0.100) */
  coversSheet?: boolean;
  /** the slide is on the freeform layout (a canvas, SPEC-2 1.1) */
  canvas?: boolean;
  /** the block is nested inside another (a plate's child on a slide nothing converted): not an object to the Arrange rows */
  nested?: boolean;
};

/**
 * The editor's handle for the gestures the menu rows and keys of round two drive (SPEC-2 seams;
 * B4 implements them on the canvas, the integrator wires them): every method optional, so a
 * shell without one says what to do instead, or dispatches the action itself where one exists.
 */
export type EditorHandle = {
  rotate?: (by: number, about?: 'each' | 'selection') => void;
  flip?: (axis: 'h' | 'v', about?: 'each' | 'selection') => void;
  group?: () => void;
  ungroup?: () => void;
  regroup?: () => void;
  cropMode?: () => void;
  exitCrop?: () => void;
  mask?: (shape: string | null) => void;
  /** inserts text at the caret, or into a new text box when nothing is being edited */
  insertText?: (text: string) => void;
  /** the word art bar's insert */
  wordArt?: (text: string) => void;
  /** runs a table plan from `table-tools.ts` */
  tableCommand?: (plan: { action: MenuActionId; input: Record<string, unknown> }) => void;
  /** opens the chart data grid for the selected chart */
  chartData?: () => void;
  /** previews a slide background while the Background dialog is open */
  previewBackground?: (background: unknown | null) => void;
  /** Edit > Select none: clears the block selection, the caret and the filmstrip's multi selection */
  selectNone?: () => void;
  /** measures and writes the fit of `block.autofit` on the window transport (SPEC-2 0.64) */
  applyAutofit?: (blockId: string) => void;
  /* the canvas (SPEC-2 sections 1 and 6; B4 lands the stage's side) */
  /** converts the current slide to the canvas with nothing else in the write (`slide.toCanvas`) */
  toCanvas?: () => void;
  /** zooms the stage to a factor or the fit, about a sheet point (the centre unless set) */
  zoomTo?: (zoom: number | 'fit', center?: { x: number; y: number }) => void;
  /** one step up or down the ladder of 0.81 from the effective zoom */
  zoomStep?: (direction: 1 | -1) => void;
  /** adds a guide at a sheet position (the centre unless set) */
  addGuide?: (axis: 'x' | 'y', at?: number) => void;
  clearGuides?: () => void;
  /** Arrange > Center on page for the selection */
  centerOnPage?: (axis: 'x' | 'y') => void;
  /** Change background > Choose: inserts the picture object at the bottom of the stack (2.6.4) */
  insertBackgroundPicture?: (asset: string) => void;
  /* round three (SPEC-3 seams; B2 wires the room client, B6 draws the surfaces) */
  /** follows a collaborator's client: the stage moves with them until a stop of 4.4 (`presence.follow`) */
  followClient?: (clientId: string) => void;
  /** a one time jump to the slide a collaborator has open (the roster's "Go to slide 12") */
  goToClient?: (clientId: string) => void;
  /** expands a thread's card on its slide (`comment.link`'s target); null closes the open card */
  openComment?: (threadId: string | null) => void;
  /** the live preview of a picture's dither under 100 ms while the section's sliders move (10.3); null restores */
  ditherPreview?: (blockId: string, dither: PictureDitherLike | null) => void;
  /** View > Mode: Editing, Commenting or Viewing (5.3, 6.3); the gates live in the editor */
  setMode?: (mode: EditorMode) => void;
};

// ---------------------------------------------------------------------------------------------
// Round three: presence, comments, inbox, access, account and sync (SPEC-3 sections 3 to 7)
//
// The shapes the collaboration surfaces read, as the route passes them. Every field is optional
// on `EditorShellInput` and every callback is optional inside, so the route wires them in steps
// (B2 lands the room client and the props on day 4, B3 the identity, B6 the surfaces). Where a
// schema or identity type owns the canonical shape (`Thread`, `AccessRecord`, `MarkSpec`,
// `Participant`), the field here is the view the chrome needs; the dither field and the mark are
// the package types since merge 1 of round three (build-3/b6.md request 1), the names kept.

/** The four roles of SPEC-3 6.1; `none` is a stranger on the You need access page. */
export type EditorRole = MenuRole;
/** The capabilities of SPEC-3 6.2, as `decide()` grants them. */
export type EditorCapability = MenuCapability;
/** View > Mode (SPEC-3 5.3). */
export type EditorMode = MenuMode;
/** The three trust states of 0.19 and the agent (4.1, 15): the word beside a name and the mark's family. */
export type TrustState = 'label' | 'guest' | 'verified' | 'agent';

/** A picture's dither field as the preview handle takes it (`PictureDither` of `@turboslide/schema/blocks`). */
export type PictureDitherLike = PictureDither;

/** The identity mark as `packages/identity` describes it (`MarkSpec` of `@turboslide/identity/marks`). */
export type MarkSpecLike = MarkSpec;

/** A principal as the surfaces show one: a label, a typed name with "guest", a verified account, an agent (7.8). */
export type IdentityView = {
  principalId: string;
  /** the generated label (`Titanium 471`), always present as the fallback */
  label: string;
  /** the typed or account name; absent for a label */
  name?: string;
  trust: TrustState;
  kind: 'anonymous' | 'account' | 'agent';
  /** a verified account's address, for the tooltip; never for anyone the caller may not see it */
  email?: string;
  mark?: MarkSpecLike;
  /** an agent's run id, shown as "Agent · <runId>" (4.7) */
  runId?: string;
};

/** One participant of the room (SPEC-3 4.11 `Participant`), with the facts the chips and the roster draw. */
export type PresenceParticipant = IdentityView & {
  clientId: string;
  /** the role word of the roster row; `link` for a person admitted by a link whose name is hidden (4.8) */
  role: EditorRole | 'link';
  /** the hue slot the room granted (`HueSlot`, 1 to 6, of `@turboslide/identity/hues`) for the live surfaces; absent for an agent */
  hue?: number;
  slideId?: string;
  selection?: {
    blockIds: readonly string[];
    /** the caret in plain text offsets of the block's Text (3.1) */
    caret?: { blockId: string; path: string; offset: number };
  };
  /** the pointer in sheet px, null while hidden */
  pointer?: { x: number; y: number } | null;
  /** the client this participant follows */
  following?: string | null;
  presenting?: boolean;
  idle?: boolean;
  lastSeenAt: string;
};

/** The room as the title row, the filmstrip and the overlay read it (SPEC-3 4.2 to 4.7). */
export type EditorPresence = {
  self?: PresenceParticipant;
  others: readonly PresenceParticipant[];
  /** the live pointer cap, 20 (0.6) */
  cap?: number;
  /** Show collaborator pointers (4.6) */
  pointersVisible?: boolean;
  /** Show my pointer (4.6), editors only */
  pointerMine?: boolean;
  /** the client this tab follows (4.4) */
  following?: string | null;
  /** the roster names grant holders to link visitors only under the owner's switch (0.12) */
  showNames?: boolean;
  /** the collaborator announcements of 4.9 */
  announce?: boolean;
  /** the room's tier, for the admin's sentence of 6.8 on the blob tier */
  tier?: 'redis' | 'memory' | 'blob';
  onFollow?: (clientId: string) => void;
  onUnfollow?: () => void;
  onGoTo?: (clientId: string) => void;
  onPointer?: (on: boolean) => void;
  onPointerOthers?: (on: boolean) => void;
  onAnnounce?: (on: boolean) => void;
};

/** A thread's anchor resolved at read time (SPEC-3 5.1, six kinds); `orphaned` when the object left the slide. */
export type CommentAnchorView = {
  kind: 'deck' | 'slide' | 'block' | 'text' | 'cell' | 'notes';
  slideId?: string;
  blockId?: string;
  /** the Text path of a `text` anchor */
  path?: string;
  /** plain text offsets of a `text` anchor */
  range?: [number, number];
  /** the quoted string of a `text` anchor, at most 200 code points */
  quote?: string;
  cell?: { row: number; column: number };
  orphaned?: boolean;
};

/** One comment of a thread as the card shows it: the body as text with its mentions resolved (5.1, 5.4). */
export type CommentView = {
  id: string;
  author: IdentityView;
  createdAt: string;
  editedAt?: string;
  /** plain text with `{@n}` tokens indexing `mentions`; rendered through text nodes, never markup */
  text: string;
  mentions: readonly IdentityView[];
  /** emoji to the principals who reacted */
  reactions?: Readonly<Record<string, readonly string[]>>;
  /** a tombstone keeping its replies (0.10) */
  deleted?: boolean;
};

export type CommentThreadView = {
  id: string;
  anchor: CommentAnchorView;
  comment: CommentView;
  replies: readonly CommentView[];
  resolved?: boolean;
  assignee?: IdentityView | null;
  createdAt: string;
  updatedAt: string;
  /** the thread mentions the reader, is theirs, or is assigned to them (For you, 5.3) */
  forMe?: boolean;
};

/** A comment body as the card sends it (5.4): text with mention tokens and the stored mention ids. */
export type CommentBodyInput = {
  text: string;
  /** principal ids or invitation ids, in token order */
  mentions?: readonly string[];
};

/** The comments of a deck as the card, the markers and the panel read them (SPEC-3 5.3), with the writes of 5.9. */
export type EditorComments = {
  threads: readonly CommentThreadView[];
  /** the sidecar's own counter (`index.revision`) */
  revision: number;
  display?: CommentsDisplay;
  onDisplay?: (display: CommentsDisplay) => void;
  /** the thread whose card is expanded */
  openThreadId?: string | null;
  onOpen?: (threadId: string | null) => void;
  /** who the caller may mention: present people, past commenters, and grantees for editors (5.4) */
  mentionables?: readonly IdentityView[];
  add?: (input: {
    anchor: CommentAnchorView;
    body: CommentBodyInput;
    assignee?: string | null;
  }) => Promise<unknown>;
  reply?: (threadId: string, body: CommentBodyInput) => Promise<unknown>;
  edit?: (threadId: string, commentId: string, body: CommentBodyInput) => Promise<unknown>;
  remove?: (threadId: string, commentId: string, restore?: boolean) => Promise<unknown>;
  resolve?: (threadId: string) => Promise<unknown>;
  reopen?: (threadId: string) => Promise<unknown>;
  assign?: (threadId: string, assignee: string | null) => Promise<unknown>;
  done?: (threadId: string) => Promise<unknown>;
  react?: (threadId: string, commentId: string, emoji: string, on: boolean) => Promise<unknown>;
  /** `comment.link`: the URL that opens the deck on the slide with the card expanded */
  link?: (threadId: string) => Promise<{ url: string; viewUrl?: string }>;
};

/** One line of the inbox (SPEC-3 5.5): the actor's mark, one sentence, a tabular time. */
export type InboxItemView = {
  id: string;
  kind:
    | 'mention'
    | 'reply'
    | 'assigned'
    | 'resolved'
    | 'reopened'
    | 'reaction'
    | 'accessRequest'
    | 'granted'
    | 'versionNamed'
    | 'comment';
  deckId: string;
  threadId?: string;
  slideId?: string;
  actors: readonly IdentityView[];
  count: number;
  createdAt: string;
  updatedAt: string;
  readAt?: string;
};

/** Google's three per file levels (5.5): All comments, Comments for you, None. */
export type NotificationLevel = 'all' | 'forYou' | 'none';

/** The Notifications panel and the inbox plate (SPEC-3 5.5). */
export type EditorInbox = {
  items: readonly InboxItemView[];
  unread: number;
  level?: NotificationLevel;
  /** email digests, signed in grant holders only */
  email?: boolean;
  /** the owner's switch letting commenters read the Activity panel (5.7) */
  activityForCommenters?: boolean;
  onOpen?: (item: InboxItemView) => void;
  onMarkRead?: (ids: readonly string[]) => void;
  onMarkAllRead?: () => void;
  onSettings?: (settings: {
    level?: NotificationLevel;
    email?: boolean;
    activityForCommenters?: boolean;
  }) => Promise<unknown>;
};

/** A grant row of the Share dialog (SPEC-3 6.1, 6.5). */
export type AccessGrantView = {
  principal?: IdentityView;
  email?: string;
  role: EditorRole;
  invitedAt: string;
  acceptedAt?: string;
  expiresAt?: string | null;
  /** the invitation has not been accepted, or has lapsed */
  status?: 'pending' | 'expired' | 'active';
};

export type AccessLinkView = {
  id: string;
  role: EditorRole;
  label?: string;
  createdAt: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  useCount?: number;
};

export type AccessRequestView = {
  id: string;
  principal?: IdentityView;
  email?: string;
  role: EditorRole;
  message?: string;
  askedAt: string;
};

/** The access record as the dialogs and the rows read it (SPEC-3 6.1, 6.5), with the writes of 6.9. */
export type EditorAccess = {
  /** the record's revision, sent as `baseRevision` on every write */
  revision: number;
  owner?: IdentityView | null;
  pendingOwner?: IdentityView | null;
  generalAccess: { mode: 'restricted' | 'link' | 'open'; role: EditorRole };
  grants?: readonly AccessGrantView[];
  links?: readonly AccessLinkView[];
  requests?: readonly AccessRequestView[];
  settings?: {
    editorsCanShare?: boolean;
    viewersCanDownload?: boolean;
    viewersCanSeeComments?: boolean;
    showNamesToLinkVisitors?: boolean;
    allowHtmlBlocks?: boolean;
  };
  /** the published player, when `deck.publish` minted a token (6.4) */
  published?: { playerUrl: string; embedUrl: string } | null;
  /** a deck with no record that a signed in principal may claim (6.1) */
  claimable?: boolean;
  /** how the caller got in: the `via` of `decide()` */
  via?: 'owner' | 'grant' | 'link' | 'open' | 'publish' | 'admin' | 'agent';
  /** the `/s/` form of the general access link, for the dialog's Copy link (0.16); shown once by the action that minted it */
  linkUrl?: string;
};

/** A sign in session row of the profile (SPEC-3 7.4). */
export type SessionView = {
  id: string;
  browser: string;
  platform: string;
  location?: string;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
};

/** An agent key row of the profile (7.7); the secret is shown once by the action that minted it. */
export type TokenView = {
  id: string;
  name: string;
  scopes: readonly string[];
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string | null;
};

/** The caller's identity and the account surfaces (SPEC-3 section 7). */
export type EditorAccount = {
  principal: IdentityView;
  signedIn: boolean;
  /** `DATABASE_URL` is set: the Sign in row exists (7.3) */
  signInAvailable: boolean;
  /** the passkey plugin is on: the production domain is fixed (7.3) */
  passkeysAvailable?: boolean;
  githubAvailable?: boolean;
  sessions?: readonly SessionView[];
  tokens?: readonly TokenView[];
  /** the avatar choice on the principal record (7.6) */
  avatar?: {
    variant: 'initials' | 'glyph' | 'dither' | 'picture';
    initials?: string;
    salt?: string;
  };
  /** the name prompt fires on the first edit, comment or lease (0.18); the route says when */
  namePrompt?: { open: boolean; prefilled: string };
  onNamePrompt?: (open: boolean) => void;
  setName?: (name: string) => Promise<unknown>;
  setAvatar?: (choice: {
    variant: 'initials' | 'glyph' | 'dither' | 'picture';
    initials?: string;
    salt?: string;
    picture?: File;
  }) => Promise<unknown>;
  signIn?: () => void;
  signOut?: (sessionId?: string | 'all') => Promise<unknown>;
  forget?: () => Promise<unknown>;
  /* the sign in dialog's exchanges (7.3), wired by the route over better-auth's own routes */
  /** one mail with a magic link and a six digit code; the same answer whether or not the address exists */
  requestCode?: (email: string) => Promise<unknown>;
  verifyCode?: (email: string, code: string) => Promise<unknown>;
  passkey?: () => Promise<unknown>;
  github?: () => void;
  /** the profile's agent key rows (7.7) */
  revokeToken?: (tokenId: string) => Promise<unknown>;
  /** Delete account (7.4); refused while other people hold grants on decks the caller owns */
  deleteAccount?: () => Promise<unknown>;
  /** the public URL of the picture avatar, when one is set */
  pictureUrl?: string;
};

/** One line of the Activity panel (SPEC-3 5.7): one plain sentence, the actor's mark, a tabular time. */
export type ActivityEventView = {
  id: string;
  at: string;
  kind:
    | 'version'
    | 'comment'
    | 'share'
    | 'request'
    | 'role'
    | 'rename'
    | 'restore'
    | 'named'
    | 'export'
    | 'import'
    | 'trash';
  actor?: IdentityView;
  slideId?: string;
  threadId?: string;
  revision?: number;
  summary: string;
};

/** The Activity panel's feed (`activity.list`), merged by time; the route loads it when the panel opens. */
export type EditorActivity = {
  events: readonly ActivityEventView[];
  /** loads or refreshes the feed */
  load?: () => Promise<unknown>;
  loading?: boolean;
};

/** `sync.status` (SPEC-3 3.10, section 12) plus the persisted queue offer of 0.7 and the offline word. */
export type EditorSync = {
  seq: number;
  revision: number;
  pending: number;
  retained: number;
  tier: 'redis' | 'memory' | 'blob';
  transport: 'sse' | 'poll' | 'none';
  connected: boolean;
  offline?: boolean;
  /** "3 unsaved changes from this browser" with Apply and Discard */
  persisted?: { count: number; onApply: () => void; onDiscard: () => void };
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
  /** the author of the last write, shown only when it is not the default `studio` (the round one form) */
  lastEditBy?: string;
  /* round three (SPEC-3 4.2): the newest record's author through resolvePrincipal, and the dot */
  /** the identity of the newest record's author; wins over `lastEditBy` when present */
  lastEditor?: IdentityView;
  /** a record landed since this tab loaded the deck: the 6 px dot inside the clock button */
  changedSinceOpen?: boolean;
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
  /**
   * The router's `Link` for the title row's mark (gslides-parity SPEC-4 0.16, 1.10): the studio
   * fills it from EditorRoot so the mark's click to /decks is a same document transition; a
   * plain anchor when absent (a server render outside the router, a test)
   */
  linkComponent?: LinkComponent;
  /** TURBOSLIDE_TOKEN is set on the deployment (Agent access) */
  tokenRequired?: boolean;
  /** Insert > Link: the canvas link popover (B4); a dialog when absent */
  onLink?: () => void;
  /** Paint format: arm the gesture (B4); a snackbar when absent */
  onPaintFormat?: () => void;
  /** the draw tools (B4): Text box, Shape and Line; block.insert into the current slot when absent */
  onDrawTool?: (tool: DrawTool) => void;
  /** the canvas gestures of round two (SPEC-2 seams); a snackbar says what to do when one is absent */
  editor?: EditorHandle;
  /** the deck's guides in sheet px (SPEC-2 2.10), for the View rows and the guide readouts; the document's when absent */
  guides?: DeckGuides;
  /** what the stage reports about the view: the effective zoom factor while Fit or a pinch zooms (SPEC-2 0.81) */
  view?: { zoom?: number };
  /**
   * The boxes the stage measured for the selected slide's blocks, in sheet px (Size & rotation
   * and Position on a slide nothing converted show them; the first edit converts the slide, 1.6)
   */
  measuredBoxes?: Readonly<Record<string, { x: number; y: number; w: number; h: number }>>;
  /** the Format options sections another builder draws (Chart data, Table); see FormatOptions.tsx `FormatOptionsSlots` */
  formatSlots?: import('./FormatOptions').FormatOptionsSlots;
  /** Slideshow (B6): from the current slide, from the beginning, or Presenter view */
  present?: {
    start?: (fromBeginning: boolean) => void;
    presenterView?: () => void;
  };
  /** navigation; window.location and window.open when absent */
  navigate?: (path: string, newTab?: boolean) => void;
  /** the deck.trash snackbar's Undo restored the deck (the route re-enables the editor) */
  onTrashed?: () => void;
  /* round three (SPEC-3 seams): every field optional until B2 wires the room client (day 4) */
  /** the room: the presence slot, the roster, the filmstrip chips, the carets, outlines and pointers */
  presence?: EditorPresence;
  /** the comment threads, the markers, the card and the Comments panel */
  comments?: EditorComments;
  /** the inbox plate and the Notifications panel */
  inbox?: EditorInbox;
  /** the access record for the Share dialog, the Publish dialog and the dot on Share */
  access?: EditorAccess;
  /** the caller's identity for the own chip's menu and the account dialogs */
  account?: EditorAccount;
  /** the room client's status for the save words and the persisted queue offer */
  sync?: EditorSync;
  /** the caller's role (6.1); absent on a checkout and on a deck with no access record */
  role?: EditorRole;
  /** the caller's capabilities (6.2); absent reads as every capability (today's open deck) */
  capabilities?: readonly EditorCapability[];
  /** View > Mode (5.3, 6.3); `toggles.viewing` is the round one flag it supersedes */
  mode?: EditorMode;
  /** the Activity panel's feed (5.7) */
  activity?: EditorActivity;
  /**
   * The identities of the principals the stored surfaces name (version authors, comment authors
   * the route did not resolve inline), keyed by principal id, from `resolvePrincipal` (7.8)
   */
  identities?: Readonly<Record<string, IdentityView>>;
  /** `version.diff` for Show changes (5.7): the route runs it; the shell dispatches the action when absent */
  diffVersions?: (from: number, to: number) => Promise<VersionDiffView>;
};

/** `version.diff`'s answer as the Show changes overlay reads it (SPEC-3 0.44, 5.7). */
export type VersionDiffView = {
  from: number;
  to: number;
  byAuthor: ReadonlyArray<{
    author: { kind: 'human' | 'agent'; name: string; runId?: string; principalId?: string };
    blocks: ReadonlyArray<{ slideId: string; blockId?: string; ops: readonly string[] }>;
  }>;
  /** the mutations themselves, for the run level underline and strike */
  mutations?: ReadonlyArray<Mutation>;
};

/** The line kinds a draw tool arms (SPEC-2 6.2): the legacy line, arrow and rule, the two connectors and the three path tools. */
export type DrawLineKind =
  'line' | 'arrow' | 'rule' | 'elbow' | 'curved' | 'curve' | 'polyline' | 'scribble';

/**
 * The draw tools of the canvas (SPEC-2 seams, 6.2): every shape preset and line kind, the text
 * box, a table or chart placed by a click, and the word art bar's insert. The route maps them to
 * the stage's own tool type.
 */
export type DrawTool =
  | { kind: 'text' }
  | { kind: 'shape'; shape: string }
  | { kind: 'line'; line: DrawLineKind }
  | { kind: 'table'; columns: number; rows: number }
  | { kind: 'chart'; chart: ChartKind }
  | { kind: 'wordArt'; text: string };

/**
 * Where a picked picture lands: a new shot block, the selected block's asset, the slide's picture,
 * or the picture object at the bottom of the stack (Change background > Choose, SPEC-2 2.6.4).
 */
export type PictureTarget =
  | { kind: 'insert'; slideId: string }
  | { kind: 'block'; slideId: string; blockId: string; path: string }
  | { kind: 'slide'; slideId: string; path: '/picture/asset' }
  | { kind: 'background'; slideId: string };

// ---------------------------------------------------------------------------------------------
// Panels and dialogs

export const PANEL_IDS = [
  'themes',
  'formatOptions',
  'versionHistory',
  'checkSlides',
  'changeHistory',
  'picturesMaterials',
  /* round two (SPEC-2 0.25): the Diagram picker in the right panel */
  'diagram',
  /* round three (SPEC-3 5.3, 5.5, 5.7, 0.27): the Comments, Notifications and Activity panels and the Edit HTML source panel */
  'comments',
  'inbox',
  'activity',
  'editHtml',
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
    case 'Diagram':
      return 'diagram';
    /* round three (SPEC-3 section 13) */
    case 'Comments':
      return 'comments';
    case 'Notifications':
      return 'inbox';
    case 'Activity':
      return 'activity';
    case 'Edit HTML':
      return 'editHtml';
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
  /* the Insert pickers (SPEC 2.4): the symbol picker and the material list; the table size grid
     is a plate inside the Insert menu (SPEC-2 0.26) */
  'insertIcon',
  'insertMaterial',
  /* round two (SPEC-2 0.49): Slide > Change background, Custom spacing, Insert > Special characters */
  'background',
  'customSpacing',
  'specialCharacters',
  /* round three (SPEC-3 7.2 to 7.6, 5.5, 6.5): the name prompt, the sign in dialog, the profile,
     the avatar builder, Notification settings and the request access form; `publish` above is
     rebuilt with Stop publishing (6.4) */
  'namePrompt',
  'signIn',
  'profile',
  'avatarBuilder',
  'notificationSettings',
  'requestAccess',
  /* Forget this browser asks first (7.4, ACCOUNT.forgetConfirm); the route's `account.forget` runs on Forget */
  'forgetBrowser',
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
    /* round two (SPEC-2 4.1) */
    case 'Background':
      return 'background';
    case 'Custom spacing':
      return 'customSpacing';
    case 'Insert special characters':
      return 'specialCharacters';
    /* round three (SPEC-3 section 13; the own chip's rows name their dialogs by their labels) */
    case 'Change name':
      return 'namePrompt';
    case 'Sign in':
      return 'signIn';
    case 'Sessions':
      return 'profile';
    case 'Change avatar':
      return 'avatarBuilder';
    case 'Notification settings':
      return 'notificationSettings';
    case 'Forget this browser':
      return 'forgetBrowser';
    case 'Request access':
      return 'requestAccess';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------
// The selection's family and the toolbar tail

const TEXT_TYPES: ReadonlySet<string> = new Set(['heading', 'paragraph', 'text', 'box']);
const PICTURE_TYPES: ReadonlySet<string> = new Set(['shot', 'pair', 'tiles', 'details', 'picture']);

/** True for a shape block of a line kind (line, arrow, the connectors, the path tools; SPEC-2 2.4). */
export function isLineShape(block: Block): block is ShapeBlock {
  return block.type === 'shape' && isLineKind(block.shape);
}

/** The menu model's family of a block (SPEC 3.2 to 3.8; SPEC-2 4.2 adds the chart and the picture object). */
export function blockFamily(block: Block): BlockFamily {
  if (TEXT_TYPES.has(block.type)) return 'text';
  if (block.type === 'shape') return isLineKind(block.shape) ? 'line' : 'shape';
  if (block.type === 'rule') return 'line';
  if (block.type === 'shot' || block.type === 'picture') return 'image';
  if (block.type === 'table') return 'table';
  if (block.type === 'chart') return 'chart';
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

/** Every block a selection names on a slide, in the selection's order. */
export function selectedBlocks(
  slide: Slide | undefined,
  selection: EditorSelection | null | undefined,
): Block[] {
  if (!slide || !selection) return [];
  const ids = selection.blockIds ?? (selection.blockId === undefined ? [] : [selection.blockId]);
  const placed = slideBlocks(slide);
  return ids
    .map((id) => placed.find(({ block }) => block.id === id)?.block)
    .filter((block): block is Block => block !== undefined);
}

/**
 * The group tag a selection shares (SPEC-2 2.1.3): the route's word, else the one `pos.group`
 * every selected block carries; undefined for one block or a mixed selection.
 */
export function selectionGroup(
  slide: Slide | undefined,
  selection: EditorSelection | null | undefined,
): string | undefined {
  if (selection?.group !== undefined) return selection.group;
  const blocks = selectedBlocks(slide, selection);
  if (blocks.length < 2) return undefined;
  const tag = blocks[0]?.pos?.group;
  return tag !== undefined && blocks.every((block) => block.pos?.group === tag) ? tag : undefined;
}

/** Which tail the toolbar draws (SPEC 3.2 to 3.8; SPEC-2 4.2 adds the chart and group tails). */
export function tailKindOf(
  slide: Slide | undefined,
  selection: EditorSelection | null | undefined,
): TailKind {
  const block = selectedBlock(slide, selection);
  if (block === undefined) return selection?.text ? 'text' : 'default';
  /* SPEC-2 4.2: a group selection takes the group tail whatever its members are */
  if ((selection?.blockIds?.length ?? 0) > 1 && selectionGroup(slide, selection) !== undefined)
    return 'group';
  if (block.type === 'table')
    return selection?.cell !== undefined || selection?.text ? 'table' : 'other';
  const family = blockFamily(block);
  if (family === 'text') return 'text';
  if (family === 'shape') return 'shape';
  if (family === 'image') return 'image';
  if (family === 'line') return 'line';
  if (family === 'chart') return 'chart';
  return 'other';
}

// ---------------------------------------------------------------------------------------------
// The MenuContext

export type ShellSettings = Readonly<Partial<Record<MenuSetting, boolean | string>>>;

const PICTURE_KINDS: ReadonlySet<string> = new Set(['opener', 'mood', 'closing']);

/**
 * The block a fixed kind's field stands for (SPEC-2 1.1: a Title slide's heading and lead, a
 * statement's big line, a picture kind's photograph, plate and mark are objects to the menus
 * before the slide converts). The ids are the ones the renderer gives the pseudo blocks and the
 * conversion keeps (1.2), so a selection survives the first write.
 */
export function pseudoBlockOf(slide: Slide, id: string): Block | undefined {
  switch (slide.kind) {
    case 'title':
      if (id === 'heading') return { id, type: 'heading', level: 'h1', text: slide.heading };
      if (id === 'lead')
        return { id, type: 'paragraph', role: 'lead', tone: 'muted', text: slide.lead ?? '' };
      if (id === 'mark')
        return { id, type: 'mark', w: slide.mark?.w ?? 132, h: slide.mark?.h ?? 84 };
      return undefined;
    case 'statement':
      if (id === 'big') return { id, type: 'heading', level: 'big', text: slide.big };
      return undefined;
    case 'opener':
    case 'mood':
    case 'closing':
      if (id === 'picture') return { id, type: 'picture', asset: slide.picture.asset };
      if (id === 'plate') return { id, type: 'box', fill: 'paper', strokeWidth: 0 };
      return undefined;
    default:
      return undefined;
  }
}

/** The block a selection names, a fixed kind's field included. */
function objectOf(slide: Slide | undefined, id: string | undefined): Block | undefined {
  if (slide === undefined || id === undefined) return undefined;
  return slideBlocks(slide).find(({ block }) => block.id === id)?.block ?? pseudoBlockOf(slide, id);
}

/** The plain text path of a block's Text, the one `text.style` and `text.case` edit (SPEC-2 3). */
export function textPathOf(
  block: Block,
  selection: EditorSelection | null | undefined,
): string | null {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'text':
    case 'credit':
      return '/text';
    case 'box':
    case 'shape':
      return block.text === undefined ? null : '/text';
    case 'plain': {
      const index = selection?.cell?.row ?? 0;
      return block.items[index] === undefined ? null : `/items/${index}/text`;
    }
    case 'table': {
      const cell = selection?.cell ?? { row: 0, column: 0 };
      return `/rows/${cell.row}/cells/${cell.column}`;
    }
    default:
      return null;
  }
}

/** The Text at a plain text path of a block, or undefined. */
export function textAt(block: Block, path: string): string | undefined {
  const value = path
    .split('/')
    .slice(1)
    .reduce<unknown>(
      (node, key) =>
        node !== null && typeof node === 'object'
          ? (node as Record<string, unknown>)[key]
          : undefined,
      block,
    );
  return typeof value === 'string' ? value : undefined;
}

/** True when a picture object covers the sheet at the bottom of the stack (SPEC-2 0.100). */
export function coversSheetOf(slide: Slide | undefined, block: Block | undefined): boolean {
  if (block?.type !== 'picture' || slide === undefined) return false;
  const pos = block.pos;
  if (pos === undefined) return slide.kind !== 'content';
  const covers =
    pos.x <= 0 && pos.y <= 0 && pos.x + pos.w >= SHEET_WIDTH && pos.y + pos.h >= SHEET_HEIGHT;
  const zs = slideBlocks(slide)
    .map(({ block: each }) => each.pos?.z ?? 0)
    .filter((z) => Number.isFinite(z));
  return covers && (pos.z ?? 0) <= Math.min(...zs, 0);
}

/** True when a picture carries a crop, mask, adjustment, anchor or aspect (Reset image applies). */
export function imageEditedOf(block: Block | undefined): boolean {
  if (block?.type === 'shot')
    return (
      block.trim !== undefined ||
      block.mask !== undefined ||
      block.adjust !== undefined ||
      block.crop !== undefined ||
      block.aspect !== undefined
    );
  if (block?.type === 'picture')
    return block.trim !== undefined || block.mask !== undefined || block.adjust !== undefined;
  return false;
}

/** The context the menus evaluate their predicates over, from the editor's facts and the shell's settings. */
export function buildMenuContext(
  input: Pick<
    EditorShellInput,
    | 'document'
    | 'slideId'
    | 'selectedSlideIds'
    | 'selection'
    | 'focus'
    | 'history'
    | 'clipboard'
    | 'guides'
    /* round three (SPEC-3 13.4): the role, the capabilities, the identity and the access facts */
    | 'role'
    | 'capabilities'
    | 'account'
    | 'access'
    | 'inbox'
  > & { regroup?: boolean },
  settings: ShellSettings,
  platform: MenuContext['platform'],
): MenuContext {
  const order = slideOrder(input.document.deck);
  const slide = input.document.slides[input.slideId];
  const index = order.indexOf(input.slideId);
  const block = objectOf(slide, input.selection?.blockId);
  const ids =
    input.selection?.blockIds ??
    (input.selection?.blockId === undefined ? [] : [input.selection.blockId]);
  const blocks = ids.length;
  const freeform = slide?.kind === 'content' && slide.layout.type === 'freeform';
  const placed = slide === undefined ? [] : slideBlocks(slide);
  /* SPEC-2 6.1 row 13: one stack per canvas. On a canvas the rows read from z; on a slide nothing
     converted the first pick converts and the objects take document order as their z, so the rows
     read from the block's place in that order: forward and front when it is not last, backward
     and back when it is not first (the round one place within the slot retires with 1.6). */
  const z = block?.pos?.z;
  const zs = placed
    .map(({ block: each }) => each.pos?.z)
    .filter((v): v is number => v !== undefined);
  const top = zs.length > 0 ? Math.max(...zs) : 0;
  const bottom = zs.length > 0 ? Math.min(...zs) : 0;
  const canOrderZ = freeform && block !== undefined && placed.length > 1;
  const at = block === undefined ? -1 : placed.findIndex(({ block: each }) => each.id === block.id);
  const canOrderDoc = !freeform && block !== undefined && placed.length > 1 && at >= 0;
  const forward = freeform
    ? canOrderZ && z !== undefined && z < top
    : canOrderDoc && at < placed.length - 1;
  const backward = freeform ? canOrderZ && z !== undefined && z > bottom : canOrderDoc && at > 0;
  const family = block === undefined ? undefined : blockFamily(block);
  const typography =
    block !== undefined && 'typography' in block && typeof block.typography === 'object'
      ? (block.typography as Record<string, unknown> | undefined)
      : undefined;
  const group = selectionGroup(slide, input.selection);
  const listItem = input.selection?.listItem === true || block?.type === 'plain';
  const listLevel =
    input.selection?.listLevel ??
    (block?.type === 'plain' ? block.items[input.selection?.cell?.row ?? 0]?.level : undefined);
  const selection: MenuContext['selection'] = {
    blocks,
    ...(family === undefined ? {} : { block: family }),
    box: block?.type === 'box',
    picture: block !== undefined && PICTURE_TYPES.has(block.type),
    textBlock:
      (block !== undefined && TEXT_TYPES.has(block.type)) ||
      input.selection?.text === true ||
      block?.type === 'table' ||
      (block?.type === 'shape' && !isLineKind(block.shape)),
    listItem,
    tableCell:
      block?.type === 'table' &&
      (input.selection?.cell !== undefined ||
        input.selection?.cells !== undefined ||
        input.selection?.text === true),
    linked: block?.link !== undefined,
    order: { forward, front: forward, backward, back: backward },
    /* round two (SPEC-2 4.1, 1.1): every top level block of every slide kind is an object; the
       route says no for a nested block */
    object: blocks > 0 && input.selection?.nested !== true,
    rotatable:
      input.selection?.positioned ?? (block?.pos !== undefined || (blocks > 0 && !freeform)),
    ...(group === undefined ? {} : { group }),
    ...(input.regroup === undefined ? {} : { regroup: input.regroup }),
    coversSheet: input.selection?.coversSheet ?? coversSheetOf(slide, block),
    ...(input.selection?.cells === undefined ? {} : { cells: input.selection.cells }),
    ...(block?.type === 'table' &&
    input.selection?.cell !== undefined &&
    (block as TableBlock).spans?.some(
      (span) =>
        span.row === input.selection?.cell?.row && span.column === input.selection?.cell?.column,
    )
      ? { merged: true }
      : {}),
    ...(input.selection?.range === undefined ? {} : { range: input.selection.range }),
    imageEdited: input.selection?.imageEdited ?? imageEditedOf(block),
    outlined: input.selection?.outlined ?? (block?.type === 'text' && block.outline !== undefined),
    ...(listLevel === undefined ? {} : { listLevel }),
    spaceBefore: typeof typography?.spaceBefore === 'number' && typography.spaceBefore > 0,
    spaceAfter: typeof typography?.spaceAfter === 'number' && typography.spaceAfter > 0,
    /* round three (SPEC-3 0.27): an html block opens the Edit HTML source panel */
    ...(block?.type === 'html' ? { html: true } : {}),
  };
  const focus: MenuContext['focus'] =
    input.focus ?? (input.selection?.text ? 'text' : blocks > 0 ? 'canvas' : 'none');
  const guides = input.guides ?? input.document.deck.guides;
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
    guides: (guides?.x.length ?? 0) + (guides?.y.length ?? 0),
    settings: { ...DEFAULT_MENU_CONTEXT.settings, ...settings },
    /* round three (SPEC-3 13.4): absent fields read as today's open deck */
    ...(input.role === undefined ? {} : { role: input.role }),
    ...(input.capabilities === undefined ? {} : { capabilities: input.capabilities }),
    ...(input.account === undefined
      ? {}
      : {
          account: {
            signedIn: input.account.signedIn,
            signInAvailable: input.account.signInAvailable,
          },
        }),
    ...(input.access === undefined && input.inbox === undefined
      ? {}
      : {
          access: {
            ...(input.inbox?.activityForCommenters === undefined
              ? {}
              : { activityForCommenters: input.inbox.activityForCommenters }),
            ...(input.access?.requests === undefined
              ? {}
              : { pendingRequests: input.access.requests.length }),
          },
        }),
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
  /** the set the editor remembers from the last Ungroup, for Regroup (SPEC-2 4.1) */
  regroup?: { blockIds: readonly string[]; group: string } | null;
  /** the guide under the pointer when a guide's right-click menu opened (Delete guide) */
  guide?: { axis: 'x' | 'y'; at: number } | null;
  /** the deck's guides as the route passes them; the document's when absent */
  guides?: DeckGuides;
};

const SELECT_TEXT = 'Select a text block first';
const SELECT_BLOCK = 'Select an object on the slide first';
const SELECT_CELL = 'Click a table cell first';
const SELECT_OBJECTS = 'Select two or more objects on the slide first';

function currentSlide(facts: ActionFacts): Slide | undefined {
  return facts.document.slides[facts.slideId];
}

/** The facts `menuActionPlan` reads, from the shell's input (the dialogs build their plans the same way). */
export function factsOf(
  input: EditorShellInput,
  lastLayout: LayoutId | null = null,
  extra: Pick<ActionFacts, 'regroup' | 'guide'> = {},
): ActionFacts {
  return {
    document: input.document,
    slideId: input.slideId,
    selectedSlideIds: input.selectedSlideIds ?? [input.slideId],
    selection: input.selection,
    revision: input.revision,
    lastLayout,
    ...(input.guides === undefined ? {} : { guides: input.guides }),
    ...extra,
  };
}

// ---------------------------------------------------------------------------------------------
// The Insert menu (SPEC 2.4; SPEC-2 1.6, 6.2): what a row does before its write

/** The picker an Insert row opens before its block.insert: the symbols, the materials. */
export type InsertPicker = 'icon' | 'material';

/**
 * What an Insert row does before any write (SPEC 2.4, 3.1; SPEC-2 6.2): Text box, the shapes and
 * the lines arm a draw tool (a click places, a drag draws); Icon and Material open a picker;
 * Upload from computer opens the OS file picker. Null for a row that plans an action outright.
 */
export type InsertIntent =
  { kind: 'tool'; tool: DrawTool } | { kind: 'picker'; picker: InsertPicker } | { kind: 'upload' };

const DRAW_TOOL_OF: Readonly<Record<string, DrawTool>> = {
  'insert.textBox': { kind: 'text' },
  'insert.shape.shapes.rectangle': { kind: 'shape', shape: 'rectangle' },
  'insert.shape.shapes.rounded': { kind: 'shape', shape: 'rounded' },
  'insert.shape.shapes.ellipse': { kind: 'shape', shape: 'ellipse' },
  'insert.shape.arrows.arrow': { kind: 'line', line: 'arrow' },
  'insert.line.line': { kind: 'line', line: 'line' },
  'insert.line.arrow': { kind: 'line', line: 'arrow' },
  'insert.line.rule': { kind: 'line', line: 'rule' },
  'insert.line.elbowConnector': { kind: 'line', line: 'elbow' },
  'insert.line.curvedConnector': { kind: 'line', line: 'curved' },
  'insert.line.curve': { kind: 'line', line: 'curve' },
  'insert.line.polyline': { kind: 'line', line: 'polyline' },
  'insert.line.scribble': { kind: 'line', line: 'scribble' },
};

/* Insert > Table is a hover grid inside the menu (SPEC-2 0.26), not a picker dialog */
const PICKER_OF: Readonly<Record<string, InsertPicker>> = {
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

/** The draw tool a shape picker pick arms (SPEC-2 4.1): the preset by its id. */
export function shapeDrawTool(shape: string): DrawTool {
  return isLineKind(shape)
    ? { kind: 'line', line: shape as DrawLineKind }
    : { kind: 'shape', shape };
}

/** The block type a draw tool inserts (Gestures.tsx toolBlockType, repeated here so the shell stays pure). */
export function drawToolBlockType(tool: DrawTool): BlockType {
  switch (tool.kind) {
    case 'text':
    case 'wordArt':
      return 'text';
    case 'shape':
      return 'shape';
    case 'line':
      return tool.line === 'rule' ? 'rule' : 'shape';
    case 'table':
      return 'table';
    case 'chart':
      return 'chart';
  }
}

/** The default box a tool places on a click, in sheet px (SPEC-2 6.2). */
export const TOOL_SIZES: Readonly<Record<DrawTool['kind'], [number, number]>> = {
  text: [480, 64],
  shape: [240, 160],
  line: [320, 8],
  table: [960, 320],
  chart: [960, 540],
  wordArt: [960, 120],
};

/** The default points of a path tool placed by a menu command rather than drawn (fractions of the box). */
const PATH_POINTS: Readonly<Record<'curve' | 'polyline' | 'scribble', [number, number][]>> = {
  curve: [
    [0, 0.5],
    [0.5, 0],
    [1, 0.5],
  ],
  polyline: [
    [0, 1],
    [0.5, 0],
    [1, 1],
  ],
  scribble: [
    [0, 0.5],
    [0.25, 0.1],
    [0.5, 0.9],
    [0.75, 0.1],
    [1, 0.5],
  ],
};

/** Word art's block (SPEC-2 0.14, 6.2): 88 px at weight 500 with a 1.5 px ink outline. */
export function wordArtBlock(id: BlockId, text: string): Block {
  return {
    id,
    type: 'text',
    text,
    typography: { size: 88, weight: 500, align: 'center' },
    outline: { color: 'ink', width: 1.5 },
  };
}

/**
 * The block a draw tool places when its row runs without a canvas to draw on (Gestures.tsx
 * toolBlock builds the same block for a click on the sheet): an empty text box with autofit
 * `grow` (SPEC-2 0.23), a shape preset, a line kind, a rule, a table, a chart or word art.
 */
export function drawToolBlock(tool: DrawTool, id: BlockId): Block {
  switch (tool.kind) {
    case 'text':
      return { id, type: 'text', text: '', autofit: 'grow' };
    case 'wordArt':
      return wordArtBlock(id, tool.text);
    case 'shape':
      return { id, type: 'shape', shape: tool.shape } as Block;
    case 'line': {
      if (tool.line === 'rule') return { id, type: 'rule', orientation: 'horizontal' };
      const points =
        tool.line === 'curve' || tool.line === 'polyline' || tool.line === 'scribble'
          ? { points: PATH_POINTS[tool.line] }
          : {};
      return { id, type: 'shape', shape: tool.line, ...points } as Block;
    }
    case 'table':
      return emptyTable(id, tool.columns, tool.rows);
    case 'chart':
      return emptyChart(id, tool.chart) as Block;
  }
}

/**
 * Where a picked picture lands for an Upload from computer, By URL or From this presentation row
 * (SPEC 2.4, 2.5, 2.6): Replace image writes the selected block's asset, Change background the
 * picture object at the bottom of the stack (SPEC-2 2.6.4), and Insert > Image a new shot block
 * on the current slide.
 */
export function pictureTargetOf(
  itemId: string,
  slideId: string,
  blockId: string | undefined,
): PictureTarget {
  if (itemId.startsWith('format.image.replaceImage') && blockId !== undefined)
    return { kind: 'block', slideId, blockId, path: '/asset' };
  if (itemId.startsWith('slide.changeBackground')) return { kind: 'background', slideId };
  return { kind: 'insert', slideId };
}

/**
 * A box of a size centred on the sheet (SPEC-2 6.2: every insert lands centred). The centre is
 * not rounded to the 8 px grid: Snap to > Grid is off by default (6.1 row 31) and the fixture's
 * `chart-bar` sits at 320, 180, the centre of a 960 by 540 chart (VERIFICATION-2 finding 26).
 */
export function centredPosition(size: readonly [number, number]): Position {
  const [w, h] = size;
  return { x: Math.round((SHEET_WIDTH - w) / 2), y: Math.round((SHEET_HEIGHT - h) / 2), w, h };
}

/** The position of the picture object Change background inserts: the whole sheet at the bottom (2.6.4). */
export const BACKGROUND_PICTURE_POS: Position = {
  x: 0,
  y: 0,
  w: SHEET_WIDTH,
  h: SHEET_HEIGHT,
  z: 0,
};

/** The default box of a block type placed from a menu, in sheet px (palette-data.ts DEFAULT_SIZE). */
export const INSERT_SIZES: Readonly<Record<string, [number, number]>> = {
  box: [320, 184],
  shape: [240, 160],
  rule: [320, 8],
  text: [480, 64],
  icon: [48, 48],
  shot: [480, 272],
  picture: [480, 272],
  material: [480, 272],
  heading: [800, 56],
  paragraph: [640, 104],
  table: [960, 320],
  chart: [960, 540],
};

/**
 * One block.insert of a made block into the current slide as a positioned object centred on the
 * sheet (SPEC-2 1.6, 6.2), on every slide kind: the store action converts a slide that is not a
 * canvas yet and lands the object on top of the stack. Nothing lands in a grammar slot from here
 * (a slot gains a block through Apply layout or an agent's `block.insert` with a slot and no
 * `pos`, SPEC-2 0.8). `at` places the box elsewhere (a background picture at the sheet's origin).
 */
export function insertBlockPlan(
  facts: ActionFacts,
  type: BlockType,
  make: (id: BlockId) => Block,
  label: string,
  options: { size?: readonly [number, number]; at?: Position } = {},
): ActionPlan | ActionRefusal {
  const slide = currentSlide(facts);
  if (slide === undefined) return { refused: 'No slide to insert into' };
  const id = freeBlockId(slide, type);
  const made = make(id);
  const pos = options.at ?? centredPosition(options.size ?? INSERT_SIZES[type] ?? [320, 160]);
  const block: Block = { ...made, pos } as Block;
  return {
    action: 'block.insert',
    input: { slideId: facts.slideId, slot: 'main', block, baseRevision: facts.revision },
    label,
  };
}

/** The default table the Table row inserts when its grid is not on hand: 3 columns by 3 rows with a header row. */
export const DEFAULT_TABLE_SIZE = { columns: 3, rows: 3 } as const;

function block(facts: ActionFacts): Block | undefined {
  return objectOf(currentSlide(facts), facts.selection?.blockId);
}

function blocks(facts: ActionFacts): Block[] {
  const slide = currentSlide(facts);
  const ids =
    facts.selection?.blockIds ??
    (facts.selection?.blockId === undefined ? [] : [facts.selection.blockId]);
  return ids.map((id) => objectOf(slide, id)).filter((each): each is Block => each !== undefined);
}

function blockIds(facts: ActionFacts): string[] {
  return (
    facts.selection?.blockIds?.slice() ??
    (facts.selection?.blockId === undefined ? [] : [facts.selection.blockId])
  );
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

/** The table command a Format > Table item names, at the selected cell (the round one form the stage still runs). */
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

const ALIGN_OF: Readonly<Record<string, 'left' | 'center' | 'right' | 'justify'>> = {
  'format.alignIndent.left': 'left',
  'format.alignIndent.center': 'center',
  'format.alignIndent.right': 'right',
  'format.alignIndent.justified': 'justify',
};

const SPACING_OF: Readonly<Record<string, number>> = {
  'format.spacing.single': SPACING_STEPS[0]?.leading ?? 1.02,
  'format.spacing.1_15': 1.2,
  'format.spacing.1_5': 1.5,
  'format.spacing.double': SPACING_STEPS[3]?.leading ?? 1.7,
};

/** The overrides Clear formatting removes (SPEC 2.5; SPEC-2 adds the round two looks), one block.set each in one slide.update. */
export const FORMAT_OVERRIDE_PATHS: ReadonlyArray<string> = [
  '/typography',
  '/color',
  '/fill',
  '/stroke',
  '/strokeWidth',
  '/dash',
  '/shadow',
  '/outline',
];

/** The first preset of each list family, what the button and the key apply (SPEC-2 0.4). */
export const FIRST_BULLET_PRESET = BULLET_PRESETS[0];
export const FIRST_NUMBER_PRESET = NUMBER_PRESETS[0];

/** The Format options section a panel row opens at (SPEC-2 4.1, 4.3, 5). */
export const PANEL_SECTION_OF: Readonly<Record<string, string>> = {
  'format.textFitting': 'textFitting',
  'format.dropShadow': 'shadow',
  'format.altText': 'altText',
  'format.editData': 'chart',
  'format.image.imageOptions': 'picture',
};

/** The mark a text row toggles (SPEC-2 4.1), read from the effect's input. */
function markOf(item: MenuItem): 'i' | 'u' | 's' | 'sup' | 'sub' | null {
  const mark = item.effect?.kind === 'action' ? item.effect.input?.mark : undefined;
  return mark === 'i' || mark === 'u' || mark === 's' || mark === 'sup' || mark === 'sub'
    ? mark
    : null;
}

/** The range a text write covers: the caret's, else the whole Text at the path. */
function rangeOf(target: Block, path: string, facts: ActionFacts): [number, number] {
  if (facts.selection?.range !== undefined) return facts.selection.range;
  return [0, plainLength(textAt(target, path) ?? '')];
}

/**
 * One `text.style` toggling a mark, or setting a colour, over the caret's range or the whole
 * Text (SPEC-2 4.1): the toggle reads the range's current marks (the route's, else the Text's).
 */
export function textStylePlan(
  facts: ActionFacts,
  edit:
    | { mark: 'i' | 'u' | 's' | 'sup' | 'sub' }
    | { color: string | null }
    | { highlight: string | null },
  label: string,
): ActionPlan | ActionRefusal {
  const target = block(facts);
  if (target === undefined) return { refused: SELECT_TEXT };
  const path = textPathOf(target, facts.selection);
  if (path === null) return { refused: SELECT_TEXT };
  const range = rangeOf(target, path, facts);
  let marks: Record<string, unknown>;
  if ('mark' in edit) {
    const current = facts.selection?.marks ?? marksOfRange(textAt(target, path) ?? '', range);
    const on = (current as Record<string, unknown>)[edit.mark] === true;
    marks = { [edit.mark]: !on };
    /* superscript and subscript are exclusive: setting one clears the other (SPEC-2 2.2.4) */
    if (!on && edit.mark === 'sup') marks.sub = false;
    if (!on && edit.mark === 'sub') marks.sup = false;
  } else if ('color' in edit) {
    marks = { color: edit.color };
  } else {
    marks = { highlight: edit.highlight };
  }
  return {
    action: 'text.style',
    input: {
      slideId: facts.slideId,
      blockId: target.id,
      path,
      range,
      marks,
      baseRevision: facts.revision,
    },
    label,
  };
}

/** One `text.list` (SPEC-2 4.1, 0.4): a marker with its preset, or a level step of the selected items. */
export function listPlan(
  facts: ActionFacts,
  write:
    | { marker: 'rule' | 'bullet' | 'number'; preset?: string }
    | { level: number }
    | { levelBy: 1 | -1 },
  label: string,
): ActionPlan | ActionRefusal {
  const target = block(facts);
  if (target === undefined) return { refused: SELECT_TEXT };
  if (
    target.type !== 'plain' &&
    target.type !== 'paragraph' &&
    target.type !== 'text' &&
    target.type !== 'box'
  )
    return { refused: 'Select a paragraph or a text box first' };
  const items =
    target.type === 'plain' && facts.selection?.cell !== undefined
      ? { items: [facts.selection.cell.row] }
      : {};
  return {
    action: 'text.list',
    input: {
      slideId: facts.slideId,
      blockId: target.id,
      ...('marker' in write
        ? { marker: write.marker, ...(write.preset === undefined ? {} : { preset: write.preset }) }
        : { ...write, ...items }),
      baseRevision: facts.revision,
    },
    label,
  };
}

/**
 * The dash write for the selected block (SPEC-2 2.3.3): `shape.set` on a shape or a line,
 * `block.set /dash` on a rule or a box, the table border's dash, or a picture frame's dash.
 */
export function dashPlan(
  facts: ActionFacts,
  dash: string | null,
  label: string,
): ActionPlan | ActionRefusal {
  const targets = blocks(facts);
  if (targets.length === 0) return { refused: SELECT_BLOCK };
  const shapes = targets.filter((each) => each.type === 'shape');
  if (shapes.length === targets.length)
    return {
      action: 'shape.set',
      input: {
        slideId: facts.slideId,
        blockIds: shapes.map((each) => each.id),
        dash,
        baseRevision: facts.revision,
      },
      label,
    };
  const target = targets[0];
  if (target === undefined) return { refused: SELECT_BLOCK };
  switch (target.type) {
    case 'rule':
    case 'box':
      return blockSet(facts, target.id, '/dash', dash ?? undefined, label);
    case 'table': {
      const border = { ...((target as TableBlock).border ?? { weight: 1 }) } as Record<
        string,
        unknown
      >;
      if (dash === null) delete border.dash;
      else border.dash = dash;
      return blockSet(facts, target.id, '/border', border, label);
    }
    case 'shot':
    case 'picture': {
      const frame = { ...(target.frame ?? {}) } as Record<string, unknown>;
      if (dash === null) delete frame.dash;
      else frame.dash = dash;
      return blockSet(
        facts,
        target.id,
        '/frame',
        Object.keys(frame).length === 0 ? undefined : frame,
        label,
      );
    }
    default:
      return { refused: 'Select a box, shape, picture, line or table first' };
  }
}

/** One `line.set` writing a decoration at one end of the selected lines (SPEC-2 2.4.5). */
export function lineEndPlan(
  facts: ActionFacts,
  end: 'start' | 'end',
  kind: string,
  label: string,
): ActionPlan | ActionRefusal {
  const lines = blocks(facts).filter(isLineShape);
  if (lines.length === 0) return { refused: 'Select a line first' };
  return {
    action: 'line.set',
    input: {
      slideId: facts.slideId,
      blockIds: lines.map((each) => each.id),
      [end]: kind,
      baseRevision: facts.revision,
    },
    label,
  };
}

/**
 * The write a shape picker pick makes (SPEC-2 4.1): a mask on a picture, a change of shape on a
 * shape, or the insert of a new shape when the row is an Insert row.
 */
export function shapePickPlan(
  item: Pick<MenuItem, 'id' | 'label'>,
  facts: ActionFacts,
  shape: string,
): ActionPlan | ActionRefusal {
  if (item.id === 'format.image.maskImage') {
    const target = block(facts);
    if (target?.type !== 'shot' && target?.type !== 'picture')
      return { refused: 'Select a picture first' };
    return {
      action: 'block.mask',
      input: {
        slideId: facts.slideId,
        blockId: target.id,
        mask: shape,
        baseRevision: facts.revision,
      },
      label: 'Mask image',
    };
  }
  if (item.id === 'format.changeShape' || item.id === 'toolbar.changeShape') {
    const shapes = blocks(facts).filter((each) => each.type === 'shape' && !isLineKind(each.shape));
    if (shapes.length === 0) return { refused: 'Select a shape first' };
    return {
      action: 'shape.set',
      input: {
        slideId: facts.slideId,
        blockIds: shapes.map((each) => each.id),
        kind: shape,
        baseRevision: facts.revision,
      },
      label: 'Change shape',
    };
  }
  const tool = shapeDrawTool(shape);
  return insertBlockPlan(
    facts,
    drawToolBlockType(tool),
    (id) => drawToolBlock(tool, id),
    item.label,
    {
      size: TOOL_SIZES[tool.kind],
    },
  );
}

/**
 * One `slide.update` writing a field on every selected block that has it (SPEC-2 0.102: a fill,
 * border, dash or shadow with a group selected applies to every member); refuses when none has it.
 */
export function memberWritePlan(
  facts: ActionFacts,
  field: 'fill' | 'stroke' | 'strokeWidth' | 'dash' | 'color',
  value: unknown,
  label: string,
): ActionPlan | ActionRefusal {
  const members = blocks(facts).filter((each) => {
    if (field === 'fill')
      return each.type === 'box' || (each.type === 'shape' && !isLineKind(each.shape));
    if (field === 'stroke' || field === 'strokeWidth' || field === 'dash')
      return each.type === 'box' || each.type === 'shape' || each.type === 'rule';
    return each.type === 'box' || each.type === 'shape' || each.type === 'text';
  });
  if (members.length === 0) return { refused: 'None of the selected objects has that field' };
  const path = (member: Block): string => {
    if (member.type === 'rule' && field === 'stroke') return '/color';
    if (member.type === 'rule' && field === 'strokeWidth') return '/weight';
    if (member.type === 'shape' && field === 'strokeWidth') return '/width';
    return `/${field}`;
  };
  const mutations: Mutation[] = members.map((member) => ({
    op: 'block.set',
    slideId: facts.slideId,
    blockId: member.id,
    path: path(member),
    ...(value === undefined ? {} : { value }),
  }));
  return {
    action: 'slide.update',
    input: { slideId: facts.slideId, mutations, baseRevision: facts.revision },
    label,
  };
}

/** The ladder Zoom in and Zoom out step (SPEC-2 0.81, 0.101), in percent. */
export const ZOOM_LADDER: ReadonlyArray<number> = [
  25, 50, 75, 100, 125, 150, 200, 300, 400, 800, 1600,
];

/** The percent the Zoom box accepts (SPEC-2 0.101), clamped. */
export function clampZoomPercent(value: number): number {
  return Math.max(25, Math.min(1600, Math.round(value)));
}

/** The next ladder step from an effective percent: the nearest step, then one up or down. */
export function zoomStepFrom(percent: number, direction: 1 | -1): number {
  let nearest = 0;
  for (let i = 1; i < ZOOM_LADDER.length; i += 1) {
    const step = ZOOM_LADDER[i] ?? 100;
    if (Math.abs(step - percent) < Math.abs((ZOOM_LADDER[nearest] ?? 100) - percent)) nearest = i;
  }
  const at = Math.max(0, Math.min(ZOOM_LADDER.length - 1, nearest + direction));
  return ZOOM_LADDER[at] ?? 100;
}

/** The effective zoom in percent: the stage's report while Fit, else the setting. */
export function effectiveZoomPercent(
  setting: string | boolean | undefined,
  view: number | undefined,
): number {
  if (setting === 'fit' || setting === undefined || setting === true)
    return view === undefined ? 100 : Math.round(view * 100);
  const n = Number(setting);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

/**
 * The action a `now` item with an `action` effect dispatches, given the editor's facts. Items whose
 * effect names the action outright (slide.new, slide.duplicate, ...) get their input built from
 * the current slide and selection; Format items that all name `block.set` are told apart by id.
 * Returns a refusal sentence when the selection does not carry what the item needs. Every canvas
 * write plans its action on every slide kind: the store action converts a slide that is not a
 * canvas yet in the same write (SPEC-2 1.6).
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
  const ids = blockIds(facts);
  const group = selectionGroup(slide, facts.selection);
  const about = group !== undefined && ids.length > 1 ? { about: 'selection' as const } : {};

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
    /* the Insert rows (SPEC 2.4; SPEC-2 6.2): the shell arms the draw tool first (insertIntentOf);
       this is the write when no canvas is on hand: the default box centred on the sheet */
    case 'insert.textBox':
    case 'insert.shape.shapes.rectangle':
    case 'insert.shape.shapes.rounded':
    case 'insert.shape.shapes.ellipse':
    case 'insert.shape.arrows.arrow':
    case 'insert.line.line':
    case 'insert.line.arrow':
    case 'insert.line.rule':
    case 'insert.line.elbowConnector':
    case 'insert.line.curvedConnector':
    case 'insert.line.curve':
    case 'insert.line.polyline':
    case 'insert.line.scribble': {
      const tool = DRAW_TOOL_OF[item.id];
      if (tool === undefined) break;
      return insertBlockPlan(
        facts,
        drawToolBlockType(tool),
        (id) => drawToolBlock(tool, id),
        item.label,
        { size: TOOL_SIZES[tool.kind] },
      );
    }
    case 'insert.table':
      return insertBlockPlan(
        facts,
        'table',
        (id) => emptyTable(id, DEFAULT_TABLE_SIZE.columns, DEFAULT_TABLE_SIZE.rows),
        item.label,
      );
    case 'insert.chart.bar':
    case 'insert.chart.column':
    case 'insert.chart.line':
    case 'insert.chart.pie': {
      const kind = (effect.kind === 'action' ? effect.input?.chart : undefined) as
        ChartKind | undefined;
      if (kind === undefined) break;
      return insertBlockPlan(
        facts,
        'chart',
        (id) => emptyChart(id, kind) as Block,
        `${item.label} chart`,
      );
    }
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
            blockIds: ids,
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
    /* SPEC-2 6.1 row 13: one stack per canvas on every slide kind; the store action converts a
       slide that is not a canvas yet, so the round one block.move within a slot retires here */
    case 'arrange.order.bringToFront':
    case 'arrange.order.bringForward':
    case 'arrange.order.sendBackward':
    case 'arrange.order.sendToBack': {
      if (target === undefined) return { refused: SELECT_BLOCK };
      const move = effect.kind === 'action' ? (effect.input?.to as string) : 'forward';
      return {
        action: 'block.order',
        input: { slideId: facts.slideId, blockId: target.id, move, ...rev },
        label: item.label,
      };
    }
    /* SPEC-2 0.80: one object aligns to the slide, several to the selection; Center on page is
       always against the sheet */
    case 'arrange.align.left':
    case 'arrange.align.center':
    case 'arrange.align.right':
    case 'arrange.align.top':
    case 'arrange.align.middle':
    case 'arrange.align.bottom':
    case 'arrange.centerOnPage.horizontally':
    case 'arrange.centerOnPage.vertically': {
      if (ids.length === 0) return { refused: SELECT_BLOCK };
      const extra = effect.kind === 'action' ? (effect.input ?? {}) : {};
      const to = extra.to === 'sheet' ? 'sheet' : ids.length > 1 ? 'selection' : 'sheet';
      return {
        action: 'block.align',
        input: { slideId: facts.slideId, blockIds: ids, edge: extra.edge, to, ...rev },
        label: item.label,
      };
    }
    case 'arrange.distribute.horizontally':
    case 'arrange.distribute.vertically': {
      if (ids.length < 3) return { refused: 'Select three or more objects on the slide first' };
      const axis = item.id.endsWith('horizontally') ? 'horizontal' : 'vertical';
      return {
        action: 'block.distribute',
        input: { slideId: facts.slideId, blockIds: ids, axis, ...rev },
        label: item.label,
      };
    }
    /* SPEC-2 4.1: rotation and flip on every object of every slide kind; a group as one write about the selection */
    case 'arrange.rotate.clockwise':
    case 'arrange.rotate.counterClockwise': {
      if (ids.length === 0) return { refused: SELECT_BLOCK };
      const by = effect.kind === 'action' ? (effect.input?.by as number) : 90;
      return {
        action: 'block.rotate',
        input: { slideId: facts.slideId, blockIds: ids, by, ...about, ...rev },
        label: item.label,
      };
    }
    case 'arrange.rotate.flipHorizontally':
    case 'arrange.rotate.flipVertically': {
      if (ids.length === 0) return { refused: SELECT_BLOCK };
      const axis = effect.kind === 'action' ? (effect.input?.axis as 'h' | 'v') : 'h';
      return {
        action: 'block.flip',
        input: { slideId: facts.slideId, blockIds: ids, axis, ...about, ...rev },
        label: item.label,
      };
    }
    case 'arrange.group':
      if (ids.length < 2) return { refused: SELECT_OBJECTS };
      return {
        action: 'block.group',
        input: { slideId: facts.slideId, blockIds: ids, ...rev },
        label: 'Group',
      };
    case 'arrange.ungroup':
      if (ids.length === 0) return { refused: 'Select a group first' };
      return {
        action: 'block.ungroup',
        input: {
          slideId: facts.slideId,
          ...(group === undefined ? { blockIds: ids } : { group }),
          ...rev,
        },
        label: 'Ungroup',
      };
    case 'arrange.regroup': {
      const memory = facts.regroup;
      if (memory === undefined || memory === null || memory.blockIds.length < 2)
        return { refused: 'Available after Ungroup, while the objects are still on the slide' };
      return {
        action: 'block.regroup',
        input: {
          slideId: facts.slideId,
          blockIds: [...memory.blockIds],
          group: memory.group,
          ...rev,
        },
        label: 'Regroup',
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
    case 'format.text.italic':
    case 'format.text.underline':
    case 'format.text.superscript':
    case 'format.text.subscript': {
      const mark = markOf(item);
      if (mark === null) break;
      return textStylePlan(facts, { mark }, item.label);
    }
    case 'format.text.strikethrough': {
      /* in a run the mark; on a list item with no caret the item's `no` flag (round one) */
      if (target?.type === 'plain' && facts.selection?.text !== true) {
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
      return textStylePlan(facts, { mark: 's' }, item.label);
    }
    case 'format.text.capitalization.lower':
    case 'format.text.capitalization.upper':
    case 'format.text.capitalization.title': {
      if (target === undefined) return { refused: SELECT_TEXT };
      const path = textPathOf(target, facts.selection);
      if (path === null) return { refused: SELECT_TEXT };
      const mode = effect.kind === 'action' ? effect.input?.mode : undefined;
      return {
        action: 'text.case',
        input: {
          slideId: facts.slideId,
          blockId: target.id,
          path,
          range: rangeOf(target, path, facts),
          mode,
          ...rev,
        },
        label: item.label,
      };
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
    case 'format.alignIndent.right':
    case 'format.alignIndent.justified': {
      if (target === undefined) return { refused: SELECT_TEXT };
      const align = ALIGN_OF[item.id];
      if (target.type === 'table') {
        if (align === 'justify') return { refused: 'Justified applies to a text block' };
        const column = facts.selection?.cell?.column ?? 0;
        const columns = (target as TableBlock).columns.map((each, index) =>
          index === column ? { ...each, align } : each,
        );
        return blockSet(facts, target.id, '/columns', columns, item.label);
      }
      return blockSet(
        facts,
        target.id,
        '/typography',
        { ...typographyOf(target), align },
        item.label,
      );
    }
    /* SPEC-2 0.22: a paragraph's indent steps 64 px; a list item's level steps one */
    case 'format.alignIndent.increaseIndent':
    case 'format.alignIndent.decreaseIndent': {
      if (target === undefined) return { refused: SELECT_TEXT };
      const by = item.id.endsWith('increaseIndent') ? 1 : -1;
      const items =
        target.type === 'plain'
          ? {
              items:
                facts.selection?.cell === undefined
                  ? target.items.map((_item, index) => index)
                  : [facts.selection.cell.row],
            }
          : {};
      return {
        action: 'text.indent',
        input: { slideId: facts.slideId, blockIds: [target.id], by, ...items, ...rev },
        label: item.label,
      };
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
    /* SPEC-2 4.1: Add space before or after a paragraph is 8 px, and reads Remove while set */
    case 'format.spacing.addBefore':
    case 'format.spacing.addAfter': {
      if (target === undefined) return { refused: SELECT_TEXT };
      const typography = typographyOf(target);
      const field = item.id.endsWith('addBefore') ? 'before' : 'after';
      const current = typography[field === 'before' ? 'spaceBefore' : 'spaceAfter'];
      const set = typeof current === 'number' && current > 0;
      return {
        action: 'text.spacing',
        input: { slideId: facts.slideId, blockIds: [target.id], [field]: set ? null : 8, ...rev },
        label: set ? `Remove space ${field} paragraph` : item.label,
      };
    }
    /* SPEC-2 0.4: the button and the key apply the first preset; on a list of that family they
       return it to the ruled form */
    case 'format.bulletsNumbering.bulleted':
    case 'format.bulletsNumbering.numbered': {
      const marker = item.id.endsWith('numbered') ? 'number' : 'bullet';
      const current = target?.type === 'plain' ? (target.marker ?? 'rule') : undefined;
      if (current === marker) return listPlan(facts, { marker: 'rule' }, item.label);
      return listPlan(
        facts,
        { marker, preset: marker === 'bullet' ? FIRST_BULLET_PRESET : FIRST_NUMBER_PRESET },
        item.label,
      );
    }
    /* the table rows (SPEC-2 2.7, 4.1): B5's plans from the cell or the range */
    case 'format.table.insertRowAbove':
    case 'format.table.insertRowBelow':
    case 'format.table.insertColumnLeft':
    case 'format.table.insertColumnRight':
    case 'format.table.deleteRow':
    case 'format.table.deleteColumn':
    case 'format.table.distributeRows':
    case 'format.table.distributeColumns':
    case 'format.table.mergeCells':
    case 'format.table.unmergeCells': {
      if (target?.type !== 'table') return { refused: SELECT_CELL };
      const command = tableCommandOfItem(item.id);
      if (command === null) return { refused: SELECT_CELL };
      const cell = facts.selection?.cell;
      const plan = tablePlan(
        target as TableBlock,
        {
          ...(cell === undefined
            ? { cell: [0, 0] as [number, number] }
            : { cell: [cell.row, cell.column] as [number, number] }),
          ...(facts.selection?.cells === undefined ? {} : { cells: facts.selection.cells }),
        },
        command,
      );
      if ('refused' in plan) return plan;
      const added = command === 'insertRowsAbove' || command === 'insertRowsBelow';
      return {
        action: plan.action,
        input: tableWriteInput(plan, facts.slideId, facts.revision),
        label: item.label,
        ...(added ? { snackbar: 'Row added', undo: true } : {}),
      };
    }
    case 'format.table.deleteTable':
      if (target?.type !== 'table') return { refused: SELECT_CELL };
      return {
        action: 'block.remove',
        input: { slideId: facts.slideId, blockId: target.id, ...rev },
        label: 'Delete table',
      };
    case 'format.image.resetImage':
      if (target?.type !== 'shot' && target?.type !== 'picture')
        return { refused: 'Select a picture first' };
      return {
        action: 'block.resetImage',
        input: { slideId: facts.slideId, blockId: target.id, ...rev },
        label: 'Reset image',
      };
    case 'format.chartType.bar':
    case 'format.chartType.column':
    case 'format.chartType.line':
    case 'format.chartType.pie': {
      if (target?.type !== 'chart') return { refused: 'Select a chart first' };
      const kind = effect.kind === 'action' ? effect.input?.kind : undefined;
      return {
        action: 'chart.setKind',
        input: { slideId: facts.slideId, blockId: target.id, kind, ...rev },
        label: item.label,
      };
    }
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
    /* View > Guides (SPEC-2 0.77, 6.1 row 30): the row carries add or clear; Delete guide takes
       the guide under the pointer */
    case 'view.guides.addVertical':
    case 'view.guides.addHorizontal':
    case 'view.guides.clear':
      return {
        action: 'deck.guides',
        input: { ...(effect.kind === 'action' ? effect.input : {}), ...rev },
        label: item.label,
      };
    case 'view.guides.delete': {
      const guide = facts.guide;
      if (guide === undefined || guide === null)
        return { refused: 'Right-click a guide to delete it' };
      return {
        action: 'deck.guides',
        input: { remove: [{ axis: guide.axis, at: guide.at }], ...rev },
        label: 'Delete guide',
      };
    }
    default:
      break;
  }
  /* a Border dash row (SPEC-2 2.3.3) or a Line start or end row (2.4.5): the dash or the decoration by block type */
  if (item.id.startsWith('format.bordersLines.borderDash.') && effect.kind === 'action') {
    const dash = effect.input?.dash;
    return dashPlan(facts, typeof dash === 'string' ? dash : null, item.label);
  }
  if (item.id.startsWith('format.bordersLines.lineStart.') && effect.kind === 'action')
    return lineEndPlan(facts, 'start', String(effect.input?.start), item.label);
  if (item.id.startsWith('format.bordersLines.lineEnd.') && effect.kind === 'action')
    return lineEndPlan(facts, 'end', String(effect.input?.end), item.label);
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
  /* SPEC-2 0.77: the rulers and the guides, per browser like the snap settings */
  'showRuler',
  'showGuides',
];

/**
 * The settings the shell starts from (SPEC 11.3 defaults; SPEC-2 6.1 rows 29 and 30: the rulers
 * and guides start hidden; SPEC-3 4.6, 5.3: Editing mode, every comment shown, the collaborators'
 * pointers on and the own pointer off, no announcements, Show changes off).
 */
export const DEFAULT_SETTINGS: ShellSettings = {
  snapGuides: true,
  snapGrid: false,
  showRuler: false,
  showGuides: false,
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
  mode: 'editing',
  comments: 'all',
  pointerMine: false,
  pointerOthers: true,
  announce: false,
  showChanges: false,
};

/** The mode the shell is in: the route's word, else the round one Viewing flag, else Editing (SPEC-3 5.3). */
export function modeOf(input: Pick<EditorShellInput, 'mode' | 'toggles'>): EditorMode {
  if (input.mode !== undefined) return input.mode;
  return input.toggles?.viewing === true ? 'viewing' : 'editing';
}

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
