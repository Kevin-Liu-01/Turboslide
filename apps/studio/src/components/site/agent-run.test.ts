import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EMPTY, HEADING_ON_PLATE, RUN, stepMutations } from './agent-run';
import { LIGHTHOUSE, applyMutations, printCall } from './canvas-pose';
import type { Scene } from './canvas-pose';

const here = dirname(fileURLToPath(import.meta.url));
const recorded = JSON.parse(
  readFileSync(
    join(here, '..', '..', '..', 'home-deck', 'recorded', 'lighthouse-canvas.json'),
    'utf8',
  ),
) as { grammar: { boxes: Record<string, Record<string, unknown>> } };

describe("the agent's run", () => {
  it('builds the lighthouse slide from an empty slide, one write a step', () => {
    let scene: Scene = EMPTY;
    for (const step of RUN) {
      const mutations = stepMutations(step);
      expect(mutations).toHaveLength(1);
      scene = applyMutations(scene, mutations).scene;
      expect(scene.some((object) => object.id === step.target)).toBe(true);
    }
    expect(scene).toEqual(LIGHTHOUSE);
  });

  it("puts the heading on the plate at the CLI's measured box before it moves it", () => {
    const { group: _group, ...box } = recorded.grammar.boxes.h as { group?: string };
    expect(HEADING_ON_PLATE).toEqual(box);
    expect(RUN.at(-1)?.call.id).toBe('block.set');
  });

  it("prints every write in the editor's spelling", () => {
    expect(RUN.map((step) => printCall(step.call)[0]?.op)).toEqual([
      'block.insert lighthouse --slot main',
      'block.insert lighthouse --slot main --after picture',
      'block.insert lighthouse --slot main --after plate',
      'block.insert lighthouse --slot main --after h',
      'block.insert lighthouse --slot main --after p1',
      'block.set lighthouse#h /pos',
    ]);
  });
});
