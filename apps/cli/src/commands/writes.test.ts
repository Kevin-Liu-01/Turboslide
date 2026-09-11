// The typed write commands over a fixture deck in a temp directory (MILESTONES M2 item 2): slide
// put, patch, insert, remove and move; block set, insert, remove and move; sections set; version
// save, list and restore; lease; diff; fix. Every write takes --base-revision, --author and
// --json; a stale baseRevision prints the current document and exits 1; a rejected mutation exits
// 2. The render crops of diff --render need a browser and are covered by the acceptance run.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Slide } from '@turboslide/schema/deck';
import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { Mutation, Version } from '@turboslide/schema/mutations';

import { runCli } from '../cli.ts';
import { cropBox, touchedTargets } from './diff.ts';

type Run = { code: number; stdout: string; stderr: string; json: unknown };

let deckDir: string;
let root: string;

async function run(argv: string[], stdin = ''): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli([...argv, '--deck', deckDir], {
    cwd: root,
    env: { USER: 'kevin' },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => stdin,
  });
  let json: unknown;
  if (argv.includes('--json') && stdout.trim() !== '') json = JSON.parse(stdout) as unknown;
  return { code, stdout, stderr, json };
}

function manifest(): {
  revision: number;
  sections: { id: string; slideIds: string[] }[];
  title: string;
} {
  return JSON.parse(readFileSync(join(deckDir, 'deck.json'), 'utf8')) as {
    revision: number;
    sections: { id: string; slideIds: string[] }[];
    title: string;
  };
}

function slideFile(id: string): Slide {
  return JSON.parse(readFileSync(join(deckDir, 'slides', `${id}.json`), 'utf8')) as Slide;
}

type SlideResult = { slide: Slide; revision: number; findings: { rule: string }[] };

