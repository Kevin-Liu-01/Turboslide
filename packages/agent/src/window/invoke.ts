// invoke() (SPEC 7.1, 7.4): the six Glyphfield standard actions are handled by the API itself and
// everything else is delegated to the active owner's adapter, which in the studio is the action
// dispatcher (@turboslide/agent/dispatch) over the same handlers a click uses. Malformed input is a
// TypeError, an unknown action a RangeError, as the action table's error classes say. Ported from
// glyphfield studioAutomation.ts (invoke, studioArtifact, downloadStudioArtifact).
import type { StudioAdapter, StudioArtifact, StudioAutomation, StudioValue } from './adapter.ts';
import { STANDARD_ACTIONS } from '../generate/describe.ts';

export { STANDARD_ACTIONS };

export type StandardAction = (typeof STANDARD_ACTIONS)[number];

export function isStandardAction(action: string): action is StandardAction {
  return (STANDARD_ACTIONS as ReadonlyArray<string>).includes(action);
}

/** Checks an artifact.download input: a Blob and a non-empty file name. */
export function studioArtifact(input: unknown): StudioArtifact {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('An export artifact with blob and fileName is required.');
  }
  const { blob, fileName } = input as { blob?: unknown; fileName?: unknown };
  if (!(blob instanceof Blob) || typeof fileName !== 'string' || !fileName.trim()) {
    throw new TypeError('An export artifact requires a Blob and a non-empty fileName.');
  }
  return { blob, fileName };
}

/** Saves a Blob through a temporary anchor; the object URL is released after the click. */
export function downloadArtifact(artifact: StudioArtifact, target: Document = document): void {
  const { blob, fileName } = studioArtifact(artifact);
  const url = URL.createObjectURL(blob);
  const anchor = target.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  target.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function isStudioValue(value: unknown): value is StudioValue {
  return (
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string' ||
    value instanceof File ||
    (Array.isArray(value) && value.every((item) => item instanceof File))
  );
}

/**
 * Runs one action against a studio handle: a standard action through the API's own methods, any
 * other through the adapter's invoke, RangeError when the adapter has none.
 */
export async function invokeAction(
  studio: StudioAutomation,
  adapter: StudioAdapter,
  action: string,
  input?: unknown,
): Promise<unknown> {
  switch (action) {
    case 'source.read':
      return studio.readSource();
    case 'source.apply': {
      if (typeof input !== 'string' && (!input || typeof input !== 'object')) {
        throw new TypeError('source.apply requires a JSON string or object.');
      }
      await studio.applySource(input);
      return null;
    }
    case 'controls.list':
      return studio.controls();
    case 'control.activate': {
      if (typeof input !== 'string') {
        throw new TypeError('control.activate requires an accessible label or data-control id.');
      }
      studio.activate(input);
      return null;
    }
    case 'control.set': {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError('control.set requires { label, value }.');
      }
      const { label, value } = input as { label?: unknown; value?: unknown };
      if (typeof label !== 'string' || !isStudioValue(value)) {
        throw new TypeError('control.set requires a string label and a supported control value.');
      }
      studio.set(label, value);
      return null;
    }
    case 'artifact.download': {
      studio.download(studioArtifact(input));
      return null;
    }
    default: {
      if (!adapter.invoke) {
        throw new RangeError(
          `The active ${adapter.owner} owner does not expose the "${action}" action.`,
        );
      }
      // the nonce guard (SPEC-3 6.6): a guarded action needs the page's nonce in its input
      if (adapter.guard !== undefined) {
        const checked = adapter.guard(action, input);
        if (!checked.ok) throw checked.error;
        return adapter.invoke(action, checked.input);
      }
      return adapter.invoke(action, input);
    }
  }
}
