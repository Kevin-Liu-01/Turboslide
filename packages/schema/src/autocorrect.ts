// The autocorrect engine (gslides-parity SPEC-5 7.1, 0.34; R10 1.3 to 1.5): pure, over one plain
// paragraph and the caret where a trigger keystroke is about to land. `autocorrect(...)` answers
// the one correction the rules make for the completed token, or null. InlineText and the notes
// textarea call it on a trigger key after a `flushBurst()` and apply the answer as their own
// burst, so the first Cmd Z and a Backspace within 2 s revert the correction alone (R10 1.4).
// `autocorrectText` is the agent form (`text.autocorrect`): the token rules applied across a
// markup Text as if every token had been typed, with the list of changes for a dry run. The
// tables are `autocorrect-lists.ts`; the substitution rows and the switches are the caller's
// preferences record (`preferences.ts`). Nothing here touches the DOM, a store or the network.
import {
  BULLET_PREFIXES,
  CORRECTIONS,
  NUMBER_PREFIX_PATTERN,
  NUMBER_PREFIX_PRESETS,
  SENTENCE_EXCEPTIONS,
  TRIGGER_PUNCTUATION,
  quoteStyleFor,
} from './autocorrect-lists.ts';
import type { Preferences } from './preferences.ts';
import {
  LINK_SCHEMES,
  markRange,
  parseParagraphs,
  placeRuns,
  plainOf,
  serializeRuns,
  spliceText,
} from './text.ts';
import type { Text } from './text.ts';

/** The six rules of R10 1.3, in the order the engine tries them. */
export const AUTOCORRECT_RULES = [
  'list',
  'substitution',
  'spelling',
  'capitalize',
  'link',
  'quotes',
] as const;
export type AutocorrectRule = (typeof AUTOCORRECT_RULES)[number];

/** The keys that fire the token rules: a space, Enter and the closing punctuation marks. */
export const TRIGGER_KEYS: ReadonlyArray<string> = [' ', '\n', ...TRIGGER_PUNCTUATION];

/** The two straight quote characters the quotes rule replaces as they are typed. */
export const QUOTE_KEYS: ReadonlyArray<string> = ["'", '"'];

/**
 * One correction in plain offsets of the paragraph: `remove` characters at `at` leave and
 * `insert` lands in their place. `link` asks for a link mark over the token instead of a text
 * change; `list` asks the block to become a list with the marker (the typed prefix is removed by
 * `remove`); `consumesTrigger` says the typed key itself is replaced (a smart quote), so the
 * caller prevents the keystroke and inserts `insert` in its place.
 */
export type Correction = {
  at: number;
  remove: number;
  insert: string;
  rule: AutocorrectRule;
  link?: string;
  list?: { marker: 'bullet' | 'number'; preset?: string };
  consumesTrigger?: true;
};

export type AutocorrectOptions = {
  /** words that are never corrected or capitalised: the personal dictionary, the product tokens */
  exceptions?: ReadonlyArray<string>;
  /** the caret sits inside a link's text: the quote and substitution rules stay off (R10 1.4) */
  inLink?: boolean;
  /** the pointer takes paragraph breaks and may become a list (a text box or a plain block) */
  listable?: boolean;
  /** the block is already a list (its marker is set): the list rule is off */
  isList?: boolean;
};

