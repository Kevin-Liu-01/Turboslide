// The CodeMirror 6 editor behind the source drawer (SPEC 6.6): JSON mode, the parse linter,
// history, the standard keys, and JSON Schema completion from the slide schema. Colors are the
// --pt- tokens only, set through EditorView.theme so the chrome's dark remap applies; the editor
// draws no border of its own (the drawer owns its top edge, SPEC 2.2 line law) and marks
// diagnostics with a text decoration rather than a border. This module is the one place the
// chrome touches CodeMirror; SourceDrawer.tsx mounts it in an effect and talks to the handle.
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import { linter, lintKeymap, setDiagnostics } from '@codemirror/lint';
import type { Diagnostic } from '@codemirror/lint';
import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

import type { Issue } from '@turboslide/schema/validate';

import type { JsonSchema } from './schema-completion';
import { rangeOfPointer, schemaCompletionSource, slideJsonSchema } from './schema-completion';

export type SourceEditorOptions = {
  text: string;
  onChange: (text: string) => void;
  /** the JSON Schema completions come from; the slide schema by default */
  schema?: JsonSchema;
  readOnly?: boolean;
  /** Cmd Enter or Ctrl Enter */
  onApply?: () => void;
};

export type SourceEditor = {
  getText: () => string;
  /** replaces the whole text; the change is one undo step */
  setText: (text: string) => void;
  /** marks validation issues at their pointers; an empty list clears them */
  setIssues: (issues: ReadonlyArray<Issue>) => void;
  setReadOnly: (readOnly: boolean) => void;
  focus: () => void;
  destroy: () => void;
};

/* The chrome's look for the editor: Inter for the gutter, the mono stack for the text, the
   tokens for every color. The gutter draws no rule beside the text (line law: no scroll region
   or gutter draws a line beside its content). */
const theme = EditorView.theme({
  '&': {
    color: 'var(--pt-ink)',
    backgroundColor: 'var(--pt-paper)',
    fontSize: '12.5px',
    height: '100%',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--pt-mono)',
    lineHeight: '1.55',
  },
  '.cm-content': { padding: '10px 0', caretColor: 'var(--pt-ink)' },
  '.cm-line': { padding: '0 14px 0 6px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--pt-ink)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'var(--pt-hair-soft)' },
  '.cm-activeLine': { backgroundColor: 'var(--pt-plate)' },
  '.cm-gutters': {
    backgroundColor: 'var(--pt-paper)',
    color: 'var(--pt-titanium)',
    border: 'none',
    fontFamily: 'var(--pt-text)',
    fontVariantNumeric: 'tabular-nums',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 6px 0 14px', minWidth: '40px' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--pt-plate)', color: 'var(--pt-ink)' },
  '.cm-matchingBracket': { backgroundColor: 'var(--pt-hair-soft)', outline: 'none' },
  '.cm-tooltip': {
    border: '1px solid var(--pt-hair)',
    backgroundColor: 'var(--pt-paper)',
    color: 'var(--pt-ink)',
    fontFamily: 'var(--pt-text)',
    fontSize: '12.5px',
    borderRadius: '0',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--pt-mono)' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--pt-ink)',
    color: 'var(--pt-paper)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete .cm-completionDetail': {
    color: 'var(--pt-titanium)',
    fontStyle: 'normal',
    marginLeft: '8px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail': {
    color: 'var(--pt-paper)',
  },
  '.cm-completionIcon': { display: 'none' },
  '.cm-tooltip .cm-completionInfo': {
    border: '1px solid var(--pt-hair)',
    backgroundColor: 'var(--pt-paper)',
    color: 'var(--pt-ink-2)',
    padding: '8px 10px',
  },
  '.cm-diagnostic': {
    borderLeft: 'none',
    padding: '6px 10px',
    fontFamily: 'var(--pt-text)',
  },
  '.cm-diagnostic-error': { borderLeft: 'none' },
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    textDecoration: 'underline dotted var(--pt-ink)',
    textUnderlineOffset: '3px',
  },
  '.cm-panels': { backgroundColor: 'var(--pt-paper)', color: 'var(--pt-ink)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--pt-hair-soft)' },
});

/* The JSON grammar's tokens on the four inks: keys in ink at weight 500, strings in ink-2, the
   literals in ink, punctuation in titanium. */
const highlight = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--pt-ink)', fontWeight: '500' },
  { tag: tags.string, color: 'var(--pt-ink-2)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--pt-ink)' },
  { tag: [tags.punctuation, tags.separator, tags.bracket], color: 'var(--pt-titanium)' },
  { tag: tags.invalid, textDecoration: 'underline dotted var(--pt-ink)' },
]);

/** An Issue's text range, or the first line when its pointer is not in the text. */
function diagnosticFor(view: EditorView, issue: Issue): Diagnostic {
  const range = rangeOfPointer(view.state, issue.pointer) ?? {
    from: 0,
    to: view.state.doc.line(1).to,
  };
  return {
    from: range.from,
    to: Math.max(range.to, range.from),
    severity: issue.severity === 3 ? 'error' : issue.severity === 2 ? 'warning' : 'info',
    message: issue.pointer === '' ? issue.message : `${issue.pointer}: ${issue.message}`,
    source: 'validateSlide',
  };
}

/** Mounts the editor into `parent` and returns its handle. */
export function createSourceEditor(
  parent: HTMLElement,
  options: SourceEditorOptions,
): SourceEditor {
  const readOnly = new Compartment();
  const state = EditorState.create({
    doc: options.text,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      indentOnInput(),
      indentUnit.of('  '),
      EditorState.tabSize.of(2),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      EditorView.lineWrapping,
      json(),
      linter(jsonParseLinter()),
      autocompletion({ override: [schemaCompletionSource(options.schema ?? slideJsonSchema())] }),
      syntaxHighlighting(highlight),
      theme,
      readOnly.of(EditorState.readOnly.of(options.readOnly ?? false)),
      keymap.of([
        ...(options.onApply
          ? [
              {
                key: 'Mod-Enter',
                run: () => {
                  options.onApply?.();
                  return true;
                },
              },
            ]
          : []),
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...completionKeymap,
        ...lintKeymap,
        indentWithTab,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) options.onChange(update.state.doc.toString());
      }),
    ],
  });
  const view = new EditorView({ state, parent });
  return {
    getText: () => view.state.doc.toString(),
    setText(text) {
      const current = view.state.doc.toString();
      if (current === text) return;
      view.dispatch({ changes: { from: 0, to: current.length, insert: text } });
    },
    setIssues(issues) {
      view.dispatch(
        setDiagnostics(
          view.state,
          issues.map((issue) => diagnosticFor(view, issue)),
        ),
      );
    },
    setReadOnly(value) {
      view.dispatch({ effects: readOnly.reconfigure(EditorState.readOnly.of(value)) });
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
