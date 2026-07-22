import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const UPDATER_MODE = (process.env.UPDATER_MODE || 'docker').toLowerCase();
const IS_PORTABLE = UPDATER_MODE === 'portable';

const UPDATER_URL = process.env.UPDATER_URL || 'http://updater:9000';
const UPDATE_SECRET = process.env.UPDATE_SECRET || '';

// Docker production: empty UPDATE_SECRET would expose destructive updater HTTP ops.
// Portable mode authenticates via admin JWT only; scripts run locally — secret optional at boot.
if (process.env.NODE_ENV === 'production' && !UPDATE_SECRET && !IS_PORTABLE) {
  throw new Error(
    'UPDATE_SECRET environment variable must be set in production. ' +
      'Destructive updater operations cannot run unauthenticated.'
  );
}

function resolveVbHome(): string {
  if (process.env.VB_HOME) {
    return path.resolve(process.env.VB_HOME);
  }
  // Portable layout: app runs with cwd = VB_HOME\app → parent is VB_HOME
  const cwd = process.cwd();
  const parent = path.dirname(cwd);
  if (fs.existsSync(path.join(parent, 'config')) || fs.existsSync(path.join(parent, 'updater'))) {
    return parent;
  }
  return cwd;
}

function resolveStatusFilePath(): string {
  if (process.env.UPDATE_STATUS_PATH) {
    return process.env.UPDATE_STATUS_PATH;
  }
  if (IS_PORTABLE) {
    return path.join(resolveVbHome(), 'data', 'status', 'update-status.json');
  }
  return '/app/updater-status/update-status.json';
}

const STATUS_FILE_PATH = resolveStatusFilePath();

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
  latestVersion?: string;
  branch: string;
  commitCount: number;
  notes?: string;
  assetUrl?: string;
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
  currentVersion?: string;
  targetVersion?: string;
  backupFile?: string | null;
  previousAppDir?: string | null;
  error?: string | null;
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

