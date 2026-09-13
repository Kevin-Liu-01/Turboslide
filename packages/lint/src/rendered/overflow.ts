// text/overflow (gslides-parity SPEC-2 2.1.5, 0.23, 0.64): text that leaves its box on a
// positioned text carrying block. The record's `contentHeight` is the height the text needs
// (the measurer's line boxes plus the padding); when it passes the box under `autofit` none or
// absent the finding's fix writes the box height (`pos.h`), and under `shrink` the fix writes the
// next ladder step down from the rendered size, or the box height when the ladder ended. `grow`
// is never a finding: the editor writes the height after each commit and the CLI's `--apply`
// does the same, so an overflowing grow box is a document in transit. Never a render time fit;
// every fit is a write (SPEC 7.1 rule 4).
import { ladderStepDown } from '@turboslide/schema/typography';
import type { Block, Finding, Mutation, RenderRecord, Slide } from '../contracts.ts';
import type { LintContext } from '../context.ts';
import type { BlockIndex } from './shared.ts';

/** The blocks `autofit` lives on (SPEC-2 2.1.5). */
function fitted(block: Block): block is Block & { autofit?: 'none' | 'shrink' | 'grow' } {
  return (
    block.type === 'heading' ||
    block.type === 'paragraph' ||
    block.type === 'text' ||
    block.type === 'box' ||
    block.type === 'shape'
  );
}

/** A pixel of slack: the measurer rounds to integers on both sides. */
const SLACK_PX = 1;

export function checkTextOverflow(
  ctx: LintContext,
  record: RenderRecord,
  slide: Slide | undefined,
  refs: BlockIndex,
): Finding[] {
  const out: Finding[] = [];
  if (slide === undefined) return out;
  for (const [id, ref] of refs) {
    const block = ref.block;
    if (ref.parent !== undefined || block.pos === undefined || !fitted(block)) continue;
    const measured = record.blocks[id];
    if (measured === undefined || measured.contentHeight === undefined) continue;
    const box = block.pos.h;
    if (measured.contentHeight <= box + SLACK_PX) continue;
    const mode = block.autofit ?? 'none';
    if (mode === 'grow') continue;
    const size = measured.fontSize ?? ('typography' in block ? block.typography?.size : undefined);
    const step = mode === 'shrink' && size !== undefined ? ladderStepDown(size) : undefined;
    const fix: Mutation[] =
      step !== undefined
        ? [
            {
              op: 'block.set',
              slideId: slide.id,
              blockId: block.id,
              path: '/typography/size',
              value: step,
            },
          ]
        : [
            {
              op: 'block.set',
              slideId: slide.id,
              blockId: block.id,
              path: '/pos/h',
              value: Math.ceil(measured.contentHeight),
            },
          ];
    out.push(
      ctx.finding('text/overflow', record.slideId, {
        blockId: block.id,
        path: `${ref.path}/pos/h`,
        theme: record.theme,
        box: measured.box,
        measured: { contentHeight: measured.contentHeight, boxHeight: box },
        text: mode,
        proposal:
          step !== undefined
            ? `The text needs ${Math.ceil(measured.contentHeight)} px and its box is ${box} px tall; the fix steps the size from ${size} to ${step} px. Or make the box taller`
            : `The text needs ${Math.ceil(measured.contentHeight)} px and its box is ${box} px tall; the fix makes the box ${Math.ceil(measured.contentHeight)} px tall. Or shorten the text`,
        fix,
      }),
    );
  }
  return out;
}
