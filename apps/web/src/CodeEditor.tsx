import { useEffect, useRef } from "react";
import { monaco } from "./monaco";

interface CodeEditorProps {
  value: string;
  language: "cpp" | "python";
  onChange: (value: string) => void;
}

export function CodeEditor({ value, language, onChange }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const suppressRef = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const editor = monaco.editor.create(host, {
      value,
      language,
      theme: "corrector-ink",
      automaticLayout: true,
      fontFamily:
        '"JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace',
      fontSize: 13,
      lineHeight: 22,
      padding: { top: 14, bottom: 14 },
      minimap: { enabled: false },
      glyphMargin: false,
      folding: false,
      renderLineHighlight: "line",
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      tabSize: 4,
      insertSpaces: true,
      wordWrap: "off",
      overviewRulerBorder: false,
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
    });

    editorRef.current = editor;
    const disposable = editor.onDidChangeModelContent(() => {
      if (!suppressRef.current) onChangeRef.current(editor.getValue());
    });

    return () => {
      disposable.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // The editor is created once; value and language are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.getValue() === value) return;
    suppressRef.current = true;
    editor.setValue(value);
    suppressRef.current = false;
  }, [value]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model) monaco.editor.setModelLanguage(model, language);
  }, [language]);

  return <div className="code-host" ref={hostRef} aria-label="Code editor" />;
}
