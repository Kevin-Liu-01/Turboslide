import { describe, expect, it } from 'vitest';

import { ACTIONS, isActionId } from '@turboslide/schema/actions';

import { fill, takesBase } from './agents';
import { HERO_SLIDES } from './hero-deck';
import { SCRIPT, scriptActions } from './script';
import type { Step } from './script';

// The agents' script (docs/SITE.md C.9): every action it names is one of the action table's with
// the window among its transports (the page API's path), every input parses with its action's
// schema once the runner filled it, every slide it names is the hero deck's or one an earlier step
// of the loop made, and every `wait` has a `signal` from the other agent.

const THREAD = '01j9zzzzzzzzzzzzzzzzzzzzzz';

describe("the agents' script", () => {
  it('names actions of the table that the page API runs', () => {
    for (const id of scriptActions()) {
      expect(isActionId(id), id).toBe(true);
      if (!isActionId(id)) continue;
      expect(ACTIONS[id].transports, id).toContain('window');
    }
  });

  it('gives every action an input its schema takes, with the base revision the runner adds', () => {
    const saved = new Map<string, unknown>([['thread', THREAD]]);
    for (const tasks of Object.values(SCRIPT))
      for (const task of tasks)
        for (const step of task.steps) {
          if (step.kind !== 'act') continue;
          const filled = fill(step.input, 1, saved) as Record<string, unknown>;
          const input = takesBase(step.action) ? { ...filled, baseRevision: 3 } : filled;
          const parsed = ACTIONS[step.action].input.safeParse(input);
          expect(
            parsed.success,
            `${task.name}: ${step.action} ${JSON.stringify(parsed.error?.issues)}`,
          ).toBe(true);
        }
  });

  it('names slides the deck holds or an earlier step of the loop made', () => {
    const known = new Set<string>(Object.values(HERO_SLIDES));
    for (const tasks of Object.values(SCRIPT))
      for (const task of tasks)
        for (const step of task.steps) {
          if (step.kind === 'act' && step.action === 'slide.new')
            known.add(fill((step.input as { id: string }).id, 1, new Map()) as string);
        }
    const named = (step: Step): string[] =>
      'slide' in step ? [fill(step.slide, 1, new Map()) as string] : [];
    for (const tasks of Object.values(SCRIPT))
      for (const task of tasks)
        for (const step of task.steps)
          for (const slide of named(step))
            expect(known.has(slide), `${task.name}: ${slide}`).toBe(true);
  });

  it('pairs every wait with a signal of the other agent', () => {
    const signals = (key: 'claude' | 'codex') =>
      new Set(
        SCRIPT[key].flatMap((task) =>
          task.steps.flatMap((step) => (step.kind === 'signal' ? [step.signal] : [])),
        ),
      );
    const waits = (key: 'claude' | 'codex') =>
      SCRIPT[key].flatMap((task) =>
        task.steps.flatMap((step) => (step.kind === 'wait' ? [step.signal] : [])),
      );
    for (const signal of waits('claude')) expect(signals('codex').has(signal), signal).toBe(true);
    for (const signal of waits('codex')) expect(signals('claude').has(signal), signal).toBe(true);
  });

  it('keeps every point and drag target on the sheet', () => {
    for (const tasks of Object.values(SCRIPT))
      for (const task of tasks)
        for (const step of task.steps) {
          const point = step.kind === 'point' ? step.at : step.kind === 'drag' ? step.to : null;
          if (point === null) continue;
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(1600);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeLessThanOrEqual(900);
        }
  });
});
