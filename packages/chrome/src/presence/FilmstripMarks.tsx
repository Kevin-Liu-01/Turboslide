import { useContext } from 'react';

import { openCountOnSlide } from '../comments/comments-model';
import { countName } from '../comments/comments-model';
import { EditorShellContext } from '../editor-shell-context';
import { cn } from '../lib/cn';
import { PRESENCE } from '../menus/strings';
import { IdentityChip, nameOf } from './IdentityChip';
import { participantsOnSlide } from './presence-model';

/**
 * The filmstrip's collaborator marks and comment count (gslides-parity SPEC-3 4.3, 5.3; research
 * 11 6.4, 8 P11): in thumbnail density, 16 px chips inside the card frame at the top right, inset
 * 4 px, stacking leftwards at 2 px gaps, at most three then a 16 px `+N` chip in 9 px tabular
 * figures, with the live stripe and the halo over a picture thumbnail; in outline density one
 * 12 px chip in the marks span where the round one lease dot was, with a `+N` numeral. The count
 * chip sits to the left of the thumbnail in tabular figures with a two digit width, present at
 * zero as an empty box. Every mark is absolute inside the frame, so the card's
 * `contain-intrinsic-size` is unchanged. Without the editor shell (the view route) nothing draws.
 */
export function FilmstripMarks({
  slideId,
  picture = false,
}: {
  slideId: string;
  picture?: boolean;
}) {
  const shell = useContext(EditorShellContext);
  const others = shell?.input.presence?.others ?? [];
  const here = participantsOnSlide(others, slideId);
  const shown = here.slice(0, 3);
  const more = here.length - shown.length;
  if (here.length === 0) return null;
  return (
    <span
      className="ts-card-marks"
      aria-label={here.map(nameOf).join(', ')}
      data-count={here.length}
    >
      {more > 0 ? <span className="ts-card-marks-more">{PRESENCE.more(more)}</span> : null}
      {shown.map((participant) => (
        <IdentityChip
          key={participant.clientId}
          identity={participant}
          size={16}
          hueSlot={participant.hue ?? null}
          live
          halo={picture}
          presenter={participant.presenting === true}
        />
      ))}
    </span>
  );
}

/** The 12 px chip of the outline density, where the lease dot was. */
export function OutlineMarks({ slideId }: { slideId: string }) {
  const shell = useContext(EditorShellContext);
  const others = shell?.input.presence?.others ?? [];
  const here = participantsOnSlide(others, slideId);
  const first = here[0];
  if (first === undefined) return null;
  return (
    <span
      className="pt-orow-people"
      aria-label={here.map(nameOf).join(', ')}
      data-count={here.length}
    >
      <IdentityChip
        identity={first}
        size={14}
        hueSlot={first.hue ?? null}
        live
        className="ts-chip-12"
      />
      {here.length > 1 ? (
        <span className="pt-orow-people-more">{PRESENCE.more(here.length - 1)}</span>
      ) : null}
    </span>
  );
}

/** The comment count chip of a card: present at zero as an empty box (5.3, 4.3). */
export function CommentCountChip({ slideId }: { slideId: string }) {
  const shell = useContext(EditorShellContext);
  const threads = shell?.input.comments?.threads;
  if (threads === undefined) return null;
  const count = openCountOnSlide(threads, slideId);
  return (
    <span
      className={cn('ts-card-comments', count === 0 && 'is-empty')}
      data-control={`filmstrip.comments.${slideId}`}
      data-count={count}
      aria-label={count === 0 ? undefined : countName(count)}
      aria-hidden={count === 0 ? 'true' : undefined}
    >
      {count > 0 ? count : ''}
    </span>
  );
}
