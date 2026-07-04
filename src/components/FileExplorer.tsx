import { useState, useEffect, useCallback } from 'react';
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
      if (entry.name.startsWith('.')) continue;
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

  useEffect(() => {
    setLoading(true);
    loadDir(rootPath).then(nodes => {
      setRootNodes(nodes);
      setLoading(false);
    });
  }, [rootPath]);

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

  const matchesSearch = (name: string): boolean => {
    if (!search.trim()) return true;
    return name.toLowerCase().includes(search.toLowerCase());
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode | null => {
    if (!matchesSearch(node.name)) return null;

    if (node.isFile) {
      return (
        <button
          key={node.path}
          onClick={() => onOpenFile(node.path)}
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
          onClick={() => toggleExpand(node.path)}
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
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar archivos..."
            className="bg-transparent text-xs outline-none w-full text-primary"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-xs text-center py-8 text-muted">Loading...</div>
        ) : (
          rootNodes.map(node => renderNode(node, 0))
        )}
      </div>
    </div>
  );
}
