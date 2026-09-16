// `mediaInfo` over every fixture (gslides-parity SPEC-5 0.18, 3.3, 3.9; R11 1.1, 8.4): each
// accepted file answers its format, kind, mime, extension, codecs and duration within 20 ms of
// ffprobe's; each refused file answers the sentence of R11 1.1's table; the bundle scan's rule
// refuses a name whose bytes disagree; the playability advisory follows the engine tables.
import { describe, expect, it } from 'vitest';

import {
  ACCEPTED_MEDIA_SENTENCE,
  CONTAINER_OF_FORMAT,
  MATROSKA_SENTENCE,
  MEDIA_FORMATS,
  QUICKTIME_SENTENCE,
  UNKNOWN_MEDIA_SENTENCE,
  isMediaRefusal,
  mediaFormatOfName,
  mediaFormatProblem,
  mediaInfo,
  playabilityOf,
} from './info.ts';
import { DURATION_TOLERANCE_MS, FIXTURES, fixture, oracle } from './test-fixtures.ts';

const CODEC_NAMES: Record<string, string> = {
  avc1: 'h264',
  mp4a: 'aac',
  V_VP9: 'vp9',
  A_OPUS: 'opus',
  mp3: 'mp3',
};

describe('mediaInfo on the accepted fixtures', () => {
  it.each(Object.keys(FIXTURES.accepted))('reads %s as ffprobe does', (name) => {
    const facts = oracle(name);
    const result = mediaInfo(fixture(name));
    if (isMediaRefusal(result)) throw new Error(result.refused);
    expect(result.format).toBe(facts.format);
    expect(result.bytes).toBe(facts.bytes);
    if (facts.durationMs === null) expect(result.durationMs).toBeNull();
    else
      expect(Math.abs((result.durationMs ?? Number.NaN) - facts.durationMs)).toBeLessThanOrEqual(
        DURATION_TOLERANCE_MS,
      );
    const videoFact = facts.streams.find((stream) => stream.type === 'video');
    expect(result.kind).toBe(videoFact === undefined ? 'audio' : 'video');
    if (videoFact !== undefined) expect(result.size).toEqual([videoFact.width, videoFact.height]);
    else expect(result.size).toBeUndefined();
    const audioFact = facts.streams.find((stream) => stream.type === 'audio');
    expect(result.sampleRate).toBe(audioFact?.sampleRate);
    expect(result.channels).toBe(audioFact?.channels);
    // the codec list names what ffprobe names, in the same order, through the code table
    const named = result.codecs.map((code) => CODEC_NAMES[code] ?? code);
    expect(named).toEqual(facts.streams.map((stream) => stream.codec));
    expect(result.ext).toBe(facts.format);
    expect(CONTAINER_OF_FORMAT[result.format]).toBe(result.container);
  });

  it('stores the five mimes with their extensions', () => {
    expect(mediaInfo(fixture('bars-1s.mp4'))).toMatchObject({
      mime: 'video/mp4',
      ext: 'mp4',
      brand: 'isom',
    });
    expect(mediaInfo(fixture('tone-1s.m4a'))).toMatchObject({
      mime: 'audio/mp4',
      ext: 'm4a',
      kind: 'audio',
      brand: 'M4A',
    });
    expect(mediaInfo(fixture('bars-1s.webm'))).toMatchObject({
      mime: 'video/webm',
      ext: 'webm',
      brand: 'webm',
      live: false,
    });
    expect(mediaInfo(fixture('bars-live.webm'))).toMatchObject({
      mime: 'video/webm',
      live: true,
      durationMs: null,
    });
    expect(mediaInfo(fixture('tone-1s.mp3'))).toMatchObject({
      mime: 'audio/mpeg',
      ext: 'mp3',
      codecs: ['mp3'],
    });
    expect(mediaInfo(fixture('tone-1s.wav'))).toMatchObject({
      mime: 'audio/wav',
      ext: 'wav',
      codecs: ['pcm_s16le'],
    });
  });

  it('carries the playability advisory of R11 1.1', () => {
    expect(mediaInfo(fixture('bars-1s.mp4'))).toMatchObject({
      playable: { chromium: false, chrome: true, safari: true, firefox: 'os' },
    });
    expect(mediaInfo(fixture('tone-1s.m4a'))).toMatchObject({ playable: { chromium: false } });
    expect(mediaInfo(fixture('bars-1s.webm'))).toMatchObject({
      playable: { chromium: true, chrome: true, safari: true, firefox: 'yes' },
    });
    expect(mediaInfo(fixture('tone-1s.mp3'))).toMatchObject({ playable: { chromium: true } });
    expect(playabilityOf('mp4', ['hvc1', 'mp4a'])).toEqual({
      chromium: false,
      chrome: false,
      safari: true,
      firefox: 'no',
    });
    expect(playabilityOf('mp4', ['av01', 'Opus'])).toEqual({
      chromium: true,
      chrome: true,
      safari: true,
      firefox: 'yes',
    });
  });
});

