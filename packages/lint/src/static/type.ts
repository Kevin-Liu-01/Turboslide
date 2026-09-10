// Static type rules (SPEC 7.7): the declared and raw diagram label minimum (head:157-160), the
// display weight cap (DECK-GRAMMAR.md:20), and the size ladder (head:59-65). Declared blocks
// cannot carry an off-ladder size or a heavy weight, so these rules read html escape blocks and
// raw svg strings, and the spec block's weights are the one sanctioned exception.
import type { Finding } from '../contracts.ts';
import type { LintContext } from '../context.ts';

/** The sheet's type ladder in px (head:59-65 and the block rules; 15 is the floor). */
export const TYPE_LADDER: readonly number[] = [88, 72, 58, 44, 34, 26, 24, 22, 20, 18, 17, 16, 15];
export const WEIGHT_CAP = 500;
export const SVG_LABEL_MIN = 18;

function nearestLadder(size: number): number {
  let best = TYPE_LADDER[0] ?? 22;
  for (const s of TYPE_LADDER) if (Math.abs(s - size) < Math.abs(best - size)) best = s;
  return best;
}

function weightValue(raw: string): number {
  const v = raw.trim().toLowerCase();
  if (v === 'bold' || v === 'bolder') return 700;
  const n = Number(v);
  return Number.isFinite(n) ? n : 400;
}

export function checkType(ctx: LintContext): Finding[] {
  const out: Finding[] = [];
  for (const slide of ctx.slideList()) {
    for (const ref of ctx.blocksOf(slide)) {
      const { block } = ref;
      const base = { blockId: block.id, path: ref.path };
      if (block.type === 'html') {
        const css = block.css;
        // type/weight-cap in escape CSS, fixable by rewriting the declaration to 500.
        const heavy = [...css.matchAll(/font-weight\s*:\s*([^;}]+)/gi)].filter(
          (m) => weightValue(m[1] ?? '') > WEIGHT_CAP,
        );
        if (heavy.length > 0) {
          const fixed = css.replace(/font-weight\s*:\s*([^;}]+)/gi, (whole, value: string) =>
            weightValue(value) > WEIGHT_CAP ? 'font-weight: 500' : whole,
          );
          out.push(
            ctx.finding('type/weight-cap', slide.id, {
              ...base,
              path: `${ref.path}/css`,
              text: heavy.map((m) => m[0]).join('; '),
              proposal:
                'Display weight is capped at 500 (DECK-GRAMMAR.md:20); set the weight to 500.',
              fix: [
                {
                  op: 'block.set',
                  slideId: slide.id,
                  blockId: block.id,
                  path: '/css',
                  value: fixed,
                },
              ],
            }),
          );
        }
        // type/sizes-ladder in escape CSS, fixable by snapping to the nearest ladder size.
        const sizes = [...css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi)]
          .map((m) => Number(m[1]))
          .filter((n) => !TYPE_LADDER.includes(n));
        if (sizes.length > 0) {
          const fixed = css.replace(
            /font-size\s*:\s*(\d+(?:\.\d+)?)px/gi,
            (whole, value: string) =>
              TYPE_LADDER.includes(Number(value))
                ? whole
                : `font-size: ${nearestLadder(Number(value))}px`,
          );
          out.push(
            ctx.finding('type/sizes-ladder', slide.id, {
              ...base,
              path: `${ref.path}/css`,
              text: `font-size ${[...new Set(sizes)].join(', ')} px`,
              proposal: `Use a ladder size (${TYPE_LADDER.join(', ')}); the nearest is applied by the fix.`,
              fix: [
                {
                  op: 'block.set',
                  slideId: slide.id,
                  blockId: block.id,
                  path: '/css',
                  value: fixed,
                },
              ],
            }),
          );
        }
        checkSvgLabels(ctx, out, slide.id, block.id, `${ref.path}/html`, block.html);
        checkSvgLabels(ctx, out, slide.id, block.id, `${ref.path}/css`, block.css);
      }
      if (block.type === 'dia') {
        if (block.data) {
          block.data.texts.forEach((t, i) => {
            if (t.size < SVG_LABEL_MIN) {
              out.push(
                ctx.finding('type/svg-label-min', slide.id, {
                  ...base,
                  path: `${ref.path}/data/texts/${i}/size`,
                  text: t.text,
                  proposal: `Diagram text is 20 px (ink-2), 26 px (lab) or 18 px (sm); ${t.size} px is under the minimum (head:157-160).`,
                }),
              );
            }
          });
        }
        if (block.svg) {
          checkSvgLabels(ctx, out, slide.id, block.id, `${ref.path}/svg`, block.svg);
          const heavy = [...block.svg.matchAll(/font-weight\s*[:=]\s*["']?([^;"'}\s]+)/gi)].filter(
            (m) => weightValue(m[1] ?? '') > WEIGHT_CAP,
          );
          if (heavy.length > 0) {
            out.push(
              ctx.finding('type/weight-cap', slide.id, {
                ...base,
                path: `${ref.path}/svg`,
                text: heavy.map((m) => m[0]).join('; '),
                proposal: 'Display weight is capped at 500 (DECK-GRAMMAR.md:20).',
              }),
            );
          }
        }
      }
    }
  }
  return out;
}

function checkSvgLabels(
  ctx: LintContext,
  out: Finding[],
  slideId: string,
  blockId: string,
  path: string,
  source: string,
): void {
  const small = new Set<number>();
  for (const m of source.matchAll(/font-size\s*[:=]\s*["']?(\d+(?:\.\d+)?)(?:px)?["']?/gi)) {
    const n = Number(m[1]);
    if (n < SVG_LABEL_MIN && /<svg|<text|\.dia|svg/i.test(source)) small.add(n);
  }
  if (small.size > 0) {
    out.push(
      ctx.finding('type/svg-label-min', slideId, {
        blockId,
        path,
        text: `font-size ${[...small].join(', ')} px`,
        proposal: `Raise diagram labels to at least ${SVG_LABEL_MIN} px (head:157-160).`,
      }),
    );
  }
}
