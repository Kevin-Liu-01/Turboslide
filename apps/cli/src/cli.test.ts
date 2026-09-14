// The CLI over a fixture deck written to a temp directory: argument parsing, deck resolution,
// slide selection, info, validate, slides, slide get and lint through runCli with captured streams.
// Commands that need the render, import or standalone boundaries report their gap and exit 2
// until those packages land (deps/*.ts).
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { GOOD_SLIDE_IDS, document } from '@turboslide/lint/fixtures/deck';

import { flagList, flagString, parseArgs } from './args.ts';
import { runCli } from './cli.ts';
import { findDeckDir, loadDeck } from './deck-files.ts';
import { selectSlides } from './select.ts';

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

describe('turboslide cli', () => {
  let root: string;
  let deckDir: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-cli-'));
    deckDir = join(root, 'decks', 'lint-fixture');
    await mkdir(join(deckDir, 'slides'), { recursive: true });
    await writeFile(join(deckDir, 'deck.json'), JSON.stringify(document.deck, null, 2));
    for (const [id, slide] of Object.entries(document.slides))
      await writeFile(join(deckDir, 'slides', `${id}.json`), JSON.stringify(slide, null, 2));
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('parses positionals, valued flags, booleans and lists', () => {
    const p = parseArgs([
      'render',
      'all',
      '--theme',
      'light,dark',
      '--scale',
      '1',
      '--out',
      '.turboslide/render',
      '--json',
      '--widths=1440,390',
    ]);
    expect(p.positionals).toEqual(['render', 'all']);
    expect(flagString(p, 'scale')).toBe('1');
    expect(flagList(p, 'theme', [])).toEqual(['light', 'dark']);
    expect(flagList(p, 'widths', [])).toEqual(['1440', '390']);
    expect(p.flags.json).toBe(true);
    expect(() => parseArgs(['render', '--theme'])).toThrow(/needs a value/);
  });

  test('finds the deck from the flag, the environment, a parent directory or decks/', () => {
    expect(findDeckDir(root, 'decks/lint-fixture', {})).toBe(deckDir);
    expect(findDeckDir(join(deckDir, 'slides'), undefined, {})).toBe(deckDir);
    expect(findDeckDir(root, undefined, {})).toBe(deckDir);
    expect(findDeckDir(root, undefined, { TURBOSLIDE_DECK: deckDir })).toBe(deckDir);
    expect(() => findDeckDir(tmpdir(), undefined, {})).toThrow(/no deck found/);
  });

  test('selects slides by id, number and range in deck order', () => {
    const loaded = loadDeck(deckDir);
    expect(selectSlides(loaded, ['all'])).toEqual(loaded.order);
    expect(selectSlides(loaded, ['2-3', 'opener-prototemplate'])).toEqual([
      'opener-prototemplate',
      'content-rule',
      'the-production-site',
    ]);
    expect(() => selectSlides(loaded, ['99'])).toThrow(/no slide 99/);
    expect(() => selectSlides(loaded, ['nope'])).toThrow(/no slide "nope"/);
  });

  test('help exits 0 and an unknown command exits 2', async () => {
    expect((await run([], root)).code).toBe(0);
    expect((await run(['--help'], root)).stdout).toContain('Commands');
    const unknown = await run(['frobnicate'], root);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain('unknown command');
  });

  test('info reports counts and sections as JSON on stdout', async () => {
    const r = await run(['info', '--json'], root);
    expect(r.code).toBe(0);
    const info = JSON.parse(r.stdout) as {
      counts: { slides: number; sections: number };
      sections: { id: string; slides: { n: number; title: string }[] }[];
    };
    // the lint fixture deck: eight slides of round one plus canvas-title and canvas-objects
    // the lint fixture deck: ten slides of rounds one and two plus canvas-dither (gslides-parity SPEC-3 10.4)
    expect(info.counts).toMatchObject({ slides: 11, sections: 2, canvas: 4 });
    expect(info.sections[0]?.slides[1]).toMatchObject({ n: 2, title: 'The content rule' });
    expect(r.stderr).toContain('11 slides in 2 sections');
  });

  test('validate reports the planted schema violations and passes a clean deck', async () => {
    // The fixture plants three values the schema forbids (an empty license, an unknown icon, a key
    // of 170); the validator is the schema's and reports them at severity 3.
    const planted = await run(['validate', deckDir, '--json'], root);
    expect(planted.code).toBe(2);
    const report = JSON.parse(planted.stdout) as {
      ok: boolean;
      issues: { code: string; file: string }[];
    };
    expect(report.ok).toBe(false);
    expect(report.issues.filter((i) => i.code === 'invalid')).toHaveLength(3);
    const good = join(root, 'decks', 'good');
    await mkdir(join(good, 'slides'), { recursive: true });
    const keep = ['liquid-metal-diamond', 'site-home'];
    await writeFile(
      join(good, 'deck.json'),
      JSON.stringify({
        ...document.deck,
        id: 'good',
        sections: [{ id: 'brand', name: 'Brand', slideIds: GOOD_SLIDE_IDS }],
        assets: Object.fromEntries(keep.map((id) => [id, document.deck.assets[id]])),
      }),
    );
    for (const id of GOOD_SLIDE_IDS) {
      const slide = document.slides[id];
      const fixed = slide?.kind === 'opener' ? { ...slide, sectionId: 'brand' } : slide;
      await writeFile(join(good, 'slides', `${id}.json`), JSON.stringify(fixed));
    }
    const ok = await run(['validate', '--deck', good, '--json'], root);
    expect(ok.stderr).not.toContain('error ');
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.stdout)).toMatchObject({ ok: true, slides: 3 });
    const broken = join(root, 'decks', 'broken');
    await mkdir(join(broken, 'slides'), { recursive: true });
    await writeFile(
      join(broken, 'deck.json'),
      JSON.stringify({
        ...document.deck,
        id: 'broken',
        sections: [{ id: 's', name: 'S', slideIds: ['missing-slide'] }],
      }),
    );
    const bad = await run(['validate', '--deck', broken, '--json'], root);
    expect(bad.code).toBe(2);
    expect(bad.stdout).toContain('missing_file');
  });

  test('slides lists lint counts and slide get returns the slide', async () => {
    const list = await run(['slides', '--deck', deckDir, '--json'], root);
    expect(list.code).toBe(0);
    const rows = JSON.parse(list.stdout) as { id: string; lint: { s3: number } }[];
    expect(rows.find((r) => r.id === 'bad-copy')?.lint.s3).toBeGreaterThan(0);
    const one = await run(['slide', 'get', 'content-rule', '--deck', deckDir, '--json'], root);
    expect(one.code).toBe(0);
    expect(JSON.parse(one.stdout)).toMatchObject({ n: 2, slide: { id: 'content-rule' } });
    expect((await run(['slide', 'put', 'x', '--deck', deckDir], root)).code).toBe(2);
  });

  test('lint prints findings, gates on severity 3 and honors the baseline', async () => {
    const first = await run(
      ['lint', 'all', '--deck', deckDir, '--json', '--layers', 'static'],
      root,
    );
    expect(first.code).toBe(1);
    const findings = JSON.parse(first.stdout) as { rule: string; severity: number }[];
    expect(findings.some((f) => f.severity === 3)).toBe(true);
    expect(first.stderr).toContain('blocking:');
    const one = await run(
      [
        'lint',
        'content-rule',
        '--deck',
        deckDir,
        '--json',
        '--layers',
        'static',
        '--rule',
        'export/non-native',
      ],
      root,
    );
    expect(one.code).toBe(0);
    expect(
      (JSON.parse(one.stdout) as { rule: string }[]).every((f) => f.rule === 'export/non-native'),
    ).toBe(true);
    expect((await run(['lint', '--deck', deckDir, '--rule', 'no/such-rule'], root)).code).toBe(2);
    const baseline = await run(
      ['lint', 'all', '--deck', deckDir, '--baseline', '--layers', 'static'],
      root,
    );
    expect(baseline.code).toBe(0);
    const gated = await run(
      ['lint', 'all', '--deck', deckDir, '--json', '--layers', 'static'],
      root,
    );
    expect(gated.code).toBe(0);
    expect(gated.stderr).toContain('0 blocking');
  });

  test('bad inputs to import and lint --chrome exit 2', async () => {
    const i = await run(
      ['import', '/nowhere', '--into', 'x', '--decks', join(root, 'decks-out')],
      root,
    );
    expect(i.code).toBe(2);
    expect((await run(['lint', '--chrome'], root)).stderr).toContain('--url');
  }, 30_000);
});