describe('mediaInfo on the refused fixtures', () => {
  function refusal(name: string): string {
    const result = mediaInfo(fixture(name));
    if (!isMediaRefusal(result)) throw new Error(`${name} was accepted as ${result.format}`);
    return result.refused;
  }

  it('answers one sentence per refusal naming what to do', () => {
    expect(refusal('bars-1s.mov')).toBe(QUICKTIME_SENTENCE);
    expect(refusal('tone.ogg')).toBe('An Ogg file is not accepted. Convert it to mp3 or m4a.');
    expect(refusal('bars.mkv')).toBe(MATROSKA_SENTENCE);
    expect(refusal('tone.flac')).toBe(`A FLAC file is not accepted. ${ACCEPTED_MEDIA_SENTENCE}`);
    expect(refusal('tone.aac')).toBe(
      `A raw AAC (adts) file is not accepted. ${ACCEPTED_MEDIA_SENTENCE}`,
    );
    expect(refusal('bars.avi')).toBe(`An AVI file is not accepted. ${ACCEPTED_MEDIA_SENTENCE}`);
    expect(refusal('tone-adpcm.wav')).toMatch(
      /^The wav file could not be read: the WAV holds MS ADPCM audio; only PCM and float WAV files are accepted\.$/,
    );
    expect(refusal('truncated.mp4')).toMatch(/^The mp4 file could not be read: no moov box/);
    // the webm bytes under an mp4 name are a webm to mediaInfo; the name check is the bundle scan's
    expect(mediaInfo(fixture('webm-as.mp4'))).toMatchObject({ format: 'webm' });
    expect(mediaInfo(new TextEncoder().encode('plain text'))).toEqual({
      refused: UNKNOWN_MEDIA_SENTENCE,
      container: null,
    });
    expect(mediaInfo(new Uint8Array(0))).toEqual({
      refused: UNKNOWN_MEDIA_SENTENCE,
      container: null,
    });
  });

  it('refuses an ISO file with a brand outside the set and an EBML file with another DocType', () => {
    const threeGp = new Uint8Array(fixture('bars-1s.mp4'));
    threeGp.set([0x33, 0x67, 0x70, 0x34], 8); // major brand 3gp4
    for (let at = 16; at < 32; at += 4) threeGp.set([0x33, 0x67, 0x70, 0x35], at); // compatible brands 3gp5
    const result = mediaInfo(threeGp);
    expect(isMediaRefusal(result) && result.refused).toBe(
      `An ISO media file with the brand "3gp4" is not accepted. ${ACCEPTED_MEDIA_SENTENCE}`,
    );
    const other = new Uint8Array(fixture('bars-1s.webm'));
    const docTypeAt = new TextDecoder('latin1').decode(other).indexOf('webm');
    other.set([0x78, 0x78, 0x78, 0x78], docTypeAt); // DocType xxxx
    const ebml = mediaInfo(other);
    expect(isMediaRefusal(ebml) && ebml.refused).toBe(
      `An EBML file with the DocType "xxxx" is not accepted. ${ACCEPTED_MEDIA_SENTENCE}`,
    );
  });

  it('every refusal sentence ends with a period and names no code word', () => {
    for (const name of Object.keys(FIXTURES.refused)) {
      if (name === 'webm-as.mp4') continue;
      const sentence = refusal(name);
      expect(sentence.endsWith('.')).toBe(true);
      expect(sentence).not.toMatch(/undefined|null|NaN/);
    }
  });
});

