/**
 * The sentence the product shows for an error a server function threw (the focus round, cycle 3
 * fix round; VERIFICATION.md C3-F3). A store error thrown inside a server function reaches the
 * browser as an `Error` whose message is the store's own sentence ("Vercel Blob: Too many
 * requests please lower the number of concurrent requests - try again in 60 seconds."), and the
 * words a page or a snackbar shows are the product's: plain technical English, no vendor name in
 * the default view (AGENTS.md, the copy rules). Framework free, with no import, so the route's
 * refusal page (routes/-refused-page.tsx, in the router's entry) and the editor's controller read
 * the same table without the routes and the editor importing each other.
 */
export const REFUSAL_WORDS = {
  /** a 429 from the store, or its sentence for one */
  storeBusy: 'The store is busy. Try again in a minute.',
  /** any other sentence of the store's */
  storeRefused: 'The store refused the request.',
  /** an error with no message, or one that is not an Error */
  unknown: 'The page met an error it could not recover from.',
} as const;

/** The status a server function's serialized error may carry (`DeniedError` and its kin). */
function statusOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

/** True for the store's rate limit answer: a 429 status on the error, or the store's sentence for it. */
export function isRateLimited(error: unknown): boolean {
  return statusOf(error) === 429 || /too many requests/i.test(messageOf(error));
}

/**
 * The sentence a page or a snackbar shows for a thrown error: the product's words for a store
 * error, the message itself as one full sentence otherwise, and a fixed sentence when there is
 * no message to show.
 */
export function refusalSentence(error: unknown): string {
  if (isRateLimited(error)) return REFUSAL_WORDS.storeBusy;
  const message = messageOf(error).trim();
  if (/^vercel blob\b/i.test(message)) return REFUSAL_WORDS.storeRefused;
  if (message === '') return REFUSAL_WORDS.unknown;
  return /[.!?]$/.test(message) ? message : `${message}.`;
}
