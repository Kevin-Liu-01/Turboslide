// Exit codes of SPEC 7.2: 0; 1 for findings at the gate or a verify failure; 2 for a usage or
// validation error. Errors of these two classes carry their code so main.ts maps them once.

export const EXIT = { ok: 0, findings: 1, usage: 2 } as const;
export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/** Bad arguments, a missing file, an invalid document: exit 2. */
export class UsageError extends Error {
  readonly exitCode: ExitCode = EXIT.usage;
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** A gate the run did not pass (findings, page errors, a budget): exit 1. */
export class GateError extends Error {
  readonly exitCode: ExitCode = EXIT.findings;
  constructor(message: string) {
    super(message);
    this.name = 'GateError';
  }
}

/** A capability another package has not delivered yet; reported as a usage error with the gap named. */
export class NotWiredError extends UsageError {
  constructor(what: string, expected: string) {
    super(`${what} is not wired yet: ${expected}`);
    this.name = 'NotWiredError';
  }
}
