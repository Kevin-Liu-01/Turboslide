// diffDecks (SPEC 4.4): a mutation list from two documents, so `turboslide diff`, the version
// list and the judge loop speak one language. Applying diffDecks(a, b) to a with applyMutations
// yields b (the reducer's test pins this). Emitted in an order the reducer accepts: manifest
// fields, assets, slide removals, sections, slide insertions, slide edits, the final section order.
import type { Block } from './blocks.ts';
import type { DeckDocument, Section, Slide } from './deck.ts';
import type { BlockId, SlideId } from './ids.ts';
import type { BlockSlot, Mutation } from './mutations.ts';
import { cloneJson, jsonEqual } from './pointer.ts';

type Fields = Record<string, unknown>;

function fields(value: unknown): Fields {
  return value as Fields;
}

/** slide.set or deck.set mutations for the top-level fields that differ, excluding `skip`. */
function fieldDiffs(
  a: Fields,
  b: Fields,
  skip: ReadonlySet<string>,
  make: (path: string, value: unknown, present: boolean) => Mutation,
): Mutation[] {
  const out: Mutation[] = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of [...keys].sort()) {
    if (skip.has(key)) continue;
    const inB = b[key] !== undefined;
    if (!jsonEqual(a[key], b[key]))
      out.push(make(`/${key}`, inB ? cloneJson(b[key]) : undefined, inB));
  }
  return out;
}

type Placed = { slot: BlockSlot; block: Block };

function placedBlocks(slide: Slide): Placed[] {
  if (slide.kind === 'content') {
    return Object.entries(slide.slots).flatMap(([slot, blocks]) =>
      blocks.map((block) => ({ slot: slot as BlockSlot, block })),
    );
  }
  if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing') {
    return slide.plate.blocks.map((block) => ({ slot: 'plate' as const, block }));
  }
  return [];
}

function slotOrder(slide: Slide): Map<BlockSlot, BlockId[]> {
  const out = new Map<BlockSlot, BlockId[]>();
  for (const { slot, block } of placedBlocks(slide)) {
    const list = out.get(slot) ?? [];
    list.push(block.id);
    out.set(slot, list);
  }
  return out;
}

/** Block-level mutations that turn slide a's blocks into slide b's, simulated on id lists. */
function diffBlocks(slideId: SlideId, a: Slide, b: Slide): Mutation[] {
  const out: Mutation[] = [];
  const aBlocks = new Map(placedBlocks(a).map((row) => [row.block.id, row]));
  const bBlocks = new Map(placedBlocks(b).map((row) => [row.block.id, row]));
  const working = slotOrder(a);
  const remove = (id: BlockId): void => {
    for (const list of working.values()) {
      const index = list.indexOf(id);
      if (index >= 0) list.splice(index, 1);
    }
  };
  const place = (slot: BlockSlot, id: BlockId, after: BlockId | undefined): void => {
    const list = working.get(slot) ?? [];
    working.set(slot, list);
    const index = after === undefined ? -1 : list.indexOf(after);
    list.splice(index + 1, 0, id);
  };

  // Removals, type changes (a remove now and an insert below) and same-type property edits.
  for (const [id, row] of aBlocks) {
    const target = bBlocks.get(id);
    if (target === undefined || target.block.type !== row.block.type) {
      out.push({ op: 'block.remove', slideId, blockId: id });
      remove(id);
      continue;
    }
    out.push(
      ...fieldDiffs(
        fields(row.block),
        fields(target.block),
        new Set(['id']),
        (path, value, present) => ({
          op: 'block.set',
          slideId,
          blockId: id,
          path,
          ...(present ? { value } : {}),
        }),
      ),
    );
    if (row.slot !== target.slot) {
      out.push({ op: 'block.move', slideId, blockId: id, slot: target.slot });
      remove(id);
      place(target.slot, id, undefined);
    }
  }

  // Insertions and ordering, slot by slot in b's order.
  for (const [slot, ids] of slotOrder(b)) {
    const list = working.get(slot) ?? [];
    working.set(slot, list);
    ids.forEach((id, index) => {
      const after = index > 0 ? ids[index - 1] : undefined;
      if (!list.includes(id)) {
        const target = bBlocks.get(id);
        if (target === undefined) return;
        out.push({
          op: 'block.insert',
          slideId,
          slot,
          ...(after !== undefined ? { after } : {}),
          block: cloneJson(target.block),
        });
        place(slot, id, after);
        return;
      }
      if (list[index] !== id) {
        out.push({
          op: 'block.move',
          slideId,
          blockId: id,
          slot,
          ...(after !== undefined ? { after } : {}),
        });
        remove(id);
        place(slot, id, after);
      }
    });
  }

  // A slot that b no longer lists loses its key once its blocks are gone.
  if (a.kind === 'content' && b.kind === 'content') {
    for (const slot of Object.keys(a.slots)) {
      if (!(slot in b.slots)) out.push({ op: 'slide.set', slideId, path: `/slots/${slot}` });
    }
  }
  return out;
}

