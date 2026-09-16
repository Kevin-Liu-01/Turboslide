// Deck templates and deck.create (SPEC 4.1; Kevin's directive for the landing: the studio's `/`
// opens a deck at once, creating one from the GT template when none exists). A template is a
// directory under decks/templates/<id> holding template.json (the record below), a deck.json and
// a slides/ folder; its assets folder is named by the record, relative to the template directory,
// so the GT template shares the imported deck's 30 MB of twins instead of carrying a second copy.
// createDeck copies the template into decks/<newId> with a fresh id, title, revision 0 and
// timestamps, then reads the result back through the validator so a broken template fails here
// and not in the editor. The blank template (gslides-parity SPEC 5.2, 6.1) is a folder like the
// GT one, decks/templates/blank: one Title slide with empty placeholders, the title Untitled
// presentation and the theme starter set of four two-tone pictures, so Section header, Caption
// and Closing work on a fresh deck; a decks folder without that template (the tests' scratch
// folders) falls back to blankDeckDocument, one title slide and no assets. Framework free: the CLI
// (`turboslide deck create`), the MCP server and the studio's server function all call this.
//
// The deck level operations of the parity round live here too (SPEC 7.5): copyDeck (Make a copy,
// with slideIds and removeNotes), trashDeck and restoreDeck (the trashedAt stamp on the manifest,
// written at the store level and never through deck.set) and removeDeck (Delete forever). Each
// backend of hosted.ts wraps them for its own folder.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';

import type { DeckTemplateId } from '@turboslide/schema/actions';
import { DECK_TEMPLATES } from '@turboslide/schema/actions';
import type { TemplateCategory, TemplateIndexEntry } from '@turboslide/schema/building-blocks';
import { TEMPLATE_CATEGORIES, templateIndexEntrySchema } from '@turboslide/schema/building-blocks';
import type { Deck, DeckDocument, Slide } from '@turboslide/schema/deck';
import { THEMES, isTrashed, slideOrder } from '@turboslide/schema/deck';
import { SLUG_PATTERN, slugify } from '@turboslide/schema/ids';
import { canonicalJson, parseJson } from '@turboslide/schema/json';

import { STATE_DIR, loadDeckDir, writeManifest } from './file-store.ts';

/** The folder under decks/ that holds the template records. */
export const TEMPLATES_DIR = 'templates';

/** The name deck.create gives the deck the landing route makes when decks/ is empty. */
export const DEFAULT_DECK_NAME = 'GT brand deck';

/** The title of a fresh presentation (gslides-parity SPEC 6.1); the auto-title replaces it once. */
export const DEFAULT_BLANK_TITLE = 'Untitled presentation';

/** One archetype the template offers as an insertable slide; the slide documents live in code. */
export type TemplateArchetype = {
  /** a layout id (packages/schema/src/layouts.ts; gslides-parity SPEC 5.2) */
  id: string;
  label: string;
  kind: Slide['kind'];
  /** the layout of a content archetype */
  layout?: string;
  /** the GT deck slide the archetype is cut from */
  source?: string;
};

/** The index of the templates, `decks/templates/templates.json` (gslides-parity SPEC-5 4.1). */
export const TEMPLATE_INDEX_FILE = 'templates.json';

/**
 * decks/templates/<id>/template.json. Round five (gslides-parity SPEC-5 4.1) widens the id from
 * the two built ins to any template folder and adds, all optional, the gallery's category, Google's
 * use case words, the cover slide and the slide count the index carries.
 */
