import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

// Chat inside the file (gslides-parity SPEC-5 10, 0.46, 16.7 step 35; MILESTONES-5 B5): two
// browser contexts on one scratch deck. A sends through `chat.send`, B reads it through
// `chat.list` and the Chat panel within two seconds, the rate row answers its sentence past the
// cap, and the panel is empty after both leave. The window rows and the room's `admitChat` are
// the integrator's and B7's by request (b5.md requests 3 and 6); a row whose surface is not wired
// on the checkout is skipped with the request named, never passed. Runs against a dev server on
// the memory channel with TURBOSLIDE_STORE=tmp:
//
// PLAYWRIGHT_BASE_URL=http://localhost:4355 node_modules/.bin/playwright test apps/studio/e2e/chat.spec.ts

const SOURCE = 'gt-brand';
const COPY = `e2e-chat-${Date.now().toString(36)}`;

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  return page.evaluate(
    ([id, value]) => window.turboslide!.studio.invoke(id as string, value) as Promise<unknown>,
    [action, input] as const,
  ) as Promise<T>;
}

async function wired(page: Page, action: string, input: unknown): Promise<boolean> {
  return page.evaluate(
    async ([id, value]) => {
      try {
        await window.turboslide!.studio.invoke(id as string, value);
        return true;
      } catch (error) {
        return !/not implemented|NotImplemented|no handler|lands in|hosted studio/iu.test(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [action, input] as const,
  );
}

async function openDeck(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
}

async function twoContexts(
  browser: Browser,
): Promise<{ a: Page; b: Page; close: () => Promise<void> }> {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const a = await contextA.newPage();
  const b = await contextB.newPage();
  return {
    a,
    b,
    close: async () => {
      await contextA.close();
      await contextB.close();
    },
  };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await openDeck(page, `/edit/${SOURCE}`);
  const info = await invoke<{ revision: number }>(page, 'deck.info', {});
  await invoke(page, 'deck.copy', {
    id: SOURCE,
    name: COPY,
    newId: COPY,
    baseRevision: info.revision,
  });
  await page.close();
});

test.afterAll(async ({ browser }) => {
  // the scratch copy leaves the store: trashed at its revision, then removed (the tmp store of a
  // dev server drops it with the server either way)
  const page = await browser.newPage();
  try {
    await openDeck(page, `/edit/${COPY}`);
    const revision = await page.evaluate(
      () => (window.turboslide!.studio.describe().state as { revision: number }).revision,
    );
    await invoke(page, 'deck.trash', { id: COPY, baseRevision: revision }).catch(() => undefined);
    await invoke(page, 'deck.remove', { id: COPY, confirm: true }).catch(() => undefined);
  } catch {
    // the copy was never made or is gone already
  }
  await page.close();
});

test('a message reaches the second browser and the panel says messages are not saved', async ({
  browser,
}) => {
  const { a, b, close } = await twoContexts(browser);
  try {
    await openDeck(a, `/edit/${COPY}`);
    await openDeck(b, `/edit/${COPY}`);
    const isWired = await wired(a, 'chat.list', {});
    test.skip(
      !isWired,
      'chat.send, chat.list and chat.clear on the window transport wait for b5.md request 3 (controller.tsx) and the room port of request 6 (server/actions.ts, room.ts)',
    );
    const sent = await invoke<{ id: string; at: string }>(a, 'chat.send', {
      text: 'Pricing slide is ready',
    });
    expect(sent.id).toMatch(/^chat_/u);
    await expect
      .poll(
        async () =>
          (await invoke<{ messages: { text: string }[] }>(b, 'chat.list', {})).messages.map(
            (m) => m.text,
          ),
        { timeout: 2000 },
      )
      .toContain('Pricing slide is ready');
    // the panel, when the shell has wired it (b5.md request 4): its first line is the sentence
    const panel = b.locator('[data-control="panel.chat"]');
    if ((await panel.count()) > 0) {
      await expect(panel.locator('[data-control="panel.chat.notSaved"]')).toHaveText(
        'Messages are not saved. Leave a comment for something that should stay',
      );
      await expect(panel.locator('[data-control^="panel.chat.message."]').first()).toContainText(
        'Pricing slide is ready',
      );
    } else {
      test.info().annotations.push({
        type: 'not driven',
        description:
          'the Chat panel waits for b5.md request 4 (EditorShell.tsx registries, integrator)',
      });
    }
  } finally {
    await close();
  }
});

test('the rate row answers its sentence past the cap and the room clears when everyone leaves', async ({
  browser,
}) => {
  const { a, b, close } = await twoContexts(browser);
  try {
    await openDeck(a, `/edit/${COPY}`);
    const isWired = await wired(a, 'chat.list', {});
    test.skip(!isWired, 'chat window rows not wired on this checkout (b5.md requests 3 and 6)');
    let refused: string | null = null;
    for (let i = 0; i < 31 && refused === null; i += 1) {
      refused = await a.evaluate(async (n) => {
        try {
          await window.turboslide!.studio.invoke('chat.send', { text: `burst ${n}` });
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      }, i);
    }
    expect(refused ?? '').toMatch(/Too many messages|wait a moment/u);
    await a.close();
    await openDeck(b, `/edit/${COPY}`);
    await expect
      .poll(
        async () => (await invoke<{ messages: unknown[] }>(b, 'chat.list', {})).messages.length,
        { timeout: 5000 },
      )
      .toBe(0);
  } finally {
    await close();
  }
});
