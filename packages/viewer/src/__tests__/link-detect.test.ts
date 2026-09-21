import { describe, expect, it } from 'vitest';

import { addressRangeAt, detectLinkBefore, linkOfToken } from '../marks';

// Link detection as the space or Enter lands, and the address a double click selects whole
// (docs/PRODUCT.md section 2 rank 9; audit-seller 9). Pure over the plain text.

describe('linkOfToken', () => {
  it('reads a bare domain, a path, www and a scheme as https addresses', () => {
    expect(linkOfToken('generaltranslation.com')).toBe('https://generaltranslation.com');
    expect(linkOfToken('acme.com/pricing?plan=team')).toBe('https://acme.com/pricing?plan=team');
    expect(linkOfToken('www.acme.io')).toBe('https://www.acme.io');
    expect(linkOfToken('https://acme.com')).toBe('https://acme.com');
    expect(linkOfToken('http://docs.acme.co.uk/start')).toBe('http://docs.acme.co.uk/start');
  });

  it('reads an email as a mailto link', () => {
    expect(linkOfToken('kevin@generaltranslation.com')).toBe('mailto:kevin@generaltranslation.com');
    expect(linkOfToken('mailto:sales@acme.com')).toBe('mailto:sales@acme.com');
  });

  it('leaves numbers, versions, abbreviations and words alone', () => {
    for (const token of [
      '3.5',
      'v1.0',
      'e.g',
      'U.S',
      'Acme',
      'acme.',
      '.com',
      'a-.com',
      '@acme.com',
    ])
      expect(linkOfToken(token), token).toBeNull();
  });
});

describe('detectLinkBefore', () => {
  it('finds the address that ends at the caret and drops the sentence punctuation', () => {
    const plain = 'Visit generaltranslation.com.';
    expect(detectLinkBefore(plain, plain.length)).toEqual({
      range: [6, 6 + 'generaltranslation.com'.length],
      url: 'https://generaltranslation.com',
    });
    const wrapped = 'Write to (kevin@generaltranslation.com)';
    expect(detectLinkBefore(wrapped, wrapped.length)).toEqual({
      range: [10, 10 + 'kevin@generaltranslation.com'.length],
      url: 'mailto:kevin@generaltranslation.com',
    });
  });

  it('answers null after a space, at the start and for a plain word', () => {
    expect(detectLinkBefore('acme.com ', 9)).toBeNull();
    expect(detectLinkBefore('', 0)).toBeNull();
    expect(detectLinkBefore('Renewal terms', 13)).toBeNull();
    expect(detectLinkBefore('Version 3.5', 11)).toBeNull();
  });
});

describe('addressRangeAt', () => {
  it('selects the dotted address whole from an offset inside it', () => {
    const plain = 'Kevin Liu, kevin@generaltranslation.com, generaltranslation.com.';
    const site = plain.indexOf('generaltranslation.com.');
    expect(addressRangeAt(plain, site + 4)).toEqual([site, site + 'generaltranslation.com'.length]);
    const mail = plain.indexOf('kevin@');
    expect(addressRangeAt(plain, mail + 8)).toEqual([
      mail,
      mail + 'kevin@generaltranslation.com'.length,
    ]);
  });

  it('answers null on a word that is not an address, so the browser selection stands', () => {
    expect(addressRangeAt('Kevin Liu, founder', 2)).toBeNull();
    expect(addressRangeAt('Version 3.5 ships', 9)).toBeNull();
  });
});
