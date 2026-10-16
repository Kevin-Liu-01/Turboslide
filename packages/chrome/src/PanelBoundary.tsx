import { Component, Fragment } from 'react';
import type { ReactNode } from 'react';

import { Dialog } from './Dialog';
import { cn } from './lib/cn';
import { tipProps } from './Tooltip';

import './PanelBoundary.css';

export const PANEL_BROKEN = 'This panel stopped working.';
export const RELOAD_PANEL = 'Reload Panel';

export type PanelBoundaryProps = {
  /** the frame the sentence is drawn in: the filmstrip's column, the right panel or a dialog card */
  place: 'filmstrip' | 'panel' | 'dialog';
  /** the data-control id of the drawn sentence */
  control: string;
  onError?: (error: unknown) => void;
  /** a dialog's close, so a dialog that fails again can still be dismissed */
  onClose?: () => void;
  children?: ReactNode;
};

type PanelBoundaryState = { failed: boolean; mount: number };

/**
 * The error boundary of the filmstrip, the side panel and each dialog (hardening HR-O#7,
 * RELIABILITY-23; docs/hardening/HARDENING.md 4.8). Before it one render error in any of them
 * reached the route's boundary and replaced the whole editor. Now the error is drawn in place as
 * "This panel stopped working." with Reload Panel, which mounts the children again, and it is
 * reported through `onError` (the studio passes the HR-O#2a reporter). The stage keeps the
 * route's boundary. React requires a class component for an error boundary.
 */
export class PanelBoundary extends Component<PanelBoundaryProps, PanelBoundaryState> {
  override state: PanelBoundaryState = { failed: false, mount: 0 };

  static getDerivedStateFromError(): Partial<PanelBoundaryState> {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    try {
      this.props.onError?.(error);
    } catch {
      // a report never raises the error it reports
    }
  }

  private readonly reload = (): void => {
    this.setState((state) => ({ failed: false, mount: state.mount + 1 }));
  };

  override render(): ReactNode {
    const { place, control, onClose, children } = this.props;
    if (!this.state.failed) return <Fragment key={this.state.mount}>{children}</Fragment>;
    if (place === 'dialog') {
      return (
        <Dialog
          title={PANEL_BROKEN}
          control={control}
          onClose={onClose ?? this.reload}
          actions={[
            {
              label: RELOAD_PANEL,
              onClick: this.reload,
              primary: true,
              doc: 'Draws this dialog again',
              control: `${control}.reload`,
            },
          ]}
        />
      );
    }
    return (
      <aside
        className={cn(
          'ts-panel-broken ts-chrome',
          place === 'filmstrip' ? 'pt-sb is-edit' : 'ts-panel',
        )}
        role="alert"
        data-control={control}
      >
        <p className="ts-panel-broken-text">{PANEL_BROKEN}</p>
        <button
          type="button"
          className="pt-ib is-text"
          data-control={`${control}.reload`}
          onClick={this.reload}
          {...tipProps({ name: RELOAD_PANEL, doc: 'Draws this panel again' })}
        >
          <span className="pt-lb">{RELOAD_PANEL}</span>
        </button>
      </aside>
    );
  }
}
