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
//
// The product round (docs/PRODUCT.md 4.3; gslides-parity SPEC-5 4.1, ported from the round five
// branch and re pointed) adds the template index and the template writes. The index is
// `decks/templates/templates.json`, one row per template folder (`TemplateIndexEntry`), what the
// gallery page, the /decks strip and `template.list` read; a template is one folder and one index
// row, and `readTemplateIndex` answers the folders when the file is absent, so a decks folder
// without an index still lists `blank` and `gt-brand`. A fact the folder's record lacks (the
// organisation flag, a sentence, the cover) survives from the committed index row, so the two
// built in records need no edit for the gallery to read right; a record's own field wins when it
// is set. The writes are Save as template (`saveTemplate`, a deck copied into a template folder
// with its assets and its brand kit, listed under Your organisation; a name an organisation
// template already carries replaces it and keeps its slug through `updateTemplate`),
// `renameTemplate`, `deleteTemplate` (refused for the deployment default) and the deployment
// default itself, `decks/templates/default.json` (`{ "template": "<id>" }`), which /new, the Blank
// card and `deck.create` without `from` read through `readDefaultTemplateId`; absent, the default
// is `blank`. A template is a read only deck: `TEMPLATE_READ_ONLY` is the sentence every mutating
// action on a template's own document answers, and `isTemplateDir` tells a store whether the
// folder it was opened on is one. Turboslide's own templates (no `organisation` flag) take none of
// the writes but Use for new presentations. The hosted backends wrap these for their folders as
// they wrap createDeck; on the blob tier the template folder lives in the overlay until the
// collection pushes it (docs/gslides-parity/product/build/b5b.md, the request to the integrator).
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

import type {
  DeckTemplateId,
  TemplateCategory,
  TemplateIndexEntry,
} from '@turboslide/schema/actions';
import {
  DECK_TEMPLATES,
  TEMPLATE_CATEGORIES,
  templateIndexEntrySchema,
} from '@turboslide/schema/actions';
import type { Appearance, Deck, DeckDocument, Slide } from '@turboslide/schema/deck';
import { APPEARANCES, THEMES, isTrashed, slideOrder, slideTitle } from '@turboslide/schema/deck';
import { SLUG_PATTERN, slugify } from '@turboslide/schema/ids';
import type { BrandKit, DefaultKit as KitDefaults } from '@turboslide/schema/brand';
import { brandKitSchema, defaultKitOf } from '@turboslide/schema/brand';
import { canonicalJson, parseJson } from '@turboslide/schema/json';
import { validateDeck } from '@turboslide/schema/validate';

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

/** The index of the templates, `decks/templates/templates.json` (docs/PRODUCT.md 4.3). */
export const TEMPLATE_INDEX_FILE = 'templates.json';

/** The deployment default, `decks/templates/default.json` (`{ "template": "<id>" }`); absent means `blank`. */
export const DEFAULT_TEMPLATE_FILE = 'default.json';

/** The template new presentations start from when no default record exists. */
export const BLANK_TEMPLATE_ID: DeckTemplateId = 'blank';

/** The sentence every mutating action on a template's own document answers (SPEC-5 4.1). */
export const TEMPLATE_READ_ONLY =
  'Templates are read only. Start a presentation from it, or save a new template';

/** The sentence a write to one of Turboslide's own templates answers. */
export const TURBOSLIDE_TEMPLATE_FIXED =
  "Turboslide's templates cannot be changed. Save a new template instead";

/**
 * decks/templates/<id>/template.json. The product round (docs/PRODUCT.md 4.3; SPEC-5 4.1) widens
 * the id from the two built ins to any template folder and adds, all optional, the gallery's
 * category, Google's use case words, the cover slide, the slide count, the appearance a deck made
 * from it opens in, the organisation flag of a template saved on this deployment and the brand
 * kit record it carries.
 */
