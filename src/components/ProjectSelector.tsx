import React from 'react';
import { Project } from '../types';
import { ChevronDown } from 'lucide-react';

interface Props {
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (project: Project) => void;
  onAddProject: () => void;
  isAdding: boolean;
}

const getProjectIcon = (type: Project['project_type']) => {
  switch (type) {
    case 'Python': return '🐍';
    case 'Scala': return '🦭';
    case 'CSharp': return '🎯';
    case 'React': return '⚛️';
    default: return '📁';
  }
};

export const ProjectSelector: React.FC<Props> = ({
  projects,
  selectedProject,
  onSelectProject,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2 bg-dark-bg rounded-lg hover:bg-dark-surface-hover transition-colors min-w-[200px]"
      >
        {selectedProject ? (
          <>
            <span className="text-xl">{getProjectIcon(selectedProject.project_type)}</span>
            <div className="flex-1 text-left">
              <div className="font-medium">{selectedProject.name}</div>
              <div className="text-xs text-gray-400">{selectedProject.project_type}</div>
            </div>
          </>
        ) : (
          <span className="text-gray-400">Select a project...</span>
        )}
        <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && projects.length > 0 && (
        <div className="absolute top-full left-0 mt-2 w-full bg-dark-surface rounded-lg shadow-xl border border-gray-700 z-10">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => {
                onSelectProject(project);
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-dark-surface-hover transition-colors first:rounded-t-lg last:rounded-b-lg"
            >
              <span className="text-xl">{getProjectIcon(project.project_type)}</span>
              <div className="flex-1 text-left">
                <div className="font-medium">{project.name}</div>
                <div className="text-xs text-gray-400">{project.project_type}</div>
              </div>
              {project.language_version && (
                <span className="text-xs text-gray-500">{project.language_version}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
