import type { AgentBrand } from '@turboslide/chrome/presence/agent-marks';
import type { HueSlot } from '@turboslide/identity/hues';
import { markSpec } from '@turboslide/identity/marks';
import type { ResolvedIdentity } from '@turboslide/identity/resolve';
import type { Entry, RoomEvent } from '@turboslide/realtime/channel';
import { fakeRoomServer } from '@turboslide/realtime/client/fake-transport';
import type { FakeIdentity, FakeRoomServer } from '@turboslide/realtime/client/fake-transport';
import { memoryPendingStore } from '@turboslide/realtime/client/pending-store';
import { memoryChannel } from '@turboslide/realtime/memory';
import type { MemoryChannel } from '@turboslide/realtime/memory';
import { CAPABILITIES } from '@turboslide/schema/access';
import type { DeckDocument } from '@turboslide/schema/deck';
import type { Author, Lease, Version } from '@turboslide/schema/mutations';
import { spriteMarkup } from '@turboslide/theme/sprite';

import type { EditorBackend, TabOnly } from '../editor/backend';
import { TabOnlyError } from '../editor/backend';
import type { IdStorage } from '../editor/client-ids';
import type { EditorDeck, EditorIdentity } from '../server/write';
import { tabComments } from './tab-comments';

/**
 * The editor's backend in the landing's live editor (docs/SITE.md D3, C.3, C.4): the room runs in
 * the tab. The tab room is the realtime package's room server over a memory channel
 * (`fakeRoomServer` over `memoryChannel`, which import nothing from Node), with the same
 * transform, reducer, roster and presence the studio's memory tier runs; the visitor's editor and
 * the two agents are three clients of it. A checkpoint follows two seconds after the last op (ten
 * at most while ops keep coming), so the revision moves and Version history has rows. Comments are
 * kept in memory (tab-comments.ts), the version rows too, and the unsent queue's mirror is memory
 * alone. Nothing is written to the server, no deck id reaches the store, and a reload starts from
 * the shipped deck. What needs the server answers `TabOnly.sentence` (docs/SITE.md D10).
 */

/** One of the room's people: the visitor, or an agent. */
export type TabPerson = {
  author: Author & { principalId: string };
  role: 'owner' | 'editor';
  trust: 'label' | 'agent';
  /** the chrome's live hue, 1 to 6 */
  hue: HueSlot;
  /** an agent's brand mark (agent-marks.tsx): such an agent draws like a person (docs/SITE.md D5) */
  brand?: AgentBrand;
};

export type TabRoom = {
  deckId: string;
  server: FakeRoomServer;
  channel: MemoryChannel;
  /** every entry of the stream, oldest first */
  entries: () => Promise<Entry[]>;
  /** the version rows Version history lists */
  versions: () => readonly Version[];
  /** commits now (the tests; the runner's tidy wait) */
  checkpoint: () => Promise<void>;
  stop: () => void;
};

export type TabBackendOptions = {
  deckId: string;
  document: DeckDocument;
  people: readonly TabPerson[];
  tabOnly: TabOnly;
  /** a navigation away from the editor (the page around the frame on /try) */
  openPage: (path: string, newTab?: boolean) => void;
  /** how long after the last op the room checkpoints */
  checkpointIdleMs?: number;
  /** the longest a checkpoint waits while ops keep coming */
  checkpointMaxMs?: number;
  /**
   * Where the document's asset paths resolve: the hero deck's pictures are static files of the
   * site (hero-deck.ts HERO_ASSET_BASE), since no store holds a tab's deck; `/decks/<id>/` unless set.
   */
  assetBase?: string;
};

export type TabBackend = {
  backend: EditorBackend;
  room: TabRoom;
  /** the editor payload one person opens the presentation with */
  payloadFor: (person: TabPerson) => EditorDeck;
  /** lets one more person into the room (a visitor of the title's stacks, guests.ts) */
  join: (person: TabPerson) => void;
};

/** The identity a person resolves to, as the studio's room resolves a principal (identity/resolve.ts). */
function resolvedOf(person: TabPerson): ResolvedIdentity {
  return {
    principalId: person.author.principalId,
    kind: person.trust === 'agent' ? 'agent' : 'anonymous',
    displayName: person.author.name,
    label: person.trust === 'agent' ? 'Agent' : person.author.name,
    trust: person.trust,
    avatar: { variant: 'initials' },
    deleted: false,
    admin: false,
  };
}

