import { spawnSync } from 'node:child_process';
import { loadavg } from 'node:os';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

import { AGENTS } from '../../../src/components/home/copy';
import { HOME_DECK } from '../../../src/components/home/deck.generated';
import { HOME_FACTS } from '../../../src/components/home/facts';
import {
  CONTINUATION_INDENT,
  splitWords,
  substituteName,
} from '../../../src/components/home/panel-format';
import { HOME_RUN } from '../../../src/components/home/run.generated';
import type { RunStep } from '../../../src/components/home/run.generated';
import { extraHTTPHeaders, title } from '../lib';

// A lane module of core/home.spec.ts (docs/LANDING.md 2.4, 6.7; build/integrator.md "Landing,
// day 0" 4.9 and 5.1). L3's, push 4: the recorded run at rest, Run Again and its steps, the typed
// line, the three transports, Version history and the recording's provenance. Every observation is
// through the page; the recorded commands and answers are read from `run.generated.ts`, the build's
// output at the checkout under test, never from literal text. The timing bounds are interaction
// bounds, read only at a one minute load under 24 (docs/NEXT.md 4.0; the orchestrator's load rule):
// above it the functional checks still run and the reading is annotated "not read: load".

export const ROWS: readonly string[] = [
  'home.agents.rest',
  'home.agents.run',
  'home.agents.typed',
  'home.agents.transports',
  'home.agents.history',
  'home.agents.recorded',
];

const ROOT = resolve(import.meta.dirname, '../../../../..');
export const PHONE = { width: 390, height: 844 } as const;
export const DESKTOP = { width: 1440, height: 900 } as const;
const STEP_BOUND_MS = 5000;
const LOAD_LINE = 24;

/** The one minute load average, and whether an interaction bound may be read now. */
export function loadReading(): { load: number; read: boolean } {
  const load = Math.round((loadavg()[0] ?? 0) * 10) / 10;
  return { load, read: load < LOAD_LINE };
}

/** Annotates a timing reading taken or skipped for load. */
export function noteTiming(what: string, value: number | null): void {
  const { load, read } = loadReading();
  test.info().annotations.push({
    type: read ? 'reading' : 'not read: load',
    description: `${what}: ${value === null ? 'none' : `${Math.round(value)} ms`} at load ${load}`,
  });
}

/** Opens /home with the live module started. */
export async function openHome(page: Page, width: 'desktop' | 'phone' = 'desktop'): Promise<void> {
  await page.setViewportSize(width === 'phone' ? PHONE : DESKTOP);
  await page.goto('/home');
  await page.waitForSelector('main#top[data-hydrated]', { timeout: 90_000 });
  await page.waitForSelector('main#top[data-live="ready"]', { timeout: 90_000 });
}

/** A fresh context for a test, so no visit or kit carries over. */
export async function freshPage(browser: Browser, js = true): Promise<Page> {
  const context = await browser.newContext({ extraHTTPHeaders, javaScriptEnabled: js });
  return context.newPage();
}

const band = (page: Page) => page.locator('[data-band="agents"]');
const run = (page: Page) => band(page).locator('[data-agent-run]');
const cmd = (page: Page) => band(page).locator('[data-cmd]');

/** The visible lines of a transport's panel at the shown width. */
export async function panelLines(page: Page, tab: 'cli' | 'mcp' | 'http'): Promise<string[]> {
  return page.evaluate((key) => {
    const tabs = [...document.querySelectorAll<HTMLElement>('[data-band="agents"] [role="tab"]')];
    const t = tabs.find(
      (el) => (el.dataset['transport'] ?? el.textContent ?? '').trim().toLowerCase() === key,
    );
    const panel = t ? document.getElementById(t.getAttribute('aria-controls') ?? '') : null;
    if (panel === null) return [];
    const views = [...panel.querySelectorAll<HTMLElement>('[data-panel-text]')];
    const shown =
      views.find((v) => v.offsetParent !== null && getComputedStyle(v).display !== 'none') ??
      views[0];
    if (shown === undefined) return [];
    return [...shown.children]
      .filter((el) => !(el as HTMLElement).hidden)
      .flatMap((el) => (el.textContent ?? '').split('\n'));
  }, tab);
}

