import type { DeckDocument } from '@turboslide/schema/deck';

import type { EditorCapability, EditorPresence, PresenceParticipant } from '../editor-shell';
import { cn } from '../lib/cn';
import type { MenuCloseReason } from '../Menu';
import { isPresent, itemById } from '../menus/model';
import type { MenuContext } from '../menus/model';
import { PRESENCE, stubClause } from '../menus/strings';
import { tipProps } from '../Tooltip';
import { IdentityChip } from './IdentityChip';
import { PlateMenu } from './PlateMenu';
import {
  canFollow,
  displayNameFor,
  rosterRoleWord,
  slideNumberOf,
  trustWordFor,
} from './presence-model';
import type { ViewerFacts } from './presence-model';

/**
 * The roster menu (gslides-parity SPEC-3 4.5, 0.41, 0.42; research 11 6.2, 8 P12): the `+N`
 * chip and Shift+Tab from any open menu open it; one 32 px row per participant in a fixed 240 px
 * width and a ten row scroll region: the chip, the name and trust word, the role word, "slide 12",
 * and Follow or "Go to slide 12" (the one time jump offered where Follow is refused, 4.4); the own
 * row reads "(you)" and opens the own chip's menu; then a divider and "Join chat", present and
 * disabled with its clause. Enter on a row jumps to that person's slide (01 G5). It is the
 * Collaborators list of 4.9: the menu's accessible name says so.
 *
 * The focus round (docs/FOCUS.md 3.1, 3.2; b6's FR2): the row `title.presence.follow` and the
 * Later stub `title.presence.joinChat` are parked, so the Follow word and the Join chat footer
 * are drawn only while `isPresent` says so for the menu context; the rows themselves, the chips,
 * the names and the slide numbers stay, and Enter or a click on a row still jumps (the chips stay
 * drawn, 3.2). The Go to slide word (`title.presence.goTo`) reads the same predicate and is in the
 * default view since the features round's ship one, when its row collab.roster.go-to-slide read
 * green in both preview runs of record (docs/gslides-parity/focus/ship-f1afe1e.json `leaves`).
 */
export type RosterMenuProps = {
  anchor: HTMLElement;
  presence: EditorPresence;
  document: DeckDocument;
  viewer: ViewerFacts;
  capabilities?: readonly EditorCapability[];
  /** the shell's menu context: the parked rows read Tools > Advanced tools from it */
  context: MenuContext;
  onFollow: (participant: PresenceParticipant) => void;
  onGoTo: (participant: PresenceParticipant) => void;
  onAccount: (anchor: HTMLElement) => void;
  onClose: (reason: MenuCloseReason) => void;
  returnFocusTo?: HTMLElement | null;
};

export function RosterMenu({
  anchor,
  presence,
  document,
  viewer,
  capabilities,
  context,
  onFollow,
  onGoTo,
  onAccount,
  onClose,
  returnFocusTo,
}: RosterMenuProps) {
  const joinChat = itemById('title.presence.joinChat');
  const showJoinChat = isPresent(joinChat, context);
  const showFollowWord = isPresent(itemById('title.presence.follow'), context);
  const showGoToWord = isPresent(itemById('title.presence.goTo'), context);
  /* the own row opens the account menu, parked whole (3.2): it is listed only while the switch is on */
  const showOwnRow = isPresent(itemById('title.presence.me'), context);
  const rows: PresenceParticipant[] = [
    ...(presence.self === undefined || !showOwnRow ? [] : [presence.self]),
    ...presence.others,
  ];
  return (
    <PlateMenu
      anchor={anchor}
      label={PRESENCE.collaborators}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      id="ts-menu-roster"
      control="presence.roster"
      className="ts-roster"
      footer={
        showJoinChat ? (
          <div className="ts-roster-foot">
            <span className="ts-menu-divider" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="ts-roster-row is-stub"
              aria-disabled="true"
              data-focusable=""
              data-menu-item={joinChat.id}
              data-status="later"
              {...tipProps({ name: joinChat.label, doc: stubClause(joinChat.stubReason ?? '') })}
            >
              <span className="ts-roster-name">{joinChat.label}</span>
            </button>
          </div>
        ) : undefined
      }
    >
      {rows.map((participant) => {
        const self = participant.clientId === presence.self?.clientId;
        const n = slideNumberOf(document, participant.slideId);
        const name = self
          ? (participant.name ?? participant.label)
          : displayNameFor(participant, viewer);
        const trust = trustWordFor(participant);
        const following = presence.following === participant.clientId;
        const follow = !self && canFollow(participant, capabilities);
        const tip = self
          ? {
              name: `${name} ${PRESENCE.you}`,
              doc: 'Your name and avatar, and the ways to sign in and out',
            }
          : follow
            ? {
                name: PRESENCE.follow,
                doc: 'Jumps to that person’s slide and moves with them; your own edit or click stops it',
              }
            : {
                name: n === null ? name : PRESENCE.goToSlide(n),
                doc: 'A one time jump to the slide that person has open',
              };
        return (
          <button
            key={participant.clientId}
            type="button"
            role="menuitem"
            className={cn('ts-roster-row', self && 'is-self', following && 'is-following')}
            data-control={`presence.roster.${participant.clientId}`}
            data-client={participant.clientId}
            data-menu-item={
              self ? 'title.presence.me' : follow ? 'title.presence.follow' : 'title.presence.goTo'
            }
            onClick={(event) => {
              if (self) {
                onAccount(event.currentTarget);
                return;
              }
              if (follow) onFollow(participant);
              else onGoTo(participant);
            }}
            {...tipProps(tip)}
          >
            <IdentityChip
              identity={participant}
              size={24}
              hueSlot={participant.hue ?? null}
              live
              self={self}
              presenter={participant.presenting === true}
            />
            <span className="ts-roster-text">
              <span className="ts-roster-name">
                {name}
                {self ? ` ${PRESENCE.you}` : ''}
                {trust !== null ? <span className="ts-roster-trust"> · {trust}</span> : null}
              </span>
              <span className="ts-roster-meta">
                {self ? '' : rosterRoleWord(participant)}
                {participant.presenting === true && n !== null
                  ? `${self ? '' : ' · '}${PRESENCE.presenting(n)}`
                  : n !== null
                    ? `${self ? '' : ' · '}${PRESENCE.slide(n)}`
                    : ''}
              </span>
            </span>
            {!self ? (
              <span className="ts-roster-act">
                {follow
                  ? showFollowWord
                    ? following
                      ? PRESENCE.stop
                      : PRESENCE.follow
                    : ''
                  : n === null || !showGoToWord
                    ? ''
                    : PRESENCE.goToSlide(n)}
              </span>
            ) : null}
          </button>
        );
      })}
    </PlateMenu>
  );
}
