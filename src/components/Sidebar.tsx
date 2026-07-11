import { useState, useMemo, useEffect } from 'react';
import {
  Plus, FolderOpen, ChevronDown, Play, Hammer,
  Trash2, Settings, PlusCircle, ChevronRight, ChevronLeft, Search, X,
  Folder
} from 'lucide-react';
import { Project, ProjectConfig } from '../types';
import { CommandButton } from './CommandButton';

interface SidebarProps {
  projects: Project[];
  selectedProject: Project | null;
  gitBranches: Record<string, string | null>;
  onSelectProject: (project: Project) => void;
  onRemoveProject: (id: string) => void;
  onAddProject: () => void;
  onExecuteCommand: (configIndex: number) => void;
  onEditCommand: (config: ProjectConfig, index: number) => void;
  onDeleteCommand: (configIndex: number) => void;
  onDuplicateCommand: (config: ProjectConfig, index: number) => void;
  onOpenCustomModal: (editingConfig: { config: ProjectConfig; index: number } | null) => void;
}

const getProjectIcon = (type: string) => {
  const icons: Record<string, string> = { Python: '🐍', Scala: '🦭', CSharp: '🎯', React: '⚛️', JavaScript: '🟨' };
  return icons[type] || '📁';
};

const isRunCmd = (name: string) => ['run', 'dev', 'start'].includes(name);
const isBuildCmd = (name: string) => ['build', 'compile'].includes(name);

