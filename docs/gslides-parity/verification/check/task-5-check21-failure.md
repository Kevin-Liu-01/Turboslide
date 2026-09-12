# Task 5 failure in check step 21 (first run, 09:30 PDT)

Extracted from check-step-21.log. The rerun's outcome is in check-step-21-rerun.log.

```
  1) apps/studio/e2e/ten-tasks.spec.ts:357:1 › task 5: add, duplicate, delete and reorder slides in one press each

    Error: expect(locator).toHaveAttribute(expected) failed

    Locator:  locator('.pt-viewer')
    Expected: "split-1"
    Received: "breaks"
    Timeout:  5000ms

    Call log:
      - Expect "toHaveAttribute" with timeout 5000ms
      - waiting for locator('.pt-viewer')
        14 × locator resolved to <div data-index="1" data-total="8" data-dir="next" data-settled="" data-sb="thumbs" data-mode="slide" data-spellcheck="" data-active="breaks" data-density="thumbs" cl
           - unexpected value "breaks"


      368 |   expect(added).toBeTruthy();
      369 |   /* the new slide is current; Cmd+D duplicates it */
    > 370 |   await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', added!);
          |                                            ^
      371 |   await settled(page);
      372 |   await card(page, added!).focus();
      373 |   await k.press('ControlOrMeta+d', card(page, added!));
        at /Users/kevinliu/repos/Turboslide/apps/studio/e2e/ten-tasks.spec.ts:370:44

    Error Context: .turboslide/playwright/ten-tasks-task-5-add-dupli-6f9cd-er-slides-in-one-press-each/error-context.md

    Error Context: .turboslide/playwright/ten-tasks-task-5-add-dupli-6f9cd-er-slides-in-one-press-each/error-context.md

```
