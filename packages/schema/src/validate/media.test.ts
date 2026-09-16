// The `media` validator family (gslides-parity SPEC-5 1.2, 3.1; R11 1.4) over the worked deck
// with a media record and a media block added: a well formed pair passes, and each rule answers
// one row with the code `media`, the file, the pointer and a sentence; the shape rules stay zod's.
import { describe, expect, it } from 'vitest';

import type { MediaAsset } from '../assets.ts';
import type { MediaBlock } from '../blocks.ts';
import type { DeckDocument, Slide } from '../deck.ts';
import { workedDocument } from '../fixtures.ts';
import { validateDeck } from '../validate.ts';
import { mediaBlocksOf, validateMedia } from './media.ts';

const MB = 1024 * 1024;

function talk(over: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'talk',
    kind: 'video',
    role: 'media',
    file: 'assets/talk.0123abcd.mp4',
    mime: 'video/mp4',
    bytes: 12 * MB,
    sha256: '0123abcd'.repeat(8),
    durationMs: 90_000,
    size: [1280, 720],
    codecs: ['avc1', 'mp4a'],
    source: { kind: 'file' },
    ...over,
  };
}

function block(over: Partial<MediaBlock> = {}): MediaBlock {
  return {
    id: 'demo',
    type: 'media',
    kind: 'video',
    source: { asset: 'talk' },
    playback: { start: 'click' },
    ...over,
  };
}

/** The worked deck with the media record in deck.media and the block appended to the content slide's right slot. */
function documentWith(asset: MediaAsset | null, media: MediaBlock | null): DeckDocument {
  const document = workedDocument();
  if (asset !== null) document.deck.media = { [asset.id]: asset };
  const slide = document.slides['content-rule'] as Slide & { kind: 'content' };
  if (media !== null) slide.slots.right = [...(slide.slots.right ?? []), media];
  return document;
}

function rows(
  document: DeckDocument,
): { severity: number; file: string; pointer: string; message: string }[] {
  return validateMedia(document).map(({ severity, file, pointer, message }) => ({
    severity,
    file,
    pointer,
    message,
  }));
}

const SLIDE = 'slides/content-rule.json';
const BLOCK = '/slots/right/1';

