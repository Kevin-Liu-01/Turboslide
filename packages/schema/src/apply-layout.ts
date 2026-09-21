// Apply layout (gslides-parity SPEC 5.5): what happens to an existing slide when a layout is
// applied to it. Google moves placeholder content into the new layout's matching placeholders and
// leaves the rest where it is; it never drops and never refuses (R03 b.3). Roles derive from block
// type and order; there is no role field. The rules, as one pure function:
//
//   the first heading (the title slide's heading, the opener's heading, the statement's big)
//     goes to the new layout's title placeholder;
//   the second text (the title slide's lead, the first paragraph) goes to the first body
//     placeholder; further paragraphs and text blocks are appended to the body slot in order;
//   a list (rows, plain, refs) takes the list placeholder, else the body slot;
//   a table takes the table placeholder, else the body slot;
//   pictures fill the picture placeholders in order; a picture layout takes the first as its
//     background picture; the credit stays on picture layouts and is dropped otherwise;
//   notes, id, skip, tags, ext and the title override are kept;
//   anything left over is appended to the last text slot of a content layout or to the plate of
//     a picture layout, and dropped, with a count, where the target has no block list (Title
//     slide, Main point).
//
// Blocks on a freeform slide keep their `pos` when the target is Blank; when the target is any
// other layout they refile by geometry through convertLayout (docs/freeform.md section 4) and then
// the table applies. A grammar source to Blank runs convertLayout to freeform. Applying the same
// layout resets the placeholders' positions and drops typography, color, fill and stroke overrides,
// because the texts move into the fresh placeholders `make` produces. `template` is written to
// the new layout id. Kind changes are the same slide.replace with a new kind.
import type { Block, TableBlock } from './blocks.ts';
import { EMPTY_ASSET_REF } from './blocks.ts';
import type { ContentSlide, Deck, Layout, LayoutId, Slide, SlotName } from './deck.ts';
import { slideBlocks, slotsForLayout } from './deck.ts';
import { CANVAS_GROUP } from './canvas.ts';
import { convertLayout, readingOrder } from './freeform.ts';
import type { AssetId, BlockId, SlideId } from './ids.ts';
import { derivedLayout, layoutEntry } from './layouts.ts';
import type { LayoutEntry } from './layouts.ts';
import { cloneJson } from './pointer.ts';
import type { Text } from './text.ts';
import { plainText } from './text.ts';

export type ApplyLayoutResult = {
  slide: Slide;
  /** the source blocks that had no place on the target (Title slide and Main point only) */
  dropped: BlockId[];
};

export type ApplyLayoutInput = {
  slide: Slide;
  layout: LayoutId;
  deck: Deck;
  /** the section the slide sits in; an opener target writes it as its sectionId */
  sectionId: string;
};

type Picture = { asset: AssetId; caption?: Text; from: BlockId };

type Extracted = {
  title?: Text;
  titleFrom?: BlockId;
  /** the body texts in reading order; `head` marks a subtitle (the title slide's lead, a two column head's paragraph beside the title) */
  body: { text: Text; from: BlockId; head?: boolean }[];
  lists: Block[];
  tables: TableBlock[];
  pictures: Picture[];
  credit?: Text;
  creditFrom?: BlockId;
  rest: Block[];
};

type PictureSlide = Extract<Slide, { plate: unknown }>;

function isPictureSlide(slide: Slide): slide is PictureSlide {
  return slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing';
}

function isList(block: Block): boolean {
  return block.type === 'rows' || block.type === 'plain' || block.type === 'refs';
}

function isPictureBlock(block: Block): boolean {
  return (
    block.type === 'shot' ||
    block.type === 'picture' ||
    block.type === 'pair' ||
    block.type === 'tiles' ||
    block.type === 'details'
  );
}

/**
 * The plate box of a converted picture kind (gslides-parity SPEC-2 1.2, SPEC 5.5 "The plate box:
 * dropped"): a paper box with no text in the `plate` group; the target layout draws its own plate.
 */
