// The `media` validator family (gslides-parity SPEC-5 1.2, 0.7, 3.1; R11 1.4): the cross
// reference rules the zod schemas cannot state. On `deck.json` `/media/<id>` (the `MediaAsset`
// records): the key equals the record's id, the kind is one its mime carries, the file's
// extension matches the mime, the bytes stay under the kind's cap (`MEDIA_BYTES_MAX`), a poster
// names a picture asset, and the deck's media sum against `DECK_MEDIA_BYTES_MAX` at severity 2.
// On every media block: `source.asset` names a record of `deck.media` (a picture id is named as
// such), the record's kind is the block's, a `poster` that names a media file is refused (a
// missing picture is the generic `reference` row's), and the playback rules of `playbackProblem`
// (an end at or before the start, `loop` on YouTube at severity 3; a start or end past a known
// duration at severity 2). The shape rules (a mime outside the five, a file outside `assets/`, a
// volume outside 0 to 100, a negative start) are the zod schemas' and answer `invalid` before
// this module runs. Answers `Issue[]` for `validateDeck`. B2's from day 1 (MILESTONES-5 B2).
import type { MediaAsset } from '../assets.ts';
import type { Block, MediaBlock } from '../blocks.ts';
import {
  DECK_MEDIA_BYTES_MAX,
  MEDIA_BYTES_MAX,
  MEDIA_KINDS_OF_MIME,
  isYoutubeSource,
  mediaMimeOfName,
  playbackProblem,
} from '../blocks/media.ts';
import type { DeckDocument, Slide } from '../deck.ts';
import type { Issue } from '../validate.ts';

const DECK_FILE = 'deck.json';

function issue(severity: 2 | 3, file: string, pointer: string, message: string): Issue {
  return { code: 'media', severity, file, pointer, message };
}

function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Every top level block list of a slide with its pointer (the shape `validate.ts` walks). */
function blockLists(slide: Slide): { pointer: string; blocks: ReadonlyArray<Block> }[] {
  if (slide.kind === 'content') {
    return Object.entries(slide.slots).map(([slot, blocks]) => ({
      pointer: `/slots/${slot}`,
      blocks,
    }));
  }
  if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing') {
    return [{ pointer: '/plate/blocks', blocks: slide.plate.blocks }];
  }
  return [];
}

/** The media blocks of a slide with their pointers, composite cells included. */
export function mediaBlocksOf(slide: Slide): { block: MediaBlock; pointer: string }[] {
  const out: { block: MediaBlock; pointer: string }[] = [];
  const walk = (blocks: ReadonlyArray<Block>, base: string): void => {
    blocks.forEach((block, index) => {
      const pointer = `${base}/${index}`;
      if (block.type === 'media') out.push({ block, pointer });
      if (block.type === 'composite') {
        block.cells.forEach((cell, cellIndex) =>
          walk(cell.blocks, `${pointer}/cells/${cellIndex}/blocks`),
        );
      }
    });
  };
  for (const list of blockLists(slide)) walk(list.blocks, list.pointer);
  return out;
}

function validateRecords(document: DeckDocument, issues: Issue[]): void {
  const media = document.deck.media;
  if (media === undefined) return;
  let total = 0;
  for (const [key, asset] of Object.entries(media)) {
    const pointer = `/media/${key}`;
    total += asset.bytes;
    if (asset.id !== key) {
      issues.push(
        issue(
          3,
          DECK_FILE,
          `${pointer}/id`,
          `Media asset "${key}" carries the id "${asset.id}"; the key and the id are one`,
        ),
      );
    }
    const kinds = MEDIA_KINDS_OF_MIME[asset.mime];
    if (!kinds.includes(asset.kind)) {
      issues.push(
        issue(
          3,
          DECK_FILE,
          `${pointer}/kind`,
          `Media asset "${key}" is ${asset.kind} but its mime ${asset.mime} carries ${kinds.join(' or ')}`,
        ),
      );
    }
    const named = mediaMimeOfName(asset.file);
    if (named !== asset.mime) {
      issues.push(
        issue(
          3,
          DECK_FILE,
          `${pointer}/file`,
          `Media asset "${key}" is stored as ${asset.mime} but its file "${asset.file}" ${named === null ? 'has no media extension' : `is named as ${named}`}`,
        ),
      );
    }
    const cap = MEDIA_BYTES_MAX[asset.kind];
    if (asset.bytes > cap) {
      issues.push(
        issue(
          3,
          DECK_FILE,
          `${pointer}/bytes`,
          `Media asset "${key}" is ${megabytes(asset.bytes)}; the largest ${asset.kind} file is ${megabytes(cap)} (gslides-parity SPEC-5 0.18)`,
        ),
      );
    }
    if (asset.poster !== undefined && document.deck.assets[asset.poster] === undefined) {
      issues.push(
        issue(
          3,
          DECK_FILE,
          `${pointer}/poster`,
          media[asset.poster] !== undefined
            ? `Media asset "${key}" names the media file "${asset.poster}" as its poster; a poster is a picture asset`
            : `Media asset "${key}" names the poster "${asset.poster}", which is not a picture asset of deck.json`,
        ),
      );
    }
  }
  if (total > DECK_MEDIA_BYTES_MAX) {
    issues.push(
      issue(
        2,
        DECK_FILE,
        '/media',
        `The deck holds ${megabytes(total)} of audio and video; the cap is ${megabytes(DECK_MEDIA_BYTES_MAX)} (gslides-parity SPEC-5 0.18)`,
      ),
    );
  }
}

function validateBlock(
  document: DeckDocument,
  file: string,
  pointer: string,
  block: MediaBlock,
  issues: Issue[],
): void {
  const media = document.deck.media ?? {};
  let asset: MediaAsset | undefined;
  if (!isYoutubeSource(block.source) && block.source.asset !== '') {
    const id = block.source.asset;
    asset = media[id];
    if (asset === undefined) {
      issues.push(
        issue(
          3,
          file,
          `${pointer}/source/asset`,
          document.deck.assets[id] !== undefined
            ? `Block "${block.id}" plays "${id}", which is a picture asset, not a media file`
            : `Block "${block.id}" plays "${id}", which is not a media asset of deck.json`,
        ),
      );
    } else if (asset.kind !== block.kind) {
      issues.push(
        issue(
          3,
          file,
          `${pointer}/kind`,
          `Block "${block.id}" is ${block.kind} but its media asset "${id}" is ${asset.kind}`,
        ),
      );
    }
  }
  if (
    block.poster !== undefined &&
    document.deck.assets[block.poster] === undefined &&
    media[block.poster] !== undefined
  ) {
    issues.push(
      issue(
        3,
        file,
        `${pointer}/poster`,
        `Block "${block.id}" names the media file "${block.poster}" as its poster; a poster is a picture asset`,
      ),
    );
  }
  const problem = playbackProblem(block.playback, block.source, asset?.durationMs);
  if (problem !== null) {
    issues.push(
      issue(
        problem.severity,
        file,
        `${pointer}/playback/${problem.field}`,
        `Block "${block.id}": ${problem.message}`,
      ),
    );
  }
}

export function validateMedia(document: DeckDocument): Issue[] {
  const issues: Issue[] = [];
  validateRecords(document, issues);
  for (const slide of Object.values(document.slides)) {
    const file = `slides/${slide.id}.json`;
    for (const { block, pointer } of mediaBlocksOf(slide))
      validateBlock(document, file, pointer, block, issues);
  }
  return issues;
}
