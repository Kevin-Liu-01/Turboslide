import type { RoomEvent } from '@turboslide/realtime/channel';
import type { Mutation } from '@turboslide/schema/mutations';

import type { EditorController } from '../editor/controller';
import type { VisitorView } from './agents';
import type { TabRoom } from './tab-backend';

/**
 * The visitor as the agents' runner reads them (agents.ts `VisitorView`; docs/SITE.md C.10): the
 * slide and the block the visitor's editor holds, from its controller; whether the visitor types
 * or holds a pointer down, and whether they have clicked or typed in the frame at all, from the
 * frame document's own trusted events; and what the visitor has written, from the tab room's
 * entries under the visitor's principal.
 */
export type TryVisitor = VisitorView & {
  /** the visitor's editor controller, once EditorRoot made it */
  attach: (controller: EditorController) => void;
  dispose: () => void;
};

/** How long after a key the visitor counts as typing. */
export const TYPING_MS = 1500;

/** The keys `VisitorView.touched` names for one mutation. */
export function touchedKeys(mutation: Mutation): string[] {
  const row = mutation as {
    op: string;
    slideId?: unknown;
    blockId?: unknown;
    path?: unknown;
    slide?: { id?: unknown };
    block?: { id?: unknown };
  };
  const out: string[] = [];
  if (row.op === 'deck.set' && typeof row.path === 'string') out.push(`deck:${row.path}`);
  const slideId =
    typeof row.slideId === 'string'
      ? row.slideId
      : typeof row.slide?.id === 'string'
        ? row.slide.id
        : null;
  if (slideId === null) return out;
  out.push(`slide:${slideId}`);
  const blockId =
    typeof row.blockId === 'string'
      ? row.blockId
      : typeof row.block?.id === 'string'
        ? row.block.id
        : null;
  if (blockId !== null) out.push(`block:${slideId}#${blockId}`);
  return out;
}

export function tryVisitor(options: {
  room: TabRoom;
  principalId: string;
  win: Window;
}): TryVisitor {
  const { win } = options;
  let controller: EditorController | null = null;
  let engaged = false;
  let lastKey = -Infinity;
  let lastInput = -Infinity;
  let pointerDown = false;
  const touched = new Set<string>();

  const onPointerDown = (event: PointerEvent): void => {
    if (!event.isTrusted) return;
    engaged = true;
    pointerDown = true;
    lastInput = Date.now();
  };
  const onPointerUp = (): void => {
    pointerDown = false;
  };
  const onKey = (event: KeyboardEvent): void => {
    if (!event.isTrusted) return;
    engaged = true;
    lastKey = Date.now();
    lastInput = lastKey;
  };
  win.addEventListener('pointerdown', onPointerDown, true);
  win.addEventListener('pointerup', onPointerUp, true);
  win.addEventListener('pointercancel', onPointerUp, true);
  win.addEventListener('keydown', onKey, true);
  const unsubscribe = options.room.channel.subscribe(options.room.deckId, (event: RoomEvent) => {
    if (event.type !== 'op' || event.entry.author.principalId !== options.principalId) return;
    for (const mutation of event.entry.mutations ?? [])
      for (const key of touchedKeys(mutation as Mutation)) touched.add(key);
  });

  const editingText = (): boolean =>
    (win.document.activeElement as HTMLElement | null)?.isContentEditable === true;

  return {
    attach(next) {
      controller = next;
    },
    activeSlide: () => controller?.getSnapshot().activeSlide ?? null,
    selectedBlock: () => controller?.getSnapshot().selection?.blockId ?? null,
    busy: () => pointerDown || editingText() || Date.now() - lastKey < TYPING_MS,
    engaged: () => engaged,
    lastInput: () => lastInput,
    touched: () => touched,
    goto(slideId) {
      void controller?.invoke('view.goto', { slideId }).catch(() => undefined);
    },
    dispose() {
      win.removeEventListener('pointerdown', onPointerDown, true);
      win.removeEventListener('pointerup', onPointerUp, true);
      win.removeEventListener('pointercancel', onPointerUp, true);
      win.removeEventListener('keydown', onKey, true);
      unsubscribe();
    },
  };
}
