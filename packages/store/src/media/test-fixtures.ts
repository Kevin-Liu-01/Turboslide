// Test support for the media parsers: reads `fixtures/media/<name>` and `facts.json` (the ffprobe
// oracle `fixtures/media/generate.mjs` wrote once, committed) so every `*.test.ts` beside this
// file compares the parsers against the same numbers. Not part of the runtime graph.
import { readFileSync } from 'node:fs';

export type FixtureStream = {
  type: 'audio' | 'video';
  codec: string;
  width?: number;
  height?: number;
  sampleRate?: number;
  channels?: number;
};

export type AcceptedFixture = {
  format: 'mp4' | 'm4a' | 'webm' | 'mp3' | 'wav';
  bytes: number;
  sha256: string;
  durationMs: number | null;
  formatName: string | null;
  streams: FixtureStream[];
};

export type RefusedFixture = { reason: string; bytes: number; sha256: string };

export type Facts = {
  generatedAt: string;
  ffprobe: string;
  accepted: Record<string, AcceptedFixture>;
  refused: Record<string, RefusedFixture>;
};

const ROOT = new URL('../../../../fixtures/media/', import.meta.url);

export const FIXTURES: Facts = JSON.parse(
  readFileSync(new URL('facts.json', ROOT), 'utf8'),
) as Facts;

export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(name, ROOT)));
}

/** The oracle's duration for an accepted fixture; throws for a name outside the table. */
export function oracle(name: string): AcceptedFixture {
  const row = FIXTURES.accepted[name];
  if (row === undefined) throw new Error(`${name} is not an accepted fixture of facts.json`);
  return row;
}

/** The tolerance of MILESTONES-5 B2 day 1: a parsed duration within 20 ms of ffprobe's. */
export const DURATION_TOLERANCE_MS = 20;
