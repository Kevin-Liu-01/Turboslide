// The two layers of the grammar linter (SPEC 7.7): lintStatic over the document without a
// browser (its own module, lint-static.ts, so the editor can import it into the browser without
// the rendered layer's node:zlib), lintRendered over RenderRecords, and the baseline gate of
// known-findings.json (MILESTONES M1 item 7: severity 3 findings not in the baseline fail
// `turboslide lint`). lintStatic is re-exported here so `@turboslide/lint/run` keeps its shape.
import type { DeckDocument, Finding, KnownFinding, RenderRecord } from './contracts.ts';
import { RULES, isKnownFinding } from './contracts.ts';
import { createContext } from './context.ts';
import type { LintOptions } from './context.ts';
import { filterRules, lintStatic, sortFindings } from './lint-static.ts';
import { lintRecord } from './rendered/rules.ts';

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

export type Gate = {
  /** Severity 3 findings not covered by the baseline: the ship gate (SPEC 7.6 step 6). */
  blocking: Finding[];
  /** Severity 3 findings the baseline covers. */
  known: Finding[];
  counts: { s3: number; s2: number; s1: number };
};

export function gate(findings: readonly Finding[], baseline: readonly KnownFinding[] = []): Gate {
  const s3 = findings.filter((f) => f.severity === 3);
  const known = s3.filter((f) => isKnownFinding(f, baseline));
  const blocking = s3.filter((f) => !isKnownFinding(f, baseline));
  return {
    blocking,
    known,
    counts: {
      s3: s3.length,
      s2: findings.filter((f) => f.severity === 2).length,
      s1: findings.filter((f) => f.severity === 1).length,
    },
  };
}

/** The baseline rows for the current severity 3 findings (`turboslide lint --baseline`). */
export function toBaseline(findings: readonly Finding[]): KnownFinding[] {
  const seen = new Set<string>();
  const out: KnownFinding[] = [];
  for (const f of findings) {
    if (f.severity !== 3) continue;
    const key = `${f.rule}|${f.slideId}|${f.blockId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row: KnownFinding = {
      rule: f.rule,
      slideId: f.slideId,
      reason: f.evidence.text ? `${f.proposal} (${f.evidence.text.slice(0, 80)})` : f.proposal,
    };
    if (f.blockId !== undefined) row.blockId = f.blockId;
    out.push(row);
  }
  return out;
}

/** Per-slide severity counts, the `lint` field of slide.list (SPEC 7.1). */
export function countsBySlide(
  findings: readonly Finding[],
): Record<string, { s3: number; s2: number; s1: number }> {
  const out: Record<string, { s3: number; s2: number; s1: number }> = {};
  for (const f of findings) {
    const row = (out[f.slideId] ??= { s3: 0, s2: 0, s1: 0 });
    if (f.severity === 3) row.s3 += 1;
    else if (f.severity === 2) row.s2 += 1;
    else row.s1 += 1;
  }
  return out;
}

/** One line per finding for the human report: `slideId#blockId rule (severity) proposal`. */
export function formatFinding(f: Finding): string {
  const where = f.blockId ? `${f.slideId}#${f.blockId}` : f.slideId;
  const box = f.evidence.box
    ? ` ${f.evidence.box[0]},${f.evidence.box[1]} ${f.evidence.box[2]}x${f.evidence.box[3]}`
    : '';
  const theme = f.theme ? ` [${f.theme}]` : '';
  return `${where}${theme} ${f.rule} (${f.severity})${box}: ${f.proposal}`;
}

export { RULES, lintStatic };
