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
  'derived',
  'python',
  // export: the first-baseline target; `lint --baseline` stays a switch
  'baseline-target',
  // export: `--headings raster`, `--raster-scale auto|2|3`, `--picture-scale 2|3` (SPEC 8.2, 8.3,
  // 8.6). The render worker passes them as `--flag value`, so a bare flag here would read the
  // value as a slide id and leave the option at its default.
  'headings',
  'raster-scale',
  'picture-scale',
  // M2 writes (SPEC 7.2): the typed write path and the version commands.
  'slot',
  'set',
  'unset',
  'minutes',
  'note',
  'message',
  'm',
  'file',
  // M5 asset and material commands (SPEC 7.2)
  'role',
  'alt',
  'id',
  'title',
  'artist',
  'license',
  'source-url',
  'credit',
  'crop',
  'channel',
  'blur',
  'min-filter',
  'polarity',
  'recipe',
  'region',
  'detail',
  'settle',
  'source',
  'anchor',
  'preset',
  'uniforms',
  'backend',
]);

/**
 * Valued flags that also work bare: `lint --render <dir>` names a render directory while
 * `diff --render` is a switch, so a following `--flag` or the end of the line leaves it `true`.
 */
const OPTIONAL_VALUE_FLAGS: ReadonlySet<string> = new Set(['render']);

/** Short flags: `-m <note>` on version save (the acceptance line), `-h` for help. */
const SHORT_FLAGS: Readonly<Record<string, string>> = { m: 'm', h: 'help' };

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
        if (next === undefined || next.startsWith('--')) {
          if (OPTIONAL_VALUE_FLAGS.has(name)) {
            set(name, true);
            continue;
          }
          throw new UsageError(`--${name} needs a value`);
        }
        set(name, next);
        i += 1;
      } else {
        set(name, true);
      }
      continue;
    }
    const short = /^-([a-zA-Z])$/.exec(arg);
    const shortName = short?.[1] !== undefined ? SHORT_FLAGS[short[1]] : undefined;
    if (shortName !== undefined) {
      const next = argv[i + 1];
      if (VALUED_FLAGS.has(shortName)) {
        if (next === undefined || next.startsWith('-'))
          throw new UsageError(`-${short?.[1] ?? ''} needs a value`);
        set(shortName, next);
        i += 1;
      } else {
        set(shortName, true);
      }
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

/** Every value of a repeated flag, uncut: `--set /a=1 --set /b=x,y` keeps the comma. */
export function flagAll(parsed: Parsed, name: string): string[] {
  const v = parsed.flags[name];
  if (v === undefined || v === true) return [];
  return Array.isArray(v) ? [...v] : [v];
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
