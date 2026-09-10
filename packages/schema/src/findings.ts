// Findings (SPEC 4.2 "findings", 7.6). The linter, the judges and the skeptic all speak Finding;
// severity 3 is the gate. A finding names the slide, the block and a pixel box where one exists,
// and carries `fix` mutations when the fix is mechanical.
import { z } from 'zod';
import type { BlockId, SlideId } from './ids.ts';
import { blockIdSchema, slugSchema } from './ids.ts';
import type { Mutation } from './mutations.ts';
import { mutationSchema } from './mutations.ts';
import type { FindingKind, RuleId } from './rules.ts';
import { RULE_IDS } from './rules.ts';

/** 3 must fix (the gate), 2 should fix, 1 polish */
export type Severity = 1 | 2 | 3;

export type FindingSource = 'lint' | `judge:${string}` | 'skeptic';

export type Finding = {
  id: string;
  rule: RuleId;
  severity: Severity;
  kind: FindingKind;
  slideId: SlideId;
  blockId?: BlockId;
  path?: string;
  theme?: 'light' | 'dark';
  evidence: {
    text?: string;
    box?: [number, number, number, number];
    measured?: Record<string, number>;
    image?: string;
  };
  /** prose a fixer acts on without judgment */
  proposal: string;
  /** present when the fix is mechanical; turboslide fix and the inspector's Fix button apply it */
  fix?: Mutation[];
  source: FindingSource;
};

export const severitySchema = z.literal([1, 2, 3]);

export const findingSchema = z.strictObject({
  id: z.string().min(1),
  rule: z.enum(RULE_IDS),
  severity: severitySchema,
  kind: z.enum(['defect', 'diagram', 'polish', 'copy', 'accuracy']),
  slideId: slugSchema,
  blockId: blockIdSchema.optional(),
  path: z.string().optional(),
  theme: z.enum(['light', 'dark']).optional(),
  evidence: z.strictObject({
    text: z.string().optional(),
    box: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    measured: z.record(z.string(), z.number()).optional(),
    image: z.string().optional(),
  }),
  proposal: z.string(),
  fix: z.array(mutationSchema).optional(),
  source: z.union([
    z.literal('lint'),
    z.literal('skeptic'),
    z.templateLiteral(['judge:', z.string()]),
  ]),
}) satisfies z.ZodType<Finding>;

/** The known-findings.json baseline: the severity 3 findings the deck actually has (MILESTONES M1). */
export type KnownFinding = { rule: RuleId; slideId: SlideId; blockId?: BlockId; reason: string };

export const knownFindingSchema = z.strictObject({
  rule: z.enum(RULE_IDS),
  slideId: slugSchema,
  blockId: blockIdSchema.optional(),
  reason: z.string().min(1),
}) satisfies z.ZodType<KnownFinding>;

/** A finding is known when a baseline row matches its rule, slide and (when given) block. */
export function isKnownFinding(finding: Finding, known: ReadonlyArray<KnownFinding>): boolean {
  return known.some(
    (row) =>
      row.rule === finding.rule &&
      row.slideId === finding.slideId &&
      (row.blockId === undefined || row.blockId === finding.blockId),
  );
}

/** Deterministic finding id: rule, slide, block, path and theme, so re-runs produce the same ids. */
export function findingId(
  parts: Pick<Finding, 'rule' | 'slideId' | 'blockId' | 'path' | 'theme'>,
): string {
  return [parts.rule, parts.slideId, parts.blockId ?? '', parts.path ?? '', parts.theme ?? ''].join(
    '|',
  );
}
