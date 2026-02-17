import { api } from '../lib/api';

export interface VersionInfo {
  version: string;
  commit: string;
  fullCommit: string;
  tag: string;
  date: string;
}

export interface ChangelogEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentCommit: string;
  currentFullCommit: string;
  currentDate: string;
  currentTag: string;
  currentVersion: string;
  latestCommit: string;
  latestFullCommit: string;
  latestDate: string;
  latestTag: string;
  branch: string;
  commitCount: number;
  changelog: ChangelogEntry[];
}

export interface UpdateStatus {
  step: number;
  totalSteps: number;
  stepName: string;
  status: 'idle' | 'running' | 'success' | 'error' | 'rolling_back' | 'rollback_complete' | 'warning';
  message: string;
  startedAt: string;
  updatedAt: string;
  logs: string[];
}

export interface BackupInfo {
  filename: string;
  path: string;
  size: string;
  timestamp: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

class SystemService {
  async getVersion(): Promise<ApiResponse<VersionInfo>> {
    return api.get<ApiResponse<VersionInfo>>('/api/system/version');
  }

  async checkForUpdate(): Promise<ApiResponse<UpdateCheckResult>> {
    return api.get<ApiResponse<UpdateCheckResult>>('/api/system/check-update');
  }

  async triggerUpdate(): Promise<ApiResponse<{ message: string; status: string }>> {
    return api.post<ApiResponse<{ message: string; status: string }>>('/api/system/update');
  }

  async getUpdateStatus(): Promise<ApiResponse<UpdateStatus>> {
    return api.get<ApiResponse<UpdateStatus>>('/api/system/update-status');
  }

  async triggerRollback(commit?: string, backupFile?: string): Promise<ApiResponse<{ message: string; status: string }>> {
    return api.post<ApiResponse<{ message: string; status: string }>>('/api/system/rollback', {
      commit,
      backupFile,
    });
  }

  async listBackups(): Promise<ApiResponse<{ backups: BackupInfo[] }>> {
    return api.get<ApiResponse<{ backups: BackupInfo[] }>>('/api/system/backups');
  }
}

export const systemService = new SystemService();
