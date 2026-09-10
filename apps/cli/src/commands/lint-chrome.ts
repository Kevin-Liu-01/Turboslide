// `turboslide lint --chrome --url http://localhost:4321/deck/gt-brand --widths 1440,1280,390
// --themes light,dark [--states list,grid,book] [--allow frag,...] [--deck-frame] [--report] [--json]`:
// the shell mode of Prototemplate/scripts/lint-lines.mjs against one URL (SPEC 2.2; MILESTONES M1
// acceptance). One browser, one page at a time (AGENTS.md). Exit 0 when every audit is clean, 1 on
// findings, 2 when a page could not be audited or a state did not apply (an infrastructure failure
// is never a pass, lint-lines.mjs line 113). --report prints the results without failing.
import { launchBrowser } from '@turboslide/headless/launch';
import { driveShell } from '@turboslide/headless/shell';
import type { ShellDriveResult } from '@turboslide/headless/shell';
import {
  CHROME_ALLOW,
  DECK_CHROME,
  DEFAULT_STATES,
  SHELL_THEMES,
  SHELL_WIDTHS,
  TURBOSLIDE_CHROME,
  auditDocument,
  failingAudit,
  formatAudit,
  probeState,
} from '@turboslide/lint/chrome';
import type { AuditResult } from '@turboslide/lint/chrome';

import { flagBoolean, flagList, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { EXIT, UsageError } from '../exit.ts';

export async function lintChrome(ctx: CommandContext): Promise<number> {
  const url = flagString(ctx.args, 'url');
  if (!url) throw new UsageError('lint --chrome needs --url <http://localhost:4321/deck/gt-brand>');
  if (/\s/.test(url))
    throw new UsageError(
      `refusing a URL with whitespace (quoting accident?): ${JSON.stringify(url)}`,
    );
  const widths = flagList(ctx.args, 'widths', SHELL_WIDTHS.map(String)).map(Number);
  if (widths.some((w) => !Number.isInteger(w) || w < 200))
    throw new UsageError('--widths wants integers, for example 1440,1280,390');
  const themes = flagList(ctx.args, 'themes', SHELL_THEMES).filter(
    (t): t is 'light' | 'dark' => t === 'light' || t === 'dark',
  );
  const states = flagList(ctx.args, 'states', DEFAULT_STATES);
  const allow = [...CHROME_ALLOW, ...flagList(ctx.args, 'allow', [])];
  const deckFrame = flagBoolean(ctx.args, 'deck-frame');
  const report = flagBoolean(ctx.args, 'report');
  const cfg = { ALLOW: allow, chrome: deckFrame ? DECK_CHROME : TURBOSLIDE_CHROME };

  const launched = await launchBrowser({ probeRenderer: false });
  const out: Record<string, Record<string, AuditResult & { probe: unknown }>> = {};
  let audits = 0;
  let bad = 0;
  let broken = 0;
  try {
    for (const theme of themes) {
      for (const width of widths) {
        const key = `${width}/${theme}`;
        const result: ShellDriveResult<AuditResult> = await driveShell(launched.browser, {
          url,
          width,
          theme,
          states,
          probe: probeState,
          audit: auditDocument,
          cfg,
          deckFrame,
        });
        if (result.infrastructure) {
          broken += 1;
          ctx.out.warn(`${key}: ${result.infrastructure}`);
          continue;
        }
        out[key] = result.results;
        for (const [state, audit] of Object.entries(result.results)) {
          audits += 1;
          if (failingAudit(audit)) {
            bad += 1;
            ctx.out.warn(`${url} ${key} ${state}: ${formatAudit(audit).length} finding(s)`);
            for (const line of formatAudit(audit)) ctx.out.warn(line);
          }
        }
        for (const state of result.unapplied) {
          broken += 1;
          ctx.out.warn(`${url} ${key}: state "${state}" did not apply (audited whatever showed)`);
        }
      }
    }
  } finally {
    await launched.close();
  }
  ctx.out.result({
    url,
    widths,
    themes,
    states,
    audits,
    failing: bad,
    unapplied: broken,
    results: out,
  });
  ctx.out.human(
    `lint --chrome: ${audits} audit(s) over ${widths.length} width(s) and ${themes.length} theme(s): ${bad} with findings, ${broken} state(s) unapplied`,
  );
  if (report) return EXIT.ok;
  if (broken > 0) return EXIT.usage;
  return bad > 0 ? EXIT.findings : EXIT.ok;
}
