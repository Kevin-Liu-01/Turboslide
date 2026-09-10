import { describe, expect, it } from 'vitest';

import { standaloneRuntimeSource } from './source';

// renderStandalone inlines this as one classic script (SPEC 5.3).
describe('standaloneRuntimeSource', () => {
  it('strips to classic JavaScript that parses and boots from an IIFE', () => {
    const js = standaloneRuntimeSource();
    expect(js).not.toMatch(/\bexport\b|\bimport\b/);
    expect(js).not.toMatch(/: (string|number|boolean|Mode|Theme)\b/);
    expect(() => new Function(js)).not.toThrow();
    expect(js).toContain('gt-deck-slide');
    expect(js).toContain("load('gt-theme')");
    expect(js).toContain("'gt-deck-theme'");
  });
});
