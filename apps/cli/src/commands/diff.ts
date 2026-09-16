// `turboslide diff [from] [to] [--staged] [--render] [--theme light,dark] [--out dir]` (SPEC 7.2,
// 7.1 diff.run): the mutation list between two revisions in prose; --staged diffs from the last
// named version. --render renders the before and after documents through @turboslide/headless and
// writes one crop per touched block (the block's box from the render record) or per touched slide
// under <out>/crops, plus <out>/diff.json with the whole result.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';

import { BAYER8 } from '@turboslide/effects/bayer';
import type { RenderRecord } from '@turboslide/headless/contracts';
import { openSheetPage } from '@turboslide/headless/context';
import type { SheetPage } from '@turboslide/headless/context';
import { fileUrl, writeTempDocument } from '@turboslide/headless/document';
import { launchBrowser } from '@turboslide/headless/launch';
import { renderSlideRecord } from '@turboslide/headless/record';
import type { DeckDocument } from '@turboslide/schema/deck';
import { slideOrder } from '@turboslide/schema/deck';
import { deckPage, pageBox } from '@turboslide/schema/render';
import type { Mutation } from '@turboslide/schema/mutations';

import { flagBoolean, flagList, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import type { LoadedDeck } from '../deck-files.ts';
import { derivedDir, resolveOut, writeJson } from '../deck-files.ts';
import { renderThemeDocument, slideHash } from '../deps/render.ts';
import { UsageError } from '../exit.ts';
import { diffRun } from '../store-actions.ts';
import type { DiffInput } from '../store-actions.ts';
import { openStore, runAction, storeDeps } from '../write.ts';
import { READY_SELECTOR } from './render.ts';

const USAGE = `usage: turboslide diff [<from> [<to>]] [--staged] [--render] [--theme light,dark] [--out <dir>] [--json]
  diff 400 412            the mutation list from revision 400 to 412 in prose
  diff --staged           from the last named version to the current revision (the default)
  diff --render           also renders before and after and writes crops of every touched block`;

export type Crop = {
  slideId: string;
  blockId?: string;
  theme: 'light' | 'dark';
  /** Paths of the crops; '' when the slide does not exist on that side. */
  before: string;
  after: string;
};

type Touched = { slideId: string; blockId?: string };

/** The blocks (or whole slides) a mutation list touches, once each; deck-level ops produce no crop. */
export function touchedTargets(mutations: ReadonlyArray<Mutation>): Touched[] {
  const seen = new Set<string>();
  const out: Touched[] = [];
  const add = (slideId: string, blockId?: string): void => {
    const key = `${slideId}#${blockId ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(blockId === undefined ? { slideId } : { slideId, blockId });
  };
  for (const mutation of mutations) {
    switch (mutation.op) {
      case 'block.set':
      case 'block.remove':
      case 'block.move':
      case 'text.replace':
      case 'text.splice':
      case 'text.mark':
        add(mutation.slideId, mutation.blockId);
        break;
      case 'block.insert':
        add(mutation.slideId, mutation.block.id);
        break;
      case 'slide.set':
      case 'slide.replace':
      case 'slide.remove':
      case 'slide.move':
        add(mutation.slideId);
        break;
      case 'slide.insert':
        add(mutation.slide.id);
        break;
      default:
        break;
    }
  }
  // A whole-slide entry makes the block entries of the same slide redundant.
  const wholeSlides = new Set(out.filter((t) => t.blockId === undefined).map((t) => t.slideId));
  return out.filter((t) => t.blockId === undefined || !wholeSlides.has(t.slideId));
}

function toLoaded(document: DeckDocument, dir: string): LoadedDeck {
  return {
    deck: document.deck,
    slides: document.slides,
    dir,
    order: slideOrder(document.deck),
    missing: [],
    orphans: [],
  };
}

/** Clamps a sheet-pixel box to the image and rounds it to whole pixels. */
export function cropBox(
  box: [number, number, number, number],
  size: [number, number],
): { left: number; top: number; width: number; height: number } {
  const left = Math.max(0, Math.min(size[0] - 1, Math.floor(box[0])));
  const top = Math.max(0, Math.min(size[1] - 1, Math.floor(box[1])));
  const width = Math.max(1, Math.min(size[0] - left, Math.ceil(box[0] + box[2]) - left));
  const height = Math.max(1, Math.min(size[1] - top, Math.ceil(box[1] + box[3]) - top));
  return { left, top, width, height };
}

/** The whole page as a crop box: the deck's page (gslides-parity SPEC-5 6.1), 1600 by 900 for a deck without one. */
function sheetBox(document: DeckDocument): [number, number, number, number] {
  return pageBox(deckPage(document.deck));
}

type Side = 'before' | 'after';

async function renderSide(
  ctx: CommandContext,
  page: SheetPage,
  side: Side,
  document: DeckDocument,
  dir: string,
  tmp: string,
  slideIds: string[],
  outDir: string,
  renderer: string,
): Promise<Map<string, RenderRecord>> {
  const records = new Map<string, RenderRecord>();
  const present = slideIds.filter((id) => document.slides[id] !== undefined);
  if (present.length === 0) return records;
  const doc = renderThemeDocument(toLoaded(document, dir), page.theme, fileUrl(dir, true));
  for (const warning of doc.warnings)
    ctx.out.warn(`diff render [${side} ${page.theme}]: ${warning}`);
  const file = await writeTempDocument(doc.html, `${side}-${page.theme}.html`, tmp);
  for (const slideId of present) {
    const imagePath = join(outDir, side, `${slideId}-${page.theme}.png`);
    const { record } = await renderSlideRecord(page, {
      url: file.url,
      hash: slideHash(slideId),
      deckId: document.deck.id,
      slideId,
      revision: document.deck.revision,
      imagePath,
      renderer,
      bayerTable: BAYER8.flat(),
      readySelector: READY_SELECTOR,
      drawDither: false,
    });
    records.set(slideId, record);
  }
  return records;
}

async function writeCrop(
  image: string,
  box: [number, number, number, number],
  out: string,
  fallback: [number, number, number, number],
): Promise<void> {
  const meta = await sharp(image).metadata();
  const size: [number, number] = [meta.width ?? fallback[2], meta.height ?? fallback[3]];
  await sharp(image).extract(cropBox(box, size)).toFile(out);
}

/** Renders both documents in each theme and writes one crop pair per touched target. */
export async function renderCrops(
  ctx: CommandContext,
  dir: string,
  before: DeckDocument,
  after: DeckDocument,
  targets: Touched[],
  themes: ('light' | 'dark')[],
  outDir: string,
): Promise<Crop[]> {
  const crops: Crop[] = [];
  if (targets.length === 0) return crops;
  const slideIds = [...new Set(targets.map((t) => t.slideId))];
  const tmp = await mkdtemp(join(tmpdir(), 'turboslide-diff-'));
  await mkdir(join(outDir, 'crops'), { recursive: true });
  const launched = await launchBrowser({ probeRenderer: false });
  try {
    for (const theme of themes) {
      const page = await openSheetPage(launched.browser, { theme, scale: 1 });
      try {
        const a = await renderSide(
          ctx,
          page,
          'before',
          before,
          dir,
          tmp,
          slideIds,
          outDir,
          launched.renderer,
        );
        const b = await renderSide(
          ctx,
          page,
          'after',
          after,
          dir,
          tmp,
          slideIds,
          outDir,
          launched.renderer,
        );
        for (const target of targets) {
          const recordA = a.get(target.slideId);
          const recordB = b.get(target.slideId);
          const box =
            target.blockId === undefined
              ? sheetBox(after)
              : (recordB?.blocks[target.blockId]?.box ??
                recordA?.blocks[target.blockId]?.box ??
                sheetBox(after));
          const stem = `${target.slideId}${target.blockId !== undefined ? `-${target.blockId}` : ''}-${theme}`;
          const crop: Crop = {
            slideId: target.slideId,
            ...(target.blockId !== undefined ? { blockId: target.blockId } : {}),
            theme,
            before: '',
            after: '',
          };
          if (recordA !== undefined) {
            crop.before = join(outDir, 'crops', `${stem}-before.png`);
            await writeCrop(
              join(outDir, 'before', `${target.slideId}-${theme}.png`),
              box,
              crop.before,
              sheetBox(before),
            );
          }
          if (recordB !== undefined) {
            crop.after = join(outDir, 'crops', `${stem}-after.png`);
            await writeCrop(
              join(outDir, 'after', `${target.slideId}-${theme}.png`),
              box,
              crop.after,
              sheetBox(after),
            );
          }
          crops.push(crop);
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await launched.close();
    await rm(tmp, { recursive: true, force: true });
  }
  return crops;
}

function revisionArg(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0)
    throw new UsageError(`${name} wants a revision number, got ${value}\n${USAGE}`);
  return n;
}

export async function diff(ctx: CommandContext): Promise<number> {
  const from = revisionArg(ctx.rest[0], 'from');
  const to = revisionArg(ctx.rest[1], 'to');
  const staged = flagBoolean(ctx.args, 'staged');
  if (staged && from !== undefined)
    throw new UsageError(`pass revisions or --staged, not both\n${USAGE}`);
  const render = flagBoolean(ctx.args, 'render');
  const themes = flagList(ctx.args, 'theme', ['light']).filter(
    (t): t is 'light' | 'dark' => t === 'light' || t === 'dark',
  );
  if (themes.length === 0) throw new UsageError('--theme wants light, dark or light,dark');
  const store = openStore(ctx);
  const input: DiffInput = {
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    staged: from === undefined,
  };
  const result = await runAction(ctx, () => diffRun(storeDeps(ctx, store), input));
  const outDir = resolveOut(
    ctx.cwd,
    flagString(ctx.args, 'out'),
    join(derivedDir(store.dir, ctx.cwd), 'diff'),
  );
  const targets = touchedTargets(result.mutations);
  let crops: Crop[] | undefined;
  if (render) {
    crops = await renderCrops(ctx, store.dir, result.before, result.after, targets, themes, outDir);
  }
  const output = {
    from: result.from,
    to: result.to,
    mutations: result.mutations,
    prose: result.prose,
    ...(crops !== undefined ? { crops } : {}),
  };
  if (render) await writeJson(join(outDir, 'diff.json'), output);
  ctx.out.result(output);
  ctx.out.human(
    `diff: revision ${result.from} to ${result.to}, ${result.mutations.length} mutation(s)${result.mutations.length === 0 ? ' (no change)' : ''}`,
  );
  for (const line of result.prose) ctx.out.human(`  ${line}`);
  if (crops !== undefined) {
    ctx.out.human(
      `crops: ${crops.length} in ${themes.join(',')} -> ${join(outDir, 'crops')} (diff.json beside them)`,
    );
    for (const crop of crops)
      ctx.out.human(
        `  ${crop.slideId}${crop.blockId !== undefined ? `#${crop.blockId}` : ''} [${crop.theme}] ${crop.before || '(none)'} -> ${crop.after || '(none)'}`,
      );
  }
  return 0;
}
