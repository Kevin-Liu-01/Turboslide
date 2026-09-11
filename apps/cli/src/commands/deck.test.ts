// `turboslide deck create` and `deck rename` over a scratch decks/ folder: create writes a blank
// deck and reports its counts as JSON; rename is one deck.set of /title through the store with
// the version log entry a write leaves; a stale --base-revision is refused with exit 1.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { runCli } from '../cli.ts';

type Run = { code: number; stdout: string; stderr: string };

async function run(argv: string[], cwd: string): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli(argv, {
    cwd,
    env: { USER: 'tester' },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  return { code, stdout, stderr };
}

describe('turboslide deck', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-deck-'));
    await mkdir(join(root, 'decks'), { recursive: true });
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('deck create --from blank writes decks/<slug> and reports the counts', async () => {
    const result = await run(['deck', 'create', 'Board review', '--from', 'blank', '--json'], root);
    expect(result.code).toBe(0);
    const created = JSON.parse(result.stdout) as {
      deckId: string;
      title: string;
      revision: number;
      counts: { slides: number; sections: number; assets: number };
    };
    expect(created).toMatchObject({
      deckId: 'board-review',
      title: 'Board review',
      revision: 0,
      counts: { slides: 1, sections: 1, assets: 0 },
    });
    const manifest = JSON.parse(
      await readFile(join(root, 'decks', 'board-review', 'deck.json'), 'utf8'),
    ) as { title: string };
    expect(manifest.title).toBe('Board review');
    const again = await run(['deck', 'create', 'Board review', '--from', 'blank'], root);
    expect(again.code).toBe(2);
    expect(again.stderr).toMatch(/exists already/);
  });

  test('deck rename writes deck.set /title and refuses a stale base revision', async () => {
    const deck = join(root, 'decks', 'board-review');
    const renamed = await run(
      ['deck', 'rename', 'Board review, Q4', '--deck', deck, '--json'],
      root,
    );
    expect(renamed.code).toBe(0);
    expect(JSON.parse(renamed.stdout)).toEqual({ title: 'Board review, Q4', revision: 1 });
    const manifest = JSON.parse(await readFile(join(deck, 'deck.json'), 'utf8')) as {
      title: string;
      revision: number;
    };
    expect(manifest).toMatchObject({ title: 'Board review, Q4', revision: 1 });
    const log = JSON.parse(await readFile(join(deck, 'versions', '1.json'), 'utf8')) as {
      mutations: { op: string; path?: string; value?: unknown }[];
    };
    expect(log.mutations).toEqual([{ op: 'deck.set', path: '/title', value: 'Board review, Q4' }]);
    const stale = await run(
      ['deck', 'rename', 'Nope', '--deck', deck, '--base-revision', '0', '--json'],
      root,
    );
    expect(stale.code).toBe(1);
    expect(JSON.parse(stale.stdout)).toMatchObject({ error: 'ConflictError', currentRevision: 1 });
  });
});
