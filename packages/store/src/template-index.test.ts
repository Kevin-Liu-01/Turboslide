// The template index and the template writes (docs/PRODUCT.md 4.3, 8.3; gslides-parity SPEC-5
// 4.1, 4.3, 4.6; ported from the round five branch and extended for the product round): the
// committed templates.json equals the folders under the carried facts rule, Blank first and the
// GT brand deck under its own name as an organisation template; deck.create copies any template
// of the index; Save as template writes a folder with the deck's slides, assets and brand kit and
// lists it under Your organisation; saving over the same name replaces the template and keeps its
// slug; Rename keeps the id; Delete refuses the deployment default and Turboslide's own
// templates; default.json absent means blank and Use for new presentations on Blank removes it;
// a template folder is read only.
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TEMPLATE_CATEGORIES, templateIndexEntrySchema } from '@turboslide/schema/actions';
import { defaultKitOf } from '@turboslide/schema/brand';
import { canonicalJson } from '@turboslide/schema/json';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { loadDeckDir } from './file-store.ts';
import {
  BLANK_TEMPLATE_ID,
  DEFAULT_TEMPLATE_FILE,
  TEMPLATE_INDEX_FILE,
  TEMPLATE_INDEX_ORDER,
  TEMPLATE_READ_ONLY,
  TURBOSLIDE_TEMPLATE_FIXED,
  assertNotTemplateDir,
  buildTemplateIndex,
  createDeck,
  deleteTemplate,
  isKnownTemplateId,
  isTemplateDir,
  listTemplates,
  readDefaultKit,
  readDefaultTemplateId,
  readTemplate,
  readTemplateIndex,
  renameTemplate,
  saveTemplate,
  setDefaultTemplate,
  templateDocument,
  templateEntry,
  templateIdForName,
  templateIds,
  templateSlideCount,
  templateSlides,
  templatesDir,
  updateTemplate,
} from './templates.ts';

