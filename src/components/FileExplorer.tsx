import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronRight, ChevronDown, Folder, Search, Copy, Check, FileText, X } from 'lucide-react';
import { readDir } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';

interface FileExplorerProps {
  rootPath: string;
  onOpenFile: (path: string, line?: number) => void;
}

interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children: TreeNode[];
  expanded: boolean;
  loading: boolean;
}

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'target', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next', '.idea', '.vscode']);

function highlightTerm(text: string, term: string) {
  const t = term.trim();
  if (!t || t.length < 2) return text;
  const lower = text.toLowerCase();
  const needle = t.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark
        style={{
          backgroundColor: 'rgba(192,132,252,.30)',
          color: 'inherit',
          borderRadius: 3,
          padding: '0 1px',
        }}
      >
        {text.slice(idx, idx + t.length)}
      </mark>
      {text.slice(idx + t.length)}
    </>
  );
}

const getFileIcon = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'py': return '🐍';
    case 'js': case 'jsx': case 'ts': case 'tsx': return '🟦';
    case 'json': return '📋';
    case 'md': return '📝';
    case 'css': case 'scss': case 'less': return '🎨';
    case 'html': return '🌐';
    case 'rs': return '🦀';
    case 'toml': case 'yaml': case 'yml': return '⚙️';
    case 'sql': return '🗃️';
    case 'sh': case 'bat': case 'ps1': return '💻';
    case 'scala': case 'sbt': case 'sc': return '🦭';
    case 'env': case 'gitignore': return '🔒';
    default: return '📄';
  }
};

async function loadDir(path: string): Promise<TreeNode[]> {
  try {
    const entries = await readDir(path);
    const nodes: TreeNode[] = [];
    for (const entry of entries) {
      if (!entry.name || EXCLUDED_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.isFile === false) continue;
      nodes.push({
        name: entry.name,
        path: `${path}/${entry.name}`,
        isFile: entry.isFile ?? false,
        children: [],
        expanded: false,
        loading: false,
      });
    }
    nodes.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  } catch {
    return [];
  }
}

