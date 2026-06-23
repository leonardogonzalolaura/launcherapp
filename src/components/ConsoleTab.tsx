import { useEffect, useRef, useState } from 'react';
import { Square, X, Play, Trash, Copy, ArrowDown, Filter, Globe } from 'lucide-react';
import { ProcessTab } from '../types';
import { JsonViewer, isJsonLine } from './JsonViewer';
import { ApiExplorer } from './ApiExplorer';
import { ProcessTabBar } from './ProcessTabBar';

interface ConsoleTabProps {
  tab: ProcessTab;
  liveGitBranch?: string | null;
  onStop: (processId: string) => void;
  onClose: (processId: string) => void;
  onRerun: (processId: string) => void;
  onClear: (processId: string) => void;
  tabPosition: 'top' | 'bottom';
  allTabs: ProcessTab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  gitBranches: Record<string, string | null>;
}

// Detectar líneas de éxito (transversal a todos los lenguajes)
const isSuccessLine = (content: string): boolean => {
  const lowerContent = content.toLowerCase();
  const successPatterns = [
    'build succeeded',
    'compilation succeeded',
    'build successful',
    'exited with code 0',
    '✅',
    'finished successfully',
    'completed successfully'
  ];
  return successPatterns.some(pattern => lowerContent.includes(pattern));
};

// ─── DETECCIÓN ESPECÍFICA PARA RUST ──────────────────────────────────────────
const isRustWarning = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('warning:') || 
         lower.includes('unused import') ||
         lower.includes('unused variable') ||
         lower.includes('unused_') ||
         lower.includes('dead_code') ||
         lower.includes('deprecated') ||
         lower.includes('clippy::') ||
         lower.includes('redundant_') ||
         lower.includes('non_snake_case') ||
         lower.includes('non_camel_case_types') ||
         /-->.*\.rs:\d+:\d+/.test(content);
};

const isRustError = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('error[') ||      // error[E0432]
         lower.includes('error:') ||
         lower.includes('could not compile') ||
         lower.includes('aborting due to') ||
         lower.includes('mismatched types') ||
         lower.includes('cannot find') ||
         lower.includes('unresolved import') ||
         lower.includes('panic') ||
         lower.includes('thread panicked');
};

const isRustNote = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('note:') || 
         lower.includes('help:') ||
         lower.includes('= note:') ||
         lower.includes('= help:');
};

const isRustLocationLine = (content: string): boolean => {
  return /^\s*-->/.test(content) || /^\s*\d+\s*\|\s*/.test(content);
};

// ─── DETECCIÓN ESPECÍFICA PARA PYTHON ────────────────────────────────────────
const isPythonWarning = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('deprecationwarning') ||
         lower.includes('syntaxwarning') ||
         lower.includes('userwarning') ||
         lower.includes('pendingdeprecationwarning') ||
         lower.includes('runtimewarning') ||
         lower.includes('futurewarning') ||
         lower.includes('importwarning') ||        
         lower.includes(' - warning - ') ||
         lower.includes(': warning:') ||
         lower.includes('[warning]') || 
         (lower.includes('warning') && !lower.includes('error'));
};

const isPythonError = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('traceback') ||
         lower.includes('errno') ||
         lower.includes('filenotfounderror') ||
         lower.includes('importerror') ||
         lower.includes('modulenotfounderror') ||
         lower.includes('typeerror') ||
         lower.includes('valueerror') ||
         lower.includes('keyerror') ||
         lower.includes('attributeerror') ||
         lower.includes('syntaxerror') ||
         lower.includes('indentationerror') ||
         lower.includes('nameerror') ||
         lower.includes(' - error - ') ||
         lower.includes(': error:') ||
         lower.includes('[error]');
};

// ─── DETECCIÓN ESPECÍFICA PARA C# / .NET ─────────────────────────────────────
const isCSharpWarning = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('warning cs') ||
         lower.includes('msbuild warning') ||
         lower.includes('warn:') ||
         lower.includes('[warn]') ||
         lower.includes('info:') ||
         lower.includes('[info]') ||
         (lower.includes('warning') && (lower.includes('.cs') || lower.includes('csproj')));
};

