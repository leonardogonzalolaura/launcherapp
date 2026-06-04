import React, { useRef, useEffect } from 'react';
import { CheckCircle, XCircle, Info, Terminal } from 'lucide-react';

interface Output {
  project: string;
  command: string;
  output_type: 'stdout' | 'stderr' | 'info';
  content: string;
  timestamp: Date;
}

interface Props {
  outputs: Output[];
}

const getOutputIcon = (type: Output['output_type']) => {
  switch (type) {
    case 'stdout': return <CheckCircle size={14} className="text-green-400" />;
    case 'stderr': return <XCircle size={14} className="text-red-400" />;
    case 'info': return <Info size={14} className="text-blue-400" />;
  }
};

const getOutputStyle = (type: Output['output_type'], content: string) => {
  if (type === 'stderr') return 'text-red-400';
  if (type === 'stdout') return 'text-green-300';
  if (content.includes('✅')) return 'text-green-400';
  if (content.includes('❌')) return 'text-red-400';
  return 'text-gray-300';
};

export const OutputConsole: React.FC<Props> = ({ outputs }) => {
  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [outputs]);

  if (outputs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <Terminal size={48} className="mx-auto mb-4 opacity-50" />
          <p>No output yet</p>
          <p className="text-sm">Execute a command to see results</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 font-mono text-sm">
      {outputs.map((output, index) => (
        <div key={index} className="mb-2 group">
          <div className="flex items-start gap-2">
            <span className="flex-shrink-0 mt-0.5">{getOutputIcon(output.output_type)}</span>
            <span className="text-gray-500 text-xs flex-shrink-0">
              {output.timestamp.toLocaleTimeString()}
            </span>
            <span className="text-gray-600 text-xs flex-shrink-0">
              [{output.project}]
            </span>
            <span className={`flex-1 whitespace-pre-wrap break-all ${getOutputStyle(output.output_type, output.content)}`}>
              {output.content}
            </span>
          </div>
        </div>
      ))}
      <div ref={consoleEndRef} />
    </div>
  );
};