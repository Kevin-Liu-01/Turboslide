// The 51 actions of round five (gslides-parity SPEC-5 13, 0.50; SPEC-5-amendments A5 `font.list`;
// MILESTONES-5 integrator day 0): the ids, the groups, the transports the rows name, the MCP names,
// the CLI usages and the baseRevision rule, so every builder types against the same table and the
// coverage test finds each id named. Every row answers NotImplementedError from a fresh dispatcher
// until its lane registers a handler (SPEC-5 1.6); packages/agent/src/__tests__/gs5-seam.test.ts
// pins that for the whole set, because the schema sits below the dispatcher (SPEC 3.3 item 3).
import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  ACTION_GROUPS,
  ACTION_IDS,
  GS3_ACTION_IDS,
  GS5_ACTION_IDS,
  MILESTONES,
  NO_REVISION_WRITES,
  actionsInOrder,
} from './actions.ts';
import type { ActionGroup, ActionId } from './actions.ts';

const IDS: ActionId[] = [
  'motion.setTransition',
  'motion.add',
  'motion.update',
  'motion.remove',
  'motion.reorder',
  'motion.compile',
  'motion.play',
  'media.insert',
  'media.setPlayback',
  'media.poster',
  'media.info',
  'media.list',
  'camera.capture',
  'view.presentOnScreen',
  'template.list',
  'template.slides',
  'buildingBlock.list',
  'buildingBlock.insert',
  'import.pptx',
  'theme.import',
  'theme.applyImported',
  'deck.setPageSize',
  'prefs.get',
  'prefs.set',
  'text.autocorrect',
  'spelling.check',
  'spelling.replace',
  'spelling.ignore',
  'dictionary.add',
  'dictionary.remove',
  'dictionary.list',
  'dictionary.lookup',
  'accessibility.verbalize',
  'equation.insert',
  'equation.render',
  'equation.symbols',
  'theme.get',
  'theme.set',
  'theme.rename',
  'theme.reset',
  'layout.list',
  'layout.create',
  'layout.duplicate',
  'layout.rename',
  'layout.delete',
  'layout.setPlaceholder',
  'chat.send',
  'chat.list',
  'chat.clear',
  'version.delete',
  'font.list',
];

/** The MCP names SPEC-5 13 fixes; `none` is a window only row. */
const MCP: Record<string, string> = {
  'motion.setTransition': 'deck_set_transition',
  'motion.add': 'deck_add_animation',
  'motion.update': 'deck_update_animation',
  'motion.remove': 'deck_remove_animation',
  'motion.reorder': 'deck_reorder_animations',
  'motion.compile': 'deck_motion_schedule',
  'motion.play': 'none',
  'media.insert': 'deck_media_insert',
  'media.setPlayback': 'deck_media_playback',
  'media.poster': 'deck_media_poster',
  'media.info': 'deck_media_info',
  'media.list': 'deck_media_list',
  'camera.capture': 'deck_camera_capture',
  'view.presentOnScreen': 'deck_present_on_screen',
  'template.list': 'deck_list_templates',
  'template.slides': 'deck_template_slides',
  'buildingBlock.list': 'deck_list_building_blocks',
  'buildingBlock.insert': 'deck_insert_building_block',
  'import.pptx': 'deck_import_pptx',
  'theme.import': 'deck_import_theme',
  'theme.applyImported': 'deck_apply_imported_theme',
  'deck.setPageSize': 'deck_set_page_size',
  'prefs.get': 'deck_prefs_get',
  'prefs.set': 'deck_prefs_set',
  'text.autocorrect': 'deck_autocorrect_text',
  'spelling.check': 'deck_spell_check',
  'spelling.replace': 'deck_spell_replace',
  'spelling.ignore': 'none',
  'dictionary.add': 'deck_dictionary_add',
  'dictionary.remove': 'deck_dictionary_remove',
  'dictionary.list': 'deck_dictionary_list',
  'dictionary.lookup': 'deck_dictionary_lookup',
  'accessibility.verbalize': 'none',
  'equation.insert': 'deck_insert_equation',
  'equation.render': 'deck_render_equation',
  'equation.symbols': 'deck_equation_symbols',
  'theme.get': 'deck_theme_get',
  'theme.set': 'deck_theme_set',
  'theme.rename': 'deck_theme_rename',
  'theme.reset': 'deck_theme_reset',
  'layout.list': 'deck_layout_list',
  'layout.create': 'deck_layout_create',
  'layout.duplicate': 'deck_layout_duplicate',
  'layout.rename': 'deck_layout_rename',
  'layout.delete': 'deck_layout_delete',
  'layout.setPlaceholder': 'deck_layout_set_placeholder',
  'chat.send': 'deck_chat_send',
  'chat.list': 'deck_chat_list',
  'chat.clear': 'deck_chat_clear',
  'version.delete': 'deck_version_delete',
  'font.list': 'deck_list_fonts',
};