export type TemplateRecord = {
  schemaVersion: 1;
  /** the template id, the directory name and the deck.create `from` value (any slug; `DECK_TEMPLATES` are the two built ins) */
  id: string;
  name: string;
  description: string;
  theme: string;
  /** the gallery heading the card sits under (SPEC-5 0.23); a template without one is not listed on the gallery page */
  category?: TemplateCategory;
  /** Google's use case words (R02 b.1), shown in the Templates pane */
  useCases?: string[];
  /** the slide the card renders; the first slide when absent */
  cover?: string;
  /** the slide count the index carries; computed from the manifest when absent */
  slideCount?: number;
  /** the manifest file, relative to the template directory */
  deck: string;
  /** the slides folder, relative to the template directory */
  slides: string;
  /** the assets folder the created deck copies, relative to the template directory */
  assets: string;
  sections: { id: string; name: string; slides: number }[];
  archetypes: TemplateArchetype[];
};

export type Template = { record: TemplateRecord; dir: string };

export type CreateDeckInput = {
  name: string;
  /** a built in id or any id of the template index (SPEC-5 4.6) */
  from: DeckTemplateId | string;
  /** the deck id; the slug of the name when absent */
  id?: string;
};

export type CreateDeckResult = {
  deckId: string;
  title: string;
  from: DeckTemplateId | string;
  revision: number;
  dir: string;
  counts: { slides: number; sections: number; assets: number };
};

export type CreateDeckOptions = {
  /** the clock, for tests */
  now?: () => string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True for a built in template id (`gt-brand`, `blank`). */
export function isBuiltInTemplateId(value: unknown): value is DeckTemplateId {
  return typeof value === 'string' && (DECK_TEMPLATES as ReadonlyArray<string>).includes(value);
}

/** Parses template.json; a TypeError names the first field that does not hold. */
export function parseTemplateRecord(raw: unknown, file: string): TemplateRecord {
  if (!isRecord(raw)) throw new TypeError(`${file} must hold one JSON object`);
  if (raw.schemaVersion !== 1) throw new TypeError(`${file}: schemaVersion must be 1`);
  if (typeof raw.id !== 'string' || !SLUG_PATTERN.test(raw.id) || raw.id === TEMPLATES_DIR)
    throw new TypeError(
      `${file}: id must be a slug (lower case letters and digits joined by hyphens), the template folder's name`,
    );
  for (const key of ['name', 'description', 'theme', 'deck', 'slides', 'assets'] as const) {
    if (typeof raw[key] !== 'string' || raw[key] === '')
      throw new TypeError(`${file}: ${key} must be a non-empty string`);
  }
  if (!Array.isArray(raw.sections) || !Array.isArray(raw.archetypes))
    throw new TypeError(`${file}: sections and archetypes must be arrays`);
  const sections = raw.sections.map((section, index) => {
    if (
      !isRecord(section) ||
      typeof section.id !== 'string' ||
      typeof section.name !== 'string' ||
      typeof section.slides !== 'number'
    )
      throw new TypeError(`${file}: sections/${index} must be { id, name, slides }`);
    return { id: section.id, name: section.name, slides: section.slides };
  });
  const archetypes = raw.archetypes.map((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      typeof entry.label !== 'string' ||
      typeof entry.kind !== 'string'
    )
      throw new TypeError(`${file}: archetypes/${index} must be { id, label, kind }`);
    const archetype: TemplateArchetype = {
      id: entry.id,
      label: entry.label,
      kind: entry.kind as Slide['kind'],
    };
    if (typeof entry.layout === 'string') archetype.layout = entry.layout;
    if (typeof entry.source === 'string') archetype.source = entry.source;
    return archetype;
  });
  const record: TemplateRecord = {
    schemaVersion: 1,
    id: raw.id,
    name: raw.name as string,
    description: raw.description as string,
    theme: raw.theme as string,
    deck: raw.deck as string,
    slides: raw.slides as string,
    assets: raw.assets as string,
    sections,
    archetypes,
  };
  if (raw.category !== undefined) {
    if (
      typeof raw.category !== 'string' ||
      !(TEMPLATE_CATEGORIES as ReadonlyArray<string>).includes(raw.category)
    )
      throw new TypeError(`${file}: category must be one of ${TEMPLATE_CATEGORIES.join(', ')}`);
    record.category = raw.category as TemplateCategory;
  }
  if (raw.useCases !== undefined) {
    if (!Array.isArray(raw.useCases) || !raw.useCases.every((entry) => typeof entry === 'string'))
      throw new TypeError(`${file}: useCases must be a list of strings`);
    record.useCases = raw.useCases as string[];
  }
  if (raw.cover !== undefined) {
    if (typeof raw.cover !== 'string' || raw.cover === '')
      throw new TypeError(`${file}: cover must be a slide id`);
    record.cover = raw.cover;
  }
  if (raw.slideCount !== undefined) {
    if (
      typeof raw.slideCount !== 'number' ||
      !Number.isInteger(raw.slideCount) ||
      raw.slideCount < 0
    )
      throw new TypeError(`${file}: slideCount must be a whole number`);
    record.slideCount = raw.slideCount;
  }
  return record;
}

