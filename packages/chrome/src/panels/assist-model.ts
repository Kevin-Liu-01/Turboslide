import type { AssistCard, AssistRow } from '@turboslide/schema/actions';
import { plainText } from '@turboslide/schema/text';

/**
 * The pure half of the Assist panel (docs/PRODUCT.md 6.1 "The cards"): the before and after of a
 * row with the changed words marked, and the panel's state words. No React, so `assist-panel.test`
 * pins it in Node.
 */

export type DiffSpan = { text: string; changed: boolean };

/**
 * The words of `after` that differ from `before`, by the longest common subsequence over words,
 * so a card shows the seller what moved and not two grey paragraphs. The markup is read as plain
 * text; a span is a run of words with one flag.
 */
export function markChangedWords(before: string, after: string): DiffSpan[] {
  const a = plainText(before)
    .split(/(\s+)/)
    .filter((part) => part !== '');
  const b = plainText(after)
    .split(/(\s+)/)
    .filter((part) => part !== '');
  const wordsA = a.filter((part) => !/^\s+$/.test(part));
  const wordsB = b.filter((part) => !/^\s+$/.test(part));
  const n = wordsA.length;
  const m = wordsB.length;
  /* the LCS table over words; the texts are a slide's, so the table is small */
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const rowI = table[i];
      const rowNext = table[i + 1];
      if (rowI === undefined || rowNext === undefined) continue;
      rowI[j] =
        wordsA[i] === wordsB[j]
          ? (rowNext[j + 1] ?? 0) + 1
          : Math.max(rowNext[j] ?? 0, rowI[j + 1] ?? 0);
    }
  }
  const keep = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (wordsA[i] === wordsB[j]) {
      keep.add(j);
      i += 1;
      j += 1;
    } else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) i += 1;
    else j += 1;
  }
  const spans: DiffSpan[] = [];
  let wordIndex = 0;
  for (const part of b) {
    const space = /^\s+$/.test(part);
    const changed = space ? false : !keep.has(wordIndex);
    if (!space) wordIndex += 1;
    const last = spans[spans.length - 1];
    if (last !== undefined && (space || last.changed === changed)) {
      last.text += part;
      if (!space && !last.changed && changed) last.changed = changed;
    } else spans.push({ text: part, changed });
  }
  /* a space between two changed words joins them; a space after a kept word stays kept */
  return spans;
}

/** A row's plain before and after, for the card's two columns. */
export function rowTexts(row: AssistRow): { before: string; after: string } {
  return { before: plainText(row.before), after: plainText(row.after) };
}

/** The slides a card touches, in the card's row order, once each. */
export function cardSlideIds(card: Pick<AssistCard, 'rows'>): string[] {
  const ids: string[] = [];
  for (const row of card.rows) if (!ids.includes(row.slideId)) ids.push(row.slideId);
  return ids;
}

/** The panel's card ids: `panel.assist.card.<n>` from 1 (docs/PRODUCT.md 7.1). */
export function cardControl(n: number, part?: 'accept' | 'dismiss' | 'change'): string {
  return part === undefined ? `panel.assist.card.${n}` : `panel.assist.card.${n}.${part}`;
}

/** A card's row control: `panel.assist.card.<n>.row.<slideId>`. */
export function rowControl(n: number, slideId: string): string {
  return `panel.assist.card.${n}.row.${slideId}`;
}

/** What the panel shows in one place: a card, a sentence (the fallback, a decline), or nothing. */
export type PanelEntry =
  | { kind: 'ask'; text: string }
  | { kind: 'card'; card: AssistCard; n: number }
  | { kind: 'sentence'; text: string }
  | { kind: 'accepted'; text: string };
