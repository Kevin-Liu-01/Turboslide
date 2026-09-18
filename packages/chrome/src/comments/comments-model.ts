import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideOrder } from '@turboslide/schema/deck';
import type { Box } from '@turboslide/schema/render';

import type {
  CommentAnchorView,
  CommentBodyInput,
  CommentThreadView,
  CommentView,
  EditorSelection,
  IdentityView,
} from '../editor-shell';
import { COMMENTS } from '../menus/strings';

/**
 * The comment surfaces' pure rules (gslides-parity SPEC-3 5.3, 5.4; research 08 sections 4, 9):
 * the anchor a new card takes from the selection (the block, the text range when a range is
 * selected, the cell, else the slide), the panel's order (open threads by last activity newest
 * first, resolved after them; Slide order for a review pass), its filters (All, Open, Resolved;
 * For you; the search over text and author), the canvas order the `j` and `k` chords walk, the
 * marker's place at the anchored box, the count per slide, a body's text split into text and
 * mention segments for React text nodes, the reply box's `@` tokens into the stored `{@n}` form
 * and the autocomplete's candidates, and the tabular relative times. No React, no DOM.
 */

export type CommentsFilter = 'all' | 'open' | 'resolved';
export type CommentsOrder = 'activity' | 'slide';

/**
 * True when `blockId` names a block a comment can anchor on, by the rule of the schema's
 * `resolveAnchor` (`locateTopBlock`): a slot block of a content slide or a plate block of an
 * opener, mood or closing slide. A title or a statement slide's runs (the heading and lead of the
 * blank template's one slide, the big number) are slide fields, not blocks, so a selection there
 * names no block at all; without the slide the answer is true, the parity rounds' reading.
 */
export function slideHasBlock(slide: Slide | undefined, blockId: string): boolean {
  if (slide === undefined) return true;
  if (slide.kind === 'content') {
    return Object.values(slide.slots).some(
      (list) => list !== undefined && list.some((block) => block.id === blockId),
    );
  }
  if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing') {
    return slide.plate.blocks.some((block) => block.id === blockId);
  }
  return false;
}

/**
 * The anchor a new comment takes from the selection (5.3): block, text range, cell, else the
 * slide. With the slide given, a selection whose block id names no block of it (a placeholder run
 * of a title or statement slide, `audit-present` row 35: "the anchor names nothing on the current
 * document (block removed)" three times of three on the title placeholder) anchors on the slide
 * instead (docs/FOCUS.md section 5 rank 19), so the comment lands where the seller wrote it.
 */
export function anchorAtSelection(
  slideId: string,
  selection: EditorSelection | null | undefined,
  quote?: string,
  slide?: Slide,
): CommentAnchorView {
  if (selection?.blockId === undefined) return { kind: 'slide', slideId };
  const blockId = selection.blockId;
  if (!slideHasBlock(slide, blockId)) return { kind: 'slide', slideId };
  if (selection.cell !== undefined && selection.text !== true)
    return { kind: 'cell', slideId, blockId, cell: selection.cell };
  if (selection.range !== undefined && selection.range[0] !== selection.range[1]) {
    const range: [number, number] = [
      Math.min(selection.range[0], selection.range[1]),
      Math.max(selection.range[0], selection.range[1]),
    ];
    return {
      kind: 'text',
      slideId,
      blockId,
      path:
        selection.cell === undefined
          ? '/text'
          : `/rows/${selection.cell.row}/cells/${selection.cell.column}`,
      range,
      ...(quote === undefined ? {} : { quote: [...quote].slice(0, 200).join('') }),
    };
  }
  return { kind: 'block', slideId, blockId };
}

/** The slide a thread's anchor names, or undefined for a deck thread. */
export function slideOfThread(thread: Pick<CommentThreadView, 'anchor'>): string | undefined {
  return thread.anchor.slideId;
}

/** The open threads anchored on a slide, orphaned ones included (they list under the slide). */
export function threadsOnSlide(
  threads: readonly CommentThreadView[],
  slideId: string,
): CommentThreadView[] {
  return threads.filter((thread) => thread.anchor.slideId === slideId);
}

/** The open thread count of a slide, for the filmstrip's count chip (4.3). */
export function openCountOnSlide(threads: readonly CommentThreadView[], slideId: string): number {
  return threads.filter((thread) => thread.anchor.slideId === slideId && thread.resolved !== true)
    .length;
}

/** The open threads per slide, for the filmstrip chips in one pass. */
export function openCounts(threads: readonly CommentThreadView[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const thread of threads) {
    if (thread.resolved === true || thread.anchor.slideId === undefined) continue;
    out.set(thread.anchor.slideId, (out.get(thread.anchor.slideId) ?? 0) + 1);
  }
  return out;
}

