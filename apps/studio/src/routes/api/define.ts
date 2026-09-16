import { createFileRoute } from '@tanstack/react-router';

import { safeFetch } from '@turboslide/headless/capture/shared';
import { HOSTED_ALLOW_HOSTS } from '@turboslide/headless/capture/shared';

// GET /api/define?word=<term>&language=<tag> (gslides-parity SPEC-5 7.4, 0.37; R10 8.2; P1 5.11):
// the studio's proxy over the Wiktionary REST definition endpoint
// `https://<ll>.wiktionary.org/api/rest_v1/page/definition/<term>` through `safeFetch` (the host
// added to the allow list for this route alone, a User-Agent naming Turboslide, the HTML of each
// definition stripped to text, a 24 hour cache per word and language). The answer is the shape
// `dictionary.lookup` carries: `{ word, url, definitions: [{ partOfSpeech, definitions }],
// attribution }` (CC BY-SA). Under `TURBOSLIDE_DICTIONARY=link` (the checkout default without
// egress) the route answers the address alone with `definitions` absent, and the row opens the
// page in a new tab. Pronunciation, synonyms and antonyms are not in the endpoint and are not
// answered. `defineWord` is the function the hosted dispatcher composes into the spelling lane's
// `define` port (apps/cli/src/actions/spelling.ts DefinePort).

/** The attribution line the panel prints (the site's licence statement, R10 8.1). */
export const WIKTIONARY_ATTRIBUTION = 'Definitions from Wiktionary, CC BY-SA 4.0';

/** How long a definition stays cached in this instance (SPEC-5 7.4 "a 24 hour cache"). */
export const DEFINE_CACHE_MS = 24 * 60 * 60 * 1000;

/** The Wiktionary editions the proxy reaches: the primary subtags of the offered languages. */
export const WIKTIONARY_EDITIONS: ReadonlyArray<string> = [
  'en',
  'es',
  'fr',
  'nl',
  'pt',
  'de',
  'it',
];

export type Definition = { partOfSpeech: string; definitions: string[] };
export type DefineAnswer = {
  word: string;
  url: string;
  definitions?: Definition[];
  attribution?: string;
};

/**
 * The provider switch (SPEC-5 7.4, 17 row 32; docs/hosting.md): `TURBOSLIDE_DICTIONARY=panel`
 * proxies the definitions, `link` answers the address alone; unset, a hosted instance (Vercel)
 * proxies and a checkout links, the checkout default without egress.
 */
export function dictionaryMode(env: NodeJS.ProcessEnv = process.env): 'link' | 'panel' {
  const value = env['TURBOSLIDE_DICTIONARY'];
  if (value === 'panel') return 'panel';
  if (value === 'link') return 'link';
  return env['VERCEL'] !== undefined ? 'panel' : 'link';
}

/** The edition of a language tag: its primary subtag when Wiktionary has one, English otherwise. */
export function editionOf(language: string): string {
  const primary = language.split('-')[0]?.toLowerCase() ?? 'en';
  return WIKTIONARY_EDITIONS.includes(primary) ? primary : 'en';
}

/** The page a word has in an edition. */
export function wiktionaryPage(word: string, language: string): string {
  return `https://${editionOf(language)}.wiktionary.org/wiki/${encodeURIComponent(word.trim().replace(/\s+/gu, '_'))}`;
}

/** The REST definition endpoint of a word in an edition. */
export function wiktionaryEndpoint(word: string, language: string): string {
  return `https://${editionOf(language)}.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word.trim().replace(/\s+/gu, '_'))}`;
}

