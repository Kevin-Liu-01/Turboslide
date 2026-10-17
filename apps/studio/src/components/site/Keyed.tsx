import { Fragment } from 'react';

/**
 * A heading of the site pages with its key words in the accent (Kevin, 2026-10-16: "lets have an
 * actual accent color to highlight stuff, like peoplee, and agents"): each run of `text` that is
 * one of `keys`, as a whole word, is drawn in a `.site-key` span (site.css), the rest as text. The
 * heading's text is the sentence either way, so a screen reader and the structured data read it
 * unchanged.
 */
export function Keyed({ text, keys = [] }: { text: string; keys?: readonly string[] }) {
  return (
    <>
      {keyRuns(text, keys).map((run, i) =>
        run.key ? (
          <span key={`${i}-${run.text}`} className="site-key">
            {run.text}
          </span>
        ) : (
          <Fragment key={`${i}-${run.text}`}>{run.text}</Fragment>
        ),
      )}
    </>
  );
}

export type KeyRun = { text: string; key: boolean };

/** `text` in runs, each key word (a whole word or phrase, longest first) a run of its own. */
function keyRuns(text: string, keys: readonly string[]): KeyRun[] {
  const words = [...keys].filter((key) => key !== '').sort((a, b) => b.length - a.length);
  if (words.length === 0) return [{ text, key: false }];
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  const runs: KeyRun[] = [];
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > at) runs.push({ text: text.slice(at, start), key: false });
    runs.push({ text: match[0], key: true });
    at = start + match[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at), key: false });
  return runs;
}
