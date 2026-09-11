// `turboslide fix [ids|all] [--rule <id>] [--dry-run]` (SPEC 7.2, 7.1 fix.run): applies the `fix`
// mutations of the findings that carry one as a single write and reports what remains. A fix the
// reducer rejects on top of the earlier ones is skipped with its reason, not a failed write.
import { formatFinding } from '@turboslide/lint/run';
import { isRuleId } from '@turboslide/schema/rules';
import type { RuleId } from '@turboslide/schema/rules';

import { flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { loadDeck } from '../deck-files.ts';
import { UsageError } from '../exit.ts';
import { selectSlides } from '../select.ts';
import { fixRun } from '../store-actions.ts';
import { baseRevision, openStore, runAction, storeDeps, writeContext } from '../write.ts';

export async function fix(ctx: CommandContext): Promise<number> {
  const store = openStore(ctx);
  const ids = selectSlides(loadDeck(store.dir), ctx.rest);
  const all = ctx.rest.length === 0 || ctx.rest.includes('all');
  const ruleFlag = flagString(ctx.args, 'rule');
  if (ruleFlag !== undefined && !isRuleId(ruleFlag))
    throw new UsageError(`unknown rule ${ruleFlag}`);
  const rule = ruleFlag as RuleId | undefined;
  const dryRun = flagBoolean(ctx.args, 'dry-run');
  const result = await runAction(ctx, async () =>
    fixRun(storeDeps(ctx, store), writeContext(ctx), {
      slideIds: all ? 'all' : ids,
      ...(rule !== undefined ? { rule } : {}),
      dryRun,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  const { plan, ...output } = result;
  ctx.out.result({
    applied: output.applied,
    remaining: output.remaining,
    revision: output.revision,
  });
  for (const finding of plan.applied)
    ctx.out.human(`${dryRun ? 'would fix' : 'fixed'}  ${formatFinding(finding)}`);
  for (const { finding, reason } of plan.skipped)
    ctx.out.warn(`skipped  ${formatFinding(finding)}: ${reason}`);
  ctx.out.human(
    `fix: ${plan.applied.length} applied, ${plan.skipped.length} skipped, ${output.remaining.length} finding(s) remain${dryRun ? ' (dry run, nothing written)' : `; revision ${output.revision}`}`,
  );
  return 0;
}
