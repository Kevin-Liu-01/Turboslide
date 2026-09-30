// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { IdentityView } from '../editor-shell';
import { PRESENCE } from '../menus/strings';
import {
  IdentityChip,
  TrustMark,
  chipName,
  pictureSources,
  trustMarkOf,
  trustWordOf,
} from '../presence/IdentityChip';

// The identity chip of the people round (docs/PEOPLE.md 3.4, 3.7, 4.4; 6.5
// identity-chip.test.tsx): the badge for a verified account and not for a deleted one, the
// picture's srcset and decoding, the fallback to the initials field when the picture fails, and
// the field at size - 4 at every chip size, 8 px at the outline row's 12.

afterEach(cleanup);

const verified: IdentityView = {
  principalId: 'usr_1',
  label: 'Cobalt 512',
  name: 'Ada Lovelace',
  trust: 'verified',
  kind: 'account',
  email: 'ada@example.test',
};

const guest: IdentityView = {
  principalId: 'anon_g',
  label: 'Titanium 471',
  name: 'Maya',
  trust: 'guest',
  kind: 'anonymous',
};

const withPicture: IdentityView = {
  ...verified,
  mark: {
    variant: 'picture',
    initials: '',
    density: 1,
    glyphSeed: 1,
    pictureUrl:
      '/api/avatar/u/abcdefghijklmnopqrstuv/0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd-64.webp',
    presenter: false,
    self: false,
    hue: null,
    trust: 'verified',
    label: 'Ada Lovelace',
  },
};

function chip(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.ts-chip');
  if (el === null) throw new Error('no chip');
  return el;
}

describe('the verified badge', () => {
  it('is drawn for a verified account with the accessible word "signed in", never for a deleted one or a guest', () => {
    expect(trustMarkOf(verified)).toBe('check-badge');
    expect(trustMarkOf({ trust: 'verified', deleted: true })).toBeNull();
    expect(trustMarkOf(guest)).toBeNull();
    expect(trustWordOf(verified)).toBe(PRESENCE.signedIn);
    expect(trustWordOf(guest)).toBe('guest');
    expect(chipName(verified)).toBe('Ada Lovelace, signed in');
    expect(chipName(guest)).toBe('Maya, guest');
    render(<TrustMark identity={verified} />);
    const mark = document.querySelector<HTMLElement>('.ts-trust-mark');
    expect(mark?.getAttribute('aria-label')).toBe('signed in');
    expect(mark?.getAttribute('role')).toBe('img');
    expect(mark?.getAttribute('data-trust-mark')).toBe('check-badge');
    expect(mark?.querySelector('svg')?.getAttribute('width')).toBe('14');
    cleanup();
    render(<TrustMark identity={{ trust: 'verified', deleted: true }} />);
    expect(document.querySelector('.ts-trust-mark')).toBeNull();
    cleanup();
    render(<TrustMark identity={guest} />);
    expect(document.querySelector('.ts-trust-mark')).toBeNull();
  });

  it('gives the chip its accessible name with the trust word', () => {
    render(<IdentityChip identity={verified} size={24} />);
    expect(chip().getAttribute('aria-label')).toBe('Ada Lovelace, signed in');
    expect(chip().getAttribute('data-trust')).toBe('verified');
    /* the "(2)" suffix of a colliding label reaches the accessible name through the view (3.17) */
    cleanup();
    render(<IdentityChip identity={{ ...guest, name: 'Maya (2)' }} size={24} />);
    expect(chip().getAttribute('aria-label')).toBe('Maya (2), guest');
  });
});

describe('the picture', () => {
  it('loads the 32 px file at 1x and the 64 px file at 2x, decoded off the main thread, at the field size', () => {
    render(<IdentityChip identity={withPicture} size={24} />);
    const img = chip().querySelector<HTMLImageElement>('img.ts-chip-picture');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe(
      '/api/avatar/u/abcdefghijklmnopqrstuv/0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd-64.webp',
    );
    expect(img?.getAttribute('srcset')).toBe(
      '/api/avatar/u/abcdefghijklmnopqrstuv/0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd-32.webp 1x, /api/avatar/u/abcdefghijklmnopqrstuv/0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd-64.webp 2x',
    );
    expect(img?.getAttribute('decoding')).toBe('async');
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.getAttribute('width')).toBe('20');
    expect(img?.getAttribute('height')).toBe('20');
    expect(chip().getAttribute('data-variant')).toBe('picture');
    expect(chip().querySelector('svg.ts-chip-plate')).toBeNull();
  });

  it('draws the initials field in place of a picture that failed to load, so a 404 never leaves an empty box', () => {
    render(<IdentityChip identity={withPicture} size={24} />);
    const img = chip().querySelector<HTMLImageElement>('img.ts-chip-picture');
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(chip().querySelector('img')).toBeNull();
    const plate = chip().querySelector<SVGElement>('svg.ts-chip-plate');
    expect(plate).not.toBeNull();
    expect(plate?.getAttribute('width')).toBe('20');
    expect(chip().getAttribute('data-variant')).toBe('initials');
    expect(chip().getAttribute('data-picture')).toBeNull();
  });

  it('derives the 1x file from the store grammar and leaves a foreign URL alone', () => {
    const url =
      'https://store.test/u/k/0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd-128.webp';
    expect(pictureSources(url)).toEqual({
      src: url,
      srcSet:
        'https://store.test/u/k/0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd-64.webp 1x, https://store.test/u/k/0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd0123abcd-128.webp 2x',
    });
    expect(pictureSources('data:image/webp;base64,AAAA')).toEqual({
      src: 'data:image/webp;base64,AAAA',
    });
    /* a short digest is not the store's grammar: the file loads as given, with no srcset */
    expect(pictureSources('https://store.test/u/k/abcd-64.webp')).toEqual({
      src: 'https://store.test/u/k/abcd-64.webp',
    });
    /* an explicit pictureUrl wins over the mark's, so a head can ask for the 128 px file */
    render(<IdentityChip identity={withPicture} size={24} pictureUrl={url} />);
    expect(chip().querySelector('img')?.getAttribute('src')).toBe(url);
  });
});

describe('the field', () => {
  it('is size - 4 at 24, 16, 14 and 12, with the chip padded 1 px inside its ring', () => {
    for (const size of [24, 16, 14, 12] as const) {
      cleanup();
      render(<IdentityChip identity={guest} size={size} />);
      const plate = chip().querySelector<SVGElement>('svg.ts-chip-plate');
      expect(plate?.getAttribute('width')).toBe(String(size - 4));
      expect(plate?.getAttribute('height')).toBe(String(size - 4));
      expect(plate?.getAttribute('viewBox')).toBe(`0 0 ${size - 4} ${size - 4}`);
      expect(chip().getAttribute('data-size')).toBe(String(size));
      expect(chip().style.width).toBe(`${size}px`);
      expect(plate?.querySelectorAll('rect').length ?? 0).toBeGreaterThan(0);
    }
  });

  it('draws the stripe and the presenter triangle as its own elements beside the field', () => {
    render(<IdentityChip identity={guest} size={24} hueSlot={2} live presenter />);
    expect(chip().querySelector('.ts-chip-stripe')).not.toBeNull();
    expect(chip().querySelector('.ts-chip-presenter')).not.toBeNull();
    expect(chip().getAttribute('data-hue')).toBe('2');
    cleanup();
    render(<IdentityChip identity={guest} size={24} />);
    expect(chip().querySelector('.ts-chip-stripe')).toBeNull();
  });
});
