import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';

interface EditorFile {
  path: string;
  name: string;
  language: string;
  dirty: boolean;
}

interface EditorTabsProps {
  files: EditorFile[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onClose: (index: number) => void;
}

export function EditorTabs({ files, activeIndex, onSelect, onClose }: EditorTabsProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path).then(() => {
      setCopied(path);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  };
  return (
    <div
      className="flex items-stretch flex-shrink-0 overflow-x-auto scrollbar-thin"
      style={{ height: '32px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-base)' }}
      onWheel={(e) => {
        // Shift+wheel or horizontal wheel scrolls tabs
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
          e.currentTarget.scrollLeft += e.deltaX || e.deltaY;
        }
      }}
    >
      {files.map((file, i) => (
        <div
          key={file.path}
          onClick={() => onSelect(i)}
          onMouseDown={(e) => {
            // Middle click to close tab
            if (e.button === 1) {
              e.preventDefault();
              onClose(i);
            }
          }}
          onAuxClick={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              onClose(i);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            copyPath(file.path);
          }}
          className="group flex items-center gap-1 px-2 text-xs whitespace-nowrap transition-colors flex-shrink-0 cursor-pointer"
          style={{
            backgroundColor: i === activeIndex ? 'var(--bg-surface)' : 'transparent',
            color: i === activeIndex ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderRight: '1px solid var(--border-color)',
            borderBottom: i === activeIndex ? '2px solid #6e7fff' : '2px solid transparent',
          }}
          title={`${file.path} — click para abrir, ruedita para cerrar, click derecho para copiar ruta`}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onSelect(i); }}
            className="flex items-center gap-1 py-1 min-w-0"
            style={{ background: 'transparent', border: 'none', color: 'inherit' }}
          >
            {file.dirty && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#fbbf24' }} />}
            <span className="truncate max-w-[120px]">{file.name}</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); copyPath(file.path); }}
            className="p-0.5 rounded hover:bg-hover transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
            title="Copiar ruta"
          >
            {copied === file.path ? <Check size={11} className="text-green-400" /> : <Copy size={11} className="text-muted" />}
          </button>
          <span
            onClick={e => { e.stopPropagation(); onClose(i); }}
            className="p-0.5 rounded hover:bg-hover transition-colors flex-shrink-0 ml-0.5 cursor-pointer"
            style={{ color: i === activeIndex ? 'var(--text-muted)' : 'transparent' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
            onMouseLeave={e => { e.currentTarget.style.color = i === activeIndex ? 'var(--text-muted)' : 'transparent'; }}
          >
            <X size={11} />
          </span>
        </div>
      ))}
    </div>
  );
}
