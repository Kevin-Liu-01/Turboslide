// The copy rules (SPEC 7.7, DECK-GRAMMAR.md:21-24): headings have no trailing period, sentence
// case with proper nouns kept, product tokens never first, a heading is a name and not a URL, no
// em dashes, no exclamation marks, no eyebrows, full sentences in captions, and the two
// severity 1 candidates the copy judge reads (contrast pairs and metaphors).
import type { Finding, Mutation, Slide } from '../contracts.ts';
import type { LintContext } from '../context.ts';
import { blockTexts, slideTexts } from '../context.ts';
import { plainText, words } from '../text.ts';

export const METAPHOR_WORDS: readonly string[] = [
  'journey',
  'unlock',
  'unlocks',
  'unlocking',
  'unleash',
  'unleashes',
  'supercharge',
  'supercharged',
  'turbocharge',
  'empower',
  'empowers',
  'empowering',
  'seamless',
  'seamlessly',
  'effortless',
  'effortlessly',
  'magic',
  'magical',
  'superpower',
  'superpowers',
  'north star',
  'level up',
  'game-changer',
  'game changer',
  'game-changing',
  'revolutionize',
  'revolutionary',
  'disrupt',
  'skyrocket',
  'silver bullet',
  'low-hanging fruit',
  'move the needle',
  'double down',
  'delight',
  'delightful',
  'frictionless',
  'next-level',
  'best-in-class',
  'cutting-edge',
  'bleeding-edge',
  'blazing',
  'lightning-fast',
];

const DOMAIN = /\b[a-z0-9-]+\.(?:com|dev|io|org|net|ai|app|co|so|xyz)\b/i;

type TextHit = {
  slide: Slide;
  blockId?: string;
  path: string;
  text: string;
  role: string;
  block?: { type: string };
};

function allTexts(ctx: LintContext, slide: Slide): TextHit[] {
  const out: TextHit[] = slideTexts(slide).map((ref) => ({
    slide,
    path: ref.path,
    text: ref.text,
    role: ref.role,
  }));
  for (const ref of ctx.blocksOf(slide)) {
    for (const t of blockTexts(ref.block))
      out.push({
        slide,
        blockId: ref.block.id,
        path: `${ref.path}${t.path}`,
        text: t.text,
        role: t.role,
        block: ref.block,
      });
  }
  return out;
}

function setText(hit: TextHit, value: string): Mutation[] {
  const rel = hit.blockId
    ? hit.path.replace(/^\/(slots\/[a-zA-Z]+|plate\/blocks)\/\d+/, '')
    : hit.path;
  return hit.blockId
    ? [{ op: 'block.set', slideId: hit.slide.id, blockId: hit.blockId, path: rel, value }]
    : [{ op: 'slide.set', slideId: hit.slide.id, path: rel, value }];
}

function isAcronym(word: string): boolean {
  return /^[A-Z0-9][A-Z0-9.-]*$/.test(word) && /[A-Z]/.test(word);
}

function hasInternalCapital(word: string): boolean {
  return (
    /^[A-Za-z][a-z]*[A-Z]/.test(word) || /\d/.test(word) || word.includes('.') || word.includes('-')
  );
}

/** Whether a capitalized word at `index` in `ws` belongs to a proper noun or token from the lists. */
function exempt(
  ws: string[],
  index: number,
  nouns: readonly string[],
  tokens: readonly string[],
): boolean {
  const word = ws[index] ?? '';
  if (tokens.includes(word)) return true;
  if (isAcronym(word) || hasInternalCapital(word)) return true;
  for (const noun of nouns) {
    const parts = noun.split(/\s+/);
    for (let start = index - parts.length + 1; start <= index; start += 1) {
      if (start < 0) continue;
      let all = true;
      for (let k = 0; k < parts.length; k += 1) {
        if ((ws[start + k] ?? '').replace(/[^\p{L}\p{N}.-]/gu, '') !== parts[k]) {
          all = false;
          break;
        }
      }
      if (all) return true;
    }
  }
  return false;
}

