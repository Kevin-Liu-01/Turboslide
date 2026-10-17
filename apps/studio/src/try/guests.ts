import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';

import { FRAME_MS, seeded } from './agents';
import type { AgentPresence, VisitorView } from './agents';

/**
 * The short visits of the title's avatars (docs/SITE.md B, C.10): a person pressed in the page's
 * people stack joins the live editor's roster under their generated name, their pointer comes in
 * from the edge of the slide the visitor is looking at, moves between its blocks for a few
 * seconds and leaves; OpenClaw or Hermes pressed in the agents stack joins the same way, leaves a
 * comment on that slide (a real `comment.add` through the page API's path) and resolves it before
 * it leaves; while it is in the room its chip and flags say what it does ("reading this slide",
 * "leaving a comment"). A guest writes nothing on a slide, so the visitor's work is never
 * touched. A second press while a guest is in the room keeps them longer. Visits pause with the
 * agents (off screen, hidden) and under reduced motion the pointer jumps instead of travelling.
 */

/** One guest as a visit drives it: a headless editor controller on the tab room (session.ts). */
export type GuestHandle = {
  present: (state: AgentPresence) => void;
  /** names an agent's step in a few words (docs/SITE.md D5); a person names none */
  say?: (words: string | null) => void;
  invoke: (action: string, input: unknown) => Promise<unknown>;
  /** leaves the room: the roster drops the guest */
  leave: () => void;
};

type GuestPlan = {
  /** the guest's principal id */
  key: string;
  kind: 'person' | 'agent';
  /** an agent's comment on the slide, resolved before it leaves */
  comment?: string;
};

export type GuestsOptions = {
  /** lets the guest into the room and answers its handle */
  join: (key: string) => GuestHandle;
  visitor: Pick<VisitorView, 'activeSlide'>;
  document: () => DeckDocument;
  /** the agents' gate: the frame on screen and its document visible */
  open: () => boolean;
  reducedMotion?: () => boolean;
  /** the guest's first move landed: its chip and pointer are drawn */
  onArrive?: (key: string) => void;
  /** how long a visit lasts from its last press */
  stayMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export type Guests = {
  visit: (plan: GuestPlan) => void;
  /** the guests in the room now */
  active: () => string[];
  stop: () => void;
};

/** How long a visit lasts after its last press. */
export const STAY_MS = 12_000;

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** The blocks a guest's outline can rest on: a content slide's blocks, a title slide's two fields. */
export function blocksOn(slide: Slide | undefined): string[] {
  if (slide === undefined) return [];
  if (slide.kind === 'title') return ['heading', 'lead'];
  return slideBlocks(slide).map((row) => row.block.id);
}

function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export function createGuests(options: GuestsOptions): Guests {
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const reduced = options.reducedMotion ?? (() => false);
  const stayMs = options.stayMs ?? STAY_MS;
  let running = true;
  let visits = 0;
  const live = new Map<string, { until: number }>();

  const gate = async (): Promise<void> => {
    while (running && !options.open()) await sleep(200);
  };

  const run = async (plan: GuestPlan, handle: GuestHandle, stay: { until: number }) => {
    visits += 1;
    const random = seeded(hashOf(plan.key) ^ visits);
    const slideOf = (): string | null => {
      const document = options.document();
      const active = options.visitor.activeSlide();
      if (active !== null && document.slides[active] !== undefined) return active;
      return document.deck.sections[0]?.slideIds[0] ?? null;
    };
    /* in from the slide's right edge */
    let pointer = { x: 1580, y: 160 + random() * 560 };
    let arrived = false;
    let thread: string | null = null;
    if (plan.kind === 'agent') handle.say?.('reading this slide');
    while (running && now() < stay.until) {
      await gate();
      const slideId = slideOf();
      if (!running || slideId === null) break;
      const target = { x: 260 + random() * 1080, y: 180 + random() * 540 };
      const blocks = blocksOn(options.document().slides[slideId]);
      const block = blocks[Math.floor(random() * blocks.length)];
      if (reduced()) {
        pointer = target;
        handle.present({ slideId, pointer });
      } else {
        const from = pointer;
        const frames = Math.max(1, Math.round((700 + random() * 300) / FRAME_MS));
        for (let i = 1; i <= frames && running; i += 1) {
          await gate();
          const t = ease(i / frames);
          pointer = { x: from.x + (target.x - from.x) * t, y: from.y + (target.y - from.y) * t };
          handle.present({ slideId, pointer });
          await sleep(FRAME_MS);
        }
      }
      if (!arrived) {
        arrived = true;
        options.onArrive?.(plan.key);
        if (plan.kind === 'agent' && plan.comment !== undefined)
          try {
            handle.say?.('leaving a comment');
            const answer = (await handle.invoke('comment.add', {
              anchor: { kind: 'slide', slideId },
              body: { text: plan.comment, mentions: [] },
            })) as { thread?: { id?: unknown } } | undefined;
            thread = typeof answer?.thread?.id === 'string' ? answer.thread.id : null;
          } catch {
            thread = null;
          }
        if (plan.kind === 'agent') handle.say?.('reading this slide');
      }
      await sleep(500 + random() * 700);
      if (block !== undefined && running)
        handle.present({ slideId, pointer, selection: { blockIds: [block] } });
      await sleep(1400 + random() * 1200);
    }
    if (thread !== null)
      try {
        handle.say?.('resolving its comment');
        await handle.invoke('comment.resolve', { threadId: thread });
      } catch {
        /* the visitor may have resolved or removed it */
      }
  };

  return {
    visit(plan) {
      if (!running) return;
      const stay = live.get(plan.key);
      if (stay !== undefined) {
        stay.until = now() + stayMs;
        return;
      }
      const next = { until: now() + stayMs };
      live.set(plan.key, next);
      let handle: GuestHandle | null = null;
      try {
        handle = options.join(plan.key);
      } catch {
        live.delete(plan.key);
        return;
      }
      const joined = handle;
      void run(plan, joined, next)
        .catch(() => undefined)
        .finally(() => {
          joined.leave();
          live.delete(plan.key);
        });
    },
    active: () => [...live.keys()],
    stop() {
      running = false;
    },
  };
}
