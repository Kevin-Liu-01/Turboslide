import { createServerFn } from '@tanstack/react-start';
import type { Finding } from '@turboslide/schema/findings';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import { ICON_NAMES } from '@turboslide/schema/icon-names';
import { isRuleId } from '@turboslide/schema/rules';
import type { RuleId } from '@turboslide/schema/rules';
import { PRODUCT_TOKENS, PROPER_NOUNS } from '@turboslide/theme/copy';

import { parseJsonInput } from './json';
import type { Untrusted } from './json';
import { openDeckStore } from './root';

/**
 * lint.run for the editor (SPEC 6.5 "this slide's findings from the same linter the CLI runs";
 * MILESTONES M3 item 2): @turboslide/lint over the store's normalized document, the static layer
 * always and the rendered layer over the render worker's cached records for the current revision
 * when it has them (the worker writes cache/<deck>/<revision>/<theme>@1x/<slide>.json). The copy
 * lists and the icon names are the same ones apps/cli/src/deps/theme.ts hands the CLI. The
 * document comes through the hosted store (root.ts openDeckStore), which pulls the Blob mirror
 * before it reads: a plain FileStore over this instance's overlay answered the document this
 * instance last pulled, so the window API's lint.run on a deployment counted another instance's
 * writes late (the editor depth round, docs/EDITOR-DEPTH-STATUS.md section 5).
 *
 * The editor route imports this module for `lintLists` and the function stub, so nothing at its
 * top level may reach a node builtin (gslides-parity SPEC-2 8.3): the rendered layer, the worker
 * cache reader and `@turboslide/lint/run` live in `lint-rendered.ts`, which the handler alone
 * loads. The page's own static lint imports `@turboslide/lint/lint-static` and the shared helpers
 * come from `@turboslide/lint/run-client`.
 */

export type LintLayers = 'static' | 'rendered' | 'both';

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
    // a RangeError when the deck is missing; the open syncs the store's copy first
    const { document } = await (await openDeckStore(data.deckId)).read();
    const order = document.deck.sections.flatMap((section) => section.slideIds);
    const ids = data.slideIds === 'all' ? order : data.slideIds;
    for (const id of ids) {
      if (document.slides[id] === undefined) throw new RangeError(`No slide "${id}"`);
    }
    // the rendered layer and its node readers load here alone (the module comment)
    const { lintRenderedDeck } = await import('./lint-rendered');
    const findings = lintRenderedDeck({
      deckId: data.deckId,
      document,
      ids,
      all: data.slideIds === 'all',
      layers: data.layers ?? 'both',
      ...(data.rule !== undefined ? { rule: data.rule } : {}),
      lists: lintLists(),
    });
    return JSON.stringify(findings);
  });

/** lint.run over the store's document; JSON text on the wire (see write.ts on why). */
export async function lintSlides(input: LintSlidesInput): Promise<Finding[]> {
  return JSON.parse(await lintSlidesFn({ data: JSON.stringify(input) })) as Finding[];
}
