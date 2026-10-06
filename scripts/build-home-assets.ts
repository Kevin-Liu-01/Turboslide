// The /home page's build (docs/LANDING.md 2.0, 6.1; docs/gslides-parity/landing/build/integrator.md
// "Landing, day 0" sections 2, 4.2 and 6): every slide, still, recorded command, picture, file and
// fact the landing draws is product output made here, and nothing under the generated files is
// edited by hand.
//
// The page deck. `apps/studio/home-deck/` is the fixture: eight slides in the GT theme, a
// customer's onboarding plan (docs/LANDING.md 2.0, the second pass). `--run` copies it to a
// temporary folder and runs the recorded run's three commands on the copy with the CLI (`node
// apps/cli/bin/turboslide.mjs`, the orchestrator's rules forbid `pnpm exec`); the nine slide deck
// that results is the page deck. The run also records every typed form the panel answers for each
// deck state, the boxes of slide 1's title and subtitle as the CLI's `slide to-canvas` measures
// them, the gesture forms of the canvas band (`slide to-canvas`, `block set /pos`, `block rotate`)
// on the lighthouse and the tailor counts. Every answer is
// written verbatim to `apps/studio/home-deck/recorded/` with the slide states the run produced,
// so the rest of the build reads files, never the CLI.
//
// The modes (run from the repository root with Node 24, type stripping, no build step):
//   --run      the CLI over a temporary copy of the fixture (headless Chromium through the CLI's
//              canvas measurer for `slide to-canvas`); writes home-deck/recorded/run.json and the
//              slide states, then every generated file
//   --export   `turboslide export pptx --mode flatten`, `--mode native` and `turboslide export pdf`
//              of the page deck in both appearances (headless Chromium through the CLI); writes
//              home-deck/recorded/export.json and the export files under public/home, then every
//              generated file
//   --slides, --stills, --boot, --facts
//              every generated file from the fixture and the recordings: the four flags name the
//              parts of one derivation and each writes all of it (no browser)
//   --check    derives every generated file in memory and compares it with the tree byte for byte,
//              checks every file under public/home against assets.json (bytes, sha256, decoded
//              pixels) and every panel screen against its slots; exit 1 names the first difference
//              (no browser, runs in every gate)
//
// What the derivation writes (docs/LANDING.md 6.1 "Generated"; integrator.md 4.2):
//   apps/studio/home-deck/assets/field-{light,dark}.png   slide 7's opener field (B's openerTone)
//   apps/studio/src/components/home/deck.generated.ts       the client safe facts of the page deck
//   apps/studio/src/components/home/slides.generated.ts     the first screen's ten instances and stills
//   apps/studio/src/components/home/bands.generated.ts      every instance below the first screen
//   apps/studio/src/components/home/run.generated.ts        the recorded run, formatted for the panel
//   apps/studio/src/components/home/boot.generated.ts       the boot script and the visit gap tables
//   apps/studio/src/components/home/assets.json, assets.ts  every file under public/home
//   apps/studio/src/components/home/facts-data.ts           the counts the parts table prints
//   apps/studio/public/home/*                               the content hashed stills and exports
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
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as prettier from 'prettier';
import sharp from 'sharp';

import { renderSlide } from '../packages/render/src/slide.ts';
import { GT_BAND, renderStage } from '../packages/render/src/stage.ts';
import { bayer8 } from '../packages/effects/src/bayer.ts';
import { slideTitle } from '../packages/schema/src/deck.ts';
import { SPRITE } from '../packages/theme/src/sprite.ts';
import type { Deck, Slide } from '../packages/schema/src/deck.ts';
import {
  DEFAULT_MENU_CONTEXT,
  itemById,
  itemPath,
  visibleMenus,
} from '../packages/chrome/src/menus/model.ts';
import { shortcutLabel } from '../packages/chrome/src/menus/keys.ts';
import type { Shortcut } from '../packages/chrome/src/menus/keys.ts';
import { TAILOR } from '../packages/chrome/src/panels/assist-strings.ts';
import { layoutEntry } from '../packages/schema/src/layouts.ts';
import {
  BANNER_INDENT,
  PANEL_WIDTHS,
  formatLines,
  formatScreen,
  splitWords,
  REQUEST_ONLY,
  cliStepLines,
  httpStepLines,
  mcpStepLines,
  substituteAnswer,
  substituteName,
} from '../apps/studio/src/components/home/panel-format.ts';
import type { PanelWidth } from '../apps/studio/src/components/home/panel-format.ts';
/* the lanes' build modules (docs/LANDING.md 6.1, 6.4): V3's chips and loop, V4's boot script and
   slide 8's still frame; the entry calls them and writes what they return */
import { deriveChips, recordChips } from './home/run.ts';
import { deriveLoupe, writeExportMark } from './home/export.ts';
import { deriveBoot } from './home/boot.ts';
import { deriveMenus } from './home/menus.ts';
import { derivePattern } from './home/pattern.ts';
import { iconMaskRules, maskUri } from './home/icons.ts';
import { deriveEditorChrome, firstScreenIcons } from './home/chrome.ts';
import { deriveMenuGlyphsModule, deriveSprite, deriveSpriteModule } from './home/sprite.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = 'apps/studio/home-deck';
const RECORDED = `${FIXTURE}/recorded`;
const HOME = 'apps/studio/src/components/home';
const PUBLIC_DIR = 'apps/studio/public/home';
const URL_PREFIX = '/home';
const CLI = 'apps/cli/bin/turboslide.mjs';
const FACTS_PATH = 'packages/theme/brand/facts.json';
const MARK_PATH = 'packages/theme/brand/mark.svg';
const CLI_JSON = 'packages/agent/generated/cli.json';
const MCP_JSON = 'packages/agent/generated/mcp-tools.json';
const OPENAPI_JSON = 'packages/agent/generated/openapi.json';
const BOOT_SOURCE = `${HOME}/boot.ts`;

/** The customer the fixture spells and the name the build tailors with (docs/LANDING.md 2.5). */
const CUSTOMER = 'Northwind';
const TAILOR_TO = 'Globex';
/** A name the deck never spells, for the typed form's "not found" recording. */
const ABSENT_NAME = 'Initech';
/** The author the CLI records for every write of the run (Version history names Agent). */
const RUN_AUTHOR = 'agent:landing';

/** The page deck's nine slides in their order at rest (docs/LANDING.md 2.0 "The page deck"). */
const PAGE_ORDER = [
  'title',
  'plan',
  'gets',
  'ships',
  'next-steps',
  'lighthouse',
  'field',
  'pattern',
  'close',
] as const;

type SlideId = (typeof PAGE_ORDER)[number];

/**
 * The first screen's ten instances, inlined in the document (docs/LANDING.md 2.0, 2.2): the hero
 * frame's slide 1 and its filmstrip's nine thumbnails, every one with the renderer's block
 * attributes, so any slide the frame shows can be selected and the show and the print can clone
 * every slide from the page.
 */
const INSTANCES: readonly (readonly [string, SlideId])[] = [
  ['hero', 'title'],
  ...PAGE_ORDER.map((id) => [`hero-thumb-${id}`, id] as const),
];

/** The bands below the first screen whose markup the build fills (bands.generated.ts). */
type FillBand =
  'canvas' | 'tailor' | 'agents' | 'people' | 'present' | 'export' | 'patterns' | 'close';

/**
 * Below the first screen, each band's instances by its `data-fill` key (docs/LANDING.md 2.0, 4.2):
 * they travel in the band's chunk (`bands.generated.ts`), never in the document.
 */
const BAND_INSTANCES: Readonly<Record<FillBand, readonly (readonly [string, SlideId])[]>> = {
  canvas: [['canvas', 'lighthouse']],
  tailor: [
    ['tailor-stage', 'plan'],
    ['tailor-thumb-title', 'title'],
    ['tailor-thumb-plan', 'plan'],
    ['tailor-thumb-gets', 'gets'],
    ['tailor-thumb-ships', 'ships'],
    ['tailor-thumb-next-steps', 'next-steps'],
  ],
  agents: [['agents', 'next-steps']],
  /* the two people's screens: slides 2 and 3 at rest on each (v4.md, 11:45) */
  people: [
    ['people-maya-plan', 'plan'],
    ['people-maya-gets', 'gets'],
    ['people-sam-plan', 'plan'],
    ['people-sam-gets', 'gets'],
  ],
  present: [['present', 'gets']],
  export: [],
  /* slide 8 twice: the moving pattern's slide and the still frame's (v4.md Q6) */
  patterns: [
    ['patterns-moving', 'pattern'],
    ['patterns-still', 'pattern'],
  ],
  close: [['close', 'close']],
};
type RunState = 'absent' | 'placeholders' | 'titled' | 'filled';
const STATES: readonly RunState[] = ['absent', 'placeholders', 'titled', 'filled'];

