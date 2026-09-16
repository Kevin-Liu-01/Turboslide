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
  flagText,
  othersOf,
  pointersDrawn,
  stackFlags,
} from './presence-model';
import type { ViewerFacts } from './presence-model';

/**
 * The remote presence layer of the overlay (gslides-parity SPEC-3 4.4; research 11 6.5 to 6.7):
 * for every other participant on this slide, the "being edited by" outline at each selected
 * block's box in the person's hue (one outline per block in the first holder's hue, at most two
 * flags then "+N"; the own ink ring wins when both select one block), the remote caret as a 2 px
 * bar at the run's line box with its 120 by 18 flag above it (fading 3 s after the caret last
 * moved, the caret dimming after 30 s without an update), and the pointer as Turboslide's own
 * 12 by 16 polygon moved by transform over 80 ms with the flag at its side, hidden in present mode
 * and above the cap. An agent's outline is dashed ink with no hue. Everything is absolute inside
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

function place(box: Box, k: number): CSSProperties {
  return { left: box[0] * k, top: box[1] * k, width: box[2] * k, height: box[3] * k };
}

type FlagProps = {
  participant: PresenceParticipant;
  name: string;
  x: number;
  y: number;
  faded?: boolean;
  halo?: boolean;
  more?: number;
};

/** The 120 by 18 name flag (11 6.5): an ink plate, the 14 px chip, the first name, "guest" when it fits. */
export function Flag({ participant, name, x, y, faded = false, halo = false, more }: FlagProps) {
  const hue = hueHexOf(participant.hue);
  return (
    <span
      className={cn(COLLAB_CLASSES.flag, 'ts-flag', faded && 'is-faded', halo && 'has-halo')}
      style={{ left: x, top: y, ...(hue === null ? {} : ({ '--ts-hue': hue } as CSSProperties)) }}
      data-client={participant.clientId}
      role="img"
      aria-label={
        more !== undefined
          ? PRESENCE.more(more)
          : `${name}${participant.trust === 'guest' ? `, ${PRESENCE.guest}` : ''}`
      }
    >
      {more === undefined ? (
        <IdentityChip identity={participant} size={14} hueSlot={participant.hue ?? null} live />
      ) : null}
      <span className="ts-flag-text">
        {more === undefined ? flagText(name, participant.trust) : PRESENCE.more(more)}
      </span>
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
  // the self filter by client id and by principal id (SPEC-5-amendments A3 item 5): this tab
  // and this person's other tabs draw no outline, caret, flag or pointer
  const collaborators = othersOf(presence);
  const others = collaborators.filter((each) => each.slideId === view.slideId);
  const selfBlocks = new Set<string>([
    ...(view.selection?.blockId === undefined ? [] : [view.selection.blockId]),
  ]);
  /* the moment each caret last moved, for the flag fade (11 6.5) */
  const caretMoved = useRef(new Map<string, { key: string; at: number }>());
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

  /* the outlines: one per block, the first holder's hue, its flags stacked at the top right */
  const byBlock = new Map<string, PresenceParticipant[]>();
  for (const each of others) {
    for (const blockId of each.selection?.blockIds ?? []) {
      if (each.selection?.caret?.blockId === blockId) continue;
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

  /* the carets, measured in the sheet body */
  const carets = others.flatMap((each) => {
    const caret = each.selection?.caret;
    if (!caret || !sheet) return [];
    const box = remoteCaretBox(sheet, boxes, caret, k) ?? boxes.blocks[caret.blockId] ?? null;
    if (!box) return [];
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

  const drawPointers = pointersDrawn(presence, collaborators.length, present);
  const pointerSize = COLLAB_GEOMETRY.pointer;

  return (
    <>
      {outlines.map(({ blockId, box, holders }) => {
        const first = holders[0]!;
        const agent = first.trust === 'agent';
        const hue = agent ? null : hueHexOf(first.hue);
        const ownWins = selfBlocks.has(blockId);
        const flags = holders.slice(0, 2);
        const more = holders.length - flags.length;
        const right = (box[0] + box[2]) * k;
        const top = box[1] * k - flagH;
        return (
          <span key={`outline:${blockId}`} className="ts-remote-group" data-block={blockId}>
            {ownWins ? null : (
              <span
                className={cn(
                  COLLAB_CLASSES.remoteOutline,
                  'ts-remote-outline',
                  agent && 'is-agent',
                  halo && 'has-halo',
                )}
                style={{
                  ...place(box, k),
                  ...(hue === null ? {} : ({ '--ts-hue': hue } as CSSProperties)),
                }}
                data-client={first.clientId}
                aria-hidden="true"
              />
            )}
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