const isCSharpError = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('error cs') ||
         lower.includes('msbuild error') ||
         lower.includes('error:') ||
         lower.includes('error') ||
         lower.includes('[error]') || 
         lower.includes('amazon.s3.amazons3exception') ||
         lower.includes('amazons3exception') ||
         lower.includes('exception') ||
         lower.includes('s3exception') ||
         lower.includes('http error') ||
         (lower.includes('error') && (lower.includes('.cs') || lower.includes('csproj')));
};

// ─── DETECCIÓN ESPECÍFICA PARA REACT / NODE ──────────────────────────────────
const isNodeWarning = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('npm warn') ||
         lower.includes('yarn warn') ||
         lower.includes('deprecated') ||
         (lower.includes('warning') && (lower.includes('node_modules') || lower.includes('package.json'))) ||
         lower.includes('@deprecated');
};

const isNodeError = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('npm err') ||
         lower.includes('yarn error') ||
         lower.includes('module not found') ||
         lower.includes('cannot find module') ||
         lower.includes('failed to compile') ||
         lower.includes('build failed') ||
         (lower.includes('error') && (lower.includes('node_modules') || lower.includes('package.json'))) ||
         lower.includes('unhandledrejection');
};

// ─── DETECCIÓN ESPECÍFICA PARA SCALA ─────────────────────────────────────────
const isScalaWarning = (content: string): boolean => {
  const lower = content.toLowerCase();
  return (lower.includes('warning') && !lower.includes('error')) ||
         lower.includes('deprecated') ||
         lower.includes('unused import') ||
         lower.includes('unused private') ||
         lower.includes('feature warning');
};

const isScalaError = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('error:') ||
         lower.includes('exception') ||
         lower.includes('not found:') ||
         lower.includes('type mismatch') ||
         lower.includes('missing parameter') ||
         lower.includes('diverging implicit expansion') ||
         lower.includes('error]') ||  
         lower.includes(' error ') ||  
         (lower.includes('error') && !lower.includes('[info]')) ||
         lower.includes('failed') ||
         lower.includes('exception in thread');
};

// ─── DETECCIÓN GENÉRICA (fallback para otros lenguajes) ─────────────────────
const isGenericWarning = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('warning:') ||
         lower.includes('warn:') ||
         lower.includes('[warn]') ||
         lower.includes('deprecated') ||
         lower.includes('obsolete');
};

const isGenericError = (content: string): boolean => {
  const lower = content.toLowerCase();
  return lower.includes('error:') ||
         lower.includes('fatal:') ||
         lower.includes('exception:') ||
         lower.includes('failed:') ||
         lower.includes('failed:') ||
         lower.includes('amazon.s3.amazons3exception') ||
         lower.includes('amazons3exception') ||
         lower.includes('exception') ||
         lower.includes('s3exception') ||
         lower.includes('http error');
         
};

