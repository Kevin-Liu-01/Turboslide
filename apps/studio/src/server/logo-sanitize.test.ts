import { describe, expect, it } from 'vitest';

import { sanitizeLogoSvg } from './logo-sanitize';

// The sanitizer's rules of the polish round (docs/POLISH.md item 32; audit-objects item 15): a
// wordmark set in type keeps its words and its font attributes, while scripts, event attributes,
// links and external references leave as before (docs/FEATURES.md 4.7). logos.test.ts pins the
// rest of the walk with fixtures.

const ROOT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60">';

describe('sanitizeLogoSvg and text', () => {
  it('keeps text, tspan and textPath with their words and their type attributes', () => {
    const svg = `${ROOT}<defs><path id="arc" d="M10 40 Q100 0 190 40"/></defs><text x="8" y="40" font-family="Inter, sans-serif" font-size="28" font-weight="700" letter-spacing="-0.5" text-anchor="start" dominant-baseline="middle" fill="#111">Acme<tspan dx="4" font-weight="400">Corp</tspan></text><text><textPath href="#arc" startOffset="10%">Along the arc</textPath></text></svg>`;
    const out = sanitizeLogoSvg(svg);
    expect(out.svg).toContain('font-family="Inter, sans-serif"');
    expect(out.svg).toContain('font-size="28" font-weight="700" letter-spacing="-0.5"');
    expect(out.svg).toContain('text-anchor="start" dominant-baseline="middle" fill="#111">Acme');
    expect(out.svg).toContain('<tspan dx="4" font-weight="400">Corp</tspan>');
    expect(out.svg).toContain('<textPath href="#arc" startOffset="10%">Along the arc</textPath>');
    expect(out.removed).toEqual([]);
    expect(out.draws).toBe(false);
  });

  it('drops scripts, event attributes, links and a textPath that reaches out, and keeps the words', () => {
    const svg = `${ROOT}<script>alert(1)</script><text x="8" y="40" onclick="alert(2)" onmouseover="x()" font-size="20">Acme</text><a href="https://acme.example"><text x="8" y="58">Site</text></a><text><textPath href="https://evil.example/p.svg#arc">Hidden</textPath></text></svg>`;
    const out = sanitizeLogoSvg(svg);
    expect(out.svg).not.toMatch(/script|alert|onclick|onmouseover|acme\.example|evil\.example/);
    expect(out.svg).toContain('<text x="8" y="40" font-size="20">Acme</text>');
    /* the textPath stays as an element with its words; its outside href leaves */
    expect(out.svg).toContain('<textPath>Hidden</textPath>');
    expect(out.removed).toEqual(['script', 'a']);
  });

  it('tints the words of a mono logo like a path', () => {
    const svg = `${ROOT}<path d="M0 0h8v8z" fill="#123456"/><text x="20" y="40" fill="#123456" font-size="24">Acme</text></svg>`;
    const out = sanitizeLogoSvg(svg);
    expect(out.svg).toContain('<text x="20" y="40" fill="#123456" font-size="24">Acme</text>');
  });
});
