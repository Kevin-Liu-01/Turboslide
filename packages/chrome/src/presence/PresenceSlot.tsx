import { useRef, useState } from 'react';

import { COLLAB_CLASSES } from '@turboslide/render/collab';

import { useEditorShell } from '../editor-shell-context';
import type { EditorPresence, PresenceParticipant } from '../editor-shell';
import { Icon } from '../icons';
import { cn } from '../lib/cn';
import { isPresent, itemById } from '../menus/model';
import { PRESENCE } from '../menus/strings';
import { tipProps } from '../Tooltip';
import { AccountMenu } from './AccountMenu';
import { IdentityChip } from './IdentityChip';
import { RosterMenu } from './RosterMenu';
import {
  canFollow,
  chipTipDocOf,
  chipTipOf,
  meOf,
  slideNumberOf,
  slotChips,
  viewerFactsOf,
} from './presence-model';

/**
 * The presence slot of the title row (gslides-parity SPEC-3 4.2, 9.3; research 11 6.2, 8 P1):
 * `--pt-presence-w` (184 px) by 32 px, present from the first paint whether nobody or twenty
 * people are present. Four 24 px slots for others in roster order with 4 px gaps, the 32 by 24
 * `+N` chip drawn empty with its border until a fifth person joins, an 8 px gap, a hair rule, a
 * 7 px gap and the own chip with a 1 px ink border. A chip appears and leaves by opacity; a
 * click on a chip jumps once to the slide that person has open (Go to slide, the click Google
 * Slides gives the avatar; the row collab.roster.go-to-slide); the people button (`+N` once a
 * fifth person joins) opens the roster (4.5), whose row for each person offers Follow (4.4), Stop
 * while they are followed, or Go to slide where Follow is refused; the own chip opens the own
 * chip's menu (7.5). The row's width never changes when a person joins or leaves. The slot itself
 * carries a tooltip naming who is in the presentation now (docs/archive/rounds/PRODUCT.md section 2 rank 30;
 * audit-seller 32).
 *
 * The polish round (docs/archive/rounds/POLISH.md item 104; the row collab.follow.anonymous-editor): before it a
 * chip's click followed the person at once and a second click stopped, with no word on screen,
 * and the roster row's click toggled the same state, so a seller who clicked a chip to see who it
 * was started following, and a click on the roster row after a chip click stopped a follow just
 * started (the verifier read A following B's move in one of two runs). The fix round made the
 * chip open the roster at the chip, and the jump moved into the roster's row with it, so the
 * chip's click no longer jumped (VERIFICATION.md "Polish round, pass 2" finding 5, the row red on
 * both tiers). Since the fix round 2 the chip's click is the jump and nothing else, and Follow
 * lives in the roster alone, where its word says what the click does.
 *
 * The realtime round (docs/REALTIME.md 2 row realtime.follow.for-everyone, 7 default 5): Follow is
 * in the default view for every editor and owner, by link included. The row
 * `title.presence.follow` lost `advanced: true` (the integrator, build/r3.md request 1) and the
 * `follow` cell left the link visitor's refusals (packages/identity/src/access.ts), so
 * `followOffered` below reads true without the Advanced tools switch; the follow ends on the six
 * triggers Google names, run by the editor's controller (apps/studio/src/editor/follow-rules.ts).
 */

/**
 * The slot's tooltip props, held to the slot itself: the tooltip system schedules the anchor of
 * every `data-tip` element a mouse event reaches (Tooltip.tsx scheduleTooltip, no containment), so
 * the group's handlers, reached by the bubble from a chip, cancelled the chip's pending tip and
 * showed the slot's sentence over every chip (read in the fix round 2's hand drive: the mouse on
 * B's chip read "Collaborators. Who is in this presentation now" and never the person's name and
 * slide). A mouse event whose target sits inside a nested anchor is left to that anchor.
 */
