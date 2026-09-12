import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronRight, ChevronDown, Folder, Search, Copy, Check } from 'lucide-react';
import { readDir } from '@tauri-apps/plugin-fs';
import { getProjectFileIndex } from '../util/editorNav';

interface FileExplorerProps {
  rootPath: string;
  onOpenFile: (path: string) => void;
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
  const [searchResults, setSearchResults] = useState<TreeNode[] | null>(null);
  const [searching, setSearching] = useState(false);
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
    if (!term) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const termLower = term.toLowerCase();
      try {
        // Prefer in-memory index (fast, no extra disk I/O) — built by editorNav
        const index = await getProjectFileIndex(rootPath);
        const results: TreeNode[] = [];
        for (const arr of index.byBase.values()) {
          for (const fullPath of arr) {
            const name = fullPath.split('/').pop() || fullPath;
            if (name.toLowerCase().includes(termLower)) {
              results.push({ name, path: fullPath, isFile: true, children: [], expanded: false, loading: false });
            }
          }
        }
        // If index empty (first load not yet built), fallback to disk walk
        if (results.length === 0 && index.byPath.size === 0) {
          const visited = new Set<string>();
          async function walk(dir: string) {
            if (visited.has(dir)) return;
            visited.add(dir);
            try {
              const entries = await readDir(dir);
              for (const entry of entries) {
                if (!entry.name || EXCLUDED_DIRS.has(entry.name)) continue;
                if (entry.name.startsWith('.')) continue;
                const fullPath = `${dir}/${entry.name}`;
                if (entry.isFile && entry.name.toLowerCase().includes(termLower)) {
                  results.push({ name: entry.name, path: fullPath, isFile: true, children: [], expanded: false, loading: false });
                }
                if (!entry.isFile) {
                  await walk(fullPath);
                }
              }
            } catch { /* skip unreadable dirs */ }
          }
          await walk(rootPath);
        }
        results.sort((a, b) => a.name.localeCompare(b.name));
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, rootPath]);

  const flatNodes = useMemo(() => {
    if (search.trim() && searchResults) return searchResults;
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
  }, [rootNodes, matchesSearch, search, searchResults]);

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
          if (node.isFile) {
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
  }, [flatNodes, focusedPath, onOpenFile, toggleExpand, focusNode]);

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
        <div className="flex items-center gap-1.5 rounded px-2 py-1" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          <Search size={11} className="text-muted flex-shrink-0" />
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
            placeholder="Buscar archivos..."
            className="bg-transparent text-xs outline-none w-full text-primary"
          />
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
        ) : search.trim() ? (
          searching ? (
            <div className="text-xs text-center py-8 text-muted">Searching...</div>
          ) : searchResults === null ? (
            <div className="text-xs text-center py-8 text-muted">Type to search files...</div>
          ) : searchResults.length === 0 ? (
            <div className="text-xs text-center py-8 text-muted">No files found</div>
          ) : (
            <div className="py-1">
              <div className="text-[10px] px-3 py-1 text-muted">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</div>
              {searchResults.map((node) => {
                const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
                const displayPath = parentPath.length > 0 ? parentPath.replace(rootPath, '') : '';
                const isCopied = copiedPath === node.path;
                return (
                  <div
                    key={node.path}
                    className="group flex items-center w-full px-3 py-1 rounded hover:bg-hover transition-colors"
                    onContextMenu={(e) => { e.preventDefault(); copyPath(node.path); }}
                    title={`${node.path} — click para abrir, click derecho para copiar`}
                  >
                    <button
                      onClick={() => onOpenFile(node.path)}
                      className="flex-1 flex items-center gap-2 text-left text-xs min-w-0"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <span className="flex-shrink-0 text-[11px]">{getFileIcon(node.name)}</span>
                      <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>{node.name}</span>
                      {displayPath && (
                        <span className="truncate text-[10px] text-muted flex-shrink-0 ml-2">{displayPath}</span>
                      )}
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
            </div>
          )
        ) : (
          rootNodes.map(node => renderNode(node, 0))
        )}
      </div>
    </div>
  );
}
