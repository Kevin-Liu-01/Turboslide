import { describe, expect, test } from 'vitest';

import { SOURCE_RULES } from './config.ts';
import type { BrandRuleId } from './config.ts';
import { isAllowedRadius, isTitleCaseLabel, lintSource } from './source.ts';

/** The rule ids a snippet raises, in order. */
function rulesOf(text: string, file = 'packages/chrome/src/Fixture.tsx'): BrandRuleId[] {
  return lintSource(file, text).map((f) => f.rule);
}

describe('the thirteen gt-ui rules over the TypeScript syntax tree (P:.oxlintrc.json 38 to 50)', () => {
  test('every source rule is one of the thirteen, under its source name', () => {
    expect(SOURCE_RULES).toHaveLength(13);
    expect(SOURCE_RULES.every((r) => r.startsWith('gt-ui/'))).toBe(true);
  });

  test('no-em-dash reads strings, template parts and JSX text, never comments or regular expressions', () => {
    expect(rulesOf("const a = 'One — two';")).toEqual(['gt-ui/no-em-dash']);
    expect(rulesOf('const a = `One — ${b}`;')).toEqual(['gt-ui/no-em-dash']);
    expect(rulesOf('const a = <p>One — two</p>;')).toEqual(['gt-ui/no-em-dash']);
    expect(rulesOf('// a comment — here\nconst a = /—/;')).toEqual([]);
  });

  test('no-heading-period reads the last static piece of a heading, through inline wrappers', () => {
    expect(rulesOf('const a = <h2>Your presentations.</h2>;')).toEqual(['gt-ui/no-heading-period']);
    expect(rulesOf("const a = <h1><span>{gt('Sign in.')}</span></h1>;")).toEqual([
      'gt-ui/no-heading-period',
    ]);
    expect(rulesOf('const a = <h2>Your presentations</h2>;')).toEqual([]);
    expect(rulesOf('const a = <h2>Loading...</h2>;')).toEqual([]);
    expect(rulesOf('const a = <p>A sentence.</p>;')).toEqual([]);
  });

  test("cta-title-case reads a button's static label and a ToolButton's label, never data or a tooltip", () => {
    expect(rulesOf('const a = <button type="button">Copy link</button>;')).toEqual([
      'gt-ui/cta-title-case',
    ]);
    expect(
      rulesOf('const a = <ToolButton label="Copy link" title="Copy link" onClick={f} />;'),
    ).toEqual(['gt-ui/cta-title-case']);
    expect(rulesOf("const a = <button>{open ? 'Hide details' : 'Show Details'}</button>;")).toEqual(
      ['gt-ui/cta-title-case'],
    );
    expect(rulesOf('const a = <button type="button">Copy Link</button>;')).toEqual([]);
    expect(rulesOf('const a = <button>Sign In to the Deck</button>;')).toEqual([]);
    expect(rulesOf('const a = <button>{count} slides</button>;')).toEqual([]);
    expect(
      rulesOf('const a = <ToolButton label="Share" title="Share with people" onClick={f} />;'),
    ).toEqual([]);
    expect(isTitleCaseLabel('Move to Trash')).toBe(true);
    expect(isTitleCaseLabel('Move to trash')).toBe(false);
  });

  test('no-smooth-scroll reads a page scroll, never an element track', () => {
    expect(rulesOf("el.scrollIntoView({ block: 'start', behavior: 'smooth' });")).toEqual([
      'gt-ui/no-smooth-scroll',
    ]);
    expect(rulesOf("window.scrollTo({ top: 0, behavior: 'smooth' });")).toEqual([
      'gt-ui/no-smooth-scroll',
    ]);
    expect(rulesOf("el.style.scrollBehavior = 'smooth';")).toEqual(['gt-ui/no-smooth-scroll']);
    expect(rulesOf("const a = <div style={{ scrollBehavior: 'smooth' }} />;")).toEqual([
      'gt-ui/no-smooth-scroll',
    ]);
    expect(rulesOf("import Lenis from 'lenis';")).toEqual(['gt-ui/no-smooth-scroll']);
    expect(rulesOf("list.scrollTo({ top: 0, behavior: 'smooth' });")).toEqual([]);
    expect(rulesOf("el.scrollIntoView({ block: 'start', behavior: 'auto' });")).toEqual([]);
  });

  test('icon-tiers: every glyph comes from the theme sprite (AGENTS.md code rules)', () => {
    expect(rulesOf("import { Check } from 'lucide-react';")).toEqual(['gt-ui/icon-tiers']);
    expect(rulesOf("import { CheckIcon } from '@heroicons/react/24/solid';")).toEqual([
      'gt-ui/icon-tiers',
    ]);
    expect(rulesOf("import { Icon } from './icons';")).toEqual([]);
  });

  test('inter-only reads an inline fontFamily, next/font/google and localFont', () => {
    expect(rulesOf("const a = <p style={{ fontFamily: 'Georgia, serif' }} />;")).toEqual([
      'gt-ui/inter-only',
    ]);
    expect(rulesOf("const s = { fontFamily: 'var(--pt-text)' };")).toEqual([]);
    expect(rulesOf('const s = { fontFamily: family.css };')).toEqual([]);
    expect(rulesOf("import { Lora } from 'next/font/google';")).toEqual(['gt-ui/inter-only']);
    expect(rulesOf("const f = localFont({ src: './Lora.woff2' });")).toEqual(['gt-ui/inter-only']);
  });

  test('mono-is-not-voice reads a heading or a paragraph set in mono', () => {
    expect(
      rulesOf("const a = <p style={{ fontFamily: 'ui-monospace, monospace' }}>x</p>;"),
    ).toEqual(['gt-ui/mono-is-not-voice']);
    expect(rulesOf('const a = <h3 className="ts-x-mono">Title</h3>;')).toEqual([
      'gt-ui/mono-is-not-voice',
    ]);
    expect(rulesOf('const a = <dd className="ts-asset-mono">{id}</dd>;')).toEqual([]);
  });

  test('no-eyebrow reads an inline uppercase style with positive tracking', () => {
    expect(
      rulesOf(
        "const a = <span style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }} />;",
      ),
    ).toEqual(['gt-ui/no-eyebrow']);
    expect(
      rulesOf("const a = <span style={{ textTransform: 'uppercase', letterSpacing: 0 }} />;"),
    ).toEqual([]);
  });

  test('no-gif-mark reads a gif import and a media source', () => {
    expect(rulesOf("import mark from './mark.gif';")).toEqual(['gt-ui/no-gif-mark']);
    expect(rulesOf('const a = <img src="/mark.gif" alt="" />;')).toEqual(['gt-ui/no-gif-mark']);
    expect(rulesOf('const a = <img src="/mark.svg" alt="" />;')).toEqual([]);
  });

  test('no-hex-colors reads a hex value in a style or class attribute, never a canvas string', () => {
    expect(rulesOf("const a = <div style={{ color: '#2f5ce0' }} />;")).toEqual([
      'gt-ui/no-hex-colors',
    ]);
    expect(rulesOf("const a = <div style={{ border: '1px solid #fff' }} />;")).toEqual([
      'gt-ui/no-hex-colors',
    ]);
    expect(rulesOf("ctx.fillStyle = '#2f5ce0';")).toEqual([]);
  });

  test('no-raw-locale-flags reads a sprite class in a class attribute and an emoji flag', () => {
    expect(rulesOf('const a = <span className="fi fi-fr" />;')).toEqual([
      'gt-ui/no-raw-locale-flags',
    ]);
    expect(rulesOf("const a = '\u{1F1EB}\u{1F1F7}';")).toEqual(['gt-ui/no-raw-locale-flags']);
    expect(rulesOf("const locales = ['fi', 'fr'];")).toEqual([]);
  });

  test('single-rail reads the retired outer rail and a rail wrapper nested in another', () => {
    expect(rulesOf('const a = <div className="ts-rail-outer" />;')).toEqual(['gt-ui/single-rail']);
    expect(
      rulesOf(
        'const a = <div className="ts-rail"><section><div className="ts-rail" /></section></div>;',
      ),
    ).toEqual(['gt-ui/single-rail']);
    expect(
      rulesOf('const a = <div className="ts-rail"><section className="ts-band" /></div>;'),
    ).toEqual([]);
  });

  test('typed-text-var reads an untyped var() in a Tailwind text utility', () => {
    expect(rulesOf('const a = <p className="text-[var(--size)]" />;')).toEqual([
      'gt-ui/typed-text-var',
    ]);
    expect(rulesOf('const a = <p className="text-[length:var(--size)]" />;')).toEqual([]);
  });

  test('an inline radius keeps the radius rule', () => {
    expect(rulesOf("const a = <div style={{ borderRadius: '4px' }} />;")).toEqual(['css/radius']);
    expect(rulesOf("const a = <div style={{ borderRadius: 'var(--pt-radius)' }} />;")).toEqual([]);
    expect(rulesOf("const a = <div style={{ borderRadius: 'var(--pt-radius-lg)' }} />;")).toEqual(
      [],
    );
    expect(rulesOf('const a = <div style={{ borderRadius: 0 }} />;')).toEqual([]);
    expect(isAllowedRadius('calc(var(--pt-radius) - 1px)')).toBe(true);
    expect(isAllowedRadius('var(--pt-radius, 6px)')).toBe(true);
    expect(isAllowedRadius('50%')).toBe(true);
    expect(isAllowedRadius('0 !important')).toBe(true);
    expect(isAllowedRadius('8px 0 0 8px')).toBe(false);
  });

  test('the inline forms of the design round: z-index, shadows, scrollbars, numerals, alternates', () => {
    expect(rulesOf('const a = <div style={{ zIndex: 2 }} />;')).toEqual([]);
    expect(rulesOf('const a = <div style={{ zIndex: -1 }} />;')).toEqual([]);
    expect(rulesOf("const a = <div style={{ zIndex: 'var(--ts-layer-toast)' }} />;")).toEqual([]);
    expect(rulesOf('const a = <div style={{ zIndex: 30 + level }} />;')).toEqual(['css/z-index']);
    expect(rulesOf("const a = { zIndex: '10' };")).toEqual(['css/z-index']);
    expect(rulesOf('el.style.zIndex = String(LAYERS[layer]);')).toEqual([]);
    expect(rulesOf("el.style.zIndex = '40';")).toEqual(['css/z-index']);
    expect(rulesOf("st.zIndex = '3';")).toEqual([]);
    expect(rulesOf("const a = { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' };")).toEqual([
      'css/no-shadow',
    ]);
    expect(rulesOf("const a = { boxShadow: 'var(--pt-ring)' };")).toEqual([]);
    expect(rulesOf("const a = { scrollbarWidth: 'thin' };")).toEqual(['css/scrollbar']);
    expect(rulesOf("const a = { scrollbarWidth: 'none' };")).toEqual([]);
    expect(rulesOf("const css = '.x::-webkit-scrollbar { width: 4px }';")).toEqual([
      'css/scrollbar',
    ]);
    expect(rulesOf("const css = '.x::-webkit-scrollbar { display: none }';")).toEqual([]);
    expect(
      lintSource(
        'packages/viewer/standalone/chrome.ts',
        "const css = '.x::-webkit-scrollbar { width: 8px }';",
      ),
    ).toEqual([]);
    expect(rulesOf("const a = { fontVariantNumeric: 'tabular-nums' };")).toEqual(['css/numerals']);
    expect(rulesOf("const css = '.n { font-variant-numeric: tabular-nums; }';")).toEqual([
      'css/numerals',
    ]);
    expect(rulesOf("const numerals = 'tabular';")).toEqual([]);
    expect(
      lintSource(
        'packages/viewer/standalone/chrome.ts',
        "const css = ':root { --numerals: tabular-nums; } .n { font-variant-numeric: var(--numerals); }';",
      ),
    ).toEqual([]);
    expect(rulesOf("const a = { fontFeatureSettings: \"'cv11', 'ss01'\" };")).toEqual([
      'css/chrome-alternates',
    ]);
    expect(rulesOf("const css = 'h1 { font-feature-settings: \\'ss01\\'; }';")).toEqual([
      'css/chrome-alternates',
    ]);
    expect(rulesOf("const id = 'ss01';")).toEqual([]);
  });

  test('a file that does not parse is a parse finding, never a pass', () => {
    expect(rulesOf('const a = <div>;')[0]).toBe('brand/parse');
  });
});
