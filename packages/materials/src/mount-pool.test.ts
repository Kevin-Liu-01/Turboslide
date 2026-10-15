// The pnpm patch of @paper-design/shaders 0.0.78 (patches/@paper-design__shaders@0.0.78.patch,
// taken from Glyphfield, MIT, Kevin Liu): a disposed ShaderMount hands its canvas, its WebGL2
// context and its compiled program to a pool of two keyed by the context attributes, so the next
// mount skips the context (about 70 ms) and the compile (about 45 ms); a lost context is dropped;
// a third key evicts the oldest entry and releases its context; dispose never waits on the GPU
// through `getError`. Turboslide's change to the patch: a pooled canvas holds no drawing buffer
// (size zero), so the next mount never shows the last frame and a mount at speed 0 still draws on
// its first resize. Node, with a fake document, canvas and context.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShaderMount } from '@paper-design/shaders';

const FRAGMENT = '#version 300 es\nprecision mediump float;\nout vec4 c;\nvoid main(){c=vec4(1.);}';
const OTHER_FRAGMENT = `${FRAGMENT}\n// another shader`;

type Calls = Record<string, number>;

/** A WebGL2 context that records its calls; every method the mount uses answers a plausible value. */
function fakeGl(canvas: FakeCanvas, calls: Calls) {
  let lost = false;
  const loseContext = vi.fn(() => {
    lost = true;
  });
  const answers: Record<string, (...args: unknown[]) => unknown> = {
    isContextLost: () => lost,
    getExtension: (name) => (name === 'WEBGL_lose_context' ? { loseContext } : null),
    getShaderPrecisionFormat: () => ({ precision: 23 }),
    createShader: () => ({}),
    createProgram: () => ({ program: (calls.createProgram ?? 0) + 1 }),
    createBuffer: () => ({}),
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getAttribLocation: () => 0,
    getUniformLocation: () => ({}),
  };
  const gl = new Proxy(
    { canvas, loseContext, lose: () => (lost = true) },
    {
      get(target, key) {
        if (key in target) return target[key as keyof typeof target];
        if (typeof key !== 'string') return undefined;
        if (/^[A-Z_0-9]+$/.test(key)) return 0;
        return (...args: unknown[]) => {
          calls[key] = (calls[key] ?? 0) + 1;
          return answers[key]?.(...args);
        };
      },
    },
  );
  return gl;
}

type FakeGl = ReturnType<typeof fakeGl>;

type FakeCanvas = {
  width: number;
  height: number;
  dataset: Record<string, string>;
  style: Record<string, string>;
  ownerDocument: FakeDocument;
  getContext: (type: string, attributes?: WebGLContextAttributes) => FakeGl | null;
  remove: () => void;
};

type FakeDocument = ReturnType<typeof fakeDocument>;

/** A document whose canvases count the contexts they create. */
function fakeDocument(calls: Calls) {
  const doc = {
    hidden: false,
    defaultView: undefined,
    head: { prepend: () => undefined },
    querySelector: () => ({}),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    createElement: (): FakeCanvas => {
      calls.createElement = (calls.createElement ?? 0) + 1;
      const canvas: FakeCanvas = {
        width: 300,
        height: 150,
        dataset: {},
        style: {},
        ownerDocument: doc,
        getContext: () => {
          calls.getContext = (calls.getContext ?? 0) + 1;
          return fakeGl(canvas, calls);
        },
        remove: () => undefined,
      };
      return canvas;
    },
  };
  return doc;
}

function fakeHost(doc: FakeDocument) {
  return {
    nodeType: 1,
    ownerDocument: doc,
    prepend: () => undefined,
    setAttribute: () => undefined,
  };
}

/* the ResizeObserver Paper sets up per mount: the test delivers the host's box */
let observers: ((entries: unknown[]) => void)[] = [];
class FakeResizeObserver {
  constructor(callback: (entries: unknown[]) => void) {
    observers.push(callback);
  }
  observe() {}
  disconnect() {}
}
const resize = (width: number, height: number) =>
  observers.at(-1)?.([{ borderBoxSize: [{ inlineSize: width, blockSize: height }] }]);

/** The mount's fields the test reads (`gl` and `program` are private in Paper's types). */
type Mounted = {
  gl: FakeGl;
  canvasElement: FakeCanvas;
  program: unknown;
  dispose: () => void;
};

