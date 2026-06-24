import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { Project } from '../types';

interface QuickSwitchModalProps {
  projects: Project[];
  onSelect: (project: Project) => void;
  onClose: () => void;
}

const getProjectIcon = (type: string) => {
  const icons: Record<string, string> = { Python: '🐍', Scala: '🦭', CSharp: '🎯', React: '⚛️', JavaScript: '🟨' };
  return icons[type] || '📁';
};

export function QuickSwitchModal({ projects, onSelect, onClose }: QuickSwitchModalProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return projects.filter(p => p.name.toLowerCase().includes(term));
  }, [projects, search]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

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
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex]);
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: '#13131f', border: '1px solid #2e2e50' }}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #252540' }}>
          <Search size={16} style={{ color: '#555878' }} />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar proyecto..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: '#e2e4f0' }}
          />
          <button
            onClick={onClose}
            className="p-0.5 rounded hover:bg-[#1f1f35] transition-colors"
            style={{ color: '#555878' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-xs" style={{ color: '#555878' }}>
              {search ? 'No se encontraron proyectos' : 'No hay proyectos registrados'}
            </div>
          ) : (
            filtered.map((p, i) => (
              <button
                key={p.id}
                onClick={() => { onSelect(p); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                style={{
                  backgroundColor: i === selectedIndex ? '#1f1f35' : 'transparent',
                  color: i === selectedIndex ? '#e2e4f0' : '#8890b0',
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className="text-lg flex-shrink-0">{getProjectIcon(p.project_type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-[11px] truncate" style={{ color: '#555878' }}>
                    {p.path}
                  </div>
                </div>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ backgroundColor: '#1a1a2e', color: '#6e7fff' }}
                >
                  {p.project_type}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 px-4 py-2" style={{ backgroundColor: '#0d0d14', borderTop: '1px solid #1e1e38' }}>
          <span className="text-[10px]" style={{ color: '#3d3f60' }}>
            <kbd style={{ backgroundColor: '#1a1a2e', padding: '1px 4px', borderRadius: 3, border: '1px solid #2e2e50' }}>↑↓</kbd> Navegar
          </span>
          <span className="text-[10px]" style={{ color: '#3d3f60' }}>
            <kbd style={{ backgroundColor: '#1a1a2e', padding: '1px 4px', borderRadius: 3, border: '1px solid #2e2e50' }}>Enter</kbd> Seleccionar
          </span>
          <span className="text-[10px]" style={{ color: '#3d3f60' }}>
            <kbd style={{ backgroundColor: '#1a1a2e', padding: '1px 4px', borderRadius: 3, border: '1px solid #2e2e50' }}>Esc</kbd> Cerrar
          </span>
        </div>
      </div>
    </div>
  );
}
