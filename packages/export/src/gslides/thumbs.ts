// Thumbnail verification (SPEC 8.5 step 2; MILESTONES M6): presentations.pages.getThumbnail at
// LARGE (1600 px wide) for every slide, fetched and diffed with pixelmatch at threshold 0.1
// against the Turboslide render of the same slide, theme and revision at 1x (verify/reference.ts,
// rendered through the CLI when missing). Native passes under 3 percent mismatched pixels per
// slide and flatten under 0.1 percent (calibration/slides.json thumbnail.budgets); native also
// records the per-block ink offsets the PPTX loop measures (verify/report.ts compareBlocks) so
// the report says where a box landed, not only how much differed. Thumbnails count against the
// read quota, so every call goes through the pacer.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ExportMode } from '@turboslide/schema/export';
import type { RenderRecord, Theme } from '@turboslide/schema/render';

import { DEFAULT_BUDGETS } from '../verify/budgets.ts';
import { diffImages, readPng, writePng } from '../verify/diff.ts';
import type { Png } from '../verify/diff.ts';
import { ensureReference, referenceImage, referenceRecord } from '../verify/reference.ts';
import type { ReferenceSet } from '../verify/reference.ts';
import { compareBlocks } from '../verify/report.ts';
import type { SlidesClient } from './client.ts';
import type { RatePacer } from './pace.ts';
import type { SlidePlan } from './requests.ts';

export type ThumbnailBudgets = { native: number; flatten: number; threshold: number };

export const DEFAULT_THUMBNAIL_BUDGETS: ThumbnailBudgets = {
  native: 0.03,
  flatten: 0.001,
  threshold: 0.1,
};

export type SlideThumbnailResult = {
  slideId: string;
  objectId: string;
  mismatch: number;
  fraction: number;
  ok: boolean;
  ref: string;
  got: string;
  diff: string;
  blocks: { blockId: string; dx: number; dy: number; dw: number; ok: boolean }[];
  /** The thumbnail's pixel size as Google returned it. */
  size: [number, number];
  error?: string;
};

export type VerifyThumbnailsOptions = {
  client: SlidesClient;
  pacer: RatePacer;
  presentationId: string;
  slides: readonly SlidePlan[];
  theme: Theme;
  mode: ExportMode;
  deckDir: string;
  revision: number;
  /** Where the reference renders, thumbnails and diffs land. */
  outDir: string;
  budgets?: Partial<ThumbnailBudgets>;
  /** A render directory to use as the reference instead of rendering. */
  referenceDir?: string;
  /** Test hook: the reference set instead of ensureReference. */
  reference?: ReferenceSet;
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
  onSlide?: (result: SlideThumbnailResult) => void;
};

export type VerifyThumbnailsResult = {
  slides: SlideThumbnailResult[];
  passed: boolean;
  budget: number;
  referenceDir: string;
  residual: string[];
  ms: number;
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Fetches every slide's LARGE thumbnail and diffs it against the reference render. */
export async function verifyThumbnails(
  options: VerifyThumbnailsOptions,
): Promise<VerifyThumbnailsResult> {
  const started = performance.now();
  const log = options.log ?? (() => {});
  const budgets = { ...DEFAULT_THUMBNAIL_BUDGETS, ...options.budgets };
  const budget = options.mode === 'flatten' ? budgets.flatten : budgets.native;
  const slideIds = options.slides.map((s) => s.slideId);
  const referenceDir = options.referenceDir ?? join(options.outDir, `reference-${options.theme}`);
  const reference =
    options.reference ??
    (await ensureReference({
      dir: referenceDir,
      deckDir: options.deckDir,
      theme: options.theme,
      slideIds,
      scale: 1,
      revision: options.revision,
      env: options.env,
      log,
    }));
  const thumbsDir = join(options.outDir, `thumbs-${options.theme}`);
  await mkdir(thumbsDir, { recursive: true });
  const results: SlideThumbnailResult[] = [];
  const residual: string[] = [];
  for (const slide of options.slides) {
    const nn = pad(slide.n);
    const got = join(thumbsDir, `${nn}-${slide.slideId}.png`);
    const diffPath = join(thumbsDir, `${nn}-${slide.slideId}.diff.png`);
    const record: RenderRecord | undefined = referenceRecord(
      reference,
      slide.slideId,
      options.theme,
      1,
    );
    const ref = record ? referenceImage(reference, record) : '';
    const base: SlideThumbnailResult = {
      slideId: slide.slideId,
      objectId: slide.objectId,
      mismatch: 0,
      fraction: 1,
      ok: false,
      ref,
      got,
      diff: diffPath,
      blocks: [],
      size: [0, 0],
    };
    try {
      if (!record) throw new Error('no reference render');
      const thumb = await options.pacer.run('read', `getThumbnail ${slide.slideId}`, () =>
        options.client.getThumbnail(options.presentationId, slide.objectId),
      );
      if (!thumb.contentUrl) throw new Error('getThumbnail returned no contentUrl');
      const bytes = await options.client.fetchBytes(thumb.contentUrl);
      await writeFile(got, bytes);
      const gotPng: Png = await readPng(got);
      const refPng: Png = await readPng(ref);
      base.size = [gotPng.width, gotPng.height];
      const diff = diffImages(refPng, gotPng, budgets.threshold);
      await writePng(diffPath, diff.diff);
      base.mismatch = diff.mismatch;
      base.fraction = Math.round(diff.fraction * 1e6) / 1e6;
      base.ok = diff.fraction <= budget;
      if (options.mode === 'native')
        base.blocks = compareBlocks(refPng, gotPng, record, {
          scale: 1,
          budgets: DEFAULT_BUDGETS,
          slideId: slide.slideId,
        }).map((b) => ({ blockId: b.blockId, dx: b.dx, dy: b.dy, dw: b.dw, ok: b.ok }));
      log(
        `  ${nn} ${slide.slideId}: ${(diff.fraction * 100).toFixed(3)} percent mismatched (${diff.mismatch} px), ${base.ok ? 'ok' : `over ${(budget * 100).toFixed(1)} percent`}`,
      );
    } catch (error) {
      base.error = error instanceof Error ? error.message : String(error);
      residual.push(`verify: ${slide.slideId}: ${base.error}`);
      log(`  ${nn} ${slide.slideId}: ${base.error}`);
    }
    results.push(base);
    options.onSlide?.(base);
  }
  const passed = results.every((r) => r.ok);
  return {
    slides: results,
    passed,
    budget,
    referenceDir: reference.dir,
    residual,
    ms: Math.round(performance.now() - started),
  };
}
