import { useState, useEffect, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Plus, FolderOpen, ChevronDown, Terminal, Play, Hammer,
  Square, Trash2, X, Settings, PlusCircle, ChevronRight,
  Loader2, AlertCircle, Edit3, Save
} from 'lucide-react';
import { Project, ProjectConfig, ProcessTab, LogLine, StreamMessage } from './types';
import { useTauriCommands } from './hooks/useTauriCommands';
import { UnlistenFn } from '@tauri-apps/api/event';

let logIdCounter = 0;
const newLogId = () => `log-${++logIdCounter}`;

// Storage keys
const STORAGE_KEYS = {
  PROJECTS: 'project_launcher_projects',
  SELECTED_PROJECT_ID: 'project_launcher_selected_project_id'
};

// Helper functions for localStorage
const loadProjectsFromStorage = (): Project[] => {
  const stored = localStorage.getItem(STORAGE_KEYS.PROJECTS);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse projects from storage:', e);
      return [];
    }
  }
  return [];
};

const saveProjectsToStorage = (projects: Project[]) => {
  localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
};

const loadSelectedProjectIdFromStorage = (): string | null => {
  return localStorage.getItem(STORAGE_KEYS.SELECTED_PROJECT_ID);
};

const saveSelectedProjectIdToStorage = (projectId: string | null) => {
  if (projectId) {
    localStorage.setItem(STORAGE_KEYS.SELECTED_PROJECT_ID, projectId);
  } else {
    localStorage.removeItem(STORAGE_KEYS.SELECTED_PROJECT_ID);
  }
};

// ─── Custom Command Modal ─────────────────────────────────────────────────────

interface CustomCommandModalProps {
  projectId: string;
  editingConfig?: { config: ProjectConfig; index: number } | null;
  onSave: (projectId: string, config: ProjectConfig, editIndex?: number) => Promise<void>;
  onClose: () => void;
}

