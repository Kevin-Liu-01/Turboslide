import { useEffect, useRef } from 'react';

/**
 * Runs an effect once on mount and its cleanup once on unmount; the same
 * device as @turboslide/chrome's lib/useMountEffect (the chrome does not
 * export its lib folder). See that file for why the cleanup is deferred.
 */
export function useMountEffect(effect: () => void | (() => void)): void {
  const cleanup = useRef<void | (() => void)>(undefined);
  const pending = useRef(0);
  /* mount-only by contract: the effect reads nothing that changes */
  useEffect(() => {
    if (pending.current) {
      window.clearTimeout(pending.current);
      pending.current = 0;
    } else {
      cleanup.current = effect();
    }
    return () => {
      pending.current = window.setTimeout(() => {
        pending.current = 0;
        const dispose = cleanup.current;
        cleanup.current = undefined;
        if (dispose) dispose();
      }, 0);
    };
  }, []);
}
