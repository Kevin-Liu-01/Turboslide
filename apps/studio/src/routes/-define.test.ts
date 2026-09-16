import { describe, expect, it } from 'vitest';

import {
  WIKTIONARY_ATTRIBUTION,
  clearDefineCache,
  defineWord,
  dictionaryMode,
  editionOf,
  parseDefinitions,
  stripHtml,
  wiktionaryEndpoint,
  wiktionaryPage,
} from './api/define.ts';

// The dictionary proxy (gslides-parity SPEC-5 7.4, 0.37; R10 8): the provider switch, the edition
// of a tag, the REST body reduced to the panel's entries with the HTML stripped, the cache and the
// link fallback, all through an injected fetch so no test reaches the network.

const body = {
  en: [
    {
      partOfSpeech: 'Noun',
      language: 'English',
      definitions: [
        { definition: 'An <a href="/wiki/item">item</a> of a &quot;presentation&quot;.' },
        { definition: '' },
        { definition: 'A <span>playground</span>&nbsp;chute.' },
      ],
    },
    { partOfSpeech: 'Verb', definitions: [{ definition: 'To move smoothly.' }] },
  ],
  fr: [{ partOfSpeech: 'Nom', definitions: [{ definition: 'Une diapositive.' }] }],
};

describe('the provider switch and the addresses', () => {
  it('links on a checkout, proxies hosted or when asked', () => {
    expect(dictionaryMode({})).toBe('link');
    expect(dictionaryMode({ VERCEL: '1' })).toBe('panel');
    expect(dictionaryMode({ TURBOSLIDE_DICTIONARY: 'link', VERCEL: '1' })).toBe('link');
    expect(dictionaryMode({ TURBOSLIDE_DICTIONARY: 'panel' })).toBe('panel');
  });
  it('reads the edition from the tag and builds the two addresses', () => {
    expect(editionOf('en-US')).toBe('en');
    expect(editionOf('pt-BR')).toBe('pt');
    expect(editionOf('xx')).toBe('en');
    expect(wiktionaryPage('two words', 'fr')).toBe('https://fr.wiktionary.org/wiki/two_words');
    expect(wiktionaryEndpoint('slide', 'en-US')).toBe(
      'https://en.wiktionary.org/api/rest_v1/page/definition/slide',
    );
  });
});

describe('the body', () => {
  it('strips the HTML, drops empty rows and puts the language’s own entries first', () => {
    expect(stripHtml('An <a href="x">item</a> of a &quot;show&quot;&nbsp;here.')).toBe(
      'An item of a "show" here.',
    );
    expect(parseDefinitions(body, 'fr')).toEqual([
      { partOfSpeech: 'Nom', definitions: ['Une diapositive.'] },
      {
        partOfSpeech: 'Noun',
        definitions: ['An item of a "presentation".', 'A playground chute.'],
      },
      { partOfSpeech: 'Verb', definitions: ['To move smoothly.'] },
    ]);
    expect(parseDefinitions(null, 'en')).toEqual([]);
    expect(parseDefinitions({ en: 'x' }, 'en')).toEqual([]);
  });
});

describe('defineWord', () => {
  it('answers the definitions through the injected fetch once and the link alone in link mode', async () => {
    clearDefineCache();
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const first = await defineWord('slide', 'en-US', { fetchImpl, mode: 'panel', now: () => 1000 });
    expect(first.url).toBe('https://en.wiktionary.org/wiki/slide');
    expect(first.definitions?.[0]?.partOfSpeech).toBe('Noun');
    expect(first.attribution).toBe(WIKTIONARY_ATTRIBUTION);
    const second = await defineWord('Slide', 'en-US', {
      fetchImpl,
      mode: 'panel',
      now: () => 2000,
    });
    expect(second).toEqual(first);
    expect(calls).toBe(1);
    expect(await defineWord('slide', 'en-US', { fetchImpl, mode: 'link' })).toEqual({
      word: 'slide',
      url: 'https://en.wiktionary.org/wiki/slide',
    });
  });
  it('answers the link alone when the endpoint refuses', async () => {
    clearDefineCache();
    const fetchImpl: typeof fetch = async () => new Response('forbidden', { status: 403 });
    expect(await defineWord('nothing', 'en-US', { fetchImpl, mode: 'panel' })).toEqual({
      word: 'nothing',
      url: 'https://en.wiktionary.org/wiki/nothing',
    });
  });
});