/** Joins panel lines back into the logical lines they were wrapped from. */
export function unwrap(lines: readonly string[]): string[] {
  const out: string[] = [];
  const indent = ' '.repeat(CONTINUATION_INDENT);
  for (const line of lines) {
    /* a continuation: panel-format.ts indents the rest of a broken line by exactly four spaces */
    if (out.length > 0 && line.startsWith(indent) && line[CONTINUATION_INDENT] !== ' ') {
      out[out.length - 1] += ` ${line.slice(CONTINUATION_INDENT)}`;
    } else out.push(line);
  }
  return out;
}

/** Every counter on the page (`data-counter` and the visible counter text), as read. */
async function counters(page: Page): Promise<string[]> {
  return page.evaluate(() => [
    ...[...document.querySelectorAll('[data-home-slides]')].map(
      (el) => el.getAttribute('data-counter') ?? '',
    ),
    ...[...document.querySelectorAll('[data-home-slides] [data-counter-text]')].map(
      (el) => el.textContent ?? '',
    ),
  ]);
}

/** Types a line into the panel and presses Enter, at a human pace. */
export async function typeLine(page: Page, line: string): Promise<void> {
  await cmd(page).click();
  await cmd(page).fill('');
  await cmd(page).pressSequentially(line, { delay: 20 });
  await cmd(page).press('Enter');
}

/** Presses Run and returns the press to the step's end (Run's aria-disabled leaves), in ms. */
async function pressRun(page: Page, finish = false): Promise<number> {
  await page.evaluate(() => {
    const w = window as unknown as { __stepEnd?: Promise<number> };
    const button = document.querySelector<HTMLElement>('[data-agent-run]')!;
    w.__stepEnd = new Promise<number>((resolve) => {
      const t0 = performance.now();
      let seenOn = false;
      const watch = new MutationObserver(() => {
        const on = button.getAttribute('aria-disabled') === 'true';
        if (on) seenOn = true;
        else if (seenOn) {
          watch.disconnect();
          resolve(performance.now() - t0);
        }
      });
      watch.observe(button, { attributes: true, attributeFilter: ['aria-disabled'] });
    });
  });
  await run(page).click();
  /* Run carries aria-disabled while a step plays, which Playwright reads as disabled; a visitor's
     press reaches it all the same */
  if (finish) await run(page).click({ force: true });
  return page.evaluate(() => (window as unknown as { __stepEnd: Promise<number> }).__stepEnd);
}

const stepCommand = (step: RunStep, name: string): string =>
  `$ ${substituteName(step.command, HOME_DECK.customer, name)}`;

