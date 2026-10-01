// The realtime Worker's entry (docs/CLOUDFLARE.md 3.1, 3.6.2). This is the skeleton of the
// integrator's seam commit: it answers GET /health alone, with `realtime: 'unset'`, the word a
// Worker whose control tables have not been made answers (3.6.2), an empty `commit` and an empty
// `appOrigin`, since the placeholder wrangler.jsonc carries no vars. R1 replaces this file with
// the router of 3.6.2 (the upgrade behind the ticket, the ticket routes, the bearer routes, the
// D1 routes, the control routes, the CORS answer) and adds src/deck-room.ts, src/ticket.ts,
// src/sql.ts, src/db.ts and src/control.ts beside it; R6 owns wrangler.jsonc.

/** The room protocol version the hello and the ticket carry (docs/CLOUDFLARE.md 3.3). */
export const PROTOCOL = 1;

/** The body of GET /health (docs/CLOUDFLARE.md 2.3, `setup.worker.health`). */
export type HealthBody = {
  ok: true;
  protocol: number;
  commit: string;
  realtime: 'on' | 'off' | 'unset';
  appOrigin: string;
};

function health(): HealthBody {
  return { ok: true, protocol: PROTOCOL, commit: '', realtime: 'unset', appOrigin: '' };
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return Response.json(health());
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler;
