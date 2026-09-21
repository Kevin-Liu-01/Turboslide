// The deck_review prompt: the six lenses of SPEC 7.6, one or all, with the evidence resources named.
import { describe, expect, it } from 'vitest';
import {
  DECK_ASSIST_PROMPT,
  DECK_REVIEW_PROMPT,
  JUDGE_LENSES,
  deckAssistPrompt,
  deckReviewPrompt,
  lensById,
} from './prompts.ts';

const deck = { id: 'gt-brand', revision: 12 };

function textOf(result: ReturnType<typeof deckReviewPrompt>): string {
  const content = result.messages[0]?.content;
  return content?.type === 'text' ? content.text : '';
}

describe('deck_review', () => {
  it('declares the six lenses of SPEC 7.6', () => {
    expect(JUDGE_LENSES.map((lens) => lens.id)).toEqual([
      'layout',
      'visual-consistency',
      'copy',
      'accuracy',
      'completeness',
      'art-direction',
    ]);
    expect(DECK_REVIEW_PROMPT.name).toBe('deck_review');
    expect(DECK_REVIEW_PROMPT.arguments?.map((argument) => argument.name)).toEqual([
      'lens',
      'slideIds',
    ]);
    expect(lensById('copy')?.name).toBe('Copy and case');
  });

  it('returns every lens by default and names the evidence resources', () => {
    const result = deckReviewPrompt({}, deck);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.role).toBe('user');
    const text = textOf(result);
    for (const lens of JUDGE_LENSES) expect(text).toContain(`### ${lens.name}`);
    expect(text).toContain('revision 12');
    expect(text).toContain('deck://sheet/light/map');
    expect(text).toContain('deck://render/<slideId>/<theme>');
    expect(text).toContain('"source": "judge:<lens>"');
    expect(text).toContain('severity 2 and 3 only');
    expect(result.description).toContain('gt-brand');
  });

  it('narrows to one lens and to named slides', () => {
    const result = deckReviewPrompt({ lens: 'accuracy', slideIds: 'thesis, content-rule' }, deck);
    const text = textOf(result);
    expect(text).toContain('### Accuracy');
    expect(text).not.toContain('### Layout');
    expect(text).toContain('`thesis`, `content-rule`');
    expect(result.description).toBe(
      'Judge lens instructions for gt-brand at revision 12: Accuracy',
    );
    expect(textOf(deckReviewPrompt({ lens: 'all' }, deck))).toContain('### Art direction');
  });

  it('rejects an unknown lens with RangeError', () => {
    expect(() => deckReviewPrompt({ lens: 'vibes' }, deck)).toThrow(RangeError);
  });
});

describe('deck_assist', () => {
  it('names the two actions, the tailoring pass and the card rule', () => {
    expect(DECK_ASSIST_PROMPT.name).toBe('deck_assist');
    const result = deckAssistPrompt({}, deck);
    const text = textOf(result);
    expect(text).toContain('deck_assist_propose');
    expect(text).toContain('deck_assist_accept');
    expect(text).toContain('deck_tailor');
    expect(text).toContain('the first slide');
    expect(text).toContain('revision 12');
    expect(result.description).toBe('Assist instructions for gt-brand at revision 12: ask');
    expect(textOf(deckAssistPrompt({ intent: 'notes', slideIds: 'thesis' }, deck))).toContain(
      '`thesis`',
    );
  });

  it('rejects an unknown intent with RangeError', () => {
    expect(() => deckAssistPrompt({ intent: 'louder' }, deck)).toThrow(RangeError);
  });
});
