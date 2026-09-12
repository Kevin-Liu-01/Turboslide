import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openFileStore } from './file-store.ts';
import {
  DEFAULT_BLANK_TITLE,
  StaleRevisionError,
  byNewest,
  copyDeck,
  createDeck,
  deckIdFor,
  listDeckHeads,
  listTemplates,
  parseTemplateRecord,
  readTemplate,
  removeDeck,
  restoreDeck,
  trashDeck,
} from './templates.ts';

// deck.create over a scratch decks/ folder: the blank template writes one title slide the
// validator accepts; a template record with a manifest, slides and an assets folder is copied
// under a new id with revision 0 and fresh stamps, and the result reads back through the store;
// the deck list skips the templates folder and sorts newest first. The last group reads the
// committed GT template against the working deck it is cut from.
const REPO_DECKS = join(import.meta.dirname, '..', '..', '..', 'decks');
const REPO_TEMPLATE = join(REPO_DECKS, 'templates', 'gt-brand');
const REPO_BLANK_TEMPLATE = join(REPO_DECKS, 'templates', 'blank');
const REPO_DECK = join(REPO_DECKS, 'gt-brand');

/** The manifest fields the template tests read; the rest is compared as data. */
type Manifest = Record<string, unknown> & {
  revision: number;
  sections: { slideIds: string[] }[];
  assets: Record<string, { twins: Record<string, string> }>;
};

function readJsonFile<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

/** Counts every object with `type: 'html'` in a document, composite cells included. */
function countHtmlBlocks(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce<number>((sum, item) => sum + countHtmlBlocks(item), 0);
  }
  if (typeof value !== 'object' || value === null) return 0;
  const record = value as Record<string, unknown>;
  return Object.values(record).reduce<number>(
    (sum, item) => sum + countHtmlBlocks(item),
    record.type === 'html' ? 1 : 0,
  );
}

/** The manifest without the fields deck.create resets, so two snapshots compare on content. */
function contentOf(manifest: Record<string, unknown>): Record<string, unknown> {
  const content = { ...manifest };
  for (const key of ['revision', 'createdAt', 'updatedAt']) delete content[key];
  return content;
}

function slideFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort();
}

