// deck.set on a local decks folder (gslides-parity SPEC 7.2.3 to 7.2.5; the round's rule that
// every capability of the editor is an action): `turboslide deck set /defaults/appearance light`
// and `/defaults/counter off` write the fields the Themes panel and Slide numbers write,
// `--unset` removes one, `/title` renames, and `/trashedAt` is refused (deck.trash owns it). The
// MCP tool is deck_set. The temp deck comes from `deck create --from blank`.
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { runCli } from '../cli.ts';

type Run = { code: number; stdout: string; stderr: string; json: unknown };

const REPO_DECKS = join(import.meta.dirname, '..', '..', '..', '..', 'decks');

let root: string;
let decksDir: string;
let deckDir: string;

async function run(argv: string[]): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli([...argv, '--json'], {
    cwd: root,
    env: { USER: 'tester', TURBOSLIDE_DECKS_DIR: decksDir },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  let json: unknown;
  if (stdout.trim() !== '') json = JSON.parse(stdout) as unknown;
  return { code, stdout, stderr, json };
}

function manifest(): { title: string; revision: number; defaults?: Record<string, unknown> } {
  return JSON.parse(readFileSync(join(deckDir, 'deck.json'), 'utf8')) as {
    title: string;
    revision: number;
    defaults?: Record<string, unknown>;
  };
}

describe('deck set writes the manifest fields the panels write (deck.set, deck_set)', () => {
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-deck-set-'));
    decksDir = join(root, 'decks');
    mkdirSync(join(decksDir, 'templates'), { recursive: true });
    symlinkSync(join(REPO_DECKS, 'templates', 'blank'), join(decksDir, 'templates', 'blank'));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    const created = await run(['deck', 'create', 'Untitled presentation', '--from', 'blank']);
    expect(created.code, created.stderr).toBe(0);
    deckDir = join(decksDir, 'untitled-presentation');
  });

  afterAll(() => {
    unlinkSync(join(decksDir, 'templates', 'blank'));
    rmSync(root, { recursive: true, force: true });
  });

  test('/defaults/appearance and /defaults/counter land in deck.json as one write each', async () => {
    const light = await run(['deck', 'set', '/defaults/appearance', 'light', '--deck', deckDir]);
    expect(light.code, light.stderr).toBe(0);
    expect(light.json).toMatchObject({ path: '/defaults/appearance', value: 'light', revision: 1 });
    expect(manifest().defaults?.appearance).toBe('light');
    const counter = await run(['deck', 'set', '/defaults/counter', 'off', '--deck', deckDir]);
    expect(counter.code, counter.stderr).toBe(0);
    expect(counter.json).toMatchObject({ path: '/defaults/counter', value: 'off', revision: 2 });
    expect(manifest().defaults).toEqual({ appearance: 'light', counter: 'off' });
    const validated = await run(['validate', deckDir]);
    expect(validated.code, validated.stderr).toBe(0);
  });

  test('--unset removes a field and /title renames', async () => {
    const unset = await run(['deck', 'set', '/defaults/counter', '--unset', '--deck', deckDir]);
    expect(unset.code, unset.stderr).toBe(0);
    expect(unset.json).toEqual({ path: '/defaults/counter', revision: 3 });
    expect(manifest().defaults).toEqual({ appearance: 'light' });
    const title = await run(['deck', 'set', '/title', 'Q4 review', '--deck', deckDir]);
    expect(title.code, title.stderr).toBe(0);
    expect(manifest().title).toBe('Q4 review');
    // the switch written before the path: the parser reads the path as the flag's value and the
    // command accepts that spelling too
    const notes = await run(['deck', 'set', '/defaults/notes', '"aside"', '--deck', deckDir]);
    expect(notes.code, notes.stderr).toBe(0);
    const early = await run(['deck', 'set', '--unset', '/defaults/notes', '--deck', deckDir]);
    expect(early.code, early.stderr).toBe(0);
    expect(early.json).toMatchObject({ path: '/defaults/notes' });
    expect(manifest().defaults).toEqual({ appearance: 'light' });
  });

  test('a JSON value parses and /trashedAt is refused', async () => {
    const number = await run(['deck', 'set', '/defaults/notes', '"talk track"', '--deck', deckDir]);
    expect(number.code, number.stderr).toBe(0);
    expect(number.json).toMatchObject({ value: 'talk track' });
    const trashed = await run([
      'deck',
      'set',
      '/trashedAt',
      '2026-09-12T00:00:00Z',
      '--deck',
      deckDir,
    ]);
    expect(trashed.code).not.toBe(0);
    expect(trashed.stderr).toMatch(/trashedAt|pointer|path/);
    const missing = await run(['deck', 'set', '/defaults/appearance', '--deck', deckDir]);
    expect(missing.code).not.toBe(0);
    expect(missing.stderr).toContain('needs a value');
  });
});
