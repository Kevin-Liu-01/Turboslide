import { describe, expect, it } from 'vitest';

import { DOING_CAPACITY } from '@turboslide/chrome/presence/presence-model';
import { ACTIONS, isActionId } from '@turboslide/schema/actions';

import { slideBlocks } from '@turboslide/schema/deck';
import type { Slide } from '@turboslide/schema/deck';

import { fill, sharedStart, takesBase } from './agents';
import { HERO_SLIDES, heroDocument } from './hero-deck';
import { REVIEW, SCRIPT, scriptActions } from './script';
import type { Step } from './script';

// The agents' script (docs/SITE.md C.9): every action it names is one of the action table's with
// the window among its transports (the page API's path), every input parses with its action's
// schema once the runner filled it, every slide it names is the hero deck's or one an earlier step
// of the loop made, every `wait` and `after` has a `signal` from the other agent, and every task
// names itself in a few words. Every slide looks finished at every moment: no step adds a slide or
// a block with an empty text, and a `write` step only erases back to words the old and the new
// text share (the poster and the director's first screen, docs/SITE.md B). The review tasks write
// nothing.

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
    const saved = new Map<string, unknown>([
      ['chartThread', THREAD],
      ['sentenceThread', THREAD],
    ]);
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
          if (step.kind === 'act' && step.action === 'slide.insert')
            known.add(
              fill((step.input as { slide: { id: string } }).slide.id, 1, new Map()) as string,
            );
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
      SCRIPT[key].flatMap((task) => [
        ...(task.after === undefined
          ? []
          : typeof task.after === 'string'
            ? [task.after]
            : task.after),
        ...task.steps.flatMap((step) => (step.kind === 'wait' ? [step.signal] : [])),
      ]);
    for (const signal of waits('claude')) expect(signals('codex').has(signal), signal).toBe(true);
    for (const signal of waits('codex')) expect(signals('claude').has(signal), signal).toBe(true);
  });

  it('names every task in a few words', () => {
    for (const tasks of [...Object.values(SCRIPT), ...Object.values(REVIEW)])
      for (const task of tasks) {
        expect(task.doing.length, task.name).toBeLessThanOrEqual(DOING_CAPACITY);
        expect(task.doing, task.name).toMatch(/^[a-z][^.]*[a-z]$/);
        for (const step of task.steps)
          if (step.kind === 'say') expect(step.words.length).toBeLessThanOrEqual(DOING_CAPACITY);
      }
  });

  it('reviews without writing', () => {
    for (const tasks of Object.values(REVIEW))
      for (const task of tasks)
        for (const step of task.steps)
          expect(['point', 'select', 'hold', 'say'], task.name).toContain(step.kind);
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

  it('adds only finished slides and blocks, and types only onto a text that reads', () => {
    const texts = new Map<string, string>();
    const noteBlock = (slideId: string, block: { id: string; text?: unknown; rows?: unknown }) => {
      if (typeof block.text === 'string') texts.set(`${slideId}#${block.id}`, block.text);
      ((block.rows ?? []) as { cells?: unknown[] }[]).forEach((row, r) =>
        (row.cells ?? []).forEach((cell, c) => {
          if (typeof cell === 'string')
            texts.set(`${slideId}#${block.id}/rows/${r}/cells/${c}`, cell);
        }),
      );
    };
    const note = (slideId: string, slide: unknown): void => {
      for (const row of slideBlocks(slide as Slide)) noteBlock(slideId, row.block as never);
    };
    const deck = heroDocument('try-test');
    for (const [id, slide] of Object.entries(deck.slides)) note(id, slide);
    const saved = new Map<string, unknown>();
    for (const tasks of Object.values(SCRIPT))
      for (const task of tasks)
        for (const step of task.steps) {
          if (step.kind !== 'act') continue;
          const input = fill(step.input, 1, saved) as Record<string, unknown>;
          expect(step.action, task.name).not.toBe('slide.new');
          if (step.action === 'slide.insert') {
            const slide = input.slide as { id: string };
            note(slide.id, slide);
            for (const row of slideBlocks(slide as unknown as Slide)) {
              const text = (row.block as { text?: unknown }).text;
              if (typeof text === 'string') expect(text.trim(), `${task.name}`).not.toBe('');
            }
          }
          if (step.action === 'block.insert') {
            const block = input.block as {
              id: string;
              type: string;
              text?: unknown;
              rows?: unknown;
            };
            /* a block that holds words holds them whole; a chart arrives with its data */
            if (block.type === 'box' || block.type === 'paragraph' || block.type === 'heading')
              expect(typeof block.text === 'string' && block.text.trim() !== '', task.name).toBe(
                true,
              );
            if (block.type === 'table')
              for (const row of block.rows as { cells: string[] }[])
                for (const cell of row.cells) expect(cell.trim(), task.name).not.toBe('');
            noteBlock(input.slideId as string, block);
          }
        }
    /* a write starts from the text there (the deck's, an added block's or the last write's) and
       keeps a start of it, so the text never empties; the agents' tasks run in order */
    for (const tasks of Object.values(SCRIPT))
      for (const task of tasks)
        for (const step of task.steps) {
          if (step.kind !== 'write') continue;
          const key = `${fill(step.slide, 1, saved) as string}#${fill(step.block, 1, saved) as string}${step.path === '/text' ? '' : step.path}`;
          const before = texts.get(key);
          expect(before?.trim(), `${task.name}: ${key}`).toBeTruthy();
          expect(sharedStart(before ?? '', step.text), `${task.name}: ${key}`).toBeGreaterThan(0);
          texts.set(key, step.text);
        }
  });
});
