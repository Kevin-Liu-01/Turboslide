import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionContext } from '@turboslide/agent/dispatch';
import type { Slide } from '@turboslide/schema/deck';
import {
  EQUATION_PLACEHOLDER_TEX,
  EQUATION_SYMBOL_GROUPS,
} from '@turboslide/schema/blocks/equation';
import { openFileStore } from '@turboslide/store/file-store';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { LaneDeps } from './deps.ts';
import {
  equationDefaultPos,
  equationRender,
  estimateEquationBox,
  freeEquationId,
  registerEquationActions,
} from './equation.ts';

// The three equation actions through the dispatcher over a scratch copy of decks/fixture/motion
// (gslides-parity SPEC-5 8.4, 13; MILESTONES-5 B6 day 3), whose slides are canvases (a grammar
// slide converts first through the measurer the CLI and the studio carry, `withCanvas`, which a
// unit dispatcher lacks): every input validated by the action's schema and every output by its
// output schema, one commit per insert, the placeholder source for an empty tex, the MathML and
// the box of equation.render, the table of equation.symbols.

const REPO = resolve(import.meta.dirname, '../../../..');
const FIXTURE = join(REPO, 'decks/fixture/motion');
const context: ActionContext = { author: { kind: 'human', name: 'Maya' } };

let dir: string;
let deps: LaneDeps;

function dispatcherWith(lane: LaneDeps) {
  const dispatcher = createDispatcher();
  registerEquationActions(dispatcher, lane);
  return dispatcher;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'turboslide-equation-actions-'));
  cpSync(join(FIXTURE, 'deck.json'), join(dir, 'deck.json'));
  cpSync(join(FIXTURE, 'slides'), join(dir, 'slides'), { recursive: true });
  deps = { store: openFileStore({ dir }), lint: { copy: [], icons: [] } } as unknown as LaneDeps;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

type InsertAnswer = { slide: Slide; revision: number; blockId: string; findings: unknown[] };

function mainBlocks(slide: Slide): {
  id: string;
  type: string;
  pos?: { x: number; y: number; w: number; h: number; z?: number };
}[] {
  if (slide.kind !== 'content') return [];
  return (slide.slots.main ?? []) as never;
}

describe('equation.insert', () => {
  test('places the block at the centre of the content box, on top of the stack, in one commit', async () => {
    const dispatcher = dispatcherWith(deps);
    const before = await deps.store.revision();
    const answer = (await dispatcher.dispatch(
      'equation.insert',
      { slideId: 't-none', tex: '\\frac{a}{b}', baseRevision: before },
      context,
    )) as InsertAnswer;
    expect(answer.revision).toBe(before + 1);
    expect(answer.blockId).toBe('eq');
    expect(answer.slide.kind).toBe('content');
    expect(answer.slide.kind === 'content' && answer.slide.layout.type).toBe('freeform');
    const block = mainBlocks(answer.slide).find((b) => b.id === 'eq');
    expect(block?.type).toBe('equation');
    expect(block?.pos).toEqual({
      ...equationDefaultPos({ width: 1600, height: 900 }),
      z: expect.any(Number),
    });
    const others = mainBlocks(answer.slide).filter((b) => b.id !== 'eq');
    expect(block?.pos?.z).toBeGreaterThan(Math.max(...others.map((b) => b.pos?.z ?? 0)));
    expect((block as { tex?: string }).tex).toBe('\\frac{a}{b}');
    // the second block takes the next free id, the display and the alt land as written
    const second = (await dispatcher.dispatch(
      'equation.insert',
      {
        slideId: 't-none',
        tex: 'x',
        display: 'inline',
        alt: 'x',
        pos: { x: 200, y: 200, w: 240, h: 80 },
        baseRevision: answer.revision,
      },
      context,
    )) as InsertAnswer;
    expect(second.blockId).toBe('eq-2');
    const added = mainBlocks(second.slide).find((b) => b.id === 'eq-2') as
      { display?: string; alt?: string; pos?: { x: number } } | undefined;
    expect(added?.display).toBe('inline');
    expect(added?.alt).toBe('x');
    expect(added?.pos?.x).toBe(200);
  });

  test('an empty source lands the placeholder (SPEC-5 8.2), a stale base is a conflict, an unknown slide a range error', async () => {
    const dispatcher = dispatcherWith(deps);
    const base = await deps.store.revision();
    const answer = (await dispatcher.dispatch(
      'equation.insert',
      { slideId: 't-dissolve', tex: '   ', baseRevision: base },
      context,
    )) as InsertAnswer;
    const block = mainBlocks(answer.slide).find((b) => b.id === 'eq') as
      { tex?: string } | undefined;
    expect(block?.tex).toBe(EQUATION_PLACEHOLDER_TEX);
    await expect(
      dispatcher.dispatch(
        'equation.insert',
        { slideId: 't-dissolve', tex: 'y', baseRevision: base },
        context,
      ),
    ).rejects.toThrow(/revision/);
    await expect(
      dispatcher.dispatch(
        'equation.insert',
        { slideId: 'nowhere', tex: 'y', baseRevision: answer.revision },
        context,
      ),
    ).rejects.toThrow(RangeError);
  });

  test('freeEquationId walks eq, eq-2, eq-3', () => {
    expect(freeEquationId(new Set())).toBe('eq');
    expect(freeEquationId(new Set(['eq']))).toBe('eq-2');
    expect(freeEquationId(new Set(['eq', 'eq-2']))).toBe('eq-3');
  });
});