const SLIDE_SKIP = new Set(['id', 'schemaVersion', 'kind', 'slots', 'plate']);

function diffSlide(a: Slide, b: Slide): Mutation[] {
  if (a.kind !== b.kind) return [{ op: 'slide.replace', slideId: a.id, slide: cloneJson(b) }];
  // A content slide whose layout type changed (a split layout converted to a freeform canvas since
  // the version, or the way back) is replaced whole too: the slot names follow the layout, so a
  // field by field diff cannot be applied in both directions (its inverse re inserts the canvas's
  // blocks into `main` while the layout is still `split`, the mechanism the product round's ship
  // step read on `versions.undo-restore`: "Slot main is not in layout split"); a slide.replace
  // inverts to a slide.replace with the old slide, valid in either order.
  if (a.kind === 'content' && b.kind === 'content' && a.layout.type !== b.layout.type)
    return [{ op: 'slide.replace', slideId: a.id, slide: cloneJson(b) }];
  const out: Mutation[] = fieldDiffs(fields(a), fields(b), SLIDE_SKIP, (path, value, present) => ({
    op: 'slide.set',
    slideId: a.id,
    path,
    ...(present ? { value } : {}),
  }));
  if ('plate' in a && 'plate' in b) {
    if (a.plate.side !== b.plate.side)
      out.push({ op: 'slide.set', slideId: a.id, path: '/plate/side', value: b.plate.side });
    if (a.plate.maxWidth !== b.plate.maxWidth) {
      out.push({
        op: 'slide.set',
        slideId: a.id,
        path: '/plate/maxWidth',
        value: b.plate.maxWidth,
      });
    }
  }
  out.push(...diffBlocks(a.id, a, b));
  return out;
}

/** Sections filtered to the slide ids present, keeping order, for the intermediate section.set. */
function sectionsFor(sections: ReadonlyArray<Section>, present: ReadonlySet<SlideId>): Section[] {
  return sections.map((section) => ({
    id: section.id,
    name: section.name,
    slideIds: section.slideIds.filter((id) => present.has(id)),
  }));
}

function sectionsShape(sections: ReadonlyArray<Section>): string {
  return JSON.stringify(sections.map((section) => [section.id, section.name]));
}

/** The mutation list that turns document a into document b. */
export function diffDecks(a: DeckDocument, b: DeckDocument): Mutation[] {
  const out: Mutation[] = [];

  // Manifest fields other than sections, assets, revision and timestamps. The brand kit record
  // is one of them (docs/PRODUCT.md 4.1): a restore of an earlier version takes the kit back
  // with it, so Version history's row before a kit change restores the colour (the row
  // brand.colors.version-history-entry; before this the record stayed as it was).
  out.push(
    ...fieldDiffs(
      { title: a.deck.title, theme: a.deck.theme, defaults: a.deck.defaults, brand: a.deck.brand },
      { title: b.deck.title, theme: b.deck.theme, defaults: b.deck.defaults, brand: b.deck.brand },
      new Set(),
      (path, value, present) => ({ op: 'deck.set', path, ...(present ? { value } : {}) }),
    ),
  );

  // Assets.
  for (const id of Object.keys(a.deck.assets).sort()) {
    if (b.deck.assets[id] === undefined) out.push({ op: 'asset.remove', assetId: id });
  }
  for (const id of Object.keys(b.deck.assets).sort()) {
    const asset = b.deck.assets[id];
    if (asset !== undefined && !jsonEqual(a.deck.assets[id], asset))
      out.push({ op: 'asset.set', asset: cloneJson(asset) });
  }

  // Slides removed.
  const working = new Set(Object.keys(a.slides));
  for (const id of Object.keys(a.slides).sort()) {
    if (b.slides[id] === undefined) {
      out.push({ op: 'slide.remove', slideId: id });
      working.delete(id);
    }
  }

  // Sections: make the shape (ids and names) match b before inserting into them.
  let sections: Section[] = sectionsFor(a.deck.sections, working);
  if (sectionsShape(sections) !== sectionsShape(b.deck.sections)) {
    sections = sectionsFor(b.deck.sections, working);
    out.push({ op: 'section.set', sections: cloneJson(sections) });
  }

  // Slides inserted, in b's order, after the previous slide already present in the section.
  for (const section of b.deck.sections) {
    const target = sections.find((row) => row.id === section.id);
    if (target === undefined) continue;
    section.slideIds.forEach((id, index) => {
      if (working.has(id)) return;
      const slide = b.slides[id];
      if (slide === undefined) return;
      const after = index > 0 ? section.slideIds[index - 1] : undefined;
      const afterPresent =
        after !== undefined && target.slideIds.includes(after) ? after : undefined;
      out.push({
        op: 'slide.insert',
        sectionId: section.id,
        ...(afterPresent !== undefined ? { after: afterPresent } : {}),
        slide: cloneJson(slide),
      });
      const at = afterPresent === undefined ? -1 : target.slideIds.indexOf(afterPresent);
      target.slideIds.splice(at + 1, 0, id);
      working.add(id);
    });
  }

  // Slides in both.
  for (const id of Object.keys(a.slides).sort()) {
    const before = a.slides[id];
    const after = b.slides[id];
    if (before !== undefined && after !== undefined) out.push(...diffSlide(before, after));
  }

  // The final order.
  if (!jsonEqual(sections, b.deck.sections))
    out.push({ op: 'section.set', sections: cloneJson(b.deck.sections) });

  return out;
}

