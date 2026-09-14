// The display name rules (gslides-parity SPEC-3 0.19, 7.2; research 10 F44; research 11 5.3), run
// on the server on every typed name (`account.setName`, the name prompt) and on the registered
// name of an agent token. In order:
//
//   1. NFC; refuse an unterminated bidi embedding, override or isolate (the Trojan Source
//      defence, UAX #9); strip every Cf and Default_Ignorable code point; collapse whitespace;
//      trim; refuse leading or trailing punctuation.
//   2. 1 to 40 code points with at least one letter or digit.
//   3. Every code point Identifier_Status=Allowed (UTS #39; fixtures/identifier-status.json),
//      or a space.
//   4. UTS #39 Moderately Restrictive: one script, or Latin with Han plus Hiragana and Katakana,
//      Han plus Bopomofo or Han plus Hangul, or Latin with one other Recommended script that is
//      not Cyrillic, Greek or Cherokee; and the mixed number check (digits from one system).
//   5. Reserved words compared by skeleton (fixtures/confusables.json) after case folding:
//      turboslide, admin, owner, agent, system, presenter, studio, anonymous, you, me, everyone,
//      the role words, `agent:` prefixes, every label word alone, the label grammar.
//   6. Per deck uniqueness by skeleton against the names the caller passes (the owner, the roster,
//      the version log): "That name is already in use in this presentation".
//   7. The LDNOOBW list for English plus the request's languages, a word boundary match.
//
// The three refusal sentences are data here and mirrored in packages/chrome menus/strings.ts
// (B6); no refusal names a role the person lacks or another person (SPEC-3 6.8).
//
// Names are text everywhere: the result is a plain string for React text nodes, `textContent`,
// `title` attributes and JSON; never for innerHTML, a URL, a CSS value or an SVG attribute.
import confusables from '../fixtures/confusables.json' with { type: 'json' };
import identifierStatus from '../fixtures/identifier-status.json' with { type: 'json' };
import ldnoobwEn from '../fixtures/ldnoobw-en.json' with { type: 'json' };
import ndZeros from '../fixtures/nd-zeros.json' with { type: 'json' };
import { LABEL_WORDS, matchesLabelGrammar } from './labels.ts';

export const NAME_MAX_CODE_POINTS = 40;

export type NameRefusalCode =
  | 'empty'
  | 'too_long'
  | 'no_letter'
  | 'bidi'
  | 'character'
  | 'punctuation'
  | 'mixed_script'
  | 'mixed_number'
  | 'reserved'
  | 'label'
  | 'blocked'
  | 'in_use';

export type NameResult =
  | { ok: true; name: string; skeleton: string }
  | { ok: false; code: NameRefusalCode; message: string };

/** The fixed sentences (SPEC-3 6.8): which one each code shows. */
export const NAME_REFUSALS = {
  reserved: 'That name is reserved',
  inUse: 'That name is already in use in this presentation',
  invalid: 'Use 1 to 40 letters or digits in one script',
} as const;

export type NormalizeNameOptions = {
  /** Names already held in the presentation, compared by skeleton (rule 6). */
  taken?: readonly string[];
  /** BCP 47 tags of the request, for the LDNOOBW lists beyond English (rule 7). */
  languages?: readonly string[];
};

// Rule 1: bidi controls. Embeddings and overrides close with PDF; isolates close with PDI.
const EMBEDDING_OPEN = new Set([0x202a, 0x202b, 0x202d, 0x202e]);
const ISOLATE_OPEN = new Set([0x2066, 0x2067, 0x2068]);
const PDF = 0x202c;
const PDI = 0x2069;

function hasUnterminatedBidi(text: string): boolean {
  let embeddings = 0;
  let isolates = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (EMBEDDING_OPEN.has(cp)) embeddings += 1;
    else if (cp === PDF) embeddings = Math.max(0, embeddings - 1);
    else if (ISOLATE_OPEN.has(cp)) isolates += 1;
    else if (cp === PDI) isolates = Math.max(0, isolates - 1);
  }
  return embeddings > 0 || isolates > 0;
}

const IGNORABLE = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;
const WHITESPACE = /\s+/gu;
const LETTER_OR_DIGIT = /[\p{L}\p{Nd}]/u;
const EDGE_PUNCTUATION = /^[\p{P}\p{S}]|[\p{P}\p{S}]$/u;

// Rule 3: Identifier_Status=Allowed as sorted inclusive ranges.
const ALLOWED: ReadonlyArray<readonly [number, number]> = identifierStatus.allowed as Array<
  [number, number]
>;

