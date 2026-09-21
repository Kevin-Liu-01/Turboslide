import { textTargets } from '@turboslide/cli/store-actions';
import type { AssistCard, AssistRow } from '@turboslide/schema/actions';
import { assistCardSchema } from '@turboslide/schema/actions';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { ConflictError } from '@turboslide/schema/errors';
import { assistMark, withAssistMark, withoutAssistMark } from '@turboslide/schema/ext';
import type { Author, Mutation } from '@turboslide/schema/mutations';
import { ASSISTANT_NAME } from '@turboslide/store/store';

/**
 * The pure half of Accept (docs/PRODUCT.md 6.1, 6.2, 6.4), shared by the seller's page (the
 * controller's `acceptAssist`, which commits the plan through the editor's own commit so it is
 * one undo step on the seller's stack) and the server (`server/assist.ts`, after the signature
 * check the page cannot make): the card's rows re based on the document as it stands, the
 * mutations to write, and the `ext.assist` mark on each written block or slide. No node import,
 * so the editor's chunk can carry it.
 */

export const ASSIST_STALE_SENTENCE = 'The slide changed while this was written; ask again';

const NOTES_PATH = '/notes';

/** A text of a slide the assistant may rewrite: its key, the text and the mutation that writes it. */
export type AssistTarget = {
  /** `<blockId>|<path>` for a block text, `|<path>` for a slide field; the model's target word */
  key: string;
  slideId: string;
  blockId?: string;
  path: string;
  text: string;
  write: (text: string) => Mutation;
};

/**
 * Every rewritable text of a slide but the notes, through the traversal Find and replace uses
 * (`textTargets`), turned into the card's addressing. A `block.set` on a nested block's text
 * (a table cell, a composite) keeps the top level block as the address.
 */
export function assistTargets(slide: Slide): AssistTarget[] {
  const out: AssistTarget[] = [];
  for (const target of textTargets(slide)) {
    const probe = target.write('');
    if (probe.op === 'slide.set') {
      if (probe.path === NOTES_PATH) continue;
      out.push({
        key: `|${probe.path}`,
        slideId: slide.id,
        path: probe.path,
        text: target.text,
        write: (text) => ({ op: 'slide.set', slideId: slide.id, path: probe.path, value: text }),
      });
      continue;
    }
    if (probe.op === 'block.set') {
      const blockId = probe.blockId;
      const path = probe.path;
      out.push({
        key: `${blockId}|${path}`,
        slideId: slide.id,
        blockId,
        path,
        text: target.text,
        write: (text) => ({ op: 'block.set', slideId: slide.id, blockId, path, value: text }),
      });
    }
  }
  return out;
}

/** The target a card row names, on the slide as it stands now; undefined when the slide lost it. */
export function targetOfRow(slide: Slide, row: AssistRow): AssistTarget | undefined {
  const key = `${row.blockId ?? ''}|${row.path}`;
  return assistTargets(slide).find((target) => target.key === key);
}

/** The top level block of a slide by id, for its `ext`. */
export function topBlockOf(
  slide: Slide,
  blockId: string,
): { ext?: Record<string, unknown> } | undefined {
  const lists =
    slide.kind === 'content'
      ? Object.values(slide.slots)
      : slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing'
        ? [slide.plate.blocks]
        : [];
  for (const list of lists) for (const block of list) if (block.id === blockId) return block;
  return undefined;
}

export type AcceptedPlan = {
  /** the mutations to write as one Write, the marks of 6.1 included */
  mutations: Mutation[];
  slideIds: string[];
  sentence: string;
  /** the assistant's author for a server side write; the page writes under its own session */
  author: Author;
  card: AssistCard;
};

/**
 * What Accept writes: the card parsed, re based on the document as it stands when its texts are
 * unchanged and refused with the stale sentence otherwise, then the mutations with the
 * `ext.assist` mark on each written block or slide. The signature is the server's check
 * (`server/assist.ts` verifies before it calls this); the page trusts the card the server handed
 * it minutes ago and the server verifies again on the write path of the other transports.
 */
