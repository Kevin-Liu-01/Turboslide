// The `theme-color` meta follows the stored theme (gslides-parity SPEC-4 1.6; MILESTONES-4 B1):
// writeThemeColor sets the meta to the theme's --pt-paper (the values site.ts carries), leaves a
// document without the meta alone, and applyTheme calls it. The viewer's tests run in Node, so the
// document is a stand in with the one method the function reads.
import { describe, expect, it } from 'vitest';

import { THEME_COLORS } from '@turboslide/theme/brand/site';

import { writeThemeColor } from '../theme';

function fakeDocument(withMeta: boolean) {
  const attributes = new Map<string, string>([
    ['name', 'theme-color'],
    ['content', '#000000'],
  ]);
  const meta = { setAttribute: (name: string, value: string) => attributes.set(name, value) };
  return {
    doc: {
      querySelector: (selector: string) =>
        withMeta && selector === 'meta[name="theme-color"]' ? (meta as unknown as Element) : null,
    },
    attributes,
  };
}

describe('writeThemeColor (SPEC-4 1.6)', () => {
  it('writes the stamped theme paper: #070707 for dark, #ffffff for light', () => {
    const { doc, attributes } = fakeDocument(true);
    writeThemeColor('dark', doc);
    expect(attributes.get('content')).toBe(THEME_COLORS.dark);
    expect(THEME_COLORS.dark).toBe('#070707');
    writeThemeColor('light', doc);
    expect(attributes.get('content')).toBe(THEME_COLORS.light);
    expect(THEME_COLORS.light).toBe('#ffffff');
  });

  it('leaves a document without the meta alone', () => {
    const { doc, attributes } = fakeDocument(false);
    writeThemeColor('light', doc);
    expect(attributes.get('content')).toBe('#000000');
  });
});
