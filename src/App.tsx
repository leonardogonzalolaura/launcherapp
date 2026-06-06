import { useState, useEffect, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Plus, Terminal, 
  Trash2, X, ChevronRight, Loader2
} from 'lucide-react';
import { Project, ProjectConfig, ProcessTab, LogLine, StreamMessage } from './types';
import { useTauriCommands } from './hooks/useTauriCommands';
import { UnlistenFn } from '@tauri-apps/api/event';
import { CustomCommandModal } from './components/CustomCommandModal';
import { ConsoleTab } from './components/ConsoleTab';
import { Sidebar } from './components/Sidebar';

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
  const [processTabs, setProcessTabs] = useState<ProcessTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [, setIsDropdownOpen] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<{ config: ProjectConfig; index: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Mapa projectId -> rama git actual (polling en vivo)
  const [gitBranches, setGitBranches] = useState<Record<string, string | null>>({});

  const unlistenRef = useRef<UnlistenFn[]>([]);
  const restoringRef = useRef(false);

  const {
    getProjects, addProject, detectProject, removeProject, clearAllProjects,
    spawnProjectCommand, stopProcess,
    addCustomCommand, updateProjectConfig, deleteProjectConfig,
    onProcessOutput, onProcessExit, getGitBranch,
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

  // ─── Polling de rama git ────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedProject) return;

    const fetchBranch = async () => {
      try {
        const branch = await getGitBranch(selectedProject.path);
        setGitBranches(prev => {
          // Solo actualizar si cambió para evitar re-renders innecesarios
          if (prev[selectedProject.id] === branch) return prev;
          return { ...prev, [selectedProject.id]: branch };
        });
      } catch { }
    };

    fetchBranch(); // Consulta inmediata al seleccionar proyecto
    const interval = setInterval(fetchBranch, 3000); // Polling cada 3s
    return () => clearInterval(interval);
  }, [selectedProject?.id]);

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

const handleClearLogs = (processId: string) => {
  setProcessTabs(prev =>
    prev.map(tab =>
      tab.process_id === processId
        ? { ...tab, logs: [] }  // Limpia los logs
        : tab
    )
  );
};
  // ─── Execute ─────────────────────────────────────────────────────────────
  const handleExecute = async (configName: string) => {
    if (!selectedProject) return;
    try {
      const [info, branch] = await Promise.all([
        spawnProjectCommand(selectedProject.id, configName),
        getGitBranch(selectedProject.path),
      ]);
      const newTab: ProcessTab = {
        process_id: info.id,
        project_id: selectedProject.id,
        project_name: info.project_name,
        config_name: info.config_name,
        status: 'running',
        logs: [],
        started_at: info.started_at,
        git_branch: branch,
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
      const project = projects.find(p => p.id === tabToRerun.project_id);
      const [info, branch] = await Promise.all([
        spawnProjectCommand(tabToRerun.project_id, tabToRerun.config_name),
        project ? getGitBranch(project.path) : Promise.resolve(null),
      ]);
      setProcessTabs(prev =>
        prev.map(tab =>
          tab.process_id === processId
            ? {
              ...tab,
              process_id: info.id,
              status: 'running',
              logs: [],
              started_at: info.started_at,
              git_branch: branch,
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

  const handleCloseTab = async (processId: string) => {
    const tab = processTabs.find(t => t.process_id === processId);
    if (tab && tab.status === 'running') {
      try {
        await stopProcess(processId);
      } catch (e) {
        console.error("Failed to stop process when closing tab:", e);
      }
    }
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
  const activeTab = processTabs.find(t => t.process_id === activeTabId) ?? null;

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: '#0d0d14', color: '#e2e4f0', fontFamily: "'Inter', sans-serif" }}>

      {/* ─── Navbar ──────────────────────────────────────────────────────── */}
      <div className="h-13 min-h-[52px] px-5 flex items-center justify-between gap-4" style={{ backgroundColor: '#10101c', borderBottom: '1px solid #1e1e38' }}>
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
                {(gitBranches[tab.project_id] ?? tab.git_branch) && (
                  <span className="flex items-center gap-0.5" style={{ color: '#a78bfa', fontSize: '10px' }}>
                    ⎇ {gitBranches[tab.project_id] ?? tab.git_branch}
                  </span>
                )}
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

      </div>

      {/* ─── Main Layout ─────────────────────────────────────────────────── */}
<div className="flex-1 flex overflow-hidden">
      <Sidebar
        projects={projects}
        selectedProject={selectedProject}
       // isLoading={isLoading}
        gitBranches={gitBranches}
        onSelectProject={(project) => {
          setSelectedProject(project);
          setIsDropdownOpen(false);
        }}
        onRemoveProject={handleRemoveProject}
        onAddProject={handleAddProject}
        onExecuteCommand={handleExecute}
        onEditCommand={(config, index) => {
          setEditingConfig({ config, index });
          setShowCustomModal(true);
        }}
        onDeleteCommand={handleDeleteConfig}
        onOpenCustomModal={(editingConfig) => {
          setEditingConfig(editingConfig);
          setShowCustomModal(true);
        }}
      />

        {/* Console Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTab ? (
            <ConsoleTab
              key={activeTab.process_id}
              tab={activeTab}
              liveGitBranch={gitBranches[activeTab.project_id]}
              onStop={handleStop}
              onClose={handleCloseTab}
              onRerun={handleRerun}
              onClear={handleClearLogs}
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

      {/* Footer con estadísticas y acciones */}
      <div className="h-8 px-4 flex items-center justify-between text-xs" style={{ backgroundColor: '#0a0a10', borderTop: '1px solid #1e1e38' }}>
        <div className="flex gap-4" style={{ color: '#555878' }}>
          <span>📁 {projects.length} proyectos</span>
          <span>🖥️ {processTabs.length} procesos activos</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleAddProject}
            disabled={isLoading}
            className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#1f1f35] transition-colors"
          >
            {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            <span>Agregar</span>
          </button>

          {projects.length > 0 && (
            <button
              onClick={handleClearAllProjects}
              className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#2d2d4a] transition-colors"
              style={{ color: '#fca5a5' }}
            >
              <Trash2 size={12} />
              <span>Limpiar projectos registrados</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
export default App;
