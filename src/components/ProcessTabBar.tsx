import { X } from 'lucide-react';
import { ProcessTab } from '../types';

interface ProcessTabBarProps {
  tabs: ProcessTab[];
  activeTabId: string | null;
  gitBranches: Record<string, string | null>;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

export function ProcessTabBar({ tabs, activeTabId, gitBranches, onSelectTab, onCloseTab }: ProcessTabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto min-w-0" style={{ backgroundColor: '#10101c', borderBottom: '1px solid #1e1e38', padding: '4px 12px' }}>
      {tabs.map(tab => {
        const isActive = tab.process_id === activeTabId;
        const statusColor = tab.status === 'running' ? '#4ade80' : tab.status === 'error' ? '#f87171' : '#555878';
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
            <span className="text-[10px] truncate max-w-[80px]">{tab.config_name}</span>
            {tab.config_group && (
              <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: '#1e1e38', color: '#555878' }}>
                {tab.config_group}
              </span>
            )}
            <span style={{ color: '#4a4a70' }}>·</span>
            {(gitBranches[tab.project_id] ?? tab.git_branch) && (
              <span className="flex items-center gap-0.5" style={{ color: '#a78bfa', fontSize: '10px' }}>
                ⎇ {gitBranches[tab.project_id] ?? tab.git_branch}
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
    </div>
  );
}
