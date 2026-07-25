import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Regression: clicking "Update" in the portable Windows UI spun for a second and then
 * re-showed the same update dialog, with no error and no update.
 *
 * triggerUpdate() spawns the updater detached and returns immediately, but update-status.json
 * is only written once PowerShell has cold-started, dot-sourced common.ps1 and taken the
 * update lock — 1-3s on an AV-scanned Windows server. The web UI polls at 2s, and until that
 * first write getUpdateStatus() fell through to idleStatus(). SystemUpdateSection treats
 * 'idle' as a terminal state, so it stopped polling and tore the progress UI down.
 *
 * Second and later attempts were worse: the file existed but still held the PREVIOUS run's
 * terminal status, so polling stopped on the very first tick every time.
 *
 * The invariant both cases violate: once triggerUpdate() has returned, a poll must never
 * report a terminal status until the updater itself reports one.
 */

// The service captures UPDATER_MODE / UPDATE_STATUS_PATH at import time, so the environment
// has to be in place before the dynamic import below.
const VB_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-update-'));
const STATUS_FILE = path.join(VB_HOME, 'data', 'status', 'update-status.json');
fs.mkdirSync(path.join(VB_HOME, 'updater'), { recursive: true });
fs.mkdirSync(path.join(VB_HOME, 'data', 'status'), { recursive: true });
fs.mkdirSync(path.join(VB_HOME, 'app'), { recursive: true });
fs.writeFileSync(path.join(VB_HOME, 'app', 'VERSION'), '1.0.60\n');
// spawnUpdateDetached only requires the script to exist. The spawn itself is a no-op off
// Windows, which reproduces exactly the window this test is about: the updater process has
// not written any status yet.
fs.writeFileSync(path.join(VB_HOME, 'updater', 'update.ps1'), '# stub\n');

process.env.UPDATER_MODE = 'portable';
process.env.VB_HOME = VB_HOME;
process.env.UPDATE_STATUS_PATH = STATUS_FILE;

const { systemService } = await import('../modules/system/system.service');

/**
 * Two outcomes are legitimate once triggerUpdate() has returned:
 *   - 'running'  — the updater launched and is starting up (the Windows path)
 *   - 'error'    — the launch itself failed, recorded with a reason (cmd.exe is absent when
 *                  these tests run off Windows, which exercises that branch for free)
 *
 * What must never happen is a poll that reports 'idle', or a status left over from an
 * earlier run. Both read as "finished" to the UI's poll loop and tear the progress UI down.
 */
function expectReflectsThisAttempt(
  status: { status: string; updatedAt: string; error?: string | null },
  since: number
) {
  // 'idle' is what the UI reads as "no update in progress" — a fresh install had no status
  // file at all, so this is what the first poll used to get.
  expect(status.status).not.toBe('idle');
  // A stale terminal status from a previous run has an old timestamp.
  expect(new Date(status.updatedAt).getTime()).toBeGreaterThanOrEqual(since);
  // A failure must carry its reason rather than being swallowed.
  if (status.status === 'error') {
    expect(status.error).toBeTruthy();
  }
}

describe('triggerUpdate → getUpdateStatus handoff (portable)', () => {
  it('reports this attempt, not idle, on a fresh install with no status file', async () => {
    fs.rmSync(STATUS_FILE, { force: true });
    const since = Date.now();

    await systemService.triggerUpdate();
    const status = await systemService.getUpdateStatus();

    expectReflectsThisAttempt(status, since);
  });

  it("does not report the previous run's terminal status on a retry", async () => {
    fs.writeFileSync(
      STATUS_FILE,
      JSON.stringify({
        step: 10,
        totalSteps: 10,
        stepName: 'Finalize',
        status: 'success',
        message: 'Update complete',
        startedAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:05:00.000Z',
        logs: [],
      })
    );
    const since = Date.now();

    await systemService.triggerUpdate();
    const status = await systemService.getUpdateStatus();

    expect(status.message).not.toBe('Update complete');
    expectReflectsThisAttempt(status, since);
  });

  it('applies the same handoff to rollback', async () => {
    fs.rmSync(STATUS_FILE, { force: true });
    const since = Date.now();

    await systemService.triggerRollback();
    const status = await systemService.getUpdateStatus();

    expectReflectsThisAttempt(status, since);
  });
});
