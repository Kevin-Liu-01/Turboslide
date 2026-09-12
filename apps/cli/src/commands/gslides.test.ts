// The Google Slides parity round's CLI (docs/gslides-parity/MILESTONES.md, B1 acceptance): in a
// temp deck created with `turboslide deck create --from blank` (the committed blank template with
// its four starter pictures), `slide new --layout big-number`, `slide apply-layout <id> title`,
// `text replace Acme Globex`, `slide skip <id>`, `deck copy <id> --name Copy`, `deck trash <id>`,
// `deck list`, `deck restore <id>` and `deck remove <id> --confirm` each exit 0 with --json and
// the deck validates after each step. The other new actions (slide.duplicate, slide.import,
// block.duplicate, export.text) run the same way. Every id of SPEC 7.5 is named here so the
// coverage test finds it: slide.new, slide.duplicate, slide.skip, slide.applyLayout, slide.import,
// block.duplicate, text.replaceAll, deck.list, deck.copy, deck.trash, deck.restore, deck.remove,
// export.text, view.zoom (the window action the editor answers; its MCP tool is deck_set_zoom).
import {
  existsSync,
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

import type { Slide } from '@turboslide/schema/deck';
import { LAYOUT_IDS } from '@turboslide/schema/deck';
import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';

import { runCli } from '../cli.ts';
import { replaceInText } from '../store-actions.ts';

type Run = { code: number; stdout: string; stderr: string; json: unknown };

const REPO_DECKS = join(import.meta.dirname, '..', '..', '..', '..', 'decks');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

let root: string;
let decksDir: string;
let deckDir: string;

async function run(argv: string[], cwd = root): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli([...argv, '--json'], {
    cwd,
    env: { USER: 'tester', TURBOSLIDE_DECKS_DIR: decksDir },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  let json: unknown;
  if (stdout.trim() !== '') json = JSON.parse(stdout) as unknown;
  return { code, stdout, stderr, json };
}

/** `turboslide validate <dir>` exits 0 and reports ok. */
async function validates(dir = deckDir): Promise<void> {
  const result = await run(['validate', dir]);
  expect(result.code, result.stderr).toBe(0);
  expect(result.json).toMatchObject({ ok: true });
}

function manifest(dir = deckDir): {
  revision: number;
  sections: { id: string; slideIds: string[] }[];
  trashedAt?: string;
  title: string;
} {
  return JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as ReturnType<typeof manifest>;
}

function slideFile(id: string, dir = deckDir): Slide {
  return JSON.parse(readFileSync(join(dir, 'slides', `${id}.json`), 'utf8')) as Slide;
}

/** The worked deck under decks/, the source of `slide import`. */
function writeWorkedDeck(id: string): void {
  const dir = join(decksDir, id);
  mkdirSync(join(dir, 'slides'), { recursive: true });
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'deck.json'), canonicalJson({ ...WORKED_DECK, id }));
  for (const slide of WORKED_SLIDES)
    writeFileSync(join(dir, 'slides', `${slide.id}.json`), canonicalJson(slide));
  for (const asset of Object.values(WORKED_DECK.assets))
    for (const twin of Object.values(asset.twins)) writeFileSync(join(dir, twin), PNG);
}