describe('equation.render', () => {
  test('answers the MathML the sheet draws, no finding, and a box that grows with the size', async () => {
    const dispatcher = dispatcherWith(deps);
    const answer = (await dispatcher.dispatch(
      'equation.render',
      { tex: '\\frac{a}{b}' },
      context,
    )) as {
      mathml: string;
      box: [number, number];
      findings: unknown[];
    };
    expect(answer.mathml).toMatch(/^<math display="block"/);
    expect(answer.mathml).toContain('<mfrac>');
    expect(answer.findings).toEqual([]);
    const large = (await dispatcher.dispatch(
      'equation.render',
      { tex: '\\frac{a}{b}', size: 44, display: 'inline' },
      context,
    )) as { mathml: string; box: [number, number] };
    expect(large.mathml).not.toContain('display="block"');
    expect(large.box[0]).toBeGreaterThan(answer.box[0]);
    expect(large.box[1]).toBeGreaterThan(answer.box[1]);
  });

  test('a source that does not parse answers the error mark and one equation/parse finding (the handler; the rule row is request R7)', async () => {
    const answer = await equationRender(deps, { tex: '\\frac{a}{' });
    expect(answer.mathml).toContain('temml-error');
    expect(answer.findings).toHaveLength(1);
    expect(answer.findings[0]?.message).toMatch(/^equation\/parse: /);
  });

  test('png refuses without the headless renderer and names the way to get the raster', async () => {
    await expect(equationRender(deps, { tex: 'x', out: 'png' })).rejects.toThrow(
      /headless renderer/,
    );
    const withPng = {
      ...deps,
      equationPng: async () => ({ path: '/tmp/eq.png', box: [300, 100] as [number, number] }),
    };
    const answer = await equationRender(withPng, { tex: 'x', out: 'png' });
    expect(answer.png).toBe('/tmp/eq.png');
    expect(answer.box).toEqual([300, 100]);
  });

  test('the estimate counts glyphs across a row and stacks a fraction, a table and limits', () => {
    const [w1, h1] = estimateEquationBox('<math><mi>x</mi></math>', 22);
    const [w2, h2] = estimateEquationBox('<math><mfrac><mi>a</mi><mi>b</mi></mfrac></math>', 22);
    const [w3] = estimateEquationBox(
      '<math><mi>x</mi><mo>+</mo><mi>y</mi><mo>+</mo><mi>z</mi></math>',
      22,
    );
    expect(h2).toBeGreaterThan(h1);
    expect(w3).toBeGreaterThan(w1);
    expect(w2).toBeGreaterThan(0);
    const rows = estimateEquationBox(
      '<math><mtable><mtr><mtd/></mtr><mtr><mtd/></mtr><mtr><mtd/></mtr></mtable></math>',
      22,
    );
    expect(rows[1]).toBeGreaterThan(h2);
  });
});

describe('equation.symbols', () => {
  test('answers the six groups in the toolbar order with Google counts', async () => {
    const dispatcher = dispatcherWith(deps);
    const answer = (await dispatcher.dispatch('equation.symbols', {}, context)) as {
      groups: {
        id: string;
        label: string;
        symbols: { command: string; latex: string; unicode: string; omml: string }[];
      }[];
    };
    expect(answer.groups.map((g) => g.id)).toEqual([...EQUATION_SYMBOL_GROUPS]);
    expect(answer.groups.map((g) => g.symbols.length).slice(0, 5)).toEqual([40, 32, 21, 20, 12]);
    expect(answer.groups[0]?.label).toBe('Greek letters');
    expect(answer.groups[3]?.label).toBe('Math operators');
    expect(answer.groups[0]?.symbols[0]).toEqual({
      command: '\\alpha',
      latex: '\\alpha',
      unicode: 'α',
      omml: 'r',
    });
  });
});
