import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { ContentSlide } from '@turboslide/schema/deck';
import { ladderStepDown } from '@turboslide/schema/typography';

import {
  BODY_SLOT,
  freeRectanglesOf,
  PICTURE_MARGIN,
  pictureBodyRect,
  pictureInsertArea,
  pictureInsertBox,
  pictureNameOf,
  sniffPictureKind,
  SVG_BROKEN_SENTENCE,
  SVG_TOO_LARGE_SENTENCE,
  uploadFailureOf,
  uploadFailureSentence,
  urlFailureSentence,
} from '../picture-place';
import { shrinkMutation } from '../text-fit';

// Where a new picture lands, what a refused upload says and the shrink step of a text box
// (docs/PRODUCT.md section 2 rank 10, section 5 "Pictures" and "Autofit").

describe('pictureInsertBox', () => {
  it('centres the picture in the body slot at the largest size that keeps the 40 px margin', () => {
    const [x, y, w, h] = pictureInsertBox([400, 300]);
    const [ax, ay, aw, ah] = BODY_SLOT;
    expect(h).toBe(ah - 2 * PICTURE_MARGIN);
    expect(w).toBe(Math.round(((ah - 2 * PICTURE_MARGIN) * 400) / 300));
    expect(x).toBe(Math.round(ax + (aw - w) / 2));
    expect(y).toBe(Math.round(ay + (ah - h) / 2));
    expect(x).toBeGreaterThanOrEqual(ax + PICTURE_MARGIN);
    expect(x + w).toBeLessThanOrEqual(ax + aw - PICTURE_MARGIN);
  });

  it('keeps the picture aspect for a wide picture and fits its width', () => {
    const [, , w, h] = pictureInsertBox([1600, 400]);
    expect(w).toBe(BODY_SLOT[2] - 2 * PICTURE_MARGIN);
    expect(h).toBe(Math.round((w * 400) / 1600));
  });

  it('reads an unknown size as 16:9 and takes another area', () => {
    expect(pictureInsertBox(undefined, [0, 0, 1600, 900], 0)).toEqual([0, 0, 1600, 900]);
    expect(pictureInsertBox([0, 0], [100, 100, 800, 450], 0)).toEqual([100, 100, 800, 450]);
  });
});

/** A canvas slide with the given objects (the shape of Freeform.tsx toFreeform's result). */
function canvas(main: Block[]): ContentSlide {
  return {
    schemaVersion: 1,
    id: 's',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: { main },
  };
}
const heading: Block = {
  id: 'h',
  type: 'heading',
  level: 'h1',
  text: 'Quarterly review',
  pos: { x: 137, y: 129, w: 1326, h: 96, z: 0 },
};
const emptyBody: Block = {
  id: 'p1',
  type: 'paragraph',
  text: '',
  pos: { x: 137, y: 289, w: 901, h: 482, z: 1 },
};