describe('the names and the bundle scan rule', () => {
  it('maps the six extensions onto the five formats', () => {
    expect(MEDIA_FORMATS).toEqual(['mp4', 'webm', 'mp3', 'm4a', 'wav']);
    expect(mediaFormatOfName('talk.MP4')).toBe('mp4');
    expect(mediaFormatOfName('clip.m4v')).toBe('mp4');
    expect(mediaFormatOfName('assets/tone.a1b2c3d4.m4a')).toBe('m4a');
    expect(mediaFormatOfName('x.webm')).toBe('webm');
    expect(mediaFormatOfName('x.mp3')).toBe('mp3');
    expect(mediaFormatOfName('x.wav')).toBe('wav');
    expect(mediaFormatOfName('x.mov')).toBeNull();
    expect(mediaFormatOfName('x.png')).toBeNull();
    expect(mediaFormatOfName('noext')).toBeNull();
  });

  it('accepts a name whose bytes agree and refuses one whose bytes disagree', () => {
    expect(mediaFormatProblem('assets/a.mp4', fixture('bars-1s.mp4'))).toBeNull();
    expect(mediaFormatProblem('assets/a.m4v', fixture('bars-1s.mp4'))).toBeNull();
    expect(mediaFormatProblem('assets/a.m4a', fixture('tone-1s.m4a'))).toBeNull();
    expect(mediaFormatProblem('assets/a.m4a', fixture('bars-1s.mp4'))).toBeNull(); // the kind is the record's, not the name's
    expect(mediaFormatProblem('assets/a.webm', fixture('bars-1s.webm'))).toBeNull();
    expect(mediaFormatProblem('assets/a.webm', fixture('bars-live.webm'))).toBeNull();
    expect(mediaFormatProblem('assets/a.mp3', fixture('tone-1s.mp3'))).toBeNull();
    expect(mediaFormatProblem('assets/a.mp3', fixture('tone-cbr.mp3'))).toBeNull();
    expect(mediaFormatProblem('assets/a.wav', fixture('tone-1s.wav'))).toBeNull();
    expect(mediaFormatProblem('assets/a.mp4', fixture('webm-as.mp4'))).toBe(
      'assets/a.mp4: the bytes are a webm file, not mp4',
    );
    expect(mediaFormatProblem('assets/a.mp4', fixture('bars-1s.mov'))).toBe(
      'assets/a.mp4: the bytes are a mov file, not mp4',
    );
    expect(mediaFormatProblem('assets/a.webm', fixture('bars.mkv'))).toBe(
      'assets/a.webm: the bytes are a mkv file, not webm',
    );
    expect(mediaFormatProblem('assets/a.mp3', fixture('tone.aac'))).toBe(
      'assets/a.mp3: the bytes are a aac file, not mp3',
    );
    expect(mediaFormatProblem('assets/a.wav', fixture('tone-1s.mp3'))).toBe(
      'assets/a.wav: the bytes are a mp3 file, not wav',
    );
    expect(mediaFormatProblem('assets/a.wav', new TextEncoder().encode('nope'))).toBe(
      'assets/a.wav: the bytes are not an audio or video file',
    );
    expect(mediaFormatProblem('assets/a.mov', fixture('bars-1s.mov'))).toBe(
      'assets/a.mov: not a media file name',
    );
    // the ADPCM wav passes the name rule (it is a RIFF WAVE); the parser refuses it at intake
    expect(mediaFormatProblem('assets/a.wav', fixture('tone-adpcm.wav'))).toBeNull();
  });
});
