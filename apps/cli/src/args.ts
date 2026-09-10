// A small argument parser: positionals, `--flag value`, `--flag=value` and boolean flags. A flag
// given twice collects both values. Flags whose names are in `valued` always take the next token
// as their value, so `--theme light,dark` never swallows a positional by accident.
import { UsageError } from './exit.ts';

export type Parsed = {
  positionals: string[];
  flags: Record<string, string | string[] | true>;
};

/** Flags that take a value (SPEC 7.2 and the M1 acceptance lines). */
export const VALUED_FLAGS: ReadonlySet<string> = new Set([
  'deck',
  'author',
  'theme',
  'themes',
  'scale',
  'out',
  'cols',
  'thumb',
  'overlay',
  'kind',
  'rule',
  'layers',
  'budget',
  'into',
  'url',
  'widths',
  'states',
  'jobs',
  'render',
  'base-revision',
  'allow',
  'section',
  'after',
  'to',
  'quality',
  'format',
  'mode',
  'fonts',
  'plate',
  'gamma',
  'black',
  'white',
  'from',
  'timeout',
  'decks',
  'findings',
  'renders',
]);

export function parseArgs(argv: readonly string[]): Parsed {
  const positionals: string[] = [];
  const flags: Record<string, string | string[] | true> = {};
  const set = (name: string, value: string | true): void => {
    const current = flags[name];
    if (current === undefined) flags[name] = value;
    else if (value === true) return;
    else if (current === true) flags[name] = value;
    else if (Array.isArray(current)) current.push(value);
    else flags[name] = [current, value];
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq > 0) {
        set(arg.slice(2, eq), arg.slice(eq + 1));
        continue;
      }
      const name = arg.slice(2);
      const next = argv[i + 1];
      if (VALUED_FLAGS.has(name)) {
        if (next === undefined || next.startsWith('--'))
          throw new UsageError(`--${name} needs a value`);
        set(name, next);
        i += 1;
      } else {
        set(name, true);
      }
      continue;
    }
    if (arg === '-h') {
      set('help', true);
      continue;
    }
    positionals.push(arg);
  }
  return { positionals, flags };
}

export function flagString(parsed: Parsed, name: string): string | undefined {
  const v = parsed.flags[name];
  if (v === undefined || v === true) return undefined;
  return Array.isArray(v) ? v[v.length - 1] : v;
}

export function flagBoolean(parsed: Parsed, name: string): boolean {
  const v = parsed.flags[name];
  if (v === undefined) return false;
  if (v === true) return true;
  const last = Array.isArray(v) ? v[v.length - 1] : v;
  return last !== 'false' && last !== '0';
}

export function flagNumber(parsed: Parsed, name: string, fallback: number): number {
  const v = flagString(parsed, name);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new UsageError(`--${name} wants a number, got ${v}`);
  return n;
}

/** A comma list flag: `--theme light,dark` or repeated flags. */
export function flagList(parsed: Parsed, name: string, fallback: readonly string[]): string[] {
  const v = parsed.flags[name];
  if (v === undefined || v === true) return [...fallback];
  const raw = Array.isArray(v) ? v : [v];
  return raw
    .flatMap((s) => s.split(','))
    .map((s) => s.trim())
    .filter(Boolean);
}
