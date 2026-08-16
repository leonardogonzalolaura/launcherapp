import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, RangeSetBuilder, StateField, StateEffect } from '@codemirror/state';
import { keymap, ViewPlugin, Decoration, DecorationSet, ViewUpdate, hoverTooltip } from '@codemirror/view';
import { search, setSearchQuery, getSearchQuery, SearchQuery, findNext, findPrevious, replaceNext, replaceAll } from '@codemirror/search';
import { Search as SearchIcon, ChevronUp, ChevronDown, X } from 'lucide-react';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { java } from '@codemirror/lang-java';
import { csharp } from '@replit/codemirror-lang-csharp';
import type { Parser } from '@lezer/common';
import { isNavLanguage, tokenAt, getImportInfo, findDefinitionLine, resolveImport, findFileByTypeName, hasCachedFile, memberReceiverName, findMethodTarget } from '../util/editorNav';
import { editorThemeExtensions, type EditorTheme } from '../util/editorThemes';

interface CodeEditorProps {
  content: string;
  language: string;
  projectPath: string;
  filePath: string;
  initialLine?: number;
  editorTheme?: EditorTheme;
  onChange: (content: string) => void;
  onSave: () => void;
  onOpenFile: (path: string, line?: number) => void;
  onConsumedNav?: () => void;
}

interface NavContext {
  projectPath: string;
  filePath: string;
  parser: Parser;
  onOpenFile: (path: string, line?: number) => void;
}

function getLanguageParser(language: string): Parser | null {
  switch (language) {
    case 'python': return python().language.parser;
    case 'javascript': case 'typescript': return javascript({ typescript: language === 'typescript', jsx: true }).language.parser;
    case 'java': return java().language.parser;
    case 'csharp': return csharp().language.parser;
    default: return null;
  }
}

function buildTooltipDom(title: string, hint: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.backgroundColor = 'var(--bg-elevated)';
  wrap.style.border = '1px solid var(--border-color)';
  wrap.style.borderRadius = '8px';
  wrap.style.padding = '6px 10px';
  wrap.style.fontSize = '11px';
  wrap.style.boxShadow = '0 4px 12px rgba(0,0,0,.35)';
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.gap = '3px';
  const t = document.createElement('span');
  t.textContent = title;
  t.style.color = 'var(--text-primary)';
  t.style.fontWeight = '600';
  const h = document.createElement('span');
  h.textContent = hint;
  h.style.color = 'var(--text-muted)';
  h.style.fontSize = '10px';
  wrap.appendChild(t);
  wrap.appendChild(h);
  return wrap;
}

const ctrlHoverMark = Decoration.mark({ class: 'cm-ctrl-link' });
const setCtrlHover = StateEffect.define<{ from: number; to: number } | null>();

const ctrlHoverField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setCtrlHover)) {
        deco = e.value == null ? Decoration.none : Decoration.set([ctrlHoverMark.range(e.value.from, e.value.to)]);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function ctrlHoverExtension(language: string, projectPath: string) {
  return [
    ctrlHoverField,
    ViewPlugin.fromClass(class {
      ctrlDown = false;
      mouseX = 0;
      mouseY = 0;
      lastKey: string | null = null;

      constructor(private view: EditorView) {
        view.contentDOM.addEventListener('mousemove', this.onMouseMove);
        view.contentDOM.addEventListener('mouseleave', this.onMouseLeave);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onBlur);
      }

      destroy() {
        this.view.contentDOM.removeEventListener('mousemove', this.onMouseMove);
        this.view.contentDOM.removeEventListener('mouseleave', this.onMouseLeave);
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('blur', this.onBlur);
      }

      onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Control' || e.key === 'Meta') {
          this.ctrlDown = true;
          this.refresh();
        }
      };
      onKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Control' || e.key === 'Meta') {
          this.ctrlDown = false;
          this.setTarget(null);
        }
      };
      onBlur = () => {
        this.ctrlDown = false;
        this.setTarget(null);
      };

      onMouseMove = (e: MouseEvent) => {
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
        this.refresh();
      };
      onMouseLeave = () => {
        this.setTarget(null);
      };

      private setTarget(target: { from: number; to: number } | null) {
        const key = target ? `${target.from}:${target.to}` : '';
        if (key === this.lastKey) return;
        this.lastKey = key;
        this.view.dispatch({ effects: setCtrlHover.of(target) });
      }

      private refresh() {
        if (!this.ctrlDown) return;
        const view = this.view;
        const pos = view.posAtCoords({ x: this.mouseX, y: this.mouseY });
        let target: { from: number; to: number } | null = null;
        if (pos != null) {
          const token = tokenAt(view, pos, language);
          if (token) {
            if (getImportInfo(view, token, language)) {
              target = { from: token.from, to: token.to };
            } else {
              const line = findDefinitionLine(view, token.name, token.from, language);
              if (line != null) {
                target = { from: token.from, to: token.to };
              } else if (language === 'java' || language === 'csharp') {
                const exts = language === 'java' ? ['java'] : ['cs'];
                if (hasCachedFile(projectPath, token.name, exts)) {
                  target = { from: token.from, to: token.to };
                } else if (language === 'csharp') {
                  const receiver = memberReceiverName(view, token, language);
                  if (receiver && hasCachedFile(projectPath, receiver, exts)) {
                    target = { from: token.from, to: token.to };
                  }
                }
              }
            }
          }
        }
        this.setTarget(target);
      }
    }),
  ];
}