export function FileExplorer({ rootPath, onOpenFile }: FileExplorerProps) {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [fileResults, setFileResults] = useState<TreeNode[]>([]);
  const [contentResults, setContentResults] = useState<{ name: string; path: string; line: number; snippet: string }[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [filesCollapsed, setFilesCollapsed] = useState(true);
  const [contentsCollapsed, setContentsCollapsed] = useState(true);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const copyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 1500);
    } catch {}
  }, []);

  useEffect(() => {
    setLoading(true);
    loadDir(rootPath).then(nodes => {
      setRootNodes(nodes);
      setLoading(false);
    });
  }, [rootPath]);

  useEffect(() => {
    treeRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const matchesSearch = useCallback((name: string): boolean => {
    if (!search.trim()) return true;
    return name.toLowerCase().includes(search.toLowerCase());
  }, [search]);

  useEffect(() => {
    const term = search.trim();
    if (!term || term.length < 2) {
      setFileResults([]);
      setContentResults([]);
      setHasSearched(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        // Búsqueda unificada en Rust: nombres + contenido, insensible a mayúsculas
        const res = await invoke<{ files: { name: string; path: string }[]; contents: { name: string; path: string; line: number; snippet: string }[] }>(
          'search_files',
          { root: rootPath, term },
        );
        setFileResults((res.files ?? []).map(f => ({ name: f.name, path: f.path, isFile: true, children: [], expanded: false, loading: false })));
        setContentResults(res.contents ?? []);
        setHasSearched(true);
        // Por defecto todo colapsado en cada búsqueda nueva
        setFilesCollapsed(true);
        setContentsCollapsed(true);
      } catch {
        setFileResults([]);
        setContentResults([]);
        setHasSearched(true);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, rootPath]);

  const isSearching = search.trim().length >= 2;

  const flatNodes = useMemo(() => {
    if (isSearching) return [...fileResults, ...contentResults.map(c => ({ name: c.name, path: `${c.path}:${c.line}`, isFile: true as const, children: [] as TreeNode[], expanded: false, loading: false }))];
    const result: TreeNode[] = [];
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (!matchesSearch(node.name)) continue;
        result.push(node);
        if (!node.isFile && node.expanded) {
          walk(node.children);
        }
      }
    };
    walk(rootNodes);
    return result;
  }, [rootNodes, matchesSearch, isSearching, fileResults, contentResults]);

  const focusNode = useCallback((path: string | null) => {
    if (!path) return;
    setFocusedPath(path);
    requestAnimationFrame(() => {
      const el = treeRef.current?.querySelector(`[data-path="${CSS.escape(path)}"]`) as HTMLElement | null;
      if (el) {
        el.focus();
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }, []);

  const toggleExpand = useCallback(async (nodePath: string) => {
    setRootNodes(prev => {
      const updateNode = (nodes: TreeNode[]): TreeNode[] =>
        nodes.map(n => {
          if (n.path === nodePath && !n.isFile) {
            if (n.expanded) return { ...n, expanded: false };
            if (n.children.length > 0) return { ...n, expanded: true };
            loadDir(nodePath).then(children => {
              setRootNodes(p => {
                const replace = (ns: TreeNode[]): TreeNode[] =>
                  ns.map(x => x.path === nodePath ? { ...x, children, expanded: true, loading: false } : { ...x, children: replace(x.children) });
                return replace(p);
              });
            });
            return { ...n, loading: true };
          }
          return { ...n, children: updateNode(n.children) };
        });
      return updateNode(prev);
    });
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (flatNodes.length === 0) return;

    const currentIndex = focusedPath ? flatNodes.findIndex(n => n.path === focusedPath) : -1;
    let nextIndex = currentIndex;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, flatNodes.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        nextIndex = currentIndex <= 0 ? flatNodes.length - 1 : currentIndex - 1;
        break;
      case 'Enter':
        e.preventDefault();
        if (currentIndex >= 0) {
          const node = flatNodes[currentIndex];
          if (isSearching) {
            // path sintético "ruta:línea" para contenidos
            const sep = node.path.lastIndexOf(':');
            const maybeLine = sep > 0 ? Number(node.path.slice(sep + 1)) : NaN;
            if (!Number.isNaN(maybeLine) && maybeLine > 0 && contentResults.some(c => `${c.path}:${c.line}` === node.path)) {
              onOpenFile(node.path.slice(0, sep), maybeLine - 1);
            } else {
              onOpenFile(node.path.includes(':') && node.path.startsWith(rootPath) ? node.path.split(':')[0] : node.path);
            }
          } else if (node.isFile) {
            onOpenFile(node.path);
          } else {
            toggleExpand(node.path);
          }
        }
        return;
      default:
        return;
    }

    if (nextIndex >= 0 && nextIndex < flatNodes.length) {
      focusNode(flatNodes[nextIndex].path);
    }
  }, [flatNodes, focusedPath, onOpenFile, toggleExpand, focusNode, isSearching, contentResults, rootPath]);

  const handleNodeClick = useCallback((path: string) => {
    setFocusedPath(path);
  }, []);

  // VS Code compact-style: only merge expanded single-folder chain
  const getCompactFolder = (node: TreeNode): { displayName: string; deepest: TreeNode } => {
    let cur = node;
    let name = node.name;
    while (cur.expanded && cur.children.length === 1 && !cur.children[0].isFile && cur.children[0].expanded) {
      const child = cur.children[0];
      name += `/${child.name}`;
      cur = child;
    }
    return { displayName: name, deepest: cur };
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode | null => {
    if (!matchesSearch(node.name)) return null;

    if (node.isFile) {
      const isCopied = copiedPath === node.path;
      return (
        <div
          key={node.path}
          className="group flex items-center w-full rounded hover:bg-hover transition-colors"
          style={{ paddingLeft: `${10 + depth * 10}px` }}
          onContextMenu={(e) => { e.preventDefault(); copyPath(node.path); }}
          title={`${node.path} — click para abrir, click derecho para copiar ruta`}
        >
          <button
            data-path={node.path}
            onClick={() => {
              handleNodeClick(node.path);
              onOpenFile(node.path);
            }}
            className="flex-1 flex items-center gap-1.5 py-1 text-left text-xs min-w-0"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span className="flex-shrink-0 text-[11px]">{getFileIcon(node.name)}</span>
            <span className="truncate">{node.name}</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); copyPath(node.path); }}
            className="p-1 rounded hover:bg-hover flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mr-1"
            title="Copiar ruta"
          >
            {isCopied ? <Check size={11} className="text-green-400" /> : <Copy size={11} className="text-muted" />}
          </button>
        </div>
      );
    }

    const { displayName, deepest } = getCompactFolder(node);
    const isFolderCopied = copiedPath === node.path;
    const isCompacted = displayName !== node.name;
    return (
      <div key={node.path}>
        <div
          className="group flex items-center w-full rounded hover:bg-hover transition-colors"
          style={{ paddingLeft: `${8 + depth * 10}px` }}
          onContextMenu={(e) => { e.preventDefault(); copyPath(node.path); }}
          title={`${node.path}${isCompacted ? ` → ${displayName}` : ''} — click para expandir, click derecho para copiar ruta`}
        >
          <button
            data-path={node.path}
            onClick={() => {
              handleNodeClick(node.path);
              toggleExpand(node.path);
            }}
            className="flex-1 flex items-center gap-1 py-1 text-left text-xs min-w-0"
            style={{ color: 'var(--text-secondary)' }}
          >
            {node.loading ? (
              <span className="flex-shrink-0 text-[10px] animate-pulse">⋯</span>
            ) : node.expanded ? (
              <ChevronDown size={12} className="flex-shrink-0" />
            ) : (
              <ChevronRight size={12} className="flex-shrink-0" />
            )}
            <Folder size={13} className="flex-shrink-0" style={node.expanded ? { color: '#6e7fff' } : { color: '#555878' }} />
            <span className="truncate" title={displayName}>{displayName}</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); copyPath(node.path); }}
            className="p-1 rounded hover:bg-hover flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mr-1"
            title="Copiar ruta"
          >
            {isFolderCopied ? <Check size={11} className="text-green-400" /> : <Copy size={11} className="text-muted" />}
          </button>
        </div>
        {node.expanded && (
          <div>
            {deepest.children.map(child => renderNode(child, depth + 1))}
            {deepest.children.length === 0 && !deepest.loading && (
              <div className="text-[10px] px-2 py-0.5" style={{ paddingLeft: `${18 + depth * 10}px`, color: '#3d3f60' }}>
                empty
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 flex-shrink-0">
        <div className="flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors focus-within:ring-1 focus-within:ring-[#6e7fff]/50" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
          <Search size={12} className="text-muted flex-shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (flatNodes.length > 0) {
                  focusNode(flatNodes[0].path);
                }
              }
            }}
            placeholder="Buscar por nombre o contenido..."
            className="bg-transparent text-xs outline-none w-full text-primary placeholder:text-muted/60"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                setFileResults([]);
                setContentResults([]);
                setHasSearched(false);
                setSearching(false);
                searchRef.current?.focus();
              }}
              className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
              style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,.2)'; e.currentTarget.style.color = '#f87171'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              title="Limpiar búsqueda"
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
      <div
        ref={treeRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex-1 overflow-y-auto outline-none"
      >
        {loading ? (
          <div className="text-xs text-center py-8 text-muted">Loading...</div>
        ) : isSearching ? (
          searching ? (
            <div className="text-xs text-center py-8 text-muted">
              <span className="text-base">🔍</span>
              <div className="mt-1">Buscando...</div>
            </div>
          ) : (fileResults.length === 0 && contentResults.length === 0) ? (
            <div className="text-xs text-center py-8 text-muted">
              <span className="text-base opacity-60">🔍</span>
              <div className="mt-1">{hasSearched ? 'Sin resultados' : 'Escribe para buscar...'}</div>
            </div>
          ) : (
            <div className="py-1 px-1">
              {fileResults.length > 0 && (
                <>
                  <button
                    onClick={() => setFilesCollapsed(v => !v)}
                    className="w-full flex items-center gap-1.5 px-2 py-1 rounded transition-colors hover:bg-hover text-left"
                    title={filesCollapsed ? 'Expandir archivos' : 'Colapsar archivos'}
                  >
                    {filesCollapsed ? <ChevronRight size={12} className="text-muted flex-shrink-0" /> : <ChevronDown size={12} className="text-muted flex-shrink-0" />}
                    <span
                      className="text-[9px] font-semibold tracking-wide px-1.5 py-px rounded-md"
                      style={{ backgroundColor: 'rgba(110,127,255,.15)', color: '#8b96ff' }}
                    >
                      Archivos
                    </span>
                    <span className="text-[9px] font-mono font-semibold px-1.5 py-px rounded-md" style={{ backgroundColor: 'rgba(110,127,255,.12)', color: '#8b96ff' }}>{fileResults.length}</span>
                  </button>
                  {!filesCollapsed && fileResults.map((node) => {
                    const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
                    const displayPath = parentPath.length > 0 ? parentPath.replace(rootPath, '') : '';
                    const isCopied = copiedPath === node.path;
                    return (
                      <div
                        key={`f-${node.path}`}
                        className="group flex items-center w-full pl-2.5 pr-2 py-1.5 rounded-lg transition-colors hover:bg-hover"
                        onContextMenu={(e) => { e.preventDefault(); copyPath(node.path); }}
                        title={`${node.path} — click para abrir, click derecho para copiar`}
                      >
                        <button
                          onClick={() => onOpenFile(node.path)}
                          className="flex-1 flex items-center gap-2 text-left text-xs min-w-0"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          <span className="flex-shrink-0 text-[13px] w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: 'rgba(110,127,255,.12)' }}>{getFileIcon(node.name)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium" style={{ color: 'var(--text-primary)' }}>{highlightTerm(node.name, search)}</span>
                            {displayPath && (
                              <span className="block truncate text-[10px] text-muted">{displayPath}</span>
                            )}
                          </span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); copyPath(node.path); }}
                          className="p-1 rounded hover:bg-hover flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                          title="Copiar ruta"
                        >
                          {isCopied ? <Check size={11} className="text-green-400" /> : <Copy size={11} className="text-muted" />}
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
              {contentResults.length > 0 && (
                <>
                  <button
                    onClick={() => setContentsCollapsed(v => !v)}
                    className="w-full flex items-center gap-1.5 px-2 py-1 mt-0.5 rounded transition-colors hover:bg-hover text-left"
                    title={contentsCollapsed ? 'Expandir contenido' : 'Colapsar contenido'}
                  >
                    {contentsCollapsed ? <ChevronRight size={12} className="text-muted flex-shrink-0" /> : <ChevronDown size={12} className="text-muted flex-shrink-0" />}
                    <span
                      className="text-[9px] font-semibold tracking-wide px-1.5 py-px rounded-md"
                      style={{ backgroundColor: 'rgba(192,132,252,.15)', color: '#c084fc' }}
                    >
                      Contenido
                    </span>
                    <span className="text-[9px] font-mono font-semibold px-1.5 py-px rounded-md" style={{ backgroundColor: 'rgba(192,132,252,.12)', color: '#c084fc' }}>{contentResults.length}</span>
                  </button>
                  {!contentsCollapsed && contentResults.map((c) => {
                    const parentPath = c.path.substring(0, c.path.lastIndexOf('/'));
                    const displayPath = parentPath.length > 0 ? parentPath.replace(rootPath, '') : '';
                    const key = `c-${c.path}:${c.line}`;
                    return (
                      <div
                        key={key}
                        className="group flex items-center w-full pl-2.5 pr-2 py-1.5 rounded-lg transition-colors hover:bg-hover"
                        onContextMenu={(e) => { e.preventDefault(); copyPath(c.path); }}
                        title={`${c.path}:${c.line} — click para abrir en línea ${c.line}`}
                      >
                        <button
                          onClick={() => onOpenFile(c.path, c.line - 1)}
                          className="flex-1 flex items-start gap-2 text-left text-xs min-w-0"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          <span className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center mt-0.5" style={{ backgroundColor: 'rgba(192,132,252,.12)', color: '#c084fc' }}><FileText size={11} /></span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>{highlightTerm(c.name, search)}</span>
                              <span className="text-[10px] font-mono px-1.5 py-px rounded-md flex-shrink-0" style={{ backgroundColor: 'rgba(192,132,252,.15)', color: '#c084fc' }}>: {c.line}</span>
                            </span>
                            <span className="block truncate text-[11px] font-mono mt-0.5 px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }} title={c.snippet}>{highlightTerm(c.snippet, search)}</span>
                            {displayPath && (
                              <span className="block truncate text-[10px] text-muted mt-0.5">{displayPath}</span>
                            )}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )
        ) : (
          rootNodes.map(node => renderNode(node, 0))
        )}
      </div>
    </div>
  );
}