/** The templates folder: decks/templates. */
export function templatesDir(decksDir: string): string {
  return join(decksDir, TEMPLATES_DIR);
}

/** Reads one template directory; a RangeError when it has no template.json. */
export function readTemplate(dir: string): Template {
  const file = join(dir, 'template.json');
  if (!existsSync(file)) throw new RangeError(`No template.json in ${dir}`);
  return { record: parseTemplateRecord(parseJson(readFileSync(file, 'utf8'), file), file), dir };
}

/** Every template under decks/templates, by id. */
export function listTemplates(decksDir: string): Template[] {
  const root = templatesDir(decksDir);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'template.json')))
    .map((entry) => readTemplate(join(root, entry.name)))
    .sort((a, b) => a.record.id.localeCompare(b.record.id));
}

/** The slide count of a template from its manifest's sections. */
export function templateSlideCount(template: Template): number {
  const manifestPath = join(template.dir, template.record.deck);
  if (!existsSync(manifestPath))
    return template.record.sections.reduce((sum, section) => sum + section.slides, 0);
  const manifest = parseJson(readFileSync(manifestPath, 'utf8'), manifestPath);
  if (!isRecord(manifest) || !Array.isArray(manifest.sections)) return 0;
  return manifest.sections.reduce(
    (sum: number, section: unknown) =>
      sum + (isRecord(section) && Array.isArray(section.slideIds) ? section.slideIds.length : 0),
    0,
  );
}

/** The first slide id of a template's manifest, the cover when the record names none. */
export function templateCover(template: Template): string | undefined {
  if (template.record.cover !== undefined) return template.record.cover;
  const manifestPath = join(template.dir, template.record.deck);
  if (!existsSync(manifestPath)) return undefined;
  const manifest = parseJson(readFileSync(manifestPath, 'utf8'), manifestPath);
  if (!isRecord(manifest) || !Array.isArray(manifest.sections)) return undefined;
  for (const section of manifest.sections) {
    if (
      isRecord(section) &&
      Array.isArray(section.slideIds) &&
      typeof section.slideIds[0] === 'string'
    )
      return section.slideIds[0];
  }
  return undefined;
}

/** A template's row of the index (SPEC-5 4.1): the id, the name, the category, the cover, the use cases, the slide count and the theme. */
export function templateIndexEntry(template: Template): TemplateIndexEntry {
  const { record } = template;
  const theme = (THEMES as ReadonlyArray<string>).includes(record.theme)
    ? (record.theme as (typeof THEMES)[number])
    : 'gt-ink-paper';
  const cover = templateCover(template);
  const entry: TemplateIndexEntry = {
    id: record.id,
    name: record.name,
    // the GT deck sits under Personal as General presentation and Blank is first (SPEC-5 0.23)
    category: record.category ?? 'personal',
    slides: record.slideCount ?? templateSlideCount(template),
    theme,
  };
  if (record.description !== '')
    entry.description =
      record.description.length > 400
        ? `${record.description.slice(0, 397)}...`
        : record.description;
  if (cover !== undefined) entry.cover = cover;
  if (record.useCases !== undefined && record.useCases.length > 0)
    entry.useCases = record.useCases.slice(0, 8);
  return templateIndexEntrySchema.parse(entry);
}

