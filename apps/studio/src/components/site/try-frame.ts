/**
 * The words between /home and the live editor in its frame (docs/SITE.md C.11), same origin on
 * both sides: the frame (/try, src/try/) says `ts-try:ready` once its editor drew its first frame
 * with the agents in the roster; the page says `ts-try:visible` whenever the frame enters or leaves
 * the screen. The appearance travels as the viewer's own `gt-theme` message and storage event
 * (@turboslide/viewer/theme), which the editor already listens to. Nothing else crosses. The words
 * live with the landing, which never imports the editor's modules (graph.test.ts).
 */
export const TRY_READY = 'ts-try:ready';
export const TRY_VISIBLE = 'ts-try:visible';

/** The frame's address in the hero. */
export const TRY_FRAME_SRC = '/try?frame=1';

export type TryReady = { type: typeof TRY_READY };
export type TryVisible = { type: typeof TRY_VISIBLE; visible: boolean };

export function isTryReady(data: unknown): data is TryReady {
  return (
    typeof data === 'object' && data !== null && (data as { type?: unknown }).type === TRY_READY
  );
}

export function isTryVisible(data: unknown): data is TryVisible {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === TRY_VISIBLE &&
    typeof (data as { visible?: unknown }).visible === 'boolean'
  );
}
