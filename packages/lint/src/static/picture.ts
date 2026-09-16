// Picture rules (SPEC 7.7; MILESTONES M5 item 2 "the picture/* lints complete"): a two-tone
// picture must clear the plate it sits under (OPENERS.md:105, 176), light neither twin blank
// (OPENERS.md:251), and a mood slide never sits against an opener or another mood
// (OPENERS.md:137: a mood follows a dense content slide and at least one content slide separates
// it from the next opener, so the two image kinds alternate). The plate rectangle is the slide's
// own (side and max width), so metrics recorded against another plate are reported as stale.
//
// The block level dither of round three (gslides-parity SPEC-3 10.1, 10.4): a picture or shot
// with a `dither` field is judged by the metrics of its materialized variant, found on the asset
// under the key the renderer derives (`@turboslide/render/dither-key`), so both rules read one
// record. Without a variant the plate rule reports at severity 1 that nothing is measured yet;
// the blank rule stays quiet, because there is no file to judge.
import { PLATE_BOXES } from '@turboslide/effects/metrics';
import { ditheredPictures } from '@turboslide/render/dither-walk';
import type { DitheredPicture } from '@turboslide/render/dither-walk';
import type { Asset, Finding, Slide } from '../contracts.ts';
import { deckPage } from '@turboslide/schema/render';
import type { LintContext } from '../context.ts';

export type PlateSide = 'lower-left' | 'lower-right' | 'upper-left';

/** The kinds' default plate max widths (SPEC 2.1): the measured PLATE_BOXES were screened at these. */
const DEFAULT_MAX_WIDTH = { opener: 740, mood: 560, closing: 720 } as const;

/**
 * The plate rectangle of a full-picture slide in sheet px: the measured screening box of the
 * kind (PLATE_BOXES), its far edge moved by the difference between the slide's plate max width
 * and the kind's default, so a wider plate is screened against a wider box.
 */
export function slidePlateBox(slide: Slide): [number, number, number, number] | undefined {
  if (slide.kind !== 'opener' && slide.kind !== 'mood' && slide.kind !== 'closing')
    return undefined;
  const kind =
    slide.plate.side === 'lower-left'
      ? 'opener'
      : slide.plate.side === 'lower-right'
        ? 'mood'
        : 'closing';
  const [x, y, w, h] = PLATE_BOXES[kind];
  const delta = slide.plate.maxWidth - DEFAULT_MAX_WIDTH[kind];
  if (delta === 0) return [x, y, w, h];
  return slide.plate.side === 'lower-right' ? [x - delta, y, w + delta, h] : [x, y, w + delta, h];
}

function sameBox(a: readonly number[], b: readonly number[]): boolean {
  return a.length === 4 && b.length === 4 && a.every((v, i) => v === b[i]);
}

/** The picture asset of a full-picture slide, when the deck has it. */
export function pictureAsset(ctx: LintContext, slide: Slide): Asset | undefined {
  if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing')
    return ctx.asset(slide.picture.asset);
  return undefined;
}

/** Every asset a slide shows through a two-tone treatment, with the pointer that names it. */
function twoToneRefs(
  ctx: LintContext,
  slide: Slide,
): { asset: Asset; path: string; blockId?: string }[] {
  const out: { asset: Asset; path: string; blockId?: string }[] = [];
  const picture = pictureAsset(ctx, slide);
  if (picture?.treatment?.kind === 'two-tone') out.push({ asset: picture, path: '/picture/asset' });
  for (const ref of ctx.blocksOf(slide)) {
    const { block } = ref;
    const ids: { id: string; path: string }[] = [];
    if (block.type === 'shot') ids.push({ id: block.asset, path: `${ref.path}/asset` });
    if (block.type === 'material' && block.asset !== undefined)
      ids.push({ id: block.asset, path: `${ref.path}/asset` });
    if (block.type === 'pair')
      block.figures.forEach((figure, f) =>
        figure.assets.forEach((id, a) =>
          ids.push({ id, path: `${ref.path}/figures/${f}/assets/${a}` }),
        ),
      );
    if (block.type === 'details')
      block.items.forEach((item, i) =>
        ids.push({ id: item.asset, path: `${ref.path}/items/${i}/asset` }),
      );
    for (const { id, path } of ids) {
      const asset = ctx.asset(id);
      if (asset?.treatment?.kind === 'two-tone') out.push({ asset, path, blockId: block.id });
    }
  }
  return out;
}

