// Structure and accuracy rules (SPEC 7.7): the opener sentence lists the section's families
// (OPENERS.md:44), an authored scale marker in imported html (DECK-GRAMMAR.md:61), the escape
// block itself (report 05 section 6.1), the blocks that export as raster (design C section 6.7),
// numerals that contradict each other across slides, and a numeral equal to the slide count in
// copy that should derive from the deck (report 06 section 4 item 2).
import type { Block, Finding } from '../contracts.ts';
import { slideTitle } from '../contracts.ts';
import type { LintContext } from '../context.ts';
import { blockTexts, slideTexts } from '../context.ts';
import { htmlText, plainText, words } from '../text.ts';

/** Block types the flatten exporter writes as native text (MILESTONES M2 item 4). */
export const NATIVE_BLOCK_TYPES: readonly Block['type'][] = [
  'heading',
  'paragraph',
  'credit',
  'rows',
  'plain',
  'panel',
];

const NUMBER_NOUN = /\b(\d{1,3}(?:,\d{3})*|\d+)\s+([a-z][a-z-]{2,})\b/g;
const NOUN_STOP = new Set([
  'by',
  'to',
  'of',
  'and',
  'or',
  'the',
  'per',
  'px',
  'percent',
  'pixels',
  'pixel',
  'for',
  'in',
  'on',
  'at',
  'with',
  'from',
  'as',
  'is',
  'are',
  'was',
  'were',
  'not',
  'but',
  'that',
  'this',
  'than',
  'then',
]);

export function checkStructure(ctx: LintContext): Finding[] {
  const out: Finding[] = [];
  const slideCount = ctx.order.length;
  const sectionCount = ctx.deck.sections.length;
  const numerals = new Map<string, Map<string, { slideId: string; blockId?: string }[]>>();

  for (const slide of ctx.slideList()) {
    const refs = ctx.blocksOf(slide);
    const rasterBlocks: string[] = [];
    for (const ref of refs) {
      const { block } = ref;
      if (block.type === 'html') {
        out.push(
          ctx.finding('escape/html-block', slide.id, {
            blockId: block.id,
            path: ref.path,
            text: block.note,
            proposal: `Express the block in the grammar (${block.note}); until then it exports as a raster (report 05 section 6.1).`,
          }),
        );
        if (/class="scale"/.test(block.html) && /<i\s+style="[^"]*left\s*:/.test(block.html)) {
          out.push(
            ctx.finding('scales/marker-equals-value', slide.id, {
              blockId: block.id,
              path: `${ref.path}/html`,
              proposal:
                'A scale marker is authored in the escape markup; use a scales block so the marker derives from the value (DECK-GRAMMAR.md:61).',
            }),
          );
        }
      }
      if (!NATIVE_BLOCK_TYPES.includes(block.type)) rasterBlocks.push(block.id);
      // numerals with their nouns, for numbers/contradiction and count/hard-coded
      const texts =
        block.type === 'html'
          ? [{ path: `${ref.path}/html`, text: htmlText(block.html) }]
          : blockTexts(block).map((t) => ({
              path: `${ref.path}${t.path}`,
              text: plainText(t.text),
            }));
      for (const t of texts)
        collectNumerals(
          ctx,
          out,
          slide.id,
          block.id,
          t.path,
          t.text,
          slideCount,
          sectionCount,
          numerals,
        );
    }
    for (const t of slideTexts(slide))
      collectNumerals(
        ctx,
        out,
        slide.id,
        undefined,
        t.path,
        plainText(t.text),
        slideCount,
        sectionCount,
        numerals,
      );
    if (ctx.options.exportMode !== false && rasterBlocks.length > 0) {
      out.push(
        ctx.finding('export/non-native', slide.id, {
          text: rasterBlocks.join(', '),
          measured: { rasterBlocks: rasterBlocks.length },
          proposal: `In ${ctx.options.exportMode} mode these blocks export as 2x rasters: ${rasterBlocks.join(', ')}.`,
        }),
      );
    }
    // opener/sentence-lists-section
    if (slide.kind === 'opener') {
      const section = ctx.sectionOf(slide.id);
      const sentence = slide.plate.blocks
        .flatMap((b) => (b.type === 'paragraph' ? [plainText(b.text)] : []))
        .join(' ')
        .toLowerCase();
      if (section && sentence) {
        const unmentioned: string[] = [];
        for (const id of section.slideIds) {
          const other = ctx.slides[id];
          if (!other || other.kind !== 'content') continue;
          const title = slideTitle(other);
          const keys = words(plainText(title).toLowerCase()).filter((w) => w.length >= 5);
          if (keys.length > 0 && !keys.some((k) => sentence.includes(k.replace(/s$/, ''))))
            unmentioned.push(title);
        }
        if (unmentioned.length > 0) {
          out.push(
            ctx.finding('opener/sentence-lists-section', slide.id, {
              path: '/plate/blocks',
              text: unmentioned.join('; '),
              proposal: `The sentence should name each family of the section in order; not mentioned: ${unmentioned.join(', ')} (OPENERS.md:44).`,
            }),
          );
        }
      }
    }
  }
  // numbers/contradiction: one noun with two or more different numerals, reported once
  for (const [noun, byNumber] of numerals) {
    if (byNumber.size < 2) continue;
    const entries = [...byNumber.entries()];
    const first = entries[0]?.[1][0];
    if (!first) continue;
    const summary = entries
      .map(([n, where]) => `${n} ${noun} (${[...new Set(where.map((w) => w.slideId))].join(', ')})`)
      .join('; ');
    out.push(
      ctx.finding('numbers/contradiction', first.slideId, {
        blockId: first.blockId,
        text: summary,
        proposal: `The same noun carries different numerals across slides: ${summary}. Confirm the right one (for the accuracy judge).`,
      }),
    );
  }
  return out;
}

function collectNumerals(
  ctx: LintContext,
  out: Finding[],
  slideId: string,
  blockId: string | undefined,
  path: string,
  text: string,
  slideCount: number,
  sectionCount: number,
  numerals: Map<string, Map<string, { slideId: string; blockId?: string }[]>>,
): void {
  const hardCoded: string[] = [];
  for (const m of text.matchAll(NUMBER_NOUN)) {
    const raw = m[1] ?? '';
    const noun = (m[2] ?? '').toLowerCase();
    if (NOUN_STOP.has(noun)) continue;
    const value = Number(raw.replace(/,/g, ''));
    const singular = noun.replace(/s$/, '');
    if (
      (value === slideCount && /^slides?$/.test(noun)) ||
      (value === sectionCount && /^sections?$/.test(noun))
    )
      hardCoded.push(m[0]);
    const byNumber =
      numerals.get(singular) ?? new Map<string, { slideId: string; blockId?: string }[]>();
    const list = byNumber.get(raw) ?? [];
    list.push({ slideId, blockId });
    byNumber.set(raw, list);
    numerals.set(singular, byNumber);
  }
  if (hardCoded.length > 0) {
    out.push(
      ctx.finding('count/hard-coded', slideId, {
        blockId,
        path,
        text: hardCoded.join('; '),
        proposal: `${hardCoded.map((h) => `"${h}"`).join(' and ')} equal the deck's counts; derive them from the manifest instead of typing them (report 06 section 4 item 2).`,
      }),
    );
  }
}
