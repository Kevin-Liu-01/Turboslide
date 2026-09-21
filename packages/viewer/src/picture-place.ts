// Where a picked picture lands and what a refused upload says (docs/PRODUCT.md section 2 rank
// 10, section 5 "Pictures"; audit-seller 10, 14, 22; audit-brand 12; audit-gaps 1). Pure: the
// Editor's insertPicture and the Image by URL dialog call these, picture-place.test.ts pins them.
import type { Block } from '@turboslide/schema/blocks';
import type { Slide } from '@turboslide/schema/deck';
import { canvasObjects } from '@turboslide/schema/deck';
import type { Box } from '@turboslide/schema/render';
import { SHEET_HEIGHT } from '@turboslide/schema/render';
import { plainText } from '@turboslide/schema/text';
import { CONTENT, CONTENT_ORIGIN } from '@turboslide/theme/tokens';

/** The margin a placed picture keeps from the body slot's edges, in sheet px (rank 10). */
export const PICTURE_MARGIN = 40;

/** The body slot of a slide as a box in sheet px: the content area (theme tokens CONTENT_ORIGIN and CONTENT). */
export const BODY_SLOT: Box = [CONTENT_ORIGIN[0], CONTENT_ORIGIN[1], CONTENT[0], CONTENT[1]];

/** Headings whose top sits above this line make the head band (the top third of the sheet; the controller's place-insert.ts rule). */
const HEAD_BAND_LIMIT = SHEET_HEIGHT / 3;
/** The room kept between a placed picture and what is on the slide already, in sheet px. */
const NEIGHBOUR_GAP = 40;
/** The least body height under the head band before the whole content box counts as the body. */
const LEAST_BODY_HEIGHT = 160;

/** Where a new picture goes on a canvas slide: the area to centre it in, and the empty placeholders it takes the place of. */
export type PictureInsertArea = {
  area: Box;
  /** the empty body placeholder the picture fills (Google's insert into an empty placeholder), removed in the same write */
  replaces: string[];
};

function intersects(a: Box, b: Box): boolean {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
}

function contains(outer: Box, inner: Box): boolean {
  return (
    outer[0] <= inner[0] &&
    outer[1] <= inner[1] &&
    outer[0] + outer[2] >= inner[0] + inner[2] &&
    outer[1] + outer[3] >= inner[1] + inner[3]
  );
}

function boxOf(block: Block): Box | null {
  const pos = block.pos;
  return pos === undefined ? null : [pos.x, pos.y, pos.w, pos.h];
}

/** True for a text like block with no letters: a layout's placeholder, whose prompt is furniture (SPEC 5.4). */
function isEmptyTextLike(block: Block): boolean {
  return (
    (block.type === 'heading' ||
      block.type === 'paragraph' ||
      block.type === 'text' ||
      block.type === 'credit') &&
    plainText(block.text).trim() === ''
  );
}

/**
 * True for an object that takes room on the slide: anything but an empty text like block and the
 * background picture (a `picture` object covers the sheet under everything).
 */
function takesRoom(block: Block): boolean {
  if (block.pos === undefined || block.type === 'picture') return false;
  return !isEmptyTextLike(block);
}

/**
 * The body of a canvas slide: the content box under the head band, which ends at the bottom of
 * the lowest heading whose top sits in the top third of the sheet plus the gap, typed or not (an
 * empty title prompt keeps the title's place). A slide with no heading there has the whole
 * content box as its body. The same rule the controller's table and chart insert reads
 * (apps/studio/src/editor/place-insert.ts bodyRect), kept here because the viewer cannot import
 * the studio.
 */
export function pictureBodyRect(slide: Slide): Box {
  const [cx, cy, cw, ch] = BODY_SLOT;
  let bottom = cy;
  for (const block of canvasObjects(slide)) {
    if (block.type !== 'heading' || block.pos === undefined) continue;
    if (block.pos.y >= HEAD_BAND_LIMIT) continue;
    bottom = Math.max(bottom, block.pos.y + block.pos.h);
  }
  const top = bottom === cy ? cy : bottom + NEIGHBOUR_GAP;
  const height = cy + ch - top;
  if (height < LEAST_BODY_HEIGHT) return BODY_SLOT;
  return [cx, top, cw, height];
}

/**
 * The maximal empty rectangles of a body given the boxes taken in it, each taken box grown by the
 * gap: every rectangle on the grid of the taken edges that meets none of them and lies in no
 * larger empty one. The body alone when nothing is taken.
 */
