// No native tooltips in the product's chrome (the GF-fix of wave 1, after the review's finding
// that Tools > Preferences > Show tooltips off left the browser's own tooltip on four buttons). A
// `title` attribute on an element draws the browser's plain plate after its own delay, which no
// setting of the studio can turn off; every tooltip goes through the chrome's tooltip manager
// (`tipProps` and `Tooltip` in packages/chrome/src/Tooltip.tsx), which follows Show tooltips, and a
// control the agent names by a phrase other than its text carries an `aria-label`. One rule,
// `tooltips/no-native-title`: a JSX element with a lower case tag (a DOM element, never a
// component, whose `title` prop is its own) and a `title` attribute in a `.tsx` file of the
// chrome, the viewer or the studio app. An iframe's title is its accessible name and draws no
// plate, so it passes. The landing (/home) and the docs are left to the site's own rules: their
// links draw no plates by design (scripts/tooltip-audit.mjs). Read with the TypeScript parser, so
// strings and comments never match.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import { listFiles } from './run.ts';

/** The trees the scan reads. */
export const NATIVE_TITLE_ROOTS: readonly string[] = [
  'packages/chrome/src',
  'packages/viewer/src',
  'apps/studio/src',
];

/** The landing and the docs, which the site's own rules govern. */
const OUTSIDE: readonly RegExp[] = [
  /^apps\/studio\/src\/components\/home\//,
  /^apps\/studio\/src\/components\/docs\//,
];

/** DOM elements whose `title` names them and draws no plate. */
const NAMED_BY_TITLE = new Set(['iframe']);

export const NATIVE_TITLE_MESSAGE =
  "A title attribute draws the browser's tooltip, which Show tooltips cannot turn off; use tipProps from packages/chrome/src/Tooltip.tsx, and an aria-label when the agent needs another name.";

export type NativeTitleFinding = {
  rule: 'tooltips/no-native-title';
  file: string;
  line: number;
  text: string;
};

/** The DOM elements of a `.tsx` file that carry a `title` attribute. */
export function nativeTitles(file: string, text: string): NativeTitleFinding[] {
  if (!file.endsWith('.tsx') || !text.includes('title')) return [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: NativeTitleFinding[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      /^[a-z]/.test(node.tagName.text) &&
      !NAMED_BY_TITLE.has(node.tagName.text)
    ) {
      for (const attribute of node.attributes.properties) {
        if (
          ts.isJsxAttribute(attribute) &&
          ts.isIdentifier(attribute.name) &&
          attribute.name.text === 'title'
        )
          found.push({
            rule: 'tooltips/no-native-title',
            file,
            line: source.getLineAndCharacterOfPosition(attribute.getStart(source)).line + 1,
            text: `<${node.tagName.text} ${attribute.getText(source).replace(/\s+/g, ' ').slice(0, 100)}`,
          });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Every finding in the tree at `root`; the tree test holds it empty. */
export function scanNativeTitles(root: string): NativeTitleFinding[] {
  return listFiles(root, NATIVE_TITLE_ROOTS)
    .filter(
      (file) =>
        file.endsWith('.tsx') &&
        !/\.test\.tsx$/.test(file) &&
        !/(^|\/)__tests__\//.test(file) &&
        !OUTSIDE.some((re) => re.test(file)),
    )
    .flatMap((file) => nativeTitles(file, readFileSync(join(root, file), 'utf8')));
}