// ---------------------------------------------------------------------------------------------
// Small helpers

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fail(message: string): never {
  console.error(`build-home-assets: ${message}`);
  process.exit(1);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as T;
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Every file under a folder, relative, in path order. */
function filesUnder(dir: string, skip: (rel: string) => boolean = () => false): string[] {
  const out: string[] = [];
  const walk = (at: string): void => {
    for (const name of readdirSync(resolve(ROOT, at)).sort()) {
      if (name.startsWith('.')) continue;
      const rel = `${at}/${name}`;
      if (skip(rel)) continue;
      if (statSync(resolve(ROOT, rel)).isDirectory()) walk(rel);
      else out.push(rel);
    }
  };
  walk(dir);
  return out;
}

/** The fixture's files: deck.json, the slides and the assets (the recordings are not the fixture). */
function fixtureFiles(): string[] {
  return filesUnder(FIXTURE, (rel) => rel.startsWith(`${RECORDED}`));
}

/** sha256 over the fixture, every file as its path, a NUL, its bytes and a NUL, in path order. */
function fixtureSha256(): string {
  const hash = createHash('sha256');
  for (const rel of fixtureFiles()) {
    hash.update(relative(FIXTURE, rel));
    hash.update('\0');
    hash.update(readFileSync(resolve(ROOT, rel)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

// ---------------------------------------------------------------------------------------------
// The CLI

type CliAnswer = {
  /** the arguments after `turboslide`, as the CLI received them */
  argv: string[];
  code: number;
  /** stdout's lines, trailing blanks removed */
  stdout: string[];
  /** stderr's lines, trailing blanks removed */
  stderr: string[];
};

function lines(text: string): string[] {
  const out = text.replace(/\r/g, '').split('\n');
  while (out.length > 0 && out[out.length - 1]?.trim() === '') out.pop();
  return out;
}

function cli(
  cwd: string,
  argv: string[],
  options: { checkoutLine?: boolean; paths?: boolean } = {},
): CliAnswer {
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
  /* the banner's fourth line names the checkout on the build machine: its fact is left out */
  if (options.checkoutLine === true)
    answer.stdout = answer.stdout.map((line) =>
      / checkout \//.test(line) ? line.slice(0, line.indexOf(' checkout ')).trimEnd() : line,
    );
  /* no recorded answer may carry the build machine's folders (an export's answer is not recorded) */
  if (options.paths !== true)
    for (const line of [...answer.stdout, ...answer.stderr])
      if (line.includes(cwd) || line.includes(tmpdir()) || line.includes(ROOT))
        fail(`turboslide ${argv.join(' ')} printed a local path: ${line}`);
  return answer;
}

/** The answer a person reads: stdout, or stderr when the CLI refused. */
function humanOf(answer: CliAnswer): string[] {
  return answer.code === 0 ? answer.stdout : [...answer.stdout, ...answer.stderr];
}

// ---------------------------------------------------------------------------------------------
// The run (docs/LANDING.md 2.4 "The run")

/** The three rows of step 3, one to a line inside the single quotes, which JSON allows. */
const STEP3_ROWS = [
  { key: 'Monday', value: `${CUSTOMER} sellers get the deck` },
  { key: 'Wednesday', value: 'Agents draft slides over MCP' },
  { key: 'Friday', value: 'The first call uses this deck' },
];
const STEP3_VALUE = `[\n${STEP3_ROWS.map((row) => `{"key": ${JSON.stringify(row.key)}, "value": ${JSON.stringify(row.value)}}`).join(',\n')}\n]`;
const STEP2_TITLE = `Next steps with ${CUSTOMER}`;

/** The three commands as argv, then as the panel prints them (the quotes a shell needs). */
const STEPS = [
  {
    n: 1 as const,
    action: 'slide.new' as const,
    argv: ['slide', 'new', '--layout', 'rows', '--after', 'ships', '--id', 'next-steps'],
    command: 'turboslide slide new --layout rows --after ships --id next-steps',
    /** the command up to its value types at 24 ms; step 1 has no value */
    typed: 'turboslide slide new --layout rows --after ships --id next-steps',
  },
  {
    n: 2 as const,
    action: 'block.set' as const,
    argv: ['block', 'set', 'next-steps#h', '/text', STEP2_TITLE],
    command: `turboslide block set next-steps#h /text "${STEP2_TITLE}"`,
    typed: `turboslide block set next-steps#h /text "${STEP2_TITLE}"`,
  },
  {
    n: 3 as const,
    action: 'block.set' as const,
    argv: ['block', 'set', 'next-steps#rows', '/items', STEP3_VALUE],
    command: `turboslide block set next-steps#rows /items '${STEP3_VALUE}'`,
    typed: 'turboslide block set next-steps#rows /items ',
  },
];

/** The typed line's other forms (docs/LANDING.md 2.4: tailor and version list). */
const TAILOR_FOUND = ['tailor', `--replace=${CUSTOMER}=${TAILOR_TO}`];
const TAILOR_ABSENT = ['tailor', `--replace=${ABSENT_NAME}=${TAILOR_TO}`];
/** The form LANDING.md 2.4 wrote, which this CLI refuses (its flag parser takes --replace=<value> alone). */
const TAILOR_SPACED = ['tailor', '--replace', `${CUSTOMER}=${TAILOR_TO}`];
const VERSION_LIST = ['version', 'list'];

/** The canvas band's gesture forms (docs/LANDING.md 2.6), run against the page deck. */
const GESTURE_POS = { x: 612, y: 388, w: 520, h: 96 };
const GESTURES = [
  ['slide', 'to-canvas', 'lighthouse'],
  ['block', 'set', 'lighthouse#h', '/pos', JSON.stringify(GESTURE_POS)],
  ['block', 'rotate', 'lighthouse#h', '--to', '15'],
];
/** Every slide's blocks as the CLI measures them: their boxes at rest (one headless page). */
const MEASURE = ['slide', 'to-canvas', PAGE_ORDER.join(',')];

type RecordedTyped = {
  form: 'tailor' | 'tailor-spaced' | 'version-list' | 'step';
  state: RunState;
  nameFound: boolean | null;
  step: 1 | 2 | 3 | null;
  answer: CliAnswer;
  names: { from: string; to: string } | null;
};

type RecordedRun = {
  generator: string;
  fixtureSha256: string;
  versionAnswer: CliAnswer;
  steps: { n: 1 | 2 | 3; answer: CliAnswer; revisionBefore: number; revisionAfter: number }[];
  typed: RecordedTyped[];
  gestures: CliAnswer[];
  tailor: { start: CliAnswer; rest: CliAnswer };
};

function deckRevision(dir: string): number {
  const deck = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as { revision?: number };
  return deck.revision ?? 0;
}

function copyDeck(from: string, to: string): void {
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, {
    recursive: true,
    filter: (src) => !src.includes(`${'/'}recorded`) && !src.endsWith('/.turboslide'),
  });
}

function runMode(): void {
  const work = mkdtempSync(join(tmpdir(), 'turboslide-home-run-'));
  try {
    const deck = join(work, 'deck');
    copyDeck(resolve(ROOT, FIXTURE), deck);
    rmSync(join(deck, 'recorded'), { recursive: true, force: true });
    const versionAnswer = cli(deck, ['--version'], { checkoutLine: true });
    if (versionAnswer.code !== 0) fail('turboslide --version failed');
    const states = new Map<RunState, string>();
    const snapshot = (state: RunState): void => {
      const at = join(work, `state-${state}`);
      copyDeck(deck, at);
      states.set(state, at);
    };
    snapshot('absent');
    const steps: RecordedRun['steps'] = [];
    for (const step of STEPS) {
      const before = deckRevision(deck);
      const answer = cli(deck, step.argv);
      if (answer.code !== 0)
        fail(`the CLI refused step ${step.n} (${step.command}): ${humanOf(answer).join(' | ')}`);
      steps.push({ n: step.n, answer, revisionBefore: before, revisionAfter: deckRevision(deck) });
      snapshot(STATES[step.n] as RunState);
    }
    /* the typed forms, each on a fresh copy of its state */
    const typed: RecordedTyped[] = [];
    const scratch = join(work, 'typed');
    for (const state of STATES) {
      const at = states.get(state) as string;
      const once = (argv: string[]): CliAnswer => {
        copyDeck(at, scratch);
        return cli(scratch, argv);
      };
      typed.push({
        form: 'tailor',
        state,
        nameFound: true,
        step: null,
        answer: once(TAILOR_FOUND),
        names: { from: CUSTOMER, to: TAILOR_TO },
      });
      typed.push({
        form: 'tailor',
        state,
        nameFound: false,
        step: null,
        answer: once(TAILOR_ABSENT),
        names: { from: ABSENT_NAME, to: TAILOR_TO },
      });
      typed.push({
        form: 'version-list',
        state,
        nameFound: null,
        step: null,
        answer: once(VERSION_LIST),
        names: null,
      });
      for (const step of STEPS)
        typed.push({
          form: 'step',
          state,
          nameFound: null,
          step: step.n,
          answer: once(step.argv),
          names: step.n === 1 ? null : { from: CUSTOMER, to: CUSTOMER },
        });
    }
    copyDeck(states.get('absent') as string, scratch);
    typed.push({
      form: 'tailor-spaced',
      state: 'absent',
      nameFound: true,
      step: null,
      answer: cli(scratch, TAILOR_SPACED),
      names: { from: CUSTOMER, to: TAILOR_TO },
    });
    /* the gesture forms on the page deck */
    const gestures: CliAnswer[] = [];
    copyDeck(deck, scratch);
    for (const argv of GESTURES) {
      const answer = cli(scratch, argv);
      if (answer.code !== 0)
        fail(`the CLI refused the gesture form ${argv.join(' ')}: ${humanOf(answer).join(' | ')}`);
      gestures.push(answer);
    }
    const canvasSlide = readFileSync(join(scratch, 'slides', 'lighthouse.json'), 'utf8');
    /* every block's box at rest: the CLI's measurer on a copy, so the page deck keeps its layout */
    copyDeck(deck, scratch);
    const measuring = cli(scratch, MEASURE);
    if (measuring.code !== 0)
      fail(`the CLI refused ${MEASURE.join(' ')}: ${humanOf(measuring).join(' | ')}`);
    const measured = Object.fromEntries(
      PAGE_ORDER.map((id) => {
        const slide = JSON.parse(readFileSync(join(scratch, 'slides', `${id}.json`), 'utf8')) as {
          slots: { main: { id: string; type: string; pos: unknown; text?: string }[] };
        };
        return [
          id,
          slide.slots.main.map((b) => ({
            id: b.id,
            type: b.type,
            pos: b.pos,
            ...(b.text !== undefined ? { text: b.text } : {}),
          })),
        ];
      }),
    );
    /* the tailor counts on the fixture (eight slides) and the page deck (nine) */
    copyDeck(states.get('absent') as string, scratch);
    const start = cli(scratch, TAILOR_FOUND);
    copyDeck(deck, scratch);
    const rest = cli(scratch, TAILOR_FOUND);
    if (start.code !== 0 || rest.code !== 0) fail('the CLI refused the tailor form');
    /* write the recordings; the export's record stays (its page deck sha tells the check whether
       it was read from this run's deck) */
    const out = resolve(ROOT, RECORDED);
    const exportPath = join(out, 'export.json');
    const exportRecord = existsSync(exportPath) ? readFileSync(exportPath) : null;
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    if (exportRecord !== null) writeFileSync(exportPath, exportRecord);
    for (const state of ['placeholders', 'titled', 'filled'] as const)
      writeFileSync(
        join(out, `next-steps-${state}.json`),
        readFileSync(join(states.get(state) as string, 'slides', 'next-steps.json')),
      );
    writeFileSync(join(out, 'lighthouse-canvas.json'), canvasSlide);
    writeFileSync(join(out, 'measured.json'), jsonText(measured));
    writeFileSync(
      join(out, 'page-deck-sections.json'),
      jsonText(
        (JSON.parse(readFileSync(join(deck, 'deck.json'), 'utf8')) as { sections: unknown })
          .sections,
      ),
    );
    const recorded: RecordedRun = {
      generator: 'scripts/build-home-assets.ts --run',
      fixtureSha256: fixtureSha256(),
      versionAnswer,
      steps,
      typed,
      gestures,
      tailor: { start, rest },
    };
    writeFileSync(join(out, 'run.json'), jsonText(recorded));
    console.log(
      `build-home-assets --run: ${steps.length} steps, ${typed.length} typed forms, ${gestures.length} gestures recorded under ${RECORDED}`,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------------------------
// The served files (assets.json; integrator.md section 6)

type AssetRole =
  | 'lighthouse-still'
  | 'lighthouse-tone'
  | 'field-still'
  | 'pattern-still'
  | 'pattern-mask'
  | 'export-perfect'
  | 'export-editable'
  | 'export-browser'
  | 'pdf'
  | 'glyphs';
type AssetVariant = 'wide' | 'narrow' | null;
type ServedAsset = {
  role: AssetRole;
  appearance: 'light' | 'dark' | null;
  variant: AssetVariant;
  path: string;
  bytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  pixelsSha256: string | null;
  partSha256: string | null;
  pages: number | null;
};

/** The sha256 of a picture's decoded pixels (RGBA, row major). */
async function pixelsSha256(bytes: Uint8Array): Promise<string> {
  const { data } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return sha256(data);
}

function servedName(
  role: AssetRole,
  appearance: string | null,
  variant: AssetVariant,
  bytes: Uint8Array,
  ext: string,
): string {
  const parts = [role, appearance, variant].filter((p): p is string => p !== null);
  return `${parts.join('-')}-${sha256(bytes).slice(0, 10)}.${ext}`;
}

async function served(
  role: AssetRole,
  appearance: 'light' | 'dark' | null,
  variant: AssetVariant,
  bytes: Uint8Array,
  ext: string,
  extra: { partSha256?: string | null; pages?: number | null } = {},
): Promise<{ asset: ServedAsset; bytes: Uint8Array }> {
  const name = servedName(role, appearance, variant, bytes, ext);
  /* a PDF and the glyph sprite are no pictures: no size and no pixels */
  const picture = ext !== 'pdf' && ext !== 'svg';
  const meta = picture ? await sharp(bytes).metadata() : null;
  return {
    asset: {
      role,
      appearance,
      variant,
      path: `${URL_PREFIX}/${name}`,
      bytes: bytes.length,
      sha256: sha256(bytes),
      width: meta?.width ?? null,
      height: meta?.height ?? null,
      pixelsSha256: picture ? await pixelsSha256(bytes) : null,
      partSha256: extra.partSha256 ?? null,
      pages: extra.pages ?? null,
    },
    bytes,
  };
}

// ---------------------------------------------------------------------------------------------
// The export, continued: the served files are written straight under public/home and listed in
// home-deck/recorded/export.json, so the derivation (which has no browser) lists them as they are

type RecordedExport = {
  generator: string;
  fixtureSha256: string;
  pageDeckSha256: string;
  /** the served files, each with the part it was read from */
  assets: ServedAsset[];
  /** slide 7 of the Editable text file: its frames, pictures and hairlines, in sheet pixels */
  editable: {
    frames: ExportFrame[];
    pictures: { x: number; y: number; w: number; h: number; index: number }[];
    lines: { x: number; y: number; w: number; h: number; role: 'hair' | 'cross' }[];
    /** the filled rectangles: the plate and the paper chips under the wordmark and the counter */
    fills: { x: number; y: number; w: number; h: number }[];
  };
  /** the Perfect file's picture size, which the export band's row states */
  perfectSize: { width: number; height: number };
};
type ExportFrame = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** each paragraph's runs joined, the file's line breaks as newlines; sizes in sheet pixels */
  paragraphs: {
    text: string;
    size: number | null;
    tracking: number;
    lineHeight: number | null;
    muted: boolean;
  }[];
};

const EMU_PER_SHEET_PX = 7620;
/** hundredths of a point to sheet pixels: the 960 by 540 pt page is 1,600 by 900 sheet pixels */
const SZ_TO_PX = 1600 / 960 / 100;
const EXPORT_BUDGET = { perfect: 60_000, editable: 32_000 };

/** The page deck on disk: the fixture with the recorded slide 5 and sections. */
function writePageDeck(dir: string): void {
  copyDeck(resolve(ROOT, FIXTURE), dir);
  rmSync(join(dir, 'recorded'), { recursive: true, force: true });
  const deck = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as Record<string, unknown>;
  deck['sections'] = readJson(`${RECORDED}/page-deck-sections.json`);
  writeFileSync(join(dir, 'deck.json'), jsonText(deck));
  writeFileSync(
    join(dir, 'slides', 'next-steps.json'),
    readFileSync(resolve(ROOT, RECORDED, 'next-steps-filled.json')),
  );
}

type ZipFile = {
  async(kind: 'string'): Promise<string>;
  async(kind: 'uint8array'): Promise<Uint8Array>;
};
type JsZipLike = { file(name: string): ZipFile | null };

function loadJsZip(): { loadAsync(data: Uint8Array): Promise<JsZipLike> } {
  const require = createRequire(resolve(ROOT, 'packages/export/package.json'));
  return require('jszip') as { loadAsync(data: Uint8Array): Promise<JsZipLike> };
}

/** The relationship targets of a slide part, by id. */
async function slideRels(zip: JsZipLike, n: number): Promise<Map<string, string>> {
  const rels = (await zip.file(`ppt/slides/_rels/slide${n}.xml.rels`)?.async('string')) ?? '';
  const out = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = m[1] as string;
    const id = /\bId="([^"]+)"/.exec(attrs)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
    if (id !== undefined && target !== undefined) out.set(id, target.replace(/^\.\.\//, 'ppt/'));
  }
  return out;
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function xfrmOf(xml: string): { x: number; y: number; w: number; h: number } | null {
  const off = /<a:off x="(-?\d+)" y="(-?\d+)"\s*\/>/.exec(xml);
  const ext = /<a:ext cx="(\d+)" cy="(\d+)"\s*\/>/.exec(xml);
  if (off === null || ext === null) return null;
  const px = (emu: string): number => Math.round((Number(emu) / EMU_PER_SHEET_PX) * 100) / 100;
  return {
    x: px(off[1] as string),
    y: px(off[2] as string),
    w: px(ext[1] as string),
    h: px(ext[2] as string),
  };
}

/** The smaller of the part itself and lossless WebP of the same pixels (docs/LANDING.md 2.8). */
async function smallerOf(
  part: Uint8Array,
  partName: string,
): Promise<{ bytes: Uint8Array; ext: string }> {
  const webp = new Uint8Array(await sharp(part).webp({ lossless: true, effort: 6 }).toBuffer());
  const ext = partName.slice(partName.lastIndexOf('.') + 1).toLowerCase();
  if (webp.length < part.length) {
    if ((await pixelsSha256(webp)) !== (await pixelsSha256(part)))
      fail(`${partName}: the WebP decodes to other pixels`);
    return { bytes: webp, ext: 'webp' };
  }
  return { bytes: part, ext: ext === 'jpeg' ? 'jpg' : ext };
}

async function exportMode(): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), 'turboslide-home-export-'));
  try {
    const deckDir = join(work, 'deck');
    writePageDeck(deckDir);
    /* the footer logo the page draws on every slide, so the files draw one mark with the page */
    await writeExportMark(deckDir);
    const zipLib = loadJsZip();
    const assets: ServedAsset[] = [];
    const written: { name: string; bytes: Uint8Array }[] = [];
    let editable: RecordedExport['editable'] | null = null;
    let perfectSize = { width: 0, height: 0 };
    for (const theme of ['light', 'dark'] as const) {
      const files: Record<string, string> = {};
      const runs: [string, string[]][] = [
        [
          'flatten',
          [
            'export',
            'pptx',
            '--mode',
            'flatten',
            '--theme',
            theme,
            '--out',
            join(work, `flatten-${theme}`),
          ],
        ],
        [
          'native',
          [
            'export',
            'pptx',
            '--mode',
            'native',
            '--theme',
            theme,
            '--out',
            join(work, `native-${theme}`),
          ],
        ],
        ['pdf', ['export', 'pdf', '--appearance', theme, '--out', join(work, `pdf-${theme}`)]],
      ];
      for (const [kind, argv] of runs) {
        const answer = cli(deckDir, argv, { paths: true });
        if (answer.code !== 0)
          fail(
            `turboslide ${argv.join(' ')} exited ${answer.code}: ${humanOf(answer).slice(-6).join(' | ')}`,
          );
        const dir = argv[argv.length - 1] as string;
        const wanted = kind === 'pdf' ? '.pdf' : '.pptx';
        const found = readdirSync(dir).filter((f) => f.endsWith(wanted));
        if (found.length !== 1)
          fail(`turboslide ${argv.join(' ')} wrote ${found.join(', ') || 'nothing'} in ${dir}`);
        files[kind] = join(dir, found[0] as string);
      }
      /* the Perfect file: slide 7's one picture of the whole sheet; the footer logo the kit names
         is a second picture laid over its own drawing in that picture, at 3x, so the mark stays
         sharp (packages/export scene/kit-logos.ts), and no other picture is allowed */
      const flat = await zipLib.loadAsync(new Uint8Array(readFileSync(files['flatten'] as string)));
      const flatXml =
        (await flat.file('ppt/slides/slide7.xml')?.async('string')) ??
        fail('the Perfect file has no slide 7');
      const flatRels = await slideRels(flat, 7);
      const flatPics = [...flatXml.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>/g)].map((m) => ({
        name: /<p:cNvPr [^>]*name="([^"]*)"/.exec(m[1] as string)?.[1] ?? '',
        embed: /<a:blip r:embed="([^"]+)"/.exec(m[1] as string)?.[1] ?? '',
      }));
      const sheets = flatPics.filter((pic) => pic.name.endsWith('#sheet'));
      const others = flatPics.filter((pic) => !pic.name.endsWith('#sheet'));
      if (sheets.length !== 1 || others.some((pic) => !/#footer-logo:\d+$/.test(pic.name)))
        fail(
          `slide 7 of the Perfect file holds ${flatPics.map((pic) => pic.name).join(', ')}, not one sheet picture and the footer logo`,
        );
      const perfectPart =
        flatRels.get(sheets[0]?.embed ?? '') ?? fail('the Perfect picture has no relationship');
      const perfectBytes =
        (await flat.file(perfectPart)?.async('uint8array')) ?? fail(`${perfectPart} is missing`);
      const perfectMeta = await sharp(perfectBytes).metadata();
      perfectSize = { width: perfectMeta.width ?? 0, height: perfectMeta.height ?? 0 };
      const perfectServed = await smallerOf(perfectBytes, perfectPart);
      if (perfectServed.bytes.length > EXPORT_BUDGET.perfect)
        fail(
          `the Perfect picture (${theme}) is ${perfectServed.bytes.length} B, over ${EXPORT_BUDGET.perfect}`,
        );
      const perfect = await served(
        'export-perfect',
        theme,
        null,
        perfectServed.bytes,
        perfectServed.ext,
        {
          partSha256: sha256(perfectBytes),
        },
      );
      if (perfect.asset.pixelsSha256 !== (await pixelsSha256(perfectBytes)))
        fail('the served Perfect picture decodes to other pixels than its part');
      assets.push(perfect.asset);
      written.push({ name: perfect.asset.path.slice(URL_PREFIX.length + 1), bytes: perfect.bytes });
      /* the Editable text file: slide 7's frames, pictures and lines */
      const native = await zipLib.loadAsync(
        new Uint8Array(readFileSync(files['native'] as string)),
      );
      const nativeXml =
        (await native.file('ppt/slides/slide7.xml')?.async('string')) ??
        fail('the Editable text file has no slide 7');
      const nativeRels = await slideRels(native, 7);
      const frames: ExportFrame[] = [];
      const lines: RecordedExport['editable']['lines'] = [];
      const fills: RecordedExport['editable']['fills'] = [];
      for (const sp of nativeXml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)) {
        const body = sp[1] as string;
        /* a hidden shape (the outline's title placeholder) draws nothing */
        if (/<p:cNvPr [^>]*hidden="1"/.test(body)) continue;
        const box = xfrmOf(body);
        if (box === null) continue;
        const txBody = /<p:txBody>([\s\S]*?)<\/p:txBody>/.exec(body)?.[1];
        if (txBody === undefined) {
          if (/prst="line"/.test(body)) {
            const alpha = Number(/<a:alpha val="(\d+)"/.exec(body)?.[1] ?? '100000');
            lines.push({ ...box, role: alpha >= 30000 ? 'cross' : 'hair' });
          } else if (/<a:solidFill>/.test(body.split('<a:ln')[0] ?? '')) fills.push(box);
          continue;
        }
        const paragraphs = [...txBody.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((p) => {
          const xml = p[1] as string;
          /* the runs in order, a line break as a newline (the file's own breaks) */
          const text = [...xml.matchAll(/<a:r>([\s\S]*?)<\/a:r>|<a:br\s*\/>/g)]
            .map((m) =>
              m[1] === undefined ? '\n' : decodeXml(/<a:t>([\s\S]*?)<\/a:t>/.exec(m[1])?.[1] ?? ''),
            )
            .join('');
          const firstRun = /<a:r>([\s\S]*?)<\/a:r>/.exec(xml)?.[1] ?? '';
          const sz = /\bsz="(\d+)"/.exec(firstRun)?.[1];
          const spc = /\bspc="(-?\d+)"/.exec(firstRun)?.[1];
          const lnSpc = /<a:spcPts val="(\d+)"/.exec(xml)?.[1];
          const color =
            /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(firstRun)?.[1]?.toUpperCase() ?? '';
          return {
            text,
            size: sz === undefined ? null : round2(Number(sz) * SZ_TO_PX),
            tracking: spc === undefined ? 0 : round2(Number(spc) * SZ_TO_PX),
            lineHeight: lnSpc === undefined ? null : round2(Number(lnSpc) * SZ_TO_PX),
            muted: color === '8A8F98',
          };
        });
        if (paragraphs.every((p) => p.text === '')) continue;
        frames.push({ ...box, paragraphs });
      }
      /* the pictures: the slide's background picture first, then each p:pic at its box */
      const parts: { box: { x: number; y: number; w: number; h: number }; embed: string }[] = [];
      const bg = /<p:bg>[\s\S]*?r:embed="([^"]+)"[\s\S]*?<\/p:bg>/.exec(nativeXml)?.[1];
      if (bg !== undefined) parts.push({ box: { x: 0, y: 0, w: 1600, h: 900 }, embed: bg });
      for (const pic of nativeXml.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>/g)) {
        const body = pic[1] as string;
        const box = xfrmOf(body);
        const embed = /r:embed="([^"]+)"/.exec(body)?.[1];
        if (box !== null && embed !== undefined) parts.push({ box, embed });
      }
      const pictures: RecordedExport['editable']['pictures'] = [];
      for (const { box, embed } of parts) {
        const part = nativeRels.get(embed) ?? fail(`${embed} has no relationship`);
        const bytes = (await native.file(part)?.async('uint8array')) ?? fail(`${part} is missing`);
        const smaller = await smallerOf(bytes, part);
        if (smaller.bytes.length > EXPORT_BUDGET.editable)
          fail(
            `the Editable text picture ${part} (${theme}) is ${smaller.bytes.length} B, over ${EXPORT_BUDGET.editable}`,
          );
        const one = await served('export-editable', theme, null, smaller.bytes, smaller.ext, {
          partSha256: sha256(bytes),
        });
        assets.push(one.asset);
        written.push({ name: one.asset.path.slice(URL_PREFIX.length + 1), bytes: one.bytes });
        pictures.push({ ...box, index: pictures.length });
      }
      if (theme === 'light') editable = { frames, pictures, lines, fills };
      else if (editable !== null && JSON.stringify(editable.frames) !== JSON.stringify(frames))
        fail(
          'slide 7 of the Editable text file places its text frames differently in the two appearances',
        );
      /* the PDF */
      const pdfBytes = new Uint8Array(readFileSync(files['pdf'] as string));
      const pages = (
        new TextDecoder('latin1').decode(pdfBytes).match(/\/Type\s*\/Page(?![s\w])/g) ?? []
      ).length;
      if (pages !== PAGE_ORDER.length)
        fail(`the PDF (${theme}) has ${pages} pages, not ${PAGE_ORDER.length}`);
      const pdf = await served('pdf', theme, null, pdfBytes, 'pdf', { pages });
      assets.push(pdf.asset);
      written.push({ name: pdf.asset.path.slice(URL_PREFIX.length + 1), bytes: pdf.bytes });
    }
    if (editable === null) fail('no Editable text file was read');
    /* replace the previous export's files */
    const dir = resolve(ROOT, PUBLIC_DIR);
    mkdirSync(dir, { recursive: true });
    for (const name of readdirSync(dir))
      if (/^(export-perfect|export-editable|pdf)-/.test(name)) rmSync(join(dir, name));
    for (const file of written) writeFileSync(join(dir, file.name), file.bytes);
    const recorded: RecordedExport = {
      generator: 'scripts/build-home-assets.ts --export',
      fixtureSha256: fixtureSha256(),
      pageDeckSha256: pageDeckSha256(),
      assets,
      editable,
      perfectSize,
    };
    writeFileSync(resolve(ROOT, RECORDED, 'export.json'), jsonText(recorded));
    console.log(
      `build-home-assets --export: ${assets.length} files from the Perfect, Editable text and PDF exports of both appearances under ${PUBLIC_DIR}`,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** sha256 over the page deck: the fixture's sha, the run's sections and its slide 5. */
function pageDeckSha256(): string {
  const hash = createHash('sha256');
  hash.update(fixtureSha256());
  hash.update('\0');
  hash.update(readFileSync(resolve(ROOT, RECORDED, 'page-deck-sections.json')));
  hash.update('\0');
  hash.update(readFileSync(resolve(ROOT, RECORDED, 'next-steps-filled.json')));
  return hash.digest('hex');
}

// ---------------------------------------------------------------------------------------------
// The stills (docs/LANDING.md 2.2, 2.3, 2.6; integrator.md 2.2 and 6). A still is the 1 bit grid
// of its cells, one pixel per cell, ink opaque and paper transparent, drawn as a CSS mask over a
// box filled with the sheet's --ink with `image-rendering: pixelated`, so one still serves both
// appearances and every kit. The deck's own twins (decks/gt-brand/assets/mood-*-{light,dark}.jpg)
// are pixel inverses of each other, so the cells drawn in --ink are the same cells in both
// appearances; the page keeps that rule for every dithered picture.

type Bits = { cols: number; rows: number; bits: Uint8Array };
type Box = { x: number; y: number; w: number; h: number };

const SHEET = { w: 1600, h: 900 };
/** the cell grids: 2 px cells at the 1,024 px sheet and the 358 px sheet */
const GRID = { wide: { cols: 512, rows: 288 }, narrow: { cols: 179, rows: 100 } } as const;
const GRID_SIZE = (grid: { cols: number; rows: number }): { width: number; height: number } => ({
  width: grid.cols,
  height: grid.rows,
});

/**
 * The hero frame's slide (docs/LANDING.md 2.2): 540 by 304 px at 1,024 px and over, 326 by 183
 * under 720 px, printed at the deck's 2 px cell.
 */
const FRAME_GRID = { wide: { cols: 270, rows: 152 }, narrow: { cols: 163, rows: 92 } } as const;
/** The Blue Marble's disc on slide 1 (integrator.md 2.2): the planet's northern limb in the lower right. */
const HERO_DISC = { cx: 1450, cy: 1180, r: 600 };
/** One block as the CLI's `slide to-canvas` measured it on the page deck at rest (--run). */
type MeasuredBlock = {
  id: string;
  type: string;
  pos: { x: number; y: number; w: number; h: number; rotate?: number };
  text?: string;
};

function measuredBlocks(slide: SlideId): MeasuredBlock[] {
  const all = readJson<Record<string, MeasuredBlock[]>>(`${RECORDED}/measured.json`);
  return all[slide] ?? fail(`${RECORDED}/measured.json has no slide ${slide}`);
}

/** A selectable object of the page deck: the block the renderer marks, its chip word and its box. */
type SlideObject = {
  block: string;
  id: string;
  role: string;
  box: Box;
  text: string;
  editable: boolean;
};

/**
 * Every text, rows and plate block of a slide as an object (docs/LANDING.md 2.5, 2.6; v2.md R1):
 * slide 1's heading and lead are its Title and Subtitle, a mood slide's plate its Plate.
 */
function slideObjects(slide: SlideId): SlideObject[] {
  const role = (b: MeasuredBlock): string | null => {
    if (slide === 'title')
      return b.id === 'heading' ? 'Title' : b.id === 'lead' ? 'Subtitle' : null;
    if (b.id === 'plate' && b.type === 'box') return 'Plate';
    if (b.type === 'heading') return 'Heading';
    if (b.type === 'paragraph') return 'Text';
    if (b.type === 'credit') return 'Credit';
    if (b.type === 'rows') return 'Rows';
    return null;
  };
  return measuredBlocks(slide).flatMap((b) => {
    const word = role(b);
    if (word === null) return [];
    return [
      {
        block: b.id,
        id: `${slide}#${b.id}`,
        role: word,
        box: { x: round2(b.pos.x), y: round2(b.pos.y), w: round2(b.pos.w), h: round2(b.pos.h) },
        text: b.text ?? '',
        editable: word !== 'Plate' && word !== 'Rows',
      },
    ];
  });
}

/** Slide 1's title and subtitle in sheet units, as measured. */
function titleBoxes(): { heading: Box; lead: Box } {
  const objects = slideObjects('title');
  const box = (block: string): Box =>
    objects.find((o) => o.block === block)?.box ?? fail(`slide 1 has no measured ${block}`);
  return { heading: box('heading'), lead: box('lead') };
}
/** the bottom margin's chips: the mark, the credit and the counter (stage.css, block-css.ts .ts-chips) */
const HERO_CHIPS = [
  { x: 66, y: 858, w: 40, h: 30 },
  { x: 126, y: 856, w: 352, h: 30 },
  { x: 1474, y: 856, w: 60, h: 28 },
];
const CLEAR = 24;
/** the canvas print's ink curve (deriveStills) */
const LIGHTHOUSE_GAMMA = 1;

function grow(box: Box, by: number): Box {
  return { x: box.x - by, y: box.y - by, w: box.w + 2 * by, h: box.h + 2 * by };
}

function inBox(box: Box, x: number, y: number): boolean {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

/** A tone source: a function from sheet units to a tone in 0 to 1 (1 inks every cell). */
type Tone = (x: number, y: number) => number;

/** Ordered dither of a tone over a cell grid of the sheet; cells inside a clear zone stay paper. */
function ditherSheet(
  cols: number,
  rows: number,
  tone: Tone,
  zones: readonly Box[] = [],
  extent = SHEET,
): Bits {
  const bits = new Uint8Array(cols * rows);
  const cw = extent.w / cols;
  const ch = extent.h / rows;
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < cols; c += 1) {
      const x = (c + 0.5) * cw;
      const y = (r + 0.5) * ch;
      if (zones.some((z) => inBox(z, x, y))) continue;
      if (tone(x, y) > (bayer8(r, c) + 0.5) / 64) bits[r * cols + c] = 1;
    }
  return { cols, rows, bits };
}

/** A 1 bit grid as a PNG, ink opaque and paper transparent. */
async function bitsPng(grid: Bits): Promise<Uint8Array> {
  const rgba = Buffer.alloc(grid.cols * grid.rows * 4);
  for (let i = 0; i < grid.bits.length; i += 1) if (grid.bits[i]) rgba[i * 4 + 3] = 255;
  return new Uint8Array(
    await sharp(rgba, { raw: { width: grid.cols, height: grid.rows, channels: 4 } })
      .png({ palette: true, colours: 2, compressionLevel: 9, effort: 10 })
      .toBuffer(),
  );
}

async function bitsWebp(grid: Bits): Promise<Uint8Array> {
  const rgba = Buffer.alloc(grid.cols * grid.rows * 4);
  for (let i = 0; i < grid.bits.length; i += 1) if (grid.bits[i]) rgba[i * 4 + 3] = 255;
  return new Uint8Array(
    await sharp(rgba, { raw: { width: grid.cols, height: grid.rows, channels: 4 } })
      .webp({ lossless: true, effort: 6 })
      .toBuffer(),
  );
}

/** A grey picture as a tone sampler over the sheet (bilinear), ink = 1 - luminance. */
type Gray = { width: number; height: number; data: Uint8Array };
async function grayOf(
  path: string,
  blur: number,
  size?: { width: number; height: number },
): Promise<Gray> {
  let pipeline = sharp(resolve(ROOT, path)).greyscale();
  if (size !== undefined)
    pipeline = pipeline.resize(size.width, size.height, { fit: 'fill', kernel: 'mitchell' });
  if (blur > 0) pipeline = pipeline.blur(blur);
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

function sampleInk(gray: Gray, x: number, y: number): number {
  const fx = Math.min(Math.max(x - 0.5, 0), gray.width - 1);
  const fy = Math.min(Math.max(y - 0.5, 0), gray.height - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, gray.width - 1);
  const y1 = Math.min(y0 + 1, gray.height - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (xx: number, yy: number): number => (gray.data[yy * gray.width + xx] ?? 255) / 255;
  const l =
    at(x0, y0) * (1 - tx) * (1 - ty) +
    at(x1, y0) * tx * (1 - ty) +
    at(x0, y1) * (1 - tx) * ty +
    at(x1, y1) * tx * ty;
  return 1 - l;
}

/** The source disc of the light Blue Marble file, found from its own ink (left limb, top, bottom). */
function sourceDisc(gray: Gray): { cx: number; cy: number; r: number } {
  let minx = Infinity;
  let miny = Infinity;
  let maxy = -Infinity;
  for (let y = 0; y < gray.height; y += 1)
    for (let x = 0; x < gray.width; x += 1)
      if ((gray.data[y * gray.width + x] ?? 255) < 128) {
        if (x < minx) minx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
  const r = (maxy - miny + 1) / 2;
  return { cx: minx + r, cy: miny + r, r };
}

/** B's openerTone without its noise term (direction-b/landing.js 412 to 432), in sheet units. */
function openerTone(x: number, y: number): number {
  const ax = (x / SHEET.w) * 16;
  const ay = (y / SHEET.h) * 9;
  const dx = ax - 13.4;
  const dy = ay - 11.6;
  const d = Math.sqrt(dx * dx + dy * dy) - 8.6;
  if (d < 0) {
    const lit = Math.min(Math.max((-dx * 0.62 - dy * 0.78) / 8.6, 0), 1);
    return 0.06 + 0.78 * Math.exp(d * 0.85) * (0.3 + 0.7 * lit);
  }
  return 0.3 * Math.exp(-d * 4.5);
}

/** The thumbnails' grid in the hero frame's filmstrip (56 by 31.5 px, 64 by 36 under 720 px). */
const MINI_GRID = { cols: 32, rows: 18 } as const;

type Stills = {
  hero: { wide: Bits; narrow: Bits };
  canvas: { wide: Bits; narrow: Bits };
  field: Bits;
  /** the hero frame's filmstrip: each picture slide's print at the thumbnails' grid, inlined */
  mini: { hero: Bits; canvas: Bits; field: Bits; pattern: Bits };
  /** the opener field's picture, the fixture's slide 7 asset (1600 by 900, 2 px cells) */
  fieldPicture: { light: Uint8Array; dark: Uint8Array };
  canvasTone: Uint8Array;
};

/** Slide 7's picture in the fixture: the opener field at 800 by 450 cells of 2 px, both appearances. */
async function fieldPictures(): Promise<{ light: Uint8Array; dark: Uint8Array }> {
  const cells = ditherSheet(800, 450, openerTone);
  const picture = async (
    ink: [number, number, number],
    paper: [number, number, number],
  ): Promise<Uint8Array> => {
    const rgb = Buffer.alloc(1600 * 900 * 3);
    for (let y = 0; y < 900; y += 1)
      for (let x = 0; x < 1600; x += 1) {
        const on = cells.bits[(y >> 1) * 800 + (x >> 1)] === 1;
        const c = on ? ink : paper;
        rgb.set(c, (y * 1600 + x) * 3);
      }
    return new Uint8Array(
      await sharp(rgb, { raw: { width: 1600, height: 900, channels: 3 } })
        .png({ palette: true, colours: 2, compressionLevel: 9, effort: 10 })
        .toBuffer(),
    );
  };
  return {
    light: await picture([7, 7, 7], [255, 255, 255]),
    dark: await picture([242, 242, 240], [7, 7, 7]),
  };
}

async function deriveStills(): Promise<Stills> {
  /* the hero: the Blue Marble from the light file, blurred back to tone (A's method) */
  const earth = await grayOf(`${FIXTURE}/assets/mood-earth-light.jpg`, 1.6);
  const earthInk = await grayOf(`${FIXTURE}/assets/mood-earth-light.jpg`, 0);
  const src = sourceDisc(earthInk);
  const heroTone: Tone = (x, y) => {
    const dx = (x - HERO_DISC.cx) / HERO_DISC.r;
    const dy = (y - HERO_DISC.cy) / HERO_DISC.r;
    if (dx * dx + dy * dy > 1) return 0;
    return sampleInk(earth, src.cx + dx * src.r, src.cy + dy * src.r);
  };
  const boxes = titleBoxes();
  const zones = [grow(boxes.heading, CLEAR), grow(boxes.lead, CLEAR), ...HERO_CHIPS];
  /* the whole disc's print, no zone cut (l4.md M12): each box draws its own ground of paper 24
     units beyond itself (home.css), so the ground moves with the box and the field shows under
     its old place in the same frame */
  const heroWide = ditherSheet(FRAME_GRID.wide.cols, FRAME_GRID.wide.rows, heroTone);
  const heroNarrow = ditherSheet(FRAME_GRID.narrow.cols, FRAME_GRID.narrow.rows, heroTone);
  /* integrator.md 2.2: no clear zone (a box's ground at rest) covers more than 5 percent of the
     disc's cells on the sheet */
  {
    const grid = FRAME_GRID.wide;
    let disc = 0;
    const cleared = zones.map(() => 0);
    const cw = SHEET.w / grid.cols;
    const ch = SHEET.h / grid.rows;
    for (let r = 0; r < grid.rows; r += 1)
      for (let c = 0; c < grid.cols; c += 1) {
        const x = (c + 0.5) * cw;
        const y = (r + 0.5) * ch;
        if ((x - HERO_DISC.cx) ** 2 + (y - HERO_DISC.cy) ** 2 > HERO_DISC.r ** 2) continue;
        disc += 1;
        zones.forEach((z, i) => {
          if (inBox(z, x, y)) cleared[i] = (cleared[i] ?? 0) + 1;
        });
      }
    cleared.forEach((n, i) => {
      if (n / disc > 0.05)
        fail(
          `the hero's clear zone ${i} covers ${((n / disc) * 100).toFixed(1)} percent of the disc (over 5)`,
        );
    });
  }
  /* the canvas band: the Louisbourg lighthouse through the page's screen at 2 px cells. The deck's
     print is resampled to each grid by area (Mitchell), which keeps the tower's edges that a
     Gaussian back to tone smears */
  const lighthouseGrid = async (cols: number, rows: number): Promise<Bits> => {
    const gray = await grayOf(`${FIXTURE}/assets/mood-lighthouse-light.jpg`, 0, {
      width: cols,
      height: rows,
    });
    const bits = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r += 1)
      for (let c = 0; c < cols; c += 1) {
        const ink = (1 - (gray.data[r * cols + c] ?? 255) / 255) ** LIGHTHOUSE_GAMMA;
        if (ink > (bayer8(r, c) + 0.5) / 64) bits[r * cols + c] = 1;
      }
    return { cols, rows, bits };
  };
  /* the tone map C1 develops from: the wide grid's tone, one grey pixel a cell (512 by 288, JPEG
     at quality 50, under the 26 KB line of LANDING.md 4.1), its luminance the inked tone's
     complement (ink = 1 minus luminance). The wide still is the screen over that file as it
     decodes, so a develop from it ends on the still's cells */
  const toneGray = await grayOf(
    `${FIXTURE}/assets/mood-lighthouse-light.jpg`,
    0,
    GRID_SIZE(GRID.wide),
  );
  const toned = Buffer.from(
    toneGray.data.map((v) => Math.round(255 * (1 - (1 - v / 255) ** LIGHTHOUSE_GAMMA))),
  );
  const canvasTone = new Uint8Array(
    await sharp(toned, { raw: { width: GRID.wide.cols, height: GRID.wide.rows, channels: 1 } })
      .jpeg({ quality: 50, mozjpeg: true })
      .toBuffer(),
  );
  const decoded = await sharp(canvasTone).greyscale().raw().toBuffer();
  const canvasWideBits = new Uint8Array(GRID.wide.cols * GRID.wide.rows);
  for (let r = 0; r < GRID.wide.rows; r += 1)
    for (let c = 0; c < GRID.wide.cols; c += 1) {
      const ink = 1 - (decoded[r * GRID.wide.cols + c] ?? 255) / 255;
      if (ink > (bayer8(r, c) + 0.5) / 64) canvasWideBits[r * GRID.wide.cols + c] = 1;
    }
  const canvasWide: Bits = { ...GRID.wide, bits: canvasWideBits };
  const canvasNarrow = await lighthouseGrid(GRID.narrow.cols, GRID.narrow.rows);
  /* slide 8's thumbnail in the hero frame: the fixture's captured pattern (3200 by 1800, the light
     twin) blurred back to its tone and printed at the thumbnail's grid; slide 8's still frame on the
     page is V4's (scripts/home/pattern.ts, the role pattern-still) */
  const patternGray = await grayOf(`${FIXTURE}/assets/pattern-light.png`, 6);
  const patternTone: Tone = (x, y) =>
    sampleInk(patternGray, (x / SHEET.w) * patternGray.width, (y / SHEET.h) * patternGray.height);
  const lighthouseGray = await grayOf(`${FIXTURE}/assets/mood-lighthouse-light.jpg`, 1.2);
  const lighthouseTone: Tone = (x, y) =>
    sampleInk(
      lighthouseGray,
      (x / SHEET.w) * lighthouseGray.width,
      (y / SHEET.h) * lighthouseGray.height,
    ) ** LIGHTHOUSE_GAMMA;
  const mini = (tone: Tone): Bits => ditherSheet(MINI_GRID.cols, MINI_GRID.rows, tone);
  return {
    hero: { wide: heroWide, narrow: heroNarrow },
    canvas: { wide: canvasWide, narrow: canvasNarrow },
    field: ditherSheet(GRID.wide.cols, GRID.wide.rows, openerTone),
    mini: {
      hero: mini(heroTone),
      canvas: mini(lighthouseTone),
      field: mini(openerTone),
      pattern: mini(patternTone),
    },
    fieldPicture: await fieldPictures(),
    canvasTone,
  };
}

// ---------------------------------------------------------------------------------------------
// The slides (docs/LANDING.md 2.0 "Slides"; integrator.md 2.1, 4.1)

type DeckDoc = { deck: Deck; slides: Record<string, Slide> };

function loadFixture(): DeckDoc {
  const deck = readJson<Deck>(`${FIXTURE}/deck.json`);
  const slides: Record<string, Slide> = {};
  for (const id of deck.sections.flatMap((s) => s.slideIds))
    slides[id] = readJson<Slide>(`${FIXTURE}/slides/${id}.json`);
  return { deck, slides };
}

/** The page deck: the fixture after the run (slide 5 filled, eight slides). */
function loadPageDeck(): DeckDoc {
  const fixture = loadFixture();
  const sections = readJson<Deck['sections']>(`${RECORDED}/page-deck-sections.json`);
  const deck = { ...fixture.deck, sections } as Deck;
  return {
    deck,
    slides: {
      ...fixture.slides,
      'next-steps': readJson<Slide>(`${RECORDED}/next-steps-filled.json`),
    },
  };
}

const ALT = {
  hero: "The Blue Marble, NASA's photograph of the Earth",
  canvas: 'Louisbourg lighthouse, a lighthouse on the Nova Scotia coast',
  field: 'The opener field, a lit sphere printed in dots',
  pattern: "An animated pattern of dots in the theme's colors",
};
const RENDER_BASE = {
  chrome: true,
  assetBase: '',
  blockAttrs: true,
  gtWord: true,
  active: true,
} as const;

/** One slide's markup, with the check that its two appearances differ only in picture sources. */
function renderBoth(doc: DeckDoc, slide: Slide, prompts: boolean): string {
  const base = { ...RENDER_BASE, ...(prompts ? { prompts: true } : {}) };
  const light = renderSlide(doc.deck, slide, { ...base, theme: 'light' });
  const dark = renderSlide(doc.deck, slide, { ...base, theme: 'dark' });
  for (const r of [light, dark])
    if (r.warnings.length > 0) fail(`${slide.id}: ${r.warnings.join('; ')}`);
  const neutral = (html: string): string =>
    html.replace(/<img\b[^>]*>/g, (img) =>
      img.replace(/\s(src|data-light|data-dark)="[^"]*"/g, ''),
    );
  if (neutral(light.html) !== neutral(dark.html))
    fail(`${slide.id}: the light and dark renders differ outside their picture sources`);
  return light.html;
}

/** Every heading element becomes a div with the heading's look: the page's one h1 is page text. */
function headingsToDivs(html: string): string {
  return html
    .replace(/<h([1-6])\b([^>]*)>/g, (_m, level: string, rest: string) => {
      const cls = /\bclass="([^"]*)"/.exec(rest);
      const attrs =
        cls === null
          ? ` class="ts-home-h${level}"${rest}`
          : rest.replace(cls[0], `class="ts-home-h${level} ${cls[1]}"`);
      return `<div${attrs}>`;
    })
    .replace(/<\/h[1-6]>/g, '</div>');
}

/** An object's attributes: its id, its chip word as its name, and Tab on it unless it is a thumbnail's. */
function objectAttrs(object: SlideObject, tab: 0 | -1): string {
  return ` data-object="${object.id}" tabindex="${tab}" role="group" aria-roledescription="text box" aria-label="${object.role}"`;
}

/** Adds a selectable object's attributes to the element that carries `data-block="<block>"`. */
function markObject(html: string, object: SlideObject, tab: 0 | -1): string {
  const at = html.indexOf(`data-block="${object.block}"`);
  if (at < 0) fail(`${object.id}: no data-block="${object.block}" in the slide`);
  const close = html.indexOf('>', at);
  return `${html.slice(0, close)}${objectAttrs(object, tab)}${html.slice(close)}`;
}

/**
 * Wraps the element that carries `data-block="<block>"` in an object box (l2.md Q2): the wrapper
 * moves and draws the clear zone of paper under the text, so type never sits on the Blue Marble.
 */
function wrapObject(html: string, object: SlideObject, cls: string): string {
  const at = html.indexOf(`data-block="${object.block}"`);
  if (at < 0) fail(`${object.id}: no data-block="${object.block}" in the slide`);
  const open = html.lastIndexOf('<', at);
  const tag = /^<([a-z0-9]+)/.exec(html.slice(open))?.[1] ?? fail(`${object.id}: no element`);
  const end = html.indexOf(`</${tag}>`, at) + `</${tag}>`.length;
  return `${html.slice(0, open)}<div class="ts-home-obj ${cls}"${objectAttrs(object, 0)}>${html.slice(open, end)}</div>${html.slice(end)}`;
}

/** A field box (l4.md M4): the still as the one masked child, then the canvas the live module prints on. */
const FIELD_BOX = (cls: string, field: string, alt: string, extra = ''): string =>
  `<div class="${cls}" data-field="${field}"${extra} role="img" aria-label="${alt}"><i class="ts-field-still"></i><canvas aria-hidden="true"></canvas></div>`;
const PRINT = (field: string, alt: string): string =>
  FIELD_BOX(
    'ts-home-print ts-home-field',
    field,
    alt,
    field === 'field-slide' ? ' data-still="field-still"' : '',
  );

type InstanceOptions = {
  instance: string;
  slideId: SlideId;
  n: number;
  total: number;
  prompts?: boolean;
};

const isThumb = (instance: string): boolean => /^(hero|tailor)-thumb-/.test(instance);

function instanceHtml(doc: DeckDoc, options: InstanceOptions): string {
  const slide = doc.slides[options.slideId] ?? fail(`no slide ${options.slideId}`);
  let html = headingsToDivs(renderBoth(doc, slide, options.prompts === true));
  /* every text, rows and plate block of a slide shown at size is an object (v2.md R1); the hero
     frame's slide 1 wraps its title and subtitle in boxes that draw their clear zone over the Blue
     Marble (l2.md Q2). A thumbnail carries the renderer's block attributes alone: the core's
     painter marks its blocks when it shows one (V2's `markObjects`), which keeps about 2.5 KB of
     attributes out of the document (4.1). Slide 5's earlier states keep the blocks they hold.
     The objects take Tab only where a band edits them, the hero frame and the canvas band (V2's
     core keeps or drops each stop at its first drawing; v3.md R18) */
  const tab = options.instance === 'hero' || options.instance === 'canvas' ? 0 : -1;
  const objects = isThumb(options.instance) ? [] : slideObjects(options.slideId);
  for (const object of objects) {
    if (options.instance === 'hero' && object.block === 'heading')
      html = wrapObject(html, object, 'ts-home-title');
    else if (options.instance === 'hero' && object.block === 'lead')
      html = wrapObject(html, object, 'ts-home-sub');
    else if (object.block === 'plate')
      html = html.replace(
        '<div class="mood-plate"',
        `<div class="mood-plate"${objectAttrs(object, tab)}`,
      );
    else if (html.includes(`data-block="${object.block}"`)) html = markObject(html, object, tab);
    else if (options.prompts !== true) fail(`${options.instance}: no block ${object.block}`);
  }
  /* every picture is the page's own print (docs/LANDING.md 2.0) */
  html = html.replace(/<img class="mood-img"[^>]*>/g, () => {
    if (options.slideId === 'lighthouse') return PRINT('canvas', ALT.canvas);
    if (options.slideId === 'field') return PRINT('field-slide', ALT.field);
    if (options.slideId === 'pattern') return PRINT('pattern', ALT.pattern);
    return fail(`${options.slideId}: a picture the page has no print for`);
  });
  if (/<img\b/.test(html)) fail(`${options.instance}: a picture is left in the markup`);
  const counter = `${options.n} / ${options.total}`;
  let stage = renderStage(html, {
    theme: 'light',
    counter,
    band: GT_BAND,
    titleSlide: slide.kind === 'title',
  });
  stage = stage.replace(/^<div class="ts-sheet sheet" data-theme="light">/, () => {
    const thumb = isThumb(options.instance);
    return `<div class="ts-sheet sheet ts-home-slide${thumb ? ' is-thumb' : ''}" data-home-slides data-slide="${options.slideId}" data-instance="${options.instance}" data-counter="${counter}">`;
  });
  if (!stage.startsWith('<div class="ts-sheet sheet ts-home-slide'))
    fail(`${options.instance}: renderStage's root changed`);
  stage = stage.replace(/href="#gt-mark"/g, 'href="#ts-mark"');
  /* the counter's text, which the live module renumbers (l2.md Q4) */
  stage = stage.replace('<div class="counter">', '<div class="counter" data-counter-text>');
  /* slide 1 draws the Blue Marble in its lower right with its credit (Kevin's answer 1); only the
     hero frame's own slide is `hero`, the box H5 develops, every other copy a `hero-print` */
  if (options.slideId === 'title') {
    const credit =
      (doc.deck.assets['mood-earth'] as { credit?: string } | undefined)?.credit ??
      fail('the Blue Marble has no credit');
    const opened =
      /<div class="ts-stage stage[^"]*">/.exec(stage)?.[0] ?? fail('slide 1 has no stage');
    const field = options.instance === 'hero' ? 'hero' : 'hero-print';
    stage = stage.replace(
      opened,
      `${opened}${FIELD_BOX('ts-home-field ts-hero-field', field, ALT.hero)}`,
    );
    if (!stage.includes(`data-field="${field}"`)) fail('the Blue Marble did not land in slide 1');
    stage = stage.replace(
      '<div class="counter" data-counter-text>',
      `<div class="ts-home-credit">${credit}</div><div class="counter" data-counter-text>`,
    );
  }
  if (options.slideId === 'close')
    stage = stage.replace(
      '<div class="center" data-slot="main">',
      `<div class="center" data-slot="main">${markPieces()}`,
    );
  return stage;
}

