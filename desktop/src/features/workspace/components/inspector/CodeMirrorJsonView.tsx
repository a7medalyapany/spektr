import { json } from "@codemirror/lang-json";
import { Compartment, EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { memo, useEffect, useRef } from "react";

const editableCompartment = new Compartment();
const languageCompartment = new Compartment();

const baseExtensions = [
  lineNumbers(),
  drawSelection(),
  highlightActiveLine(),
  EditorView.lineWrapping,
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
  keymap.of([]),
  oneDark,
  EditorView.theme({
    "&": {
      backgroundColor: "transparent",
      color: "var(--text-primary)",
      fontFamily: '"SF Mono", "JetBrains Mono", "IBM Plex Mono", monospace',
      fontSize: "11px",
      height: "100%",
    },
    ".cm-scroller": {
      fontFamily: "inherit",
      overflow: "auto",
    },
    ".cm-gutters": {
      backgroundColor: "rgba(255,255,255,0.02)",
      borderRight: "1px solid rgba(255,255,255,0.08)",
      color: "var(--text-tertiary)",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(255,255,255,0.03)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(255,255,255,0.03)",
    },
    ".cm-content": {
      padding: "12px 0",
    },
    ".cm-line": {
      padding: "0 16px",
    },
    ".cm-focused": {
      outline: "none",
    },
    ".cm-selectionBackground": {
      backgroundColor: "rgba(139,184,255,0.22) !important",
    },
  }),
  editableCompartment.of([]),
  languageCompartment.of(json()),
];

interface CodeMirrorJsonViewProps {
  document: string;
}

export const CodeMirrorJsonView = memo(function CodeMirrorJsonView({
  document,
}: CodeMirrorJsonViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const view = new EditorView({
      doc: document,
      extensions: baseExtensions,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const currentDoc = view.state.doc.toString();
    if (currentDoc === document) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: currentDoc.length,
        insert: document,
      },
    });
  }, [document]);

  return <div className="min-h-0 flex-1 overflow-hidden" ref={containerRef} />;
});
