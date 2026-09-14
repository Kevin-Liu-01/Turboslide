import { COLLAB_CLASSES } from '@turboslide/render/collab';

import type { PresenceParticipant } from '../editor-shell';
import { PRESENCE } from '../menus/strings';
import { tipProps } from '../Tooltip';
import { IdentityChip } from './IdentityChip';

/**
 * The Following plate (gslides-parity SPEC-3 4.4; research 11 6.3, 8 P4): a 240 by 24 ink plate
 * absolutely over the stage at the top centre, "Following Maya · Stop" with a 14 px chip before
 * the name and a Stop text button; it appears and leaves by opacity and moves nothing. Following
 * ends on the follower's own edit, comment, click on another slide, Slideshow, Version history,
 * the chip again and when the followed person leaves: the route owns those stops and passes
 * `following`; the plate draws it and offers Stop.
 */
export type FollowingPlateProps = {
  followed: PresenceParticipant;
  name: string;
  onStop: () => void;
};

export function FollowingPlate({ followed, name, onStop }: FollowingPlateProps) {
  return (
    <div
      className={`${COLLAB_CLASSES.following} ts-following-plate ts-chrome`}
      role="status"
      data-control="presence.following"
      data-client={followed.clientId}
    >
      <IdentityChip identity={followed} size={14} hueSlot={followed.hue ?? null} live />
      <span className="ts-following-name">{PRESENCE.following(name)}</span>
      <span className="ts-following-dot" aria-hidden="true">
        ·
      </span>
      <button
        type="button"
        className="ts-following-stop"
        data-control="presence.following.stop"
        onClick={onStop}
        {...tipProps({
          name: PRESENCE.stop,
          doc: 'Stops following; your own click or edit stops it too',
        })}
      >
        {PRESENCE.stop}
      </button>
    </div>
  );
}