/** The mark of the close in seven pieces, leftmost first (docs/LANDING.md 2.15 Kind). */
function markPieces(): string {
  const svg = readFileSync(resolve(ROOT, MARK_PATH), 'utf8');
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? fail('mark.svg has no viewBox');
  const d = /<path d="([^"]+)"/.exec(svg)?.[1] ?? fail('mark.svg has no path');
  const pieces = d
    .split('Z')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `${p}Z`);
  if (pieces.length !== 7) fail(`mark.svg has ${pieces.length} pieces, not 7`);
  const minX = (p: string): number =>
    Math.min(...[...p.matchAll(/[ML](-?[\d.]+) /g)].map((m) => Number(m[1])));
  const ordered = [...pieces].sort((a, b) => minX(a) - minX(b));
  return `<svg class="ts-home-mark" viewBox="${viewBox}" fill="currentColor" aria-hidden="true">${ordered.map((p, i) => `<path data-mark-piece="${i}" d="${p}"/>`).join('')}</svg>`;
}

type DerivedSlides = {
  /** the first screen's instances (slides.generated.ts) */
  instances: Record<string, { slide: SlideId; html: string }>;
  /** each band's instances below the first screen, by `data-fill` key (bands.generated.ts) */
  bands: Record<FillBand, Record<string, string>>;
  /** every slide at rest, once, for the bands that place their own copies */
  markup: Record<SlideId, string>;
  live: { field: string; placeholders: string; titled: string };
};

