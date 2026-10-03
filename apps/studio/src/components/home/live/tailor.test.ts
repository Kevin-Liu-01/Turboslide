import { describe, expect, it } from 'vitest';

import { HOME_RUN } from '../run.generated';
import type { AgentStep } from './state';
import { customerText, tailorPlaces } from './tailor';

/* Tailor's count on the page (docs/LANDING.md 2.5, row home.tailor.apply): for every deck the page
   can hold (slide 5 absent, with its placeholders, titled and filled, the agents run's steps 0 to
   3), the figures equal the CLI's own answer to `tailor --replace=Northwind=Globex` recorded on that
   deck by build-home-assets.ts --run. */

const STATES = ['absent', 'placeholders', 'titled', 'filled'] as const;

const recorded = (step: AgentStep): { places: number; slides: number } => {
  const typed = HOME_RUN.typed.find(
    (t) => t.form === 'tailor' && t.state === STATES[step] && t.nameFound === true,
  );
  const match = typed?.answer[0]?.match(/^(\d+) replacements? on (\d+) slides?/);
  if (match === null || match === undefined)
    throw new Error(`no recorded tailor answer for ${STATES[step]}`);
  return { places: Number(match[1]), slides: Number(match[2]) };
};

describe('the Tailor count', () => {
  it('equals the recorded answer for every deck the page can hold', () => {
    for (const step of [0, 1, 2, 3] as const)
      expect(tailorPlaces(step), STATES[step]).toEqual(recorded(step));
  });

  it('holds the run fixture and the page deck counts', () => {
    expect(tailorPlaces(0)).toEqual(HOME_RUN.tailorCounts.start);
    expect(tailorPlaces(3)).toEqual(HOME_RUN.tailorCounts.rest);
  });

  it('replaces the fixture customer in any text', () => {
    expect(customerText('Open with the goals Northwind named. Northwind.', 'Globex')).toBe(
      'Open with the goals Globex named. Globex.',
    );
  });
});
