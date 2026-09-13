// The agent parity walk of the Google Slides parity round two (docs/gslides-parity/MILESTONES-2.md
// B1 acceptance): every new action of SPEC-2 section 3 through `turboslide <command> --json` on a
// temp copy of the fixture deck decks/fixture/gslides, the deck validating after each write. The
// slides here are canvas slides already, so no command opens a browser; the conversion itself is
// canvas.test.ts. Every GS2 action id is named so the coverage test finds it: slide.toCanvas,
// deck.guides, slide.setBackground, deck.setBackground, block.group, block.ungroup, block.regroup,
// block.rotate, block.flip, block.crop, block.mask, block.resetImage, block.adjust, block.setAlt,
// block.shadow, block.autofit, text.style, text.case, text.insert, text.list, text.spacing,
// text.columns, text.indent, chart.setData, chart.setKind, table.merge, table.unmerge,
// table.insertRows, table.insertColumns, table.deleteRows, table.deleteColumns, table.distribute,
// table.cellStyle, shape.set, line.set, diagram.insert; MCP names deck_slide_to_canvas,
// deck_set_guides, deck_set_slide_background, deck_set_background, deck_group_blocks,
// deck_ungroup_blocks, deck_regroup_blocks, deck_rotate_blocks, deck_flip_blocks, deck_crop_image,
// deck_mask_image, deck_reset_image, deck_adjust_image, deck_set_alt, deck_set_shadow,
// deck_set_autofit, deck_style_text, deck_set_text_case, deck_insert_text, deck_set_list,
// deck_set_spacing, deck_set_columns, deck_set_indent, deck_set_chart_data, deck_set_chart_kind,
// deck_merge_cells, deck_unmerge_cells, deck_insert_rows, deck_insert_columns, deck_delete_rows,
// deck_delete_columns, deck_distribute_table, deck_style_cells, deck_set_shape, deck_set_line,
// deck_insert_diagram.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { ACTIONS, ACTION_IDS } from '@turboslide/schema/actions';
import type { Block, ShapeBlock } from '@turboslide/schema/blocks';
import { connectorEnds, siteAt } from '@turboslide/schema/connect';
import type { Deck, Slide } from '@turboslide/schema/deck';

import { runCli } from '../cli.ts';

type Run = { code: number; stdout: string; stderr: string; json: unknown };
type SlideResult = { slide: Slide; revision: number };

const REPO = join(import.meta.dirname, '..', '..', '..', '..');
const FIXTURE = join(REPO, 'decks', 'fixture', 'gslides');

let root: string;
let deckDir: string;

async function run(argv: string[], stdin = ''): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli([...argv, '--deck', deckDir], {
    cwd: root,
    env: { USER: 'kevin' },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => stdin,
  });
  let json: unknown;
  if (argv.includes('--json') && stdout.trim() !== '') json = JSON.parse(stdout) as unknown;
  return { code, stdout, stderr, json };
}

/** One write of the walk: exit 0, a slide result, and the deck validating after it. */
async function write(argv: string[], stdin = ''): Promise<SlideResult> {
  const r = await run([...argv, '--json'], stdin);
  expect(r.code, `${argv.join(' ')}: ${r.stderr}`).toBe(0);
  const ok = await run(['validate', deckDir, '--json']);
  expect(ok.code, `${argv.join(' ')} left the deck invalid: ${ok.stdout}`).toBe(0);
  return r.json as SlideResult;
}

function slideFile(id: string): Slide {
  return JSON.parse(readFileSync(join(deckDir, 'slides', `${id}.json`), 'utf8')) as Slide;
}
function manifest(): Deck {
  return JSON.parse(readFileSync(join(deckDir, 'deck.json'), 'utf8')) as Deck;
}

function blocks(slide: Slide): Block[] {
  if (slide.kind !== 'content') return [];
  return Object.values(slide.slots).flat();
}

/** A block by id, read as the shape the assertion needs. */
function block<T = Block>(slide: Slide, id: string): T {
  const found = blocks(slide).find((b) => b.id === id);
  if (found === undefined) throw new Error(`no block ${id} on ${slide.id}`);
  return found as unknown as T;
}

