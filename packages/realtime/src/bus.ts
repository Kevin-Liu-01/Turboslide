// The drop bus (the realtime round, docs/REALTIME.md 3.6): one message per cache row an instance
// must forget, carried between the instances of a deployment. Every hosted tier before this round
// kept its per instance caches (the access record, the deck index row with the link grants and
// the typed name, the room's resolved identity) behind 5 s TTLs with a process local bus, so a
// link minted on one instance answered 404 on the next for up to 5 s and a departed guest's name
// flipped between the label and the typed name on a reload (audit-sync.md defects 7 and 8). The
// bus names the row and never carries the value: a subscriber drops its row and the next read
// fetches the store. Two implementations: in process (the memory tier, and the shape every test
// runs), and `PUBLISH bus:<topic>` on the redis tier with one subscription per topic per instance.
// The blob tier has none and keeps its TTLs (`RealtimeChannel.bus` is optional). No `node:`.
import type { RedisCommands } from './redis.ts';

/** The rows a message can name. `principal` is declared for the records the kv principal store keeps; on this tree no instance caches them. */
export const DROP_TOPICS = ['access', 'link', 'identity', 'principal'] as const;
export type DropTopic = (typeof DROP_TOPICS)[number];

export function isDropTopic(value: unknown): value is DropTopic {
  return typeof value === 'string' && (DROP_TOPICS as ReadonlyArray<string>).includes(value);
}

/** An id on the bus: a deck id, a principal id or a request identity; bounded so a key never carries user text. */
const ID = /^[A-Za-z0-9_:.-]{1,128}$/;

export function checkDropId(id: string): string {
  if (typeof id !== 'string' || !ID.test(id))
    throw new TypeError(`${JSON.stringify(id)} is not an id the drop bus carries`);
  return id;
}

/** The channel a topic's messages travel on in Redis. */
export function dropChannel(topic: DropTopic): string {
  if (!isDropTopic(topic)) throw new TypeError(`${JSON.stringify(topic)} is not a drop topic`);
  return `bus:${topic}`;
}

export type DropListener = (id: string) => void;

export type DropBus = {
  /** tells every instance, this one included, to forget the row `id` of `topic` */
  publish: (topic: DropTopic, id: string) => Promise<void>;
  /** calls `fn` for every message of `topic`; the return value unsubscribes */
  subscribe: (topic: DropTopic, fn: DropListener) => () => void;
  /** ends every subscription */
  close: () => Promise<void>;
};

function deliver(listeners: Set<DropListener> | undefined, id: string): void {
  if (listeners === undefined) return;
  for (const listener of [...listeners]) {
    try {
      listener(id);
    } catch {
      // a listener that throws has its own error path; the others still hear the message
    }
  }
}

/** The bus of one process: a publish reaches this process's own listeners and nobody else. */
export function memoryDropBus(): DropBus {
  const listeners = new Map<DropTopic, Set<DropListener>>();
  return {
    async publish(topic, id) {
      deliver(listeners.get(topic), checkDropId(id));
    },
    subscribe(topic, fn) {
      if (!isDropTopic(topic)) throw new TypeError(`${JSON.stringify(topic)} is not a drop topic`);
      let set = listeners.get(topic);
      if (set === undefined) {
        set = new Set();
        listeners.set(topic, set);
      }
      set.add(fn);
      return () => {
        listeners.get(topic)?.delete(fn);
      };
    },
    async close() {
      listeners.clear();
    },
  };
}

export type RedisDropBusOptions = {
  /** where a subscription's failure is reported */
  onError?: (error: unknown, context: string) => void;
};

/**
 * The bus over Redis pub/sub: `PUBLISH bus:<topic> <id>`, one `SUBSCRIBE` per topic per instance
 * however many listeners, taken on the first listener and released with the last. A publish
 * reaches the publishing instance through Redis like every other, so a writer drops its own row
 * before it publishes (the readers do) and the message is the other instances' word. A dropped
 * message (pub/sub is fire and forget) leaves a row to its TTL, as before the round.
 */
export function redisDropBus(commands: RedisCommands, options: RedisDropBusOptions = {}): DropBus {
  const onError = options.onError ?? (() => {});
  const topics = new Map<
    DropTopic,
    { listeners: Set<DropListener>; unsubscribe: Promise<() => Promise<void>> }
  >();
  return {
    async publish(topic, id) {
      await commands.call('PUBLISH', dropChannel(topic), checkDropId(id));
    },
    subscribe(topic, fn) {
      const channel = dropChannel(topic);
      let row = topics.get(topic);
      if (row === undefined) {
        const listeners = new Set<DropListener>();
        const unsubscribe = commands.subscribe(channel, (message) => {
          if (!ID.test(message)) return;
          deliver(listeners, message);
        });
        unsubscribe.catch((error: unknown) =>
          onError(error, `bus: subscribing to ${channel} failed`),
        );
        row = { listeners, unsubscribe };
        topics.set(topic, row);
      }
      row.listeners.add(fn);
      return () => {
        const current = topics.get(topic);
        if (current === undefined) return;
        current.listeners.delete(fn);
        if (current.listeners.size === 0) {
          topics.delete(topic);
          void current.unsubscribe
            .then((stop) => stop())
            .catch((error: unknown) => onError(error, `bus: unsubscribing ${channel} failed`));
        }
      };
    },
    async close() {
      for (const [topic, row] of topics) {
        topics.delete(topic);
        try {
          await (
            await row.unsubscribe
          )();
        } catch {
          // closing anyway
        }
      }
    },
  };
}
