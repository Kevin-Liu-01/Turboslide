import type { ModelClient, PromptSlide } from './assist';
import { plainText } from '@turboslide/schema/text';

/**
 * The fixture mode of docs/PRODUCT.md 6.3 (`TURBOSLIDE_ASSIST=fixture`, judge-design addition 7):
 * a canned answer per intent, built from the prompt's own slides so the card that comes out is
 * valid for any deck, with a real signature from the server. The preview's two gate runs drive
 * the panel, the card, Accept, Undo and the mark against it without a model call; production
 * runs the real model. The answers pass through the same validator the model's do.
 */

/** A shorter reading of a text: the first sentence, or the first eight words, with the markup kept. */
export function shorterText(text: string): string {
  const trimmed = text.trim();
  const sentence = /^(.+?[.!?])(\s|$)/.exec(trimmed);
  if (sentence !== null && sentence[1] !== undefined && sentence[1].length < trimmed.length)
    return sentence[1];
  const words = trimmed.split(/\s+/);
  if (words.length <= 8) return trimmed;
  return `${words.slice(0, 8).join(' ')}.`;
}

/** A talk track for a slide from its texts: one sentence per text, under 120 words. */
export function notesFor(slide: PromptSlide): string {
  const lines: string[] = [`Start with the point of slide ${slide.n}, ${slide.title}.`];
  for (const target of slide.targets) {
    const plain = plainText(target.text).trim();
    if (plain === '') continue;
    lines.push(
      `Say ${plain.length > 90 ? `${plain.slice(0, 90).trim()}` : plain}${/[.!?]$/.test(plain) ? '' : '.'}`,
    );
    if (lines.join(' ').split(/\s+/).length > 90) break;
  }
  lines.push('Pause, then ask what the customer wants to see next.');
  return lines.join(' ').split(/\s+/).slice(0, 120).join(' ');
}

/** The canned model: shorter texts, the notes, or none for a free ask that names neither. */
export function fixtureModel(): ModelClient {
  return async (request) => {
    const { intent, prompt, slides } = request.context;
    const first = slides[0];
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 };
    const model = 'fixture';
    if (first === undefined) return { json: { intent: 'none' }, stop: 'end_turn', usage, model };
    const asked = prompt.toLowerCase();
    const wantsNotes =
      intent === 'notes' || (intent === 'ask' && /\b(notes?|talk track|say|speak)\b/.test(asked));
    const wantsShorter =
      intent === 'shorter' ||
      (intent === 'ask' &&
        /\b(short|shorter|tighten|trim|fewer words|concise|brief)\b/.test(asked));
    if (wantsNotes)
      return { json: { intent: 'notes', notes: notesFor(first) }, stop: 'end_turn', usage, model };
    if (wantsShorter) {
      const texts = first.targets
        .map((target) => ({ target: target.key, text: shorterText(target.text) }))
        .filter((row, index) => row.text !== first.targets[index]?.text);
      return { json: { intent: 'shorter', texts }, stop: 'end_turn', usage, model };
    }
    return { json: { intent: 'none' }, stop: 'end_turn', usage, model };
  };
}