/** The order of the index: Blank, Blank (Plate), General presentation (the GT deck), then Sales pitch, then the rest by name (SPEC-5 4.3). */
export const TEMPLATE_INDEX_ORDER: ReadonlyArray<string> = [
  'blank',
  'blank-plate',
  'gt-brand',
  'sales-pitch',
];

export function compareIndexEntries(a: TemplateIndexEntry, b: TemplateIndexEntry): number {
  const ia = TEMPLATE_INDEX_ORDER.indexOf(a.id);
  const ib = TEMPLATE_INDEX_ORDER.indexOf(b.id);
  if (ia !== -1 || ib !== -1)
    return (
      (ia === -1 ? TEMPLATE_INDEX_ORDER.length : ia) -
      (ib === -1 ? TEMPLATE_INDEX_ORDER.length : ib)
    );
  return a.name.localeCompare(b.name);
}

/** The index built from the folders (what the seed writes and `template.list` answers without a file). */
export function buildTemplateIndex(decksDir: string): TemplateIndexEntry[] {
  return listTemplates(decksDir).map(templateIndexEntry).sort(compareIndexEntries);
}

/** Writes `decks/templates/templates.json` from the folders; answers the rows written. */
export function writeTemplateIndex(decksDir: string): TemplateIndexEntry[] {
  const rows = buildTemplateIndex(decksDir);
  const root = templatesDir(decksDir);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, TEMPLATE_INDEX_FILE), canonicalJson(rows));
  return rows;
}

/**
 * The template index: `templates.json` when it exists and parses, else the folders. The two built
 * ins are always rows, so a decks folder without templates still answers `gt-brand` and `blank`.
 */
export function readTemplateIndex(decksDir: string): TemplateIndexEntry[] {
  const file = join(templatesDir(decksDir), TEMPLATE_INDEX_FILE);
  if (existsSync(file)) {
    const raw = parseJson(readFileSync(file, 'utf8'), file);
    if (Array.isArray(raw)) {
      const rows = raw.map((row, index) => {
        const parsed = templateIndexEntrySchema.safeParse(row);
        if (!parsed.success)
          throw new TypeError(`${file}: row ${index} does not hold a template index entry`);
        return parsed.data;
      });
      return rows.sort(compareIndexEntries);
    }
  }
  return buildTemplateIndex(decksDir);
}

/** The ids `deck.create --from` accepts: the index's ids with the two built ins. */
export function templateIds(decksDir: string): string[] {
  const ids = new Set<string>(DECK_TEMPLATES);
  for (const row of readTemplateIndex(decksDir)) ids.add(row.id);
  return [...ids];
}

/** True when `from` names a built in or a template folder under decks/templates. */
export function isKnownTemplateId(decksDir: string, from: string): boolean {
  if (isBuiltInTemplateId(from)) return true;
  return SLUG_PATTERN.test(from) && existsSync(join(templatesDir(decksDir), from, 'template.json'));
}

/** The deck id a name gives: its slug, or a TypeError when nothing slug-like survives. */
export function deckIdFor(input: CreateDeckInput): string {
  const id = input.id ?? slugify(input.name);
  if (!SLUG_PATTERN.test(id)) {
    throw new TypeError(
      input.id === undefined
        ? `"${input.name}" gives no deck id; pass an id (lower-case letters and digits joined by hyphens)`
        : `id "${input.id}" is not a slug`,
    );
  }
  return id;
}

