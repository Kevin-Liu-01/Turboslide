// SIGTERM on the node-server build (PERF-18, hardening HR-O#8). srvx closes the listener on
// SIGTERM and SIGINT and then calls Nitro's `close` hooks, but nothing ended the process: the
// memory channel's checkpointers and the derived sweep kept the event loop alive, so a process
// manager waited out its whole kill timeout, and the entries the memory channel held were lost
// with the process. The plugin (plugins/shutdown.ts) wires this module: at the signal a deadline
// is armed; when the listener has closed (the `close` hook), or after CLOSE_WAIT_MS when no
// `close` hook comes (srvx installs no signal handler under CI or TEST), every room's tail is
// committed, the sweep in flight settles, and the process exits 0, or 1 when the flush failed or
// the deadline passed. Pure over its dependencies, so a unit test drives it with fakes.

/** The whole shutdown, from the signal to the exit: the pin is an exit within 10 s. */
export const SHUTDOWN_DEADLINE_MS = 9_500;
/** How long the signal waits for srvx to close the listener before flushing anyway. */
export const CLOSE_WAIT_MS = 6_000;

export type ShutdownDeps = {
  /** Commits what this process holds; it runs once. */
  flush: () => Promise<void>;
  exit: (code: number) => void;
  log: (line: string) => void;
  setTimer?: (run: () => void, ms: number) => unknown;
  deadlineMs?: number;
  closeWaitMs?: number;
};

export type Shutdown = {
  /** A signal arrived: arm the deadline and the wait for the listener. */
  signal: (name: string) => void;
  /** The listener closed (Nitro's `close` hook): flush and exit. */
  closed: () => Promise<void>;
};

export function createShutdown(deps: ShutdownDeps): Shutdown {
  const setTimer = deps.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms));
  let signalled = false;
  let finishing: Promise<void> | null = null;
  let exited = false;
  const exit = (code: number): void => {
    if (exited) return;
    exited = true;
    deps.exit(code);
  };
  const finish = (): Promise<void> => {
    finishing ??= deps.flush().then(
      () => exit(0),
      (error: unknown) => {
        deps.log(
          `shutdown: the flush failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        exit(1);
      },
    );
    return finishing;
  };
  return {
    signal(name) {
      if (signalled) return;
      signalled = true;
      deps.log(`shutdown: ${name}; committing the open rooms and exiting`);
      const deadline = deps.deadlineMs ?? SHUTDOWN_DEADLINE_MS;
      setTimer(() => {
        if (exited) return;
        deps.log(`shutdown: not finished within ${deadline} ms; exiting`);
        exit(1);
      }, deadline);
      setTimer(() => void finish(), deps.closeWaitMs ?? CLOSE_WAIT_MS);
    },
    closed: finish,
  };
}
