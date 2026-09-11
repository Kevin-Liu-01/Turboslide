// The stdio transport (SPEC 7.3: `turboslide mcp`, for Claude Code and IDEs). JSON-RPC frames
// travel on stdout, so nothing else may write there while the server runs: the CLI routes its
// human output to stderr and redirectConsoleToStderr() catches a stray console.log from a library.
// serveStdio resolves when the client closes the connection or stdin ends.
import type { Readable, Writable } from 'node:stream';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export type StdioOptions = {
  stdin?: Readable;
  stdout?: Writable;
  /** Called once the transport is connected and the server answers initialize. */
  onReady?: () => void;
};

/** Points console.log, console.info and console.debug at stderr so they cannot corrupt the frame stream. */
export function redirectConsoleToStderr(): void {
  const toStderr = (...args: unknown[]): void => {
    console.error(...args);
  };
  console.log = toStderr;
  console.info = toStderr;
  console.debug = toStderr;
}

/** Connects the server to stdio and waits until the connection closes. */
export async function serveStdio(server: Server, options: StdioOptions = {}): Promise<void> {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const transport = new StdioServerTransport(stdin, stdout);
  const closed = new Promise<void>((resolve) => {
    server.onclose = () => resolve();
  });
  await server.connect(transport);
  // The SDK transport listens for data and errors on stdin but not for its end, so a client that
  // exits without closing the connection would leave the process waiting.
  stdin.once('end', () => {
    void server.close();
  });
  options.onReady?.();
  await closed;
}
