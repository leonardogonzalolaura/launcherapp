import { X } from 'lucide-react';

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
  return (
    <div className="flex items-stretch flex-shrink-0 overflow-x-auto" style={{ height: '32px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-base)' }}>
      {files.map((file, i) => (
        <button
          key={file.path}
          onClick={() => onSelect(i)}
          className="flex items-center gap-1.5 px-3 text-xs whitespace-nowrap transition-colors flex-shrink-0"
          style={{
            backgroundColor: i === activeIndex ? 'var(--bg-surface)' : 'transparent',
            color: i === activeIndex ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderRight: '1px solid var(--border-color)',
            borderBottom: i === activeIndex ? '2px solid #6e7fff' : '2px solid transparent',
          }}
          title={file.path}
        >
          {file.dirty && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#fbbf24' }} />}
          <span className="truncate max-w-[120px]">{file.name}</span>
          <span
            onClick={e => { e.stopPropagation(); onClose(i); }}
            className="p-0.5 rounded hover:bg-hover transition-colors flex-shrink-0 ml-0.5"
            style={{ color: i === activeIndex ? 'var(--text-muted)' : 'transparent' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
            onMouseLeave={e => { e.currentTarget.style.color = i === activeIndex ? 'var(--text-muted)' : 'transparent'; }}
          >
            <X size={11} />
          </span>
        </button>
      ))}
    </div>
  );
}
