import type { BlankSlide } from './presentModel';

/**
 * The channel between the slideshow window and the presenter window (gslides-parity SPEC 9.1,
 * 9.3; docs/spec/SPEC.md 6.10): `BroadcastChannel('turboslide:<deckId>')` with `localStorage` as
 * the fallback. Both windows hold the deck in memory and exchange slide ids only, so the show
 * keeps working with no network after load (R07 rule 29). The audience window reports its state
 * and follows `goto`; the presenter window says hello, follows the audience's moves and sends
 * `goto` for its own; `view.goto` in either window moves both because each publishes what it did.
 * The environment is injectable so the protocol is unit tested without a browser. Version 2
 * (HTML-SLIDES-DESIGN 2.6) adds the slide clock's steps: `state` carries the step shown and the
 * slide's step count, and `goto` may name a step, so each window follows the other's clicks; a
 * version 1 window is ignored. A state names the presenter move it answers (`reply`: the latest
 * `goto` the audience had applied when it drew that state), so a presenter with a newer move in
 * flight can tell a late answer from a current one (`createMoveTracker`; the presenter audit of
 * a95d4097d, item 1).
 */

export const PRESENT_PROTOCOL = 2;

export type PresentRole = 'audience' | 'presenter';

/** A `goto` named by its sender's window id and the sequence number of its envelope. */
export type PresentReply = { to: string; seq: number };

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
      /** the slide clock's step shown (0 before the first click) and the slide's click steps */
      step: number;
      steps: number;
      /**
       * the latest `goto` the audience had applied when it drew this state, null before any; a
       * window that predates the field sends none
       */
      reply?: PresentReply | null;
    }
  /** move to a slide, at the state after `step` when given (its start when absent); each role follows the other's */
  | { type: 'goto'; slideId: string; step?: number }
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
  /** sends one message; returns its sequence number, 0 once the channel is closed */
  post: (body: PresentMessageBody) => number;
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
      if (record.step !== undefined && !isStep(record.step)) return null;
      break;
    case 'state':
      if (
        typeof record.slideId !== 'string' ||
        typeof record.index !== 'number' ||
        typeof record.total !== 'number' ||
        typeof record.laser !== 'boolean' ||
        !(record.blank === null || record.blank === 'black' || record.blank === 'white') ||
        !isStep(record.step) ||
        !isStep(record.steps) ||
        !(record.reply === undefined || record.reply === null || isReply(record.reply))
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

function isReply(value: unknown): value is PresentReply {
  if (typeof value !== 'object' || value === null) return false;
  const reply = value as Record<string, unknown>;
  return (
    typeof reply.to === 'string' &&
    typeof reply.seq === 'number' &&
    Number.isInteger(reply.seq) &&
    reply.seq > 0
  );
}

function isStep(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10_000;
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
  onMessage: (message: PresentEnvelope) => void,
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
      if (closed) return 0;
      seq += 1;
      send({ ...body, from: id, role, v: PRESENT_PROTOCOL, at: now(), seq });
      return seq;
    },
    close() {
      if (closed) return;
      closed = true;
      dispose();
    },
  };
}

/**
 * How long a presenter move holds back the audience states that answer no move of this window (a
 * state from a window that predates `reply`, or from an audience that never received the move):
 * after it, they are followed again, so the presenter cannot stop following for good.
 */
export const MOVE_ANSWER_MS = 2000;

/** The presenter's record of its own move in flight; `follows` decides each audience state. */
export type MoveTracker = {
  /** a `goto` this window posted, by the sequence number `post` returned */
  sent: (seq: number) => void;
  /** whether to follow a state of the audience window */
  follows: (state: { reply?: PresentReply | null }) => boolean;
};

/**
 * The reply rule of the presenter window (the presenter audit of a95d4097d, item 1). The presenter
 * moves at once and posts `goto`; the audience applies it and answers with a state whose `reply`
 * names it. Until the latest move is answered, the states the audience sends describe it before
 * that move: a late answer to an older press, or an earlier state still on its way. Following one
 * put the presenter back a slide or a step, and on a slide with click steps its next press then
 * asked for a step the audience already showed, which the audience dropped. So while a move is in
 * flight, an answer to an older move of this window is never followed, a state that answers no
 * move of this window waits out `holdMs`, and the answer to the latest move (or a later one) ends
 * the hold; from then on every state is followed, the audience's own moves included.
 */
export function createMoveTracker(
  id: string,
  options: { now?: () => number; holdMs?: number } = {},
): MoveTracker {
  const now = options.now ?? (() => Date.now());
  const holdMs = options.holdMs ?? MOVE_ANSWER_MS;
  let pending = 0;
  let sentAt = 0;
  return {
    sent(seq) {
      if (seq <= 0) return;
      pending = seq;
      sentAt = now();
    },
    follows(state) {
      if (pending === 0) return true;
      const reply = state.reply;
      if (reply !== undefined && reply !== null && reply.to === id) {
        if (reply.seq < pending) return false;
        pending = 0;
        return true;
      }
      if (now() - sentAt < holdMs) return false;
      pending = 0;
      return true;
    },
  };
}
