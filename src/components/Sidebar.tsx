import { useState } from 'react';
import {
  Plus, FolderOpen, ChevronDown, Play, Hammer,
  Trash2, Settings, PlusCircle, ChevronRight, Loader2, ChevronLeft
} from 'lucide-react';
import { Project, ProjectConfig } from '../types';
import { CommandButton } from './CommandButton';

interface SidebarProps {
  projects: Project[];
  selectedProject: Project | null;
  isLoading: boolean;
  gitBranches: Record<string, string | null>;
  onSelectProject: (project: Project) => void;
  onRemoveProject: (id: string) => void;
  onAddProject: () => void;
  onExecuteCommand: (configName: string) => void;
  onEditCommand: (config: ProjectConfig, index: number) => void;
  onDeleteCommand: (configIndex: number) => void;
  onOpenCustomModal: (editingConfig: { config: ProjectConfig; index: number } | null) => void;
}

// Helper functions
const getProjectIcon = (type: string) => {
  const icons: Record<string, string> = { Python: '🐍', Scala: '🦭', CSharp: '🎯', React: '⚛️' };
  return icons[type] || '📁';
};

const isRunCmd = (name: string) => ['run', 'dev', 'start'].includes(name);
const isBuildCmd = (name: string) => ['build', 'compile'].includes(name);

