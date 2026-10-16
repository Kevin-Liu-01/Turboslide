import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AGENT_BRANDS, AGENT_BRAND_IDS, AgentMark, isAgentBrand } from '../presence/agent-marks';

// The four agent marks inlined from thesvg.org (docs/SITE.md D6): each renders one svg on the
// 24 unit grid with path data alone (no script, event attribute, external reference, style or
// text node came in with a fetched file), each is recorded under MIT by the product's own logo
// index snapshot, a mark that does not read on ink either draws in `currentColor` or switches to
// ink in the dark appearance, and THIRD_PARTY_NOTICES.md names every slug and variant.

const root = new URL('../../../../', import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, root), 'utf8');

type SnapshotIcon = {
  slug: string;
  license: string;
  variants: Record<string, string>;
  readsOnPaper?: boolean;
  readsOnInk?: boolean;
};
const snapshot = JSON.parse(read('apps/studio/src/server/logo-index.snapshot.json')) as {
  icons: SnapshotIcon[];
};

const markup = (brand: (typeof AGENT_BRAND_IDS)[number]): string =>
  renderToStaticMarkup(createElement(AgentMark, { brand, size: 24 }));

describe('the agent marks', () => {
  it('are the four tools in the order the pages name them', () => {
    expect(AGENT_BRAND_IDS).toEqual(['claude-code', 'codex', 'openclaw', 'hermes']);
    expect(AGENT_BRAND_IDS.map((brand) => AGENT_BRANDS[brand].name)).toEqual([
      'Claude Code',
      'Codex',
      'OpenClaw',
      'Hermes',
    ]);
    expect(isAgentBrand('codex')).toBe(true);
    expect(isAgentBrand('toString')).toBe(false);
    expect(isAgentBrand('hermes-agent')).toBe(false);
  });

  it('render one hidden svg of path data, with nothing a fetched file could carry', () => {
    for (const brand of AGENT_BRAND_IDS) {
      const html = markup(brand);
      expect(html.match(/<svg\b/g), brand).toHaveLength(1);
      expect(html, brand).toContain('viewBox="0 0 24 24"');
      expect(html, brand).toContain('aria-hidden="true"');
      expect(html, brand).not.toMatch(
        /<(?:script|style|title|desc|text|image|use|a|foreignObject)\b/i,
      );
      expect(html, brand).not.toMatch(/\son[a-z]+=|href=|url\(/i);
      /* no text node: every element is an svg or a path, and nothing sits between the tags */
      expect(html.replace(/<\/?(?:svg|path)\b[^>]*>/g, ''), brand).toBe('');
      for (const path of AGENT_BRANDS[brand].paths)
        expect(path.d, brand).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/);
    }
  });

  it('keep each brand’s own colour, and a colour that does not read on ink switches there', () => {
    expect(markup('claude-code')).toContain('color="#d97757"');
    expect(markup('openclaw')).toContain('color="#ff4d4d"');
    expect(markup('hermes')).toContain('color="#2d6376"');
    expect(markup('hermes')).toContain('data-ink-on-dark=""');
    expect(markup('codex')).not.toContain('color=');
    const css = read('packages/chrome/src/presence/agent-marks.css');
    expect(css).toMatch(/:root\[data-theme='dark'\] \.ts-agent-mark\[data-ink-on-dark\]/);
    for (const brand of AGENT_BRAND_IDS) {
      const mark = AGENT_BRANDS[brand];
      const icon = snapshot.icons.find((each) => each.slug === mark.slug);
      expect(icon, mark.slug).toBeDefined();
      expect(icon?.license, mark.slug).toBe('MIT');
      expect(mark.licence).toBe('MIT');
      expect(Object.keys(icon?.variants ?? {}), mark.slug).toContain(mark.variant);
      expect(icon?.readsOnPaper, mark.slug).toBe(true);
      if (icon?.readsOnInk === false)
        expect(mark.fill === 'currentColor' || mark.inkOnDark, mark.slug).toBe(true);
      expect(mark.source).toBe(`https://thesvg.org/icons/${mark.slug}/${mark.variant}.svg`);
    }
  });

  it('are named in the third party notices with their slugs and variants', () => {
    const notices = read('THIRD_PARTY_NOTICES.md');
    expect(notices).toContain('packages/chrome/src/presence/agent-marks.tsx');
    for (const brand of AGENT_BRAND_IDS) {
      const mark = AGENT_BRANDS[brand];
      expect(notices, mark.slug).toContain(`\`${mark.slug}/${mark.variant}\``);
    }
  });
});