function deriveSlides(): DerivedSlides {
  const page = loadPageDeck();
  const order = page.deck.sections.flatMap((s) => s.slideIds) as SlideId[];
  const total = order.length;
  if (JSON.stringify(order) !== JSON.stringify(PAGE_ORDER))
    fail(`the page deck's order ${order.join(', ')} is not ${PAGE_ORDER.join(', ')}`);
  const nOf = (id: SlideId): number => order.indexOf(id) + 1;
  const instances: DerivedSlides['instances'] = {};
  for (const [instance, slideId] of INSTANCES)
    instances[instance] = {
      slide: slideId,
      html: instanceHtml(page, { instance, slideId, n: nOf(slideId), total }),
    };
  const bands = {} as DerivedSlides['bands'];
  for (const [band, list] of Object.entries(BAND_INSTANCES) as [
    FillBand,
    readonly (readonly [string, SlideId])[],
  ][])
    bands[band] = Object.fromEntries(
      list.map(([instance, slideId]) => [
        instance,
        instanceHtml(page, { instance, slideId, n: nOf(slideId), total }),
      ]),
    );
  const markup = Object.fromEntries(
    PAGE_ORDER.map((id) => [
      id,
      instanceHtml(page, { instance: `slide-${id}`, slideId: id, n: nOf(id), total }),
    ]),
  ) as Record<SlideId, string>;
  const state = (name: 'placeholders' | 'titled'): string => {
    const doc = {
      deck: page.deck,
      slides: {
        ...page.slides,
        'next-steps': readJson<Slide>(`${RECORDED}/next-steps-${name}.json`),
      },
    };
    return instanceHtml(doc, {
      instance: 'agents',
      slideId: 'next-steps',
      n: nOf('next-steps'),
      total,
      prompts: true,
    });
  };
  return {
    instances,
    bands,
    markup,
    live: {
      field: instanceHtml(page, { instance: 'show', slideId: 'field', n: nOf('field'), total }),
      placeholders: state('placeholders'),
      titled: state('titled'),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// A small JSON Schema check for the MCP and HTTP bodies (the subset these schemas use)

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
  for (const key of ['anyOf', 'oneOf'] as const) {
    const options = schema[key] as Schema[] | undefined;
    if (options !== undefined && !options.some((s) => validate(value, s, root, path).length === 0))
      errors.push(`${path}: matches none of ${key}`);
  }
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
    typeof value === 'number' &&
    typeof schema['minimum'] === 'number' &&
    value < schema['minimum']
  )
    errors.push(`${path}: under the minimum`);
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
// run.generated.ts (docs/LANDING.md 2.4)

const AGENT_CLOCK = 24;
const RING_MAX = 700;
const FLAG = 800 + 160;
const BEAT = 500;
/** A 24 character name with no space, the widest a substituted command can get. */
const LONG_NAME = 'Abcdefghijklmnopqrstuvwx';

type PanelText = { wide: string[]; narrow: string[] };

function screen(linesIn: readonly string[], options: { banner?: boolean } = {}): PanelText {
  const at = (width: PanelWidth): string[] => {
    try {
      if (!options.banner) return formatScreen(linesIn, width);
      /* a banner line continues under its text column */
      const out = linesIn.flatMap((line, i) =>
        i === 0
          ? formatScreen([line], width)
          : formatScreen([line], width, { indent: BANNER_INDENT }),
      );
      if (out.length > PANEL_WIDTHS[width].slots)
        throw new RangeError(`${out.length} lines at ${width}`);
      return out;
    } catch (error) {
      return fail(
        `a panel screen does not fit (${error instanceof Error ? error.message : String(error)}):\n${linesIn.join('\n')}`,
      );
    }
  };
  return { wide: at('wide'), narrow: at('narrow') };
}

function deriveRun(stills: { pageDeck: DeckDoc }): {
  source: string;
  totalMs: number;
  transcript: PanelText;
} {
  const run = readJson<RecordedRun>(`${RECORDED}/run.json`);
  const cliJson = readJson<{ actions: { action: string; usage: string }[] }>(CLI_JSON);
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
  if (run.fixtureSha256 !== fixtureSha256())
    fail(`${RECORDED}/run.json was recorded on another fixture; run --run`);
  /* the banner: the six lines, the fourth fact (the checkout's path on the build machine) left out */
  const version = run.versionAnswer.stdout;
  if (version.length !== 6) fail(`turboslide --version printed ${version.length} lines, not 6`);
  const cliVersion =
    /Turboslide (\S+)/.exec(version[0] ?? '')?.[1] ?? fail('no version in the banner');
  const banner = version;
  const steps = STEPS.map((step, i) => {
    const recorded = run.steps[i] ?? fail(`no recording of step ${step.n}`);
    if (JSON.stringify(recorded.answer.argv) !== JSON.stringify(step.argv))
      fail(`step ${step.n} was recorded with other arguments; run --run`);
    const split = splitWords(step.command.replace(/^turboslide /, ''));
    if (!split.ok || JSON.stringify(split.words) !== JSON.stringify(step.argv))
      fail(`step ${step.n}: the printed command does not split to its arguments`);
    const human = humanOf(recorded.answer);
    const answer = [human[0] ?? fail(`step ${step.n} answered nothing`)];
    const findings = human.slice(1).map((l) => l.trim());
    /* the run's findings are the rows layout's empty placeholders and the customer's name in a heading */
    for (const f of findings)
      if (
        !/copy\/empty-placeholder|copy\/sentence-case \(2\): Sentence case: lowercase "Northwind"/.test(
          f,
        )
      )
        fail(`step ${step.n}: a finding outside the expected two kinds: ${f}`);
    const revisionBefore = recorded.revisionBefore;
    const action = step.action;
    const tool = mcp.tools.find((t) => t.action === action) ?? fail(`no MCP tool for ${action}`);
    const args: Record<string, unknown> =
      step.n === 1
        ? { layout: 'rows', after: 'ships', id: 'next-steps', baseRevision: revisionBefore }
        : {
            slideId: 'next-steps',
            blockId: step.n === 2 ? 'h' : 'rows',
            path: step.n === 2 ? '/text' : '/items',
            value: step.n === 2 ? STEP2_TITLE : STEP3_ROWS,
            baseRevision: revisionBefore,
          };
    const mcpErrors = validate(args, tool.inputSchema, mcp as Schema);
    if (mcpErrors.length > 0)
      fail(
        `step ${step.n}: the MCP body misses ${tool.name}'s inputSchema: ${mcpErrors.join('; ')}`,
      );
    const httpPath = `/api/actions/${action}`;
    const op = openapi.paths[httpPath]?.post ?? fail(`openapi.json has no ${httpPath}`);
    const httpErrors = validate(args, op.requestBody.content['application/json'].schema, openapi);
    if (httpErrors.length > 0)
      fail(`step ${step.n}: the HTTP body misses ${httpPath}'s schema: ${httpErrors.join('; ')}`);
    const typedChars = step.n === 3 ? step.typed.trimEnd().length : step.typed.length;
    const landing =
      step.n === 1
        ? { kind: 'rails' as const }
        : step.n === 2
          ? { kind: 'words' as const, chars: STEP2_TITLE.length }
          : { kind: 'rows' as const, count: STEP3_ROWS.length };
    const land =
      step.n === 1 ? 600 + 3 * 60 : step.n === 2 ? STEP2_TITLE.length * AGENT_CLOCK : 160 + 2 * 55;
    const schedule = {
      type: typedChars * AGENT_CLOCK,
      answer: 200 + 120 + 55 * (answer.length - 1),
      beat: BEAT,
      ring: RING_MAX,
      land,
      flag: FLAG,
      total: 0,
    };
    schedule.total =
      schedule.type +
      schedule.answer +
      schedule.beat +
      Math.max(schedule.ring, schedule.land) +
      schedule.flag;
    if (schedule.total > 5000)
      fail(`step ${step.n} takes ${schedule.total} ms, over the 5 s of 3.7`);
    const layoutLabel = layoutEntry('rows').label;
    return {
      n: step.n,
      action,
      argv: step.argv,
      command: step.command,
      typedChars,
      answer,
      findings,
      revisionBefore: String(revisionBefore),
      mcp: { name: tool.name, arguments: args },
      http: { method: 'POST' as const, path: httpPath, body: args },
      target: step.n === 1 ? 'next-steps' : step.n === 2 ? 'next-steps#h' : 'next-steps#rows',
      landing,
      schedule,
      history:
        step.n === 1
          ? `Added slide 5 with the ${layoutLabel} layout`
          : step.n === 2
            ? 'Set the title of slide 5'
            : 'Set the rows of slide 5',
    };
  });
  const totalMs = steps.reduce((sum, s) => sum + s.schedule.total, 0);
  const help = [
    'This page runs these five commands.',
    ...STEPS.map((s) =>
      s.n === 3
        ? "turboslide block set next-steps#rows /items '<rows>'"
        : s.n === 2
          ? 'turboslide block set next-steps#h /text "<title>"'
          : s.command,
    ),
    'turboslide tailor --replace=<from>=<to>',
    'turboslide version list',
  ];
  /* a write's answer prints its summary; the finding lines under it (indented two spaces) are kept apart */
  const typed = run.typed.map((t) => ({
    form: t.form,
    state: t.state,
    nameFound: t.nameFound,
    step: t.step,
    argv: t.answer.argv,
    code: t.answer.code,
    answer: humanOf(t.answer).filter((l) => !/^ {2}\S/.test(l)),
    findings: humanOf(t.answer)
      .filter((l) => /^ {2}\S/.test(l))
      .map((l) => l.trim()),
    names: t.names,
  }));
  const parseCount = (answer: CliAnswer): { places: number; slides: number } => {
    const m = /^(\d+) replacements? on (\d+) slides?/.exec(answer.stdout[0] ?? '');
    if (m === null) fail(`the tailor answer "${answer.stdout[0]}" names no counts`);
    return { places: Number(m[1]), slides: Number(m[2]) };
  };
  const tailorCounts = { start: parseCount(run.tailor.start), rest: parseCount(run.tailor.rest) };
  /* the screens, with the fixture's name and with a 24 character name */
  const transcriptOf = (name: string): string[] =>
    steps.flatMap((s) => cliStepLines(s, CUSTOMER, name));
  const mcpOf = (name: string): string[] => [
    ...steps.flatMap((s) => mcpStepLines(s, CUSTOMER, name)),
    REQUEST_ONLY,
  ];
  const httpOf = (name: string): string[] => [
    ...steps.flatMap((s) => httpStepLines(s, CUSTOMER, name)),
    REQUEST_ONLY,
  ];
  const screens = {
    banner: screen(['$ turboslide --version', ...banner], { banner: true }),
    transcript: screen(transcriptOf(CUSTOMER)),
    mcp: screen(mcpOf(CUSTOMER)),
    http: screen(httpOf(CUSTOMER)),
    help: screen(['$ help', ...help]),
  };
  screen(transcriptOf(LONG_NAME));
  screen(mcpOf(LONG_NAME));
  screen(httpOf(LONG_NAME));
  for (const t of typed) {
    const command = `$ turboslide ${t.argv.map((w) => (/[\s'"$`\\]/.test(w) ? `'${w.replace(/'/g, "'\\''")}'` : w)).join(' ')}`;
    /* the visitor's typed line is echoed with overlong runs broken at the column (panel-format.ts) */
    for (const name of [CUSTOMER, LONG_NAME])
      for (const width of ['wide', 'narrow'] as const) {
        const echoed = formatLines([substituteName(command, CUSTOMER, name)], width, {
          overlong: 'break',
        });
        const answered = formatLines(
          t.answer.map((l) => substituteAnswer(l, CUSTOMER, name)),
          width,
        );
        if (echoed.length + answered.length > PANEL_WIDTHS[width].slots)
          fail(
            `the typed form ${t.argv.join(' ')} (${t.state}) needs ${echoed.length + answered.length} lines at ${width} width`,
          );
      }
  }
  const cliCommands = cliJson.actions.length;
  const data = {
    cliVersion,
    banner,
    steps,
    totalMs,
    captionSeconds: Math.round(totalMs / 1000),
    help,
    typed,
    tailorCounts,
    screens,
    cliCommands,
    refusal: `This page runs 5 of the CLI's ${cliCommands} commands.`,
    gestures: run.gestures.map((g) => ({ argv: g.argv, answer: humanOf(g).slice(0, 1) })),
  };
  void stills;
  const source = `${GENERATED_HEADER('--run', 'docs/LANDING.md 2.4, 6.1')}
// The route reads this module only behind \`import.meta.env.SSR\` (the agents band's resting
// screen and the MCP and HTTP tab panels are server markup); the live module imports it, so it
// travels in the live chunk. Every row reads the commands from here, never from literal text.
// The answers are the CLI's human lines recorded by --run under apps/studio/home-deck/recorded/;
// each step prints its first line, the summary, and keeps the finding lines the CLI added after
// it (the rows layout's empty placeholders and the customer's name in a heading) in \`findings\`.
import type { HomeObjectId, HomeSlideId } from './deck.generated';

/** A screen formatted by panel-format.ts at both widths: 64 columns and 44 columns. */
export type PanelText = { wide: readonly string[]; narrow: readonly string[] };

export type RunLanding =
  | { kind: 'rails' }
  | { kind: 'words'; chars: number }
  | { kind: 'rows'; count: number };

/** The step's scheduled lengths in ms (docs/LANDING.md 2.4, A1 to A6), with the fixture's name. */
export type RunSchedule = {
  /** typed characters times 24 ms (A1) */
  type: number;
  /** 200 ms, then 120 ms and 55 ms a further line (A2) */
  answer: number;
  /** the 500 ms beat */
  beat: number;
  /** 300 ms plus the distance over two, at most 700 ms (A3); the bound */
  ring: number;
  /** the landing (A4, A5) */
  land: number;
  /** the flag's 800 ms hold and 160 ms exit */
  flag: number;
  total: number;
};

export type RunStep = {
  n: 1 | 2 | 3;
  action: 'slide.new' | 'block.set';
  /** the arguments after \`turboslide\`, as the CLI received them */
  argv: readonly string[];
  /** the command as the panel prints it, \`turboslide ...\`, the newlines inside its quotes kept */
  command: string;
  /** the characters typed at 24 ms: the command up to its value (A1); a JSON value pastes whole */
  typedChars: number;
  /** the CLI's human answer as the panel prints it: its first line */
  answer: readonly string[];
  /** the finding lines the CLI printed under that line */
  findings: readonly string[];
  /** the revision the CLI read before the step, the bodies' \`baseRevision\` */
  revisionBefore: string;
  /** the \`tools/call\` params: the tool of mcp-tools.json and its arguments */
  mcp: { name: string; arguments: Readonly<Record<string, unknown>> };
  /** the request of openapi.json */
  http: { method: 'POST'; path: string; body: Readonly<Record<string, unknown>> };
  /** where the agent's ring travels */
  target: HomeObjectId | HomeSlideId;
  landing: RunLanding;
  schedule: RunSchedule;
  /** the Version history row's words */
  history: string;
};

/** The deck states the typed line can meet (slide 5 absent, placeholders, titled, filled). */
export type RunDeckState = 'absent' | 'placeholders' | 'titled' | 'filled';

/** One recorded answer to a typed form (docs/LANDING.md 2.4, "The typed line"). */
export type TypedRecording = {
  /** \`tailor-spaced\` is \`tailor --replace <from>=<to>\`, which this CLI refuses (it takes --replace=<value>) */
  form: 'tailor' | 'tailor-spaced' | 'version-list' | 'step';
  state: RunDeckState;
  /** for \`tailor\`: whether the deck held the name; null otherwise */
  nameFound: boolean | null;
  /** for \`step\`: the step run in that state; null otherwise */
  step: 1 | 2 | 3 | null;
  argv: readonly string[];
  /** the CLI's exit code: 0 ran, 2 refused */
  code: number;
  /** the human answer the panel prints (a write's summary line) */
  answer: readonly string[];
  /** the finding lines a write printed under its summary */
  findings: readonly string[];
  /** the names the recording was made with, which the page substitutes; null when none */
  names: { from: string; to: string } | null;
};

export type HomeRun = {
  /** \`turboslide --version\`'s version, equal to the banner's */
  cliVersion: string;
  /** the banner, the CLI's own lines, the fourth line's fact (the checkout's path) left out */
  banner: readonly string[];
  steps: readonly [RunStep, RunStep, RunStep];
  /** the sum of the three schedules with the fixture's name */
  totalMs: number;
  /** totalMs in whole seconds, the caption's figure */
  captionSeconds: number;
  /** the help lines: the five commands this page runs */
  help: readonly string[];
  typed: readonly TypedRecording[];
  /** \`tailor --replace=Northwind=Globex\` on the fixture (7 slides) and on the page deck (8) */
  tailorCounts: {
    start: { places: number; slides: number };
    rest: { places: number; slides: number };
  };
  /** every resting screen, formatted and checked against the slots */
  screens: { banner: PanelText; transcript: PanelText; mcp: PanelText; http: PanelText; help: PanelText };
  /** the length of cli.json \`actions\` */
  cliCommands: number;
  /** the answer to a line this page does not run */
  refusal: string;
  /** the canvas band's gesture forms, each accepted by the CLI on the page deck */
  gestures: readonly { argv: readonly string[]; answer: readonly string[] }[];
};

export const HOME_RUN: HomeRun = ${JSON.stringify(data, null, 2)};
`;
  return { source, totalMs, transcript: screens.transcript };
}

