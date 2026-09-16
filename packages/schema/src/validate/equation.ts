// The `equation` validator family (gslides-parity SPEC-5 1.2, 8.1): an equation with no source
// and no kept MathML renders nothing (severity 2), and a kept `mathml` string is one `<math>`
// element with no markup outside MathML (severity 3), because the renderer emits it as is while
// `tex` is empty and `sanitize/html.ts` keeps `math` in `FORBIDDEN_TAGS` for every other writer
// (1.1 item 6). A LaTeX source Temml cannot parse is `equation/parse` at severity 2, never a
// refusal, reported by the lint layer from the renderer's parse result (the schema never parses
// LaTeX; B6 day 3). Answers `Issue[]` for `validateDeck`. B6's from day 1 (MILESTONES-5 B6 "Owns").
import type { Block } from '../blocks.ts';
import type { DeckDocument, Slide } from '../deck.ts';
import { slideBlocks } from '../deck.ts';
import type { Issue } from '../validate.ts';

/** Markup a kept MathML string may not carry: anything that is not MathML Core, and event handlers. */
const FOREIGN_MARKUP =
  /<\s*\/?\s*(script|style|iframe|object|embed|link|img|svg|foreignObject|annotation-xml|html|body|a)\b|\son[a-z]+\s*=|javascript:/i;

/** True when the string is one `<math>` element and nothing else, with no foreign markup inside. */
export function isMathMlElement(mathml: string): boolean {
  const trimmed = mathml.trim();
  if (!/^<math[\s>]/i.test(trimmed) || !/<\/math>$/i.test(trimmed)) return false;
  if (trimmed.indexOf('</math>') !== trimmed.length - '</math>'.length) return false;
  return !FOREIGN_MARKUP.test(trimmed);
}

function walk(
  blocks: ReadonlyArray<Block>,
  basePointer: string,
  visit: (block: Block, pointer: string) => void,
): void {
  blocks.forEach((block, index) => {
    const pointer = `${basePointer}/${index}`;
    visit(block, pointer);
    if (block.type === 'composite') {
      block.cells.forEach((cell, cellIndex) => {
        walk(cell.blocks, `${pointer}/cells/${cellIndex}/blocks`, visit);
      });
    }
  });
}

/** The block lists of a slide with their pointers: the slots of a content slide, else the plate. */
function blockLists(slide: Slide): { pointer: string; blocks: ReadonlyArray<Block> }[] {
  const places = new Map<string, Block[]>();
  for (const { slot, block } of slideBlocks(slide)) {
    const pointer = slot === 'plate' ? '/plate/blocks' : `/slots/${slot}`;
    const list = places.get(pointer) ?? [];
    list.push(block);
    places.set(pointer, list);
  }
  return [...places.entries()].map(([pointer, blocks]) => ({ pointer, blocks }));
}

export function validateEquations(document: DeckDocument): Issue[] {
  const issues: Issue[] = [];
  for (const slide of Object.values(document.slides)) {
    const file = `slides/${slide.id}.json`;
    for (const list of blockLists(slide)) {
      walk(list.blocks, list.pointer, (block, pointer) => {
        if (block.type !== 'equation') return;
        const tex = block.tex.trim();
        const mathml = block.mathml?.trim();
        if (tex === '' && (mathml === undefined || mathml === '')) {
          issues.push({
            code: 'equation',
            severity: 2,
            file,
            pointer: `${pointer}/tex`,
            message:
              'An equation with no source renders nothing; type a LaTeX source or remove the block (gslides-parity SPEC-5 8.1)',
          });
        }
        if (mathml !== undefined && mathml !== '' && !isMathMlElement(mathml)) {
          issues.push({
            code: 'equation',
            severity: 3,
            file,
            pointer: `${pointer}/mathml`,
            message:
              'mathml holds one <math> element and nothing outside MathML; the equation renderer is the one writer of <math> (gslides-parity SPEC-5 1.1 item 6, 8.1)',
          });
        }
      });
    }
  }
  return issues;
}
