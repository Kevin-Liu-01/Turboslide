// The principal's preferences (gslides-parity SPEC-5 7.1, 0.34; R10 3.3): Google's Tools >
// Preferences and the Accessibility settings as one record on the round three principal record
// (`Principal.preferences`), mirrored in `localStorage` for first paint, addressed by JSON pointer
// through `prefs.get` and `prefs.set`, with Turboslide's `svgText` and `starred` rows. The integrator
// landed the record shape, its zod schema, the defaults and the twelve default substitutions of
// R10 2.2 on day 0 as the typed seam of SPEC-5 1.6; B5 (MILESTONES-5 B5 "Owns", day 1) added the
// rest of this module: the pointer reads and writes behind the two actions (`getPreference`,
// `setPreference`, with the removed defaults rule of R10 2.3), the read time migration of an
// older or partial record (`normalizePreferences`), the browser mirror over a storage shaped like
// `localStorage` (`preferencesMirror`), the one time migration of `spellcheck` and `announce`
// from the per browser `ts-editor-settings` record (`migrateLegacySettings`), and the store
// contract the two dispatchers compose (`PreferencesStore`, with a memory store for tests and
// the memory tier). Browser safe: zod and the pointer helpers, nothing else.
import { z } from 'zod';

import { cloneJson, getAt, jsonEqual, parsePointer, setAt } from './pointer.ts';

export const PREFERENCE_UNITS = ['in', 'cm', 'px'] as const;
export type PreferenceUnit = (typeof PREFERENCE_UNITS)[number];

/** Google's labels for the unit dropdown (SPEC-5 7.1). */
export const PREFERENCE_UNIT_LABELS: Readonly<Record<PreferenceUnit, string>> = {
  in: 'Inches',
  cm: 'Centimeters',
  px: 'Pixels',
};

/** The custom autofit preferences of Google's General tab, over the existing `Autofit` type. */
export const AUTOFIT_PREFERENCES = ['none', 'shrink', 'grow'] as const;
export type AutofitPreference = (typeof AUTOFIT_PREFERENCES)[number];

/** The SVG download's text modes (SPEC-5 6.4); `embed` is the default and Kevin's item 19. */
export const SVG_TEXT_MODES = ['embed', 'outline', 'link'] as const;
export type SvgTextMode = (typeof SVG_TEXT_MODES)[number];

export type Substitution = { from: string; to: string; on: boolean };

export type Preferences = {
  autocorrect: {
    capitalize: boolean;
    spelling: boolean;
    links: boolean;
    lists: boolean;
    quotes: boolean;
  };
  substitutions: {
    on: boolean;
    rows: Substitution[];
    /** the `from` strings of default rows the person removed, so a default never comes back */
    removedDefaults: string[];
  };
  autofit: { placeholder: AutofitPreference; textBox: AutofitPreference };
  units: PreferenceUnit;
  spelling: { underline: boolean; dictionary: string[] };
  accessibility: {
    screenReader: boolean;
    braille: boolean;
    announce: boolean;
    speakAloud: boolean;
  };
  dictation: { lang?: string };
  svgText: SvgTextMode;
  /** deck ids, the home page's Starred view (SPEC-5 7.7) */
  starred: string[];
};

/** A BCP 47 tag, `ll` or `ll-RR` (SPEC-5 1.2 `Deck.language`; the same grammar for dictation). */
export const LANGUAGE_TAG_PATTERN = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;

export const languageTagSchema = z
  .string()
  .regex(LANGUAGE_TAG_PATTERN, 'a BCP 47 tag such as en, en-US or pt-PT');

const substitutionSchema = z.strictObject({
  from: z.string().min(1).max(64),
  to: z.string().min(1).max(64),
  on: z.boolean(),
}) satisfies z.ZodType<Substitution>;

const wordList = z.array(z.string().min(1).max(64)).max(5000);

export const preferencesSchema = z.strictObject({
  autocorrect: z.strictObject({
    capitalize: z.boolean(),
    spelling: z.boolean(),
    links: z.boolean(),
    lists: z.boolean(),
    quotes: z.boolean(),
  }),
  substitutions: z.strictObject({
    on: z.boolean(),
    rows: z.array(substitutionSchema).max(500),
    removedDefaults: z.array(z.string().min(1).max(64)).max(64),
  }),
  autofit: z.strictObject({
    placeholder: z.enum(AUTOFIT_PREFERENCES),
    textBox: z.enum(AUTOFIT_PREFERENCES),
  }),
  units: z.enum(PREFERENCE_UNITS),
  spelling: z.strictObject({ underline: z.boolean(), dictionary: wordList }),
  accessibility: z.strictObject({
    screenReader: z.boolean(),
    braille: z.boolean(),
    announce: z.boolean(),
    speakAloud: z.boolean(),
  }),
  dictation: z.strictObject({ lang: languageTagSchema.optional() }),
  svgText: z.enum(SVG_TEXT_MODES),
  starred: z.array(z.string().min(1).max(200)).max(1000),
}) satisfies z.ZodType<Preferences>;

