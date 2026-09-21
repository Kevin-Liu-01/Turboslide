import { describe, expect, it } from 'vitest';

import { slideLinkDestination } from '../slideLinks';

// A slide link clicked in the show (docs/PRODUCT.md section 2 rank 19): the four positions
// resolve against the play list and the current slide, a slide id against the list, a URL to none.

const play = [{ id: 'title' }, { id: 'agenda' }, { id: 'pricing' }, { id: 'closing' }];

describe('slideLinkDestination', () => {
  it('names the slide of an id link and none for an unknown id or a URL', () => {
    expect(slideLinkDestination('#s/pricing', play, 0)).toBe('pricing');
    expect(slideLinkDestination('#s/missing', play, 0)).toBeNull();
    expect(slideLinkDestination('https://acme.com', play, 0)).toBeNull();
  });

  it('reads the four positions from the current slide, clamped to the list', () => {
    expect(slideLinkDestination('#next', play, 1)).toBe('pricing');
    expect(slideLinkDestination('#next', play, 3)).toBe('closing');
    expect(slideLinkDestination('#previous', play, 2)).toBe('agenda');
    expect(slideLinkDestination('#previous', play, 0)).toBe('title');
    expect(slideLinkDestination('#first', play, 2)).toBe('title');
    expect(slideLinkDestination('#last', play, 0)).toBe('closing');
  });
});
