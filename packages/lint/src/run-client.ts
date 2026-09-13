// The client safe entry of the linter (gslides-parity SPEC-2 8.3, 0.33): the static layer and
// the helpers every surface shares, with no import that reaches `rendered/` (its bitmap and PNG
// readers name `node:fs`, `node:path` and `node:zlib`, which a page never runs; VERIFICATION
// finding 12 found them in the studio's client bundle). The studio's pages import this module;
// `run.ts` keeps its shape for the CLI and the server by re-exporting what is here beside
// `lintRendered` and `lintDeck`. `scripts/check-client-bundle.mjs` fails a client bundle that
// names one of those builtins.
import type { Finding, KnownFinding } from './contracts.ts';
import { RULES, isKnownFinding } from './contracts.ts';
import { filterRules, lintStatic, sortFindings } from './lint-static.ts';

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

export { RULES, filterRules, lintStatic, sortFindings };
