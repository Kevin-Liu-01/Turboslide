import { describe, expect, it } from 'vitest';

import type { IdentityView, PresenceParticipant } from '@turboslide/chrome/editor-shell';

import {
  avatarChoiceOf,
  meAnswerFacts,
  ownPictureUrlOf,
  ownPrincipalOf,
  rowReflects,
  rosterKeyOf,
  shellIdentitiesOf,
  viewOfRow,
} from './own-identity';

// The caller's own identity as EditorRoot hands it to the chrome (docs/PEOPLE.md 3.11, 4.1,
// 4.4; the rows people.own-chip-follows-name and people.own-chip-follows-avatar): the payload
// under the roster's own row under the last answer while the row still holds the state it held
// when the answer arrived; the answer parsed defensively; the 64 px picture URL from the choice
// or the mark; the shell's identities map from the payload under the roster under the caller.

const PICTURE =
  'https://store.test/u/A1b2C3d4E5f6G7h8I9j0K1/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef-64.webp';

const payload: IdentityView = {
  principalId: 'usr_7e2f00000000400080000000',
  label: 'Cotton 223',
  trust: 'verified',
  kind: 'account',
  email: 'maya@example.test',
};

function row(overrides: Partial<PresenceParticipant> = {}): PresenceParticipant {
  return {
    principalId: payload.principalId,
    label: 'Maya Chen',
    name: 'Maya Chen',
    trust: 'verified',
    kind: 'account',
    clientId: 'c1',
    role: 'owner',
    hue: 2,
    presenting: false,
    idle: false,
    lastSeenAt: '2026-09-29T12:00:00.000Z',
    mark: { variant: 'initials', initials: 'MC' } as unknown as PresenceParticipant['mark'],
    ...overrides,
  };
}

describe('meAnswerFacts', () => {
  it('reads the name, the trust, the mark and the choice of a meOf answer and nothing of another shape', () => {
    expect(
      meAnswerFacts({
        principal: { id: payload.principalId, kind: 'account', admin: false },
        trust: 'verified',
        label: 'Maya Chen',
        name: ' Maya Chen ',
        mark: { variant: 'picture', pictureUrl: PICTURE },
        avatar: { variant: 'picture', url: PICTURE },
      }),
    ).toEqual({
      name: 'Maya Chen',
      trust: 'verified',
      mark: { variant: 'picture', pictureUrl: PICTURE },
      avatar: { variant: 'picture', url: PICTURE },
    });
    expect(meAnswerFacts({ avatar: null, name: '' })).toEqual({ avatar: null });
    expect(meAnswerFacts(null)).toEqual({});
    expect(meAnswerFacts('ok')).toEqual({});
    expect(meAnswerFacts({ trust: 'royal', mark: 'x', avatar: { variant: 'emoji' } })).toEqual({});
  });

  it('keeps the salt a number and drops one that is not', () => {
    expect(avatarChoiceOf({ variant: 'glyph', salt: 12345 })).toEqual({
      variant: 'glyph',
      salt: 12345,
    });
    expect(avatarChoiceOf({ variant: 'glyph', salt: '12345' })).toEqual({ variant: 'glyph' });
    expect(avatarChoiceOf({ variant: 'initials', initials: 'KL' })).toEqual({
      variant: 'initials',
      initials: 'KL',
    });
  });
});

describe('ownPrincipalOf', () => {
  it('is the payload alone with no room entry and no answer', () => {
    expect(ownPrincipalOf(payload, null, null)).toEqual(payload);
  });

  it('takes the name, the trust and the mark from the roster own row and keeps the payload label, kind and email', () => {
    const out = ownPrincipalOf(payload, row(), null);
    expect(out.name).toBe('Maya Chen');
    expect(out.label).toBe('Cotton 223');
    expect(out.email).toBe('maya@example.test');
    expect(out.kind).toBe('account');
    expect(out.mark).toEqual({ variant: 'initials', initials: 'MC', self: true });
  });

  it('lets the answer overlay the row and marks the mark as the own chip', () => {
    const out = ownPrincipalOf(payload, row(), {
      name: 'Maya',
      mark: { variant: 'glyph' } as unknown as IdentityView['mark'],
    });
    expect(out.name).toBe('Maya');
    expect(out.mark).toEqual({ variant: 'glyph', self: true });
  });

  it('never takes an agent trust from an answer', () => {
    expect(ownPrincipalOf(payload, null, { trust: 'agent' }).trust).toBe('verified');
    expect(ownPrincipalOf({ ...payload, trust: 'label' }, null, { trust: 'guest' }).trust).toBe(
      'guest',
    );
  });
});

describe('rosterKeyOf', () => {
  it('changes when the own row name or mark changes and not for the room per client facts', () => {
    const before = rosterKeyOf(row());
    expect(rosterKeyOf(row({ slideId: 's2', clientId: 'c9' }))).toBe(before);
    expect(rosterKeyOf(row({ name: 'Maya' }))).not.toBe(before);
    expect(
      rosterKeyOf(row({ mark: { variant: 'glyph' } as unknown as PresenceParticipant['mark'] })),
    ).not.toBe(before);
    expect(rosterKeyOf(null)).toBe(rosterKeyOf(undefined));
  });
});

