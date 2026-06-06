import { useEffect, useRef } from 'react';
import { Square, X, Play, Trash } from 'lucide-react';
import { ProcessTab, LogLine } from '../types';

interface ConsoleTabProps {
  tab: ProcessTab;
  liveGitBranch?: string | null;
  onStop: (processId: string) => void;
  onClose: (processId: string) => void;
  onRerun: (processId: string) => void;
  onClear: (processId: string) => void;
}

export function ConsoleTab({ tab, liveGitBranch, onStop, onClose, onRerun, onClear  }: ConsoleTabProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tab.logs]);

  const getLineColor = (type: LogLine['output_type']) => {
    switch (type) {
      case 'stdout': return '#a8ffb0';
      case 'stderr': return '#fca5a5';
      case 'error': return '#f87171';
      case 'info': return '#8890b0';
      default: return '#8890b0';
    }
  };

  const statusColor = tab.status === 'running' ? '#4ade80' : tab.status === 'error' ? '#f87171' : '#555878';
  
  const handleClear = () => {
    if (tab.logs.length > 0) {
      onClear(tab.process_id);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tab header */}
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ backgroundColor: '#13131f', borderBottom: '1px solid #252540' }}>
        <div className="flex items-center gap-3">
          <span style={{ color: statusColor, fontSize: '8px' }}>●</span>
          <span className="font-mono text-sm font-medium">{tab.project_name}</span>
          <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: '#1a1a2e', color: '#6e7fff', border: '1px solid #2e2e50' }}>
            {tab.config_name}
          </span>
          {(liveGitBranch ?? tab.git_branch) && (
            <span
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded font-mono"
              style={{ backgroundColor: '#1e1529', color: '#c084fc', border: '1px solid #4c1d95' }}
              title={`Rama git: ${liveGitBranch ?? tab.git_branch}`}
            >
              ⎇ {liveGitBranch ?? tab.git_branch}
            </span>
          )}
          <span className="text-xs" style={{ color: '#555878' }}>
            {new Date(tab.started_at).toLocaleTimeString()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {tab.logs.length > 0 && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all"
              style={{ 
              backgroundColor: 'rgba(100,100,140,.15)', 
              color: '#8890b0', 
              border: '1px solid rgba(100,100,140,.3)' 
              }}
             onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(100,100,140,.25)')}
             onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(100,100,140,.15)')}
            >
              <Trash size={12} /> Clean
            </button>
          )}
          
          {tab.status === 'running' && (
            <button
              onClick={() => onStop(tab.process_id)}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all"
              style={{ backgroundColor: 'rgba(239,68,68,.15)', color: '#f87171', border: '1px solid rgba(239,68,68,.3)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,.25)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,.15)')}
            >
              <Square size={12} /> Stop
            </button>
          )}
          {tab.status !== 'running' && (
            <button
              onClick={() => onRerun(tab.process_id)}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all"
              style={{ backgroundColor: 'rgba(74,222,128,.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,.3)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(74,222,128,.25)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(74,222,128,.15)')}
            >
              <Play size={12} fill="#4ade80" /> Rerun
            </button>
          )}
          <button
            onClick={() => onClose(tab.process_id)}
            className="p-1 rounded transition-colors"
            style={{ color: '#555878' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#e2e4f0')}
            onMouseLeave={e => (e.currentTarget.style.color = '#555878')}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Log output */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs" style={{ backgroundColor: '#080810' }}>
        {tab.logs.map(line => (
          <div key={line.id} className="flex gap-3 mb-0.5 leading-5">
            <span className="flex-shrink-0 select-none" style={{ color: '#333558' }}>
              {new Date(line.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="whitespace-pre-wrap break-all" style={{ color: getLineColor(line.output_type) }}>
              {line.content}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
