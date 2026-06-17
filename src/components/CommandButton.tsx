import { useState } from 'react';
import { Edit3, Trash2, Copy } from 'lucide-react';
import { ProjectConfig } from '../types';

interface CommandButtonProps {
  config: ProjectConfig;
  configIndex: number;
  icon: string;
  onRun: (configIndex: number) => void;
  onEdit: (config: ProjectConfig, index: number) => void;
  onDelete: (index: number) => void;
  onDuplicate: (config: ProjectConfig, index: number) => void;
}

export function CommandButton({ config, configIndex, icon, onRun, onEdit, onDelete, onDuplicate }: CommandButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="flex items-center gap-1 rounded-sm group transition-all"
      style={{ backgroundColor: hovered ? '#1a1a2e' : '#0d0d14', border: '1px solid #1e1e38' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        className="flex-1 flex items-center gap-2 p-2.5 text-left min-w-0"
        onClick={() => onRun(configIndex)}
      >
        <span className="text-sm flex-shrink-0">{icon}</span>
        <div className="min-w-0">
          <div className="font-medium text-sm capitalize truncate flex items-center gap-1.5">
            {config.name}
            {config.group && (
              <span className="text-[9px] px-1 py-0.5 rounded font-normal" style={{ backgroundColor: '#1e1e38', color: '#555878' }}>
                {config.group}
              </span>
            )}
          </div>
          <div className="font-mono text-xs truncate" style={{ color: '#3d3f60' }}>{config.command}</div>
        </div>
      </button>
      <div className={`flex items-center gap-0.5 pr-1.5 transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'}`}>
        <button
          className="p-1 rounded transition-colors"
          style={{ color: '#555878' }}
          onClick={e => { e.stopPropagation(); onDuplicate(config, configIndex); }}
          onMouseEnter={e => (e.currentTarget.style.color = '#a78bfa')}
          onMouseLeave={e => (e.currentTarget.style.color = '#555878')}
          title="Duplicar"
        >
          <Copy size={12} />
        </button>
        <button
          className="p-1 rounded transition-colors"
          style={{ color: '#555878' }}
          onClick={e => { e.stopPropagation(); onEdit(config, configIndex); }}
          onMouseEnter={e => (e.currentTarget.style.color = '#6e7fff')}
          onMouseLeave={e => (e.currentTarget.style.color = '#555878')}
          title="Editar"
        >
          <Edit3 size={12} />
        </button>
        <button
          className="p-1 rounded transition-colors"
          style={{ color: '#555878' }}
          onClick={e => { e.stopPropagation(); onDelete(configIndex); }}
          onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
          onMouseLeave={e => (e.currentTarget.style.color = '#555878')}
          title="Eliminar"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
