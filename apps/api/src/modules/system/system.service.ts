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

// Background update check. Until now nothing ever contacted the feed on its own: the only
// trigger was a human opening Settings and clicking "ตรวจสอบอัพเดท", so a site nobody logs
// into sat on an old version indefinitely. (config/.env.example advertised AUTO_UPDATE, but
// no code ever read it — it has been replaced by the interval below.)
//
// Deliberately check-only. Installing unattended would stop the app, swap app\ and migrate
// the database with nobody watching; on a dealership's server that is an outage, so the
// install stays a human decision.
const UPDATE_CHECK_INTERVAL_HOURS = Number.parseFloat(
  process.env.UPDATE_CHECK_INTERVAL_HOURS || '6'
);
// Give the app time to finish booting (and Postgres to come up after a reboot) before the
// first check — it spawns PowerShell and hits the network.
const FIRST_CHECK_DELAY_MS = 60_000;

interface CachedUpdateCheck {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  notes?: string;
  checkedAt: string;
  error?: string;
}

let cachedUpdateCheck: CachedUpdateCheck | null = null;

// Daily database backup. Until now a dump was only taken before an update or when someone
// clicked the button — there was no automatic backup at all, despite what the name of the
// Settings panel suggests to an operator.
const BACKUP_SCHEDULE = (process.env.BACKUP_SCHEDULE ?? '17:00').trim();
// Backups were never pruned. That was survivable at a few dumps a year; one a day would
// fill the customer's disk, and a full disk on the database server is worse than a missing
// backup. Only 'scheduled' dumps are eligible — see pruneScheduledBackups.
const BACKUP_RETENTION_DAYS = Number.parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);

/** Parse "HH:MM" (24h). Returns null for anything else, which disables the scheduler. */
export function parseDailyTime(value: string): { hour: number; minute: number } | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/**
 * Milliseconds until the next local HH:MM. Recomputed before every run rather than adding a
 * fixed 24h, so the time does not drift and survives a DST change.
 */
