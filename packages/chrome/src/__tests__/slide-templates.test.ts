import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { slideBlocks } from '@turboslide/schema/deck';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { WORKED_DECK, workedDocument } from '@turboslide/schema/fixtures';
import { validateDeck } from '@turboslide/schema/validate';

import { PLACEHOLDER, SLIDE_TEMPLATES, isPlaceholderText, pickAsset } from '../slide-templates';

// The slide templates: every archetype makes a slide the validator accepts against the worked
// deck, every text on it is placeholder copy in the contrast-pair shape the copy linter flags
// (packages/lint/src/static/copy.ts, the same pattern), the picture and figure templates take an
// asset by role and are withheld from a deck with no assets, and the committed template record
// (decks/templates/gt-brand/template.json) lists the same archetype ids.
const TEMPLATE_JSON = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'decks',
  'templates',
  'gt-brand',
  'template.json',
);

/** copy/contrast-pair as the linter writes it. */
const CONTRAST_PAIR = /(,\s*not\b)|(\bnot\b[^.;:!?,]*,\s*(but|only|just|rather)\b)/i;

function texts(slide: Slide): string[] {
  const out: string[] = [];
  if (slide.kind === 'title') out.push(slide.heading, slide.lead);
  if (slide.kind === 'statement') out.push(slide.big);
  for (const { block } of slideBlocks(slide)) {
    const walk = (value: unknown): void => {
      if (typeof value === 'string') return;
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
          /* an icon's name is not copy */
          if (key === 'icon' || key === 'state') continue;
          if (
            typeof item === 'string' &&
            ['text', 'value', 'key', 'caption', 'label', 'sub', 'name', 'note', 'quote'].includes(
              key,
            )
          )
            out.push(item);
          else walk(item);
        }
      }
    };
    walk(block);
  }
  return out;
}

describe('SLIDE_TEMPLATES', () => {
  const document = workedDocument();

  it('makes a valid slide per template against the worked deck, with placeholder copy on every text', () => {
    for (const template of SLIDE_TEMPLATES) {
      const slide = template.make(`new-${template.id}`, document.deck, 'brand');
      expect(slide, template.id).not.toBeNull();
      if (!slide) continue;
      expect(slide.kind).toBe(template.kind);
      if (slide.kind === 'content') expect(slide.layout.type).toBe(template.layout);
      const result = validateDeck({
        deck: document.deck,
        slides: { ...document.slides, [slide.id]: slide },
      });
      const blocking = result.issues.filter(
        (issue) => issue.severity === 3 && issue.file.includes(slide.id),
      );
      expect(blocking, `${template.id}: ${blocking.map((i) => i.message).join('; ')}`).toEqual([]);
      const lines = texts(slide).filter((text) => text !== 'example.com');
      expect(lines.length, template.id).toBeGreaterThan(0);
      for (const line of lines) {
        expect(isPlaceholderText(line), `${template.id}: ${line}`).toBe(true);
        expect(CONTRAST_PAIR.test(line), `${template.id}: ${line}`).toBe(true);
      }
    }
  });

  it('withholds the templates that need an asset from a deck without one', () => {
    const bare: Deck = { ...WORKED_DECK, assets: {} };
    const offered = SLIDE_TEMPLATES.filter(
      (template) => template.make('x', bare, 'brand') !== null,
    );
    expect(offered.map((template) => template.id)).toEqual([
      'title',
      'statement',
      'cols',
      'split',
      'rows',
      'plain',
      'board',
      'matrix',
    ]);
  });

  it('picks assets by role in order of preference', () => {
    expect(pickAsset(WORKED_DECK, ['mood', 'opener'])?.id).toBe('mood-earth');
    expect(pickAsset(WORKED_DECK, ['opener'])?.id).toBe('liquid-metal-diamond');
    expect(pickAsset(WORKED_DECK, ['detail', 'capture'])?.id).toBe('site-home');
    expect(pickAsset({ ...WORKED_DECK, assets: {} }, ['capture'])).toBeUndefined();
  });

  it('agrees with the committed template record on the archetype ids', () => {
    const record = JSON.parse(readFileSync(TEMPLATE_JSON, 'utf8')) as {
      archetypes: { id: string; kind: string; layout?: string }[];
    };
    expect(record.archetypes.map((entry) => entry.id)).toEqual(
      SLIDE_TEMPLATES.map((template) => template.id),
    );
    for (const entry of record.archetypes) {
      const template = SLIDE_TEMPLATES.find((candidate) => candidate.id === entry.id);
      expect(template?.kind).toBe(entry.kind);
      expect(template?.layout).toBe(entry.layout);
    }
    expect(Object.values(PLACEHOLDER).every((line) => CONTRAST_PAIR.test(line))).toBe(true);
  });
});
