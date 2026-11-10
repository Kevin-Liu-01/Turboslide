# Plan 002: A cancelled press on an object's body is disarmed

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If a STOP condition occurs, stop and report. When
> done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat c6d37cfe3..HEAD -- packages/viewer/src/Editor.tsx`
> If the file changed, compare the excerpt under "Current state" with the live code before going on.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c6d37cfe3`, 2026-11-09

## Why this matters

A press on an object's body arms a drag that starts once the pointer moves 4 px. The arm ends only
on `pointermove` past the threshold or on `pointerup`. When the browser cancels the pointer (a
touch that became a scroll) or the window loses focus before the release (Cmd+Tab with the button
down), no `pointerup` arrives and the press stays armed. The next pointer movement anywhere, with
no button down, starts a drag of the old object, which then follows the pointer and is committed
on the next click. Every other gesture in the file already ends on cancel and blur.

## Current state

`packages/viewer/src/Editor.tsx`, `armPress`, lines 6535 to 6559:

```ts
  const armPress = (next: Press) => {
    press.current = next;
    const move = (ev: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      if (Math.hypot(ev.clientX - p.clientX, ev.clientY - p.clientY) < DRAG_START_PX) return;
      press.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      ...
      if (chip) beginGesture(chip, p.clientX, p.clientY, { duplicate: p.alt });
    };
    const up = (ev: PointerEvent) => {
      const p = press.current;
      press.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      p?.tap?.({ x: ev.clientX, y: ev.clientY, target: ev.target });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
```

The exemplar in the same file is `armMarquee` (about line 6605): its `up` removes `pointermove`,
`pointerup` and `pointercancel`, and it registers all three. `beginGesture` (about line 3625) also
ends on `blur`: "the window losing focus mid drag (Cmd Tab, a system dialog): no release will come".

The test pattern is `packages/viewer/src/__tests__/editor-second-click.test.ts`: it mounts
`Editor` under jsdom on a canvas slide with one text box and dispatches `pointerdown`, the
`mousedown` with the click count and the `pointerup` on the window as the browser sends them. Its
last case already asserts that a press that moves past the threshold opens nothing.

## Commands you will need

| Purpose          | Command                                                                                              | Expected on success |
| ---------------- | ---------------------------------------------------------------------------------------------------- | ------------------- |
| One test file    | `cd packages/viewer && ../../node_modules/.bin/vitest run src/__tests__/editor-second-click.test.ts` | all pass            |
| Typecheck        | `node scripts/check.mjs --only 4`                                                                    | exit 0              |
| Whole unit suite | `node scripts/check.mjs --only 5`                                                                    | exit 0              |
| Format           | `node scripts/check.mjs --only 19`                                                                   | exit 0              |

## Scope

**In scope**: `packages/viewer/src/Editor.tsx` (the `armPress` function only),
`packages/viewer/src/__tests__/editor-second-click.test.ts` (one added case).

**Out of scope**: `beginGesture`, `armMarquee`, `armPan`, `gesture-life.ts`, and
`packages/viewer/src/Frame.tsx` (another session is editing it).

## Git workflow

Branch `claude/shadcn-improve`, one commit, message
`Editor: a cancelled press on an object's body is disarmed`. Do not push.

## Steps

### Step 1: End the arm on cancel and on blur

In `armPress`, add one `disarm` function that clears `press.current` and removes all four
listeners, and call it from `move` (before `beginGesture`), from `up` (before the tap) and from two
new handlers, `pointercancel` and `blur`, which run no tap:

```ts
const disarm = () => {
  press.current = null;
  window.removeEventListener('pointermove', move);
  window.removeEventListener('pointerup', up);
  window.removeEventListener('pointercancel', disarm);
  window.removeEventListener('blur', disarm);
};
```

Keep the order inside `up`: read `p`, disarm, then run `p?.tap?.(...)`, so a session the tap opens
never finds a drag armed under it (the function's own comment).

**Verify**: `grep -n "pointercancel', disarm" packages/viewer/src/Editor.tsx` prints two lines.

### Step 2: Add the test case

In `editor-second-click.test.ts`, add a case: select the box with one click, press on it again
(`pointerdown` and `mousedown` with detail 1), dispatch `pointercancel` on the window, then a
`pointermove` on the window 40 px away and a `pointerup`. Assert that no write was dispatched and
no text session opened (the assertions the file's "moves past the threshold" case uses). Add the
same with a window `blur` in place of the cancel.

**Verify**: the one test file command passes, with the new cases listed.

## Done criteria

- [ ] the test file passes with the two new cases
- [ ] `node scripts/check.mjs --only 4,5,19` exits 0
- [ ] `git status --short` lists only the two in scope files

## STOP conditions

- `armPress` no longer matches the excerpt.
- The new case passes before step 1 is applied (then it does not test the bug; rewrite it).

## Maintenance notes

A touch drag of an object still needs `touch-action` on the body to start at all; that is a
separate decision and not part of this plan.
