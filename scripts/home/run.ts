// The agents band's and the hero loop's recordings (docs/LANDING.md 2.2 "The loop", 2.9, 6.1;
// docs/gslides-parity/landing/build/v3.md). V3's build module: the entry
// (scripts/build-home-assets.ts, V1's) calls `recordChips()` in its --run and `deriveChips()` in its
// derivation (v3.md R6); until then this file runs on its own:
//
//   node scripts/home/run.ts --record   the CLI over temporary copies of the fixture; writes
//                                       apps/studio/home-deck/recorded-chips/ (chips.json and slide
//                                       5's looks), then chips.generated.ts and loop.generated.ts
//   node scripts/home/run.ts --write    the two generated files from the recordings (no CLI)
//   node scripts/home/run.ts --check    derives the two in memory and compares them with the tree
//                                       byte for byte; exit 1 names the difference
//
// Two files, so the hero's loop never brings the agents band's recordings into the live core:
// `loop.generated.ts` holds the loop's four steps and slide 5's two looks (`HOME_LOOP`,
// `HOME_NEXT_STEPS`, read by `live/step.ts`, `live/next-steps.ts` and V1's `live/stage.ts`);
// `chips.generated.ts` holds the chips, the typed forms and the versions (`HOME_CHIPS`, read by the
// agents band's chunk alone).
//
// What it records, every answer verbatim (the CLI is `node apps/cli/bin/turboslide.mjs`; the
// orchestrator's rules forbid `pnpm exec`):
//
// - The page deck's history. The CLI lists no version before the run's first write and refuses
//   `version restore 0`, so the build saves a named version first (`version save -m <the deck's
//   title>`): version 1 is the deck before the run (slide 5 absent) and versions 2 to 4 are the run's
//   three steps (v3.md "What the CLI answered").
// - The hero's loop (2.2): on a copy of the page deck, `version restore 1` and then the run's three
//   steps again, so every printed revision is the one the CLI printed in that order.
// - The four chips (2.9): each chip's command and the command that takes it back, on the page deck
//   at rest and on the deck after each other chip (the twelve ordered pairs, both ways), so the build
//   proves an answer changes only in the customer's name and the revision; the typed forms
//   (`version list`, `version restore <n>`, a tailor whose name the deck does not hold); slide 5's
//   looks after the chips that change it, for the renderer (v3.md R3).
//
// The recordings sit beside the entry's `recorded/` (which its --run empties) in `recorded-chips/`;
// both folders are outside the fixture's sha256 (the entry's `fixtureFiles` skips every path that
// starts with `recorded`).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as prettier from 'prettier';

import {
  PANEL_WIDTHS,
  formatLines,
  formatScreen,
  splitWords,
  substituteAnswer,
  substituteName,
} from '../../apps/studio/src/components/home/panel-format.ts';
import type { PanelWidth } from '../../apps/studio/src/components/home/panel-format.ts';
import { SPRITE } from '../../packages/theme/src/sprite.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = 'apps/studio/home-deck';
const RECORDED = `${FIXTURE}/recorded-chips`;
const OUT = 'apps/studio/src/components/home/chips.generated.ts';
const OUT_LOOP = 'apps/studio/src/components/home/loop.generated.ts';
const CLI = 'apps/cli/bin/turboslide.mjs';
const CLI_JSON = 'packages/agent/generated/cli.json';
const MCP_JSON = 'packages/agent/generated/mcp-tools.json';
const OPENAPI_JSON = 'packages/agent/generated/openapi.json';

/** The customer the fixture spells, the chip's customer and a name the deck never spells. */
const CUSTOMER = 'Northwind';
const CHIP_CUSTOMER = 'Initech';
const ABSENT_NAME = 'Globex';
/** The author the CLI records for every write (Version history names it Agent). */
const RUN_AUTHOR = 'agent:landing';
/** A 24 character name with no space, the widest a substituted command can get (2.9). */
const LONG_NAME = 'Abcdefghijklmnopqrstuvwx';

/** The agent's clock and the step's beats (LANDING.md 3.4 L-H, 3.6 A1 to A6): clocks, not tokens. */
const AGENT_CLOCK = 24;
const ANSWER_FIRST = 200 + 120;
const ANSWER_STAGGER = 55;
const BEAT = 500;
const RING_MAX = 700;
const RAILS = 600 + 3 * 60;
const ROWS = 160;
const FLAG = 800 + 160;
const STEP_MAX = 5000;
/** The loop's holds (2.2): 3 s on slide 1 before Restore, 2 s on slide 5 after the third step. */
const HOLD_FIRST = 3000;
const HOLD_LAST = 2000;

// ---------------------------------------------------------------------------------------------
// Small helpers