/** True when two sheet boxes share any area. */
function boxesTouch(a: readonly number[], b: readonly number[]): boolean {
  const [ax, ay, aw, ah] = a as [number, number, number, number];
  const [bx, by, bw, bh] = b as [number, number, number, number];
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}

/** The dithered pictures of a slide; a slide whose asset has no continuous source yields none (the store refuses that write). */
function ditheredOn(ctx: LintContext, slide: Slide): DitheredPicture[] {
  try {
    return ditheredPictures({ deck: ctx.deck, slides: ctx.slides }, [slide.id]);
  } catch {
    return [];
  }
}

/** picture/blank-twin and picture/plate-clear on the block level dithers of one slide (SPEC-3 10.4). */
function checkBlockDithers(ctx: LintContext, slide: Slide, out: Finding[]): void {
  const paths = new Map(ctx.blocksOf(slide).map((ref) => [ref.block.id, ref.path]));
  for (const row of ditheredOn(ctx, slide)) {
    const path = `${paths.get(row.block.id) ?? ''}/dither`;
    const variant = row.asset.variants?.[row.key];
    const key12 = row.key.slice(0, 12);
    const lit = variant?.metrics?.litFraction;
    if (lit !== undefined && (lit < 0.02 || lit > 0.98)) {
      out.push(
        ctx.finding('picture/blank-twin', slide.id, {
          blockId: row.block.id,
          path,
          text: `${row.asset.id} ${key12}`,
          measured: { litFraction: lit },
          proposal:
            'One theme of the dithered picture is an empty sheet; move the ink point, the paper point or the midtones so both themes carry the picture, then write the files again with `turboslide picture materialize`.',
        }),
      );
    }
    if (row.plate === undefined) continue;
    const page = deckPage(ctx.deck);
    const box: [number, number, number, number] =
      row.block.pos !== undefined
        ? [row.block.pos.x, row.block.pos.y, row.block.pos.w, row.block.pos.h]
        : [0, 0, page.width, page.height];
    if (!boxesTouch(box, row.plate)) continue;
    const clear = variant?.metrics?.plateClear;
    if (variant === undefined || clear === undefined) {
      out.push(
        ctx.finding('picture/plate-clear', slide.id, {
          blockId: row.block.id,
          path,
          text: `${row.asset.id} ${key12}`,
          box: row.plate,
          proposal: `Nothing is measured under the plate for ${row.asset.id} at this dither yet; \`turboslide picture materialize ${slide.id}\` writes the files and the lit cells under the plate.`,
          severity: 1,
        }),
      );
    } else if (!sameBox(clear.plate, row.plate)) {
      out.push(
        ctx.finding('picture/plate-clear', slide.id, {
          blockId: row.block.id,
          path,
          text: `${row.asset.id} ${key12}`,
          box: row.plate,
          measured: {
            litUnder: clear.litUnder,
            litInBand: clear.litInBand,
            nearestLitPx: clear.nearestLitPx,
          },
          proposal: `The files of ${row.asset.id} were measured against the plate at ${clear.plate.join(', ')}, not this slide's ${row.plate.join(', ')}; \`turboslide picture materialize ${slide.id}\` measures them again.`,
          severity: 1,
        }),
      );
    } else if (clear.litUnder > 0 || clear.litInBand > 0) {
      out.push(
        ctx.finding('picture/plate-clear', slide.id, {
          blockId: row.block.id,
          path,
          text: `${row.asset.id} ${key12}`,
          box: row.plate,
          measured: {
            litUnder: clear.litUnder,
            litInBand: clear.litInBand,
            nearestLitPx: clear.nearestLitPx,
          },
          proposal:
            clear.litUnder > 0
              ? `${clear.litUnder} lit cell(s) sit under the plate; move the picture, change the ink and paper points, or move the plate to the other side.`
              : `${clear.litInBand} lit cell(s) sit within 30 px of the plate; move the picture so the plate stands on solid ground.`,
        }),
      );
    }
  }
}

