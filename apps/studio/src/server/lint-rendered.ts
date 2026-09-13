import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { lintDeck } from '@turboslide/lint/run';
import type { LintLayers } from '@turboslide/lint/run';
import { cacheDir, defaultPaths } from '@turboslide/render-worker/paths';
import type { DeckDocument } from '@turboslide/schema/deck';
import type { Finding } from '@turboslide/schema/findings';
import { THEME_NAMES } from '@turboslide/schema/render';
import type { RenderRecord } from '@turboslide/schema/render';
import type { RuleId } from '@turboslide/schema/rules';

/**
 * The server only half of lint.run (gslides-parity SPEC-2 8.3): the rendered layer over the
 * render worker's cached records and `lintDeck` of `@turboslide/lint/run`, which reaches the
 * bitmap and PNG readers and their `node:` imports. Only `lint.ts`'s server function handler
 * loads this module, through a dynamic import inside the handler, so the editor's client graph
 * (which imports `lint.ts` for `lintLists` and the function stub) never names a node builtin
 * (VERIFICATION finding 12; `scripts/check-client-bundle.mjs` is the gate).
 */

export type LintRenderedInput = {
  deckId: string;
  document: DeckDocument;
  /** the slide ids to lint, in deck order; the whole deck when `all` is true */
  ids: readonly string[];
  all: boolean;
  layers: LintLayers;
  rule?: RuleId;
  lists: {
    properNouns: readonly string[];
    tokens: readonly string[];
    iconNames: readonly string[];
  };
};

/** The worker's cached records for these slides at this revision, both themes, 1x. */
export function cachedRecords(
  deckId: string,
  revision: number,
  slideIds: readonly string[],
): RenderRecord[] {
  const paths = defaultPaths();
  const out: RenderRecord[] = [];
  for (const theme of THEME_NAMES) {
    const dir = cacheDir(paths, deckId, revision, theme, 1);
    if (!existsSync(dir)) continue;
    for (const slideId of slideIds) {
      const file = join(dir, `${slideId}.json`);
      if (!existsSync(file)) continue;
      try {
        out.push(JSON.parse(readFileSync(file, 'utf8')) as RenderRecord);
      } catch {
        // a half-written cache file: the rendered layer skips this slide
      }
    }
  }
  return out;
}

/** Both layers over the store's document: the static rules always, the rendered ones over the cache. */
export function lintRenderedDeck(input: LintRenderedInput): Finding[] {
  const records =
    input.layers === 'static'
      ? []
      : cachedRecords(input.deckId, input.document.deck.revision, input.ids);
  return lintDeck(input.document, records, {
    layers: input.layers,
    ...(input.all ? {} : { slideIds: [...input.ids] }),
    ...(input.rule !== undefined ? { rules: [input.rule] } : {}),
    ...input.lists,
  });
}
