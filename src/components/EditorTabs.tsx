import { useState, useRef, useLayoutEffect, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, XCircle, ChevronDown } from 'lucide-react';

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
  onSelectOverflow?: (index: number, visibleCount: number) => void;
  onClose: (index: number) => void;
  onCloseAll?: () => void;
}

export function EditorTabs({ files, activeIndex, onSelect, onSelectOverflow, onClose, onCloseAll }: EditorTabsProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(files.length);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);
  const overflowBtnRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const hasDirty = files.some(f => f.dirty);

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path).then(() => {
      setCopied(path);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  };

  // Measure how many tabs fit — runs after every render so tab DOM widths are fresh
  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const OVERFLOW_BTN_W = 80;
    const CLOSE_ALL_W = 110;
    const totalW = container.offsetWidth;

    // First pass: try fitting all tabs (no overflow btn needed)
    let used = 0;
    let countAll = 0;
    for (let i = 0; i < tabRefs.current.length; i++) {
      const el = tabRefs.current[i];
      if (!el) continue;
      // Use getBoundingClientRect for accurate width even when display:none
      const w = el.getBoundingClientRect().width || el.offsetWidth || 100;
      if (used + w > totalW - CLOSE_ALL_W) break;
      used += w;
      countAll++;
    }

    if (countAll >= files.length) {
      // All fit without overflow button
      setVisibleCount(files.length);
      return;
    }

    // Second pass: fit as many as possible, leaving room for overflow btn
    let used2 = 0;
    let count2 = 0;
    for (let i = 0; i < tabRefs.current.length; i++) {
      const el = tabRefs.current[i];
      if (!el) continue;
      const w = el.getBoundingClientRect().width || el.offsetWidth || 100;
      if (used2 + w > totalW - CLOSE_ALL_W - OVERFLOW_BTN_W) break;
      used2 += w;
      count2++;
    }

    setVisibleCount(Math.max(1, count2));
  }, [files.length]);

  // Re-measure when files change
  useLayoutEffect(() => {
    tabRefs.current = tabRefs.current.slice(0, files.length);
    // Small delay so tabs are painted with real widths before measuring
    const id = requestAnimationFrame(() => measure());
    return () => cancelAnimationFrame(id);
  }, [files, measure]);

  // Re-measure on container resize
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(container);
    return () => ro.disconnect();
  }, [measure]);

  // Close dropdown when clicking outside — but NOT when clicking the button or inside the dropdown
  useEffect(() => {
    if (!overflowOpen) return;
    const handleDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (overflowBtnRef.current?.contains(t)) return; // button toggles on its own click handler
      if (dropdownRef.current?.contains(t)) return;    // inside dropdown — don't close
      setOverflowOpen(false);
    };
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [overflowOpen]);

  const overflowFiles = files.slice(visibleCount);
  const hasOverflow = overflowFiles.length > 0;
  const activeIsOverflowed = activeIndex >= visibleCount;

  return (
    <div
      ref={containerRef}
      className="flex items-stretch flex-shrink-0 relative"
      style={{
        height: '32px',
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-base)',
        overflow: 'hidden',
      }}
    >
      {/* All tabs: visible ones shown, overflow ones hidden via display:none */}
      {files.map((file, i) => (
        <div
          key={file.path}
          ref={el => { tabRefs.current[i] = el; }}
          onClick={() => { onSelect(i); setOverflowOpen(false); }}
          onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); onClose(i); } }}
          onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(i); } }}
          onContextMenu={(e) => { e.preventDefault(); copyPath(file.path); }}
          className="group flex items-center gap-1 px-2 text-xs whitespace-nowrap transition-colors flex-shrink-0 cursor-pointer"
          style={{
            display: i < visibleCount ? 'flex' : 'none',
            backgroundColor: i === activeIndex ? 'var(--bg-surface)' : 'transparent',
            color: i === activeIndex ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderRight: '1px solid var(--border-color)',
            borderBottom: i === activeIndex ? '2px solid #6e7fff' : '2px solid transparent',
          }}
          title={`${file.path} — click para abrir, click derecho para copiar ruta`}
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
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
            onMouseLeave={e => { e.currentTarget.style.color = i === activeIndex ? 'var(--text-muted)' : 'transparent'; }}
          >
            <X size={11} />
          </span>
        </div>
      ))}

      {/* Overflow button + dropdown */}
      {hasOverflow && (
        <div
          ref={overflowBtnRef}
          className="flex items-center flex-shrink-0 relative"
          style={{ borderRight: '1px solid var(--border-color)' }}
        >
          <button
            onMouseDown={(e) => {
              // Use mousedown so we toggle before the outside-click listener fires
              e.stopPropagation();
              if (!overflowOpen && overflowBtnRef.current) {
                const rect = overflowBtnRef.current.getBoundingClientRect();
                setDropdownPos({ top: rect.bottom, left: rect.left });
              }
              setOverflowOpen(prev => !prev);
            }}
            className="flex items-center gap-1 px-2 h-full text-[11px] transition-colors hover:bg-hover select-none"
            style={{
              color: activeIsOverflowed ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: activeIsOverflowed ? '2px solid #6e7fff' : '2px solid transparent',
              backgroundColor: activeIsOverflowed ? 'var(--bg-surface)' : 'transparent',
            }}
            title="Ver más pestañas"
          >
            {activeIsOverflowed && overflowFiles[activeIndex - visibleCount]?.dirty && (
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#fbbf24' }} />
            )}
            <span>+{overflowFiles.length}</span>
            <ChevronDown
              size={11}
              style={{ transition: 'transform 150ms', transform: overflowOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>

          {/* Dropdown via portal — escapes overflow:hidden parents */}
          {createPortal(
            <div
              ref={dropdownRef}
              className="rounded-lg shadow-2xl py-1 min-w-[220px] max-h-[320px] overflow-y-auto"
              style={{
                position: 'fixed',
                top: dropdownPos.top,
                left: dropdownPos.left,
                zIndex: 9999,
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-color)',
                visibility: overflowOpen ? 'visible' : 'hidden',
                pointerEvents: overflowOpen ? 'auto' : 'none',
                opacity: overflowOpen ? 1 : 0,
                transition: 'opacity 100ms',
              }}
            >
              {overflowFiles.map((file, j) => {
                const realIndex = visibleCount + j;
                const isActive = realIndex === activeIndex;
                return (
                  <div
                    key={file.path}
                    className="group flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors hover:bg-hover"
                    style={{
                      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                      backgroundColor: isActive ? 'var(--bg-hover)' : 'transparent',
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (onSelectOverflow) onSelectOverflow(realIndex, visibleCount);
                      else onSelect(realIndex);
                      setOverflowOpen(false);
                    }}
                    title={file.path}
                  >
                    {file.dirty
                      ? <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#fbbf24' }} />
                      : <span className="w-1.5 h-1.5 flex-shrink-0" />
                    }
                    <span className="flex-1 truncate">{file.name}</span>
                    <span
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-hover transition-colors flex-shrink-0 ml-auto"
                      onMouseDown={(e) => { e.stopPropagation(); onClose(realIndex); }}
                      title="Cerrar pestaña"
                    >
                      <X size={11} style={{ color: 'var(--text-muted)' }} />
                    </span>
                  </div>
                );
              })}
            </div>,
            document.body
          )}
        </div>
      )}

      {/* Close all — pinned right */}
      {files.length > 0 && onCloseAll && (
        <div
          className="flex items-center px-2 flex-shrink-0 ml-auto"
          style={{ borderLeft: '1px solid var(--border-color)' }}
        >
          <button
            onClick={() => onCloseAll()}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors hover:bg-hover"
            style={{ color: hasDirty ? '#fbbf24' : 'var(--text-muted)' }}
            title="Cerrar todas las pestañas"
          >
            <XCircle size={12} />
            <span>Cerrar todas</span>
          </button>
        </div>
      )}
    </div>
  );
}
