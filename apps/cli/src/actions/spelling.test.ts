import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionContext } from '@turboslide/agent/dispatch';
import type { DeckDocument } from '@turboslide/schema/deck';
import { memoryPreferencesStore } from '@turboslide/schema/preferences';
import { plainOf } from '@turboslide/schema/text';
import { openFileStore } from '@turboslide/store/file-store';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { SpellingLaneDeps, SpellingLanePort, SpellingOccurrence } from './spelling.ts';
import {
  noPreferencesStore,
  noSpellingPort,
  registerSpellingActions,
  replacementMutation,
  wiktionaryUrl,
} from './spelling.ts';

// spelling.check, spelling.replace, dictionary.add, remove, list and lookup through the dispatcher
// (gslides-parity SPEC-5 7.2, 7.4, 13; R10 4.9, 8) over a scratch copy of the gslides fixture.
// The engine is a table here (the Node port over nspell is packages/spelling's, tested there):
// the handlers' business is the document walk they hand the port, the one write of a replacement,
// the record writes of the dictionary and the link fallback of the lookup.

const REPO = resolve(import.meta.dirname, '../../../..');
const FIXTURE = join(REPO, 'decks/fixture/gslides');
const context: ActionContext = { author: { kind: 'human', name: 'Maya' } };

let dir: string;
let deps: SpellingLaneDeps;

/** A port that reports the word `numbering` wherever it appears and finds its occurrences by hand. */
function tablePort(): SpellingLanePort & { requests: unknown[] } {
  const requests: unknown[] = [];
  const findAll = (document: DeckDocument, word: string): SpellingOccurrence[] => {
    const out: SpellingOccurrence[] = [];
    for (const [slideId, slide] of Object.entries(document.slides)) {
      if (slide.kind !== 'content') continue;
      for (const blocks of Object.values(slide.slots))
        for (const block of blocks) {
          const text = (block as { text?: string }).text;
          if (typeof text !== 'string') continue;
          const plain = plainOf(text);
          let at = plain.indexOf(word);
          while (at >= 0) {
            out.push({ slideId, blockId: block.id, path: '/text', range: [at, at + word.length] });
            at = plain.indexOf(word, at + word.length);
          }
        }
    }
    return out;
  };
  return {
    requests,
    async check(request) {
      requests.push(request);
      const found = findAll(request.document, 'numbering').filter(
        (row) => request.slideIds === undefined || request.slideIds.includes(row.slideId),
      );
      return {
        language: request.language,
        dictionary: request.language.startsWith('en') ? 'en' : null,
        misspellings: request.ignore?.includes('numbering')
          ? []
          : found.map((row) => ({
              ...row,
              word: 'numbering',
              suggestions: ['numbering', 'a', 'b', 'c', 'd', 'e', 'f'],
            })),
      };
    },
    occurrences: findAll,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'turboslide-spelling-actions-'));
  cpSync(join(FIXTURE, 'deck.json'), join(dir, 'deck.json'));
  cpSync(join(FIXTURE, 'slides'), join(dir, 'slides'), { recursive: true });
  deps = {
    store: openFileStore({ dir }),
    preferences: memoryPreferencesStore(),
    spelling: tablePort(),
  } as unknown as SpellingLaneDeps;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function dispatcherWith(lane: SpellingLaneDeps) {
  const dispatcher = createDispatcher();
  registerSpellingActions(dispatcher, lane);
  return dispatcher;
}

describe('spelling.check', () => {
  test('walks the named slides with the deck language and the personal dictionary, five suggestions at most', async () => {
    const dispatcher = dispatcherWith(deps);
    const answer = (await dispatcher.dispatch(
      'spelling.check',
      { slideIds: ['bullets'] },
      context,
    )) as {
      language: string;
      misspellings: { word: string; suggestions: string[]; slideId: string; blockId?: string }[];
    };
    expect(answer.language).toBe('en-US');
    expect(answer.misspellings.length).toBe(1);
    expect(answer.misspellings[0]).toMatchObject({
      slideId: 'bullets',
      blockId: 'h',
      word: 'numbering',
    });
    expect(answer.misspellings[0]?.suggestions.length).toBe(5);
    const request = (
      deps.spelling as SpellingLanePort & {
        requests: { slideIds?: string[]; language: string; ignore?: string[] }[];
      }
    ).requests[0];
    expect(request?.slideIds).toEqual(['bullets']);
    expect(request?.ignore).toEqual([]);
  });
  test('passes the personal dictionary as the ignore list and honours a language override', async () => {
    await deps.preferences!.save({
      ...(await deps.preferences!.load()),
      spelling: { underline: true, dictionary: ['numbering'] },
    });
    const dispatcher = dispatcherWith(deps);
    const answer = (await dispatcher.dispatch('spelling.check', { language: 'fr' }, context)) as {
      language: string;
      misspellings: unknown[];
    };
    expect(answer.language).toBe('fr');
    expect(answer.misspellings).toEqual([]);
  });
  test('a dispatcher without the engine answers the sentence', async () => {
    const dispatcher = dispatcherWith({ ...deps, spelling: undefined });
    await expect(dispatcher.dispatch('spelling.check', {}, context)).rejects.toThrow(
      noSpellingPort('spelling.check'),
    );
  });
});

