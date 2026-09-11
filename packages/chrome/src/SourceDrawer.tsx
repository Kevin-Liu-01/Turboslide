import { useEffect, useRef, useState } from 'react';

import type { Slide } from '@turboslide/schema/deck';
import type { Issue } from '@turboslide/schema/validate';

import type { EditorDispatch } from './dispatch';
import { cn } from './lib/cn';
import { applySourceText, slidePutCommand, slideSource } from './source/apply';
import type { ApplySourceResult } from './source/apply';
import type { SourceEditor } from './source/editor';
import { createSourceEditor } from './source/editor';
import { ToolButton } from './ToolButton';

import './SourceDrawer.css';

/**
 * The source drawer (SPEC 6.6): the selected slide's JSON in CodeMirror 6 with JSON Schema
 * completion, sliding up over the stage beside the live sheet, with Apply, Reset, Copy, Copy as
 * turboslide command and Close. Apply runs the validator, marks issues at their pointers in the
 * text and commits one slide.replace with the current baseRevision through the dispatcher; the
 * mutation log of what changed shows beside the text. Apply and an agent's applySource are one
 * code path (source/apply.ts): the drawer offers `registerOwner` the same function, so the
 * window API can register it as a delegating owner (SPEC 7.4). Through the owner api a refused
 * source rejects (TypeError carrying the issues, or the write's own error) and a call while an
 * earlier apply is still writing rejects too, so an agent never sees a resolved promise with
 * nothing written; the button renders the same outcome instead. An external write to the slide
 * while the draft is dirty shows the external revision banner with the author and a Reload
 * action; the designer's unsaved text is never replaced silently. Lines: the drawer's top edge
 * in --pt-hair (the stage draws no bottom edge), the head's rule under itself in --pt-hair-soft,
 * the side column's left edge in --pt-hair-soft; the drawer covers the progress track while open.
 */
export type SourceOwnerApi = {
  /** the slide the drawer replaces; a source naming another slide is refused */
  slideId: string;
  getSource: () => string;
  /** the Apply path; rejects when the source is refused or the write fails, never silently */
  applySource: (source: string | object) => Promise<void>;
};

export type SourceDrawerProps = {
  open: boolean;
  slide: Slide;
  revision: number;
  dispatch: EditorDispatch;
  onClose: () => void;
  /** the deck id, for the command Copy as turboslide command writes */
  deckId: string;
  /** who moved the slide from outside while the draft was dirty (the store's watch channel) */
  external?: { revision: number; author: string } | null;
  /** the window API's registration; the drawer registers on mount and on every slide change */
  registerOwner?: (owner: HTMLElement, api: SourceOwnerApi) => () => void;
  onNotice?: (message: string) => void;
  className?: string;
};

type Baseline = { slideId: string; text: string; revision: number };