export function freeRectanglesOf(body: Box, taken: ReadonlyArray<Box>): Box[] {
  const [bx, by, bw, bh] = body;
  const occupied: Box[] = [];
  for (const own of taken) {
    const grown: Box = [
      own[0] - NEIGHBOUR_GAP,
      own[1] - NEIGHBOUR_GAP,
      own[2] + 2 * NEIGHBOUR_GAP,
      own[3] + 2 * NEIGHBOUR_GAP,
    ];
    if (!intersects(grown, body)) continue;
    const x = Math.max(bx, grown[0]);
    const y = Math.max(by, grown[1]);
    const right = Math.min(bx + bw, grown[0] + grown[2]);
    const bottom = Math.min(by + bh, grown[1] + grown[3]);
    if (right > x && bottom > y) occupied.push([x, y, right - x, bottom - y]);
  }
  if (occupied.length === 0) return [body];
  const xs = new Set<number>([bx, bx + bw]);
  const ys = new Set<number>([by, by + bh]);
  for (const rect of occupied) {
    for (const x of [rect[0], rect[0] + rect[2]]) if (x > bx && x < bx + bw) xs.add(x);
    for (const y of [rect[1], rect[1] + rect[3]]) if (y > by && y < by + bh) ys.add(y);
  }
  const xList = [...xs].sort((a, b) => a - b);
  const yList = [...ys].sort((a, b) => a - b);
  const empty: Box[] = [];
  for (let i = 0; i < xList.length - 1; i += 1) {
    for (let j = i + 1; j < xList.length; j += 1) {
      const x = xList[i] as number;
      const w = (xList[j] as number) - x;
      for (let k = 0; k < yList.length - 1; k += 1) {
        for (let l = k + 1; l < yList.length; l += 1) {
          const y = yList[k] as number;
          const h = (yList[l] as number) - y;
          const candidate: Box = [x, y, w, h];
          if (occupied.some((rect) => intersects(rect, candidate))) continue;
          empty.push(candidate);
        }
      }
    }
  }
  return empty.filter(
    (rect) =>
      !empty.some((other) => other !== rect && contains(other, rect) && !contains(rect, other)),
  );
}

/**
 * The least height of an empty placeholder that stands for itself as the picture's area. The
 * layouts' body paragraph is measured at its text height, one line (48 to 88 px) while it is
 * empty, centred in its row (layouts.ts `body: { align: 'center' }`); read as the area it gave a
 * 12 by 8 px picture (the fix round's images spec run, `pictureInsertBox` with the 40 px margin
 * inside 88 px). A placeholder shorter than this stands for its column of the body under the head
 * band, from the body's top to the content box's bottom, the slot Google's layout gives the body.
 */
const LEAST_PLACEHOLDER_HEIGHT = 2 * PICTURE_MARGIN + 160;

/** The area an empty placeholder stands for: its box when it is a real slot, else its column over the body's height. */
function placeholderArea(box: Box, body: Box): Box {
  if (box[3] >= LEAST_PLACEHOLDER_HEIGHT) return box;
  const top = Math.min(box[1], body[1]);
  const bottom = Math.max(box[1] + box[3], body[1] + body[3]);
  return [box[0], top, box[2], bottom - top];
}

/**
 * Where a new picture lands on a canvas slide (rank 10; Google Slides puts an inserted image into
 * the slide's empty body placeholder, else over the body): the empty body paragraph of the layout
 * (the largest one when several stand) is the area and leaves with the write, so no prompt sits
 * under the picture (a one line placeholder stands for its column of the body, `placeholderArea`);
 * without one, the free rectangle of the body under the head band that holds the largest picture
 * of this aspect, 40 px from what is there; when nothing holds a picture, the body itself. The
 * picture is then centred in the area by `pictureInsertBox`.
 */
export function pictureInsertArea(
  slide: Slide,
  size: readonly [number, number] | undefined,
): PictureInsertArea {
  const objects = canvasObjects(slide);
  let placeholder: { id: string; box: Box } | null = null;
  for (const block of objects) {
    if (block.type !== 'paragraph' || !isEmptyTextLike(block)) continue;
    const box = boxOf(block);
    if (box === null) continue;
    if (placeholder === null || box[2] * box[3] > placeholder.box[2] * placeholder.box[3])
      placeholder = { id: block.id, box };
  }
  const body = pictureBodyRect(slide);
  if (placeholder !== null)
    return { area: placeholderArea(placeholder.box, body), replaces: [placeholder.id] };
  const taken = objects.filter(takesRoom).flatMap((block) => {
    const box = boxOf(block);
    return box === null ? [] : [box];
  });
  let best: { rect: Box; score: number } | null = null;
  for (const rect of freeRectanglesOf(body, taken)) {
    const fitted = pictureInsertBox(size, rect);
    if (fitted[2] < 2 * PICTURE_MARGIN || fitted[3] < 2 * PICTURE_MARGIN) continue;
    const score = fitted[2] * fitted[3];
    if (
      best === null ||
      score > best.score ||
      (score === best.score &&
        (rect[1] < best.rect[1] || (rect[1] === best.rect[1] && rect[0] < best.rect[0])))
    )
      best = { rect, score };
  }
  return { area: best?.rect ?? body, replaces: [] };
}

/**
 * The box a new picture takes (rank 10; Google Slides centres an uploaded image and fits it to
 * the slide): centred in `area` at the largest size that keeps `margin` from the area's edges and
 * the picture's own aspect. A size that is unknown or degenerate is read as 16:9. Rounded to
 * whole sheet px, at least 8 by 8.
 */