/** The header every generated module carries. */
function GENERATED_HEADER(flag: string, spec: string): string {
  return `// Generated by scripts/build-home-assets.ts ${flag} (${spec}); never edited by hand.
// node scripts/build-home-assets.ts --check compares this file with its sources.`;
}

// ---------------------------------------------------------------------------------------------
// deck.generated.ts, slides.generated.ts, bands.generated.ts and bands/*.generated.ts (LANDING.md 4.2)

/** The layout id each fixture slide is drawn from (the editor's Slide > Apply layout names). */
function layoutOf(slide: Slide): string {
  const template = (slide as { template?: string }).template;
  if (template !== undefined) return template;
  if (slide.kind === 'content') fail(`${slide.id}: a content slide without its layout's template`);
  return slide.kind;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The hero loop's four commands (V3's recordings, chips.generated.ts \`HOME_LOOP\`). */
const LOOP_COMMANDS = [
  ['restore', 'turboslide version restore 1'],
  ...STEPS.map((step) => [(['new', 'title', 'rows'] as const)[step.n - 1], step.command] as const),
] as const;

function deriveDeckFacts(
  page: DeckDoc,
  exportRec: RecordedExport | null,
  runSeconds: number,
  loopMs: number,
  stepMs: Readonly<Record<string, number>>,
): string {
  const order = page.deck.sections.flatMap((s) => s.slideIds) as SlideId[];
  const startOrder = loadFixture().deck.sections.flatMap((s) => s.slideIds) as SlideId[];
  /* the lighthouse after `slide to-canvas`: the block ids the canvas band's CLI lines print */
  const canvas = readJson<{ slots: { main: { id: string }[] } }>(
    `${RECORDED}/lighthouse-canvas.json`,
  );
  const slides: Record<string, unknown> = {};
  for (const id of order) {
    const slide = page.slides[id] as Slide & { notes?: string };
    const n = order.indexOf(id) + 1;
    const objects = slideObjects(id).map((o) => ({
      id: o.id,
      role: o.role,
      box: { ...o.box, rot: 0 },
      text: o.text,
      editable: o.editable,
      canvasBlock:
        id === 'lighthouse'
          ? (canvas.slots.main.find((b) => b.id === o.block)?.id ??
            fail(`the converted lighthouse slide has no block ${o.block}`))
          : null,
    }));
    slides[id] = {
      id,
      n,
      title: slideTitle(slide, n),
      notes: slide.notes ?? '',
      layout: layoutOf(slide),
      objects,
    };
  }
  const deck = {
    fixtureSha256: fixtureSha256(),
    pageDeckSha256: pageDeckSha256(),
    customer: CUSTOMER,
    order,
    startOrder,
    slides,
    title: page.deck.title,
    heroDisc: HERO_DISC,
  };
  const tailorWords = {
    title: TAILOR.title,
    from: TAILOR.from,
    to: TAILOR.to,
    apply: TAILOR.apply,
    cancel: TAILOR.cancel,
    undo: TAILOR.undo,
    countRest: TAILOR.count(0, 0),
  };
  const run = readJson<RecordedRun>(`${RECORDED}/run.json`);
  const count = (a: CliAnswer): string => {
    const m =
      /^(\d+) replacements? on (\d+) slides?/.exec(a.stdout[0] ?? '') ?? fail('no tailor counts');
    return TAILOR.count(Number(m[1]), Number(m[2]));
  };
  tailorWords.countRest = count(run.tailor.rest);
  const runFacts = { captionSeconds: runSeconds, steps: STEPS.length };
  /* the hero's loop (2.2, V1#15): the step tabs' CLI words, the two words after `turboslide` in
     each recorded command, and the caption's seconds, the cycle's length rounded */
  /* each step's length in seconds to one decimal, as the terminal's foot prints it (DESIGN.md 8.2) */
  const loopFacts = {
    captionSeconds: Math.round(loopMs / 1000),
    stepSeconds: Object.fromEntries(
      LOOP_COMMANDS.map(([id]) => {
        const ms = stepMs[id];
        if (ms === undefined) fail(`the loop has no step ${id}`);
        return [id, (Math.round(ms / 100) / 10).toFixed(1)];
      }),
    ),
  };
  const exportFacts =
    exportRec === null
      ? { perfectWidth: 0, perfectHeight: 0 }
      : { perfectWidth: exportRec.perfectSize.width, perfectHeight: exportRec.perfectSize.height };
  return `${GENERATED_HEADER('--slides', 'docs/LANDING.md 2.0, 6.1; integrator.md 4.2')}
//
// The client safe facts of the page deck: the ids, the order, the titles, the notes and the
// boxes of the selectable objects in sheet units. No slide markup and no still lives here (they
// are in slides.generated.ts, read only on the server, and bands.generated.ts, which only the band
// chunks import), so the route chunk and the live module may both import this file.

/** The nine slides of the page deck, by id (docs/LANDING.md 2.0, the second pass). */
export type HomeSlideId =
  ${PAGE_ORDER.map((id) => `'${id}'`).join(' | ')};

/** A box in sheet units (1 unit is 1/1600 of the sheet's width), turned \`rot\` degrees clockwise. */
export type SheetBox = { x: number; y: number; w: number; h: number; rot: number };

/** A selectable object, \`<slide>#<object>\`: the value of its wrapper's \`data-object\`. */
export type HomeObjectId = \`\${HomeSlideId}#\${string}\`;

/** The word the selection chip shows (the editor's role chip). */
export type HomeObjectRole =
  | 'Title'
  | 'Subtitle'
  | 'Heading'
  | 'Text'
  | 'Rows'
  | 'Credit'
  | 'Plate';

export type HomeObject = {
  id: HomeObjectId;
  role: HomeObjectRole;
  /** the box at rest, as the CLI's \`slide to-canvas\` measures it */
  box: SheetBox;
  /** the text at rest; '' for the plate */
  text: string;
  /** a second click or Enter types in it (every text block; not the plate or a rows block) */
  editable: boolean;
  /** the block id the CLI prints for this object after \`slide to-canvas\`; the lighthouse's alone */
  canvasBlock: string | null;
};

export type HomeSlideFacts = {
  id: HomeSlideId;
  /** the deck number at rest (1 to 9) */
  n: number;
  /** \`slideTitle\` of the slide, the Present list's row */
  title: string;
  /** the speaker notes, which the show's bar reads */
  notes: string;
  /** the layout id of \`packages/schema/src/layouts.ts\` */
  layout: string;
  objects: readonly HomeObject[];
};

/** Where the hero's picture sits on the sheet, in sheet units (integrator.md 2.2, answer 1). */
export type FieldDisc = { cx: number; cy: number; r: number };

export type HomeDeckFacts = {
  /** sha256 over apps/studio/home-deck (deck.json, slides, assets), every file in path order */
  fixtureSha256: string;
  /** sha256 over the page deck: the fixture, the run's sections and its slide 5 */
  pageDeckSha256: string;
  /** the customer name the fixture spells */
  customer: string;
  /** the page deck at rest: nine ids */
  order: readonly HomeSlideId[];
  /** the fixture, the run's start: eight ids, \`next-steps\` absent */
  startOrder: readonly HomeSlideId[];
  slides: Readonly<Record<HomeSlideId, HomeSlideFacts>>;
  /** the deck's title ("Onboarding plan"), which the hero frame's and the miniature's title rows show */
  title: string;
  /** the hero's Blue Marble disc (answer 1) */
  heroDisc: FieldDisc;
};

export const HOME_DECK: HomeDeckFacts = ${JSON.stringify(deck, null, 2)};

/**
 * The Tailor dialog's own words, copied from @turboslide/chrome's TAILOR
 * (packages/chrome/src/panels/assist-strings.ts) for the band's dialog (DESIGN.md 8.6: the title,
 * Replace, With, the count, Cancel and Apply); \`countRest\` is TAILOR.count over the CLI's
 * recorded answer on the page deck.
 */
export const HOME_TAILOR_WORDS = ${JSON.stringify(tailorWords, null, 2)} as const;

/** The Perfect file's picture size, read from the file the CLI wrote (docs/LANDING.md 2.8). */
export const HOME_EXPORT_FACTS = ${JSON.stringify(exportFacts, null, 2)} as const;

/** The run's figures the route prints (the caption's seconds, run.generated.ts \`captionSeconds\`). */
export const HOME_RUN_FACTS = ${JSON.stringify(runFacts, null, 2)} as const;

/** The hero's loop as the route prints it (2.2; DESIGN.md 8.2): the recording's seconds in the terminal's head and each step's length in its foot. */
export const HOME_LOOP_FACTS = ${JSON.stringify(loopFacts, null, 2)} as const;
`;
}

