// The ISOBMFF parser over the three accepted fixtures and the refusals (gslides-parity SPEC-5
// 3.9; R11 1.2, 1.3): the mvhd duration within 20 ms of ffprobe's, the moov after mdat, the tkhd
// size, the hdlr handlers, the stsd codes, the M4A brand, a version 1 mvhd, the truncation and
// the bounds.
import { describe, expect, it } from 'vitest';

import { MediaParseError } from './bytes.ts';
import { isMp4Brand, parseIsobmff } from './isobmff.ts';
import { DURATION_TOLERANCE_MS, fixture, oracle } from './test-fixtures.ts';

function box(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + body.byteLength);
  new DataView(out.buffer).setUint32(0, out.byteLength);
  out.set(
    Array.from(type, (c) => c.charCodeAt(0)),
    4,
  );
  out.set(body, 8);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
}

function u64(value: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value));
  return out;
}

describe('parseIsobmff', () => {
  it.each(['bars-1s.mp4', 'bars-1s-nofaststart.mp4', 'tone-1s.m4a'])(
    'reads %s within 20 ms of ffprobe',
    (name) => {
      const facts = oracle(name);
      const info = parseIsobmff(fixture(name));
      expect(info.durationMs).not.toBeNull();
      expect(Math.abs((info.durationMs ?? 0) - (facts.durationMs ?? 0))).toBeLessThanOrEqual(
        DURATION_TOLERANCE_MS,
      );
      const video = info.tracks.find((track) => track.handler === 'vide');
      const audio = info.tracks.find((track) => track.handler === 'soun');
      const videoFact = facts.streams.find((stream) => stream.type === 'video');
      const audioFact = facts.streams.find((stream) => stream.type === 'audio');
      expect(video?.width).toBe(videoFact?.width);
      expect(video?.height).toBe(videoFact?.height);
      expect(audio?.sampleRate).toBe(audioFact?.sampleRate);
      expect(audio?.channels).toBe(audioFact?.channels);
    },
  );

  it('reads the brands, the handlers and the sample entry codes of the H.264 and AAC file', () => {
    const info = parseIsobmff(fixture('bars-1s.mp4'));
    expect(info.brand).toBe('isom');
    expect(info.compatible).toEqual(expect.arrayContaining(['iso2', 'avc1', 'mp41']));
    expect(info.timescale).toBe(1000);
    expect(info.fragmented).toBe(false);
    expect(info.tracks).toHaveLength(2);
    expect(info.tracks[0]).toMatchObject({
      handler: 'vide',
      codecs: ['avc1'],
      width: 320,
      height: 180,
    });
    expect(info.tracks[1]).toMatchObject({
      handler: 'soun',
      codecs: ['mp4a'],
      sampleRate: 48000,
      channels: 1,
    });
  });

  it('finds the moov after mdat in the file written without faststart', () => {
    const bytes = fixture('bars-1s-nofaststart.mp4');
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.indexOf('mdat')).toBeLessThan(text.indexOf('moov'));
    const info = parseIsobmff(bytes);
    expect(info.tracks.map((track) => track.handler)).toEqual(['vide', 'soun']);
    expect(info.durationMs).toBe(oracle('bars-1s-nofaststart.mp4').durationMs);
  });

  it('reads the M4A brand and the sound track alone of the AAC file', () => {
    const info = parseIsobmff(fixture('tone-1s.m4a'));
    expect(info.brand).toBe('M4A ');
    expect(info.tracks).toHaveLength(1);
    expect(info.tracks[0]).toMatchObject({
      handler: 'soun',
      codecs: ['mp4a'],
      sampleRate: 8000,
      channels: 1,
    });
    expect(info.tracks[0]?.width).toBeUndefined();
  });

  it('reads a version 1 mvhd with 64 bit times and a fragmented file through mehd', () => {
    const ftyp = box(
      'ftyp',
      concat(new TextEncoder().encode('isom'), u32(0x200), new TextEncoder().encode('isomiso5')),
    );
    const mvhd1 = box(
      'mvhd',
      concat(new Uint8Array([1, 0, 0, 0]), u64(0), u64(0), u32(90000), u64(90000 * 12.5)),
    );
    expect(parseIsobmff(concat(ftyp, box('moov', mvhd1)))).toMatchObject({
      timescale: 90000,
      durationMs: 12500,
    });
    // a fragmented file: mvhd duration 0, mehd carries 3.25 s at the movie time scale
    const mvhd0 = box(
      'mvhd',
      concat(new Uint8Array([0, 0, 0, 0]), u32(0), u32(0), u32(600), u32(0)),
    );
    const mehd = box('mehd', concat(new Uint8Array([0, 0, 0, 0]), u32(1950)));
    const info = parseIsobmff(concat(ftyp, box('moov', concat(mvhd0, box('mvex', mehd)))));
    expect(info).toMatchObject({ fragmented: true, durationMs: 3250 });
    // an unknown duration (all ones) answers null
    const unknown = box(
      'mvhd',
      concat(new Uint8Array([0, 0, 0, 0]), u32(0), u32(0), u32(600), u32(0xffffffff)),
    );
    expect(parseIsobmff(concat(ftyp, box('moov', unknown))).durationMs).toBeNull();
  });

  it('refuses the truncated file, a non ftyp file, a box shorter than its header and deep nesting', () => {
    expect(() => parseIsobmff(fixture('truncated.mp4'))).toThrow(/no moov box/);
    expect(() => parseIsobmff(fixture('truncated.mp4'))).toThrow(MediaParseError);
    expect(() => parseIsobmff(fixture('bars-1s.webm'))).toThrow(/ftyp/);
    const ftyp = box('ftyp', concat(new TextEncoder().encode('isom'), u32(0)));
    const bad = concat(ftyp, new Uint8Array([0, 0, 0, 4, 0x6d, 0x6f, 0x6f, 0x76]));
    expect(() => parseIsobmff(bad)).toThrow(/shorter than its header/);
    // moov > trak > trak > ... 70 levels deep
    let nest = box(
      'mvhd',
      concat(new Uint8Array([0, 0, 0, 0]), u32(0), u32(0), u32(1000), u32(1000)),
    );
    for (let i = 0; i < 70; i++) nest = box('trak', nest);
    expect(() => parseIsobmff(concat(ftyp, box('moov', nest)))).toThrow(/deeper than 64/);
    // a moov whose size runs past the end of the file
    const cut = fixture('bars-1s.mp4').subarray(0, 600);
    expect(() => parseIsobmff(cut)).toThrow(MediaParseError);
  });

  it('knows the mp4 brand set', () => {
    expect(isMp4Brand('isom', [])).toBe(true);
    expect(isMp4Brand('M4A ', [])).toBe(true);
    expect(isMp4Brand('qt  ', [])).toBe(false);
    expect(isMp4Brand('3gp4', ['isom'])).toBe(true);
    expect(isMp4Brand('3gp4', ['3gp5'])).toBe(false);
  });
});
