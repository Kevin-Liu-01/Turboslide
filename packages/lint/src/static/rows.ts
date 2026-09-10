// rows/key-snap (SPEC 7.7; report 03 section 11 item 6): a key column width outside the snap set
// the deck uses (240 default, narrow 180, and the per-slide values). Fixable: the nearest snap.
import type { Finding } from '../contracts.ts';
import type { LintContext } from '../context.ts';

export const ROWS_KEY_SNAP: readonly number[] = [90, 120, 150, 180, 190, 200, 220, 240, 250, 300];

export function nearestKey(key: number): number {
  let best = 240;
  for (const k of ROWS_KEY_SNAP) if (Math.abs(k - key) < Math.abs(best - key)) best = k;
  return best;
}

export function checkRows(ctx: LintContext): Finding[] {
  const out: Finding[] = [];
  for (const slide of ctx.slideList()) {
    for (const ref of ctx.blocksOf(slide)) {
      if (ref.block.type !== 'rows') continue;
      if (!ROWS_KEY_SNAP.includes(ref.block.key)) {
        const snap = nearestKey(ref.block.key);
        out.push(
          ctx.finding('rows/key-snap', slide.id, {
            blockId: ref.block.id,
            path: `${ref.path}/key`,
            text: String(ref.block.key),
            measured: { key: ref.block.key, snap },
            proposal: `Snap the key column to ${snap} px (the set is ${ROWS_KEY_SNAP.join(', ')}).`,
            fix: [
              {
                op: 'block.set',
                slideId: slide.id,
                blockId: ref.block.id,
                path: '/key',
                value: snap,
              },
            ],
          }),
        );
      }
    }
  }
  return out;
}
