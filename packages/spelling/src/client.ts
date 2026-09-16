// The page side of the spell check Worker (gslides-parity SPEC-5 7.2; R10 4.4): a `SpellingPort`
// that posts `WorkerRequest` messages and resolves each reply by its id, loading a dictionary the
// first time a language asks for it. The Worker is made by the caller (`new Worker(new URL(
// '@turboslide/spelling/worker', import.meta.url), { type: 'module' })` in the studio), so this
// module never names a bundler or a URL. A Worker that fails to construct answers every check
// with `dictionary: null`, the same answer a language without a dictionary gets.
import type { CorrectionTable } from './engine.ts';
import { dictionaryTagFor } from './index.ts';
import type { SpellCheckAnswer, SpellCheckRequest, SpellingPort } from './port.ts';
import type { WorkerReply, WorkerRequest } from './worker.ts';

export type WorkerLike = {
  postMessage: (message: WorkerRequest) => void;
  onmessage: ((event: MessageEvent<WorkerReply>) => void) | null;
  onerror?: ((event: unknown) => void) | null;
  terminate: () => void;
};

/** A request before its id is minted; distributive over the union so each kind keeps its members. */
type WithoutId<T> = T extends { id: number } ? Omit<T, 'id'> : never;

export type WorkerSpellingOptions = {
  /** the folder the dictionaries are served from; `/dictionaries` when absent */
  base?: string;
  /** the correction list whose fix ranks first among the suggestions */
  corrections?: CorrectionTable;
};

/** The port over a Worker the caller constructs; `create` may throw or return null when Workers are unavailable. */
export function workerSpelling(
  create: () => WorkerLike | null,
  options: WorkerSpellingOptions = {},
): SpellingPort {
  let worker: WorkerLike | null | undefined;
  let next = 1;
  const waiting = new Map<
    number,
    { resolve: (reply: WorkerReply) => void; reject: (error: Error) => void }
  >();
  const loaded = new Set<string>();
  const start = (): WorkerLike | null => {
    if (worker !== undefined) return worker;
    try {
      worker = create();
    } catch {
      worker = null;
    }
    if (worker !== null) {
      worker.onmessage = (event) => {
        const reply = event.data;
        const entry = waiting.get(reply.id);
        if (entry === undefined) return;
        waiting.delete(reply.id);
        entry.resolve(reply);
      };
      worker.onerror = () => {
        for (const entry of waiting.values()) entry.reject(new Error('The spelling worker failed'));
        waiting.clear();
      };
    }
    return worker;
  };
  const send = (message: WithoutId<WorkerRequest>): Promise<WorkerReply> => {
    const target = start();
    if (target === null) return Promise.reject(new Error('No spelling worker'));
    const id = next;
    next += 1;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      target.postMessage({ ...message, id } as WorkerRequest);
    });
  };
  return {
    async check(request: SpellCheckRequest): Promise<SpellCheckAnswer> {
      const tag = dictionaryTagFor(request.language);
      const none: SpellCheckAnswer = {
        language: request.language,
        dictionary: null,
        misspellings: [],
      };
      if (tag === null || start() === null) return none;
      try {
        if (!loaded.has(tag)) {
          const reply = await send({
            kind: 'load',
            tag,
            ...(options.base === undefined ? {} : { base: options.base }),
            ...(options.corrections === undefined ? {} : { corrections: options.corrections }),
          });
          if (!reply.ok) throw new Error(reply.error);
          loaded.add(tag);
        }
        const reply = await send({ kind: 'check', request, tag });
        if (!reply.ok) throw new Error(reply.error);
        return reply.kind === 'check' ? reply.answer : none;
      } catch {
        return none;
      }
    },
    async addWord(word: string): Promise<void> {
      if (start() === null) return;
      await send({ kind: 'add', word }).catch(() => undefined);
    },
    dispose() {
      worker?.terminate();
      worker = undefined;
      loaded.clear();
      waiting.clear();
    },
  };
}