let root: string;
let decksDir: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'turboslide-templates-'));
  decksDir = join(root, 'decks');
  mkdirSync(join(decksDir, 'templates', 'gt-brand', 'slides'), { recursive: true });
  mkdirSync(join(decksDir, 'templates', 'gt-brand', 'pictures'), { recursive: true });
  writeFileSync(
    join(decksDir, 'templates', 'gt-brand', 'pictures', 'photo.jpg'),
    'not a real jpeg',
  );
  writeFileSync(
    join(decksDir, 'templates', 'gt-brand', 'deck.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'tiny',
      title: 'Tiny template',
      theme: 'gt-ink-paper',
      sections: [{ id: 'one', name: 'One', slideIds: ['title', 'thesis'] }],
      assets: {},
      revision: 41,
      createdAt: '2026-09-10T20:00:00Z',
      updatedAt: '2026-09-10T20:00:00Z',
    }),
  );
  writeFileSync(
    join(decksDir, 'templates', 'gt-brand', 'slides', 'title.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'title',
      kind: 'title',
      mark: { w: 132, h: 84 },
      heading: 'Tiny',
      lead: 'One line.',
    }),
  );
  writeFileSync(
    join(decksDir, 'templates', 'gt-brand', 'slides', 'thesis.json'),
    JSON.stringify({ schemaVersion: 1, id: 'thesis', kind: 'statement', big: 'A statement' }),
  );
  writeFileSync(
    join(decksDir, 'templates', 'gt-brand', 'template.json'),
    JSON.stringify({
      schemaVersion: 1,
      // the scratch folder stands in for decks/templates/gt-brand: two slides, one picture
      id: 'gt-brand',
      name: 'Tiny template',
      description: 'Two slides for the tests.',
      theme: 'gt-ink-paper',
      deck: 'deck.json',
      slides: 'slides',
      assets: 'pictures',
      sections: [{ id: 'one', name: 'One', slides: 2 }],
      archetypes: [{ id: 'title', label: 'Title', kind: 'title' }],
    }),
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('deckIdFor', () => {
  it('slugs the name and takes an explicit id', () => {
    expect(deckIdFor({ name: 'Q4 review, Berlin', from: 'blank' })).toBe('q4-review-berlin');
    expect(deckIdFor({ name: 'x', from: 'blank', id: 'my-deck' })).toBe('my-deck');
    expect(() => deckIdFor({ name: '!!!', from: 'blank' })).toThrow(TypeError);
    expect(() => deckIdFor({ name: 'x', from: 'blank', id: 'Not A Slug' })).toThrow(TypeError);
  });
});

describe('createDeck', () => {
  it('writes a blank deck with one title slide when the decks folder has no blank template (the fallback)', async () => {
    const result = createDeck(
      decksDir,
      { name: 'Blank one', from: 'blank' },
      { now: () => '2026-09-11T01:00:00.000Z' },
    );
    expect(result).toMatchObject({
      deckId: 'blank-one',
      title: 'Blank one',
      from: 'blank',
      revision: 0,
      counts: { slides: 1, sections: 1, assets: 0 },
    });
    const store = openFileStore({ dir: result.dir });
    const read = await store.read();
    expect(read.ok).toBe(true);
    expect(read.document.deck.title).toBe('Blank one');
    expect(read.document.slides.title?.kind).toBe('title');
    expect(read.document.deck.createdAt).toBe('2026-09-11T01:00:00.000Z');
  });

  it('copies a template record into a new deck: slides, the assets folder it names, a fresh manifest', async () => {
    const result = createDeck(
      decksDir,
      { name: 'From tiny', from: 'gt-brand' },
      { now: () => '2026-09-11T02:00:00.000Z' },
    );
    expect(result.deckId).toBe('from-tiny');
    expect(result.counts).toEqual({ slides: 2, sections: 1, assets: 0 });
    expect(result.revision).toBe(0);
    expect(existsSync(join(result.dir, 'slides', 'thesis.json'))).toBe(true);
    expect(existsSync(join(result.dir, 'assets', 'photo.jpg'))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(result.dir, 'deck.json'), 'utf8')) as {
      id: string;
      title: string;
      revision: number;
      updatedAt: string;
    };
    expect(manifest).toMatchObject({
      id: 'from-tiny',
      title: 'From tiny',
      revision: 0,
      updatedAt: '2026-09-11T02:00:00.000Z',
    });
    const store = openFileStore({ dir: result.dir });
    expect((await store.listVersions()).length).toBe(0);
    expect(() => createDeck(decksDir, { name: 'From tiny', from: 'gt-brand' })).toThrow(
      /exists already/,
    );
  });
});

describe('templates and deck heads', () => {
  it('reads the record, lists the templates and refuses a malformed record', () => {
    const template = readTemplate(join(decksDir, 'templates', 'gt-brand'));
    expect(template.record.assets).toBe('pictures');
    expect(listTemplates(decksDir).map((entry) => entry.record.name)).toEqual(['Tiny template']);
    const blank = readTemplate(REPO_BLANK_TEMPLATE);
    expect(blank.record.id).toBe('blank');
    expect(blank.record.assets).toBe('assets');
    expect(() => parseTemplateRecord({ schemaVersion: 2 }, 'x')).toThrow(/schemaVersion/);
    expect(() => parseTemplateRecord({ schemaVersion: 1, id: 'nope' }, 'x')).toThrow(/id must/);
  });

  it('lists deck heads newest first and skips the templates folder', () => {
    const heads = listDeckHeads(decksDir);
    expect(heads.map((head) => head.id)).toEqual(['from-tiny', 'blank-one']);
    expect(heads.some((head) => head.id === 'templates')).toBe(false);
    const a = {
      id: 'a',
      title: '',
      slides: 0,
      sections: 0,
      revision: 0,
      updatedAt: '2026-01-02T00:00:00Z',
      createdAt: '',
    };
    const b = { ...a, id: 'b', updatedAt: '2026-01-01T00:00:00Z' };
    expect([b, a].sort(byNewest).map((head) => head.id)).toEqual(['a', 'b']);
  });

  it('the committed GT template record names an assets folder that exists and 85 slides', () => {
    const template = readTemplate(REPO_TEMPLATE);
    expect(template.record.id).toBe('gt-brand');
    expect(template.record.sections.reduce((sum, section) => sum + section.slides, 0)).toBe(85);
    expect(existsSync(join(REPO_TEMPLATE, template.record.assets))).toBe(true);
    expect(existsSync(join(REPO_TEMPLATE, template.record.deck))).toBe(true);
    expect(template.record.archetypes.map((entry) => entry.id)).toContain('rows');
  });
});