describe('spelling.replace', () => {
  test('writes one text.splice for the range and every occurrence under all in one write', async () => {
    const dispatcher = dispatcherWith(deps);
    const before = await deps.store.revision();
    const one = (await dispatcher.dispatch(
      'spelling.replace',
      {
        slideId: 'bullets',
        blockId: 'h',
        path: '/text',
        range: [12, 21],
        text: 'counting',
        baseRevision: before,
      },
      context,
    )) as {
      replacements: number;
      revision: number;
      slide: { slots: { left: { text?: string }[] } };
    };
    expect(one.replacements).toBe(1);
    expect(one.revision).toBe(before + 1);
    expect(one.slide.slots.left[0]?.text).toBe('Bullets and counting');
    const records = await deps.store.records();
    expect(records[records.length - 1]?.mutations).toEqual([
      {
        op: 'text.splice',
        slideId: 'bullets',
        blockId: 'h',
        path: '/text',
        at: 12,
        remove: 9,
        insert: 'counting',
      },
    ]);
  });
  test('refuses a range outside the text and answers zero replacements on a stale base with nothing to do', async () => {
    const dispatcher = dispatcherWith(deps);
    const revision = await deps.store.revision();
    await expect(
      dispatcher.dispatch(
        'spelling.replace',
        {
          slideId: 'bullets',
          blockId: 'h',
          path: '/text',
          range: [0, 99],
          text: 'x',
          baseRevision: revision,
        },
        context,
      ),
    ).rejects.toThrow(RangeError);
  });
  test('the notes and a title field take slide.set through replacementMutation', () => {
    const document = {
      deck: { revision: 1 },
      slides: {
        t: { id: 't', kind: 'title', heading: 'Teh *cover*', lead: 'x', notes: 'a teh note' },
      },
    } as unknown as DeckDocument;
    expect(
      replacementMutation(document, { slideId: 't', path: '/heading', range: [0, 3] }, 'The'),
    ).toEqual({
      op: 'slide.set',
      slideId: 't',
      path: '/heading',
      value: 'The *cover*',
    });
    expect(
      replacementMutation(document, { slideId: 't', path: '/notes', range: [2, 5] }, 'the'),
    ).toEqual({
      op: 'slide.set',
      slideId: 't',
      path: '/notes',
      value: 'a the note',
    });
    expect(
      replacementMutation(document, { slideId: 't', path: '/notes', range: [2, 50] }, 'the'),
    ).toBeNull();
  });
});

describe('the personal dictionary', () => {
  test('add, list and remove write the record, sorted and unique, and the file port beside it', async () => {
    const file: string[] = ['zebra'];
    const lane: SpellingLaneDeps = {
      ...deps,
      dictionaryFile: { read: () => file, write: (words) => file.splice(0, file.length, ...words) },
    };
    const dispatcher = dispatcherWith(lane);
    expect(await dispatcher.dispatch('dictionary.add', { word: 'Turboslide' }, context)).toEqual({
      dictionary: ['Turboslide', 'zebra'],
    });
    expect(await dispatcher.dispatch('dictionary.add', { word: 'Turboslide' }, context)).toEqual({
      dictionary: ['Turboslide', 'zebra'],
    });
    expect(await dispatcher.dispatch('dictionary.add', { word: 'Locadex' }, context)).toEqual({
      dictionary: ['Locadex', 'Turboslide', 'zebra'],
    });
    expect((await lane.preferences!.load()).spelling.dictionary).toEqual(['Locadex', 'Turboslide']);
    expect(file).toEqual(['zebra', 'Turboslide', 'Locadex']);
    expect(await dispatcher.dispatch('dictionary.remove', { word: 'Turboslide' }, context)).toEqual(
      {
        dictionary: ['Locadex', 'zebra'],
      },
    );
    expect(await dispatcher.dispatch('dictionary.list', {}, context)).toEqual({
      dictionary: ['Locadex', 'zebra'],
    });
    await expect(
      dispatcher.dispatch('dictionary.add', { word: 'two words' }, context),
    ).rejects.toThrow(TypeError);
  });
  test('a dispatcher without the record answers the sentence', async () => {
    const dispatcher = dispatcherWith({ ...deps, preferences: undefined });
    await expect(dispatcher.dispatch('dictionary.list', {}, context)).rejects.toThrow(
      noPreferencesStore('dictionary.list'),
    );
  });
});

describe('dictionary.lookup', () => {
  test('answers the Wiktionary page of the deck language, and the definitions when the port has them', async () => {
    expect(wiktionaryUrl('presentation', 'en-US')).toBe(
      'https://en.wiktionary.org/wiki/presentation',
    );
    expect(wiktionaryUrl('apresentação', 'pt-BR')).toBe(
      'https://pt.wiktionary.org/wiki/apresenta%C3%A7%C3%A3o',
    );
    expect(wiktionaryUrl('two words', 'fr')).toBe('https://fr.wiktionary.org/wiki/two_words');
    const link = dispatcherWith(deps);
    expect(await link.dispatch('dictionary.lookup', { word: 'slide' }, context)).toEqual({
      word: 'slide',
      url: 'https://en.wiktionary.org/wiki/slide',
    });
    const withDefinitions = dispatcherWith({
      ...deps,
      define: async (word, language) => ({
        definitions: [{ partOfSpeech: 'Noun', definitions: [`${word} in ${language}`] }],
        attribution: 'Definitions from Wiktionary, CC BY-SA 4.0',
      }),
    });
    expect(
      await withDefinitions.dispatch(
        'dictionary.lookup',
        { word: 'slide', language: 'fr' },
        context,
      ),
    ).toEqual({
      word: 'slide',
      url: 'https://fr.wiktionary.org/wiki/slide',
      definitions: [{ partOfSpeech: 'Noun', definitions: ['slide in fr'] }],
      attribution: 'Definitions from Wiktionary, CC BY-SA 4.0',
    });
    await expect(link.dispatch('dictionary.lookup', {}, context)).rejects.toThrow(/needs a word/);
  });
});
