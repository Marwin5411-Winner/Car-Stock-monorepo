import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Daily database backup at BACKUP_SCHEDULE.
 *
 * Two things here are worth guarding:
 *
 * 1. The time arithmetic. "Next 17:00" is recomputed before every run instead of adding 24h,
 *    so the run time cannot drift and survives a DST change. An off-by-one-day here means a
 *    backup that silently never happens.
 *
 * 2. What retention is allowed to delete. Backups were never pruned before, which was fine at
 *    a few dumps a year but fills the customer's disk at one a day. Pruning must only ever
 *    touch the scheduler's own dumps — a 'pre-update' dump is the rollback safety net for an
 *    update and a 'manual' one was taken by a human on purpose.
 */

const VB_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-backup-'));
const BACKUPS = path.join(VB_HOME, 'data', 'backups');
fs.mkdirSync(BACKUPS, { recursive: true });
fs.mkdirSync(path.join(VB_HOME, 'updater'), { recursive: true });
fs.mkdirSync(path.join(VB_HOME, 'app'), { recursive: true });
fs.writeFileSync(path.join(VB_HOME, 'app', 'VERSION'), '1.0.62\n');
fs.writeFileSync(path.join(VB_HOME, 'updater', 'update.ps1'), '# stub\n');

process.env.UPDATER_MODE = 'portable';
process.env.VB_HOME = VB_HOME;
process.env.BACKUP_SCHEDULE = '17:00';
process.env.BACKUP_RETENTION_DAYS = '30';

const { systemService, parseDailyTime, msUntilNextDailyRun } = await import(
  '../modules/system/system.service'
);

const DAY_MS = 24 * 60 * 60 * 1000;

function makeBackup(name: string, ageDays: number) {
  const full = path.join(BACKUPS, name);
  fs.writeFileSync(full, 'dump');
  const when = new Date(Date.now() - ageDays * DAY_MS);
  fs.utimesSync(full, when, when);
  return full;
}

describe('daily backup schedule', () => {
  it('accepts HH:MM and rejects anything else', () => {
    expect(parseDailyTime('17:00')).toEqual({ hour: 17, minute: 0 });
    expect(parseDailyTime('09:30')).toEqual({ hour: 9, minute: 30 });
    expect(parseDailyTime('23:59')).toEqual({ hour: 23, minute: 59 });
    // A typo must disable the scheduler loudly, not schedule something surprising.
    expect(parseDailyTime('17.00')).toBeNull();
    expect(parseDailyTime('24:00')).toBeNull();
    expect(parseDailyTime('17:60')).toBeNull();
    expect(parseDailyTime('')).toBeNull();
    expect(parseDailyTime('5pm')).toBeNull();
  });

  it('waits until later today when the time has not passed', () => {
    const from = new Date(2026, 6, 25, 9, 0, 0, 0); // 09:00
    expect(msUntilNextDailyRun(17, 0, from)).toBe(8 * 60 * 60 * 1000);
  });

  it('rolls to tomorrow when the time has already passed', () => {
    const from = new Date(2026, 6, 25, 18, 30, 0, 0); // 18:30
    expect(msUntilNextDailyRun(17, 0, from)).toBe(22.5 * 60 * 60 * 1000);
  });

  it('rolls to tomorrow when it is exactly the scheduled time', () => {
    // Otherwise re-arming right after a run would schedule a 0ms timer and loop.
    const from = new Date(2026, 6, 25, 17, 0, 0, 0);
    expect(msUntilNextDailyRun(17, 0, from)).toBe(DAY_MS);
  });

  it('never returns a non-positive delay', () => {
    for (let hour = 0; hour < 24; hour++) {
      const from = new Date(2026, 6, 25, hour, 0, 0, 0);
      expect(msUntilNextDailyRun(17, 0, from)).toBeGreaterThan(0);
    }
  });
});

describe('backup retention', () => {
  it('deletes only old scheduled dumps, never manual or pre-update ones', () => {
    fs.rmSync(BACKUPS, { recursive: true, force: true });
    fs.mkdirSync(BACKUPS, { recursive: true });

    const oldScheduled = makeBackup('car_stock_2026-01-01_120000_scheduled.dump', 60);
    const freshScheduled = makeBackup('car_stock_2026-07-24_170000_scheduled.dump', 1);
    const oldManual = makeBackup('car_stock_2026-01-01_120000_manual.dump', 60);
    const oldPreUpdate = makeBackup('car_stock_2026-01-01_120000_pre-update.dump', 60);

    const removed = systemService.pruneScheduledBackups();

    expect(removed).toBe(1);
    expect(fs.existsSync(oldScheduled)).toBe(false);
    // Everything below would be a customer losing a backup they were relying on.
    expect(fs.existsSync(freshScheduled)).toBe(true);
    expect(fs.existsSync(oldManual)).toBe(true);
    expect(fs.existsSync(oldPreUpdate)).toBe(true);
  });

  it('keeps a scheduled dump that is exactly at the retention edge', () => {
    fs.rmSync(BACKUPS, { recursive: true, force: true });
    fs.mkdirSync(BACKUPS, { recursive: true });

    const justInside = makeBackup('car_stock_2026-07-01_170000_scheduled.dump', 29);
    const justOutside = makeBackup('car_stock_2026-06-24_170000_scheduled.dump', 31);

    expect(systemService.pruneScheduledBackups()).toBe(1);
    expect(fs.existsSync(justInside)).toBe(true);
    expect(fs.existsSync(justOutside)).toBe(false);
  });

  it('does nothing when there is no backup directory', () => {
    fs.rmSync(BACKUPS, { recursive: true, force: true });
    expect(systemService.pruneScheduledBackups()).toBe(0);
    fs.mkdirSync(BACKUPS, { recursive: true });
  });

  it('reports a failed run instead of throwing', async () => {
    // pg_dump cannot run here, which is the same shape as a customer without PostgreSQL
    // client tools installed. The nightly job must degrade, not crash the API.
    const result = await systemService.runScheduledBackup();
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
    expect(result.pruned).toBe(0);
  });
});

describe('scheduler lifecycle', () => {
  it('starts with a valid time and stops cleanly', () => {
    const handle = systemService.startBackupScheduler();
    expect(handle).not.toBeNull();
    expect(handle?.at).toBe('17:00');
    handle?.stop();
  });
});
