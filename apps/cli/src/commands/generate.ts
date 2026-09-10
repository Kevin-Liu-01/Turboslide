// `turboslide generate [--check]`: the contracts generator (pnpm generate:contracts), MILESTONES
// M1 item 10. --check exits 1 when a committed contract differs from a fresh generation.
import { flagBoolean } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { generateContracts } from '../deps/agent.ts';
import { EXIT } from '../exit.ts';

export async function generate(ctx: CommandContext): Promise<number> {
  const check = flagBoolean(ctx.args, 'check');
  const result = generateContracts(check);
  ctx.out.result(result);
  if (check) {
    for (const file of result.stale) ctx.out.human(`stale (${file.reason}): ${file.path}`);
    ctx.out.human(`generate --check: ${result.stale.length} stale file(s)`);
    return result.stale.length > 0 ? EXIT.findings : EXIT.ok;
  }
  for (const path of result.written) ctx.out.human(`wrote ${path}`);
  ctx.out.human(`generate: ${result.written.length} file(s) written under ${result.root}`);
  return EXIT.ok;
}