const WORD_CHAR = /[\p{L}\p{M}'’]/u;
const LETTER = /\p{L}/u;
const OPENERS = new Set(['(', '[', '{', '“', '‘', '«', '‹', '„', '‚']);

/** True when a key is one of the triggers or one of the two quotes. */
export function isTriggerKey(key: string): boolean {
  return TRIGGER_KEYS.includes(key) || QUOTE_KEYS.includes(key);
}

/** The maximal run of non space characters ending at the caret: [start, token]. */
export function tokenBefore(paragraph: string, caret: number): { start: number; token: string } {
  let start = caret;
  while (start > 0 && !/\s/u.test(paragraph.charAt(start - 1))) start -= 1;
  return { start, token: paragraph.slice(start, caret) };
}

/** The word (letters, marks and apostrophes) ending at the caret. */
export function wordBefore(paragraph: string, caret: number): { start: number; word: string } {
  let start = caret;
  while (start > 0 && WORD_CHAR.test(paragraph.charAt(start - 1))) start -= 1;
  return { start, word: paragraph.slice(start, caret) };
}

/** A camelCase, dotted or digit bearing identifier is never corrected (R10 1.3 exceptions). */
export function isIdentifier(word: string): boolean {
  if (/\d/u.test(word)) return true;
  if (word.includes('.') || word.includes('_') || word.includes('/')) return true;
  const inner = word.slice(1);
  return /\p{Ll}/u.test(inner) && /\p{Lu}/u.test(inner);
}

/** True when the token before `start` ends a sentence: `.`, `!` or `?` not part of an abbreviation. */
function startsSentence(
  paragraph: string,
  start: number,
  exceptions: ReadonlyArray<string>,
): boolean {
  let i = start;
  while (i > 0 && /\s/u.test(paragraph.charAt(i - 1))) i -= 1;
  if (i === 0) return true;
  if (i === start) return false; // no space between the word and what precedes it
  const previous = paragraph.charAt(i - 1);
  if (previous === '!' || previous === '?') return true;
  if (previous !== '.') return false;
  const { token } = tokenBefore(paragraph, i);
  const lower = token.toLowerCase();
  if (SENTENCE_EXCEPTIONS.includes(lower)) return false;
  if (exceptions.some((entry) => entry.toLowerCase() === lower)) return false;
  // a number or a dotted identifier ending in a period ("3." in a list, "v2.") is not a sentence end
  if (/\d\.$/u.test(token)) return false;
  return true;
}

/** The correction of a misspelt token, keeping the token's capitalisation pattern. */
export function spellingFix(word: string): string | null {
  const lower = word.toLowerCase();
  const fix = CORRECTIONS[lower];
  if (fix === undefined) return null;
  if (word === lower) return fix;
  if (word === word.toUpperCase() && word.length > 1) return fix.toUpperCase();
  const first = word.charAt(0);
  if (first === first.toUpperCase()) return fix.charAt(0).toUpperCase() + fix.slice(1);
  return fix;
}

/** A url for a typed link token: the scheme form as is, `www.` behind https. */
export function linkUrlOf(token: string): string | null {
  const trimmed = token.replace(/[.,;:!?)]+$/u, '');
  if (trimmed.length < 4) return null;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('www.') && lower.length > 5 && lower.indexOf('.', 4) > 4)
    return `https://${trimmed}`;
  for (const scheme of LINK_SCHEMES) {
    if (lower.startsWith(scheme) && trimmed.length > scheme.length + 1) return trimmed;
  }
  return null;
}

/** The list a typed prefix starts (R10 1.3 "List detection"; G11), or null. */
export function listPrefix(prefix: string): Correction['list'] | null {
  if (BULLET_PREFIXES.includes(prefix)) return { marker: 'bullet' };
  const match = NUMBER_PREFIX_PATTERN.exec(prefix);
  if (match === null) return null;
  const groups = match.groups ?? {};
  const kind =
    groups['num'] !== undefined ? 'num' : groups['alpha'] !== undefined ? 'alpha' : 'roman';
  // "1." to "9." and "a." start a list; a larger number is a value someone typed
  if (kind === 'num' && Number(groups['num']) > 9) return null;
  return { marker: 'number', preset: NUMBER_PREFIX_PRESETS[kind] };
}

/** The smart quote for a typed straight quote at a caret. */
export function smartQuote(
  paragraph: string,
  caret: number,
  key: string,
  language: string,
): string | null {
  if (!QUOTE_KEYS.includes(key)) return null;
  const style = quoteStyleFor(language);
  const before = caret > 0 ? paragraph.charAt(caret - 1) : '';
  const after = caret < paragraph.length ? paragraph.charAt(caret) : '';
  if (key === "'") {
    // an apostrophe between two letters takes the closing single quote (don't, it's)
    if (LETTER.test(before) && LETTER.test(after)) return style.single[1];
    if (LETTER.test(before) && after === '') return style.single[1];
  }
  const pair = key === '"' ? style.double : style.single;
  const opens = before === '' || /\s/u.test(before) || OPENERS.has(before);
  if (!opens) return pair[1];
  return key === '"' && style.inner !== undefined ? `${pair[0]}${style.inner}` : pair[0];
}