function characters(n: number): string {
  return `${n} character${n === 1 ? '' : 's'}`;
}

/** One line of plain prose per mutation, for `turboslide diff` and the version list (SPEC 7.2). */
export function describeMutation(mutation: Mutation): string {
  switch (mutation.op) {
    case 'slide.insert':
      return `slide ${mutation.slide.id}: inserted in section ${mutation.sectionId}${mutation.after !== undefined ? ` after ${mutation.after}` : ' first'}`;
    case 'slide.remove':
      return `slide ${mutation.slideId}: removed`;
    case 'slide.move':
      return `slide ${mutation.slideId}: moved to section ${mutation.sectionId}${mutation.after !== undefined ? ` after ${mutation.after}` : ' first'}`;
    case 'slide.set':
      return `slide ${mutation.slideId}: ${mutation.path} ${mutation.value === undefined ? 'removed' : 'set'}`;
    case 'slide.replace':
      return `slide ${mutation.slideId}: replaced`;
    case 'block.insert':
      return `slide ${mutation.slideId}: block ${mutation.block.id} (${mutation.block.type}) inserted in ${mutation.slot}`;
    case 'block.remove':
      return `slide ${mutation.slideId}: block ${mutation.blockId} removed`;
    case 'block.move':
      return `slide ${mutation.slideId}: block ${mutation.blockId} moved to ${mutation.slot}${mutation.after !== undefined ? ` after ${mutation.after}` : ' first'}${mutation.z !== undefined ? ` at z ${mutation.z}` : ''}`;
    case 'block.set':
      return `slide ${mutation.slideId}: block ${mutation.blockId} ${mutation.path} ${mutation.value === undefined ? 'removed' : 'changed'}`;
    case 'text.replace':
      return `slide ${mutation.slideId}: block ${mutation.blockId} ${mutation.path} text changed`;
    case 'text.splice': {
      const where = `slide ${mutation.slideId}: block ${mutation.blockId} ${mutation.path}`;
      if (mutation.remove === 0)
        return `${where} inserted ${characters(mutation.insert.length)} at ${mutation.at}`;
      if (mutation.insert === '')
        return `${where} deleted ${characters(mutation.remove)} at ${mutation.at}`;
      return `${where} replaced ${characters(mutation.remove)} with ${characters(mutation.insert.length)} at ${mutation.at}`;
    }
    case 'text.mark': {
      const where = `slide ${mutation.slideId}: block ${mutation.blockId} ${mutation.path}`;
      const span = `${mutation.range[0]}:${mutation.range[1]}`;
      if (mutation.edit.kind === 'case')
        return `${where} case changed to ${mutation.edit.mode} over ${span}`;
      const parts: string[] = [];
      const set = Object.keys(mutation.edit.set ?? {});
      if (set.length > 0) parts.push(`set ${set.join(', ')}`);
      if (mutation.edit.clear !== undefined && mutation.edit.clear.length > 0)
        parts.push(`cleared ${mutation.edit.clear.join(', ')}`);
      return `${where} marks ${parts.length > 0 ? parts.join('; ') : 'unchanged'} over ${span}`;
    }
    case 'section.set':
      return `sections: ${mutation.sections.map((section) => section.id).join(', ')}`;
    case 'asset.set':
      return `asset ${mutation.asset.id}: set`;
    case 'asset.remove':
      return `asset ${mutation.assetId}: removed`;
    case 'deck.set':
      return `deck: ${mutation.path} ${mutation.value === undefined ? 'removed' : 'set'}`;
    case 'version.restore':
      return `restored version ${mutation.n}`;
  }
}
