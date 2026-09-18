import { useRef, useState } from 'react';

import { COLLAB_CLASSES } from '@turboslide/render/collab';

import { useEditorShell } from '../editor-shell-context';
import type { EditorPresence, IdentityView, PresenceParticipant } from '../editor-shell';
import { cn } from '../lib/cn';
import { isPresent, itemById } from '../menus/model';
import { PRESENCE } from '../menus/strings';
import { tipProps } from '../Tooltip';
import { AccountMenu } from './AccountMenu';
import { IdentityChip } from './IdentityChip';
import { RosterMenu } from './RosterMenu';
import { canFollow, chipTipOf, slideNumberOf, slotChips, viewerFactsOf } from './presence-model';

/**
 * The presence slot of the title row (gslides-parity SPEC-3 4.2, 9.3; research 11 6.2, 8 P1):
 * `--pt-presence-w` (184 px) by 32 px, present from the first paint whether nobody or twenty
 * people are present. Four 24 px slots for others in roster order with 4 px gaps, the 32 by 24
 * `+N` chip drawn empty with its border until a fifth person joins, an 8 px gap, a hair rule, a
 * 7 px gap and the own chip with a 1 px ink border. A chip appears and leaves by opacity; a
 * click follows the person (4.4) or, where Follow is refused, jumps once to their slide; the
 * `+N` chip opens the roster menu (4.5); the own chip opens the own chip's menu (7.5). The row's
 * width never changes when a person joins or leaves.
 */
const EMPTY: EditorPresence = { others: [] };

/** The identity the own chip shows when the route passed no account: a label from the presence self, else nothing. */
function selfIdentity(
  presence: EditorPresence,
  account: { principal: IdentityView } | undefined,
): IdentityView | null {
  if (account !== undefined) return account.principal;
  return presence.self ?? null;
}

export function PresenceSlot() {
  const shell = useEditorShell();
  const { input } = shell;
  const presence = input.presence ?? EMPTY;
  const viewer = viewerFactsOf(input.access, presence);
  const { shown, more } = slotChips(presence.others);
  const self = selfIdentity(presence, input.account);
  const [roster, setRoster] = useState<HTMLElement | null>(null);
  const [account, setAccount] = useState<HTMLElement | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const meRef = useRef<HTMLButtonElement>(null);
  const item = itemById('title.presence');

  const follow = (participant: PresenceParticipant) => {
    if (presence.following === participant.clientId) presence.onUnfollow?.();
    else if (presence.onFollow) presence.onFollow(participant.clientId);
    else if (input.editor?.followClient) input.editor.followClient(participant.clientId);
    else goTo(participant);
  };
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
    >
      {Array.from({ length: 4 }, (_slot, i) => {
        const participant = shown[i];
        if (participant === undefined)
          return (
            <span key={`slot:${i}`} className="ts-presence-slot is-empty" aria-hidden="true" />
          );
        const n = slideNumberOf(input.document, participant.slideId);
        const following = presence.following === participant.clientId;
        const follows = canFollow(participant, input.capabilities);
        return (
          <button
            key={participant.clientId}
            type="button"
            className={cn('ts-presence-slot', 'ts-presence-chip', following && 'is-following')}
            data-control={`presence.chip.${participant.clientId}`}
            data-client={participant.clientId}
            data-menu-item={follows ? 'title.presence.follow' : 'title.presence.goTo'}
            aria-pressed={follows ? following : undefined}
            onClick={() => (follows ? follow(participant) : goTo(participant))}
            {...tipProps({
              name: following
                ? PRESENCE.following(participant.name ?? participant.label)
                : chipTipOf(participant, viewer, n),
              doc: follows
                ? 'Click to follow; click again to stop'
                : n === null
                  ? 'This person has no slide open'
                  : PRESENCE.goToSlide(n),
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
      <button
        ref={moreRef}
        type="button"
        className={cn('ts-presence-more', more === 0 && 'is-empty')}
        data-control="presence.more"
        aria-haspopup="menu"
        aria-expanded={roster !== null}
        aria-label={
          more === 0 ? PRESENCE.collaborators : `${PRESENCE.more(more)}, ${PRESENCE.collaborators}`
        }
        onClick={() => setRoster((open) => (open === null ? moreRef.current : null))}
        {...tipProps({ name: PRESENCE.collaborators, doc: item.doc ?? '' })}
      >
        <span className="ts-presence-count">{more > 0 ? PRESENCE.more(more) : ''}</span>
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
          returnFocusTo={moreRef.current}
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