export function pictureInsertBox(
  size: readonly [number, number] | undefined,
  area: Box = BODY_SLOT,
  margin: number = PICTURE_MARGIN,
): Box {
  const [aw, ah] = size !== undefined && size[0] > 0 && size[1] > 0 ? size : [16, 9];
  const maxW = Math.max(8, area[2] - 2 * margin);
  const maxH = Math.max(8, area[3] - 2 * margin);
  const scale = Math.min(maxW / aw, maxH / ah);
  const w = Math.max(8, Math.round(aw * scale));
  const h = Math.max(8, Math.round(ah * scale));
  const x = Math.round(area[0] + (area[2] - w) / 2);
  const y = Math.round(area[1] + (area[3] - h) / 2);
  return [x, y, w, h];
}

/** The picture formats the upload takes, told by their first bytes. */
export type PictureKind = 'png' | 'jpeg' | 'gif' | 'webp' | 'svg' | 'avif' | 'bmp' | 'heic';

/**
 * The picture format of a file's first bytes, or null when the bytes are not a picture (a text
 * file renamed .png, an empty file): the sentence "the file is not a picture" is answered before
 * any upload and no placeholder is drawn (audit-brand 12; the gaps audit's replace with a broken
 * PNG went silent). SVG is read as text starting with `<`.
 */
export function sniffPictureKind(bytes: Uint8Array): PictureKind | null {
  if (bytes.length < 4) return null;
  const at = (i: number) => bytes[i] ?? 0;
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...Array.from(bytes.subarray(start, start + length)));
  if (at(0) === 0x89 && ascii(1, 3) === 'PNG') return 'png';
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpeg';
  if (ascii(0, 4) === 'GIF8') return 'gif';
  if (ascii(0, 4) === 'RIFF' && bytes.length >= 12 && ascii(8, 4) === 'WEBP') return 'webp';
  if (at(0) === 0x42 && at(1) === 0x4d) return 'bmp';
  if (bytes.length >= 12 && ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    if (/^avi[fs]$/.test(brand)) return 'avif';
    if (/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(brand)) return 'heic';
    return null;
  }
  /* SVG: text that opens with a tag, a BOM or white space before it allowed */
  let i = 0;
  if (at(0) === 0xef && at(1) === 0xbb && at(2) === 0xbf) i = 3;
  while (i < bytes.length && (at(i) === 0x20 || at(i) === 0x0a || at(i) === 0x0d || at(i) === 0x09))
    i += 1;
  if (at(i) === 0x3c) {
    const head = ascii(i, Math.min(256, bytes.length - i)).toLowerCase();
    if (head.includes('<svg') || head.startsWith('<?xml')) return 'svg';
  }
  return null;
}

/**
 * The file name a web address gives the picture it answers (the asset id and the alt derive from
 * it): the last path segment, decoded, with an extension from the answered type when the segment
 * has none; `picture` when the address ends in a slash.
 */
export function pictureNameOf(address: string, mime: string): string {
  let segment = 'picture';
  try {
    const path = new URL(address, 'https://example.invalid').pathname;
    const last = path
      .split('/')
      .filter((part) => part !== '')
      .pop();
    if (last !== undefined) segment = decodeURIComponent(last);
  } catch {
    segment = 'picture';
  }
  if (/\.[a-z0-9]{2,5}$/i.test(segment)) return segment;
  const ext = /^image\/(png|jpeg|gif|webp|svg\+xml|avif|bmp)/i.exec(mime)?.[1]?.toLowerCase();
  const suffix =
    ext === undefined ? '' : ext === 'jpeg' ? '.jpg' : ext === 'svg+xml' ? '.svg' : `.${ext}`;
  return `${segment}${suffix}`;
}

/**
 * The one sentence of a picture by URL that did not land, with its reason (the Image by URL
 * dialog's error line): a refusal the upload path names keeps its reason; the server's own words
 * about a host it may not fetch from are read as one reason; a status or a network failure names
 * itself.
 */
export function urlFailureSentence(reason: string): string {
  return `The picture could not be loaded from this address: ${reason}`;
}

/** The reasons the failure sentence names (rank 10: a sentence, never a code or an action id). */
export type UploadFailure = 'not-a-picture' | 'too-large' | 'did-not-finish';

/** The one sentence of a refused upload, with its reason (rank 10; the snackbar `snackbar.upload.failed`). */
export function uploadFailureSentence(reason: UploadFailure, maxMb: number): string {
  const why =
    reason === 'not-a-picture'
      ? 'the file is not a picture'
      : reason === 'too-large'
        ? `the file is over ${maxMb} MB`
        : 'the upload did not finish';
  return `The picture could not be uploaded: ${why}`;
}

/**
 * The reason a server refusal or a failed call stands for, read from its message: a decode or
 * format refusal is "not a picture", a size or body refusal "too large", anything else (a timeout,
 * a network error, a stale base) "did not finish".
 */
export function uploadFailureOf(error: unknown): UploadFailure {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (
    /unsupported|not (a|an) (picture|image)|decode|input buffer|corrupt|invalid (png|jpeg|image)|no image|unknown format|bad image|vips|sharp/.test(
      message,
    )
  )
    return 'not-a-picture';
  if (/too large|too big|exceeds|payload|size limit|25 mb|over \d+ mb|413/.test(message))
    return 'too-large';
  return 'did-not-finish';
}
