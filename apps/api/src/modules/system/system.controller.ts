import { Elysia, t } from 'elysia';
import { AppError, isAppError } from '../../lib/errors';
import { authMiddleware, requireRole } from '../auth/auth.middleware';
import { systemService } from './system.service';

/**
 * Preserve the reason a system operation failed.
 *
 * The service throws plain Errors carrying exactly what the operator needs — "pg_dump not
 * found. Install PostgreSQL client tools...", "Update already running", "UPDATE_FEED_URL is
 * not set". The global onError replaces a plain Error's message with "An unexpected error
 * occurred" outside development, and the shipped Windows exe is compiled with
 * --define process.env.NODE_ENV="production", so that branch is permanent in the binary.
 * Every system failure therefore reached the admin as the same dead-end string.
 *
 * Re-throwing as AppError lets the message through. Nothing internal is exposed: these
 * strings are written for the operator, and every route below is already behind
 * requireRole('ADMIN').
 */
export async function operational<T>(run: () => Promise<T> | T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isAppError(err)) throw err;
    // A thrown string still carries a reason worth showing; anything else stringifies to
    // noise like "[object Object]", which is no better than the dead end being replaced.
    let message = 'Unknown error';
    if (err instanceof Error) message = err.message;
    else if (typeof err === 'string' && err.trim()) message = err;
    throw new AppError(message, 500, 'SYSTEM_OPERATION_FAILED');
  }
}

export const systemRoutes = new Elysia({ prefix: '/system' })
  // Get current version info
  .get(
    '/version',
    async () => {
      const version = await operational(() => systemService.getVersion());
      return { success: true, data: version };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // Check for available updates
  .get(
    '/check-update',
    async () => {
      const result = await operational(() => systemService.checkForUpdate());
      return { success: true, data: result };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // Cached result of the background check. Unlike /check-update this contacts nothing —
  // it is read on every page load to decide whether to show the sidebar indicator, so it
  // must not spawn PowerShell or hit the network. `data` is null until the first check runs.
  .get(
    '/update-available',
    async () => {
      return { success: true, data: systemService.getCachedUpdateCheck() };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // Trigger update
  .post(
    '/update',
    async ({ set }) => {
      const result = await operational(() => systemService.triggerUpdate());
      set.status = 202;
      return { success: true, data: result };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // Get update status (polled by frontend)
  .get(
    '/update-status',
    async () => {
      const status = await operational(() => systemService.getUpdateStatus());
      return { success: true, data: status };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // Trigger manual rollback
  .post(
    '/rollback',
    async ({ body, set }) => {
      const result = await operational(() =>
        systemService.triggerRollback(body?.commit, body?.backupFile)
      );
      set.status = 202;
      return { success: true, data: result };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
      body: t.Optional(
        t.Object({
          commit: t.Optional(t.String()),
          backupFile: t.Optional(t.String()),
        })
      ),
    }
  )
  // Trigger manual backup
  .post(
    '/backup',
    async () => {
      const result = await operational(() => systemService.triggerBackup());
      return { success: true, data: result };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // List available backups
  .get(
    '/backups',
    async () => {
      const result = await operational(() => systemService.listBackups());
      return { success: true, data: result };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // List update/rollback logs
  .get(
    '/logs',
    async () => {
      const result = await operational(() => systemService.listLogs());
      return { success: true, data: result };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // Get specific log file contents
  .get(
    '/logs/:filename',
    async ({ params }) => {
      const result = await operational(() => systemService.getLogFile(params.filename));
      return { success: true, data: result };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
      params: t.Object({
        filename: t.String(),
      }),
    }
  );
