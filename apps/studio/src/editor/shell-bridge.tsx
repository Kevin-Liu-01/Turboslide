import { useLayoutEffect, useRef, useState } from 'react';

import { createLiveAdapter } from '@turboslide/agent/window/adapter';
import type { StudioAdapter } from '@turboslide/agent/window/adapter';
import { registerStudioAutomation } from '@turboslide/agent/window/registry';
import { useEditorShell } from '@turboslide/chrome/editor-shell-context';
import type { EditorShellState } from '@turboslide/chrome/editor-shell-context';
import { usePtShell } from '@turboslide/chrome/shell-context';
import type { Author } from '@turboslide/schema/mutations';
import { authorLabel } from '@turboslide/store/store';
import { useTheme } from '@turboslide/viewer/theme';

import { exitPresentFullscreen } from '../components/presentActions';
import { useStudioSession } from '../components/useStudioSession';
import type { EditorController } from './controller';

// The shell glue of the editor, moved verbatim from routes/edit.$deckId.tsx in the round four
// split (gslides-parity SPEC-4 0.44; PP 7 row 1): the studio owner registration, the session
// bridge and the shell bridge EditorRoot mounts inside the ViewerShell.

// ---------------------------------------------------------------------------------------------
// Prerendering (gslides-parity SPEC-4 0.42; PP 5 "Prefetching the next document")

/**
 * Whether this document is a prerender Chrome made from /home's speculation rules and has not
 * been shown yet. Such a document runs its scripts, so the editor's side effects that reach the
 * server (the session attach, the room stream) wait for `prerenderingchange`; a browser without
 * the API answers false and nothing waits.
 */
export function isPrerendering(): boolean {
  if (typeof document === 'undefined') return false;
  return (document as Document & { prerendering?: boolean }).prerendering === true;
}

/**
 * Runs `start` now, or once the prerendered document is shown; returns a disposer for the case
 * where the caller unmounts before that.
 */
export function whenShown(start: () => void): () => void {
  if (!isPrerendering()) {
    start();
    return () => undefined;
  }
  const onChange = () => start();
  document.addEventListener('prerenderingchange', onChange, { once: true });
  return () => document.removeEventListener('prerenderingchange', onChange);
}

/** True once the document is shown; a prerendered document flips it on `prerenderingchange`. */
function useShown(): boolean {
  const [shown, setShown] = useState(() => !isPrerendering());
  useLayoutEffect(() => {
    if (shown) return;
    return whenShown(() => setShown(true));
  }, [shown]);
  return shown;
}

// ---------------------------------------------------------------------------------------------
// React glue

/** Registers an adapter once per owner element; later renders update the live adapter. */
function useStudioOwner(adapter: StudioAdapter, owner: HTMLElement | null): void {
  const live = useRef(createLiveAdapter(adapter));
  live.current.update(adapter);
  useLayoutEffect(() => {
    if (!owner) return;
    return registerStudioAutomation(live.current.adapter, owner);
  }, [owner]);
}

/**
 * Attaches this page to the studio's session registry (server/sessions.ts) so the hosted agent
 * surface can drive it: deck_goto_slide over /mcp runs in this page through the active owner's
 * handle (MILESTONES M4 item 1).
 */
export function SessionBridge({ deckId, author }: { deckId: string; author: Author }) {
  /* a prerendered /new attaches once shown (SPEC-4 0.42), never while hidden */
  const shown = useShown();
  useStudioSession({ deckId, author: authorLabel(author), enabled: shown });
  return null;
}

/**
 * Inside the shell: hands the shell state to the controller, keeps the active slide and the view
 * in step, takes the lease while editing (enforced against agent writes from M4), warms the
 * thumbnails once the sidebar or the grid asks for them, registers the editor and viewer owners
 * on two marker elements whose data-active flags follow Editing and Viewing, so exactly one is
 * active and the handoff fires one ready event (SPEC 7.4), and captures the editor shell's
 * snackbar and runItem for the route, which renders outside the shell's context.
 */
export function ShellBridge({
  controller,
  editing,
  api,
}: {
  controller: EditorController;
  editing: boolean;
  api: { current: EditorShellState | null };
}) {
  const shell = usePtShell();
  const editorShell = useEditorShell();
  const theme = useTheme();
  controller.attachShell(shell);
  api.current = editorShell;
  /* the editor shell's snackbar with one action (docs/PRODUCT.md 6.1; build/b6.md R10): the
     outside write's Undo and the assist accept's reach the seller through it */
  controller.attachEditorShell(editorShell);
  const [editorEl, setEditorEl] = useState<HTMLElement | null>(null);
  const [viewerEl, setViewerEl] = useState<HTMLElement | null>(null);
  useStudioOwner(controller.editorAdapter(), editorEl);
  useStudioOwner(controller.viewerAdapter(), viewerEl);
  useLayoutEffect(() => {
    controller.setActiveSlide(shell.active);
    controller.setView({ mode: shell.mode, present: shell.present });
    /* Follow stops when the tab presents (SPEC-3 4.4); the editor takes no lease since round three (0.5) */
    if (shell.present && controller.getSnapshot().following !== null) controller.unfollow();
  }, [controller, shell.active, shell.mode, shell.present, editing]);
  useLayoutEffect(() => {
    if (shell.density === 'thumbs' || shell.mode === 'grid') controller.warmThumbs(theme);
  }, [controller, shell.density, shell.mode, theme]);
  /* leaving the show leaves full screen too (SPEC 9.1: Esc leaves both) */
  useLayoutEffect(() => {
    if (!shell.present) exitPresentFullscreen();
  }, [shell.present]);
  return (
    <>
      <span
        ref={setEditorEl}
        className="ts-owner"
        data-owner="editor"
        data-active={editing ? 'true' : 'false'}
      />
      <span
        ref={setViewerEl}
        className="ts-owner"
        data-owner="viewer"
        data-active={editing ? 'false' : 'true'}
      />
    </>
  );
}