const time = (iso: string): number => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/** The anchor's place for the canvas order: top to bottom, left to right, from the measured boxes. */
export function anchorPoint(
  anchor: CommentAnchorView,
  boxes: Readonly<Record<string, Box>> | undefined,
): { x: number; y: number } {
  const box = anchor.blockId === undefined ? undefined : boxes?.[anchor.blockId];
  if (box === undefined)
    return { x: anchor.kind === 'slide' || anchor.kind === 'deck' ? -1 : 0, y: -1 };
  return { x: box[0], y: box[1] };
}

/**
 * The panel's order (08 9): open threads by last activity newest first, resolved after them by
 * resolve time; Slide order sorts open threads by slide position then by anchor position.
 */
export function sortThreads(
  threads: readonly CommentThreadView[],
  order: CommentsOrder,
  document: DeckDocument,
  boxes?: Readonly<Record<string, Readonly<Record<string, Box>>>>,
): CommentThreadView[] {
  const slides = slideOrder(document.deck);
  const position = (thread: CommentThreadView): number => {
    const slideId = thread.anchor.slideId;
    const index = slideId === undefined ? -1 : slides.indexOf(slideId);
    return index < 0 ? -1 : index;
  };
  const open = threads.filter((thread) => thread.resolved !== true);
  const resolved = threads.filter((thread) => thread.resolved === true);
  if (order === 'slide') {
    open.sort((a, b) => {
      const pa = position(a);
      const pb = position(b);
      if (pa !== pb) return pa - pb;
      const qa = anchorPoint(
        a.anchor,
        a.anchor.slideId === undefined ? undefined : boxes?.[a.anchor.slideId],
      );
      const qb = anchorPoint(
        b.anchor,
        b.anchor.slideId === undefined ? undefined : boxes?.[b.anchor.slideId],
      );
      if (qa.y !== qb.y) return qa.y - qb.y;
      if (qa.x !== qb.x) return qa.x - qb.x;
      return time(a.createdAt) - time(b.createdAt);
    });
  } else {
    open.sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
  }
  resolved.sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
  return [...open, ...resolved];
}

/** The order the `j` and `k` chords walk on the canvas: the open threads of the current slide in Slide order, then the rest. */
export function canvasOrder(
  threads: readonly CommentThreadView[],
  document: DeckDocument,
  boxes?: Readonly<Record<string, Readonly<Record<string, Box>>>>,
): CommentThreadView[] {
  return sortThreads(threads, 'slide', document, boxes).filter(
    (thread) => thread.resolved !== true,
  );
}

/** The next or previous thread in an order, wrapping; the first when nothing is current. */
export function stepThread(
  ordered: readonly CommentThreadView[],
  currentId: string | null | undefined,
  direction: 1 | -1,
): CommentThreadView | null {
  if (ordered.length === 0) return null;
  const at =
    currentId === undefined || currentId === null
      ? -1
      : ordered.findIndex((t) => t.id === currentId);
  if (at < 0) return direction === 1 ? (ordered[0] ?? null) : (ordered[ordered.length - 1] ?? null);
  return ordered[(at + direction + ordered.length) % ordered.length] ?? null;
}

/** The text of a thread and its replies, lower cased, for the search. */
function textOf(thread: CommentThreadView): string {
  const parts = [thread.comment, ...thread.replies].flatMap((comment) => [
    comment.text,
    comment.author.name ?? comment.author.label,
    ...comment.mentions.map((m) => m.name ?? m.label),
  ]);
  return parts.join(' ').toLowerCase();
}

/** True when the thread is for the reader: it mentions them, is theirs or a reply of theirs, or is assigned to them (5.3). */
export function isForMe(thread: CommentThreadView, me: string | undefined): boolean {
  if (thread.forMe === true) return true;
  if (me === undefined) return false;
  if (thread.assignee?.principalId === me) return true;
  return [thread.comment, ...thread.replies].some(
    (comment) =>
      comment.author.principalId === me || comment.mentions.some((m) => m.principalId === me),
  );
}

/** The panel's filter, search and For you over a list already sorted. */
export function filterThreads(
  threads: readonly CommentThreadView[],
  options: { filter?: CommentsFilter; search?: string; forMe?: boolean; me?: string },
): CommentThreadView[] {
  const query = (options.search ?? '').trim().toLowerCase();
  return threads.filter((thread) => {
    if (options.filter === 'open' && thread.resolved === true) return false;
    if (options.filter === 'resolved' && thread.resolved !== true) return false;
    if (options.forMe === true && !isForMe(thread, options.me)) return false;
    if (query !== '' && !textOf(thread).includes(query)) return false;
    return true;
  });
}

/** A body's text split into text and mention segments, for React text nodes (5.1: never markup). */
export type BodySegment =
  { kind: 'text'; text: string } | { kind: 'mention'; identity: IdentityView; index: number };