function CustomCommandModal({ projectId, editingConfig, onSave, onClose }: CustomCommandModalProps) {
  const [name, setName] = useState(editingConfig?.config.name ?? '');
  const [command, setCommand] = useState(editingConfig?.config.command ?? '');
  const [workingDir, setWorkingDir] = useState(editingConfig?.config.working_dir ?? '');
  const [envVarsText, setEnvVarsText] = useState(
    editingConfig
      ? Object.entries(editingConfig.config.env_vars).map(([k, v]) => `${k}=${v}`).join('\n')
      : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const parseEnvVars = (): Record<string, string> => {
    const result: Record<string, string> = {};
    envVarsText.split('\n').forEach(line => {
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();
        if (key) result[key] = val;
      }
    });
    return result;
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!command.trim()) { setError('Command is required'); return; }
    setSaving(true);
    setError('');
    try {
      const config: ProjectConfig = {
        name: name.trim(),
        command: command.trim(),
        working_dir: workingDir.trim(),
        env_vars: parseEnvVars(),
        requires_build: false,
        build_command: undefined,
        custom_paths: {},
      };
      await onSave(projectId, config, editingConfig?.index);
      onClose();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: '#13131f', border: '1px solid #2e2e50' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #252540' }}>
          <div className="flex items-center gap-3">
            <Settings size={18} style={{ color: '#6e7fff' }} />
            <span className="font-semibold">{editingConfig ? 'Edit Command' : 'New Custom Command'}</span>
          </div>
          <button onClick={onClose} className="rounded-md p-1 transition-colors"
            style={{ color: '#555878' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#e2e4f0')}
            onMouseLeave={e => (e.currentTarget.style.color = '#555878')}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase mb-1.5" style={{ color: '#555878' }}>
              Name *
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. run-sentinel"
              className="w-full px-3 py-2 rounded-md text-sm font-mono outline-none transition-colors"
              style={{ backgroundColor: '#0d0d14', border: '1px solid #2e2e50', color: '#e2e4f0' }}
              onFocus={e => (e.target.style.borderColor = '#6e7fff')}
              onBlur={e => (e.target.style.borderColor = '#2e2e50')}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase mb-1.5" style={{ color: '#555878' }}>
              Command *
            </label>
            <textarea
              value={command}
              onChange={e => setCommand(e.target.value)}
              placeholder={`e.g. $env:ENV='dev'; $env:PYTHONPATH='.'; .venv\\Scripts\\activate; python main.py run-sentinel`}
              rows={3}
              className="w-full px-3 py-2 rounded-md text-sm font-mono outline-none resize-none transition-colors"
              style={{ backgroundColor: '#0d0d14', border: '1px solid #2e2e50', color: '#e2e4f0' }}
              onFocus={e => (e.target.style.borderColor = '#6e7fff')}
              onBlur={e => (e.target.style.borderColor = '#2e2e50')}
            />
            <p className="text-xs mt-1" style={{ color: '#555878' }}>
              PowerShell syntax. Use <code style={{ color: '#6e7fff' }}>$env:VAR='value'</code> for env vars inline.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase mb-1.5" style={{ color: '#555878' }}>
              Working Directory (leave blank to use project root)
            </label>
            <input
              value={workingDir}
              onChange={e => setWorkingDir(e.target.value)}
              placeholder="e.g. C:\projects\myapp"
              className="w-full px-3 py-2 rounded-md text-sm font-mono outline-none transition-colors"
              style={{ backgroundColor: '#0d0d14', border: '1px solid #2e2e50', color: '#e2e4f0' }}
              onFocus={e => (e.target.style.borderColor = '#6e7fff')}
              onBlur={e => (e.target.style.borderColor = '#2e2e50')}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase mb-1.5" style={{ color: '#555878' }}>
              Environment Variables (KEY=value, one per line)
            </label>
            <textarea
              value={envVarsText}
              onChange={e => setEnvVarsText(e.target.value)}
              placeholder={`ENV=dev\nPYTHONPATH=.\nMY_SECRET=abc123`}
              rows={4}
              className="w-full px-3 py-2 rounded-md text-sm font-mono outline-none resize-none transition-colors"
              style={{ backgroundColor: '#0d0d14', border: '1px solid #2e2e50', color: '#e2e4f0' }}
              onFocus={e => (e.target.style.borderColor = '#6e7fff')}
              onBlur={e => (e.target.style.borderColor = '#2e2e50')}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-md" style={{ backgroundColor: 'rgba(239,68,68,.1)', color: '#f87171', border: '1px solid rgba(239,68,68,.2)' }}>
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4" style={{ borderTop: '1px solid #252540' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm transition-colors"
            style={{ color: '#555878', border: '1px solid #2e2e50' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1f1f35')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 text-white transition-all"
            style={{ backgroundColor: '#6e7fff' }}
            onMouseEnter={e => !saving && (e.currentTarget.style.backgroundColor = '#8090ff')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#6e7fff')}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save Command'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Console Tab ──────────────────────────────────────────────────────────────

interface ConsoleTabProps {
  tab: ProcessTab;
  onStop: (processId: string) => void;
  onClose: (processId: string) => void;
}

function ConsoleTab({ tab, onStop, onClose }: ConsoleTabProps) {
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
          <span className="text-xs" style={{ color: '#555878' }}>
            {new Date(tab.started_at).toLocaleTimeString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
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

// ─── Main App ─────────────────────────────────────────────────────────────────

function App() {
  const [projects, setProjects] = useState<Project[]>(() => loadProjectsFromStorage());
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [processTabs, setProcessTabs] = useState<ProcessTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<{ config: ProjectConfig; index: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const unlistenRef = useRef<UnlistenFn[]>([]);

  const {
    getProjects, addProject, detectProject,
    spawnProjectCommand, stopProcess,
    addCustomCommand, updateProjectConfig, deleteProjectConfig,
    onProcessOutput, onProcessExit,
  } = useTauriCommands();

  // Save projects to localStorage whenever they change
  useEffect(() => {
    saveProjectsToStorage(projects);
  }, [projects]);

  // Load selected project from localStorage on mount
  useEffect(() => {
    const savedProjectId = loadSelectedProjectIdFromStorage();
    if (savedProjectId && projects.length > 0) {
      const found = projects.find(p => p.id === savedProjectId);
      if (found) {
        setSelectedProject(found);
      } else if (projects.length > 0) {
        setSelectedProject(projects[0]);
        saveSelectedProjectIdToStorage(projects[0].id);
      }
    } else if (projects.length > 0 && !selectedProject) {
      setSelectedProject(projects[0]);
      saveSelectedProjectIdToStorage(projects[0].id);
    }
  }, [projects]);

  // Save selected project to localStorage when it changes
  useEffect(() => {
    if (selectedProject) {
      saveSelectedProjectIdToStorage(selectedProject.id);
    }
  }, [selectedProject]);

  // ─── Setup event listeners ───────────────────────────────────────────────
  useEffect(() => {
    let outputUnsub: UnlistenFn;
    let exitUnsub: UnlistenFn;

    (async () => {
      outputUnsub = await onProcessOutput((msg: StreamMessage) => {
        const logLine: LogLine = {
          id: newLogId(),
          output_type: msg.output_type,
          content: msg.content,
          timestamp: msg.timestamp,
        };

        setProcessTabs(prev =>
          prev.map(tab =>
            tab.process_id === msg.process_id
              ? { ...tab, logs: [...tab.logs, logLine] }
              : tab
          )
        );
      });

      exitUnsub = await onProcessExit(({ process_id }) => {
        setProcessTabs(prev =>
          prev.map(tab =>
            tab.process_id === process_id
              ? { ...tab, status: 'stopped' }
              : tab
          )
        );
      });

      unlistenRef.current = [outputUnsub, exitUnsub];
    })();

    return () => {
      unlistenRef.current.forEach(fn => fn());
    };
  }, []);

  // ─── Load projects from Tauri on mount (sync with localStorage) ──────────
  useEffect(() => {
    const syncProjects = async () => {
      try {
        const tauriProjects = await getProjects();
        // Only sync if localStorage is empty and Tauri has projects
        if (projects.length === 0 && tauriProjects.length > 0) {
          setProjects(tauriProjects);
        }
      } catch (e) {
        console.error('Failed to sync projects from Tauri:', e);
      }
    };
    syncProjects();
  }, []);

  const handleAddProject = async () => {
    const selected = await open({ directory: true, multiple: false, title: 'Select Project Directory' });
    if (selected && typeof selected === 'string') {
      setIsLoading(true);
      try {
        await detectProject(selected);
        const newProject = await addProject(selected);
        setProjects(prev => {
          // Check if project already exists
          const exists = prev.some(p => p.id === newProject.id);
          if (exists) return prev;
          return [...prev, newProject];
        });
        setSelectedProject(newProject);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // ─── Execute ─────────────────────────────────────────────────────────────
  const handleExecute = async (configName: string) => {
    if (!selectedProject) return;
    try {
      const info = await spawnProjectCommand(selectedProject.id, configName);
      const newTab: ProcessTab = {
        process_id: info.id,
        project_name: info.project_name,
        config_name: info.config_name,
        status: 'running',
        logs: [],
        started_at: info.started_at,
      };
      setProcessTabs(prev => [...prev, newTab]);
      setActiveTabId(info.id);
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleStop = async (processId: string) => {
    try {
      await stopProcess(processId);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCloseTab = (processId: string) => {
    setProcessTabs(prev => {
      const next = prev.filter(t => t.process_id !== processId);
      if (activeTabId === processId) {
        setActiveTabId(next.length > 0 ? next[next.length - 1].process_id : null);
      }
      return next;
    });
  };

  // ─── Custom commands ──────────────────────────────────────────────────────
  const handleSaveCommand = async (projectId: string, config: ProjectConfig, editIndex?: number) => {
    let updatedProject: Project;
    if (editIndex !== undefined) {
      updatedProject = await updateProjectConfig(projectId, editIndex, config);
    } else {
      updatedProject = await addCustomCommand(projectId, config);
    }
    setProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p));
    setSelectedProject(updatedProject);
  };

  const handleDeleteConfig = async (configIndex: number) => {
    if (!selectedProject) return;
    const updatedProject = await deleteProjectConfig(selectedProject.id, configIndex);
    setProjects(prev => prev.map(p => p.id === selectedProject.id ? updatedProject : p));
    setSelectedProject(updatedProject);
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const getProjectIcon = (type: string) => {
    const icons: Record<string, string> = { Python: '🐍', Scala: '🦭', CSharp: '🎯', React: '⚛️' };
    return icons[type] || '📁';
  };

  const isRunCmd = (name: string) => ['run', 'dev', 'start'].includes(name);
  const isBuildCmd = (name: string) => ['build', 'compile'].includes(name);
  const isCustomCmd = (name: string) => !isRunCmd(name) && !isBuildCmd(name);

  const activeTab = processTabs.find(t => t.process_id === activeTabId) ?? null;

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: '#0d0d14', color: '#e2e4f0', fontFamily: "'Inter', sans-serif" }}>

      {/* ─── Navbar ──────────────────────────────────────────────────────── */}
      <div className="h-13 min-h-[52px] px-5 flex items-center justify-between gap-4" style={{ backgroundColor: '#10101c', borderBottom: '1px solid #1e1e38' }}>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xl">🚀</span>
          <span className="font-bold text-sm tracking-wide" style={{ color: '#a0a8ff' }}>Project Launcher</span>
        </div>

        {/* Project Dropdown */}
        <div className="relative flex-1 max-w-xs">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md transition-all text-sm"
            style={{ backgroundColor: '#1a1a2e', border: '1px solid #2e2e50' }}
          >
            {selectedProject ? (
              <>
                <span>{getProjectIcon(selectedProject.project_type)}</span>
                <div className="flex-1 text-left min-w-0">
                  <div className="font-medium truncate">{selectedProject.name}</div>
                </div>
                <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: '#252540', color: '#6e7fff' }}>
                  {selectedProject.project_type}
                </span>
              </>
            ) : (
              <span style={{ color: '#555878' }}>Select project…</span>
            )}
            <ChevronDown size={14} style={{ color: '#555878', flexShrink: 0 }} className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isDropdownOpen && projects.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-full rounded-md shadow-xl z-20" style={{ backgroundColor: '#13131f', border: '1px solid #252540' }}>
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProject(p); setIsDropdownOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left"
                  style={{ backgroundColor: selectedProject?.id === p.id ? '#1f1f35' : 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1f1f35')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = selectedProject?.id === p.id ? '#1f1f35' : 'transparent')}
                >
                  <span>{getProjectIcon(p.project_type)}</span>
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-xs" style={{ color: '#555878' }}>{p.project_type}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Console Tabs in navbar */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto min-w-0">
          {processTabs.map(tab => {
            const isActive = tab.process_id === activeTabId;
            const statusColor = tab.status === 'running' ? '#4ade80' : tab.status === 'error' ? '#f87171' : '#555878';
            return (
              <button
                key={tab.process_id}
                onClick={() => setActiveTabId(tab.process_id)}
                className="flex items-center gap-1.5 px-3 py-1 rounded text-xs flex-shrink-0 transition-all"
                style={{
                  backgroundColor: isActive ? '#1f1f35' : 'transparent',
                  border: isActive ? '1px solid #3a4199' : '1px solid transparent',
                  color: isActive ? '#e2e4f0' : '#555878',
                }}
              >
                <span style={{ color: statusColor, fontSize: '8px' }}>●</span>
                <span className="font-medium max-w-[100px] truncate">{tab.project_name}</span>
                <span style={{ color: '#4a4a70' }}>·</span>
                <span>{tab.config_name}</span>
                <span
                  className="ml-1 rounded p-0.5 hover:text-white transition-colors"
                  onClick={e => { e.stopPropagation(); handleCloseTab(tab.process_id); }}
                  style={{ color: '#3a3a60' }}
                >
                  <X size={10} />
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={handleAddProject}
          disabled={isLoading}
          className="px-3 py-1.5 rounded-md font-medium text-white flex items-center gap-1.5 text-sm flex-shrink-0 transition-all"
          style={{ backgroundColor: '#6e7fff' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#8090ff')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#6e7fff')}
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Add Project
        </button>
      </div>

      {/* ─── Main Layout ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Sidebar */}
        <div className="w-72 flex-shrink-0 overflow-y-auto flex flex-col" style={{ backgroundColor: '#10101c', borderRight: '1px solid #1e1e38' }}>
          {selectedProject ? (
            <>
              {/* Project Path */}
              <div className="p-4" style={{ borderBottom: '1px solid #1e1e38' }}>
                <div className="text-xs font-semibold uppercase mb-2" style={{ color: '#3d3f60' }}>Project</div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{getProjectIcon(selectedProject.project_type)}</span>
                  <div>
                    <div className="font-semibold text-sm">{selectedProject.name}</div>
                    <div className="text-xs" style={{ color: '#555878' }}>{selectedProject.project_type}</div>
                  </div>
                </div>
                <div className="text-xs font-mono truncate p-2 rounded" style={{ color: '#555878', backgroundColor: '#0d0d14', border: '1px solid #1e1e38' }}>
                  {selectedProject.path}
                </div>
              </div>

              {/* Run Commands */}
              {selectedProject.configurations.filter(c => isRunCmd(c.name)).length > 0 && (
                <div className="p-4" style={{ borderBottom: '1px solid #1e1e38' }}>
                  <div className="text-xs font-semibold uppercase mb-2 flex items-center gap-1.5" style={{ color: '#3d3f60' }}>
                    <Play size={11} /> Run
                  </div>
                  <div className="space-y-1.5">
                    {selectedProject.configurations
                      .map((c, i) => ({ c, i }))
                      .filter(({ c }) => isRunCmd(c.name))
                      .map(({ c, i }) => (
                        <CommandButton key={i} config={c} configIndex={i} onRun={handleExecute} onEdit={(cfg, idx) => { setEditingConfig({ config: cfg, index: idx }); setShowCustomModal(true); }} onDelete={handleDeleteConfig} icon="▶️" />
                      ))}
                  </div>
                </div>
              )}

              {/* Build Commands */}
              {selectedProject.configurations.filter(c => isBuildCmd(c.name)).length > 0 && (
                <div className="p-4" style={{ borderBottom: '1px solid #1e1e38' }}>
                  <div className="text-xs font-semibold uppercase mb-2 flex items-center gap-1.5" style={{ color: '#3d3f60' }}>
                    <Hammer size={11} /> Build
                  </div>
                  <div className="space-y-1.5">
                    {selectedProject.configurations
                      .map((c, i) => ({ c, i }))
                      .filter(({ c }) => isBuildCmd(c.name))
                      .map(({ c, i }) => (
                        <CommandButton key={i} config={c} configIndex={i} onRun={handleExecute} onEdit={(cfg, idx) => { setEditingConfig({ config: cfg, index: idx }); setShowCustomModal(true); }} onDelete={handleDeleteConfig} icon="🔨" />
                      ))}
                  </div>
                </div>
              )}

              {/* Custom Commands */}
              <div className="p-4 flex-1" style={{ borderBottom: '1px solid #1e1e38' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold uppercase flex items-center gap-1.5" style={{ color: '#3d3f60' }}>
                    <Settings size={11} /> Custom
                  </div>
                  <button
                    onClick={() => { setEditingConfig(null); setShowCustomModal(true); }}
                    className="flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors"
                    style={{ color: '#6e7fff' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1a1a2e')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <PlusCircle size={11} /> Add
                  </button>
                </div>
                <div className="space-y-1.5">
                  {selectedProject.configurations
                    .map((c, i) => ({ c, i }))
                    .filter(({ c }) => isCustomCmd(c.name))
                    .map(({ c, i }) => (
                      <CommandButton key={i} config={c} configIndex={i} onRun={handleExecute} onEdit={(cfg, idx) => { setEditingConfig({ config: cfg, index: idx }); setShowCustomModal(true); }} onDelete={handleDeleteConfig} icon="⚙️" />
                    ))}
                  {selectedProject.configurations.filter(c => isCustomCmd(c.name)).length === 0 && (
                    <div className="text-xs text-center py-4" style={{ color: '#3d3f60' }}>
                      No custom commands yet
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center flex-col gap-3 p-8 text-center" style={{ color: '#3d3f60' }}>
              <FolderOpen size={36} className="opacity-40" />
              <p className="text-sm">No project selected</p>
              <p className="text-xs">Click "Add Project" to get started</p>
            </div>
          )}
        </div>

        {/* Console Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTab ? (
            <ConsoleTab
              key={activeTab.process_id}
              tab={activeTab}
              onStop={handleStop}
              onClose={handleCloseTab}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center flex-col gap-4" style={{ color: '#3d3f60' }}>
              <Terminal size={56} className="opacity-20" />
              <div className="text-center">
                <p className="text-sm font-medium">No active console</p>
                <p className="text-xs mt-1">Run a command to see live output here</p>
              </div>
              {selectedProject && (
                <div className="flex gap-3 mt-2">
                  {selectedProject.configurations.slice(0, 3).map(c => (
                    <button
                      key={c.name}
                      onClick={() => handleExecute(c.name)}
                      className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all"
                      style={{ backgroundColor: '#13131f', border: '1px solid #2e2e50', color: '#8890b0' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1f1f35'; e.currentTarget.style.color = '#e2e4f0'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#13131f'; e.currentTarget.style.color = '#8890b0'; }}
                    >
                      <ChevronRight size={14} />
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Custom Command Modal */}
      {showCustomModal && selectedProject && (
        <CustomCommandModal
          projectId={selectedProject.id}
          editingConfig={editingConfig}
          onSave={handleSaveCommand}
          onClose={() => { setShowCustomModal(false); setEditingConfig(null); }}
        />
      )}
    </div>
  );
}

// ─── CommandButton ─────────────────────────────────────────────────────────────

interface CommandButtonProps {
  config: ProjectConfig;
  configIndex: number;
  icon: string;
  onRun: (name: string) => void;
  onEdit: (config: ProjectConfig, index: number) => void;
  onDelete: (index: number) => void;
}

function CommandButton({ config, configIndex, icon, onRun, onEdit, onDelete }: CommandButtonProps) {
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
        onClick={() => onRun(config.name)}
      >
        <span className="text-sm flex-shrink-0">{icon}</span>
        <div className="min-w-0">
          <div className="font-medium text-sm capitalize">{config.name}</div>
          <div className="font-mono text-xs truncate" style={{ color: '#3d3f60' }}>{config.command}</div>
        </div>
      </button>
      <div className={`flex items-center gap-0.5 pr-1.5 transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'}`}>
        <button
          className="p-1 rounded transition-colors"
          style={{ color: '#555878' }}
          onClick={e => { e.stopPropagation(); onEdit(config, configIndex); }}
          onMouseEnter={e => (e.currentTarget.style.color = '#6e7fff')}
          onMouseLeave={e => (e.currentTarget.style.color = '#555878')}
          title="Edit"
        >
          <Edit3 size={12} />
        </button>
        <button
          className="p-1 rounded transition-colors"
          style={{ color: '#555878' }}
          onClick={e => { e.stopPropagation(); onDelete(configIndex); }}
          onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
          onMouseLeave={e => (e.currentTarget.style.color = '#555878')}
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

export default App;