function dataUri(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

async function deriveSlidesSource(
  slides: DerivedSlides,
  stills: Stills,
  exportRec: RecordedExport | null,
  assets: ServedAsset[],
  transcript: PanelText,
): Promise<{
  slides: string;
  bands: string;
  bandSources: Record<string, string>;
  stillsBytes: number;
}> {
  const still = async (grid: Bits) => ({
    cols: grid.cols,
    rows: grid.rows,
    ink: dataUri('image/png', await bitsPng(grid)),
    disc: null,
  });
  const fieldStills = {
    hero: { wide: await still(stills.hero.wide), narrow: await still(stills.hero.narrow) },
  };
  const mini = {
    hero: await still(stills.mini.hero),
    canvas: await still(stills.mini.canvas),
    field: await still(stills.mini.field),
    pattern: await still(stills.mini.pattern),
  };
  const stillsBytes = [
    fieldStills.hero.wide,
    fieldStills.hero.narrow,
    ...Object.values(mini),
  ].reduce((n, s) => n + s.ink.length, 0);
  const pathOf = (
    role: AssetRole,
    appearance: 'light' | 'dark' | null,
    variant: AssetVariant,
  ): string =>
    (
      assets.find((a) => a.role === role && a.appearance === appearance && a.variant === variant) ??
      fail(`no asset ${role} ${appearance} ${variant}`)
    ).path;
  /* the server only stylesheet: the inlined stills (slide 1 in the hero frame and the frame
     filmstrip's thumbnails, which are in the first screen and request nothing), then the band
     stills' files, requested only when a box that draws them comes near the viewport */
  const hero = '[data-field="hero"],[data-field="hero-print"]';
  const canvas = '[data-field="canvas"]';
  const thumb = (field: string): string => `[data-hero-filmstrip] [data-field="${field}"]`;
  const css = [
    `${hero}{--ts-still:url("${fieldStills.hero.wide.ink}")}`,
    `${canvas}{--ts-still:url("${pathOf('lighthouse-still', null, 'wide')}")}`,
    `@media (max-width:719px){${hero}{--ts-still:url("${fieldStills.hero.narrow.ink}")}${canvas}{--ts-still:url("${pathOf('lighthouse-still', null, 'narrow')}")}}`,
    `${thumb('hero-print')}{--ts-still:url("${mini.hero.ink}")}`,
    `${thumb('canvas')}{--ts-still:url("${mini.canvas.ink}")}`,
    `${thumb('field-slide')}{--ts-still:url("${mini.field.ink}")}`,
    `${thumb('pattern')}{--ts-still:url("${mini.pattern.ink}")}`,
  ].join('');
  /* the Editable text side of slide 7 (docs/LANDING.md 2.8): the file's frames at their places */
  let editable = '';
  if (exportRec !== null) {
    const esc = (t: string): string =>
      t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const box = (b: { x: number; y: number; w: number; h: number }): string =>
      `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px`;
    const picturesOf = (list: RecordedExport['editable']['pictures']): string =>
      list
        .map((p) =>
          (['light', 'dark'] as const)
            .map((theme) => {
              const asset =
                assets.filter((a) => a.role === 'export-editable' && a.appearance === theme)[
                  p.index
                ] ?? fail('an Editable text picture is missing');
              /* the slide's picture is named; the frame band's wordmark picture is decorative */
              const alt = p.w >= 1600 && p.h >= 900 ? ALT.field : '';
              return `<img class="ts-home-ed-pic ts-only-${theme}" src="${asset.path}" width="${asset.width}" height="${asset.height}" loading="lazy" decoding="async" alt="${alt}" style="${box(p)}">`;
            })
            .join(''),
        )
        .join('');
    /* the slide's own picture under the file's paper plates, and the footer logo's picture over
       the plate the file draws behind it, as the file stacks them; drawn under the plates, the
       logo was hidden on this side (verify-landing.md finding 6) */
    const whole = (p: { w: number; h: number }): boolean => p.w >= 1600 && p.h >= 900;
    const pictures = picturesOf(exportRec.editable.pictures.filter(whole));
    const logos = picturesOf(exportRec.editable.pictures.filter((p) => !whole(p)));
    /* each line of the file a filled 1 px rectangle in sheet units, one path per role (the
       hairlines, the crosses) in one SVG over the slide, so twelve lines cost one element */
    const rect = (l: { x: number; y: number; w: number; h: number }): string =>
      `M${l.x} ${l.y}h${Math.max(l.w, 1)}v${Math.max(l.h, 1)}h${-Math.max(l.w, 1)}z`;
    const roles = [...new Set(exportRec.editable.lines.map((l) => l.role))];
    const lines =
      roles.length === 0
        ? ''
        : `<svg class="ts-home-ed-lines" viewBox="0 0 1600 900" aria-hidden="true">${roles
            .map(
              (role) =>
                `<path class="is-${role}" d="${exportRec.editable.lines
                  .filter((l) => l.role === role)
                  .map(rect)
                  .join('')}"/>`,
            )
            .join('')}</svg>`;
    const fills = exportRec.editable.fills
      .map((f) => `<i class="ts-home-ed-fill" style="${box(f)}"></i>`)
      .join('');
    const para = (p: ExportFrame['paragraphs'][number]): string => {
      const css = [
        p.size === null ? '' : `font-size:${p.size}px`,
        p.lineHeight === null ? '' : `line-height:${p.lineHeight}px`,
        p.tracking === 0 ? '' : `letter-spacing:${p.tracking}px`,
      ].filter(Boolean);
      return `<p${p.muted ? ' class="is-muted"' : ''}${css.length > 0 ? ` style="${css.join(';')}"` : ''}>${esc(p.text).replace(/\n/g, '<br>')}</p>`;
    };
    const frames = exportRec.editable.frames
      .map(
        (f) =>
          `<div class="ts-home-ed-frame" data-seam-text style="${box(f)}">${f.paragraphs.map(para).join('')}</div>`,
      )
      .join('');
    editable = `<div class="ts-home-editable">${pictures}${fills}${logos}${lines}${frames}</div>`;
  }
  const esc = (text: string): string =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const instances = Object.fromEntries(
    Object.entries(slides.instances).map(([instance, v]) => [
      instance,
      { instance, slide: v.slide, html: v.html },
    ]),
  );
  const fills: Record<FillBand, Record<string, string>> = {
    ...slides.bands,
    export: { ...slides.bands.export, 'export-editable': editable },
  };
  const instanceIds = Object.keys(instances);
  const slidesSource = `${GENERATED_HEADER('--slides and --stills', 'docs/LANDING.md 2.0, 2.2, 4.1, 6.1')}
