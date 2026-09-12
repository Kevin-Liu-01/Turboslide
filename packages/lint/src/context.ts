// The linter's view of a deck (SPEC 7.7): the document, the slide order, the block list with the
// JSON pointer of every block and text, the assets, and the options the copy rules read (the
// proper-noun and product-token lists of the theme's copy.ts, the sprite's icon names, the
// heading case mode of open question 13).
import type {
  Asset,
  Block,
  Deck,
  DeckDocument,
  Finding,
  Mutation,
  RuleId,
  Section,
  Slide,
  SlideId,
  SlotName,
  Text,
} from './contracts.ts';
import { RULES, findingId, sectionOfSlide, slideBlocks, slideOrder } from './contracts.ts';
import { cellWidths } from '@turboslide/schema/blocks/composite';

export type LintOptions = {
  /** Proper nouns that keep their capitals in a sentence-case heading (SPEC 5.1 copy.ts). */
  properNouns?: readonly string[];
  /** Product tokens in their exact form, never first in a heading (DECK-GRAMMAR.md:22). */
  tokens?: readonly string[];
  /** The sprite's icon names without the i- prefix, plus gt-mark (icon/known). */
  iconNames?: readonly string[];
  /** Heading case mode, from deck.json (open question 13). Default sentence. */
  headingCase?: 'sentence' | 'title';
  /** The export mode export/non-native lists raster blocks for; false skips the rule. */
  exportMode?: 'native' | 'flatten' | false;
  /** Restrict to these rules. */
  rules?: readonly RuleId[];
  /** Restrict to these slides. */
  slideIds?: readonly SlideId[];
};

/** SPEC 5.1: the proper-noun list and the product tokens of copy.ts, with the names the deck uses. */
export const DEFAULT_PROPER_NOUNS: readonly string[] = [
  'General Translation',
  'Prototemplate',
  'Glyphfield',
  'Locadex',
  'Inter',
  'Heroicons',
  'Paper Shaders',
  'Google',
  'Google Slides',
  'PowerPoint',
  'LibreOffice',
  'GitHub',
  'Chromium',
  'Chrome',
  'Playwright',
  'TanStack',
  'Vercel',
  'Next.js',
  'React',
  'Fumadocs',
  'Wikimedia Commons',
  'Turboslide',
  'Bayer',
  'Lanczos',
  'Metal',
  'SwiftShader',
  'Discord',
  'LinkedIn',
  'Markdown',
  'English',
  'Japanese',
  'Arabic',
  'Devanagari',
  'Sanskrit',
  'Blue Marble',
  'Rosetta Stone',
];
export const DEFAULT_TOKENS: readonly string[] = ['gt-next', 'gt', 'npx', 'CLI', 'API'];

export type BlockRef = {
  slide: Slide;
  slot: SlotName | 'plate';
  block: Block;
  /** JSON pointer of the block inside the slide. */
  path: string;
  index: number;
  /** The composite that holds the block, when it is nested (M5); top-level blocks have none. */
  parent?: Block;
  /**
   * The width available to a nested block in sheet pixels (the composite's track arithmetic), or
   * undefined when the tracks are content sized. Top-level blocks read slotWidths(slide) instead.
   */
  width?: number;
};

export type LintContext = {
  deck: Deck;
  slides: Record<SlideId, Slide>;
  order: SlideId[];
  options: Required<Pick<LintOptions, 'properNouns' | 'tokens' | 'headingCase' | 'exportMode'>> &
    LintOptions;
  slideN: (slideId: SlideId) => number;
  sectionOf: (slideId: SlideId) => Section | undefined;
  slideList: () => Slide[];
  blocksOf: (slide: Slide) => BlockRef[];
  asset: (id: string) => Asset | undefined;
  finding: (rule: RuleId, slideId: SlideId, details: FindingDetails) => Finding;
};

export type FindingDetails = {
  blockId?: string;
  path?: string;
  theme?: 'light' | 'dark';
  text?: string;
  box?: [number, number, number, number];
  measured?: Record<string, number>;
  proposal: string;
  fix?: Mutation[];
  /** Override the table severity (never upward past the table for a gate rule). */
  severity?: Finding['severity'];
};

/** The pointer of a block in a slide: /slots/<slot>/<i> or /plate/blocks/<i>. */
export function blockPath(slot: SlotName | 'plate', index: number): string {
  return slot === 'plate' ? `/plate/blocks/${index}` : `/slots/${slot}/${index}`;
}

