import {
  indexedDbPendingStore,
  memoryPendingStore,
} from '@turboslide/realtime/client/pending-store';
import type { PendingStore } from '@turboslide/realtime/client/pending-store';

import { runDeckAction, runDeckActionDetailed } from '../server/agent-actions';
import { bundleDownloadTicket, bundleUploadTicket, connectFacts } from '../server/bundle';
import { createNewDeck, listDecks, readSourceDeckSlides, restoreStoredDeck } from '../server/decks';
import {
  exportCapabilities,
  pollExport,
  runBatchedExport,
  runBuild,
  signDownload,
  startExport,
  syncExport,
} from '../server/download';
import { lintSlides } from '../server/lint';
import { renderSlideImages } from '../server/render';
import { warmThumbnails } from '../server/warm';
import {
  heldOpIds,
  holdDraft,
  leaseSlide,
  listVersions,
  readEditorDeck,
  saveVersion,
  writeDeck,
} from '../server/write';
import type { EditorBackend } from './backend';
import { roomTransport } from './transport';

/* the constants the editor reads from the server modules, re-exported so the editor's files import
   no runtime module of ../server/ but this one (backend.test.ts) */
export {
  SERVER_SIDE_WINDOW_ACTIONS_F1,
  SERVER_SIDE_WINDOW_ACTIONS_F2,
  SERVER_SIDE_WINDOW_ACTIONS_GS3,
  SERVER_SIDE_WINDOW_ACTIONS_P1,
} from '../server/agent-actions';
export { EXPORT_POLL_MS, batchedProgressLabel } from '../server/download';
export { DECK_CREATED_EVENT } from '../server/write';

/** The deck's asset folder on the server (the store's route, decks.$deckId.assets.$.ts). */
const ASSET_BASE = (deckId: string): string => `/decks/${deckId}/`;

/** The pending queue mirror: IndexedDB in a browser, memory where it is missing (SPEC-3 0.7). */
function pendingStoreFor(): PendingStore {
  return typeof indexedDB === 'undefined' ? memoryPendingStore() : indexedDbPendingStore();
}

/* the tab's memory of its client ids (hotfix 2 cause B1): sessionStorage is per tab and survives a reload */
function sessionIds(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Uploads bytes through the picture intake's presigned path (B4's R17; server/upload.ts): the
 * grant from `POST /api/x/upload/picture`, the `PUT` of the bytes to the grant's address, and the
 * key the write names. A non 2xx answer at either step throws with the server's sentence.
 */
async function presignUpload(
  deckId: string,
  contentType: string,
  bytes: Uint8Array,
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
): Promise<string> {
  const issued = await fetchFn('/api/x/upload/picture', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ deckId, contentType, bytes: bytes.byteLength }),
  });
  if (!issued.ok) {
    const body = await issued.text().catch(() => '');
    throw new Error(
      `the upload was refused (HTTP ${issued.status})${body ? `: ${body.slice(0, 160)}` : ''}`,
    );
  }
  const grant = (await issued.json()) as { key?: unknown; url?: unknown; method?: unknown };
  if (typeof grant.key !== 'string' || typeof grant.url !== 'string')
    throw new Error('the upload grant named no key or address');
  const put = await fetchFn(grant.url, {
    method: typeof grant.method === 'string' ? grant.method : 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': contentType },
    body: new Blob([bytes as BlobPart], { type: contentType }),
  });
  if (!put.ok) throw new Error(`the upload did not land (HTTP ${put.status})`);
  return grant.key;
}

/**
 * One call of better-auth's routes (SPEC-3 7.3; B3's `/api/auth/$`): the magic link mail with
 * its six digit code, the code exchange, sign out and the social redirects (GitHub, Google). Same
 * origin, JSON, the library's own cookies; a refusal's sentence is the dialog's error row.
 */
async function authPost(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (!response.ok) {
    let message = `Sign in did not complete (${response.status})`;
    try {
      const data = (await response.json()) as {
        message?: string;
        error?: { message?: string } | string;
      };
      message =
        data.message ??
        (typeof data.error === 'string' ? data.error : data.error?.message) ??
        message;
    } catch {
      // no body
    }
    throw new Error(message);
  }
  return response.json().catch(() => null);
}

/**
 * The editor on the server (docs/SITE.md D2): the server functions, the room's stream or socket,
 * the IndexedDB mirror, sessionStorage, the store's asset route, the page's requests and records,
 * each exactly as the editor called them before the seam.
 */
export const serverBackend: EditorBackend = {
  kind: 'server',
  readEditorDeck,
  writeDeck,
  listVersions,
  saveVersion,
  leaseSlide,
  heldOpIds,
  holdDraft,
  roomTransport: (deckId, tab, roomFacts) => roomTransport(deckId, tab, roomFacts),
  pendingStore: pendingStoreFor,
  idStorage: sessionIds,
  assetBase: ASSET_BASE,
  createNewDeck,
  listDecks,
  readSourceDeckSlides,
  restoreStoredDeck,
  runDeckAction,
  runDeckActionDetailed,
  exportCapabilities,
  startExport,
  pollExport,
  syncExport,
  runBatchedExport,
  runBuild,
  signDownload,
  bundleDownloadTicket,
  bundleUploadTicket,
  connectFacts,
  lintSlides,
  renderSlideImages,
  warmThumbnails,
  assistPost: (deckId, body) =>
    fetch(`/api/assist?deck=${encodeURIComponent(deckId)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  presignUpload: (deckId, contentType, bytes) => presignUpload(deckId, contentType, bytes),
  authPost,
  attachesSession: true,
  recordsRecent: true,
  openPage: (path, newTab) => {
    if (newTab) window.open(path, '_blank', 'noopener');
    else window.location.assign(path);
  },
};
