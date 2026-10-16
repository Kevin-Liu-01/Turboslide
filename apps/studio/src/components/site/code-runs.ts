/**
 * The runs of a line of code that a narrow line never breaks inside (docs/SITE.md 6, the docs'
 * code and the site pages' inline code and code panels): a flag with its value (`--theme
 * light,dark`, `--out renders`) while the two are at most KEEP_PAIR characters, and any other
 * word of at most KEEP characters, so a line never ends after a flag's hyphens or inside a short
 * word. A longer pair breaks at its space, and a longer word wraps as the line allows.
 */

/** The longest word kept whole, in characters. */
export const KEEP = 24;
/**
 * The longest flag and value kept on one line together, in characters: a run that fits the
 * narrowest column that sets code, an FAQ answer at 320 px (252 px; 29 characters of 14 px
 * monospace at 0.6 em are 244 px). At 40 the share page's `--editors-can-share
 * <editorsCanShare>` (37) and /faq's `--to https://www.turboslide.com` (31) ran past the column
 * into the gutter.
 */
export const KEEP_PAIR = 29;

export type CodeRun = { text: string; keep: boolean };

/** A flag: one or two hyphens and a letter (`-o`, `--theme`), never a number or a lone hyphen. */
const isFlag = (word: string): boolean => /^--?[A-Za-z]/.test(word);

/** A flag's value: a word that is not itself a flag, a lone hyphen or a line continuation. */
const isValue = (word: string | undefined): word is string =>
  word !== undefined && word !== '' && !word.startsWith('-') && word !== '\\';

export function codeRuns(text: string): CodeRun[] {
  const parts = text.split(/(\s+)/);
  const runs: CodeRun[] = [];
  for (let at = 0; at < parts.length; at += 1) {
    const part = parts[at] ?? '';
    if (part === '') continue;
    if (/\s/.test(part)) {
      runs.push({ text: part, keep: false });
      continue;
    }
    const space = parts[at + 1] ?? '';
    const value = parts[at + 2];
    if (isFlag(part) && space !== '' && isValue(value)) {
      const pair = `${part}${space}${value}`;
      if (pair.length <= KEEP_PAIR) {
        runs.push({ text: pair, keep: true });
        at += 2;
        continue;
      }
    }
    runs.push({ text: part, keep: part.length <= KEEP });
  }
  return runs;
}
