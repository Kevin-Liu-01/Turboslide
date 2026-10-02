// The banner (gslides-parity SPEC-4 0.17, 1.11; docs/NEXT.md 4.1.3 item 5): `turboslide --version`
// prints the mark as six lines of half block characters from the 16 px rows that draw the tab
// icon (markBlocks of @turboslide/theme/brand, the one geometry module) beside the word, the
// version, the hosted address, the action count and the effects backend this machine runs;
// `turboslide info` prints the same header before the deck facts with the deck's id, revision and
// slide count on the fourth line. The four facts take the first four glyph lines and the last two
// glyph lines stand alone. No colour is written, so NO_COLOR changes nothing and the output is
// byte identical with and without it. `commands/version.ts` is the `version save|list|restore`
// command and is not this file.
import { readFileSync } from 'node:fs';

import { describeBackends } from '@turboslide/effects/select';
import { ACTION_IDS } from '@turboslide/schema/actions';
import { markBlocks } from '@turboslide/theme/brand';
import { SITE } from '@turboslide/theme/brand/site';

import type { CommandContext } from '../context.ts';
import { EXIT } from '../exit.ts';
import { repoRoot } from '../repo.ts';

export type BannerFacts = {
  /** the CLI package's version (apps/cli/package.json) */
  version: string;
  /** the hosted studio */
  origin: string;
  /** ACTION_IDS.length */
  actionCount: number;
  /** describeBackends().selected: native, wasm or typescript */
  backend: string;
  /** the fourth line: the checkout for --version, the deck for info */
  fourth: string;
};

/**
 * The release a version names (docs/NEXT.md 4.1.3 item 6): the newest entry of docs/updates.md, the
 * release notes, as the calendar version YYYY.MMDD.N, where MMDD is the entry's month times 100
 * plus its day and N counts that day's entries from the oldest, so a second release on one day
 * sorts after the first. apps/cli/package.json carries the version; banner.test.ts compares the two
 * and refuses 0.0.0, so the push that writes a release's entry stamps the version with it.
 */
export function releaseVersion(updates: string): string {
  const dates = [...updates.matchAll(/^## (\d{4})-(\d{2})-(\d{2}), /gm)];
  const newest = dates[0];
  if (newest === undefined) throw new Error('docs/updates.md names no release');
  const [, year, month, day] = newest;
  const sameDay = dates.filter((d) => d[1] === year && d[2] === month && d[3] === day).length;
  return `${Number(year)}.${Number(month) * 100 + Number(day)}.${sameDay}`;
}

/** The version of apps/cli/package.json, the release's (releaseVersion); 0.0.0 when it cannot be read. */
export function cliVersion(): string {
  try {
    const text = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(text) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** The facts the banner states, read from the tree and this machine. */
export function bannerFacts(fourth: string): BannerFacts {
  return {
    version: cliVersion(),
    origin: SITE.productionOrigin,
    actionCount: ACTION_IDS.length,
    backend: describeBackends().selected,
    fourth,
  };
}

/** The width of the glyph in characters: the twelve columns of the rows' mark area. */
export const GLYPH_COLUMNS = 12;

/**
 * The six lines: the block glyph (two pixel rows per line) with two spaces and a fact on each of
 * the first four, then the glyph's last two lines alone with their trailing spaces trimmed.
 */
export function bannerLines(facts: BannerFacts): string[] {
  const glyph = markBlocks();
  const text = [
    `${SITE.name} ${facts.version}`,
    facts.origin,
    `${facts.actionCount} actions, effects backend: ${facts.backend}`,
    facts.fourth,
  ];
  return glyph.map((line, i) => {
    const fact = text[i];
    return fact === undefined ? line.trimEnd() : `${line.padEnd(GLYPH_COLUMNS)}  ${fact}`;
  });
}

/** Prints the header lines through the context's human channel (stderr under --json). */
export function printBanner(ctx: CommandContext, facts: BannerFacts): void {
  for (const line of bannerLines(facts)) ctx.out.human(line);
}

/** `turboslide --version`. */
export async function banner(ctx: CommandContext): Promise<number> {
  const checkout = repoRoot();
  const facts = bannerFacts(`checkout ${checkout}`);
  ctx.out.result({
    name: SITE.name,
    version: facts.version,
    origin: facts.origin,
    actionCount: facts.actionCount,
    backend: facts.backend,
    checkout,
  });
  printBanner(ctx, facts);
  return EXIT.ok;
}
