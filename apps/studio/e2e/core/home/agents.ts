import { spawnSync } from 'node:child_process';
import { loadavg } from 'node:os';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

import { AGENTS } from '../../../src/components/home/copy';
import { HOME_CHIPS } from '../../../src/components/home/chips.generated';
import type { ChipCommand, ChipId } from '../../../src/components/home/chips.generated';
import { HOME_DECK } from '../../../src/components/home/deck.generated';
import { HOME_FACTS } from '../../../src/components/home/facts';
import { CONTINUATION_INDENT, PANEL_WIDTHS, formatLines } from '../../../src/components/home/panel-format';
import { extraHTTPHeaders, title } from '../lib';

// A lane module of core/home.spec.ts (docs/LANDING.md 2.9, 6.7, the second pass). V3's, push
// V3#13: the agents band at rest, the four chips over slide 5, the typed line, the three transports,
// Version history and the recordings' provenance. Every observation is through the page; the
// commands and answers are read from `chips.generated.ts`, the build's recording at the checkout
// under test, never from literal text. The timing bounds are interaction bounds, read only at a one
// minute load under 24 (docs/NEXT.md 4.0; the orchestrator's load rule): above it the functional
// checks still run and the reading is annotated "not read: load".

export const ROWS: readonly string[] = [
  'home.agents.rest',
  'home.agents.chips',
  'home.agents.typed',
  'home.agents.transports',
  'home.agents.history',
  'home.agents.recorded',
];

const ROOT = resolve(import.meta.dirname, '../../../../..');
export const PHONE = { width: 390, height: 844 } as const;
export const DESKTOP = { width: 1440, height: 900 } as const;
const STEP_BOUND_MS = 5000;
const RING_BOUND_MS = 700;
const ROW_BOUND_MS = 200;
const LOAD_LINE = 24;
const LONG_NAME = 'Abcdefghijklmnopqrstuvwx';
const CHIPS: readonly ChipId[] = ['tailor', 'turn', 'row', 'skip'];

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

/** Opens /home with the live module started and, when named, a band's chunk in. */
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
const cmd = (page: Page) => band(page).locator('[data-cmd]');
const chip = (page: Page, id: ChipId) => band(page).locator(`[data-chip="${id}"]`);

/**
 * Brings a band below the first screen into view and waits for its chunk (LANDING.md 4.2): the
 * reserved box filled and the band's entries started, so a press reaches its handlers.
 */
export async function bandReady(page: Page, id: string): Promise<void> {
  await page.locator(`[data-band="${id}"]`).scrollIntoViewIfNeeded();
  await page.waitForFunction(
    (b) =>
      [...document.querySelectorAll(`[data-band="${b}"] [data-reserve]`)].every((box) =>
        box.hasAttribute('data-filled'),
      ),
    id,
    { timeout: 90_000 },
  );
  if (id === 'agents')
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-band="agents"] [data-transport-panel="cli"] [data-panel-text]')
          ?.childElementCount ?? 0) > 0,
      null,
      { timeout: 90_000 },
    );
  await page.waitForTimeout(300);
}

/** The visible lines of a transport's panel at the shown width. */
export async function panelLines(page: Page, tab: 'cli' | 'mcp' | 'http'): Promise<string[]> {
  return page.evaluate((key) => {
    const panel = document.querySelector<HTMLElement>(
      `[data-band="agents"] [data-transport-panel="${key}"]`,
    );
    if (panel === null) return [];
    const views = [...panel.querySelectorAll<HTMLElement>('[data-panel-text]')];
    const shown =
      views.find((v) => v.offsetParent !== null && getComputedStyle(v).display !== 'none') ??
      views.find((v) => getComputedStyle(v).display !== 'none') ??
      views[0];
    if (shown === undefined) return [];
    return [...shown.children].map((el) => el.textContent ?? '');
  }, tab);
}

