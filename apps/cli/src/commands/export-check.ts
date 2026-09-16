// export.check (SPEC 7.2; docs/pptx.md "Verification"; gslides-parity SPEC-5 6.1, 6.3, 6.4):
// `turboslide export check <file.pptx | file.odp | file.svg> [--page WxH] [--python <bin>]
// [--no-quick-look] [--out <dir>] [--libreoffice] [--json]` reopens an exported file with
// python-pptx, walks the zip against its content types and relationships, and prints the page
// count, the size, the media formats, the fonts, the slide names and titles, and any invalid
// relationship or undeclared part; with `--json` the ExportCheck lands on stdout. `--page WxH`
// names the page the file must carry in sheet pixels (`1200x900` for the 4:3 fixture, SPEC-5
// 6.1); the default page when absent. An `.odp` runs the container and ODF sections
// (packages/export check/odf.ts), an `.svg` the SVG section (check/svg.ts). Exit 0 when the file
// is valid, 1 when it is not, 2 when the file does not exist.
import { existsSync } from 'node:fs';
import { extname } from 'node:path';

import { checkPptx, describeCheck } from '@turboslide/export/check';
import { checkOdp } from '@turboslide/export/check/odf';
import { checkSvgFile } from '@turboslide/export/check/svg';
import type { ExportCheck } from '@turboslide/schema/export';

import { flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { resolveOut } from '../deck-files.ts';
import { EXIT, UsageError } from '../exit.ts';

/** The file kinds `export check` reads, by extension. */
export const CHECKABLE_EXTENSIONS = ['.pptx', '.odp', '.svg'] as const;

/** `--page WxH` in sheet pixels, or undefined for the default page; a malformed value is a usage error. */
export function parsePageFlag(
  value: string | undefined,
): { width: number; height: number } | undefined {
  if (value === undefined) return undefined;
  const match = /^(\d+)x(\d+)$/.exec(value.trim());
  if (match === null)
    throw new UsageError(
      '--page wants WxH in sheet pixels, such as 1200x900 (gslides-parity SPEC-5 6.1)',
    );
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) throw new UsageError('--page wants two positive numbers');
  return { width, height };
}

/** The lines an ODP or SVG check prints: the file facts, the round five sections, the issues and the verdict. */
export function describeSectionCheck(check: ExportCheck): string[] {
  const lines = [
    `${check.file}: ${(check.bytes / (1024 * 1024)).toFixed(2)} MiB, ${check.parts} part(s), ${check.slides} page(s)`,
    `page: ${check.pageSize.cx} by ${check.pageSize.cy} EMU ${check.pageSizeOk ? '' : 'UNEXPECTED'}; ${check.shapes} shape(s)`.replace(
      ' ;',
      ';',
    ),
  ];
  for (const section of [check.container, check.odf, check.svg]) {
    const first = section?.lines[0];
    if (first !== undefined && section?.ok) lines.push(`round five ${first}`);
  }
  for (const issue of check.issues) lines.push(`issue: ${issue}`);
  lines.push(check.valid ? 'valid' : 'INVALID');
  return lines;
}

export async function exportCheck(ctx: CommandContext, rest: string[]): Promise<number> {
  const [file] = rest;
  if (file === undefined) throw new UsageError('export check wants a .pptx, .odp or .svg file');
  const path = resolveOut(ctx.cwd, file, file);
  if (!existsSync(path)) throw new UsageError(`export check: ${file} does not exist`);
  const page = parsePageFlag(flagString(ctx.args, 'page'));
  const extension = extname(path).toLowerCase();
  if (extension === '.odp') {
    const check = await checkOdp(path, {
      ...(page !== undefined ? { page } : {}),
      log: (line) => ctx.out.human(`  ${line}`),
    });
    if (flagBoolean(ctx.args, 'libreoffice'))
      ctx.out.human(
        '  libreoffice: the read back through soffice runs in the render worker image; not on this machine',
      );
    ctx.out.result(check);
    for (const line of describeSectionCheck(check)) ctx.out.human(`check: ${line}`);
    return check.valid ? EXIT.ok : EXIT.findings;
  }
  if (extension === '.svg') {
    const check = await checkSvgFile(path, page !== undefined ? { page } : {});
    ctx.out.result(check);
    for (const line of describeSectionCheck(check)) ctx.out.human(`check: ${line}`);
    return check.valid ? EXIT.ok : EXIT.findings;
  }
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
    ...(page !== undefined ? { page } : {}),
    log: (line) => ctx.out.human(`  ${line}`),
  });
  ctx.out.result(check);
  for (const line of describeCheck(check)) ctx.out.human(`check: ${line}`);
  return check.valid ? EXIT.ok : EXIT.findings;
}
