import React, { useState, useEffect, useRef } from 'react';
import { Search, AlertCircle, Send, Globe, CheckCircle, Maximize2, Minimize2, Copy, Check } from 'lucide-react';

import { invoke } from '@tauri-apps/api/core';
import { JsonViewer } from './JsonViewer';

interface LogLine {
  id: string;
  output_type: 'stdout' | 'stderr' | 'info' | 'error' | 'exit';
  content: string;
  timestamp: string;
}

interface ApiExplorerProps {
  projectId: string;
  projectName: string;
  logs: LogLine[];
  isMaximized: boolean;
  onToggleMaximize: () => void;
  onClose: () => void;
}

interface ApiEndpoint {
  path: string;
  method: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: any[];
  requestBody?: any;
}

interface BackendResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export function ApiExplorer({ projectId, projectName, logs, isMaximized, onToggleMaximize, onClose }: ApiExplorerProps) {
  const [swaggerUrl, setSwaggerUrl] = useState(() => {
    return localStorage.getItem(`launcher_swagger_url_${projectId}`) || 'http://localhost:8000/openapi.json';
  });

  // Optional path prefix inserted between host and endpoint path when executing
  // e.g. if prefix is "/api/v1", then: host + /api/v1 + /pipelines
  const [pathPrefix, setPathPrefix] = useState(() => {
    return localStorage.getItem(`launcher_path_prefix_${projectId}`) || '';
  });
  const [showPathPrefix, setShowPathPrefix] = useState(() => {
    return !!localStorage.getItem(`launcher_path_prefix_${projectId}`);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  const [detectedStatus, setDetectedStatus] = useState<string | null>(null);

  // Resizable sidebar states
  const containerRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newWidth = e.clientX - rect.left;
        setSidebarWidth(Math.max(180, Math.min(600, newWidth)));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Form states for execution
  const [pathParams, setPathParams] = useState<Record<string, string>>({});
  const [queryParams, setQueryParams] = useState<Record<string, string>>({});
  const [headers, setHeaders] = useState<Record<string, string>>({
    'Content-Type': 'application/json'
  });
  const [requestBody, setRequestBody] = useState<string>('{}');

  // Response states
  const [executing, setExecuting] = useState(false);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  const [responseBody, setResponseBody] = useState<string>('');
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Manual endpoint entry mode (if Swagger/OpenAPI is not available)
  const [manualMode, setManualMode] = useState(false);
  const [manualMethod, setManualMethod] = useState('GET');
  const [manualPath, setManualPath] = useState('http://localhost:8000/api/v1/resource');

  const hasAutoDetected = useRef(false);

  // Save swagger url
  useEffect(() => {
    if (swaggerUrl) {
      localStorage.setItem(`launcher_swagger_url_${projectId}`, swaggerUrl);
    }
  }, [swaggerUrl, projectId]);

  // Load saved endpoints schema if any
  useEffect(() => {
    const savedSchema = localStorage.getItem(`launcher_swagger_schema_${projectId}`);
    if (savedSchema) {
      try {
        parseSwaggerSchema(JSON.parse(savedSchema));
      } catch (e) {
        console.error('Error loading saved schema:', e);
      }
    }
  }, [projectId]);

  // Auto-detect base URL and Swagger JSON from logs
  useEffect(() => {
    if (hasAutoDetected.current || logs.length === 0 || endpoints.length > 0) return;

    // Scan logs for URLs like http://localhost:8000, http://127.0.0.1:5000, etc.
    const urlRegex = /(https?:\/\/localhost:\d+|https?:\/\/127\.0\.0\.1:\d+|https?:\/\/0\.0\.0\.0:\d+)/i;
    let detectedBaseUrl: string | null = null;

    for (const log of logs) {
      const match = log.content.match(urlRegex);
      if (match) {
        // Replace 0.0.0.0 with localhost for fetching
        detectedBaseUrl = match[1].replace('0.0.0.0', 'localhost');
        break;
      }
    }

    if (detectedBaseUrl) {
      hasAutoDetected.current = true;
      probeSwaggerEndpoints(detectedBaseUrl);
    }
  }, [logs, endpoints.length]);

  const probeSwaggerEndpoints = async (baseUrl: string) => {
    // All path combinations to probe: basePaths x jsonSuffixes
    // This handles: FastAPI (/openapi.json), Connexion (/api/v1/openapi.json),
    // ASP.NET Core (/swagger/v1/swagger.json), Flask-RESTX (/swagger.json), etc.
    const basePaths = [
      '',
      '/api/v1',
      '/api/v2',
      '/api',
      '/api/util',
      '/api/generic',
    ];
    const jsonSuffixes = [
      '/openapi.json',
      '/swagger.json',
      '/swagger/v1/swagger.json',
      '/api-docs',
      '/v2/api-docs',
    ];

    setLoading(true);
    setDetectedStatus('Buscando endpoints activos...');

    // Build all unique URLs to probe
    const urlsToProbe: string[] = [];
    const seen = new Set<string>();
    for (const base of basePaths) {
      for (const suffix of jsonSuffixes) {
        const fullUrl = `${baseUrl}${base}${suffix}`;
        if (!seen.has(fullUrl)) {
          seen.add(fullUrl);
          urlsToProbe.push(fullUrl);
        }
      }
    }

    // Fire all requests in parallel for speed
    const tryFetch = async (url: string): Promise<{ url: string; data: any } | null> => {
      try {
        const responseText: string = await invoke('fetch_external_url', { url });
        const data = JSON.parse(responseText);
        if (data && (data.paths || data.openapi || data.swagger)) {
          return { url, data };
        }
      } catch (_) { /* ignore */ }
      return null;
    };

    const results = await Promise.allSettled(urlsToProbe.map(tryFetch));
    const foundSchemas = results
      .filter((r): r is PromiseFulfilledResult<{ url: string; data: any }> =>
        r.status === 'fulfilled' && r.value !== null
      )
      .map(r => r.value);

    if (foundSchemas.length > 0) {
      const merged = mergeSchemas(foundSchemas.map(s => s.data));
      const primaryUrl = foundSchemas[0].url;
      setSwaggerUrl(primaryUrl);
      localStorage.setItem(`launcher_swagger_url_${projectId}`, primaryUrl);
      localStorage.setItem(`launcher_swagger_schema_${projectId}`, JSON.stringify(merged));
      parseSwaggerSchema(merged);

      const msg = foundSchemas.length > 1
        ? `¡${foundSchemas.length} esquemas combinados automáticamente!`
        : `¡API auto-detectada!`;
      setDetectedStatus(msg);
      setTimeout(() => setDetectedStatus(null), 6000);
    } else {
      setDetectedStatus(null);
    }

    setLoading(false);
  };

  /**
   * Merges multiple OpenAPI schemas into one combined schema.
   * All paths from all schemas are collected, with a prefix tag showing which
   * spec they came from if they differ.
   */
  const mergeSchemas = (schemas: any[]): any => {
    if (schemas.length === 1) return schemas[0];

    const base = { ...schemas[0] };
    base.paths = { ...(base.paths || {}) };

    for (let i = 1; i < schemas.length; i++) {
      const schema = schemas[i];
      if (schema.paths) {
        Object.entries(schema.paths).forEach(([path, pathItem]) => {
          if (!base.paths[path]) {
            base.paths[path] = pathItem;
          }
        });
      }
      // Merge components/schemas if present
      if (schema.components?.schemas && base.components) {
        base.components.schemas = {
          ...(base.components.schemas || {}),
          ...schema.components.schemas,
        };
      }
    }

    return base;
  };



  const fetchSwagger = async () => {
    setLoading(true);
    setError(null);

    let targetUrls = [swaggerUrl];
    const errorDetails: string[] = [];

    // If it's an HTML page, first download the HTML to extract the JSON schema URL from its javascript code!
    if (swaggerUrl.endsWith('.html') || swaggerUrl.includes('/docs') || swaggerUrl.includes('/swagger')) {
      try {
        setDetectedStatus("Leyendo página HTML de Swagger...");
        const htmlText: string = await invoke('fetch_external_url', { url: swaggerUrl });
        
        // Regex to search for patterns like: url: "/api/generic/docs/v1/swagger.json" or url = '...'
        const urlMatch = htmlText.match(/url\s*:\s*["']([^"']+\.json[^"']*)["']/i) ||
                         htmlText.match(/url\s*=\s*["']([^"']+\.json[^"']*)["']/i) ||
                         htmlText.match(/["']url["']\s*:\s*["']([^"']+\.json[^"']*)["']/i);
        
        if (urlMatch) {
          const extractedPath = urlMatch[1];
          // Resolve relative URL to absolute URL based on the current page URL
          const resolvedUrl = new URL(extractedPath, swaggerUrl).href;
          targetUrls.unshift(resolvedUrl); // Put it at the beginning to try it first!
          console.log("Swagger JSON URL auto-detected from HTML:", resolvedUrl);
        }
      } catch (e: any) {
        console.warn("Could not parse index.html for swagger JSON path:", e);
      }

      // Add common fallbacks
      try {
        const parsed = new URL(swaggerUrl);
        const basePath = parsed.origin + parsed.pathname.substring(0, parsed.pathname.lastIndexOf('/') + 1);
        targetUrls.push(`${basePath}swagger.json`);
        targetUrls.push(`${basePath}openapi.json`);
        targetUrls.push(`${basePath}v1/swagger.json`);
        targetUrls.push(`${basePath}swagger/v1/swagger.json`);
        
        const parentPath = parsed.origin + parsed.pathname.substring(0, parsed.pathname.lastIndexOf('/', parsed.pathname.lastIndexOf('/') - 1) + 1);
        targetUrls.push(`${parentPath}swagger.json`);
        targetUrls.push(`${parentPath}openapi.json`);
        targetUrls.push(`${parentPath}docs/v1/swagger.json`);
      } catch {}
    }

    // De-duplicate URLs
    targetUrls = Array.from(new Set(targetUrls));

    for (let i = 0; i < targetUrls.length; i++) {
      const url = targetUrls[i];
      try {
        setDetectedStatus(`Descargando esquema: ${new URL(url).pathname}...`);
        
        // Use Rust backend to bypass CORS
        const responseText: string = await invoke('fetch_external_url', { url });
        
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (jsonErr: any) {
          throw new Error("El servidor respondió pero no es un JSON válido.");
        }
        
        if (data && (data.paths || data.openapi || data.swagger)) {
          // If we succeeded on a fallback URL, update the swaggerUrl input
          if (url !== swaggerUrl) {
            setSwaggerUrl(url);
          }
          localStorage.setItem(`launcher_swagger_schema_${projectId}`, JSON.stringify(data));
          parseSwaggerSchema(data);
          setManualMode(false);
          setDetectedStatus('API cargada correctamente');
          setTimeout(() => setDetectedStatus(null), 3000);
          setLoading(false);
          return;
        } else {
          throw new Error("JSON no contiene rutas o especificación OpenAPI/Swagger.");
        }
      } catch (err: any) {
        console.warn(`Failed to fetch from ${url}:`, err);
        const cleanErr = err.message || String(err).replace("transport error: ", "");
        errorDetails.push(`• ${url} → ${cleanErr}`);
      }
    }

    // Format final error message with all attempted URLs
    setError(
      `No se pudo cargar un esquema JSON de OpenAPI válido.\n\nIntentos realizados:\n${errorDetails.join('\n')}\n\nSugerencia: Puedes buscar la URL del JSON real (usualmente termina en swagger.json o openapi.json) usando la pestaña 'Network' del inspector del navegador en tu Swagger UI.`
    );
    setDetectedStatus(null);
    setLoading(false);
  };

  const parseSwaggerSchema = (schema: any) => {
    const parsedList: ApiEndpoint[] = [];
    if (!schema || !schema.paths) return;

    Object.entries(schema.paths).forEach(([path, pathItem]: [string, any]) => {
      Object.entries(pathItem).forEach(([method, operation]: [string, any]) => {
        // Only HTTP Methods
        if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) {
          parsedList.push({
            path,
            method: method.toUpperCase(),
            summary: operation.summary,
            description: operation.description,
            tags: operation.tags || ['default'],
            parameters: operation.parameters || [],
            requestBody: operation.requestBody
          });
        }
      });
    });

    setEndpoints(parsedList);
    if (parsedList.length > 0) {
      setSelectedEndpoint(parsedList[0]);
    }
  };

  // Pre-fill parameters and request body template when selected endpoint changes
  useEffect(() => {
    if (!selectedEndpoint) return;

    const storageKey = `launcher_api_payload_${projectId}_${selectedEndpoint.method}_${selectedEndpoint.path}`;
    const savedPayloadRaw = localStorage.getItem(storageKey);

    if (savedPayloadRaw) {
      try {
        const saved = JSON.parse(savedPayloadRaw);
        setPathParams(saved.pathParams || {});
        setQueryParams(saved.queryParams || {});
        setHeaders(prev => ({ ...prev, ...(saved.headers || {}) }));
        setRequestBody(saved.requestBody || '{}');
        return; // Carga exitosa, omitir generación de plantilla
      } catch (e) {
        console.error('Error parsing saved endpoint payload:', e);
      }
    }

    // Reset inputs si no hay guardado previo
    const initialPathParams: Record<string, string> = {};
    const initialQueryParams: Record<string, string> = {};
    const initialHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Filter path & query params
    if (selectedEndpoint.parameters) {
      selectedEndpoint.parameters.forEach((param: any) => {
        if (param.in === 'path') {
          initialPathParams[param.name] = param.example || param.default || '';
        } else if (param.in === 'query') {
          initialQueryParams[param.name] = param.example || param.default || '';
        } else if (param.in === 'header') {
          initialHeaders[param.name] = param.example || param.default || '';
        }
      });
    }

    setPathParams(initialPathParams);
    setQueryParams(initialQueryParams);
    setHeaders(initialHeaders);

    // Form template body
    let bodyTemplate = '{}';
    if (selectedEndpoint.requestBody) {
      const content = selectedEndpoint.requestBody.content;
      if (content && content['application/json']) {
        const schema = content['application/json'].schema;
        if (schema && schema.properties) {
          const templateObj: Record<string, any> = {};
          Object.entries(schema.properties).forEach(([key, prop]: [string, any]) => {
            if (prop.type === 'string') {
              templateObj[key] = prop.example || (prop.format === 'date-time' ? new Date().toISOString() : 'string');
            } else if (prop.type === 'number' || prop.type === 'integer') {
              templateObj[key] = prop.example || 0;
            } else if (prop.type === 'boolean') {
              templateObj[key] = prop.example || false;
            } else if (prop.type === 'array') {
              templateObj[key] = [];
            } else {
              templateObj[key] = {};
            }
          });
          bodyTemplate = JSON.stringify(templateObj, null, 2);
        }
      }
    }
    setRequestBody(bodyTemplate);
  }, [selectedEndpoint, projectId]);

  const executeRequest = async () => {
    setExecuting(true);
    setResponseStatus(null);
    setResponseBody('');
    const startTime = performance.now();

    try {
      let url = '';
      let method = 'GET';
      let body: string | undefined = undefined;

      if (manualMode) {
        url = manualPath;
        method = manualMethod;
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
          body = requestBody;
        }
      } else {
        if (!selectedEndpoint) return;
        method = selectedEndpoint.method;
        
        // Build base URL: extract host from swagger URL, then optionally add path prefix
        let baseUrl = 'http://localhost:8000';
        try {
          const parsedUrl = new URL(swaggerUrl);
          baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
        } catch {}

        // Append optional path prefix (e.g. /api/v1)
        const prefix = pathPrefix.trim().replace(/\/$/, '');
        if (prefix) {
          baseUrl = `${baseUrl}${prefix.startsWith('/') ? prefix : '/' + prefix}`;
        }

        // Replace path params
        let finalPath = selectedEndpoint.path;
        Object.entries(pathParams).forEach(([key, val]) => {
          finalPath = finalPath.replace(`{${key}}`, encodeURIComponent(val));
        });

        // Append query params
        const qParams = new URLSearchParams();
        Object.entries(queryParams).forEach(([key, val]) => {
          if (val) qParams.append(key, val);
        });
        const queryString = qParams.toString();
        
        url = `${baseUrl}${finalPath}${queryString ? `?${queryString}` : ''}`;
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && selectedEndpoint.requestBody) {
          body = requestBody;
        }
      }
      
      // Guardar el payload para reusarlo después
      if (!manualMode && selectedEndpoint) {
        const storageKey = `launcher_api_payload_${projectId}_${selectedEndpoint.method}_${selectedEndpoint.path}`;
        localStorage.setItem(storageKey, JSON.stringify({
          pathParams,
          queryParams,
          headers,
          requestBody
        }));
      }

      // Execute request through the Rust backend (Bypasses CORS completely!)
      const res: BackendResponse = await invoke('execute_backend_request', {
        url,
        method,
        headers,
        body: body || null,
      });

      const endTime = performance.now();
      setResponseTime(Math.round(endTime - startTime));
      setResponseStatus(res.status);
      setResponseHeaders(res.headers);
      setResponseBody(res.body);
    } catch (err: any) {
      const endTime = performance.now();
      setResponseTime(Math.round(endTime - startTime));
      setResponseStatus(0);
      setResponseBody(JSON.stringify({ error: err.message || 'Unknown network error' }, null, 2));
    } finally {
      setExecuting(false);
    }
  };

  const filteredEndpoints = endpoints.filter(ep => {
    const term = searchTerm.toLowerCase();
    return ep.path.toLowerCase().includes(term) || 
           (ep.summary && ep.summary.toLowerCase().includes(term));
  });

  const getMethodBadgeColor = (method: string) => {
    switch (method.toUpperCase()) {
      case 'GET': return { bg: 'rgba(59,130,246,.15)', text: '#60a5fa', border: 'rgba(59,130,246,.3)' };
      case 'POST': return { bg: 'rgba(16,185,129,.15)', text: '#34d399', border: 'rgba(16,185,129,.3)' };
      case 'PUT': return { bg: 'rgba(245,158,11,.15)', text: '#fbbf24', border: 'rgba(245,158,11,.3)' };
      case 'DELETE': return { bg: 'rgba(239,68,68,.15)', text: '#f87171', border: 'rgba(239,68,68,.3)' };
      default: return { bg: 'rgba(139,92,246,.15)', text: '#a78bfa', border: 'rgba(139,92,246,.3)' };
    }
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return '#4ade80';
    if (status >= 300 && status < 400) return '#60a5fa';
    if (status >= 400 && status < 500) return '#fbbf24';
    return '#f87171';
  };

  return (
    <div className="w-full h-full flex flex-col font-sans" style={{ backgroundColor: '#0e0e16', borderLeft: '1px solid #1e1e35' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ backgroundColor: '#141424', borderBottom: '1px solid #20203a' }}>
        <div className="flex items-center gap-2">
          <span className="text-purple-400">⚡</span>
          <span className="font-bold text-sm">Mini Swagger & Client</span>
          <span className="text-xs text-gray-500">({projectName})</span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onToggleMaximize}
            className="p-1 rounded text-[#555878] hover:text-white hover:bg-[#1e1e35] transition-all flex items-center justify-center"
            title={isMaximized ? "Restaurar" : "Maximizar"}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button 
            onClick={onClose}
            className="text-xs hover:text-white px-2 py-0.5 rounded transition-colors"
            style={{ color: '#555878' }}
          >
            Cerrar ✕
          </button>
        </div>
      </div>

      {/* Connection bar */}
      <div className="p-3 flex flex-col gap-2 flex-shrink-0 border-b border-[#1b1b2d] bg-[#0c0c12]">
        {/* Row 1: Swagger discovery URL */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[10px] text-gray-500 whitespace-nowrap">Swagger URL</div>
          <input
            type="text"
            value={swaggerUrl}
            onChange={(e) => setSwaggerUrl(e.target.value)}
            disabled={manualMode}
            placeholder="http://localhost:8000/openapi.json"
            className="flex-1 text-xs px-2 py-1 rounded bg-[#13131f] border border-[#23233a] focus:outline-none focus:border-purple-500 font-mono text-gray-300"
          />
          <button
            onClick={fetchSwagger}
            disabled={loading || manualMode}
            className="px-3 py-1 rounded text-xs font-semibold bg-[#2a2a46] hover:bg-[#343457] text-[#e2e4f0] transition-colors"
          >
            {loading ? 'Cargando...' : 'Escanear'}
          </button>
          <button
            onClick={() => {
              setManualMode(!manualMode);
              if (!manualMode) {
                setSelectedEndpoint(null);
              } else if (endpoints.length > 0) {
                setSelectedEndpoint(endpoints[0]);
              }
            }}
            className={`px-2 py-1 rounded text-xs transition-colors ${manualMode ? 'bg-[#9333ea] text-white' : 'text-gray-400 hover:bg-[#1a1a2e]'}`}
          >
            Manual
          </button>
          {/* Toggle button for path prefix */}
          <button
            title={showPathPrefix ? 'Ocultar prefijo de ruta' : 'Agregar prefijo de ruta para ejecución (ej: /api/v1)'}
            onClick={() => {
              const next = !showPathPrefix;
              setShowPathPrefix(next);
              if (!next) {
                setPathPrefix('');
                localStorage.removeItem(`launcher_path_prefix_${projectId}`);
              }
            }}
            className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
              showPathPrefix
                ? 'bg-amber-900/40 text-amber-300 border border-amber-700/40'
                : 'text-gray-500 hover:bg-[#1a1a2e] hover:text-amber-400'
            }`}
          >
            ⚡ Prefijo
          </button>
        </div>

        {/* Row 2: Optional path prefix */}
        {showPathPrefix && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[10px] text-amber-500/80 whitespace-nowrap">Prefijo</div>
            <div className="flex items-center flex-1 rounded bg-[#13131f] border border-amber-800/40 focus-within:border-amber-500 overflow-hidden font-mono">
              <span className="text-[11px] text-gray-500 px-2 border-r border-amber-900/30 whitespace-nowrap select-none">
                {(() => { try { return new URL(swaggerUrl).origin; } catch { return 'http://localhost:8000'; } })()}
              </span>
              <input
                type="text"
                value={pathPrefix}
                onChange={(e) => {
                  setPathPrefix(e.target.value);
                  if (e.target.value.trim()) {
                    localStorage.setItem(`launcher_path_prefix_${projectId}`, e.target.value.trim());
                  } else {
                    localStorage.removeItem(`launcher_path_prefix_${projectId}`);
                  }
                }}
                placeholder="/api/v1"
                className="flex-1 text-xs px-2 py-1 bg-transparent focus:outline-none text-amber-200"
              />
              {pathPrefix.trim() && (
                <span className="text-[10px] text-amber-400/70 px-2 whitespace-nowrap">⚡ activa</span>
              )}
            </div>
          </div>
        )}

        {/* Dynamic Detection status toast/badge */}
        {detectedStatus && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-purple-950/20 text-purple-300 border border-purple-900/30">
            <CheckCircle size={11} className="text-purple-400 animate-pulse" />
            <span className="font-mono">{detectedStatus}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 m-2 rounded text-xs flex gap-2 items-start bg-red-950/20 text-red-400 border border-red-900/40 font-sans whitespace-pre-wrap">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* Main layout */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {/* Endpoints Sidebar (Only in Swagger Mode) */}
        {!manualMode ? (
          <div 
            className="border-r border-[#1b1b2d] flex flex-col flex-shrink-0 bg-[#0b0b10]"
            style={{ width: `${sidebarWidth}px` }}
          >
            <div className="p-2 border-b border-[#1b1b2d]">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Filtrar endpoints..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full text-xs pl-7 pr-2 py-1 rounded bg-[#13131f] border border-[#1d1d32] focus:outline-none focus:border-purple-500 text-gray-300"
                />
                <Search size={12} className="absolute left-2.5 top-2 text-gray-500" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredEndpoints.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-600">
                  No se encontraron endpoints. Escanea la API primero.
                </div>
              ) : (
                filteredEndpoints.map((ep, idx) => {
                  const isSelected = selectedEndpoint?.path === ep.path && selectedEndpoint?.method === ep.method;
                  const badge = getMethodBadgeColor(ep.method);
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedEndpoint(ep)}
                      className={`w-full text-left p-2 border-b border-[#141422] transition-colors flex flex-col gap-1 ${isSelected ? 'bg-[#1e1e32]' : 'hover:bg-[#12121e]'}`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span 
                          className="text-[9px] font-bold px-1 py-0.5 rounded border flex-shrink-0 text-center w-12"
                          style={{ backgroundColor: badge.bg, color: badge.text, borderColor: badge.border }}
                        >
                          {ep.method}
                        </span>
                        <span className="text-xs font-mono truncate text-gray-300">{ep.path}</span>
                      </div>
                      {ep.summary && (
                        <span className="text-[10px] text-gray-500 truncate pl-1">{ep.summary}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : null}

        {/* Drag Handle Divider (Only in Swagger Mode) */}
        {!manualMode && (
          <div 
            onMouseDown={handleMouseDown} 
            className={`w-[3px] cursor-col-resize hover:bg-purple-500 bg-[#141424] hover:w-[4px] transition-all flex-shrink-0 ${isDragging ? 'bg-purple-600 w-[4px]' : ''}`}
            title="Arrastra para cambiar el tamaño"
          />
        )}

        {/* Execution & Panel Area */}
        <div className="flex-1 flex flex-col overflow-y-auto p-4 bg-[#0a0a0f] gap-4">
          {manualMode ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold text-purple-400">PETICIÓN PERSONALIZADA</h3>
              <div className="flex gap-2 font-sans">
                <select
                  value={manualMethod}
                  onChange={(e) => setManualMethod(e.target.value)}
                  className="text-xs px-2 py-1.5 rounded bg-[#13131f] border border-[#23233a] focus:outline-none text-gray-300 font-bold"
                >
                  {['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  placeholder="http://localhost:8000/api/v1/resource"
                  className="flex-1 text-xs px-2 py-1.5 rounded bg-[#13131f] border border-[#23233a] focus:outline-none font-mono text-gray-300"
                />
              </div>
            </div>
          ) : selectedEndpoint ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span 
                  className="text-xs font-bold px-2 py-0.5 rounded border"
                  style={{ 
                    backgroundColor: getMethodBadgeColor(selectedEndpoint.method).bg, 
                    color: getMethodBadgeColor(selectedEndpoint.method).text, 
                    borderColor: getMethodBadgeColor(selectedEndpoint.method).border 
                  }}
                >
                  {selectedEndpoint.method}
                </span>
                <span className="text-sm font-mono font-semibold text-gray-200">{selectedEndpoint.path}</span>
              </div>
              {selectedEndpoint.summary && (
                <p className="text-xs text-gray-400 pl-1">{selectedEndpoint.summary}</p>
              )}
              {selectedEndpoint.description && (
                <p className="text-[11px] text-gray-500 italic pl-1">{selectedEndpoint.description}</p>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500 gap-2">
              <Globe size={32} className="opacity-30" />
              <p className="text-xs">Por favor introduce el Swagger JSON URL y haz click en "Escanear"</p>
            </div>
          )}

          {/* Form Parameters & Body */}
          {(selectedEndpoint || manualMode) && (
            <div className="flex flex-col gap-4 border-t border-[#1d1d32] pt-4">
              {/* Path parameters */}
              {!manualMode && Object.keys(pathParams).length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-gray-400">Path Parameters:</span>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(pathParams).map(([key, val]) => (
                      <div key={key} className="flex flex-col gap-1">
                        <label className="text-[10px] font-mono text-purple-400">{key}:</label>
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => setPathParams(prev => ({ ...prev, [key]: e.target.value }))}
                          className="text-xs px-2 py-1 rounded bg-[#13131f] border border-[#23233a] focus:outline-none text-gray-300"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Query parameters */}
              {!manualMode && Object.keys(queryParams).length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-gray-400">Query Parameters:</span>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(queryParams).map(([key, val]) => (
                      <div key={key} className="flex flex-col gap-1">
                        <label className="text-[10px] font-mono text-blue-400">{key}:</label>
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => setQueryParams(prev => ({ ...prev, [key]: e.target.value }))}
                          className="text-xs px-2 py-1 rounded bg-[#13131f] border border-[#23233a] focus:outline-none text-gray-300"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Body Content Editor */}
              {((!manualMode && ['POST', 'PUT', 'PATCH'].includes(selectedEndpoint?.method || '')) || 
                (manualMode && ['POST', 'PUT', 'PATCH'].includes(manualMethod))) && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-gray-400">Request Body (JSON):</span>
                  </div>
                  <textarea
                    rows={6}
                    value={requestBody}
                    onChange={(e) => setRequestBody(e.target.value)}
                    className="w-full text-xs font-mono p-2 rounded bg-[#13131f] border border-[#23233a] focus:outline-none focus:border-purple-500 text-[#a8ffb0]"
                  />
                </div>
              )}

              {/* Execute action button */}
              <div>
                <button
                  onClick={executeRequest}
                  disabled={executing}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded text-xs font-bold transition-all text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                >
                  {executing ? (
                    <>Enviando...</>
                  ) : (
                    <>
                      <Send size={12} />
                      Enviar Petición
                    </>
                  )}
                </button>
              </div>

              {/* Response Section */}
              {(responseStatus !== null || responseBody) && (
                <div className="flex flex-col gap-2 border-t border-[#1d1d32] pt-4">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-400 font-sans">Respuesta:</span>
                      {responseBody && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(responseBody);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[#1c1c30] text-[#8890b0] hover:text-[#e2e4f0] transition-colors border border-[#2e2e50]"
                          title="Copiar respuesta al portapapeles"
                        >
                          {copied ? (
                            <>
                              <Check size={10} className="text-green-400" />
                              <span className="text-green-400 font-sans">Copiado</span>
                            </>
                          ) : (
                            <>
                              <Copy size={10} />
                              <span className="font-sans">Copiar</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <div className="flex gap-3 text-[11px]">
                      {responseStatus !== null && (
                        <span className="font-sans">
                          Status: <span style={{ color: getStatusColor(responseStatus) }} className="font-mono font-bold">{responseStatus}</span>
                        </span>
                      )}
                      {responseTime !== null && (
                        <span className="text-gray-500 font-sans">
                          Time: <span className="font-mono">{responseTime} ms</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded bg-[#07070c] border border-[#1b1b2f] overflow-x-auto max-h-[300px] text-[11px] font-mono">
                    {responseBody ? (
                      <JsonViewer content={responseBody} maxPreviewLength={200} />
                    ) : (
                      <span className="text-xs text-gray-600">Sin contenido de respuesta.</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