/**
 * Turboslide's twelve default substitutions (SPEC-5 7.1; R10 2.2): the symbols, the fractions,
 * the arrows, the en dash and the ellipsis; no em dash row (Kevin's rule).
 */
export const DEFAULT_SUBSTITUTIONS: ReadonlyArray<Substitution> = [
  { from: '(c)', to: '©', on: true },
  { from: '(r)', to: '®', on: true },
  { from: '(tm)', to: '™', on: true },
  { from: '1/2', to: '½', on: true },
  { from: '1/4', to: '¼', on: true },
  { from: '3/4', to: '¾', on: true },
  { from: '->', to: '→', on: true },
  { from: '<-', to: '←', on: true },
  { from: '<->', to: '↔', on: true },
  { from: '=>', to: '⇒', on: true },
  { from: '--', to: '–', on: true },
  { from: '...', to: '…', on: true },
];

/** The defaults of SPEC-5 7.1: every rule on, the twelve rows, shrink and grow, inches, underline on, everything else off or empty. */
export function defaultPreferences(): Preferences {
  return {
    autocorrect: { capitalize: true, spelling: true, links: true, lists: true, quotes: true },
    substitutions: {
      on: true,
      rows: DEFAULT_SUBSTITUTIONS.map((row) => ({ ...row })),
      removedDefaults: [],
    },
    autofit: { placeholder: 'shrink', textBox: 'grow' },
    units: 'in',
    spelling: { underline: true, dictionary: [] },
    accessibility: { screenReader: false, braille: false, announce: false, speakAloud: false },
    dictation: {},
    svgText: 'embed',
    starred: [],
  };
}

export const PREFERENCES_DEFAULTS: Readonly<Preferences> = defaultPreferences();

/** True when a record equals the defaults member for member (the mirror's "nothing to reconcile"). */
export function isDefaultPreferences(preferences: Preferences): boolean {
  return jsonEqual(preferences, PREFERENCES_DEFAULTS);
}

// ---------------------------------------------------------------------------------------------
// The pointer reads and writes behind prefs.get and prefs.set (SPEC-5 7.1; R10 3.4)

/** One `prefs.set` call: a JSON pointer into the record and the value, absent to delete the member. */
export type PreferenceWrite = { path: string; value?: unknown };

export type PreferenceErrorCode = 'invalid_pointer' | 'invalid_field' | 'unknown_field';

/**
 * A refused preference write or read (R10 3.4: "an unknown key or a bad enum value is refused as
 * `invalid_field`"), a TypeError so every transport maps it to 400 (`errorStatus`) with the JSON
 * pointer of the offending member the way the dispatcher's input errors carry one.
 */
export class PreferenceError extends TypeError {
  readonly code: PreferenceErrorCode;
  readonly pointer: string;

  constructor(code: PreferenceErrorCode, pointer: string, message: string) {
    super(message);
    this.name = 'TypeError';
    this.code = code;
    this.pointer = pointer;
  }
}

