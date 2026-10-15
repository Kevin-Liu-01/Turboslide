import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AGENT_BRANDS } from '@turboslide/chrome/presence/agent-marks';
import { HUES } from '@turboslide/identity/hues';
import { LABEL_NUMBERS, isLabelWord } from '@turboslide/identity/labels';

import { AGENTS, PEOPLE, TITLE_TEXT } from './copy';
import { Title } from './Title';

// The title with its two stacks (docs/SITE.md B): the h1's text content is the sentence alone;
// five people under generated names and the four agents, each a focusable image with its name
// and the product's tooltip, each ringed in a live hue; no name outside the generated labels and
// the four tools.

const html = renderToStaticMarkup(createElement(Title));

/** The h1's text content: the markup's text nodes, entities decoded. */
const textContent = html
  .replace(/<[^>]+>/g, '')
  .replace(/&#x27;/g, "'")
  .replace(/&amp;/g, '&');

const avatars = [...html.matchAll(/<span class="site-av is-(person|agent)"([^>]*)>/g)].map((m) => ({
  kind: m[1],
  attrs: m[2] ?? '',
}));
const attr = (attrs: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1];

describe('the landing’s title', () => {
  it('reads as the sentence alone', () => {
    expect(textContent).toBe(TITLE_TEXT);
    expect(html.startsWith('<h1 id="site-title" class="t-display">')).toBe(true);
  });

  it('carries five people and four agents, each named, focusable and with a tooltip', () => {
    expect(avatars.filter((a) => a.kind === 'person')).toHaveLength(5);
    expect(avatars.filter((a) => a.kind === 'agent')).toHaveLength(4);
    const names = avatars.map((a) => attr(a.attrs, 'aria-label'));
    expect(names).toEqual([
      ...PEOPLE.map((person) => person.name),
      ...AGENTS.map((agent) => AGENT_BRANDS[agent.brand].name),
    ]);
    expect(names.slice(5)).toEqual(['Claude Code', 'Codex', 'OpenClaw', 'Hermes']);
    for (const avatar of avatars) {
      expect(attr(avatar.attrs, 'role')).toBe('img');
      expect(attr(avatar.attrs, 'tabindex')).toBe('0');
      expect(attr(avatar.attrs, 'data-tip')).toBe(attr(avatar.attrs, 'aria-label'));
      const hue = /--ts-hue:\s*(#[0-9a-f]{6})/i.exec(attr(avatar.attrs, 'style') ?? '')?.[1];
      expect(Object.values(HUES)).toContain(hue);
    }
  });

  it('names people only by generated labels', () => {
    for (const person of PEOPLE) {
      const [word, number] = person.name.split(' ');
      expect(isLabelWord(word ?? ''), person.name).toBe(true);
      expect(LABEL_NUMBERS, person.name).toContain(Number(number));
    }
    /* the people's initials come from CSS, so the h1 carries no text but the sentence */
    expect(html).toContain('data-initial="C"');
    expect((html.match(/<svg\b/g) ?? []).length).toBe(4);
  });
});
