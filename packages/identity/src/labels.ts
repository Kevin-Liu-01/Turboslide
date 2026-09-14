// The anonymous label (gslides-parity SPEC-3 4.1; research 11 section 4): `<Material> <NNN>`,
// a word from a closed list of 64 material and element nouns the theme owns and a number from
// 100 to 999 outside a deny list, both derived from sha256(principalId). The space is 64 by 895,
// 57,280 labels. Two people with one label in one deck are told apart by their marks and by a
// display only "(2)" suffix ordered by first appearance (disambiguateLabels). A label is a pure
// function of the principal id, so version history renders the same label the roster showed,
// and Forget this browser gives a new id and therefore a new label (11 4.4).
//
// The list is Turboslide's own: no animals (Google's list is unverified and must not be copied),
// no given names, no word that needs translation to read as neutral. Words rejected and why are
// recorded in research 11 4.1. The LDNOOBW test in labels.test.ts keeps every word off the deny
// list; the given name check against the SSA data of 11 4.1 has not run (b3.md, stage 1).
import { digestUint32, sha256 } from './sha256.ts';

export const LABEL_WORDS: readonly string[] = [
  'Ink',
  'Paper',
  'Titanium',
  'Graphite',
  'Carbon',
  'Basalt',
  'Granite',
  'Quartz',
  'Cobalt',
  'Zinc',
  'Nickel',
  'Copper',
  'Steel',
  'Iron',
  'Tin',
  'Pewter',
  'Marble',
  'Linen',
  'Cotton',
  'Felt',
  'Vellum',
  'Foil',
  'Glass',
  'Mica',
  'Shale',
  'Clay',
  'Brass',
  'Bronze',
  'Chrome',
  'Nylon',
  'Cork',
  'Wax',
  'Resin',
  'Enamel',
  'Lacquer',
  'Gesso',
  'Plaster',
  'Cement',
  'Gravel',
  'Pumice',
  'Tungsten',
  'Vanadium',
  'Chromium',
  'Manganese',
  'Platinum',
  'Palladium',
  'Iridium',
  'Osmium',
  'Rhodium',
  'Bismuth',
  'Gallium',
  'Indium',
  'Tantalum',
  'Niobium',
  'Lithium',
  'Magnesium',
  'Silicon',
  'Boron',
  'Argon',
  'Neon',
  'Krypton',
  'Xenon',
  'Helium',
  'Silica',
];

/** Numbers never used in a label (research 11 4.2). Two digit numbers are outside the range. */
export const DENIED_NUMBERS: readonly number[] = [187, 311, 420, 666, 911];

/** The 895 allowed numbers, ascending. */
export const LABEL_NUMBERS: readonly number[] = (() => {
  const denied = new Set(DENIED_NUMBERS);
  const out: number[] = [];
  for (let n = 100; n <= 999; n += 1) if (!denied.has(n)) out.push(n);
  return out;
})();

/** The size of the label space: 64 words by 895 numbers. */
export const LABEL_SPACE = LABEL_WORDS.length * LABEL_NUMBERS.length;

export type LabelParts = { word: string; number: number };

/** The word and number for a principal id: digest bytes 0 to 3 choose the word, 4 to 7 the number. */
export function labelPartsFor(principalId: string): LabelParts {
  const digest = sha256(principalId);
  const word = LABEL_WORDS[digestUint32(digest, 0) % LABEL_WORDS.length] ?? 'Ink';
  const number = LABEL_NUMBERS[digestUint32(digest, 4) % LABEL_NUMBERS.length] ?? 100;
  return { word, number };
}

/** The generated label, for example "Titanium 471". */
export function labelFor(principalId: string): string {
  const { word, number } = labelPartsFor(principalId);
  return `${word} ${number}`;
}

const LABEL_GRAMMAR = new RegExp(`^(${LABEL_WORDS.join('|')}) [1-9][0-9]{2}$`, 'i');
const WORDS_LOWER = new Set(LABEL_WORDS.map((w) => w.toLowerCase()));

/** True for a list word alone, in any case, so no typed name can be one (11 4.5). */
export function isLabelWord(text: string): boolean {
  return WORDS_LOWER.has(text.trim().toLowerCase());
}

/** True for `<Word> <NNN>` in any case, the generated grammar (11 4.5). */
export function matchesLabelGrammar(text: string): boolean {
  return LABEL_GRAMMAR.test(text.trim().replace(/\s+/g, ' '));
}

/**
 * Display labels for a set of principals in order of first appearance: the second principal
 * with a label already shown gets " (2)", the third " (3)". Display only, never stored (11 4.3).
 */
export function disambiguateLabels(
  principalIds: readonly string[],
  label: (principalId: string) => string = labelFor,
): Map<string, string> {
  const out = new Map<string, string>();
  const seen = new Map<string, number>();
  for (const id of principalIds) {
    if (out.has(id)) continue;
    const base = label(id);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    out.set(id, count === 1 ? base : `${base} (${count})`);
  }
  return out;
}
