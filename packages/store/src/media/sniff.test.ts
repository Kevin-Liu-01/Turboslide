// The media sniff over every fixture of fixtures/media (gslides-parity SPEC-5 3.9; R11 1.2, 8.4):
// each accepted file answers its container and the facts the signature carries (the brand, the
// DocType, the tag length), each refused file answers the container its bytes announce, a picture
// or plain text answers null, and the fixtures themselves match the digests facts.json recorded.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { sniffMedia } from './sniff.ts';
import { FIXTURES, fixture } from './test-fixtures.ts';

describe('the fixture files', () => {
  it('match the byte counts and sha256 digests of facts.json', () => {
    for (const [name, row] of Object.entries({ ...FIXTURES.accepted, ...FIXTURES.refused })) {
      const bytes = fixture(name);
      expect(bytes.byteLength, name).toBe(row.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), name).toBe(row.sha256);
    }
  });
});

describe('sniffMedia', () => {
  it('names the container of every accepted fixture', () => {
    expect(sniffMedia(fixture('tone-1s.wav'))).toEqual({ container: 'wav' });
    expect(sniffMedia(fixture('tone-1s-extensible.wav'))).toEqual({ container: 'wav' });
    expect(sniffMedia(fixture('tone-1s-float.wav'))).toEqual({ container: 'wav' });
    const mp4 = sniffMedia(fixture('bars-1s.mp4'));
    expect(mp4?.container).toBe('isobmff');
    expect(mp4?.container === 'isobmff' && mp4.brand).toBe('isom');
    expect(mp4?.container === 'isobmff' && mp4.compatible).toEqual([
      'isom',
      'iso2',
      'avc1',
      'mp41',
    ]);
    const m4a = sniffMedia(fixture('tone-1s.m4a'));
    expect(m4a?.container === 'isobmff' && m4a.brand).toBe('M4A ');
    const webm = sniffMedia(fixture('bars-1s.webm'));
    expect(webm).toEqual({ container: 'ebml', docType: 'webm' });
    expect(sniffMedia(fixture('bars-live.webm'))).toEqual({ container: 'ebml', docType: 'webm' });
    const tagged = sniffMedia(fixture('tone-1s.mp3'));
    expect(tagged?.container).toBe('mp3');
    expect(tagged?.container === 'mp3' && tagged.tagBytes).toBeGreaterThan(0);
    expect(tagged?.container === 'mp3' && tagged.audioAt).toBeGreaterThanOrEqual(
      tagged?.container === 'mp3' ? tagged.tagBytes : 0,
    );
    const bare = sniffMedia(fixture('tone-cbr.mp3'));
    expect(bare).toEqual({ container: 'mp3', tagBytes: 0, audioAt: 0 });
    const footer = sniffMedia(fixture('tone-id3.mp3'));
    // the hand written tag: 10 header, one TIT2 frame of 10 + 16 bytes, 64 padding, 10 footer
    expect(footer).toEqual({ container: 'mp3', tagBytes: 10 + 26 + 64 + 10, audioAt: 110 });
    expect(sniffMedia(fixture('tone-vbr.mp3'))?.container).toBe('mp3');
  });

  it('names the container of every refused fixture so the sentence can say what it is', () => {
    const mov = sniffMedia(fixture('bars-1s.mov'));
    expect(mov?.container === 'isobmff' && mov.brand).toBe('qt  ');
    expect(sniffMedia(fixture('tone.ogg'))).toEqual({ container: 'ogg' });
    expect(sniffMedia(fixture('bars.mkv'))).toEqual({ container: 'ebml', docType: 'matroska' });
    expect(sniffMedia(fixture('tone.flac'))).toEqual({ container: 'flac' });
    expect(sniffMedia(fixture('tone.aac'))).toEqual({ container: 'adts' });
    expect(sniffMedia(fixture('bars.avi'))).toEqual({ container: 'avi' });
    expect(sniffMedia(fixture('tone-adpcm.wav'))).toEqual({ container: 'wav' });
    expect(sniffMedia(fixture('webm-as.mp4'))).toEqual({ container: 'ebml', docType: 'webm' });
    expect(sniffMedia(fixture('truncated.mp4'))?.container).toBe('isobmff');
  });

  it('answers null for pictures, text and the empty file', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    expect(sniffMedia(png)).toBeNull();
    const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
    expect(sniffMedia(webp)).toBeNull();
    expect(sniffMedia(new TextEncoder().encode('plain text of no format'))).toBeNull();
    expect(sniffMedia(new Uint8Array(0))).toBeNull();
    expect(sniffMedia(new Uint8Array([0xff, 0xfb]))).toBeNull(); // two bytes of sync are not a frame
  });

  it('does not take a stray sync inside a tag for a frame, and reads a frame with nothing after it', () => {
    // an ID3v2.3 tag holding 0xFF 0xFB inside its body, then the bare stream
    const body = new Uint8Array(40);
    body[10] = 0xff;
    body[11] = 0xfb;
    const header = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, body.length]);
    const stream = fixture('tone-cbr.mp3');
    const tagged = new Uint8Array(header.length + body.length + stream.length);
    tagged.set(header, 0);
    tagged.set(body, header.length);
    tagged.set(stream, header.length + body.length);
    expect(sniffMedia(tagged)).toEqual({ container: 'mp3', tagBytes: 50, audioAt: 50 });
    // one frame alone: the next header would sit past the end, and the frame is still accepted
    const oneFrame = stream.subarray(0, 144);
    expect(sniffMedia(oneFrame)).toEqual({ container: 'mp3', tagBytes: 0, audioAt: 0 });
  });

  it('reads the fixture list the tests are written against', () => {
    expect(Object.keys(FIXTURES.accepted)).toHaveLength(13);
    expect(Object.keys(FIXTURES.refused)).toHaveLength(9);
    expect(
      readFileSync(new URL('../../../../fixtures/media/README.md', import.meta.url), 'utf8'),
    ).toContain('generate.mjs');
  });
});
