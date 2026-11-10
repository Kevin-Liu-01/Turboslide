# Plan 004: The docs search keeps focus inside its window and returns it to its opener

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If a STOP condition occurs, stop and report. When
> done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat c6d37cfe3..HEAD -- apps/studio/src/components/docs/DocsShell.tsx apps/studio/src/components/docs/SearchWindow.tsx`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c6d37cfe3`, 2026-11-09

## Why this matters

Two keyboard defects on `/docs`. First, pressing Cmd+K (or `/` on a result link) while the search
is open records the search field as the "opener"; closing then focuses a field that is removed in
the same update, so focus falls to `<body>` and a keyboard user loses their place. Second, the
window says `aria-modal="true"` but Tab walks out of it into the page under the scrim.

## Current state

`apps/studio/src/components/docs/DocsShell.tsx`, lines 62 to 70:

```ts
const openSearch = (): void => {
  opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (contents.current !== null) contents.current.open = false;
  setSearching(true);
};
const closeSearch = (): void => {
  setSearching(false);
  opener.current?.focus();
};
```

The mount effect's `keys` listener on `window` calls `openSearch()` for Cmd or Ctrl+K anywhere and
for `/` when the target is not a field.

`apps/studio/src/components/docs/SearchWindow.tsx`: the card is
`<div className="ts-docs-search-window pt-window" role="dialog" aria-modal="true" data-control="docs.search.window" onKeyDown=...>`;
its `onKeyDown` handles Escape, ArrowDown, ArrowUp and Enter. The focusable elements inside are
the field (`data-control="docs.search.field"`) and the result links
(`a.ts-docs-search-hit`). The window is raised with `useLayer(scrim, { layer: 'dialog' })`, which
does not make the page inert.

The chrome's `Dialog.tsx` has a trap (`focusableIn`), but importing it would pull the dialog
module and its stylesheet into the docs search chunk; the trap here is six lines.

## Commands you will need

| Purpose          | Command                            | Expected on success |
| ---------------- | ---------------------------------- | ------------------- |
| Typecheck        | `node scripts/check.mjs --only 4`  | exit 0              |
| Whole unit suite | `node scripts/check.mjs --only 5`  | exit 0              |
| Format           | `node scripts/check.mjs --only 19` | exit 0              |

The studio's unit tests are `src/**/*.test.ts` in the `node` environment, so these two components
have no unit test; the check is in a browser (step 3).

## Scope

**In scope**: `apps/studio/src/components/docs/DocsShell.tsx` (`openSearch` only),
`apps/studio/src/components/docs/SearchWindow.tsx` (the window's `onKeyDown` only).

**Out of scope**: `docs.css`, the search index, `packages/chrome/src/Dialog.tsx`.

## Git workflow

Branch `claude/shadcn-improve`, one commit, message
`Docs: the search keeps the focus inside its window and returns it to its opener`. Do not push.

## Steps

### Step 1: Keep the first opener

In `openSearch`, record the opener only when the active element is outside the search window:

```ts
const active = document.activeElement;
/* a second Cmd+K or "/" from inside the open window keeps the first opener: the field it
       would record leaves the page with the window */
if (!(active instanceof HTMLElement)) opener.current = null;
else if (active.closest('[data-control="docs.search.window"]') === null) opener.current = active;
```

### Step 2: Hold Tab inside the window

In the window's `onKeyDown`, before the other keys, handle `Tab`: list the field and the result
links inside `event.currentTarget` (`input, a[href]`), and when focus is on the last and Shift is
up, or on the first and Shift is down, prevent the default and focus the other end. Leave every
other Tab to the browser.

### Step 3: Check in a browser

On a dev server at `/docs`: press Cmd+K, type `export`, press Cmd+K again, press Escape: the
search button in the bar holds the focus (`document.activeElement` is not `body`). Open again,
type `export`, press Tab past the last result: focus returns to the field.

## Done criteria

- [ ] `node scripts/check.mjs --only 4,5,19` exits 0
- [ ] both browser checks of step 3 hold
- [ ] `git status --short` lists only the two in scope files

## STOP conditions

- The search window is rendered through the chrome's `Dialog` by the time this runs (then the
  trap exists; do step 1 only).

## Maintenance notes

If the search window gains another focusable control, the selector in step 2 must name it.
