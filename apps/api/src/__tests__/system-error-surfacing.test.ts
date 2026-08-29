import { describe, expect, it } from 'bun:test';
import { type AppError, NotFoundError, isAppError } from '../lib/errors';
import { operational } from '../modules/system/system.controller';

/**
 * Regression: "สำรองข้อมูล" (and every other system action) reported only
 * "An unexpected error occurred", giving the admin no way to tell apart:
 *   - pg_dump not installed
 *   - DATABASE_URL not set
 *   - a stale update.lock from a crashed update, which blocks backups for 2h
 *   - Postgres down
 *
 * The service already throws each of those with a precise message. The global onError
 * discards a plain Error's message outside development, and the shipped Windows exe is
 * compiled with NODE_ENV baked in as production, so the useful text could never reach the
 * screen on a customer machine.
 *
 * These routes are behind SYSTEM_VIEW / SYSTEM_UPDATE and the strings are written for
 * the operator, so the message must survive.
 */
describe('system route error surfacing', () => {
  it('keeps the reason a plain Error carried', async () => {
    const reason =
      'pg_dump not found. Install PostgreSQL client tools or place pg_dump.exe in app\\tools\\';

    const err = await operational(() => {
      throw new Error(reason);
    }).then(
      () => null,
      (e: unknown) => e
    );

    expect(isAppError(err)).toBe(true);
    // The whole point: this is what the admin reads instead of a dead end.
    expect((err as AppError).message).toBe(reason);
    expect((err as AppError).errorCode).toBe('SYSTEM_OPERATION_FAILED');
    expect((err as AppError).statusCode).toBe(500);
  });

  it('leaves an existing AppError alone, status code included', async () => {
    const err = await operational(() => {
      throw new NotFoundError('Backup', 'car_stock_2026.dump');
    }).then(
      () => null,
      (e: unknown) => e
    );

    // Re-wrapping would flatten a 404 into a 500 and lose its error code.
    expect((err as AppError).statusCode).toBe(404);
    expect((err as AppError).errorCode).not.toBe('SYSTEM_OPERATION_FAILED');
  });

  it('passes successful results through untouched', async () => {
    await expect(operational(() => ({ dumpSize: '12.4 MB' }))).resolves.toEqual({
      dumpSize: '12.4 MB',
    });
  });

  it('handles a non-Error throw without crashing', async () => {
    const err = await operational(() => {
      throw 'exit 13';
    }).then(
      () => null,
      (e: unknown) => e
    );

    expect(isAppError(err)).toBe(true);
    expect((err as AppError).message).toBe('exit 13');
  });
});
