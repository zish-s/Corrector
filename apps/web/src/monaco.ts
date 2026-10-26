import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

(self as unknown as { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

monaco.editor.defineTheme("corrector-ink", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "7f8ea8", fontStyle: "italic" },
    { token: "keyword", foreground: "c4b5fd" },
    { token: "string", foreground: "7ff5e3" },
    { token: "number", foreground: "fbbf24" },
    { token: "type", foreground: "93c5fd" },
    { token: "identifier", foreground: "e8eefb" },
  ],
  colors: {
    "editor.background": "#080d16",
    "editor.foreground": "#e8eefb",
    "editorLineNumber.foreground": "#52627e",
    "editorLineNumber.activeForeground": "#c4b5fd",
    "editor.lineHighlightBackground": "#0f1a2b",
    "editor.selectionBackground": "#1f3b55",
    "editorCursor.foreground": "#5eead4",
    "editorIndentGuide.background1": "#1a263a",
    "editorIndentGuide.activeBackground1": "#2a3b58",
    "editorWidget.background": "#0d1421",
    "editorSuggestWidget.background": "#0d1421",
    "scrollbarSlider.background": "#2a3b5877",
    "scrollbarSlider.hoverBackground": "#3a4d7088",
  },
});

export { monaco };
