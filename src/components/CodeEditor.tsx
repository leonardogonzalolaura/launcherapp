import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';

interface CodeEditorProps {
  content: string;
  language: string;
  onChange: (content: string) => void;
  onSave: () => void;
}

function getExtensions(language: string, onSave: () => void, onChange: (c: string) => void) {
  const ext: any[] = [
    basicSetup,
    EditorView.theme({
      '&': { backgroundColor: 'transparent', height: '100%' },
      '.cm-gutters': {
        backgroundColor: 'var(--bg-base)',
        borderRight: '1px solid var(--border-color)',
        color: 'var(--text-muted)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--bg-hover)',
      },
      '.cm-activeLine': {
        backgroundColor: 'transparent',
      },
      '.cm-cursor': {
        borderLeftColor: 'var(--text-primary)',
      },
      '.cm-content': {
        caretColor: 'var(--text-primary)',
      },
      '.cm-selectionBackground': {
        backgroundColor: 'var(--bg-selected) !important',
      },
      '.cm-selectionMatch': {
        backgroundColor: 'var(--bg-hover) !important',
      },
    }),
  ];

  switch (language) {
    case 'python': ext.push(python()); break;
    case 'javascript': case 'typescript': ext.push(javascript({ typescript: language === 'typescript' })); break;
    case 'json': ext.push(json()); break;
  }

  ext.push(keymap.of([
    { key: 'Mod-s', run: () => { onSave(); return true; } },
  ]));

  ext.push(EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      onChange(update.state.doc.toString());
    }
  }));

  return ext;
}

export function CodeEditor({ content, language, onChange, onSave }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: content,
      extensions: getExtensions(
        language,
        () => onSaveRef.current(),
        (c: string) => onChangeRef.current(c),
      ),
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [language]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto"
      style={{ fontSize: '13px' }}
    />
  );
}
