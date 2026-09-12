// The static layer of the grammar linter (SPEC 7.7) on its own, with no import that needs Node:
// the editor runs it in the browser on every document change for the inspector's Lint section,
// the sidebar badges and the overlay's lint boxes (SPEC 6.5, "the same linter the CLI runs"),
// while run.ts adds the rendered layer, whose PNG decoder needs node:zlib. Measured during the M3
// integration: importing @turboslide/lint/run into /edit threw at packages/lint/src/rendered/png.ts
// in the dev server, where Vite externalizes node:zlib for the browser.
import type { DeckDocument, Finding, RuleId } from './contracts.ts';
import { createContext } from './context.ts';
import type { LintOptions } from './context.ts';
import { checkAssets } from './static/asset.ts';
import { checkColor } from './static/color.ts';
import { checkCopy } from './static/copy.ts';
import { checkDia } from './static/dia.ts';
import { checkExportNonNative } from './static/export-non-native.ts';
import { checkFreeform } from './static/freeform.ts';
import { checkIcons } from './static/icon.ts';
import { checkPictures } from './static/picture.ts';
import { checkRows } from './static/rows.ts';
import { checkStructure } from './static/structure.ts';
import { checkType } from './static/type.ts';

export function filterRules(findings: Finding[], rules?: readonly RuleId[]): Finding[] {
  if (!rules || rules.length === 0) return findings;
  const set = new Set(rules);
  return findings.filter((f) => set.has(f.rule));
}

/** Deck order first, then severity descending, then rule and id, so a run is deterministic. */
export function sortFindings(findings: Finding[], order: string[]): Finding[] {
  const n = new Map(order.map((id, i) => [id, i]));
  return [...findings].sort((a, b) => {
    const sa = n.get(a.slideId) ?? Number.MAX_SAFE_INTEGER;
    const sb = n.get(b.slideId) ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    if (a.severity !== b.severity) return b.severity - a.severity;
    if (a.rule !== b.rule) return a.rule.localeCompare(b.rule);
    return a.id.localeCompare(b.id);
  });
}

/** Static rules on the document, no browser. */
export function lintStatic(input: DeckDocument, options: LintOptions = {}): Finding[] {
  const ctx = createContext(input, options);
  const findings = [
    ...checkCopy(ctx),
    ...checkType(ctx),
    ...checkColor(ctx),
    ...checkIcons(ctx),
    ...checkRows(ctx),
    ...checkDia(ctx),
    ...checkAssets(ctx),
    ...checkPictures(ctx),
    ...checkStructure(ctx),
    ...checkFreeform(ctx),
    ...checkExportNonNative(ctx),
  ];
  // deck-level rules (placement, contradictions, licenses) scan the whole deck and report on the selection
  const selected = options.slideIds ? new Set(options.slideIds) : null;
  const onSelection = selected ? findings.filter((f) => selected.has(f.slideId)) : findings;
  return sortFindings(filterRules(onSelection, options.rules), ctx.order);
}
