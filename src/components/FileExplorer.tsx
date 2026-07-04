import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronRight, ChevronDown, Folder, Search } from 'lucide-react';
import { readDir } from '@tauri-apps/plugin-fs';

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

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'target', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next']);

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
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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

  const matchesSearch = useCallback((name: string): boolean => {
    if (!search.trim()) return true;
    return name.toLowerCase().includes(search.toLowerCase());
  }, [search]);

  const flatNodes = useMemo(() => {
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
  }, [rootNodes, matchesSearch]);

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

  const renderNode = (node: TreeNode, depth: number): React.ReactNode | null => {
    if (!matchesSearch(node.name)) return null;

    if (node.isFile) {
      return (
        <button
          key={node.path}
          data-path={node.path}
          onClick={() => {
            handleNodeClick(node.path);
            onOpenFile(node.path);
          }}
          className="w-full flex items-center gap-1.5 px-2 py-1 text-left text-xs rounded transition-colors hover:bg-hover"
          style={{ paddingLeft: `${12 + depth * 16}px`, color: 'var(--text-secondary)' }}
          title={node.path}
        >
          <span className="flex-shrink-0 text-[11px]">{getFileIcon(node.name)}</span>
          <span className="truncate">{node.name}</span>
        </button>
      );
    }

    return (
      <div key={node.path}>
        <button
          data-path={node.path}
          onClick={() => {
            handleNodeClick(node.path);
            toggleExpand(node.path);
          }}
          className="w-full flex items-center gap-1 px-2 py-1 text-left text-xs rounded transition-colors hover:bg-hover"
          style={{ paddingLeft: `${8 + depth * 16}px`, color: 'var(--text-secondary)' }}
          title={node.path}
        >
          {node.loading ? (
            <span className="flex-shrink-0 text-[10px] animate-pulse">⋯</span>
          ) : node.expanded ? (
            <ChevronDown size={12} className="flex-shrink-0" />
          ) : (
            <ChevronRight size={12} className="flex-shrink-0" />
          )}
          <Folder size={13} className="flex-shrink-0" style={node.expanded ? { color: '#6e7fff' } : { color: '#555878' }} />
          <span className="truncate">{node.name}</span>
        </button>
        {node.expanded && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
            {node.children.length === 0 && !node.loading && (
              <div className="text-[10px] px-2 py-0.5" style={{ paddingLeft: `${28 + (depth + 1) * 16}px`, color: '#3d3f60' }}>
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
        ) : (
          rootNodes.map(node => renderNode(node, 0))
        )}
      </div>
    </div>
  );
}
