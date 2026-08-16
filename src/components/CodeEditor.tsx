import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { keymap, ViewPlugin, Decoration, DecorationSet, ViewUpdate } from '@codemirror/view';
import { search, setSearchQuery, getSearchQuery, SearchQuery, findNext, findPrevious, replaceNext, replaceAll } from '@codemirror/search';
import { Search as SearchIcon, ChevronUp, ChevronDown, X } from 'lucide-react';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { java } from '@codemirror/lang-java';
import { csharp } from '@replit/codemirror-lang-csharp';

interface CodeEditorProps {
  content: string;
  language: string;
  onChange: (content: string) => void;
  onSave: () => void;
}

function getExtensions(language: string, onSave: () => void, onChange: (c: string) => void, onEditorUpdate: (view: EditorView) => void) {
  const ext: any[] = [
    basicSetup,
    search({ top: true }),
    findHighlightExtension(),
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
      '.cm-searchMatch': {
        backgroundColor: 'rgba(192,132,252,.25)',
        outline: '1px solid rgba(192,132,252,.5)',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'rgba(192,132,252,.45)',
        outline: '1px solid #c084fc',
      },
    }),
  ];

  switch (language) {
    case 'python': ext.push(python()); break;
    case 'javascript': case 'typescript': ext.push(javascript({ typescript: language === 'typescript' })); break;
    case 'json': ext.push(json()); break;
    case 'css': ext.push(css()); break;
    case 'html': ext.push(html()); break;
    case 'java': ext.push(java()); break;
    case 'csharp': ext.push(csharp()); break;
  }

  // El find bar propio se abre con Mod-b (libre en CodeMirror); Ctrl+f/g quedan
  // en manos de los atajos nativos (que navegan sobre las coincidencias sin panel).
  ext.push(keymap.of([
    { key: 'Mod-s', run: () => { onSave(); return true; } },
  ]));

  ext.push(EditorView.updateListener.of((update) => {
    if (update.docChanged || update.selectionSet) {
      onEditorUpdate(update.view);
    }
    if (update.docChanged) {
      onChange(update.state.doc.toString());
    }
  }));

  return ext;
}

const matchMark = Decoration.mark({ class: 'cm-searchMatch' });
const selectedMatchMark = Decoration.mark({ class: 'cm-searchMatch cm-searchMatch-selected' });

function findHighlightExtension() {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.compute(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged || update.selectionSet || update.viewportChanged ||
        update.transactions.some((tr) => tr.effects.some((e) => e.is(setSearchQuery)))
      ) {
        this.decorations = this.compute(update.view);
      }
    }
    compute(view: EditorView) {
      const q = getSearchQuery(view.state);
      if (!q.search || !q.valid) return Decoration.none;
      const builder = new RangeSetBuilder<Decoration>();
      const main = view.state.selection.main;
      for (const { from, to } of view.visibleRanges) {
        const cursor = q.getCursor(view.state.doc, from, to);
        let r = cursor.next();
        while (!r.done) {
          const { from: mf, to: mt } = r.value;
          const selected = main.from === mf && main.to === mt;
          builder.add(mf, mt, selected ? selectedMatchMark : matchMark);
          r = cursor.next();
        }
      }
      return builder.finish();
    }
  }, {
    decorations: (v: { decorations: DecorationSet }) => v.decorations,
  });
}