describe('the Google Slides parity actions on a local decks folder', () => {
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-gslides-'));
    decksDir = join(root, 'decks');
    mkdirSync(join(decksDir, 'templates'), { recursive: true });
    // the committed blank template, with its starter pictures
    symlinkSync(join(REPO_DECKS, 'templates', 'blank'), join(decksDir, 'templates', 'blank'));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    writeWorkedDeck('worked');
    deckDir = join(decksDir, 'untitled-presentation');
  });

  afterAll(() => {
    unlinkSync(join(decksDir, 'templates', 'blank'));
    rmSync(root, { recursive: true, force: true });
  });

  test('deck create --from blank makes Untitled presentation with one empty title slide and the four starter pictures', async () => {
    const created = await run(['deck', 'create', 'Untitled presentation', '--from', 'blank']);
    expect(created.code, created.stderr).toBe(0);
    expect(created.json).toMatchObject({
      deckId: 'untitled-presentation',
      title: 'Untitled presentation',
      revision: 0,
      counts: { slides: 1, sections: 1, assets: 4 },
    });
    expect(slideFile('title')).toMatchObject({
      kind: 'title',
      heading: '',
      lead: '',
      template: 'title',
    });
    expect(existsSync(join(deckDir, 'assets', 'opener-brand-dark.jpg'))).toBe(true);
    await validates();
  });

  test('slide new --layout big-number inserts <layout>-1 after the anchor with empty placeholders (slide.new)', async () => {
    const result = await run([
      'slide',
      'new',
      '--layout',
      'big-number',
      '--after',
      'title',
      '--deck',
      deckDir,
    ]);
    expect(result.code, result.stderr).toBe(0);
    const body = result.json as {
      slide: Slide;
      revision: number;
      outline: { slides: { id: string }[] }[];
    };
    expect(body.slide).toMatchObject({
      id: 'big-number-1',
      kind: 'content',
      template: 'big-number',
    });
    expect(body.revision).toBe(1);
    expect(body.outline[0]?.slides.map((slide) => slide.id)).toEqual(['title', 'big-number-1']);
    const stored = slideFile('big-number-1');
    expect(stored.kind === 'content' && stored.slots.main?.[0]).toMatchObject({
      type: 'heading',
      level: 'big',
      text: '',
    });
    await validates();
    // every layout inserts on the blank deck, the picture layouts included; the Section header
    // is the next test's, since it starts a section
    for (const layout of LAYOUT_IDS.filter((id) => id !== 'opener')) {
      const again = await run([
        'slide',
        'new',
        '--layout',
        layout,
        '--after',
        'big-number-1',
        '--deck',
        deckDir,
      ]);
      expect(again.code, `${layout}: ${again.stderr}`).toBe(0);
      const made = (again.json as { slide: Slide }).slide;
      const removed = await run(['slide', 'remove', made.id, '--deck', deckDir]);
      expect(removed.code, removed.stderr).toBe(0);
    }
    await validates();
    const bad = await run(['slide', 'new', '--layout', 'poster', '--deck', deckDir]);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toMatch(/a layout is one of/);
  });

  test('a Section header after a slide starts a new section that takes the slides after it', async () => {
    const before = manifest().revision;
    const result = await run([
      'slide',
      'new',
      '--layout',
      'opener',
      '--after',
      'title',
      '--deck',
      deckDir,
    ]);
    expect(result.code, result.stderr).toBe(0);
    const made = (result.json as { slide: Slide }).slide;
    expect(made).toMatchObject({ id: 'opener-1', kind: 'opener', sectionId: 'opener-1' });
    expect(manifest().sections).toEqual([
      { id: 'deck', name: 'Deck', slideIds: ['title'] },
      { id: 'opener-1', name: 'Section 2', slideIds: ['opener-1', 'big-number-1'] },
    ]);
    expect(manifest().revision).toBe(before + 1);
    await validates();
  });

  test('block set fills the placeholders and slide apply-layout <id> title moves the copy, dropping what does not fit (slide.applyLayout)', async () => {
    const heading = await run([
      'block',
      'set',
      'big-number-1#h',
      '/text',
      '42 percent',
      '--deck',
      deckDir,
    ]);
    expect(heading.code, heading.stderr).toBe(0);
    const note = await run([
      'block',
      'set',
      'big-number-1#p1',
      '/text',
      'Acme grew 42 percent.',
      '--deck',
      deckDir,
    ]);
    expect(note.code, note.stderr).toBe(0);
    const extra = await run([
      'block',
      'insert',
      'big-number-1',
      '--slot',
      'main',
      '--after',
      'p1',
      '--file',
      writeJson('p2.json', { id: 'p2', type: 'paragraph', text: 'A second paragraph about Acme.' }),
      '--deck',
      deckDir,
    ]);
    expect(extra.code, extra.stderr).toBe(0);
    const applied = await run([
      'slide',
      'apply-layout',
      'big-number-1',
      'title',
      '--deck',
      deckDir,
    ]);
    expect(applied.code, applied.stderr).toBe(0);
    const body = applied.json as {
      slides: Slide[];
      dropped: { slideId: string; blockIds: string[] }[];
      moved: string[];
      revision: number;
    };
    expect(body.slides[0]).toMatchObject({
      kind: 'title',
      heading: '42 percent',
      lead: 'Acme grew 42 percent.',
      template: 'title',
    });
    expect(body.dropped).toEqual([{ slideId: 'big-number-1', blockIds: ['p2'] }]);
    expect(body.moved).toEqual([]);
    expect(applied.stderr).toMatch(/1 block\(s\) did not fit this layout/);
    await validates();
    // and back to a content layout, then to Title and body with two slides at once
    const back = await run([
      'slide',
      'apply-layout',
      'big-number-1,title',
      'split',
      '--deck',
      deckDir,
    ]);
    expect(back.code, back.stderr).toBe(0);
    const two = back.json as { slides: Slide[]; revision: number };
    expect(two.slides.map((slide) => slide.template)).toEqual(
      ['title', 'split'].map(() => 'split'),
    );
    expect(manifest().revision).toBe(two.revision);
    await validates();
    const undo = await run([
      'slide',
      'apply-layout',
      'big-number-1',
      'big-number',
      '--deck',
      deckDir,
    ]);
    expect(undo.code, undo.stderr).toBe(0);
  });

  test('text replace Acme Globex counts the replacements across texts and notes, case insensitive unless asked (text.replaceAll)', async () => {
    const notes = await run([
      'slide',
      'patch',
      'title',
      '--set',
      '/notes=Mention ACME twice: acme.',
      '--deck',
      deckDir,
    ]);
    expect(notes.code, notes.stderr).toBe(0);
    const result = await run(['text', 'replace', 'Acme', 'Globex', '--deck', deckDir]);
    expect(result.code, result.stderr).toBe(0);
    const body = result.json as { replacements: number; slideIds: string[]; revision: number };
    expect(body.replacements).toBe(3);
    expect(body.slideIds.sort()).toEqual(['big-number-1', 'title']);
    expect(slideFile('title').notes).toBe('Mention Globex twice: Globex.');
    const bigNumber = slideFile('big-number-1');
    expect(bigNumber.kind === 'content' && bigNumber.slots.main?.[1]).toMatchObject({
      text: 'Globex grew 42 percent.',
    });
    await validates();
    const none = await run(['text', 'replace', 'Acme', 'Globex', '--deck', deckDir]);
    expect(none.code, none.stderr).toBe(0);
    expect(none.json).toMatchObject({ replacements: 0, slideIds: [], revision: body.revision });
    const cased = await run([
      'text',
      'replace',
      'globex',
      'Initech',
      '--match-case',
      '--deck',
      deckDir,
    ]);
    expect(cased.code).toBe(0);
    expect(cased.json).toMatchObject({ replacements: 0 });
    // runs, not markup: the link URL and the GT mark are never touched
    expect(
      replaceInText('See [Acme](https://acme.example) and GT', 'acme', 'Globex', false),
    ).toEqual({
      text: 'See [Globex](https://acme.example) and GT',
      count: 1,
    });
    expect(replaceInText('one\nAcme two', 'Acme', 'Globex', false)).toEqual({
      text: 'one\nGlobex two',
      count: 1,
    });
  });

  test('slide skip <id> writes skip and --off clears it (slide.skip); slides reports the flag', async () => {
    const skipped = await run(['slide', 'skip', 'big-number-1', '--deck', deckDir]);
    expect(skipped.code, skipped.stderr).toBe(0);
    expect(skipped.json).toMatchObject({ slideIds: ['big-number-1'], skip: true });
    expect(slideFile('big-number-1').skip).toBe(true);
    await validates();
    const rows = await run(['slides', '--deck', deckDir]);
    expect(rows.code).toBe(0);
    expect(
      (rows.json as { id: string; skip?: boolean }[]).find((row) => row.id === 'big-number-1')
        ?.skip,
    ).toBe(true);
    const text = await run(['export', 'txt', '--deck', deckDir]);
    expect(text.code, text.stderr).toBe(0);
    expect((text.json as { slides: number }).slides).toBe(2);
    const withSkipped = await run([
      'export',
      'txt',
      '--include-skipped',
      '--include-notes',
      '--deck',
      deckDir,
    ]);
    expect((withSkipped.json as { slides: number; text: string }).slides).toBe(3);
    expect((withSkipped.json as { text: string }).text).toContain('Mention Globex twice');
    const shown = await run(['slide', 'skip', 'big-number-1', '--off', '--deck', deckDir]);
    expect(shown.code, shown.stderr).toBe(0);
    expect(slideFile('big-number-1')).not.toHaveProperty('skip');
    await validates();
  });

  test('slide duplicate copies after the last selected with fresh ids (slide.duplicate)', async () => {
    const result = await run(['slide', 'duplicate', 'title,big-number-1', '--deck', deckDir]);
    expect(result.code, result.stderr).toBe(0);
    const body = result.json as { slides: Slide[]; revision: number };
    expect(body.slides.map((slide) => slide.id)).toEqual(['title-2', 'big-number-1-2']);
    expect(manifest().sections[1]?.slideIds).toEqual([
      'opener-1',
      'big-number-1',
      'title-2',
      'big-number-1-2',
    ]);
    await validates();
    for (const id of ['title-2', 'big-number-1-2']) {
      const removed = await run(['slide', 'remove', id, '--deck', deckDir]);
      expect(removed.code).toBe(0);
    }
  });

  test('block duplicate copies a block after its original, offset on a freeform slide (block.duplicate)', async () => {
    const result = await run([
      'block',
      'duplicate',
      'big-number-1',
      '--blocks',
      'p1',
      '--deck',
      deckDir,
    ]);
    expect(result.code, result.stderr).toBe(0);
    expect((result.json as { blockIds: string[] }).blockIds).toEqual(['p1-2']);
    const slide = slideFile('big-number-1');
    expect(slide.kind === 'content' && slide.slots.main?.map((block) => block.id)).toEqual([
      'h',
      'p1',
      'p1-2',
    ]);
    const free = await run([
      'slide',
      'new',
      '--layout',
      'blank',
      '--after',
      'big-number-1',
      '--deck',
      deckDir,
    ]);
    expect(free.code).toBe(0);
    const freeId = (free.json as { slide: Slide }).slide.id;
    const box = await run([
      'block',
      'insert',
      freeId,
      '--slot',
      'main',
      '--file',
      writeJson('box.json', {
        id: 'b',
        type: 'box',
        text: 'A box',
        pos: { x: 137, y: 129, w: 320, h: 120, z: 0 },
      }),
      '--deck',
      deckDir,
    ]);
    expect(box.code, box.stderr).toBe(0);
    const copied = await run(['block', 'duplicate', freeId, '--blocks', 'b', '--deck', deckDir]);
    expect(copied.code, copied.stderr).toBe(0);
    const stored = slideFile(freeId);
    expect(stored.kind === 'content' && stored.slots.main?.[1]).toMatchObject({
      id: 'b-2',
      pos: { x: 153, y: 145, w: 320, h: 120, z: 1 },
    });
    await validates();
    expect((await run(['slide', 'remove', freeId, '--deck', deckDir])).code).toBe(0);
  });

  test('slide import copies slides and their assets from another deck under decks/ (slide.import)', async () => {
    const result = await run([
      'slide',
      'import',
      'worked',
      'thesis,mood-earth,title',
      '--after',
      'big-number-1',
      '--deck',
      deckDir,
    ]);
    expect(result.code, result.stderr).toBe(0);
    const body = result.json as {
      slides: Slide[];
      assets: string[];
      renamed: { from: string; to: string }[];
      revision: number;
    };
    // the worked deck's mood-earth asset shares its id with the starter picture and is reused; title collides and is renamed
    expect(body.slides.map((slide) => slide.id)).toEqual(['thesis', 'mood-earth', 'title-2']);
    expect(body.assets).toEqual([]);
    expect(body.renamed).toEqual([{ from: 'title', to: 'title-2' }]);
    expect(manifest().sections[1]?.slideIds).toEqual([
      'opener-1',
      'big-number-1',
      'thesis',
      'mood-earth',
      'title-2',
    ]);
    await validates();
    // an asset the target lacks comes over with its twins
    const withAsset = await run([
      'slide',
      'import',
      'worked',
      'content-rule',
      '--after',
      'title-2',
      '--deck',
      deckDir,
    ]);
    expect(withAsset.code, withAsset.stderr).toBe(0);
    expect((withAsset.json as { assets: string[] }).assets).toEqual([]);
    const production = await run([
      'slide',
      'import',
      'worked',
      'the-production-site',
      '--deck',
      deckDir,
    ]);
    expect(production.code, production.stderr).toBe(0);
    expect((production.json as { assets: string[] }).assets).toEqual(['site-home']);
    expect(existsSync(join(deckDir, 'assets', 'site-home-light.jpg'))).toBe(true);
    await validates();
    const missing = await run(['slide', 'import', 'worked', 'ghost', '--deck', deckDir]);
    expect(missing.code).toBe(2);
  });

  test('deck copy <id> --name Copy makes a copy at revision 0, with slideIds and --remove-notes (deck.copy)', async () => {
    const result = await run(['deck', 'copy', 'untitled-presentation', '--name', 'Copy']);
    expect(result.code, result.stderr).toBe(0);
    expect(result.json).toMatchObject({
      deckId: 'copy',
      sourceDeckId: 'untitled-presentation',
      title: 'Copy',
      revision: 0,
    });
    await validates(join(decksDir, 'copy'));
    expect(manifest(join(decksDir, 'copy')).sections).toEqual(manifest().sections);
    const partial = await run([
      'deck',
      'copy',
      'untitled-presentation',
      '--name',
      'Two slides',
      '--id',
      'two',
      '--slides',
      'title,big-number-1',
      '--remove-notes',
    ]);
    expect(partial.code, partial.stderr).toBe(0);
    expect(partial.json).toMatchObject({ deckId: 'two', counts: { slides: 2 } });
    expect(slideFile('title', join(decksDir, 'two'))).not.toHaveProperty('notes');
    await validates(join(decksDir, 'two'));
    const stale = await run([
      'deck',
      'copy',
      'untitled-presentation',
      '--name',
      'Stale',
      '--base-revision',
      '0',
    ]);
    expect(stale.code).toBe(1);
    expect(stale.json).toMatchObject({ error: 'ConflictError' });
  });

  test('deck trash, deck list, deck restore and deck remove --confirm (deck.trash, deck.list, deck.restore, deck.remove)', async () => {
    const before = manifest(join(decksDir, 'copy')).revision;
    const trashed = await run(['deck', 'trash', 'copy']);
    expect(trashed.code, trashed.stderr).toBe(0);
    expect(trashed.json).toMatchObject({ id: 'copy', revision: before });
    expect((trashed.json as { trashedAt: string }).trashedAt).toMatch(/^\d{4}-/);
    expect(manifest(join(decksDir, 'copy')).trashedAt).toBeTruthy();
    await validates(join(decksDir, 'copy'));

    const listed = await run(['deck', 'list']);
    expect(listed.code, listed.stderr).toBe(0);
    const ids = (listed.json as { id: string }[]).map((row) => row.id);
    expect(ids).toContain('untitled-presentation');
    expect(ids).toContain('two');
    expect(ids).not.toContain('copy');
    expect(ids).not.toContain('templates');
    const all = await run(['deck', 'list', '--include-trashed']);
    const rows = all.json as { id: string; trashedAt?: string; title: string; slides: number }[];
    expect(rows.find((row) => row.id === 'copy')?.trashedAt).toBeTruthy();
    expect(rows.find((row) => row.id === 'two')).toMatchObject({ title: 'Two slides', slides: 2 });

    const restored = await run(['deck', 'restore', 'copy']);
    expect(restored.code, restored.stderr).toBe(0);
    expect(restored.json).toEqual({ id: 'copy', trashedAt: null, revision: before });
    expect(manifest(join(decksDir, 'copy'))).not.toHaveProperty('trashedAt');
    expect((await run(['deck', 'list'])).json).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'copy' })]),
    );
    await validates(join(decksDir, 'copy'));

    const unconfirmed = await run(['deck', 'remove', 'copy']);
    expect(unconfirmed.code).toBe(2);
    expect(unconfirmed.stderr).toMatch(/--confirm/);
    expect(existsSync(join(decksDir, 'copy', 'deck.json'))).toBe(true);
    const removed = await run(['deck', 'remove', 'copy', '--confirm']);
    expect(removed.code, removed.stderr).toBe(0);
    expect(removed.json).toEqual({ id: 'copy', removed: true });
    expect(existsSync(join(decksDir, 'copy'))).toBe(false);
    expect((await run(['deck', 'list', '--include-trashed'])).json).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'copy' })]),
    );
    const gone = await run(['deck', 'remove', 'copy', '--confirm']);
    expect(gone.code).toBe(2);
  });

  test('a Section header without an anchor heads a section that has none, and lands after the header of one that has', async () => {
    const two = join(decksDir, 'two');
    // the copy kept title and big-number-1: section opener-1 has no header any more
    expect(manifest(two).sections).toEqual([
      { id: 'deck', name: 'Deck', slideIds: ['title'] },
      { id: 'opener-1', name: 'Section 2', slideIds: ['big-number-1'] },
    ]);
    const heads = await run([
      'slide',
      'new',
      '--layout',
      'opener',
      '--section',
      'opener-1',
      '--deck',
      two,
    ]);
    expect(heads.code, heads.stderr).toBe(0);
    expect((heads.json as { slide: Slide }).slide).toMatchObject({
      id: 'opener-1',
      sectionId: 'opener-1',
    });
    expect(manifest(two).sections[1]?.slideIds).toEqual(['opener-1', 'big-number-1']);
    await validates(two);
    const splits = await run([
      'slide',
      'new',
      '--layout',
      'opener',
      '--section',
      'opener-1',
      '--deck',
      two,
    ]);
    expect(splits.code, splits.stderr).toBe(0);
    expect((splits.json as { slide: Slide }).slide).toMatchObject({
      id: 'opener-2',
      sectionId: 'opener-2',
    });
    expect(manifest(two).sections).toEqual([
      { id: 'deck', name: 'Deck', slideIds: ['title'] },
      { id: 'opener-1', name: 'Section 2', slideIds: ['opener-1'] },
      { id: 'opener-2', name: 'Section 3', slideIds: ['opener-2', 'big-number-1'] },
    ]);
    await validates(two);
  });

  test('the deck reads whole through info and slides, and validates at the end of the walk', async () => {
    const info = await run(['info', '--deck', deckDir]);
    expect(info.code).toBe(0);
    expect(info.json).toMatchObject({
      id: 'untitled-presentation',
      title: 'Untitled presentation',
    });
    await validates();
  });
});

/** Writes a JSON file under the temp root and returns its path, for `--file`. */
function writeJson(name: string, value: unknown): string {
  const path = join(root, name);
  writeFileSync(path, JSON.stringify(value));
  return path;
}
