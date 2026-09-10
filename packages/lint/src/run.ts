// The two layers of the grammar linter (SPEC 7.7): lintStatic over the document without a
// browser, lintRendered over RenderRecords, and the baseline gate of known-findings.json
// (MILESTONES M1 item 7: severity 3 findings not in the baseline fail `turboslide lint`).
import type { DeckDocument, Finding, KnownFinding, RenderRecord, RuleId } from './contracts.ts';
import { RULES, isKnownFinding } from './contracts.ts';
import { createContext } from './context.ts';
import type { LintOptions } from './context.ts';
import { lintRecord } from './rendered/rules.ts';
import { checkAssets } from './static/asset.ts';
import { checkColor } from './static/color.ts';
import { checkCopy } from './static/copy.ts';
import { checkDia } from './static/dia.ts';
import { checkIcons } from './static/icon.ts';
import { checkRows } from './static/rows.ts';
import { checkStructure } from './static/structure.ts';
import { checkType } from './static/type.ts';

function filterRules(findings: Finding[], rules?: readonly RuleId[]): Finding[] {
  if (!rules || rules.length === 0) return findings;
  const set = new Set(rules);
  return findings.filter((f) => set.has(f.rule));
}

function sortFindings(findings: Finding[], order: string[]): Finding[] {
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
    ...checkStructure(ctx),
  ];
  // deck-level rules (placement, contradictions, licenses) scan the whole deck and report on the selection
  const selected = options.slideIds ? new Set(options.slideIds) : null;
  const onSelection = selected ? findings.filter((f) => selected.has(f.slideId)) : findings;
  return sortFindings(filterRules(onSelection, options.rules), ctx.order);
}

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

export { RULES };
