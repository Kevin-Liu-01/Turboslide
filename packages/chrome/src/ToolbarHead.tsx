import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';

import { ZOOM_LADDER, clampZoomPercent, effectiveZoomPercent, zoomStepFrom } from './editor-shell';
import { useEditorShell } from './editor-shell-context';
import { Icon } from './icons';
import { cn } from './lib/cn';
import { Menu } from './Menu';
import { tooltipKey } from './menus/keys';
import { TOOLBAR_HEAD, evaluate, itemById, presentControls } from './menus/model';
import type { MenuItem, ToolbarControl } from './menus/model';
import { stubClause } from './menus/strings';
import type { TailControl } from './menus/toolbar-tails';
import { sentence, tipProps } from './Tooltip';

import './EditorToolbar.css';

/**
 * The toolbar's fixed head (gslides-parity SPEC 3.1 rows 1 to 7; R02 section 4.1): Search the
 * menus, New slide with its layout arrow (the one split button of the toolbar), Undo, Redo,
 * Print, Paint format and the Zoom box, then the first divider. Every control is drawn from
 * `TOOLBAR_HEAD` of the menu model by `ToolbarButton`, which the tail shares: a 32 px ToolButton
 * grammar, the tooltip reading the label and the key and nothing else, a stub as `aria-disabled`
 * with the stub sentence, a control whose predicate says no as `aria-disabled` with its reason.
 * The head never collapses (SPEC 1.3).
 */

/** The tooltip of a toolbar control: the label, the key, and the stub or disabled sentence. */
export function controlTip(
  control: ToolbarControl,
  platform: 'mac' | 'win',
  enabled: boolean,
): { name: string; key?: string; doc?: string } {
  const key = tooltipKey(control.key, platform);
  const doc =
    control.status === 'later'
      ? stubClause(control.stubReason ?? '')
      : !enabled && control.disabledReason !== undefined
        ? control.disabledReason
        : control.doc;
  return {
    name: control.label,
    ...(key === undefined ? {} : { key }),
    ...(doc === undefined ? {} : { doc: sentence(doc) }),
  };
}

export type ToolbarButtonProps = {
  control: TailControl;
  onClick: (anchor: HTMLElement) => void;
  pressed?: boolean;
  /** the words shown on a text button, when they differ from the label (the Zoom value) */
  text?: string;
  /** a dropdown chevron after the glyph or the word */
  chevron?: boolean;
  /** the control's current value as `data-value` (the Align list reads the effective alignment, docs/FEATURES.md 2.2 rank 3) */
  value?: string;
  className?: string;
  children?: ReactNode;
};

/** One toolbar control in the shell grammar; `aria-disabled` keeps a stub in the tab order with its tooltip. */
export function ToolbarButton({
  control,
  onClick,
  pressed,
  text,
  chevron,
  value,
  className,
  children,
}: ToolbarButtonProps) {
  const shell = useEditorShell();
  const enabled = control.status === 'now' && evaluate(control.enabled, shell.menuContext);
  const tip = controlTip(control, shell.platform, enabled);
  const isText = control.text === true || text !== undefined;
  const label = text ?? control.label;
  return (
    <button
      type="button"
      className={cn(
        'pt-ib ts-tb',
        !isText && !children && 'pt-icon',
        isText && 'is-text',
        pressed && 'is-on',
        !enabled && 'is-disabled',
        chevron && 'has-chevron',
        className,
      )}
      aria-label={isText ? undefined : control.label}
      aria-pressed={pressed}
      aria-disabled={enabled ? undefined : true}
      aria-haspopup={chevron ? 'menu' : undefined}
      data-control={control.control}
      data-status={control.status}
      data-value={value}
      {...tipProps(tip)}
      onMouseDown={(event) => {
        /* the focus round (docs/FOCUS.md section 5, rank 10): the pointer down never moves the
           focus, so a text session and its selected range survive a click on Italic or Bold and
           the stage keeps the paste after New slide (rank 15); Tab still reaches the button */
        event.preventDefault();
        tipProps(tip).onMouseDown?.(event);
      }}
      onClick={(event) => {
        if (!enabled) return;
        onClick(event.currentTarget);
      }}
    >
      {children ??
        (control.control === 'toolbar.textBox' ? (
          <span className="ts-tb-glyph" aria-hidden="true">
            T
          </span>
        ) : control.icon !== undefined && !isText ? (
          <Icon name={control.icon} />
        ) : null)}
      {isText ? <span className="pt-lb">{label}</span> : null}
      {chevron ? <Icon name="chevron-down" /> : null}
    </button>
  );
}

/** The 1 px divider between toolbar groups (SPEC 1.1: two --pt-hair dividers 20 px tall). */
export function ToolbarDivider() {
  return <span className="ts-tb-sep" aria-hidden="true" />;
}

/**
 * The Zoom box (SPEC 3.1 row 7; SPEC-2 0.81, 0.101, 6.1 row 27): reads Fit or the percentage,
 * the effective percent while Fit or a pinch zooms when the stage reports one; a click lists
 * the levels (Zoom in, Zoom out, Fit, 50%, 100%, 200%); a typed value from 25 to 1600 applies
 * through the editor's handle when the route wired it, else through `view.zoom`; the arrows step
 * the ladder from the effective zoom.
 */