export function bodySegments(comment: Pick<CommentView, 'text' | 'mentions'>): BodySegment[] {
  const out: BodySegment[] = [];
  const re = /\{@(\d+)\}/g;
  let cursor = 0;
  for (let m = re.exec(comment.text); m !== null; m = re.exec(comment.text)) {
    if (m.index > cursor) out.push({ kind: 'text', text: comment.text.slice(cursor, m.index) });
    const index = Number(m[1]);
    const identity = comment.mentions[index];
    if (identity !== undefined) out.push({ kind: 'mention', identity, index });
    else out.push({ kind: 'text', text: m[0] });
    cursor = m.index + m[0].length;
  }
  if (cursor < comment.text.length) out.push({ kind: 'text', text: comment.text.slice(cursor) });
  return out;
}

/** The plain words of a body with every mention as its name, for the inbox and the panel's one line. */
export function bodyPlain(comment: Pick<CommentView, 'text' | 'mentions'>): string {
  return bodySegments(comment)
    .map((segment) =>
      segment.kind === 'text'
        ? segment.text
        : `@${segment.identity.name ?? segment.identity.label}`,
    )
    .join('');
}

// ---------------------------------------------------------------------------------------------
// The reply box: `@` tokens in the field become `{@n}` in the stored body (5.4)

/** A mention the reply box inserted: the display token and the stored id. */
export type DraftMention = { token: string; principalId: string; identity: IdentityView };

/**
 * The stored body of a draft (5.4): every `@Name` token the field holds becomes `{@n}` with the
 * id in `mentions`, in token order; a token the person edited away drops its mention. Braces
 * typed by hand are kept as text because the schema refuses a stray `{`, so they are escaped by
 * spacing them out.
 */
export function draftBody(text: string, drafts: readonly DraftMention[]): CommentBodyInput {
  const mentions: string[] = [];
  let out = text.replace(/\{/g, '{ ').replace(/\}/g, ' }');
  for (const draft of drafts) {
    if (!out.includes(draft.token)) continue;
    const index = mentions.indexOf(draft.principalId);
    const n = index >= 0 ? index : mentions.push(draft.principalId) - 1;
    out = out.split(draft.token).join(`{@${n}}`);
  }
  return mentions.length === 0 ? { text: out.trim() } : { text: out.trim(), mentions };
}

/** The `@` query under the caret: the text after the last `@` when it holds no space, else null. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && /[A-Za-z0-9]/.test(before[at - 1] ?? '')) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;
  return { start: at, query };
}

/** The autocomplete's candidates: the mentionables whose name or label starts with the query, at most eight. */
export function mentionCandidates(
  mentionables: readonly IdentityView[],
  query: string,
  limit = 8,
): IdentityView[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const out: IdentityView[] = [];
  for (const each of mentionables) {
    if (seen.has(each.principalId)) continue;
    const name = (each.name ?? each.label).toLowerCase();
    const label = each.label.toLowerCase();
    const email = (each.email ?? '').toLowerCase();
    if (
      q === '' ||
      name.startsWith(q) ||
      label.startsWith(q) ||
      email.startsWith(q) ||
      name.split(/\s+/).some((w) => w.startsWith(q))
    ) {
      seen.add(each.principalId);
      out.push(each);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** The token the field shows for a picked mention: `@Name` with a trailing space. */
export function mentionToken(identity: IdentityView): string {
  return `@${identity.name ?? identity.label}`;
}

/** A raw address typed after `@` that no mentionable matches: an invitation an editor may create (5.4). */
export function isEmailToken(query: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query);
}

// ---------------------------------------------------------------------------------------------
// Times and counts

/** The tabular relative time of the panel and the inbox: "now", "3m", "2h", "5d", else "Sep 13". */
export function shortTime(iso: string, now: number = Date.now()): string {
  const then = time(iso);
  if (then === 0) return '';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(then).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** The count chip's accessible name (15): the number with its noun. */
export function countName(n: number): string {
  return COMMENTS.count(n);
}

/** The one line the panel shows under a thread: the first comment's words, one line. */
export function firstLine(thread: CommentThreadView): string {
  const words = thread.comment.deleted === true ? COMMENTS.deleted : bodyPlain(thread.comment);
  return words.replace(/\s+/g, ' ').trim();
}

/** The marker's box in sheet pixels: outside the anchored box's top right, or the slide's top left. */
export function markerPlace(
  anchor: CommentAnchorView,
  boxes: Readonly<Record<string, Box>>,
  size: number,
  k: number,
): { left: number; top: number } {
  const box = anchor.blockId === undefined ? undefined : boxes[anchor.blockId];
  if (box === undefined) return { left: 4, top: 4 };
  return { left: (box[0] + box[2]) * k + 2, top: Math.max(0, box[1] * k - size - 2) };
}
