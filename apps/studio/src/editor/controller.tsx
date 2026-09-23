import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import { createDispatcher } from '@turboslide/agent/dispatch';
import type { StudioAdapter } from '@turboslide/agent/window/adapter';
import { createEditHistory } from '@turboslide/agent/window/history';
import type { HistoryEntry, HistoryStep } from '@turboslide/agent/window/history';
import { planAcceptedCard, withAssistClear } from './assist-accept';
import { autoTitleMutations } from './auto-title';
import type { AutoTitleMemory } from './auto-title';
import { awaitAcknowledged } from './ack-wait';
import { slideToConvertFor } from './convert-first';
import { createExportModeGate } from './export-mode';
import { refusalSentence } from './refusal';
import { resyncBroughtUnseen } from './resync-history';
import { placeInsert, wantsPlacement } from './place-insert';
import { SELECT_OBJECTS_EVENT, keepsPlace, originOf } from './select-after-write';
import type { SelectObjectsDetail, StudioActionContext } from './select-after-write';
import { typingKeyOf } from './typing-key';
import { stepBursts } from './undo-bursts';
import type { Burst } from './undo-bursts';
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
  deckTailor,
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
  withCanvas,
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
  DeckTailorInput,
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
import { brandGet, brandResetPlan, brandSetPlan, fontList } from '@turboslide/cli/brand-actions';
import type { BrandResetInput, BrandSetInput } from '@turboslide/cli/brand-actions';
import type { ExportMenuInput, ExportProgress } from '@turboslide/chrome/ExportMenu';
import { downloadFromPage } from '@turboslide/chrome/download';
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
import { createRoomClient, splitSseBlocks } from '@turboslide/realtime/client/room-client';
import type {
  OpsResponse,
  PersistedOffer,
  Rejected,
  ResyncAnswer,
  ResyncOrigin,
  RoomClient,
  RoomTransport,
  StreamFailure,
  SyncStatus,
} from '@turboslide/realtime/client/room-client';
import { parseSseBlock, roomEventOf } from '@turboslide/realtime/protocol';
import type { OpsPost, PresencePost } from '@turboslide/realtime/protocol';
import { lintStatic } from '@turboslide/lint/lint-static';
import { slideCounter } from '@turboslide/render/deck';
import { renderSlide } from '@turboslide/render/slide';
import { bandAssetResolver, frameBandOf } from '@turboslide/render/stage';
import type { AccessRecord, Capability, Role, Via } from '@turboslide/schema/access';
import { ACTIONS, isActionId } from '@turboslide/schema/actions';
import type { ActionId, AssistProposeInput, DeckTemplateId } from '@turboslide/schema/actions';
import { anchorSlideId, resolveAnchor, threadIsFor } from '@turboslide/schema/comments';
import type { Comment as ThreadComment, Thread } from '@turboslide/schema/comments';
import type { Notification } from '@turboslide/store/inbox';
import type { CanvasBoxes } from '@turboslide/schema/canvas';
import { makeDiagram } from '@turboslide/schema/diagrams';
import { canvasObjects, isCanvasSlide, slideBlocks, slideTitle } from '@turboslide/schema/deck';
import type { Asset } from '@turboslide/schema/assets';
import { blockAssetRefs } from '@turboslide/schema/catalog';
import type { Block } from '@turboslide/schema/blocks';
import type { DeckDocument, Section, Slide } from '@turboslide/schema/deck';
import { ConflictError } from '@turboslide/schema/errors';
import type { Finding } from '@turboslide/schema/findings';
import { ICON_NAMES } from '@turboslide/schema/icon-names';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author, Lease, Mutation, Version, Write } from '@turboslide/schema/mutations';
import { slideFieldOf, slideFieldPath } from '@turboslide/schema/mutations';
import { applyMutations, applyWrite } from '@turboslide/schema/reduce';
import { validateSlide } from '@turboslide/schema/validate';
import type { Issue } from '@turboslide/schema/validate';
import { authorDisplay, authorLabel, sameAuthor, touchedSlides } from '@turboslide/store/store';
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

import {
  SERVER_SIDE_WINDOW_ACTIONS_F1,
  SERVER_SIDE_WINDOW_ACTIONS_GS3,
  SERVER_SIDE_WINDOW_ACTIONS_P1,
  runDeckAction,
  runDeckActionDetailed,
} from '../server/agent-actions';
import type { RunDeckActionAnswer, ServerSideWindowAction } from '../server/agent-actions';
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
  DECK_CREATED_EVENT,
  leaseSlide,
  listVersions,
  readEditorDeck,
  saveVersion,
  writeDeck,
} from '../server/write';
import type { DeckCreatedDetail, EditorDeck, EditorIdentity } from '../server/write';
import { partitionRoster, readClientIds, rememberClientId, tabToken } from './client-ids';

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

/**
 * The browser's transport of the room (SPEC-3 3.3): a streamed fetch down, fetch up, same origin.
 *
 * The stream was an EventSource until the focus round's cycle 3 stream fix round (VERIFICATION.md
 * C3-F1): the browser reconnected it on its own, exposed neither the status nor the `retry-after`
 * of a refused open (the route's 503 `too_many_streams`), and the room client learnt only that
 * "the stream closed", so nobody read the wait and the reopen was left to the browser. The room
 * client owns the reopen now (room-client.ts `reopenStream`), so the transport opens one stream
 * per `open`, reports once how it ended, and reconnects nothing. A fetch with
 * `accept: text/event-stream` gives the status and the headers of a refusal directly and the same
 * bytes as the EventSource otherwise (the route's frames, parsed by protocol.ts `parseSseBlock`
 * over `splitSseBlocks`); its abort is the close the server sees. This was the smaller change
 * against an EventSource plus a second fetch to probe the status: one connection per open, no
 * probe that itself takes a slot, and no EventSource reconnect to suppress.
 */