export function CodeEditor({ content, language, onChange, onSave }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const findInputRef = useRef<HTMLInputElement>(null);

  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [replace, setReplace] = useState('');
  const [matchInfo, setMatchInfo] = useState<{ current: number; total: number } | null>(null);

  const findOpenRef = useRef(findOpen);
  findOpenRef.current = findOpen;
  const queryRef = useRef(query);
  queryRef.current = query;

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  const updateMatchInfo = useCallback((view: EditorView) => {
    const q = getSearchQuery(view.state);
    if (!q.search) {
      setMatchInfo(null);
      return;
    }
    const ranges: { from: number; to: number }[] = [];
    const cursor = q.getCursor(view.state.doc);
    let r = cursor.next();
    while (!r.done) {
      ranges.push({ from: r.value.from, to: r.value.to });
      r = cursor.next();
    }
    const selFrom = view.state.selection.main.from;
    let idx = ranges.findIndex(r => r.from <= selFrom && selFrom <= r.to);
    if (idx < 0) idx = 0;
    setMatchInfo(ranges.length ? { current: idx + 1, total: ranges.length } : null);
  }, []);

  const openFind = useCallback(() => {
    setFindOpen(true);
    requestAnimationFrame(() => findInputRef.current?.focus());
  }, []);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setQuery('');
    setReplace('');
    setMatchInfo(null);
    const view = viewRef.current;
    if (view) {
      view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '', caseSensitive: false, regexp: false })) });
      view.focus();
    }
  }, []);

  const doFindNext = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!findOpenRef.current) {
      openFind();
      return;
    }
    findNext(view);
    updateMatchInfo(view);
  }, [openFind, updateMatchInfo]);

  const doFindPrev = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!findOpenRef.current) {
      openFind();
      return;
    }
    findPrevious(view);
    updateMatchInfo(view);
  }, [openFind, updateMatchInfo]);

  const onQueryChange = useCallback((q: string) => {
    setQuery(q);
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: q, caseSensitive: false, regexp: false })) });
    updateMatchInfo(view);
  }, [updateMatchInfo]);

  const doReplaceNext = useCallback(() => {
    const view = viewRef.current;
    if (!view || !queryRef.current) return;
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: queryRef.current, caseSensitive: false, regexp: false, replace })) });
    replaceNext(view);
    updateMatchInfo(view);
  }, [replace, updateMatchInfo]);

  const doReplaceAll = useCallback(() => {
    const view = viewRef.current;
    if (!view || !queryRef.current) return;
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: queryRef.current, caseSensitive: false, regexp: false, replace })) });
    replaceAll(view);
    updateMatchInfo(view);
  }, [replace, updateMatchInfo]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && !e.shiftKey && key === 'b') {
        e.preventDefault();
        openFind();
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openFind]);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: content,
      extensions: getExtensions(
        language,
        () => onSaveRef.current(),
        (c: string) => onChangeRef.current(c),
        (view: EditorView) => { if (findOpenRef.current) updateMatchInfo(view); },
      ),
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [language, updateMatchInfo]);

  return (
    <div className="flex flex-col h-full">
      {findOpen && (
        <div data-findbar className="flex-shrink-0" style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-base)' }}>
          <div className="flex items-center gap-2 px-3 py-1.5">
            <SearchIcon size={13} className="text-muted flex-shrink-0" />
            <input
              ref={findInputRef}
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) doFindPrev();
                  else doFindNext();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  closeFind();
                }
              }}
              placeholder="Buscar en el archivo..."
              className="flex-1 min-w-0 bg-transparent text-xs outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
            {matchInfo && (
              <span className="text-[10px] text-muted flex-shrink-0 font-mono">
                {matchInfo.current}/{matchInfo.total}
              </span>
            )}
            <button onClick={doFindPrev} title="Anterior (Shift+Enter)" className="p-0.5 rounded hover:bg-hover transition-colors text-muted flex-shrink-0">
              <ChevronUp size={14} />
            </button>
            <button onClick={doFindNext} title="Siguiente (Enter)" className="p-0.5 rounded hover:bg-hover transition-colors text-muted flex-shrink-0">
              <ChevronDown size={14} />
            </button>
            <button onClick={closeFind} title="Cerrar (Esc)" className="p-0.5 rounded hover:bg-hover transition-colors text-muted flex-shrink-0">
              <X size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5" style={{ borderTop: '1px solid var(--border-color)' }}>
            <span className="flex-shrink-0" style={{ width: 13 }} />
            <input
              value={replace}
              onChange={e => setReplace(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) doReplaceAll();
                  else doReplaceNext();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  closeFind();
                }
              }}
              placeholder="Reemplazar..."
              className="flex-1 min-w-0 bg-transparent text-xs outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
            <button
              onClick={doReplaceNext}
              className="text-[10px] px-2 py-0.5 rounded font-medium transition-colors flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              Reemplazar
            </button>
            <button
              onClick={doReplaceAll}
              className="text-[10px] px-2 py-0.5 rounded font-medium transition-colors flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              Todo
            </button>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="h-full overflow-auto"
        style={{ fontSize: '13px' }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && findOpenRef.current) {
            e.preventDefault();
            e.stopPropagation();
            closeFind();
          }
        }}
      />
    </div>
  );
}