export function createContext(input: DeckDocument, options: LintOptions = {}): LintContext {
  const order = slideOrder(input.deck);
  const nOf = new Map(order.map((id, i) => [id, i + 1]));
  const selected = options.slideIds ? new Set(options.slideIds) : null;
  const resolved = {
    ...options,
    properNouns: options.properNouns ?? DEFAULT_PROPER_NOUNS,
    tokens: options.tokens ?? DEFAULT_TOKENS,
    headingCase: options.headingCase ?? 'sentence',
    exportMode: options.exportMode ?? 'native',
  };
  const ctx: LintContext = {
    deck: input.deck,
    slides: input.slides,
    order,
    options: resolved,
    slideN: (slideId) => nOf.get(slideId) ?? 0,
    sectionOf: (slideId) => sectionOfSlide(input.deck, slideId),
    slideList: () =>
      order
        .filter((id) => !selected || selected.has(id))
        .map((id) => input.slides[id])
        .filter((s): s is Slide => s !== undefined),
    blocksOf: (slide) => {
      const perSlot = new Map<string, number>();
      const widths = slotWidths(slide);
      const out: BlockRef[] = [];
      // Every block, top level and nested in composite cells, in document order (M5: a composite is
      // a grid of blocks and each one is linted as itself, with the width its cell gives it).
      const walk = (
        blocks: Block[],
        slot: SlotName | 'plate',
        pathOf: (i: number) => string,
        parent: Block | undefined,
        width: number | undefined,
      ): void => {
        blocks.forEach((block, i) => {
          const ref: BlockRef = { slide, slot, block, path: pathOf(i), index: i };
          if (parent !== undefined) ref.parent = parent;
          // a positioned block on a freeform slide is as wide as its box (docs/freeform.md)
          if (parent === undefined && block.pos !== undefined) ref.width = block.pos.w;
          else if (width !== undefined) ref.width = width;
          out.push(ref);
          if (block.type === 'composite') {
            const cells = cellWidths(block, width);
            block.cells.forEach((cell, c) =>
              walk(cell.blocks, slot, (b) => `${ref.path}/cells/${c}/blocks/${b}`, block, cells[c]),
            );
          }
        });
      };
      const lists = new Map<SlotName | 'plate', Block[]>();
      for (const { slot, block } of slideBlocks(slide)) {
        const list = lists.get(slot) ?? [];
        list.push(block);
        lists.set(slot, list);
      }
      for (const [slot, blocks] of lists) {
        const start = perSlot.get(slot) ?? 0;
        perSlot.set(slot, start + blocks.length);
        walk(blocks, slot, (i) => blockPath(slot, start + i), undefined, widths[slot]);
      }
      return out;
    },
    asset: (id) => input.deck.assets[id],
    finding: (rule, slideId, details) => {
      const table = RULES[rule];
      const finding: Finding = {
        id: findingId({
          rule,
          slideId,
          blockId: details.blockId,
          path: details.path,
          theme: details.theme,
        }),
        rule,
        severity: details.severity ?? table.severity,
        kind: table.kind,
        slideId,
        evidence: {},
        proposal: details.proposal,
        source: 'lint',
      };
      if (details.blockId !== undefined) finding.blockId = details.blockId;
      if (details.path !== undefined) finding.path = details.path;
      if (details.theme !== undefined) finding.theme = details.theme;
      if (details.text !== undefined) finding.evidence.text = details.text;
      if (details.box !== undefined) finding.evidence.box = details.box;
      if (details.measured !== undefined) finding.evidence.measured = details.measured;
      if (details.fix !== undefined && details.fix.length > 0) finding.fix = details.fix;
      return finding;
    },
  };
  return ctx;
}

export type TextRef = {
  path: string;
  text: Text;
  role: 'heading' | 'title' | 'key' | 'value' | 'body' | 'caption' | 'credit' | 'label' | 'other';
};

