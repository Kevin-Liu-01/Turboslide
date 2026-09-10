// The per-run context every command receives: parsed arguments, the output channels, the working
// directory and the author (SPEC 7.2 --author, TURBOSLIDE_AUTHOR, `agent:<runId>`).
import type { Parsed } from './args.ts';
import type { Output } from './output.ts';

export type Author = { kind: 'human' | 'agent'; name: string; runId?: string };

export function parseAuthor(value: string): Author {
  const m = /^agent:(.+)$/.exec(value);
  if (m) return { kind: 'agent', name: 'agent', runId: m[1] ?? '' };
  return { kind: 'human', name: value };
}

export type CommandContext = {
  args: Parsed;
  out: Output;
  cwd: string;
  env: NodeJS.ProcessEnv;
  author: Author;
  /** The positionals after the command (and subcommand) words. */
  rest: string[];
};
