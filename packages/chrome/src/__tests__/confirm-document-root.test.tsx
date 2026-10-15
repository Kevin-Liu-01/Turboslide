// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '../ConfirmDialog';
import { Dialog } from '../Dialog';

// Escape in a confirm nested in another dialog, with React's root on the document as the app has
// it. Its own file: React registers its listeners on a root container once, and a document an
// earlier root in the same file already marked never gets them (the click would reach nothing).

const ctl = (control: string) => document.querySelector<HTMLElement>(`[data-control="${control}"]`);

describe('a confirm nested in a dialog, rendered from a root on the document', () => {
  /* TanStack Start hydrates `document` (react-start's client entry), so React's listeners sit on
     the document beside every card's own Escape listener, and the confirm's stopPropagation cannot
     stop the outer card's. The confirm leaves the document inside its handler (flushSync), so the
     outer listener meets a target outside its card and once closed the whole Share card. The key
     is sent outside act, so the confirm leaves mid dispatch as it does in a browser. */
  it('closes the confirm alone on Escape; Escape on the body then closes the outer card', async () => {
    const closeOuter = vi.fn();
    function Asker() {
      const [asking, setAsking] = useState(false);
      return (
        <>
          <button type="button" data-control="outer.remove" onClick={() => setAsking(true)}>
            Remove
          </button>
          {asking ? (
            <ConfirmDialog
              title="Remove access for lee@example.test?"
              sentence="Anyone who could open the presentation may already hold a copy."
              confirmLabel="Remove Access"
              confirmDoc="Takes the person's access away"
              control="outer.confirm"
              onClose={() => setAsking(false)}
              onConfirm={() => undefined}
            />
          ) : null}
        </>
      );
    }
    const root = createRoot(document);
    await act(async () => {
      root.render(
        <html lang="en">
          <head />
          <body>
            <Dialog title="Share" onClose={closeOuter} control="outer" actions={[]}>
              <Asker />
            </Dialog>
          </body>
        </html>,
      );
    });
    try {
      const remove = ctl('outer.remove')!;
      act(() => remove.focus());
      act(() => remove.click());
      const cancel = ctl('outer.confirm.cancel')!;
      expect(document.activeElement).toBe(cancel);
      const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
      try {
        cancel.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        );
      } finally {
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
      }
      expect(cancel.isConnected).toBe(false);
      expect(closeOuter).not.toHaveBeenCalled();
      expect(ctl('outer')).not.toBeNull();
      expect(document.activeElement).toBe(remove);
      /* the outer card still answers a key pressed with the focus on the body */
      act(() => remove.blur());
      act(() => {
        document.body.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        );
      });
      expect(closeOuter).toHaveBeenCalledTimes(1);
    } finally {
      act(() => root.unmount());
    }
  });
});