export function checkCopy(ctx: LintContext): Finding[] {
  const out: Finding[] = [];
  const { properNouns, tokens, headingCase } = ctx.options;
  for (const slide of ctx.slideList()) {
    const hits = allTexts(ctx, slide);
    for (const hit of hits) {
      const plain = plainText(hit.text);
      const base = { blockId: hit.blockId, path: hit.path, text: plain };

      // copy/no-em-dash and copy/no-exclamation apply to every text (DECK-GRAMMAR.md:23).
      if (plain.includes('—')) {
        out.push(
          ctx.finding('copy/no-em-dash', slide.id, {
            ...base,
            proposal: 'Replace the em dash with a comma, a period or a colon.',
            fix: setText(hit, hit.text.replace(/\s*—\s*/g, ', ')),
          }),
        );
      }
      if (plain.includes('!')) {
        out.push(
          ctx.finding('copy/no-exclamation', slide.id, {
            ...base,
            proposal: 'End the sentence with a period.',
            fix: setText(hit, hit.text.replace(/!+/g, '.')),
          }),
        );
      }

      const isHeading = hit.role === 'heading' || hit.role === 'title';
      if (isHeading || hit.role === 'key') {
        if (/\.$/.test(plain) && !/\.\.\.$/.test(plain)) {
          out.push(
            ctx.finding('copy/heading-period', slide.id, {
              ...base,
              proposal: 'Remove the trailing period; headings and keys are names.',
              fix: setText(hit, hit.text.replace(/\.\s*$/, '')),
            }),
          );
        }
      }
      if (isHeading) {
        const ws = words(plain);
        const first = ws[0] ?? '';
        if (tokens.some((t) => t.toLowerCase() === first.toLowerCase()) && first !== '') {
          out.push(
            ctx.finding('copy/token-first', slide.id, {
              ...base,
              proposal: `Start the heading with a noun; "${first}" is a product token (DECK-GRAMMAR.md:22).`,
            }),
          );
        }
        if (DOMAIN.test(plain)) {
          out.push(
            ctx.finding('copy/heading-is-name', slide.id, {
              ...base,
              proposal: 'Use the product name in the heading; the domain belongs in the body.',
            }),
          );
        }
        if (headingCase === 'sentence' && hit.role === 'heading') {
          const offenders: string[] = [];
          for (let i = 1; i < ws.length; i += 1) {
            const w = ws[i] ?? '';
            if (!/^[A-Z][a-z]/.test(w)) continue;
            if (exempt(ws, i, properNouns, tokens)) continue;
            offenders.push(w);
          }
          if (offenders.length > 0) {
            let fixed = hit.text;
            for (const w of offenders)
              fixed = fixed.replace(new RegExp(`(?<=\\s)${w}(?=\\b)`), w.toLowerCase());
            out.push(
              ctx.finding('copy/sentence-case', slide.id, {
                ...base,
                proposal: `Sentence case: lowercase ${offenders.map((w) => `"${w}"`).join(', ')} unless it is a proper noun (add it to the list).`,
                fix: setText(hit, fixed),
              }),
            );
          }
        }
      }
      if (hit.role === 'caption' && plain.length > 0 && !/[.?)"”]$/.test(plain)) {
        out.push(
          ctx.finding('copy/full-sentence-caption', slide.id, {
            ...base,
            proposal: 'Write the caption as a full sentence with a terminal period.',
            fix: setText(hit, `${hit.text.replace(/\s+$/, '')}.`),
          }),
        );
      }
      if (/(,\s*not\b)|(\bnot\b[^.;:!?,]*,\s*(but|only|just|rather)\b)/i.test(plain)) {
        out.push(
          ctx.finding('copy/contrast-pair', slide.id, {
            ...base,
            proposal:
              'Candidate "X, not Y" pair; state the fact and drop the contrast (DECK-GRAMMAR.md:23).',
          }),
        );
      }
      const lower = plain.toLowerCase();
      const metaphors = METAPHOR_WORDS.filter((m) =>
        new RegExp(`\\b${m.replace(/[-\s]/g, '[-\\s]')}\\b`).test(lower),
      );
      if (metaphors.length > 0) {
        out.push(
          ctx.finding('copy/metaphor-candidate', slide.id, {
            ...base,
            proposal: `Candidate metaphor: ${metaphors.join(', ')}. Replace with the mechanism or the number.`,
          }),
        );
      }
    }

    // copy/no-eyebrow: a cap or short all-caps line directly above a heading in the same slot.
    const refs = ctx.blocksOf(slide);
    for (let i = 0; i + 1 < refs.length; i += 1) {
      const a = refs[i];
      const b = refs[i + 1];
      if (!a || !b || a.slot !== b.slot) continue;
      if (b.block.type !== 'heading') continue;
      if (a.block.type !== 'paragraph') continue;
      const plain = plainText(a.block.text);
      const short = words(plain).length <= 5;
      const caps = plain === plain.toUpperCase() && /[A-Z]/.test(plain);
      if (a.block.role === 'cap' || (short && caps)) {
        out.push(
          ctx.finding('copy/no-eyebrow', slide.id, {
            blockId: a.block.id,
            path: a.path,
            text: plain,
            proposal:
              'Remove the eyebrow label above the heading; the heading carries the name (DECK-GRAMMAR.md:23).',
          }),
        );
      }
    }
  }
  return out;
}
