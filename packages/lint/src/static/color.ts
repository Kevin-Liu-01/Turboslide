// Color rules (SPEC 7.7; DECK-GRAMMAR.md:28-30): only the tokens, never a literal outside the
// sanctioned exceptions, and the four semantic hues only on icons. Declared blocks cannot carry a
// color, so both rules read html escape blocks and raw svg strings.
import type { Finding } from '../contracts.ts';
import type { LintContext } from '../context.ts';

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
