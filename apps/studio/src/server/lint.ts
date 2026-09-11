import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createServerFn } from '@tanstack/react-start';
import { lintDeck } from '@turboslide/lint/run';
import type { LintLayers } from '@turboslide/lint/run';
import { defaultPaths, cacheDir } from '@turboslide/render-worker/paths';
import type { Finding } from '@turboslide/schema/findings';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import { ICON_NAMES } from '@turboslide/schema/icons';
import { THEME_NAMES } from '@turboslide/schema/render';
import type { RenderRecord } from '@turboslide/schema/render';
import { isRuleId } from '@turboslide/schema/rules';
import type { RuleId } from '@turboslide/schema/rules';
import { PRODUCT_TOKENS, PROPER_NOUNS } from '@turboslide/theme/copy';
import { openFileStore } from '@turboslide/store/file-store';

import { parseJsonInput } from './json';
import type { Untrusted } from './json';
import { deckDir } from './root';

/**
 * lint.run for the editor (SPEC 6.5 "this slide's findings from the same linter the CLI runs";
 * MILESTONES M3 item 2): @turboslide/lint over the store's normalized document, the static layer
 * always and the rendered layer over the render worker's cached records for the current revision
 * when it has them (the worker writes cache/<deck>/<revision>/<theme>@1x/<slide>.json). The copy
 * lists and the icon names are the same ones apps/cli/src/deps/theme.ts hands the CLI.
 */

export type LintSlidesInput = {
  deckId: string;
  slideIds: 'all' | string[];
  layers?: LintLayers;
  rule?: RuleId;
};

/** The theme's copy lists and the sprite's icon names, as the CLI passes them (SPEC 5.1). */
export function lintLists(): {
  properNouns: readonly string[];
  tokens: readonly string[];
  iconNames: readonly string[];
} {
  return { properNouns: PROPER_NOUNS, tokens: PRODUCT_TOKENS, iconNames: ICON_NAMES };
}

/** The worker's cached records for these slides at this revision, both themes, 1x. */
function cachedRecords(
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

/** 'all' or a non-empty list of slugs, from untrusted input. */
export function slideSelection(value: unknown): 'all' | string[] {
  if (value === 'all') return 'all';
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("slideIds must be 'all' or a non-empty list of slugs");
  }
  return value.map((id: unknown) => {
    if (typeof id !== 'string' || !SLUG_PATTERN.test(id)) {
      throw new TypeError(`slide id ${JSON.stringify(id)} is not a slug`);
    }
    return id;
  });
}

function isLayers(value: unknown): value is LintLayers {
  return value === 'static' || value === 'rendered' || value === 'both';
}

const lintSlidesFn = createServerFn({ method: 'POST' })
  .validator((raw: string): LintSlidesInput => {
    const input = parseJsonInput<Untrusted<LintSlidesInput>>(raw);
    if (typeof input.deckId !== 'string' || !SLUG_PATTERN.test(input.deckId)) {
      throw new TypeError('deckId must be a slug');
    }
    const layers = input.layers ?? 'both';
    if (!isLayers(layers)) throw new TypeError('layers must be static, rendered or both');
    if (input.rule !== undefined && (typeof input.rule !== 'string' || !isRuleId(input.rule))) {
      throw new TypeError(`unknown rule ${String(input.rule)}`);
    }
    return {
      deckId: input.deckId,
      slideIds: slideSelection(input.slideIds),
      layers,
      ...(input.rule !== undefined ? { rule: input.rule } : {}),
    };
  })
  .handler(async ({ data }): Promise<string> => {
    const dir = deckDir(data.deckId);
    if (!existsSync(join(dir, 'deck.json'))) throw new RangeError(`No deck ${data.deckId}`);
    const { document } = await openFileStore({ dir }).read();
    const order = document.deck.sections.flatMap((section) => section.slideIds);
    const ids = data.slideIds === 'all' ? order : data.slideIds;
    for (const id of ids) {
      if (document.slides[id] === undefined) throw new RangeError(`No slide "${id}"`);
    }
    const layers = data.layers ?? 'both';
    const records =
      layers === 'static' ? [] : cachedRecords(data.deckId, document.deck.revision, ids);
    const findings = lintDeck(document, records, {
      layers,
      ...(data.slideIds === 'all' ? {} : { slideIds: ids }),
      ...(data.rule !== undefined ? { rules: [data.rule] } : {}),
      ...lintLists(),
    });
    return JSON.stringify(findings);
  });

/** lint.run over the store's document; JSON text on the wire (see write.ts on why). */
export async function lintSlides(input: LintSlidesInput): Promise<Finding[]> {
  return JSON.parse(await lintSlidesFn({ data: JSON.stringify(input) })) as Finding[];
}
