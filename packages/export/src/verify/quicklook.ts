// QuickLook as a second renderer (docs/pptx.md "Verification"): macOS renders a PPTX thumbnail
// through its own Office importer, so `qlmanage -t` is a smoke check that the file opens in a
// renderer that is not LibreOffice, available on Kevin's machine and on the macOS CI runners,
// never in the render worker image. QuickLook substitutes every font it does not have and ignores
// text alpha (M2: the invisible layer painted over a `p:bg` background), so its picture is compared
// for the record and never gated; the thumbnail is of the first page only. The verify loop adds
// its line when the tool exists, `turboslide export check` reports it, and TURBOSLIDE_NO_QUICKLOOK=1
// or a missing `/usr/bin/qlmanage` (TURBOSLIDE_QLMANAGE names another) skips it.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

import { decodeImage } from '@turboslide/effects/io';

const execFileAsync = promisify(execFile);

export const QLMANAGE = '/usr/bin/qlmanage';

/** The qlmanage binary to run, or null when QuickLook is unavailable or switched off. */
export function quickLookBinary(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (env.TURBOSLIDE_NO_QUICKLOOK === '1') return null;
  if (env.TURBOSLIDE_QLMANAGE)
    return existsSync(env.TURBOSLIDE_QLMANAGE) ? env.TURBOSLIDE_QLMANAGE : null;
  if (platform !== 'darwin') return null;
  return existsSync(QLMANAGE) ? QLMANAGE : null;
}

export type QuickLookThumbnail = { png: string; width: number; height: number; ms: number };

export type QuickLookOptions = {
  /** The longest side in pixels; 3200 gives 3200 by 1800 for the 16:9 page (default). */
  size?: number;
  timeoutMs?: number;
  bin?: string;
  env?: NodeJS.ProcessEnv;
  /** The output file name; default `<file>.quicklook.png` in `outDir`. */
  name?: string;
  log?: (line: string) => void;
};

/**
 * `qlmanage -t -s <size> -o <outDir> <file>`: the first page as a PNG, renamed from qlmanage's
 * `<basename>.png` to `name`. Null when QuickLook produced nothing (an unsupported file, no
 * QuickLook generator for the type, or a headless session without the window server).
 */
export async function quickLookThumbnail(
  file: string,
  outDir: string,
  options: QuickLookOptions = {},
): Promise<QuickLookThumbnail | null> {
  const bin = options.bin ?? quickLookBinary(options.env);
  if (!bin) return null;
  await mkdir(outDir, { recursive: true });
  const size = options.size ?? 3200;
  const t0 = performance.now();
  const args = ['-t', '-s', String(size), '-o', outDir, file];
  options.log?.(`quicklook: ${bin} ${args.join(' ')}`);
  try {
    await execFileAsync(bin, args, { timeout: options.timeoutMs ?? 120_000 });
  } catch (error) {
    options.log?.(`quicklook: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
  const produced = join(outDir, `${basename(file)}.png`);
  let png = produced;
  if (!existsSync(produced)) {
    // qlmanage names the thumbnail after the file; a different name means a version drift
    const candidates = (await readdir(outDir)).filter(
      (name) => name.startsWith(basename(file)) && name.endsWith('.png'),
    );
    if (candidates.length === 0) return null;
    png = join(outDir, candidates[0] ?? '');
  }
  const target = join(outDir, options.name ?? `${basename(file)}.quicklook.png`);
  if (target !== png) {
    await rename(png, target);
    png = target;
  }
  const image = await decodeImage(png);
  return { png, width: image.width, height: image.height, ms: Math.round(performance.now() - t0) };
}
