import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INTER, INTER_CSS, fontFaceCss, inlineFontFaceCss, interBytes } from './inter.ts';

describe('InterVariable', () => {
  it('is the deck’s file, byte for byte', () => {
    const bytes = interBytes();
    expect(bytes.byteLength).toBe(INTER.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(INTER.sha256);
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
  });

  it('has the deck’s descriptor in inter.css', () => {
    const css = readFileSync(INTER_CSS, 'utf8');
    expect(css).toContain("font-family: 'Inter';");
    expect(css).toContain('font-weight: 100 900;');
    expect(css).toContain("url('../assets/InterVariable.woff2') format('woff2')");
    expect(fontFaceCss('x.woff2')).toContain("src: url('x.woff2') format('woff2');");
    expect(inlineFontFaceCss()).toMatch(
      /^@font-face \{[\s\S]*data:font\/woff2;base64,d09GMgABAAAA/,
    );
  });
});