/**
 * The one correction for a trigger key at the caret of a plain paragraph, or null (R10 1.3). The
 * key has not landed yet: the paragraph holds the text before it and `caret` is where it lands.
 */
export function autocorrect(
  paragraph: string,
  caret: number,
  key: string,
  prefs: Preferences,
  language = 'en-US',
  options: AutocorrectOptions = {},
): Correction | null {
  const exceptions = options.exceptions ?? [];
  const at = Math.max(0, Math.min(caret, paragraph.length));
  if (QUOTE_KEYS.includes(key)) {
    if (!prefs.autocorrect.quotes || options.inLink === true) return null;
    const quote = smartQuote(paragraph, at, key, language);
    return quote === null
      ? null
      : { at, remove: 0, insert: quote, rule: 'quotes', consumesTrigger: true };
  }
  if (!TRIGGER_KEYS.includes(key)) return null;
  const { start, token } = tokenBefore(paragraph, at);
  if (token === '') return null;
  const isSpaceOrEnter = key === ' ' || key === '\n';

  // list detection: the prefix alone at the start of a paragraph, then a space
  if (
    prefs.autocorrect.lists &&
    key === ' ' &&
    options.listable === true &&
    options.isList !== true &&
    start === 0 &&
    paragraph.trim() === token
  ) {
    const list = listPrefix(token);
    if (list !== null) return { at: 0, remove: token.length, insert: '', rule: 'list', list };
  }

  // substitution: the whole token equals an enabled row's `from`, case sensitive
  if (prefs.substitutions.on && options.inLink !== true) {
    const row = prefs.substitutions.rows.find((entry) => entry.on && entry.from === token);
    if (row !== undefined)
      return { at: start, remove: token.length, insert: row.to, rule: 'substitution' };
  }

  const { start: wordStart, word } = wordBefore(paragraph, at);
  const isException = (candidate: string): boolean =>
    exceptions.some(
      (entry) => entry === candidate || entry.toLowerCase() === candidate.toLowerCase(),
    );

  // spelling correction: English only in round five, never a proper noun or an identifier
  if (
    prefs.autocorrect.spelling &&
    word.length > 1 &&
    language.toLowerCase().startsWith('en') &&
    !isIdentifier(word) &&
    !isException(word)
  ) {
    const capitalised = /^\p{Lu}\p{Ll}+$/u.test(word);
    const sentenceStart = startsSentence(paragraph, wordStart, exceptions);
    if (!(capitalised && !sentenceStart)) {
      const fix = spellingFix(word);
      if (fix !== null && fix !== word)
        return { at: wordStart, remove: word.length, insert: fix, rule: 'spelling' };
    }
  }

  // sentence capital: the first word of a paragraph or of a sentence
  if (prefs.autocorrect.capitalize && word.length > 0 && /^\p{Ll}/u.test(word)) {
    if (
      !isIdentifier(word) &&
      !isException(word) &&
      word === token &&
      startsSentence(paragraph, wordStart, exceptions)
    ) {
      const upper = word.charAt(0).toUpperCase();
      if (upper !== word.charAt(0))
        return { at: wordStart, remove: 1, insert: upper, rule: 'capitalize' };
    }
  }

  // link detection: a scheme or www. token, on a space or Enter
  if (prefs.autocorrect.links && isSpaceOrEnter && options.inLink !== true) {
    const url = linkUrlOf(token);
    if (url !== null)
      return { at: start, remove: token.length, insert: token, link: url, rule: 'link' };
  }
  return null;
}

/** The paragraph after a text correction (a link or a list correction leaves the plain text alone). */
export function applyCorrection(paragraph: string, correction: Correction): string {
  if (correction.link !== undefined || correction.list !== undefined) return paragraph;
  return (
    paragraph.slice(0, correction.at) +
    correction.insert +
    paragraph.slice(correction.at + correction.remove)
  );
}

export type TextChange = { at: number; from: string; to: string; rule: AutocorrectRule };

export type AutocorrectTextResult = { text: Text; changes: TextChange[] };

