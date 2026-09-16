// The `layout` validator family (gslides-parity SPEC-5 1.2, 9.2; R03 4.1): a hidden entry names
// the built in layout it hides, a layout's blocks carry `pos` so Apply layout can place them, one
// placeholder of a kind per layout, and a slide whose `template` names a custom layout the deck
// does not hold (the `reference` code of 1.2). The zod schemas of `deck.ts` refuse the shape rules
// (the `custom-<slug>` key, the five placeholder kinds, `from` as a built in id). Answers `Issue[]`
// for `validateDeck`. B6's from day 1 (MILESTONES-5 B6 "Owns").
import type { PlaceholderKind } from '../blocks.ts';
import type { DeckDocument } from '../deck.ts';
import { isCustomLayoutId } from '../deck.ts';
import type { Issue } from '../validate.ts';

const DECK_FILE = 'deck.json';

function issue(
  code: Issue['code'],
  severity: Issue['severity'],
  file: string,
  pointer: string,
  message: string,
): Issue {
  return { code, severity, file, pointer, message };
}

export function validateLayouts(document: DeckDocument): Issue[] {
  const issues: Issue[] = [];
  const layouts = document.deck.customLayouts ?? {};
  for (const [id, layout] of Object.entries(layouts)) {
    const pointer = `/customLayouts/${id}`;
    if (layout.hidden === true) {
      if (layout.from === undefined) {
        issues.push(
          issue(
            'layout',
            3,
            DECK_FILE,
            `${pointer}/hidden`,
            'A hidden entry names the built in layout it hides in from (gslides-parity SPEC-5 9.2)',
          ),
        );
      }
      if (layout.blocks !== undefined && layout.blocks.length > 0) {
        issues.push(
          issue(
            'layout',
            2,
            DECK_FILE,
            `${pointer}/blocks`,
            'A hidden entry draws nothing; its blocks are ignored',
          ),
        );
      }
    }
    const seen = new Map<PlaceholderKind, number>();
    (layout.blocks ?? []).forEach((block, index) => {
      if (block.pos === undefined) {
        issues.push(
          issue(
            'layout',
            2,
            DECK_FILE,
            `${pointer}/blocks/${index}/pos`,
            'A layout block carries pos so Apply layout can place its content (gslides-parity SPEC-5 9.2)',
          ),
        );
      }
      // a material block is the one member of the union outside BlockBase, so it has no placeholder
      const kind: PlaceholderKind | undefined =
        'placeholder' in block ? block.placeholder : undefined;
      if (kind !== undefined) {
        const first = seen.get(kind);
        if (first !== undefined) {
          issues.push(
            issue(
              'layout',
              2,
              DECK_FILE,
              `${pointer}/blocks/${index}/placeholder`,
              `A second "${kind}" placeholder in one layout; Apply layout fills the first (block ${first})`,
            ),
          );
        } else {
          seen.set(kind, index);
        }
      }
    });
  }
  for (const slide of Object.values(document.slides)) {
    const template = slide.template;
    if (template === undefined || !isCustomLayoutId(template)) continue;
    const layout = layouts[template];
    const file = `slides/${slide.id}.json`;
    if (layout === undefined) {
      issues.push(
        issue(
          'reference',
          3,
          file,
          '/template',
          `Template "${template}" names no custom layout in the deck (gslides-parity SPEC-5 1.2)`,
        ),
      );
    } else if (layout.hidden === true) {
      issues.push(
        issue(
          'layout',
          2,
          file,
          '/template',
          `Template "${template}" is a hidden layout; Apply layout offers it no more`,
        ),
      );
    }
  }
  return issues;
}