export function msUntilNextDailyRun(hour: number, minute: number, from: Date): number {
  const next = new Date(from);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - from.getTime();
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
  const pa = a
    .replace(/^v/, '')
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
  const pb = b
    .replace(/^v/, '')
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
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
  private runUpdateScript(
    action: string,
    extraArgs: string[] = []
  ): Promise<{
    code: number;
    stdout: string;
    stderr: string;
  }> {
    const script = this.getUpdaterScript();
    if (!fs.existsSync(script)) {
      return Promise.reject(new Error(`Updater script not found: ${script}`));
    }

    return new Promise((resolvePromise, reject) => {
      const args = [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        script,
        '-Action',
        action,
        ...extraArgs,
      ];
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

  /**
   * Record a 'running' status before the detached updater is launched.
   *
   * The updater only writes its own first status after PowerShell cold-starts, dot-sources
   * common.ps1, runs Initialize-VbPaths and takes the update lock — 1-3s on an AV-scanned
   * Windows server. The web UI starts polling at 2s and treats 'idle' as a terminal state,
   * so without this seed the first poll landed in that gap and stopped the poll loop:
   * idleStatus() on a fresh install, or the PREVIOUS run's terminal status on a retry. The
   * progress UI tore down and re-showed the same update dialog while the updater was in fact
   * still starting. Seeding here closes the gap for every caller (Update and Rollback).
   */
  private seedRunningStatus(action: string): void {
    const now = new Date().toISOString();
    const seed: UpdateStatus = {
      step: 0,
      totalSteps: 10,
      stepName: 'Starting',
      status: 'running',
      message: `${action} starting`,
      startedAt: now,
      updatedAt: now,
      logs: [],
      currentVersion: this.readLocalVersion(),
    };
    fs.mkdirSync(path.dirname(STATUS_FILE_PATH), { recursive: true });
    fs.writeFileSync(STATUS_FILE_PATH, JSON.stringify(seed, null, 2), 'utf-8');
  }

  /** Turn a launch failure into a status the UI can show, instead of a phantom 'running'. */
  private markStatusFailed(action: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const now = new Date().toISOString();
    try {
      fs.writeFileSync(
        STATUS_FILE_PATH,
        JSON.stringify(
          {
            step: 0,
            totalSteps: 10,
            stepName: 'Starting',
            status: 'error',
            message: `Failed to launch ${action.toLowerCase()}`,
            startedAt: now,
            updatedAt: now,
            logs: [],
            error: message,
          } satisfies UpdateStatus,
          null,
          2
        ),
        'utf-8'
      );
    } catch {
      // Status file is best-effort; the thrown error is still surfaced to the caller.
    }
  }

  private spawnUpdateDetached(action: string, extraArgs: string[] = []): void {
    const script = this.getUpdaterScript();
    if (!fs.existsSync(script)) {
      throw new Error(`Updater script not found: ${script}`);
    }
    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      '-Action',
      action,
      ...extraArgs,
    ];
    // Launch through `cmd /c start` so the PowerShell is orphaned. `detached: true` alone
    // still records this process as its parent, and the updater's StopApp step runs
    // `taskkill /PID <api> /T /F` (plus `net stop` under NSSM) — both walk the parent→child
    // tree and would kill the updater mid-update, leaving the app stopped forever.
    // The empty string is `start`'s window-title argument; without it `start` would treat
    // the quoted exe path as the title and launch nothing.
    this.seedRunningStatus(action);

    try {
      const child = spawn('cmd.exe', ['/c', 'start', '', '/min', 'powershell.exe', ...args], {
        cwd: this.getVbHome(),
        env: process.env,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      // stdio is 'ignore', so a launch failure is otherwise invisible — and an unhandled
      // 'error' event on a ChildProcess takes the API process down with it.
      child.on('error', (err) => this.markStatusFailed(action, err));
      child.unref();
    } catch (err) {
      this.markStatusFailed(action, err);
      throw err;
    }
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
      // Reaching here means the PowerShell check produced nothing AND there is no feed to
      // fall back to, so nothing was actually checked. This used to return hasUpdate:false,
      // which the UI renders as a confident "เป็นเวอร์ชันล่าสุดแล้ว" — an unconfigured or
      // offline site looked identical to an up-to-date one, and now that a background check
      // drives the sidebar indicator it would have shown that green state forever.
      throw new Error('UPDATE_FEED_URL is not set in config\\.env — cannot check for updates');
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
      releases?: Array<{
        version: string;
        notes?: string;
        assetUrl?: string;
        publishedAt?: string;
      }>;
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

  /** Last background check result. Cheap — never touches the network or spawns anything. */
  getCachedUpdateCheck(): CachedUpdateCheck | null {
    return cachedUpdateCheck;
  }

  /**
   * Run one background check and cache it. Failures are cached too, so the UI can say
   * "could not reach the update server" instead of silently showing nothing.
   */
  async runUpdateCheck(): Promise<CachedUpdateCheck> {
    const checkedAt = new Date().toISOString();
    try {
      const result = await this.checkForUpdate();
      cachedUpdateCheck = {
        hasUpdate: result.hasUpdate,
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion || result.currentVersion,
        notes: result.notes,
        checkedAt,
      };
    } catch (error) {
      cachedUpdateCheck = {
        hasUpdate: false,
        currentVersion: this.readLocalVersion(),
        latestVersion: this.readLocalVersion(),
        checkedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    return cachedUpdateCheck;
  }

  /**
   * Start the periodic check. Returns the timer so callers can stop it; set
   * UPDATE_CHECK_INTERVAL_HOURS=0 to disable (sites with no outbound internet).
   */
  startUpdateWatcher(): ReturnType<typeof setInterval> | null {
    if (!Number.isFinite(UPDATE_CHECK_INTERVAL_HOURS) || UPDATE_CHECK_INTERVAL_HOURS <= 0) {
      return null;
    }
    const periodMs = UPDATE_CHECK_INTERVAL_HOURS * 60 * 60 * 1000;

    // unref so a pending timer never holds the process open during shutdown.
    setTimeout(() => {
      void this.runUpdateCheck();
    }, FIRST_CHECK_DELAY_MS).unref?.();

    const timer = setInterval(() => {
      void this.runUpdateCheck();
    }, periodMs);
    timer.unref?.();
    return timer;
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
  async triggerRollback(
    commit?: string,
    backupFile?: string
  ): Promise<{ message: string; status: string }> {
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
   * Delete scheduled dumps older than BACKUP_RETENTION_DAYS.
   *
   * Deliberately narrow: only files this scheduler produced. A 'pre-update' dump is the
   * rollback safety net for an update, and a 'manual' one was taken by a human on purpose —
   * silently deleting either would be a nasty surprise on the day someone needs it.
   */
  pruneScheduledBackups(): number {
    if (!IS_PORTABLE) return 0;
    if (!Number.isFinite(BACKUP_RETENTION_DAYS) || BACKUP_RETENTION_DAYS <= 0) return 0;

    const dir = path.join(this.getVbHome(), 'data', 'backups');
    if (!fs.existsSync(dir)) return 0;

    const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const name of fs.readdirSync(dir)) {
      if (!name.includes('_scheduled.')) continue;
      const full = path.join(dir, name);
      try {
        if (fs.statSync(full).mtimeMs < cutoff) {
          fs.unlinkSync(full);
          removed++;
        }
      } catch {
        // A locked or already-removed file must not abort the rest of the sweep.
      }
    }
    return removed;
  }

  /**
   * One scheduled backup run. Never throws — a failing nightly job must not take down the
   * timer or the process; the outcome is returned so the caller can log it.
   */
  async runScheduledBackup(): Promise<{ ok: boolean; message: string; pruned: number }> {
    try {
      const result = await this.triggerBackup('scheduled');
      const pruned = this.pruneScheduledBackups();
      return {
        ok: true,
        message: `Scheduled backup complete${result.dumpSize ? ` (${result.dumpSize})` : ''}`,
        pruned,
      };
    } catch (error) {
      // Common and expected: pg_dump missing, Postgres down, or an update holding the lock.
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        pruned: 0,
      };
    }
  }

  /**
   * Run a backup every day at BACKUP_SCHEDULE (local time, "HH:MM"; blank or malformed
   * disables it). Returns null when disabled so the caller can tell configured-off from
   * mis-typed, plus a stop() for shutdown and tests.
   *
   * If the machine is off at that time the run is simply missed — catching up on boot is not
   * attempted. 17:00 is chosen by the operator to land while the server is still on.
   */
  startBackupScheduler(
    onRun?: (result: { ok: boolean; message: string; pruned: number }) => void
  ): { stop: () => void; at: string } | null {
    const at = parseDailyTime(BACKUP_SCHEDULE);
    if (!at) return null;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(
        async () => {
          const result = await this.runScheduledBackup();
          onRun?.(result);
          // Re-arm from the new "now" rather than adding 24h, so the clock never drifts.
          schedule();
        },
        msUntilNextDailyRun(at.hour, at.minute, new Date())
      );
      timer.unref?.();
    };

    schedule();
    return {
      at: BACKUP_SCHEDULE,
      stop: () => {
        stopped = true;
        if (timer) clearTimeout(timer);
      },
    };
  }

  /**
   * Take a database backup. `suffix` becomes part of the filename and decides whether
   * retention may ever delete it — only 'scheduled' dumps are pruned.
   */
  async triggerBackup(suffix: 'manual' | 'scheduled' = 'manual'): Promise<{
    message: string;
    dump: string;
    dumpSize: string;
    sql: string;
    sqlSize: string;
  }> {
    if (IS_PORTABLE) {
      const { code, stdout, stderr } = await this.runUpdateScript('Backup', [
        '-BackupSuffix',
        suffix,
      ]);
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

    return response.json() as Promise<{
      message: string;
      dump: string;
      dumpSize: string;
      sql: string;
      sqlSize: string;
    }>;
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
  async listLogs(): Promise<{
    logs: Array<{ filename: string; size: string; lines: number; lastEntry: string }>;
  }> {
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
