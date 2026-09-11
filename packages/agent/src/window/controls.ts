// Control discovery for the window API (SPEC 6.5, 7.4): controls are found by normalized
// accessible label (aria-label, title, name, aria-labelledby or the wrapping label) and by their
// data-control id, so `set('list: Size', 22)` and `set('block.list.size', 22)` reach one element
// and produce one action call. A missing label throws RangeError naming it. set() writes native
// values and dispatches input and change (glyphfield studioAutomation.ts, setNativeValue) and, on
// a segmented control (role="group": the inspector's Seg for an enum of four or fewer values,
// SPEC 6.5), clicks the option whose data-control suffix or label is the value. Framework free.
import type { StudioControl, StudioValue } from './adapter.ts';

/** Ancestors that take a control and its owner out of the active set (SPEC 7.4). */
export const INACTIVE_ANCESTOR = '[inert], [hidden], [aria-hidden="true"], [data-active="false"]';

/** What controls() lists: native controls, button and textbox roles, labeled groups (Segs). */
export const CONTROL_SELECTOR =
  'button, input, textarea, select, [role="button"], [role="textbox"], [role="group"][aria-label]';

/** Lower case, whitespace collapsed: how labels are compared. */
export function normalizedLabel(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

/**
 * The accessible name in the order SPEC 7.4 lists: aria-label, title, name, aria-labelledby, the
 * wrapping label, then the element's own text.
 */
export function controlLabel(element: Element): string {
  const explicit =
    element.getAttribute('aria-label') ??
    element.getAttribute('title') ??
    element.getAttribute('name');
  if (explicit) return explicit.trim();
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const label = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
    if (label) return label;
  }
  const wrapping = element.closest('label');
  return (wrapping?.textContent ?? element.textContent).replace(/\s+/g, ' ').trim();
}

/** The data-control id, or undefined. */
export function controlId(element: Element): string | undefined {
  return element.getAttribute('data-control') ?? undefined;
}

/** True for an owner or control element that is connected and under no inactive ancestor. */
export function elementIsActive(element: Element | null | undefined): boolean {
  if (element === undefined) return true;
  return Boolean(element?.isConnected && !element.closest(INACTIVE_ANCESTOR));
}

function isDisabled(element: Element): boolean {
  return element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
}

/** The active, enabled controls under root, in document order; options inside a group are left out. */
export function interactiveControls(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)).filter(
    (element) =>
      !isDisabled(element) &&
      elementIsActive(element) &&
      (element.getAttribute('role') === 'group' || element.closest('[role="group"]') === null),
  );
}

function isGroup(element: Element): boolean {
  return element.getAttribute('role') === 'group';
}

/** The option buttons of a segmented control. */
function groupOptions(group: Element): HTMLElement[] {
  return Array.from(group.querySelectorAll<HTMLElement>('button, [role="button"]'));
}

function isPressed(option: Element): boolean {
  return option.getAttribute('aria-pressed') === 'true' || option.classList.contains('is-on');
}

/**
 * The option of a group for a value: by the last data-control segment (`block.list.size.22`), then
 * by its accessible label, then by its text.
 */
function optionFor(group: Element, value: StudioValue): HTMLElement | undefined {
  const wanted = normalizedLabel(String(value));
  return groupOptions(group).find((option) => {
    const id = controlId(option);
    if (id !== undefined && normalizedLabel(id.slice(id.lastIndexOf('.') + 1)) === wanted)
      return true;
    return normalizedLabel(controlLabel(option)) === wanted;
  });
}

/** The group's own id: its data-control, or an option's id without the value segment. */
function groupControlId(group: Element): string | undefined {
  const own = controlId(group);
  if (own !== undefined) return own;
  const option = groupOptions(group).find((row) => controlId(row) !== undefined);
  const id = option === undefined ? undefined : controlId(option);
  if (id === undefined) return undefined;
  const cut = id.lastIndexOf('.');
  return cut > 0 ? id.slice(0, cut) : id;
}

function groupValue(group: Element): string | undefined {
  const on = groupOptions(group).find(isPressed);
  if (on === undefined) return undefined;
  const id = controlId(on);
  return id === undefined ? controlLabel(on) : id.slice(id.lastIndexOf('.') + 1);
}

/**
 * Finds a control by data-control id first, then by normalized label, among the active controls
 * under root. A Seg option id (`block.list.size.22`) resolves to its group. RangeError when nothing
 * matches.
 */
export function matchControl(labelOrId: string, root: ParentNode = document): HTMLElement {
  const controls = interactiveControls(root);
  const byId = controls.find(
    (element) =>
      controlId(element) === labelOrId ||
      (isGroup(element) && groupControlId(element) === labelOrId),
  );
  if (byId) return byId;
  const option = Array.from(
    root.querySelectorAll<HTMLElement>(`[data-control="${cssEscape(labelOrId)}"]`),
  ).find((element) => elementIsActive(element));
  const group = option?.closest<HTMLElement>('[role="group"]');
  if (group && elementIsActive(group)) return group;
  const wanted = normalizedLabel(labelOrId);
  const byLabel = controls.find((element) => normalizedLabel(controlLabel(element)) === wanted);
  if (byLabel) return byLabel;
  throw new RangeError(`No active Turboslide control is labelled or identified "${labelOrId}".`);
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}

