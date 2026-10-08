import { describe, expect, test } from 'vitest';

import { roomBearerMatches } from './room-bearer.ts';

// The app's check of the object's calls (the checkpoint and seed routes): the room bearer, and
// its rotation partner while one is in flight (docs/hosting.md 13.8). The values are test values.

const CURRENT = 'room-bearer-current-0000000000000000000000000000000000000000';
const PARTNER = 'room-bearer-partner-0000000000000000000000000000000000000000';

const request = (authorization?: string): Request =>
  new Request('http://localhost/api/decks/q4/checkpoint', {
    method: 'POST',
    headers: authorization === undefined ? {} : { authorization },
  });

describe('roomBearerMatches', () => {
  test('takes the room bearer and refuses any other value or none', () => {
    const env = { TURBOSLIDE_ROOM_BEARER: CURRENT };
    expect(roomBearerMatches(request(`Bearer ${CURRENT}`), env)).toBe(true);
    expect(roomBearerMatches(request(`bearer ${CURRENT}`), env)).toBe(true);
    expect(roomBearerMatches(request(`Bearer ${PARTNER}`), env)).toBe(false);
    expect(roomBearerMatches(request(`Bearer ${CURRENT}x`), env)).toBe(false);
    expect(roomBearerMatches(request(`Ticket ${CURRENT}`), env)).toBe(false);
    expect(roomBearerMatches(request(), env)).toBe(false);
  });

  test('takes the rotation partner too while TURBOSLIDE_ROOM_BEARER_PREVIOUS is set', () => {
    const env = { TURBOSLIDE_ROOM_BEARER: CURRENT, TURBOSLIDE_ROOM_BEARER_PREVIOUS: PARTNER };
    expect(roomBearerMatches(request(`Bearer ${CURRENT}`), env)).toBe(true);
    expect(roomBearerMatches(request(`Bearer ${PARTNER}`), env)).toBe(true);
    expect(roomBearerMatches(request('Bearer something-else'), env)).toBe(false);
  });

  test('a deployment without the room bearer refuses every call, the partner alone included', () => {
    expect(roomBearerMatches(request(`Bearer ${CURRENT}`), {})).toBe(false);
    expect(roomBearerMatches(request('Bearer '), { TURBOSLIDE_ROOM_BEARER: '' })).toBe(false);
    expect(
      roomBearerMatches(request(`Bearer ${PARTNER}`), {
        TURBOSLIDE_ROOM_BEARER: '',
        TURBOSLIDE_ROOM_BEARER_PREVIOUS: PARTNER,
      }),
    ).toBe(false);
  });
});
