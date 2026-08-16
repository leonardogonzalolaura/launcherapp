import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import {
  Project,
  DetectedInfo,
  ProjectConfig,
  ProcessInfo,
  StreamMessage,
} from '../types';

export const useTauriCommands = () => {
  // ─── Projects ──────────────────────────────────────────────────────────────
  const addProject = async (path: string): Promise<Project> => {
    return await invoke('add_project', { path });
  };

  const getProjects = async (): Promise<Project[]> => {
    return await invoke('get_projects');
  };

  const removeProject = async (id: string): Promise<void> => {
    return await invoke('remove_project', { id });
  };

  const clearAllProjects = async (): Promise<void> => {
    return await invoke('clear_all_projects');
  };

  const updateProjectConfig = async (
    projectId: string,
    configIndex: number,
    updatedConfig: ProjectConfig
  ): Promise<Project> => {
    return await invoke('update_project_config', { projectId, configIndex, updatedConfig });
  };

  const addCustomCommand = async (
    projectId: string,
    newConfig: ProjectConfig
  ): Promise<Project> => {
    return await invoke('add_custom_command', { projectId, newConfig });
  };

  const deleteProjectConfig = async (
    projectId: string,
    configIndex: number
  ): Promise<Project> => {
    return await invoke('delete_project_config', { projectId, configIndex });
  };

  // ─── Detection ─────────────────────────────────────────────────────────────
  const detectProject = async (path: string): Promise<DetectedInfo> => {
    return await invoke('detect_project_from_path', { path });
  };

  // ─── Process Execution ─────────────────────────────────────────────────────
  const spawnProjectCommand = async (
    projectId: string,
    configIndex: number
  ): Promise<ProcessInfo> => {
    return await invoke('spawn_project_command', { projectId, configIndex });
  };

  const stopProcess = async (processId: string): Promise<void> => {
    return await invoke('stop_process', { processId });
  };

  const spawnPsShell = async (projectId: string): Promise<ProcessInfo> => {
    return await invoke('spawn_ps_shell', { projectId });
  };

  const writeStdin = async (processId: string, input: string): Promise<void> => {
    return await invoke('write_process_stdin', { processId, input });
  };

  const getActiveProcesses = async (): Promise<ProcessInfo[]> => {
    return await invoke('get_active_processes');
  };

  const getGitBranch = async (path: string): Promise<string | null> => {
    return await invoke('get_git_branch', { path });
  };

  const listGitBranches = async (path: string): Promise<string[]> => {
    return await invoke('list_git_branches', { path });
  };

  const checkoutGitBranch = async (projectId: string, branch: string): Promise<void> => {
    return await invoke('checkout_git_branch', { projectId, branch });
  };

  const watchGitBranch = async (projectId: string, projectPath: string): Promise<boolean> => {
    return await invoke('watch_git_branch', { projectId, projectPath });
  };

  const unwatchGitBranch = async (projectId: string): Promise<void> => {
    return await invoke('unwatch_git_branch', { projectId });
  };

  // ─── Event Listeners ───────────────────────────────────────────────────────
  const onProcessOutput = async (
    callback: (msg: StreamMessage) => void
  ): Promise<UnlistenFn> => {
    return await listen<StreamMessage>('process-output', (event) => {
      callback(event.payload);
    });
  };

  const onProcessExit = async (
    callback: (data: { process_id: string; exit_code: number | null }) => void
  ): Promise<UnlistenFn> => {
    return await listen<{ process_id: string; exit_code: number | null }>('process-exit', (event) => {
      callback(event.payload);
    });
  };

  return {
    addProject,
    getProjects,
    removeProject,
    clearAllProjects,
    updateProjectConfig,
    addCustomCommand,
    deleteProjectConfig,
    detectProject,
    spawnProjectCommand,
    stopProcess,
    spawnPsShell,
    writeStdin,
    getActiveProcesses,
    getGitBranch,
    listGitBranches,
    checkoutGitBranch,
    watchGitBranch,
    unwatchGitBranch,
    onProcessOutput,
    onProcessExit,
  };
};