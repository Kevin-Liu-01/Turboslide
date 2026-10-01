import { describe, expect, it } from 'vitest';

import worker from '../src/index.ts';

// The skeleton's one behaviour (docs/CLOUDFLARE.md 3.6.2): GET /health answers the health body
// with `realtime: 'unset'` until the control tables exist, and every other path is 404. The
// Worker runs inside workerd under @cloudflare/vitest-plugin (the unit form of the plugin's
// guide, https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/,
// read 2026-10-01: the handler is imported and called with a Request; the skeleton's handler reads
// neither env nor ctx); R1's suite replaces this file with the object's rows.
describe('the realtime worker skeleton', () => {
  it('answers GET /health with the health body', async () => {
    const response = await worker.fetch(new Request('https://turboslide-realtime.test/health'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      protocol: 1,
      commit: '',
      realtime: 'unset',
      appOrigin: '',
    });
  });

  it('answers 404 on every other path', async () => {
    const response = await worker.fetch(new Request('https://turboslide-realtime.test/rooms/x'));
    expect(response.status).toBe(404);
  });
});
