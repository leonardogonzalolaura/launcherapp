import { useEffect, useRef, useState } from 'react';
import { Square, X, Trash, CornerDownLeft } from 'lucide-react';
import { ProcessTab } from '../types';
import { ProcessTabBar } from './ProcessTabBar';
import { classifyLine, renderContentWithLinks } from './ConsoleTab';

interface PsConsoleProps {
  tab: ProcessTab;
  onStop: (processId: string) => void;
  onClose: (processId: string) => void;
  onClear: (processId: string) => void;
  onEcho: (processId: string, content: string) => void;
  onSend: (processId: string, input: string) => Promise<void>;
  tabPosition: 'top' | 'bottom';
  allTabs: ProcessTab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  gitBranches: Record<string, string | null>;
}

export function PsConsole({
  tab,
  onStop,
  onClose,
  onClear,
  onEcho,
  onSend,
  tabPosition,
  allTabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  gitBranches,
}: PsConsoleProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState('');
  const [elapsed, setElapsed] = useState('00:00:00');
  const running = tab.status === 'running';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tab.logs]);

  useEffect(() => {
    if (running) {
      inputRef.current?.focus();
    }
  }, [running]);

  useEffect(() => {
    if (tab.status !== 'running') return;
    const start = new Date(tab.started_at).getTime();
    const update = () => {
      const diff = Math.floor((Date.now() - start) / 1000);
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [tab.started_at, tab.status]);

  const handleSubmit = () => {
    const value = input.trim();
    if (!value || !running) return;

    if (value === 'clear') {
      onClear(tab.process_id);
      setInput('');
      return;
    }

    onEcho(tab.process_id, value);
    setInput('');
    onSend(tab.process_id, value).catch(e => {
      onEcho(tab.process_id, `(error enviando comando: ${e})`);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const statusColor = running ? '#4ade80' : tab.status === 'error' ? '#f87171' : '#555878';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-1.5 flex-shrink-0 bg-surface" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <div className="flex items-center gap-3">
          <span className={running ? 'animate-pulse-dot' : ''} style={{ color: statusColor, fontSize: '10px', lineHeight: 1 }}>●</span>
          <span className="font-mono text-[11px] font-medium" style={{ color: '#c084fc' }}>&gt;_ PowerShell</span>
          <span className="text-[10px] text-muted">{tab.project_name}</span>
          {running && (
            <span className="font-mono text-[11px] text-muted">⏱ {elapsed}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {tab.logs.length > 0 && (
            <button
              onClick={() => onClear(tab.process_id)}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all"
              style={{ backgroundColor: 'rgba(100,100,140,.15)', color: '#8890b0', border: '1px solid rgba(100,100,140,.3)' }}
              title="Limpiar consola"
            >
              <Trash size={12} /> Clean
            </button>
          )}
          {running && (
            <button
              onClick={() => onStop(tab.process_id)}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all"
              style={{ backgroundColor: 'rgba(239,68,68,.15)', color: '#f87171', border: '1px solid rgba(239,68,68,.3)' }}
              title="Detener sesión"
            >
              <Square size={12} /> Stop
            </button>
          )}
          <button
            onClick={() => onClose(tab.process_id)}
            className="p-1 rounded transition-colors hover:bg-hover"
            style={{ color: '#555878' }}
            title="Cerrar pestaña"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tabs arriba */}
      {tabPosition === 'top' && (
        <ProcessTabBar
          tabs={allTabs}
          activeTabId={activeTabId}
          gitBranches={gitBranches}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
        />
      )}

      {/* Log output */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs bg-base">
        {tab.logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center" style={{ color: 'var(--text-muted)' }}>
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl opacity-20">&gt;_</span>
              <p className="text-sm">Sesión PowerShell de {tab.project_name}</p>
              <p className="text-xs">Escribe un comando y pulsa Enter</p>
            </div>
          </div>
        ) : (
          tab.logs.map((line, idx) => {
            const classification = classifyLine(line.content, line.output_type, tab.project_type);
            const isError = classification.category === 'error';
            const isWarning = classification.category === 'warning';
            const lineColor = classification.color;
            return (
              <div
                key={line.id}
                className="flex gap-3 mb-0.5 leading-5 rounded transition-colors hover:bg-gray-800/20"
                style={{
                  borderLeft: isError ? '2px solid #f87171' : isWarning ? '2px solid #fbbf24' : '2px solid transparent',
                  paddingLeft: '6px',
                  backgroundColor: isError ? 'rgba(248,113,113,0.06)' : isWarning ? 'rgba(251,191,36,0.06)' : 'transparent',
                }}
              >
                <span className="flex-shrink-0 select-none text-right w-8" style={{ color: '#333558' }}>
                  {idx + 1}
                </span>
                <span className="flex-shrink-0 select-none" style={{ color: '#333558' }}>
                  {new Date(line.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="whitespace-pre-wrap break-all flex-1" style={{ color: lineColor }}>
                  {renderContentWithLinks(line.content)}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0 bg-surface" style={{ borderTop: '1px solid var(--border-color)' }}>
        <span className="font-mono text-xs font-medium flex-shrink-0" style={{ color: '#c084fc' }}>
          PS {tab.project_name}&gt;
        </span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!running}
          placeholder={running ? 'Escribe un comando y pulsa Enter (exit para cerrar)' : 'La sesión ha terminado'}
          className="flex-1 bg-transparent font-mono text-xs outline-none text-primary"
          style={{ color: 'var(--text-console)' }}
          spellCheck={false}
          autoComplete="off"
        />
        <button
          onClick={handleSubmit}
          disabled={!running || !input.trim()}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all disabled:opacity-40"
          style={{ backgroundColor: 'rgba(147,51,234,.15)', color: '#c084fc', border: '1px solid rgba(147,51,234,.3)' }}
          title="Enviar (Enter)"
        >
          <CornerDownLeft size={11} /> Run
        </button>
      </div>

      {/* Tabs abajo */}
      {tabPosition === 'bottom' && (
        <ProcessTabBar
          tabs={allTabs}
          activeTabId={activeTabId}
          gitBranches={gitBranches}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
        />
      )}
    </div>
  );
}