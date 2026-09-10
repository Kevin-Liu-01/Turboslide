// validateDeck (SPEC 4.4): parses with Zod, applies migrations by schemaVersion, normalizes
// (layout defaults filled, slot names checked against the layout, block ids unique per slide,
// asset references resolved, section slide ids unique across the deck, an opener's sectionId
// equals its section and it is first, Text parsed and re-serialized so escapes are canonical),
// keeps `ext` on the three levels, rejects unknown fields elsewhere with `unknown_field`, and
// returns issues with JSON pointers. The input is the manifest plus the slide files, since a deck
// on disk is deck.json plus slides/<id>.json (SPEC 4.1).
import type { z } from 'zod';
import type { Block } from './blocks.ts';
import { CATALOG, SLIDE_KIND_CATALOG, blockAssetRefs, blockTextPaths } from './catalog.ts';
import type { Deck, DeckDocument, Slide, SlotName } from './deck.ts';
import { deckSchema, normalizeLayout, slideBlocks, slideSchema, slotsForLayout } from './deck.ts';
import type { Severity } from './findings.ts';
import type { SlideId } from './ids.ts';
import { isRecord, migrate } from './migrations.ts';
import { getAt, joinPointer, setAt } from './pointer.ts';
import { canonicalText } from './text.ts';

export type IssueCode =
  | 'not_object'
  | 'invalid'
  | 'missing'
  | 'unknown_field'
  | 'ext'
  | 'migrated'
  | 'ahead'
  | 'duplicate_id'
  | 'slot'
  | 'reference'
  | 'unlisted'
  | 'opener';

export type Issue = {
  code: IssueCode;
  severity: Severity;
  /** 'deck.json', 'slides/<id>.json', or 'slides/[n]' when the file has no readable id */
  file: string;
  /** JSON pointer inside the file; '' is the whole file */
  pointer: string;
  message: string;
};

export type ValidationResult = {
  /** true when no issue has severity 3 */
  ok: boolean;
  deck: Deck | null;
  slides: Record<SlideId, Slide>;
  issues: Issue[];
};

export type SlideValidation = { ok: boolean; slide: Slide | null; issues: Issue[] };

const DECK_FILE = 'deck.json';

function slideFile(id: string): string {
  return `slides/${id}.json`;
}

/** Maps Zod issues to Issue rows with JSON pointers; unrecognized keys become one row per key. */
export function zodIssues(error: z.ZodError, file: string): Issue[] {
  const out: Issue[] = [];
  for (const zodIssue of error.issues) {
    const path = zodIssue.path.map((segment) =>
      typeof segment === 'symbol' ? String(segment) : segment,
    );
    if (zodIssue.code === 'unrecognized_keys') {
      for (const key of zodIssue.keys) {
        out.push({
          code: 'unknown_field',
          severity: 3,
          file,
          pointer: joinPointer([...path, key]),
          message: `Unknown field "${key}"; unknown data survives only under ext on a slide, a block or an asset (SPEC 4.1)`,
        });
      }
      continue;
    }
    const missing = zodIssue.code === 'invalid_type' && /received undefined/.test(zodIssue.message);
    out.push({
      code: missing ? 'missing' : 'invalid',
      severity: 3,
      file,
      pointer: joinPointer(path),
      message: zodIssue.message,
    });
  }
  return out;
}

function issue(
  code: IssueCode,
  severity: Severity,
  file: string,
  pointer: string,
  message: string,
): Issue {
  return { code, severity, file, pointer, message };
}

function compareIssues(a: Issue, b: Issue): number {
  if (a.severity !== b.severity) return b.severity - a.severity;
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.pointer !== b.pointer) return a.pointer < b.pointer ? -1 : 1;
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

/** Walks a block and its composite children; the callback gets the block and its pointer. */
export function walkBlocks(
  blocks: ReadonlyArray<Block>,
  basePointer: string,
  visit: (block: Block, pointer: string) => void,
): void {
  blocks.forEach((block, index) => {
    const pointer = `${basePointer}/${index}`;
    visit(block, pointer);
    if (block.type === 'composite') {
      block.cells.forEach((cell, cellIndex) => {
        walkBlocks(cell.blocks, `${pointer}/cells/${cellIndex}/blocks`, visit);
      });
    }
  });
}

