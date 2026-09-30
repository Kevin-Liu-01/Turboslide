/**
 * Runs async tasks one after the other in call order: a task starts once the task before it has
 * settled, its own rejection reaches its own caller alone and never holds the chain. The editor's
 * undo and redo go through one chain (controller.tsx): the filmstrip's snackbar Undo after a
 * delete of several slides calls undo once per slide in one synchronous loop, and a fast double
 * Cmd+Z does the same, so two undos ran side by side and the second stepped its inverse against
 * the first's write still in flight, read nothing left and refused ("already changed"), which
 * brought one slide of two back (the row `slides.delete.two-selected-key-undo` on the memory tier,
 * red since the fix round 2's clock records; the ship step's third attempt).
 */
export function serialChain(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const next = tail.then(task, task);
    tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}
