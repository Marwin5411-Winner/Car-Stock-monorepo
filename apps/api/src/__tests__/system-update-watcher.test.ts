import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * The background update check. Nothing used to contact the feed on its own — the only
 * trigger was a human opening Settings and clicking, so an unattended site sat on an old
 * version forever.
 *
 * The failure mode worth guarding is a check that cannot reach the update server being
 * cached as a plain "no update available". The sidebar indicator and the Settings panel both
 * read this cache, so a swallowed error would render as "เป็นเวอร์ชันล่าสุดแล้ว" on a machine
 * that has in fact not checked anything — the same shape of silent-wrong as the bugs this
 * module has already had.
 */

const VB_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-watcher-'));
fs.mkdirSync(path.join(VB_HOME, 'updater'), { recursive: true });
fs.mkdirSync(path.join(VB_HOME, 'app'), { recursive: true });
fs.writeFileSync(path.join(VB_HOME, 'app', 'VERSION'), '1.0.62\n');
// Present so the service takes the PowerShell path; the spawn itself fails off Windows,
// which is precisely the "update server unreachable" case being asserted.
fs.writeFileSync(path.join(VB_HOME, 'updater', 'update.ps1'), '# stub\n');

process.env.UPDATER_MODE = 'portable';
process.env.VB_HOME = VB_HOME;
process.env.UPDATE_STATUS_PATH = path.join(VB_HOME, 'data', 'status', 'update-status.json');
process.env.UPDATE_CHECK_INTERVAL_HOURS = '6';
delete process.env.UPDATE_FEED_URL;

const { systemService } = await import('../modules/system/system.service');

describe('background update check', () => {
  it('has no cached result before the first check runs', () => {
    expect(systemService.getCachedUpdateCheck()).toBeNull();
  });

  it('records a failed check as an error rather than "up to date"', async () => {
    const result = await systemService.runUpdateCheck();

    // The dangerous outcome: reporting no update when nothing was actually checked.
    expect(result.error).toBeTruthy();
    expect(result.hasUpdate).toBe(false);
    expect(result.checkedAt).toBeTruthy();
    // Still reports the real local version so the UI can show something meaningful.
    expect(result.currentVersion).toBe('1.0.62');
  });

  it('exposes the last result through the cache the UI reads', async () => {
    const ran = await systemService.runUpdateCheck();
    const cached = systemService.getCachedUpdateCheck();

    expect(cached).not.toBeNull();
    expect(cached?.checkedAt).toBe(ran.checkedAt);
  });

  it('starts a timer when an interval is configured, and stops cleanly', () => {
    const timer = systemService.startUpdateWatcher();
    expect(timer).not.toBeNull();
    if (timer) clearInterval(timer);
  });
});