/** Every Text inside a block with its pointer relative to the block and the role the copy rules read. */
export function blockTexts(block: Block): TextRef[] {
  const out: TextRef[] = [];
  const push = (path: string, text: Text | undefined, role: TextRef['role']): void => {
    if (typeof text === 'string' && text.length > 0) out.push({ path, text, role });
  };
  switch (block.type) {
    case 'heading':
      push('/text', block.text, block.level === 'title' ? 'title' : 'heading');
      break;
    case 'paragraph':
      push('/text', block.text, block.role === 'cap' ? 'caption' : 'body');
      break;
    case 'credit':
      push('/text', block.text, 'credit');
      break;
    case 'rows':
      block.items.forEach((item, i) => {
        push(`/items/${i}/key`, item.key, 'key');
        push(`/items/${i}/value`, item.value, 'value');
      });
      break;
    case 'plain':
      block.items.forEach((item, i) => push(`/items/${i}/text`, item.text, 'body'));
      break;
    case 'refs':
      block.items.forEach((item, i) => push(`/items/${i}`, item, 'body'));
      break;
    case 'say':
      block.items.forEach((item, i) => {
        push(`/items/${i}/quote`, item.quote, 'body');
        push(`/items/${i}/note`, item.note, 'caption');
      });
      break;
    case 'scales':
      block.items.forEach((item, i) => {
        push(`/items/${i}/left`, item.left, 'label');
        push(`/items/${i}/right`, item.right, 'label');
      });
      break;
    case 'spec':
      push('/textRow', block.textRow, 'other');
      break;
    case 'shot':
      push('/caption', block.caption, 'caption');
      break;
    case 'pair':
      block.figures.forEach((figure, i) =>
        push(`/figures/${i}/caption`, figure.caption, 'caption'),
      );
      break;
    case 'tiles':
      block.items.forEach((item, i) => {
        push(`/items/${i}/label`, item.label, 'label');
        push(`/items/${i}/sub`, item.sub, 'label');
      });
      push('/more', block.more, 'label');
      break;
    case 'details':
      block.items.forEach((item, i) => push(`/items/${i}/caption`, item.caption, 'caption'));
      break;
    case 'board':
      block.rows.forEach((row, i) => {
        push(`/rows/${i}/name`, row.name, 'label');
        push(`/rows/${i}/note`, row.note, 'body');
      });
      break;
    case 'matrix':
      push('/caption', block.caption, 'caption');
      break;
    case 'logoPlates':
      block.items.forEach((item, i) => push(`/items/${i}/name`, item.name, 'label'));
      break;
    case 'composite':
      // the cells' blocks are refs of their own (blocksOf walks them, M5); the composite's text is
      // its caption
      push('/caption', block.caption, 'caption');
      break;
    case 'text':
      push('/text', block.text, 'body');
      break;
    case 'box':
      push('/text', block.text, 'body');
      break;
    default:
      break;
  }
  return out;
}

/** The slide-level texts of the fixed compositions: the title slide's heading and lead, the statement's big. */
export function slideTexts(slide: Slide): TextRef[] {
  if (slide.kind === 'title')
    return [
      { path: '/heading', text: slide.heading, role: 'heading' },
      { path: '/lead', text: slide.lead, role: 'body' },
    ];
  if (slide.kind === 'statement') return [{ path: '/big', text: slide.big, role: 'heading' }];
  return [];
}

/** Content-box slot widths in sheet pixels (SPEC 5.2 slot geometry): 1326 wide, cols split by ratio. */
export function slotWidths(slide: Slide): Partial<Record<SlotName | 'plate', number>> {
  const CONTENT = 1326;
  if (slide.kind !== 'content')
    return { plate: slide.kind === 'mood' ? 560 : slide.kind === 'closing' ? 720 : 740 };
  const layout = slide.layout;
  if (layout.type === 'cols') {
    const gap = layout.gap ?? 72;
    const inner = CONTENT - gap;
    let left: number;
    if (layout.ratio === '5/7') left = (inner * 5) / 12;
    else if (layout.ratio === '4/8') left = (inner * 4) / 12;
    else if (layout.ratio === '1/1') left = inner / 2;
    else if ('left' in layout.ratio) left = layout.ratio.left;
    else left = inner - layout.ratio.right;
    return { left, right: inner - left };
  }
  if (layout.type === 'split') {
    if (layout.head !== undefined && layout.head !== 'single') {
      const inner = CONTENT - 72;
      const left = layout.head.cols === '5/7' ? (inner * 5) / 12 : (inner * 4) / 12;
      return { headLeft: left, headRight: inner - left, body: CONTENT };
    }
    return { head: CONTENT, body: CONTENT };
  }
  return { main: CONTENT };
}