export function checkPictures(ctx: LintContext): Finding[] {
  const out: Finding[] = [];
  for (const slide of ctx.slideList()) {
    checkBlockDithers(ctx, slide, out);
    // picture/blank-twin on every two-tone asset the slide shows
    const seen = new Set<string>();
    for (const { asset, path, blockId } of twoToneRefs(ctx, slide)) {
      if (seen.has(asset.id)) continue;
      seen.add(asset.id);
      const lit = asset.metrics?.litFraction;
      if (lit !== undefined && (lit < 0.02 || lit > 0.98)) {
        out.push(
          ctx.finding('picture/blank-twin', slide.id, {
            ...(blockId !== undefined ? { blockId } : {}),
            path,
            text: asset.id,
            measured: { litFraction: lit },
            proposal:
              'One twin is an empty sheet; retone or recrop so both twins carry the picture (OPENERS.md:251). Run `turboslide asset dither <id> --from-recorded` to measure the twins.',
          }),
        );
      }
    }
    // picture/plate-clear on the full-picture kinds, against the slide's own plate
    const picture = pictureAsset(ctx, slide);
    const plate = slidePlateBox(slide);
    const side = 'plate' in slide ? slide.plate.side : undefined;
    if (picture?.treatment?.kind === 'two-tone' && plate !== undefined && side !== undefined) {
      const clear = picture.metrics?.plateClear;
      if (clear === undefined) {
        out.push(
          ctx.finding('picture/plate-clear', slide.id, {
            path: '/picture/asset',
            text: picture.id,
            box: plate,
            proposal: `No plate metrics are recorded for ${picture.id}; run \`turboslide asset dither ${picture.id} --from-recorded --plate ${side}\` to measure the lit cells under the plate (OPENERS.md:105, 176).`,
            severity: 1,
          }),
        );
      } else if (!sameBox(clear.plate, plate)) {
        out.push(
          ctx.finding('picture/plate-clear', slide.id, {
            path: '/picture/asset',
            text: picture.id,
            box: plate,
            measured: {
              litUnder: clear.litUnder,
              litInBand: clear.litInBand,
              nearestLitPx: clear.nearestLitPx,
            },
            proposal: `The recorded metrics of ${picture.id} were measured against the plate at ${clear.plate.join(', ')}, not this slide's ${plate.join(', ')}; run \`turboslide asset dither ${picture.id} --from-recorded --plate ${side}\`.`,
            severity: 1,
          }),
        );
      } else if (clear.litUnder > 0 || clear.litInBand > 0) {
        // the mood plate is opaque and a picture may pass under it (OPENERS.md, "Mood slide"), so a
        // mood reports at severity 1 for the art direction judge; an opener's plate area is solid
        // ink or paper by the round ten rule and reports at the table's severity 2
        const mood = slide.kind === 'mood';
        out.push(
          ctx.finding('picture/plate-clear', slide.id, {
            path: '/picture/asset',
            text: picture.id,
            box: plate,
            measured: {
              litUnder: clear.litUnder,
              litInBand: clear.litInBand,
              nearestLitPx: clear.nearestLitPx,
            },
            proposal: mood
              ? `${clear.litUnder} lit cell(s) sit under the mood plate and ${clear.litInBand} within 30 px of it; the plate is opaque, so this is allowed (OPENERS.md, Mood slide), listed for the art direction judge.`
              : clear.litUnder > 0
                ? `${clear.litUnder} lit cell(s) sit under the plate; move or retone the picture, or move the plate to the other side (OPENERS.md:105, 176).`
                : `${clear.litInBand} lit cell(s) sit within 30 px of the plate; shift the crop so the plate stands on solid ground (OPENERS.md:105, 176).`,
            ...(mood ? { severity: 1 } : {}),
          }),
        );
      }
    }
  }
  // picture/mood-placement over the deck order
  const list = ctx.order.map((id) => ctx.slides[id]).filter((s): s is Slide => s !== undefined);
  for (let i = 0; i + 1 < list.length; i += 1) {
    const a = list[i];
    const b = list[i + 1];
    if (a === undefined || b === undefined) continue;
    if (a.kind === 'mood' && b.kind === 'opener') {
      out.push(
        ctx.finding('picture/mood-placement', a.id, {
          text: `${a.id} then ${b.id}`,
          proposal:
            'Move the mood slide earlier so at least one content slide separates it from the next opener (OPENERS.md:137).',
        }),
      );
    } else if (a.kind === 'mood' && b.kind === 'mood') {
      out.push(
        ctx.finding('picture/mood-placement', a.id, {
          text: `${a.id} then ${b.id}`,
          proposal:
            'Two mood slides are adjacent; separate them with a content slide (OPENERS.md:137).',
        }),
      );
    } else if (a.kind === 'opener' && b.kind === 'mood') {
      out.push(
        ctx.finding('picture/mood-placement', b.id, {
          text: `${a.id} then ${b.id}`,
          proposal:
            'A mood slide follows a dense content slide, not the opener; move it after the first content slide of the section (OPENERS.md:137).',
        }),
      );
    }
  }
  return out;
}