describe('the committed GT template is the working deck', () => {
  // decks/templates/gt-brand is a snapshot of decks/gt-brand (Kevin's directive: a full GT
  // template). The revision 13 cut still carried the four html escape blocks the M5 re-import
  // retired and lacked the liquid-metal-diamond record while copying its twins, so a deck created
  // from it failed the severity 3 gate (type/svg-label-min on goals#html) before anyone edited it.
  // Re-snapshot by copying decks/gt-brand/deck.json and slides/*.json over the template and
  // naming the revision in template.json; these tests fail on any other drift.
  const templateManifest = readJsonFile<Manifest>(join(REPO_TEMPLATE, 'deck.json'));
  const deckManifest = readJsonFile<Manifest>(join(REPO_DECK, 'deck.json'));

  it('slide files equal decks/gt-brand byte for byte and hold no html block', () => {
    const files = slideFiles(join(REPO_DECK, 'slides'));
    expect(files.length).toBe(85);
    expect(slideFiles(join(REPO_TEMPLATE, 'slides'))).toEqual(files);
    let html = 0;
    for (const file of files) {
      const text = readFileSync(join(REPO_TEMPLATE, 'slides', file), 'utf8');
      expect(text, file).toBe(readFileSync(join(REPO_DECK, 'slides', file), 'utf8'));
      html += countHtmlBlocks(JSON.parse(text));
    }
    expect(html).toBe(0);
  });

  it('manifest equals decks/gt-brand apart from the revision and the stamps, and template.json names its revision', () => {
    expect(contentOf(templateManifest)).toEqual(contentOf(deckManifest));
    const { record } = readTemplate(REPO_TEMPLATE);
    const named = /cut from decks\/gt-brand at revision (\d+)/.exec(record.description);
    expect(named?.[1]).toBe(String(templateManifest.revision));
    expect(record.sections.map((section) => section.slides)).toEqual(
      templateManifest.sections.map((section) => section.slideIds.length),
    );
  });

  it('deck.create over the committed record yields 85 slides, every asset twin and no html block', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'turboslide-gt-template-'));
    const decks = join(scratch, 'decks');
    mkdirSync(join(decks, 'templates'), { recursive: true });
    // the record names its assets relative to its own folder (../../gt-brand/assets), so the
    // scratch decks/ links the template and the working deck where the repository keeps them
    symlinkSync(REPO_TEMPLATE, join(decks, 'templates', 'gt-brand'));
    symlinkSync(REPO_DECK, join(decks, 'gt-brand'));
    try {
      const result = createDeck(
        decks,
        { name: 'GT template check', from: 'gt-brand' },
        { now: () => '2026-09-11T03:00:00.000Z' },
      );
      expect(result.revision).toBe(0);
      expect(result.counts).toEqual({
        slides: 85,
        sections: 8,
        assets: Object.keys(deckManifest.assets).length,
      });
      const created = readJsonFile<Manifest>(join(result.dir, 'deck.json'));
      expect(created.assets).toEqual(deckManifest.assets);
      for (const asset of Object.values(created.assets)) {
        for (const twin of Object.values(asset.twins)) {
          expect(existsSync(join(result.dir, twin)), twin).toBe(true);
        }
      }
      let html = 0;
      for (const file of slideFiles(join(result.dir, 'slides'))) {
        html += countHtmlBlocks(readJsonFile(join(result.dir, 'slides', file)));
      }
      expect(html).toBe(0);
    } finally {
      // the links first, by name, so the removal never reaches the repository folders
      unlinkSync(join(decks, 'gt-brand'));
      unlinkSync(join(decks, 'templates', 'gt-brand'));
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

describe('the committed blank template (gslides-parity SPEC 5.2, 6.1)', () => {
  it('deck.create --from blank copies one title slide with empty placeholders and the four starter pictures', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'turboslide-blank-template-'));
    const decks = join(scratch, 'decks');
    mkdirSync(join(decks, 'templates'), { recursive: true });
    symlinkSync(REPO_BLANK_TEMPLATE, join(decks, 'templates', 'blank'));
    try {
      const result = createDeck(
        decks,
        { name: DEFAULT_BLANK_TITLE, from: 'blank' },
        { now: () => '2026-09-12T03:00:00.000Z' },
      );
      expect(result).toMatchObject({
        deckId: 'untitled-presentation',
        title: 'Untitled presentation',
        revision: 0,
        counts: { slides: 1, sections: 1, assets: 4 },
      });
      const manifest = readJsonFile<Manifest>(join(result.dir, 'deck.json'));
      expect(Object.keys(manifest.assets)).toEqual([
        'opener-brand',
        'opener-prototemplate',
        'mood-earth',
        'opener-closing',
      ]);
      for (const asset of Object.values(manifest.assets)) {
        for (const twin of Object.values(asset.twins)) {
          expect(existsSync(join(result.dir, twin)), twin).toBe(true);
        }
      }
      const slide = readJsonFile<Record<string, unknown>>(join(result.dir, 'slides', 'title.json'));
      expect(slide).toMatchObject({ kind: 'title', heading: '', lead: '', template: 'title' });
    } finally {
      unlinkSync(join(decks, 'templates', 'blank'));
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

describe('copy, trash, restore and remove (gslides-parity SPEC 7.5)', () => {
  const NOW = '2026-09-12T04:00:00.000Z';

  it('copies a deck under a new id with a new title, revision 0 and the assets folder', async () => {
    const result = copyDeck(
      decksDir,
      { id: 'from-tiny', name: 'Copy of tiny' },
      { now: () => NOW },
    );
    expect(result).toMatchObject({
      deckId: 'copy-of-tiny',
      sourceDeckId: 'from-tiny',
      title: 'Copy of tiny',
      revision: 0,
      counts: { slides: 2, sections: 1, assets: 0 },
    });
    expect(existsSync(join(result.dir, 'assets', 'photo.jpg'))).toBe(true);
    expect(existsSync(join(result.dir, 'versions'))).toBe(false);
    const store = openFileStore({ dir: result.dir });
    const read = await store.read();
    expect(read.ok).toBe(true);
    expect(read.document.deck).toMatchObject({
      id: 'copy-of-tiny',
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(() => copyDeck(decksDir, { id: 'from-tiny', name: 'Copy of tiny' })).toThrow(
      /exists already/,
    );
    expect(() => copyDeck(decksDir, { id: 'missing', name: 'x' })).toThrow(RangeError);
    expect(() => copyDeck(decksDir, { id: 'from-tiny', name: 'From tiny' })).toThrow(/other than/);
  });

  it('copies the named slides only and strips the notes when asked', async () => {
    // give the source a note first
    const source = openFileStore({ dir: join(decksDir, 'from-tiny') });
    const noted = await source.write({
      baseRevision: 0,
      author: { kind: 'human', name: 'kevin' },
      mutations: [{ op: 'slide.set', slideId: 'thesis', path: '/notes', value: 'Say it slowly.' }],
    });
    expect(noted.ok).toBe(true);
    const partial = copyDeck(
      decksDir,
      { id: 'from-tiny', name: 'Thesis only', slideIds: ['thesis'], removeNotes: true },
      { now: () => NOW },
    );
    expect(partial.counts).toEqual({ slides: 1, sections: 1, assets: 0 });
    const read = await openFileStore({ dir: partial.dir }).read();
    expect(Object.keys(read.document.slides)).toEqual(['thesis']);
    expect(read.document.deck.sections).toEqual([{ id: 'one', name: 'One', slideIds: ['thesis'] }]);
    expect(read.document.slides.thesis).not.toHaveProperty('notes');
    const kept = copyDeck(
      decksDir,
      { id: 'from-tiny', name: 'With notes', slideIds: ['thesis'] },
      { now: () => NOW },
    );
    const withNotes = await openFileStore({ dir: kept.dir }).read();
    expect(withNotes.document.slides.thesis?.notes).toBe('Say it slowly.');
    expect(() =>
      copyDeck(decksDir, { id: 'from-tiny', name: 'Ghost', slideIds: ['ghost'] }),
    ).toThrow(RangeError);
  });

  it('moves a deck to the trash and back without touching the revision, and the list hides it', async () => {
    const before = listDeckHeads(decksDir).map((head) => head.id);
    expect(before).toContain('copy-of-tiny');
    const trashed = trashDeck(decksDir, 'copy-of-tiny', { now: () => NOW });
    expect(trashed).toEqual({ id: 'copy-of-tiny', trashedAt: NOW, revision: 0 });
    expect(listDeckHeads(decksDir).map((head) => head.id)).not.toContain('copy-of-tiny');
    const withTrash = listDeckHeads(decksDir, { includeTrashed: true });
    expect(withTrash.find((head) => head.id === 'copy-of-tiny')?.trashedAt).toBe(NOW);
    const read = await openFileStore({ dir: join(decksDir, 'copy-of-tiny') }).read();
    expect(read.ok).toBe(true);
    expect(read.document.deck).toMatchObject({ trashedAt: NOW, revision: 0 });
    // a second trash keeps the first stamp; a stale base is refused
    expect(trashDeck(decksDir, 'copy-of-tiny', { now: () => 'later' })).toEqual(trashed);
    expect(() => trashDeck(decksDir, 'copy-of-tiny', { baseRevision: 9 })).toThrow(
      StaleRevisionError,
    );
    const restored = restoreDeck(decksDir, 'copy-of-tiny', { baseRevision: 0 });
    expect(restored).toEqual({ id: 'copy-of-tiny', trashedAt: null, revision: 0 });
    expect(listDeckHeads(decksDir).map((head) => head.id)).toContain('copy-of-tiny');
    const again = await openFileStore({ dir: join(decksDir, 'copy-of-tiny') }).read();
    expect(again.document.deck).not.toHaveProperty('trashedAt');
    expect(restoreDeck(decksDir, 'copy-of-tiny')).toEqual(restored);
  });

  it('removes a deck folder for good and refuses the templates folder and an unknown id', () => {
    expect(removeDeck(decksDir, 'thesis-only')).toEqual({ id: 'thesis-only', removed: true });
    expect(existsSync(join(decksDir, 'thesis-only'))).toBe(false);
    expect(() => removeDeck(decksDir, 'thesis-only')).toThrow(RangeError);
    expect(() => removeDeck(decksDir, 'templates')).toThrow(TypeError);
    expect(() => removeDeck(decksDir, 'with-notes', { baseRevision: 3 })).toThrow(
      StaleRevisionError,
    );
    expect(existsSync(join(decksDir, 'with-notes'))).toBe(true);
    expect(existsSync(join(decksDir, 'templates', 'gt-brand'))).toBe(true);
  });
});
