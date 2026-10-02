// The socket frames and the ticket codec (docs/CLOUDFLARE.md 3.3, 3.6.1): an up frame parses
// against the POST schemas, a down frame is an event or one of the object's own, the heartbeat is
// not JSON, and a token splits into the signed bytes and a 32 byte MAC.
import { describe, expect, it } from 'vitest';

import {
  HEARTBEAT_REQUEST,
  ackOf,
  base64url,
  encodeTicket,
  fromBase64url,
  offersRoomProtocol,
  parseDownFrame,
  parseTicketClaims,
  parseUpFrame,
  splitTicket,
  ticketOfProtocols,
  viewerFactsOfClaims,
} from './frames.ts';
import type { TicketClaims } from './frames.ts';

const CLIENT = 'a'.repeat(32);

describe('frames', () => {
  it('parses an ops frame against the POST schema with its req, and refuses a foreign op id', () => {
    const frame = parseUpFrame(
      JSON.stringify({
        t: 'ops',
        req: 3,
        clientId: CLIENT,
        base: { seq: 2 },
        entries: [
          {
            opId: `${CLIENT}:1`,
            kind: 'edit',
            mutations: [
              {
                op: 'text.splice',
                slideId: 'title',
                blockId: 'h',
                path: '/text',
                at: 0,
                remove: 0,
                insert: 'a',
              },
            ],
          },
        ],
      }),
    );
    expect(frame).toMatchObject({ t: 'ops', req: 3, clientId: CLIENT, base: { seq: 2 } });
    expect(
      parseUpFrame(
        JSON.stringify({
          t: 'ops',
          req: 1,
          clientId: CLIENT,
          base: { seq: 0 },
          entries: [{ opId: `${'b'.repeat(32)}:1`, kind: 'edit', mutations: [] }],
        }),
      ),
    ).toBeNull();
    expect(
      parseUpFrame(JSON.stringify({ t: 'ops', clientId: CLIENT, base: { seq: 0 }, entries: [] })),
    ).toBeNull();
  });

  it('parses presence, leave, ticket and join, and drops the heartbeat and an unknown frame', () => {
    expect(
      parseUpFrame(
        JSON.stringify({
          t: 'presence',
          clientId: CLIENT,
          clock: 4,
          pointerOn: false,
          presenting: false,
        }),
      ),
    ).toMatchObject({ t: 'presence', clock: 4 });
    expect(parseUpFrame(JSON.stringify({ t: 'leave', clock: 9 }))).toEqual({
      t: 'leave',
      clock: 9,
    });
    expect(parseUpFrame(JSON.stringify({ t: 'ticket', ticket: 'x.y' }))).toEqual({
      t: 'ticket',
      ticket: 'x.y',
    });
    expect(parseUpFrame(JSON.stringify({ t: 'join', ticket: 'x.y' }))).toEqual({
      t: 'join',
      ticket: 'x.y',
    });
    expect(parseUpFrame(HEARTBEAT_REQUEST)).toBeNull();
    expect(parseUpFrame(JSON.stringify({ t: 'dance' }))).toBeNull();
    expect(parseUpFrame('{')).toBeNull();
  });

  it('parses down frames: an event, an ack of both shapes, reauth, resend, presence-refused and room', () => {
    expect(parseDownFrame(JSON.stringify({ type: 'leave', clientId: CLIENT }))).toEqual({
      kind: 'event',
      event: { type: 'leave', clientId: CLIENT },
    });
    expect(parseDownFrame(JSON.stringify({ type: 'resend' }))).toEqual({
      kind: 'resend',
      frame: { type: 'resend' },
    });
    const ok = ackOf(2, { ok: true, entries: [], rejected: [], head: 5, revision: 1 });
    expect(parseDownFrame(JSON.stringify(ok))).toEqual({ kind: 'ack', frame: ok });
    const refused = ackOf(3, {
      ok: false,
      status: 409,
      code: 'resync',
      message: 'behind',
      head: 9,
    });
    expect(parseDownFrame(JSON.stringify(refused))).toEqual({ kind: 'ack', frame: refused });
    expect(parseDownFrame(JSON.stringify({ t: 'reauth' }))).toEqual({
      kind: 'reauth',
      frame: { t: 'reauth' },
    });
    expect(
      parseDownFrame(JSON.stringify({ t: 'presence-refused', reason: 'budget' })),
    ).toMatchObject({
      kind: 'presence-refused',
    });
    expect(
      parseDownFrame(
        JSON.stringify({ t: 'room', colo: 'SJC', object: 'abcdef12', idleMs: 2000, maxMs: 10000 }),
      ),
    ).toMatchObject({ kind: 'room', frame: { colo: 'SJC' } });
    expect(parseDownFrame(JSON.stringify({ type: 'dance' }))).toBeNull();
    expect(parseDownFrame(JSON.stringify({ t: 'dance' }))).toBeNull();
  });

  it('round trips base64url and splits a ticket into its signed bytes and a 32 byte MAC', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(fromBase64url(base64url(bytes))).toEqual(bytes);
    expect(fromBase64url('not base64url!')).toBeNull();
    const mac = new Uint8Array(32).fill(7);
    const token = encodeTicket('{"a":1}', mac);
    expect(token).not.toContain('=');
    const split = splitTicket(token);
    expect(split?.claimsText).toBe('{"a":1}');
    expect(split?.mac).toEqual(mac);
    expect(splitTicket('nodot')).toBeNull();
    expect(splitTicket('a.b.c')).toBeNull();
    expect(splitTicket(encodeTicket('{}', new Uint8Array(16)))).toBeNull();
  });

  it('parses the claims and reads the viewer facts, and finds the ticket in the subprotocols', () => {
    const claims: TicketClaims = {
      v: 1,
      deck: 'gt-brand',
      cid: CLIENT,
      id: 'anon_00000000-0000-4000-8000-000000000001',
      kind: 'anonymous',
      pid: 'anon_00000000-0000-4000-8000-000000000001',
      role: 'editor',
      via: 'link',
      names: false,
      rc: true,
      label: 'Someone',
      trust: 'label',
      mark: {},
      org: 'http://localhost:4471',
      iat: 1,
      exp: 2,
    };
    expect(parseTicketClaims(JSON.stringify(claims))).toEqual(claims);
    expect(parseTicketClaims(JSON.stringify({ ...claims, extra: 1 }))).toBeNull();
    expect(parseTicketClaims('{')).toBeNull();
    expect(viewerFactsOfClaims(claims)).toEqual({
      role: 'editor',
      via: 'link',
      showNames: false,
      readComments: true,
      principalId: claims.pid,
    });
    expect(ticketOfProtocols('turboslide.v1, ticket.abc.def')).toBe('abc.def');
    expect(ticketOfProtocols('turboslide.v1')).toBeNull();
    expect(ticketOfProtocols(null)).toBeNull();
    expect(offersRoomProtocol('turboslide.v1, ticket.x')).toBe(true);
    expect(offersRoomProtocol('other')).toBe(false);
  });
});