function mount(
  doc: FakeDocument,
  attributes?: WebGLContextAttributes,
  options: { fragment?: string; speed?: number; minPixelRatio?: number } = {},
): Mounted {
  return new ShaderMount(
    fakeHost(doc) as unknown as HTMLElement,
    options.fragment ?? FRAGMENT,
    {},
    attributes,
    options.speed ?? 0,
    0,
    options.minPixelRatio ?? 2,
  ) as unknown as Mounted;
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal('visualViewport', undefined);
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubGlobal('HTMLImageElement', class {});
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the Paper context and program pool (the pnpm patch)', () => {
  it('a second mount takes the first one’s canvas, context and program', () => {
    const calls: Calls = {};
    const doc = fakeDocument(calls);
    const first = mount(doc);
    const { canvasElement, gl, program } = first;
    first.dispose();
    expect(canvasElement.dataset.paperShaderPooled).toBe('');
    const second = mount(doc);
    expect(second.canvasElement).toBe(canvasElement);
    expect(second.gl).toBe(gl);
    expect(second.program).toBe(program);
    expect(canvasElement.dataset.paperShaderPooled).toBeUndefined();
    expect(calls.createElement).toBe(1);
    expect(calls.getContext).toBe(1);
    expect(calls.createProgram).toBe(1);
    second.dispose();
  });

  it('keeps a program per shader: another shader compiles once on the pooled context', () => {
    const calls: Calls = {};
    const doc = fakeDocument(calls);
    mount(doc).dispose();
    const other = mount(doc, undefined, { fragment: OTHER_FRAGMENT });
    expect(calls.getContext).toBe(1);
    expect(calls.createProgram).toBe(2);
    other.dispose();
    mount(doc, undefined, { fragment: OTHER_FRAGMENT }).dispose();
    expect(calls.createProgram).toBe(2);
  });

  it('drops a context lost before dispose or while pooled', () => {
    const calls: Calls = {};
    const doc = fakeDocument(calls);
    const first = mount(doc);
    first.gl.lose();
    first.dispose();
    expect(first.canvasElement.dataset.paperShaderPooled).toBeUndefined();
    const second = mount(doc);
    expect(second.canvasElement).not.toBe(first.canvasElement);
    second.dispose();
    second.gl.lose();
    const third = mount(doc);
    expect(third.canvasElement).not.toBe(second.canvasElement);
    expect(calls.getContext).toBe(3);
    third.dispose();
  });

  it('holds two keys: a third evicts the oldest and releases its context', () => {
    const calls: Calls = {};
    const doc = fakeDocument(calls);
    const stage = mount(doc);
    const capture = mount(doc, { preserveDrawingBuffer: true, antialias: false });
    const other = mount(doc, { alpha: false });
    stage.dispose();
    capture.dispose();
    expect(stage.gl.loseContext).not.toHaveBeenCalled();
    other.dispose();
    expect(stage.gl.loseContext).toHaveBeenCalledTimes(1);
    expect(stage.canvasElement.dataset.paperShaderPooled).toBeUndefined();
    expect(capture.gl.loseContext).not.toHaveBeenCalled();
    /* the capture's attributes find the capture's context, never the stage's */
    const again = mount(doc, { preserveDrawingBuffer: true, antialias: false });
    expect(again.gl).toBe(capture.gl);
    again.dispose();
  });

  it('disposes without getError, which waits on the GPU', () => {
    const calls: Calls = {};
    const doc = fakeDocument(calls);
    const first = mount(doc);
    first.dispose();
    expect(calls.getError).toBeUndefined();
  });

  it('a pooled canvas holds no drawing buffer, so a mount at speed 0 draws on its first resize', () => {
    const calls: Calls = {};
    const doc = fakeDocument(calls);
    const first = mount(doc, undefined, { minPixelRatio: 1 });
    resize(800, 450);
    expect([first.canvasElement.width, first.canvasElement.height]).toEqual([800, 450]);
    const drawn = calls.drawArrays ?? 0;
    expect(drawn).toBeGreaterThan(0);
    first.dispose();
    /* the same box at 1x keeps the scale at 1, so only the size can tell the resize to draw */
    expect([first.canvasElement.width, first.canvasElement.height]).toEqual([0, 0]);
    const second = mount(doc, undefined, { minPixelRatio: 1 });
    expect(second.canvasElement).toBe(first.canvasElement);
    resize(800, 450);
    expect([second.canvasElement.width, second.canvasElement.height]).toEqual([800, 450]);
    expect(calls.drawArrays).toBe(drawn + 1);
    second.dispose();
  });
});