function CollapsibleGroup({ group, configs, onExecuteCommand, onEditCommand, onDeleteCommand, onDuplicateCommand }: {
  group: string;
  configs: { config: ProjectConfig; index: number }[];
  onExecuteCommand: (configIndex: number) => void;
  onEditCommand: (config: ProjectConfig, index: number) => void;
  onDeleteCommand: (configIndex: number) => void;
  onDuplicateCommand: (config: ProjectConfig, index: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-2">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-1.5 px-1 py-1 rounded text-xs font-semibold uppercase hover:bg-hover transition-colors text-muted"
      >
        <Folder size={11} />
        <span className="flex-1 text-left truncate">{group}</span>
        <span className="text-[10px] text-muted">({configs.length})</span>
        {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
      </button>
      {!collapsed && (
        <div className="space-y-1 mt-1 ml-1">
          {configs.map(({ config, index }) => (
            <CommandButton
              key={`${config.name}-${index}`}
              config={config}
              configIndex={index}
              onRun={onExecuteCommand}
              onEdit={onEditCommand}
              onDelete={onDeleteCommand}
              onDuplicate={onDuplicateCommand}
              icon={isRunCmd(config.name) ? '▶️' : isBuildCmd(config.name) ? '🔨' : '⚙️'}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  projects,
  selectedProject,
  gitBranches,
  onSelectProject,
  onRemoveProject,
  onAddProject,
  onExecuteCommand,
  onEditCommand,
  onDeleteCommand,
  onDuplicateCommand,
  onOpenCustomModal,
}: SidebarProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [projectSearchTerm, setProjectSearchTerm] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setIsCollapsed(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(projectSearchTerm.toLowerCase())
  );

  // Group configurations by their `group` field
  const { groupedConfigs, ungroupedConfigs } = useMemo(() => {
    if (!selectedProject) return { groupedConfigs: new Map<string, { config: ProjectConfig; index: number }[]>(), ungroupedConfigs: [] as { config: ProjectConfig; index: number }[] };

    const grouped = new Map<string, { config: ProjectConfig; index: number }[]>();
    const ungrouped: { config: ProjectConfig; index: number }[] = [];

    selectedProject.configurations.forEach((config, index) => {
      const entry = { config, index };
      if (config.group) {
        const existing = grouped.get(config.group) || [];
        existing.push(entry);
        grouped.set(config.group, existing);
      } else {
        ungrouped.push(entry);
      }
    });

    return { groupedConfigs: grouped, ungroupedConfigs: ungrouped };
  }, [selectedProject]);

  if (!selectedProject) {
    return (
      <div
        className={`flex-shrink-0 flex flex-col transition-all duration-300 bg-base ${isCollapsed ? 'w-12' : 'w-72'}`}
        style={{ borderRight: '1px solid var(--border-color)' }}
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute right-2 top-2 p-1 rounded hover:bg-hover transition-colors z-10 text-muted"
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {!isCollapsed && (
          <div className="flex-1 flex items-center justify-center flex-col gap-3 p-8 text-center text-muted">
            <FolderOpen size={36} className="opacity-40" />
            <p className="text-sm">No project selected</p>
            <button
              onClick={onAddProject}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-xs mt-2 bg-elevated border-light"
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
      className={`flex-shrink-0 flex flex-col transition-all duration-300 relative bg-base ${isCollapsed ? 'w-12' : 'w-72'}`}
      style={{
        borderRight: '1px solid var(--border-color)',
        width: isCollapsed ? '3rem' : '18rem',
        overflow: 'hidden'
      }}
    >
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute right-2 top-2 p-1 rounded hover:bg-hover transition-colors z-10 text-muted"
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {!isCollapsed ? (
        <div className="flex-1 overflow-y-auto">
          {/* Project Info */}
          <div className="p-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <div className="text-xs font-semibold uppercase mb-2 text-muted">Project</div>

            <div className="relative mb-2">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md transition-all text-sm overflow-hidden group relative bg-elevated border-light"
                title={selectedProject.name}
              >
                <span className="flex-shrink-0">{getProjectIcon(selectedProject.project_type)}</span>
                <div className="flex-1 text-left min-w-0">
                  <div className="font-medium truncate">
                    {selectedProject.name}
                  </div>
                </div>
                <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: 'var(--border-color)', color: '#6e7fff' }}>
                  {selectedProject.project_type}
                </span>
                <ChevronDown size={14} className={`text-muted flex-shrink-0 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-full rounded-md shadow-xl z-20 overflow-hidden bg-surface border-standard">
                  <div className="p-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <div className="relative">
                      <Search size={12} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted" />
                      <input
                        type="text"
                        placeholder="Search projects..."
                        value={projectSearchTerm}
                        onChange={(e) => setProjectSearchTerm(e.target.value)}
                        className="w-full pl-7 pr-6 py-1.5 text-xs rounded bg-elevated border-light text-primary"
                        style={{ outline: 'none' }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {projectSearchTerm && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setProjectSearchTerm('');
                          }}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto">
                    {filteredProjects.length > 0 ? (
                      filteredProjects.map(p => (
                        <div key={p.id} className="w-full flex items-center justify-between group">
                          <button
                            onClick={() => { onSelectProject(p); setIsDropdownOpen(false); setProjectSearchTerm(''); }}
                            className="flex-1 flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-hover overflow-hidden"
                            title={p.name}
                          >
                            <span className="flex-shrink-0">{getProjectIcon(p.project_type)}</span>
                            <span className="flex-1 truncate">{p.name}</span>
                            <span className="text-xs mr-1 flex-shrink-0 text-muted">{p.project_type}</span>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onRemoveProject(p.id); }}
                            className="p-1.5 rounded mr-2 transition-colors text-gray-500 hover:text-red-400 hover:bg-[#2d2d4a] flex-shrink-0 opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4 text-xs text-muted">
                        No projects found
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {gitBranches[selectedProject.id] && (
              <div className="mt-2">
                <span
                  className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-mono w-fit max-w-full truncate cursor-help"
                  style={{ backgroundColor: '#1e1529', color: '#c084fc', border: '1px solid #3b1f6a' }}
                  title={gitBranches[selectedProject.id] || ''}
                >
                  🍃 {gitBranches[selectedProject.id]}
                </span>
              </div>
            )}
          </div>

          {/* Grouped command sections */}
          <div className="p-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
            {Array.from(groupedConfigs.entries()).map(([group, configs]) => (
              <CollapsibleGroup
                key={group}
                group={group}
                configs={configs}
                onExecuteCommand={onExecuteCommand}
                onEditCommand={onEditCommand}
                onDeleteCommand={onDeleteCommand}
                onDuplicateCommand={onDuplicateCommand}
              />
            ))}

            {/* Ungrouped Run commands */}
            {ungroupedConfigs.filter(c => isRunCmd(c.config.name)).length > 0 && (
              <>
                <div className="text-xs font-semibold uppercase mb-2 flex items-center gap-1.5 text-muted">
                  <Play size={11} /> Run
                </div>
                <div className="space-y-1.5 mb-3">
                  {ungroupedConfigs
                    .filter(c => isRunCmd(c.config.name))
                    .map(({ config, index }) => (
                      <CommandButton
                        key={config.name}
                        config={config}
                        configIndex={index}
                        onRun={onExecuteCommand}
                        onEdit={onEditCommand}
                        onDelete={onDeleteCommand}
                        onDuplicate={onDuplicateCommand}
                        icon="▶️"
                      />
                    ))}
                </div>
              </>
            )}

            {/* Ungrouped Build commands */}
            {ungroupedConfigs.filter(c => isBuildCmd(c.config.name)).length > 0 && (
              <>
                <div className="text-xs font-semibold uppercase mb-2 flex items-center gap-1.5 text-muted">
                  <Hammer size={11} /> Build
                </div>
                <div className="space-y-1.5 mb-3">
                  {ungroupedConfigs
                    .filter(c => isBuildCmd(c.config.name))
                    .map(({ config, index }) => (
                      <CommandButton
                        key={config.name}
                        config={config}
                        configIndex={index}
                        onRun={onExecuteCommand}
                        onEdit={onEditCommand}
                        onDelete={onDeleteCommand}
                        onDuplicate={onDuplicateCommand}
                        icon="🔨"
                      />
                    ))}
                </div>
              </>
            )}
          </div>

          {/* Ungrouped Custom Commands + Add button */}
          <div className="p-4 flex-1">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase flex items-center gap-1.5 text-muted">
                <Settings size={11} /> Custom
              </div>
              <button
                onClick={() => onOpenCustomModal(null)}
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors flex-shrink-0"
                style={{ color: '#6e7fff' }}
              >
                <PlusCircle size={11} /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {ungroupedConfigs
                .filter(c => !isRunCmd(c.config.name) && !isBuildCmd(c.config.name))
                .map(({ config, index }) => (
                  <CommandButton
                    key={config.name}
                    config={config}
                    configIndex={index}
                    onRun={onExecuteCommand}
                    onEdit={onEditCommand}
                    onDelete={onDeleteCommand}
                    onDuplicate={onDuplicateCommand}
                    icon="⚙️"
                  />
                ))}
              {ungroupedConfigs.filter(c => !isRunCmd(c.config.name) && !isBuildCmd(c.config.name)).length === 0 && (
              <div className="text-xs text-center py-4 text-muted">
                No custom commands yet
              </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Collapsed version */
        <div className="flex flex-col items-center py-4 gap-3" style={{ overflow: 'visible' }}>
          <button
            onClick={onAddProject}
            className="mt-6 p-2 rounded hover:bg-hover transition-colors relative group"
            title="Add project"
          >
            <Plus size={18} />
            <span className="absolute left-full ml-2 top-1/2 transform -translate-y-1/2 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 bg-elevated border-light text-primary">
              Add project
            </span>
          </button>

          <button
            onClick={() => onOpenCustomModal(null)}
            className="p-2 rounded hover:bg-hover transition-colors relative group"
            title="Add custom command"
          >
            <PlusCircle size={18} style={{ color: '#6e7fff' }} />
            <span className="absolute left-full ml-2 top-1/2 transform -translate-y-1/2 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 bg-elevated border-light" style={{ color: '#6e7fff' }}>
              Add command
            </span>
          </button>

          <div className="w-6 h-px border-light" style={{ backgroundColor: 'var(--border-light)' }} />

          <div
            className="text-2xl relative group cursor-help"
            title={selectedProject.name}
          >
            {getProjectIcon(selectedProject.project_type)}
            <span className="absolute left-full ml-2 top-1/2 transform -translate-y-1/2 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 bg-elevated border-light text-primary">
              {selectedProject.name}
            </span>
          </div>

          {gitBranches[selectedProject.id] && (
            <div
              className="px-1 py-0.5 rounded text-[10px] font-mono truncate max-w-full text-center cursor-help relative group"
              style={{ backgroundColor: '#1e1529', color: '#c084fc' }}
              title={gitBranches[selectedProject.id] || ''}
            >
              🍃
              <span className="absolute left-full ml-2 top-1/2 transform -translate-y-1/2 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 bg-elevated border-light" style={{ color: '#c084fc' }}>
                {gitBranches[selectedProject.id]}
              </span>
            </div>
          )}

          <div className="w-6 h-px border-light" style={{ backgroundColor: 'var(--border-light)' }} />

          {selectedProject.configurations.slice(0, 4).map((c, i) => (
            <button
              key={i}
              onClick={() => onExecuteCommand(i)}
              className="p-2 rounded hover:bg-hover transition-colors relative group"
              title={c.name}
            >
              {isRunCmd(c.name) ? <Play size={16} style={{ color: '#4ade80' }} /> :
               isBuildCmd(c.name) ? <Hammer size={16} style={{ color: '#fbbf24' }} /> :
               <Settings size={16} style={{ color: '#6e7fff' }} />}

              <span className="absolute left-full ml-2 top-1/2 transform -translate-y-1/2 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 bg-elevated border-light text-primary">
                {c.name}
              </span>
            </button>
          ))}

          {selectedProject.configurations.length > 4 && (
            <div
              className="text-[10px] px-1 py-0.5 rounded mt-1 cursor-help relative group bg-elevated text-muted"
              title={`${selectedProject.configurations.length - 4} more commands`}
            >
              +{selectedProject.configurations.length - 4}
              <span className="absolute left-full ml-2 top-1/2 transform -translate-y-1/2 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 bg-elevated border-light text-primary">
                {selectedProject.configurations.length - 4} more commands available
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
