import { COLLAB_CLASSES, COLLAB_GEOMETRY } from '@turboslide/render/collab';
import type { EditorOverlayView } from '@turboslide/viewer/Editor';

import type { CommentThreadView, EditorComments } from '../editor-shell';
import { Icon } from '../icons';
import { cn } from '../lib/cn';
import { COMMENTS } from '../menus/strings';
import { IdentityChip } from '../presence/IdentityChip';
import { tipProps } from '../Tooltip';
import { countName, markerPlace } from './comments-model';
import type { CommentsDisplay } from '../menus/model';

/**
 * The comment markers of the overlay (gslides-parity SPEC-3 5.3; research 11 6.8, 8 P3): one
 * 20 by 20 ink plate with the chat glyph at the anchored object's top right outside its box (the
 * slide's top left for a slide thread), the author's 16 px mark before it, and a count chip of
 * `min-width: 20px` in tabular figures drawn from count 1 so a second thread moves nothing; the
 * two ring halo over pictures. A click or Enter expands the card; hover shows the first line.
 * Hidden in present mode, the embed and the Hide comments display mode; Minimize draws the
 * markers alone. Every marker is absolute inside the overlay.
 */
export type CommentMarkersProps = {
  view: EditorOverlayView;
  comments: EditorComments;
  display: CommentsDisplay;
  present: boolean;
  halo?: boolean;
  onOpen: (thread: CommentThreadView, anchor: HTMLElement) => void;
};

/** The threads grouped by the box they hang on: one marker per block or per slide, with the count. */
export function markerGroups(
  threads: readonly CommentThreadView[],
  slideId: string,
): Array<{ key: string; blockId?: string; threads: CommentThreadView[] }> {
  const groups = new Map<string, { key: string; blockId?: string; threads: CommentThreadView[] }>();
  for (const thread of threads) {
    if (thread.anchor.slideId !== slideId || thread.resolved === true) continue;
    const key = thread.anchor.orphaned === true ? 'slide' : (thread.anchor.blockId ?? 'slide');
    const group = groups.get(key) ?? {
      key,
      ...(key === 'slide' ? {} : { blockId: key }),
      threads: [],
    };
    group.threads.push(thread);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function CommentMarkers({
  view,
  comments,
  display,
  present,
  halo = false,
  onOpen,
}: CommentMarkersProps) {
  if (present || display === 'hidden') return null;
  const size = COLLAB_GEOMETRY.commentMarker.size;
  const groups = markerGroups(comments.threads, view.slideId);
  return (
    <>
      {groups.map((group) => {
        const first = group.threads[0]!;
        const place = markerPlace(first.anchor, view.boxes.blocks, size, view.k);
        const open = group.threads.some((thread) => thread.id === comments.openThreadId);
        const count = group.threads.length;
        return (
          <button
            key={group.key}
            type="button"
            className={cn(
              COLLAB_CLASSES.commentMarker,
              'ts-comment-marker-btn',
              open && 'is-open',
              halo && 'has-halo',
            )}
            style={{ left: place.left, top: place.top }}
            data-control="comment.marker"
            data-thread={first.id}
            data-count={count}
            data-block={group.blockId}
            aria-label={countName(count)}
            aria-expanded={open}
            onClick={(event) => onOpen(first, event.currentTarget)}
            {...tipProps({
              name: countName(count),
              doc:
                first.comment.deleted === true
                  ? COMMENTS.deleted
                  : first.comment.text.replace(/\{@\d+\}/g, '@').slice(0, 120),
              key: 'Ctrl+Enter',
            })}
          >
            <IdentityChip identity={first.comment.author} size={16} halo={halo} />
            <span className="ts-comment-marker-plate" aria-hidden="true">
              <Icon name="chat" size={12} />
            </span>
            <span
              className={cn(COLLAB_CLASSES.commentCount, 'ts-comment-count-chip')}
              aria-hidden="true"
            >
              {count}
            </span>
          </button>
        );
      })}
    </>
  );
}
