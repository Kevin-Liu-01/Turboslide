import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { nativeTitles, scanNativeTitles } from './native-title.ts';

// No native tooltips in the chrome (the GF-fix of wave 1): the rule on fixtures, then the tree.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('tooltips/no-native-title', () => {
  test('finds a title on a DOM element, a string or an expression, with its line', () => {
    const source = [
      'export const A = () => (',
      '  <button type="button" title="Close the report">Close</button>',
      ');',
      'export const B = ({ name }: { name: string }) => <span title={`Download ${name}`} />;',
    ].join('\n');
    expect(nativeTitles('x.tsx', source).map((f) => [f.rule, f.line, f.text])).toEqual([
      ['tooltips/no-native-title', 2, '<button title="Close the report"'],
      ['tooltips/no-native-title', 4, '<span title={`Download ${name}`}'],
    ]);
  });

  test('passes a component’s title prop, an iframe, tipProps, aria-label, strings and comments', () => {
    const source = [
      "import { tipProps } from './Tooltip';",
      '// <button title="x"> in a comment',
      'const html = \'<span title="x">\';',
      'export const A = () => <ToolButton title="Export" doc="Opens the export options." />;',
      'export const B = () => <Dialog title="Share" onClose={close} />;',
      'export const C = () => <iframe title="The presentation" src="/embed" />;',
      'export const D = () => <button aria-label="Close the report" {...tipProps(\'Close\')} />;',
      'export const E = () => <svg><title>Mark</title></svg>;',
    ].join('\n');
    expect(nativeTitles('x.tsx', source)).toEqual([]);
  });

  test('reads .tsx files alone', () => {
    expect(nativeTitles('x.ts', 'const a = { title: "x" };')).toEqual([]);
  });
});

describe('the tree', () => {
  /* the chrome, the viewer and the studio app's .tsx files parsed; the bound is for a loaded machine */
  test('carries no native title in the chrome, the viewer or the studio app', () => {
    expect(scanNativeTitles(ROOT)).toEqual([]);
  }, 120_000);
});
