import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AGENT_BRANDS } from '@turboslide/chrome/presence/agent-marks';
import { HUES } from '@turboslide/identity/hues';
import { LABEL_NUMBERS, isLabelWord } from '@turboslide/identity/labels';

import { AGENTS, AVATAR_PRESS, PEOPLE, TITLE_TEXT } from './copy';
import { HAIR, portraitFor } from './Portrait';
import { Title } from './Title';
import { isTryPress } from './try-frame';

// The title with its two arcs (docs/SITE.md B): the h1's text content and its name are the
// sentence alone; five people under generated names, each a generated portrait with its own hair
// cut, and the four agents, each a button with its name, the sentence of what pressing does and
// a live hue; one tab stop per stack; no name outside the generated labels and the four tools;
// the press each avatar sends is one the frame protocol takes.

const html = renderToStaticMarkup(createElement(Title));

/** The h1's text content: the markup's text nodes, entities decoded. */
const textContent = html
  .replace(/<[^>]+>/g, '')
  .replace(/&#x27;/g, "'")
  .replace(/&amp;/g, '&');

const avatars = [
  ...html.matchAll(/<button type="button" class="site-av is-(person|agent)"([^>]*)>/g),
].map((m) => ({ kind: m[1], attrs: m[2] ?? '' }));
const attr = (attrs: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1];

describe('the landing’s title', () => {
  it('reads as the sentence alone', () => {
    expect(textContent).toBe(TITLE_TEXT);
    expect(
      html.startsWith(
        `<h1 id="site-title" class="t-display" aria-label="${TITLE_TEXT}">Presentations for `,
      ),
    ).toBe(true);
  });

  it('carries five people and four agents, each a named button with what pressing does', () => {
    expect(avatars.filter((a) => a.kind === 'person')).toHaveLength(5);
    expect(avatars.filter((a) => a.kind === 'agent')).toHaveLength(4);
    const names = avatars.map((a) => attr(a.attrs, 'aria-label'));
    expect(names).toEqual([
      ...PEOPLE.map((person) => person.name),
      ...AGENTS.map((agent) => AGENT_BRANDS[agent.brand].name),
    ]);
    expect(names.slice(5)).toEqual(['Claude Code', 'Codex', 'OpenClaw', 'Hermes']);
    for (const avatar of avatars) {
      expect(attr(avatar.attrs, 'data-name')).toBe(attr(avatar.attrs, 'aria-label'));
      expect(attr(avatar.attrs, 'aria-describedby')).toBe(
        avatar.kind === 'person' ? AVATAR_PRESS.person.id : AVATAR_PRESS.agent.id,
      );
      const hue = /--ts-hue:\s*(#[0-9a-f]{6})/i.exec(attr(avatar.attrs, 'style') ?? '')?.[1];
      expect(Object.values(HUES)).toContain(hue);
    }
  });

  it('gives each stack one tab stop', () => {
    const stops = avatars.map((a) => attr(a.attrs, 'tabindex'));
    expect(stops).toEqual(['0', '-1', '-1', '-1', '-1', '0', '-1', '-1', '-1']);
    expect(html).toContain('role="group" aria-label="People"');
    expect(html).toContain('role="group" aria-label="Agents"');
  });

  it('names people only by generated labels and draws each a portrait of their own', () => {
    for (const person of PEOPLE) {
      const [word, number] = person.name.split(' ');
      expect(isLabelWord(word ?? ''), person.name).toBe(true);
      expect(LABEL_NUMBERS, person.name).toContain(Number(number));
    }
    const hair = [...html.matchAll(/<svg class="site-face"[^>]*data-hair="([a-z]+)"/g)].map(
      (m) => m[1],
    );
    expect(hair).toHaveLength(5);
    expect(new Set(hair).size).toBe(5);
    /* the same name draws the same portrait */
    expect(portraitFor('Cobalt 118', 0)).toEqual(portraitFor('Cobalt 118', 0));
    expect(HAIR).toContain(portraitFor('Argon 905', 1).hair);
    /* four marks and five portraits, no text: the h1's text stays the sentence */
    expect((html.match(/<svg\b/g) ?? []).length).toBe(9);
    expect(html).not.toContain('<text');
  });

  it('sends presses the frame protocol takes', () => {
    for (const person of PEOPLE)
      expect(
        isTryPress({
          type: 'ts-try:press',
          who: { kind: 'person', name: person.name, hue: person.hue },
        }),
      ).toBe(true);
    for (const agent of AGENTS)
      expect(isTryPress({ type: 'ts-try:press', who: { kind: 'agent', brand: agent.brand } })).toBe(
        true,
      );
    expect(isTryPress({ type: 'ts-try:press', who: { kind: 'agent', brand: 'other' } })).toBe(
      false,
    );
    expect(
      isTryPress({ type: 'ts-try:press', who: { kind: 'person', name: 'Cobalt 118', hue: 9 } }),
    ).toBe(false);
  });
});