describe('pictureInsertArea (rank 10: the body slot a new picture takes)', () => {
  it('fills the empty body placeholder of the layout and takes its place', () => {
    const placed = pictureInsertArea(canvas([heading, emptyBody]), [120, 80]);
    expect(placed.area).toEqual([137, 289, 901, 482]);
    expect(placed.replaces).toEqual(['p1']);
    // the picture centred in it with the 40 px margin, the spec's reading of the row
    const [x, y, w, h] = pictureInsertBox([120, 80], placed.area);
    expect(h).toBe(482 - 2 * PICTURE_MARGIN);
    expect(w).toBe(Math.round((h * 120) / 80));
    expect(x + w / 2).toBeCloseTo(137 + 901 / 2, 0);
    expect(y + h / 2).toBeCloseTo(289 + 482 / 2, 0);
  });

  it('reads a one line placeholder as its column of the body under the head band (the fix round: a 12 by 8 px picture)', () => {
    /* the layouts' empty body paragraph measures one line, centred in its row: 768 wide at
       measure 56, 88 tall, mid body */
    const oneLine: Block = {
      id: 'p1',
      type: 'paragraph',
      text: '',
      pos: { x: 137, y: 467, w: 768, h: 88, z: 1 },
    };
    const placed = pictureInsertArea(canvas([heading, oneLine]), [120, 80]);
    expect(placed.replaces).toEqual(['p1']);
    // the column of the placeholder, from the body's top (40 px under the heading) to the content box's bottom
    const bodyTop = 129 + 96 + 40;
    expect(placed.area).toEqual([137, bodyTop, 768, 771 - bodyTop]);
    const [x, y, w, h] = pictureInsertBox([120, 80], placed.area);
    expect(h).toBe(771 - bodyTop - 2 * PICTURE_MARGIN);
    expect(w).toBe(Math.round((h * 120) / 80));
    expect(Math.abs(x + w / 2 - (137 + 768 / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(y + h / 2 - (bodyTop + (771 - bodyTop) / 2))).toBeLessThanOrEqual(1);
    // a placeholder above the body's top (no heading on the slide) starts the area at its own top
    const high = pictureInsertArea(canvas([oneLine]), [120, 80]);
    expect(high.area).toEqual([137, 129, 768, 771 - 129]);
    // a real slot (the 4/8 split's 482 px body) stands for itself
    expect(pictureInsertArea(canvas([heading, emptyBody]), [120, 80]).area).toEqual([
      137, 289, 901, 482,
    ]);
  });

  it('takes the largest empty paragraph when the layout has two and leaves a typed one alone', () => {
    const typed: Block = {
      id: 'p2',
      type: 'paragraph',
      text: 'Revenue grew',
      pos: { x: 1078, y: 289, w: 385, h: 482, z: 2 },
    };
    const small: Block = {
      id: 'p3',
      type: 'paragraph',
      text: '',
      pos: { x: 1078, y: 289, w: 385, h: 200, z: 3 },
    };
    const placed = pictureInsertArea(canvas([heading, typed, emptyBody, small]), [4, 3]);
    expect(placed.replaces).toEqual(['p1']);
    // a drawn text box that is empty is not a layout placeholder
    const drawn: Block = {
      id: 't',
      type: 'text',
      text: '',
      pos: { x: 300, y: 400, w: 320, h: 160, z: 3 },
    };
    expect(pictureInsertArea(canvas([heading, drawn]), [4, 3]).replaces).toEqual([]);
  });

  it('centres in the body under the head band when no placeholder stands', () => {
    const placed = pictureInsertArea(canvas([heading]), [16, 9]);
    expect(placed.replaces).toEqual([]);
    // the body starts 40 px under the heading and ends at the content box's bottom
    expect(placed.area).toEqual([137, 129 + 96 + 40, 1326, 129 + 642 - (129 + 96 + 40)]);
    expect(pictureBodyRect(canvas([]))).toEqual(BODY_SLOT);
    // a heading dragged below the top third makes no head band
    const low: Block = { ...heading, pos: { x: 137, y: 500, w: 1326, h: 96, z: 0 } };
    expect(pictureBodyRect(canvas([low]))).toEqual(BODY_SLOT);
  });

  it('keeps 40 px from what is on the slide and takes the free rectangle that holds the largest picture', () => {
    const table: Block = {
      id: 'tbl',
      type: 'paragraph',
      text: 'Q1 revenue',
      pos: { x: 137, y: 265, w: 600, h: 506, z: 1 },
    };
    const placed = pictureInsertArea(canvas([heading, table]), [4, 3]);
    expect(placed.replaces).toEqual([]);
    // the strip to the right of the table, 40 px from its edge, the body's full height
    expect(placed.area).toEqual([137 + 600 + 40, 265, 1326 - 600 - 40, 771 - 265]);
    const box = pictureInsertBox([4, 3], placed.area);
    expect(box[0]).toBeGreaterThanOrEqual(137 + 600 + 40);
    expect(box[0] + box[2]).toBeLessThanOrEqual(1463);
  });

  it('lists the maximal empty rectangles of a body, the body alone when nothing is taken', () => {
    expect(freeRectanglesOf([0, 0, 1000, 1000], [])).toEqual([[0, 0, 1000, 1000]]);
    const rects = freeRectanglesOf([0, 0, 1000, 1000], [[400, 400, 200, 200]]);
    // the four strips around the box grown by the 40 px gap (360 to 640); none contains another
    expect(rects).toHaveLength(4);
    expect(rects).toContainEqual([0, 0, 1000, 360]);
    expect(rects).toContainEqual([0, 640, 1000, 360]);
    expect(rects).toContainEqual([0, 0, 360, 1000]);
    expect(rects).toContainEqual([640, 0, 360, 1000]);
    // a box whose grown rectangle covers the body leaves no room
    expect(freeRectanglesOf([0, 0, 100, 100], [[40, 40, 20, 20]])).toEqual([]);
  });
});

describe('the picture by URL', () => {
  it('names the file from the address, with an extension from the answered type', () => {
    expect(pictureNameOf('https://acme.com/brand/logo.png?v=2', 'image/png')).toBe('logo.png');
    expect(pictureNameOf('https://acme.com/brand/logo', 'image/jpeg')).toBe('logo.jpg');
    expect(pictureNameOf('https://acme.com/', 'image/webp')).toBe('picture.webp');
    expect(pictureNameOf('https://acme.com/a%20b.svg', 'image/svg+xml')).toBe('a b.svg');
    expect(pictureNameOf('', 'image/png')).toBe('picture.png');
  });

  it('reads the failure as one sentence with its reason', () => {
    expect(urlFailureSentence('the address did not answer')).toBe(
      'The picture could not be loaded from this address: the address did not answer',
    );
  });
});

describe('sniffPictureKind', () => {
  it('tells a PNG, a JPEG, a GIF, a WebP and an SVG by their first bytes', () => {
    expect(sniffPictureKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('png');
    expect(sniffPictureKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('jpeg');
    expect(sniffPictureKind(new TextEncoder().encode('GIF89a......'))).toBe('gif');
    expect(sniffPictureKind(new TextEncoder().encode('RIFF....WEBPVP8 '))).toBe('webp');
    expect(
      sniffPictureKind(new TextEncoder().encode('  <svg xmlns="http://www.w3.org/2000/svg">')),
    ).toBe('svg');
    expect(sniffPictureKind(new TextEncoder().encode('<?xml version="1.0"?><svg/>'))).toBe('svg');
  });

  it('answers null for a text file renamed .png and for an empty file', () => {
    expect(sniffPictureKind(new TextEncoder().encode('hello, this is a text file'))).toBeNull();
    expect(sniffPictureKind(new Uint8Array([]))).toBeNull();
    expect(sniffPictureKind(new TextEncoder().encode('<html><body>no</body></html>'))).toBeNull();
  });
});

describe('the failure sentence', () => {
  it('names the reason as a sentence, never a code', () => {
    expect(uploadFailureSentence('not-a-picture', 25)).toBe(
      'The picture could not be uploaded: the file is not a picture',
    );
    expect(uploadFailureSentence('too-large', 25)).toBe(
      'The picture could not be uploaded: the file is over 25 MB',
    );
    expect(uploadFailureSentence('did-not-finish', 25)).toBe(
      'The picture could not be uploaded: the upload did not finish',
    );
  });

  it('reads the reason from the refusal', () => {
    expect(uploadFailureOf(new Error('Input buffer contains unsupported image format'))).toBe(
      'not-a-picture',
    );
    expect(uploadFailureOf(new Error('asset.add: the body exceeds the 25 MB limit'))).toBe(
      'too-large',
    );
    expect(uploadFailureOf(new Error('window API asset.add did not answer within 20 s'))).toBe(
      'did-not-finish',
    );
  });

  it('reads the sanitizer’s two svg sentences whole and never as a raster reason (docs/VECTOR.md 4.2)', () => {
    expect(SVG_TOO_LARGE_SENTENCE).toBe('The SVG file is over 2 MB');
    expect(SVG_BROKEN_SENTENCE).toBe('This SVG file could not be read');
    /* the server's line carries the sentence with the action's prefix; "over 2 MB" must not read as the 25 MB refusal */
    expect(uploadFailureOf(new Error('asset.add: The SVG file is over 2 MB'))).toBe(
      'svg-too-large',
    );
    expect(uploadFailureOf(new Error('This SVG file could not be read'))).toBe('svg-broken');
    expect(uploadFailureSentence('svg-too-large', 25)).toBe(
      'The picture could not be uploaded: The SVG file is over 2 MB',
    );
    expect(uploadFailureSentence('svg-broken', 25)).toBe(
      'The picture could not be uploaded: This SVG file could not be read',
    );
    /* the features round's sentence and reason are gone with the flag (docs/VECTOR.md 4.7) */
    expect(
      uploadFailureOf(new Error('svg is not accepted here; send png, jpeg, webp or gif')),
    ).not.toMatch(/^svg-/);
  });
});

describe('shrinkMutation', () => {
  const box: Block = {
    id: 'tb',
    type: 'text',
    text: 'A long paragraph',
    autofit: 'shrink',
    typography: { size: 22, align: 'left' },
    pos: { x: 100, y: 100, w: 340, h: 48 },
  } as Block;

  it('steps the size one rung down the ladder when the text needs more than the box', () => {
    expect(shrinkMutation('s1', box, 120, 22, ladderStepDown)).toEqual({
      op: 'block.set',
      slideId: 's1',
      blockId: 'tb',
      path: '/typography',
      value: { size: ladderStepDown(22), align: 'left' },
    });
  });

  it('leaves a box alone that holds its text, a grow box, and a size at the ladder floor', () => {
    expect(shrinkMutation('s1', box, 48, 22, ladderStepDown)).toBeNull();
    expect(
      shrinkMutation('s1', { ...box, autofit: 'grow' } as Block, 120, 22, ladderStepDown),
    ).toBeNull();
    expect(shrinkMutation('s1', box, 120, 22, () => undefined)).toBeNull();
    expect(shrinkMutation('s1', box, 120, undefined, ladderStepDown)).toBeNull();
  });
});