//
// Server only. \`HomeSheet\` and \`HomeHero\` read this module behind \`import.meta.env.SSR\`, which
// the client build folds to false so Rollup drops the module from the route chunk; on the client
// they render the same element with an empty \`dangerouslySetInnerHTML\` and
// \`suppressHydrationWarning\`, which React leaves untouched after hydration. The route chunk must
// never contain \`HOME_SLIDES_SENTINEL\` (row home.budget.bytes-first). It holds the first screen
// alone (docs/LANDING.md 2.0 "Slides"): the hero frame's slide 1 and its filmstrip's nine
// thumbnails; every instance below the first screen is in bands.generated.ts.
import type { HomeSlideId } from './deck.generated';

/** The attribute on the root of every server rendered slide instance (docs/LANDING.md 6.3). */
export const HOME_SLIDES_SENTINEL = 'data-home-slides';

/** The first screen's ten slide instances: the hero frame's slide and its nine thumbnails. */
export type HomeInstanceId =
${instanceIds.map((id) => `  | '${id}'`).join('\n')};

export type HomeSlideInstance = {
  instance: HomeInstanceId;
  slide: HomeSlideId;
  /**
   * \`renderSlide\` output in its stage (\`renderStage\`), appearance neutral: the sheet's
   * \`data-theme\` removed (the page sets the tokens from its appearance), every picture replaced
   * by the page's print, every heading element rewritten to a \`div\` (the page's one h1 is page
   * text), the renderer's block attributes kept, the root carrying \`data-home-slides\`,
   * \`data-slide\`, \`data-instance\` and \`data-counter\`, every selectable block its \`data-object\`.
   */
  html: string;
};

/**
 * One 1 bit still of a field (docs/LANDING.md 2.2): a PNG of the cell grid, one pixel per cell,
 * inlined once as a data URI and drawn as a CSS mask over a box filled with the sheet's ink, so
 * one still serves every appearance and every kit.
 */
export type FieldStill = {
  cols: number;
  rows: number;
  /** data:image/png;base64,... with ink where the print inks */
  ink: string;
  /**
   * Null: the deck's twins draw the same cells in each appearance's ink (their two files are
   * pixel inverses), so no second mask is needed for a dark ground.
   */
  disc: string | null;
};

export type FieldStillPair = { wide: FieldStill; narrow: FieldStill };

export const HOME_SLIDE_HTML: Readonly<Record<HomeInstanceId, HomeSlideInstance>> = ${JSON.stringify(instances, null, 2)};

/**
 * The inlined stills: the Blue Marble on the hero frame's slide 1, 270 by 152 cells at 540 px and
 * 163 by 92 at 326 px.
 */
export const HOME_FIELD_STILLS: Readonly<{ hero: FieldStillPair }> = ${JSON.stringify(fieldStills, null, 2)};

/** The server only stylesheet that gives every field box on the page its still. */
export const HOME_STILLS_CSS: string = ${JSON.stringify(css)};

/** The resting transcript of the recorded run (run.generated.ts), for the hero's terminal. */
export const HOME_HERO_TRANSCRIPT: readonly string[] = ${JSON.stringify(transcript.narrow, null, 2)};
`;
  const bandIds = Object.keys(fills) as FillBand[];
  const bandsHeader = `${GENERATED_HEADER('--slides', 'docs/LANDING.md 2.0, 4.2, 6.1, 6.3')}
//`;
  /* the types every band chunk shares; the markup is one module per chunk (v2.md R2): Rollup
     places a module two dynamic chunks import in a shared chunk of its own, whole */
  const bandsTypes = `${bandsHeader}
// The bands below the first screen (docs/LANDING.md 2.0 "Slides", 4.2): the types of their
// generated markup. The markup itself is one module per band chunk under \`bands/\`, imported only
// by that band's chunk, never by the route or the core, so the document and the route chunk carry
// none of it: \`bands/<band>.generated.ts\` (\`FILLS\`) for ${bandIds.join(', ')}; \`bands/deck.generated.ts\`
// (the nine slides once, for the bands that place their own copies); \`bands/live.generated.ts\`
// (the show's slide 7 and slide 5's two earlier states). Each band's reserved box
// (\`[data-reserve="<band>"]\`) holds empty placeholders \`[data-fill="<key>"]\`, which the band loader
// writes from its chunk's \`FILLS[key]\` before the band starts.

/** The bands whose reserved box the build fills (docs/LANDING.md 6.3). */
export type HomeBandId = ${bandIds.map((b) => `'${b}'`).join(' | ')};

/** A band's placeholders by their \`data-fill\` key: the renderer's markup for each. */
export type BandFills = Readonly<Record<string, string>>;

export type LiveSlides = {
  /** slide 7, the opener field's slide, for the show and the print */
  field: string;
  /** slide 5 after step 1 (the layout's placeholders) and after step 2 (the title written) */
  nextSteps: { placeholders: string; titled: string };
};
`;
  const bandSources: Record<string, string> = {};
  for (const band of bandIds)
    bandSources[band] = `${bandsHeader}
// The ${band} band's placeholders (\`[data-fill]\` in \`[data-reserve="${band}"]\`), imported only by
// its chunk (bands.generated.ts).
import type { BandFills } from '../bands.generated';

export const FILLS: BandFills = ${JSON.stringify(fills[band], null, 2)};
`;
  bandSources['deck'] = `${bandsHeader}
// Every slide of the page deck at rest, once (instance \`slide-<id>\`, counter "n / 9", block and
// object attributes on, pictures as the page's prints), for the bands that place their own copies:
// the miniature editor, the kits grid, the two people's screens and the patterns band.
import type { HomeSlideId } from '../deck.generated';

export const HOME_SLIDE_MARKUP: Readonly<Record<HomeSlideId, string>> = ${JSON.stringify(slides.markup, null, 2)};
`;
  bandSources['live'] = `${bandsHeader}
// The live states (the first pass's live-slides.generated.ts): slide 7 for the show and the
// print (it is in no band's markup), slide 5's two earlier written states for the agents run.
import type { LiveSlides } from '../bands.generated';

export const LIVE_SLIDE_HTML: LiveSlides = ${JSON.stringify({ field: slides.live.field, nextSteps: { placeholders: slides.live.placeholders, titled: slides.live.titled } }, null, 2)};
`;
  return { slides: slidesSource, bands: bandsTypes, bandSources, stillsBytes };
}

// ---------------------------------------------------------------------------------------------
// boot.generated.ts (docs/LANDING.md 2.2, 3.2): V4's scripts/home/boot.ts minifies the script

/** The three visit sentences, in visit order (docs/LANDING.md 2.2; copy.ts HERO.visit, copy.test.ts). */
const VISIT = [
  'Turboslide is a slides editor in the browser.',
  'Turboslide puts one customer name on every slide.',
  'Turboslide downloads PDF and PowerPoint files.',
] as const;

// ---------------------------------------------------------------------------------------------
// icons.generated.css: the key cells' Heroicons as CSS masks (docs/LANDING.md 2.0 "Shape", 2.14)

/**
 * The glyphs the document draws, all as CSS masks so no glyph path sits in the document and no
 * request is made before the first scroll (docs/DESIGN.md 8.0 "Icons"): the first screen's
 * (scripts/home/chrome.ts), the numbers row's and the features rows' (the menu model's own,
 * `deriveNumbers`, `deriveFeatures`), the crumbs' chevron, Version history's author cells and the
 * skipped slide's mark, every one from the editor's table (packages/chrome/src/icons.tsx). The
 * footer's GT mark is the one glyph the editor's table does not hold, from the theme sprite.
 */
const DOCUMENT_ICONS = ['next', 'command-line', 'user-circle', 'eye-slash'] as const;
const THEME_SPRITE_ICONS = ['gt-mark'] as const;
/** A glyph a stylesheet draws on a pseudo element, as a custom property: the external link's. */
const GLYPH_PROPERTIES = { external: 'arrow-up-right' } as const;

function deriveIcons(): string {
  const sprite = SPRITE as Readonly<Record<string, { viewBox: string; body: string }>>;
  const fromTable = [
    ...new Set([
      ...firstScreenIcons(),
      ...deriveNumbers().map((cell) => cell.icon),
      ...deriveFeatures().map((row) => row.icon),
      ...DOCUMENT_ICONS,
    ]),
  ];
  const themeRules = THEME_SPRITE_ICONS.map((name) => {
    const symbol = sprite[name] ?? fail(`the theme sprite has no ${name}`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${symbol.viewBox}">${symbol.body.replace(/>\s+</g, '><')}</svg>`;
    const uri = `data:image/svg+xml,${svg.replace(/"/g, "'").replace(/[<>#%]/g, (c) => encodeURIComponent(c))}`;
    return `.ts-icon[data-icon='${name}'] {\n  --ts-icon: url("${uri}");\n}`;
  });
  const properties = Object.entries(GLYPH_PROPERTIES)
    .map(([prop, name]) => `  --ts-glyph-${prop}: url("${maskUri(name)}");`)
    .join('\n');
  return `/* Generated by scripts/build-home-assets.ts --facts (docs/LANDING.md 2.0 "Shape";
   docs/DESIGN.md 8.0 "Icons"); never edited by hand. The document's glyphs as CSS masks over the
   text's colour, so their paths live in the page's stylesheet and not in the document: the first
   screen's (the navigation's two, the hero frame's title row and toolbar, the steps' done glyph;
   scripts/home/chrome.ts), the numbers row's and the features rows' (the menu model's own), the
   crumbs' chevron and Version history's author cells, every one from the editor's own table
   (packages/chrome/src/icons.tsx, read by scripts/home/icons.ts); the footer's GT mark from
   packages/theme/src/sprite.ts; and the external link's glyph as a custom property. */
.ts-product {
${properties}
}

${[...iconMaskRules(fromTable), ...themeRules].join('\n\n')}
`;
}

// ---------------------------------------------------------------------------------------------
// facts-data.ts (docs/LANDING.md 2.9)

const FACT_COUNT_KEYS = [
  'actions',
  'mcpTools',
  'httpPaths',
  'layouts',
  'materials',
  'checkSteps',
  'parityRows',
] as const;

function countOf(value: unknown, key: string): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  const record = (value ?? {}) as { count?: unknown; total?: unknown };
  const n = typeof record.count === 'number' ? record.count : record.total;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0)
    fail(`${FACTS_PATH}: ${key} is not a positive integer count`);
  return n;
}

/**
 * The features table's where cells and shortcuts (docs/LANDING.md 2.14): each row's place in the
 * editor as the menu model names it and its shortcut as keys.ts prints it on a Mac and elsewhere.
 * The title row's items are named as the editor's title row shows them (Share, Slideshow).
 */
const FEATURE_ITEMS = [
  ['tailor', 'tools.tailor'],
  ['kit', 'slide.changeTheme'],
  ['comments', 'insert.comment'],
  ['versions', 'file.versionHistory.see'],
  ['share', 'title.share'],
  ['presenter', 'title.slideshow.presenterView'],
  ['download', 'file.download'],
  ['pattern', 'insert.shader'],
] as const;

type FeatureFacts = {
  id: string;
  where: string;
  /** the where cell as crumbs (docs/DESIGN.md 8.13) */
  path: string[];
  /** the glyph the editor draws for the row (icons.tsx), the model's own (DESIGN.md 8.13) */
  icon: string;
  mac: string;
  other: string;
  /** the shortcut as keys, one chip each: the Mac symbols, and the other platforms' words */
  macKeys: string[];
  otherKeys: string[];
};

/** A model item's glyph, or its parent's when the row has none (Presenter view under Slideshow). */
function iconOfItem(item: string): string {
  const own = (itemById(item) as { icon?: string }).icon;
  if (own !== undefined) return own;
  const parent = item.slice(0, item.lastIndexOf('.'));
  const up = parent === '' ? undefined : (itemById(parent) as { icon?: string }).icon;
  return up ?? fail(`the menu model draws no glyph for ${item}`);
}

/** A shortcut label as its keys: the Mac symbols one by one, the other form split at its plus signs. */
function keysOf(label: string, mac: boolean): string[] {
  if (label === '') return [];
  return mac ? [...label] : label.split('+');
}

/** The menu bar's glyph and the agent surfaces' glyph, the two rows that are no model item. */
const FEATURE_OWN_ICONS = { menus: 'bars-3', agents: 'command-line' } as const;

function deriveFeatures(): FeatureFacts[] {
  const menus = visibleMenus(DEFAULT_MENU_CONTEXT);
  const first = menus[0]?.label ?? fail('no menus');
  const last = menus[menus.length - 1]?.label ?? fail('no menus');
  const rows = FEATURE_ITEMS.map(([id, item]) => {
    const full = itemPath(item);
    if (full.length === 0) fail(`the menu model has no path for ${item}`);
    const path = full[0] === 'Title row' ? full.slice(1) : full;
    const key = (itemById(item) as { key?: Shortcut }).key;
    const mac = key === undefined ? '' : shortcutLabel(key, 'mac', 'symbols');
    const other = key === undefined ? '' : shortcutLabel(key, 'win', 'symbols');
    return {
      id,
      where: path.join(' > '),
      path,
      icon: iconOfItem(item),
      mac,
      other,
      macKeys: keysOf(mac, true),
      otherKeys: keysOf(other, false),
    };
  });
  const plain = (id: 'menus' | 'agents', where: string): FeatureFacts => ({
    id,
    where,
    path: [where],
    icon: FEATURE_OWN_ICONS[id],
    mac: '',
    other: '',
    macKeys: [],
    otherKeys: [],
  });
  return [
    plain('menus', `${first} to ${last}`),
    ...rows,
    plain('agents', 'The CLI, the MCP server and the HTTP API'),
  ];
}

/**
 * The numbers row's cells (docs/DESIGN.md 8.3): each figure's glyph and its place in the editor
 * as a menu path read from the menu model; the actions cell has no path, its chips are the CLI's,
 * the MCP server's and the HTTP API's counts.
 */
const NUMBER_ITEMS = [
  ['actions', null, 'command-line'],
  ['layouts', 'slide.applyLayout', 'squares-2x2'],
  ['patterns', 'insert.shader', 'cube'],
  ['shapes', 'insert.shape', 'square-2-stack'],
] as const;

function deriveNumbers(): { id: string; icon: string; path: string[] }[] {
  return NUMBER_ITEMS.map(([id, item, icon]) => {
    if (item === null) return { id, icon, path: [] };
    const path = itemPath(item);
    if (path.length === 0) fail(`the menu model has no path for ${item}`);
    return { id, icon, path };
  });
}

function deriveFacts(): string {
  const bytes = new Uint8Array(readFileSync(resolve(ROOT, FACTS_PATH)));
  const facts = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  const counts = Object.fromEntries(FACT_COUNT_KEYS.map((key) => [key, countOf(facts[key], key)]));
  const mismatch = (facts['export'] as { worstPageMismatchPercent?: unknown } | undefined)
    ?.worstPageMismatchPercent;
  const licence = (facts['licence'] as { name?: unknown } | undefined)?.name;
  if (typeof mismatch !== 'number' || mismatch <= 0)
    fail(`${FACTS_PATH}: export.worstPageMismatchPercent is not a positive number`);
  if (typeof licence !== 'string' || licence === '') fail(`${FACTS_PATH}: licence.name is missing`);
  const data = {
    factsSha256: sha256(bytes),
    ...counts,
    shapes: countOf(facts['shapePresets'], 'shapePresets'),
    menus: visibleMenus(DEFAULT_MENU_CONTEXT).length,
    cliCommands: readJson<{ actions: unknown[] }>(CLI_JSON).actions.length,
    mismatchPercent: mismatch,
    licence,
    features: deriveFeatures(),
    numbers: deriveNumbers(),
  };
  return `${GENERATED_HEADER('--facts', 'docs/LANDING.md 2.9; gslides-parity SPEC-4 0.25')}
//
// The counts the /home page states, copied from packages/theme/brand/facts.json (B1's file) so
// the page's JavaScript carries these values and not the file's measured rows; \`menus\` is
// \`visibleMenus(DEFAULT_MENU_CONTEXT).length\` of packages/chrome/src/menus/model.ts,
// \`cliCommands\` the length of packages/agent/generated/cli.json \`actions\`, and \`features\` the
// features table's where cells and shortcuts (the menu model's paths, keys.ts's Mac and other forms).
export const FACTS_DATA = ${JSON.stringify(data, null, 2)} as const;
`;
}

// ---------------------------------------------------------------------------------------------
// assets.json and assets.ts