function isPlateBox(block: Block): boolean {
  return (
    block.type === 'box' &&
    (block.text === undefined || block.text === '') &&
    block.pos?.group === CANVAS_GROUP
  );
}

/** A canvas slide without its plate boxes (the refile into a grammar layout drops `pos`, and with it the group). */
function withoutPlateBoxes(slide: ContentSlide): ContentSlide {
  const main = slide.slots.main;
  if (main === undefined || !main.some(isPlateBox)) return slide;
  return { ...slide, slots: { ...slide.slots, main: main.filter((block) => !isPlateBox(block)) } };
}

/** The pictures a figure block carries, in order, with their captions. */
function picturesOf(block: Block): Picture[] {
  switch (block.type) {
    case 'shot':
      return block.asset === EMPTY_ASSET_REF
        ? []
        : [
            {
              asset: block.asset,
              ...(block.caption !== undefined ? { caption: block.caption } : {}),
              from: block.id,
            },
          ];
    // the picture object of a canvas slide is the picture placeholder, or the background picture
    // of a picture layout (SPEC-2 1.2, the row SPEC 5.5 gains)
    case 'picture':
      return block.asset === EMPTY_ASSET_REF ? [] : [{ asset: block.asset, from: block.id }];
    case 'pair':
      return block.figures.flatMap((figure) =>
        figure.assets
          .filter((asset) => asset !== EMPTY_ASSET_REF)
          .map((asset) => ({
            asset,
            ...(figure.caption !== undefined ? { caption: figure.caption } : {}),
            from: block.id,
          })),
      );
    case 'tiles':
      return block.items.flatMap((item) =>
        item.asset === undefined || item.asset === EMPTY_ASSET_REF
          ? []
          : [
              {
                asset: item.asset,
                ...(item.label !== undefined ? { caption: item.label } : {}),
                from: block.id,
              },
            ],
      );
    case 'details':
      return block.items
        .filter((item) => item.asset !== EMPTY_ASSET_REF)
        .map((item) => ({
          asset: item.asset,
          ...(item.caption !== undefined ? { caption: item.caption } : {}),
          from: block.id,
        }));
    default:
      return [];
  }
}

/** The blocks of a slide in reading order: slot order (y then x on freeform) or the plate. */
function orderedBlocks(slide: Slide): Block[] {
  if (slide.kind === 'content') return readingOrder(slide).map((row) => row.block);
  if (isPictureSlide(slide)) return slide.plate.blocks;
  return [];
}

/** A stable JSON of a value (keys sorted, undefined dropped), for the untouched comparison. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, each]) => each !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, each]) => `${JSON.stringify(key)}:${stableJson(each)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The placeholders of the source layout nobody touched: their block ids, and whether the picture is still the starter. */
export type Untouched = { blocks: ReadonlySet<BlockId>; picture: boolean };

const NOTHING_UNTOUCHED: Untouched = { blocks: new Set<BlockId>(), picture: false };

/**
 * The placeholders the source layout placed and nobody touched (docs/FOCUS.md section 5 rank 8;
 * SPEC 5.5): a block with the id and the content, position aside, of the same block in a fresh
 * make of the slide's own layout, and the background picture of a picture layout while it is
 * still the starter the layout took. Google moves what was typed and leaves the layout's own
 * furniture behind; before this rule an untouched Section header carried its starter picture into
 * Title and body as a figure and a Ruled statement list its four empty rows into Title and table
 * (audit-slides rows 59 to 64), and Title slide counted an empty paragraph as a block that did not
 * fit (rows 68 to 70). A slide whose layout needs a picture the deck lacks compares nothing here;
 * its empty text placeholders still leave through `isEmptyText`.
 */