/** Joins panel lines back into the logical lines they were wrapped from. */
export function unwrap(lines: readonly string[]): string[] {
  const out: string[] = [];
  const indent = ' '.repeat(CONTINUATION_INDENT);
  for (const line of lines) {
    /* a continuation: panel-format.ts indents the rest of a broken line by exactly four spaces */
    if (out.length > 0 && line.startsWith(indent) && line[CONTINUATION_INDENT] !== ' ')
      out[out.length - 1] = `${(out[out.length - 1] as string).trimEnd()} ${line.slice(CONTINUATION_INDENT)}`;
    else out.push(line);
  }
  return out.map((l) => l.trimEnd());
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

/** A recorded line with the page's revision. */
const atRevision = (line: string, revision: number): string =>
  line.replace(/revision \d+/, `revision ${revision}`);

/** The version line `version list` prints (apps/cli/src/commands/version.ts `formatVersion`). */
const versionLine = (v: {
  n: number;
  revision: number;
  createdAt: string;
  author: string;
  what: string;
}): string =>
  `${String(v.n).padStart(3)}  r${String(v.revision).padEnd(5)} ${v.createdAt}  ${v.author.padEnd(18)} ${v.what}`.trimEnd();

/** The chip's command and answer as the page prints them for the deck it holds. */
function expected(
  rec: ChipCommand,
  revision: number,
  names: { from: string; to: string } | null,
  freeform: boolean,
): string[] {
  const command =
    names === null ? rec.command : `turboslide tailor --replace=${names.from}=${names.to}`;
  const answer = freeform && rec.answerFreeform !== null ? rec.answerFreeform : rec.answer;
  return [`$ ${command}`, ...answer.map((l) => atRevision(l, revision))];
}

type StepReading = { total: number; ringMs: number | null; ringProps: string[]; disabled: boolean };

/** Presses a chip and reads the press to the step's end, the ring's motion and the chip's state. */
async function pressChip(page: Page, id: ChipId): Promise<StepReading> {
  await page.evaluate((which) => {
    const w = window as unknown as { __step?: Promise<StepReading> };
    const button = document.querySelector<HTMLElement>(`[data-band="agents"] [data-chip="${which}"]`)!;
    w.__step = new Promise((done) => {
      const t0 = performance.now();
      let seenOn = false;
      let disabled = false;
      let ringAt: number | null = null;
      let ringEnd: number | null = null;
      const props = new Set<string>();
      let last = '';
      const sample = (): void => {
        const ring = document.querySelector<HTMLElement>('[data-band="agents"] .ts-home-ring');
        if (ring !== null) {
          const t = ring.style.transform;
          if (ringAt === null) ringAt = performance.now();
          if (t !== last && last !== '') ringEnd = performance.now();
          last = t;
          for (const name of ['left', 'top', 'width', 'height'])
            if ((ring.style as unknown as Record<string, string>)[name] !== '') props.add(name);
          props.add('transform');
        }
        const on = button.getAttribute('aria-disabled') === 'true';
        if (on) {
          seenOn = true;
          disabled = disabled || document.activeElement === button;
        }
        if (seenOn && !on) {
          done({
            total: performance.now() - t0,
            ringMs: ringAt === null || ringEnd === null ? null : ringEnd - ringAt,
            ringProps: [...props],
            disabled,
          });
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }, id);
  await chip(page, id).focus();
  await chip(page, id).click();
  return page.evaluate(() => (window as unknown as { __step: Promise<StepReading> }).__step);
}


export function rows(): void {
  test(title('home.agents.rest'), async ({ browser }) => {
    for (const width of ['desktop', 'phone'] as const) {
      const page = await freshPage(browser);
      await openHome(page, width);
      await bandReady(page, 'agents');
      const lines = await panelLines(page, 'cli');
      const wide = width === 'desktop';
      const want = [
        `$ ${HOME_CHIPS.versionList.command}`,
        ...HOME_CHIPS.versions.map((v) => versionLine(v)),
      ];
      /* the screen as panel-format.ts breaks it at the shown width, every padding space kept */
      expect(lines, `the resting screen at ${width}`).toEqual(
        formatLines(want, wide ? 'wide' : 'narrow', { overlong: 'break' }),
      );
      const { columns, slots } = PANEL_WIDTHS[wide ? 'wide' : 'narrow'];
      expect(lines.length).toBeLessThanOrEqual(slots);
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(columns);
      /* no line cut or wider than the panel */
      const fit = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-band="agents"] [data-panel-text]')]
          .filter((v) => v.offsetParent !== null)
          .map((v) => ({ w: v.scrollWidth <= v.clientWidth + 1, h: v.scrollHeight <= v.clientHeight + 1 })),
      );
      for (const f of fit) expect(f).toEqual({ w: true, h: true });
      /* slide 5 written above the console */
      const slide = band(page).locator('[data-home-slides][data-slide="next-steps"]').first();
      await expect(slide).toContainText(`Next steps with ${HOME_DECK.customer}`);
      await expect(slide).toContainText(`${HOME_DECK.customer} sellers get the deck`);
      const above = await page.evaluate(() => {
        const s = document.querySelector('[data-band="agents"] [data-home-slides][data-slide="next-steps"]');
        const c = document.querySelector('[data-band="agents"] .ts-home-panel');
        return s !== null && c !== null && s.getBoundingClientRect().bottom <= c.getBoundingClientRect().top;
      });
      expect(above, 'slide 5 above the console').toBe(true);
      /* the run's three Agent rows, recorded */
      const history = band(page).locator('[data-history-row]');
      await expect(history).toHaveCount(3);
      for (let i = 0; i < 3; i += 1) {
        await expect(history.nth(i)).toContainText(AGENTS.author.agent);
        await expect(history.nth(i)).toContainText(AGENTS.recorded);
      }
      const total = HOME_DECK.order.length;
      for (const c of await counters(page)) expect(c).toMatch(new RegExp(`^\\d / ${total}$`));
      await page.context().close();
    }
  });

  test(title('home.agents.chips'), async ({ browser }) => {
    test.setTimeout(240_000);
    for (const name of [HOME_DECK.customer, LONG_NAME]) {
      const page = await freshPage(browser);
      await openHome(page);
      await bandReady(page, 'agents');
      /* the page deck's revision: the recorded one, plus one for each change made here */
      let revision = HOME_CHIPS.restRevision;
      if (name !== HOME_DECK.customer) {
        await typeLine(page, `tailor --replace=${HOME_DECK.customer}=${name}`);
        await page.waitForFunction(
          () => document.querySelector('[data-band="agents"] [data-chip][aria-disabled="true"]') === null,
        );
        revision += 1;
      }
      let freeform = false;
      for (const dir of ['on', 'off'] as const)
        for (const id of CHIPS) {
          const rec = HOME_CHIPS.commands[id][dir];
          revision += 1;
          const rev = revision;
          const before = await band(page).locator('[data-history-row]').count();
          const names =
            id === 'tailor'
              ? dir === 'on'
                ? { from: name, to: HOME_CHIPS.chipCustomer }
                : { from: HOME_CHIPS.chipCustomer, to: HOME_CHIPS.customer }
              : null;
          const reading = await pressChip(page, id);
          if (id === 'turn') freeform = true;
          /* the printed command and answer: the recording with the name and the revision */
          const lines = unwrap(await panelLines(page, 'cli'));
          expect(lines.slice(-2), `${id} (${dir}) printed`).toEqual(expected(rec, rev, names, freeform));
          /* one Version history row, by Agent */
          await expect(band(page).locator('[data-history-row]')).toHaveCount(Math.min(before + 1, 10));
          await expect(band(page).locator('[data-history-row]').first()).toContainText(AGENTS.author.agent);
          expect(reading.disabled, `${id} kept focus with aria-disabled`).toBe(true);
          expect(reading.ringProps.filter((p) => p !== 'transform'), 'the ring moves by transform').toEqual([]);
          noteTiming(`${id} (${dir}) with ${name.length} characters, press to the flag leaving`, reading.total);
          noteTiming(`${id} (${dir}) ring`, reading.ringMs);
          if (loadReading().read) {
            expect(reading.total).toBeLessThanOrEqual(STEP_BOUND_MS);
            if (reading.ringMs !== null) expect(reading.ringMs).toBeLessThanOrEqual(RING_BOUND_MS + 50);
          }
          /* the change on slide 5 above and elsewhere */
          const slide = band(page).locator('[data-home-slides][data-slide="next-steps"]').first();
          if (id === 'tailor') {
            const to = dir === 'on' ? HOME_CHIPS.chipCustomer : HOME_CHIPS.customer;
            await expect(slide).toContainText(`Next steps with ${to}`);
            await expect(page.locator('[data-home-slides]:not([data-slide="next-steps"])').filter({ hasText: to }).first()).toBeVisible();
            await expect(chip(page, 'tailor')).toHaveText(
              `Tailor for ${dir === 'on' ? HOME_CHIPS.customer : HOME_CHIPS.chipCustomer}`,
            );
          } else if (id === 'turn') {
            const deg = await slide.locator('[data-block="h"]').evaluate((el) => getComputedStyle(el).rotate);
            expect(deg).toBe(dir === 'on' ? `${HOME_CHIPS.turnTo}deg` : 'none');
          } else if (id === 'row') {
            await expect(slide.locator(`[data-run="rows/items/${HOME_CHIPS.row.index}/value"]`)).toHaveText(
              dir === 'on' ? HOME_CHIPS.row.after : HOME_CHIPS.row.before,
            );
          } else {
            const marked = await band(page).locator('.ts-home-skip').count();
            expect(marked).toBe(dir === 'on' ? 1 : 0);
            /* the Present list and the show leave it out (the show's own rows, V3#16) */
            const listed = page.locator('[data-band="present"] [data-slide-row="next-steps"]');
            if ((await listed.count()) > 0 && dir === 'on')
              await expect(listed).toContainText('Skipped');
          }
          if (name !== HOME_DECK.customer) break;
        }
      await page.context().close();
    }
  });

  test(title('home.agents.typed'), async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await freshPage(browser);
    await openHome(page);
    await bandReady(page, 'agents');
    const tail = async (n: number): Promise<string[]> => unwrap(await panelLines(page, 'cli')).slice(-n);
    await typeLine(page, 'help');
    expect(await tail(HOME_CHIPS.help.length + 1)).toEqual(['$ turboslide help', ...HOME_CHIPS.help]);
    expect(HOME_CHIPS.help[0]).toContain('six commands');
    /* Up recalls the last line */
    await cmd(page).press('ArrowUp');
    await expect(cmd(page)).toHaveValue('help');
    await cmd(page).fill('');
    await typeLine(page, 'deck list');
    expect(await tail(1)).toEqual([HOME_CHIPS.refusal]);
    expect(HOME_CHIPS.refusal).toBe(`This page runs 6 of the CLI's ${HOME_FACTS.cliCommands} commands.`);
    await typeLine(page, "block set next-steps#h /text 'open");
    expect(await tail(1)).toEqual([AGENTS.panel.unclosedQuote]);
    await typeLine(page, `tailor --replace=${HOME_DECK.customer}=${LONG_NAME}x`);
    expect(await tail(1)).toEqual([AGENTS.panel.longName]);
    /* a name the deck does not hold: the CLI's recorded answer, nothing renamed */
    await typeLine(page, 'tailor --replace=Globex=Initech');
    expect(await tail(1)).toEqual(HOME_CHIPS.tailorAbsent.map((l) => atRevision(l, HOME_CHIPS.restRevision)));
    /* a chip's command typed runs as the chip does */
    await typeLine(page, HOME_CHIPS.commands.turn.on.command.replace(/^turboslide /, ''));
    await page.waitForFunction(() => document.querySelector('[data-band="agents"] .ts-home-ring') === null);
    await expect(chip(page, 'turn')).toHaveText(/Straighten the Title/);
    /* any name up to 24 characters */
    await typeLine(page, `tailor "--replace=${HOME_DECK.customer}=O'Neil & Co"`);
    await expect(band(page).locator('[data-home-slides][data-slide="next-steps"]').first()).toContainText("O'Neil & Co");
    await page.waitForFunction(() => document.querySelector('[data-band="agents"] [data-chip][aria-disabled="true"]') === null);
    /* version list: the recorded four and one line per version made on the page */
    await typeLine(page, 'version list');
    const listed = await tail(7);
    const collapse = (l: string): string => l.replace(/ +/g, ' ').trim();
    expect(listed.slice(0, 5).map(collapse)).toEqual(
      ['$ turboslide version list', ...HOME_CHIPS.versions.map((v) => versionLine(v))].map(collapse),
    );
    expect(collapse(listed[5] ?? '')).toMatch(/^5 r4 \S+Z agent:landing Turned the title on slide 5 to 8 degrees$/);
    expect(collapse(listed[6] ?? '')).toMatch(/^6 r5 \S+Z agent:landing Tailored for O'Neil & Co$/);
    /* version restore: a listed version as Agent; an unlisted one the CLI's refusal */
    await typeLine(page, 'version restore 99');
    expect(await tail(HOME_CHIPS.restore.absent.length)).toEqual([...HOME_CHIPS.restore.absent]);
    await typeLine(page, 'version restore 1');
    expect(await tail(1)).toEqual(['restored version 1: revision 6']);
    /* version 1 is a recorded version, which has no time of its own: its row names its number */
    await expect(band(page).locator('[data-history-row]').first()).toContainText('Restored version 1');
    await expect(band(page).locator('[data-history-row]').first()).toContainText(AGENTS.author.agent);
    /* version 1 is the deck before the run: slide 5 has left it, the slide above keeps its crosses */
    await expect(band(page).locator('[data-home-slides][data-slide="next-steps"]').first()).toHaveAttribute(
      'data-agent-absent',
      '',
    );
    const order = await page.evaluate(
      () => (window as unknown as { tsHomeStore?: { get(): { order: string[] } } }).tsHomeStore?.get().order ?? null,
    );
    if (order !== null) expect(order).not.toContain('next-steps');
    /* a version made on the page restores by its time: version 5, the turned title */
    await typeLine(page, 'version restore 5');
    expect(await tail(1)).toEqual(['restored version 5: revision 7']);
    await expect(band(page).locator('[data-history-row]').first()).toContainText(/Restored the version of \d{1,2}:\d{2}\s?(AM|PM)/);
    await expect(chip(page, 'turn')).toHaveText(/Straighten the Title/);
    await typeLine(page, 'version restore 1');
    /* with slide 5 absent the CLI refuses the turn, as recorded */
    await chip(page, 'turn').click();
    await page.waitForFunction(() => document.querySelector('[data-band="agents"] [data-chip][aria-disabled="true"]') === null);
    expect(await tail(HOME_CHIPS.absent.turn.on.length)).toEqual(
      HOME_CHIPS.absent.turn.on.map((l) => l),
    );
    await page.context().close();
  });

  test(title('home.agents.transports'), async ({ browser }) => {
    const page = await freshPage(browser);
    await openHome(page);
    await bandReady(page, 'agents');
    const tabs = band(page).locator('[role="tab"]');
    await expect(tabs).toHaveCount(3);
    await expect(band(page).locator('[role="tablist"]')).toHaveCount(1);
    await tabs.nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(0)).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('End');
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    /* a chip's request on each transport, with the current name and the revision read */
    await chip(page, 'tailor').click();
    await page.waitForFunction(() => document.querySelector('[data-band="agents"] [data-chip][aria-disabled="true"]') === null);
    await chip(page, 'skip').click();
    await page.waitForFunction(() => document.querySelector('[data-band="agents"] [data-chip][aria-disabled="true"]') === null);
    await tabs.nth(1).click();
    const mcp = unwrap(await panelLines(page, 'mcp'));
    const tool = HOME_CHIPS.commands.tailor.on.mcp.name;
    expect(mcp.join('\n')).toContain(`tools/call ${tool} {"replacements": [{"from": "${HOME_DECK.customer}", "to": "${HOME_CHIPS.chipCustomer}"}], "baseRevision": ${HOME_CHIPS.restRevision}}`);
    expect(mcp.join('\n')).toContain(`tools/call ${HOME_CHIPS.commands.skip.on.mcp.name} {"slideIds": ["next-steps"], "skip": true, "baseRevision": ${HOME_CHIPS.restRevision + 1}}`);
    expect(mcp[mcp.length - 1]).toBe(AGENTS.panel.requestOnly);
    await tabs.nth(2).click();
    const http = unwrap(await panelLines(page, 'http'));
    expect(http.join('\n')).toContain(`POST ${HOME_CHIPS.commands.skip.on.http.path} {"slideIds": ["next-steps"], "skip": true, "baseRevision": ${HOME_CHIPS.restRevision + 1}}`);
    expect(http[http.length - 1]).toBe(AGENTS.panel.requestOnly);
    for (const line of [...mcp, ...http]) expect(line).not.toMatch(/^(skipped|13 replacements)/);
    await page.context().close();
  });

  test(title('home.agents.history'), async ({ browser }) => {
    for (const width of ['desktop', 'phone'] as const) {
      const page = await freshPage(browser);
      await openHome(page, width);
      await bandReady(page, 'agents');
      const list = band(page).locator('[data-history]');
      const reserved = await list.evaluate((el) => el.getBoundingClientRect().height);
      expect(reserved).toBe(width === 'desktop' ? 440 : 220);
      const below = await page.locator('[data-band="present"]').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      /* each chip writes its row within 200 ms of its landing, newest first, with its icon */
      for (const id of CHIPS) {
        const t = await page.evaluate((which) => {
          const w = window as unknown as { __row?: Promise<number> };
          const ol = document.querySelector('[data-band="agents"] [data-history]')!;
          w.__row = new Promise((done) => {
            let landed = 0;
            const ring = new MutationObserver(() => {
              if (landed === 0 && document.querySelector('[data-band="agents"] .ts-home-ring') !== null)
                landed = performance.now();
            });
            ring.observe(document.querySelector('[data-band="agents"]')!, { childList: true, subtree: true });
            const rows = new MutationObserver(() => {
              rows.disconnect();
              ring.disconnect();
              done(landed === 0 ? 0 : performance.now() - landed);
            });
            rows.observe(ol, { childList: true });
          });
          document.querySelector<HTMLElement>(`[data-band="agents"] [data-chip="${which}"]`)!.click();
        }, id);
        void t;
        const ms = await page.evaluate(() => (window as unknown as { __row: Promise<number> }).__row);
        noteTiming(`${id}: landing to its row`, ms);
        if (loadReading().read) expect(ms).toBeLessThanOrEqual(ROW_BOUND_MS);
        await page.waitForFunction(() => document.querySelector('[data-band="agents"] [data-chip][aria-disabled="true"]') === null);
        const row = band(page).locator('[data-history-row]').first();
        await expect(row).toContainText(AGENTS.author.agent);
        await expect(row.locator('[data-icon="command-line"]')).toHaveCount(1);
        await expect(row.locator('.ts-home-history-time')).toHaveText(/^\d{1,2}:\d{2}\s?(AM|PM)$/);
      }
      /* the list keeps its height: nothing below it moved */
      expect(await list.evaluate((el) => el.getBoundingClientRect().height)).toBe(reserved);
      const after = await page.locator('[data-band="present"]').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      expect(after).toBe(below);
      for (const h of await band(page).locator('[data-history-row]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height)))
        expect(h).toBe(44);
      /* a You row: the hero's title moved, and its Undo takes the row away */
      const hero = page.locator('[data-band="hero"] [data-hero-slide] [data-object="title#heading"]').first();
      if ((await hero.count()) > 0 && width === 'desktop') {
        await hero.scrollIntoViewIfNeeded();
        const box = (await hero.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20, { steps: 6 });
        await page.mouse.up();
        const first = band(page).locator('[data-history-row]').first();
        await expect(first).toContainText(AGENTS.author.you);
        await expect(first.locator('[data-icon="user-circle"]')).toHaveCount(1);
        const words = (await first.locator('.ts-home-history-words').textContent()) ?? '';
        await page.locator('[data-undo="hero"]').first().click();
        await expect(band(page).locator('[data-history-row]').first()).not.toContainText(words);
      }
      await page.context().close();
    }
  });

  test(title('home.agents.recorded'), async ({ browser }) => {
    test.setTimeout(240_000);
    const check = spawnSync(process.execPath, ['scripts/home/run.ts', '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 200_000,
    });
    expect(check.status, `${check.stdout}\n${check.stderr}`).toBe(0);
    expect(HOME_CHIPS.versions).toHaveLength(4);
    expect(HOME_CHIPS.versions[0]?.what).toBe(`"${HOME_CHIPS.deckTitle}"`);
    expect(HOME_CHIPS.cliCommands).toBe(HOME_FACTS.cliCommands);
    /* every chip's request names the action's tool and path */
    for (const id of CHIPS)
      for (const dir of ['on', 'off'] as const) {
        const rec = HOME_CHIPS.commands[id][dir];
        expect(rec.http.path).toBe(`/api/actions/${rec.action}`);
        expect(rec.mcp.arguments).toEqual(rec.http.body);
        expect(rec.mcp.arguments['baseRevision']).toBe(
          dir === 'on' ? HOME_CHIPS.restRevision : HOME_CHIPS.restRevision + 1,
        );
      }
    const page = await freshPage(browser);
    await openHome(page);
    await bandReady(page, 'agents');
    /* the resting screen is the recording */
    const first = formatLines([versionLine(HOME_CHIPS.versions[0]!)], 'wide', { overlong: 'break' });
    expect((await panelLines(page, 'cli')).slice(1, 1 + first.length)).toEqual(first);
    await page.context().close();
  });
}