function pointerOf(path: string): string[] {
  try {
    return parsePointer(path);
  } catch (error) {
    throw new PreferenceError(
      'invalid_pointer',
      path,
      `preferences: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** The value at a pointer, the whole record for `''`, undefined when no member is there. */
export function getPreference(preferences: Preferences, path = ''): unknown {
  pointerOf(path);
  return getAt(preferences, path);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

/** Code point order, the same on every runtime (the Personal dictionary dialog lists it sorted). */
function sortedWords(words: string[]): string[] {
  return uniqueStrings(words).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

const DEFAULT_FROMS = new Set(DEFAULT_SUBSTITUTIONS.map((row) => row.from));

function fromsOf(rows: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (isPlainObject(row) && typeof row.from === 'string') out.add(row.from);
  }
  return out;
}

/**
 * The removed defaults rule (R10 2.3): a default row that leaves the table is remembered in
 * `removedDefaults` so a later default list never resurrects it, and a default row put back is
 * forgotten there. Applied after every write that touches the rows and skipped when the write
 * addresses `removedDefaults` itself, which the caller then owns.
 */
function reconcileRemovedDefaults(before: Set<string>, next: Preferences): void {
  const after = fromsOf(next.substitutions.rows);
  const removed = new Set(next.substitutions.removedDefaults);
  for (const from of DEFAULT_FROMS) {
    if (after.has(from)) removed.delete(from);
    else if (before.has(from)) removed.add(from);
  }
  next.substitutions.removedDefaults = [...removed];
}

/** The set semantics of the two word lists: `starred` unique in order, the dictionary unique and sorted. */
function normalizeLists(next: Preferences): void {
  next.starred = uniqueStrings(next.starred);
  next.spelling.dictionary = sortedWords(next.spelling.dictionary);
}

function refuseInvalid(issues: z.core.$ZodIssue[]): never {
  const first = issues[0];
  const unknown = issues.find((issue) => issue.code === 'unrecognized_keys');
  if (unknown !== undefined && 'keys' in unknown && Array.isArray(unknown.keys)) {
    const pointer = `/${[...unknown.path.map(String), String(unknown.keys[0] ?? '')].join('/')}`;
    throw new PreferenceError(
      'unknown_field',
      pointer,
      `preferences: no member at ${pointer}; the record's members are ${Object.keys(PREFERENCES_DEFAULTS).join(', ')}`,
    );
  }
  const pointer = `/${(first?.path ?? []).map(String).join('/')}`;
  throw new PreferenceError(
    'invalid_field',
    pointer,
    `preferences: invalid value at ${pointer}: ${first?.message ?? 'invalid'}`,
  );
}

/**
 * One `prefs.set` write (SPEC-5 7.1; R10 3.4): the value written at the pointer on a copy of the
 * record (an existing member, an array index, the length or `-` to append), an absent value
 * deleting the member (a missing one is left alone), the removed defaults rule applied, the two
 * word lists kept as sets, and the whole record validated against the schema afterwards, so an
 * unknown member or a bad value is refused with its pointer and nothing is written. The input
 * record is never mutated.
 */
