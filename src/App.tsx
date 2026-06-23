import { useState, useEffect, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Plus, Terminal,
  Trash2, ChevronRight, Loader2, MoreHorizontal
} from 'lucide-react';
import { Project, ProjectConfig, ProcessTab, LogLine, StreamMessage } from './types';
import { useTauriCommands } from './hooks/useTauriCommands';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { CustomCommandModal } from './components/CustomCommandModal';
import { ConsoleTab } from './components/ConsoleTab';
import { Sidebar } from './components/Sidebar';
import { ToastProvider, useToast } from './components/Toast';
import { ConfirmModal } from './components/ConfirmModal';
import { Title } from './components/Title';

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

function AppContent() {
  const { addToast } = useToast();
  const [projects, setProjects] = useState<Project[]>(() => loadProjectsFromStorage());
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [processTabs, setProcessTabs] = useState<ProcessTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [, setIsDropdownOpen] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<{ config: ProjectConfig; index: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ configIndex: number; configName: string } | null>(null);
  const [showFooterMenu, setShowFooterMenu] = useState(false);
  // Mapa projectId -> rama git actual (polling en vivo)
  const [gitBranches, setGitBranches] = useState<Record<string, string | null>>({});
  const [tabPosition, setTabPosition] = useState<'top' | 'bottom'>(() => {
    const stored = localStorage.getItem('tab_position');
    return stored === 'top' || stored === 'bottom' ? stored : 'bottom';
  });

  const unlistenRef = useRef<UnlistenFn[]>([]);
  const restoringRef = useRef(false);

  const {
    getProjects, addProject, detectProject, removeProject, clearAllProjects,
    spawnProjectCommand, stopProcess,
    addCustomCommand, updateProjectConfig, deleteProjectConfig,
    onProcessOutput, onProcessExit, getGitBranch,
    watchGitBranch, unwatchGitBranch,
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

  // Save tabPosition to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('tab_position', tabPosition);
  }, [tabPosition]);

  // Ref to track selected project in callbacks without re-triggering effects
  const selectedProjectRef = useRef<Project | null>(null);
  useEffect(() => {
    selectedProjectRef.current = selectedProject;
  }, [selectedProject]);

  // ─── Escuchar cambios de rama git ──────────────────────────────────────────
  useEffect(() => {
    let unlisten: UnlistenFn;

    (async () => {
      unlisten = await listen<{ project_id: string; project_path: string }>('git-branch-changed', async (event) => {
        const { project_id, project_path } = event.payload;
        const currentSelected = selectedProjectRef.current;
        if (currentSelected && currentSelected.id === project_id) {
          try {
            const branch = await getGitBranch(project_path);
            setGitBranches(prev => {
              if (prev[project_id] === branch) return prev;
              return { ...prev, [project_id]: branch };
            });
          } catch {}
        }
      });
    })();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // ─── Monitorear rama git con File Watcher (Eventos) ───────────────────────
  useEffect(() => {
    if (!selectedProject) return;

    const fetchAndWatch = async () => {
      // 1. Consulta inmediata al seleccionar proyecto
      try {
        const branch = await getGitBranch(selectedProject.path);
        setGitBranches(prev => {
          if (prev[selectedProject.id] === branch) return prev;
          return { ...prev, [selectedProject.id]: branch };
        });
      } catch {}

      // 2. Activar watcher en el backend
      try {
        await watchGitBranch(selectedProject.id, selectedProject.path);
      } catch (err) {
        console.error("Error setting up git watcher:", err);
      }
    };

    fetchAndWatch();

    return () => {
      // Limpiar watcher del backend al cambiar de proyecto o desmontar
      unwatchGitBranch(selectedProject.id).catch(() => {});
    };
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
  const handleExecute = async (configIndex: number) => {
    if (!selectedProject) return;
    const config = selectedProject.configurations[configIndex];
    if (!config) return;
    try {
      const [info, branch] = await Promise.all([
        spawnProjectCommand(selectedProject.id, configIndex),
        getGitBranch(selectedProject.path),
      ]);
      const newTab: ProcessTab = {
        process_id: info.id,
        project_id: selectedProject.id,
        project_name: info.project_name,
        config_name: info.config_name,
        config_index: configIndex,
        config_group: config.group,
        status: 'running',
        logs: [],
        started_at: info.started_at,
        git_branch: branch,
        project_type: selectedProject.project_type,
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
      const configIndex = tabToRerun.config_index;
      const [info, branch] = await Promise.all([
        spawnProjectCommand(tabToRerun.project_id, configIndex),
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

  const handleDeleteConfig = (configIndex: number) => {
    if (!selectedProject) return;
    const configName = selectedProject.configurations[configIndex]?.name ?? 'unknown';
    setConfirmDelete({ configIndex, configName });
  };

  const confirmDeleteConfig = async () => {
    if (!selectedProject || !confirmDelete) return;
    try {
      const updatedProject = await deleteProjectConfig(selectedProject.id, confirmDelete.configIndex);
      setProjects(prev => prev.map(p => p.id === selectedProject.id ? updatedProject : p));
      setSelectedProject(updatedProject);
      addToast({ type: 'success', message: `Comando "${confirmDelete.configName}" eliminado` });
    } catch (e) {
      addToast({ type: 'error', message: `Error al eliminar: ${e}` });
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleDuplicateConfig = async (config: ProjectConfig, _index: number) => {
    if (!selectedProject) return;
    const duplicated: ProjectConfig = {
      ...config,
      name: `${config.name} (copia)`,
      is_custom: true,
    };
    try {
      const updatedProject = await addCustomCommand(selectedProject.id, duplicated);
      setProjects(prev => prev.map(p => p.id === selectedProject.id ? updatedProject : p));
      setSelectedProject(updatedProject);
      addToast({ type: 'success', message: `Comando "${config.name}" duplicado como "${duplicated.name}"` });
    } catch (e) {
      addToast({ type: 'error', message: `Error al duplicar: ${e}` });
    }
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

      {/* ─── Title ──────────────────────────────────────────────────────────── */}
      <Title
        tabPosition={tabPosition}
        onToggleTabPosition={() => setTabPosition(prev => prev === 'top' ? 'bottom' : 'top')}
      />

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
        onDuplicateCommand={handleDuplicateConfig}
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
              tabPosition={tabPosition}
              allTabs={processTabs}
              activeTabId={activeTabId}
              onSelectTab={setActiveTabId}
              onCloseTab={handleCloseTab}
              gitBranches={gitBranches}
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
                  {selectedProject.configurations.slice(0, 3).map((c, i) => (
                    <button
                      key={`${c.name}-${i}`}
                      onClick={() => handleExecute(i)}
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

      {/* Confirm Delete Command Modal */}
      {confirmDelete && selectedProject && (
        <ConfirmModal
          title="Eliminar comando"
          message={`¿Estás seguro de eliminar el comando "${confirmDelete.configName}"?`}
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          confirmStyle="danger"
          onConfirm={confirmDeleteConfig}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Footer */}
      <div className="h-8 px-4 flex items-center justify-between text-xs" style={{ backgroundColor: '#0a0a10', borderTop: '1px solid #1e1e38' }}>
        <div className="flex items-center gap-4" style={{ color: '#555878' }}>
          <span className="flex items-center gap-1">📁 {projects.length}</span>
          <span className="flex items-center gap-1">🖥️ {processTabs.length}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setTabPosition(prev => prev === 'top' ? 'bottom' : 'top')}
            className="px-2 py-0.5 rounded hover:bg-[#1f1f35] transition-colors text-[10px] font-mono"
            style={{ color: '#555878' }}
            title={tabPosition === 'top' ? 'Mover tabs abajo' : 'Mover tabs arriba'}
          >
            {tabPosition === 'top' ? '▼ Tabs' : '▲ Tabs'}
          </button>

          <button
            onClick={handleAddProject}
            disabled={isLoading}
            className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#1f1f35] transition-colors"
          >
            {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            <span>Agregar</span>
          </button>

          {/* Menú de acciones (gear) */}
          <div className="relative">
            <button
              onClick={() => setShowFooterMenu(!showFooterMenu)}
              className="p-1 rounded hover:bg-[#1f1f35] transition-colors"
              style={{ color: '#555878' }}
              title="Más acciones"
            >
              <MoreHorizontal size={14} />
            </button>
            {showFooterMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowFooterMenu(false)} />
                <div
                  className="absolute bottom-full right-0 mb-1 w-52 rounded-md shadow-xl z-20 overflow-hidden"
                  style={{ backgroundColor: '#13131f', border: '1px solid #252540' }}
                >
                  {projects.length > 0 && (
                    <button
                      onClick={() => { setShowFooterMenu(false); handleClearAllProjects(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-[#1f1f35] transition-colors"
                      style={{ color: '#f87171' }}
                    >
                      <Trash2 size={12} />
                      <span>Limpiar todos los proyectos</span>
                    </button>
                  )}
                  <div className="px-3 py-1.5 text-[10px]" style={{ color: '#3d3f60', borderTop: '1px solid #252540' }}>
                    HorseLaunch v0.2.1
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
