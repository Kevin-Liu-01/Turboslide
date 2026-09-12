import type { BlankSlide } from './presentModel';

/**
 * The channel between the slideshow window and the presenter window (gslides-parity SPEC 9.1,
 * 9.3; docs/spec/SPEC.md 6.10): `BroadcastChannel('turboslide:<deckId>')` with `localStorage` as
 * the fallback. Both windows hold the deck in memory and exchange slide ids only, so the show
 * keeps working with no network after load (R07 rule 29). The audience window reports its state
 * and follows `goto`; the presenter window says hello, follows the audience's moves and sends
 * `goto` for its own; `view.goto` in either window moves both because each publishes what it did.
 * The environment is injectable so the protocol is unit tested without a browser.
 */

export const PRESENT_PROTOCOL = 1;

export type PresentRole = 'audience' | 'presenter';

export type PresentMessageBody =
  /** a window arrived; the audience answers with its state */
  | { type: 'hello' }
  /** the audience window's facts, sent on hello and on every change */
  | {
      type: 'state';
      slideId: string;
      index: number;
      total: number;
      blank: BlankSlide | null;
      laser: boolean;
    }
  /** move to a slide; both roles send it, each follows the other's */
  | { type: 'goto'; slideId: string }
  /** the presenter asks the audience window to leave (or enter) the show: view.present */
  | { type: 'present'; on: boolean }
  /** a window is closing */
  | { type: 'bye' };

export type PresentMessage = PresentMessageBody & { from: string; role: PresentRole };

/** What travels: the message, the protocol version, a clock and a sequence number so a repeat differs. */
export type PresentEnvelope = PresentMessage & {
  v: typeof PRESENT_PROTOCOL;
  at: number;
  seq: number;
};

export function presentChannelName(deckId: string): string {
  return `turboslide:${deckId}`;
}

export function presentStorageKey(deckId: string): string {
  return `turboslide:present:${deckId}`;
}

/** The subset of BroadcastChannel the channel needs (method signatures, so the DOM class fits). */
export type BroadcastLike = {
  postMessage: (message: unknown) => void;
  close: () => void;
  addEventListener: (type: 'message', listener: (event: { data: unknown }) => void) => void;
};

export type StorageLike = {
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export type StorageEventLike = { key: string | null; newValue: string | null };

/** The globals the channel reads; the browser's by default, fakes in the tests. */
export type PresentChannelEnv = {
  BroadcastChannel?: new (name: string) => BroadcastLike;
  storage?: StorageLike;
  onStorage?: (listener: (event: StorageEventLike) => void) => () => void;
  now?: () => number;
  id?: () => string;
};

export type PresentChannel = {
  /** this window's id; messages it sent are dropped on the way back in */
  readonly id: string;
  readonly transport: 'broadcast' | 'storage' | 'none';
  post: (body: PresentMessageBody) => void;
  close: () => void;
};

const ROLES: ReadonlySet<string> = new Set(['audience', 'presenter']);
const TYPES: ReadonlySet<string> = new Set(['hello', 'state', 'goto', 'present', 'bye']);

/** The envelope a received value is, or null for anything else (another key, another version, noise). */
export function parsePresentEnvelope(data: unknown): PresentEnvelope | null {
  const value: unknown = typeof data === 'string' ? safeParse(data) : data;
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.v !== PRESENT_PROTOCOL) return null;
  if (typeof record.type !== 'string' || !TYPES.has(record.type)) return null;
  if (typeof record.from !== 'string' || typeof record.role !== 'string') return null;
  if (!ROLES.has(record.role)) return null;
  if (typeof record.at !== 'number' || typeof record.seq !== 'number') return null;
  switch (record.type) {
    case 'goto':
      if (typeof record.slideId !== 'string') return null;
      break;
    case 'state':
      if (
        typeof record.slideId !== 'string' ||
        typeof record.index !== 'number' ||
        typeof record.total !== 'number' ||
        typeof record.laser !== 'boolean' ||
        !(record.blank === null || record.blank === 'black' || record.blank === 'white')
      )
        return null;
      break;
    case 'present':
      if (typeof record.on !== 'boolean') return null;
      break;
    default:
      break;
  }
  return record as PresentEnvelope;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function browserEnv(): PresentChannelEnv {
  if (typeof window === 'undefined') return {};
  const env: PresentChannelEnv = {};
  if (typeof BroadcastChannel !== 'undefined') env.BroadcastChannel = BroadcastChannel;
  try {
    const storage = window.localStorage;
    env.storage = storage;
    env.onStorage = (listener) => {
      const handler = (event: StorageEvent) =>
        listener({ key: event.key, newValue: event.newValue });
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    };
  } catch {
    // storage refused (a private window with it disabled): BroadcastChannel alone, or nothing
  }
  return env;
}

/**
 * Opens the deck's channel for one window. `onMessage` receives every valid message from another
 * window; the window's own messages never come back. `post` fills in the sender and the envelope.
 */
export function openPresentChannel(
  deckId: string,
  role: PresentRole,
  onMessage: (message: PresentMessage) => void,
  env: PresentChannelEnv = browserEnv(),
): PresentChannel {
  const id = (env.id ?? randomId)();
  const now = env.now ?? (() => Date.now());
  let seq = 0;
  let closed = false;

  const receive = (data: unknown): void => {
    if (closed) return;
    const envelope = parsePresentEnvelope(data);
    if (envelope === null || envelope.from === id) return;
    onMessage(envelope);
  };

  let transport: PresentChannel['transport'] = 'none';
  let send: (envelope: PresentEnvelope) => void = () => undefined;
  let dispose: () => void = () => undefined;

  if (env.BroadcastChannel !== undefined) {
    const channel = new env.BroadcastChannel(presentChannelName(deckId));
    channel.addEventListener('message', (event) => receive(event.data));
    transport = 'broadcast';
    send = (envelope) => channel.postMessage(envelope);
    dispose = () => channel.close();
  } else if (env.storage !== undefined && env.onStorage !== undefined) {
    const key = presentStorageKey(deckId);
    const storage = env.storage;
    const stop = env.onStorage((event) => {
      if (event.key === key && event.newValue !== null) receive(event.newValue);
    });
    transport = 'storage';
    send = (envelope) => {
      try {
        storage.setItem(key, JSON.stringify(envelope));
      } catch {
        // the quota or a private window: the other window misses this one message
      }
    };
    dispose = stop;
  }

  return {
    id,
    transport,
    post(body) {
      if (closed) return;
      seq += 1;
      send({ ...body, from: id, role, v: PRESENT_PROTOCOL, at: now(), seq });
    },
    close() {
      if (closed) return;
      closed = true;
      dispose();
    },
  };
}
