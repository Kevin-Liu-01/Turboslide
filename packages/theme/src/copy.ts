// The copy lists (SPEC 5.1): the proper nouns and the product tokens the sentence-case and
// token-first rules consult (DECK-GRAMMAR.md:22), the metaphor candidates (DECK-GRAMMAR.md:23),
// and the characters the copy rules forbid. The linter in @turboslide/lint reads these; a deck may
// extend the noun list from deck.json (SPEC open question 13).

/**
 * Capitalized as written, wherever they appear in a heading (DECK-GRAMMAR.md:22). "Turboslide"
 * joins the list in round four (gslides-parity SPEC-4 1.2; R01 6.1 item 4): one word, one
 * capital, so the sentence case lint keeps it in a heading.
 */
export const PROPER_NOUNS = [
  'General Translation',
  'Prototemplate',
  'Glyphfield',
  'Locadex',
  'Inter',
  'Heroicons',
  'Turboslide',
] as const;

/** Product tokens keep their exact form and never open a heading (DECK-GRAMMAR.md:22; slide 14). */
export const PRODUCT_TOKENS = [
  'gt-next',
  'gt-react',
  'gt-vue',
  'gt-node',
  'gt-python',
  'gt',
  'npx',
  'CLI',
  'API',
] as const;

/** Words the copy judge reads as metaphor candidates; the linter flags them at severity 1. */
export const METAPHOR_WORDS = [
  'journey',
  'unlock',
  'unlocks',
  'supercharge',
  'supercharges',
  'empower',
  'empowers',
  'seamless',
  'seamlessly',
  'effortless',
  'game-changer',
  'game-changing',
  'revolutionize',
  'leverage',
  'unleash',
  'elevate',
  'north star',
  'delight',
] as const;

export const EM_DASH = '—';
export const EN_DASH = '–';
export const EXCLAMATION = '!';

/** A heading is a name, never a URL (DECK-GRAMMAR.md:22). */
export const DOMAIN_PATTERN = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|dev|io|ai|org|net|app|co)\b/i;

/** "X, not Y": a `not` followed by a comma clause, for the copy judge (SPEC 7.7 copy/contrast-pair). */
export const CONTRAST_PAIR_PATTERN = /,\s*not\s+\w|\bnot\s+[^,.]+,\s/i;

/** Block types where a standalone GT stays letters (gt-mark-in-text.js exclusions: code and panels). */
export const GT_WORD_EXCLUDED_BLOCK_TYPES = ['panel', 'html'] as const;

/** Words allowed to carry a capital after the first word of a sentence-case heading. */
export function allowedCapitals(extra: ReadonlyArray<string> = []): Set<string> {
  const out = new Set<string>();
  for (const noun of [...PROPER_NOUNS, ...extra]) {
    for (const word of noun.split(/\s+/)) out.add(word);
  }
  for (const token of PRODUCT_TOKENS) out.add(token);
  out.add('GT');
  return out;
}

/**
 * Words after the first that start with a capital and are not proper nouns, tokens, acronyms of
 * two to four capitals, or the first word of a sentence after a period. Empty for sentence case.
 */
export function wordsOutsideSentenceCase(
  heading: string,
  extraNouns: ReadonlyArray<string> = [],
): string[] {
  const allowed = allowedCapitals(extraNouns);
  let text = heading;
  for (const noun of [...PROPER_NOUNS, ...extraNouns]) text = text.split(noun).join(' ');
  const words = text.split(/\s+/).filter((word) => word !== '');
  const out: string[] = [];
  let sentenceStart = true;
  for (const word of words) {
    const bare = word.replace(/^[("'“‘]+|[)"'”’:;,.?]+$/g, '');
    if (bare === '') continue;
    if (!sentenceStart && /^[A-Z]/.test(bare) && !allowed.has(bare) && !/^[A-Z]{2,4}$/.test(bare))
      out.push(bare);
    sentenceStart = /[.?]$/.test(word);
  }
  return out;
}

/** True when a heading opens with a product token (DECK-GRAMMAR.md:22). */
export function startsWithProductToken(heading: string): boolean {
  const first =
    heading
      .trim()
      .split(/\s+/)[0]
      ?.replace(/[,.:;]+$/, '') ?? '';
  return (PRODUCT_TOKENS as ReadonlyArray<string>).includes(first);
}

/** The metaphor words present in a text, lower-cased, in order. */
export function metaphorCandidates(text: string): string[] {
  const lower = text.toLowerCase();
  return METAPHOR_WORDS.filter((word) =>
    new RegExp(`\\b${word.replace(/[-\s]/g, '[-\\\\s]')}\\b`).test(lower),
  );
}