function navExtensions(language: string, nav: NavContext) {
  const { projectPath, filePath, parser, onOpenFile } = nav;
  return [
    ctrlHoverExtension(language, projectPath),
    hoverTooltip((view, pos) => {
      if (!isNavLanguage(language)) return null;
      const token = tokenAt(view, pos, language);
      if (!token) return null;
      const imp = getImportInfo(view, token, language);
      if (imp) {
        const title = imp.importedName
          ? `Import ${imp.importedName} de '${imp.module}'`
          : `Import '${imp.module}'`;
        return { pos: token.from, end: token.to, above: true, create: () => ({ dom: buildTooltipDom(title, 'Ctrl+click para abrir') }) };
      }
      const line = findDefinitionLine(view, token.name, token.from, language);
      if (line == null) return null;
      return {
        pos: token.from,
        end: token.to,
        above: true,
        create: () => ({ dom: buildTooltipDom(token.name, `Línea ${line + 1} · Ctrl+click para ir`) }),
      };
    }),
    EditorView.domEventHandlers({
      click: (event, view) => {
        if (!(event.ctrlKey || event.metaKey)) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos == null) return false;
        const token = tokenAt(view, pos, language);
        if (!token) return false;

        const imp = getImportInfo(view, token, language);
        if (imp) {
          event.preventDefault();
          void resolveImport({ projectPath, filePath, info: imp, parser }).then((res) => {
            if (res) onOpenFile(res.file, res.line);
          });
          return true;
        }

        const line = findDefinitionLine(view, token.name, token.from, language);
        if (line != null) {
          event.preventDefault();
          const lineStart = view.state.doc.line(line + 1).from;
          view.dispatch({ selection: { anchor: lineStart }, scrollIntoView: true });
          view.focus();
          return true;
        }

        if (language === 'java' || language === 'csharp') {
          event.preventDefault();
          const openType = () =>
            findFileByTypeName(projectPath, token.name, language).then((res) => {
              if (res) onOpenFile(res.file, res.line);
            });
          if (language === 'csharp') {
            const receiver = memberReceiverName(view, token, language);
            if (receiver) {
              void findMethodTarget(projectPath, receiver, token.name, parser, language).then((res) => {
                if (res) onOpenFile(res.file, res.line);
                else void openType();
              });
              return true;
            }
          }
          void openType();
          return true;
        }

        return false;
      },
    }),
  ];
}

function getExtensions(
  language: string,
  onSave: () => void,
  onChange: (c: string) => void,
  onEditorUpdate: (view: EditorView) => void,
  nav?: NavContext,
  editorTheme?: EditorTheme,
) {
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
      '.cm-ctrl-link': {
        textDecoration: 'underline',
        textDecorationColor: 'var(--accent)',
        textDecorationThickness: '1.5px',
        textUnderlineOffset: '2px',
        cursor: 'pointer',
      },
    }),
  ];

  switch (language) {
    case 'python': ext.push(python()); break;
    case 'javascript': case 'typescript': ext.push(javascript({ typescript: language === 'typescript', jsx: true })); break;
    case 'json': ext.push(json()); break;
    case 'css': ext.push(css()); break;
    case 'html': ext.push(html()); break;
    case 'java': ext.push(java()); break;
    case 'csharp': ext.push(csharp()); break;
  }

  const parser = getLanguageParser(language);
  if (nav && parser) {
    ext.push(...navExtensions(language, nav));
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

  ext.push(...editorThemeExtensions(editorTheme ?? 'auto'));

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

export function CodeEditor({ content, language, projectPath, filePath, initialLine, editorTheme, onChange, onSave, onOpenFile, onConsumedNav }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onOpenFileRef = useRef(onOpenFile);
  const onConsumedNavRef = useRef(onConsumedNav);
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
  onOpenFileRef.current = onOpenFile;
  onConsumedNavRef.current = onConsumedNav;

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
        { projectPath, filePath, parser: getLanguageParser(language)!, onOpenFile: (path, line) => onOpenFileRef.current(path, line) },
        editorTheme,
      ),
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [language, updateMatchInfo, projectPath, filePath, editorTheme]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !editorTheme) return;
    const ext = getExtensions(
      language,
      () => onSaveRef.current(),
      (c: string) => onChangeRef.current(c),
      (v: EditorView) => { if (findOpenRef.current) updateMatchInfo(v); },
      { projectPath, filePath, parser: getLanguageParser(language)!, onOpenFile: (path, line) => onOpenFileRef.current(path, line) },
      editorTheme,
    );
    view.dispatch({ effects: StateEffect.reconfigure.of(ext) });
  }, [editorTheme, language, projectPath, filePath, updateMatchInfo]);

  useEffect(() => {
    const view = viewRef.current;
    if (view && initialLine != null && initialLine >= 0) {
      const doc = view.state.doc;
      const line = Math.min(initialLine, doc.lines - 1);
      const lineStart = doc.line(line + 1).from;
      view.dispatch({ selection: { anchor: lineStart }, scrollIntoView: true });
      view.focus();
      onConsumedNavRef.current?.();
    }
  }, [initialLine]);

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
