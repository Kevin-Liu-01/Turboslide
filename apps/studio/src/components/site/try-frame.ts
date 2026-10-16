/**
 * The words between /home and the live editor in its frame (docs/SITE.md C.11), same origin on
 * both sides: the frame (/try, src/try/) says `ts-try:ready` once its editor drew its first frame
 * with the agents in the roster; the page says `ts-try:visible` whenever the frame enters or leaves
 * the screen; and the page says `ts-try:press` when a visitor presses an avatar of the title: an
 * agent then takes its next step in the editor, and a person joins it for a short visit. The
 * appearance travels as the viewer's own `gt-theme` message and storage event
 * (@turboslide/viewer/theme), which the editor already listens to. Nothing else crosses. The words
 * live with the landing, which never imports the editor's modules (graph.test.ts).
 */
export const TRY_READY = 'ts-try:ready';
export const TRY_VISIBLE = 'ts-try:visible';
export const TRY_PRESS = 'ts-try:press';

/** The frame's address in the hero. */
export const TRY_FRAME_SRC = '/try?frame=1';

export type TryReady = { type: typeof TRY_READY };
export type TryVisible = { type: typeof TRY_VISIBLE; visible: boolean };

/** The agents of the title's second stack, by their brand ids (agent-marks.tsx). */
export const TRY_AGENT_BRANDS = ['claude-code', 'codex', 'openclaw', 'hermes'] as const;
export type TryAgentBrand = (typeof TRY_AGENT_BRANDS)[number];

/** Who a press names: an agent by its brand, or a person of the first stack by name and hue. */
export type TryPressed =
  | { kind: 'agent'; brand: TryAgentBrand }
  | { kind: 'person'; name: string; hue: 1 | 2 | 3 | 4 | 5 | 6 };
export type TryPress = { type: typeof TRY_PRESS; who: TryPressed };

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

export function isTryPress(data: unknown): data is TryPress {
  if (typeof data !== 'object' || data === null) return false;
  const row = data as { type?: unknown; who?: unknown };
  if (row.type !== TRY_PRESS || typeof row.who !== 'object' || row.who === null) return false;
  const who = row.who as { kind?: unknown; brand?: unknown; name?: unknown; hue?: unknown };
  if (who.kind === 'agent') return (TRY_AGENT_BRANDS as readonly unknown[]).includes(who.brand);
  return (
    who.kind === 'person' &&
    typeof who.name === 'string' &&
    who.name.length > 0 &&
    who.name.length <= 40 &&
    typeof who.hue === 'number' &&
    Number.isInteger(who.hue) &&
    who.hue >= 1 &&
    who.hue <= 6
  );
}
