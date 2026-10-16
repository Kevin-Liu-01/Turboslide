// The Brand kit import (kit-import.ts; the Glyphfield port, wave 2 item 6): a Glyphfield kit's
// token file maps its four roles that have a place in the kit, follows its aliases, refuses the
// rest by name, and is read from a stored or a deflated ZIP entry as from the JSON alone.
import { deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { kitColorsOf, readKitFile } from '../kit-import';

const srgb = (hex: string) => ({
  colorSpace: 'srgb',
  components: [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255),
  hex,
});

/** The shape Glyphfield's brandDesignTokens writes (its src/lib/brandTokens.ts). */
const TOKENS = {
  $description: 'Acme design tokens, exported by Glyphfield.',
  color: {
    ink: { $type: 'color', $value: srgb('#14161a') },
    paper: { $type: 'color', $value: srgb('#fbfaf7') },
    emphasis: { $type: 'color', $value: srgb('#d0402b') },
  },
  palette: {
    ink: {
      '400': { $type: 'color', $value: srgb('#8a8f99') },
      '600': { $type: 'color', $value: srgb('#5b606a') },
    },
  },
  semantic: {
    light: {
      background: { $type: 'color', $value: '{color.paper}' },
      foreground: { $type: 'color', $value: '{color.ink}' },
      'foreground-muted': { $type: 'color', $value: '{palette.ink.600}' },
      primary: { $type: 'color', $value: '{color.emphasis}' },
      surface: { $type: 'color', $value: '{color.paper}' },
      border: { $type: 'color', $value: '{palette.ink.400}' },
    },
    dark: {
      background: { $type: 'color', $value: '{color.ink}' },
      foreground: { $type: 'color', $value: '{color.paper}' },
      'foreground-muted': { $type: 'color', $value: '{palette.ink.400}' },
      primary: { $type: 'color', $value: { colorSpace: 'srgb', components: [1, 0.5, 0.25] } },
      focus: { $type: 'color', $value: '{color.missing}' },
    },
  },
};

const LIGHT_AND_DARK = [
  ['/colors/light/background', '#fbfaf7'],
  ['/colors/light/text', '#14161a'],
  ['/colors/light/caption', '#5b606a'],
  ['/colors/light/hint', '#5b606a'],
  ['/colors/light/primary', '#d0402b'],
  ['/colors/dark/background', '#14161a'],
  ['/colors/dark/text', '#fbfaf7'],
  ['/colors/dark/caption', '#8a8f99'],
  ['/colors/dark/hint', '#8a8f99'],
  ['/colors/dark/primary', '#ff8040'],
];

/** A one entry ZIP, stored (method 0) or deflated (method 8); the CRC is not read. */
function zipOf(name: string, text: string, method: 0 | 8): Uint8Array {
  const raw = Buffer.from(text);
  const data = method === 8 ? deflateRawSync(raw) : raw;
  const file = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(file.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(file.length, 28);
  central.writeUInt32LE(0, 42);
  const head = Buffer.concat([local, file, data]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + file.length, 12);
  end.writeUInt32LE(head.length, 16);
  return new Uint8Array(Buffer.concat([head, central, file, end]));
}

describe('kitColorsOf', () => {
  it('maps background, foreground, foreground-muted and primary in both appearances', () => {
    const { writes, refused } = kitColorsOf(TOKENS);
    expect(writes).toEqual(LIGHT_AND_DARK);
    /* the roles without a place, and the alias that leads nowhere, each named once */
    expect(refused).toEqual(['surface', 'border', 'focus']);
  });

  it('refuses a file with no role the kit can take, in one sentence', () => {
    expect(() => kitColorsOf({ color: TOKENS.color })).toThrow(
      'This file holds no Glyphfield color roles (semantic.light or semantic.dark)',
    );
    expect(() => kitColorsOf({ semantic: { light: { surface: { $value: '#ffffff' } } } })).toThrow(
      'This file holds no color role a Turboslide kit can take',
    );
    expect(() => kitColorsOf([1, 2])).toThrow(RangeError);
  });

  it('follows an alias chain and stops one that loops', () => {
    const chained = {
      color: {
        a: { $value: '{color.b}' },
        b: { $value: '#ABCDEF' },
        loop: { $value: '{color.loop}' },
      },
      semantic: {
        light: { foreground: { $value: '{color.a}' }, background: { $value: '{color.loop}' } },
      },
    };
    expect(kitColorsOf(chained)).toEqual({
      writes: [['/colors/light/text', '#abcdef']],
      refused: ['background'],
    });
  });
});

describe('readKitFile', () => {
  const json = JSON.stringify(TOKENS);

  it('reads the JSON alone, a stored kit ZIP and a deflated one alike', async () => {
    for (const bytes of [
      new TextEncoder().encode(json),
      zipOf('acme/tokens/tokens.json', json, 0),
      zipOf('tokens/tokens.json', json, 8),
    ])
      expect(kitColorsOf(await readKitFile(bytes)).writes).toEqual(LIGHT_AND_DARK);
  });

  it('refuses a ZIP without tokens.json and a file that is neither', async () => {
    await expect(readKitFile(zipOf('brand.md', '# Acme', 0))).rejects.toThrow(
      'This ZIP holds no tokens.json',
    );
    await expect(readKitFile(new TextEncoder().encode('not json'))).rejects.toThrow(
      'This file is not a ZIP or a JSON file',
    );
  });
});
