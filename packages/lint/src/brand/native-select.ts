// The native select stays out (docs/DROPDOWNS.md 6, decision C12; Kevin, 2026-10-08: "use custom
// dropdowns!!!"). A native select opens the operating system's popup, which takes none of the
// product's corners, font, colours or layer; every dropdown is the shared `Select` of
// packages/chrome/src/Select.tsx. Two rules over the whole tree, tests and specs included, read
// with the TypeScript parser so strings and comments never match (the messages and fixtures of
// this lint pass): `dropdowns/no-native-select`, a JSX element named `select` in a `.tsx` file,
// and `dropdowns/no-select-option`, a call of a property named `selectOption` or `selectOptions`
// (Playwright's and Testing Library's drivers of a native select) in a script. `docs/` is never
// read: its archived scripts are records of past rounds.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import { listFiles } from './run.ts';

/** The trees the scan reads. */
export const NATIVE_SELECT_ROOTS: readonly string[] = ['apps', 'packages', 'scripts'];

export type NativeSelectRule = 'dropdowns/no-native-select' | 'dropdowns/no-select-option';

export const NATIVE_SELECT_MESSAGES: Readonly<Record<NativeSelectRule, string>> = {
  'dropdowns/no-native-select':
    "A native select opens the system's popup; use Select from packages/chrome/src/Select.tsx (docs/DROPDOWNS.md 3).",
  'dropdowns/no-select-option':
    'selectOption drives a native select; use chooseOption from apps/studio/e2e/choose-option.ts (docs/DROPDOWNS.md 5).',
};

export type NativeSelectFinding = {
  rule: NativeSelectRule;
  file: string;
  line: number;
  text: string;
};

/** Generated and installed files the scan never reads. */
const GENERATED: readonly RegExp[] = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)\.output\//,
  /\.gen\.ts$/,
  /\.d\.ts$/,
];
const TSX = /\.tsx$/;
const SCRIPT = /\.(?:ts|tsx|mts|mjs|js)$/;
const SELECT_OPTION_NAMES = new Set(['selectOption', 'selectOptions']);

function kindOf(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (/\.[cm]?js$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kindOf(file));
}

function finding(
  rule: NativeSelectRule,
  file: string,
  source: ts.SourceFile,
  node: ts.Node,
): NativeSelectFinding {
  return {
    rule,
    file,
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    text: node.getText(source).replace(/\s+/g, ' ').slice(0, 120),
  };
}

/** The JSX `select` elements of a `.tsx` file, opening or self closing. */
export function nativeSelects(file: string, text: string): NativeSelectFinding[] {
  if (!TSX.test(file) || !text.includes('select')) return [];
  const source = parse(file, text);
  const found: NativeSelectFinding[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === 'select'
    )
      found.push(finding('dropdowns/no-native-select', file, source, node.tagName));
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The calls of a property named `selectOption` or `selectOptions` in a script. */
export function selectOptionCalls(file: string, text: string): NativeSelectFinding[] {
  if (!SCRIPT.test(file) || !text.includes('selectOption')) return [];
  const source = parse(file, text);
  const found: NativeSelectFinding[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      SELECT_OPTION_NAMES.has(node.expression.name.text)
    )
      found.push(finding('dropdowns/no-select-option', file, source, node.expression));
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Every finding of both rules in the tree at `root`; the tree test holds it empty. */
export function scanNativeSelects(root: string): NativeSelectFinding[] {
  const files = listFiles(root, NATIVE_SELECT_ROOTS).filter(
    (file) => SCRIPT.test(file) && !GENERATED.some((re) => re.test(file)),
  );
  return files.flatMap((file) => {
    const text = readFileSync(join(root, file), 'utf8');
    return [...nativeSelects(file, text), ...selectOptionCalls(file, text)];
  });
}
