import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, Loader2, Check } from 'lucide-react';
import { Project } from '../types';
import { BranchIcon } from './icons/BranchIcon';

interface BranchPickerModalProps {
  project: Project;
  currentBranch?: string | null;
  onListBranches: (path: string) => Promise<string[]>;
  onCheckoutBranch: (projectId: string, branch: string) => Promise<void>;
  onClose: () => void;
}

export function BranchPickerModal({
  project,
  currentBranch,
  onListBranches,
  onCheckoutBranch,
  onClose,
}: BranchPickerModalProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await onListBranches(project.path);
        setBranches(list);
      } catch (e: any) {
        setError(typeof e === 'string' ? e : String(e));
        setBranches([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [project.path, onListBranches]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    if (!term) return branches;
    return branches.filter(b => b.toLowerCase().includes(term));
  }, [branches, search]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [loading]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleSelect = (branch: string) => {
    if (branch === currentBranch) {
      onClose();
      return;
    }
    onCheckoutBranch(project.id, branch);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        {
          const branch = filtered[selectedIndex];
          if (branch) handleSelect(branch);
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        onClose();
        break;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[55] flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl overflow-hidden shadow-2xl bg-surface border-light"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <BranchIcon size={16} className="text-muted flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              Cambiar rama
            </div>
            <div className="text-[11px] truncate text-muted">
              {project.name}
              {currentBranch ? ` · actual: ${currentBranch}` : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-0.5 rounded hover:bg-hover transition-colors text-muted"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <Search size={13} className="text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar rama..."
            className="flex-1 bg-transparent text-xs outline-none text-primary"
          />
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-6 text-xs text-muted">
              <Loader2 size={13} className="animate-spin" /> Cargando ramas...
            </div>
          ) : error ? (
            <div className="px-4 py-6 text-xs" style={{ color: '#f87171' }}>
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-6 text-xs text-muted text-center">
              {search ? 'No hay ramas que coincidan' : 'No hay ramas locales'}
            </div>
          ) : (
            filtered.map((branch, i) => {
              const isCurrent = branch === currentBranch;
              const isSelected = i === selectedIndex;
              return (
                <button
                  key={branch}
                  onClick={() => handleSelect(branch)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                  style={{
                    backgroundColor: isSelected ? 'var(--bg-hover)' : 'transparent',
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                >
                  <BranchIcon size={13} className="flex-shrink-0" style={{ color: '#c084fc' }} />
                  <span className="font-mono text-sm truncate flex-1">{branch}</span>
                  {isCurrent && (
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                      style={{ backgroundColor: 'rgba(192,132,252,.15)', color: '#c084fc' }}>
                      <Check size={10} /> actual
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 bg-base" style={{ borderTop: '1px solid var(--border-color)' }}>
          <span className="text-[10px] text-muted">
            <kbd className="bg-elevated border-light" style={{ padding: '1px 4px', borderRadius: 3 }}>↑↓</kbd> Navegar
          </span>
          <span className="text-[10px] text-muted">
            <kbd className="bg-elevated border-light" style={{ padding: '1px 4px', borderRadius: 3 }}>Enter</kbd> Cambiar
          </span>
          <span className="text-[10px] text-muted">
            <kbd className="bg-elevated border-light" style={{ padding: '1px 4px', borderRadius: 3 }}>Esc</kbd> Cerrar
          </span>
        </div>
      </div>
    </div>
  );
}