import { describe, expect, test } from 'vitest';

import { labelFor } from './labels.ts';
import { initialsFor, markHash, markSpec } from './marks.ts';
import type { ResolvedIdentity } from './resolve.ts';

const ANON = 'anon_9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';

function identity(overrides: Partial<ResolvedIdentity> = {}): ResolvedIdentity {
  return {
    principalId: ANON,
    kind: 'anonymous',
    displayName: labelFor(ANON),
    label: labelFor(ANON),
    trust: 'label',
    avatar: { variant: 'initials' },
    deleted: false,
    admin: false,
    ...overrides,
  };
}

describe('initialsFor', () => {
  test('two words give two letters, one word gives two letters, a label gives one', () => {
    expect(initialsFor('Maya Chen', 'guest')).toBe('MC');
    expect(initialsFor('maya', 'guest')).toBe('MA');
    expect(initialsFor('Titanium 471', 'label')).toBe('T');
    expect(initialsFor("O'Neil-Jones Jr.", 'verified')).toBe('OJ');
    expect(initialsFor('田中 Maya', 'verified')).toBe('田M');
    expect(initialsFor('7', 'verified')).toBe('7');
    expect(initialsFor('---', 'verified')).toBe('');
  });
});

describe('markSpec', () => {
  test('is deterministic, monochrome by default and carries the accessible name', () => {
    const spec = markSpec(identity());
    expect(spec).toEqual(markSpec(identity()));
    expect(spec.variant).toBe('initials');
    expect(spec.initials).toBe(labelFor(ANON)[0]);
    expect(spec.hue).toBeNull();
    expect(spec.density).toBeGreaterThanOrEqual(1);
    expect(spec.density).toBeLessThanOrEqual(4);
    expect(spec.presenter).toBe(false);
    expect(spec.self).toBe(false);
    expect(spec.label).toBe(labelFor(ANON));
    expect(markHash(ANON)).toEqual({ density: spec.density, glyphSeed: spec.glyphSeed });
  });

  test('the hue comes from the room grant only', () => {
    expect(markSpec(identity(), { hueSlot: 4 }).hue).toEqual({ slot: 4, hex: '#1d8fc8' });
    expect(markSpec(identity(), { hueSlot: null }).hue).toBeNull();
    expect(
      markSpec(identity({ trust: 'agent', kind: 'agent', displayName: 'Deck bot' }), { hueSlot: 2 })
        .hue,
    ).toBeNull();
  });

  test('guests and accounts carry two initials and the trust word in the accessible name', () => {
    const guest = markSpec(identity({ displayName: 'Maya Chen', trust: 'guest' }));
    expect(guest.initials).toBe('MC');
    expect(guest.label).toBe('Maya Chen, guest');
    const verified = markSpec(
      identity({ displayName: 'Kevin Liu', trust: 'verified', kind: 'account' }),
    );
    expect(verified.label).toBe('Kevin Liu');
    const typed = markSpec(
      identity({
        displayName: 'Kevin Liu',
        trust: 'verified',
        avatar: { variant: 'initials', initials: 'kl' },
      }),
    );
    expect(typed.initials).toBe('KL');
  });

  test('the avatar choice picks the variant and the salt moves the seed', () => {
    const glyph = markSpec(identity({ avatar: { variant: 'glyph', salt: 1 } }));
    expect(glyph.variant).toBe('glyph');
    expect(glyph.initials).toBe('');
    expect(glyph.glyphSeed).not.toBe(
      markSpec(identity({ avatar: { variant: 'glyph', salt: 2 } })).glyphSeed,
    );
    expect(glyph.density).toBe(markSpec(identity()).density);
    expect(markSpec(identity({ avatar: { variant: 'dither' } })).variant).toBe('dither');
    const picture = markSpec(
      identity({
        avatar: { variant: 'picture', picture: { avatarKey: 'k', digest: 'd', sizes: [32] } },
      }),
      {
        pictureUrl: 'https://example.test/u/k/d-32.webp',
      },
    );
    expect(picture).toMatchObject({
      variant: 'picture',
      pictureUrl: 'https://example.test/u/k/d-32.webp',
    });
    // A picture choice without a URL falls back to initials so the chip is never empty.
    expect(markSpec(identity({ avatar: { variant: 'picture' } })).variant).toBe('initials');
  });

  test('the agent mark is dashed and hueless with the run id in its name', () => {
    const spec = markSpec(
      identity({ trust: 'agent', kind: 'agent', displayName: 'Deck bot', runId: 'run-12' }),
      {
        presenter: true,
        self: true,
      },
    );
    expect(spec).toMatchObject({
      variant: 'agent',
      initials: '',
      hue: null,
      presenter: true,
      self: true,
      label: 'Agent, run-12',
    });
  });
});
