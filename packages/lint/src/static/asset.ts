// Asset and picture rules (SPEC 7.7): a neutral twin needs a border (DECK-GRAMMAR.md:56), a
// share-alike source needs its credit on the plate (OPENERS.md:255), a photograph needs a
// license record, two-tone metrics must clear the plate (OPENERS.md:105, 176) and light neither
// twin blank (OPENERS.md:251), and a mood slide never sits against an opener (OPENERS.md:137).
import type { Asset, Finding, Slide } from '../contracts.ts';
import { isShareAlike } from '../contracts.ts';
import type { LintContext } from '../context.ts';
import { plainText } from '../text.ts';

function pictureAsset(ctx: LintContext, slide: Slide): Asset | undefined {
  if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing')
    return ctx.asset(slide.picture.asset);
  return undefined;
}

export function checkAssets(ctx: LintContext): Finding[] {
  const out: Finding[] = [];
  const usedBy = new Map<string, string>();
  const slides = ctx.slideList();
  for (const slide of slides) {
    const picture = pictureAsset(ctx, slide);
    if (picture && !usedBy.has(picture.id)) usedBy.set(picture.id, slide.id);
    for (const ref of ctx.blocksOf(slide)) {
      const { block } = ref;
      if (block.type === 'shot') {
        const asset = ctx.asset(block.asset);
        if (!usedBy.has(block.asset)) usedBy.set(block.asset, slide.id);
        if (asset && 'neutral' in asset.twins && block.border === false) {
          out.push(
            ctx.finding('asset/twin-or-border', slide.id, {
              blockId: block.id,
              path: `${ref.path}/border`,
              text: asset.id,
              proposal:
                'A screenshot without a dark twin keeps its 1 px hair border so it reads as a plate on the dark ground (DECK-GRAMMAR.md:56).',
              fix: [
                {
                  op: 'block.set',
                  slideId: slide.id,
                  blockId: block.id,
                  path: '/border',
                  value: true,
                },
              ],
            }),
          );
        }
      }
      if (block.type === 'pair')
        for (const f of block.figures)
          for (const a of f.assets) if (!usedBy.has(a)) usedBy.set(a, slide.id);
      if (block.type === 'details')
        for (const item of block.items)
          if (!usedBy.has(item.asset)) usedBy.set(item.asset, slide.id);
      if (block.type === 'tiles')
        for (const item of block.items)
          if (item.asset && !usedBy.has(item.asset)) usedBy.set(item.asset, slide.id);
    }
    // asset/credit-on-plate, picture/plate-clear, picture/blank-twin on the full-picture kinds
    if (picture && (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing')) {
      if (isShareAlike(picture)) {
        const credits = slide.plate.blocks.flatMap((b) =>
          b.type === 'credit' ? [plainText(b.text)] : [],
        );
        const artist = picture.source.kind === 'photo' ? picture.source.artist : undefined;
        const wanted = picture.credit ?? artist ?? '';
        const present = credits.some((c) =>
          wanted ? c.includes(wanted) || (artist ? c.includes(artist) : false) : c.length > 0,
        );
        if (!present) {
          out.push(
            ctx.finding('asset/credit-on-plate', slide.id, {
              path: '/plate/blocks',
              text: wanted || picture.id,
              proposal: `Add a credit block naming ${wanted || 'the source'}: the dithered file is an adaptation under a share-alike license (OPENERS.md:255).`,
            }),
          );
        }
      }
      const metrics = picture.metrics;
      if (metrics) {
        if (metrics.litFraction < 0.02 || metrics.litFraction > 0.98) {
          out.push(
            ctx.finding('picture/blank-twin', slide.id, {
              path: '/picture/asset',
              text: picture.id,
              measured: { litFraction: metrics.litFraction },
              proposal:
                'One twin is an empty sheet; retone or recrop so both twins carry the picture (OPENERS.md:251).',
            }),
          );
        }
        if (
          metrics.plateClear &&
          (metrics.plateClear.litUnder > 0 || metrics.plateClear.litInBand > 0)
        ) {
          out.push(
            ctx.finding('picture/plate-clear', slide.id, {
              path: '/picture/asset',
              text: picture.id,
              box: metrics.plateClear.plate,
              measured: {
                litUnder: metrics.plateClear.litUnder,
                litInBand: metrics.plateClear.litInBand,
                nearestLitPx: metrics.plateClear.nearestLitPx,
              },
              proposal:
                'Move or retone the picture so no lit cell sits under the plate or within 30 px of it (OPENERS.md:105, 176).',
            }),
          );
        }
      }
    }
  }
  // asset/license-missing: every photograph without a license record, attributed to its first user
  for (const asset of Object.values(ctx.deck.assets)) {
    if (
      asset.source.kind === 'photo' &&
      (!asset.source.license || asset.source.license.trim() === '')
    ) {
      const slideId = usedBy.get(asset.id) ?? ctx.order[0] ?? ctx.deck.id;
      out.push(
        ctx.finding('asset/license-missing', slideId, {
          text: asset.id,
          proposal: `Record the license of ${asset.id} (source.license) with the origin and the artist (report 06 section 4 item 9).`,
        }),
      );
    }
  }
  // picture/mood-placement over the deck order
  const list = ctx.order.map((id) => ctx.slides[id]).filter((s): s is Slide => s !== undefined);
  for (let i = 0; i + 1 < list.length; i += 1) {
    const a = list[i];
    const b = list[i + 1];
    if (!a || !b || a.kind !== 'mood') continue;
    if (b.kind === 'opener') {
      out.push(
        ctx.finding('picture/mood-placement', a.id, {
          text: `${a.id} then ${b.id}`,
          proposal:
            'Move the mood slide earlier so at least one content slide separates it from the next opener (OPENERS.md:137).',
        }),
      );
    } else if (b.kind === 'mood') {
      out.push(
        ctx.finding('picture/mood-placement', a.id, {
          text: `${a.id} then ${b.id}`,
          proposal:
            'Two mood slides are adjacent; separate them with a content slide (OPENERS.md:137).',
        }),
      );
    }
  }
  return out;
}
