# Plan 005: Esc closes the print preview, as its tooltip says

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If a STOP condition occurs, stop and report. When
> done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat c6d37cfe3..HEAD -- 'apps/studio/src/routes/print.$deckId.tsx'`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c6d37cfe3`, 2026-11-09

## Why this matters

On `/print/<deck>` the Close Preview link's tooltip names `Esc` as its key, and no code handles
the key, so the page promises a shortcut it does not have.

## Current state

`apps/studio/src/routes/print.$deckId.tsx`, in `PrintPage`:

```tsx
        <Link
          to="/edit/$deckId"
          params={{ deckId }}
          viewTransition={false}
          className="pt-ib is-text"
          data-control="print.close"
          {...tipProps({ name: 'Close Preview', doc: 'Back to the editor.', key: 'Esc' })}
        >
```

`grep -n "Escape\|keydown\|onKey" 'apps/studio/src/routes/print.$deckId.tsx'` prints nothing but
that tooltip. The page holds one `Select` (the layout dropdown), which closes on Escape itself.
The file already imports `useRouter` and `useMountEffect`. The comment above the link says why
the return runs no view transition; the key must navigate the same way.

## Commands you will need

| Purpose          | Command                            | Expected on success |
| ---------------- | ---------------------------------- | ------------------- |
| Typecheck        | `node scripts/check.mjs --only 4`  | exit 0              |
| Whole unit suite | `node scripts/check.mjs --only 5`  | exit 0              |
| Format           | `node scripts/check.mjs --only 19` | exit 0              |

## Scope

**In scope**: `apps/studio/src/routes/print.$deckId.tsx`.

**Out of scope**: `print.css`, the PDF download loop in the same file, `Select.tsx`.

## Git workflow

Branch `claude/shadcn-improve`, one commit, message
`Print: Esc closes the preview, as its tooltip says`. Do not push.

## Steps

### Step 1: Handle the key

In `PrintPage`, add a mount effect that listens for `keydown` on `document` and, for `Escape`
with no modifier, when `event.defaultPrevented` is false and no dropdown is open
(`document.querySelector('[role="listbox"]') === null`), navigates with
`router.navigate({ to: '/edit/$deckId', params: { deckId }, viewTransition: false })`. Remove the
listener in the cleanup.

**Verify**: `grep -n "Escape" 'apps/studio/src/routes/print.$deckId.tsx'` prints the handler.

### Step 2: Check in a browser

On a dev server: open a deck, File > Print preview, press Esc: the editor shows. Open the
preview again, open the layout dropdown, press Esc: the dropdown closes and the preview stays.

## Done criteria

- [ ] `node scripts/check.mjs --only 4,5,19` exits 0
- [ ] both browser checks hold

## STOP conditions

- `Select` renders its list without `role="listbox"` (then find how it marks an open list and use
  that; if it cannot be told, report).

## Maintenance notes

The PDF poll in this file has no deadline; it is listed in `plans/README.md` as considered and
left.
