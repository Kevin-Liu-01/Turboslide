import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import { createDispatcher } from '@turboslide/agent/dispatch';
import type { StudioAdapter } from '@turboslide/agent/window/adapter';
import { createEditHistory } from '@turboslide/agent/window/history';
import type { HistoryEntry, HistoryStep } from '@turboslide/agent/window/history';
import { windowActionIds } from '@turboslide/agent/window/registry';
import {
  blockAdjust,
  blockAlign,
  blockAutofit,
  blockCrop,
  blockDistribute,
  blockDuplicate,
  blockFlip,
  blockGroup,
  blockInsert,
  blockMask,
  blockMove,
  blockOrder,
  blockRegroup,
  blockRemove,
  blockResetImage,
  blockRotate,
  blockSet,
  blockSetAlt,
  blockShadow,
  blockUngroup,
  canvasCounts,
  chartSetData,
  chartSetKind,
  deckGuides,
  deckSetBackground,
  deckText,
  diagramInsert,
  lineSet,
  pictureDither,
  shapeSet,
  slideApplyLayout,
  slideDuplicate,
  slideNew,
  slideSetBackground,
  slideSetLayout,
  slideSkip,
  slideToCanvas,
  slideUpdate,
  tableCellStyle,
  tableDeleteColumns,
  tableDeleteRows,
  tableDistribute,
  tableInsertColumns,
  tableInsertRows,
  tableMerge,
  tableUnmerge,
  textCase,
  textColumns,
  textIndent,
  textInsert,
  textList,
  textReplaceAll,
  textSpacing,
  textStyle,
} from '@turboslide/cli/store-actions';
import type {
  BlockAdjustInput,
  BlockAlignInput,
  BlockAutofitInput,
  BlockCropInput,
  BlockDistributeInput,
  BlockDuplicateInput,
  BlockFlipInput,
  BlockGroupInput,
  BlockInsertInput,
  BlockMaskInput,
  BlockMoveInput,
  BlockOrderInput,
  BlockRegroupInput,
  BlockRemoveInput,
  BlockResetImageInput,
  BlockRotateInput,
  BlockSetAltInput,
  BlockSetInput,
  BlockShadowInput,
  BlockUngroupInput,
  ChartSetDataInput,
  ChartSetKindInput,
  DeckGuidesInput,
  DeckSetBackgroundInput,
  DiagramInsertInput,
  ExportTextInput,
  LineSetInput,
  PictureDitherInput,
  ShapeSetInput,
  SlideApplyLayoutInput,
  SlideDuplicateInput,
  SlideNewInput,
  SlideSetBackgroundInput,
  SlideSetLayoutInput,
  SlideSkipInput,
  SlideToCanvasInput,
  SlideUpdateInput,
  StoreActionDeps,
  TableCellStyleInput,
  TableDeleteInput,
  TableDistributeInput,
  TableInsertColumnsInput,
  TableInsertRowsInput,
  TableMergeInput,
  TableUnmergeInput,
  TextCaseInput,
  TextColumnsInput,
  TextIndentInput,
  TextInsertInput,
  TextListInput,
  TextReplaceAllInput,
  TextSpacingInput,
  TextStyleInput,
} from '@turboslide/cli/store-actions';
import type { ExportMenuInput, ExportProgress } from '@turboslide/chrome/ExportMenu';
import type {
  CommentAnchorView,
  CommentThreadView,
  CommentView,
  IdentityView,
  InboxItemView,
  NotificationLevel,
  PresenceParticipant,
} from '@turboslide/chrome/editor-shell';
import type { CommentsDisplay } from '@turboslide/chrome/menus/model';
import { REFUSALS } from '@turboslide/chrome/menus/strings';
import type { ArtifactRun, ExportDownload } from '@turboslide/chrome/ExportReportCard';
import type { ShellState } from '@turboslide/chrome/shell-context';
import type { ShellMode } from '@turboslide/chrome/shell-data';
import { planPlayList } from '@turboslide/export/batch/plan';
import { labelFor } from '@turboslide/identity/labels';
import type { Entry, RoomEvent, RosterEntry } from '@turboslide/realtime/channel';
import {
  clearPendingMirror,
  indexedDbPendingStore,
  memoryPendingStore,
} from '@turboslide/realtime/client/pending-store';
import type { PendingStore } from '@turboslide/realtime/client/pending-store';
import { createRoomClient } from '@turboslide/realtime/client/room-client';
import type {
  OpsResponse,
  PersistedOffer,
  Rejected,
  RoomClient,
  RoomTransport,
  SyncStatus,
} from '@turboslide/realtime/client/room-client';
import { roomEventOf } from '@turboslide/realtime/protocol';
import type { OpsPost, PresencePost } from '@turboslide/realtime/protocol';
import { lintStatic } from '@turboslide/lint/lint-static';
import { renderSlide } from '@turboslide/render/slide';
import type { AccessRecord, Capability, Role, Via } from '@turboslide/schema/access';
import { ACTIONS, isActionId } from '@turboslide/schema/actions';
import type { ActionId, DeckTemplateId } from '@turboslide/schema/actions';
import { anchorSlideId, resolveAnchor, threadIsFor } from '@turboslide/schema/comments';
import type { Comment as ThreadComment, Thread } from '@turboslide/schema/comments';
import type { Notification } from '@turboslide/store/inbox';
import type { CanvasBoxes } from '@turboslide/schema/canvas';
import { makeDiagram } from '@turboslide/schema/diagrams';
import { canvasObjects, isCanvasSlide, slideBlocks, slideTitle } from '@turboslide/schema/deck';
import type { Asset } from '@turboslide/schema/assets';
import { blockAssetRefs } from '@turboslide/schema/catalog';
import type { DeckDocument, Section, Slide } from '@turboslide/schema/deck';
import { ConflictError } from '@turboslide/schema/errors';
import type { Finding } from '@turboslide/schema/findings';
import { ICON_NAMES } from '@turboslide/schema/icons';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author, Lease, Mutation, Version, Write } from '@turboslide/schema/mutations';
import { applyMutations, applyWrite } from '@turboslide/schema/reduce';
import { validateSlide } from '@turboslide/schema/validate';
import type { Issue } from '@turboslide/schema/validate';
import { authorLabel, sameAuthor, touchedSlides } from '@turboslide/store/store';
import type { DeckStore, VersionRecord } from '@turboslide/store/store';
import { PRODUCT_TOKENS, PROPER_NOUNS } from '@turboslide/theme/copy';
import { measureForCanvas, measureForFit } from '@turboslide/viewer/canvas-measure';
import {
  TEXT_UNDO_GROUP_MS,
  announceTextChanged,
  readRunText,
} from '@turboslide/viewer/InlineText';
import { isPictureKind } from '@turboslide/viewer/model';
import type { ViewerDeck, ViewerSlide } from '@turboslide/viewer/model';
import { applyTheme, readTheme } from '@turboslide/viewer/theme';
import type { Theme } from '@turboslide/viewer/theme';

import { SERVER_SIDE_WINDOW_ACTIONS_GS3, runDeckAction } from '../server/agent-actions';
import type { ServerSideWindowAction } from '../server/agent-actions';
import { createNewDeck } from '../server/decks';
import {
  EXPORT_POLL_MS,
  batchedProgressLabel,
  pollExport,
  runBatchedExport,
  runBuild,
  signDownload,
  startExport,
  syncExport,
} from '../server/download';
import type { ExportRunInput, SyncExportAnswer } from '../server/download';
import { lintSlides } from '../server/lint';
import { renderSlideImages } from '../server/render';
import { warmThumbnails } from '../server/warm';
import {
  autoTitleMutations,
  leaseSlide,
  listVersions,
  readEditorDeck,
  saveVersion,
  writeDeck,
} from '../server/write';
import type { EditorDeck, EditorIdentity } from '../server/write';

/**
 * The editor, /edit/:deckId with ssr: false (SPEC 3.4, 6; MILESTONES M3). The chrome's
 * ViewerShell around the viewer's stage, as /deck/:deckId, plus the editing surfaces: the
 * Edit | View, Twin, Lint and Source controls in the toolbar slot (EditTools), the status chip,
 * the Cmd K palette, the inspector column, the source drawer, the twin view, the conflict card and
 * the external revision banner. In edit mode the stage is the viewer's Editor (selection, the
 * direct manipulation table of SPEC 6.4, inline text) with the chrome's Overlay drawing the ring,
 * the chip, the handles and the lint boxes.
 *
 * One write path (SPEC 7.1): every gesture, inspector change, palette entry, sidebar drag, source
 * Apply and window API call is one action of the ACTIONS table, dispatched through the same
 * dispatcher, applied through applyWrite in the browser for optimism and then sent to the writeDeck
 * server function, which is the authority. Undo and redo are forward writes carrying the inverse
 * mutations (SPEC 6.7). window.turboslide.studio has three owners here: the editor while editing,
 * the viewer while View is up, and the source drawer as a delegating owner (SPEC 7.4).
 */

// Moved verbatim from routes/edit.$deckId.tsx in the round four split (gslides-parity SPEC-4
// 0.44; PP 7 row 1): the controller, its types and the helpers it reads. EditorRoot.tsx renders
// it and shell-bridge.tsx wires the shell to it; the route file holds the route options alone.

/** The identity as the chrome draws it (SPEC-3 7.8). */
export function identityView(identity: EditorIdentity | undefined, author: Author): IdentityView {
  if (identity === undefined) {
    return { principalId: author.name, label: author.name, trust: 'guest', kind: 'anonymous' };
  }
  return {
    principalId: identity.principalId,
    label: identity.label,
    ...(identity.name !== undefined ? { name: identity.name } : {}),
    trust: identity.trust,
    kind: identity.kind,
    ...(identity.email !== undefined ? { email: identity.email } : {}),
  };
}

/** A roster entry as the presence surfaces read it (SPEC-3 4.11 Participant; the chrome's PresenceParticipant). */
export function participantOf(entry: RosterEntry, now: string): PresenceParticipant {
  const named = entry.trust === 'guest' || entry.trust === 'verified';
  return {
    principalId: entry.principalId,
    label: entry.label,
    ...(named ? { name: entry.label } : {}),
    trust: entry.trust,
    kind:
      entry.kind === 'agent'
        ? 'agent'
        : entry.principalId.startsWith('usr_')
          ? 'account'
          : 'anonymous',
    mark: entry.mark as PresenceParticipant['mark'],
    clientId: entry.clientId,
    role: entry.role,
    ...(entry.kind === 'agent' ? {} : { hue: entry.hueSlot }),
    ...(entry.slideId !== undefined ? { slideId: entry.slideId } : {}),
    ...(entry.selection !== undefined
      ? {
          selection: {
            blockIds: entry.selection.blockIds,
            ...(entry.selection.caret !== undefined
              ? {
                  caret: {
                    blockId: entry.selection.caret.blockId,
                    path: entry.selection.caret.path,
                    offset: entry.selection.caret.offset ?? entry.selection.caret.range?.[0] ?? 0,
                  },
                }
              : {}),
          },
        }
      : {}),
    pointer: entry.pointer ?? null,
    following: entry.follow ?? null,
    presenting: entry.presenting,
    idle: false,
    lastSeenAt: now,
  };
}

