import { useState, useCallback, useEffect, useRef } from 'react';
import { X, AlertTriangle, ChevronLeft, ChevronRight, Maximize2, Minimize2, Minus, Palette, Check, Copy } from 'lucide-react';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { FileExplorer } from './FileExplorer';
import { CodeEditor } from './CodeEditor';
import { EditorTabs } from './EditorTabs';
import { BranchIcon } from './icons/BranchIcon';
import { EDITOR_THEMES, getGlobalEditorTheme, type EditorTheme } from '../util/editorThemes';

interface OpenFile {
  path: string;
  name: string;
  language: string;
  content: string;
  savedContent: string;
  isLarge?: boolean;
  isBinary?: boolean;
}

interface FileEditorModalProps {
  projectPath: string;
  projectName?: string;
  gitBranch?: string | null;
  defaultEditorTheme?: EditorTheme;
  mode?: 'floating' | 'minimized' | 'maximized';
  zIndex?: number;
  pos?: { x: number; y: number; w: number; h: number };
  onFocus?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onUpdatePos?: (pos: { x: number; y: number; w: number; h: number }) => void;
  onClose: () => void;
}

const LANGUAGE_MAP: Record<string, string> = {
  py: 'python', js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  json: 'json', md: 'markdown', css: 'css', html: 'html', rs: 'rust',
  yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml', sql: 'sql',
  sh: 'shell', bat: 'shell', ps1: 'shell',
  cs: 'csharp', java: 'java',
};

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return LANGUAGE_MAP[ext] || 'text';
}

function getFileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

interface ThemeMenuProps {
  editorTheme: EditorTheme;
  open: boolean;
  onToggle: () => void;
  onSelect: (t: EditorTheme) => void;
}

