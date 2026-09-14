// Structure and accuracy rules (SPEC 7.7): the opener sentence lists the section's families
// (OPENERS.md:44), an authored scale marker in imported html (DECK-GRAMMAR.md:61), the escape
// block itself (report 05 section 6.1), numerals that contradict each other across slides, and a
// numeral equal to the slide count in copy that should derive from the deck (report 06 section 4
// item 2). The export/non-native listing moved to export-non-native.ts in M2.
import { sanitizeCss, sanitizeMarkup } from '@turboslide/render/blocks/html-escape';
import type { Finding, Mutation } from '../contracts.ts';
import { slideTitle } from '../contracts.ts';
import type { LintContext } from '../context.ts';
import { blockTexts, slideTexts } from '../context.ts';
import { htmlText, plainText, words } from '../text.ts';

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
        // html/sanitize (gslides-parity SPEC-3 8.4): a block the sanitizer has not stamped. The
        // fix is the cleaned markup and CSS with the stamp: the parser when it has loaded
        // (`turboslide fix` loads it first), the pattern pass otherwise, and the write path
        // repeats the parser pass on the block.set it commits.
        if (block.htmlSanitized !== true) {
          const markup = sanitizeMarkup(block.html);
          const css = sanitizeCss(block.css);
          const fix: Mutation[] = [];
          if (markup.changed) {
            fix.push({
              op: 'block.set',
              slideId: slide.id,
              blockId: block.id,
              path: '/html',
              value: markup.html,
            });
          }
          if (css.dropped.length > 0) {
            fix.push({
              op: 'block.set',
              slideId: slide.id,
              blockId: block.id,
              path: '/css',
              value: css.css,
            });
          }
          fix.push({
            op: 'block.set',
            slideId: slide.id,
            blockId: block.id,
            path: '/htmlSanitized',
            value: true,
          });
          out.push(
            ctx.finding('html/sanitize', slide.id, {
              blockId: block.id,
              path: `${ref.path}/htmlSanitized`,
              text: `${markup.changed ? 'markup changed' : 'markup unchanged'}; ${css.dropped.length} CSS declaration(s) dropped${markup.parsed ? '' : '; pattern pass only until the parser loads'}`,
              measured: { droppedCss: css.dropped.length, markupChanged: markup.changed ? 1 : 0 },
              proposal:
                'This HTML block has not passed the sanitizer. `turboslide fix --rule html/sanitize` writes the cleaned HTML and CSS and records that they passed; the next edit of the block repeats the check with the parser.',
              fix,
            }),
          );
        }
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