/** The roster's mark of a person: the identity package's spec, with the brand an agent carries. */
export function tabMarkOf(person: TabPerson, self = false): Record<string, unknown> {
  return {
    ...markSpec(resolvedOf(person), { hueSlot: person.hue, self }),
    ...(person.brand === undefined ? {} : { brand: person.brand }),
  };
}

function identityOf(person: TabPerson, self = false): EditorIdentity {
  return {
    principalId: person.author.principalId,
    label: person.author.name,
    trust: person.trust,
    kind: person.trust === 'agent' ? 'agent' : 'anonymous',
    mark: tabMarkOf(person, self) as EditorIdentity['mark'],
  };
}

function fakeIdentityOf(person: TabPerson): FakeIdentity {
  return {
    principalId: person.author.principalId,
    label: person.author.name,
    role: person.role,
    author: person.author,
    trust: person.trust,
    kind: person.trust === 'agent' ? 'agent' : 'human',
    mark: tabMarkOf(person),
    hueSlot: person.hue - 1,
  };
}

/** A Storage-like object in memory: each client of the tab keeps its own client ids. */
function memoryIds(): IdStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

export function createTabBackend(options: TabBackendOptions): TabBackend {
  const { deckId, tabOnly } = options;
  const idleMs = options.checkpointIdleMs ?? 2000;
  const maxMs = options.checkpointMaxMs ?? 10_000;
  const channel = memoryChannel();
  const versions: Version[] = [];
  /* the entries a checkpoint covers, told by the room before it moves the revision */
  let covered: Entry[] = [];
  const server = fakeRoomServer({
    deckId,
    channel,
    document: options.document,
    onCheckpoint: (entries) => {
      covered = entries;
    },
  });
  const people = new Map(options.people.map((person) => [person.author.principalId, person]));
  /* everyone the room has let in, in order: the payload names them all */
  const everyone = (): TabPerson[] => [...people.values()];
  const ids = new Map<string, IdStorage>();
  const comments = tabComments(() => server.document());
  const refuse = (): never => {
    throw new TabOnlyError(tabOnly.sentence);
  };
  const refusing = async (): Promise<never> => refuse();

  // the checkpointer: two seconds after the last op, ten at most while ops keep coming
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let firstOpAt: number | null = null;
  let stopped = false;
  let checkpointing: Promise<void> = Promise.resolve();
  const checkpoint = (): Promise<void> => {
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    idleTimer = undefined;
    firstOpAt = null;
    checkpointing = checkpointing.then(async () => {
      covered = [];
      await server.checkpoint();
      const edits = covered.filter((entry) => entry.kind === 'edit');
      const last = edits[edits.length - 1];
      if (last === undefined) return;
      versions.push({
        n: versions.length + 1,
        revision: server.document().deck.revision,
        author: last.author,
        note: last.note ?? '',
        createdAt: new Date().toISOString(),
        mutations: [],
      });
    });
    return checkpointing;
  };
  const unsubscribe = channel.subscribe(deckId, (event: RoomEvent) => {
    if (stopped || event.type !== 'op' || event.entry.kind !== 'edit') return;
    const now = Date.now();
    firstOpAt ??= now;
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    const wait = Math.max(0, Math.min(idleMs, firstOpAt + maxMs - now));
    idleTimer = setTimeout(() => void checkpoint().catch(() => undefined), wait);
  });

  const entries = async (): Promise<Entry[]> => {
    const head = await channel.head(deckId);
    return head === 0 ? [] : channel.since(deckId, 0, head);
  };

  const payloadOf = (person: TabPerson | null): EditorDeck => {
    const document = server.document();
    return {
      deckId,
      document,
      issues: [],
      ok: true,
      sprite: spriteMarkup(),
      versions: [...versions],
      leases: [],
      hosting: {
        store: 'tmp',
        reason: 'The presentation lives in this browser tab.',
        persistent: false,
        blob: false,
        seed: null,
        notice: null,
        decksDir: '',
      },
      assistMode: 'off',
      room: { seq: server.seq(), tier: 'memory', notice: null },
      ...(person === null ? {} : { identity: identityOf(person, true) }),
      identities: Object.fromEntries(
        everyone().map((row) => [row.author.principalId, identityOf(row)]),
      ),
      role: person?.role ?? 'owner',
      via: 'owner',
      capabilities: [...CAPABILITIES],
      auth: {
        signIn: false,
        email: false,
        passkeys: false,
        passkeysNotice: null,
        github: false,
        google: false,
        mail: 'off',
      },
    };
  };
  const visitor = options.people.find((person) => person.trust !== 'agent') ?? null;

  /** a comment or notification action, then the room's comment entry so every client re-reads */
  const runAction = async (input: {
    deckId: string;
    action: string;
    input: unknown;
    author: Author;
  }): Promise<unknown> => {
    if (!input.action.startsWith('comment.') && !input.action.startsWith('notification.')) refuse();
    const answer = comments.run(input.action, input.input, input.author);
    const op = comments.takeOp();
    if (op !== null) {
      const head = await channel.head(deckId);
      await channel.append(deckId, head, [
        {
          rev: server.document().deck.revision,
          kind: 'comment',
          author: input.author,
          clientId: 'server',
          opId: `server:${crypto.randomUUID()}`,
          comment: op,
          at: new Date().toISOString(),
        },
      ]);
    }
    return answer;
  };

  const backend: EditorBackend = {
    kind: 'tab',
    readEditorDeck: async () => payloadOf(visitor),
    writeDeck: refusing,
    listVersions: async () => [...versions],
    saveVersion: async ({ author, note }) => {
      await checkpoint();
      const version: Version = {
        n: versions.length + 1,
        revision: server.document().deck.revision,
        author,
        note,
        createdAt: new Date().toISOString(),
        mutations: [],
      };
      versions.push(version);
      return version;
    },
    leaseSlide: async ({ slideId, author, minutes }): Promise<Lease> => ({
      slideId,
      holder: author,
      until: new Date(Date.now() + (minutes ?? 10) * 60_000).toISOString(),
    }),
    heldOpIds: async ({ opIds }) => {
      const held = new Set((await entries()).map((entry) => entry.opId));
      return { held: opIds.filter((id) => held.has(id)) };
    },
    holdDraft: () => () => undefined,
    roomTransport: (_deckId, _tab, _facts, author) => {
      const person = people.get(author.principalId ?? '');
      if (person === undefined) throw new RangeError(`${author.name} is not in this room`);
      return server.transportFor(fakeIdentityOf(person));
    },
    pendingStore: () => memoryPendingStore(),
    idStorage: (author) => {
      const key = author.principalId ?? author.name;
      let storage = ids.get(key);
      if (storage === undefined) {
        storage = memoryIds();
        ids.set(key, storage);
      }
      return storage;
    },
    assetBase: (id) => options.assetBase ?? `/decks/${id}/`,
    createNewDeck: refusing,
    listDecks: refusing,
    readSourceDeckSlides: refusing,
    restoreStoredDeck: refusing,
    runDeckAction: (input) => runAction(input),
    runDeckActionDetailed: async (input) => ({ output: await runAction(input), created: false }),
    exportCapabilities: async () => ({
      downloads: false,
      worker: 'http',
      sync: false,
      batchSize: 60,
    }),
    startExport: refusing,
    pollExport: refusing,
    syncExport: refusing,
    runBatchedExport: refusing,
    runBuild: refusing,
    signDownload: refusing,
    bundleDownloadTicket: refusing,
    bundleUploadTicket: refusing,
    connectFacts: refusing,
    lintSlides: async () => [],
    renderSlideImages: refusing,
    /* the editor's filmstrip and grid draw clones (SPEC-4 0.30); nothing in the tab reads a
       capture cache, so the warm answers that nothing was rendered */
    warmThumbnails: async () => ({
      revision: server.document().deck.revision,
      ready: [],
      failed: [],
      rendered: 0,
      cached: 0,
      ms: 0,
    }),
    assistPost: refusing,
    presignUpload: refusing,
    authPost: refusing,
    attachesSession: false,
    recordsRecent: false,
    openPage: options.openPage,
    tabOnly,
  };

  const room: TabRoom = {
    deckId,
    server,
    channel,
    entries,
    versions: () => versions,
    checkpoint,
    stop: () => {
      stopped = true;
      if (idleTimer !== undefined) clearTimeout(idleTimer);
      unsubscribe();
    },
  };
  return {
    backend,
    room,
    payloadFor: (person) => payloadOf(person),
    join: (person) => {
      people.set(person.author.principalId, person);
    },
  };
}
