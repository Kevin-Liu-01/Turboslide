import { describe, expect, it } from 'vitest';

import { standaloneMotionSource } from './motion-source';

// renderStandalone inlines this as the second classic script (gslides-parity SPEC-5 2.3).
describe('standaloneMotionSource', () => {
  it('strips to classic JavaScript that parses and boots from an IIFE with the runtime hook', () => {
    const js = standaloneMotionSource();
    expect(js).not.toMatch(/\bexport\b|\bimport\b/);
    expect(js).not.toMatch(/: (string|number|boolean|Schedule|Layer)\b/);
    expect(() => new Function(js)).not.toThrow();
    expect(js).toContain("getElementById('ts-motion')");
    expect(js).toContain('__tsMotion');
    expect(js).toContain('data-transition');
    expect(js).toContain('Sound is off until you click');
    expect(js).toContain('data-autoplay');
  });
});