export function ZoomBox({ control }: { control: TailControl }) {
  const shell = useEditorShell();
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const zoom = shell.settings.zoom;
  const effective = effectiveZoomPercent(zoom, shell.input.view?.zoom);
  const shown =
    zoom === 'fit' || zoom === undefined
      ? shell.input.view?.zoom === undefined
        ? 'Fit'
        : `${effective}%`
      : `${zoom}%`;
  const item = itemById('view.zoom');
  const children: ReadonlyArray<MenuItem> = item.items ?? [];
  const tip = controlTip(control, shell.platform, true);

  const applyPercent = (percent: number) => {
    const clamped = clampZoomPercent(percent);
    if (shell.input.editor?.zoomTo) {
      shell.input.editor.zoomTo(clamped / 100);
      shell.setSetting('zoom', String(clamped));
      return;
    }
    void shell.input
      .dispatch('view.zoom', { zoom: clamped / 100 })
      .then(() => shell.setSetting('zoom', String(clamped)))
      .catch((error: unknown) => shell.say(error instanceof Error ? error.message : String(error)));
  };

  const commit = () => {
    const value = typing;
    setTyping(null);
    if (value === null) return;
    const trimmed = value.trim().replace(/%$/, '').toLowerCase();
    if (trimmed === '' || trimmed === 'fit') {
      shell.runItem(itemById('view.zoom.fit'));
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return;
    applyPercent(n);
  };

  const onKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setTyping(null);
      event.currentTarget.blur();
    } else if (event.key === 'ArrowDown' && typing === null) {
      event.preventDefault();
      setOpen(true);
    } else if (event.key === 'ArrowUp' && typing !== null) {
      event.preventDefault();
      applyPercent(zoomStepFrom(Number(typing.replace(/%$/, '')) || effective, 1));
      setTyping(null);
    }
  };

  const fieldTip = tipProps(tip);
  return (
    <div
      ref={box}
      className="ts-tb-zoom"
      data-control={control.control}
      data-zoom={String(effective)}
    >
      <input
        className="ts-tb-zoom-field"
        type="text"
        value={typing ?? shown}
        aria-label="Zoom"
        aria-haspopup="menu"
        aria-expanded={open}
        data-control="view.zoom.value"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        {...fieldTip}
        onFocus={(event) => {
          fieldTip.onFocus(event);
          event.currentTarget.select();
        }}
        onChange={(event) => setTyping(event.target.value)}
        onKeyDown={(event) => {
          fieldTip.onKeyDown(event);
          onKey(event);
        }}
        onBlur={(event) => {
          fieldTip.onBlur(event);
          if (typing !== null) commit();
        }}
      />
      <button
        type="button"
        className="ts-tb-zoom-arrow"
        aria-label="Zoom levels"
        aria-haspopup="menu"
        aria-expanded={open}
        data-control="view.zoom.arrow"
        onClick={() => setOpen((on) => !on)}
        {...tipProps({
          name: 'Zoom levels',
          doc: `Fit, 50%, 100%, 200%, or type ${ZOOM_LADDER[0]} to ${ZOOM_LADDER[ZOOM_LADDER.length - 1]}`,
        })}
      >
        <Icon name="chevron-down" />
      </button>
      {open && box.current ? (
        <Menu
          items={children}
          context={shell.menuContext}
          label="Zoom"
          anchor={{ kind: 'element', element: box.current }}
          placement="below"
          returnFocusTo={box.current.querySelector('button')}
          onSelect={(chosen) => shell.runItem(chosen)}
          onClose={() => setOpen(false)}
          id="ts-menu-zoom"
        />
      ) : null}
    </div>
  );
}

export function ToolbarHead() {
  const shell = useEditorShell();
  /* a parked control leaves the head while Tools > Advanced tools is off (docs/FOCUS.md 3.1, 3.3) */
  const controls = presentControls(TOOLBAR_HEAD, shell.menuContext);
  return (
    <div className="ts-tb-head" data-control="toolbar.head">
      {controls.map((control) => {
        if (control.control === 'toolbar.zoom')
          return <ZoomBox key={control.control} control={control} />;
        if (control.control === 'toolbar.newSlide') {
          return (
            <span
              key={control.control}
              className="ts-tb-split"
              data-control="toolbar.newSlide.split"
            >
              <ToolbarButton
                control={control}
                onClick={(anchor) => shell.runControl(control, anchor)}
                className="ts-tb-split-main"
              />
              <button
                type="button"
                className="pt-ib pt-icon ts-tb ts-tb-split-arrow"
                aria-label="New slide with layout"
                aria-haspopup="menu"
                aria-expanded={shell.layoutGrid?.purpose === 'new'}
                data-control="toolbar.newSlide.arrow"
                data-menu-item="slide.applyLayout"
                onClick={(event) =>
                  shell.openLayoutGrid({
                    purpose: 'new',
                    anchor: event.currentTarget,
                    returnFocusTo: event.currentTarget,
                  })
                }
                {...tipProps({
                  name: 'New slide with layout',
                  doc: 'Pick a layout for the new slide',
                })}
              >
                <Icon name="chevron-down" />
              </button>
            </span>
          );
        }
        return (
          <ToolbarButton
            key={control.control}
            control={control}
            onClick={(anchor) => shell.runControl(control, anchor)}
            pressed={control.control === 'toolbar.search' ? shell.toolFinderOpen : undefined}
          />
        );
      })}
      <ToolbarDivider />
    </div>
  );
}
