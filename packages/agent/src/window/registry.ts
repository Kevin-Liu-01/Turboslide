// The registry behind window.turboslide.studio (SPEC 7.4), glyphfield/src/lib/studioAutomation.ts
// with the names changed (THIRD_PARTY_NOTICES.md). Adapters are registered by the component that
// owns state with an owner element; the `studio` getter resolves the last registration whose owner
// is connected and not under [inert], [hidden], [aria-hidden="true"] or [data-active="false"]; a
// MutationObserver on those attributes only dispatches the ready event when the active adapter
// changes. Returned handles stay bound to their owner: a call on a disposed or inactive owner
// throws, so a delayed write never lands on another owner.
import type {
  StudioAdapter,
  StudioArtifact,
  StudioAutomation,
  StudioDescribe,
  StudioOwnerId,
  StudioValue,
} from './adapter.ts';
import { activateControl, elementIsActive, listControls, setControlValue } from './controls.ts';
import { downloadArtifact, invokeAction } from './invoke.ts';
import { READY_EVENT, WINDOW_GLOBAL, dispatchReady, waitForCommit } from './ready.ts';
import { actionsOn } from '@turboslide/schema/actions';

export type TurboslideGlobal = { studio: StudioAutomation };

declare global {
  // Global augmentation needs an interface: it merges into the DOM's Window declaration.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Window {
    turboslide?: TurboslideGlobal;
  }
}

/** The attribute a component puts on the element that scopes its delegating owners (the editor root). */
export const SCOPE_ATTRIBUTE = 'data-automation-scope';

type Registration = {
  owner: HTMLElement | null | undefined;
  adapter: StudioAdapter;
  studio: StudioAutomation;
};

type Registry = {
  entries: Registration[];
  global: TurboslideGlobal;
  previous: TurboslideGlobal | undefined;
  announced?: Registration | undefined;
  observer?: MutationObserver;
  target: Window;
};

const registries = new WeakMap<Window, Registry>();

/** The action ids the editor owner offers: every action on the window transport (SPEC 7.4). */
export function windowActionIds(): string[] {
  return actionsOn('window').map((spec) => spec.id);
}

/** The viewer's and the presenter's lists, from the same table (generate/describe.ts owners). */
export function viewerActionIds(): string[] {
  return [
    ...windowActionIds().filter((id) => id.startsWith('view.')),
    'render.slide',
    'render.sheet',
  ];
}

export function presenterActionIds(): string[] {
  return ['view.goto', 'view.present'];
}

function activeRegistration(registry: Registry): Registration | undefined {
  return registry.entries.findLast(({ owner }) => elementIsActive(owner));
}

function announce(registry: Registry): void {
  const active = activeRegistration(registry);
  if (registry.announced === active) return;
  registry.announced = active;
  if (active) dispatchReady(registry.target, active.studio.describe());
}

function getRegistry(target: Window): Registry {
  const existing = registries.get(target);
  if (existing) return existing;
  const previous = target.turboslide;
  const global = { ...previous } as TurboslideGlobal;
  const registry: Registry = { entries: [], global, previous, target };
  // Resolve current DOM ownership without waiting for an effect. Returned handles stay bound to
  // that owner, so delayed writes cannot target a new owner.
  Object.defineProperty(global, 'studio', {
    configurable: true,
    enumerable: true,
    get(): StudioAutomation {
      const active = activeRegistration(registry);
      if (!active) throw new Error(`No active Turboslide owner is ready at ${WINDOW_GLOBAL}.`);
      return active.studio;
    },
  });
  registries.set(target, registry);
  return registry;
}

function scopeOf(owner: HTMLElement): Element {
  return owner.closest(`[${SCOPE_ATTRIBUTE}]`) ?? owner;
}

/**
 * The studio handle another owner in the same scope registered, for delegation: the source drawer
 * resolves the editor around it with `excludeOwner` set to its own element, so an unknown action
 * reaches the editor and an action neither knows is a RangeError from the editor, not from the
 * drawer. An active owner wins over a connected but inactive one (the editor over the viewer
 * marker while Edit is up); the last connected owner is the fallback, so a drawer inside a
 * retained, inactive layer still reaches its own editor.
 */
