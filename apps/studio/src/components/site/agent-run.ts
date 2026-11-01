import { LIGHTHOUSE, callFor, objectById } from './canvas-pose';
import type { Call, Mutation, Pos, Scene, SlideObject } from './canvas-pose';

/**
 * The agent's run on the Agents screen (CanvasScreen.tsx): the six writes an agent sends to build
 * the lighthouse slide from an empty freeform slide, each one action of the editor's table in the
 * spelling the screen prints for a person's writes (canvas-pose.ts `callFor`, `printCall`). The
 * picture, the plate, the heading, the paragraph and the credit go in at the boxes the CLI
 * measured when it converted the slide (home-deck/recorded/lighthouse-canvas.json, `grammar.boxes`),
 * each after the block before it, so the document order is LIGHTHOUSE's; the last write moves the
 * heading off the plate into the sky and turns it to 354 degrees, which leaves the slide exactly
 * as LIGHTHOUSE holds it and the screen's first state (INITIAL) takes over.
 */
export type RunStep = {
  call: Call;
  /** the object the agent's flag stands on while the write lands */
  target: string;
  /** a text the write types in, one character at a time */
  types: boolean;
};

/** The heading's box on the plate before the agent moves it (grammar.boxes.h). */
export const HEADING_ON_PLATE: Pos = { x: 929, y: 558.734375, w: 508, h: 47.515625, z: 2 };

function at(id: string): SlideObject {
  const object = objectById(LIGHTHOUSE, id);
  if (object === undefined) throw new RangeError(`agent-run: no ${id} on the lighthouse slide`);
  return object;
}

function insert(block: SlideObject, after?: string): Call {
  const mutation: Mutation =
    after === undefined ? { op: 'block.insert', block } : { op: 'block.insert', after, block };
  return callFor([mutation]);
}

const heading = at('h');

export const RUN: readonly RunStep[] = [
  { call: insert(at('picture')), target: 'picture', types: false },
  { call: insert(at('plate'), 'picture'), target: 'plate', types: false },
  { call: insert({ ...heading, pos: HEADING_ON_PLATE }, 'plate'), target: 'h', types: true },
  { call: insert(at('p1'), 'h'), target: 'p1', types: true },
  { call: insert(at('credit'), 'p1'), target: 'credit', types: false },
  {
    call: callFor([{ op: 'block.set', blockId: 'h', path: '/pos', value: heading.pos }]),
    target: 'h',
    types: false,
  },
];

/** The mutations of a step's call (the run writes single mutations only). */
export function stepMutations(step: RunStep): readonly Mutation[] {
  return step.call.id === 'slide.update'
    ? step.call.mutations
    : 'mutation' in step.call
      ? [step.call.mutation]
      : [];
}

/** How long the agent takes over each step, and over each character a step types, in ms. */
export const STEP_MS = 900;
export const CHAR_MS = 14;
/** The heading's move into the sky, in ms. */
export const MOVE_MS = 700;

/** The run's empty slide: a freeform slide with nothing in `main`. */
export const EMPTY: Scene = [];
