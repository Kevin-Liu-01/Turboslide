// The chart commands (gslides-parity SPEC-2 2.8, section 3): `chart set-data` writes a chart's
// categories and series from JSON on stdin or --file (chart.setData); `chart set-kind` writes
// the kind, a pie keeping its first series and the output naming the dropped ones (chart.setKind).
// A chart is inserted with `block insert --slot main --pos … < chart.json` (the slide converts to
// the canvas first) and its other fields (title, legend, numberFormat, labels) through `block set`.
import { CHART_KINDS } from '@turboslide/schema/blocks/chart';
import type { ChartKind, ChartSeries } from '@turboslide/schema/blocks/chart';

import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { chartSetData, chartSetKind } from '../store-actions.ts';
import {
  baseRevision,
  openStore,
  printSlideResult,
  readDocumentInput,
  requireAddress,
  runAction,
  storeDeps,
  writeContext,
} from '../write.ts';

const USAGE = `usage: turboslide chart <set-data|set-kind> ...
  chart set-data <slideId>#<blockId> [--file data.json] < data.json
                                    { "categories": [...], "series": [{ "name", "values", "color"? }] } (chart.setData)
  chart set-kind <slideId>#<blockId> bar|column|line|pie
                                    the chart type; a pie keeps its first series (chart.setKind)
Every write takes --base-revision <n> (default: the current revision), --author <name>, --note <text>, --force and --json.`;

export async function chart(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = { ...ctx, rest };
  switch (sub) {
    case 'set-data':
      return setData(inner);
    case 'set-kind':
      return setKind(inner);
    default:
      throw new UsageError(`unknown subcommand "chart ${sub ?? ''}"\n${USAGE}`);
  }
}

async function setData(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const raw = await readDocumentInput(ctx, 'the chart data');
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !Array.isArray((raw as { categories?: unknown }).categories) ||
    !Array.isArray((raw as { series?: unknown }).series)
  )
    throw new UsageError(`the chart data wants { categories: [...], series: [...] }\n${USAGE}`);
  const data = raw as { categories: string[]; series: ChartSeries[] };
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    chartSetData(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      categories: data.categories,
      series: data.series,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(
    ctx,
    `set ${data.categories.length} categories and ${data.series.length} series on ${blockId} of`,
    result,
  );
  return 0;
}

async function setKind(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const kind = ctx.rest[1];
  if (kind === undefined || !(CHART_KINDS as ReadonlyArray<string>).includes(kind))
    throw new UsageError(`chart set-kind wants one of ${CHART_KINDS.join(', ')}\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    chartSetKind(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      kind: kind as ChartKind,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `set the chart type ${kind} on ${blockId} of`, result);
  if (result.dropped.length > 0) ctx.out.human(`  dropped series: ${result.dropped.join(', ')}`);
  return 0;
}