function ThemeMenu({ editorTheme, open, onToggle, onSelect }: ThemeMenuProps) {
  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-hover transition-colors text-secondary"
        title="Tema del editor"
      >
        <Palette size={14} />
      </button>
      {open && (
        <div
          className="absolute right-0 z-50 rounded-lg shadow-2xl min-w-[190px] py-1 top-full mt-1"
          style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {EDITOR_THEMES.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onSelect(opt.id)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors hover:bg-hover"
              style={{ color: opt.id === editorTheme ? 'var(--accent)' : 'var(--text-primary)' }}
            >
              <span>{opt.label}</span>
              {opt.id === editorTheme && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FileEditorModal({ projectPath, projectName, gitBranch, defaultEditorTheme, mode: controlledMode, zIndex = 50, pos, onFocus, onMinimize, onMaximize, onUpdatePos, onClose }: FileEditorModalProps) {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [confirmClose, setConfirmClose] = useState<boolean>(false);
  const [explorerCollapsed, setExplorerCollapsed] = useState<boolean>(false);
  const [internalMaximized, setInternalMaximized] = useState(false);
  const isMaximized = controlledMode ? controlledMode === 'maximized' : internalMaximized;
  const [editorTheme, setEditorTheme] = useState<EditorTheme>(() => defaultEditorTheme ?? getGlobalEditorTheme());
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [explorerWidth, setExplorerWidth] = useState(220);
  const [jumpTo, setJumpTo] = useState<{ path: string; line: number } | null>(null);
  const [copiedFooter, setCopiedFooter] = useState(false);
  const confirmResolveRef = useRef<((v: boolean) => void) | null>(null);
  const openFilesRef = useRef(openFiles);
  const activeIndexRef = useRef(activeIndex);
  const isDraggingRef = useRef(false);
  const isWindowDraggingRef = useRef(false);
  const windowRef = useRef<HTMLDivElement>(null);

  openFilesRef.current = openFiles;
  activeIndexRef.current = activeIndex;

  const activeFile = activeIndex >= 0 ? openFiles[activeIndex] : null;

  const openFile = useCallback(async (path: string) => {
    const currentFiles = openFilesRef.current;
    const existingIndex = currentFiles.findIndex(f => f.path === path);
    if (existingIndex >= 0) {
      setActiveIndex(existingIndex);
      return;
    }
    try {
      const content = await readTextFile(path);
      const LIMIT = 10 * 1024 * 1024;
      const isBinary = content.slice(0, 1024).includes('\u0000');
      if (content.length > LIMIT) {
        const preview = content.slice(0, 4000);
        const placeholder = `⚠️ Archivo excede 10MB (${(content.length / 1024 / 1024).toFixed(2)} MB) — no cargado completo para evitar OOM.\nRuta: ${path}\n\nPrimeras líneas:\n${preview}\n\n... [truncado, abre con editor externo]`;
        const name = getFileName(path);
        const file: OpenFile = { path, name, language: 'text', content: placeholder, savedContent: placeholder, isLarge: true };
        setOpenFiles(prev => [...prev, file]);
        setActiveIndex(currentFiles.length);
        return;
      }
      if (isBinary) {
        const placeholder = `⚠️ Archivo binario detectado — no se muestra contenido.\nRuta: ${path}\n\nAbre con una herramienta externa.`;
        const name = getFileName(path);
        const file: OpenFile = { path, name, language: 'text', content: placeholder, savedContent: placeholder, isBinary: true };
        setOpenFiles(prev => [...prev, file]);
        setActiveIndex(currentFiles.length);
        return;
      }
      const name = getFileName(path);
      const language = detectLanguage(path);
      const file: OpenFile = { path, name, language, content, savedContent: content };
      setOpenFiles(prev => [...prev, file]);
      setActiveIndex(currentFiles.length);
    } catch (e) {
      console.error('Failed to open file:', e);
    }
  }, []);

  const closeFile = useCallback(async (index: number) => {
    const currentFiles = openFilesRef.current;
    const file = currentFiles[index];
    if (!file) return;
    if (file.content !== file.savedContent) {
      const confirmed = await new Promise<boolean>(resolve => {
        setConfirmClose(true);
        confirmResolveRef.current = resolve;
      });
      setConfirmClose(false);
      if (!confirmed) return;
    }
    setOpenFiles(prev => {
      const next = prev.filter((_, i) => i !== index);
      const currentIdx = activeIndexRef.current;
      if (currentIdx >= next.length) setActiveIndex(next.length - 1);
      else if (currentIdx === index) setActiveIndex(Math.min(index, next.length - 1));
      return next;
    });
  }, []);

  const saveFile = useCallback(async () => {
    const files = openFilesRef.current;
    const idx = activeIndexRef.current;
    const file = idx >= 0 ? files[idx] : null;
    console.log('saveFile called', { path: file?.path, idx, filesCount: files.length, isDirty: file ? file.content !== file.savedContent : 'n/a' });
    if (file && (file.isLarge || file.isBinary)) {
      console.warn('Save blocked for large/binary placeholder');
      return;
    }
    if (file && file.content !== file.savedContent) {
      try {
        await writeTextFile(file.path, file.content);
        console.log('saveFile succeeded');
        setOpenFiles(prev => prev.map((f, i) =>
          i === idx ? { ...f, savedContent: f.content } : f
        ));
      } catch (e) {
        console.error('Failed to save file:', e);
      }
    }
  }, []);

  const editContent = useCallback((content: string) => {
    const idx = activeIndexRef.current;
    setOpenFiles(prev => prev.map((f, i) =>
      i === idx ? { ...f, content } : f
    ));
  }, []);

  const handleOpenForNav = useCallback((path: string, line?: number) => {
    if (line != null) setJumpTo({ path, line });
    else setJumpTo(null);
    void openFile(path);
  }, [openFile]);

  const handleExplorerResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const startX = e.clientX;
    const startWidth = explorerWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newWidth = startWidth + (moveEvent.clientX - startX);
      setExplorerWidth(Math.max(150, Math.min(500, newWidth)));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [explorerWidth]);

  const handleModalClose = useCallback(async () => {
    const dirty = openFiles.some(f => f.content !== f.savedContent);
    if (dirty) {
      const confirmed = await new Promise<boolean>(resolve => {
        setConfirmClose(true);
        confirmResolveRef.current = resolve;
      });
      setConfirmClose(false);
      if (!confirmed) return;
    }
    onClose();
  }, [openFiles, onClose]);

  const handleConfirmResponse = (confirmed: boolean) => {
    confirmResolveRef.current?.(confirmed);
  };

  const toggleMaximize = useCallback(() => {
    if (onMaximize) onMaximize();
    else setInternalMaximized(prev => !prev);
  }, [onMaximize]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Solo reaccionar si la ventana está enfocada (zIndex alto o contiene activeElement)
      const el = windowRef.current;
      const isFocused = el && el.contains(document.activeElement);
      if (!isFocused && zIndex < 90) {
        // si no está enfocada, solo permitir Ctrl+S global si hay dirty, pero Escape no cierra otras ventanas
        if (e.key === 'Escape' && !confirmClose) return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        // si la ventana no está enfocada no interceptar
        if (el && !el.contains(document.activeElement)) return;
        e.preventDefault();
        saveFile();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
        if (el && !el.contains(document.activeElement)) return;
        e.preventDefault();
        toggleMaximize();
        return;
      }
      if (e.key === 'Escape') {
        if (el && !el.contains(document.activeElement)) return;
        e.preventDefault();
        if (confirmClose) {
          handleConfirmResponse(false);
          return;
        }
        handleModalClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleModalClose, confirmClose, saveFile, zIndex, toggleMaximize]);

  useEffect(() => {
    if (!themeMenuOpen) return;
    const close = () => setThemeMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [themeMenuOpen]);

  const handleThemeSelect = useCallback((t: EditorTheme) => {
    setEditorTheme(t);
    setThemeMenuOpen(false);
  }, []);

  const handleHeaderDoubleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    toggleMaximize();
  }, [toggleMaximize]);

  const handleWindowDragStart = useCallback((e: React.MouseEvent) => {
    if (isMaximized) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    isWindowDraggingRef.current = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = pos || { x: 80, y: 48, w: 1100, h: 720 };
    const startLeft = startPos.x;
    const startTop = startPos.y;

    const handleMove = (mv: MouseEvent) => {
      if (!isWindowDraggingRef.current) return;
      const dx = mv.clientX - startX;
      const dy = mv.clientY - startY;
      const maxX = Math.max(0, window.innerWidth - startPos.w - 8);
      const maxY = Math.max(0, window.innerHeight - startPos.h - 8);
      const newPos = {
        ...startPos,
        x: Math.max(0, Math.min(maxX, startLeft + dx)),
        y: Math.max(0, Math.min(maxY, startTop + dy)),
      };
      onUpdatePos?.(newPos);
      // fallback direct style update for smooth drag when not controlled
      if (!pos && windowRef.current) {
        windowRef.current.style.left = `${newPos.x}px`;
        windowRef.current.style.top = `${newPos.y}px`;
      }
    };
    const handleUp = () => {
      isWindowDraggingRef.current = false;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [isMaximized, pos, onUpdatePos]);

  // Estilo flotante no bloqueante: ventana posicionada, sin backdrop global
  const floatingStyle: React.CSSProperties = isMaximized
    ? {
        left: 0,
        top: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
      }
    : pos
      ? {
          left: pos.x,
          top: pos.y,
          width: pos.w,
          height: pos.h,
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
        }
      : {
          width: '92vw',
          height: '88vh',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
        };

  const wrapperStyle: React.CSSProperties = pos || isMaximized
    ? { zIndex, ...floatingStyle }
    : { zIndex, ...floatingStyle, margin: 'auto' as any };

  const isFloating = !!pos || controlledMode != null;

  return (
    <div
      ref={windowRef}
      className={`fixed flex flex-col overflow-hidden shadow-2xl ${isMaximized ? 'rounded-none' : 'rounded-xl'} ${isFloating ? '' : 'inset-0 m-auto'}`}
      style={wrapperStyle}
      onMouseDown={() => onFocus?.()}
    >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-2 flex-shrink-0 select-none"
          style={{ borderBottom: '1px solid var(--border-color)', cursor: isMaximized ? 'default' : 'grab' }}
          onMouseDown={handleWindowDragStart}
          onDoubleClick={handleHeaderDoubleClick}
          title={isMaximized ? 'Doble clic para restaurar' : 'Arrastrar para mover · Doble clic para maximizar'}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExplorerCollapsed(prev => !prev)}
              className="p-0.5 rounded hover:bg-hover transition-colors text-muted"
              title={explorerCollapsed ? 'Show explorer' : 'Hide explorer'}
            >
              {explorerCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
            </button>
            <span className="text-xs font-medium text-muted">📁 File Editor</span>
            {projectName && (
              <>
                <span className="text-[10px]" style={{ color: '#555878' }}>·</span>
                <span className="text-[11px] font-medium text-secondary">{projectName}</span>
                {gitBranch && (
                  <span className="flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-md font-mono" style={{ backgroundColor: 'var(--branch-bg)', color: 'var(--branch-fg)', border: '1px solid var(--branch-border)' }}>
                    <BranchIcon size={10} />
                    {gitBranch}
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeFile && activeFile.content !== activeFile.savedContent && (
              <>
                <span className="text-[10px] text-muted">Unsaved changes</span>
                <button
                  onClick={() => saveFile()}
                  className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                  style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                >
                  Save
                </button>
              </>
            )}
                        <ThemeMenu editorTheme={editorTheme} open={themeMenuOpen} onToggle={() => setThemeMenuOpen(prev => !prev)} onSelect={handleThemeSelect} />
            {onMinimize && (
              <button
                onClick={() => onMinimize()}
                className="p-1 rounded hover:bg-hover transition-colors text-muted"
                title="Minimizar a tab"
              >
                <Minus size={14} />
              </button>
            )}
            <button
              onClick={() => toggleMaximize()}
              className="p-1 rounded hover:bg-hover transition-colors text-muted"
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              onClick={handleModalClose}
              className="p-1 rounded hover:bg-hover transition-colors text-muted"
              title="Close (Esc)"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        {openFiles.length > 0 && (
          <EditorTabs
            files={openFiles.map(f => ({ path: f.path, name: f.name, language: f.language, dirty: f.content !== f.savedContent }))}
            activeIndex={activeIndex}
            onSelect={setActiveIndex}
            onClose={closeFile}
          />
        )}

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* File Explorer */}
          <div
            className="flex-shrink-0 overflow-hidden"
            style={{
              width: explorerCollapsed ? '0px' : `${explorerWidth}px`,
              borderRight: explorerCollapsed ? 'none' : '1px solid var(--border-color)',
              transition: isDraggingRef.current ? 'none' : 'width 200ms',
            }}
          >
            {!explorerCollapsed && <FileExplorer rootPath={projectPath} onOpenFile={openFile} />}
          </div>

          {/* Resize handle */}
          {!explorerCollapsed && (
            <div
              onMouseDown={handleExplorerResizeStart}
              className="flex-shrink-0 cursor-col-resize hover:bg-[#6e7fff] transition-colors"
              style={{ width: '4px', backgroundColor: 'transparent', backgroundClip: 'content-box' }}
              title="Drag to resize"
            />
          )}

          {/* Editor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {activeFile ? (
              <CodeEditor
                key={activeFile.path}
                content={activeFile.content}
                language={activeFile.language}
                projectPath={projectPath}
                filePath={activeFile.path}
                initialLine={jumpTo && jumpTo.path === activeFile.path ? jumpTo.line : undefined}
                editorTheme={editorTheme}
                onChange={editContent}
                onSave={saveFile}
                onOpenFile={handleOpenForNav}
                onConsumedNav={() => setJumpTo(null)}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center flex-col gap-3 text-muted">
                <span className="text-3xl opacity-20">📄</span>
                <p className="text-sm">Select a file from the explorer to start editing</p>
                <p className="text-xs">Press <kbd className="bg-elevated border-light px-1 py-0.5 rounded" style={{ fontSize: '10px' }}>Esc</kbd> to close</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-1.5 flex-shrink-0 bg-base" style={{ borderTop: '1px solid var(--border-color)' }}>
          {activeFile && activeFile.content !== activeFile.savedContent && (
            <span className="text-[10px]" style={{ color: '#fbbf24' }}>● Modified</span>
          )}
          {activeFile && (
            <>
              <span className="text-[10px] text-muted truncate flex-1" title={activeFile.path}>{activeFile.path}</span>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(activeFile.path);
                    setCopiedFooter(true);
                    setTimeout(() => setCopiedFooter(false), 1500);
                  } catch {}
                }}
                className="p-1 rounded hover:bg-hover transition-colors flex-shrink-0"
                title="Copiar ruta del archivo"
              >
                {copiedFooter ? <Check size={12} className="text-green-400" /> : <Copy size={12} className="text-muted" />}
              </button>
            </>
          )}
          <span className="text-[10px] text-muted ml-auto flex items-center gap-3 flex-shrink-0">
            <kbd className="bg-elevated border-light px-1 py-0.5 rounded">Ctrl+S</kbd> Save
          </span>
        </div>

      {/* Resize handle para ventana flotante */}
      {!isMaximized && pos && (
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            const startW = pos.w;
            const startH = pos.h;
            const handleMove = (mv: MouseEvent) => {
              const maxW = Math.max(500, window.innerWidth - pos.x - 8);
              const maxH = Math.max(320, window.innerHeight - pos.y - 8);
              const newW = Math.max(500, Math.min(maxW, startW + (mv.clientX - startX)));
              const newH = Math.max(320, Math.min(maxH, startH + (mv.clientY - startY)));
              onUpdatePos?.({ ...pos, w: newW, h: newH });
            };
            const handleUp = () => {
              document.removeEventListener('mousemove', handleMove);
              document.removeEventListener('mouseup', handleUp);
            };
            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleUp);
          }}
          className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize"
          style={{ background: 'transparent' }}
          title="Arrastrar para redimensionar"
        />
      )}

      {/* Confirm dialog - absolute dentro de ventana flotante */}
      {confirmClose && (
        <div className="absolute inset-0 z-30 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-xl p-6 shadow-2xl max-w-sm w-full" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={20} style={{ color: '#fbbf24' }} />
              <span className="text-sm font-medium text-primary">Unsaved changes</span>
            </div>
            <p className="text-xs text-secondary mb-6">
              You have unsaved changes. Do you want to discard them?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => handleConfirmResponse(false)}
                className="px-4 py-1.5 rounded text-xs font-medium transition-colors btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmResponse(true)}
                className="px-4 py-1.5 rounded text-xs font-medium transition-colors"
                style={{ backgroundColor: 'rgba(239,68,68,.85)', color: '#fff' }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