export type TemplateRecord = {
  schemaVersion: 1;
  /** the template id, the directory name and the deck.create `from` value (any slug; `DECK_TEMPLATES` are the two built ins) */
  id: string;
  name: string;
  description: string;
  theme: string;
  /** the gallery category (SPEC-5 0.23); `personal` in the index when absent */
  category?: TemplateCategory;
  /** Google's use case words (R02 b.1) */
  useCases?: string[];
  /** the slide the card renders; the first slide when absent */
  cover?: string;
  /** the slide count the index carries; computed from the manifest when absent */
  slideCount?: number;
  /** the appearance a deck created from this template opens in */
  appearance?: Appearance;
  /** set on a template saved on this deployment (Your organisation in the gallery) */
  organisation?: true;
  /** the brand kit record (docs/PRODUCT.md 4.1 `Deck.brand`, B5a's `BrandKit`) the deck carried when it was saved */
  brand?: BrandKit;
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
  /** a built in id or any id of the template index (docs/PRODUCT.md 4.3) */
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

/** True for a slug that can name a template folder: not the templates folder itself. */
function isTemplateSlug(value: unknown): value is string {
  return typeof value === 'string' && SLUG_PATTERN.test(value) && value !== TEMPLATES_DIR;
}

/** Parses template.json; a TypeError names the first field that does not hold. */
export function parseTemplateRecord(raw: unknown, file: string): TemplateRecord {
  if (!isRecord(raw)) throw new TypeError(`${file} must hold one JSON object`);
  if (raw.schemaVersion !== 1) throw new TypeError(`${file}: schemaVersion must be 1`);
  if (!isTemplateSlug(raw.id))
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
  if (raw.appearance !== undefined) {
    if (
      typeof raw.appearance !== 'string' ||
      !(APPEARANCES as ReadonlyArray<string>).includes(raw.appearance)
    )
      throw new TypeError(`${file}: appearance must be light or dark`);
    record.appearance = raw.appearance as Appearance;
  }
  if (raw.organisation !== undefined) {
    if (raw.organisation !== true)
      throw new TypeError(`${file}: organisation is true on a saved template or absent`);
    record.organisation = true;
  }
  if (raw.brand !== undefined) {
    const kit = brandKitSchema.safeParse(raw.brand);
    if (!kit.success)
      throw new TypeError(
        `${file}: brand must hold a brand kit record (${kit.error.issues[0]?.path.join('/') ?? 'brand'}: ${kit.error.issues[0]?.message ?? 'invalid'})`,
      );
    record.brand = kit.data;
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

/** Every template under decks/templates, by id; a folder whose name starts with a dot is a write in progress. */
export function listTemplates(decksDir: string): Template[] {
  const root = templatesDir(decksDir);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        existsSync(join(root, entry.name, 'template.json')),
    )
    .map((entry) => readTemplate(join(root, entry.name)))
    .sort((a, b) => a.record.id.localeCompare(b.record.id));
}

// ---------------------------------------------------------------------------------------------
// The template index (docs/PRODUCT.md 4.3; gslides-parity SPEC-5 4.1, 4.3)

/** The template's manifest as raw JSON, or null when the record names a file that is missing. */
function readTemplateManifest(template: Template): Record<string, unknown> | null {
  const manifestPath = join(template.dir, template.record.deck);
  if (!existsSync(manifestPath)) return null;
  const manifest = parseJson(readFileSync(manifestPath, 'utf8'), manifestPath);
  return isRecord(manifest) ? manifest : null;
}

/** The slide ids of a raw manifest in deck order. */
function manifestSlideIds(manifest: Record<string, unknown> | null): string[] {
  if (manifest === null || !Array.isArray(manifest.sections)) return [];
  const out: string[] = [];
  for (const section of manifest.sections) {
    if (!isRecord(section) || !Array.isArray(section.slideIds)) continue;
    for (const id of section.slideIds) if (typeof id === 'string') out.push(id);
  }
  return out;
}

/** The slide count of a template from its manifest's sections; the record's sections when the manifest is missing. */
export function templateSlideCount(template: Template): number {
  const manifest = readTemplateManifest(template);
  if (manifest === null)
    return template.record.sections.reduce((sum, section) => sum + section.slides, 0);
  return manifestSlideIds(manifest).length;
}

/** The record's cover, else the first slide id of the template's manifest. */
export function templateCover(template: Template): string | undefined {
  if (template.record.cover !== undefined) return template.record.cover;
  return manifestSlideIds(readTemplateManifest(template))[0];
}

/**
 * The appearance a deck made from the template opens in: the record's field, else the brand
 * kit's `appearance` (docs/PRODUCT.md 4.1), else the manifest's `defaults.appearance`; undefined
 * leaves the theme's rule to the reader (`deckAppearance`).
 */
export function templateAppearance(template: Template): Appearance | undefined {
  if (template.record.appearance !== undefined) return template.record.appearance;
  const isAppearance = (value: unknown): value is Appearance =>
    typeof value === 'string' && (APPEARANCES as ReadonlyArray<string>).includes(value);
  const kit = template.record.brand?.appearance;
  if (isAppearance(kit)) return kit;
  const manifest = readTemplateManifest(template);
  const defaults = manifest?.defaults;
  if (isRecord(defaults) && isAppearance(defaults.appearance)) return defaults.appearance;
  return undefined;
}

/**
 * A template's row of the index. `prior` is the row the committed index carries for the id: on
 * one of Turboslide's own templates (no `organisation` flag on the record) the row's gallery
 * facts (the name, the sentence, the category, the cover, the use cases and the organisation
 * flag) win over the folder's record, so the deployment names the GT brand deck under its own
 * name without an edit to the record; on a template saved on this deployment the record is the
 * truth, since every write of this module keeps it current. The counts, the theme, the appearance
 * and the brand kit are always read from the folder.
 */
export function templateIndexEntry(
  template: Template,
  prior?: TemplateIndexEntry,
): TemplateIndexEntry {
  const { record } = template;
  const theme = (THEMES as ReadonlyArray<string>).includes(record.theme)
    ? (record.theme as (typeof THEMES)[number])
    : 'gt-ink-paper';
  const carried = record.organisation === true ? undefined : prior;
  const description =
    carried?.description ?? (record.description === '' ? undefined : record.description);
  const cover = carried?.cover ?? templateCover(template);
  const useCases = carried?.useCases ?? record.useCases;
  const appearance = templateAppearance(template);
  const organisation = carried?.organisation ?? record.organisation;
  const entry: TemplateIndexEntry = {
    id: record.id,
    name: carried?.name ?? record.name,
    category: carried?.category ?? record.category ?? 'personal',
    slides: record.slideCount ?? templateSlideCount(template),
    theme,
  };
  if (description !== undefined)
    entry.description = description.length > 400 ? `${description.slice(0, 397)}...` : description;
  if (cover !== undefined) entry.cover = cover;
  if (useCases !== undefined && useCases.length > 0) entry.useCases = useCases.slice(0, 8);
  if (appearance !== undefined) entry.appearance = appearance;
  if (organisation === true) entry.organisation = true;
  if (record.brand !== undefined) entry.brand = record.brand;
  return templateIndexEntrySchema.parse(entry);
}

/** The fixed head of the index: Blank, then the GT brand deck; every other template follows by name. */
export const TEMPLATE_INDEX_ORDER: ReadonlyArray<string> = ['blank', 'gt-brand'];

export function compareIndexEntries(a: TemplateIndexEntry, b: TemplateIndexEntry): number {
  const ia = TEMPLATE_INDEX_ORDER.indexOf(a.id);
  const ib = TEMPLATE_INDEX_ORDER.indexOf(b.id);
  if (ia !== -1 || ib !== -1)
    return (
      (ia === -1 ? TEMPLATE_INDEX_ORDER.length : ia) -
      (ib === -1 ? TEMPLATE_INDEX_ORDER.length : ib)
    );
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

/** The rows of `templates.json` as written, or null when the file is absent or is not a list. */
function readIndexFile(decksDir: string): TemplateIndexEntry[] | null {
  const file = join(templatesDir(decksDir), TEMPLATE_INDEX_FILE);
  if (!existsSync(file)) return null;
  const raw = parseJson(readFileSync(file, 'utf8'), file);
  if (!Array.isArray(raw)) return null;
  return raw.map((row, index) => {
    const parsed = templateIndexEntrySchema.safeParse(row);
    if (!parsed.success)
      throw new TypeError(`${file}: row ${index} does not hold a template index entry`);
    return parsed.data;
  });
}

/** The index built from the folders, each row carrying the committed row's facts where the rule of `templateIndexEntry` says so. */
export function buildTemplateIndex(decksDir: string): TemplateIndexEntry[] {
  const prior = new Map((readIndexFile(decksDir) ?? []).map((row) => [row.id, row]));
  return listTemplates(decksDir)
    .map((template) => templateIndexEntry(template, prior.get(template.record.id)))
    .sort(compareIndexEntries);
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
 * The template index: the rows of `templates.json` whose folder still exists, plus a row for
 * every folder the file lacks (a template saved before the file was rewritten), in the index's
 * order; the folders alone when the file is absent, so a decks folder without an index still
 * answers `blank` and `gt-brand`.
 */
export function readTemplateIndex(decksDir: string): TemplateIndexEntry[] {
  const listed = readIndexFile(decksDir);
  if (listed === null) return buildTemplateIndex(decksDir);
  const root = templatesDir(decksDir);
  const rows = listed.filter((row) => existsSync(join(root, row.id, 'template.json')));
  const known = new Set(rows.map((row) => row.id));
  for (const template of listTemplates(decksDir)) {
    if (known.has(template.record.id)) continue;
    rows.push(templateIndexEntry(template));
  }
  return rows.sort(compareIndexEntries);
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
  return isTemplateSlug(from) && existsSync(join(templatesDir(decksDir), from, 'template.json'));
}

/** One row of the index by id; null when no template carries the id. */
export function templateEntry(decksDir: string, id: string): TemplateIndexEntry | null {
  return readTemplateIndex(decksDir).find((row) => row.id === id) ?? null;
}

// ---------------------------------------------------------------------------------------------
// The deployment default (docs/PRODUCT.md 4.1 "The deployment default", 4.3)

/** The deployment default's record shape, `decks/templates/default.json`. */
type DefaultTemplateRecord = { template: string };

/**
 * The template /new, the Blank card and `deck.create` without `from` start from: the id
 * `default.json` names when its folder exists, else `blank`.
 */
export function readDefaultTemplateId(decksDir: string): string {
  const file = join(templatesDir(decksDir), DEFAULT_TEMPLATE_FILE);
  if (!existsSync(file)) return BLANK_TEMPLATE_ID;
  const raw = parseJson(readFileSync(file, 'utf8'), file);
  if (!isRecord(raw) || !isTemplateSlug(raw.template)) return BLANK_TEMPLATE_ID;
  return isKnownTemplateId(decksDir, raw.template) ? raw.template : BLANK_TEMPLATE_ID;
}

/**
 * Use for new presentations (`template.setDefault`): writes `default.json` naming the template;
 * `blank` removes the record, so the deployment behaves as it did before any default was set.
 * An unknown template is a RangeError.
 */
export function setDefaultTemplate(
  decksDir: string,
  id: string,
): { default: string; name: string } {
  if (!isKnownTemplateId(decksDir, id))
    throw new RangeError(
      `No template "${id}" under decks/templates; the index lists ${templateIds(decksDir).join(', ')}`,
    );
  const root = templatesDir(decksDir);
  mkdirSync(root, { recursive: true });
  const file = join(root, DEFAULT_TEMPLATE_FILE);
  if (id === BLANK_TEMPLATE_ID) rmSync(file, { force: true });
  else {
    const record: DefaultTemplateRecord = { template: id };
    writeFileSync(file, canonicalJson(record));
  }
  return { default: id, name: templateEntry(decksDir, id)?.name ?? id };
}

/** What the deployment's default kit is named and looks like: read wherever docs/PRODUCT.md 4.1 says "the deployment's default kit". */
export type DefaultKit = KitDefaults & {
  /** the template id new presentations start from */
  template: string;
  /** the template's name in the gallery ("Acme sales 2026"); `name` is the kit's ("Acme", what Reset reads) */
  templateName: string;
  /** the brand kit record the template carries, when any */
  brand?: BrandKit;
};

/**
 * The deployment's default kit (B5a's `defaultKitOf` over the default template's record): the
 * kit's `name` ("General Translation" on GT's deployment; "Reset to <name>" and "Use the default
 * logo" read it), the appearance a new presentation opens in (the kit's, else `DEFAULT_APPEARANCE`),
 * the template it comes from and the whole kit record.
 */
export function readDefaultKit(decksDir: string): DefaultKit {
  const template = readDefaultTemplateId(decksDir);
  const entry = templateEntry(decksDir, template);
  return {
    ...defaultKitOf(entry?.brand),
    template,
    templateName: entry?.name ?? template,
    ...(entry?.brand !== undefined ? { brand: entry.brand } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Templates are read only decks (SPEC-5 4.1)

/** True when `dir` is a folder under decks/templates: a store opened on it takes no write. */
export function isTemplateDir(decksDir: string, dir: string): boolean {
  const root = resolve(templatesDir(decksDir));
  const target = resolve(dir);
  return target === root || target.startsWith(`${root}/`);
}

/** Refuses a write to a template's own document with the one sentence (SPEC-5 4.1). */
export function assertNotTemplateDir(decksDir: string, dir: string): void {
  if (isTemplateDir(decksDir, dir)) throw new TypeError(TEMPLATE_READ_ONLY);
}

// ---------------------------------------------------------------------------------------------
// The reads: a template's validated document and its slide rows (template.slides)

/** The folder of a template by id; a RangeError when none carries it. */
export function requireTemplate(decksDir: string, id: string): Template {
  if (!isTemplateSlug(id)) throw new TypeError(`"${id}" is not a template id (a slug)`);
  const dir = join(templatesDir(decksDir), id);
  if (!existsSync(join(dir, 'template.json')))
    throw new RangeError(
      `No template "${id}" under decks/templates; the index lists ${templateIds(decksDir).join(', ')}`,
    );
  return readTemplate(dir);
}

/** A template folder as a validated document: the manifest and every slide file; a TypeError when it does not validate. */
export function templateDocument(decksDir: string, id: string): DeckDocument {
  const template = requireTemplate(decksDir, id);
  const manifestPath = join(template.dir, template.record.deck);
  const slidesDir = join(template.dir, template.record.slides);
  const deck = parseJson(readFileSync(manifestPath, 'utf8'), manifestPath);
  const slides = existsSync(slidesDir)
    ? readdirSync(slidesDir)
        .filter((name) => name.endsWith('.json'))
        .map((name) =>
          parseJson(readFileSync(join(slidesDir, name), 'utf8'), join(slidesDir, name)),
        )
    : [];
  const result = validateDeck({ deck, slides });
  if (!result.ok || result.deck === null) {
    const first = result.issues.find((issue) => issue.severity === 3);
    throw new TypeError(
      `The template ${id} does not validate: ${first?.file ?? ''}${first?.pointer ?? ''}: ${first?.message ?? 'invalid'}`,
    );
  }
  return { deck: result.deck, slides: result.slides };
}

export type TemplateSlideRow = {
  index: number;
  slideId: string;
  title: string;
  kind: Slide['kind'];
};

/** `template.slides`: the template's slides in order with their titles and kinds. */
export function templateSlides(
  decksDir: string,
  id: string,
): { id: string; name: string; slides: TemplateSlideRow[] } {
  const template = requireTemplate(decksDir, id);
  const document = templateDocument(decksDir, id);
  const slides: TemplateSlideRow[] = [];
  let n = 0;
  for (const slideId of slideOrder(document.deck)) {
    const slide = document.slides[slideId];
    if (slide === undefined) continue;
    n += 1;
    slides.push({ index: n, slideId, title: slideTitle(slide, n), kind: slide.kind });
  }
  const name = templateEntry(decksDir, id)?.name ?? template.record.name;
  return { id, name, slides };
}

// ---------------------------------------------------------------------------------------------
// The writes: Save as template, Replace, Rename, Delete (docs/PRODUCT.md 4.3)

export type SaveTemplateInput = {
  /** the deck to save */
  deckId: string;
  /** the template name; its slug is the template id unless `id` is given */
  name: string;
  /** the one sentence the gallery card shows; "Saved from <deck title>" when absent */
  sentence?: string;
  id?: string;
};

export type TemplateWriteResult = {
  id: string;
  name: string;
  slides: number;
  /** true when the write replaced a template of the same id */
  replaced?: boolean;
};

/** The template id a name gives, and the organisation template that carries it already, if any. */
export function templateIdForName(
  decksDir: string,
  name: string,
): { id: string; existing: TemplateIndexEntry | null } {
  const id = slugify(name.trim());
  if (!isTemplateSlug(id)) {
    throw new TypeError(
      `"${name}" gives no template id; use letters or digits in the name (lower-case letters and digits joined by hyphens)`,
    );
  }
  return { id, existing: templateEntry(decksDir, id) };
}

/** Refuses a write to one of Turboslide's own templates (no organisation flag) with the one sentence. */
function requireOrganisationTemplate(decksDir: string, id: string): Template {
  const template = requireTemplate(decksDir, id);
  const entry = templateEntry(decksDir, id);
  const organisation = entry?.organisation === true || template.record.organisation === true;
  if (isBuiltInTemplateId(id) && id === BLANK_TEMPLATE_ID)
    throw new TypeError(TURBOSLIDE_TEMPLATE_FIXED);
  if (!organisation) throw new TypeError(TURBOSLIDE_TEMPLATE_FIXED);
  return template;
}

/** One slide file in the canonical form the store writes (file-store.ts), under any deck shaped folder. */
function writeSlideFile(dir: string, slide: Slide): void {
  mkdirSync(join(dir, 'slides'), { recursive: true });
  writeFileSync(join(dir, 'slides', `${slide.id}.json`), canonicalJson(slide));
}

/**
 * Writes a template folder from a deck: the manifest at revision 0 with fresh stamps and the
 * template's id, every slide, the assets folder whole, and template.json with the facts of
 * `record`. Written beside the target under a dot name first and moved into place, so a reader
 * never meets a half written folder and a refused write leaves the old template as it was.
 */
function writeTemplateFolder(
  decksDir: string,
  id: string,
  source: DeckDocument,
  sourceDir: string,
  facts: { name: string; description: string; organisation: true },
  now: string,
): { slides: number } {
  const root = templatesDir(decksDir);
  mkdirSync(root, { recursive: true });
  const staging = join(root, `.${id}.saving`);
  const dir = join(root, id);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(join(staging, 'slides'), { recursive: true });
  mkdirSync(join(staging, 'assets'), { recursive: true });
  const order = slideOrder(source.deck);
  for (const slideId of order) {
    const slide = source.slides[slideId];
    if (slide !== undefined) writeSlideFile(staging, slide);
  }
  const assetsDir = join(sourceDir, 'assets');
  if (existsSync(assetsDir) && statSync(assetsDir).isDirectory())
    cpSync(assetsDir, join(staging, 'assets'), { recursive: true, dereference: true });
  const { trashedAt: _trashed, ...rest } = source.deck;
  const manifest: Deck = { ...rest, id, revision: 0, createdAt: now, updatedAt: now };
  writeManifest(staging, manifest);
  const raw = source.deck as unknown as Record<string, unknown>;
  let brand: BrandKit | undefined;
  if (raw.brand !== undefined) {
    const kit = brandKitSchema.safeParse(raw.brand);
    if (!kit.success)
      throw new TypeError(
        `decks/${source.deck.id} carries a brand kit that does not validate: ${kit.error.issues[0]?.path.join('/') ?? 'brand'}`,
      );
    brand = kit.data;
  }
  const appearance = brand?.appearance ?? source.deck.defaults?.appearance;
  const record: TemplateRecord = {
    schemaVersion: 1,
    id,
    name: facts.name,
    description: facts.description,
    theme: source.deck.theme,
    deck: 'deck.json',
    slides: 'slides',
    assets: 'assets',
    sections: source.deck.sections.map((section) => ({
      id: section.id,
      name: section.name,
      slides: section.slideIds.length,
    })),
    archetypes: [],
    category: 'work',
    slideCount: order.length,
    organisation: facts.organisation,
    ...(order[0] !== undefined ? { cover: order[0] } : {}),
    ...(appearance !== undefined ? { appearance } : {}),
    ...(brand !== undefined ? { brand } : {}),
  };
  writeFileSync(join(staging, 'template.json'), canonicalJson(record));
  const loaded = loadDeckDir(staging);
  const blocking = loaded.issues.filter((issue) => issue.severity === 3);
  if (blocking.length > 0) {
    rmSync(staging, { recursive: true, force: true });
    const first = blocking[0];
    throw new TypeError(
      `The template does not validate: ${first?.file ?? ''}${first?.pointer ?? ''}: ${first?.message ?? 'invalid'}`,
    );
  }
  rmSync(dir, { recursive: true, force: true });
  cpSync(staging, dir, { recursive: true });
  rmSync(staging, { recursive: true, force: true });
  return { slides: order.length };
}

/** The sentence a saved template carries when the seller typed none. */
export function defaultTemplateSentence(deckTitle: string): string {
  return `Saved from ${deckTitle}`;
}

/**
 * Save as template (`template.create`): decks/templates/<slug of the name> from the deck, with
 * template.json carrying the name, the sentence, the organisation flag and the deck's brand kit,
 * and the index rewritten. A name an organisation template already carries replaces that
 * template and keeps its slug (`replaced: true`); a name that gives one of Turboslide's own ids
 * is refused with the one sentence, and a deck that does not validate is refused before anything
 * is written.
 */
export function saveTemplate(
  decksDir: string,
  input: SaveTemplateInput,
  options: CreateDeckOptions = {},
): TemplateWriteResult {
  const sourceDir = requireDeckDir(decksDir, input.deckId);
  const name = input.name.trim();
  if (name === '') throw new TypeError('name must not be empty');
  const id = input.id ?? templateIdForName(decksDir, name).id;
  if (!isTemplateSlug(id)) throw new TypeError(`id "${id}" is not a slug`);
  const existing = existsSync(join(templatesDir(decksDir), id, 'template.json'))
    ? readTemplate(join(templatesDir(decksDir), id))
    : null;
  if (existing !== null) {
    const listed = templateEntry(decksDir, id);
    const organisation = listed?.organisation === true || existing.record.organisation === true;
    if (!organisation || id === BLANK_TEMPLATE_ID)
      throw new TypeError(
        `${listed?.name ?? existing.record.name} is one of Turboslide's templates; pick another name`,
      );
  }
  const now = (options.now ?? (() => new Date().toISOString()))();
  const source = loadDeckDir(sourceDir);
  const blocking = source.issues.filter((issue) => issue.severity === 3);
  if (blocking.length > 0) {
    const first = blocking[0];
    throw new TypeError(
      `decks/${input.deckId} does not validate: ${first?.file ?? ''}${first?.pointer ?? ''}: ${first?.message ?? 'invalid'}`,
    );
  }
  const sentence = input.sentence?.trim();
  const description =
    sentence !== undefined && sentence !== ''
      ? sentence
      : defaultTemplateSentence(source.document.deck.title);
  const { slides } = writeTemplateFolder(
    decksDir,
    id,
    source.document,
    sourceDir,
    { name, description, organisation: true },
    now,
  );
  writeTemplateIndex(decksDir);
  return { id, name, slides, replaced: existing !== null };
}

/**
 * Replace a template from a deck (`template.update`): the slides, the assets and the brand kit
 * are the deck's; the id, the name and, unless a new one is given, the sentence stay. One of
 * Turboslide's own templates is refused with the one sentence.
 */
export function updateTemplate(
  decksDir: string,
  input: { id: string; deckId: string; sentence?: string },
  options: CreateDeckOptions = {},
): TemplateWriteResult {
  const template = requireOrganisationTemplate(decksDir, input.id);
  const sourceDir = requireDeckDir(decksDir, input.deckId);
  const now = (options.now ?? (() => new Date().toISOString()))();
  const source = loadDeckDir(sourceDir);
  const blocking = source.issues.filter((issue) => issue.severity === 3);
  if (blocking.length > 0) {
    const first = blocking[0];
    throw new TypeError(
      `decks/${input.deckId} does not validate: ${first?.file ?? ''}${first?.pointer ?? ''}: ${first?.message ?? 'invalid'}`,
    );
  }
  const sentence = input.sentence?.trim();
  const description =
    sentence !== undefined && sentence !== '' ? sentence : template.record.description;
  const { slides } = writeTemplateFolder(
    decksDir,
    input.id,
    source.document,
    sourceDir,
    { name: template.record.name, description, organisation: true },
    now,
  );
  writeTemplateIndex(decksDir);
  return { id: input.id, name: template.record.name, slides, replaced: true };
}

/** Rename a template (`template.rename`): the record's name changes, the id and the folder stay. */
export function renameTemplate(
  decksDir: string,
  input: { id: string; name: string },
): TemplateWriteResult {
  const template = requireOrganisationTemplate(decksDir, input.id);
  const name = input.name.trim();
  if (name === '') throw new TypeError('name must not be empty');
  const record: TemplateRecord = { ...template.record, name };
  writeFileSync(join(template.dir, 'template.json'), canonicalJson(record));
  writeTemplateIndex(decksDir);
  return { id: input.id, name, slides: templateSlideCount({ record, dir: template.dir }) };
}

/**
 * Delete a template (`template.delete`): the folder and its index row leave; presentations made
 * from it are not changed. The deployment default is refused until another template is chosen,
 * and so is one of Turboslide's own templates.
 */
export function deleteTemplate(
  decksDir: string,
  input: { id: string },
): { id: string; removed: true } {
  const template = requireOrganisationTemplate(decksDir, input.id);
  if (readDefaultTemplateId(decksDir) === input.id) {
    const name = templateEntry(decksDir, input.id)?.name ?? template.record.name;
    throw new TypeError(
      `${name} is used for new presentations. Choose another template for new presentations first`,
    );
  }
  rmSync(template.dir, { recursive: true, force: true });
  writeTemplateIndex(decksDir);
  return { id: input.id, removed: true };
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

  if (!isTemplateSlug(input.from))
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
    const base = manifest as Deck;
    // B5a's R8 (docs/PRODUCT.md 4.1, section 1's decision): a template whose manifest names no
    // appearance opens in the one its record names (templateAppearance: the record's, its kit's),
    // else the deployment's DEFAULT_APPEARANCE, so /new opens light on General Translation's
    // deployment and the brand deck, whose record says dark, opens dark
    const defaults =
      base.defaults?.appearance === undefined
        ? {
            ...base.defaults,
            appearance: templateAppearance(template) ?? defaultKitOf(record.brand).appearance,
          }
        : base.defaults;
    const deck: Deck = {
      ...base,
      id: deckId,
      title,
      defaults,
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
