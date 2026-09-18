// The export path's mode (server/download.ts `exportCapabilities`): a hosted studio exports
// through the synchronous server function, because a job queued by one function invocation is
// not visible to the next, and a checkout exports through the queued job the page polls. The
// capabilities are asked for after the editor mounts and answer over the network; the controller
// used to read a default of `false` until they did, so a download started in that window on a
// hosted deployment took the polled path and its poll could land on an instance that never held
// the job ("No export job", VERIFICATION C3S-F7: export.pptx.perfect passed and failed on one warm
// preview with no code change). export.run now waits for the answer, bounded, before it chooses.
// Pure, so the wait is unit tested (export-mode.test.ts); the controller passes the real sleep.

/** How long export.run waits for the capabilities before it takes the checkout's polled path. */
export const EXPORT_MODE_WAIT_MS = 5000;

export type ExportMode = {
  /** the synchronous server function (a hosted studio) rather than the queued job the page polls */
  sync: boolean;
  /** the batch size of the batched protocol (SPEC-2 8.1); 0 when unknown or not batched */
  batchSize: number;
};

export type ExportModeGate = {
  /** the capabilities answer (EditorRoot: `controller.setExportSync(caps.sync, caps.batchSize)`) */
  set: (sync: boolean, batchSize?: number) => void;
  /** the mode once known, or the default (the polled path) after the wait */
  read: (options?: {
    waitMs?: number;
    sleep?: (ms: number) => Promise<void>;
  }) => Promise<ExportMode>;
  /** whether the capabilities have answered */
  known: () => boolean;
};

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createExportModeGate(): ExportModeGate {
  let mode: ExportMode = { sync: false, batchSize: 0 };
  let known = false;
  let settle: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return {
    set(sync, batchSize) {
      mode = { sync, batchSize: batchSize ?? 0 };
      known = true;
      settle();
    },
    async read(options = {}) {
      if (known) return mode;
      const sleep = options.sleep ?? realSleep;
      await Promise.race([answered, sleep(options.waitMs ?? EXPORT_MODE_WAIT_MS)]);
      return mode;
    },
    known: () => known,
  };
}
