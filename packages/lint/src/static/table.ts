// table/size (gslides-parity SPEC 7.3; R11 A8): a table over Google's 20 by 20 cap, or a row
// without one cell per column. The validator refuses the same shapes at severity 3 with the issue
// code table_size, so a stored deck never carries one; the rule names the block for a document
// that reaches the linter before the validator (the editor's draft, an agent's dry run). The
// "cell over two lines" half of the rule is the rendered layer's rows/two-lines on cell records.
import type { Finding } from '../contracts.ts';
import type { LintContext } from '../context.ts';
import { tableSizeProblem } from '@turboslide/schema/blocks/table';

export function checkTables(ctx: LintContext): Finding[] {
  const out: Finding[] = [];
  for (const slide of ctx.slideList()) {
    for (const ref of ctx.blocksOf(slide)) {
      if (ref.block.type !== 'table') continue;
      const problem = tableSizeProblem(ref.block);
      if (problem === null) continue;
      out.push(
        ctx.finding('table/size', slide.id, {
          blockId: ref.block.id,
          path: `${ref.path}${problem.pointer}`,
          text: `${ref.block.columns.length} by ${ref.block.rows.length}`,
          measured: { columns: ref.block.columns.length, rows: ref.block.rows.length },
          proposal: `${problem.message}. Split the table across slides or remove the extra cells.`,
        }),
      );
    }
  }
  return out;
}
