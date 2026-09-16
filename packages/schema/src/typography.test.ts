import { describe, expect, test } from 'vitest';

import { typographyDeclarations } from './typography.ts';

// The catalog face on a block (gslides-parity SPEC-5-amendments A5; b7.md request 1, landed by
// the integrator at merge 1): `typography.family` becomes one font-family declaration reading
// the custom property `@turboslide/render/fonts` defines on the sheet root for every used
// family, with `inherit` behind it so a face that is not loaded falls back to the sheet's Inter.
// The other declarations are pinned in freeform.test.ts; a block without a family writes none.
describe('typographyDeclarations family', () => {
  test('a family reads the --ts-font-<id> custom property with inherit behind it', () => {
    expect(typographyDeclarations({ family: 'lora' })).toEqual([
      'font-family:var(--ts-font-lora, inherit)',
    ]);
    expect(typographyDeclarations({ size: 26, family: 'ibm-plex-mono' })).toEqual([
      'font-size:26px',
      'font-family:var(--ts-font-ibm-plex-mono, inherit)',
    ]);
  });

  test('no family, no font-family declaration', () => {
    expect(typographyDeclarations({ size: 26, weight: 500 })).not.toContainEqual(
      expect.stringContaining('font-family'),
    );
    expect(typographyDeclarations(undefined)).toEqual([]);
  });
});
