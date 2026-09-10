// Canonical JSON (SPEC 4.1): two-space indent, keys in schema order, arrays one element per line,
// trailing newline, so git diff reads at the line level and two writers produce identical bytes
// for identical documents. Zod's object parser emits keys in shape order, so a normalized document
// serialized here is already in schema order; undefined values are dropped as JSON requires.

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Parses JSON and reports the file in the error, for the CLI's exit code 2 path. */
export function parseJson(text: string, file?: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new TypeError(
      file === undefined ? `Invalid JSON: ${reason}` : `Invalid JSON in ${file}: ${reason}`,
    );
  }
}
