// Color rules (SPEC 7.7; DECK-GRAMMAR.md:28-30): only the tokens, never a literal outside the
// sanctioned exceptions, and the four semantic hues only on icons. The grammar blocks cannot carry
// a color, so those two rules read html escape blocks and raw svg strings. The primitive blocks
// of the freeform round carry Color fields (docs/freeform.md): a token is right by construction
// and a custom hex is color/off-palette at severity 2, named with the block and the field.
import type { Block, Finding } from '../contracts.ts';
import { COLOR_TOKENS, isHexColor } from '../contracts.ts';
import type { LintContext } from '../context.ts';

/** The Color fields per primitive block type (schema blocks.ts). */
export function colorFields(block: Block): { field: string; value: string }[] {
  const out: { field: string; value: string }[] = [];
  const push = (field: string, value: string | undefined): void => {
    if (value !== undefined) out.push({ field, value });
  };
  switch (block.type) {
    case 'box':
      push('fill', block.fill);
      push('stroke', block.stroke);
      push('color', block.color);
      break;
    case 'shape':
      push('fill', block.fill);
      push('stroke', block.stroke);
      break;
    case 'rule':
    case 'text':
    case 'icon':
      push('color', block.color);
      break;
    default:
      break;
  }
  return out;
}

/** The four semantic hues, the same in both themes (head:106-109). */
export const SEMANTIC_HUES: Readonly<Record<'ok' | 'warn' | 'no' | 'info', string>> = {
  ok: '#12a37a',
  warn: '#f0a020',
  no: '#e5484d',
  info: '#2f5ce0',
};

/** Literals the grammar sanctions: the code panel, the fixed-white logo plates and the swatches. */
export const SANCTIONED_LITERALS: readonly string[] = [
  '#101010',
  '#ffffff',
  '#fff',
  '#070707',
  '#8a8f98',
  '#3a3d44',
  '#f2f2f0',
  '#b9bcc3',
  'transparent',
  'currentcolor',
  'inherit',
  'none',
];

const LITERAL = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi;

function literals(source: string): string[] {
  return [...new Set([...source.matchAll(LITERAL)].map((m) => m[0].toLowerCase()))];
}

export function checkColor(ctx: LintContext): Finding[] {
  const out: Finding[] = [];
  const hues = Object.values(SEMANTIC_HUES);
  for (const slide of ctx.slideList()) {
    for (const ref of ctx.blocksOf(slide)) {
      const { block } = ref;
      for (const { field, value } of colorFields(block)) {
        if (!isHexColor(value)) continue;
        out.push(
          ctx.finding('color/off-palette', slide.id, {
            blockId: block.id,
            path: `${ref.path}/${field}`,
            text: value,
            proposal: `Block "${block.id}" sets ${field} to ${value}, a custom color that stays the same in both themes; a palette token (${COLOR_TOKENS.join(', ')}) follows the theme (DECK-GRAMMAR.md:28; docs/freeform.md).`,
          }),
        );
      }
      const sources: { path: string; text: string }[] = [];
      if (block.type === 'html')
        sources.push(
          { path: `${ref.path}/css`, text: block.css },
          { path: `${ref.path}/html`, text: block.html },
        );
      if (block.type === 'dia' && block.svg)
        sources.push({ path: `${ref.path}/svg`, text: block.svg });
      for (const source of sources) {
        const found = literals(source.text);
        const semantic = found.filter((c) => hues.includes(c));
        const others = found.filter(
          (c) =>
            !hues.includes(c) &&
            !SANCTIONED_LITERALS.includes(c) &&
            !/^rgba?\(\s*(7|242|255|0)\s*,\s*(7|242|255|0)\s*,\s*(7|240|255|0)/.test(c),
        );
        if (others.length > 0) {
          out.push(
            ctx.finding('color/tokens-only', slide.id, {
              blockId: block.id,
              path: source.path,
              text: others.join(', '),
              proposal:
                'Use the tokens (--paper, --ink, --ink-2, --titanium, --hair, --hair-soft, --plate, --cross, --edge) instead of a literal (DECK-GRAMMAR.md:28).',
            }),
          );
        }
        const semanticHits = [...semantic];
        // a semantic class on a non-icon element in escape markup
        for (const m of source.text.matchAll(
          /<(?!svg)(\w+)[^>]*class="[^"]*\b(ok|warn|no|info)\b[^"]*"/gi,
        )) {
          const tag = (m[1] ?? '').toLowerCase();
          const cls = m[2] ?? '';
          // .plain .no and .say .q.no are the strike style, not a color
          if (cls === 'no' && (tag === 'span' || tag === 'div')) continue;
          semanticHits.push(`.${cls} on <${tag}>`);
        }
        if (semanticHits.length > 0) {
          out.push(
            ctx.finding('color/semantic-icons-only', slide.id, {
              blockId: block.id,
              path: source.path,
              text: semanticHits.join(', '),
              proposal:
                'Semantic hues appear only on icons through the ok, warn, no and info classes (DECK-GRAMMAR.md:30).',
            }),
          );
        }
      }
    }
  }
  return out;
}
