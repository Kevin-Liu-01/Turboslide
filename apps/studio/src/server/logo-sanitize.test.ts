import { describe, expect, it } from 'vitest';

import { LogoBrokenError, sanitizeLogoSvg } from './logo-sanitize';

// The sanitizer's rules of the polish round (docs/archive/rounds/POLISH.md item 32; audit-objects item 15): a
// wordmark set in type keeps its words and its font attributes, while scripts, event attributes,
// links and external references leave as before (docs/archive/rounds/FEATURES.md 4.7). logos.test.ts pins the
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

// What the fuzz harness found on origin/main f7e97039 (hardening HR-N#2,
// logo-sanitize.fuzz.test.ts): a reference past U+10FFFF and nesting deep enough to overflow the
// walk threw a RangeError (the route answered 500), a reference to a character XML forbids made a
// file no browser reads, and CSS escapes or a quoted address in image-set( carried a load past the
// url( rule. Each is now a broken file or a dropped attribute or style.
describe('sanitizeLogoSvg and the fuzz findings', () => {
  it('refuses a reference to a code point past U+10FFFF or one XML forbids, as a broken file', () => {
    for (const reference of ['&#x110000;', '&#99999999;', '&#0;', '&#1;', '&#xD800;', '&#xFFFE;'])
      expect(() => sanitizeLogoSvg(`${ROOT}<title>a${reference}</title></svg>`)).toThrow(
        LogoBrokenError,
      );
    expect(() => sanitizeLogoSvg(`${ROOT}<title>a\u0000</title></svg>`)).toThrow(LogoBrokenError);
    expect(sanitizeLogoSvg(`${ROOT}<title>a&#x1F600;&#9;</title></svg>`).svg).toContain(
      '<title>a\u{1F600}\t</title>',
    );
  });

  it('refuses an element deeper than 256 levels as a broken file and keeps one at 256', () => {
    const nested = (depth: number): string =>
      `${ROOT}${'<g>'.repeat(depth)}<path d="M0 0h1v1z"/>${'</g>'.repeat(depth)}</svg>`;
    expect(sanitizeLogoSvg(nested(254)).svg).toContain('<path d="M0 0h1v1z"/>');
    expect(() => sanitizeLogoSvg(nested(255))).toThrow(LogoBrokenError);
    expect(() => sanitizeLogoSvg(nested(20_000), { maxBytes: 2 * 1024 * 1024 })).toThrow(
      LogoBrokenError,
    );
  });

  it('reads CSS escapes and the string forms before it keeps a style or an attribute', () => {
    const style = (css: string) =>
      sanitizeLogoSvg(`${ROOT}<style>${css}</style><path d="M0 0h1v1z"/></svg>`);
    for (const css of [
      '@\\69mport "https://evil.example/a.css";',
      'path{fill:u\\72l(https://evil.example/x)}',
      'svg{background:image-set("https://evil.example/x.png" 1x)}',
      'svg{background:image("https://evil.example/x.png")}',
    ]) {
      const out = style(css);
      expect(out.removed, css).toEqual(['style']);
      expect(out.svg, css).not.toContain('evil.example');
    }
    expect(style("path{fill:url('#a')}").svg).toContain("<style>path{fill:url('#a')}</style>");
    const attributes = sanitizeLogoSvg(
      `${ROOT}<path d="M0 0h1v1z" fill="u\\72l(https://evil.example/x)" mask="\\75 rl(https://evil.example/x)" style="fill:u\\rl(https://evil.example/x)" stroke="url(#a)"/></svg>`,
    );
    expect(attributes.svg).toContain('<path d="M0 0h1v1z" stroke="url(#a)"/>');
  });
});