// ─── FUNCIÓN PRINCIPAL DE CLASIFICACIÓN ──────────────────────────────────────
const classifyLine = (
  content: string, 
  outputType: string, 
  projectType?: string
): { category: 'error' | 'warning' | 'success' | 'info' | 'neutral'; color: string } => {
  
  // 🔥 Si es JSON y no contiene error explícito, tratarlo como neutral
  if (isJsonLine(content)) {
    const lower = content.toLowerCase();
    // Solo si contiene error explícito Y viene de stderr
    if (outputType === 'stderr' && (lower.includes('"error"') || lower.includes('"fatal"'))) {
      return { category: 'error', color: '#f87171' };
    }
    // JSON normal → neutral (sin color especial, el JsonViewer se encarga del formato)
    return { category: 'neutral', color: '#d4d4d8' };
  }
  
  // 1. Verificar éxito primero (transversal)
  if (isSuccessLine(content)) {
    return { category: 'success', color: '#a8ffb0' };
  }

  // 2. Detección por lenguaje específico
  if (projectType === 'Rust') {
    if (isRustError(content)) return { category: 'error', color: '#f87171' };
    if (isRustWarning(content)) return { category: 'warning', color: '#fbbf24' };
    if (isRustNote(content)) return { category: 'info', color: '#60a5fa' };
    if (isRustLocationLine(content)) return { category: 'info', color: '#555878' };
  }
  
  else if (projectType === 'Python') {
    if (isPythonError(content)) return { category: 'error', color: '#f87171' };
    if (isPythonWarning(content)) return { category: 'warning', color: '#fbbf24' };
  }
  
  else if (projectType === 'CSharp') {
    if (isCSharpError(content)) return { category: 'error', color: '#f87171' };
    if (isCSharpWarning(content)) return { category: 'warning', color: '#fbbf24' };
  }
  
  else if (projectType === 'JavaScript') {
    if (isNodeError(content)) return { category: 'error', color: '#f87171' };
    if (isNodeWarning(content)) return { category: 'warning', color: '#fbbf24' };
  }

  else if (projectType === 'React' || projectType === 'Node') {
    if (isNodeError(content)) return { category: 'error', color: '#f87171' };
    if (isNodeWarning(content)) return { category: 'warning', color: '#fbbf24' };
  }
  
  else if (projectType === 'Scala') {
    if (isScalaError(content)) return { category: 'error', color: '#f87171' };
    if (isScalaWarning(content)) return { category: 'warning', color: '#fbbf24' };
  }

  // 3. Detección genérica basada en el tipo de salida
  if (outputType === 'stderr') {
    if (isGenericWarning(content)) return { category: 'warning', color: '#fbbf24' };
    if (isGenericError(content)) return { category: 'error', color: '#f87171' };
    return { category: 'info', color: '#d4d4d8' };
  }
  
  if (outputType === 'error') {
    return { category: 'error', color: '#f87171' };
  }
  
  if (outputType === 'info') {
    return { category: 'info', color: '#60a5fa' };
  }
  
  // 4. Caso por defecto (stdout normal)
  return { category: 'neutral', color: '#d4d4d8' };
};

