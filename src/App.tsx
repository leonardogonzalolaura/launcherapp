import { useState, useEffect, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Plus, FolderOpen, ChevronDown, Terminal, Play, Hammer,
  Trash2, X, Settings, PlusCircle, ChevronRight, Loader2
} from 'lucide-react';
import { Project, ProjectConfig, ProcessTab, LogLine, StreamMessage } from './types';
import { useTauriCommands } from './hooks/useTauriCommands';
import { UnlistenFn } from '@tauri-apps/api/event';
import { CustomCommandModal } from './components/CustomCommandModal';
import { ConsoleTab } from './components/ConsoleTab';
import { CommandButton } from './components/CommandButton';

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
  const restoringRef = useRef(false);

  const {
    getProjects, addProject, detectProject, removeProject, clearAllProjects,
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
    if (restoringRef.current) return;
    restoringRef.current = true;
    const syncProjects = async () => {
      try {
        const tauriProjects = await getProjects();
        if (tauriProjects.length > 0) {
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
          const exists = prev.some(p => p.id === newProject.id || p.path === newProject.path);
          if (exists) {
            return prev.map(p => (p.id === newProject.id || p.path === newProject.path) ? newProject : p);
          }
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
        project_id: selectedProject.id,
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

  const handleRerun = async (processId: string) => {
    const tabToRerun = processTabs.find(t => t.process_id === processId);
    if (!tabToRerun) return;

    try {
      const info = await spawnProjectCommand(tabToRerun.project_id, tabToRerun.config_name);
      setProcessTabs(prev =>
        prev.map(tab =>
          tab.process_id === processId
            ? {
                ...tab,
                process_id: info.id,
                status: 'running',
                logs: [],
                started_at: info.started_at,
              }
            : tab
        )
      );
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

  const handleRemoveProject = async (id: string) => {
    try {
      await removeProject(id);
      setProjects(prev => {
        const next = prev.filter(p => p.id !== id);
        if (selectedProject?.id === id) {
          const nextSelected = next.length > 0 ? next[0] : null;
          setSelectedProject(nextSelected);
          saveSelectedProjectIdToStorage(nextSelected ? nextSelected.id : null);
        }
        return next;
      });
    } catch (e) {
      console.error("Failed to remove project:", e);
    }
  };

  const handleClearAllProjects = async () => {
    if (!window.confirm("¿Estás seguro de que deseas quitar todos los proyectos registrados?")) {
      return;
    }
    try {
      await clearAllProjects();
      setProjects([]);
      setSelectedProject(null);
      saveSelectedProjectIdToStorage(null);
      saveProjectsToStorage([]);
    } catch (e) {
      console.error("Failed to clear all projects:", e);
    }
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
            <div className="absolute top-full left-0 mt-1 w-full rounded-md shadow-xl z-20 overflow-hidden" style={{ backgroundColor: '#13131f', border: '1px solid #252540' }}>
              {projects.map(p => (
                <div
                  key={p.id}
                  className="w-full flex items-center justify-between transition-colors"
                  style={{ backgroundColor: selectedProject?.id === p.id ? '#1f1f35' : 'transparent' }}
                  onMouseEnter={e => {
                    if (selectedProject?.id !== p.id) {
                      e.currentTarget.style.backgroundColor = '#1f1f35';
                    }
                  }}
                  onMouseLeave={e => {
                    if (selectedProject?.id !== p.id) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <button
                    onClick={() => { setSelectedProject(p); setIsDropdownOpen(false); }}
                    className="flex-1 flex items-center gap-2 px-3 py-2 text-sm text-left truncate"
                  >
                    <span>{getProjectIcon(p.project_type)}</span>
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-xs mr-1" style={{ color: '#555878' }}>{p.project_type}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveProject(p.id);
                    }}
                    className="p-1.5 rounded mr-2 transition-colors text-gray-500 hover:text-red-400 hover:bg-[#2d2d4a]"
                    title="Quitar proyecto"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
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

        <div className="flex items-center gap-2">
          {projects.length > 0 && (
            <button
              onClick={handleClearAllProjects}
              className="px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 text-sm flex-shrink-0 transition-all text-[#fca5a5] hover:text-[#f87171]"
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)'; }}
            >
              <Trash2 size={14} />
              Limpiar todo
            </button>
          )}
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
              onRerun={handleRerun}
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
export default App;
