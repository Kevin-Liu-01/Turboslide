// The media resolver of a slide render (gslides-parity SPEC-5 3.5; VERIFICATION-5 finding 12, the
// round five fix round): `renderSlide` reads the deck's media records for every poster root, so
// the editor, the show and the export capture write the stored file's URL, its title and its
// duration on `.ts-media[data-media]`, and the show's controller has an element to mount. Before
// the fix no caller passed `ctx.media`, so `data-src` was empty for every stored clip.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Deck, Slide } from '@turboslide/schema/deck';
import { renderSlide } from '../slide.ts';
import type { RenderOptions } from '../slide.ts';

const REPO = resolve(import.meta.dirname, '../../../..');
const FIXTURE_DIR = join(REPO, 'decks/fixture/motion');

const deck = JSON.parse(readFileSync(join(FIXTURE_DIR, 'deck.json'), 'utf8')) as Deck;
const slide = JSON.parse(readFileSync(join(FIXTURE_DIR, 'slides/media.json'), 'utf8')) as Slide;

const options: RenderOptions = {
  theme: 'light',
  chrome: false,
  assetBase: '/decks/motion/',
  blockAttrs: true,
  gtWord: true,
};

function root(html: string, blockId: string): string {
  const match = html.match(new RegExp(`<div\\b[^>]*\\bdata-media="${blockId}"[^>]*>`));
  if (match === null) throw new Error(`no poster root for ${blockId}`);
  return match[0];
}

describe('renderSlide and the deck’s media records', () => {
  it('writes the stored file’s URL under the asset base, the duration and the kind on every poster root, with no warning', () => {
    const { html, warnings } = renderSlide(deck, slide, options);
    const clip = root(html, 'clip');
    expect(clip).toContain('data-kind="video"');
    expect(clip).toContain(`data-src="/decks/motion/${deck.media?.['bars-1s']?.file}"`);
    expect(clip).toContain(`data-duration="${deck.media?.['bars-1s']?.durationMs}"`);
    const tone = root(html, 'tone');
    expect(tone).toContain('data-kind="audio"');
    expect(tone).toContain(`data-src="/decks/motion/${deck.media?.['tone-1s']?.file}"`);
    expect(warnings).toEqual([]);
  });

  it('takes a media resolver for the hosted URL and leaves the picture twins on the asset base', () => {
    const { html } = renderSlide(deck, slide, {
      ...options,
      mediaSrc: (path) => `https://blob.example/decks/motion/${path}`,
    });
    expect(root(html, 'clip')).toContain(
      `data-src="https://blob.example/decks/motion/${deck.media?.['bars-1s']?.file}"`,
    );
    expect(html).not.toContain('data-src=""');
  });

  it('warns once for a media id the deck does not hold and leaves data-src empty', () => {
    const missing = {
      ...slide,
      slots: {
        ...(slide as unknown as { slots: Record<string, unknown[]> }).slots,
        main: (
          slide as unknown as { slots: { main: { id?: string; source?: unknown }[] } }
        ).slots.main.map((block) =>
          block.id === 'clip' ? { ...block, source: { asset: 'gone' } } : block,
        ),
      },
    } as unknown as Slide;
    const { html, warnings } = renderSlide(deck, missing, options);
    expect(root(html, 'clip')).toContain('data-src=""');
    expect(warnings).toEqual(['media#clip: media gone is not in the deck']);
  });
});
