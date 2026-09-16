// The Accessibility menu's sentences (gslides-parity SPEC-5 7.5, 0.39; R10 7.4): pure builders
// for Verbalize selection, Verbalize selection formatting and Verbalize from cursor location,
// the live region write and the optional `speechSynthesis` pass under Speak selection aloud.
// Google presents the sentence to the assistive technology; Turboslide writes it into the
// `#ts-verbalize` `role="status"` region (VerbalizeRegion.tsx), which a screen reader speaks, and
// under the Turboslide toggle also speaks it itself, off by default. The builders take plain
// facts so `verbalize.test.ts` pins the words without a DOM.
import type { Block } from '@turboslide/schema/blocks';
import type { Slide } from '@turboslide/schema/deck';
import { slideBlocks, slideTitle } from '@turboslide/schema/deck';
import type { RunMarks } from '@turboslide/schema/text';
import { marksOfRange, placeRuns, plainOf } from '@turboslide/schema/text';

/** The id of the live region the sentences go to (SPEC-5 7.5). */
export const VERBALIZE_REGION_ID = 'ts-verbalize';

/** The three Verbalize rows (SPEC-5 13 `accessibility.verbalize`). */
export type VerbalizeWhat = 'selection' | 'selectionFormatting' | 'fromCursor';

/** The words a block type takes in a sentence (Google's "Text box", "Image", "Table"). */
export const BLOCK_WORDS: Readonly<Record<string, string>> = {
  text: 'Text box',
  heading: 'Heading',
  paragraph: 'Paragraph',
  plain: 'List',
  picture: 'Image',
  shot: 'Image',
  table: 'Table',
  chart: 'Chart',
  shape: 'Shape',
  icon: 'Icon',
  mark: 'Mark',
  material: 'Material',
  media: 'Media',
  equation: 'Equation',
  panel: 'Code panel',
  dia: 'Diagram',
};

export type VerbalizeFacts = {
  slide: Slide | undefined;
  /** the slide's number and the count */
  n: number;
  of: number;
  /** the selected block, if one */
  block?: Block;
  /** the selected text as a plain string, when a text session holds a selection */
  selectedText?: string;
  /** the caret's Text (markup) and its plain range, for the formatting and from cursor rows */
  text?: string;
  range?: [number, number];
  /** the typography words of the block: size in px, the alignment, the colour token */
  typography?: { size?: number; align?: string; color?: string; weight?: number };
};

/** The plain text of a block's own text member, when it has one. */
export function blockPlainText(block: Block): string {
  const record = block as unknown as Record<string, unknown>;
  if (typeof record['text'] === 'string') return plainOf(record['text']);
  if (Array.isArray(record['items']))
    return (record['items'] as unknown[])
      .map((item) =>
        typeof item === 'string'
          ? plainOf(item)
          : typeof (item as { text?: unknown }).text === 'string'
            ? plainOf((item as { text: string }).text)
            : '',
      )
      .filter((line) => line !== '')
      .join('. ');
  return '';
}

/** The kind word and the text of a block: "Text box: Quarterly numbers". */
export function blockSentence(block: Block): string {
  const word = BLOCK_WORDS[block.type] ?? block.type;
  const text = blockPlainText(block);
  return text === '' ? word : `${word}: ${text}`;
}

/** "Slide 4 of 12, Content rule" when nothing is selected. */
export function slideSentence(slide: Slide | undefined, n: number, of: number): string {
  if (slide === undefined) return `Slide ${n} of ${of}`;
  return `Slide ${n} of ${of}, ${slideTitle(slide, n)}`;
}

/** The marks and typography at the caret in Google's word order: "Bold, italic, 22 point, left aligned, ink". */
export function formattingSentence(
  marks: RunMarks & { b?: true },
  typography: VerbalizeFacts['typography'] = {},
): string {
  const words: string[] = [];
  if (marks.b === true || (typography.weight !== undefined && typography.weight >= 600))
    words.push('Bold');
  if (marks.i === true) words.push('italic');
  if (marks.u === true) words.push('underlined');
  if (marks.s === true) words.push('struck through');
  if (marks.sup === true) words.push('superscript');
  if (marks.sub === true) words.push('subscript');
  if (typography.size !== undefined) words.push(`${Math.round(typography.size * 0.75)} point`);
  if (typography.align !== undefined) words.push(`${typography.align} aligned`);
  if (marks.color !== undefined) words.push(String(marks.color));
  else if (typography.color !== undefined) words.push(typography.color);
  if (words.length === 0) return 'Plain text';
  const first = words[0] as string;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...words.slice(1)].join(', ');
}

