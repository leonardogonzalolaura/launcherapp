import React from 'react';
import { Project, ProjectConfig } from '../types';
import { Play, Settings, Hammer, TestTube, Rocket, Loader2 } from 'lucide-react';

interface Props {
  project: Project;
  onExecuteCommand: (configName: string) => void;
  isLoading: boolean;
}

const getCommandIcon = (name: string) => {
  switch (name) {
    case 'run': return <Play size={16} />;
    case 'build':
    case 'compile': return <Hammer size={16} />;
    case 'test': return <TestTube size={16} />;
    case 'dev': return <Rocket size={16} />;
    default: return <Settings size={16} />;
  }
};

const getCommandColor = (name: string) => {
  switch (name) {
    case 'run': return 'text-green-400 hover:bg-green-400/10';
    case 'build':
    case 'compile': return 'text-blue-400 hover:bg-blue-400/10';
    case 'test': return 'text-yellow-400 hover:bg-yellow-400/10';
    case 'dev': return 'text-purple-400 hover:bg-purple-400/10';
    default: return 'text-gray-400 hover:bg-gray-400/10';
  }
};

export const CommandPanel: React.FC<Props> = ({ project, onExecuteCommand, isLoading }) => {
  // Separar comandos por categorías
  const runCommands = project.configurations.filter(c => 
    ['run', 'dev', 'start'].includes(c.name)
  );
  const buildCommands = project.configurations.filter(c => 
    ['build', 'compile'].includes(c.name)
  );
  const testCommands = project.configurations.filter(c => 
    ['test'].includes(c.name)
  );
  const otherCommands = project.configurations.filter(c => 
    !['run', 'dev', 'start', 'build', 'compile', 'test'].includes(c.name)
  );

  const renderCommandButton = (config: ProjectConfig) => (
    <button
      key={config.name}
      onClick={() => onExecuteCommand(config.name)}
      disabled={isLoading}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${getCommandColor(config.name)}`}
    >
      {getCommandIcon(config.name)}
      <div className="flex-1 text-left">
        <div className="font-medium capitalize">{config.name}</div>
        <div className="text-xs opacity-70 font-mono truncate">{config.command}</div>
      </div>
      {config.requires_build && (
        <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">needs build</span>
      )}
    </button>
  );

  return (
    <div className="p-4 space-y-6">
      {/* Project Info */}
      <div className="card">
        <h3 className="font-semibold mb-2">Project Info</h3>
        <div className="text-sm space-y-1 text-gray-300">
          <p><span className="text-gray-500">Path:</span> {project.path}</p>
          {project.language_version && (
            <p><span className="text-gray-500">Version:</span> {project.language_version}</p>
          )}
          {project.env_files.length > 0 && (
            <p><span className="text-gray-500">Config:</span> {project.env_files.map(f => 
              <span key={f} className="inline-block bg-dark-bg px-1 rounded text-xs ml-1">{f.split('/').pop()}</span>
            )}</p>
          )}
        </div>
      </div>

      {/* Run Commands */}
      {runCommands.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2 flex items-center gap-2">
            <Play size={14} /> Run
          </h3>
          <div className="space-y-2">
            {runCommands.map(renderCommandButton)}
          </div>
        </div>
      )}

      {/* Build Commands */}
      {buildCommands.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2 flex items-center gap-2">
            <Hammer size={14} /> Build 
          </h3>
          <div className="space-y-2">
            {buildCommands.map(renderCommandButton)}
          </div>
        </div>
      )}

      {/* Test Commands */}
      {testCommands.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2 flex items-center gap-2">
            <TestTube size={14} /> Test
          </h3>
          <div className="space-y-2">
            {testCommands.map(renderCommandButton)}
          </div>
        </div>
      )}

      {/* Other Commands */}
      {otherCommands.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2 flex items-center gap-2">
            <Settings size={14} /> Other
          </h3>
          <div className="space-y-2">
            {otherCommands.map(renderCommandButton)}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <Loader2 size={16} className="animate-spin" />
          <span>Executing...</span>
        </div>
      )}
    </div>
  );
};