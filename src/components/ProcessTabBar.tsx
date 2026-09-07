import { X, Maximize2 } from 'lucide-react';
import { ProcessTab, EditorSession } from '../types';
import { BranchIcon } from './icons/BranchIcon';

interface ProcessTabBarProps {
  tabs: ProcessTab[];
  activeTabId: string | null;
  gitBranches: Record<string, string | null>;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  minimizedEditors?: EditorSession[];
  onRestoreEditor?: (projectId: string) => void;
  onCloseEditor?: (projectId: string) => void;
}

export function ProcessTabBar({ tabs, activeTabId, gitBranches, onSelectTab, onCloseTab, minimizedEditors = [], onRestoreEditor, onCloseEditor }: ProcessTabBarProps) {
  if (tabs.length === 0 && minimizedEditors.length === 0) return null;

  const runningProjectIds = new Set(tabs.map(t => t.project_id));
  const standaloneEditors = minimizedEditors.filter(ed => !runningProjectIds.has(ed.project_id));

  return (
    <div className="flex items-center gap-1 overflow-x-auto min-w-0 bg-base" style={{ borderBottom: '1px solid var(--border-color)', padding: '4px 12px' }}>
      {tabs.map(tab => {
        const isActive = tab.process_id === activeTabId;
        const statusColor = tab.status === 'running' ? '#4ade80' : tab.status === 'error' ? '#f87171' : '#555878';
        const editorForTab = minimizedEditors.find(ed => ed.project_id === tab.project_id);
        return (
          <button
            key={tab.process_id}
            onClick={() => onSelectTab(tab.process_id)}
            title={`${tab.project_name} · ${tab.config_name}${tab.config_group ? ` [${tab.config_group}]` : ''}${(gitBranches[tab.project_id] ?? tab.git_branch) ? ` ⎇ ${gitBranches[tab.project_id] ?? tab.git_branch}` : ''}`}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs flex-shrink-0 transition-all"
            style={{
              backgroundColor: isActive ? '#1f1f35' : 'transparent',
              border: isActive ? '1px solid #3a4199' : '1px solid transparent',
              color: isActive ? '#e2e4f0' : '#555878',
            }}
          >
            <span className={tab.status === 'running' ? 'animate-pulse-dot' : ''} style={{ color: statusColor, fontSize: '10px', lineHeight: 1 }}>●</span>
            <span className="font-medium max-w-[100px] truncate">{tab.project_name}</span>
            <span style={{ color: '#4a4a70' }}>·</span>
            {tab.kind === 'ps' ? (
              <span className="flex items-center gap-1 text-[10px]" style={{ color: '#c084fc' }}>
                <span>&gt;_</span> PowerShell
              </span>
            ) : (
              <span className="text-[10px] truncate max-w-[80px]">{tab.config_name}</span>
            )}
            {tab.config_group && (
              <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: '#1e1e38', color: '#555878' }}>
                {tab.config_group}
              </span>
            )}
            <span style={{ color: '#4a4a70' }}>·</span>
            {(gitBranches[tab.project_id] ?? tab.git_branch) && (
              <span className="flex items-center gap-0.5" style={{ color: '#a78bfa', fontSize: '10px' }}>
                <BranchIcon size={10} /> {gitBranches[tab.project_id] ?? tab.git_branch}
              </span>
            )}
            {editorForTab && (
              <span
                className="ml-1 flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-hover transition-colors"
                style={{ backgroundColor: 'rgba(110,127,255,0.15)', color: '#a5b4fc', border: '1px solid rgba(110,127,255,0.3)' }}
                onClick={e => { e.stopPropagation(); onRestoreEditor?.(editorForTab.project_id); }}
                title={`Restaurar editor de ${editorForTab.project_name}`}
              >
                <span style={{ fontSize: '10px' }}>📝</span>
                <Maximize2 size={10} />
              </span>
            )}
            <span
              className="ml-1 rounded p-0.5 hover:text-white transition-colors"
              onClick={e => { e.stopPropagation(); onCloseTab(tab.process_id); }}
              style={{ color: '#3a3a60' }}
            >
              <X size={10} />
            </span>
          </button>
        );
      })}
      {standaloneEditors.map(ed => (
        <button
          key={`editor-${ed.project_id}`}
          onClick={() => onRestoreEditor?.(ed.project_id)}
          title={`${ed.project_name} · Editor — click para restaurar`}
          className="flex items-center gap-1.5 px-3 py-1 rounded text-xs flex-shrink-0 transition-all"
          style={{
            backgroundColor: 'rgba(110,127,255,0.12)',
            border: '1px solid rgba(110,127,255,0.3)',
            color: '#a5b4fc',
          }}
        >
          <span style={{ fontSize: '11px' }}>📝</span>
          <span className="font-medium max-w-[100px] truncate">{ed.project_name}</span>
          <span style={{ color: '#4a4a70' }}>·</span>
          <span className="text-[10px]">Editor</span>
          {(gitBranches[ed.project_id] ?? ed.git_branch) && (
            <>
              <span style={{ color: '#4a4a70' }}>·</span>
              <span className="flex items-center gap-0.5" style={{ color: '#a78bfa', fontSize: '10px' }}>
                <BranchIcon size={10} /> {gitBranches[ed.project_id] ?? ed.git_branch}
              </span>
            </>
          )}
          <span className="ml-1 rounded p-0.5 hover:bg-hover transition-colors" style={{ color: '#a5b4fc' }} title="Restaurar editor">
            <Maximize2 size={10} />
          </span>
          <span
            className="rounded p-0.5 hover:text-white transition-colors"
            onClick={e => { e.stopPropagation(); onCloseEditor?.(ed.project_id); }}
            style={{ color: '#6b7280' }}
            title="Cerrar editor"
          >
            <X size={10} />
          </span>
        </button>
      ))}
    </div>
  );
}
