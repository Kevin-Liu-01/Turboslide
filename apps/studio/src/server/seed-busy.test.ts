// The seed route answers a store's "not now" with 503 and retry-after (HR-K1#4b; red team R7): a
// layout record that did not read, a freeze or the store's deadline must not reach the realtime
// Worker as a 500, which it counts as the deployment failing and which moves every tab off the do
// tier after two (deck-room.ts AppCallError.reach). Any other error is still thrown.
import { describe, expect, it, vi } from 'vitest';

import { StorageLayoutError } from '@turboslide/store/migrate';

const state = vi.hoisted(() => ({ error: null as Error | null }));

vi.mock('./root', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasStoredDeck: () =>
    state.error === null ? Promise.resolve(false) : Promise.reject(state.error),
}));
vi.mock('./room-bearer', () => ({ roomBearerMatches: () => true }));

const { Route } = await import('../routes/api/decks.$deckId.seed');

type Handler = (input: { params: { deckId: string }; request: Request }) => Promise<Response>;
const get = (Route.options as unknown as { server: { handlers: { GET: Handler } } }).server.handlers
  .GET;
const call = () =>
  get({
    params: { deckId: 'q8wf2kzr0uyb3nxc5vlp1a7h2m' },
    request: new Request('https://www.turboslide.com/api/decks/q8wf2kzr0uyb3nxc5vlp1a7h2m/seed'),
  });

describe('the seed route on a store that answers "not now" (HR-K1#4b)', () => {
  it('answers 503 with retry-after for a layout record that did not read, and throws anything else', async () => {
    state.error = new StorageLayoutError('meta.json did not answer');
    const busy = await call();
    expect(busy.status).toBe(503);
    expect(busy.headers.get('retry-after')).toBe('5');
    expect(await busy.json()).toEqual({ error: 'store_busy' });
    state.error = new Error('a bug');
    await expect(call()).rejects.toThrow('a bug');
    state.error = null;
    expect((await call()).status).toBe(404);
  });
});
