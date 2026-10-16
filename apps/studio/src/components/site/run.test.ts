import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { RECORDED_RUN, commandParts, quoteArgument } from './run';

// The run screen 02 shows (docs/SITE.md A.4) is the recording's: the same three commands with the
// same arguments, and the first line of each answer, from apps/studio/home-deck/recorded/run.json
// (the real CLI's output against the page's deck).

type Recording = { steps: { answer: { argv: string[]; code: number; stdout: string[] } }[] };
const recording = JSON.parse(
  readFileSync(new URL('../../../home-deck/recorded/run.json', import.meta.url), 'utf8'),
) as Recording;

describe('the recorded run on the landing', () => {
  it('is the recording’s commands and the first line of each answer', () => {
    expect(RECORDED_RUN).toHaveLength(recording.steps.length);
    recording.steps.forEach((step, i) => {
      expect(step.answer.code).toBe(0);
      expect(RECORDED_RUN[i]?.argv).toEqual(step.answer.argv);
      expect(RECORDED_RUN[i]?.answer).toBe(step.answer.stdout[0]);
    });
  });

  it('prints each command as a shell reads it back, a flag beside its value', () => {
    expect(commandParts(['slide', 'new', '--layout', 'rows', '--id', 'next-steps'])).toEqual([
      'turboslide',
      'slide',
      'new',
      '--layout rows',
      '--id next-steps',
    ]);
    expect(quoteArgument('next-steps#h')).toBe('next-steps#h');
    expect(quoteArgument('Next steps with Northwind')).toBe('"Next steps with Northwind"');
    expect(quoteArgument('[{"key": "Monday"}]')).toBe('\'[{"key": "Monday"}]\'');
  });
});
