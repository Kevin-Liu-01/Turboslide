// The day 0 seam of round five (gslides-parity SPEC-5 1.6; MILESTONES-5 integrator day 0): every
// row of the 51 (SPEC-5 13; SPEC-5-amendments A5) is in the table with a parsing example, and a
// fresh dispatcher answers NotImplementedError with the milestone GS5 for each until its lane
// registers a handler. The coverage test beside this file checks the rest of the contract.
import { describe, expect, it } from 'vitest';
import { ACTIONS, GS5_ACTION_IDS } from '@turboslide/schema/actions';
import { NotImplementedError } from '@turboslide/schema/errors';

import { createDispatcher } from '../dispatch.ts';

describe('the round five seam', () => {
  it('answers NotImplementedError with GS5 for every row from a fresh dispatcher', async () => {
    const dispatcher = createDispatcher();
    expect(GS5_ACTION_IDS).toHaveLength(51);
    for (const id of GS5_ACTION_IDS) {
      const spec = ACTIONS[id];
      let caught: unknown;
      try {
        await dispatcher.dispatch(id, spec.example, { author: { kind: 'human', name: 'test' } });
      } catch (error) {
        caught = error;
      }
      expect(caught, id).toBeInstanceOf(NotImplementedError);
      expect((caught as NotImplementedError).milestone, id).toBe('GS5');
    }
    expect(dispatcher.implemented().filter((id) => GS5_ACTION_IDS.includes(id))).toEqual([]);
  });
});