describe('validateMedia', () => {
  it('passes a stored record played by a block of its kind, through validateDeck too', () => {
    const document = documentWith(talk(), block());
    expect(rows(document)).toEqual([]);
    const result = validateDeck({ deck: document.deck, slides: Object.values(document.slides) });
    expect(result.issues.filter((row) => row.code === 'media')).toEqual([]);
    expect(result.ok).toBe(true);
    expect(
      mediaBlocksOf(document.slides['content-rule'] as Slide).map((row) => row.pointer),
    ).toEqual([BLOCK]);
  });

  it('passes a YouTube block, an empty reference and a block with a picture poster', () => {
    const document = documentWith(
      null,
      block({ source: { youtube: 'dQw4w9WgXcQ' }, poster: 'site-home' }),
    );
    expect(rows(document)).toEqual([]);
    expect(rows(documentWith(null, block({ source: { asset: '' } })))).toEqual([]);
  });

  it('refuses a block whose source names no media asset, or a picture asset', () => {
    expect(rows(documentWith(null, block()))).toEqual([
      {
        severity: 3,
        file: SLIDE,
        pointer: `${BLOCK}/source/asset`,
        message: 'Block "demo" plays "talk", which is not a media asset of deck.json',
      },
    ]);
    expect(rows(documentWith(null, block({ source: { asset: 'site-home' } })))).toEqual([
      {
        severity: 3,
        file: SLIDE,
        pointer: `${BLOCK}/source/asset`,
        message: 'Block "demo" plays "site-home", which is a picture asset, not a media file',
      },
    ]);
  });

  it('refuses a block whose kind is not the record’s', () => {
    expect(rows(documentWith(talk(), block({ kind: 'audio' })))).toEqual([
      {
        severity: 3,
        file: SLIDE,
        pointer: `${BLOCK}/kind`,
        message: 'Block "demo" is audio but its media asset "talk" is video',
      },
    ]);
  });

  it('refuses a poster that names a media file and leaves a missing picture to the reference rule', () => {
    expect(rows(documentWith(talk(), block({ poster: 'talk' })))).toEqual([
      {
        severity: 3,
        file: SLIDE,
        pointer: `${BLOCK}/poster`,
        message:
          'Block "demo" names the media file "talk" as its poster; a poster is a picture asset',
      },
    ]);
    const missing = documentWith(talk(), block({ poster: 'nowhere' }));
    expect(rows(missing)).toEqual([]);
    const result = validateDeck({ deck: missing.deck, slides: Object.values(missing.slides) });
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'reference', pointer: `${BLOCK}/poster` }),
    );
  });

  it('applies the playback rules with the field as the pointer', () => {
    expect(
      rows(
        documentWith(
          talk(),
          block({ playback: { start: 'auto', startMs: 12_000, endMs: 12_000 } }),
        ),
      ),
    ).toEqual([
      {
        severity: 3,
        file: SLIDE,
        pointer: `${BLOCK}/playback/endMs`,
        message: 'Block "demo": End at 0:12 is not after Start at 0:12',
      },
    ]);
    expect(
      rows(
        documentWith(
          null,
          block({ source: { youtube: 'dQw4w9WgXcQ' }, playback: { start: 'click', loop: true } }),
        ),
      ),
    ).toEqual([
      {
        severity: 3,
        file: SLIDE,
        pointer: `${BLOCK}/playback/loop`,
        message: 'Block "demo": Loop is not offered for a YouTube video',
      },
    ]);
    // past a known duration is a defect, not a refusal
    expect(
      rows(documentWith(talk(), block({ playback: { start: 'click', endMs: 95_000 } }))),
    ).toEqual([
      {
        severity: 2,
        file: SLIDE,
        pointer: `${BLOCK}/playback/endMs`,
        message: 'Block "demo": End at 1:35 is past the end of the media (1:30)',
      },
    ]);
    expect(
      rows(documentWith(talk(), block({ playback: { start: 'click', startMs: 90_000 } }))),
    ).toEqual([
      {
        severity: 2,
        file: SLIDE,
        pointer: `${BLOCK}/playback/startMs`,
        message: 'Block "demo": Start at 1:30 is past the end of the media (1:30)',
      },
    ]);
    // an unknown duration (a recorded webm) skips the duration rule
    expect(
      rows(
        documentWith(
          talk({ durationMs: null }),
          block({ playback: { start: 'click', endMs: 95_000 } }),
        ),
      ),
    ).toEqual([]);
  });

  it('checks the records of deck.media: the key, the kind against the mime, the file name, the cap and the poster', () => {
    const document = documentWith(talk(), null);
    document.deck.media = {
      other: talk({ id: 'talk' }),
      voice: talk({
        id: 'voice',
        kind: 'video',
        mime: 'audio/mpeg',
        file: 'assets/voice.0123abcd.mp3',
      }),
      named: talk({ id: 'named', file: 'assets/named.0123abcd.webm' }),
      noext: talk({ id: 'noext', file: 'assets/noext' }),
      huge: talk({ id: 'huge', bytes: 201 * MB }),
      song: talk({
        id: 'song',
        kind: 'audio',
        mime: 'audio/wav',
        file: 'assets/song.0123abcd.wav',
        bytes: 51 * MB,
      }),
      framed: talk({ id: 'framed', poster: 'nowhere' }),
      selfie: talk({ id: 'selfie', poster: 'talk' }),
      talk: talk(),
      webmVoice: talk({
        id: 'webmVoice',
        kind: 'audio',
        mime: 'video/webm',
        file: 'assets/v.0123abcd.webm',
      }),
    };
    const found = rows(document);
    expect(found).toEqual(
      expect.arrayContaining([
        {
          severity: 3,
          file: 'deck.json',
          pointer: '/media/other/id',
          message: 'Media asset "other" carries the id "talk"; the key and the id are one',
        },
        {
          severity: 3,
          file: 'deck.json',
          pointer: '/media/voice/kind',
          message: 'Media asset "voice" is video but its mime audio/mpeg carries audio',
        },
        {
          severity: 3,
          file: 'deck.json',
          pointer: '/media/named/file',
          message:
            'Media asset "named" is stored as video/mp4 but its file "assets/named.0123abcd.webm" is named as video/webm',
        },
        {
          severity: 3,
          file: 'deck.json',
          pointer: '/media/noext/file',
          message:
            'Media asset "noext" is stored as video/mp4 but its file "assets/noext" has no media extension',
        },
        {
          severity: 3,
          file: 'deck.json',
          pointer: '/media/huge/bytes',
          message:
            'Media asset "huge" is 201 MB; the largest video file is 200 MB (gslides-parity SPEC-5 0.18)',
        },
        {
          severity: 3,
          file: 'deck.json',
          pointer: '/media/song/bytes',
          message:
            'Media asset "song" is 51 MB; the largest audio file is 50 MB (gslides-parity SPEC-5 0.18)',
        },
        {
          severity: 3,
          file: 'deck.json',
          pointer: '/media/framed/poster',
          message:
            'Media asset "framed" names the poster "nowhere", which is not a picture asset of deck.json',
        },
        {
          severity: 3,
          file: 'deck.json',
          pointer: '/media/selfie/poster',
          message:
            'Media asset "selfie" names the media file "talk" as its poster; a poster is a picture asset',
        },
      ]),
    );
    // the webm with audio alone and the well formed talk pass; the voice row fires on kind and not twice on file
    expect(found.filter((row) => row.pointer.startsWith('/media/talk/'))).toEqual([]);
    expect(found.filter((row) => row.pointer.startsWith('/media/webmVoice/'))).toEqual([]);
    expect(found.filter((row) => row.pointer === '/media/voice/file')).toHaveLength(0);
  });

  it('reports the deck’s media sum over 300 MB at severity 2', () => {
    const document = documentWith(null, null);
    document.deck.media = {
      a: talk({ id: 'a', bytes: 150 * MB }),
      b: talk({ id: 'b', bytes: 151 * MB }),
    };
    expect(rows(document)).toEqual([
      {
        severity: 2,
        file: 'deck.json',
        pointer: '/media',
        message:
          'The deck holds 301 MB of audio and video; the cap is 300 MB (gslides-parity SPEC-5 0.18)',
      },
    ]);
  });

  it('finds media blocks inside composite cells and on a plate', () => {
    const document = documentWith(talk(), null);
    const slide = document.slides['content-rule'] as Slide & { kind: 'content' };
    slide.slots.right = [
      ...(slide.slots.right ?? []),
      {
        id: 'grid',
        type: 'composite',
        tracks: '1fr 1fr',
        cells: [{ blocks: [] }, { blocks: [block({ kind: 'audio' })] }],
      },
    ];
    expect(rows(document)).toEqual([
      {
        severity: 3,
        file: SLIDE,
        pointer: '/slots/right/1/cells/1/blocks/0/kind',
        message: 'Block "demo" is audio but its media asset "talk" is video',
      },
    ]);
  });
});