export function isIdentifierAllowed(codePoint: number): boolean {
  let lo = 0;
  let hi = ALLOWED.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const range = ALLOWED[mid];
    if (range === undefined) return false;
    if (codePoint < range[0]) hi = mid - 1;
    else if (codePoint > range[1]) lo = mid + 1;
    else return true;
  }
  return false;
}

// Rule 4: scripts. Recommended scripts of UAX #31 Table 5; Common and Inherited are ignored.
const RECOMMENDED_SCRIPTS = [
  'Arabic',
  'Armenian',
  'Bengali',
  'Bopomofo',
  'Cyrillic',
  'Devanagari',
  'Ethiopic',
  'Georgian',
  'Greek',
  'Gujarati',
  'Gurmukhi',
  'Han',
  'Hangul',
  'Hebrew',
  'Hiragana',
  'Kannada',
  'Katakana',
  'Khmer',
  'Lao',
  'Latin',
  'Malayalam',
  'Myanmar',
  'Oriya',
  'Sinhala',
  'Tamil',
  'Telugu',
  'Thaana',
  'Thai',
  'Tibetan',
] as const;
type Script = (typeof RECOMMENDED_SCRIPTS)[number];

const SCRIPT_TESTS: ReadonlyArray<readonly [Script, RegExp]> = RECOMMENDED_SCRIPTS.map(
  (script) => [script, new RegExp(`^\\p{Script_Extensions=${script}}$`, 'u')] as const,
);
const COMMON_OR_INHERITED = /^[\p{Script=Common}\p{Script=Inherited}]$/u;

/** The Recommended scripts a character belongs to by Script_Extensions; empty for Common. */
function scriptsOf(ch: string): { scripts: Script[]; common: boolean; recommended: boolean } {
  if (COMMON_OR_INHERITED.test(ch)) return { scripts: [], common: true, recommended: true };
  const scripts: Script[] = [];
  for (const [script, test] of SCRIPT_TESTS) if (test.test(ch)) scripts.push(script);
  return { scripts, common: false, recommended: scripts.length > 0 };
}

const HIGHLY_RESTRICTIVE_SETS: ReadonlyArray<ReadonlySet<Script>> = [
  new Set<Script>(['Latin', 'Han', 'Hiragana', 'Katakana']),
  new Set<Script>(['Latin', 'Han', 'Bopomofo']),
  new Set<Script>(['Latin', 'Han', 'Hangul']),
];
const NOT_WITH_LATIN = new Set<Script>(['Cyrillic', 'Greek']);

/**
 * UTS #39 restriction level check at Moderately Restrictive. Returns false for a character of
 * no Recommended script (Limited Use and Excluded scripts) and for a disallowed mixture.
 */
export function isModeratelyRestrictive(text: string): boolean {
  const sets: Script[][] = [];
  for (const ch of text) {
    const { scripts, common, recommended } = scriptsOf(ch);
    if (!recommended) return false;
    if (!common) sets.push(scripts);
  }
  if (sets.length === 0) return true;
  const covered = (allowed: ReadonlySet<Script>): boolean =>
    sets.every((set) => set.some((script) => allowed.has(script)));
  // Single script: one script covers every character.
  for (const script of RECOMMENDED_SCRIPTS) if (covered(new Set([script]))) return true;
  for (const set of HIGHLY_RESTRICTIVE_SETS) if (covered(set)) return true;
  for (const other of RECOMMENDED_SCRIPTS) {
    if (other === 'Latin' || NOT_WITH_LATIN.has(other)) continue;
    if (covered(new Set<Script>(['Latin', other]))) return true;
  }
  return false;
}

// Rule 4: the mixed number check. Each decimal digit system starts at a zero code point.
const ND_ZEROS: readonly number[] = ndZeros as number[];
const DECIMAL_DIGIT = /^\p{Nd}$/u;

function digitSystemOf(codePoint: number): number {
  let zero = -1;
  for (const z of ND_ZEROS) if (z <= codePoint && codePoint <= z + 9) zero = z;
  return zero;
}

export function hasMixedNumbers(text: string): boolean {
  const systems = new Set<number>();
  for (const ch of text) {
    if (!DECIMAL_DIGIT.test(ch)) continue;
    systems.add(digitSystemOf(ch.codePointAt(0) ?? 0));
    if (systems.size > 1) return true;
  }
  return false;
}

// Rule 5: the skeleton. UTS #39 section 4: NFD, map each code point through the confusables
// table, NFD again. Comparison folds case after the skeleton, so "0wner" and "OWNER" meet
// "owner" and a capital I meets a lower case l (the table maps I to l).
const CONFUSABLES: Readonly<Record<string, string>> = confusables.map as Record<string, string>;

