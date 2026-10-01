import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';

import { COLLAB_CLASSES, COLLAB_GEOMETRY } from '@turboslide/render/collab';
import type { Box } from '@turboslide/schema/render';
import type { EditorOverlayView } from '@turboslide/viewer/Editor';

import type { EditorPresence, PresenceParticipant } from '../editor-shell';
import { cn } from '../lib/cn';
import { PRESENCE } from '../menus/strings';
import { IdentityChip, hueHexOf } from './IdentityChip';
import { remoteCaretBox } from './remote-caret';
import {
  CARET_DIM_MS,
  FLAG_FADE_MS,
  displayNameFor,
  dragOf,
  flagText,
  keptCaretBox,
  pointersDrawn,
  stackFlags,
} from './presence-model';
import type { ViewerFacts } from './presence-model';

/**
 * The remote presence layer of the overlay (gslides-parity SPEC-3 4.4; research 11 6.5 to 6.7;
 * docs/REALTIME.md 3.5): for every other participant on this slide, the "being edited by"
 * outline at each selected block's box in the person's hue (one outline per block in the first
 * holder's hue, at most two flags then "+N"; a block the own selection holds too draws the
 * remote outline 2 px inside the own ring, so both people see that the other holds it,
 * audit-people.md defect 5), the drag ghost (the box another person is moving or resizing, drawn
 * dashed at the carried position in their hue with "moving" on the flag while their pointer is
 * down; the block's own element stays where the document has it until the write lands), the
 * remote caret as a 2 px bar at the run's line box with its 120 by 18 flag above it (fading 3 s
 * after the caret last moved, the caret dimming after 30 s without a change of state; the bar
 * keeps its last box for CARET_KEEP_MS when the range cannot be measured, so a late frame never
 * draws at offset 0), and the pointer as Turboslide's own 12 by 16 polygon moved by transform
 * over 80 ms with the flag at its side, drawn for every access level, hidden in present mode and
 * above the cap. The caret's offset arrives already placed in this tab's frame (the room client's
 * caret transform). An agent's outline is dashed ink with no hue. Everything is absolute inside
 * the overlay, so it moves nothing (05 rule 4).
 */
export type RemoteCursorsProps = {
  view: EditorOverlayView;
  presence: EditorPresence;
  viewer: ViewerFacts;
  present: boolean;
  /** the sheet body the carets are measured in (`.pt-slide`); found in the document when absent */
  body?: ParentNode | null;
  /** over a dithered picture slide: hued elements carry the two ring halo */
  halo?: boolean;
  now?: number;
};

/** How far inside the own ring the remote outline draws when both hold a block (3.5), in CSS px. */
export const INSIDE_OUTLINE_PX = 2;

/**
 * The flag's words on a drag ghost: R3's `PRESENCE.movingFlag(first)` and `movingLabel(name)`
 * once they land (realtime/build/r2.md R2-R5; build/r3.md item 3), the plain word until then,
 * since R2's lane ships before R3's (REALTIME.md 5.3).
 */
const MOVING_WORD: string = (() => {
  const word = (PRESENCE as { moving?: unknown }).moving;
  return typeof word === 'string' && word !== '' ? word : 'moving';
})();
const movingFlagText = (first: string): string => {
  const fn = (PRESENCE as { movingFlag?: unknown }).movingFlag;
  return typeof fn === 'function'
    ? (fn as (f: string) => string)(first)
    : `${first} · ${MOVING_WORD}`;
};
const movingLabelText = (name: string): string => {
  const fn = (PRESENCE as { movingLabel?: unknown }).movingLabel;
  return typeof fn === 'function' ? (fn as (n: string) => string)(name) : `${name}, ${MOVING_WORD}`;
};

function place(box: Box, k: number): CSSProperties {
  return { left: box[0] * k, top: box[1] * k, width: box[2] * k, height: box[3] * k };
}