/** The block lists of a slide with their pointers: slots for content, the plate otherwise. */
function blockLists(slide: Slide): { pointer: string; blocks: Block[] }[] {
  if (slide.kind === 'content') {
    return Object.entries(slide.slots).map(([slot, blocks]) => ({
      pointer: `/slots/${slot}`,
      blocks,
    }));
  }
  if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing') {
    return [{ pointer: '/plate/blocks', blocks: slide.plate.blocks }];
  }
  return [];
}

/** Canonicalizes every Text on the slide in place (SPEC 4.4). */
export function canonicalizeSlideText(slide: Slide): void {
  for (const path of SLIDE_KIND_CATALOG[slide.kind].textPaths) {
    const value = getAt(slide, path);
    if (typeof value === 'string') setAt(slide, path, canonicalText(value));
  }
  for (const list of blockLists(slide)) {
    walkBlocks(list.blocks, list.pointer, (block) => {
      for (const path of blockTextPaths(block)) {
        const value = getAt(block, path);
        if (typeof value === 'string') setAt(block, path, canonicalText(value));
      }
    });
  }
}

/** Where `ext` records sit on a slide: the slide itself and every block. */
function extPointers(slide: Slide): string[] {
  const out: string[] = [];
  if (slide.ext !== undefined) out.push('/ext');
  for (const list of blockLists(slide)) {
    walkBlocks(list.blocks, list.pointer, (block, pointer) => {
      if (block.ext !== undefined) out.push(`${pointer}/ext`);
    });
  }
  return out;
}

function normalizeSlide(slide: Slide, file: string, issues: Issue[]): void {
  if (slide.kind === 'content') {
    slide.layout = normalizeLayout(slide.layout);
    const allowed = slotsForLayout(slide.layout);
    for (const slot of Object.keys(slide.slots) as SlotName[]) {
      if (!allowed.includes(slot)) {
        issues.push(
          issue(
            'slot',
            3,
            file,
            `/slots/${slot}`,
            `Slot "${slot}" is not one of ${allowed.join(', ')} for layout ${slide.layout.type} (SPEC 4.2)`,
          ),
        );
      }
    }
  }
  const seen = new Map<string, string>();
  for (const list of blockLists(slide)) {
    walkBlocks(list.blocks, list.pointer, (block, pointer) => {
      const first = seen.get(block.id);
      if (first !== undefined) {
        issues.push(
          issue(
            'duplicate_id',
            3,
            file,
            `${pointer}/id`,
            `Block id "${block.id}" is already used at ${first} (SPEC 4.4)`,
          ),
        );
      } else {
        seen.set(block.id, pointer);
      }
      const allowedIn = CATALOG[block.type].allowedIn;
      const place = pointer.startsWith('/plate') ? 'plate' : 'content';
      if (!allowedIn.includes(place)) {
        issues.push(
          issue(
            'invalid',
            2,
            file,
            pointer,
            `A ${block.type} block belongs in ${allowedIn.join(' or ')} slots, not the ${place}`,
          ),
        );
      }
    });
  }
  canonicalizeSlideText(slide);
}

/**
 * Validates one slide file alone: migration, schema, normalization. The file label is used in
 * the issues; it defaults to slides/<id>.json when the id is readable.
 */
export function validateSlide(input: unknown, fileLabel?: string): SlideValidation {
  const issues: Issue[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      slide: null,
      issues: [
        issue('not_object', 3, fileLabel ?? 'slide', '', 'A slide file holds one JSON object'),
      ],
    };
  }
  const file = fileLabel ?? (typeof input.id === 'string' ? slideFile(input.id) : 'slide');
  const migrated = migrate(input, 'slide');
  if (migrated.ahead !== undefined) {
    issues.push(
      issue(
        'ahead',
        3,
        file,
        '/schemaVersion',
        `schemaVersion ${migrated.ahead} is newer than this build knows`,
      ),
    );
    return { ok: false, slide: null, issues };
  }
  if (migrated.applied.length > 0) {
    issues.push(
      issue(
        'migrated',
        1,
        file,
        '/schemaVersion',
        `Migrated to schemaVersion ${migrated.applied.at(-1)}; the file changes on save`,
      ),
    );
  }
  const parsed = slideSchema.safeParse(migrated.value);
  if (!parsed.success) {
    issues.push(...zodIssues(parsed.error, file));
    return { ok: false, slide: null, issues: issues.sort(compareIssues) };
  }
  const slide = parsed.data;
  normalizeSlide(slide, file, issues);
  const ext = extPointers(slide);
  if (ext.length > 0) {
    issues.push(
      issue('ext', 1, file, ext[0] ?? '/ext', `ext data kept at ${ext.join(', ')} (SPEC 4.1)`),
    );
  }
  issues.sort(compareIssues);
  return { ok: !issues.some((row) => row.severity === 3), slide, issues };
}

