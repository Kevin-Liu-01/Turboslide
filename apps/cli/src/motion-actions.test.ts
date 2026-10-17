// An agent animates a deck through the slide clock's actions (HTML-SLIDES-DESIGN 2.4, 2.8), over
// the dispatcher `turboslide mcp` and the studio's HTTP transport serve, so every input passes
// the action's own schema: motion.add answers ids, motion.list answers the rehearsal schedule,
// motion.set, move and remove change one effect, slide.transition and slide.advance write the
// slides or the deck; each write is one history entry; an unknown block, a split on a block
// without text and a remote url() are refused with a sentence; block.remove takes its effects and
// block.duplicate copies them; a deck without motion reads and writes unchanged. The CLI lines
// at the end run the same actions as `turboslide motion` and `turboslide slide transition`.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import type { Slide } from '@turboslide/schema/deck';
import { FREEFORM_SLIDE, WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import { openFileStore } from '@turboslide/store/file-store';

import { runCli } from './cli.ts';
import { lintLists } from './deps/theme.ts';
import type { MotionListResult, MotionWriteResult, StoreActionDeps } from './store-actions.ts';
import { registerStoreActions } from './store-actions.ts';

const agent: ActionContext = { author: { kind: 'agent', name: 'agent:motion-test' } };

let root: string;
let deckDir: string;
let dispatcher: Dispatcher;

function revision(): number {
  return (JSON.parse(readFileSync(join(deckDir, 'deck.json'), 'utf8')) as { revision: number })
    .revision;
}

function slideFile(id: string): Slide {
  return JSON.parse(readFileSync(join(deckDir, 'slides', `${id}.json`), 'utf8')) as Slide;
}

function call<T>(id: string, input: Record<string, unknown>): Promise<T> {
  return dispatcher.dispatch(id, input, agent) as Promise<T>;
}

async function write<T>(id: string, input: Record<string, unknown>): Promise<T> {
  return call<T>(id, { ...input, baseRevision: revision() });
}

describe('an agent animates a deck through the motion actions', () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-motion-'));
    deckDir = join(root, 'decks', 'gt-brand');
    mkdirSync(join(deckDir, 'slides'), { recursive: true });
    // the freeform slide joins the last section, so block.duplicate runs without a canvas measurer
    const sections = WORKED_DECK.sections.map((section, index, all) =>
      index === all.length - 1
        ? { ...section, slideIds: [...section.slideIds, FREEFORM_SLIDE.id] }
        : section,
    );
    writeFileSync(join(deckDir, 'deck.json'), canonicalJson({ ...WORKED_DECK, sections }));
    for (const slide of [...WORKED_SLIDES, FREEFORM_SLIDE])
      writeFileSync(join(deckDir, 'slides', `${slide.id}.json`), canonicalJson(slide));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    const deps: StoreActionDeps = { store: openFileStore({ dir: deckDir }), lint: lintLists() };
    dispatcher = createDispatcher();
    registerStoreActions(dispatcher, deps);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('a slide without motion lists no effects and an empty schedule', async () => {
    const listed = await call<MotionListResult>('motion.list', { slideId: 'content-rule' });
    expect(listed.effects).toEqual([]);
    expect(listed.transition).toBeNull();
    expect(listed.advance).toBeNull();
    expect(listed.schedule.steps).toBe(0);
    expect(slideFile('content-rule')).not.toHaveProperty('effects');
  });

  test('three clicks reveal the heading, the paragraph and the list word by word', async () => {
    const before = revision();
    const a = await write<MotionWriteResult & { effectId: string }>('motion.add', {
      slideId: 'content-rule',
      effect: { block: 'h', role: 'enter', motion: { preset: 'rise-in' } },
    });
    expect(a.effectId).toBe('fx-1');
    expect(revision()).toBe(before + 1);
    const b = await write<MotionWriteResult & { effectId: string }>('motion.add', {
      slideId: 'content-rule',
      effect: { block: 'p1', role: 'enter', motion: { preset: 'fade' }, durationMs: 400 },
    });
    const c = await write<MotionWriteResult & { effectId: string }>('motion.add', {
      slideId: 'content-rule',
      effect: {
        block: 'list',
        role: 'enter',
        motion: { preset: 'word-rise' },
        start: 'click',
        delayMs: 100,
      },
    });
    expect([b.effectId, c.effectId]).toEqual(['fx-2', 'fx-3']);
    expect(revision()).toBe(before + 3);
    const listed = await call<MotionListResult>('motion.list', { slideId: 'content-rule' });
    expect(listed.schedule.steps).toBe(3);
    expect(listed.schedule.effects.map((row) => [row.id, row.step, row.startMs])).toEqual([
      ['fx-1', 1, 0],
      ['fx-2', 2, 500],
      ['fx-3', 3, 1000],
    ]);
    expect(slideFile('content-rule').effects?.map((effect) => effect.id)).toEqual([
      'fx-1',
      'fx-2',
      'fx-3',
    ]);
  });

  test('motion.set, move and remove change one effect each in one write', async () => {
    const before = revision();
    const set = await write<MotionWriteResult>('motion.set', {
      slideId: 'content-rule',
      effectId: 'fx-2',
      path: '/start',
      value: 'with',
    });
    expect(set.effects.find((effect) => effect.id === 'fx-2')?.start).toBe('with');
    const moved = await write<MotionWriteResult>('motion.move', {
      slideId: 'content-rule',
      effectId: 'fx-3',
      index: 0,
    });
    expect(moved.effects.map((effect) => effect.id)).toEqual(['fx-3', 'fx-1', 'fx-2']);
    await write('motion.move', { slideId: 'content-rule', effectId: 'fx-3', index: 9 });
    expect(revision()).toBe(before + 3);
    await expect(
      write('motion.set', { slideId: 'content-rule', effectId: 'fx-1', path: '/id', value: 'x' }),
    ).rejects.toThrow(/does not change an effect id/);
  });

  test('bad input is refused with a sentence and writes nothing', async () => {
    const before = revision();
    await expect(
      write('motion.add', {
        slideId: 'content-rule',
        effect: { block: 'nope', role: 'enter', motion: { preset: 'fade' } },
      }),
    ).rejects.toThrow(/No block "nope" on slide "content-rule"/);
    // an icon holds no text; the worked deck's shot carries a caption, which a text preset splits
    await expect(
      write('motion.add', {
        slideId: 'free',
        effect: { block: 'ic', role: 'enter', motion: { preset: 'type-on' } },
      }),
    ).rejects.toThrow(/Block "ic" is a icon block with no text/);
    await expect(
      write('motion.add', {
        slideId: 'content-rule',
        effect: {
          block: 'h',
          role: 'emphasis',
          motion: {
            keyframes: [
              { at: 0, style: { background: 'url(https://evil.example/a.png)' } },
              { at: 1, style: { opacity: '1' } },
            ],
          },
        },
      }),
    ).rejects.toThrow(/url/);
    await expect(
      write('motion.set', {
        slideId: 'content-rule',
        effectId: 'fx-1',
        path: '/durationMs',
        value: 0,
      }),
    ).rejects.toThrow(/durationMs/);
    expect(revision()).toBe(before);
  });

  test('slide.transition and slide.advance write the slides, or the deck without slide ids', async () => {
    const onSlide = await write<{ slideIds: string[] }>('slide.transition', {
      slideIds: ['content-rule'],
      transition: { name: 'slide-fade', durationMs: 400, from: 'right' },
    });
    expect(onSlide.slideIds).toEqual(['content-rule']);
    expect(slideFile('content-rule').transition).toEqual({
      name: 'slide-fade',
      durationMs: 400,
      from: 'right',
    });
    await write('slide.transition', { transition: { name: 'crossfade', durationMs: 300 } });
    await write('slide.advance', { advance: { afterMs: 5000 } });
    const deck = JSON.parse(readFileSync(join(deckDir, 'deck.json'), 'utf8')) as {
      defaults?: Record<string, unknown>;
    };
    expect(deck.defaults?.transition).toEqual({ name: 'crossfade', durationMs: 300 });
    expect(deck.defaults?.advance).toEqual({ afterMs: 5000 });
    const listed = await call<MotionListResult>('motion.list', { slideId: 'the-production-site' });
    expect(listed.transition).toEqual({ name: 'crossfade', durationMs: 300 });
    expect(listed.advance).toEqual({ afterMs: 5000 });
    await write('slide.transition', { slideIds: ['content-rule'], transition: null });
    expect(slideFile('content-rule')).not.toHaveProperty('transition');
  });

  test('block.duplicate copies a block’s effects and block.remove takes them', async () => {
    await write('motion.add', {
      slideId: 'free',
      effect: { block: 'box', role: 'enter', motion: { preset: 'pop-in' } },
    });
    const duplicated = await write<{ blockIds: string[] }>('block.duplicate', {
      slideId: 'free',
      blockIds: ['box'],
    });
    const copy = duplicated.blockIds[0] ?? '';
    const effects = slideFile('free').effects ?? [];
    expect(effects.map((effect) => [effect.id, effect.block])).toEqual([
      ['fx-1', 'box'],
      ['fx-2', copy],
    ]);
    await write('block.remove', { slideId: 'free', blockId: 'box' });
    expect((slideFile('free').effects ?? []).map((effect) => effect.block)).toEqual([copy]);
    await write('block.remove', { slideId: 'free', blockId: copy });
    expect(slideFile('free')).not.toHaveProperty('effects');
  });

  test('the CLI runs the same actions', async () => {
    let stdout = '';
    const cli = (argv: string[]): Promise<number> =>
      runCli([...argv, '--deck', deckDir, '--json'], {
        cwd: root,
        env: { USER: 'kevin' },
        streams: { stdout: (text) => (stdout += text), stderr: () => undefined },
        stdin: async () => '',
      });
    expect(
      await cli([
        'motion',
        'add',
        'the-production-site',
        '--block',
        'h',
        '--enter',
        'slide-in',
        '--from',
        'left',
        '--ms',
        '700',
      ]),
    ).toBe(0);
    const added = JSON.parse(stdout) as MotionWriteResult & { effectId: string };
    expect(added.effects[0]).toMatchObject({
      id: 'fx-1',
      block: 'h',
      role: 'enter',
      motion: { preset: 'slide-in', from: 'left' },
      start: 'click',
      durationMs: 700,
    });
    stdout = '';
    expect(
      await cli(['slide', 'transition', 'zoom-through', '--ms', '500', '--slides', 'title']),
    ).toBe(0);
    expect(slideFile('title').transition).toEqual({ name: 'zoom-through', durationMs: 500 });
    stdout = '';
    expect(await cli(['motion', 'remove', 'the-production-site', 'fx-1'])).toBe(0);
    expect(slideFile('the-production-site')).not.toHaveProperty('effects');
  });
});
