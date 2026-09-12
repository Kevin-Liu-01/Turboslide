// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectCard, connectCommands } from '../ConnectCard';
import { ExportMenu } from '../ExportMenu';

// The Connect card (docs/deck-transfer.md): the two commands carry the deployment URL and the deck
// id, the token flag appears only when the deployment requires a bearer, Copy writes the command
// to the clipboard and says so, and the Export menu shows Download deck bundle only when the route
// hands it a handler.

afterEach(cleanup);

describe('ConnectCard', () => {
  it('fills the URL and the deck id into both commands and names the token only when required', () => {
    const open = connectCommands('https://turboslide.vercel.app', 'gt-brand', false);
    expect(open.push).toBe('turboslide deck push gt-brand --to https://turboslide.vercel.app');
    expect(open.pull).toBe('turboslide deck pull gt-brand --from https://turboslide.vercel.app');
    const gated = connectCommands('https://turboslide.vercel.app', 'gt-brand', true);
    expect(gated.push).toContain('--token <TURBOSLIDE_TOKEN>');
    const { container } = render(
      <ConnectCard url="https://turboslide.vercel.app" tokenRequired deckId="gt-brand" />,
    );
    expect(container.querySelector('[data-control="connect.push"]')?.textContent).toBe(gated.push);
    expect(container.querySelector('[data-control="connect.pull"]')?.textContent).toBe(gated.pull);
    expect(container.querySelector('[data-control="connect.note"]')?.textContent).toMatch(
      /hosts\.json/,
    );
    const placeholder = render(<ConnectCard url="http://localhost:4321" tokenRequired={false} />);
    expect(placeholder.container.querySelector('[data-control="connect.push"]')?.textContent).toBe(
      'turboslide deck push <deck-id> --to http://localhost:4321',
    );
    expect(
      placeholder.container.querySelector('[data-control="connect.note"]')?.textContent,
    ).toMatch(/no bearer token/);
  });

  it('copies a command to the clipboard and reports it on the button', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { container } = render(
      <ConnectCard url="https://turboslide.vercel.app" tokenRequired={false} deckId="q4" />,
    );
    const copy = container.querySelector<HTMLButtonElement>('[data-control="connect.copy.pull"]');
    expect(copy?.getAttribute('title')).toMatch(/Copy the pull command/);
    fireEvent.click(copy!);
    await waitFor(() => expect(copy?.textContent).toBe('Copied'));
    expect(writeText).toHaveBeenCalledWith(
      'turboslide deck pull q4 --from https://turboslide.vercel.app',
    );
  });
});

describe('ExportMenu bundle entry', () => {
  it('shows Download deck bundle only with a handler and calls it', () => {
    const onDownloadBundle = vi.fn();
    const props = {
      open: true,
      onOpenChange: () => {},
      capabilities: { downloads: true, worker: 'local' as const },
      progress: null,
      onExport: () => {},
      onBuild: () => {},
    };
    const without = render(<ExportMenu {...props} />);
    expect(without.container.querySelector('[data-control="export.bundle"]')).toBeNull();
    cleanup();
    const { container } = render(<ExportMenu {...props} onDownloadBundle={onDownloadBundle} />);
    const button = container.querySelector<HTMLButtonElement>('[data-control="export.bundle"]');
    expect(button?.textContent).toBe('Download deck bundle');
    /* the chrome's tooltip, never a native title (Tooltip.tsx) */
    expect(button?.getAttribute('data-tip')).toBe('Download deck bundle');
    expect(button?.hasAttribute('title')).toBe(false);
    fireEvent.click(button!);
    expect(onDownloadBundle).toHaveBeenCalledTimes(1);
  });
});
