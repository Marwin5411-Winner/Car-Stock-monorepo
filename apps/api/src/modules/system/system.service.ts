import * as fs from 'fs';
import * as path from 'path';

const UPDATER_URL = process.env.UPDATER_URL || 'http://updater:9000';
const UPDATE_SECRET = process.env.UPDATE_SECRET || '';

// In production, an empty UPDATE_SECRET means the updater runs unauthenticated
// — reject at boot instead of silently exposing triggerUpdate/Rollback/Backup.
if (process.env.NODE_ENV === 'production' && !UPDATE_SECRET) {
  throw new Error(
    'UPDATE_SECRET environment variable must be set in production. ' +
      'Destructive updater operations cannot run unauthenticated.'
  );
}
const STATUS_FILE_PATH = '/app/updater-status/update-status.json';

interface UpdateCheckResult {
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
  changelog: Array<{
    hash: string;
    message: string;
    author: string;
    date: string;
  }>;
}

interface UpdateStatus {
  step: number;
  totalSteps: number;
  stepName: string;
  status: string;
  message: string;
  startedAt: string;
  updatedAt: string;
  logs: string[];
}

interface VersionInfo {
  version: string;
  commit: string;
  fullCommit: string;
  tag: string;
  date: string;
}

interface BackupInfo {
  filename: string;
  path: string;
  size: string;
  timestamp: number;
}

export class SystemService {
  private static instance: SystemService;

  private constructor() {}

  public static getInstance(): SystemService {
    if (!SystemService.instance) {
      SystemService.instance = new SystemService();
    }
    return SystemService.instance;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (UPDATE_SECRET) {
      headers['Authorization'] = `Bearer ${UPDATE_SECRET}`;
    }
    return headers;
  }

  /**
   * Check for available updates by calling the updater sidecar
   */
  async checkForUpdate(): Promise<UpdateCheckResult> {
    const response = await fetch(`${UPDATER_URL}/check`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to check for updates: ${error}`);
    }

    return response.json() as Promise<UpdateCheckResult>;
  }

  /**
   * Trigger the update pipeline
   */
  async triggerUpdate(): Promise<{ message: string; status: string }> {
    const response = await fetch(`${UPDATER_URL}/update`, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(
        (error as { error?: string; message?: string }).message ||
        (error as { error?: string }).error ||
        'Failed to trigger update'
      );
    }

    return response.json() as Promise<{ message: string; status: string }>;
  }

  /**
   * Get current update status
   * First tries the shared volume file (faster), falls back to HTTP
   */
  async getUpdateStatus(): Promise<UpdateStatus> {
    // Try reading from shared volume first (lower latency)
    try {
      if (fs.existsSync(STATUS_FILE_PATH)) {
        const content = fs.readFileSync(STATUS_FILE_PATH, 'utf-8');
        return JSON.parse(content) as UpdateStatus;
      }
    } catch {
      // Fall through to HTTP
    }

    // Fallback: call updater HTTP endpoint
    const response = await fetch(`${UPDATER_URL}/status`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get update status');
    }

    return response.json() as Promise<UpdateStatus>;
  }

  /**
   * Trigger manual rollback
   */
  async triggerRollback(commit?: string, backupFile?: string): Promise<{ message: string; status: string }> {
    const body: Record<string, string> = {};
    if (commit) body.commit = commit;
    if (backupFile) body.backupFile = backupFile;

    const response = await fetch(`${UPDATER_URL}/rollback`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(
        (error as { error?: string; message?: string }).message ||
        (error as { error?: string }).error ||
        'Failed to trigger rollback'
      );
    }

    return response.json() as Promise<{ message: string; status: string }>;
  }

  /**
   * Trigger manual backup
   */
  async triggerBackup(): Promise<{ message: string; dump: string; dumpSize: string; sql: string; sqlSize: string }> {
    const response = await fetch(`${UPDATER_URL}/backup`, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(
        (error as { error?: string }).error || 'Failed to trigger backup'
      );
    }

    return response.json() as Promise<{ message: string; dump: string; dumpSize: string; sql: string; sqlSize: string }>;
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<{ backups: BackupInfo[] }> {
    const response = await fetch(`${UPDATER_URL}/backups`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to list backups');
    }

    return response.json() as Promise<{ backups: BackupInfo[] }>;
  }

  /**
   * List recent update/rollback log files
   */
  async listLogs(): Promise<{ logs: Array<{ filename: string; size: string; lines: number; lastEntry: string }> }> {
    const response = await fetch(`${UPDATER_URL}/logs`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to list logs');
    }

    return response.json() as Promise<{ logs: Array<{ filename: string; size: string; lines: number; lastEntry: string }> }>;
  }

  /**
   * Get contents of a specific log file (last 100 lines)
   */
  async getLogFile(filename: string): Promise<{ filename: string; lines: string[] }> {
    // Strict allowlist: alphanumerics, hyphens, underscores, and dots only.
    // Blocks path traversal sequences (../), URL-encoded variants (%2F, %2e),
    // backslashes, and any other separator characters.
    if (!/^[\w\-.]+$/.test(filename)) {
      throw new Error('Invalid log filename');
    }

    const response = await fetch(`${UPDATER_URL}/logs/${encodeURIComponent(filename)}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(
        (error as { error?: string }).error || 'Failed to get log file'
      );
    }

    return response.json() as Promise<{ filename: string; lines: string[] }>;
  }

  /**
   * Get current version info
   */
  async getVersion(): Promise<VersionInfo> {
    const response = await fetch(`${UPDATER_URL}/version`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get version info');
    }

    return response.json() as Promise<VersionInfo>;
  }
}

export const systemService = SystemService.getInstance();