/**
 * The sentence of a Verbalize row (R10 7.4): the selection's text, the block's kind and text, or
 * the slide's position; the formatting at the caret; the text from the caret to the end of the
 * Text, then the remaining blocks in reading order.
 */
export function verbalizeSentence(what: VerbalizeWhat, facts: VerbalizeFacts): string {
  switch (what) {
    case 'selection': {
      if (facts.selectedText !== undefined && facts.selectedText.trim() !== '')
        return facts.selectedText.trim();
      if (facts.block !== undefined) return blockSentence(facts.block);
      return slideSentence(facts.slide, facts.n, facts.of);
    }
    case 'selectionFormatting': {
      if (facts.text === undefined || facts.range === undefined)
        return formattingSentence({}, facts.typography);
      const marks: RunMarks & { b?: true } = { ...marksOfRange(facts.text, facts.range) };
      // bold is a run flag, not a mark: read it from the run the caret sits in
      const at = facts.range[0];
      const run =
        placeRuns(facts.text).find((row) => row.start <= at && at < row.end) ??
        placeRuns(facts.text).find((row) => row.end === at);
      if (run?.run.b === true) marks.b = true;
      return formattingSentence(marks, facts.typography);
    }
    case 'fromCursor': {
      const parts: string[] = [];
      if (facts.text !== undefined) {
        const plain = plainOf(facts.text);
        const from = facts.range?.[0] ?? 0;
        const rest = plain.slice(Math.min(from, plain.length)).trim();
        if (rest !== '') parts.push(rest);
      } else if (facts.block !== undefined) {
        parts.push(blockSentence(facts.block));
      }
      if (facts.slide !== undefined) {
        const blocks = slideBlocks(facts.slide).map(({ block }) => block);
        const at =
          facts.block === undefined
            ? -1
            : blocks.findIndex((block) => block.id === facts.block?.id);
        for (const block of blocks.slice(at + 1)) {
          const sentence = blockSentence(block);
          if (sentence !== '') parts.push(sentence);
        }
      }
      return parts.length === 0 ? slideSentence(facts.slide, facts.n, facts.of) : parts.join('. ');
    }
  }
}

/** Writes a sentence into the live region; the region is VerbalizeRegion.tsx's, present at zero size. */
export function announceVerbalize(
  sentence: string,
  root: Document | null = typeof document === 'undefined' ? null : document,
): void {
  const region = root?.getElementById(VERBALIZE_REGION_ID);
  if (region === null || region === undefined) return;
  // the same sentence twice must still be announced: the node is replaced, not updated
  region.textContent = '';
  const line = root!.createElement('p');
  line.textContent = sentence;
  region.append(line);
}

type SpeechLike = {
  speak: (utterance: { text: string; lang: string }) => void;
  cancel?: () => void;
};

/** Speaks a sentence through `speechSynthesis` in the deck's language (Speak selection aloud, off by default). */
export function speakSentence(
  sentence: string,
  language: string,
  synthesis: SpeechLike | undefined = typeof window === 'undefined'
    ? undefined
    : (window as unknown as { speechSynthesis?: SpeechLike }).speechSynthesis,
  makeUtterance: (text: string) => { text: string; lang: string } = (text) => {
    const Utterance = (
      globalThis as unknown as {
        SpeechSynthesisUtterance?: new (text: string) => { text: string; lang: string };
      }
    ).SpeechSynthesisUtterance;
    return Utterance === undefined ? { text, lang: language } : new Utterance(text);
  },
): boolean {
  if (synthesis === undefined) return false;
  synthesis.cancel?.();
  const utterance = makeUtterance(sentence);
  utterance.lang = language;
  synthesis.speak(utterance);
  return true;
}

/** The filmstrip's accessible name under braille support (G5): "Slide n, title, layout". */
export function brailleSlideName(slide: Slide | undefined, n: number): string {
  if (slide === undefined) return `Slide ${n}`;
  const layout = slide.kind === 'content' ? slide.layout.type : slide.kind;
  return `Slide ${n}, ${slideTitle(slide, n)}, ${layout}`;
}
