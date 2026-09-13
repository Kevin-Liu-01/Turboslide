// The two layers of the grammar linter (SPEC 7.7): lintStatic over the document without a
// browser (its own module, lint-static.ts), lintRendered over RenderRecords, and the baseline
// gate of known-findings.json (MILESTONES M1 item 7: severity 3 findings not in the baseline fail
// `turboslide lint`). The static layer and the shared helpers live in run-client.ts, the entry a
// page may import (gslides-parity SPEC-2 8.3: nothing there reaches `rendered/` and its `node:`
// readers); this module re-exports them so `@turboslide/lint/run` keeps its shape for the CLI and
// the server, which are the only callers of the rendered layer.
import type { DeckDocument, Finding, RenderRecord } from './contracts.ts';
import { createContext } from './context.ts';
import type { LintOptions } from './context.ts';
import { lintRecord } from './rendered/rules.ts';
import {
  RULES,
  countsBySlide,
  filterRules,
  formatFinding,
  gate,
  lintStatic,
  sortFindings,
  toBaseline,
} from './run-client.ts';
import type { Gate } from './run-client.ts';

/** Rendered rules on records; records for slides outside options.slideIds are ignored. */
export function lintRendered(
  input: DeckDocument,
  records: readonly RenderRecord[],
  options: LintOptions = {},
): Finding[] {
  const ctx = createContext(input, options);
  const selected = options.slideIds ? new Set(options.slideIds) : null;
  const findings: Finding[] = [];
  for (const record of records) {
    if (selected && !selected.has(record.slideId)) continue;
    findings.push(...lintRecord(ctx, record));
  }
  return sortFindings(filterRules(findings, options.rules), ctx.order);
}

export type LintLayers = 'static' | 'rendered' | 'both';

/** Both layers; the rendered layer runs only when records are given. */
export function lintDeck(
  input: DeckDocument,
  records: readonly RenderRecord[] = [],
  options: LintOptions & { layers?: LintLayers } = {},
): Finding[] {
  const layers = options.layers ?? 'both';
  const out: Finding[] = [];
  if (layers !== 'rendered') out.push(...lintStatic(input, options));
  if (layers !== 'static' && records.length > 0) out.push(...lintRendered(input, records, options));
  return sortFindings(out, createContext(input, options).order);
}

export type { Gate };
export {
  RULES,
  countsBySlide,
  filterRules,
  formatFinding,
  gate,
  lintStatic,
  sortFindings,
  toBaseline,
};
