// export.check (SPEC 7.2; docs/pptx.md "Verification"): `turboslide export check <file.pptx>
// [--python <bin>] [--no-quick-look] [--out <dir>] [--json]` reopens an exported file with
// python-pptx, walks the zip against its content types and relationships, and prints the page
// count, the size, the media formats, the fonts, the slide names and titles, and any invalid
// relationship or undeclared part; with `--json` the ExportCheck lands on stdout. Exit 0 when the
// file is valid, 1 when it is not, 2 when the file does not exist.
import { existsSync } from 'node:fs';

import { checkPptx, describeCheck } from '@turboslide/export/check';

import { flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { resolveOut } from '../deck-files.ts';
import { EXIT, UsageError } from '../exit.ts';

export async function exportCheck(ctx: CommandContext, rest: string[]): Promise<number> {
  const [file] = rest;
  if (file === undefined) throw new UsageError('export check wants a .pptx file');
  const path = resolveOut(ctx.cwd, file, file);
  if (!existsSync(path)) throw new UsageError(`export check: ${file} does not exist`);
  const quickLookFlag = flagString(ctx.args, 'quick-look');
  const quickLook =
    !flagBoolean(ctx.args, 'no-quick-look') &&
    quickLookFlag !== 'false' &&
    quickLookFlag !== '0' &&
    quickLookFlag !== 'off';
  const out = flagString(ctx.args, 'out');
  const check = await checkPptx(path, {
    ...(flagString(ctx.args, 'python') ? { python: flagString(ctx.args, 'python') } : {}),
    env: ctx.env,
    quickLook,
    ...(out ? { outDir: resolveOut(ctx.cwd, out, out) } : {}),
    log: (line) => ctx.out.human(`  ${line}`),
  });
  ctx.out.result(check);
  for (const line of describeCheck(check)) ctx.out.human(`check: ${line}`);
  return check.valid ? EXIT.ok : EXIT.findings;
}
