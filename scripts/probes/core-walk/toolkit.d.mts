// Type declarations for the TypeScript callers of the walk toolkit's pure reads (the polish
// round, docs/POLISH.md 5.1: the core specs read a frame's pixels the way the walk does, through
// `decodePng`, `pixelAt` and `sampleBox`). The toolkit itself (`createToolkit`) is the walk's and
// stays untyped here; the declarations cover the exports a spec imports.

export type DecodedPng = {
  width: number;
  height: number;
  pixel: (x: number, y: number) => number[];
};
export type Box = { x: number; y: number; w: number; h: number };
export type BoxSample = {
  count: number;
  mean: number[];
  distinct: number;
  dominant: { hex: string; share: number } | null;
  colors: { hex: string; count: number }[];
};
export type ColorRun = {
  x?: number;
  y?: number;
  thickness: number;
  color: string;
  contrastToPrevious?: number;
};

export function decodePng(buf: Uint8Array): DecodedPng;
export function pixelAt(
  img: DecodedPng | null,
  x: number,
  y: number,
): { rgb: number[]; hex: string } | null;
export function sampleBox(
  img: DecodedPng | null,
  box: Box | null,
  options?: { inset?: number; step?: number; tolerance?: number },
): BoxSample;
export function boxIntersects(a: Box | null, b: Box | null, tolerance?: number): boolean;
export function boxInside(inner: Box | null, outer: Box | null, tolerance?: number): boolean;
export function boxGap(a: Box | null, b: Box | null): { dx: number; dy: number } | null;
export function runsAlongColumn(img: DecodedPng, x: number, y0: number, y1: number): ColorRun[];
export function runsAlongRow(img: DecodedPng, y: number, x0: number, x1: number): ColorRun[];
export function thinRuns(runs: ColorRun[], max?: number): ColorRun[];
export const hex: (rgb: number[]) => string;
export const contrast: (a: number[], b: number[]) => number;
export function compareFrame(
  object: Box | null,
  ring: Box | null,
  options?: { outset?: number; tolerance?: number },
): { ok: boolean; dx?: number; dy?: number; dw?: number; dh?: number; reason?: string };
export class SetupFailed extends Error {
  stepName: string;
  constructor(stepName: string);
}
export function createToolkit(input: Record<string, unknown>): Record<string, unknown>;
