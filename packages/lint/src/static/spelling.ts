// The `text/spelling` rule (gslides-parity SPEC-5 7.2, 1.2; R10 4.10; integrator.md 7.11): severity
// 1, no fix, over every Text and note of the deck through the deck's language dictionary, the
// caller's personal dictionary and the deck's noun list, skipped with a note when the language has
// no shipped dictionary. The static layer runs in the editor page with no Node import, so the
// engine reaches the rule as a checker the caller injects through the lint options
// (`SpellingLintOptions.spelling`, the Node port of `@turboslide/spelling/node` on the CLI); a run
// without one reports nothing, so `lint.run` in the page never pays for a dictionary. The rule is
// off in the judge's scoring so a brand name the dictionary lacks never moves the design score.
// The text refs this module names (`deckTextRefs`) are the supplier the spelling walk takes.
import type { Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import { walkBlocks } from '@turboslide/schema/validate';

import type { DeckDocument, Finding, RuleId } from '../contracts.ts';
import { findingId, slideOrder } from '../contracts.ts';
import type { LintContext } from '../context.ts';
import { blockTexts, slideTexts } from '../context.ts';

/** A Text of a slide as the spelling walk reads it: the block (absent for a slide field), the pointer, the markup. */
export type SpellingTextRef = { blockId?: string; path: string; text: string };

/** One misspelling as the checker answers it (`@turboslide/spelling/port` Misspelling). */
export type SpellingLintFinding = {
  slideId: string;
  blockId?: string;
  path: string;
  range: [number, number];
  word: string;
  suggestions: string[];
};

/** The checker the lint options may carry: the document level port of the spelling package. */
export type SpellingLintChecker = {
  check: (request: {
    document: DeckDocument;
    language: string;
    notes?: boolean;
    ignore?: ReadonlyArray<string>;
  }) => Promise<{ dictionary: string | null; misspellings: SpellingLintFinding[] }>;
};

export type SpellingLintOptions = {
  /** the engine; the rule reports nothing without it */
  spelling?: SpellingLintChecker;
  /** the caller's personal dictionary */
  personalDictionary?: ReadonlyArray<string>;
};

/**
 * Every Text of a slide in reading order with the pointer the walk and `text.splice` address:
 * the fixed compositions' fields, then every block's texts (nested blocks through their top
 * level block's pointer), the linter's `blockTexts` and `slideTexts` as the one source.
 */
export function deckTextRefs(slide: Slide): SpellingTextRef[] {
  const out: SpellingTextRef[] = [];
  for (const ref of slideTexts(slide)) out.push({ path: ref.path, text: ref.text });
  const lists: { pointer: string; blocks: ReturnType<typeof slideBlocks>[number]['block'][] }[] =
    slide.kind === 'content'
      ? Object.entries(slide.slots).map(([slot, blocks]) => ({ pointer: `/slots/${slot}`, blocks }))
      : slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing'
        ? [{ pointer: '/plate/blocks', blocks: slide.plate.blocks }]
        : [];
  for (const list of lists) {
    walkBlocks(list.blocks, list.pointer, (block, pointer) => {
      const rest = pointer.slice(list.pointer.length + 1);
      const slash = rest.indexOf('/');
      const top = list.blocks[Number(slash < 0 ? rest : rest.slice(0, slash))];
      if (top === undefined) return;
      const relativeBase = slash < 0 ? '' : rest.slice(slash);
      for (const ref of blockTexts(block)) {
        if (ref.role === 'cell' && ref.text.trim() === '') continue;
        out.push({ blockId: top.id, path: `${relativeBase}${ref.path}`, text: ref.text });
      }
    });
  }
  return out;
}

/** The message of a finding: the word and the first suggestion when there is one. */
export function spellingMessage(
  finding: Pick<SpellingLintFinding, 'word' | 'suggestions'>,
): string {
  const first = finding.suggestions[0];
  return first === undefined
    ? `"${finding.word}" is not in the dictionary`
    : `"${finding.word}" is not in the dictionary; "${first}" is the nearest word`;
}

/**
 * The rule: every misspelling of the deck's texts and notes as a severity 1 finding at the
 * Text's pointer, or nothing without an engine or a dictionary for the language. Async, because
 * the engine is; the static layer awaits the module's extra rules where the checker is present.
 */
export async function checkSpelling(document: DeckDocument, ctx: LintContext): Promise<Finding[]> {
  const options = ctx.options as LintContext['options'] & SpellingLintOptions;
  const checker = options.spelling;
  if (checker === undefined) return [];
  if (
    options.rules !== undefined &&
    !(options.rules as ReadonlyArray<string>).includes('text/spelling')
  )
    return [];
  const language = (document.deck as { language?: string }).language ?? 'en-US';
  const answer = await checker.check({
    document,
    language,
    notes: true,
    ignore: [
      ...(options.properNouns ?? []),
      ...(options.tokens ?? []),
      ...(options.personalDictionary ?? []),
    ],
  });
  if (answer.dictionary === null) return [];
  const order = slideOrder(document.deck);
  const findings: Finding[] = [];
  for (const row of answer.misspellings) {
    if (options.slideIds !== undefined && !options.slideIds.includes(row.slideId)) continue;
    if (!order.includes(row.slideId)) continue;
    // the rule id joins RULE_IDS through the integrator's rules.ts (b5.md request 11); typed here
    const rule = 'text/spelling' as RuleId;
    const path = `${row.path}:${row.range[0]}-${row.range[1]}`;
    const parts = {
      rule,
      slideId: row.slideId,
      ...(row.blockId === undefined ? {} : { blockId: row.blockId }),
      path,
    };
    findings.push({
      id: findingId(parts),
      ...parts,
      severity: 1,
      kind: 'copy',
      evidence: { text: row.word },
      proposal: spellingMessage(row),
      source: 'lint',
    });
  }
  return findings;
}
