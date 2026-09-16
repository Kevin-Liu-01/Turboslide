#!/usr/bin/env node
// Generates the media fixtures of gslides-parity SPEC-5 3.9 and R11 8.3 into this folder, once,
// on a builder's machine; the files are committed and the check chain never runs this script
// (MILESTONES-5 rules: a fixture that needs ffmpeg is generated once and committed). The WAV
// files, the ID3 variant, the mismatch copy and the truncation are written by this script with no
// tool; the compressed files come from ffmpeg (8.1.2 on 2026-09-15, /opt/homebrew/bin/ffmpeg),
// each command recorded below and in README.md. The last step reads every accepted file with
// ffprobe and writes facts.json, the oracle packages/store/src/media/*.test.ts compares the
// parsers against (duration within 20 ms), with the byte count and sha256 per file so a changed
// fixture is caught.
//
//   node fixtures/media/generate.mjs            # everything
//   node fixtures/media/generate.mjs --facts    # facts.json alone, from the files present
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FACTS_ONLY = process.argv.includes('--facts');

function out(name) {
  return join(HERE, name);
}

// ---------------------------------------------------------------------------------------------
// WAV by hand: one second of a 440 Hz sine at 8 kHz

const SAMPLE_RATE = 8000;
const SECONDS = 1;
const FREQUENCY = 440;

function sineSamples() {
  const samples = new Float64Array(SAMPLE_RATE * SECONDS);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin((2 * Math.PI * FREQUENCY * i) / SAMPLE_RATE) * 0.5;
  }
  return samples;
}

function chunk(id, body) {
  const header = Buffer.alloc(8);
  header.write(id, 0, 'ascii');
  header.writeUInt32LE(body.length, 4);
  const pad = body.length % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([header, body, pad]);
}

function riffWave(chunks) {
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WAVE', 8, 'ascii');
  return Buffer.concat([header, body]);
}

/** The 16 byte PCM fmt body: tag, channels, rate, byte rate, block align, bits. */
function fmtPcm(tag, channels, rate, bits) {
  const blockAlign = (channels * bits) / 8;
  const body = Buffer.alloc(16);
  body.writeUInt16LE(tag, 0);
  body.writeUInt16LE(channels, 2);
  body.writeUInt32LE(rate, 4);
  body.writeUInt32LE(rate * blockAlign, 8);
  body.writeUInt16LE(blockAlign, 12);
  body.writeUInt16LE(bits, 14);
  return body;
}

/** WAVE_FORMAT_EXTENSIBLE (0xFFFE): the PCM body, cbSize 22, valid bits, channel mask, the sub format GUID. */
function fmtExtensible(subTag, channels, rate, bits) {
  const base = fmtPcm(0xfffe, channels, rate, bits);
  const ext = Buffer.alloc(24);
  ext.writeUInt16LE(22, 0); // cbSize
  ext.writeUInt16LE(bits, 2); // valid bits per sample
  ext.writeUInt32LE(channels === 1 ? 0x4 : 0x3, 4); // speaker mask: front centre, or front left and right
  // KSDATAFORMAT_SUBTYPE_PCM is 00000001-0000-0010-8000-00aa00389b71; the first two bytes are the tag
  const guid = Buffer.from([
    0, 0, 0, 0, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71,
  ]);
  guid.writeUInt16LE(subTag, 0);
  guid.copy(ext, 8);
  return Buffer.concat([base, ext]);
}

function pcm16(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, i) => data.writeInt16LE(Math.round(value * 32767), i * 2));
  return data;
}

function float32(samples) {
  const data = Buffer.alloc(samples.length * 4);
  samples.forEach((value, i) => data.writeFloatLE(value, i * 4));
  return data;
}

function writeWavs() {
  const samples = sineSamples();
  // tone-1s.wav: 44 byte header plus 16,000 bytes of data, 16,044 bytes (R11 8.3)
  writeFileSync(
    out('tone-1s.wav'),
    riffWave([chunk('fmt ', fmtPcm(1, 1, SAMPLE_RATE, 16)), chunk('data', pcm16(samples))]),
  );
  // the extensible variant: the same samples under WAVE_FORMAT_EXTENSIBLE with the PCM sub format
  writeFileSync(
    out('tone-1s-extensible.wav'),
    riffWave([chunk('fmt ', fmtExtensible(1, 1, SAMPLE_RATE, 16)), chunk('data', pcm16(samples))]),
  );
  // the float variant: IEEE float 32 bit (format tag 3) with a fact chunk, as encoders write it
  const fact = Buffer.alloc(4);
  fact.writeUInt32LE(samples.length, 0);
  writeFileSync(
    out('tone-1s-float.wav'),
    riffWave([
      chunk('fmt ', fmtPcm(3, 1, SAMPLE_RATE, 32)),
      chunk('fact', fact),
      chunk('data', float32(samples)),
    ]),
  );
  // a LIST chunk before data with an odd sized body, so the pad byte rule is exercised
  const list = Buffer.concat([
    Buffer.from('INFO', 'ascii'),
    chunk('ISFT', Buffer.from('Turboslide\0', 'ascii')),
  ]);
  writeFileSync(
    out('tone-1s-list.wav'),
    riffWave([
      chunk('fmt ', fmtPcm(1, 1, SAMPLE_RATE, 16)),
      chunk('LIST', list),
      chunk('data', pcm16(samples)),
    ]),
  );
}