export function planAcceptedCard(
  document: DeckDocument,
  rawCard: unknown,
  options: { now?: Date; runId?: string } = {},
): AcceptedPlan {
  const parsed = assistCardSchema.safeParse(rawCard);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new TypeError(
      `assist.accept: invalid card at /${first?.path.map(String).join('/') ?? ''}: ${first?.message ?? 'invalid'}`,
    );
  }
  const card = parsed.data;
  const now = options.now ?? new Date();
  const runId = options.runId ?? card.id;
  const mark = { at: now.toISOString(), runId, card: card.id };
  const stale = () =>
    new ConflictError(ASSIST_STALE_SENTENCE, {
      currentRevision: document.deck.revision,
      current: document,
    });
  const moved = card.baseRevision !== document.deck.revision;
  const mutations: Mutation[] = [];
  const slideIds: string[] = [];
  for (const row of card.rows) {
    const slide = document.slides[row.slideId];
    if (slide === undefined) throw stale();
    if (row.path === NOTES_PATH && row.blockId === undefined) {
      const current = slide.notes ?? '';
      if (moved && current !== row.before) throw stale();
      mutations.push({ op: 'slide.set', slideId: slide.id, path: NOTES_PATH, value: row.after });
      mutations.push({
        op: 'slide.set',
        slideId: slide.id,
        path: '/ext',
        value: withAssistMark(slide.ext, mark),
      });
    } else {
      const target = targetOfRow(slide, row);
      if (target === undefined || (moved && target.text !== row.before)) throw stale();
      mutations.push(target.write(row.after));
      if (target.blockId === undefined) {
        mutations.push({
          op: 'slide.set',
          slideId: slide.id,
          path: '/ext',
          value: withAssistMark(slide.ext, mark),
        });
      } else {
        const block = topBlockOf(slide, target.blockId);
        mutations.push({
          op: 'block.set',
          slideId: slide.id,
          blockId: target.blockId,
          path: '/ext',
          value: withAssistMark(block?.ext, mark),
        });
      }
    }
    if (!slideIds.includes(slide.id)) slideIds.push(slide.id);
  }
  if (mutations.length === 0) throw stale();
  return {
    mutations,
    slideIds,
    sentence: card.sentence,
    author: { kind: 'agent', name: ASSISTANT_NAME, runId, principalId: `agent:${runId}` },
    card,
  };
}

/**
 * The seller's next edit of an assisted block clears its mark (6.1 "until the seller edits the
 * block"): for every mutation of a write that touches a block or a slide field carrying
 * `ext.assist`, one more mutation removes the mark, in the same write. A write that is itself
 * an `/ext` write (an Accept) is left alone.
 */
export function withAssistClear(
  document: DeckDocument,
  mutations: ReadonlyArray<Mutation>,
): Mutation[] {
  const out: Mutation[] = [...mutations];
  const cleared = new Set<string>();
  for (const mutation of mutations) {
    if (!('slideId' in mutation)) continue;
    const slide = document.slides[mutation.slideId];
    if (slide === undefined) continue;
    if ('blockId' in mutation && typeof mutation.blockId === 'string') {
      if (mutation.op === 'block.set' && mutation.path === '/ext') continue;
      const key = `${slide.id}#${mutation.blockId}`;
      if (cleared.has(key)) continue;
      const block = topBlockOf(slide, mutation.blockId);
      if (block === undefined || assistMark(block.ext) === undefined) continue;
      cleared.add(key);
      const rest = withoutAssistMark(block.ext);
      out.push({
        op: 'block.set',
        slideId: slide.id,
        blockId: mutation.blockId,
        path: '/ext',
        ...(rest === undefined ? {} : { value: rest }),
      });
      continue;
    }
    if (mutation.op === 'slide.set') {
      if (mutation.path === '/ext' || mutation.path === '/skip') continue;
      if (cleared.has(slide.id) || assistMark(slide.ext) === undefined) continue;
      cleared.add(slide.id);
      const rest = withoutAssistMark(slide.ext);
      out.push({
        op: 'slide.set',
        slideId: slide.id,
        path: '/ext',
        ...(rest === undefined ? {} : { value: rest }),
      });
    }
  }
  return out;
}
