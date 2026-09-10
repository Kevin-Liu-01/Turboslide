// Output channels of SPEC 7.2: with --json the machine result goes to stdout and every human
// line to stderr; without it human lines go to stdout. One JSON document per run.

export type Output = {
  json: boolean;
  /** A human line: stdout, or stderr when --json is on. */
  human: (line: string) => void;
  /** Always stderr. */
  warn: (line: string) => void;
  /** The one machine result on stdout; a no-op without --json. */
  result: (value: unknown) => void;
};

export type Streams = { stdout: (text: string) => void; stderr: (text: string) => void };

export function createOutput(json: boolean, streams: Streams): Output {
  return {
    json,
    human: (line) => (json ? streams.stderr(`${line}\n`) : streams.stdout(`${line}\n`)),
    warn: (line) => streams.stderr(`${line}\n`),
    result: (value) => {
      if (json) streams.stdout(`${JSON.stringify(value, null, 2)}\n`);
    },
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}
