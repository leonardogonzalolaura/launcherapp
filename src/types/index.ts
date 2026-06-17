export interface Project {
  id: string;
  name: string;
  path: string;
  project_type: 'Python' | 'Scala' | 'CSharp' | 'React' | 'JavaScript' | 'Unknown';
  language_version?: string;
  configurations: ProjectConfig[];
  env_files: string[];
  last_used?: string;
}

export interface ProjectConfig {
  name: string;
  command: string;
  working_dir: string;
  env_vars: Record<string, string>;
  requires_build: boolean;
  build_command?: string;
  custom_paths: CustomPaths;
  is_custom?: boolean; // frontend-only marker (not persisted in Rust, just for display)
  group?: string;
}

export interface CustomPaths {
  python_main?: string;
  java_home?: string;
  sbt_path?: string;
  dotnet_project?: string;
  node_script?: string;
}

export interface DetectedInfo {
  project_type: Project['project_type'];
  version?: string;
  available_commands: string[];
  config_files: string[];
  has_env_file: boolean;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exit_code: number | null;
}

// ─── Process / Streaming ────────────────────────────────────────────────────

export interface ProcessInfo {
  id: string;
  project_id: string;
  project_name: string;
  config_name: string;
  command: string;
  status: 'running' | 'stopped' | 'error';
  started_at: string;
}

export interface StreamMessage {
  process_id: string;
  project_name: string;
  config_name: string;
  output_type: 'stdout' | 'stderr' | 'info' | 'error' | 'exit';
  content: string;
  timestamp: string;
}

export interface LogLine {
  id: string;
  output_type: StreamMessage['output_type'];
  content: string;
  timestamp: string;
}

export interface ProcessTab {
  process_id: string;
  project_id: string;
  project_name: string;
  config_name: string;
  config_index: number;
  config_group?: string;
  status: 'running' | 'stopped' | 'error';
  logs: LogLine[];
  started_at: string;
  git_branch?: string | null;
  project_type?: string; 
}