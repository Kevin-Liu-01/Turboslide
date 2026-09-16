// The EBML parser over the two webm fixtures and the mkv refusal (gslides-parity SPEC-5 3.9; R11
// 1.2, 1.3): the Duration times TimestampScale within 20 ms of ffprobe's, the tracks with their
// codec ids, size, sample rate and channels, the live file with an unknown Segment size and no
// Duration (durationMs null), the DocType, the stop at the first Cluster, and the bounds.
import { describe, expect, it } from 'vitest';

import { MediaParseError } from './bytes.ts';
import { EBML_IDS, parseEbml } from './ebml.ts';
import { DURATION_TOLERANCE_MS, fixture, oracle } from './test-fixtures.ts';

/** An EBML element with a one byte size vint (bodies under 127 bytes) or an eight byte one. */
function element(id: number, body: Uint8Array, unknownSize = false): Uint8Array {
  const idBytes: number[] = [];
  let rest = id;
  while (rest > 0) {
    idBytes.unshift(rest & 0xff);
    rest = Math.floor(rest / 256);
  }
  const size = unknownSize
    ? [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
    : body.byteLength < 127
      ? [0x80 | body.byteLength]
      : [
          0x01,
          0,
          0,
          0,
          (body.byteLength >>> 24) & 0xff,
          (body.byteLength >>> 16) & 0xff,
          (body.byteLength >>> 8) & 0xff,
          body.byteLength & 0xff,
        ];
  const out = new Uint8Array(idBytes.length + size.length + body.byteLength);
  out.set(idBytes, 0);
  out.set(size, idBytes.length);
  out.set(body, idBytes.length + size.length);
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

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function float64(value: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setFloat64(0, value);
  return out;
}

const HEADER = element(EBML_IDS.header, element(EBML_IDS.docType, text('webm')));

describe('parseEbml', () => {
  it('reads bars-1s.webm within 20 ms of ffprobe with its tracks', () => {
    const facts = oracle('bars-1s.webm');
    const info = parseEbml(fixture('bars-1s.webm'));
    expect(info.docType).toBe('webm');
    expect(info.timestampScale).toBe(1_000_000);
    expect(info.liveSegment).toBe(false);
    expect(info.durationMs).not.toBeNull();
    expect(Math.abs((info.durationMs ?? 0) - (facts.durationMs ?? 0))).toBeLessThanOrEqual(
      DURATION_TOLERANCE_MS,
    );
    expect(info.tracks).toHaveLength(2);
    expect(info.tracks[0]).toMatchObject({ type: 1, codecId: 'V_VP9', width: 320, height: 180 });
    expect(info.tracks[1]).toMatchObject({
      type: 2,
      codecId: 'A_OPUS',
      sampleRate: 48000,
      channels: 1,
    });
    expect(info.muxingApp).toContain('Lavf');
  });

  it('reads the live file with an unknown Segment size and no Duration as durationMs null', () => {
    const info = parseEbml(fixture('bars-live.webm'));
    expect(oracle('bars-live.webm').durationMs).toBeNull();
    expect(info.liveSegment).toBe(true);
    expect(info.durationMs).toBeNull();
    expect(info.tracks.map((track) => track.codecId)).toEqual(['V_VP9', 'A_OPUS']);
  });

  it('reads the mkv fixture as DocType matroska so the intake can refuse it by name', () => {
    expect(parseEbml(fixture('bars.mkv')).docType).toBe('matroska');
  });

  it('applies the TimestampScale to the Duration and stops at the first Cluster', () => {
    const info = element(
      EBML_IDS.info,
      concat(
        element(EBML_IDS.timestampScale, new Uint8Array([0x0f, 0x42, 0x40])),
        element(EBML_IDS.duration, float64(2500)),
      ),
    );
    const tracks = element(
      EBML_IDS.tracks,
      element(
        EBML_IDS.trackEntry,
        concat(
          element(EBML_IDS.trackType, new Uint8Array([2])),
          element(EBML_IDS.codecId, text('A_OPUS')),
        ),
      ),
    );
    // a Cluster of unknown size holding garbage, then an Info that must never be read
    const cluster = element(EBML_IDS.cluster, new Uint8Array([0xde, 0xad, 0xbe, 0xef]), true);
    const late = element(EBML_IDS.info, element(EBML_IDS.duration, float64(99)));
    const file = concat(
      HEADER,
      element(EBML_IDS.segment, concat(info, tracks, cluster, late), true),
    );
    const parsed = parseEbml(file);
    expect(parsed.durationMs).toBe(2500);
    expect(parsed.liveSegment).toBe(true);
    expect(parsed.tracks).toEqual([{ number: 0, type: 2, codecId: 'A_OPUS' }]);
    // a scale of 500,000 ns halves the milliseconds
    const halved = element(
      EBML_IDS.info,
      concat(
        element(EBML_IDS.timestampScale, new Uint8Array([0x07, 0xa1, 0x20])),
        element(EBML_IDS.duration, float64(2500)),
      ),
    );
    expect(parseEbml(concat(HEADER, element(EBML_IDS.segment, halved))).durationMs).toBe(1250);
  });

  it('refuses a non EBML file, a header without DocType, a file without Segment and a bad vint', () => {
    expect(() => parseEbml(fixture('bars-1s.mp4'))).toThrow(/EBML header/);
    expect(() => parseEbml(element(EBML_IDS.header, new Uint8Array(0)))).toThrow(/DocType/);
    expect(() => parseEbml(HEADER)).toThrow(/no Segment/);
    const badVint = concat(HEADER, new Uint8Array([0x00, 0x00]));
    expect(() => parseEbml(badVint)).toThrow(MediaParseError);
    // an element whose size runs past the end is read as far as the bytes go; a cut file still answers
    const cut = fixture('bars-1s.webm').subarray(0, 700);
    expect(parseEbml(cut).docType).toBe('webm');
  });
});
