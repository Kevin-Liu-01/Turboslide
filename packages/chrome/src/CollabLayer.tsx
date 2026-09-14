import type { EditorOverlayView } from '@turboslide/viewer/Editor';

import { CommentCard } from './comments/CommentCard';
import { CommentMarkers } from './comments/CommentMarkers';
import { markerPlace } from './comments/comments-model';
import type { EditorShellState } from './editor-shell-context';
import type { CommentsDisplay } from './menus/model';
import { RemoteCursors } from './presence/RemoteCursors';
import { viewerFactsOf } from './presence/presence-model';
import { usePtShell } from './shell-context';
import { ShowChanges } from './ShowChanges';

/**
 * The collaboration layer of the overlay (gslides-parity SPEC-3 4.4, 5.3, 5.7): drawn by
 * `Overlay.tsx` after the selection ring and the handles when the editor shell is present, from
 * the shell's input and state. The remote carets, flags, outlines and pointers of the room; the
 * comment markers with their count chips; the open comment card beside its anchor, or the new
 * comment card at the selection; the hatched plates of Show changes. Everything is absolute
 * inside the overlay and moves nothing (05 rule 4).
 */
export type CollabLayerProps = { view: EditorOverlayView; shell: EditorShellState };

/** Where the card sits: to the right of the anchored box, else beside the marker's default place. */
export function cardPlace(
  view: EditorOverlayView,
  anchor: { blockId?: string },
): { left: number; top: number } {
  const box = anchor.blockId === undefined ? undefined : view.boxes.blocks[anchor.blockId];
  if (box === undefined) return { left: 24, top: 24 };
  const place = markerPlace(
    { kind: 'block', blockId: anchor.blockId, slideId: view.slideId },
    view.boxes.blocks,
    20,
    view.k,
  );
  return { left: place.left, top: Math.max(0, place.top + 24) };
}

export function CollabLayer({ view, shell }: CollabLayerProps) {
  const pt = usePtShell();
  const { input, settings } = shell;
  const present = pt.present;
  const viewer = viewerFactsOf(input.access, input.presence);
  const display = (settings.comments as CommentsDisplay | undefined) ?? 'all';
  const slide = input.document.slides[view.slideId];
  const halo = slide !== undefined && ['opener', 'mood', 'closing'].includes(slide.kind);
  const comments = input.comments;
  const canRead = input.capabilities === undefined || input.capabilities.includes('readComments');
  const canComment =
    (input.capabilities === undefined || input.capabilities.includes('comment')) &&
    settings.mode !== 'viewing';
  const owner = input.role === 'owner' || input.access?.via === 'owner';
  const canInvite = input.capabilities === undefined || input.capabilities.includes('share');
  const card = shell.commentCard;
  const openThread =
    card?.threadId !== undefined && comments !== undefined
      ? (comments.threads.find((thread) => thread.id === card.threadId) ?? null)
      : null;
  const cardAnchor = card?.anchor ?? openThread?.anchor ?? null;
  const showCard =
    card !== null &&
    cardAnchor !== null &&
    (cardAnchor.slideId === view.slideId || cardAnchor.kind === 'deck') &&
    (card.threadId === undefined ? canComment : openThread !== null) &&
    display !== 'hidden';
  return (
    <>
      {input.presence !== undefined && !present ? (
        <RemoteCursors
          view={view}
          presence={input.presence}
          viewer={viewer}
          present={present}
          halo={halo}
        />
      ) : null}
      {comments !== undefined && canRead ? (
        <CommentMarkers
          view={view}
          comments={comments}
          display={display}
          present={present}
          halo={halo}
          onOpen={(thread) => shell.openCommentCard({ threadId: thread.id })}
        />
      ) : null}
      {showCard && comments !== undefined && cardAnchor !== null ? (
        <CommentCard
          thread={openThread}
          anchor={cardAnchor}
          comments={comments}
          me={input.account?.principal}
          canComment={canComment}
          owner={owner}
          canInvite={canInvite}
          onClose={shell.closeCommentCard}
          onStep={shell.stepComment}
          say={shell.say}
          style={cardPlace(view, cardAnchor)}
        />
      ) : null}
      {display === 'expanded' && comments !== undefined && canRead && !present
        ? comments.threads
            .filter(
              (thread) =>
                thread.anchor.slideId === view.slideId &&
                thread.resolved !== true &&
                thread.id !== card?.threadId,
            )
            .map((thread) => (
              <CommentCard
                key={thread.id}
                thread={thread}
                anchor={thread.anchor}
                comments={comments}
                me={input.account?.principal}
                canComment={canComment}
                owner={owner}
                canInvite={canInvite}
                onClose={() => shell.setSetting('comments', 'all')}
                onStep={shell.stepComment}
                say={shell.say}
                style={cardPlace(view, thread.anchor)}
                control={`comment.card.${thread.id}`}
              />
            ))
        : null}
      {shell.diff !== null && settings.showChanges === true ? (
        <ShowChanges view={view} diff={shell.diff} identities={input.identities} />
      ) : null}
    </>
  );
}
