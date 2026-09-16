// Reflection and Recolor on the picture object (gslides-parity SPEC-5 0.47, 11; MILESTONES-5 B2
// day 6): the mirrored copy under its gradient mask at the sliders' values, the root's clip lifted
// by the reflection's reach, the SVG filter per preset with its id, the duotone floods painted
// from the theme's tokens, the export attributes and the plain picture unchanged when neither
// field is set.
import { describe, expect, it } from 'vitest';

import type { BlockOf } from '@turboslide/schema/blocks';
import { RECOLOR_PRESETS } from '@turboslide/schema/blocks';
import type { BlockContext } from './context.ts';
import {
  NATIVE_RECOLOR_PRESETS,
  PICTURE_EFFECTS_CSS,
  duotoneColors,
  isNativeRecolor,
  recolorDeclaration,
  recolorFilterId,
  recolorFilterSvg,
  reflectionAttr,
  reflectionReach,
  renderPicture,
  renderReflection,
} from './picture.ts';

function context(extra: Partial<BlockContext> = {}): BlockContext {
  return {
    slideId: 'gallery',
    theme: 'light',
    blockAttrs: true,
    gtWord: true,
    page: { width: 1600, height: 900 },
    image: (id) =>
      id === 'photo'
        ? { src: 'decks/t/assets/photo-light.jpg', alt: 'A photo', size: [1600, 900] }
        : undefined,
    assetUrl: (path) => `decks/t/${path}`,
    rasters: [],
    warnings: [],
    rasterCount: 0,
    ...extra,
  };
}

const plain: BlockOf<'picture'> = {
  id: 'pic',
  type: 'picture',
  asset: 'photo',
  pos: { x: 100, y: 100, w: 800, h: 450, z: 1 },
};

describe('renderPicture without effects', () => {
  it('draws the frame and the image as before: no reflection, no filter, no export attributes', () => {
    const html = renderPicture(plain, context());
    expect(html).not.toContain('picture-reflection');
    expect(html).not.toContain('filter:url(');
    expect(html).not.toContain('data-recolor');
    expect(html).not.toContain('data-reflection');
    expect(html).not.toContain('clip-path:inset');
    expect(html).not.toContain('<svg');
  });
});

describe('the reflection (SPEC-5 0.47)', () => {
  const reflected: BlockOf<'picture'> = {
    ...plain,
    adjust: { reflection: { transparency: 0.4, distance: 12, size: 0.5 } },
  };

  it('adds the mirrored copy below the box at the sliders values and lifts the clip by its reach', () => {
    const html = renderPicture(reflected, context());
    expect(html).toContain('class="picture has-reflection"');
    expect(html).toContain('data-reflection="0.4,12,0.5"');
    // the wrapper: 12 px below the box, half the box high, at 1 - 0.4 opacity
    expect(html).toContain('class="picture-reflection"');
    expect(html).toContain('top:calc(100% + 12px)');
    expect(html).toContain('height:50%');
    expect(html).toContain('opacity:0.6');
    // the image inside is the whole picture (twice the wrapper) so the bottom edge meets the top
    expect(html).toMatch(/picture-reflection[^>]*>\s*<img[^>]*style="height:200%"/);
    // the reach: 12 + 0.5 by 450
    expect(reflectionReach(reflected.adjust!.reflection!, 450)).toBe(237);
    expect(html).toContain('clip-path:inset(0 0 -237px 0)');
  });

  it('draws nothing for a zero size, a missing image or no reflection', () => {
    expect(renderReflection(undefined, { src: 'x', alt: '' }, false)).toBe('');
    expect(
      renderReflection({ transparency: 0, distance: 0, size: 0 }, { src: 'x', alt: '' }, false),
    ).toBe('');
    expect(
      renderReflection({ transparency: 0, distance: 0, size: 0.3 }, { src: '', alt: '' }, false),
    ).toBe('');
    expect(reflectionAttr(undefined)).toBeUndefined();
  });
});

