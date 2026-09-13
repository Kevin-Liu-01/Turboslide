// The diagram command (gslides-parity SPEC-2 2.8.3, section 3): `diagram insert` inserts one of
// the six templates (grid, hierarchy, timeline, process, relationship, cycle) as a group of shape,
// text and line objects, centred on the sheet unless `--pos x,y,w,h` names a box, converting the
// slide to the canvas first when it is not one (diagram.insert). The templates are
// @turboslide/schema/diagrams DIAGRAM_TEMPLATES, which the store actions read through
// `deps.diagrams`; until that module lands the command answers with the reason.
import { DIAGRAM_KINDS, DIAGRAM_STYLES } from '@turboslide/schema/actions';

import { flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { diagramInsert } from '../store-actions.ts';
import {
  baseRevision,
  openStore,
  printSlideResult,
  requirePositional,
  runAction,
  storeDeps,
  writeContext,
} from '../write.ts';

const USAGE = `usage: turboslide diagram insert <slideId> --kind <kind> --count <n> [--style <style>] [--pos x,y,w,h] [--after <blockId>]
The kinds: ${DIAGRAM_KINDS.join(', ')} (2 to 6 items). The styles: ${DIAGRAM_STYLES.join(', ')}.
Every write takes --base-revision <n> (default: the current revision), --author <name>, --note <text>, --force and --json.`;

/** `x,y,w,h` as a position box. */
export function parsePos(raw: string): { x: number; y: number; w: number; h: number } {
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)))
    throw new UsageError(`--pos wants x,y,w,h in sheet px, got ${raw}`);
  const [x, y, w, h] = parts as [number, number, number, number];
  if (!(w > 0) || !(h > 0))
    throw new UsageError(`--pos wants a positive width and height, got ${raw}`);
  return { x, y, w, h };
}

export async function diagram(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  if (sub !== 'insert') throw new UsageError(`unknown subcommand "diagram ${sub ?? ''}"\n${USAGE}`);
  const inner = { ...ctx, rest };
  const slideId = requirePositional(inner, 0, USAGE);
  const kind = flagString(ctx.args, 'kind');
  if (kind === undefined || !(DIAGRAM_KINDS as ReadonlyArray<string>).includes(kind))
    throw new UsageError(`--kind wants one of ${DIAGRAM_KINDS.join(', ')}\n${USAGE}`);
  const count = Number(flagString(ctx.args, 'count'));
  if (!Number.isInteger(count) || count < 2 || count > 6)
    throw new UsageError(`--count wants 2 to 6\n${USAGE}`);
  const style = flagString(ctx.args, 'style');
  if (style !== undefined && !(DIAGRAM_STYLES as ReadonlyArray<string>).includes(style))
    throw new UsageError(`--style wants one of ${DIAGRAM_STYLES.join(', ')}\n${USAGE}`);
  const posRaw = flagString(ctx.args, 'pos');
  const pos = posRaw === undefined ? undefined : parsePos(posRaw);
  const after = flagString(ctx.args, 'after');
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    diagramInsert(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      kind,
      count,
      ...(style !== undefined ? { style } : {}),
      ...(pos !== undefined ? { pos } : {}),
      ...(after !== undefined ? { after } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(
    ctx,
    `inserted a ${kind} diagram (${result.blockIds.join(', ')}, group ${result.group}) on`,
    result,
  );
  return 0;
}
