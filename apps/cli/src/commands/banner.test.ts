// The banner of gslides-parity SPEC-4 0.17 and 1.11: four lines of half block characters from the
// brand module's bitmap beside the word, the version, the hosted address, the action count and
// the effects backend; `turboslide --version` prints it and exits 0; the output is byte identical
// with NO_COLOR set (no colour is ever written); `turboslide info` prints the header before the
// deck facts. Run through runCli with captured streams over the lint fixture deck.
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { document } from '@turboslide/lint/fixtures/deck';
import { ACTION_IDS } from '@turboslide/schema/actions';
import { litCount, markBits, markBlocks } from '@turboslide/theme/brand';
import { SITE } from '@turboslide/theme/brand/site';

import { runCli } from '../cli.ts';
import { bannerFacts, bannerLines, cliVersion } from './banner.ts';

type Run = { code: number; stdout: string; stderr: string };

async function run(argv: string[], cwd: string, env: NodeJS.ProcessEnv = {}): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli(argv, {
    cwd,
    env: { USER: 'tester', ...env },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  return { code, stdout, stderr };
}

const BLOCKS = /^[█▀▄ ]{8} {2}/;
const ESCAPE = /\[/;

describe('the banner (SPEC-4 1.11)', () => {
  test('is four lines: the block glyph of markBlocks(8), then the word, the version, the address, the counts and the fourth line', () => {
    const facts = bannerFacts('checkout /tmp/x');
    const lines = bannerLines(facts);
    expect(lines).toHaveLength(4);
    for (const line of lines) expect(line).toMatch(BLOCKS);
    expect(lines.map((l) => l.slice(0, 8))).toEqual(markBlocks(8));
    expect(lines[0]).toBe(`${markBlocks(8)[0]}  Turboslide ${cliVersion()}`);
    expect(lines[1]).toContain(SITE.productionOrigin);
    expect(lines[2]).toMatch(
      new RegExp(`${ACTION_IDS.length} actions, effects backend: (native|wasm|typescript)$`),
    );
    expect(lines[3]?.endsWith('checkout /tmp/x')).toBe(true);
  });

  test('draws the solid form: 52 of 64 cells lit, the window as spaces in the lower left of the glyph', () => {
    /* the glyph is the favicon's bitmap at N = 8 (SPEC-4 0.17): the window is rows 4 to 6, columns 1 to 4 */
    expect(litCount(markBits(8))).toBe(52);
    const glyph = markBlocks(8);
    expect(glyph[0]).toBe('████████');
    expect(glyph[1]).toBe('████████');
    expect(glyph[2]).toBe('█    ███');
    expect(glyph[3]).toBe('█▄▄▄▄███');
  });

  test('reads the version from apps/cli/package.json', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as {
      version: string;
    };
    expect(cliVersion()).toBe(pkg.version);
  });

  test('carries no escape sequence, so NO_COLOR changes nothing', () => {
    for (const line of bannerLines(bannerFacts('x'))) expect(line).not.toMatch(ESCAPE);
  });
});

describe('turboslide --version and info', () => {
  let root: string;
  let deckDir: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-banner-'));
    deckDir = join(root, 'decks', 'lint-fixture');
    await mkdir(join(deckDir, 'slides'), { recursive: true });
    await writeFile(join(deckDir, 'deck.json'), JSON.stringify(document.deck, null, 2));
    for (const [id, slide] of Object.entries(document.slides))
      await writeFile(join(deckDir, 'slides', `${id}.json`), JSON.stringify(slide, null, 2));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('--version prints the banner on stdout and exits 0', async () => {
    const result = await run(['--version'], root);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    const lines = result.stdout.trimEnd().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines).toEqual(bannerLines(bannerFacts(lines[3]?.slice(10) ?? '')));
    expect(lines[3]).toMatch(/ {2}checkout \//);
  });

  test('--version is byte identical with NO_COLOR=1', async () => {
    const plain = await run(['--version'], root);
    const noColor = await run(['--version'], root, { NO_COLOR: '1' });
    expect(noColor.stdout).toBe(plain.stdout);
    expect(plain.stdout).not.toMatch(ESCAPE);
  });

  test('--version --json puts the facts on stdout and the banner on stderr', async () => {
    const result = await run(['--version', '--json'], root);
    expect(result.code).toBe(0);
    const facts = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(facts.name).toBe('Turboslide');
    expect(facts.version).toBe(cliVersion());
    expect(facts.actionCount).toBe(ACTION_IDS.length);
    expect(['native', 'wasm', 'typescript']).toContain(facts.backend);
    expect(result.stderr.trimEnd().split('\n')).toHaveLength(4);
  });

  test('info prints the header before the deck facts, with the deck on the fourth line', async () => {
    const result = await run(['info', '--deck', deckDir], root);
    expect(result.code).toBe(0);
    const lines = result.stdout.split('\n');
    expect(lines.slice(0, 4).every((line) => BLOCKS.test(line))).toBe(true);
    expect(lines[3]).toContain(
      `deck ${document.deck.id} at revision ${document.deck.revision}, ${Object.keys(document.slides).length} slides`,
    );
    expect(lines[4]).toContain(document.deck.title);
  });
});