function fail(message: string): never {
  console.error(`home/run: ${message}`);
  process.exit(1);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as T;
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** sha256 over the fixture as the entry computes it: every file but the recordings, path, NUL, bytes, NUL. */
export function fixtureSha256(): string {
  const files: string[] = [];
  const walk = (at: string): void => {
    for (const name of readdirSync(resolve(ROOT, at)).sort()) {
      if (name.startsWith('.')) continue;
      const rel = `${at}/${name}`;
      if (rel.startsWith(`${FIXTURE}/recorded`)) continue;
      if (statSync(resolve(ROOT, rel)).isDirectory()) walk(rel);
      else files.push(rel);
    }
  };
  walk(FIXTURE);
  const hash = createHash('sha256');
  for (const rel of files) {
    hash.update(relative(FIXTURE, rel));
    hash.update('\0');
    hash.update(readFileSync(resolve(ROOT, rel)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

// ---------------------------------------------------------------------------------------------
// The CLI

type CliAnswer = { argv: string[]; code: number; stdout: string[]; stderr: string[] };

function lines(text: string): string[] {
  const out = text.replace(/\r/g, '').split('\n');
  while (out.length > 0 && out[out.length - 1]?.trim() === '') out.pop();
  return out;
}

function cli(cwd: string, argv: string[]): CliAnswer {
  const result = spawnSync(process.execPath, [resolve(ROOT, CLI), ...argv], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, TURBOSLIDE_AUTHOR: RUN_AUTHOR, NO_COLOR: '1', FORCE_COLOR: '0' },
    timeout: 180_000,
  });
  if (result.error) fail(`turboslide ${argv.join(' ')}: ${result.error.message}`);
  const answer = {
    argv,
    code: result.status ?? 1,
    stdout: lines(result.stdout ?? ''),
    stderr: lines(result.stderr ?? ''),
  };
  /* no recorded answer may carry the build machine's folders */
  for (const line of [...answer.stdout, ...answer.stderr])
    if (line.includes(cwd) || line.includes(tmpdir()) || line.includes(ROOT))
      fail(`turboslide ${argv.join(' ')} printed a local path: ${line}`);
  return answer;
}

/** The answer a person reads: stdout, or stdout and stderr when the CLI refused. */
function humanOf(answer: CliAnswer): string[] {
  return answer.code === 0 ? answer.stdout : [...answer.stdout, ...answer.stderr];
}

function must(answer: CliAnswer, what: string): CliAnswer {
  if (answer.code !== 0)
    fail(
      `the CLI refused ${what} (turboslide ${answer.argv.join(' ')}): ${humanOf(answer).join(' | ')}`,
    );
  return answer;
}

function copyDeck(from: string, to: string): void {
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, {
    recursive: true,
    filter: (src) => !src.includes('/recorded') && !src.endsWith('/.turboslide'),
  });
}

// ---------------------------------------------------------------------------------------------
// The commands

/** The run's three writes (the first pass's, unchanged: LANDING.md 2.0 slide 5). */
const STEP3_ROWS = [
  { key: 'Monday', value: `${CUSTOMER} sellers get the deck` },
  { key: 'Wednesday', value: 'Agents draft slides over MCP' },
  { key: 'Friday', value: 'The first call uses this deck' },
];
const STEP3_VALUE = `[\n${STEP3_ROWS.map((row) => `{"key": ${JSON.stringify(row.key)}, "value": ${JSON.stringify(row.value)}}`).join(',\n')}\n]`;
const STEP2_TITLE = `Next steps with ${CUSTOMER}`;

type LoopId = 'restore' | 'new' | 'title' | 'rows';

const RUN_STEPS: readonly {
  id: Exclude<LoopId, 'restore'>;
  argv: string[];
  command: string;
  typed: string;
}[] = [
  {
    id: 'new',
    argv: ['slide', 'new', '--layout', 'rows', '--after', 'ships', '--id', 'next-steps'],
    command: 'turboslide slide new --layout rows --after ships --id next-steps',
    typed: 'turboslide slide new --layout rows --after ships --id next-steps',
  },
  {
    id: 'title',
    argv: ['block', 'set', 'next-steps#h', '/text', STEP2_TITLE],
    command: `turboslide block set next-steps#h /text "${STEP2_TITLE}"`,
    typed: `turboslide block set next-steps#h /text "${STEP2_TITLE}"`,
  },
  {
    id: 'rows',
    argv: ['block', 'set', 'next-steps#rows', '/items', STEP3_VALUE],
    command: `turboslide block set next-steps#rows /items '${STEP3_VALUE}'`,
    typed: 'turboslide block set next-steps#rows /items',
  },
];

/** Restore's version: the named version the build saves before the run. */
const RESTORE_TO = 1;

export type ChipId = 'tailor' | 'turn' | 'row' | 'skip';
const CHIP_IDS: readonly ChipId[] = ['tailor', 'turn', 'row', 'skip'];

const ROW_INDEX = 2;
const ROW_BEFORE = STEP3_ROWS[ROW_INDEX]?.value ?? fail('no third row');
const ROW_AFTER = 'The first call uses this deck and its notes';
const TURN_TO = 8;

type ChipForm = {
  argv: string[];
  command: string;
  /** the command up to its value, typed at 24 ms a character (A1); a quoted value prints whole */
  typed: string;
  action: 'deck.tailor' | 'block.rotate' | 'block.set' | 'slide.skip';
  /** the request's arguments without `baseRevision` */
  args: Record<string, unknown>;
};

/** Each chip's command (`on`) and the one that takes it back (`off`), as 2.9's table writes them. */
const CHIPS: Readonly<Record<ChipId, { on: ChipForm; off: ChipForm }>> = {
  tailor: {
    on: {
      argv: ['tailor', `--replace=${CUSTOMER}=${CHIP_CUSTOMER}`],
      command: `turboslide tailor --replace=${CUSTOMER}=${CHIP_CUSTOMER}`,
      typed: `turboslide tailor --replace=${CUSTOMER}=${CHIP_CUSTOMER}`,
      action: 'deck.tailor',
      args: { replacements: [{ from: CUSTOMER, to: CHIP_CUSTOMER }] },
    },
    off: {
      argv: ['tailor', `--replace=${CHIP_CUSTOMER}=${CUSTOMER}`],
      command: `turboslide tailor --replace=${CHIP_CUSTOMER}=${CUSTOMER}`,
      typed: `turboslide tailor --replace=${CHIP_CUSTOMER}=${CUSTOMER}`,
      action: 'deck.tailor',
      args: { replacements: [{ from: CHIP_CUSTOMER, to: CUSTOMER }] },
    },
  },
  turn: {
    on: {
      argv: ['block', 'rotate', 'next-steps#h', '--to', String(TURN_TO)],
      command: `turboslide block rotate next-steps#h --to ${TURN_TO}`,
      typed: `turboslide block rotate next-steps#h --to ${TURN_TO}`,
      action: 'block.rotate',
      args: { slideId: 'next-steps', blockIds: ['h'], to: TURN_TO },
    },
    off: {
      argv: ['block', 'rotate', 'next-steps#h', '--to', '0'],
      command: 'turboslide block rotate next-steps#h --to 0',
      typed: 'turboslide block rotate next-steps#h --to 0',
      action: 'block.rotate',
      args: { slideId: 'next-steps', blockIds: ['h'], to: 0 },
    },
  },
  row: {
    on: {
      argv: ['block', 'set', 'next-steps#rows', `/items/${ROW_INDEX}/value`, ROW_AFTER],
      command: `turboslide block set next-steps#rows /items/${ROW_INDEX}/value "${ROW_AFTER}"`,
      typed: `turboslide block set next-steps#rows /items/${ROW_INDEX}/value`,
      action: 'block.set',
      args: {
        slideId: 'next-steps',
        blockId: 'rows',
        path: `/items/${ROW_INDEX}/value`,
        value: ROW_AFTER,
      },
    },
    off: {
      argv: ['block', 'set', 'next-steps#rows', `/items/${ROW_INDEX}/value`, ROW_BEFORE],
      command: `turboslide block set next-steps#rows /items/${ROW_INDEX}/value "${ROW_BEFORE}"`,
      typed: `turboslide block set next-steps#rows /items/${ROW_INDEX}/value`,
      action: 'block.set',
      args: {
        slideId: 'next-steps',
        blockId: 'rows',
        path: `/items/${ROW_INDEX}/value`,
        value: ROW_BEFORE,
      },
    },
  },
  skip: {
    on: {
      argv: ['slide', 'skip', 'next-steps'],
      command: 'turboslide slide skip next-steps',
      typed: 'turboslide slide skip next-steps',
      action: 'slide.skip',
      args: { slideIds: ['next-steps'], skip: true },
    },
    off: {
      argv: ['slide', 'skip', 'next-steps', '--off'],
      command: 'turboslide slide skip next-steps --off',
      typed: 'turboslide slide skip next-steps --off',
      action: 'slide.skip',
      args: { slideIds: ['next-steps'], skip: false },
    },
  },
};

const VERSION_LIST = ['version', 'list'];
const TAILOR_ABSENT = ['tailor', `--replace=${ABSENT_NAME}=${CHIP_CUSTOMER}`];

// ---------------------------------------------------------------------------------------------
// The recording

type ChipRecording = {
  chip: ChipId;
  dir: 'on' | 'off';
  /** the other chip applied before (on) or after this chip's own on (off); null at rest */
  after: ChipId | null;
  answer: CliAnswer;
};

export type RecordedChips = {
  generator: string;
  fixtureSha256: string;
  deckTitle: string;
  save: CliAnswer;
  steps: CliAnswer[];
  versionList: CliAnswer;
  /** `version restore n` on the page deck at rest, n 1 to 4, and an n the list does not hold */
  restores: CliAnswer[];
  restoreAbsent: CliAnswer;
  loop: { restore: CliAnswer; steps: CliAnswer[] };
  chips: ChipRecording[];
  /** the chips on the deck before the run (slide 5 absent): tailor on and off, the others refused */
  absentChips: { chip: ChipId; dir: 'on' | 'off'; answer: CliAnswer }[];
  /** `version list` after each chip's command at rest: the line a chip's version prints */
  chipVersionLists: { chip: ChipId; answer: CliAnswer }[];
  tailorAbsent: CliAnswer;
  /** the counts of `tailor` on the deck before the run and at rest (2.7's count) */
  tailorCounts: { start: CliAnswer; rest: CliAnswer };
};

/** The CLI over temporary copies; writes the recordings and slide 5's looks. */
export function recordChips(): void {
  const work = mkdtempSync(join(tmpdir(), 'turboslide-home-chips-'));
  const started = Date.now();
  let calls = 0;
  const run = (cwd: string, argv: string[]): CliAnswer => {
    calls += 1;
    return cli(cwd, argv);
  };
  try {
    /* the fixture's sha256 before the copy, so an edit during the recording reads as another fixture */
    const sha = fixtureSha256();
    const deck = join(work, 'deck');
    copyDeck(resolve(ROOT, FIXTURE), deck);
    if (fixtureSha256() !== sha) fail('the fixture changed while it was copied; record again');
    const manifest = JSON.parse(readFileSync(join(deck, 'deck.json'), 'utf8')) as {
      title?: string;
    };
    const deckTitle = manifest.title ?? fail('the fixture has no title');
    /* version 1: the deck before the run */
    const save = must(run(deck, ['version', 'save', '-m', deckTitle]), 'the save before the run');
    const absent = join(work, 'absent');
    copyDeck(deck, absent);
    const steps = RUN_STEPS.map((step) => must(run(deck, step.argv), `the run's ${step.id} step`));
    const rest = join(work, 'rest');
    copyDeck(deck, rest);
    const scratch = join(work, 'scratch');
    const on = (from: string, argv: string[]): CliAnswer => {
      copyDeck(from, scratch);
      return run(scratch, argv);
    };
    const versionList = must(on(rest, VERSION_LIST), 'version list');
    const restores = [1, 2, 3, 4].map((n) => on(rest, ['version', 'restore', String(n)]));
    const restoreAbsent = on(rest, ['version', 'restore', '9']);
    const tailorAbsent = on(rest, TAILOR_ABSENT);
    copyDeck(absent, scratch);
    const tailorCounts = {
      start: must(run(scratch, CHIPS.tailor.on.argv), 'tailor before the run'),
      rest: must(on(rest, CHIPS.tailor.on.argv), 'tailor at rest'),
    };
    /* the hero's loop: Restore, then the three steps on the restored deck */
    const loopDeck = join(work, 'loop');
    copyDeck(rest, loopDeck);
    const loopRestore = must(
      run(loopDeck, ['version', 'restore', String(RESTORE_TO)]),
      'the loop restore',
    );
    const loopSteps = RUN_STEPS.map((step) =>
      must(run(loopDeck, step.argv), `the loop's ${step.id} step`),
    );
    /* the decks after each chip, and after each chip then each other chip */
    const after = new Map<string, string>();
    const deckAfter = (chips: ChipId[]): string => {
      const key = chips.join('+');
      const known = after.get(key);
      if (known !== undefined) return known;
      const base = chips.length === 1 ? rest : deckAfter(chips.slice(0, -1));
      const dir = join(work, `after-${key}`);
      copyDeck(base, dir);
      const chip = chips[chips.length - 1] as ChipId;
      must(run(dir, CHIPS[chip].on.argv), `the ${chip} chip on ${key}`);
      after.set(key, dir);
      return dir;
    };
    const chips: ChipRecording[] = [];
    for (const chip of CHIP_IDS) {
      chips.push({ chip, dir: 'on', after: null, answer: on(rest, CHIPS[chip].on.argv) });
      for (const other of CHIP_IDS)
        if (other !== chip)
          chips.push({
            chip,
            dir: 'on',
            after: other,
            answer: on(deckAfter([other]), CHIPS[chip].on.argv),
          });
      chips.push({
        chip,
        dir: 'off',
        after: null,
        answer: on(deckAfter([chip]), CHIPS[chip].off.argv),
      });
      for (const other of CHIP_IDS)
        if (other !== chip)
          chips.push({
            chip,
            dir: 'off',
            after: other,
            answer: on(deckAfter([chip, other]), CHIPS[chip].off.argv),
          });
    }
    for (const r of chips)
      if (r.answer.code !== 0)
        fail(
          `the CLI refused the ${r.chip} chip (${r.dir}) after ${r.after ?? 'nothing'}: ${humanOf(r.answer).join(' | ')}`,
        );
    /* the chips on the deck before the run (a restore of version 1): slide 5 is absent */
    const absentChips = CHIP_IDS.flatMap((chip) => {
      const first = { chip, dir: 'on' as const, answer: on(absent, CHIPS[chip].on.argv) };
      if (chip !== 'tailor') return [first];
      copyDeck(absent, join(work, 'absent-tailored'));
      must(run(join(work, 'absent-tailored'), CHIPS.tailor.on.argv), 'tailor before the run');
      return [
        first,
        {
          chip,
          dir: 'off' as const,
          answer: on(join(work, 'absent-tailored'), CHIPS.tailor.off.argv),
        },
      ];
    });
    const chipVersionLists = CHIP_IDS.map((chip) => ({
      chip,
      answer: must(on(deckAfter([chip]), VERSION_LIST), `version list after ${chip}`),
    }));
    /* slide 5's looks after the chips that change it: the renderer draws these (v3.md R3) */
    const looks: Record<string, string> = {
      filled: join(rest, 'slides', 'next-steps.json'),
      turned: join(deckAfter(['turn']), 'slides', 'next-steps.json'),
      rewritten: join(deckAfter(['row']), 'slides', 'next-steps.json'),
      'turned-rewritten': join(deckAfter(['turn', 'row']), 'slides', 'next-steps.json'),
    };
    copyDeck(deckAfter(['turn']), scratch);
    must(run(scratch, CHIPS.turn.off.argv), 'the straighten form');
    looks['straightened'] = join(scratch, 'slides', 'next-steps.json');
    const out = resolve(ROOT, RECORDED);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    for (const [look, file] of Object.entries(looks))
      writeFileSync(join(out, `next-steps-${look}.json`), readFileSync(file));
    const recorded: RecordedChips = {
      generator: 'scripts/home/run.ts --record',
      fixtureSha256: sha,
      deckTitle,
      save,
      steps,
      versionList,
      restores,
      restoreAbsent,
      loop: { restore: loopRestore, steps: loopSteps },
      chips,
      absentChips,
      chipVersionLists,
      tailorAbsent,
      tailorCounts,
    };
    writeFileSync(join(out, 'chips.json'), jsonText(recorded));
    console.log(
      `home/run --record: ${calls} CLI calls in ${Math.round((Date.now() - started) / 1000)} s; ${chips.length} chip answers, the loop and the typed forms under ${RECORDED}`,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------------------------
// A small JSON Schema check for the MCP and HTTP bodies (the subset these schemas use; the entry's
// copy, which leaves it with v3.md R6)

type Schema = Record<string, unknown>;

function validate(value: unknown, schema: Schema, root: Schema, path = ''): string[] {
  if (typeof schema['$ref'] === 'string') {
    const ref = schema['$ref'];
    const target = ref.startsWith('#/')
      ? ref
          .slice(2)
          .split('/')
          .reduce<unknown>((at, key) => (at as Record<string, unknown> | undefined)?.[key], root)
      : undefined;
    if (target === undefined) return [`${path}: unresolved ${ref}`];
    return validate(value, target as Schema, root, path);
  }
  const errors: string[] = [];
  const type = schema['type'];
  const types = Array.isArray(type) ? (type as string[]) : typeof type === 'string' ? [type] : [];
  if (types.length > 0) {
    const actual =
      value === null
        ? 'null'
        : Array.isArray(value)
          ? 'array'
          : Number.isInteger(value)
            ? 'integer'
            : typeof value;
    const ok = types.some((t) => t === actual || (t === 'number' && actual === 'integer'));
    if (!ok) return [`${path}: ${actual}, wanted ${types.join(' or ')}`];
  }
  if (Array.isArray(schema['enum']) && !(schema['enum'] as unknown[]).includes(value))
    errors.push(`${path}: ${JSON.stringify(value)} is not in the enum`);
  if (
    typeof schema['pattern'] === 'string' &&
    typeof value === 'string' &&
    !new RegExp(schema['pattern']).test(value)
  )
    errors.push(`${path}: "${value}" misses ${schema['pattern']}`);
  if (
    typeof value === 'string' &&
    typeof schema['minLength'] === 'number' &&
    value.length < schema['minLength']
  )
    errors.push(`${path}: shorter than ${schema['minLength']}`);
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const props = (schema['properties'] ?? {}) as Record<string, Schema>;
    for (const key of (schema['required'] ?? []) as string[])
      if (!(key in value)) errors.push(`${path}/${key}: required`);
    for (const [key, each] of Object.entries(value)) {
      if (key in props)
        errors.push(...validate(each, props[key] as Schema, root, `${path}/${key}`));
      else if (schema['additionalProperties'] === false) errors.push(`${path}/${key}: not allowed`);
    }
  }
  if (Array.isArray(value) && schema['items'] !== undefined)
    value.forEach((each, i) =>
      errors.push(...validate(each, schema['items'] as Schema, root, `${path}/${i}`)),
    );
  return errors;
}

// ---------------------------------------------------------------------------------------------
// The derivation: chips.generated.ts

type Landing =
  | { kind: 'cut' }
  | { kind: 'rails' }
  | { kind: 'words'; chars: number }
  | { kind: 'rows'; count: number }
  | { kind: 'names' }
  | { kind: 'turn'; degrees: number }
  | { kind: 'mark' };

type Schedule = {
  type: number;
  answer: number;
  beat: number;
  ring: number;
  land: number;
  flag: number;
  total: number;
};

function scheduleOf(typedChars: number, answerLines: number, ring: number, land: number): Schedule {
  const s: Schedule = {
    type: typedChars * AGENT_CLOCK,
    answer: answerLines === 0 ? 0 : ANSWER_FIRST + ANSWER_STAGGER * (answerLines - 1),
    beat: BEAT,
    ring,
    land,
    flag: FLAG,
    total: 0,
  };
  s.total = s.type + s.answer + s.beat + Math.max(s.ring, s.land) + s.flag;
  return s;
}

/** A write's answer: its summary line, and the finding lines under it (two spaces in). */
function splitAnswer(answer: CliAnswer): { summary: string[]; findings: string[] } {
  const human = humanOf(answer);
  return {
    summary: human.filter((l) => !/^ {2}\S/.test(l)),
    findings: human.filter((l) => /^ {2}\S/.test(l)).map((l) => l.trim()),
  };
}

/** The finding kinds a recorded answer may carry; `layout/freeform` only once slide 5 is a canvas. */
function checkFindings(findings: readonly string[], freeform: boolean, what: string): void {
  for (const f of findings) {
    if (/ copy\/empty-placeholder /.test(f)) continue;
    if (
      / copy\/sentence-case \(2\): Sentence case: lowercase "[^"]+" unless it is a proper noun/.test(
        f,
      )
    )
      continue;
    if (freeform && /^next-steps layout\/freeform \(1\): /.test(f)) continue;
    fail(`${what}: a finding of a kind the page does not record: ${f}`);
  }
}

const REVISION = /revision (\d+)/;

function revisionOf(line: string, what: string): number {
  const m = REVISION.exec(line);
  if (m === null) fail(`${what}: no revision in "${line}"`);
  return Number(m[1]);
}

/** A summary line with its revision as a placeholder, the form the pairs are compared in. */
const normal = (line: string): string => line.replace(REVISION, 'revision N');

type PanelText = { wide: string[]; narrow: string[] };

function screen(linesIn: readonly string[]): PanelText {
  const at = (width: PanelWidth): string[] => {
    try {
      return formatScreen(linesIn, width);
    } catch (error) {
      return fail(
        `a panel screen does not fit at ${width} (${error instanceof Error ? error.message : String(error)}):\n${linesIn.join('\n')}`,
      );
    }
  };
  return { wide: at('wide'), narrow: at('narrow') };
}

/** One version line as `version list` prints it (apps/cli/src/commands/version.ts `formatVersion`). */
export function versionLine(v: {
  n: number;
  revision: number;
  createdAt: string;
  author: string;
  what: string;
}): string {
  return `${String(v.n).padStart(3)}  r${String(v.revision).padEnd(5)} ${v.createdAt}  ${v.author.padEnd(18)} ${v.what}`;
}

const VERSION_LINE = /^\s*(\d+)\s+r(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/;

export async function deriveChips(): Promise<{
  source: string;
  loopSource: string;
  loopMs: number;
}> {
  const recordedPath = `${RECORDED}/chips.json`;
  if (!existsSync(resolve(ROOT, recordedPath))) fail(`${recordedPath} is missing; run --record`);
  const rec = readJson<RecordedChips>(recordedPath);
  if (rec.fixtureSha256 !== fixtureSha256())
    fail(`${recordedPath} was recorded on another fixture; run --record`);
  const cliJson = readJson<{ actions: unknown[] }>(CLI_JSON);
  const mcp = readJson<{ tools: { name: string; action: string; inputSchema: Schema }[] } & Schema>(
    MCP_JSON,
  );
  const openapi = readJson<
    Schema & {
      paths: Record<
        string,
        { post: { requestBody: { content: { 'application/json': { schema: Schema } } } } }
      >;
    }
  >(OPENAPI_JSON);
  const toolOf = (action: string): { name: string; inputSchema: Schema } =>
    mcp.tools.find((t) => t.action === action) ?? fail(`mcp-tools.json has no tool for ${action}`);
  const request = (
    action: string,
    args: Record<string, unknown>,
    what: string,
  ): {
    mcp: { name: string; arguments: Record<string, unknown> };
    http: { method: 'POST'; path: string; body: Record<string, unknown> };
  } => {
    const tool = toolOf(action);
    const mcpErrors = validate(args, tool.inputSchema, mcp as Schema);
    if (mcpErrors.length > 0)
      fail(`${what}: the MCP body misses ${tool.name}: ${mcpErrors.join('; ')}`);
    const path = `/api/actions/${action}`;
    const op = openapi.paths[path]?.post ?? fail(`openapi.json has no ${path}`);
    const httpErrors = validate(args, op.requestBody.content['application/json'].schema, openapi);
    if (httpErrors.length > 0)
      fail(`${what}: the HTTP body misses ${path}: ${httpErrors.join('; ')}`);
    return {
      mcp: { name: tool.name, arguments: args },
      http: { method: 'POST', path, body: args },
    };
  };

  /* ---- the recorded versions: the save and the run's three writes ---- */
  if (!/^saved version 1 at revision 0: /.test(rec.save.stdout[0] ?? ''))
    fail(`the save before the run answered "${rec.save.stdout[0]}"`);
  const listed = humanOf(rec.versionList);
  if (listed.length !== 4) fail(`version list at rest printed ${listed.length} lines, not 4`);
  const versions = listed.map((line) => {
    const m = VERSION_LINE.exec(line) ?? fail(`a version line the page cannot read: "${line}"`);
    const v = {
      n: Number(m[1]),
      revision: Number(m[2]),
      createdAt: m[3] as string,
      author: m[4] as string,
      what: m[5] as string,
    };
    if (versionLine(v) !== line) fail(`versionLine() does not print "${line}" back`);
    return v;
  });
  const restRevision = versions[versions.length - 1]?.revision ?? fail('no version');

  /* ---- `version restore <n>` at rest: one form, the number and the revision substituted ---- */
  rec.restores.forEach((answer, i) => {
    const want = `restored version ${i + 1}: revision ${restRevision + 1}`;
    if (answer.code !== 0 || humanOf(answer)[0] !== want)
      fail(`version restore ${i + 1} answered "${humanOf(answer).join(' | ')}", not "${want}"`);
  });
  const restoreAbsent = humanOf(rec.restoreAbsent);
  if (rec.restoreAbsent.code === 0) fail('version restore 9 was not refused');

  /* ---- the hero's loop ---- */
  const loopRestore = humanOf(rec.loop.restore);
  if (loopRestore[0] !== `restored version ${RESTORE_TO}: revision ${restRevision + 1}`)
    fail(`the loop's restore answered "${loopRestore[0]}"`);
  const loop = [
    {
      id: 'restore' as const,
      command: `turboslide version restore ${RESTORE_TO}`,
      typedChars: `turboslide version restore ${RESTORE_TO}`.length,
      answer: [loopRestore[0] as string],
      target: null,
      landing: { kind: 'cut' } as Landing,
      schedule: scheduleOf(`turboslide version restore ${RESTORE_TO}`.length, 1, 0, 0),
    },
    ...RUN_STEPS.map((step, i) => {
      const answer = rec.loop.steps[i] ?? fail(`no loop recording of ${step.id}`);
      const { summary, findings } = splitAnswer(answer);
      checkFindings(findings, false, `the loop's ${step.id} step`);
      const split = splitWords(step.command.replace(/^turboslide /, ''));
      if (!split.ok || JSON.stringify(split.words) !== JSON.stringify(step.argv))
        fail(`the ${step.id} step's printed command does not split to its arguments`);
      const recordedRun = rec.steps[i] ?? fail(`no run recording of ${step.id}`);
      if (normal(summary[0] ?? '') !== normal(humanOf(recordedRun)[0] ?? ''))
        fail(`the loop's ${step.id} step answered other words than the run's`);
      const landing: Landing =
        step.id === 'new'
          ? { kind: 'rails' }
          : step.id === 'title'
            ? { kind: 'words', chars: STEP2_TITLE.length }
            : { kind: 'rows', count: STEP3_ROWS.length };
      const land =
        landing.kind === 'rails'
          ? RAILS
          : landing.kind === 'words'
            ? landing.chars * AGENT_CLOCK
            : ROWS + (STEP3_ROWS.length - 1) * ANSWER_STAGGER;
      const typedChars = step.typed.length;
      return {
        id: step.id,
        command: step.command,
        typedChars,
        answer: [summary[0] as string],
        target:
          step.id === 'new'
            ? 'next-steps'
            : step.id === 'title'
              ? 'next-steps#h'
              : 'next-steps#rows',
        landing,
        schedule: scheduleOf(typedChars, 1, RING_MAX, land),
      };
    }),
  ];
  for (const step of loop)
    if (step.schedule.total > STEP_MAX)
      fail(`the loop's ${step.id} step takes ${step.schedule.total} ms, over 5 s`);
  const cycleMs = HOLD_FIRST + loop.reduce((sum, s) => sum + s.schedule.total, 0) + HOLD_LAST;

  /* ---- the chips: one answer a direction, the pairs proving it ---- */
  const commands = {} as Record<ChipId, Record<'on' | 'off', unknown>>;
  for (const chip of CHIP_IDS) {
    commands[chip] = { on: null, off: null };
    for (const dir of ['on', 'off'] as const) {
      const form = CHIPS[chip][dir];
      const all = rec.chips.filter((r) => r.chip === chip && r.dir === dir);
      if (all.length !== 4) fail(`${all.length} recordings of the ${chip} chip (${dir}), not 4`);
      const freeformOf = (r: ChipRecording): boolean => chip === 'turn' || r.after === 'turn';
      const variants = new Map<
        boolean,
        { summary: string; revision: number; after: ChipId | null }
      >();
      for (const r of all) {
        const what = `the ${chip} chip (${dir}) after ${r.after ?? 'nothing'}`;
        const { summary, findings } = splitAnswer(r.answer);
        if (summary.length !== 1) fail(`${what}: ${summary.length} summary lines`);
        const freeform = freeformOf(r);
        checkFindings(findings, freeform, what);
        const line = summary[0] as string;
        const known = variants.get(freeform);
        if (known === undefined)
          variants.set(freeform, {
            summary: line,
            revision: revisionOf(line, what),
            after: r.after,
          });
        else if (normal(known.summary) !== normal(line))
          fail(
            `${what} answered "${line}", where ${known.after ?? 'rest'} answered "${known.summary}": the answers differ in more than the revision`,
          );
      }
      const plain = variants.get(false);
      const free = variants.get(true);
      const base = plain ?? free ?? fail(`no answer for the ${chip} chip (${dir})`);
      /* the recording's revision at rest: the deck's revision before the command, plus one */
      const restAnswer = all.find((r) => r.after === null) ?? fail('no recording at rest');
      const restLine = splitAnswer(restAnswer.answer).summary[0] as string;
      const restRev = revisionOf(restLine, `the ${chip} chip (${dir}) at rest`);
      const before = dir === 'on' ? restRevision : restRevision + 1;
      if (restRev !== before + 1)
        fail(`the ${chip} chip (${dir}) at rest wrote revision ${restRev}, not ${before + 1}`);
      const args = { ...form.args, baseRevision: before };
      const typedChars = form.typed.length;
      const landing: Landing =
        chip === 'tailor'
          ? { kind: 'names' }
          : chip === 'turn'
            ? { kind: 'turn', degrees: dir === 'on' ? TURN_TO : 0 }
            : chip === 'row'
              ? { kind: 'words', chars: (dir === 'on' ? ROW_AFTER : ROW_BEFORE).length }
              : { kind: 'mark' };
      const land =
        landing.kind === 'words'
          ? landing.chars * AGENT_CLOCK
          : landing.kind === 'turn'
            ? RING_MAX
            : 0;
      const split = splitWords(form.command.replace(/^turboslide /, ''));
      if (!split.ok || JSON.stringify(split.words) !== JSON.stringify(form.argv))
        fail(`the ${chip} chip's printed command does not split to its arguments`);
      commands[chip][dir] = {
        chip,
        dir,
        action: form.action,
        argv: form.argv,
        command: form.command,
        typedChars,
        /** the answer as recorded at rest, and on a slide 5 arranged by hand when that differs */
        answer: [normal(restLine) === normal(base.summary) ? restLine : base.summary],
        answerFreeform:
          free !== undefined &&
          plain !== undefined &&
          normal(free.summary) !== normal(plain.summary)
            ? [free.summary.replace(REVISION, `revision ${restRev}`)]
            : null,
        revision: restRev,
        names:
          chip === 'tailor'
            ? dir === 'on'
              ? { from: CUSTOMER, to: CHIP_CUSTOMER }
              : { from: CHIP_CUSTOMER, to: CUSTOMER }
            : null,
        ...request(form.action, args, `the ${chip} chip (${dir})`),
        target:
          chip === 'skip' ? 'next-steps' : chip === 'row' ? 'next-steps#rows' : 'next-steps#h',
        row: chip === 'row' ? ROW_INDEX : null,
        landing,
        schedule: scheduleOf(typedChars, 1, RING_MAX, land),
      };
    }
  }
  /* the longest a chip's step can take: a 24 character name in the tailor command */
  for (const chip of CHIP_IDS)
    for (const dir of ['on', 'off'] as const) {
      const c = commands[chip][dir] as { command: string; schedule: Schedule };
      const longest =
        chip === 'tailor'
          ? c.schedule.total + (LONG_NAME.length - CUSTOMER.length) * AGENT_CLOCK
          : c.schedule.total;
      if (longest > STEP_MAX) fail(`the ${chip} chip (${dir}) takes ${longest} ms, over 5 s`);
    }

  /* ---- the typed line ---- */
  const tailorAbsent = splitAnswer(rec.tailorAbsent).summary;
  const help = [
    'This page runs these six commands.',
    'turboslide tailor --replace=<from>=<to>',
    `turboslide block rotate next-steps#h --to ${TURN_TO}`,
    `turboslide block set next-steps#rows /items/${ROW_INDEX}/value "<text>"`,
    'turboslide slide skip next-steps',
    'turboslide version list',
    'turboslide version restore <n>',
  ];
  const cliCommands = cliJson.actions.length;
  const parseCount = (answer: CliAnswer): { places: number; slides: number } => {
    const m = /^(\d+) replacements? on (\d+) slides?/.exec(answer.stdout[0] ?? '');
    if (m === null) fail(`the tailor answer "${answer.stdout[0]}" names no counts`);
    return { places: Number(m[1]), slides: Number(m[2]) };
  };
  /* every screen fits at both widths with the fixture's name and with a 24 character name */
  for (const chip of CHIP_IDS)
    for (const dir of ['on', 'off'] as const) {
      const c = commands[chip][dir] as { command: string; answer: string[] };
      for (const name of [CUSTOMER, LONG_NAME]) {
        const command = chip === 'tailor' ? substituteName(c.command, CUSTOMER, name) : c.command;
        for (const width of ['wide', 'narrow'] as const) {
          /* the visitor's name in a tailor command is the visitor's text, broken at the column when
             a 24 character name makes `--replace=<from>=<to>` wider than a line (as a typed line's
             echo is); every recorded token stays whole */
          const n =
            formatLines([`$ ${command}`], width, {
              overlong: chip === 'tailor' && name === LONG_NAME ? 'break' : 'throw',
            }).length +
            formatLines(
              c.answer.map((l) => substituteAnswer(l, CUSTOMER, name)),
              width,
            ).length;
          if (n > PANEL_WIDTHS[width].slots)
            fail(`the ${chip} chip (${dir}) needs ${n} lines at ${width} width`);
        }
      }
    }
  screen(['$ turboslide help', ...help]);
  screen(['$ turboslide version list', ...listed]);
  /* the chips while slide 5 is absent (after a restore of version 1): tailor's counts, the others' refusals */
  const absent = Object.fromEntries(
    CHIP_IDS.map((chip) => {
      const of = (dir: 'on' | 'off'): CliAnswer | undefined =>
        (rec.absentChips ?? []).find((r) => r.chip === chip && r.dir === dir)?.answer;
      const onAnswer =
        of('on') ?? fail(`no recording of the ${chip} chip on the deck before the run`);
      const offAnswer = of('off');
      if (chip === 'tailor' && onAnswer.code !== 0)
        fail('tailor was refused on the deck before the run');
      if (chip !== 'tailor' && onAnswer.code === 0)
        fail(`the ${chip} chip ran on the deck before the run, where slide 5 is absent`);
      return [
        chip,
        {
          refused: onAnswer.code !== 0,
          on: splitAnswer(onAnswer).summary,
          off: offAnswer === undefined ? null : splitAnswer(offAnswer).summary,
        },
      ];
    }),
  );
  const data = {
    deckTitle: rec.deckTitle,
    customer: CUSTOMER,
    chipCustomer: CHIP_CUSTOMER,
    restRevision,
    turnTo: TURN_TO,
    row: { index: ROW_INDEX, before: ROW_BEFORE, after: ROW_AFTER },
    commands,
    absent,
    versions,
    versionList: { command: 'turboslide version list', authorAgent: RUN_AUTHOR },
    restore: {
      ...request(
        'version.restore',
        { n: RESTORE_TO, baseRevision: restRevision },
        'version restore',
      ),
      absent: restoreAbsent,
    },
    list: request('version.list', {}, 'version list'),
    tailorAbsent,
    tailorCounts: {
      start: parseCount(rec.tailorCounts.start),
      rest: parseCount(rec.tailorCounts.rest),
    },
    help,
    cliCommands,
    refusal: `This page runs 6 of the CLI's ${cliCommands} commands.`,
    /* the editor's skipped slide glyph (packages/chrome/src/Filmstrip.tsx 431 to 436), from the sprite */
    skipGlyph: { viewBox: SPRITE['eye-slash'].viewBox, body: SPRITE['eye-slash'].body },
  };
  const loopData = {
    customer: CUSTOMER,
    steps: loop,
    holdFirstMs: HOLD_FIRST,
    holdLastMs: HOLD_LAST,
    cycleMs,
    captionSeconds: Math.round(cycleMs / 1000),
  };
  const source = `// Generated by scripts/home/run.ts (docs/LANDING.md 2.2, 2.9, 6.1); never edited by hand.
// node scripts/home/run.ts --check compares this file with its sources.
//
// The agents band's chips, typed forms and versions, every command and answer recorded from the CLI
// by \`scripts/home/run.ts --record\` under apps/studio/home-deck/recorded-chips/ (the hero's loop and
// slide 5's looks, from the same recording, are in loop.generated.ts).
// Each answer is a write's summary line as the CLI printed it on the page deck at rest; the build
// recorded every chip on the deck after each other chip as well and proved the answers differ only
// in the revision (and, once slide 5 is arranged by hand, in the finding count, \`answerFreeform\`).
// The page substitutes the customer's name and the page deck's revision, nothing else.

import type { StepLanding, StepSchedule } from './loop.generated';

export type ChipId = 'tailor' | 'turn' | 'row' | 'skip';

export type ChipRequest = {
  mcp: { name: string; arguments: Readonly<Record<string, unknown>> };
  http: { method: 'POST'; path: string; body: Readonly<Record<string, unknown>> };
};

/** One chip's command in one direction (\`on\`: the chip's label; \`off\`: the label it reads after). */
export type ChipCommand = ChipRequest & {
  chip: ChipId;
  dir: 'on' | 'off';
  action: 'deck.tailor' | 'block.rotate' | 'block.set' | 'slide.skip';
  argv: readonly string[];
  command: string;
  typedChars: number;
  /** the summary line at rest, its revision \`revision\` */
  answer: readonly string[];
  /** the summary line once slide 5 is arranged by hand, where its finding count differs; null when the same */
  answerFreeform: readonly string[] | null;
  revision: number;
  /** the names of a tailor command, which the page replaces with the deck's */
  names: { from: string; to: string } | null;
  target: 'next-steps' | 'next-steps#h' | 'next-steps#rows';
  /** the rows block's item the row chip writes */
  row: number | null;
  landing: StepLanding;
  schedule: StepSchedule;
};

/** A line of \`version list\` (apps/cli/src/commands/version.ts \`formatVersion\`). */
export type VersionFact = { n: number; revision: number; createdAt: string; author: string; what: string };

export type HomeChips = {
  deckTitle: string;
  customer: string;
  chipCustomer: string;
  /** the page deck's revision at rest (the run's third write) */
  restRevision: number;
  turnTo: number;
  row: { index: number; before: string; after: string };
  commands: Readonly<Record<ChipId, { on: ChipCommand; off: ChipCommand }>>;
  /** each chip's answer on the deck before the run (slide 5 absent): tailor runs, the others are refused */
  absent: Readonly<
    Record<ChipId, { refused: boolean; on: readonly string[]; off: readonly string[] | null }>
  >;
  /** the recorded versions: the save before the run and the run's three writes */
  versions: readonly VersionFact[];
  versionList: { command: string; authorAgent: string };
  restore: ChipRequest & { absent: readonly string[] };
  list: ChipRequest;
  /** \`tailor --replace=<a name the deck does not hold>=<to>\` */
  tailorAbsent: readonly string[];
  tailorCounts: { start: { places: number; slides: number }; rest: { places: number; slides: number } };
  help: readonly string[];
  cliCommands: number;
  refusal: string;
  /** the editor's skipped slide glyph, Heroicons 20 solid \`eye-slash\` from the theme's sprite */
  skipGlyph: { viewBox: string; body: string };
};

export const HOME_CHIPS: HomeChips = ${JSON.stringify(data, null, 2)};

`;
  const loopSource = `// Generated by scripts/home/run.ts (docs/LANDING.md 2.2, 2.9, 6.1); never edited by hand.
// node scripts/home/run.ts --check compares this file with its sources.
//
// The hero's staged loop (2.2) and slide 5's two looks the chips set (2.9), recorded from the CLI
// by \`scripts/home/run.ts --record\` with the chips in chips.generated.ts. Apart from the chips so
// the live core plays the loop and draws the looks without the agents band's recordings.

export type StepLanding =
  | { kind: 'cut' }
  | { kind: 'rails' }
  | { kind: 'words'; chars: number }
  | { kind: 'rows'; count: number }
  | { kind: 'names' }
  | { kind: 'turn'; degrees: number }
  | { kind: 'mark' };

/** A step's scheduled lengths in ms with the fixture's name (LANDING.md 3.4 L-H, 3.6 A1 to A6). */
export type StepSchedule = {
  type: number;
  answer: number;
  beat: number;
  ring: number;
  land: number;
  flag: number;
  total: number;
};

/** One step of the hero's staged loop (2.2): Restore, then the run's three writes. */
export type LoopStep = {
  id: 'restore' | 'new' | 'title' | 'rows';
  /** the command as the terminal prints it, with the fixture's name */
  command: string;
  /** the characters typed at 24 ms (A1); the rest, a quoted value, prints whole one frame later */
  typedChars: number;
  answer: readonly string[];
  /** where the ring travels; null for Restore (no ring) */
  target: 'next-steps' | 'next-steps#h' | 'next-steps#rows' | null;
  landing: StepLanding;
  schedule: StepSchedule;
};

export type HomeLoop = {
  /** the customer the loop's commands spell, which the page replaces with the deck's */
  customer: string;
  steps: readonly LoopStep[];
  holdFirstMs: number;
  holdLastMs: number;
  /** a cycle's length: the holds and the four steps (the caption's figure, rounded) */
  cycleMs: number;
  captionSeconds: number;
};

export const HOME_LOOP: HomeLoop = ${JSON.stringify(loopData, null, 2)};

/** Slide 5's two looks the chips set, apart from the chips' recordings so the live core can draw them alone. */
export const HOME_NEXT_STEPS: { turnTo: number; row: { index: number; before: string; after: string } } = ${JSON.stringify({ turnTo: TURN_TO, row: { index: ROW_INDEX, before: ROW_BEFORE, after: ROW_AFTER } }, null, 2)};
`;
  const options = (await prettier.resolveConfig(resolve(ROOT, OUT))) ?? {};
  return {
    source: await prettier.format(source, { ...options, filepath: resolve(ROOT, OUT) }),
    loopSource: await prettier.format(loopSource, {
      ...options,
      filepath: resolve(ROOT, OUT_LOOP),
    }),
    loopMs: cycleMs,
  };
}

// ---------------------------------------------------------------------------------------------
// The modes

async function main(argv: string[]): Promise<void> {
  const mode = argv[0];
  if (mode === '--record') recordChips();
  else if (mode !== '--write' && mode !== '--check')
    fail('name a mode: --record, --write or --check');
  const { source, loopSource, loopMs } = await deriveChips();
  const outputs = [
    [OUT, source],
    [OUT_LOOP, loopSource],
  ] as const;
  if (mode === '--check') {
    for (const [path, text] of outputs) {
      const file = resolve(ROOT, path);
      if (!existsSync(file) || readFileSync(file, 'utf8') !== text)
        fail(`${path} differs from its sources; run node scripts/home/run.ts --write`);
    }
    console.log(
      `home/run --check: ${OUT} and ${OUT_LOOP} match their recordings; the loop is ${loopMs} ms`,
    );
    return;
  }
  for (const [path, text] of outputs) {
    const file = resolve(ROOT, path);
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text) writeFileSync(file, text);
  }
  console.log(`home/run: ${OUT} and ${OUT_LOOP} written; the loop is ${loopMs} ms`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main(process.argv.slice(2));
