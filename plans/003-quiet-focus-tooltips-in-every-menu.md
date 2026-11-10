# Plan 003: No tooltip on keyboard focus inside any menu, and the outline row menu keeps its focus

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If a STOP condition occurs, stop and report. When
> done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat c6d37cfe3..HEAD -- packages/chrome/src/tip.ts packages/chrome/src/Sidebar.tsx`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c6d37cfe3`, 2026-11-09

## Why this matters

The rule (docs/archive/rounds/PRODUCT.md 3.1.1, quoted in `Tooltip.tsx`) is that a tooltip never
shows on keyboard focus inside a menu, because the focused row's plate covers the rows under it.
The selector that implements the rule names two menu classes and the dialog roles, so the menus
built without those classes still draw a plate on every arrow key: the Insert menu, the
collaborators and account menus (`PlateMenu`) and the outline sidebar's row menu.

The outline sidebar's row menu has a second defect: the effect that focuses its first row runs
again whenever the sidebar re-renders, so focus jumps back to the first row while a person is
arrowing through the menu, and Escape closes the menu without returning focus to the More button.

## Current state

`packages/chrome/src/tip.ts`, lines 43 to 50:

```ts
/** Inside these surfaces a tooltip shows on hover alone, never on keyboard focus (3.1.1). */
export const QUIET_FOCUS_SURFACES =
  '.ts-menu, .ts-context-menu, [role="dialog"], [role="alertdialog"]';
```

`role="menu"` surfaces without those classes: `packages/chrome/src/InsertMenu.tsx:266`,
`packages/chrome/src/presence/PlateMenu.tsx:144`, `packages/chrome/src/Sidebar.tsx:491`,
`packages/chrome/src/inspector/chart.tsx:643`.

`packages/chrome/src/Sidebar.tsx`, `RowMenu`, lines 369 to 388: one effect with the dependency
`[onClose]` adds the outside press and Escape listeners and then runs
`box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();`. Line 1108 passes
`onClose={() => setMenu(null)}`, a new function on every render of `Sidebar`, so the effect, and
the focus call, runs on every render. The Escape branch calls `onClose()` and nothing else.

Test patterns: `packages/chrome/src/__tests__/tooltip.test.tsx` (its `tabTo` helper sends the key
and then the focus) and `packages/chrome/src/__tests__/sidebar-outline-rows.test.tsx`.

## Commands you will need

| Purpose          | Command                                                                                                                               | Expected on success |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Two test files   | `cd packages/chrome && ../../node_modules/.bin/vitest run src/__tests__/tooltip.test.tsx src/__tests__/sidebar-outline-rows.test.tsx` | all pass            |
| Typecheck        | `node scripts/check.mjs --only 4`                                                                                                     | exit 0              |
| Whole unit suite | `node scripts/check.mjs --only 5`                                                                                                     | exit 0              |
| Format           | `node scripts/check.mjs --only 19`                                                                                                    | exit 0              |

## Scope

**In scope**: `packages/chrome/src/tip.ts` (the one constant), `packages/chrome/src/Sidebar.tsx`
(`RowMenu` only), `packages/chrome/src/__tests__/tooltip.test.tsx`,
`packages/chrome/src/__tests__/sidebar-outline-rows.test.tsx`.

**Out of scope**: `Menu.tsx`, `InsertMenu.tsx`, `PlateMenu.tsx`, `Tooltip.tsx`; the toolbar and
the title row keep their focus tooltips by rule. `packages/chrome/src/ThemesPanel.tsx`,
`GtMark.tsx`, `dialogs/Logo.tsx` and `palette-data.ts` belong to another session.

## Git workflow

Branch `claude/shadcn-improve`, one commit, message
`Chrome: no tooltip on keyboard focus in any menu, and the outline row menu keeps its focus`.
Do not push.

## Steps

### Step 1: Add the menu role to the quiet surfaces

Set `QUIET_FOCUS_SURFACES` to
`'.ts-menu, .ts-context-menu, [role="menu"], [role="dialog"], [role="alertdialog"]'`.

**Verify**: `grep -n 'role="menu"' packages/chrome/src/tip.ts` prints the constant's line.

### Step 2: Test the rule

In `tooltip.test.tsx`, add a case: render a `div role="menu"` (no class) holding a button with
`tipProps`, send a Tab focus to the button with the file's helper, and expect no tooltip layer to
be shown; then the same button outside the menu shows one.

### Step 3: Make the row menu's first focus a mount effect and return focus on Escape

In `RowMenu`, keep `onClose` in a ref that is assigned on every render, bind the outside press
and Escape listeners once (empty dependency list) reading the ref, and move the first row focus
into that same mount effect. In the Escape branch, call `menu.anchor.focus()` after closing.

### Step 4: Test it

In `sidebar-outline-rows.test.tsx` (or a new `sidebar-row-menu.test.tsx` beside it if that file
does not mount the menu), open a row's menu, move focus to the second item with ArrowDown, force
a re-render of the sidebar with the same props, and expect the second item to hold the focus
still. Press Escape and expect the row's More button to hold the focus.

**Verify**: the two test files pass.

## Done criteria

- [ ] both test files pass with the new cases
- [ ] `node scripts/check.mjs --only 4,5,19` exits 0
- [ ] on a dev server: Insert menu opened with Space, ArrowDown through three rows, no tooltip plate

## STOP conditions

- A test in `tooltip.test.tsx` asserts that a `role="menu"` surface without `.ts-menu` shows a
  focus tooltip (then the rule was meant narrower; report).
- `RowMenu` no longer matches the description.

## Maintenance notes

A new menu surface needs no class for the rule once it carries `role="menu"`.
