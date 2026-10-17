// The drop bus (the realtime round, docs/REALTIME.md 3.6): one message per cache row an instance
// must forget, carried between the instances of a deployment. Every hosted tier before this round
// kept its per instance caches (the access record, the deck index row with the link grants and
// the typed name, the room's resolved identity) behind 5 s TTLs with a process local bus, so a
// link minted on one instance answered 404 on the next for up to 5 s and a departed guest's name
// flipped between the label and the typed name on a reload (audit-sync.md defects 7 and 8). The
// bus names the row and never carries the value: a subscriber drops its row and the next read
// fetches the store. One implementation: in process (the memory tier, and the shape every test
// runs). The blob tier has none and keeps its TTLs (`RealtimeChannel.bus` is optional). No `node:`.

/** The rows a message can name. `principal` is declared for the principal records; on this tree no instance caches them. */
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
