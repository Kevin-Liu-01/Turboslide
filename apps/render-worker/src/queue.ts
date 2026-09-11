// The job queue (MILESTONES M2 item 6): render, sheet, export and verify jobs run one at a time,
// in submission order, because the machine is shared and one browser page at a time is the rule
// (AGENTS.md, dev server rules). A job has a directory under <workerDir>/jobs/<id> for its files, a
// bounded log, and a record the HTTP surface serves; finished records are kept in memory up to
// `keep` and on disk as job.json.
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const JOB_KINDS = ['render', 'sheet', 'export', 'verify'] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export type JobRecord = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  input: unknown;
  dir: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  ms?: number;
  result?: unknown;
  error?: { message: string };
  log: string[];
};

export type JobContext = {
  id: string;
  /** The job's own directory, created before the runner starts. */
  dir: string;
  log: (line: string) => void;
  signal: AbortSignal;
};

export type JobRunner<I, O> = (input: I, ctx: JobContext) => Promise<O>;

export type QueueStats = {
  queued: number;
  running: number;
  done: number;
  failed: number;
  total: number;
};

export type Queue = {
  dir: string;
  submit: <I, O>(kind: JobKind, input: I, run: JobRunner<I, O>) => JobRecord;
  get: (id: string) => JobRecord | undefined;
  list: (kind?: JobKind) => JobRecord[];
  /** Resolves when the job is done or failed; rejects on timeout. */
  wait: (id: string, timeoutMs?: number) => Promise<JobRecord>;
  stats: () => QueueStats;
  /** Aborts the running job's signal and stops taking work. */
  close: () => void;
};

export type QueueOptions = {
  dir: string;
  /** Finished records kept in memory (default 200). */
  keep?: number;
  /** Log lines kept per job (default 500). */
  logLines?: number;
  log?: (line: string) => void;
};

export function isJobKind(value: string): value is JobKind {
  return (JOB_KINDS as ReadonlyArray<string>).includes(value);
}

export function newJobId(): string {
  return `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
}

type Entry = { record: JobRecord; run: JobRunner<unknown, unknown>; controller: AbortController };

export function createQueue(options: QueueOptions): Queue {
  const records = new Map<string, JobRecord>();
  const pending: Entry[] = [];
  const waiters = new Map<string, ((record: JobRecord) => void)[]>();
  const keep = options.keep ?? 200;
  const logLines = options.logLines ?? 500;
  let running: Entry | null = null;
  let closed = false;

  const notify = (record: JobRecord): void => {
    for (const resolve of waiters.get(record.id) ?? []) resolve(record);
    waiters.delete(record.id);
  };

  const prune = (): void => {
    const finished = [...records.values()].filter(
      (r) => r.status === 'done' || r.status === 'failed',
    );
    if (finished.length <= keep) return;
    finished
      .sort((a, b) => (a.finishedAt ?? '').localeCompare(b.finishedAt ?? ''))
      .slice(0, finished.length - keep)
      .forEach((r) => records.delete(r.id));
  };

  const persist = async (record: JobRecord): Promise<void> => {
    try {
      await mkdir(record.dir, { recursive: true });
      await writeFile(join(record.dir, 'job.json'), `${JSON.stringify(record, null, 2)}\n`);
    } catch {
      // the directory may be gone (a cleaned work dir); the in-memory record stands
    }
  };

  const pump = (): void => {
    if (running || closed) return;
    const next = pending.shift();
    if (!next) return;
    running = next;
    const { record } = next;
    record.status = 'running';
    record.startedAt = new Date().toISOString();
    const t = performance.now();
    const ctx: JobContext = {
      id: record.id,
      dir: record.dir,
      signal: next.controller.signal,
      log: (line) => {
        if (record.log.length >= logLines) record.log.shift();
        record.log.push(line);
        options.log?.(`[${record.id} ${record.kind}] ${line}`);
      },
    };
    void (async () => {
      try {
        await mkdir(record.dir, { recursive: true });
        record.result = await next.run(record.input, ctx);
        record.status = 'done';
      } catch (error) {
        record.status = 'failed';
        record.error = { message: error instanceof Error ? error.message : String(error) };
        ctx.log(`failed: ${record.error.message}`);
      } finally {
        record.finishedAt = new Date().toISOString();
        record.ms = Math.round(performance.now() - t);
        running = null;
        await persist(record);
        notify(record);
        prune();
        pump();
      }
    })();
  };

  return {
    dir: options.dir,
    submit(kind, input, run) {
      if (closed) throw new Error('queue closed');
      const id = newJobId();
      const record: JobRecord = {
        id,
        kind,
        status: 'queued',
        input,
        dir: join(options.dir, 'jobs', id),
        createdAt: new Date().toISOString(),
        log: [],
      };
      records.set(id, record);
      pending.push({
        record,
        run: run as JobRunner<unknown, unknown>,
        controller: new AbortController(),
      });
      queueMicrotask(pump);
      return record;
    },
    get(id) {
      return records.get(id);
    },
    list(kind) {
      return [...records.values()]
        .filter((r) => kind === undefined || r.kind === kind)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    wait(id, timeoutMs = 600_000) {
      const record = records.get(id);
      if (!record) return Promise.reject(new RangeError(`no job ${id}`));
      if (record.status === 'done' || record.status === 'failed') return Promise.resolve(record);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`job ${id} did not finish within ${timeoutMs} ms`)),
          timeoutMs,
        );
        const list = waiters.get(id) ?? [];
        list.push((r) => {
          clearTimeout(timer);
          resolve(r);
        });
        waiters.set(id, list);
      });
    },
    stats() {
      const all = [...records.values()];
      return {
        queued: all.filter((r) => r.status === 'queued').length,
        running: all.filter((r) => r.status === 'running').length,
        done: all.filter((r) => r.status === 'done').length,
        failed: all.filter((r) => r.status === 'failed').length,
        total: all.length,
      };
    },
    close() {
      closed = true;
      running?.controller.abort();
      for (const entry of pending.splice(0)) {
        entry.record.status = 'failed';
        entry.record.error = { message: 'queue closed' };
        entry.record.finishedAt = new Date().toISOString();
        notify(entry.record);
      }
    },
  };
}