export function skeleton(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFD')) {
    const mapped = CONFUSABLES[(ch.codePointAt(0) ?? 0).toString(16)];
    out += mapped ?? ch;
  }
  return out.normalize('NFD');
}

/** The case folded skeleton two names are compared by. */
export function comparisonKey(text: string): string {
  return skeleton(text).toLowerCase();
}

export const RESERVED_NAMES: readonly string[] = [
  'turboslide',
  'admin',
  'administrator',
  'owner',
  'agent',
  'system',
  'presenter',
  'studio',
  'anonymous',
  'you',
  'me',
  'everyone',
  'support',
  'moderator',
  'general translation',
  'editor',
  'commenter',
  'viewer',
  'guest',
];

const RESERVED_KEYS = new Set(RESERVED_NAMES.map(comparisonKey));
const AGENT_PREFIX_KEY = comparisonKey('agent:');

/** True when the name is a reserved word, an `agent:` prefix or a label word (rule 5). */
export function isReservedName(name: string): boolean {
  const key = comparisonKey(name);
  if (RESERVED_KEYS.has(key)) return true;
  if (key.startsWith(AGENT_PREFIX_KEY)) return true;
  for (const word of LABEL_WORDS) if (comparisonKey(word) === key) return true;
  return false;
}

// Rule 7: the LDNOOBW lists by language. English always applies.
const BLOCKLISTS: Readonly<Record<string, readonly string[]>> = { en: ldnoobwEn.words };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const BLOCK_PATTERNS = new Map<string, RegExp[]>();

function blockPatterns(language: string): RegExp[] {
  const cached = BLOCK_PATTERNS.get(language);
  if (cached) return cached;
  const words = BLOCKLISTS[language] ?? [];
  const patterns = words.map(
    (word) =>
      new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(comparisonKey(word))}([^\\p{L}\\p{N}]|$)`, 'u'),
  );
  BLOCK_PATTERNS.set(language, patterns);
  return patterns;
}

/** True when the skeleton of `name` holds a list entry as a whole word (rule 7). */
export function isBlockedName(name: string, languages: readonly string[] = []): boolean {
  const key = comparisonKey(name);
  const tags = new Set<string>(['en']);
  for (const tag of languages) {
    const primary = tag.toLowerCase().split('-')[0];
    if (primary) tags.add(primary);
  }
  for (const tag of tags)
    for (const pattern of blockPatterns(tag)) if (pattern.test(key)) return true;
  return false;
}

/**
 * The name rules of SPEC-3 0.19 over a typed name. On success the name is the string to store
 * and show; on refusal the code says which rule and `message` is the sentence the prompt shows.
 */
export function normalizeName(input: string, options: NormalizeNameOptions = {}): NameResult {
  const refuse = (code: NameRefusalCode): NameResult => ({
    ok: false,
    code,
    message:
      code === 'reserved' || code === 'label' || code === 'blocked'
        ? NAME_REFUSALS.reserved
        : code === 'in_use'
          ? NAME_REFUSALS.inUse
          : NAME_REFUSALS.invalid,
  });

  const nfc = input.normalize('NFC');
  if (hasUnterminatedBidi(nfc)) return refuse('bidi');
  const name = nfc.replace(IGNORABLE, '').replace(WHITESPACE, ' ').trim();
  if (name.length === 0) return refuse('empty');
  const codePoints = [...name];
  if (codePoints.length > NAME_MAX_CODE_POINTS) return refuse('too_long');
  if (!LETTER_OR_DIGIT.test(name)) return refuse('no_letter');
  for (const ch of codePoints) {
    if (ch === ' ') continue;
    if (!isIdentifierAllowed(ch.codePointAt(0) ?? 0)) return refuse('character');
  }
  if (EDGE_PUNCTUATION.test(name)) return refuse('punctuation');
  if (!isModeratelyRestrictive(name)) return refuse('mixed_script');
  if (hasMixedNumbers(name)) return refuse('mixed_number');
  if (matchesLabelGrammar(name)) return refuse('label');
  if (isReservedName(name)) return refuse('reserved');
  if (isBlockedName(name, options.languages)) return refuse('blocked');
  // Rule 6, both orders: the case fold after the skeleton (a capital I meets an l) and before it
  // (KEVIN meets Kevin, whose capital I the table would otherwise turn into an l first).
  const key = comparisonKey(name);
  const folded = skeleton(name.toLowerCase());
  for (const other of options.taken ?? [])
    if (comparisonKey(other) === key || skeleton(other.toLowerCase()) === folded)
      return refuse('in_use');
  return { ok: true, name, skeleton: key };
}