// ---------------------------------------------------------------------------------------------
// ffmpeg

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: 'inherit',
  });
}

const TONE = ['-i', out('tone-1s.wav')];
const BARS = [
  '-f',
  'lavfi',
  '-i',
  'testsrc=size=320x180:rate=10',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:sample_rate=48000',
  '-t',
  '1',
];

/** The ffmpeg commands, in the order README.md lists them; `--facts` skips them. */
const COMMANDS = [
  // mp3: constant bitrate 32 kbps at 8 kHz (MPEG-2.5 Layer III, 576 samples per frame) with ffmpeg's
  // default Info header and ID3v2.4 tag
  ['tone-1s.mp3', [...TONE, '-c:a', 'libmp3lame', '-b:a', '32k']],
  // mp3: the same stream with no Xing or Info header and no tag, so the frame walk is the only path
  [
    'tone-cbr.mp3',
    [...TONE, '-c:a', 'libmp3lame', '-b:a', '32k', '-write_xing', '0', '-id3v2_version', '0'],
  ],
  // mp3: variable bitrate at 44.1 kHz stereo (MPEG-1 Layer III, 1152 samples per frame) with a Xing header
  ['tone-vbr.mp3', [...TONE, '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-q:a', '9']],
  // wav: MS ADPCM, refused by the WAV parser (format tag 2)
  ['tone-adpcm.wav', [...TONE, '-c:a', 'adpcm_ms']],
  // m4a: AAC in an MP4 container with the M4A brand
  ['tone-1s.m4a', [...TONE, '-c:a', 'aac', '-b:a', '48k', '-movflags', '+faststart']],
  // webm: VP9 and Opus, 320 by 180 at 10 frames per second, one second
  [
    'bars-1s.webm',
    [...BARS, '-c:v', 'libvpx-vp9', '-b:v', '200k', '-c:a', 'libopus', '-b:a', '48k'],
  ],
  // webm: the same in the muxer's live mode, so the Segment has no size, no Duration and no Cues (a MediaRecorder shape)
  [
    'bars-live.webm',
    [
      ...BARS,
      '-c:v',
      'libvpx-vp9',
      '-b:v',
      '200k',
      '-c:a',
      'libopus',
      '-b:a',
      '48k',
      '-live',
      '1',
      '-f',
      'webm',
    ],
  ],
  // mp4: H.264 and AAC with faststart (moov before mdat)
  [
    'bars-1s.mp4',
    [
      ...BARS,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '48k',
      '-movflags',
      '+faststart',
    ],
  ],
  // mp4: the same without faststart (moov after mdat)
  [
    'bars-1s-nofaststart.mp4',
    [
      ...BARS,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '48k',
    ],
  ],
  // the refusals
  [
    'bars-1s.mov',
    [
      ...BARS,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '48k',
      '-f',
      'mov',
    ],
  ],
  ['tone.ogg', [...TONE, '-ar', '48000', '-c:a', 'libopus', '-b:a', '48k', '-f', 'ogg']],
  [
    'bars.mkv',
    [
      ...BARS,
      '-c:v',
      'libvpx-vp9',
      '-b:v',
      '200k',
      '-c:a',
      'libopus',
      '-b:a',
      '48k',
      '-f',
      'matroska',
    ],
  ],
  ['tone.flac', [...TONE, '-c:a', 'flac']],
  ['tone.aac', [...TONE, '-c:a', 'aac', '-b:a', '48k', '-f', 'adts']],
  ['bars.avi', [...BARS, '-c:v', 'mpeg4', '-c:a', 'mp3', '-f', 'avi']],
];

function runFfmpeg() {
  for (const [name, args] of COMMANDS) ffmpeg([...args, out(name)]);
}

// ---------------------------------------------------------------------------------------------
// The variants written by hand from the generated files