export function untouchedPlaceholders(slide: Slide, deck: Deck, sectionId: string): Untouched {
  let fresh: Slide | null;
  try {
    /* the slide's own layout: its `template` when written, else the entry its shape names
       (SPEC 5.6 derivedLayout), so a slide New slide made before `template` was stamped compares too */
    fresh = layoutEntry(derivedLayout(slide)).make(slide.id, deck, sectionId);
  } catch {
    return NOTHING_UNTOUCHED;
  }
  if (fresh === null) return NOTHING_UNTOUCHED;
  const freshBlocks = new Map(
    slideBlocks(fresh).map(({ block }) => [block.id, stableJson(stripPosition(block))] as const),
  );
  const blocks = new Set<BlockId>();
  const all = slideBlocks(slide);
  for (const { block } of all) {
    if (freshBlocks.get(block.id) === stableJson(stripPosition(block))) blocks.add(block.id);
  }
  /* the starter is the layout's only while nothing else on the slide was touched: a figure a
     person brought to a picture layout became its background, and when it is the deck's starter
     asset the two cannot be told apart, so a slide someone typed on keeps its picture */
  const picture =
    isPictureSlide(slide) &&
    isPictureSlide(fresh) &&
    slide.picture.asset === fresh.picture.asset &&
    all.every(({ block }) => blocks.has(block.id));
  return { blocks, picture };
}

/** True for a text block with nothing typed: an empty placeholder is furniture, not content (SPEC 5.4). */
function isEmptyText(text: Text): boolean {
  return plainText(text).trim() === '';
}

