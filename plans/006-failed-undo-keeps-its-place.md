# Plan 006: A failed undo or redo leaves the history as it was

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If a STOP condition occurs, stop and report. When
> done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat c6d37cfe3..HEAD -- apps/studio/src/editor/controller.tsx packages/agent/src/window/history.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (the undo path of every edit)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c6d37cfe3`, 2026-11-09

## Why this matters

`history.undo()` moves the entry to the redo stack before the inverse is committed. When the
commit is refused (validation, a reducer throw, a room rejection, a network failure on a server
first step) the catch says "Undo failed" and the entry stays on the redo stack although nothing
was undone. The next Cmd+Z skips that change and undoes an older one; Cmd+Shift+Z then applies the
skipped change's forward mutations a second time (typed text twice, or an insert that fails on a
duplicate id). `redoOnce` and `undoToOnce` have the same shape. No test names "Undo failed".

## Current state

`packages/agent/src/window/history.ts` (framework free; two stacks and a step log):

```ts
    undo() {
      const entry = undoStack.pop();
      if (entry === undefined) return undefined;
      redoStack.push(entry);
      steps.push({ kind: 'undo', entry });
      return entry;
    },
```

`redo()` mirrors it; `undoTo(id)` pops every entry down to `id` the same way.

`apps/studio/src/editor/controller.tsx`, lines 2870 to 2884:

```ts
const undoOnce = async (): Promise<void> => {
  const entry = history.undo();
  if (!entry) return;
  lastTyping = null;
  const inverse = stepMutations(entry, entry.inverse, 'inverse');
  if (inverse.length === 0) {
    say(REFUSALS.alreadyChanged(participants().others[0]?.label ?? 'someone'));
    return;
  }
  try {
    await undoStep(entry, inverse);
  } catch (error) {
    say(`Undo failed: ${errorMessage(error)}`);
  }
};
```

`redoOnce` (lines 2894 to 2911) and `undoToOnce` (lines 2915 to 2925) follow.

The "already changed" branch is deliberate: the step has nothing left to undo because someone
else changed its target, and the entry is spent. Leave it.

## Commands you will need

| Purpose           | Command                                                                               | Expected on success |
| ----------------- | ------------------------------------------------------------------------------------- | ------------------- |
| History tests     | `cd packages/agent && ../../node_modules/.bin/vitest run src/window`                  | all pass            |
| Typecheck         | `node scripts/check.mjs --only 4`                                                     | exit 0              |
| Whole unit suite  | `node scripts/check.mjs --only 5`                                                     | exit 0              |
| Format            | `node scripts/check.mjs --only 19`                                                    | exit 0              |
| Undo in a browser | `pnpm exec playwright test apps/studio/e2e/undo.spec.ts` under `.turboslide/e2e.lock` | all pass            |

## Scope

**In scope**: `packages/agent/src/window/history.ts`, its test file beside it,
`apps/studio/src/editor/controller.tsx` (`undoOnce`, `redoOnce`, `undoToOnce` only).

**Out of scope**: `stepMutations`, `undoStep`, `commitAs`, `commitServerFirst`, the typing group
(`undo-bursts.ts`), the "already changed" branch.

## Git workflow

Branch off `main`, one commit, message `Editor: a failed undo or redo leaves the history as it was`.
Do not push.

## Steps

### Step 1: Give the history a way to put a step back

Add `revert(step: 'undo' | 'redo', entry: HistoryEntry): void` to `EditHistory`: for `'undo'` it
removes `entry` from the redo stack and pushes it back on the undo stack; for `'redo'` the
reverse. It removes the matching last element of `steps`. It does nothing when the entry is not
on top of the stack it is taken from. Test: push three entries, `undo()`, `revert('undo', entry)`;
`entries()`, `canRedo()` and `log()` read as before the undo.

### Step 2: Use it in the three catches

In `undoOnce` and `redoOnce`, call `history.revert(...)` in the catch before `say(...)`. In
`undoToOnce`, on a failure revert the failed entry and every entry of `entries` after it (they
were popped and never run), newest last, so the stack order is as before for the part not undone.

### Step 3: Test the controller

With the tab backend harness (`apps/studio/src/try/tab-backend.test.ts`), make one edit, make the
backend refuse the next write, call `undo()`, and assert `canUndo` is still true and `canRedo`
false; lift the refusal, `undo()` again, and assert the edit is gone.

## Done criteria

- [ ] the history tests and the new controller test pass
- [ ] `node scripts/check.mjs --only 4,5,19` exits 0
- [ ] `apps/studio/e2e/undo.spec.ts` passes on a dev server

## STOP conditions

- A failed commit leaves the local document changed (an optimistic apply that is not rolled
  back). Then putting the entry back is wrong; report what `commitAs` does on a rejection.
- The tab backend cannot be made to refuse one write.

## Maintenance notes

This changes what Cmd+Z does after a refusal: the same step is tried again instead of an older
one. The sentence "Undo failed: ..." is unchanged. Kevin should decide whether a step that fails
twice should be dropped instead of retried.