/** The CLI command words of SPEC-5 13 (the first two tokens after `turboslide`). */
const CLI: Record<string, string> = {
  'motion.setTransition': 'motion transition',
  'motion.add': 'motion add',
  'motion.update': 'motion update',
  'motion.remove': 'motion remove',
  'motion.reorder': 'motion reorder',
  'motion.compile': 'motion compile',
  'media.insert': 'media insert',
  'media.setPlayback': 'media playback',
  'media.poster': 'media poster',
  'media.info': 'media info',
  'media.list': 'media list',
  'camera.capture': 'camera capture',
  'view.presentOnScreen': 'view present',
  'template.list': 'template list',
  'template.slides': 'template slides',
  'buildingBlock.list': 'blocks list',
  'buildingBlock.insert': 'blocks insert',
  'import.pptx': 'import <file>',
  'theme.import': 'theme import',
  'theme.applyImported': 'theme apply-imported',
  'deck.setPageSize': 'deck page-size',
  'prefs.get': 'prefs get',
  'prefs.set': 'prefs set',
  'text.autocorrect': 'text autocorrect',
  'spelling.check': 'spelling check',
  'spelling.replace': 'spelling replace',
  'dictionary.add': 'dictionary add',
  'dictionary.remove': 'dictionary remove',
  'dictionary.list': 'dictionary list',
  'dictionary.lookup': 'dictionary lookup',
  'equation.insert': 'equation insert',
  'equation.render': 'equation render',
  'equation.symbols': 'equation symbols',
  'theme.get': 'theme get',
  'theme.set': 'theme set',
  'theme.rename': 'theme rename',
  'theme.reset': 'theme reset',
  'layout.list': 'layout list',
  'layout.create': 'layout create',
  'layout.duplicate': 'layout duplicate',
  'layout.rename': 'layout rename',
  'layout.delete': 'layout delete',
  'layout.setPlaceholder': 'layout placeholder',
  'chat.send': 'chat send',
  'chat.list': 'chat list',
  'chat.clear': 'chat clear',
  'version.delete': 'version delete',
  'font.list': 'fonts list',
};

/** The group sizes of SPEC-5 13: motion 7, media 6, view 3 (presentOnScreen, dictionary.lookup, accessibility.verbalize), deck 3, block 4, import 2, theme 11, account 5, slide 3, render 3, comment 3, version 1. */
const GROUP_COUNTS: Partial<Record<ActionGroup, number>> = {
  motion: 7,
  media: 6,
  view: 3,
  deck: 3,
  block: 4,
  import: 2,
  theme: 11,
  account: 5,
  slide: 3,
  render: 3,
  comment: 3,
  version: 1,
};

/** The writes that carry no document revision (SPEC-5 13 `record` and `room`, the version log, a new deck from a file). */
const NO_BASE: ActionId[] = [
  'prefs.set',
  'dictionary.add',
  'dictionary.remove',
  'chat.send',
  'chat.clear',
  'version.delete',
  'import.pptx',
];

