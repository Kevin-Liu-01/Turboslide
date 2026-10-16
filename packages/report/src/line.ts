// The line of the error reporter (hardening HR-O#2a, RELIABILITY-14; docs/hardening/HARDENING.md
// 4.8): what a browser posts to `POST /api/x/errors` and what the server logs. The browser builds
// it with `reportLine` (scrubbed, at most REPORT_LINE_MAX_BYTES once encoded); the server reads a
// body with `readReportLine`, which checks the shape and scrubs every field again, and adds the
// build it serves. The count key (`reportKey`) groups lines of one fault for the daily counts.
//
// Browser and Worker safe: no Node import.

import { MESSAGE_MAX, STACK_FRAMES_MAX, scrubMessage, scrubRoute, scrubStack } from './scrub.ts';

/**
 * What raised the line: an uncaught `error` event, an `unhandledrejection` event, or a route's
 * error boundary (the router's catch).
 */
export const REPORT_KINDS = ['error', 'rejection', 'route'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export function isReportKind(value: unknown): value is ReportKind {
  return typeof value === 'string' && (REPORT_KINDS as readonly string[]).includes(value);
}

/** One report as the browser posts it. */
export type ReportLine = {
  kind: ReportKind;
  /** the route id the router matched (`/deck/$deckId`), or the scrubbed path */
  route: string;
  /** the error's name and message, scrubbed */
  message: string;
  /** the head of the stack, scrubbed, one frame per entry */
  stack: string[];
};

/** The largest body `/api/x/errors` takes and the browser sends, in bytes of UTF-8. */
export const REPORT_LINE_MAX_BYTES = 4096;

/** The longest count key, in characters. */
export const REPORT_KEY_MAX = 80;

const encoder = new TextEncoder();

function bytesOf(text: string): number {
  return encoder.encode(text).byteLength;
}

/** The name and message of whatever was thrown, as one text before scrubbing. */
export function messageOf(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name === '' ? 'Error' : error.name;
    return error.message === '' ? name : `${name}: ${error.message}`;
  }
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return `a value of type ${error === null ? 'null' : typeof error} was thrown`;
}

function stackOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'stack' in error) {
    const stack = (error as { stack?: unknown }).stack;
    if (typeof stack === 'string') return stack;
  }
  return undefined;
}

/** The JSON of a line, with stack frames dropped from the end until it fits the byte cap. */
export function encodeReportLine(line: ReportLine): string {
  const stack = [...line.stack];
  let text = JSON.stringify({ ...line, stack });
  while (bytesOf(text) > REPORT_LINE_MAX_BYTES && stack.length > 0) {
    stack.pop();
    text = JSON.stringify({ ...line, stack });
  }
  if (bytesOf(text) > REPORT_LINE_MAX_BYTES)
    text = JSON.stringify({ ...line, message: line.message.slice(0, 200), stack: [] });
  return text;
}

/** The browser's line for one thrown value: every field scrubbed (scrub.ts). */
export function reportLine(input: { kind: ReportKind; route: string; error: unknown }): ReportLine {
  return {
    kind: input.kind,
    route: scrubRoute(input.route),
    message: scrubMessage(messageOf(input.error), MESSAGE_MAX),
    stack: scrubStack(stackOf(input.error)),
  };
}

/**
 * The server's read of a posted body: null when it is not a line (not JSON, a field missing or
 * of another type, an unknown kind); otherwise the line with every field scrubbed again, so the
 * log holds what the scrubber allows whatever the sender did.
 */
export function readReportLine(text: string): ReportLine | null {
  if (bytesOf(text) > REPORT_LINE_MAX_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const body = parsed as Record<string, unknown>;
  if (!isReportKind(body['kind'])) return null;
  if (typeof body['route'] !== 'string' || typeof body['message'] !== 'string') return null;
  const stack = body['stack'] ?? [];
  if (!Array.isArray(stack) || !stack.every((frame) => typeof frame === 'string')) return null;
  return {
    kind: body['kind'],
    route: scrubRoute(body['route']),
    message: scrubMessage(body['message'], MESSAGE_MAX),
    stack: scrubStack((stack as string[]).slice(0, STACK_FRAMES_MAX).join('\n')),
  };
}

/**
 * The count key of a line (HR-O#2c's daily counts per kind, route and key): the scrubbed message
 * up to REPORT_KEY_MAX characters, so one fault counts under one key on every page it happens.
 */
export function reportKey(line: Pick<ReportLine, 'message'>): string {
  const key = line.message.replace(/\s+/g, ' ').trim();
  return (key === '' ? '(empty)' : key).slice(0, REPORT_KEY_MAX);
}
