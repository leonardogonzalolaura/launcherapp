import { useState } from 'react';

interface JsonViewerProps {
  content: string;
  maxPreviewLength?: number;
}

const getTypeColor = (value: any): string => {
  if (value === null) return '#fbbf24'; // amarillo para null
  if (typeof value === 'string') return '#a8ffb0'; // verde para strings
  if (typeof value === 'number') return '#60a5fa'; // azul para números
  if (typeof value === 'boolean') return '#c084fc'; // púrpura para booleanos
  if (Array.isArray(value)) return '#f87171'; // rojo para arrays
  if (typeof value === 'object') return '#fbbf24'; // amarillo para objetos
  return '#d4d4d8';
};

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const renderValue = (value: any, indent: number = 0): string => {
  const spaces = '  '.repeat(indent);
  const nextSpaces = '  '.repeat(indent + 1);
  
  if (value === null) {
    return `<span style="color: #fbbf24">null</span>`;
  }
  
  if (typeof value === 'string') {
    return `<span style="color: #a8ffb0">"${escapeHtml(value)}"</span>`;
  }
  
  if (typeof value === 'number') {
    return `<span style="color: #60a5fa">${value}</span>`;
  }
  
  if (typeof value === 'boolean') {
    return `<span style="color: #c084fc">${value}</span>`;
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `<span style="color: #f87171">[]</span>`;
    }
    const items = value.map(v => renderValue(v, indent + 1)).join(`,<br/>${nextSpaces}`);
    return `<span style="color: #f87171">[</span><br/>${nextSpaces}${items}<br/>${spaces}<span style="color: #f87171">]</span>`;
  }
  
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return `<span style="color: #fbbf24">{}</span>`;
    }
    const items = entries.map(([k, v]) => 
      `${nextSpaces}<span style="color: #6e7fff">"${escapeHtml(k)}"</span>: ${renderValue(v, indent + 1)}`
    ).join(`,<br/>`);
    return `<span style="color: #fbbf24">{</span><br/>${items}<br/>${spaces}<span style="color: #fbbf24">}</span>`;
  }
  
  return String(value);
};

export const JsonViewer = ({ content, maxPreviewLength = 80 }: JsonViewerProps) => {
  const [expanded, setExpanded] = useState(true);
  
  try {
    const parsed = JSON.parse(content);
    const isValid = true;
    
    if (!isValid) {
      return <span>{content}</span>;
    }
    
    const htmlContent = renderValue(parsed);
    
    // Vista colapsada: mostrar preview
    const preview = content.length > maxPreviewLength 
      ? content.slice(0, maxPreviewLength) + '...' 
      : content;
    
    return (
      <div className="json-viewer" style={{ fontFamily: 'monospace', display: 'inline-block' }}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 mr-2 text-gray-500 hover:text-gray-300"
          style={{ 
            background: 'none', 
            border: 'none', 
            padding: 0,
            cursor: 'pointer',
            fontSize: '10px'
          }}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▼' : '▶'}
        </button>
        {expanded ? (
          <div 
            dangerouslySetInnerHTML={{ __html: htmlContent }} 
            style={{ display: 'inline-block' }}
          />
        ) : (
          <span style={{ color: '#fbbf24', cursor: 'pointer' }} onClick={() => setExpanded(true)}>
            {preview}
          </span>
        )}
      </div>
    );
  } catch {
    // No es JSON válido, devolver el contenido original
    return <span>{content}</span>;
  }
};

// Función helper para detectar si una línea es JSON
export const isJsonLine = (content: string): boolean => {
  const trimmed = content.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
         (trimmed.startsWith('[') && trimmed.endsWith(']'));
};