export function setPreference(
  preferences: Preferences,
  path: string,
  value?: unknown,
): Preferences {
  const segments = pointerOf(path);
  if (segments.length === 0) {
    throw new PreferenceError(
      'invalid_pointer',
      path,
      'preferences: prefs.set writes one member; the path names it, such as /units or /starred/-',
    );
  }
  const next = cloneJson(preferences);
  const before = fromsOf(next.substitutions.rows);
  try {
    setAt(next, path, value === undefined ? undefined : cloneJson(value));
  } catch (error) {
    throw new PreferenceError(
      'invalid_pointer',
      path,
      `preferences: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = preferencesSchema.safeParse(next);
  if (!parsed.success) refuseInvalid(parsed.error.issues);
  const checked = parsed.data;
  if (!(segments[0] === 'substitutions' && segments[1] === 'removedDefaults')) {
    reconcileRemovedDefaults(before, checked);
  }
  normalizeLists(checked);
  return checked;
}

/** Applies several writes in order on one copy; the first refusal stops the batch and nothing is returned. */
export function setPreferences(
  preferences: Preferences,
  writes: ReadonlyArray<PreferenceWrite>,
): Preferences {
  let next = preferences;
  for (const write of writes) next = setPreference(next, write.path, write.value);
  return next;
}

// ---------------------------------------------------------------------------------------------
// The read time migration (SPEC-5 0.7's additive rule applied to the record)

const OBJECT_MEMBERS = [
  'autocorrect',
  'substitutions',
  'autofit',
  'spelling',
  'accessibility',
  'dictation',
] as const;

/**
 * A stored record read back, from the principal record or the mirror: an absent member takes its
 * default (a record written before a member existed keeps parsing, the migration of an older
 * shape), a default substitution row that is neither in the table nor in `removedDefaults` joins
 * the table (a new default appears once, a removed one never comes back), the two word lists are
 * kept as sets, and a value of the wrong type or a member the record does not have refuses the
 * whole value with null, so a later shape is never silently narrowed.
 */
export function normalizePreferences(value: unknown): Preferences | null {
  if (!isPlainObject(value)) return null;
  const defaults = defaultPreferences();
  const candidate: Record<string, unknown> = { ...defaults, ...value };
  for (const member of OBJECT_MEMBERS) {
    const given = value[member];
    if (given === undefined) candidate[member] = defaults[member];
    else if (isPlainObject(given)) candidate[member] = { ...defaults[member], ...given };
  }
  const parsed = preferencesSchema.safeParse(candidate);
  if (!parsed.success) return null;
  const next = parsed.data;
  const present = fromsOf(next.substitutions.rows);
  const removed = new Set(next.substitutions.removedDefaults);
  for (const row of DEFAULT_SUBSTITUTIONS) {
    if (!present.has(row.from) && !removed.has(row.from)) next.substitutions.rows.push({ ...row });
  }
  next.substitutions.removedDefaults = [...removed];
  normalizeLists(next);
  return next;
}

// ---------------------------------------------------------------------------------------------
// The browser mirror (SPEC-5 7.1 "mirrored in localStorage for first paint"; R10 3.2)

/** The storage key of the mirror: the record as JSON, read in a `useState` initializer, never the truth. */
export const PREFERENCES_STORAGE = 'ts-preferences';

/** The storage key of the one time migration mark (`'1'` once the legacy toggles were carried over). */
export const PREFERENCES_MIGRATED_STORAGE = 'ts-preferences-migrated';

/**
 * The per browser toggles' key (`SETTINGS_STORAGE` in packages/chrome/src/editor-shell.ts,
 * spelled here because the schema package never imports the chrome). `spellcheck` and `announce`
 * migrate from it once (R10 3.2); the other stored settings stay per browser.
 */
export const LEGACY_SETTINGS_STORAGE = 'ts-editor-settings';

/** What the mirror needs of `localStorage`; a fake in tests, null where storage is unavailable. */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/** The mirror's bytes read back, or null for no mirror, bad JSON or a record of another shape. */
export function readPreferencesMirror(saved: string | null): Preferences | null {
  if (saved === null) return null;
  try {
    return normalizePreferences(JSON.parse(saved));
  } catch {
    return null;
  }
}

/** The mirror's bytes for a record. */
export function writePreferencesMirror(preferences: Preferences): string {
  return JSON.stringify(preferences);
}

export type PreferencesMirror = {
  /** The mirrored record, null when there is none or storage is unavailable. */
  read(): Preferences | null;
  write(preferences: Preferences): void;
  clear(): void;
};

/**
 * The mirror over a storage; every access is guarded, since `localStorage` throws in a private
 * window or under a blocked site data setting and a missing mirror is the normal first visit.
 */
export function preferencesMirror(storage: StorageLike | null | undefined): PreferencesMirror {
  const guarded = <T>(run: (store: StorageLike) => T, fallback: T): T => {
    if (storage === null || storage === undefined) return fallback;
    try {
      return run(storage);
    } catch {
      return fallback;
    }
  };
  return {
    read: () => guarded((store) => readPreferencesMirror(store.getItem(PREFERENCES_STORAGE)), null),
    write: (preferences) =>
      guarded(
        (store) => store.setItem(PREFERENCES_STORAGE, writePreferencesMirror(preferences)),
        undefined,
      ),
    clear: () => guarded((store) => store.removeItem(PREFERENCES_STORAGE), undefined),
  };
}

// ---------------------------------------------------------------------------------------------
// The one time migration of spellcheck and announce (SPEC-5 7.1; R10 3.2)

/** The two per browser toggles that move onto the record: Underline errors and collaborator announcements. */
export type LegacyEditorSettings = { spellcheck?: boolean; announce?: boolean };

/** The `ts-editor-settings` bytes read for the two toggles; anything else in them is ignored. */
export function readLegacySettings(saved: string | null): LegacyEditorSettings {
  if (saved === null) return {};
  try {
    const parsed: unknown = JSON.parse(saved);
    if (!isPlainObject(parsed)) return {};
    const out: LegacyEditorSettings = {};
    if (typeof parsed.spellcheck === 'boolean') out.spellcheck = parsed.spellcheck;
    if (typeof parsed.announce === 'boolean') out.announce = parsed.announce;
    return out;
  } catch {
    return {};
  }
}

/**
 * The `prefs.set` writes a legacy record implies: only a value that differs from the record's
 * default travels (`spellcheck` false, `announce` true), so a browser that never changed a toggle
 * writes nothing and never overwrites what another browser of the same principal chose.
 */
export function legacyPreferenceWrites(legacy: LegacyEditorSettings): PreferenceWrite[] {
  const writes: PreferenceWrite[] = [];
  if (legacy.spellcheck === false) writes.push({ path: '/spelling/underline', value: false });
  if (legacy.announce === true) writes.push({ path: '/accessibility/announce', value: true });
  return writes;
}

export type LegacyMigration = {
  /** The writes to send through `prefs.set`; empty when the browser held the defaults. */
  writes: PreferenceWrite[];
  /** The mirror after the writes, already stored, so first paint shows the carried values. */
  preferences: Preferences;
  /** Marks the migration done; called by the shell once the record acknowledged the writes. */
  commit(): void;
};

/**
 * The one time migration on first load (R10 3.2): reads the legacy toggles, applies the writes
 * they imply to the mirror at once, and hands them back for the record. With nothing to carry it
 * marks itself done; with writes the caller marks it done through `commit()` after `prefs.set`
 * answered, so an offline first load retries on the next one. Null once done or without storage.
 */
export function migrateLegacySettings(
  storage: StorageLike | null | undefined,
): LegacyMigration | null {
  if (storage === null || storage === undefined) return null;
  let migrated: string | null;
  let legacySaved: string | null;
  try {
    migrated = storage.getItem(PREFERENCES_MIGRATED_STORAGE);
    legacySaved = storage.getItem(LEGACY_SETTINGS_STORAGE);
  } catch {
    return null;
  }
  if (migrated !== null) return null;
  const mirror = preferencesMirror(storage);
  const writes = legacyPreferenceWrites(readLegacySettings(legacySaved));
  const preferences = setPreferences(mirror.read() ?? defaultPreferences(), writes);
  const commit = (): void => {
    try {
      storage.setItem(PREFERENCES_MIGRATED_STORAGE, '1');
    } catch {
      // storage refused the mark: the next load reads the same legacy values and writes the same
      // two members again, which is idempotent
    }
  };
  if (writes.length > 0) mirror.write(preferences);
  else commit();
  return { writes, preferences, commit };
}

// ---------------------------------------------------------------------------------------------
// The store contract the dispatchers compose (SPEC-5 7.1 "record" writes; R10 3.2)

/**
 * Where the caller's record lives on a transport: the principal record hosted and on a checkout
 * (`principalPreferencesStore` of @turboslide/identity/principal over the file or Redis store, the
 * CLI's local principal file), the memory store below in tests and on the memory tier. `load`
 * answers the defaults for a principal without a record; `save` writes the whole record and
 * answers what it stored.
 */
export type PreferencesStore = {
  load(): Promise<Preferences>;
  save(preferences: Preferences): Promise<Preferences>;
};

/** A store over one in memory record, for tests and the memory tier. */
export function memoryPreferencesStore(
  initial: Preferences = defaultPreferences(),
): PreferencesStore & { current(): Preferences } {
  let current = cloneJson(initial);
  return {
    async load() {
      return cloneJson(current);
    },
    async save(preferences) {
      current = cloneJson(preferences);
      return cloneJson(current);
    },
    current: () => cloneJson(current),
  };
}

/** `prefs.set` over a store: load, write the member, save; the stored record is the answer. */
export async function applyPreferenceWrite(
  store: PreferencesStore,
  write: PreferenceWrite,
): Promise<Preferences> {
  const next = setPreference(await store.load(), write.path, write.value);
  return store.save(next);
}

// ---------------------------------------------------------------------------------------------
// The autocorrect engine reached through the preferences module (gslides-parity SPEC-5 7.1;
// b5.md request 8): the engine lives in `autocorrect.ts` and its tables in `autocorrect-lists.ts`,
// two subpaths the package's exports map does not carry yet (the integrator's file). Until the
// `./autocorrect` and `./autocorrect-lists` entries land, the editor, the notes pane and the lane
// handlers import these names from `@turboslide/schema/preferences`, the module the record they
// read already comes from; the importers move to the subpaths in the fixer round and this block
// goes. Named re-exports of one sibling module, not a barrel.
export {
  AUTOCORRECT_RULES,
  QUOTE_KEYS,
  TRIGGER_KEYS,
  applyCorrection,
  autocorrect,
  autocorrectText,
  isTriggerKey,
  needsAutocorrect,
  plainParagraphs,
  smartQuote,
} from './autocorrect.ts';
export type {
  AutocorrectOptions,
  AutocorrectRule,
  AutocorrectTextResult,
  Correction,
  TextChange,
} from './autocorrect.ts';
export { CORRECTIONS, quoteStyleFor } from './autocorrect-lists.ts';