/** Validates the manifest alone. */
export function validateManifest(input: unknown): {
  ok: boolean;
  deck: Deck | null;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      deck: null,
      issues: [issue('not_object', 3, DECK_FILE, '', 'deck.json holds one JSON object')],
    };
  }
  const migrated = migrate(input, 'deck');
  if (migrated.ahead !== undefined) {
    issues.push(
      issue(
        'ahead',
        3,
        DECK_FILE,
        '/schemaVersion',
        `schemaVersion ${migrated.ahead} is newer than this build knows`,
      ),
    );
    return { ok: false, deck: null, issues };
  }
  if (migrated.applied.length > 0) {
    issues.push(
      issue(
        'migrated',
        1,
        DECK_FILE,
        '/schemaVersion',
        `Migrated to schemaVersion ${migrated.applied.at(-1)}; the file changes on save`,
      ),
    );
  }
  const parsed = deckSchema.safeParse(migrated.value);
  if (!parsed.success) {
    issues.push(...zodIssues(parsed.error, DECK_FILE));
    return { ok: false, deck: null, issues: issues.sort(compareIssues) };
  }
  const deck = parsed.data;
  const seen = new Map<string, string>();
  deck.sections.forEach((section, si) => {
    section.slideIds.forEach((slideId, ii) => {
      const pointer = `/sections/${si}/slideIds/${ii}`;
      const first = seen.get(slideId);
      if (first !== undefined) {
        issues.push(
          issue(
            'duplicate_id',
            3,
            DECK_FILE,
            pointer,
            `Slide "${slideId}" is already listed at ${first} (SPEC 4.4)`,
          ),
        );
      } else {
        seen.set(slideId, pointer);
      }
    });
  });
  const sectionIds = new Set<string>();
  deck.sections.forEach((section, si) => {
    if (sectionIds.has(section.id)) {
      issues.push(
        issue(
          'duplicate_id',
          3,
          DECK_FILE,
          `/sections/${si}/id`,
          `Section id "${section.id}" is repeated`,
        ),
      );
    }
    sectionIds.add(section.id);
  });
  for (const [key, asset] of Object.entries(deck.assets)) {
    if (asset.id !== key) {
      issues.push(
        issue(
          'invalid',
          3,
          DECK_FILE,
          `/assets/${key}/id`,
          `Asset id "${asset.id}" must equal its key "${key}"`,
        ),
      );
    }
    if (asset.ext !== undefined) {
      issues.push(issue('ext', 1, DECK_FILE, `/assets/${key}/ext`, `ext data kept (SPEC 4.1)`));
    }
  }
  issues.sort(compareIssues);
  return { ok: !issues.some((row) => row.severity === 3), deck, issues };
}

/** The accepted input shape: the manifest and the slide files, as an array or keyed by id. */
export type DeckInput = { deck: unknown; slides: unknown[] | Record<string, unknown> };

function slideEntries(slides: unknown): { label: string | undefined; value: unknown }[] {
  if (Array.isArray(slides)) return slides.map((value) => ({ label: undefined, value }));
  if (isRecord(slides)) {
    return Object.entries(slides).map(([key, value]) => ({ label: slideFile(key), value }));
  }
  return [];
}

/**
 * Validates a whole deck: the manifest, every slide, and the cross references between them.
 * `ok` is false when any issue has severity 3; `deck` is null only when the manifest itself
 * failed to parse.
 */
