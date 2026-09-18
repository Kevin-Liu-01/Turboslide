import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { REFUSAL_WORDS } from '../editor/refusal';
import { REFUSED_PAGE, RefusedPage } from './-refused-page';

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
    expect(html).toContain(`<h1 class="ts-empty-title">${REFUSED_PAGE.editorStopped}</h1>`);
    expect(html).toContain(REFUSAL_WORDS.storeBusy);
    expect(html).toMatch(/<button[^>]*data-control="refused\.reload"[^>]*>Reload<\/button>/);
    expect(html).toContain('class="pt-ib is-solid"');
    expect(html).toContain(`>${REFUSED_PAGE.decks}</a>`);
  });

  it('is the Not found page’s structure inside the document shell', () => {
    const html = render();
    expect(html).toMatch(/^<main class="ts-notfound ts-refused"/);
    expect(html).toContain('data-figure="notfound"');
    expect(html).toContain('class="ts-notfound-actions"');
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
