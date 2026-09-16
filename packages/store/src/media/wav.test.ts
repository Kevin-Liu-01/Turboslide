// The WAV parser over the four accepted fixtures and the ADPCM refusal (gslides-parity SPEC-5
// 3.9; R11 1.3): the duration within 20 ms of ffprobe's, the sample facts, the extensible and
// float forms, the pad byte rule, the clamped data size, and the refusals with the tag named.
import { describe, expect, it } from 'vitest';

import { MediaParseError } from './bytes.ts';
import { isRiffWave, parseWav, wavFormatName } from './wav.ts';
import { DURATION_TOLERANCE_MS, fixture, oracle } from './test-fixtures.ts';

describe('parseWav', () => {
  it.each(['tone-1s.wav', 'tone-1s-extensible.wav', 'tone-1s-float.wav', 'tone-1s-list.wav'])(
    'reads %s within 20 ms of ffprobe',
    (name) => {
      const facts = oracle(name);
      const info = parseWav(fixture(name));
      expect(Math.abs(info.durationMs - (facts.durationMs ?? 0))).toBeLessThanOrEqual(
        DURATION_TOLERANCE_MS,
      );
      expect(info.sampleRate).toBe(facts.streams[0]?.sampleRate);
      expect(info.channels).toBe(facts.streams[0]?.channels);
      expect(info.codec).toBe(facts.streams[0]?.codec);
    },
  );

  it('reads the plain PCM header of the 16,044 byte tone', () => {
    const info = parseWav(fixture('tone-1s.wav'));
    expect(info).toMatchObject({
      formatTag: 1,
      extensible: false,
      channels: 1,
      sampleRate: 8000,
      bitsPerSample: 16,
      blockAlign: 2,
      avgBytesPerSec: 16000,
      dataBytes: 16000,
      durationMs: 1000,
      codec: 'pcm_s16le',
    });
  });

  it('resolves the extensible form to its sub format and the float form to pcm_f32le', () => {
    expect(parseWav(fixture('tone-1s-extensible.wav'))).toMatchObject({
      formatTag: 1,
      extensible: true,
      codec: 'pcm_s16le',
    });
    expect(parseWav(fixture('tone-1s-float.wav'))).toMatchObject({
      formatTag: 3,
      extensible: false,
      bitsPerSample: 32,
      codec: 'pcm_f32le',
    });
  });

  it('refuses ADPCM, MP3 in WAV and every other format tag with the tag named', () => {
    expect(() => parseWav(fixture('tone-adpcm.wav'))).toThrow(/MS ADPCM/);
    expect(() => parseWav(fixture('tone-adpcm.wav'))).toThrow(MediaParseError);
    const mp3InWav = new Uint8Array(fixture('tone-1s.wav'));
    mp3InWav[20] = 0x55; // the format tag
    expect(() => parseWav(mp3InWav)).toThrow(/MP3/);
    expect(wavFormatName(0x11)).toBe('IMA ADPCM');
    expect(wavFormatName(0x1234)).toBe('format tag 0x1234');
  });

  it('clamps a data size past the end and one written as all ones, and refuses a file without fmt or data', () => {
    const cut = fixture('tone-1s.wav').subarray(0, 44 + 8000); // half the samples
    expect(parseWav(cut).durationMs).toBe(500);
    const streamed = new Uint8Array(fixture('tone-1s.wav'));
    streamed.set([0xff, 0xff, 0xff, 0xff], 40); // the data chunk's size unknown at write time
    expect(parseWav(streamed).durationMs).toBe(1000);
    expect(() => parseWav(fixture('tone-1s.wav').subarray(0, 12))).toThrow(/no fmt chunk/);
    expect(() => parseWav(fixture('tone-1s.wav').subarray(0, 36))).toThrow(/no data chunk/);
    expect(() => parseWav(new TextEncoder().encode('RIFF....WEBP'))).toThrow(/not a RIFF WAVE/);
    expect(isRiffWave(fixture('tone-1s.wav'))).toBe(true);
    expect(isRiffWave(fixture('bars.avi'))).toBe(false);
  });
});
