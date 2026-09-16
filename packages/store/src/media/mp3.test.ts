// The MP3 parser over the four fixtures (gslides-parity SPEC-5 3.9; R11 1.2, 1.3): the ID3v2 tag
// skip with and without a footer, the frame header tables for MPEG-2.5 at 8 kHz and MPEG-1 at
// 44.1 kHz, the Info and Xing headers with the LAME delay and padding (ffprobe reads exactly
// 1000 ms for the one second tone through them), the frame walk on a bare stream (ffprobe's
// 1152 ms: sixteen frames of 576 samples), and the refusals.
import { describe, expect, it } from 'vitest';

import { MediaParseError } from './bytes.ts';
import { findFirstFrame, frameHeaderAt, id3v2Size, parseMp3 } from './mp3.ts';
import { DURATION_TOLERANCE_MS, fixture, oracle } from './test-fixtures.ts';

describe('parseMp3', () => {
  it.each(['tone-1s.mp3', 'tone-cbr.mp3', 'tone-vbr.mp3', 'tone-id3.mp3'])(
    'reads %s within 20 ms of ffprobe',
    (name) => {
      const facts = oracle(name);
      const info = parseMp3(fixture(name));
      expect(Math.abs(info.durationMs - (facts.durationMs ?? 0))).toBeLessThanOrEqual(
        DURATION_TOLERANCE_MS,
      );
      expect(info.sampleRate).toBe(facts.streams[0]?.sampleRate);
      expect(info.channels).toBe(facts.streams[0]?.channels);
    },
  );

  it('reads the Info header and the LAME tag of the constant bitrate tone', () => {
    const info = parseMp3(fixture('tone-1s.mp3'));
    expect(info.vbrHeader).toBe('info');
    expect(info.header).toMatchObject({
      version: 2.5,
      layer: 3,
      bitrateKbps: 32,
      sampleRate: 8000,
      samplesPerFrame: 576,
      channels: 1,
    });
    expect(info.encoderDelay).toBeGreaterThan(0);
    expect(info.encoderPadding).toBeGreaterThan(0);
    expect(info.audioAt).toBeGreaterThan(0); // after ffmpeg's ID3v2.4 tag
    expect(info.durationMs).toBe(1000);
  });

  it('walks the frames of a bare stream with no header', () => {
    const info = parseMp3(fixture('tone-cbr.mp3'));
    expect(info.vbrHeader).toBeNull();
    expect(info.audioAt).toBe(0);
    expect(info.frames).toBe(16);
    expect(info.durationMs).toBe(1152);
    expect(info.bitrateKbps).toBe(32);
    expect(info.encoderDelay).toBeUndefined();
  });

  it('reads the Xing header of the variable bitrate stereo tone', () => {
    const info = parseMp3(fixture('tone-vbr.mp3'));
    expect(info.vbrHeader).toBe('xing');
    expect(info.header).toMatchObject({
      version: 1,
      layer: 3,
      sampleRate: 44100,
      samplesPerFrame: 1152,
      channels: 2,
    });
    expect(info.durationMs).toBe(1000);
  });

  it('skips an ID3v2.4 tag whose footer flag is set', () => {
    const bytes = fixture('tone-id3.mp3');
    expect(id3v2Size(bytes)).toBe(110);
    expect(findFirstFrame(bytes, 110)).toBe(110);
    const info = parseMp3(bytes);
    expect(info.audioAt).toBe(110);
    expect(info.durationMs).toBe(1152);
    // the same bytes with the footer flag cleared skip ten bytes fewer and then find the frame by the sync search
    const noFooter = new Uint8Array(bytes);
    noFooter[5] = 0;
    expect(id3v2Size(noFooter)).toBe(100);
    expect(parseMp3(noFooter).audioAt).toBe(110);
  });

  it('parses frame headers by the tables and refuses reserved values', () => {
    // MPEG-1 Layer III, 128 kbps, 44.1 kHz, no padding, joint stereo
    expect(frameHeaderAt(new Uint8Array([0xff, 0xfb, 0x90, 0x64]), 0)).toMatchObject({
      version: 1,
      layer: 3,
      bitrateKbps: 128,
      sampleRate: 44100,
      padding: false,
      channels: 2,
      frameBytes: 417,
    });
    // padding adds one byte
    expect(frameHeaderAt(new Uint8Array([0xff, 0xfb, 0x92, 0x64]), 0)?.frameBytes).toBe(418);
    // MPEG-2 Layer III 48 kHz index 1 is 24 kHz, 64 kbps index 8
    expect(frameHeaderAt(new Uint8Array([0xff, 0xf3, 0x84, 0xc0]), 0)).toMatchObject({
      version: 2,
      sampleRate: 24000,
      bitrateKbps: 64,
      channels: 1,
      samplesPerFrame: 576,
    });
    // Layer I: 288 kbps at 44.1 kHz is (floor(12 * 288000 / 44100) + 0) * 4 = 312 bytes
    expect(frameHeaderAt(new Uint8Array([0xff, 0xfe, 0x90, 0x00]), 0)).toMatchObject({
      layer: 1,
      bitrateKbps: 288,
      samplesPerFrame: 384,
      frameBytes: 312,
    });
    // reserved version, reserved layer, bad bitrate, bad sample rate, no sync
    expect(frameHeaderAt(new Uint8Array([0xff, 0xeb, 0x90, 0x64]), 0)).toBeNull();
    expect(frameHeaderAt(new Uint8Array([0xff, 0xf9, 0x90, 0x64]), 0)).toBeNull();
    expect(frameHeaderAt(new Uint8Array([0xff, 0xfb, 0xf0, 0x64]), 0)).toBeNull();
    expect(frameHeaderAt(new Uint8Array([0xff, 0xfb, 0x9c, 0x64]), 0)).toBeNull();
    expect(frameHeaderAt(new Uint8Array([0xfe, 0xfb, 0x90, 0x64]), 0)).toBeNull();
    expect(frameHeaderAt(new Uint8Array([0xff, 0xfb]), 0)).toBeNull();
  });

  it('refuses a stream with no frame and a Layer II stream', () => {
    expect(() => parseMp3(new TextEncoder().encode('ID3\x04\x00\x00\x00\x00\x00\x02ab'))).toThrow(
      MediaParseError,
    );
    expect(() => parseMp3(new TextEncoder().encode('nothing here'))).toThrow(/no MPEG audio frame/);
    // two Layer II frames back to back: MPEG-1 Layer II, 128 kbps (index 8), 44.1 kHz: 417 bytes each
    const layer2 = new Uint8Array(417 * 2);
    layer2.set([0xff, 0xfd, 0x80, 0x64], 0);
    layer2.set([0xff, 0xfd, 0x80, 0x64], 417);
    expect(() => parseMp3(layer2)).toThrow(/Layer II/);
  });
});