/** HTML stripped to text: tags removed, entities decoded, whitespace folded. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/gu, '')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim();
}

type RestEntry = {
  partOfSpeech?: string;
  language?: string;
  definitions?: { definition?: string }[];
};

/** The REST body reduced to the panel's entries: the language's own entries first, HTML stripped, empty rows dropped. */
export function parseDefinitions(body: unknown, language: string): Definition[] {
  if (body === null || typeof body !== 'object') return [];
  const record = body as Record<string, RestEntry[]>;
  const primary = editionOf(language);
  const keys = Object.keys(record).sort((a, b) => (a === primary ? -1 : b === primary ? 1 : 0));
  const out: Definition[] = [];
  for (const key of keys) {
    const entries = record[key];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const definitions = (entry.definitions ?? [])
        .map((row) => stripHtml(row.definition ?? ''))
        .filter((text) => text !== '');
      if (definitions.length === 0) continue;
      out.push({
        partOfSpeech: entry.partOfSpeech ?? 'Entry',
        definitions: definitions.slice(0, 8),
      });
    }
  }
  return out.slice(0, 12);
}

/**
 * The fetch the proxy hands `safeFetch` (R10 8.1, unverified rate limits and User-Agent policy;
 * measured on 2026-09-15: the endpoint answers 403 without a descriptive User-Agent and 200 with
 * one). An injected fetch skips the pinned lookup (shared.ts: the range check runs on literal
 * addresses only); a `headers` member on `SafeFetchOptions` would keep the pin (b5.md request 14).
 */
export const WIKTIONARY_USER_AGENT =
  'Turboslide/1 (https://turboslide.vercel.app; the Dictionary panel)';

export const wiktionaryFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    headers: {
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
      'user-agent': WIKTIONARY_USER_AGENT,
      accept: 'application/json',
    },
  });

const cache = new Map<string, { at: number; answer: DefineAnswer }>();

/**
 * The definitions of a word in a language: the cache, else one `safeFetch` of the REST endpoint
 * with the edition's host allowed for this call; a miss (404, a body without entries, a network
 * refusal) answers the address alone so the panel still offers the page.
 */
export async function defineWord(
  word: string,
  language: string,
  options: { fetchImpl?: typeof fetch; now?: () => number; mode?: 'link' | 'panel' } = {},
): Promise<DefineAnswer> {
  const trimmed = word.trim();
  const url = wiktionaryPage(trimmed, language);
  if ((options.mode ?? dictionaryMode()) === 'link' || trimmed === '')
    return { word: trimmed, url };
  const key = `${editionOf(language)}:${trimmed.toLowerCase()}`;
  const now = options.now?.() ?? Date.now();
  const cached = cache.get(key);
  if (cached !== undefined && now - cached.at < DEFINE_CACHE_MS) return cached.answer;
  let answer: DefineAnswer = { word: trimmed, url };
  try {
    const endpoint = wiktionaryEndpoint(trimmed, language);
    const { bytes } = await safeFetch(endpoint, {
      allowHosts: [...HOSTED_ALLOW_HOSTS, `${editionOf(language)}.wiktionary.org`],
      hosted: true,
      timeoutMs: 8000,
      maxBytes: 512 * 1024,
      fetchImpl: options.fetchImpl ?? wiktionaryFetch,
    });
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const definitions = parseDefinitions(body, language);
    if (definitions.length > 0)
      answer = { word: trimmed, url, definitions, attribution: WIKTIONARY_ATTRIBUTION };
  } catch {
    // the page link is the answer when the endpoint is unreachable or has no entry
  }
  cache.set(key, { at: now, answer });
  return answer;
}

/** Empties the cache; the tests call it. */
export function clearDefineCache(): void {
  cache.clear();
}

export const Route = createFileRoute('/api/define')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const word = (url.searchParams.get('word') ?? '').trim();
        const language = url.searchParams.get('language') ?? 'en-US';
        if (word === '' || word.length > 64 || !/^[\p{L}\p{M}\p{N}' -]+$/u.test(word))
          return new Response(JSON.stringify({ error: 'word must be 1 to 64 letters' }), {
            status: 400,
            headers: { 'content-type': 'application/json; charset=utf-8' },
          });
        if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/u.test(language))
          return new Response(JSON.stringify({ error: 'language must be a BCP 47 tag' }), {
            status: 400,
            headers: { 'content-type': 'application/json; charset=utf-8' },
          });
        const answer = await defineWord(word, language);
        return new Response(JSON.stringify(answer), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'public, max-age=86400',
          },
        });
      },
    },
  },
});
