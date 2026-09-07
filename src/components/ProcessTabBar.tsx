import { useState } from 'react';
import { X, Maximize2, MoreHorizontal } from 'lucide-react';
import { ProcessTab, EditorSession } from '../types';
import { BranchIcon } from './icons/BranchIcon';

const VISIBLE_LIMIT = 4;

interface ProcessTabBarProps {
  tabs: ProcessTab[];
  activeTabId: string | null;
  gitBranches: Record<string, string | null>;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  minimizedEditors?: EditorSession[];
  onRestoreEditor?: (projectId: string) => void;
  onCloseEditor?: (projectId: string) => void;
  position?: 'top' | 'bottom';
}

export function ProcessTabBar({ tabs, activeTabId, gitBranches, onSelectTab, onCloseTab, minimizedEditors = [], onRestoreEditor, onCloseEditor, position = 'top' }: ProcessTabBarProps) {
  if (tabs.length === 0 && minimizedEditors.length === 0) return null;

  const [showOverflow, setShowOverflow] = useState(false);

  const runningProjectIds = new Set(tabs.map(t => t.project_id));
  const standaloneEditors = minimizedEditors.filter(ed => !runningProjectIds.has(ed.project_id));

  // Overflow: 3 visibles, resto en menú
  const visibleTabs = tabs.slice(0, VISIBLE_LIMIT);
  const overflowTabs = tabs.slice(VISIBLE_LIMIT);
  const remainingSlots = Math.max(0, VISIBLE_LIMIT - visibleTabs.length);
  const visibleStandalone = standaloneEditors.slice(0, remainingSlots);
  const overflowStandalone = standaloneEditors.slice(remainingSlots);
  const overflowCount = overflowTabs.length + overflowStandalone.length;
  const activeInOverflow = overflowTabs.some(t => t.process_id === activeTabId);

  const isBottom = position === 'bottom';
  return (
    <div className="flex items-center gap-1 overflow-visible min-w-0 bg-base relative" style={{ borderBottom: isBottom ? 'none' : '1px solid var(--border-color)', borderTop: isBottom ? '1px solid var(--border-color)' : 'none', padding: '4px 12px' }}>
      {visibleTabs.map(tab => {
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
      {visibleStandalone.map(ed => (
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
      {overflowCount > 0 && (
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowOverflow(v => !v)}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor: activeInOverflow ? '#1f1f35' : 'var(--bg-surface)',
              border: activeInOverflow ? '1px solid #3a4199' : '1px solid var(--border-color)',
              color: activeInOverflow ? '#e2e4f0' : 'var(--text-secondary)',
            }}
            title={`${overflowCount} tabs más`}
          >
            <MoreHorizontal size={12} />
            <span className="text-[10px]">+{overflowCount}</span>
          </button>
          {showOverflow && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowOverflow(false)} />
              <div
                className={`absolute right-0 min-w-[280px] max-w-[380px] max-h-[320px] overflow-y-auto rounded-lg shadow-2xl z-30 py-1 ${position === 'bottom' ? 'bottom-full mb-1' : 'top-full mt-1'}`}
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}
              >
                {overflowTabs.map(tab => {
                  const isActive = tab.process_id === activeTabId;
                  const statusColor = tab.status === 'running' ? '#4ade80' : tab.status === 'error' ? '#f87171' : '#555878';
                  const editorForTab = minimizedEditors.find(ed => ed.project_id === tab.project_id);
                  return (
                    <div
                      key={`ov-${tab.process_id}`}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-hover transition-colors cursor-pointer"
                      style={{ backgroundColor: isActive ? 'var(--bg-hover)' : 'transparent' }}
                      onClick={() => { onSelectTab(tab.process_id); setShowOverflow(false); }}
                    >
                      <span className={tab.status === 'running' ? 'animate-pulse-dot' : ''} style={{ color: statusColor, fontSize: '10px', lineHeight: 1 }}>●</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate" style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {tab.project_name} · {tab.config_name}
                        </div>
                        <div className="text-[10px] truncate text-muted flex items-center gap-1">
                          {(gitBranches[tab.project_id] ?? tab.git_branch) && (
                            <span className="flex items-center gap-0.5" style={{ color: '#a78bfa' }}><BranchIcon size={10} /> {gitBranches[tab.project_id] ?? tab.git_branch}</span>
                          )}
                          {tab.config_group && <span className="px-1 py-0.5 rounded" style={{ backgroundColor: '#1e1e38' }}>{tab.config_group}</span>}
                        </div>
                      </div>
                      {editorForTab && (
                        <span
                          className="flex items-center gap-0.5 px-1 py-0.5 rounded flex-shrink-0"
                          style={{ backgroundColor: 'rgba(110,127,255,0.15)', color: '#a5b4fc', border: '1px solid rgba(110,127,255,0.3)' }}
                          onClick={e => { e.stopPropagation(); onRestoreEditor?.(editorForTab.project_id); setShowOverflow(false); }}
                          title={`Restaurar editor de ${editorForTab.project_name}`}
                        >
                          <span style={{ fontSize: '10px' }}>📝</span><Maximize2 size={10} />
                        </span>
                      )}
                      <button
                        className="p-1 rounded hover:bg-hover flex-shrink-0"
                        onClick={e => { e.stopPropagation(); onCloseTab(tab.process_id); if (overflowTabs.length + overflowStandalone.length === 1) setShowOverflow(false); }}
                        style={{ color: '#6b7280' }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
                {overflowTabs.length > 0 && overflowStandalone.length > 0 && (
                  <div className="mx-2 my-1" style={{ borderTop: '1px solid var(--border-color)' }} />
                )}
                {overflowStandalone.map(ed => (
                  <div
                    key={`ov-ed-${ed.project_id}`}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-hover transition-colors cursor-pointer"
                    onClick={() => { onRestoreEditor?.(ed.project_id); setShowOverflow(false); }}
                  >
                    <span style={{ fontSize: '11px' }}>📝</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate text-primary">{ed.project_name}</div>
                      <div className="text-[10px] truncate text-muted">Editor · {(gitBranches[ed.project_id] ?? ed.git_branch) || 'sin rama'}</div>
                    </div>
                    <span className="px-1.5 py-0.5 rounded text-[10px] flex-shrink-0" style={{ backgroundColor: 'rgba(110,127,255,0.15)', color: '#a5b4fc' }}>Restaurar</span>
                    <button
                      className="p-1 rounded hover:bg-hover flex-shrink-0"
                      onClick={e => { e.stopPropagation(); onCloseEditor?.(ed.project_id); if (overflowTabs.length + overflowStandalone.length === 1) setShowOverflow(false); }}
                      style={{ color: '#6b7280' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
