import type { DialogId } from '@turboslide/chrome/editor-shell';
import type { PendingStore } from '@turboslide/realtime/client/pending-store';
import type { RoomTransport } from '@turboslide/realtime/client/room-client';
import type { Author } from '@turboslide/schema/mutations';

import type { runDeckAction, runDeckActionDetailed } from '../server/agent-actions';
import type { bundleDownloadTicket, bundleUploadTicket, connectFacts } from '../server/bundle';
import type {
  createNewDeck,
  listDecks,
  readSourceDeckSlides,
  restoreStoredDeck,
} from '../server/decks';
import type {
  exportCapabilities,
  pollExport,
  runBatchedExport,
  runBuild,
  signDownload,
  startExport,
  syncExport,
} from '../server/download';
import type { lintSlides } from '../server/lint';
import type { renderSlideImages } from '../server/render';
import type { WarmInput, WarmResult } from '../server/thumbs';
import type {
  heldOpIds,
  holdDraft,
  leaseSlide,
  listVersions,
  readEditorDeck,
  saveVersion,
  writeDeck,
} from '../server/write';
import type { IdStorage } from './client-ids';
import { serverBackend } from './backend-server';

/**
 * The one seam between the editor and the server (docs/SITE.md D2): every server function, route
 * request and per browser record the editor reaches goes through the backend bound for the
 * document. The default is `serverBackend` (./backend-server.ts), the editor of /new and /edit as
 * it was; /try binds the tab backend (../try/tab-backend.ts), which runs the room in the tab and
 * answers what needs the server with one sentence. A binding is per document and made once,
 * before the editor mounts: /try is its own document in the landing's frame (docs/SITE.md D1).
 * The members keep the server functions' own signatures, so the change at each call site is the
 * name alone.
 */
export type EditorBackend = {
  kind: 'server' | 'tab';
  /* the store and the room */
  readEditorDeck: typeof readEditorDeck;
  writeDeck: typeof writeDeck;
  listVersions: typeof listVersions;
  saveVersion: typeof saveVersion;
  leaseSlide: typeof leaseSlide;
  heldOpIds: typeof heldOpIds;
  holdDraft: typeof holdDraft;
  /** the room's wire for one tab of `author` (the server's stream or socket, or the tab room) */
  roomTransport: (deckId: string, tab: string, roomFacts: unknown, author: Author) => RoomTransport;
  /** where the unsent queue is mirrored (IndexedDB on the server backend) */
  pendingStore: () => PendingStore;
  /** where a tab remembers its client ids (client-ids.ts): sessionStorage on the server backend */
  idStorage: (author: Author) => IdStorage | null;
  /** the address the deck's assets are served under */
  assetBase: (deckId: string) => string;
  /* the decks of the store */
  createNewDeck: typeof createNewDeck;
  /** the store's listing (a server function; the call takes no input) */
  listDecks: () => ReturnType<typeof listDecks>;
  readSourceDeckSlides: typeof readSourceDeckSlides;
  restoreStoredDeck: typeof restoreStoredDeck;
  /* the window actions that run on the server */
  runDeckAction: typeof runDeckAction;
  runDeckActionDetailed: typeof runDeckActionDetailed;
  /* export, download and the bundle */
  exportCapabilities: typeof exportCapabilities;
  startExport: typeof startExport;
  pollExport: typeof pollExport;
  syncExport: typeof syncExport;
  runBatchedExport: typeof runBatchedExport;
  runBuild: typeof runBuild;
  signDownload: typeof signDownload;
  bundleDownloadTicket: typeof bundleDownloadTicket;
  bundleUploadTicket: typeof bundleUploadTicket;
  connectFacts: typeof connectFacts;
  /* renders and the rendered lint */
  lintSlides: typeof lintSlides;
  renderSlideImages: typeof renderSlideImages;
  /** the server function's call shape, `{ data }` */
  warmThumbnails: (input: { data: WarmInput }) => Promise<WarmResult>;
  /* the page's own requests */
  /** one POST to the assist's route with the page's session */
  assistPost: (deckId: string, body: string) => Promise<Response>;
  /** the picture intake's presigned upload; answers the key the write names */
  presignUpload: (deckId: string, contentType: string, bytes: Uint8Array) => Promise<string>;
  /** one call of the sign in routes under /api/auth/ */
  authPost: (path: string, body: unknown) => Promise<unknown>;
  /** whether the page attaches to the studio's session registry (useStudioSession) */
  attachesSession: boolean;
  /** whether opened decks enter this browser's Recent mirror (routes/-recent.ts) */
  recordsRecent: boolean;
  /** a full load of another page, or a new tab: this window on the server backend */
  openPage: (path: string, newTab?: boolean) => void;
  /**
   * What a backend without the server answers in place of a server feature (docs/SITE.md D10):
   * the sentence, the dialogs it stands for and the snackbar's action. Absent on the server.
   */
  tabOnly?: TabOnly;
};

/** The tab backend's answer to a server feature (docs/SITE.md D10). */
export type TabOnly = {
  sentence: string;
  /** the dialogs that need the server; opening one says the sentence instead */
  dialogs: readonly DialogId[];
  action: { label: string; run: () => void };
};

/**
 * The refusal a backend without the server throws for a server feature: its message is the
 * sentence, so every path that says an error's message says it.
 */
export class TabOnlyError extends Error {
  constructor(sentence: string) {
    super(sentence);
    this.name = 'TabOnlyError';
  }
}

let bound: EditorBackend | null = null;
let read = false;

/**
 * Binds the document's backend. Once, before the first read: a second binding, or one after the
 * editor read the default, throws, so one document never runs two backends.
 */
export function bindEditorBackend(backend: EditorBackend): void {
  if (bound !== null) throw new Error('The editor backend is already bound for this document');
  if (read) throw new Error('The editor backend was read before it was bound');
  bound = backend;
}

/** The document's backend: the bound one, else the server's. */
export function editorBackend(): EditorBackend {
  read = true;
  return bound ?? serverBackend;
}
