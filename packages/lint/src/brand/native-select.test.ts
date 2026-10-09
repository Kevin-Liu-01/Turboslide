import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { nativeSelects, scanNativeSelects, selectOptionCalls } from './native-select.ts';

// The native select stays out (docs/DROPDOWNS.md 6): both rules on fixtures, then the whole tree.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('dropdowns/no-native-select', () => {
  test('finds a JSX select, opening or self closing, with its line', () => {
    const source = [
      'export const A = () => (',
      '  <select aria-label="Sort" value={v} onChange={go}>',
      '    <option value="a">A</option>',
      '  </select>',
      ');',
      'export const B = () => <select />;',
    ].join('\n');
    expect(nativeSelects('x.tsx', source).map((f) => [f.rule, f.line, f.text])).toEqual([
      ['dropdowns/no-native-select', 2, 'select'],
      ['dropdowns/no-native-select', 6, 'select'],
    ]);
  });

  test('passes the shared Select, a string that names the element and a comment', () => {
    const source = [
      "import { Select } from './Select';",
      '// a <select> in a comment',
      '/* <select aria-label="x"> */',
      "const html = '<select>';",
      'export const A = () => <Select value="" options={[]} label="Sort" onChange={go} />;',
      'export const B = () => <p>Never a {"<select>"} here</p>;',
    ].join('\n');
    expect(nativeSelects('x.tsx', source)).toEqual([]);
  });

  test('reads .tsx files alone', () => {
    expect(nativeSelects('x.ts', 'const a = 1 < select;')).toEqual([]);
  });
});

describe('dropdowns/no-select-option', () => {
  test('finds a locator, a page and a user call of selectOption or selectOptions', () => {
    const source = [
      "await page.locator('[data-control=\"x\"]').selectOption('a');",
      "await page.selectOption('select', 'b');",
      "await user.selectOptions(field, ['c']);",
      'await field?.selectOption({ label: "D" });',
    ].join('\n');
    expect(selectOptionCalls('x.spec.ts', source).map((f) => [f.rule, f.line])).toEqual([
      ['dropdowns/no-select-option', 1],
      ['dropdowns/no-select-option', 2],
      ['dropdowns/no-select-option', 3],
      ['dropdowns/no-select-option', 4],
    ]);
    expect(selectOptionCalls('x.mjs', "await page.selectOption('s', 'v');")).toHaveLength(1);
  });

  test('passes chooseOption, a comment and a string that names the call', () => {
    const source = [
      "import { chooseOption } from './choose-option';",
      '// locator.selectOption(v) drove the native select',
      "const message = 'selectOption drives a native select';",
      "await chooseOption(page, 'home.sort', 'title');",
    ].join('\n');
    expect(selectOptionCalls('x.spec.ts', source)).toEqual([]);
  });
});

describe('the tree', () => {
  /* about 3,000 files listed and the few that name either word parsed; the bound is for a loaded machine */
  test('carries no native select and no selectOption call', () => {
    expect(scanNativeSelects(ROOT)).toEqual([]);
  }, 120_000);
});
