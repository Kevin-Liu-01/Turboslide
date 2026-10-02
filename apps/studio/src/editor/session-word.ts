// The studio session's word on the room's socket (the realtime round fix round; build/r2.md
// R2-F2; docs/CLOUDFLARE.md 2.2 `cost.editor-idle.calls`). On the `do` tier an idle editor tab
// polled the studio session every 20 s (components/useStudioSession.ts `EMPTY_ANSWER_PAUSE_MS`),
// three function requests a minute against the tier's ceiling of one. The room's socket carries
// the word instead: the room transport (transport.ts `roomTransport`) raises one page event when
// its socket says hello or ends, and one when the room's `session` event names a studio session
// the hosted agent surface queued a command for, and the session loop polls at once on the
// second and keeps a slow idle pace while the first says open. This module holds the two event
// names, their details, the reader of the event and the last socket word per deck, with no
// import, so the session hook reads them without the transport's graph.

/**
 * The page event a room `session` event raises: the hosted agent surface queued a command
 * (`view.goto`) for the studio session the event names, so the page's session loop polls at
 * once instead of at its idle pace. On the `do` tier the Vercel function that queued the command
 * publishes the event through the deck's object, which sends it on every socket of the deck.
 * The detail is `SessionNudgeDetail`.
 */
export const SESSION_NUDGE_EVENT = 'turboslide:session-nudge';
/**
 * The page event the room transport raises when its socket says hello (`open: true`) and when
 * that socket ends or the wire falls to the stream route (`open: false`). While a socket is open
 * the page receives the nudges, so the session loop may poll at a slow idle pace. The SSE wire
 * never says `open: true`. The detail is `SessionSocketDetail`.
 */
export const SESSION_SOCKET_EVENT = 'turboslide:session-socket';

export type SessionNudgeDetail = { deckId: string; sessionId: string };
export type SessionSocketDetail = { deckId: string; open: boolean };

/** The last SESSION_SOCKET_EVENT word per deck, for a session loop that starts after the hello. */
const socketWords = new Map<string, boolean>();

/** Records the room transport's word on a deck's socket; the transport calls it beside its event. */
export function noteSocketWord(deckId: string, open: boolean): void {
  socketWords.set(deckId, open);
}

/** Whether the room transport last said its socket for the deck is open (SESSION_SOCKET_EVENT). */
export function sessionSocketOpen(deckId: string): boolean {
  return socketWords.get(deckId) === true;
}

/**
 * The session a down frame or a room event nudges: `{ type: 'session', sessionId }`, or null for
 * anything else. Read structurally, so the transport takes the event before and after it joins
 * the room event schema (`channel.ts` `RoomEvent`, `protocol.ts` `roomEventSchema`; R2-F2a).
 */
export function sessionNudgeOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as { type?: unknown; sessionId?: unknown };
  if (row.type !== 'session' || typeof row.sessionId !== 'string') return null;
  return row.sessionId !== '' && row.sessionId.length <= 128 ? row.sessionId : null;
}

/** The session a raw down frame nudges, for a frame the frame parser does not know yet; null otherwise. */
export function sessionNudgeOfText(text: string): string | null {
  if (!text.includes('"session"')) return null;
  try {
    return sessionNudgeOf(JSON.parse(text));
  } catch {
    return null;
  }
}