/** The blank deck: one section, one title slide, no assets. */
export function blankDeckDocument(
  id: string,
  title: string,
  now: string,
): { deck: Deck; slides: Slide[] } {
  const deck: Deck = {
    schemaVersion: 1,
    id,
    title,
    theme: 'gt-ink-paper',
    sections: [{ id: 'deck', name: 'Deck', slideIds: ['title'] }],
    assets: {},
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
  const slide: Slide = {
    schemaVersion: 1,
    id: 'title',
    kind: 'title',
    mark: { w: 132, h: 84 },
    heading: title,
    lead: 'What this deck covers, in one or two sentences.',
  };
  return { deck, slides: [slide] };
}

function copySlides(from: string, to: string): number {
  mkdirSync(to, { recursive: true });
  let count = 0;
  for (const file of readdirSync(from)) {
    if (!file.endsWith('.json')) continue;
    cpSync(join(from, file), join(to, file));
    count += 1;
  }
  return count;
}

/**
 * Creates decks/<id> from a template. The name is the title; the id is its slug unless given; an
 * existing directory is refused with a TypeError (400), a missing template with a RangeError
 * (404). The new deck starts at revision 0 with fresh timestamps and an empty version log, and is
 * read back through the validator before the result is returned.
 */
export function createDeck(
  decksDir: string,
  input: CreateDeckInput,
  options: CreateDeckOptions = {},
): CreateDeckResult {
  const title = input.name.trim();
  if (title === '') throw new TypeError('name must not be empty');
  const deckId = deckIdFor({ ...input, name: title });
  if (deckId === TEMPLATES_DIR)
    throw new TypeError(`"${TEMPLATES_DIR}" is the templates folder, not a deck id`);
  const dir = resolve(decksDir, deckId);
  if (existsSync(dir)) throw new TypeError(`decks/${deckId} exists already; pick another name`);
  const now = (options.now ?? (() => new Date().toISOString()))();

  if (!SLUG_PATTERN.test(input.from) || input.from === TEMPLATES_DIR)
    throw new TypeError(`"${input.from}" is not a template id (a slug)`);
  const templateDir = join(templatesDir(decksDir), input.from);
  if (input.from === 'blank' && !existsSync(join(templateDir, 'template.json'))) {
    // a decks folder without the blank template: one title slide, no starter pictures
    const { deck, slides } = blankDeckDocument(deckId, title, now);
    mkdirSync(join(dir, 'slides'), { recursive: true });
    for (const slide of slides) writeSlide(dir, slide);
    writeManifest(dir, deck);
  } else {
    if (!existsSync(join(templateDir, 'template.json')))
      throw new RangeError(
        `No template "${input.from}" under decks/templates; the index lists ${templateIds(decksDir).join(', ')}`,
      );
    const template = readTemplate(templateDir);
    const { record } = template;
    const manifestPath = join(template.dir, record.deck);
    const manifest = parseJson(readFileSync(manifestPath, 'utf8'), manifestPath);
    if (!isRecord(manifest)) throw new TypeError(`${manifestPath} must hold a deck manifest`);
    const assetsDir = resolve(template.dir, record.assets);
    if (!existsSync(assetsDir) || !statSync(assetsDir).isDirectory())
      throw new RangeError(`The template names an assets folder that is missing: ${assetsDir}`);
    mkdirSync(dir, { recursive: true });
    copySlides(join(template.dir, record.slides), join(dir, 'slides'));
    cpSync(assetsDir, join(dir, 'assets'), { recursive: true, dereference: true });
    const deck: Deck = {
      ...(manifest as Deck),
      id: deckId,
      title,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    };
    writeManifest(dir, deck);
  }

  const loaded = loadDeckDir(dir);
  const blocking = loaded.issues.filter((issue) => issue.severity === 3);
  if (blocking.length > 0) {
    const first = blocking[0];
    throw new TypeError(
      `decks/${deckId} does not validate after creation: ${first?.file ?? ''}${first?.pointer ?? ''}: ${first?.message ?? 'invalid'}`,
    );
  }
  const { deck } = loaded.document;
  return {
    deckId,
    title: deck.title,
    from: input.from,
    revision: deck.revision,
    dir,
    counts: {
      slides: deck.sections.reduce((sum, section) => sum + section.slideIds.length, 0),
      sections: deck.sections.length,
      assets: Object.keys(deck.assets).length,
    },
  };
}

/** One slide file in the canonical form the store writes (file-store.ts). */
function writeSlide(dir: string, slide: Slide): void {
  mkdirSync(join(dir, 'slides'), { recursive: true });
  writeFileSync(join(dir, 'slides', `${slide.id}.json`), canonicalJson(slide));
}

/** The summary rows the deck list shows, sorted newest first by updatedAt (the store rewrites it last). */
export type DeckHead = {
  id: string;
  title: string;
  slides: number;
  sections: number;
  revision: number;
  updatedAt: string;
  createdAt: string;
  /** set when the deck is in the trash (gslides-parity SPEC 7.2.5); such rows appear only with includeTrashed */
  trashedAt?: string;
};

export type ListDecksOptions = {
  /** also list the decks in the trash; off by default (deck.list, /decks) */
  includeTrashed?: boolean;
};

/** One deck folder's head, or null when the folder has no readable manifest. */
export function readDeckHead(decksDir: string, name: string): DeckHead | null {
  const manifestPath = join(decksDir, name, 'deck.json');
  if (!existsSync(manifestPath)) return null;
  const raw = parseJson(readFileSync(manifestPath, 'utf8'), manifestPath);
  if (!isRecord(raw)) return null;
  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  const head: DeckHead = {
    id: basename(name),
    title: typeof raw.title === 'string' ? raw.title : name,
    slides: sections.reduce(
      (sum: number, section: unknown) =>
        sum + (isRecord(section) && Array.isArray(section.slideIds) ? section.slideIds.length : 0),
      0,
    ),
    sections: sections.length,
    revision: typeof raw.revision === 'number' ? raw.revision : 0,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
  };
  if (typeof raw.trashedAt === 'string' && raw.trashedAt !== '') head.trashedAt = raw.trashedAt;
  return head;
}

/**
 * Reads the manifest facts of every deck folder under decks/, skipping templates, folders without
 * a manifest and, unless asked, the decks in the trash (gslides-parity SPEC 7.2.5).
 */
export function listDeckHeads(decksDir: string, options: ListDecksOptions = {}): DeckHead[] {
  if (!existsSync(decksDir)) return [];
  const out: DeckHead[] = [];
  for (const entry of readdirSync(decksDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === TEMPLATES_DIR || entry.name.startsWith('.'))
      continue;
    const head = readDeckHead(decksDir, entry.name);
    if (head === null) continue;
    if (head.trashedAt !== undefined && options.includeTrashed !== true) continue;
    out.push(head);
  }
  return out.sort(byNewest);
}

// ---------------------------------------------------------------------------------------------
// Make a copy, the trash and Delete forever (gslides-parity SPEC 6.4, 6.5, 7.5)

export type CopyDeckInput = {
  /** the deck to copy */
  id: string;
  /** the title of the copy; its id is the slug unless newId is given */
  name: string;
  newId?: string;
  /** copy these slides only, in deck order; every slide when absent */
  slideIds?: ReadonlyArray<string>;
  /** leave the speaker notes out of the copy */
  removeNotes?: boolean;
};

export type CopyDeckResult = {
  deckId: string;
  sourceDeckId: string;
  title: string;
  revision: number;
  dir: string;
  counts: { slides: number; sections: number; assets: number };
};

/** The deck directory of an id under decks/; a RangeError when it holds no manifest. */
export function requireDeckDir(decksDir: string, deckId: string): string {
  if (!SLUG_PATTERN.test(deckId)) throw new TypeError(`"${deckId}" is not a deck id (a slug)`);
  if (deckId === TEMPLATES_DIR)
    throw new TypeError(`"${TEMPLATES_DIR}" is the templates folder, not a deck id`);
  const dir = join(decksDir, deckId);
  if (!existsSync(join(dir, 'deck.json'))) throw new RangeError(`No deck ${deckId} under decks/`);
  return dir;
}

/** Strips a slide's speaker notes. */
function withoutNotes(slide: Slide): Slide {
  if (slide.notes === undefined) return slide;
  const { notes: _notes, ...rest } = slide;
  return rest as Slide;
}

/**
 * The document of a copy: the named slides (every slide when none are named) in deck order, the
 * sections that keep a slide, every asset, the notes unless removed, revision 0 and fresh stamps.
 * A named slide the deck lacks is a RangeError; a selection that leaves no slide is a TypeError.
 */
export function copyDocument(
  source: DeckDocument,
  input: Pick<CopyDeckInput, 'slideIds' | 'removeNotes'> & { deckId: string; title: string },
  now: string,
): DeckDocument {
  const order = slideOrder(source.deck);
  let keep: Set<string>;
  if (input.slideIds === undefined) keep = new Set(order);
  else {
    for (const id of input.slideIds) {
      if (source.slides[id] === undefined)
        throw new RangeError(`No slide "${id}" in ${source.deck.id}`);
    }
    keep = new Set(input.slideIds);
  }
  if (keep.size === 0) throw new TypeError('deck.copy: the selection leaves no slide');
  const sections = source.deck.sections
    .map((section) => ({ ...section, slideIds: section.slideIds.filter((id) => keep.has(id)) }))
    .filter((section) => section.slideIds.length > 0);
  const slides: Record<string, Slide> = {};
  for (const id of order) {
    if (!keep.has(id)) continue;
    const slide = source.slides[id];
    if (slide === undefined) continue;
    const copy = JSON.parse(JSON.stringify(slide)) as Slide;
    slides[id] = input.removeNotes === true ? withoutNotes(copy) : copy;
  }
  const { trashedAt: _trashed, ...rest } = source.deck;
  const deck: Deck = {
    ...rest,
    id: input.deckId,
    title: input.title,
    sections,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
  return { deck, slides };
}

/**
 * Make a copy (gslides-parity SPEC 6.5, 7.5 deck.copy): decks/<newId> from decks/<id> with a new
 * title, the named slides, the assets folder copied whole, no version log and no leases. The
 * copy is read back through the validator before the result is returned.
 */
export function copyDeck(
  decksDir: string,
  input: CopyDeckInput,
  options: CreateDeckOptions = {},
): CopyDeckResult {
  const sourceDir = requireDeckDir(decksDir, input.id);
  const title = input.name.trim();
  if (title === '') throw new TypeError('name must not be empty');
  const deckId = deckIdFor({
    name: title,
    from: 'blank',
    ...(input.newId !== undefined ? { id: input.newId } : {}),
  });
  if (deckId === input.id)
    throw new TypeError(`the copy needs an id other than ${input.id}; pass newId`);
  const dir = resolve(decksDir, deckId);
  if (existsSync(dir)) throw new TypeError(`decks/${deckId} exists already; pick another name`);
  const now = (options.now ?? (() => new Date().toISOString()))();
  const source = loadDeckDir(sourceDir).document;
  const document = copyDocument(
    source,
    {
      deckId,
      title,
      ...(input.slideIds !== undefined ? { slideIds: input.slideIds } : {}),
      ...(input.removeNotes !== undefined ? { removeNotes: input.removeNotes } : {}),
    },
    now,
  );
  mkdirSync(join(dir, 'slides'), { recursive: true });
  for (const slide of Object.values(document.slides)) writeSlide(dir, slide);
  const assetsDir = join(sourceDir, 'assets');
  if (existsSync(assetsDir) && statSync(assetsDir).isDirectory())
    cpSync(assetsDir, join(dir, 'assets'), { recursive: true, dereference: true });
  writeManifest(dir, document.deck);
  const loaded = loadDeckDir(dir);
  const blocking = loaded.issues.filter((issue) => issue.severity === 3);
  if (blocking.length > 0) {
    rmSync(dir, { recursive: true, force: true });
    const first = blocking[0];
    throw new TypeError(
      `the copy of ${input.id} does not validate: ${first?.file ?? ''}${first?.pointer ?? ''}: ${first?.message ?? 'invalid'}`,
    );
  }
  const { deck } = loaded.document;
  return {
    deckId,
    sourceDeckId: input.id,
    title: deck.title,
    revision: deck.revision,
    dir,
    counts: {
      slides: deck.sections.reduce((sum, section) => sum + section.slideIds.length, 0),
      sections: deck.sections.length,
      assets: Object.keys(deck.assets).length,
    },
  };
}

export type TrashState = { id: string; trashedAt: string | null; revision: number };

/**
 * Moves a deck to the trash (gslides-parity SPEC 6.4, 7.2.5): writes trashedAt on the manifest
 * at the store level, so the revision and the version log are untouched and deck.set keeps
 * refusing the field. `baseRevision`, when given, must be the current revision (a TypeError names
 * the mismatch so the caller maps it to 409). A deck already in the trash keeps its stamp.
 */
export function trashDeck(
  decksDir: string,
  deckId: string,
  options: CreateDeckOptions & { baseRevision?: number } = {},
): TrashState {
  const dir = requireDeckDir(decksDir, deckId);
  const { document } = loadDeckDir(dir);
  checkBase(document.deck, options.baseRevision);
  if (isTrashed(document.deck))
    return {
      id: deckId,
      trashedAt: document.deck.trashedAt ?? null,
      revision: document.deck.revision,
    };
  const now = (options.now ?? (() => new Date().toISOString()))();
  writeManifest(dir, { ...document.deck, trashedAt: now });
  return { id: deckId, trashedAt: now, revision: document.deck.revision };
}

/** Clears trashedAt (gslides-parity SPEC 7.5 deck.restore); a deck outside the trash is unchanged. */
export function restoreDeck(
  decksDir: string,
  deckId: string,
  options: { baseRevision?: number } = {},
): TrashState {
  const dir = requireDeckDir(decksDir, deckId);
  const { document } = loadDeckDir(dir);
  checkBase(document.deck, options.baseRevision);
  if (!isTrashed(document.deck))
    return { id: deckId, trashedAt: null, revision: document.deck.revision };
  const { trashedAt: _trashed, ...deck } = document.deck;
  writeManifest(dir, deck);
  return { id: deckId, trashedAt: null, revision: document.deck.revision };
}

/**
 * Delete forever (gslides-parity SPEC 6.4, 7.5 deck.remove): removes decks/<id> with its slides,
 * assets, version log and state folder. Irreversible; the caller has confirmed.
 */
export function removeDeck(
  decksDir: string,
  deckId: string,
  options: { baseRevision?: number } = {},
): { id: string; removed: true } {
  const dir = requireDeckDir(decksDir, deckId);
  if (options.baseRevision !== undefined)
    checkBase(loadDeckDir(dir).document.deck, options.baseRevision);
  rmSync(dir, { recursive: true, force: true });
  rmSync(join(decksDir, STATE_DIR, 'unpack', deckId), { recursive: true, force: true });
  return { id: deckId, removed: true };
}

/** A stale base revision is a StaleRevisionError, which the CLI and the routes map to 409. */
export class StaleRevisionError extends Error {
  readonly currentRevision: number;
  constructor(deckId: string, baseRevision: number, currentRevision: number) {
    super(`baseRevision ${baseRevision} is stale; ${deckId} is at revision ${currentRevision}`);
    this.name = 'StaleRevisionError';
    this.currentRevision = currentRevision;
  }
}

function checkBase(deck: Deck, baseRevision: number | undefined): void {
  if (baseRevision !== undefined && baseRevision !== deck.revision)
    throw new StaleRevisionError(deck.id, baseRevision, deck.revision);
}

/** Newest first by updatedAt, then createdAt, then id, so the landing route picks one deck deterministically. */
export function byNewest(a: DeckHead, b: DeckHead): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id.localeCompare(b.id);
}