// Versión con window.open para URLs clickeables y JSON viewer
const renderContentWithLinks = (content: string) => {
  // 🔥 Si es JSON, usar el JsonViewer component
  if (isJsonLine(content)) {
    return <JsonViewer content={content} />;
  }
  
  // Resto del código para URLs
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+|www\.[^\s<>"{}|\\^`[\]]+|[a-zA-Z0-9-]+\.(?:com|org|net|io|dev|app|co|me|xyz|info|online|tech|site|cloud|github\.io|gitlab\.io|vercel\.app|netlify\.app|npmjs\.com)[^\s<>"{}|\\^`[\]]*)/gi;
  
  const parts = content.split(urlRegex);
  const matches = content.match(urlRegex) || [];
  let matchIndex = 0;
  
  return parts.map((part, i) => {
    if (matches[matchIndex] && part === matches[matchIndex]) {
      let url = part;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }
      matchIndex++;
      return (
        <button
          key={i}
          onClick={(e) => {
            e.stopPropagation();
            window.open(url, '_blank', 'noopener,noreferrer');
          }}
          className="hover:underline cursor-pointer inline-flex items-center gap-0.5 rounded px-0.5 transition-colors"
          style={{ color: '#60a5fa', background: 'none', border: 'none', padding: '0 2px' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(96,165,250,.15)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          title={`Click to open: ${url}`}
        >
          {part}
          <svg className="w-2.5 h-2.5 inline-block flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      );
    }
    return <span key={i}>{part}</span>;
  });
};

export function ConsoleTab({ tab, onStop, onClose, onRerun, onClear, tabPosition, allTabs, activeTabId, onSelectTab, onCloseTab, gitBranches }: ConsoleTabProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [logFilter, setLogFilter] = useState<'all' | 'error' | 'warning' | 'success'>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showApiExplorer, setShowApiExplorer] = useState(false);
  const [isApiExplorerMaximized, setIsApiExplorerMaximized] = useState(false);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [tab.logs, autoScroll]);

  // Filtrar logs según selección
  const filteredLogs = tab.logs.filter(line => {
    if (logFilter === 'all') return true;
    
    const classification = classifyLine(line.content, line.output_type, tab.project_type);
    
    if (logFilter === 'error') return classification.category === 'error';
    if (logFilter === 'warning') return classification.category === 'warning';
    if (logFilter === 'success') return classification.category === 'success';
    return true;
  });

  // Contar estadísticas usando la clasificación correcta
  const errorCount = tab.logs.filter(l => 
    classifyLine(l.content, l.output_type, tab.project_type).category === 'error'
  ).length;
  
  const warningCount = tab.logs.filter(l => 
    classifyLine(l.content, l.output_type, tab.project_type).category === 'warning'
  ).length;
  
  const successCount = tab.logs.filter(l => 
    classifyLine(l.content, l.output_type, tab.project_type).category === 'success'
  ).length;

  // Copiar todos los logs
  const copyAllLogs = async () => {
    const content = filteredLogs.map(log => log.content).join('\n');
    await navigator.clipboard.writeText(content);
  };

  const statusColor = tab.status === 'running' ? '#4ade80' : tab.status === 'error' ? '#f87171' : '#555878';
  
  const handleClear = () => {
    if (tab.logs.length > 0) {
      onClear(tab.process_id);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tab header - simplificado */}
      <div className="flex items-center justify-between px-4 py-1.5 flex-shrink-0" style={{ backgroundColor: '#13131f', borderBottom: '1px solid #252540' }}>
        {/* Left side - solo status + stats */}
        <div className="flex items-center gap-2">
          <span style={{ color: statusColor, fontSize: '8px' }}>●</span>
          {/* Estadísticas en tiempo real */}
          {(errorCount > 0 || warningCount > 0 || successCount > 0) && (
            <div className="flex items-center gap-1.5 text-xs">
              {errorCount > 0 && (
                <span style={{ color: '#f87171' }} className="flex items-center gap-0.5 cursor-help" title={`${errorCount} error(es)`}>
                  🔴 {errorCount}
                </span>
              )}
              {warningCount > 0 && (
                <span style={{ color: '#fbbf24' }} className="flex items-center gap-0.5 cursor-help" title={`${warningCount} advertencia(s)`}>
                  🟡 {warningCount}
                </span>
              )}
              {successCount > 0 && (
                <span style={{ color: '#4ade80' }} className="flex items-center gap-0.5 cursor-help" title={`${successCount} éxito(s)`}>
                  🟢 {successCount}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right side - Botones de acción */}
        <div className="flex items-center gap-2">
          {/* Botón de filtro */}
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className="p-1 rounded transition-colors hover:bg-[#1f1f35]"
              style={{ color: '#555878' }}
              title="Filter logs"
            >
              <Filter size={12} />
            </button>
            {showFilterMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowFilterMenu(false)} />
                <div className="absolute right-0 mt-1 w-28 rounded-md shadow-xl z-20 overflow-hidden" style={{ backgroundColor: '#13131f', border: '1px solid #252540' }}>
                  {[
                    { value: 'all', label: '📋 All', color: '#8890b0' },
                    { value: 'error', label: '🔴 Errors', color: '#f87171' },
                    { value: 'warning', label: '🟡 Warnings', color: '#fbbf24' },
                    { value: 'success', label: '🟢 Success', color: '#4ade80' }
                  ].map(filter => (
                    <button
                      key={filter.value}
                      onClick={() => { setLogFilter(filter.value as any); setShowFilterMenu(false); }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#1f1f35] transition-colors ${logFilter === filter.value ? 'bg-[#1f1f35]' : ''}`}
                      style={{ color: filter.color }}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Botón copiar todo */}
          {filteredLogs.length > 0 && (
            <button
              onClick={copyAllLogs}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all"
              style={{ backgroundColor: 'rgba(59,130,246,.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,.3)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(59,130,246,.25)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(59,130,246,.15)')}
            >
              <Copy size={12} /> Copy
            </button>
          )}

          {/* Botón API Client (Mini Swagger/Postman) */}
          <button
            onClick={() => setShowApiExplorer(!showApiExplorer)}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all"
            style={{ 
              backgroundColor: showApiExplorer ? 'rgba(147,51,234,.25)' : 'rgba(147,51,234,.15)', 
              color: '#c084fc', 
              border: showApiExplorer ? '1px solid rgba(147,51,234,.5)' : '1px solid rgba(147,51,234,.3)' 
            }}
            onMouseEnter={e => { if(!showApiExplorer) e.currentTarget.style.backgroundColor = 'rgba(147,51,234,.25)'; }}
            onMouseLeave={e => { if(!showApiExplorer) e.currentTarget.style.backgroundColor = 'rgba(147,51,234,.15)'; }}
            title="Abrir Mini Swagger / Cliente API"
          >
            <Globe size={12} /> API Client
          </button>

          {/* Botón auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1 rounded transition-colors hover:bg-[#1f1f35] ${!autoScroll ? 'opacity-50' : ''}`}
            style={{ color: '#555878' }}
            title={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
          >
            <ArrowDown size={12} />
          </button>

          {/* Botón limpiar consola */}
          {tab.logs.length > 0 && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all"
              style={{ backgroundColor: 'rgba(100,100,140,.15)', color: '#8890b0', border: '1px solid rgba(100,100,140,.3)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(100,100,140,.25)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(100,100,140,.15)')}
            >
              <Trash size={12} /> Clean
            </button>
          )}
          
          {/* Botón Stop (si está corriendo) */}
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
          
          {/* Botón Rerun (si está detenido) */}
          {tab.status !== 'running' && (
            <button
              onClick={() => onRerun(tab.process_id)}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all"
              style={{ backgroundColor: 'rgba(74,222,128,.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,.3)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(74,222,128,.25)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(74,222,128,.15)')}
            >
              <Play size={12} /> Rerun
            </button>
          )}
          
          {/* Botón cerrar tab */}
          <button
            onClick={() => onClose(tab.process_id)}
            className="p-1 rounded transition-colors hover:bg-[#1f1f35]"
            style={{ color: '#555878' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#e2e4f0')}
            onMouseLeave={e => (e.currentTarget.style.color = '#555878')}
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

      {/* Split Layout Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Log output */}
        {(!showApiExplorer || !isApiExplorerMaximized) && (
          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs" style={{ backgroundColor: '#080810' }}>
            {filteredLogs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-center" style={{ color: '#3d3f60' }}>
                <div className="flex flex-col items-center gap-2">
                  <Trash size={24} className="opacity-30" />
                  <p className="text-sm">No logs to display</p>
                  {logFilter !== 'all' && (
                    <p className="text-xs">Try changing the filter</p>
                  )}
                </div>
              </div>
            ) : (
              filteredLogs.map((line, idx) => {
                const classification = classifyLine(line.content, line.output_type, tab.project_type);
                const isError = classification.category === 'error';
                const isWarning = classification.category === 'warning';
                const lineColor = classification.color;
                
                return (
                  <div 
                    key={line.id} 
                    className={`flex gap-3 mb-0.5 leading-5 hover:bg-gray-800/20 rounded transition-colors ${isError ? 'border-l-2 border-red-500 pl-1' : ''} ${isWarning ? 'border-l-2 border-yellow-500 pl-1' : ''}`}
                  >
                    {/* Número de línea con tooltip */}
                    <span 
                      className="flex-shrink-0 select-none text-right w-8 cursor-help" 
                      style={{ color: '#333558' }}
                      title={`Línea ${idx + 1}${isError ? ' - Contiene un error' : isWarning ? ' - Contiene una advertencia' : ''}`}
                    >
                      {idx + 1}
                    </span>
                    {/* Timestamp con tooltip */}
                    <span 
                      className="flex-shrink-0 select-none cursor-help" 
                      style={{ color: '#333558' }}
                      title={new Date(line.timestamp).toLocaleString()}
                    >
                      {new Date(line.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    {/* Contenido con URLs clickeables y JSON viewer */}
                    <span className="whitespace-pre-wrap break-all flex-1" style={{ color: lineColor }}>
                      {renderContentWithLinks(line.content)}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* API Client (Mini Swagger/Postman Panel) */}
        {showApiExplorer && (
          <div className={`${isApiExplorerMaximized ? 'w-full' : 'w-1/2 min-w-[420px]'} h-full flex-shrink-0 border-l border-[#252540] transition-all`}>
            <ApiExplorer
              projectId={tab.project_id}
              projectName={tab.project_name}
              logs={tab.logs}
              isMaximized={isApiExplorerMaximized}
              onToggleMaximize={() => setIsApiExplorerMaximized(!isApiExplorerMaximized)}
              onClose={() => setShowApiExplorer(false)}
            />
          </div>
        )}
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