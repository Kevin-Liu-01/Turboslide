// Deck templates and deck.create (SPEC 4.1; Kevin's directive for the landing: the studio's `/`
// opens a deck at once, creating one from the GT template when none exists). A template is a
// directory under decks/templates/<id> holding template.json (the record below), a deck.json and
// a slides/ folder; its assets folder is named by the record, relative to the template directory,
// so the GT template shares the imported deck's 30 MB of twins instead of carrying a second copy.
// createDeck copies the template into decks/<newId> with a fresh id, title, revision 0 and
// timestamps, or writes one title slide for the blank template, then reads the result back through
// the validator so a broken template fails here and not in the editor. Framework free: the CLI
// (`turboslide deck create`), the MCP server and the studio's server function all call this.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';

import type { DeckTemplateId } from '@turboslide/schema/actions';
import { DECK_TEMPLATES } from '@turboslide/schema/actions';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { SLUG_PATTERN, slugify } from '@turboslide/schema/ids';
import { canonicalJson, parseJson } from '@turboslide/schema/json';

import { loadDeckDir, writeManifest } from './file-store.ts';

/** The folder under decks/ that holds the template records. */
export const TEMPLATES_DIR = 'templates';

/** The name deck.create gives the deck the landing route makes when decks/ is empty. */
export const DEFAULT_DECK_NAME = 'GT brand deck';

/** One archetype the template offers as an insertable slide; the slide documents live in code. */
export type TemplateArchetype = {
  /** the slide template id (packages/chrome/src/slide-templates.ts) */
  id: string;
  label: string;
  kind: Slide['kind'];
  /** the layout of a content archetype */
  layout?: string;
  /** the GT deck slide the archetype is cut from */
  source?: string;
};

/** decks/templates/<id>/template.json. */
export type TemplateRecord = {
  schemaVersion: 1;
  /** the template id, the directory name and the deck.create `from` value */
  id: DeckTemplateId;
  name: string;
  description: string;
  theme: string;
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
  from: DeckTemplateId;
  /** the deck id; the slug of the name when absent */
  id?: string;
};

export type CreateDeckResult = {
  deckId: string;
  title: string;
  from: DeckTemplateId;
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

function isTemplateId(value: unknown): value is DeckTemplateId {
  return typeof value === 'string' && (DECK_TEMPLATES as ReadonlyArray<string>).includes(value);
}

/** Parses template.json; a TypeError names the first field that does not hold. */
export function parseTemplateRecord(raw: unknown, file: string): TemplateRecord {
  if (!isRecord(raw)) throw new TypeError(`${file} must hold one JSON object`);
  if (raw.schemaVersion !== 1) throw new TypeError(`${file}: schemaVersion must be 1`);
  if (!isTemplateId(raw.id))
    throw new TypeError(`${file}: id must be one of ${DECK_TEMPLATES.join(', ')}`);
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
  return {
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

  if (input.from === 'blank') {
    const { deck, slides } = blankDeckDocument(deckId, title, now);
    mkdirSync(join(dir, 'slides'), { recursive: true });
    for (const slide of slides) writeSlide(dir, slide);
    writeManifest(dir, deck);
  } else {
    const template = readTemplate(join(templatesDir(decksDir), input.from));
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
};

/** Reads the manifest facts of every deck folder under decks/, skipping templates and folders without a manifest. */
export function listDeckHeads(decksDir: string): DeckHead[] {
  if (!existsSync(decksDir)) return [];
  const out: DeckHead[] = [];
  for (const entry of readdirSync(decksDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === TEMPLATES_DIR) continue;
    const manifestPath = join(decksDir, entry.name, 'deck.json');
    if (!existsSync(manifestPath)) continue;
    const raw = parseJson(readFileSync(manifestPath, 'utf8'), manifestPath);
    if (!isRecord(raw)) continue;
    const sections = Array.isArray(raw.sections) ? raw.sections : [];
    out.push({
      id: basename(entry.name),
      title: typeof raw.title === 'string' ? raw.title : entry.name,
      slides: sections.reduce(
        (sum: number, section: unknown) =>
          sum +
          (isRecord(section) && Array.isArray(section.slideIds) ? section.slideIds.length : 0),
        0,
      ),
      sections: sections.length,
      revision: typeof raw.revision === 'number' ? raw.revision : 0,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    });
  }
  return out.sort(byNewest);
}

/** Newest first by updatedAt, then createdAt, then id, so the landing route picks one deck deterministically. */
export function byNewest(a: DeckHead, b: DeckHead): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id.localeCompare(b.id);
}
