# Plan 001: The editor controller removes its document listeners when it stops

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If a STOP condition occurs, stop and report. When
> done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat c6d37cfe3..HEAD -- apps/studio/src/editor/controller.tsx`
> If the file changed, compare the excerpts under "Current state" with the live code before going on.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c6d37cfe3`, 2026-11-09

## Why this matters

`createEditorController` adds four capture listeners to `document` when it is created and never
removes them. Every controller ever made therefore stays reachable from `document` with its
document, its undo history and its room objects, and every later key press and pointer event runs
through every dead controller. The editor makes one controller per mount, and the landing's `/try`
frame makes one per guest visit (`apps/studio/src/try/session.ts` `controllerFor`), so the frame
that plays on `/home` grows without limit while guests come and go. A dead headless controller's
typing clock is also fed by the visitor's own key presses.

## Current state

- `apps/studio/src/editor/controller.tsx` holds `createEditorController`. Lines 2632 to 2637:

```ts
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', onPointerHeld, true);
  document.addEventListener('pointerup', onPointerFree, true);
  document.addEventListener('pointercancel', onPointerFree, true);
  document.addEventListener('keydown', onKeyStroke, true);
}
```

- The same file, lines 4790 to 4812, the only lifecycle the controller has:

```ts
    start() {
      if (alive) return;
      alive = true;
      setDocument(snapshot.document, 'all');
      ...
    },
    stop() {
      alive = false;
      shaderFrames.dispose();
      const client = room;
      room = null;
      if (client !== null) void client.stop();
    },
```

- `grep -n removeEventListener apps/studio/src/editor/controller.tsx` prints nothing.
- Callers: `apps/studio/src/editor/EditorRoot.tsx` creates the controller in `useState`, calls
  `controller.start()` in its mount effect and `controller.stop()` in the cleanup (React's Strict
  Mode runs start, stop, start). `apps/studio/src/try/session.ts` calls `controller.start()` on a
  guest's join and `controller.stop()` in its `leave`.
- Convention: comments are plain technical English in `/* */` or `//`, sentence case, no em dashes.
  Types, not interfaces. Single quotes, two space indent, 100 columns.
- The studio's unit tests run in the `node` environment (`apps/studio/vitest.config.ts`), so
  `document` is undefined there unless a test stubs it. `apps/studio/src/try/tab-backend.test.ts`
  builds controllers over the tab backend with no server; use it as the pattern.

## Commands you will need

| Purpose          | Command                                                                                   | Expected on success |
| ---------------- | ----------------------------------------------------------------------------------------- | ------------------- |
| One test file    | `cd apps/studio && ../../node_modules/.bin/vitest run src/editor/controller-stop.test.ts` | all pass            |
| Typecheck        | `node scripts/check.mjs --only 4`                                                         | exit 0              |
| Whole unit suite | `node scripts/check.mjs --only 5`                                                         | exit 0              |
| Format           | `node scripts/check.mjs --only 19`                                                        | exit 0              |

Never run `pnpm install` (AGENTS.md "Installs and dependencies").

## Scope

**In scope**:

- `apps/studio/src/editor/controller.tsx`
- `apps/studio/src/editor/controller-stop.test.ts` (create)

**Out of scope**:

- The four timers (`versionsTimer`, `commentsTimer`, `inboxTimer`, `externalTimer`). Each is one
  shot and bounded (500 ms, 60 ms, 60 ms and the banner's hold), so none leaks; clearing the
  banner's timer on a stop would leave a banner up after a restart.
- `apps/studio/src/try/session.ts`: once `stop()` removes the listeners, a guest's `leave` is
  complete as written.
- `apps/studio/src/editor/EditorRoot.tsx`.

## Git workflow

- Branch `claude/shadcn-improve`. One commit. Message style from `git log`:
  `Editor: the controller removes its document listeners when it stops`.
- Do not push.

## Steps

### Step 1: Add the listeners in `start()` and remove them in `stop()`

Replace the `if (typeof document !== 'undefined') { ... }` block at line 2632 with two functions
declared in the same place:

```ts
/* the four listeners live from start() to stop(): added at creation they were never removed,
     so every controller a page ever made stayed reachable from the document */
const listen = (): void => {
  if (typeof document === 'undefined') return;
  document.addEventListener('pointerdown', onPointerHeld, true);
  document.addEventListener('pointerup', onPointerFree, true);
  document.addEventListener('pointercancel', onPointerFree, true);
  document.addEventListener('keydown', onKeyStroke, true);
};
const unlisten = (): void => {
  if (typeof document === 'undefined') return;
  document.removeEventListener('pointerdown', onPointerHeld, true);
  document.removeEventListener('pointerup', onPointerFree, true);
  document.removeEventListener('pointercancel', onPointerFree, true);
  document.removeEventListener('keydown', onKeyStroke, true);
};
```

In `start()`, call `listen();` right after `alive = true;`. In `stop()`, call `unlisten();` right
after `alive = false;` and also set `pointerHeld = false;` so a press that was down at the stop
does not hold the name prompt after a restart.

**Verify**: `grep -c "removeEventListener" apps/studio/src/editor/controller.tsx` prints `4`.

### Step 2: Pin it with a unit test

Create `apps/studio/src/editor/controller-stop.test.ts`. Build one controller as
`tab-backend.test.ts` does (`createTabBackend`, `heroDocument`, `payloadFor`), with `fetch`
stubbed to throw and `document` stubbed (`vi.stubGlobal`) by an object that records
`addEventListener` and `removeEventListener` calls in a `Map<string, Set<listener>>`. Assert:

1. after `createEditorController(...)` and before `start()`: no listener is held;
2. after `start()`: `pointerdown`, `pointerup`, `pointercancel` and `keydown` each hold one;
3. after `stop()`: none is held;
4. after `start()`, `stop()`, `start()` (Strict Mode's order): each holds exactly one, and after a
   last `stop()` none.

**Verify**: the one test file command passes.

## Done criteria

- [ ] `grep -c "removeEventListener" apps/studio/src/editor/controller.tsx` prints `4`
- [ ] the new test file passes
- [ ] `node scripts/check.mjs --only 4,5,19` exits 0
- [ ] `git status --short` lists only the two in scope files

## STOP conditions

- The excerpts under "Current state" do not match the file.
- Any handler other than the four named reads `pointerHeld` or `keyClock` before `start()` runs.
- `tab-backend.test.ts` no longer builds a controller without a server.

## Maintenance notes

- A new document or window listener in the controller belongs in `listen` and `unlisten`.
- A reviewer should check Strict Mode by hand once: open `/new` on a dev server, type a title, and
  confirm the name prompt and undo by typing group still work.