/** The box inset by `px` CSS pixels on every side, for the outline inside the own ring. */
function inset(box: Box, k: number, px: number): CSSProperties {
  const width = Math.max(0, box[2] * k - 2 * px);
  const height = Math.max(0, box[3] * k - 2 * px);
  return { left: box[0] * k + px, top: box[1] * k + px, width, height };
}

type FlagProps = {
  participant: PresenceParticipant;
  name: string;
  x: number;
  y: number;
  faded?: boolean;
  halo?: boolean;
  more?: number;
  /** a state word after the name ("moving"), in place of the guest suffix */
  word?: string;
  /** the `data-state` the drivers read (`moving`) */
  state?: string;
};

/** The 120 by 18 name flag (11 6.5): an ink plate, the 14 px chip, the first name, "guest" when it fits, or the state word. */
export function Flag({
  participant,
  name,
  x,
  y,
  faded = false,
  halo = false,
  more,
  word,
  state,
}: FlagProps) {
  const hue = hueHexOf(participant.hue);
  const text =
    more !== undefined
      ? PRESENCE.more(more)
      : word === undefined
        ? flagText(name, participant.trust)
        : word === MOVING_WORD
          ? movingFlagText(flagText(name, 'label'))
          : `${flagText(name, 'label')} · ${word}`;
  const label =
    more !== undefined
      ? PRESENCE.more(more)
      : word === undefined
        ? `${name}${participant.trust === 'guest' ? `, ${PRESENCE.guest}` : ''}`
        : word === MOVING_WORD
          ? movingLabelText(name)
          : `${name}, ${word}`;
  return (
    <span
      className={cn(COLLAB_CLASSES.flag, 'ts-flag', faded && 'is-faded', halo && 'has-halo')}
      style={{ left: x, top: y, ...(hue === null ? {} : ({ '--ts-hue': hue } as CSSProperties)) }}
      data-client={participant.clientId}
      {...(state === undefined ? {} : { 'data-state': state })}
      role="img"
      aria-label={label}
    >
      {more === undefined ? (
        <IdentityChip identity={participant} size={14} hueSlot={participant.hue ?? null} live />
      ) : null}
      <span className="ts-flag-text">{text}</span>
    </span>
  );
}

