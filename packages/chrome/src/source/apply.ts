// The source drawer's Apply path (SPEC 6.6): parse the JSON, run the validator, commit one
// slide.replace with the current baseRevision through the dispatcher, and describe what changed
// as a mutation log. Apply from a designer and applySource from an agent (the window API, SPEC
// 7.4) call this one function, so the two produce identical logs for the same edit (MILESTONES
// M3, editor.spec.ts). Pure apart from the dispatch call, so the path is unit tested in Node.
import type { Deck, DeckDocument, Slide } from '@turboslide/schema/deck';
import { diffDecks, describeMutation } from '@turboslide/schema/diff';
import type { SlideId } from '@turboslide/schema/ids';
import type { Mutation } from '@turboslide/schema/mutations';
import type { Issue } from '@turboslide/schema/validate';
import { validateSlide } from '@turboslide/schema/validate';

import type { EditorDispatch } from '../dispatch';

export type ApplySourceInput = {
  /** the drawer's text, or an agent's JSON string or object */
  source: string | object;
  /** the slide the drawer shows; the document must keep this id */
  slideId: SlideId;
  /** the slide as it is now, for the mutation log */
  before: Slide;
  revision: number;
  dispatch: EditorDispatch;
};

export type ApplySourceResult =
  | { ok: true; slide: Slide; revision: number; mutations: Mutation[]; log: string[] }
  | { ok: false; issues: Issue[] };

/** The two-space form the drawer shows, with the trailing newline of canonical JSON (SPEC 4.1). */
export function slideSource(slide: Slide): string {
  return `${JSON.stringify(slide, null, 2)}\n`;
}

/**
 * One pasteable shell command that applies the drawer's text through the CLI (SPEC 7.2): the
 * JSON travels in a quoted heredoc, so a click here and the same command in a terminal are the
 * one slide.replace write with the same baseRevision.
 */
export function slidePutCommand(
  deckId: string,
  slideId: SlideId,
  revision: number,
  source: string,
): string {
  const body = source.endsWith('\n') ? source : `${source}\n`;
  return `turboslide slide put ${slideId} --deck decks/${deckId} --base-revision ${revision} <<'JSON'\n${body}JSON\n`;
}

function issue(pointer: string, message: string, file: string): Issue {
  return { code: 'invalid', severity: 3, file, pointer, message };
}

/** Parses the drawer's text; a syntax error becomes one issue at the root pointer. */
export function parseSource(
  source: string | object,
  file: string,
): { value: unknown } | { issues: Issue[] } {
  if (typeof source !== 'string') return { value: source };
  try {
    return { value: JSON.parse(source) as unknown };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { issues: [issue('', `Invalid JSON: ${reason}`, file)] };
  }
}

/** A stand-in manifest so diffDecks compares two documents that differ in one slide only. */
function stubDeck(slideId: SlideId): Deck {
  return {
    schemaVersion: 1,
    id: 'deck',
    title: 'deck',
    theme: 'gt-ink-paper',
    sections: [{ id: 'section', name: 'Section', slideIds: [slideId] }],
    assets: {},
    revision: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

/** The mutations that turn one slide into another, in the reducer's own words (diffDecks). */
export function diffSlides(before: Slide, after: Slide): Mutation[] {
  const deck = stubDeck(before.id);
  const a: DeckDocument = { deck, slides: { [before.id]: before } };
  const b: DeckDocument = { deck, slides: { [after.id]: after } };
  return diffDecks(a, b);
}

/**
 * Validates the source and, when it is a slide with the drawer's id, dispatches one
 * `slide.replace` and returns the normalized slide with the mutation log. Issues come back
 * with their JSON pointers so the drawer can mark them in the text.
 */
export async function applySourceText(input: ApplySourceInput): Promise<ApplySourceResult> {
  const file = `slides/${input.slideId}.json`;
  const parsed = parseSource(input.source, file);
  if ('issues' in parsed) return { ok: false, issues: parsed.issues };
  const validation = validateSlide(parsed.value, file);
  if (!validation.ok || validation.slide === null) {
    return { ok: false, issues: validation.issues.filter((row) => row.severity === 3) };
  }
  if (validation.slide.id !== input.slideId) {
    return {
      ok: false,
      issues: [
        issue(
          '/id',
          `The drawer replaces slide "${input.slideId}"; to add a slide with id "${validation.slide.id}" use Insert`,
          file,
        ),
      ],
    };
  }
  const result = (await input.dispatch('slide.replace', {
    slideId: input.slideId,
    baseRevision: input.revision,
    slide: validation.slide,
  })) as { slide: Slide; revision: number };
  const mutations = diffSlides(input.before, result.slide);
  return {
    ok: true,
    slide: result.slide,
    revision: result.revision,
    mutations,
    log: mutations.map(describeMutation),
  };
}
