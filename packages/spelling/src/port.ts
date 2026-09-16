// The spelling port (gslides-parity SPEC-5 7.2; R10 4.5, 4.9): the one shape the spell check
// card, the `spelling.check` handler and the `text/spelling` lint rule call, answered by the
// Worker on the client (`client.ts` over `worker.ts`) and by Node on the CLI, the MCP server and
// the hosted studio (`node.ts`). Every member is data; the walk over a deck is `walk.ts`.

/** One Text of a deck the walk reads: a block's pointer, a slide field (no blockId), the notes or an alt text. */
export type SpellingTarget = {
  slideId: string;
  blockId?: string;
  /** the pointer inside the block (`/text`, `/items/2/text`, `/rows/1/cells/0/text`), `/notes`, `/alt` or a slide field */
  path: string;
  /** the markup as stored; `plain` is what the checker reads */
  text: string;
  plain: string;
  kind: 'text' | 'notes' | 'alt' | 'field';
};

/** One misspelling with its plain range, the word and up to five suggestions (SPEC-5 13 `spelling.check`). */
export type Misspelling = {
  slideId: string;
  blockId?: string;
  path: string;
  range: [number, number];
  word: string;
  suggestions: string[];
};

export type SpellCheckRequest = {
  /** the BCP 47 tag the dictionary is chosen for */
  language: string;
  targets: ReadonlyArray<SpellingTarget>;
  /** words never reported: the personal dictionary, the deck's nouns, the session's Ignore all set */
  ignore?: ReadonlyArray<string>;
};

export type SpellCheckAnswer = {
  language: string;
  /** the dictionary tag that answered, or null when the language has none (the browser's marks apply) */
  dictionary: string | null;
  misspellings: Misspelling[];
};

/** What a checker offers; `addWord` teaches the loaded engines a word for the rest of the session. */
export type SpellingPort = {
  check: (request: SpellCheckRequest) => Promise<SpellCheckAnswer>;
  addWord?: (word: string) => Promise<void>;
  /** stops the Worker or frees the engines; optional */
  dispose?: () => void;
};

/** The engine the walk queries (nspell wrapped once in `engine.ts`). */
export type SpellEngine = {
  correct: (word: string) => boolean;
  /** up to `max` suggestions, the best first */
  suggest: (word: string, max?: number) => string[];
  add: (word: string) => void;
};