function slotTipProps(others: number): ReturnType<typeof tipProps> {
  const props = tipProps(presenceSlotTip(others));
  const own = (event: { target: EventTarget | null; currentTarget: HTMLElement }): boolean =>
    !(event.target instanceof Element) ||
    event.target.closest('[data-tip]') === event.currentTarget;
  return {
    ...props,
    onMouseEnter: (event) => {
      if (own(event)) props.onMouseEnter(event);
    },
    onMouseMove: (event) => {
      if (own(event)) props.onMouseMove(event);
    },
  };
}

/** The slot's tooltip (rank 30): the name and one sentence, with the count while others are present. */
export function presenceSlotTip(others: number): { name: string; doc: string } {
  return {
    name: PRESENCE.collaborators,
    doc:
      others === 0
        ? 'Who is in this presentation now. Nobody else has it open'
        : `Who is in this presentation now. ${others === 1 ? 'One other person has' : `${others} other people have`} it open`,
  };
}
const EMPTY: EditorPresence = { others: [] };

export function PresenceSlot() {
  const shell = useEditorShell();
  const { input } = shell;
  const presence = input.presence ?? EMPTY;
  const viewer = viewerFactsOf(input.access, presence);
  const { shown, more } = slotChips(presence.others);
  /* the own chip reads what others see (docs/archive/rounds/PEOPLE.md 3.11): one source with the roster's own
     row, the account head, the Profile head, the version rows and the Share dialog */
  const self = meOf({ account: input.account, presence });
  const [roster, setRoster] = useState<HTMLElement | null>(null);
  const [account, setAccount] = useState<HTMLElement | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const meRef = useRef<HTMLButtonElement>(null);
  const item = itemById('title.presence');

  /* the roster row's action: Stop while the person is followed (the row reads Stop), Follow
     otherwise; the one time jump where Follow is refused */
  const follow = (participant: PresenceParticipant) => {
    if (presence.following === participant.clientId) presence.onUnfollow?.();
    else if (presence.onFollow) presence.onFollow(participant.clientId);
    else if (input.editor?.followClient) input.editor.followClient(participant.clientId);
    else goTo(participant);
  };
  /* the Follow word is drawn in the roster while its row is present (docs/FOCUS.md 3.1); in the
     default view since the realtime round, under the `follow` capability */
  const followOffered = isPresent(itemById('title.presence.follow'), shell.menuContext);
  const goTo = (participant: PresenceParticipant) => {
    if (presence.onGoTo) presence.onGoTo(participant.clientId);
    else if (input.editor?.goToClient) input.editor.goToClient(participant.clientId);
    else if (participant.slideId !== undefined) input.navigate?.(`#${participant.slideId}`);
  };

  return (
    <div
      className={cn(COLLAB_CLASSES.presence, 'ts-presence')}
      data-control="title.presence"
      data-menu-item={item.id}
      data-count={presence.others.length}
      role="group"
      aria-label={PRESENCE.collaborators}
      {...slotTipProps(presence.others.length)}
    >
      {Array.from({ length: 4 }, (_slot, i) => {
        const participant = shown[i];
        if (participant === undefined)
          return (
            <span key={`slot:${i}`} className="ts-presence-slot is-empty" aria-hidden="true" />
          );
        const n = slideNumberOf(input.document, participant.slideId);
        const following = presence.following === participant.clientId;
        const follows = followOffered && canFollow(participant, input.capabilities);
        return (
          <button
            key={participant.clientId}
            type="button"
            className={cn('ts-presence-slot', 'ts-presence-chip', following && 'is-following')}
            data-control={`presence.chip.${participant.clientId}`}
            data-client={participant.clientId}
            data-menu-item="title.presence.goTo"
            data-following={following ? '' : undefined}
            aria-label={
              n === null ? (participant.name ?? participant.label) : PRESENCE.goToSlide(n)
            }
            onClick={() => goTo(participant)}
            {...tipProps({
              name: following
                ? PRESENCE.following(participant.name ?? participant.label)
                : chipTipOf(participant, viewer, n),
              /* the trust sentence first (docs/archive/rounds/PEOPLE.md 3.7), then what a click does: the chip's
                 click is the one time jump; Follow is in the list while its row is offered
                 (docs/archive/rounds/POLISH.md item 104) */
              doc: chipTipDocOf(
                participant,
                viewer,
                n === null
                  ? 'This person has no slide open'
                  : follows
                    ? 'Jumps to the slide this person has open. Follow is in the list'
                    : 'Jumps to the slide this person has open',
              ),
            })}
          >
            <IdentityChip
              identity={participant}
              size={24}
              hueSlot={participant.hue ?? null}
              live
              presenter={participant.presenting === true}
            />
          </button>
        );
      })}
      {/* the roster's opener: `+N` once a fifth person joins, a people glyph while the chips fit,
          and nothing drawn while nobody else is present (docs/archive/rounds/RETURN.md 4.3: no empty box). The
          roster (Go to slide with the person's slide and role) needs an opener from the first other
          person, which the empty box was before the rule hid it (return/build/b4.md request 6,
          collab.roster.go-to-slide) */}
      <button
        ref={moreRef}
        type="button"
        className={cn('ts-presence-more', presence.others.length === 0 && 'is-empty')}
        data-control="presence.more"
        aria-haspopup="menu"
        aria-expanded={roster !== null}
        aria-label={
          more === 0 ? PRESENCE.collaborators : `${PRESENCE.more(more)}, ${PRESENCE.collaborators}`
        }
        onClick={() => setRoster((open) => (open === null ? moreRef.current : null))}
        {...tipProps({ name: PRESENCE.collaborators, doc: item.doc ?? '' })}
      >
        {more > 0 ? (
          <span className="ts-presence-count">{PRESENCE.more(more)}</span>
        ) : presence.others.length > 0 ? (
          <Icon name="user-group" size={14} />
        ) : (
          <span className="ts-presence-count" />
        )}
      </button>
      {/* the own chip opens the account menu, parked whole (docs/FOCUS.md 3.2): the chip and its
          rule are drawn only while Tools > Advanced tools is on; the other people's chips stay
          drawn (3.2: "the presence chips themselves stay drawn") */}
      {isPresent(itemById('title.account'), shell.menuContext) ? (
        <>
          <span className="ts-presence-rule" aria-hidden="true" />
          <button
            ref={meRef}
            type="button"
            className="ts-presence-me"
            data-control="title.account"
            data-menu-item="title.account"
            aria-haspopup="menu"
            aria-expanded={account !== null}
            aria-label={itemById('title.account').label}
            onClick={() => setAccount((open) => (open === null ? meRef.current : null))}
            {...tipProps({
              name:
                self === null
                  ? itemById('title.account').label
                  : `${self.name ?? self.label} ${PRESENCE.you}`,
              doc: itemById('title.account').doc ?? '',
            })}
          >
            {self === null ? (
              <span className="ts-chip is-self is-blank" aria-hidden="true" />
            ) : (
              <IdentityChip identity={self} size={24} self />
            )}
          </button>
        </>
      ) : null}
      {roster !== null ? (
        <RosterMenu
          anchor={roster}
          presence={presence}
          document={input.document}
          viewer={viewer}
          capabilities={input.capabilities}
          context={shell.menuContext}
          onFollow={(participant) => {
            setRoster(null);
            follow(participant);
          }}
          onGoTo={(participant) => {
            setRoster(null);
            goTo(participant);
          }}
          onAccount={() => {
            setRoster(null);
            setAccount(meRef.current);
          }}
          onClose={() => setRoster(null)}
          returnFocusTo={roster}
        />
      ) : null}
      {account !== null && self !== null ? (
        <AccountMenu
          anchor={account}
          identity={self}
          account={input.account}
          context={shell.menuContext}
          runItem={shell.runItem}
          onClose={() => setAccount(null)}
          returnFocusTo={meRef.current}
        />
      ) : null}
    </div>
  );
}

export { openRoster } from './roster-hook';
