// What the editor's resync read answers the room client beside the document (controller.tsx
// `resyncAnswerOf`): the origins of the records above the tab's old position, the bound, and the
// position of the document on the tier the read ran on (hardening HR-RC#7, RELIABILITY-17), each
// read off parsed JSON and left out when it is not what the room client reads. Before HR-RC#7 the
// answer carried the origins alone, so on the do tier the room client never learned the
// document's position or the read's bound.
import { describe, expect, it } from 'vitest';

import { resyncAnswerOf } from './controller';

/** A loader answer as the server function's JSON reaches the page. */
function parsed(json: string): Parameters<typeof resyncAnswerOf>[0] {
  return JSON.parse(json) as Parameters<typeof resyncAnswerOf>[0];
}

describe('resyncAnswerOf', () => {
  it('names the document’s position on its tier from the payload’s room (HR-RC#7)', () => {
    expect(resyncAnswerOf(parsed('{"room":{"seq":4210,"tier":"do","notice":null}}'))).toEqual({
      position: { seq: 4210, tier: 'do' },
    });
    expect(resyncAnswerOf(parsed('{"room":{"seq":17,"tier":"blob","notice":null}}'))).toEqual({
      position: { seq: 17, tier: 'blob' },
    });
  });

  it('leaves the position out when the payload does not name one the room client can read', () => {
    for (const json of [
      '{}',
      '{"room":{"tier":"do","notice":null}}',
      '{"room":{"seq":-1,"tier":"do","notice":null}}',
      '{"room":{"seq":4.5,"tier":"do","notice":null}}',
      '{"room":{"seq":"4210","tier":"do","notice":null}}',
      '{"room":{"seq":4210,"tier":"cloud","notice":null}}',
    ])
      expect(resyncAnswerOf(parsed(json))).toEqual({});
  });

  it('carries the read’s bound when it says true, and only then', () => {
    expect(
      resyncAnswerOf(parsed('{"bounded":true,"room":{"seq":9,"tier":"do","notice":null}}')),
    ).toEqual({ bounded: true, position: { seq: 9, tier: 'do' } });
    for (const json of ['{"bounded":false}', '{"bounded":"true"}', '{"bounded":1}', '{}'])
      expect(resyncAnswerOf(parsed(json))).toEqual({});
  });

  it('keeps the origins whose rows hold a seq and op ids, as before', () => {
    expect(
      resyncAnswerOf(
        parsed(
          '{"origins":[{"seq":5,"opIds":["a:1",""]},{"seq":"6","opIds":["a:2"]},{"seq":7,"opIds":[]},null],"room":{"seq":9,"tier":"do","notice":null}}',
        ),
      ),
    ).toEqual({ origins: [{ seq: 5, opIds: ['a:1'] }], position: { seq: 9, tier: 'do' } });
  });
});
