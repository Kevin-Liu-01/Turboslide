import { describe, expect, it } from 'vitest';

import { REFUSAL_WORDS, isRateLimited, refusalSentence } from './refusal';

// The sentence for a thrown store error (VERIFICATION.md C3-F3): the text walk of cycle 3 pass 1
// saw the store's own sentence reach the page as an Error and the router's default error page
// draw "Something went wrong!" over the editor. The product's words replace both.

const BLOB_429 =
  'Vercel Blob: Too many requests please lower the number of concurrent requests  - try again in 60 seconds.';

describe('refusalSentence', () => {
  it('names the store as busy for its rate limit sentence', () => {
    expect(refusalSentence(new Error(BLOB_429))).toBe(REFUSAL_WORDS.storeBusy);
    expect(isRateLimited(new Error(BLOB_429))).toBe(true);
  });

  it('names the store as busy for a 429 status whatever the message', () => {
    const error = Object.assign(new Error('rate limited'), { status: 429 });
    expect(refusalSentence(error)).toBe(REFUSAL_WORDS.storeBusy);
    expect(isRateLimited(error)).toBe(true);
  });

  it('never shows another sentence of the store verbatim', () => {
    const sentence = refusalSentence(new Error('Vercel Blob: This blob does not exist'));
    expect(sentence).toBe(REFUSAL_WORDS.storeRefused);
    expect(sentence).not.toMatch(/vercel/i);
  });

  it('shows a product sentence as one full sentence', () => {
    expect(refusalSentence(new Error('The room answered 404'))).toBe('The room answered 404.');
    expect(refusalSentence(new Error('The room answered 404.'))).toBe('The room answered 404.');
    expect(refusalSentence('the stream closed')).toBe('the stream closed.');
    expect(refusalSentence({ message: 'No slide "s9"' })).toBe('No slide "s9".');
  });

  it('has a sentence for an error without a message', () => {
    expect(refusalSentence(new Error(''))).toBe(REFUSAL_WORDS.unknown);
    expect(refusalSentence(undefined)).toBe(REFUSAL_WORDS.unknown);
    expect(refusalSentence(42)).toBe(REFUSAL_WORDS.unknown);
    expect(isRateLimited(undefined)).toBe(false);
  });

  it('keeps the words inside the copy rules', () => {
    for (const words of Object.values(REFUSAL_WORDS)) {
      expect(words).not.toMatch(/[—!]/);
      expect(words).toMatch(/\.$/);
    }
  });
});