function synchsafe(size) {
  return Buffer.from([(size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f]);
}

/** An ID3v2.4 tag with the footer flag set: 10 byte header, one TIT2 frame, padding, 10 byte footer. */
function id3v24WithFooter() {
  const text = Buffer.concat([Buffer.from([0x03]), Buffer.from('Turboslide tone', 'utf8')]); // encoding UTF-8
  const frame = Buffer.concat([
    Buffer.from('TIT2', 'ascii'),
    synchsafe(text.length),
    Buffer.alloc(2),
    text,
  ]);
  const padding = Buffer.alloc(64);
  const body = Buffer.concat([frame, padding]);
  const header = Buffer.concat([
    Buffer.from('ID3', 'ascii'),
    Buffer.from([4, 0, 0x10]),
    synchsafe(body.length),
  ]);
  const footer = Buffer.concat([
    Buffer.from('3DI', 'ascii'),
    Buffer.from([4, 0, 0x10]),
    synchsafe(body.length),
  ]);
  return Buffer.concat([header, body, footer]);
}

function writeVariants() {
  // tone-id3.mp3: the bare CBR stream behind an ID3v2.4 tag whose footer flag is set (R11 1.2)
  writeFileSync(
    out('tone-id3.mp3'),
    Buffer.concat([id3v24WithFooter(), readFileSync(out('tone-cbr.mp3'))]),
  );
  // webm-as.mp4: the webm bytes under an mp4 name, the extension and bytes disagree
  writeFileSync(out('webm-as.mp4'), readFileSync(out('bars-1s.webm')));
  // truncated.mp4: the first 4,096 bytes of the no faststart file, so ftyp and part of mdat are present and moov is not
  writeFileSync(
    out('truncated.mp4'),
    readFileSync(out('bars-1s-nofaststart.mp4')).subarray(0, 4096),
  );
}

// ---------------------------------------------------------------------------------------------
// facts.json from ffprobe

/** The accepted fixtures whose facts the parser tests compare against, with the format the sniff must answer. */
const ACCEPTED = [
  ['tone-1s.wav', 'wav'],
  ['tone-1s-extensible.wav', 'wav'],
  ['tone-1s-float.wav', 'wav'],
  ['tone-1s-list.wav', 'wav'],
  ['tone-1s.mp3', 'mp3'],
  ['tone-cbr.mp3', 'mp3'],
  ['tone-vbr.mp3', 'mp3'],
  ['tone-id3.mp3', 'mp3'],
  ['tone-1s.m4a', 'm4a'],
  ['bars-1s.webm', 'webm'],
  ['bars-live.webm', 'webm'],
  ['bars-1s.mp4', 'mp4'],
  ['bars-1s-nofaststart.mp4', 'mp4'],
];

/** The files the intake refuses, with the reason the tests expect in the refusal sentence. */
const REFUSED = [
  ['tone-adpcm.wav', 'adpcm'],
  ['bars-1s.mov', 'mov'],
  ['tone.ogg', 'ogg'],
  ['bars.mkv', 'mkv'],
  ['tone.flac', 'flac'],
  ['tone.aac', 'aac'],
  ['bars.avi', 'avi'],
  ['webm-as.mp4', 'mismatch'],
  ['truncated.mp4', 'truncated'],
];

function ffprobe(file) {
  const json = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration,format_name:stream=codec_type,codec_name,width,height,sample_rate,channels,duration',
      '-of',
      'json',
      file,
    ],
    { encoding: 'utf8' },
  );
  return JSON.parse(json);
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function writeFacts() {
  const version = execFileSync('ffprobe', ['-version'], { encoding: 'utf8' }).split('\n')[0];
  const facts = {
    generatedAt: new Date().toISOString().slice(0, 10),
    ffprobe: version,
    accepted: {},
    refused: {},
  };
  for (const [name, format] of ACCEPTED) {
    const bytes = readFileSync(out(name));
    const probe = ffprobe(out(name));
    const duration = probe.format?.duration;
    const streams = (probe.streams ?? []).map((stream) => ({
      type: stream.codec_type,
      codec: stream.codec_name,
      ...(stream.width !== undefined ? { width: stream.width, height: stream.height } : {}),
      ...(stream.sample_rate !== undefined ? { sampleRate: Number(stream.sample_rate) } : {}),
      ...(stream.channels !== undefined ? { channels: stream.channels } : {}),
    }));
    facts.accepted[name] = {
      format,
      bytes: bytes.byteLength,
      sha256: digest(bytes),
      durationMs:
        duration === undefined || duration === 'N/A' ? null : Math.round(Number(duration) * 1000),
      formatName: probe.format?.format_name ?? null,
      streams,
    };
  }
  for (const [name, reason] of REFUSED) {
    const bytes = readFileSync(out(name));
    facts.refused[name] = { reason, bytes: bytes.byteLength, sha256: digest(bytes) };
  }
  writeFileSync(out('facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
  console.log(
    `facts.json: ${Object.keys(facts.accepted).length} accepted, ${Object.keys(facts.refused).length} refused`,
  );
}

if (!FACTS_ONLY) {
  writeWavs();
  runFfmpeg();
  writeVariants();
}
for (const [name] of [...ACCEPTED, ...REFUSED]) {
  if (!existsSync(out(name))) throw new Error(`${name} is missing; run without --facts`);
}
writeFacts();
