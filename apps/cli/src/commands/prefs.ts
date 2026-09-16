// The preferences commands (gslides-parity SPEC-5 7.1, 13; R10 3.4; MILESTONES-5 B5): `prefs get
// [<path>]` reads the caller's preferences record, the whole record or the value at a JSON
// pointer; `prefs set <path> [<value>]` writes one member (the value read as JSON, then as a
// string; `--unset` or no value deletes the member; `/-` appends to a list). The record is the
// principal's (`prefs.get`, `prefs.set`), never the deck's, so neither command takes
// `--base-revision` and no version entry is written. On a checkout the record is the `--author`
// principal's file under the repository's `.turboslide/principals/`, the same file the editor on
// localhost reads; with `--to <studio>` the hosted principal of the saved credential.
import { flagBoolean } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';

export const PREFS_USAGE = `usage: turboslide prefs <get|set> ...
  prefs get [<path>]                the caller's preferences, the whole record or the value at a
                                    JSON pointer such as /units or /substitutions/rows (prefs.get)
  prefs set <path> <value>          write one member; the value is read as JSON, then as a string:
                                    prefs set /units cm, prefs set /autocorrect/quotes false,
                                    prefs set /starred/- q4-review, prefs set /substitutions/rows/- '{"from":"(p)","to":"℗","on":true}' (prefs.set)
  prefs set <path> --unset          delete the member, such as a substitution row or a starred deck
Every command takes --to <studio>, --author <name> and --json.`;

/** The value of `prefs set`: JSON when it parses (true, 12, ["a"], {"from":...}), the string otherwise. */
export function parsePrefsValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function describe(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export async function prefs(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  switch (sub) {
    case 'get': {
      const path = rest[0] ?? '';
      const answer = await runDeckAction<{ path: string; value?: unknown }>(
        ctx,
        'prefs.get',
        path === '' ? {} : { path },
      );
      ctx.out.result(answer);
      ctx.out.human(
        'value' in answer
          ? `${answer.path === '' ? 'preferences' : answer.path} ${describe(answer.value)}`
          : `${answer.path}: no value`,
      );
      return 0;
    }
    case 'set': {
      const path = rest[0];
      if (path === undefined || path === '') {
        throw new UsageError(`prefs set wants a JSON pointer\n${PREFS_USAGE}`);
      }
      const unset = flagBoolean(ctx.args, 'unset');
      const raw = rest[1];
      if (!unset && raw === undefined) {
        throw new UsageError(
          `prefs set ${path} wants a value, or --unset to delete the member\n${PREFS_USAGE}`,
        );
      }
      if (unset && raw !== undefined) {
        throw new UsageError(`prefs set takes a value or --unset, not both\n${PREFS_USAGE}`);
      }
      const answer = await runDeckAction<{ preferences: Record<string, unknown> }>(
        ctx,
        'prefs.set',
        unset ? { path } : { path, value: parsePrefsValue(raw ?? '') },
      );
      ctx.out.result(answer);
      ctx.out.human(unset ? `${path} deleted` : `${path} ${describe(parsePrefsValue(raw ?? ''))}`);
      return 0;
    }
    default:
      throw new UsageError(PREFS_USAGE);
  }
}
