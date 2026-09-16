// Asset rules (SPEC 7.7; MILESTONES M5 item 2 "the asset/* lints complete"): a neutral twin
// needs a border (DECK-GRAMMAR.md:56), a share-alike source needs its credit on the plate naming
// the artist and the license (OPENERS.md:255: "the dithered files are adaptations, so the credit
// line on the plate is required"; the credits read "Photograph: Hans Hillewaert, CC BY-SA 4.0"),
// and a photograph needs a license record (report 06 section 4 item 9): a photo source with a
// blank or unknown license, or a mood picture whose source is not a photo record at all. The
// picture rules (plate clearance, blank twins, mood placement) are static/picture.ts.
import type { Asset, Finding, Mutation, Slide } from '../contracts.ts';
import { isShareAlike } from '../contracts.ts';
import { coversPage, deckPage } from '@turboslide/schema/render';
import type { LintContext } from '../context.ts';
import { plainText } from '../text.ts';
import { pictureAsset } from './picture.ts';

/** The share-alike license token a credit must carry (CC BY-SA 4.0, CC BY-SA 2.0). */
const LICENSE_TOKEN = /CC\s*BY-SA|share[- ]?alike/i;

/** Licenses that record nothing (the intake writes `unknown` when no license is given). */
const NO_LICENSE = /^\s*$|^unknown$|^none$|^tbd$|^\?+$/i;

/** True when a credit names the artist (or the origin) and, for share-alike, the license. */
export function creditCovers(credit: string, asset: Asset): boolean {
  const artist = asset.source.kind === 'photo' ? asset.source.artist : undefined;
  const recorded = asset.credit;
  const namesWho =
    (recorded !== undefined && credit.includes(recorded)) ||
    (artist !== undefined && artist !== '' && credit.includes(artist));
  if (!namesWho) return false;
  return isShareAlike(asset) ? LICENSE_TOKEN.test(credit) : true;
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
        // a frame (gslides-parity SPEC-2 2.5.5) is a border too
        const framed = block.frame !== undefined;
        if (asset && 'neutral' in asset.twins && block.border === false && !framed) {
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
      // the picture object (SPEC-2 2.6.4): a neutral twin that does not cover the sheet keeps a frame
      if (block.type === 'picture') {
        const asset = ctx.asset(block.asset);
        if (block.asset !== '' && !usedBy.has(block.asset)) usedBy.set(block.asset, slide.id);
        const covers = block.pos !== undefined && coversPage(block.pos, deckPage(ctx.deck));
        const framed = block.frame !== undefined;
        if (asset && 'neutral' in asset.twins && !framed && !covers) {
          out.push(
            ctx.finding('asset/twin-or-border', slide.id, {
              blockId: block.id,
              path: `${ref.path}/frame`,
              text: asset.id,
              proposal:
                'A picture without a dark twin keeps a 1 px frame so it reads as a plate on the dark ground (DECK-GRAMMAR.md:56).',
              fix: [
                {
                  op: 'block.set',
                  slideId: slide.id,
                  blockId: block.id,
                  path: '/frame',
                  value: { weight: 1 },
                },
              ],
            }),
          );
        }
      }
      if (block.type === 'material' && block.asset !== undefined && !usedBy.has(block.asset))
        usedBy.set(block.asset, slide.id);
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
    // asset/credit-on-plate on the full-picture kinds
    if (
      picture &&
      (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing') &&
      isShareAlike(picture)
    ) {
      const creditBlocks = slide.plate.blocks.filter((b) => b.type === 'credit');
      const credits = creditBlocks.map((b) => (b.type === 'credit' ? plainText(b.text) : ''));
      const covered = credits.some((c) => creditCovers(c, picture));
      if (!covered) {
        const artist = picture.source.kind === 'photo' ? picture.source.artist : undefined;
        const wanted =
          picture.credit ??
          (artist !== undefined
            ? `Photograph: ${artist}, ${picture.source.kind === 'photo' ? picture.source.license : ''}`
            : undefined);
        const fix: Mutation[] | undefined =
          wanted === undefined
            ? undefined
            : creditBlocks.length === 0
              ? [
                  {
                    op: 'block.insert',
                    slideId: slide.id,
                    slot: 'plate',
                    ...(slide.plate.blocks.length > 0
                      ? { after: slide.plate.blocks[slide.plate.blocks.length - 1]?.id ?? '' }
                      : {}),
                    block: { id: freeId(slide, 'credit'), type: 'credit', text: wanted },
                  },
                ]
              : [
                  {
                    op: 'block.set',
                    slideId: slide.id,
                    blockId: creditBlocks[0]?.id ?? 'credit',
                    path: '/text',
                    value: wanted,
                  },
                ];
        out.push(
          ctx.finding('asset/credit-on-plate', slide.id, {
            path: '/plate/blocks',
            text: wanted ?? picture.id,
            proposal:
              creditBlocks.length === 0
                ? `Add a credit block naming ${artist ?? 'the artist'} and the share-alike license: the dithered file is an adaptation (OPENERS.md:255).`
                : `The credit on the plate must name ${artist ?? 'the artist'} and the share-alike license (${picture.source.kind === 'photo' ? picture.source.license : 'CC BY-SA'}), as "${wanted ?? 'Photograph: <artist>, CC BY-SA 4.0'}" does (OPENERS.md:255).`,
            ...(fix !== undefined ? { fix } : {}),
          }),
        );
      }
    }
  }
  // asset/license-missing: a photo without a license, or a mood picture with no photo record
  for (const asset of Object.values(ctx.deck.assets)) {
    const slideId = usedBy.get(asset.id) ?? ctx.order[0] ?? ctx.deck.id;
    if (asset.source.kind === 'photo') {
      if (NO_LICENSE.test(asset.source.license)) {
        out.push(
          ctx.finding('asset/license-missing', slideId, {
            text: asset.id,
            proposal: `Record the license of ${asset.id} (source.license) with the origin and the artist: \`turboslide asset add\` takes --license, --artist and --share-alike (report 06 section 4 item 9).`,
          }),
        );
      }
      continue;
    }
    if (asset.role === 'mood' && asset.source.kind === 'file') {
      out.push(
        ctx.finding('asset/license-missing', slideId, {
          text: asset.id,
          proposal: `${asset.id} is a mood photograph with no provenance record; set source to { kind: 'photo', origin, artist, license, shareAlike } (report 06 section 4 item 9).`,
        }),
      );
    }
  }
  return out;
}

/** A block id free on the slide: `credit`, then `credit-2`. */
function freeId(slide: Slide, base: string): string {
  const taken = new Set<string>();
  if (slide.kind === 'content')
    for (const blocks of Object.values(slide.slots)) for (const b of blocks ?? []) taken.add(b.id);
  else if ('plate' in slide) for (const b of slide.plate.blocks) taken.add(b.id);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}