describe('the agent parity walk over the fixture deck', () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-walk-'));
    deckDir = join(root, 'decks', 'gslides');
    mkdirSync(join(deckDir, 'slides'), { recursive: true });
    mkdirSync(join(deckDir, 'assets'), { recursive: true });
    writeFileSync(join(deckDir, 'deck.json'), readFileSync(join(FIXTURE, 'deck.json')));
    for (const file of readdirSync(join(FIXTURE, 'slides')))
      writeFileSync(join(deckDir, 'slides', file), readFileSync(join(FIXTURE, 'slides', file)));
    for (const file of readdirSync(join(FIXTURE, 'assets')))
      writeFileSync(join(deckDir, 'assets', file), readFileSync(join(FIXTURE, 'assets', file)));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('every GS2 action has a CLI usage whose command is registered, or a window transport only', () => {
    const gs2 = ACTION_IDS.filter((id) => ACTIONS[id].milestone === 'GS2');
    expect(gs2).toHaveLength(36);
    for (const id of gs2) {
      const spec = ACTIONS[id];
      if (!spec.transports.includes('cli')) continue;
      expect(spec.cli?.usage, id).toMatch(/^turboslide /);
      expect(spec.mcp, id).toMatch(/^deck_/);
    }
  });

  test('arrange: rotate, flip, group, ungroup, regroup', async () => {
    const rotated = await write(['block', 'rotate', 'rotated#tilted', '--by', '90']);
    expect(block(rotated.slide, 'tilted').pos?.rotate).toBe(127);
    const to = await write(['block', 'rotate', 'rotated#tilted', '--to', '37']);
    expect(block(to.slide, 'tilted').pos?.rotate).toBe(37);
    const flipped = await write(['block', 'flip', 'rotated#arrow', '--axis', 'h']);
    expect(block(flipped.slide, 'arrow').pos?.flip).toBeUndefined();
    const back = await write(['block', 'flip', 'rotated#arrow', '--axis', 'h']);
    expect(block(back.slide, 'arrow').pos?.flip).toBe('h');
    const grouped = await write([
      'block',
      'group',
      'shapes',
      '--blocks',
      'hex,right',
      '--as',
      'pair',
    ]);
    expect(block(grouped.slide, 'hex').pos?.group).toBe('pair');
    expect(block(grouped.slide, 'right').pos?.group).toBe('pair');
    const ungrouped = await write(['block', 'ungroup', 'shapes', '--group', 'pair']);
    expect(block(ungrouped.slide, 'hex').pos?.group).toBeUndefined();
    const regrouped = await write([
      'block',
      'regroup',
      'shapes',
      '--blocks',
      'hex,right',
      '--as',
      'pair',
    ]);
    expect(block(regrouped.slide, 'right').pos?.group).toBe('pair');
    // a rotation about the selection moves the members about the union centre on half pixels
    const together = await write([
      'block',
      'rotate',
      'grouped#s1,s2,s3,label',
      '--by',
      '3',
      '--about',
      'selection',
    ]);
    for (const id of ['s1', 's2', 's3', 'label']) {
      const pos = block(together.slide, id).pos!;
      expect(pos.rotate).toBe(3);
      expect(pos.x * 2).toBe(Math.round(pos.x * 2));
    }
  });

  test('guides and backgrounds', async () => {
    expect(manifest().guides).toEqual({ x: [800], y: [450] });
    await write(['deck', 'guides', '--add-horizontal', '300']);
    expect(manifest().guides).toEqual({ x: [800], y: [300, 450] });
    await write(['deck', 'guides', '--remove-horizontal', '300']);
    await write(['deck', 'guides', '--clear']);
    expect(manifest().guides).toBeUndefined();
    await write(['deck', 'guides', '--set', '{"x":[800],"y":[450]}']);
    expect(manifest().guides).toEqual({ x: [800], y: [450] });
    await write(['slide', 'background', 'styles', '--color', 'plate']);
    expect(slideFile('styles').background).toEqual({ color: 'plate' });
    await write(['slide', 'background', 'styles', '--off']);
    expect(slideFile('styles').background).toBeUndefined();
    await write(['deck', 'background', '--color', 'plate']);
    expect(manifest().defaults?.background).toEqual({ color: 'plate' });
    await write(['deck', 'background', '--off']);
    expect(manifest().defaults?.background).toBeUndefined();
  });

  test('text: style, case, insert, list, spacing, columns, indent', async () => {
    const styled = await write([
      'text',
      'style',
      'styles#p1',
      '/text',
      '--range',
      '0:5',
      '--italic',
      '--color',
      'red',
    ]);
    expect(block<{ text: string }>(styled.slide, 'p1').text.startsWith('[A run]{i c:red} in')).toBe(
      true,
    );
    const upper = await write(['text', 'case', 'styles#p1', '/text', '--range', '0:5', 'upper']);
    expect(block<{ text: string }>(upper.slide, 'p1').text.startsWith('[A RUN]{i c:red}')).toBe(
      true,
    );
    const inserted = await write(['text', 'insert', 'styles#p1', '/text', '--at', '2', '→']);
    expect(block<{ text: string }>(inserted.slide, 'p1').text.startsWith('[A →RUN]{i c:red}')).toBe(
      true,
    );
    const list = await write([
      'text',
      'list',
      'bullets#bullets',
      '--marker',
      'bullet',
      '--level',
      '4',
      '--items',
      '0',
    ]);
    expect(block<{ items: { level?: number }[] }>(list.slide, 'bullets').items[0]?.level).toBe(4);
    const preset = await write([
      'text',
      'list',
      'bullets#numbers',
      '--marker',
      'number',
      '--preset',
      'digit-nested',
    ]);
    expect(block<{ preset?: string }>(preset.slide, 'numbers').preset).toBe('digit-nested');
    const spaced = await write([
      'text',
      'spacing',
      'spacing#indented',
      '--line',
      '1.5',
      '--before',
      '8',
      '--after',
      '8',
    ]);
    expect(
      block<{ typography?: Record<string, unknown> }>(spaced.slide, 'indented').typography,
    ).toMatchObject({
      leading: 1.5,
      spaceBefore: 8,
      spaceAfter: 8,
    });
    const columns = await write(['text', 'columns', 'spacing#indented', '2']);
    expect(
      block<{ typography?: Record<string, unknown> }>(columns.slide, 'indented').typography?.[
        'columns'
      ],
    ).toBe(2);
    const indented = await write(['text', 'indent', 'spacing#indented', '--in']);
    expect(
      block<{ typography?: Record<string, unknown> }>(indented.slide, 'indented').typography?.[
        'indent'
      ],
    ).toBe(128);
  });

  test('chart and table', async () => {
    const data = JSON.stringify({
      categories: ['A', 'B', 'C'],
      series: [
        { name: 'First', values: [3, 5, 2] },
        { name: 'Second', values: [1, 4, 4], color: 'ink-2' },
      ],
    });
    const chart = await write(['chart', 'set-data', 'chart-line#chart'], data);
    expect(block<{ series: unknown[] }>(chart.slide, 'chart').series).toHaveLength(2);
    const pie = await write(['chart', 'set-kind', 'chart-line#chart', 'pie']);
    expect(block<{ kind: string; series: unknown[] }>(pie.slide, 'chart')).toMatchObject({
      kind: 'pie',
    });
    expect(block<{ series: unknown[] }>(pie.slide, 'chart').series).toHaveLength(1);
    type Table = {
      rows: { cells: string[]; height?: number }[];
      columns: unknown[];
      spans?: unknown[];
      cells?: unknown[];
    };
    const merged = await write(['table', 'merge', 'table#table', '--from', '2,1', '--to', '3,2']);
    expect(block<Table>(merged.slide, 'table').spans).toEqual([
      { row: 2, column: 1, rows: 2, columns: 2 },
    ]);
    const unmerged = await write(['table', 'unmerge', 'table#table', '--at', '2,1']);
    expect(block<Table>(unmerged.slide, 'table').spans).toBeUndefined();
    const rows = await write(['table', 'insert-rows', 'table#table', '--at', '1', '--count', '1']);
    expect(block<Table>(rows.slide, 'table').rows).toHaveLength(5);
    const cols = await write(['table', 'insert-columns', 'table#table', '--at', '1', '--right']);
    expect(block<Table>(cols.slide, 'table').columns).toHaveLength(5);
    const fewerRows = await write(['table', 'delete-rows', 'table#table', '--from', '1']);
    expect(block<Table>(fewerRows.slide, 'table').rows).toHaveLength(4);
    const fewerCols = await write(['table', 'delete-columns', 'table#table', '--from', '4']);
    expect(block<Table>(fewerCols.slide, 'table').columns).toHaveLength(4);
    const distributed = await write([
      'table',
      'distribute',
      'table#table',
      'rows',
      '--total',
      '240',
    ]);
    expect(block<Table>(distributed.slide, 'table').rows.map((row) => row.height)).toEqual([
      60, 60, 60, 60,
    ]);
    const styled = await write([
      'table',
      'cell-style',
      'table#table',
      '--at',
      '0,0;1,1',
      '--border-weight',
      '0',
      '--fill',
      'plate',
    ]);
    expect(block<Table>(styled.slide, 'table').cells).toEqual([
      { row: 0, column: 0, fill: 'plate', border: { weight: 0 } },
      { row: 1, column: 1, fill: 'plate', border: { weight: 0 } },
    ]);
  });

  test('shape and line, with a connector following its target', async () => {
    const shape = await write([
      'shape',
      'set',
      'shapes#dashed',
      '--kind',
      'hexagon',
      '--dash',
      'dot',
    ]);
    expect(block<ShapeBlock>(shape.slide, 'dashed')).toMatchObject({
      shape: 'hexagon',
      dash: 'dot',
    });
    const ends = await write(['line', 'set', 'lines#decorated', '--end', 'fillArrow']);
    expect(block<ShapeBlock>(ends.slide, 'decorated').lineEnd).toBe('fillArrow');
    const attached = await write(['line', 'set', 'lines#curved', '--connect-end', 'b:2']);
    let curved = block<ShapeBlock>(attached.slide, 'curved');
    let b = block(attached.slide, 'b');
    const site = siteAt(b, 2)!;
    const onSite = Object.values(connectorEnds(curved)).some(
      (point) => Math.abs(point.x - site.x) <= 1 && Math.abs(point.y - site.y) <= 1,
    );
    expect(onSite).toBe(true);
    // the target moves; the attached end follows in the same write (SPEC-2 2.4.7)
    const moved = await write([
      'block',
      'set',
      'lines#b',
      '/pos',
      '{"x":760,"y":540,"w":240,"h":120,"z":3}',
    ]);
    curved = block<ShapeBlock>(moved.slide, 'curved');
    b = block(moved.slide, 'b');
    const movedSite = siteAt(b, 2)!;
    expect(movedSite).toEqual({ x: 880, y: 660 });
    const followed = Object.values(connectorEnds(curved)).some(
      (point) => Math.abs(point.x - movedSite.x) <= 1 && Math.abs(point.y - movedSite.y) <= 1,
    );
    expect(followed).toBe(true);
    // the fixture's elbow stays on its sites too
    const elbow = block<ShapeBlock>(moved.slide, 'elbow');
    const a = block(moved.slide, 'a');
    expect(connectorEnds(elbow).start).toEqual(siteAt(a, 3));
    expect(connectorEnds(elbow).end).toEqual(siteAt(b, 1));
    const detached = await write(['line', 'set', 'lines#curved', '--detach', 'both']);
    expect(block<ShapeBlock>(detached.slide, 'curved').connect).toBeUndefined();
  });

  test('pictures: crop, mask, adjust, reset, alt, shadow', async () => {
    type Picture = {
      trim?: unknown;
      mask?: string;
      adjust?: unknown;
      alt?: string;
      shadow?: unknown;
    };
    const cropped = await write([
      'block',
      'crop',
      'image-tools#masked',
      '--left',
      '0.1',
      '--right',
      '0.1',
      '--top',
      '0.1',
      '--bottom',
      '0.1',
    ]);
    expect(block<Picture>(cropped.slide, 'masked').trim).toEqual({
      left: 0.1,
      right: 0.1,
      top: 0.1,
      bottom: 0.1,
    });
    const masked = await write(['block', 'mask', 'image-tools#trimmed', 'ellipse']);
    expect(block<Picture>(masked.slide, 'trimmed').mask).toBe('ellipse');
    const unmasked = await write(['block', 'mask', 'image-tools#trimmed', '--off']);
    expect(block<Picture>(unmasked.slide, 'trimmed').mask).toBeUndefined();
    const adjusted = await write([
      'block',
      'adjust',
      'image-tools#masked',
      '--brightness',
      '0.3',
      '--contrast',
      '0.1',
    ]);
    expect(block<Picture>(adjusted.slide, 'masked').adjust).toEqual({
      brightness: 0.3,
      contrast: 0.1,
    });
    const reset = await write(['block', 'reset-image', 'image-tools#adjusted']);
    const fresh = block<Picture>(reset.slide, 'adjusted');
    expect(fresh.adjust).toBeUndefined();
    expect(fresh.trim).toBeUndefined();
    // 'block.setAlt' writes the description on the block (a shape) or on the asset (a picture)
    const alt = await write(['block', 'alt', 'shapes#hex', 'A hexagon with a label']);
    expect(block<Picture>(alt.slide, 'hex').alt).toBe('A hexagon with a label');
    const shadow = await write(['block', 'shadow', 'shapes#plus', '--on', '--distance', '10']);
    expect(block<Picture>(shadow.slide, 'plus').shadow).toEqual({ distance: 10 });
    const noShadow = await write(['block', 'shadow', 'shapes#plus', '--off']);
    expect(block<Picture>(noShadow.slide, 'plus').shadow).toBeUndefined();
  });

  test('fitting and padding', async () => {
    type Fitted = { autofit?: string; valign?: string; padding?: unknown };
    // Do not autofit is a written state (AUTOFITS 'none'), so the fixture's grow box records it
    const grow = await write(['block', 'autofit', 'canvas-title#grow', 'none']);
    expect(block<Fitted>(grow.slide, 'grow').autofit).toBe('none');
    const again = await write(['block', 'autofit', 'canvas-title#grow', 'grow']);
    expect(block<Fitted>(again.slide, 'grow').autofit).toBe('grow');
    const valign = await write(['block', 'set', 'shapes#snip', '/valign', 'middle']);
    expect(block<Fitted>(valign.slide, 'snip').valign).toBe('middle');
    const padding = await write([
      'block',
      'set',
      'shapes#snip',
      '/padding',
      '{"top":8,"right":16,"bottom":8,"left":16}',
    ]);
    expect(block<Fitted>(padding.slide, 'snip').padding).toEqual({
      top: 8,
      right: 16,
      bottom: 8,
      left: 16,
    });
    // grow needs a position box: refused on a placeholder without one (SPEC-2 0.41)
    const refused = await run(['block', 'autofit', 'autofit#h', 'grow', '--json']);
    expect(refused.code).toBe(2);
  });

  test('diagram insert lands one group of shapes, texts and attached lines through the bound templates', async () => {
    // B5's templates are bound as deps.diagrams at merge 2 (SPEC-2 2.8.3); the fixture's diagram
    // slide already holds a process diagram, so a second one lands beside it with its own group tag
    const r = await run([
      'diagram',
      'insert',
      'diagram',
      '--kind',
      'process',
      '--count',
      '4',
      '--style',
      'plate',
      '--json',
    ]);
    expect(r.code, r.stderr).toBe(0);
    const inserted = (r.json as SlideResult & { blockIds?: string[]; group?: string }).slide;
    const groups = new Set(
      blocks(inserted)
        .map((b) => b.pos?.group)
        .filter((g) => g !== undefined),
    );
    expect(groups.size).toBe(2);
    const fresh = [...groups].find((g) => g !== 'process-1');
    const members = blocks(inserted).filter((b) => b.pos?.group === fresh);
    expect(members.filter((b) => b.type === 'text')).toHaveLength(4);
    expect(
      members.filter(
        (b) => b.type === 'shape' && (b as { connect?: unknown }).connect !== undefined,
      ),
    ).toHaveLength(3);
  });

  test('the reads carry the new fields', async () => {
    const info = await run(['info', '--json']);
    expect(info.code).toBe(0);
    expect((info.json as { counts: Record<string, number> }).counts).toMatchObject({
      slides: 27,
      charts: 3,
      guides: 2,
    });
    expect(
      (info.json as { counts: Record<string, number> }).counts['canvas'],
    ).toBeGreaterThanOrEqual(12);
    const list = await run(['slides', '--json']);
    expect(list.code).toBe(0);
    const rows = list.json as { id: string; canvas?: boolean; objects?: number }[];
    expect(rows.find((row) => row.id === 'canvas-title')).toMatchObject({
      canvas: true,
      objects: 7,
    });
    expect(rows.find((row) => row.id === 'title')?.canvas).toBeUndefined();
    const text = await run(['export', 'txt', 'all']);
    expect(text.code).toBe(0);
    // object texts in reading order, chart rows tab separated, bullet glyphs per level
    expect(text.stdout).toContain('Shape presets\nHexagon');
    expect(text.stdout).toContain('Docs\t');
    expect(text.stdout).toMatch(/•\s/);
  });
});
