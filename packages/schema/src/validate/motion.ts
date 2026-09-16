// The `motion` validator family (gslides-parity SPEC-5 1.2, 0.7): the cross reference rules the
// zod schemas of `motion.ts` cannot state. The shape rules (a duration outside 100 to 5000, an
// unknown effect or trigger, over 200 entries) are `transitionSchema` and `animationsSchema`; this
// module walks every slide's list against its blocks and answers `Issue[]` for `validateDeck`.
//
// Severity 3 (the deck is refused): an animation id repeated in one slide, an animation naming a
// block that is not a top level block of the slide (the reducer drops those on `block.remove` and
// `slide.replace`, so a stored deck never carries one), Play on a block that is not a media block,
// a second YouTube video set to Play (automatically) on one slide (one embedded player autoplays
// per slide, R11 5). Severity 2 (kept, reported): a `direction` on an effect that is not a fly (the
// compiler ignores it), a fly without a `direction` (the compiler flies from or to the left), By
// paragraph on a block without paragraphs (the compiler animates the block as one object).
// Landed empty by the integrator on day 0 (SPEC-5 1.6); B1's from day 1 (MILESTONES-5 B1).
import type { Block } from '../blocks.ts';
import type { DeckDocument, Slide } from '../deck.ts';
import type { Issue } from '../validate.ts';
import {
  FLY_EFFECTS,
  MOTION_LABELS,
  PARAGRAPH_CARRIER_TYPES,
  animationLabel,
  blockParagraphCount,
  motionTargets,
} from '../motion.ts';

/** A top level block with the JSON pointer of its position in the slide file. */
function targetPointers(slide: Slide): { block: Block; pointer: string }[] {
  const out: { block: Block; pointer: string }[] = [];
  if (slide.kind === 'content') {
    for (const [slot, blocks] of Object.entries(slide.slots))
      blocks.forEach((block, index) => out.push({ block, pointer: `/slots/${slot}/${index}` }));
  } else if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing') {
    slide.plate.blocks.forEach((block, index) =>
      out.push({ block, pointer: `/plate/blocks/${index}` }),
    );
  }
  return out;
}

function issue(file: string, pointer: string, severity: 2 | 3, message: string): Issue {
  return { code: 'motion', severity, file, pointer, message };
}

export function validateMotion(document: DeckDocument): Issue[] {
  const issues: Issue[] = [];
  for (const slide of Object.values(document.slides)) {
    const file = `slides/${slide.id}.json`;
    const blocks = new Map(motionTargets(slide).map((block) => [block.id, block]));
    validateAnimations(slide, blocks, file, issues);
    validateAutoplayingVideos(slide, file, issues);
  }
  return issues;
}

function validateAnimations(
  slide: Slide,
  blocks: Map<string, Block>,
  file: string,
  issues: Issue[],
): void {
  const animations = slide.animations;
  if (animations === undefined) return;
  const seen = new Set<string>();
  animations.forEach((animation, index) => {
    const at = `/animations/${index}`;
    if (seen.has(animation.id))
      issues.push(
        issue(
          file,
          `${at}/id`,
          3,
          `Animation id "${animation.id}" is repeated on slide "${slide.id}"; every row of a slide's list has its own id (gslides-parity SPEC-5 1.3)`,
        ),
      );
    seen.add(animation.id);
    const block = blocks.get(animation.blockId);
    if (block === undefined) {
      issues.push(
        issue(
          file,
          `${at}/blockId`,
          3,
          `Animation "${animation.id}" names block "${animation.blockId}", which is not a top level block of slide "${slide.id}" (gslides-parity SPEC-5 0.8)`,
        ),
      );
    }
    const fly = FLY_EFFECTS.has(animation.effect);
    if (!fly && animation.direction !== undefined)
      issues.push(
        issue(
          file,
          `${at}/direction`,
          2,
          `Animation "${animation.id}" carries a direction on ${animationLabel(animation)}, which only a fly effect reads; the show ignores it (gslides-parity SPEC-5 1.3)`,
        ),
      );
    if (fly && animation.direction === undefined)
      issues.push(
        issue(
          file,
          `${at}/direction`,
          2,
          `Animation "${animation.id}" is a ${MOTION_LABELS.effects[animation.effect].toLowerCase()} without a direction; the show plays it ${animation.effect === 'flyIn' ? 'from' : 'to'} the left (gslides-parity SPEC-5 1.3)`,
        ),
      );
    if (animation.effect === 'playMedia' && block !== undefined && block.type !== 'media')
      issues.push(
        issue(
          file,
          `${at}/effect`,
          3,
          `Animation "${animation.id}" is Play on block "${block.id}" of type ${block.type}; Play needs a media block (gslides-parity SPEC-5 1.2)`,
        ),
      );
    if (animation.byParagraph === true && block !== undefined) {
      const count = PARAGRAPH_CARRIER_TYPES.has(block.type) ? blockParagraphCount(block) : 0;
      if (count === 0)
        issues.push(
          issue(
            file,
            `${at}/byParagraph`,
            2,
            `Animation "${animation.id}" is By paragraph on block "${block.id}" of type ${block.type}, which has no paragraphs or items; the show animates the block as one object (gslides-parity SPEC-5 2.1)`,
          ),
        );
    }
  });
}

/** One YouTube video per slide may start automatically (R11 5): the second and later are refused. */
function validateAutoplayingVideos(slide: Slide, file: string, issues: Issue[]): void {
  let first: string | undefined;
  for (const { block, pointer } of targetPointers(slide)) {
    if (block.type !== 'media') continue;
    if (!('youtube' in block.source) || block.playback.start !== 'auto') continue;
    if (first === undefined) {
      first = block.id;
      continue;
    }
    issues.push(
      issue(
        file,
        `${pointer}/playback/start`,
        3,
        `Block "${block.id}" is a second YouTube video set to Play (automatically) on slide "${slide.id}" after "${first}"; one embedded player starts automatically per slide (gslides-parity SPEC-5 1.2)`,
      ),
    );
  }
}