export function validateDeck(input: unknown): ValidationResult {
  if (!isRecord(input) || !('deck' in input)) {
    return {
      ok: false,
      deck: null,
      slides: {},
      issues: [
        issue(
          'not_object',
          3,
          DECK_FILE,
          '',
          'validateDeck takes { deck, slides }: the manifest and the slide files',
        ),
      ],
    };
  }
  const manifest = validateManifest(input.deck);
  const issues = [...manifest.issues];
  const slides: Record<SlideId, Slide> = {};
  const entries = slideEntries(input.slides);
  if (!Array.isArray(input.slides) && !isRecord(input.slides)) {
    issues.push(
      issue(
        'invalid',
        3,
        'slides',
        '',
        'slides must be an array of slide files or a record keyed by id',
      ),
    );
  }
  entries.forEach((entry, index) => {
    const label =
      entry.label ??
      (isRecord(entry.value) && typeof entry.value.id === 'string'
        ? undefined
        : `slides/[${index}]`);
    const result = validateSlide(entry.value, label);
    issues.push(...result.issues);
    if (result.slide === null) return;
    if (entry.label !== undefined && entry.label !== slideFile(result.slide.id)) {
      issues.push(
        issue(
          'invalid',
          3,
          entry.label,
          '/id',
          `Slide id "${result.slide.id}" must match its file name (SPEC 4.1)`,
        ),
      );
    }
    if (slides[result.slide.id] !== undefined) {
      issues.push(
        issue(
          'duplicate_id',
          3,
          slideFile(result.slide.id),
          '/id',
          `Slide id "${result.slide.id}" is used by two files`,
        ),
      );
      return;
    }
    slides[result.slide.id] = result.slide;
  });

  const deck = manifest.deck;
  if (deck !== null) {
    const listed = new Set<string>();
    deck.sections.forEach((section, si) => {
      section.slideIds.forEach((slideId, ii) => {
        listed.add(slideId);
        const slide = slides[slideId];
        if (slide === undefined) {
          issues.push(
            issue(
              'reference',
              3,
              DECK_FILE,
              `/sections/${si}/slideIds/${ii}`,
              `No slide file for "${slideId}" (${slideFile(slideId)})`,
            ),
          );
          return;
        }
        if (slide.kind === 'opener') {
          if (ii !== 0) {
            issues.push(
              issue(
                'opener',
                3,
                DECK_FILE,
                `/sections/${si}/slideIds/${ii}`,
                `Opener "${slideId}" must be first in its section (SPEC 4.4)`,
              ),
            );
          }
          if (slide.sectionId !== section.id) {
            issues.push(
              issue(
                'opener',
                3,
                slideFile(slideId),
                '/sectionId',
                `Opener sectionId "${slide.sectionId}" must equal its section "${section.id}" (SPEC 4.4)`,
              ),
            );
          }
        }
      });
    });
    for (const slide of Object.values(slides)) {
      if (!listed.has(slide.id)) {
        issues.push(
          issue(
            'unlisted',
            2,
            slideFile(slide.id),
            '',
            `Slide "${slide.id}" is in no section and will not render`,
          ),
        );
      }
      const file = slideFile(slide.id);
      if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing') {
        if (deck.assets[slide.picture.asset] === undefined) {
          issues.push(
            issue(
              'reference',
              3,
              file,
              '/picture/asset',
              `Asset "${slide.picture.asset}" is not in deck.json`,
            ),
          );
        }
      }
      for (const list of blockLists(slide)) {
        walkBlocks(list.blocks, list.pointer, (block, pointer) => {
          for (const ref of blockAssetRefs(block)) {
            if (ref.assetId !== '' && deck.assets[ref.assetId] === undefined) {
              issues.push(
                issue(
                  'reference',
                  3,
                  file,
                  `${pointer}${ref.path}`,
                  `Asset "${ref.assetId}" is not in deck.json`,
                ),
              );
            }
          }
        });
      }
    }
  }

  issues.sort(compareIssues);
  return { ok: !issues.some((row) => row.severity === 3), deck, slides, issues };
}

/** Validates an in-memory document; the reducer calls this after every write. */
export function validateDocument(document: DeckDocument): ValidationResult {
  return validateDeck({ deck: document.deck, slides: Object.values(document.slides) });
}

/** Severity 3 issues only, the ones that make `ok` false. */
export function blockingIssues(issues: ReadonlyArray<Issue>): Issue[] {
  return issues.filter((row) => row.severity === 3);
}

/** The blocks of every slide with their addresses, a convenience for callers of the validator. */
export function documentBlocks(
  document: DeckDocument,
): { slideId: SlideId; slot: SlotName | 'plate'; block: Block }[] {
  return Object.values(document.slides).flatMap((slide) =>
    slideBlocks(slide).map(({ slot, block }) => ({ slideId: slide.id, slot, block })),
  );
}
