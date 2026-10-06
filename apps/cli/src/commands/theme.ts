// The theme library on the command line (docs/DESIGN.md 7.8): `turboslide theme list`, the CLI
// transport of `theme.list`. The one implementation is `themeList` below, which the deck
// dispatcher registers (commands/deck.ts registerDeckActions), so the CLI, the MCP server and the
// studio's HTTP route answer the same rows from packages/theme/src/themes.ts.
import { THEME_RECORDS } from '@turboslide/theme/themes';
import type { ThemeId } from '@turboslide/schema/brand';

import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';

const USAGE = `usage:
  turboslide theme list             the nine themes: id, name, default appearance and tokens (theme.list)`;

/** One row of `theme.list`. */
export type ThemeRow = {
  id: ThemeId;
  name: string;
  sentence: string;
  defaultAppearance: 'light' | 'dark';
  tokens: { light: Record<string, string>; dark: Record<string, string> };
};

/** The one implementation of theme.list: every record of the library in the picker's order. */
export function themeList(): { themes: ThemeRow[] } {
  return {
    themes: THEME_RECORDS.map((theme) => ({
      id: theme.id,
      name: theme.name,
      sentence: theme.sentence,
      defaultAppearance: theme.defaultAppearance,
      tokens: { light: { ...theme.tokens.light }, dark: { ...theme.tokens.dark } },
    })),
  };
}

export async function theme(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  if (sub !== 'list') throw new UsageError(USAGE);
  const answer = await runDeckAction<{ themes: ThemeRow[] }>({ ...ctx, rest }, 'theme.list', {});
  ctx.out.result(answer);
  for (const row of answer.themes)
    ctx.out.human(
      `${row.id.padEnd(20)} ${row.defaultAppearance.padEnd(5)}  ${row.tokens.light.ink} on ${row.tokens.light.paper}  ${row.name}`,
    );
  ctx.out.human(`${answer.themes.length} themes; deck set /theme <id> picks one`);
  return 0;
}