describe('turboslide writes', () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-writes-'));
    deckDir = join(root, 'decks', 'gt-brand');
    mkdirSync(join(deckDir, 'slides'), { recursive: true });
    writeFileSync(join(deckDir, 'deck.json'), canonicalJson(WORKED_DECK));
    for (const slide of WORKED_SLIDES)
      writeFileSync(join(deckDir, 'slides', `${slide.id}.json`), canonicalJson(slide));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('block set writes one property with the acceptance line and returns the slide', async () => {
    const r = await run([
      'block',
      'set',
      'content-rule#list',
      '/size',
      '22',
      '--base-revision',
      '412',
      '--author',
      'agent:m2-accept',
      '--json',
    ]);
    expect(r.code).toBe(0);
    // With --json the human summary goes to stderr and the one JSON document to stdout.
    expect(r.stderr).toContain('revision 413');
    const result = r.json as SlideResult;
    expect(result.revision).toBe(413);
    expect(result.slide.kind === 'content' && result.slide.slots.right?.[0]).toMatchObject({
      id: 'list',
      size: 22,
    });
    expect(Array.isArray(result.findings)).toBe(true);
    expect(manifest().revision).toBe(413);
    expect(slideFile('content-rule')).toEqual(result.slide);
    const versions = JSON.parse(readFileSync(join(deckDir, 'versions', '1.json'), 'utf8')) as {
      author: { kind: string; runId?: string };
      mutations: Mutation[];
    };
    expect(versions.author).toEqual({ kind: 'agent', name: 'agent', runId: 'm2-accept' });
    expect(versions.mutations[0]).toMatchObject({ op: 'block.set', path: '/size', value: 22 });
  });

  test('a stale base revision is rejected with the current document and exit 1', async () => {
    const r = await run([
      'block',
      'set',
      'content-rule#list',
      '/size',
      '24',
      '--base-revision',
      '0',
      '--json',
    ]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/stale/);
    const body = r.json as {
      error: string;
      status: number;
      currentRevision: number;
      current: { deck: { revision: number }; slides: Record<string, unknown> };
    };
    expect(body.error).toBe('ConflictError');
    expect(body.status).toBe(409);
    expect(body.currentRevision).toBe(413);
    expect(body.current.deck.revision).toBe(413);
    expect(Object.keys(body.current.slides)).toHaveLength(7);
    expect(manifest().revision).toBe(413);
    expect(existsSync(join(deckDir, 'versions', '2.json'))).toBe(false);
  });

  test('a rejected mutation is a usage error (exit 2) and writes nothing', async () => {
    const unknown = await run(['block', 'set', 'content-rule#nope', '/size', '22', '--json']);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain('No block "nope"');
    const badValue = await run(['block', 'set', 'content-rule#list', '/size', '23', '--json']);
    expect(badValue.code).toBe(2);
    expect(manifest().revision).toBe(413);
    const noValue = await run(['block', 'set', 'content-rule#list', '/size']);
    expect(noValue.code).toBe(2);
    expect(noValue.stderr).toContain('--delete');
  });

  test('block set parses JSON values, text values and --delete; the base revision defaults to the current one', async () => {
    const text = await run([
      'block',
      'set',
      'content-rule#h',
      '/text',
      'The content rule.',
      '--json',
    ]);
    expect(text.code).toBe(0);
    const heading = slideFile('content-rule');
    expect(heading.kind === 'content' && heading.slots.left?.[0]).toMatchObject({
      id: 'h',
      text: 'The content rule.',
    });
    expect((text.json as SlideResult).findings.some((f) => f.rule === 'copy/heading-period')).toBe(
      true,
    );
    const ratio = await run([
      'slide',
      'patch',
      'content-rule',
      '--set',
      '/layout/ratio=4/8',
      '--json',
    ]);
    expect(ratio.code).toBe(0);
    expect((ratio.json as SlideResult).slide).toMatchObject({ layout: { ratio: '4/8' } });
    const removed = await run(['block', 'set', 'content-rule#list', '/size', '--delete', '--json']);
    expect(removed.code).toBe(0);
    const list = slideFile('content-rule');
    expect(list.kind === 'content' && list.slots.right?.[0]).not.toHaveProperty('size');
    expect(manifest().revision).toBe(416);
  });

  test('slide put replaces from stdin, patch takes a mutation list, and both check the id', async () => {
    const thesis = {
      schemaVersion: 1,
      id: 'thesis',
      kind: 'statement',
      big: 'Every product in every language',
      measure: 22,
    };
    const put = await run(['slide', 'put', 'thesis', '--json'], JSON.stringify(thesis));
    expect(put.code).toBe(0);
    expect((put.json as SlideResult).slide).toMatchObject({ id: 'thesis', measure: 22 });
    expect(slideFile('thesis')).toMatchObject({ measure: 22 });
    const wrongId = await run(['slide', 'put', 'title', '--json'], JSON.stringify(thesis));
    expect(wrongId.code).toBe(2);
    expect(wrongId.stderr).toMatch(/must equal/);
    const empty = await run(['slide', 'put', 'thesis', '--json'], '');
    expect(empty.code).toBe(2);
    expect(empty.stderr).toMatch(/stdin/);
    const file = join(root, 'mutations.json');
    writeFileSync(
      file,
      JSON.stringify([
        { op: 'slide.set', slideId: 'thesis', path: '/notes', value: 'Read slowly.' },
      ]),
    );
    const patched = await run(['slide', 'patch', 'thesis', '--file', file, '--json']);
    expect(patched.code).toBe(0);
    expect((patched.json as SlideResult).slide).toMatchObject({ notes: 'Read slowly.' });
    const other = await run(
      ['slide', 'patch', 'title', '--mutations', '--json'],
      JSON.stringify([{ op: 'slide.set', slideId: 'thesis', path: '/notes', value: 'x' }]),
    );
    expect(other.code).toBe(2);
    expect(other.stderr).toMatch(/addresses slide "thesis"/);
    const unset = await run(['slide', 'patch', 'thesis', '--unset', '/notes', '--json']);
    expect(unset.code).toBe(0);
    expect(slideFile('thesis')).not.toHaveProperty('notes');
  });

  test('slide insert, move and remove keep the outline and the files in step', async () => {
    const why = { schemaVersion: 1, id: 'why', kind: 'statement', big: 'Why the redesign' };
    const inserted = await run(
      ['slide', 'insert', '--section', 'brand', '--after', 'thesis', '--json'],
      JSON.stringify(why),
    );
    expect(inserted.code).toBe(0);
    const body = inserted.json as {
      slide: Slide;
      revision: number;
      outline: { id: string; slides: { id: string; n: number }[] }[];
    };
    expect(body.slide.id).toBe('why');
    expect(body.outline[0]?.slides.map((s) => s.id)).toEqual([
      'opener-brand',
      'title',
      'thesis',
      'why',
      'mood-earth',
      'content-rule',
    ]);
    expect(existsSync(join(deckDir, 'slides', 'why.json'))).toBe(true);
    const moved = await run(['slide', 'move', 'why', '--to', 'website', '--json']);
    expect(moved.code).toBe(0);
    expect(
      (moved.json as { sections: { id: string; slideIds: string[] }[] }).sections[1],
    ).toMatchObject({
      id: 'website',
      slideIds: ['why', 'the-production-site'],
    });
    const missingTo = await run(['slide', 'move', 'why', '--json']);
    expect(missingTo.code).toBe(2);
    const removed = await run(['slide', 'remove', 'why', '--json']);
    expect(removed.code).toBe(0);
    expect(existsSync(join(deckDir, 'slides', 'why.json'))).toBe(false);
    expect(manifest().sections[1]?.slideIds).toEqual(['the-production-site']);
    const again = await run(['slide', 'remove', 'why', '--json']);
    expect(again.code).toBe(2);
  });

  test('block insert, move and remove address slots and blocks', async () => {
    const p2 = { id: 'p2', type: 'paragraph', text: 'A second paragraph.' };
    const inserted = await run(
      ['block', 'insert', 'content-rule', '--slot', 'left', '--after', 'p1', '--json'],
      JSON.stringify(p2),
    );
    expect(inserted.code).toBe(0);
    const left = (inserted.json as SlideResult).slide;
    expect(left.kind === 'content' && left.slots.left?.map((b) => b.id)).toEqual(['h', 'p1', 'p2']);
    const badSlot = await run(
      ['block', 'insert', 'content-rule', '--slot', 'nowhere', '--json'],
      JSON.stringify(p2),
    );
    expect(badSlot.code).toBe(2);
    const moved = await run(['block', 'move', 'content-rule#p2', '--slot', 'right', '--json']);
    expect(moved.code).toBe(0);
    const right = (moved.json as SlideResult).slide;
    expect(right.kind === 'content' && right.slots.right?.map((b) => b.id)).toEqual(['p2', 'list']);
    const removed = await run(['block', 'remove', 'content-rule#p2', '--json']);
    expect(removed.code).toBe(0);
    const after = (removed.json as SlideResult).slide;
    expect(after.kind === 'content' && after.slots.right?.map((b) => b.id)).toEqual(['list']);
    expect((await run(['block', 'remove', 'content-rule', '--json'])).code).toBe(2);
  });

  test('sections set replaces the order from stdin', async () => {
    const before = manifest().sections;
    const swapped = [before[2], before[1], before[0]];
    const r = await run(['sections', 'set', '--json'], JSON.stringify(swapped));
    expect(r.code).toBe(0);
    expect(manifest().sections.map((s) => s.id)).toEqual([
      'prototemplate-and-glyphfield',
      'website',
      'brand',
    ]);
    const back = await run(['sections', 'set', '--json'], JSON.stringify(before));
    expect(back.code).toBe(0);
    const invalid = await run(['sections', 'set', '--json'], JSON.stringify([{ id: 'x' }]));
    expect(invalid.code).toBe(2);
    expect((await run(['sections', 'frob'])).code).toBe(2);
  });

  test('version save, list and restore', async () => {
    const revision = manifest().revision;
    const saved = await run(['version', 'save', '-m', 'm2 acceptance', '--json']);
    expect(saved.code).toBe(0);
    expect(saved.json).toMatchObject({
      revision,
      note: 'm2 acceptance',
      author: { kind: 'human', name: 'kevin' },
    });
    const noNote = await run(['version', 'save', '--json']);
    expect(noNote.code).toBe(2);
    const list = await run(['version', 'list', '--json']);
    expect(list.code).toBe(0);
    const versions = list.json as Version[];
    expect(versions.some((v) => v.author.kind === 'agent' && v.author.runId === 'm2-accept')).toBe(
      true,
    );
    expect(versions[versions.length - 1]).toMatchObject({ note: 'm2 acceptance' });
    const named = await run(['version', 'list', '--named', '--json']);
    expect((named.json as Version[]).map((v) => v.note)).toEqual(['m2 acceptance']);
    const human = await run(['version', 'list']);
    expect(human.stdout).toContain('agent:m2-accept');
    expect(human.stdout).toContain('"m2 acceptance"');

    // Restore version 1 (the size change alone): the heading loses its period again, the
    // later edits are undone, and the restore is a new entry with the version.restore op.
    const restored = await run(['version', 'restore', '1', '--json']);
    expect(restored.code).toBe(0);
    expect(restored.json).toEqual({ revision: revision + 1 });
    const heading = slideFile('content-rule');
    expect(heading.kind === 'content' && heading.slots.left?.[0]).toMatchObject({
      text: 'The content rule',
    });
    expect(heading.kind === 'content' && heading.slots.right?.[0]).toMatchObject({
      id: 'list',
      size: 22,
    });
    const log = (await run(['version', 'list', '--json'])).json as Version[];
    expect(log[log.length - 1]?.mutations).toEqual([{ op: 'version.restore', n: 1 }]);
    expect((await run(['version', 'restore', '99', '--json'])).code).toBe(2);
    expect((await run(['version', 'restore', 'x'])).code).toBe(2);
  });

  test('diff prints the mutation log in prose for a range and for --staged', async () => {
    const current = manifest().revision;
    const range = await run(['diff', '412', '413', '--json']);
    expect(range.code).toBe(0);
    const body = range.json as { from: number; to: number; mutations: Mutation[]; prose: string[] };
    expect(body).toMatchObject({ from: 412, to: 413 });
    expect(body.mutations).toEqual([
      { op: 'block.set', slideId: 'content-rule', blockId: 'list', path: '/size', value: 22 },
    ]);
    expect(body.prose[0]).toBe('slide content-rule: block list /size changed to 22');
    expect(range.stdout).not.toContain('crops');
    // Staged: the last named version sits below the current revision (the restore came after it).
    const staged = await run(['diff', '--staged', '--json']);
    expect(staged.code).toBe(0);
    const stagedBody = staged.json as { from: number; to: number; prose: string[] };
    expect(stagedBody.to).toBe(current);
    expect(stagedBody.from).toBe(current - 1);
    expect(stagedBody.prose.join('\n')).toContain(
      '/text changed from The content rule. to The content rule',
    );
    const bare = await run(['diff', '--json']);
    expect(bare.json).toEqual(staged.json);
    expect((await run(['diff', '1', '--json'])).code).toBe(2);
    expect((await run(['diff', '412', '--staged'])).code).toBe(2);
    const human = await run(['diff', '412']);
    expect(human.code).toBe(0);
    expect(human.stdout).toMatch(/^diff: revision 412 to \d+, \d+ mutation\(s\)/);
  });

  test('fix applies the fix mutations of findings that carry one and reports what remains', async () => {
    await run(['block', 'set', 'content-rule#h', '/text', 'The content rule.', '--json']);
    const dry = await run([
      'fix',
      'content-rule',
      '--rule',
      'copy/heading-period',
      '--dry-run',
      '--json',
    ]);
    expect(dry.code).toBe(0);
    const dryBody = dry.json as {
      applied: { rule: string }[];
      remaining: unknown[];
      revision: number;
    };
    expect(dryBody.applied.map((f) => f.rule)).toEqual(['copy/heading-period']);
    expect(dryBody.remaining).toEqual([]);
    expect(dryBody.revision).toBe(manifest().revision);
    const heading = slideFile('content-rule');
    expect(heading.kind === 'content' && heading.slots.left?.[0]).toMatchObject({
      text: 'The content rule.',
    });

    const revision = manifest().revision;
    const applied = await run(['fix', 'content-rule', '--rule', 'copy/heading-period', '--json']);
    expect(applied.code).toBe(0);
    const body = applied.json as {
      applied: { rule: string }[];
      remaining: unknown[];
      revision: number;
    };
    expect(body.applied).toHaveLength(1);
    expect(body.revision).toBe(revision + 1);
    const fixed = slideFile('content-rule');
    expect(fixed.kind === 'content' && fixed.slots.left?.[0]).toMatchObject({
      text: 'The content rule',
    });
    const nothing = await run(['fix', 'content-rule', '--rule', 'copy/heading-period', '--json']);
    expect(nothing.code).toBe(0);
    expect((nothing.json as { revision: number }).revision).toBe(revision + 1);
    expect((await run(['fix', 'all', '--rule', 'no/such'])).code).toBe(2);
  });

  test('lease takes, refuses another author, forces and releases; agent writes are refused, human writes warn', async () => {
    const taken = await run(['lease', 'content-rule', '--minutes', '5', '--json']);
    expect(taken.code).toBe(0);
    expect(taken.json).toMatchObject({
      slideId: 'content-rule',
      holder: { kind: 'human', name: 'kevin' },
    });
    const refused = await run(['lease', 'content-rule', '--author', 'agent:r1', '--json']);
    expect(refused.code).toBe(1);
    expect(refused.json).toMatchObject({
      error: 'ConflictError',
      status: 409,
      holder: { name: 'kevin' },
    });
    // M4: an agent write to a slide another author holds is 409 with the holder and the current
    // document unless --force; a human's write warns and goes through (SPEC 6.7)
    const agentWrite = await run([
      'block',
      'set',
      'content-rule#list',
      '/size',
      '20',
      '--author',
      'agent:r1',
      '--json',
    ]);
    expect(agentWrite.code).toBe(1);
    expect(agentWrite.json).toMatchObject({
      error: 'ConflictError',
      status: 409,
      holder: { name: 'kevin' },
    });
    expect((agentWrite.json as { message: string }).message).toMatch(
      /leased by kevin .*pass force/,
    );
    const agentForced = await run([
      'block',
      'set',
      'content-rule#list',
      '/size',
      '20',
      '--author',
      'agent:r1',
      '--force',
      '--json',
    ]);
    expect(agentForced.code).toBe(0);
    const warned = await run([
      'block',
      'set',
      'content-rule#list',
      '/size',
      '22',
      '--author',
      'designer',
      '--json',
    ]);
    expect(warned.code).toBe(0);
    expect(warned.stderr).toMatch(/leased by kevin/);
    const forced = await run([
      'lease',
      'content-rule',
      '--author',
      'agent:r1',
      '--force',
      '--json',
    ]);
    expect(forced.code).toBe(0);
    expect(forced.json).toMatchObject({ holder: { kind: 'agent', runId: 'r1' } });
    const notMine = await run(['lease', 'content-rule', '--release', '--json']);
    expect(notMine.code).toBe(2);
    const released = await run([
      'lease',
      'content-rule',
      '--release',
      '--author',
      'agent:r1',
      '--json',
    ]);
    expect(released.code).toBe(0);
    expect((await run(['lease', 'no-such-slide'])).code).toBe(2);
    expect((await run(['lease'])).code).toBe(2);
  });

  test('--render is a switch on diff and a directory on lint', async () => {
    const { parseArgs, flagBoolean, flagString } = await import('../args.ts');
    const bare = parseArgs(['diff', '--staged', '--render', '--out', 'x']);
    expect(flagBoolean(bare, 'render')).toBe(true);
    expect(flagString(bare, 'out')).toBe('x');
    const last = parseArgs(['diff', '--render']);
    expect(flagBoolean(last, 'render')).toBe(true);
    const dir = parseArgs(['lint', '--render', '.turboslide/render']);
    expect(flagString(dir, 'render')).toBe('.turboslide/render');
  });

  test('diff helpers: touched targets and crop boxes', () => {
    expect(
      touchedTargets([
        { op: 'block.set', slideId: 'a', blockId: 'x', path: '/p', value: 1 },
        { op: 'block.set', slideId: 'a', blockId: 'x', path: '/q', value: 1 },
        { op: 'block.remove', slideId: 'b', blockId: 'y' },
        { op: 'slide.set', slideId: 'b', path: '/notes', value: 'n' },
        { op: 'deck.set', path: '/title', value: 't' },
      ]),
    ).toEqual([{ slideId: 'a', blockId: 'x' }, { slideId: 'b' }]);
    expect(cropBox([10.4, 20.6, 100.2, 50], [1600, 900])).toEqual({
      left: 10,
      top: 20,
      width: 101,
      height: 51,
    });
    expect(cropBox([1590, 890, 100, 100], [1600, 900])).toEqual({
      left: 1590,
      top: 890,
      width: 10,
      height: 10,
    });
    expect(cropBox([-5, -5, 2, 2], [1600, 900])).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });
});
