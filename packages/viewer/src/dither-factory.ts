/**
 * The slot for the studio's dither worker factory (gslides-parity SPEC-3 10.2; hardening HR-PC#2,
 * PERF-9). apps/studio/src/router.tsx registers the factory for every page, so this module is in
 * the chunk every route loads, and it imports nothing at run time: the dither pipeline
 * (`./dither.ts` with the effects package, about 30 KB) stays with the stages that draw a dither
 * and reads the slot when it builds its shared host.
 */

/** The worker surface the hosts drive; `new Worker(...)` satisfies it. */
export type DitherWorkerLike = Pick<Worker, 'postMessage' | 'terminate'> & {
  addEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
};

let factory: (() => DitherWorkerLike) | null = null;
let generation = 0;

/** Registers the studio's worker factory; the shared host is rebuilt on the next draw. */
export function setDitherWorkerFactory(make: (() => DitherWorkerLike) | null): void {
  factory = make;
  generation += 1;
}

/** The registered factory and the count of registrations, which tells the host when to rebuild. */
export function ditherWorkerFactory(): {
  make: (() => DitherWorkerLike) | null;
  generation: number;
} {
  return { make: factory, generation };
}
