import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

import { extraHTTPHeaders, title } from './lib';

// Lane B2's row of Round 1 in core/share.spec.ts (docs/NEXT.md 4.1.3 item 11, 4.1.5): You need
// access says what is true. The spec file calls `shareRound1()` once and spreads its ids into its
// coverage list. The row reads the page twice in fresh anonymous contexts: as the deployment
// answers, and with the sign in facts' server function refused, which is how a deployment with no
// method reads to the page (components/home/sign-in.tsx `readSignInFacts`; -access-page.tsx draws
// the sentence only on a method). The function's address is learned from the first reading, so
// the second needs no build's function id written here. No deck is made.

const ADDRESS = '/deck/no-such-deck-true-sentence';

type AccessFacts = {
  lockup: boolean;
  word: string;
  sentences: string[];
  signIn: string | null;
};

async function read(page: Page): Promise<AccessFacts> {
  await page.locator('[data-control="access.page"]').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const root = document.querySelector('.ts-access-frame') ?? document.body;
    const lockup = root.querySelector('.ts-brand-lockup');
    const sentences = [
      ...root.querySelectorAll<HTMLElement>(
        '[data-control="access.sentence"], [data-control="access.signin.line"], .ts-access-cookies',
      ),
    ].map((el) => (el.innerText ?? '').replace(/\s+/g, ' ').trim());
    const line = root.querySelector<HTMLElement>('[data-control="access.signin.line"]');
    return {
      lockup: lockup !== null && lockup.getBoundingClientRect().width > 0,
      word: (lockup?.textContent ?? '').trim(),
      sentences,
      signIn: line ? (line.innerText ?? '').replace(/\s+/g, ' ').trim() : null,
    };
  });
}

/** Registers the row's test and returns its id for the spec's coverage list. */
export function shareRound1(): string[] {
  test(title('share.access.true-sentence'), async ({ browser }: { browser: Browser }) => {
    test.setTimeout(180_000);
    /* the reading as the deployment answers, recording the sign in facts' answer */
    const first = await browser.newContext({
      extraHTTPHeaders,
      viewport: { width: 1440, height: 900 },
    });
    let factsUrl: string | null = null;
    let offered = false;
    let asIs: AccessFacts;
    try {
      const page = await first.newPage();
      page.on('response', (response) => {
        const url = response.url();
        if (!url.includes('/_serverFn/') || response.request().method() !== 'GET') return;
        void response
          .text()
          .then((body) => {
            if (/signedIn/.test(body) && /google/.test(body)) factsUrl = new URL(url).pathname;
          })
          .catch(() => undefined);
      });
      /* whether a method is offered: the /decks bar says what the same facts read */
      await page.goto('/decks');
      await page.locator('.ts-home-page[data-hydrated]').waitFor({ timeout: 60_000 });
      offered = (await page.locator('.ts-appbar-end').getAttribute('data-sign-in')) === 'offered';
      await page.goto(ADDRESS);
      asIs = await read(page);
    } finally {
      await first.close();
    }
    /* the reading with no method: the facts' function refused */
    let none: AccessFacts | null = null;
    if (factsUrl !== null) {
      const second = await browser.newContext({
        extraHTTPHeaders,
        viewport: { width: 1440, height: 900 },
      });
      try {
        const page = await second.newPage();
        const path = factsUrl;
        await page.route(
          (url) => url.pathname === path,
          (route) => route.abort(),
        );
        await page.goto(ADDRESS);
        none = await read(page);
      } finally {
        await second.close();
      }
    }
    test.info().annotations.push({
      type: 'access',
      description: `as the deployment answers (a method offered ${offered}): ${JSON.stringify(asIs)}; with no method: ${none === null ? 'not read (no facts answer was seen)' : JSON.stringify(none)}; the facts' address ${factsUrl ?? 'none'}`,
    });
    expect(asIs.lockup, 'the page draws the lockup').toBe(true);
    expect(asIs.word, 'the lockup names the product').toBe('Turboslide');
    for (const sentence of asIs.sentences)
      expect(sentence, 'every sentence ends with a period').toMatch(/\.$/);
    if (offered) expect(asIs.signIn, 'the sign in sentence where a method exists').not.toBeNull();
    else expect(asIs.signIn, 'no sign in sentence without a method').toBeNull();
    expect(none, 'the reading with no method ran').not.toBeNull();
    expect(none?.signIn ?? null, 'no sign in sentence without a method').toBeNull();
    for (const sentence of none?.sentences ?? [])
      expect(sentence, 'every sentence ends with a period').toMatch(/\.$/);
  });
  return ['share.access.true-sentence'];
}
