import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';

import { THEME_COLOR_SLOTS } from '@turboslide/schema/validate/theme';
import { tokensFor } from '@turboslide/theme/themes';

import { buildFixturePptx, themePartXml, themeSchemeColors } from './fixture.ts';

// The theme part per theme (gslides-parity SPEC-5 9.1, 9.3, 9.4; R03 4.2; MILESTONES-5 B6 day 6):
// the twelve `clrScheme` slots in the API order from the theme's light tokens, an edited deck's
// colours written over them, the faces of the record in `fontScheme`, the second built in theme's
// part differing from the GT part in its name alone (the ten token values are shared, SPEC-5
// 0.45), and the package carrying the part a build asks for.

const slotOf = (xml: string, element: string): string | undefined =>
  new RegExp(`<a:${element}><a:srgbClr val="([0-9A-F]{6})"/></a:${element}>`).exec(xml)?.[1];

describe('themePartXml', () => {
  test('writes the GT scheme of R03 4.2 in the API order', () => {
    const xml = themePartXml();
    expect(xml).toContain(
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Turboslide">',
    );
    expect(slotOf(xml, 'dk1')).toBe('070707');
    expect(slotOf(xml, 'lt1')).toBe('FFFFFF');
    expect(slotOf(xml, 'dk2')).toBe('3A3D44');
    expect(slotOf(xml, 'lt2')).toBe('F6F6F6');
    expect(slotOf(xml, 'accent1')).toBe('12A37A');
    expect(slotOf(xml, 'accent2')).toBe('F0A020');
    expect(slotOf(xml, 'accent3')).toBe('E5484D');
    expect(slotOf(xml, 'accent4')).toBe('2F5CE0');
    expect(slotOf(xml, 'accent5')).toBe('8A8F98');
    expect(slotOf(xml, 'accent6')).toBe('101010');
    expect(slotOf(xml, 'hlink')).toBe('2F5CE0');
    expect(slotOf(xml, 'folHlink')).toBe('8A8F98');
    expect(xml).toContain('<a:latin typeface="GT Inter Display"/>');
    expect(xml).toContain('<a:latin typeface="GT Inter Text 22"/>');
    // every dropdown slot of the validator's table has a value in the scheme
    const scheme = themeSchemeColors('gt-ink-paper');
    for (const slot of THEME_COLOR_SLOTS)
      expect(scheme[slot.key], slot.key).toMatch(/^[0-9A-F]{6}$/);
  });

  test('the Plate part carries the same ten token values under its own name (SPEC-5 0.45)', () => {
    const gt = themePartXml({ theme: 'gt-ink-paper' });
    const plate = themePartXml({ theme: 'ts-plate' });
    expect(plate).toContain('name="Turboslide Plate"');
    expect(plate.replace(/Turboslide Plate/g, 'Turboslide')).toBe(gt);
    expect(tokensFor('ts-plate')).toEqual(tokensFor('gt-ink-paper'));
  });

  test('an edited deck’s colours and faces land in the scheme (SPEC-5 9.4)', () => {
    const xml = themePartXml({
      colors: { ink: '#101010', paper: '#fafafa', ok: '#00aa55', link: '#0000ee' },
      fonts: { display: 'Open Sans', text: 'Roboto' },
    });
    expect(slotOf(xml, 'dk1')).toBe('101010');
    expect(slotOf(xml, 'lt1')).toBe('FAFAFA');
    expect(slotOf(xml, 'accent1')).toBe('00AA55');
    expect(slotOf(xml, 'hlink')).toBe('0000EE');
    expect(slotOf(xml, 'dk2')).toBe('3A3D44');
    expect(xml).toContain('<a:majorFont><a:latin typeface="Open Sans"/>');
    expect(xml).toContain('<a:minorFont><a:latin typeface="Roboto"/>');
    // an eight digit value writes its six colour digits (the alpha of R03 4.2 travels through the raster)
    expect(slotOf(themePartXml({ colors: { ink: '#10101080' } }), 'dk1')).toBe('101010');
  });

  test('buildFixturePptx writes the part it is asked for', async () => {
    const bytes = await buildFixturePptx({
      out: '/dev/null',
      pages: [{ texts: [], lines: [] } as never],
      themePart: { theme: 'ts-plate', colors: { ink: '#123456' } },
    });
    const zip = await JSZip.loadAsync(bytes);
    const theme = await zip.file('ppt/theme/theme1.xml')?.async('string');
    expect(theme).toContain('name="Turboslide Plate"');
    expect(slotOf(theme ?? '', 'dk1')).toBe('123456');
    const plain = await JSZip.loadAsync(
      await buildFixturePptx({ out: '/dev/null', pages: [{ texts: [], lines: [] } as never] }),
    );
    expect(await plain.file('ppt/theme/theme1.xml')?.async('string')).toBe(themePartXml());
  });
});