describe('the round five action table (SPEC-5 13)', () => {
  it('grows the table from 169 to 220, counted once from ACTION_IDS, after the 64 of round three', () => {
    expect(ACTION_IDS).toHaveLength(220);
    expect(new Set(ACTION_IDS).size).toBe(220);
    expect([...GS5_ACTION_IDS]).toEqual(IDS);
    expect(GS5_ACTION_IDS).toHaveLength(51);
    expect(GS3_ACTION_IDS).toHaveLength(64);
    expect(MILESTONES).toContain('GS5');
    for (const group of ['motion', 'media', 'theme', 'import'] as const)
      expect(ACTION_GROUPS).toContain(group);
  });

  it('tags every new row GS5 and puts each in its group', () => {
    const counts: Partial<Record<ActionGroup, number>> = {};
    for (const id of IDS) {
      const spec = ACTIONS[id];
      expect(spec.id).toBe(id);
      expect(spec.milestone, id).toBe('GS5');
      counts[spec.group] = (counts[spec.group] ?? 0) + 1;
    }
    expect(counts).toEqual(GROUP_COUNTS);
    expect(actionsInOrder().filter((spec) => spec.milestone === 'GS5')).toHaveLength(51);
  });

  it('names the MCP tools SPEC-5 13 fixes and keeps the window only rows off the transports', () => {
    for (const id of IDS) {
      const spec = ACTIONS[id];
      const expected = MCP[id];
      if (expected === 'none') {
        expect(spec.transports, id).toEqual(['window']);
        expect(spec.mcp, id).toBeUndefined();
        expect(spec.cli, id).toBeUndefined();
      } else {
        expect(spec.transports, id).toContain('mcp');
        expect(spec.transports, id).toContain('cli');
        expect(spec.transports, id).toContain('http');
        expect(spec.mcp, id).toBe(expected);
      }
    }
    const names = IDS.map((id) => ACTIONS[id].mcp).filter((name) => name !== undefined);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names)
      expect(actionsInOrder().filter((spec) => spec.mcp === name)).toHaveLength(1);
  });

  it('spells the CLI usages of SPEC-5 13 with their command words', () => {
    for (const [id, words] of Object.entries(CLI)) {
      const usage = ACTIONS[id as ActionId].cli?.usage ?? '';
      expect(usage.startsWith('turboslide '), id).toBe(true);
      expect(usage.split(/\s+/).slice(1, 3).join(' '), id).toBe(words);
    }
  });

  it('names baseRevision on every document write and on none of the record, room and log writes', () => {
    for (const id of IDS) {
      const spec = ACTIONS[id];
      if (!spec.mutates) continue;
      const example = JSON.stringify(spec.example);
      if (NO_BASE.includes(id)) {
        expect(NO_REVISION_WRITES.has(id), id).toBe(true);
        expect(example, id).not.toContain('baseRevision');
      } else {
        expect(example, id).toContain('baseRevision');
      }
    }
  });

  it('widens the inputs SPEC-5 13 names on the existing rows', () => {
    const parses = (id: ActionId, input: unknown): boolean =>
      ACTIONS[id].input.safeParse(input).success;
    expect(parses('export.run', { format: 'odp', mode: 'flatten' })).toBe(true);
    expect(
      parses('export.run', {
        format: 'pdf',
        layout: 'handout-6',
        paper: 'letter',
        orientation: 'portrait',
        order: 'down',
        hideBackground: true,
      }),
    ).toBe(true);
    expect(parses('export.run', { format: 'pptx', motion: 'drop', media: 'poster' })).toBe(true);
    expect(
      parses('build.run', { out: 'deck.html', autoplay: 5000, loop: true, media: 'url' }),
    ).toBe(true);
    expect(parses('render.slide', { slideIds: ['a'], format: 'svg', text: 'outline' })).toBe(true);
    expect(parses('view.present', { on: true, step: 2 })).toBe(true);
    expect(parses('view.goto', { slideId: 'a', step: 1 })).toBe(true);
    expect(
      parses('slide.import', { sourceFile: 'deck.pptx', slideIndexes: [3, 5], baseRevision: 1 }),
    ).toBe(true);
    expect(
      parses('slide.import', {
        sourceTemplateId: 'sales-pitch',
        slideIds: ['pricing'],
        baseRevision: 1,
      }),
    ).toBe(true);
    expect(
      parses('slide.import', {
        sourceDeckId: 'a',
        sourceFile: 'b.pptx',
        slideIds: ['x'],
        baseRevision: 1,
      }),
    ).toBe(false);
    expect(parses('deck.create', { name: 'Acme pitch', from: 'sales-pitch' })).toBe(true);
    expect(parses('deck.set', { path: '/language', value: 'fr', baseRevision: 1 })).toBe(true);
    expect(parses('deck.set', { path: '/page', value: {}, baseRevision: 1 })).toBe(false);
    expect(parses('deck.set', { path: '/themeEdits', value: {}, baseRevision: 1 })).toBe(false);
    expect(parses('deck.guides', { colors: { 'x:800': 'red' }, baseRevision: 1 })).toBe(true);
    expect(
      parses('text.indent', { slideId: 'a', blockIds: ['p'], firstLine: 32, baseRevision: 1 }),
    ).toBe(true);
    expect(
      parses('text.list', {
        slideId: 'a',
        blockId: 'l',
        start: 4,
        prefix: '(',
        suffix: ')',
        baseRevision: 1,
      }),
    ).toBe(true);
    expect(
      parses('table.cellStyle', {
        slideId: 'a',
        blockId: 't',
        cells: [[0, 0]],
        edges: ['top', 'bottom'],
        baseRevision: 1,
      }),
    ).toBe(true);
    expect(
      parses('block.adjust', {
        slideId: 'a',
        blockId: 'p',
        reflection: { transparency: 0.5, distance: 8, size: 0.4 },
        recolor: 'grayscale',
        baseRevision: 1,
      }),
    ).toBe(true);
    expect(
      parses('picture.dither', {
        slideId: 'a',
        blockId: 'p',
        dither: { pattern: 'halftone-dot', angle: 30 },
        baseRevision: 1,
      }),
    ).toBe(true);
    expect(parses('export.check', { file: 'deck.odp', page: '1200x900', libreoffice: true })).toBe(
      true,
    );
    expect(
      parses('line.set', {
        slideId: 'a',
        blockIds: ['l'],
        points: [
          [0, 0],
          [1, 1],
        ],
        baseRevision: 1,
      }),
    ).toBe(true);
  });
});
