// The presenter's five icons are the chrome's, byte for byte in the markup (presenter-icons.tsx
// says why they are a copy): each renders to the same static markup as `Icon` of
// packages/chrome/src/icons.tsx with the chrome's name, so a path changed in one place and not
// the other fails here. The module itself imports nothing from the chrome, which is the point
// (the focus round, VERIFICATION C2-F18, the `/present` `js decoded` row).
import { readFileSync } from 'node:fs';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Icon } from '@turboslide/chrome/icons';
import type { IconName } from '@turboslide/chrome/icons';

import { PRESENTER_ICONS, PresenterIcon } from './presenter-icons';
import type { PresenterIconName } from './presenter-icons';

const PAIRS: ReadonlyArray<[PresenterIconName, IconName]> = [
  ['previous', 'prev'],
  ['next', 'next'],
  ['plus', 'plus'],
  ['minus', 'minus'],
  ['exit', 'close'],
];

describe('the presenter icons', () => {
  it('render the chrome icon of the same name, markup for markup', () => {
    for (const [ours, theirs] of PAIRS) {
      expect(renderToStaticMarkup(createElement(PresenterIcon, { name: ours })), ours).toBe(
        renderToStaticMarkup(createElement(Icon, { name: theirs })),
      );
    }
  });

  it('hand the console exactly the five it draws', () => {
    expect(Object.keys(PRESENTER_ICONS).sort()).toEqual(
      ['exit', 'minus', 'next', 'plus', 'previous'].sort(),
    );
  });

  it('import nothing from the chrome, so the presenter route does not load its icon module', () => {
    const source = readFileSync(new URL('./presenter-icons.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/^import .* from '@turboslide\/chrome/m);
    expect(source).toContain("from '@turboslide/viewer/present/ui'");
  });
});