/** Reads the source slide into the roles of SPEC 5.5; the untouched placeholders are not content. */
export function extractContent(slide: Slide, untouched: Untouched = NOTHING_UNTOUCHED): Extracted {
  const out: Extracted = { body: [], lists: [], tables: [], pictures: [], rest: [] };
  if (slide.kind === 'title') {
    if (!isEmptyText(slide.heading)) out.title = slide.heading;
    if (!isEmptyText(slide.lead)) out.body.push({ text: slide.lead, from: 'lead', head: true });
    return out;
  }
  if (slide.kind === 'statement') {
    if (!isEmptyText(slide.big)) out.title = slide.big;
    return out;
  }
  if (isPictureSlide(slide) && !untouched.picture) {
    out.pictures.push({ asset: slide.picture.asset, from: 'picture' });
  }
  /* the paragraph beside the title of a two column head is the slide's subtitle (docs/PRODUCT.md
     section 2 rank 2), and stays one when the next layout has a head paragraph */
  const headParagraphs = new Set(
    slide.kind === 'content' ? (slide.slots.headRight ?? []).map((block) => block.id) : [],
  );
  for (const block of orderedBlocks(slide)) {
    if (isPlateBox(block)) continue;
    if (untouched.blocks.has(block.id)) continue;
    if (block.type === 'heading' && out.title === undefined) {
      if (isEmptyText(block.text)) continue;
      out.title = block.text;
      out.titleFrom = block.id;
      continue;
    }
    if (block.type === 'paragraph' || block.type === 'text') {
      if (!isEmptyText(block.text))
        out.body.push({
          text: block.text,
          from: block.id,
          ...(headParagraphs.has(block.id) ? { head: true } : {}),
        });
      continue;
    }
    if (block.type === 'credit') {
      if (out.credit === undefined && !isEmptyText(block.text)) {
        out.credit = block.text;
        out.creditFrom = block.id;
      }
      continue;
    }
    if (isList(block)) {
      out.lists.push(block);
      continue;
    }
    if (block.type === 'table') {
      out.tables.push(block);
      continue;
    }
    if (isPictureBlock(block)) {
      const pictures = picturesOf(block);
      if (pictures.length === 0) continue;
      out.pictures.push(...pictures);
      continue;
    }
    out.rest.push(block);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Filling the target

type Placed = { slot: SlotName | 'plate'; list: Block[]; index: number };

/** Every block of a content slide with its slot, in slot order. */
function contentBlocks(slide: ContentSlide): Placed[] {
  const out: Placed[] = [];
  for (const slot of slotsForLayout(slide.layout)) {
    const list = slide.slots[slot];
    if (list === undefined) continue;
    list.forEach((_block, index) => out.push({ slot, list, index }));
  }
  return out;
}

function stripPosition(block: Block): Block {
  if (block.pos === undefined) return block;
  const { pos: _pos, ...rest } = block;
  return rest;
}

/** A block with a fresh id when the id is taken. */
function withFreeId(block: Block, taken: Set<string>): Block {
  let id = block.id;
  let n = 2;
  while (taken.has(id)) {
    id = `${block.id}-${n}`;
    n += 1;
  }
  taken.add(id);
  return id === block.id ? block : { ...block, id };
}

/** A list or table as one multiline paragraph, for a plate that takes no list blocks. */
function asParagraph(block: Block, id: BlockId): Block {
  let lines: string[] = [];
  if (block.type === 'rows')
    lines = block.items.map((item) =>
      item.value === '' ? item.key : item.key === '' ? item.value : `${item.key}: ${item.value}`,
    );
  else if (block.type === 'plain') lines = block.items.map((item) => item.text);
  else if (block.type === 'refs') lines = [...block.items];
  else if (block.type === 'table') lines = block.rows.map((row) => row.cells.join('\t'));
  return { id, type: 'paragraph', text: lines.join('\n') };
}

/** A leftover picture as a bordered figure with its caption. */
function asShot(picture: Picture, id: BlockId): Block {
  return {
    id,
    type: 'shot',
    asset: picture.asset,
    fit: 'width',
    ...(picture.caption !== undefined ? { caption: picture.caption } : {}),
  };
}

/** The fields every slide keeps across Apply layout (SPEC 5.5). */
function keptFields(slide: Slide, layout: LayoutId) {
  return {
    ...(slide.title !== undefined ? { title: slide.title } : {}),
    ...(slide.notes !== undefined ? { notes: slide.notes } : {}),
    ...(slide.tags !== undefined ? { tags: slide.tags } : {}),
    ...(slide.skip !== undefined ? { skip: slide.skip } : {}),
    ...(slide.background !== undefined ? { background: slide.background } : {}),
    ...(slide.ext !== undefined ? { ext: slide.ext } : {}),
    template: layout,
  };
}

/**
 * Applies a layout to a slide (SPEC 5.5). Pure: the result is the slide to write with one
 * slide.replace, plus the ids of the source blocks that were dropped.
 */
export function applyLayout(input: ApplyLayoutInput): ApplyLayoutResult {
  const entry = layoutEntry(input.layout);
  const source = cloneJson(input.slide);
  const kept = keptFields(source, entry.id);
  const untouched = untouchedPlaceholders(source, input.deck, input.sectionId);

  // Blank: freeform keeps every box, a grammar source runs through toFreeform, the fixed kinds
  // become a stack first
  if (entry.id === 'blank') {
    const content: ContentSlide =
      source.kind === 'content' ? source : asStack(source, extractContent(source, untouched));
    const converted = convertLayout(content, { type: 'freeform' });
    return { slide: { ...converted, ...kept }, dropped: [] };
  }

  const made = entry.make(source.id, input.deck, input.sectionId);
  if (made === null) {
    throw new RangeError(
      `The ${entry.label} layout needs a picture and the deck has none of the starter roles (opener, mood); add a picture first`,
    );
  }

  // a freeform source refiles by geometry into the target's slots first (SPEC 5.5); the plate box
  // of a converted picture kind leaves before the refile strips the group it is known by
  const refiled =
    source.kind === 'content' && source.layout.type === 'freeform' && made.kind === 'content'
      ? convertLayout(withoutPlateBoxes(source), made.layout)
      : source;
  const extracted = extractContent(refiled, untouched);

  if (made.kind === 'title') {
    const dropped = dropAllBut(extracted, ['title', 'body0']);
    return {
      slide: {
        ...made,
        ...kept,
        heading: extracted.title ?? '',
        lead: extracted.body[0]?.text ?? '',
      },
      dropped,
    };
  }
  if (made.kind === 'statement') {
    const dropped = dropAllBut(extracted, extracted.title === undefined ? ['body0'] : ['title']);
    return {
      slide: { ...made, ...kept, big: extracted.title ?? extracted.body[0]?.text ?? '' },
      dropped,
    };
  }
  if (isPictureSlide(made)) {
    return { slide: fillPlate(made, extracted, input.deck, kept), dropped: [] };
  }
  return { slide: fillContent(made, extracted, kept), dropped: [] };
}

/** The ids of every source block outside the roles a fixed layout keeps. */
function dropAllBut(extracted: Extracted, keep: ReadonlyArray<'title' | 'body0'>): BlockId[] {
  const dropped = new Set<BlockId>();
  if (!keep.includes('title') && extracted.titleFrom !== undefined)
    dropped.add(extracted.titleFrom);
  extracted.body.forEach((row, index) => {
    if (index === 0 && keep.includes('body0')) return;
    if (row.from !== 'lead') dropped.add(row.from);
  });
  for (const block of extracted.lists) dropped.add(block.id);
  for (const block of extracted.tables) dropped.add(block.id);
  for (const picture of extracted.pictures)
    if (picture.from !== 'picture') dropped.add(picture.from);
  for (const block of extracted.rest) dropped.add(block.id);
  return [...dropped];
}

/** The fixed kinds as a stack of blocks, the form convertLayout takes to freeform. */
function asStack(slide: Slide, extracted: Extracted): ContentSlide {
  const main: Block[] = [];
  const taken = new Set<string>();
  if (extracted.title !== undefined) {
    const level = slide.kind === 'title' ? 'h1' : slide.kind === 'statement' ? 'big' : 'big';
    main.push({ id: 'h', type: 'heading', level, text: extracted.title });
    taken.add('h');
  }
  extracted.body.forEach((row, index) => {
    const block: Block = { id: `p${index + 1}`, type: 'paragraph', text: row.text, measure: 56 };
    main.push(withFreeId(block, taken));
  });
  for (const block of extracted.lists) main.push(withFreeId(stripPosition(block), taken));
  for (const block of extracted.tables) main.push(withFreeId(stripPosition(block), taken));
  extracted.pictures.forEach((picture, index) => {
    if (picture.from === 'picture') return;
    main.push(withFreeId(asShot(picture, `fig${index + 1}`), taken));
  });
  for (const block of extracted.rest) main.push(withFreeId(stripPosition(block), taken));
  return {
    schemaVersion: 1,
    id: slide.id,
    kind: 'content',
    layout: { type: 'stack', gap: 22 },
    slots: { main },
  };
}

/** Fills a content layout's placeholders and appends what is left to the last text slot. */
function fillContent(
  made: ContentSlide,
  extracted: Extracted,
  kept: ReturnType<typeof keptFields>,
): ContentSlide {
  const target: ContentSlide = { ...made, ...kept };
  const placed = contentBlocks(target);
  const taken = new Set(placed.map(({ list, index }) => list[index]?.id ?? ''));
  const slots = slotsForLayout(target.layout);

  // the title placeholder: the first heading in slot order
  const titleSlot = placed.find(({ list, index }) => list[index]?.type === 'heading');
  if (titleSlot !== undefined && extracted.title !== undefined) {
    const block = titleSlot.list[titleSlot.index];
    if (block?.type === 'heading') block.text = extracted.title;
  } else if (extracted.title !== undefined && extracted.title !== '') {
    // no heading placeholder: the title is the first body text
    extracted.body.unshift({ text: extracted.title, from: extracted.titleFrom ?? 'h' });
  }

  // the head paragraph beside the title (a two column head's headRight, the subtitle of
  // docs/PRODUCT.md section 2 rank 2) takes a subtitle alone: the source's lead or its own head
  // paragraph, never a body paragraph, so Title and body's text lands in the body of Title,
  // subtitle and body and the subtitle keeps its prompt (the product round's gate, slide 102)
  const headParagraphIds = new Set((target.slots.headRight ?? []).map((block) => block.id));
  const isText = ({ list, index }: Placed) =>
    list[index]?.type === 'paragraph' || list[index]?.type === 'text';
  const headSlots = placed.filter(
    (slot) => isText(slot) && headParagraphIds.has(slot.list[slot.index]?.id ?? ''),
  );
  const bodyTexts = [...extracted.body];
  for (const slot of headSlots) {
    const at = bodyTexts.findIndex((row) => row.head === true);
    if (at < 0) break;
    const [next] = bodyTexts.splice(at, 1);
    const block = slot.list[slot.index];
    if (next !== undefined && (block?.type === 'paragraph' || block?.type === 'text'))
      block.text = next.text;
  }
  // the body placeholders: paragraphs and text boxes in slot order
  const bodySlots = placed.filter(
    (slot) => isText(slot) && !headParagraphIds.has(slot.list[slot.index]?.id ?? ''),
  );
  for (const slot of bodySlots) {
    const next = bodyTexts.shift();
    if (next === undefined) break;
    const block = slot.list[slot.index];
    if (block?.type === 'paragraph' || block?.type === 'text') block.text = next.text;
  }

  // the slot appended content lands in: the last paragraph placeholder's slot, else the last
  // filled slot, else the layout's first slot
  const lastBody = bodySlots[bodySlots.length - 1];
  const lastFilled = placed[placed.length - 1];
  const appendSlot: SlotName =
    (lastBody?.slot as SlotName | undefined) ??
    (lastFilled?.slot as SlotName | undefined) ??
    slots[0] ??
    'main';
  const append = (block: Block): void => {
    const list = (target.slots[appendSlot] ??= []);
    list.push(withFreeId(stripPosition(block), taken));
  };
  let extra = 1;
  const appendText = (text: Text): void => {
    append({ id: `p-more-${extra}`, type: 'paragraph', text, measure: 56 });
    extra += 1;
  };
  // an empty placeholder with no home is not content: nothing is appended for it
  for (const row of bodyTexts) if (row.text !== '') appendText(row.text);

  // lists and tables take their placeholders in order, else the body slot
  const listSlots = placed.filter(({ list, index }) => isList(list[index] as Block));
  const lists = [...extracted.lists];
  for (const slot of listSlots) {
    const next = lists.shift();
    if (next === undefined) break;
    const placeholder = slot.list[slot.index];
    if (placeholder !== undefined)
      slot.list[slot.index] = { ...stripPosition(next), id: placeholder.id };
  }
  for (const block of lists) append(block);
  const tableSlots = placed.filter(({ list, index }) => list[index]?.type === 'table');
  const tables = [...extracted.tables];
  for (const slot of tableSlots) {
    const next = tables.shift();
    if (next === undefined) break;
    const placeholder = slot.list[slot.index];
    if (placeholder !== undefined)
      slot.list[slot.index] = { ...stripPosition(next), id: placeholder.id };
  }
  for (const block of tables) append(block);

  // pictures fill the figure placeholders in order
  const pictures = [...extracted.pictures];
  for (const { list, index } of placed) {
    const block = list[index];
    if (block === undefined || pictures.length === 0) continue;
    if (block.type === 'shot' && block.asset === EMPTY_ASSET_REF) {
      const picture = pictures.shift();
      if (picture === undefined) break;
      block.asset = picture.asset;
      if (picture.caption !== undefined) block.caption = picture.caption;
    } else if (block.type === 'pair') {
      for (const figure of block.figures) {
        if (pictures.length === 0) break;
        if (figure.assets[0] === EMPTY_ASSET_REF) {
          const picture = pictures.shift();
          if (picture === undefined) break;
          figure.assets = [picture.asset];
          if (picture.caption !== undefined) figure.caption = picture.caption;
        }
      }
    } else if (block.type === 'tiles') {
      for (const item of block.items) {
        if (pictures.length === 0) break;
        if (item.asset === undefined || item.asset === EMPTY_ASSET_REF) {
          const picture = pictures.shift();
          if (picture === undefined) break;
          item.asset = picture.asset;
          if (picture.caption !== undefined) item.label = plainText(picture.caption);
        }
      }
    } else if (block.type === 'details') {
      for (const item of block.items) {
        if (pictures.length === 0) break;
        if (item.asset === EMPTY_ASSET_REF) {
          const picture = pictures.shift();
          if (picture === undefined) break;
          item.asset = picture.asset;
          if (picture.caption !== undefined) item.caption = picture.caption;
        }
      }
    }
  }
  pictures.forEach((picture, index) => append(asShot(picture, `fig-more-${index + 1}`)));

  // the rest, as it is; the credit is dropped on a content layout
  for (const block of extracted.rest) append(block);
  return target;
}

/** Fills a picture layout's plate and takes the first picture as the background. */
function fillPlate(
  made: PictureSlide,
  extracted: Extracted,
  deck: Deck,
  kept: ReturnType<typeof keptFields>,
): Slide {
  const target = { ...made, ...kept } as PictureSlide;
  const blocks = target.plate.blocks;
  const taken = new Set(blocks.map((block) => block.id));
  const first = extracted.pictures[0];
  if (first !== undefined) {
    target.picture = { ...target.picture, asset: first.asset };
    const credit = extracted.credit ?? deck.assets[first.asset]?.credit;
    const creditBlock = blocks.find((block) => block.type === 'credit');
    if (creditBlock?.type === 'credit') creditBlock.text = credit ?? '';
  }
  const headingBlock = blocks.find((block) => block.type === 'heading');
  if (headingBlock?.type === 'heading' && extracted.title !== undefined)
    headingBlock.text = extracted.title;
  const body = [...extracted.body];
  const paragraphBlock = blocks.find((block) => block.type === 'paragraph');
  const firstBody = body.shift();
  if (paragraphBlock?.type === 'paragraph' && firstBody !== undefined)
    paragraphBlock.text = firstBody.text;
  else if (firstBody !== undefined) body.unshift(firstBody);
  // the plate's credit stays last: appended blocks go before it
  const creditIndex = blocks.findIndex((block) => block.type === 'credit');
  const insertAt = creditIndex < 0 ? blocks.length : creditIndex;
  const appended: Block[] = [];
  let extra = 1;
  const nextId = (stem: string): BlockId => {
    let id = `${stem}-more-${extra}`;
    extra += 1;
    while (taken.has(id)) {
      id = `${stem}-more-${extra}`;
      extra += 1;
    }
    taken.add(id);
    return id;
  };
  for (const row of body) {
    if (row.text === '') continue;
    appended.push({ id: nextId('p'), type: 'paragraph', text: row.text, measure: 56 });
  }
  for (const block of [...extracted.lists, ...extracted.tables])
    appended.push(asParagraph(block, nextId('p')));
  extracted.pictures.slice(1).forEach((picture) => appended.push(asShot(picture, nextId('fig'))));
  for (const block of extracted.rest) {
    if (
      block.type === 'heading' ||
      block.type === 'text' ||
      block.type === 'mark' ||
      block.type === 'html'
    )
      appended.push(withFreeId(stripPosition(block), taken));
    else appended.push(withFreeId(stripPosition(block), taken));
  }
  blocks.splice(insertAt, 0, ...appended);
  return target;
}

/** The entry an applied layout maps to, for callers that show the label ("Applied Main point"). */
export function appliedLabel(layout: LayoutId): string {
  return layoutEntry(layout).label;
}

/** The layout value a target content entry produces, for callers that need it without a slide. */
export function layoutOf(entry: LayoutEntry, deck: Deck, sectionId: string): Layout | undefined {
  const made = entry.make('probe', deck, sectionId);
  return made?.kind === 'content' ? made.layout : undefined;
}

/** Applies one layout to several slides, in order; the result per slide. */
export function applyLayoutToSlides(
  slides: ReadonlyArray<{ slide: Slide; sectionId: string }>,
  layout: LayoutId,
  deck: Deck,
): { slideId: SlideId; result: ApplyLayoutResult }[] {
  return slides.map(({ slide, sectionId }) => ({
    slideId: slide.id,
    result: applyLayout({ slide, layout, deck, sectionId }),
  }));
}