export function SourceDrawer({
  open,
  slide,
  revision,
  dispatch,
  onClose,
  deckId,
  external,
  registerOwner,
  onNotice,
  className,
}: SourceDrawerProps) {
  const incoming = slideSource(slide);
  const [baseline, setBaseline] = useState<Baseline>({
    slideId: slide.id,
    text: incoming,
    revision,
  });
  const [draft, setDraft] = useState(incoming);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const editor = useRef<SourceEditor | null>(null);

  const dirty = draft !== baseline.text;
  /* the slide moved under a dirty draft: the banner, never a silent replacement */
  const moved = dirty && (incoming !== baseline.text || slide.id !== baseline.slideId);

  const reset = (text: string, at: number) => {
    setBaseline({ slideId: slide.id, text, revision: at });
    setDraft(text);
    setIssues([]);
    editor.current?.setText(text);
    editor.current?.setIssues([]);
  };

  /* a clean draft follows the document: a new slide or a write from the inspector replaces
     the text; a dirty draft keeps it and shows the banner instead */
  if (!dirty && (incoming !== baseline.text || slide.id !== baseline.slideId)) {
    reset(incoming, revision);
  } else if (!dirty && revision !== baseline.revision) {
    setBaseline({ slideId: slide.id, text: baseline.text, revision });
  }

  /**
   * The Apply path for the button, the editor's keymap and the owner api: validates, writes one
   * slide.replace and renders the outcome. Returns the result, or 'busy' while an earlier apply
   * is still writing; a write that throws is rendered as an issue and rethrown, so an agent's
   * call rejects with the store's own error while the UI callers drop the rejection.
   */
  const apply = async (source: string | object): Promise<ApplySourceResult | 'busy'> => {
    if (busy) return 'busy';
    setBusy(true);
    try {
      const result = await applySourceText({
        source,
        slideId: slide.id,
        before: slide,
        revision,
        dispatch,
      });
      if (!result.ok) {
        setIssues(result.issues);
        setLog([]);
        editor.current?.setIssues(result.issues);
        onNotice?.(
          `${result.issues.length} issue${result.issues.length === 1 ? '' : 's'} in the source`,
        );
        return result;
      }
      const text = slideSource(result.slide);
      setBaseline({ slideId: result.slide.id, text, revision: result.revision });
      setDraft(text);
      setIssues([]);
      setLog(result.log.length > 0 ? result.log : ['No change']);
      editor.current?.setText(text);
      editor.current?.setIssues([]);
      onNotice?.(
        result.mutations.length === 0
          ? 'Applied: no change'
          : `Applied ${result.mutations.length} mutation${result.mutations.length === 1 ? '' : 's'} at r${result.revision}`,
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setIssues([
        { code: 'invalid', severity: 3, file: `slides/${slide.id}.json`, pointer: '', message },
      ]);
      onNotice?.(message);
      throw error;
    } finally {
      setBusy(false);
    }
  };

  /* the latest apply and draft for the editor's keymap and the owner registration */
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  /* the button's and the keymap's Apply: the outcome is on screen, so the rejection is dropped */
  const applyFromUi = (source: string) => {
    void applyRef.current(source).catch(() => undefined);
  };

  /* the editor mounts with the drawer and leaves with it; the DOM needs it, so an effect */
  useEffect(() => {
    const el = host.current;
    if (!open || !el) return;
    const created = createSourceEditor(el, {
      text: draftRef.current,
      onChange: (text) => setDraft(text),
      onApply: () => applyFromUi(editor.current?.getText() ?? draftRef.current),
    });
    editor.current = created;
    created.focus();
    return () => {
      created.destroy();
      editor.current = null;
    };
  }, [open]);

  /* the delegating owner: registered while the drawer is open, re-registered when the slide changes */
  useEffect(() => {
    const el = root.current;
    if (!open || !el || !registerOwner) return;
    return registerOwner(el, {
      slideId: slide.id,
      getSource: () => editor.current?.getText() ?? draftRef.current,
      applySource: async (source) => {
        const outcome = await applyRef.current(source);
        if (outcome === 'busy') {
          throw new Error('The source drawer is still applying an earlier change');
        }
        if (!outcome.ok) {
          throw new TypeError(
            outcome.issues.map((row) => `${row.pointer || '/'}: ${row.message}`).join('; '),
          );
        }
      },
    });
  }, [open, registerOwner, slide.id]);

  if (!open) return null;

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotice?.(done);
    } catch {
      onNotice?.('The clipboard is not available here');
    }
  };

  return (
    <aside
      ref={root}
      className={cn('ts-drawer ts-chrome', dirty && 'is-dirty', className)}
      aria-label={`Source of slide ${slide.id}`}
      data-control="source.drawer"
      data-slide={slide.id}
      data-dirty={dirty ? 'true' : 'false'}
    >
      <div className="ts-drawer-head">
        <b className="ts-drawer-title">
          slides/{slide.id}.json
          <span className="ts-drawer-rev">r{baseline.revision}</span>
          {dirty ? <span className="ts-drawer-dirty">edited</span> : null}
        </b>
        <div className="ts-drawer-tools">
          <ToolButton
            label="Apply"
            title="Validate and replace the slide (Cmd Enter)"
            ariaLabel="Apply source"
            pressed={dirty}
            className="ts-drawer-apply"
            control="source.apply"
            onClick={() => applyFromUi(editor.current?.getText() ?? draft)}
          />
          <ToolButton
            label="Reset"
            title="Discard the edits and show the document again"
            ariaLabel="Reset source"
            control="source.reset"
            onClick={() => reset(incoming, revision)}
          />
          <ToolButton
            label="Copy"
            title="Copy the JSON"
            ariaLabel="Copy source"
            control="source.copy"
            onClick={() => {
              void copy(editor.current?.getText() ?? draft, 'Source copied');
            }}
          />
          <ToolButton
            label="Copy as command"
            title="Copy a turboslide slide put command that applies this JSON"
            ariaLabel="Copy as turboslide command"
            control="source.copyCommand"
            onClick={() => {
              void copy(
                slidePutCommand(deckId, slide.id, revision, editor.current?.getText() ?? draft),
                'Command copied',
              );
            }}
          />
          <ToolButton
            icon="close"
            title="Close the source drawer (Cmd /)"
            ariaLabel="Close the source drawer"
            control="source.close"
            onClick={onClose}
          />
        </div>
      </div>
      {moved ? (
        <div className="ts-drawer-banner" role="status">
          <span>
            {external?.author ?? 'Another author'} changed this slide at r
            {external?.revision ?? revision} while you were editing. Your text is kept; Reload
            replaces it with theirs.
          </span>
          <ToolButton
            label="Reload"
            title="Replace the draft with the document as it is now"
            ariaLabel="Reload the source"
            control="source.reload"
            onClick={() => reset(incoming, revision)}
          />
        </div>
      ) : null}
      <div className="ts-drawer-body">
        <div ref={host} className="ts-drawer-editor" data-control="source.text" />
        <div className="ts-drawer-side pt-scroll">
          {issues.length > 0 ? (
            <>
              <h4>Issues</h4>
              <ul className="ts-drawer-issues">
                {issues.map((issue, index) => (
                  <li key={`${issue.pointer}-${index}`}>
                    <code>{issue.pointer === '' ? '/' : issue.pointer}</code> {issue.message}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {log.length > 0 && issues.length === 0 ? (
            <>
              <h4>Applied</h4>
              <ol className="ts-drawer-log" data-control="source.log">
                {log.map((line, index) => (
                  <li key={`${line}-${index}`}>{line}</li>
                ))}
              </ol>
            </>
          ) : null}
          {issues.length === 0 && log.length === 0 ? (
            <p className="ts-drawer-note">
              Edit the JSON and press Apply. The validator marks issues in the text; the mutations
              of an applied change are listed here.
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