function idleStatus(): UpdateStatus {
  return {
    step: 0,
    totalSteps: 10,
    stepName: 'Idle',
    status: 'idle',
    message: 'No update in progress',
    startedAt: '',
    updatedAt: new Date().toISOString(),
    logs: [],
  };
}

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
      headers.Authorization = `Bearer ${UPDATE_SECRET}`;
    }
    return headers;
  }

  private getVbHome(): string {
    return resolveVbHome();
  }

  private getUpdaterScript(): string {
    return path.join(this.getVbHome(), 'updater', 'update.ps1');
  }

  private readLocalVersion(): string {
    const candidates = [
      path.join(process.cwd(), 'VERSION'),
      path.join(this.getVbHome(), 'app', 'VERSION'),
      path.join(this.getVbHome(), 'VERSION'),
    ];
    for (const file of candidates) {
      if (fs.existsSync(file)) {
        return fs.readFileSync(file, 'utf-8').trim();
      }
    }
    return '0.0.0';
  }

  private readManifest(): { gitSha?: string; builtAt?: string; version?: string } {
    const candidates = [
      path.join(process.cwd(), 'package-manifest.json'),
      path.join(this.getVbHome(), 'app', 'package-manifest.json'),
    ];
    for (const file of candidates) {
      if (fs.existsSync(file)) {
        try {
          return JSON.parse(fs.readFileSync(file, 'utf-8')) as {
            gitSha?: string;
            builtAt?: string;
            version?: string;
          };
        } catch {
          return {};
        }
      }
    }
    return {};
  }

  /** Run update.ps1 -Action X and capture stdout (Windows portable). */
  private runUpdateScript(action: string, extraArgs: string[] = []): Promise<{
    code: number;
    stdout: string;
    stderr: string;
  }> {
    const script = this.getUpdaterScript();
    if (!fs.existsSync(script)) {
      return Promise.reject(new Error(`Updater script not found: ${script}`));
    }

    return new Promise((resolvePromise, reject) => {
      const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Action', action, ...extraArgs];
      const child = spawn('powershell.exe', args, {
        cwd: this.getVbHome(),
        env: process.env,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr?.on('data', (d: Buffer) => {
        stderr += d.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        resolvePromise({ code: code ?? 1, stdout, stderr });
      });
    });
  }

  private spawnUpdateDetached(action: string, extraArgs: string[] = []): void {
    const script = this.getUpdaterScript();
    if (!fs.existsSync(script)) {
      throw new Error(`Updater script not found: ${script}`);
    }
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Action', action, ...extraArgs];
    // Launch through `cmd /c start` so the PowerShell is orphaned. `detached: true` alone
    // still records this process as its parent, and the updater's StopApp step runs
    // `taskkill /PID <api> /T /F` (plus `net stop` under NSSM) — both walk the parent→child
    // tree and would kill the updater mid-update, leaving the app stopped forever.
    // The empty string is `start`'s window-title argument; without it `start` would treat
    // the quoted exe path as the title and launch nothing.
    const child = spawn('cmd.exe', ['/c', 'start', '', '/min', 'powershell.exe', ...args], {
      cwd: this.getVbHome(),
      env: process.env,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  }

  private async checkForUpdatePortable(): Promise<UpdateCheckResult> {
    const currentVersion = this.readLocalVersion();
    const feedUrl = process.env.UPDATE_FEED_URL;

    // Prefer PowerShell Check when script exists (writes last-check.json)
    if (fs.existsSync(this.getUpdaterScript())) {
      try {
        const { code, stdout, stderr } = await this.runUpdateScript('Check');
        if (code === 0 && stdout.trim()) {
          const parsed = JSON.parse(stdout.trim()) as {
            hasUpdate?: boolean;
            currentVersion?: string;
            latestVersion?: string;
            notes?: string;
            assetUrl?: string;
            checkedAt?: string;
          };
          const latest = parsed.latestVersion || currentVersion;
          return {
            hasUpdate: Boolean(parsed.hasUpdate),
            currentCommit: '',
            currentFullCommit: '',
            currentDate: parsed.checkedAt || '',
            currentTag: currentVersion ? `v${currentVersion}` : '',
            currentVersion: parsed.currentVersion || currentVersion,
            latestCommit: '',
            latestFullCommit: '',
            latestDate: parsed.checkedAt || '',
            latestTag: latest ? `v${latest}` : '',
            latestVersion: latest,
            branch: process.env.UPDATE_CHANNEL || 'stable',
            commitCount: parsed.hasUpdate ? 1 : 0,
            notes: parsed.notes,
            assetUrl: parsed.assetUrl,
            changelog: parsed.notes
              ? [{ hash: '', message: parsed.notes, author: '', date: parsed.checkedAt || '' }]
              : [],
          };
        }
        if (stderr) {
          // fall through to feed fetch
        }
      } catch {
        // fall through
      }
    }

    if (!feedUrl) {
      return {
        hasUpdate: false,
        currentCommit: '',
        currentFullCommit: '',
        currentDate: '',
        currentTag: currentVersion ? `v${currentVersion}` : '',
        currentVersion,
        latestCommit: '',
        latestFullCommit: '',
        latestDate: '',
        latestTag: '',
        latestVersion: currentVersion,
        branch: process.env.UPDATE_CHANNEL || 'stable',
        commitCount: 0,
        changelog: [],
      };
    }

    const headers: Record<string, string> = { Accept: 'application/json' };
    const tokenPath = path.join(this.getVbHome(), 'secrets', 'github_token.txt');
    if (fs.existsSync(tokenPath)) {
      headers.Authorization = `Bearer ${fs.readFileSync(tokenPath, 'utf-8').trim()}`;
    } else if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const response = await fetch(feedUrl, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch update feed: ${response.status}`);
    }

    const feed = (await response.json()) as {
      latest?: string;
      releases?: Array<{ version: string; notes?: string; assetUrl?: string; publishedAt?: string }>;
    };
    const latestVersion = feed.latest || feed.releases?.[0]?.version || currentVersion;
    const release = feed.releases?.find((r) => r.version === latestVersion) || feed.releases?.[0];
    const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;

    return {
      hasUpdate,
      currentCommit: '',
      currentFullCommit: '',
      currentDate: '',
      currentTag: currentVersion ? `v${currentVersion}` : '',
      currentVersion,
      latestCommit: '',
      latestFullCommit: '',
      latestDate: release?.publishedAt || '',
      latestTag: latestVersion ? `v${latestVersion}` : '',
      latestVersion,
      branch: process.env.UPDATE_CHANNEL || 'stable',
      commitCount: hasUpdate ? 1 : 0,
      notes: release?.notes,
      assetUrl: release?.assetUrl,
      changelog: release?.notes
        ? [{ hash: '', message: release.notes, author: '', date: release.publishedAt || '' }]
        : [],
    };
  }

  private getUpdateStatusPortable(): UpdateStatus {
    try {
      if (fs.existsSync(STATUS_FILE_PATH)) {
        const content = fs.readFileSync(STATUS_FILE_PATH, 'utf-8');
        return JSON.parse(content) as UpdateStatus;
      }
    } catch {
      // ignore
    }
    return idleStatus();
  }

  private getVersionPortable(): VersionInfo {
    const version = this.readLocalVersion();
    const manifest = this.readManifest();
    const sha = manifest.gitSha || '';
    return {
      version,
      commit: sha ? sha.slice(0, 7) : '',
      fullCommit: sha,
      tag: version ? `v${version}` : '',
      date: manifest.builtAt || '',
    };
  }

  private listBackupsPortable(): { backups: BackupInfo[] } {
    const dir = path.join(this.getVbHome(), 'data', 'backups');
    if (!fs.existsSync(dir)) {
      return { backups: [] };
    }
    const backups = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.dump') || f.endsWith('.sql') || f.endsWith('.backup'))
      .map((filename) => {
        const full = path.join(dir, filename);
        const st = fs.statSync(full);
        return {
          filename,
          path: full,
          size: formatBytes(st.size),
          timestamp: Math.floor(st.mtimeMs / 1000),
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);
    return { backups };
  }

  private listLogsPortable(): {
    logs: Array<{ filename: string; size: string; lines: number; lastEntry: string }>;
  } {
    const dir = path.join(this.getVbHome(), 'data', 'logs', 'updater');
    if (!fs.existsSync(dir)) {
      return { logs: [] };
    }
    const logs = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.log'))
      .map((filename) => {
        const full = path.join(dir, filename);
        const st = fs.statSync(full);
        const content = fs.readFileSync(full, 'utf-8');
        const lines = content.split(/\r?\n/).filter(Boolean);
        return {
          filename,
          size: formatBytes(st.size),
          lines: lines.length,
          lastEntry: lines[lines.length - 1] || '',
        };
      })
      .sort((a, b) => b.filename.localeCompare(a.filename));
    return { logs };
  }

  private getLogFilePortable(filename: string): { filename: string; lines: string[] } {
    if (!/^[\w\-.]+$/.test(filename)) {
      throw new Error('Invalid log filename');
    }
    const full = path.join(this.getVbHome(), 'data', 'logs', 'updater', filename);
    if (!fs.existsSync(full)) {
      throw new Error('Log file not found');
    }
    const content = fs.readFileSync(full, 'utf-8');
    const lines = content.split(/\r?\n/).filter(Boolean).slice(-100);
    return { filename, lines };
  }

  /**
   * Check for available updates
   */
  async checkForUpdate(): Promise<UpdateCheckResult> {
    if (IS_PORTABLE) {
      return this.checkForUpdatePortable();
    }

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
    if (IS_PORTABLE) {
      this.spawnUpdateDetached('Update');
      return { message: 'Update started', status: 'running' };
    }

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
   */
  async getUpdateStatus(): Promise<UpdateStatus> {
    if (IS_PORTABLE) {
      return this.getUpdateStatusPortable();
    }

    try {
      if (fs.existsSync(STATUS_FILE_PATH)) {
        const content = fs.readFileSync(STATUS_FILE_PATH, 'utf-8');
        return JSON.parse(content) as UpdateStatus;
      }
    } catch {
      // Fall through to HTTP
    }

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
    if (IS_PORTABLE) {
      const extra: string[] = [];
      // Portable uses -Version for prior app folder; accept commit field as version string from UI
      if (commit) {
        extra.push('-Version', commit);
      }
      if (backupFile) {
        extra.push('-RestoreBackup', backupFile);
      }
      this.spawnUpdateDetached('Rollback', extra);
      return { message: 'Rollback started', status: 'running' };
    }

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
    if (IS_PORTABLE) {
      const { code, stdout, stderr } = await this.runUpdateScript('Backup');
      if (code !== 0) {
        throw new Error(stderr || stdout || 'Backup failed');
      }
      let parsed: { dump?: string; dumpSize?: string; sql?: string; sqlSize?: string } = {};
      try {
        parsed = JSON.parse(stdout.trim()) as typeof parsed;
      } catch {
        // optional JSON
      }
      return {
        message: 'Backup completed',
        dump: parsed.dump || '',
        dumpSize: parsed.dumpSize || '',
        sql: parsed.sql || '',
        sqlSize: parsed.sqlSize || '',
      };
    }

    const response = await fetch(`${UPDATER_URL}/backup`, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error((error as { error?: string }).error || 'Failed to trigger backup');
    }

    return response.json() as Promise<{ message: string; dump: string; dumpSize: string; sql: string; sqlSize: string }>;
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<{ backups: BackupInfo[] }> {
    if (IS_PORTABLE) {
      return this.listBackupsPortable();
    }

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
    if (IS_PORTABLE) {
      return this.listLogsPortable();
    }

    const response = await fetch(`${UPDATER_URL}/logs`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to list logs');
    }

    return response.json() as Promise<{
      logs: Array<{ filename: string; size: string; lines: number; lastEntry: string }>;
    }>;
  }

  /**
   * Get contents of a specific log file (last 100 lines)
   */
  async getLogFile(filename: string): Promise<{ filename: string; lines: string[] }> {
    if (!/^[\w\-.]+$/.test(filename)) {
      throw new Error('Invalid log filename');
    }

    if (IS_PORTABLE) {
      return this.getLogFilePortable(filename);
    }

    const response = await fetch(`${UPDATER_URL}/logs/${encodeURIComponent(filename)}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error((error as { error?: string }).error || 'Failed to get log file');
    }

    return response.json() as Promise<{ filename: string; lines: string[] }>;
  }

  /**
   * Get current version info
   */
  async getVersion(): Promise<VersionInfo> {
    if (IS_PORTABLE) {
      return this.getVersionPortable();
    }

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