describe('ownPictureUrlOf', () => {
  it('reads the choice file, else the mark file, else nothing', () => {
    expect(ownPictureUrlOf({ variant: 'picture', url: PICTURE }, undefined)).toBe(PICTURE);
    expect(
      ownPictureUrlOf(undefined, {
        variant: 'picture',
        pictureUrl: PICTURE,
      } as unknown as IdentityView['mark']),
    ).toBe(PICTURE);
    expect(ownPictureUrlOf({ variant: 'glyph', salt: 1 }, undefined)).toBeUndefined();
    expect(
      ownPictureUrlOf({ variant: 'glyph' }, {
        variant: 'initials',
      } as unknown as IdentityView['mark']),
    ).toBeUndefined();
    expect(ownPictureUrlOf(null, undefined)).toBeUndefined();
  });
});

describe('shellIdentitiesOf', () => {
  const other: PresenceParticipant = row({
    principalId: 'anon_11111111-1111-4111-8111-111111111111',
    label: 'Titanium 471',
    name: undefined,
    trust: 'label',
    kind: 'anonymous',
    clientId: 'c2',
    role: 'editor',
    hue: 1,
  });
  const fromPayload: Record<string, IdentityView> = {
    'anon_22222222-2222-4222-8222-222222222222': {
      principalId: 'anon_22222222-2222-4222-8222-222222222222',
      label: 'Cobalt 512',
      name: 'Ada',
      trust: 'guest',
      kind: 'anonymous',
    },
  };

  it('is the controller map when it carries one, as a record', () => {
    const map = new Map<string, IdentityView>([[payload.principalId, payload]]);
    expect(shellIdentitiesOf(map, fromPayload, [other], payload)).toEqual({
      [payload.principalId]: payload,
    });
    expect(shellIdentitiesOf({ x: payload }, fromPayload, [other], payload)).toEqual({
      x: payload,
    });
  });

  it('else the payload map under the roster rows under the caller, roster rows stripped of the room facts', () => {
    const out = shellIdentitiesOf(undefined, fromPayload, [other], payload);
    expect(Object.keys(out).sort()).toEqual(
      [other.principalId, payload.principalId, 'anon_22222222-2222-4222-8222-222222222222'].sort(),
    );
    expect(out[other.principalId]).toEqual(viewOfRow(other));
    expect('clientId' in out[other.principalId]!).toBe(false);
    expect(out[payload.principalId]).toEqual(payload);
    expect(out['anon_22222222-2222-4222-8222-222222222222']?.name).toBe('Ada');
  });
});

describe('rowReflects (the answer overlay on the blob tier)', () => {
  const row = (facts: Partial<PresenceParticipant>): PresenceParticipant =>
    ({
      principalId: 'anon_1',
      label: 'Pumice 685',
      trust: 'label',
      kind: 'anonymous',
      clientId: 'c1',
      role: 'owner',
      hue: 1,
      pointer: null,
      following: null,
      presenting: false,
      idle: false,
      lastSeenAt: '2026-09-30T02:00:00.000Z',
      ...facts,
    }) as unknown as PresenceParticipant;
  const glyph = {
    variant: 'glyph',
    initials: '',
    glyphSeed: 7,
    density: 2,
  } as unknown as IdentityView['mark'];

  it('holds the name overlay until the row carries the name, whatever else on the row moved', () => {
    expect(rowReflects({ name: 'Probe Person' }, row({}))).toBe(false);
    expect(rowReflects({ name: 'Probe Person' }, row({ hue: 3, lastSeenAt: 'later' }))).toBe(false);
    expect(rowReflects({ name: 'Probe Person' }, row({ name: 'Probe Person' }))).toBe(true);
    expect(rowReflects({ name: 'Probe Person' }, null)).toBe(false);
  });

  it('holds the mark overlay until the row draws the same variant, letters and seed', () => {
    const initials = {
      variant: 'initials',
      initials: 'PP',
      density: 1,
    } as unknown as IdentityView['mark'];
    expect(rowReflects({ mark: glyph }, row({ mark: initials }))).toBe(false);
    expect(
      rowReflects(
        { mark: glyph },
        row({ mark: { ...glyph, glyphSeed: 9 } as IdentityView['mark'] }),
      ),
    ).toBe(false);
    expect(
      rowReflects(
        { mark: glyph },
        row({
          mark: { ...glyph, hue: { slot: 4, hex: '#000' } } as unknown as IdentityView['mark'],
        }),
      ),
    ).toBe(true);
    expect(
      rowReflects(
        { mark: initials },
        row({ mark: { ...initials, initials: 'PQ' } as IdentityView['mark'] }),
      ),
    ).toBe(false);
    expect(rowReflects({}, row({}))).toBe(true);
  });
});