/**
 * Sets a native value through the prototype setter so a React-controlled input sees the change
 * (React's value tracker records direct instance writes and then ignores the event), then
 * dispatches input and change.
 */
function writeNative(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  const proto = Object.getPrototypeOf(element) as object;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor?.set) descriptor.set.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/** set() on a resolved element (glyphfield setNativeValue, plus the group case). */
export function setNativeValue(element: HTMLElement, value: StudioValue): void {
  if (isGroup(element)) {
    const option = optionFor(element, value);
    if (!option) {
      throw new RangeError(
        `The "${controlLabel(element)}" control has no option "${String(value)}".`,
      );
    }
    /* an already pressed option stays: the Seg would read a second click as "back to the first" */
    if (!isPressed(option)) option.click();
    return;
  }
  if (element instanceof HTMLInputElement && element.type === 'file') {
    const files: readonly File[] | null =
      value instanceof File
        ? [value]
        : Array.isArray(value) && value.every((item): item is File => item instanceof File)
          ? value
          : null;
    if (!files) throw new TypeError('File inputs require a File or File array.');
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(file);
    element.files = transfer.files;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  if (element instanceof HTMLInputElement && element.type === 'checkbox') {
    if (typeof value !== 'boolean') throw new TypeError('Checkbox values must be Boolean.');
    if (element.checked !== value) element.click();
    return;
  }
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    writeNative(element, String(value));
    return;
  }
  if (element.getAttribute('role') === 'textbox' || element.isContentEditable) {
    element.textContent = String(value);
    element.dispatchEvent(
      new InputEvent('input', { bubbles: true, data: String(value), inputType: 'insertText' }),
    );
    return;
  }
  throw new TypeError(`The "${controlLabel(element)}" control does not accept a direct value.`);
}

/** controls(): every active control with its kind, label, data-control id and value. */
export function listControls(root: ParentNode = document): StudioControl[] {
  return interactiveControls(root).flatMap((element): StudioControl[] => {
    const label = controlLabel(element);
    if (!label) return [];
    const withId = (row: StudioControl, id: string | undefined): StudioControl =>
      id === undefined ? row : { ...row, control: id };
    if (isGroup(element)) {
      const value = groupValue(element);
      return [
        withId(
          value === undefined ? { kind: 'select', label } : { kind: 'select', label, value },
          groupControlId(element),
        ),
      ];
    }
    const id = controlId(element);
    if (element instanceof HTMLInputElement && element.type === 'checkbox') {
      return [withId({ kind: 'checkbox', label, value: element.checked }, id)];
    }
    if (element instanceof HTMLInputElement)
      return [withId({ kind: 'input', label, value: element.value }, id)];
    if (element instanceof HTMLTextAreaElement)
      return [withId({ kind: 'textarea', label, value: element.value }, id)];
    if (element instanceof HTMLSelectElement)
      return [withId({ kind: 'select', label, value: element.value }, id)];
    if (element.getAttribute('role') === 'textbox' || element.isContentEditable) {
      return [withId({ kind: 'textbox', label, value: element.textContent }, id)];
    }
    return [withId({ kind: 'button', label }, id)];
  });
}

/** activate(): clicks the control; on a group with one option per value, the caller wants set(). */
export function activateControl(labelOrId: string, root: ParentNode = document): void {
  const element = matchControl(labelOrId, root);
  if (isGroup(element)) {
    throw new TypeError(
      `"${controlLabel(element)}" is a segmented control; set it to one of its values instead.`,
    );
  }
  element.click();
}

/** set(): resolves the control and writes the value. */
export function setControlValue(
  labelOrId: string,
  value: StudioValue,
  root: ParentNode = document,
): void {
  setNativeValue(matchControl(labelOrId, root), value);
}

/**
 * The data-control id of an inspector control (SPEC 6.5): `block.<blockId>.<property>` for a block
 * property, `slide.<property>` for the slide and `layout.<property>` for its layout. One place
 * builds them so the inspector and the tests agree on the form.
 */
export function inspectorControlId(
  scope: 'block' | 'slide' | 'layout',
  property: string,
  blockId?: string,
): string {
  return scope === 'block' ? `block.${blockId ?? ''}.${property}` : `${scope}.${property}`;
}

/** The accessible label of an inspector control: `<block id>: <property label>` (`list: Size`). */
export function inspectorControlLabel(subject: string, propertyLabel: string): string {
  return `${subject}: ${propertyLabel}`;
}
