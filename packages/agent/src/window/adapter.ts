// The window API's adapter contract (SPEC 7.4): the component that owns state registers an
// adapter with an owner element, and window.turboslide.studio resolves the last registration
// whose owner is active. The shapes follow glyphfield/src/lib/studioAutomation.ts with the names
// changed (THIRD_PARTY_NOTICES.md, "Glyphfield"); the owner id and describe().state are
// Turboslide's additions so an agent can tell the editor from the viewer and read the deck facts
// without a second call. This file is framework free (SPEC 3.3 item 1); the React glue lives in
// the studio.

/** The four owners of SPEC 7.4. */
export type StudioOwnerId = 'editor' | 'viewer' | 'source-drawer' | 'presenter';

export const STUDIO_OWNER_IDS = ['editor', 'viewer', 'source-drawer', 'presenter'] as const;

/** One row of controls() and of the controls.list action (its output schema names these kinds). */
export type StudioControl = {
  kind: 'button' | 'checkbox' | 'input' | 'select' | 'textarea' | 'textbox';
  label: string;
  /** the locale-independent data-control id, when the control carries one (SPEC 6.5) */
  control?: string;
  value?: boolean | string;
};

/** What set() accepts: native form values, and File or File[] for file inputs. */
export type StudioValue = boolean | number | string | File | readonly File[];

export type StudioArtifact = { blob: Blob; fileName: string };

export type StudioDescribe = {
  version: 1;
  /** 'window.turboslide.studio' */
  global: string;
  /** 'turboslide:studio-api-ready' */
  event: string;
  owner: StudioOwnerId;
  /** the action ids the owner answers through invoke(); the editor's list equals the generated one */
  actions: readonly string[];
  source: { read: boolean; apply: boolean };
  /** owner facts: deckId, revision, slideId, mode, theme; whatever the owner publishes */
  state: Record<string, unknown>;
};

/**
 * What a component registers. Every member but `owner` is optional: the viewer has no source, the
 * presenter has two actions, the source drawer delegates everything but source.* to the editor.
 */
export type StudioAdapter = {
  owner: StudioOwnerId;
  actions?: readonly string[];
  /** the exact current source document */
  getSource?: () => string;
  /** runs the owner's validator, then commits; the API waits two animation frames after it */
  applySource?: (source: string) => void | Promise<void>;
  /** every action that is not one of the six standard ones */
  invoke?: (action: string, input?: unknown) => unknown | Promise<unknown>;
  /** owner facts for describe().state */
  state?: () => Record<string, unknown>;
};

/** The public object at window.turboslide.studio. */
export type StudioAutomation = {
  version: 1;
  describe: () => StudioDescribe;
  controls: () => StudioControl[];
  /** clicks a control found by accessible label or data-control id; RangeError when missing */
  activate: (label: string) => void;
  /** writes a native value and dispatches input and change; on a Seg it clicks the option */
  set: (label: string, value: StudioValue) => void;
  readSource: () => string;
  applySource: (source: string | object) => Promise<void>;
  invoke: (action: string, input?: unknown) => Promise<unknown>;
  download: (artifact: StudioArtifact) => void;
  /** the owner id, Glyphfield's activeTool() */
  owner: () => StudioOwnerId;
};

/**
 * A registration handle that survives re-renders. A React component registers `adapter` once on
 * mount and calls update() with its fresh callbacks on every render, so the handle an agent read
 * stays valid and always reaches the current props (the lifetime test pins this, as Glyphfield's
 * ToolShellAutomation.test.tsx does). Members are getters so describe() reports source.read and
 * source.apply from the current adapter.
 */
export type LiveAdapter = {
  adapter: StudioAdapter;
  update: (next: StudioAdapter) => void;
  current: () => StudioAdapter;
};

export function createLiveAdapter(initial: StudioAdapter): LiveAdapter {
  let current = initial;
  const adapter: StudioAdapter = {
    get owner(): StudioOwnerId {
      return current.owner;
    },
    get actions(): readonly string[] | undefined {
      return current.actions;
    },
    get getSource(): (() => string) | undefined {
      const read = current.getSource;
      return read === undefined ? undefined : () => read();
    },
    get applySource(): ((source: string) => void | Promise<void>) | undefined {
      const apply = current.applySource;
      return apply === undefined ? undefined : (source: string) => apply(source);
    },
    get invoke(): ((action: string, input?: unknown) => unknown) | undefined {
      const run = current.invoke;
      return run === undefined
        ? undefined
        : (action: string, input?: unknown) => run(action, input);
    },
    get state(): (() => Record<string, unknown>) | undefined {
      const read = current.state;
      return read === undefined ? undefined : () => read();
    },
  };
  return {
    adapter,
    update(next) {
      current = next;
    },
    current: () => current,
  };
}

export function isStudioOwnerId(value: unknown): value is StudioOwnerId {
  return (STUDIO_OWNER_IDS as ReadonlyArray<unknown>).includes(value);
}