async function deriveServed(
  stills: Stills,
  exportRec: RecordedExport | null,
  patternFiles: Awaited<ReturnType<typeof derivePattern>>['files'],
  loupeFiles: Awaited<ReturnType<typeof deriveLoupe>>['files'],
): Promise<{ assets: ServedAsset[]; files: { name: string; bytes: Uint8Array }[] }> {
  const made = [
    await served('lighthouse-still', null, 'wide', await bitsWebp(stills.canvas.wide), 'webp'),
    await served('lighthouse-still', null, 'narrow', await bitsWebp(stills.canvas.narrow), 'webp'),
    await served('lighthouse-tone', null, null, stills.canvasTone, 'jpg'),
    await served('field-still', null, 'wide', await bitsWebp(stills.field), 'webp'),
    ...(await Promise.all(
      patternFiles.map((file) =>
        served(file.role, file.appearance, file.variant, file.bytes, file.ext),
      ),
    )),
    ...(await Promise.all(
      loupeFiles.map((file) => served(file.role, file.appearance, null, file.bytes, 'webp')),
    )),
    await served('glyphs', null, null, new TextEncoder().encode(deriveSprite()), 'svg'),
  ];
  const budgets: Partial<Record<AssetRole, number>> = {
    'lighthouse-still': 24_000,
    'lighthouse-tone': 26_000,
    'field-still': 24_000,
    'pattern-still': 48_000,
    'pattern-mask': 48_000,
    'export-browser': 60_000,
    glyphs: 48_000,
  };
  for (const m of made) {
    const limit = budgets[m.asset.role];
    if (limit !== undefined && m.asset.bytes > limit)
      fail(`${m.asset.path} is ${m.asset.bytes} B, over ${limit}`);
  }
  const assets = [...made.map((m) => m.asset), ...(exportRec?.assets ?? [])];
  return {
    assets,
    files: made.map((m) => ({ name: m.asset.path.slice(URL_PREFIX.length + 1), bytes: m.bytes })),
  };
}

function assetsSources(
  assets: ServedAsset[],
  loupe: Awaited<ReturnType<typeof deriveLoupe>>['loupe'],
): { json: string; ts: string } {
  const json = jsonText({
    generator: 'scripts/build-home-assets.ts --stills --export',
    assets,
    /* the whole slide's differing pixels between the browser raster and the Perfect picture (2.12) */
    loupe,
  });
  const ts = `${GENERATED_HEADER('--stills and --export', 'docs/LANDING.md 2.6, 2.8, 4.1, 6.1')}
// assets.json is its JSON twin; assets.test.ts checks every file under public/home/ against it.

export type HomeAppearance = 'light' | 'dark';

/** What a file under public/home/ is (integrator.md section 6, with Kevin's answer 1). */
export type HomeAssetRole =
  /** slide 6's dithered picture (the Louisbourg lighthouse) as a two colour lossless WebP mask, at most 24 KB */
  | 'lighthouse-still'
  /** the lighthouse's tone map, a 512 by 288 grey JPEG, at most 26 KB, one for both appearances */
  | 'lighthouse-tone'
  /** slide 7's dithered picture (the opener field), requested only by the show and the print */
  | 'field-still'
  /** slide 8's still frame: the exporter's capture of the pattern, lossless WebP, at most 48 KB (V4's) */
  | 'pattern-still'
  /** the still frame's dots as one mask for both appearances, which the show, the print and the miniature draw in the slide's ink, at most 48 KB */
  | 'pattern-mask'
  /** slide 7's picture part from the Perfect file, at most 60 KB */
  | 'export-perfect'
  /** the Editable text file's picture part for slide 7, at most 32 KB */
  | 'export-editable'
  /** the CLI's browser render of slide 7 at scale 2, lossless WebP, at most 60 KB (the loupe, V3's) */
  | 'export-browser'
  /** the page deck's PDF, 9 pages, requested only on the click of Download the PDF */
  | 'pdf'
  /** the glyphs below the first screen: one SVG sprite of icons.tsx's symbols (scripts/home/sprite.ts), at most 48 KB */
  | 'glyphs';

/** A still's grid: \`wide\` at 2 px cells on the 1,024 px sheet, \`narrow\` on the 358 px sheet. */
export type HomeAssetVariant = 'wide' | 'narrow';

export type HomeAsset = {
  role: HomeAssetRole;
  /** null for a file both appearances share (a still is a mask in the sheet's ink) */
  appearance: HomeAppearance | null;
  variant: HomeAssetVariant | null;
  /** the served path, content hashed: /home/<role>-<hash>.<ext> */
  path: string;
  bytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  /** sha256 of the decoded pixels (RGBA, row major); null for a PDF and the glyph sprite */
  pixelsSha256: string | null;
  /** an export picture: sha256 of the part inside the file it was read from */
  partSha256: string | null;
  /** a PDF's page count */
  pages: number | null;
};

export const HOME_ASSETS: readonly HomeAsset[] = ${JSON.stringify(assets, null, 2)};

/** The file of a role in an appearance (and a variant); throws when the build has not written it. */
export function homeAsset(
  role: HomeAssetRole,
  appearance: HomeAppearance | null,
  variant: HomeAssetVariant | null = null,
): HomeAsset {
  const found = HOME_ASSETS.find(
    (asset) =>
      asset.role === role &&
      (asset.appearance === null || asset.appearance === appearance) &&
      (variant === null || asset.variant === variant),
  );
  if (found === undefined) throw new RangeError(\`no /home asset for \${role} (\${appearance})\`);
  return found;
}

/** Every file of a role, in the build's order (the Editable text file's pictures by index). */
export function homeAssets(role: HomeAssetRole, appearance: HomeAppearance | null): HomeAsset[] {
  return HOME_ASSETS.filter((asset) => asset.role === role && asset.appearance === appearance);
}
`;
  return { json, ts };
}

// ---------------------------------------------------------------------------------------------
// The derivation, the write and the check

type Output = { path: string; content: string | Uint8Array };

async function formatTs(path: string, source: string): Promise<string> {
  const options = (await prettier.resolveConfig(resolve(ROOT, path))) ?? {};
  return prettier.format(source, { ...options, filepath: resolve(ROOT, path) });
}

async function derive(): Promise<{ outputs: Output[]; served: Set<string>; report: string[] }> {
  if (!existsSync(resolve(ROOT, RECORDED, 'run.json')))
    fail(`${RECORDED}/run.json is missing; run --run`);
  const exportPath = resolve(ROOT, RECORDED, 'export.json');
  const exportRec = existsSync(exportPath)
    ? readJson<RecordedExport>(`${RECORDED}/export.json`)
    : null;
  if (exportRec !== null && exportRec.pageDeckSha256 !== pageDeckSha256())
    fail(`${RECORDED}/export.json was read from another page deck; run --export`);
  const stills = await deriveStills();
  const page = loadPageDeck();
  const slides = deriveSlides();
  const pattern = await derivePattern();
  const chips = await deriveChips();
  const loupe = await deriveLoupe();
  const { assets, files } = await deriveServed(stills, exportRec, pattern.files, loupe.files);
  const run = deriveRun({ pageDeck: page });
  const slideSources = await deriveSlidesSource(slides, stills, exportRec, assets, run.transcript);
  const assetSources = assetsSources(assets, loupe.loupe);
  const outputs: Output[] = [
    { path: `${FIXTURE}/assets/field-light.png`, content: stills.fieldPicture.light },
    { path: `${FIXTURE}/assets/field-dark.png`, content: stills.fieldPicture.dark },
    {
      path: `${HOME}/deck.generated.ts`,
      content: await formatTs(
        `${HOME}/deck.generated.ts`,
        deriveDeckFacts(
          page,
          exportRec,
          Math.round(run.totalMs / 1000),
          chips.loopMs,
          chips.stepMs,
        ),
      ),
    },
    {
      path: `${HOME}/slides.generated.ts`,
      content: await formatTs(`${HOME}/slides.generated.ts`, slideSources.slides),
    },
    {
      path: `${HOME}/bands.generated.ts`,
      content: await formatTs(`${HOME}/bands.generated.ts`, slideSources.bands),
    },
    ...(await Promise.all(
      Object.entries(slideSources.bandSources).map(async ([band, source]) => ({
        path: `${HOME}/bands/${band}.generated.ts`,
        content: await formatTs(`${HOME}/bands/${band}.generated.ts`, source),
      })),
    )),
    {
      path: `${HOME}/run.generated.ts`,
      content: await formatTs(`${HOME}/run.generated.ts`, run.source),
    },
    {
      path: `${HOME}/boot.generated.ts`,
      content: await formatTs(`${HOME}/boot.generated.ts`, deriveBoot(VISIT)),
    },
    {
      path: `${HOME}/chips.generated.ts`,
      content: await formatTs(`${HOME}/chips.generated.ts`, chips.source),
    },
    {
      path: `${HOME}/loop.generated.ts`,
      content: await formatTs(`${HOME}/loop.generated.ts`, chips.loopSource),
    },
    {
      path: `${HOME}/pattern.generated.ts`,
      content: await formatTs(`${HOME}/pattern.generated.ts`, pattern.source),
    },
    {
      path: `${HOME}/menus.generated.ts`,
      content: await formatTs(`${HOME}/menus.generated.ts`, deriveMenus()),
    },
    {
      path: `${HOME}/facts-data.ts`,
      content: await formatTs(`${HOME}/facts-data.ts`, deriveFacts()),
    },
    {
      path: `${HOME}/chrome.generated.ts`,
      content: await formatTs(
        `${HOME}/chrome.generated.ts`,
        deriveEditorChrome(GENERATED_HEADER('--slides', 'docs/DESIGN.md 8.2')),
      ),
    },
    {
      path: `${HOME}/sprite.generated.ts`,
      content: await formatTs(
        `${HOME}/sprite.generated.ts`,
        deriveSpriteModule(
          GENERATED_HEADER('--slides', 'docs/DESIGN.md 8.0, 8.4'),
          assets.find((a) => a.role === 'glyphs')?.path ?? fail('the glyph sprite was not made'),
        ),
      ),
    },
    {
      path: `${HOME}/menu-glyphs.generated.ts`,
      content: await formatTs(
        `${HOME}/menu-glyphs.generated.ts`,
        deriveMenuGlyphsModule(GENERATED_HEADER('--slides', 'docs/DESIGN.md 8.4')),
      ),
    },
    {
      path: `${HOME}/icons.generated.css`,
      content: await formatTs(`${HOME}/icons.generated.css`, deriveIcons()),
    },
    { path: `${HOME}/assets.ts`, content: await formatTs(`${HOME}/assets.ts`, assetSources.ts) },
    { path: `${HOME}/assets.json`, content: assetSources.json },
    ...files.map((f) => ({ path: `${PUBLIC_DIR}/${f.name}`, content: f.bytes })),
  ];
  const served = new Set(assets.map((a) => a.path.slice(URL_PREFIX.length + 1)));
  const report = [
    `${INSTANCES.length} slide instances, ${slideSources.stillsBytes} B of inlined stills, ${assets.length} served files`,
    `the run: ${Math.round(run.totalMs)} ms in all`,
    exportRec === null
      ? 'no export recorded yet (--export)'
      : `export read from page deck ${exportRec.pageDeckSha256.slice(0, 12)}`,
  ];
  return { outputs, served, report };
}

/**
 * Every file under /home/ the page's sources name (docs/DESIGN.md 8.0 "Pictures load", C14): a
 * path written in a component, a live module, a generated module or a stylesheet of the landing.
 * The check fails when one is not in assets.json or not on disk, so no picture on /home can name a
 * file the build did not write (the broken picture of Kevin's screenshot 4).
 */
const REFERENCE =
  /["'(\s]\/home\/([A-Za-z0-9][A-Za-z0-9._-]*\.(?:webp|jpe?g|png|svg|pdf|avif|gif))/g;

function referencedHomeFiles(): Map<string, string> {
  const sources = [
    ...filesUnder(HOME).filter((f) => /\.(tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f)),
    'apps/studio/src/routes/home.tsx',
    'apps/studio/src/routes/home.css',
  ];
  const named = new Map<string, string>();
  for (const file of sources) {
    const text = readFileSync(resolve(ROOT, file), 'utf8');
    for (const match of text.matchAll(REFERENCE)) {
      const name = match[1] ?? '';
      if (!named.has(name)) named.set(name, file);
    }
  }
  return named;
}

function checkReferences(served: Set<string>): number {
  const named = referencedHomeFiles();
  for (const [name, source] of named) {
    if (!served.has(name)) fail(`${source} names /home/${name}, which assets.json does not list`);
    if (!existsSync(resolve(ROOT, PUBLIC_DIR, name)))
      fail(`${source} names /home/${name}, which is missing under ${PUBLIC_DIR}`);
  }
  return named.size;
}

function same(a: string | Uint8Array, b: Uint8Array): boolean {
  const left = typeof a === 'string' ? new TextEncoder().encode(a) : a;
  return left.length === b.length && Buffer.compare(Buffer.from(left), Buffer.from(b)) === 0;
}

async function writeAll(): Promise<void> {
  const { outputs, served, report } = await derive();
  /* the fixture's field pictures first: the page deck's sha256 covers them, so a change re-derives */
  let changed = 0;
  for (const out of outputs) {
    const file = resolve(ROOT, out.path);
    if (existsSync(file) && same(out.content, new Uint8Array(readFileSync(file)))) continue;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, out.content);
    changed += 1;
  }
  const dir = resolve(ROOT, PUBLIC_DIR);
  for (const name of readdirSync(dir))
    if (!name.startsWith('.') && !served.has(name)) {
      rmSync(join(dir, name));
      changed += 1;
    }
  const named = checkReferences(served);
  console.log(
    `build-home-assets: ${changed} files written or removed; ${named} files named by the page's sources, each in assets.json; ${report.join('; ')}`,
  );
}

async function checkAll(): Promise<void> {
  if (!existsSync(resolve(ROOT, RECORDED, 'export.json')))
    fail(`${RECORDED}/export.json is missing; run --export`);
  const { outputs, served, report } = await derive();
  for (const out of outputs) {
    const file = resolve(ROOT, out.path);
    if (!existsSync(file)) fail(`${out.path} is missing; rebuild`);
    if (!same(out.content, new Uint8Array(readFileSync(file))))
      fail(`${out.path} differs from its sources; rebuild`);
  }
  const assets = readJson<{ assets: ServedAsset[] }>(`${HOME}/assets.json`).assets;
  for (const asset of assets) {
    const file = resolve(ROOT, PUBLIC_DIR, asset.path.slice(URL_PREFIX.length + 1));
    if (!existsSync(file)) fail(`${asset.path} is missing under ${PUBLIC_DIR}`);
    const bytes = new Uint8Array(readFileSync(file));
    if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256)
      fail(`${asset.path} differs from assets.json`);
    if (asset.pixelsSha256 !== null && (await pixelsSha256(bytes)) !== asset.pixelsSha256)
      fail(`${asset.path} decodes to other pixels than assets.json records`);
  }
  for (const name of readdirSync(resolve(ROOT, PUBLIC_DIR)))
    if (!name.startsWith('.') && !served.has(name))
      fail(`${PUBLIC_DIR}/${name} is not in assets.json`);
  const named = checkReferences(served);
  console.log(
    `build-home-assets --check: ${outputs.length} outputs match their sources; ${named} files named by the page's sources, each in assets.json and on disk; ${report.join('; ')}`,
  );
}

async function writeFieldPictures(): Promise<void> {
  for (const [theme, bytes] of Object.entries(await fieldPictures())) {
    const file = resolve(ROOT, FIXTURE, `assets/field-${theme}.png`);
    if (!existsSync(file) || !same(bytes, new Uint8Array(readFileSync(file))))
      writeFileSync(file, bytes);
  }
}

async function main(argv: string[]): Promise<void> {
  const flags = new Set(argv);
  const known = ['--run', '--export', '--slides', '--stills', '--boot', '--facts', '--check'];
  for (const flag of flags)
    if (!known.includes(flag)) fail(`unknown flag ${flag}; the flags are ${known.join(' ')}`);
  if (flags.size === 0) fail(`name a mode: ${known.join(' ')}`);
  if (flags.has('--check')) {
    await checkAll();
    return;
  }
  /* the fixture's field pictures come first: the run records the fixture's sha256 with them */
  await writeFieldPictures();
  if (flags.has('--run')) {
    runMode();
    /* V3's recordings: the save before the run, the hero's loop, the chips (scripts/home/run.ts) */
    recordChips();
  }
  if (flags.has('--export')) await exportMode();
  await writeAll();
}

await main(process.argv.slice(2));
