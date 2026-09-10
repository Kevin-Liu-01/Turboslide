// lint.run (SPEC 7.1, 7.2): `turboslide lint [ids|all] --json` prints Finding[] and exits 1 when
// any severity 3 finding is not in known-findings.json; `--rule <id>` filters; `--baseline`
// rewrites the known list after review; `--layers static|rendered|both` (default both, the
// rendered layer reads the last render's records); `--chrome` runs the line law auditor instead.
import { join } from 'node:path';

import { isRuleId } from '@turboslide/schema/rules';
import type { RuleId } from '@turboslide/schema/rules';
import { formatFinding, gate, lintDeck, toBaseline } from '@turboslide/lint/run';
import type { LintLayers } from '@turboslide/lint/run';

import { flagBoolean, flagList, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import {
  derivedDir,
  findDeckDir,
  loadDeck,
  readKnownFindings,
  readRenderRecords,
  resolveOut,
  writeJson,
} from '../deck-files.ts';
import { lintLists } from '../deps/theme.ts';
import { EXIT, UsageError } from '../exit.ts';
import { selectSlides } from '../select.ts';
import { lintChrome } from './lint-chrome.ts';

export async function lint(ctx: CommandContext): Promise<number> {
  if (flagBoolean(ctx.args, 'chrome')) return lintChrome(ctx);
  const dir = findDeckDir(ctx.cwd, flagString(ctx.args, 'deck'), ctx.env);
  const loaded = loadDeck(dir);
  const ids = selectSlides(loaded, ctx.rest);
  const layersFlag = flagString(ctx.args, 'layers') ?? 'both';
  if (layersFlag !== 'static' && layersFlag !== 'rendered' && layersFlag !== 'both')
    throw new UsageError('--layers wants static, rendered or both');
  const layers: LintLayers = layersFlag;
  const rules = flagList(ctx.args, 'rule', []);
  for (const r of rules) if (!isRuleId(r)) throw new UsageError(`unknown rule ${r}`);
  const derived = derivedDir(dir, ctx.cwd);
  const renderDir = resolveOut(ctx.cwd, flagString(ctx.args, 'render'), join(derived, 'render'));
  const records = layers === 'static' ? [] : readRenderRecords(join(renderDir, 'render.json'));
  if (layers !== 'static' && records.length === 0)
    ctx.out.warn(
      `lint: no render records in ${renderDir}; rendered rules skipped (run \`turboslide render all\` first)`,
    );
  const findings = lintDeck(loaded, records, {
    layers,
    rules: rules as RuleId[],
    slideIds: ids.length === loaded.order.length ? undefined : ids,
    ...lintLists(),
  });
  const known = readKnownFindings(dir);
  const result = gate(findings, known);

  if (flagBoolean(ctx.args, 'baseline')) {
    const rows = toBaseline(findings);
    await writeJson(join(dir, 'known-findings.json'), rows);
    ctx.out.human(
      `lint: wrote ${rows.length} severity 3 row(s) to ${join(dir, 'known-findings.json')}`,
    );
    ctx.out.result(findings);
    return EXIT.ok;
  }

  ctx.out.result(findings);
  for (const f of findings) ctx.out.human(formatFinding(f));
  ctx.out.human(
    `lint: ${findings.length} finding(s): ${result.counts.s3} at severity 3 (${result.known.length} known, ${result.blocking.length} blocking), ${result.counts.s2} at 2, ${result.counts.s1} at 1; ${records.length} render record(s) read`,
  );
  if (result.blocking.length > 0) {
    for (const f of result.blocking) ctx.out.warn(`blocking: ${formatFinding(f)}`);
    return EXIT.findings;
  }
  return EXIT.ok;
}
