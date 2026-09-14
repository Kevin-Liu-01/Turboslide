// The banner (gslides-parity SPEC-4 0.17, 1.11; research-4 report 01 item 19): `turboslide
// --version` prints the mark as four lines of half block characters from the same bitmap that
// draws the favicon (markBlocks(8) of @turboslide/theme/brand, the one geometry module) beside the
// word, the version, the hosted address, the action count and the effects backend this machine
// runs; `turboslide info` prints the same header before the deck facts with the deck's id,
// revision and slide count on the fourth line. No colour is written, so NO_COLOR changes nothing
// and the output is byte identical with and without it. `commands/version.ts` is the
// `version save|list|restore` command and is not this file.
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

/** The version of apps/cli/package.json; 0.0.0 when it cannot be read. */
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

/** The four lines: the block glyph (two grid rows per line, two spaces) then the text. */
export function bannerLines(facts: BannerFacts): string[] {
  const glyph = markBlocks(8);
  const text = [
    `${SITE.name} ${facts.version}`,
    facts.origin,
    `${facts.actionCount} actions, effects backend: ${facts.backend}`,
    facts.fourth,
  ];
  return glyph.map((line, i) => `${line}  ${text[i] ?? ''}`);
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
