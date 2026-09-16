// build.run (SPEC 7.1, 7.2): `turboslide build --out public/brand-deck.html --budget 16` inlines
// every asset twin by its inline rule, writes the standalone file, prints the size and the
// inlining decisions per asset class, and fails over budget or when an asset is missing.
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { flagBoolean, flagNumber, flagString } from '../args.ts';
import { inlineAssets } from '../assets.ts';
import type { CommandContext } from '../context.ts';
import { findDeckDir, loadDeck, resolveOut } from '../deck-files.ts';
import { renderStandaloneFile } from '../deps/render.ts';
import { EXIT, UsageError } from '../exit.ts';
import { formatBytes } from '../output.ts';

export async function build(ctx: CommandContext): Promise<number> {
  const dir = findDeckDir(ctx.cwd, flagString(ctx.args, 'deck'), ctx.env);
  const loaded = loadDeck(dir);
  const budgetMB = flagNumber(ctx.args, 'budget', 16);
  const out = resolveOut(ctx.cwd, flagString(ctx.args, 'out'), `${loaded.deck.id}.html`);
  const assets = await inlineAssets(dir, loaded.deck.assets);
  for (const f of assets.failed) ctx.out.warn(`build: asset ${f.path}: ${f.error}`);
  /* round five (gslides-parity SPEC-5 2.3, 3.6; b1.md request 9): --motion keep|drop, --autoplay <ms>
     with --loop, --media embed|poster|url; a media file travels as a data URI under embed */
  const motionFlag = flagString(ctx.args, 'motion') ?? 'keep';
  if (motionFlag !== 'keep' && motionFlag !== 'drop')
    throw new UsageError('--motion wants keep or drop');
  const mediaFlag = flagString(ctx.args, 'media') ?? 'embed';
  if (mediaFlag !== 'embed' && mediaFlag !== 'poster' && mediaFlag !== 'url')
    throw new UsageError('--media wants embed, poster or url');
  const autoplayMs = flagNumber(ctx.args, 'autoplay', 0);
  const loop = flagBoolean(ctx.args, 'loop');
  const mediaUris: Record<string, string> = {};
  if (mediaFlag === 'embed') {
    for (const record of Object.values(loaded.deck.media ?? {})) {
      const path = join(dir, record.file);
      if (!existsSync(path)) continue;
      mediaUris[record.file] =
        `data:${record.mime};base64,${readFileSync(path).toString('base64')}`;
    }
  }
  const built = renderStandaloneFile(loaded, assets.uris, {
    budgetMB,
    motion: motionFlag,
    media: mediaFlag,
    mediaUris,
    ...(autoplayMs > 0 ? { autoplay: { intervalMs: autoplayMs, loop } } : {}),
  });
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, built.html, 'utf8');
  const ok = !built.overBudget && built.missing.length === 0 && assets.failed.length === 0;
  ctx.out.result({
    path: out,
    bytes: built.bytes,
    budgetBytes: built.budgetBytes,
    ok,
    overBudget: built.overBudget,
    revision: loaded.deck.revision,
    slides: built.slides.length,
    sections: loaded.deck.sections.length,
    inlining: built.inlining,
    assets: assets.inlined.map(({ path, rule, bytes }) => ({ path, rule, bytes })),
    missing: built.missing,
    failed: assets.failed,
    warnings: built.warnings,
  });
  ctx.out.human(
    `build: ${out} ${formatBytes(built.bytes)} of ${formatBytes(built.budgetBytes)} budget, ${built.slides.length} slides, revision ${loaded.deck.revision}`,
  );
  for (const [rule, row] of Object.entries(built.inlining)) {
    if (row.count > 0) ctx.out.human(`  ${rule}: ${row.count} twin(s), ${formatBytes(row.bytes)}`);
  }
  for (const m of built.missing) ctx.out.warn(`build: missing asset ${m}`);
  for (const w of built.warnings) ctx.out.warn(`build: ${w}`);
  if (built.overBudget) {
    ctx.out.warn(`build: over budget by ${formatBytes(built.bytes - built.budgetBytes)}`);
  }
  return ok ? EXIT.ok : EXIT.findings;
}