const REPO_DECKS = join(import.meta.dirname, '..', '..', '..', 'decks');
const tmp = mkdtempSync(join(tmpdir(), 'turboslide-template-index-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const NOW = { now: () => '2026-09-19T12:00:00.000Z' };

/** A scratch decks folder with the blank template copied from the repository and the committed index. */
function scratchDecks(name: string): string {
  const decks = join(tmp, name);
  rmSync(decks, { recursive: true, force: true });
  cpSync(join(REPO_DECKS, 'templates', 'blank'), join(decks, 'templates', 'blank'), {
    recursive: true,
  });
  cpSync(
    join(REPO_DECKS, 'templates', TEMPLATE_INDEX_FILE),
    join(decks, 'templates', TEMPLATE_INDEX_FILE),
  );
  return decks;
}

/** A deck under the scratch folder made from blank, with a heading typed and a brand kit on the manifest. */
function sellerDeck(decks: string, name: string, brand?: Record<string, unknown>): string {
  const created = createDeck(decks, { name, from: 'blank' }, NOW);
  if (brand !== undefined) {
    const manifestPath = join(created.dir, 'deck.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(manifestPath, canonicalJson({ ...manifest, brand }));
  }
  return created.deckId;
}

describe('decks/templates/templates.json (docs/PRODUCT.md 4.3)', () => {
  const rows = readTemplateIndex(REPO_DECKS);

  it('equals the folders under the carried facts rule, Blank first, then the GT brand deck', () => {
    expect(rows).toEqual(buildTemplateIndex(REPO_DECKS));
    expect(rows.map((row) => row.id)).toEqual([...TEMPLATE_INDEX_ORDER]);
    const file = JSON.parse(
      readFileSync(join(REPO_DECKS, 'templates', TEMPLATE_INDEX_FILE), 'utf8'),
    ) as unknown[];
    expect(file).toEqual(rows);
  });

  it("lists the GT brand deck under its own name as this deployment's template and Blank as Turboslide's", () => {
    const gt = rows.find((row) => row.id === 'gt-brand');
    expect(gt).toMatchObject({
      name: 'General Translation brand deck',
      organisation: true,
      cover: 'opener-brand',
      slides: 85,
      theme: 'gt-ink-paper',
    });
    expect(gt?.name).not.toContain('GT brand deck');
    expect(gt?.name).not.toBe('General presentation');
    const blank = rows.find((row) => row.id === BLANK_TEMPLATE_ID);
    expect(blank).toMatchObject({ name: 'Blank', cover: 'title', slides: 1 });
    expect(blank?.organisation).toBeUndefined();
  });

  it('carries a category of the three, a cover, a sentence under 400 characters and the folder’s slide count on every row', () => {
    const byId = new Map(
      listTemplates(REPO_DECKS).map((template) => [template.record.id, template]),
    );
    for (const row of rows) {
      expect(TEMPLATE_CATEGORIES).toContain(row.category);
      expect(row.cover).toBeDefined();
      expect(row.description?.length ?? 0).toBeGreaterThan(0);
      expect(row.description?.length ?? 0).toBeLessThanOrEqual(400);
      expect(row.slides).toBe(templateSlideCount(byId.get(row.id)!));
      expect(templateIndexEntrySchema.safeParse(row).success).toBe(true);
    }
  });

  it('names the ids deck.create accepts', () => {
    expect(templateIds(REPO_DECKS)).toEqual(expect.arrayContaining(['blank', 'gt-brand']));
    expect(isKnownTemplateId(REPO_DECKS, 'gt-brand')).toBe(true);
    expect(isKnownTemplateId(REPO_DECKS, 'nope')).toBe(false);
    expect(isKnownTemplateId(REPO_DECKS, 'templates')).toBe(false);
    expect(templateEntry(REPO_DECKS, 'nope')).toBeNull();
  });

  it('answers the folders when the file is absent, so a scratch decks folder still lists blank', () => {
    const decks = join(tmp, 'no-index');
    cpSync(join(REPO_DECKS, 'templates', 'blank'), join(decks, 'templates', 'blank'), {
      recursive: true,
    });
    expect(readTemplateIndex(decks).map((row) => row.id)).toEqual(['blank']);
    expect(templateIds(decks)).toEqual(expect.arrayContaining(['gt-brand', 'blank']));
  });

  it('reads the template slides in order with their titles and kinds (template.slides)', () => {
    const blank = templateSlides(REPO_DECKS, 'blank');
    expect(blank).toMatchObject({ id: 'blank', name: 'Blank' });
    expect(blank.slides).toEqual([{ index: 1, slideId: 'title', title: 'Slide 1', kind: 'title' }]);
    expect(templateDocument(REPO_DECKS, 'blank').deck.id).toBe('blank');
    expect(() => templateSlides(REPO_DECKS, 'nope')).toThrow(RangeError);
  });
});

describe('deck.create --from <index id> (SPEC-5 4.6)', () => {
  it('copies a saved template with its slides, its assets and its brand kit, and refuses an unknown id by name', () => {
    const decks = scratchDecks('create-from');
    const kit = { name: 'Acme', appearance: 'light', colors: { light: { primary: '#0b3d91' } } };
    const source = sellerDeck(decks, 'Acme pitch', kit);
    saveTemplate(decks, { deckId: source, name: 'Acme sales 2026' }, NOW);
    const created = createDeck(decks, { name: 'Globex pitch', from: 'acme-sales-2026' }, NOW);
    expect(created.deckId).toBe('globex-pitch');
    expect(created.counts.slides).toBe(1);
    const manifest = JSON.parse(readFileSync(join(created.dir, 'deck.json'), 'utf8')) as {
      title: string;
      revision: number;
      brand?: unknown;
    };
    expect(manifest.title).toBe('Globex pitch');
    expect(manifest.revision).toBe(0);
    expect(manifest.brand).toEqual(kit);
    expect(existsSync(join(created.dir, 'assets', 'opener-brand-light.jpg'))).toBe(true);
    expect(() => createDeck(decks, { name: 'x', from: 'sales-pitch' }, NOW)).toThrow(
      /No template "sales-pitch"/,
    );
    expect(() => createDeck(decks, { name: 'x', from: 'Not A Slug' }, NOW)).toThrow(TypeError);
  });
});

describe('Save as template (template.create, template.update)', () => {
  it('writes decks/templates/<slug> from the deck with template.json, the slides, the assets and the kit, listed under Your organisation', () => {
    const decks = scratchDecks('save');
    const kit = { name: 'Acme', appearance: 'dark' };
    const source = sellerDeck(decks, 'Acme pitch', kit);
    const saved = saveTemplate(
      decks,
      { deckId: source, name: 'Acme sales 2026', sentence: 'The pitch for a first call.' },
      NOW,
    );
    expect(saved).toEqual({
      id: 'acme-sales-2026',
      name: 'Acme sales 2026',
      slides: 1,
      replaced: false,
    });
    const dir = join(templatesDir(decks), 'acme-sales-2026');
    const record = JSON.parse(readFileSync(join(dir, 'template.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(record).toMatchObject({
      id: 'acme-sales-2026',
      name: 'Acme sales 2026',
      description: 'The pitch for a first call.',
      organisation: true,
      cover: 'title',
      slideCount: 1,
      appearance: 'dark',
      brand: kit,
      deck: 'deck.json',
      slides: 'slides',
      assets: 'assets',
    });
    expect(existsSync(join(dir, 'slides', 'title.json'))).toBe(true);
    expect(existsSync(join(dir, 'assets', 'mood-earth-dark.jpg'))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(manifest).toMatchObject({ id: 'acme-sales-2026', revision: 0, brand: kit });
    // the index lists it after the built ins, with the kit and the appearance
    const rows = readTemplateIndex(decks);
    expect(rows.map((row) => row.id)).toEqual(['blank', 'acme-sales-2026']);
    expect(rows[1]).toMatchObject({
      name: 'Acme sales 2026',
      description: 'The pitch for a first call.',
      organisation: true,
      appearance: 'dark',
      brand: kit,
      slides: 1,
    });
    expect(existsSync(join(templatesDir(decks), TEMPLATE_INDEX_FILE))).toBe(true);
    // no staging folder is left behind
    expect(existsSync(join(templatesDir(decks), '.acme-sales-2026.saving'))).toBe(false);
  });

  it('writes "Saved from <title>" when no sentence is typed', () => {
    const decks = scratchDecks('save-sentence');
    const source = sellerDeck(decks, 'Northwind renewal');
    saveTemplate(decks, { deckId: source, name: 'Renewals' }, NOW);
    expect(templateEntry(decks, 'renewals')?.description).toBe('Saved from Northwind renewal');
  });

  it('saving over the same name replaces the template and keeps its slug', () => {
    const decks = scratchDecks('same-name');
    const first = sellerDeck(decks, 'Acme pitch', { name: 'Acme' });
    saveTemplate(decks, { deckId: first, name: 'Acme sales 2026', sentence: 'First.' }, NOW);
    const second = sellerDeck(decks, 'Acme pitch v2', { name: 'Acme v2' });
    expect(templateIdForName(decks, 'Acme sales 2026')).toMatchObject({
      id: 'acme-sales-2026',
      existing: { id: 'acme-sales-2026', organisation: true },
    });
    const replaced = saveTemplate(
      decks,
      { deckId: second, name: 'Acme sales 2026', sentence: 'Second.' },
      { now: () => '2026-09-19T13:00:00.000Z' },
    );
    expect(replaced).toEqual({
      id: 'acme-sales-2026',
      name: 'Acme sales 2026',
      slides: 1,
      replaced: true,
    });
    const rows = readTemplateIndex(decks).filter((row) => row.organisation === true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'acme-sales-2026',
      description: 'Second.',
      brand: { name: 'Acme v2' },
    });
    // template.update keeps the id, the name and the sentence, and takes the new deck's slides and kit
    const third = sellerDeck(decks, 'Acme pitch v3', { name: 'Acme v3' });
    const updated = updateTemplate(decks, { id: 'acme-sales-2026', deckId: third }, NOW);
    expect(updated).toMatchObject({
      id: 'acme-sales-2026',
      name: 'Acme sales 2026',
      replaced: true,
    });
    expect(templateEntry(decks, 'acme-sales-2026')).toMatchObject({
      description: 'Second.',
      brand: { name: 'Acme v3' },
    });
  });

  it("refuses a name that gives one of Turboslide's ids, an empty name and a missing deck", () => {
    const decks = scratchDecks('save-refusals');
    const source = sellerDeck(decks, 'Acme pitch');
    expect(() => saveTemplate(decks, { deckId: source, name: 'Blank' }, NOW)).toThrow(
      /Blank is one of Turboslide's templates/,
    );
    expect(() => saveTemplate(decks, { deckId: source, name: '   ' }, NOW)).toThrow(
      /name must not be empty/,
    );
    expect(() => saveTemplate(decks, { deckId: source, name: '???' }, NOW)).toThrow(
      /gives no template id/,
    );
    expect(() => saveTemplate(decks, { deckId: 'missing', name: 'Acme' }, NOW)).toThrow(RangeError);
    expect(() => updateTemplate(decks, { id: 'blank', deckId: source }, NOW)).toThrow(
      TURBOSLIDE_TEMPLATE_FIXED,
    );
    expect(() => updateTemplate(decks, { id: 'nope', deckId: source }, NOW)).toThrow(RangeError);
    expect(readTemplateIndex(decks).map((row) => row.id)).toEqual(['blank']);
  });
});

describe('the card menu (template.rename, template.delete)', () => {
  let decks: string;
  beforeEach(() => {
    decks = scratchDecks('card-menu');
    const source = sellerDeck(decks, 'Acme pitch');
    saveTemplate(decks, { deckId: source, name: 'Acme sales 2026' }, NOW);
  });

  it('renames the template and keeps its id and folder', () => {
    const renamed = renameTemplate(decks, { id: 'acme-sales-2026', name: 'Acme sales, Q4 2026' });
    expect(renamed).toEqual({ id: 'acme-sales-2026', name: 'Acme sales, Q4 2026', slides: 1 });
    expect(existsSync(join(templatesDir(decks), 'acme-sales-2026', 'template.json'))).toBe(true);
    expect(templateEntry(decks, 'acme-sales-2026')?.name).toBe('Acme sales, Q4 2026');
    expect(templateSlides(decks, 'acme-sales-2026').name).toBe('Acme sales, Q4 2026');
    expect(() => renameTemplate(decks, { id: 'acme-sales-2026', name: ' ' })).toThrow(
      /name must not be empty/,
    );
    expect(() => renameTemplate(decks, { id: 'blank', name: 'Empty' })).toThrow(
      TURBOSLIDE_TEMPLATE_FIXED,
    );
  });

  it('deletes the template folder and its index row; the default and Turboslide’s templates are refused', () => {
    setDefaultTemplate(decks, 'acme-sales-2026');
    expect(() => deleteTemplate(decks, { id: 'acme-sales-2026' })).toThrow(
      /Acme sales 2026 is used for new presentations\. Choose another template for new presentations first/,
    );
    setDefaultTemplate(decks, BLANK_TEMPLATE_ID);
    expect(deleteTemplate(decks, { id: 'acme-sales-2026' })).toEqual({
      id: 'acme-sales-2026',
      removed: true,
    });
    expect(existsSync(join(templatesDir(decks), 'acme-sales-2026'))).toBe(false);
    expect(readTemplateIndex(decks).map((row) => row.id)).toEqual(['blank']);
    expect(() => deleteTemplate(decks, { id: 'blank' })).toThrow(TURBOSLIDE_TEMPLATE_FIXED);
    expect(() => deleteTemplate(decks, { id: 'acme-sales-2026' })).toThrow(RangeError);
  });
});

describe('the deployment default (default.json; docs/PRODUCT.md 4.1, 4.3)', () => {
  it('is blank when the record is absent, names a saved template after Use for new presentations, and blank removes the record', () => {
    const decks = scratchDecks('default');
    expect(readDefaultTemplateId(decks)).toBe('blank');
    // the blank template's kit fields are the deployment's default kit (B5a's
    // decks/templates/blank/template.json: "General Translation", light); Reset reads its name
    const blankKit = readTemplate(join(REPO_DECKS, 'templates', 'blank')).record.brand;
    expect(readDefaultKit(decks)).toEqual({
      ...defaultKitOf(blankKit),
      template: 'blank',
      templateName: 'Blank',
      ...(blankKit === undefined ? {} : { brand: blankKit }),
    });
    expect(readDefaultKit(decks).name).toBe('General Translation');
    expect(readDefaultKit(decks).appearance).toBe('light');
    const kit = { name: 'Acme', appearance: 'light' };
    const source = sellerDeck(decks, 'Acme pitch', kit);
    saveTemplate(decks, { deckId: source, name: 'Acme sales 2026' }, NOW);
    expect(setDefaultTemplate(decks, 'acme-sales-2026')).toEqual({
      default: 'acme-sales-2026',
      name: 'Acme sales 2026',
    });
    const file = join(templatesDir(decks), DEFAULT_TEMPLATE_FILE);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ template: 'acme-sales-2026' });
    expect(readDefaultTemplateId(decks)).toBe('acme-sales-2026');
    expect(readDefaultKit(decks)).toEqual({
      name: 'Acme',
      appearance: 'light',
      template: 'acme-sales-2026',
      templateName: 'Acme sales 2026',
      brand: kit,
    });
    // /new and the Blank card read the default: a deck created from it carries the kit
    const created = createDeck(
      decks,
      { name: 'Untitled presentation', from: readDefaultTemplateId(decks) },
      NOW,
    );
    const manifest = JSON.parse(readFileSync(join(created.dir, 'deck.json'), 'utf8')) as {
      brand?: unknown;
    };
    expect(manifest.brand).toEqual(kit);
    expect(setDefaultTemplate(decks, 'blank')).toEqual({ default: 'blank', name: 'Blank' });
    expect(existsSync(file)).toBe(false);
    expect(readDefaultTemplateId(decks)).toBe('blank');
    expect(() => setDefaultTemplate(decks, 'nope')).toThrow(RangeError);
  });

  it('falls back to blank when the record names a template that is gone', () => {
    const decks = scratchDecks('default-gone');
    mkdirSync(templatesDir(decks), { recursive: true });
    writeFileSync(
      join(templatesDir(decks), DEFAULT_TEMPLATE_FILE),
      canonicalJson({ template: 'gone' }),
    );
    expect(readDefaultTemplateId(decks)).toBe('blank');
  });
});

describe('templates are read only decks (SPEC-5 4.1)', () => {
  it('names a folder under decks/templates and refuses a write to it with the one sentence', () => {
    const decks = scratchDecks('read-only');
    const dir = join(templatesDir(decks), 'blank');
    expect(isTemplateDir(decks, dir)).toBe(true);
    expect(isTemplateDir(decks, join(decks, 'acme-pitch'))).toBe(false);
    expect(() => assertNotTemplateDir(decks, dir)).toThrow(TEMPLATE_READ_ONLY);
    expect(() => assertNotTemplateDir(decks, join(decks, 'acme-pitch'))).not.toThrow();
    // the folder still reads as a deck, so the gallery's cover and template.slides work
    expect(loadDeckDir(dir).document.deck.id).toBe('blank');
  });
});