export function RemoteCursors({
  view,
  presence,
  viewer,
  present,
  body,
  halo = false,
  now = Date.now(),
}: RemoteCursorsProps) {
  const { k, boxes } = view;
  const others = presence.others.filter((each) => each.slideId === view.slideId);
  const selfBlocks = new Set<string>([
    ...(view.selection?.blockId === undefined ? [] : [view.selection.blockId]),
  ]);
  /* the moment each caret last moved, for the flag fade (11 6.5) */
  const caretMoved = useRef(new Map<string, { key: string; at: number }>());
  /* the box each caret was last measured at, kept for CARET_KEEP_MS when a measure fails (3.5) */
  const caretBoxes = useRef(new Map<string, { box: Box; at: number }>());
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const sheet =
    body ??
    (typeof document === 'undefined'
      ? null
      : document.querySelector<HTMLElement>(`.pt-slide[data-slide-id="${view.slideId}"]`));

  /* the drag ghosts: the box another person is moving or resizing, while their pointer is down */
  const ghosts = others.flatMap((each) => {
    const drag = dragOf(each);
    if (drag === null || each.trust === 'agent') return [];
    const box: Box = [drag.x, drag.y, drag.w, drag.h];
    return [{ participant: each, blockId: drag.blockId, box }];
  });

  /* the outlines: one per block, the first holder's hue, its flags stacked at the top right; a
     holder dragging the block is left to its ghost, so one flag names the move */
  const byBlock = new Map<string, PresenceParticipant[]>();
  for (const each of others) {
    const drag = dragOf(each);
    for (const blockId of each.selection?.blockIds ?? []) {
      if (each.selection?.caret?.blockId === blockId) continue;
      if (drag !== null && drag.blockId === blockId) continue;
      const list = byBlock.get(blockId) ?? [];
      list.push(each);
      byBlock.set(blockId, list);
    }
  }
  const outlines = [...byBlock.entries()].flatMap(([blockId, holders]) => {
    const box = boxes.blocks[blockId];
    if (!box) return [];
    return [{ blockId, box, holders }];
  });

  /* the carets, measured in the sheet body; the offset is already in this tab's frame */
  const presentIds = new Set(others.map((each) => each.clientId));
  for (const id of [...caretBoxes.current.keys()])
    if (!presentIds.has(id)) caretBoxes.current.delete(id);
  const carets = others.flatMap((each) => {
    const caret = each.selection?.caret;
    if (!caret || !sheet) return [];
    const measured = remoteCaretBox(sheet, boxes, caret, k);
    const held = keptCaretBox(measured, caretBoxes.current.get(each.clientId), now);
    const box = held?.box ?? boxes.blocks[caret.blockId] ?? null;
    if (!box) return [];
    if (held !== null && !held.kept) caretBoxes.current.set(each.clientId, { box, at: now });
    const key = `${caret.blockId}/${caret.path}:${caret.offset}`;
    const seen = caretMoved.current.get(each.clientId);
    if (seen === undefined || seen.key !== key)
      caretMoved.current.set(each.clientId, { key, at: now });
    const movedAt = caretMoved.current.get(each.clientId)?.at ?? now;
    const lastSeen = new Date(each.lastSeenAt).getTime();
    return [
      {
        participant: each,
        box,
        offset: caret.offset,
        kept: held?.kept === true,
        faded: now - movedAt > FLAG_FADE_MS,
        dim: each.idle === true || (Number.isFinite(lastSeen) && now - lastSeen > CARET_DIM_MS),
      },
    ];
  });
  const flagW = COLLAB_GEOMETRY.flag.width;
  const flagH = COLLAB_GEOMETRY.flag.height;
  const caretFlags = stackFlags(
    carets.map((caret) => {
      const x = caret.box[0] * k;
      const top = caret.box[1] * k - flagH;
      /* within 24 px of the sheet's top the flag flips below the caret */
      const y = caret.box[1] * k < 24 ? (caret.box[1] + caret.box[3]) * k : top;
      return { x, y, caret };
    }),
    flagW,
    flagH,
  );

  const drawPointers = pointersDrawn(presence, presence.others.length, present);
  const pointerSize = COLLAB_GEOMETRY.pointer;

  return (
    <>
      {outlines.map(({ blockId, box, holders }) => {
        const first = holders[0]!;
        const agent = first.trust === 'agent';
        const hue = agent ? null : hueHexOf(first.hue);
        /* both hold the block: the own ring stays at the edge and the remote outline draws 2 px
           inside it in the holder's hue (docs/REALTIME.md 3.5; audit-people.md defect 5) */
        const inside = selfBlocks.has(blockId);
        const flags = holders.slice(0, 2);
        const more = holders.length - flags.length;
        const right = (box[0] + box[2]) * k;
        const top = box[1] * k - flagH;
        return (
          <span key={`outline:${blockId}`} className="ts-remote-group" data-block={blockId}>
            <span
              className={cn(
                COLLAB_CLASSES.remoteOutline,
                'ts-remote-outline',
                inside && 'is-inside',
                agent && 'is-agent',
                halo && 'has-halo',
              )}
              style={{
                ...(inside ? inset(box, k, INSIDE_OUTLINE_PX) : place(box, k)),
                ...(hue === null ? {} : ({ '--ts-hue': hue } as CSSProperties)),
              }}
              data-client={first.clientId}
              data-block={blockId}
              {...(inside ? { 'data-inside': 'true' } : {})}
              aria-hidden="true"
            />
            {flags.map((holder, i) => (
              <Flag
                key={holder.clientId}
                participant={holder}
                name={displayNameFor(holder, viewer)}
                x={right - flagW - i * (flagW + 2)}
                y={top < 0 ? (box[1] + box[3]) * k : top}
                halo={halo}
              />
            ))}
            {more > 0 ? (
              <Flag
                key="more"
                participant={first}
                name=""
                more={more}
                x={right - flagW * 3 - 4}
                y={top < 0 ? (box[1] + box[3]) * k : top}
                halo={halo}
              />
            ) : null}
          </span>
        );
      })}
      {ghosts.map(({ participant, blockId, box }) => {
        const hue = hueHexOf(participant.hue);
        const right = (box[0] + box[2]) * k;
        const top = box[1] * k - flagH;
        return (
          <span
            key={`drag:${participant.clientId}`}
            className="ts-remote-group ts-remote-drag-group"
            data-block={blockId}
          >
            <span
              className={cn(
                COLLAB_CLASSES.remoteOutline,
                'ts-remote-outline',
                'ts-remote-drag',
                halo && 'has-halo',
              )}
              style={{
                ...place(box, k),
                borderStyle: 'dashed',
                ...(hue === null ? {} : ({ '--ts-hue': hue } as CSSProperties)),
              }}
              data-client={participant.clientId}
              data-block={blockId}
              data-state="moving"
              aria-hidden="true"
            />
            <Flag
              participant={participant}
              name={displayNameFor(participant, viewer)}
              x={right - flagW}
              y={top < 0 ? (box[1] + box[3]) * k : top}
              word={MOVING_WORD}
              state="moving"
              halo={halo}
            />
          </span>
        );
      })}
      {caretFlags.map(({ x, y, caret }) => {
        const hue = hueHexOf(caret.participant.hue);
        return (
          <span key={`caret:${caret.participant.clientId}`} className="ts-remote-caret-group">
            <span
              className={cn('ts-remote-caret', caret.dim && 'is-dim', halo && 'has-halo')}
              style={{
                left: caret.box[0] * k,
                top: caret.box[1] * k,
                height: Math.max(8, caret.box[3] * k),
                ...(hue === null ? {} : ({ '--ts-hue': hue } as CSSProperties)),
              }}
              data-client={caret.participant.clientId}
              data-offset={caret.offset}
              {...(caret.kept ? { 'data-kept': 'true' } : {})}
              aria-hidden="true"
            />
            <Flag
              participant={caret.participant}
              name={displayNameFor(caret.participant, viewer)}
              x={x}
              y={y}
              faded={caret.faded}
              halo={halo}
            />
          </span>
        );
      })}
      {drawPointers
        ? others.flatMap((each) => {
            if (!each.pointer || each.trust === 'agent') return [];
            const hue = hueHexOf(each.hue);
            const x = each.pointer.x * k;
            const y = each.pointer.y * k;
            return [
              <span
                key={`pointer:${each.clientId}`}
                className="ts-remote-pointer-group"
                style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}
                data-client={each.clientId}
              >
                <svg
                  className={cn(
                    COLLAB_CLASSES.remotePointer,
                    'ts-remote-pointer',
                    halo && 'has-halo',
                  )}
                  viewBox={`0 0 ${pointerSize.width} ${pointerSize.height}`}
                  width={pointerSize.width}
                  height={pointerSize.height}
                  style={hue === null ? undefined : ({ '--ts-hue': hue } as CSSProperties)}
                  aria-hidden="true"
                >
                  <polygon className="ts-remote-pointer-outer" points={pointerSize.points} />
                  <polygon className="ts-remote-pointer-inner" points={pointerSize.points} />
                  <polygon className="ts-remote-pointer-fill" points={pointerSize.points} />
                </svg>
                <Flag
                  participant={each}
                  name={displayNameFor(each, viewer)}
                  x={pointerSize.flagOffset.x}
                  y={pointerSize.flagOffset.y}
                  halo={halo}
                />
              </span>,
            ];
          })
        : null}
    </>
  );
}
