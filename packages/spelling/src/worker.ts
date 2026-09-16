// The spell check Worker (gslides-parity SPEC-5 7.2; R10 4.4): the dictionary of a tag fetched
// from `/dictionaries/<tag>/index.aff.gz` and `index.dic.gz` (the gzip bytes stored on disk so
// every host serves the measured bytes, b5.md 1.4 decision 2), inflated through
// `DecompressionStream('gzip')`, parsed once by nspell, then `check` requests answered off the
// main thread so a 300 slide deck never blocks paint. The message shapes are `WorkerRequest` and
// `WorkerReply`; `client.ts` speaks them from the page. The module runs only inside a Worker: the
// guard at the bottom keeps a test import from touching `self`.
import type { CorrectionTable } from './engine.ts';
import { createSpellEngine, decodeDictionary } from './engine.ts';
import { dictionaryUrls, isDictionaryTag } from './index.ts';
import type { DictionaryTag } from './index.ts';
import type { SpellCheckAnswer, SpellCheckRequest, SpellEngine } from './port.ts';
import { findMisspellings, ignoreSet } from './walk.ts';

export type WorkerRequest =
  | { id: number; kind: 'load'; tag: string; base?: string; corrections?: CorrectionTable }
  | { id: number; kind: 'check'; request: SpellCheckRequest; tag: string | null }
  | { id: number; kind: 'add'; word: string }
  | { id: number; kind: 'ignore'; words: string[] };

export type WorkerReply =
  | { id: number; ok: true; kind: 'load'; tag: string }
  | { id: number; ok: true; kind: 'check'; answer: SpellCheckAnswer }
  | { id: number; ok: true; kind: 'add' | 'ignore' }
  | { id: number; ok: false; error: string };

/** The bytes of a gzip response inflated; the fetch of a static file under the studio's origin. */
export async function fetchInflated(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  const response = await fetchImpl(url);
  if (!response.ok || response.body === null) throw new Error(`${url} answered ${response.status}`);
  const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The Worker's state: the engines per tag and the words ignored for the session. */
export function createWorkerState(fetchImpl: typeof fetch = fetch) {
  const engines = new Map<DictionaryTag, SpellEngine>();
  const added: string[] = [];
  const ignored = new Set<string>();
  let corrections: CorrectionTable = {};
  const load = async (
    tag: string,
    base?: string,
    table?: CorrectionTable,
  ): Promise<DictionaryTag> => {
    if (!isDictionaryTag(tag)) throw new Error(`No dictionary for ${tag}`);
    if (table !== undefined) corrections = table;
    if (engines.has(tag)) return tag;
    const urls = dictionaryUrls(tag, base);
    const [aff, dic] = await Promise.all([
      fetchInflated(urls.aff, fetchImpl),
      fetchInflated(urls.dic, fetchImpl),
    ]);
    engines.set(
      tag,
      createSpellEngine(
        { aff: decodeDictionary(aff), dic: decodeDictionary(dic) },
        { corrections, personal: added },
      ),
    );
    return tag;
  };
  const handle = async (message: WorkerRequest): Promise<WorkerReply> => {
    switch (message.kind) {
      case 'load': {
        const tag = await load(message.tag, message.base, message.corrections);
        return { id: message.id, ok: true, kind: 'load', tag };
      }
      case 'check': {
        const { request, tag } = message;
        if (tag === null || !isDictionaryTag(tag))
          return {
            id: message.id,
            ok: true,
            kind: 'check',
            answer: { language: request.language, dictionary: null, misspellings: [] },
          };
        const engine = engines.get(tag) ?? engines.get(await load(tag));
        if (engine === undefined) throw new Error(`${tag} is not loaded`);
        const ignore = ignoreSet([...ignored], request.ignore);
        return {
          id: message.id,
          ok: true,
          kind: 'check',
          answer: {
            language: request.language,
            dictionary: tag,
            misspellings: findMisspellings(request.targets, engine, { ignore }),
          },
        };
      }
      case 'add': {
        if (message.word.trim() !== '') {
          added.push(message.word.trim());
          for (const engine of engines.values()) engine.add(message.word);
        }
        return { id: message.id, ok: true, kind: 'add' };
      }
      case 'ignore': {
        for (const word of message.words) ignored.add(word);
        return { id: message.id, ok: true, kind: 'ignore' };
      }
    }
  };
  return { handle, engines, ignored };
}

type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (reply: WorkerReply) => void;
};

/** Binds the state to a Worker scope; called once at the bottom when the module runs inside a Worker. */
export function attachWorker(scope: WorkerScope, fetchImpl: typeof fetch = fetch): void {
  const state = createWorkerState(fetchImpl);
  scope.onmessage = (event) => {
    const message = event.data;
    state
      .handle(message)
      .then((reply) => scope.postMessage(reply))
      .catch((error: unknown) =>
        scope.postMessage({
          id: message.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
  };
}

const scope = globalThis as unknown as {
  WorkerGlobalScope?: unknown;
  importScripts?: unknown;
} & Partial<WorkerScope>;
if (typeof scope.importScripts === 'function' && typeof scope.postMessage === 'function') {
  attachWorker(scope as WorkerScope);
}
