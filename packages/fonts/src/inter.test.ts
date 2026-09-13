import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  INTER,
  INTER_CSS,
  INTER_ITALIC,
  fontFaceCss,
  inlineFontFaceCss,
  interBytes,
  interItalicBytes,
} from './inter.ts';

describe('InterVariable', () => {
  it('is the deck’s file, byte for byte', () => {
    const bytes = interBytes();
    expect(bytes.byteLength).toBe(INTER.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(INTER.sha256);
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
  });

  it('has the deck’s descriptor in inter.css, and the italic face beside it (gslides-parity SPEC-2 7.1)', () => {
    const css = readFileSync(INTER_CSS, 'utf8');
    expect(css).toContain("font-family: 'Inter';");
    expect(css).toContain('font-weight: 100 900;');
    expect(css).toContain("url('../assets/InterVariable.woff2') format('woff2')");
    expect(css).toContain('font-style: italic;');
    expect(css).toContain("url('../assets/InterVariable-Italic.woff2') format('woff2')");
    expect(fontFaceCss('x.woff2')).toContain("src: url('x.woff2') format('woff2');");
    expect(fontFaceCss('y.woff2', 'italic')).toContain('font-style: italic;');
    const inlined = inlineFontFaceCss();
    expect(inlined).toMatch(/^@font-face \{[\s\S]*data:font\/woff2;base64,d09GMgABAAAA/);
    expect(inlined.match(/@font-face/g)).toHaveLength(2);
    expect(inlined).toContain('font-style: italic;');
  });

  it('is the italic file of the same release, byte for byte', () => {
    const bytes = interItalicBytes();
    expect(bytes.byteLength).toBe(INTER_ITALIC.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(INTER_ITALIC.sha256);
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
    expect(INTER_ITALIC.style).toBe('italic');
    expect(INTER_ITALIC.family).toBe(INTER.family);
  });
});