export function studioAutomationForOwner(
  owner: HTMLElement | null,
  options: { exclude?: StudioAutomation; excludeOwner?: HTMLElement | null; target?: Window } = {},
): StudioAutomation | undefined {
  if (!owner || typeof window === 'undefined') return undefined;
  const registry = registries.get(options.target ?? window);
  if (!registry) return undefined;
  const scope = scopeOf(owner);
  const inScope = registry.entries.filter(
    (entry) =>
      entry.studio !== options.exclude &&
      entry.owner !== undefined &&
      entry.owner !== null &&
      entry.owner !== options.excludeOwner &&
      entry.owner.isConnected &&
      scopeOf(entry.owner) === scope,
  );
  return (
    inScope.findLast((entry) => elementIsActive(entry.owner))?.studio ??
    inScope[inScope.length - 1]?.studio
  );
}

export type RegisterOptions = {
  /** the window to install on; the current one by default (tests pass a jsdom window) */
  target?: Window;
};

/**
 * Registers an adapter with its owner element and installs window.turboslide. Returns the
 * disposer. The handle is created once per registration and its methods read the adapter at call
 * time, so a live adapter (createLiveAdapter) keeps one handle valid across re-renders.
 */
export function registerStudioAutomation(
  adapter: StudioAdapter,
  owner?: HTMLElement | null,
  options: RegisterOptions = {},
): () => void {
  if (typeof window === 'undefined' && options.target === undefined) return () => undefined;
  const target = options.target ?? window;
  const registry = getRegistry(target);
  const root = target.document;
  let disposed = false;

  const assertOwnerActive = (): void => {
    if (disposed || !elementIsActive(owner)) {
      throw new Error(
        `This Turboslide ${adapter.owner} owner is no longer active. Read ${WINDOW_GLOBAL} again.`,
      );
    }
  };

  const studio: StudioAutomation = {
    version: 1,
    owner: (): StudioOwnerId => adapter.owner,
    describe: (): StudioDescribe => ({
      version: 1,
      global: WINDOW_GLOBAL,
      event: READY_EVENT,
      owner: adapter.owner,
      actions: [...(adapter.actions ?? [])],
      source: { read: Boolean(adapter.getSource), apply: Boolean(adapter.applySource) },
      state: adapter.state?.() ?? {},
    }),
    controls: () => listControls(root),
    activate(label: string) {
      assertOwnerActive();
      activateControl(label, root);
    },
    set(label: string, value: StudioValue) {
      assertOwnerActive();
      setControlValue(label, value, root);
    },
    readSource() {
      assertOwnerActive();
      const read = adapter.getSource;
      if (!read)
        throw new TypeError(`The active ${adapter.owner} owner does not expose source reading.`);
      return read();
    },
    async applySource(source: string | object) {
      assertOwnerActive();
      const apply = adapter.applySource;
      if (!apply) {
        throw new TypeError(
          `The active ${adapter.owner} owner does not expose source application.`,
        );
      }
      await apply(typeof source === 'string' ? source : JSON.stringify(source, null, 2));
      await waitForCommit(target);
    },
    async invoke(action: string, input?: unknown) {
      assertOwnerActive();
      return invokeAction(studio, adapter, action, input);
    },
    download: (artifact: StudioArtifact) => downloadArtifact(artifact, root),
  };

  const entry: Registration = { owner, adapter, studio };
  registry.entries.push(entry);
  target.turboslide = registry.global;
  if (owner && !registry.observer && typeof MutationObserver !== 'undefined') {
    registry.observer = new MutationObserver(() => announce(registry));
    // Only ownership attributes; never subscribe to canvas styles or per-frame drawing changes.
    // API calls resolve synchronously even before this event.
    registry.observer.observe(root.body, {
      attributes: true,
      attributeFilter: ['data-active', 'inert', 'hidden', 'aria-hidden'],
      subtree: true,
    });
  }
  announce(registry);

  return () => {
    disposed = true;
    const index = registry.entries.indexOf(entry);
    if (index < 0) return;
    registry.entries.splice(index, 1);
    if (registry.entries.length > 0) {
      announce(registry);
      return;
    }
    registry.observer?.disconnect();
    registries.delete(target);
    if (target.turboslide !== registry.global) return;
    if (registry.previous) target.turboslide = registry.previous;
    else delete target.turboslide;
  };
}

/** Re-evaluates ownership now (after a data-active change made outside a mutation record). */
export function announceOwnership(target: Window = window): void {
  const registry = registries.get(target);
  if (registry) announce(registry);
}