describe('the recolor (SPEC-5 0.47)', () => {
  it('names the native presets: grayscale and the fourteen duotones, never sepia or negative', () => {
    expect(NATIVE_RECOLOR_PRESETS).toHaveLength(15);
    expect(isNativeRecolor('grayscale')).toBe(true);
    expect(isNativeRecolor('ink-light')).toBe(true);
    expect(isNativeRecolor('sepia')).toBe(false);
    expect(isNativeRecolor('negative')).toBe(false);
    expect(isNativeRecolor('none')).toBe(false);
    // every preset of the schema is a matrix or a duotone
    for (const preset of RECOLOR_PRESETS) {
      if (preset === 'none') expect(recolorFilterSvg(preset, 'f')).toBe('');
      else expect(recolorFilterSvg(preset, 'f')).toContain('<filter id="f"');
    }
  });

  it('builds a duotone from the theme colours: light to paper, dark from ink, ink dark to titanium', () => {
    expect(duotoneColors('green-light')).toEqual({ shadow: 'green', highlight: 'paper' });
    expect(duotoneColors('green-dark')).toEqual({ shadow: 'ink', highlight: 'green' });
    expect(duotoneColors('ink-2-light')).toEqual({ shadow: 'ink-2', highlight: 'paper' });
    expect(duotoneColors('ink-dark')).toEqual({ shadow: 'ink', highlight: 'titanium' });
    expect(duotoneColors('grayscale')).toBeNull();
    expect(duotoneColors('sepia')).toBeNull();
    const svg = recolorFilterSvg('ink-light', 'f');
    expect(svg).toContain('flood-color:var(--paper)');
    expect(svg).toContain('flood-color:var(--ink)');
    expect(svg).toContain('type="saturate" values="0"');
    // the semantic hues are hex, never a token the sheet lacks
    expect(recolorFilterSvg('amber-light', 'f')).toContain('flood-color:#f0a020');
  });

  it('writes the filter on the image, the svg in the root and the export attributes', () => {
    const block: BlockOf<'picture'> = { ...plain, adjust: { recolor: 'grayscale' } };
    const html = renderPicture(block, context());
    const id = recolorFilterId('gallery', 'pic');
    expect(id).toBe('ts-recolor-gallery-pic');
    expect(html).toContain(`filter:url(#${id})`);
    expect(html).toContain(`<filter id="${id}"`);
    expect(html).toContain('type="saturate" values="0"');
    expect(html).toContain('data-recolor="grayscale"');
    expect(html).toContain('data-recolor-native="1"');
    expect(html).toContain('has-recolor');
    const baked = renderPicture({ ...plain, adjust: { recolor: 'sepia' } }, context());
    expect(baked).toContain('data-recolor="sepia"');
    expect(baked).not.toContain('data-recolor-native');
    expect(renderDeclaration()).toBe(false);
    function renderDeclaration() {
      return recolorDeclaration('none', id);
    }
    // the reflection carries the filter too
    const both = renderPicture(
      {
        ...plain,
        adjust: { recolor: 'negative', reflection: { transparency: 0, distance: 0, size: 0.25 } },
      },
      context(),
    );
    expect(both.match(new RegExp(`filter:url\\(#${id}\\)`, 'g'))).toHaveLength(2);
  });

  it('ships the stylesheet the block CSS appends: the wrapper, the flipped image and the native shoot rule', () => {
    expect(PICTURE_EFFECTS_CSS).toContain(
      '.ts-sheet .picture.has-reflection { overflow: visible; }',
    );
    expect(PICTURE_EFFECTS_CSS).toContain('transform: scaleY(-1)');
    expect(PICTURE_EFFECTS_CSS).toContain('mask-image: linear-gradient(to bottom');
    expect(PICTURE_EFFECTS_CSS).toContain(
      '[data-native-blips] .picture[data-recolor-native] > img.picture-img { filter: none; }',
    );
  });
});