export function Sidebar({
  projects,
  selectedProject,
  isLoading,
  gitBranches,
  onSelectProject,
  onRemoveProject,
  onAddProject,
  onExecuteCommand,
  onEditCommand,
  onDeleteCommand,
  onOpenCustomModal,
}: SidebarProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!selectedProject) {
    return (
      <div 
        className={`flex-shrink-0 flex flex-col transition-all duration-300 ${isCollapsed ? 'w-12' : 'w-72'}`}
        style={{ backgroundColor: '#10101c', borderRight: '1px solid #1e1e38' }}
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute right-2 top-2 p-1 rounded hover:bg-[#1f1f35] transition-colors z-10"
          style={{ color: '#555878' }}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        
        {!isCollapsed && (
          <div className="flex-1 flex items-center justify-center flex-col gap-3 p-8 text-center" style={{ color: '#3d3f60' }}>
            <FolderOpen size={36} className="opacity-40" />
            <p className="text-sm">No project selected</p>
            <button
              onClick={onAddProject}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-xs mt-2"
              style={{ backgroundColor: '#1a1a2e', border: '1px solid #2e2e50' }}
            >
              <Plus size={12} /> Add Project
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className={`flex-shrink-0 overflow-y-auto flex flex-col transition-all duration-300 relative ${isCollapsed ? 'w-12' : 'w-80.5'}`}
      style={{ backgroundColor: '#10101c', borderRight: '1px solid #1e1e38' }}
    >
      {/* Botón colapsar/expandir */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute right-2 top-2 p-1 rounded hover:bg-[#1f1f35] transition-colors z-10"
        style={{ color: '#555878' }}
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {!isCollapsed ? (
        <>
          {/* Project Info */}
          <div className="p-4" style={{ borderBottom: '1px solid #1e1e38' }}>
            <div className="text-xs font-semibold uppercase mb-2" style={{ color: '#3d3f60' }}>Project</div>
            {/* Dropdown selector */}
            <div className="relative mb-2">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md transition-all text-sm"
                style={{ backgroundColor: '#1a1a2e', border: '1px solid #2e2e50' }}
              >
                <span>{getProjectIcon(selectedProject.project_type)}</span>
                <div className="flex-1 text-left min-w-0">
                  <div className="font-medium truncate">{selectedProject.name}</div>
                </div>
                <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: '#252540', color: '#6e7fff' }}>
                  {selectedProject.project_type}
                </span>
                <ChevronDown size={14} style={{ color: '#555878', flexShrink: 0 }} className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDropdownOpen && projects.length > 0 && (
                <div className="absolute top-full left-0 mt-1 w-full rounded-md shadow-xl z-20 overflow-hidden" style={{ backgroundColor: '#13131f', border: '1px solid #252540' }}>
                  {projects.map(p => (
                    <div key={p.id} className="w-full flex items-center justify-between">
                      <button
                        onClick={() => { onSelectProject(p); setIsDropdownOpen(false); }}
                        className="flex-1 flex items-center gap-2 px-3 py-2 text-sm text-left truncate hover:bg-[#1f1f35]"
                      >
                        <span>{getProjectIcon(p.project_type)}</span>
                        <span className="flex-1 truncate">{p.name}</span>
                        <span className="text-xs mr-1" style={{ color: '#555878' }}>{p.project_type}</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onRemoveProject(p.id); }}
                        className="p-1.5 rounded mr-2 transition-colors text-gray-500 hover:text-red-400 hover:bg-[#2d2d4a]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Path 
            <div className="text-xs font-mono truncate p-2 rounded" style={{ color: '#555878', backgroundColor: '#0d0d14', border: '1px solid #1e1e38' }}>
              {selectedProject.path}
            </div>
            */}
            {/* Git branch */}
            {gitBranches[selectedProject.id] && (
              <div className="mt-2">
                <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-mono w-fit" style={{ backgroundColor: '#1e1529', color: '#c084fc', border: '1px solid #3b1f6a' }}>
                  🍃 {gitBranches[selectedProject.id]}
                </span>
              </div>
            )}
          </div>

          {/* Run Commands */}
          {selectedProject.configurations.filter(c => isRunCmd(c.name)).length > 0 && (
            <div className="p-4" style={{ borderBottom: '1px solid #1e1e38' }}>
              <div className="text-xs font-semibold uppercase mb-2 flex items-center gap-1.5" style={{ color: '#3d3f60' }}>
                <Play size={11} /> Run
              </div>
              <div className="space-y-1.5">
                {selectedProject.configurations
                  .filter(c => isRunCmd(c.name))
                  .map((c, i) => (
                    <CommandButton 
                      key={i} 
                      config={c} 
                      configIndex={i} 
                      onRun={onExecuteCommand} 
                      onEdit={onEditCommand} 
                      onDelete={onDeleteCommand} 
                      icon="▶️" 
                    />
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
                  .filter(c => isBuildCmd(c.name))
                  .map((c, i) => (
                    <CommandButton 
                      key={i} 
                      config={c} 
                      configIndex={i} 
                      onRun={onExecuteCommand} 
                      onEdit={onEditCommand} 
                      onDelete={onDeleteCommand} 
                      icon="🔨" 
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Custom Commands */}
          <div className="p-4 flex-1">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase flex items-center gap-1.5" style={{ color: '#3d3f60' }}>
                <Settings size={11} /> Custom
              </div>
              <button
                onClick={() => onOpenCustomModal(null)}
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors"
                style={{ color: '#6e7fff' }}
              >
                <PlusCircle size={11} /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {selectedProject.configurations
                .filter(c => !isRunCmd(c.name) && !isBuildCmd(c.name))
                .map((c, i) => (
                  <CommandButton 
                    key={i} 
                    config={c} 
                    configIndex={i} 
                    onRun={onExecuteCommand} 
                    onEdit={onEditCommand} 
                    onDelete={onDeleteCommand} 
                    icon="⚙️" 
                  />
                ))}
              {selectedProject.configurations.filter(c => !isRunCmd(c.name) && !isBuildCmd(c.name)).length === 0 && (
                <div className="text-xs text-center py-4" style={{ color: '#3d3f60' }}>
                  No custom commands yet
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Versión colapsada - solo íconos */
        <div className="flex flex-col items-center gap-4 mt-8">
          <button
            onClick={onAddProject}
            className="p-2 rounded hover:bg-[#1f1f35] transition-colors"
            title="Add project"
          >
            <Plus size={18} />
          </button>
          {selectedProject && (
            <>
              <div className="text-2xl">{getProjectIcon(selectedProject.project_type)}</div>
              {selectedProject.configurations.slice(0, 3).map((c, i) => (
                <button
                  key={i}
                  onClick={() => onExecuteCommand(c.name)}
                  className="p-2 rounded hover:bg-[#1f1f35] transition-colors"
                  title={c.name}
                >
                  {isRunCmd(c.name) ? <Play size={16} /> : isBuildCmd(c.name) ? <Hammer size={16} /> : <Settings size={16} />}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}