import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { REFUSAL_WORDS } from '../editor/refusal';
import { REFUSED_PAGE, RefusedPage, isAddressRefusal } from './-refused-page';

// The product's error page (VERIFICATION.md C3-F3): the fixed part renders without a router, so
// the words, the controls and the copy rules are pinned here; the router half (Reload as
// `router.invalidate()`, the heading by the match's status) is covered by -edit-reload.test.ts
// and the edit route's options.

function render(): string {
  return renderToStaticMarkup(
    createElement(
      RefusedPage,
      {
        heading: REFUSED_PAGE.editorStopped,
        sentence: REFUSAL_WORDS.storeBusy,
        onReload: () => undefined,
      },
      createElement('a', { href: '/decks', className: 'pt-ib' }, REFUSED_PAGE.decks),
    ),
  );
}

describe('RefusedPage', () => {
  it('draws the heading, the sentence, Reload and the caller’s action', () => {
    const html = render();
    expect(html).toContain('data-control="refused"');
    expect(html).toContain(`<h1 class="ts-page-title">${REFUSED_PAGE.editorStopped}</h1>`);
    expect(html).toContain(REFUSAL_WORDS.storeBusy);
    expect(html).toMatch(/<button[^>]*data-control="refused\.reload"[^>]*>Reload<\/button>/);
    expect(html).toContain('class="pt-ib is-solid"');
    expect(html).toContain(`>${REFUSED_PAGE.decks}</a>`);
  });

  it('is the Not found page’s structure inside the document shell', () => {
    const html = render();
    /* the page frame of Round 1 (docs/NEXT.md 4.1.3 item 11): the rails, the bar with the lockup */
    expect(html).toMatch(/^<main class="ts-page-frame ts-notfound ts-refused"/);
    expect(html).toContain('class="ts-rails"');
    expect(html).toContain('ts-brand-lockup');
    expect(html).not.toContain('data-figure="notfound"');
    expect(html).toContain('class="ts-page-actions ts-notfound-actions"');
  });

  it('never carries the router’s words', () => {
    const html = render();
    expect(html).not.toContain('Something went wrong');
    expect(html).not.toContain('Show Error');
  });

  it('keeps the words inside the copy rules', () => {
    for (const heading of [
      REFUSED_PAGE.editorStopped,
      REFUSED_PAGE.notOpened,
      REFUSED_PAGE.pageNotShown,
      REFUSED_PAGE.notAnAddress,
    ]) {
      // sentence case, no trailing period, no em dash, no exclamation
      expect(heading).toMatch(/^[A-Z][^.!—]*[^.!—\s]$/);
      expect(
        heading
          .split(' ')
          .slice(1)
          .every((word) => word === word.toLowerCase()),
      ).toBe(true);
    }
    // buttons in Title Case
    for (const label of [REFUSED_PAGE.reload, REFUSED_PAGE.decks]) {
      expect(label.split(' ').every((word) => /^[A-Z]/.test(word))).toBe(true);
    }
    // tooltip sentences end with a period and carry no em dash
    for (const doc of [REFUSED_PAGE.reloadDoc, REFUSED_PAGE.decksDoc]) {
      expect(doc).toMatch(/\.$/);
      expect(doc).not.toMatch(/—/);
    }
  });
});

// The Round 1 follow-up, lane C item 3: /edit/Not_A_Slug drew the store's words, "deckId must be a
// slug.", under "This presentation could not be opened", with Reload. An address whose id is not a
// slug names no presentation: the page says so in the product's words, with Your Presentations as
// its one action and no Reload, since the same address refuses the same way.
describe('the address that names no presentation', () => {
  it('is the deck id that is not a slug, or the store sentence for one', () => {
    expect(isAddressRefusal(new Error('anything'), 'Not_A_Slug')).toBe(true);
    expect(isAddressRefusal(new RangeError('deckId must be a slug'), undefined)).toBe(true);
    expect(isAddressRefusal({ message: 'deckId must be a slug' }, undefined)).toBe(true);
    expect(isAddressRefusal(new Error('The store refused the request.'), 'q3-plan')).toBe(false);
    expect(isAddressRefusal(new Error('Too many requests'), undefined)).toBe(false);
  });

  it('draws the product words, no store words and no Reload', () => {
    const html = renderToStaticMarkup(
      createElement(
        RefusedPage,
        { heading: REFUSED_PAGE.notAnAddress, sentence: REFUSED_PAGE.addressSentence },
        createElement('a', { href: '/decks', className: 'pt-ib is-solid' }, REFUSED_PAGE.decks),
      ),
    );
    expect(html).toContain(`<h1 class="ts-page-title">${REFUSED_PAGE.notAnAddress}</h1>`);
    expect(html).toContain(REFUSED_PAGE.addressSentence);
    expect(html).not.toMatch(/deckId|slug/i);
    expect(html).not.toContain('data-control="refused.reload"');
    expect(html).toContain(`>${REFUSED_PAGE.decks}</a>`);
  });

  it('keeps the sentence inside the copy rules', () => {
    for (const sentence of REFUSED_PAGE.addressSentence.split(/(?<=\.) /)) {
      expect(sentence).toMatch(/^[A-Z][^—!]*\.$/);
    }
    expect(REFUSED_PAGE.addressSentence).not.toMatch(/slug|deckId/i);
  });
});