export function rows(): void {
  test(title('home.agents.rest'), async ({ browser }) => {
    for (const js of [false, true])
      for (const width of ['desktop', 'phone'] as const) {
        const page = await freshPage(browser, js);
        await page.setViewportSize(width === 'phone' ? PHONE : DESKTOP);
        await page.goto('/home');
        if (js) await page.waitForSelector('main#top[data-live="ready"]', { timeout: 90_000 });
        const lines = await panelLines(page, 'cli');
        const screen = HOME_RUN.screens.transcript[width === 'phone' ? 'narrow' : 'wide'];
        expect(lines, `the resting transcript at ${width}, script ${js}`).toEqual([...screen]);
        expect(lines.length).toBeLessThanOrEqual(width === 'phone' ? 22 : 14);
        /* no line cut or wider than the panel */
        const fit = await page.evaluate(() => {
          const views = [
            ...document.querySelectorAll<HTMLElement>('[data-band="agents"] [data-panel-text]'),
          ];
          const shown = views.filter((v) => v.offsetParent !== null);
          return shown.map((v) => ({
            w: v.scrollWidth <= v.clientWidth + 1,
            h: v.scrollHeight <= v.clientHeight + 1,
          }));
        });
        for (const f of fit) expect(f).toEqual({ w: true, h: true });
        /* slide 5 written */
        const slide = band(page).locator('[data-home-slides][data-slide="next-steps"]');
        await expect(slide).toContainText('Next steps with Northwind');
        await expect(slide).toContainText('Northwind sellers get the deck');
        await expect(slide).not.toHaveAttribute('data-agent-absent', '');
        /* three Agent rows, recorded */
        const history = band(page).locator('[data-history-row]');
        await expect(history).toHaveCount(3);
        for (const step of [...HOME_RUN.steps].reverse()) {
          const i = 3 - step.n;
          await expect(history.nth(i)).toContainText(step.history);
          await expect(history.nth(i)).toContainText(AGENTS.author.agent);
          await expect(history.nth(i)).toContainText(AGENTS.recorded);
        }
        for (const c of await counters(page)) expect(c).toMatch(/^\d \/ 8$/);
        await page.context().close();
      }
  });

  test(title('home.agents.run'), async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await freshPage(browser);
    await openHome(page);
    await band(page).scrollIntoViewIfNeeded();
    const caption = await band(page).innerText();
    expect(HOME_RUN.captionSeconds).toBe(Math.round(HOME_RUN.totalMs / 1000));
    expect(caption).toContain(AGENTS.caption(HOME_RUN.captionSeconds));

    for (const name of [HOME_DECK.customer, 'Abcdefghijklmnopqrstuvwx']) {
      if (name !== HOME_DECK.customer) {
        await typeLine(page, `tailor --replace=${HOME_DECK.customer}=${name}`);
        await expect(
          band(page).locator('[data-home-slides][data-slide="next-steps"]'),
        ).toContainText(name);
      }
      /* Run Again: the run's start by a cut, then step 1 plays */
      await page.evaluate(() => {
        const w = window as unknown as {
          __start?: { banner: string; counters: string[]; absent: boolean; thumb: boolean };
        };
        const button = document.querySelector<HTMLElement>('[data-agent-run]')!;
        button.addEventListener(
          'click',
          () => {
            queueMicrotask(() => {
              const views = [
                ...document.querySelectorAll<HTMLElement>('[data-band="agents"] [data-panel-text]'),
              ];
              const shown = views.find((v) => v.offsetParent !== null);
              w.__start = {
                banner: shown?.innerText ?? '',
                /* every slide of the deck at the start; slide 5 has left it, its places hidden */
                counters: [
                  ...document.querySelectorAll('[data-home-slides]:not([data-slide="next-steps"])'),
                ].map((el) => el.getAttribute('data-counter') ?? ''),
                absent:
                  document
                    .querySelector('[data-band="agents"] [data-slide="next-steps"]')
                    ?.hasAttribute('data-agent-absent') ?? false,
                thumb:
                  (document.querySelector<HTMLElement>('[data-thumb="next-steps"]')?.hidden ??
                    true) === false,
              };
            });
          },
          { once: true },
        );
      });
      const lengths: number[] = [];
      const typing: number[] = [];
      for (const step of HOME_RUN.steps) {
        /* the typing clock and the ring, sampled in the page */
        await page.evaluate(() => {
          const w = window as unknown as {
            __marks: { lines: [number, number][]; ring: { ms: number; props: string[] }[] };
          };
          w.__marks = { lines: [], ring: [] };
          const views = [
            ...document.querySelectorAll<HTMLElement>('[data-band="agents"] [data-panel-text]'),
          ];
          const shown = views.find((v) => v.offsetParent !== null)!;
          new MutationObserver(() => {
            const last = [...shown.children]
              .filter((el) => (el.textContent ?? '').startsWith('$'))
              .pop();
            if (last)
              w.__marks.lines.push([
                performance.now(),
                (last.textContent ?? '').replace(/\n {4}/g, ' ').length,
              ]);
          }).observe(shown, { childList: true, subtree: true, characterData: true });
          const sheet = document.querySelector(
            '[data-band="agents"] [data-home-slides][data-slide="next-steps"]',
          )!.parentElement!;
          new MutationObserver((records) => {
            for (const r of records)
              for (const node of r.addedNodes)
                if (node instanceof HTMLElement && node.classList.contains('ts-home-ring'))
                  for (const a of [node, ...node.querySelectorAll('i')].flatMap((el) =>
                    el.getAnimations(),
                  )) {
                    const timing = a.effect?.getTiming();
                    const frames = (a.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
                    w.__marks.ring.push({
                      ms: Number(timing?.duration ?? 0),
                      props: [
                        ...new Set(
                          frames.flatMap((f) =>
                            Object.keys(f).filter(
                              (k) =>
                                !['offset', 'easing', 'composite', 'computedOffset'].includes(k),
                            ),
                          ),
                        ),
                      ],
                    });
                  }
          }).observe(sheet, { childList: true });
        });
        const length = await pressRun(page);
        lengths.push(length);
        await expect(run(page)).toBeFocused();
        const marks = await page.evaluate(
          () =>
            (
              window as unknown as {
                __marks: { lines: [number, number][]; ring: { ms: number; props: string[] }[] };
              }
            ).__marks,
        );
        /* A1: 24 ms a character, a JSON value whole */
        const grow = marks.lines.filter(
          ([, n], i, all) => i === 0 || n !== (all[i - 1] as [number, number])[1],
        );
        if (grow.length > 2) {
          const typed = grow.slice(1, -1);
          const first = typed[0] as [number, number];
          const last = typed[typed.length - 1] as [number, number];
          if (last[1] > first[1]) typing.push((last[0] - first[0]) / (last[1] - first[1]));
        }
        for (const r of marks.ring) {
          expect(r.ms).toBeLessThanOrEqual(700);
          expect(r.props).toEqual(['transform']);
        }
        /* the change landed */
        const slide = band(page).locator('[data-home-slides][data-slide="next-steps"]');
        if (step.n >= 2) await expect(slide).toContainText(`Next steps with ${name}`);
        if (step.n === 3) await expect(slide).toContainText(`${name} sellers get the deck`);
        const lines = unwrap(await panelLines(page, 'cli'));
        expect(lines).toContain(stepCommand(step, name).split('\n')[0]);
        if (step.n === 1) {
          const start = await page.evaluate(
            () =>
              (
                window as unknown as {
                  __start: { banner: string; counters: string[]; absent: boolean; thumb: boolean };
                }
              ).__start,
          );
          expect(start.banner).toContain('$ turboslide --version');
          for (const c of start.counters) expect(c).toMatch(/^\d \/ 7$/);
          /* slide 5 left the deck: its place in the band is absent and band 3's filmstrip lost it */
          expect(start.absent).toBe(true);
          expect(start.thumb).toBe(false);
        }
      }
      for (const c of await counters(page)) expect(c).toMatch(/^\d \/ 8$/);
      noteTiming(`steps with ${name.length} character name`, Math.max(...lengths));
      for (const t of typing) noteTiming('mean key gap', t);
      if (loadReading().read) {
        for (const length of lengths) expect(length).toBeLessThanOrEqual(STEP_BOUND_MS);
        for (const t of typing) (expect(t).toBeGreaterThan(20), expect(t).toBeLessThan(40));
      }
    }
    /* a press while a step plays finishes it at its end state, focus on Run */
    const finished = await pressRun(page, true);
    expect(finished).toBeLessThan(2000);
    await expect(run(page)).toBeFocused();
    await expect(band(page).locator('.ts-home-ring, .ts-home-flag')).toHaveCount(0);
    await page.context().close();
  });

  test(title('home.agents.typed'), async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await freshPage(browser);
    await openHome(page);
    await band(page).scrollIntoViewIfNeeded();
    /* help */
    await typeLine(page, 'help');
    await expect
      .poll(() => panelLines(page, 'cli'))
      .toEqual(['$ turboslide help', ...HOME_RUN.help]);
    /* Up recalls the last line */
    await cmd(page).press('ArrowUp');
    await expect(cmd(page)).toHaveValue('help');
    await cmd(page).fill('');
    /* anything else */
    await typeLine(page, 'slide delete plan');
    await expect
      .poll(async () => (await panelLines(page, 'cli')).join('\n'))
      .toContain(AGENTS.panel.refusal(5, HOME_FACTS.cliCommands));
    expect(AGENTS.panel.refusal(5, HOME_FACTS.cliCommands)).toContain('180');
    /* an unclosed quote */
    await typeLine(page, 'tailor --replace="Northwind=Globex');
    await expect
      .poll(async () => (await panelLines(page, 'cli')).join('\n'))
      .toContain(AGENTS.panel.unclosedQuote);
    /* a step out of order: slide 5 exists at rest */
    const step1 = HOME_RUN.steps[0];
    const refusal = HOME_RUN.typed.find(
      (r) => r.form === 'step' && r.step === 1 && r.state === 'filled',
    );
    expect(refusal, 'the recorded refusal of step 1 on the page deck').toBeDefined();
    await typeLine(page, step1.command);
    await expect
      .poll(async () => unwrap(await panelLines(page, 'cli')).slice(1))
      .toEqual(refusal!.answer.map((l) => l));
    /* the spaced form: this CLI refuses it whatever the deck holds, and the page prints that
       recording and renames nothing (l1.md Q7) */
    const spaced = HOME_RUN.typed.find((r) => r.form === 'tailor-spaced');
    expect(spaced, 'the recorded refusal of the spaced tailor form').toBeDefined();
    await typeLine(page, `tailor --replace ${HOME_DECK.customer}=Initech`);
    await expect
      .poll(async () => unwrap(await panelLines(page, 'cli')).slice(1))
      .toEqual([...spaced!.answer]);
    await expect(page.locator('[data-home-slides][data-slide="plan"]').first()).toContainText(
      HOME_DECK.customer,
    );
    /* tailor renames as Tailor does and prints the recording for the deck the page holds */
    const rec = HOME_RUN.typed.find(
      (r) => r.form === 'tailor' && r.state === 'filled' && r.nameFound === true,
    );
    expect(rec).toBeDefined();
    await typeLine(page, `tailor --replace=${HOME_DECK.customer}=Initech`);
    const printed = rec!.answer.map((line) =>
      rec!.names === null
        ? line
        : line.split(rec!.names.from).join(HOME_DECK.customer).split(rec!.names.to).join('Initech'),
    );
    await expect.poll(async () => unwrap(await panelLines(page, 'cli')).slice(1)).toEqual(printed);
    await expect(page.locator('[data-home-slides][data-slide="plan"]').first()).toContainText(
      'Initech',
    );
    await expect(page.locator('main#top')).not.toContainText('Onboarding plan for Northwind');
    /* names with shell characters: every printed command splits to the recording's words */
    let current = 'Initech';
    for (const name of [`O'Neil & Co`, `"Q" $5`]) {
      const quoted = `'${`--replace=${current}=${name}`.replace(/'/g, `'\\''`)}'`;
      await typeLine(page, `tailor ${quoted}`);
      await expect(band(page).locator('[data-home-slides][data-slide="next-steps"]')).toContainText(
        name,
      );
      current = name;
      await pressRun(page, true);
      await pressRun(page, true);
      await pressRun(page, true);
      const lines = await panelLines(page, 'cli');
      const commands = joinCommands(lines);
      for (const step of HOME_RUN.steps) {
        const printedCommand = commands[step.n - 1] ?? '';
        const split = splitWords(printedCommand.replace(/^\$ /, ''));
        expect(split.ok, printedCommand).toBe(true);
        const words = split.ok ? split.words : [];
        expect(words).toEqual(['turboslide', ...step.argv.map((w) => withName(w, name))]);
      }
    }
    await page.context().close();
  });

  test(title('home.agents.transports'), async ({ browser }) => {
    const page = await freshPage(browser);
    await openHome(page);
    await band(page).scrollIntoViewIfNeeded();
    const tabs = band(page).locator('[data-transports] [role="tab"]');
    await expect(tabs).toHaveCount(3);
    await expect(tabs.nth(0)).toHaveText('CLI');
    await expect(tabs.nth(1)).toHaveText('MCP');
    await expect(tabs.nth(2)).toHaveText('HTTP');
    await expect(band(page).locator('[data-transports]')).toHaveAttribute('role', 'tablist');
    /* the roving tabindex and the arrow keys */
    await tabs.nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(0)).toHaveAttribute('tabindex', '-1');
    const mcp = (await panelLines(page, 'mcp')).join('\n');
    for (const step of HOME_RUN.steps) {
      expect(mcp).toContain('tools/call');
      expect(mcp).toContain(step.mcp.name);
      expect(mcp).toContain(step.revisionBefore);
      for (const line of step.answer) expect(mcp).not.toContain(line);
    }
    expect(mcp).toContain('baseRevision');
    expect((await panelLines(page, 'mcp')).at(-1)).toBe(AGENTS.panel.requestOnly);
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
    const http = (await panelLines(page, 'http')).join('\n');
    for (const step of HOME_RUN.steps) {
      expect(step.http.path).toBe(`/api/actions/${step.action}`);
      expect(http).toContain(`POST ${step.http.path}`);
      for (const line of step.answer) expect(http).not.toContain(line);
    }
    expect((await panelLines(page, 'http')).at(-1)).toBe(AGENTS.panel.requestOnly);
    await page.keyboard.press('Home');
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    const cli = unwrap(await panelLines(page, 'cli'));
    for (const step of HOME_RUN.steps)
      expect(cli).toContain(stepCommand(step, HOME_DECK.customer).split('\n')[0]);
    await page.context().close();
  });

  test(title('home.agents.history'), async ({ browser }) => {
    const page = await freshPage(browser);
    await openHome(page);
    const history = band(page).locator('[data-history-row]');
    /* the time cell, "6:45 PM" (ICU writes a narrow no-break space before PM, as the product's) */
    const time = /^\d{1,2}:\d{2}\s[AP]M$/;
    const timeCell = (row: ReturnType<typeof history.first>) =>
      row.locator(':scope > :nth-child(4)');
    const iconOf = (author: 'agent' | 'you') =>
      page.evaluate(
        (a) =>
          document
            .querySelector(`[data-band="agents"] template[data-history-icon="${a}"]`)
            ?.innerHTML.trim() ?? '',
        author,
      );
    /* an agent's change: a typed tailor */
    await band(page).scrollIntoViewIfNeeded();
    const t0 = Date.now();
    await typeLine(page, `tailor --replace=${HOME_DECK.customer}=Globex`);
    await expect(history.first()).toContainText('Tailored for Globex', { timeout: 1000 });
    noteTiming('typed tailor to its row', Date.now() - t0);
    await expect(history.first()).toContainText(AGENTS.author.agent);
    await expect(timeCell(history.first())).toHaveText(time);
    expect(await history.first().innerHTML()).toContain(await iconOf('agent'));
    /* the visitor's change: the hero's title moved, then undone */
    await page.evaluate(() => window.scrollTo(0, 0));
    const titleBox = page.locator('[data-object="title#heading"]');
    const box = (await titleBox.boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 60, { steps: 6 });
    const released = await page.evaluate(() => performance.now());
    await page.mouse.up();
    await expect(history.first()).toContainText('Moved the title on slide 1', { timeout: 1000 });
    const rowTime = await page.evaluate(() => performance.now());
    noteTiming('release to row (upper bound)', rowTime - released);
    await expect(history.first()).toContainText(AGENTS.author.you);
    await expect(timeCell(history.first())).toHaveText(time);
    expect(await history.first().innerHTML()).toContain(await iconOf('you'));
    await page.locator('[data-undo="hero"]').click();
    await expect(history.first()).not.toContainText('Moved the title on slide 1');
    await expect(history.first()).toContainText('Tailored for Globex');
    await page.context().close();
  });

  test(title('home.agents.recorded'), async ({ browser }) => {
    /* the build's check: the recording's sources, the fixture's sha, the bodies against their schemas */
    const check = spawnSync('node', ['scripts/build-home-assets.ts', '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 120_000,
    });
    expect(check.status, `${check.stdout}\n${check.stderr}`).toBe(0);
    const page = await freshPage(browser);
    await openHome(page);
    const cli = await panelLines(page, 'cli');
    expect(cli).toEqual([...HOME_RUN.screens.transcript.wide]);
    for (const step of HOME_RUN.steps) {
      const joined = unwrap(cli).join('\n');
      expect(joined).toContain(stepCommand(step, HOME_DECK.customer).split('\n')[0]);
      for (const line of step.answer) expect(joined).toContain(line);
    }
    /* the banner's version equals the recording's */
    await page.locator('[data-agent-run]').click();
    const banner = (await panelLines(page, 'cli')).join('\n');
    expect(banner).toContain(`Turboslide ${HOME_RUN.cliVersion}`);
    await page.context().close();
  });
}

/** The printed commands of the transcript, each joined back from its wrapped lines. */
function joinCommands(lines: readonly string[]): string[] {
  const out: string[] = [];
  let open: string | null = null;
  for (const line of lines) {
    if (line.startsWith('$ ')) {
      if (open !== null) out.push(open);
      open = line;
      continue;
    }
    if (open === null) continue;
    /* a continuation line: panel-format.ts broke the line at a space and indented the rest */
    if (
      line.startsWith(' '.repeat(CONTINUATION_INDENT)) &&
      !line.startsWith(' '.repeat(CONTINUATION_INDENT + 1))
    ) {
      open += ` ${line.slice(CONTINUATION_INDENT)}`;
      continue;
    }
    if (isInsideQuote(open)) {
      open += `\n${line}`;
      continue;
    }
    out.push(open);
    open = null;
  }
  if (open !== null) out.push(open);
  return out;
}

function isInsideQuote(command: string): boolean {
  return !splitWords(command).ok;
}

/** A recorded word with the name replaced as a value: escaped as JSON inside a JSON word. */
function withName(word: string, name: string): string {
  try {
    JSON.parse(word);
  } catch {
    return word.split(HOME_DECK.customer).join(name);
  }
  return word.split(HOME_DECK.customer).join(JSON.stringify(name).slice(1, -1));
}
