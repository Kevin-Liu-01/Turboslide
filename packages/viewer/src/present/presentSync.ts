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

/**
 * Version 2 (gslides-parity SPEC-5 2.2): `state` gains `step` and `steps`, `goto` gains `step`,
 * and the `media`, `mediaControl`, `stroke` and `strokesClear` messages join. A round four window
 * on version 1 drops every frame of this version, so two builds never half understand each other.
 */
export const PRESENT_PROTOCOL = 2;

export type PresentRole = 'audience' | 'presenter';

/** A playing medium's facts (gslides-parity SPEC-5 2.2; R11 5.6), the audience's `media` message. */
export type PresentMediaState = {
  blockId: string;
  state: 'playing' | 'paused' | 'ended';
  positionMs: number;
  durationMs: number | null;
  title?: string;
};

/** One pen stroke in sheet pixels (SPEC-5 0.15, 2.2): the points as they were drawn. */
export type PresentStroke = {
  slideId: string;
  /** flat pairs, x0, y0, x1, y1, in sheet px of the deck's page */
  points: number[];
  /** the stroke is finished; a partial stroke grows with more messages of the same id */
  done: boolean;
  id: string;
};

export type PresentMessageBody =
  /** a window arrived; the audience answers with its state */
  | { type: 'hello' }
  /**
   * The audience window's facts, sent on hello and on every change. Round five adds the step
   * reached on the slide and the slide's step count (SPEC-5 2.2), so the presenter's counter
   * reads "Step 2 of 4" and its next preview knows what the next click shows.
   */
  | {
      type: 'state';
      slideId: string;
      index: number;
      total: number;
      blank: BlankSlide | null;
      laser: boolean;
      step?: number;
      steps?: number;
    }
  /** move to a slide, and to a step of it (SPEC-5 2.2); both roles send it, each follows the other's */
  | { type: 'goto'; slideId: string; step?: number }
  /** the presenter asks the audience window to leave (or enter) the show: view.present */
  | { type: 'present'; on: boolean }
  /** a medium changed state in the audience window (R11 5.6) */
  | { type: 'media'; media: PresentMediaState }
  /** the presenter drives a medium of the audience window (R11 5.6) */
  | { type: 'mediaControl'; blockId: string; action: 'play' | 'pause' | 'restart' }
  /** the pen drew on the show; every other window mirrors the stroke (SPEC-5 0.15) */
  | { type: 'stroke'; stroke: PresentStroke }
  /** the pen was cleared (Esc, a slide change) */
  | { type: 'strokesClear'; slideId: string }
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
const TYPES: ReadonlySet<string> = new Set([
  'hello',
  'state',
  'goto',
  'present',
  'media',
  'mediaControl',
  'stroke',
  'strokesClear',
  'bye',
]);
const MEDIA_STATES: ReadonlySet<string> = new Set(['playing', 'paused', 'ended']);
const MEDIA_ACTIONS: ReadonlySet<string> = new Set(['play', 'pause', 'restart']);

function isMediaState(value: unknown): value is PresentMediaState {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.blockId === 'string' &&
    typeof record.state === 'string' &&
    MEDIA_STATES.has(record.state) &&
    typeof record.positionMs === 'number' &&
    (record.durationMs === null || typeof record.durationMs === 'number') &&
    (record.title === undefined || typeof record.title === 'string')
  );
}

function isStroke(value: unknown): value is PresentStroke {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.slideId === 'string' &&
    typeof record.id === 'string' &&
    typeof record.done === 'boolean' &&
    Array.isArray(record.points) &&
    record.points.length % 2 === 0 &&
    record.points.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

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
      if (record.step !== undefined && typeof record.step !== 'number') return null;
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
      if (record.step !== undefined && typeof record.step !== 'number') return null;
      if (record.steps !== undefined && typeof record.steps !== 'number') return null;
      break;
    case 'present':
      if (typeof record.on !== 'boolean') return null;
      break;
    case 'media':
      if (!isMediaState(record.media)) return null;
      break;
    case 'mediaControl':
      if (typeof record.blockId !== 'string') return null;
      if (typeof record.action !== 'string' || !MEDIA_ACTIONS.has(record.action)) return null;
      break;
    case 'stroke':
      if (!isStroke(record.stroke)) return null;
      break;
    case 'strokesClear':
      if (typeof record.slideId !== 'string') return null;
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