function sseTransport(deckId: string, tab: string): RoomTransport {
  const base = `/api/decks/${encodeURIComponent(deckId)}`;
  return {
    open({ since, retire, onEvent, onError }) {
      // the tab's earlier ids ride every open (a reconnect too), so the instance the stream lands
      // on drops their roster rows and releases their stream slots before hello (hotfix 2 cause
      // B1; C3-F1); the tab's token rides too, so the instance releases the tab's earlier slots
      // it holds under no id the tab knows (an open aborted before its hello, another deck's
      // stream of this tab; C3S-F2)
      const retiring =
        retire === undefined || retire.length === 0
          ? ''
          : `&retire=${retire.map((id) => encodeURIComponent(id)).join(',')}`;
      const tabbed = `&tab=${encodeURIComponent(tab)}`;
      const aborter = new AbortController();
      let done = false;
      // the browser's offline event ends the stream (the seam step of the cycle 3 stream fix
      // round): an established socket can stay open and silent long after the network went (a
      // laptop that changed networks; Playwright's offline emulation keeps an open stream's bytes
      // flowing while every new request fails), so the tab takes the browser's word as the
      // stream's end and the room client reopens it on its ladder once the network is back
      const onOffline = (): void => {
        aborter.abort();
        end({ message: 'the browser went offline' });
      };
      const listening = typeof window !== 'undefined';
      if (listening) window.addEventListener('offline', onOffline);
      const end = (failure: StreamFailure): void => {
        if (listening) window.removeEventListener('offline', onOffline);
        if (done) return;
        done = true;
        onError(failure);
      };
      void (async () => {
        let response: Response;
        try {
          response = await fetch(`${base}/stream?since=${since}${retiring}${tabbed}`, {
            headers: { accept: 'text/event-stream' },
            cache: 'no-store',
            signal: aborter.signal,
          });
        } catch {
          // the network refused the connection (offline, a dropped socket): no status to read
          if (!aborter.signal.aborted) end({ message: 'the stream did not open' });
          return;
        }
        if (!response.ok || response.body === null) {
          // a refused open: the status, the body's code, the wait the route named and the
          // client id it minted (the room client posts under it while it waits for a slot)
          const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
          const retry = response.headers.get('retry-after');
          const retryAfterMs = retry === null ? NaN : Number(retry) * 1000;
          end({
            status: response.status,
            code: typeof json.error === 'string' ? json.error : 'error',
            ...(Number.isFinite(retryAfterMs) ? { retryAfterMs } : {}),
            ...(typeof json.clientId === 'string' ? { clientId: json.clientId } : {}),
            message: `The stream answered ${response.status}`,
          });
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let rest = '';
        let retryMs: number | undefined;
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            const split = splitSseBlocks(rest + decoder.decode(chunk.value, { stream: true }));
            rest = split.rest;
            for (const block of split.blocks) {
              const parsed = parseSseBlock(block);
              if (parsed === null) continue;
              if (parsed.retry !== undefined) retryMs = parsed.retry;
              const event = roomEventOf(parsed);
              if (event !== null && !done) onEvent(event);
            }
          }
        } catch {
          // the connection dropped mid stream, or this tab aborted it
        }
        if (aborter.signal.aborted) return;
        // the stream ended (its lifetime, the server, the network): the server's `retry` is the
        // wait before the next open when it sent one
        end({
          ...(retryMs === undefined ? {} : { retryAfterMs: retryMs }),
          message: 'the stream closed',
        });
      })();
      return {
        close: () => {
          done = true;
          if (listening) window.removeEventListener('offline', onOffline);
          aborter.abort();
        },
      };
    },
    async postOps(body: OpsPost): Promise<OpsResponse> {
      // a deadline on the write (the focus round, cycle 2): a POST that never answers (an
      // instance whose deck queue is held, VERIFICATION F-stall; a dev server that reloaded its
      // program under the request) left the room client's `posting` unsettled, so `flush()`
      // and every `idle()` caller after it (a version.restore, a named version, an asset
      // action) waited for good with no sentence anywhere (VERIFICATION F-versions, "restore
      // changed the deck false"). A timed out POST throws, the client marks itself offline and
      // resends with its op ids, which the room deduplicates against the stream's tail
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OPS_POST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(`${base}/ops`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
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

/**
 * A write whose `baseRevision` is not the revision the tab reports (SPEC-3 3.10; `checkBase`).
 * A ConflictError to the agent surface, which reads the revision and retries itself; a class of
 * its own so the chrome's dispatch can tell it from a conflict the room returned and rebase the
 * gesture once (hotfix 2 cause A5, `invokeRebasing`).
 */
class StaleBaseError extends ConflictError {
  constructor(baseRevision: number, current: number, document: DeckDocument) {
    super(`baseRevision ${baseRevision} is stale; the document is at revision ${current}`, {
      currentRevision: current,
      current: document,
    });
  }
}

/** The Text a typing burst names, for the 400 ms undo grouping (SPEC 7.2.15). */

/** How long the external revision banner stays once the revision has been brought in (M4 item 2). */
const EXTERNAL_BANNER_MS = 8000;
/** The floor between two snackbars of one refusal sentence (C3-F3; `sayRefusal`). */
const REFUSAL_SNACKBAR_SPACING_MS = 60_000;
/**
 * How long one ops POST may take before the room client treats it as failed and resends (the
 * focus round, cycle 2; the transport's `postOps` says what a POST that never answered did).
 * Above the room's own admission time under load (the memory tier's checkpoint at its 10 s hard
 * limit, the blob tier's one second write spacing per deck) and under the browser's own limits.
 */
const OPS_POST_TIMEOUT_MS = 30_000;

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
  /**
   * Every client id this tab was issued on this deck, the current one last (hotfix 2 cause B3;
   * editor/client-ids.ts): a roster row with any of them is this tab, never a collaborator. A
   * reload or a remount gives the tab a new id while the earlier one may still stand in a roster.
   */
  ownClientIds: readonly string[];
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

/** The shell's snackbar with one action, as EditorShellState.say offers it. */
export type EditorShellSnack = {
  say: (text: string, action?: { label: string; run: () => void }) => void;
};

export type EditorController = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => EditorSnapshot;
  start: () => void;
  stop: () => void;
  attachShell: (shell: ShellState) => void;
  /**
   * The editor shell's snackbar with one action (docs/PRODUCT.md 6.1): the outside write's Undo
   * and the accept's; ShellBridge hands it over (build/b6.md R10); without it the sentences
   * reach the plain snackbar with no action
   */
  attachEditorShell: (api: EditorShellSnack | null) => void;
  /**
   * Accept a card of the assist (6.1, 6.2): the card re based on the document as it stands,
   * written as one commit labelled "Assist: <sentence>" with the `ext.assist` marks, so Cmd+Z is
   * the step back and Change history lists it once
   */
  acceptAssist: (
    card: unknown,
  ) => Promise<{ revision: number; slideIds: string[]; sentence: string }>;
  /** re-posts this tab's presence now, so a typed display name reaches the other browsers' chips ahead of the heartbeat (b1.md R18) */
  refreshPresence: () => void;
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
  /** the editor shell's stored settings (Tools > Advanced tools among them), for describe().state.settings (docs/FOCUS.md 3.1) */
  setShellSettings: (settings: Readonly<Record<string, boolean | string>>) => void;
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

/**
 * A browser download of a URL the server signed (tokens.ts). An address of ours is fetched by
 * the page and saved from its bytes, so the download carries the page's headers and cookies, a
 * refusal (a spent token, a quota, a missing bearer) rejects with the server's sentence instead
 * of a cancelled download the page never hears of, and a redirect never navigates the tab; an
 * address on another origin (the public Blob host's stored copies) is the anchor click
 * (@turboslide/chrome/download; the return round fix round, VERIFICATION.md R1-F5).
 */
export async function triggerDownload(url: string): Promise<void> {
  await downloadFromPage(url);
}

/**
 * The cadence of the progress poll beside a sync export: twice the queued path's, because a six
 * slide PowerPoint file on a checkout is done inside a few seconds and the words should still
 * move slide by slide (the row export.download.progress-per-slide); a poll is one small read.
 */
const SYNC_PROGRESS_POLL_MS = 500;

/** A fresh sync progress id, `sync-<base36 time>-<8 hex>` (server/export-jobs.ts `SYNC_PROGRESS_JOB_PATTERN`), minted on the page. */
function newSyncProgressJobId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sync-${Date.now().toString(36)}-${hex}`;
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
  onLine?: (line: string) => void,
): Promise<Extract<ArtifactRun, { kind: 'export' }>> {
  /* the per slide progress beside the call (b7.md FR4; the row export.download.progress-per-slide):
     the page mints the progress record's id, the server writes "slide k of n" under it while the
     export runs, and a poll every EXPORT_POLL_MS reads it until the call settles; a poll that
     fails is skipped, never the export */
  const progressJobId = onLine === undefined ? undefined : newSyncProgressJobId();
  const call = syncExport({
    deckId,
    input,
    ...(progressJobId === undefined ? {} : { progressJobId }),
  });
  let settled = false;
  const poll = async (): Promise<void> => {
    if (progressJobId === undefined || onLine === undefined) return;
    await sleep(SYNC_PROGRESS_POLL_MS);
    while (!settled) {
      try {
        const answer = await pollExport({ jobId: progressJobId });
        if (settled) break;
        if (answer.line) onLine(answer.line);
      } catch {
        // a poll that fails is skipped; the export goes on
      }
      await sleep(SYNC_PROGRESS_POLL_MS);
    }
  };
  const polling = poll();
  let body: SyncExportAnswer;
  try {
    body = await call;
  } finally {
    settled = true;
  }
  await polling.catch(() => undefined);
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

/** True for the three text run ops the admission transforms and the reducer follows the title from (docs/SYNC.md 3.4). */
function isTextRunMutation(
  mutation: Mutation,
): mutation is Extract<Mutation, { op: 'text.splice' | 'text.mark' | 'text.replace' }> {
  return (
    mutation.op === 'text.splice' || mutation.op === 'text.mark' || mutation.op === 'text.replace'
  );
}

/**
 * True for a text run on a title or statement slide's field: `blockId` names the field on a
 * slide of that kind and `path` is the field's pointer (schema mutations.ts `slideFieldOf`,
 * `slideFieldPath`; docs/SYNC.md 3.4). Such a write addresses no block, so it never asks for the
 * canvas conversion a format write on the field object does (convert-first.ts).
 */
function isSlideFieldTextRun(document: DeckDocument, mutation: Mutation): boolean {
  if (!isTextRunMutation(mutation)) return false;
  const slide = document.slides[mutation.slideId];
  if (slide === undefined) return false;
  const field = slideFieldOf(slide, mutation.blockId);
  return field !== null && mutation.path === slideFieldPath(field);
}

/**
 * The origins the resync read answered (docs/SYNC.md 3.2; write.ts `readEditorDeck` with
 * `since` answers `EditorDeck.origins`, B3's half): the records above the tab's old position
 * that name their origin, each with the seq its commit made and the op ids it folded, the
 * newest RESYNC_ORIGINS_MAX of them. The payload is parsed JSON, so each row is checked before
 * the room client reads it; a payload without the field answers none and the room client
 * re-folds its pending ops as before, and the bound (a head more than REPLAY_MAX_ENTRIES above
 * the old position) is the room client's own reading on the blob tier.
 */
function resyncOriginsOf(payload: EditorDeck): Pick<ResyncAnswer, 'origins'> {
  const origins: ResyncOrigin[] = [];
  for (const row of payload.origins ?? []) {
    if (typeof row !== 'object' || row === null) continue;
    const { seq, opIds } = row as { seq?: unknown; opIds?: unknown };
    if (typeof seq !== 'number' || !Number.isInteger(seq) || !Array.isArray(opIds)) continue;
    const ids = opIds.filter((id): id is string => typeof id === 'string' && id !== '');
    if (ids.length > 0) origins.push({ seq, opIds: ids });
  }
  return origins.length === 0 ? {} : { origins };
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
  /* the bursts of a typing group with their own clocks, so each segment of an undo or redo is
     transformed past what landed since its own burst (undo-bursts.ts; s2.md S2-R3) */
  const burstsOf = new Map<number, Burst[]>();
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
  /* the editor shell's snackbar with an action (docs/PRODUCT.md 6.1), from ShellBridge */
  let editorShell: EditorShellSnack | null = null;
  /* the document before the last remote op applied, for the inverse of an outside write (6.1) */
  let beforeRemote: DeckDocument | null = null;
  /** told once with the mutations of the next write the store shim applies locally (select-after-write.ts) */
  let onLocalApply: ((mutations: readonly Mutation[]) => void) | null = null;
  /* the editor shell's stored settings, for describe().state.settings (docs/FOCUS.md 3.1) */
  let shellSettings: Readonly<Record<string, boolean | string>> = {};
  let findingsCache: { document: DeckDocument; findings: Finding[] } | null = null;
  let room: RoomClient | null = null;
  let draftChain: Promise<unknown> = Promise.resolve();
  /* the typing group (SPEC 7.2.15): consecutive bursts on one Text inside 400 ms are one Cmd Z */
  let lastTyping: { entryId: number; key: string; at: number } | null = null;
  let versionsTimer: ReturnType<typeof setTimeout> | undefined;
  const identity = init.payload.identity;
  const pendingStore = pendingStoreFor();
  /* the tab's memory of its client ids (hotfix 2 cause B1): sessionStorage is per tab and survives a reload */
  const idStorage = (): Storage | null => {
    try {
      return typeof sessionStorage === 'undefined' ? null : sessionStorage;
    } catch {
      return null;
    }
  };

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
    ownClientIds: readClientIds(idStorage(), deckId),
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
  /**
   * Selects the slide a write made (the copy, the new slide) once the write is acknowledged. With
   * `from` (the slide that was active when the write was asked for) the selection lands only while
   * the person has not moved on since: the acknowledgement is the memory tier's two second
   * checkpoint idle, and a late `select` overrode the two cards the person had picked in between
   * (C2-F21 `slides.duplicate.two-selected-menu`; select-after-write.ts).
   */
  /**
   * Arms the selection of the last slide a write inserts, at the local apply (the store shim's
   * write tells `onLocalApply`), so the copy of Duplicate slide and the slide of New slide are
   * selected the moment they exist, as Google does, and never two seconds later over a card the
   * person picked since (C2-F21 `slides.duplicate.two-selected-menu`). `settle` runs after the
   * acknowledgement with the id the action answered: the fallback when the apply told nothing
   * (a draft's first writes go through `draftCommit`, which has no local apply hook).
   */
  const selectInsertedAtApply = (): { settle: (slideId: string | undefined) => void } => {
    const from = shell?.active ?? snapshot.activeSlide;
    let selected = false;
    onLocalApply = (mutations) => {
      const inserted = mutations.flatMap((mutation) =>
        mutation.op === 'slide.insert' ? [mutation.slide.id] : [],
      );
      const last = inserted[inserted.length - 1];
      if (last === undefined || snapshot.document.slides[last] === undefined) return;
      selected = true;
      selectSoon(last, from);
    };
    return {
      settle: (slideId) => {
        if (onLocalApply !== null) onLocalApply = null;
        if (!selected && slideId !== undefined) selectSoon(slideId, from);
      },
    };
  };

  const selectSoon = (slideId: string, from?: string | null): void => {
    if (!keepsPlace(shell?.active, from, slideId)) return;
    shell?.select(slideId);
    if (typeof requestAnimationFrame !== 'function' || typeof document === 'undefined') return;
    const until = Date.now() + 2_000;
    const tick = (): void => {
      if (shell?.active === slideId) return;
      if (!keepsPlace(shell?.active, from, slideId)) return;
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
  /* the product's sentence for an error a server function threw (editor/refusal.ts), at most once
     a minute per sentence so a store that refuses every reload does not fill the snackbar */
  const refusalsSaid = new Map<string, number>();
  const sayRefusal = (error: unknown): void => {
    const sentence = refusalSentence(error);
    const now = Date.now();
    const last = refusalsSaid.get(sentence) ?? 0;
    if (now - last < REFUSAL_SNACKBAR_SPACING_MS) return;
    refusalsSaid.set(sentence, now);
    say(sentence);
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

  /** The History panel's version rows re-read from the log, once per burst of the calls that need it. */
  const refreshVersionsSoon = (): void => {
    if (versionsTimer !== undefined) clearTimeout(versionsTimer);
    versionsTimer = setTimeout(() => {
      versionsTimer = undefined;
      listVersions({ deckId })
        .then((versions) => publish({ versions }))
        .catch(() => undefined);
    }, 500);
  };

  /**
   * The History panel's rows follow the checkpoint frames (docs/SYNC.md 3.10; audit-costs item
   * 7): a frame at the revision after the last row appends one row from what it carries (the
   * revision, the author, the note; the record number is the next one, since a named version
   * and a restore append their own rows when they land), and the log is read only when a frame
   * does not continue the rows (a gap after a stream that was down, a named version another tab
   * saved at the same revision, an empty list), when the panel asks (`refreshVersions`,
   * `version.list`) or when a restore lands. An external checkpoint reloads the tab and the
   * reload's payload carries the rows. Before this every edit was followed by a `listVersions`
   * server function 500 ms after its checkpoint, 12 a minute while editing (audit-costs 4.1).
   */
  const noteCheckpointVersion = (event: Extract<RoomEvent, { type: 'checkpoint' }>): void => {
    if (event.external === true) return;
    const rows = latest().versions;
    const last = rows[rows.length - 1];
    if (last !== undefined && event.revision === last.revision + 1) {
      publish({
        versions: [
          ...rows,
          {
            n: last.n + 1,
            revision: event.revision,
            author: event.author,
            note: event.note,
            createdAt: new Date().toISOString(),
            mutations: [],
          },
        ],
      });
      return;
    }
    // a frame at or under the last row's revision with no note repeats a row the tab holds (the
    // blob tier delivers a late frame of an earlier revision after the answer moved the rows)
    if (last !== undefined && event.revision <= last.revision && event.note === '') return;
    refreshVersionsSoon();
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
  /** The shell's snackbar with an action when ShellBridge handed it over, the plain one otherwise. */
  const sayWithAction = (text: string, action?: { label: string; run: () => void }): void => {
    if (editorShell !== null) editorShell.say(text, action);
    else say(text);
  };

  /**
   * An outside write by an agent author that arrived live (docs/PRODUCT.md 6.1 "Outside writes";
   * audit-assist 1, 7): the snackbar names the slide and the change with Undo for the snackbar's
   * hold, the Undo writes the inverse as this seller (one commit, on this seller's stack, so the
   * seller's own last edit stays), and the auto title rule follows a write to the first title
   * whoever wrote it, so the deck's name and the tab no longer diverge from the slide. Before this
   * the slide changed with no banner and Cmd+Z took the seller's own last edit back instead.
   */
  const announceAgentWrite = (entries: ReadonlyArray<Entry>): void => {
    if (room === null) return;
    const client = room;
    const mine = entries.filter(
      (entry) =>
        !(entry.note !== undefined && ownAssistNotes.delete(entry.note)) &&
        entry.author.kind === 'agent' &&
        entry.clientId !== client.clientId() &&
        !latest().ownClientIds.includes(entry.clientId) &&
        entry.mutations !== undefined &&
        entry.mutations.length > 0,
    );
    if (mine.length === 0) return;
    const mutations: Mutation[] = mine.flatMap((entry) => entry.mutations ?? []);
    const before = beforeRemote;
    const after = client.document();
    const first = mine[0];
    const who = first === undefined ? 'Assistant' : authorDisplay(first.author);
    const order = slideOrder(after);
    const slideId = mutations
      .map((mutation) => ('slideId' in mutation ? mutation.slideId : undefined))
      .find((id): id is string => id !== undefined && order.includes(id));
    const n = slideId === undefined ? 0 : order.indexOf(slideId) + 1;
    let change = '';
    if (before !== null && slideId !== undefined) {
      for (const mutation of mutations) {
        if (
          (mutation.op === 'text.replace' ||
            mutation.op === 'block.set' ||
            mutation.op === 'text.splice') &&
          mutation.slideId === slideId
        ) {
          const pointer = mutation.path.replace(/^\//, '');
          const was = before.slides[slideId];
          const now = after.slides[slideId];
          const from = was === undefined ? undefined : readRunText(was, mutation.blockId, pointer);
          const to = now === undefined ? undefined : readRunText(now, mutation.blockId, pointer);
          if (from !== undefined && to !== undefined && from !== to) {
            const cut = (text: string): string =>
              text.length > 40 ? `${text.slice(0, 39).trimEnd()}…` : text;
            change = `: ${cut(from)} became ${cut(to)}`;
            break;
          }
        }
      }
    }
    const sentence =
      slideId === undefined
        ? `${who} changed this presentation`
        : `${who} changed slide ${n}${change}`;
    let inverse: Mutation[] | null = null;
    if (before !== null) {
      try {
        inverse = applyMutations(before, mutations).inverse;
      } catch {
        inverse = null;
      }
    }
    const steps = inverse;
    sayWithAction(
      sentence,
      steps === null || steps.length === 0
        ? undefined
        : {
            label: 'Undo',
            run: () => {
              commit(steps, `undo ${who}`).catch((error: unknown) =>
                say(`Undo failed: ${errorMessage(error)}`),
              );
            },
          },
    );
    // a text run on the cover's heading carries the title with it in the reducer (docs/SYNC.md
    // 3.4), so only a whole value write the reducer does not derive from is followed here
    if (before !== null && !mutations.some(isTextRunMutation)) {
      const rename = autoTitleMutations(before, mutations, autoTitle);
      if (rename.length > 0) commit(rename, 'rename').catch(() => undefined);
    }
  };

  const announceRemoteText = (entry: Entry): void => {
    if (
      room === null ||
      entry.clientId === room.clientId() ||
      latest().ownClientIds.includes(entry.clientId) ||
      entry.mutations === undefined
    )
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
      const slide = document.slides[mutation.slideId];
      if (slide === undefined) continue;
      // a slide field's run is addressed at the field's pointer on the wire (`/heading`; docs/
      // SYNC.md 3.4) and drawn as `<field>/text` on the sheet (render/slide.ts data-run), so the
      // session is told under the pointer it keys its run by
      const pointer =
        slideFieldOf(slide, mutation.blockId) !== null ? 'text' : mutation.path.replace(/^\//, '');
      const key = `${mutation.slideId}:${mutation.blockId}/${pointer}`;
      if (seen.has(key)) continue;
      seen.add(key);
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
      transport: sseTransport(deckId, tabToken(idStorage())),
      document,
      seq,
      tier,
      // the tab's earlier ids leave the roster before hello lists it (hotfix 2 cause B1)
      retire: latest().ownClientIds,
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
        if (reason === 'remote') beforeRemote = latest().document;
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
            announceAgentWrite([event.entry]);
            if (event.entry.kind === 'comment') scheduleCommentsRefresh();
            return;
          case 'ops':
            for (const entry of event.entries) announceRemoteText(entry);
            announceAgentWrite(event.entries);
            if (event.entries.some((entry) => entry.kind === 'comment')) scheduleCommentsRefresh();
            return;
          case 'hello':
            publish({
              roster: event.clients,
              // this tab's ids, the new one last, remembered across a reload (hotfix 2 cause B3)
              ownClientIds: rememberClientId(idStorage(), deckId, event.clientId),
              error: null,
            });
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
            noteCheckpointVersion(event);
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
      onResync: async (revision, since) => {
        // the reload lands at or above the revision the room named (the focus round, cycle 2):
        // on the blob tier the instance that answers may hold a mirror behind the write this
        // tab just learned of (its own restore, another tab's write announced as an external
        // checkpoint), and a document from before it left the tab on the old slides while its
        // revision moved (VERIFICATION F-versions); write.ts syncs the store by force when behind.
        // The read carries the tab's position before the resync (`since`; docs/SYNC.md 3.2), so
        // the answer names the op ids of the records above it and the room client drops the
        // pending ops those records name instead of re-sending them (invariant 10)
        let payload: EditorDeck | null;
        try {
          payload = await readEditorDeck({
            deckId,
            ...(revision > 0 ? { atLeast: revision } : {}),
            since,
          });
        } catch (error) {
          // a store error the server function threw (the 429 of VERIFICATION C3-F2) stays out
          // of the room client's promise chain (C3-F3): the tab keeps its document and its
          // pending queue, the next stream event or POST answer asks for the reload again, and
          // the person reads the product's sentence once a minute at most, not the store's
          sayRefusal(error);
          return null;
        }
        if (payload === null) return null;
        const fresh = payload.document.deck.revision;
        // a reload that lands at or below the revision this tab acknowledged brought nothing the
        // tab has not applied (its own write, refused one revision low by another instance's
        // mirror, is re-sent after it): the history and its clocks stay and no banner names the
        // tab's own write as external. One that lands above it brought entries the tab never
        // applied, past which no history entry can be transformed (build-4/hotfix-4.md 3.7)
        if (resyncBroughtUnseen(fresh, latest().serverRevision)) {
          history.clear();
          clockOf.clear();
          burstsOf.clear();
          showExternal({ revision: fresh });
        }
        publish({
          versions: payload.versions,
          leases: payload.leases,
          // never behind what this tab acknowledged: the answer of its own write (a restore)
          // stands when a reload lands below it
          serverRevision: Math.max(fresh, latest().serverRevision),
        });
        return { document: payload.document, ...resyncOriginsOf(payload) };
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
   * A write made while the draft's first write is in flight (hotfix 2 cause A1). Before the fix
   * every such burst was a strict `writeDeck` of its own on the draft chain, and on the blob tier
   * those interleaved with the room's ops POSTs once the room attached, so a chain write met a
   * store one revision ahead ("baseRevision N is stale; the document is at revision M") and the
   * room's POST met the chain's revision (409 resync). Now exactly one strict write creates the
   * deck; the bursts typed during its flight are applied locally at once (the reducer, no revision
   * bump) and replayed through the room in order when it attaches, so every write after the
   * first is one op of the room, the way every write of a stored deck is.
   */
  type DraftQueued = {
    mutations: Mutation[];
    label: string;
    kind: 'edit' | 'undo' | 'redo';
    /** the history entry the write made, for the room clock an undo transforms from */
    entryId: number | null;
    resolve: (committed: Committed) => void;
    reject: (error: Error) => void;
  };
  let draftInFlight = false;
  const draftQueue: DraftQueued[] = [];

  /**
   * A write the local document refuses (`applyMutations` throws before the room sees it).
   * When the refusal is that the write's slide or block is gone, another browser's Delete slide
   * landed under this gesture and the write is the loser of a structural race: the refusal is
   * shown as the loser's card with the reducer's sentence and Discard, the way the room's own
   * reject of the same write is shown (docs/SYNC.md 6.1 `sync.structural.concurrent`: the drag
   * released after B's delete posted nothing and no card showed; the integrator, ship one). Any
   * other local refusal (a malformed write through the window API) stays a sentence in `error`.
   */
  let localRefusals = 0;
  const publishLocalRefusal = (error: unknown, mutations: Mutation[]): void => {
    const message = errorMessage(error);
    if (!/^No (slide|block) "/.test(message)) {
      publish({ error: message });
      return;
    }
    localRefusals += 1;
    const notice = rejectNoticeOf({
      opId: `local-${localRefusals}`,
      reason: 'invalid',
      message,
      mutations,
    });
    publish({ rejects: [...latest().rejects, notice], error: message });
  };

  const draftEnqueue = (
    mutations: Mutation[],
    label: string,
    kind: 'edit' | 'undo' | 'redo',
  ): Promise<Committed> => {
    let result: ReturnType<typeof applyMutations>;
    try {
      result = applyMutations(snapshot.document, mutations);
    } catch (error) {
      publishLocalRefusal(error, mutations);
      return Promise.reject(error instanceof Error ? error : new TypeError(String(error)));
    }
    let entryId: number | null = null;
    if (kind === 'edit') {
      const entry = history.push({ mutations, inverse: result.inverse, label });
      revisionOf.set(entry.id, latest().serverRevision);
      entryId = entry.id;
    }
    setDocument(result.document, changedBy(mutations));
    publish({ pending: snapshot.pending + 1 });
    return new Promise<Committed>((resolve, reject) => {
      draftQueue.push({ mutations, label, kind, entryId, resolve, reject });
    });
  };

  /** The queued writes go through the room in order; the local document holds them already. */
  const replayDraftQueue = (): void => {
    const queued = draftQueue.splice(0);
    for (const item of queued) {
      const client = room;
      if (client === null) {
        item.reject(new TypeError('The room did not attach after the first write'));
        continue;
      }
      let applied: ReturnType<RoomClient['apply']>;
      try {
        /* the kit's and the assist's labels ride as the entry's note here too (FR3) */
        const note = item.kind === 'edit' ? historyNoteOf(item.label) : undefined;
        applied = client.apply(
          item.mutations,
          item.label,
          undefined,
          note === undefined ? undefined : { note },
        );
      } catch (error) {
        publish({ error: errorMessage(error) });
        item.reject(error instanceof Error ? error : new TypeError(String(error)));
        continue;
      }
      if (item.entryId !== null) clockOf.set(item.entryId, applied.at);
      setDocument(applied.document, changedBy(item.mutations));
      const base = latest().serverRevision;
      void applied.settled.then(async (outcome) => {
        if ('rejected' in outcome) {
          item.reject(
            new ConflictError(
              outcome.rejected.message ??
                `The change was not accepted (${outcome.rejected.reason})`,
              { currentRevision: latest().serverRevision, current: latest().document },
            ),
          );
          return;
        }
        item.resolve({
          revision: await acknowledgedAbove(base),
          entry: recordOf(item.mutations, applied.inverse, outcome.seq),
          seq: outcome.seq,
        });
      });
    }
  };

  /**
   * The revision an admitted write's answer carries (SPEC-3 3.10: the answer is the base of the
   * next write). The room client settles an op when its own entry arrives, and on the memory
   * tier the stream delivers that entry before the ops POST answers, which is what moves the
   * acknowledged revision (`serverRevision` through `onStatus`), so an answer read at the settle
   * carried the revision before its own write and the next write based on it was refused as
   * stale (VERIFICATION-4 finding 1, the three step 21 rows; the round four fixer round). The
   * answer waits for the acknowledgement above the base the write was made on, capped at
   * ACK_WAIT_MS (ack-wait.ts: past the memory tier's checkpoint hard limit), and at the cap it
   * is the revision the page reports, never the floor `base + 1` the round four fixer answered:
   * `checkBase` compares the next write's base against `reportedRevision()`, so a floor the page
   * had not reached refused the very base this answer handed out ("baseRevision 9 is stale; the
   * document is at revision 8", VERIFICATION F22, the two chains of gslides-actions.spec.ts on
   * a loaded dev server whose checkpoint took longer than the old 5 s cap).
   */
  const acknowledgedAbove = (base: number): Promise<number> =>
    awaitAcknowledged(reportedRevision, base);

  const rejectDraftQueue = (error: Error): void => {
    const queued = draftQueue.splice(0);
    for (const item of queued) item.reject(error);
    if (queued.length > 0) publish({ pending: Math.max(0, latest().pending - queued.length) });
  };

  /**
   * The draft's first write (SPEC 6.1): the deck does not exist until it lands, so the write goes
   * through the strict server function, which creates the deck and admits the write through the
   * room; the room client starts on the answer, and the writes queued during the flight follow
   * through it (`replayDraftQueue`).
   */
  const draftCommit = (
    mutations: Mutation[],
    label: string,
    kind: 'edit' | 'undo' | 'redo',
  ): Promise<Committed> => {
    const base = snapshot.document.deck.revision;
    const note = kind === 'edit' ? historyNoteOf(label) : undefined;
    const write: Write = {
      baseRevision: base,
      author,
      mutations,
      ...(note === undefined ? {} : { note }),
    };
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
    draftInFlight = true;
    const run = draftChain.then(async () => {
      let answer: Awaited<ReturnType<typeof writeDeck>>;
      try {
        answer = await writeDeck({ deckId, write, returnDocument: true });
      } catch (error) {
        draftInFlight = false;
        const failure = error instanceof Error ? error : new TypeError(String(error));
        publish({ pending: Math.max(0, latest().pending - 1), error: failure.message });
        rejectDraftQueue(failure);
        throw failure;
      }
      if (!answer.ok) {
        draftInFlight = false;
        publish({ pending: Math.max(0, latest().pending - 1), error: answer.message });
        const failure =
          answer.code === 'conflict'
            ? new ConflictError(answer.message, {
                currentRevision: answer.currentRevision,
                current: answer.current,
              })
            : new TypeError(answer.message);
        rejectDraftQueue(failure);
        throw failure;
      }
      publish({
        pending: Math.max(0, latest().pending - 1),
        serverRevision: answer.revision,
        error: null,
      });
      warmHomeCard();
      if (room === null && answer.document !== undefined) {
        // the server's document is the room's base; the writes queued during the flight are
        // folded back on top of it through the room in the same tick, so nothing is drawn twice
        setDocument(answer.document, 'all');
        attachRoom(
          answer.document,
          answer.seq ?? answer.revision,
          init.payload.room?.tier ?? 'memory',
        );
        // the first write created the deck and its access record (restricted, the creator as the
        // owner; docs/FOCUS.md rank 1, ruling 2): the /new page keeps its draft payload, so the
        // record and the role are read once here and every reader of `snap.access` sees them
        // without a reload (b6.md R1)
        void refreshAccess().catch(() => undefined);
      }
      draftInFlight = false;
      replayDraftQueue();
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
    if (room === null) {
      // a burst typed while the first write is in flight waits for the room (hotfix 2 cause A1)
      if (draftInFlight) return draftEnqueue(mutations, label, kind);
      return draftCommit(mutations, label, kind);
    }
    wroteInSession = true;
    const base = latest().serverRevision;
    let applied;
    try {
      const note = kind === 'edit' ? historyNoteOf(label) : undefined;
      applied = room.apply(mutations, label, undefined, note === undefined ? undefined : { note });
    } catch (error) {
      publishLocalRefusal(error, mutations);
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
        burstsOf
          .get(group.id)
          ?.push({ at: applied.at, forward: mutations.length, inverse: applied.inverse.length });
        if (lastTyping !== null) lastTyping.at = nowMs;
      } else {
        const entry = history.push({ mutations, inverse: applied.inverse, label });
        revisionOf.set(entry.id, latest().serverRevision);
        clockOf.set(entry.id, applied.at);
        burstsOf.set(entry.id, [
          { at: applied.at, forward: mutations.length, inverse: applied.inverse.length },
        ]);
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
    return applied.settled.then(async (outcome) => {
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
        revision: await acknowledgedAbove(base),
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

  /*
   * The history label a write carries into Version history (b7.md FR3; docs/PRODUCT.md 4.1, 6.1):
   * the brand kit's writes ("Brand kit: Primary", from the panel, the dialogs and `brand.set`) and
   * the assist's accept ("Assist: <sentence>") are their own named rows in the panel, so Restore
   * of the row before takes the colour back and the assistant's change reads by its sentence. An
   * ordinary edit carries none, because a noted record is a named version in the panel's filter.
   */
  const historyNoteOf = (label: string): string | undefined =>
    /^(Brand kit|Assist):/.test(label) ? label : undefined;

  /* the auto-title (gslides-parity SPEC 6.3; docs/RETURN.md 2.18): a write that changes the title
     slide's heading renames the deck in the same write while the name still follows the heading
     (Untitled, or the name this rule gave it), so one undo removes both and a slow typist's deck
     reads its whole title (decks.name.follows-heading) */
  const autoTitle: AutoTitleMemory = { lastAuto: null };
  const withAutoTitle = (mutations: Mutation[]): Mutation[] => {
    /* the sync round (docs/SYNC.md 3.4, audit-ordering item 1): a text run on the cover's heading
       carries no rename of its own, since the reducer derives the deck's title from the heading
       while the title was following it (schema reduce.ts `followTitle`) and the inverse it answers
       restores the title too. A `deck.set /title` riding every burst was never transformed, so two
       people typing into one cover wrote each other's titles over and the title stopped
       following. The rename still rides the whole value writes the reducer does not derive from
       (a slide.replace that makes a title slide, a canvas conversion) */
    if (mutations.some(isTextRunMutation)) return mutations;
    const rename = autoTitleMutations(snapshot.document, mutations, autoTitle);
    const first = rename[0];
    if (first?.op === 'deck.set' && typeof first.value === 'string')
      autoTitle.lastAuto = first.value;
    return rename.length === 0 ? mutations : [...mutations, ...rename];
  };
  /* the first format write on a fixed kind's field (the cover title's heading: Bold, Center, the
     size, a mark, a colour, Clear formatting) converts the slide to a canvas in the same write,
     the way the Align rows do through the store's withCanvas (docs/RETURN.md 2.14 item 1; SPEC-2
     1.6): the measured slide.replace travels in front of the write's mutations, so one revision
     and one undo step hold both. Every other write keeps its synchronous local apply. */
  const convertThenCommit = async (
    slideId: string,
    mutations: Mutation[],
    label: string,
  ): Promise<Committed> => {
    const current = snapshot.document;
    const slide = current.slides[slideId];
    if (slide === undefined) return commitAs(withAutoTitle(mutations), label, 'edit');
    const canvas = await withCanvas(storeDeps('slide.toCanvas'), current, slide);
    /* the document moved while the sheet was measured (a collaborator's write, a burst): the
       conversion is measured again on the document as it stands now */
    if (snapshot.document !== current) {
      const again = slideToConvertFor(snapshot.document, mutations);
      if (again !== null) return convertThenCommit(again, mutations, label);
      return commitAs(withAutoTitle(mutations), label, 'edit');
    }
    return commitAs(withAutoTitle([...canvas.prefix, ...mutations]), label, 'edit');
  };
  const commit = (rawMutations: Mutation[], label: string): Promise<Committed> => {
    /* the seller's edit of an assisted block clears its mark (docs/PRODUCT.md 6.1) */
    const mutations = withAssistClear(snapshot.document, rawMutations);
    /* a text run on a title or statement slide's field names the field as its blockId (docs/
       SYNC.md 3.4) and is not a write against the field object that converts the slide to a
       canvas first (convert-first.ts): the reducer writes the field in place, so the cover keeps
       its kind under typing and converts on the first format write alone, as before */
    const convert = slideToConvertFor(
      snapshot.document,
      mutations.filter((mutation) => !isSlideFieldTextRun(snapshot.document, mutation)),
    );
    if (convert !== null) return convertThenCommit(convert, mutations, label);
    return commitAs(withAutoTitle(mutations), label, 'edit');
  };

  /**
   * Accept a card of the assist (docs/PRODUCT.md 6.1, 6.2): the shared plan re bases the card on
   * the document as it stands (the stale sentence otherwise) and adds the `ext.assist` marks; the
   * write is one commit labelled "Assist: <sentence>" under this tab's session, so Cmd+Z is the
   * step back and Change history lists it once. The marks are the card's own, so the commit's
   * clearing pass is skipped here.
   */
  /* the notes of the accepts this page posted to the route, so the follower's outside write
     banner skips the assistant's own entry when the stream brings it back (6.1) */
  const ownAssistNotes = new Set<string>();
  const acceptAssist = async (
    rawCard: unknown,
  ): Promise<{ revision: number; slideIds: string[]; sentence: string }> => {
    const plan = planAcceptedCard(snapshot.document, rawCard, { now: new Date() });
    const label = `Assist: ${plan.sentence}`;
    if (room === null) {
      /* a draft has no room yet: the write is this tab's, labelled and noted as the assist's */
      const committed = await commitAs(withAutoTitle(plan.mutations), label, 'edit');
      return { revision: committed.revision, slideIds: plan.slideIds, sentence: plan.sentence };
    }
    /* the route writes as the assistant (b7.md FR3; docs/PRODUCT.md 6.1): Version history lists
       the revision as the assistant's own row with the agent mark and the note, the audit trail
       names who wrote; the page keeps Undo by holding the plan's inverse, measured on the
       document the write applied to, on its own stack, and the room brings the entry back */
    await idle();
    const client = room;
    const base = latest().serverRevision;
    const before = client.document();
    let inverse: Mutation[] = [];
    try {
      inverse = applyMutations(before, plan.mutations).inverse;
    } catch {
      inverse = [];
    }
    ownAssistNotes.add(label);
    let answer: { revision?: unknown };
    try {
      answer = (await assistPost('assist.accept', { card: rawCard, baseRevision: base })) as {
        revision?: unknown;
      };
    } catch (error) {
      ownAssistNotes.delete(label);
      throw error;
    }
    const revision = typeof answer.revision === 'number' ? answer.revision : base + 1;
    /* the stream brings the entry back within a moment: the history takes it once the local
       document carries the write (so Cmd+Z right after applies against the written document),
       and before the answer, so the panel's snackbar and the seller's Cmd+Z find the entry (the
       acknowledgement alone trails the reported revision on the memory tier) */
    const until = Date.now() + 5000;
    while (client.document() === before && Date.now() < until) await sleep(20);
    lastTyping = null;
    const entry = history.push({ mutations: plan.mutations, inverse, label });
    revisionOf.set(entry.id, revision);
    publish({ serverRevision: Math.max(latest().serverRevision, revision) });
    return { revision, slideIds: plan.slideIds, sentence: plan.sentence };
  };

  /**
   * `assist.propose` on the window transport (6.2, 6.3): the page posts to the assist's own route
   * with its session, never to a server function, so the WAF rule and the duration of 6.3 name
   * it; the answer is the action's output (the signed cards) or the route's error body, whose
   * status the panel reads (503 the switch, 429 the quota, 403 a viewer).
   */
  const assistPropose = (input: AssistProposeInput): Promise<unknown> =>
    assistPost('assist.propose', input);

  /** One post to the assist's route (`assist.propose`, `assist.accept`) with the page's session. */
  const assistPost = async (
    action: 'assist.propose' | 'assist.accept',
    input: unknown,
  ): Promise<unknown> => {
    const response = await fetch(`/api/assist?deck=${encodeURIComponent(deckId)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, input }),
    });
    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text === '' ? null : (JSON.parse(text) as unknown);
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const body = payload as { error?: { message?: unknown } | string; message?: unknown } | null;
      const message =
        typeof body?.error === 'object' &&
        body.error !== null &&
        typeof body.error.message === 'string'
          ? body.error.message
          : typeof body?.message === 'string'
            ? body.message
            : `The assistant answered ${response.status}`;
      const error = new Error(message) as Error & { status: number };
      error.status = response.status;
      throw error;
    }
    return payload;
  };

  /**
   * An undo or redo step moved past what landed since it was recorded (SPEC-3 3.5, 3.6); a typing
   * group's segments each from their own burst's clock (undo-bursts.ts, s2.md S2-R3).
   */
  const stepMutations = (
    entry: HistoryEntry,
    mutations: Mutation[],
    side: 'forward' | 'inverse',
  ): Mutation[] => {
    const at = clockOf.get(entry.id);
    const client = room;
    if (client === null || at === undefined) return mutations;
    const bursts = burstsOf.get(entry.id);
    if (bursts === undefined || bursts.length <= 1) return client.transformSince(mutations, at);
    return stepBursts(bursts, mutations, side, (segment, since) =>
      client.transformSince(segment, since),
    );
  };

  const undo = async (): Promise<void> => {
    const entry = history.undo();
    if (!entry) return;
    lastTyping = null;
    const inverse = stepMutations(entry, entry.inverse, 'inverse');
    if (inverse.length === 0) {
      say(REFUSALS.alreadyChanged(participants().others[0]?.label ?? 'someone'));
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
    const forward = stepMutations(entry, entry.mutations, 'forward');
    if (forward.length === 0) return;
    try {
      // a restore is a server first write (the reducer needs the version log): its redo goes the
      // same way, and the entry keeps its place with the inverse the answer carries; through the
      // room the client's reducer threw "No version n to restore" and the entry sat on the undo
      // stack with nothing applied (the product round fix round, beside finding 4)
      if (forward.some((mutation) => mutation.op === 'version.restore'))
        await commitServerFirst(forward, `redo ${entry.label}`, entry);
      else await commitAs(forward, `redo ${entry.label}`, 'redo');
    } catch (error) {
      say(`Redo failed: ${errorMessage(error)}`);
    }
  };

  const undoTo = async (id: number): Promise<void> => {
    const entries = history.undoTo(id);
    for (const entry of entries) {
      try {
        await commitAs(
          stepMutations(entry, entry.inverse, 'inverse'),
          `undo ${entry.label}`,
          'undo',
        );
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

  /**
   * A write the server applies first (version.restore needs the version log); the room announces
   * it. `redoOf` is the history entry a redo brings back: it keeps its place on the undo stack and
   * takes the inverse this write's answer carries, since a restore's inverse is the diff from the
   * document it applied to and the deck may have moved since the entry was recorded.
   */
  const commitServerFirst = async (
    mutations: Mutation[],
    label: string,
    redoOf?: HistoryEntry,
  ): Promise<Committed> => {
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
    let entry: HistoryEntry;
    if (redoOf === undefined) {
      entry = history.push({ mutations, inverse: result.entry.inverse, label });
    } else {
      redoOf.inverse = result.entry.inverse;
      entry = redoOf;
    }
    revisionOf.set(entry.id, result.revision);
    const { baseRevision: _base, inverse: _inverse, ...version } = result.entry;
    publish({ serverRevision: result.revision, versions: [...snapshot.versions, version] });
    if (result.document) {
      // the room reloads at the revision the write made, so the document it hands every view
      // is the restored one whichever instance answers the reload (onResync, write.ts atLeast)
      if (room !== null) await room.resync(result.revision);
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
    say(`Version ${version.n} saved`);
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
     a play list longer than the capability's batch size runs the batched protocol (SPEC-2 8.1). The
     choice waits, bounded, for the capabilities' answer (export-mode.ts; VERIFICATION C3S-F7: a
     download started before it took the polled path on the hosted tier) */
  const exportMode = createExportModeGate();

  // The dispatcher: the same ACTIONS table and validation the CLI and MCP run (SPEC 7.1).
  const dispatcher: Dispatcher = createDispatcher();
  const context: ActionContext = { author };
  /*
   * The origin of a dispatch (docs/PRODUCT.md section 2 rank 1; build/b3.md): the chrome's own
   * dispatch (`invoke`: the menus, the toolbar, the pickers, the sidebar) and the window API's
   * (`invokeAsAgent`: the two owners' adapters, which an agent or a driver runs) reach the same
   * handlers with the same author; a handler that places an object for a person or selects it
   * afterwards reads which one called (select-after-write.ts `originOf`). An agent's write keeps
   * the strict contract of SPEC-3 3.10: the box it names, no selection taken from the person.
   */
  const chromeContext: StudioActionContext = { author, origin: 'chrome' };
  const agentContext: StudioActionContext = { author, origin: 'agent' };
  const on = <T,>(id: ActionId, run: (input: T) => Promise<unknown> | unknown): void => {
    dispatcher.register(id, (input) => run(input as T));
  };
  /** Tells the stage to select the objects a chrome insert made, once they are on the sheet. */
  const announceSelection = (slideId: string, blockIds: string[]): void => {
    if (typeof window === 'undefined' || blockIds.length === 0) return;
    const detail: SelectObjectsDetail = { deckId, slideId, blockIds };
    window.dispatchEvent(new CustomEvent(SELECT_OBJECTS_EVENT, { detail }));
  };
  /**
   * Arms the selection of what a chrome insert is about to write: the store's `write` tells
   * `onLocalApply` the mutations the moment the local document carries them (before the room's
   * acknowledgement, which the memory tier gives at its checkpoint idle), and the inserted block
   * ids are announced then; `settle` announces the ids the action answered when the hook did not
   * fire (a write that inserted through another path), `disarm` clears a hook a refused write
   * left behind so it never fires on the next unrelated write.
   */
  const armInsertSelection = (
    slideId: string,
  ): { settle: (blockIds: string[]) => void; disarm: () => void } => {
    let announced = false;
    const hook = (mutations: readonly Mutation[]): void => {
      const inserted = mutations.flatMap((mutation) =>
        mutation.op === 'block.insert' && mutation.slideId === slideId ? [mutation.block.id] : [],
      );
      if (inserted.length === 0) return;
      announced = true;
      announceSelection(slideId, inserted);
    };
    onLocalApply = hook;
    return {
      settle: (blockIds) => {
        if (!announced) announceSelection(slideId, blockIds);
      },
      disarm: () => {
        if (onLocalApply === hook) onLocalApply = null;
      },
    };
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
      throw new StaleBaseError(baseRevision, current, snapshot.document);
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
        const settling = commit(write.mutations, label);
        /* the local document carries the write from here (commitAs applies before it returns the
           acknowledgement's promise); a handler that selects what the write made is told now,
           not two seconds later on the memory tier's checkpoint idle (C2-F21, select-after-write.ts) */
        const told = onLocalApply;
        onLocalApply = null;
        told?.(write.mutations);
        const committed = await settling;
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
    // the seller's words, never an id (docs/PRODUCT.md section 2 rank 14)
    const count = created.counts.slides;
    say(`Created ${created.title}, ${count} slide${count === 1 ? '' : 's'}`);
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
  /**
   * A server side action created the deck (docs/FOCUS.md rank 6: a picture as the first action
   * on a /new draft): the server's document is the room's base, exactly as after the draft's
   * first `writeDeck` (draftCommit), the page learns the deck exists (DECK_CREATED_EVENT moves
   * the address to /edit/<id> and changes the save words) and the edits typed during the upload
   * follow through the room.
   */
  const adoptCreatedDeck = async (known?: EditorDeck): Promise<void> => {
    let payload: EditorDeck | null;
    try {
      payload = known ?? (await readEditorDeck({ deckId }));
    } catch (error) {
      draftInFlight = false;
      rejectDraftQueue(error instanceof Error ? error : new TypeError(String(error)));
      throw error;
    }
    draftInFlight = false;
    if (payload === null) {
      const failure = new TypeError('The deck was created but could not be read back');
      rejectDraftQueue(failure);
      throw failure;
    }
    publish({
      serverRevision: Math.max(latest().serverRevision, payload.document.deck.revision),
      versions: payload.versions,
      leases: payload.leases,
      error: null,
    });
    warmHomeCard();
    if (room === null) {
      setDocument(payload.document, 'all');
      attachRoom(
        payload.document,
        payload.room?.seq ?? payload.document.deck.revision,
        payload.room?.tier ?? init.payload.room?.tier ?? 'memory',
      );
      // the record the server side create wrote, read once (b6.md R1, as after draftCommit)
      void refreshAccess().catch(() => undefined);
    }
    if (typeof window !== 'undefined') {
      const detail: DeckCreatedDetail = { deckId, revision: payload.document.deck.revision };
      window.dispatchEvent(new CustomEvent(DECK_CREATED_EVENT, { detail }));
    }
    replayDraftQueue();
    refreshVersionsSoon();
  };

  /* asset.add, asset.dither, material.capture and material.list run on the server (sharp, the
     capture browser, the catalog); the write they end in comes back over the watch channel, and
     the handler waits for that revision before it answers */
  const serverSide = (id: ServerSideWindowAction, options: { announce?: boolean } = {}): void => {
    dispatcher.register(id, async (input, ctx) => {
      const before = latest().document.deck.revision;
      const writesDeck = options.announce === true;
      let request = input;
      if (writesDeck) {
        // the write behind an asset action bases on the revision the room acknowledged, once
        // the pending writes have landed (docs/FOCUS.md rank 5): the page's own count runs one
        // ahead of the store while a write is in flight and one behind while another tab's
        // write is, and the store refused either as stale (audit-images rows 6 to 8, 57, 61).
        // asset.add commits its record against the store's head whatever base the tab sends
        // (packages/materials/src/actions.ts commitAssetsAtHead), so it waits for the draft
        // chain alone and not for the room's pending writes: a second picture no longer waits
        // for the first insert's acknowledgement (b3.md R21; images.insert.upload-while-pending
        // sat on its 5 s budget on the blob tier). asset.dither and material.capture change a
        // record and keep the wait.
        if (id === 'asset.add') await draftChain.catch(() => undefined);
        else await idle();
        if (typeof input === 'object' && input !== null && 'baseRevision' in input) {
          request = { ...(input as Record<string, unknown>), baseRevision: reportedRevision() };
        }
      }
      // a draft's first action: the bursts typed during the upload queue for the room (hotfix 2
      // cause A1), which attaches on the answer
      const draft = writesDeck && room === null && init.payload.draft === true;
      if (draft) draftInFlight = true;
      let answer: RunDeckActionAnswer;
      try {
        answer = await runDeckActionDetailed({ deckId, action: id, input: request, author });
      } catch (error) {
        if (draft) {
          // the action may have created the deck before it failed (a picture sharp refused):
          // the deck is adopted the same way, so the address moves and the room attaches, and
          // the bursts typed meanwhile follow; otherwise they return to their author
          const stored = await readEditorDeck({ deckId }).catch(() => null);
          if (stored !== null) await adoptCreatedDeck(stored).catch(() => undefined);
          else {
            draftInFlight = false;
            rejectDraftQueue(error instanceof Error ? error : new TypeError(String(error)));
          }
        }
        // a refusal is shown, never swallowed (rank 5: "the seller sees nothing"), as a sentence
        // with its reason and never an action id (docs/PRODUCT.md section 2 rank 14). The chrome's
        // own route says its own sentence from the rejection (EditorRoot.tsx uploadPicture), so
        // the snackbar here is the agent's (the window API), and the error word is everyone's.
        if (writesDeck) {
          const message = failureSentence(id, errorMessage(error));
          publish({ error: message });
          if (originOf(ctx) === 'agent') say(message);
        }
        throw error;
      }
      if (answer.created) await adoptCreatedDeck();
      else if (draft) {
        draftInFlight = false;
        replayDraftQueue();
      }
      const output = answer.output;
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
        // on the blob tier the write comes back through the channel's one second head poll and
        // a resync (packages/realtime/src/blob.ts); the answer says the write committed, so the
        // tab reloads at once instead of waiting for the poll (b3.md R21). The memory tier's
        // follower streams the write within milliseconds, and a resync there would clear the
        // undo history (onResync), so it keeps the wait alone
        if (
          !landed() &&
          room !== null &&
          (latest().sync?.tier ?? init.payload.room?.tier) === 'blob'
        ) {
          await room.resync().catch(() => undefined);
        }
        const until = Date.now() + 15_000;
        while (!landed() && Date.now() < until) await sleep(40);
        // no snackbar on success (rank 14): the picture is on the sheet and selected; the ids
        // are in the answer for the agent transports
      }
      return output;
    });
  };
  /** The sentence a failed server side write shows, by what the person was doing. */
  const failureSentence = (id: ServerSideWindowAction, reason: string): string => {
    switch (id) {
      case 'asset.add':
        return `The picture could not be uploaded: ${reason}`;
      case 'asset.dither':
        return `The dither could not be made: ${reason}`;
      case 'material.capture':
        return `The capture did not finish: ${reason}`;
      case 'logo.insert':
        return `The logo could not be added: ${reason}`;
      default:
        return `The change did not go through: ${reason}`;
    }
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
      const { sync: exportSync, batchSize: exportBatchSize } = await exportMode.read();
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
          if (first?.url !== undefined) await triggerDownload(downloadUrlOf(first.url));
          return run.report;
        }
        const run = await runSyncExport(deckId, input, (line) =>
          publish({
            artifact: { progress: { label: `Exporting ${label}`, line }, run: null },
          }),
        );
        publish({ artifact: { progress: null, run } });
        const first = run.downloads[0];
        if (first?.url !== undefined) await triggerDownload(downloadUrlOf(first.url));
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
          if (first) await triggerDownload(first.url);
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
        /* the card offers the file again from the same link: the stored copy on the blob
           backend, this instance's token elsewhere (server/download.ts builtFileLink) */
        downloads: built.download
          ? [{ name: built.download.name, bytes: built.download.bytes, url: built.download.url }]
          : [],
        ms: built.ms,
      };
      publish({ artifact: { progress: null, run } });
      if (built.download) await triggerDownload(downloadUrlOf(built.download.url));
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
      /* the brand kit record (docs/PRODUCT.md 4.1), only when the deck carries one */
      ...(document.deck.brand !== undefined ? { brand: document.deck.brand } : {}),
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
  /*
   * block.insert (docs/PRODUCT.md section 2 rank 1; audit-seller 1; build/b3.md): a table or a
   * chart the chrome inserts from a menu, the toolbar or the table grid arrives with the centred
   * default box of editor-shell.ts insertBlockPlan, which landed a chart over the table a seller
   * had typed. Here it lands in the largest free rectangle of the body slot, 40 sheet px from
   * what is there, shrunk to the room when the room is smaller, and cascades 40 by 40 from the
   * last object when the slot is taken (place-insert.ts); the slide is measured and converted
   * first when it is not a canvas yet, the same conversion the store action makes. Once the
   * write is in, the stage selects the new object (SELECT_OBJECTS_EVENT), so a drag or Delete
   * works at once, as Google does. A window API insert (an agent, a driver's setup write) keeps
   * the box it named and selects nothing: its contract is exact.
   */
  dispatcher.register('block.insert', async (raw, ctx) => {
    const input = raw as BlockInsertInput;
    const origin = originOf(ctx);
    let request = input;
    if (origin === 'chrome' && wantsPlacement(input)) {
      const current = snapshot.document;
      const slide = current.slides[input.slideId];
      if (slide !== undefined) {
        const canvas = (await withCanvas(storeDeps('block.insert'), current, slide)).slide;
        const placed = placeInsert(canvas, input.block.type, [
          input.block.pos.w,
          input.block.pos.h,
        ]);
        request = {
          ...input,
          block: { ...input.block, pos: { ...input.block.pos, ...placed.pos } } as Block,
        };
      }
    }
    /* the selection is told at the local apply, not at the acknowledgement: the editor's commit
       resolves when the room has confirmed the write, on the memory tier the checkpoint's idle of
       about two seconds after the last write (select-after-write.ts keepsPlace, C2-F21), and a
       table selected two seconds after the click reads as not selected (B3's walk run 1: the
       walk read no handles right after the insert and the table's ring a step later) */
    const announced = origin === 'chrome' ? armInsertSelection(input.slideId) : null;
    try {
      const result = await blockInsert(storeDeps('block.insert'), context, request);
      announced?.settle([request.block.id]);
      return result;
    } finally {
      announced?.disarm();
    }
  });
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
    const rows = latest().roster.map((entry) => participantOf(entry, now));
    // every id this tab held is this tab (hotfix 2 cause B3), not only the current one
    return partitionRoster(rows, new Set(latest().ownClientIds), room?.clientId() ?? null);
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
  /* the template ids of the product round (docs/PRODUCT.md 4.3): each is a read or a write of the
     collection's templates folder, so every one runs on the server through runDeckAction */
  for (const id of SERVER_SIDE_WINDOW_ACTIONS_P1) serverSide(id);
  /* the logo picker's ids of the features round (docs/FEATURES.md 4.11; build/b6.md R3): the
     index and the store live on the server, so the search, the insert and the refresh run there.
     `logo.insert` writes this deck (the asset record, the kit's slots), so it announces as
     `asset.add` does: the answer waits until the write has come back over the channel (a resync
     at once on the blob tier), and Tailor's Apply, which plans in the page over the tab's
     document, finds the asset it names (the fix round; VERIFICATION.md pass 1 F2, b6.md R13) */
  for (const id of SERVER_SIDE_WINDOW_ACTIONS_F1)
    serverSide(id, id === 'logo.insert' ? { announce: true } : {});
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
  on<{ slideIds: 'all' | string[]; themes?: Theme[]; scale?: 1 | 2; format?: 'png' | 'jpg' }>(
    'render.slide',
    (input) =>
      renderSlideImages({
        deckId,
        slideIds: input.slideIds,
        ...(input.themes !== undefined ? { themes: input.themes } : {}),
        ...(input.scale !== undefined ? { scale: input.scale } : {}),
        /* File > Download > JPEG image asks for `jpg` (editor-shell.ts file.download.jpg); the
           handler dropped it and the row delivered a PNG (return/build/b7.md B7-R1) */
        ...(input.format !== undefined ? { format: input.format } : {}),
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
    // Google selects the new slide (R01 Slide > New slide); a grid stays a grid
    const select = selectInsertedAtApply();
    const result = await slideNew(storeDeps('slide.new'), context, input);
    select.settle(result.slide.id);
    return result;
  });
  on<SlideDuplicateInput>('slide.duplicate', async (input) => {
    const select = selectInsertedAtApply();
    const result = await slideDuplicate(storeDeps('slide.duplicate'), context, input);
    const last = result.slides[result.slides.length - 1];
    select.settle(last?.id);
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
  /* the tailoring pass (docs/PRODUCT.md section 5): one commit labelled "Tailor for <name>", the
     snackbar with Undo */
  on<DeckTailorInput>('deck.tailor', async (input) => {
    const to = input.replacements?.find((pair) => pair.to.trim() !== '')?.to.trim();
    const label = to === undefined ? 'Tailor for a customer' : `Tailor for ${to}`;
    const result = await deckTailor(storeDeps(label), context, input);
    if (result.replacements > 0 || result.pictures > 0 || result.skipped.length > 0) {
      sayWithAction(to === undefined ? 'Tailored' : `Tailored for ${to}`, {
        label: 'Undo',
        run: () => {
          undo().catch(() => undefined);
        },
      });
    }
    return result;
  });
  on<AssistProposeInput>('assist.propose', (input) => assistPropose(input));
  on<{ card: unknown; baseRevision?: number }>('assist.accept', (input) =>
    acceptAssist(input.card),
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
  /* the brand kit on the window transport (docs/PRODUCT.md 4.1; build/b5.md R2): the reads over
     the page's document, the writes as one commit with the kit's history label, so Cmd+Z takes
     one field back as the panel's own writes do */
  on<Record<string, never>>('brand.get', () => brandGet(snapshot.document.deck));
  on<BrandSetInput>('brand.set', async (input) => {
    checkBase(input.baseRevision);
    const plan = brandSetPlan(snapshot.document.deck, input);
    const committed = await commit(plan.mutations as Mutation[], plan.label);
    return {
      path: input.path,
      ...(input.value !== undefined ? { value: input.value } : {}),
      brand: snapshot.document.deck.brand ?? {},
      revision: committed.revision,
    };
  });
  on<BrandResetInput>('brand.reset', async (input) => {
    checkBase(input.baseRevision);
    const plan = brandResetPlan(snapshot.document.deck, input);
    if (plan.mutations.length === 0)
      return {
        brand: snapshot.document.deck.brand ?? {},
        revision: reportedRevision(),
        changed: false,
      };
    const committed = await commit(plan.mutations as Mutation[], plan.label);
    return {
      brand: snapshot.document.deck.brand ?? {},
      revision: committed.revision,
      changed: true,
    };
  });
  on<Record<string, never>>('font.list', () => fontList());
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
  /* the diagram a chrome insert makes is selected as a table or a chart is (rank 1: after an
     insert from a menu the new object is selected); an agent's stays unselected */
  dispatcher.register('diagram.insert', async (raw, ctx) => {
    const input = raw as DiagramInsertInput;
    const announced = originOf(ctx) === 'chrome' ? armInsertSelection(input.slideId) : null;
    try {
      const result = await diagramInsert(storeDeps('diagram.insert'), context, input);
      announced?.settle(result.blockIds);
      return result;
    } finally {
      announced?.disarm();
    }
  });
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
    dispatcher.dispatch(action, input ?? {}, chromeContext);
  /** The window API's dispatch: an agent's or a driver's run, with the strict contract (build/b3.md). */
  const invokeAsAgent = (action: string, input?: unknown): Promise<unknown> =>
    dispatcher.dispatch(action, input ?? {}, agentContext);

  /**
   * The chrome's own dispatch (EditorRoot's shellDispatch, the sidebar, the notes pane, the
   * guides): a write `checkBase` refused because the revision moved between the render that read
   * it and the gesture (a POST answer or a checkpoint frame in between) is retried once on the
   * revision the refusal named instead of dropping the gesture (hotfix 2 cause A5). Nothing was
   * committed by the refused attempt, since every handler checks the base before it commits. The
   * window API's owners call `invoke` directly and keep the strict contract of SPEC-3 3.10.
   */
  const invokeRebasing = async (action: string, input?: unknown): Promise<unknown> => {
    try {
      return await invoke(action, input);
    } catch (error) {
      const carriesBase =
        typeof input === 'object' &&
        input !== null &&
        typeof (input as { baseRevision?: unknown }).baseRevision === 'number';
      if (!(error instanceof StaleBaseError) || !carriesBase) throw error;
      const rebased = {
        ...(input as Record<string, unknown>),
        baseRevision: error.currentRevision,
      };
      return invoke(action, rebased);
    }
  };

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
      // the focus round (docs/FOCUS.md 3.1): the shell's stored settings as the rows read them,
      // Tools > Advanced tools among them (`advancedTools`), so a driver reads the switch here
      settings: { ...shellSettings },
      // the features round (docs/FEATURES.md 4.4; the integrator, ship one): the deck's asset
      // records as the document holds them, so a driver or an agent reads a placed logo's role,
      // source, twins and scale without an export (source.read is the active slide's source)
      assets: snapshot.document.deck.assets,
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
        // the stream's state beside the connection (the cycle 3 stream fix round, s1.md S1-R2):
        // a driver reads whether the client is offline, reopening its stream or waiting on the
        // store; the `sync.status` action keeps the eight fields of its contract
        // (packages/schema/src/actions.ts syncStatusSchema)
        offline: snapshot.sync?.offline ?? false,
        storeDegraded: snapshot.sync?.storeDegraded ?? false,
        streamDown: snapshot.sync?.streamDown ?? false,
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
        /* `comment.list` answered once since the room opened (b6 cycle 3 R3): the drivers read
           the thread count only after this is true, so a row never counts threads that are still
           loading beside the document (VERIFICATION C2-F25, `comments.toolbar-and-menu-routes`) */
        loaded: snapshot.comments.loaded,
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
    invoke: invokeAsAgent,
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
      return invokeAsAgent(action, input);
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
    attachEditorShell(api) {
      editorShell = api;
    },
    acceptAssist,
    refreshPresence() {
      room?.refreshPresence();
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
    invoke: invokeRebasing,
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
      exportMode.set(enabled, batchSize);
    },
    setView(view) {
      if (view.mode === snapshot.view.mode && view.present === snapshot.view.present) return;
      publish({ view });
    },
    setShellSettings(settings) {
      shellSettings = settings;
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
        say(`The thumbnails could not be drawn: ${errorMessage(error)}`);
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
          await triggerDownload(downloadUrlOf(file.url));
          return;
        }
        const { url } = await signDownload(
          run.kind === 'export'
            ? { kind: 'job', jobId: run.jobId, name: file.name }
            : { kind: 'build', deckId, name: file.name },
        );
        await triggerDownload(url);
      } catch (error) {
        say(`The download did not start: ${errorMessage(error)}`);
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
  /* the brand kit is a render input too (docs/PRODUCT.md 4.1; build/b5.md R12): the kit's
     stylesheet rides inside every slide, so a kit change re renders the memoized slides the show
     and the filmstrip read */
  return fnv1a(
    `${theme}|${assetBase}|${canonicalJson({
      assets: deck.assets,
      defaults: deck.defaults ?? null,
      brand: deck.brand ?? null,
    })}`,
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
        // the show's frame follows Insert > Slide numbers as the editor stage does (render/deck.ts
        // slideCounter; docs/RETURN.md section 5 slides.numbers.apply, "in the show too")
        counter: slideCounter(deck, slide, 1, 1) !== '',
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
    /* the brand kit's frame band for the show's Frame (docs/PRODUCT.md 4.1; build/b5.md R5) */
    band: frameBandOf(
      deck,
      readTheme(),
      bandAssetResolver(deck, (_id, _theme, path) => assetBase + path),
    ),
  };
}
