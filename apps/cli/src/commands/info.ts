// deck.info (SPEC 7.1): title, theme, sections with slide ids and titles, counts, revision.
import { flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { findDeckDir, loadDeck, slideRows } from '../deck-files.ts';

export async function info(ctx: CommandContext): Promise<number> {
  const dir = findDeckDir(ctx.cwd, flagString(ctx.args, 'deck'), ctx.env);
  const loaded = loadDeck(dir);
  const rows = slideRows(loaded);
  const kinds: Record<string, number> = {};
  for (const row of rows) kinds[row.kind] = (kinds[row.kind] ?? 0) + 1;
  const result = {
    id: loaded.deck.id,
    title: loaded.deck.title,
    theme: loaded.deck.theme,
    revision: loaded.deck.revision,
    dir,
    counts: {
      slides: rows.length,
      sections: loaded.deck.sections.length,
      assets: Object.keys(loaded.deck.assets).length,
      kinds,
    },
    sections: loaded.deck.sections.map((section) => ({
      id: section.id,
      name: section.name,
      slides: rows
        .filter((r) => r.sectionId === section.id)
        .map(({ id, n, title, kind }) => ({ id, n, title, kind })),
    })),
    updatedAt: loaded.deck.updatedAt,
  };
  ctx.out.result(result);
  ctx.out.human(
    `${loaded.deck.title} (${loaded.deck.id}), theme ${loaded.deck.theme}, revision ${loaded.deck.revision}`,
  );
  ctx.out.human(
    `${rows.length} slides in ${loaded.deck.sections.length} sections, ${result.counts.assets} assets`,
  );
  for (const section of result.sections) {
    ctx.out.human(`  ${section.name} (${section.id}): ${section.slides.length} slides`);
    for (const s of section.slides)
      ctx.out.human(`    ${String(s.n).padStart(2)}  ${s.id}  ${s.kind}  ${s.title}`);
  }
  if (loaded.missing.length) ctx.out.warn(`missing slide files: ${loaded.missing.join(', ')}`);
  return 0;
}