/**
 * The agent form (SPEC-5 7.1 "text.autocorrect"): every token of a markup Text run through the
 * substitution, spelling, capital, link and quote rules as if a space had been typed after it,
 * offsets kept in plain text so the answer is the corrected markup. The list rule is not applied
 * here: it changes the block, and `text.list` is that write. Links inside a link's text and the
 * GT mark are left alone.
 */
export function autocorrectText(
  text: Text,
  prefs: Preferences,
  language = 'en-US',
  options: Pick<AutocorrectOptions, 'exceptions'> = {},
): AutocorrectTextResult {
  const changes: TextChange[] = [];
  let current = text;
  const plain = plainOf(text);
  const paragraphs = plain.split('\n');
  const linkedOrMark = (offset: number): boolean =>
    placeRuns(current).some(
      (row) =>
        row.start <= offset &&
        offset < row.end &&
        (row.run.link !== undefined || row.run.gt === true),
    );
  // the paragraphs are walked from the last to the first, and the tokens from the last to the
  // first, so an earlier offset never moves under a later change
  let base = plain.length;
  for (let p = paragraphs.length - 1; p >= 0; p -= 1) {
    const paragraph = paragraphs[p] ?? '';
    base -= paragraph.length;
    const ends: number[] = [];
    for (let i = 1; i <= paragraph.length; i += 1) {
      const char = paragraph.charAt(i - 1);
      const next = i < paragraph.length ? paragraph.charAt(i) : ' ';
      if (!/\s/u.test(char) && /\s/u.test(next)) ends.push(i);
    }
    let working = paragraph;
    for (const end of ends.reverse()) {
      const offset = base + end;
      if (linkedOrMark(Math.max(0, offset - 1))) continue;
      // a token takes every rule that applies in turn (a misspelt first word is corrected, then
      // capitalised), at most one correction per rule
      let caret = end;
      for (let round = 0; round < AUTOCORRECT_RULES.length; round += 1) {
        const correction = autocorrect(working, caret, ' ', prefs, language, {
          ...options,
          listable: false,
        });
        if (correction === null || correction.rule === 'list' || correction.rule === 'quotes')
          break;
        const from = working.slice(correction.at, correction.at + correction.remove);
        if (correction.link !== undefined) {
          current = markRange(
            current,
            [base + correction.at, base + correction.at + correction.remove],
            { set: { link: correction.link } },
          );
          changes.push({
            at: base + correction.at,
            from,
            to: `[${from}](${correction.link})`,
            rule: 'link',
          });
          break;
        }
        current = spliceText(current, base + correction.at, correction.remove, correction.insert);
        working = applyCorrection(working, correction);
        caret += correction.insert.length - correction.remove;
        changes.push({
          at: base + correction.at,
          from,
          to: correction.insert,
          rule: correction.rule,
        });
      }
    }
    // straight quotes become the language's quotes, from the end of the paragraph backwards
    if (prefs.autocorrect.quotes) {
      for (let i = working.length - 1; i >= 0; i -= 1) {
        const char = working.charAt(i);
        if (!QUOTE_KEYS.includes(char) || linkedOrMark(base + i)) continue;
        const quote = smartQuote(working.slice(0, i) + working.slice(i + 1), i, char, language);
        if (quote === null || quote === char) continue;
        current = spliceText(current, base + i, 1, quote);
        working = working.slice(0, i) + quote + working.slice(i + 1);
        changes.push({ at: base + i, from: char, to: quote, rule: 'quotes' });
      }
    }
    base -= 1; // the paragraph break
  }
  changes.sort((a, b) => a.at - b.at);
  return { text: current, changes };
}

/** True when a markup Text would change under the rules (a cheap dry run for the walk). */
export function needsAutocorrect(text: Text, prefs: Preferences, language = 'en-US'): boolean {
  return autocorrectText(text, prefs, language).changes.length > 0;
}

/** The plain paragraphs of a Text with their plain offsets, for callers that address one. */
export function plainParagraphs(text: Text): { at: number; text: string }[] {
  const out: { at: number; text: string }[] = [];
  let at = 0;
  for (const runs of parseParagraphs(text)) {
    const plain = plainOf(serializeRuns(runs));
    out.push({ at, text: plain });
    at += plain.length + 1;
  }
  return out;
}