/** The browser's transport of the room (SPEC-3 3.3): EventSource down, fetch up, same origin. */
function sseTransport(deckId: string): RoomTransport {
  const base = `/api/decks/${encodeURIComponent(deckId)}`;
  const EVENTS = [
    'hello',
    'ops',
    'op',
    'checkpoint',
    'presence',
    'leave',
    'reject',
    'inbox',
    'access',
    'resync',
  ];
  return {
    open({ since, onEvent, onError }) {
      const source = new EventSource(`${base}/stream?since=${since}`);
      for (const type of EVENTS) {
        source.addEventListener(type, (raw) => {
          const event = roomEventOf({ data: (raw as MessageEvent<string>).data });
          if (event !== null) onEvent(event);
        });
      }
      source.onerror = () => onError(new Error('the stream closed'));
      return { close: () => source.close() };
    },
    async postOps(body: OpsPost): Promise<OpsResponse> {
      const response = await fetch(`${base}/ops`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (response.ok && json.ok === true) return json as unknown as OpsResponse;
      const retry = response.headers.get('retry-after');
      return {
        ok: false,
        status: response.status,
        code: typeof json.error === 'string' ? json.error : 'error',
        message:
          typeof json.message === 'string' ? json.message : `The room answered ${response.status}`,
        ...(typeof json.head === 'number' ? { head: json.head } : {}),
        ...(retry !== null ? { retryAfterMs: Number(retry) * 1000 } : {}),
      };
    },
    async postPresence(body: PresencePost, options = {}) {
      await fetch(`${base}/presence${options.leave === true ? '?leave=1' : ''}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: options.leave === true,
      });
    },
  };
}

/** The pending queue mirror: IndexedDB in a browser, memory where it is missing (SPEC-3 0.7). */
function pendingStoreFor(): PendingStore {
  return typeof indexedDB === 'undefined' ? memoryPendingStore() : indexedDbPendingStore();
}

/** The Text a typing burst names, for the 400 ms undo grouping (SPEC 7.2.15). */
function typingKeyOf(mutations: ReadonlyArray<Mutation>): string | null {
  const first = mutations[0];
  if (mutations.length !== 1 || first === undefined || first.op !== 'text.splice') return null;
  return `${first.slideId}/${first.blockId}${first.path}`;
}

/** How long the external revision banner stays once the revision has been brought in (M4 item 2). */
const EXTERNAL_BANNER_MS = 8000;

export const ASSET_BASE = (deckId: string): string => `/decks/${deckId}/`;

// ---------------------------------------------------------------------------------------------
// Comments, the inbox and the sign in exchanges as the chrome reads them (SPEC-3 5.3, 5.5, 7.3)

/** An identity the chrome can draw for a principal the roster does not hold (a past commenter, a mention). */
function identityOfPrincipal(
  principalId: string,
  label?: string,
  kind?: 'human' | 'agent',
): IdentityView {
  const agent = kind === 'agent' || principalId.startsWith('agent:');
  const account = principalId.startsWith('usr_');
  return {
    principalId,
    label: label ?? labelFor(principalId),
    trust: agent ? 'agent' : account ? 'verified' : 'label',
    kind: agent ? 'agent' : account ? 'account' : 'anonymous',
  };
}

/**
 * Who is who on this deck: the roster's rows (with their marks and trust), the caller, and the
 * authors the threads name, so a comment by someone who left still shows the label they wrote as.
 */
function identityIndex(
  roster: readonly RosterEntry[],
  identity: EditorIdentity | undefined,
  author: Author,
  threads: readonly Thread[],
): ReadonlyMap<string, IdentityView> {
  const out = new Map<string, IdentityView>();
  for (const thread of threads) {
    for (const comment of [thread.comment, ...thread.replies]) {
      const { principalId, label, kind } = comment.author;
      if (!out.has(principalId))
        out.set(principalId, identityOfPrincipal(principalId, label, kind));
    }
  }
  const now = new Date().toISOString();
  for (const entry of roster) out.set(entry.principalId, participantOf(entry, now));
  const me = identityView(identity, author);
  out.set(me.principalId, me);
  return out;
}

function resolveIdentity(
  names: ReadonlyMap<string, IdentityView>,
  principalId: string,
): IdentityView {
  return names.get(principalId) ?? identityOfPrincipal(principalId);
}

function commentViewOf(
  comment: ThreadComment,
  names: ReadonlyMap<string, IdentityView>,
): CommentView {
  return {
    id: comment.id,
    author: resolveIdentity(names, comment.author.principalId),
    createdAt: comment.createdAt,
    ...(comment.editedAt !== undefined ? { editedAt: comment.editedAt } : {}),
    text: comment.body.text,
    mentions: comment.body.mentions.map((mention) =>
      mention.kind === 'principal'
        ? resolveIdentity(names, mention.principalId)
        : {
            principalId: mention.inviteId,
            label: mention.inviteId,
            trust: 'label' as const,
            kind: 'anonymous' as const,
          },
    ),
    ...(comment.reactions !== undefined && comment.reactions.length > 0
      ? {
          reactions: Object.fromEntries(
            comment.reactions.map((reaction) => [reaction.emoji, reaction.principalIds]),
          ),
        }
      : {}),
    ...(comment.deleted !== undefined ? { deleted: true } : {}),
  };
}

/** A stored thread as the card, the markers and the panel read it, its anchor resolved now (SPEC-3 5.1). */
function threadViewOf(
  thread: Thread,
  document: DeckDocument,
  me: string,
  names: ReadonlyMap<string, IdentityView>,
): CommentThreadView {
  const placement = resolveAnchor(document, thread.anchor);
  const slideId = placement.slideId ?? anchorSlideId(thread.anchor);
  const stored = thread.anchor;
  const anchor: CommentAnchorView = {
    kind: stored.kind,
    ...(slideId !== undefined ? { slideId } : {}),
    ...('blockId' in stored ? { blockId: stored.blockId } : {}),
    ...(stored.kind === 'text'
      ? { path: stored.path, range: stored.range, quote: stored.quoted }
      : {}),
    ...(stored.kind === 'cell' ? { cell: { row: stored.cell[0], column: stored.cell[1] } } : {}),
    ...(placement.orphaned ? { orphaned: true } : {}),
  };
  const assignee =
    thread.assignee === undefined
      ? null
      : thread.assignee.to.kind === 'principal'
        ? resolveIdentity(names, thread.assignee.to.principalId)
        : {
            principalId: thread.assignee.to.inviteId,
            label: thread.assignee.to.inviteId,
            trust: 'label' as const,
            kind: 'anonymous' as const,
          };
  return {
    id: thread.id,
    anchor,
    comment: commentViewOf(thread.comment, names),
    replies: thread.replies.map((reply) => commentViewOf(reply, names)),
    ...(thread.resolved !== undefined ? { resolved: true } : {}),
    assignee,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    forMe: threadIsFor(thread, me) || thread.comment.author.principalId === me,
  };
}

/** One inbox row as the Notifications panel reads it (SPEC-3 5.5). */
function inboxItemViewOf(
  item: Notification,
  names: ReadonlyMap<string, IdentityView>,
): InboxItemView {
  return {
    id: item.id,
    kind: item.kind,
    deckId: item.deckId,
    ...(item.threadId !== undefined ? { threadId: item.threadId } : {}),
    ...(item.slideId !== undefined ? { slideId: item.slideId } : {}),
    actors: item.actors.map((principalId) => resolveIdentity(names, principalId)),
    count: item.count,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    ...(item.readAt !== undefined ? { readAt: item.readAt } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// The controller: the document, the room client (gslides-parity SPEC-3 3.6), undo per author,
// versions, the dispatcher. Framework free inside; React reads it through useSyncExternalStore.

/**
 * What a commit resolves with once the room admitted the op: the revision the tab knows (the last
 * checkpoint), the stream seq, and a record shaped answer for the callers that print one.
 */
type Committed = { revision: number; entry: VersionRecord; seq?: number };

/**
 * An operation the room returned to its author with its content (SPEC-3 3.5, 3.6): the reject
 * card lists it with Copy text; the conflict card of round one stays for this and for a
 * `version.restore` admitted while pending ops sat on the restored slides.
 */
export type RejectNotice = {
  opId: string;
  reason: string;
  message?: string;
  mutations: Mutation[];
  /** the plain text the mutations carried, for Copy text */
  text: string;
};

export type External = { revision: number; author?: Author; note?: string };

/** The selection the inspector and the palette read: a block, or a run inside it while it is edited. */
export type Selection = { slideId: string; blockId: string; pointer?: string };

/** What the shell shows, mirrored into the snapshot by ShellBridge for the palette and the keys. */
export type EditorView = { mode: ShellMode; present: boolean };

/**
 * The comments sidecar as this tab holds it (SPEC-3 5.3, 3.10): the threads as the server
 * stores them (anchors resolved against the live document at render time, so an orphan and its
 * revival show at once), the sidecar's counter, the View > Comments display and the open card.
 */
export type CommentsState = {
  threads: readonly Thread[];
  revision: number;
  display: CommentsDisplay;
  openThreadId: string | null;
  /** `comment.list` answered once since the room opened */
  loaded: boolean;
};

/** The caller's inbox (SPEC-3 5.5): the rows, the unread count the stream keeps current, the per deck level. */
export type InboxState = {
  items: readonly Notification[];
  unread: number;
  level?: NotificationLevel;
  email?: boolean;
  activityForCommenters?: boolean;
  loaded: boolean;
};

/** The caller's standing on the deck (SPEC-3 6.1, 6.3), from the loader and again on every `access` event. */
export type AccessFacts = {
  role: Role | null;
  via: Via | null;
  capabilities: readonly Capability[];
  /** the effective record, tokens hashed; null on a draft */
  record: AccessRecord | null;
};

/** The export surface's state: a run in flight (export.run or build.run) and the last finished one. */
export type ArtifactState = { progress: ExportProgress | null; run: ArtifactRun | null };

export type EditorSnapshot = {
  deckId: string;
  author: Author;
  document: DeckDocument;
  /** rendered HTML per slide id, from renderSlide over the current document */
  html: ReadonlyMap<string, string>;
  /** the last revision the server confirmed (the last checkpoint, SPEC-3 3.6) */
  serverRevision: number;
  /** operations pending or retained (SPEC-3 3.6: "Saving…" while pending + retained > 0) */
  pending: number;
  /** the room client's status, null before the stream opened */
  sync: SyncStatus | null;
  /** the room's roster as the stream told it */
  roster: readonly RosterEntry[];
  /** the collaborator this tab follows (SPEC-3 4.4) */
  following: string | null;
  /** the operations the room returned with their content */
  rejects: readonly RejectNotice[];
  /** a closed tab's queue offered on this open (SPEC-3 0.7) */
  persisted: PersistedOffer | null;
  /** the name prompt of 0.18 is open */
  namePrompt: boolean;
  /** View > Live pointers > Show collaborator pointers (SPEC-3 4.6), on by default */
  pointersVisible: boolean;
  /** Show my pointer (SPEC-3 4.6): the toolbar toggle's pressed state, mirrored from the room's presence */
  pointerOn: boolean;
  comments: CommentsState;
  inbox: InboxState;
  access: AccessFacts;
  external: External | null;
  versions: readonly Version[];
  leases: readonly Lease[];
  history: {
    entries: readonly HistoryEntry[];
    log: readonly HistoryStep[];
    /** the undo stack as Version rows (n = the entry id), what the History section lists */
    versions: readonly Version[];
    canUndo: boolean;
    canRedo: boolean;
  };
  activeSlide: string;
  view: EditorView;
  /** the stage scale view.zoom set, or 'fit' (gslides-parity SPEC 7.2.16); the Sheet draws it (B4) */
  zoom: number | 'fit';
  /** the sheet point view.zoom keeps under the stage centre, the sheet centre when null (gslides-parity SPEC-2 0.81) */
  zoomCenter: { x: number; y: number } | null;
  selection: Selection | null;
  /** the last write or action error, for the toast and the status chip */
  error: string | null;
  /** Cmd S asked for a version note */
  versionPrompt: boolean;
  /** the Export menu's run in flight and the last report card */
  artifact: ArtifactState;
};

export type EditorController = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => EditorSnapshot;
  start: () => void;
  stop: () => void;
  attachShell: (shell: ShellState) => void;
  setActiveSlide: (slideId: string) => void;
  select: (selection: Selection | null) => void;
  /** one Write: applied locally now, sent through the room; resolves when the room admitted it */
  commit: (mutations: Mutation[], label: string) => Promise<Committed>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  undoTo: (id: number) => Promise<void>;
  /** dismisses a reject notice */
  dismissReject: (opId: string) => void;
  reload: () => Promise<void>;
  /* round three (SPEC-3 3.6, 4.4, 4.11) */
  followClient: (clientId: string) => void;
  unfollow: () => void;
  goToClient: (clientId: string) => void;
  setPointerOn: (on: boolean) => void;
  /** View > Live pointers > Show collaborator pointers (SPEC-3 4.6) */
  setPointersVisible: (on: boolean) => void;
  /** the tab's own presence state, from the shell and the stage */
  reportPresence: (state: Partial<Omit<PresencePost, 'clientId' | 'clock'>>) => void;
  /* round three comments and the inbox (SPEC-3 5.3, 5.5) */
  /** the threads as the chrome reads them, anchors resolved against the current document */
  threadViews: () => readonly CommentThreadView[];
  inboxViews: () => readonly InboxItemView[];
  /** `comment.list` again; the stream's comment entries schedule it too */
  refreshComments: () => Promise<void>;
  refreshInbox: () => Promise<void>;
  /** a comment or notification action through the dispatcher, then the sidecar and the inbox re-read */
  roomAction: (action: ActionId, input: unknown) => Promise<unknown>;
  setCommentsDisplay: (display: CommentsDisplay) => void;
  openComment: (threadId: string | null) => void;
  /** an inbox row's click: the slide, the card, the row read */
  openInboxItem: (item: InboxItemView) => void;
  promptName: (open: boolean) => void;
  /** the stage reports an inline text session opening or closing; a due name prompt opens at the close */
  noteInlineSession: (active: boolean) => void;
  saveVersion: (note: string) => Promise<Version>;
  restoreVersion: (n: number) => Promise<{ revision: number }>;
  refreshVersions: () => Promise<Version[]>;
  promptVersion: (open: boolean) => void;
  readSource: () => string;
  /** the validator behind the source drawer's Apply and the window API's applySource */
  validateSource: (source: string) => { slide: Slide | null; issues: Issue[]; error?: string };
  applySource: (source: string) => Promise<void>;
  invoke: (action: string, input?: unknown) => Promise<unknown>;
  editorAdapter: () => StudioAdapter;
  viewerAdapter: () => StudioAdapter;
  clearError: () => void;
  findingsFor: (slideId: string) => Finding[];
  allFindings: () => Finding[];
  /** the Edit | View seg's state, for view.* results */
  setEditing: (enabled: boolean) => void;
  /** export.run posts the sync route instead of queueing a job (a hosted studio); the play list longer than `batchSize` runs in batches (SPEC-2 8.1) */
  setExportSync: (enabled: boolean, batchSize?: number) => void;
  /** what the shell shows, from ShellBridge */
  setView: (view: EditorView) => void;
  /** the shell's toast */
  say: (message: string) => void;
  /** the validator behind every applySource: the slide, or a RangeError (unknown slide) or TypeError */
  assertSource: (source: string) => Slide;
  /** History's "Undo to here": undoes every entry after the one with this id */
  undoAfter: (id: number) => Promise<void>;
  /** renders the missing thumbnails of a theme once per session (M3 item 5) */
  warmThumbs: (theme: Theme) => void;
  /** a fresh one-time URL for a file of the last run, then the browser's download */
  downloadArtifact: (run: ArtifactRun, file: ExportDownload) => Promise<void>;
  /** closes the report card */
  clearArtifact: () => void;
};

export function lintLists() {
  return { properNouns: PROPER_NOUNS, tokens: PRODUCT_TOKENS, iconNames: ICON_NAMES };
}

/** Sections with their slides numbered and titled (the `outline` of the slide actions). */
function outlineOf(document: DeckDocument) {
  let n = 0;
  return document.deck.sections.map((section) => ({
    id: section.id,
    name: section.name,
    slides: section.slideIds.map((id) => {
      n += 1;
      const slide = document.slides[id];
      return {
        id,
        n,
        title: slide === undefined ? id : slideTitle(slide, n),
        kind: slide?.kind ?? ('content' as const),
      };
    }),
  }));
}

export function slideOrder(document: DeckDocument): string[] {
  return document.deck.sections.flatMap((section) => section.slideIds);
}

/**
 * The slide that takes the current one's place when a write, an undo or an external change
 * removes it (gslides-parity SPEC 4.1; Google selects the slide that moves into the deleted
 * slide's position, and the previous slide when the last one was deleted): the slide now at the
 * removed slide's index, clamped to the end; the first slide when the current id was never in
 * the order (an empty deck that gained its first slide). Null while the current slide still
 * exists, so nothing moves; the empty string when the deck has no slides left.
 */
function replacementSlide(
  before: readonly string[],
  after: readonly string[],
  active: string,
): string | null {
  if (active !== '' && after.includes(active)) return null;
  const at = before.indexOf(active);
  if (at < 0) return after[0] ?? '';
  return after[Math.min(at, after.length - 1)] ?? '';
}

/** True for a mutation that changes no slide file on its own (order, assets, manifest, restore). */
function isDeckLevel(mutation: Mutation): boolean {
  return (
    mutation.op === 'section.set' ||
    mutation.op === 'asset.set' ||
    mutation.op === 'asset.remove' ||
    mutation.op === 'deck.set' ||
    mutation.op === 'version.restore'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A browser download of a same-origin URL the server signed (tokens.ts): an anchor click. */
export function triggerDownload(url: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = '';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** A stored copy is asked for as an attachment (Vercel Blob honours `download=1`); a route of ours already is one. */
function downloadUrlOf(url: string): string {
  if (url.startsWith('/')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}download=1`;
}

/**
 * A hosted studio's export (docs/hosting.md): one call to the syncExport server function runs the
 * export inside that request and answers the report with the files' URLs (the same runSyncExport
 * and the same JSON as POST /api/export/:deckId?sync=1&format=json), because a job queued by one
 * function invocation is not visible to the next; the download then fetches the URL (a stored copy
 * on the blob backend, this instance's job file on the tmp backend). It is a server function, not
 * a fetch of the route, so the route can require TURBOSLIDE_TOKEN (SPEC 11; docs/hosting.md
 * section 6, option 2) while the page never holds the token.
 */
async function runSyncExport(
  deckId: string,
  input: ExportRunInput,
): Promise<Extract<ArtifactRun, { kind: 'export' }>> {
  const body: SyncExportAnswer = await syncExport({ deckId, input });
  return {
    kind: 'export',
    input: menuInputOf(input),
    report: body.report,
    downloads: body.files.map(({ name, bytes, url }) => ({
      name,
      bytes,
      ...(url !== null ? { url } : {}),
    })),
    jobId: body.summary.job,
    ms: body.summary.ms,
  };
}

/** The menu's shape of an export.run input, for the report card's title (defaults as the action's). */
function menuInputOf(input: ExportRunInput): ExportMenuInput {
  return {
    format: 'pptx',
    mode: input.mode ?? 'flatten',
    theme: input.theme ?? ['light', 'dark'],
    fonts: input.fonts ?? 'exact',
    ...(input.embedFonts === true ? { embedFonts: true as const } : {}),
    ...(input.headings === 'raster' ? { headings: 'raster' as const } : {}),
    verify: input.verify ?? false,
  };
}

export function createEditorController(init: {
  deckId: string;
  author: Author;
  payload: EditorDeck;
  /** deck.create from this editor: open the new deck */
  onDeckCreated?: (deckId: string) => void;
  /** the thread whose card opens on load (`?comment=`) */
  initialThread?: string;
}): EditorController {
  const { deckId, author } = init;
  const history = createEditHistory();
  /* the local revision each history entry produced, for the History rows */
  const revisionOf = new Map<number, number>();
  /* the room client's clock at each history entry, so an undo transforms past what landed since */
  const clockOf = new Map<number, number>();
  const warmed = new Set<Theme>();
  /**
   * The home card of this deck (the first slide at the deck's revision, `/decks`) is warmed once
   * per session after the first saved write (gslides-parity SPEC-4 3.2, PP 3.2 item 4): one
   * render request, answered after the page's own work, so the card is current when the person
   * goes back to the list instead of a Chromium render on that visit (R04: 5.1 s).
   */
  let homeCardWarmed = false;
  /* true once this tab committed a write through the room, so a checkpoint means a save of ours */
  let wroteInSession = false;
  const warmHomeCard = (): void => {
    if (homeCardWarmed) return;
    const first = slideOrder(latest().document)[0];
    if (first === undefined) return;
    homeCardWarmed = true;
    warmThumbnails({ data: { deckId, theme: readTheme(), slideIds: [first] } }).catch(
      () => undefined,
    );
  };
  const listeners = new Set<() => void>();
  let alive = false;
  let shell: ShellState | null = null;
  let findingsCache: { document: DeckDocument; findings: Finding[] } | null = null;
  let room: RoomClient | null = null;
  let draftChain: Promise<unknown> = Promise.resolve();
  /* the typing group (SPEC 7.2.15): consecutive bursts on one Text inside 400 ms are one Cmd Z */
  let lastTyping: { entryId: number; key: string; at: number } | null = null;
  let versionsTimer: ReturnType<typeof setTimeout> | undefined;
  const identity = init.payload.identity;
  const pendingStore = pendingStoreFor();

  const initialOrder = slideOrder(init.payload.document);
  let snapshot: EditorSnapshot = {
    deckId,
    author,
    document: init.payload.document,
    html: new Map(),
    serverRevision: init.payload.document.deck.revision,
    pending: 0,
    sync: null,
    roster: [],
    following: null,
    rejects: [],
    persisted: null,
    namePrompt: false,
    pointersVisible: true,
    pointerOn: false,
    comments: {
      threads: [],
      revision: 0,
      display: 'all',
      openThreadId: init.initialThread ?? null,
      loaded: false,
    },
    inbox: { items: [], unread: 0, loaded: false },
    access: {
      role: init.payload.role ?? null,
      via: init.payload.via ?? null,
      capabilities: init.payload.capabilities ?? [],
      record: init.payload.access ?? null,
    },
    external: null,
    versions: init.payload.versions,
    leases: init.payload.leases,
    history: { entries: [], log: [], versions: [], canUndo: false, canRedo: false },
    activeSlide: initialOrder[0] ?? '',
    view: { mode: 'slide', present: false },
    zoom: 'fit',
    zoomCenter: null,
    selection: null,
    error: null,
    versionPrompt: false,
    artifact: { progress: null, run: null },
  };

  /* the current snapshot through a call, so a check after an await reads the fresh one */
  const latest = (): EditorSnapshot => snapshot;

  const historyVersions = (): Version[] =>
    history.entries().map((entry) => ({
      n: entry.id,
      revision: revisionOf.get(entry.id) ?? 0,
      author,
      note: entry.label,
      createdAt: entry.at,
      mutations: entry.mutations,
    }));

  const publish = (patch: Partial<EditorSnapshot>): void => {
    snapshot = {
      ...snapshot,
      ...patch,
      history: {
        entries: history.entries(),
        log: history.log(),
        versions: historyVersions(),
        canUndo: history.canUndo(),
        canRedo: history.canRedo(),
      },
    };
    for (const listener of listeners) listener();
  };

  /**
   * renderSlide over the document for the slides not yet cached (SPEC 5.2: one renderer), through
   * the module level memo (gslides-parity SPEC-4 3.2, PP 5 "Memoized renderSlide"): a deck level
   * write that drops every slide's HTML (`changedBy` says 'all' for `deck.set`, a guide, a rename,
   * `section.set`) re-renders none of the slides whose stamp and deck inputs are unchanged.
   */
  const renderMissing = (
    document: DeckDocument,
    html: Map<string, string>,
  ): Map<string, string> => {
    const theme = readTheme();
    const deckKey = renderDeckStamp(document.deck, theme, ASSET_BASE(deckId));
    for (const id of slideOrder(document)) {
      if (html.has(id)) continue;
      const slide = document.slides[id];
      if (!slide) continue;
      const key = `${slideStamp(slide)}|${deckKey}`;
      const cached = RENDER_MEMO.get(key);
      if (cached !== undefined) {
        // a hit moves to the newest end, so the map's insertion order is the eviction order
        RENDER_MEMO.delete(key);
        RENDER_MEMO.set(key, cached);
        html.set(id, cached);
        continue;
      }
      const rendered = renderSlide(document.deck, slide, {
        theme,
        chrome: true,
        assetBase: ASSET_BASE(deckId),
        blockAttrs: true,
        gtWord: true,
      }).html;
      RENDER_MEMO.set(key, rendered);
      if (RENDER_MEMO.size > RENDER_MEMO_LIMIT) {
        const oldest = RENDER_MEMO.keys().next().value;
        if (oldest !== undefined) RENDER_MEMO.delete(oldest);
      }
      html.set(id, rendered);
    }
    return html;
  };

  /* the shell knows a new item after its next render: a select that found nothing runs once more
     when the filmstrip has rendered the id's card, checked on every animation frame for up to 2 s
     (gslides-parity SPEC-2 8.5, 0.35; measured in round one: the new slide stayed unselected one
     run in five on a loaded machine, and one extra frame was not always enough). The select runs
     at most twice: a select is a hash navigation, and repeating it every frame cleared the
     snackbar the removal had just shown */
  const selectSoon = (slideId: string): void => {
    shell?.select(slideId);
    if (typeof requestAnimationFrame !== 'function' || typeof document === 'undefined') return;
    const until = Date.now() + 2_000;
    const tick = (): void => {
      if (shell?.active === slideId) return;
      const card = document.querySelector(`.ts-filmstrip .ts-card[data-id="${slideId}"]`);
      if (card !== null) {
        shell?.select(slideId);
        return;
      }
      if (Date.now() < until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  /**
   * Replaces the document and drops the cached HTML of the slides that changed ('all' after a
   * reload). When the change removed the current slide (Delete, an undone New slide or Duplicate,
   * an external write), the slide that took its place becomes current on the snapshot and on the
   * shell, so describe().state, the filmstrip's ring and the next insert never name a slide the
   * deck no longer has (gslides-parity SPEC 4.1; `replacementSlide`).
   */
  const setDocument = (document: DeckDocument, changed: readonly string[] | 'all'): void => {
    const html = changed === 'all' ? new Map<string, string>() : new Map(snapshot.html);
    if (changed !== 'all') for (const id of changed) html.delete(id);
    for (const id of html.keys()) if (document.slides[id] === undefined) html.delete(id);
    findingsCache = null;
    const replacement = replacementSlide(
      slideOrder(snapshot.document),
      slideOrder(document),
      snapshot.activeSlide,
    );
    const moved = replacement !== null && replacement !== snapshot.activeSlide;
    publish({
      document,
      html: renderMissing(document, html),
      ...(moved ? { activeSlide: replacement, selection: null } : {}),
      // the document's revision is the room's confirmed one (pending ops never move it), so the
      // revision describe().state and sync.status report follows it on every path: a remote op
      // folded after a checkpoint, this tab's own apply, a resync (measured before this: 0
      // reported against a document at 3, and a chrome write based on it met a stale base)
      ...(document.deck.revision > snapshot.serverRevision
        ? { serverRevision: document.deck.revision }
        : {}),
    });
    if (moved && replacement !== '') selectSoon(replacement);
  };

  const changedBy = (mutations: ReadonlyArray<Mutation>): readonly string[] | 'all' =>
    mutations.some(isDeckLevel) ? 'all' : touchedSlides(mutations);

  const allFindings = (): Finding[] => {
    if (findingsCache && findingsCache.document === snapshot.document)
      return findingsCache.findings;
    const findings = lintStatic(snapshot.document, lintLists());
    findingsCache = { document: snapshot.document, findings };
    return findings;
  };

  const findingsFor = (slideId: string): Finding[] =>
    allFindings().filter((finding) => finding.slideId === slideId);

  const say = (message: string): void => {
    shell?.say(message);
  };

  /** Waits until nothing is pending in the room (a named version, a restore). */
  const idle = async (): Promise<void> => {
    await draftChain.catch(() => undefined);
    if (room !== null) {
      await room.flush();
      const until = Date.now() + 10_000;
      while (room.status().pending > 0 && Date.now() < until) await sleep(40);
    }
  };

  // The external revision banner (SPEC 6.7; SPEC-3 R4: it retires for edits that arrive live and
  // stays for a resync, a restore or a CLI write the stream could not replay).
  let externalTimer: ReturnType<typeof setTimeout> | undefined;
  const showExternal = (external: External): void => {
    if (externalTimer !== undefined) clearTimeout(externalTimer);
    publish({ external });
    externalTimer = setTimeout(() => {
      if (latest().external?.revision === external.revision) publish({ external: null });
    }, EXTERNAL_BANNER_MS);
  };

  /** The History panel's version rows follow the checkpoints, read once per burst of them. */
  const refreshVersionsSoon = (): void => {
    if (versionsTimer !== undefined) clearTimeout(versionsTimer);
    versionsTimer = setTimeout(() => {
      versionsTimer = undefined;
      listVersions({ deckId })
        .then((versions) => publish({ versions }))
        .catch(() => undefined);
    }, 500);
  };

  const rejectNoticeOf = (rejected: Rejected & { mutations?: Mutation[] }): RejectNotice => {
    const mutations = rejected.mutations ?? [];
    const text = mutations
      .map((mutation) => {
        if (mutation.op === 'text.splice') return mutation.insert;
        if (mutation.op === 'text.replace') return mutation.text;
        if (mutation.op === 'block.set' && typeof mutation.value === 'string')
          return mutation.value;
        return '';
      })
      .filter((row) => row !== '')
      .join('\n');
    return {
      opId: rejected.opId,
      reason: rejected.reason,
      ...(rejected.message === undefined ? {} : { message: rejected.message }),
      mutations,
      text,
    };
  };

  const stopFollowing = (): void => {
    if (latest().following !== null) publish({ following: null });
  };

  /**
   * A collaborator's entry changed a Text (SPEC-3 3.5): every open inline session on that run
   * absorbs the document's new markup (InlineText's TEXT_CHANGED_EVENT), so two people typing in
   * one paragraph converge without a lost keystroke. Own entries are skipped: the editable already
   * holds them.
   */
  const announceRemoteText = (entry: Entry): void => {
    if (room === null || entry.clientId === room.clientId() || entry.mutations === undefined)
      return;
    const document = room.document();
    const seen = new Set<string>();
    for (const mutation of entry.mutations) {
      if (
        mutation.op !== 'text.splice' &&
        mutation.op !== 'text.mark' &&
        mutation.op !== 'text.replace' &&
        !(mutation.op === 'block.set' && typeof mutation.value === 'string')
      ) {
        continue;
      }
      const pointer = mutation.path.replace(/^\//, '');
      const key = `${mutation.slideId}:${mutation.blockId}/${pointer}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const slide = document.slides[mutation.slideId];
      if (slide === undefined) continue;
      const text = readRunText(slide, mutation.blockId, pointer);
      if (text === undefined) continue;
      announceTextChanged({ slideId: mutation.slideId, blockId: mutation.blockId, pointer, text });
    }
  };

  // -------------------------------------------------------------------------------------------
  // Comments and the inbox (SPEC-3 5.3, 5.5, 3.10; VERIFICATION-3 finding 1): the sidecar is
  // read through `comment.list` when the room opens and again after every comment entry on the
  // stream, every checkpoint that wrote comments, every access change and every comment write of
  // this tab; anchors are resolved against the live document at render time (threadViews), so a
  // block's removal orphans its thread and an undo revives it without a round trip. The reads
  // are refused on a draft before its first write and for a role without `readComments`, and
  // both are silent: there is nothing to show.

  /** A draft's creator holds every capability until the loader names a role (SPEC-3 6.1). */
  const hasCapability = (capability: Capability): boolean =>
    init.payload.draft === true || latest().access.capabilities.includes(capability);
  let commentsTimer: ReturnType<typeof setTimeout> | undefined;
  let inboxTimer: ReturnType<typeof setTimeout> | undefined;
  const refreshComments = async (): Promise<void> => {
    if (!hasCapability('readComments')) {
      if (latest().comments.threads.length > 0 || latest().comments.loaded) {
        publish({ comments: { ...latest().comments, threads: [], loaded: false } });
      }
      return;
    }
    try {
      const answer = (await invoke('comment.list', {
        state: 'all',
        includeDeleted: true,
        limit: 200,
      })) as { threads: Thread[]; commentsRevision: number };
      publish({
        comments: {
          ...latest().comments,
          threads: answer.threads,
          revision: answer.commentsRevision,
          loaded: true,
        },
      });
    } catch {
      // a draft before its first write, or a role the record does not let read comments
    }
  };
  const scheduleCommentsRefresh = (): void => {
    if (commentsTimer !== undefined) return;
    commentsTimer = setTimeout(() => {
      commentsTimer = undefined;
      void refreshComments();
    }, 60);
  };
  const refreshInbox = async (): Promise<void> => {
    if (init.payload.draft === true && room === null) return;
    try {
      const [list, settings] = await Promise.all([
        invoke('notification.list', { limit: 100 }) as Promise<{
          notifications: Notification[];
          unread: number;
        }>,
        invoke('notification.settings', {}) as Promise<{
          level: NotificationLevel;
          email: boolean;
          activityForCommenters: boolean;
        }>,
      ]);
      publish({
        inbox: {
          items: list.notifications,
          unread: list.unread,
          level: settings.level,
          email: settings.email,
          activityForCommenters: settings.activityForCommenters,
          loaded: true,
        },
      });
    } catch {
      // the inbox needs the deck in the store and the server's notification handlers
    }
  };
  const scheduleInboxRefresh = (): void => {
    if (inboxTimer !== undefined) return;
    inboxTimer = setTimeout(() => {
      inboxTimer = undefined;
      void refreshInbox();
    }, 60);
  };
  /** A comment or notification action of this tab, then the sidecar and the inbox re-read. */
  const roomAction = async (action: ActionId, input: unknown): Promise<unknown> => {
    const out = await invoke(action, input);
    scheduleCommentsRefresh();
    scheduleInboxRefresh();
    return out;
  };
  /* the thread views, computed once per (threads, document, roster) for the shell and describe() */
  let viewsCache: {
    threads: readonly Thread[];
    document: DeckDocument;
    roster: readonly RosterEntry[];
    views: CommentThreadView[];
  } | null = null;
  const threadViews = (): readonly CommentThreadView[] => {
    const current = snapshot;
    if (
      viewsCache !== null &&
      viewsCache.threads === current.comments.threads &&
      viewsCache.document === current.document &&
      viewsCache.roster === current.roster
    ) {
      return viewsCache.views;
    }
    const names = identityIndex(current.roster, identity, author, current.comments.threads);
    const me = identity?.principalId ?? author.name;
    const views = current.comments.threads.map((thread) =>
      threadViewOf(thread, current.document, me, names),
    );
    viewsCache = {
      threads: current.comments.threads,
      document: current.document,
      roster: current.roster,
      views,
    };
    return views;
  };
  let inboxCache: { items: readonly Notification[]; views: InboxItemView[] } | null = null;
  const inboxViews = (): readonly InboxItemView[] => {
    const current = snapshot;
    if (inboxCache !== null && inboxCache.items === current.inbox.items) return inboxCache.views;
    const names = identityIndex(current.roster, identity, author, current.comments.threads);
    const views = current.inbox.items.map((item) => inboxItemViewOf(item, names));
    inboxCache = { items: current.inbox.items, views };
    return views;
  };
  /** The caller's standing again after an `access` event (SPEC-3 6.3): the role may have moved. */
  const refreshAccess = async (): Promise<void> => {
    const payload = await readEditorDeck({ deckId });
    if (payload === null) {
      window.location.reload();
      return;
    }
    publish({
      access: {
        role: payload.role ?? null,
        via: payload.via ?? null,
        capabilities: payload.capabilities ?? [],
        record: payload.access ?? null,
      },
    });
    scheduleCommentsRefresh();
  };

  /** The room client over the stream (SPEC-3 3.6); started once the deck exists in the store. */
  const attachRoom = (document: DeckDocument, seq: number, tier: SyncStatus['tier']): void => {
    if (room !== null) return;
    const now = (): string => new Date().toISOString();
    const client = createRoomClient({
      deckId,
      transport: sseTransport(deckId),
      document,
      seq,
      tier,
      pendingStore,
      onChange: ({ document: next, changed, reason }) => {
        if (reason === 'local') return;
        if (reason === 'checkpoint') {
          // the revision moved and nothing else: the manifest fields on the snapshot follow
          publish({
            document: {
              deck: {
                ...latest().document.deck,
                revision: next.deck.revision,
                updatedAt: next.deck.updatedAt,
              },
              slides: latest().document.slides,
            },
            serverRevision: next.deck.revision,
          });
          // the first checkpoint that saved this tab's own write warms the home card (SPEC-4 3.2)
          if (wroteInSession) warmHomeCard();
          return;
        }
        setDocument(next, changed);
        // the document's revision moves with a checkpoint the fold already carries (a remote op
        // after it): describe().state.revision and sync.status follow it, so a chrome or agent
        // write that bases on them never meets a stale base (measured: 0 against a document at 2)
        if (next.deck.revision !== latest().serverRevision) {
          publish({ serverRevision: next.deck.revision });
        }
      },
      onStatus: (status) => {
        publish({
          sync: status,
          pending: status.pending + status.retained,
          serverRevision: Math.max(status.revision, latest().serverRevision),
        });
      },
      onEvent: (event: RoomEvent) => {
        switch (event.type) {
          case 'op':
            announceRemoteText(event.entry);
            if (event.entry.kind === 'comment') scheduleCommentsRefresh();
            return;
          case 'ops':
            for (const entry of event.entries) announceRemoteText(entry);
            if (event.entries.some((entry) => entry.kind === 'comment')) scheduleCommentsRefresh();
            return;
          case 'hello':
            publish({ roster: event.clients, error: null });
            if (event.role === 'viewer' && event.editing >= 100) say(REFUSALS.tooManyEditors);
            return;
          case 'presence': {
            const rest = latest().roster.filter((row) => row.clientId !== event.clientId);
            publish({ roster: [...rest, event.state] });
            // Follow (SPEC-3 4.4): the stage moves with the followed client's slide
            const following = latest().following;
            if (
              following === event.clientId &&
              event.state.slideId !== undefined &&
              shell?.active !== event.state.slideId
            ) {
              shell?.select(event.state.slideId);
            }
            return;
          }
          case 'leave':
            publish({ roster: latest().roster.filter((row) => row.clientId !== event.clientId) });
            if (latest().following === event.clientId) publish({ following: null });
            return;
          case 'checkpoint':
            refreshVersionsSoon();
            if (event.comments !== undefined) scheduleCommentsRefresh();
            if (event.external === true) {
              showExternal({
                revision: event.revision,
                author: event.author,
                ...(event.note !== '' ? { note: event.note } : {}),
              });
            }
            return;
          case 'inbox':
            // the unread count travels on the stream (SPEC-3 5.5); the rows are re-read behind it
            publish({ inbox: { ...latest().inbox, unread: event.unread } });
            scheduleInboxRefresh();
            return;
          case 'access':
            // the deck's record changed: the role may have moved; the loader answers the new one
            void refreshAccess().catch(() => undefined);
            return;
          default:
            return;
        }
      },
      onReject: (rejected) => {
        const notice = rejectNoticeOf(rejected);
        publish({ rejects: [...latest().rejects, notice], error: notice.message ?? null });
      },
      onUnplaceable: (op) => {
        publish({
          rejects: [
            ...latest().rejects,
            rejectNoticeOf({
              opId: op.opId,
              reason: 'stale',
              ...(op.mutations === undefined ? {} : { mutations: op.mutations }),
            }),
          ],
        });
      },
      onResync: async (revision) => {
        const payload = await readEditorDeck({ deckId });
        if (payload === null) return null;
        history.clear();
        clockOf.clear();
        publish({
          versions: payload.versions,
          leases: payload.leases,
          serverRevision: payload.document.deck.revision,
        });
        showExternal({ revision: payload.document.deck.revision });
        void revision;
        return payload.document;
      },
      onPersisted: (offer) => {
        publish({
          persisted: {
            count: offer.count,
            apply: async () => {
              publish({ persisted: null });
              await offer.apply();
            },
            discard: async () => {
              publish({ persisted: null });
              await offer.discard();
            },
          },
        });
      },
    });
    room = client;
    client.start();
    void now;
    // the sidecar and the inbox once the deck is in the store (a draft reaches here on its first write)
    scheduleCommentsRefresh();
    scheduleInboxRefresh();
  };

  /** A record shaped answer for the callers of commit that print one (the window API's outputs). */
  const recordOf = (
    mutations: Mutation[],
    inverse: Mutation[],
    seq: number | undefined,
  ): VersionRecord => ({
    n: seq ?? 0,
    revision: latest().serverRevision,
    baseRevision: latest().serverRevision,
    author,
    note: '',
    createdAt: new Date().toISOString(),
    mutations,
    inverse,
  });

  /**
   * The draft's first write (SPEC 6.1): the deck does not exist until it lands, so the write goes
   * through the strict server function, which creates the deck and admits the write through the
   * room; the room client starts on the answer.
   */
  const draftCommit = (
    mutations: Mutation[],
    label: string,
    kind: 'edit' | 'undo' | 'redo',
  ): Promise<Committed> => {
    const base = snapshot.document.deck.revision;
    const write: Write = { baseRevision: base, author, mutations };
    const result = applyWrite(snapshot.document, write);
    if (!result.ok) {
      const error =
        result.code === 'invalid'
          ? new TypeError(result.message)
          : new ConflictError(result.message, {
              currentRevision: result.currentRevision,
              current: result.current,
            });
      publish({ error: error.message });
      return Promise.reject(error);
    }
    if (kind === 'edit') {
      const entry = history.push({ mutations, inverse: result.inverse, label });
      revisionOf.set(entry.id, result.document.deck.revision);
    }
    setDocument(result.document, changedBy(mutations));
    publish({ pending: snapshot.pending + 1 });
    const run = draftChain.then(async () => {
      const answer = await writeDeck({ deckId, write, returnDocument: true });
      if (!answer.ok) {
        publish({ pending: Math.max(0, latest().pending - 1), error: answer.message });
        if (answer.code === 'conflict')
          throw new ConflictError(answer.message, {
            currentRevision: answer.currentRevision,
            current: answer.current,
          });
        throw new TypeError(answer.message);
      }
      publish({
        pending: Math.max(0, latest().pending - 1),
        serverRevision: answer.revision,
        error: null,
      });
      warmHomeCard();
      if (room === null && answer.document !== undefined) {
        setDocument(answer.document, 'all');
        attachRoom(
          answer.document,
          answer.seq ?? answer.revision,
          init.payload.room?.tier ?? 'memory',
        );
      }
      refreshVersionsSoon();
      return {
        revision: answer.revision,
        entry: answer.entry,
        ...(answer.seq === undefined ? {} : { seq: answer.seq }),
      };
    });
    draftChain = run.catch(() => undefined);
    return run;
  };

  /**
   * The local half of a write (SPEC-3 3.6): the room client applies the mutations through the
   * reducer now and flushes them at their cadence; the history takes the entry (typing bursts on
   * one Text inside 400 ms fold into one, SPEC 7.2.15); the promise resolves when the room
   * admitted the op, or rejects with the room's reason and the op's content returned.
   */
  const commitAs = (
    mutations: Mutation[],
    label: string,
    kind: 'edit' | 'undo' | 'redo',
  ): Promise<Committed> => {
    if (room === null) return draftCommit(mutations, label, kind);
    wroteInSession = true;
    let applied;
    try {
      applied = room.apply(mutations, label);
    } catch (error) {
      publish({ error: errorMessage(error) });
      return Promise.reject(error instanceof Error ? error : new TypeError(String(error)));
    }
    if (kind === 'edit') {
      const key = typingKeyOf(mutations);
      const nowMs = Date.now();
      const group =
        key !== null &&
        lastTyping !== null &&
        lastTyping.key === key &&
        nowMs - lastTyping.at < TEXT_UNDO_GROUP_MS
          ? history.entries().find((entry) => entry.id === lastTyping?.entryId)
          : undefined;
      if (group !== undefined && history.entries()[history.entries().length - 1] === group) {
        group.mutations.push(...mutations);
        group.inverse.unshift(...applied.inverse);
        if (lastTyping !== null) lastTyping.at = nowMs;
      } else {
        const entry = history.push({ mutations, inverse: applied.inverse, label });
        revisionOf.set(entry.id, latest().serverRevision);
        clockOf.set(entry.id, applied.at);
        lastTyping = key === null ? null : { entryId: entry.id, key, at: nowMs };
      }
      if (
        identity !== undefined &&
        identity.trust === 'label' &&
        !latest().namePrompt &&
        !promptedName
      ) {
        // the name prompt fires on the first edit, never on open (SPEC-3 0.18); a burst of typing
        // is an edit, so the dialog waits for the inline session to end rather than taking the
        // caret mid word (measured: the first 100 keystroke run lost every character after the
        // first burst to the prompt's field)
        if (inlineActive) namePromptDue = true;
        else openNamePrompt();
      }
    }
    setDocument(applied.document, changedBy(mutations));
    stopFollowing();
    return applied.settled.then((outcome) => {
      if ('rejected' in outcome) {
        throw new ConflictError(
          outcome.rejected.message ?? `The change was not accepted (${outcome.rejected.reason})`,
          {
            currentRevision: latest().serverRevision,
            current: latest().document,
          },
        );
      }
      return {
        revision: latest().serverRevision,
        entry: recordOf(mutations, applied.inverse, outcome.seq),
        seq: outcome.seq,
      };
    });
  };
  let promptedName = false;
  /* an inline text session is open (the Editor reports the caret); the name prompt waits for its end */
  let inlineActive = false;
  let namePromptDue = false;
  const openNamePrompt = (): void => {
    promptedName = true;
    namePromptDue = false;
    publish({ namePrompt: true });
  };

  /* the auto-title (gslides-parity SPEC 6.3): the first committed heading of an Untitled
     presentation renames the deck in the same write, so one undo removes both */
  const commit = (mutations: Mutation[], label: string): Promise<Committed> =>
    commitAs([...mutations, ...autoTitleMutations(snapshot.document, mutations)], label, 'edit');

  /** An undo or redo step moved past what landed since it was recorded (SPEC-3 3.5, 3.6). */
  const stepMutations = (entry: HistoryEntry, mutations: Mutation[]): Mutation[] => {
    const at = clockOf.get(entry.id);
    if (room === null || at === undefined) return mutations;
    return room.transformSince(mutations, at);
  };

  const undo = async (): Promise<void> => {
    const entry = history.undo();
    if (!entry) return;
    lastTyping = null;
    const inverse = stepMutations(entry, entry.inverse);
    if (inverse.length === 0) {
      say(
        REFUSALS.alreadyChanged(
          latest().roster.find((row) => row.clientId !== room?.clientId())?.label ?? 'someone',
        ),
      );
      return;
    }
    try {
      await commitAs(inverse, `undo ${entry.label}`, 'undo');
    } catch (error) {
      say(`Undo failed: ${errorMessage(error)}`);
    }
  };

  const redo = async (): Promise<void> => {
    const entry = history.redo();
    if (!entry) return;
    const forward = stepMutations(entry, entry.mutations);
    if (forward.length === 0) return;
    try {
      await commitAs(forward, `redo ${entry.label}`, 'redo');
    } catch (error) {
      say(`Redo failed: ${errorMessage(error)}`);
    }
  };

  const undoTo = async (id: number): Promise<void> => {
    const entries = history.undoTo(id);
    for (const entry of entries) {
      try {
        await commitAs(stepMutations(entry, entry.inverse), `undo ${entry.label}`, 'undo');
      } catch (error) {
        say(`Undo failed: ${errorMessage(error)}`);
        return;
      }
    }
  };

  const reload = async (): Promise<void> => {
    if (room !== null) {
      await room.resync();
      publish({ external: null, error: null });
      return;
    }
    const payload = await readEditorDeck({ deckId });
    if (!payload) return;
    history.clear();
    publish({
      serverRevision: payload.document.deck.revision,
      versions: payload.versions,
      leases: payload.leases,
      external: null,
      error: null,
    });
    setDocument(payload.document, 'all');
  };

  const dismissReject = (opId: string): void => {
    room?.dismissReject(opId);
    publish({ rejects: latest().rejects.filter((row) => row.opId !== opId), error: null });
  };

  /** A write the server applies first (version.restore needs the version log); the room announces it. */
  const commitServerFirst = async (mutations: Mutation[], label: string): Promise<Committed> => {
    await idle();
    const write: Write = { baseRevision: latest().serverRevision, author, mutations };
    const result = await writeDeck({ deckId, write, returnDocument: true });
    if (!result.ok) {
      if (result.code === 'conflict') {
        publish({ error: result.message });
        throw new ConflictError(result.message, {
          currentRevision: result.currentRevision,
          current: result.current,
        });
      }
      publish({ error: result.message });
      throw new TypeError(result.message);
    }
    const entry = history.push({ mutations, inverse: result.entry.inverse, label });
    revisionOf.set(entry.id, result.revision);
    const { baseRevision: _base, inverse: _inverse, ...version } = result.entry;
    publish({ serverRevision: result.revision, versions: [...snapshot.versions, version] });
    if (result.document) {
      if (room !== null) await room.resync();
      else setDocument(result.document, 'all');
    }
    return { revision: result.revision, entry: result.entry };
  };

  const refreshVersions = async (): Promise<Version[]> => {
    const versions = await listVersions({ deckId });
    publish({ versions });
    return versions;
  };

  const saveVersionNamed = async (note: string): Promise<Version> => {
    await idle();
    const version = await saveVersion({ deckId, author, note });
    publish({ versions: [...snapshot.versions, version], versionPrompt: false });
    say(`Version ${version.n} saved at r${version.revision}`);
    return version;
  };

  const restoreVersion = async (n: number): Promise<{ revision: number }> => {
    const committed = await commitServerFirst([{ op: 'version.restore', n }], `restore ${n}`);
    return { revision: committed.revision };
  };

  const validateSource = (source: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source) as unknown;
    } catch (error) {
      return { slide: null, issues: [], error: `Not JSON: ${errorMessage(error)}` };
    }
    const validation = validateSlide(parsed);
    if (!validation.ok || validation.slide === null)
      return { slide: null, issues: validation.issues };
    if (snapshot.document.slides[validation.slide.id] === undefined) {
      return {
        slide: null,
        issues: validation.issues,
        error: `No slide "${validation.slide.id}" in this deck; the source drawer replaces an existing slide`,
      };
    }
    return { slide: validation.slide, issues: validation.issues };
  };

  const assertSource = (source: string): Slide => {
    const checked = validateSource(source);
    if (checked.slide === null) {
      const blocking = checked.issues.filter((issue) => issue.severity === 3);
      const reason =
        checked.error ??
        blocking.map((issue) => `${issue.pointer || '/'}: ${issue.message}`).join('; ');
      if (checked.error !== undefined && /^No slide/.test(checked.error))
        throw new RangeError(reason);
      throw new TypeError(reason || 'The source does not validate');
    }
    return checked.slide;
  };

  const applySource = async (source: string): Promise<void> => {
    const slide = assertSource(source);
    await commit([{ op: 'slide.replace', slideId: slide.id, slide }], 'source');
    if (slide.id !== snapshot.activeSlide) shell?.select(slide.id);
  };

  const readSource = (): string => {
    const slide = snapshot.document.slides[snapshot.activeSlide];
    return canonicalJson(slide ?? snapshot.document.deck);
  };

  /* the Edit | View seg's state, read by view.* results */
  const editingRef = { current: true };
  /* export.run goes through the sync route on a hosted studio (server/download.ts capabilities.sync);
     a play list longer than the capability's batch size runs the batched protocol (SPEC-2 8.1) */
  let exportSync = false;
  let exportBatchSize = 0;

  // The dispatcher: the same ACTIONS table and validation the CLI and MCP run (SPEC 7.1).
  const dispatcher: Dispatcher = createDispatcher();
  const context: ActionContext = { author };
  const on = <T,>(id: ActionId, run: (input: T) => Promise<unknown> | unknown): void => {
    dispatcher.register(id, (input) => run(input as T));
  };
  /**
   * The revision every surface reports and every base check uses (SPEC-3 3.10): the largest of
   * the room client's confirmed revision, the snapshot's and the document's, so a write based on
   * what describe().state or sync.status answered never meets a stale base (measured before:
   * describe answered 0 while the document stood at 3 and the chrome's block.set met a 409).
   */
  const reportedRevision = (): number =>
    Math.max(
      room?.status().revision ?? 0,
      snapshot.serverRevision,
      snapshot.document.deck.revision,
    );

  const checkBase = (baseRevision: number): void => {
    const current = reportedRevision();
    if (baseRevision !== current) {
      throw new ConflictError(
        `baseRevision ${baseRevision} is stale; the document is at revision ${current}`,
        { currentRevision: current, current: snapshot.document },
      );
    }
  };
  const requireSlide = (slideId: string): Slide => {
    const slide = snapshot.document.slides[slideId];
    if (slide === undefined) throw new RangeError(`No slide "${slideId}"`);
    return slide;
  };
  const slideResult = (committed: Committed, slideId: string) => ({
    slide: requireSlide(slideId),
    revision: committed.revision,
    findings: findingsFor(slideId),
  });
  const viewState = () => {
    const document = snapshot.document;
    const order = slideOrder(document);
    /* the shell's active id first, the snapshot's next, either only while the deck still has
       the slide (the shell re-renders one frame after a removal moved the selection) */
    const present = (id: string | undefined): string =>
      id !== undefined && id !== '' && document.slides[id] !== undefined ? id : '';
    const slideId = present(shell?.active) || present(snapshot.activeSlide) || order[0] || '';
    return {
      slideId,
      n: Math.max(1, order.indexOf(slideId) + 1),
      mode: shell?.mode ?? 'slide',
      theme: readTheme(),
      present: shell?.present ?? false,
      edit: editingRef.current,
      zoom: snapshot.zoom,
    };
  };

  /*
   * The document actions of the Google Slides parity round (gslides-parity SPEC 7.5: slide.new,
   * slide.duplicate, slide.skip, slide.applyLayout, block.duplicate, text.replaceAll, export.text)
   * run the store actions of @turboslide/cli/store-actions, the one implementation the CLI and the
   * hosted dispatcher run (SPEC 7.1), over a DeckStore whose read is the local document and whose
   * write is this editor's commit: the reducer applies the write now, the history takes the entry
   * for undo, and the server confirms it in order. Only read, revision and write are reachable
   * from those actions; the version, lease and watch methods belong to the server (server/write.ts)
   * and throw if a later action reaches for them here.
   */
  const editorStore = (label: string): DeckStore => {
    const unavailable = (method: string) => (): never => {
      throw new TypeError(
        `${method} is not available on the editor's store; commit is its write path`,
      );
    };
    return {
      id: deckId,
      read: async () => ({ document: snapshot.document, issues: [], ok: true }),
      revision: async () => snapshot.document.deck.revision,
      write: async (write) => {
        checkBase(write.baseRevision);
        const committed = await commit(write.mutations, label);
        return {
          ok: true,
          document: snapshot.document,
          revision: committed.revision,
          entry: committed.entry,
          changed: [...touchedSlides(write.mutations)],
          issues: [],
          warnings: [],
        };
      },
      saveVersion: unavailable('saveVersion'),
      listVersions: unavailable('listVersions'),
      records: unavailable('records'),
      documentAt: unavailable('documentAt'),
      documentAtRevision: unavailable('documentAtRevision'),
      lease: unavailable('lease'),
      release: unavailable('release'),
      leases: unavailable('leases'),
      watch: unavailable('watch'),
      // asset bytes go through the server side window actions (SPEC-3 0.39), never this shim
      putAsset: unavailable('putAsset'),
      removeAsset: unavailable('removeAsset'),
    };
  };
  /*
   * The dependencies of the store actions on the window transport. `measureCanvas` and
   * `measureFit` (gslides-parity SPEC-2 1.3, 0.64, 0.104) are the editor's own measurers over a
   * hidden 1600 by 900 sheet in the current theme, `measureForCanvas` and `measureForFit` of
   * @turboslide/viewer/canvas-measure over B2's `measureCanvasBoxes` (the one function the CLI,
   * the MCP server and the hosted studio evaluate headless), so an agent's `block.set /pos` or
   * `slide.toCanvas` from the window API converts a slide through the same render as a drag and
   * writes the same `pos` the CLI writes in Chromium. `diagrams` is B5's `makeDiagram` of
   * @turboslide/schema/diagrams (SPEC-2 2.8.3). The measurers read the slides of the current
   * snapshot (the store's read is the local document).
   */
  const measureOptions = () => ({ assetBase: ASSET_BASE(deckId) });
  const storeDeps = (label: string): StoreActionDeps => ({
    store: editorStore(label),
    lint: lintLists(),
    measureCanvas: async (_deck, slides) => {
      const out: Record<string, CanvasBoxes> = {};
      for (const slide of slides)
        out[slide.id] = await measureForCanvas(
          snapshot.document,
          slide,
          readTheme(),
          measureOptions(),
        );
      return out;
    },
    measureFit: (_deck, slide) =>
      measureForFit(snapshot.document, slide, readTheme(), measureOptions()),
    diagrams: makeDiagram,
  });
  on<{ name: string; baseRevision: number }>('deck.rename', async (input) => {
    checkBase(input.baseRevision);
    const name = input.name.trim();
    if (name === '') throw new TypeError('deck.rename: name must not be empty');
    const committed = await commit(
      [{ op: 'deck.set', path: '/title', value: name }],
      'deck.rename',
    );
    return { title: snapshot.document.deck.title, revision: committed.revision };
  });
  /* deck.set (gslides-parity SPEC 7.2.3 to 7.2.5): the Themes panel's and Slide numbers' write as
     an action, so an agent writes /defaults the way the panel does; the reducer keeps the roots */
  on<{ path: string; value?: unknown; baseRevision: number }>('deck.set', async (input) => {
    checkBase(input.baseRevision);
    const committed = await commit(
      [
        {
          op: 'deck.set',
          path: input.path,
          ...(input.value === undefined ? {} : { value: input.value }),
        },
      ],
      'deck.set',
    );
    let value: unknown = snapshot.document.deck;
    for (const key of input.path.split('/').slice(1)) {
      value =
        value !== null && typeof value === 'object'
          ? (value as Record<string, unknown>)[key]
          : undefined;
    }
    return {
      path: input.path,
      ...(value === undefined ? {} : { value }),
      revision: committed.revision,
    };
  });
  on<{ name: string; from: DeckTemplateId; id?: string }>('deck.create', async (input) => {
    const created = await createNewDeck(input);
    say(`Created ${created.deckId} from ${created.from}: ${created.counts.slides} slides`);
    init.onDeckCreated?.(created.deckId);
    return created;
  });
  /* a server side write comes back over the watch channel; a caller that reads the revision it
     answered can address the result at once (slide.import, and asset.add before a block.insert
     that names the asset: the store action validates the block against the local document, so
     the asset has to be there first) */
  const awaitRevision = async (revision: number, ms: number): Promise<boolean> => {
    const until = Date.now() + ms;
    while (latest().document.deck.revision < revision) {
      if (Date.now() > until) return false;
      await sleep(40);
    }
    return true;
  };
  /* asset.add, asset.dither, material.capture and material.list run on the server (sharp, the
     capture browser, the catalog); the write they end in comes back over the watch channel, and
     the handler waits for that revision before it answers */
  const serverSide = (id: ServerSideWindowAction, options: { announce?: boolean } = {}): void => {
    on<unknown>(id, async (input) => {
      const before = latest().document.deck.revision;
      const output = await runDeckAction({ deckId, action: id, input, author });
      const outputs = Array.isArray(output) ? output : [output];
      const ids = outputs
        .map((entry) => (entry as { id?: string } | null)?.id)
        .filter((entry): entry is string => typeof entry === 'string');
      if (options.announce === true) {
        /* the asset actions write this deck: the answer waits until that write has come back
           over the watch channel (the revision moved, or the asset is in the manifest), so a
           block.insert that names the asset next validates against a document that holds it
           (round one's ten-tasks task 4; the store action validates locally, SPEC 7.1) */
        const revision = (output as { revision?: unknown } | null)?.revision;
        const landed = (): boolean =>
          latest().document.deck.revision > before ||
          (typeof revision === 'number' && latest().document.deck.revision >= revision) ||
          (ids.length > 0 &&
            ids.every((asset) => latest().document.deck.assets[asset] !== undefined));
        const until = Date.now() + 15_000;
        while (!landed() && Date.now() < until) await sleep(40);
        if (ids.length > 0) say(`${id}: ${ids.join(', ')}`);
      }
      return output;
    });
  };
  serverSide('asset.add', { announce: true });
  serverSide('asset.dither', { announce: true });
  serverSide('material.capture', { announce: true });
  serverSide('material.list');
  /* the deck collection actions of the parity round (gslides-parity SPEC 7.5) run on the server
     over the hosted collection; the menu handlers word their own snackbars (SPEC 12) */
  serverSide('deck.list');
  serverSide('deck.copy');
  serverSide('deck.trash');
  serverSide('deck.restore');
  serverSide('deck.remove');
  on<ExportRunInput>('export.run', async (input) => {
    const label = `${input.format.toUpperCase()} ${input.mode ?? 'flatten'}`;
    publish({ artifact: { progress: { label: `Exporting ${label}` }, run: null } });
    try {
      if (exportSync) {
        // a play list longer than the function's batch size runs the batched protocol of SPEC-2
        // 8.1 (plan, batches, merge; server/download.ts runBatchedExport), PPTX only: the PDF
        // stays one call
        const { ids } = planPlayList(snapshot.document, {
          ...(input.includeSkipped === true ? { includeSkipped: true } : {}),
          ...(input.slideIds !== undefined ? { slideIds: input.slideIds } : {}),
        });
        if (input.format !== 'pdf' && exportBatchSize > 0 && ids.length > exportBatchSize) {
          const merged = await runBatchedExport(deckId, input, (progress) =>
            publish({
              artifact: { progress: { label: batchedProgressLabel(progress) }, run: null },
            }),
          );
          const run: ArtifactRun = {
            kind: 'export',
            input: menuInputOf(input),
            report: merged.report,
            downloads: merged.files.map(({ name, bytes, url }) => ({
              name,
              bytes,
              ...(url !== null ? { url } : {}),
            })),
            jobId: merged.summary.job,
            ms: merged.summary.ms,
          };
          publish({ artifact: { progress: null, run } });
          const first = run.downloads[0];
          if (first?.url !== undefined) triggerDownload(downloadUrlOf(first.url));
          return run.report;
        }
        const run = await runSyncExport(deckId, input);
        publish({ artifact: { progress: null, run } });
        const first = run.downloads[0];
        if (first?.url !== undefined) triggerDownload(downloadUrlOf(first.url));
        return run.report;
      }
      const started = await startExport({ deckId, input });
      for (;;) {
        const poll = await pollExport({ jobId: started.jobId });
        if (poll.status === 'done' && poll.report) {
          const run: ArtifactRun = {
            kind: 'export',
            input: menuInputOf(input),
            report: poll.report,
            downloads: (poll.downloads ?? []).map(({ name, bytes }) => ({ name, bytes })),
            jobId: started.jobId,
            ms: poll.ms ?? 0,
          };
          publish({ artifact: { progress: null, run } });
          // the first file downloads at once; the card offers every file again
          const first = poll.downloads?.[0];
          if (first) triggerDownload(first.url);
          return poll.report;
        }
        if (poll.status === 'failed') throw new Error(poll.error ?? 'the export failed');
        publish({
          artifact: {
            progress: {
              label: `${poll.status === 'queued' ? 'Queued' : 'Exporting'} ${label}`,
              ...(poll.line !== undefined ? { line: poll.line } : {}),
            },
            run: null,
          },
        });
        await sleep(EXPORT_POLL_MS);
      }
    } catch (error) {
      publish({
        artifact: { progress: null, run: snapshot.artifact.run },
        error: errorMessage(error),
      });
      throw error;
    }
  });
  on<{ out: string; budgetMB?: number; quality?: number }>('build.run', async (input) => {
    publish({ artifact: { progress: { label: 'Building the standalone file' }, run: null } });
    try {
      const built = await runBuild({
        deckId,
        ...(input.budgetMB !== undefined ? { budgetMB: input.budgetMB } : {}),
      });
      const run: ArtifactRun = {
        kind: 'build',
        path: built.path,
        bytes: built.bytes,
        assertions: built.assertions,
        downloads: built.download
          ? [{ name: built.download.name, bytes: built.download.bytes }]
          : [],
        ms: built.ms,
      };
      publish({ artifact: { progress: null, run } });
      if (built.download) triggerDownload(built.download.url);
      return { path: built.path, bytes: built.bytes, assertions: built.assertions };
    } catch (error) {
      publish({
        artifact: { progress: null, run: snapshot.artifact.run },
        error: errorMessage(error),
      });
      throw error;
    }
  });
  on<Record<string, never>>('deck.info', () => {
    const document = snapshot.document;
    const sections = outlineOf(document);
    return {
      id: document.deck.id,
      title: document.deck.title,
      theme: document.deck.theme,
      revision: document.deck.revision,
      sections,
      counts: {
        slides: sections.reduce((sum, section) => sum + section.slides.length, 0),
        sections: sections.length,
        assets: Object.keys(document.deck.assets).length,
        htmlBlocks: Object.values(document.slides).reduce(
          (sum, slide) =>
            sum + slideBlocks(slide).filter((row) => row.block.type === 'html').length,
          0,
        ),
        skipped: slideOrder(document).filter((id) => document.slides[id]?.skip === true).length,
        // the canvas counts (gslides-parity SPEC-2 0.93): slides arranged by hand, charts, guides
        ...canvasCounts(document),
      },
      // the parity round's manifest facts (gslides-parity SPEC 7.2.3 to 7.2.5), only when written
      ...(document.deck.defaults !== undefined ? { defaults: document.deck.defaults } : {}),
      ...(document.deck.guides !== undefined ? { guides: document.deck.guides } : {}),
      ...(document.deck.trashedAt !== undefined ? { trashedAt: document.deck.trashedAt } : {}),
    };
  });
  on<{ sectionId?: string }>('slide.list', (input) => {
    const rows: {
      id: string;
      n: number;
      section: string;
      title: string;
      kind: Slide['kind'];
      lint: { s3: number; s2: number };
      skip?: boolean;
      template?: Slide['template'];
      canvas?: boolean;
      objects?: number;
    }[] = [];
    const findings = allFindings();
    for (const section of outlineOf(snapshot.document)) {
      if (input.sectionId !== undefined && section.id !== input.sectionId) continue;
      for (const row of section.slides) {
        const mine = findings.filter((finding) => finding.slideId === row.id);
        const record = snapshot.document.slides[row.id];
        rows.push({
          id: row.id,
          n: row.n,
          section: section.id,
          title: row.title,
          kind: row.kind,
          lint: {
            s3: mine.filter((finding) => finding.severity === 3).length,
            s2: mine.filter((finding) => finding.severity === 2).length,
          },
          // the parity round's facts (gslides-parity SPEC 7.2.1, 7.2.2), only when set
          ...(record?.skip === true ? { skip: true } : {}),
          ...(record?.template !== undefined ? { template: record.template } : {}),
          // a canvas slide and its object count (gslides-parity SPEC-2 0.93)
          ...(record !== undefined && isCanvasSlide(record)
            ? { canvas: true, objects: canvasObjects(record).length }
            : {}),
        });
      }
    }
    return rows;
  });
  on<{ slideId: string }>('slide.get', (input) => {
    const slide = requireSlide(input.slideId);
    const document = snapshot.document;
    const order = slideOrder(document);
    const section = document.deck.sections.find((row) => row.slideIds.includes(input.slideId));
    const assets: Record<string, Asset> = {};
    for (const { block } of slideBlocks(slide)) {
      for (const ref of blockAssetRefs(block)) {
        const asset = document.deck.assets[ref.assetId];
        if (asset) assets[ref.assetId] = asset;
      }
    }
    if ('picture' in slide) {
      const asset = document.deck.assets[slide.picture.asset];
      if (asset) assets[slide.picture.asset] = asset;
    }
    return {
      slide,
      n: order.indexOf(input.slideId) + 1,
      section: section?.id ?? document.deck.sections[0]?.id ?? '',
      assets,
      render: null,
    };
  });
  on<{ sectionId: string; after?: string; slide: Slide; baseRevision: number }>(
    'slide.insert',
    async (input) => {
      checkBase(input.baseRevision);
      const committed = await commit(
        [
          {
            op: 'slide.insert',
            sectionId: input.sectionId,
            ...(input.after !== undefined ? { after: input.after } : {}),
            slide: input.slide,
          },
        ],
        'slide.insert',
      );
      return {
        slide: requireSlide(input.slide.id),
        revision: committed.revision,
        outline: outlineOf(snapshot.document),
      };
    },
  );
  on<{ slideId: string; baseRevision: number }>('slide.remove', async (input) => {
    checkBase(input.baseRevision);
    requireSlide(input.slideId);
    const committed = await commit(
      [{ op: 'slide.remove', slideId: input.slideId }],
      'slide.remove',
    );
    return { revision: committed.revision, outline: outlineOf(snapshot.document) };
  });
  on<{ slideId: string; sectionId: string; after?: string; baseRevision: number }>(
    'slide.move',
    async (input) => {
      checkBase(input.baseRevision);
      const committed = await commit(
        [
          {
            op: 'slide.move',
            slideId: input.slideId,
            sectionId: input.sectionId,
            ...(input.after !== undefined ? { after: input.after } : {}),
          },
        ],
        'slide.move',
      );
      return { sections: snapshot.document.deck.sections, revision: committed.revision };
    },
  );
  /* slide.update, block.set, block.insert, block.remove and block.move run the store actions of
     @turboslide/cli/store-actions (the one implementation of every transport, SPEC 7.1): a
     `/pos` write, a positioned insert and a `z` move convert a slide that is not a canvas yet in
     the same write (gslides-parity SPEC-2 1.6), a move carries its connectors (2.4.7) and a
     removal detaches them; on a freeform slide they write what the round one handlers wrote */
  on<SlideUpdateInput>('slide.update', (input) =>
    slideUpdate(storeDeps('slide.update'), context, input),
  );
  on<{ slideId: string; baseRevision: number; slide: Slide }>('slide.replace', async (input) => {
    checkBase(input.baseRevision);
    requireSlide(input.slideId);
    const committed = await commit(
      [{ op: 'slide.replace', slideId: input.slideId, slide: input.slide }],
      'slide.replace',
    );
    return slideResult(committed, input.slideId);
  });
  on<BlockSetInput>('block.set', (input) => blockSet(storeDeps('block.set'), context, input));
  on<BlockInsertInput>('block.insert', (input) =>
    blockInsert(storeDeps('block.insert'), context, input),
  );
  on<BlockRemoveInput>('block.remove', (input) =>
    blockRemove(storeDeps('block.remove'), context, input),
  );
  on<BlockMoveInput>('block.move', (input) => blockMove(storeDeps('block.move'), context, input));
  /* The arrange actions (docs/freeform.md; gslides-parity SPEC-2 1.6, 0.80): the store actions'
     arithmetic is the schema's, so an arrange from the stage, a menu row or an agent writes the
     same block.set /pos mutations, one commit each; a slide that is not a canvas yet converts in
     the same write once the editor's measurer is bound (storeDeps above), and block.align with one
     block reads the sheet as its reference */
  on<BlockAlignInput>('block.align', (input) =>
    blockAlign(storeDeps('block.align'), context, input),
  );
  on<BlockDistributeInput>('block.distribute', (input) =>
    blockDistribute(storeDeps('block.distribute'), context, input),
  );
  on<BlockOrderInput>('block.order', (input) =>
    blockOrder(storeDeps('block.order'), context, input),
  );
  /* slide.setLayout: the store action, so a switch to freeform is the measured conversion on
     this transport too (gslides-parity SPEC-2 1.6, 0.73) and back to the recorded grammar layout
     type is lossless through fromCanvas (docs/freeform.md section 4) */
  on<SlideSetLayoutInput>('slide.setLayout', (input) =>
    slideSetLayout(storeDeps('slide.setLayout'), context, input),
  );
  on<{ sections: Section[]; baseRevision: number }>('section.set', async (input) => {
    checkBase(input.baseRevision);
    const committed = await commit(
      [{ op: 'section.set', sections: input.sections }],
      'section.set',
    );
    return { sections: snapshot.document.deck.sections, revision: committed.revision };
  });
  on<{ slideId: string; minutes?: number; force?: boolean; release?: boolean }>(
    'slide.lease',
    async (input) => {
      requireSlide(input.slideId);
      const lease = await leaseSlide({
        deckId,
        slideId: input.slideId,
        author,
        ...(input.minutes !== undefined ? { minutes: input.minutes } : {}),
        ...(input.force !== undefined ? { force: input.force } : {}),
        ...(input.release !== undefined ? { release: input.release } : {}),
      });
      const leases = snapshot.leases.filter(
        (row) => !(row.slideId === lease.slideId && sameAuthor(row.holder, lease.holder)),
      );
      publish({ leases: input.release === true ? leases : [...leases, lease] });
      return lease;
    },
  );
  /*
   * Round three (gslides-parity SPEC-3 3.10, 4.11, 12): the presence and sync reads answer from
   * the room client in the page; follow, unfollow and the pointer act on this tab; `comment.link`
   * builds its URLs here; every other new action needs the store or the identity records and runs
   * on the server through runDeckAction (SERVER_SIDE_WINDOW_ACTIONS_GS3).
   */
  const participants = (): { self: PresenceParticipant | null; others: PresenceParticipant[] } => {
    const now = new Date().toISOString();
    const own = room?.clientId() ?? null;
    const rows = latest().roster.map((entry) => participantOf(entry, now));
    return {
      self: rows.find((row) => row.clientId === own) ?? null,
      others: rows.filter((row) => row.clientId !== own),
    };
  };
  const participantOut = (row: PresenceParticipant) => ({
    clientId: row.clientId,
    principalId: row.principalId,
    kind: row.kind === 'agent' ? 'agent' : 'human',
    label: row.label,
    trust: row.trust,
    mark: row.mark ?? {},
    ...(row.role !== undefined && row.role !== 'link' ? { role: row.role } : {}),
    ...(row.slideId !== undefined ? { slideId: row.slideId } : {}),
    ...(row.selection !== undefined
      ? {
          selection: {
            blockIds: [...row.selection.blockIds],
            ...(row.selection.caret !== undefined
              ? {
                  caret: {
                    blockId: row.selection.caret.blockId,
                    path: row.selection.caret.path,
                    range: [row.selection.caret.offset, row.selection.caret.offset] as [
                      number,
                      number,
                    ],
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(row.pointer !== undefined && row.pointer !== null ? { pointer: row.pointer } : {}),
    ...(row.following !== undefined && row.following !== null ? { following: row.following } : {}),
    presenting: row.presenting ?? false,
    idle: row.idle ?? false,
    lastSeenAt: row.lastSeenAt,
  });
  on<Record<string, never>>('presence.list', () => {
    const { self, others } = participants();
    const own = self ?? {
      // the tab's client id once the stream's hello bound it; `unbound` before (the room client's own word)
      clientId: room?.clientId() ?? 'unbound',
      principalId: identity?.principalId ?? author.name,
      label: identity?.label ?? author.name,
      trust: identity?.trust ?? 'guest',
      kind: identity?.kind ?? 'anonymous',
      presenting: false,
      idle: false,
      lastSeenAt: new Date().toISOString(),
      role: latest().access.role ?? 'editor',
    };
    return {
      deckId,
      cap: 20,
      pointersVisible: latest().pointersVisible,
      self: participantOut(own),
      others: others.map(participantOut),
    };
  });
  const canFollow = (): boolean => latest().access.capabilities.includes('follow');
  on<{ clientId: string }>('presence.follow', (input) => {
    if (!canFollow()) {
      throw new TypeError(
        'Follow is for signed in editors and owners; use Go to slide to jump to where they are',
      );
    }
    const target = latest().roster.find((row) => row.clientId === input.clientId);
    if (target === undefined)
      throw new RangeError(`No collaborator with client id ${input.clientId}`);
    controller.followClient(input.clientId);
    return {
      following: input.clientId,
      ...(target.slideId !== undefined ? { slideId: target.slideId } : {}),
    };
  });
  on<Record<string, never>>('presence.unfollow', () => {
    controller.unfollow();
    return { following: null };
  });
  on<{ on: boolean }>('presence.pointer', (input) => {
    controller.setPointerOn(input.on);
    return { on: input.on };
  });
  on<Record<string, never>>('sync.status', () => {
    const status = room?.status();
    return {
      seq: status?.seq ?? init.payload.room?.seq ?? 0,
      revision: reportedRevision(),
      pending: status?.pending ?? latest().pending,
      retained: status?.retained ?? 0,
      tier: status?.tier ?? init.payload.room?.tier ?? 'memory',
      transport: status === undefined ? 'poll' : 'sse',
      connected: status?.connected ?? false,
    };
  });
  on<{ threadId: string }>('comment.link', (input) => {
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    return {
      url: `${origin}/edit/${encodeURIComponent(deckId)}?comment=${encodeURIComponent(input.threadId)}`,
      viewUrl: `${origin}/deck/${encodeURIComponent(deckId)}?comment=${encodeURIComponent(input.threadId)}`,
    };
  });
  for (const id of SERVER_SIDE_WINDOW_ACTIONS_GS3) {
    if (id === 'presence.list' || id === 'sync.status' || !isActionId(id)) continue;
    if (id.startsWith('comment.') || id.startsWith('notification.')) {
      // a comment or inbox write of this tab re-reads the sidecar and the inbox once the server
      // answered, so the window transport shows its own comment without waiting for the stream
      // (the blob tier has no stream event for it on another instance). The reads never do:
      // refreshComments and refreshInbox run through these same handlers (comment.list,
      // notification.list, notification.settings with an empty input), and a refresh that
      // scheduled the next refresh ran the pair thirty times a second on every open editor and
      // spent the deck's writes per minute quota on the settings read, so every write of the tab
      // then answered "Too many changes at once" (the fix round, measured on the two browser walk
      // and the round two suites)
      const readsOnly = (input: unknown): boolean =>
        !ACTIONS[id].mutates ||
        (id === 'notification.settings' &&
          (input === undefined ||
            input === null ||
            (typeof input === 'object' && Object.keys(input as object).length === 0)));
      on<unknown>(id, async (input) => {
        const output = await runDeckAction({ deckId, action: id, input, author });
        if (!readsOnly(input)) {
          scheduleCommentsRefresh();
          scheduleInboxRefresh();
        }
        return output;
      });
      continue;
    }
    serverSide(id as ServerSideWindowAction);
  }
  /* Forget this browser (SPEC-3 7.4; VERIFICATION-3 finding 12): the server mints the new
     anonymous principal and its cookie (the response's Set-Cookie replaces the old one), then
     this page clears the localStorage and IndexedDB mirrors together and reloads as the new
     visitor, so the own chip, the page's principal and the cookie mirror change as one; the old
     edits keep the old label and nothing links the two. The menu row asks first (the
     forgetBrowser dialog); the window API acts at once, the agent having asked. */
  on<Record<string, never>>('account.forget', async () => {
    const output = (await runDeckAction({
      deckId,
      action: 'account.forget',
      input: {},
      author,
    })) as {
      principalId: string;
    };
    await clearPendingMirror().catch(() => undefined);
    setTimeout(() => window.location.reload(), 50);
    return output;
  });
  on<{ note: string }>('version.save', (input) => saveVersionNamed(input.note));
  on<Record<string, never>>('version.list', () => refreshVersions());
  on<{ n: number; baseRevision: number }>('version.restore', async (input) => {
    checkBase(input.baseRevision);
    return restoreVersion(input.n);
  });
  on<{
    slideIds: 'all' | string[];
    layers?: 'static' | 'rendered' | 'both';
    rule?: Finding['rule'];
  }>('lint.run', (input) =>
    lintSlides({
      deckId,
      slideIds: input.slideIds,
      ...(input.layers !== undefined ? { layers: input.layers } : {}),
      ...(input.rule !== undefined ? { rule: input.rule } : {}),
    }),
  );
  on<{
    slideIds: 'all' | string[];
    rule?: Finding['rule'];
    dryRun?: boolean;
    baseRevision: number;
  }>('fix.run', async (input) => {
    checkBase(input.baseRevision);
    const ids = input.slideIds === 'all' ? slideOrder(snapshot.document) : input.slideIds;
    for (const id of ids) requireSlide(id);
    const candidates = allFindings().filter(
      (finding) =>
        ids.includes(finding.slideId) &&
        (input.rule === undefined || finding.rule === input.rule) &&
        finding.fix !== undefined &&
        finding.fix.length > 0,
    );
    let document = snapshot.document;
    const applied: Finding[] = [];
    const mutations: Mutation[] = [];
    for (const finding of candidates) {
      try {
        document = applyMutations(document, finding.fix ?? []).document;
        applied.push(finding);
        mutations.push(...(finding.fix ?? []));
      } catch {
        // a fix that no longer applies on top of the earlier ones is skipped, as the CLI does
      }
    }
    if (input.dryRun === true || mutations.length === 0) {
      const remaining = lintStatic(document, { ...lintLists(), slideIds: ids });
      return { applied, remaining, revision: snapshot.document.deck.revision };
    }
    const committed = await commit(mutations, 'fix');
    const remaining = allFindings().filter((finding) => ids.includes(finding.slideId));
    return { applied, remaining, revision: committed.revision };
  });
  on<{ slideIds: 'all' | string[]; themes?: Theme[]; scale?: 1 | 2 }>('render.slide', (input) =>
    renderSlideImages({
      deckId,
      slideIds: input.slideIds,
      ...(input.themes !== undefined ? { themes: input.themes } : {}),
      ...(input.scale !== undefined ? { scale: input.scale } : {}),
    }),
  );
  on<{ slideId: string }>('view.goto', (input) => {
    requireSlide(input.slideId);
    if (shell?.mode === 'grid') shell.setMode('slide');
    shell?.select(input.slideId);
    return viewState();
  });
  on<{ mode: ShellMode }>('view.mode', (input) => {
    shell?.setMode(input.mode);
    return viewState();
  });
  on<{ theme: Theme }>('view.theme', (input) => {
    applyTheme(input.theme);
    return viewState();
  });
  on<{ on: boolean }>('view.present', (input) => {
    shell?.setPresent(input.on);
    return viewState();
  });
  on<{ zoom: number | 'fit'; center?: { x: number; y: number } }>('view.zoom', (input) => {
    // the schema clamps the factor to 0.25 to 16, Google's 25 to 1600 percent (gslides-parity
    // SPEC-2 0.101); `center` is the sheet point the stage keeps under its centre (0.81), kept on
    // the snapshot for the stage's zoom (B4), which reports the scroll in the view state
    if (input.zoom !== 'fit' && (input.zoom < 0.25 || input.zoom > 16))
      throw new TypeError(
        `view.zoom: zoom must be between 0.25 and 16 or 'fit'; got ${input.zoom}`,
      );
    publish({
      zoom: input.zoom,
      zoomCenter: input.center ?? null,
    });
    return viewState();
  });

  on<SlideNewInput>('slide.new', async (input) => {
    const result = await slideNew(storeDeps('slide.new'), context, input);
    // Google selects the new slide (R01 Slide > New slide); a grid stays a grid
    selectSoon(result.slide.id);
    return result;
  });
  on<SlideDuplicateInput>('slide.duplicate', async (input) => {
    const result = await slideDuplicate(storeDeps('slide.duplicate'), context, input);
    const last = result.slides[result.slides.length - 1];
    if (last !== undefined) selectSoon(last.id);
    return result;
  });
  on<SlideSkipInput>('slide.skip', (input) => slideSkip(storeDeps('slide.skip'), context, input));
  on<SlideApplyLayoutInput>('slide.applyLayout', (input) =>
    slideApplyLayout(storeDeps('slide.applyLayout'), context, input),
  );
  on<BlockDuplicateInput>('block.duplicate', (input) =>
    blockDuplicate(storeDeps('block.duplicate'), context, input),
  );
  on<TextReplaceAllInput>('text.replaceAll', (input) =>
    textReplaceAll(storeDeps('text.replaceAll'), context, input),
  );
  on<ExportTextInput>('export.text', (input) => deckText(snapshot.document, input));
  /*
   * The thirty six actions of the Google Slides parity round two (gslides-parity SPEC-2 section 3)
   * on the window transport, each the store action the CLI, MCP and HTTP transports run, over the
   * editor's store so the reducer applies the write now, the history takes one entry and the
   * server confirms it in order. slide.toCanvas and the canvas writes measure through
   * storeDeps.measureCanvas (bound at merge 2, see above); block.autofit with `apply` through
   * storeDeps.measureFit; diagram.insert through storeDeps.diagrams. None of them runs on the
   * server (server/agent-actions.ts SERVER_SIDE_WINDOW_ACTIONS): the editor measures itself (1.3).
   */
  on<SlideToCanvasInput>('slide.toCanvas', (input) =>
    slideToCanvas(storeDeps('slide.toCanvas'), context, input),
  );
  on<DeckGuidesInput>('deck.guides', (input) =>
    deckGuides(storeDeps('deck.guides'), context, input),
  );
  on<SlideSetBackgroundInput>('slide.setBackground', (input) =>
    slideSetBackground(storeDeps('slide.setBackground'), context, input),
  );
  on<DeckSetBackgroundInput>('deck.setBackground', (input) =>
    deckSetBackground(storeDeps('deck.setBackground'), context, input),
  );
  on<BlockGroupInput>('block.group', (input) =>
    blockGroup(storeDeps('block.group'), context, input),
  );
  on<BlockUngroupInput>('block.ungroup', (input) =>
    blockUngroup(storeDeps('block.ungroup'), context, input),
  );
  on<BlockRegroupInput>('block.regroup', (input) =>
    blockRegroup(storeDeps('block.regroup'), context, input),
  );
  on<BlockRotateInput>('block.rotate', (input) =>
    blockRotate(storeDeps('block.rotate'), context, input),
  );
  on<BlockFlipInput>('block.flip', (input) => blockFlip(storeDeps('block.flip'), context, input));
  on<BlockCropInput>('block.crop', (input) => blockCrop(storeDeps('block.crop'), context, input));
  /* picture.dither writes the picture's `dither` field in the page as block.set does, converting
     the slide to a canvas by block.crop's rule (gslides-parity SPEC-3 10.5; the integrator at
     merge 2 for b5.md request 6); the menu row format.image.dither toggles through it */
  on<PictureDitherInput>('picture.dither', (input) =>
    pictureDither(storeDeps('picture.dither'), context, input),
  );
  on<BlockMaskInput>('block.mask', (input) => blockMask(storeDeps('block.mask'), context, input));
  on<BlockResetImageInput>('block.resetImage', (input) =>
    blockResetImage(storeDeps('block.resetImage'), context, input),
  );
  on<BlockAdjustInput>('block.adjust', (input) =>
    blockAdjust(storeDeps('block.adjust'), context, input),
  );
  on<BlockSetAltInput>('block.setAlt', (input) =>
    blockSetAlt(storeDeps('block.setAlt'), context, input),
  );
  on<BlockShadowInput>('block.shadow', (input) =>
    blockShadow(storeDeps('block.shadow'), context, input),
  );
  on<BlockAutofitInput>('block.autofit', (input) =>
    blockAutofit(storeDeps('block.autofit'), context, input),
  );
  on<TextStyleInput>('text.style', (input) => textStyle(storeDeps('text.style'), context, input));
  on<TextListInput>('text.list', (input) => textList(storeDeps('text.list'), context, input));
  on<TextSpacingInput>('text.spacing', (input) =>
    textSpacing(storeDeps('text.spacing'), context, input),
  );
  on<TextColumnsInput>('text.columns', (input) =>
    textColumns(storeDeps('text.columns'), context, input),
  );
  on<TextIndentInput>('text.indent', (input) =>
    textIndent(storeDeps('text.indent'), context, input),
  );
  on<TextCaseInput>('text.case', (input) => textCase(storeDeps('text.case'), context, input));
  on<TextInsertInput>('text.insert', (input) =>
    textInsert(storeDeps('text.insert'), context, input),
  );
  on<ChartSetDataInput>('chart.setData', (input) =>
    chartSetData(storeDeps('chart.setData'), context, input),
  );
  on<ChartSetKindInput>('chart.setKind', (input) =>
    chartSetKind(storeDeps('chart.setKind'), context, input),
  );
  on<TableMergeInput>('table.merge', (input) =>
    tableMerge(storeDeps('table.merge'), context, input),
  );
  on<TableUnmergeInput>('table.unmerge', (input) =>
    tableUnmerge(storeDeps('table.unmerge'), context, input),
  );
  on<TableInsertRowsInput>('table.insertRows', (input) =>
    tableInsertRows(storeDeps('table.insertRows'), context, input),
  );
  on<TableInsertColumnsInput>('table.insertColumns', (input) =>
    tableInsertColumns(storeDeps('table.insertColumns'), context, input),
  );
  on<TableDeleteInput>('table.deleteRows', (input) =>
    tableDeleteRows(storeDeps('table.deleteRows'), context, input),
  );
  on<TableDeleteInput>('table.deleteColumns', (input) =>
    tableDeleteColumns(storeDeps('table.deleteColumns'), context, input),
  );
  on<TableDistributeInput>('table.distribute', (input) =>
    tableDistribute(storeDeps('table.distribute'), context, input),
  );
  on<TableCellStyleInput>('table.cellStyle', (input) =>
    tableCellStyle(storeDeps('table.cellStyle'), context, input),
  );
  on<ShapeSetInput>('shape.set', (input) => shapeSet(storeDeps('shape.set'), context, input));
  on<LineSetInput>('line.set', (input) => lineSet(storeDeps('line.set'), context, input));
  on<DiagramInsertInput>('diagram.insert', (input) =>
    diagramInsert(storeDeps('diagram.insert'), context, input),
  );
  /* slide.import reads another deck, so it runs on the server (server/actions.ts) and its write
     comes back over the watch channel; the handler waits for that revision so a caller can address
     the imported slides at once, then selects the first of them */
  on<{
    sourceDeckId: string;
    slideIds: string[];
    after?: string;
    sectionId?: string;
    baseRevision: number;
  }>('slide.import', async (input) => {
    const output = (await runDeckAction({
      deckId,
      action: 'slide.import',
      input,
      author,
    })) as { slides: Slide[]; revision: number };
    if (!(await awaitRevision(output.revision, 5000))) await reload();
    const first = output.slides[0];
    if (first !== undefined && latest().document.slides[first.id] !== undefined)
      shell?.select(first.id);
    return output;
  });

  const invoke = (action: string, input?: unknown): Promise<unknown> =>
    dispatcher.dispatch(action, input ?? {}, context);

  /**
   * describe().state for both owners (SPEC-3 3.10): the document's facts and the room's. The
   * access record and the caller's standing come from the snapshot, which every `access` event
   * of the stream refreshes, so a share write based on `state.access.revision` never meets a
   * stale record (comments.spec.ts, share.spec.ts).
   */
  const stateOf = (): Record<string, unknown> => {
    const record = snapshot.access.record;
    return {
      deckId,
      // the revision a caller reads is the one a base check enforces (SPEC-3 3.10; VERIFICATION-3
      // finding 33): `reportedRevision()` folds the room client's acknowledged revision in, so a
      // driver that reads `describe().state.revision` and writes with it as `baseRevision` meets
      // the same number `checkBase` compares against, and its second write in the window before a
      // checkpoint moves the document is not refused as stale. It matches `sync.revision` below;
      // the document's own revision (which a checkpoint moves) stays on `serverRevision`.
      revision: reportedRevision(),
      serverRevision: snapshot.serverRevision,
      pending: snapshot.pending,
      slideId: snapshot.activeSlide,
      blockId: snapshot.selection?.blockId ?? null,
      mode: shell?.mode ?? 'slide',
      theme: readTheme(),
      zoom: snapshot.zoom,
      author: authorLabel(author),
      // round three (SPEC-3 3.10): the room's facts beside the document's
      sync: {
        seq: snapshot.sync?.seq ?? init.payload.room?.seq ?? 0,
        revision: reportedRevision(),
        pending: snapshot.sync?.pending ?? snapshot.pending,
        retained: snapshot.sync?.retained ?? 0,
        tier: snapshot.sync?.tier ?? init.payload.room?.tier ?? 'memory',
        transport: snapshot.sync === null ? 'poll' : 'sse',
        connected: snapshot.sync?.connected ?? false,
      },
      // the room as presence.list answers it (SPEC-3 3.10; presence.spec.ts reads self.clientId
      // and others[]) beside the count the round two readers had
      presence: (() => {
        const { self, others } = participants();
        return {
          clientId: room?.clientId() ?? null,
          ...(self === null ? {} : { self: participantOut(self) }),
          others: others.map(participantOut),
          count: others.length,
          following: snapshot.following,
          pointersVisible: snapshot.pointersVisible,
        };
      })(),
      // the record as the Share dialog reads it (SPEC-3 3.10; share.spec.ts reads generalAccess,
      // revision, requests and claimable) with the caller's standing on it; the link and publish
      // hashes stay out
      access: {
        ...(record === null
          ? {}
          : {
              deckId: record.deckId,
              revision: record.revision,
              owner: record.owner,
              pendingOwner: record.pendingOwner,
              generalAccess: record.generalAccess,
              links: record.links.map(({ hash: _hash, ...link }) => link),
              publish:
                record.publish === null
                  ? null
                  : (({ hash: _hash, ...rest }) => rest)(record.publish),
              grants: record.grants,
              requests: record.requests,
              settings: record.settings,
              claimable: record.owner === null && init.payload.identity?.kind === 'account',
            }),
        role: snapshot.access.role,
        via: snapshot.access.via,
        capabilities: [...snapshot.access.capabilities],
        mode: record?.generalAccess.mode ?? 'open',
      },
      account: {
        principalId: identity?.principalId ?? null,
        label: identity?.label ?? author.name,
        ...(identity?.name !== undefined ? { name: identity.name } : {}),
        trust: identity?.trust ?? 'guest',
        signedIn: identity?.kind === 'account',
        signInAvailable: init.payload.auth?.signIn ?? false,
      },
      // the sidecar as the chrome reads it (SPEC-3 3.10; comments.spec.ts reads threads[], revision)
      comments: {
        threads: threadViews(),
        revision: snapshot.comments.revision,
        display: snapshot.comments.display,
        openThreadId: snapshot.comments.openThreadId,
      },
      inbox: {
        unread: snapshot.inbox.unread,
        items: inboxViews(),
      },
    };
  };

  const editorAdapter = (): StudioAdapter => ({
    owner: 'editor',
    actions: windowActionIds(),
    getSource: readSource,
    applySource,
    invoke,
    state: stateOf,
  });

  /**
   * The actions the viewer owner answers (SPEC-3 3.10, 6.6; VERIFICATION-3 finding 3): every read
   * of the window transport for every role, the comment writes for a role with `comment`, the
   * inbox, account and presence writes for everyone, and Request access. A document write stays
   * the editor owner's: an editor in Viewing or Commenting mode is told to switch to Editing, a
   * visitor's write is refused by the server anyway. The round one list (view.*, render.*) is a
   * subset of this one.
   */
  const visitorActionIds = (): string[] => {
    const draft = init.payload.draft === true;
    return windowActionIds().filter((id) => {
      if (!isActionId(id)) return false;
      const spec = ACTIONS[id];
      if (!spec.mutates) return true;
      if (id === 'share.requestAccess') return true;
      if (id.startsWith('comment.')) return draft || hasCapability('comment');
      return (
        id.startsWith('notification.') || id.startsWith('account.') || id.startsWith('presence.')
      );
    });
  };
  const viewerAdapter = (): StudioAdapter => ({
    owner: 'viewer',
    actions: visitorActionIds(),
    invoke: (action, input) => {
      if (!visitorActionIds().includes(action)) {
        // in words (SPEC-3 6.8; VERIFICATION-3 finding 44): a person without the write capability
        // is told what they can do and what to ask for, never a role they lack or an internal
        // noun; an editor in Viewing or Commenting mode is told where the mode switch is
        throw new RangeError(
          hasCapability('write')
            ? `"${action}" needs Editing mode; switch View > Mode to Editing for it.`
            : `${REFUSALS.viewOnly}. ${REFUSALS.requestEditAccess} to change it.`,
        );
      }
      return invoke(action, input);
    },
    state: stateOf,
  });

  const controller: EditorController = {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    start() {
      if (alive) return;
      alive = true;
      setDocument(snapshot.document, 'all');
      // the room (SPEC-3 3.6): a stored deck opens its stream now; a draft opens it on its first write
      if (init.payload.draft !== true) {
        attachRoom(
          snapshot.document,
          init.payload.room?.seq ?? 0,
          init.payload.room?.tier ?? 'memory',
        );
      }
    },
    stop() {
      alive = false;
      const client = room;
      room = null;
      if (client !== null) void client.stop();
    },
    attachShell(next) {
      shell = next;
    },
    setActiveSlide(slideId) {
      if (slideId === snapshot.activeSlide) return;
      const selection =
        snapshot.selection && snapshot.selection.slideId !== slideId ? null : snapshot.selection;
      publish({ activeSlide: slideId, selection });
    },
    select(selection) {
      publish({ selection });
    },
    commit,
    undo,
    redo,
    undoTo,
    dismissReject,
    reload,
    followClient(clientId) {
      const target = latest().roster.find((row) => row.clientId === clientId);
      publish({ following: clientId });
      room?.setPresence({ follow: clientId });
      if (target?.slideId !== undefined && shell?.active !== target.slideId)
        shell?.select(target.slideId);
    },
    unfollow() {
      publish({ following: null });
      room?.setPresence({ follow: undefined });
    },
    goToClient(clientId) {
      const target = latest().roster.find((row) => row.clientId === clientId);
      if (target?.slideId !== undefined) shell?.select(target.slideId);
    },
    setPointerOn(on) {
      room?.setPresence({ pointerOn: on });
      // the toolbar's Show my pointer reads `presence.pointerMine`; without the mirror the toggle
      // never pressed (presence.spec.ts row 2, the fix round)
      publish({ pointerOn: on });
    },
    setPointersVisible(on) {
      if (on === snapshot.pointersVisible) return;
      publish({ pointersVisible: on });
    },
    reportPresence(state) {
      room?.setPresence(state);
    },
    threadViews,
    inboxViews,
    refreshComments,
    refreshInbox,
    roomAction,
    setCommentsDisplay(display) {
      if (display === snapshot.comments.display) return;
      publish({ comments: { ...snapshot.comments, display } });
    },
    openComment(threadId) {
      if (threadId === snapshot.comments.openThreadId) return;
      publish({ comments: { ...snapshot.comments, openThreadId: threadId } });
    },
    openInboxItem(item) {
      if (item.slideId !== undefined && snapshot.document.slides[item.slideId] !== undefined) {
        if (shell?.mode === 'grid') shell.setMode('slide');
        shell?.select(item.slideId);
      }
      if (item.threadId !== undefined) {
        publish({ comments: { ...snapshot.comments, openThreadId: item.threadId } });
      }
      if (item.readAt === undefined) void roomAction('notification.markRead', { ids: [item.id] });
    },
    promptName(open) {
      publish({ namePrompt: open });
    },
    noteInlineSession(active) {
      inlineActive = active;
      if (!active && namePromptDue && !promptedName) openNamePrompt();
    },
    saveVersion: saveVersionNamed,
    restoreVersion,
    refreshVersions,
    promptVersion(open) {
      publish({ versionPrompt: open });
    },
    readSource,
    validateSource,
    applySource,
    invoke,
    editorAdapter,
    viewerAdapter,
    clearError() {
      publish({ error: null });
    },
    findingsFor,
    allFindings,
    setEditing(enabled) {
      editingRef.current = enabled;
    },
    setExportSync(enabled, batchSize) {
      exportSync = enabled;
      exportBatchSize = batchSize ?? 0;
    },
    setView(view) {
      if (view.mode === snapshot.view.mode && view.present === snapshot.view.present) return;
      publish({ view });
    },
    say,
    assertSource,
    async undoAfter(id) {
      const entries = history.entries();
      const at = entries.findIndex((entry) => entry.id === id);
      const next = entries[at + 1];
      if (at < 0 || !next) return;
      await undoTo(next.id);
    },
    warmThumbs(theme) {
      // round four (gslides-parity SPEC-4 0.30, 3.2): the filmstrip is clone first and asks for
      // no capture, so the warm of every slide on open is gone; the grid's first tiles are warmed
      // once per theme on the first entry into grid mode, which fills the shared cache the home
      // card and the viewer's grid read (one render job, Chromium launched once)
      if (latest().view.mode !== 'grid') return;
      if (init.payload.draft === true && latest().serverRevision === 0) return;
      if (warmed.has(theme)) return;
      warmed.add(theme);
      const slideIds = slideOrder(latest().document).slice(0, GRID_WARM_TILES);
      warmThumbnails({ data: { deckId, theme, slideIds } }).catch((error: unknown) => {
        warmed.delete(theme);
        say(`Thumbnails: ${errorMessage(error)}`);
      });
    },
    async downloadArtifact(run, file) {
      try {
        if (file.url !== undefined) {
          // a sync export's file: the stored copy, or this instance's job file, which another
          // instance answers with 404 and the advice to run the export again
          const probe = await fetch(file.url, { method: 'HEAD' });
          if (probe.status === 404) {
            const body = (await fetch(file.url).then((r) => r.json())) as {
              error?: { message?: string };
            };
            throw new Error(body.error?.message ?? 'the file is not on this instance');
          }
          triggerDownload(downloadUrlOf(file.url));
          return;
        }
        const { url } = await signDownload(
          run.kind === 'export'
            ? { kind: 'job', jobId: run.jobId, name: file.name }
            : { kind: 'build', deckId, name: file.name },
        );
        triggerDownload(url);
      } catch (error) {
        say(`Download: ${errorMessage(error)}`);
      }
    },
    clearArtifact() {
      publish({ artifact: { progress: snapshot.artifact.progress, run: null } });
    },
  };
  return controller;
}

/** How many of the grid's tiles the first entry into grid mode warms (the first screen at 300 px). */
const GRID_WARM_TILES = 16;

/** FNV-1a over a string, as eight hex digits. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * A stamp of the slide's content (FNV-1a over its canonical JSON): the render memo's key half,
 * and the same stamp the thumbnail route computes for a slide (server/thumbs.ts slideStamp), so
 * the cache name a viewer asks for and the one the server stores agree (M3 item 5; SPEC-4 0.31).
 */
export function slideStamp(slide: Slide): string {
  return fnv1a(canonicalJson(slide));
}

/**
 * The deck level inputs renderSlide reads for every slide (packages/render/src/slide.ts: the
 * assets and their sizes, `defaults.background`), the theme and the asset base, as one stamp.
 * The sections and the title are not inputs: the editor renders without a counter, and the
 * frame's word is the GT mark, not the title.
 */
function renderDeckStamp(deck: DeckDocument['deck'], theme: Theme, assetBase: string): string {
  return fnv1a(
    `${theme}|${assetBase}|${canonicalJson({ assets: deck.assets, defaults: deck.defaults ?? null })}`,
  );
}

/**
 * The rendered HTML per slide stamp and deck stamp across every controller of the page (PP 5
 * "Memoized renderSlide per block hash"): 256 entries, oldest evicted; an unchanged slide costs
 * a map read where a deck level write re-rendered 85 slides before (R04 measured 4 to 21 ms of
 * editor work per action; a full re-render of the GT deck is tens of milliseconds more).
 */
const RENDER_MEMO = new Map<string, string>();
const RENDER_MEMO_LIMIT = 256;

/**
 * The shell's deck from the editor's snapshot. `draft` no longer changes the output (the editor's
 * cards carry no capture URL since round four, SPEC-4 0.30); the parameter stays for the call site
 * in EditorRoot.tsx until its owner drops it.
 */
export function toViewerDeck(snap: EditorSnapshot, _draft: boolean): ViewerDeck {
  const { deck, slides } = snap.document;
  const assetBase = ASSET_BASE(snap.deckId);
  const out: ViewerSlide[] = [];
  let n = 0;
  for (const section of deck.sections) {
    for (const slideId of section.slideIds) {
      const slide = slides[slideId];
      if (!slide) continue;
      n += 1;
      const asset = 'picture' in slide ? deck.assets[slide.picture.asset] : undefined;
      const picture =
        isPictureKind(slide.kind) && asset
          ? 'neutral' in asset.twins
            ? { light: assetBase + asset.twins.neutral, dark: assetBase + asset.twins.neutral }
            : { light: assetBase + asset.twins.light, dark: assetBase + asset.twins.dark }
          : undefined;
      out.push({
        id: slideId,
        n,
        title: slideTitle(slide, n),
        kind: slide.kind,
        sectionId: section.id,
        html: snap.html.get(slideId) ?? '',
        // no `shot` since round four (gslides-parity SPEC-4 0.30, 3.2): the editor's filmstrip
        // and grid are clone first and capture never, so no card asks the render route for a
        // picture; the viewer's grid, the home cards and the presenter keep their captures
        ...(picture ? { picture } : {}),
        ...(slide.notes !== undefined ? { notes: slide.notes } : {}),
        // the parity facts (gslides-parity SPEC 7.2.1, 7.2.2): the show and the grid read skip, the grid the layout
        ...(slide.skip === true ? { skip: true } : {}),
        ...(slide.template !== undefined ? { template: slide.template } : {}),
      });
    }
  }
  return {
    id: deck.id,
    title: deck.title,
    revision: deck.revision,
    sections: deck.sections.map((section) => ({
      id: section.id,
      name: section.name,
      slideIds: section.slideIds.filter((id) => slides[id]),
    })),
    slides: out,
  };
}
